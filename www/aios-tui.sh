#!/bin/sh
# OpenWrt Device Setup Tool - CLI Version
# ASU (Attended SysUpgrade) Compatible
# Supports: whiptail (TUI) with fallback to simple menu

VERSION="R7.1111.2313"
BASE_URL="https://site-u.pages.dev"
PACKAGES_URL="$BASE_URL/www/packages/packages.json"
SETUP_JSON_URL="$BASE_URL/www/uci-defaults/setup.json"
SETUP_TEMPLATE_URL="$BASE_URL/www/uci-defaults/setup.sh"
AUTO_CONFIG_URL="https://auto-config.site-u.workers.dev/"

CONFIG_DIR="/tmp/device-setup"
PACKAGES_JSON="$CONFIG_DIR/packages.json"
SETUP_JSON="$CONFIG_DIR/setup.json"
AUTO_CONFIG_JSON="$CONFIG_DIR/auto_config.json"
LANG_JSON="$CONFIG_DIR/lang.json"
SELECTED_PACKAGES="$CONFIG_DIR/selected_packages.txt"
SETUP_VARS="$CONFIG_DIR/setup_vars.sh"
OUTPUT_DIR="/tmp"

TRANSLATION_CACHE="$CONFIG_DIR/translation_cache.txt"

WHIPTAIL_PACKAGES="whiptail libnewt"

PKG_MGR=""
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

install_package() {
    case "$PKG_MGR" in
        opkg)
            opkg update >/dev/null 2>&1
            opkg install "$@"
            ;;
        apk)
            apk update >/dev/null 2>&1
            apk add "$@"
            ;;
        *)
            echo "Cannot install packages: no package manager"
            return 1
            ;;
    esac
}

select_ui_mode() {
    echo "[DEBUG] $(date): select_ui_mode START" >> /tmp/debug.log
    
    if command -v whiptail >/dev/null 2>&1; then
        UI_MODE="whiptail"
        echo "whiptail detected, using dialog-based interface"
        echo "[DEBUG] whiptail already installed, UI_MODE=$UI_MODE" >> /tmp/debug.log
        return 0
    fi
    
    echo "[DEBUG] whiptail not found, asking user" >> /tmp/debug.log
    
    echo "$(translate 'tr-tui-ui-mode-select')"
    echo "1) $(translate 'tr-tui-ui-whiptail')"
    echo "2) $(translate 'tr-tui-ui-simple')"
    
    printf "$(translate 'tr-tui-ui-choice') [1]: "
    read choice
    
    echo "[DEBUG] User choice: $choice" >> /tmp/debug.log
    
    if [ "$choice" = "2" ]; then
        UI_MODE="simple"
        echo "[DEBUG] User selected simple mode, UI_MODE=$UI_MODE" >> /tmp/debug.log
    else
        echo "$(translate 'tr-tui-ui-installing')"
        echo "[DEBUG] Installing whiptail..." >> /tmp/debug.log
        install_package $WHIPTAIL_PACKAGES
        echo "[DEBUG] install_package exit code: $?" >> /tmp/debug.log
        hash -r
        echo "[DEBUG] hash -r executed" >> /tmp/debug.log
        if command -v whiptail >/dev/null 2>&1; then
            echo "$(translate 'tr-tui-ui-install-success')"
            UI_MODE="whiptail"
            echo "[DEBUG] whiptail install SUCCESS, UI_MODE=$UI_MODE" >> /tmp/debug.log
            sleep 1
        else
            echo "$(translate 'tr-tui-ui-install-failed')"
            UI_MODE="simple"
            echo "[DEBUG] whiptail command not found after install, UI_MODE=$UI_MODE" >> /tmp/debug.log
            sleep 2
        fi
    fi
    
    echo "[DEBUG] select_ui_mode END, final UI_MODE=$UI_MODE" >> /tmp/debug.log
}

init() {
    mkdir -p "$CONFIG_DIR"
    : > "$SELECTED_PACKAGES"
    : > "$SETUP_VARS"
    : > "$TRANSLATION_CACHE"
    : > /tmp/debug.log
    rm -f "$LANG_JSON"
    
    echo "[DEBUG] $(date): Init complete" >> /tmp/debug.log
}

download_language_json() {
    local lang="${1:-en}"
    local lang_url="$BASE_URL/www/langs/custom.${lang}.json"
    
    if ! wget -q -O "$LANG_JSON" "$lang_url"; then
        echo "Warning: Failed to download language file for '${lang}'"
        if [ "$lang" != "en" ]; then
            echo "Attempting fallback to English..."
            lang_url="$BASE_URL/www/langs/custom.en.json"
            if ! wget -q -O "$LANG_JSON" "$lang_url"; then
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
    
    local cached=$(grep "^${key}=" "$TRANSLATION_CACHE" 2>/dev/null | cut -d= -f2-)
    if [ -n "$cached" ]; then
        echo "$cached"
        return 0
    fi
    
    if [ -f "$LANG_JSON" ]; then
        local translation=$(jsonfilter -i "$LANG_JSON" -e "@['$key']" 2>/dev/null)
        if [ -n "$translation" ]; then
            echo "${key}=${translation}" >> "$TRANSLATION_CACHE"
            echo "$translation"
            return 0
        fi
    fi
    
    echo "$key"
    return 1
}

download_setup_json() {
    if [ ! -f "$SETUP_JSON" ]; then
        echo "Downloading setup.json..."
        if ! wget -q -O "$SETUP_JSON" "$SETUP_JSON_URL"; then
            echo "Failed to download setup.json"
            return 1
        fi
    fi
    return 0
}

download_packages() {
    if [ ! -f "$PACKAGES_JSON" ]; then
        echo "Downloading packages.json..."
        if ! wget -q -O "$PACKAGES_JSON" "$PACKAGES_URL"; then
            echo "Failed to download"
            return 1
        fi
    fi
    return 0
}

get_device_info() {
    if [ -f /etc/board.json ]; then
        DEVICE_MODEL=$(jsonfilter -i /etc/board.json -e '@.model.name' 2>/dev/null)
        DEVICE_TARGET=$(jsonfilter -i /etc/board.json -e '@.target' 2>/dev/null)
    fi
    
    [ -z "$DEVICE_MODEL" ] && DEVICE_MODEL="Unknown"
    [ -z "$DEVICE_TARGET" ] && DEVICE_TARGET="unknown/unknown"
}

get_extended_device_info() {
    get_device_info
    
    OPENWRT_VERSION=$(grep 'DISTRIB_RELEASE' /etc/openwrt_release 2>/dev/null | cut -d"'" -f2)
    
    if ! wget -q -O "$AUTO_CONFIG_JSON" "$AUTO_CONFIG_URL"; then
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
    
    if [ -n "$MAPE_BR" ] && [ -n "$MAPE_EALEN" ]; then
        DETECTED_CONN_TYPE="MAP-E"
    elif [ -n "$DSLITE_AFTR" ]; then
        DETECTED_CONN_TYPE="DS-Lite"
    else
        DETECTED_CONN_TYPE="Unknown"
    fi
    
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

load_default_packages() {
    if [ ! -f "$PACKAGES_JSON" ]; then
        return 1
    fi
    
    local cat_id pkg_id checked
    get_categories | while read cat_id; do
        get_category_packages "$cat_id" | while read pkg_id; do
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
        
        if grep -q "^connection_type='auto'" "$SETUP_VARS" 2>/dev/null; then
            if [ "$DETECTED_CONN_TYPE" = "MAP-E" ] && [ -n "$MAPE_BR" ]; then
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
                
            elif [ "$DETECTED_CONN_TYPE" = "DS-Lite" ] && [ -n "$DSLITE_AFTR" ]; then
                grep -q "^dslite_aftr_address=" "$SETUP_VARS" 2>/dev/null || \
                    echo "dslite_aftr_address='$DSLITE_AFTR'" >> "$SETUP_VARS"
            fi
        fi
    fi
}

get_setup_categories() {
    jsonfilter -i "$SETUP_JSON" -e '@.categories[*].id' 2>/dev/null | grep -v '^$'
}

get_setup_category_title() {
    local title=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$1'].title" 2>/dev/null)
    local class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$1'].class" 2>/dev/null)
    
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
    
    local result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].type" 2>/dev/null | head -1)
    
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].type" 2>/dev/null | head -1)
    fi
    
    echo "$result"
}

