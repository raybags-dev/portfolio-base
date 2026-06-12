#!/usr/bin/env bash
# =============================================================================
# server-setup.sh — One-time Hetzner VPS provisioning
#
# Run this ONCE after spinning up a fresh server.
# It is safe to re-run; every step is idempotent.
#
# Prerequisites (do these before running):
#   1. DNS: <DOMAIN> → 89.<IP_ADDRESS>.74.127 (A record, proxied via Cloudflare)
#           www.<DOMAIN>.com → <DOMAIN>.com (CNAME)
#   2. Cloudflare SSL/TLS mode: "Full (strict)"
#   3. Temporarily disable "Always Use HTTPS" in Cloudflare (SSL/TLS → Edge Certs)
#      — re-enable it after the cert is issued.
#
# Usage (run from your LOCAL machine):
#   bash scripts/server-setup.sh
# =============================================================================
set -Eeuo pipefail

SERVER="portfolio-server"
DOMAIN="raybags.com"
EMAIL="baguma.github@gmail.com"
DATA_DIR="/mnt/portfolio-data"
HC_VOLUME="/mnt/HC_Volume_105957437"

log()  { echo -e "\033[34m[$(date +%H:%M:%S)]\033[0m $*"; }
ok()   { echo -e "\033[32m✔\033[0m $*"; }
die()  { echo -e "\033[31mx\033[0m $*" >&2; exit 1; }
phase(){ echo -e "\n\033[34m========== $* ==========\033[0m"; }

log "Provisioning $SERVER for $DOMAIN …"

ssh "$SERVER" bash -s <<'REMOTE'
set -Eeuo pipefail
log()  { echo -e "\033[34m[$(date +%H:%M:%S)]\033[0m $*"; }
ok()   { echo -e "\033[32m✔\033[0m $*"; }
phase(){ echo -e "\n\033[34m========== $* ==========\033[0m"; }

DOMAIN="raybags.com"
EMAIL="baguma.github@gmail.com"
DATA_DIR="/mnt/portfolio-data"
HC_VOLUME="/mnt/HC_Volume_105957437"

# ---- 1. Symlink Hetzner volume to canonical path ----
phase "Mount: $HC_VOLUME → $DATA_DIR"
if [[ ! -L "$DATA_DIR" && ! -d "$DATA_DIR" ]]; then
  ln -s "$HC_VOLUME" "$DATA_DIR"
  ok "Symlink created"
else
  ok "Already exists"
fi

# ---- 2. Directory structure ----
phase "Creating data directories"
for d in letsencrypt certbot/www redis logs app; do
  mkdir -p "$DATA_DIR/$d"
done
ok "Directories ready"

# ---- 3. Install Docker ----
phase "Docker"
if command -v docker &>/dev/null; then
  ok "Docker already installed: $(docker --version)"
else
  log "Installing Docker …"
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg lsb-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  ok "Docker installed: $(docker --version)"
fi

# ---- 4. Install Certbot ----
phase "Certbot"
if command -v certbot &>/dev/null; then
  ok "Certbot already installed: $(certbot --version)"
else
  log "Installing Certbot via snap …"
  apt-get install -y -qq snapd
  # Give snapd a moment to initialize
  sleep 5
  snap install --classic certbot 2>/dev/null || true
  ln -sf /snap/bin/certbot /usr/bin/certbot 2>/dev/null || true
  ok "Certbot installed: $(certbot --version)"
fi

# ---- 5. Issue Let's Encrypt certificate (standalone) ----
phase "TLS Certificate"
CERT_PATH="/etc/letsencrypt/live/$DOMAIN"
if [[ -d "$CERT_PATH" ]]; then
  ok "Certificate already exists at $CERT_PATH"
else
  log "Issuing cert for $DOMAIN (standalone — port 80 must be free) …"
  # Ensure /etc/letsencrypt is on the persistent volume
  if [[ ! -L "/etc/letsencrypt" ]]; then
    # Move any existing letsencrypt data to volume then symlink
    if [[ -d "/etc/letsencrypt" ]] && [[ "$(ls -A /etc/letsencrypt)" ]]; then
      cp -a /etc/letsencrypt/. "$DATA_DIR/letsencrypt/"
    fi
    rm -rf /etc/letsencrypt
    ln -s "$DATA_DIR/letsencrypt" /etc/letsencrypt
    ok "Symlinked /etc/letsencrypt → $DATA_DIR/letsencrypt"
  fi

  certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    -d "$DOMAIN" \
    -d "www.$DOMAIN" \
    --preferred-challenges http
  ok "Certificate issued"
fi

# Symlink /etc/letsencrypt → persistent volume (in case it wasn't done above)
if [[ ! -L "/etc/letsencrypt" ]]; then
  cp -a /etc/letsencrypt/. "$DATA_DIR/letsencrypt/" 2>/dev/null || true
  rm -rf /etc/letsencrypt
  ln -s "$DATA_DIR/letsencrypt" /etc/letsencrypt
fi

# ---- 6. Certbot auto-renewal cron ----
phase "Renewal cron"
CRON_JOB="0 3 * * * certbot renew --quiet --webroot -w $DATA_DIR/certbot/www && docker compose -f $DATA_DIR/app/docker-compose.vps.yml --env-file $DATA_DIR/app/.env.prod exec nginx nginx -s reload"
if crontab -l 2>/dev/null | grep -q "certbot renew"; then
  ok "Renewal cron already present"
else
  (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
  ok "Renewal cron added (runs 03:00 daily)"
fi

# ---- 7. System hardening ----
phase "Firewall (ufw)"
if command -v ufw &>/dev/null; then
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
  ok "ufw: SSH + 80 + 443 open"
else
  log "ufw not available, skipping firewall config"
fi

# ---- Done ----
echo ""
ok "Server setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Fill in SUPABASE_DB_PASSWORD in .env.prod"
echo "     (Supabase Dashboard → Project Settings → Database → Connection string)"
echo "  2. Run:  bash scripts/deploy-vps.sh"
echo "  3. Re-enable 'Always Use HTTPS' in Cloudflare"
REMOTE

ok "server-setup.sh done"
