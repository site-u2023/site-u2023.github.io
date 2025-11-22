#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC3043
# OpenWrt Device Setup Tool - simple TEXT Module
# This file contains simple text-based UI functions

VERSION="R7.1122.1602"

CHOICE_BACK="0"
CHOICE_EXIT="00"

RETURN_STAY="0"
RETURN_BACK="1"
RETURN_MAIN="2"

DEFAULT_BTN_SELECT="tr-tui-select"
DEFAULT_BTN_BACK="tr-tui-back"
DEFAULT_BTN_YES="tr-tui-yes"
DEFAULT_BTN_NO="tr-tui-no"
DEFAULT_BTN_OK="tr-tui-ok"
DEFAULT_BTN_CANCEL="tr-tui-cancel"

sed -i 's/"tr-tui-yes": "[^"]*"/"tr-tui-yes": "y"/' "$LANG_JSON"
sed -i 's/"tr-tui-no": "[^"]*"/"tr-tui-no": "n"/' "$LANG_JSON"

BREADCRUMB_SEP=" > "

show_menu_header() {
    local breadcrumb="$1"
    
    clear
    echo "========================================"
    echo "  $breadcrumb"
    echo "========================================"
    echo ""
}

show_checkbox() {
    local is_selected="$1"
    local label="$2"
    
    if [ "$is_selected" = "true" ]; then
        echo "[X] $label"
    else
        echo "[ ] $label"
    fi
}

show_numbered_item() {
    local number="$1"
    local label="$2"
    local is_current="${3:-false}"
    
    if [ "$is_current" = "true" ]; then
        echo "$number) $label [current]"
    else
        echo "$number) $label"
    fi
}

show_separator() {
    echo "----------------------------------------"
}

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
    
    show_menu_header "$breadcrumb"
    [ -n "$prompt" ] && echo "$prompt" && echo ""
    
    while [ $# -gt 0 ]; do
        show_numbered_item "$1" "$2"
        shift 2
    done
    
    echo ""
    echo "$CHOICE_BACK) $cancel_btn"
    echo ""
    printf "%s: " "$(translate 'tr-tui-ui-choice')"
    read -r choice
    echo "$choice"
}

show_inputbox() {
    local breadcrumb="$1"
    local prompt="$2"
    local default="$3"
    local ok_btn="${4:-$(translate "$DEFAULT_BTN_SELECT")}"
    local cancel_btn="${5:-$(translate "$DEFAULT_BTN_BACK")}"
    
    show_menu_header "$breadcrumb"
    [ -n "$prompt" ] && echo "$prompt" >&2
    echo "" >&2
    printf "[%s]: " "$default" >&2
    read -r value
    
    if [ -z "$value" ]; then
        value="$default"
    fi
    
    echo "$value"
    return 0
}
show_yesno() {
    local breadcrumb="$1"
    local message="$2"
    local yes_btn="${3:-$(translate "$DEFAULT_BTN_YES")}"
    local no_btn="${4:-$(translate "$DEFAULT_BTN_NO")}"
    
    show_menu_header "$breadcrumb"
    echo "$message"
    echo ""
    printf "(%s/%s): " "$yes_btn" "$no_btn"
    read -r choice
    
    local choice_lower
    choice_lower=$(echo "$choice" | tr '[:upper:]' '[:lower:]')
    
    [ "$choice_lower" = "$yes_btn" ] && return 0
    return 1
}

show_checklist() {
    local breadcrumb="$1"
    local prompt="$2"
    local ok_btn="${3:-$(translate "$DEFAULT_BTN_SELECT")}"
    local cancel_btn="${4:-$(translate "$DEFAULT_BTN_BACK")}"
    shift 4
    
    show_menu_header "$breadcrumb"
    [ -n "$prompt" ] && echo "$prompt" && echo ""
    
    while [ $# -gt 0 ]; do
        local key="$1"
        local label="$2"
        local status="$3"
        if [ "$status" = "ON" ]; then
            echo "[X] $key) $label"
        else
            echo "[ ] $key) $label"
        fi
        shift 3
    done
    
    echo ""
    echo "$CHOICE_BACK) $cancel_btn"
    echo ""
    printf "%s: " "$(translate 'tr-tui-ui-choice')"
    read -r choice
    echo "$choice"
}

show_textbox() {
    local breadcrumb="$1"
    local file="$2"
    local ok_btn="${3:-$(translate "$DEFAULT_BTN_OK")}"
    
    show_menu_header "$breadcrumb"
    [ -f "$file" ] && cat "$file"
    echo ""
    echo "[$ok_btn]"
    read -r _ 2>/dev/null
}

show_msgbox() {
    local breadcrumb="$1"
    local message="$2"
    local ok_btn="${3:-$(translate "$DEFAULT_BTN_OK")}"
    
    show_menu_header "$breadcrumb"
    echo "$message"
    echo ""
    echo "[$ok_btn]"
    read -r _ 2>/dev/null
}

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
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_custom_feeds")
    
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
    
    package_selection "$cat_id" "custom_feeds" "$breadcrumb"
}

