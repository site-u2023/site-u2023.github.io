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

SCRIPT_NAME="${0##*/}"
BASE_TMP_DIR="/tmp"
OUTPUT_DIR="$BASE_TMP_DIR/aios2"
OUTPUT_FILE="$OUTPUT_DIR/pkg-diff-result.txt"

# ビルドシステムがハードコートで追加するパッケージ (profiles.json に含まれない)
EXTRA_BASELINE="luci"

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
    tmp_json="$BASE_TMP_DIR/pkgdiff_profiles_$$.json"

    # ステータス表示は stderr へ（stdout はパッケージリスト専用）
    echo "  Fetching: $url" >&2

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
    local check default_check
    check=$(jsonfilter -i "$tmp_json" -e "@.profiles['${_PKGDIFF_PROFILE}'].device_packages[0]" 2>/dev/null)
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
    #   END → defaults + extras を統合出力（重複排除はsort -uで）
    {
        {
            jsonfilter -i "$tmp_json" -e '@.default_packages[*]' 2>/dev/null \
                | sed 's/^/D /'
            jsonfilter -i "$tmp_json" -e "@.profiles['${_PKGDIFF_PROFILE}'].device_packages[*]" 2>/dev/null \
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
        '

        # profiles.json に含まれないハードコート分を追加
        for _pkg in $EXTRA_BASELINE; do
            echo "$_pkg"
        done
    } | LC_ALL=C sort -u

    rm -f "$tmp_json"
    return 0
}

# =============================================================================
# Get currently installed package list (explicit installs only)
#
# apk:  /etc/apk/world に明示インストール分のみ記録されている
#       バージョン接尾辞 (=1690~...) を除去して比較用に整形
#
# opkg: /usr/lib/opkg/status から Status: install user installed を抽出
#       （ユーザーが明示的にインストールしたもの）
#       overlay が無い / status が無い場合は opkg list-installed にフォールバック
#
# Output: sorted package list, one per line, to stdout
# =============================================================================
_pkgdiff_get_current() {
    case "$_PKGDIFF_PKG_MGR" in
        apk)
            if [ -f /etc/apk/world ]; then
                # バージョンピン (=version) を除去、空行スキップ
                sed 's/=.*//' /etc/apk/world | grep -v '^$' | LC_ALL=C sort -u
            else
                echo "WARNING: /etc/apk/world not found, falling back to apk info" >&2
                apk info 2>/dev/null | LC_ALL=C sort -u
            fi
            ;;
        opkg)
            if [ -f /usr/lib/opkg/status ]; then
                # user installed のみ抽出（ファームウェアに含まれないパッケージ）
                awk '/^Package:/{pkg=$2} /^Status: install user installed/{print pkg}' \
                    /usr/lib/opkg/status | LC_ALL=C sort -u
            else
                echo "WARNING: /usr/lib/opkg/status not found, falling back to opkg list-installed" >&2
                opkg list-installed 2>/dev/null | awk '{print $1}' | LC_ALL=C sort -u
            fi
            ;;
    esac
}

# =============================================================================
# Filter top-level packages (remove packages that are dependencies of others)
#
# Added パッケージの中で、他の Added パッケージの依存になっているものを除外し、
# 最上位パッケージのみを返す。
# 例: luci-i18n-ttyd-ja が Added なら、その依存 luci-app-ttyd は除外される
#
# $1: added_file (sorted, one package per line)
# Output: top-level packages to stdout (sorted)
# =============================================================================
_pkgdiff_filter_toplevel() {
    local added_file="$1"
    local all_deps="$BASE_TMP_DIR/pkgdiff_alldeps_$$.txt"

    echo "[pkg-diff] Resolving dependency tree for top-level extraction..." >&2

    : > "$all_deps"

    case "$_PKGDIFF_PKG_MGR" in
        apk)
            # apk info --depends <pkg> 出力:
            #   <pkg>-<ver> depends on:
            #   dep1
            #   dep2
            # ヘッダ行 ("depends on:") と空行を除外し、パッケージ名のみ抽出
            while IFS= read -r pkg; do
                apk info --depends "$pkg" 2>/dev/null \
                    | grep -v "depends on:" \
                    | grep -v "^$" \
                    | sed 's/[><=~].*//' \
                    | tr -d ' '
            done < "$added_file" | LC_ALL=C sort -u > "$all_deps"
            ;;
        opkg)
            # opkg depends <pkg> 出力:
            #   <pkg> depends on:
            #       dep1
            #       dep2
            while IFS= read -r pkg; do
                opkg depends "$pkg" 2>/dev/null \
                    | grep "^\t" \
                    | awk '{print $1}'
            done < "$added_file" | LC_ALL=C sort -u > "$all_deps"
            ;;
    esac

    # all_deps と added_file の積集合 = 他パッケージの依存として含まれるもの
    # added_file からそれを除外 = 最上位パッケージ
    awk 'NR==FNR{deps[$1]=1;next} !deps[$1]' "$all_deps" "$added_file" \
        | LC_ALL=C sort

    rm -f "$all_deps"
}

