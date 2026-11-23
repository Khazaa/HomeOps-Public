#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
if [[ -e .env ]]; then
  echo ".env existiert bereits; Abbruch ohne Überschreiben." >&2
  exit 1
fi
command -v openssl >/dev/null || { echo "openssl wird zum Erzeugen der Secrets benötigt." >&2; exit 1; }

read -r -p "HomeOps Image (z. B. ghcr.io/khazaa/homeops:v0.1.0): " image
read -r -p "Externe HTTPS-URL (z. B. https://homeops.example.lan): " origin
read -r -s -p "Initiales Admin-Kennwort (mindestens 12 Zeichen): " admin_password
echo
read -r -s -p "Admin-Kennwort bestätigen: " admin_password_confirmation
echo
if [[ "$admin_password" != "$admin_password_confirmation" || ! "$image" =~ ^[a-z0-9][a-z0-9._/:@-]+$ || ! "$origin" =~ ^https://[A-Za-z0-9._:-]+$ || ${#admin_password} -lt 12 || ! "$admin_password" =~ ^[A-Za-z0-9._~!@%+=:-]+$ ]]; then
  echo "Image, HTTPS-URL oder Admin-Kennwort ist ungültig. Beim Kennwort sind Buchstaben, Ziffern und ._~!@%+=:- erlaubt." >&2
  exit 1
fi

token() { openssl rand -base64 "$1" | tr '+/' '-_' | tr -d '=\n'; }
umask 077
cat > .env <<EOF
HOMEOPS_IMAGE=$image
APP_ORIGIN=$origin
HOMEOPS_PORT=3000
POSTGRES_PASSWORD=$(token 32)
MASTER_KEY=$(token 32)
GUAC_TOKEN_KEY=$(token 32)
ADMIN_USERNAME=admin
ADMIN_INITIAL_PASSWORD=$admin_password
TRUST_PROXY=true
COOKIE_SECURE=true
EOF

echo ".env wurde mit Modus 600 erzeugt. Jetzt: docker compose pull && docker compose up -d"