get_setup_item_label() {
    local item_id="$1"
    
    local label=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].label" 2>/dev/null | head -1)
    local class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].class" 2>/dev/null | head -1)
    
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
    local result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].variable" 2>/dev/null | head -1)
    
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].variable" 2>/dev/null | head -1)
    fi
    
    echo "$result"
}

get_setup_item_default() {
    local item_id="$1"
    local result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].default" 2>/dev/null | head -1)
    
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].default" 2>/dev/null | head -1)
    fi
    
    echo "$result"
}

get_setup_item_field_type() {
    local item_id="$1"
    local result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].fieldType" 2>/dev/null | head -1)
    
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].fieldType" 2>/dev/null | head -1)
    fi
    
    echo "$result"
}

get_setup_item_options() {
    local item_id="$1"
    
    local result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].options[*].value" 2>/dev/null)
    
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].options[*].value" 2>/dev/null)
    fi
    
    echo "$result"
}

get_setup_item_option_label() {
    local item_id="$1"
    local value="$2"
    
    local label=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].options[@.value='$value'].label" 2>/dev/null | head -1)
    local class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].options[@.value='$value'].class" 2>/dev/null | head -1)
    
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

get_categories() {
    jsonfilter -i "$PACKAGES_JSON" -e '@.categories[*].id' 2>/dev/null | grep -v '^$'
}

get_category_name() {
    local name=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$1'].name" 2>/dev/null)
    local class=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$1'].class" 2>/dev/null)
    
    if [ -n "$class" ] && [ "${class#tr-}" != "$class" ]; then
        translate "$class"
    else
        echo "$name"
    fi
}

get_category_desc() {
    local desc=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$1'].description" 2>/dev/null)
    echo "$desc"
}

get_category_hidden() {
    local hidden=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$1'].hidden" 2>/dev/null)
    echo "$hidden"
}

get_category_packages() {
    jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$1'].packages[*].id" 2>/dev/null
}

get_package_name() {
    local pkg_id="$1"
    local name=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].name" 2>/dev/null | head -1)
    echo "$name"
}

get_package_checked() {
    jsonfilter -i "$PACKAGES_JSON" -e "@.categories[*].packages[@.id='$1'].checked" 2>/dev/null | head -1
}

is_package_selected() {
    local pkg_id="$1"
    grep -q "^${pkg_id}$" "$SELECTED_PACKAGES" 2>/dev/null
}

get_effective_connection_type() {
    local conn_type=$(grep "^connection_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
    
    if [ "$conn_type" = "auto" ]; then
        if [ "$DETECTED_CONN_TYPE" = "MAP-E" ] && [ -n "$MAPE_BR" ]; then
            echo "mape"
            return 0
        elif [ "$DETECTED_CONN_TYPE" = "DS-Lite" ] && [ -n "$DSLITE_AFTR" ]; then
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
    
    echo "[DEBUG] showWhen for $item_id: $show_when" >> /tmp/debug.log
    
    local var_name=$(echo "$show_when" | sed 's/^{ *"\([^"]*\)".*/\1/')
    local expected=$(jsonfilter -e "@.${var_name}[*]" 2>/dev/null <<EOF
$show_when
EOF
)
    
    if [ -z "$expected" ]; then
        expected=$(jsonfilter -e "@.${var_name}" 2>/dev/null <<EOF
$show_when
EOF
)
    fi
    
    local current_val=$(grep "^${var_name}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
    
    echo "[DEBUG] var_name=$var_name, current=$current_val, expected=$expected" >> /tmp/debug.log
    
    if [ -z "$(echo "$expected" | tr -d '\n')" ]; then
        echo "[DEBUG] No expected value, returning 0 (show)" >> /tmp/debug.log
        return 0
    fi
    
    if [ "$(echo "$expected" | wc -l)" -eq 1 ] && [ -n "$expected" ]; then
        echo "[DEBUG] expected (single): $expected" >> /tmp/debug.log
        if [ "$expected" = "$current_val" ]; then
            echo "[DEBUG] Match! returning 0 (show)" >> /tmp/debug.log
            return 0
        else
            echo "[DEBUG] No match, returning 1 (hide)" >> /tmp/debug.log
            return 1
        fi
    fi
    
    echo "[DEBUG] expected (array): $expected" >> /tmp/debug.log
    if echo "$expected" | grep -qx "$current_val"; then
        echo "[DEBUG] Match in array! returning 0 (show)" >> /tmp/debug.log
        return 0
    else
        echo "[DEBUG] No match in array, returning 1 (hide)" >> /tmp/debug.log
        return 1
    fi
}

auto_add_conditional_packages() {
    local cat_id="$1"
    
    echo "[DEBUG] === auto_add_conditional_packages called ===" >> /tmp/debug.log
    echo "[DEBUG] cat_id=$cat_id" >> /tmp/debug.log
    
    local effective_conn_type=$(get_effective_connection_type)
    echo "[DEBUG] Effective connection type: $effective_conn_type" >> /tmp/debug.log
    
    local pkg_count=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].packages[*]" 2>/dev/null | wc -l)
    
    echo "[DEBUG] pkg_count=$pkg_count" >> /tmp/debug.log
    
    [ "$pkg_count" -eq 0 ] && {
        echo "[DEBUG] No packages in category, returning" >> /tmp/debug.log
        return 0
    }
    
    local idx=0
    while [ $idx -lt $pkg_count ]; do
        echo "[DEBUG] Processing package index $idx" >> /tmp/debug.log
        
        local pkg_id=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].packages[$idx].id" 2>/dev/null)
        echo "[DEBUG] pkg_id=$pkg_id" >> /tmp/debug.log
        
        local when_json=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].packages[$idx].when" 2>/dev/null | head -1)
        echo "[DEBUG] when_json=$when_json" >> /tmp/debug.log
        
        if [ -n "$when_json" ]; then
            local when_var=$(echo "$when_json" | sed 's/^{ *"\([^"]*\)".*/\1/')
            echo "[DEBUG] when_var=$when_var" >> /tmp/debug.log
            
            local current_val
            if [ "$when_var" = "connection_type" ]; then
                current_val="$effective_conn_type"
                echo "[DEBUG] Using effective connection type: $current_val" >> /tmp/debug.log
            else
                current_val=$(grep "^${when_var}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                echo "[DEBUG] current_val from SETUP_VARS: $current_val" >> /tmp/debug.log
            fi
            
            local expected=$(jsonfilter -e "@.${when_var}[*]" 2>/dev/null <<EOF
$when_json
EOF
)

            if [ -z "$expected" ]; then
                expected=$(jsonfilter -e "@.${when_var}" 2>/dev/null <<EOF
$when_json
EOF
)
            fi
            
            echo "[DEBUG] expected=$expected" >> /tmp/debug.log
            
            local should_add=0
            if echo "$expected" | grep -qx "$current_val"; then
                should_add=1
                echo "[DEBUG] Match found in array!" >> /tmp/debug.log
            elif [ "$expected" = "$current_val" ]; then
                should_add=1
                echo "[DEBUG] Match found as single value!" >> /tmp/debug.log
            fi
            
            if [ $should_add -eq 1 ]; then
                if ! is_package_selected "$pkg_id"; then
                    echo "$pkg_id" >> "$SELECTED_PACKAGES"
                    echo "[AUTO] Added package: $pkg_id (condition: ${when_var}=${current_val})" >> /tmp/debug.log
                fi
            else
                if is_package_selected "$pkg_id"; then
                    sed -i "/^${pkg_id}$/d" "$SELECTED_PACKAGES"
                    echo "[AUTO] Removed package: $pkg_id (condition not met: ${when_var}=${current_val})" >> /tmp/debug.log
                fi
            fi
        fi
        
        idx=$((idx+1))
    done
    
    echo "[DEBUG] === auto_add_conditional_packages finished ===" >> /tmp/debug.log
}

get_section_nested_items() {
    local item_id="$1"
    local cat_idx=0
    local item_idx=0
    
    for cat_id in $(get_setup_categories); do
        local items=$(get_setup_category_items "$cat_id")
        local idx=0
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
    
    [ -z "$aftr_type" ] || [ -z "$area" ] && return 1
    
    local computed=$(jsonfilter -i "$SETUP_JSON" -e "@.constants.aftr_map.${aftr_type}.${area}" 2>/dev/null)
    
    if [ -n "$computed" ]; then
        echo "$computed"
        return 0
    fi
    
    return 1
}

