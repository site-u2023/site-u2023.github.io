#!/bin/sh
# shellcheck shell=ash
# shellcheck disable=SC3043,SC2034
# OpenWrt Device Setup Tool - simple TEXT Module
# This file contains simple text-based UI functions

VERSION="R7.1121.1621"

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
    read -r choice
    echo "$choice"
}

show_msgbox() {
    local breadcrumb="$1"
    local message="$2"
    
    clear
    echo "========================================"
    echo "  $breadcrumb"
    echo "========================================"
    echo ""
    echo "$message"
    echo ""
    printf "%s: " "$(translate 'tr-tui-ok')"
    read -r _
}

# Package Compatibility Check for Custom Feeds

package_compatible() {
    local pkg_id="$1"
    local pkg_managers
    
    pkg_managers=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].packageManager[*]" 2>/dev/null)
    
    [ -z "$pkg_managers" ] && return 0
    
    echo "$pkg_managers" | grep -q "^${PKG_MGR}$" && return 0
    
    return 1
}

custom_feeds_selection() {
    local tr_main_menu tr_custom_feeds breadcrumb
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_custom_feeds=$(translate "tr-tui-custom-feeds")
    breadcrumb="${tr_main_menu} > ${tr_custom_feeds}"
    
    download_customfeeds_json || {
        show_msgbox "$breadcrumb" "Failed to load custom feeds"
        return 0
    }
    
    local cat_id
    cat_id=$(get_customfeed_categories | head -1)
    
    if [ -z "$cat_id" ]; then
        show_msgbox "$breadcrumb" "No custom feeds available"
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
            echo "$i) $(get_review_item_label "$i")"
        done
        
        echo "b) $(translate 'tr-tui-back')"
        printf "$(translate 'tr-tui-ui-choice'): "
        read -r choice
        
        [ "$choice" = "b" ] && return 0
        
        local action
        action=$(get_review_item_action $choice)
        
        case "$action" in
            device_info) 
                device_info 
                ;;
            textbox)
                local file
                file=$(get_review_item_file $choice)
                clear
                echo "========================================"
                echo "  $(get_review_item_label $choice)"
                echo "========================================"
                [ -f "$file" ] && cat "$file"
                printf "%s: " "$(translate 'tr-tui-ok')"
                read -r _
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

device_info() {
    local tr_main_menu tr_device_info breadcrumb info
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_device_info=$(translate "tr-tui-view-device-info")
    breadcrumb="${tr_main_menu} > ${tr_device_info}"
    
    info="Model: $DEVICE_MODEL\n"
    info="${info}Target: $DEVICE_TARGET\n"
    info="${info}Version: $OPENWRT_VERSION\n"
    [ -n "$DEVICE_MEM" ] && info="${info}Memory: $DEVICE_MEM\n"
    [ -n "$DEVICE_CPU" ] && info="${info}CPU: $DEVICE_CPU\n"
    [ -n "$DEVICE_STORAGE" ] && info="${info}Storage: $DEVICE_STORAGE_USED/$DEVICE_STORAGE (${DEVICE_STORAGE_AVAIL} free)\n"
    [ -n "$DEVICE_USB" ] && info="${info}USB: $DEVICE_USB\n"
    
    show_msgbox "$breadcrumb" "$info"
}

