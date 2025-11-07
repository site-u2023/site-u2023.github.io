#!/bin/sh
# OpenWrt Device Setup Tool - CLI Version
# ASU (Attended SysUpgrade) Compatible
# Supports: whiptail (TUI) with fallback to simple menu

VERSION="1.0.0"
BASE_URL="https://site-u.pages.dev"
PACKAGES_URL="$BASE_URL/www/packages/packages.json"
SETUP_TEMPLATE_URL="$BASE_URL/www/uci-defaults/setup.sh"
AUTO_CONFIG_URL="https://auto-config.site-u.workers.dev/"

CONFIG_DIR="/tmp/device-setup"
PACKAGES_JSON="$CONFIG_DIR/packages.json"
AUTO_CONFIG_JSON="$CONFIG_DIR/auto_config.json"
SELECTED_PACKAGES="$CONFIG_DIR/selected_packages.txt"
SETUP_VARS="$CONFIG_DIR/setup_vars.sh"
OUTPUT_DIR="/tmp"

# Detect UI mode
UI_MODE=""
select_ui_mode() {
    if command -v whiptail >/dev/null 2>&1; then
        echo "whiptail detected"
        echo ""
        echo "Select UI mode:"
        echo "1) whiptail (TUI - BIOS style)"
        echo "2) simple (text menu)"
        printf "Choice [1]: "
        read choice
        [ "$choice" = "2" ] && UI_MODE="simple" || UI_MODE="whiptail"
    else
        echo "whiptail not found, using simple menu"
        UI_MODE="simple"
    fi
}

# Initialize
init() {
    mkdir -p "$CONFIG_DIR"
    : > "$SELECTED_PACKAGES"
    : > "$SETUP_VARS"
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
    # Try to get from current system
    if [ -f /etc/board.json ]; then
        DEVICE_MODEL=$(jsonfilter -i /etc/board.json -e '@.model.name' 2>/dev/null)
        DEVICE_TARGET=$(jsonfilter -i /etc/board.json -e '@.target' 2>/dev/null)
    fi
    
    # Fallback
    [ -z "$DEVICE_MODEL" ] && DEVICE_MODEL="Unknown"
    [ -z "$DEVICE_TARGET" ] && DEVICE_TARGET="unknown/unknown"
}

# JSON filter helpers
get_categories() {
    jsonfilter -i "$PACKAGES_JSON" -e '@.categories[*].id' 2>/dev/null | grep -v '^$'
}

get_category_name() {
    jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$1'].name" 2>/dev/null
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
        choice=$(whiptail --title "OpenWrt Setup Tool v$VERSION - $DEVICE_MODEL" \
            --menu "Select an option:" 18 70 10 \
            "1" "Device Information" \
            "2" "Configure Packages" \
            "3" "Basic Settings" \
            "4" "Network Configuration" \
            "5" "Wi-Fi Setup" \
            "6" "Advanced Options" \
            "7" "Review & Generate" \
            "8" "Exit" \
            3>&1 1>&2 2>&3)
        
        case "$choice" in
            1) whiptail_device_info ;;
            2) whiptail_package_categories ;;
            3) whiptail_basic_settings ;;
            4) whiptail_network_config ;;
            5) whiptail_wifi_config ;;
            6) whiptail_advanced_options ;;
            7) whiptail_review ;;
            8|"") exit 0 ;;
        esac
    done
}

whiptail_device_info() {
    local info="Model: $DEVICE_MODEL\n"
    info="${info}Target: $DEVICE_TARGET\n"
    info="${info}Version: $OPENWRT_VERSION\n"
    [ -n "$DEVICE_MEM" ] && info="${info}Memory: $DEVICE_MEM\n"
    [ -n "$DEVICE_CPU" ] && info="${info}CPU: $DEVICE_CPU\n"
    info="${info}\n--- Network Information ---\n"
    [ -n "$ISP_NAME" ] && info="${info}ISP: $ISP_NAME\n"
    [ -n "$ISP_AS" ] && info="${info}AS: $ISP_AS\n"
    [ -n "$ISP_IPV6" ] && info="${info}IPv6: $ISP_IPV6\n"
    [ -n "$ISP_REGION" ] && info="${info}Region: $ISP_REGION, $ISP_COUNTRY\n"
    [ -n "$DETECTED_CONN_TYPE" ] && info="${info}Detected: $DETECTED_CONN_TYPE\n"
    
    whiptail --title "Device Information" --msgbox "$info" 20 70
}

