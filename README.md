# HomeOps Hub

HomeOps Hub bündelt Weboberflächen, SSH-Terminals und RDP-Desktops in einer gemeinsamen, zustandserhaltenden Tab-Oberfläche. Die Anwendung ist für den selbst gehosteten Betrieb im LAN oder über ein VPN vorgesehen.

## Funktionen

- Web-, SSH- und RDP-Ressourcen in dauerhaft gemounteten Tabs
- Kategorien, Favoriten, Suche, Arbeitsbereiche und Verbindungsverlauf
- Erreichbarkeitsübersicht mit ausgefallenen Ressourcen und Diagnose
- Persönlicher Credential-Tresor für Web (HTTP Basic), SSH und RDP
- Direkte Anlage neuer Credentials im jeweiligen Ressourcendialog
- Direkte Anlage und Zuweisung neuer Gruppen im Ressourcendialog
- Netzwerkscanner für private IPv4-Netze bis `/23` mit Standard- und benutzerdefinierten Ports, Reverse-DNS-Namen, Duplikaterkennung, frei benennbaren Funden und selektiver Übernahme in eine Gruppe `Scan DD.MM.YYYY HH:mm`
- Optionaler täglicher Nacht-Scan im Container; neue, noch nicht eingetragene Systeme erscheinen zur bestätigten Übernahme auf der Übersicht
- SSH-Funde können ohne Benutzer übernommen und später vervollständigt werden; ohne Benutzer blockiert HomeOps den Verbindungsaufbau mit einem klaren Hinweis
- Beim Netzwerkscan lassen sich gespeicherte SSH-/RDP-Credentials direkt zuordnen; nach einem Verbindungsfehler kann ein anderes Credential temporär getestet werden, anschließend fragt HomeOps erst nach erfolgreicher Verbindung nach der optionalen dauerhaften Zuordnung
- Einblendbare SSH-/RDP-Verbindungsdiagnose mit bereinigtem Text-Download ohne Secrets, Private Keys oder Tokens
- Ressourcen-Vorschau mit Typ, Ziel, Benutzer, Tags und Beschreibung direkt in der Seitenleiste
- Ressourceneditor mit fest sichtbarem Titel und Aktionsleiste sowie einem separat scrollbaren Formularbereich; der Netzwerkscanner liegt im Benutzermenü oben rechts
- Verschlüsselte Speicherung von Secrets mit AES-256-GCM
- Mehrbenutzerbetrieb mit ressourcenbezogenen Freigaben
- Progressive Web App und responsive Oberfläche
- Verschlüsselter Konfigurationsexport ohne Secrets

## Voraussetzungen

- Docker Engine mit Compose v2
- Netzwerkzugriff der Docker-Container auf die gewünschten Zielsysteme

Ein Reverse Proxy ist nicht erforderlich. Für ein vollständig vertrauenswürdiges LAN kann HomeOps direkt per HTTP auf der LAN-IP des Dockerhosts laufen. HTTPS über einen Reverse Proxy bleibt optional.

## Installation mit Docker Compose

Für die Installation mit dem fertigen öffentlichen Image werden nur [`deploy/compose.yaml`](deploy/compose.yaml) und [`deploy/.env.example`](deploy/.env.example) benötigt:

```sh
mkdir homeops && cd homeops
curl -fsSLO https://raw.githubusercontent.com/Khazaa/HomeOps-Public/main/deploy/compose.yaml
curl -fsSL https://raw.githubusercontent.com/Khazaa/HomeOps-Public/main/deploy/.env.example -o .env.example
cp .env.example .env
```

Anschließend `.env` bearbeiten:

