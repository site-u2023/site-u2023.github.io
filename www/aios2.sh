#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC3043
# OpenWrt Device Setup Tool - CLI Version
# ASU (Attended SysUpgrade) Compatible
# Common Functions (UI-independent)

VERSION="R7.1122.1016"
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

PACKAGES_DB_PATH=""
SETUP_DB_PATH=""
SETUP_TEMPLATE_PATH=""
LANGUAGE_PATH_TEMPLATE=""
CUSTOMFEEDS_DB_PATH=""
POSTINST_TEMPLATE_PATH=""
TRANSLATION_CACHE_DATA=""

print_banner_unicode() {
    printf "\n"
    printf "%s\n" "$(color magenta "               ██ █")"
    printf "%s\n" "$(color blue    "     ████      ███       ████      █████")"
    printf "%s\n" "$(color green   "        ██      ██      ██  ██    ██")"
    printf "%s\n" "$(color yellow  "     █████      ██      ██  ██     █████")"
    printf "%s\n" "$(color orange  "    ██  ██      ██      ██  ██         ██")"
    printf "%s\n" "$(color red     "     █████     ████      ████     ██████")"
    printf "\n"
}

load_config_from_js() {
    local CONFIG_JS="$CONFIG_DIR/config.js"
    
    __download_file_core "${BOOTSTRAP_URL}/config.js" "$CONFIG_JS" || {
        echo "Error: Failed to download config.js"
        return 1
    }

    BASE_URL=$(grep -E '(base_url|base_path):' "$CONFIG_JS" | sed 's/.*"\([^"]*\)".*/\1/' | tr '\n' '/' | sed 's/\/$//')
    AUTO_CONFIG_API_URL=$(grep 'auto_config_api_url:' "$CONFIG_JS" | sed 's/.*"\([^"]*\)".*/\1/')
    PACKAGES_DB_PATH=$(grep 'packages_db_path:' "$CONFIG_JS" | sed 's/.*"\([^"]*\)".*/\1/')
    POSTINST_TEMPLATE_PATH=$(grep 'postinst_template_path:' "$CONFIG_JS" | sed 's/.*"\([^"]*\)".*/\1/')
    SETUP_DB_PATH=$(grep 'setup_db_path:' "$CONFIG_JS" | sed 's/.*"\([^"]*\)".*/\1/')
    SETUP_TEMPLATE_PATH=$(grep 'setup_template_path:' "$CONFIG_JS" | sed 's/.*"\([^"]*\)".*/\1/')
    LANGUAGE_PATH_TEMPLATE=$(grep 'language_path_template:' "$CONFIG_JS" | sed 's/.*"\([^"]*\)".*/\1/')
    CUSTOMFEEDS_DB_PATH=$(grep 'customfeeds_db_path:' "$CONFIG_JS" | sed 's/.*"\([^"]*\)".*/\1/')
    REVIEW_DB_PATH=$(grep 'review_json_path:' "$CONFIG_JS" | sed 's/.*"\([^"]*\)".*/\1/')

    WHIPTAIL_UI_PATH=$(grep 'whiptail_ui_path:' "$CONFIG_JS" | sed 's/.*"\([^"]*\)".*/\1/')
    SIMPLE_UI_PATH=$(grep 'simple_ui_path:' "$CONFIG_JS" | sed 's/.*"\([^"]*\)".*/\1/')

    local CACHE_BUSTER
    CACHE_BUSTER="?t=$(date +%s)"
    
    PACKAGES_URL="${BASE_URL}/${PACKAGES_DB_PATH}"
    POSTINST_TEMPLATE_URL="${BASE_URL}/${POSTINST_TEMPLATE_PATH}"
    SETUP_JSON_URL="${BASE_URL}/${SETUP_DB_PATH}"
    SETUP_TEMPLATE_URL="${BASE_URL}/${SETUP_TEMPLATE_PATH}"
    CUSTOMFEEDS_JSON_URL="${BASE_URL}/${CUSTOMFEEDS_DB_PATH}"
    REVIEW_JSON_URL="${BASE_URL}/${REVIEW_DB_PATH}"

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

# URL and Path Configuration

PACKAGES_JSON="$CONFIG_DIR/postinst.json"
SETUP_JSON="$CONFIG_DIR/setup.json"
AUTO_CONFIG_JSON="$CONFIG_DIR/auto_config.json"
LANG_JSON="$CONFIG_DIR/lang.json"
SELECTED_PACKAGES="$CONFIG_DIR/selected_packages.txt"
SELECTED_CUSTOM_PACKAGES="$CONFIG_DIR/selected_custom_packages.txt"
SETUP_VARS="$CONFIG_DIR/setup_vars.sh"
TRANSLATION_CACHE="$CONFIG_DIR/translation_cache.txt"
CUSTOMFEEDS_JSON="$CONFIG_DIR/customfeeds.json"
REVIEW_JSON="$CONFIG_DIR/review.json"

TPL_POSTINST="$CONFIG_DIR/tpl_postinst.sh"
TPL_SETUP="$CONFIG_DIR/tpl_setup.sh"

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
    
    translate 'tr-tui-ui-mode-select'
    echo "1) $(translate 'tr-tui-ui-whiptail')"
    echo "2) $(translate 'tr-tui-ui-simple')"
    
    printf "%s" "$(translate 'tr-tui-ui-choice') [1]: "
    read -r choice
    
    if [ "$choice" = "2" ]; then
        UI_MODE="simple"
    else
        UI_MODE="whiptail"
        if ! check_packages_installed $whiptail_pkg; then
            translate 'tr-tui-ui-installing'
            if install_package $whiptail_pkg; then
                translate 'tr-tui-ui-install-success'
            else
                translate 'tr-tui-ui-install-failed'
                UI_MODE="simple"
            fi
        fi
    fi
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
    local script_name
    script_name=$(basename "$0")
    pkill -f "$script_name" 2>/dev/null
    
    mkdir -p "$CONFIG_DIR"

    rm -f "$CONFIG_DIR"/config.js
    rm -f "$CONFIG_DIR"/*.json
    rm -f "$CONFIG_DIR"/*.txt
    rm -f "$CONFIG_DIR"/*.log
    rm -f "$CONFIG_DIR"/customfeeds-*.sh
    rm -f "$CONFIG_DIR"/postinst.sh
    rm -f "$CONFIG_DIR"/setup.sh
    
    load_config_from_js || {
        echo "Fatal: Cannot load configuration"
        return 1
    }
    
    : > "$SELECTED_PACKAGES"
    : > "$SELECTED_CUSTOM_PACKAGES"
    : > "$SETUP_VARS"
    : > "$TRANSLATION_CACHE"
    : > "$CONFIG_DIR/debug.log"
    
    echo "[DEBUG] $(date): Init complete, cache cleared" >> "$CONFIG_DIR/debug.log"
}

# Language and Translation

download_language_json() {
    local lang="${1:-en}"
    local lang_url
    lang_url="${BASE_URL}/$(echo "$LANGUAGE_PATH_TEMPLATE" | sed "s/{lang}/${lang}/")"
    
    if ! __download_file_core "$lang_url" "$LANG_JSON"; then
        echo "Warning: Failed to download language file for ${lang}"
        if [ "$lang" != "en" ]; then
            echo "Attempting fallback to English..."
            lang_url="${BASE_URL}/www/langs/custom.en.json"
            if ! __download_file_core "$lang_url" "$LANG_JSON"; then
                echo "Warning: Failed to download English fallback"
                return 1
            fi
        else
            return 1
        fi
    fi
    return 0
}

translate() {
    local key="$1"
    
    local cached
    cached=$(echo "$TRANSLATION_CACHE_DATA" | grep "^${key}=" | cut -d= -f2-)
    if [ -n "$cached" ]; then
        echo "$cached"
        return 0
    fi
    
    if [ -f "$LANG_JSON" ]; then
        local translation
        translation=$(jsonfilter -i "$LANG_JSON" -e "@['$key']" 2>/dev/null)
        if [ -n "$translation" ]; then
            TRANSLATION_CACHE_DATA="${TRANSLATION_CACHE_DATA}
${key}=${translation}"
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
    
    AUTO_LANGUAGE=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.language' 2>/dev/null)
    AUTO_TIMEZONE=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.timezone' 2>/dev/null)
    AUTO_ZONENAME=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.zonename' 2>/dev/null)
    AUTO_COUNTRY=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.country' 2>/dev/null)
    ISP_NAME=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.isp' 2>/dev/null)
    ISP_AS=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.as' 2>/dev/null)
    
    MAPE_BR=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.brIpv6Address' 2>/dev/null)
    MAPE_EALEN=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.eaBitLength' 2>/dev/null)
    MAPE_IPV4_PREFIX=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.ipv4Prefix' 2>/dev/null)
    MAPE_IPV4_PREFIXLEN=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.ipv4PrefixLength' 2>/dev/null)
    MAPE_IPV6_PREFIX=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.ipv6Prefix' 2>/dev/null)
    MAPE_IPV6_PREFIXLEN=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.ipv6PrefixLength' 2>/dev/null)
    MAPE_PSIDLEN=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.psidlen' 2>/dev/null)
    MAPE_PSID_OFFSET=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.psIdOffset' 2>/dev/null)
    
    ISP_IPV6=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.ipv6' 2>/dev/null)
    MAPE_GUA_PREFIX=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.ipv6Prefix_gua' 2>/dev/null)
    
    DSLITE_AFTR=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.aftr.aftrIpv6Address' 2>/dev/null)
    
    reset_detected_conn_type
    
    DEVICE_MEM=$(awk '/MemTotal/{printf "%.0f MB", $2/1024}' /proc/meminfo 2>/dev/null)
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
    local title
    local class
    title=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$1'].title" 2>/dev/null)
    class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$1'].class" 2>/dev/null)
    
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
    
    local label
    local class
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
    
    echo "$result"
}

get_setup_item_option_label() {
    local item_id="$1"
    local value="$2"
    
    local label
    local class
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
    local name
    local class
    name=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id'].name" 2>/dev/null)
    class=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id'].class" 2>/dev/null)
    
    if [ -z "$name" ]; then
        name=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$cat_id'].name" 2>/dev/null)
        class=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$cat_id'].class" 2>/dev/null)
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
    desc=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id'].description" 2>/dev/null)
    [ -z "$desc" ] && desc=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$cat_id'].description" 2>/dev/null)
    echo "$desc"
}

get_category_hidden() {
    local cat_id="$1"
    jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id']" 2>/dev/null | grep -q . && echo "false" && return
    local hidden
    hidden=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$cat_id'].hidden" 2>/dev/null)
    echo "$hidden"
}

get_category_packages() {
    local cat_id="$1"
    local pkgs
    pkgs=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id'].packages[*].id" 2>/dev/null)
    [ -z "$pkgs" ] && pkgs=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$cat_id'].packages[*].id" 2>/dev/null)
    echo "$pkgs"
}

get_package_name() {
    local pkg_id="$1"
    local name
    name=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].name" 2>/dev/null | head -1)
    [ -z "$name" ] && name=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].name" 2>/dev/null | head -1)
    echo "$name"
}

get_package_checked() {
    local pkg_id="$1"
    local checked
    checked=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].checked" 2>/dev/null | head -1)
    [ -z "$checked" ] && checked=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].checked" 2>/dev/null | head -1)
    echo "$checked"
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
    jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$1'].api_base" 2>/dev/null
}

get_customfeed_download_base() {
    jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$1'].download_base" 2>/dev/null
}

get_customfeed_template_path() {
    local cat_id="$1"
    jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id'].template_path" 2>/dev/null
}

get_customfeed_template_url() {
    local cat_id="$1"
    # SC2155: Declare and assign separately
    local template_path
    template_path=$(get_customfeed_template_path "$cat_id")
    [ -n "$template_path" ] && echo "${BASE_URL}/${template_path}"
}

# Connection Type and Conditional Logic

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
    local show_when var_name expected current_val
    
    show_when=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].showWhen" 2>/dev/null | head -1)
    
    if [ -z "$show_when" ]; then
        show_when=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].showWhen" 2>/dev/null | head -1)
    fi
    
    [ -z "$show_when" ] && return 0
    
    echo "[DEBUG] showWhen for $item_id: $show_when" >> "$CONFIG_DIR/debug.log"
    
    var_name=$(echo "$show_when" | sed 's/^{ *"\([^"]*\)".*/\1/')
    expected=$(jsonfilter -e "@.${var_name}[*]" 2>/dev/null <<EOF
$show_when
EOF
)
    
    if [ -z "$expected" ]; then
        expected=$(jsonfilter -e "@.${var_name}" 2>/dev/null <<EOF
$show_when
EOF
)
    fi
    
    current_val=$(grep "^${var_name}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
    
    echo "[DEBUG] var_name=$var_name, current=$current_val, expected=$expected" >> "$CONFIG_DIR/debug.log"
    
    if [ -z "$(echo "$expected" | tr -d '\n')" ]; then
        echo "[DEBUG] No expected value, returning 0 (show)" >> "$CONFIG_DIR/debug.log"
        return 0
    fi
    
    if [ "$(echo "$expected" | wc -l)" -eq 1 ] && [ -n "$expected" ]; then
        echo "[DEBUG] expected (single): $expected" >> "$CONFIG_DIR/debug.log"
        if [ "$expected" = "$current_val" ]; then
            echo "[DEBUG] Match! returning 0 (show)" >> "$CONFIG_DIR/debug.log"
            return 0
        else
            echo "[DEBUG] No match, returning 1 (hide)" >> "$CONFIG_DIR/debug.log"
            return 1
        fi
    fi
    
    echo "[DEBUG] expected (array): $expected" >> "$CONFIG_DIR/debug.log"
    if echo "$expected" | grep -qx "$current_val"; then
        echo "[DEBUG] Match in array! returning 0 (show)" >> "$CONFIG_DIR/debug.log"
        return 0
    else
        echo "[DEBUG] No match in array, returning 1 (hide)" >> "$CONFIG_DIR/debug.log"
        return 1
    fi
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
    
    [ -z "$aftr_type" ] || [ -z "$area" ] && return 1
    
    computed=$(jsonfilter -i "$SETUP_JSON" -e "@.constants.aftr_map.${aftr_type}.${area}" 2>/dev/null)
    
    if [ -n "$computed" ]; then
        echo "$computed"
        return 0
    fi
    
    return 1
}

__download_file_core() {
    local url="$1"
    local output_path="$2"
    # SC2155: Declare and assign separately
    local cache_buster
    cache_buster="?t=$(date +%s)"
    
    if ! wget -q -O "$output_path" "${url}${cache_buster}"; then
        echo "[ERROR] Failed to download file: $url to $output_path" >> "$CONFIG_DIR/debug.log"
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
    local tpl_custom
    
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
                    echo "$pattern"
                fi
            done <<EOF2 > "$temp_pkg_file"
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
}

# Main Entry Point

aios2_main() {
    print_banner_unicode
    
    clear
    echo "==========================================="
    echo "  aios2 Vr.$VERSION"
    echo "==========================================="
    echo ""
    
    init
    echo "Fetching config.js"
    
    detect_package_manager
    echo "Detecting package manager: $PKG_MGR"
    
    echo "Fetching auto-config (for language detection)"
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
        if ! download_review_json; then
            echo "Warning: Failed to download review.json" >&2
        fi
    ) &
    REVIEW_PID=$!
    
    (
        if ! download_customfeeds_json; then
            echo "Warning: Failed to download customfeeds.json" >&2
        fi
    ) &
    CUSTOMFEEDS_PID=$!
    
    prefetch_templates &
    TEMPLATES_PID=$!
    
    wait $SETUP_PID
    SETUP_STATUS=$?
    
    wait $LANG_PID
    
    wait $POSTINST_PID
    POSTINST_STATUS=$?
    
    wait $REVIEW_PID
    wait $CUSTOMFEEDS_PID
    wait $TEMPLATES_PID
    
    TIME_END=$(cut -d' ' -f1 /proc/uptime)
    echo "[DEBUG] TIME_START='$TIME_START' TIME_END='$TIME_END'" >> "$CONFIG_DIR/debug.log"
    
    ELAPSED_TIME=$(awk "BEGIN {printf \"%.2f\", $TIME_END - $TIME_START}")
    
    echo ""
    echo "INFO: Parallel download finished in ${ELAPSED_TIME} seconds."
    echo "INFO: Language detected: ${AUTO_LANGUAGE:-en}"
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
    
    load_default_packages

    {
        echo "connection_type='auto'"
        echo "wifi_mode='standard'"
        echo "net_optimizer='auto'"
        echo "enable_dnsmasq='auto'"
    } >> "$SETUP_VARS"
    
    if [ "$DETECTED_CONN_TYPE" = "mape" ]; then
        if [ -n "$MAPE_GUA_PREFIX" ]; then
            echo "mape_type='gua'" >> "$SETUP_VARS"
            echo "[DEBUG] Set mape_type=gua with prefix: $MAPE_GUA_PREFIX" >> "$CONFIG_DIR/debug.log"
        else
            echo "mape_type='pd'" >> "$SETUP_VARS"
            echo "[DEBUG] Set mape_type=pd no GUA detected" >> "$CONFIG_DIR/debug.log"
        fi
    fi
    
    apply_api_defaults
    
    for cat_id in $(get_setup_categories); do
        auto_add_conditional_packages "$cat_id"
    done

    echo "Fetching UI modules"
    echo ""
    
    select_ui_mode

    . "$CONFIG_DIR/aios2-${UI_MODE}.sh"
    aios2_${UI_MODE}_main
}

aios2_main