generate_files() {
    apply_api_defaults
    
    language=$(grep "^language=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
    
    {
        echo "#!/bin/sh"
        echo "# Generated by device-setup.sh v$VERSION"
        echo "# Device: $DEVICE_MODEL ($DEVICE_TARGET)"
        echo ""
        echo "# Detect package manager"
        echo "if command -v opkg >/dev/null 2>&1; then"
        echo "    PKG_MGR=opkg"
        echo "    opkg update"
        echo "elif command -v apk >/dev/null 2>&1; then"
        echo "    PKG_MGR=apk"
        echo "    apk update"
        echo "else"
        echo "    echo 'Error: No supported package manager found'"
        echo "    exit 1"
        echo "fi"
        echo ""
        
        if [ -n "$language" ]; then
            echo "# Language packages"
            echo "LANG_PKGS=\"luci-i18n-base-${language} luci-i18n-firewall-${language}\""
            echo "[ \"\$PKG_MGR\" = \"opkg\" ] && opkg install \$LANG_PKGS"
            echo "[ \"\$PKG_MGR\" = \"apk\" ] && apk add \$LANG_PKGS"
            echo ""
        fi

        if [ -s "$SELECTED_PACKAGES" ]; then
            echo "# Selected packages"
            echo "PKGS=\"\\"
            cat "$SELECTED_PACKAGES" | while read pkg; do
                echo "    $pkg \\"
            done | sed '$ s/ \\$/\"/'
            echo ""
            echo "[ \"\$PKG_MGR\" = \"opkg\" ] && opkg install \$PKGS"
            echo "[ \"\$PKG_MGR\" = \"apk\" ] && apk add \$PKGS"
        fi
        
        echo ""
        echo "exit 0"
    } > "$OUTPUT_DIR/postinst.sh"
    chmod +x "$OUTPUT_DIR/postinst.sh"
    
    {
        echo "#!/bin/sh"
        echo "# Generated by device-setup.sh v$VERSION"
        echo "# Device: $DEVICE_MODEL ($DEVICE_TARGET)"
        echo ""
        echo "# BEGIN_VARS"
        if [ -s "$SETUP_VARS" ]; then
            cat "$SETUP_VARS"
        fi
        echo "# END_VARS"
        echo ""
        
        if wget -q -O - "$SETUP_TEMPLATE_URL" | sed '1,/^# END_VARS/d' >> "$OUTPUT_DIR/setup.sh.tmp"; then
            cat "$OUTPUT_DIR/setup.sh.tmp" >> "$OUTPUT_DIR/setup.sh"
            rm -f "$OUTPUT_DIR/setup.sh.tmp"
        else
            echo "# Failed to download setup template"
            echo "# Please manually add setup.sh template from:"
            echo "# $SETUP_TEMPLATE_URL"
        fi
    } > "$OUTPUT_DIR/setup.sh"
    chmod +x "$OUTPUT_DIR/setup.sh"
}

whiptail_device_info() {
    local tr_device_info=$(translate "tr-tui-view-device-info")
    
    local info="Model: $DEVICE_MODEL\n"
    info="${info}Target: $DEVICE_TARGET\n"
    info="${info}Version: $OPENWRT_VERSION\n"
    [ -n "$DEVICE_MEM" ] && info="${info}Memory: $DEVICE_MEM\n"
    [ -n "$DEVICE_CPU" ] && info="${info}CPU: $DEVICE_CPU\n"
    [ -n "$DEVICE_STORAGE" ] && info="${info}Storage: $DEVICE_STORAGE_USED/$DEVICE_STORAGE (${DEVICE_STORAGE_AVAIL} free)\n"
    [ -n "$DEVICE_USB" ] && info="${info}USB: $DEVICE_USB\n"
    whiptail --title "$tr_device_info" --msgbox "$info" 15 70
}

whiptail_device_info_titled() {
    local title="$1"
    local tr_ok=$(translate "tr-tui-ok")
    local info="Model: $DEVICE_MODEL\n"
    info="${info}Target: $DEVICE_TARGET\n"
    info="${info}Version: $OPENWRT_VERSION\n"
    [ -n "$DEVICE_MEM" ] && info="${info}Memory: $DEVICE_MEM\n"
    [ -n "$DEVICE_CPU" ] && info="${info}CPU: $DEVICE_CPU\n"
    [ -n "$DEVICE_STORAGE" ] && info="${info}Storage: $DEVICE_STORAGE_USED/$DEVICE_STORAGE (${DEVICE_STORAGE_AVAIL} free)\n"
    [ -n "$DEVICE_USB" ] && info="${info}USB: $DEVICE_USB\n"
    whiptail --title "$title" --ok-button "$tr_ok" --msgbox "$info" 15 70
}

whiptail_show_network_info() {
    local tr_main_menu=$(translate "tr-tui-main-menu")
    local tr_internet_connection=$(translate "tr-internet-connection")
    local breadcrumb="${tr_main_menu} > ${tr_internet_connection}"
    
    local tr_isp=$(translate "tr-isp")
    local tr_as=$(translate "tr-as")
    local tr_mape_notice=$(translate "tr-mape-notice1")
    local tr_dslite_notice=$(translate "tr-dslite-notice1")
    local tr_aftr=$(translate "tr-dslite-aftr-ipv6-address")
    
    if [ -z "$DETECTED_CONN_TYPE" ] || [ "$DETECTED_CONN_TYPE" = "Unknown" ]; then
        return 1
    fi
    
    local tr_auto_detection=$(translate "tr-auto-detection")
    local info="${tr_auto_detection}: ${DETECTED_CONN_TYPE}\n\n"
    [ -n "$ISP_NAME" ] && info="${info}${tr_isp}: $ISP_NAME\n"
    [ -n "$ISP_AS" ] && info="${info}${tr_as}: $ISP_AS\n"
    
    info="${info}\n${tr_mape_notice}\n\n"
    
    if [ "$DETECTED_CONN_TYPE" = "MAP-E" ] && [ -n "$MAPE_BR" ]; then
        [ -n "$MAPE_GUA_PREFIX" ] && info="${info}option ip6prefix_gua $MAPE_GUA_PREFIX\n"
        info="${info}option peeraddr $MAPE_BR\n"
        [ -n "$MAPE_IPV4_PREFIX" ] && info="${info}option ipaddr $MAPE_IPV4_PREFIX\n"
        [ -n "$MAPE_IPV4_PREFIXLEN" ] && info="${info}option ip4prefixlen $MAPE_IPV4_PREFIXLEN\n"
        [ -n "$MAPE_IPV6_PREFIX" ] && info="${info}option ip6prefix $MAPE_IPV6_PREFIX\n"
        [ -n "$MAPE_IPV6_PREFIXLEN" ] && info="${info}option ip6prefixlen $MAPE_IPV6_PREFIXLEN\n"
        [ -n "$MAPE_EALEN" ] && info="${info}option ealen $MAPE_EALEN\n"
        [ -n "$MAPE_PSIDLEN" ] && info="${info}option psidlen $MAPE_PSIDLEN\n"
        [ -n "$MAPE_PSID_OFFSET" ] && info="${info}option offset $MAPE_PSID_OFFSET\n"
    elif [ "$DETECTED_CONN_TYPE" = "DS-Lite" ] && [ -n "$DSLITE_AFTR" ]; then
        info="${info}option peeraddr $DSLITE_AFTR\n"
        info="${info}\n${tr_dslite_notice}"
    fi
    
    info="${info}\n\nUse this auto-detected configuration?"
    
    if whiptail --title "$breadcrumb" --yesno "$info" 22 70; then
        sed -i "/^connection_type=/d" "$SETUP_VARS"
        echo "connection_type='auto'" >> "$SETUP_VARS"
        return 0
    else
        return 1
    fi
}

whiptail_process_items() {
    local cat_id="$1"
    local parent_items="$2"
    
    echo "[DEBUG] whiptail_process_items: cat_id=$cat_id" >> /tmp/debug.log
    
    local tr_main_menu=$(translate "tr-tui-main-menu")
    local cat_title=$(get_setup_category_title "$cat_id")
    local breadcrumb="${tr_main_menu} > ${cat_title}"
    
    local items
    if [ -z "$parent_items" ]; then
        items=$(get_setup_category_items "$cat_id")
    else
        items="$parent_items"
    fi
    
    echo "[DEBUG] Items to process: $items" >> /tmp/debug.log
    local items_processed=0
    
    for item_id in $items; do
        echo "[DEBUG] Processing item: $item_id" >> /tmp/debug.log
        local item_type=$(get_setup_item_type "$item_id")
        echo "[DEBUG] Item type: $item_type" >> /tmp/debug.log
        
        if ! should_show_item "$item_id"; then
            echo "[DEBUG] Item $item_id hidden by showWhen" >> /tmp/debug.log
            continue
        fi
        
        case "$item_type" in
            radio-group)
                items_processed=$((items_processed + 1))
                local label=$(get_setup_item_label "$item_id")
                local variable=$(get_setup_item_variable "$item_id")
                local default=$(get_setup_item_default "$item_id")
                
                echo "[DEBUG] radio-group: var=$variable, default=$default" >> /tmp/debug.log
                
                if [ "$item_id" = "mape-type" ]; then
                    if [ -n "$MAPE_GUA_PREFIX" ]; then
                        default="gua"
                    else
                        default="pd"
                    fi
                fi
                
                local current=$(grep "^${variable}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                [ -z "$current" ] && current="$default"
                
                echo "[DEBUG] Current value: $current" >> /tmp/debug.log
                
                local options=$(get_setup_item_options "$item_id")
                echo "[DEBUG] Options: $options" >> /tmp/debug.log
                
                local menu_opts=""
                local i=1
                for opt in $options; do
                    local opt_label=$(get_setup_item_option_label "$item_id" "$opt")
                    menu_opts="$menu_opts $i \"$opt_label\""
                    i=$((i+1))
                done
                
                value=$(eval "whiptail --title '$breadcrumb' --ok-button 'Select' --cancel-button 'Back' --menu '${label}:' 18 60 10 $menu_opts 3>&1 1>&2 2>&3")
                exit_code=$?
                
                if [ $exit_code -ne 0 ]; then
                    return 1
                fi
                
                if [ -n "$value" ]; then
                    selected_opt=$(echo "$options" | sed -n "${value}p")
                    echo "[DEBUG] Selected: $selected_opt" >> /tmp/debug.log
                    sed -i "/^${variable}=/d" "$SETUP_VARS"
                    echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                    echo "[DEBUG] Saved to SETUP_VARS" >> /tmp/debug.log
                    
                    auto_add_conditional_packages "$cat_id"
                fi
                ;;
            
            section)
                echo "[DEBUG] Processing section: $item_id" >> /tmp/debug.log
                local nested=$(get_section_nested_items "$item_id")
                if [ -n "$nested" ]; then
                    echo "[DEBUG] Nested items: $nested" >> /tmp/debug.log
                    whiptail_process_items "$cat_id" "$nested"
                    items_processed=$((items_processed + $?))
                fi
                ;;
                
            field)
                items_processed=$((items_processed + 1))
                local label=$(get_setup_item_label "$item_id")
                local variable=$(get_setup_item_variable "$item_id")
                local default=$(get_setup_item_default "$item_id")
                local field_type=$(get_setup_item_field_type "$item_id")
                
                echo "[DEBUG] field processing: item_id=$item_id" >> /tmp/debug.log
                echo "[DEBUG] label='$label'" >> /tmp/debug.log
                echo "[DEBUG] variable='$variable'" >> /tmp/debug.log
                echo "[DEBUG] default='$default'" >> /tmp/debug.log
                echo "[DEBUG] field_type='$field_type'" >> /tmp/debug.log
                
                local current=$(grep "^${variable}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                
                if [ -z "$current" ]; then
                    case "$variable" in
                        mape_gua_prefix)
                            current="${MAPE_GUA_PREFIX:-$default}"
                            ;;
                        mape_br)
                            current="${MAPE_BR:-$default}"
                            ;;
                        mape_ipv4_prefix)
                            current="${MAPE_IPV4_PREFIX:-$default}"
                            ;;
                        mape_ipv4_prefixlen)
                            current="${MAPE_IPV4_PREFIXLEN:-$default}"
                            ;;
                        mape_ipv6_prefix)
                            current="${MAPE_IPV6_PREFIX:-$default}"
                            ;;
                        mape_ipv6_prefixlen)
                            current="${MAPE_IPV6_PREFIXLEN:-$default}"
                            ;;
                        mape_ealen)
                            current="${MAPE_EALEN:-$default}"
                            ;;
                        mape_psidlen)
                            current="${MAPE_PSIDLEN:-$default}"
                            ;;
                        mape_psid_offset)
                            current="${MAPE_PSID_OFFSET:-$default}"
                            ;;
                        dslite_aftr_address)
                            current="${DSLITE_AFTR:-$default}"
                            ;;
                        *)
                            current="$default"
                            ;;
                    esac
                fi
                
                echo "[DEBUG] current='$current'" >> /tmp/debug.log
                
                if [ "$field_type" = "computed" ]; then
                    if [ "$item_id" = "dslite-aftr-address-computed" ]; then
                        local aftr_type=$(grep "^dslite_aftr_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                        local area=$(grep "^dslite_area=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                        
                        if [ -n "$aftr_type" ] && [ -n "$area" ]; then
                            local computed=$(compute_dslite_aftr "$aftr_type" "$area")
                            if [ -n "$computed" ]; then
                                current="$computed"
                                sed -i "/^${variable}=/d" "$SETUP_VARS"
                                echo "${variable}='${computed}'" >> "$SETUP_VARS"
                            fi
                        fi
                    fi
                fi
                
                if [ "$field_type" = "select" ]; then
                    local source=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].source" 2>/dev/null | head -1)
                    
                    if [ -n "$source" ]; then
                        echo "[DEBUG] Field uses dynamic source: $source" >> /tmp/debug.log
                        
                        case "$source" in
                            "browser-languages")
                                echo "[DEBUG] Skipping browser-languages field (already set: $current)" >> /tmp/debug.log
                                ;;
                            *)
                                echo "[DEBUG] Unknown source type: $source, showing as inputbox" >> /tmp/debug.log
                                value=$(whiptail --title "$breadcrumb" --ok-button "Select" --cancel-button "Back" --inputbox "${label}:" 10 60 "$current" 3>&1 1>&2 2>&3)
                                exit_code=$?
                                
                                if [ $exit_code -ne 0 ]; then
                                    return 1
                                fi
                                
                                if [ -n "$value" ]; then
                                    sed -i "/^${variable}=/d" "$SETUP_VARS"
                                    echo "${variable}='${value}'" >> "$SETUP_VARS"
                                fi
                                ;;
                        esac
                        continue
                    fi
                    
                    local options=$(get_setup_item_options "$item_id")
                    
                    echo "[DEBUG] Raw options output: '$options'" >> /tmp/debug.log
                    
                    if [ -z "$options" ]; then
                        echo "[DEBUG] ERROR: No options found for $item_id, skipping" >> /tmp/debug.log
                        whiptail --msgbox "Error: No options available for $label" 8 60
                        continue
                    fi
                    
                    local menu_opts=""
                    local i=1
                    for opt in $options; do
                        local opt_label=$(get_setup_item_option_label "$item_id" "$opt")
                        echo "[DEBUG] Option $i: value='$opt', label='$opt_label'" >> /tmp/debug.log
                        menu_opts="$menu_opts $i \"$opt_label\""
                        i=$((i+1))
                    done
                    
                    echo "[DEBUG] Final menu_opts='$menu_opts'" >> /tmp/debug.log
                    
                    value=$(eval "whiptail --title '$breadcrumb' --ok-button 'Select' --cancel-button 'Back' --menu '${label}:' 18 60 10 $menu_opts 3>&1 1>&2 2>&3")
                    exit_code=$?
                    
                    echo "[DEBUG] select exit_code=$exit_code, value='$value'" >> /tmp/debug.log
                    
                    if [ $exit_code -ne 0 ]; then
                        echo "[DEBUG] User cancelled or error in select" >> /tmp/debug.log
                        return 1
                    fi
                    
                    if [ -n "$value" ]; then
                        selected_opt=$(echo "$options" | sed -n "${value}p")
                        echo "[DEBUG] selected_opt='$selected_opt'" >> /tmp/debug.log
                        sed -i "/^${variable}=/d" "$SETUP_VARS"
                        echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                        
                        auto_add_conditional_packages "$cat_id"
                        
                        if [ "$item_id" = "dslite-aftr-type" ] || [ "$item_id" = "dslite-area" ]; then
                            local aftr_type=$(grep "^dslite_aftr_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                            local area=$(grep "^dslite_area=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                            local computed=$(compute_dslite_aftr "$aftr_type" "$area")
                            if [ -n "$computed" ]; then
                                sed -i "/^dslite_aftr_address=/d" "$SETUP_VARS"
                                echo "dslite_aftr_address='${computed}'" >> "$SETUP_VARS"
                            fi
                        fi
                    fi
                else
                    echo "[DEBUG] About to show inputbox for '$label'" >> /tmp/debug.log
                    
                    value=$(whiptail --title "$breadcrumb" --ok-button "Select" --cancel-button "Back" --inputbox "${label}:" 10 60 "$current" 3>&1 1>&2 2>&3)
                    exit_code=$?
                    
                    echo "[DEBUG] inputbox exit_code=$exit_code, value='$value'" >> /tmp/debug.log
                    
                    if [ $exit_code -ne 0 ]; then
                        echo "[DEBUG] User cancelled or error in inputbox" >> /tmp/debug.log
                        return 1
                    fi
                    
                    if [ -n "$value" ]; then
                        sed -i "/^${variable}=/d" "$SETUP_VARS"
                        echo "${variable}='${value}'" >> "$SETUP_VARS"
                        echo "[DEBUG] Saved ${variable}='${value}'" >> /tmp/debug.log
                    fi
                fi
                ;;
                
            info-display)
                items_processed=$((items_processed + 1))
                local cat_idx=0
                local item_idx=0
                for cid in $(get_setup_categories); do
                    local citems=$(get_setup_category_items "$cid")
                    local idx=0
                    for itm in $citems; do
                        if [ "$itm" = "$item_id" ]; then
                            item_idx=$idx
                            break 2
                        fi
                        idx=$((idx+1))
                    done
                    cat_idx=$((cat_idx+1))
                done
                
                local content=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[$cat_idx].items[$item_idx].content" 2>/dev/null)
                local class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[$cat_idx].items[$item_idx].class" 2>/dev/null)
                
                if [ -n "$class" ] && [ "${class#tr-}" != "$class" ]; then
                    content=$(translate "$class")
                fi
                
                [ -n "$content" ] && whiptail --msgbox "$content" 10 60
                ;;
        esac
    done
    
    echo "[DEBUG] Total items processed: $items_processed" >> /tmp/debug.log
    return $items_processed
}

