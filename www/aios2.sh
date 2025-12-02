#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC2086,SC3043
# OpenWrt Device Setup Tool - CLI Version
# ASU (Attended SysUpgrade) Compatible
# Common Functions (UI-independent)

VERSION="R7.1130.1312"

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
    
    __download_file_core "${BOOTSTRAP_URL}/config.js" "$CONFIG_JS" || {
        echo "Error: Failed to download config.js"
        return 1
    }

    # config.jsから値を抽出
    _get_js_value() {
        grep "${1}:" "$CONFIG_JS" | sed 's/.*"\([^"]*\)".*/\1/'
    }

    # パス変数とURL変数を同時に設定
    _set_path_url() {
        local key="$1"
        local path_var="$2"
        local url_var="$3"
        local path
        path=$(_get_js_value "$key")
        eval "${path_var}='${path}'"
        [ -n "$url_var" ] && eval "${url_var}='${BASE_URL}/${path}'"
    }

    # BASE_URL（特殊処理）
    BASE_URL=$(grep -E '(base_url|base_path):' "$CONFIG_JS" | sed 's/.*"\([^"]*\)".*/\1/' | tr '\n' '/' | sed 's/\/$//')
    
    # 単純な値
    AUTO_CONFIG_API_URL=$(_get_js_value 'auto_config_api_url')
    
    # パス + URL のペア
    _set_path_url 'packages_db_path'        'PACKAGES_DB_PATH'        'PACKAGES_URL'
    _set_path_url 'postinst_template_path'  'POSTINST_TEMPLATE_PATH'  'POSTINST_TEMPLATE_URL'
    _set_path_url 'setup_db_path'           'SETUP_DB_PATH'           'SETUP_JSON_URL'
    _set_path_url 'setup_template_path'     'SETUP_TEMPLATE_PATH'     'SETUP_TEMPLATE_URL'
    _set_path_url 'customfeeds_db_path'     'CUSTOMFEEDS_DB_PATH'     'CUSTOMFEEDS_JSON_URL'
    _set_path_url 'customscripts_db_path'   'CUSTOMSCRIPTS_DB_PATH'   'CUSTOMSCRIPTS_JSON_URL'
    _set_path_url 'language_path_template'  'LANGUAGE_PATH_TEMPLATE'  ''
    _set_path_url 'whiptail_ui_path'        'WHIPTAIL_UI_PATH'        ''
    _set_path_url 'simple_ui_path'          'SIMPLE_UI_PATH'          ''
    _set_path_url 'whiptail_fallback_path'  'WHIPTAIL_FALLBACK_PATH'  'WHIPTAIL_FALLBACK_URL'
    
    # キャッシュバスター付きURL
    local CACHE_BUSTER="?t=$(date +%s)"
    WHIPTAIL_UI_URL="${BASE_URL}/${WHIPTAIL_UI_PATH}${CACHE_BUSTER}"
    SIMPLE_UI_URL="${BASE_URL}/${SIMPLE_UI_PATH}${CACHE_BUSTER}"

    {
        echo "[DEBUG] Config loaded: BASE_URL=$BASE_URL"
        echo "[DEBUG] PACKAGES_URL=$PACKAGES_URL"
        echo "[DEBUG] POSTINST_TEMPLATE_URL=$POSTINST_TEMPLATE_URL"
        echo "[DEBUG] SETUP_JSON_URL=$SETUP_JSON_URL"
        echo "[DEBUG] SETUP_TEMPLATE_URL=$SETUP_TEMPLATE_URL"
        echo "[DEBUG] AUTO_CONFIG_API_URL=$AUTO_CONFIG_API_URL"
        echo "[DEBUG] CUSTOMFEEDS_DB_PATH=$CUSTOMFEEDS_DB_PATH"
        echo "[DEBUG] CUSTOMFEEDS_JSON_URL=$CUSTOMFEEDS_JSON_URL"
        echo "[DEBUG] REVIEW_DB_PATH=$REVIEW_DB_PATH"
        echo "[DEBUG] WHIPTAIL_UI_URL=$WHIPTAIL_UI_URL"
        echo "[DEBUG] SIMPLE_UI_URL=$SIMPLE_UI_URL"
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

# UI Mode Selection

select_ui_mode() {
    local has_whiptail=0
    local has_simple=0
    local whiptail_pkg="whiptail"
    local choice
    
    if [ -n "$WHIPTAIL_UI_URL" ]; then
        if wget -q --spider "$WHIPTAIL_UI_URL" 2>/dev/null; then
            __download_file_core "$WHIPTAIL_UI_URL" "$CONFIG_DIR/aios2-whiptail.sh" && has_whiptail=1
        fi
    fi
    
    if [ -n "$SIMPLE_UI_URL" ]; then
        if wget -q --spider "$SIMPLE_UI_URL" 2>/dev/null; then
            __download_file_core "$SIMPLE_UI_URL" "$CONFIG_DIR/aios2-simple.sh" && has_simple=1
        fi
    fi
    
    if [ $has_whiptail -eq 0 ] && [ $has_simple -eq 0 ]; then
        echo "Error: No UI module found"
        exit 1
    fi
    
    if [ $has_whiptail -eq 1 ] && [ $has_simple -eq 0 ]; then
        UI_MODE="whiptail"
        return 0
    fi
    
    if [ $has_whiptail -eq 0 ] && [ $has_simple -eq 1 ]; then
        UI_MODE="simple"
        return 0
    fi
    
    echo "$(translate 'tr-tui-ui-mode-select')"
    echo "1) $(translate 'tr-tui-ui-whiptail')"
    echo "2) $(translate 'tr-tui-ui-simple')"
    
    printf "%s [1]: " "$(translate 'tr-tui-ui-choice')"
    read -r choice
    
    case "$choice" in
        2)
            UI_MODE="simple"
            ;;
        3)      
            # テストモード - fallback専用whiptailコマンドを先にダウンロード
            WHIPTAIL_FALLBACK_URL="${BASE_URL}/${WHIPTAIL_FALLBACK_PATH}"
            __download_file_core "$WHIPTAIL_FALLBACK_URL" "$CONFIG_DIR/whiptail" >/dev/null 2>&1
            chmod +x "$CONFIG_DIR/whiptail"
            export PATH="$CONFIG_DIR:$PATH"
            
            # fallback専用のUI実装をダウンロード
            WHIPTAIL_FALLBACK_UI_URL="${WHIPTAIL_UI_URL/aios2-whiptail/aios2-whiptail-fallback}"
            if ! __download_file_core "$WHIPTAIL_FALLBACK_UI_URL" "$CONFIG_DIR/aios2-whiptail_fallback.sh" >/dev/null 2>&1; then
                echo "Error: Failed to download fallback UI"
                exit 1
            fi
            UI_MODE="whiptail_fallback"
            ;;
        *)
            UI_MODE="whiptail"
            if ! command -v whiptail >/dev/null 2>&1; then
                echo "$(translate 'tr-tui-ui-installing')"
                if install_package $whiptail_pkg; then
                    echo "$(translate 'tr-tui-ui-install-success')"
                else
                    echo "$(translate 'tr-tui-ui-install-failed')"
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
    
    find "$CONFIG_DIR" -maxdepth 1 -type f ! -name "$SCRIPT_NAME" ! -name ".aios2.lock" -exec rm -f {} \;
    
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
    _PACKAGE_ENABLEVAR_LOADED=0
    _PACKAGE_NAME_LOADED=0
    
    echo "[DEBUG] $(date): Init complete, cache cleared" >> "$CONFIG_DIR/debug.log"
}

