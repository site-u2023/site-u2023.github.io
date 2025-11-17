#!/bin/sh

# BEGIN_VARIABLE_DEFINITIONS
# END_VARIABLE_DEFINITIONS

# Detect package manager (opkg or apk)
if command -v opkg >/dev/null 2>&1; then
    PKG_MGR=opkg
    echo "Detected package manager: opkg"
    opkg update >/dev/null 2>&1
elif command -v apk >/dev/null 2>&1; then
    PKG_MGR=apk
    echo "Detected package manager: apk"
    apk update >/dev/null 2>&1
else
    echo "Error: No supported package manager found (opkg or apk)"
    exit 1
fi

# Install packages
if [ -n "$PACKAGES" ]; then
    echo "Installing packages: $PACKAGES"
    if [ "$PKG_MGR" = "opkg" ]; then
        opkg install $PACKAGES >/dev/null 2>&1
    elif [ "$PKG_MGR" = "apk" ]; then
        apk add $PACKAGES >/dev/null 2>&1
    fi
else
    echo "No packages to install"
fi

echo "Package installation completed"
exit 0
