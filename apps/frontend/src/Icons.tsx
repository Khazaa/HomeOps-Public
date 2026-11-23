export type IconName = 'home'|'plus'|'web'|'ssh'|'rdp'|'duplicate'|'newTab'|'workspace'|'inbox'|'up'|'down'|'test'|'edit'|'delete'|'close'|'menu'|'reorder'|'theme'|'reload'|'recent'|'chevronRight'|'chevronDown'|'star'|'note'|'tag';

export function BrandMark({ size = 28 }: { size?: number }) {
  return <img className="brand-mark" src="/favicon.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function Icon({ name, size = 17 }: { name: IconName; size?: number }) {
  const content = {
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></>,
    plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    web: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></>,
    ssh: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/></>,
    rdp: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></>,
    duplicate: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
    newTab: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M12 12v4M10 14h4"/></>,
    workspace: <><rect x="3" y="4" width="8" height="7" rx="1"/><rect x="13" y="4" width="8" height="7" rx="1"/><rect x="3" y="13" width="8" height="7" rx="1"/><rect x="13" y="13" width="8" height="7" rx="1"/></>,
    inbox: <><path d="M4 4h16l2 11v5H2v-5L4 4Z"/><path d="M2 15h6l2 3h4l2-3h6"/></>,
    up: <><path d="m6 10 6-6 6 6M12 4v16"/></>,
    down: <><path d="m6 14 6 6 6-6M12 20V4"/></>,
    test: <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,
    edit: <><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></>,
    delete: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    menu: <><circle cx="5" cy="12" r="1.65" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.65" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.65" fill="currentColor" stroke="none"/></>,
    reorder: <><path d="M8 7h12M8 12h12M8 17h12"/><path d="m4 5-2 2 2 2M2 7h3M4 15l2 2-2 2M6 17H3"/></>,
    theme: <><path d="M12 3a9 9 0 1 0 9 9c0-1-.8-1.6-1.7-1.3a2 2 0 0 1-2.5-2.5C17.1 7.3 16.5 6.5 15.5 6.5H15a2 2 0 0 1-2-2V4c0-.6-.4-1-1-1Z"/><circle cx="7.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="10" cy="16" r="1" fill="currentColor" stroke="none"/></>,
    reload: <><path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 0-2 5"/></>,
    recent: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    chevronRight: <path d="m9 5 7 7-7 7"/>,
    chevronDown: <path d="m5 9 7 7 7-7"/>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>,
    note: <><path d="M5 3h14v18H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    tag: <><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Z"/><circle cx="8" cy="8" r="1.3"/></>
  }[name];
  return <svg className={`icon icon-${name}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{content}</svg>;
}
