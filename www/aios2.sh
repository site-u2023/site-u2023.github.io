#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC2154,SC2086,SC3001,SC3043
# OpenWrt Device Setup Tool - CLI Version
# ASU (Attended SysUpgrade) Compatible
# Common Functions (UI-independent)

VERSION="R7.1215.1421"

# =============================================================================
# Package Management Architecture
# =============================================================================
#
# 【Package Cache Structure】
# _PACKAGE_NAME_CACHE format:
#   id=name=uniqueId=installOptions=enableVar=dependencies=hidden=virtual=reboot=checked
#
# Field details:
#   1. id              - Package name for installation
#   2. name            - Display name in UI
#   3. uniqueId        - Unique identifier (for multiple entries with same id)
#   4. installOptions  - Installation option key (e.g. "ignoreDeps")
#   5. enableVar       - Variable name to set in setup.sh when selected
#   6. dependencies    - Comma-separated list of dependency package ids
#   7. hidden          - "true" if hidden, "false" otherwise
#   8. virtual         - "true" to skip availability check, "false" otherwise
#   9. reboot          - "true" if reboot required, "false" otherwise
#  10. checked         - "true" if selected by default, "false" otherwise
#
# Example:
#   apache=htpasswd=htpasswd-from-apache=ignoreDeps=enable_htpasswd=libaprutil=false=false=false=false
#   luci-app-ttyd=luci-app-ttyd====enable_ttyd==false=false=false=true
#   docker=docker======true=false=false=false
#
# 【uniqueId Handling】
# - If uniqueId exists: ALL checks use uniqueId (NOT id)
# - If uniqueId absent: use id for checks
# - Example: id="collectd", uniqueId="collectd-htop"
#   → Dependency check uses uniqueId="collectd-htop" ONLY
#
# 【Dependency Resolution Order】
# 1. Check if uniqueId exists
# 2. If uniqueId exists → search dependent_ids by uniqueId
# 3. If uniqueId absent → search dependent_ids by id
# 4. Dependent package (is_dependent=1) → display with indent
# 5. Independent package (is_dependent=0) → execute hidden check
#
# 【hidden Attribute】
# - hidden: true packages are ALWAYS hidden (both independent and dependent)
# - NOT displayed even as dependent packages
#
# 【Package Availability Check】
# check_package_available() verifies package existence in repository:
# - Builds cache from ALL feeds: base, packages, luci, routing, telephony, community, kmods
# - Cache file: $CONFIG_DIR/pkg_availability_cache.txt (one package per line)
# - Returns 0 (available) or 1 (not available)
# - Exceptions:
#   * virtual=true packages: always return 0 (skip check)
#   * custom_feeds caller: always return 0 (skip check)
#   * ALL other packages (including dependents): MUST pass availability check
#
# 【Package Installation Requirements】
# postinst.json structure:
# - **id**: Package name to install (e.g. "apache")
# - **name**: Display name in UI (e.g. "htpasswd")
# - **uniqueId**: Internal identifier for distinguishing multiple entries with same id
#               (e.g. "htpasswd-from-apache")
# =============================================================================

SCRIPT_NAME=$(basename "$0")
BASE_TMP_DIR="/tmp"
CONFIG_DIR="$BASE_TMP_DIR/aios2"
BACKUP_DIR="/etc/aios2/backup"
RESTORE_PATH_CONFIG="/etc/aios2/restore_path.txt"
MAX_BACKUPS="10"
BOOTSTRAP_URL="https://site-u.pages.dev/www"
AUTO_CONFIG_API_URL="https://auto-config.site-u.workers.dev/"
BASE_URL=""
PACKAGES_URL=""
SETUP_JSON_URL=""
SETUP_TEMPLATE_URL=""
POSTINST_TEMPLATE_URL=""
CUSTOMFEEDS_JSON_URL=""
CUSTOMSCRIPTS_JSON_URL=""
PACKAGES_DB_PATH=""
SETUP_DB_PATH=""
SETUP_TEMPLATE_PATH=""
LANGUAGE_PATH_TEMPLATE=""
CUSTOMFEEDS_DB_PATH=""
POSTINST_TEMPLATE_PATH=""
MEM_FREE_MB=""
FLASH_FREE_MB=""
LAN_IF=""
LAN_ADDR=""
LAN_ADDR6=""
DISTRIB_RELEASE=""
OPENWRT_VERSION=""

BREADCRUMB_SEP=" > "

_PACKAGE_NAME_CACHE=""
_PACKAGE_NAME_LOADED=0
_SELECTED_PACKAGES_CACHE_LOADED=0
_SELECTED_CUSTOM_CACHE_LOADED=0
_PACKAGE_COMPAT_LOADED=0
_SELECTED_PACKAGES_CACHE=""
_SELECTED_CUSTOM_CACHE=""
_PACKAGE_COMPAT_CACHE=""
_CONDITIONAL_PACKAGES_CACHE=""
_CONDITIONAL_PACKAGES_LOADED=0
_CUSTOMFEED_CATEGORIES_CACHE=""
_CUSTOMFEED_CATEGORIES_LOADED=0
_CATEGORIES_CACHE=""
_CATEGORIES_LOADED=0
_SETUP_CATEGORIES_CACHE=""
_SETUP_CATEGORIES_LOADED=0
_PACKAGE_AVAILABILITY_CACHE=""
_PACKAGE_AVAILABILITY_LOADED=0

clear_selection_cache() {
    _SELECTED_PACKAGES_CACHE_LOADED=0
    _SELECTED_CUSTOM_CACHE_LOADED=0
    _SELECTED_PACKAGES_CACHE=""
    _SELECTED_CUSTOM_CACHE=""
}

expand_template() {
    local template="$1"
    shift
    
    local sed_cmds=""
    
    while [ $# -gt 0 ]; do
        local key="$1"
        local value="$2"
        sed_cmds="${sed_cmds}s|{$key}|$value|g;"
        shift 2
    done
    
    echo "$template" | sed "$sed_cmds"
}

# adguardhome
# Operation mode variables (set by command line options)
INSTALL_MODE=""        # -i: openwrt|official
REMOVE_MODE=""         # -r: auto|manual
NO_YAML=""             # -n: skip YAML generation
SKIP_RESOURCE_CHECK="" # -c: skip resource check
UPDATE_CREDENTIALS=""  # -m: update credentials mode
TUI_MODE=""            # -t: tui mode

# URL and Path Configuration

PACKAGES_JSON="$CONFIG_DIR/postinst.json"
SETUP_JSON="$CONFIG_DIR/setup.json"
AUTO_CONFIG_JSON="$CONFIG_DIR/auto_config.json"
PACKAGE_MANAGER_JSON="$CONFIG_DIR/package-manager.json"
SELECTED_PACKAGES="$CONFIG_DIR/selected_packages.txt"
SELECTED_CUSTOM_PACKAGES="$CONFIG_DIR/selected_custom_packages.txt"
SETUP_VARS="$CONFIG_DIR/setup_vars.sh"
CUSTOMFEEDS_JSON="$CONFIG_DIR/customfeeds.json"
CUSTOMSCRIPTS_JSON="$CONFIG_DIR/customscripts.json"

TPL_POSTINST="$CONFIG_DIR/tpl_postinst.sh"
TPL_SETUP="$CONFIG_DIR/tpl_setup.sh"

print_banner_unicode() {
    printf "\n"
    printf       "\033[35m       ██ █\033[0m\n"
    printf       "\033[34m ████  ███   ████   █████\033[0m  \033[37m█████\033[0m\n"
    printf       "\033[32m    ██  ██  ██  ██ ██\033[0m          \033[37m██\033[0m\n"
    printf       "\033[33m █████  ██  ██  ██  █████\033[0m   \033[37m████\033[0m\n"
    printf "\033[38;5;208m██  ██  ██  ██  ██      ██\033[0m\033[37m ██\033[0m\n"
    printf       "\033[31m █████ ████  ████  ██████\033[0m  \033[37m██████\033[0m\n"
    printf "\n"
    printf       "\033[37m         Vr.%s\033[0m\n" "$VERSION"
    printf "\n"
    printf "\033[1;35mThis script is used at your own risk\033[0m\n"
    printf "\n"
}

banner_supported() {
    echo "$TERM" | grep -Eq 'xterm-256color|screen-256color|ttyd'
}

print_banner() {
    if banner_supported; then
        print_banner_unicode
    else
        printf "\aios2 Vr.%s\n\n" "$VERSION"
    fi
}

load_config_from_js() {
    local CONFIG_JS="$CONFIG_DIR/config.js"
    local CONFIG_CONTENT
    
    CONFIG_CONTENT=$(cat "$CONFIG_JS")
    
    BASE_URL_PART=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "base_url:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    BASE_PATH_PART=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "base_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    [ -z "$AUTO_CONFIG_API_URL" ] && AUTO_CONFIG_API_URL=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "auto_config_api_url:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    ASU_URL=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "asu_url:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    PACKAGES_DB_PATH=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "packages_db_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    POSTINST_TEMPLATE_PATH=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "postinst_template_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    SETUP_DB_PATH=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "setup_db_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    SETUP_TEMPLATE_PATH=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "setup_template_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    CUSTOMFEEDS_DB_PATH=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "customfeeds_db_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    CUSTOMSCRIPTS_DB_PATH=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "customscripts_db_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    LANGUAGE_PATH_TEMPLATE=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "language_path_template:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    WHIPTAIL_UI_PATH=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "whiptail_ui_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    SIMPLE_UI_PATH=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "simple_ui_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    WHIPTAIL_FALLBACK_PATH=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "whiptail_fallback_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    PACKAGE_MANAGER_CONFIG_PATH=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "package_manager_config_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    
    BASE_URL="${BASE_URL_PART}/${BASE_PATH_PART}"
    
    PACKAGES_URL="${BASE_URL}/${PACKAGES_DB_PATH}"
    POSTINST_TEMPLATE_URL="${BASE_URL}/${POSTINST_TEMPLATE_PATH}"
    SETUP_JSON_URL="${BASE_URL}/${SETUP_DB_PATH}"
    SETUP_TEMPLATE_URL="${BASE_URL}/${SETUP_TEMPLATE_PATH}"
    CUSTOMFEEDS_JSON_URL="${BASE_URL}/${CUSTOMFEEDS_DB_PATH}"
    CUSTOMSCRIPTS_JSON_URL="${BASE_URL}/${CUSTOMSCRIPTS_DB_PATH}"
    WHIPTAIL_FALLBACK_URL="${BASE_URL}/${WHIPTAIL_FALLBACK_PATH}"
    PACKAGE_MANAGER_CONFIG_URL="${BASE_URL}/${PACKAGE_MANAGER_CONFIG_PATH}"
 
    local CACHE_BUSTER="?t=$(date +%s)"
    WHIPTAIL_UI_URL="${BASE_URL}/${WHIPTAIL_UI_PATH}${CACHE_BUSTER}"
    SIMPLE_UI_URL="${BASE_URL}/${SIMPLE_UI_PATH}${CACHE_BUSTER}"
    
    {
        echo "[DEBUG] Config loaded: BASE_URL=$BASE_URL"
        echo "[DEBUG] AUTO_CONFIG_API_URL=$AUTO_CONFIG_API_URL"
        echo "[DEBUG] ASU_URL=$ASU_URL"
    } >> "$CONFIG_DIR/debug.log"
    
    return 0
}

# UI Common Functions

build_breadcrumb() {
    local result=""
    local first=1
    
    for level in "$@"; do
        [ -z "$level" ] && continue
        if [ $first -eq 1 ]; then
            result="$level"
            first=0
        else
            result="${result}${BREADCRUMB_SEP}${level}"
        fi
    done
    
    echo "$result"
}

set_var() {
    local var_name="$1"
    local var_value="$2"
    sed -i "/^${var_name}=/d" "$SETUP_VARS"
    [ -n "$var_value" ] && echo "${var_name}='${var_value}'" >> "$SETUP_VARS"
}

# UI Mode Selection

select_ui_mode() {
    local whiptail_pkg="whiptail"
    local choice
    
    echo "Select UI Mode:"
    echo "1) whiptail (Dialog TUI)"
    echo "2) simple   (List TUI)"
    
    printf "Select [1]: "
    read -r choice
    
    case "$choice" in
        2)
            UI_MODE="simple"
            ;;
        *)
            UI_MODE="whiptail"
            if ! command -v whiptail >/dev/null 2>&1; then
                echo "Installing whiptail..."
                
                # パッケージリストを更新
                echo "Updating package lists..."
                eval "$PKG_UPDATE_CMD" || {
                    echo "Warning: Failed to update package lists"
                }
                
                if install_package $whiptail_pkg; then
                    echo "Installation successful."
                else
                    echo "Installation failed. Falling back to simple mode."
                    UI_MODE="simple"
                fi
            fi
            ;;
    esac
}

# Package Manager Detection

check_packages_installed() {
    MISSING_UI_PKGS=""
    
    for pkg in "$@"; do
        if [ "$PKG_MGR" = "opkg" ]; then
            opkg list-installed | grep -q "^${pkg}[[:space:]]*-" || MISSING_UI_PKGS="$MISSING_UI_PKGS $pkg"
        elif [ "$PKG_MGR" = "apk" ]; then
            apk info -e "$pkg" >/dev/null 2>&1 || MISSING_UI_PKGS="$MISSING_UI_PKGS $pkg"
        fi
    done
    
    [ -z "$MISSING_UI_PKGS" ]
}

load_package_manager_config() {
    local config_json="$CONFIG_DIR/package-manager.json"
    
    [ ! -f "$config_json" ] && return 1
    
    # ★ 1. 最初にパッケージマネージャーを検出
    if command -v opkg >/dev/null 2>&1; then
        PKG_MGR="opkg"
    elif command -v apk >/dev/null 2>&1; then
        PKG_MGR="apk"
    else
        echo "Error: No supported package manager found" >&2
        return 1
    fi
    
    echo "[DEBUG] PKG_MGR detected: $PKG_MGR" >> "$CONFIG_DIR/debug.log"
    
    # ★ 2. 検出したPKG_MGRを使ってJSONから読み込む
    PKG_EXT=$(jsonfilter -i "$config_json" -e "@.${PKG_MGR}.ext")
    
    PKG_OPTION_IGNORE_DEPS=$(jsonfilter -i "$config_json" -e "@.${PKG_MGR}.options.ignoreDeps")
    PKG_OPTION_FORCE_OVERWRITE=$(jsonfilter -i "$config_json" -e "@.${PKG_MGR}.options.forceOverwrite")
    PKG_OPTION_ALLOW_UNTRUSTED=$(jsonfilter -i "$config_json" -e "@.${PKG_MGR}.options.allowUntrusted")
    
    local install_template remove_template update_template upgrade_template
    
    install_template=$(jsonfilter -i "$config_json" -e "@.${PKG_MGR}.installCommand")
    remove_template=$(jsonfilter -i "$config_json" -e "@.${PKG_MGR}.removeCommand")
    update_template=$(jsonfilter -i "$config_json" -e "@.${PKG_MGR}.updateCommand")
    upgrade_template=$(jsonfilter -i "$config_json" -e "@.${PKG_MGR}.upgradeCommand")
    
    PKG_INSTALL_CMD_TEMPLATE=$(expand_template "$install_template" \
        "allowUntrusted" "$PKG_OPTION_ALLOW_UNTRUSTED" \
        "ignoreDeps" "$PKG_OPTION_IGNORE_DEPS" \
        "forceOverwrite" "$PKG_OPTION_FORCE_OVERWRITE")
    
    PKG_REMOVE_CMD_TEMPLATE=$(expand_template "$remove_template")
    PKG_UPDATE_CMD=$(expand_template "$update_template")
    PKG_UPGRADE_CMD=$(expand_template "$upgrade_template")

    export PKG_MGR
    export PKG_EXT
    export PKG_INSTALL_CMD_TEMPLATE
    export PKG_REMOVE_CMD_TEMPLATE
    export PKG_UPDATE_CMD
    export PKG_UPGRADE_CMD
    export PKG_OPTION_IGNORE_DEPS
    export PKG_OPTION_FORCE_OVERWRITE
    export PKG_OPTION_ALLOW_UNTRUSTED
}

install_package() {
    local package="$1"
    local cmd
    
    cmd=$(expand_template "$PKG_INSTALL_CMD_TEMPLATE" "package" "$package")
    
    eval "$cmd"
}

# installOptionsキー名を実際のオプション値に変換
convert_install_option() {
    local opt_key="$1"
    [ -z "$opt_key" ] && return
    
    jsonfilter -i "$PACKAGE_MANAGER_JSON" -e "@.${PKG_MGR}.options.${opt_key}" 2>/dev/null
}

