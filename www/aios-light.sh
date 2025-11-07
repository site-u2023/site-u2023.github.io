#!/bin/sh
# OpenWrt Device Setup Tool - JSON-driven CLI Version
# ASU (Attended SysUpgrade) Compatible

VERSION="1.0.0"
BASE_URL="https://site-u.pages.dev"
SETUP_JSON_URL="$BASE_URL/www/uci-defaults/setup.json"
PACKAGES_URL="$BASE_URL/www/packages/packages.json"
SETUP_TEMPLATE_URL="$BASE_URL/www/uci-defaults/setup.sh"
AUTO_CONFIG_URL="https://auto-config.site-u.workers.dev/"
LANG_EN_URL="$BASE_URL/www/langs/custom.en.json"
LANG_JA_URL="$BASE_URL/www/langs/custom.ja.json"

CONFIG_DIR="/tmp/device-setup"
SETUP_JSON="$CONFIG_DIR/setup.json"
LANG_JSON="$CONFIG_DIR/lang.json"
PACKAGES_JSON="$CONFIG_DIR/packages.json"
AUTO_CONFIG_JSON="$CONFIG_DIR/auto_config.json"
SELECTED_PACKAGES="$CONFIG_DIR/selected_packages.txt"
SETUP_VARS="$CONFIG_DIR/setup_vars.sh"
OUTPUT_DIR="/tmp"

# Language setting (default: en)
LANG="en"

# Package manager detection
PKG_MGR=""
detect_package_manager() {
    if command -v opkg >/dev/null 2>&1; then
        PKG_MGR="opkg"
    elif command -v apk >/dev/null 2>&1; then
        PKG_MGR="apk"
    else
        PKG_MGR="none"
    fi
}

install_package() {
    case "$PKG_MGR" in
        opkg) opkg update >/dev/null 2>&1; opkg install "$@" ;;
        apk) apk update >/dev/null 2>&1; apk add "$@" ;;
        *) return 1 ;;
    esac
}

# UI mode
UI_MODE=""
select_ui_mode() {
    if command -v whiptail >/dev/null 2>&1; then
        echo "whiptail detected"
        echo ""
        echo "Select UI mode:"
        echo "1) whiptail (TUI)"
        echo "2) simple (text)"
        printf "Choice [1]: "
        read choice
        [ "$choice" = "2" ] && UI_MODE="simple" || UI_MODE="whiptail"
    else
        echo "Install whiptail? (1=Yes, 2=No) [2]: "
        read choice
        if [ "$choice" = "1" ]; then
            if install_package whiptail newt; then
                UI_MODE="whiptail"
            else
                UI_MODE="simple"
            fi
        else
            UI_MODE="simple"
        fi
    fi
}

# Initialize
init() {
    mkdir -p "$CONFIG_DIR"
    : > "$SELECTED_PACKAGES"
    : > "$SETUP_VARS"
}

# Download files
download_files() {
    echo "Downloading setup configuration..."
    wget -q -O "$SETUP_JSON" "$SETUP_JSON_URL" || return 1
    
    echo "Downloading packages database..."
    wget -q -O "$PACKAGES_JSON" "$PACKAGES_URL" || return 1
    
    # Download language file based on detected country
    if [ "$ISP_COUNTRY" = "JP" ]; then
        LANG="ja"
        wget -q -O "$LANG_JSON" "$LANG_JA_URL" || wget -q -O "$LANG_JSON" "$LANG_EN_URL"
    else
        LANG="en"
        wget -q -O "$LANG_JSON" "$LANG_EN_URL"
    fi
    
    return 0
}

# Get translated text
tr() {
    local key="$1"
    local text=$(jsonfilter -i "$LANG_JSON" -e "@['tr-$key']" 2>/dev/null)
    [ -z "$text" ] && text="$key"
    echo "$text"
}

# JSON helpers for packages
get_package_categories() {
    jsonfilter -i "$PACKAGES_JSON" -e '@.categories[*].id' 2>/dev/null | grep -v '^$'
}