whiptail_package_categories() {
    local menu_items i=1 cat_id cat_name
    
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
    local checklist_items pkg_id pkg_name status
    
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

whiptail_basic_settings() {
    while true; do
        choice=$(whiptail --title "Basic Settings" --menu "Configure:" 18 60 10 \
            "1" "Language" \
            "2" "Timezone/Region" \
            "3" "Device Name" \
            "4" "Root Password" \
            "5" "LAN IPv4 Address" \
            "6" "LAN IPv6 Address" \
            "7" "SSH Interface" \
            "8" "SSH Port" \
            "9" "Back" \
            3>&1 1>&2 2>&3)
        
        case "$choice" in
            1)
                lang=$(whiptail --inputbox "Language (e.g., ja, en):" 10 60 3>&1 1>&2 2>&3)
                [ -n "$lang" ] && sed -i "/^language=/d" "$SETUP_VARS" && echo "language='$lang'" >> "$SETUP_VARS"
                ;;
            2)
                tz=$(whiptail --inputbox "Timezone (e.g., JST-9, UTC):" 10 60 3>&1 1>&2 2>&3)
                [ -n "$tz" ] && sed -i "/^timezone=/d" "$SETUP_VARS" && echo "timezone='$tz'" >> "$SETUP_VARS"
                zonename=$(whiptail --inputbox "Zonename (e.g., Asia/Tokyo):" 10 60 3>&1 1>&2 2>&3)
                [ -n "$zonename" ] && sed -i "/^zonename=/d" "$SETUP_VARS" && echo "zonename='$zonename'" >> "$SETUP_VARS"
                ;;
            3)
                hostname=$(whiptail --inputbox "Device Name:" 10 60 "OpenWrt" 3>&1 1>&2 2>&3)
                [ -n "$hostname" ] && sed -i "/^device_name=/d" "$SETUP_VARS" && echo "device_name='$hostname'" >> "$SETUP_VARS"
                ;;
            4)
                password=$(whiptail --passwordbox "Root Password (8+ chars):" 10 60 3>&1 1>&2 2>&3)
                [ -n "$password" ] && sed -i "/^root_password=/d" "$SETUP_VARS" && echo "root_password='$password'" >> "$SETUP_VARS"
                ;;
            5)
                lan_ip=$(whiptail --inputbox "LAN IPv4 (e.g., 192.168.1.1/24):" 10 60 3>&1 1>&2 2>&3)
                [ -n "$lan_ip" ] && sed -i "/^lan_ip_address=/d" "$SETUP_VARS" && echo "lan_ip_address='$lan_ip'" >> "$SETUP_VARS"
                ;;
            6)
                lan_ip6=$(whiptail --inputbox "LAN IPv6 (e.g., fd00:1/64):" 10 60 3>&1 1>&2 2>&3)
                [ -n "$lan_ip6" ] && sed -i "/^lan_ipv6_address=/d" "$SETUP_VARS" && echo "lan_ipv6_address='$lan_ip6'" >> "$SETUP_VARS"
                ;;
            7)
                ssh_if=$(whiptail --inputbox "SSH Interface (e.g., lan):" 10 60 3>&1 1>&2 2>&3)
                [ -n "$ssh_if" ] && sed -i "/^ssh_interface=/d" "$SETUP_VARS" && echo "ssh_interface='$ssh_if'" >> "$SETUP_VARS"
                ;;
            8)
                ssh_port=$(whiptail --inputbox "SSH Port:" 10 60 "22" 3>&1 1>&2 2>&3)
                [ -n "$ssh_port" ] && sed -i "/^ssh_port=/d" "$SETUP_VARS" && echo "ssh_port='$ssh_port'" >> "$SETUP_VARS"
                ;;
            9|"") return ;;
        esac
    done
}

