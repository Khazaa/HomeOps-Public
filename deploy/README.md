# HomeOps ohne lokalen Build deployen

Dieses Verzeichnis enthält das eigenständige Deployment-Paket. Benötigt werden Docker Engine, Compose v2, ein HTTPS-Reverse-Proxy und ein Image für `amd64` oder `arm64`.

Veröffentlichte Versionen verwenden `ghcr.io/khazaa/homeops-public:<version>`, beispielsweise `ghcr.io/khazaa/homeops-public:v0.1.0`.

## Neuinstallation

1. Dieses Verzeichnis auf den Dockerhost kopieren.
2. `chmod +x bootstrap.sh && ./bootstrap.sh` ausführen. Das Skript verwendet automatisch das öffentliche Image `v0.1.0`, fragt nur die externe HTTPS-URL und ein individuelles initiales Admin-Kennwort ab und erzeugt alle weiteren Secrets selbst. Alternativ `.env.example` nach `.env` kopieren und alle `CHANGE_ME`-Werte ersetzen.
3. `docker compose pull && docker compose up -d` ausführen.
4. `docker compose ps` und `curl http://127.0.0.1:3000/health` prüfen.
5. Den HTTPS-Reverse-Proxy auf `127.0.0.1:3000` zeigen lassen und WebSocket-Upgrades für `/api/v1/tunnel` erlauben.
6. Erfolgreich anmelden, danach `ADMIN_INITIAL_PASSWORD=` in `.env` setzen und `docker compose up -d --force-recreate web` ausführen.

Jede Installation erzeugt eine eigene Datenbank und eigene Secrets. `.env`, Datenbankdumps und `MASTER_KEY` dürfen nicht zwischen unabhängigen Installationen geteilt oder eingecheckt werden.

Der veröffentlichte Port bindet ausschließlich an Loopback. PostgreSQL und guacd besitzen keinen Hostport.

## Update

Vor jedem Update Datenbank und `MASTER_KEY` sichern. Anschließend `HOMEOPS_IMAGE` in `.env` auf einen freigegebenen Versionstag setzen und ausführen:

```sh
docker compose pull web
docker compose up -d web
docker compose ps
curl http://127.0.0.1:3000/health
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

Erst nach erfolgreicher Prüfung DNS beziehungsweise Reverse Proxy umschalten. Alte und neue Instanz dürfen danach nicht parallel beschrieben werden.
