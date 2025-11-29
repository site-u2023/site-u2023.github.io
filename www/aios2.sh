#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC3043
# OpenWrt Device Setup Tool - CLI Version
# ASU (Attended SysUpgrade) Compatible
# Common Functions (UI-independent)

VERSION="R7.1129.1240"

SCRIPT_NAME=$(basename "$0")
BASE_TMP_DIR="/tmp"
CONFIG_DIR="$BASE_TMP_DIR/aios2"
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
TRANSLATION_CACHE_FILE="$CONFIG_DIR/translation_cache.txt"
MEM_FREE_MB=""
FLASH_FREE_MB=""
LAN_IF=""
LAN_ADDR=""
LAN_ADDR6=""

# URL and Path Configuration

PACKAGES_JSON="$CONFIG_DIR/postinst.json"
SETUP_JSON="$CONFIG_DIR/setup.json"
AUTO_CONFIG_JSON="$CONFIG_DIR/auto_config.json"
LANG_JSON="$CONFIG_DIR/lang.json"
LANG_JSON_EN="$CONFIG_DIR/lang_en.json"
SELECTED_PACKAGES="$CONFIG_DIR/selected_packages.txt"
SELECTED_CUSTOM_PACKAGES="$CONFIG_DIR/selected_custom_packages.txt"
SETUP_VARS="$CONFIG_DIR/setup_vars.sh"
TRANSLATION_CACHE="$CONFIG_DIR/translation_cache.txt"
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
    _set_path_url 'review_json_path'        'REVIEW_DB_PATH'          'REVIEW_JSON_URL'
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
        echo "[DEBUG] REVIEW_JSON_URL=$REVIEW_JSON_URL"
        echo "[DEBUG] WHIPTAIL_UI_URL=$WHIPTAIL_UI_URL"
        echo "[DEBUG] SIMPLE_UI_URL=$SIMPLE_UI_URL"
    } >> "$CONFIG_DIR/debug.log"
    
    return 0
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
    for pid in $(pidof "$script_name" 2>/dev/null); do
        [ "$pid" != "$$" ] && kill "$pid" 2>/dev/null
    done
    
    mkdir -p "$CONFIG_DIR"

    find "$CONFIG_DIR" -maxdepth 1 -type f ! -name "$SCRIPT_NAME" -exec rm -f {} \;
    
    load_config_from_js || {
        echo "Fatal: Cannot load configuration"
        return 1
    }
    
    : > "$SELECTED_PACKAGES"
    : > "$SELECTED_CUSTOM_PACKAGES"
    : > "$SETUP_VARS"
    : > "$TRANSLATION_CACHE_FILE"
    : > "$CONFIG_DIR/debug.log"
    
    echo "[DEBUG] $(date): Init complete, cache cleared" >> "$CONFIG_DIR/debug.log"
}

# Language and Translation

download_language_json() {
    local lang="${1:-en}"
    local lang_url en_url
    
    en_url="${BASE_URL}/$(echo "$LANGUAGE_PATH_TEMPLATE" | sed "s/{lang}/en/")"
    LANG_JSON_EN="$CONFIG_DIR/lang_en.json"
    
    if ! __download_file_core "$en_url" "$LANG_JSON_EN"; then
        echo "Warning: Failed to download English language file"
        return 1
    fi
    
    if [ "$lang" != "en" ]; then
        lang_url="${BASE_URL}/$(echo "$LANGUAGE_PATH_TEMPLATE" | sed "s/{lang}/${lang}/")"
        
        if ! __download_file_core "$lang_url" "$LANG_JSON"; then
            echo "Warning: Failed to download language file for ${lang}, using English only"
            cp "$LANG_JSON_EN" "$LANG_JSON"
        fi
    else
        cp "$LANG_JSON_EN" "$LANG_JSON"
    fi
    
    return 0
}

translate() {
    local key="$1"
    local cached translation

    if [ -f "$TRANSLATION_CACHE_FILE" ]; then
        cached=$(grep "^${key}=" "$TRANSLATION_CACHE_FILE" 2>/dev/null | cut -d= -f2-)
        if [ -n "$cached" ]; then
            echo "$cached"
            return 0
        fi
    fi
    
    if [ -f "$LANG_JSON" ]; then
        translation=$(jsonfilter -i "$LANG_JSON" -e "@['$key']" 2>/dev/null)
        if [ -n "$translation" ]; then
            echo "${key}=${translation}" >> "$TRANSLATION_CACHE_FILE"
            echo "$translation"
            return 0
        fi
    fi

    if [ -f "$LANG_JSON_EN" ] && [ "$LANG_JSON" != "$LANG_JSON_EN" ]; then
        translation=$(jsonfilter -i "$LANG_JSON_EN" -e "@['$key']" 2>/dev/null)
        if [ -n "$translation" ]; then
            echo "${key}=${translation}" >> "$TRANSLATION_CACHE_FILE"
            echo "$translation"
            return 0
        fi
    fi
    
    echo "$key"
    return 1
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
    
    name=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].name" 2>/dev/null | head -1)
    [ -z "$name" ] && name=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].name" 2>/dev/null | head -1)
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
    
    enable_var=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].enableVar" 2>/dev/null | head -1)
    [ -z "$enable_var" ] && enable_var=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].enableVar" 2>/dev/null | head -1)
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

