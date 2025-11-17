#!/bin/sh
# BEGIN_VARIABLE_DEFINITIONS
# END_VARIABLE_DEFINITIONS

if command -v opkg >/dev/null 2>&1; then
    PKG_MGR="opkg"
elif command -v apk >/dev/null 2>&1; then
    PKG_MGR="apk"
else
    echo "Error: No supported package manager found"
    exit 1
fi

MISSING_PKGS=""
for pkg in $PACKAGES; do
    if [ "$PKG_MGR" = "opkg" ]; then
        if ! opkg list-installed | grep -q "^${pkg} "; then
            MISSING_PKGS="$MISSING_PKGS $pkg"
        fi
    elif [ "$PKG_MGR" = "apk" ]; then
        if ! apk info -e "$pkg" >/dev/null 2>&1; then
            MISSING_PKGS="$MISSING_PKGS $pkg"
        fi
    fi
done

if [ -n "$MISSING_PKGS" ]; then
    if [ "$PKG_MGR" = "opkg" ]; then
        opkg update
        opkg install $MISSING_PKGS
    elif [ "$PKG_MGR" = "apk" ]; then
        apk update
        apk add $MISSING_PKGS
    fi
fi

exit 0