whiptail_network_config() {
    # Show auto-detected settings if available
    local auto_msg=""
    if [ -n "$DETECTED_CONN_TYPE" ]; then
        auto_msg="Auto-detected: $DETECTED_CONN_TYPE\n\n"
        if [ "$DETECTED_CONN_TYPE" = "MAP-E" ] && [ -n "$MAPE_BR" ]; then
            auto_msg="${auto_msg}MAP-E Settings detected:\n"
            auto_msg="${auto_msg}  BR: $MAPE_BR\n"
            auto_msg="${auto_msg}  IPv4: $MAPE_IPV4_PREFIX/$MAPE_IPV4_PREFIXLEN\n"
            auto_msg="${auto_msg}  IPv6: $MAPE_IPV6_PREFIX/$MAPE_IPV6_PREFIXLEN\n\n"
        elif [ "$DETECTED_CONN_TYPE" = "DS-Lite" ] && [ -n "$DSLITE_AFTR" ]; then
            auto_msg="${auto_msg}DS-Lite AFTR: $DSLITE_AFTR\n\n"
        fi
    fi
    
    if [ -n "$auto_msg" ]; then
        if whiptail --title "Auto-Detected Network" --yesno "${auto_msg}Use these settings?" 18 70; then
            # Auto-configure based on detection
            if [ "$DETECTED_CONN_TYPE" = "MAP-E" ]; then
                sed -i "/^connection_type=/d" "$SETUP_VARS"
                sed -i "/^mape_/d" "$SETUP_VARS"
                echo "connection_type='mape'" >> "$SETUP_VARS"
                echo "mape_br='$MAPE_BR'" >> "$SETUP_VARS"
                echo "mape_ipv4_prefix='$MAPE_IPV4_PREFIX'" >> "$SETUP_VARS"
                echo "mape_ipv4_prefixlen='$MAPE_IPV4_PREFIXLEN'" >> "$SETUP_VARS"
                echo "mape_ipv6_prefix='$MAPE_IPV6_PREFIX'" >> "$SETUP_VARS"
                echo "mape_ipv6_prefixlen='$MAPE_IPV6_PREFIXLEN'" >> "$SETUP_VARS"
                echo "mape_ealen='$MAPE_EALEN'" >> "$SETUP_VARS"
                echo "mape_psidlen='$MAPE_PSIDLEN'" >> "$SETUP_VARS"
                echo "mape_psid_offset='$MAPE_PSID_OFFSET'" >> "$SETUP_VARS"
                whiptail --msgbox "MAP-E configured automatically!" 8 50
                return
            elif [ "$DETECTED_CONN_TYPE" = "DS-Lite" ]; then
                sed -i "/^connection_type=/d" "$SETUP_VARS"
                sed -i "/^dslite_/d" "$SETUP_VARS"
                echo "connection_type='dslite'" >> "$SETUP_VARS"
                echo "dslite_aftr_address='$DSLITE_AFTR'" >> "$SETUP_VARS"
                whiptail --msgbox "DS-Lite configured automatically!" 8 50
                return
            fi
        fi
    fi
    
    # Manual configuration
    conn_type=$(whiptail --title "Network Configuration" --menu "Connection Type:" 16 60 8 \
        "1" "DHCP (Auto)" \
        "2" "PPPoE" \
        "3" "DS-Lite (IPv4 over IPv6)" \
        "4" "MAP-E (IPv4 over IPv6)" \
        "5" "Access Point Mode" \
        3>&1 1>&2 2>&3)
    
    sed -i "/^connection_type=/d" "$SETUP_VARS"
    
    case "$conn_type" in
        1) echo "connection_type='auto'" >> "$SETUP_VARS" ;;
        2)
            echo "connection_type='pppoe'" >> "$SETUP_VARS"
            username=$(whiptail --inputbox "PPPoE Username:" 10 60 3>&1 1>&2 2>&3)
            [ -n "$username" ] && echo "pppoe_username='$username'" >> "$SETUP_VARS"
            password=$(whiptail --passwordbox "PPPoE Password:" 10 60 3>&1 1>&2 2>&3)
            [ -n "$password" ] && echo "pppoe_password='$password'" >> "$SETUP_VARS"
            ;;
        3)
            echo "connection_type='dslite'" >> "$SETUP_VARS"
            aftr=$(whiptail --inputbox "DS-Lite AFTR Address:" 10 60 "$DSLITE_AFTR" 3>&1 1>&2 2>&3)
            [ -n "$aftr" ] && echo "dslite_aftr_address='$aftr'" >> "$SETUP_VARS"
            ;;
        4)
            echo "connection_type='mape'" >> "$SETUP_VARS"
            br=$(whiptail --inputbox "MAP-E BR Address:" 10 60 "$MAPE_BR" 3>&1 1>&2 2>&3)
            [ -n "$br" ] && echo "mape_br='$br'" >> "$SETUP_VARS"
            # Add other MAP-E parameters with defaults from auto-config
            [ -n "$MAPE_IPV4_PREFIX" ] && echo "mape_ipv4_prefix='$MAPE_IPV4_PREFIX'" >> "$SETUP_VARS"
            [ -n "$MAPE_IPV4_PREFIXLEN" ] && echo "mape_ipv4_prefixlen='$MAPE_IPV4_PREFIXLEN'" >> "$SETUP_VARS"
            [ -n "$MAPE_IPV6_PREFIX" ] && echo "mape_ipv6_prefix='$MAPE_IPV6_PREFIX'" >> "$SETUP_VARS"
            [ -n "$MAPE_IPV6_PREFIXLEN" ] && echo "mape_ipv6_prefixlen='$MAPE_IPV6_PREFIXLEN'" >> "$SETUP_VARS"
            [ -n "$MAPE_EALEN" ] && echo "mape_ealen='$MAPE_EALEN'" >> "$SETUP_VARS"
            [ -n "$MAPE_PSIDLEN" ] && echo "mape_psidlen='$MAPE_PSIDLEN'" >> "$SETUP_VARS"
            [ -n "$MAPE_PSID_OFFSET" ] && echo "mape_psid_offset='$MAPE_PSID_OFFSET'" >> "$SETUP_VARS"
            ;;
        5)
            echo "connection_type='ap'" >> "$SETUP_VARS"
            ip=$(whiptail --inputbox "AP IP Address:" 10 60 3>&1 1>&2 2>&3)
            [ -n "$ip" ] && echo "ap_ip_address='$ip'" >> "$SETUP_VARS"
            gateway=$(whiptail --inputbox "Gateway:" 10 60 3>&1 1>&2 2>&3)
            [ -n "$gateway" ] && echo "ap_gateway='$gateway'" >> "$SETUP_VARS"
            ;;
    esac
    
    whiptail --msgbox "Network settings saved!" 8 40
}

