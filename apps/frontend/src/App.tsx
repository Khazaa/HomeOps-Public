import { FormEvent, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { api } from './api';
import { BrandMark, Icon } from './Icons';
import { RemoteTab } from './RemoteTab';
import type { AuditEvent, Category, Credential, Resource, ResourceType, Tab } from './types';
import { WebTab } from './WebTab';

const INBOX_WORKSPACE_ID = 'inbox';
const loadTabs = (): Tab[] => {
  try { return (JSON.parse(localStorage.getItem('homeops.tabs') ?? '[]') as Array<Omit<Tab, 'workspaceId'> & { workspaceId?: string }>).map(tab => ({ ...tab, workspaceId: tab.workspaceId || INBOX_WORKSPACE_ID })); }
  catch { return []; }
};
const loadActiveWorkspace = () => localStorage.getItem('homeops.activeWorkspace') || INBOX_WORKSPACE_ID;
const typeIcon = (type: ResourceType) => <Icon name={type} />;
const loadSidebarWidth = () => Math.min(520, Math.max(220, Number(localStorage.getItem('homeops.sidebarWidth')) || 272));
const loadCollapsedGroups = () => {
  try {
    const collapsed = new Set<string>(JSON.parse(localStorage.getItem('homeops.collapsedGroups') ?? '[]') as string[]);
    if (!localStorage.getItem('homeops.recentCollapseInitialized')) {
      collapsed.add('recent');
      localStorage.setItem('homeops.recentCollapseInitialized', 'true');
    }
    return collapsed;
  } catch { return new Set<string>(['recent']); }
};
type Theme = 'system' | 'dark' | 'light';
type Workspace = { id: string; name: string; resourceIds: string[] };
const parseWorkspaces = (preferences: Record<string, unknown>): Workspace[] => Array.isArray(preferences.workspaces) ? preferences.workspaces.filter((entry): entry is Workspace => Boolean(entry) && typeof entry === 'object' && typeof (entry as Workspace).id === 'string' && typeof (entry as Workspace).name === 'string' && Array.isArray((entry as Workspace).resourceIds)) : [];
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
const loadTheme = (): Theme => {
  const saved = localStorage.getItem('homeops.theme');
  return saved === 'dark' || saved === 'light' ? saved : 'system';
};

export function App() {
  const [user, setUser] = useState<{ username: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState<Resource[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [tabs, setTabs] = useState<Tab[]>(loadTabs);
  const [active, setActive] = useState('dashboard');
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(loadActiveWorkspace);
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<Resource | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [sortingGroup, setSortingGroup] = useState<string | null>(null);
  const [tabRevisions, setTabRevisions] = useState<Record<string, number>>({});
  const [tabMenu, setTabMenu] = useState<{ tab: Tab; x: number; y: number } | null>(null);
  const [resourceContextMenu, setResourceContextMenu] = useState<{ resource: Resource; x: number; y: number } | null>(null);
  const [draggingTab, setDraggingTab] = useState<string | null>(null);
  const [draggingResource, setDraggingResource] = useState<string | null>(null);
  const [resourceDropTarget, setResourceDropTarget] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [managingCredentials, setManagingCredentials] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(loadCollapsedGroups);
  const [preferences, setPreferences] = useState<Record<string, unknown>>({});
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [launcherQuery, setLauncherQuery] = useState('');
  const [resourceStatus, setResourceStatus] = useState<Record<string, { state: 'checking' | 'online' | 'offline'; message: string }>>({});
  const [auditEvents, setAuditEvents] = useState<AuditEvent[] | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const preferenceSaveQueue = useRef<Promise<void>>(Promise.resolve());

  const refresh = async () => {
    const [nextResources, nextCategories, nextCredentials] = await Promise.all([api.resources(), api.categories(), api.credentials()]);
    setResources(nextResources);
    setCategories(nextCategories);
    setCredentials(nextCredentials);
    setTabs(current => current.map(tab => {
      const resource = nextResources.find(entry => entry.id === tab.resourceId);
      return resource ? { ...tab, title: resource.name } : tab;
    }));
  };

  useEffect(() => {
    api.me().then(async result => {
      setUser(result.user);
      const [, stored] = await Promise.all([refresh(), api.preferences()]);
      setPreferences(stored.data);
    }).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    localStorage.setItem('homeops.tabs', JSON.stringify(tabs));
    if (active !== 'dashboard' && !tabs.some(tab => tab.id === active)) setActive('dashboard');
  }, [tabs, active]);
  useEffect(() => localStorage.setItem('homeops.activeWorkspace', activeWorkspaceId), [activeWorkspaceId]);
  useEffect(() => {
    if (loading) return;
    const validIds = new Set([INBOX_WORKSPACE_ID, ...parseWorkspaces(preferences).map(workspace => workspace.id)]);
    if (tabs.some(tab => !validIds.has(tab.workspaceId))) setTabs(current => current.map(tab => validIds.has(tab.workspaceId) ? tab : { ...tab, workspaceId: INBOX_WORKSPACE_ID }));
    if (!validIds.has(activeWorkspaceId)) {
      setActiveWorkspaceId(INBOX_WORKSPACE_ID);
      setActive(tabs.find(tab => tab.workspaceId === INBOX_WORKSPACE_ID)?.id ?? 'dashboard');
    }
  }, [activeWorkspaceId, loading, preferences, tabs]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 5_000);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  useEffect(() => localStorage.setItem('homeops.sidebarWidth', String(sidebarWidth)), [sidebarWidth]);
  useEffect(() => localStorage.setItem('homeops.collapsedGroups', JSON.stringify([...collapsedGroups])), [collapsedGroups]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
    document.documentElement.dataset.theme = resolved;
    localStorage.setItem('homeops.theme', theme);
  }, [theme, systemDark]);
  useEffect(() => {
    if (!tabMenu) return;
    const closeMenu = (event: PointerEvent) => {
      if (!(event.target as Element).closest('.tab-context-menu')) setTabMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setTabMenu(null); };
    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [tabMenu]);
  useEffect(() => {
    if (!resourceContextMenu) return;
    const closeMenu = (event: PointerEvent) => { if (!(event.target as Element).closest('.resource-context-menu')) setResourceContextMenu(null); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setResourceContextMenu(null); };
    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeMenu); document.removeEventListener('keydown', closeOnEscape); };
  }, [resourceContextMenu]);
  useEffect(() => {
    const keepOnlyClickedResourceMenu = (event: PointerEvent) => {
      const clickedMenu = (event.target as Element).closest('details.resource-menu');
      document.querySelectorAll<HTMLDetailsElement>('details.resource-menu[open]').forEach(menu => {
        if (menu !== clickedMenu) menu.open = false;
      });
    };
    document.addEventListener('pointerdown', keepOnlyClickedResourceMenu);
    return () => document.removeEventListener('pointerdown', keepOnlyClickedResourceMenu);
  }, []);
  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target as Element).closest('.account-menu')) setAccountMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setAccountMenuOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [accountMenuOpen]);
  useEffect(() => {
    const handleLauncher = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setLauncherOpen(true);
        setLauncherQuery('');
      } else if (event.key === 'Escape') setLauncherOpen(false);
    };
    document.addEventListener('keydown', handleLauncher);
    return () => document.removeEventListener('keydown', handleLauncher);
  }, []);
  useEffect(() => {
    const ready = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    const installed = () => { setInstallPrompt(null); setNotice('HomeOps wurde installiert.'); };
    window.addEventListener('beforeinstallprompt', ready);
    window.addEventListener('appinstalled', installed);
    return () => { window.removeEventListener('beforeinstallprompt', ready); window.removeEventListener('appinstalled', installed); };
  }, []);
  useEffect(() => {
    if (!resources.length) return;
    let cancelled = false;
    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      setResourceStatus(current => Object.fromEntries(resources.map(resource => [resource.id, { state: 'checking', message: current[resource.id]?.message ?? 'Status wird geprüft …' }])));
      await Promise.all(resources.map(async resource => {
        try {
          const result = await api.testResource(resource.id);
          if (!cancelled) setResourceStatus(current => ({ ...current, [resource.id]: { state: result.ok ? 'online' : 'offline', message: result.message } }));
        } catch (reason) {
          if (!cancelled) setResourceStatus(current => ({ ...current, [resource.id]: { state: 'offline', message: reason instanceof Error ? reason.message : 'Prüfung fehlgeschlagen.' } }));
        }
      }));
    };
    void check();
    const interval = window.setInterval(() => void check(), 60_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [resources]);

  const resizeSidebar = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const left = event.currentTarget.parentElement?.getBoundingClientRect().left ?? 0;
    setSidebarWidth(Math.min(520, Math.max(220, event.clientX - left)));
  };

  const updatePreferences = (update: (current: Record<string, unknown>) => Record<string, unknown>) => setPreferences(current => {
    const next = update(current);
    preferenceSaveQueue.current = preferenceSaveQueue.current.then(async () => { await api.savePreferences(next); }).catch(reason => { setNotice(reason instanceof Error ? reason.message : 'Einstellungen konnten nicht gespeichert werden.'); });
    return next;
  });
  const rememberResource = (resourceId: string) => updatePreferences(current => {
    const recent = Array.isArray(current.recentResourceIds) ? current.recentResourceIds.filter((id): id is string => typeof id === 'string' && id !== resourceId) : [];
    return { ...current, recentResourceIds: [resourceId, ...recent].slice(0, 8) };
  });
  const toggleFavorite = (resourceId: string) => updatePreferences(current => {
    const favorites = new Set(Array.isArray(current.favoriteResourceIds) ? current.favoriteResourceIds.filter((id): id is string => typeof id === 'string') : []);
    if (favorites.has(resourceId)) favorites.delete(resourceId); else favorites.add(resourceId);
    return { ...current, favoriteResourceIds: [...favorites] };
  });
  const workspaces = parseWorkspaces(preferences);
  const setWorkspaceMembership = (sourceId: string, targetId: string, resourceId: string, removeFromSource: boolean) => updatePreferences(current => ({
    ...current,
    workspaces: parseWorkspaces(current).map(workspace => {
      if (workspace.id === sourceId && removeFromSource) return { ...workspace, resourceIds: workspace.resourceIds.filter(id => id !== resourceId) };
      if (workspace.id === targetId && !workspace.resourceIds.includes(resourceId)) return { ...workspace, resourceIds: [...workspace.resourceIds, resourceId] };
      return workspace;
    })
  }));
  const createWorkspace = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (workspaces.some(workspace => workspace.name.localeCompare(trimmed, 'de', { sensitivity: 'base' }) === 0)) { setNotice('Ein Arbeitsbereich mit diesem Namen existiert bereits.'); return; }
    const id = crypto.randomUUID();
    updatePreferences(current => ({ ...current, workspaces: [...parseWorkspaces(current), { id, name: trimmed, resourceIds: [] }] }));
    setActiveWorkspaceId(id);
    setActive('dashboard');
  };
  const renameWorkspace = (id: string) => {
    const workspace = workspaces.find(entry => entry.id === id);
    if (!workspace) return;
    const name = prompt('Neuer Name des Arbeitsbereichs', workspace.name)?.trim();
    if (!name || name === workspace.name) return;
    if (workspaces.some(entry => entry.id !== id && entry.name.localeCompare(name, 'de', { sensitivity: 'base' }) === 0)) { setNotice('Ein Arbeitsbereich mit diesem Namen existiert bereits.'); return; }
    updatePreferences(current => ({ ...current, workspaces: parseWorkspaces(current).map(entry => entry.id === id ? { ...entry, name } : entry) }));
  };
  const deleteWorkspace = (id: string) => {
    const workspace = workspaces.find(entry => entry.id === id);
    if (!workspace || !confirm(`Arbeitsbereich „${workspace.name}“ löschen? Offene Tabs werden in die Ablage verschoben.`)) return;
    const movedTabs = tabs.map(tab => tab.workspaceId === id ? { ...tab, workspaceId: INBOX_WORKSPACE_ID } : tab);
    setTabs(movedTabs);
    updatePreferences(current => ({ ...current, workspaces: parseWorkspaces(current).filter(entry => entry.id !== id) }));
    if (activeWorkspaceId === id) {
      setActiveWorkspaceId(INBOX_WORKSPACE_ID);
      setActive(movedTabs.find(tab => tab.workspaceId === INBOX_WORKSPACE_ID)?.id ?? 'dashboard');
    }
  };
  const selectWorkspace = (workspaceId: string) => {
    const workspace = workspaces.find(entry => entry.id === workspaceId);
    if (workspaceId !== INBOX_WORKSPACE_ID && !workspace) return;
    const selected = (workspace?.resourceIds ?? []).map(id => resources.find(resource => resource.id === id)).filter((resource): resource is Resource => Boolean(resource));
    setTabs(current => {
      const next = [...current]; let targetId = '';
      for (const resource of selected) {
        const existing = next.find(tab => tab.resourceId === resource.id && tab.workspaceId === workspaceId);
        if (existing) { if (!targetId) targetId = existing.id; continue; }
        const tab = { id: crypto.randomUUID(), resourceId: resource.id, title: resource.name, type: resource.type, workspaceId };
        next.push(tab); if (!targetId) targetId = tab.id;
      }
      const first = targetId || next.find(tab => tab.workspaceId === workspaceId)?.id;
      setActive(first ?? 'dashboard');
      return next;
    });
    setActiveWorkspaceId(workspaceId);
    setWorkspaceOpen(false);
  };

  const open = (resource: Resource, another = false) => {
    rememberResource(resource.id);
    const existing = !another && tabs.find(tab => tab.resourceId === resource.id);
    if (existing) { setActiveWorkspaceId(existing.workspaceId); return setActive(existing.id); }
    const tab = { id: crypto.randomUUID(), resourceId: resource.id, title: resource.name, type: resource.type, workspaceId: activeWorkspaceId };
    setTabs(current => [...current, tab]);
    if (activeWorkspaceId !== INBOX_WORKSPACE_ID) setWorkspaceMembership(INBOX_WORKSPACE_ID, activeWorkspaceId, resource.id, false);
    setActive(tab.id);
  };
  const close = (tab: Tab) => {
    if (['ssh', 'rdp'].includes(tab.type) && !confirm('Remote-Verbindung trennen und Tab schließen?')) return;
    setTabs(current => current.filter(entry => entry.id !== tab.id));
    if (tab.workspaceId !== INBOX_WORKSPACE_ID && !tabs.some(entry => entry.id !== tab.id && entry.workspaceId === tab.workspaceId && entry.resourceId === tab.resourceId)) setWorkspaceMembership(tab.workspaceId, INBOX_WORKSPACE_ID, tab.resourceId, true);
    setTabRevisions(current => { const next = { ...current }; delete next[tab.id]; return next; });
  };
  const reload = (tab: Tab) => {
    setActive(tab.id);
    setTabRevisions(current => ({ ...current, [tab.id]: (current[tab.id] ?? 0) + 1 }));
    setTabMenu(null);
  };
  const moveTab = (tab: Tab, delta: number) => {
    const workspaceTabs = tabs.filter(entry => entry.workspaceId === tab.workspaceId);
    const from = workspaceTabs.findIndex(entry => entry.id === tab.id);
    const target = workspaceTabs[Math.max(0, Math.min(workspaceTabs.length - 1, from + delta))];
    if (target && target.id !== tab.id) dropTab(tab.id, target.id);
    setTabMenu(null);
  };
  const dropTab = (sourceId: string, targetId: string) => {
    setTabs(current => {
      const from = current.findIndex(entry => entry.id === sourceId);
      const to = current.findIndex(entry => entry.id === targetId);
      if (from < 0 || to < 0 || from === to) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    });
  };
  const moveTabToWorkspace = (tabId: string, workspaceId: string) => {
    const tab = tabs.find(entry => entry.id === tabId);
    if (!tab || tab.workspaceId === workspaceId || (workspaceId !== INBOX_WORKSPACE_ID && !workspaces.some(workspace => workspace.id === workspaceId))) return;
    const removeFromSource = !tabs.some(entry => entry.id !== tab.id && entry.workspaceId === tab.workspaceId && entry.resourceId === tab.resourceId);
    setTabs(current => current.map(entry => entry.id === tab.id ? { ...entry, workspaceId } : entry));
    setWorkspaceMembership(tab.workspaceId, workspaceId, tab.resourceId, removeFromSource);
    setActiveWorkspaceId(workspaceId);
    setActive(tab.id);
    setDraggingTab(null);
  };
  const move = async (resource: Resource, delta: number) => {
    await api.updateResource(resource.id, { position: Math.max(0, resource.position + delta) });
    await refresh();
  };
  const dropResource = async (resourceId: string, targetKey: string) => {
    setDraggingResource(null);
    setResourceDropTarget(null);
    const resource = resources.find(entry => entry.id === resourceId);
    if (!resource) return;
    const categoryId = targetKey === 'uncategorized' ? null : targetKey;
    if (resource.categoryId === categoryId) return;
    const targetResources = resources.filter(entry => entry.categoryId === categoryId);
    const position = targetResources.length ? Math.max(...targetResources.map(entry => entry.position)) + 1 : 0;
    try {
      await api.updateResource(resource.id, { categoryId, position });
      await refresh();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Ressource konnte nicht verschoben werden.');
    }
  };
  const remove = async (resource: Resource) => {
    if (!confirm(`${resource.name} wirklich löschen?`)) return;
    await api.deleteResource(resource.id);
    setTabs(current => current.filter(tab => tab.resourceId !== resource.id));
    updatePreferences(current => ({ ...current, workspaces: parseWorkspaces(current).map(workspace => ({ ...workspace, resourceIds: workspace.resourceIds.filter(id => id !== resource.id) })) }));
    await refresh();
  };
  const duplicateResource = async (resource: Resource) => {
    try {
      const copy = await api.duplicateResource(resource.id);
      await refresh();
      setEditor(copy);
      setNotice('Ressource ohne Secret dupliziert.');
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Ressource konnte nicht dupliziert werden.'); }
  };
  const diagnose = async (resource: Resource) => {
    try {
      const result = await api.testResource(resource.id);
      setNotice(`${resource.name}: ${result.message}`);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Verbindungstest fehlgeschlagen'); }
  };
  const renameCategory = async (category: Category) => {
    const name = prompt('Neuer Gruppenname', category.name);
    if (!name || name === category.name) return;
    await api.updateCategory(category.id, { name });
    await refresh();
  };
  const removeCategory = async (category: Category) => {
    if (!confirm(`Gruppe „${category.name}“ löschen? Ressourcen bleiben ohne Gruppe erhalten.`)) return;
    await api.deleteCategory(category.id);
    await refresh();
  };
  const toggleGroup = (key: string) => setCollapsedGroups(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  if (loading) return <div className="center">HomeOps Hub wird geladen …</div>;
  if (!user) return <Login onSuccess={async () => { const me = await api.me(); setUser(me.user); const [, stored] = await Promise.all([refresh(), api.preferences()]); setPreferences(stored.data); }} />;

  const visible = resources.filter(resource => `${resource.name} ${resource.notes} ${resource.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  const favoriteIds = new Set(Array.isArray(preferences.favoriteResourceIds) ? preferences.favoriteResourceIds.filter((id): id is string => typeof id === 'string') : []);
  const recentIds = Array.isArray(preferences.recentResourceIds) ? preferences.recentResourceIds.filter((id): id is string => typeof id === 'string') : [];
  const favoriteResources = resources.filter(resource => favoriteIds.has(resource.id));
  const recentResources = recentIds.map(id => resources.find(resource => resource.id === id)).filter((resource): resource is Resource => Boolean(resource)).filter(resource => !favoriteIds.has(resource.id));
  const visibleFavorites = favoriteResources.filter(resource => visible.includes(resource));
  const visibleRecent = recentResources.filter(resource => visible.includes(resource));
  const activeWorkspaceTabs = tabs.filter(tab => tab.workspaceId === activeWorkspaceId);
  const favoritesCollapsed = collapsedGroups.has('favorites') && !query;
  const recentCollapsed = collapsedGroups.has('recent') && !query;
  const launcherResults = resources.filter(resource => resource.name.toLowerCase().includes(launcherQuery.trim().toLowerCase())).slice(0, 12);
  const availableTags = [...new Set(resources.flatMap(resource => resource.tags))].sort((left, right) => left.localeCompare(right, 'de', { sensitivity: 'base' }));
  const closeResourceActions = () => {
    document.querySelectorAll<HTMLDetailsElement>('details.resource-menu[open]').forEach(menu => { menu.open = false; });
    setResourceContextMenu(null);
  };
  const updateResourceTags = async (resource: Resource, tags: string[]) => {
    try {
      const updated = await api.updateResource(resource.id, { tags });
      setResources(current => current.map(entry => entry.id === updated.id ? updated : entry));
      setResourceContextMenu(current => current?.resource.id === updated.id ? { ...current, resource: updated } : current);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Tags konnten nicht gespeichert werden.');
    }
  };
  const deleteTag = async (tag: string) => {
    try {
      const result = await api.deleteTag(tag);
      const affected = new Set(result.resourceIds);
      setResources(current => current.map(resource => affected.has(resource.id) ? { ...resource, tags: resource.tags.filter(entry => entry !== tag) } : resource));
      setResourceContextMenu(current => current && affected.has(current.resource.id) ? { ...current, resource: { ...current.resource, tags: current.resource.tags.filter(entry => entry !== tag) } } : current);
      setNotice(`Tag „${tag}“ von ${result.resourceIds.length} ${result.resourceIds.length === 1 ? 'Ressource' : 'Ressourcen'} entfernt.`);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Tag konnte nicht gelöscht werden.');
    }
  };
  const resourceActions = (resource: Resource) => <>
    <ResourceTagsMenu resource={resource} availableTags={availableTags} onChange={tags => updateResourceTags(resource, tags)} onDelete={deleteTag} />
    <button onClick={() => { closeResourceActions(); toggleFavorite(resource.id); }}><Icon name="star" /> {favoriteIds.has(resource.id) ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}</button>
    <button onClick={() => { closeResourceActions(); open(resource, true); }}><Icon name="newTab" /> Weiteren Tab öffnen</button>
    <button onClick={() => { closeResourceActions(); void duplicateResource(resource); }}><Icon name="duplicate" /> Ressource duplizieren</button>
    <button onClick={() => { closeResourceActions(); void diagnose(resource); }}><Icon name="test" /> Verbindung testen</button>
    <button onClick={() => { closeResourceActions(); setEditor(resource); }}><Icon name="edit" /> Bearbeiten</button>
    <button className="danger-button" onClick={() => { closeResourceActions(); void remove(resource); }}><Icon name="delete" /> Löschen</button>
  </>;
  const resourceRow = (resource: Resource) => {
    const groupKey = resource.categoryId ?? 'uncategorized';
    return <div className={`resource${draggingResource === resource.id ? ' dragging' : ''}`} key={resource.id} draggable title="In eine andere Gruppe ziehen" onContextMenu={event => {
      event.preventDefault();
      closeResourceActions();
      setResourceContextMenu({ resource, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 240)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 330)) });
    }} onDragStart={event => {
      setDraggingResource(resource.id);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/homeops-resource', resource.id);
    }} onDragEnd={() => { setDraggingResource(null); setResourceDropTarget(null); }}>
    <button className="resource-main" onClick={() => open(resource)}>{typeIcon(resource.type)} <span>{resource.name}</span>{resource.notes && <i className="resource-note" title={resource.notes} aria-label={resource.notes}><Icon name="note" size={14} /></i>}{resource.tags.length > 0 && <i className="resource-tags" title={resource.tags.join(', ')} aria-label={`Tags: ${resource.tags.join(', ')}`}><Icon name="tag" size={14} /></i>}{resourceStatus[resource.id] && <i className={`resource-status ${resourceStatus[resource.id]!.state}`} title={resourceStatus[resource.id]!.message} aria-label={resourceStatus[resource.id]!.message} />}</button>
    {sortingGroup === groupKey && <div className="reorder-controls" aria-label="Sortierreihenfolge">
      <button className="icon-button" title="Nach oben" aria-label="Nach oben" onClick={() => void move(resource, -1)}><Icon name="up" /></button>
      <button className="icon-button" title="Nach unten" aria-label="Nach unten" onClick={() => void move(resource, 1)}><Icon name="down" /></button>
    </div>}
    <details className="resource-menu">
      <summary title="Aktionen" aria-label="Aktionen"><Icon name="menu" /></summary>
      <div className="resource-menu-popover">
        {resourceActions(resource)}
      </div>
    </details>
  </div>;
  };

  const categoryHeading = (key: string, title: string, category?: Category) => {
    const collapsed = collapsedGroups.has(key) && !query;
    return <div className="category-heading">
    <h3><button className="category-toggle" aria-label={`Gruppe ${title} ${collapsed ? 'ausklappen' : 'einklappen'}`} aria-expanded={!collapsed} onClick={() => toggleGroup(key)}><Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={14} /><span>{title}</span></button></h3>
    <button className={sortingGroup === key ? 'active' : ''} title={sortingGroup === key ? 'Sortierung beenden' : 'Sortierung aktivieren'} aria-label={sortingGroup === key ? 'Sortierung beenden' : 'Sortierung aktivieren'} onClick={() => setSortingGroup(current => current === key ? null : key)}><Icon name="reorder" size={15} /></button>
    {category && <><button title="Gruppe umbenennen" aria-label="Gruppe umbenennen" onClick={() => void renameCategory(category)}><Icon name="edit" size={15} /></button><button title="Gruppe löschen" aria-label="Gruppe löschen" onClick={() => void removeCategory(category)}><Icon name="delete" size={15} /></button></>}
  </div>;
  };
  const resourceGroup = (key: string, title: string, category?: Category) => <section key={key} className={`resource-group${resourceDropTarget === key ? ' drop-target' : ''}`} onDragEnter={event => {
    if (event.dataTransfer.types.includes('text/homeops-resource')) setResourceDropTarget(key);
  }} onDragOver={event => {
    if (!event.dataTransfer.types.includes('text/homeops-resource')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }} onDrop={event => {
    const resourceId = event.dataTransfer.getData('text/homeops-resource') || draggingResource;
    if (!resourceId) return;
    event.preventDefault();
    void dropResource(resourceId, key);
  }}>
    {categoryHeading(key, title, category)}
    {(!collapsedGroups.has(key) || query) && visible.filter(resource => (resource.categoryId ?? 'uncategorized') === key).map(resourceRow)}
  </section>;

  return <div className="app" style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}>
    <header>
      <button className="brand" onClick={() => setActive('dashboard')}><BrandMark /> HomeOps Hub</button>
      <input aria-label="Ressourcen suchen" value={query} onChange={event => setQuery(event.target.value)} placeholder="Suchen …" />
      <div className="account-controls">
        <span className="user-name">{user.username}</span>
        <div className="account-menu">
          <button className="account-menu-trigger" aria-label="Benutzermenü" aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen(open => !open)}><Icon name="menu" /></button>
          {accountMenuOpen && <div className="account-menu-popover" role="menu" aria-label="Benutzermenü">
            <label className="theme-control"><Icon name="theme" /><span>Theme</span><select aria-label="Theme" value={theme} onChange={event => { setTheme(event.target.value as Theme); setAccountMenuOpen(false); }}><option value="system">System</option><option value="dark">Dunkel</option><option value="light">Hell</option></select></label>
            <button role="menuitem" onClick={() => { setAccountMenuOpen(false); setManagingCredentials(true); }}>Zugangsdaten</button>
            <button role="menuitem" onClick={async () => { setAccountMenuOpen(false); try { setAuditEvents((await api.audit()).events); } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Verlauf konnte nicht geladen werden.'); } }}>Verbindungsverlauf</button>
            <button role="menuitem" onClick={() => { setAccountMenuOpen(false); setBackupOpen(true); }}>Backup &amp; Restore</button>
            <button role="menuitem" onClick={async () => { setAccountMenuOpen(false); if (installPrompt) { await installPrompt.prompt(); const choice = await installPrompt.userChoice; if (choice.outcome === 'accepted') setInstallPrompt(null); } else setNotice('Im Browser-Menü „App installieren“ bzw. „Zum Startbildschirm“ wählen.'); }}>App installieren</button>
            <button role="menuitem" onClick={() => { setAccountMenuOpen(false); setChangingPassword(true); }}>Kennwort ändern</button>
            <button role="menuitem" onClick={async () => { setAccountMenuOpen(false); await api.logout(); setUser(null); }}>Logout</button>
          </div>}
        </div>
      </div>
    </header>
    <aside>
      <button className="primary text-icon-button" onClick={() => setEditor('new')}><Icon name="plus" /> Ressource</button>
      <div className="sidebar-content">
        {visibleFavorites.length > 0 && <section className="smart-group"><div className="category-heading"><h3><button className="category-toggle" aria-label={`Favoriten ${favoritesCollapsed ? 'ausklappen' : 'einklappen'}`} aria-expanded={!favoritesCollapsed} onClick={() => toggleGroup('favorites')}><Icon name={favoritesCollapsed ? 'chevronRight' : 'chevronDown'} size={14} /><Icon name="star" size={14} /><span>Favoriten</span></button></h3></div>{!favoritesCollapsed && visibleFavorites.map(resourceRow)}</section>}
        {visibleRecent.length > 0 && <section className="smart-group"><div className="category-heading"><h3><button className="category-toggle" aria-label={`Zuletzt verwendet ${recentCollapsed ? 'ausklappen' : 'einklappen'}`} aria-expanded={!recentCollapsed} onClick={() => toggleGroup('recent')}><Icon name={recentCollapsed ? 'chevronRight' : 'chevronDown'} size={14} /><Icon name="recent" size={14} /><span>Zuletzt verwendet</span></button></h3></div>{!recentCollapsed && visibleRecent.map(resourceRow)}</section>}
        {categories.map(category => resourceGroup(category.id, category.name, category))}
        {resourceGroup('uncategorized', 'Ohne Kategorie')}
      </div>
      <div className="sidebar-footer">
        <button className="text-icon-button group-button" onClick={async () => { const name = prompt('Name der neuen Gruppe'); if (name) { await api.createCategory(name); await refresh(); } }}><Icon name="plus" /> Gruppe</button>
      </div>
    </aside>
    <div className="sidebar-resizer" role="separator" aria-label="Breite der Seitenleiste" aria-orientation="vertical" aria-valuemin={220} aria-valuemax={520} aria-valuenow={sidebarWidth} tabIndex={0}
      onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={resizeSidebar}
      onKeyDown={event => { if (event.key === 'ArrowLeft') setSidebarWidth(width => Math.max(220, width - 16)); if (event.key === 'ArrowRight') setSidebarWidth(width => Math.min(520, width + 16)); }} />
    <main>
      <nav className="workspace-tabs" aria-label="Arbeitsbereiche">
        <button className={activeWorkspaceId === INBOX_WORKSPACE_ID ? 'active' : ''} aria-current={activeWorkspaceId === INBOX_WORKSPACE_ID ? 'page' : undefined} onClick={() => selectWorkspace(INBOX_WORKSPACE_ID)} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={event => { event.preventDefault(); const tabId = event.dataTransfer.getData('text/homeops-tab') || draggingTab; if (tabId) moveTabToWorkspace(tabId, INBOX_WORKSPACE_ID); }}><Icon name="inbox" /> Ablage <small>{tabs.filter(tab => tab.workspaceId === INBOX_WORKSPACE_ID).length}</small></button>
        {workspaces.map(workspace => <button key={workspace.id} className={activeWorkspaceId === workspace.id ? 'active' : ''} aria-current={activeWorkspaceId === workspace.id ? 'page' : undefined} onClick={() => selectWorkspace(workspace.id)} onDoubleClick={() => renameWorkspace(workspace.id)} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={event => { event.preventDefault(); const tabId = event.dataTransfer.getData('text/homeops-tab') || draggingTab; if (tabId) moveTabToWorkspace(tabId, workspace.id); }}><Icon name="workspace" /> {workspace.name} <small>{tabs.filter(tab => tab.workspaceId === workspace.id).length}</small></button>)}
        <button className="workspace-add" aria-label="Arbeitsbereich anlegen" title="Arbeitsbereich anlegen" onClick={() => { const name = prompt('Name des neuen Arbeitsbereichs'); if (name) createWorkspace(name); }}><Icon name="plus" /></button>
        <button className="workspace-manage" aria-label="Arbeitsbereiche verwalten" title="Arbeitsbereiche verwalten" onClick={() => setWorkspaceOpen(true)}><Icon name="edit" /></button>
      </nav>
      <nav className="tabs" aria-label="Ressourcen-Tabs"><button className={`dashboard-tab${active === 'dashboard' ? ' active' : ''}`} onClick={() => setActive('dashboard')}><span><Icon name="home" /> Übersicht</span></button>{activeWorkspaceTabs.map(tab => <button key={tab.id} draggable className={`${tab.id === active ? 'active' : ''}${tab.id === draggingTab ? ' dragging' : ''}`} onClick={() => { setTabMenu(null); setActive(tab.id); }} onContextMenu={event => {
        event.preventDefault();
        setTabMenu({ tab, x: Math.min(event.clientX, window.innerWidth - 190), y: Math.min(event.clientY, window.innerHeight - 100) });
      }} onDragStart={event => { setDraggingTab(tab.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/homeops-tab', tab.id); }} onDragEnd={() => setDraggingTab(null)} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={event => {
        event.preventDefault();
        const sourceId = event.dataTransfer.getData('text/homeops-tab') || draggingTab;
        if (sourceId) dropTab(sourceId, tab.id);
        setDraggingTab(null);
      }}>
        <span>{typeIcon(tab.type)} {tab.title}</span><i onClick={event => { event.stopPropagation(); close(tab); }}><Icon name="close" size={16} /></i>
      </button>)}</nav>
      <div className="workspace">
        {active === 'dashboard' && <Dashboard resources={resources} favorites={favoriteResources} recent={recentResources} credentials={credentials} status={resourceStatus} openTabs={tabs.length} onOpen={open} />}
        {tabs.map(tab => {
          const resource = resources.find(entry => entry.id === tab.resourceId);
          return resource ? <section className="tab-panel" hidden={tab.id !== active} key={`${tab.id}:${tabRevisions[tab.id] ?? 0}`}>
            {resource.type === 'web' ? <WebTab resource={resource} /> : <RemoteTab resource={resource} active={tab.id === active} />}
          </section> : null;
        })}
      </div>
    </main>
    {tabMenu && <div className="tab-context-menu" role="menu" aria-label={`Aktionen für ${tabMenu.tab.title}`} style={{ left: tabMenu.x, top: tabMenu.y }}>
      <button role="menuitem" onClick={() => reload(tabMenu.tab)}><Icon name="reload" /> Tab neu laden</button>
      <button role="menuitem" disabled={activeWorkspaceTabs.findIndex(tab => tab.id === tabMenu.tab.id) === 0} onClick={() => moveTab(tabMenu.tab, -1)}>← Nach links</button>
      <button role="menuitem" disabled={activeWorkspaceTabs.findIndex(tab => tab.id === tabMenu.tab.id) === activeWorkspaceTabs.length - 1} onClick={() => moveTab(tabMenu.tab, 1)}>→ Nach rechts</button>
      <button role="menuitem" onClick={() => { const tab = tabMenu.tab; setTabMenu(null); close(tab); }}><Icon name="close" /> Tab schließen</button>
    </div>}
    {resourceContextMenu && <div className="resource-context-menu" role="menu" aria-label={`Aktionen für ${resourceContextMenu.resource.name}`} style={{ left: resourceContextMenu.x, top: resourceContextMenu.y }}>{resourceActions(resourceContextMenu.resource)}</div>}
    {editor && <ResourceEditor key={editor === 'new' ? 'new' : editor.id} resource={editor === 'new' ? undefined : editor} categories={categories} credentials={credentials} onCancel={() => setEditor(null)} onSaved={async () => { setEditor(null); await refresh(); }} />}
    {managingCredentials && <CredentialManager credentials={credentials} resources={resources} onCancel={() => setManagingCredentials(false)} onChanged={refresh} />}
    {changingPassword && <ChangePassword onCancel={() => setChangingPassword(false)} onSaved={() => { setChangingPassword(false); setNotice('Kennwort geändert. Andere Sitzungen wurden abgemeldet.'); }} />}
    {auditEvents && <AuditHistory events={auditEvents} onClose={() => setAuditEvents(null)} />}
    {backupOpen && <BackupCenter categories={categories} resources={resources} preferences={preferences} onClose={() => setBackupOpen(false)} onRestored={async restoredPreferences => { setPreferences(restoredPreferences); await refresh(); }} />}
    {workspaceOpen && <WorkspaceManager workspaces={workspaces} tabs={tabs} onCreate={createWorkspace} onRename={renameWorkspace} onDelete={deleteWorkspace} onOpen={workspace => selectWorkspace(workspace.id)} onClose={() => setWorkspaceOpen(false)} />}
    {launcherOpen && <div className="modal command-palette" onPointerDown={event => { if (event.target === event.currentTarget) setLauncherOpen(false); }}><form onSubmit={event => { event.preventDefault(); const resource = launcherResults[0]; if (resource) { open(resource); setLauncherOpen(false); } }}>
      <label>Ressource öffnen<input autoFocus aria-label="Schnellstarter" value={launcherQuery} onChange={event => setLauncherQuery(event.target.value)} placeholder="Name eingeben …" /></label>
      <div className="command-results">{launcherResults.map(resource => <button type="button" key={resource.id} onClick={() => { open(resource); setLauncherOpen(false); }}>{typeIcon(resource.type)}<span>{resource.name}</span><small>Enter</small></button>)}{!launcherResults.length && <p className="muted">Keine Ressource gefunden.</p>}</div>
      <small className="muted">Enter öffnet den ersten Treffer · Esc schließt</small>
    </form></div>}
    <div className="toast" role="status" aria-live="polite">{notice}</div>
  </div>;
}

function Dashboard({ resources, favorites, recent, credentials, status, openTabs, onOpen }: { resources: Resource[]; favorites: Resource[]; recent: Resource[]; credentials: Credential[]; status: Record<string, { state: 'checking' | 'online' | 'offline'; message: string }>; openTabs: number; onOpen: (resource: Resource) => void }) {
  const online = Object.values(status).filter(entry => entry.state === 'online').length;
  const offline = Object.values(status).filter(entry => entry.state === 'offline').length;
  const offlineResources = resources
    .filter(resource => status[resource.id]?.state === 'offline')
    .sort((left, right) => left.name.localeCompare(right.name, 'de', { sensitivity: 'base' }));
  const expiring = credentials.filter(credential => credential.expiresAt && new Date(credential.expiresAt).getTime() <= Date.now() + 30 * 86_400_000).sort((a, b) => new Date(a.expiresAt!).getTime() - new Date(b.expiresAt!).getTime());
  return <section className="dashboard">
    <div className="dashboard-heading"><div><h1>Übersicht</h1><p>Dein HomeOps Hub auf einen Blick.</p></div><BrandMark size={48} /></div>
    <div className="dashboard-stats">
      <article><strong>{resources.length}</strong><span>Ressourcen</span></article>
      <article><strong className={offline ? 'warn' : ''}>{online} / {offline} / {resources.length}</strong><span>Erreichbar / nicht erreichbar / gesamt</span></article>
      <article><strong>{openTabs}</strong><span>Offene Tabs</span></article>
      <article><strong className={expiring.length ? 'warn' : ''}>{expiring.length}</strong><span>Credentials bald abgelaufen</span></article>
    </div>
    <div className="dashboard-columns">
      <article><h2><span className="status-heading-dot offline" /> Nicht erreichbar</h2><div className="dashboard-list">{offlineResources.length ? offlineResources.map(resource => <button key={resource.id} onClick={() => onOpen(resource)}><span>{resource.name}</span><small>{status[resource.id]?.message}</small><i className="resource-status offline" /></button>) : <p className="muted">Alle geprüften Ressourcen sind erreichbar.</p>}</div></article>
      <article><h2><Icon name="star" /> Favoriten</h2><div className="dashboard-list">{favorites.length ? favorites.map(resource => <button key={resource.id} onClick={() => onOpen(resource)}>{typeIcon(resource.type)}<span>{resource.name}</span><i className={`resource-status ${status[resource.id]?.state ?? 'checking'}`} /></button>) : <p className="muted">Noch keine Favoriten markiert.</p>}</div></article>
      <article><h2>Zuletzt verwendet</h2><div className="dashboard-list">{recent.length ? recent.slice(0, 8).map(resource => <button key={resource.id} onClick={() => onOpen(resource)}>{typeIcon(resource.type)}<span>{resource.name}</span></button>) : <p className="muted">Noch keine Ressource geöffnet.</p>}</div></article>
      <article><h2>Credential-Hinweise</h2><div className="dashboard-list">{expiring.length ? expiring.slice(0, 8).map(credential => <div className="dashboard-warning" key={credential.id}><strong>{credential.name}</strong><small>{new Date(credential.expiresAt!) <= new Date() ? 'Abgelaufen' : `Läuft am ${new Date(credential.expiresAt!).toLocaleDateString('de-DE')} ab`}</small></div>) : <p className="muted">Keine Credentials laufen in den nächsten 30 Tagen ab.</p>}</div></article>
    </div>
  </section>;
}

function WorkspaceManager({ workspaces, tabs, onCreate, onRename, onDelete, onOpen, onClose }: { workspaces: Workspace[]; tabs: Tab[]; onCreate: (name: string) => void; onRename: (id: string) => void; onDelete: (id: string) => void; onOpen: (workspace: Workspace) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  return <div className="modal"><div className="workspace-manager"><h2>Arbeitsbereiche</h2><p className="muted">Tabs lassen sich per Drag-and-drop auf einen Arbeitsbereich verschieben. Änderungen an dessen offenen Ressourcen werden automatisch gespeichert.</p><form onSubmit={event => { event.preventDefault(); const trimmed = name.trim(); if (trimmed) { onCreate(trimmed); setName(''); } }}><label>Name<input value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder="z. B. Monitoring" /></label><button className="primary" disabled={!name.trim()}><Icon name="plus" /> Anlegen</button></form><div className="workspace-list">{workspaces.length ? workspaces.map(workspace => <div className="workspace-row" key={workspace.id}><span><strong>{workspace.name}</strong><small>{tabs.filter(tab => tab.workspaceId === workspace.id).length} offen · {workspace.resourceIds.length} gespeichert</small></span><button onClick={() => onOpen(workspace)}>Öffnen</button><button onClick={() => onRename(workspace.id)}>Umbenennen</button><button className="danger-button" onClick={() => onDelete(workspace.id)}>Löschen</button></div>) : <p className="muted">Noch keine Arbeitsbereiche angelegt.</p>}</div><div className="actions"><button onClick={onClose}>Schließen</button></div></div></div>;
}

type BackupPayload = { version: 1; generatedAt: string; categories: Category[]; resources: Resource[]; preferences: Record<string, unknown> };
const bytesToBase64 = (value: Uint8Array) => btoa(Array.from(value, byte => String.fromCharCode(byte)).join(''));
const base64ToBytes = (value: string) => Uint8Array.from(atob(value), character => character.charCodeAt(0));
async function backupKey(passphrase: string, salt: Uint8Array, usage: KeyUsage[]) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 250_000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, usage);
}

function BackupCenter({ categories, resources, preferences, onClose, onRestored }: { categories: Category[]; resources: Resource[]; preferences: Record<string, unknown>; onClose: () => void; onRestored: (preferences: Record<string, unknown>) => Promise<void> }) {
  const [passphrase, setPassphrase] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState(localStorage.getItem('homeops.backupStatus') ?? 'Noch kein Export oder Restore in diesem Browser.');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const exportBackup = async () => {
    if (passphrase.length < 12) return setError('Die Backup-Passphrase muss mindestens 12 Zeichen lang sein.');
    setBusy(true); setError('');
    try {
      const payload: BackupPayload = { version: 1, generatedAt: new Date().toISOString(), categories, resources: resources.map(resource => ({ ...resource, credentialId: null, hasSecret: false, hasLocalSecret: false, config: resource.type === 'web' && resource.config.authType === 'basic' ? { ...resource.config, authType: 'none' } : resource.config })), preferences };
      const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await backupKey(passphrase, salt, ['encrypt']);
      const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(payload))));
      const blob = new Blob([JSON.stringify({ version: 1, kdf: 'PBKDF2-SHA256-250000', cipher: 'AES-256-GCM', salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) })], { type: 'application/json' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `homeops-config-${new Date().toISOString().slice(0, 10)}.homeops-backup`; link.click(); URL.revokeObjectURL(link.href);
      const next = `Letzter Export: ${new Date().toLocaleString('de-DE')} · ${resources.length} Ressourcen`;
      localStorage.setItem('homeops.backupStatus', next); setStatus(next);
    } catch { setError('Der verschlüsselte Export ist fehlgeschlagen.'); } finally { setBusy(false); }
  };
  const restoreBackup = async () => {
    if (!file || passphrase.length < 12) return setError('Backup-Datei und Passphrase werden benötigt.');
    if (!confirm('Konfiguration zusätzlich importieren? Gleichnamige Einträge können danach doppelt vorhanden sein. Secrets werden nicht importiert.')) return;
    setBusy(true); setError('');
    try {
      const wrapped = JSON.parse(await file.text()) as { version:number;salt:string;iv:string;ciphertext:string };
      if (wrapped.version !== 1) throw new Error('version');
      const salt = base64ToBytes(wrapped.salt); const iv = base64ToBytes(wrapped.iv); const key = await backupKey(passphrase, salt, ['decrypt']);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, base64ToBytes(wrapped.ciphertext) as BufferSource);
      const payload = JSON.parse(new TextDecoder().decode(plain)) as BackupPayload;
      if (payload.version !== 1 || !Array.isArray(payload.categories) || !Array.isArray(payload.resources)) throw new Error('format');
      const categoryMap = new Map<string, string>();
      for (const category of payload.categories) { const created = await api.createCategory(category.name); await api.updateCategory(created.id, { icon: category.icon, position: category.position }); categoryMap.set(category.id, created.id); }
      for (const resource of payload.resources) await api.createResource({ type: resource.type, name: resource.name, notes: resource.notes ?? '', tags: resource.tags ?? [], categoryId: resource.categoryId ? categoryMap.get(resource.categoryId) ?? null : null, icon: resource.icon, position: resource.position, enabled: resource.enabled, credentialId: null, config: resource.type === 'web' && resource.config.authType === 'basic' ? { ...resource.config, authType: 'none' } : resource.config });
      await api.savePreferences(payload.preferences ?? {}); await onRestored(payload.preferences ?? {});
      const next = `Letzter Restore: ${new Date().toLocaleString('de-DE')} · ${payload.resources.length} Ressourcen`;
      localStorage.setItem('homeops.backupStatus', next); setStatus(next);
    } catch { setError('Backup konnte nicht entschlüsselt oder importiert werden. Passphrase und Datei prüfen.'); } finally { setBusy(false); }
  };
  return <div className="modal"><div className="backup-center"><h2>Backup &amp; Restore</h2><p className="security-info">Der Export wird lokal im Browser verschlüsselt. Secrets sind absichtlich nicht enthalten.</p><label>Backup-Passphrase<input type="password" minLength={12} autoComplete="new-password" value={passphrase} onChange={event => setPassphrase(event.target.value)} /></label><div className="backup-actions"><button className="primary" disabled={busy} onClick={() => void exportBackup()}>Verschlüsselten Export herunterladen</button><label>Backup-Datei<input type="file" accept=".homeops-backup,application/json" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label><button disabled={busy || !file} onClick={() => void restoreBackup()}>Konfiguration wiederherstellen</button></div><p className="muted">{status}</p>{error && <div role="alert" className="error">{error}</div>}<div className="actions"><button onClick={onClose}>Schließen</button></div></div></div>;
}

function AuditHistory({ events, onClose }: { events: AuditEvent[]; onClose: () => void }) {
  return <div className="modal"><div className="audit-history"><h2>Verbindungsverlauf</h2><div className="audit-list">{events.length ? events.map(event => <div className={`audit-row ${event.ok ? 'success' : 'failed'}`} key={event.id}>
    <span><strong>{event.resourceName}</strong><small>{event.username} · {event.protocol.toUpperCase()} · {new Date(event.createdAt).toLocaleString('de-DE')}</small></span><code>{event.code}</code>
  </div>) : <p className="muted">Noch keine Remote-Verbindungen protokolliert.</p>}</div><div className="actions"><button onClick={onClose}>Schließen</button></div></div></div>;
}

function CredentialManager({ credentials, resources, onCancel, onChanged }: { credentials: Credential[]; resources: Resource[]; onCancel: () => void; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState<Credential | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [kind, setKind] = useState<Credential['kind']>('password');
  const [secret, setSecret] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');
  const reset = () => { setEditing(null); setName(''); setUsername(''); setKind('password'); setSecret(''); setExpiresAt(''); setError(''); };
  const edit = (credential: Credential) => { setEditing(credential); setName(credential.name); setUsername(credential.username); setKind(credential.kind); setSecret(''); setExpiresAt(credential.expiresAt ? new Date(credential.expiresAt).toISOString().slice(0, 10) : ''); setError(''); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    try {
      const expiration = expiresAt ? new Date(`${expiresAt}T23:59:59.999Z`).toISOString() : null;
      if (editing) await api.updateCredential(editing.id, { name, username, kind, expiresAt: expiration, ...(secret ? { secret } : {}) });
      else await api.createCredential({ name, username, kind, secret, expiresAt: expiration });
      reset(); await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Zugangsdaten konnten nicht gespeichert werden.'); }
  };
  const removeCredential = async (credential: Credential) => {
    const affected = resources.filter(resource => resource.credentialId === credential.id).map(resource => resource.name);
    if (!confirm(`Zugangsdaten „${credential.name}“ löschen?${affected.length ? ` Betroffen: ${affected.join(', ')}.` : ''} Zugewiesene Ressourcen verlieren diese Verknüpfung.`)) return;
    try { await api.deleteCredential(credential.id); if (editing?.id === credential.id) reset(); await onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Zugangsdaten konnten nicht gelöscht werden.'); }
  };
  return <div className="modal"><div className="credential-manager">
    <h2>Zugangsdaten</h2>
    <div className="credential-list" aria-label="Gespeicherte Zugangsdaten">
      {credentials.length ? credentials.map(credential => { const affected = resources.filter(resource => resource.credentialId === credential.id); const expired = Boolean(credential.expiresAt && new Date(credential.expiresAt) <= new Date()); return <div className={`credential-row${expired ? ' expired' : ''}`} key={credential.id}>
        <span><strong>{credential.name}{expired ? ' · Abgelaufen' : ''}</strong><small>{credential.username} · {credential.kind === 'private_key' ? 'Private Key' : 'Passwort'} · {affected.length} Ressource(n){affected.length ? `: ${affected.map(resource => resource.name).join(', ')}` : ''}</small></span>
        <button onClick={() => edit(credential)}>Bearbeiten</button>
        <button className="danger-button" onClick={() => void removeCredential(credential)}>Löschen</button>
      </div>; }) : <p className="muted">Noch keine globalen Zugangsdaten gespeichert.</p>}
    </div>
    <form onSubmit={submit}>
      <h3>{editing ? 'Zugangsdaten bearbeiten' : 'Neue Zugangsdaten'}</h3>
      <label>Bezeichnung<input required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="z. B. Server A · root" /></label>
      <small className="muted">Die frei wählbare Bezeichnung identifiziert das Credential. Bei einer Ressource wird ausschließlich diese Bezeichnung zur Auswahl angezeigt.</small>
      <label>Benutzername<input required maxLength={128} autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} placeholder="z. B. root" /></label>
      <label>Typ<select value={kind} onChange={event => setKind(event.target.value as Credential['kind'])}><option value="password">Passwort</option><option value="private_key">Private Key</option></select></label>
      <label>Ablaufdatum (optional)<input type="date" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} /></label>
      <label>{editing ? 'Secret ersetzen (optional)' : 'Secret'}<textarea required={!editing} rows={kind === 'private_key' ? 7 : 2} value={secret} onChange={event => setSecret(event.target.value)} autoComplete="off" /></label>
      {error && <div role="alert" className="error">{error}</div>}
      <div className="actions">{editing && <button type="button" onClick={reset}>Neue anlegen</button>}<button className="primary">{editing ? 'Aktualisieren' : 'Speichern'}</button></div>
    </form>
    <div className="actions"><button onClick={onCancel}>Schließen</button></div>
  </div></div>;
}

function ChangePassword({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmation) return setError('Die neuen Kennwörter stimmen nicht überein.');
    try { await api.changePassword(currentPassword, newPassword); onSaved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Kennwort konnte nicht geändert werden.'); }
  };
  return <div className="modal"><form onSubmit={submit}>
    <h2>Kennwort ändern</h2>
    <label>Aktuelles Kennwort<input autoFocus required type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>
    <label>Neues Kennwort<input required type="password" minLength={12} autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label>
    <label>Neues Kennwort bestätigen<input required type="password" minLength={12} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
    {error && <div role="alert" className="error">{error}</div>}
    <div className="actions"><button type="button" onClick={onCancel}>Abbrechen</button><button className="primary">Kennwort speichern</button></div>
  </form></div>;
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  return <main className="login"><form onSubmit={async event => {
    event.preventDefault();
    try { await api.login(username, password); onSuccess(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Anmeldung fehlgeschlagen'); }
  }}>
    <h1 className="login-brand"><BrandMark size={42} /> HomeOps Hub</h1>
    <label>Benutzername<input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} /></label>
    <label>Passwort<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
    {error && <div className="error">{error}</div>}
    <button className="primary">Anmelden</button>
  </form></main>;
}

function ResourceTagsMenu({ resource, availableTags, onChange, onDelete }: { resource: Resource; availableTags: string[]; onChange: (tags: string[]) => Promise<void>; onDelete: (tag: string) => Promise<void> }) {
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = new Set(resource.tags);
  const save = async (tags: string[]) => {
    setBusy(true);
    try { await onChange(tags); }
    finally { setBusy(false); }
  };
  const toggle = (tag: string, checked: boolean) => {
    const next = checked ? [...resource.tags, tag] : resource.tags.filter(entry => entry !== tag);
    void save([...new Set(next)]);
  };
  const add = (event: FormEvent) => {
    event.preventDefault();
    const value = newTag.trim();
    if (!value || resource.tags.length >= 20) return;
    const existing = availableTags.find(tag => tag.localeCompare(value, 'de', { sensitivity: 'base' }) === 0);
    const tag = existing ?? value;
    if (selected.has(tag)) { setNewTag(''); return; }
    setNewTag('');
    void save([...resource.tags, tag]);
  };
  const removeEverywhere = (tag: string) => {
    if (!confirm(`Tag „${tag}“ wirklich von allen Ressourcen entfernen und löschen?`)) return;
    setBusy(true);
    void onDelete(tag).finally(() => setBusy(false));
  };
  return <details className="resource-tag-menu">
    <summary aria-label="Tags verwalten"><Icon name="tag" /><span>Tags</span><small>{resource.tags.length}</small></summary>
    <div className="resource-tag-panel">
      <div className="resource-tag-options">
        {availableTags.length === 0 && <p>Noch keine Tags vorhanden.</p>}
        {availableTags.map(tag => <div className="resource-tag-option" key={tag}><label><input type="checkbox" checked={selected.has(tag)} disabled={busy || (!selected.has(tag) && resource.tags.length >= 20)} onChange={event => toggle(tag, event.target.checked)} /><span>{tag}</span></label><button type="button" className="danger-button" aria-label={`Tag ${tag} überall löschen`} title="Tag überall löschen" disabled={busy} onClick={() => removeEverywhere(tag)}><Icon name="delete" size={14} /></button></div>)}
      </div>
      <form onSubmit={add}>
        <label><span>Neuen Tag anlegen</span><input value={newTag} maxLength={40} disabled={busy || resource.tags.length >= 20} onChange={event => setNewTag(event.target.value)} /></label>
        <button type="submit" disabled={busy || !newTag.trim() || resource.tags.length >= 20}><Icon name="plus" /> Anlegen und zuweisen</button>
      </form>
      {resource.tags.length >= 20 && <small>Maximal 20 Tags pro Ressource.</small>}
    </div>
  </details>;
}

function ResourceEditor({ resource, categories, credentials, onCancel, onSaved }: { resource?: Resource; categories: Category[]; credentials: Credential[]; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [type, setType] = useState<ResourceType>(resource?.type ?? 'web');
  const [name, setName] = useState(resource?.name ?? '');
  const [notes, setNotes] = useState(resource?.notes ?? '');
  const [tags, setTags] = useState(resource?.tags.join(', ') ?? '');
  const [target, setTarget] = useState(String(resource?.config.url ?? resource?.config.host ?? ''));
  const [port, setPort] = useState(String(resource?.config.port ?? (type === 'ssh' ? 22 : 3389)));
  const assignedCredential = credentials.find(credential => credential.id === resource?.credentialId);
  const [username, setUsername] = useState(assignedCredential?.username ?? String(resource?.config.username ?? ''));
  const [hostKey, setHostKey] = useState(String(resource?.config.hostKeyFingerprint ?? ''));
  const [verifyHostKey, setVerifyHostKey] = useState(resource?.config.verifyHostKey !== false);
  const [authType, setAuthType] = useState(String(resource?.config.authType ?? 'password'));
  const [domain, setDomain] = useState(String(resource?.config.domain ?? ''));
  const [security, setSecurity] = useState(String(resource?.config.security ?? 'nla'));
  const [ignoreCertificate, setIgnoreCertificate] = useState(resource?.config.ignoreCertificate === true);
  const [mode, setMode] = useState(String(resource?.config.mode ?? 'auto'));
  const [webAuthType, setWebAuthType] = useState(String(resource?.config.authType ?? 'none'));
  const [categoryId, setCategory] = useState(resource?.categoryId ?? '');
  const [secret, setSecret] = useState('');
  const [credentialId, setCredentialId] = useState(resource?.credentialId ?? '');
  const [creatingCredential, setCreatingCredential] = useState(false);
  const [newCredentialName, setNewCredentialName] = useState('');
  const [newCredentialUsername, setNewCredentialUsername] = useState('');
  const [newCredentialSecret, setNewCredentialSecret] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    let createdCredentialId: string | null = null;
    let resourcePersisted = false;
    try {
      const effectiveUsername = type !== 'web' && creatingCredential ? newCredentialUsername.trim() : username;
      const config = type === 'web'
        ? { url: target, mode, authType: webAuthType, sandbox: String(resource?.config.sandbox ?? 'allow-forms allow-modals allow-popups allow-scripts allow-same-origin') }
        : type === 'ssh'
          ? { host: target, port: Number(port), username: effectiveUsername, authType, verifyHostKey, hostKeyFingerprint: verifyHostKey ? hostKey : '' }
          : { host: target, port: Number(port), username: effectiveUsername, domain: domain || undefined, security, ignoreCertificate };
      const parsedTags = [...new Set(tags.split(',').map(tag => tag.trim()).filter(Boolean))];
      if (creatingCredential && (type !== 'web' || webAuthType === 'basic')) {
        const kind: Credential['kind'] = type === 'ssh' && authType === 'private_key' ? 'private_key' : 'password';
        const created = await api.createCredential({ name: newCredentialName.trim(), username: newCredentialUsername.trim(), kind, secret: newCredentialSecret, expiresAt: null });
        createdCredentialId = created.id;
      }
      const effectiveCredentialId = type === 'web' && webAuthType !== 'basic' ? null : (createdCredentialId ?? credentialId) || null;
      const body = { name, notes, tags: parsedTags, categoryId: categoryId || null, icon: resource?.icon ?? 'link', position: resource?.position ?? 0, enabled: resource?.enabled ?? true, credentialId: effectiveCredentialId, config, ...(!effectiveCredentialId && secret ? { secret } : {}) };
      if (resource) await api.updateResource(resource.id, body);
      else await api.createResource({ ...body, type });
      resourcePersisted = true;
      await onSaved();
    } catch (reason) {
      if (createdCredentialId && !resourcePersisted) {
        try { await api.deleteCredential(createdCredentialId); }
        catch { setError('Ressource konnte nicht gespeichert werden; das neu angelegte Credential muss unter Zugangsdaten geprüft werden.'); return; }
      }
      setError(reason instanceof Error ? reason.message : 'Fehler');
    }
  };

  return <div className="modal"><form onSubmit={submit}>
    <h2>{resource ? 'Ressource bearbeiten' : 'Ressource anlegen'}</h2>
    <label>Typ<select value={type} disabled={Boolean(resource)} onChange={event => {
      const nextType = event.target.value as ResourceType;
      setType(nextType);
      setPort(nextType === 'ssh' ? '22' : nextType === 'rdp' ? '3389' : '');
      setCredentialId('');
      setCreatingCredential(false);
      setNewCredentialSecret('');
    }}><option value="web">Web</option><option value="ssh">SSH</option><option value="rdp">RDP</option></select></label>
    <label>Name<input required value={name} onChange={event => setName(event.target.value)} /></label>
    <label>Notizen (optional)<textarea maxLength={4000} rows={4} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Zweck, Hinweise oder Dokumentationslink …" /></label>
    <label>Tags (kommagetrennt)<input value={tags} onChange={event => setTags(event.target.value)} placeholder="z. B. Produktion, Linux, Kritisch" /></label>
    <label>{type === 'web' ? 'URL' : 'Host'}<input required value={target} onChange={event => setTarget(event.target.value)} /></label>
    {type === 'web' && <>
      <label>Einbettungsmodus<select value={mode} disabled={webAuthType === 'basic'} onChange={event => setMode(event.target.value)}><option value="auto">Automatisch / eingebettet</option><option value="embedded">Eingebettet</option><option value="external">Nur extern</option></select></label>
      <label>Authentifizierung<select value={webAuthType} onChange={event => { setWebAuthType(event.target.value); if (event.target.value !== 'basic') { setCredentialId(''); setCreatingCredential(false); setNewCredentialSecret(''); } }}><option value="none">Keine / Website-Dialog</option><option value="basic">HTTP Basic über HomeOps</option></select></label>
      {webAuthType === 'basic' && <>
        <label>Globale Zugangsdaten<select required value={creatingCredential ? '__new__' : credentialId} onChange={event => { if (event.target.value === '__new__') { setCreatingCredential(true); if (!newCredentialName) setNewCredentialName(`${name || 'Web'} · HTTP Basic`); } else { setCreatingCredential(false); setNewCredentialSecret(''); setCredentialId(event.target.value); } }}><option value="">Bitte auswählen</option><option value="__new__">＋ Neu anlegen …</option><optgroup label="Vorhandene Credentials">{credentials.filter(credential => credential.kind === 'password' && (credential.id === credentialId || !credential.expiresAt || new Date(credential.expiresAt) > new Date())).map(credential => <option key={credential.id} value={credential.id}>{credential.name}{credential.expiresAt && new Date(credential.expiresAt) <= new Date() ? ' (abgelaufen)' : ''}</option>)}</optgroup></select></label>
        {creatingCredential && <div className="inline-credential-fields">
            <label>Bezeichnung<input required maxLength={120} value={newCredentialName} onChange={event => setNewCredentialName(event.target.value)} placeholder="z. B. Kamera · admin" /></label>
            <label>Benutzername<input required maxLength={128} autoComplete="username" value={newCredentialUsername} onChange={event => setNewCredentialUsername(event.target.value)} /></label>
            <label>Passwort<input required type="password" autoComplete="new-password" value={newCredentialSecret} onChange={event => setNewCredentialSecret(event.target.value)} /></label>
          </div>}
        <div className="security-info">Das Credential wird nur im Backend entschlüsselt. Die Zielseite läuft in einem isolierten HomeOps-Frame.</div>
        {target.toLowerCase().startsWith('http:') && <div className="security-warning" role="alert">LAN-Ausnahme: HTTP Basic überträgt das Kennwort zum Ziel unverschlüsselt. Nur in einem vertrauenswürdigen LAN verwenden.</div>}
      </>}
    </>}
    {type !== 'web' && <>
      <label>Port<input required type="number" min="1" max="65535" value={port} onChange={event => setPort(event.target.value)} /></label>
      <label>Benutzer<input required={type === 'ssh' && !creatingCredential} disabled={Boolean(credentialId) || creatingCredential} value={username} onChange={event => setUsername(event.target.value)} /></label>
      {type === 'ssh' ? <>
        <label>Authentifizierung<select value={authType} onChange={event => { setAuthType(event.target.value); setCredentialId(''); setCreatingCredential(false); setNewCredentialSecret(''); }}><option value="password">Passwort</option><option value="private_key">Private Key</option></select></label>
        <label className="checkbox"><input type="checkbox" checked={verifyHostKey} onChange={event => setVerifyHostKey(event.target.checked)} /> SSH Host-Key prüfen (empfohlen)</label>
        {verifyHostKey
          ? <label>SSH Host-Key (known_hosts-Format)<input required value={hostKey} onChange={event => setHostKey(event.target.value)} placeholder="[host]:22 ssh-ed25519 AAAA…" /></label>
          : <div className="security-warning" role="alert">Ohne Host-Key-Prüfung kann die Identität des SSH-Servers nicht verifiziert werden.</div>}
      </> : <>
        <label>Domäne (optional)<input value={domain} onChange={event => setDomain(event.target.value)} /></label>
        <label>RDP-Sicherheit<select value={security} onChange={event => setSecurity(event.target.value)}><option value="nla">NLA</option><option value="tls">TLS</option><option value="rdp">RDP</option><option value="any">Aushandeln</option></select></label>
        <label className="checkbox"><input type="checkbox" checked={ignoreCertificate} onChange={event => setIgnoreCertificate(event.target.checked)} /> Zertifikatsprüfung für diese Ressource ausnahmsweise deaktivieren</label>
      </>}
      <label>Globale Zugangsdaten<select value={creatingCredential ? '__new__' : credentialId} onChange={event => { const id = event.target.value; if (id === '__new__') { setCreatingCredential(true); if (!newCredentialName) setNewCredentialName(`${name || type.toUpperCase()} · ${authType === 'private_key' ? 'Private Key' : 'Zugang'}`); } else { setCreatingCredential(false); setNewCredentialSecret(''); setCredentialId(id); const selected = credentials.find(credential => credential.id === id); if (selected) setUsername(selected.username); } }}><option value="">Keine / ressourceneigen</option><option value="__new__">＋ Neu anlegen …</option><optgroup label="Vorhandene Credentials">{credentials.filter(credential => credential.kind === (type === 'ssh' && authType === 'private_key' ? 'private_key' : 'password') && (credential.id === credentialId || !credential.expiresAt || new Date(credential.expiresAt) > new Date())).map(credential => <option key={credential.id} value={credential.id}>{credential.name}{credential.expiresAt && new Date(credential.expiresAt) <= new Date() ? ' (abgelaufen)' : ''}</option>)}</optgroup></select></label>
      {creatingCredential
        ? <><div className="inline-credential-fields">
          <label>Bezeichnung<input required maxLength={120} value={newCredentialName} onChange={event => setNewCredentialName(event.target.value)} placeholder="z. B. Server A · root" /></label>
          <label>Benutzername<input required maxLength={128} autoComplete="username" value={newCredentialUsername} onChange={event => setNewCredentialUsername(event.target.value)} /></label>
          <label>{type === 'ssh' && authType === 'private_key' ? 'Private Key' : 'Passwort'}<textarea required rows={type === 'ssh' && authType === 'private_key' ? 7 : 2} value={newCredentialSecret} onChange={event => setNewCredentialSecret(event.target.value)} autoComplete="off" /></label>
        </div><div className="security-info">Die Zugangsdaten werden global gespeichert und direkt mit dieser Ressource verknüpft.</div></>
        : credentialId
          ? <div className="security-info">Benutzername und Secret werden aus dem globalen Credential übernommen und nicht in diese Ressource kopiert.</div>
          : <label>{resource?.hasLocalSecret ? 'Ressourceneigenes Secret ersetzen (optional)' : 'Secret (optional gespeichert)'}<input type="password" value={secret} onChange={event => setSecret(event.target.value)} /></label>}
    </>}
    <label>Gruppe<select value={categoryId} onChange={event => setCategory(event.target.value)}><option value="">Ohne</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
    {error && <div role="alert" className="error">{error}</div>}
    <div className="actions"><button type="button" onClick={onCancel}>Abbrechen</button><button className="primary">Speichern</button></div>
  </form></div>;
}
