# HomeOps Hub

HomeOps Hub bündelt Weboberflächen, SSH-Terminals und RDP-Desktops in einer gemeinsamen, zustandserhaltenden Tab-Oberfläche. Die Anwendung ist für den selbst gehosteten Betrieb im LAN oder über ein VPN vorgesehen.

## Funktionen

- Web-, SSH- und RDP-Ressourcen in dauerhaft gemounteten Tabs
- Kategorien, Favoriten, Suche, Arbeitsbereiche und Verbindungsverlauf
- Erreichbarkeitsübersicht mit ausgefallenen Ressourcen und Diagnose
- Persönlicher Credential-Tresor für Web (HTTP Basic), SSH und RDP
- Direkte Anlage neuer Credentials im jeweiligen Ressourcendialog
- Verschlüsselte Speicherung von Secrets mit AES-256-GCM
- Mehrbenutzerbetrieb mit ressourcenbezogenen Freigaben
- Progressive Web App und responsive Oberfläche
- Verschlüsselter Konfigurationsexport ohne Secrets

## Voraussetzungen

- Docker Engine mit Compose v2
- HTTPS-Reverse-Proxy
- Netzwerkzugriff der Docker-Container auf die gewünschten Zielsysteme

## Schnellstart aus dem Quellcode

1. Repository klonen und `.env.example` nach `.env` kopieren.
2. Alle `CHANGE_ME`-Werte durch unabhängige Zufallswerte ersetzen.
3. `APP_ORIGIN` auf die exakte externe HTTPS-Adresse setzen.
4. `docker compose up -d --build` ausführen.
5. Mit dem einmaligen Admin-Kennwort anmelden.
6. `ADMIN_INITIAL_PASSWORD` aus `.env` entfernen und den Web-Container neu erstellen:

   ```sh
   docker compose up -d --force-recreate web
   ```

Es gibt kein Standard-Adminpasswort. `ADMIN_INITIAL_PASSWORD` wird ausschließlich bei einer leeren Datenbank für das erste Konto verwendet. Der Webport lauscht standardmäßig nur auf `127.0.0.1:3000`; PostgreSQL und guacd besitzen keinen Hostport.

Ein Deployment ohne lokalen Build ist im Verzeichnis [`deploy/`](deploy/README.md) beschrieben.

## Ressourcen

### Web

Webseiten können eingebettet, automatisch eingebettet oder extern geöffnet werden. HomeOps umgeht keine `X-Frame-Options`- oder CSP-Vorgaben der Zielseite.

Für HTTP-Basic-Ziele im LAN steht ein isolierter Backend-Proxy zur Verfügung. Zugangsdaten bleiben im Backend und erscheinen weder in der URL noch im Browser. Komplexe Anwendungen mit WebSockets, Cross-Origin-XHR oder sitzungsabhängigen Cookies können in diesem Modus eingeschränkt sein.

### SSH

SSH unterstützt Passwort und Private Key. Die Host-Key-Prüfung ist standardmäßig aktiv und erwartet einen Eintrag im OpenSSH-`known_hosts`-Format. Ein geänderter Schlüssel wird abgelehnt.

### RDP

RDP unterstützt Benutzername, Passwort, Domäne und unterschiedliche Sicherheitsmodi. Die Zertifikatsprüfung ist standardmäßig aktiv.

Bei allen drei Ressourcentypen kann ein vorhandenes Credential gewählt oder direkt im Ressourcendialog neu angelegt werden. Secrets lassen sich alternativ erst beim Verbindungsaufbau eingeben.

## Sicherheit

HomeOps ist für LAN/VPN und einen vorgeschalteten HTTPS-Reverse-Proxy ausgelegt. Wichtige Betriebsgrenzen und das Bedrohungsmodell stehen in [SECURITY.md](SECURITY.md). Insbesondere gehören `.env`, `MASTER_KEY`, Datenbankdumps und Zugangsdaten niemals in Git.

## Entwicklung

Benötigt werden Node.js 22 und PostgreSQL. Die Abhängigkeiten werden pro Anwendung installiert:

```sh
cd apps/backend
npm install --workspaces=false
cd ../frontend
npm install --workspaces=false
cd ../..
npm run typecheck
npm test
npm run build
```

Weitere Hinweise:

- [ARCHITECTURE.md](ARCHITECTURE.md) – Komponenten und Sicherheitsgrenzen
- [TESTING.md](TESTING.md) – automatisierte und optionale E2E-Tests
- [OPERATIONS.md](OPERATIONS.md) – Backup, Update und Reverse Proxy

## Lizenz

Für dieses Repository ist derzeit keine Open-Source-Lizenz hinterlegt. Die öffentliche Sichtbarkeit allein erteilt keine darüber hinausgehenden Nutzungsrechte.