whiptail_wifi_config() {
    mode=$(whiptail --title "Wi-Fi Setup" --menu "Wi-Fi Mode:" 13 60 3 \
        "1" "Standard (separate SSIDs per band)" \
        "2" "Usteer (unified SSID with roaming)" \
        3>&1 1>&2 2>&3)
    
    sed -i "/^wifi_mode=/d" "$SETUP_VARS"
    case "$mode" in
        1) echo "wifi_mode='standard'" >> "$SETUP_VARS" ;;
        2) echo "wifi_mode='usteer'" >> "$SETUP_VARS" ;;
    esac
    
    ssid=$(whiptail --inputbox "SSID:" 10 60 3>&1 1>&2 2>&3)
    [ -n "$ssid" ] && sed -i "/^wlan_ssid=/d" "$SETUP_VARS" && echo "wlan_ssid='$ssid'" >> "$SETUP_VARS"
    
    password=$(whiptail --passwordbox "Wi-Fi Password (8+ chars):" 10 60 3>&1 1>&2 2>&3)
    [ -n "$password" ] && sed -i "/^wlan_password=/d" "$SETUP_VARS" && echo "wlan_password='$password'" >> "$SETUP_VARS"
    
    country=$(whiptail --inputbox "Country Code (e.g., JP, US):" 10 60 "JP" 3>&1 1>&2 2>&3)
    [ -n "$country" ] && sed -i "/^country=/d" "$SETUP_VARS" && echo "country='$country'" >> "$SETUP_VARS"
    
    whiptail --msgbox "Wi-Fi settings saved!" 8 40
}