# =============================================================================
# Main function
# $1: "-t" when called from aios2 template (enables whiptail inputbox display)
# =============================================================================
pkgdiff_main() {
    [ "${_PKGDIFF_DID_RUN:-0}" = "1" ] && return 0
    _PKGDIFF_DID_RUN=1

    local baseline_file="$BASE_TMP_DIR/pkgdiff_baseline_$$.txt"
    local current_file="$BASE_TMP_DIR/pkgdiff_current_$$.txt"
    local added_file="$BASE_TMP_DIR/pkgdiff_added_$$.txt"
    local removed_file="$BASE_TMP_DIR/pkgdiff_removed_$$.txt"

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
    echo "  Installed: ${current_count} packages (explicit)"
    echo ""

    # ---- diff計算 (comm不要: awk で実装) ----
    # current にあって baseline にないもの = 追加分
    awk 'NR==FNR{base[$1]=1;next} !base[$1]' "$baseline_file" "$current_file" \
        | LC_ALL=C sort > "$added_file"

    # baseline にあって current にないもの = 削除分
    awk 'NR==FNR{curr[$1]=1;next} !curr[$1]' "$current_file" "$baseline_file" \
        | LC_ALL=C sort > "$removed_file"

    local added_count removed_count
    added_count=$(wc -l < "$added_file" | tr -d ' ')
    removed_count=$(wc -l < "$removed_file" | tr -d ' ')

    # ---- 依存解決: コピペ用トップレベル抽出 ----
    local toplevel_file="$BASE_TMP_DIR/pkgdiff_toplevel_$$.txt"
    local toplevel_count=0

    if [ "$added_count" -gt 0 ]; then
        _pkgdiff_filter_toplevel "$added_file" > "$toplevel_file"
        toplevel_count=$(wc -l < "$toplevel_file" | tr -d ' ')
    else
        : > "$toplevel_file"
    fi

    # ---- コピペ用文字列生成 ----
    local toplevel_str=""
    if [ "$toplevel_count" -gt 0 ]; then
        toplevel_str=$(tr '\n' ' ' < "$toplevel_file" | sed 's/[[:space:]]*$//')
    fi

    # ---- レポートファイル保存 (常に全詳細を保存) ----
    mkdir -p "$OUTPUT_DIR"

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
        echo " [ Copy-paste: top-level packages (${toplevel_count}) ]"
        echo "   Dependencies auto-resolved; only root packages listed."
        echo "============================================================"
        if [ -n "$toplevel_str" ]; then
            echo "$toplevel_str"
        else
            echo "(none)"
        fi
        echo ""
        echo "============================================================"
        echo " Saved to: ${OUTPUT_FILE}"
        echo "============================================================"
    } > "$OUTPUT_FILE"

    # ---- 画面表示 ----
    if [ "$1" = "-t" ] && command -v whiptail >/dev/null 2>&1; then
        # aios2 モード: whiptail inputbox でコピペ用リストを表示
        local wt_text="Top-level packages (${toplevel_count})"
        wt_text="${wt_text}\nAdded: ${added_count}  Removed: ${removed_count}"
        wt_text="${wt_text}\n\nSaved to: ${OUTPUT_FILE}"

        whiptail --title "pkg-diff result" \
            --inputbox "$wt_text" \
            12 76 \
            "$toplevel_str" \
            3>&1 1>&2 2>&3 || true
    else
        # スタンドアロン / copy-paste モード: ターミナルに表示
        cat "$OUTPUT_FILE"
    fi

    # ---- クリーンアップ ----
    rm -f "$baseline_file" "$current_file" "$added_file" "$removed_file" "$toplevel_file"

    return 0
}

# =============================================================================
# Entry point
# Works in all execution contexts:
#   - standalone : sh pkg-diff.sh
#   - copy-paste : pasted into terminal
#   - aios2      : appends pkgdiff_main -t; run-once flag prevents double-execution
# =============================================================================
pkgdiff_main "$@"