download_review_json() {
    download_file_with_cache "$REVIEW_JSON_URL" "$REVIEW_JSON"
    return $?
}

get_review_items() {
    jsonfilter -i "$REVIEW_JSON" -e '@.items[*].id' 2>/dev/null
}

get_review_item_label() {
    local idx=$((${1}-1))
    local class
    class=$(jsonfilter -i "$REVIEW_JSON" -e "@.items[$idx].class" 2>/dev/null)
    translate "$class"
}

get_review_item_action() {
    local idx=$((${1}-1))
    jsonfilter -i "$REVIEW_JSON" -e "@.items[$idx].action" 2>/dev/null
}

get_review_item_file() {
    local idx=$((${1}-1))
    local file
    file=$(jsonfilter -i "$REVIEW_JSON" -e "@.items[$idx].file" 2>/dev/null)
    
    case "$file" in
        "SELECTED_PACKAGES") echo "$SELECTED_PACKAGES" ;;
        "SETUP_VARS") echo "$SETUP_VARS" ;;
        "postinst.sh") echo "$CONFIG_DIR/postinst.sh" ;;
        "setup.sh") echo "$CONFIG_DIR/setup.sh" ;;
        *) echo "$file" ;;
    esac
}

get_review_item_empty_class() {
    local item_id="$1"
    jsonfilter -i "$REVIEW_JSON" -e "@.items[@.id='$item_id'].empty_class" 2>/dev/null | head -1
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
    
    case "$script_id" in
        adguardhome)
            local installed="no"
            is_adguardhome_installed && installed="yes"
            
            while read -r option_id; do
                [ -z "$option_id" ] && continue
                if [ "$installed" = "yes" ]; then
                    [ "$option_id" = "remove" ] && filtered="${filtered}${option_id}
"
                else
                    [ "$option_id" != "remove" ] && filtered="${filtered}${option_id}
"
                fi
            done <<EOF
$options
EOF
            ;;
        *)
            filtered="$options"
            ;;
    esac
    
    echo "$filtered" | grep -v '^$'
}

collect_script_inputs() {
    local script_id="$1"
    local breadcrumb="$2"
    local inputs input_id input_label input_default input_envvar input_hidden value
    
    inputs=$(get_customscript_inputs "$script_id")
    
    for input_id in $inputs; do
        input_label=$(get_customscript_input_label "$script_id" "$input_id")
        input_default=$(get_customscript_input_default "$script_id" "$input_id")
        input_envvar=$(get_customscript_input_envvar "$script_id" "$input_id")
        input_hidden=$(get_customscript_input_hidden "$script_id" "$input_id")
        
        # LAN_ADDRの場合は自動取得値を初期値に
        if [ "$input_envvar" = "LAN_ADDR" ] && [ -n "$LAN_ADDR" ]; then
            input_default="$LAN_ADDR"
        fi
        
        # hidden=trueの場合はインプットボックスをスキップ
        if [ "$input_hidden" = "true" ]; then
            echo "${input_envvar}=\"${input_default}\"" >> "$CONFIG_DIR/script_vars_${script_id}.txt"
            continue
        fi
        
        value=$(show_inputbox "$breadcrumb" "$input_label" "$input_default")
        
        if ! [ $? -eq 0 ]; then
            rm -f "$CONFIG_DIR/script_vars_${script_id}.txt"
            return 1
        fi
        
        [ -z "$value" ] && value="$input_default"
        
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
        echo "sh \"\${CONFIG_DIR}/${script_file}\" ${option_args}"
    } > "$output_file"
    
    chmod +x "$output_file"
    
    echo "[DEBUG] Generated customscript: $output_file with args: ${option_args}" >> "$CONFIG_DIR/debug.log"
}

