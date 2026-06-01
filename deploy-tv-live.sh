#!/bin/bash
# Deploy versão LIVE (hot-reload) para Samsung TV
# A TV carrega direto do Vite dev server do Mac
set -e

SDB="$HOME/tizen-studio/tools/sdb"
TIZEN="$HOME/tizen-studio/tools/ide/bin/tizen"
TV="192.168.18.78:26101"
DIR="/Users/pedrosantos/Documents/Arelon"
APP_ID="VetraioApp.Vetraio"
LIVE_DIR="/tmp/vetraio-live"
LOCAL_IP="${VETRAIO_HOST_IP:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)}"
LIVE_PORT="${VETRAIO_LIVE_PORT:-5175}"
LIVE_URL="http://${LOCAL_IP}:${LIVE_PORT}"

echo "🔴 Arelon LIVE → Samsung TV"
echo ""

if [ -z "$LOCAL_IP" ]; then
  echo "❌ Não foi possível detectar o IP local automaticamente."
  echo "   Defina manualmente VETRAIO_HOST_IP e execute novamente."
  exit 1
fi

if ! curl -fsS "$LIVE_URL" >/dev/null 2>&1; then
  echo "❌ Dev server indisponível em: $LIVE_URL"
  echo "   Rode primeiro: npm run dev"
  exit 1
fi

# Criar app mínimo que aponta pro Vite
mkdir -p "$LIVE_DIR"
cat > "$LIVE_DIR/config.xml" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="http://vetraio-tv-z.app/iptv" version="1.0.0" viewmodes="maximized">
  <name>Arelon</name>
  <content src="${LIVE_URL}" />
  <icon src="icon.png" />
  <access origin="*" subdomains="true" />
  <tizen:application id="VetraioApp.Vetraio" package="VetraioApp" required_version="5.5" />
  <tizen:profile name="tv" />
  <tizen:privilege name="http://tizen.org/privilege/internet" />
  <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice" />
  <tizen:setting screen-orientation="landscape" context-menu="disable" background-support="disable" hwkey-event="enable" encryption="disable" install-location="auto" />
</widget>
EOF
echo '<html><body>Redirecting...</body></html>' > "$LIVE_DIR/index.html"

# Copia o ícone do app (512x512) para aparecer no launcher da TV também no modo live
cp "$DIR/public/icon.png" "$LIVE_DIR/icon.png"

# Sign
rm -f "$LIVE_DIR/author-signature.xml" "$LIVE_DIR/signature1.xml" "$LIVE_DIR/.manifest.tmp" "$LIVE_DIR/"*.wgt
$TIZEN cli-config "profiles.path=$HOME/tizen-studio-data/profile/profiles.xml"
$TIZEN package -t wgt -s AppVetra -- "$LIVE_DIR"

# Connect & install
$SDB connect 192.168.18.78 2>/dev/null || true
WGT_FILE="$(ls -1t "$LIVE_DIR"/*.wgt 2>/dev/null | head -n 1)"
if [ -z "$WGT_FILE" ]; then
  echo "❌ Não foi encontrado .wgt em $LIVE_DIR após o empacotamento."
  exit 1
fi
$TIZEN install -n "$WGT_FILE" -s "$TV"
$TIZEN run -p "$APP_ID" -s "$TV"

echo ""
echo "✅ LIVE MODE! A TV agora carrega direto do seu Mac."
echo "   Rode 'npm run dev' e edite à vontade!"
echo "   Cada Ctrl+S atualiza a TV automaticamente. 🔥"