init() {
    local LOCK_FILE="$CONFIG_DIR/.aios2.lock"
    
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$BACKUP_DIR"
    
    if [ -f "$LOCK_FILE" ]; then
        local old_pid
        old_pid=$(cat "$LOCK_FILE" 2>/dev/null)
        
        if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
            echo "Another instance (PID: $old_pid) is running."
            echo "Multiple instances can run simultaneously, but may overwrite each other's configuration."
            printf "Continue anyway? (y/n): "
            read -r answer
            if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
                exit 1
            fi
        else
            rm -f "$LOCK_FILE"
        fi
    fi
    
    echo "$$" > "$LOCK_FILE"
    trap "rm -f '$LOCK_FILE'" EXIT INT TERM
    
    # 自分自身を除外してキャッシュファイルを削除
    local self_script
    self_script="$(basename "$0")"
    
    # JSON, TXT, ログファイルは全削除
    rm -f "$CONFIG_DIR"/*.json "$CONFIG_DIR"/*.txt "$CONFIG_DIR"/debug.log 2>/dev/null
    
    # シェルスクリプトは自分自身以外を削除
    for file in "$CONFIG_DIR"/*.sh; do
        [ -f "$file" ] || continue
        [ "$(basename "$file")" = "$self_script" ] && continue
        rm -f "$file"
    done
    
    load_config_from_js || {
        echo "Fatal: Cannot load configuration"
        return 1
    }

    # キャッシュ変数の完全初期化（unset）
    unset _PACKAGE_NAME_CACHE
    unset _SELECTED_PACKAGES_CACHE
    unset _SELECTED_CUSTOM_CACHE
    unset _PACKAGE_COMPAT_CACHE
    unset _CONDITIONAL_PACKAGES_CACHE
    unset _CUSTOMFEED_CATEGORIES_CACHE
    unset _CATEGORIES_CACHE
    unset _SETUP_CATEGORIES_CACHE
    unset _TRANSLATIONS_LOADED
    unset _PACKAGE_AVAILABILITY_CACHE
    unset _TRANSLATIONS_DATA
    unset _TRANSLATIONS_EN_LOADED
    unset _TRANSLATIONS_EN_DATA
    unset _CURRENT_LANG
    
    # ★ パッケージマネージャー関連変数を確実に削除
    unset PKG_MGR
    unset PKG_EXT
    unset PKG_INSTALL_CMD_TEMPLATE
    unset PKG_REMOVE_CMD_TEMPLATE
    unset PKG_UPDATE_CMD
    unset PKG_UPGRADE_CMD
    unset PKG_OPTION_IGNORE_DEPS
    unset PKG_OPTION_FORCE_OVERWRITE
    unset PKG_OPTION_ALLOW_UNTRUSTED
    
    # フラグを明示的に0に設定
    _PACKAGE_NAME_LOADED=0
    _SELECTED_PACKAGES_CACHE_LOADED=0
    _SELECTED_CUSTOM_CACHE_LOADED=0
    _PACKAGE_COMPAT_LOADED=0
    _CONDITIONAL_PACKAGES_LOADED=0
    _CUSTOMFEED_CATEGORIES_LOADED=0
    _CATEGORIES_LOADED=0
    _SETUP_CATEGORIES_LOADED=0
    _PACKAGE_AVAILABILITY_LOADED=0
    
    # ファイル初期化
    : > "$SELECTED_PACKAGES"
    : > "$SELECTED_CUSTOM_PACKAGES"
    : > "$SETUP_VARS"
    : > "$CONFIG_DIR/debug.log"
    
    echo "[DEBUG] $(date): Init complete, all caches cleared (except $self_script)" >> "$CONFIG_DIR/debug.log"
}

# Language and Translation

download_language_json() {
    local lang="${1:-en}"
    local lang_url="${BASE_URL}/$(echo "$LANGUAGE_PATH_TEMPLATE" | sed "s/{lang}/${lang}/")"
    local output_file="$CONFIG_DIR/lang_${lang}.json"
    
    __download_file_core "$lang_url" "$output_file"
    return $?
}

translate() {
    local key="$1"
    local lang="${AUTO_LANGUAGE:-en}"
    local lang_file="$CONFIG_DIR/lang_${lang}.json"
    local translation
    
    # 言語が変わったらキャッシュをクリア
    if [ "$_CURRENT_LANG" != "$lang" ]; then
        unset _TRANSLATIONS_LOADED
        unset _TRANSLATIONS_DATA
        _CURRENT_LANG="$lang"
    fi
    
    # キャッシュチェック
    if [ -z "$_TRANSLATIONS_LOADED" ]; then
        if [ -f "$lang_file" ]; then
            _TRANSLATIONS_DATA=$(cat "$lang_file" 2>/dev/null)
        fi
        _TRANSLATIONS_LOADED=1
    fi
    
    translation=$(echo "$_TRANSLATIONS_DATA" | jsonfilter -e "@['$key']" 2>/dev/null)
    
    if [ -n "$translation" ]; then
        echo "$translation"
        return 0
    fi
    
    # フォールバック: 英語
    if [ "$lang" != "en" ] && [ -f "$CONFIG_DIR/lang_en.json" ]; then
        if [ -z "$_TRANSLATIONS_EN_LOADED" ]; then
            _TRANSLATIONS_EN_DATA=$(cat "$CONFIG_DIR/lang_en.json" 2>/dev/null)
            _TRANSLATIONS_EN_LOADED=1
        fi
        
        translation=$(echo "$_TRANSLATIONS_EN_DATA" | jsonfilter -e "@['$key']" 2>/dev/null)
        
        if [ -n "$translation" ]; then
            echo "$translation"
            return 0
        fi
    fi
    
    echo "$key"
}

# File Downloads

download_file_with_cache() {
    local url="$1"
    local output_path="$2"
    
    if [ -f "$output_path" ] && [ -s "$output_path" ]; then
        return 0
    fi
    
    __download_file_core "$url" "$output_path"
    return $?
}

download_setup_json() {
    fetch_cached_template "$SETUP_JSON_URL" "$SETUP_JSON"
    return $?
}

download_postinst_json() {
    download_file_with_cache "$PACKAGES_URL" "$PACKAGES_JSON"
    return $?
}

# Device Information

get_device_info() {
    if [ -f /etc/board.json ]; then
        DEVICE_MODEL=$(jsonfilter -i /etc/board.json -e '@.model.name' 2>/dev/null)
    fi
    
    if [ -f /etc/openwrt_release ]; then
        DEVICE_TARGET=$(grep 'DISTRIB_TARGET' /etc/openwrt_release 2>/dev/null | cut -d"'" -f2)
        DEVICE_ARCH=$(grep 'DISTRIB_ARCH' /etc/openwrt_release 2>/dev/null | cut -d"'" -f2)
    fi
    
    # vendor/subtarget分離
    if [ -n "$DEVICE_TARGET" ]; then
        DEVICE_VENDOR=$(echo "$DEVICE_TARGET" | cut -d'/' -f1)
        DEVICE_SUBTARGET=$(echo "$DEVICE_TARGET" | cut -d'/' -f2)
    fi
    
    [ -z "$DEVICE_MODEL" ] && DEVICE_MODEL="Unknown"
    [ -z "$DEVICE_TARGET" ] && DEVICE_TARGET="unknown/unknown"
    [ -z "$DEVICE_ARCH" ] && DEVICE_ARCH="unknown"
}

reset_detected_conn_type() {
    if [ -n "$MAPE_BR" ] && [ -n "$MAPE_EALEN" ]; then
        DETECTED_CONN_TYPE="mape"
    elif [ -n "$DSLITE_AFTR" ]; then
        DETECTED_CONN_TYPE="dslite"
    else
        DETECTED_CONN_TYPE="unknown"
    fi
}

# APIダウンロード
download_api_with_retry() {
    echo "[DEBUG] Starting API download: $AUTO_CONFIG_API_URL" >> "$CONFIG_DIR/debug.log"
    
    if ! __download_file_core "$AUTO_CONFIG_API_URL" "$AUTO_CONFIG_JSON"; then
        echo ""
        echo "ERROR: API error"
        echo "[DEBUG] AUTO_CONFIG_API_URL=$AUTO_CONFIG_API_URL"
        echo "[DEBUG] AUTO_CONFIG_JSON=$AUTO_CONFIG_JSON"
        ls -la "$AUTO_CONFIG_JSON" 2>&1
        echo ""
        printf "Press [Enter] to exit. "
        read -r _
        exit 1
    fi
    
    # JSON validation
    if ! jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.language' >/dev/null 2>&1; then
        echo "[DEBUG] JSON validation failed" >> "$CONFIG_DIR/debug.log"
        echo ""
        echo "ERROR: Invalid API response"
        echo ""
        printf "Press [Enter] to exit. "
        read -r _
        exit 1
    fi
    
    echo "[DEBUG] API download and validation successful" >> "$CONFIG_DIR/debug.log"
    return 0
}

get_language_code() {
    AUTO_LANGUAGE=$(uci get luci.main.lang 2>/dev/null)
    echo "[DEBUG] get_language_code: Initial AUTO_LANGUAGE='$AUTO_LANGUAGE'" >> "$CONFIG_DIR/debug.log"
    
    if [ "$AUTO_LANGUAGE" = "auto" ] || [ -z "$AUTO_LANGUAGE" ]; then
        local available_langs
        available_langs=$(uci show luci.languages 2>/dev/null | grep "^luci.languages\." | cut -d. -f3 | cut -d= -f1 | sort -u)
        local lang_count
        lang_count=$(echo "$available_langs" | wc -l)
        
        echo "[DEBUG] get_language_code: available_langs='$available_langs', lang_count=$lang_count" >> "$CONFIG_DIR/debug.log"
        
        if [ "$lang_count" -eq 1 ]; then
            AUTO_LANGUAGE="$available_langs"
            echo "[DEBUG] get_language_code: Single language detected, AUTO_LANGUAGE='$AUTO_LANGUAGE'" >> "$CONFIG_DIR/debug.log"
        else
            AUTO_LANGUAGE=""
            echo "[DEBUG] get_language_code: Multiple languages detected, AUTO_LANGUAGE cleared" >> "$CONFIG_DIR/debug.log"
        fi
    fi
    
    [ -z "$AUTO_LANGUAGE" ] && AUTO_LANGUAGE=""
    echo "[DEBUG] get_language_code: Final AUTO_LANGUAGE='$AUTO_LANGUAGE'" >> "$CONFIG_DIR/debug.log"
}

get_extended_device_info() {
    # LuCIから言語設定を事前取得
    get_language_code
    
    get_device_info
    OPENWRT_VERSION=$(grep 'DISTRIB_RELEASE' /etc/openwrt_release 2>/dev/null | cut -d"'" -f2)
    OPENWRT_VERSION_MAJOR=$(echo "$OPENWRT_VERSION" | cut -c 1-2) 
    
    # APIから値を抽出して変数に設定
    _set_api_value() {
        local var_name="$1"
        local json_path="$2"
        local value
        value=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e "@.${json_path}" 2>/dev/null)
        eval "${var_name}='${value}'"
    }
    
    # 基本情報
    _set_api_value 'AUTO_LANGUAGE'      'language'
    _set_api_value 'AUTO_TIMEZONE'      'timezone'
    _set_api_value 'AUTO_ZONENAME'      'zonename'
    _set_api_value 'AUTO_COUNTRY'       'country'
    _set_api_value 'ISP_NAME'           'isp'
    _set_api_value 'ISP_AS'             'as'
    _set_api_value 'ISP_IPV6'           'ipv6'
    
    # MAP-E
    _set_api_value 'MAPE_BR'            'mape.brIpv6Address'
    _set_api_value 'MAPE_EALEN'         'mape.eaBitLength'
    _set_api_value 'MAPE_IPV4_PREFIX'   'mape.ipv4Prefix'
    _set_api_value 'MAPE_IPV4_PREFIXLEN' 'mape.ipv4PrefixLength'
    _set_api_value 'MAPE_IPV6_PREFIX'   'mape.ipv6Prefix'
    _set_api_value 'MAPE_IPV6_PREFIXLEN' 'mape.ipv6PrefixLength'
    _set_api_value 'MAPE_PSIDLEN'       'mape.psidlen'
    _set_api_value 'MAPE_PSID_OFFSET'   'mape.psIdOffset'
    _set_api_value 'MAPE_GUA_PREFIX'    'mape.ipv6Prefix_gua'
    
    # DS-Lite
    _set_api_value 'DSLITE_AFTR'        'aftr.aftrFqdn'
    _set_api_value 'DSLITE_AFTR_TYPE'   'aftr.aftrType'
    _set_api_value 'DSLITE_JURISDICTION' 'aftr.jurisdiction'
    
    reset_detected_conn_type
    
    # デバイス情報（CPU, Storage, USB）
    DEVICE_CPU=$(grep -m1 "model name" /proc/cpuinfo | cut -d: -f2 | xargs 2>/dev/null)
    [ -z "$DEVICE_CPU" ] && DEVICE_CPU=$(grep -m1 "Hardware" /proc/cpuinfo | cut -d: -f2 | xargs 2>/dev/null)
    DEVICE_STORAGE=$(df -h / | awk 'NR==2 {print $2}')
    DEVICE_STORAGE_USED=$(df -h / | awk 'NR==2 {print $3}')
    DEVICE_STORAGE_AVAIL=$(df -h / | awk 'NR==2 {print $4}')
    
    if [ -d /sys/bus/usb/devices ]; then
        DEVICE_USB="Available"
    else
        DEVICE_USB="Not available"
    fi

    # リソース情報（数値、チェック用）
    MEM_FREE_KB=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
    if [ -z "$MEM_FREE_KB" ]; then
        BUFFERS_KB=$(awk '/^Buffers:/ {print $2}' /proc/meminfo)
        CACHED_KB=$(awk '/^Cached:/ {print $2}' /proc/meminfo)
        MEM_FREE_KB=$((BUFFERS_KB + CACHED_KB))
    fi
    MEM_FREE_MB=$((MEM_FREE_KB / 1024))
    
    FLASH_FREE_KB=$(df -k / | awk 'NR==2 {print $4}')
    FLASH_FREE_MB=$((FLASH_FREE_KB / 1024))
    
    # メモリ情報（表示用）
    MEM_TOTAL_KB=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
    MEM_TOTAL_MB=$((MEM_TOTAL_KB / 1024))
    DEVICE_MEM="${MEM_TOTAL_MB} MB"
    
    # LANアドレス取得
    LAN_IF="$(ubus call network.interface.lan status 2>/dev/null | jsonfilter -e '@.l3_device')"
    if [ -n "$LAN_IF" ]; then
        LAN_ADDR=$(ip -4 -o addr show dev "$LAN_IF" scope global 2>/dev/null | awk 'NR==1{sub(/\/.*/,"",$4); print $4}')
        LAN_ADDR6=$(ip -6 -o addr show dev "$LAN_IF" scope global 2>/dev/null | grep -v temporary | awk 'NR==1{sub(/\/.*/,"",$4); print $4}')
    fi
    
    echo "[DEBUG] MAPE_GUA_PREFIX='$MAPE_GUA_PREFIX'" >> "$CONFIG_DIR/debug.log"
}

# Device Info (JSON-driven)

get_deviceinfo_items() {
    jsonfilter -i "$SETUP_JSON" -e '@.deviceInfo.items[*].id' 2>/dev/null | grep -v '^$'
}

get_deviceinfo_item_property() {
    local item_id="$1"
    local property="$2"
    jsonfilter -i "$SETUP_JSON" -e "@.deviceInfo.items[@.id='$item_id'].${property}" 2>/dev/null | head -1
}

check_deviceinfo_condition() {
    local item_id="$1"
    local conditions
    
    conditions=$(jsonfilter -i "$SETUP_JSON" -e "@.deviceInfo.items[@.id='$item_id'].condition[*]" 2>/dev/null)
    
    [ -z "$conditions" ] && return 0
    
    while read -r var_name; do
        [ -z "$var_name" ] && continue
        local value
        value=$(eval "echo \$$var_name")
        [ -z "$value" ] && return 1
    done <<EOF
$conditions
EOF
    
    return 0
}

get_deviceinfo_value() {
    local item_id="$1"
    local source format
    
    source=$(get_deviceinfo_item_property "$item_id" "source")
    
    case "$source" in
        computed)
            format=$(get_deviceinfo_item_property "$item_id" "format")
            if [ -n "$format" ]; then
                echo "$format" | sed \
                    -e "s/{MEM_FREE_MB}/${MEM_FREE_MB}/g" \
                    -e "s/{DEVICE_MEM}/${DEVICE_MEM}/g" \
                    -e "s/{DEVICE_STORAGE_AVAIL}/${DEVICE_STORAGE_AVAIL}/g" \
                    -e "s/{DEVICE_STORAGE}/${DEVICE_STORAGE}/g"
            fi
            ;;
        current_lang)
            local current_lang
            current_lang=$(grep "^language=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
            [ -z "$current_lang" ] && current_lang="${AUTO_LANGUAGE}"
            echo "$current_lang"
            ;;
        *)
            eval "echo \$$source"
            ;;
    esac
}

build_deviceinfo_display() {
    local info=""
    
    for item_id in $(get_deviceinfo_items); do
        local item_type label value
        
        item_type=$(get_deviceinfo_item_property "$item_id" "type")
        
        if [ "$item_type" = "blank" ]; then
            info="${info}
"
            continue
        fi
        
        if ! check_deviceinfo_condition "$item_id"; then
            continue
        fi
        
        label=$(get_deviceinfo_item_property "$item_id" "label")
        value=$(get_deviceinfo_value "$item_id")
        
        [ -n "$value" ] && info="${info}${label}: ${value}
"
    done
    
    echo "$info"
}

# Package Management

# =============================================================================
# Package Availability Check
# =============================================================================
# Checks if a package is available in the package manager's repository
# Uses cache to avoid repeated checks
# Args:
#   $1 - package id (not name!)
#   $2 - caller ("normal" or "custom_feeds")
# Returns:
#   0 if package is available, 1 otherwise
# =============================================================================
# キャッシュ構築プロセス(PID)が生きていれば完了を待つ
wait_for_package_cache() {
    if [ -n "$CACHE_PKG_PID" ] && kill -0 "$CACHE_PKG_PID" 2>/dev/null; then
        echo "[DEBUG] Waiting for package cache (PID: $CACHE_PKG_PID)..." >> "$CONFIG_DIR/debug.log"
        # 完了するまでブロック
        wait "$CACHE_PKG_PID"
        # 完了したら変数をクリア（次回以降は待たない）
        unset CACHE_PKG_PID
    fi
}

XXXXX_check_package_available() {
    local pkg_id="$1"
    local caller="${2:-normal}"
    local cache_file="$CONFIG_DIR/pkg_availability_cache.txt"

    wait_for_package_cache
    
    if [ "$caller" = "custom_feeds" ]; then
        return 0
    fi
    
    local is_virtual
    is_virtual=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].virtual" 2>/dev/null | head -1)
    
    if [ "$is_virtual" = "true" ]; then
        return 0
    fi
    
    local real_id="$pkg_id"
    if [ "$_PACKAGE_NAME_LOADED" -eq 1 ]; then
        local cached_real_id
        cached_real_id=$(echo "$_PACKAGE_NAME_CACHE" | awk -F= -v uid="$pkg_id" '$3 == uid {print $1; exit}')
        [ -n "$cached_real_id" ] && real_id="$cached_real_id"
    fi
    
    # ファイルから直接検索
    if [ ! -f "$cache_file" ]; then
        echo "[DEBUG] Cache file not found: $cache_file" >> "$CONFIG_DIR/debug.log"
        return 1
    fi
    
    if grep -q "^${real_id}:1$" "$cache_file" 2>/dev/null; then
        return 0
    fi
    
    return 1
}

check_package_available() {
    local pkg_id="$1"
    local caller="${2:-normal}"
    local cache_file="$CONFIG_DIR/pkg_availability_cache.txt"

    wait_for_package_cache

    if [ "$caller" = "custom_feeds" ]; then
        return 0
    fi

    # キャッシュから virtual フラグを取得
    local virtual_flag="false"
    if [ "$_PACKAGE_NAME_LOADED" -eq 1 ]; then
        virtual_flag=$(echo "$_PACKAGE_NAME_CACHE" | awk -F= -v id="$pkg_id" '($1 == id || $3 == id) {print $8; exit}')
        [ -z "$virtual_flag" ] && virtual_flag="false"
    fi
    
    if [ "$virtual_flag" = "true" ]; then
        echo "[DEBUG] Package $pkg_id is virtual, skipping availability check" >> "$CONFIG_DIR/debug.log"
        return 0
    fi

    local real_id="$pkg_id"
    if [ "$_PACKAGE_NAME_LOADED" -eq 1 ]; then
        local cached_real_id
        cached_real_id=$(echo "$_PACKAGE_NAME_CACHE" | awk -F= -v uid="$pkg_id" '$3 == uid {print $1; exit}')
        [ -n "$cached_real_id" ] && real_id="$cached_real_id"
    fi

    if [ ! -f "$cache_file" ]; then
        echo "[DEBUG] Availability cache not found, allowing $pkg_id" >> "$CONFIG_DIR/debug.log"
        return 0
    fi

    if grep -qx "$real_id" "$cache_file" 2>/dev/null; then
        echo "[DEBUG] Package $real_id found in availability cache" >> "$CONFIG_DIR/debug.log"
        return 0
    fi

    echo "[DEBUG] Package $real_id NOT found in availability cache" >> "$CONFIG_DIR/debug.log"
    return 1
}