# Language and Translation

download_language_json() {
    local lang="${1:-en}"
    local lang_url en_url
    
    if [ "$lang" = "en" ]; then
        en_url="${BASE_URL}/$(echo "$LANGUAGE_PATH_TEMPLATE" | sed "s/{lang}/en/")"
        LANG_JSON_EN="$CONFIG_DIR/lang_en.json"
        
        if ! __download_file_core "$en_url" "$LANG_JSON_EN"; then
            echo "Warning: Failed to download English language file"
            return 1
        fi
        
        cp "$LANG_JSON_EN" "$LANG_JSON"
    else
        lang_url="${BASE_URL}/$(echo "$LANGUAGE_PATH_TEMPLATE" | sed "s/{lang}/${lang}/")"
        
        if ! __download_file_core "$lang_url" "$LANG_JSON"; then
            echo "Warning: Failed to download language file for ${lang}, using English"
            if [ -f "$LANG_JSON_EN" ]; then
                cp "$LANG_JSON_EN" "$LANG_JSON"
            fi
        fi
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

get_extended_device_info() {
    get_device_info
    
    OPENWRT_VERSION=$(grep 'DISTRIB_RELEASE' /etc/openwrt_release 2>/dev/null | cut -d"'" -f2)
    
    if ! __download_file_core "$AUTO_CONFIG_API_URL" "$AUTO_CONFIG_JSON"; then
        echo "Warning: Failed to fetch auto-config API"
        return 1
    fi
    
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
}

# Package Management

package_compatible() {
    local pkg_id="$1"
    local pkg_managers
    
    pkg_managers=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].packageManager[*]" 2>/dev/null)
    
    [ -z "$pkg_managers" ] && return 0
    
    echo "$pkg_managers" | grep -q "^${PKG_MGR}$" && return 0
    
    return 1
}

