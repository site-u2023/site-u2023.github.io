#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC2154,SC2086,SC3001,SC3043
# OpenWrt Device Setup Tool - whiptail TUI Module
# This file contains whiptail-specific UI functions

VERSION="R7.1212.1728"
TITLE="all in one scripts 2"

UI_WIDTH="78"
UI_HEIGHT="0"

# Return code definitions for hierarchical navigation
# 0: Stay in current section/context
# 1: Go back one level (to parent section/category)
# 2: Return to main menu
RETURN_STAY="0"
RETURN_BACK="1"
RETURN_MAIN="2"

DEFAULT_BTN_SELECT="tr-tui-select"
DEFAULT_BTN_BACK="tr-tui-back"
DEFAULT_BTN_YES="tr-tui-yes"
DEFAULT_BTN_NO="tr-tui-no"
DEFAULT_BTN_OK="tr-tui-ok"
DEFAULT_BTN_DECIDE="tr-tui-decide"
DEFAULT_BTN_CANCEL="tr-tui-cancel"

NEWT_COLORS='
title=black,lightgray
'

show_menu() {
    local breadcrumb="$1"
    local prompt="$2"
    local ok_btn="${3:-$(translate "$DEFAULT_BTN_SELECT")}"
    local cancel_btn="${4:-$(translate "$DEFAULT_BTN_BACK")}"
    shift 4
    
    eval "whiptail --title \"$breadcrumb\" --ok-button \"$ok_btn\" --cancel-button \"$cancel_btn\" --menu \"$prompt\" \"$UI_HEIGHT\" \"$UI_WIDTH\" 0 \"\$@\" 3>&1 1>&2 2>&3"
}

show_inputbox() {
    local breadcrumb="$1"
    local prompt="$2"
    local default="$3"
    local ok_btn="${4:-$(translate "$DEFAULT_BTN_SELECT")}"
    local cancel_btn="${5:-$(translate "$DEFAULT_BTN_BACK")}"
    
    local value
    value=$(whiptail --title "$breadcrumb" --ok-button "$ok_btn" --cancel-button "$cancel_btn" --inputbox "$prompt" "$UI_HEIGHT" "$UI_WIDTH" "$default" 3>&1 1>&2 2>&3)
    
    local exit_code=$?
    
    # IPv4アドレスの場合、CIDRを自動付与
    if [ $exit_code -eq 0 ] && echo "$value" | grep -qE '^([0-9]{1,3}\.){3}[0-9]{1,3}$'; then
        value="${value}/24"
    fi
    
    echo "$value"
    return $exit_code
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
    
    eval "whiptail --title \"$breadcrumb\" --ok-button \"$ok_btn\" --cancel-button \"$cancel_btn\" --checklist \"$prompt\" \"$UI_HEIGHT\" \"$UI_WIDTH\" 0 \"\$@\" 3>&1 1>&2 2>&3"
}

show_textbox() {
    local breadcrumb="$1"
    local file="$2"
    local ok_btn="${3:-$(translate "$DEFAULT_BTN_OK")}"
    local temp_file="$CONFIG_DIR/textbox_wrapped.txt"
    local lines content
    
    [ ! -f "$file" ] && : > "$file"
    
    awk -v w="$UI_WIDTH" '{
        while (length($0) > w) {
            print substr($0, 1, w)
            $0 = substr($0, w + 1)
        }
        print
    }' "$file" > "$temp_file"

    lines=$(wc -l < "$temp_file")

    if [ "$lines" -le 20 ]; then
        content=$(cat "$temp_file")
        show_msgbox "$breadcrumb" "$content"
    else
        whiptail --scrolltext --title "$breadcrumb" --ok-button "$ok_btn" --textbox "$temp_file" "$UI_HEIGHT" "$UI_WIDTH"
    fi
    
    rm -f "$temp_file"
}

# Package Compatibility Check for Custom Feeds

custom_feeds_selection() {
    local tr_main_menu tr_custom_feeds breadcrumb
    local menu_items i cat_id cat_name choice selected_cat
    local categories
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_custom_feeds=$(translate "tr-tui-custom-feeds")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_custom_feeds")
    
    # 共通処理：カテゴリ取得
    categories=$(custom_feeds_selection_prepare)
    
    if [ $? -ne 0 ] || [ -z "$categories" ]; then
        show_msgbox "$breadcrumb" "No custom feeds available"
        return 0
    fi
    
    # メインループ
    while true; do
        menu_items="" 
        i=1
        
        # カテゴリリストを構築
        while read -r cat_id; do
            cat_name=$(get_category_name "$cat_id")
            menu_items="$menu_items $i \"$cat_name\""
            i=$((i+1))
        done <<EOF
$categories
EOF
        
        # メニュー表示
        choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items")
        
        # キャンセル処理
        if ! [ $? -eq 0 ]; then
            return 0
        fi
        
        # カテゴリ選択処理
        if [ -n "$choice" ]; then
            selected_cat=$(echo "$categories" | sed -n "${choice}p")
            
            if [ -n "$selected_cat" ]; then
                package_selection "$selected_cat" "custom_feeds" "$breadcrumb"
            fi
        fi
    done
}

