#!/bin/sh
# OpenWrt Device Setup Tool - whiptail TUI Module
# This file contains whiptail-specific UI functions
# Whiptail Color Configuration

VERSION="R7.1120.1148"

NEWT_COLORS='
title=black,lightgray
'

show_menu() {
    local breadcrumb="$1"
    local prompt="$2"
    local ok_btn="${3:-$(translate "$DEFAULT_BTN_SELECT")}"
    local cancel_btn="${4:-$(translate "$DEFAULT_BTN_BACK")}"
    shift 4
    
    eval "whiptail --title '$breadcrumb' --ok-button '$ok_btn' --cancel-button '$cancel_btn' --menu '$prompt' \"$UI_HEIGHT\" \"$UI_WIDTH\" 0 \"\$@\" 3>&1 1>&2 2>&3"
}

show_inputbox() {
    local breadcrumb="$1"
    local prompt="$2"
    local default="$3"
    local ok_btn="${4:-$(translate "$DEFAULT_BTN_SELECT")}"
    local cancel_btn="${5:-$(translate "$DEFAULT_BTN_BACK")}"
    
    whiptail --title "$breadcrumb" --ok-button "$ok_btn" --cancel-button "$cancel_btn" --inputbox "$prompt" "$UI_HEIGHT" "$UI_WIDTH" "$default" 3>&1 1>&2 2>&3
}

show_yesno() {
    local breadcrumb="$1"
    local message="$2"
    local yes_btn="${3:-$(translate "$DEFAULT_BTN_YES")}"
    local no_btn="${4:-$(translate "$DEFAULT_BTN_NO")}"
    
    whiptail --title "$breadcrumb" --yes-button "$yes_btn" --no-button "$no_btn" --yesno "$message" "$UI_HEIGHT" "$UI_WIDTH"
}

show_msgbox() {
    local breadcrumb="$1"
    local message="$2"
    local ok_btn="${3:-$(translate "$DEFAULT_BTN_OK")}"
    
    local lines
    local height
    lines=$(printf '%b\n' "$message" | wc -l)
    height=$((lines + 7))
    
    whiptail --title "$breadcrumb" --ok-button "$ok_btn" --msgbox "$message" "$height" "$UI_WIDTH"
}

show_checklist() {
    local breadcrumb="$1"
    local prompt="$2"
    local ok_btn="${3:-$(translate "$DEFAULT_BTN_SELECT")}"
    local cancel_btn="${4:-$(translate "$DEFAULT_BTN_BACK")}"
    shift 4
    
    eval "whiptail --title '$breadcrumb' --ok-button '$ok_btn' --cancel-button '$cancel_btn' --checklist '$prompt' \"$UI_HEIGHT\" \"$UI_WIDTH\" 0 \"\$@\" 3>&1 1>&2 2>&3"
}

show_textbox() {
    local breadcrumb="$1"
    local file="$2"
    local ok_btn="${3:-$(translate "$DEFAULT_BTN_OK")}"
    
    local temp_file="$CONFIG_DIR/textbox_wrapped.txt"
    fold -s -w "$UI_WIDTH" "$file" > "$temp_file"
    
    whiptail --scrolltext --title "$breadcrumb" --ok-button "$ok_btn" --textbox "$temp_file" "$UI_HEIGHT" "$UI_WIDTH"
    
    rm -f "$temp_file"
}


custom_feeds_selection() {
    [ "$PKG_MGR" != "opkg" ] && return 0
    download_customfeeds_json || return 0
    
    local tr_main_menu
    local tr_custom_feeds
    local breadcrumb
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_custom_feeds=$(translate "tr-tui-custom-feeds")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_custom_feeds")
    
    local menu_items="" i=1 cat_id cat_name
    
    while read -r cat_id; do
        cat_name=$(get_category_name "$cat_id")
        menu_items="$menu_items $i \"$cat_name\""
        i=$((i+1))
    done <<EOF
$(get_customfeed_categories)
EOF
    
    if [ -z "$menu_items" ]; then
        show_msgbox "$breadcrumb" "No custom feeds available"
        return 0
    fi
    
    choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items")
    
    if [ $? -ne 0 ]; then
        return 0
    fi
    
    if [ -n "$choice" ]; then
        selected_cat=$(get_customfeed_categories | sed -n "${choice}p")
        whiptail_package_selection "$selected_cat" "custom_feeds" "$breadcrumb"
    fi
}