load_default_packages() {
    if [ ! -f "$PACKAGES_JSON" ]; then
        return 1
    fi
    
    local cat_id pkg_id checked
    get_categories | while read -r cat_id; do
        get_category_packages "$cat_id" | while read -r pkg_id; do
            checked=$(get_package_checked "$pkg_id")
            if [ "$checked" = "true" ]; then
                echo "$pkg_id" >> "$SELECTED_PACKAGES"
            fi
        done
    done
}

apply_api_defaults() {
    if [ -f "$AUTO_CONFIG_JSON" ]; then
        grep -q "^language=" "$SETUP_VARS" 2>/dev/null || \
            echo "language='${AUTO_LANGUAGE:-en}'" >> "$SETUP_VARS"
        
        grep -q "^timezone=" "$SETUP_VARS" 2>/dev/null || \
            echo "timezone='${AUTO_TIMEZONE}'" >> "$SETUP_VARS"
        
        grep -q "^zonename=" "$SETUP_VARS" 2>/dev/null || \
            echo "zonename='${AUTO_ZONENAME}'" >> "$SETUP_VARS"
        
        grep -q "^country=" "$SETUP_VARS" 2>/dev/null || \
            echo "country='${AUTO_COUNTRY}'" >> "$SETUP_VARS"
        
        local language
        language=$(grep "^language=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
        if [ -n "$language" ] && [ "$language" != "en" ] && [ -f "$SETUP_JSON" ]; then
            jsonfilter -i "$SETUP_JSON" \
                -e '@.constants.language_prefixes_release[*]' 2>/dev/null \
                | while IFS= read -r prefix; do
                    echo "${prefix}${language}" >> "$SELECTED_PACKAGES"
                done
        fi
        
        if grep -q "^connection_type='auto'" "$SETUP_VARS" 2>/dev/null; then
            if [ "$DETECTED_CONN_TYPE" = "mape" ] && [ -n "$MAPE_BR" ]; then
                sed -i "s/^connection_type='auto'/connection_type='mape'/" "$SETUP_VARS"
                
                [ -n "$MAPE_GUA_PREFIX" ] && ! grep -q "^mape_gua_prefix=" "$SETUP_VARS" 2>/dev/null && \
                    echo "mape_gua_prefix='$MAPE_GUA_PREFIX'" >> "$SETUP_VARS"
                
                grep -q "^mape_br=" "$SETUP_VARS" 2>/dev/null || \
                    echo "mape_br='$MAPE_BR'" >> "$SETUP_VARS"
                
                [ -n "$MAPE_IPV4_PREFIX" ] && ! grep -q "^mape_ipv4_prefix=" "$SETUP_VARS" 2>/dev/null && \
                    echo "mape_ipv4_prefix='$MAPE_IPV4_PREFIX'" >> "$SETUP_VARS"
                
                [ -n "$MAPE_IPV4_PREFIXLEN" ] && ! grep -q "^mape_ipv4_prefixlen=" "$SETUP_VARS" 2>/dev/null && \
                    echo "mape_ipv4_prefixlen='$MAPE_IPV4_PREFIXLEN'" >> "$SETUP_VARS"
                
                [ -n "$MAPE_IPV6_PREFIX" ] && ! grep -q "^mape_ipv6_prefix=" "$SETUP_VARS" 2>/dev/null && \
                    echo "mape_ipv6_prefix='$MAPE_IPV6_PREFIX'" >> "$SETUP_VARS"
                
                [ -n "$MAPE_IPV6_PREFIXLEN" ] && ! grep -q "^mape_ipv6_prefixlen=" "$SETUP_VARS" 2>/dev/null && \
                    echo "mape_ipv6_prefixlen='$MAPE_IPV6_PREFIXLEN'" >> "$SETUP_VARS"
                
                [ -n "$MAPE_EALEN" ] && ! grep -q "^mape_ealen=" "$SETUP_VARS" 2>/dev/null && \
                    echo "mape_ealen='$MAPE_EALEN'" >> "$SETUP_VARS"
                
                [ -n "$MAPE_PSIDLEN" ] && ! grep -q "^mape_psidlen=" "$SETUP_VARS" 2>/dev/null && \
                    echo "mape_psidlen='$MAPE_PSIDLEN'" >> "$SETUP_VARS"
                
                [ -n "$MAPE_PSID_OFFSET" ] && ! grep -q "^mape_psid_offset=" "$SETUP_VARS" 2>/dev/null && \
                    echo "mape_psid_offset='$MAPE_PSID_OFFSET'" >> "$SETUP_VARS"
                
            elif [ "$DETECTED_CONN_TYPE" = "dslite" ] && [ -n "$DSLITE_AFTR" ]; then
                grep -q "^dslite_aftr_address=" "$SETUP_VARS" 2>/dev/null || \
                    echo "dslite_aftr_address='$DSLITE_AFTR'" >> "$SETUP_VARS"
            fi
        fi
    fi
}

update_language_packages() {
    local new_lang
    new_lang=$(grep "^language=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
    
    local prefixes
    prefixes=$(jsonfilter -i "$SETUP_JSON" -e '@.constants.language_prefixes_release[*]' 2>/dev/null)
    
    for prefix in $prefixes; do
        sed -i "/^${prefix}/d" "$SELECTED_PACKAGES"
    done
    
    if [ -n "$new_lang" ] && [ "$new_lang" != "en" ]; then
        for prefix in $prefixes; do
            echo "${prefix}${new_lang}" >> "$SELECTED_PACKAGES"
        done
    fi
}

# Setup JSON Accessors

get_setup_categories() {
    jsonfilter -i "$SETUP_JSON" -e '@.categories[*].id' 2>/dev/null | grep -v '^$'
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
    local item_id="$1"
    local result
    
    result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].type" 2>/dev/null | head -1)
    
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].type" 2>/dev/null | head -1)
    fi
    
    echo "$result"
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
    local item_id="$1"
    local result
    
    result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].variable" 2>/dev/null | head -1)
    
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].variable" 2>/dev/null | head -1)
    fi
    
    echo "$result"
}