review_and_apply() {
    generate_files
    
    local tr_main_menu tr_review breadcrumb
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_review=$(translate "tr-tui-review-configuration")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_review")
    
    while true; do
        show_menu_header "$breadcrumb"
        
        local i=1
        for item_id in $(get_review_items); do
            show_numbered_item "$i" "$(get_review_item_label "$i")"
            i=$((i+1))
        done
        
        echo ""
        echo "$CHOICE_BACK) $(translate "$DEFAULT_BTN_BACK")"
        echo ""
        printf "%s: " "$(translate 'tr-tui-ui-choice')"
        read -r choice
        
        [ "$choice" = "$CHOICE_BACK" ] && return 0
        
        local action
        action=$(get_review_item_action "$choice")
        
        case "$action" in
            device_info) 
                device_info 
                ;;
            textbox)
                local file item_label item_breadcrumb
                file=$(get_review_item_file "$choice")
                item_label=$(get_review_item_label "$choice")
                item_breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_review" "$item_label")
                
                show_textbox "$item_breadcrumb" "$file"
                ;;
            view_selected_custom_packages|view_customfeeds)
                $action
                ;;
            apply)
                local apply_label apply_breadcrumb
                apply_label=$(translate "tr-tui-apply")
                apply_breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_review" "$apply_label")
                
                show_menu_header "$apply_breadcrumb"
                echo "$(translate 'tr-tui-apply-confirm-step1')"
                echo "$(translate 'tr-tui-apply-confirm-step2')"
                echo "$(translate 'tr-tui-apply-confirm-step3')"
                echo "$(translate 'tr-tui-apply-confirm-step4')"
                echo ""
                
                if show_yesno "$apply_breadcrumb" "$(translate 'tr-tui-apply-confirm-question')"; then
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
                    
                    if show_yesno "$apply_breadcrumb" "$(translate 'tr-tui-reboot-question')"; then
                        reboot
                    fi
                    return 0
                fi
                ;;
        esac
    done
}

device_info() {
    local tr_main_menu tr_device_info breadcrumb
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_device_info=$(translate "tr-tui-view-device-info")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_device_info")
    
    show_menu_header "$breadcrumb"
    
    echo "Model: $DEVICE_MODEL"
    echo "Target: $DEVICE_TARGET"
    echo "Version: $OPENWRT_VERSION"
    [ -n "$DEVICE_MEM" ] && echo "Memory: $DEVICE_MEM"
    [ -n "$DEVICE_CPU" ] && echo "CPU: $DEVICE_CPU"
    [ -n "$DEVICE_STORAGE" ] && echo "Storage: $DEVICE_STORAGE_USED/$DEVICE_STORAGE (${DEVICE_STORAGE_AVAIL} free)"
    [ -n "$DEVICE_USB" ] && echo "USB: $DEVICE_USB"
    
    echo ""
    printf "[%s] " "$(translate "$DEFAULT_BTN_OK")"
    read -r _
}

