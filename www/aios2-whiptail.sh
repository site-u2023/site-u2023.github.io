#!/bin/sh
# shellcheck shell=ash
# shellcheck disable=SC3043,SC2034
# OpenWrt Device Setup Tool - whiptail TUI Module
# This file contains whiptail-specific UI functions

VERSION="R7.1121.1629"

NEWT_COLORS='
title=black,lightgray
'

BREADCRUMB_SEP=" > "

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
    local lines height
    
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
    
    local tr_main_menu tr_custom_feeds breadcrumb
    local menu_items i cat_id cat_name choice selected_cat
    local categories
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_custom_feeds=$(translate "tr-tui-custom-feeds")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_custom_feeds")
    
    categories=$(get_customfeed_categories)
    
    menu_items="" 
    i=1
    
    while read -r cat_id; do
        cat_name=$(get_category_name "$cat_id")
        menu_items="$menu_items $i \"$cat_name\""
        i=$((i+1))
    done <<EOF
$categories
EOF
    
    if [ -z "$menu_items" ]; then
        show_msgbox "$breadcrumb" "No custom feeds available"
        return 0
    fi
    
    choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items") || return 0
    
    if [ -n "$choice" ]; then
        selected_cat=$(echo "$categories" | sed -n "${choice}p")
        package_selection "$selected_cat" "custom_feeds" "$breadcrumb"
    fi
}

device_info() {
    local tr_main_menu tr_device_info breadcrumb info
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_device_info=$(translate "tr-tui-view-device-info")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_device_info")
    
    info="Model: $DEVICE_MODEL\n"
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
    local info
    
    info="Model: $DEVICE_MODEL\n"
    info="${info}Target: $DEVICE_TARGET\n"
    info="${info}Version: $OPENWRT_VERSION\n"
    [ -n "$DEVICE_MEM" ] && info="${info}Memory: $DEVICE_MEM\n"
    [ -n "$DEVICE_CPU" ] && info="${info}CPU: $DEVICE_CPU\n"
    [ -n "$DEVICE_STORAGE" ] && info="${info}Storage: $DEVICE_STORAGE_USED/$DEVICE_STORAGE (${DEVICE_STORAGE_AVAIL} free)\n"
    [ -n "$DEVICE_USB" ] && info="${info}USB: $DEVICE_USB\n"
    
    show_msgbox "$title" "$info"
}