check_script_requirements() {
    local script_id="$1"
    local min_mem min_flash
    
    min_mem=$(get_customscript_requirement "$script_id" "minMemoryMB")
    min_flash=$(get_customscript_requirement "$script_id" "minFlashMB")
    
    [ -z "$min_mem" ] && min_mem=0
    [ -z "$min_flash" ] && min_flash=0
    
    if [ "$MEM_FREE_MB" -lt "$min_mem" ] || [ "$FLASH_FREE_MB" -lt "$min_flash" ]; then
        return 1
    fi
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
                echo "[DEBUG] Match found in array!" >> "$CONFIG_DIR/debug.log"
            elif [ "$expected" = "$current_val" ]; then
                should_add=1
                echo "[DEBUG] Match found as single value!" >> "$CONFIG_DIR/debug.log"
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
}

generate_files() {
    local pkgs selected_pkgs cat_id template_url api_url download_url temp_pkg_file pkg_id pattern
    local tpl_custom enable_var
    local script_id script_file template_path script_url
   
    # enableVar処理: 選択されたパッケージのenableVarをSETUP_VARSに追記
    if [ -s "$SELECTED_PACKAGES" ]; then
        while read -r pkg_id; do
            enable_var=$(get_package_enablevar "$pkg_id")
            if [ -n "$enable_var" ]; then
                if ! grep -q "^${enable_var}=" "$SETUP_VARS" 2>/dev/null; then
                    echo "${enable_var}='1'" >> "$SETUP_VARS"
                fi
            fi
        done < "$SELECTED_PACKAGES"
    fi
   
    fetch_cached_template "$POSTINST_TEMPLATE_URL" "$TPL_POSTINST"
   
    if [ -f "$TPL_POSTINST" ]; then
        {
            sed -n '1,/^# BEGIN_VARIABLE_DEFINITIONS/p' "$TPL_POSTINST"
           
            if [ -s "$SELECTED_PACKAGES" ]; then
                pkgs=$(cat "$SELECTED_PACKAGES" | tr '\n' ' ' | sed 's/ $//')
                echo "PACKAGES=\"${pkgs}\""
            else
                echo "PACKAGES=\"\""
            fi
           
            sed -n '/^# END_VARIABLE_DEFINITIONS/,$p' "$TPL_POSTINST"
        } > "$CONFIG_DIR/postinst.sh"
        chmod +x "$CONFIG_DIR/postinst.sh"
    fi
   
    fetch_cached_template "$SETUP_TEMPLATE_URL" "$TPL_SETUP"
   
    if [ -f "$TPL_SETUP" ]; then
        {
            sed -n '1,/^# BEGIN_VARS/p' "$TPL_SETUP"
           
            if [ -s "$SETUP_VARS" ]; then
                cat "$SETUP_VARS"
            fi
           
            sed -n '/^# END_VARS/,$p' "$TPL_SETUP"
        } > "$CONFIG_DIR/setup.sh"
        chmod +x "$CONFIG_DIR/setup.sh"
    fi
   
    if [ -f "$CUSTOMFEEDS_JSON" ]; then
        while read -r cat_id; do
            template_url=$(get_customfeed_template_url "$cat_id")
           
            [ -z "$template_url" ] && continue
           
            tpl_custom="$CONFIG_DIR/tpl_custom_${cat_id}.sh"
           
            fetch_cached_template "$template_url" "$tpl_custom"
           
            [ ! -f "$tpl_custom" ] && continue
            
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
                selected_pkgs=$(cat "$temp_pkg_file" | tr '\n' ' ' | sed 's/ $//')
            fi
           
            {
                sed -n '1,/^# BEGIN_VARIABLE_DEFINITIONS/p' "$tpl_custom"
               
                echo "PACKAGES=\"${selected_pkgs}\""
                echo "API_URL=\"${api_url}\""
                echo "DOWNLOAD_BASE_URL=\"${download_url}\""
                echo "RUN_OPKG_UPDATE=\"0\""
               
                sed -n '/^# END_VARIABLE_DEFINITIONS/,$p' "$tpl_custom"
            } > "$CONFIG_DIR/customfeeds-${cat_id}.sh"
           
            chmod +x "$CONFIG_DIR/customfeeds-${cat_id}.sh"
            rm -f "$temp_pkg_file"
        done <<EOF3
$(get_customfeed_categories)
EOF3
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
            
            fetch_cached_template "$script_url" "$template_path"
            
            if [ -f "$template_path" ]; then
                {
                    sed -n '1,/^# BEGIN_VARIABLE_DEFINITIONS/p' "$template_path"
                    
                    if [ -f "$CONFIG_DIR/script_vars_${script_id}.txt" ]; then
                        cat "$CONFIG_DIR/script_vars_${script_id}.txt"
                    fi
                    
                    sed -n '/^# END_VARIABLE_DEFINITIONS/,$p' "$template_path"
                    
                    echo "${script_id}_main"
                } > "$CONFIG_DIR/customscripts-${script_id}.sh"
                
                chmod +x "$CONFIG_DIR/customscripts-${script_id}.sh"
            fi
        done <<SCRIPTS
$(get_customscript_all_scripts)
SCRIPTS
    fi
}