get_setup_item_default() {
    local item_id="$1"
    local result
    
    result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].default" 2>/dev/null | head -1)
    
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].default" 2>/dev/null | head -1)
    fi
    
    echo "$result"
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
    
    result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].options[*].value" 2>/dev/null | grep -v '^$')
    
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].options[*].value" 2>/dev/null | grep -v '^$')
    fi
    
    echo "$result"
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
    jsonfilter -i "$PACKAGES_JSON" -e '@.categories[*].id' 2>/dev/null | grep -v '^$'
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
        echo "$name"
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
    echo "$pkgs"
}

get_package_name() {
    local pkg_id="$1"
    local name
    
    if [ "$_PACKAGE_NAME_LOADED" -eq 0 ]; then
        _PACKAGE_NAME_CACHE=$(jsonfilter -i "$PACKAGES_JSON" -e '@.categories[*].packages[*]' 2>/dev/null | \
            awk -F'"' '/"id":/ {id=$4} /"name":/ {gsub(/\\n/, " ", $4); print id "=" $4}')
        
        if [ -f "$CUSTOMFEEDS_JSON" ]; then
            local custom_cache
            custom_cache=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e '@.categories[*].packages[*]' 2>/dev/null | \
                awk -F'"' '/"id":/ {id=$4} /"name":/ {gsub(/\\n/, " ", $4); print id "=" $4}')
            _PACKAGE_NAME_CACHE="${_PACKAGE_NAME_CACHE}