whiptail_category_config() {
    local cat_id="$1"
    local tr_main_menu=$(translate "tr-tui-main-menu")
    local cat_title=$(get_setup_category_title "$cat_id")
    
    echo "[DEBUG] === whiptail_category_config START ===" >> /tmp/debug.log
    echo "[DEBUG] cat_id=$cat_id, title=$cat_title" >> /tmp/debug.log
    
    if [ "$cat_id" = "internet-connection" ]; then
        if whiptail_show_network_info; then
            whiptail --msgbox "Auto-configuration applied!" 8 40
            auto_add_conditional_packages "$cat_id"
            return 0
        fi
    fi
    
    echo "[DEBUG] Processing all items" >> /tmp/debug.log
    whiptail_process_items "$cat_id" ""
    local processed=$?
    
    echo "[DEBUG] Items processed: $processed" >> /tmp/debug.log
    
    if [ $processed -eq 1 ]; then
        echo "[DEBUG] User cancelled, returning" >> /tmp/debug.log
        return 0
    fi
    
    echo "[DEBUG] SETUP_VARS after processing:" >> /tmp/debug.log
    cat "$SETUP_VARS" >> /tmp/debug.log 2>&1
    
    if [ $processed -eq 0 ]; then
        whiptail --msgbox "Configuration completed!" 8 50
    fi

    echo "[DEBUG] About to call auto_add_conditional_packages for $cat_id" >> /tmp/debug.log
    auto_add_conditional_packages "$cat_id"
    echo "[DEBUG] After auto_add_conditional_packages" >> /tmp/debug.log
    echo "[DEBUG] Selected packages:" >> /tmp/debug.log
    cat "$SELECTED_PACKAGES" >> /tmp/debug.log 2>&1
    echo "[DEBUG] === whiptail_category_config END ===" >> /tmp/debug.log
}