get_kmods_directory() {
    local version="$1"
    local vendor="$2"
    local subtarget="$3"
    local kernel_version="$4"
    
    local index_url="https://downloads.openwrt.org/releases/${version}/targets/${vendor}/${subtarget}/kmods/"
    
    local kmod_dir
    kmod_dir=$(wget -qO- "$index_url" 2>/dev/null | \
        sed -n 's/.*href="\([^"]*\)".*/\1/p' | \
        grep "^${kernel_version}" | \
        head -1)
    
    if [ -n "$kmod_dir" ]; then
        kmod_dir=$(echo "$kmod_dir" | sed 's:/$::')
        echo "$kmod_dir"
        return 0
    fi
    
    return 1
}

get_kmods_directory() {
    local version="$1"
    local vendor="$2"
    local subtarget="$3"
    local kernel_version="$4"
    
    local index_url="https://downloads.openwrt.org/releases/${version}/targets/${vendor}/${subtarget}/kmods/"
    
    local kmod_dir
    kmod_dir=$(wget -qO- "$index_url" 2>/dev/null | \
        sed -n 's/.*href="\([^"]*\)".*/\1/p' | \
        grep "^${kernel_version}" | \
        head -1)
    
    if [ -n "$kmod_dir" ]; then
        kmod_dir=$(echo "$kmod_dir" | sed 's:/$::')
        echo "$kmod_dir"
        return 0
    fi
    
    return 1
}

XXX_cache_package_availability() {
    echo "[DEBUG] Building package availability cache..." >> "$CONFIG_DIR/debug.log"
    
    local version="$OPENWRT_VERSION"
    local arch="$DEVICE_ARCH"
    
    if [ -z "$version" ] || [ -z "$arch" ]; then
        echo "[DEBUG] Missing version ($version) or arch ($arch)" >> "$CONFIG_DIR/debug.log"
        return 1
    fi
    
    local cache_file="$CONFIG_DIR/pkg_availability_cache.txt"
    : > "$cache_file"
    
    local feeds="base packages luci"
    local is_snapshot=0
    echo "$version" | grep -q "SNAPSHOT" && is_snapshot=1
    
    # kmods追加
    local kernel_version=$(uname -r)
    local kmod_dir
    kmod_dir=$(get_kmods_directory "$version" "$DEVICE_VENDOR" "$DEVICE_SUBTARGET" "$kernel_version")
    
    if [ -n "$kmod_dir" ]; then
        feeds="$feeds kmods"
        echo "[DEBUG] Found kmods directory: $kmod_dir" >> "$CONFIG_DIR/debug.log"
    fi
    
    for feed in $feeds; do
        local url
        
        if [ "$feed" = "kmods" ]; then
            url="https://downloads.openwrt.org/releases/${version}/targets/${DEVICE_VENDOR}/${DEVICE_SUBTARGET}/kmods/${kmod_dir}/Packages"
        elif [ $is_snapshot -eq 1 ]; then
            url="https://downloads.openwrt.org/snapshots/packages/${arch}/${feed}/index.json"
        else
            url="https://downloads.openwrt.org/releases/${version}/packages/${arch}/${feed}/Packages"
        fi
        
        echo "[DEBUG] Fetching $feed from $url" >> "$CONFIG_DIR/debug.log"
        
        local temp_response="$CONFIG_DIR/feed_response.txt"
        if ! wget -q -T 10 -O "$temp_response" "$url" 2>/dev/null; then
            echo "[DEBUG] Failed to fetch $feed" >> "$CONFIG_DIR/debug.log"
            rm -f "$temp_response"
            continue
        fi
        
        if [ ! -s "$temp_response" ]; then
            echo "[DEBUG] Empty response for $feed" >> "$CONFIG_DIR/debug.log"
            rm -f "$temp_response"
            continue
        fi
        
        if [ $is_snapshot -eq 1 ] && [ "$feed" != "kmods" ]; then
            jsonfilter -i "$temp_response" -e '@.packages[*].name' 2>/dev/null | \
                awk 'NF {print $0":1"}' >> "$cache_file"
        else
            awk '/^Package: / {print $2":1"}' "$temp_response" >> "$cache_file"
        fi
        
        rm -f "$temp_response"
        
        local count=$(wc -l < "$cache_file" 2>/dev/null || echo 0)
        echo "[DEBUG] Fetched $count packages so far" >> "$CONFIG_DIR/debug.log"
    done
    
    local count=$(wc -l < "$cache_file" 2>/dev/null || echo 0)
    echo "[DEBUG] Cache built: $count packages total" >> "$CONFIG_DIR/debug.log"
    
    return 0
}

XXXXX_cache_package_availability() {
    echo "[DEBUG] Building package availability cache..." >> "$CONFIG_DIR/debug.log"
    
    local version="$OPENWRT_VERSION"
    local arch="$DEVICE_ARCH"
    
    if [ -z "$version" ] || [ -z "$arch" ]; then
        echo "[DEBUG] Missing version ($version) or arch ($arch)" >> "$CONFIG_DIR/debug.log"
        return 1
    fi
    
    local cache_file="$CONFIG_DIR/pkg_availability_cache.txt"
    : > "$cache_file"
    
    local feeds="base packages luci"
    local is_snapshot=0
    echo "$version" | grep -q "SNAPSHOT" && is_snapshot=1
    
    # kmods追加（先にディレクトリ取得）
    local kernel_version=$(uname -r)
    local kmod_dir
    kmod_dir=$(get_kmods_directory "$version" "$DEVICE_VENDOR" "$DEVICE_SUBTARGET" "$kernel_version")
    
    if [ -n "$kmod_dir" ]; then
        feeds="$feeds kmods"
        echo "[DEBUG] Found kmods directory: $kmod_dir" >> "$CONFIG_DIR/debug.log"
    fi
    
    # 並列処理でダウンロード
    local pids=""
    for feed in $feeds; do
        (
            local url temp_file
            temp_file="$CONFIG_DIR/cache_${feed}.txt"
            
            if [ "$feed" = "kmods" ]; then
                url="https://downloads.openwrt.org/releases/${version}/targets/${DEVICE_VENDOR}/${DEVICE_SUBTARGET}/kmods/${kmod_dir}/Packages"
            elif [ $is_snapshot -eq 1 ]; then
                url="https://downloads.openwrt.org/snapshots/packages/${arch}/${feed}/index.json"
            else
                url="https://downloads.openwrt.org/releases/${version}/packages/${arch}/${feed}/Packages"
            fi
            
            echo "[DEBUG] Fetching $feed from $url" >> "$CONFIG_DIR/debug.log"
            
            local temp_response="$CONFIG_DIR/feed_${feed}_response.txt"
            if ! wget -q -T 10 -O "$temp_response" "$url" 2>/dev/null; then
                echo "[DEBUG] Failed to fetch $feed" >> "$CONFIG_DIR/debug.log"
                rm -f "$temp_response"
                exit 1
            fi
            
            if [ ! -s "$temp_response" ]; then
                echo "[DEBUG] Empty response for $feed" >> "$CONFIG_DIR/debug.log"
                rm -f "$temp_response"
                exit 1
            fi
            
            if [ $is_snapshot -eq 1 ] && [ "$feed" != "kmods" ]; then
                jsonfilter -i "$temp_response" -e '@.packages[*].name' 2>/dev/null | \
                    awk 'NF {print $0":1"}' > "$temp_file"
            else
                awk '/^Package: / {print $2":1"}' "$temp_response" > "$temp_file"
            fi
            
            rm -f "$temp_response"
            
            local count=$(wc -l < "$temp_file" 2>/dev/null || echo 0)
            echo "[DEBUG] $feed: fetched $count packages" >> "$CONFIG_DIR/debug.log"
        ) &
        pids="$pids $!"
    done
    
    # 全プロセス完了を待つ
    wait $pids
    
    # 結果をマージ
    for feed in $feeds; do
        local temp_file="$CONFIG_DIR/cache_${feed}.txt"
        if [ -f "$temp_file" ]; then
            cat "$temp_file" >> "$cache_file"
            rm -f "$temp_file"
        fi
    done
    
    local count=$(wc -l < "$cache_file" 2>/dev/null || echo 0)
    echo "[DEBUG] Cache built: $count packages total" >> "$CONFIG_DIR/debug.log"
    
    return 0
}

cache_package_availability() {
    echo "[DEBUG] Building package availability cache..." >> "$CONFIG_DIR/debug.log"
    
    local version="$OPENWRT_VERSION"
    local arch="$DEVICE_ARCH"
    local vendor="$DEVICE_VENDOR"
    local subtarget="$DEVICE_SUBTARGET"
    
    if [ -z "$version" ] || [ -z "$arch" ]; then
        echo "[DEBUG] Missing version or arch" >> "$CONFIG_DIR/debug.log"
        return 1
    fi
    
    local cache_file="$CONFIG_DIR/pkg_availability_cache.txt"
    : > "$cache_file"
    
    local feeds="base packages luci routing telephony community targets"
    local is_snapshot=0
    echo "$version" | grep -q "SNAPSHOT" && is_snapshot=1
    
    local kernel_version=$(uname -r)
    local kmod_dir
    kmod_dir=$(get_kmods_directory "$version" "$vendor" "$subtarget" "$kernel_version")
    
    [ -n "$kmod_dir" ] && feeds="$feeds kmods"
    
    local pids=""
    for feed in $feeds; do
        (
            local url temp_file
            temp_file="$CONFIG_DIR/cache_${feed}.txt"
            
            if [ "$feed" = "targets" ]; then
                url="https://downloads.openwrt.org/releases/${version}/targets/${vendor}/${subtarget}/packages/Packages"
            elif [ "$feed" = "kmods" ]; then
                url="https://downloads.openwrt.org/releases/${version}/targets/${vendor}/${subtarget}/kmods/${kmod_dir}/Packages"
            elif [ $is_snapshot -eq 1 ]; then
                url="https://downloads.openwrt.org/snapshots/packages/${arch}/${feed}/index.json"
            else
                url="https://downloads.openwrt.org/releases/${version}/packages/${arch}/${feed}/Packages"
            fi
            
            echo "[DEBUG] Fetching $feed from $url" >> "$CONFIG_DIR/debug.log"
            
            local temp_response="$CONFIG_DIR/feed_${feed}_response.txt"
            wget -q -T 10 -O "$temp_response" "$url" 2>>"$CONFIG_DIR/debug.log" || exit 1
            
            [ ! -s "$temp_response" ] && exit 1
            
            if [ $is_snapshot -eq 1 ] && [ "$feed" != "kmods" ] && [ "$feed" != "targets" ]; then
                jsonfilter -i "$temp_response" -e '@.packages[*].name' 2>/dev/null | awk 'NF {print $0}' > "$temp_file"
            else
                awk '/^Package: / {print $2}' "$temp_response" > "$temp_file"
            fi
            
            rm -f "$temp_response"
            
            local count=$(wc -l < "$temp_file" 2>/dev/null || echo 0)
            echo "[DEBUG] $feed: fetched $count packages" >> "$CONFIG_DIR/debug.log"
        ) >/dev/null 2>&1 &
        pids="$pids $!"
    done
    
    wait $pids
    
    # ★ マージとソートを完全に静かに実行
    {
        for feed in $feeds; do
            local temp_file="$CONFIG_DIR/cache_${feed}.txt"
            [ -f "$temp_file" ] && cat "$temp_file" >> "$cache_file"
            rm -f "$temp_file"
        done
        
        sort -u "$cache_file" -o "$cache_file"
    } >/dev/null 2>&1
    
    local count=$(wc -l < "$cache_file" 2>/dev/null || echo 0)
    echo "[DEBUG] Cache built: $count packages total" >> "$CONFIG_DIR/debug.log"
    
    return 0
}

package_compatible() {
    local pkg_id="$1"
    
    # 初回のみキャッシュ構築
    if [ "$_PACKAGE_COMPAT_LOADED" -eq 0 ]; then
        _PACKAGE_COMPAT_CACHE=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e '@.categories[*].packages[*]' 2>/dev/null | \
            awk -F'"' '
            {
                id=""; pms="";
                for(i=1;i<=NF;i++){
                    if($i=="id") id=$(i+2);
                    if($i=="packageManager") {
                        # packageManager配列を収集
                        for(j=i;j<=NF;j++){
                            if($j ~ /opkg|apk/) pms=pms$(j)" ";
                            if($j=="]") break;
                        }
                    }
                }
                if(id && pms) print id"="pms;
            }')
        _PACKAGE_COMPAT_LOADED=1
    fi
    
    # キャッシュから検索
    local pkg_managers
    pkg_managers=$(echo "$_PACKAGE_COMPAT_CACHE" | grep "^${pkg_id}=" | cut -d= -f2)
    
    [ -z "$pkg_managers" ] && return 0
    
    echo "$pkg_managers" | grep -q "${PKG_MGR}" && return 0
    
    return 1
}

# Setup JSON Accessors

get_setup_item_property() {
    local item_id="$1"
    local property="$2"
    local result
    
    result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].${property}" 2>/dev/null | head -1)
    
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].${property}" 2>/dev/null | head -1)
    fi
    
    echo "$result"
}

get_setup_categories() {
    if [ "$_SETUP_CATEGORIES_LOADED" -eq 0 ]; then
        local all_cats gui_only
        all_cats=$(jsonfilter -i "$SETUP_JSON" -e '@.categories[*].id' 2>/dev/null | grep -v '^$')
        _SETUP_CATEGORIES_CACHE=""
        for cat_id in $all_cats; do
            gui_only=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].guiOnly" 2>/dev/null | head -1 | tr -d ' \n\r')
            echo "[DEBUG] cat_id='$cat_id' gui_only='$gui_only'" >> "$CONFIG_DIR/debug.log"
            
            # 明示的にtrueと比較
            if [ "$gui_only" = "true" ]; then
                echo "[DEBUG] Skipping $cat_id (guiOnly)" >> "$CONFIG_DIR/debug.log"
                continue
            fi
            
            _SETUP_CATEGORIES_CACHE="${_SETUP_CATEGORIES_CACHE}${cat_id}
"
        done
        _SETUP_CATEGORIES_LOADED=1
        echo "[DEBUG] Categories cache built: $_SETUP_CATEGORIES_CACHE" >> "$CONFIG_DIR/debug.log"
    fi
    echo "$_SETUP_CATEGORIES_CACHE"
}

get_setup_category_title() {
    local title class
    title=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$1'].title" 2>/dev/null | head -1)
    class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$1'].class" 2>/dev/null | head -1)
    
    if [ -n "$class" ] && [ "${class#tr-}" != "$class" ]; then
        translate "$class"
    else
        echo "$title"
    fi
}

get_setup_category_items() {
    jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$1'].items[*].id" 2>/dev/null | grep -v '^$'
}

get_setup_item_type() {
    get_setup_item_property "$1" "type"
}

get_setup_item_label() {
    local item_id="$1"
    local label class
    
    label=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].label" 2>/dev/null | head -1)
    class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].class" 2>/dev/null | head -1)
    
    if [ -z "$label" ]; then
        label=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].title" 2>/dev/null | head -1)
        [ -z "$class" ] && class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].class" 2>/dev/null | head -1)
    fi
    
    if [ -z "$label" ]; then
        label=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].label" 2>/dev/null | head -1)
        [ -z "$class" ] && class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].class" 2>/dev/null | head -1)
    fi
    
    if [ -n "$class" ] && [ "${class#tr-}" != "$class" ]; then
        translate "$class"
    else
        echo "$label"
    fi
}

get_setup_item_variable() {
    get_setup_item_property "$1" "variable"
}

get_setup_item_default() {
    get_setup_item_property "$1" "default"
}

get_setup_item_api_source() {
    local item_id="$1"
    local result
    
    result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].apiSource" 2>/dev/null | head -1)
    
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].apiSource" 2>/dev/null | head -1)
    fi
    
    echo "$result"
}

get_api_value() {
    local api_source="$1"
    [ -z "$api_source" ] && return 1
    jsonfilter -i "$AUTO_CONFIG_JSON" -e "@.${api_source}" 2>/dev/null | head -1
}

get_setup_item_field_type() {
    local item_id="$1"
    local result
    
    result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].fieldType" 2>/dev/null | head -1)
    
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].fieldType" 2>/dev/null | head -1)
    fi
    
    echo "$result"
}

get_setup_item_options() {
    local item_id="$1"
    local result
    
    result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].options[*].value" 2>/dev/null)
    
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].options[*].value" 2>/dev/null)
    fi
    
    echo "$result" | awk 'NF{print} !NF{print "___EMPTY___"}'
}

get_setup_item_option_label() {
    local item_id="$1"
    local value="$2"
    local label class
    
    label=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].options[@.value='$value'].label" 2>/dev/null | head -1)
    class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].options[@.value='$value'].class" 2>/dev/null | head -1)
    
    if [ -z "$label" ]; then
        label=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].options[@.value='$value'].label" 2>/dev/null | head -1)
        class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].options[@.value='$value'].class" 2>/dev/null | head -1)
    fi
    
    if [ -n "$class" ] && [ "${class#tr-}" != "$class" ]; then
        translate "$class"
    else
        echo "$label"
    fi
}

# Package JSON Accessors

get_categories() {
    if [ "$_CATEGORIES_LOADED" -eq 0 ]; then
        _CATEGORIES_CACHE=$(jsonfilter -i "$PACKAGES_JSON" -e '@.categories[*].id' 2>/dev/null | grep -v '^$')
        _CATEGORIES_LOADED=1
    fi
    echo "$_CATEGORIES_CACHE"
}

get_category_name() {
    local cat_id="$1"
    local name class
    
    name=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id'].name" 2>/dev/null | head -1)
    class=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id'].class" 2>/dev/null | head -1)
    
    if [ -z "$name" ]; then
        name=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$cat_id'].name" 2>/dev/null | head -1)
        class=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$cat_id'].class" 2>/dev/null | head -1)
    fi
    
    if [ -n "$class" ] && [ "${class#tr-}" != "$class" ]; then
        translate "$class"
    else
        printf '%s\n' "$name"
    fi
}

get_category_desc() {
    local cat_id="$1"
    local desc
    
    desc=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id'].description" 2>/dev/null | head -1)
    [ -z "$desc" ] && desc=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$cat_id'].description" 2>/dev/null | head -1)
    echo "$desc"
}

get_category_hidden() {
    local cat_id="$1"
    jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id']" 2>/dev/null | head -1 | grep -q . && echo "false" && return
    local hidden
    hidden=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$cat_id'].hidden" 2>/dev/null | head -1)
    echo "$hidden"
}

get_category_packages() {
    local cat_id="$1"
    
    {
        if [ -f "$CUSTOMFEEDS_JSON" ]; then
            jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id'].packages[*]" 2>/dev/null | \
            awk -F'"' '{
                id=""; uid="";
                for(i=1;i<=NF;i++){
                    if($i=="id") id=$(i+2);
                    if($i=="uniqueId") uid=$(i+2);
                }
                if(uid) print uid; else if(id) print id;
            }'
        fi
        
        jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$cat_id'].packages[*]" 2>/dev/null | \
        awk -F'"' '{
            id=""; uid="";
            for(i=1;i<=NF;i++){
                if($i=="id") id=$(i+2);
                if($i=="uniqueId") uid=$(i+2);
            }
            if(uid) print uid; else if(id) print id;
        }'
    } | grep -v '^$' | awk '!seen[$0]++'
}

