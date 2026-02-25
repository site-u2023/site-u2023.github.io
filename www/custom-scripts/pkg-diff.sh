#!/bin/sh
# shellcheck shell=sh
# =============================================================================
# pkg-diff.sh - Package Diff Script
# =============================================================================
# Compares currently installed packages against the profiles.json baseline
# (default_packages + device_packages) for this device/version combination.
#
# Usage (standalone):
#   ./pkg-diff.sh
#
# Usage (aios2 template):
#   Called as: pkgdiff_main -t
#   (aios2 appends this call after variable injection)
#
# Output:
#   - Console display (copy-paste friendly)
#   - /tmp/aios2/pkg-diff-result.txt
# =============================================================================

# BEGIN_VARIABLE_DEFINITIONS
# END_VARIABLE_DEFINITIONS

# =============================================================================
# Device Information Detection
# Self-contained: reads /etc/openwrt_release and /etc/board.json directly
# =============================================================================
_pkgdiff_detect_device() {
    _PKGDIFF_VERSION=""
    _PKGDIFF_VENDOR=""
    _PKGDIFF_SUBTARGET=""
    _PKGDIFF_PROFILE=""
    _PKGDIFF_PKG_MGR=""

    # /etc/openwrt_release から version と target を取得
    if [ -f /etc/openwrt_release ]; then
        # . でsourceすると既存変数を上書きするため、grepで個別取得
        _PKGDIFF_VERSION=$(grep '^DISTRIB_RELEASE=' /etc/openwrt_release | cut -d"'" -f2 | cut -d'"' -f2)
        _PKGDIFF_TARGET=$(grep '^DISTRIB_TARGET=' /etc/openwrt_release | cut -d"'" -f2 | cut -d'"' -f2)
    fi

    if [ -z "$_PKGDIFF_VERSION" ] || [ -z "$_PKGDIFF_TARGET" ]; then
        echo "ERROR: Cannot read /etc/openwrt_release" >&2
        return 1
    fi

    # target を vendor/subtarget に分割 (例: "mediatek/filogic" → "mediatek", "filogic")
    _PKGDIFF_VENDOR="${_PKGDIFF_TARGET%%/*}"
    _PKGDIFF_SUBTARGET="${_PKGDIFF_TARGET##*/}"

    # /etc/board.json から model.id を取得してカンマ→アンダースコア変換
    # 例: "bananapi,bpi-r4" → "bananapi_bpi-r4"
    if [ -f /etc/board.json ] && command -v jsonfilter >/dev/null 2>&1; then
        _PKGDIFF_PROFILE=$(jsonfilter -i /etc/board.json -e '@.model.id' 2>/dev/null | tr ',' '_')
    fi

    if [ -z "$_PKGDIFF_PROFILE" ]; then
        echo "ERROR: Cannot detect device profile from /etc/board.json" >&2
        return 1
    fi

    # パッケージマネージャー検出
    if command -v apk >/dev/null 2>&1; then
        _PKGDIFF_PKG_MGR="apk"
    elif command -v opkg >/dev/null 2>&1; then
        _PKGDIFF_PKG_MGR="opkg"
    else
        echo "ERROR: No supported package manager found (apk or opkg)" >&2
        return 1
    fi

    return 0
}

# =============================================================================
# Build profiles.json URL
# Handles both release and snapshot versions
# =============================================================================
_pkgdiff_profiles_url() {
    case "$_PKGDIFF_VERSION" in
        *SNAPSHOT*|*-SNAPSHOT|r*)
            echo "https://downloads.openwrt.org/snapshots/targets/${_PKGDIFF_VENDOR}/${_PKGDIFF_SUBTARGET}/profiles.json"
            ;;
        *)
            echo "https://downloads.openwrt.org/releases/${_PKGDIFF_VERSION}/targets/${_PKGDIFF_VENDOR}/${_PKGDIFF_SUBTARGET}/profiles.json"
            ;;
    esac
}