whiptail_advanced_options() {
    while true; do
        choice=$(whiptail --title "Advanced Options" --menu "Configure:" 16 60 8 \
            "1" "Flow Offloading" \
            "2" "Network Optimizer" \
            "3" "DNS Cache Settings" \
            "4" "Back" \
            3>&1 1>&2 2>&3)
        
        case "$choice" in
            1)
                offload=$(whiptail --menu "Flow Offloading:" 12 60 3 \
                    "1" "Disabled" \
                    "2" "Software" \
                    "3" "Hardware" \
                    3>&1 1>&2 2>&3)
                sed -i "/^flow_offloading_type=/d" "$SETUP_VARS"
                case "$offload" in
                    2) echo "flow_offloading_type='software'" >> "$SETUP_VARS" ;;
                    3) echo "flow_offloading_type='hardware'" >> "$SETUP_VARS" ;;
                esac
                ;;
            2)
                opt=$(whiptail --menu "Network Optimizer:" 12 60 3 \
                    "1" "Disabled" \
                    "2" "Auto" \
                    "3" "Manual" \
                    3>&1 1>&2 2>&3)
                sed -i "/^net_optimizer=/d" "$SETUP_VARS"
                case "$opt" in
                    2) echo "net_optimizer='auto'" >> "$SETUP_VARS" ;;
                    3) echo "net_optimizer='manual'" >> "$SETUP_VARS" ;;
                esac
                ;;
            3)
                dns=$(whiptail --menu "DNS Cache:" 12 60 3 \
                    "1" "Disabled" \
                    "2" "Auto" \
                    "3" "Manual" \
                    3>&1 1>&2 2>&3)
                sed -i "/^enable_dnsmasq=/d" "$SETUP_VARS"
                case "$dns" in
                    2) echo "enable_dnsmasq='auto'" >> "$SETUP_VARS" ;;
                    3) echo "enable_dnsmasq='manual'" >> "$SETUP_VARS" ;;
                esac
                ;;
            4|"") return ;;
        esac
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
        echo "1) Device Information"
        echo "2) Configure Packages"
        echo "3) Basic Settings"
        echo "4) Network Configuration"
        echo "5) Wi-Fi Setup"
        echo "6) Advanced Options"
        echo "7) Review & Generate"
        echo "q) Exit"
        echo ""
        printf "Choice: "
        read choice
        
        case "$choice" in
            1) simple_device_info ;;
            2) simple_package_menu ;;
            3) simple_basic_settings ;;
            4) simple_network_config ;;
            5) simple_wifi_config ;;
            6) simple_advanced_options ;;
            7) simple_review ;;
            q|Q) exit 0 ;;
        esac
    done
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
    echo "--- Network Information ---"
    [ -n "$ISP_NAME" ] && echo "ISP: $ISP_NAME"
    [ -n "$ISP_AS" ] && echo "AS: $ISP_AS"
    [ -n "$ISP_IPV6" ] && echo "IPv6: $ISP_IPV6"
    [ -n "$ISP_REGION" ] && echo "Region: $ISP_REGION, $ISP_COUNTRY"
    [ -n "$DETECTED_CONN_TYPE" ] && echo "Detected Connection: $DETECTED_CONN_TYPE"
    echo ""
    printf "Press Enter to continue..."
    read
}

