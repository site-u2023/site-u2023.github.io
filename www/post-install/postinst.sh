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
        opkg list-installed | grep -q "^${pkg}[[:space:]]*-" || MISSING_PKGS="$MISSING_PKGS $pkg"
    elif [ "$PKG_MGR" = "apk" ]; then
        apk info -e "$pkg" >/dev/null 2>&1 || MISSING_PKGS="$MISSING_PKGS $pkg"
    fi
done

if [ -n "$MISSING_PKGS" ]; then
    if [ "$PKG_MGR" = "opkg" ]; then
        opkg update >/dev/null 2>&1
        opkg install $MISSING_PKGS >/dev/null 2>&1
    elif [ "$PKG_MGR" = "apk" ]; then
        apk update >/dev/null 2>&1
        apk add $MISSING_PKGS >/dev/null 2>&1
    fi
fi

exit 0
