# HomeOps ohne lokalen Build deployen

Dieses Verzeichnis enthält das eigenständige Deployment-Paket. Benötigt werden nur Docker Engine, Compose v2 und ein Image für `amd64` oder `arm64`. Ein Reverse Proxy ist optional.

Für einfache Updates wird `ghcr.io/khazaa/homeops-public:latest` verwendet. Reproduzierbare Installationen und Rollbacks können stattdessen einen festen Versionstag wie `ghcr.io/khazaa/homeops-public:v0.1.3` in `.env` setzen.

## Neuinstallation

1. Dieses Verzeichnis auf den Dockerhost kopieren.
2. `chmod +x bootstrap.sh && ./bootstrap.sh` ausführen. Für direkten LAN-Betrieb als URL beispielsweise `http://192.168.1.10:3000` und als Bind-Adresse `192.168.1.10` eintragen. Das Skript verwendet automatisch das aktuelle öffentliche Image, fragt ein individuelles initiales Admin-Kennwort ab und erzeugt alle Secrets selbst. Alternativ `.env.example` nach `.env` kopieren und alle `CHANGE_ME`-Werte ersetzen.
3. `docker compose pull && docker compose up -d` ausführen.
4. `docker compose ps` und `curl http://192.168.1.10:3000/health` prüfen (IP entsprechend ersetzen).
5. HomeOps über die als `APP_ORIGIN` eingetragene URL öffnen. Die Firewall sollte Port 3000 ausschließlich für das eigene LAN oder VPN freigeben.
6. Erfolgreich anmelden, danach `ADMIN_INITIAL_PASSWORD=` in `.env` setzen und `docker compose up -d --force-recreate web` ausführen.

Jede Installation erzeugt eine eigene Datenbank und eigene Secrets. `.env`, Datenbankdumps und `MASTER_KEY` dürfen nicht zwischen unabhängigen Installationen geteilt oder eingecheckt werden.

Der veröffentlichte Port bindet gezielt an `HOMEOPS_BIND_ADDRESS`; `0.0.0.0` wird vom Bootstrap-Skript nicht akzeptiert. PostgreSQL und guacd besitzen keinen Hostport. Im HTTP-Modus sind Anmeldung und eingegebene Zugangsdaten auf dem LAN-Transportweg unverschlüsselt.

Optional kann ein HTTPS-Reverse-Proxy verwendet werden. Dann `APP_ORIGIN` auf dessen HTTPS-Adresse, `HOMEOPS_BIND_ADDRESS=127.0.0.1`, `TRUST_PROXY=true` und `COOKIE_SECURE=true` setzen. Der Proxy muss WebSocket-Upgrades für `/api/v1/tunnel` und `/api/v1/ssh` erlauben. Für die eingebundenen Zielgeräte werden keine eigenen Proxy-Einträge benötigt.

## Update

Vor jedem Update Datenbank und `MASTER_KEY` sichern. Bei `latest` sind keine Änderungen an `.env` nötig; bei festen Versionen `HOMEOPS_IMAGE` auf den gewünschten Tag setzen. Anschließend ausführen:

```sh
docker compose pull web
docker compose up -d web
docker compose ps
curl http://192.168.1.10:3000/health
```

## Bestehende Installation umziehen

Auf dem bisherigen Host:

```sh
docker compose exec -T postgres pg_dump -U homeops -Fc homeops > homeops.dump
```

Den Dump und den bisherigen `MASTER_KEY` verschlüsselt auf den neuen Host übertragen. Ohne denselben Schlüssel können gespeicherte Credentials nicht entschlüsselt werden.

Auf dem neuen Host die leere Installation starten und anschließend:

```sh
docker compose stop web
docker compose exec -T postgres pg_restore --clean --if-exists -U homeops -d homeops < homeops.dump
docker compose start web
docker compose ps
```

Erst nach erfolgreicher Prüfung die bisherige Adresse beziehungsweise optional DNS/Reverse Proxy umschalten. Alte und neue Instanz dürfen danach nicht parallel beschrieben werden.
