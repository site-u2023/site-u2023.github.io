#!/bin/sh
# OpenWrt Device Setup Tool - CLI Version
# ASU (Attended SysUpgrade) Compatible
# Supports: whiptail (TUI) with fallback to simple menu

VERSION="1.0.0"
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

# Translation cache
TRANSLATION_CACHE="$CONFIG_DIR/translation_cache.txt"

# Package manager detection
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

# Install package helper
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
                echo "$(translate 'tr-ui-install-success')"
                UI_MODE="whiptail"
            else
                echo "$(translate 'tr-ui-install-failed')"
                UI_MODE="simple"
            fi
        else
            UI_MODE="whiptail"
        fi
    fi
}

# Initialize
init() {
    mkdir -p "$CONFIG_DIR"
    : > "$SELECTED_PACKAGES"
    : > "$SETUP_VARS"
    : > "$TRANSLATION_CACHE"
    # Remove old language file to ensure fresh download
    rm -f "$LANG_JSON"
}

# Download language JSON
download_language_json() {
    local lang="${1:-en}"
    local lang_url="$BASE_URL/www/langs/custom.${lang}.json"
    
    # Always download to ensure we have the correct language
    echo "Fetching language: ${lang}"
    if ! wget -q -O "$LANG_JSON" "$lang_url"; then
        echo "Warning: Failed to download language file for '${lang}'"
        # Try fallback to English
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

# Translate text using tr- prefix class
translate() {
    local key="$1"
    
    # Check cache first
    local cached=$(grep "^${key}=" "$TRANSLATION_CACHE" 2>/dev/null | cut -d= -f2-)
    if [ -n "$cached" ]; then
        echo "$cached"
        return 0
    fi
    
    # Get translation from JSON
    if [ -f "$LANG_JSON" ]; then
        local translation=$(jsonfilter -i "$LANG_JSON" -e "@['$key']" 2>/dev/null)
        if [ -n "$translation" ]; then
            echo "${key}=${translation}" >> "$TRANSLATION_CACHE"
            echo "$translation"
            return 0
        fi
    fi
    
    # Return key if no translation found
    echo "$key"
    return 1
}

# Download setup.json
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

# Download packages.json
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

# Get device info from URL or board
get_device_info() {
    if [ -f /etc/board.json ]; then
        DEVICE_MODEL=$(jsonfilter -i /etc/board.json -e '@.model.name' 2>/dev/null)
        DEVICE_TARGET=$(jsonfilter -i /etc/board.json -e '@.target' 2>/dev/null)
    fi
    
    [ -z "$DEVICE_MODEL" ] && DEVICE_MODEL="Unknown"
    [ -z "$DEVICE_TARGET" ] && DEVICE_TARGET="unknown/unknown"
}

# Setup.json helpers
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

get_setup_category_class() {
    jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$1'].class" 2>/dev/null
}

get_setup_category_items() {
    jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$1'].items[*].id" 2>/dev/null | grep -v '^$'
}

get_setup_item_type() {
    jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$1'].type" 2>/dev/null | head -1
}

get_setup_item_label() {
    local cat_idx=0
    local item_idx=0
    
    for cat_id in $(get_setup_categories); do
        local items=$(get_setup_category_items "$cat_id")
        local idx=0
        for itm in $items; do
            if [ "$itm" = "$1" ]; then
                item_idx=$idx
                break 2
            fi
            idx=$((idx+1))
        done
        cat_idx=$((cat_idx+1))
    done
    
    local label=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[$cat_idx].items[$item_idx].label" 2>/dev/null)
    local class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[$cat_idx].items[$item_idx].class" 2>/dev/null)
    
    if [ -n "$class" ] && [ "${class#tr-}" != "$class" ]; then
        translate "$class"
    else
        echo "$label"
    fi
}

get_setup_item_variable() {
    jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$1'].variable" 2>/dev/null | head -1
}

get_setup_item_default() {
    jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$1'].default" 2>/dev/null | head -1
}

get_setup_item_placeholder() {
    jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$1'].placeholder" 2>/dev/null | head -1
}

get_setup_item_fieldtype() {
    jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$1'].fieldType" 2>/dev/null | head -1
}

get_setup_item_options() {
    local item_id="$1"
    local cat_idx=0
    local item_idx=0
    
    # Find the category and item indices
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
    
    jsonfilter -i "$SETUP_JSON" -e "@.categories[$cat_idx].items[$item_idx].options[*].value" 2>/dev/null
}

get_setup_item_option_label() {
    local item_id="$1"
    local value="$2"
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
    
    local label=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[$cat_idx].items[$item_idx].options[@.value='$value'].label" 2>/dev/null)
    local class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[$cat_idx].items[$item_idx].options[@.value='$value'].class" 2>/dev/null)
    
    if [ -n "$class" ] && [ "${class#tr-}" != "$class" ]; then
        translate "$class"
    else
        echo "$label"
    fi
}

# Packages.json helpers
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

# Load default checked packages
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

# ========== WHIPTAIL UI ==========

whiptail_main_menu() {
    while true; do
        local menu_items="" i=1 cat_id cat_title
        
        while read cat_id; do
            cat_title=$(get_setup_category_title "$cat_id")
            menu_items="$menu_items $i \"$cat_title\""
            i=$((i+1))
        done < <(get_setup_categories)
        
        # Fixed menu items
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
        
        # Calculate what was selected
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
    local items=$(get_setup_category_items "$cat_id")
    
    # Show network information if this is internet-connection category
    if [ "$cat_id" = "internet-connection" ]; then
        whiptail_show_network_info
    fi
    
    for item_id in $items; do
        local item_type=$(get_setup_item_type "$item_id")
        local label=$(get_setup_item_label "$item_id")
        local variable=$(get_setup_item_variable "$item_id")
        local default=$(get_setup_item_default "$item_id")
        local placeholder=$(get_setup_item_placeholder "$item_id")
        local fieldtype=$(get_setup_item_fieldtype "$item_id")
        
        # Get current value or use default
        local current=$(grep "^${variable}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
        [ -z "$current" ] && current="$default"
        
        # Handle API source defaults
        case "$item_id" in
            aios-country) [ -z "$current" ] && current="${ISP_COUNTRY:-$default}" ;;
            aios-timezone) [ -z "$current" ] && current="${AUTO_TIMEZONE:-$default}" ;;
            aios-zonename) [ -z "$current" ] && current="${AUTO_ZONENAME:-$default}" ;;
        esac
        
        case "$item_type" in
            field)
                if [ "$fieldtype" = "select" ]; then
                    local options=$(get_setup_item_options "$item_id")
                    local menu_opts=""
                    local i=1
                    for opt in $options; do
                        local opt_label=$(get_setup_item_option_label "$item_id" "$opt")
                        menu_opts="$menu_opts $i \"$opt_label\""
                        i=$((i+1))
                    done
                    value=$(eval "whiptail --title '$cat_title' --menu '$label:' 18 60 10 $menu_opts 3>&1 1>&2 2>&3")
                    if [ -n "$value" ]; then
                        selected_opt=$(echo "$options" | sed -n "${value}p")
                        sed -i "/^${variable}=/d" "$SETUP_VARS"
                        echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                    fi
                else
                    value=$(whiptail --inputbox "$label:" 10 60 "$current" 3>&1 1>&2 2>&3)
                    if [ -n "$value" ]; then
                        sed -i "/^${variable}=/d" "$SETUP_VARS"
                        echo "${variable}='${value}'" >> "$SETUP_VARS"
                    fi
                fi
                ;;
            radio-group)
                local options=$(get_setup_item_options "$item_id")
                local menu_opts=""
                local i=1
                for opt in $options; do
                    local opt_label=$(get_setup_item_option_label "$item_id" "$opt")
                    menu_opts="$menu_opts $i \"$opt_label\""
                    i=$((i+1))
                done
                value=$(eval "whiptail --title '$cat_title' --menu '$label:' 18 60 10 $menu_opts 3>&1 1>&2 2>&3")
                if [ -n "$value" ]; then
                    selected_opt=$(echo "$options" | sed -n "${value}p")
                    sed -i "/^${variable}=/d" "$SETUP_VARS"
                    echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                fi
                ;;
        esac
    done
    
    whiptail --msgbox "Settings saved!" 8 40
}