custom_scripts_selection_ui() {
    local breadcrumb="$1"
    local all_scripts="$2"
    local menu_items i script_id script_name choice selected_script
    
    while true; do
        menu_items="" 
        i=1
        
        while read -r script_id; do
            script_name=$(get_customscript_name "$script_id")
            menu_items="$menu_items $i \"$script_name\""
            i=$((i+1))
        done <<EOF
$all_scripts
EOF
        
        choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items")
        
        if ! [ $? -eq 0 ]; then
            return 0
        fi
        
        if [ -n "$choice" ]; then
            selected_script=$(echo "$all_scripts" | sed -n "${choice}p")
            custom_script_options "$selected_script" "$breadcrumb"
        fi
    done
}

custom_script_options_ui() {
    local script_id="$1"
    local breadcrumb="$2"
    local filtered_options="$3"
    
    while true; do
        local menu_items i option_id option_label choice selected_option
        
        menu_items=""
        i=1
        
        while read -r option_id; do
            option_label=$(get_customscript_option_label "$script_id" "$option_id")
            menu_items="$menu_items $i \"$option_label\""
            i=$((i+1))
        done <<EOF
$filtered_options
EOF
        
        choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items")
        
        if ! [ $? -eq 0 ]; then
            return 0
        fi
        
        if [ -n "$choice" ]; then
            selected_option=$(echo "$filtered_options" | sed -n "${choice}p")
            
            if [ -n "$selected_option" ]; then
                : > "$CONFIG_DIR/script_vars_${script_id}.txt"
                
                echo "SELECTED_OPTION='$selected_option'" >> "$CONFIG_DIR/script_vars_${script_id}.txt"

                write_option_envvars "$script_id" "$selected_option"

                local skip_inputs
                skip_inputs=$(get_customscript_option_skip_inputs "$script_id" "$selected_option")
                
                if [ "$skip_inputs" != "true" ]; then
                    collect_script_inputs "$script_id" "$breadcrumb" "$selected_option"
                fi
                return 0
            fi
        fi
    done
}

device_info() {
    local tr_main_menu tr_device_info breadcrumb info
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_device_info=$(translate "tr-tui-view-device-info")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_device_info")
    
    info=$(build_deviceinfo_display)
    
    show_msgbox "$breadcrumb" "$info"
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
        info="${tr_auto_detection}: MAP-E

"
        [ -n "$ISP_NAME" ] && info="${info}${tr_isp}: $ISP_NAME
"
        [ -n "$ISP_AS" ] && info="${info}${tr_as}: $ISP_AS
"
        
        info="${info}
${tr_mape_notice}

"
        [ -n "$MAPE_GUA_PREFIX" ] && info="${info}option ip6prefix_gua $MAPE_GUA_PREFIX
"
        info="${info}option peeraddr $MAPE_BR
"
        [ -n "$MAPE_IPV4_PREFIX" ] && info="${info}option ipaddr $MAPE_IPV4_PREFIX
"
        [ -n "$MAPE_IPV4_PREFIXLEN" ] && info="${info}option ip4prefixlen $MAPE_IPV4_PREFIXLEN
"
        [ -n "$MAPE_IPV6_PREFIX" ] && info="${info}option ip6prefix $MAPE_IPV6_PREFIX
"
        [ -n "$MAPE_IPV6_PREFIXLEN" ] && info="${info}option ip6prefixlen $MAPE_IPV6_PREFIXLEN
"
        [ -n "$MAPE_EALEN" ] && info="${info}option ealen $MAPE_EALEN
"
        [ -n "$MAPE_PSIDLEN" ] && info="${info}option psidlen $MAPE_PSIDLEN
"
        [ -n "$MAPE_PSID_OFFSET" ] && info="${info}option offset $MAPE_PSID_OFFSET
"
        
        info="${info}

$(translate 'tr-tui-use-auto-config')"
        
        if show_yesno "$breadcrumb" "$info"; then
            set_var "connection_type" "auto"
            set_var "mape_gua_prefix" "$MAPE_GUA_PREFIX"
            set_var "mape_br" "$MAPE_BR"
            set_var "mape_ipv4_prefix" "$MAPE_IPV4_PREFIX"
            set_var "mape_ipv4_prefixlen" "$MAPE_IPV4_PREFIXLEN"
            set_var "mape_ipv6_prefix" "$MAPE_IPV6_PREFIX"
            set_var "mape_ipv6_prefixlen" "$MAPE_IPV6_PREFIXLEN"
            set_var "mape_ealen" "$MAPE_EALEN"
            set_var "mape_psidlen" "$MAPE_PSIDLEN"
            set_var "mape_psid_offset" "$MAPE_PSID_OFFSET"

            auto_add_conditional_packages "internet-connection"
            auto_add_conditional_packages "setup-driven-packages"
            
            return 0
        else
            reset_detected_conn_type
            return 1
        fi
        
    elif [ "$DETECTED_CONN_TYPE" = "dslite" ] && [ -n "$DSLITE_AFTR" ]; then
        tr_auto_detection=$(translate "tr-auto-detection")
        info="${tr_auto_detection}: DS-Lite

"
        [ -n "$ISP_NAME" ] && info="${info}${tr_isp}: $ISP_NAME
"
        [ -n "$ISP_AS" ] && info="${info}${tr_as}: $ISP_AS
"
        
        info="${info}
${tr_dslite_notice}

"
        info="${info}option peeraddr $DSLITE_AFTR
"
        
        info="${info}

$(translate 'tr-tui-use-auto-config')"
        
        if show_yesno "$breadcrumb" "$info"; then
            set_var "connection_type" "auto"
            set_var "dslite_aftr_address" "$DSLITE_AFTR"

            auto_add_conditional_packages "internet-connection"
            auto_add_conditional_packages "setup-driven-packages"
            
            return 0
        else
            reset_detected_conn_type
            return 1
        fi
        
    else
        local tr_isp_info tr_manual_config
        tr_isp_info=$(translate "tr-tui-isp-info")
        tr_manual_config=$(translate "tr-tui-manual-config-required")
        info="${tr_isp_info}

"
        [ -n "$ISP_NAME" ] && info="${info}${tr_isp}: $ISP_NAME
"
        [ -n "$ISP_AS" ] && info="${info}${tr_as}: $ISP_AS
"
        info="${info}
${tr_manual_config}"
        
        show_msgbox "$breadcrumb" "$info"
        return 1
    fi
}