show_network_info() {
    local tr_main_menu tr_internet_connection conn_type_label breadcrumb
    local tr_isp tr_as
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_internet_connection=$(translate "tr-internet-connection")
    conn_type_label=$(get_setup_item_label "connection-type")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_internet_connection" "$conn_type_label")
    
    if [ -z "$DETECTED_CONN_TYPE" ] || [ "$DETECTED_CONN_TYPE" = "unknown" ]; then
        show_msgbox "$breadcrumb" "No configuration detected."
        return 1
    fi
    
    tr_isp=$(translate "tr-isp")
    tr_as=$(translate "tr-as")
    
    show_menu_header "$breadcrumb"
    
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
    if show_yesno "$breadcrumb" "$(translate 'tr-tui-use-auto-config')"; then
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
    local breadcrumb="$3"
    
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
        
        local item_label item_breadcrumb
        item_label=$(get_setup_item_label "$item_id")
        item_breadcrumb="${breadcrumb}${BREADCRUMB_SEP}${item_label}"
        
        case "$item_type" in
            radio-group)
                local variable default current options menu_args
                variable=$(get_setup_item_variable "$item_id")
                default=$(get_setup_item_default "$item_id")
                
                if [ "$item_id" = "mape-type" ]; then
                    if [ -n "$MAPE_GUA_PREFIX" ]; then
                        default="gua"
                    else
                        default="pd"
                    fi
                fi
                
                current=$(grep "^${variable}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                [ -z "$current" ] && current="$default"
                
                options=$(get_setup_item_options "$item_id")

                if [ "$item_id" = "connection-type" ] && [ "$DETECTED_CONN_TYPE" = "unknown" ]; then
                    options=$(echo "$options" | grep -v "^auto$")
                fi
                
                menu_args=""
                local i=1
                for opt in $options; do
                    local opt_label
                    opt_label=$(get_setup_item_option_label "$item_id" "$opt")
                    if [ "$opt" = "$current" ]; then
                        opt_label="$opt_label [*]"
                    fi
                    menu_args="$menu_args $i \"$opt_label\""
                    i=$((i+1))
                done
                
                local choice
                choice=$(eval "show_menu \"\$item_breadcrumb\" \"\" \"\" \"\" $menu_args")
                
                if [ "$choice" = "$CHOICE_BACK" ]; then
                    return $RETURN_BACK
                fi
                
                if [ -n "$choice" ]; then
                    local selected_opt
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
                    process_items "$cat_id" "$nested" "$item_breadcrumb"
                fi
                ;;
                
            field)
                local variable default field_type current
                variable=$(get_setup_item_variable "$item_id")
                default=$(get_setup_item_default "$item_id")
                field_type=$(get_setup_item_field_type "$item_id")
                
                current=$(grep "^${variable}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                
                if [ -z "$current" ]; then
                    case "$variable" in
                        mape_gua_prefix) current="${MAPE_GUA_PREFIX:-$default}" ;;
                        mape_br) current="${MAPE_BR:-$default}" ;;
                        mape_ipv4_prefix) current="${MAPE_IPV4_PREFIX:-$default}" ;;
                        mape_ipv4_prefixlen) current="${MAPE_IPV4_PREFIXLEN:-$default}" ;;
                        mape_ipv6_prefix) current="${MAPE_IPV6_PREFIX:-$default}" ;;
                        mape_ipv6_prefixlen) current="${MAPE_IPV6_PREFIXLEN:-$default}" ;;
                        mape_ealen) current="${MAPE_EALEN:-$default}" ;;
                        mape_psidlen) current="${MAPE_PSIDLEN:-$default}" ;;
                        mape_psid_offset) current="${MAPE_PSID_OFFSET:-$default}" ;;
                        dslite_aftr_address) current="${DSLITE_AFTR:-$default}" ;;
                        *) current="$default" ;;
                    esac
                fi
                
                if [ "$field_type" = "computed" ]; then
                    if [ "$item_id" = "dslite-aftr-address-computed" ]; then
                        local aftr_type area computed
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
                        esac
                    fi
                    
                    local options menu_args
                    options=$(get_setup_item_options "$item_id")
                    
                    menu_args=""
                    local i=1
                    for opt in $options; do
                        local opt_label
                        opt_label=$(get_setup_item_option_label "$item_id" "$opt")
                        if [ "$opt" = "$current" ]; then
                            opt_label="$opt_label [*]"
                        fi
                        menu_args="$menu_args $i \"$opt_label\""
                        i=$((i+1))
                    done
                    
                    local choice
                    choice=$(eval "show_menu \"\$item_breadcrumb\" \"\" \"\" \"\" $menu_args")
                    
                    if [ "$choice" = "$CHOICE_BACK" ]; then
                        return $RETURN_BACK
                    fi
                    
                    if [ -n "$choice" ]; then
                        local selected_opt
                        selected_opt=$(echo "$options" | sed -n "${choice}p")
                        if [ -n "$selected_opt" ]; then
                            sed -i "/^${variable}=/d" "$SETUP_VARS"
                            echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                            auto_add_conditional_packages "$cat_id"
                            
                            if [ "$item_id" = "dslite-aftr-type" ] || [ "$item_id" = "dslite-area" ]; then
                                local aftr_type area computed
                                aftr_type=$(grep "^dslite_aftr_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                                area=$(grep "^dslite_area=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                                computed=$(compute_dslite_aftr "$aftr_type" "$area")
                                if [ -n "$computed" ]; then
                                    sed -i "/^dslite_aftr_address=/d" "$SETUP_VARS"
                                    echo "dslite_aftr_address='${computed}'" >> "$SETUP_VARS"
                                fi
                            fi
                        fi
                    fi
                else
                    local value
                    value=$(show_inputbox "$item_breadcrumb" "" "$current")
                    
                    if [ $? -ne 0 ]; then
                        return 1
                    fi
                    
                    if [ -n "$value" ]; then
                        sed -i "/^${variable}=/d" "$SETUP_VARS"
                        echo "${variable}='${value}'" >> "$SETUP_VARS"
                    fi
                fi
                ;;
                
            info-display)
                local cat_idx=0 item_idx=0
                for cid in $(get_setup_categories); do
                    local citems idx
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
                
                local content class
                content=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[$cat_idx].items[$item_idx].content" 2>/dev/null)
                class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[$cat_idx].items[$item_idx].class" 2>/dev/null)
                
                if [ -n "$class" ] && [ "${class#tr-}" != "$class" ]; then
                    content=$(translate "$class")
                fi
                
                if [ -n "$content" ]; then
                    show_msgbox "$breadcrumb" "$content"
                fi
                ;;
        esac
    done
    
    return 0
}