get_package_checked() {
    local pkg_id="$1"
    local checked
    
    checked=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].checked" 2>/dev/null | head -1)
    [ -z "$checked" ] && checked=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].checked" 2>/dev/null | head -1)
    echo "$checked"
}

get_package_name() {
    local pkg_id="$1"
    
    if [ "$_PACKAGE_NAME_LOADED" -eq 0 ]; then
        echo "[DEBUG] Building package name cache with extended fields..." >> "$CONFIG_DIR/debug.log"
        
        _PACKAGE_NAME_CACHE=$(jsonfilter -i "$PACKAGES_JSON" -e '@.categories[*].packages[*]' 2>/dev/null | \
            awk -F'"' '
            BEGIN { in_deps=0 }
            {
                id=""; name=""; uniqueId=""; installOptions=""; enableVar=""; deps="";
                hidden="false"; virtual="false"; reboot="false"; checked="false";
                
                for(i=1;i<=NF;i++){
                    if($i=="id")id=$(i+2);
                    if($i=="name")name=$(i+2);
                    if($i=="uniqueId")uniqueId=$(i+2);
                    if($i=="installOptions")installOptions=$(i+2);
                    if($i=="enableVar")enableVar=$(i+2);
                    if($i=="hidden" && $(i+2)=="true")hidden="true";
                    if($i=="virtual" && $(i+2)=="true")virtual="true";
                    if($i=="reboot" && $(i+2)=="true")reboot="true";
                    if($i=="checked" && $(i+2)=="true")checked="true";
                    if($i=="dependencies") {
                        in_deps=1;
                        for(j=i+2;j<=NF;j++){
                            if($j=="]") { in_deps=0; break; }
                            if($j ~ /^[a-z0-9_-]+$/ && $j!="hidden" && $j!="checked" && $j!="reboot" && $j!="virtual") 
                                deps=deps$j",";
                        }
                        sub(/,$/, "", deps);
                    }
                }
                if(id&&name){
                    print id "=" name "=" uniqueId "=" installOptions "=" enableVar "=" deps "=" hidden "=" virtual "=" reboot "=" checked
                }
            }')
        
        if [ -f "$CUSTOMFEEDS_JSON" ]; then
            local custom_cache
            custom_cache=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e '@.categories[*].packages[*]' 2>/dev/null | \
                awk -F'"' '
                BEGIN { in_deps=0 }
                {
                    id=""; name=""; uniqueId=""; installOptions=""; enableVar=""; deps="";
                    hidden="false"; virtual="false"; reboot="false"; checked="false";
                    
                    for(i=1;i<=NF;i++){
                        if($i=="id")id=$(i+2);
                        if($i=="name")name=$(i+2);
                        if($i=="uniqueId")uniqueId=$(i+2);
                        if($i=="installOptions")installOptions=$(i+2);
                        if($i=="enableVar")enableVar=$(i+2);
                        if($i=="hidden" && $(i+2)=="true")hidden="true";
                        if($i=="virtual" && $(i+2)=="true")virtual="true";
                        if($i=="reboot" && $(i+2)=="true")reboot="true";
                        if($i=="checked" && $(i+2)=="true")checked="true";
                        if($i=="dependencies") {
                            in_deps=1;
                            for(j=i+2;j<=NF;j++){
                                if($j=="]") { in_deps=0; break; }
                                if($j ~ /^[a-z0-9_-]+$/ && $j!="hidden" && $j!="checked" && $j!="reboot" && $j!="virtual")
                                    deps=deps$j",";
                            }
                            sub(/,$/, "", deps);
                        }
                    }
                    if(id&&name){
                        print id "=" name "=" uniqueId "=" installOptions "=" enableVar "=" deps "=" hidden "=" virtual "=" reboot "=" checked
                    }
                }')
            _PACKAGE_NAME_CACHE="${_PACKAGE_NAME_CACHE}
${custom_cache}"
        fi
        
        _PACKAGE_NAME_LOADED=1
        
        echo "[DEBUG] Cache built with $(echo "$_PACKAGE_NAME_CACHE" | wc -l) entries" >> "$CONFIG_DIR/debug.log"
        echo "[DEBUG] Sample entry: $(echo "$_PACKAGE_NAME_CACHE" | head -1)" >> "$CONFIG_DIR/debug.log"
    fi
    
    echo "$_PACKAGE_NAME_CACHE" | awk -F'=' -v pkg="$pkg_id" '
        $1 == pkg || $3 == pkg {
            print $2
            exit
        }
    '
}

get_package_enablevar() {
    local pkg_id="$1"
    local unique_id="$2"
    local enable_var
    
    # _PACKAGE_NAME_CACHE から検索（フォーマット: id=name=uniqueId=installOptions=enableVar）
    if [ -n "$unique_id" ]; then
        # uniqueId がある場合: id と uniqueId が一致する行のフィールド5（enableVar）を取得
        enable_var=$(echo "$_PACKAGE_NAME_CACHE" | awk -F'=' -v pkg="$pkg_id" -v uid="$unique_id" '
            $1 == pkg && $3 == uid { print $5; exit }
        ')
    else
        # uniqueId がない場合: id が一致し、フィールド3が空の行のフィールド5を取得
        enable_var=$(echo "$_PACKAGE_NAME_CACHE" | awk -F'=' -v pkg="$pkg_id" '
            $1 == pkg && $3 == "" { print $5; exit }
        ')
    fi
    
    echo "$enable_var"
}

is_package_selected() {
    local identifier="$1"
    local caller="${2:-normal}"
    
    # 初回のみファイルをキャッシュ
    if [ "$caller" = "custom_feeds" ]; then
        if [ "$_SELECTED_CUSTOM_CACHE_LOADED" -eq 0 ]; then
            _SELECTED_CUSTOM_CACHE=$(cat "$SELECTED_CUSTOM_PACKAGES" 2>/dev/null || true)
            _SELECTED_CUSTOM_CACHE_LOADED=1
        fi
        echo "$_SELECTED_CUSTOM_CACHE" | grep -q "=${identifier}=" || \
        echo "$_SELECTED_CUSTOM_CACHE" | grep -q "=${identifier}\$"
    else
        if [ "$_SELECTED_PACKAGES_CACHE_LOADED" -eq 0 ]; then
            _SELECTED_PACKAGES_CACHE=$(cat "$SELECTED_PACKAGES" 2>/dev/null || true)
            _SELECTED_PACKAGES_CACHE_LOADED=1
        fi
        echo "$_SELECTED_PACKAGES_CACHE" | grep -q "=${identifier}=" || \
        echo "$_SELECTED_PACKAGES_CACHE" | grep -q "=${identifier}\$"
    fi
}

# =============================================================================
# Get dependencies for a package (from cache)
# =============================================================================
get_package_dependencies() {
    local pkg_id="$1"
    local caller="${2:-normal}"
    
    # キャッシュがロードされていなければロード
    if [ "$_PACKAGE_NAME_LOADED" -eq 0 ]; then
        get_package_name "dummy" >/dev/null 2>&1
    fi
    
    # キャッシュから依存関係を取得（フィールド6）
    local deps=$(echo "$_PACKAGE_NAME_CACHE" | awk -F'=' -v pkg="$pkg_id" '$1 == pkg {print $6; exit}')
    
    # カンマ区切りを改行に変換
    echo "$deps" | tr ',' '\n' | grep -v '^$'
}

# Check if a dependency is required by other selected packages
is_dependency_required_by_others() {
    local dep_id="$1"
    local excluding_pkg_id="$2"
    local caller="${3:-normal}"
    local target_file
    
    if [ "$caller" = "custom_feeds" ]; then
        target_file="$SELECTED_CUSTOM_PACKAGES"
    else
        target_file="$SELECTED_PACKAGES"
    fi
    
    # ★ 選択済みパッケージファイルから直接読み込む（高速化）
    while read -r selected_line; do
        [ -z "$selected_line" ] && continue
        
        local current_pkg_id
        current_pkg_id=$(echo "$selected_line" | cut -d= -f1)
        
        # Skip the package we're excluding
        [ "$current_pkg_id" = "$excluding_pkg_id" ] && continue
        
        # ★ キャッシュから依存関係を取得（フィールド6）
        local deps
        deps=$(echo "$_PACKAGE_NAME_CACHE" | awk -F'=' -v id="$current_pkg_id" '$1 == id {print $6; exit}')
        
        # ★ カンマ区切りの中から dep_id を検索
        echo "$deps" | tr ',' '\n' | grep -qx "$dep_id" && return 0
    done < "$target_file"
    
    return 1
}

# Add package and its dependencies
add_package_with_dependencies() {
    local pkg_id="$1"
    local caller="${2:-normal}"
    local target_file
    
    if [ "$caller" = "custom_feeds" ]; then
        target_file="$SELECTED_CUSTOM_PACKAGES"
    else
        target_file="$SELECTED_PACKAGES"
    fi
    
    # ★ ファイル内容を1回だけ読み込む
    local existing_packages
    existing_packages=$(cat "$target_file" 2>/dev/null || true)
    
    local existing_vars
    existing_vars=$(cat "$SETUP_VARS" 2>/dev/null || true)
    
    # Add main package
    local cache_line
    cache_line=$(echo "$_PACKAGE_NAME_CACHE" | awk -F= -v id="$pkg_id" '$3 == id {print; exit}')
    # 見つからなければidで検索
    [ -z "$cache_line" ] && cache_line=$(echo "$_PACKAGE_NAME_CACHE" | awk -F= -v id="$pkg_id" '$1 == id && $3 == "" {print; exit}')
    
    if [ -n "$cache_line" ]; then
        local cached_id cached_uid
        cached_id=$(echo "$cache_line" | cut -d= -f1)
        cached_uid=$(echo "$cache_line" | cut -d= -f3)
        
        # ★ 修正：uniqueId を考慮した正確な重複チェック ★
        local already_exists=0
        if [ -n "$cached_uid" ]; then
            # uniqueId がある場合：フィールド3 で完全一致
            if echo "$existing_packages" | awk -F= -v uid="$cached_uid" '$3 == uid' | grep -q .; then
                already_exists=1
            fi
        else
            # uniqueId がない場合：フィールド1 が一致 & フィールド3 が空
            if echo "$existing_packages" | awk -F= -v id="$cached_id" '$1 == id && $3 == ""' | grep -q .; then
                already_exists=1
            fi
        fi
        
        if [ "$already_exists" -eq 0 ]; then
            echo "$cache_line" >> "$target_file"
            
            # Handle enableVar
            local enable_var
            enable_var=$(echo "$cache_line" | cut -d= -f5)
            
            # ★ メモリ内で重複チェック
            if [ -n "$enable_var" ] && ! echo "$existing_vars" | grep -q "^${enable_var}="; then
                echo "${enable_var}='1'" >> "$SETUP_VARS"
            fi
        fi
        
        # Add dependencies
        local deps
        deps=$(echo "$cache_line" | cut -d= -f6)
        
        while read -r dep_id; do
            [ -z "$dep_id" ] && continue
            
            # Find dependency in cache (by id or uniqueId)
            local dep_cache_line
            dep_cache_line=$(echo "$_PACKAGE_NAME_CACHE" | awk -F= -v dep="$dep_id" '$1 == dep || $3 == dep {print; exit}')
            
            if [ -n "$dep_cache_line" ]; then
                local dep_real_id dep_uid
                dep_real_id=$(echo "$dep_cache_line" | cut -d= -f1)
                dep_uid=$(echo "$dep_cache_line" | cut -d= -f3)
                
                # 依存パッケージの重複チェック
                local dep_already_exists=0
                if [ -n "$dep_uid" ]; then
                    if echo "$existing_packages" | awk -F= -v uid="$dep_uid" '$3 == uid' | grep -q .; then
                        dep_already_exists=1
                    fi
                else
                    if echo "$existing_packages" | awk -F= -v id="$dep_real_id" '$1 == id && $3 == ""' | grep -q .; then
                        dep_already_exists=1
                    fi
                fi
                
                if [ "$dep_already_exists" -eq 0 ]; then
                    echo "$dep_cache_line" >> "$target_file"
                    
                    # Handle enableVar for dependency
                    local dep_enable_var
                    dep_enable_var=$(echo "$dep_cache_line" | cut -d= -f5)
                    
                    # ★ メモリ内で重複チェック
                    if [ -n "$dep_enable_var" ] && ! echo "$existing_vars" | grep -q "^${dep_enable_var}="; then
                        echo "${dep_enable_var}='1'" >> "$SETUP_VARS"
                    fi
                    
                    echo "[DEP] Auto-added dependency: $dep_real_id (required by $pkg_id)" >> "$CONFIG_DIR/debug.log"
                fi
            fi
        done <<DEPS
$(echo "$deps" | tr ',' '\n')
DEPS
    fi
}

# Remove package and orphaned dependencies
remove_package_with_dependencies() {
    local pkg_id="$1"
    local caller="${2:-normal}"
    local target_file
    
    if [ "$caller" = "custom_feeds" ]; then
        target_file="$SELECTED_CUSTOM_PACKAGES"
    else
        target_file="$SELECTED_PACKAGES"
    fi
    
    # Get dependencies before removing
    local deps
    deps=$(get_package_dependencies "$pkg_id" "$caller")
    
    # Remove main package
    local all_entries
    # まずuniqueIdで完全一致検索
    all_entries=$(awk -F= -v id="$pkg_id" '$3 == id' "$target_file" 2>/dev/null)
    # 見つからなければidで検索（uniqueIdが空の行のみ）
    [ -z "$all_entries" ] && all_entries=$(awk -F= -v id="$pkg_id" '$1 == id && $3 == ""' "$target_file" 2>/dev/null)
    
    while read -r entry; do
        [ -z "$entry" ] && continue
        
        local enable_var
        enable_var=$(echo "$entry" | cut -d= -f5)
        
        if [ -n "$enable_var" ]; then
            sed -i "/^${enable_var}=/d" "$SETUP_VARS"
        fi
    done <<ENTRIES
$all_entries
ENTRIES
    
    # 正確な行削除（awk使用）
    awk -F= -v target="$pkg_id" '
        !(($1 == target && $3 == "") || $3 == target)
    ' "$target_file" > "$target_file.tmp" && mv "$target_file.tmp" "$target_file"
    
    # Check and remove orphaned dependencies
    while read -r dep_id; do
        [ -z "$dep_id" ] && continue
        
        # Find dependency real id
        local dep_cache_line dep_real_id
        dep_cache_line=$(echo "$_PACKAGE_NAME_CACHE" | awk -F= -v dep="$dep_id" '$1 == dep || $3 == dep {print; exit}')
        
        if [ -n "$dep_cache_line" ]; then
            dep_real_id=$(echo "$dep_cache_line" | cut -d= -f1)
            
            # Check if this dependency is required by other selected packages
            if ! is_dependency_required_by_others "$dep_id" "$pkg_id" "$caller"; then
                # No other parent needs this dependency, safe to remove
                local dep_entries
                # uniqueIdで検索
                dep_entries=$(awk -F= -v id="$dep_real_id" '$3 == id' "$target_file" 2>/dev/null)
                # 見つからなければidで検索（uniqueIdが空の行のみ）
                [ -z "$dep_entries" ] && dep_entries=$(awk -F= -v id="$dep_real_id" '$1 == id && $3 == ""' "$target_file" 2>/dev/null)
                
                while read -r dep_entry; do
                    [ -z "$dep_entry" ] && continue
                    
                    local dep_enable_var
                    dep_enable_var=$(echo "$dep_entry" | cut -d= -f5)
                    
                    if [ -n "$dep_enable_var" ]; then
                        sed -i "/^${dep_enable_var}=/d" "$SETUP_VARS"
                    fi
                done <<DEP_ENTRIES
$dep_entries
DEP_ENTRIES
                
                # 正確な行削除（awk使用）
                awk -F= -v target="$dep_real_id" '
                    !(($1 == target && $3 == "") || $3 == target)
                ' "$target_file" > "$target_file.tmp" && mv "$target_file.tmp" "$target_file"
                
                echo "[DEP] Auto-removed orphaned dependency: $dep_real_id (no longer required)" >> "$CONFIG_DIR/debug.log"
            else
                echo "[DEP] Kept dependency: $dep_real_id (still required by other packages)" >> "$CONFIG_DIR/debug.log"
            fi
        fi
    done <<DEPS
$deps
DEPS
}

# Custom Feeds Management

download_customfeeds_json() {
    download_file_with_cache "$CUSTOMFEEDS_JSON_URL" "$CUSTOMFEEDS_JSON"
    return $?
}

get_customfeed_categories() {
    if [ "$_CUSTOMFEED_CATEGORIES_LOADED" -eq 0 ]; then
        _CUSTOMFEED_CATEGORIES_CACHE=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e '@.categories[*].id' 2>/dev/null | grep -v '^$')
        _CUSTOMFEED_CATEGORIES_LOADED=1
        echo "[DEBUG] Custom feed categories cache built" >> "$CONFIG_DIR/debug.log"
    fi
    echo "$_CUSTOMFEED_CATEGORIES_CACHE"
}

custom_feeds_selection_prepare() {
    download_customfeeds_json || return 1
    
    local categories
    categories=$(get_customfeed_categories)
    
    if [ -z "$categories" ]; then
        return 1
    fi
    
    echo "$categories"
    return 0
}

get_customfeed_package_pattern() {
    jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[*].packages[@.id='$1'].pattern" 2>/dev/null | head -1
}

get_customfeed_package_exclude() {
    jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[*].packages[@.id='$1'].exclude" 2>/dev/null | head -1
}

get_customfeed_package_enable_service() {
    jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[*].packages[@.id='$1'].enable_service" 2>/dev/null | head -1
}

get_customfeed_package_restart_service() {
    jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[*].packages[@.id='$1'].restart_service" 2>/dev/null | head -1
}

get_customfeed_api_base() {
    jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$1'].api_base" 2>/dev/null | head -1
}

get_customfeed_download_base() {
    jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$1'].download_base" 2>/dev/null | head -1
}

get_customfeed_template_path() {
    local cat_id="$1"
    jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id'].template_path" 2>/dev/null | head -1
}

get_customfeed_template_url() {
    local cat_id="$1"
    # SC2155: Declare and assign separately
    local template_path
    template_path=$(get_customfeed_template_path "$cat_id")
    [ -n "$template_path" ] && echo "${BASE_URL}/${template_path}"
}

# Custom Feeds/Scripts UI Functions (Common)

custom_scripts_selection() {
    download_customscripts_json || return 0
    
    local tr_main_menu tr_custom_scripts breadcrumb
    local all_scripts
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_custom_scripts=$(translate "tr-tui-custom-scripts")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_custom_scripts")
    
    all_scripts=$(get_customscript_all_scripts)
    
    if [ -z "$all_scripts" ]; then
        show_msgbox "$breadcrumb" "No custom scripts available"
        return 0
    fi
    
    custom_scripts_selection_ui "$breadcrumb" "$all_scripts"
}

custom_script_options() {
    local script_id="$1"
    local parent_breadcrumb="$2"
    local script_name breadcrumb
    local options filtered_options
    local min_mem rec_mem min_flash rec_flash msg
    
    script_name=$(get_customscript_name "$script_id")
    breadcrumb="${parent_breadcrumb} > ${script_name}"

    # テンプレートを読み込んで変数を取得
    . "$CONFIG_DIR/tpl_customscript_${script_id}.sh"
    
    options=$(get_customscript_options "$script_id")
    
    if [ -z "$options" ]; then
        show_msgbox "$breadcrumb" "No options available"
        return 0
    fi
    
    filtered_options=$(filter_script_options "$script_id" "$options")
    
    if [ -z "$filtered_options" ]; then
        show_msgbox "$breadcrumb" "No options available"
        return 0
    fi
    
    # 削除オプションのみの場合はリソースチェックをスキップ
    local has_install_option=0
    while read -r opt_id; do
        local require_not_installed
        require_not_installed=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[@.id='$opt_id'].requireNotInstalled" 2>/dev/null | head -1)
        if [ "$require_not_installed" = "true" ]; then
            has_install_option=1
            break
        fi
    done <<EOF
$filtered_options
EOF
    
    # インストールオプションがある場合のみリソースチェック
    if [ "$has_install_option" -eq 1 ]; then
        if ! check_script_requirements "$script_id"; then
            min_mem="${MINIMUM_MEM}"
            rec_mem="${RECOMMENDED_MEM}"
            min_flash="${MINIMUM_FLASH}"
            rec_flash="${RECOMMENDED_FLASH}"
            
            msg="$(translate 'tr-tui-customscript-resource-check')

$(translate 'tr-tui-customscript-memory'): ${MEM_FREE_MB}MB $(translate 'tr-tui-customscript-available')
  $(translate 'tr-tui-customscript-minimum'): ${min_mem}MB / $(translate 'tr-tui-customscript-recommended'): ${rec_mem}MB
$(translate 'tr-tui-customscript-storage'): ${FLASH_FREE_MB}MB $(translate 'tr-tui-customscript-available')
  $(translate 'tr-tui-customscript-minimum'): ${min_flash}MB / $(translate 'tr-tui-customscript-recommended'): ${rec_flash}MB

$(translate 'tr-tui-customscript-resource-ng')"
            
            show_msgbox "$breadcrumb" "$msg"
            return 0
        fi
    fi
    
    custom_script_options_ui "$script_id" "$breadcrumb" "$filtered_options"
}

# Custom Scripts Management

download_customscripts_json() {
    download_file_with_cache "$CUSTOMSCRIPTS_JSON_URL" "$CUSTOMSCRIPTS_JSON"
    return $?
}

get_customscript_all_scripts() {
    jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e '@.scripts[*].id' 2>/dev/null | grep -v '^$'
}

get_customscript_name() {
    local script_id="$1"
    local class
    
    class=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].class" 2>/dev/null | head -1)
    if [ -n "$class" ]; then
        translate "$class"
    else
        jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].name" 2>/dev/null | head -1
    fi
}

