#!/bin/sh

# BEGIN_VARIABLE_DEFINITIONS
# END_VARIABLE_DEFINITIONS

TMP_DIR="/tmp"

# OpenWrt version check
OPENWRT_RELEASE=$(grep 'DISTRIB_RELEASE' /etc/openwrt_release 2>/dev/null | cut -d"'" -f2 | cut -c 1-2)

if [ -z "$OPENWRT_RELEASE" ]; then
    echo "[ERROR] Unable to detect OpenWrt version"
    exit 1
fi

# Check if version is SNAPSHOT or >= 19
if [ "$OPENWRT_RELEASE" = "SN" ]; then
    echo "OpenWrt version: SNAPSHOT [OK]"
elif [ "$OPENWRT_RELEASE" -ge 19 ] 2>/dev/null; then
    echo "OpenWrt version: $OPENWRT_RELEASE [OK]"
else
    echo "[ERROR] Unsupported OpenWrt version: $OPENWRT_RELEASE (requires 19 or later)"
    exit 1
fi

# Run opkg update if requested
if [ "$RUN_OPKG_UPDATE" = "1" ]; then
    echo "Running opkg update..."
    opkg update
fi

echo ""
echo "Fetching package information from: ${API_URL}"
RESPONSE=$(wget --no-check-certificate -q -O - "$API_URL")

if [ -z "$RESPONSE" ]; then
    echo "[ERROR] Failed to fetch package list from API"
    exit 1
fi

# Process each package in PACKAGES variable
# Format: "pattern:exclude:filename:enable_service:restart_service"
echo "$PACKAGES" | tr ' ' '\n' | while read -r pattern; do
    [ -z "$pattern" ] && continue
    
    echo ""
    echo "Processing package: ${pattern}"
    
    # Find package in API response
    if [ -n "$exclude" ]; then
        PACKAGE_NAME=$(echo "$RESPONSE" | jsonfilter -e '@[*].name' | grep "${pattern}.*\.ipk" | grep -v "${exclude}" | head -n1)
    else
        PACKAGE_NAME=$(echo "$RESPONSE" | jsonfilter -e '@[*].name' | grep "${pattern}.*\.ipk" | head -n1)
    fi
    
    if [ -z "$PACKAGE_NAME" ]; then
        echo "[ERROR] Package not found: ${pattern}"
        continue
    fi
    
    echo "Found: ${PACKAGE_NAME}"
    
    # Download package
    wget --no-check-certificate -O "${TMP_DIR}/${filename}.ipk" "${DOWNLOAD_BASE_URL}/${PACKAGE_NAME}"
    
    if [ $? -eq 0 ]; then
        # Install package
        opkg install "${TMP_DIR}/${filename}.ipk"
        rm "${TMP_DIR}/${filename}.ipk"
        echo "Installation completed: ${PACKAGE_NAME}"
        
        # Enable service if requested
        if [ -n "$enable_service" ]; then
            echo "Enabling service: ${enable_service}"
            /etc/init.d/${enable_service} enable
            /etc/init.d/${enable_service} start
        fi
        
        # Restart service if requested
        if [ -n "$restart_service" ]; then
            echo "Restarting service: ${restart_service}"
            /etc/init.d/${restart_service} restart
        fi
    else
        echo "[ERROR] Download failed: ${PACKAGE_NAME}"
        continue
    fi
done

echo ""
echo "All packages processed."
