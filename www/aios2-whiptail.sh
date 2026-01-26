#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC2154,SC2086,SC3001,SC3043
# OpenWrt Device Setup Tool - whiptail TUI Module
# This file contains whiptail-specific UI functions

VERSION="R8.0123.1651"
TITLE="all in one scripts 2"

UI_WIDTH="78"
UI_HEIGHT="0"

DIALOG="whiptail"
DIALOG_HEIGHT=20
DIALOG_WIDTH=70
LIST_HEIGHT=12
    
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

# =============================================================================
# Summary List Builder
# =============================================================================
# Args:
#   $1 - header (translated label)
#   $2 - items (newline separated list)
#   $3 - action prefix (optional: "install"/"remove"/empty)
# Returns: formatted summary string
# =============================================================================
build_summary_section() {
    local header="$1"
    local items="$2"
    local action="$3"
    
    [ -z "$items" ] && return 0
    
    local result="${header}:\n"
    while read -r item; do
        [ -z "$item" ] && continue
        if [ -n "$action" ]; then
            result="${result}${action} ${item}\n"
        else
            result="${result}${item}\n"
        fi
    done <<EOF
$items
EOF
    result="${result}\n"
    
    printf '%s' "$result"
}

# Package Compatibility Check for Custom Feeds

custom_feeds_selection() {
    local tr_main_menu tr_custom_feeds breadcrumb
    local menu_items i cat_id cat_name choice selected_cat
    local categories
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_custom_feeds=$(translate "tr-tui-custom-feeds")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_custom_feeds")
    
    # メインループ（カテゴリ選択から戻ってきた時に再描画するため）
    while true; do
        # 共通処理：カテゴリ取得（ループ毎に最新状態を取得する場合）
        categories=$(custom_feeds_selection_prepare)
        
        if [ $? -ne 0 ] || [ -z "$categories" ]; then
            show_msgbox "$breadcrumb" "No custom feeds available"
            return 0
        fi

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
        
        # メニュー表示 (ボタンはデフォルト: Select/Back)
        choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items")
        
        # キャンセル（戻る）処理
        if ! [ $? -eq 0 ]; then
            return 0
        fi
        
        # カテゴリ選択処理
        if [ -n "$choice" ]; then
            selected_cat=$(echo "$categories" | sed -n "${choice}p")
            
            if [ -n "$selected_cat" ]; then
                # ここでパッケージ選択へ遷移
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

# =============================================================================
# Custom Script Options UI
# Saves SELECTED_OPTION and transitions to confirmation or input screen
# Uses radiolist (not checklist) because options are mutually exclusive
# =============================================================================
custom_script_options_ui() {
    local script_id="$1"
    local breadcrumb="$2"
    local filtered_options="$3"
    
    # 汎用インストール状態確認
    local installed=0
    is_script_installed "$script_id" && installed=1
    
    while true; do
        local radio_items menu_items i option_id option_label choice selected_option
        local current_selection=""
        
        if [ -f "$CONFIG_DIR/script_vars_${script_id}.txt" ]; then
            current_selection=$(grep "^SELECTED_OPTION=" "$CONFIG_DIR/script_vars_${script_id}.txt" 2>/dev/null | cut -d"'" -f2)
        fi
        
        radio_items=""
        menu_items=""
        i=1
        
        while read -r option_id; do
            [ -z "$option_id" ] && continue
            option_label=$(get_customscript_option_label "$script_id" "$option_id")
            
            local status="OFF"
            [ "$option_id" = "$current_selection" ] && status="ON"
            
            radio_items="$radio_items \"$i\" \"$option_label\" $status"
            menu_items="$menu_items $i \"$option_label\""
            i=$((i+1))
        done <<EOF
$filtered_options
EOF
        
        # UI切り替え
        if [ "$installed" -eq 1 ]; then
            # リムーブ → セレクター
            choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"$(translate 'tr-tui-select')\" \"$(translate 'tr-tui-back')\" $menu_items") || return 0
        else
            # インストール → ラジオボタン（排他式）
            choice=$(eval "$DIALOG --title \"\$breadcrumb\" \
                --ok-button \"$(translate 'tr-tui-select')\" \
                --cancel-button \"$(translate 'tr-tui-back')\" \
                --radiolist \"\" \
                $UI_HEIGHT $UI_WIDTH 0 \
                $radio_items" 3>&1 1>&2 2>&3) || return 0
        fi
        
        if [ -n "$choice" ]; then
            selected_option=$(echo "$filtered_options" | sed -n "${choice}p")
            
            local requires_confirmation
            requires_confirmation=$(get_customscript_option_requires_confirmation "$script_id" "$selected_option")
            if [ "$requires_confirmation" = "true" ]; then
                custom_script_confirm_ui "$script_id" "$selected_option" "$breadcrumb"
                
                if ! grep -q "^CONFIRMED='1'$" "$CONFIG_DIR/script_vars_${script_id}.txt" 2>/dev/null; then
                    continue
                fi
            fi
            
            local skip_inputs
            skip_inputs=$(get_customscript_option_skip_inputs "$script_id" "$selected_option")
            if [ "$skip_inputs" != "true" ]; then
                collect_script_inputs "$script_id" "$breadcrumb" "$selected_option"
            fi
        fi
    done
}