process_items() {
    local cat_id="$1"
    local item_id="$2"
    local breadcrumb="$3"
    local parent_item_type="${4:-}"
    local item_type item_label item_breadcrumb nested child_id
    local variable default current options menu_opts i opt opt_label value exit_code selected_opt
    local field_type source aftr_type area computed cat_idx item_idx cid citems idx itm content class
    
    echo "[DEBUG] process_items: cat_id=$cat_id, item_id=$item_id, parent_type=$parent_item_type" >> "$CONFIG_DIR/debug.log"
    
    if ! should_show_item "$item_id" "$cat_id"; then
        echo "[DEBUG] Item $item_id hidden by showWhen/guiOnly" >> "$CONFIG_DIR/debug.log"
        return $RETURN_STAY
    fi
    
    item_type=$(get_setup_item_type "$item_id")
    echo "[DEBUG] Item type: $item_type" >> "$CONFIG_DIR/debug.log"
    
    item_label=$(get_setup_item_label "$item_id")
    item_breadcrumb="${breadcrumb}${BREADCRUMB_SEP}${item_label}"
    
    case "$item_type" in
        section)
            echo "[DEBUG] Processing section: $item_id" >> "$CONFIG_DIR/debug.log"
            
            while true; do
                nested=$(get_section_nested_items "$item_id")
                local all_completed=1
                local first_field=1
                
                for child_id in $nested; do
                    if ! should_show_item "$child_id"; then
                        continue
                    fi
                    
                    local ret
                    process_items "$cat_id" "$child_id" "$item_breadcrumb" "section"
                    ret=$?
                    
                    case $ret in
                        $RETURN_STAY)
                            first_field=0
                            continue
                            ;;
                        $RETURN_BACK)
                            if [ "$first_field" -eq 1 ]; then
                                echo "[DEBUG] First field cancelled, exiting section" >> "$CONFIG_DIR/debug.log"
                                return $RETURN_BACK
                            else
                                echo "[DEBUG] Non-first field cancelled, restarting section" >> "$CONFIG_DIR/debug.log"
                                all_completed=0
                                break
                            fi
                            ;;
                        $RETURN_MAIN)
                            return $RETURN_MAIN
                            ;;
                    esac
                    
                    first_field=0
                done
                
                [ "$all_completed" -eq 1 ] && break
            done
            
            return $RETURN_STAY
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

            if [ "$item_id" = "dslite-aftr-type" ]; then
                if [ -n "$DSLITE_AFTR" ]; then
                    case "$DSLITE_AFTR" in
                        2404:8e00::*|2404:8e01::*)
                            default="transix"
                            ;;
                        *xpass*|*dgw.xpass.jp*)
                            default="xpass"
                            ;;
                        *v6connect*|*dslite.v6connect.net*)
                            default="v6connect"
                            ;;
                    esac
                fi
            fi
            
            current=$(grep "^${variable}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
            [ -z "$current" ] && current="$default"
            
            echo "[DEBUG] Current value: $current" >> "$CONFIG_DIR/debug.log"
            
            options=$(get_setup_item_options "$item_id")
            
            options=$(echo "$options" | sed 's/^___EMPTY___$//')
            
            if [ "$variable" = "connection_type" ] && [ "$DETECTED_CONN_TYPE" = "unknown" ]; then
                options=$(echo "$options" | grep -v "^auto\$")
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
                echo "[DEBUG] Radio-group cancelled, returning RETURN_BACK" >> "$CONFIG_DIR/debug.log"
                return $RETURN_BACK
            fi
            
            if [ -n "$value" ]; then
                selected_opt=$(echo "$options" | sed -n "${value}p")
                echo "[DEBUG] Selected: $selected_opt" >> "$CONFIG_DIR/debug.log"
                
                # disabledの場合は変数を削除
                if [ "$selected_opt" = "disabled" ]; then
                    sed -i "/^${variable}=/d" "$SETUP_VARS"
                    echo "[DEBUG] Selected 'disabled', removed ${variable}" >> "$CONFIG_DIR/debug.log"
                else
                    sed -i "/^${variable}=/d" "$SETUP_VARS"
                    echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                    echo "[DEBUG] Saved to SETUP_VARS" >> "$CONFIG_DIR/debug.log"
                fi

                cleanup_radio_group_exclusive_vars "$item_id" "$selected_opt"
                
                auto_add_conditional_packages "$cat_id"
                auto_cleanup_conditional_variables "$cat_id"
                cleanup_orphaned_enablevars "$cat_id"
            fi
            return $RETURN_STAY
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
            echo "[DEBUG] parent_item_type='$parent_item_type'" >> "$CONFIG_DIR/debug.log"
            
            current=$(grep "^${variable}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
            
            if [ -z "$current" ]; then
                local api_source api_value
                api_source=$(get_setup_item_api_source "$item_id")
                if [ -n "$api_source" ]; then
                    api_value=$(get_api_value "$api_source")
                    current="${api_value:-$default}"
                else
                    current="$default"
                fi
            fi
            
            echo "[DEBUG] current='$current'" >> "$CONFIG_DIR/debug.log"
            
            if [ "$field_type" = "computed" ]; then
                if [ "$item_id" = "dslite-aftr-address" ]; then
                    aftr_type=$(grep "^dslite_aftr_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                    area=$(grep "^dslite_jurisdiction=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                    
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
                            return $RETURN_STAY
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
                    return $RETURN_STAY
                fi
                
                options=$(get_setup_item_options "$item_id")
                
                options=$(echo "$options" | sed 's/^___EMPTY___$//')
                
                echo "[DEBUG] Raw options output: '$options'" >> "$CONFIG_DIR/debug.log"
                
                if [ -z "$options" ]; then
                    echo "[DEBUG] ERROR: No options found for $item_id, skipping" >> "$CONFIG_DIR/debug.log"
                    show_msgbox "$item_breadcrumb" "Error: No options available for $item_label"
                    return $RETURN_STAY
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
                    echo "[DEBUG] Select cancelled, returning RETURN_BACK" >> "$CONFIG_DIR/debug.log"
                    return $RETURN_BACK
                fi
                
                if [ -n "$value" ]; then
                    selected_opt=$(echo "$options" | sed -n "${value}p")
                    echo "[DEBUG] selected_opt='$selected_opt'" >> "$CONFIG_DIR/debug.log"
                    
                    # disabledの場合は変数を削除
                    if [ "$selected_opt" = "disabled" ]; then
                        sed -i "/^${variable}=/d" "$SETUP_VARS"
                        echo "[DEBUG] Selected 'disabled', removed ${variable}" >> "$CONFIG_DIR/debug.log"
                    else
                        sed -i "/^${variable}=/d" "$SETUP_VARS"
                        echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                    fi
                    
                    auto_add_conditional_packages "$cat_id"
                    auto_cleanup_conditional_variables "$cat_id"
                    cleanup_orphaned_enablevars "$cat_id"
                    
                    if [ "$item_id" = "dslite-aftr-type" ] || [ "$item_id" = "dslite-jurisdiction" ]; then
                        aftr_type=$(grep "^dslite_aftr_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                        area=$(grep "^dslite_jurisdiction=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
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
                    echo "[DEBUG] Inputbox cancelled, returning RETURN_BACK" >> "$CONFIG_DIR/debug.log"
                    return $RETURN_BACK
                fi

                if [ -z "$value" ]; then
                    sed -i "/^${variable}=/d" "$SETUP_VARS"
                    echo "[DEBUG] Empty input, removed ${variable}" >> "$CONFIG_DIR/debug.log"
                elif [ -n "$value" ]; then
                    sed -i "/^${variable}=/d" "$SETUP_VARS"
                    echo "${variable}='${value}'" >> "$SETUP_VARS"
                    echo "[DEBUG] Saved ${variable}='${value}'" >> "$CONFIG_DIR/debug.log"
                fi
            fi
            return $RETURN_STAY
            ;;
            
        info-display)
            # ID直接検索でcontent/classを取得
            local raw_content raw_class
            
            raw_content=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].items[@.id='$item_id'].content" 2>/dev/null | head -1)
            raw_class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].items[@.id='$item_id'].class" 2>/dev/null | head -1)
            
            if [ -z "$raw_content" ] && [ -z "$raw_class" ]; then
                raw_content=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].items[*].items[@.id='$item_id'].content" 2>/dev/null | head -1)
                raw_class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].items[*].items[@.id='$item_id'].class" 2>/dev/null | head -1)
            fi

            # auto-info の特別処理
            if [ "$item_id" = "auto-info" ]; then
                if show_network_info; then
                    return $RETURN_STAY
                else
                    return $RETURN_BACK
                fi
            fi
            
            content="$raw_content"
            if [ -n "$raw_class" ] && [ "${raw_class#tr-}" != "$raw_class" ]; then
                content=$(translate "$raw_class")
            fi
            
            [ -n "$content" ] && show_msgbox "$breadcrumb" "$content"
            return $RETURN_STAY
            ;;
    esac
    
    return $RETURN_STAY
}

