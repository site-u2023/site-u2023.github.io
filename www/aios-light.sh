#!/bin/sh
# OpenWrt Device Setup Tool - CLI Version
# ASU (Attended SysUpgrade) Compatible
# Supports: whiptail (TUI) with fallback to simple menu

VERSION="1.0.1"
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
    HAS_WHIPTAIL=false
    command -v whiptail >/dev/null 2>&1 && HAS_WHIPTAIL=true
    
    echo "$(translate 'tr-ui-mode-select')"
    echo "1) $(translate 'tr-ui-whiptail')"
    echo "2) $(translate 'tr-ui-simple')"
    
    printf "$(translate 'tr-ui-choice') [1]: "
    read choice
    
    if [ "$choice" = "2" ]; then
        UI_MODE="simple"
    else
        if [ "$HAS_WHIPTAIL" = false ]; then
            echo "$(translate 'tr-ui-installing')"
            if install_package whiptail newt; then
                hash -r
                if command -v whiptail >/dev/null 2>&1; then
                    echo "$(translate 'tr-ui-install-success')"
                    UI_MODE="whiptail"
                else
                    echo "$(translate 'tr-ui-install-failed')"
                    UI_MODE="simple"
                fi
            else
                echo "$(translate 'tr-ui-install-failed')"
                UI_MODE="simple"
            fi
        else
            UI_MODE="whiptail"
        fi
    fi
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
    
    echo "Fetching language: ${lang}"
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
    
    # まず通常のレベルで検索
    local result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].type" 2>/dev/null | head -1)
    
    # 見つからなければネストされたitemsで検索（section内のitems）
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].type" 2>/dev/null | head -1)
    fi
    
    echo "$result"
}

get_setup_item_label() {
    local item_id="$1"
    
    # まず通常のレベルで検索
    local label=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].label" 2>/dev/null | head -1)
    local class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].class" 2>/dev/null | head -1)
    
    # ネストレベルで検索
    if [ -z "$label" ]; then
        label=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].label" 2>/dev/null | head -1)
        class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].class" 2>/dev/null | head -1)
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

get_setup_item_placeholder() {
    local item_id="$1"
    local result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].placeholder" 2>/dev/null | head -1)
    
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].placeholder" 2>/dev/null | head -1)
    fi
    
    echo "$result"
}

get_setup_item_fieldtype() {
    local item_id="$1"
    local result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].fieldType" 2>/dev/null | head -1)
    
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].fieldType" 2>/dev/null | head -1)
    fi
    
    echo "$result"
}

get_setup_item_options() {
    local item_id="$1"
    
    # 通常レベル
    local result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].options[*].value" 2>/dev/null)
    
    # ネストレベル
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].options[*].value" 2>/dev/null)
    fi
    
    echo "$result"
}

get_setup_item_option_label() {
    local item_id="$1"
    local value="$2"
    
    # 通常レベル
    local label=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].options[@.value='$value'].label" 2>/dev/null | head -1)
    local class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].options[@.value='$value'].class" 2>/dev/null | head -1)
    
    # ネストレベル
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
    jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$1'].description" 2>/dev/null
}

get_category_packages() {
    jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$1'].packages[*].id" 2>/dev/null | grep -v '^$'
}

get_package_name() {
    jsonfilter -i "$PACKAGES_JSON" -e "@.categories[*].packages[@.id='$1'].name" 2>/dev/null | head -1
}

get_package_checked() {
    jsonfilter -i "$PACKAGES_JSON" -e "@.categories[*].packages[@.id='$1'].checked" 2>/dev/null | head -1
}

is_package_selected() {
    grep -qx "$1" "$SELECTED_PACKAGES" 2>/dev/null
}

toggle_package() {
    if is_package_selected "$1"; then
        sed -i "/^${1}$/d" "$SELECTED_PACKAGES"
    else
        echo "$1" >> "$SELECTED_PACKAGES"
    fi
}