get_package_category_name() {
    jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$1'].name" 2>/dev/null
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
    get_package_categories | while read cat_id; do
        get_category_packages "$cat_id" | while read pkg_id; do
            [ "$(get_package_checked "$pkg_id")" = "true" ] && echo "$pkg_id" >> "$SELECTED_PACKAGES"
        done
    done
}

# JSON helpers for setup configuration
get_categories() {
    jsonfilter -i "$SETUP_JSON" -e '@.categories[*].id' 2>/dev/null | grep -v '^$'
}

get_category_title() {
    local cat_id="$1"
    local class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].class" 2>/dev/null)
    [ -n "$class" ] && tr "${class#tr-}" || echo "$cat_id"
}

get_category_items() {
    jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$1'].items[*].id" 2>/dev/null | grep -v '^$'
}

get_item_type() {
    local cat_id="$1" item_id="$2"
    jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].items[@.id='$item_id'].type" 2>/dev/null
}

get_item_label() {
    local cat_id="$1" item_id="$2"
    local class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].items[@.id='$item_id'].class" 2>/dev/null)
    [ -n "$class" ] && tr "${class#tr-}" || echo "$item_id"
}

get_item_variable() {
    local cat_id="$1" item_id="$2"
    jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].items[@.id='$item_id'].variable" 2>/dev/null
}

get_item_default() {
    local cat_id="$1" item_id="$2"
    jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].items[@.id='$item_id'].default" 2>/dev/null
}

get_item_placeholder() {
    local cat_id="$1" item_id="$2"
    jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].items[@.id='$item_id'].placeholder" 2>/dev/null
}

get_item_field_type() {
    local cat_id="$1" item_id="$2"
    jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].items[@.id='$item_id'].fieldType" 2>/dev/null
}

# Get radio-group options
get_radio_options() {
    local cat_id="$1" item_id="$2"
    jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].items[@.id='$item_id'].options[*].value" 2>/dev/null | grep -v '^$'
}

get_radio_option_label() {
    local cat_id="$1" item_id="$2" value="$3"
    local class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].items[@.id='$item_id'].options[@.value='$value'].class" 2>/dev/null)
    [ -n "$class" ] && tr "${class#tr-}" || echo "$value"
}

# Settings helper
save_setting() {
    sed -i "/^${1}=/d" "$SETUP_VARS"
    [ -n "$2" ] && echo "${1}='${2}'" >> "$SETUP_VARS"
}

# ========== UI ABSTRACTION ==========