simple_package_menu() {
    while true; do
        clear
        echo "=== Package Categories ==="
        echo ""
        
        local i=1
        get_categories | while read cat_id; do
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
                selected_cat=$(get_categories | sed -n "${choice}p")
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

simple_basic_settings() {
    clear
    echo "=== Basic Settings ==="
    echo ""
    
    printf "Language (ja/en) [skip=Enter]: "
    read lang
    [ -n "$lang" ] && sed -i "/^language=/d" "$SETUP_VARS" && echo "language='$lang'" >> "$SETUP_VARS"
    
    printf "Timezone (e.g., JST-9) [skip=Enter]: "
    read tz
    [ -n "$tz" ] && sed -i "/^timezone=/d" "$SETUP_VARS" && echo "timezone='$tz'" >> "$SETUP_VARS"
    
    printf "Device Name [skip=Enter]: "
    read hostname
    [ -n "$hostname" ] && sed -i "/^device_name=/d" "$SETUP_VARS" && echo "device_name='$hostname'" >> "$SETUP_VARS"
    
    printf "Root Password [skip=Enter]: "
    read -s password
    echo ""
    [ -n "$password" ] && sed -i "/^root_password=/d" "$SETUP_VARS" && echo "root_password='$password'" >> "$SETUP_VARS"
    
    echo ""
    echo "Settings saved! Press Enter..."
    read
}

simple_network_config() {
    clear
    echo "=== Network Configuration ==="
    echo ""
    echo "1) DHCP (Auto)"
    echo "2) PPPoE"
    echo "3) DS-Lite"
    echo "4) MAP-E"
    echo "5) Access Point"
    echo ""
    printf "Choice: "
    read conn_type
    
    sed -i "/^connection_type=/d" "$SETUP_VARS"
    
    case "$conn_type" in
        1) echo "connection_type='auto'" >> "$SETUP_VARS" ;;
        2)
            echo "connection_type='pppoe'" >> "$SETUP_VARS"
            printf "Username: "
            read username
            [ -n "$username" ] && echo "pppoe_username='$username'" >> "$SETUP_VARS"
            printf "Password: "
            read -s password
            echo ""
            [ -n "$password" ] && echo "pppoe_password='$password'" >> "$SETUP_VARS"
            ;;
        3)
            echo "connection_type='dslite'" >> "$SETUP_VARS"
            printf "AFTR Address: "
            read aftr
            [ -n "$aftr" ] && echo "dslite_aftr_address='$aftr'" >> "$SETUP_VARS"
            ;;
        4)
            echo "connection_type='mape'" >> "$SETUP_VARS"
            printf "BR Address: "
            read br
            [ -n "$br" ] && echo "mape_br='$br'" >> "$SETUP_VARS"
            ;;
        5)
            echo "connection_type='ap'" >> "$SETUP_VARS"
            printf "AP IP: "
            read ip
            [ -n "$ip" ] && echo "ap_ip_address='$ip'" >> "$SETUP_VARS"
            printf "Gateway: "
            read gw
            [ -n "$gw" ] && echo "ap_gateway='$gw'" >> "$SETUP_VARS"
            ;;
    esac
    
    echo ""
    echo "Network settings saved! Press Enter..."
    read
}

simple_wifi_config() {
    clear
    echo "=== Wi-Fi Setup ==="
    echo ""
    echo "1) Standard mode"
    echo "2) Usteer mode"
    printf "Choice: "
    read mode
    
    sed -i "/^wifi_mode=/d" "$SETUP_VARS"
    case "$mode" in
        1) echo "wifi_mode='standard'" >> "$SETUP_VARS" ;;
        2) echo "wifi_mode='usteer'" >> "$SETUP_VARS" ;;
    esac
    
    printf "SSID: "
    read ssid
    [ -n "$ssid" ] && sed -i "/^wlan_ssid=/d" "$SETUP_VARS" && echo "wlan_ssid='$ssid'" >> "$SETUP_VARS"
    
    printf "Password: "
    read -s password
    echo ""
    [ -n "$password" ] && sed -i "/^wlan_password=/d" "$SETUP_VARS" && echo "wlan_password='$password'" >> "$SETUP_VARS"
    
    printf "Country Code (JP/US): "
    read country
    [ -n "$country" ] && sed -i "/^country=/d" "$SETUP_VARS" && echo "country='$country'" >> "$SETUP_VARS"
    
    echo ""
    echo "Wi-Fi settings saved! Press Enter..."
    read
}

simple_advanced_options() {
    clear
    echo "=== Advanced Options ==="
    echo ""
    echo "1) Flow Offloading: software/hardware"
    echo "2) Network Optimizer: auto/manual"
    echo "3) DNS Cache: auto/manual"
    echo "b) Back"
    printf "Choice: "
    read choice
    
    case "$choice" in
        1)
            printf "Flow offloading (software/hardware): "
            read offload
            sed -i "/^flow_offloading_type=/d" "$SETUP_VARS"
            [ -n "$offload" ] && echo "flow_offloading_type='$offload'" >> "$SETUP_VARS"
            ;;
        2)
            printf "Network optimizer (auto/manual): "
            read opt
            sed -i "/^net_optimizer=/d" "$SETUP_VARS"
            [ -n "$opt" ] && echo "net_optimizer='$opt'" >> "$SETUP_VARS"
            ;;
        3)
            printf "DNS cache (auto/manual): "
            read dns
            sed -i "/^enable_dnsmasq=/d" "$SETUP_VARS"
            [ -n "$dns" ] && echo "enable_dnsmasq='$dns'" >> "$SETUP_VARS"
            ;;
    esac
    
    echo ""
    printf "Press Enter to continue..."
    read
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

