# Tests

## Automatisierte Tests

Die Unit- und Komponententests prüfen unter anderem:

- Verschlüsselung und Entschlüsselung gespeicherter Secrets
- Zielhost-, Origin- und Berechtigungsprüfungen
- LAN-Begrenzung und URL-Umschreibung des HTTP-Basic-Proxys
- dauerhaft gemountete Tabs und isolierte Web-Proxys
- TypeScript im Strict-Modus und die Produktionsbuilds

Alle Standardprüfungen werden im Repository-Stamm ausgeführt:

```sh
npm run typecheck
npm test
npm run build
```

## Optionale Browser- und Protokolltests

Das Compose-Profil `acceptance` ergänzt isolierte SSH- und RDP-Testziele. Vor dem Start muss ein ausschließlich dafür verwendetes SSH-Testkennwort gesetzt werden:

```sh
export HOMEOPS_TEST_SSH_PASSWORD='ein-langes-einmaliges-testkennwort'
docker compose --profile acceptance up -d --build
```

Für Playwright werden zusätzlich die Zugangsdaten der lokalen Testinstallation benötigt:

```sh
export HOMEOPS_TEST_PASSWORD='admin-testkennwort'
export HOMEOPS_NOACCESS_PASSWORD='testkennwort-des-benutzers-ohne-freigabe'
cd apps/frontend
npx playwright test
```

Die E2E-Suite setzt eine ausschließlich für Tests vorgesehene Installation voraus. Sie erzeugt, verändert und entfernt Testressourcen und darf nicht gegen eine produktive Datenbank ausgeführt werden.

Vor einer Veröffentlichung sollten außerdem mindestens Login, Ressourcenverwaltung, ein Webtab, eine SSH-Verbindung, eine RDP-Verbindung, Backup/Restore und das Verhalten nach einem Container-Neustart manuell geprüft werden.