# =============================================================================
# Custom Script Confirmation UI
# =============================================================================
# チェックボックスの初期状態：
# * インストール済み → ファイルなし → チェックON（実態反映）
# * 未インストール → ファイルなし → チェックOFF（実態反映）
# * ファイルあり（CONFIRMED='1'） → チェックON
# * ファイルあり（CONFIRMED='0'） → チェックOFF
# =============================================================================
custom_script_confirm_ui() {
    local script_id="$1"
    local option_id="$2"
    local breadcrumb="$3"
    
    local script_name
    script_name=$(get_customscript_name "$script_id")
    local item_breadcrumb="${breadcrumb}${BREADCRUMB_SEP}${script_name}"
    
    local skip_inputs
    skip_inputs=$(get_customscript_option_skip_inputs "$script_id" "$option_id")
    
    # 汎用インストール状態検出
    local default_state="OFF"
    is_script_installed "$script_id" && default_state="ON"
    
    while true; do
        local confirmed="$default_state"
        
        # ファイルがあればその値で上書き
        if [ -f "$CONFIG_DIR/script_vars_${script_id}.txt" ]; then
            if grep -q "^CONFIRMED='1'$" "$CONFIG_DIR/script_vars_${script_id}.txt" 2>/dev/null; then
                confirmed="ON"
            elif grep -q "^CONFIRMED='0'$" "$CONFIG_DIR/script_vars_${script_id}.txt" 2>/dev/null; then
                confirmed="OFF"
            fi
        fi
        
        local initial_confirmed="$confirmed"
        
        local selected
        selected=$(eval "show_checklist \"\$item_breadcrumb\" \"($(translate 'tr-tui-space-toggle'))\" \"$(translate 'tr-tui-refresh')\" \"$(translate 'tr-tui-back')\" \"1\" \"${script_name}\" $confirmed")
        
        [ $? -ne 0 ] && return 1
        
        if echo "$selected" | grep -q "1"; then
            confirmed="ON"
        else
            confirmed="OFF"
        fi
        
        # 更新ボタンを押した時だけファイルを作成/更新
        : > "$CONFIG_DIR/script_vars_${script_id}.txt"
        echo "SELECTED_OPTION='${option_id}'" >> "$CONFIG_DIR/script_vars_${script_id}.txt"
        write_option_envvars "$script_id" "$option_id"
        
        if [ "$confirmed" = "ON" ]; then
            echo "CONFIRMED='1'" >> "$CONFIG_DIR/script_vars_${script_id}.txt"
        else
            echo "CONFIRMED='0'" >> "$CONFIG_DIR/script_vars_${script_id}.txt"
        fi
        
        return 0
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

# ============================================================
# show_network_info() - JSON駆動版
# information.json の mape-info / dslite-info カテゴリを使用
# ============================================================
show_network_info() {
    local breadcrumb="$1"
    local tr_isp tr_as tr_auto_detection info
    local info_json="$CONFIG_DIR/information.json"
    local api_json="$CONFIG_DIR/auto_config.json"
    
    echo "[DEBUG] show_network_info called" >> "$CONFIG_DIR/debug.log"
    
    tr_isp=$(translate "tr-isp")
    tr_as=$(translate "tr-as")
    
    # information.json がなければダウンロード
    if [ ! -f "$info_json" ]; then
        echo "[DEBUG] Downloading information.json..." >> "$CONFIG_DIR/debug.log"
        download_information_json
    fi
    
    # API レスポンスから接続タイプを判定
    local detected_type=""
    local mape_br dslite_aftr isp_name isp_as
    
    mape_br=$(jsonfilter -i "$api_json" -e "@.mape.brIpv6Address" 2>/dev/null)
    dslite_aftr=$(jsonfilter -i "$api_json" -e "@.aftr.aftrAddress" 2>/dev/null)
    isp_name=$(jsonfilter -i "$api_json" -e "@.isp" 2>/dev/null)
    isp_as=$(jsonfilter -i "$api_json" -e "@.as" 2>/dev/null)
    
    echo "[DEBUG] mape_br='$mape_br', dslite_aftr='$dslite_aftr'" >> "$CONFIG_DIR/debug.log"
    
    if [ -n "$mape_br" ]; then
        detected_type="mape"
    elif [ -n "$dslite_aftr" ]; then
        detected_type="dslite"
    else
        detected_type="unknown"
    fi
    
    echo "[DEBUG] detected_type='$detected_type'" >> "$CONFIG_DIR/debug.log"
    
    if [ "$detected_type" = "mape" ]; then
        tr_auto_detection=$(translate "tr-auto-detection")
        info="${tr_auto_detection}: MAP-E

"
        [ -n "$isp_name" ] && info="${info}${tr_isp}: $isp_name
"
        [ -n "$isp_as" ] && info="${info}${tr_as}: $isp_as
"
        
        # JSON から notice を取得
        local notice_class notice_text
        notice_class=$(jsonfilter -i "$info_json" -e "@.categories[@.id='mape-info'].notice.class" 2>/dev/null | head -1)
        if [ -n "$notice_class" ]; then
            notice_text=$(translate "$notice_class")
        else
            notice_text=$(jsonfilter -i "$info_json" -e "@.categories[@.id='mape-info'].notice.default" 2>/dev/null | head -1)
        fi
        [ -n "$notice_text" ] && info="${info}
${notice_text}

"
        
        # 値を一時ファイルに保存（id=値 形式）
        local field_cache="$CONFIG_DIR/mape_field_cache.txt"
        : > "$field_cache"
        
        # JSON からフィールドを取得してループ
        local i
        i=0
        while [ $i -lt 20 ]; do
            local field_id field_label field_api_path field_condition field_value
            
            # 各フィールドのプロパティを取得
            field_id=$(jsonfilter -i "$info_json" -e "@.categories[@.id='mape-info'].fields[$i].id" 2>/dev/null)
            [ -z "$field_id" ] && break
            
            field_label=$(jsonfilter -i "$info_json" -e "@.categories[@.id='mape-info'].fields[$i].label" 2>/dev/null)
            field_api_path=$(jsonfilter -i "$info_json" -e "@.categories[@.id='mape-info'].fields[$i].apiPath" 2>/dev/null)
            field_condition=$(jsonfilter -i "$info_json" -e "@.categories[@.id='mape-info'].fields[$i].condition" 2>/dev/null)
            
            # API から値を取得
            if [ -n "$field_api_path" ]; then
                field_value=$(jsonfilter -i "$api_json" -e "@.${field_api_path}" 2>/dev/null)
            else
                field_value=""
            fi
            
            echo "[DEBUG] MAP-E field[$i]: id='$field_id', label='$field_label', value='$field_value'" >> "$CONFIG_DIR/debug.log"
            
            # condition: hasValue の場合、値がなければスキップ
            if [ "$field_condition" = "hasValue" ] && [ -z "$field_value" ]; then
                i=$((i + 1))
                continue
            fi
            
            # 値を保存（id=値 形式）
            if [ -n "$field_id" ] && [ -n "$field_value" ]; then
                echo "${field_id}=${field_value}" >> "$field_cache"
            fi
            
            # 値がある場合のみ表示
            if [ -n "$field_value" ]; then
                info="${info}${field_label} ${field_value}
"
            fi
            
            i=$((i + 1))
        done
        
        # footer テキスト取得
        local footer_text
        footer_text=$(jsonfilter -i "$info_json" -e "@.categories[@.id='mape-info'].footer.text" 2>/dev/null)
        [ -n "$footer_text" ] && info="${info}
${footer_text}
"
        
        # link 取得
        local link_text link_url
        link_text=$(jsonfilter -i "$info_json" -e "@.categories[@.id='mape-info'].link.text" 2>/dev/null)
        link_url=$(jsonfilter -i "$info_json" -e "@.categories[@.id='mape-info'].link.url" 2>/dev/null)
        [ -n "$link_text" ] && info="${info}
${link_text}
"
        
        info="${info}

$(translate 'tr-tui-use-auto-config')"
        
        if show_yesno "$breadcrumb" "$info"; then
            # 基本設定
            set_var "connection_type" "auto"
            set_var "connection_auto" "mape"
            
            # GUA/PD 判定
            local mape_gua_prefix
            mape_gua_prefix=$(grep "^mape-ip6prefix-gua=" "$field_cache" 2>/dev/null | cut -d= -f2)
            if [ -n "$mape_gua_prefix" ]; then
                set_var "mape_type" "gua"
            else
                set_var "mape_type" "pd"
            fi
            
            # キャッシュから動的に set_var を呼び出す（id をそのまま使う）
            while IFS='=' read -r var_name var_value; do
                [ -z "$var_name" ] || [ -z "$var_value" ] && continue
                set_var "$var_name" "$var_value"
            done < "$field_cache"
            
            rm -f "$field_cache"

            auto_add_conditional_packages "internet-connection"
            auto_add_conditional_packages "setup-driven-packages"
            
            return 0
        else
            rm -f "$field_cache"
            return 1
        fi
    fi
    
    if [ "$detected_type" = "dslite" ]; then
        tr_auto_detection=$(translate "tr-auto-detection")
        info="${tr_auto_detection}: DS-Lite

"
        [ -n "$isp_name" ] && info="${info}${tr_isp}: $isp_name
"
        [ -n "$isp_as" ] && info="${info}${tr_as}: $isp_as
"
        
        # JSON から notice を取得
        local notice_class notice_text
        notice_class=$(jsonfilter -i "$info_json" -e "@.categories[@.id='dslite-info'].notice.class" 2>/dev/null | head -1)
        if [ -n "$notice_class" ]; then
            notice_text=$(translate "$notice_class")
        else
            notice_text=$(jsonfilter -i "$info_json" -e "@.categories[@.id='dslite-info'].notice.default" 2>/dev/null | head -1)
        fi
        [ -n "$notice_text" ] && info="${info}
${notice_text}

"
        
        # 値を一時ファイルに保存
        local field_cache="$CONFIG_DIR/dslite_field_cache.txt"
        : > "$field_cache"
        
        # JSON からフィールドを取得してループ
        local i
        i=0
        while [ $i -lt 20 ]; do
            local field_id field_label field_api_path field_value
            
            field_id=$(jsonfilter -i "$info_json" -e "@.categories[@.id='dslite-info'].fields[$i].id" 2>/dev/null)
            [ -z "$field_id" ] && break
            
            field_label=$(jsonfilter -i "$info_json" -e "@.categories[@.id='dslite-info'].fields[$i].label" 2>/dev/null)
            field_api_path=$(jsonfilter -i "$info_json" -e "@.categories[@.id='dslite-info'].fields[$i].apiPath" 2>/dev/null)
            
            # API から値を取得
            if [ -n "$field_api_path" ]; then
                field_value=$(jsonfilter -i "$api_json" -e "@.${field_api_path}" 2>/dev/null)
            else
                field_value=""
            fi
            
            echo "[DEBUG] DS-Lite field[$i]: id='$field_id', label='$field_label', value='$field_value'" >> "$CONFIG_DIR/debug.log"
            
            # 値を保存
            if [ -n "$field_id" ] && [ -n "$field_value" ]; then
                echo "${field_id}=${field_value}" >> "$field_cache"
            fi
            
            # 値がある場合のみ表示
            if [ -n "$field_value" ]; then
                info="${info}${field_label} ${field_value}
"
            fi
            
            i=$((i + 1))
        done
        
        info="${info}

$(translate 'tr-tui-use-auto-config')"
        
        if show_yesno "$breadcrumb" "$info"; then
            set_var "connection_type" "auto"
            set_var "connection_auto" "dslite"
            
            # キャッシュから動的に set_var を呼び出す（id をそのまま使う）
            while IFS='=' read -r var_name var_value; do
                [ -z "$var_name" ] || [ -z "$var_value" ] && continue
                set_var "$var_name" "$var_value"
            done < "$field_cache"
            
            rm -f "$field_cache"

            auto_add_conditional_packages "internet-connection"
            auto_add_conditional_packages "setup-driven-packages"
            
            return 0
        else
            rm -f "$field_cache"
            return 1
        fi
    fi
    
    # Unknown の場合
    local tr_isp_info tr_manual_config
    tr_isp_info=$(translate "tr-tui-isp-info")
    tr_manual_config=$(translate "tr-tui-manual-config-required")
    info="${tr_isp_info}

"
    [ -n "$isp_name" ] && info="${info}${tr_isp}: $isp_name
"
    [ -n "$isp_as" ] && info="${info}${tr_as}: $isp_as
"
    info="${info}
${tr_manual_config}"
    
    show_msgbox "$breadcrumb" "$info"
    return 1
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
            
            local radio_info
            radio_info=$(get_section_controlling_radio_info "$item_id")
            
            if [ -n "$radio_info" ]; then
                local radio_label option_label
                radio_label=$(echo "$radio_info" | cut -d'|' -f1)
                option_label=$(echo "$radio_info" | cut -d'|' -f2)
                
                item_breadcrumb="${breadcrumb}${BREADCRUMB_SEP}${radio_label}${BREADCRUMB_SEP}${option_label}"
                
                if [ -n "$item_label" ]; then
                    item_breadcrumb="${item_breadcrumb}${BREADCRUMB_SEP}${item_label}"
                fi
                
                echo "[DEBUG] Updated breadcrumb: $item_breadcrumb" >> "$CONFIG_DIR/debug.log"
            fi
            
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
                
                # 変数を保存（disabled含む全オプション共通）
                sed -i "/^${variable}=/d" "$SETUP_VARS"
                echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                echo "[DEBUG] Saved ${variable}='${selected_opt}' to SETUP_VARS" >> "$CONFIG_DIR/debug.log"

                cleanup_radio_group_exclusive_vars "$item_id" "$selected_opt"
                
                # option配下のitemsを処理
                local opt_label option_breadcrumb option_items opt_child_id
                opt_label=$(get_setup_item_option_label "$item_id" "$selected_opt")
                option_breadcrumb="${item_breadcrumb}${BREADCRUMB_SEP}${opt_label}"
                
                option_items=$(jsonfilter -i "$SETUP_JSON" \
                    -e "@.categories[@.id='$cat_id'].items[@.id='$item_id'].options[@.id='$selected_opt'].items[*].id" 2>/dev/null)
                
                if [ -z "$option_items" ]; then
                    option_items=$(jsonfilter -i "$SETUP_JSON" \
                        -e "@.categories[@.id='$cat_id'].items[*].items[@.id='$item_id'].options[@.id='$selected_opt'].items[*].id" 2>/dev/null)
                fi
                
                echo "[DEBUG] Option items: $option_items" >> "$CONFIG_DIR/debug.log"
                
                for opt_child_id in $option_items; do
                    [ -z "$opt_child_id" ] && continue
                    
                    if ! should_show_item "$opt_child_id" "$cat_id"; then
                        continue
                    fi
                    
                    process_items "$cat_id" "$opt_child_id" "$option_breadcrumb" "radio-group"
                    local opt_ret=$?
                    
                    case $opt_ret in
                        $RETURN_MAIN)
                            return $RETURN_MAIN
                            ;;
                    esac
                done
            fi
            return $RETURN_STAY
            ;;
            
        field)
            variable=$(get_setup_item_variable "$item_id")
            
            # variableが空の場合はSETUP_VARSへの保存をスキップ（lookupトリガー等の特殊フィールド）
            if [ -z "$variable" ]; then
                echo "[DEBUG] field $item_id has no variable, skipping save to SETUP_VARS" >> "$CONFIG_DIR/debug.log"
                
                # 入力ボックスは表示するが、値は保存しない
                default=$(get_setup_item_default "$item_id")
                field_type=$(get_setup_item_field_type "$item_id")
                
                local api_source api_value
                api_source=$(get_setup_item_api_source "$item_id")
                if [ -n "$api_source" ]; then
                    api_value=$(get_api_value "$api_source")
                    current="${api_value:-$default}"
                else
                    current="$default"
                fi
                
                value=$(show_inputbox "$item_breadcrumb" "" "$current")
                exit_code=$?
                
                if ! [ "$exit_code" -eq 0 ]; then
                    echo "[DEBUG] Inputbox cancelled, returning RETURN_BACK" >> "$CONFIG_DIR/debug.log"
                    return $RETURN_BACK
                fi
                
                echo "[DEBUG] Input received but not saved (no variable): '$value'" >> "$CONFIG_DIR/debug.log"
                return $RETURN_STAY
            fi
            
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
                    
                    # 変数を保存（disabled含む全オプション共通）
                    sed -i "/^${variable}=/d" "$SETUP_VARS"
                    echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                    echo "[DEBUG] Saved ${variable}='${selected_opt}' to SETUP_VARS" >> "$CONFIG_DIR/debug.log"
                    
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
            local raw_content raw_class
            
            raw_content=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].items[@.id='$item_id'].content" 2>/dev/null | head -1)
            raw_class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].items[@.id='$item_id'].class" 2>/dev/null | head -1)
            
            if [ -z "$raw_content" ] && [ -z "$raw_class" ]; then
                raw_content=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].items[*].items[@.id='$item_id'].content" 2>/dev/null | head -1)
                raw_class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].items[*].items[@.id='$item_id'].class" 2>/dev/null | head -1)
            fi

            if [ "$item_id" = "auto-info" ]; then
                if show_network_info "$item_breadcrumb"; then
                    return $RETURN_STAY
                else
                    return $RETURN_BACK
                fi
            fi
            
            content="$raw_content"
            if [ -n "$raw_class" ] && [ "${raw_class#tr-}" != "$raw_class" ]; then
                content=$(translate "$raw_class")
            fi
            
            [ -n "$content" ] && show_msgbox "$item_breadcrumb" "$content"
            return $RETURN_STAY
            ;;
    esac
    
    return $RETURN_STAY
}

