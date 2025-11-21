#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC3043

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

[ "$RUN_OPKG_UPDATE" = "1" ] && {
    echo "Running opkg update..."
    opkg update
}

echo ""
echo "Fetching package information from: ${API_URL}"
RESPONSE=$(wget --no-check-certificate -q -O - "$API_URL") || {
    echo "[ERROR] Failed to fetch package list from API"
    exit 1
}
[ -z "$RESPONSE" ] && { echo "[ERROR] Empty response from API"; exit 1; }

# Process each package in PACKAGES variable
# Format: "pattern:exclude:filename:enable_service:restart_service"
echo "$PACKAGES" | tr ' ' '\n' | while IFS=':' read -r pattern exclude filename enable_service restart_service; do
    [ -z "$pattern" ] && continue

    echo ""
    echo "Processing package pattern: ${pattern}"

    # Find package in API response
    if [ -n "$exclude" ]; then
        PACKAGE_NAME=$(echo "$RESPONSE" | jsonfilter -e '@[*].name' | grep "${pattern}.*\.ipk" | grep -v "$exclude" | head -n1)
    else
        PACKAGE_NAME=$(echo "$RESPONSE" | jsonfilter -e '@[*].name' | grep "${pattern}.*\.ipk" | head -n1)
    fi

    [ -z "$PACKAGE_NAME" ] && {
        echo "[ERROR] Package not found: ${pattern}"
        continue
    }

    echo "Found: ${PACKAGE_NAME}"

    if wget --no-check-certificate -O "${CONFIG_DIR}/${filename}.ipk" "${DOWNLOAD_BASE_URL}/${PACKAGE_NAME}"; then
        opkg install "${CONFIG_DIR}/${filename}.ipk" && rm -f "${CONFIG_DIR}/${filename}.ipk"
        echo "Installation completed: ${PACKAGE_NAME}"

        if [ -n "$enable_service" ]; then
            echo "Enabling and starting service: ${enable_service}"
            /etc/init.d/"${enable_service}" enable
            /etc/init.d/"${enable_service}" start
        fi

        if [ -n "$restart_service" ]; then
            echo "Restarting service: ${restart_service}"
            /etc/init.d/"${restart_service}" restart
        fi
    else
        echo "[ERROR] Download failed: ${PACKAGE_NAME}"
    fi
done

echo ""
echo "All packages processed."
exit 0