# =============================================================================
# Fetch profiles.json and compute baseline package list
#
# Baseline = default_packages + device_packages
# Note: device_packages entries starting with "-" REMOVE packages from
#       default_packages (e.g., "-wpad-basic-mbedtls" in GL.iNet profiles)
#
# Output: sorted package list, one per line, to stdout
# =============================================================================
_pkgdiff_get_baseline() {
    local url tmp_json

    url=$(_pkgdiff_profiles_url)
    tmp_json="/tmp/pkgdiff_profiles_$$.json"

    echo "  Fetching: $url"

    if ! wget -qO "$tmp_json" "$url" 2>/dev/null; then
        echo "ERROR: Failed to fetch profiles.json" >&2
        echo "  URL: $url" >&2
        rm -f "$tmp_json"
        return 1
    fi

    if [ ! -s "$tmp_json" ]; then
        echo "ERROR: profiles.json is empty" >&2
        rm -f "$tmp_json"
        return 1
    fi

    # プロファイルが存在するか確認
    local check
    check=$(jsonfilter -i "$tmp_json" -e "@['${_PKGDIFF_PROFILE}'].device_packages[0]" 2>/dev/null)
    local default_check
    default_check=$(jsonfilter -i "$tmp_json" -e '@.default_packages[0]' 2>/dev/null)

    if [ -z "$check" ] && [ -z "$default_check" ]; then
        echo "ERROR: Profile '${_PKGDIFF_PROFILE}' not found in profiles.json" >&2
        echo "  Available profiles can be checked at: $url" >&2
        rm -f "$tmp_json"
        return 1
    fi

    # baseline計算:
    #   D <pkg>  → default_packages のエントリ
    #   V <pkg>  → device_packages のエントリ (通常)
    #   V -<pkg> → device_packages の除外指定
    #
    # awk:
    #   D行 → defaults[] に追加
    #   V行 で先頭が - → defaults[] から削除
    #   V行 で先頭が - 以外 → extras[] に追加
    #   END → defaults + extras を出力
    {
        jsonfilter -i "$tmp_json" -e '@.default_packages[*]' 2>/dev/null \
            | sed 's/^/D /'
        jsonfilter -i "$tmp_json" -e "@['${_PKGDIFF_PROFILE}'].device_packages[*]" 2>/dev/null \
            | sed 's/^/V /'
    } | awk '
        /^D / {
            pkg = substr($0, 3)
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", pkg)
            if (pkg != "") defaults[pkg] = 1
        }
        /^V -/ {
            pkg = substr($0, 4)
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", pkg)
            if (pkg != "") delete defaults[pkg]
        }
        /^V [^-]/ {
            pkg = substr($0, 3)
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", pkg)
            if (pkg != "") extras[pkg] = 1
        }
        END {
            for (p in defaults) print p
            for (p in extras) print p
        }
    ' | LC_ALL=C sort -u

    rm -f "$tmp_json"
    return 0
}

# =============================================================================
# Get currently installed package list
# Output: sorted package list, one per line, to stdout
# =============================================================================
_pkgdiff_get_current() {
    case "$_PKGDIFF_PKG_MGR" in
        apk)
            apk info 2>/dev/null | LC_ALL=C sort -u
            ;;
        opkg)
            opkg list-installed 2>/dev/null | awk '{print $1}' | LC_ALL=C sort -u
            ;;
    esac
}