simple_custom_feeds_selection() {
    if [ "$PKG_MGR" != "opkg" ]; then
        clear
        echo "========================================"
        echo "  $(translate 'tr-tui-custom-feeds')"
        echo "========================================"
        echo ""
        echo "Custom feeds are only available for OPKG"
        echo ""
        printf "Press Enter to continue..."
        read -r
        return 0
    fi
    
    if ! download_customfeeds_json; then
        clear
        echo "========================================"
        echo "  $(translate 'tr-tui-custom-feeds')"
        echo "========================================"
        echo ""
        echo "Failed to load custom feeds"
        echo ""
        printf "Press Enter to continue..."
        read -r
        return 0
    fi
    
    local cat_id
    cat_id=$(get_customfeed_categories | head -1)
    
    if [ -z "$cat_id" ]; then
        clear
        echo "========================================"
        echo "  $(translate 'tr-tui-custom-feeds')"
        echo "========================================"
        echo ""
        echo "No custom feeds available"
        echo ""
        printf "Press Enter to continue..."
        read -r
        return 0
    fi
    
    simple_package_selection "$cat_id"
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
    
    local show_when
    show_when=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].showWhen" 2>/dev/null | head -1)
    
    if [ -z "$show_when" ]; then
        show_when=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].showWhen" 2>/dev/null | head -1)
    fi
    
    [ -z "$show_when" ] && return 0
    
    echo "[DEBUG] showWhen for $item_id: $show_when" >> "$CONFIG_DIR/debug.log"
    
    local var_name
    local expected
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
    
    local current_val
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
    
    echo "[DEBUG] === auto_add_conditional_packages called ===" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG] cat_id=$cat_id" >> "$CONFIG_DIR/debug.log"
    
    local effective_conn_type
    effective_conn_type=$(get_effective_connection_type)
    echo "[DEBUG] Effective connection type: $effective_conn_type" >> "$CONFIG_DIR/debug.log"
    
    local pkg_count
    pkg_count=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].packages[*]" 2>/dev/null | wc -l)
    
    echo "[DEBUG] pkg_count=$pkg_count" >> "$CONFIG_DIR/debug.log"
    
    if [ "$pkg_count" -eq 0 ]; then
        echo "[DEBUG] No packages in category, returning" >> "$CONFIG_DIR/debug.log"
        return 0
    fi
    
    local idx=0
    while [ "$idx" -lt "$pkg_count" ]; do
        echo "[DEBUG] Processing package index $idx" >> "$CONFIG_DIR/debug.log"
        
        local pkg_id
        pkg_id=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].packages[$idx].id" 2>/dev/null)
        echo "[DEBUG] pkg_id=$pkg_id" >> "$CONFIG_DIR/debug.log"
        
        local when_json
        when_json=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].packages[$idx].when" 2>/dev/null | head -1)
        echo "[DEBUG] when_json=$when_json" >> "$CONFIG_DIR/debug.log"
        
        if [ -n "$when_json" ]; then
            local when_var
            when_var=$(echo "$when_json" | sed 's/^{ *"\([^"]*\)".*/\1/')
            echo "[DEBUG] when_var=$when_var" >> "$CONFIG_DIR/debug.log"
            
            local current_val
            if [ "$when_var" = "connection_type" ]; then
                current_val="$effective_conn_type"
                echo "[DEBUG] Using effective connection type: $current_val" >> "$CONFIG_DIR/debug.log"
            else
                current_val=$(grep "^${when_var}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                echo "[DEBUG] current_val from SETUP_VARS: $current_val" >> "$CONFIG_DIR/debug.log"
            fi
            
            local expected
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
            
            local should_add=0
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
    
    for cat_id in $(get_setup_categories); do
        local items
        items=$(get_setup_category_items "$cat_id")
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
    
    local computed
    computed=$(jsonfilter -i "$SETUP_JSON" -e "@.constants.aftr_map.${aftr_type}.${area}" 2>/dev/null)
    
    if [ -n "$computed" ]; then
        echo "$computed"
        return 0
    fi
    
    return 1
}

# File Generation

generate_files() {
    {
        wget -q -O - "$POSTINST_TEMPLATE_URL" | sed -n '1,/^# BEGIN_VARIABLE_DEFINITIONS/p'
        
        if [ -s "$SELECTED_PACKAGES" ]; then
            pkgs=$(cat "$SELECTED_PACKAGES" | tr '\n' ' ' | sed 's/ $//')
            echo "PACKAGES=\"${pkgs}\""
        else
            echo "PACKAGES=\"\""
        fi
        
        wget -q -O - "$POSTINST_TEMPLATE_URL" | sed -n '/^# END_VARIABLE_DEFINITIONS/,$p'
    } > "$CONFIG_DIR/postinst.sh"
    
    chmod +x "$CONFIG_DIR/postinst.sh"
    
    {
        wget -q -O - "$SETUP_TEMPLATE_URL" | sed -n '1,/^# BEGIN_VARS/p'
        
        if [ -s "$SETUP_VARS" ]; then
            cat "$SETUP_VARS"
        fi
        
        wget -q -O - "$SETUP_TEMPLATE_URL" | sed -n '/^# END_VARS/,$p'
    } > "$CONFIG_DIR/setup.sh"
    
    chmod +x "$CONFIG_DIR/setup.sh"
    
    if [ -f "$CUSTOMFEEDS_JSON" ]; then
        while read -r cat_id; do
            local template_url
            template_url=$(get_customfeed_template_url "$cat_id")
            
            if [ -z "$template_url" ]; then
                echo "[WARN] No template URL found for: $cat_id" >> "$CONFIG_DIR/debug.log"
                continue
            fi
            
            local api_url
            local download_url
            api_url=$(get_customfeed_api_base "$cat_id")
            download_url=$(get_customfeed_download_base "$cat_id")
            
            local temp_pkg_file="$CONFIG_DIR/temp_${cat_id}.txt"
            : > "$temp_pkg_file"
            
            while read -r pkg_id; do
                if grep -q "^${pkg_id}$" "$SELECTED_CUSTOM_PACKAGES" 2>/dev/null; then
                    local pattern
                    pattern=$(get_customfeed_package_pattern "$pkg_id")
                    echo "$pattern"
                fi
            done > "$temp_pkg_file" <<EOF
$(get_category_packages "$cat_id")
EOF
            
            local selected_pkgs=""
            if [ -s "$temp_pkg_file" ]; then
                selected_pkgs=$(cat "$temp_pkg_file" | tr '\n' ' ' | sed 's/ $//')
            fi
            
            {
                wget -q -O - "$template_url" | sed -n '1,/^# BEGIN_VARIABLE_DEFINITIONS/p'
                
                echo "PACKAGES=\"${selected_pkgs}\""
                echo "API_URL=\"${api_url}\""
                echo "DOWNLOAD_BASE_URL=\"${download_url}\""
                echo "RUN_OPKG_UPDATE=\"0\""
                
                wget -q -O - "$template_url" | sed -n '/^# END_VARIABLE_DEFINITIONS/,$p'
            } > "$CONFIG_DIR/customfeeds-${cat_id}.sh"
            
            chmod +x "$CONFIG_DIR/customfeeds-${cat_id}.sh"
            rm -f "$temp_pkg_file"
        done <<EOF
$(get_customfeed_categories)
EOF
    else
        {
            echo "#!/bin/sh"
            echo "# No custom feeds configured"
            echo "exit 0"
        } > "$CONFIG_DIR/customfeeds-none.sh"
        chmod +x "$CONFIG_DIR/customfeeds-none.sh"
    fi
}