${custom_cache}"
        fi
        
        _PACKAGE_NAME_LOADED=1
    fi
    
    name=$(echo "$_PACKAGE_NAME_CACHE" | grep "^${pkg_id}=" | cut -d= -f2-)
    printf '%s\n' "$name"
}

get_package_checked() {
    local pkg_id="$1"
    local checked
    
    checked=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].checked" 2>/dev/null | head -1)
    [ -z "$checked" ] && checked=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].checked" 2>/dev/null | head -1)
    echo "$checked"
}

get_package_enablevar() {
    local pkg_id="$1"
    local enable_var
    
    if [ "$_PACKAGE_ENABLEVAR_LOADED" -eq 0 ]; then
        _PACKAGE_ENABLEVAR_CACHE=$(jsonfilter -i "$PACKAGES_JSON" -e '@.categories[*].packages[*]' 2>/dev/null | \
            awk -F'"' '/"id":/ {id=$4} /"enableVar":/ {print id "=" $4}')
        
        if [ -f "$CUSTOMFEEDS_JSON" ]; then
            local custom_cache
            custom_cache=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e '@.categories[*].packages[*]' 2>/dev/null | \
                awk -F'"' '/"id":/ {id=$4} /"enableVar":/ {print id "=" $4}')
            _PACKAGE_ENABLEVAR_CACHE="${_PACKAGE_ENABLEVAR_CACHE}
${custom_cache}"
        fi
        
        _PACKAGE_ENABLEVAR_LOADED=1
    fi
    
    enable_var=$(echo "$_PACKAGE_ENABLEVAR_CACHE" | grep "^${pkg_id}=" | cut -d= -f2)
    echo "$enable_var"
}

is_package_selected() {
    local pkg_id="$1"
    local caller="${2:-normal}"
    
    if [ "$caller" = "custom_feeds" ]; then
        grep -q "^${pkg_id}\$" "$SELECTED_CUSTOM_PACKAGES" 2>/dev/null
    else
        grep -q "^${pkg_id}\$" "$SELECTED_PACKAGES" 2>/dev/null
    fi
}

# Custom Feeds Management

download_customfeeds_json() {
    download_file_with_cache "$CUSTOMFEEDS_JSON_URL" "$CUSTOMFEEDS_JSON"
    return $?
}

get_customfeed_categories() {
    jsonfilter -i "$CUSTOMFEEDS_JSON" -e '@.categories[*].id' 2>/dev/null | grep -v '^$'
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

get_customscript_option_args() {
    local script_id="$1"
    local option_id="$2"
    local idx=0
    local opt_ids opt_id
    
    opt_ids=$(get_customscript_options "$script_id")
    for opt_id in $opt_ids; do
        if [ "$opt_id" = "$option_id" ]; then
            break
        fi
        idx=$((idx+1))
    done
    
    jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[$idx].args" 2>/dev/null | head -1
}

get_customscript_option_skip_inputs() {
    local script_id="$1"
    local option_id="$2"
    jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[@.id='$option_id'].skipInputs" 2>/dev/null | head -1
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

get_customscript_requirement() {
    local script_id="$1"
    local req_key="$2"
    jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].requirements.${req_key}" 2>/dev/null | head -1
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
    
    local use_credential_inputs
    use_credential_inputs=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[@.id='$selected_option'].useCredentialInputs" 2>/dev/null | head -1)
    
    if [ "$use_credential_inputs" = "true" ]; then
        inputs=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].credential_inputs[*].id" 2>/dev/null | grep -v '^$')
    else
        inputs=$(get_customscript_inputs "$script_id")
    fi
    
    for input_id in $inputs; do
        if [ "$use_credential_inputs" = "true" ]; then
            input_label=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].credential_inputs[@.id='$input_id'].label" 2>/dev/null | head -1)
            input_default=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].credential_inputs[@.id='$input_id'].default" 2>/dev/null | head -1)
            input_envvar=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].credential_inputs[@.id='$input_id'].envVar" 2>/dev/null | head -1)
            input_hidden=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].credential_inputs[@.id='$input_id'].hidden" 2>/dev/null | head -1)
            min_length=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].credential_inputs[@.id='$input_id'].minlength" 2>/dev/null | head -1)
        else
            input_label=$(get_customscript_input_label "$script_id" "$input_id")
            input_default=$(get_customscript_input_default "$script_id" "$input_id")
            input_envvar=$(get_customscript_input_envvar "$script_id" "$input_id")
            input_hidden=$(get_customscript_input_hidden "$script_id" "$input_id")
            min_length=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].inputs[@.id='$input_id'].minlength" 2>/dev/null | head -1)
        fi
        
        input_label=$(translate "$input_label")
        
        if [ "$script_id" = "adguardhome" ] && [ "$input_envvar" = "AGH_USER" ]; then
            local current_user
            current_user=$(get_adguardhome_current_user)
            [ -n "$current_user" ] && input_default="$current_user"
        fi
        
        if [ "$input_envvar" = "LAN_ADDR" ] && [ -n "$LAN_ADDR" ]; then
            input_default="$LAN_ADDR"
        fi
        
        if [ "$input_hidden" = "true" ]; then
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

