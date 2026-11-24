import { memo, useEffect, useRef, useState } from 'react';
import Guacamole from 'guacamole-common-js';
import { api } from './api';
import { sendClipboardText } from './remoteClipboard';
import { diagnosticFilename, formatRemoteDiagnostics, type RemoteDiagnosticEntry } from './remoteDiagnostics';
import { RemoteKeyboardController } from './remoteKeyboard';
import { sendRemoteSize } from './remoteSize';
import type { AuditEvent, Credential, Resource } from './types';

type State = 'disconnected' | 'connecting' | 'connected' | 'error';
const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'development';

export const RemoteTab = memo(function RemoteTab({ resource, credentials, active, onResourceUpdated }: { resource: Resource; credentials: Credential[]; active: boolean; onResourceUpdated: () => Promise<void> }) {
  const remote = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const client = useRef<any>(null);
  const keyboard = useRef<any>(null);
  const clipboardCapture = useRef<HTMLTextAreaElement>(null);
  const autoConnectAttempted = useRef(false);
  const [state, setState] = useState<State>('disconnected');
  const [error, setError] = useState('');
  const [secret, setSecret] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<RemoteDiagnosticEntry[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [selectedCredentialId, setSelectedCredentialId] = useState(resource.credentialId ?? '');
  const [pendingCredentialId, setPendingCredentialId] = useState<string | null>(null);
  const [assigningCredential, setAssigningCredential] = useState(false);
  const expectedCredentialKind: Credential['kind'] = resource.type === 'ssh' && resource.config.authType === 'private_key' ? 'private_key' : 'password';
  const compatibleCredentials = credentials.filter(credential => credential.kind === expectedCredentialKind && (credential.id === selectedCredentialId || !credential.expiresAt || new Date(credential.expiresAt) > new Date()));
  const temporaryCredentialId = selectedCredentialId && selectedCredentialId !== resource.credentialId ? selectedCredentialId : undefined;
  const missingSshUsername = resource.type === 'ssh' && !selectedCredentialId && !String(resource.config.username ?? '').trim();
  const pendingCredential = credentials.find(credential => credential.id === pendingCredentialId);
  const recordDiagnostic = (level: RemoteDiagnosticEntry['level'], message: string, details?: Record<string, unknown>) => setDiagnostics(current => [...current.slice(-99), { at: new Date().toISOString(), level, message, details }]);
  const loadAudit = async () => {
    try { setAuditEvents((await api.audit()).events.filter(event => event.resourceId === resource.id).slice(0, 20)); }
    catch (reason) { recordDiagnostic('error', 'Backend-Audit konnte nicht geladen werden', { message: reason instanceof Error ? reason.message : 'Unbekannter Fehler' }); }
  };
  const downloadDiagnostics = async () => {
    let latestAudit = auditEvents;
    try { latestAudit = (await api.audit()).events.filter(event => event.resourceId === resource.id).slice(0, 20); setAuditEvents(latestAudit); }
    catch (reason) { recordDiagnostic('error', 'Backend-Audit konnte vor dem Download nicht geladen werden', { message: reason instanceof Error ? reason.message : 'Unbekannter Fehler' }); }
    const text = formatRemoteDiagnostics(resource, diagnostics, latestAudit, APP_VERSION, navigator.userAgent);
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = diagnosticFilename(resource); link.click(); URL.revokeObjectURL(url);
  };
  const assignPendingCredential = async () => {
    if (!pendingCredentialId) return;
    setAssigningCredential(true); setError('');
    try { await api.updateResource(resource.id, { credentialId: pendingCredentialId }); recordDiagnostic('info', 'Credential dauerhaft an Ressource gespeichert'); setPendingCredentialId(null); await onResourceUpdated(); }
    catch (reason) { const message=reason instanceof Error?reason.message:'Credential konnte nicht zugeordnet werden';recordDiagnostic('error','Credential konnte nicht zugeordnet werden',{message});setError(message); }
    finally { setAssigningCredential(false); }
  };

  const fitDisplay = () => {
    if (!host.current || !client.current) return;
    const display = client.current.getDisplay();
    const width = Number(display.getWidth?.() ?? 0);
    const height = Number(display.getHeight?.() ?? 0);
    if (!width || !height || !host.current.clientWidth || !host.current.clientHeight) return;
    display.scale(Math.min(host.current.clientWidth / width, host.current.clientHeight / height));
  };

  const releaseInput = () => {
    if (!keyboard.current) return;
    keyboard.current.onkeydown = null;
    keyboard.current.onkeyup = null;
    keyboard.current.reset?.();
    keyboard.current = null;
  };

  const disconnect = () => {
    recordDiagnostic('info', 'Verbindung manuell getrennt');
    releaseInput();
    client.current?.disconnect();
    client.current = null;
    setState('disconnected');
    if (host.current) host.current.replaceChildren();
  };

  const connect = async () => {
    if (!host.current) return;
    if (missingSshUsername) { recordDiagnostic('error', 'SSH-Verbindung blockiert: Benutzername fehlt'); return; }
    setState('connecting');
    setError('');
    recordDiagnostic('info', 'Verbindungsaufbau gestartet', { protocol: resource.type, host: resource.config.host, port: resource.config.port, credential: resource.credentialId ? 'global' : resource.hasLocalSecret ? 'local' : 'prompt' });
    try {
      const rect = host.current.getBoundingClientRect();
      const ticket = await api.connect(resource.id, secret || undefined, Math.max(640, Math.floor(rect.width)), Math.max(400, Math.floor(rect.height)), temporaryCredentialId);
      recordDiagnostic('info', 'Backend-Ticket erhalten', { protocol: ticket.protocol, expiresIn: ticket.expiresIn });
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      const tunnel = new Guacamole.WebSocketTunnel(`${scheme}://${location.host}/api/v1/tunnel`);
      tunnel.onerror = (status: any) => { recordDiagnostic('error', 'WebSocket-Tunnel meldet einen Fehler', { code: status?.code, message: status?.message }); void loadAudit(); };
      const guac = new Guacamole.Client(tunnel);
      const display = guac.getDisplay();
      const displayElement = display.getElement();
      client.current = guac;
      host.current.replaceChildren(displayElement);
      display.onresize = () => requestAnimationFrame(fitDisplay);
      guac.onerror = (status: any) => { const message = status?.message ?? 'Remote-Verbindungsfehler'; recordDiagnostic('error', 'Guacamole meldet einen Fehler', { code: status?.code, message }); setError(message); setState('error'); void loadAudit(); };
      guac.onstatechange = (nextState: number) => {
        const labels: Record<number,string> = { 0: 'Leerlauf', 1: 'Verbinden', 2: 'Warten', 3: 'Verbunden', 4: 'Trennen', 5: 'Getrennt' };
        recordDiagnostic('info', `Guacamole-Status: ${labels[nextState] ?? nextState}`);
        if (nextState === 3) { setState('connected'); requestAnimationFrame(fitDisplay); if(temporaryCredentialId)setPendingCredentialId(temporaryCredentialId); }
        if (nextState === 5) setState('disconnected');
      };
      const mouse = new Guacamole.Mouse(displayElement);
      mouse.onmousedown = mouse.onmouseup = mouse.onmousemove = (mouseState: any) => guac.sendMouseState(mouseState);
      keyboard.current = new Guacamole.Keyboard(host.current);
      const keyboardController = new RemoteKeyboardController(guac, () => clipboardCapture.current?.focus());
      keyboard.current.onkeydown = (key: number) => keyboardController.keyDown(key);
      keyboard.current.onkeyup = (key: number) => keyboardController.keyUp(key);
      guac.connect(`token=${encodeURIComponent(ticket.token)}`);
      setSecret('');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Verbindungsfehler';
      recordDiagnostic('error', 'Verbindungsaufbau fehlgeschlagen', { message });
      setError(message);
      setState('error');
      void loadAudit();
    }
  };

  useEffect(() => {
    if (!active || !resource.hasSecret || state !== 'disconnected' || autoConnectAttempted.current) return;
    autoConnectAttempted.current = true;
    void connect();
  }, [active, resource.hasSecret, state]);
  useEffect(() => () => { releaseInput(); client.current?.disconnect(); }, []);
  useEffect(() => {
    const changed = () => { setFullscreen(document.fullscreenElement === remote.current); requestAnimationFrame(fitDisplay); };
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!active || !client.current) return;
      fitDisplay();
      sendRemoteSize(client.current, entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(host.current);
    if (active) requestAnimationFrame(fitDisplay);
    return () => observer.disconnect();
  }, [active, resource.type]);
  useEffect(() => {
    if (!active || state !== 'connected') return;
    const paste = (event: ClipboardEvent) => {
      if (!remote.current?.contains(event.target as Node)) return;
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (!sendClipboardText(client.current, text, resource.type === 'rdp')) return;
      event.preventDefault();
      host.current?.focus();
    };
    document.addEventListener('paste', paste, true);
    return () => document.removeEventListener('paste', paste, true);
  }, [active, resource.type, state]);
  useEffect(() => { setSelectedCredentialId(resource.credentialId ?? ''); setPendingCredentialId(null); }, [resource.credentialId]);

  return <div ref={remote} className="remote">
    <form className="viewer-toolbar" onSubmit={event => { event.preventDefault(); if (state !== 'connected') void connect(); }}>
      <span className={`status ${state}`}>{state === 'connected' ? 'Verbunden' : state === 'connecting' ? 'Verbinden …' : state === 'error' ? 'Fehler' : 'Getrennt'}</span>
      {state !== 'connected' && <><input aria-label="Passwort oder Private Key" type="password" value={secret} disabled={missingSshUsername || Boolean(selectedCredentialId)} onChange={event => setSecret(event.target.value)} placeholder={selectedCredentialId ? 'Gespeichertes Credential verwenden' : resource.hasSecret ? 'Gespeichertes Secret verwenden' : 'Passwort / Private Key'} /><button type="submit" disabled={state === 'connecting' || missingSshUsername}>{state === 'error' ? 'Erneut verbinden' : 'Verbinden'}</button></>}
      {state === 'connected' && <><span className="viewer-hint">Einfügen: Strg+V / Strg+Shift+V</span><button type="button" onClick={() => void (fullscreen ? document.exitFullscreen() : remote.current?.requestFullscreen())}>{fullscreen ? 'Vollbild beenden' : 'Vollbild'}</button><button type="button" onClick={disconnect}>Trennen</button></>}
      <button type="button" onClick={() => { setDiagnosticsOpen(open => !open); if (!diagnosticsOpen) void loadAudit(); }}>{diagnosticsOpen ? 'Diagnose schließen' : 'Diagnose anzeigen'}</button>
      <button type="button" onClick={() => void downloadDiagnostics()}>Protokoll herunterladen</button>
    </form>
    {state !== 'connected' && <div className="remote-credential-picker"><label>Gespeicherte Zugangsdaten<select aria-label="Gespeicherte Zugangsdaten" value={selectedCredentialId} onChange={event=>{setSelectedCredentialId(event.target.value);setPendingCredentialId(null);setError('');}}><option value="">Keine / Secret eingeben</option>{resource.credentialId&&!compatibleCredentials.some(entry=>entry.id===resource.credentialId)&&<option value={resource.credentialId}>Aktuell zugeordnetes Credential</option>}{compatibleCredentials.map(credential=><option key={credential.id} value={credential.id}>{credential.name} · {credential.username}</option>)}</select></label></div>}
    {state === 'connected' && pendingCredentialId && <div className="remote-credential-confirm" role="dialog" aria-label="Credential dauerhaft zuordnen"><span>Die Verbindung mit <strong>{pendingCredential?.name ?? 'dem ausgewählten Credential'}</strong> war erfolgreich. Dauerhaft dieser Ressource zuordnen?</span><button type="button" disabled={assigningCredential} onClick={()=>setPendingCredentialId(null)}>Nur diesmal verwenden</button><button className="primary" type="button" disabled={assigningCredential} onClick={()=>void assignPendingCredential()}>{assigningCredential?'Wird zugeordnet …':'Dauerhaft zuordnen'}</button></div>}
    {missingSshUsername && <div role="alert" className="error">SSH-Benutzer fehlt. Bitte die Ressource bearbeiten und einen Benutzer oder globale Zugangsdaten hinterlegen.</div>}
    {error && <div role="alert" className="error">{error}</div>}
    {diagnosticsOpen && <section className="remote-diagnostics"><h3>Verbindungsdiagnose</h3><p className="muted">Browser-/Tunnelereignisse und Backend-Audit, ohne Secrets oder Sitzungstokens.</p><pre>{formatRemoteDiagnostics(resource, diagnostics, auditEvents, APP_VERSION, navigator.userAgent)}</pre></section>}
    <div ref={host} className="remote-display" tabIndex={0} onPointerDown={event => event.currentTarget.focus()} />
    <textarea ref={clipboardCapture} className="remote-clipboard-capture" aria-label="Remote-Zwischenablage" tabIndex={-1} />
  </div>;
});
