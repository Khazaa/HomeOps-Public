import { memo, useEffect, useRef, useState } from 'react';
import type { Resource } from './types';

export const WebTab = memo(function WebTab({ resource }: { resource: Resource }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const url = String(resource.config.url);
  const mode = String(resource.config.mode ?? 'auto');
  const basicAuth = resource.config.authType === 'basic' && Boolean(resource.credentialId);
  const compatibilityProxy = mode === 'proxy';
  const proxied = basicAuth || compatibilityProxy;
  const displayUrl = proxied ? `/api/v1/resources/${encodeURIComponent(resource.id)}/web-proxy/` : url;
  const sandbox = proxied ? 'allow-forms allow-modals allow-popups allow-scripts allow-downloads' : String(resource.config.sandbox ?? 'allow-forms allow-modals allow-popups allow-scripts allow-same-origin');
  const embedded = mode !== 'external' || proxied;
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  return <div className="webtab" ref={containerRef}>
    <div className="viewer-toolbar">
      <span>{basicAuth ? 'HTTP Basic wird geschützt über HomeOps bereitgestellt.' : compatibilityProxy ? 'Experimenteller Kompatibilitätsproxy ist aktiv.' : 'Einbettung kann durch die Zielseite blockiert sein.'}</span>
      {proxied && <button onClick={() => { if (frameRef.current) frameRef.current.src = displayUrl; }}>Neu laden</button>}
      {embedded && <button type="button" onClick={() => void (fullscreen ? document.exitFullscreen() : containerRef.current?.requestFullscreen?.())}>{fullscreen ? 'Vollbild beenden' : 'Vollbild'}</button>}
      <button onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>Extern öffnen</button>
    </div>
    {mode === 'external' && !proxied
      ? <div className="empty"><p>Diese Ressource ist für externe Anzeige konfiguriert.</p><button onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>In neuem Browser-Tab öffnen</button></div>
      : <iframe ref={frameRef} title={resource.name} src={displayUrl} sandbox={sandbox} referrerPolicy="no-referrer" />}
  </div>;
});