get_customscript_file() {
    local script_id="$1"
    jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].script" 2>/dev/null | head -1
}

get_customscript_options() {
    local script_id="$1"
    jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[*].id" 2>/dev/null | grep -v '^$'
}

get_customscript_option_label() {
    local script_id="$1"
    local option_id="$2"
    local idx=0
    local opt_ids opt_id label
    
    opt_ids=$(get_customscript_options "$script_id")
    for opt_id in $opt_ids; do
        if [ "$opt_id" = "$option_id" ]; then
            break
        fi
        idx=$((idx+1))
    done
    
    label=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[$idx].label" 2>/dev/null | head -1)
    translate "$label"
}

get_customscript_option_skip_inputs() {
    local script_id="$1"
    local option_id="$2"
    jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[@.id='$option_id'].skipInputs" 2>/dev/null | head -1
}

# =============================================================================
# Write Option Environment Variables (JSON-driven, no hardcoding)
# =============================================================================
# Reads envVars from customscripts.json and writes to script_vars file
# Args:
#   $1 - script_id
#   $2 - option_id
# =============================================================================
write_option_envvars() {
    local script_id="$1"
    local option_id="$2"
    local vars_file="$CONFIG_DIR/script_vars_${script_id}.txt"
    local idx=0
    local opt_ids opt_id env_json
    
    # オプションのインデックスを取得
    opt_ids=$(get_customscript_options "$script_id")
    for opt_id in $opt_ids; do
        if [ "$opt_id" = "$option_id" ]; then
            break
        fi
        idx=$((idx+1))
    done
    
    # envVarsオブジェクトを取得
    env_json=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[$idx].envVars" 2>/dev/null | head -1)
    
    [ -z "$env_json" ] && return 0
    
    # JSONオブジェクトをパースして変数ファイルに書き込む
    # 修正: sedとtrを使って前後の空白とクォートを確実に除去
    echo "$env_json" | \
        sed 's/^{//; s/}$//; s/","/"\n"/g' | \
        sed 's/^"//; s/"$//' | \
        while IFS=: read -r key value; do
            # 前後の空白とクォートを除去
            key=$(echo "$key" | tr -d '"' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
            value=$(echo "$value" | tr -d '"' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
            [ -n "$key" ] && [ -n "$value" ] && echo "${key}='${value}'" >> "$vars_file"
        done
    
    echo "[DEBUG] write_option_envvars: script=$script_id option=$option_id" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG] envVars JSON: $env_json" >> "$CONFIG_DIR/debug.log"
    [ -f "$vars_file" ] && echo "[DEBUG] vars_file content: $(cat "$vars_file")" >> "$CONFIG_DIR/debug.log"
}

get_customscript_inputs() {
    local script_id="$1"
    jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].inputs[*].id" 2>/dev/null | grep -v '^$'
}

get_customscript_input_label() {
    local script_id="$1"
    local input_id="$2"
    local label
    
    label=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].inputs[@.id='$input_id'].label" 2>/dev/null | head -1)
    translate "$label"
}

get_customscript_input_default() {
    local script_id="$1"
    local input_id="$2"
    jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].inputs[@.id='$input_id'].default" 2>/dev/null | head -1
}

get_customscript_input_envvar() {
    local script_id="$1"
    local input_id="$2"
    jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].inputs[@.id='$input_id'].envVar" 2>/dev/null | head -1
}

get_customscript_input_hidden() {
    local script_id="$1"
    local input_id="$2"
    jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].inputs[@.id='$input_id'].hidden" 2>/dev/null | head -1
}

is_adguardhome_installed() {
    /etc/AdGuardHome/AdGuardHome --version >/dev/null 2>&1 || \
    /usr/bin/AdGuardHome --version >/dev/null 2>&1
}

filter_script_options() {
    local script_id="$1"
    local options="$2"
    local filtered=""
    local installed="no"
    
    case "$script_id" in
        adguardhome)
            is_adguardhome_installed && installed="yes"
            ;;
        *)
            ;;
    esac
    
    while read -r option_id; do
        [ -z "$option_id" ] && continue
        
        local require_installed require_not_installed
        require_installed=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[@.id='$option_id'].requireInstalled" 2>/dev/null | head -1)
        require_not_installed=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[@.id='$option_id'].requireNotInstalled" 2>/dev/null | head -1)
        
        if [ "$require_installed" = "true" ] && [ "$installed" != "yes" ]; then
            continue
        fi
        
        if [ "$require_not_installed" = "true" ] && [ "$installed" = "yes" ]; then
            continue
        fi
        
        filtered="${filtered}${option_id}
"
    done <<EOF
$options
EOF
    
    echo "$filtered" | grep -v '^$'
}

get_adguardhome_current_user() {
    local yaml_file
    
    if [ -f "/etc/AdGuardHome/AdGuardHome.yaml" ]; then
        yaml_file="/etc/AdGuardHome/AdGuardHome.yaml"
    elif [ -f "/etc/adguardhome.yaml" ]; then
        yaml_file="/etc/adguardhome.yaml"
    else
        echo ""
        return 1
    fi

    awk '
    /^users:/ { in_users=1; next }
    in_users && /^[^ ]/ { exit }
    in_users && $1 == "-" && $2 == "name:" {
        print $3
        exit
    }
    ' "$yaml_file"
}

validate_input_value() {
    local value="$1"
    local validation_json="$2"
    
    [ -z "$validation_json" ] && return 0
    
    local val_type
    val_type=$(echo "$validation_json" | jsonfilter -e '@.type' 2>/dev/null)
    
    case "$val_type" in
        port)
            # 数値チェック
            case "$value" in
                ''|*[!0-9]*)
                    return 1  # エラーメッセージなし
                    ;;
            esac
            
            # 範囲チェック
            local min max
            min=$(echo "$validation_json" | jsonfilter -e '@.min' 2>/dev/null)
            max=$(echo "$validation_json" | jsonfilter -e '@.max' 2>/dev/null)
            
            if [ -n "$min" ] && [ "$value" -lt "$min" ]; then
                return 1
            fi
            
            if [ -n "$max" ] && [ "$value" -gt "$max" ]; then
                return 1
            fi
            ;;
    esac
    
    return 0
}

collect_script_inputs() {
    local script_id="$1"
    local breadcrumb="$2"
    local selected_option="$3"
    local inputs input_id input_label input_default input_envvar input_hidden min_length value
    local required_inputs
    
    # Get requiredInputs from selected option
    if [ -n "$selected_option" ]; then
        required_inputs=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[@.id='$selected_option'].requiredInputs[*]" 2>/dev/null)
        
        if [ -z "$required_inputs" ]; then
            inputs=$(get_customscript_inputs "$script_id")
        else
            inputs="$required_inputs"
        fi
    else
        inputs=$(get_customscript_inputs "$script_id")
    fi
    
    for input_id in $inputs; do
        input_label=$(get_customscript_input_label "$script_id" "$input_id")
        input_default=$(get_customscript_input_default "$script_id" "$input_id")
        input_envvar=$(get_customscript_input_envvar "$script_id" "$input_id")
        input_hidden=$(get_customscript_input_hidden "$script_id" "$input_id")
        min_length=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].inputs[@.id='$input_id'].minlength" 2>/dev/null | head -1)
        
        local validation_json
        validation_json=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].inputs[@.id='$input_id'].validation" 2>/dev/null | head -1)
        
        local display_label="$input_label"
        if [ -n "$min_length" ]; then
            display_label="${input_label}"
        fi
        
        if [ -n "$validation_json" ]; then
            local val_type min_val max_val
            val_type=$(echo "$validation_json" | jsonfilter -e '@.type' 2>/dev/null)
            
            if [ "$val_type" = "port" ]; then
                min_val=$(echo "$validation_json" | jsonfilter -e '@.min' 2>/dev/null)
                max_val=$(echo "$validation_json" | jsonfilter -e '@.max' 2>/dev/null)
                
                if [ -n "$min_val" ] && [ -n "$max_val" ]; then
                    display_label="${input_label} (${min_val}-${max_val})"
                fi
            fi
        fi
        
        if [ "$script_id" = "adguardhome" ] && [ "$input_envvar" = "AGH_USER" ]; then
            local current_user
            current_user=$(get_adguardhome_current_user)
            [ -n "$current_user" ] && input_default="$current_user"
        fi
        
        if [ "$input_envvar" = "LAN_ADDR" ] && [ -n "$LAN_ADDR" ]; then
            input_default="$LAN_ADDR"
        fi
        
        if [ "$input_hidden" = "true" ]; then
            echo "${input_envvar}=\"${input_default}\"" >> "$CONFIG_DIR/script_vars_${script_id}.txt"
            continue
        fi
        
        while true; do
            value=$(show_inputbox "$breadcrumb" "$display_label" "$input_default")
            
            if ! [ $? -eq 0 ]; then
                rm -f "$CONFIG_DIR/script_vars_${script_id}.txt"
                return 1
            fi
            
            if [ -z "$value" ]; then
                if [ -n "$min_length" ]; then
                    continue
                else
                    value="$input_default"
                fi
            fi
            
            if [ -n "$min_length" ]; then
                local value_length="${#value}"
                if [ "$value_length" -lt "$min_length" ]; then
                    continue
                fi
            fi
            
            if ! validate_input_value "$value" "$validation_json"; then
                continue
            fi
            
            break
        done
        
        echo "${input_envvar}=\"${value}\"" >> "$CONFIG_DIR/script_vars_${script_id}.txt"
    done
    
    return 0
}

check_script_requirements() {
    local script_id="$1"
    
    local msg="$(translate 'tr-tui-customscript-resource-check')
$(translate 'tr-tui-customscript-memory'): ${MEM_FREE_MB}MB
  $(translate 'tr-tui-customscript-minimum'): ${MINIMUM_MEM}MB / $(translate 'tr-tui-customscript-recommended'): ${RECOMMENDED_MEM}MB
$(translate 'tr-tui-customscript-storage'): ${FLASH_FREE_MB}MB
  $(translate 'tr-tui-customscript-minimum'): ${MINIMUM_FLASH}MB / $(translate 'tr-tui-customscript-recommended'): ${RECOMMENDED_FLASH}MB"
    
    if [ "$MEM_FREE_MB" -lt "$MINIMUM_MEM" ] || [ "$FLASH_FREE_MB" -lt "$MINIMUM_FLASH" ]; then
        msg="${msg}

$(translate 'tr-tui-customscript-resource-ng')"
        show_msgbox "$breadcrumb" "$msg"
        
        if show_yesno "$breadcrumb" "$(translate 'tr-tui-customscript-force-install-question')"; then
            export SKIP_RESOURCE_CHECK=1
            return 0
        else
            return 1
        fi
    fi
    
    msg="${msg}

$(translate 'tr-tui-customscript-resource-ok')"
    show_msgbox "$breadcrumb" "$msg"
    return 0
}

get_effective_connection_type() {
    local conn_type
    conn_type=$(grep "^connection_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
    
    if [ "$conn_type" = "auto" ]; then
        if [ "$DETECTED_CONN_TYPE" = "mape" ] && [ -n "$MAPE_BR" ]; then
            echo "mape"
            return 0
        elif [ "$DETECTED_CONN_TYPE" = "dslite" ] && [ -n "$DSLITE_AFTR" ]; then
            echo "dslite"
            return 0
        else
            echo "dhcp"
            return 0
        fi
    else
        echo "$conn_type"
        return 0
    fi
}

# =============================================================================
# should_show_item() - 修正版
# TUI版で表示すべきアイテムかどうかを判定
# 
# 追加機能:
#   - カテゴリレベルの guiOnly チェック
#   - アイテムレベルの guiOnly チェック  
#   - tr-agh- プレフィックスのクラスをTUIから除外
#
# 引数:
#   $1 - item_id (必須)
#   $2 - cat_id (オプション、カテゴリのguiOnlyチェック用)
# =============================================================================
should_show_item() {
    local item_id="$1"
    local cat_id="${2:-}"
    
    # 1. カテゴリの guiOnly チェック（cat_id が渡された場合）
    if [ -n "$cat_id" ]; then
        local cat_gui_only
        cat_gui_only=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].guiOnly" 2>/dev/null | head -1 | tr -d ' \n\r')
        if [ "$cat_gui_only" = "true" ]; then
            echo "[DEBUG] Item $item_id hidden: parent category $cat_id is guiOnly" >> "$CONFIG_DIR/debug.log"
            return 1
        fi
    fi
    
    # 2. アイテム自体の guiOnly チェック
    local item_gui_only
    item_gui_only=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].guiOnly" 2>/dev/null | head -1 | tr -d ' \n\r')
    if [ -z "$item_gui_only" ]; then
        item_gui_only=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].guiOnly" 2>/dev/null | head -1 | tr -d ' \n\r')
    fi
    if [ "$item_gui_only" = "true" ]; then
        echo "[DEBUG] Item $item_id hidden: item is guiOnly" >> "$CONFIG_DIR/debug.log"
        return 1
    fi
    
    # 3. tr-agh- プレフィックスのクラスを持つアイテムはTUIから除外
    local item_class
    item_class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].class" 2>/dev/null | head -1)
    if [ -z "$item_class" ]; then
        item_class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].class" 2>/dev/null | head -1)
    fi
    if [ -n "$item_class" ] && [ "${item_class#tr-agh-}" != "$item_class" ]; then
        echo "[DEBUG] Item $item_id hidden: class '$item_class' has tr-agh- prefix (GUI only)" >> "$CONFIG_DIR/debug.log"
        return 1
    fi
    
    # 4. hidden チェック（既存ロジック）
    local is_hidden
    is_hidden=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].hidden" 2>/dev/null | head -1)
    
    if [ -z "$is_hidden" ]; then
        is_hidden=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].hidden" 2>/dev/null | head -1)
    fi
    
    [ "$is_hidden" = "true" ] && return 1
    
    # 5. showWhen チェック（既存ロジック）
    local show_when=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].showWhen" 2>/dev/null | head -1)
    
    if [ -z "$show_when" ]; then
        show_when=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].showWhen" 2>/dev/null | head -1)
    fi
    
    [ -z "$show_when" ] && return 0
    
    # ハイフンをアンダースコアに変換
    local show_when_normalized=$(echo "$show_when" | tr '-' '_')
    
    echo "[DEBUG] showWhen for $item_id: $show_when_normalized" >> $CONFIG_DIR/debug.log
    
    local var_name=$(echo "$show_when_normalized" | sed 's/^{ *"\([^"]*\)".*/\1/')
    
    echo "[DEBUG] var_name=$var_name" >> $CONFIG_DIR/debug.log
    
    local expected=$(jsonfilter -e "@.${var_name}[*]" 2>/dev/null <<EOF
$show_when_normalized
EOF
)
    
    if [ -z "$expected" ]; then
        expected=$(jsonfilter -e "@.${var_name}" 2>/dev/null <<EOF
$show_when_normalized
EOF
)
    fi
    
    echo "[DEBUG] expected values: $expected" >> $CONFIG_DIR/debug.log
    
    local current=$(grep "^${var_name}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
    
    echo "[DEBUG] current value of $var_name: '$current'" >> $CONFIG_DIR/debug.log
    
    [ -z "$current" ] && {
        echo "[DEBUG] No value set, hiding item" >> $CONFIG_DIR/debug.log
        return 1
    }
    
    if echo "$expected" | grep -q "^${current}\$"; then
        echo "[DEBUG] Match found, showing item" >> $CONFIG_DIR/debug.log
        return 0
    fi
    
    echo "[DEBUG] No match, hiding item" >> $CONFIG_DIR/debug.log
    return 1
}