- `APP_ORIGIN`: exakte Browseradresse, beispielsweise `http://192.168.1.10:3000`
- `HOMEOPS_BIND_ADDRESS`: LAN-IP des Dockerhosts, im Beispiel `192.168.1.10`
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
curl http://192.168.1.10:3000/health
```

HomeOps anschließend exakt über die in `APP_ORIGIN` eingetragene Adresse öffnen. Im direkten LAN-Modus gelten `TRUST_PROXY=false` und `COOKIE_SECURE=false`. Es muss weder für HomeOps noch für jedes Zielgerät ein nginx-Eintrag angelegt werden. Die Firewall sollte Port 3000 nur für das eigene LAN oder VPN freigeben.

Optional kann HomeOps weiterhin hinter einem HTTPS-Reverse-Proxy betrieben werden. Dann `APP_ORIGIN` auf dessen HTTPS-Adresse, `HOMEOPS_BIND_ADDRESS=127.0.0.1`, `TRUST_PROXY=true` und `COOKIE_SECURE=true` setzen. Der Proxy muss WebSocket-Upgrades für `/api/v1/tunnel` erlauben.

Nach der ersten erfolgreichen Anmeldung `ADMIN_INITIAL_PASSWORD=` in `.env` setzen und den Web-Container neu erstellen:

```sh
docker compose up -d --force-recreate web
```

Jede Installation benötigt eigene Secrets und ein eigenes Admin-Kennwort. `.env`, `MASTER_KEY` und Datenbankdumps dürfen nicht weitergegeben oder eingecheckt werden.

## Schnellstart aus dem Quellcode

1. Repository klonen und `.env.example` nach `.env` kopieren.
2. Alle `CHANGE_ME`-Werte durch unabhängige Zufallswerte ersetzen.
3. `APP_ORIGIN` und `HOMEOPS_BIND_ADDRESS` auf die LAN-Adresse des Dockerhosts setzen.
4. `docker compose up -d --build` ausführen.
5. Mit dem einmaligen Admin-Kennwort anmelden.
6. `ADMIN_INITIAL_PASSWORD` aus `.env` entfernen und den Web-Container neu erstellen:

   ```sh
   docker compose up -d --force-recreate web
   ```

Es gibt kein Standard-Adminpasswort. `ADMIN_INITIAL_PASSWORD` wird ausschließlich bei einer leeren Datenbank für das erste Konto verwendet. PostgreSQL und guacd besitzen keinen Hostport.

Ein Deployment ohne lokalen Build ist im Verzeichnis [`deploy/`](deploy/README.md) beschrieben.

## Ressourcen

### Web

Webseiten können eingebettet, automatisch eingebettet oder extern geöffnet werden. Im direkten HTTP-LAN-Modus bleiben konfigurierte HTTP-Ziele HTTP; HomeOps stuft sie nicht auf HTTPS hoch. Auch HTTPS-Ziele können eingebettet werden, sofern ihr Zertifikat im Browser akzeptiert wird. HomeOps umgeht keine `X-Frame-Options`- oder CSP-Vorgaben der Zielseite.

Für HTTP-Basic-Ziele im LAN steht ein isolierter Backend-Proxy zur Verfügung. Zugangsdaten bleiben im Backend und erscheinen weder in der URL noch im Browser. Komplexe Anwendungen mit WebSockets, Cross-Origin-XHR oder sitzungsabhängigen Cookies können in diesem Modus eingeschränkt sein.

### SSH

SSH unterstützt Passwort und Private Key. Die Host-Key-Prüfung ist standardmäßig aktiv und erwartet einen Eintrag im OpenSSH-`known_hosts`-Format. Ein geänderter Schlüssel wird abgelehnt.

Text aus der lokalen Zwischenablage kann in verbundenen SSH- und RDP-Tabs mit `Strg+V` oder `Strg+Shift+V` eingefügt werden. SSH und RDP passen ihre Remote-Anzeige an Größenänderungen des Tabs an. Die Bedienung ist für aktuelle Versionen von Firefox, Chrome und Edge ausgelegt.

### RDP

RDP unterstützt Benutzername, Passwort, Domäne, unterschiedliche Sicherheitsmodi und das Tastaturlayout der Windows-Sitzung. Das gewählte Layout wird als Guacamole-`server-layout` an die Verbindung übergeben und gilt nach dem Neuverbinden. Die Zertifikatsprüfung ist standardmäßig aktiv.

Bei allen drei Ressourcentypen kann ein vorhandenes Credential gewählt oder direkt im Ressourcendialog neu angelegt werden. Secrets lassen sich alternativ erst beim Verbindungsaufbau eingeben.

## Sicherheit

HomeOps ist für LAN/VPN ausgelegt und unterstützt direkten HTTP-Betrieb oder optional einen HTTPS-Reverse-Proxy. Bei HTTP sind Anmeldung und eingegebene Zugangsdaten auf dem Transportweg im LAN unverschlüsselt. Wichtige Betriebsgrenzen stehen in [SECURITY.md](SECURITY.md). Insbesondere gehören `.env`, `MASTER_KEY`, Datenbankdumps und Zugangsdaten niemals in Git.

Die normale Browseroberfläche funktioniert per HTTP. PWA-Installation und Service Worker erfordern außerhalb von `localhost` dagegen HTTPS.

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