generate_config_summary() {
    local summary_file="$CONFIG_DIR/config_summary.txt"
    local tr_packages tr_customfeeds tr_variables tr_customscripts
    
    tr_packages=$(translate "tr-tui-summary-packages")
    tr_customfeeds=$(translate "tr-tui-summary-customfeeds")
    tr_variables=$(translate "tr-tui-summary-variables")
    tr_customscripts=$(translate "tr-tui-summary-customscripts")
    
    : > "$summary_file"
    
    if [ -f "$SELECTED_PACKAGES" ] && [ -s "$SELECTED_PACKAGES" ]; then
        printf "● %s\n\n" "$tr_packages" >> "$summary_file"
        cat "$SELECTED_PACKAGES" >> "$summary_file"
        echo "" >> "$summary_file"
    fi
    
    if [ -f "$SELECTED_CUSTOM_PACKAGES" ] && [ -s "$SELECTED_CUSTOM_PACKAGES" ]; then
        printf "● %s\n\n" "$tr_customfeeds" >> "$summary_file"
        cat "$SELECTED_CUSTOM_PACKAGES" >> "$summary_file"
        echo "" >> "$summary_file"
    fi
    
    if [ -f "$SETUP_VARS" ] && [ -s "$SETUP_VARS" ]; then
        printf "● %s\n\n" "$tr_variables" >> "$summary_file"
        cat "$SETUP_VARS" >> "$summary_file"
        echo "" >> "$summary_file"
    fi
    
    for var_file in "$CONFIG_DIR"/script_vars_*.txt; do
        [ -f "$var_file" ] || continue
        local script_id script_name
        script_id=$(basename "$var_file" | sed 's/^script_vars_//;s/\.txt$//')
        script_name=$(get_customscript_name "$script_id")
        [ -z "$script_name" ] && script_name="$script_id"
        
        printf "● %s [%s]\n\n" "$tr_customscripts" "$script_name" >> "$summary_file"
        cat "$var_file" >> "$summary_file"
        echo "" >> "$summary_file"
    done
    
    if [ ! -s "$summary_file" ]; then
        echo "$(translate 'tr-tui-no-config')" >> "$summary_file"
    fi
    
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

# Main Entry Point

aios2_main() {
    clear
    print_banner
    
    init
    echo "Fetching config.js"
    
    detect_package_manager
    echo "Detecting package manager: $PKG_MGR"
    
    echo "Fetching auto-config"
    get_extended_device_info
    
    echo "Fetching essential files in parallel"
    
    TIME_START=$(cut -d' ' -f1 /proc/uptime)
    
    (
        if ! download_setup_json; then
            echo "Error: Failed to download setup.json" >&2
            exit 1
        fi
    ) &
    SETUP_PID=$!
    
    (
        if ! download_language_json "${AUTO_LANGUAGE:-en}"; then
            echo "Warning: Using English as fallback language" >&2
        fi
    ) &
    LANG_PID=$!
    
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
    
    wait $LANG_PID
    
    wait $POSTINST_PID
    POSTINST_STATUS=$?
    
    wait $REVIEW_PID
    wait $CUSTOMFEEDS_PID
    wait $CUSTOMSCRIPTS_PID
    wait $TEMPLATES_PID
    
    TIME_END=$(cut -d' ' -f1 /proc/uptime)
    echo "[DEBUG] TIME_START='$TIME_START' TIME_END='$TIME_END'" >> "$CONFIG_DIR/debug.log"
    
    ELAPSED_TIME=$(awk "BEGIN {printf \"%.2f\", $TIME_END - $TIME_START}")
    
    echo ""
    echo "Parallel download finished in ${ELAPSED_TIME} seconds."
    echo "Language detected: ${AUTO_LANGUAGE:-en}"
    echo ""
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

    # DEBUG用ログのみ
    if [ "$DETECTED_CONN_TYPE" = "mape" ]; then
        if [ -n "$MAPE_GUA_PREFIX" ]; then
            echo "[DEBUG] Detected mape_type=gua with prefix: $MAPE_GUA_PREFIX" >> "$CONFIG_DIR/debug.log"
        else
            echo "[DEBUG] Detected mape_type=pd no GUA detected" >> "$CONFIG_DIR/debug.log"
        fi
    fi

    echo "Fetching UI modules"
    echo ""
    
    select_ui_mode
    . "$CONFIG_DIR/aios2-${UI_MODE}.sh"
    aios2_${UI_MODE}_main
}

aios2_main
