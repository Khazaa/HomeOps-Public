import { memo, useEffect, useRef, useState } from 'react';
import Guacamole from 'guacamole-common-js';
import { api } from './api';
import { sendClipboardText } from './remoteClipboard';
import { RemoteKeyboardController } from './remoteKeyboard';
import { sendRemoteSize } from './remoteSize';
import type { Resource } from './types';

type State = 'disconnected' | 'connecting' | 'connected' | 'error';

export const RemoteTab = memo(function RemoteTab({ resource, active }: { resource: Resource; active: boolean }) {
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
    releaseInput();
    client.current?.disconnect();
    client.current = null;
    setState('disconnected');
    if (host.current) host.current.replaceChildren();
  };

  const connect = async () => {
    if (!host.current) return;
    setState('connecting');
    setError('');
    try {
      const rect = host.current.getBoundingClientRect();
      const ticket = await api.connect(resource.id, secret || undefined, Math.max(640, Math.floor(rect.width)), Math.max(400, Math.floor(rect.height)));
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      const tunnel = new Guacamole.WebSocketTunnel(`${scheme}://${location.host}/api/v1/tunnel`);
      const guac = new Guacamole.Client(tunnel);
      const display = guac.getDisplay();
      const displayElement = display.getElement();
      client.current = guac;
      host.current.replaceChildren(displayElement);
      display.onresize = () => requestAnimationFrame(fitDisplay);
      guac.onerror = (status: any) => { setError(status?.message ?? 'Remote-Verbindungsfehler'); setState('error'); };
      guac.onstatechange = (nextState: number) => {
        if (nextState === 3) { setState('connected'); requestAnimationFrame(fitDisplay); }
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
      setError(reason instanceof Error ? reason.message : 'Verbindungsfehler');
      setState('error');
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

  return <div ref={remote} className="remote">
    <form className="viewer-toolbar" onSubmit={event => { event.preventDefault(); if (state !== 'connected') void connect(); }}>
      <span className={`status ${state}`}>{state === 'connected' ? 'Verbunden' : state === 'connecting' ? 'Verbinden …' : state === 'error' ? 'Fehler' : 'Getrennt'}</span>
      {state !== 'connected' && <><input aria-label="Passwort oder Private Key" type="password" value={secret} onChange={event => setSecret(event.target.value)} placeholder={resource.hasSecret ? 'Gespeichertes Secret verwenden' : 'Passwort / Private Key'} /><button type="submit" disabled={state === 'connecting'}>{state === 'error' ? 'Erneut verbinden' : 'Verbinden'}</button></>}
      {state === 'connected' && <><span className="viewer-hint">Einfügen: Strg+V / Strg+Shift+V</span><button type="button" onClick={() => void (fullscreen ? document.exitFullscreen() : remote.current?.requestFullscreen())}>{fullscreen ? 'Vollbild beenden' : 'Vollbild'}</button><button type="button" onClick={disconnect}>Trennen</button></>}
    </form>
    {error && <div role="alert" className="error">{error}</div>}
    <div ref={host} className="remote-display" tabIndex={0} onPointerDown={event => event.currentTarget.focus()} />
    <textarea ref={clipboardCapture} className="remote-clipboard-capture" aria-label="Remote-Zwischenablage" tabIndex={-1} />
  </div>;
});