show_menu() {
    local title="$1"
    shift
    
    if [ "$UI_MODE" = "whiptail" ]; then
        local items=""
        while [ $# -gt 0 ]; do
            items="$items \"$1\" \"$2\""
            shift 2
        done
        eval "whiptail --title 'OpenWrt Setup v$VERSION' --menu '$title' 18 60 10 $items 3>&1 1>&2 2>&3"
    else
        clear
        echo "========================================"
        echo "  $title"
        echo "========================================"
        echo ""
        while [ $# -gt 0 ]; do
            echo "$1) $2"
            shift 2
        done
        echo ""
        printf "Choice: "
        read choice
        echo "$choice"
    fi
}

show_msgbox() {
    local title="$1"
    local msg="$2"
    
    if [ "$UI_MODE" = "whiptail" ]; then
        whiptail --title "$title" --msgbox "$msg" 20 70
    else
        clear
        echo "=== $title ==="
        echo ""
        echo "$msg"
        echo ""
        printf "Press Enter..."
        read
    fi
}

show_yesno() {
    local title="$1"
    local msg="$2"
    
    if [ "$UI_MODE" = "whiptail" ]; then
        whiptail --title "$title" --yesno "$msg" 18 70
        return $?
    else
        clear
        echo "=== $title ==="
        echo ""
        echo "$msg"
        echo ""
        printf "Continue? (y/n): "
        read answer
        [ "$answer" = "y" -o "$answer" = "Y" ]
        return $?
    fi
}

get_input() {
    local prompt="$1"
    local default="$2"
    local result
    
    if [ "$UI_MODE" = "whiptail" ]; then
        result=$(whiptail --inputbox "$prompt" 10 60 "$default" 3>&1 1>&2 2>&3)
    else
        printf "$prompt"
        [ -n "$default" ] && printf " [default: $default]"
        printf ": "
        read result
        [ -z "$result" ] && result="$default"
    fi
    echo "$result"
}

get_password() {
    local prompt="$1"
    local result
    
    if [ "$UI_MODE" = "whiptail" ]; then
        result=$(whiptail --passwordbox "$prompt" 10 60 3>&1 1>&2 2>&3)
    else
        printf "$prompt: "
        read -s result
        echo "" >&2
    fi
    echo "$result"
}

show_checklist() {
    local title="$1"
    local desc="$2"
    shift 2
    
    if [ "$UI_MODE" = "whiptail" ]; then
        local items=""
        while [ $# -gt 0 ]; do
            items="$items \"$1\" \"$2\" $3"
            shift 3
        done
        eval "whiptail --title '$title' --checklist '$desc' 20 70 12 $items 3>&1 1>&2 2>&3"
    else
        clear
        echo "=== $title ==="
        echo "$desc"
        echo ""
        local i=1
        local -a pkg_list
        while [ $# -gt 0 ]; do
            local status=" "
            [ "$3" = "ON" ] && status="X"
            echo "$i) [$status] $2"
            pkg_list[$i]="$1"
            i=$((i+1))
            shift 3
        done
        echo ""
        echo "a) All  n) None  b) Back"
        printf "Choice: "
        read choice
        
        case "$choice" in
            b|B) return 1 ;;
            a|A) for pkg in "${pkg_list[@]}"; do echo "\"$pkg\""; done ;;
            n|N) echo "" ;;
            [0-9]*) echo "\"${pkg_list[$choice]}\"" ;;
        esac
    fi
}

# ========== SCREENS ==========

screen_device_info() {
    local info="Model: $DEVICE_MODEL
Target: $DEVICE_TARGET
Version: $OPENWRT_VERSION"
    [ -n "$DEVICE_MEM" ] && info="$info
Memory: $DEVICE_MEM"
    [ -n "$DEVICE_CPU" ] && info="$info
CPU: $DEVICE_CPU"
    [ -n "$ISP_NAME" ] && info="$info

ISP: $ISP_NAME ($ISP_AS)"
    [ -n "$ISP_REGION" ] && info="$info
Region: $ISP_REGION, $ISP_COUNTRY"
    [ -n "$DETECTED_CONN_TYPE" ] && info="$info
Detected: $DETECTED_CONN_TYPE"
    
    show_msgbox "$(tr 'extended-info')" "$info"
}

screen_packages() {
    local menu_items=""
    local i=1
    
    while read cat_id; do
        cat_name=$(get_package_category_name "$cat_id")
        menu_items="$menu_items $i \"$cat_name\""
        i=$((i+1))
    done < <(get_package_categories)
    
    while true; do
        choice=$(eval "show_menu '$(tr 'custom-packages')' $menu_items b '$(tr 'feedback-link')'")
        [ "$choice" = "b" -o -z "$choice" ] && return
        
        selected_cat=$(get_package_categories | sed -n "${choice}p")
        [ -n "$selected_cat" ] && screen_package_selection "$selected_cat"
    done
}

