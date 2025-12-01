#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC2086,SC3043

# BEGIN_VARIABLE_DEFINITIONS
# END_VARIABLE_DEFINITIONS

BASE_DIR="/tmp"
CONFIG_DIR="$BASE_DIR/aios2"

OPENWRT_RELEASE=$(grep 'DISTRIB_RELEASE' /etc/openwrt_release 2>/dev/null | cut -d"'" -f2 | cut -c 1-2)

if [ -z "$OPENWRT_RELEASE" ]; then
    echo "[ERROR] Unable to detect OpenWrt version"
    exit 1
fi

if [ "$OPENWRT_RELEASE" = "SN" ]; then
    echo "OpenWrt version: SNAPSHOT [OK]"
elif [ "$OPENWRT_RELEASE" -ge 19 ] 2>/dev/null; then
    echo "OpenWrt version: $OPENWRT_RELEASE [OK]"
else
    echo "[ERROR] Unsupported OpenWrt version: $OPENWRT_RELEASE (requires 19 or later)"
    exit 1
fi

if [ "$RUN_OPKG_UPDATE" = "1" ]; then
    echo "Running opkg update..."
    opkg update
fi

echo ""
echo "Fetching latest release information from: ${API_URL}"
RESPONSE=$(wget --no-check-certificate -q -O - "$API_URL")

if [ -z "$RESPONSE" ]; then
    echo "[ERROR] Failed to fetch release information from API"
    exit 1
fi

TAG_NAME=$(echo "$RESPONSE" | jsonfilter -e '@.tag_name' 2>/dev/null)

if [ -z "$TAG_NAME" ]; then
    echo "[ERROR] Failed to extract tag name from API response"
    exit 1
fi

echo "Latest release version: ${TAG_NAME}"

echo "$PACKAGES" | tr ' ' '\n' | while read -r pattern; do
    [ -z "$pattern" ] && continue
    
    echo ""
    echo "Processing package: ${pattern}"
    
    PACKAGE_NAME=$(echo "$RESPONSE" | jsonfilter -e '@.assets[*].name' | grep "${pattern}.*\.ipk" | head -n1)
    
    if [ -z "$PACKAGE_NAME" ]; then
        echo "[ERROR] Package not found: ${pattern}"
        continue
    fi
    
    echo "Found: ${PACKAGE_NAME}"
    
    DOWNLOAD_URL="${DOWNLOAD_BASE_URL}/${TAG_NAME}/${PACKAGE_NAME}"
    
    wget --no-check-certificate -O "${CONFIG_DIR}/${PACKAGE_NAME}" "${DOWNLOAD_URL}"
    
    if [ $? -eq 0 ]; then
        # Install package
        opkg install "${CONFIG_DIR}/${PACKAGE_NAME}"
        rm "${CONFIG_DIR}/${PACKAGE_NAME}"
        echo "Installation completed: ${PACKAGE_NAME}"
    else
        echo "[ERROR] Download failed: ${PACKAGE_NAME}"
        continue
    fi
done

echo ""
echo "All packages processed."
