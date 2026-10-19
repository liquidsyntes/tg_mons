#!/usr/bin/env bash
# Выпуск Let's Encrypt для TgMon. Идемпотентен: пока DNS не готов — просто выходит.
# После успешного выпуска сам выключает таймер tgmon-cert.timer.
set -uo pipefail
DOMAIN="tgmons.online"
LOG=/var/log/tgmon-cert.log
exec >>"$LOG" 2>&1
echo "--- $(date -Is) run ---"

IP="$(curl -fsS https://api.ipify.org || true)"
[ -n "$IP" ] || { echo "no public IP, abort"; exit 0; }
echo "public IP: $IP"

DOMAINS=()
for d in "$DOMAIN" "www.$DOMAIN"; do
  got="$(curl -fsS -H 'accept: application/dns-json' \
        "https://cloudflare-dns.com/dns-query?name=$d&type=A" 2>/dev/null \
        | grep -o '"data":"[0-9.]*"' | head -1 | cut -d'"' -f4 || true)"
  echo "$d -> ${got:-<none>}"
  [ "$got" = "$IP" ] && DOMAINS+=("$d")
done

if [ "${#DOMAINS[@]}" -eq 0 ]; then
  echo "DNS not ready yet, will retry"
  exit 0
fi

ARGS=(); for d in "${DOMAINS[@]}"; do ARGS+=(-d "$d"); done
certbot --nginx "${ARGS[@]}" --redirect --agree-tos -n \
  --register-unsafely-without-email \
  --deploy-hook "systemctl reload nginx"
RC=$?
if [ $RC -ne 0 ]; then echo "certbot failed rc=$RC"; exit 0; fi

nginx -t && systemctl reload nginx
echo "=== checks ==="
curl -s -o /dev/null -w 'https root:   %{http_code}\n' "https://$DOMAIN/"
curl -s -o /dev/null -w 'https health: %{http_code}\n' "https://$DOMAIN/api/health"
curl -s -o /dev/null -w 'http health:  %{http_code} -> %{redirect_url}\n' "http://$DOMAIN/api/health"
echo "certificate issued OK"
systemctl disable --now tgmon-cert.timer