show_network_info() {
    local tr_main_menu tr_internet_connection conn_type_label breadcrumb
    local tr_isp tr_as info
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_internet_connection=$(translate "tr-internet-connection")
    conn_type_label=$(get_setup_item_label "connection-type")
    breadcrumb="${tr_main_menu} > ${tr_internet_connection} > ${conn_type_label}"
    
    if [ -z "$DETECTED_CONN_TYPE" ] || [ "$DETECTED_CONN_TYPE" = "unknown" ]; then
        show_msgbox "$breadcrumb" "No configuration detected."
        return 1
    fi
    
    tr_isp=$(translate "tr-isp")
    tr_as=$(translate "tr-as")
    
    clear
    echo "========================================"
    echo "  $breadcrumb"
    echo "========================================"
    echo ""
    echo "$(translate 'tr-connection-type'): $DETECTED_CONN_TYPE"
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
        local item_type
        item_type=$(get_setup_item_type "$item_id")
        
        if ! should_show_item "$item_id"; then
            continue
        fi
        
        case "$item_type" in
            radio-group)
                local label
                label=$(get_setup_item_label "$item_id")
                local variable
                variable=$(get_setup_item_variable "$item_id")
                local default
                default=$(get_setup_item_default "$item_id")
                
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
                
                local options
                options=$(get_setup_item_options "$item_id")
                
                echo ""
                echo "$label:"
                local i=1
                for opt in $options; do
                    local opt_label
                    opt_label=$(get_setup_item_option_label "$item_id" "$opt")
                    if [ "$opt" = "$current" ]; then
                        echo "$i) $opt_label [current]"
                    else
                        echo "$i) $opt_label"
                    fi
                    i=$((i+1))
                done
                
                printf "$(translate 'tr-tui-ui-choice') [Enter=keep current]: "
                read -r choice
                
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
                local nested
                nested=$(get_section_nested_items "$item_id")
                if [ -n "$nested" ]; then
                    process_items "$cat_id" "$nested"
                fi
                ;;
                
            field)
                local label
                label=$(get_setup_item_label "$item_id")
                local variable
                variable=$(get_setup_item_variable "$item_id")
                local default
                default=$(get_setup_item_default "$item_id")
                local field_type
                field_type=$(get_setup_item_field_type "$item_id")
                
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
                
                if [ "$field_type" = "computed" ]; then
                    if [ "$item_id" = "dslite-aftr-address-computed" ]; then
                        local aftr_type
                        aftr_type=$(grep "^dslite_aftr_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                        local area
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
                    echo ""
                    echo "$label: $current"
                    continue
                fi
                
                if [ "$field_type" = "select" ]; then
                    local source
                    source=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].source" 2>/dev/null | head -1)
                    
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
                    
                    local options
                    options=$(get_setup_item_options "$item_id")
                    
                    echo ""
                    echo "$label:"
                    local i=1
                    for opt in $options; do
                        local opt_label
                        opt_label=$(get_setup_item_option_label "$item_id" "$opt")
                        if [ "$opt" = "$current" ]; then
                            echo "$i) $opt_label [current]"
                        else
                            echo "$i) $opt_label"
                        fi
                        i=$((i+1))
                    done
                    
                    printf "$(translate 'tr-tui-ui-choice') [Enter=keep current]: "
                    read -r choice
                    
                    if [ -n "$choice" ]; then
                        selected_opt=$(echo "$options" | sed -n "${choice}p")
                        if [ -n "$selected_opt" ]; then
                            sed -i "/^${variable}=/d" "$SETUP_VARS"
                            echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                            auto_add_conditional_packages "$cat_id"
                            
                            if [ "$item_id" = "dslite-aftr-type" ] || [ "$item_id" = "dslite-area" ]; then
                                local aftr_type
                                aftr_type=$(grep "^dslite_aftr_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                                local area
                                area=$(grep "^dslite_area=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                                local computed
                                computed=$(compute_dslite_aftr "$aftr_type" "$area")
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
                content=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[$cat_idx].items[$item_idx].content" 2>/dev/null)
                local class
                class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[$cat_idx].items[$item_idx].class" 2>/dev/null)
                
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
    local cat_title
    cat_title=$(get_setup_category_title "$cat_id")
    
    clear
    echo "========================================"
    echo "  $cat_title"
    echo "========================================"
    
    if [ "$cat_id" = "basic-config" ]; then
        local tr_language
        tr_language=$(translate "tr-language")
        [ -z "$tr_language" ] || [ "$tr_language" = "tr-language" ] && tr_language="Language"
        
        local current_lang
        current_lang=$(grep "^language=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
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
    printf "%s: " "$(translate 'tr-tui-ok')"
    read -r _
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
            local is_hidden
            is_hidden=$(get_category_hidden "$cat_id")
            [ "$is_hidden" = "true" ] && continue
            
            local cat_name
            cat_name=$(get_category_name "$cat_id")
            echo "$i) $cat_name"
            i=$((i+1))
        done
        
        echo "b) $(translate 'tr-tui-back')"
        echo ""
        printf "$(translate 'tr-tui-ui-choice'): "
        read -r choice
        
        if [ "$choice" = "b" ] || [ "$choice" = "B" ]; then
            return 0
        fi
        
        if [ -n "$choice" ]; then
            selected_cat=$(get_categories | while read cat_id; do
                local is_hidden
                is_hidden=$(get_category_hidden "$cat_id")
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
    local cat_name
    cat_name=$(get_category_name "$cat_id")
    local cat_desc
    cat_desc=$(get_category_desc "$cat_id")
    
    clear
    echo "========================================"
    echo "  $(translate 'tr-tui-packages') > $cat_name"
    echo "========================================"
    echo ""
    echo "$cat_desc"
    echo ""
    
    get_category_packages "$cat_id" | while read pkg_id; do
        if ! package_compatible "$pkg_id"; then
            continue
        fi
        
        local pkg_name
        pkg_name=$(get_package_name "$pkg_id")
        
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
        if ! package_compatible "$pkg_id"; then
            continue
        fi
        
        local pkg_name
        pkg_name=$(get_package_name "$pkg_id")
        echo "$i) $pkg_name"
        i=$((i+1))
    done
    
    echo ""
    printf "$(translate 'tr-tui-ui-choice'): "
    read -r choice
    
    if [ "$choice" = "b" ] || [ "$choice" = "B" ]; then
        return 0
    fi
    
    if [ -n "$choice" ]; then
        local selected_idx=1
        local found_pkg=""
        
        get_category_packages "$cat_id" | while read pkg_id; do
            if ! package_compatible "$pkg_id"; then
                continue
            fi
            
            if [ "$selected_idx" -eq "$choice" ]; then
                found_pkg="$pkg_id"
                break
            fi
            selected_idx=$((selected_idx+1))
        done
        
        if [ -n "$found_pkg" ]; then
            if is_package_selected "$found_pkg"; then
                sed -i "/^${found_pkg}$/d" "$SELECTED_PACKAGES"
            else
                echo "$found_pkg" >> "$SELECTED_PACKAGES"
            fi
        fi
        
        package_selection "$cat_id"
    fi
}

view_customfeeds() {
    local tr_main_menu tr_review tr_customfeeds breadcrumb
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_review=$(translate "tr-tui-review-configuration")
    tr_customfeeds=$(translate "tr-tui-view-customfeeds")
    breadcrumb="${tr_main_menu} > ${tr_review} > ${tr_customfeeds}"
    
    if [ ! -f "$CUSTOMFEEDS_JSON" ]; then
        show_msgbox "$breadcrumb" "No custom feeds available"
        return 0
    fi
    
    clear
    echo "========================================"
    echo "  $breadcrumb"
    echo "========================================"
    echo ""
    
    local i=1
    get_customfeed_categories | while read cat_id; do
        local cat_name
        cat_name=$(get_category_name "$cat_id")
        echo "$i) $cat_name"
        i=$((i+1))
    done
    
    echo "b) $(translate 'tr-tui-back')"
    echo ""
    printf "$(translate 'tr-tui-ui-choice'): "
    read -r choice
    
    if [ "$choice" = "b" ] || [ "$choice" = "B" ]; then
        return 0
    fi
    
    if [ -n "$choice" ]; then
        selected_cat=$(get_customfeed_categories | sed -n "${choice}p")
        local script_file="$CONFIG_DIR/customfeeds-${selected_cat}.sh"
        local cat_name
        cat_name=$(get_category_name "$selected_cat")
        local cat_breadcrumb="${breadcrumb} > ${cat_name}"
        
        if [ -f "$script_file" ]; then
            clear
            echo "========================================"
            echo "  $cat_breadcrumb"
            echo "========================================"
            echo ""
            cat "$script_file"
            echo ""
            printf "%s: " "$(translate 'tr-tui-ok')"
            read -r _
        else
            show_msgbox "$cat_breadcrumb" "Script not found"
        fi
        
        view_customfeeds
    fi
}

view_selected_custom_packages() {
    local tr_main_menu tr_review tr_custom_packages breadcrumb
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_review=$(translate "tr-tui-review-configuration")
    tr_custom_packages=$(translate "tr-tui-view-custom-packages")
    breadcrumb="${tr_main_menu} > ${tr_review} > ${tr_custom_packages}"
    
    if [ ! -f "$CUSTOMFEEDS_JSON" ]; then
        show_msgbox "$breadcrumb" "No custom feeds available"
        return 0
    fi
    
    clear
    echo "========================================"
    echo "  $breadcrumb"
    echo "========================================"
    echo ""
    
    local i=1
    get_customfeed_categories | while read cat_id; do
        local cat_name
        cat_name=$(get_category_name "$cat_id")
        echo "$i) $cat_name"
        i=$((i+1))
    done
    
    echo "b) $(translate 'tr-tui-back')"
    echo ""
    printf "$(translate 'tr-tui-ui-choice'): "
    read -r choice
    
    if [ "$choice" = "b" ] || [ "$choice" = "B" ]; then
        return 0
    fi
    
    if [ -n "$choice" ]; then
        selected_cat=$(get_customfeed_categories | sed -n "${choice}p")
        local cat_name 
        cat_name=$(get_category_name "$selected_cat")
        local cat_breadcrumb="${breadcrumb} > ${cat_name}"
        
        clear
        echo "========================================"
        echo "  $cat_breadcrumb"
        echo "========================================"
        echo ""
        
        local has_packages=0
        get_category_packages "$selected_cat" | while read pkg_id; do
            if ! package_compatible "$pkg_id"; then
                continue
            fi
            
            if grep -q "^${pkg_id}$" "$SELECTED_CUSTOM_PACKAGES" 2>/dev/null; then
                local pkg_name
                pkg_name=$(get_package_name "$pkg_id")
                echo "  - ${pkg_name}"
                has_packages=1
            fi
        done
        
        if [ $has_packages -eq 0 ]; then
            echo "  $(translate 'tr-tui-no-packages')"
        fi
        
        echo ""
        printf "%s: " "$(translate 'tr-tui-ok')"
        read -r _
        
        view_selected_custom_packages
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
        
        local packages_label
        packages_label=$(translate "tr-tui-packages")
        echo "$i) $packages_label"
        local packages_choice=$i
        i=$((i+1))
        
        local custom_feeds_label
        custom_feeds_label=$(translate "tr-tui-custom-feeds")
        echo "$i) $custom_feeds_label"
        local custom_feeds_choice=$i
        i=$((i+1))
        
        echo "$i) $(translate 'tr-tui-review-configuration')"
        local review_choice=$i
        i=$((i+1))
        echo "$i) $(translate 'tr-tui-exit')"
        local exit_choice=$i
        
        echo ""
        printf "$(translate 'tr-tui-ui-choice'): "
        read -r choice
        
        if [ -z "$choice" ]; then
            continue
        fi
        
        local setup_cat_count
        setup_cat_count=$(get_setup_categories | wc -l)
        if [ "$choice" -le "$setup_cat_count" ]; then
            selected_cat=$(get_setup_categories | sed -n "${choice}p")
            category_config "$selected_cat"
        elif [ "$choice" -eq "$packages_choice" ]; then
            package_categories
        elif [ "$choice" -eq "$custom_feeds_choice" ]; then
            custom_feeds_selection
        elif [ "$choice" -eq "$review_choice" ]; then
            review_and_apply
        elif [ "$choice" -eq "$exit_choice" ]; then
            return 0
        fi
    done
}

aios2_simple_main() {
    device_info
    main_menu
}
