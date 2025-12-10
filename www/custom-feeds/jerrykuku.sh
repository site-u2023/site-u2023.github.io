#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC2154,SC2086,SC3001,SC3043

# BEGIN_VARIABLE_DEFINITIONS
# END_VARIABLE_DEFINITIONS

BASE_DIR="/tmp"
CONFIG_DIR="$BASE_DIR/aios2"
exec > >(tee -a "$CONFIG_DIR/debug.log") 2>&1

# パッケージマネージャーを検出
if command -v opkg >/dev/null 2>&1; then
    PKG_MGR="opkg"
    PKG_EXT="ipk"
elif command -v apk >/dev/null 2>&1; then
    PKG_MGR="apk"
    PKG_EXT="apk"
else
    echo "[ERROR] No supported package manager found"
    exit 1
fi

echo ""
echo "Detected package manager: ${PKG_MGR} (extension: .${PKG_EXT})"
echo "Fetching release information from: ${API_URL}"

# すべてのリリースを取得
ALL_RELEASES=$(wget --no-check-certificate -q -O - "https://api.github.com/repos/jerrykuku/luci-theme-argon/releases")

[ -z "$ALL_RELEASES" ] && {
    echo "[ERROR] Failed to fetch release information"
    exit 1
}

while read -r pattern; do
    [ -z "$pattern" ] && continue
    
    echo ""
    echo "Processing package pattern: ${pattern}"
    
    # すべてのリリースから対応するパッケージを探す
    FOUND_RELEASE=""
    PACKAGE_NAME=""
    TAG_NAME=""
    
    # 各リリースを順番にチェック（新しい順）
    echo "$ALL_RELEASES" | jsonfilter -e '@[*]' | while read -r release_json; do
        # このリリースのタグ名を取得
        current_tag=$(echo "$release_json" | jsonfilter -e '@.tag_name' 2>/dev/null)
        
        # このリリースのアセットから対応する拡張子のファイルを探す
        found_pkg=$(echo "$release_json" | jsonfilter -e '@.assets[*].name' | grep "${pattern}" | grep "\.${PKG_EXT}$" | head -n1)
        
        if [ -n "$found_pkg" ]; then
            echo "Found: ${found_pkg} in release ${current_tag}"
            echo "${current_tag}|${found_pkg}"
            break
        fi
    done > "$CONFIG_DIR/jerrykuku_${pattern}.tmp"
    
    # 結果を読み込み
    if [ -f "$CONFIG_DIR/jerrykuku_${pattern}.tmp" ] && [ -s "$CONFIG_DIR/jerrykuku_${pattern}.tmp" ]; then
        read -r result < "$CONFIG_DIR/jerrykuku_${pattern}.tmp"
        TAG_NAME=$(echo "$result" | cut -d'|' -f1)
        PACKAGE_NAME=$(echo "$result" | cut -d'|' -f2)
        rm -f "$CONFIG_DIR/jerrykuku_${pattern}.tmp"
    fi
    
    if [ -z "$PACKAGE_NAME" ]; then
        echo "[ERROR] No .${PKG_EXT} package found for pattern: ${pattern}"
        continue
    fi
    
    DOWNLOAD_URL="${DOWNLOAD_BASE_URL}/${TAG_NAME}/${PACKAGE_NAME}"
    echo "Downloading from: ${DOWNLOAD_URL}"
    
    if wget --no-check-certificate -O "${CONFIG_DIR}/${PACKAGE_NAME}" "${DOWNLOAD_URL}"; then
        ${PKG_MGR} install "${CONFIG_DIR}/${PACKAGE_NAME}"
        rm -f "${CONFIG_DIR}/${PACKAGE_NAME}"
        echo "Installation completed: ${PACKAGE_NAME}"
    else
        echo "[ERROR] Download failed: ${PACKAGE_NAME}"
    fi
done <<EOF
$(echo "$PACKAGES" | tr ' ' '\n')
EOF

echo ""
echo "All packages processed."
exit 0