whiptail_show_network_info() {
    local tr_auto_detection=$(translate "tr-auto-detection")
    local tr_method=$(translate "tr-method")
    local tr_isp=$(translate "tr-isp")
    local tr_as=$(translate "tr-as")
    local tr_country=$(translate "tr-country")
    local tr_notice=$(translate "tr-notice")
    local tr_dslite_notice=$(translate "tr-dslite-notice1")
    
    local info="${tr_auto_detection}: ${DETECTED_CONN_TYPE:-Unknown}\n\n"
    [ -n "$ISP_NAME" ] && info="${info}${tr_isp}: $ISP_NAME\n"
    [ -n "$ISP_AS" ] && info="${info}${tr_as}: $ISP_AS\n"
    [ -n "$ISP_REGION" ] && info="${info}${tr_country}: $ISP_REGION, $ISP_COUNTRY\n"
    
    if [ -n "$DETECTED_CONN_TYPE" ] && [ "$DETECTED_CONN_TYPE" != "Unknown" ]; then
        info="${info}\n${tr_method}: ${DETECTED_CONN_TYPE}\n\n"
        
        # Show detected parameters based on connection type
        if [ "$DETECTED_CONN_TYPE" = "MAP-E" ] && [ -n "$MAPE_BR" ]; then
            info="${info}BR: $MAPE_BR\n"
            [ -n "$MAPE_IPV4_PREFIX" ] && info="${info}IPv4: $MAPE_IPV4_PREFIX/$MAPE_IPV4_PREFIXLEN\n"
            [ -n "$MAPE_IPV6_PREFIX" ] && info="${info}IPv6: $MAPE_IPV6_PREFIX/$MAPE_IPV6_PREFIXLEN\n"
            [ -n "$MAPE_EALEN" ] && info="${info}EA-len: $MAPE_EALEN\n"
            [ -n "$MAPE_PSIDLEN" ] && info="${info}PSID-len: $MAPE_PSIDLEN\n"
        elif [ "$DETECTED_CONN_TYPE" = "DS-Lite" ] && [ -n "$DSLITE_AFTR" ]; then
            local tr_aftr=$(translate "tr-dslite-aftr-ipv6-address")
            info="${info}${tr_aftr}: $DSLITE_AFTR\n"
        fi
        
        info="${info}\n${tr_notice}: ${tr_dslite_notice}\n\n"
        info="${info}$(translate 'tr-auto-detection')を使用しますか？"
        
        if whiptail --title "$(translate 'tr-internet-connection')" --yesno "$info" 22 70; then
            # User accepted AUTO detection - set to auto mode
            sed -i "/^connection_type=/d" "$SETUP_VARS"
            echo "connection_type='auto'" >> "$SETUP_VARS"
            return 0
        else
            # User wants to configure manually
            return 1
        fi
    else
        info="${info}\n接続タイプを検出できませんでした。\n手動で選択してください。"
        whiptail --title "$(translate 'tr-internet-connection')" --msgbox "$info" 15 70
        return 1
    fi
}