generate_customscript_file() {
    local script_id="$1"
    local script_file="$2"
    local option_args="$3"
    local output_file="$CONFIG_DIR/customscripts-${script_id}.sh"
    local vars_file="$CONFIG_DIR/script_vars_${script_id}.txt"
    
    local script_args=""
    
    [ -n "$SKIP_RESOURCE_CHECK" ] && script_args="$script_args -c"

    if [ -n "$option_args" ]; then
        local first_arg install_mode
        first_arg=$(echo "$option_args" | awk '{print $1}')
        
        case "$first_arg" in
            openwrt|official)
                install_mode="$first_arg"
                script_args="$script_args -i $install_mode"
                ;;
            remove)
                script_args="$script_args -r auto"
                ;;
            change-credentials)
                script_args="$script_args -m"
                ;;
            *)
                script_args="$script_args $option_args"
                ;;
        esac
    fi
    
    {
        echo "#!/bin/sh"
        echo "# customscripts-${script_id}.sh (priority: 1024)"
        echo ""
        
        if [ -f "$vars_file" ]; then
            while IFS= read -r line; do
                echo "export $line"
            done < "$vars_file"
        fi
        
        echo ""
        echo "sh \"\${CONFIG_DIR}/${script_file}\"${script_args}"
    } > "$output_file"
    
    chmod +x "$output_file"
    
    echo "[DEBUG] Generated customscript: $output_file with args:${script_args}" >> "$CONFIG_DIR/debug.log"
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
    local effective_conn_type pkg_count idx pkg_id when_json when_var current_val expected should_add
    
    echo "[DEBUG] === auto_add_conditional_packages called ===" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG] cat_id=$cat_id" >> "$CONFIG_DIR/debug.log"
    
    effective_conn_type=$(get_effective_connection_type)
    echo "[DEBUG] Effective connection type: $effective_conn_type" >> "$CONFIG_DIR/debug.log"
    
    pkg_count=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].packages[*]" 2>/dev/null | wc -l)
    
    echo "[DEBUG] pkg_count=$pkg_count" >> "$CONFIG_DIR/debug.log"
    
    if [ "$pkg_count" -eq 0 ]; then
        echo "[DEBUG] No packages in category, returning" >> "$CONFIG_DIR/debug.log"
        return 0
    fi
    
    idx=0
    while [ "$idx" -lt "$pkg_count" ]; do
        echo "[DEBUG] Processing package index $idx" >> "$CONFIG_DIR/debug.log"
        
        pkg_id=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].packages[$idx].id" 2>/dev/null)
        echo "[DEBUG] pkg_id=$pkg_id" >> "$CONFIG_DIR/debug.log"
        
        when_json=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].packages[$idx].when" 2>/dev/null | head -1)
        echo "[DEBUG] when_json=$when_json" >> "$CONFIG_DIR/debug.log"
        
        if [ -n "$when_json" ]; then
            when_var=$(echo "$when_json" | sed 's/^{ *"\([^"]*\)".*/\1/')
            echo "[DEBUG] when_var=$when_var" >> "$CONFIG_DIR/debug.log"
            
            if [ "$when_var" = "connection_type" ]; then
                current_val="$effective_conn_type"
                echo "[DEBUG] Using effective connection type: $current_val" >> "$CONFIG_DIR/debug.log"
            else
                current_val=$(grep "^${when_var}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                echo "[DEBUG] current_val from SETUP_VARS: $current_val" >> "$CONFIG_DIR/debug.log"
            fi
            
            expected=$(jsonfilter -e "@.${when_var}[*]" 2>/dev/null <<EOF
$when_json
EOF
)

            if [ -z "$expected" ]; then
                expected=$(jsonfilter -e "@.${when_var}" 2>/dev/null <<EOF
$when_json
EOF
)
            fi
            
            echo "[DEBUG] expected=$expected" >> "$CONFIG_DIR/debug.log"
            
            should_add=0
            if echo "$expected" | grep -qx "$current_val"; then
                should_add=1
                echo "[DEBUG] Match found!" >> "$CONFIG_DIR/debug.log"
            fi
            
            if [ "$should_add" -eq 1 ]; then
                if ! is_package_selected "$pkg_id"; then
                    echo "$pkg_id" >> "$SELECTED_PACKAGES"
                    echo "[AUTO] Added package: $pkg_id (condition: ${when_var}=${current_val})" >> "$CONFIG_DIR/debug.log"
                fi
            else
                if is_package_selected "$pkg_id"; then
                    sed -i "/^${pkg_id}$/d" "$SELECTED_PACKAGES"
                    echo "[AUTO] Removed package: $pkg_id (condition not met: ${when_var}=${current_val})" >> "$CONFIG_DIR/debug.log"
                fi
            fi
        fi
        
        idx=$((idx+1))
    done
    
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
    
    if echo "$url" | grep -q '?'; then
        cache_buster="&_t=$(date +%s)"
    else
        cache_buster="?_t=$(date +%s)"
    fi
    
    full_url="${url}${cache_buster}"
    
    if ! wget -q -O "$output_path" "$full_url"; then
        echo "[ERROR] Failed to download: $url to $output_path" >> "$CONFIG_DIR/debug.log"
        return 1
    fi
    return 0
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
        while read -r pkg_id; do
            enable_var=$(get_package_enablevar "$pkg_id")
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
            pkgs=$(awk 'BEGIN{ORS=" "} {print} END{print ""}' "$SELECTED_PACKAGES" | sed 's/ $//')
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
                    echo "${script_id}_main"
                } > "$CONFIG_DIR/customscripts-${script_id}.sh"
                
                chmod +x "$CONFIG_DIR/customscripts-${script_id}.sh"
            fi
        done <<SCRIPTS
