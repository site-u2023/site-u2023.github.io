#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC2086,SC3043
# OpenWrt Device Setup Tool - CLI Version
# ASU (Attended SysUpgrade) Compatible
# Common Functions (UI-independent)

VERSION="R7.1208.0313"

SCRIPT_NAME=$(basename "$0")
BASE_TMP_DIR="/tmp"
CONFIG_DIR="$BASE_TMP_DIR/aios2"
BACKUP_DIR="/etc/aios2/backup"
RESTORE_PATH_CONFIG="/etc/aios2/restore_path.txt"
MAX_BACKUPS="10"
BOOTSTRAP_URL="https://site-u.pages.dev/www"
BASE_URL=""
AUTO_CONFIG_API_URL=""
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

BREADCRUMB_SEP=" > "

_PACKAGE_ENABLEVAR_CACHE=""
_PACKAGE_ENABLEVAR_LOADED=0
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

clear_selection_cache() {
    _SELECTED_PACKAGES_CACHE_LOADED=0
    _SELECTED_CUSTOM_CACHE_LOADED=0
    _SELECTED_PACKAGES_CACHE=""
    _SELECTED_CUSTOM_CACHE=""
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
LANG_JSON="$CONFIG_DIR/lang.json"
LANG_JSON_EN="$CONFIG_DIR/lang_en.json"
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
        printf "\naios2 Vr.%s\n\n" "$VERSION"
    fi
}