load_default_packages() {
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

should_show_item() {
    local item_id="$1"
    
    echo "[DEBUG] === should_show_item: $item_id ===" >> /tmp/debug.log
    
    local show_when=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].showWhen" 2>/dev/null | head -1)
    
    if [ -z "$show_when" ]; then
        show_when=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].showWhen" 2>/dev/null | head -1)
    fi
    
    echo "[DEBUG] showWhen raw: $show_when" >> /tmp/debug.log
    
    if [ -z "$show_when" ]; then
        echo "[DEBUG] No showWhen, returning 0 (show)" >> /tmp/debug.log
        return 0
    fi
    
    local var_name=$(echo "$show_when" | sed 's/^{ *"\([^"]*\)".*/\1/')
    echo "[DEBUG] var_name: $var_name" >> /tmp/debug.log
    
    [ -z "$var_name" ] && {
        echo "[DEBUG] Empty var_name, returning 0 (show)" >> /tmp/debug.log
        return 0
    }
    
    local current_val=$(grep "^${var_name}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
    echo "[DEBUG] current_val: '$current_val'" >> /tmp/debug.log
    
    local expected=$(jsonfilter -e "@.${var_name}[*]" 2>/dev/null <<EOF
$show_when
EOF
)
    
    if [ -z "$expected" ]; then
        expected=$(jsonfilter -e "@.${var_name}" 2>/dev/null <<EOF
$show_when
EOF
)
        echo "[DEBUG] expected (single): '$expected'" >> /tmp/debug.log
        if [ "$current_val" = "$expected" ]; then
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

whiptail_main_menu() {
    while true; do
        local menu_items="" i=1 cat_id cat_title
        
        while read cat_id; do
            cat_title=$(get_setup_category_title "$cat_id")
            menu_items="$menu_items $i \"$cat_title\""
            i=$((i+1))
        done < <(get_setup_categories)
        
        local packages_label=$(translate "tr-custom-packages")
        menu_items="$menu_items $i \"$packages_label\""
        i=$((i+1))
        menu_items="$menu_items $i \"Review & Generate\""
        i=$((i+1))
        menu_items="$menu_items $i \"Exit\""
        
        choice=$(eval "whiptail --title 'OpenWrt Setup Tool v$VERSION - $DEVICE_MODEL' \
            --menu 'Select an option:' 20 70 12 $menu_items 3>&1 1>&2 2>&3")
        
        if [ -z "$choice" ]; then
            exit 0
        fi
        
        local setup_cat_count=$(get_setup_categories | wc -l)
        if [ "$choice" -le "$setup_cat_count" ]; then
            selected_cat=$(get_setup_categories | sed -n "${choice}p")
            whiptail_category_config "$selected_cat"
        elif [ "$choice" -eq "$((setup_cat_count+1))" ]; then
            whiptail_package_categories
        elif [ "$choice" -eq "$((setup_cat_count+2))" ]; then
            whiptail_review
        else
            exit 0
        fi
    done
}

whiptail_category_config() {
    local cat_id="$1"
    local cat_title=$(get_setup_category_title "$cat_id")
    
    echo "[DEBUG] === whiptail_category_config START ===" >> /tmp/debug.log
    echo "[DEBUG] cat_id=$cat_id, title=$cat_title" >> /tmp/debug.log
    
    if [ "$cat_id" = "internet-connection" ]; then
        if whiptail_show_network_info; then
            whiptail --msgbox "Auto-configuration applied!" 8 40
            return 0
        fi
    fi
    
    echo "[DEBUG] Processing all items" >> /tmp/debug.log
    whiptail_process_items "$cat_id" ""
    local processed=$?
    
    echo "[DEBUG] Items processed: $processed" >> /tmp/debug.log
    echo "[DEBUG] SETUP_VARS after processing:" >> /tmp/debug.log
    cat "$SETUP_VARS" >> /tmp/debug.log 2>&1
    echo "[DEBUG] === whiptail_category_config END ===" >> /tmp/debug.log
    
    if [ $processed -eq 0 ]; then
        whiptail --msgbox "Configuration completed!" 8 50
    fi
}

whiptail_process_items() {
    local cat_id="$1"
    local parent_items="$2"
    
    echo "[DEBUG] whiptail_process_items: cat_id=$cat_id" >> /tmp/debug.log
    
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
        
        # showWhenチェック（すべてのアイテムタイプで実行）
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
                
                # MAP-E typeの初期値: GUA Prefixがあればgua、なければpd
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
                
                value=$(eval "whiptail --title 'Setup' --menu '$label:' 18 60 10 $menu_opts 3>&1 1>&2 2>&3")
                
                if [ $? -eq 0 ] && [ -n "$value" ]; then
                    selected_opt=$(echo "$options" | sed -n "${value}p")
                    echo "[DEBUG] Selected: $selected_opt" >> /tmp/debug.log
                    sed -i "/^${variable}=/d" "$SETUP_VARS"
                    echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                    echo "[DEBUG] Saved to SETUP_VARS" >> /tmp/debug.log
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
                local placeholder=$(get_setup_item_placeholder "$item_id")
                local fieldtype=$(get_setup_item_fieldtype "$item_id")
                
                local current=$(grep "^${variable}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                [ -z "$current" ] && current="$default"
                
                case "$item_id" in
                    aios-country) [ -z "$current" ] && current="${ISP_COUNTRY:-$default}" ;;
                    aios-timezone) [ -z "$current" ] && current="${AUTO_TIMEZONE:-$default}" ;;
                    aios-zonename) [ -z "$current" ] && current="${AUTO_ZONENAME:-$default}" ;;
                    mape-br) [ -z "$current" ] && current="${MAPE_BR:-$default}" ;;
                    mape-ealen) [ -z "$current" ] && current="${MAPE_EALEN:-$default}" ;;
                    mape-ipv4-prefix) [ -z "$current" ] && current="${MAPE_IPV4_PREFIX:-$default}" ;;
                    mape-ipv4-prefixlen) [ -z "$current" ] && current="${MAPE_IPV4_PREFIXLEN:-$default}" ;;
                    mape-ipv6-prefix) [ -z "$current" ] && current="${MAPE_IPV6_PREFIX:-$default}" ;;
                    mape-ipv6-prefixlen) [ -z "$current" ] && current="${MAPE_IPV6_PREFIXLEN:-$default}" ;;
                    mape-psid-offset) [ -z "$current" ] && current="${MAPE_PSID_OFFSET:-$default}" ;;
                    mape-psidlen) [ -z "$current" ] && current="${MAPE_PSIDLEN:-$default}" ;;
                    mape-gua-prefix) [ -z "$current" ] && current="${MAPE_GUA_PREFIX:-$default}" ;;
                    dslite-aftr-address) [ -z "$current" ] && current="${DSLITE_AFTR:-$default}" ;;
                esac
                
                if [ "$fieldtype" = "select" ]; then
                    local options=$(get_setup_item_options "$item_id")
                    local menu_opts=""
                    local i=1
                    for opt in $options; do
                        local opt_label=$(get_setup_item_option_label "$item_id" "$opt")
                        menu_opts="$menu_opts $i \"$opt_label\""
                        i=$((i+1))
                    done
                    
                    value=$(eval "whiptail --title 'Setup' --menu '$label:' 18 60 10 $menu_opts 3>&1 1>&2 2>&3")
                    
                    if [ $? -eq 0 ] && [ -n "$value" ]; then
                        selected_opt=$(echo "$options" | sed -n "${value}p")
                        sed -i "/^${variable}=/d" "$SETUP_VARS"
                        echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                    fi
                else
                    value=$(whiptail --inputbox "$label:" 10 60 "$current" 3>&1 1>&2 2>&3)
                    
                    if [ $? -eq 0 ] && [ -n "$value" ]; then
                        sed -i "/^${variable}=/d" "$SETUP_VARS"
                        echo "${variable}='${value}'" >> "$SETUP_VARS"
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