category_config() {
    local cat_id="$1"
    local tr_main_menu cat_title breadcrumb
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    cat_title=$(get_setup_category_title "$cat_id")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$cat_title")
    
    show_menu_header "$breadcrumb"
    
    if [ "$cat_id" = "basic-config" ]; then
        local tr_language current_lang
        tr_language=$(translate "tr-language")
        [ -z "$tr_language" ] || [ "$tr_language" = "tr-language" ] && tr_language="Language"
        
        current_lang=$(grep "^language=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
        [ -z "$current_lang" ] && current_lang="${AUTO_LANGUAGE:-en}"
        
        echo ""
        printf "%s [%s]: " "$tr_language" "$current_lang"
        read -r value
        
        [ -z "$value" ] && value="$current_lang"
        
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
    
    process_items "$cat_id" "" "$breadcrumb"
    
    auto_add_conditional_packages "$cat_id"
    [ "$cat_id" = "basic-config" ] && update_language_packages
    return 0
}

package_categories() {
    local tr_main_menu tr_packages breadcrumb
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_packages=$(translate "tr-tui-packages")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_packages")
    
    while true; do
        show_menu_header "$breadcrumb"
        
        local i=1
        get_categories | while read -r cat_id; do
            local is_hidden cat_name
            is_hidden=$(get_category_hidden "$cat_id")
            [ "$is_hidden" = "true" ] && continue
            
            cat_name=$(get_category_name "$cat_id")
            show_numbered_item "$i" "$cat_name"
            i=$((i+1))
        done
        
        echo ""
        echo "$CHOICE_BACK) $(translate "$DEFAULT_BTN_BACK")"
        echo ""
        printf "%s: " "$(translate 'tr-tui-ui-choice')"
        read -r choice
        
        if [ "$choice" = "$CHOICE_BACK" ]; then
            return $RETURN_STAY
        fi
        
        if [ -n "$choice" ]; then
            selected_cat=$(get_categories | while read -r cat_id; do
                local is_hidden
                is_hidden=$(get_category_hidden "$cat_id")
                [ "$is_hidden" != "true" ] && echo "$cat_id"
            done | sed -n "${choice}p")
            
            if [ -n "$selected_cat" ]; then
                package_selection "$selected_cat" "normal" "$breadcrumb"
            fi
        fi
    done
}

package_selection() {
    local cat_id="$1"
    local caller="${2:-normal}"
    local parent_breadcrumb="$3"
    
    local cat_name breadcrumb target_file packages
    
    cat_name=$(get_category_name "$cat_id")
    breadcrumb="${parent_breadcrumb}${BREADCRUMB_SEP}${cat_name}"
    
    if [ "$caller" = "custom_feeds" ]; then
        target_file="$SELECTED_CUSTOM_PACKAGES"
    else
        target_file="$SELECTED_PACKAGES"
    fi
    
    packages=$(get_category_packages "$cat_id")
    
    show_menu_header "$breadcrumb"
    
    local cat_desc
    cat_desc=$(get_category_desc "$cat_id")
    echo "$cat_desc"
    echo ""
    
    echo "$packages" | while read -r pkg_id; do
        if [ "$caller" = "custom_feeds" ] && ! package_compatible "$pkg_id"; then
            continue
        fi
        
        local pkg_name is_selected
        pkg_name=$(get_package_name "$pkg_id")
        
        if is_package_selected "$pkg_id" "$caller"; then
            is_selected="true"
        else
            is_selected="false"
        fi
        
        show_checkbox "$is_selected" "$pkg_name"
    done
    
    echo ""
    echo "Enter package number to toggle (or '$CHOICE_BACK' to go back):"
    
    local i=1
    echo "$packages" | while read -r pkg_id; do
        if [ "$caller" = "custom_feeds" ] && ! package_compatible "$pkg_id"; then
            continue
        fi
        
        local pkg_name
        pkg_name=$(get_package_name "$pkg_id")
        show_numbered_item "$i" "$pkg_name"
        i=$((i+1))
    done
    
    echo ""
    echo "$CHOICE_BACK) $(translate "$DEFAULT_BTN_BACK")"
    echo ""
    printf "%s: " "$(translate 'tr-tui-ui-choice')"
    read -r choice
    
    if [ "$choice" = "$CHOICE_BACK" ]; then
        return $RETURN_STAY
    fi
    
    if [ -n "$choice" ]; then
        local selected_idx=1 found_pkg=""
        
        echo "$packages" | while read -r pkg_id; do
            if [ "$caller" = "custom_feeds" ] && ! package_compatible "$pkg_id"; then
                continue
            fi
           
            if [ "$selected_idx" -eq "$choice" ]; then
                found_pkg="$pkg_id"
                break
            fi
            selected_idx=$((selected_idx+1))
        done
        
        found_pkg=""
        selected_idx=1
        while read -r pkg_id; do
            if [ "$caller" = "custom_feeds" ] && ! package_compatible "$pkg_id"; then
                continue
            fi
           
            if [ "$selected_idx" -eq "$choice" ]; then
                found_pkg="$pkg_id"
                break
            fi
            selected_idx=$((selected_idx+1))
        done <<EOF
$packages
EOF

        if [ -n "$found_pkg" ]; then
            if is_package_selected "$found_pkg" "$caller"; then
                sed -i "/^${found_pkg}$/d" "$target_file"
            else
                echo "$found_pkg" >> "$target_file"
            fi
        fi
        
        package_selection "$cat_id" "$caller" "$parent_breadcrumb"
    fi
}

view_customfeeds() {
    local tr_main_menu tr_review tr_customfeeds breadcrumb
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_review=$(translate "tr-tui-review-configuration")
    tr_customfeeds=$(translate "tr-tui-view-customfeeds")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_review" "$tr_customfeeds")
    
    if [ ! -f "$CUSTOMFEEDS_JSON" ]; then
        show_msgbox "$breadcrumb" "No custom feeds available"
        return 0
    fi
    
    while true; do
        show_menu_header "$breadcrumb"
        
        local i=1
        get_customfeed_categories | while read -r cat_id; do
            local cat_name
            cat_name=$(get_category_name "$cat_id")
            show_numbered_item "$i" "$cat_name"
            i=$((i+1))
        done
        
        echo ""
        echo "$CHOICE_BACK) $(translate "$DEFAULT_BTN_BACK")"
        echo ""
        printf "%s: " "$(translate 'tr-tui-ui-choice')"
        read -r choice
        
        if [ "$choice" = "$CHOICE_BACK" ]; then
            return $RETURN_STAY
        fi
        
        if [ -n "$choice" ]; then
            local selected_cat cat_name cat_breadcrumb script_file
            selected_cat=$(get_customfeed_categories | sed -n "${choice}p")
            script_file="$CONFIG_DIR/customfeeds-${selected_cat}.sh"
            cat_name=$(get_category_name "$selected_cat")
            cat_breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_review" "$tr_customfeeds" "$cat_name")
            
            if [ -f "$script_file" ]; then
                show_textbox "$cat_breadcrumb" "$script_file"
            else
                show_msgbox "$cat_breadcrumb" "Script not found"
            fi
        fi
    done
}

view_selected_custom_packages() {
    local tr_main_menu tr_review tr_custom_packages breadcrumb
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_review=$(translate "tr-tui-review-configuration")
    tr_custom_packages=$(translate "tr-tui-view-custom-packages")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_review" "$tr_custom_packages")
    
    if [ ! -f "$CUSTOMFEEDS_JSON" ]; then
        show_msgbox "$breadcrumb" "No custom feeds available"
        return 0
    fi
    
    while true; do
        show_menu_header "$breadcrumb"
        
        local i=1
        get_customfeed_categories | while read -r cat_id; do
            local cat_name
            cat_name=$(get_category_name "$cat_id")
            show_numbered_item "$i" "$cat_name"
            i=$((i+1))
        done
        
        echo ""
        echo "$CHOICE_BACK) $(translate "$DEFAULT_BTN_BACK")"
        echo ""
        printf "%s: " "$(translate 'tr-tui-ui-choice')"
        read -r choice
        
        if [ "$choice" = "$CHOICE_BACK" ]; then
            return $RETURN_STAY
        fi
        
        if [ -n "$choice" ]; then
            local selected_cat cat_name cat_breadcrumb
            selected_cat=$(get_customfeed_categories | sed -n "${choice}p")
            cat_name=$(get_category_name "$selected_cat")
            cat_breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_review" "$tr_custom_packages" "$cat_name")
            
            show_menu_header "$cat_breadcrumb"
            
            local has_packages=0
            while read -r pkg_id; do
                if ! package_compatible "$pkg_id"; then
                    continue
                fi
               
                if grep -q "^${pkg_id}$" "$SELECTED_CUSTOM_PACKAGES" 2>/dev/null; then
                    local pkg_name
                    pkg_name=$(get_package_name "$pkg_id")
                    echo " - ${pkg_name}"
                    has_packages=1
                fi
            done <<EOF
$(get_category_packages "$selected_cat")
EOF

            if [ "$has_packages" -eq 0 ]; then
                echo "  $(translate 'tr-tui-no-packages')"
            fi
            
            echo ""
            printf "[%s] " "$(translate "$DEFAULT_BTN_OK")"
            read -r _
        fi
    done
}

main_menu() {
    while true; do
        show_menu_header "aios2 Vr.$VERSION"
        
        local i=1
        for cat_id in $(get_setup_categories); do
            local cat_title
            cat_title=$(get_setup_category_title "$cat_id")
            show_numbered_item "$i" "$cat_title"
            i=$((i+1))
        done
        
        local packages_label custom_feeds_label
        packages_label=$(translate "tr-tui-packages")
        show_numbered_item "$i" "$packages_label"
        local packages_choice=$i
        i=$((i+1))
        
        custom_feeds_label=$(translate "tr-tui-custom-feeds")
        show_numbered_item "$i" "$custom_feeds_label"
        local custom_feeds_choice=$i
        i=$((i+1))
        
        show_numbered_item "$i" "$(translate 'tr-tui-review-configuration')"
        local review_choice=$i
        i=$((i+1))
        
        echo ""
        echo "$CHOICE_EXIT) $(translate 'tr-tui-exit')"
        echo ""
        printf "%s: " "$(translate 'tr-tui-ui-choice')"
        read -r choice
        
        if [ -z "$choice" ]; then
            continue
        fi
        
        case "$choice" in
            "$CHOICE_EXIT")
                return 0
                ;;
        esac
        
        local setup_cat_count
        setup_cat_count=$(get_setup_categories | wc -l)
        if [ "$choice" -le "$setup_cat_count" ] 2>/dev/null; then
            selected_cat=$(get_setup_categories | sed -n "${choice}p")
            category_config "$selected_cat"
        elif [ "$choice" -eq "$packages_choice" ] 2>/dev/null; then
            package_categories
        elif [ "$choice" -eq "$custom_feeds_choice" ] 2>/dev/null; then
            custom_feeds_selection
        elif [ "$choice" -eq "$review_choice" ] 2>/dev/null; then
            review_and_apply
        fi
    done
}

aios2_simple_main() {
    device_info
    main_menu
}
