# HomeOps Hub – Architektur

## Systemgrenzen

```text
Browser (React, guacamole-common-js)
  | HTTPS / WSS, HttpOnly-Sessioncookie, CSRF
  v
HomeOps API (Fastify)
  |-- PostgreSQL (Benutzer, gehashte Sessions, ACL, Metadaten, AEAD-Secrets)
  |-- kurzlebige Verbindungstickets
  `-- authentifizierter Guacamole-WebSocket-Gateway
         |
         v
       guacd:4822 (nur internes Compose-Netz; separates Ziel-Egress ohne Hostport)
         |-- SSH-Ziel
         `-- RDP-Ziel
```

Der Browser kann kein frei gewähltes Ziel an den Tunnel übergeben. Eine Verbindung beginnt immer bei `POST /api/v1/resources/:id/connect`; dort werden Sitzung, CSRF, Resource-ACL, Host-/Portvalidierung und Secret-Zugriff geprüft. Der zurückgegebene Ticketwert ist kurzlebig, einmal verwendbar und enthält keine Klartext-Credentials. Der WebSocket-Upgrade prüft zusätzlich Cookie, Origin und Ticketbindung.

## Tab-Lebensdauer

`TabWorkspace` rendert **alle** offenen Tabs mit stabiler `tab.id` gleichzeitig. Inaktive Panels erhalten nur `hidden`/CSS-Sichtbarkeit; iframe und Guacamole-Client werden nicht unmountet. Beim erneuten Anzeigen und bei Größenänderungen passt ein `ResizeObserver` die Guacamole-Anzeige proportional an den gesamten verfügbaren Bereich an; RDP erhält zusätzlich `display-update` und neue Zielmaße. `sessionStorage`/`localStorage` enthalten ausschließlich Tab-IDs und UI-Metadaten, niemals Tokens oder Secrets. Nach Browser-Reload werden Definitionen rekonstruiert, Remoteverbindungen bleiben explizit getrennt und verlangen einen neuen Connect.

## Daten und Autorisierung

PostgreSQL ist die persistente Quelle. Ressourcenabfragen sind auf Eigentümer oder explizite Freigaben begrenzt. `resources.config` enthält nur nicht geheime Verbindungsdaten. `secrets.payload` wird mit AES-256-GCM und einem außerhalb der Datenbank bereitgestellten Master-Key verschlüsselt. Sitzungskennungen werden nur als SHA-256-Hash gespeichert.

## Deployment

Nur `web` wird nach außen veröffentlicht. PostgreSQL und der guacd-Steuerkanal liegen in einem internen Docker-Netz. `guacd` besitzt zusätzlich das nicht veröffentlichte Netz `target_egress`, damit registrierte SSH-/RDP-Ziele im LAN erreichbar sind; dies öffnet keinen eingehenden Hostport. Produktion setzt TLS am Reverse Proxy voraus. Healthchecks prüfen Bereitschaft ohne sensible Diagnosedaten. Persistente Volumes sichern PostgreSQL; laufende SSH/RDP-Verbindungen sind bewusst nicht neustartfest.