whiptail_show_network_info() {
    local tr_auto_detection=$(translate "tr-auto-detection")
    local tr_method=$(translate "tr-method")
    local tr_isp=$(translate "tr-isp")
    local tr_as=$(translate "tr-as")
    local tr_country=$(translate "tr-country")
    local tr_br=$(translate "tr-br")
    local tr_ipv4_prefix=$(translate "tr-ipv4-prefix")
    local tr_ipv6_prefix=$(translate "tr-ipv6-prefix")
    local tr_ea_len=$(translate "tr-ea-len")
    local tr_psid_length=$(translate "tr-psid-length")
    local tr_aftr=$(translate "tr-dslite-aftr-ipv6-address")
    local tr_mape_notice=$(translate "tr-mape-notice1")
    local tr_dslite_notice=$(translate "tr-dslite-notice1")
    
    if [ -z "$DETECTED_CONN_TYPE" ] || [ "$DETECTED_CONN_TYPE" = "Unknown" ]; then
        return 1
    fi
    
    local info="${tr_auto_detection}: ${DETECTED_CONN_TYPE}\n\n"
    [ -n "$ISP_NAME" ] && info="${info}${tr_isp}: $ISP_NAME\n"
    [ -n "$ISP_AS" ] && info="${info}${tr_as}: $ISP_AS\n"
    [ -n "$ISP_REGION" ] && info="${info}${tr_country}: $ISP_REGION, $ISP_COUNTRY\n"
    
    info="${info}\n${tr_method}: ${DETECTED_CONN_TYPE}\n\n"
    
    if [ "$DETECTED_CONN_TYPE" = "MAP-E" ] && [ -n "$MAPE_BR" ]; then
        if [ -n "$MAPE_GUA_PREFIX" ]; then
            info="${info}Type: GUA\n"
            info="${info}GUA Prefix: $MAPE_GUA_PREFIX\n"
        else
            info="${info}Type: PD\n"
        fi
        info="${info}${tr_br}: $MAPE_BR\n"
        [ -n "$MAPE_IPV4_PREFIX" ] && info="${info}${tr_ipv4_prefix}: $MAPE_IPV4_PREFIX/$MAPE_IPV4_PREFIXLEN\n"
        [ -n "$MAPE_IPV6_PREFIX" ] && info="${info}${tr_ipv6_prefix}: $MAPE_IPV6_PREFIX/$MAPE_IPV6_PREFIXLEN\n"
        [ -n "$MAPE_EALEN" ] && info="${info}${tr_ea_len}: $MAPE_EALEN\n"
        [ -n "$MAPE_PSIDLEN" ] && info="${info}${tr_psid_length}: $MAPE_PSIDLEN\n"
        info="${info}\n${tr_mape_notice}"
    elif [ "$DETECTED_CONN_TYPE" = "DS-Lite" ] && [ -n "$DSLITE_AFTR" ]; then
        info="${info}${tr_aftr}: $DSLITE_AFTR\n"
        info="${info}\n${tr_dslite_notice}"
    fi
    
    info="${info}\n\nUse this auto-detected configuration?"
    
    if whiptail --title "$(translate 'tr-internet-connection')" --yesno "$info" 22 70; then
        sed -i "/^connection_type=/d" "$SETUP_VARS"
        echo "connection_type='auto'" >> "$SETUP_VARS"
        return 0
    else
        return 1
    fi
}