whiptail_package_categories() {
    local tr_main_menu=$(translate "tr-tui-main-menu")
    local tr_custom_packages=$(translate "tr-custom-packages")
    local breadcrumb="${tr_main_menu} > ${tr_custom_packages}"
    
    local menu_items="" i=1 cat_id cat_name
    
    while read cat_id; do
        local is_hidden=$(get_category_hidden "$cat_id")
        [ "$is_hidden" = "true" ] && continue
        
        cat_name=$(get_category_name "$cat_id")
        menu_items="$menu_items $i \"$cat_name\""
        i=$((i+1))
    done < <(get_categories)
    
    choice=$(eval "whiptail --title '$breadcrumb' --ok-button 'Select' --cancel-button 'Back' --menu '$(translate "tr-tui-view-package-list"):' 20 70 12 $menu_items 3>&1 1>&2 2>&3")
    
    if [ $? -ne 0 ]; then
        return 0
    fi
    
    if [ -n "$choice" ]; then
        selected_cat=$(get_categories | while read cat_id; do
            local is_hidden=$(get_category_hidden "$cat_id")
            [ "$is_hidden" != "true" ] && echo "$cat_id"
        done | sed -n "${choice}p")
        whiptail_package_selection "$selected_cat"
    fi
}

whiptail_package_selection() {
    local cat_id="$1"
    local cat_name=$(get_category_name "$cat_id")
    
    local cat_desc=$(get_category_desc "$cat_id")
    local tr_space_toggle=$(translate "tr-tui-space-toggle")
    local checklist_items="" pkg_id pkg_name status
    
    while read pkg_id; do
        pkg_name=$(get_package_name "$pkg_id")
        [ -z "$pkg_name" ] && pkg_name="$pkg_id"
        
        if is_package_selected "$pkg_id"; then
            status="ON"
        else
            status="OFF"
        fi
        
        checklist_items="$checklist_items \"$pkg_id\" \"$pkg_name\" $status"
    done < <(get_category_packages "$cat_id")
    
    selected=$(eval "whiptail --title '$cat_name' --ok-button 'Select' --cancel-button 'Back' --checklist '$cat_desc ($tr_space_toggle):' 20 70 12 $checklist_items 3>&1 1>&2 2>&3")
    
    if [ $? -eq 0 ]; then
        while read pkg_id; do
            sed -i "/^${pkg_id}$/d" "$SELECTED_PACKAGES"
        done < <(get_category_packages "$cat_id")
        
        for pkg in $selected; do
            pkg_clean=$(echo "$pkg" | tr -d '"')
            echo "$pkg_clean" >> "$SELECTED_PACKAGES"
        done
    fi
    
    whiptail_package_categories
}

whiptail_main_menu() {
    while true; do
        local tr_main_menu=$(translate "tr-tui-main-menu")
        local menu_items="" i=1 cat_id cat_title
        
        while read cat_id; do
            cat_title=$(get_setup_category_title "$cat_id")
            menu_items="$menu_items $i \"$cat_title\""
            i=$((i+1))
        done < <(get_setup_categories)
        
        local packages_label=$(translate "tr-custom-packages")
        menu_items="$menu_items $i \"$packages_label\""
        i=$((i+1))
        menu_items="$menu_items $i \"$(translate 'tr-tui-review-configuration')\""
        
        choice=$(eval "whiptail --title 'OpenWrt Setup Tool v$VERSION - $DEVICE_MODEL' \
            --ok-button '$(translate 'tr-tui-select')' --cancel-button '$(translate 'tr-tui-exit')' \
            --menu '$tr_main_menu:' 20 70 12 $menu_items 3>&1 1>&2 2>&3")
        
        if [ $? -ne 0 ]; then
            exit 0
        fi
        
        local setup_cat_count=$(get_setup_categories | wc -l)
        if [ "$choice" -le "$setup_cat_count" ]; then
            selected_cat=$(get_setup_categories | sed -n "${choice}p")
            whiptail_category_config "$selected_cat"
        elif [ "$choice" -eq "$((setup_cat_count+1))" ]; then
            whiptail_package_categories
        elif [ "$choice" -eq "$((setup_cat_count+2))" ]; then
            review_and_apply
        fi
    done
}