$(get_customscript_all_scripts)
SCRIPTS
        
        echo "[DEBUG] customscripts generation completed" >> "$CONFIG_DIR/debug.log"
    fi
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
            cat "$SELECTED_PACKAGES"
            echo ""
            has_content=1
        fi
        
        if [ -f "$SELECTED_CUSTOM_PACKAGES" ] && [ -s "$SELECTED_CUSTOM_PACKAGES" ]; then
            printf "🟢 %s\n\n" "$tr_customfeeds"
            cat "$SELECTED_CUSTOM_PACKAGES"
            echo ""
            has_content=1
        fi
        
        if [ -f "$SETUP_VARS" ] && [ -s "$SETUP_VARS" ]; then
            printf "🟡 %s\n\n" "$tr_variables"
            cat "$SETUP_VARS"
            echo ""
            has_content=1
        fi
        
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
        # ファイルレベルの reboot フラグ
        local file_reboot
        file_reboot=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.reboot" 2>/dev/null)
        if [ "$file_reboot" = "true" ]; then
            # script_vars_*.txt が1つでもあれば再起動必要
            for var_file in "$CONFIG_DIR"/script_vars_*.txt; do
                if [ -f "$var_file" ]; then
                    needs_reboot=1
                    break
                fi
            done
        fi
        
        # 項目レベルのチェック（ファイルレベルがfalseの場合）
        if [ "$needs_reboot" -eq 0 ]; then
            for var_file in "$CONFIG_DIR"/script_vars_*.txt; do
                [ -f "$var_file" ] || continue
                
                local script_id
                script_id=$(basename "$var_file" | sed 's/^script_vars_//;s/\.txt$//')
                
                local script_reboot
                script_reboot=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].reboot" 2>/dev/null | head -1)
                
                if [ "$script_reboot" = "true" ]; then
                    needs_reboot=1
                    break
                fi
            done
        fi
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

