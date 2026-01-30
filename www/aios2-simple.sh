#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC2154,SC2086,SC3001,SC3043
# OpenWrt Device Setup Tool - simple TEXT Module
# This file contains simple text-based UI functions

VERSION="R7.1214.1120"

CHOICE_BACK="0"
CHOICE_EXIT="00"

RETURN_STAY="0"
RETURN_BACK="1"
RETURN_MAIN="2"

DIALOG="whiptail"
DIALOG_HEIGHT=20
DIALOG_WIDTH=70
LIST_HEIGHT=12

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
        
        # ========================================
        # 実行計画ファイルを読み込み
        # ========================================
        local HAS_REMOVE=0 HAS_INSTALL=0 HAS_CUSTOMFEEDS=0 HAS_SETUP=0 HAS_CUSTOMSCRIPTS=0 NEEDS_UPDATE=0
        
        if [ -f "$CONFIG_DIR/execution_plan.sh" ]; then
            . "$CONFIG_DIR/execution_plan.sh"
        else
            echo "[ERROR] Execution plan not found" >> "$CONFIG_DIR/debug.log"
        fi
        
        local failed_count=0
        local failed_scripts=""
        
        # ========================================
        # 1. パッケージ削除
        # ========================================
        if [ "$HAS_REMOVE" -eq 1 ]; then
            echo ""
            echo "$(translate 'tr-tui-removing-packages')"
            
            sh "$CONFIG_DIR/remove.sh"
            
            if [ $? -ne 0 ]; then
                failed_count=$((failed_count + 1))
                failed_scripts="${failed_scripts}remove.sh "
            else
                echo "$(translate 'tr-tui-removal-completed')"
            fi
        fi
        
        # ========================================
        # 2. パッケージマネージャー更新（インストール対象がある場合のみ）
        # ========================================
        if [ "$NEEDS_UPDATE" -eq 1 ]; then
            echo ""
            echo "Updating package database..."
            update_package_manager
        fi
        
        # ========================================
        # 3. パッケージインストール
        # ========================================
        if [ "$HAS_INSTALL" -eq 1 ]; then
            echo ""
            echo "$(translate 'tr-tui-installing-packages')"
            sh "$CONFIG_DIR/postinst.sh"
            if [ $? -ne 0 ]; then
                failed_count=$((failed_count + 1))
                failed_scripts="${failed_scripts}postinst.sh "
            fi
        fi
        
        # ========================================
        # 4. カスタムフィードパッケージインストール
        # ========================================
        if [ "$HAS_CUSTOMFEEDS" -eq 1 ]; then
            echo ""
            echo "$(translate 'tr-tui-installing-custom-packages')"
            
            for script in "$CONFIG_DIR"/customfeeds-*.sh; do
                [ -f "$script" ] || continue
                [ "$(basename "$script")" = "customfeeds-none.sh" ] && continue
                
                local packages_value
                packages_value=$(grep '^PACKAGES=' "$script" 2>/dev/null | cut -d'"' -f2)
                [ -z "$packages_value" ] && continue
                
                sh "$script"
                if [ $? -ne 0 ]; then
                    failed_count=$((failed_count + 1))
                    failed_scripts="${failed_scripts}$(basename "$script") "
                fi
            done
        fi
        
        # ========================================
        # 5. システム設定適用
        # ========================================
        if [ "$HAS_SETUP" -eq 1 ]; then
            echo ""
            echo "$(translate 'tr-tui-applying-config')"
            sh "$CONFIG_DIR/setup.sh"
            if [ $? -ne 0 ]; then
                failed_count=$((failed_count + 1))
                failed_scripts="${failed_scripts}setup.sh "
            fi
        fi
        
        # ========================================
        # 6. カスタムスクリプト実行
        # ========================================
        if [ "$HAS_CUSTOMSCRIPTS" -eq 1 ]; then
            echo ""
            echo "$(translate 'tr-tui-installing-custom-scripts')"
            
            for script in "$CONFIG_DIR"/customscripts-*.sh; do
                [ -f "$script" ] || continue
                
                local script_id
                script_id=$(basename "$script" | sed 's/^customscripts-//;s/\.sh$//')
                
                [ ! -f "$CONFIG_DIR/script_vars_${script_id}.txt" ] && continue
                
                sh "$script"
                if [ $? -ne 0 ]; then
                    failed_count=$((failed_count + 1))
                    failed_scripts="${failed_scripts}$(basename "$script") "
                fi
            done
        fi
        
        # ========================================
        # 7. クリーンアップ
        # ========================================
        echo "[DEBUG] Cleaning up after script execution..." >> "$CONFIG_DIR/debug.log"
        
        rm -f "$CONFIG_DIR"/script_vars_*.txt
        rm -f "$CONFIG_DIR"/customscripts-*.sh
        rm -f "$CONFIG_DIR"/temp_*.txt
        rm -f "$CONFIG_DIR"/*_snapshot*.txt
        rm -f "$CONFIG_DIR/execution_plan.sh"
        
        clear_selection_cache
        
        unset _CUSTOMSCRIPT_CACHE
        unset _CUSTOMSCRIPT_LOADED

        _INSTALLED_PACKAGES_LOADED=0
        unset _INSTALLED_PACKAGES_CACHE
        cache_installed_packages
        
        echo "[DEBUG] Cleanup completed" >> "$CONFIG_DIR/debug.log"
        
        echo ""
        
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
        [ -n "$MAPE_STATIC_PREFIX" ] && echo "  option ip6prefix_static $MAPE_STATIC_PREFIX"
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
            set_var "mape_static_prefix" "$MAPE_STATIC_PREFIX"
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
                    if [ -n "$MAPE_STATIC_PREFIX" ]; then
                        default="static"
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

show_language_selector() {
    local breadcrumb="$1"
    local cache_file="$CONFIG_DIR/available_languages.cache"
    
    if [ ! -f "$cache_file" ] || [ ! -s "$cache_file" ]; then
        cache_available_languages
    fi
    
    if [ ! -f "$cache_file" ] || [ ! -s "$cache_file" ]; then
        show_msgbox "$breadcrumb" "$(translate 'tr-tui-no-languages-available')"
        return 1
    fi
    
    local current_lang=""
    if [ "$PKG_MGR" = "apk" ]; then
        current_lang=$(apk info 2>/dev/null | grep "^luci-i18n-base-" | sed 's/^luci-i18n-base-//' | head -1)
    else
        current_lang=$(opkg list-installed 2>/dev/null | grep "^luci-i18n-base-" | awk '{print $1}' | sed 's/^luci-i18n-base-//' | head -1)
    fi

    show_menu_header "$breadcrumb"
    
    local menu_items=""
    local idx=1
    while read -r lang; do
        [ -z "$lang" ] && continue
        
        local mark=" "
        [ "$lang" = "$current_lang" ] && mark="*"
        
        menu_items="$menu_items $idx \"${mark} $lang\""
        idx=$((idx + 1))
    done < "$cache_file"
    
    choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items")
    
    [ $? -ne 0 ] || [ -z "$choice" ] && return 0
    
    selected_lang=$(sed -n "${choice}p" "$cache_file")
    
    [ "$selected_lang" = "$current_lang" ] && return 0
    
    local lang_pkg="luci-i18n-base-${selected_lang}"
    
    if ! grep -q "^${lang_pkg}=" "$SELECTED_PACKAGES" 2>/dev/null; then
        echo "${lang_pkg}=${lang_pkg}===" >> "$SELECTED_PACKAGES"
        clear_selection_cache
    fi
    
    return 0
}

package_selection() {
    local cat_id="$1"
    local caller="${2:-normal}"
    local parent_breadcrumb="$3"

    # 言語パック専用セレクター
    if [ "$cat_id" = "language-pack" ]; then
        show_language_selector "$breadcrumb"
        return $?
    fi
    
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
    
    # 依存パッケージIDをキャッシュから取得（while true の外に移動）
    local dependent_ids=" "
    
    while read -r parent_id; do
        [ -z "$parent_id" ] && continue
        
        local deps=$(echo "$_PACKAGE_NAME_CACHE" | awk -F'=' -v id="$parent_id" '$1 == id || $3 == id {print $6; exit}')
        
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
        done <<DEPS_INNER
$(echo "$deps" | tr ',' '\n')
DEPS_INNER
    done <<EOF
$packages
EOF
    
    dependent_ids="${dependent_ids} "
    
    while true; do
        local menu_items=""
        local display_names=""
        local idx=1
        
        # ★★★ ここが改善ポイント：カテゴリのパッケージリストでループ ★★★
        while read -r pkg_id; do
            [ -z "$pkg_id" ] && continue
            
            # キャッシュから該当行を抽出
            local entry
entry=$(echo "$_PACKAGE_NAME_CACHE" | awk -F= -v id="$pkg_id" '$1 == id || $3 == id {print; exit}')
            [ -z "$entry" ] && continue
            
            local pkg_name uid
            pkg_name=$(echo "$entry" | cut -d= -f2)
            uid=$(echo "$entry" | cut -d= -f3)
            
            if [ "$caller" = "custom_feeds" ]; then
                package_compatible "$pkg_id" || continue
            fi
            
            check_package_available "$pkg_id" "$caller" || continue
            
            # 依存パッケージ判定（uniqueIdを優先）
            local is_dependent=0
            
            if [ -n "$uid" ]; then
                if echo " ${dependent_ids} " | grep -q " ${uid} "; then
                    is_dependent=1
                fi
            else
                if echo " ${dependent_ids} " | grep -q " ${pkg_id} "; then
                    is_dependent=1
                fi
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
            
            # 選択状態を表示名に含める
            local status_mark=""
            if is_package_selected "$pkg_id" "$caller"; then
                status_mark="[✓] "
            else
                status_mark="[ ] "
            fi
            
            display_names="${display_names}${display_name}|${pkg_id}
"
            
            menu_items="$menu_items $idx \"${status_mark}${display_name}\""
            idx=$((idx+1))
        done <<EOF
$packages
EOF
        
        local choice
        choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items")
        
        if [ $? -ne 0 ]; then
            return 0
        fi
        
        # 選択されたパッケージを取得
        local selected_line pkg_id
        selected_line=$(echo "$display_names" | sed -n "${choice}p")
        
        if [ -n "$selected_line" ]; then
            pkg_id=$(echo "$selected_line" | cut -d'|' -f2)
            local pkg_name
            pkg_name=$(echo "$selected_line" | cut -d'|' -f1 | sed 's/^[[:space:]]*//')
            
            # トグル処理
            if is_package_selected "$pkg_name" "$caller"; then
                remove_package_with_dependencies "$pkg_id" "$caller"
            else
                add_package_with_dependencies "$pkg_id" "$caller"
            fi
            
            clear_selection_cache
        fi
    done
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