screen_package_selection() {
    local cat_id="$1"
    local cat_name=$(get_package_category_name "$cat_id")
    
    while true; do
        local checklist_items=""
        
        get_category_packages "$cat_id" | while read pkg_id; do
            pkg_name=$(get_package_name "$pkg_id")
            [ -z "$pkg_name" ] && pkg_name="$pkg_id"
            
            if is_package_selected "$pkg_id"; then
                status="ON"
            else
                status="OFF"
            fi
            
            checklist_items="$checklist_items $pkg_id \"$pkg_name\" $status"
        done
        
        selected=$(eval "show_checklist '$cat_name' '$(tr 'package-search')' $checklist_items")
        
        if [ "$UI_MODE" = "whiptail" ]; then
            get_category_packages "$cat_id" | while read pkg_id; do
                sed -i "/^${pkg_id}$/d" "$SELECTED_PACKAGES"
            done
            
            for pkg in $selected; do
                pkg=$(echo "$pkg" | tr -d '"')
                echo "$pkg" >> "$SELECTED_PACKAGES"
            done
            return
        else
            case "$selected" in
                "") return ;;
                *) 
                    pkg=$(echo "$selected" | tr -d '"')
                    [ -n "$pkg" ] && toggle_package "$pkg"
                    ;;
            esac
        fi
    done
}

# Dynamic category rendering
screen_category() {
    local cat_id="$1"
    local cat_title=$(get_category_title "$cat_id")
    
    while true; do
        local menu_items=""
        local i=1
        
        get_category_items "$cat_id" | while read item_id; do
            item_label=$(get_item_label "$cat_id" "$item_id")
            menu_items="$menu_items $i \"$item_label\""
            i=$((i+1))
        done
        
        choice=$(eval "show_menu '$cat_title' $menu_items b '$(tr 'feedback-link')'")
        [ "$choice" = "b" -o -z "$choice" ] && return
        
        selected_item=$(get_category_items "$cat_id" | sed -n "${choice}p")
        if [ -n "$selected_item" ]; then
            handle_item "$cat_id" "$selected_item"
        fi
    done
}

handle_item() {
    local cat_id="$1"
    local item_id="$2"
    local item_type=$(get_item_type "$cat_id" "$item_id")
    local variable=$(get_item_variable "$cat_id" "$item_id")
    local label=$(get_item_label "$cat_id" "$item_id")
    local default=$(get_item_default "$cat_id" "$item_id")
    local placeholder=$(get_item_placeholder "$cat_id" "$item_id")
    
    # Auto-fill from API if available
    case "$variable" in
        country) [ -n "$ISP_COUNTRY" ] && default="$ISP_COUNTRY" ;;
        timezone) [ -n "$AUTO_TIMEZONE" ] && default="$AUTO_TIMEZONE" ;;
        zonename) [ -n "$AUTO_ZONENAME" ] && default="$AUTO_ZONENAME" ;;
    esac
    
    case "$item_type" in
        field)
            field_type=$(get_item_field_type "$cat_id" "$item_id")
            if [ "$field_type" = "password" ]; then
                value=$(get_password "$label")
            else
                value=$(get_input "$label" "$default")
            fi
            [ -n "$value" ] && save_setting "$variable" "$value"
            ;;
            
        radio-group)
            local radio_items=""
            local i=1
            get_radio_options "$cat_id" "$item_id" | while read opt_value; do
                opt_label=$(get_radio_option_label "$cat_id" "$item_id" "$opt_value")
                radio_items="$radio_items $i \"$opt_label\""
                i=$((i+1))
            done
            
            selected=$(eval "show_menu '$label' $radio_items")
            selected_value=$(get_radio_options "$cat_id" "$item_id" | sed -n "${selected}p")
            [ -n "$selected_value" ] && save_setting "$variable" "$selected_value"
            
            # Handle sub-items based on selection
            if [ "$variable" = "connection_type" ] && [ "$selected_value" = "pppoe" ]; then
                username=$(get_input "$(tr 'pppoe-username')" "")
                [ -n "$username" ] && save_setting "pppoe_username" "$username"
                password=$(get_password "$(tr 'pppoe-password')")
                [ -n "$password" ] && save_setting "pppoe_password" "$password"
            elif [ "$variable" = "connection_type" ] && [ "$selected_value" = "dslite" ]; then
                aftr=$(get_input "$(tr 'dslite-aftr-ipv6-address')" "$DSLITE_AFTR")
                [ -n "$aftr" ] && save_setting "dslite_aftr_address" "$aftr"
            elif [ "$variable" = "connection_type" ] && [ "$selected_value" = "mape" ]; then
                br=$(get_input "$(tr 'br')" "$MAPE_BR")
                [ -n "$br" ] && save_setting "mape_br" "$br"
                [ -n "$MAPE_IPV4_PREFIX" ] && save_setting "mape_ipv4_prefix" "$MAPE_IPV4_PREFIX"
                [ -n "$MAPE_IPV4_PREFIXLEN" ] && save_setting "mape_ipv4_prefixlen" "$MAPE_IPV4_PREFIXLEN"
                [ -n "$MAPE_IPV6_PREFIX" ] && save_setting "mape_ipv6_prefix" "$MAPE_IPV6_PREFIX"
                [ -n "$MAPE_IPV6_PREFIXLEN" ] && save_setting "mape_ipv6_prefixlen" "$MAPE_IPV6_PREFIXLEN"
                [ -n "$MAPE_EALEN" ] && save_setting "mape_ealen" "$MAPE_EALEN"
                [ -n "$MAPE_PSIDLEN" ] && save_setting "mape_psidlen" "$MAPE_PSIDLEN"
                [ -n "$MAPE_PSID_OFFSET" ] && save_setting "mape_psid_offset" "$MAPE_PSID_OFFSET"
            elif [ "$variable" = "connection_type" ] && [ "$selected_value" = "ap" ]; then
                ip=$(get_input "$(tr 'ap-ip-address')" "192.168.1.2")
                [ -n "$ip" ] && save_setting "ap_ip_address" "$ip"
                gateway=$(get_input "$(tr 'ap-gateway')" "192.168.1.1")
                [ -n "$gateway" ] && save_setting "ap_gateway" "$gateway"
            fi
            ;;
    esac
}

