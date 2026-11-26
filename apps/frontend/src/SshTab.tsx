import { memo, useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { api } from './api';
import { diagnosticFilename, formatRemoteDiagnostics, type RemoteDiagnosticEntry } from './remoteDiagnostics';
import type { AuditEvent, Credential, Resource } from './types';

type State = 'disconnected' | 'connecting' | 'connected' | 'error';
type SshMessage = { type: 'ready' | 'exit' } | { type: 'data'; data: string } | { type: 'error'; code: string; message: string };
const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'development';

export const SshTab = memo(function SshTab({ resource, credentials, active, onResourceUpdated }: { resource: Resource; credentials: Credential[]; active: boolean; onResourceUpdated: () => Promise<void> }) {
  const remote = useRef<HTMLDivElement>(null);
  const terminalHost = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal>(null);
  const fitAddon = useRef<FitAddon>(null);
  const socket = useRef<WebSocket>(null);
  const autoConnectAttempted = useRef(false);
  const manualClose = useRef(false);
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
  const compatibleCredentials = credentials.filter(credential => credential.kind === (resource.config.authType === 'private_key' ? 'private_key' : 'password') && (credential.id === selectedCredentialId || !credential.expiresAt || new Date(credential.expiresAt) > new Date()));
  const temporaryCredentialId = selectedCredentialId && selectedCredentialId !== resource.credentialId ? selectedCredentialId : undefined;
  const missingUsername = !selectedCredentialId && !String(resource.config.username ?? '').trim();
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

  const resizeTerminal = () => {
    if (!active || !fitAddon.current || !terminal.current) return;
    fitAddon.current.fit();
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: 'resize', cols: terminal.current.cols, rows: terminal.current.rows }));
  };

  const disconnect = () => {
    manualClose.current = true;
    socket.current?.close(1000, 'Disconnected by user');
    socket.current = null;
    setState('disconnected');
    recordDiagnostic('info', 'SSH-Verbindung manuell getrennt');
    terminal.current?.writeln('\r\n\x1b[33m[Verbindung getrennt]\x1b[0m');
  };

  const connect = async () => {
    if (!terminal.current || !terminalHost.current || missingUsername) return;
    socket.current?.close();
    setState('connecting'); setError(''); manualClose.current = false;
    recordDiagnostic('info', 'SSH-Verbindungsaufbau gestartet', { host: resource.config.host, port: resource.config.port, credential: resource.credentialId ? 'global' : resource.hasLocalSecret ? 'local' : 'prompt' });
    terminal.current.clear();
    terminal.current.writeln('\x1b[90mSSH-Verbindung wird aufgebaut …\x1b[0m');
    resizeTerminal();
    try {
      const rect = terminalHost.current.getBoundingClientRect();
      const ticket = await api.connect(resource.id, secret || undefined, Math.max(320, Math.floor(rect.width)), Math.max(200, Math.floor(rect.height)), temporaryCredentialId, terminal.current.cols, terminal.current.rows);
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      const webSocket = new WebSocket(`${scheme}://${location.host}/api/v1/tunnel/ssh?token=${encodeURIComponent(ticket.token)}`);
      socket.current = webSocket;
      webSocket.onopen = () => recordDiagnostic('info', 'SSH-WebSocket geöffnet');
      webSocket.onmessage = event => {
        let message: SshMessage;
        try { message = JSON.parse(String(event.data)) as SshMessage; }
        catch { recordDiagnostic('error', 'Ungültige Nachricht vom SSH-Tunnel'); return; }
        if (message.type === 'data') terminal.current?.write(message.data);
        else if (message.type === 'ready') {
          terminal.current?.clear(); setState('connected'); setSecret(''); terminal.current?.focus(); resizeTerminal();
          recordDiagnostic('info', 'Interaktive SSH-Shell verbunden');
          if (temporaryCredentialId) setPendingCredentialId(temporaryCredentialId);
        } else if (message.type === 'error') {
          setError(message.message); setState('error'); recordDiagnostic('error', message.message, { code: message.code }); void loadAudit();
        } else if (message.type === 'exit') terminal.current?.writeln('\r\n\x1b[33m[SSH-Sitzung beendet]\x1b[0m');
      };
      webSocket.onerror = () => { if (!manualClose.current) { setError('SSH-WebSocket-Verbindung fehlgeschlagen.'); setState('error'); recordDiagnostic('error', 'SSH-WebSocket-Verbindung fehlgeschlagen'); void loadAudit(); } };
      webSocket.onclose = event => { socket.current = null; if (!manualClose.current) { setState(event.code === 1000 ? 'disconnected' : 'error'); recordDiagnostic(event.code === 1000 ? 'info' : 'error', 'SSH-WebSocket geschlossen', { code: event.code, reason: event.reason }); } };
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'SSH-Verbindungsfehler';
      setError(message); setState('error'); recordDiagnostic('error', 'SSH-Verbindungsaufbau fehlgeschlagen', { message }); void loadAudit();
    }
  };

  useEffect(() => {
    if (!terminalHost.current) return;
    const instance = new Terminal({ cursorBlink: true, scrollback: 10_000, fontFamily: 'Cascadia Mono, Consolas, ui-monospace, monospace', fontSize: 14, theme: { background: '#05070a', foreground: '#e8edf4', cursor: '#55b4ff', selectionBackground: '#2f6690' } });
    const fit = new FitAddon();
    instance.loadAddon(fit); instance.loadAddon(new WebLinksAddon()); instance.open(terminalHost.current);
    terminal.current = instance; fitAddon.current = fit; fit.fit();
    const dataSubscription = instance.onData(data => { if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: 'data', data })); });
    return () => { dataSubscription.dispose(); manualClose.current = true; socket.current?.close(); instance.dispose(); terminal.current = null; fitAddon.current = null; };
  }, []);
  useEffect(() => {
    if (!terminalHost.current) return;
    const observer = new ResizeObserver(() => requestAnimationFrame(resizeTerminal));
    observer.observe(terminalHost.current);
    if (active) requestAnimationFrame(() => { resizeTerminal(); terminal.current?.focus(); });
    return () => observer.disconnect();
  }, [active]);
  useEffect(() => {
    if (!active || !resource.hasSecret || state !== 'disconnected' || autoConnectAttempted.current) return;
    autoConnectAttempted.current = true; void connect();
  }, [active, resource.hasSecret, state]);
  useEffect(() => {
    const changed = () => { setFullscreen(document.fullscreenElement === remote.current); requestAnimationFrame(resizeTerminal); };
    document.addEventListener('fullscreenchange', changed); return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  useEffect(() => { setSelectedCredentialId(resource.credentialId ?? ''); setPendingCredentialId(null); }, [resource.credentialId]);

  return <div ref={remote} className="remote ssh-remote">
    <form className="viewer-toolbar" onSubmit={event => { event.preventDefault(); if (state !== 'connected') void connect(); }}>
      <span className={`status ${state}`}>{state === 'connected' ? 'Verbunden' : state === 'connecting' ? 'Verbinden …' : state === 'error' ? 'Fehler' : 'Getrennt'}</span>
      {state !== 'connected' && <><input aria-label="Passwort oder Private Key" type="password" value={secret} disabled={missingUsername || Boolean(selectedCredentialId)} onChange={event => setSecret(event.target.value)} placeholder={selectedCredentialId ? 'Gespeichertes Credential verwenden' : resource.hasSecret ? 'Gespeichertes Secret verwenden' : 'Passwort / Private Key'} /><button type="submit" disabled={state === 'connecting' || missingUsername}>{state === 'error' ? 'Erneut verbinden' : 'Verbinden'}</button></>}
      {state === 'connected' && <><span className="viewer-hint">Terminal: xterm.js · Einfügen direkt mit Strg+V</span><button type="button" onClick={() => void (fullscreen ? document.exitFullscreen() : remote.current?.requestFullscreen())}>{fullscreen ? 'Vollbild beenden' : 'Vollbild'}</button><button type="button" onClick={disconnect}>Trennen</button></>}
      <button type="button" onClick={() => { setDiagnosticsOpen(open => !open); if (!diagnosticsOpen) void loadAudit(); }}>{diagnosticsOpen ? 'Diagnose schließen' : 'Diagnose anzeigen'}</button>
      <button type="button" onClick={() => void downloadDiagnostics()}>Protokoll herunterladen</button>
    </form>
    {state !== 'connected' && <div className="remote-credential-picker"><label>Gespeicherte Zugangsdaten<select aria-label="Gespeicherte Zugangsdaten" value={selectedCredentialId} onChange={event=>{setSelectedCredentialId(event.target.value);setPendingCredentialId(null);setError('');}}><option value="">Keine / Secret eingeben</option>{resource.credentialId&&!compatibleCredentials.some(entry=>entry.id===resource.credentialId)&&<option value={resource.credentialId}>Aktuell zugeordnetes Credential</option>}{compatibleCredentials.map(credential=><option key={credential.id} value={credential.id}>{credential.name} · {credential.username}</option>)}</select></label></div>}
    {state === 'connected' && pendingCredentialId && <div className="remote-credential-confirm" role="dialog" aria-label="Credential dauerhaft zuordnen"><span>Die Verbindung mit <strong>{pendingCredential?.name ?? 'dem ausgewählten Credential'}</strong> war erfolgreich. Dauerhaft dieser Ressource zuordnen?</span><button type="button" disabled={assigningCredential} onClick={()=>setPendingCredentialId(null)}>Nur diesmal verwenden</button><button className="primary" type="button" disabled={assigningCredential} onClick={()=>void assignPendingCredential()}>{assigningCredential?'Wird zugeordnet …':'Dauerhaft zuordnen'}</button></div>}
    {missingUsername && <div role="alert" className="error">SSH-Benutzer fehlt. Bitte die Ressource bearbeiten und einen Benutzer oder globale Zugangsdaten hinterlegen.</div>}
    {error && <div role="alert" className="error">{error}</div>}
    {diagnosticsOpen && <section className="remote-diagnostics"><h3>Verbindungsdiagnose</h3><p className="muted">Browser-/Tunnelereignisse und Backend-Audit, ohne Secrets oder Sitzungstokens.</p><pre>{formatRemoteDiagnostics(resource, diagnostics, auditEvents, APP_VERSION, navigator.userAgent)}</pre></section>}
    <div ref={terminalHost} className="ssh-terminal" onPointerDown={() => terminal.current?.focus()} />
  </div>;
});
