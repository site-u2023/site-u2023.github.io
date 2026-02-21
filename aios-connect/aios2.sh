#!/bin/sh
cat << 'EOF' > /usr/bin/aios2
#!/bin/sh
CONFIG_DIR="/tmp/aios2"
mkdir -p "$CONFIG_DIR"
CACHE_BUSTER="?t=$(date +%s)"
wget --no-check-certificate -O "$CONFIG_DIR/aios2.sh" "https://site-u.pages.dev/www/aios2.sh${CACHE_BUSTER}"
chmod +x "$CONFIG_DIR/aios2.sh"
sh "$CONFIG_DIR/aios2.sh" "$@"
EOF
chmod +x /usr/bin/aios2
