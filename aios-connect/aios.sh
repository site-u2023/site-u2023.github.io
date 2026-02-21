#!/bin/sh
cat << 'EOF' > /usr/bin/aios
#!/bin/sh
CONFIG_DIR="/tmp/aios"
mkdir -p "$CONFIG_DIR"
CACHE_BUSTER="?t=$(date +%s)"
wget --no-check-certificate -O "$CONFIG_DIR/aios.sh" "https://raw.githubusercontent.com/site-u2023/aios/main/aios.sh${CACHE_BUSTER}"
chmod +x "$CONFIG_DIR/aios.sh"
sh "$CONFIG_DIR/aios.sh" "$@"
EOF
chmod +x /usr/bin/aios