whiptail_device_info() {
    local info="Model: $DEVICE_MODEL\n"
    info="${info}Target: $DEVICE_TARGET\n"
    info="${info}Version: $OPENWRT_VERSION\n"
    [ -n "$DEVICE_MEM" ] && info="${info}Memory: $DEVICE_MEM\n"
    [ -n "$DEVICE_CPU" ] && info="${info}CPU: $DEVICE_CPU\n"
    [ -n "$DEVICE_STORAGE" ] && info="${info}Storage: $DEVICE_STORAGE_USED/$DEVICE_STORAGE (${DEVICE_STORAGE_AVAIL} free)\n"
    [ -n "$DEVICE_USB" ] && info="${info}USB: $DEVICE_USB\n"
    whiptail --title "Device Information" --msgbox "$info" 15 70
}

whiptail_package_categories() {
    local menu_items="" i=1 cat_id cat_name
    
    while read cat_id; do
        cat_name=$(get_category_name "$cat_id")
        menu_items="$menu_items $i \"$cat_name\""
        i=$((i+1))
    done < <(get_categories)
    
    choice=$(eval "whiptail --title 'Package Categories' --menu 'Select category:' 20 70 12 $menu_items 3>&1 1>&2 2>&3")
    
    if [ -n "$choice" ]; then
        selected_cat=$(get_categories | sed -n "${choice}p")
        whiptail_package_selection "$selected_cat"
    fi
}

whiptail_package_selection() {
    local cat_id="$1"
    local cat_name=$(get_category_name "$cat_id")
    local cat_desc=$(get_category_desc "$cat_id")
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
    
    selected=$(eval "whiptail --title '$cat_name' --checklist '$cat_desc (Space=toggle):' 20 70 12 $checklist_items 3>&1 1>&2 2>&3")
    
    get_category_packages "$cat_id" | while read pkg_id; do
        sed -i "/^${pkg_id}$/d" "$SELECTED_PACKAGES"
    done
    
    for pkg in $selected; do
        pkg=$(echo "$pkg" | tr -d '"')
        echo "$pkg" >> "$SELECTED_PACKAGES"
    done
}

whiptail_review() {
    local review_text="=== DEVICE ===\nModel: $DEVICE_MODEL\nTarget: $DEVICE_TARGET\n\n"
    
    review_text="${review_text}=== PACKAGES ===\n"
    if [ -s "$SELECTED_PACKAGES" ]; then
        while read pkg; do
            review_text="${review_text}- $pkg\n"
        done < "$SELECTED_PACKAGES"
    else
        review_text="${review_text}(none)\n"
    fi
    
    review_text="${review_text}\n=== CONFIGURATION ===\n"
    if [ -s "$SETUP_VARS" ]; then
        while read line; do
            review_text="${review_text}$line\n"
        done < "$SETUP_VARS"
    else
        review_text="${review_text}(none)\n"
    fi
    
    if whiptail --title "Review Configuration" --yesno "$review_text\n\nGenerate files?" 22 70; then
        generate_config_files
        whiptail --msgbox "Configuration generated:\n\n- $OUTPUT_DIR/postinst\n- $OUTPUT_DIR/setup.sh\n\nReady for ASU server upload!" 12 60
    fi
}

simple_main_menu() {
    while true; do
        clear
        echo "========================================"
        echo "  OpenWrt Setup Tool v$VERSION"
        echo "  Device: $DEVICE_MODEL"
        echo "========================================"
        echo ""
        
        local i=1
        get_setup_categories | while read cat_id; do
            cat_title=$(get_setup_category_title "$cat_id")
            echo "$i) $cat_title"
            i=$((i+1))
        done
        
        local setup_cat_count=$(get_setup_categories | wc -l)
        local packages_label=$(translate "tr-custom-packages")
        echo "$((setup_cat_count+1))) $packages_label"
        echo "$((setup_cat_count+2))) Review & Generate"
        echo "q) Exit"
        echo ""
        printf "Choice: "
        read choice
        
        case "$choice" in
            q|Q) exit 0 ;;
            *)
                if [ "$choice" -le "$setup_cat_count" ]; then
                    selected_cat=$(get_setup_categories | sed -n "${choice}p")
                    simple_category_config "$selected_cat"
                elif [ "$choice" -eq "$((setup_cat_count+1))" ]; then
                    simple_package_menu
                elif [ "$choice" -eq "$((setup_cat_count+2))" ]; then
                    simple_review
                fi
                ;;
        esac
    done
}

