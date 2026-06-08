#!/usr/bin/env bash
# =============================================================================
# issue-cert.sh — Issue Let's Encrypt TLS certificate via Cloudflare DNS-01
#
# Why DNS-01 and not HTTP-01?
#   raybags.com is behind the Cloudflare proxy, so HTTP-01 challenge requests
#   may not reach the origin. DNS-01 proves domain ownership via a TXT record
#   created directly through the Cloudflare API — no port 80 access needed.
#
# Prerequisites:
#   1. DNS A record: raybags.com → 89.167.74.127 (Cloudflare proxied)
#   2. A Cloudflare API token with  Zone:DNS:Edit  permission.
#      Create one at: https://dash.cloudflare.com/profile/api-tokens
#      Use the "Edit zone DNS" template, scope to raybags.com zone.
#
# Usage:
#   CF_API_TOKEN=<your-token> bash scripts/issue-cert.sh
#   # OR interactively:
#   bash scripts/issue-cert.sh   (prompts for token)
#
# After this script succeeds, redeploy with SSL:
#   bash scripts/deploy-vps.sh
# =============================================================================
set -Eeuo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$ROOT"

SERVER="portfolio-server"
DATA_DIR="/mnt/portfolio-data"
REMOTE_APP="$DATA_DIR/app"
COMPOSE_FILE="docker-compose.vps.yml"
DOMAIN="raybags.com"
EMAIL="baguma.github@gmail.com"

# Get the Cloudflare API token
if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo ""
  echo "  Cloudflare API token needed to create the DNS-01 challenge record."
  echo "  Create one at: https://dash.cloudflare.com/profile/api-tokens"
  echo "  Use the 'Edit zone DNS' template, scope it to the $DOMAIN zone."
  echo ""
  read -rsp "  Paste your Cloudflare API token (input hidden): " CF_API_TOKEN
  echo ""
fi
[[ -n "$CF_API_TOKEN" ]] || die "Cloudflare API token is required"

phase "Issuing Let's Encrypt certificate for $DOMAIN"

ssh "$SERVER" CF_API_TOKEN="$CF_API_TOKEN" DATA_DIR="$DATA_DIR" DOMAIN="$DOMAIN" EMAIL="$EMAIL" \
  REMOTE_APP="$REMOTE_APP" COMPOSE_FILE="$COMPOSE_FILE" bash -s <<'REMOTE'
set -Eeuo pipefail

log()  { echo -e "\033[34m[$(date +%H:%M:%S)]\033[0m $*"; }
ok()   { echo -e "\033[32m✔\033[0m $*"; }
die()  { echo -e "\033[31mx\033[0m $*" >&2; exit 1; }

# ---- Install certbot-dns-cloudflare plugin ----
log "Installing certbot-dns-cloudflare …"
if ! certbot plugins 2>&1 | grep -q dns-cloudflare; then
  # Install plugin snap
  snap install certbot-dns-cloudflare
  # Set trust flag FIRST — certbot's prepare-plug-plugin hook requires this
  snap set certbot trust-plugin-with-root=ok
  # Now connect — the hook reads the flag above
  snap connect certbot:plugin certbot-dns-cloudflare
fi
# Final verification (certbot needs to see the plugin)
certbot plugins 2>&1 | grep -q dns-cloudflare || die "certbot-dns-cloudflare plugin not available — check 'snap connect certbot:plugin certbot-dns-cloudflare'"
ok "Plugin ready"

# ---- Write Cloudflare credentials ----
CF_CREDS="$DATA_DIR/cloudflare.ini"
cat > "$CF_CREDS" <<EOF
dns_cloudflare_api_token = $CF_API_TOKEN
EOF
chmod 600 "$CF_CREDS"
ok "Credentials written to $CF_CREDS"

# ---- Issue the certificate ----
CERT_PATH="/etc/letsencrypt/live/$DOMAIN"
if [[ -d "$CERT_PATH" ]]; then
  log "Certificate already exists — running renewal instead"
  certbot renew --quiet --cert-name "$DOMAIN" || true
else
  log "Requesting certificate for $DOMAIN and www.$DOMAIN …"
  certbot certonly \
    --dns-cloudflare \
    --dns-cloudflare-credentials "$CF_CREDS" \
    --dns-cloudflare-propagation-seconds 30 \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    -d "$DOMAIN" \
    -d "www.$DOMAIN"
fi

ok "Certificate issued at $CERT_PATH"
ls -la "$CERT_PATH"

# ---- Set up auto-renewal cron ----
CRON_JOB="0 3 * * * certbot renew --quiet --dns-cloudflare --dns-cloudflare-credentials $DATA_DIR/cloudflare.ini && docker compose -f $REMOTE_APP/$COMPOSE_FILE --env-file $REMOTE_APP/.env.prod exec nginx nginx -s reload"
if crontab -l 2>/dev/null | grep -q "certbot renew"; then
  # Update existing cron to use DNS challenge
  (crontab -l 2>/dev/null | grep -v "certbot renew"; echo "$CRON_JOB") | crontab -
else
  (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
fi
ok "Auto-renewal cron set (runs 03:00 daily)"

# ---- Reload nginx with SSL config ----
if docker compose -f "$REMOTE_APP/$COMPOSE_FILE" --env-file "$REMOTE_APP/.env.prod" ps 2>/dev/null | grep -q "nginx"; then
  log "Reloading nginx with SSL config …"
  # Switch to SSL config and reload
  export NGINX_CONF=nginx.prod.conf
  docker compose -f "$REMOTE_APP/$COMPOSE_FILE" --env-file "$REMOTE_APP/.env.prod" \
    up -d --no-build nginx
  sleep 3
  docker compose -f "$REMOTE_APP/$COMPOSE_FILE" --env-file "$REMOTE_APP/.env.prod" \
    exec nginx nginx -s reload
  ok "Nginx reloaded with SSL config"
fi

echo ""
ok "Certificate setup complete!"
echo "  Cert path: $CERT_PATH"
echo "  Expires:   $(openssl x509 -noout -enddate -in $CERT_PATH/cert.pem 2>/dev/null | cut -d= -f2)"
echo ""
echo "  Now set Cloudflare SSL/TLS mode to 'Full (strict)' at:"
echo "  https://dash.cloudflare.com → SSL/TLS → Overview"
REMOTE

ok "issue-cert.sh complete"
echo ""
echo "  Next: bash scripts/deploy-vps.sh  (deploys with HTTPS nginx config)"