# Whiptail UI Functions

device_info() {
    local tr_main_menu
    local tr_device_info
    local breadcrumb
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_device_info=$(translate "tr-tui-view-device-info")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_device_info")
    
    local info="Model: $DEVICE_MODEL\n"
    info="${info}Target: $DEVICE_TARGET\n"
    info="${info}Version: $OPENWRT_VERSION\n"
    [ -n "$DEVICE_MEM" ] && info="${info}Memory: $DEVICE_MEM\n"
    [ -n "$DEVICE_CPU" ] && info="${info}CPU: $DEVICE_CPU\n"
    [ -n "$DEVICE_STORAGE" ] && info="${info}Storage: $DEVICE_STORAGE_USED/$DEVICE_STORAGE (${DEVICE_STORAGE_AVAIL} free)\n"
    [ -n "$DEVICE_USB" ] && info="${info}USB: $DEVICE_USB\n"
    
    show_msgbox "$breadcrumb" "$info"
}

device_info_titled() {
    local title="$1"
    local info="Model: $DEVICE_MODEL\n"
    info="${info}Target: $DEVICE_TARGET\n"
    info="${info}Version: $OPENWRT_VERSION\n"
    [ -n "$DEVICE_MEM" ] && info="${info}Memory: $DEVICE_MEM\n"
    [ -n "$DEVICE_CPU" ] && info="${info}CPU: $DEVICE_CPU\n"
    [ -n "$DEVICE_STORAGE" ] && info="${info}Storage: $DEVICE_STORAGE_USED/$DEVICE_STORAGE (${DEVICE_STORAGE_AVAIL} free)\n"
    [ -n "$DEVICE_USB" ] && info="${info}USB: $DEVICE_USB\n"
    
    show_msgbox "$title" "$info"
}