screen_review() {
    local review="=== DEVICE ===
Model: $DEVICE_MODEL
Target: $DEVICE_TARGET

=== PACKAGES ===
"
    if [ -s "$SELECTED_PACKAGES" ]; then
        while read pkg; do
            review="$review- $pkg
"
        done < "$SELECTED_PACKAGES"
    else
        review="$review(none)
"
    fi
    
    review="$review
=== CONFIGURATION ===
"
    if [ -s "$SETUP_VARS" ]; then
        cat "$SETUP_VARS" | while read line; do
            review="$review$line
"
        done
    else
        review="$review(none)
"
    fi
    
    if show_yesno "$(tr 'export-settings')" "$review

Generate files?"; then
        generate_config_files
        show_msgbox "$(tr 'export-settings')" "Configuration generated:

- $OUTPUT_DIR/postinst
- $OUTPUT_DIR/setup.sh

Ready for ASU upload!"
    fi
}

# ========== MAIN MENU ==========

main_menu() {
    while true; do
        # Build menu from categories
        local menu_items=""
        local i=1
        
        get_categories | while read cat_id; do
            cat_title=$(get_category_title "$cat_id")
            echo "$i:$cat_id:$cat_title"
            i=$((i+1))
        done > /tmp/menu_map
        
        menu_items="1 \"$(tr 'custom-packages')\""
        i=2
        while IFS=: read idx cat_id cat_title; do
            menu_items="$menu_items $i \"$cat_title\""
            i=$((i+1))
        done < /tmp/menu_map
        menu_items="$menu_items r \"$(tr 'export-settings')\" q \"Exit\""
        
        choice=$(eval "show_menu 'Device: $DEVICE_MODEL' $menu_items")
        
        case "$choice" in
            1) screen_packages ;;
            r) screen_review ;;
            q|"") exit 0 ;;
            *)
                selected_cat=$(sed -n "${choice}p" /tmp/menu_map | cut -d: -f2)
                [ -n "$selected_cat" ] && screen_category "$selected_cat"
                ;;
        esac
    done
}

# ========== GENERATE CONFIG ==========

