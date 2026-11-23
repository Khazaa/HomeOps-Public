import { memo, useRef } from 'react';
import type { Resource } from './types';

export const WebTab = memo(function WebTab({ resource }: { resource: Resource }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const url = String(resource.config.url);
  const mode = String(resource.config.mode ?? 'auto');
  const basicAuth = resource.config.authType === 'basic' && Boolean(resource.credentialId);
  const displayUrl = basicAuth ? `/api/v1/resources/${encodeURIComponent(resource.id)}/web-proxy/` : url;
  const sandbox = basicAuth ? 'allow-forms allow-modals allow-popups allow-scripts' : String(resource.config.sandbox ?? 'allow-forms allow-modals allow-popups allow-scripts allow-same-origin');
  return <div className="webtab">
    <div className="viewer-toolbar">
      <span>{basicAuth ? 'HTTP Basic wird geschützt über HomeOps bereitgestellt.' : 'Einbettung kann durch die Zielseite blockiert sein.'}</span>
      {basicAuth
        ? <button onClick={() => { if (frameRef.current) frameRef.current.src = displayUrl; }}>Neu laden</button>
        : <button onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>Extern öffnen</button>}
    </div>
    {mode === 'external' && !basicAuth
      ? <div className="empty"><p>Diese Ressource ist für externe Anzeige konfiguriert.</p><button onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>In neuem Browser-Tab öffnen</button></div>
      : <iframe ref={frameRef} title={resource.name} src={displayUrl} sandbox={sandbox} referrerPolicy="no-referrer" />}
  </div>;
});