aios2_main() {
    TIME_START=$(cut -d' ' -f1 /proc/uptime)
    
    clear
    print_banner
    
    init
    echo "Fetching config.js"
    
    detect_package_manager
    echo "Detecting package manager: $PKG_MGR"
    
    echo "Fetching English language file"
    download_language_json "en"
    
    echo "Fetching auto-config"
    get_extended_device_info
    
    if [ "${AUTO_LANGUAGE:-en}" != "en" ]; then
        echo "Fetching language file: ${AUTO_LANGUAGE}"
        download_language_json "${AUTO_LANGUAGE}"
    fi
    
    echo "Fetching essential files in parallel"
    
    (
        if ! download_setup_json; then
            echo "Error: Failed to download setup.json" >&2
            exit 1
        fi
    ) &
    SETUP_PID=$!
    
    (
        if ! download_postinst_json; then
            echo "ERROR: Failed to download postinst.json." >&2
            exit 1
        fi
    ) &
    POSTINST_PID=$!
    
    (
        if ! download_customfeeds_json; then
            echo "Warning: Failed to download customfeeds.json" >&2
        fi
    ) &
    CUSTOMFEEDS_PID=$!
    
    (
        if ! download_customscripts_json; then
            echo "Warning: Failed to download customscripts.json" >&2
        fi
    ) &
    CUSTOMSCRIPTS_PID=$!
    
    prefetch_templates &
    TEMPLATES_PID=$!
    
    wait $SETUP_PID
    SETUP_STATUS=$?
    
    wait $POSTINST_PID
    POSTINST_STATUS=$?
    
    wait $REVIEW_PID
    wait $CUSTOMFEEDS_PID
    wait $CUSTOMSCRIPTS_PID
    wait $TEMPLATES_PID
    
    if [ ! -s "$AUTO_CONFIG_JSON" ] || ! grep -q '"language"' "$AUTO_CONFIG_JSON" 2>/dev/null; then
        echo "Warning: Failed to fetch auto-config API"
        echo "   https://www.cloudflarestatus.com/"
        echo ""
    fi
    
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

    if [ "$DETECTED_CONN_TYPE" = "mape" ]; then
        if [ -n "$MAPE_GUA_PREFIX" ]; then
            echo "[DEBUG] Detected mape_type=gua with prefix: $MAPE_GUA_PREFIX" >> "$CONFIG_DIR/debug.log"
        else
            echo "[DEBUG] Detected mape_type=pd no GUA detected" >> "$CONFIG_DIR/debug.log"
        fi
    fi

    echo "Fetching UI modules"
    
    TIME_END=$(cut -d' ' -f1 /proc/uptime)
    echo "[DEBUG] TIME_START='$TIME_START' TIME_END='$TIME_END'" >> "$CONFIG_DIR/debug.log"
    
    ELAPSED_TIME=$(awk "BEGIN {printf \"%.2f\", $TIME_END - $TIME_START}")
    
    printf "\033[32mLoaded in %ss\033[0m\n" "$ELAPSED_TIME"
    echo ""
    
    select_ui_mode

    if [ "$UI_MODE" = "simple" ] && [ -f "$LANG_JSON" ]; then
        sed -i 's/"tr-tui-yes": "[^"]*"/"tr-tui-yes": "y"/' "$LANG_JSON"
        sed -i 's/"tr-tui-no": "[^"]*"/"tr-tui-no": "n"/' "$LANG_JSON"
    fi

    . "$CONFIG_DIR/aios2-${UI_MODE}.sh"
    aios2_${UI_MODE}_main
}

aios2_main