whiptail_device_info() {
    local info="Model: $DEVICE_MODEL\n"
    info="${info}Target: $DEVICE_TARGET\n"
    info="${info}Version: $OPENWRT_VERSION\n"
    [ -n "$DEVICE_MEM" ] && info="${info}Memory: $DEVICE_MEM\n"
    [ -n "$DEVICE_CPU" ] && info="${info}CPU: $DEVICE_CPU\n"
    
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
    
    # Update selection for this category
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

# ========== SIMPLE FALLBACK UI ==========

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

simple_category_config() {
    local cat_id="$1"
    local cat_title=$(get_setup_category_title "$cat_id")
    
    clear
    echo "=== $cat_title ==="
    echo ""
    
    # Show network information if this is internet-connection category
    if [ "$cat_id" = "internet-connection" ]; then
        simple_show_network_info
    fi
    
    local items=$(get_setup_category_items "$cat_id")
    for item_id in $items; do
        local item_type=$(get_setup_item_type "$item_id")
        local label=$(get_setup_item_label "$item_id")
        local variable=$(get_setup_item_variable "$item_id")
        local default=$(get_setup_item_default "$item_id")
        local placeholder=$(get_setup_item_placeholder "$item_id")
        local fieldtype=$(get_setup_item_fieldtype "$item_id")
        
        # Get current value
        local current=$(grep "^${variable}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
        [ -z "$current" ] && current="$default"
        
        # Handle API source defaults
        case "$item_id" in
            aios-country) [ -z "$current" ] && current="${ISP_COUNTRY:-$default}" ;;
            aios-timezone) [ -z "$current" ] && current="${AUTO_TIMEZONE:-$default}" ;;
            aios-zonename) [ -z "$current" ] && current="${AUTO_ZONENAME:-$default}" ;;
        esac
        
        case "$item_type" in
            field)
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
                ;;
            radio-group)
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
                ;;
        esac
        echo ""
    done
    
    echo "Settings saved! Press Enter..."
    read
}