process_category_items() {
    local cat_id="$1"
    local parent_items="$2"
    
    local items
    if [ -z "$parent_items" ]; then
        items=$(get_setup_category_items "$cat_id")
    else
        items="$parent_items"
    fi
    
    for item_id in $items; do
        should_show_item "$item_id" || continue
        
        local item_type=$(get_setup_item_type "$item_id")
        
        case "$item_type" in
            section)
                local nested=$(get_section_nested_items "$item_id")
                [ -n "$nested" ] && process_category_items "$cat_id" "$nested"
                ;;
                
            field)
                local label=$(get_setup_item_label "$item_id")
                local variable=$(get_setup_item_variable "$item_id")
                local default=$(get_setup_item_default "$item_id")
                local placeholder=$(get_setup_item_placeholder "$item_id")
                local fieldtype=$(get_setup_item_fieldtype "$item_id")
                
                local current=$(grep "^${variable}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                [ -z "$current" ] && current="$default"
                
                case "$item_id" in
                    aios-country) [ -z "$current" ] && current="${ISP_COUNTRY:-$default}" ;;
                    aios-timezone) [ -z "$current" ] && current="${AUTO_TIMEZONE:-$default}" ;;
                    aios-zonename) [ -z "$current" ] && current="${AUTO_ZONENAME:-$default}" ;;
                esac
                
                if [ "$fieldtype" = "select" ]; then
                    echo "$label:"
                    local options=$(get_setup_item_options "$item_id")
                    local i=1
                    for opt in $options; do
                        local opt_label=$(get_setup_item_option_label "$item_id" "$opt")
                        echo "  $i) $opt_label"
                        i=$((i+1))
                    done
                    printf "Choice: "
                    read value
                    if [ -n "$value" ]; then
                        selected_opt=$(echo "$options" | sed -n "${value}p")
                        sed -i "/^${variable}=/d" "$SETUP_VARS"
                        echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                    fi
                else
                    printf "$label [${current:-$placeholder}]: "
                    read value
                    [ -z "$value" ] && value="$current"
                    if [ -n "$value" ]; then
                        sed -i "/^${variable}=/d" "$SETUP_VARS"
                        echo "${variable}='${value}'" >> "$SETUP_VARS"
                    fi
                fi
                echo ""
                ;;
                
            radio-group)
                local label=$(get_setup_item_label "$item_id")
                local variable=$(get_setup_item_variable "$item_id")
                local default=$(get_setup_item_default "$item_id")
                
                local current=$(grep "^${variable}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                [ -z "$current" ] && current="$default"
                
                echo "$label:"
                local options=$(get_setup_item_options "$item_id")
                local i=1
                for opt in $options; do
                    local opt_label=$(get_setup_item_option_label "$item_id" "$opt")
                    echo "  $i) $opt_label"
                    i=$((i+1))
                done
                printf "Choice: "
                read value
                if [ -n "$value" ]; then
                    selected_opt=$(echo "$options" | sed -n "${value}p")
                    sed -i "/^${variable}=/d" "$SETUP_VARS"
                    echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                fi
                echo ""
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
                
                echo "$content"
                echo ""
                ;;
        esac
    done
}

simple_category_config() {
    local cat_id="$1"
    local cat_title=$(get_setup_category_title "$cat_id")
    
    clear
    echo "=== $cat_title ==="
    echo ""
    
    if [ "$cat_id" = "internet-connection" ]; then
        simple_show_network_info
    fi
    
    process_category_items "$cat_id"
    
    echo "Configuration completed! Press Enter..."
    read
}

simple_show_network_info() {
    local tr_auto_detection=$(translate "tr-auto-detection")
    local tr_method=$(translate "tr-method")
    local tr_isp=$(translate "tr-isp")
    local tr_as=$(translate "tr-as")
    local tr_country=$(translate "tr-country")
    local tr_br=$(translate "tr-br")
    local tr_ipv4_prefix=$(translate "tr-ipv4-prefix")
    local tr_ipv6_prefix=$(translate "tr-ipv6-prefix")
    local tr_ea_len=$(translate "tr-ea-len")
    local tr_psid_length=$(translate "tr-psid-length")
    local tr_aftr=$(translate "tr-dslite-aftr-ipv6-address")
    local tr_mape_notice=$(translate "tr-mape-notice1")
    local tr_dslite_notice=$(translate "tr-dslite-notice1")
    
    if [ -z "$DETECTED_CONN_TYPE" ] || [ "$DETECTED_CONN_TYPE" = "Unknown" ]; then
        return 1
    fi
    
    echo "=== ${tr_auto_detection} ==="
    echo ""
    [ -n "$ISP_NAME" ] && echo "${tr_isp}: $ISP_NAME"
    [ -n "$ISP_AS" ] && echo "${tr_as}: $ISP_AS"
    [ -n "$ISP_REGION" ] && echo "${tr_country}: $ISP_REGION, $ISP_COUNTRY"
    echo ""
    echo "${tr_method}: $DETECTED_CONN_TYPE"
    echo ""
    
    if [ "$DETECTED_CONN_TYPE" = "MAP-E" ] && [ -n "$MAPE_BR" ]; then
        echo "${tr_br}: $MAPE_BR"
        [ -n "$MAPE_IPV4_PREFIX" ] && echo "${tr_ipv4_prefix}: $MAPE_IPV4_PREFIX/$MAPE_IPV4_PREFIXLEN"
        [ -n "$MAPE_IPV6_PREFIX" ] && echo "${tr_ipv6_prefix}: $MAPE_IPV6_PREFIX/$MAPE_IPV6_PREFIXLEN"
        [ -n "$MAPE_EALEN" ] && echo "${tr_ea_len}: $MAPE_EALEN"
        [ -n "$MAPE_PSIDLEN" ] && echo "${tr_psid_length}: $MAPE_PSIDLEN"
        echo ""
        echo "${tr_mape_notice}"
    elif [ "$DETECTED_CONN_TYPE" = "DS-Lite" ] && [ -n "$DSLITE_AFTR" ]; then
        echo "${tr_aftr}: $DSLITE_AFTR"
        echo ""
        echo "${tr_dslite_notice}"
    fi
    
    echo ""
    printf "Use ${tr_auto_detection}? (y/n) [y]: "
    read use_auto
    
    if [ "$use_auto" != "n" ] && [ "$use_auto" != "N" ]; then
        sed -i "/^connection_type=/d" "$SETUP_VARS"
        echo "connection_type='auto'" >> "$SETUP_VARS"
    fi
    
    echo ""
    printf "Press Enter to continue..."
    read
    clear
    echo "=== $(get_setup_category_title 'internet-connection') ==="
    echo ""
}