show_auto_detection_if_available() {
    if [ "$DETECTED_CONN_TYPE" != "unknown" ] && [ -n "$DETECTED_CONN_TYPE" ]; then
        if show_network_info; then
            auto_add_conditional_packages "internet-connection"
            auto_add_conditional_packages "setup-driven-packages"
            return 0
        fi
    fi
    return 1
}

category_config() {
    local cat_id="$1"
    local tr_main_menu cat_title base_breadcrumb
    local tr_language lang_breadcrumb current_lang value
    local item_id item_type ret
    local temp_vars="$CONFIG_DIR/temp_vars_${cat_id}.txt"
    
    # 現在の状態をバックアップ
    cp "$SETUP_VARS" "$temp_vars"
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    cat_title=$(get_setup_category_title "$cat_id")
    base_breadcrumb=$(build_breadcrumb "$tr_main_menu" "$cat_title")
    
    if [ "$cat_id" = "basic-config" ]; then
        tr_language=$(translate "tr-language")
        lang_breadcrumb="${base_breadcrumb}${BREADCRUMB_SEP}${tr_language}"
        
        current_lang=$(grep "^language=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
        [ -z "$current_lang" ] && current_lang="${AUTO_LANGUAGE}"
        
        value=$(show_inputbox "$lang_breadcrumb" "" "$current_lang")
        
        if ! [ $? -eq 0 ]; then
            # キャンセル: 元に戻す
            cp "$temp_vars" "$SETUP_VARS"
            rm -f "$temp_vars"
            return $RETURN_BACK
        fi
        
        # 空欄なら変数削除
        if [ -z "$value" ]; then
            sed -i "/^language=/d" "$SETUP_VARS"
            echo "[DEBUG] Empty language input, removed variable" >> "$CONFIG_DIR/debug.log"
        else
            sed -i "/^language=/d" "$SETUP_VARS"
            echo "language='${value}'" >> "$SETUP_VARS"
        fi
        update_language_packages
    fi
    
    # internet-connection カテゴリの場合、自動検出を試みる
    if [ "$cat_id" = "internet-connection" ]; then
        if show_auto_detection_if_available; then
            auto_cleanup_conditional_variables "$cat_id"
            cleanup_orphaned_enablevars "$cat_id"
            rm -f "$temp_vars"
            return $RETURN_STAY
        fi
    fi
    
    # カテゴリ内の全アイテムを処理
    for item_id in $(get_setup_category_items "$cat_id"); do
        item_type=$(get_setup_item_type "$item_id")
        
        # アイテムを表示すべきかチェック
        if ! should_show_item "$item_id" "$cat_id"; then
            echo "[DEBUG] Skipping hidden item: $item_id" >> "$CONFIG_DIR/debug.log"
            continue
        fi
        
        process_items "$cat_id" "$item_id" "$base_breadcrumb"
        ret=$?
        
        case $ret in
            $RETURN_STAY)
                continue
                ;;
            $RETURN_BACK)
                # キャンセル: 元に戻す
                cp "$temp_vars" "$SETUP_VARS"
                rm -f "$temp_vars"
                return $RETURN_BACK
                ;;
            $RETURN_MAIN)
                # メインメニューへ: 元に戻す
                cp "$temp_vars" "$SETUP_VARS"
                rm -f "$temp_vars"
                return $RETURN_MAIN
                ;;
        esac
    done
    
    # 成功: バックアップを削除
    rm -f "$temp_vars"
    
    auto_add_conditional_packages "$cat_id"
    auto_cleanup_conditional_variables "$cat_id"
    cleanup_orphaned_enablevars "$cat_id"
    track_api_value_changes "$cat_id"
    
    return $RETURN_STAY
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
    
    while true; do
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
    done
}