show_auto_detection_if_available() {
    if [ "$DETECTED_CONN_TYPE" != "unknown" ] && [ -n "$DETECTED_CONN_TYPE" ]; then
        local tr_auto_detection breadcrumb
        
        tr_auto_detection=$(translate "tr-auto-detection")
        breadcrumb="$tr_auto_detection"
        
        if show_network_info "$breadcrumb"; then
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
    
    echo "[WHIPTAIL-DEBUG] About to call auto_add_conditional_packages for cat_id=$cat_id" >> "$CONFIG_DIR/debug.log"
    
    # 全カテゴリを対象に条件パッケージを評価（usteer, map, ds-lite, kmod-tcp-bbr等）
    auto_add_conditional_packages "*"
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

    echo "[DEBUG] All categories: $categories" >> "$CONFIG_DIR/debug.log"
    
    while read -r cat_id; do
        is_hidden=$(get_category_hidden "$cat_id")
        [ "$is_hidden" = "true" ] && continue
        visible_categories="${visible_categories}${cat_id}
"
    done <<EOF
$categories
EOF

    echo "[DEBUG] Visible categories: $visible_categories" >> "$CONFIG_DIR/debug.log"
    
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
    
    # ループ開始（他のパッケージ選択と同じ）
    while true; do
        # ★ 追加：ループ内でローカル変数を宣言
        local current_lang selected all_langs radio_list
        
        # 現在の言語検出
        current_lang=$(grep "^language=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
        
        if [ -z "$current_lang" ]; then
            current_lang=$(eval "$PKG_LIST_INSTALLED_CMD" 2>/dev/null | grep "^luci-i18n-base-" | sed 's/^luci-i18n-base-//' | head -1)
        fi
        
        [ -z "$current_lang" ] && current_lang="en"
        
        echo "[DEBUG] show_language_selector: current_lang='$current_lang'" >> "$CONFIG_DIR/debug.log"
        
        # en を含む全言語リスト
        all_langs=$(
            {
                echo "en"
                [ -f "$cache_file" ] && cat "$cache_file"
            } | sort -u
        )
        
        # ラジオリスト構築
        radio_list=""
        while read -r lang; do
            [ -z "$lang" ] && continue
            
            local status="OFF"
            [ "$lang" = "$current_lang" ] && status="ON"
            
            radio_list="$radio_list \"$lang\" \"\" $status"
        done <<EOF
$all_langs
EOF
        
        selected=$(eval "$DIALOG --title \"$breadcrumb\" \
            --ok-button \"$(translate 'tr-tui-refresh')\" \
            --cancel-button \"$(translate 'tr-tui-back')\" \
            --radiolist \"$(translate 'tr-tui-select-language')\" \
            $DIALOG_HEIGHT $DIALOG_WIDTH $LIST_HEIGHT \
            $radio_list" 3>&1 1>&2 2>&3)
        
        # キャンセル時はループ終了
        if [ $? -ne 0 ] || [ -z "$selected" ]; then
            echo "[DEBUG] Language selection cancelled or empty" >> "$CONFIG_DIR/debug.log"
            return 0
        fi
        
        selected=$(echo "$selected" | tr -d '"')
        
        echo "[DEBUG] Selected language: '$selected', current was: '$current_lang'" >> "$CONFIG_DIR/debug.log"
        
        # 変更なしの場合は次のループへ
        if [ "$selected" = "$current_lang" ]; then
            echo "[DEBUG] No language change detected, continuing loop" >> "$CONFIG_DIR/debug.log"
            continue
        fi
        
        # SETUP_VARSを更新
        sed -i "/^language=/d" "$SETUP_VARS"
        echo "language='${selected}'" >> "$SETUP_VARS"
        echo "[DEBUG] Set language='${selected}' in SETUP_VARS" >> "$CONFIG_DIR/debug.log"
        
        # 言語パッケージを更新（全LuCIパッケージ対応）
        update_language_packages
        clear_selection_cache
        
        # ループ継続（画面に戻る）
    done
}

package_selection() {
    local cat_id="$1"
    local caller="${2:-normal}"
    local parent_breadcrumb="$3"

    local cat_name breadcrumb
    cat_name=$(get_category_name "$cat_id")
    breadcrumb="${parent_breadcrumb}${BREADCRUMB_SEP}${cat_name}"
    
    if [ "$cat_id" = "language-pack" ]; then
        show_language_selector "$breadcrumb"
        return $?
    fi
    
    echo "[DEBUG] package_selection called: cat_id=$cat_id" >> "$CONFIG_DIR/debug.log"
    
    if [ "$_PACKAGE_NAME_LOADED" -eq 0 ]; then
        echo "[DEBUG] Loading package name cache..." >> "$CONFIG_DIR/debug.log"
        get_package_name "dummy" > /dev/null 2>&1
        echo "[DEBUG] Cache loaded, size: $(echo "$_PACKAGE_NAME_CACHE" | wc -l) lines" >> "$CONFIG_DIR/debug.log"
    fi

    local checklist_items
    local pkg_name status idx selected target_file idx_str idx_clean
    local packages
    
    packages=$(get_category_packages "$cat_id")

    echo "[DEBUG] Category packages:" >> "$CONFIG_DIR/debug.log"
    echo "$packages" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG] Package count: $(echo "$packages" | wc -l)" >> "$CONFIG_DIR/debug.log"
    
    # 依存パッケージIDをキャッシュから取得（1階層目のみ）
    local dependent_ids=" "
    
    while read -r parent_id; do
        [ -z "$parent_id" ] && continue
        
        local deps=$(echo "$_PACKAGE_NAME_CACHE" | awk -F'=' -v id="$parent_id" '$1 == id || $3 == id {print $6; exit}')
        
        echo "[DEBUG] parent_id=$parent_id, deps=$deps" >> "$CONFIG_DIR/debug.log"
        
        while read -r dep; do
            [ -z "$dep" ] && continue
            
            local matched_line=$(echo "$_PACKAGE_NAME_CACHE" | awk -F= -v dep="$dep" '$1 == dep || $3 == dep {print; exit}')
            
            if [ -n "$matched_line" ]; then
                local matched_id=$(echo "$matched_line" | cut -d= -f1)
                local matched_uid=$(echo "$matched_line" | cut -d= -f3)
                
                if [ -n "$matched_uid" ]; then
                    dependent_ids="${dependent_ids}${matched_id} ${matched_uid} "
                    echo "[DEBUG] Added dependency: id=$matched_id, uid=$matched_uid" >> "$CONFIG_DIR/debug.log"
                else
                    dependent_ids="${dependent_ids}${matched_id} "
                    echo "[DEBUG] Added dependency: id=$matched_id" >> "$CONFIG_DIR/debug.log"
                fi
            fi
        done <<DEPS_INNER
$(echo "$deps" | tr ',' '\n')
DEPS_INNER
    done <<EOF
$packages
EOF
    
    dependent_ids="${dependent_ids} "
    echo "[DEBUG] Final dependent_ids='$dependent_ids'" >> "$CONFIG_DIR/debug.log"
    
    # ループ開始 - 更新ボタンでここに戻る
    while true; do
        
        checklist_items=""
        idx=1
        local display_names=""
        local shown_pkg_ids=""

        while read -r pkg_id; do
            [ -z "$pkg_id" ] && continue

            echo "[DEBUG] Processing pkg_id: $pkg_id" >> "$CONFIG_DIR/debug.log"
            
            local entry
            entry=$(echo "$_PACKAGE_NAME_CACHE" | awk -F= -v id="$pkg_id" '$1 == id || $3 == id {print; exit}')

            echo "[DEBUG] Cache entry: $entry" >> "$CONFIG_DIR/debug.log"

            [ -z "$entry" ] && {
                echo "[DEBUG] No cache entry found for $pkg_id" >> "$CONFIG_DIR/debug.log"
                continue
            }
            
            # キャッシュから全フィールドを取得
            local pkg_name uid real_id hidden_flag virtual_flag pkg_owner
            pkg_name=$(echo "$entry" | cut -d= -f2)
            uid=$(echo "$entry" | cut -d= -f3)
            real_id=$(echo "$entry" | cut -d= -f1)
            hidden_flag=$(echo "$entry" | cut -d= -f7)
            virtual_flag=$(echo "$entry" | cut -d= -f8)
            pkg_owner=$(echo "$entry" | cut -d= -f11)
            
            echo "[DEBUG] Parsed: id=$real_id, name=$pkg_name, uid=$uid, hidden=$hidden_flag" >> "$CONFIG_DIR/debug.log"
            
            # カスタムフィードの場合のみ重複チェック
            if [ "$caller" = "custom_feeds" ]; then
                if echo "$shown_pkg_ids" | grep -qx "$real_id"; then
                    echo "[DEBUG] Skipping duplicate display: $real_id" >> "$CONFIG_DIR/debug.log"
                    continue
                fi
                shown_pkg_ids="${shown_pkg_ids}${real_id}
"
                package_compatible "$pkg_id" || continue
            fi

            # 依存パッケージ判定（1階層目のみ）
            local is_dependent=0
            
            if [ -n "$uid" ]; then
                if echo " ${dependent_ids} " | grep -q " ${uid} "; then
                    is_dependent=1
                    echo "[DEBUG] $pkg_id is dependent (matched by uid=$uid)" >> "$CONFIG_DIR/debug.log"
                fi
            fi
            
            if [ "$is_dependent" -eq 0 ]; then
                if echo " ${dependent_ids} " | grep -q " ${real_id} "; then
                    is_dependent=1
                    echo "[DEBUG] $pkg_id is dependent (matched by id=$real_id)" >> "$CONFIG_DIR/debug.log"
                fi
            fi

            # 所有権チェック（system または auto は UI に表示しない）
            if [ "$pkg_owner" = "system" ] || [ "$pkg_owner" = "auto" ]; then
                echo "[DEBUG] Package $pkg_id skipped from UI (owner=$pkg_owner)" >> "$CONFIG_DIR/debug.log"
                continue
            fi
            
            # hidden チェック（キャッシュから取得したフラグを使用）
            if [ "$is_dependent" -eq 0 ]; then
                # 独立パッケージ：hidden=true なら非表示
                if [ "$hidden_flag" = "true" ]; then
                    echo "[DEBUG] Package $pkg_id is hidden (independent package), skipped" >> "$CONFIG_DIR/debug.log"
                    continue
                fi
            else
                # 1階層目の依存パッケージ：hidden を無視して表示
                echo "[DEBUG] Package $pkg_id is dependent (level 1), ignoring hidden flag" >> "$CONFIG_DIR/debug.log"
            fi

            # availability check 用 caller を決定
            local avail_caller="$caller"
            [ "$is_dependent" -eq 1 ] && avail_caller="dependent"

            echo "[DEBUG] Checking availability for $pkg_id (caller=$avail_caller)" >> "$CONFIG_DIR/debug.log"
            
            if [ "$virtual_flag" != "true" ] && [ "$caller" != "custom_feeds" ]; then
                if ! check_package_available "$pkg_id" "$avail_caller"; then
                    echo "[DEBUG] Package $pkg_id not available, skipped" >> "$CONFIG_DIR/debug.log"
                    continue
                fi
            fi
    
            echo "[DEBUG] Package $pkg_id is available, adding to list" >> "$CONFIG_DIR/debug.log"
            
            local display_name="$pkg_name"
            if [ "$is_dependent" -eq 1 ]; then
                display_name="   ${pkg_name}"
            fi
            
            display_names="${display_names}${display_name}|${pkg_id}
"
            
            local status
            if is_package_selected "$pkg_id" "$caller"; then 
                status="ON"
            else
                status="OFF"
            fi
            
            checklist_items="$checklist_items \"$idx\" \"$display_name\" $status"
            idx=$((idx+1))
        done <<EOF
$packages
EOF
        
        local tr_space_toggle
        tr_space_toggle="($(translate 'tr-tui-space-toggle'))"
        local btn_refresh=$(translate "tr-tui-refresh")
        local btn_back=$(translate "tr-tui-back")
        
        [ -z "$btn_refresh" ] && btn_refresh="Update"
        [ -z "$btn_back" ] && btn_back="Back"

        selected=$(eval "show_checklist \"\$breadcrumb\" \"$tr_space_toggle\" \"\$btn_refresh\" \"\$btn_back\" $checklist_items")
        
        local exit_status=$?

        if [ $exit_status -ne 0 ]; then
            return 0
        fi
        
        if [ "$caller" = "custom_feeds" ]; then
            target_file="$SELECTED_CUSTOM_PACKAGES"
        else
            target_file="$SELECTED_PACKAGES"
        fi
        
        local old_selection=""
        while read -r pkg_id; do
            [ -z "$pkg_id" ] && continue
            
            if awk -F= -v target="$pkg_id" '($1 == target && $3 == "") || $3 == target' "$target_file" | grep -q .; then
                old_selection="${old_selection}${pkg_id}
"
            fi
        done <<EOF
$packages
EOF
        
        local new_selection=""
        for idx_str in $selected; do
            idx_clean=$(echo "$idx_str" | tr -d '"')
            local selected_line pkg_id
            selected_line=$(echo "$display_names" | sed -n "${idx_clean}p")
            
            if [ -n "$selected_line" ]; then
                pkg_id=$(echo "$selected_line" | cut -d'|' -f2)
                new_selection="${new_selection}${pkg_id}
"
            fi
        done
        
        while read -r pkg_id; do
            [ -z "$pkg_id" ] && continue
            if ! echo "$old_selection" | grep -qx "$pkg_id"; then
                add_package_with_dependencies "$pkg_id" "$caller"
            fi
        done <<NEW_SEL
$new_selection
NEW_SEL
        
        while read -r pkg_id; do
            [ -z "$pkg_id" ] && continue
            if ! echo "$new_selection" | grep -qx "$pkg_id"; then
                remove_package_with_dependencies "$pkg_id" "$caller"
            fi
        done <<OLD_SEL
$old_selection
OLD_SEL
        
        clear_selection_cache
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
            
            # そのまま表示
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
    
    local tr_main_menu tr_review breadcrumb
    local summary_file summary_content confirm_msg
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_review=$(translate "tr-tui-review-configuration")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_review")

    summary_file=$(generate_config_summary)
    
    summary_content=$(cat "$summary_file")

    confirm_msg="${summary_content}

🟣 $(translate 'tr-tui-apply-confirm-question')"
    
    if whiptail --title "$breadcrumb" --scrolltext --yes-button "$(translate "$DEFAULT_BTN_YES")" --no-button "$(translate "$DEFAULT_BTN_NO")" --yesno "$confirm_msg" 20 "$UI_WIDTH"; then
        clear
        
        local packages_to_remove
        packages_to_remove=$(detect_packages_to_remove)
        
        # カスタムスクリプト情報を実行前に取得
        local customscripts_to_install=""
        local customscripts_to_remove=""
        for var_file in "$CONFIG_DIR"/script_vars_*.txt; do
            [ -f "$var_file" ] || continue
            
            local cs_script_id cs_script_name
            cs_script_id=$(basename "$var_file" | sed 's/^script_vars_//;s/\.txt$//')
            
            grep -q "^CONFIRMED=" "$var_file" 2>/dev/null || continue
            
            local cs_installed=0
            local cs_confirmed=0
            is_script_installed "$cs_script_id" && cs_installed=1
            grep -q "^CONFIRMED='1'$" "$var_file" 2>/dev/null && cs_confirmed=1
            
            [ "$cs_installed" -eq "$cs_confirmed" ] && continue
            
            cs_script_name=$(get_customscript_name "$cs_script_id")
            [ -z "$cs_script_name" ] && cs_script_name="$cs_script_id"
            
            if [ "$cs_confirmed" -eq 1 ] && [ "$cs_installed" -eq 0 ]; then
                customscripts_to_install="${customscripts_to_install}${cs_script_name}\n"
            elif [ "$cs_confirmed" -eq 0 ] && [ "$cs_installed" -eq 1 ]; then
                customscripts_to_remove="${customscripts_to_remove}${cs_script_name}\n"
            fi
        done
        
        echo "Generating installation scripts..."
        initialize_language_packages
        generate_files
        
        local HAS_REMOVE=0 HAS_INSTALL=0 HAS_CUSTOMFEEDS=0 HAS_SETUP=0 HAS_CUSTOMSCRIPTS=0 NEEDS_UPDATE=0
        
        if [ -f "$CONFIG_DIR/execution_plan.sh" ]; then
            . "$CONFIG_DIR/execution_plan.sh"
        else
            echo "[ERROR] Execution plan not found" >> "$CONFIG_DIR/debug.log"
        fi
        
        local failed_count=0
        local failed_scripts=""
        
        local packages_to_install=""
        if [ "$HAS_INSTALL" -eq 1 ] && [ -f "$GENERATED_POSTINST" ]; then
            local raw_install_cmd
            raw_install_cmd=$(grep '^INSTALL_CMD=' "$GENERATED_POSTINST" 2>/dev/null | cut -d'"' -f2 | sed 's/.*apk add //;s/.*opkg install //')
            packages_to_install=$(pkg_list_normalize "$raw_install_cmd" | pkg_list_filter_out '^-')
        fi
        
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
        
        update_package_manager
        
        if [ "$HAS_INSTALL" -eq 1 ]; then
            echo ""
            echo "$(translate 'tr-tui-installing-packages')"
            sh "$GENERATED_POSTINST" || return 1
            if [ $? -ne 0 ]; then
                failed_count=$((failed_count + 1))
                failed_scripts="${failed_scripts}postinst.sh "
            fi
        fi
        
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
        
        if [ "$HAS_SETUP" -eq 1 ]; then
            echo ""
            echo "$(translate 'tr-tui-creating-backup')"
            if ! create_backup "before_setup" "$summary_content"; then
                show_msgbox "$breadcrumb" "$(translate 'tr-tui-backup-failed')"
                return 1
            fi
            
            echo "$(translate 'tr-tui-applying-config')"
            
            sh "$GENERATED_SETUP"
            
            if [ $? -ne 0 ]; then
                failed_count=$((failed_count + 1))
                failed_scripts="${failed_scripts}$(basename "$GENERATED_SETUP") "
            else
                echo "$(translate 'tr-tui-config-applied')"
            fi
        fi
        
        if [ "$HAS_CUSTOMSCRIPTS" -eq 1 ]; then
            echo ""
            echo "$(translate 'tr-tui-installing-custom-scripts')"
            
            for script in "$CONFIG_DIR"/customscripts-*.sh; do
                [ -f "$script" ] || continue
                
                local script_name
                script_name=$(basename "$script" .sh | sed 's/^customscripts-//')
                
                echo "Executing: $script_name"
                sh "$script"
                
                if [ $? -ne 0 ]; then
                    failed_count=$((failed_count + 1))
                    failed_scripts="${failed_scripts}$(basename "$script") "
                fi
            done
        fi
        
        local summary=""
        local has_changes=0
        
        # パッケージ削除
        if [ -n "$packages_to_remove" ]; then
            summary="${summary}$(build_summary_section "$(translate 'tr-tui-summary-removed')" "$packages_to_remove" "")"
            has_changes=1
        fi
        
        # パッケージインストール
        if [ -n "$packages_to_install" ]; then
            summary="${summary}$(build_summary_section "$(translate 'tr-tui-summary-installed')" "$packages_to_install" "")"
            has_changes=1
        fi
        
        # カスタムフィード削除
        if [ -f "$CONFIG_DIR/custom_feed_remove_list.txt" ]; then
            local custom_removed
            custom_removed=$(cat "$CONFIG_DIR/custom_feed_remove_list.txt" | xargs)
            if [ -n "$custom_removed" ]; then
                local custom_remove_list=""
                for pkg in $custom_removed; do
                    case " $packages_to_remove " in
                        *" $pkg "*) ;;
                        *) custom_remove_list="${custom_remove_list}${pkg}\n" ;;
                    esac
                done
                if [ -n "$custom_remove_list" ]; then
                    summary="${summary}$(build_summary_section "$(translate 'tr-tui-summary-removed')" "$(printf '%b' "$custom_remove_list")" "")"
                    has_changes=1
                fi
            fi
        fi
        
        # カスタムフィードインストール
        if [ "$HAS_CUSTOMFEEDS" -eq 1 ]; then
            local customfeed_install_list=""
            for script in "$CONFIG_DIR"/customfeeds-*.sh; do
                [ -f "$script" ] || continue
                [ "$(basename "$script")" = "customfeeds-none.sh" ] && continue
                
                local packages_value
                packages_value=$(grep '^PACKAGES=' "$script" 2>/dev/null | cut -d'"' -f2)
                
                if [ -n "$packages_value" ]; then
                    while read -r pkg_pattern; do
                        [ -z "$pkg_pattern" ] && continue
                        local pkg_name
                        pkg_name=$(echo "$pkg_pattern" | cut -d':' -f1)
                        customfeed_install_list="${customfeed_install_list}${pkg_name}\n"
                    done <<PKGS
