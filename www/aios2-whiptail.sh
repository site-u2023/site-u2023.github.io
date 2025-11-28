#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC3043
# OpenWrt Device Setup Tool - whiptail TUI Module
# This file contains whiptail-specific UI functions

VERSION="R7.1128.0913"
TITLE="aios2"

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
    
    eval "whiptail --title \"$breadcrumb\" --ok-button \"$ok_btn\" --cancel-button \"$cancel_btn\" --menu \"$prompt\" \"$UI_HEIGHT\" \"$UI_WIDTH\" 0 \"\$@\" 3>&1 1>&2 2>&3"
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

package_compatible() {
    local pkg_id="$1"
    local pkg_managers
    
    pkg_managers=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].packageManager[*]" 2>/dev/null)
    
    [ -z "$pkg_managers" ] && return 0
    
    echo "$pkg_managers" | grep -q "^${PKG_MGR}\$" && return 0
    
    return 1
}

custom_feeds_selection() {
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

custom_scripts_selection() {
    download_customscripts_json || return 0
    
    local tr_main_menu tr_custom_scripts breadcrumb
    local menu_items i script_id script_name choice selected_script
    local all_scripts
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_custom_scripts=$(translate "tr-tui-custom-scripts")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_custom_scripts")
    
    # 全スクリプトを直接取得
    all_scripts=$(get_customscript_all_scripts)
    
    if [ -z "$all_scripts" ]; then
        show_msgbox "$breadcrumb" "No custom scripts available"
        return 0
    fi
    
    menu_items="" 
    i=1
    
    while read -r script_id; do
        script_name=$(get_customscript_name "$script_id")
        menu_items="$menu_items $i \"$script_name\""
        i=$((i+1))
    done <<EOF
$all_scripts
EOF
    
    choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items") || return 0
    
    if [ -n "$choice" ]; then
        selected_script=$(echo "$all_scripts" | sed -n "${choice}p")
        custom_script_options "$selected_script" "$breadcrumb"
    fi
}

custom_script_options() {
    local script_id="$1"
    local parent_breadcrumb="$2"
    local script_name breadcrumb
    local menu_items i option_id option_label choice selected_option
    local options filtered_options script_file option_args
    local min_mem min_flash msg
    
    script_name=$(get_customscript_name "$script_id")
    breadcrumb="${parent_breadcrumb}${BREADCRUMB_SEP}${script_name}"
    
    # リソースチェック
    if ! check_script_requirements "$script_id"; then
        min_mem=$(get_customscript_requirement "$script_id" "minMemoryMB")
        min_flash=$(get_customscript_requirement "$script_id" "minFlashMB")
        
        msg="$(translate 'tr-tui-customscript-resource-check')

$(translate 'tr-tui-customscript-memory'): ${MEM_FREE_MB}MB $(translate 'tr-tui-customscript-available') / ${min_mem}MB $(translate 'tr-tui-customscript-required')
$(translate 'tr-tui-customscript-storage'): ${FLASH_FREE_MB}MB $(translate 'tr-tui-customscript-available') / ${min_flash}MB $(translate 'tr-tui-customscript-required')

$(translate 'tr-tui-customscript-resource-ng')"
        
        show_msgbox "$breadcrumb" "$msg"
        return 0
    fi
    
    options=$(get_customscript_options "$script_id")
    
    if [ -z "$options" ]; then
        show_msgbox "$breadcrumb" "No options available"
        return 0
    fi
    
    # スクリプト毎のオプションフィルタ
    filtered_options=$(filter_script_options "$script_id" "$options")
    
    if [ -z "$filtered_options" ]; then
        show_msgbox "$breadcrumb" "No options available"
        return 0
    fi
    
    menu_items=""
    i=1
    
    while read -r option_id; do
        option_label=$(get_customscript_option_label "$script_id" "$option_id")
        menu_items="$menu_items $i \"$option_label\""
        i=$((i+1))
    done <<EOF
$filtered_options
EOF
    
    choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items") || return 0
    
    if [ -n "$choice" ]; then
        selected_option=$(echo "$filtered_options" | sed -n "${choice}p")
        
        # skipInputsチェック
        local skip_inputs
        skip_inputs=$(get_customscript_option_skip_inputs "$script_id" "$selected_option")
        
        if [ "$skip_inputs" != "true" ]; then
            # インプットボックス表示して変数収集
            if ! collect_script_inputs "$script_id" "$breadcrumb"; then
                return 0
            fi
            
            # 変数ファイルをリネーム保存（generate_files()で使用）
            if [ -f "$CONFIG_DIR/script_vars.tmp" ]; then
                mv "$CONFIG_DIR/script_vars.tmp" "$CONFIG_DIR/script_vars_${script_id}.tmp"
            fi
        fi
        
        option_args=$(get_customscript_option_args "$script_id" "$selected_option")
        
        # フラグファイルとして空のスクリプトを作成
        # （実際の内容は generate_files() で生成される）
        touch "$CONFIG_DIR/customscripts-${script_id}.sh"
    fi
}

run_custom_script() {
    local script_file="$1"
    local args="$2"
    local breadcrumb="$3"
    local script_url script_path
    
    script_url="${BASE_URL}/custom-script/${script_file}"
    script_path="$CONFIG_DIR/${script_file}"
    
    if ! __download_file_core "$script_url" "$script_path"; then
        show_msgbox "$breadcrumb" "Failed to download script: $script_file"
        return 1
    fi
    
    chmod +x "$script_path"
    
    clear
    printf "\033[1;34mExecuting: %s %s\033[0m\n\n" "$script_file" "$args"
    
    if [ -n "$args" ]; then
        sh "$script_path" "$args"
    else
        sh "$script_path"
    fi
    
    printf "\n\033[1;32mScript execution completed.\033[0m\n"
    printf "Press [Enter] to continue..."
    read -r _
}

device_info() {
    local tr_main_menu tr_device_info breadcrumb info
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_device_info=$(translate "tr-tui-view-device-info")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_device_info")
    
    info="Model: $DEVICE_MODEL
"
    info="${info}Target: $DEVICE_TARGET
"
    info="${info}Version: $OPENWRT_VERSION
"
    [ -n "$DEVICE_MEM" ] && info="${info}Memory: $DEVICE_MEM
"
    [ -n "$DEVICE_CPU" ] && info="${info}CPU: $DEVICE_CPU
"
    [ -n "$DEVICE_STORAGE" ] && info="${info}Storage: $DEVICE_STORAGE_USED/$DEVICE_STORAGE (${DEVICE_STORAGE_AVAIL} free)
"
    [ -n "$DEVICE_USB" ] && info="${info}USB: $DEVICE_USB
"
    
    show_msgbox "$breadcrumb" "$info"
}

device_info_titled() {
    local title="$1"
    local info
    
    info="Model: $DEVICE_MODEL
"
    info="${info}Target: $DEVICE_TARGET
"
    info="${info}Version: $OPENWRT_VERSION
"
    [ -n "$DEVICE_MEM" ] && info="${info}Memory: $DEVICE_MEM
"
    [ -n "$DEVICE_CPU" ] && info="${info}CPU: $DEVICE_CPU
"
    [ -n "$DEVICE_STORAGE" ] && info="${info}Storage: $DEVICE_STORAGE_USED/$DEVICE_STORAGE (${DEVICE_STORAGE_AVAIL} free)
"
    [ -n "$DEVICE_USB" ] && info="${info}USB: $DEVICE_USB
"
    
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
    
    if ! should_show_item "$item_id"; then
        echo "[DEBUG] Item $item_id hidden by showWhen" >> "$CONFIG_DIR/debug.log"
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
                                # 最初のフィールドで戻る = sectionを抜ける
                                echo "[DEBUG] First field cancelled, exiting section" >> "$CONFIG_DIR/debug.log"
                                return $RETURN_BACK
                            else
                                # 2番目以降で戻る = section内の最初から再試行
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
                sed -i "/^${variable}=/d" "$SETUP_VARS"
                echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                echo "[DEBUG] Saved to SETUP_VARS" >> "$CONFIG_DIR/debug.log"
                auto_add_conditional_packages "$cat_id"
                
                # 特殊処理: 接続タイプの場合
                if [ "$item_id" = "connection-type" ] && [ "$cat_id" = "internet-connection" ]; then
                    if [ "$selected_opt" = "auto" ]; then
                        if show_network_info "$item_breadcrumb"; then
                            auto_add_conditional_packages "$cat_id"
                            return $RETURN_STAY
                        fi
                    elif [ "$selected_opt" = "dhcp" ]; then
                        local dhcp_content tr_dhcp
                        dhcp_content="DHCP configuration will be applied automatically.
No additional settings required."
                        tr_dhcp=$(translate "tr-dhcp-information")
                        if [ -n "$tr_dhcp" ] && [ "$tr_dhcp" != "tr-dhcp-information" ]; then
                            dhcp_content="$tr_dhcp"
                        fi
                        show_msgbox "$item_breadcrumb" "$dhcp_content"
                        auto_add_conditional_packages "$cat_id"
                        return $RETURN_STAY
                    fi
                fi
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
                    sed -i "/^${variable}=/d" "$SETUP_VARS"
                    echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                    
                    auto_add_conditional_packages "$cat_id"
                    
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
                
                if [ -n "$value" ]; then
                    sed -i "/^${variable}=/d" "$SETUP_VARS"
                    echo "${variable}='${value}'" >> "$SETUP_VARS"
                    echo "[DEBUG] Saved ${variable}='${value}'" >> "$CONFIG_DIR/debug.log"
                fi
            fi
            return $RETURN_STAY
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
            return $RETURN_STAY
            ;;
    esac
    
    return $RETURN_STAY
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
    local item_id item_type ret
    
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
            return $RETURN_BACK
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
            return $RETURN_STAY
        fi
    fi
    
    # カテゴリ内の全アイテムを処理
    for item_id in $(get_setup_category_items "$cat_id"); do
        item_type=$(get_setup_item_type "$item_id")
        
        # アイテムを表示すべきかチェック
        if ! should_show_item "$item_id"; then
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
                return $RETURN_BACK
                ;;
            $RETURN_MAIN)
                return $RETURN_MAIN
                ;;
        esac
    done
    
    auto_add_conditional_packages "$cat_id"
    [ "$cat_id" = "basic-config" ] && update_language_packages
    
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
        if [ "$caller" = "custom_feeds" ]; then
            if ! package_compatible "$pkg_id"; then
                continue
            fi
        fi
        
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
            sed -i "/^${pkg_id}\$/d" "$target_file"
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
                if ! package_compatible "$pkg_id"; then
                    continue
                fi
                
                if grep -q "^${pkg_id}\$" "$SELECTED_CUSTOM_PACKAGES" 2>/dev/null; then
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

main_menu() {
    local tr_main_menu tr_select tr_exit packages_label custom_feeds_label custom_scripts_label review_label
    local setup_categories setup_cat_count
    local menu_items i cat_id cat_title packages_choice custom_feeds_choice custom_scripts_choice review_choice choice selected_cat
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_select=$(translate "tr-tui-select")
    tr_exit=$(translate "tr-tui-exit")
    packages_label=$(translate "tr-tui-packages")
    custom_feeds_label=$(translate "tr-tui-custom-feeds")
    [ -z "$custom_feeds_label" ] || [ "$custom_feeds_label" = "tr-tui-custom-feeds" ] && custom_feeds_label="Custom Feeds"
    custom_scripts_label=$(translate "tr-tui-custom-scripts")
    [ -z "$custom_scripts_label" ] || [ "$custom_scripts_label" = "tr-tui-custom-scripts" ] && custom_scripts_label="Custom Scripts"
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
            menu_items="$menu_items $i \"$(get_review_item_label "$i")\""

        done
        
        choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items")
        
        if ! [ $? -eq 0 ]; then
            return 0
        fi
        
        action=$(get_review_item_action "$choice")
        
        case "$action" in
            device_info)
                device_info_titled "$breadcrumb"
                ;;
            textbox)
                file=$(get_review_item_file "$choice")
                if [ -f "$file" ] && [ -s "$file" ]; then
                    show_textbox "$breadcrumb" "$file"
                else
                    local empty_class
                    empty_class=$(get_review_item_empty_class "$choice")
                    if [ -n "$empty_class" ]; then
                        show_msgbox "$breadcrumb" "$(translate "$empty_class")"
                    else
                        show_msgbox "$breadcrumb" "Empty"
                    fi
                fi
                ;;
            view_selected_custom_packages|view_customfeeds)
                $action
                ;;
            view_selected_custom_packages|view_customfeeds|view_customscripts)
                $action
                ;;
            apply)
                confirm_msg="$(translate 'tr-tui-apply-confirm-step1')
$(translate 'tr-tui-apply-confirm-step2')
$(translate 'tr-tui-apply-confirm-step3')
$(translate 'tr-tui-apply-confirm-step4')
$(translate 'tr-tui-apply-confirm-step5')

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

XX_aios2_whiptail_main() {
    export NEWT_COLORS
    device_info
    main_menu
}

aios2_whiptail_main() {
    export NEWT_COLORS
    device_info
    main_menu
}