show_network_info() {
    local custom_breadcrumb="$1"
    local tr_main_menu
    local tr_internet_connection
    local conn_type_label
    local breadcrumb
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_internet_connection=$(translate "tr-internet-connection")
    conn_type_label=$(get_setup_item_label "connection-type")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_internet_connection" "$conn_type_label")
    
    local tr_isp
    local tr_as
    local tr_mape_notice
    local tr_dslite_notice
    tr_isp=$(translate "tr-isp")
    tr_as=$(translate "tr-as")
    tr_mape_notice=$(translate "tr-mape-notice1")
    tr_dslite_notice=$(translate "tr-dslite-notice1")
    
    if [ "$DETECTED_CONN_TYPE" = "mape" ] && [ -n "$MAPE_BR" ]; then
        local tr_auto_detection
        tr_auto_detection=$(translate "tr-auto-detection")
        local info="${tr_auto_detection}: MAP-E\n\n"
        [ -n "$ISP_NAME" ] && info="${info}${tr_isp}: $ISP_NAME\n"
        [ -n "$ISP_AS" ] && info="${info}${tr_as}: $ISP_AS\n"
        
        info="${info}\n${tr_mape_notice}\n\n"
        [ -n "$MAPE_GUA_PREFIX" ] && info="${info}option ip6prefix_gua $MAPE_GUA_PREFIX\n"
        info="${info}option peeraddr $MAPE_BR\n"
        [ -n "$MAPE_IPV4_PREFIX" ] && info="${info}option ipaddr $MAPE_IPV4_PREFIX\n"
        [ -n "$MAPE_IPV4_PREFIXLEN" ] && info="${info}option ip4prefixlen $MAPE_IPV4_PREFIXLEN\n"
        [ -n "$MAPE_IPV6_PREFIX" ] && info="${info}option ip6prefix $MAPE_IPV6_PREFIX\n"
        [ -n "$MAPE_IPV6_PREFIXLEN" ] && info="${info}option ip6prefixlen $MAPE_IPV6_PREFIXLEN\n"
        [ -n "$MAPE_EALEN" ] && info="${info}option ealen $MAPE_EALEN\n"
        [ -n "$MAPE_PSIDLEN" ] && info="${info}option psidlen $MAPE_PSIDLEN\n"
        [ -n "$MAPE_PSID_OFFSET" ] && info="${info}option offset $MAPE_PSID_OFFSET\n"
        
        info="${info}\n\n$(translate 'tr-tui-use-auto-config')"
        
        if show_yesno "$breadcrumb" "$info"; then
            sed -i "/^connection_type=/d" "$SETUP_VARS"
            echo "connection_type='auto'" >> "$SETUP_VARS"
            
            [ -n "$MAPE_GUA_PREFIX" ] && echo "mape_gua_prefix='$MAPE_GUA_PREFIX'" >> "$SETUP_VARS"
            echo "mape_br='$MAPE_BR'" >> "$SETUP_VARS"
            [ -n "$MAPE_IPV4_PREFIX" ] && echo "mape_ipv4_prefix='$MAPE_IPV4_PREFIX'" >> "$SETUP_VARS"
            [ -n "$MAPE_IPV4_PREFIXLEN" ] && echo "mape_ipv4_prefixlen='$MAPE_IPV4_PREFIXLEN'" >> "$SETUP_VARS"
            [ -n "$MAPE_IPV6_PREFIX" ] && echo "mape_ipv6_prefix='$MAPE_IPV6_PREFIX'" >> "$SETUP_VARS"
            [ -n "$MAPE_IPV6_PREFIXLEN" ] && echo "mape_ipv6_prefixlen='$MAPE_IPV6_PREFIXLEN'" >> "$SETUP_VARS"
            [ -n "$MAPE_EALEN" ] && echo "mape_ealen='$MAPE_EALEN'" >> "$SETUP_VARS"
            [ -n "$MAPE_PSIDLEN" ] && echo "mape_psidlen='$MAPE_PSIDLEN'" >> "$SETUP_VARS"
            [ -n "$MAPE_PSID_OFFSET" ] && echo "mape_psid_offset='$MAPE_PSID_OFFSET'" >> "$SETUP_VARS"
            
            return 0
        else
            reset_detected_conn_type
            return 1
        fi
        
    elif [ "$DETECTED_CONN_TYPE" = "dslite" ] && [ -n "$DSLITE_AFTR" ]; then
        local tr_auto_detection
        tr_auto_detection=$(translate "tr-auto-detection")
        local info="${tr_auto_detection}: DS-Lite\n\n"
        [ -n "$ISP_NAME" ] && info="${info}${tr_isp}: $ISP_NAME\n"
        [ -n "$ISP_AS" ] && info="${info}${tr_as}: $ISP_AS\n"
        
        info="${info}\n${tr_dslite_notice}\n\n"
        info="${info}option peeraddr $DSLITE_AFTR\n"
        
        info="${info}\n\n$(translate 'tr-tui-use-auto-config')"
        
        if show_yesno "$breadcrumb" "$info"; then
            sed -i "/^connection_type=/d" "$SETUP_VARS"
            echo "connection_type='auto'" >> "$SETUP_VARS"
            echo "dslite_aftr_address='$DSLITE_AFTR'" >> "$SETUP_VARS"
            return 0
        else
            reset_detected_conn_type
            return 1
        fi
        
    else
        local tr_isp_info
        local tr_manual_config
        tr_isp_info=$(translate "tr-tui-isp-info")
        tr_manual_config=$(translate "tr-tui-manual-config-required")
        local info="${tr_isp_info}\n\n"
        [ -n "$ISP_NAME" ] && info="${info}${tr_isp}: $ISP_NAME\n"
        [ -n "$ISP_AS" ] && info="${info}${tr_as}: $ISP_AS\n"
        info="${info}\n${tr_manual_config}"
        
        show_msgbox "$breadcrumb" "$info"
        return 1
    fi
}