generate_config_files() {
    language=$(grep "^language=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
    
    # postinst
    {
        echo "#!/bin/sh"
        echo "# Generated by aios-light.sh v$VERSION"
        echo ""
        echo "if command -v opkg >/dev/null 2>&1; then"
        echo "    PKG_MGR=opkg"
        echo "    opkg update"
        echo "elif command -v apk >/dev/null 2>&1; then"
        echo "    PKG_MGR=apk"
        echo "    apk update"
        echo "fi"
        echo ""
        
        if [ -n "$language" ]; then
            echo "PKGS=\"luci-i18n-base-${language} luci-i18n-firewall-${language}\""
            echo "[ \"\$PKG_MGR\" = \"opkg\" ] && opkg install \$PKGS"
            echo "[ \"\$PKG_MGR\" = \"apk\" ] && apk add \$PKGS"
            echo ""
        fi
        
        if [ -s "$SELECTED_PACKAGES" ]; then
            cat "$SELECTED_PACKAGES" | while read pkg; do
                echo "[ \"\$PKG_MGR\" = \"opkg\" ] && opkg install $pkg"
                echo "[ \"\$PKG_MGR\" = \"apk\" ] && apk add $pkg"
            done
        fi
        echo ""
        echo "exit 0"
    } > "$OUTPUT_DIR/postinst"
    chmod +x "$OUTPUT_DIR/postinst"
    
    # setup.sh
    {
        echo "#!/bin/sh"
        echo "# Generated by aios-light.sh v$VERSION"
        echo ""
        echo "# BEGIN_VARS"
        [ -s "$SETUP_VARS" ] && cat "$SETUP_VARS"
        echo "# END_VARS"
        echo ""
        
        if wget -q -O - "$SETUP_TEMPLATE_URL" | sed '1,/^# END_VARS/d' >> "$OUTPUT_DIR/setup.sh.tmp"; then
            cat "$OUTPUT_DIR/setup.sh.tmp" >> "$OUTPUT_DIR/setup.sh"
            rm -f "$OUTPUT_DIR/setup.sh.tmp"
        fi
    } > "$OUTPUT_DIR/setup.sh"
    chmod +x "$OUTPUT_DIR/setup.sh"
}

# Get device info
get_extended_device_info() {
    if [ -f /etc/board.json ]; then
        DEVICE_MODEL=$(jsonfilter -i /etc/board.json -e '@.model.name' 2>/dev/null)
        
        if [ -f /etc/openwrt_release ]; then
            . /etc/openwrt_release
            DEVICE_TARGET="${DISTRIB_TARGET:-unknown/unknown}"
            OPENWRT_VERSION="${DISTRIB_RELEASE:-unknown}"
        fi
    fi
    
    echo "Fetching ISP information..."
    if wget -q -O "$AUTO_CONFIG_JSON" "$AUTO_CONFIG_URL"; then
        ISP_NAME=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.isp' 2>/dev/null)
        ISP_AS=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.as' 2>/dev/null)
        ISP_COUNTRY=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.country' 2>/dev/null)
        ISP_REGION=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.regionName' 2>/dev/null)
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
        fi
    fi
    
    DEVICE_MEM=$(awk '/MemTotal/{printf "%.0f MB", $2/1024}' /proc/meminfo 2>/dev/null)
    DEVICE_CPU=$(grep -m1 "model name" /proc/cpuinfo | cut -d: -f2 | xargs 2>/dev/null)
    [ -z "$DEVICE_CPU" ] && DEVICE_CPU=$(grep -m1 "Hardware" /proc/cpuinfo | cut -d: -f2 | xargs 2>/dev/null)
    
    [ -z "$DEVICE_MODEL" ] && DEVICE_MODEL="Unknown Device"
    [ -z "$DEVICE_TARGET" ] && DEVICE_TARGET="unknown/unknown"
    [ -z "$OPENWRT_VERSION" ] && OPENWRT_VERSION="unknown"
}

# ========== MAIN ==========

main() {
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
    echo ""
    
    if ! download_files; then
        echo "Warning: Failed to download required files"
        echo "Some features may not work properly."
        sleep 2
    fi
    
    echo "Loading default packages..."
    load_default_packages
    
    echo ""
    
    select_ui_mode
    
    main_menu
}

main