auto_add_conditional_packages() {
    local cat_id="$1"
    local effective_conn_type
    
    echo "[DEBUG] === auto_add_conditional_packages called ===" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG] cat_id=$cat_id" >> "$CONFIG_DIR/debug.log"
    
    effective_conn_type=$(get_effective_connection_type)
    echo "[DEBUG] Effective connection type: $effective_conn_type" >> "$CONFIG_DIR/debug.log"
    
    # 初回のみキャッシュ構築
    if [ "$_CONDITIONAL_PACKAGES_LOADED" -eq 0 ]; then
        _CONDITIONAL_PACKAGES_CACHE=$(
            # wifi_mode (文字列)
            pkg_id=$(jsonfilter -i "$SETUP_JSON" -e '@.categories[*].packages[@.when.wifi_mode].id' 2>/dev/null)
            when_val=$(jsonfilter -i "$SETUP_JSON" -e '@.categories[*].packages[@.when.wifi_mode].when.wifi_mode' 2>/dev/null)
            if [ -n "$pkg_id" ]; then
                echo "${pkg_id}|wifi_mode|${when_val}"
            fi
            
            # connection_type (配列)
            pkg_ids=$(jsonfilter -i "$SETUP_JSON" -e '@.categories[*].packages[@.when.connection_type].id' 2>/dev/null)
            
            echo "$pkg_ids" | while read -r pkg_id; do
                [ -z "$pkg_id" ] && continue
                values=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].when.connection_type[*]" 2>/dev/null)
                echo "$values" | while read -r val; do
                    [ -z "$val" ] && continue
                    echo "${pkg_id}|connection_type|${val}"
                done
            done
        )
        _CONDITIONAL_PACKAGES_LOADED=1
        echo "[DEBUG] Conditional packages cache built:" >> "$CONFIG_DIR/debug.log"
        echo "$_CONDITIONAL_PACKAGES_CACHE" >> "$CONFIG_DIR/debug.log"
    fi
    
    # キャッシュから処理
    while IFS='|' read -r pkg_id when_var expected; do
        [ -z "$pkg_id" ] && continue
        
        echo "[DEBUG] Checking: pkg_id=$pkg_id, when_var=$when_var, expected=$expected" >> "$CONFIG_DIR/debug.log"
        
        # 現在値取得（SETUP_VARSから直接）
        local current_val
        current_val=$(grep "^${when_var}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
        
        echo "[DEBUG] current_val=$current_val" >> "$CONFIG_DIR/debug.log"
        
        # 条件判定
        local should_add=0
        if [ "$current_val" = "$expected" ]; then
            should_add=1
            echo "[DEBUG] Match found!" >> "$CONFIG_DIR/debug.log"
        fi
        
        # パッケージ追加/削除
        if [ "$should_add" -eq 1 ]; then
            if ! grep -q "^${pkg_id}=" "$SELECTED_PACKAGES" 2>/dev/null; then
                echo "${pkg_id}=${pkg_id}===" >> "$SELECTED_PACKAGES"
                echo "[AUTO] Added package: $pkg_id (condition: ${when_var}=${current_val})" >> "$CONFIG_DIR/debug.log"
                
                # enableVar追加
                local enable_var
                enable_var=$(get_package_enablevar "$pkg_id" "")
                if [ -n "$enable_var" ] && ! grep -q "^${enable_var}=" "$SETUP_VARS" 2>/dev/null; then
                    echo "${enable_var}='1'" >> "$SETUP_VARS"
                    echo "[DEBUG] Added enableVar: $enable_var" >> "$CONFIG_DIR/debug.log"
                fi
            fi
        else
            # 削除する前に他の条件でマッチしないか確認
            local has_other_match=0
            while IFS='|' read -r check_pkg check_var check_val; do
                [ "$check_pkg" != "$pkg_id" ] && continue
                [ "$check_var-$check_val" = "$when_var-$expected" ] && continue
                
                local check_current
                check_current=$(grep "^${check_var}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                
                if [ "$check_current" = "$check_val" ]; then
                    has_other_match=1
                    break
                fi
            done <<CHECK
$_CONDITIONAL_PACKAGES_CACHE
CHECK
            
            if [ "$has_other_match" -eq 0 ]; then
                if grep -q "^${pkg_id}=" "$SELECTED_PACKAGES" 2>/dev/null; then
                    sed -i "/^${pkg_id}=/d" "$SELECTED_PACKAGES"
                    echo "[AUTO] Removed package: $pkg_id (no matching conditions)" >> "$CONFIG_DIR/debug.log"
                    
                    # enableVar削除
                    local enable_var
                    enable_var=$(get_package_enablevar "$pkg_id" "")
                    if [ -n "$enable_var" ]; then
                        sed -i "/^${enable_var}=/d" "$SETUP_VARS"
                        echo "[DEBUG] Removed enableVar: $enable_var" >> "$CONFIG_DIR/debug.log"
                    fi
                fi
            fi
        fi
    done <<EOF
$_CONDITIONAL_PACKAGES_CACHE
EOF
    
    echo "[DEBUG] === auto_add_conditional_packages finished ===" >> "$CONFIG_DIR/debug.log"
}

get_section_nested_items() {
    local item_id="$1"
    local cat_idx=0
    local item_idx=0
    local cat_id items idx itm
    
    for cat_id in $(get_setup_categories); do
        items=$(get_setup_category_items "$cat_id")
        idx=0
        for itm in $items; do
            if [ "$itm" = "$item_id" ]; then
                item_idx=$idx
                break 2
            fi
            idx=$((idx+1))
        done
        cat_idx=$((cat_idx+1))
    done
    
    jsonfilter -i "$SETUP_JSON" -e "@.categories[$cat_idx].items[$item_idx].items[*].id" 2>/dev/null
}

# ラジオボタングループの排他変数クリーンアップ（汎用）
cleanup_radio_group_exclusive_vars() {
    local item_id="$1"
    local current_value="$2"
    
    echo "[DEBUG] === cleanup_radio_group_exclusive_vars ===" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG] item_id=$item_id, current_value=$current_value" >> "$CONFIG_DIR/debug.log"
    
    # exclusiveVars の存在確認
    local has_exclusive
    has_exclusive=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].exclusiveVars" 2>/dev/null | head -1)
    
    if [ -z "$has_exclusive" ]; then
        # ネストされた項目もチェック
        has_exclusive=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].exclusiveVars" 2>/dev/null | head -1)
    fi
    
    [ -z "$has_exclusive" ] && {
        echo "[DEBUG] No exclusiveVars defined for $item_id" >> "$CONFIG_DIR/debug.log"
        return 0
    }
    
    # 全オプションの変数リストを取得
    local all_exclusive_vars=""
    local options
    options=$(get_setup_item_options "$item_id")
    
    while read -r option_value; do
        [ -z "$option_value" ] && continue
        [ "$option_value" = "___EMPTY___" ] && continue
        
        # このオプションに紐づく変数リスト
        local vars_json
        vars_json=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].exclusiveVars.${option_value}[*]" 2>/dev/null)
        
        if [ -z "$vars_json" ]; then
            vars_json=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].exclusiveVars.${option_value}[*]" 2>/dev/null)
        fi
        
        # 現在選択されていないオプションの変数を削除対象に追加
        if [ "$option_value" != "$current_value" ]; then
            all_exclusive_vars="${all_exclusive_vars}${vars_json}
"
        fi
    done <<EOF
$options
EOF
    
    # 削除実行
    while read -r var_name; do
        [ -z "$var_name" ] && continue
        
        if grep -q "^${var_name}=" "$SETUP_VARS" 2>/dev/null; then
            sed -i "/^${var_name}=/d" "$SETUP_VARS"
            echo "[EXCLUSIVE] Removed variable: $var_name (not in current selection: $current_value)" >> "$CONFIG_DIR/debug.log"
        fi
    done <<EOF
$all_exclusive_vars
EOF
    
    echo "[DEBUG] === cleanup_radio_group_exclusive_vars finished ===" >> "$CONFIG_DIR/debug.log"
}

auto_cleanup_conditional_variables() {
    local cat_id="$1"
    
    echo "[DEBUG] === auto_cleanup_conditional_variables called ===" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG] cat_id=$cat_id" >> "$CONFIG_DIR/debug.log"
    
    # connection_type='auto' の場合、internet-connection カテゴリはスキップ
    local conn_type
    conn_type=$(grep "^connection_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
    if [ "$conn_type" = "auto" ] && [ "$cat_id" = "internet-connection" ]; then
        echo "[DEBUG] Skipping cleanup for internet-connection (connection_type=auto)" >> "$CONFIG_DIR/debug.log"
        return 0
    fi
    
    # カテゴリ内の全アイテムをスキャン
    for item_id in $(get_setup_category_items "$cat_id"); do
        local item_type
        item_type=$(get_setup_item_type "$item_id")
        
        # section の中もチェック
        if [ "$item_type" = "section" ]; then
            local nested_items
            nested_items=$(get_section_nested_items "$item_id")
            for nested_id in $nested_items; do
                check_and_cleanup_variable "$nested_id"
            done
        else
            check_and_cleanup_variable "$item_id"
        fi
    done
    
    echo "[DEBUG] === auto_cleanup_conditional_variables finished ===" >> "$CONFIG_DIR/debug.log"
}

check_and_cleanup_variable() {
    local item_id="$1"
    local variable show_when
    
    # この項目が変数を持っているか確認
    variable=$(get_setup_item_variable "$item_id")
    [ -z "$variable" ] && return 0
    
    # showWhen が存在するか確認（トップレベル）
    show_when=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].showWhen" 2>/dev/null | head -1)
    
    # showWhen が無い場合、ネストされたアイテムもチェック
    if [ -z "$show_when" ]; then
        show_when=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].showWhen" 2>/dev/null | head -1)
    fi
    
    # showWhen が無い項目はスキップ（削除対象外）
    if [ -z "$show_when" ]; then
        echo "[DEBUG] $item_id has no showWhen, skipping cleanup" >> "$CONFIG_DIR/debug.log"
        return 0
    fi
    
    # showWhen 条件をチェック
    if ! should_show_item "$item_id"; then
        # 条件を満たさない場合、変数を削除
        if grep -q "^${variable}=" "$SETUP_VARS" 2>/dev/null; then
            sed -i "/^${variable}=/d" "$SETUP_VARS"
            echo "[AUTO] Removed variable: $variable (condition not met for $item_id)" >> "$CONFIG_DIR/debug.log"
        fi
    fi
}

# enableVar のクリーンアップ
cleanup_orphaned_enablevars() {
    local cat_id="$1"
    
    echo "[DEBUG] === cleanup_orphaned_enablevars called ===" >> "$CONFIG_DIR/debug.log"
    
    # enableVar のマップを一度だけ構築
    local enablevar_map=""
    while read -r cache_line; do
        local cached_id cached_enablevar
        cached_id=$(echo "$cache_line" | cut -d= -f1)
        cached_enablevar=$(echo "$cache_line" | cut -d= -f5)
        
        [ -n "$cached_enablevar" ] && enablevar_map="${enablevar_map}${cached_enablevar}|${cached_id}
"
    done <<EOF
$_PACKAGE_NAME_CACHE
EOF

    local setup_vars_content=""
    if [ -f "$SETUP_VARS" ]; then
        setup_vars_content=$(cat "$SETUP_VARS")
    fi
    
    # SETUP_VARSをスキャン（メモリ上のデータを使用）
    local temp_file="$CONFIG_DIR/temp_enablevars.txt"
    : > "$temp_file"
    
    while read -r line; do
        case "$line" in
            \#*|'') 
                echo "$line" >> "$temp_file"
                continue 
                ;;
        esac
        
        local var_name=$(echo "$line" | cut -d= -f1)
        
        # マップから高速検索
        local pkg_id=$(echo "$enablevar_map" | grep "^${var_name}|" | cut -d'|' -f2 | head -1)
        
        if [ -n "$pkg_id" ]; then
            # パッケージが選択されているかチェック
            if grep -q "^${pkg_id}=" "$SELECTED_PACKAGES" 2>/dev/null || \
               grep -q "^${pkg_id}=" "$SELECTED_CUSTOM_PACKAGES" 2>/dev/null; then
                echo "$line" >> "$temp_file"
            else
                echo "[CLEANUP] Removed orphaned enableVar: $var_name" >> "$CONFIG_DIR/debug.log"
            fi
        else
            # enableVarではない通常変数
            echo "$line" >> "$temp_file"
        fi
    done <<EOF
$setup_vars_content
EOF
    
    mv "$temp_file" "$SETUP_VARS"
    echo "[DEBUG] === cleanup_orphaned_enablevars finished ===" >> "$CONFIG_DIR/debug.log"
}