# =============================================================================
# Main function
# $1: "-t" when called from aios2 template (no effect on logic)
# =============================================================================
pkgdiff_main() {
    local output_dir="/tmp/aios2"
    local output_file="${output_dir}/pkg-diff-result.txt"
    local baseline_file="/tmp/pkgdiff_baseline_$$.txt"
    local current_file="/tmp/pkgdiff_current_$$.txt"
    local added_file="/tmp/pkgdiff_added_$$.txt"
    local removed_file="/tmp/pkgdiff_removed_$$.txt"

    # ---- デバイス情報検出 ----
    echo ""
    echo "[pkg-diff] Detecting device information..."
    if ! _pkgdiff_detect_device; then
        return 1
    fi

    echo "  Profile  : ${_PKGDIFF_PROFILE}"
    echo "  Version  : ${_PKGDIFF_VERSION}"
    echo "  Target   : ${_PKGDIFF_VENDOR}/${_PKGDIFF_SUBTARGET}"
    echo "  PKG MGR  : ${_PKGDIFF_PKG_MGR}"
    echo ""

    # ---- baseline取得 ----
    echo "[pkg-diff] Fetching baseline from profiles.json..."
    if ! _pkgdiff_get_baseline > "$baseline_file"; then
        rm -f "$baseline_file"
        return 1
    fi

    local baseline_count
    baseline_count=$(wc -l < "$baseline_file" | tr -d ' ')
    echo "  Baseline : ${baseline_count} packages"

    # ---- 現在のパッケージリスト取得 ----
    echo "[pkg-diff] Reading installed packages..."
    if ! _pkgdiff_get_current > "$current_file"; then
        rm -f "$baseline_file" "$current_file"
        return 1
    fi

    local current_count
    current_count=$(wc -l < "$current_file" | tr -d ' ')
    echo "  Installed: ${current_count} packages"
    echo ""

    # ---- diff計算 ----
    # comm -23: current にあって baseline にないもの = 追加分
    # comm -13: baseline にあって current にないもの = 削除分
    # ※ 両ファイルはすでに LC_ALL=C sort 済み
    comm -23 "$current_file" "$baseline_file" > "$added_file"
    comm -13 "$current_file" "$baseline_file" > "$removed_file"

    local added_count removed_count
    added_count=$(wc -l < "$added_file" | tr -d ' ')
    removed_count=$(wc -l < "$removed_file" | tr -d ' ')

    # ---- 出力生成 ----
    mkdir -p "$output_dir"

    {
        echo "============================================================"
        echo " pkg-diff result  $(date '+%Y-%m-%d %H:%M:%S')"
        echo "============================================================"
        echo " Profile  : ${_PKGDIFF_PROFILE}"
        echo " Version  : ${_PKGDIFF_VERSION}"
        echo " Target   : ${_PKGDIFF_VENDOR}/${_PKGDIFF_SUBTARGET}"
        echo " PKG MGR  : ${_PKGDIFF_PKG_MGR}"
        echo " Baseline : ${baseline_count} pkgs  |  Installed: ${current_count} pkgs"
        echo "------------------------------------------------------------"
        echo ""
        echo "[+] Added packages (${added_count})  ← not in baseline (user-installed)"
        echo "------------------------------------------------------------"
        if [ "$added_count" -gt 0 ]; then
            cat "$added_file"
        else
            echo "(none)"
        fi
        echo ""
        echo "[-] Removed packages (${removed_count})  ← in baseline but not installed"
        echo "------------------------------------------------------------"
        if [ "$removed_count" -gt 0 ]; then
            cat "$removed_file"
        else
            echo "(none)"
        fi
        echo ""
        echo "============================================================"
        echo " [ Copy-paste: added packages ]"
        echo "============================================================"
        if [ "$added_count" -gt 0 ]; then
            tr '\n' ' ' < "$added_file" | sed 's/[[:space:]]*$//'
            echo ""
        else
            echo "(none)"
        fi
        echo ""
        echo "============================================================"
        echo " Saved to: ${output_file}"
        echo "============================================================"
    } | tee "$output_file"

    # ---- クリーンアップ ----
    rm -f "$baseline_file" "$current_file" "$added_file" "$removed_file"

    return 0
}

# =============================================================================
# Entry point (standalone execution only)
# When used as aios2 template, aios2 appends "pkgdiff_main -t" automatically.
# This guard prevents double-execution in that context.
# =============================================================================
[ "$(basename "$0")" = "pkg-diff.sh" ] && pkgdiff_main "$@"
