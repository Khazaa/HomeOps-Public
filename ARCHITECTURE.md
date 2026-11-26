# HomeOps Hub – Architektur

## Systemgrenzen

```text
Browser (React, xterm.js für SSH, guacamole-common-js für RDP)
  | HTTPS / WSS, HttpOnly-Sessioncookie, CSRF
  v
HomeOps API (Fastify)
  |-- PostgreSQL (Benutzer, gehashte Sessions, ACL, Metadaten, AEAD-Secrets)
  |-- kurzlebige Verbindungstickets
  |-- authentifizierter SSH-WebSocket -> ssh2 -> SSH-Ziel
  `-- authentifizierter Guacamole-WebSocket-Gateway
         `-- guacd:4822 -> RDP-Ziel
```

Der Browser kann kein frei gewähltes Ziel an den Tunnel übergeben. Eine Verbindung beginnt immer bei `POST /api/v1/resources/:id/connect`; dort werden Sitzung, CSRF, Resource-ACL, Host-/Portvalidierung und Secret-Zugriff geprüft. Der zurückgegebene Ticketwert ist kurzlebig, einmal verwendbar und enthält keine Klartext-Credentials. Der WebSocket-Upgrade prüft zusätzlich Cookie, Origin und Ticketbindung.

## Tab-Lebensdauer

`TabWorkspace` rendert **alle** offenen Tabs mit stabiler `tab.id` gleichzeitig. Inaktive Panels erhalten nur `hidden`/CSS-Sichtbarkeit; iframe, xterm.js-Terminal, SSH-WebSocket und Guacamole-Client werden nicht unmountet. Beim erneuten Anzeigen und bei Größenänderungen passt ein `ResizeObserver` das xterm-PTY bzw. die Guacamole-Anzeige an; RDP erhält zusätzlich `display-update`. `sessionStorage`/`localStorage` enthalten ausschließlich Tab-IDs und UI-Metadaten, niemals Tokens oder Secrets. Nach Browser-Reload werden Definitionen rekonstruiert, Remoteverbindungen bleiben explizit getrennt und verlangen einen neuen Connect.

## Daten und Autorisierung

PostgreSQL ist die persistente Quelle. Ressourcenabfragen sind auf Eigentümer oder explizite Freigaben begrenzt. `resources.config` enthält nur nicht geheime Verbindungsdaten. `secrets.payload` wird mit AES-256-GCM und einem außerhalb der Datenbank bereitgestellten Master-Key verschlüsselt. Sitzungskennungen werden nur als SHA-256-Hash gespeichert.

## Deployment

Nur `web` wird nach außen veröffentlicht. Der darin laufende SSH-Client und `guacd` besitzen über `target_egress` ausgehenden Zugriff auf registrierte LAN-Ziele; PostgreSQL und der guacd-Steuerkanal bleiben intern und kein zusätzlicher Hostport wird geöffnet. Produktion setzt TLS am Reverse Proxy voraus. Healthchecks prüfen Bereitschaft ohne sensible Diagnosedaten. Persistente Volumes sichern PostgreSQL; laufende SSH/RDP-Verbindungen sind bewusst nicht neustartfest.
