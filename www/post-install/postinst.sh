#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC3043

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

# opkg用--nodepsをapk用--force-broken-worldに変換
normalize_packages() {
    local pkg_list="$1"
    if [ "$PKG_MGR" = "apk" ]; then
        echo "$pkg_list" | sed 's/--nodeps /--force-broken-world /g'
    else
        echo "$pkg_list"
    fi
}

NORMALIZED_PKGS=$(normalize_packages "$PACKAGES")

MISSING_PKGS=""
for pkg in $NORMALIZED_PKGS; do
    # フラグはスキップ
    case "$pkg" in
        --*) continue ;;
    esac
    
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
        eval "opkg install $NORMALIZED_PKGS"
    elif [ "$PKG_MGR" = "apk" ]; then
        apk update
        eval "apk add $NORMALIZED_PKGS"
    fi
fi

exit 0
