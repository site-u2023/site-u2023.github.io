#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC2154,SC2086,SC3001,SC3043
# OpenWrt Device Setup Tool - simple TEXT Module
# This file contains simple text-based UI functions

VERSION="R7.1210.1146"

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
    echo "" >&2
    if [ -n "$prompt" ]; then
        printf "%s [%s]: " "$prompt" "$default" >&2
    else
        printf "[%s]: " "$default" >&2
    fi
    read -r value
    
    if [ -z "$value" ]; then
        value="$default"
    fi
    
    # IPv4アドレスの場合、CIDRを自動付与
    if echo "$value" | grep -qE '^([0-9]{1,3}\.){3}[0-9]{1,3}$'; then
        value="${value}/24"
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

custom_feeds_selection() {
    local tr_main_menu tr_custom_feeds breadcrumb
    local i cat_id cat_name choice selected_cat
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
        show_menu_header "$breadcrumb"
        
        # カテゴリリストを表示
        i=1
        while read -r cat_id; do
            cat_name=$(get_category_name "$cat_id")
            show_numbered_item "$i" "$cat_name"
            i=$((i+1))
        done <<EOF
$categories
EOF
        
        # プロンプト表示
        echo ""
        echo "$CHOICE_BACK) $(translate "$DEFAULT_BTN_BACK")"
        echo ""
        printf "%s: " "$(translate 'tr-tui-ui-choice')"
        read -r choice
        
        # 戻る処理
        if [ "$choice" = "$CHOICE_BACK" ]; then
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
    
    while true; do
        show_menu_header "$breadcrumb"
        
        local i=1
        while read -r script_id; do
            local script_name
            script_name=$(get_customscript_name "$script_id")
            show_numbered_item "$i" "$script_name"
            i=$((i+1))
        done <<EOF
$all_scripts
EOF
        
        echo ""
        echo "$CHOICE_BACK) $(translate "$DEFAULT_BTN_BACK")"
        echo ""
        printf "%s: " "$(translate 'tr-tui-ui-choice')"
        read -r choice
        
        if [ "$choice" = "$CHOICE_BACK" ]; then
            return 0
        fi
        
        if [ -n "$choice" ]; then
            local selected_script
            selected_script=$(echo "$all_scripts" | sed -n "${choice}p")
            [ -n "$selected_script" ] && custom_script_options "$selected_script" "$breadcrumb"
        fi
    done
}