package_selection() {
    local cat_id="$1"
    local caller="${2:-normal}"
    local parent_breadcrumb="$3"
    
    if [ "$_PACKAGE_NAME_LOADED" -eq 0 ]; then
        get_package_name "dummy" > /dev/null 2>&1
    fi
    
    local cat_name breadcrumb checklist_items
    local pkg_name status idx selected target_file idx_str idx_clean
    local packages
    
    cat_name=$(get_category_name "$cat_id")
    breadcrumb="${parent_breadcrumb}${BREADCRUMB_SEP}${cat_name}"
    
    packages=$(get_category_packages "$cat_id")
    
    # 依存パッケージIDのキャッシュ処理
    local dependent_ids=" "
    
    while read -r parent_id; do
        [ -z "$parent_id" ] && continue
        
        local deps
        if [ "$caller" = "custom_feeds" ]; then
            deps=$(jsonfilter -i "$CUSTOMFEEDS_JSON" \
                -e "@.categories[@.id='$cat_id'].packages[@.id='$parent_id'].dependencies[*]" 2>/dev/null)
        else
            deps=$(jsonfilter -i "$PACKAGES_JSON" \
                -e "@.categories[@.id='$cat_id'].packages[@.id='$parent_id'].dependencies[*]" 2>/dev/null)
        fi
        
        # 依存先をインデント対象に追加（通常・カスタムフィード共通）
        while read -r dep; do
            [ -z "$dep" ] && continue
            
            local matched_line matched_id
            matched_line=$(echo "$_PACKAGE_NAME_CACHE" | awk -F= -v dep="$dep" '$3 == dep {print; exit}')
            
            if [ -n "$matched_line" ]; then
                matched_id=$(echo "$matched_line" | cut -d= -f1)
                dependent_ids="${dependent_ids}${matched_id} ${dep} "
            else
                if echo "$_PACKAGE_NAME_CACHE" | cut -d= -f1 | grep -qx "$dep"; then
                    dependent_ids="${dependent_ids}${dep} "
                fi
            fi
        done <<DEPS
$deps
DEPS
    done <<EOF
$packages
EOF
    
    dependent_ids="${dependent_ids} "
    
    checklist_items=""
    idx=1
    local display_names=""
    
    # キャッシュを1回だけ走査
    local pkg_list_pattern
    pkg_list_pattern=$(echo "$packages" | tr '\n' '|' | sed 's/|$//')
    
    while read -r entry; do
        [ -z "$entry" ] && continue
        
        local pkg_id pkg_name uid
        pkg_id=$(echo "$entry" | cut -d= -f1)
        pkg_name=$(echo "$entry" | cut -d= -f2)
        uid=$(echo "$entry" | cut -d= -f3)
        
        # このカテゴリのパッケージでなければスキップ
        echo "$packages" | grep -qx "$pkg_id" || continue
        
        if [ "$caller" = "custom_feeds" ]; then
            package_compatible "$pkg_id" || continue
        fi
        
        check_package_available "$pkg_id" "$caller" || continue
        
        # 依存パッケージ判定（hiddenチェックより先）
        local is_dependent=0
        
        if echo " ${dependent_ids} " | grep -q " ${pkg_id} "; then
            is_dependent=1
        elif [ -n "$uid" ] && echo " ${dependent_ids} " | grep -q " ${uid} "; then
            is_dependent=1
        fi
        
        # hidden チェック（独立パッケージのみ）
        if [ "$is_dependent" -eq 0 ]; then
            local is_hidden_entry
            
            if [ -n "$uid" ]; then
                if [ "$caller" = "custom_feeds" ]; then
                    is_hidden_entry=$(jsonfilter -i "$CUSTOMFEEDS_JSON" \
                        -e "@.categories[*].packages[@.uniqueId='$uid'].hidden" 2>/dev/null | head -1)
                else
                    is_hidden_entry=$(jsonfilter -i "$PACKAGES_JSON" \
                        -e "@.categories[*].packages[@.uniqueId='$uid'].hidden" 2>/dev/null | head -1)
                fi
            else
                if [ "$caller" = "custom_feeds" ]; then
                    is_hidden_entry=$(jsonfilter -i "$CUSTOMFEEDS_JSON" \
                        -e "@.categories[@.id='$cat_id'].packages[@.id='$pkg_id'].hidden" 2>/dev/null | head -1)
                else
                    is_hidden_entry=$(jsonfilter -i "$PACKAGES_JSON" \
                        -e "@.categories[@.id='$cat_id'].packages[@.id='$pkg_id'].hidden" 2>/dev/null | head -1)
                fi
            fi
            
            [ "$is_hidden_entry" = "true" ] && continue
        fi
        
        local display_name="$pkg_name"
        if [ "$is_dependent" -eq 1 ]; then
            display_name="   ${pkg_name}"
        fi
        
        display_names="${display_names}${display_name}|${pkg_id}
"
        
        if is_package_selected "$pkg_name" "$caller"; then
            status="ON"
        else
            status="OFF"
        fi
        
        checklist_items="$checklist_items \"$idx\" \"$display_name\" $status"
        idx=$((idx+1))
    done <<EOF
$_PACKAGE_NAME_CACHE
EOF
    
    selected=$(eval "show_checklist \"\$breadcrumb\" \"($(translate 'tr-tui-space-toggle'))\" \"\" \"\" $checklist_items")
    
    if [ $? -ne 0 ]; then
        return 0
    fi
    
    if [ "$caller" = "custom_feeds" ]; then
        target_file="$SELECTED_CUSTOM_PACKAGES"
    else
        target_file="$SELECTED_PACKAGES"
    fi
    
    # カテゴリの既存エントリ削除
    while read -r pkg_id; do
        [ -z "$pkg_id" ] && continue
        
        local all_entries
        all_entries=$(awk -F= -v id="$pkg_id" '$1 == id' "$target_file" 2>/dev/null)
        
        while read -r entry; do
            [ -z "$entry" ] && continue
            
            local enable_var
            enable_var=$(echo "$entry" | cut -d= -f5)
            
            if [ -n "$enable_var" ]; then
                sed -i "/^${enable_var}=/d" "$SETUP_VARS" 2>/dev/null
            fi
        done <<ENTRIES
$all_entries
ENTRIES
        
        sed -i "/^${pkg_id}=/d" "$target_file"
    done <<EOF
$packages
EOF
    
    # 選択されたものを保存
    for idx_str in $selected; do
        idx_clean=$(echo "$idx_str" | tr -d '"')
        
        local selected_line pkg_id display_name ui_label cache_line
        selected_line=$(echo "$display_names" | sed -n "${idx_clean}p")
        
        if [ -n "$selected_line" ]; then
            display_name=$(echo "$selected_line" | cut -d'|' -f1)
            pkg_id=$(echo "$selected_line" | cut -d'|' -f2)
            
            ui_label=$(echo "$display_name" | sed 's/^[[:space:]]*//')
            
            cache_line=$(echo "$_PACKAGE_NAME_CACHE" | awk -F= -v id="$pkg_id" -v name="$ui_label" '$1 == id && $2 == name {print; exit}')
            
            if [ -n "$cache_line" ]; then
                echo "$cache_line" >> "$target_file"
                
                local enable_var
                enable_var=$(echo "$cache_line" | cut -d= -f5)
                
                if [ -n "$enable_var" ] && ! grep -q "^${enable_var}=" "$SETUP_VARS" 2>/dev/null; then
                    echo "${enable_var}='1'" >> "$SETUP_VARS"
                fi
            fi
        fi
    done
    
    clear_selection_cache
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

view_customscripts() {
    local tr_main_menu tr_review tr_customscripts breadcrumb
    local menu_items i script_id script_name choice selected_script script_breadcrumb script_file
    local all_scripts
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_review=$(translate "tr-tui-review-configuration")
    tr_customscripts=$(translate "tr-tui-view-customscripts")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_review" "$tr_customscripts")
    
    if [ ! -f "$CUSTOMSCRIPTS_JSON" ]; then
        show_msgbox "$breadcrumb" "No custom scripts configured"
        return 0
    fi
    
    # 全スクリプトを直接取得
    all_scripts=$(get_customscript_all_scripts)
    
    if [ -z "$all_scripts" ]; then
        show_msgbox "$breadcrumb" "No custom scripts available"
        return 0
    fi
    
    while true; do
        menu_items="" 
        i=1
        
        while read -r script_id; do
            script_name=$(get_customscript_name "$script_id")
            menu_items="$menu_items $i \"$script_name\""
            i=$((i+1))
        done <<EOF
$all_scripts
EOF
        
        choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items")
        
        if ! [ $? -eq 0 ]; then
            return 0
        fi
        
        if [ -n "$choice" ]; then
            selected_script=$(echo "$all_scripts" | sed -n "${choice}p")
            script_name=$(get_customscript_name "$selected_script")
            script_breadcrumb="${breadcrumb}${BREADCRUMB_SEP}${script_name}"
            
            script_file="$CONFIG_DIR/customscripts-${selected_script}.sh"
            
            if [ -f "$script_file" ]; then
                cat "$script_file" > "$CONFIG_DIR/customscripts_view.txt"
                show_textbox "$script_breadcrumb" "$CONFIG_DIR/customscripts_view.txt"
            else
                show_msgbox "$script_breadcrumb" "Script not found: customscripts-${selected_script}.sh"
            fi
        fi
    done
}

view_selected_custom_scripts() {
    local tr_main_menu tr_review tr_scripts breadcrumb
    local menu_items i script_id script_name choice selected_script script_breadcrumb
    local configured_scripts
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_review=$(translate "tr-tui-review-configuration")
    tr_scripts=$(translate "tr-tui-view-script-list")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_review" "$tr_scripts")
    
    # 設定済みのスクリプトを検索（script_vars_*.txt が存在するもの）
    configured_scripts=""
    for script_id in $(get_customscript_all_scripts); do
        if [ -f "$CONFIG_DIR/script_vars_${script_id}.txt" ]; then
            configured_scripts="${configured_scripts}${script_id}
"
        fi
    done
    configured_scripts=$(echo "$configured_scripts" | grep -v '^$')
    
    if [ -z "$configured_scripts" ]; then
        show_msgbox "$breadcrumb" "$(translate 'tr-tui-no-custom-scripts')"
        return 0
    fi
    
    while true; do
        menu_items=""
        i=1
        
        while read -r script_id; do
            [ -z "$script_id" ] && continue
            script_name=$(get_customscript_name "$script_id")
            menu_items="$menu_items $i \"$script_name\""
            i=$((i+1))
        done <<EOF
$configured_scripts
EOF
        
        choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items")
        
        if ! [ $? -eq 0 ]; then
            return 0
        fi
        
        if [ -n "$choice" ]; then
            selected_script=$(echo "$configured_scripts" | sed -n "${choice}p")
            script_name=$(get_customscript_name "$selected_script")
            script_breadcrumb="${breadcrumb}${BREADCRUMB_SEP}${script_name}"
            
            if [ -f "$CONFIG_DIR/script_vars_${selected_script}.txt" ]; then
                show_textbox "$script_breadcrumb" "$CONFIG_DIR/script_vars_${selected_script}.txt"
            else
                show_msgbox "$script_breadcrumb" "No variables configured"
            fi
        fi
    done
}

review_and_apply() {
    local need_fetch=0
    
    [ ! -f "$TPL_POSTINST" ] || [ ! -s "$TPL_POSTINST" ] && need_fetch=1
    [ ! -f "$TPL_SETUP" ] || [ ! -s "$TPL_SETUP" ] && need_fetch=1
    
    if [ -f "$CUSTOMFEEDS_JSON" ] && [ "$need_fetch" -eq 0 ]; then
        while read -r cat_id; do
            local template_url tpl_custom
            template_url=$(get_customfeed_template_url "$cat_id")
            
            if [ -n "$template_url" ]; then
                tpl_custom="$CONFIG_DIR/tpl_custom_${cat_id}.sh"
                if [ ! -f "$tpl_custom" ] || [ ! -s "$tpl_custom" ]; then
                    need_fetch=1
                    break
                fi
            fi
        done <<EOF
$(get_customfeed_categories)
EOF
    fi
    
    if [ "$need_fetch" -eq 1 ]; then
        echo "[DEBUG] Fetching missing templates..." >> "$CONFIG_DIR/debug.log"
        prefetch_templates
    else
        echo "[DEBUG] All templates already cached" >> "$CONFIG_DIR/debug.log"
    fi
    
    generate_files
    
    local tr_main_menu tr_review breadcrumb
    local summary_file summary_content confirm_msg
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_review=$(translate "tr-tui-review-configuration")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_review")
    
    summary_file=$(generate_config_summary)
    if [ ! -f "$summary_file" ] || [ ! -s "$summary_file" ]; then
        echo "Error: Failed to generate summary"
        return 1
    fi
    
    if grep -q "$(translate 'tr-tui-no-config')" "$summary_file"; then
        show_msgbox "$breadcrumb" "$(translate 'tr-tui-no-config')"
        return 0
    fi
    
    summary_content=$(cat "$summary_file")
    
    confirm_msg="${summary_content}

🟣 $(translate 'tr-tui-apply-confirm-question')"
    
    if whiptail --title "$breadcrumb" --scrolltext --yes-button "$(translate "$DEFAULT_BTN_YES")" --no-button "$(translate "$DEFAULT_BTN_NO")" --yesno "$confirm_msg" 20 "$UI_WIDTH"; then
        echo "$(translate 'tr-tui-creating-backup')"
        if ! create_backup "before_apply"; then
            show_msgbox "$breadcrumb" "$(translate 'tr-tui-backup-failed')"
            return 1
        fi
        
        clear
        
        # パッケージマネージャーのアップデート
        update_package_manager
        
        # パッケージインストール
        if [ -s "$SELECTED_PACKAGES" ]; then
            echo "$(translate 'tr-tui-installing-packages')"
            sh "$CONFIG_DIR/postinst.sh"
        fi
        
        # カスタムフィードパッケージインストール
        local has_custom_packages=0
        for script in "$CONFIG_DIR"/customfeeds-*.sh; do
            [ -f "$script" ] || continue
            [ "$(basename "$script")" = "customfeeds-none.sh" ] && continue
            
            if grep -q '^PACKAGES=' "$script" && [ -n "$(grep '^PACKAGES=' "$script" | cut -d'"' -f2)" ]; then
                if [ "$has_custom_packages" -eq 0 ]; then
                    echo ""
                    echo "$(translate 'tr-tui-installing-custom-packages')"
                    has_custom_packages=1
                fi
                
                sh "$script"
            fi
        done
        
        # システム設定適用
        if [ -s "$SETUP_VARS" ]; then
            echo ""
            echo "$(translate 'tr-tui-applying-config')"
            sh "$CONFIG_DIR/setup.sh"
        fi
        
        # カスタムスクリプト実行
        local has_custom_scripts=0
        for script in "$CONFIG_DIR"/customscripts-*.sh; do
            [ -f "$script" ] || continue
            
            script_id=$(basename "$script" | sed 's/^customscripts-//;s/\.sh$//')
            
            if [ -f "$CONFIG_DIR/script_vars_${script_id}.txt" ]; then
                if [ "$has_custom_scripts" -eq 0 ]; then
                    echo ""
                    echo "$(translate 'tr-tui-installing-custom-scripts')"
                    has_custom_scripts=1
                fi
                
                sh "$script"
            fi
        done
    
        # スクリプト実行後のクリーンアップ
        echo "[DEBUG] Cleaning up after script execution..." >> "$CONFIG_DIR/debug.log"
    
        # ファイルベースのキャッシュ削除
        rm -f "$CONFIG_DIR"/script_vars_*.txt
        rm -f "$CONFIG_DIR"/customscripts-*.sh
        rm -f "$CONFIG_DIR"/temp_*.txt
        rm -f "$CONFIG_DIR"/*_snapshot*.txt
    
        # メモリキャッシュをクリア
        clear_selection_cache

        # カスタムスクリプト関連のキャッシュクリア
        unset _CUSTOMSCRIPT_CACHE
        unset _CUSTOMSCRIPT_LOADED
    
        echo "[DEBUG] Cleanup completed" >> "$CONFIG_DIR/debug.log"
 
        local needs_reboot
        needs_reboot=$(needs_reboot_check)
        
        rm -f "$CONFIG_DIR"/script_vars_*.txt
        
        echo ""
        show_msgbox "$breadcrumb" "$(translate 'tr-tui-config-applied')"
    fi
    
    return 0
}

whiptail_main_menu() {
    local tr_main_menu tr_select tr_exit packages_label custom_feeds_label custom_scripts_label review_label
    local setup_categories setup_cat_count
    local menu_items i cat_id cat_title packages_choice custom_feeds_choice custom_scripts_choice review_choice choice selected_cat
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_select=$(translate "tr-tui-select")
    tr_exit=$(translate "tr-tui-exit")
    packages_label=$(translate "tr-tui-packages")
    custom_feeds_label=$(translate "tr-tui-custom-feeds")
    custom_scripts_label=$(translate "tr-tui-custom-scripts")
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
        
        menu_items="$menu_items $i \"$custom_feeds_label\""
        custom_feeds_choice=$i
        i=$((i+1))
        
        menu_items="$menu_items $i \"$custom_scripts_label\""
        custom_scripts_choice=$i
        i=$((i+1))

        local restore_point_label
        restore_point_label=$(translate "tr-tui-restore-point")
        menu_items="$menu_items $i \"$restore_point_label\""
        restore_point_choice=$i
        i=$((i+1))
        
        menu_items="$menu_items $i \"$review_label\""
        review_choice=$i
        
        choice=$(eval "show_menu \"\$TITLE\" \"\" \"\$tr_select\" \"\$tr_exit\" $menu_items")
        
        if ! [ $? -eq 0 ]; then
            return 0
        fi
        
        if [ "$choice" -le "$setup_cat_count" ]; then
            selected_cat=$(echo "$setup_categories" | sed -n "${choice}p")
            category_config "$selected_cat"
        elif [ "$choice" -eq "$packages_choice" ]; then
            package_categories
        elif [ "$choice" -eq "$custom_feeds_choice" ]; then
            custom_feeds_selection
        elif [ "$choice" -eq "$custom_scripts_choice" ]; then
            custom_scripts_selection
        elif [ "$choice" -eq "$restore_point_choice" ]; then
            restore_point_menu
        elif [ "$choice" -eq "$review_choice" ]; then
            review_and_apply
        fi
    done
}

aios2_whiptail_main() {
    export NEWT_COLORS
    device_info
    whiptail_main_menu
}