process_items() {
    local cat_id="$1"
    local item_id="$2"
    local breadcrumb="$3"
    
    echo "[DEBUG] whiptail_process_items: cat_id=$cat_id, item_id=$item_id" >> "$CONFIG_DIR/debug.log"
    
    if ! should_show_item "$item_id"; then
        echo "[DEBUG] Item $item_id hidden by showWhen" >> "$CONFIG_DIR/debug.log"
        return 0
    fi
    
    local item_type
    item_type=$(get_setup_item_type "$item_id")
    echo "[DEBUG] Item type: $item_type" >> "$CONFIG_DIR/debug.log"
    
    local item_label
    item_label=$(get_setup_item_label "$item_id")
    local item_breadcrumb="${breadcrumb}${BREADCRUMB_SEP}${item_label}"
    
    case "$item_type" in
        section)
            echo "[DEBUG] Processing section: $item_id" >> "$CONFIG_DIR/debug.log"
            
            local nested
            nested=$(get_section_nested_items "$item_id")
            for child_id in $nested; do
                if ! whiptail_process_items "$cat_id" "$child_id" "$item_breadcrumb"; then
                    return 1
                fi
            done
            ;;
            
        radio-group)
            local variable
            local default
            variable=$(get_setup_item_variable "$item_id")
            default=$(get_setup_item_default "$item_id")
            
            echo "[DEBUG] radio-group: var=$variable, default=$default" >> "$CONFIG_DIR/debug.log"
            
            if [ "$item_id" = "mape-type" ]; then
                if [ -n "$MAPE_GUA_PREFIX" ]; then
                    default="gua"
                else
                    default="pd"
                fi
            fi
            
            local current
            current=$(grep "^${variable}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
            [ -z "$current" ] && current="$default"
            
            echo "[DEBUG] Current value: $current" >> "$CONFIG_DIR/debug.log"
            
            local options
            options=$(get_setup_item_options "$item_id")
            
            if [ "$variable" = "connection_type" ] && [ "$DETECTED_CONN_TYPE" = "unknown" ]; then
                options=$(echo "$options" | grep -v "^auto$")
                echo "[DEBUG] Removed 'auto' option due to Unknown connection type" >> "$CONFIG_DIR/debug.log"
            fi
            
            echo "[DEBUG] Options: $options" >> "$CONFIG_DIR/debug.log"
            
            local menu_opts=""
            local i=1
            for opt in $options; do
                local opt_label
                opt_label=$(get_setup_item_option_label "$item_id" "$opt")
                menu_opts="$menu_opts $i \"$opt_label\""
                i=$((i+1))
            done
            
            value=$(eval "show_menu \"\$item_breadcrumb\" \"\" \"\" \"\" $menu_opts")
            exit_code=$?
            
            if [ "$exit_code" -ne 0 ]; then
                echo "[DEBUG] Radio-group cancelled, returning to previous menu" >> "$CONFIG_DIR/debug.log"
                return 1
            fi
            
            if [ -n "$value" ]; then
                local selected_opt
                selected_opt=$(echo "$options" | sed -n "${value}p")
                echo "[DEBUG] Selected: $selected_opt" >> "$CONFIG_DIR/debug.log"
                sed -i "/^${variable}=/d" "$SETUP_VARS"
                echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                echo "[DEBUG] Saved to SETUP_VARS" >> "$CONFIG_DIR/debug.log"
                auto_add_conditional_packages "$cat_id"
            fi
            ;;
            
        field)
            local variable
            local default
            local field_type
            variable=$(get_setup_item_variable "$item_id")
            default=$(get_setup_item_default "$item_id")
            field_type=$(get_setup_item_field_type "$item_id")
            
            echo "[DEBUG] field processing: item_id=$item_id" >> "$CONFIG_DIR/debug.log"
            echo "[DEBUG] label='$item_label'" >> "$CONFIG_DIR/debug.log"
            echo "[DEBUG] variable='$variable'" >> "$CONFIG_DIR/debug.log"
            echo "[DEBUG] default='$default'" >> "$CONFIG_DIR/debug.log"
            echo "[DEBUG] field_type='$field_type'" >> "$CONFIG_DIR/debug.log"
            
            local current
            current=$(grep "^${variable}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
            
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
            
            echo "[DEBUG] current='$current'" >> "$CONFIG_DIR/debug.log"
            
            if [ "$field_type" = "computed" ]; then
                if [ "$item_id" = "dslite-aftr-address-computed" ]; then
                    local aftr_type
                    local area
                    aftr_type=$(grep "^dslite_aftr_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                    area=$(grep "^dslite_area=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                    
                    if [ -n "$aftr_type" ] && [ -n "$area" ]; then
                        local computed
                        computed=$(compute_dslite_aftr "$aftr_type" "$area")
                        if [ -n "$computed" ]; then
                            current="$computed"
                            sed -i "/^${variable}=/d" "$SETUP_VARS"
                            echo "${variable}='${computed}'" >> "$SETUP_VARS"
                        fi
                    fi
                fi
            fi
            
            if [ "$field_type" = "select" ]; then
                local source
                source=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].source" 2>/dev/null | head -1)
                
                if [ -n "$source" ]; then
                    echo "[DEBUG] Field uses dynamic source: $source" >> "$CONFIG_DIR/debug.log"
                    
                    case "$source" in
                        "browser-languages")
                            return 0
                            ;;
                        *)
                            echo ""
                            printf "%s [%s]: " "$label" "$current"
                            read -r value
                            
                            if [ -z "$value" ]; then
                                value="$current"
                            fi
                            
                            if [ -n "$value" ]; then
                                sed -i "/^${variable}=/d" "$SETUP_VARS"
                                echo "${variable}='${value}'" >> "$SETUP_VARS"
                            fi
                            ;;
                    esac
                    return 0
                fi
                
                local options
                options=$(get_setup_item_options "$item_id")
                
                echo "[DEBUG] Raw options output: '$options'" >> "$CONFIG_DIR/debug.log"
                
                if [ -z "$options" ]; then
                    echo "[DEBUG] ERROR: No options found for $item_id, skipping" >> "$CONFIG_DIR/debug.log"
                    show_msgbox "$item_breadcrumb" "Error: No options available for $item_label"
                    return 0
                fi
                
                local menu_opts=""
                local i=1
                for opt in $options; do
                    local opt_label
                    opt_label=$(get_setup_item_option_label "$item_id" "$opt")
                    echo "[DEBUG] Option $i: value='$opt', label='$opt_label'" >> "$CONFIG_DIR/debug.log"
                    menu_opts="$menu_opts $i \"$opt_label\""
                    i=$((i+1))
                done
                
                echo "[DEBUG] Final menu_opts='$menu_opts'" >> "$CONFIG_DIR/debug.log"
                
                value=$(eval "show_menu \"\$item_breadcrumb\" \"\" \"\" \"\" $menu_opts")
                exit_code=$?
                
                echo "[DEBUG] select exit_code=$exit_code, value='$value'" >> "$CONFIG_DIR/debug.log"
                
                if [ "$exit_code" -ne 0 ]; then
                    echo "[DEBUG] Select cancelled, returning to previous menu" >> "$CONFIG_DIR/debug.log"
                    return 1
                fi
                
                if [ -n "$value" ]; then
                    local selected_opt
                    selected_opt=$(echo "$options" | sed -n "${value}p")
                    echo "[DEBUG] selected_opt='$selected_opt'" >> "$CONFIG_DIR/debug.log"
                    sed -i "/^${variable}=/d" "$SETUP_VARS"
                    echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                    
                    auto_add_conditional_packages "$cat_id"
                    
                    if [ "$item_id" = "dslite-aftr-type" ] || [ "$item_id" = "dslite-area" ]; then
                        local aftr_type
                        local area
                        local computed
                        aftr_type=$(grep "^dslite_aftr_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                        area=$(grep "^dslite_area=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                        computed=$(compute_dslite_aftr "$aftr_type" "$area")
                        if [ -n "$computed" ]; then
                            sed -i "/^dslite_aftr_address=/d" "$SETUP_VARS"
                            echo "dslite_aftr_address='${computed}'" >> "$SETUP_VARS"
                        fi
                    fi
                fi
            else
                echo "[DEBUG] About to show inputbox for '$item_label'" >> "$CONFIG_DIR/debug.log"
                
                value=$(show_inputbox "$item_breadcrumb" "" "$current")
                exit_code=$?
                
                echo "[DEBUG] inputbox exit_code=$exit_code, value='$value'" >> "$CONFIG_DIR/debug.log"
                
                if [ "$exit_code" -ne 0 ]; then
                    echo "[DEBUG] Inputbox cancelled, returning to previous menu" >> "$CONFIG_DIR/debug.log"
                    return 1
                fi
                
                if [ -n "$value" ]; then
                    sed -i "/^${variable}=/d" "$SETUP_VARS"
                    echo "${variable}='${value}'" >> "$SETUP_VARS"
                    echo "[DEBUG] Saved ${variable}='${value}'" >> "$CONFIG_DIR/debug.log"
                fi
            fi
            ;;
            
        info-display)
            local cat_idx=0
            local item_idx=0
            for cid in $(get_setup_categories); do
                local citems
                citems=$(get_setup_category_items "$cid")
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
            
            local content
            local class
            content=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[$cat_idx].items[$item_idx].content" 2>/dev/null)
            class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[$cat_idx].items[$item_idx].class" 2>/dev/null)
            
            if [ -n "$class" ] && [ "${class#tr-}" != "$class" ]; then
                content=$(translate "$class")
            fi
            
            [ -n "$content" ] && show_msgbox "$breadcrumb" "$content"
            ;;
    esac
    
    return 0
}

