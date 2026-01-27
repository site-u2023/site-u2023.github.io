#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC2154,SC2086,SC3001,SC3043

# BEGIN_VARIABLE_DEFINITIONS
# END_VARIABLE_DEFINITIONS

BASE_DIR="/tmp"
CONFIG_DIR="$BASE_DIR/aios2"
exec >> "$CONFIG_DIR/debug.log" 2>&1

echo "Using package manager: ${PKG_MGR}"

echo ""
echo "Detected package manager: ${PKG_MGR} (extension: .${PKG_EXT})"
echo "Fetching release information from GitHub API"

ALL_RELEASES=$(wget --no-check-certificate -q -O - "https://api.github.com/repos/jerrykuku/luci-theme-argon/releases")

[ -z "$ALL_RELEASES" ] && {
    echo "[ERROR] Failed to fetch release information"
    exit 1
}

# 依存関係を考慮してパッケージをソート
SORTED_PACKAGES=""
THEME_PACKAGES=""
CONFIG_PACKAGES=""

while IFS=':' read -r pattern exclude filename enable_service restart_service; do
    [ -z "$pattern" ] && continue
    
    case "$pattern" in
        *config*)
            CONFIG_PACKAGES="${CONFIG_PACKAGES}${pattern} "
            ;;
        *)
            THEME_PACKAGES="${THEME_PACKAGES}${pattern} "
            ;;
    esac
done <<EOF
$(echo "$PACKAGES" | tr ' ' '\n')
EOF

SORTED_PACKAGES="${THEME_PACKAGES}${CONFIG_PACKAGES}"

while read -r pattern; do
    [ -z "$pattern" ] && continue
    
    echo ""
    echo "Processing package pattern: ${pattern}"
    
    RELEASE_COUNT=$(echo "$ALL_RELEASES" | jsonfilter -e '@[*].tag_name' | wc -l)
    
    PACKAGE_NAME=""
    TAG_NAME=""
    
    i=0
    while [ $i -lt $RELEASE_COUNT ]; do
        current_tag=$(echo "$ALL_RELEASES" | jsonfilter -e "@[$i].tag_name" 2>/dev/null)
        found_pkg=$(echo "$ALL_RELEASES" | jsonfilter -e "@[$i].assets[*].name" | grep "${pattern}" | grep "\.${PKG_EXT}$" | head -n1)
        
        if [ -n "$found_pkg" ]; then
            PACKAGE_NAME="$found_pkg"
            TAG_NAME="$current_tag"
            echo "Found: ${PACKAGE_NAME} in release ${TAG_NAME}"
            break
        fi
        
        i=$((i + 1))
    done
    
    if [ -z "$PACKAGE_NAME" ]; then
        echo "[ERROR] No .${PKG_EXT} package found for pattern: ${pattern}"
        continue
    fi
    
    DOWNLOAD_URL="${DOWNLOAD_BASE_URL}/${TAG_NAME}/${PACKAGE_NAME}"
    echo "Downloading from: ${DOWNLOAD_URL}"
    
    if wget --no-check-certificate -O "${CONFIG_DIR}/${PACKAGE_NAME}" "${DOWNLOAD_URL}"; then
        INSTALL_CMD="${PKG_INSTALL_CMD_TEMPLATE//\{package\}/${CONFIG_DIR}/${PACKAGE_NAME}}"
        eval "$INSTALL_CMD"
        INSTALL_STATUS=$?
        rm -f "${CONFIG_DIR}/${PACKAGE_NAME}"
        
        if [ $INSTALL_STATUS -eq 0 ]; then
            echo "Installation completed: ${PACKAGE_NAME}"
        else
            echo "[ERROR] Installation failed with status ${INSTALL_STATUS}: ${PACKAGE_NAME}"
        fi
    else
        echo "[ERROR] Download failed: ${PACKAGE_NAME}"
    fi
done <<EOF
$(echo "$SORTED_PACKAGES" | tr ' ' '\n')
EOF

echo ""
echo "All packages processed."
exit 0