simple_device_info() {
    clear
    echo "=== Device Information ==="
    echo ""
    echo "Model: $DEVICE_MODEL"
    echo "Target: $DEVICE_TARGET"
    echo "Version: $OPENWRT_VERSION"
    [ -n "$DEVICE_MEM" ] && echo "Memory: $DEVICE_MEM"
    [ -n "$DEVICE_CPU" ] && echo "CPU: $DEVICE_CPU"
    [ -n "$DEVICE_STORAGE" ] && echo "Storage: $DEVICE_STORAGE_USED/$DEVICE_STORAGE (${DEVICE_STORAGE_AVAIL} free)"
    [ -n "$DEVICE_USB" ] && echo "USB: $DEVICE_USB"
    echo ""
    printf "Press Enter to continue..."
    read
}

simple_package_menu() {
    if [ ! -f "$PACKAGES_JSON" ]; then
        echo ""
        echo "Error: packages.json not found!"
        printf "Press Enter to continue..."
        read
        return
    fi
    
    while true; do
        clear
        echo "=== Package Categories ==="
        echo ""
        
        local categories=$(get_categories)
        if [ -z "$categories" ]; then
            echo "Error: No categories found"
            printf "Press Enter to continue..."
            read
            return
        fi
        
        local i=1
        echo "$categories" | while read cat_id; do
            cat_name=$(get_category_name "$cat_id")
            echo "$i) $cat_name"
            i=$((i+1))
        done
        
        echo "b) Back"
        echo ""
        printf "Choice: "
        read choice
        
        case "$choice" in
            b|B) return ;;
            [0-9]*)
                selected_cat=$(echo "$categories" | sed -n "${choice}p")
                if [ -n "$selected_cat" ]; then
                    simple_package_selection "$selected_cat"
                fi
                ;;
        esac
    done
}

simple_package_selection() {
    local cat_id="$1"
    local cat_name=$(get_category_name "$cat_id")
    local cat_desc=$(get_category_desc "$cat_id")
    
    while true; do
        clear
        echo "=== $cat_name ==="
        echo "$cat_desc"
        echo ""
        
        local i=1
        get_category_packages "$cat_id" | while read pkg_id; do
            pkg_name=$(get_package_name "$pkg_id")
            [ -z "$pkg_name" ] && pkg_name="$pkg_id"
            
            if is_package_selected "$pkg_id"; then
                echo "$i) [X] $pkg_name"
            else
                echo "$i) [ ] $pkg_name"
            fi
            i=$((i+1))
        done
        
        echo ""
        echo "a) All  n) None  b) Back"
        printf "Choice (number to toggle): "
        read choice
        
        case "$choice" in
            b|B) return ;;
            a|A)
                get_category_packages "$cat_id" | while read pkg; do
                    if ! is_package_selected "$pkg"; then
                        echo "$pkg" >> "$SELECTED_PACKAGES"
                    fi
                done
                ;;
            n|N)
                get_category_packages "$cat_id" | while read pkg; do
                    sed -i "/^${pkg}$/d" "$SELECTED_PACKAGES"
                done
                ;;
            [0-9]*)
                selected_pkg=$(get_category_packages "$cat_id" | sed -n "${choice}p")
                if [ -n "$selected_pkg" ]; then
                    toggle_package "$selected_pkg"
                fi
                ;;
        esac
    done
}

simple_review() {
    clear
    echo "=== Configuration Review ==="
    echo ""
    echo "DEVICE:"
    echo "  Model: $DEVICE_MODEL"
    echo "  Target: $DEVICE_TARGET"
    echo ""
    echo "PACKAGES:"
    if [ -s "$SELECTED_PACKAGES" ]; then
        cat "$SELECTED_PACKAGES" | while read pkg; do
            echo "  - $pkg"
        done
    else
        echo "  (none)"
    fi
    
    echo ""
    echo "CONFIGURATION:"
    if [ -s "$SETUP_VARS" ]; then
        cat "$SETUP_VARS" | while read line; do
            echo "  $line"
        done
    else
        echo "  (none)"
    fi
    
    echo ""
    printf "Generate files? (y/n): "
    read confirm
    
    if [ "$confirm" = "y" -o "$confirm" = "Y" ]; then
        generate_config_files
        echo ""
        echo "Files generated:"
        echo "  - $OUTPUT_DIR/postinst"
        echo "  - $OUTPUT_DIR/setup.sh"
        echo ""
        echo "Ready for ASU server upload!"
    fi
    
    echo ""
    printf "Press Enter to continue..."
    read
}