review_and_apply() {
    generate_files
    
    local tr_main_menu=$(translate "tr-tui-main-menu")
    local tr_review=$(translate "tr-tui-review-configuration")
    
    while true; do
        if [ "$UI_MODE" = "whiptail" ]; then
            local breadcrumb="${tr_main_menu} > ${tr_review}"
            
            choice=$(whiptail --title "$breadcrumb" --ok-button "$(translate 'tr-tui-select')" --cancel-button "$(translate 'tr-tui-back')" --menu \
                "$(translate 'tr-tui-select'):" 20 70 12 \
                "1" "$(translate 'tr-tui-view-device-info')" \
                "2" "$(translate 'tr-tui-view-package-list')" \
                "3" "$(translate 'tr-tui-view-config-vars')" \
                "4" "$(translate 'tr-tui-view-postinst')" \
                "5" "$(translate 'tr-tui-view-setup')" \
                "6" "$(translate 'tr-tui-apply-confirm' | head -1)" \
                3>&1 1>&2 2>&3)
            
            [ $? -ne 0 ] && return 0
        else
            clear
            echo "=== $(translate 'tr-tui-review-configuration') ==="
            echo ""
            echo "1) $(translate 'tr-tui-view-device-info')"
            echo "2) $(translate 'tr-tui-view-package-list')"
            echo "3) $(translate 'tr-tui-view-config-vars')"
            echo "4) $(translate 'tr-tui-view-postinst')"
            echo "5) $(translate 'tr-tui-view-setup')"
            echo "6) $(translate 'tr-tui-apply-confirm' | head -1)"
            echo "b) $(translate 'tr-tui-back')"
            echo ""
            printf "Choice: "
            read choice
            
            [ "$choice" = "b" ] || [ "$choice" = "B" ] && return 0
        fi
        
        case "$choice" in
            1)
                [ "$UI_MODE" = "whiptail" ] && whiptail_device_info || simple_device_info
                ;;
            2)
                if [ "$UI_MODE" = "whiptail" ]; then
                    local pkg_breadcrumb="${tr_main_menu} > ${tr_review} > $(translate 'tr-tui-view-package-list')"
                    if [ -s "$SELECTED_PACKAGES" ]; then
                        cat "$SELECTED_PACKAGES" | sed 's/^/- /' > /tmp/pkg_view.txt
                        whiptail --scrolltext --title "$pkg_breadcrumb" --textbox /tmp/pkg_view.txt 24 78
                    else
                        whiptail --title "$pkg_breadcrumb" --msgbox "$(translate 'tr-tui-no-packages')" 8 40
                    fi
                else
                    clear
                    echo "=== $(translate 'tr-tui-view-package-list') ==="
                    echo ""
                    if [ -s "$SELECTED_PACKAGES" ]; then
                        cat "$SELECTED_PACKAGES" | while read pkg; do
                            echo "  - $pkg"
                        done
                    else
                        echo "  $(translate 'tr-tui-no-packages')"
                    fi
                    echo ""
                    printf "Press Enter to continue..."
                    read
                fi
                ;;
            3)
                if [ "$UI_MODE" = "whiptail" ]; then
                    local vars_breadcrumb="${tr_main_menu} > ${tr_review} > $(translate 'tr-tui-view-config-vars')"
                    if [ -s "$SETUP_VARS" ]; then
                        whiptail --scrolltext --title "$vars_breadcrumb" --textbox "$SETUP_VARS" 24 78
                    else
                        whiptail --title "$vars_breadcrumb" --msgbox "$(translate 'tr-tui-no-config-vars')" 8 40
                    fi
                else
                    clear
                    echo "=== $(translate 'tr-tui-view-config-vars') ==="
                    echo ""
                    if [ -s "$SETUP_VARS" ]; then
                        cat "$SETUP_VARS"
                    else
                        echo "  $(translate 'tr-tui-no-config-vars')"
                    fi
                    echo ""
                    printf "Press Enter to continue..."
                    read
                fi
                ;;
            4)
                if [ "$UI_MODE" = "whiptail" ]; then
                    local postinst_breadcrumb="${tr_main_menu} > ${tr_review} > $(translate 'tr-tui-view-postinst')"
                    if [ -f "$OUTPUT_DIR/postinst.sh" ]; then
                        whiptail --scrolltext --title "$postinst_breadcrumb" --textbox "$OUTPUT_DIR/postinst.sh" 24 78
                    else
                        whiptail --title "$postinst_breadcrumb" --msgbox "$(translate 'tr-tui-postinst-not-found')" 8 40
                    fi
                else
                    clear
                    echo "=== $(translate 'tr-tui-view-postinst') ==="
                    echo ""
                    if [ -f "$OUTPUT_DIR/postinst.sh" ]; then
                        cat "$OUTPUT_DIR/postinst.sh"
                    else
                        echo "$(translate 'tr-tui-postinst-not-found')"
                    fi
                    echo ""
                    printf "Press Enter to continue..."
                    read
                fi
                ;;
            5)
                if [ "$UI_MODE" = "whiptail" ]; then
                    local setup_breadcrumb="${tr_main_menu} > ${tr_review} > $(translate 'tr-tui-view-setup')"
                    if [ -f "$OUTPUT_DIR/setup.sh" ]; then
                        whiptail --scrolltext --title "$setup_breadcrumb" --textbox "$OUTPUT_DIR/setup.sh" 24 78
                    else
                        whiptail --title "$setup_breadcrumb" --msgbox "$(translate 'tr-tui-setup-not-found')" 8 40
                    fi
                else
                    clear
                    echo "=== $(translate 'tr-tui-view-setup') ==="
                    echo ""
                    if [ -f "$OUTPUT_DIR/setup.sh" ]; then
                        cat "$OUTPUT_DIR/setup.sh"
                    else
                        echo "$(translate 'tr-tui-setup-not-found')"
                    fi
                    echo ""
                    printf "Press Enter to continue..."
                    read
                fi
                ;;
            6)
                if [ "$UI_MODE" = "whiptail" ]; then
                    if whiptail --title "$breadcrumb" --yesno "$(translate 'tr-tui-apply-confirm')" 15 60; then
                        whiptail --title "$breadcrumb" --msgbox "$(translate 'tr-tui-installing-packages')" 8 50
                        sh "$OUTPUT_DIR/postinst.sh"
                        whiptail --title "$breadcrumb" --msgbox "$(translate 'tr-tui-applying-config')" 8 50
                        sh "$OUTPUT_DIR/setup.sh"
                        if whiptail --title "$breadcrumb" --yesno "$(translate 'tr-tui-config-applied')" 10 50; then
                            reboot
                        fi
                        return 0
                    fi
                else
                    clear
                    echo "=== $(translate 'tr-tui-apply-confirm' | head -1) ==="
                    echo ""
                    echo "$(translate 'tr-tui-apply-confirm')"
                    echo ""
                    printf "$(translate 'tr-tui-yes')/$(translate 'tr-tui-no'): "
                    read confirm
                    
                    if [ "$confirm" = "$(translate 'tr-tui-yes')" ] || [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
                        echo ""
                        echo "$(translate 'tr-tui-installing-packages')"
                        sh "$OUTPUT_DIR/postinst.sh"
                        echo ""
                        echo "$(translate 'tr-tui-applying-config')"
                        sh "$OUTPUT_DIR/setup.sh"
                        echo ""
                        echo "$(translate 'tr-tui-config-applied')"
                        echo ""
                        printf "$(translate 'tr-tui-yes')/$(translate 'tr-tui-no'): "
                        read reboot_confirm
                        if [ "$reboot_confirm" = "$(translate 'tr-tui-yes')" ] || [ "$reboot_confirm" = "y" ] || [ "$reboot_confirm" = "Y" ]; then
                            reboot
                        fi
                        return 0
                    fi
                fi
                ;;
        esac
    done
}

simple_device_info() {
    clear
    echo "========================================"
    echo "  $(translate 'tr-tui-view-device-info')"
    echo "========================================"
    echo ""
    echo "Model:   $DEVICE_MODEL"
    echo "Target:  $DEVICE_TARGET"
    echo "Version: $OPENWRT_VERSION"
    [ -n "$DEVICE_MEM" ] && echo "Memory:  $DEVICE_MEM"
    [ -n "$DEVICE_CPU" ] && echo "CPU:     $DEVICE_CPU"
    [ -n "$DEVICE_STORAGE" ] && echo "Storage: $DEVICE_STORAGE_USED/$DEVICE_STORAGE (${DEVICE_STORAGE_AVAIL} free)"
    [ -n "$DEVICE_USB" ] && echo "USB:     $DEVICE_USB"
    echo ""
    printf "Press Enter to continue..."
    read
}

