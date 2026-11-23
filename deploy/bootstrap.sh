#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
if [[ -e .env ]]; then
  echo ".env existiert bereits; Abbruch ohne Überschreiben." >&2
  exit 1
fi
command -v openssl >/dev/null || { echo "openssl wird zum Erzeugen der Secrets benötigt." >&2; exit 1; }

image="ghcr.io/khazaa/homeops-public:latest"
read -r -p "HomeOps-URL (z. B. http://192.168.1.10:3000): " origin
read -r -p "Bind-Adresse des Dockerhosts (z. B. 192.168.1.10): " bind_address
read -r -s -p "Initiales Admin-Kennwort (mindestens 12 Zeichen): " admin_password
echo
read -r -s -p "Admin-Kennwort bestätigen: " admin_password_confirmation
echo
if [[ "$admin_password" != "$admin_password_confirmation" || ! "$origin" =~ ^https?://[A-Za-z0-9._:-]+$ || ! "$bind_address" =~ ^[A-Za-z0-9.:-]+$ || "$bind_address" == "0.0.0.0" || ${#admin_password} -lt 12 || ! "$admin_password" =~ ^[A-Za-z0-9._~!@%+=:-]+$ ]]; then
  echo "URL, Bind-Adresse oder Admin-Kennwort ist ungültig. 0.0.0.0 wird bewusst nicht akzeptiert." >&2
  exit 1
fi

if [[ "$origin" == https://* ]]; then
  trust_proxy=true
  cookie_secure=true
else
  trust_proxy=false
  cookie_secure=false
  echo "Hinweis: HTTP überträgt Anmeldung und eingegebene Zugangsdaten im LAN unverschlüsselt."
fi

token() { openssl rand -base64 "$1" | tr '+/' '-_' | tr -d '=\n'; }
umask 077
cat > .env <<EOF
HOMEOPS_IMAGE=$image
APP_ORIGIN=$origin
HOMEOPS_PORT=3000
HOMEOPS_BIND_ADDRESS=$bind_address
POSTGRES_PASSWORD=$(token 32)
MASTER_KEY=$(token 32)
GUAC_TOKEN_KEY=$(token 32)
ADMIN_USERNAME=admin
ADMIN_INITIAL_PASSWORD=$admin_password
TRUST_PROXY=$trust_proxy
COOKIE_SECURE=$cookie_secure
EOF

echo ".env wurde mit Modus 600 erzeugt. Jetzt: docker compose pull && docker compose up -d"