apply_api_defaults() {
    [ -n "$AUTO_LANGUAGE" ] && ! grep -q "^language=" "$SETUP_VARS" 2>/dev/null && \
        echo "language='$AUTO_LANGUAGE'" >> "$SETUP_VARS"
    
    [ -n "$AUTO_TIMEZONE" ] && ! grep -q "^timezone=" "$SETUP_VARS" 2>/dev/null && \
        echo "timezone='$AUTO_TIMEZONE'" >> "$SETUP_VARS"
    
    [ -n "$AUTO_ZONENAME" ] && ! grep -q "^zonename=" "$SETUP_VARS" 2>/dev/null && \
        echo "zonename='$AUTO_ZONENAME'" >> "$SETUP_VARS"
    
    [ -n "$ISP_COUNTRY" ] && ! grep -q "^country=" "$SETUP_VARS" 2>/dev/null && \
        echo "country='$ISP_COUNTRY'" >> "$SETUP_VARS"
    
    if grep -q "^connection_type='auto'" "$SETUP_VARS" 2>/dev/null; then
        if [ "$DETECTED_CONN_TYPE" = "MAP-E" ] && [ -n "$MAPE_BR" ]; then
            sed -i "/^connection_type=/d" "$SETUP_VARS"
            echo "connection_type='mape'" >> "$SETUP_VARS"
            echo "mape_br='$MAPE_BR'" >> "$SETUP_VARS"
            [ -n "$MAPE_IPV4_PREFIX" ] && echo "mape_ipv4_prefix='$MAPE_IPV4_PREFIX'" >> "$SETUP_VARS"
            [ -n "$MAPE_IPV4_PREFIXLEN" ] && echo "mape_ipv4_prefixlen='$MAPE_IPV4_PREFIXLEN'" >> "$SETUP_VARS"
            [ -n "$MAPE_IPV6_PREFIX" ] && echo "mape_ipv6_prefix='$MAPE_IPV6_PREFIX'" >> "$SETUP_VARS"
            [ -n "$MAPE_IPV6_PREFIXLEN" ] && echo "mape_ipv6_prefixlen='$MAPE_IPV6_PREFIXLEN'" >> "$SETUP_VARS"
            [ -n "$MAPE_EALEN" ] && echo "mape_ealen='$MAPE_EALEN'" >> "$SETUP_VARS"
            [ -n "$MAPE_PSIDLEN" ] && echo "mape_psidlen='$MAPE_PSIDLEN'" >> "$SETUP_VARS"
            [ -n "$MAPE_PSID_OFFSET" ] && echo "mape_psid_offset='$MAPE_PSID_OFFSET'" >> "$SETUP_VARS"
        elif [ "$DETECTED_CONN_TYPE" = "DS-Lite" ] && [ -n "$DSLITE_AFTR" ]; then
            sed -i "/^connection_type=/d" "$SETUP_VARS"
            echo "connection_type='dslite'" >> "$SETUP_VARS"
            echo "dslite_aftr_address='$DSLITE_AFTR'" >> "$SETUP_VARS"
        fi
    fi
}

generate_config_files() {
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
            echo "PKGS=\"luci-i18n-base-${language} luci-i18n-firewall-${language}\""
            echo "[ \"\$PKG_MGR\" = \"opkg\" ] && opkg install \$PKGS"
            echo "[ \"\$PKG_MGR\" = \"apk\" ] && apk add \$PKGS"
            echo ""
        fi
        
        if [ -s "$SELECTED_PACKAGES" ]; then
            echo "# Selected packages"
            cat "$SELECTED_PACKAGES" | while read pkg; do
                echo "[ \"\$PKG_MGR\" = \"opkg\" ] && opkg install $pkg"
                echo "[ \"\$PKG_MGR\" = \"apk\" ] && apk add $pkg"
            done
        fi
        echo ""
        echo "exit 0"
    } > "$OUTPUT_DIR/postinst"
    chmod +x "$OUTPUT_DIR/postinst"
    
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

