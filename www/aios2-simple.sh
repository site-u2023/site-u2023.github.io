#!/bin/sh
# shellcheck shell=ash
# shellcheck disable=SC3043,SC2034
# OpenWrt Device Setup Tool - simple TEXT Module
# This file contains simple text-based UI functions

VERSION="R7.1121.1249"

show_menu() {
    local title="$1"
    shift
    
    clear
    echo "=== $title ===" | fold -s -w 78
    echo ""
    
    local i=1
    while [ $# -gt 0 ]; do
        echo "$i) $1" | fold -s -w 76
        shift
        i=$((i+1))
    done
    
    echo "b) $(translate 'tr-tui-back')"
    echo ""
    printf "$(translate 'tr-tui-ui-choice'): "
    read choice
    echo "$choice"
}

# UI Mode Selection


custom_feeds_selection() {
    if [ "$PKG_MGR" != "opkg" ]; then
        clear
        echo "========================================"
        echo "  $(translate 'tr-tui-custom-feeds')"
        echo "========================================"
        echo ""
        echo "Custom feeds are only available for OPKG"
        echo ""
        printf "$(translate 'tr-tui-ok')"
        read
        return 0
    fi
    
    download_customfeeds_json || {
        clear
        echo "========================================"
        echo "  $(translate 'tr-tui-custom-feeds')"
        echo "========================================"
        echo ""
        echo "Failed to load custom feeds"
        echo ""
        printf "$(translate 'tr-tui-ok')"
        read
        return 0
    }
    
    local cat_id=$(get_customfeed_categories | head -1)
    
    if [ -z "$cat_id" ]; then
        clear
        echo "========================================"
        echo "  $(translate 'tr-tui-custom-feeds')"
        echo "========================================"
        echo ""
        echo "No custom feeds available"
        echo ""
        printf "$(translate 'tr-tui-ok')"
        read
        return 0
    fi
    
    package_selection "$cat_id"
}

review_and_apply() {
    generate_files
    
    while true; do
        clear
        echo "========================================"
        echo "  $(translate 'tr-tui-review-configuration')"
        echo "========================================"
        echo ""
        
        for i in $(get_review_items); do
            echo "$i) $(get_review_item_label $i)"
        done
        
        echo "b) $(translate 'tr-tui-back')"
        printf "$(translate 'tr-tui-ui-choice'): "
        read choice
        
        [ "$choice" = "b" ] && return 0
        
        local action=$(get_review_item_action $choice)
        
        case "$action" in
            device_info) 
                device_info 
                ;;
            textbox)
                local file=$(get_review_item_file $choice)
                clear
                echo "========================================"
                echo "  $(get_review_item_label $choice)"
                echo "========================================"
                [ -f "$file" ] && cat "$file"
                read
                ;;
            view_selected_custom_packages|view_customfeeds)
                $action
                ;;
            apply)
                clear
                echo "========================================"
                echo "  $(translate 'tr-tui-apply')"
                echo "========================================"
                echo ""
                echo "$(translate 'tr-tui-apply-confirm-step1')"
                echo "$(translate 'tr-tui-apply-confirm-step2')"
                echo "$(translate 'tr-tui-apply-confirm-step3')"
                echo "$(translate 'tr-tui-apply-confirm-step4')"
                echo ""
                echo "$(translate 'tr-tui-apply-confirm-question')"
                echo ""
                printf "$(translate 'tr-tui-yes')/$(translate 'tr-tui-no'): "
                read confirm
                
                if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
                    echo ""
                    echo "$(translate 'tr-tui-installing-packages')"
                    sh "$CONFIG_DIR/postinst.sh"
                    
                    echo "$(translate 'tr-tui-installing-custom-packages')"
                    for script in "$CONFIG_DIR"/customfeeds-*.sh; do
                        [ -f "$script" ] && sh "$script"
                    done
                    
                    echo ""
                    echo "$(translate 'tr-tui-applying-config')"
                    sh "$CONFIG_DIR/setup.sh"
                    echo ""
                    echo "$(translate 'tr-tui-config-applied')"
                    echo ""
                    printf "$(translate 'tr-tui-reboot-question') (y/n): "
                    read reboot_confirm
                    if [ "$reboot_confirm" = "y" ] || [ "$reboot_confirm" = "Y" ]; then
                        reboot
                    fi
                    return 0
                fi
                ;;
        esac
    done
}

# Simple Mode UI Functions

device_info() {
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
    printf "$(translate 'tr-tui-ok')"
    read
}