update_language_packages() {
    local new_lang old_lang
    
    echo "[DEBUG] === update_language_packages called ===" >> "$CONFIG_DIR/debug.log"
    
    new_lang=$(grep "^language=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
    
    if [ ! -f "$CONFIG_DIR/vars_snapshot.txt" ]; then
        old_lang="${AUTO_LANGUAGE:-en}"
        echo "[DEBUG] First run, old_lang from AUTO_LANGUAGE: '$old_lang'" >> "$CONFIG_DIR/debug.log"
    else
        old_lang=$(grep "^language=" "$CONFIG_DIR/vars_snapshot.txt" 2>/dev/null | cut -d"'" -f2)
    fi
    
    echo "[DEBUG] old_lang='$old_lang', new_lang='$new_lang'" >> "$CONFIG_DIR/debug.log"
    
    # 新言語が空の場合、全ての言語パッケージを削除
    if [ -z "$new_lang" ]; then
        local prefixes
        prefixes=$(jsonfilter -i "$SETUP_JSON" -e '@.constants.language_prefixes_release[*]' 2>/dev/null)
        
        for prefix in $prefixes; do
            # 全言語のパッケージを削除
            sed -i "/=${prefix}[^=]*=/d" "$SELECTED_PACKAGES"
            sed -i "/=${prefix}[^=]*\$/d" "$SELECTED_PACKAGES"
            echo "[LANG] Removed all packages with prefix: $prefix" >> "$CONFIG_DIR/debug.log"
        done
        
        # スナップショット更新
        grep "^language=" "$SETUP_VARS" > "$CONFIG_DIR/vars_snapshot.txt" 2>/dev/null || : > "$CONFIG_DIR/vars_snapshot.txt"
        return 0
    fi
    
    if [ "$old_lang" = "$new_lang" ]; then
        echo "[DEBUG] Language unchanged, skipping package update" >> "$CONFIG_DIR/debug.log"
        return 0
    fi
    
    local prefixes
    prefixes=$(jsonfilter -i "$SETUP_JSON" -e '@.constants.language_prefixes_release[*]' 2>/dev/null)
    
    # 旧言語パッケージを削除（en以外）
    if [ -n "$old_lang" ] && [ "$old_lang" != "en" ]; then
        for prefix in $prefixes; do
            local old_pkg="${prefix}${old_lang}"
            sed -i "/=${old_pkg}=/d" "$SELECTED_PACKAGES"
            sed -i "/=${old_pkg}\$/d" "$SELECTED_PACKAGES"
            echo "[LANG] Removed: $old_pkg" >> "$CONFIG_DIR/debug.log"
        done
    fi
    
    # 新言語パッケージを追加（en以外）
    if [ "$new_lang" != "en" ]; then
        for prefix in $prefixes; do
            local new_pkg="${prefix}${new_lang}"
            
            if ! grep -q "=${new_pkg}=" "$SELECTED_PACKAGES" 2>/dev/null && \
               ! grep -q "=${new_pkg}\$" "$SELECTED_PACKAGES" 2>/dev/null; then
                echo "${new_pkg}=${new_pkg}===" >> "$SELECTED_PACKAGES"
                echo "[LANG] Added: $new_pkg" >> "$CONFIG_DIR/debug.log"
            fi
        done
    fi
    
    grep "^language=" "$SETUP_VARS" > "$CONFIG_DIR/vars_snapshot.txt" 2>/dev/null
    
    echo "[DEBUG] === update_language_packages finished ===" >> "$CONFIG_DIR/debug.log"
}

# API値の動的追跡
track_api_value_changes() {
    local cat_id="$1"
    local snapshot_file="$CONFIG_DIR/vars_snapshot_${cat_id}.txt"
    
    echo "[DEBUG] === track_api_value_changes called ===" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG] cat_id=$cat_id" >> "$CONFIG_DIR/debug.log"
    
    # 初回実行時はスナップショットを作成
    if [ ! -f "$snapshot_file" ]; then
        cp "$SETUP_VARS" "$snapshot_file"
        echo "[DEBUG] Created initial snapshot" >> "$CONFIG_DIR/debug.log"
        return 0
    fi
    
    # 変更があった変数をリストアップ
    local changed_vars=""
    while read -r line; do
        case "$line" in
            \#*|'') continue ;;
        esac
        
        local var_name=$(echo "$line" | cut -d= -f1)
        local old_val=$(grep "^${var_name}=" "$snapshot_file" 2>/dev/null | cut -d"'" -f2)
        local new_val=$(grep "^${var_name}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
        
        if [ "$old_val" != "$new_val" ]; then
            changed_vars="${changed_vars}${var_name}\n"
            echo "[TRACK] ${var_name}: '$old_val' → '$new_val'" >> "$CONFIG_DIR/debug.log"
        fi
    done < "$SETUP_VARS"
    
    # 変更があった場合、関連パッケージを再評価
    if [ -n "$changed_vars" ]; then
        echo "[TRACK] Re-evaluating packages due to variable changes" >> "$CONFIG_DIR/debug.log"
        # ここで必要に応じて追加処理
    fi
    
    # スナップショットを更新
    cp "$SETUP_VARS" "$snapshot_file"
    echo "[DEBUG] === track_api_value_changes finished ===" >> "$CONFIG_DIR/debug.log"
}

# 言語パッケージの初期化
initialize_language_packages() {
    local current_lang
    current_lang=$(grep "^language=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
    
    echo "[DEBUG] === initialize_language_packages called ===" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG] current_lang='$current_lang'" >> "$CONFIG_DIR/debug.log"
    
    if [ -z "$current_lang" ] || [ "$current_lang" = "en" ]; then
        echo "[DEBUG] Language is 'en' or empty, no packages needed" >> "$CONFIG_DIR/debug.log"
        return 0
    fi
    
    local prefixes
    prefixes=$(jsonfilter -i "$SETUP_JSON" -e '@.constants.language_prefixes_release[*]' 2>/dev/null)
    
    for prefix in $prefixes; do
        local lang_pkg="${prefix}${current_lang}"
        
        # キャッシュ形式で追加
        if ! grep -q "=${lang_pkg}=" "$SELECTED_PACKAGES" 2>/dev/null && \
           ! grep -q "=${lang_pkg}\$" "$SELECTED_PACKAGES" 2>/dev/null; then
            echo "${lang_pkg}=${lang_pkg}===" >> "$SELECTED_PACKAGES"
            echo "[INIT] Added language package: $lang_pkg" >> "$CONFIG_DIR/debug.log"
        fi
    done
    
    echo "[DEBUG] === initialize_language_packages finished ===" >> "$CONFIG_DIR/debug.log"
}

compute_dslite_aftr() {
    local aftr_type="$1"
    local area="$2"
    local computed
    
    [ -z "$aftr_type" ] && return 1
    
    if [ "$aftr_type" = "transix" ]; then
        [ -z "$area" ] && return 1
        computed=$(jsonfilter -i "$SETUP_JSON" -e "@.constants.aftr_map.${aftr_type}.${area}" 2>/dev/null)
    else
        computed=$(jsonfilter -i "$SETUP_JSON" -e "@.constants.aftr_map.${aftr_type}" 2>/dev/null)
    fi
    
    if [ -n "$computed" ]; then
        echo "$computed"
        return 0
    fi
    
    return 1
}

__download_file_core() {
    local url="$1"
    local output_path="$2"
    local cache_buster full_url
    local max_retries=3
    local retry=0
    
    if echo "$url" | grep -q '?'; then
        cache_buster="&_t=$(date +%s)"
    else
        cache_buster="?_t=$(date +%s)"
    fi
    
    full_url="${url}${cache_buster}"
    
    echo "[DEBUG] Downloading: $url" >> "$CONFIG_DIR/debug.log"
    
    while [ $retry -lt $max_retries ]; do
        echo "[DEBUG] Attempt $((retry + 1))/$max_retries: $url" >> "$CONFIG_DIR/debug.log"
        
        if wget -q -T 10 -O "$output_path" "$full_url" 2>/dev/null; then
            if [ -s "$output_path" ]; then
                echo "[DEBUG] Download successful: $url" >> "$CONFIG_DIR/debug.log"
                return 0
            else
                echo "[DEBUG] Downloaded file is empty: $url" >> "$CONFIG_DIR/debug.log"
            fi
        else
            echo "[DEBUG] wget failed: $url" >> "$CONFIG_DIR/debug.log"
        fi
        
        retry=$((retry + 1))
        [ $retry -lt $max_retries ] && sleep 1
    done
    
    echo "[ERROR] Failed to download after $max_retries attempts: $url" >> "$CONFIG_DIR/debug.log"
    return 1
}

# File Generation

fetch_cached_template() {
    local url="$1"
    local output_path="$2"
    
    if [ -f "$output_path" ] && [ -s "$output_path" ]; then
        return 0
    fi
    
    __download_file_core "$url" "$output_path"
    return $?
}

prefetch_templates() {
    local cat_id template_url tpl_custom
    local script_id script_file script_url template_path
    
    fetch_cached_template "$POSTINST_TEMPLATE_URL" "$TPL_POSTINST"
    fetch_cached_template "$SETUP_TEMPLATE_URL" "$TPL_SETUP"
    
    if [ -f "$CUSTOMFEEDS_JSON" ]; then
        while read -r cat_id; do
            template_url=$(get_customfeed_template_url "$cat_id")
            
            if [ -n "$template_url" ]; then
                tpl_custom="$CONFIG_DIR/tpl_custom_${cat_id}.sh"
                fetch_cached_template "$template_url" "$tpl_custom"
            fi
        done <<EOF
$(get_customfeed_categories)
EOF
    fi
    
    if [ -f "$CUSTOMSCRIPTS_JSON" ]; then
        while read -r script_id; do
            script_file=$(get_customscript_file "$script_id")
            [ -z "$script_file" ] && continue
            
            script_url="${BASE_URL}/custom-scripts/${script_file}"
            template_path="$CONFIG_DIR/tpl_customscript_${script_id}.sh"
            
            fetch_cached_template "$script_url" "$template_path"
        done <<EOF
$(get_customscript_all_scripts)
EOF
    fi
}

generate_files() {
    local pkgs selected_pkgs cat_id template_url api_url download_url pkg_id pattern
    local tpl_custom enable_var
    local script_id script_file template_path script_url
    local temp_enablevars="$CONFIG_DIR/temp_enablevars.txt"

    : > "$temp_enablevars"
    
    local selected_packages_content=""
    if [ -s "$SELECTED_PACKAGES" ]; then
        selected_packages_content=$(cat "$SELECTED_PACKAGES")
        
        while read -r cache_line; do
            local pkg_id unique_id enable_var
            pkg_id=$(echo "$cache_line" | cut -d= -f1)
            unique_id=$(echo "$cache_line" | cut -d= -f3)
            
            enable_var=$(get_package_enablevar "$pkg_id" "$unique_id")
            
            if [ -n "$enable_var" ] && ! grep -q "^${enable_var}=" "$SETUP_VARS" 2>/dev/null; then
                echo "${enable_var}='1'" >> "$temp_enablevars"
            fi
        done <<EOF
$selected_packages_content
EOF
        
        [ -s "$temp_enablevars" ] && cat "$temp_enablevars" >> "$SETUP_VARS"
    fi
    rm -f "$temp_enablevars"
    
    fetch_cached_template "$POSTINST_TEMPLATE_URL" "$TPL_POSTINST"
    
    if [ -f "$TPL_POSTINST" ]; then
        if [ -n "$selected_packages_content" ]; then
            local id_opts_list=""
            
            while IFS='=' read -r pkg_id _name _unique install_opts _enablevar; do
                local install_opts_value=""
                if [ -n "$install_opts" ]; then
                    install_opts_value=$(convert_install_option "$install_opts")
                fi
                
                id_opts_list="${id_opts_list}${pkg_id}|${install_opts_value}
"
            done <<EOF
$selected_packages_content
EOF
            
            local final_list=""
            local processed_ids=""
            
            echo "$id_opts_list" | awk -F'|' 'NF==2 {print $1 "|" $2}' | \
            while IFS='|' read -r current_id current_opts; do
                case "$processed_ids" in
                    *"${current_id}"*) continue ;;
                esac
                
                local same_id_lines
                same_id_lines=$(echo "$id_opts_list" | grep "^${current_id}|")
                local count
                count=$(echo "$same_id_lines" | grep -c "^${current_id}|")
                
                if [ "$count" -gt 1 ]; then
                    local no_opts_line
                    no_opts_line=$(echo "$same_id_lines" | grep "^${current_id}|$" | head -1)
                    
                    if [ -n "$no_opts_line" ]; then
                        final_list="${final_list}${current_id}
"
                    else
                        local has_opts_line opts_value
                        has_opts_line=$(echo "$same_id_lines" | grep "|.\+$" | head -1)
                        
                        if [ -n "$has_opts_line" ]; then
                            opts_value="${has_opts_line#*|}"
                            final_list="${final_list}${opts_value} ${current_id}
"
                        else
                            final_list="${final_list}${current_id}
"
                        fi
                    fi
                else
                    if [ -n "$current_opts" ]; then
                        final_list="${final_list}${current_opts} ${current_id}
"
                    else
                        final_list="${final_list}${current_id}
"
                    fi
                fi
                
                processed_ids="${processed_ids}${current_id}
"
            done
            
            local install_cmd=""
            pkgs=$(echo "$final_list" | xargs)
            install_cmd=$(echo "$PKG_INSTALL_CMD_TEMPLATE" | sed "s|{package}|$pkgs|g" | sed "s|{allowUntrusted}||g" | sed 's/  */ /g')
        else
            pkgs=""
            install_cmd=""
        fi
        
        awk -v install_cmd="$install_cmd" '
            /^# BEGIN_VARIABLE_DEFINITIONS/ {
                print
                print "INSTALL_CMD=\"" install_cmd "\""
                skip=1
                next
            }
            /^# END_VARIABLE_DEFINITIONS/ {
                skip=0
            }
            !skip
        ' "$TPL_POSTINST" > "$CONFIG_DIR/postinst.sh"
        
        chmod +x "$CONFIG_DIR/postinst.sh"
    fi
    
    fetch_cached_template "$SETUP_TEMPLATE_URL" "$TPL_SETUP"
    
    if [ -f "$TPL_SETUP" ]; then
        awk '
            /^# BEGIN_VARS/ {
                print
                if (vars_file != "") {
                    while ((getline line < vars_file) > 0) {
                        print line
                    }
                    close(vars_file)
                }
                skip=1
                next
            }
            /^# END_VARS/ {
                skip=0
            }
            !skip
        ' vars_file="$SETUP_VARS" "$TPL_SETUP" > "$CONFIG_DIR/setup.sh"
        
        chmod +x "$CONFIG_DIR/setup.sh"
    fi
    
    if [ -f "$CUSTOMFEEDS_JSON" ]; then
        local pids=""
        local categories_list
        categories_list=$(get_customfeed_categories)
        
        local category_packages=""
        while read -r cat_id; do
            local packages_for_cat
            packages_for_cat=$(get_category_packages "$cat_id")
            
            local selected_patterns=""
            while read -r pkg_id; do
                if grep -q "^${pkg_id}=" "$SELECTED_CUSTOM_PACKAGES" 2>/dev/null; then
                    pattern=$(get_customfeed_package_pattern "$pkg_id")
                    selected_patterns="${selected_patterns}${pattern} "
                fi
            done <<EOF2
$packages_for_cat
EOF2
            
            category_packages="${category_packages}${cat_id}|${selected_patterns}
"
        done <<EOF3
$categories_list
EOF3
        
        local failed_pids=""
        while read -r cat_entry; do
            [ -z "$cat_entry" ] && continue
            
            (
                IFS='|' read -r cat_id selected_pkgs <<CATEOF
$cat_entry
CATEOF
                selected_pkgs=$(echo "$selected_pkgs" | sed 's/ $//')

                if [ -z "$selected_pkgs" ]; then
                    echo "[DEBUG] No packages selected for $cat_id, skipping script generation" >> "$CONFIG_DIR/debug.log"
                    exit 0
                fi

                min_version=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id'].minVersion" 2>/dev/null)
                if [ -n "$min_version" ] && [ "$OPENWRT_VERSION_MAJOR" != "SN" ]; then
                    if [ "$OPENWRT_VERSION_MAJOR" -lt "$min_version" ] 2>/dev/null; then
                        echo "[DEBUG] Skipping $cat_id: requires OpenWrt $min_version+, current is $OPENWRT_VERSION_MAJOR" >> "$CONFIG_DIR/debug.log"
                        exit 0
                    fi
                fi
        
                template_url=$(get_customfeed_template_url "$cat_id")
                
                [ -z "$template_url" ] && exit 0
                
                tpl_custom="$CONFIG_DIR/tpl_custom_${cat_id}.sh"
                
                fetch_cached_template "$template_url" "$tpl_custom"
                
                [ ! -f "$tpl_custom" ] && exit 0
                
                api_url=$(get_customfeed_api_base "$cat_id")
                download_url=$(get_customfeed_download_base "$cat_id")
                
                awk -v packages="$selected_pkgs" \
                    -v api="$api_url" \
                    -v download="$download_url" '
                    /^# BEGIN_VARIABLE_DEFINITIONS/ {
                        print
                        print "PACKAGES=\"" packages "\""
                        print "API_URL=\"" api "\""
                        print "DOWNLOAD_BASE_URL=\"" download "\""
                        print "RUN_OPKG_UPDATE=\"0\""
                        skip=1
                        next
                    }
                    /^# END_VARIABLE_DEFINITIONS/ {
                        skip=0
                    }
                    !skip
                ' "$tpl_custom" > "$CONFIG_DIR/customfeeds-${cat_id}.sh"
                
                chmod +x "$CONFIG_DIR/customfeeds-${cat_id}.sh"
            ) &
            pids="$pids $!"
        done <<EOF4
$category_packages
EOF4
        
        # エラーハンドリング
        for pid in $pids; do
            if ! wait $pid; then
                failed_pids="$failed_pids $pid"
            fi
        done
        
        if [ -n "$failed_pids" ]; then
            echo "[WARNING] Some customfeeds scripts failed to generate (PIDs:$failed_pids)" >> "$CONFIG_DIR/debug.log"
        fi
        
        echo "[DEBUG] customfeeds generation completed in parallel" >> "$CONFIG_DIR/debug.log"
    else
        {
            echo "#!/bin/sh"
            echo "# No custom feeds configured"
            echo "exit 0"
        } > "$CONFIG_DIR/customfeeds-none.sh"
        chmod +x "$CONFIG_DIR/customfeeds-none.sh"
    fi

    if [ -f "$CUSTOMSCRIPTS_JSON" ]; then
        while read -r script_id; do
            script_file=$(get_customscript_file "$script_id")
            [ -z "$script_file" ] && continue
        
            script_url="${BASE_URL}/custom-script/${script_file}"
            template_path="$CONFIG_DIR/tpl_customscript_${script_id}.sh"
        
            if [ -f "$template_path" ]; then
                {
                    awk '
                        /^# BEGIN_VARIABLE_DEFINITIONS/ {
                            print
                            if (vars_file != "") {
                                while ((getline line < vars_file) > 0) {
                                    print line
                                }
                                close(vars_file)
                            }
                            skip=1
                            next
                        }
                        /^# END_VARIABLE_DEFINITIONS/ {
                            skip=0
                        }
                        !skip
                    ' vars_file="$CONFIG_DIR/script_vars_${script_id}.txt" "$template_path"
                
                    echo ""
                    echo "${script_id}_main -t"
                
                    # 実行後にクリーンアップ
                    echo ""
                    echo "# Cleanup after execution"
                    echo "rm -f \"$CONFIG_DIR/script_vars_${script_id}.txt\""
                } > "$CONFIG_DIR/customscripts-${script_id}.sh"
            
                chmod +x "$CONFIG_DIR/customscripts-${script_id}.sh"
            fi
        done <<SCRIPTS
$(get_customscript_all_scripts)
SCRIPTS
    
        echo "[DEBUG] customscripts generation completed" >> "$CONFIG_DIR/debug.log"
    fi

    clear_selection_cache
}

generate_config_summary() {
    local summary_file="$CONFIG_DIR/config_summary.txt"
    local tr_packages tr_customfeeds tr_variables tr_customscripts
    local has_content=0
    
    tr_packages=$(translate "tr-tui-summary-packages")
    tr_customfeeds=$(translate "tr-tui-summary-customfeeds")
    tr_variables=$(translate "tr-tui-summary-variables")
    tr_customscripts=$(translate "tr-tui-summary-customscripts")
    
    {
        if [ -f "$SELECTED_PACKAGES" ] && [ -s "$SELECTED_PACKAGES" ]; then
            printf "🔵 %s\n\n" "$tr_packages"
            
            # id_opts_list を構築（generate_files()と同じロジック）
            local id_opts_list=""
            while read -r cache_line; do
                local pkg_id install_opts install_opts_value
                pkg_id=$(echo "$cache_line" | cut -d= -f1)
                install_opts=$(echo "$cache_line" | cut -d= -f4)
                
                # installOptionsキー名を実際のオプション値に変換
                if [ -n "$install_opts" ]; then
                    install_opts_value=$(convert_install_option "$install_opts")
                else
                    install_opts_value=""
                fi
                
                id_opts_list="${id_opts_list}${pkg_id}|${install_opts_value}
"
            done < "$SELECTED_PACKAGES"
            
            # 重複除去とオプション処理
            local processed_ids=""
            while read -r line; do
                [ -z "$line" ] && continue
                
                local current_id current_opts
                current_id=$(echo "$line" | cut -d'|' -f1)
                current_opts=$(echo "$line" | cut -d'|' -f2)
                
                echo "$processed_ids" | grep -q "^${current_id}\$" && continue
                
                local same_id_lines count
                same_id_lines=$(echo "$id_opts_list" | grep "^${current_id}|")
                count=$(echo "$same_id_lines" | grep -c "^${current_id}|")
                
                if [ "$count" -gt 1 ]; then
                    # 同じIDが複数ある場合、オプションなしを優先
                    local no_opts_line
                    no_opts_line=$(echo "$same_id_lines" | grep "^${current_id}|$" | head -1)
                    
                    if [ -n "$no_opts_line" ]; then
                        echo "$current_id"
                    else
                        local has_opts_line opts_value
                        has_opts_line=$(echo "$same_id_lines" | grep "|.\+$" | head -1)
                        
                        if [ -n "$has_opts_line" ]; then
                            opts_value=$(echo "$has_opts_line" | cut -d'|' -f2)
                            echo "${opts_value} ${current_id}"
                        else
                            echo "$current_id"
                        fi
                    fi
                else
                    if [ -n "$current_opts" ]; then
                        echo "${current_opts} ${current_id}"
                    else
                        echo "$current_id"
                    fi
                fi
                
                processed_ids="${processed_ids}${current_id}
"
            done <<EOF
$id_opts_list
EOF
            
            echo ""
            has_content=1
        fi
        
        if [ -f "$SELECTED_CUSTOM_PACKAGES" ] && [ -s "$SELECTED_CUSTOM_PACKAGES" ]; then
            printf "🟢 %s\n\n" "$tr_customfeeds"
            cut -d= -f1 "$SELECTED_CUSTOM_PACKAGES"
            echo ""
            has_content=1
        fi
        
        # 設定変数は SETUP_VARS から一度だけ表示
        if [ -f "$SETUP_VARS" ] && [ -s "$SETUP_VARS" ]; then
            printf "🟡 %s\n\n" "$tr_variables"
            cat "$SETUP_VARS"
            echo ""
            has_content=1
        fi
        
        # カスタムスクリプトの変数
        for var_file in "$CONFIG_DIR"/script_vars_*.txt; do
            [ -f "$var_file" ] || continue
            
            local script_id script_name
            script_id=$(basename "$var_file" | sed 's/^script_vars_//;s/\.txt$//')
            script_name=$(get_customscript_name "$script_id")
            [ -z "$script_name" ] && script_name="$script_id"
            
            printf "🔴 %s\n\n" "$tr_customscripts"
            cat "$var_file"
            echo ""
            has_content=1
        done
        
        if [ "$has_content" -eq 0 ]; then
            echo "$(translate 'tr-tui-no-config')"
        fi
    } > "$summary_file"
    
    echo "$summary_file"
}

update_package_manager() {
    local needs_update=0
    
    # 1. postinst.json - 選択済みパッケージがある場合のみチェック
    if [ "$needs_update" -eq 0 ] && [ -s "$SELECTED_PACKAGES" ]; then
        # ファイルレベル
        local update=$(jsonfilter -i "$PACKAGES_JSON" -e "@.requiresUpdate" 2>/dev/null)
        [ "$update" = "true" ] && needs_update=1
        
        # カテゴリ/アイテムレベル
        if [ "$needs_update" -eq 0 ]; then
            while read -r line; do
                local id=$(echo "$line" | cut -d= -f1)
                
                local update=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.packages[*].id='$id'].requiresUpdate" 2>/dev/null | head -1)
                [ "$update" = "true" ] && needs_update=1 && break
                
                update=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[*].packages[@.id='$id'].requiresUpdate" 2>/dev/null | head -1)
                [ "$update" = "true" ] && needs_update=1 && break
            done < "$SELECTED_PACKAGES"
        fi
    fi
    
    # 2. customfeeds.json - 選択済みカスタムパッケージがある場合のみチェック
    if [ "$needs_update" -eq 0 ] && [ -s "$SELECTED_CUSTOM_PACKAGES" ]; then
        # ファイルレベル
        local update=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.requiresUpdate" 2>/dev/null)
        [ "$update" = "true" ] && needs_update=1
        
        # カテゴリ/アイテムレベル
        if [ "$needs_update" -eq 0 ]; then
            while read -r line; do
                local id=$(echo "$line" | cut -d= -f1)
                
                local update=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.packages[*].id='$id'].requiresUpdate" 2>/dev/null | head -1)
                [ "$update" = "true" ] && needs_update=1 && break
                
                update=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[*].packages[@.id='$id'].requiresUpdate" 2>/dev/null | head -1)
                [ "$update" = "true" ] && needs_update=1 && break
            done < "$SELECTED_CUSTOM_PACKAGES"
        fi
    fi
    
    # 3. customscripts.json - 実行予定スクリプトがある場合のみチェック
    if [ "$needs_update" -eq 0 ]; then
        for var_file in "$CONFIG_DIR"/script_vars_*.txt; do
            [ -f "$var_file" ] || continue
            local script_id=$(basename "$var_file" | sed 's/^script_vars_//;s/\.txt$//')
            
            # スクリプトレベル
            local update=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].requiresUpdate" 2>/dev/null | head -1)
            [ "$update" = "true" ] && needs_update=1 && break
            
            # オプションレベル
            local option=$(grep "^SELECTED_OPTION=" "$var_file" 2>/dev/null | cut -d"'" -f2)
            [ -n "$option" ] && {
                update=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[@.id='$option'].requiresUpdate" 2>/dev/null | head -1)
                [ "$update" = "true" ] && needs_update=1 && break
            }
        done
    fi
    
    # 更新実行
    if [ "$needs_update" -eq 1 ]; then
        echo "Updating package database..."
        case "$PKG_MGR" in
            opkg) opkg update ;;
            apk) apk update ;;
        esac
    fi
}