get_extended_device_info() {
    if [ -f /etc/board.json ]; then
        DEVICE_MODEL=$(jsonfilter -i /etc/board.json -e '@.model.name' 2>/dev/null)
        DEVICE_ID=$(jsonfilter -i /etc/board.json -e '@.model.id' 2>/dev/null)
        
        if [ -f /etc/openwrt_release ]; then
            . /etc/openwrt_release
            DEVICE_TARGET="${DISTRIB_TARGET:-unknown/unknown}"
            OPENWRT_VERSION="${DISTRIB_RELEASE:-unknown}"
        fi
    fi
    
    echo "Fetching ISP information from $AUTO_CONFIG_URL..."
    if wget -q -O "$AUTO_CONFIG_JSON" "$AUTO_CONFIG_URL" 2>/dev/null; then
        echo "Successfully downloaded auto-config data"
        
        if [ -f "$AUTO_CONFIG_JSON" ]; then
            echo "=== AUTO_CONFIG_JSON CONTENT ===" >> /tmp/debug.log
            cat "$AUTO_CONFIG_JSON" >> /tmp/debug.log
            echo "================================" >> /tmp/debug.log
            
            ISP_NAME=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.isp' 2>/dev/null)
            ISP_AS=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.as' 2>/dev/null)
            ISP_IPV6=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.ipv6' 2>/dev/null)
            ISP_COUNTRY=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.country' 2>/dev/null)
            ISP_REGION=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.regionName' 2>/dev/null)
            AUTO_LANGUAGE=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.language' 2>/dev/null)
            AUTO_TIMEZONE=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.timezone' 2>/dev/null)
            AUTO_ZONENAME=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.zonename' 2>/dev/null)
            
            MAPE_BR=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.brIpv6Address' 2>/dev/null)
            MAPE_IPV4_PREFIX=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.ipv4Prefix' 2>/dev/null)
            MAPE_IPV4_PREFIXLEN=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.ipv4PrefixLength' 2>/dev/null)
            MAPE_IPV6_PREFIX=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.ipv6Prefix' 2>/dev/null)
            MAPE_IPV6_PREFIXLEN=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.ipv6PrefixLength' 2>/dev/null)
            MAPE_EALEN=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.eaBitLength' 2>/dev/null)
            MAPE_PSIDLEN=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.psidlen' 2>/dev/null)
            MAPE_PSID_OFFSET=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.psIdOffset' 2>/dev/null)
            MAPE_GUA_PREFIX=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.guaPrefix' 2>/dev/null)
            
            echo "DEBUG: MAPE_GUA_PREFIX='$MAPE_GUA_PREFIX'" >> /tmp/debug.log
            
            DSLITE_AFTR=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.aftr' 2>/dev/null)
            
            if [ -n "$MAPE_BR" ]; then
                DETECTED_CONN_TYPE="MAP-E"
            elif [ -n "$DSLITE_AFTR" ]; then
                DETECTED_CONN_TYPE="DS-Lite"
            else
                DETECTED_CONN_TYPE="Unknown"
            fi
        else
            DETECTED_CONN_TYPE="Unknown"
        fi
    else
        echo "Warning: Failed to download auto-config data"
        DETECTED_CONN_TYPE="Unknown"
    fi
    
    DEVICE_MEM=$(awk '/MemTotal/{printf "%.0f MB", $2/1024}' /proc/meminfo 2>/dev/null)
    DEVICE_CPU=$(grep -m1 "model name" /proc/cpuinfo | cut -d: -f2 | xargs 2>/dev/null)
    [ -z "$DEVICE_CPU" ] && DEVICE_CPU=$(grep -m1 "Hardware" /proc/cpuinfo | cut -d: -f2 | xargs 2>/dev/null)
    
    [ -z "$DEVICE_MODEL" ] && DEVICE_MODEL="Unknown Device"
    [ -z "$DEVICE_TARGET" ] && DEVICE_TARGET="unknown/unknown"
    [ -z "$OPENWRT_VERSION" ] && OPENWRT_VERSION="unknown"

    DEVICE_STORAGE=$(df -h / | awk 'NR==2 {print $2}')
    DEVICE_STORAGE_USED=$(df -h / | awk 'NR==2 {print $3}')
    DEVICE_STORAGE_AVAIL=$(df -h / | awk 'NR==2 {print $4}')
    
    if [ -d /sys/bus/usb/devices ]; then
        DEVICE_USB="Available"
    else
        DEVICE_USB="Not available"
    fi
}

aios_light_main() {
    clear
    echo "========================================"
    echo "  OpenWrt Device Setup Tool v$VERSION"
    echo "========================================"
    echo ""
    
    detect_package_manager
    echo "Package manager: $PKG_MGR"
    echo ""
    
    init
    
    echo "Detecting device information..."
    get_extended_device_info
    
    echo ""
    echo "Device: $DEVICE_MODEL"
    echo "Target: $DEVICE_TARGET"
    echo "Version: $OPENWRT_VERSION"
    [ -n "$DEVICE_MEM" ] && echo "Memory: $DEVICE_MEM"
    [ -n "$DEVICE_CPU" ] && echo "CPU: $DEVICE_CPU"
    [ -n "$ISP_NAME" ] && echo "ISP: $ISP_NAME ($ISP_AS)"
    [ -n "$DETECTED_CONN_TYPE" ] && echo "Detected: $DETECTED_CONN_TYPE"
    [ -n "$AUTO_LANGUAGE" ] && echo "Language: $AUTO_LANGUAGE"
    echo ""
    
    echo "Downloading language file..."
    if ! download_language_json "${AUTO_LANGUAGE:-en}"; then
        echo "Warning: Using English as fallback language"
    fi
    
    echo "Downloading setup.json..."
    if ! download_setup_json; then
        echo "Error: Failed to download setup.json"
        echo "Cannot continue without setup.json"
        exit 1
    fi
    
    echo "Downloading packages.json..."
    if ! download_packages; then
        echo "Warning: Failed to download packages.json"
        echo "Package selection will not be available."
        sleep 2
    fi
    
    echo "Loading default packages..."
    load_default_packages
    
    echo ""
    
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