load_config_from_js() {
    local CONFIG_JS="$CONFIG_DIR/config.js"
    local CONFIG_CONTENT
    
    # ファイルを1回だけ読み込み
    CONFIG_CONTENT=$(cat "$CONFIG_JS")
    
    # 内容に対して grep（ファイルI/O が1回で済む）
    BASE_URL_PART=$(echo "$CONFIG_CONTENT" | grep "base_url:" | sed 's/.*"\([^"]*\)".*/\1/')
    BASE_PATH_PART=$(echo "$CONFIG_CONTENT" | grep "base_path:" | sed 's/.*"\([^"]*\)".*/\1/')
    AUTO_CONFIG_API_URL=$(echo "$CONFIG_CONTENT" | grep "auto_config_api_url:" | sed 's/.*"\([^"]*\)".*/\1/')
    PACKAGES_DB_PATH=$(echo "$CONFIG_CONTENT" | grep "packages_db_path:" | sed 's/.*"\([^"]*\)".*/\1/')
    POSTINST_TEMPLATE_PATH=$(echo "$CONFIG_CONTENT" | grep "postinst_template_path:" | sed 's/.*"\([^"]*\)".*/\1/')
    SETUP_DB_PATH=$(echo "$CONFIG_CONTENT" | grep "setup_db_path:" | sed 's/.*"\([^"]*\)".*/\1/')
    SETUP_TEMPLATE_PATH=$(echo "$CONFIG_CONTENT" | grep "setup_template_path:" | sed 's/.*"\([^"]*\)".*/\1/')
    CUSTOMFEEDS_DB_PATH=$(echo "$CONFIG_CONTENT" | grep "customfeeds_db_path:" | sed 's/.*"\([^"]*\)".*/\1/')
    CUSTOMSCRIPTS_DB_PATH=$(echo "$CONFIG_CONTENT" | grep "customscripts_db_path:" | sed 's/.*"\([^"]*\)".*/\1/')
    LANGUAGE_PATH_TEMPLATE=$(echo "$CONFIG_CONTENT" | grep "language_path_template:" | sed 's/.*"\([^"]*\)".*/\1/')
    WHIPTAIL_UI_PATH=$(echo "$CONFIG_CONTENT" | grep "whiptail_ui_path:" | sed 's/.*"\([^"]*\)".*/\1/')
    SIMPLE_UI_PATH=$(echo "$CONFIG_CONTENT" | grep "simple_ui_path:" | sed 's/.*"\([^"]*\)".*/\1/')
    WHIPTAIL_FALLBACK_PATH=$(echo "$CONFIG_CONTENT" | grep "whiptail_fallback_path:" | sed 's/.*"\([^"]*\)".*/\1/')
    
    # BASE_URL を構築
    BASE_URL="${BASE_URL_PART}/${BASE_PATH_PART}"
    
    # URL変数を構築
    PACKAGES_URL="${BASE_URL}/${PACKAGES_DB_PATH}"
    POSTINST_TEMPLATE_URL="${BASE_URL}/${POSTINST_TEMPLATE_PATH}"
    SETUP_JSON_URL="${BASE_URL}/${SETUP_DB_PATH}"
    SETUP_TEMPLATE_URL="${BASE_URL}/${SETUP_TEMPLATE_PATH}"
    CUSTOMFEEDS_JSON_URL="${BASE_URL}/${CUSTOMFEEDS_DB_PATH}"
    CUSTOMSCRIPTS_JSON_URL="${BASE_URL}/${CUSTOMSCRIPTS_DB_PATH}"
    WHIPTAIL_FALLBACK_URL="${BASE_URL}/${WHIPTAIL_FALLBACK_PATH}"
    
    local CACHE_BUSTER="?t=$(date +%s)"
    WHIPTAIL_UI_URL="${BASE_URL}/${WHIPTAIL_UI_PATH}${CACHE_BUSTER}"
    SIMPLE_UI_URL="${BASE_URL}/${SIMPLE_UI_PATH}${CACHE_BUSTER}"
    
    {
        echo "[DEBUG] Config loaded: BASE_URL=$BASE_URL"
        echo "[DEBUG] AUTO_CONFIG_API_URL=$AUTO_CONFIG_API_URL"
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

detect_package_manager() {
    if command -v opkg >/dev/null 2>&1; then
        PKG_MGR="opkg"
    elif command -v apk >/dev/null 2>&1; then
        PKG_MGR="apk"
    else
        echo "Warning: No supported package manager found"
        PKG_MGR="none"
    fi
}

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

install_package() {
    case "$PKG_MGR" in
        opkg)
            opkg update
            opkg install "$@" || return 1
            ;;
        apk)
            apk update
            apk add "$@" || return 1
            ;;
        *)
            echo "Cannot install packages: no supported package manager"
            return 1
            ;;
    esac
    return 0
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
    
    # find を使わず、直接削除（高速化）
    rm -f "$CONFIG_DIR"/*.json "$CONFIG_DIR"/*.sh "$CONFIG_DIR"/*.txt "$CONFIG_DIR"/debug.log 2>/dev/null
    
    # config.js は既にDL済みなのでパースのみ
    load_config_from_js || {
        echo "Fatal: Cannot load configuration"
        return 1
    }

    unset _TRANSLATIONS_LOADED
    unset _TRANSLATIONS_DATA
    
    : > "$SELECTED_PACKAGES"
    : > "$SELECTED_CUSTOM_PACKAGES"
    : > "$SETUP_VARS"
    : > "$CONFIG_DIR/debug.log"

    unset _PACKAGE_ENABLEVAR_CACHE
    unset _PACKAGE_NAME_CACHE
    unset _CUSTOMFEED_CATEGORIES_CACHE
    unset _CATEGORIES_CACHE
    unset _SETUP_CATEGORIES_CACHE
    
    _PACKAGE_ENABLEVAR_LOADED=0
    _PACKAGE_NAME_LOADED=0
    _CUSTOMFEED_CATEGORIES_LOADED=0
    _CATEGORIES_LOADED=0
    _SETUP_CATEGORIES_LOADED=0
    
    echo "[DEBUG] $(date): Init complete, cache cleared" >> "$CONFIG_DIR/debug.log"
}

# Language and Translation

download_language_json() {
    local lang="${1:-en}"
    local lang_url
    
    lang_url="${BASE_URL}/$(echo "$LANGUAGE_PATH_TEMPLATE" | sed "s/{lang}/${lang}/")"
    
    if [ "$lang" = "en" ]; then
        LANG_JSON_EN="$CONFIG_DIR/lang_en.json"
        __download_file_core "$lang_url" "$LANG_JSON_EN" || return 1
        cp "$LANG_JSON_EN" "$LANG_JSON"
    else
        __download_file_core "$lang_url" "$LANG_JSON" || return 1
    fi
    
    return 0
}

translate() {
    local key="$1"
    local translation

    if [ -z "$_TRANSLATIONS_LOADED" ]; then
        _TRANSLATIONS_DATA=$(cat "$LANG_JSON" 2>/dev/null)
        _TRANSLATIONS_LOADED=1
    fi
    
    translation=$(echo "$_TRANSLATIONS_DATA" | jsonfilter -e "@['$key']" 2>/dev/null)
    
    if [ -n "$translation" ]; then
        echo "$translation"
        return 0
    fi
    
    if [ -f "$LANG_JSON_EN" ]; then
        if [ -z "$_TRANSLATIONS_EN_LOADED" ]; then
            _TRANSLATIONS_EN_DATA=$(cat "$LANG_JSON_EN" 2>/dev/null)
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
    fi
    
    [ -z "$DEVICE_MODEL" ] && DEVICE_MODEL="Unknown"
    [ -z "$DEVICE_TARGET" ] && DEVICE_TARGET="unknown/unknown"
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

get_extended_device_info() {
    get_device_info
    OPENWRT_VERSION=$(grep 'DISTRIB_RELEASE' /etc/openwrt_release 2>/dev/null | cut -d"'" -f2)
    
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

export_device_info() {
    local output_file="$1"
    
    cat > "$output_file" <<EOF
DEVICE_MODEL='$DEVICE_MODEL'
DEVICE_TARGET='$DEVICE_TARGET'
OPENWRT_VERSION='$OPENWRT_VERSION'
AUTO_LANGUAGE='$AUTO_LANGUAGE'
AUTO_TIMEZONE='$AUTO_TIMEZONE'
AUTO_ZONENAME='$AUTO_ZONENAME'
AUTO_COUNTRY='$AUTO_COUNTRY'
ISP_NAME='$ISP_NAME'
ISP_AS='$ISP_AS'
ISP_IPV6='$ISP_IPV6'
MAPE_BR='$MAPE_BR'
MAPE_EALEN='$MAPE_EALEN'
MAPE_IPV4_PREFIX='$MAPE_IPV4_PREFIX'
MAPE_IPV4_PREFIXLEN='$MAPE_IPV4_PREFIXLEN'
MAPE_IPV6_PREFIX='$MAPE_IPV6_PREFIX'
MAPE_IPV6_PREFIXLEN='$MAPE_IPV6_PREFIXLEN'
MAPE_PSIDLEN='$MAPE_PSIDLEN'
MAPE_PSID_OFFSET='$MAPE_PSID_OFFSET'
MAPE_GUA_PREFIX='$MAPE_GUA_PREFIX'
DSLITE_AFTR='$DSLITE_AFTR'
DSLITE_AFTR_TYPE='$DSLITE_AFTR_TYPE'
DSLITE_JURISDICTION='$DSLITE_JURISDICTION'
DETECTED_CONN_TYPE='$DETECTED_CONN_TYPE'
DEVICE_CPU='$DEVICE_CPU'
DEVICE_STORAGE='$DEVICE_STORAGE'
DEVICE_STORAGE_USED='$DEVICE_STORAGE_USED'
DEVICE_STORAGE_AVAIL='$DEVICE_STORAGE_AVAIL'
DEVICE_USB='$DEVICE_USB'
MEM_FREE_MB='$MEM_FREE_MB'
FLASH_FREE_MB='$FLASH_FREE_MB'
DEVICE_MEM='$DEVICE_MEM'
LAN_IF='$LAN_IF'
LAN_ADDR='$LAN_ADDR'
LAN_ADDR6='$LAN_ADDR6'
EOF
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
        _SETUP_CATEGORIES_CACHE=$(jsonfilter -i "$SETUP_JSON" -e '@.categories[*].id' 2>/dev/null | grep -v '^$')
        _SETUP_CATEGORIES_LOADED=1
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
    local pkgs
    
    pkgs=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id'].packages[*].id" 2>/dev/null | grep -v '^$')
    [ -z "$pkgs" ] && pkgs=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$cat_id'].packages[*].id" 2>/dev/null | grep -v '^$')
    
    echo "$pkgs" | sort -u
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
    local name unique_id
    
    if [ "$_PACKAGE_NAME_LOADED" -eq 0 ]; then
        _PACKAGE_NAME_CACHE=$(jsonfilter -i "$PACKAGES_JSON" -e '@.categories[*].packages[*]' 2>/dev/null | \
            awk -F'"' '{
                id=""; name=""; uniqueId=""; installOptions=""; enableVar="";
                for(i=1;i<=NF;i++){
                    if($i=="id")id=$(i+2);
                    if($i=="name")name=$(i+2);
                    if($i=="uniqueId")uniqueId=$(i+2);
                    if($i=="installOptions")installOptions=$(i+2);
                    if($i=="enableVar")enableVar=$(i+2);
                }
                if(id&&name){
                    print id "=" name "=" uniqueId "=" installOptions "=" enableVar
                }
            }')
        
        if [ -f "$CUSTOMFEEDS_JSON" ]; then
            local custom_cache
            custom_cache=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e '@.categories[*].packages[*]' 2>/dev/null | \
                awk -F'"' '{
                    id=""; name=""; uniqueId=""; installOptions=""; enableVar="";
                    for(i=1;i<=NF;i++){
                        if($i=="id")id=$(i+2);
                        if($i=="name")name=$(i+2);
                        if($i=="uniqueId")uniqueId=$(i+2);
                        if($i=="installOptions")installOptions=$(i+2);
                        if($i=="enableVar")enableVar=$(i+2);
                    }
                    if(id&&name){
                        print id "=" name "=" uniqueId "=" installOptions "=" enableVar
                    }
                }')
            _PACKAGE_NAME_CACHE="${_PACKAGE_NAME_CACHE}
${custom_cache}"
        fi
        
        _PACKAGE_NAME_LOADED=1
        echo "[DEBUG] Package name cache:" >> "$CONFIG_DIR/debug.log"
        echo "$_PACKAGE_NAME_CACHE" >> "$CONFIG_DIR/debug.log"
    fi
    
    # uniqueId があれば uniqueId を返す、なければ name を返す
    while read -r line; do
        local cached_id=$(echo "$line" | cut -d= -f1)
        [ "$cached_id" != "$pkg_id" ] && continue
        
        unique_id=$(echo "$line" | cut -d= -f3)
        name=$(echo "$line" | cut -d= -f2)
        
        if [ -n "$unique_id" ]; then
            printf '%s\n' "$unique_id"
        else
            printf '%s\n' "$name"
        fi
    done <<EOF
$_PACKAGE_NAME_CACHE
EOF
}

get_package_enablevar() {
    local pkg_id="$1"
    local unique_id="$2"
    local enable_var
    
    if [ "$_PACKAGE_ENABLEVAR_LOADED" -eq 0 ]; then
        # postinst.json から id=uniqueId=enableVar の形式でキャッシュ作成
        _PACKAGE_ENABLEVAR_CACHE=$(jsonfilter -i "$PACKAGES_JSON" -e '@.categories[*].packages[*]' 2>/dev/null | \
            awk -F'"' '
            {
                id=""; uid=""; ev="";
                for(i=1;i<=NF;i++){
                    if($i=="id") id=$(i+2);
                    if($i=="uniqueId") uid=$(i+2);
                    if($i=="enableVar") ev=$(i+2);
                }
                if(id && ev) print id"="uid"="ev;
            }')
        
        if [ -f "$CUSTOMFEEDS_JSON" ]; then
            local custom_cache
            custom_cache=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e '@.categories[*].packages[*]' 2>/dev/null | \
                awk -F'"' '
                {
                    id=""; uid=""; ev="";
                    for(i=1;i<=NF;i++){
                        if($i=="id") id=$(i+2);
                        if($i=="uniqueId") uid=$(i+2);
                        if($i=="enableVar") ev=$(i+2);
                    }
                    if(id && ev) print id"="uid"="ev;
                }')
            _PACKAGE_ENABLEVAR_CACHE="${_PACKAGE_ENABLEVAR_CACHE}
${custom_cache}"
        fi
        
        _PACKAGE_ENABLEVAR_LOADED=1
    fi
    
    # キャッシュから検索
    if [ -n "$unique_id" ]; then
        # uniqueId がある場合: "id=uniqueId=enableVar" の行を探す
        enable_var=$(echo "$_PACKAGE_ENABLEVAR_CACHE" | grep "^${pkg_id}=${unique_id}=" | cut -d= -f3)
    fi
    
    # 見つからない場合は id だけで検索（uniqueId が空の行）
    if [ -z "$enable_var" ]; then
        enable_var=$(echo "$_PACKAGE_ENABLEVAR_CACHE" | grep "^${pkg_id}==" | cut -d= -f3)
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
    local min_mem min_flash msg
    
    script_name=$(get_customscript_name "$script_id")
    breadcrumb="${parent_breadcrumb} > ${script_name}"

    . "$CONFIG_DIR/tpl_customscript_${script_id}.sh"
    if ! check_script_requirements "$script_id"; then
        min_mem=$(get_customscript_requirement "$script_id" "minMemoryMB")
        min_flash=$(get_customscript_requirement "$script_id" "minFlashMB")
        
        msg="$(translate 'tr-tui-customscript-resource-check')

$(translate 'tr-tui-customscript-memory'): ${MEM_FREE_MB}MB $(translate 'tr-tui-customscript-available') / ${min_mem}MB $(translate 'tr-tui-customscript-minimum')
$(translate 'tr-tui-customscript-storage'): ${FLASH_FREE_MB}MB $(translate 'tr-tui-customscript-available') / ${min_flash}MB $(translate 'tr-tui-customscript-minimum')

$(translate 'tr-tui-customscript-resource-ng')"
        
        show_msgbox "$breadcrumb" "$msg"
        return 0
    fi
    
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
            # Fallback to all inputs if requiredInputs not defined (backward compatibility)
            inputs=$(get_customscript_inputs "$script_id")
        else
            # Use only required inputs
            inputs="$required_inputs"
        fi
    else
        # No option specified, use all inputs
        inputs=$(get_customscript_inputs "$script_id")
    fi
    
    for input_id in $inputs; do
        input_label=$(get_customscript_input_label "$script_id" "$input_id")
        input_default=$(get_customscript_input_default "$script_id" "$input_id")
        input_envvar=$(get_customscript_input_envvar "$script_id" "$input_id")
        input_hidden=$(get_customscript_input_hidden "$script_id" "$input_id")
        min_length=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].inputs[@.id='$input_id'].minlength" 2>/dev/null | head -1)
        
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
            value=$(show_inputbox "$breadcrumb" "$input_label" "$input_default")
            
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

should_show_item() {
    local item_id="$1"

        local is_hidden
    is_hidden=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].hidden" 2>/dev/null | head -1)
    
    if [ -z "$is_hidden" ]; then
        is_hidden=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].hidden" 2>/dev/null | head -1)
    fi
    
    [ "$is_hidden" = "true" ] && return 1
    
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
    
    # SETUP_VARSをスキャン（1回のみ）
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
    done < "$SETUP_VARS"
    
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
    local pkgs selected_pkgs cat_id template_url api_url download_url temp_pkg_file pkg_id pattern
    local tpl_custom enable_var
    local script_id script_file template_path script_url
    local temp_enablevars="$CONFIG_DIR/temp_enablevars.txt"

    : > "$temp_enablevars"
    
    if [ -s "$SELECTED_PACKAGES" ]; then
        while read -r cache_line; do
            local pkg_id unique_id enable_var
            pkg_id=$(echo "$cache_line" | cut -d= -f1)
            unique_id=$(echo "$cache_line" | cut -d= -f3)
            
            enable_var=$(get_package_enablevar "$pkg_id" "$unique_id")
            
            if [ -n "$enable_var" ] && ! grep -q "^${enable_var}=" "$SETUP_VARS" 2>/dev/null; then
                echo "${enable_var}='1'" >> "$temp_enablevars"
            fi
        done < "$SELECTED_PACKAGES"
        
        [ -s "$temp_enablevars" ] && cat "$temp_enablevars" >> "$SETUP_VARS"
    fi
    rm -f "$temp_enablevars"
    
    fetch_cached_template "$POSTINST_TEMPLATE_URL" "$TPL_POSTINST"
    
    if [ -f "$TPL_POSTINST" ]; then
        if [ -s "$SELECTED_PACKAGES" ]; then
            # id_opts_list を構築
            local id_opts_list=""
            
            while read -r cache_line; do
                local pkg_id install_opts
                pkg_id=$(echo "$cache_line" | cut -d= -f1)
                install_opts=$(echo "$cache_line" | cut -d= -f4)
                
                id_opts_list="${id_opts_list}${pkg_id}|${install_opts}
"
            done < "$SELECTED_PACKAGES"
            
            local final_list=""
            local processed_ids=""
            
            while read -r line; do
                [ -z "$line" ] && continue
                
                local current_id current_opts
                current_id=$(echo "$line" | cut -d'|' -f1)
                current_opts=$(echo "$line" | cut -d'|' -f2)
                
                if echo "$processed_ids" | grep -q "^${current_id}\$"; then
                    continue
                fi
                
                local same_id_lines
                same_id_lines=$(echo "$id_opts_list" | grep "^${current_id}|")
                local count
                count=$(echo "$same_id_lines" | grep -c "^${current_id}|")
                
                if [ "$count" -gt 1 ]; then
                    # 同じIDが複数ある場合、オプションなしを優先
                    local no_opts_line
                    no_opts_line=$(echo "$same_id_lines" | grep "^${current_id}|$" | head -1)
                    
                    if [ -n "$no_opts_line" ]; then
                        # オプションなしがある場合はそれを使う
                        final_list="${final_list}${current_id}
"
                    else
                        # オプションなしがない場合は最初のオプション付きを使う
                        local has_opts_line
                        has_opts_line=$(echo "$same_id_lines" | grep "|.\+$" | head -1)
                        
                        if [ -n "$has_opts_line" ]; then
                            local opts_value
                            opts_value=$(echo "$has_opts_line" | cut -d'|' -f2)
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
            done <<EOF
$id_opts_list
EOF
            
            pkgs=$(echo "$final_list" | xargs)
        else
            pkgs=""
        fi
        
        awk -v packages="$pkgs" '
            /^# BEGIN_VARIABLE_DEFINITIONS/ {
                print
                print "PACKAGES=\"" packages "\""
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
        
        while read -r cat_id; do
            (
                template_url=$(get_customfeed_template_url "$cat_id")
                
                [ -z "$template_url" ] && exit 0
                
                tpl_custom="$CONFIG_DIR/tpl_custom_${cat_id}.sh"
                
                fetch_cached_template "$template_url" "$tpl_custom"
                
                [ ! -f "$tpl_custom" ] && exit 0
                
                api_url=$(get_customfeed_api_base "$cat_id")
                download_url=$(get_customfeed_download_base "$cat_id")
                
                temp_pkg_file="$CONFIG_DIR/temp_${cat_id}.txt"
                : > "$temp_pkg_file"
                
                while read -r pkg_id; do
                    if grep -q "^${pkg_id}$" "$SELECTED_CUSTOM_PACKAGES" 2>/dev/null; then
                        pattern=$(get_customfeed_package_pattern "$pkg_id")
                        echo "$pattern" >> "$temp_pkg_file"
                    fi
                done <<EOF2
$(get_category_packages "$cat_id")
EOF2
                
                selected_pkgs=""
                if [ -s "$temp_pkg_file" ]; then
                    selected_pkgs=$(awk 'BEGIN{ORS=" "} {print} END{print ""}' "$temp_pkg_file" | sed 's/ $//')
                fi
                
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
                rm -f "$temp_pkg_file"
            ) &
            pids="$pids $!"
        done <<EOF3
$(get_customfeed_categories)
EOF3
        
        for pid in $pids; do
            wait $pid
        done
        
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
                } > "$CONFIG_DIR/customscripts-${script_id}.sh"
                
                chmod +x "$CONFIG_DIR/customscripts-${script_id}.sh"
            fi
        done <<SCRIPTS
$(get_customscript_all_scripts)
SCRIPTS
        
        echo "[DEBUG] customscripts generation completed" >> "$CONFIG_DIR/debug.log"
    fi

    # ファイル生成後、次回のために選択キャッシュをクリア
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
                local pkg_id install_opts
                pkg_id=$(echo "$cache_line" | cut -d= -f1)
                install_opts=$(echo "$cache_line" | cut -d= -f4)
                
                id_opts_list="${id_opts_list}${pkg_id}|${install_opts}
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
            
            printf "🔴 %s [%s]\n\n" "$tr_customscripts" "$script_name"
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
    
    elapsed_time() {
        local current=$(cut -d' ' -f1 /proc/uptime)
        awk "BEGIN {printf \"%.3f\", $current - $START_TIME}"
    }
    
    clear
    print_banner
    
    mkdir -p "$CONFIG_DIR"
    
    __download_file_core "${BOOTSTRAP_URL}/config.js" "$CONFIG_DIR/config.js" || {
        echo "Error: Failed to download config.js"
        printf "Press [Enter] to exit. "
        read -r _
        return 1
    }
    
    init
    
    detect_package_manager

    # 全てのダウンロードをバックグラウンドで開始
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
    
    (
        [ -n "$WHIPTAIL_UI_URL" ] && __download_file_core "$WHIPTAIL_UI_URL" "$CONFIG_DIR/aios2-whiptail.sh"
        [ -n "$SIMPLE_UI_URL" ] && __download_file_core "$SIMPLE_UI_URL" "$CONFIG_DIR/aios2-simple.sh"
    ) &
    UI_DL_PID=$!
    
    # API依存の処理をバックグラウンドで開始
    (
        wait $API_PID
        
        # デバイス情報取得して export_device_info でファイルに保存
        get_extended_device_info
        export_device_info "$CONFIG_DIR/device_vars.sh"
        
        # 母国語ファイルのダウンロード
        AUTO_LANGUAGE=$(grep "^AUTO_LANGUAGE=" "$CONFIG_DIR/device_vars.sh" | cut -d"'" -f2)
        if [ -n "$AUTO_LANGUAGE" ] && [ "$AUTO_LANGUAGE" != "en" ]; then
            download_language_json "${AUTO_LANGUAGE}"
        fi
    ) &
    API_DEPENDENT_PID=$!
    
    # UI表示前の時点で時間を記録
    TIME_BEFORE_UI=$(elapsed_time)
    echo "[TIME] Pre-UI processing: ${TIME_BEFORE_UI}s" >> "$CONFIG_DIR/debug.log"
    
    # UI選択を即座に表示
    UI_START=$(cut -d' ' -f1 /proc/uptime)
    select_ui_mode
    UI_END=$(cut -d' ' -f1 /proc/uptime)
    UI_DURATION=$(awk "BEGIN {printf \"%.3f\", $UI_END - $UI_START}")
    
    # 必須ファイルの完了を待機
    wait $SETUP_PID
    SETUP_STATUS=$?
    wait $POSTINST_PID
    POSTINST_STATUS=$?
    wait $UI_DL_PID
    
    if [ $SETUP_STATUS -ne 0 ]; then
        echo "Cannot continue without setup.json"
        printf "Press [Enter] to exit. "
        read -r _
        return 1
    fi
    
    if [ $POSTINST_STATUS -ne 0 ]; then
        echo "Cannot continue without postinst.json"
        printf "Press [Enter] to exit. "
        read -r _
        return 1
    fi
    
    # API依存処理の完了を待機して変数を読み込む
    wait $API_DEPENDENT_PID
    
    # ファイルから変数を読み込む
    if [ -f "$CONFIG_DIR/device_vars.sh" ]; then
        . "$CONFIG_DIR/device_vars.sh"
    fi
    
    wait $CUSTOMFEEDS_PID
    wait $CUSTOMSCRIPTS_PID
    wait $TEMPLATES_PID
    wait $LANG_EN_PID
    
    CURRENT_TIME=$(cut -d' ' -f1 /proc/uptime)
    TOTAL_AUTO_TIME=$(awk "BEGIN {printf \"%.3f\", $CURRENT_TIME - $START_TIME - $UI_DURATION}")
    
    echo "[TIME] Total: ${TOTAL_AUTO_TIME}s" >> "$CONFIG_DIR/debug.log"

    if [ "$UI_MODE" = "simple" ] && [ -f "$LANG_JSON" ]; then
        sed -i 's/"tr-tui-yes": "[^"]*"/"tr-tui-yes": "y"/' "$LANG_JSON"
        sed -i 's/"tr-tui-no": "[^"]*"/"tr-tui-no": "n"/' "$LANG_JSON"
    fi
    
    if [ -f "$CONFIG_DIR/aios2-${UI_MODE}.sh" ]; then
        . "$CONFIG_DIR/aios2-${UI_MODE}.sh"
        aios2_${UI_MODE}_main
    else
        echo "Error: UI module aios2-${UI_MODE}.sh not found."
        exit 1
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