simple_show_network_info() {
    clear
    echo "========================================"
    echo "  $(translate 'tr-auto-detection')"
    echo "========================================"
    echo ""
    
    if [ -z "$DETECTED_CONN_TYPE" ] || [ "$DETECTED_CONN_TYPE" = "Unknown" ]; then
        echo "No configuration detected."
        echo ""
        printf "Press Enter to continue..."
        read
        return 1
    fi
    
    local tr_connection_type=$(translate "tr-connection-type")
    local tr_isp=$(translate "tr-isp")
    local tr_as=$(translate "tr-as")
    
    echo "${tr_connection_type}: $DETECTED_CONN_TYPE"
    [ -n "$ISP_NAME" ] && echo "${tr_isp}: $ISP_NAME"
    [ -n "$ISP_AS" ] && echo "${tr_as}: $ISP_AS"
    echo ""
    
    if [ "$DETECTED_CONN_TYPE" = "MAP-E" ] && [ -n "$MAPE_BR" ]; then
        echo "MAP-E Configuration:"
        [ -n "$MAPE_GUA_PREFIX" ] && echo "  option ip6prefix_gua $MAPE_GUA_PREFIX"
        echo "  option peeraddr $MAPE_BR"
        [ -n "$MAPE_IPV4_PREFIX" ] && echo "  option ipaddr $MAPE_IPV4_PREFIX"
        [ -n "$MAPE_IPV4_PREFIXLEN" ] && echo "  option ip4prefixlen $MAPE_IPV4_PREFIXLEN"
        [ -n "$MAPE_IPV6_PREFIX" ] && echo "  option ip6prefix $MAPE_IPV6_PREFIX"
        [ -n "$MAPE_IPV6_PREFIXLEN" ] && echo "  option ip6prefixlen $MAPE_IPV6_PREFIXLEN"
        [ -n "$MAPE_EALEN" ] && echo "  option ealen $MAPE_EALEN"
        [ -n "$MAPE_PSIDLEN" ] && echo "  option psidlen $MAPE_PSIDLEN"
        [ -n "$MAPE_PSID_OFFSET" ] && echo "  option offset $MAPE_PSID_OFFSET"
    elif [ "$DETECTED_CONN_TYPE" = "DS-Lite" ] && [ -n "$DSLITE_AFTR" ]; then
        echo "DS-Lite Configuration:"
        echo "  option peeraddr $DSLITE_AFTR"
    fi
    
    echo ""
    printf "$(translate 'tr-tui-use-auto-config') ($(translate 'tr-tui-yes')/$(translate 'tr-tui-no')): "
    read confirm
    
    if [ "$confirm" = "$(translate 'tr-tui-yes')" ] || [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        sed -i "/^connection_type=/d" "$SETUP_VARS"
        echo "connection_type='auto'" >> "$SETUP_VARS"
        return 0
    else
        return 1
    fi
}

simple_process_items() {
    local cat_id="$1"
    local parent_items="$2"
    
    local items
    if [ -z "$parent_items" ]; then
        items=$(get_setup_category_items "$cat_id")
    else
        items="$parent_items"
    fi
    
    for item_id in $items; do
        local item_type=$(get_setup_item_type "$item_id")
        
        if ! should_show_item "$item_id"; then
            continue
        fi
        
        case "$item_type" in
            radio-group)
                local label=$(get_setup_item_label "$item_id")
                local variable=$(get_setup_item_variable "$item_id")
                local default=$(get_setup_item_default "$item_id")
                
                if [ "$item_id" = "mape-type" ]; then
                    if [ -n "$MAPE_GUA_PREFIX" ]; then
                        default="gua"
                    else
                        default="pd"
                    fi
                fi
                
                local current=$(grep "^${variable}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                [ -z "$current" ] && current="$default"
                
                local options=$(get_setup_item_options "$item_id")
                
                echo ""
                echo "$label:"
                local i=1
                for opt in $options; do
                    local opt_label=$(get_setup_item_option_label "$item_id" "$opt")
                    if [ "$opt" = "$current" ]; then
                        echo "$i) $opt_label [current]"
                    else
                        echo "$i) $opt_label"
                    fi
                    i=$((i+1))
                done
                
                printf "$(translate 'tr-tui-choice') [Enter=keep current]: "
                read choice
                
                if [ -n "$choice" ]; then
                    selected_opt=$(echo "$options" | sed -n "${choice}p")
                    if [ -n "$selected_opt" ]; then
                        sed -i "/^${variable}=/d" "$SETUP_VARS"
                        echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                        auto_add_conditional_packages "$cat_id"
                    fi
                fi
                ;;
            
            section)
                local nested=$(get_section_nested_items "$item_id")
                if [ -n "$nested" ]; then
                    simple_process_items "$cat_id" "$nested"
                fi
                ;;
                
            field)
                local label=$(get_setup_item_label "$item_id")
                local variable=$(get_setup_item_variable "$item_id")
                local default=$(get_setup_item_default "$item_id")
                local field_type=$(get_setup_item_field_type "$item_id")
                
                local current=$(grep "^${variable}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                
                if [ -z "$current" ]; then
                    case "$variable" in
                        mape_gua_prefix)
                            current="${MAPE_GUA_PREFIX:-$default}"
                            ;;
                        mape_br)
                            current="${MAPE_BR:-$default}"
                            ;;
                        mape_ipv4_prefix)
                            current="${MAPE_IPV4_PREFIX:-$default}"
                            ;;
                        mape_ipv4_prefixlen)
                            current="${MAPE_IPV4_PREFIXLEN:-$default}"
                            ;;
                        mape_ipv6_prefix)
                            current="${MAPE_IPV6_PREFIX:-$default}"
                            ;;
                        mape_ipv6_prefixlen)
                            current="${MAPE_IPV6_PREFIXLEN:-$default}"
                            ;;
                        mape_ealen)
                            current="${MAPE_EALEN:-$default}"
                            ;;
                        mape_psidlen)
                            current="${MAPE_PSIDLEN:-$default}"
                            ;;
                        mape_psid_offset)
                            current="${MAPE_PSID_OFFSET:-$default}"
                            ;;
                        dslite_aftr_address)
                            current="${DSLITE_AFTR:-$default}"
                            ;;
                        *)
                            current="$default"
                            ;;
                    esac
                fi
                
                if [ "$field_type" = "computed" ]; then
                    if [ "$item_id" = "dslite-aftr-address-computed" ]; then
                        local aftr_type=$(grep "^dslite_aftr_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                        local area=$(grep "^dslite_area=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                        
                        if [ -n "$aftr_type" ] && [ -n "$area" ]; then
                            local computed=$(compute_dslite_aftr "$aftr_type" "$area")
                            if [ -n "$computed" ]; then
                                current="$computed"
                                sed -i "/^${variable}=/d" "$SETUP_VARS"
                                echo "${variable}='${computed}'" >> "$SETUP_VARS"
                            fi
                        fi
                    fi
                    echo ""
                    echo "$label: $current"
                    continue
                fi
                
                if [ "$field_type" = "select" ]; then
                    local source=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].source" 2>/dev/null | head -1)
                    
                    if [ -n "$source" ]; then
                        case "$source" in
                            "browser-languages")
                                continue
                                ;;
                            *)
                                echo ""
                                printf "$label [$current]: "
                                read value
                                
                                if [ -z "$value" ]; then
                                    value="$current"
                                fi
                                
                                if [ -n "$value" ]; then
                                    sed -i "/^${variable}=/d" "$SETUP_VARS"
                                    echo "${variable}='${value}'" >> "$SETUP_VARS"
                                fi
                                continue
                                ;;
                        esac
                    fi
                    
                    local options=$(get_setup_item_options "$item_id")
                    
                    echo ""
                    echo "$label:"
                    local i=1
                    for opt in $options; do
                        local opt_label=$(get_setup_item_option_label "$item_id" "$opt")
                        if [ "$opt" = "$current" ]; then
                            echo "$i) $opt_label [current]"
                        else
                            echo "$i) $opt_label"
                        fi
                        i=$((i+1))
                    done
                    
                    printf "$(translate 'tr-tui-choice') [Enter=keep current]: "
                    read choice
                    
                    if [ -n "$choice" ]; then
                        selected_opt=$(echo "$options" | sed -n "${choice}p")
                        if [ -n "$selected_opt" ]; then
                            sed -i "/^${variable}=/d" "$SETUP_VARS"
                            echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                            auto_add_conditional_packages "$cat_id"
                            
                            if [ "$item_id" = "dslite-aftr-type" ] || [ "$item_id" = "dslite-area" ]; then
                                local aftr_type=$(grep "^dslite_aftr_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                                local area=$(grep "^dslite_area=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                                local computed=$(compute_dslite_aftr "$aftr_type" "$area")
                                if [ -n "$computed" ]; then
                                    sed -i "/^dslite_aftr_address=/d" "$SETUP_VARS"
                                    echo "dslite_aftr_address='${computed}'" >> "$SETUP_VARS"
                                fi
                            fi
                        fi
                    fi
                else
                    echo ""
                    printf "$label [$current]: "
                    read value
                    
                    if [ -z "$value" ]; then
                        value="$current"
                    fi
                    
                    if [ -n "$value" ]; then
                        sed -i "/^${variable}=/d" "$SETUP_VARS"
                        echo "${variable}='${value}'" >> "$SETUP_VARS"
                    fi
                fi
                ;;
                
            info-display)
                local cat_idx=0
                local item_idx=0
                for cid in $(get_setup_categories); do
                    local citems=$(get_setup_category_items "$cid")
                    local idx=0
                    for itm in $citems; do
                        if [ "$itm" = "$item_id" ]; then
                            item_idx=$idx
                            break 2
                        fi
                        idx=$((idx+1))
                    done
                    cat_idx=$((cat_idx+1))
                done
                
                local content=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[$cat_idx].items[$item_idx].content" 2>/dev/null)
                local class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[$cat_idx].items[$item_idx].class" 2>/dev/null)
                
                if [ -n "$class" ] && [ "${class#tr-}" != "$class" ]; then
                    content=$(translate "$class")
                fi
                
                if [ -n "$content" ]; then
                    echo ""
                    echo "$content"
                fi
                ;;
        esac
    done
}

