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

## Installation mit Docker Compose

Für die Installation mit dem fertigen öffentlichen Image werden nur [`deploy/compose.yaml`](deploy/compose.yaml) und [`deploy/.env.example`](deploy/.env.example) benötigt:

```sh
mkdir homeops && cd homeops
curl -fsSLO https://raw.githubusercontent.com/Khazaa/HomeOps-Public/main/deploy/compose.yaml
curl -fsSL https://raw.githubusercontent.com/Khazaa/HomeOps-Public/main/deploy/.env.example -o .env.example
cp .env.example .env
```

Anschließend `.env` bearbeiten:

- `APP_ORIGIN`: exakte öffentliche HTTPS-Adresse, beispielsweise `https://homeops.example.lan`
- `HOMEOPS_BIND_ADDRESS`: `127.0.0.1`, wenn der Reverse Proxy lokal läuft; andernfalls die LAN-IP des Dockerhosts
- `POSTGRES_PASSWORD`: langes, zufälliges Datenbankkennwort
- `MASTER_KEY`: exakt 32 Zufallsbytes als Base64url ohne Padding (43 Zeichen)
- `GUAC_TOKEN_KEY`: mindestens 32 zufällige Zeichen, unabhängig vom Master-Key
- `ADMIN_INITIAL_PASSWORD`: individuelles initiales Admin-Kennwort mit mindestens 12 Zeichen

Mit OpenSSL lassen sich geeignete Werte erzeugen. Den Befehl für jedes Secret separat ausführen und keinen Wert wiederverwenden:

```sh
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'
```

Unter Windows lässt sich derselbe 43 Zeichen lange Base64url-Wert in PowerShell erzeugen:

```powershell
$bytes = [byte[]]::new(32)
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
```

Alternativ als PowerShell-Einzeiler:

```powershell
$b=[byte[]]::new(32); [Security.Cryptography.RandomNumberGenerator]::Fill($b); [Convert]::ToBase64String($b).TrimEnd('=').Replace('+','-').Replace('/','_')
```

Den ausgegebenen Wert ohne Anführungszeichen eintragen, beispielsweise als `MASTER_KEY=erzeugter_Wert`. Für `POSTGRES_PASSWORD`, `MASTER_KEY` und `GUAC_TOKEN_KEY` jeweils einen neuen, unabhängigen Wert erzeugen. Den `MASTER_KEY` anschließend sicher sichern; ohne ihn lassen sich gespeicherte Credentials nicht wiederherstellen.

Danach starten:

```sh
docker compose pull
docker compose up -d
docker compose ps
curl http://127.0.0.1:3000/health
```

Der HTTPS-Reverse-Proxy muss auf `${HOMEOPS_BIND_ADDRESS}:3000` zeigen und WebSocket-Upgrades für `/api/v1/tunnel` erlauben. Läuft er auf einem anderen Host, sollte eine Firewall Port 3000 ausschließlich für dessen IP freigeben. `APP_ORIGIN` bleibt die externe HTTPS-Adresse und darf keinen abschließenden Schrägstrich enthalten. Nach der ersten erfolgreichen Anmeldung `ADMIN_INITIAL_PASSWORD=` in `.env` setzen und den Web-Container neu erstellen:

```sh
docker compose up -d --force-recreate web
```

Jede Installation benötigt eigene Secrets und ein eigenes Admin-Kennwort. `.env`, `MASTER_KEY` und Datenbankdumps dürfen nicht weitergegeben oder eingecheckt werden.

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

HomeOps Hub ist unter der [MIT-Lizenz](LICENSE) veröffentlicht.