show_auto_detection_if_available() {
    if [ "$DETECTED_CONN_TYPE" != "unknown" ] && [ -n "$DETECTED_CONN_TYPE" ]; then
        if show_network_info; then
            auto_add_conditional_packages "internet-connection"
            return 0
        fi
    fi
    return 1
}

category_config() {
    local cat_id="$1"
    local tr_main_menu
    local cat_title
    local base_breadcrumb
    tr_main_menu=$(translate "tr-tui-main-menu")
    cat_title=$(get_setup_category_title "$cat_id")
    base_breadcrumb=$(build_breadcrumb "$tr_main_menu" "$cat_title")

    if [ "$cat_id" = "basic-config" ]; then
        local tr_language
        tr_language=$(translate "tr-language")
        local lang_breadcrumb="${base_breadcrumb}${BREADCRUMB_SEP}${tr_language}"
        
        local current_lang
        current_lang=$(grep "^language=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
        [ -z "$current_lang" ] && current_lang="${AUTO_LANGUAGE:-en}"
        
        value=$(show_inputbox "$lang_breadcrumb" "" "$current_lang")
        
        if [ $? -ne 0 ]; then
            return 0
        fi
        
        if [ -n "$value" ]; then
            sed -i "/^language=/d" "$SETUP_VARS"
            echo "language='${value}'" >> "$SETUP_VARS"
            update_language_packages
        fi
    fi
    
    if [ "$cat_id" = "internet-connection" ]; then
        if show_auto_detection_if_available; then
            auto_add_conditional_packages "$cat_id"
            return 0
        fi
    fi
    
    while true; do
        local found_radio=0
        local radio_breadcrumb="$base_breadcrumb"
        
        for item_id in $(get_setup_category_items "$cat_id"); do
            local item_type
            item_type=$(get_setup_item_type "$item_id")
            
            if [ "$item_type" = "radio-group" ]; then
                found_radio=1
                if ! whiptail_process_items "$cat_id" "$item_id" "$base_breadcrumb"; then
                    return 0
                fi
                
                local radio_label
                radio_label=$(get_setup_item_label "$item_id")
                radio_breadcrumb="${base_breadcrumb}${BREADCRUMB_SEP}${radio_label}"
                
                if [ "$item_id" = "connection-type" ] && [ "$cat_id" = "internet-connection" ]; then
                    local conn_type
                    conn_type=$(grep "^connection_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                    
                    if [ "$conn_type" = "auto" ]; then
                        if show_network_info "$radio_breadcrumb"; then
                            auto_add_conditional_packages "$cat_id"
                            return 0
                        fi
                        continue
                    fi
                    
                    if [ "$conn_type" = "dhcp" ]; then
                        local dhcp_content="DHCP configuration will be applied automatically.\nNo additional settings required."
                        local tr_dhcp
                        tr_dhcp=$(translate "tr-dhcp-information")
                        if [ -n "$tr_dhcp" ] && [ "$tr_dhcp" != "tr-dhcp-information" ]; then
                            dhcp_content="$tr_dhcp"
                        fi
                        show_msgbox "$radio_breadcrumb" "$dhcp_content"
                        auto_add_conditional_packages "$cat_id"
                        return 0
                    fi
                fi
            else
                if ! whiptail_process_items "$cat_id" "$item_id" "$radio_breadcrumb"; then
                    return 0
                fi
            fi
        done
        
        [ "$found_radio" -eq 0 ] && break
    done
    
    auto_add_conditional_packages "$cat_id"
    
    [ "$cat_id" = "basic-config" ] && update_language_packages
    
    return 0
}

package_categories() {
    local tr_main_menu
    local tr_custom_packages
    local breadcrumb
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_custom_packages=$(translate "tr-tui-packages")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_custom_packages")
    
    local menu_items="" i=1 cat_id cat_name
    
    while read -r cat_id; do
        local is_hidden
        is_hidden=$(get_category_hidden "$cat_id")
        [ "$is_hidden" = "true" ] && continue
        
        cat_name=$(get_category_name "$cat_id")
        menu_items="$menu_items $i \"$cat_name\""
        i=$((i+1))
    done <<EOF
$(get_categories)
EOF
    
    choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items")
    
    if [ $? -ne 0 ]; then
        return 0
    fi
    
    if [ -n "$choice" ]; then
        selected_cat=$(get_categories | while read -r cat_id; do
            local is_hidden
            is_hidden=$(get_category_hidden "$cat_id")
            [ "$is_hidden" != "true" ] && echo "$cat_id"
        done | sed -n "${choice}p")
        whiptail_package_selection "$selected_cat" "normal" "$breadcrumb"
    fi
}

package_selection() {
    local cat_id="$1"
    local caller="${2:-normal}"
    local parent_breadcrumb="$3"
    local cat_name
    cat_name=$(get_category_name "$cat_id")
    
    local breadcrumb="${parent_breadcrumb}${BREADCRUMB_SEP}${cat_name}"
    
    local cat_desc
    local tr_space_toggle
    cat_desc=$(get_category_desc "$cat_id")
    tr_space_toggle=$(translate "tr-tui-space-toggle")
    local checklist_items="" pkg_id pkg_name status idx
    
    idx=1
    while read -r pkg_id; do
        pkg_name=$(get_package_name "$pkg_id")
        
        if is_package_selected "$pkg_id" "$caller"; then
            status="ON"
        else
            status="OFF"
        fi
        
        checklist_items="$checklist_items \"$idx\" \"$pkg_name\" $status"
        idx=$((idx+1))
    done <<EOF
$(get_category_packages "$cat_id")
EOF
    
    selected=$(eval "show_checklist \"\$breadcrumb\" \"(\$tr_space_toggle)\" \"\" \"\" $checklist_items")
    
    if [ $? -eq 0 ]; then
        local target_file
        if [ "$caller" = "custom_feeds" ]; then
            target_file="$SELECTED_CUSTOM_PACKAGES"
        else
            target_file="$SELECTED_PACKAGES"
        fi
        
        while read -r pkg_id; do
            sed -i "/^${pkg_id}$/d" "$target_file"
        done <<EOF
$(get_category_packages "$cat_id")
EOF
        
        for idx_str in $selected; do
            local idx_clean
            idx_clean=$(echo "$idx_str" | tr -d '"')
            pkg_id=$(get_category_packages "$cat_id" | sed -n "${idx_clean}p")
            [ -n "$pkg_id" ] && echo "$pkg_id" >> "$target_file"
        done
    fi
    
    if [ "$caller" = "custom_feeds" ]; then
        custom_feeds_selection
    else
        whiptail_package_categories
    fi
}

view_selected_custom_packages() {
    local tr_main_menu
    local tr_review
    local tr_custom_packages
    local breadcrumb
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_review=$(translate "tr-tui-review-configuration")
    tr_custom_packages=$(translate "tr-tui-view-custom-packages")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_review" "$tr_custom_packages")
    
    if [ ! -f "$CUSTOMFEEDS_JSON" ]; then
        show_msgbox "$breadcrumb" "No custom feeds available"
        return 0
    fi
    
    while true; do
        local menu_items="" i=1 cat_id cat_name
        
        while read -r cat_id; do
            cat_name=$(get_category_name "$cat_id")
            menu_items="$menu_items $i \"$cat_name\""
            i=$((i+1))
        done <<EOF
$(get_customfeed_categories)
EOF
        
        if [ -z "$menu_items" ]; then
            show_msgbox "$breadcrumb" "No custom feeds available"
            return 0
        fi
        
        choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items")
        
        if [ $? -ne 0 ]; then
            return 0
        fi
        
        if [ -n "$choice" ]; then
            selected_cat=$(get_customfeed_categories | sed -n "${choice}p")
            local cat_name
            cat_name=$(get_category_name "$selected_cat")
            local cat_breadcrumb="${breadcrumb}${BREADCRUMB_SEP}${cat_name}"
            
            local temp_view="$CONFIG_DIR/selected_custom_pkg_view.txt"
            : > "$temp_view"
            
            while read -r pkg_id; do
                if grep -q "^${pkg_id}$" "$SELECTED_CUSTOM_PACKAGES" 2>/dev/null; then
                    local pkg_name
                    pkg_name=$(get_package_name "$pkg_id")
                    echo "  - ${pkg_name}"
                fi
            done > "$temp_view" <<EOF
$(get_category_packages "$selected_cat")
EOF
            
            if [ -s "$temp_view" ]; then
                show_textbox "$cat_breadcrumb" "$temp_view"
            else
                show_msgbox "$cat_breadcrumb" "$(translate 'tr-tui-no-packages')"
            fi
            
            rm -f "$temp_view"
        fi
    done
}

view_customfeeds() {
    local tr_main_menu
    local tr_review
    local tr_customfeeds
    local breadcrumb
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_review=$(translate "tr-tui-review-configuration")
    tr_customfeeds=$(translate "tr-tui-view-customfeeds")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_review" "$tr_customfeeds")
    
    if [ ! -f "$CUSTOMFEEDS_JSON" ]; then
        show_msgbox "$breadcrumb" "No custom feeds available"
        return 0
    fi
    
    while true; do
        local menu_items="" i=1 cat_id cat_name
        
        while read -r cat_id; do
            cat_name=$(get_category_name "$cat_id")
            menu_items="$menu_items $i \"$cat_name\""
            i=$((i+1))
        done <<EOF
$(get_customfeed_categories)
EOF
        
        if [ -z "$menu_items" ]; then
            show_msgbox "$breadcrumb" "No custom feeds available"
            return 0
        fi
        
        choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items")
        
        if [ $? -ne 0 ]; then
            return 0
        fi
        
        if [ -n "$choice" ]; then
            selected_cat=$(get_customfeed_categories | sed -n "${choice}p")
            local cat_name
            cat_name=$(get_category_name "$selected_cat")
            local cat_breadcrumb="${breadcrumb}${BREADCRUMB_SEP}${cat_name}"
            
            local script_file="$CONFIG_DIR/customfeeds-${selected_cat}.sh"
            
            if [ -f "$script_file" ]; then
                cat "$script_file" > "$CONFIG_DIR/customfeeds_view.txt"
                show_textbox "$cat_breadcrumb" "$CONFIG_DIR/customfeeds_view.txt"
            else
                show_msgbox "$cat_breadcrumb" "Script not found: customfeeds-${selected_cat}.sh"
            fi
        fi
    done
}

main_menu() {
    while true; do
        local tr_main_menu
        tr_main_menu=$(translate "tr-tui-main-menu")
        local menu_items="" i=1 cat_id cat_title
        
        while read -r cat_id; do
            cat_title=$(get_setup_category_title "$cat_id")
            menu_items="$menu_items $i \"$cat_title\""
            i=$((i+1))
        done <<EOF
$(get_setup_categories)
EOF
        
        local packages_label
        packages_label=$(translate "tr-tui-packages")
        menu_items="$menu_items $i \"$packages_label\""
        local packages_choice=$i
        i=$((i+1))
        
        local custom_feeds_choice=0
        if [ "$PKG_MGR" = "opkg" ]; then
            local custom_feeds_label
            custom_feeds_label=$(translate "tr-tui-custom-feeds")
            [ -z "$custom_feeds_label" ] || [ "$custom_feeds_label" = "tr-tui-custom-feeds" ] && custom_feeds_label="Custom Feeds"
            menu_items="$menu_items $i \"$custom_feeds_label\""
            custom_feeds_choice=$i
            i=$((i+1))
        fi
        
        menu_items="$menu_items $i \"$(translate 'tr-tui-review-configuration')\""
        local review_choice=$i
        
        choice=$(eval "show_menu \"\$VERSION\" \"\" \"\$(translate 'tr-tui-select')\" \"\$(translate 'tr-tui-exit')\" $menu_items")
        
        if [ $? -ne 0 ]; then
            return 0
        fi
        
        local setup_cat_count
        setup_cat_count=$(get_setup_categories | wc -l)
        if [ "$choice" -le "$setup_cat_count" ]; then
            selected_cat=$(get_setup_categories | sed -n "${choice}p")
            whiptail_category_config "$selected_cat"
        elif [ "$choice" -eq "$packages_choice" ]; then
            whiptail_package_categories
        elif [ "$custom_feeds_choice" -gt 0 ] && [ "$choice" -eq "$custom_feeds_choice" ]; then
            custom_feeds_selection
        elif [ "$choice" -eq "$review_choice" ]; then
            review_and_apply
        fi
    done
}


review_and_apply() {
    generate_files
    
    local tr_main_menu
    local tr_review
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_review=$(translate "tr-tui-review-configuration")
    
    while true; do
        local breadcrumb
        breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_review")
        
        choice=$(show_menu "$breadcrumb" "" "" "" \
            "1" "$(translate 'tr-tui-view-device-info')" \
            "2" "$(translate 'tr-tui-view-package-list')" \
            "3" "$(translate 'tr-tui-view-custom-packages')" \
            "4" "$(translate 'tr-tui-view-config-vars')" \
            "5" "$(translate 'tr-tui-view-postinst')" \
            "6" "$(translate 'tr-tui-view-customfeeds')" \
            "7" "$(translate 'tr-tui-view-setup')" \
            "8" "$(translate 'tr-tui-apply')")
        
        if [ $? -ne 0 ]; then
            return 0
        fi
        
        case "$choice" in
            1) device_info_titled "$breadcrumb" ;;
            2) show_textbox "$breadcrumb" "$SELECTED_PACKAGES" ;;
            3) view_selected_custom_packages ;;
            4) show_textbox "$breadcrumb" "$SETUP_VARS" ;;
            5) show_textbox "$breadcrumb" "$CONFIG_DIR/postinst.sh" ;;
            6) view_customfeeds ;;
            7) show_textbox "$breadcrumb" "$CONFIG_DIR/setup.sh" ;;
            8) return 0 ;;
        esac
    done
}

aios_whiptail_main() {
    export NEWT_COLORS
    device_info
    main_menu
}