show_network_info() {
    clear
    echo "========================================"
    echo "  $(translate 'tr-auto-detection')"
    echo "========================================"
    echo ""
    
    if [ -z "$DETECTED_CONN_TYPE" ] || [ "$DETECTED_CONN_TYPE" = "unknown" ]; then
        echo "No configuration detected."
        echo ""
        printf "$(translate 'tr-tui-ok')"
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
    
    if [ "$DETECTED_CONN_TYPE" = "mape" ] && [ -n "$MAPE_BR" ]; then
        echo "$(translate 'tr-mape'):"
        [ -n "$MAPE_GUA_PREFIX" ] && echo "  option ip6prefix_gua $MAPE_GUA_PREFIX"
        echo "  option peeraddr $MAPE_BR"
        [ -n "$MAPE_IPV4_PREFIX" ] && echo "  option ipaddr $MAPE_IPV4_PREFIX"
        [ -n "$MAPE_IPV4_PREFIXLEN" ] && echo "  option ip4prefixlen $MAPE_IPV4_PREFIXLEN"
        [ -n "$MAPE_IPV6_PREFIX" ] && echo "  option ip6prefix $MAPE_IPV6_PREFIX"
        [ -n "$MAPE_IPV6_PREFIXLEN" ] && echo "  option ip6prefixlen $MAPE_IPV6_PREFIXLEN"
        [ -n "$MAPE_EALEN" ] && echo "  option ealen $MAPE_EALEN"
        [ -n "$MAPE_PSIDLEN" ] && echo "  option psidlen $MAPE_PSIDLEN"
        [ -n "$MAPE_PSID_OFFSET" ] && echo "  option offset $MAPE_PSID_OFFSET"
    elif [ "$DETECTED_CONN_TYPE" = "dslite" ] && [ -n "$DSLITE_AFTR" ]; then
        echo "$(translate 'tr-dslite'):"
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

process_items() {
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
                
                printf "$(translate 'tr-tui-ui-choice') [Enter=keep current]: "
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
                    process_items "$cat_id" "$nested"
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
                    
                    printf "$(translate 'tr-tui-ui-choice') [Enter=keep current]: "
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

category_config() {
    local cat_id="$1"
    local cat_title=$(get_setup_category_title "$cat_id")
    
    clear
    echo "========================================"
    echo "  $cat_title"
    echo "========================================"
    
    if [ "$cat_id" = "basic-config" ]; then
        local tr_language=$(translate "tr-language")
        [ -z "$tr_language" ] || [ "$tr_language" = "tr-language" ] && tr_language="Language"
        
        local current_lang=$(grep "^language=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
        [ -z "$current_lang" ] && current_lang="${AUTO_LANGUAGE:-en}"
        
        echo ""
        printf "$tr_language [$current_lang]: "
        read value
        
        if [ -z "$value" ]; then
            value="$current_lang"
        fi
        
        if [ -n "$value" ]; then
            sed -i "/^language=/d" "$SETUP_VARS"
            echo "language='${value}'" >> "$SETUP_VARS"
            update_language_packages
        fi
    fi
    
    if [ "$cat_id" = "internet-connection" ]; then
        if show_network_info; then
            echo ""
            echo "$(translate 'tr-tui-auto-config-applied')"
            sleep 2
            return 0
        fi
    fi
    
    process_items "$cat_id" ""
    
    auto_add_conditional_packages "$cat_id"
    
    echo ""
    echo "Configuration completed!"
    printf "$(translate 'tr-tui-ok')"
    read
}

package_categories() {
    while true; do
        clear
        echo "========================================"
        echo "  $(translate 'tr-tui-packages')"
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
        printf "$(translate 'tr-tui-ui-choice'): "
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
                package_selection "$selected_cat"
            fi
        fi
    done
}

package_selection() {
    local cat_id="$1"
    local cat_name=$(get_category_name "$cat_id")
    local cat_desc=$(get_category_desc "$cat_id")
    
    clear
    echo "========================================"
    echo "  $(translate 'tr-tui-packages') > $cat_name"
    echo "========================================"
    echo ""
    echo "$cat_desc"
    echo ""
    
    get_category_packages "$cat_id" | while read pkg_id; do
        local pkg_name=$(get_package_name "$pkg_id")
        
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
        echo "$i) $pkg_name"
        i=$((i+1))
    done
    
    echo ""
    printf "$(translate 'tr-tui-ui-choice'): "
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
            package_selection "$cat_id"
        fi
    fi
}

view_customfeeds() {
    clear
    echo "========================================"
    echo "  $(translate 'tr-tui-view-customfeeds')"
    echo "========================================"
    echo ""
    
    if [ ! -f "$CUSTOMFEEDS_JSON" ]; then
        echo "No custom feeds available"
        echo ""
        printf "$(translate 'tr-tui-ok')"
        read
        return 0
    fi
    
    local i=1
    get_customfeed_categories | while read cat_id; do
        local cat_name=$(get_category_name "$cat_id")
        echo "$i) $cat_name"
        i=$((i+1))
    done
    
    echo "b) $(translate 'tr-tui-back')"
    echo ""
    printf "$(translate 'tr-tui-ui-choice'): "
    read choice
    
    if [ "$choice" = "b" ] || [ "$choice" = "B" ]; then
        return 0
    fi
    
    if [ -n "$choice" ]; then
        selected_cat=$(get_customfeed_categories | sed -n "${choice}p")
        local script_file="$CONFIG_DIR/customfeeds-${selected_cat}.sh"
        
        clear
        echo "========================================"
        echo "  customfeeds-${selected_cat}.sh"
        echo "========================================"
        echo ""
        
        if [ -f "$script_file" ]; then
            cat "$script_file"
        else
            echo "Script not found"
        fi
        
        echo ""
        printf "Press Enter to continue..."
        read
    fi
}

view_selected_custom_packages() {
    clear
    echo "========================================"
    echo "  $(translate 'tr-tui-view-custom-packages')"
    echo "========================================"
    echo ""
    
    if [ ! -f "$CUSTOMFEEDS_JSON" ]; then
        echo "No custom feeds available"
        echo ""
        printf "$(translate 'tr-tui-ok')"
        read
        return 0
    fi
    
    local i=1
    get_customfeed_categories | while read cat_id; do
        local cat_name=$(get_category_name "$cat_id")
        echo "$i) $cat_name"
        i=$((i+1))
    done
    
    echo "b) $(translate 'tr-tui-back')"
    echo ""
    printf "$(translate 'tr-tui-ui-choice'): "
    read choice
    
    if [ "$choice" = "b" ] || [ "$choice" = "B" ]; then
        return 0
    fi
    
    if [ -n "$choice" ]; then
        selected_cat=$(get_customfeed_categories | sed -n "${choice}p")
        local cat_name=$(get_category_name "$selected_cat")
        
        clear
        echo "========================================"
        echo "  ${cat_name}"
        echo "========================================"
        echo ""
        
        local has_packages=0
        get_category_packages "$selected_cat" | while read pkg_id; do
            if grep -q "^${pkg_id}$" "$SELECTED_CUSTOM_PACKAGES" 2>/dev/null; then
                local pkg_name=$(get_package_name "$pkg_id")
                echo "  - ${pkg_name}"
                has_packages=1
            fi
        done
        
        if [ $has_packages -eq 0 ]; then
            echo "  $(translate 'tr-tui-no-packages')"
        fi
        
        echo ""
        printf "$(translate 'tr-tui-ok')"
        read
    fi
}

main_menu() {
    while true; do
        clear
        echo "========================================"
        echo "  aios2 Vr.$VERSION"
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
        
        local packages_label=$(translate "tr-tui-packages")
        echo "$i) $packages_label"
        local packages_choice=$i
        i=$((i+1))
        
        local custom_feeds_choice=0
        if [ "$PKG_MGR" = "opkg" ]; then
            local custom_feeds_label=$(translate "tr-tui-custom-feeds")
            [ -z "$custom_feeds_label" ] || [ "$custom_feeds_label" = "tr-tui-custom-feeds" ] && custom_feeds_label="Custom Feeds"
            echo "$i) $custom_feeds_label"
            custom_feeds_choice=$i
            i=$((i+1))
        fi
        
        echo "$i) $(translate 'tr-tui-review-configuration')"
        local review_choice=$i
        i=$((i+1))
        echo "$i) $(translate 'tr-tui-exit')"
        local exit_choice=$i
        
        echo ""
        printf "$(translate 'tr-tui-ui-choice'): "
        read choice
        
        if [ -z "$choice" ]; then
            continue
        fi
        
        local setup_cat_count=$(get_setup_categories | wc -l)
        if [ "$choice" -le "$setup_cat_count" ]; then
            selected_cat=$(get_setup_categories | sed -n "${choice}p")
            category_config "$selected_cat"
        elif [ "$choice" -eq "$packages_choice" ]; then
            package_categories
        elif [ "$custom_feeds_choice" -gt 0 ] && [ "$choice" -eq "$custom_feeds_choice" ]; then
            custom_feeds_selection
        elif [ "$choice" -eq "$review_choice" ]; then
            review_and_apply
        elif [ "$choice" -eq "$exit_choice" ]; then
            return 0
        fi
    done
}

# Main Entry Point


# Simple Main Entry Point

aios2_simple_main() {
    device_info
    main_menu
}