needs_reboot_check() {
    local needs_reboot=0
    
    # Setup.json の変更チェック
    
    if [ -s "$SETUP_VARS" ]; then
        # ファイルレベルの reboot フラグ
        local file_reboot
        file_reboot=$(jsonfilter -i "$SETUP_JSON" -e "@.reboot" 2>/dev/null)
        if [ "$file_reboot" = "true" ]; then
            needs_reboot=1
        fi
        
        # カテゴリレベル/項目レベルのチェック（ファイルレベルがfalseの場合）
        if [ "$needs_reboot" -eq 0 ]; then
            while read -r line; do
                # コメント行と空行をスキップ
                case "$line" in
                    \#*|'') continue ;;
                esac
                
                local var_name
                var_name=$(echo "$line" | cut -d= -f1)
                
                # カテゴリレベルの reboot フラグをチェック
                local cat_reboot
                cat_reboot=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.items[*].variable='$var_name'].reboot" 2>/dev/null | head -1)
                if [ "$cat_reboot" = "true" ]; then
                    needs_reboot=1
                    break
                fi
                
                # 項目レベル（トップレベル）の reboot フラグ
                local item_reboot
                item_reboot=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.variable='$var_name'].reboot" 2>/dev/null | head -1)
                if [ "$item_reboot" = "true" ]; then
                    needs_reboot=1
                    break
                fi
                
                # 項目レベル（section内）の reboot フラグ
                if [ -z "$item_reboot" ] || [ "$item_reboot" = "null" ]; then
                    item_reboot=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.variable='$var_name'].reboot" 2>/dev/null | head -1)
                    if [ "$item_reboot" = "true" ]; then
                        needs_reboot=1
                        break
                    fi
                fi
            done < "$SETUP_VARS"
        fi
    fi
    
    # postinst.json のパッケージチェック

    if [ "$needs_reboot" -eq 0 ] && [ -s "$SELECTED_PACKAGES" ]; then
        # ファイルレベルの reboot フラグ
        local file_reboot
        file_reboot=$(jsonfilter -i "$PACKAGES_JSON" -e "@.reboot" 2>/dev/null)
        if [ "$file_reboot" = "true" ]; then
            needs_reboot=1
        fi
        
        # カテゴリレベル/項目レベルのチェック
        if [ "$needs_reboot" -eq 0 ]; then
            while read -r pkg_id; do
                # カテゴリレベルの reboot フラグ
                local cat_reboot
                cat_reboot=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.packages[*].id='$pkg_id'].reboot" 2>/dev/null | head -1)
                if [ "$cat_reboot" = "true" ]; then
                    needs_reboot=1
                    break
                fi
                
                # 項目レベルの reboot フラグ
                local pkg_reboot
                pkg_reboot=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].reboot" 2>/dev/null | head -1)
                if [ "$pkg_reboot" = "true" ]; then
                    needs_reboot=1
                    break
                fi
            done < "$SELECTED_PACKAGES"
        fi
    fi
    
    # customfeeds.json のパッケージチェック

    if [ "$needs_reboot" -eq 0 ] && [ -s "$SELECTED_CUSTOM_PACKAGES" ]; then
        # ファイルレベルの reboot フラグ
        local file_reboot
        file_reboot=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.reboot" 2>/dev/null)
        if [ "$file_reboot" = "true" ]; then
            needs_reboot=1
        fi
        
        # カテゴリレベル/項目レベルのチェック
        if [ "$needs_reboot" -eq 0 ]; then
            while read -r pkg_id; do
                # カテゴリレベルの reboot フラグ
                local cat_reboot
                cat_reboot=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.packages[*].id='$pkg_id'].reboot" 2>/dev/null | head -1)
                if [ "$cat_reboot" = "true" ]; then
                    needs_reboot=1
                    break
                fi
                
                # 項目レベルの reboot フラグ
                local pkg_reboot
                pkg_reboot=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].reboot" 2>/dev/null | head -1)
                if [ "$pkg_reboot" = "true" ]; then
                    needs_reboot=1
                    break
                fi
            done < "$SELECTED_CUSTOM_PACKAGES"
        fi
    fi
    
    # customscripts.json のスクリプトチェック
    
    if [ "$needs_reboot" -eq 0 ]; then
        for var_file in "$CONFIG_DIR"/script_vars_*.txt; do
            [ -f "$var_file" ] || continue
            
            local script_id selected_option option_reboot script_reboot
            script_id=$(basename "$var_file" | sed 's/^script_vars_//;s/\.txt$//')
            
            # 選択されたオプションIDを取得
            selected_option=$(grep "^SELECTED_OPTION=" "$var_file" 2>/dev/null | cut -d"'" -f2)
            
            # オプションレベルの reboot フラグをチェック
            if [ -n "$selected_option" ]; then
                option_reboot=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[@.id='$selected_option'].reboot" 2>/dev/null | head -1)
                
                if [ "$option_reboot" = "true" ]; then
                    needs_reboot=1
                    break
                elif [ "$option_reboot" = "false" ]; then
                    # オプションで明示的にfalse → reboot不要、次のスクリプトへ
                    continue
                fi
            fi
            
            # オプションにrebootがない場合、スクリプトレベルをチェック
            script_reboot=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].reboot" 2>/dev/null | head -1)
            
            if [ "$script_reboot" = "true" ]; then
                needs_reboot=1
                break
            fi
        done
    fi
    
    echo "$needs_reboot"
}

# Backup and Restore Functions

load_restore_path() {
    if [ -f "$RESTORE_PATH_CONFIG" ]; then
        cat "$RESTORE_PATH_CONFIG"
    else
        echo "$BACKUP_DIR"
    fi
}

save_restore_path() {
    local path="$1"
    mkdir -p "$(dirname "$RESTORE_PATH_CONFIG")"
    echo "$path" > "$RESTORE_PATH_CONFIG"
}

create_backup() {
    local trigger="${1:-manual}"
    local timestamp backup_file
    
    timestamp=$(date +%Y%m%d_%H%M%S)
    backup_file="$BACKUP_DIR/backup-${timestamp}.tar.gz"
    
    mkdir -p "$BACKUP_DIR" || return 1
    
    if ! sysupgrade -b "$backup_file"; then
        echo "Error: sysupgrade backup failed" >&2
        return 1
    fi
    
    if [ ! -f "$backup_file" ] || [ ! -s "$backup_file" ]; then
        echo "Error: Backup file not created or empty" >&2
        return 1
    fi
    
    cleanup_old_backups
    return 0
}

cleanup_old_backups() {
    local backup_count
    backup_count=$(ls -1 "$BACKUP_DIR"/backup-*.tar.gz 2>/dev/null | wc -l)
    
    if [ "$backup_count" -gt "$MAX_BACKUPS" ]; then
        ls -1t "$BACKUP_DIR"/backup-*.tar.gz | tail -n +$((MAX_BACKUPS + 1)) | xargs rm -f
    fi
}

restore_from_backup() {
    local backup_file="$1"
    
    if [ ! -f "$backup_file" ]; then
        echo "Error: Backup file not found: $backup_file" >&2
        return 1
    fi
    
    if ! create_backup "before_restore"; then
        echo "Error: Failed to create backup before restore" >&2
        return 1
    fi
    
    if ! sysupgrade -r "$backup_file"; then
        echo "Error: sysupgrade restore failed" >&2
        return 1
    fi
    
    return 0
}

restore_point_menu() {
    local tr_main_menu tr_restore_point breadcrumb
    local current_path custom_path backups menu_items i choice selected_backup
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_restore_point=$(translate "tr-tui-restore-point")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_restore_point")
    
    current_path=$(load_restore_path)
    
    custom_path=$(show_inputbox "$breadcrumb" "$(translate 'tr-restore-backup-path')" "$current_path")
    
    if ! [ $? -eq 0 ] || [ -z "$custom_path" ]; then
        return 0
    fi
    
    save_restore_path "$custom_path"
    
    backups=$(ls -1t "${custom_path}"/backup-*.tar.gz 2>/dev/null)
    
    if [ -z "$backups" ]; then
        show_msgbox "$breadcrumb" "$(translate 'tr-tui-no-restore-points')"
        return 0
    fi
    
    menu_items=""
    i=1
    
    while read -r backup_file; do
        local timestamp display_date
        
        timestamp=$(basename "$backup_file" | sed 's/^backup-//;s/\.tar\.gz$//')
        display_date=$(echo "$timestamp" | sed 's/\([0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)_\([0-9]\{2\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)/\1-\2-\3 \4:\5:\6/')
        
        menu_items="$menu_items $i \"$display_date\""
        i=$((i+1))
    done <<EOF
$backups
EOF
    
    choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items")
    
    if ! [ $? -eq 0 ] || [ -z "$choice" ]; then
        return 0
    fi
    
    selected_backup=$(echo "$backups" | sed -n "${choice}p")
    
    if show_yesno "$breadcrumb" "$(translate 'tr-tui-restore-confirm')\n\n$(translate 'tr-tui-restore-warning')"; then
        if restore_from_backup "$selected_backup"; then
            if show_yesno "$breadcrumb" "$(translate 'tr-tui-restore-success')\n\n$(translate 'tr-tui-reboot-question')"; then
                reboot
            fi
        else
            show_msgbox "$breadcrumb" "$(translate 'tr-tui-restore-failed')"
        fi
    fi
}

# Main Entry Point

show_log() {
    if [ -f "$BASE_TMP_DIR/aios2/debug.log" ]; then
        cat "$BASE_TMP_DIR/aios2/debug.log"
    else
        echo "No log file found at $BASE_TMP_DIR/aios2/debug.log"
    fi
}

aios2_main() {
    START_TIME=$(cut -d' ' -f1 /proc/uptime)
    
    # ヘルパー: 経過時間計測
    elapsed_time() {
        local current=$(cut -d' ' -f1 /proc/uptime)
        awk "BEGIN {printf \"%.3f\", $current - $START_TIME}"
    }
    
    # バナー表示と言語コード取得
    clear
    print_banner
    mkdir -p "$CONFIG_DIR"
    get_language_code
    
    # ========================================
    # Phase 1: 初期化とconfig.js取得
    # ========================================
    __download_file_core "${BOOTSTRAP_URL}/config.js" "$CONFIG_DIR/config.js" || {
        echo "Error: Failed to download config.js"
        printf "Press [Enter] to exit. "
        read -r _
        return 1
    }
    
    init  # キャッシュクリア、ロックファイル作成、config.js読込（ASU_URL設定）
    
    # ========================================
    # Phase 2: 必須ファイルを並列ダウンロード
    # ========================================
    (download_file_with_cache "$PACKAGE_MANAGER_CONFIG_URL" "$PACKAGE_MANAGER_JSON") &
    PKG_MGR_DL_PID=$!
    
    (download_api_with_retry) &
    API_PID=$!
    
    (download_setup_json) &
    SETUP_PID=$!
    
    (download_postinst_json) &
    POSTINST_PID=$!
    
    (download_customfeeds_json >/dev/null 2>&1) &
    CUSTOMFEEDS_PID=$!
    
    (download_customscripts_json >/dev/null 2>&1) &
    CUSTOMSCRIPTS_PID=$!
    
    (prefetch_templates) &
    TEMPLATES_PID=$!
    
    (download_language_json "en" >/dev/null 2>&1) &
    LANG_EN_PID=$!
    
    # 母国語ファイル（enでない場合のみ）
    NATIVE_LANG_PID=""
    if [ -n "$AUTO_LANGUAGE" ] && [ "$AUTO_LANGUAGE" != "en" ]; then
        (download_language_json "${AUTO_LANGUAGE}") &
        NATIVE_LANG_PID=$!
    fi
    
    # UIモジュールファイル
    (
        [ -n "$WHIPTAIL_UI_URL" ] && __download_file_core "$WHIPTAIL_UI_URL" "$CONFIG_DIR/aios2-whiptail.sh"
        [ -n "$SIMPLE_UI_URL" ] && __download_file_core "$SIMPLE_UI_URL" "$CONFIG_DIR/aios2-simple.sh"
    ) &
    UI_DL_PID=$!
    
    # ========================================
    # Phase 3: whiptail有無チェック
    # ========================================
    WHIPTAIL_AVAILABLE=0
    command -v whiptail >/dev/null 2>&1 && WHIPTAIL_AVAILABLE=1
    
    # ========================================
    # Phase 4: UI選択（ユーザー入力）
    # ========================================
    UI_START=$(cut -d' ' -f1 /proc/uptime)
    select_ui_mode
    UI_END=$(cut -d' ' -f1 /proc/uptime)
    UI_DURATION=$(awk "BEGIN {printf \"%.3f\", $UI_END - $UI_START}")
    
    # whiptail選択 かつ 未インストールの場合 → package-manager.json完了を待ってインストール
    if [ "$UI_MODE" = "whiptail" ] && [ "$WHIPTAIL_AVAILABLE" -eq 0 ]; then
        echo "Waiting for package manager configuration..."
        wait $PKG_MGR_DL_PID
        
        load_package_manager_config || {
            echo "Failed to load package manager config"
            printf "Press [Enter] to exit. "
            read -r _
            return 1
        }
        
        echo "Installing whiptail..."
        echo "Updating package lists..."
        eval "$PKG_UPDATE_CMD" || echo "Warning: Failed to update package lists"
        
        if ! install_package whiptail; then
            echo "Installation failed. Falling back to simple mode."
            UI_MODE="simple"
        else
            echo "Installation successful."
        fi
    fi
    
    # 母国語ファイル完了を待機
    [ -n "$NATIVE_LANG_PID" ] && wait $NATIVE_LANG_PID
    
    TIME_BEFORE_UI=$(elapsed_time)
    echo "[TIME] Pre-UI processing: ${TIME_BEFORE_UI}s" >> "$CONFIG_DIR/debug.log"
    
    # ========================================
    # Phase 5: 必須JSON完了を待機
    # ========================================
    wait $API_PID
    
    wait $SETUP_PID
    SETUP_STATUS=$?
    [ $SETUP_STATUS -ne 0 ] && {
        echo "Cannot continue without setup.json"
        printf "Press [Enter] to exit. "
        read -r _
        return 1
    }
    
    wait $POSTINST_PID
    POSTINST_STATUS=$?
    [ $POSTINST_STATUS -ne 0 ] && {
        echo "Cannot continue without postinst.json"
        printf "Press [Enter] to exit. "
        read -r _
        return 1
    }
    
    wait $UI_DL_PID
    
    # ========================================
    # Phase 6: package-manager.jsonロード
    # ========================================
    wait $PKG_MGR_DL_PID
    
    if [ "$UI_MODE" = "simple" ] || [ "$WHIPTAIL_AVAILABLE" -eq 1 ]; then
        load_package_manager_config || {
            echo "Failed to load package manager config"
            printf "Press [Enter] to exit. "
            read -r _
            return 1
        }
    fi
    
    # ========================================
    # Phase 7: デバイス情報取得（API情報で上書き・補完）
    # DEVICE_TARGET, OPENWRT_VERSIONをここで設定
    # ========================================
    get_extended_device_info

    # バックグラウンドプロセス用に export
    export DEVICE_TARGET
    export OPENWRT_VERSION
    export ASU_URL
    export DEVICE_MODEL
    export DEVICE_ARCH
    export DEVICE_VENDOR
    export DEVICE_SUBTARGET
    
    echo "[DEBUG] Exported variables:" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG]   DEVICE_ARCH='$DEVICE_ARCH'" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG]   DEVICE_VENDOR='$DEVICE_VENDOR'" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG]   DEVICE_SUBTARGET='$DEVICE_SUBTARGET'" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG]   DEVICE_TARGET='$DEVICE_TARGET'" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG]   OPENWRT_VERSION='$OPENWRT_VERSION'" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG]   ASU_URL='$ASU_URL'" >> "$CONFIG_DIR/debug.log"
    
    # ========================================
    # Phase 8: パッケージ存在確認キャッシュ構築
    # 変数が揃った後に実行
    # ========================================
    cache_package_availability &
    CACHE_PKG_PID=$!
    
    # ========================================
    # Phase 9: 残りのバックグラウンド処理完了を待機
    # ========================================
    wait $CUSTOMFEEDS_PID
    wait $CUSTOMSCRIPTS_PID
    wait $TEMPLATES_PID
    wait $LANG_EN_PID
    
    # APIから言語コードが取得できた場合、母国語ファイルを再取得
    if [ -n "$AUTO_LANGUAGE" ] && [ "$AUTO_LANGUAGE" != "en" ]; then
        [ ! -f "$CONFIG_DIR/lang_${AUTO_LANGUAGE}.json" ] && download_language_json "${AUTO_LANGUAGE}"
    fi
    
    # 処理時間計測
    CURRENT_TIME=$(cut -d' ' -f1 /proc/uptime)
    TOTAL_AUTO_TIME=$(awk "BEGIN {printf \"%.3f\", $CURRENT_TIME - $START_TIME - $UI_DURATION}")
    echo "[TIME] Total auto-processing: ${TOTAL_AUTO_TIME}s" >> "$CONFIG_DIR/debug.log"
    
    # simple UIの場合、Yes/No表記を簡略化
    if [ "$UI_MODE" = "simple" ] && [ -f "$CONFIG_DIR/lang_${AUTO_LANGUAGE}.json" ]; then
        sed -i 's/"tr-tui-yes": "[^"]*"/"tr-tui-yes": "y"/' "$CONFIG_DIR/lang_${AUTO_LANGUAGE}.json"
        sed -i 's/"tr-tui-no": "[^"]*"/"tr-tui-no": "n"/' "$CONFIG_DIR/lang_${AUTO_LANGUAGE}.json"
    fi
    
    # ========================================
    # Phase 10: パッケージキャッシュ完了を待機
    # ========================================
    # echo "Building package cache..."
    # wait $CACHE_PKG_PID
    # CACHE_STATUS=$?
    # if [ $CACHE_STATUS -ne 0 ]; then
    #     echo "[WARNING] Package cache build failed, some packages may not be available" >> "$CONFIG_DIR/debug.log"
    # fi
    # echo "[DEBUG] Package availability cache ready" >> "$CONFIG_DIR/debug.log"
    
    # ========================================
    # Phase 11: UIモジュール起動
    # ========================================
    if [ -f "$CONFIG_DIR/aios2-${UI_MODE}.sh" ]; then
        . "$CONFIG_DIR/aios2-${UI_MODE}.sh"
        aios2_${UI_MODE}_main
    else
        echo "Error: UI module aios2-${UI_MODE}.sh not found."
        return 1
    fi
    
    echo ""
    echo "Thank you for using aios2!"
    echo ""
}

# オプション処理
case "$1" in
    l|-log|--log)
        show_log
        ;;
    *)
        aios2_main
        ;;
esac