custom_script_options_ui() {
    local script_id="$1"
    local breadcrumb="$2"
    local filtered_options="$3"
    
    while true; do
        show_menu_header "$breadcrumb"
        
        local i=1
        while read -r option_id; do
            local option_label
            option_label=$(get_customscript_option_label "$script_id" "$option_id")
            show_numbered_item "$i" "$option_label"
            i=$((i+1))
        done <<EOF
$filtered_options
EOF
        
        echo ""
        echo "$CHOICE_BACK) $(translate "$DEFAULT_BTN_BACK")"
        echo ""
        printf "%s: " "$(translate 'tr-tui-ui-choice')"
        read -r choice
        
        if [ "$choice" = "$CHOICE_BACK" ]; then
            return 0
        fi
        
        if [ -n "$choice" ]; then
            local selected_option
            selected_option=$(echo "$filtered_options" | sed -n "${choice}p")
            
            if [ -n "$selected_option" ]; then
                : > "$CONFIG_DIR/script_vars_${script_id}.txt"
                
                echo "SELECTED_OPTION='$selected_option'" >> "$CONFIG_DIR/script_vars_${script_id}.txt"
                
                local idx=0
                local opt_ids opt_id env_json
                
                opt_ids=$(get_customscript_options "$script_id")
                for opt_id in $opt_ids; do
                    if [ "$opt_id" = "$selected_option" ]; then
                        break
                    fi
                    idx=$((idx+1))
                done
                
                env_json=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[$idx].envVars" 2>/dev/null | head -1)
                
                if [ -n "$env_json" ]; then
                    echo "$env_json" | \
                        sed 's/^{//; s/}$//; s/","/"\n"/g' | \
                        sed 's/^"//; s/"$//' | \
                        while IFS=: read -r key value; do
                            key=$(echo "$key" | tr -d '"')
                            value=$(echo "$value" | tr -d '"')
                            [ -n "$key" ] && [ -n "$value" ] && echo "${key}='${value}'" >> "$CONFIG_DIR/script_vars_${script_id}.txt"
                        done
                fi

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
    local summary_file
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_review=$(translate "tr-tui-review-configuration")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_review")
    
    summary_file=$(generate_config_summary)
    
    if [ ! -f "$summary_file" ] || [ ! -s "$summary_file" ] || grep -q "$(translate 'tr-tui-no-config')" "$summary_file"; then
        show_msgbox "$breadcrumb" "$(translate 'tr-tui-no-config')"
        return 0
    fi
    
    show_menu_header "$breadcrumb"
    cat "$summary_file"
    echo ""
    echo "----------------------------------------"
    
    if show_yesno "$breadcrumb" "🟣 $(translate 'tr-tui-apply-confirm-question')"; then
        echo "$(translate 'tr-tui-creating-backup')"
        if ! create_backup "before_apply"; then
            show_msgbox "$breadcrumb" "$(translate 'tr-tui-backup-failed')"
            return 1
        fi
        
        clear
        
        # パッケージマネージャーのアップデート
        update_package_manager
        
        # 失敗カウンタ
        local failed_count=0
        local failed_scripts=""
        
        # パッケージインストール
        if [ -s "$SELECTED_PACKAGES" ]; then
            echo "$(translate 'tr-tui-installing-packages')"
            sh "$CONFIG_DIR/postinst.sh"
            if [ $? -ne 0 ]; then
                failed_count=$((failed_count + 1))
                failed_scripts="${failed_scripts}postinst.sh "
            fi
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
                if [ $? -ne 0 ]; then
                    failed_count=$((failed_count + 1))
                    failed_scripts="${failed_scripts}$(basename "$script") "
                fi
            fi
        done
        
        # システム設定適用
        if [ -s "$SETUP_VARS" ]; then
            echo ""
            echo "$(translate 'tr-tui-applying-config')"
            sh "$CONFIG_DIR/setup.sh"
            if [ $? -ne 0 ]; then
                failed_count=$((failed_count + 1))
                failed_scripts="${failed_scripts}setup.sh "
            fi
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
                if [ $? -ne 0 ]; then
                    failed_count=$((failed_count + 1))
                    failed_scripts="${failed_scripts}$(basename "$script") "
                fi
            fi
        done
        
        # スクリプト実行後のクリーンアップ 
        echo "[DEBUG] Cleaning up after script execution..." >> "$CONFIG_DIR/debug.log"
        
        # 1. ファイルベースのキャッシュを除
        rm -f "$CONFIG_DIR"/script_vars_*.txt
        rm -f "$CONFIG_DIR"/customscripts-*.sh
        rm -f "$CONFIG_DIR"/temp_*.txt
        rm -f "$CONFIG_DIR"/*_snapshot*.txt
        
        # 2. メモリキャッシュをリア
        clear_selection_cache
        
        # 3. カスタムスクリプト関連のキャッシュもリア
        unset _CUSTOMSCRIPT_CACHE
        unset _CUSTOMSCRIPT_LOADED
        
        echo "[DEBUG] Cleanup completed" >> "$CONFIG_DIR/debug.log"
        
        echo ""
        
        # エラー表示
        if [ "$failed_count" -gt 0 ]; then
            show_msgbox "$breadcrumb" "$(translate 'tr-tui-config-applied')

Warning: $failed_count script(s) failed:
$failed_scripts"
        else
            show_msgbox "$breadcrumb" "$(translate 'tr-tui-config-applied')"
        fi
    fi
    
    return 0
}

device_info() {
    local tr_main_menu tr_device_info breadcrumb
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_device_info=$(translate "tr-tui-view-device-info")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_device_info")
    
    show_menu_header "$breadcrumb"
    
    build_deviceinfo_display
    
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
        set_var "connection_type" "auto"
        
        if [ "$DETECTED_CONN_TYPE" = "mape" ]; then
            set_var "mape_gua_prefix" "$MAPE_GUA_PREFIX"
            set_var "mape_br" "$MAPE_BR"
            set_var "mape_ipv4_prefix" "$MAPE_IPV4_PREFIX"
            set_var "mape_ipv4_prefixlen" "$MAPE_IPV4_PREFIXLEN"
            set_var "mape_ipv6_prefix" "$MAPE_IPV6_PREFIX"
            set_var "mape_ipv6_prefixlen" "$MAPE_IPV6_PREFIXLEN"
            set_var "mape_ealen" "$MAPE_EALEN"
            set_var "mape_psidlen" "$MAPE_PSIDLEN"
            set_var "mape_psid_offset" "$MAPE_PSID_OFFSET"
        elif [ "$DETECTED_CONN_TYPE" = "dslite" ]; then
            set_var "dslite_aftr_address" "$DSLITE_AFTR"
        fi
        
        # パッケージ追加
        auto_add_conditional_packages "internet-connection"
        auto_add_conditional_packages "setup-driven-packages"
        
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
        
        if ! should_show_item "$item_id" "$cat_id"; then
            continue
        fi
        
        local item_label
        item_label=$(get_setup_item_label "$item_id")
        
        case "$item_type" in
            radio-group)
                local variable default current options
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

                options=$(echo "$options" | sed 's/^___EMPTY___$//')
                
                echo ""
                echo "$item_label:"
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
                
                printf "%s" "$(translate 'tr-tui-ui-choice') [Enter=keep current]: "
                read -r choice
                
                if [ -n "$choice" ]; then
                    local selected_opt
                    selected_opt=$(echo "$options" | sed -n "${choice}p")
                    if [ -n "$selected_opt" ]; then
                        # disabledの場合は変数を削除
                        if [ "$selected_opt" = "disabled" ]; then
                            sed -i "/^${variable}=/d" "$SETUP_VARS"
                            echo "[DEBUG] Selected 'disabled', removed ${variable}" >> "$CONFIG_DIR/debug.log"
                        else
                            sed -i "/^${variable}=/d" "$SETUP_VARS"
                            echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                        fi

                        cleanup_radio_group_exclusive_vars "$item_id" "$selected_opt"
                        
                        auto_add_conditional_packages "$cat_id"
                        auto_cleanup_conditional_variables "$cat_id"
                        cleanup_orphaned_enablevars "$cat_id"
                    fi
                fi
                ;;
            
            section)
                local nested
                nested=$(get_section_nested_items "$item_id")
                if [ -n "$nested" ]; then
                    process_items "$cat_id" "$nested" "$breadcrumb"
                fi
                ;;
                
            field)
                local variable default field_type current
                variable=$(get_setup_item_variable "$item_id")
                default=$(get_setup_item_default "$item_id")
                field_type=$(get_setup_item_field_type "$item_id")
                
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
                
                if [ "$field_type" = "computed" ]; then
                    if [ "$item_id" = "dslite-aftr-address" ]; then
                        local aftr_type area computed
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
                    echo ""
                    echo "$item_label: $current"
                    continue
                fi
                
                if [ "$field_type" = "select" ]; then
                    local source
                    source=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].source" 2>/dev/null | head -1)
                    
                    if [ -z "$source" ]; then
                        source=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].source" 2>/dev/null | head -1)
                    fi
                    
                    if [ -n "$source" ]; then
                        case "$source" in
                            "browser-languages")
                                continue
                                ;;
                            *)
                                echo ""
                                printf '%s [%s]: ' "$item_label" "$current"
                                read -r value
                                
                                [ -z "$value" ] && value="$current"
                                
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

                    options=$(echo "$options" | sed 's/^___EMPTY___$//')
                    
                    echo ""
                    echo "$item_label:"
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
                    
                    printf "%s" "$(translate 'tr-tui-ui-choice') [Enter=keep current]: "
                    read -r choice
                    
                    if [ -n "$choice" ]; then
                        local selected_opt
                        selected_opt=$(echo "$options" | sed -n "${choice}p")
                        if [ -n "$selected_opt" ]; then
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
                            
                            if [ "$item_id" = "dslite-aftr-type" ] || [ "$item_id" = "dslite-area" ]; then
                                local aftr_type area computed
                                aftr_type=$(grep "^dslite_aftr_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                                area=$(grep "^dslite_jurisdiction=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
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
                    printf '%s [%s]: ' "$item_label" "$current"
                    read -r value
                    
                    if [ -z "$value" ]; then
                        sed -i "/^${variable}=/d" "$SETUP_VARS"
                        echo "[DEBUG] Empty input, removed ${variable}" >> "$CONFIG_DIR/debug.log"
                    else
                        sed -i "/^${variable}=/d" "$SETUP_VARS"
                        echo "${variable}='${value}'" >> "$SETUP_VARS"
                        echo "[DEBUG] Saved ${variable}='${value}'" >> "$CONFIG_DIR/debug.log"
                    fi
                fi
                ;;
                
            info-display)
                # ID直接検索でcontent/classを取得（インデックス計算を廃止）
                local raw_content raw_class
                
                # トップレベルアイテムを検索
                raw_content=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].items[@.id='$item_id'].content" 2>/dev/null | head -1)
                raw_class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].items[@.id='$item_id'].class" 2>/dev/null | head -1)
                
                # ネストされたアイテム（section内）を検索
                if [ -z "$raw_content" ] && [ -z "$raw_class" ]; then
                    raw_content=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].items[*].items[@.id='$item_id'].content" 2>/dev/null | head -1)
                    raw_class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].items[*].items[@.id='$item_id'].class" 2>/dev/null | head -1)
                fi

                # auto-info の特別処理
                if [ "$item_id" = "auto-info" ]; then
                    show_network_info
                    return $RETURN_STAY
                fi
                
                content="$raw_content"
                if [ -n "$raw_class" ] && [ "${raw_class#tr-}" != "$raw_class" ]; then
                    content=$(translate "$raw_class")
                fi
                
                if [ -n "$content" ]; then
                    echo ""
                    echo "$content"
                fi
                ;;
        esac
    done
    
    return 0
}

category_config() {
    local cat_id="$1"
    local tr_main_menu cat_title breadcrumb
    local temp_vars="$CONFIG_DIR/temp_vars_${cat_id}.txt"
    
    # 現在の状態をバックアップ
    cp "$SETUP_VARS" "$temp_vars"
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    cat_title=$(get_setup_category_title "$cat_id")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$cat_title")
    
    show_menu_header "$breadcrumb"
    
    if [ "$cat_id" = "basic-config" ]; then
        local tr_language current_lang
        tr_language=$(translate "tr-language")
        [ -z "$tr_language" ] || [ "$tr_language" = "tr-language" ] && tr_language="Language"
        
        current_lang=$(grep "^language=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
        [ -z "$current_lang" ] && current_lang="${AUTO_LANGUAGE}"
        
        echo ""
        printf "%s [%s]: " "$tr_language" "$current_lang"
        read -r value
        
        # 空欄の場合は削除、値がある場合は設定
        if [ -z "$value" ]; then
            sed -i "/^language=/d" "$SETUP_VARS"
            echo "[DEBUG] Empty language input, removed variable" >> "$CONFIG_DIR/debug.log"
        else
            sed -i "/^language=/d" "$SETUP_VARS"
            echo "language='${value}'" >> "$SETUP_VARS"
        fi
        # 常にパッケージ同期
        update_language_packages
    fi

    if [ "$cat_id" = "internet-connection" ]; then
        # 検出成功時のみダイアログを出す（条件チェック追加）
        if [ "$DETECTED_CONN_TYPE" != "unknown" ] && [ -n "$DETECTED_CONN_TYPE" ]; then
            if show_network_info; then
                echo ""
                echo "$(translate 'tr-tui-auto-config-applied')"
                sleep 2
                
                # パッケージ追加処理を追加
                auto_add_conditional_packages "internet-connection"
                auto_add_conditional_packages "setup-driven-packages"
                auto_cleanup_conditional_variables "$cat_id"
                cleanup_orphaned_enablevars "$cat_id"
                
                rm -f "$temp_vars"
                return 0
            fi
        fi
    fi
    
    process_items "$cat_id" "" "$breadcrumb"
    local ret=$?
    
    # キャンセルされた場合は元に戻す
    if [ "$ret" -ne 0 ]; then
        cp "$temp_vars" "$SETUP_VARS"
        rm -f "$temp_vars"
        return "$ret"
    fi
    
    # 成功: バックアップを削除
    rm -f "$temp_vars"
    
    auto_add_conditional_packages "$cat_id"
    auto_cleanup_conditional_variables "$cat_id"
    cleanup_orphaned_enablevars "$cat_id"
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

XXX_package_selection() {
    local cat_id="$1"
    local caller="${2:-normal}"
    local parent_breadcrumb="$3"

    if [ "$_PACKAGE_NAME_LOADED" -eq 0 ]; then
        get_package_name "dummy" > /dev/null 2>&1
    fi
    
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
    
    local display_list=""
    
    while read -r pkg_id; do
        if [ "$caller" = "custom_feeds" ] && ! package_compatible "$pkg_id"; then
            continue
        fi
        
        local names
        names=$(get_package_name "$pkg_id")
        
        while read -r pkg_name; do
            local is_selected
            
            if is_package_selected "$pkg_name" "$caller"; then
                is_selected="true"
            else
                is_selected="false"
            fi
            
            show_checkbox "$is_selected" "$pkg_name"
            display_list="${display_list}${pkg_name}|${pkg_id}
"
        done <<NAMES
$names
NAMES
    done <<EOF
$packages
EOF
    
    echo ""
    echo "Enter package number to toggle (or '$CHOICE_BACK' to go back):"
    
    local i=1
    while read -r line; do
        [ -z "$line" ] && continue
        local display_name
        display_name=$(echo "$line" | cut -d'|' -f1)
        show_numbered_item "$i" "$display_name"
        i=$((i+1))
    done <<DISPLAY
$display_list
DISPLAY
    
    echo ""
    echo "$CHOICE_BACK) $(translate "$DEFAULT_BTN_BACK")"
    echo ""
    printf "%s: " "$(translate 'tr-tui-ui-choice')"
    read -r choice
    
    if [ "$choice" = "$CHOICE_BACK" ]; then
        return $RETURN_STAY
    fi
    
    if [ -n "$choice" ]; then
        local selected_line
        selected_line=$(echo "$display_list" | sed -n "${choice}p")
        
        if [ -n "$selected_line" ]; then
            local selected_name pkg_id enable_var
            selected_name=$(echo "$selected_line" | cut -d'|' -f1)
            pkg_id=$(echo "$selected_line" | cut -d'|' -f2)
            
            if is_package_selected "$selected_name" "$caller"; then
                sed -i "/^${pkg_id}=/d" "$target_file"
                
                enable_var=$(get_package_enablevar "$pkg_id")
                if [ -n "$enable_var" ]; then
                    sed -i "/^${enable_var}=/d" "$SETUP_VARS"
                    echo "[DEBUG] Removed enableVar: ${enable_var} for deselected package: ${pkg_id}" >> "$CONFIG_DIR/debug.log"
                fi
            else
                local cache_line
                cache_line=$(echo "$_PACKAGE_NAME_CACHE" | grep "^${pkg_id}=")
                if [ -n "$cache_line" ]; then
                    echo "$cache_line" >> "$target_file"
                    
                    enable_var=$(get_package_enablevar "$pkg_id")
                    if [ -n "$enable_var" ] && ! grep -q "^${enable_var}=" "$SETUP_VARS" 2>/dev/null; then
                        echo "${enable_var}='1'" >> "$SETUP_VARS"
                        echo "[DEBUG] Added enableVar: ${enable_var} for selected package: ${pkg_id}" >> "$CONFIG_DIR/debug.log"
                    fi
                fi
            fi
            
            # 選択が変更されたのでキャッシュをクリア
            clear_selection_cache    
        fi
        
        package_selection "$cat_id" "$caller" "$parent_breadcrumb"
    fi
}

package_selection() {
    local cat_id="$1"
    local caller="${2:-normal}"
    local parent_breadcrumb="$3"

    if [ "$_PACKAGE_NAME_LOADED" -eq 0 ]; then
        get_package_name "dummy" > /dev/null 2>&1
    fi
    
    local cat_name breadcrumb target_file packages
    
    cat_name=$(get_category_name "$cat_id")
    breadcrumb="${parent_breadcrumb}${BREADCRUMB_SEP}${cat_name}"
    
    if [ "$caller" = "custom_feeds" ]; then
        target_file="$SELECTED_CUSTOM_PACKAGES"
    else
        target_file="$SELECTED_PACKAGES"
    fi
    
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
        
        # dependenciesには id または uniqueId が含まれる可能性がある
        while read -r dep; do
            [ -z "$dep" ] && continue
            
            # まずidとして検索
            if echo "$_PACKAGE_NAME_CACHE" | grep -q "^${dep}="; then
                dependent_ids="${dependent_ids}${dep} "
            else
                # uniqueIdとして検索（形式: id=name=uniqueId=...）
                local matched_id
                matched_id=$(echo "$_PACKAGE_NAME_CACHE" | grep "=${dep}=" | cut -d= -f1 | head -1)
                if [ -n "$matched_id" ]; then
                    dependent_ids="${dependent_ids}${matched_id} ${dep} "
                fi
            fi
        done <<DEPS
$deps
DEPS
    done <<EOF
$packages
EOF
    
    dependent_ids="${dependent_ids} "
    
    echo "[DEBUG] dependent_ids='$dependent_ids'" >> "$CONFIG_DIR/debug.log"
    
    show_menu_header "$breadcrumb"
    
    local cat_desc
    cat_desc=$(get_category_desc "$cat_id")
    echo "$cat_desc"
    echo ""
    
    local display_list=""
    
    while read -r pkg_id; do
        if [ "$caller" = "custom_feeds" ] && ! package_compatible "$pkg_id"; then
            continue
        fi
        
        # パッケージ存在確認（id で確認）
        if ! check_package_available "$pkg_id" "$caller"; then
            echo "[DEBUG] Package not available: $pkg_id" >> "$CONFIG_DIR/debug.log"
            continue
        fi
        
        # 依存パッケージかどうかをチェック（id と uniqueId の両方で判定）
        local is_dependent=0
        
        # キャッシュからこの pkg_id の全エントリを取得
        local cache_entries
        cache_entries=$(echo "$_PACKAGE_NAME_CACHE" | grep "^${pkg_id}=")
        
        while read -r entry; do
            [ -z "$entry" ] && continue
            
            local uid
            uid=$(echo "$entry" | cut -d= -f3)
            
            # 1. id でマッチ（スペース区切りで正確に）
            if echo " ${dependent_ids} " | grep -q " ${pkg_id} "; then
                is_dependent=1
                echo "[DEBUG] Matched as dependent by id: $pkg_id" >> "$CONFIG_DIR/debug.log"
                break
            fi
            
            # 2. uniqueId でマッチ
            if [ -n "$uid" ] && echo " ${dependent_ids} " | grep -q " ${uid} "; then
                is_dependent=1
                echo "[DEBUG] Matched as dependent by uniqueId: $uid (id=$pkg_id)" >> "$CONFIG_DIR/debug.log"
                break
            fi
        done <<ENTRIES
$cache_entries
ENTRIES
        
        # 独立パッケージで hidden なら非表示
        if [ "$is_dependent" -eq 0 ]; then
            local is_hidden
            if [ "$caller" = "custom_feeds" ]; then
                is_hidden=$(jsonfilter -i "$CUSTOMFEEDS_JSON" \
                    -e "@.categories[@.id='$cat_id'].packages[@.id='$pkg_id'].hidden" 2>/dev/null | head -1)
            else
                is_hidden=$(jsonfilter -i "$PACKAGES_JSON" \
                    -e "@.categories[@.id='$cat_id'].packages[@.id='$pkg_id'].hidden" 2>/dev/null | head -1)
            fi
            
            [ "$is_hidden" = "true" ] && continue
        fi
        
        local names
        names=$(get_package_name "$pkg_id")
        
        while read -r pkg_name; do
            local is_selected indent=""
            
            # 依存パッケージにインデント付与
            if [ "$is_dependent" -eq 1 ]; then
                indent="   "
            fi
            
            if is_package_selected "$pkg_name" "$caller"; then
                is_selected="true"
            else
                is_selected="false"
            fi
            
            # 表示用（チェックボックス）
            show_checkbox "$is_selected" "${indent}${pkg_name}"
            
            # リストに保存（インデント付き）
            display_list="${display_list}${indent}${pkg_name}|${pkg_id}
"
        done <<NAMES
$names
NAMES
    done <<EOF
$packages
EOF
    
    echo ""
    echo "Enter package number to toggle (or '$CHOICE_BACK' to go back):"
    
    local i=1
    while read -r line; do
        [ -z "$line" ] && continue
        local display_name
        
        display_name=$(echo "$line" | cut -d'|' -f1)
        
        show_numbered_item "$i" "$display_name"
        i=$((i+1))
    done <<DISPLAY
$display_list
DISPLAY
    
    echo ""
    echo "$CHOICE_BACK) $(translate "$DEFAULT_BTN_BACK")"
    echo ""
    printf "%s: " "$(translate 'tr-tui-ui-choice')"
    read -r choice
    
    if [ "$choice" = "$CHOICE_BACK" ]; then
        return $RETURN_STAY
    fi
    
    if [ -n "$choice" ]; then
        local selected_line
        selected_line=$(echo "$display_list" | sed -n "${choice}p")
        
        if [ -n "$selected_line" ]; then
            local selected_name pkg_id enable_var
            selected_name=$(echo "$selected_line" | cut -d'|' -f1)
            pkg_id=$(echo "$selected_line" | cut -d'|' -f2)
            
            # インデント除去してキャッシュ検索
            selected_name=$(echo "$selected_name" | sed 's/^[[:space:]]*//')
            
            if is_package_selected "$selected_name" "$caller"; then
                sed -i "/^${pkg_id}=/d" "$target_file"
                
                enable_var=$(get_package_enablevar "$pkg_id")
                if [ -n "$enable_var" ]; then
                    sed -i "/^${enable_var}=/d" "$SETUP_VARS"
                    echo "[DEBUG] Removed enableVar: ${enable_var} for deselected package: ${pkg_id}" >> "$CONFIG_DIR/debug.log"
                fi
            else
                local cache_line
                cache_line=$(echo "$_PACKAGE_NAME_CACHE" | grep "^${pkg_id}=")
                if [ -n "$cache_line" ]; then
                    echo "$cache_line" >> "$target_file"
                    
                    enable_var=$(get_package_enablevar "$pkg_id")
                    if [ -n "$enable_var" ] && ! grep -q "^${enable_var}=" "$SETUP_VARS" 2>/dev/null; then
                        echo "${enable_var}='1'" >> "$SETUP_VARS"
                        echo "[DEBUG] Added enableVar: ${enable_var} for selected package: ${pkg_id}" >> "$CONFIG_DIR/debug.log"
                    fi
                fi
            fi
            
            clear_selection_cache    
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

view_customscripts() {
    local tr_main_menu tr_review tr_customscripts breadcrumb
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_review=$(translate "tr-tui-review-configuration")
    tr_customscripts=$(translate "tr-tui-view-customscripts")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_review" "$tr_customscripts")
    
    if [ ! -f "$CUSTOMSCRIPTS_JSON" ]; then
        show_msgbox "$breadcrumb" "No custom scripts available"
        return 0
    fi
    
    local all_scripts
    all_scripts=$(get_customscript_all_scripts)
    
    while true; do
        show_menu_header "$breadcrumb"
        
        local i=1
        while read -r script_id; do
            local script_name
            script_name=$(get_customscript_name "$script_id")
            show_numbered_item "$i" "$script_name"
            i=$((i+1))
        done <<EOF
$all_scripts
EOF
        
        if [ -z "$all_scripts" ]; then
            echo "No custom scripts available"
        fi
        
        echo ""
        echo "$CHOICE_BACK) $(translate "$DEFAULT_BTN_BACK")"
        echo ""
        printf "%s: " "$(translate 'tr-tui-ui-choice')"
        read -r choice
        
        if [ "$choice" = "$CHOICE_BACK" ]; then
            return 0
        fi
        
        if [ -n "$choice" ]; then
            local selected_script script_name script_breadcrumb script_file
            selected_script=$(echo "$all_scripts" | sed -n "${choice}p")
            script_name=$(get_customscript_name "$selected_script")
            script_breadcrumb="${breadcrumb}${BREADCRUMB_SEP}${script_name}"
            
            script_file="$CONFIG_DIR/customscripts-${selected_script}.sh"
            
            if [ -f "$script_file" ]; then
                show_textbox "$script_breadcrumb" "$script_file"
            else
                show_msgbox "$script_breadcrumb" "Script not found: customscripts-${selected_script}.sh"
            fi
        fi
    done
}

view_selected_custom_scripts() {
    local tr_main_menu tr_review tr_scripts breadcrumb
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_review=$(translate "tr-tui-review-configuration")
    tr_scripts=$(translate "tr-tui-view-script-list")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_review" "$tr_scripts")
    
    # 生成されたcustomscripts-*.shを検索
    local scripts
    scripts=$(ls "$CONFIG_DIR"/customscripts-*.sh 2>/dev/null | xargs -n1 basename 2>/dev/null)
    
    if [ -z "$scripts" ]; then
        show_msgbox "$breadcrumb" "$(translate 'tr-tui-no-custom-scripts')"
        return 0
    fi
    
    while true; do
        show_menu_header "$breadcrumb"
        
        local i=1
        while read -r script_file; do
            local script_name
            script_name=$(echo "$script_file" | sed 's/^customscripts-//;s/\.sh$//')
            script_name=$(get_customscript_name "$script_name")
            show_numbered_item "$i" "$script_name"
            i=$((i+1))
        done <<EOF
$scripts
EOF
        
        echo ""
        echo "$CHOICE_BACK) $(translate "$DEFAULT_BTN_BACK")"
        echo ""
        printf "%s: " "$(translate 'tr-tui-ui-choice')"
        read -r choice
        
        if [ "$choice" = "$CHOICE_BACK" ]; then
            return 0
        fi
        
        if [ -n "$choice" ]; then
            local selected_script script_name script_breadcrumb
            selected_script=$(echo "$scripts" | sed -n "${choice}p")
            script_name=$(echo "$selected_script" | sed 's/^customscripts-//;s/\.sh$//')
            script_name=$(get_customscript_name "$script_name")
            script_breadcrumb="${breadcrumb}${BREADCRUMB_SEP}${script_name}"
            
            if [ -f "$CONFIG_DIR/$selected_script" ]; then
                show_textbox "$script_breadcrumb" "$CONFIG_DIR/$selected_script"
            else
                show_msgbox "$script_breadcrumb" "Script not found"
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

simple_main_menu() {
    while true; do
        show_menu_header "aios2 Vr.$VERSION"
        
        local i=1
        for cat_id in $(get_setup_categories); do
            local cat_title
            cat_title=$(get_setup_category_title "$cat_id")
            show_numbered_item "$i" "$cat_title"
            i=$((i+1))
        done
        
        local packages_label custom_feeds_label custom_scripts_label
        packages_label=$(translate "tr-tui-packages")
        show_numbered_item "$i" "$packages_label"
        local packages_choice=$i
        i=$((i+1))
        
        custom_feeds_label=$(translate "tr-tui-custom-feeds")
        show_numbered_item "$i" "$custom_feeds_label"
        local custom_feeds_choice=$i
        i=$((i+1))
        
        custom_scripts_label=$(translate "tr-tui-custom-scripts")
        show_numbered_item "$i" "$custom_scripts_label"
        local custom_scripts_choice=$i
        i=$((i+1))

        local restore_point_label
        restore_point_label=$(translate "tr-tui-restore-point")
        show_numbered_item "$i" "$restore_point_label"
        local restore_point_choice=$i
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
            continue
        elif [ "$choice" -eq "$packages_choice" ] 2>/dev/null; then
            package_categories
            continue
        elif [ "$choice" -eq "$custom_feeds_choice" ] 2>/dev/null; then
            custom_feeds_selection
            continue
        elif [ "$choice" -eq "$custom_scripts_choice" ] 2>/dev/null; then
            custom_scripts_selection
            continue
        elif [ "$choice" -eq "$restore_point_choice" ] 2>/dev/null; then
            restore_point_menu
            continue
        elif [ "$choice" -eq "$review_choice" ] 2>/dev/null; then
            review_and_apply
        fi
    done
}

aios2_simple_main() {
    device_info
    simple_main_menu
}
