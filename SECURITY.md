# Sicherheit

## Betriebsmodell

HomeOps ist standardmäßig nur für LAN/VPN und einen vorgeschalteten HTTPS-Reverse-Proxy vorgesehen. Compose bindet den Webport ausschließlich an `127.0.0.1`; PostgreSQL und guacd werden gar nicht am Host veröffentlicht. `APP_ORIGIN` muss exakt der öffentlichen HTTPS-Origin entsprechen.

## Identität und Sitzungen

Passwörter werden mit Argon2id gehasht. Das initiale Adminpasswort kommt nur aus der Umgebung und muss nach dem ersten Start entfernt werden. Angemeldete Benutzer können ihr eigenes Kennwort nur unter Angabe des aktuellen Kennworts ändern; danach werden alle anderen Sitzungen dieses Kontos widerrufen. Die zufällige Session-ID liegt als `HttpOnly`, `Secure`- und `SameSite=Strict`-Cookie im Browser und nur gehasht in PostgreSQL. `COOKIE_SECURE=false` ist ausschließlich für lokale HTTP-Acceptance-Tests zulässig; Produktion behält den Default `true`. Zustandsänderungen erfordern zusätzlich das sitzungsgebundene CSRF-Token und eine passende Origin. Login und Kennwortänderung sind rate-limitiert.

## Secrets

Gespeicherte Ziel-Credentials werden mit AES-256-GCM authentifiziert verschlüsselt. Der 32-Byte-`MASTER_KEY` liegt ausschließlich in der Deployment-Umgebung und gehört getrennt vom Datenbankbackup gesichert. Ein Schlüsselverlust macht Secrets unlesbar. Rotation: neuen Schlüssel bereitstellen, Secrets in einem Wartungsfenster entschlüsseln/neu verschlüsseln, `key_version` erhöhen, alten Schlüssel erst nach geprüftem Backup löschen. API-GET-Antworten enthalten nur `hasSecret`.

## Remote-Tunnel

Nur registrierte und autorisierte Ressourcen erzeugen Tickets. Tickets sind verschlüsselt, 30 Sekunden gültig, einmal verwendbar und an Benutzer-ID, aktive Session sowie exakte Origin gebunden. Die WebSocket-URL enthält verschlüsselten Tickettext; Reverse Proxies dürfen Querystrings dieses Endpunkts nicht loggen. guacd besitzt keinen veröffentlichten Port; sein separates Egress-Netz dient ausschließlich ausgehenden Verbindungen zu registrierten Zielhosts. Logout sperrt neue Handshakes; offene WebSockets werden beim Browser-Logout durch die SPA getrennt, ein Proxy sollte zusätzlich kurze Idle-/Session-Limits erzwingen.

SSH-Host-Keys werden nicht automatisch ersetzt. Die Prüfung ist bei neuen SSH-Ressourcen standardmäßig aktiv; ein Wechsel blockiert und muss administrativ geprüft werden. Sie kann pro Ressource bewusst deaktiviert werden, wobei die UI vor dem fehlenden Identitätsnachweis warnt. Für produktive oder nicht vollständig vertrauenswürdige Netze soll `hostKeyFingerprint` gesetzt bleiben. RDP-Zertifikatsprüfung bleibt standardmäßig aktiv. `ignoreCertificate` ist eine bewusste, ressourcenspezifische Ausnahme und kein globaler Schalter.

Globale Credentials sind benutzerbezogen und ihre Secrets werden wie ressourceneigene Secrets AEAD-verschlüsselt gespeichert. Ressourcen enthalten nur eine Credential-ID; REST-Listen liefern ausschließlich ID, Bezeichnung, Benutzername, Typ und Zeitstempel. Der Secret-Payload wird weder zurückgegeben noch beim Zuweisen kopiert. Die API verhindert fremde Credential-IDs und Typkonflikte zwischen Passwort und Private Key. Ein zugewiesenes globales Credential liefert beim Verbindungsaufbau Benutzername und Secret und hat Vorrang vor eventuell älteren ressourceneigenen Werten.

Der Verbindungsverlauf speichert ausschließlich Benutzer-ID, Ressource, Protokoll, Zeitpunkt und einen technischen Ergebniscode. Secrets, Guacamole-Tickets, Zielpasswörter und übertragene Sitzungsinhalte werden nicht protokolliert. Benutzer können nur ihre eigenen Audit-Einträge abrufen.

Konfigurationsexporte werden ausschließlich im Browser mit PBKDF2-SHA-256 (250.000 Iterationen) und AES-256-GCM verschlüsselt. Die Passphrase wird nicht an den Server gesendet. Secret-Payloads und Credential-Zuweisungen sind absichtlich nicht Bestandteil des Exports; ein Restore erzeugt Remote-Ressourcen daher ohne gespeicherte Zugangsdaten.

## Webinhalte

Direkt eingebettete Webressourcen behalten ihre X-Frame-Options-/CSP-Header und bleiben eigene Sicherheitsdomänen; der HomeOps-Login ist kein SSO.

Die optionale HTTP-Basic-Funktion ist ein eng begrenzter Sonderfall für LAN-Geräte. Sie akzeptiert nur Ziele, deren DNS-Ergebnisse vollständig in privaten IPv4- oder lokalen IPv6-Netzen liegen, fixiert die geprüfte Zieladresse für die ausgehende Verbindung und folgt keinen Cross-Origin-Redirects. Das globale Passwort-Credential wird ausschließlich im Backend entschlüsselt und als `Authorization`-Header an den exakt konfigurierten Origin gesendet. Ziel-Cookies werden nicht an HomeOps übernommen. Die Antwort läuft in einem Sandbox-iframe ohne `allow-same-origin`; externes Öffnen ist für diesen Modus deaktiviert. Dadurch dürfen komplexe Anwendungen mit WebSockets, Cross-Origin-XHR oder sitzungsabhängigen Cookies eingeschränkt sein.

HTTP Basic verschlüsselt Benutzername und Passwort nicht. Für `http://`-Ziele zeigt die UI daher eine LAN-Ausnahmewarnung; außerhalb eines vollständig vertrauenswürdigen Netzes ist HTTPS zwingend.