generate_config_files() {
    # Generate postinst (package installation script)
    {
        echo "#!/bin/sh"
        echo "# Generated by device-setup.sh v$VERSION"
        echo "# Device: $DEVICE_MODEL ($DEVICE_TARGET)"
        echo ""
        echo "opkg update"
        if [ -s "$SELECTED_PACKAGES" ]; then
            cat "$SELECTED_PACKAGES" | while read pkg; do
                echo "opkg install $pkg"
            done
        fi
        echo "exit 0"
    } > "$OUTPUT_DIR/postinst"
    chmod +x "$OUTPUT_DIR/postinst"
    
    # Generate setup.sh (uci-defaults script)
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
        
        # Download and append the template
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

# Get extended device info
get_extended_device_info() {
    # Get board info
    if [ -f /etc/board.json ]; then
        DEVICE_MODEL=$(jsonfilter -i /etc/board.json -e '@.model.name' 2>/dev/null)
        DEVICE_ID=$(jsonfilter -i /etc/board.json -e '@.model.id' 2>/dev/null)
        
        # Detect target from system
        if [ -f /etc/openwrt_release ]; then
            . /etc/openwrt_release
            DEVICE_TARGET="${DISTRIB_TARGET:-unknown/unknown}"
            OPENWRT_VERSION="${DISTRIB_RELEASE:-unknown}"
        fi
    fi
    
    # Get ISP and network info from auto-config API
    echo "Fetching ISP information..."
    if wget -q -O "$AUTO_CONFIG_JSON" "$AUTO_CONFIG_URL"; then
        ISP_NAME=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.isp' 2>/dev/null)
        ISP_AS=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.as' 2>/dev/null)
        ISP_IPV6=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.ipv6' 2>/dev/null)
        ISP_COUNTRY=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.country' 2>/dev/null)
        ISP_REGION=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.regionName' 2>/dev/null)
        AUTO_TIMEZONE=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.timezone' 2>/dev/null)
        AUTO_ZONENAME=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.zonename' 2>/dev/null)
        
        # Get MAP-E settings if available
        MAPE_BR=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.brIpv6Address' 2>/dev/null)
        MAPE_IPV4_PREFIX=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.ipv4Prefix' 2>/dev/null)
        MAPE_IPV4_PREFIXLEN=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.ipv4PrefixLength' 2>/dev/null)
        MAPE_IPV6_PREFIX=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.ipv6Prefix' 2>/dev/null)
        MAPE_IPV6_PREFIXLEN=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.ipv6PrefixLength' 2>/dev/null)
        MAPE_EALEN=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.eaBitLength' 2>/dev/null)
        MAPE_PSIDLEN=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.psidlen' 2>/dev/null)
        MAPE_PSID_OFFSET=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.mape.psIdOffset' 2>/dev/null)
        
        # Get DS-Lite AFTR if available
        DSLITE_AFTR=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.aftr' 2>/dev/null)
        
        # Determine connection type
        if [ -n "$MAPE_BR" ]; then
            DETECTED_CONN_TYPE="MAP-E"
        elif [ -n "$DSLITE_AFTR" ]; then
            DETECTED_CONN_TYPE="DS-Lite"
        else
            DETECTED_CONN_TYPE="Unknown"
        fi
    fi
    
    # Memory info
    DEVICE_MEM=$(awk '/MemTotal/{printf "%.0f MB", $2/1024}' /proc/meminfo 2>/dev/null)
    
    # CPU info
    DEVICE_CPU=$(grep -m1 "model name" /proc/cpuinfo | cut -d: -f2 | xargs 2>/dev/null)
    [ -z "$DEVICE_CPU" ] && DEVICE_CPU=$(grep -m1 "Hardware" /proc/cpuinfo | cut -d: -f2 | xargs 2>/dev/null)
    
    # Fallbacks
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
    
    # Initialize
    init
    
    # Get device information
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
    
    # Download packages.json
    echo "Downloading package database..."
    if ! download_packages; then
        echo "Warning: Failed to download packages.json"
        echo "Some features may not work properly."
        sleep 2
    fi
    
    # Load default checked packages
    echo "Loading default packages..."
    load_default_packages
    
    echo ""
    
    # Select UI mode
    select_ui_mode
    
    # Run appropriate UI
    if [ "$UI_MODE" = "whiptail" ]; then
        whiptail_main_menu
    else
        simple_main_menu
    fi
}

# Run main
main