$(echo "$packages_value" | tr ' ' '\n')
PKGS
                    break
                fi
            done
            if [ -n "$customfeed_install_list" ]; then
                summary="${summary}$(build_summary_section "$(translate 'tr-tui-summary-installed')" "$(printf '%b' "$customfeed_install_list")" "")"
                has_changes=1
            fi
        fi
        
        # 設定変数
        if [ "$HAS_SETUP" -eq 1 ]; then
            local setup_list=""
            while IFS= read -r line; do
                [ -z "$line" ] && continue
                case "$line" in
                    \#*) continue ;;
                esac
                setup_list="${setup_list}${line}\n"
            done < "$SETUP_VARS"
            if [ -n "$setup_list" ]; then
                local setup_count=$(grep -cv '^#\|^$' "$SETUP_VARS" 2>/dev/null || echo 0)
                summary="${summary}$(build_summary_section "$(translate 'tr-tui-summary-settings') (${setup_count})" "$(printf '%b' "$setup_list")" "")"
                has_changes=1
            fi
        fi
        
        # カスタムスクリプト
        if [ -n "$customscripts_to_remove" ]; then
            summary="${summary}$(build_summary_section "$(translate 'tr-tui-summary-customscripts')" "$(printf '%b' "$customscripts_to_remove")" "remove")"
            has_changes=1
        fi
        if [ -n "$customscripts_to_install" ]; then
            summary="${summary}$(build_summary_section "$(translate 'tr-tui-summary-customscripts')" "$(printf '%b' "$customscripts_to_install")" "install")"
            has_changes=1
        fi
        
        if [ "$has_changes" -eq 1 ]; then
            if [ "$failed_count" -gt 0 ]; then
                show_msgbox "$breadcrumb" "$(translate 'tr-tui-config-applied')\n\n${summary}\n$(translate 'tr-tui-warning'): $failed_count $(translate 'tr-tui-script-failed'):\n$failed_scripts"
            else
                show_msgbox "$breadcrumb" "$(translate 'tr-tui-config-applied')\n\n${summary}"
            fi
        else
            show_msgbox "$breadcrumb" "$(translate 'tr-tui-no-changes-applied')"
        fi
        
        echo "[DEBUG] Cleaning up after script execution..." >> "$CONFIG_DIR/debug.log"
        reset_state_for_next_session
        
        local needs_reboot=$(needs_reboot_check)
        
        if [ "$needs_reboot" -eq 1 ]; then
            if show_yesno "$breadcrumb" "$(translate 'tr-tui-reboot-question')"; then
                reboot
            fi
        elif [ "$HAS_SETUP" -eq 1 ]; then
            local connection_type connection_auto wifi_mode needs_restart=0
            connection_type=$(grep "^connection_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
            connection_auto=$(grep "^connection_auto=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
            wifi_mode=$(grep "^wifi_mode=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
            
            # MAP-E / DS-Lite → reboot必要
            if [ "$connection_type" = "mape" ] || [ "$connection_type" = "dslite" ] || \
               { [ "$connection_type" = "auto" ] && { [ "$connection_auto" = "mape" ] || [ "$connection_auto" = "dslite" ]; }; }; then
                if show_yesno "$breadcrumb" "$(translate 'tr-tui-reboot-question')"; then
                    reboot
                fi
            else
                # その他のネットワーク/WiFi変更 → サービスリスタート
                [ -n "$connection_type" ] && [ "$connection_type" != "disabled" ] && [ "$connection_type" != "dhcp" ] && needs_restart=1
                [ -n "$wifi_mode" ] && [ "$wifi_mode" != "disabled" ] && needs_restart=1
                
                if [ "$needs_restart" -eq 1 ]; then
                    if show_yesno "$breadcrumb" "$(translate 'tr-tui-restart-question')"; then
                        [ -n "$connection_type" ] && [ "$connection_type" != "disabled" ] && [ "$connection_type" != "dhcp" ] && {
                            for s in network firewall dnsmasq odhcpd uhttpd ttyd; do
                                /etc/init.d/$s restart 2>/dev/null
                            done
                        }
                        [ -n "$wifi_mode" ] && [ "$wifi_mode" != "disabled" ] && {
                            wifi reload 2>/dev/null
                            /etc/init.d/usteer restart 2>/dev/null
                        }
                    fi
                fi
            fi
        fi
    fi
    
    return 0
}

restore_point_menu() {
    local tr_main_menu tr_restore_point breadcrumb
    local current_path custom_path backups menu_items i choice selected_backup
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_restore_point=$(translate "tr-tui-restore-point")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_restore_point")
    
    current_path=$(load_restore_path)
    
    custom_path=$(show_inputbox "$breadcrumb" "$(translate 'tr-restore-backup-path')" "$current_path")
    
    if ! [ $? -eq 0 ] || [ -z "$custom_path" ]; then
        return 0
    fi
    
    save_restore_path "$custom_path"
    
    backups=$(ls -1t "${custom_path}"/backup-*.tar.gz 2>/dev/null)
    
    if [ -z "$backups" ]; then
        show_msgbox "$breadcrumb" "$(translate 'tr-tui-no-restore-points')"
        return 0
    fi
    
    menu_items=""
    i=1
    
    while read -r backup_file; do
        local timestamp display_date
        
        timestamp=$(basename "$backup_file" | sed 's/^backup-//;s/\.tar\.gz$//')
        display_date=$(echo "$timestamp" | sed 's/\([0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)_\([0-9]\{2\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)/\1-\2-\3 \4:\5:\6/')
        
        menu_items="$menu_items $i \"$display_date\""
        i=$((i+1))
    done <<EOF
$backups
EOF
    
    choice=$(eval "show_menu \"\$breadcrumb\" \"\" \"\" \"\" $menu_items")
    
    if ! [ $? -eq 0 ] || [ -z "$choice" ]; then
        return 0
    fi
    
    selected_backup=$(echo "$backups" | sed -n "${choice}p")
    
    # ★ メタデータファイルを読み込む
    local meta_file meta_content confirm_msg
    meta_file=$(echo "$selected_backup" | sed 's/\.tar\.gz$/.meta.txt/')
    
    if [ -f "$meta_file" ]; then
        meta_content=$(cat "$meta_file")
        confirm_msg="${meta_content}

$(translate 'tr-tui-restore-confirm')

$(translate 'tr-tui-restore-warning')"
    else
        confirm_msg="$(translate 'tr-tui-restore-confirm')

$(translate 'tr-tui-restore-warning')"
    fi
    
    if show_yesno "$breadcrumb" "$confirm_msg"; then
        if restore_from_backup "$selected_backup"; then
            if show_yesno "$breadcrumb" "$(translate 'tr-tui-restore-success')\n\n$(translate 'tr-tui-reboot-question')"; then
                reboot
            fi
        else
            show_msgbox "$breadcrumb" "$(translate 'tr-tui-restore-failed')"
        fi
    fi
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