simple_show_network_info() {
    local tr_auto_detection=$(translate "tr-auto-detection")
    local tr_method=$(translate "tr-method")
    local tr_isp=$(translate "tr-isp")
    local tr_as=$(translate "tr-as")
    local tr_country=$(translate "tr-country")
    local tr_notice=$(translate "tr-notice")
    local tr_dslite_notice=$(translate "tr-dslite-notice1")
    
    echo "=== ${tr_auto_detection} ==="
    echo ""
    [ -n "$ISP_NAME" ] && echo "${tr_isp}: $ISP_NAME"
    [ -n "$ISP_AS" ] && echo "${tr_as}: $ISP_AS"
    [ -n "$ISP_REGION" ] && echo "${tr_country}: $ISP_REGION, $ISP_COUNTRY"
    
    if [ -n "$DETECTED_CONN_TYPE" ] && [ "$DETECTED_CONN_TYPE" != "Unknown" ]; then
        echo ""
        echo "${tr_method}: $DETECTED_CONN_TYPE"
        echo ""
        
        # Show detected parameters based on connection type
        if [ "$DETECTED_CONN_TYPE" = "MAP-E" ] && [ -n "$MAPE_BR" ]; then
            echo "BR: $MAPE_BR"
            [ -n "$MAPE_IPV4_PREFIX" ] && echo "IPv4: $MAPE_IPV4_PREFIX/$MAPE_IPV4_PREFIXLEN"
            [ -n "$MAPE_IPV6_PREFIX" ] && echo "IPv6: $MAPE_IPV6_PREFIX/$MAPE_IPV6_PREFIXLEN"
            [ -n "$MAPE_EALEN" ] && echo "EA-len: $MAPE_EALEN"
            [ -n "$MAPE_PSIDLEN" ] && echo "PSID-len: $MAPE_PSIDLEN"
        elif [ "$DETECTED_CONN_TYPE" = "DS-Lite" ] && [ -n "$DSLITE_AFTR" ]; then
            local tr_aftr=$(translate "tr-dslite-aftr-ipv6-address")
            echo "${tr_aftr}: $DSLITE_AFTR"
        fi
        
        echo ""
        echo "${tr_notice}: ${tr_dslite_notice}"
        echo ""
        printf "この$(translate 'tr-auto-detection')結果を使用しますか? (y/n) [y]: "
        read use_auto
        
        if [ "$use_auto" != "n" ] && [ "$use_auto" != "N" ]; then
            sed -i "/^connection_type=/d" "$SETUP_VARS"
            echo "connection_type='auto'" >> "$SETUP_VARS"
            echo ""
            echo "自動検出を使用します。"
        else
            echo ""
            echo "手動で設定してください。"
        fi
    else
        echo ""
        echo "接続タイプを検出できませんでした。"
        echo "手動で選択してください。"
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

# ========== COMMON FUNCTIONS ==========

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
}

# ========== MAIN ==========

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
    
    # FIRST: Get device and ISP information to retrieve AUTO_LANGUAGE
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
    
    # SECOND: Download language file based on AUTO_LANGUAGE
    echo "Downloading language file..."
    if ! download_language_json "${AUTO_LANGUAGE:-en}"; then
        echo "Warning: Using English as fallback language"
    fi
    
    # THIRD: Download setup.json
    echo "Downloading setup.json..."
    if ! download_setup_json; then
        echo "Error: Failed to download setup.json"
        echo "Cannot continue without setup.json"
        exit 1
    fi
    
    # FOURTH: Download packages.json
    echo "Downloading packages.json..."
    if ! download_packages; then
        echo "Warning: Failed to download packages.json"
        echo "Package selection will not be available."
        sleep 2
    fi
    
    echo "Loading default packages..."
    load_default_packages
    
    echo ""
    
    # NOW we can safely call select_ui_mode with translations available
    select_ui_mode
    
    # Show device information screen first
    if [ "$UI_MODE" = "whiptail" ]; then
        whiptail_device_info
        whiptail_main_menu
    else
        simple_device_info
        simple_main_menu
    fi
}

aios_light_main
