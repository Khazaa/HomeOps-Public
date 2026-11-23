# Betrieb, Backup und Update

## Backup

1. Wartungsfenster ankündigen und neue Änderungen stoppen.
2. `docker compose exec -T postgres pg_dump -U homeops -Fc homeops > homeops.dump` ausführen.
3. `.env`/Deployment-Secrets, insbesondere `MASTER_KEY`, **getrennt** und verschlüsselt sichern.
4. Restore in eine frische PostgreSQL-Instanz testen: `pg_restore --clean --if-exists -U homeops -d homeops homeops.dump`.

Laufende SSH-/RDP-Verbindungen sind nicht Teil des Backups.

## Update

Repository committen, Datenbank und Schlüssel sichern, Images bauen (`docker compose build --pull`), dann `docker compose up -d`. Das Schema wird beim Start idempotent migriert. Anschließend `/health`, Login, Resource-Liste und je eine Testverbindung prüfen. Bei einem Rollback zuerst die Kompatibilität des Datenbankschemas prüfen.

Beim imagebasierten Deployment aus `deploy/` wird stattdessen ein freigegebener Versionstag in `HOMEOPS_IMAGE` eingetragen und mit `docker compose pull web && docker compose up -d web` aktualisiert. Keine fremde Installation darf `.env`, `MASTER_KEY`, Datenbankvolume oder Dumps einer anderen Installation übernehmen. Einzige Ausnahme ist ein bewusst durchgeführter Umzug; dabei muss der bisherige `MASTER_KEY` zusammen mit dem Datenbankdump übertragen werden, weil gespeicherte Credentials sonst nicht mehr entschlüsselbar sind.

## Releases und Verteilung

Ein Git-Tag `v*` löst in GitHub Actions den Multi-Arch-Build nach GHCR aus. Das Container-Paket muss in GitHub separat auf die gewünschte Sichtbarkeit gesetzt werden. Alternativ kann ein versionsgebundenes Image derselben CPU-Architektur per `docker save` exportiert und zusammen mit SHA-256-Prüfsumme sowie dem `deploy/`-Verzeichnis übertragen werden. Installationssecrets werden immer erst auf dem jeweiligen Zielsystem erzeugt.

## Reverse Proxy

TLS terminieren, WebSocket-Upgrades für `/api/v1/tunnel` erlauben, Querystrings dort nicht in Access-Logs schreiben und Request-/Response-Buffering deaktivieren. `X-Forwarded-Proto`/`Host` korrekt setzen. Weder Port 4822 noch 5432 veröffentlichen.