simple_category_config() {
    local cat_id="$1"
    local cat_title=$(get_setup_category_title "$cat_id")
    
    clear
    echo "========================================"
    echo "  $cat_title"
    echo "========================================"
    
    if [ "$cat_id" = "internet-connection" ]; then
        if simple_show_network_info; then
            echo ""
            echo "$(translate 'tr-tui-auto-config-applied')"
            sleep 2
            return 0
        fi
    fi
    
    simple_process_items "$cat_id" ""
    
    auto_add_conditional_packages "$cat_id"
    
    echo ""
    echo "Configuration completed!"
    printf "Press Enter to continue..."
    read
}

simple_package_categories() {
    while true; do
        clear
        echo "========================================"
        echo "  $(translate 'tr-custom-packages')"
        echo "========================================"
        echo ""
        
        local i=1
        get_categories | while read cat_id; do
            local is_hidden=$(get_category_hidden "$cat_id")
            [ "$is_hidden" = "true" ] && continue
            
            local cat_name=$(get_category_name "$cat_id")
            echo "$i) $cat_name"
            i=$((i+1))
        done
        
        echo "b) $(translate 'tr-tui-back')"
        echo ""
        printf "$(translate 'tr-tui-choice'): "
        read choice
        
        if [ "$choice" = "b" ] || [ "$choice" = "B" ]; then
            return 0
        fi
        
        if [ -n "$choice" ]; then
            selected_cat=$(get_categories | while read cat_id; do
                local is_hidden=$(get_category_hidden "$cat_id")
                [ "$is_hidden" != "true" ] && echo "$cat_id"
            done | sed -n "${choice}p")
            
            if [ -n "$selected_cat" ]; then
                simple_package_selection "$selected_cat"
            fi
        fi
    done
}

simple_package_selection() {
    local cat_id="$1"
    local cat_name=$(get_category_name "$cat_id")
    local cat_desc=$(get_category_desc "$cat_id")
    
    clear
    echo "========================================"
    echo "  $(translate 'tr-custom-packages') > $cat_name"
    echo "========================================"
    echo ""
    echo "$cat_desc"
    echo ""
    
    get_category_packages "$cat_id" | while read pkg_id; do
        local pkg_name=$(get_package_name "$pkg_id")
        [ -z "$pkg_name" ] && pkg_name="$pkg_id"
        
        if is_package_selected "$pkg_id"; then
            echo "[X] $pkg_name"
        else
            echo "[ ] $pkg_name"
        fi
    done
    
    echo ""
    echo "Enter package number to toggle (or 'b' to go back):"
    
    local i=1
    get_category_packages "$cat_id" | while read pkg_id; do
        local pkg_name=$(get_package_name "$pkg_id")
        [ -z "$pkg_name" ] && pkg_name="$pkg_id"
        echo "$i) $pkg_name"
        i=$((i+1))
    done
    
    echo ""
    printf "$(translate 'tr-tui-choice'): "
    read choice
    
    if [ "$choice" = "b" ] || [ "$choice" = "B" ]; then
        return 0
    fi
    
    if [ -n "$choice" ]; then
        local pkg_id=$(get_category_packages "$cat_id" | sed -n "${choice}p")
        if [ -n "$pkg_id" ]; then
            if is_package_selected "$pkg_id"; then
                sed -i "/^${pkg_id}$/d" "$SELECTED_PACKAGES"
            else
                echo "$pkg_id" >> "$SELECTED_PACKAGES"
            fi
            simple_package_selection "$cat_id"
        fi
    fi
}

simple_main_menu() {
    while true; do
        clear
        echo "========================================"
        echo "  OpenWrt Setup Tool v$VERSION"
        echo "========================================"
        echo ""
        echo "Device: $DEVICE_MODEL"
        echo ""
        
        local i=1
        for cat_id in $(get_setup_categories); do
            cat_title=$(get_setup_category_title "$cat_id")
            echo "$i) $cat_title"
            i=$((i+1))
        done
        
        local packages_label=$(translate "tr-custom-packages")
        echo "$i) $packages_label"
        local packages_choice=$i
        i=$((i+1))
        echo "$i) $(translate 'tr-tui-review-configuration')"
        local review_choice=$i
        i=$((i+1))
        echo "$i) $(translate 'tr-tui-exit')"
        local exit_choice=$i
        
        echo ""
        printf "$(translate 'tr-tui-choice'): "
        read choice
        
        if [ -z "$choice" ]; then
            continue
        fi
        
        local setup_cat_count=$(get_setup_categories | wc -l)
        if [ "$choice" -le "$setup_cat_count" ]; then
            selected_cat=$(get_setup_categories | sed -n "${choice}p")
            simple_category_config "$selected_cat"
        elif [ "$choice" -eq "$packages_choice" ]; then
            simple_package_categories
        elif [ "$choice" -eq "$review_choice" ]; then
            review_and_apply
        elif [ "$choice" -eq "$exit_choice" ]; then
            exit 0
        fi
    done
}

aios_light_main() {
    clear
    echo "==========================================="
    echo "  OpenWrt Device Setup Tool v$VERSION"
    echo "==========================================="
    echo ""
    
    detect_package_manager
    echo "Package manager: $PKG_MGR"
    
    init
    
    echo "Fetching API ${AUTO_CONFIG_URL}"
    
    get_extended_device_info

    apply_api_defaults
    
    echo "Fetching language: ${AUTO_LANGUAGE:-en}"
    if ! download_language_json "${AUTO_LANGUAGE:-en}"; then
        echo "Warning: Using English as fallback language"
    fi
    
    echo "Fetching setup.json"
    if ! download_setup_json; then
        echo "Error: Failed to download setup.json"
        echo "Cannot continue without setup.json"
        exit 1
    fi
    
    echo "Fetching packages.json"
    if ! download_packages; then
        echo "Warning: Failed to download packages.json"
        echo "Package selection will not be available."
        sleep 2
    fi
    
    load_default_packages
    
    echo ""

    echo "connection_type='auto'" >> "$SETUP_VARS"
    echo "wifi_mode='standard'" >> "$SETUP_VARS"
    echo "net_optimizer='auto'" >> "$SETUP_VARS"
    echo "enable_dnsmasq='auto'" >> "$SETUP_VARS"
    
    if [ "$DETECTED_CONN_TYPE" = "MAP-E" ]; then
        if [ -n "$MAPE_GUA_PREFIX" ]; then
            echo "mape_type='gua'" >> "$SETUP_VARS"
            echo "[DEBUG] Set mape_type=gua with prefix: $MAPE_GUA_PREFIX" >> /tmp/debug.log
        else
            echo "mape_type='pd'" >> "$SETUP_VARS"
            echo "[DEBUG] Set mape_type=pd (no GUA detected)" >> /tmp/debug.log
        fi
    fi
    
    for cat_id in $(get_setup_categories); do
        auto_add_conditional_packages "$cat_id"
    done
    
    select_ui_mode
    
    if [ "$UI_MODE" = "whiptail" ]; then
        whiptail_device_info
        whiptail_main_menu
    else
        simple_device_info
        simple_main_menu
    fi
}

aios_light_main
