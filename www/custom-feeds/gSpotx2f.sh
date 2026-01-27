#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC2154,SC2086,SC3001,SC3043

# BEGIN_VARIABLE_DEFINITIONS
# END_VARIABLE_DEFINITIONS

BASE_DIR="/tmp"
CONFIG_DIR="$BASE_DIR/aios2"
exec >> "$CONFIG_DIR/debug.log" 2>&1

# 変数展開関数
expand_template() {
    local template="$1"
    shift
    
    local result="$template"
    
    while [ $# -gt 0 ]; do
        local key="$1"
        local value="$2"
        result=$(echo "$result" | sed "s|{$key}|$value|g")
        shift 2
    done
    
    echo "$result"
}

echo ""
echo "Using package manager: ${PKG_MGR} (extension: .${PKG_EXT})"
echo "Fetching package information from: ${API_URL}"

RESPONSE=$(wget --no-check-certificate -q -O - "$API_URL") || {
    echo "[ERROR] Failed to fetch package list from API"
    exit 1
}
[ -z "$RESPONSE" ] && { echo "[ERROR] Empty response from API"; exit 1; }

while IFS=':' read -r pattern exclude filename enable_service restart_service; do
    [ -z "$pattern" ] && continue

    echo ""
    echo "Processing package pattern: ${pattern}"

    # パッケージマネージャーに応じた拡張子でフィルタリング
    if [ -n "$exclude" ]; then
        PACKAGE_NAME=$(echo "$RESPONSE" | jsonfilter -e '@[*].name' | grep "${pattern}.*\.${PKG_EXT}" | grep -v "$exclude" | head -n1)
    else
        PACKAGE_NAME=$(echo "$RESPONSE" | jsonfilter -e '@[*].name' | grep "${pattern}.*\.${PKG_EXT}" | head -n1)
    fi

    [ -z "$PACKAGE_NAME" ] && {
        echo "[ERROR] Package not found: ${pattern} (.${PKG_EXT})"
        continue
    }

    echo "Found: ${PACKAGE_NAME}"

    LOCAL_PKG="${CONFIG_DIR}/${PACKAGE_NAME}"
    
    if wget --no-check-certificate -O "${LOCAL_PKG}" "${DOWNLOAD_BASE_URL}/${PACKAGE_NAME}"; then
        INSTALL_CMD=$(expand_template "$PKG_INSTALL_CMD_TEMPLATE" "package" "${LOCAL_PKG}")
        eval "$INSTALL_CMD" && rm -f "${LOCAL_PKG}"
        echo "Installation completed: ${PACKAGE_NAME}"

        [ -n "$enable_service" ] && {
            echo "Enabling and starting service: ${enable_service}"
            /etc/init.d/"${enable_service}" enable 2>/dev/null
            /etc/init.d/"${enable_service}" start 2>/dev/null
        }

        [ -n "$restart_service" ] && {
            echo "Restarting service: ${restart_service}"
            /etc/init.d/"${restart_service}" restart 2>/dev/null
        }
    else
        echo "[ERROR] Download failed: ${PACKAGE_NAME}"
        rm -f "${LOCAL_PKG}" 2>/dev/null
    fi
done <<EOF
$(echo "$PACKAGES" | tr ' ' '\n')
EOF

echo ""
echo "All packages processed."
exit 0