show_network_info() {
    local tr_main_menu tr_internet_connection conn_type_label breadcrumb
    local tr_isp tr_as tr_mape_notice tr_dslite_notice tr_auto_detection info
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_internet_connection=$(translate "tr-internet-connection")
    conn_type_label=$(get_setup_item_label "connection-type")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_internet_connection" "$conn_type_label")
    
    tr_isp=$(translate "tr-isp")
    tr_as=$(translate "tr-as")
    tr_mape_notice=$(translate "tr-mape-notice1")
    tr_dslite_notice=$(translate "tr-dslite-notice1")
    
    if [ "$DETECTED_CONN_TYPE" = "mape" ] && [ -n "$MAPE_BR" ]; then
        tr_auto_detection=$(translate "tr-auto-detection")
        info="${tr_auto_detection}: MAP-E\n\n"
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
        tr_auto_detection=$(translate "tr-auto-detection")
        info="${tr_auto_detection}: DS-Lite\n\n"
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
        local tr_isp_info tr_manual_config
        tr_isp_info=$(translate "tr-tui-isp-info")
        tr_manual_config=$(translate "tr-tui-manual-config-required")
        info="${tr_isp_info}\n\n"
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
    local item_type item_label item_breadcrumb nested child_id
    local variable default current options menu_opts i opt opt_label value exit_code selected_opt
    local field_type source aftr_type area computed cat_idx item_idx cid citems idx itm content class
    
    echo "[DEBUG] process_items: cat_id=$cat_id, item_id=$item_id" >> "$CONFIG_DIR/debug.log"
    
    if ! should_show_item "$item_id"; then
        echo "[DEBUG] Item $item_id hidden by showWhen" >> "$CONFIG_DIR/debug.log"
        return 0
    fi
    
    item_type=$(get_setup_item_type "$item_id")
    echo "[DEBUG] Item type: $item_type" >> "$CONFIG_DIR/debug.log"
    
    item_label=$(get_setup_item_label "$item_id")
    item_breadcrumb="${breadcrumb}${BREADCRUMB_SEP}${item_label}"
    
    case "$item_type" in
        section)
            echo "[DEBUG] Processing section: $item_id" >> "$CONFIG_DIR/debug.log"
            
            nested=$(get_section_nested_items "$item_id")
            for child_id in $nested; do
                if ! process_items "$cat_id" "$child_id" "$item_breadcrumb"; then
                    return 1
                fi
            done
            ;;
            
        radio-group)
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
            
            current=$(grep "^${variable}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
            [ -z "$current" ] && current="$default"
            
            echo "[DEBUG] Current value: $current" >> "$CONFIG_DIR/debug.log"
            
            options=$(get_setup_item_options "$item_id")
            
            if [ "$variable" = "connection_type" ] && [ "$DETECTED_CONN_TYPE" = "unknown" ]; then
                options=$(echo "$options" | grep -v "^auto$")
                echo "[DEBUG] Removed 'auto' option due to Unknown connection type" >> "$CONFIG_DIR/debug.log"
            fi
            
            echo "[DEBUG] Options: $options" >> "$CONFIG_DIR/debug.log"
            
            menu_opts=""
            i=1
            for opt in $options; do
                opt_label=$(get_setup_item_option_label "$item_id" "$opt")
                menu_opts="$menu_opts $i \"$opt_label\""
                i=$((i+1))
            done
            
            value=$(eval "show_menu \"\$item_breadcrumb\" \"\" \"\" \"\" $menu_opts")
            exit_code=$?
            
            if ! [ "$exit_code" -eq 0 ]; then
                echo "[DEBUG] Radio-group cancelled, returning to previous menu" >> "$CONFIG_DIR/debug.log"
                return 1
            fi
            
            if [ -n "$value" ]; then
                selected_opt=$(echo "$options" | sed -n "${value}p")
                echo "[DEBUG] Selected: $selected_opt" >> "$CONFIG_DIR/debug.log"
                sed -i "/^${variable}=/d" "$SETUP_VARS"
                echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                echo "[DEBUG] Saved to SETUP_VARS" >> "$CONFIG_DIR/debug.log"
                auto_add_conditional_packages "$cat_id"
            fi
            ;;
            
        field)
            variable=$(get_setup_item_variable "$item_id")
            default=$(get_setup_item_default "$item_id")
            field_type=$(get_setup_item_field_type "$item_id")
            
            echo "[DEBUG] field processing: item_id=$item_id" >> "$CONFIG_DIR/debug.log"
            echo "[DEBUG] label='$item_label'" >> "$CONFIG_DIR/debug.log"
            echo "[DEBUG] variable='$variable'" >> "$CONFIG_DIR/debug.log"
            echo "[DEBUG] default='$default'" >> "$CONFIG_DIR/debug.log"
            echo "[DEBUG] field_type='$field_type'" >> "$CONFIG_DIR/debug.log"
            
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
                    aftr_type=$(grep "^dslite_aftr_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                    area=$(grep "^dslite_area=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                    
                    if [ -n "$aftr_type" ] && [ -n "$area" ]; then
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
                source=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].source" 2>/dev/null | head -1)
                
                if [ -n "$source" ]; then
                    echo "[DEBUG] Field uses dynamic source: $source" >> "$CONFIG_DIR/debug.log"
                    
                    case "$source" in
                        "browser-languages")
                            return 0
                            ;;
                        *)
                            echo ""
                            printf "%s [%s]: " "$item_label" "$current"
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
                
                options=$(get_setup_item_options "$item_id")
                
                echo "[DEBUG] Raw options output: '$options'" >> "$CONFIG_DIR/debug.log"
                
                if [ -z "$options" ]; then
                    echo "[DEBUG] ERROR: No options found for $item_id, skipping" >> "$CONFIG_DIR/debug.log"
                    show_msgbox "$item_breadcrumb" "Error: No options available for $item_label"
                    return 0
                fi
                
                menu_opts=""
                i=1
                for opt in $options; do
                    opt_label=$(get_setup_item_option_label "$item_id" "$opt")
                    echo "[DEBUG] Option $i: value='$opt', label='$opt_label'" >> "$CONFIG_DIR/debug.log"
                    menu_opts="$menu_opts $i \"$opt_label\""
                    i=$((i+1))
                done
                
                echo "[DEBUG] Final menu_opts='$menu_opts'" >> "$CONFIG_DIR/debug.log"
                
                value=$(eval "show_menu \"\$item_breadcrumb\" \"\" \"\" \"\" $menu_opts")
                exit_code=$?
                
                echo "[DEBUG] select exit_code=$exit_code, value='$value'" >> "$CONFIG_DIR/debug.log"
                
                if ! [ "$exit_code" -eq 0 ]; then
                    echo "[DEBUG] Select cancelled, returning to previous menu" >> "$CONFIG_DIR/debug.log"
                    return 1
                fi
                
                if [ -n "$value" ]; then
                    selected_opt=$(echo "$options" | sed -n "${value}p")
                    echo "[DEBUG] selected_opt='$selected_opt'" >> "$CONFIG_DIR/debug.log"
                    sed -i "/^${variable}=/d" "$SETUP_VARS"
                    echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                    
                    auto_add_conditional_packages "$cat_id"
                    
                    if [ "$item_id" = "dslite-aftr-type" ] || [ "$item_id" = "dslite-area" ]; then
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
                
                if ! [ "$exit_code" -eq 0 ]; then
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
            cat_idx=0
            item_idx=0
            for cid in $(get_setup_categories); do
                citems=$(get_setup_category_items "$cid")
                idx=0
                for itm in $citems; do
                    if [ "$itm" = "$item_id" ]; then
                        item_idx=$idx
                        break 2
                    fi
                    idx=$((idx+1))
                done
                cat_idx=$((cat_idx+1))
            done
            
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
    local tr_main_menu cat_title base_breadcrumb
    local tr_language lang_breadcrumb current_lang value
    local found_radio radio_breadcrumb item_id item_type radio_label conn_type dhcp_content tr_dhcp
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    cat_title=$(get_setup_category_title "$cat_id")
    base_breadcrumb=$(build_breadcrumb "$tr_main_menu" "$cat_title")

    if [ "$cat_id" = "basic-config" ]; then
        tr_language=$(translate "tr-language")
        lang_breadcrumb="${base_breadcrumb}${BREADCRUMB_SEP}${tr_language}"
        
        current_lang=$(grep "^language=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
        [ -z "$current_lang" ] && current_lang="${AUTO_LANGUAGE:-en}"
        
        value=$(show_inputbox "$lang_breadcrumb" "" "$current_lang")
        
        if ! [ $? -eq 0 ]; then
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
        found_radio=0
        radio_breadcrumb="$base_breadcrumb"
        
        for item_id in $(get_setup_category_items "$cat_id"); do
            item_type=$(get_setup_item_type "$item_id")
            
            if [ "$item_type" = "radio-group" ]; then
                found_radio=1
                if ! process_items "$cat_id" "$item_id" "$base_breadcrumb"; then
                    return 0
                fi
                
                radio_label=$(get_setup_item_label "$item_id")
                radio_breadcrumb="${base_breadcrumb}${BREADCRUMB_SEP}${radio_label}"
                
                if [ "$item_id" = "connection-type" ] && [ "$cat_id" = "internet-connection" ]; then
                    conn_type=$(grep "^connection_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                    
                    if [ "$conn_type" = "auto" ]; then
                        if show_network_info "$radio_breadcrumb"; then
                            auto_add_conditional_packages "$cat_id"
                            return 0
                        fi
                        continue
                    fi
                    
                    if [ "$conn_type" = "dhcp" ]; then
                        dhcp_content="DHCP configuration will be applied automatically.\nNo additional settings required."
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
                if ! process_items "$cat_id" "$item_id" "$radio_breadcrumb"; then
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
    local tr_main_menu tr_custom_packages breadcrumb
    local menu_items i cat_id cat_name choice selected_cat is_hidden
    local categories visible_categories
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_custom_packages=$(translate "tr-tui-packages")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_custom_packages")
    
    categories=$(get_categories)
    visible_categories=""
    
    while read -r cat_id; do
        is_hidden=$(get_category_hidden "$cat_id")
        [ "$is_hidden" = "true" ] && continue
        visible_categories="${visible_categories}${cat_id}
"
    done <<EOF
$categories
EOF
    
    menu_items="" 
    i=1
    
    while read -r cat_id; do
        [ -z "$cat_id" ] && continue
        cat_name=$(get_category_name "$cat_id")
        menu_items="$menu_items $i \"$cat_name\""
        i=$((i+1))
    done <<EOF
$visible_categories
EOF
    
    choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items")
    
    if ! [ $? -eq 0 ]; then
        return 0
    fi
    
    if [ -n "$choice" ]; then
        selected_cat=$(echo "$visible_categories" | sed -n "${choice}p")
        package_selection "$selected_cat" "normal" "$breadcrumb"
    fi
}

package_selection() {
    local cat_id="$1"
    local caller="${2:-normal}"
    local parent_breadcrumb="$3"
    local cat_name breadcrumb checklist_items
    local pkg_id pkg_name status idx selected target_file idx_str idx_clean
    local packages
    
    cat_name=$(get_category_name "$cat_id")
    breadcrumb="${parent_breadcrumb}${BREADCRUMB_SEP}${cat_name}"
    
    packages=$(get_category_packages "$cat_id")
    checklist_items=""
    
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
$packages
EOF
    
    selected=$(eval "show_checklist \"\$breadcrumb\" \"($(translate 'tr-tui-space-toggle'))\" \"\" \"\" $checklist_items")
    
    if [ $? -eq 0 ]; then
        if [ "$caller" = "custom_feeds" ]; then
            target_file="$SELECTED_CUSTOM_PACKAGES"
        else
            target_file="$SELECTED_PACKAGES"
        fi
        
        while read -r pkg_id; do
            sed -i "/^${pkg_id}$/d" "$target_file"
        done <<EOF2
$packages
EOF2
        
        for idx_str in $selected; do
            idx_clean=$(echo "$idx_str" | tr -d '"')
            pkg_id=$(echo "$packages" | sed -n "${idx_clean}p")
            [ -n "$pkg_id" ] && echo "$pkg_id" >> "$target_file"
        done
    fi
    
    if [ "$caller" = "custom_feeds" ]; then
        custom_feeds_selection
    else
        package_categories
    fi
}

view_selected_custom_packages() {
    local tr_main_menu tr_review tr_custom_packages breadcrumb
    local menu_items i cat_id cat_name choice selected_cat cat_breadcrumb temp_view pkg_id pkg_name
    local categories
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_review=$(translate "tr-tui-review-configuration")
    tr_custom_packages=$(translate "tr-tui-view-custom-packages")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_review" "$tr_custom_packages")
    
    if [ ! -f "$CUSTOMFEEDS_JSON" ]; then
        show_msgbox "$breadcrumb" "No custom feeds available"
        return 0
    fi
    
    categories=$(get_customfeed_categories)
    
    while true; do
        menu_items="" 
        i=1
        
        while read -r cat_id; do
            cat_name=$(get_category_name "$cat_id")
            menu_items="$menu_items $i \"$cat_name\""
            i=$((i+1))
        done <<EOF
$categories
EOF
        
        if [ -z "$menu_items" ]; then
            show_msgbox "$breadcrumb" "No custom feeds available"
            return 0
        fi
        
        choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items")
        
        if ! [ $? -eq 0 ]; then
            return 0
        fi
        
        if [ -n "$choice" ]; then
            selected_cat=$(echo "$categories" | sed -n "${choice}p")
            cat_name=$(get_category_name "$selected_cat")
            cat_breadcrumb="${breadcrumb}${BREADCRUMB_SEP}${cat_name}"
            
            temp_view="$CONFIG_DIR/selected_custom_pkg_view.txt"
            : > "$temp_view"
            
            while read -r pkg_id; do
                if grep -q "^${pkg_id}$" "$SELECTED_CUSTOM_PACKAGES" 2>/dev/null; then
                    pkg_name=$(get_package_name "$pkg_id")
                    echo "  - ${pkg_name}"
                fi
            done <<EOF2 > "$temp_view"
$(get_category_packages "$selected_cat")
EOF2
            
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
    local tr_main_menu tr_review tr_customfeeds breadcrumb
    local menu_items i cat_id cat_name choice selected_cat cat_breadcrumb script_file
    local categories
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_review=$(translate "tr-tui-review-configuration")
    tr_customfeeds=$(translate "tr-tui-view-customfeeds")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_review" "$tr_customfeeds")
    
    if [ ! -f "$CUSTOMFEEDS_JSON" ]; then
        show_msgbox "$breadcrumb" "No custom feeds available"
        return 0
    fi
    
    categories=$(get_customfeed_categories)
    
    while true; do
        menu_items="" 
        i=1
        
        while read -r cat_id; do
            cat_name=$(get_category_name "$cat_id")
            menu_items="$menu_items $i \"$cat_name\""
            i=$((i+1))
        done <<EOF
$categories
EOF
        
        if [ -z "$menu_items" ]; then
            show_msgbox "$breadcrumb" "No custom feeds available"
            return 0
        fi
        
        choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items")
        
        if ! [ $? -eq 0 ]; then
            return 0
        fi
        
        if [ -n "$choice" ]; then
            selected_cat=$(echo "$categories" | sed -n "${choice}p")
            cat_name=$(get_category_name "$selected_cat")
            cat_breadcrumb="${breadcrumb}${BREADCRUMB_SEP}${cat_name}"
            
            script_file="$CONFIG_DIR/customfeeds-${selected_cat}.sh"
            
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
    local tr_main_menu tr_select tr_exit packages_label custom_feeds_label review_label
    local setup_categories setup_cat_count
    local menu_items i cat_id cat_title packages_choice custom_feeds_choice review_choice choice selected_cat
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_select=$(translate "tr-tui-select")
    tr_exit=$(translate "tr-tui-exit")
    packages_label=$(translate "tr-tui-packages")
    custom_feeds_label=$(translate "tr-tui-custom-feeds")
    [ -z "$custom_feeds_label" ] || [ "$custom_feeds_label" = "tr-tui-custom-feeds" ] && custom_feeds_label="Custom Feeds"
    review_label=$(translate "tr-tui-review-configuration")
    
    setup_categories=$(get_setup_categories)
    setup_cat_count=$(echo "$setup_categories" | wc -l)
    
    while true; do
        menu_items="" 
        i=1
        
        while read -r cat_id; do
            cat_title=$(get_setup_category_title "$cat_id")
            menu_items="$menu_items $i \"$cat_title\""
            i=$((i+1))
        done <<EOF
$setup_categories
EOF
        
        menu_items="$menu_items $i \"$packages_label\""
        packages_choice=$i
        i=$((i+1))
        
        custom_feeds_choice=0
        if [ "$PKG_MGR" = "opkg" ]; then
            menu_items="$menu_items $i \"$custom_feeds_label\""
            custom_feeds_choice=$i
            i=$((i+1))
        fi
        
        menu_items="$menu_items $i \"$review_label\""
        review_choice=$i
        
        choice=$(eval "show_menu \"\$VERSION\" \"\" \"\$tr_select\" \"\$tr_exit\" $menu_items")
        
        if ! [ $? -eq 0 ]; then
            return 0
        fi
        
        if [ "$choice" -le "$setup_cat_count" ]; then
            selected_cat=$(echo "$setup_categories" | sed -n "${choice}p")
            category_config "$selected_cat"
        elif [ "$choice" -eq "$packages_choice" ]; then
            package_categories
        elif [ "$custom_feeds_choice" -gt 0 ] && [ "$choice" -eq "$custom_feeds_choice" ]; then
            custom_feeds_selection
        elif [ "$choice" -eq "$review_choice" ]; then
            review_and_apply
        fi
    done
}

review_and_apply() {
    generate_files
    
    local tr_main_menu tr_review breadcrumb
    local review_items menu_items i choice action file
    local confirm_msg
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_review=$(translate "tr-tui-review-configuration")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_review")
    
    review_items=$(get_review_items)
    
    while true; do
        menu_items=""
        for i in $review_items; do
            menu_items="$menu_items $i \"$(get_review_item_label $i)\""
        done
        
        choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items")
        
        if ! [ $? -eq 0 ]; then
            return 0
        fi
        
        action=$(get_review_item_action $choice)
        
        case "$action" in
            device_info)
                device_info_titled "$breadcrumb"
                ;;
            textbox)
                file=$(get_review_item_file $choice)
                [ -f "$file" ] && show_textbox "$breadcrumb" "$file"
                ;;
            view_selected_custom_packages|view_customfeeds)
                $action
                ;;
            apply)
                confirm_msg="$(translate 'tr-tui-apply-confirm-step1')
$(translate 'tr-tui-apply-confirm-step2')
$(translate 'tr-tui-apply-confirm-step3')
$(translate 'tr-tui-apply-confirm-step4')

$(translate 'tr-tui-apply-confirm-question')"
                
                if show_yesno "$breadcrumb" "$confirm_msg"; then
                    sh "$CONFIG_DIR/postinst.sh" > "$CONFIG_DIR/apply.log" 2>&1
                    for script in "$CONFIG_DIR"/customfeeds-*.sh; do
                        [ -f "$script" ] && sh "$script" >> "$CONFIG_DIR/apply.log" 2>&1
                    done
                    sh "$CONFIG_DIR/setup.sh" >> "$CONFIG_DIR/apply.log" 2>&1
                    show_msgbox "$breadcrumb" "$(translate 'tr-tui-config-applied')"
                    if show_yesno "$breadcrumb" "$(translate 'tr-tui-reboot-question')"; then
                        reboot
                    fi
                    return 0
                fi
                ;;
        esac
    done
}

aios2_whiptail_main() {
    export NEWT_COLORS
    device_info
    main_menu
}
