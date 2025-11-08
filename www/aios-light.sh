# Check if item should be shown based on showWhen conditions
should_show_item() {
    local item_id="$1"
    local cat_idx=0
    local item_idx=0
    
    # Find indices
    for cat_id in $(get_setup_categories); do
        local items=$(get_setup_category_items "$cat_id")
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
    
    # Get showWhen condition
    local show_when=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[$cat_idx].items[$item_idx].showWhen" 2>/dev/null)
    
    # If no showWhen, always show
    [ -z "$show_when" ] && return 0
    
    # Parse showWhen JSON and check conditions
    local check_var=$(echo "$show_when" | jsonfilter -e '@.*' 2>/dev/null | head -1)
    [ -z "$check_var" ] && return 0
    
    # Get the variable name (key)
    local var_name=$(echo "$show_when" | sed 's/[{}"]//g' | cut -d: -f1)
    
    # Get current value from SETUP_VARS
    local current_val=$(grep "^${var_name}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
    
    # Get expected values (array or single value)
    local expected=$(echo "$show_when" | jsonfilter -e "@.${var_name}[*]" 2>/dev/null)
    [ -z "$expected" ] && expected=$(echo "$show_when" | jsonfilter -e "@.${var_name}" 2>/dev/null)
    
    # Check if current value matches any expected value
    echo "$expected" | grep -qw "$current_val"
}

# Process items recursively, including sections
process_category_items() {
    local cat_id="$1"
    local parent_items="$2"
    
    local items
    if [ -z "$parent_items" ]; then
        items=$(get_setup_category_items "$cat_id")
    else
        items="$parent_items"
    fi
    
    for item_id in $items; do
        # Check showWhen condition
        should_show_item "$item_id" || continue
        
        local item_type=$(get_setup_item_type "$item_id")
        
        case "$item_type" in
            section)
                # Get section's nested items
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
                
                # Get nested items from section
                local nested=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[$cat_idx].items[$item_idx].items[*].id" 2>/dev/null)
                
                # Process nested items recursively
                [ -n "$nested" ] && process_category_items "$cat_id" "$nested"
                ;;
                
            field)
                local label=$(get_setup_item_label "$item_id")
                local variable=$(get_setup_item_variable "$item_id")
                local default=$(get_setup_item_default "$item_id")
                local placeholder=$(get_setup_item_placeholder "$item_id")
                local fieldtype=$(get_setup_item_fieldtype "$item_id")
                
                # Get current value
                local current=$(grep "^${variable}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                [ -z "$current" ] && current="$default"
                
                # Handle API source defaults
                case "$item_id" in
                    aios-country) [ -z "$current" ] && current="${ISP_COUNTRY:-$default}" ;;
                    aios-timezone) [ -z "$current" ] && current="${AUTO_TIMEZONE:-$default}" ;;
                    aios-zonename) [ -z "$current" ] && current="${AUTO_ZONENAME:-$default}" ;;
                esac
                
                if [ "$fieldtype" = "select" ]; then
                    echo "$label:"
                    local options=$(get_setup_item_options "$item_id")
                    local i=1
                    for opt in $options; do
                        local opt_label=$(get_setup_item_option_label "$item_id" "$opt")
                        echo "  $i) $opt_label"
                        i=$((i+1))
                    done
                    printf "Choice: "
                    read value
                    if [ -n "$value" ]; then
                        selected_opt=$(echo "$options" | sed -n "${value}p")
                        sed -i "/^${variable}=/d" "$SETUP_VARS"
                        echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                    fi
                else
                    printf "$label [${current:-$placeholder}]: "
                    read value
                    [ -z "$value" ] && value="$current"
                    if [ -n "$value" ]; then
                        sed -i "/^${variable}=/d" "$SETUP_VARS"
                        echo "${variable}='${value}'" >> "$SETUP_VARS"
                    fi
                fi
                echo ""
                ;;
                
            radio-group)
                local label=$(get_setup_item_label "$item_id")
                local variable=$(get_setup_item_variable "$item_id")
                local default=$(get_setup_item_default "$item_id")
                
                local current=$(grep "^${variable}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
                [ -z "$current" ] && current="$default"
                
                echo "$label:"
                local options=$(get_setup_item_options "$item_id")
                local i=1
                for opt in $options; do
                    local opt_label=$(get_setup_item_option_label "$item_id" "$opt")
                    echo "  $i) $opt_label"
                    i=$((i+1))
                done
                printf "Choice: "
                read value
                if [ -n "$value" ]; then
                    selected_opt=$(echo "$options" | sed -n "${value}p")
                    sed -i "/^${variable}=/d" "$SETUP_VARS"
                    echo "${variable}='${selected_opt}'" >> "$SETUP_VARS"
                fi
                echo ""
                ;;
                
            info-display)
                local content=$(get_setup_item_label "$item_id")
                echo "$content"
                echo ""
                ;;
        esac
    done
}

simple_category_config() {
    local cat_id="$1"
    local cat_title=$(get_setup_category_title "$cat_id")
    
    clear
    echo "=== $cat_title ==="
    echo ""
    
    # Show network information if this is internet-connection category
    if [ "$cat_id" = "internet-connection" ]; then
        simple_show_network_info
    fi
    
    # Process items with showWhen support
    process_category_items "$cat_id"
    
    echo "Settings saved! Press Enter..."
    read
}
