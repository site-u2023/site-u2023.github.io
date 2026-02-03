#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC2154,SC2086,SC3001,SC3043
# OpenWrt Device Setup Tool - CLI Version
# ASU (Attended SysUpgrade) Compatible
# Common Functions (UI-independent)

VERSION="R8.0117.1930"

# =============================================================================
# Package Management Architecture
# =============================================================================
#
# 【Package Cache Structure】
# 
# 1. _PACKAGE_NAME_CACHE format:
#    id=name=uniqueId=installOptions=enableVar=dependencies=hidden=virtual=reboot=checked=owner=isCustomFeed
#
# Field details:
#    1. id              - Package name for installation
#    2. name            - Display name in UI
#    3. uniqueId        - Unique identifier (for multiple entries with same id)
#    4. installOptions  - Installation option key (e.g. "ignoreDeps")
#    5. enableVar       - Variable name to set in setup.sh when selected
#    6. dependencies    - Comma-separated list of dependency package ids
#    7. hidden          - "true" if hidden, "false" otherwise
#    8. virtual         - "true" to skip availability check, "false" otherwise
#    9. reboot          - "true" if reboot required, "false" otherwise
#   10. checked         - "true" if selected by default, "false" otherwise
#   11. owner           - Package ownership: "system", "auto", "user", or empty
#   12. isCustomFeed    - "1" if managed by custom feed, "0" otherwise
#
# 【Package Ownership (owner field)】
#
# - **system**: Installed before aios2 started (pre-existing packages)
#   * Added by: initialize_installed_packages()
#   * Example: Packages already on device at startup
#
# - **auto**: Automatically added by conditional logic
#   * Added by: auto_add_conditional_packages()
#   * Example: map, ds-lite, luci-app-usteer (based on connection_type/wifi_mode)
#
# - **user**: Explicitly selected by user in package selection UI
#   * Added by: add_package_with_dependencies() via user interaction
#   * Example: User manually checks luci-app-ttyd in package menu
#
# - **empty**: Legacy entries without owner (treated as "user")
#
# 【Cache Loading Strategy】
# - Built on first access (lazy loading)
# - Source: postinst.json + customfeeds.json
# - Owner assigned during package addition:
#   * initialize_installed_packages() → owner=system
#   * auto_add_conditional_packages() → owner=auto
#   * add_package_with_dependencies() → owner=user
#
# 【uniqueId Handling】
# - If uniqueId exists: ALL checks use uniqueId (NOT id)
# - If uniqueId absent: use id for checks
# - Example: id="collectd", uniqueId="collectd-htop"
#   → Dependency check uses uniqueId="collectd-htop" ONLY
#
# 【Dependency Resolution Order】
# 1. Check if uniqueId exists
# 2. If uniqueId exists → search by uniqueId
# 3. If uniqueId absent → search by id
# 4. Dependent package (is_dependent=1) → display with indent
# 5. Independent package (is_dependent=0) → execute hidden check
#
# 【Package Display Rules】
# 
# **dependencies Array**: UI-level parent-child relationship (NOT opkg/apk deps)
#   - Parent selected → children auto-selected
#   - Children displayed with indentation
# 
# **hidden Attribute**:
#   - Independent packages: hidden=true → HIDDEN
#   - Level 1 dependencies: hidden=true → SHOWN (UX override)
#   - Level 2+ dependencies: hidden=true → HIDDEN
# 
# **Availability Check**:
#   - virtual=true: Skip check
#   - custom_feeds: Skip check
#   - Others: Must exist in repository
#
# 【Example Scenarios】
#
# Scenario 1: Fresh device startup
#   - Device has: luci-app-ttyd (pre-installed)
#   - aios2 starts → initialize_installed_packages()
#   - luci-app-ttyd marked as owner=system
#
# Scenario 2: User selects MAP-E
#   - User: connection_type=mape
#   - auto_add_conditional_packages() adds: map (owner=auto)
#   - User changes to: connection_type=disabled
#   - auto_add_conditional_packages() removes: map
#
# Scenario 3: User selects package manually
#   - User checks: luci-app-vnstat2 in package menu
#   - add_package_with_dependencies() adds with owner=user
#   - User unchecks: luci-app-vnstat2
#
# =============================================================================

MESSAGE="[Under Maintenance]"
SHOW_MESSAGE="VERSION"

DEVICE_CPU_CORES=$(grep -c "^processor" /proc/cpuinfo 2>/dev/null)
[ -z "$DEVICE_CPU_CORES" ] || [ "$DEVICE_CPU_CORES" -eq 0 ] && DEVICE_CPU_CORES=1
MAX_JOBS=$((DEVICE_CPU_CORES + 1))
[ "$MAX_JOBS" -gt 8 ] && MAX_JOBS=8
    
DEBUG_MODE="${DEBUG_MODE:-1}"

debug_log() {
    [ "$DEBUG_MODE" -eq 1 ] && echo "[DEBUG] $*" >> "$CONFIG_DIR/debug.log"
}

SCRIPT_NAME=$(basename "$0")
BASE_TMP_DIR="/tmp"
CONFIG_DIR="$BASE_TMP_DIR/aios2"
BACKUP_DIR="/etc/aios2/backup"
RESTORE_PATH_CONFIG="/etc/aios2/restore_path.txt"
MAX_BACKUPS="10"
BOOTSTRAP_URL="https://site-u.pages.dev/www"
AUTO_CONFIG_API_URL="https://auto-config.site-u.workers.dev/"
BASE_URL=""
PACKAGES_URL=""
SETUP_JSON_URL=""
SETUP_TEMPLATE_URL=""
POSTINST_TEMPLATE_URL=""
CUSTOMFEEDS_JSON_URL=""
CUSTOMSCRIPTS_JSON_URL=""
PACKAGES_DB_PATH=""
SETUP_DB_PATH=""
SETUP_TEMPLATE_PATH=""
LANGUAGE_PATH_TEMPLATE=""
CUSTOMFEEDS_DB_PATH=""
POSTINST_TEMPLATE_PATH=""
MEM_FREE_MB=""
FLASH_FREE_MB=""
LAN_IF=""
LAN_ADDR=""
LAN_ADDR6=""
DISTRIB_RELEASE=""
OPENWRT_VERSION=""

BREADCRUMB_SEP=" > "

_PACKAGE_NAME_CACHE=""
_PACKAGE_NAME_LOADED=0
_SELECTED_PACKAGES_CACHE_LOADED=0
_SELECTED_CUSTOM_CACHE_LOADED=0
_PACKAGE_COMPAT_LOADED=0
_SELECTED_PACKAGES_CACHE=""
_SELECTED_CUSTOM_CACHE=""
_PACKAGE_COMPAT_CACHE=""
_CONDITIONAL_PACKAGES_CACHE=""
_CONDITIONAL_PACKAGES_LOADED=0
_CUSTOMFEED_CATEGORIES_CACHE=""
_CUSTOMFEED_CATEGORIES_LOADED=0
_CATEGORIES_CACHE=""
_CATEGORIES_LOADED=0
_SETUP_CATEGORIES_CACHE=""
_SETUP_CATEGORIES_LOADED=0
_PACKAGE_AVAILABILITY_CACHE=""
_PACKAGE_AVAILABILITY_LOADED=0
_CATEGORY_PACKAGES_CACHE=""
_CATEGORY_PACKAGES_LOADED=0
_INSTALLED_PACKAGES_CACHE=""
_INSTALLED_PACKAGES_LOADED=0
_LANGUAGE_MODULE_PATTERNS=""
_LANGUAGE_MODULE_PATTERNS_LOADED=0
_LANGUAGE_EXCLUDE_PATTERNS=""
_LANGUAGE_EXCLUDE_PATTERNS_LOADED=0
_LANGUAGE_PREFIXES=""
_LANGUAGE_PREFIXES_LOADED=0
_VERSION_COMPAT_CACHE=""
_VERSION_COMPAT_LOADED=0
# =============================================================================
# Package Operation Helpers
# =============================================================================
# Low-level functions for package list manipulation
# Centralizes all SELECTED_PACKAGES/SELECTED_CUSTOM_PACKAGES operations
#
# Format: pkg_id=pkg_name=uniqueId=installOptions=enableVar=dependencies=hidden=virtual=reboot=checked=owner
# Owner values: system, auto, user, or empty (legacy, treated as user)
# =============================================================================

# Add package to selection list
# Args:
#   $1 - pkg_id (required)
#   $2 - owner: auto, system, user (default: auto)
#   $3 - caller: normal, custom_feeds (default: normal)
# Returns:
#   0 on success, 1 if already exists
pkg_add() {
    local pkg_id="$1"
    local owner="${2:-auto}"
    local caller="${3:-normal}"
    local target_file
    
    if [ "$caller" = "custom_feeds" ]; then
        target_file="$SELECTED_CUSTOM_PACKAGES"
    else
        target_file="$SELECTED_PACKAGES"
    fi
    
    if awk -F= -v target="$pkg_id" '($1 == target && $3 == "") || $3 == target' "$target_file" | grep -q .; then
        debug_log "pkg_add: $pkg_id already exists, skipped"
        return 1
    fi
    
    echo "${pkg_id}=${pkg_id}=========${owner}" >> "$target_file"
    debug_log "pkg_add: $pkg_id (owner=$owner)"
    return 0
}

# Remove package from selection list
# Args:
#   $1 - pkg_id (required)
#   $2 - owner filter: auto, system, user, or empty for all (default: empty)
#   $3 - caller: normal, custom_feeds (default: normal)
# Returns:
#   0 on success, 1 if not found
pkg_remove() {
    local pkg_id="$1"
    local owner="${2:-}"
    local caller="${3:-normal}"
    local target_file
    
    if [ "$caller" = "custom_feeds" ]; then
        target_file="$SELECTED_CUSTOM_PACKAGES"
    else
        target_file="$SELECTED_PACKAGES"
    fi
    
    if [ -n "$owner" ]; then
        awk -F= -v target="$pkg_id" -v o="$owner" '
            !(($1 == target && $3 == "") || $3 == target) || $11 != o
        ' "$target_file" > "$target_file.tmp" && mv "$target_file.tmp" "$target_file"
    else
        awk -F= -v target="$pkg_id" '
            !(($1 == target && $3 == "") || $3 == target)
        ' "$target_file" > "$target_file.tmp" && mv "$target_file.tmp" "$target_file"
    fi
    
    if ! awk -F= -v target="$pkg_id" '($1 == target && $3 == "") || $3 == target' "$target_file" | grep -q .; then
        debug_log "pkg_remove: $pkg_id (owner=${owner:-any})"
        return 0
    fi
    
    debug_log "pkg_remove: $pkg_id not found (owner=${owner:-any})"
    return 1
}

# Check if package exists in selection list
# Args:
#   $1 - pkg_id (required)
#   $2 - owner filter: auto, system, user, or empty for all (default: empty)
#   $3 - caller: normal, custom_feeds (default: normal)
# Returns:
#   0 if exists, 1 if not found
pkg_exists() {
    local pkg_id="$1"
    local owner="${2:-}"
    local caller="${3:-normal}"
    local target_file
    
    if [ "$caller" = "custom_feeds" ]; then
        target_file="$SELECTED_CUSTOM_PACKAGES"
    else
        target_file="$SELECTED_PACKAGES"
    fi
    
    if [ -n "$owner" ]; then
        awk -F= -v target="$pkg_id" -v o="$owner" '
            (($1 == target && $3 == "") || $3 == target) && $11 == o
        ' "$target_file" | grep -q .
    else
        awk -F= -v target="$pkg_id" '
            ($1 == target && $3 == "") || $3 == target
        ' "$target_file" | grep -q .
    fi
}

# Get owner of a package
# Args:
#    $1 - pkg_id (required)
#    $2 - caller: normal, custom_feeds (default: normal)
# Returns:
#    Prints owner value from the 11th field (system, auto, user, or empty)
pkg_get_owner() {
    local pkg_id="$1"
    local caller="${2:-normal}"
    local target_file
    
    if [ "$caller" = "custom_feeds" ]; then
        target_file="$SELECTED_CUSTOM_PACKAGES"
    else
        target_file="$SELECTED_PACKAGES"
    fi
    
    # sedによる末尾一致ではなく、フィールド番号指定(-f11)で取得
    # これにより、将来的に12番目以降のフィールドがファイルに書き込まれても owner を正しく識別可能
    grep "^${pkg_id}=" "$target_file" 2>/dev/null | head -1 | cut -d= -f11
}

clear_selection_cache() {
    _SELECTED_PACKAGES_CACHE_LOADED=0
    _SELECTED_CUSTOM_CACHE_LOADED=0
    _SELECTED_PACKAGES_CACHE=""
    _SELECTED_CUSTOM_CACHE=""
}

expand_template() {
    local template="$1"
    shift
    
    local sed_cmds=""
    
    while [ $# -gt 0 ]; do
        local key="$1"
        local value="$2"
        sed_cmds="${sed_cmds}s|{$key}|$value|g;"
        shift 2
    done
    
    echo "$template" | sed "$sed_cmds"
}

# adguardhome
# Operation mode variables (set by command line options)
INSTALL_MODE=""        # -i: openwrt|official
REMOVE_MODE=""         # -r: auto|manual
NO_YAML=""             # -n: skip YAML generation
SKIP_RESOURCE_CHECK="" # -c: skip resource check
UPDATE_CREDENTIALS=""  # -m: update credentials mode
TUI_MODE=""            # -t: tui mode

# URL and Path Configuration

PACKAGES_JSON="$CONFIG_DIR/postinst.json"
SETUP_JSON="$CONFIG_DIR/setup.json"
AUTO_CONFIG_JSON="$CONFIG_DIR/auto_config.json"
AUTO_CONFIG_DEF="$CONFIG_DIR/auto-config.json"
PACKAGE_MANAGER_JSON="$CONFIG_DIR/package-manager.json"

SELECTED_PACKAGES="$CONFIG_DIR/selected_packages.txt"
SELECTED_CUSTOM_PACKAGES="$CONFIG_DIR/selected_custom_packages.txt"
SETUP_VARS="$CONFIG_DIR/setup_vars.sh"
CUSTOMFEEDS_JSON="$CONFIG_DIR/customfeeds.json"
CUSTOMSCRIPTS_JSON="$CONFIG_DIR/customscripts.json"

# TPL_POSTINST, TPL_SETUP, GENERATED_POSTINST, GENERATED_SETUP は
# load_config_from_js() で動的に設定される

print_banner_unicode() {
	local="show_message"
	show_message="MESSAGE"
	
    printf "\n"
    printf       "\033[35m       ██ █\033[0m\n"
    printf       "\033[34m ████  ███   ████   █████\033[0m  \033[37m█████\033[0m\n"
    printf       "\033[32m    ██  ██  ██  ██ ██\033[0m          \033[37m██\033[0m\n"
    printf       "\033[33m █████  ██  ██  ██  █████\033[0m   \033[37m████\033[0m\n"
    printf "\033[38;5;208m██  ██  ██  ██  ██      ██\033[0m\033[37m ██\033[0m\n"
    printf       "\033[31m █████ ████  ████  ██████\033[0m  \033[37m██████\033[0m\n"
    printf "\n"
    if [ "$SHOW_MESSAGE" = "MESSAGE" ]; then
		printf "\033[33m       $MESSAGE\033[0m\n"
    else
        printf "\033[37m         Vr.$VERSION\033[0m\n"
    fi
    printf "\n"
    printf "\033[1;35mThis script is used at your own risk\033[0m\n"
	printf "\n"
}

banner_supported() {
    echo "$TERM" | grep -Eq 'xterm-256color|screen-256color|ttyd'
}

print_banner() {
    if banner_supported; then
        print_banner_unicode
    else
        printf "\aios2 Vr.%s\n\n" "$VERSION"
    fi
}

load_config_from_js() {
    local CONFIG_JS="$CONFIG_DIR/config.js"
    local CONFIG_CONTENT
    
    CONFIG_CONTENT=$(cat "$CONFIG_JS")
    
    BASE_URL_PART=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "base_url:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    BASE_PATH_PART=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "base_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    [ -z "$AUTO_CONFIG_API_URL" ] && AUTO_CONFIG_API_URL=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "auto_config_api_url:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    ASU_URL=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "asu_url:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
	AUTO_CONFIG_DEF_PATH=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "auto_config_json_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
	PACKAGES_DB_PATH=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "packages_db_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    POSTINST_TEMPLATE_PATH=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "postinst_template_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    SETUP_DB_PATH=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "setup_db_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    SETUP_TEMPLATE_PATH=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "setup_template_path_aios:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    CUSTOMFEEDS_DB_PATH=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "customfeeds_db_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    CUSTOMSCRIPTS_DB_PATH=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "customscripts_db_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    LANGUAGE_PATH_TEMPLATE=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "language_path_template:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    WHIPTAIL_UI_PATH=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "whiptail_ui_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    SIMPLE_UI_PATH=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "simple_ui_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    WHIPTAIL_FALLBACK_PATH=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "whiptail_fallback_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    PACKAGE_MANAGER_CONFIG_PATH=$(echo "$CONFIG_CONTENT" | grep -v '^\s*//' | grep "package_manager_config_path:" | head -1 | sed 's/.*"\([^"]*\)".*/\1/')
    
    BASE_URL="${BASE_URL_PART}/${BASE_PATH_PART}"

	AUTO_CONFIG_DEF_URL="${BASE_URL}/${AUTO_CONFIG_DEF_PATH}"
    PACKAGES_URL="${BASE_URL}/${PACKAGES_DB_PATH}"
    POSTINST_TEMPLATE_URL="${BASE_URL}/${POSTINST_TEMPLATE_PATH}"
    SETUP_JSON_URL="${BASE_URL}/${SETUP_DB_PATH}"
    SETUP_TEMPLATE_URL="${BASE_URL}/${SETUP_TEMPLATE_PATH}"
    CUSTOMFEEDS_JSON_URL="${BASE_URL}/${CUSTOMFEEDS_DB_PATH}"
    CUSTOMSCRIPTS_JSON_URL="${BASE_URL}/${CUSTOMSCRIPTS_DB_PATH}"
    WHIPTAIL_FALLBACK_URL="${BASE_URL}/${WHIPTAIL_FALLBACK_PATH}"
    PACKAGE_MANAGER_CONFIG_URL="${BASE_URL}/${PACKAGE_MANAGER_CONFIG_PATH}"
 
    local CACHE_BUSTER="?t=$(date +%s)"
    WHIPTAIL_UI_URL="${BASE_URL}/${WHIPTAIL_UI_PATH}${CACHE_BUSTER}"
    SIMPLE_UI_URL="${BASE_URL}/${SIMPLE_UI_PATH}${CACHE_BUSTER}"
    
    # テンプレートパスからファイル名を動的に抽出
    POSTINST_FILENAME=$(basename "$POSTINST_TEMPLATE_PATH")
    SETUP_FILENAME=$(basename "$SETUP_TEMPLATE_PATH")
    
    # テンプレートキャッシュパス
    TPL_POSTINST="$CONFIG_DIR/tpl_${POSTINST_FILENAME}"
    TPL_SETUP="$CONFIG_DIR/tpl_${SETUP_FILENAME}"
    
    # 生成スクリプトパス
    GENERATED_POSTINST="$CONFIG_DIR/${POSTINST_FILENAME}"
    GENERATED_SETUP="$CONFIG_DIR/${SETUP_FILENAME}"
    
    # Export for use in UI modules
    export GENERATED_POSTINST
    export GENERATED_SETUP
    
    {
        echo "[DEBUG] Config loaded: BASE_URL=$BASE_URL"
        echo "[DEBUG] AUTO_CONFIG_API_URL=$AUTO_CONFIG_API_URL"
        echo "[DEBUG] ASU_URL=$ASU_URL"
        echo "[DEBUG] TPL_POSTINST=$TPL_POSTINST"
        echo "[DEBUG] TPL_SETUP=$TPL_SETUP"
        echo "[DEBUG] GENERATED_POSTINST=$GENERATED_POSTINST"
        echo "[DEBUG] GENERATED_SETUP=$GENERATED_SETUP"
    } >> "$CONFIG_DIR/debug.log"
    
    return 0
}

# UI Common Functions

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

set_var() {
    local var_name="$1"
    local var_value="$2"
    sed -i "/^${var_name}=/d" "$SETUP_VARS"
    [ -n "$var_value" ] && echo "${var_name}='${var_value}'" >> "$SETUP_VARS"
}

# UI Mode Selection

select_ui_mode() {
    local whiptail_pkg="whiptail"
    local choice
    
    echo "Select UI Mode:"
    echo "1) whiptail (Dialog TUI)"
    echo "2) simple   (List TUI) [EXPERIMENTAL]"
    
    printf "Select [1]: "
    read -r choice
    
    case "$choice" in
        2)
            UI_MODE="simple"
            ;;
        *)
            UI_MODE="whiptail"
            if ! command -v whiptail >/dev/null 2>&1; then
                echo "Installing whiptail..."
                
                # パッケージリストを更新
                echo "Updating package lists..."
                eval "$PKG_UPDATE_CMD" || {
                    echo "Warning: Failed to update package lists"
                }
                
                if install_package $whiptail_pkg; then
                    echo "Installation successful."
                else
                    echo "Installation failed. Falling back to simple mode."
                    UI_MODE="simple"
                fi
            fi
            ;;
    esac
}

# Package Manager Detection

check_packages_installed() {
    MISSING_UI_PKGS=""
    
    for pkg in "$@"; do
        if [ "$PKG_MGR" = "opkg" ]; then
            opkg list-installed | grep -q "^${pkg}[[:space:]]*-" || MISSING_UI_PKGS="$MISSING_UI_PKGS $pkg"
        elif [ "$PKG_MGR" = "apk" ]; then
            apk info -e "$pkg" >/dev/null 2>&1 || MISSING_UI_PKGS="$MISSING_UI_PKGS $pkg"
        fi
    done
    
    [ -z "$MISSING_UI_PKGS" ]
}

load_package_manager_config() {
    local config_json="$CONFIG_DIR/package-manager.json"

    [ ! -f "$config_json" ] && return 1

    # ========================================
    # パッケージマネージャー検出
    # ========================================
    if command -v opkg >/dev/null 2>&1; then
        PKG_MGR="opkg"
    elif command -v apk >/dev/null 2>&1; then
        PKG_MGR="apk"
    else
        echo "Error: No supported package manager found" >&2
        return 1
    fi

    debug_log "PKG_MGR detected: $PKG_MGR"

    # ========================================
    # チャンネル自動判定（DISTRIB_RELEASE ベース）
    # ========================================
    if [ -z "$PKG_CHANNEL" ]; then
        local distrib_release=""
        if [ -f /etc/openwrt_release ]; then
            distrib_release=$(grep 'DISTRIB_RELEASE=' /etc/openwrt_release 2>/dev/null | cut -d"'" -f2)
        fi
        
        # SNAPSHOT判定
        if [ "$distrib_release" = "SNAPSHOT" ] || echo "$distrib_release" | grep -qi "snapshot"; then
            # APKかつSNAPSHOT → snapshotBare
            if [ "$PKG_MGR" = "apk" ]; then
                PKG_CHANNEL="snapshotBare"
            else
                PKG_CHANNEL="snapshot"
            fi
        else
            # 通常リリース
            PKG_CHANNEL="release"
        fi
        
        debug_log "Auto-detected PKG_CHANNEL: $PKG_CHANNEL (DISTRIB_RELEASE=$distrib_release)"
    fi

    debug_log "PKG_CHANNEL: $PKG_CHANNEL"

    # ========================================
    # packageManagers 配下
    # ========================================
    PKG_EXT=$(jsonfilter -i "$config_json" \
        -e "@.packageManagers.${PKG_MGR}.ext")

    PKG_DEPENDS_CMD=$(jsonfilter -i "$config_json" \
        -e "@.packageManagers.${PKG_MGR}.dependsCommand")

    PKG_WHATDEPENDS_CMD=$(jsonfilter -i "$config_json" \
        -e "@.packageManagers.${PKG_MGR}.whatDependsCommand")

    PKG_SYSTEM_PACKAGES=$(jsonfilter -i "$config_json" \
        -e "@.packageManagers.${PKG_MGR}.systemPackages[*]" 2>/dev/null | xargs)
        
    PKG_OPTION_IGNORE_DEPS=$(jsonfilter -i "$config_json" \
        -e "@.packageManagers.${PKG_MGR}.options.ignoreDeps")

    PKG_OPTION_FORCE_OVERWRITE=$(jsonfilter -i "$config_json" \
        -e "@.packageManagers.${PKG_MGR}.options.forceOverwrite")

    PKG_OPTION_ALLOW_UNTRUSTED=$(jsonfilter -i "$config_json" \
        -e "@.packageManagers.${PKG_MGR}.options.allowUntrusted")

    PKG_FEEDS=$(jsonfilter -i "$config_json" \
        -e "@.packageManagers.${PKG_MGR}.feeds[*]" 2>/dev/null | xargs)

    PKG_INCLUDE_TARGETS=$(jsonfilter -i "$config_json" \
        -e "@.packageManagers.${PKG_MGR}.includeTargets")

    PKG_INCLUDE_KMODS=$(jsonfilter -i "$config_json" \
        -e "@.packageManagers.${PKG_MGR}.includeKmods")

    PKG_LIST_INSTALLED_CMD=$(jsonfilter -i "$config_json" \
        -e "@.packageManagers.${PKG_MGR}.listInstalledCommand")

    # ========================================
    # channels 配下（release / snapshot / snapshotBare）
    # ========================================
    PKG_PACKAGE_INDEX_URL=$(jsonfilter -i "$config_json" \
        -e "@.channels.${PKG_CHANNEL}.${PKG_MGR}.packageIndexUrl")

    PKG_TARGETS_INDEX_URL=$(jsonfilter -i "$config_json" \
        -e "@.channels.${PKG_CHANNEL}.${PKG_MGR}.targetsIndexUrl")

    PKG_KMODS_INDEX_BASE_URL=$(jsonfilter -i "$config_json" \
        -e "@.channels.${PKG_CHANNEL}.${PKG_MGR}.kmodsIndexBaseUrl")

    PKG_KMODS_INDEX_URL=$(jsonfilter -i "$config_json" \
        -e "@.channels.${PKG_CHANNEL}.${PKG_MGR}.kmodsIndexUrl")

    # ========================================
    # コマンドテンプレート
    # ========================================
    local install_template remove_template update_template upgrade_template

    install_template=$(jsonfilter -i "$config_json" \
        -e "@.packageManagers.${PKG_MGR}.installCommand")

    remove_template=$(jsonfilter -i "$config_json" \
        -e "@.packageManagers.${PKG_MGR}.removeCommand")

    update_template=$(jsonfilter -i "$config_json" \
        -e "@.packageManagers.${PKG_MGR}.updateCommand")

    upgrade_template=$(jsonfilter -i "$config_json" \
        -e "@.packageManagers.${PKG_MGR}.upgradeCommand")

    PKG_INSTALL_CMD_TEMPLATE=$(expand_template "$install_template" \
        "allowUntrusted" "$PKG_OPTION_ALLOW_UNTRUSTED")

    PKG_REMOVE_CMD_TEMPLATE=$(expand_template "$remove_template")
    PKG_UPDATE_CMD=$(expand_template "$update_template")
    PKG_UPGRADE_CMD=$(expand_template "$upgrade_template")

    export PKG_MGR PKG_EXT PKG_CHANNEL
    export PKG_INSTALL_CMD_TEMPLATE PKG_REMOVE_CMD_TEMPLATE
    export PKG_UPDATE_CMD PKG_UPGRADE_CMD
    export PKG_OPTION_IGNORE_DEPS PKG_OPTION_FORCE_OVERWRITE PKG_OPTION_ALLOW_UNTRUSTED
    export PKG_PACKAGE_INDEX_URL PKG_TARGETS_INDEX_URL
    export PKG_KMODS_INDEX_BASE_URL PKG_KMODS_INDEX_URL
    export PKG_FEEDS PKG_INCLUDE_TARGETS PKG_INCLUDE_KMODS
    export PKG_LIST_INSTALLED_CMD
}

install_package() {
    local package="$1"
    local cmd
    
    cmd=$(expand_template "$PKG_INSTALL_CMD_TEMPLATE" "package" "$package")
    
    eval "$cmd"
}

# installOptionsキー名を実際のオプション値に変換
convert_install_option() {
    local opt_key="$1"
    [ -z "$opt_key" ] && return
    
    jsonfilter -i "$PACKAGE_MANAGER_JSON" -e "@.${PKG_MGR}.options.${opt_key}" 2>/dev/null
}

init() {
    local LOCK_FILE="$CONFIG_DIR/.aios2.lock"

    mkdir -p "$CONFIG_DIR"
    mkdir -p "$BACKUP_DIR"

    if [ -f "$LOCK_FILE" ]; then
        local old_pid
        old_pid=$(cat "$LOCK_FILE" 2>/dev/null)

        if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
            echo "Another instance (PID: $old_pid) is running."
            echo "Multiple instances can run simultaneously, but may overwrite each other's configuration."
            printf "Continue anyway? (y/n): "
            read -r answer
            if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
                exit 1
            fi
        else
            rm -f "$LOCK_FILE"
        fi
    fi

    echo "$$" > "$LOCK_FILE"
    trap "rm -f '$LOCK_FILE'" EXIT INT TERM

    local self_script
    self_script="$(basename "$0")"

    # $CONFIG_DIR内の全ファイル・サブディレクトリを削除（実行中スクリプト以外）
    for f in "$CONFIG_DIR"/* "$CONFIG_DIR"/.*; do
        [ -e "$f" ] || continue
        [ "$(basename "$f")" = "$self_script" ] && continue
        rm -rf "$f"
    done

    load_config_from_js || {
        echo "Fatal: Cannot load configuration"
        return 1
    }

    if ! download_file_with_cache "$PACKAGE_MANAGER_CONFIG_URL" "$PACKAGE_MANAGER_JSON"; then
        echo "Fatal: Cannot download package-manager.json"
        return 1
    fi
    
    # auto-config.json のダウンロード
    if ! download_file_with_cache "$AUTO_CONFIG_DEF_URL" "$AUTO_CONFIG_DEF"; then
        echo "Fatal: Cannot download auto-config.json"
        return 1
    fi

    # パッケージマネージャー設定読込（チャネル検出含む）
    load_package_manager_config || {
        echo "Fatal: Cannot load package manager configuration"
        return 1
    }

    # キャッシュ変数の完全初期化
    unset _PACKAGE_NAME_CACHE
    unset _SELECTED_PACKAGES_CACHE
    unset _SELECTED_CUSTOM_CACHE
    unset _PACKAGE_COMPAT_CACHE
    unset _CONDITIONAL_PACKAGES_CACHE
    unset _CUSTOMFEED_CATEGORIES_CACHE
    unset _CATEGORIES_CACHE
    unset _SETUP_CATEGORIES_CACHE
    unset _TRANSLATIONS_LOADED
    unset _PACKAGE_AVAILABILITY_CACHE
    unset _TRANSLATIONS_DATA
    unset _TRANSLATIONS_EN_LOADED
    unset _TRANSLATIONS_EN_DATA
    unset _CURRENT_LANG
    unset _CATEGORY_PACKAGES_CACHE
    unset _LANGUAGE_MODULE_PATTERNS
    unset _VERSION_COMPAT_CACHE
    
    _PACKAGE_NAME_LOADED=0
    _SELECTED_PACKAGES_CACHE_LOADED=0
    _SELECTED_CUSTOM_CACHE_LOADED=0
    _PACKAGE_COMPAT_LOADED=0
    _CONDITIONAL_PACKAGES_LOADED=0
    _CUSTOMFEED_CATEGORIES_LOADED=0
    _CATEGORIES_LOADED=0
    _SETUP_CATEGORIES_LOADED=0
    _PACKAGE_AVAILABILITY_LOADED=0
    _CATEGORY_PACKAGES_LOADED=0
    _LANGUAGE_MODULE_PATTERNS_LOADED=0
    _VERSION_COMPAT_LOADED=0
    
    : > "$SELECTED_PACKAGES"
    : > "$SELECTED_CUSTOM_PACKAGES"
    # SETUP_VARS は初回起動時のみ作成（既存ファイルは保持）
    [ ! -f "$SETUP_VARS" ] && : > "$SETUP_VARS"
    : > "$CONFIG_DIR/debug.log"

    download_postinst_json >/dev/null 2>&1
    download_customfeeds_json >/dev/null 2>&1

	build_conditional_packages_cache
	
    echo "[DEBUG] $(date): Init complete (PKG_MGR=$PKG_MGR, PKG_CHANNEL=$PKG_CHANNEL)" >> "$CONFIG_DIR/debug.log"
}

# Language and Translation

download_language_json() {
    local lang="${1:-en}"
    local lang_url="${BASE_URL}/$(echo "$LANGUAGE_PATH_TEMPLATE" | sed "s/{lang}/${lang}/")"
    local output_file="$CONFIG_DIR/lang_${lang}.json"
    
    __download_file_core "$lang_url" "$output_file"
    return $?
}

translate() {
    local key="$1"
    local lang="${AUTO_LANGUAGE:-en}"
    local lang_file="$CONFIG_DIR/lang_${lang}.json"
    local translation
    
    # 言語が変わったらキャッシュをクリア
    if [ "$_CURRENT_LANG" != "$lang" ]; then
        unset _TRANSLATIONS_LOADED
        unset _TRANSLATIONS_DATA
        _CURRENT_LANG="$lang"
    fi
    
    # キャッシュチェック
    if [ -z "$_TRANSLATIONS_LOADED" ]; then
        if [ -f "$lang_file" ]; then
            _TRANSLATIONS_DATA=$(cat "$lang_file" 2>/dev/null)
        fi
        _TRANSLATIONS_LOADED=1
    fi
    
    translation=$(echo "$_TRANSLATIONS_DATA" | jsonfilter -e "@['$key']" 2>/dev/null)
    
    if [ -n "$translation" ]; then
        echo "$translation"
        return 0
    fi
    
    # フォールバック: 英語
    if [ "$lang" != "en" ] && [ -f "$CONFIG_DIR/lang_en.json" ]; then
        if [ -z "$_TRANSLATIONS_EN_LOADED" ]; then
            _TRANSLATIONS_EN_DATA=$(cat "$CONFIG_DIR/lang_en.json" 2>/dev/null)
            _TRANSLATIONS_EN_LOADED=1
        fi
        
        translation=$(echo "$_TRANSLATIONS_EN_DATA" | jsonfilter -e "@['$key']" 2>/dev/null)
        
        if [ -n "$translation" ]; then
            echo "$translation"
            return 0
        fi
    fi
    
    echo "$key"
}

# File Downloads

download_file_with_cache() {
    local url="$1"
    local output_path="$2"
    
    # ファイルが存在し、かつ空でなければ JSON 検証
    if [ -f "$output_path" ] && [ -s "$output_path" ]; then
        # JSON ファイルなら構文チェック
        if echo "$output_path" | grep -q '\.json$'; then
            if jsonfilter -i "$output_path" -e '@' >/dev/null 2>&1; then
                # JSON が有効なら再利用
                return 0
            else
                # JSON が壊れている場合は削除して再ダウンロード
                echo "[DEBUG] Invalid JSON detected: $output_path, re-downloading..." >> "$CONFIG_DIR/debug.log"
                rm -f "$output_path"
            fi
        else
            # JSON 以外のファイルはサイズチェックのみ
            return 0
        fi
    fi
    
    __download_file_core "$url" "$output_path"
    return $?
}

download_setup_json() {
    fetch_cached_template "$SETUP_JSON_URL" "$SETUP_JSON"
    return $?
}

download_postinst_json() {
    download_file_with_cache "$PACKAGES_URL" "$PACKAGES_JSON"
    return $?
}

# Device Information

get_device_info() {
    if [ -f /etc/board.json ]; then
        DEVICE_MODEL=$(jsonfilter -i /etc/board.json -e '@.model.name' 2>/dev/null)
    fi
    
    if [ -f /etc/openwrt_release ]; then
        DEVICE_TARGET=$(grep 'DISTRIB_TARGET' /etc/openwrt_release 2>/dev/null | cut -d"'" -f2)
        DEVICE_ARCH=$(grep 'DISTRIB_ARCH' /etc/openwrt_release 2>/dev/null | cut -d"'" -f2)
    fi
    
    # vendor/subtarget分離
    if [ -n "$DEVICE_TARGET" ]; then
        DEVICE_VENDOR=$(echo "$DEVICE_TARGET" | cut -d'/' -f1)
        DEVICE_SUBTARGET=$(echo "$DEVICE_TARGET" | cut -d'/' -f2)
    fi
    
    [ -z "$DEVICE_MODEL" ] && DEVICE_MODEL="Unknown"
    [ -z "$DEVICE_TARGET" ] && DEVICE_TARGET="unknown/unknown"
    [ -z "$DEVICE_ARCH" ] && DEVICE_ARCH="unknown"
}

reset_detected_conn_type() {
    DETECTED_CONN_TYPE=$(detect_connection_type)
}

detect_ipv6_type() {
    . /lib/functions/network.sh
    network_flush_cache
    
    DETECTED_STATIC=""
    DETECTED_PD=""
    MAPE_STATIC_PREFIX=""
    
    for iface in $(ubus call network.interface dump | jsonfilter -e '@.interface[*].interface'); do
        ipv6_addr=$(ubus call network.interface."$iface" status 2>/dev/null | jsonfilter -e '@["ipv6-address"][0].address' 2>/dev/null)
        case "$ipv6_addr" in
            fe80:*|FE80:*|"") ;;
            2*|3*) [ -z "$DETECTED_STATIC" ] && DETECTED_STATIC="$ipv6_addr" ;;
        esac
        
        ipv6_prefix=$(ubus call network.interface."$iface" status 2>/dev/null | jsonfilter -e '@["ipv6-prefix"][0].address' 2>/dev/null)
        case "$ipv6_prefix" in
            2*|3*) [ -z "$DETECTED_PD" ] && DETECTED_PD="$ipv6_prefix" ;;
        esac
    done
    
    [ -n "$DETECTED_STATIC" ] && MAPE_STATIC_PREFIX="$(echo "$DETECTED_STATIC" | cut -d: -f1-4)::/64"
}

# APIダウンロード
download_api_with_retry() {
    echo "[DEBUG] Starting API download: $AUTO_CONFIG_API_URL" >> "$CONFIG_DIR/debug.log"
    
    if ! __download_file_core "$AUTO_CONFIG_API_URL" "$AUTO_CONFIG_JSON"; then
        echo ""
        echo "ERROR: API error"
        echo "[DEBUG] AUTO_CONFIG_API_URL=$AUTO_CONFIG_API_URL"
        echo "[DEBUG] AUTO_CONFIG_JSON=$AUTO_CONFIG_JSON"
        ls -la "$AUTO_CONFIG_JSON" 2>&1
        echo ""
        printf "Press [Enter] to exit. "
        read -r _
        exit 1
    fi
    
    # JSON validation
    if ! jsonfilter -i "$AUTO_CONFIG_JSON" -e '@.language' >/dev/null 2>&1; then
        echo "[DEBUG] JSON validation failed" >> "$CONFIG_DIR/debug.log"
        echo ""
        echo "ERROR: Invalid API response"
        echo ""
        printf "Press [Enter] to exit. "
        read -r _
        exit 1
    fi
    
    echo "[DEBUG] API download and validation successful" >> "$CONFIG_DIR/debug.log"
    return 0
}

get_language_code() {
    AUTO_LANGUAGE=$(uci get luci.main.lang 2>/dev/null)
    echo "[DEBUG] get_language_code: Initial AUTO_LANGUAGE='$AUTO_LANGUAGE'" >> "$CONFIG_DIR/debug.log"
    
    if [ "$AUTO_LANGUAGE" = "auto" ] || [ -z "$AUTO_LANGUAGE" ]; then
        local available_langs
        available_langs=$(uci show luci.languages 2>/dev/null | grep "^luci.languages\." | cut -d. -f3 | cut -d= -f1 | sort -u)
        
        echo "[DEBUG] get_language_code: available_langs='$available_langs'" >> "$CONFIG_DIR/debug.log"
        
        # 空でないかチェック
        if [ -n "$available_langs" ]; then
            local lang_count
            lang_count=$(echo "$available_langs" | wc -l)
            
            echo "[DEBUG] get_language_code: lang_count=$lang_count" >> "$CONFIG_DIR/debug.log"
            
            if [ "$lang_count" -eq 1 ]; then
                AUTO_LANGUAGE="$available_langs"
                echo "[DEBUG] get_language_code: Single language detected, AUTO_LANGUAGE='$AUTO_LANGUAGE'" >> "$CONFIG_DIR/debug.log"
            else
                AUTO_LANGUAGE=""
                echo "[DEBUG] get_language_code: Multiple languages detected, AUTO_LANGUAGE cleared" >> "$CONFIG_DIR/debug.log"
            fi
        else
            AUTO_LANGUAGE=""
            echo "[DEBUG] get_language_code: No languages found in LuCI config, AUTO_LANGUAGE cleared" >> "$CONFIG_DIR/debug.log"
        fi
    fi
    
    [ -z "$AUTO_LANGUAGE" ] && AUTO_LANGUAGE=""
    echo "[DEBUG] get_language_code: Final AUTO_LANGUAGE='$AUTO_LANGUAGE'" >> "$CONFIG_DIR/debug.log"
}

# =============================================================================
# Parse API Fields (auto-config.json driven)
# =============================================================================
# Dynamically sets shell variables based on auto-config.json definitions
# Supports basic, mape, dslite categories
# Note: LANGUAGE variable is renamed to API_LANGUAGE to avoid conflict with translation system
# Example: MAPE_BR, DSLITE_AFTR, ISP, COUNTRY etc.
# =============================================================================
parse_api_fields() {
    local category var_name json_path value i
    
    for category in basic mape dslite; do
        i=0
        while [ $i -lt 30 ]; do
            var_name=$(jsonfilter -i "$AUTO_CONFIG_DEF" -e "@.apiFields.${category}[$i].varName" 2>/dev/null)
            [ -z "$var_name" ] && break
            
            json_path=$(jsonfilter -i "$AUTO_CONFIG_DEF" -e "@.apiFields.${category}[$i].jsonPath" 2>/dev/null)
            [ -z "$json_path" ] && {
                i=$((i + 1))
                continue
            }
            
            value=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e "@.${json_path}" 2>/dev/null)
            
            # LANGUAGE だけは特別扱い（翻訳システムと競合するため）
            if [ "$var_name" = "LANGUAGE" ]; then
                eval "API_LANGUAGE='${value}'"
                export "API_LANGUAGE"
            else
                eval "${var_name}='${value}'"
                export "${var_name}"
            fi
            
            i=$((i + 1))
        done
    done
}

# =============================================================================
# Detect Connection Type (auto-config.json driven)
# =============================================================================
# Returns: "mape", "dslite", or "unknown"
# Uses connectionDetection rules from auto-config.json
# =============================================================================
detect_connection_type() {
    local mape_field dslite_field mape_val dslite_val
    
    mape_field=$(jsonfilter -i "$AUTO_CONFIG_DEF" -e "@.connectionDetection.mape.checkField" 2>/dev/null)
    dslite_field=$(jsonfilter -i "$AUTO_CONFIG_DEF" -e "@.connectionDetection.dslite.checkField" 2>/dev/null)
    
    eval "mape_val=\$$mape_field"
    eval "dslite_val=\$$dslite_field"
    
    if [ -n "$mape_val" ]; then
        echo "mape"
    elif [ -n "$dslite_val" ]; then
        echo "dslite"
    else
        echo "unknown"
    fi
}
	
get_extended_device_info() {
    # LuCIから言語設定を事前取得
    get_language_code
    
    get_device_info
    OPENWRT_VERSION=$(grep 'DISTRIB_RELEASE' /etc/openwrt_release 2>/dev/null | cut -d"'" -f2)
    
    # ★ 汎用的なバージョン正規化
    # パターン1: 19.07-9 → 19.07.9 (QSDK等のハイフン区切り)
    # パターン2: 22.03.5 → そのまま (公式OpenWrt)
    # パターン3: 4.5.0-release1 → 4.5.0 (GL.iNet等の独自ビルド)
    
    # まず DISTRIB_TARGET をチェックして特殊ケースを判定
    DEVICE_TARGET_RAW=$(grep 'DISTRIB_TARGET' /etc/openwrt_release 2>/dev/null | cut -d"'" -f2)
    
    # QSDKベース判定 (ipq95xx, ipq807x など)
    case "$DEVICE_TARGET_RAW" in
        ipq95xx/*|ipq807x/*|ipq60xx/*|ipq50xx/*)
            # QSDKの場合、ハイフンをドットに変換
            OPENWRT_VERSION=$(echo "$OPENWRT_VERSION" | sed 's/-/./g')
            debug_log "QSDK detected, normalized version: $OPENWRT_VERSION"
            ;;
    esac
    
    OPENWRT_VERSION_MAJOR=$(echo "$OPENWRT_VERSION" | cut -c 1-2)
    
    # DISTRIB_RELEASEも保持（チャンネル判定用）
    DISTRIB_RELEASE="$OPENWRT_VERSION"
    
    # auto-config.json ベースで全API値をパース
    parse_api_fields
    
    # AUTO_LANGUAGE: LuCIの設定を優先（get_language_code()で既に設定済み）
    # LuCIに設定がない、または複数言語で自動判定できない場合はAPIの言語を使用
    if [ -z "$AUTO_LANGUAGE" ] || [ "$AUTO_LANGUAGE" = "auto" ]; then
        AUTO_LANGUAGE="$API_LANGUAGE"
        echo "[DEBUG] Using API language: AUTO_LANGUAGE='$AUTO_LANGUAGE' (from API_LANGUAGE='$API_LANGUAGE')" >> "$CONFIG_DIR/debug.log"
    else
        echo "[DEBUG] Using existing language: AUTO_LANGUAGE='$AUTO_LANGUAGE'" >> "$CONFIG_DIR/debug.log"
    fi
    
    # 互換性のため一部変数名を調整
    AUTO_TIMEZONE="$TIMEZONE"
    AUTO_ZONENAME="$ZONENAME"
    AUTO_COUNTRY="$COUNTRY"
    ISP_NAME="$ISP"
    ISP_AS="$AS"
    ISP_IPV6="$IPV6"
    
    reset_detected_conn_type
    detect_ipv6_type
	
    # デバイス情報（CPU, Storage, USB）
    DEVICE_CPU=$(grep -m1 "model name" /proc/cpuinfo | cut -d: -f2 | xargs 2>/dev/null)
    [ -z "$DEVICE_CPU" ] && DEVICE_CPU=$(grep -m1 "Hardware" /proc/cpuinfo | cut -d: -f2 | xargs 2>/dev/null)
    DEVICE_STORAGE=$(df -h / | awk 'NR==2 {print $2}')
    DEVICE_STORAGE_USED=$(df -h / | awk 'NR==2 {print $3}')
    DEVICE_STORAGE_AVAIL=$(df -h / | awk 'NR==2 {print $4}')
    
    if [ -d /sys/bus/usb/devices ]; then
        DEVICE_USB="Available"
    else
        DEVICE_USB="Not available"
    fi

    # リソース情報（数値、チェック用）
    MEM_FREE_KB=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
    if [ -z "$MEM_FREE_KB" ]; then
        BUFFERS_KB=$(awk '/^Buffers:/ {print $2}' /proc/meminfo)
        CACHED_KB=$(awk '/^Cached:/ {print $2}' /proc/meminfo)
        MEM_FREE_KB=$((BUFFERS_KB + CACHED_KB))
    fi
    MEM_FREE_MB=$((MEM_FREE_KB / 1024))
    
    FLASH_FREE_KB=$(df -k / | awk 'NR==2 {print $4}')
    FLASH_FREE_MB=$((FLASH_FREE_KB / 1024))
    
    # メモリ情報（表示用）
    MEM_TOTAL_KB=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
    MEM_TOTAL_MB=$((MEM_TOTAL_KB / 1024))
    DEVICE_MEM="${MEM_TOTAL_MB} MB"
    
    # LANアドレス取得
    LAN_IF="$(ubus call network.interface.lan status 2>/dev/null | jsonfilter -e '@.l3_device')"
    if [ -n "$LAN_IF" ]; then
        LAN_ADDR=$(ip -4 -o addr show dev "$LAN_IF" scope global 2>/dev/null | awk 'NR==1{sub(/\/.*/,"",$4); print $4}')
        LAN_ADDR6=$(ip -6 -o addr show dev "$LAN_IF" scope global 2>/dev/null | grep -v temporary | awk 'NR==1{sub(/\/.*/,"",$4); print $4}')
    fi
    
    echo "[DEBUG] MAPE_STATIC_PREFIX='$MAPE_STATIC_PREFIX'" >> "$CONFIG_DIR/debug.log"
}

# Device Info (JSON-driven)

get_deviceinfo_items() {
    jsonfilter -i "$SETUP_JSON" -e '@.deviceInfo.items[*].id' 2>/dev/null | grep -v '^$'
}

get_deviceinfo_item_property() {
    local item_id="$1"
    local property="$2"
    jsonfilter -i "$SETUP_JSON" -e "@.deviceInfo.items[@.id='$item_id'].${property}" 2>/dev/null | head -1
}

check_deviceinfo_condition() {
    local item_id="$1"
    local conditions
    
    conditions=$(jsonfilter -i "$SETUP_JSON" -e "@.deviceInfo.items[@.id='$item_id'].condition[*]" 2>/dev/null)
    
    [ -z "$conditions" ] && return 0
    
    while read -r var_name; do
        [ -z "$var_name" ] && continue
        local value
        value=$(eval "echo \$$var_name")
        [ -z "$value" ] && return 1
    done <<EOF
$conditions
EOF
    
    return 0
}

get_deviceinfo_value() {
    local item_id="$1"
    local source format
    
    source=$(get_deviceinfo_item_property "$item_id" "source")
    
    case "$source" in
        computed)
            format=$(get_deviceinfo_item_property "$item_id" "format")
            if [ -n "$format" ]; then
                echo "$format" | sed \
                    -e "s/{MEM_FREE_MB}/${MEM_FREE_MB}/g" \
                    -e "s/{DEVICE_MEM}/${DEVICE_MEM}/g" \
                    -e "s/{DEVICE_STORAGE_AVAIL}/${DEVICE_STORAGE_AVAIL}/g" \
                    -e "s/{DEVICE_STORAGE}/${DEVICE_STORAGE}/g"
            fi
            ;;
        current_lang)
            local current_lang
            current_lang=$(grep "^language=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
            [ -z "$current_lang" ] && current_lang="${AUTO_LANGUAGE}"
            echo "$current_lang"
            ;;
        *)
            eval "echo \$$source"
            ;;
    esac
}

build_deviceinfo_display() {
    local info=""
    
    for item_id in $(get_deviceinfo_items); do
        local item_type label value
        
        item_type=$(get_deviceinfo_item_property "$item_id" "type")
        
        if [ "$item_type" = "blank" ]; then
            info="${info}
"
            continue
        fi
        
        if ! check_deviceinfo_condition "$item_id"; then
            continue
        fi
        
        label=$(get_deviceinfo_item_property "$item_id" "label")
        value=$(get_deviceinfo_value "$item_id")
        
        [ -n "$value" ] && info="${info}${label}: ${value}
"
    done
    
    echo "$info"
}

# Package Management

# =============================================================================
# Package List Format Utilities
# =============================================================================
# Centralized package list format conversion functions
# Internal format: newline-separated (easy for grep/awk)
# Command format: space-separated (for shell command arguments)
# Display format: newline-separated (for UI display)
# =============================================================================

# Convert space-separated to newline-separated
pkg_list_normalize() {
    local input="$1"
    echo "$input" | tr ' ' '\n' | grep -v '^$'
}

# Convert newline-separated to space-separated (for command execution)
pkg_list_to_command_args() {
    local input="$1"
    echo "$input" | tr '\n' ' ' | tr -s ' ' | sed 's/^ //;s/ $//'
}

# Remove empty lines and duplicates
pkg_list_clean() {
    local input="$1"
    echo "$input" | grep -v '^$' | sort -u
}

# Merge multiple package lists (newline-separated)
pkg_list_merge() {
    local result=""
    for list in "$@"; do
        [ -z "$list" ] && continue
        result="${result}${list}
"
    done
    echo "$result" | grep -v '^$'
}

# Filter out packages by pattern
pkg_list_filter_out() {
    local pattern="$1"
    grep -v "$pattern"
}

# =============================================================================
# Package Availability Check
# =============================================================================
# Checks if a package is available in the package manager's repository
# Uses cache to avoid repeated checks
# Args:
#   $1 - package id (not name!)
#   $2 - caller ("normal" or "custom_feeds")
# Returns:
#   0 if package is available, 1 otherwise
# =============================================================================
# キャッシュ構築プロセス(PID)が生きていれば完了を待つ
wait_for_package_cache() {
    if [ -n "$CACHE_PKG_PID" ] && kill -0 "$CACHE_PKG_PID" 2>/dev/null; then
        echo "[DEBUG] Waiting for package cache (PID: $CACHE_PKG_PID)..." >> "$CONFIG_DIR/debug.log"
        wait "$CACHE_PKG_PID"
        unset CACHE_PKG_PID
    fi
}

check_package_available() {
    local pkg_id="$1"
    local caller="${2:-normal}"

    wait_for_package_cache

    # custom_feeds は常に利用可能
    if [ "$caller" = "custom_feeds" ]; then
        return 0
    fi

    # キャッシュから virtual フラグを取得
    local virtual_flag="false"
    if [ "$_PACKAGE_NAME_LOADED" -eq 1 ]; then
        virtual_flag=$(echo "$_PACKAGE_NAME_CACHE" | awk -F= -v id="$pkg_id" '($1 == id || $3 == id) {print $8; exit}')
        [ -z "$virtual_flag" ] && virtual_flag="false"
    fi
    
    # virtualパッケージは常に利用可能
    if [ "$virtual_flag" = "true" ]; then
        debug_log "Package $pkg_id is virtual, skipping availability check"
        return 0
    fi

    # uniqueIdがあれば実際のIDに変換
    local real_id="$pkg_id"
    if [ "$_PACKAGE_NAME_LOADED" -eq 1 ]; then
        local cached_real_id
        cached_real_id=$(echo "$_PACKAGE_NAME_CACHE" | awk -F= -v uid="$pkg_id" '$3 == uid {print $1; exit}')
        [ -n "$cached_real_id" ] && real_id="$cached_real_id"
    fi

    # availability cacheをメモリにロード（初回のみ）
    if [ "$_PACKAGE_AVAILABILITY_LOADED" -eq 0 ]; then
        local cache_file="$CONFIG_DIR/pkg_availability_cache.txt"
        
        if [ -f "$cache_file" ]; then
            _PACKAGE_AVAILABILITY_CACHE=$(cat "$cache_file")
            _PACKAGE_AVAILABILITY_LOADED=1
            debug_log "Package availability cache loaded to memory ($(echo "$_PACKAGE_AVAILABILITY_CACHE" | wc -l) packages)"
        else
            _PACKAGE_AVAILABILITY_LOADED=1
            debug_log "Availability cache not found, allowing all packages"
            return 0
        fi
    fi

    # メモリ内で検索（ディスクI/O不要）
    if echo "$_PACKAGE_AVAILABILITY_CACHE" | grep -qx "$real_id"; then
        debug_log "Package $real_id found in availability cache"
        return 0
    fi

    debug_log "Package $real_id NOT found in availability cache"
    return 1
}

get_kmods_directory() {
    local version="$1"
    local vendor="$2"
    local subtarget="$3"
    local kernel_version="$4"
    
    local index_url
    index_url=$(expand_template "$PKG_KMODS_INDEX_BASE_URL" \
        "version" "$version" \
        "vendor" "$vendor" \
        "subtarget" "$subtarget")
    
    debug_log "Fetching kmods index from: $index_url"
    
    local kmod_dir
    kmod_dir=$(wget_fallback "$index_url" "-" 10 | \
        grep -o 'href="[^/"]\+/"' | \
        sed 's/href="//;s/\/"$//' | \
        grep -v '^\s*$' | \
        grep -v '^#' | \
        grep -v '^?' | \
        grep -v '^\.' | \
        grep '^[a-zA-Z0-9._-]\+$' | \
        sort -V | \
        tail -1)
    
    if [ -n "$kmod_dir" ]; then
        debug_log "Found kmod directory: $kmod_dir"
        echo "$kmod_dir"
        return 0
    fi
    
    debug_log "No kmod directory found"
    return 1
}

cache_package_availability() {
    debug_log "Building package availability cache..."
    debug_log "OPENWRT_VERSION=$OPENWRT_VERSION, DEVICE_ARCH=$DEVICE_ARCH"
    
    local version="$OPENWRT_VERSION"
    local arch="$DEVICE_ARCH"
    local vendor="$DEVICE_VENDOR"
    local subtarget="$DEVICE_SUBTARGET"
    
    if [ -z "$version" ] || [ -z "$arch" ]; then
        debug_log "Missing version or arch"
        return 1
    fi
    
    local cache_file="$CONFIG_DIR/pkg_availability_cache.txt"
    : > "$cache_file"
    
    # JSONから取得したフィードリスト
    local feeds="$PKG_FEEDS"
    
    # targets追加
    [ "$PKG_INCLUDE_TARGETS" = "true" ] && feeds="$feeds targets"
    
    # kmods追加
    local kmod_dir
    if [ "$PKG_INCLUDE_KMODS" = "true" ]; then
        local kernel_version=$(uname -r)
        kmod_dir=$(get_kmods_directory "$version" "$vendor" "$subtarget" "$kernel_version")
        [ -n "$kmod_dir" ] && feeds="$feeds kmods"
    fi
    
    if [ -z "$feeds" ]; then
        debug_log "No feeds to process"
        return 0
    fi
    
    local pids=""
    local job_count=0
    
    for feed in $feeds; do
        # ジョブ数制限
        while [ "$job_count" -ge "$MAX_JOBS" ]; do
            wait -n
            job_count=$((job_count - 1))
        done
        
        # cache_package_availability 内の wget を修正

        (
            local url temp_file
            temp_file="$CONFIG_DIR/cache_${feed}.txt"
            
            # URL構築
            if [ "$feed" = "targets" ]; then
                url=$(expand_template "$PKG_TARGETS_INDEX_URL" \
                    "version" "$version" \
                    "vendor" "$vendor" \
                    "subtarget" "$subtarget")
            elif [ "$feed" = "kmods" ]; then
                url=$(expand_template "$PKG_KMODS_INDEX_URL" \
                    "version" "$version" \
                    "vendor" "$vendor" \
                    "subtarget" "$subtarget" \
                    "kmod" "$kmod_dir")
            else
                url=$(expand_template "$PKG_PACKAGE_INDEX_URL" \
                    "version" "$version" \
                    "arch" "$arch" \
                    "feed" "$feed")
            fi
            
            debug_log "Fetching $feed from $url"
            
            local temp_response="$CONFIG_DIR/feed_${feed}_response.txt"
            
            if ! wget_fallback "$url" "$temp_response" 10; then
                debug_log "$feed: download failed"
                rm -f "$temp_response"
                exit 1
            fi
            
            [ ! -s "$temp_response" ] && {
                rm -f "$temp_response"
                exit 1
            }
            
            # パッケージ名抽出
            if echo "$url" | grep -q 'index.json$'; then
                # APK
                grep -o '"[^"]*":' "$temp_response" | grep -v -E '(version|architecture|packages)' | tr -d '":' > "$temp_file"
            else
                # OPKG
                awk '/^Package: / {print $2}' "$temp_response" > "$temp_file"
            fi
            
            rm -f "$temp_response"
            
            local count=$(wc -l < "$temp_file" 2>/dev/null || echo 0)
            debug_log "$feed: fetched $count packages"
        ) &
        pids="$pids $!"
        job_count=$((job_count + 1))
    done
    
    # 残りのジョブを待機
    wait
    
    # マージ
    for feed in $feeds; do
        local temp_file="$CONFIG_DIR/cache_${feed}.txt"
        [ -f "$temp_file" ] && cat "$temp_file" >> "$cache_file"
        rm -f "$temp_file"
    done
    
    sort -u "$cache_file" -o "$cache_file"
    
    local count=$(wc -l < "$cache_file" 2>/dev/null || echo 0)
    debug_log "Cache built: $count packages total"
    
    return 0
}

# ========================================
# 言語パッケージキャッシュ生成
# ========================================
cache_available_languages() {
    local cache_file="$CONFIG_DIR/available_languages.cache"
    local pkg_cache="$CONFIG_DIR/pkg_availability_cache.txt"
    
    if [ ! -f "$pkg_cache" ]; then
        debug_log "Package cache not found, cannot extract languages"
        return 1
    fi
    
    # luci-i18n-base-* から言語コードを抽出
    grep "^luci-i18n-base-" "$pkg_cache" | \
        sed 's/^luci-i18n-base-//' | \
        sort -u > "$cache_file"
    
    local count=$(wc -l < "$cache_file" 2>/dev/null || echo 0)
    debug_log "Available languages cached: $count"
}

# ========================================
# 言語パック選択UI
# ========================================

package_compatible() {
    local pkg_id="$1"
    
    # 初回のみキャッシュ構築
    if [ "$_PACKAGE_COMPAT_LOADED" -eq 0 ]; then
        _PACKAGE_COMPAT_CACHE=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e '@.categories[*].packages[*]' 2>/dev/null | \
            awk -F'"' '
            {
                id=""; pms="";
                for(i=1;i<=NF;i++){
                    if($i=="id") id=$(i+2);
                    if($i=="packageManager") {
                        # packageManager配列を収集
                        for(j=i;j<=NF;j++){
                            if($j ~ /opkg|apk/) pms=pms$(j)" ";
                            if($j=="]") break;
                        }
                    }
                }
                if(id && pms) print id"="pms;
            }')
        _PACKAGE_COMPAT_LOADED=1
    fi
    
    # キャッシュから検索
    local pkg_managers
    pkg_managers=$(echo "$_PACKAGE_COMPAT_CACHE" | grep "^${pkg_id}=" | cut -d= -f2)
    
    [ -z "$pkg_managers" ] && return 0
    
    echo "$pkg_managers" | grep -q "${PKG_MGR}" && return 0
    
    return 1
}

# Setup JSON Accessors

get_setup_item_property() {
    local item_id="$1"
    local property="$2"
    local result
    
    result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].${property}" 2>/dev/null | head -1)
    
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].${property}" 2>/dev/null | head -1)
    fi
    
    echo "$result"
}

get_setup_categories() {
    if [ "$_SETUP_CATEGORIES_LOADED" -eq 0 ]; then
        local all_cats gui_only
        all_cats=$(jsonfilter -i "$SETUP_JSON" -e '@.categories[*].id' 2>/dev/null | grep -v '^$')
        _SETUP_CATEGORIES_CACHE=""
        for cat_id in $all_cats; do
            gui_only=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].guiOnly" 2>/dev/null | head -1 | tr -d ' \n\r')
            echo "[DEBUG] cat_id='$cat_id' gui_only='$gui_only'" >> "$CONFIG_DIR/debug.log"
            
            if [ "$gui_only" = "true" ]; then
                echo "[DEBUG] Skipping $cat_id (guiOnly)" >> "$CONFIG_DIR/debug.log"
                continue
            fi
            
            echo "[DEBUG] Adding $cat_id to cache" >> "$CONFIG_DIR/debug.log"
            
            _SETUP_CATEGORIES_CACHE="${_SETUP_CATEGORIES_CACHE}${cat_id}
"
        done
        _SETUP_CATEGORIES_LOADED=1
        echo "[DEBUG] Categories cache built: $_SETUP_CATEGORIES_CACHE" >> "$CONFIG_DIR/debug.log"
    fi
    echo "$_SETUP_CATEGORIES_CACHE"
}

get_setup_category_title() {
    local title class
    title=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$1'].title" 2>/dev/null | head -1)
    class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$1'].class" 2>/dev/null | head -1)
    
    if [ -n "$class" ] && [ "${class#tr-}" != "$class" ]; then
        translate "$class"
    else
        echo "$title"
    fi
}

get_setup_category_items() {
    jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$1'].items[*].id" 2>/dev/null | grep -v '^$'
}

get_setup_item_type() {
    get_setup_item_property "$1" "type"
}

get_setup_item_label() {
    local item_id="$1"
    local label class
    
    label=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].label" 2>/dev/null | head -1)
    class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].class" 2>/dev/null | head -1)
    
    if [ -z "$label" ]; then
        label=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].title" 2>/dev/null | head -1)
        [ -z "$class" ] && class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].class" 2>/dev/null | head -1)
    fi
    
    if [ -z "$label" ]; then
        label=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].label" 2>/dev/null | head -1)
        [ -z "$class" ] && class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].class" 2>/dev/null | head -1)
    fi
    
    if [ -n "$class" ] && [ "${class#tr-}" != "$class" ]; then
        translate "$class"
    else
        echo "$label"
    fi
}

get_setup_item_variable() {
    get_setup_item_property "$1" "variable"
}

get_setup_item_default() {
    get_setup_item_property "$1" "default"
}

get_setup_item_api_source() {
    local item_id="$1"
    local result
    
    result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].apiSource" 2>/dev/null | head -1)
    
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].apiSource" 2>/dev/null | head -1)
    fi
    
    echo "$result"
}

get_api_value() {
    local api_source="$1"
    [ -z "$api_source" ] && return 1
    jsonfilter -i "$AUTO_CONFIG_JSON" -e "@.${api_source}" 2>/dev/null | head -1
}

get_setup_item_field_type() {
    local item_id="$1"
    local result
    
    result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].fieldType" 2>/dev/null | head -1)
    
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].fieldType" 2>/dev/null | head -1)
    fi
    
    echo "$result"
}

get_setup_item_options() {
    local item_id="$1"
    local result
    
    result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].options[*].value" 2>/dev/null)
    
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].options[*].value" 2>/dev/null)
    fi
    
    echo "$result" | awk 'NF{print} !NF{print "___EMPTY___"}'
}

get_setup_item_option_label() {
    local item_id="$1"
    local value="$2"
    local label class
    
    label=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].options[@.value='$value'].label" 2>/dev/null | head -1)
    class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].options[@.value='$value'].class" 2>/dev/null | head -1)
    
    if [ -z "$label" ]; then
        label=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].options[@.value='$value'].label" 2>/dev/null | head -1)
        class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].options[@.value='$value'].class" 2>/dev/null | head -1)
    fi
    
    if [ -n "$class" ] && [ "${class#tr-}" != "$class" ]; then
        translate "$class"
    else
        echo "$label"
    fi
}

# Package JSON Accessors

get_categories() {
    local cache_file="$CONFIG_DIR/categories_cache.txt"
    
    if [ ! -f "$cache_file" ]; then
        jsonfilter -i "$PACKAGES_JSON" -e '@.categories[*].id' 2>/dev/null | grep -v '^$' > "$cache_file"
        debug_log "Categories cache built"
    fi
    
    cat "$cache_file"
}

get_category_name() {
    local cat_id="$1"
    local name class
    
    name=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id'].name" 2>/dev/null | head -1)
    class=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id'].class" 2>/dev/null | head -1)
    
    if [ -z "$name" ]; then
        name=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$cat_id'].name" 2>/dev/null | head -1)
        class=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$cat_id'].class" 2>/dev/null | head -1)
    fi
    
    if [ -n "$class" ] && [ "${class#tr-}" != "$class" ]; then
        translate "$class"
    else
        printf '%s\n' "$name"
    fi
}

get_category_desc() {
    local cat_id="$1"
    local desc
    
    desc=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id'].description" 2>/dev/null | head -1)
    [ -z "$desc" ] && desc=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$cat_id'].description" 2>/dev/null | head -1)
    echo "$desc"
}

get_category_hidden() {
    local cat_id="$1"
    jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id']" 2>/dev/null | head -1 | grep -q . && echo "false" && return
    local hidden
    hidden=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$cat_id'].hidden" 2>/dev/null | head -1)
    echo "$hidden"
}

get_category_packages() {
    local cat_id="$1"
    local cache_file="$CONFIG_DIR/category_packages_cache.txt"
    
    # 初回のみキャッシュ構築（ファイル存在チェック）
    if [ ! -f "$cache_file" ]; then
        debug_log "Building category packages cache..."
        
        : > "$cache_file"
        
        # 全カテゴリ分をキャッシュに格納（通常 + カスタムフィード）
        local all_cats
        all_cats="$(get_categories)
$(get_customfeed_categories)"
        
        while read -r cat; do
            [ -z "$cat" ] && continue
            
            local packages
            packages=$(
                {
                    if [ -f "$CUSTOMFEEDS_JSON" ]; then
                        jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat'].packages[*]" 2>/dev/null | \
                        awk -F'"' '{
                            id=""; uid="";
                            for(i=1;i<=NF;i++){
                                if($i=="id") id=$(i+2);
                                if($i=="uniqueId") uid=$(i+2);
                            }
                            if(uid) print uid; else if(id) print id;
                        }'
                    fi
                    
                    jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$cat'].packages[*]" 2>/dev/null | \
                    awk -F'"' '{
                        id=""; uid="";
                        for(i=1;i<=NF;i++){
                            if($i=="id") id=$(i+2);
                            if($i=="uniqueId") uid=$(i+2);
                        }
                        if(uid) print uid; else if(id) print id;
                    }'
                } | grep -v '^$' | awk '!seen[$0]++'
            )
            
            # カテゴリ|パッケージ形式でキャッシュに追加
            while read -r pkg; do
                [ -z "$pkg" ] && continue
                echo "${cat}|${pkg}" >> "$cache_file"
            done <<EOF
$packages
EOF
        done <<EOF2
$all_cats
EOF2
        
        debug_log "Category packages cache built: $(wc -l < "$cache_file") entries"
    fi
    
    # キャッシュから取得
    awk -F'|' -v cat="$cat_id" '$1 == cat {print $2}' "$cache_file"
}

get_package_checked() {
    local pkg_id="$1"
    
    if [ "$_PACKAGE_NAME_LOADED" -eq 0 ]; then
        get_package_name "dummy" >/dev/null 2>&1
    fi
    
    # キャッシュから取得（フィールド10 = checked）
    echo "$_PACKAGE_NAME_CACHE" | awk -F'=' -v pkg="$pkg_id" '
        $1 == pkg || $3 == pkg { print $10; exit }
    '
}

get_language_module_patterns() {
    if [ "$_LANGUAGE_MODULE_PATTERNS_LOADED" -eq 0 ]; then
        _LANGUAGE_MODULE_PATTERNS=$(jsonfilter -i "$SETUP_JSON" -e '@.constants.language_module_patterns[*]' 2>/dev/null)
        _LANGUAGE_MODULE_PATTERNS_LOADED=1
        echo "[DEBUG] Loaded language_module_patterns: $_LANGUAGE_MODULE_PATTERNS" >> "$CONFIG_DIR/debug.log"
    fi
    echo "$_LANGUAGE_MODULE_PATTERNS"
}

get_language_exclude_patterns() {
    if [ "$_LANGUAGE_EXCLUDE_PATTERNS_LOADED" -eq 0 ]; then
        _LANGUAGE_EXCLUDE_PATTERNS=$(jsonfilter -i "$SETUP_JSON" -e '@.constants.language_exclude_patterns[*]' 2>/dev/null)
        _LANGUAGE_EXCLUDE_PATTERNS_LOADED=1
        echo "[DEBUG] Loaded language_exclude_patterns: $_LANGUAGE_EXCLUDE_PATTERNS" >> "$CONFIG_DIR/debug.log"
    fi
    echo "$_LANGUAGE_EXCLUDE_PATTERNS"
}

get_language_prefixes() {
    if [ "$_LANGUAGE_PREFIXES_LOADED" -eq 0 ]; then
        _LANGUAGE_PREFIXES=$(jsonfilter -i "$SETUP_JSON" -e '@.constants.language_prefixes[*]' 2>/dev/null)
        _LANGUAGE_PREFIXES_LOADED=1
        echo "[DEBUG] Loaded language_prefixes: $_LANGUAGE_PREFIXES" >> "$CONFIG_DIR/debug.log"
    fi
    echo "$_LANGUAGE_PREFIXES"
}

get_package_name() {
    local pkg_id="$1"
    
    if [ "$_PACKAGE_NAME_LOADED" -eq 0 ]; then
        echo "[DEBUG] Building package name cache with extended fields..." >> "$CONFIG_DIR/debug.log"
        
        # カスタムフィードを先に読み込む
        if [ -f "$CUSTOMFEEDS_JSON" ]; then
            _PACKAGE_NAME_CACHE=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e '@.categories[*].packages[*]' 2>/dev/null | \
                awk -F'"' '
                BEGIN { in_deps=0 }
                {
                    id=""; name=""; uniqueId=""; installOptions=""; enableVar=""; deps="";
                    hidden="false"; virtual="false"; reboot="false"; checked="false";
                    isCustom="0";
                    
                    for(i=1;i<=NF;i++){
                        if($i=="id")id=$(i+2);
                        if($i=="name")name=$(i+2);
                        if($i=="uniqueId")uniqueId=$(i+2);
                        if($i=="installOptions")installOptions=$(i+2);
                        if($i=="enableVar")enableVar=$(i+2);
                        if($i=="hidden" && $(i+2)=="true")hidden="true";
                        if($i=="virtual" && $(i+2)=="true")virtual="true";
                        if($i=="reboot" && $(i+2)=="true")reboot="true";
                        if($i=="checked" && $(i+2)=="true")checked="true";
                        if($i=="isCustomFeed" && $(i+2)=="true") isCustom="1";
                        if($i=="dependencies") {
                            in_deps=1;
                            for(j=i+2;j<=NF;j++){
                                if($j=="]") { in_deps=0; break; }
                                if($j ~ /^[a-z0-9_-]+$/ && $j!="hidden" && $j!="checked" && $j!="reboot" && $j!="virtual")
                                    deps=deps$j",";
                            }
                            sub(/,$/, "", deps);
                        }
                    }
                    if(id&&name){
                        print id "=" name "=" uniqueId "=" installOptions "=" enableVar "=" deps "=" hidden "=" virtual "=" reboot "=" checked "=" "" "=" isCustom
                    }
                }')
        else
            _PACKAGE_NAME_CACHE=""
        fi
        
        # 通常パッケージを後から追加（重複チェック付き）
        local normal_cache
        normal_cache=$(jsonfilter -i "$PACKAGES_JSON" -e '@.categories[*].packages[*]' 2>/dev/null | \
            awk -F'"' '
            BEGIN { in_deps=0 }
            {
                id=""; name=""; uniqueId=""; installOptions=""; enableVar=""; deps="";
                hidden="false"; virtual="false"; reboot="false"; checked="false";
                
                for(i=1;i<=NF;i++){
                    if($i=="id")id=$(i+2);
                    if($i=="name")name=$(i+2);
                    if($i=="uniqueId")uniqueId=$(i+2);
                    if($i=="installOptions")installOptions=$(i+2);
                    if($i=="enableVar")enableVar=$(i+2);
                    if($i=="hidden" && $(i+2)=="true")hidden="true";
                    if($i=="virtual" && $(i+2)=="true")virtual="true";
                    if($i=="reboot" && $(i+2)=="true")reboot="true";
                    if($i=="checked" && $(i+2)=="true")checked="true";
                    if($i=="dependencies") {
                        in_deps=1;
                        for(j=i+2;j<=NF;j++){
                            if($j=="]") { in_deps=0; break; }
                            if($j ~ /^[a-z0-9_-]+$/ && $j!="hidden" && $j!="checked" && $j!="reboot" && $j!="virtual") 
                                deps=deps$j",";
                        }
                        sub(/,$/, "", deps);
                    }
                }
                if(id&&name){
                    print id "=" name "=" uniqueId "=" installOptions "=" enableVar "=" deps "=" hidden "=" virtual "=" reboot "=" checked "=" "" "=" "0"
                }
            }')
        
        # 重複チェックしてマージ
        if [ -n "$normal_cache" ]; then
            while read -r normal_line; do
                [ -z "$normal_line" ] && continue
                
                local normal_id
                normal_id=$(echo "$normal_line" | cut -d= -f1)
                
                # カスタムフィードキャッシュに既に存在するかチェック
                if ! echo "$_PACKAGE_NAME_CACHE" | grep -q "^${normal_id}="; then
                    _PACKAGE_NAME_CACHE="${_PACKAGE_NAME_CACHE}
${normal_line}"
                fi
            done <<EOF
$normal_cache
EOF
        fi
        
        _PACKAGE_NAME_LOADED=1
        
        echo "[DEBUG] Cache built with $(echo "$_PACKAGE_NAME_CACHE" | wc -l) entries" >> "$CONFIG_DIR/debug.log"
        echo "[DEBUG] Sample cache entries:" >> "$CONFIG_DIR/debug.log"
        echo "$_PACKAGE_NAME_CACHE" | grep "luci-theme-argon" >> "$CONFIG_DIR/debug.log"
    fi
    
    echo "$_PACKAGE_NAME_CACHE" | awk -F'=' -v pkg="$pkg_id" '
        $1 == pkg || $3 == pkg {
            print $2
            exit
        }
    '
}

get_package_enablevar() {
    local pkg_id="$1"
    local unique_id="$2"
    local enable_var
    
    # _PACKAGE_NAME_CACHE から検索（フォーマット: id=name=uniqueId=installOptions=enableVar）
    if [ -n "$unique_id" ]; then
        # uniqueId がある場合: id と uniqueId が一致する行のフィールド5（enableVar）を取得
        enable_var=$(echo "$_PACKAGE_NAME_CACHE" | awk -F'=' -v pkg="$pkg_id" -v uid="$unique_id" '
            $1 == pkg && $3 == uid { print $5; exit }
        ')
    else
        # uniqueId がない場合: id が一致し、フィールド3が空の行のフィールド5を取得
        enable_var=$(echo "$_PACKAGE_NAME_CACHE" | awk -F'=' -v pkg="$pkg_id" '
            $1 == pkg && $3 == "" { print $5; exit }
        ')
    fi
    
    echo "$enable_var"
}

cache_installed_packages() {
    [ "$_INSTALLED_PACKAGES_LOADED" -eq 1 ] && return 0
    
    echo "[DEBUG] Building installed packages cache..." >> "$CONFIG_DIR/debug.log"
    
    local cache_file="$CONFIG_DIR/installed_packages_cache.txt"
    
    if [ "$PKG_MGR" = "opkg" ]; then
        opkg list-installed | awk '{print $1}' > "$cache_file"
    elif [ "$PKG_MGR" = "apk" ]; then
        apk info 2>/dev/null > "$cache_file"
    fi
    
    local count=$(wc -l < "$cache_file" 2>/dev/null || echo 0)
    echo "[DEBUG] Installed packages cache built: $count packages" >> "$CONFIG_DIR/debug.log"
}

is_package_installed() {
    local pkg_id="$1"
    
    # 初回のみメモリにロード
    if [ "$_INSTALLED_PACKAGES_LOADED" -eq 0 ]; then
        local cache_file="$CONFIG_DIR/installed_packages_cache.txt"
        
        if [ -f "$cache_file" ]; then
            _INSTALLED_PACKAGES_CACHE=$(cat "$cache_file")
            _INSTALLED_PACKAGES_LOADED=1
            echo "[DEBUG] Loaded installed packages cache to memory" >> "$CONFIG_DIR/debug.log"
        else
            echo "[DEBUG] Installed packages cache file not found" >> "$CONFIG_DIR/debug.log"
            return 1
        fi
    fi
    
    echo "$_INSTALLED_PACKAGES_CACHE" | grep -qx "$pkg_id"
}

initialize_installed_packages() {
    echo "[DEBUG] Initializing from installed packages..." >> "$CONFIG_DIR/debug.log"
    
    if [ "$_PACKAGE_NAME_LOADED" -eq 0 ]; then
        get_package_name "dummy" >/dev/null 2>&1
    fi
    
    [ "$_INSTALLED_PACKAGES_LOADED" -eq 0 ] && cache_installed_packages
    
    local count=0
    
    # 通常パッケージ
    while read -r cache_line; do
        [ -z "$cache_line" ] && continue
        
        local pkg_id uid is_custom
        pkg_id=$(echo "$cache_line" | cut -d= -f1)
        uid=$(echo "$cache_line" | cut -d= -f3)
        is_custom=$(echo "$cache_line" | cut -d= -f12)

        if is_package_installed "$pkg_id"; then
            local already_selected=0
            local target_file
            
            # is_custom フラグで振り分け
            if [ "$is_custom" = "1" ]; then
                target_file="$SELECTED_CUSTOM_PACKAGES"
            else
                target_file="$SELECTED_PACKAGES"
            fi
            
            if [ -n "$uid" ]; then
                if grep -q "=${uid}=" "$target_file" 2>/dev/null || \
                   grep -q "=${uid}\$" "$target_file" 2>/dev/null; then
                    already_selected=1
                fi
            else
                if grep -q "^${pkg_id}=" "$target_file" 2>/dev/null; then
                    already_selected=1
                fi
            fi
            
            if [ "$already_selected" -eq 0 ]; then
                local base_fields
                base_fields=$(echo "$cache_line" | cut -d= -f1-10)
                echo "${base_fields}=system=${is_custom}" >> "$target_file"
                count=$((count + 1))
                
                if [ "$is_custom" = "1" ]; then
                    echo "[INIT] Found installed custom: $pkg_id (owner=system)" >> "$CONFIG_DIR/debug.log"
                else
                    echo "[INIT] Found installed: $pkg_id (owner=system)" >> "$CONFIG_DIR/debug.log"
                fi
            fi
        fi
    done <<EOF
$_PACKAGE_NAME_CACHE
EOF
    
    # ★ 言語パッケージも追加
    while read -r installed_pkg; do
        [ -z "$installed_pkg" ] && continue
        
        case "$installed_pkg" in
            luci-i18n-*)
                if ! grep -q "^${installed_pkg}=" "$SELECTED_PACKAGES" 2>/dev/null; then
                    echo "${installed_pkg}=${installed_pkg}=====false=false=false=false=system=0" >> "$SELECTED_PACKAGES"
                    count=$((count + 1))
                    echo "[INIT] Found installed language: $installed_pkg (owner=system)" >> "$CONFIG_DIR/debug.log"
                fi
                ;;
        esac
    done <<EOF
$_INSTALLED_PACKAGES_CACHE
EOF
    
    # カスタムフィード（パターンマッチング方式）
    if [ -f "$CUSTOMFEEDS_JSON" ]; then
        for cat_id in $(get_customfeed_categories); do
            for pkg_id in $(get_category_packages "$cat_id"); do
                local pattern exclude installed_pkgs
                pattern=$(get_customfeed_package_pattern "$pkg_id")
                exclude=$(get_customfeed_package_exclude "$pkg_id")
                
                [ -z "$pattern" ] && continue
                
                installed_pkgs=$(is_customfeed_installed "$pattern" "$exclude")
                
                [ -z "$installed_pkgs" ] && continue
                
                if ! grep -q "^${pkg_id}=" "$SELECTED_CUSTOM_PACKAGES" 2>/dev/null; then
                    echo "${pkg_id}=${pkg_id}=====false=false=false=false=system=1" >> "$SELECTED_CUSTOM_PACKAGES"
                    count=$((count + 1))
                    echo "[INIT] Found installed custom: $pkg_id (owner=system)" >> "$CONFIG_DIR/debug.log"
                fi
            done
        done
    fi
    
    echo "[DEBUG] Initialized from $count installed packages" >> "$CONFIG_DIR/debug.log"
}

is_package_selected() {
    local identifier="$1"
    local caller="${2:-normal}"
    
    if [ "$caller" = "custom_feeds" ]; then
        if [ "$_SELECTED_CUSTOM_CACHE_LOADED" -eq 0 ]; then
            _SELECTED_CUSTOM_CACHE=$(cat "$SELECTED_CUSTOM_PACKAGES" 2>/dev/null || true)
            _SELECTED_CUSTOM_CACHE_LOADED=1
        fi
        # ★ 修正：id または uniqueId でマッチング（awk使用）
        echo "$_SELECTED_CUSTOM_CACHE" | awk -F= -v target="$identifier" '
            ($1 == target && $3 == "") || $3 == target
        ' | grep -q .
    else
        if [ "$_SELECTED_PACKAGES_CACHE_LOADED" -eq 0 ]; then
            _SELECTED_PACKAGES_CACHE=$(cat "$SELECTED_PACKAGES" 2>/dev/null || true)
            _SELECTED_PACKAGES_CACHE_LOADED=1
        fi
        # ★ 修正：id または uniqueId でマッチング（awk使用）
        echo "$_SELECTED_PACKAGES_CACHE" | awk -F= -v target="$identifier" '
            ($1 == target && $3 == "") || $3 == target
        ' | grep -q .
    fi
}

# =============================================================================
# Get dependencies for a package (from cache)
# =============================================================================
get_package_dependencies() {
    local pkg_id="$1"
    local caller="${2:-normal}"
    
    # キャッシュがロードされていなければロード
    if [ "$_PACKAGE_NAME_LOADED" -eq 0 ]; then
        get_package_name "dummy" >/dev/null 2>&1
    fi
    
    # キャッシュから依存関係を取得（フィールド6）
    local deps=$(echo "$_PACKAGE_NAME_CACHE" | awk -F'=' -v pkg="$pkg_id" '$1 == pkg {print $6; exit}')
    
    # カンマ区切りを改行に変換
    echo "$deps" | tr ',' '\n' | grep -v '^$'
}

# Check if a dependency is required by other selected packages
is_dependency_required_by_others() {
    local dep_id="$1"
    local excluding_pkg_id="$2"
    local caller="${3:-normal}"
    local target_file
    
    if [ "$caller" = "custom_feeds" ]; then
        target_file="$SELECTED_CUSTOM_PACKAGES"
    else
        target_file="$SELECTED_PACKAGES"
    fi
    
    # 選択済みパッケージファイルから直接読み込む（高速化）
    while read -r selected_line; do
        [ -z "$selected_line" ] && continue
        
        local current_pkg_id
        current_pkg_id=$(echo "$selected_line" | cut -d= -f1)
        
        # Skip the package we're excluding
        [ "$current_pkg_id" = "$excluding_pkg_id" ] && continue
        
        # キャッシュから依存関係を取得（フィールド6）
        local deps
        deps=$(echo "$_PACKAGE_NAME_CACHE" | awk -F'=' -v id="$current_pkg_id" '$1 == id {print $6; exit}')
        
        # カンマ区切りの中から dep_id を検索
        echo "$deps" | tr ',' '\n' | grep -qx "$dep_id" && return 0
    done < "$target_file"
    
    return 1
}

# Add package and its dependencies
add_package_with_dependencies() {
    local pkg_id="$1"
    local caller="${2:-normal}"
    local target_file
    
    if [ "$caller" = "custom_feeds" ]; then
        target_file="$SELECTED_CUSTOM_PACKAGES"
    else
        target_file="$SELECTED_PACKAGES"
    fi
    
    # ファイル内容を1回だけ読み込む
    local existing_vars
    existing_vars=$(cat "$SETUP_VARS" 2>/dev/null || true)
    
    # Add main package
    local cache_line
    cache_line=$(echo "$_PACKAGE_NAME_CACHE" | awk -F= -v id="$pkg_id" '$3 == id {print; exit}')
    [ -z "$cache_line" ] && cache_line=$(echo "$_PACKAGE_NAME_CACHE" | awk -F= -v id="$pkg_id" '$1 == id && $3 == "" {print; exit}')
    
    if [ -n "$cache_line" ]; then
        local cached_id cached_uid
        cached_id=$(echo "$cache_line" | cut -d= -f1)
        cached_uid=$(echo "$cache_line" | cut -d= -f3)
        
        # ヘルパー関数で存在チェック
        local check_id
        [ -n "$cached_uid" ] && check_id="$cached_uid" || check_id="$cached_id"
        
        if ! pkg_exists "$cached_id" "" "$caller"; then
            # owner=user として追加
            local line_with_owner="${cache_line%=*}=user"
            echo "$line_with_owner" >> "$target_file"
            debug_log "pkg_add (manual): $cached_id (owner=user)"
            
            # Handle enableVar
            local enable_var
            enable_var=$(echo "$cache_line" | cut -d= -f5)
            
            if [ -n "$enable_var" ] && ! echo "$existing_vars" | grep -q "^${enable_var}="; then
                echo "${enable_var}='1'" >> "$SETUP_VARS"
            fi
            
            # LuCIパッケージの場合のみ言語パック追加
            if [ "$caller" != "custom_feeds" ]; then
                # luci-i18n- は除外
                case "$cached_id" in
                    luci-i18n-*) ;;
                    *)
                        local patterns module_name=""
                        patterns=$(get_language_module_patterns)
                        
                        # パターンマッチでモジュール名を抽出
                        for pattern in $patterns; do
                            case "$cached_id" in
                                ${pattern}*)
                                    module_name="${cached_id#$pattern}"
                                    break
                                    ;;
                            esac
                        done
                        
                        if [ -n "$module_name" ]; then
                            # ベース言語パック検出
                            local installed_lang
                            installed_lang=$(grep "^luci-i18n-base-" "$CONFIG_DIR/installed_packages_cache.txt" 2>/dev/null | sed 's/^luci-i18n-base-//' | head -1)
                            
                            if [ -n "$installed_lang" ]; then
                                local lang_pkg="luci-i18n-${module_name}-${installed_lang}"
                                
                                if ! pkg_exists "$lang_pkg" "" "$caller"; then
                                    echo "${lang_pkg}=${lang_pkg}===" >> "$target_file"
                                    debug_log "[LANG] Added language package: $lang_pkg for $cached_id"
                                fi
                            fi
                        fi
                        ;;
                esac
            fi
        fi
        
        # Add dependencies
        local deps
        deps=$(echo "$cache_line" | cut -d= -f6)
        
        while read -r dep_id; do
            [ -z "$dep_id" ] && continue
            
            # Find dependency in cache (by id or uniqueId)
            local dep_cache_line
            dep_cache_line=$(echo "$_PACKAGE_NAME_CACHE" | awk -F= -v dep="$dep_id" '$1 == dep || $3 == dep {print; exit}')
            
            if [ -n "$dep_cache_line" ]; then
                local dep_real_id dep_uid
                dep_real_id=$(echo "$dep_cache_line" | cut -d= -f1)
                dep_uid=$(echo "$dep_cache_line" | cut -d= -f3)
                
                # ヘルパー関数で存在チェック
                if ! pkg_exists "$dep_real_id" "" "$caller"; then
                    # 依存パッケージも owner=user として追加
                    local dep_line_with_owner="${dep_cache_line%=*}=user"
                    echo "$dep_line_with_owner" >> "$target_file"
                    debug_log "[DEP] Auto-added dependency: $dep_real_id (required by $pkg_id, owner=user)"
                    
                    # Handle enableVar for dependency
                    local dep_enable_var
                    dep_enable_var=$(echo "$dep_cache_line" | cut -d= -f5)
                    
                    # メモリ内で重複チェック
                    if [ -n "$dep_enable_var" ] && ! echo "$existing_vars" | grep -q "^${dep_enable_var}="; then
                        echo "${dep_enable_var}='1'" >> "$SETUP_VARS"
                    fi
                fi
            fi
        done <<DEPS
$(echo "$deps" | tr ',' '\n')
DEPS
    fi
}

# Remove package and orphaned dependencies
remove_package_with_dependencies() {
    local pkg_id="$1"
    local caller="${2:-normal}"
    local target_file
    
    if [ "$caller" = "custom_feeds" ]; then
        target_file="$SELECTED_CUSTOM_PACKAGES"
    else
        target_file="$SELECTED_PACKAGES"
    fi

    # 言語パックも削除
    if [ "$caller" != "custom_feeds" ]; then
        local patterns=$(get_language_module_patterns)
        local module_name=""
        
        for pattern in $patterns; do
            case "$pkg_id" in
                ${pattern}*)
                    module_name="${pkg_id#$pattern}"
                    break
                    ;;
            esac
        done
        
        if [ -n "$module_name" ]; then
            # インストール済み言語を検出
            local installed_lang
            installed_lang=$(echo "$_INSTALLED_PACKAGES_CACHE" | grep "^luci-i18n-base-" | sed 's/^luci-i18n-base-//' | head -1)
            
            if [ -n "$installed_lang" ]; then
                local lang_pkg="luci-i18n-${module_name}-${installed_lang}"
                awk -F= -v target="$lang_pkg" '!(($1 == target && $3 == "") || $3 == target)' "$target_file" > "$target_file.tmp" && mv "$target_file.tmp" "$target_file"
                debug_log "[LANG] Removed language package: $lang_pkg (parent $pkg_id removed)"
            fi
        fi
    fi
    
    # Get dependencies before removing
    local deps
    deps=$(get_package_dependencies "$pkg_id" "$caller")
    
    # Remove main package
    # Note: uniqueId対応のためawkを使用（pkg_remove()はpkg_idのみ対応）
    local all_entries
    # まずuniqueIdで完全一致検索
    all_entries=$(awk -F= -v id="$pkg_id" '$3 == id' "$target_file" 2>/dev/null)
    # 見つからなければidで検索（uniqueIdが空の行のみ）
    [ -z "$all_entries" ] && all_entries=$(awk -F= -v id="$pkg_id" '$1 == id && $3 == ""' "$target_file" 2>/dev/null)
    
    while read -r entry; do
        [ -z "$entry" ] && continue
        
        local enable_var
        enable_var=$(echo "$entry" | cut -d= -f5)
        
        if [ -n "$enable_var" ]; then
            sed -i "/^${enable_var}=/d" "$SETUP_VARS"
            debug_log "Removed enableVar: $enable_var"
        fi
    done <<ENTRIES
$all_entries
ENTRIES
    
    # 正確な行削除（awk使用、uniqueId対応）
    awk -F= -v target="$pkg_id" '
        !(($1 == target && $3 == "") || $3 == target)
    ' "$target_file" > "$target_file.tmp" && mv "$target_file.tmp" "$target_file"
    
    debug_log "pkg_remove (manual): $pkg_id"
    
    # Check and remove orphaned dependencies
    while read -r dep_id; do
        [ -z "$dep_id" ] && continue
        
        # Find dependency real id
        local dep_cache_line dep_real_id
        dep_cache_line=$(echo "$_PACKAGE_NAME_CACHE" | awk -F= -v dep="$dep_id" '$1 == dep || $3 == dep {print; exit}')
        
        if [ -n "$dep_cache_line" ]; then
            dep_real_id=$(echo "$dep_cache_line" | cut -d= -f1)
            
            # Check if this dependency is required by other selected packages
            if ! is_dependency_required_by_others "$dep_id" "$pkg_id" "$caller"; then
                # No other parent needs this dependency, safe to remove
                
                # enableVar削除
                local dep_enable_var
                dep_enable_var=$(echo "$dep_cache_line" | cut -d= -f5)
                
                if [ -n "$dep_enable_var" ]; then
                    sed -i "/^${dep_enable_var}=/d" "$SETUP_VARS"
                    debug_log "Removed enableVar: $dep_enable_var"
                fi
                
                # ヘルパー関数で削除（ownerフィルタなし = 全owner対象）
                if pkg_remove "$dep_real_id" "" "$caller"; then
                    debug_log "[DEP] Auto-removed orphaned dependency: $dep_real_id (no longer required)"
                fi
            else
                debug_log "[DEP] Kept dependency: $dep_real_id (still required by other packages)"
            fi
        fi
    done <<DEPS
$deps
DEPS
}

# Custom Feeds Management

download_customfeeds_json() {
    download_file_with_cache "$CUSTOMFEEDS_JSON_URL" "$CUSTOMFEEDS_JSON"
    return $?
}

# =============================================================================
# Build version compatibility cache (1回だけ実行)
# カテゴリIDとその互換性結果を事前にキャッシュ
# Format: cat_id|compatible (1=OK, 0=NG)
# =============================================================================
build_version_compat_cache() {
    [ "$_VERSION_COMPAT_LOADED" -eq 1 ] && return 0
    
    debug_log "Building version compatibility cache..."
    
    _VERSION_COMPAT_CACHE=""
    
    # OPENWRT_VERSION_MAJOR が未設定なら算出
    if [ -z "$OPENWRT_VERSION_MAJOR" ]; then
        OPENWRT_VERSION_MAJOR=$(echo "$OPENWRT_VERSION" | cut -c 1-2)
    fi
    
    debug_log "OPENWRT_VERSION_MAJOR=$OPENWRT_VERSION_MAJOR"
    
    # postinst.json のカテゴリ
    if [ -f "$PACKAGES_JSON" ]; then
        local all_cats
        all_cats=$(jsonfilter -i "$PACKAGES_JSON" -e '@.categories[*].id' 2>/dev/null | grep -v '^$')
        
        while read -r cat_id; do
            [ -z "$cat_id" ] && continue
            
            local min_version compatible
            min_version=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.id='$cat_id'].minVersion" 2>/dev/null)
            
            compatible=1  # デフォルトは互換性あり
            
            if [ -n "$min_version" ] && [ "$OPENWRT_VERSION_MAJOR" != "SN" ]; then
                if [ "$OPENWRT_VERSION_MAJOR" -lt "$min_version" ] 2>/dev/null; then
                    compatible=0
                    debug_log "Category $cat_id incompatible: requires $min_version+, current is $OPENWRT_VERSION_MAJOR"
                fi
            fi
            
            _VERSION_COMPAT_CACHE="${_VERSION_COMPAT_CACHE}${cat_id}|${compatible}
"
        done <<EOF
$all_cats
EOF
    fi
    
    # customfeeds.json のカテゴリ
    if [ -f "$CUSTOMFEEDS_JSON" ]; then
        local all_cats
        all_cats=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e '@.categories[*].id' 2>/dev/null | grep -v '^$')
        
        while read -r cat_id; do
            [ -z "$cat_id" ] && continue
            
            local min_version compatible
            min_version=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id'].minVersion" 2>/dev/null)
            
            compatible=1
            
            if [ -n "$min_version" ] && [ "$OPENWRT_VERSION_MAJOR" != "SN" ]; then
                if [ "$OPENWRT_VERSION_MAJOR" -lt "$min_version" ] 2>/dev/null; then
                    compatible=0
                    debug_log "Category $cat_id incompatible: requires $min_version+, current is $OPENWRT_VERSION_MAJOR"
                fi
            fi
            
            _VERSION_COMPAT_CACHE="${_VERSION_COMPAT_CACHE}${cat_id}|${compatible}
"
        done <<EOF
$all_cats
EOF
    fi
    
    _VERSION_COMPAT_LOADED=1
    
    local count
    count=$(echo "$_VERSION_COMPAT_CACHE" | grep -c '|' 2>/dev/null || echo 0)
    debug_log "Version compatibility cache built: $count entries"
}

# =============================================================================
# Check if category is version compatible (キャッシュから取得)
# Args:
#   $1 - cat_id
# Returns:
#   0 if compatible, 1 if not
# =============================================================================
check_category_version_compatible() {
    local cat_id="$1"
    
    # キャッシュ未構築なら構築
    [ "$_VERSION_COMPAT_LOADED" -eq 0 ] && build_version_compat_cache
    
    # キャッシュから検索
    local result
    result=$(echo "$_VERSION_COMPAT_CACHE" | grep "^${cat_id}|" | cut -d'|' -f2)
    
    # デフォルトは互換性あり
    [ -z "$result" ] && result=1
    
    [ "$result" = "1" ]
}

get_customfeed_categories() {
    local all_cats visible_cats cat_id
    
    all_cats=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e '@.categories[*].id' 2>/dev/null | grep -v '^$')
    
    visible_cats=""
    while read -r cat_id; do
        [ -z "$cat_id" ] && continue
        check_category_version_compatible "$cat_id" || continue
        visible_cats="${visible_cats}${cat_id}
"
    done <<EOF
$all_cats
EOF
    
    echo "$visible_cats"
}

custom_feeds_selection_prepare() {
    download_customfeeds_json || return 1
    
    local categories
    categories=$(get_customfeed_categories)
    
    if [ -z "$categories" ]; then
        return 1
    fi
    
    echo "$categories"
    return 0
}

get_customfeed_package_pattern() {
    jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[*].packages[@.id='$1'].pattern" 2>/dev/null | head -1
}

get_customfeed_package_exclude() {
    jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[*].packages[@.id='$1'].exclude" 2>/dev/null | head -1
}

get_customfeed_package_enable_service() {
    jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[*].packages[@.id='$1'].enable_service" 2>/dev/null | head -1
}

get_customfeed_package_restart_service() {
    jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[*].packages[@.id='$1'].restart_service" 2>/dev/null | head -1
}

# 変更後
get_customfeed_api_base() {
    local cat_id="$1"
    local result
    
    # まずパッケージマネージャー別のURLを試行
    result=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id'].api_base.${PKG_MGR}" 2>/dev/null | head -1)
    
    # 見つからなければ従来形式（文字列）を試行
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id'].api_base" 2>/dev/null | head -1)
        case "$result" in
            "{"*) result="" ;;
        esac
    fi
    
    echo "$result"
}

get_customfeed_download_base() {
    local cat_id="$1"
    local result
    
    result=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id'].download_base.${PKG_MGR}" 2>/dev/null | head -1)
    
    if [ -z "$result" ]; then
        result=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id'].download_base" 2>/dev/null | head -1)
        case "$result" in
            "{"*) result="" ;;
        esac
    fi
    
    echo "$result"
}

get_customfeed_template_path() {
    local cat_id="$1"
    jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.id='$cat_id'].template_path" 2>/dev/null | head -1
}

get_customfeed_template_url() {
    local cat_id="$1"
    # SC2155: Declare and assign separately
    local template_path
    template_path=$(get_customfeed_template_path "$cat_id")
    [ -n "$template_path" ] && echo "${BASE_URL}/${template_path}"
}

# Custom Feeds/Scripts UI Functions (Common)

custom_scripts_selection() {
    download_customscripts_json || return 0
    
    local tr_main_menu tr_custom_scripts breadcrumb
    local all_scripts
    
    tr_main_menu=$(translate "tr-tui-main-menu")
    tr_custom_scripts=$(translate "tr-tui-custom-scripts")
    breadcrumb=$(build_breadcrumb "$tr_main_menu" "$tr_custom_scripts")
    
    all_scripts=$(get_customscript_all_scripts)
    
    if [ -z "$all_scripts" ]; then
        show_msgbox "$breadcrumb" "No custom scripts available"
        return 0
    fi
    
    custom_scripts_selection_ui "$breadcrumb" "$all_scripts"
}

custom_script_options() {
    local script_id="$1"
    local parent_breadcrumb="$2"
    local script_name breadcrumb
    local options filtered_options
    
    script_name=$(get_customscript_name "$script_id")
    breadcrumb="${parent_breadcrumb} > ${script_name}"

    # テンプレートファイルの存在確認とダウンロード
    local template_path="$CONFIG_DIR/tpl_customscript_${script_id}.sh"
    if [ ! -f "$template_path" ] || [ ! -s "$template_path" ]; then
        echo "[DEBUG] Template not found, downloading: $template_path" >> "$CONFIG_DIR/debug.log"
        
        local script_file=$(get_customscript_file "$script_id")
        if [ -z "$script_file" ]; then
            show_msgbox "$breadcrumb" "Error: Script configuration not found"
            return 1
        fi
        
        local script_url="${BASE_URL}/custom-scripts/${script_file}"
        if ! fetch_cached_template "$script_url" "$template_path"; then
            show_msgbox "$breadcrumb" "Error: Failed to download script template"
            return 1
        fi
        
        if [ ! -f "$template_path" ] || [ ! -s "$template_path" ]; then
            show_msgbox "$breadcrumb" "Error: Downloaded template is invalid"
            return 1
        fi
    fi
    
    options=$(get_customscript_options "$script_id")
    
    if [ -z "$options" ]; then
        show_msgbox "$breadcrumb" "No options available"
        return 0
    fi
    
    filtered_options=$(filter_script_options "$script_id" "$options")
    
    if [ -z "$filtered_options" ]; then
        show_msgbox "$breadcrumb" "No options available"
        return 0
    fi
    
    # 削除オプションのみの場合はリソースチェックをスキップ
    local has_install_option=0
    while read -r opt_id; do
        local require_not_installed
        require_not_installed=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[@.id='$opt_id'].requireNotInstalled" 2>/dev/null | head -1)
        if [ "$require_not_installed" = "true" ]; then
            has_install_option=1
            break
        fi
    done <<EOF
$filtered_options
EOF
    
    # インストールオプションがある場合のみリソースチェック
    if [ "$has_install_option" -eq 1 ]; then
        if ! check_script_requirements "$script_id"; then
            return 0
        fi
    fi
    
# オプションが1つだけの場合はオプション選択画面をスキップ
    local option_count=$(echo "$filtered_options" | grep -c .)
    if [ "$option_count" -eq 1 ]; then
        local single_option=$(echo "$filtered_options" | head -1)
        
        # SELECTED_OPTION を保存
        : > "$CONFIG_DIR/script_vars_${script_id}.txt"
        echo "SELECTED_OPTION='${single_option}'" >> "$CONFIG_DIR/script_vars_${script_id}.txt"
        write_option_envvars "$script_id" "$single_option"
        
        local requires_confirmation
        requires_confirmation=$(get_customscript_option_requires_confirmation "$script_id" "$single_option")
        if [ "$requires_confirmation" = "true" ]; then
            if ! custom_script_confirm_ui "$script_id" "$single_option" "$breadcrumb"; then
                rm -f "$CONFIG_DIR/script_vars_${script_id}.txt"
                return 0
            fi
        fi
        
        local skip_inputs
        skip_inputs=$(get_customscript_option_skip_inputs "$script_id" "$single_option")
        if [ "$skip_inputs" != "true" ]; then
            if ! collect_script_inputs "$script_id" "$breadcrumb" "$single_option"; then
                rm -f "$CONFIG_DIR/script_vars_${script_id}.txt"
                return 0
            fi
        fi
        return 0
    fi
    
    custom_script_options_ui "$script_id" "$breadcrumb" "$filtered_options"
}

# Custom Scripts Management

download_customscripts_json() {
    download_file_with_cache "$CUSTOMSCRIPTS_JSON_URL" "$CUSTOMSCRIPTS_JSON"
    return $?
}

get_customscript_all_scripts() {
    jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e '@.scripts[*].id' 2>/dev/null | grep -v '^$'
}

get_customscript_name() {
    local script_id="$1"
    local class
    
    class=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].class" 2>/dev/null | head -1)
    if [ -n "$class" ]; then
        translate "$class"
    else
        jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].name" 2>/dev/null | head -1
    fi
}

get_customscript_file() {
    local script_id="$1"
    jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].script" 2>/dev/null | head -1
}

get_customscript_options() {
    local script_id="$1"
    jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[*].id" 2>/dev/null | grep -v '^$'
}

get_customscript_option_label() {
    local script_id="$1"
    local option_id="$2"
    local idx=0
    local opt_ids opt_id label
    
    opt_ids=$(get_customscript_options "$script_id")
    for opt_id in $opt_ids; do
        if [ "$opt_id" = "$option_id" ]; then
            break
        fi
        idx=$((idx+1))
    done
    
    label=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[$idx].label" 2>/dev/null | head -1)
    translate "$label"
}

get_customscript_option_skip_inputs() {
    local script_id="$1"
    local option_id="$2"
    jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[@.id='$option_id'].skipInputs" 2>/dev/null | head -1
}

get_customscript_option_requires_confirmation() {
    local script_id="$1"
    local option_id="$2"
    
    jsonfilter -i "$CUSTOMSCRIPTS_JSON" \
        -e "@.scripts[@.id='$script_id'].options[@.id='$option_id'].requiresConfirmation" 2>/dev/null
}

# =============================================================================
# Write Option Environment Variables (JSON-driven, no hardcoding)
# =============================================================================
# Reads envVars from customscripts.json and writes to script_vars file
# Args:
#   $1 - script_id
#   $2 - option_id
# =============================================================================
write_option_envvars() {
    local script_id="$1"
    local option_id="$2"
    local vars_file="$CONFIG_DIR/script_vars_${script_id}.txt"
    local idx=0
    local opt_ids opt_id env_json
    
    opt_ids=$(get_customscript_options "$script_id")
    for opt_id in $opt_ids; do
        if [ "$opt_id" = "$option_id" ]; then
            break
        fi
        idx=$((idx+1))
    done
    
    env_json=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[$idx].envVars" 2>/dev/null | head -1)
    
    [ -z "$env_json" ] && return 0
    
    # ★ 追記モード
    echo "$env_json" | \
        sed 's/^{//; s/}$//; s/","/"\n"/g' | \
        sed 's/^"//; s/"$//' | \
        while IFS=: read -r key value; do
            key=$(echo "$key" | tr -d '"' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
            value=$(echo "$value" | tr -d '"' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
            [ -n "$key" ] && [ -n "$value" ] && echo "${key}='${value}'" >> "$vars_file"
        done
}

get_customscript_inputs() {
    local script_id="$1"
    jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].inputs[*].id" 2>/dev/null | grep -v '^$'
}

get_customscript_input_label() {
    local script_id="$1"
    local input_id="$2"
    local label
    
    label=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].inputs[@.id='$input_id'].label" 2>/dev/null | head -1)
    translate "$label"
}

get_customscript_input_default() {
    local script_id="$1"
    local input_id="$2"
    jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].inputs[@.id='$input_id'].default" 2>/dev/null | head -1
}

get_customscript_input_envvar() {
    local script_id="$1"
    local input_id="$2"
    jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].inputs[@.id='$input_id'].envVar" 2>/dev/null | head -1
}

get_customscript_input_hidden() {
    local script_id="$1"
    local input_id="$2"
    jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].inputs[@.id='$input_id'].hidden" 2>/dev/null | head -1
}

# =============================================================================
# Generic Script Installation Detection
# Uses binaryPaths from customscripts.json
# Args: $1 - script_id
# Returns: 0 if installed, 1 if not
# =============================================================================
is_script_installed() {
    local script_id="$1"
    local paths
    
    paths=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].binaryPaths[*]" 2>/dev/null)
    
    while read -r path; do
        [ -z "$path" ] && continue
        [ -x "$path" ] && return 0
    done <<EOF
$paths
EOF
    
    return 1
}

filter_script_options() {
    local script_id="$1"
    local options="$2"
    local filtered=""
    local installed="no"
    
    # 汎用インストール検出（binaryPathsベース）
    is_script_installed "$script_id" && installed="yes"
    
    while read -r option_id; do
        [ -z "$option_id" ] && continue
        
        local require_installed require_not_installed
        require_installed=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[@.id='$option_id'].requireInstalled" 2>/dev/null | head -1)
        require_not_installed=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[@.id='$option_id'].requireNotInstalled" 2>/dev/null | head -1)
        
        if [ "$require_installed" = "true" ] && [ "$installed" != "yes" ]; then
            continue
        fi
        
        if [ "$require_not_installed" = "true" ] && [ "$installed" = "yes" ]; then
            continue
        fi
        
        filtered="${filtered}${option_id}
"
    done <<EOF
$options
EOF
    
    echo "$filtered" | grep -v '^$'
}

get_adguardhome_yaml_value() {
    local field="$1"  # "username" or "web_port"
    local script_id="adguardhome"
    local yaml_file=""
    local paths
    
    paths=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].yamlPaths[*]" 2>/dev/null)
    
    while read -r path; do
        [ -z "$path" ] && continue
        if [ -f "$path" ]; then
            yaml_file="$path"
            break
        fi
    done <<EOF
$paths
EOF
    
    [ -z "$yaml_file" ] && return 1
    
    case "$field" in
        username)
            awk '
            /^users:/ { in_users=1; next }
            in_users && /^[^ ]/ { exit }
            in_users && $1 == "-" && $2 == "name:" {
                print $3
                exit
            }
            ' "$yaml_file"
            ;;
        web_port)
            awk '
            /^http:/ { in_http=1; next }
            in_http && /^[^ ]/ { exit }
            in_http && /^  address:/ {
                split($2, parts, ":")
                print parts[2]
                exit
            }
            ' "$yaml_file"
            ;;
    esac
}

validate_input_value() {
    local value="$1"
    local validation_json="$2"
    
    [ -z "$validation_json" ] && return 0
    
    local val_type
    val_type=$(echo "$validation_json" | jsonfilter -e '@.type' 2>/dev/null)
    
    case "$val_type" in
        port)
            # 数値チェック
            case "$value" in
                ''|*[!0-9]*)
                    return 1  # エラーメッセージなし
                    ;;
            esac
            
            # 範囲チェック
            local min max
            min=$(echo "$validation_json" | jsonfilter -e '@.min' 2>/dev/null)
            max=$(echo "$validation_json" | jsonfilter -e '@.max' 2>/dev/null)
            
            if [ -n "$min" ] && [ "$value" -lt "$min" ]; then
                return 1
            fi
            
            if [ -n "$max" ] && [ "$value" -gt "$max" ]; then
                return 1
            fi
            ;;
    esac
    
    return 0
}

collect_script_inputs() {
    local script_id="$1"
    local breadcrumb="$2"
    local selected_option="$3"
    local inputs input_id input_label input_default input_envvar input_hidden min_length value
    local required_inputs
    
    # Get requiredInputs from selected option
    if [ -n "$selected_option" ]; then
        required_inputs=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[@.id='$selected_option'].requiredInputs[*]" 2>/dev/null)
        
        if [ -z "$required_inputs" ]; then
            inputs=$(get_customscript_inputs "$script_id")
        else
            inputs="$required_inputs"
        fi
    else
        inputs=$(get_customscript_inputs "$script_id")
    fi
    
    for input_id in $inputs; do
        input_label=$(get_customscript_input_label "$script_id" "$input_id")
        input_default=$(get_customscript_input_default "$script_id" "$input_id")
        
        # Check for apiSource
        local api_source
        api_source=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].inputs[@.id='$input_id'].apiSource" 2>/dev/null | head -1)
        if [ -n "$api_source" ]; then
            local api_value
            api_value=$(jsonfilter -i "$AUTO_CONFIG_JSON" -e "@.${api_source}" 2>/dev/null)
            [ -n "$api_value" ] && input_default="$api_value"
        fi
        
        input_envvar=$(get_customscript_input_envvar "$script_id" "$input_id")
        input_hidden=$(get_customscript_input_hidden "$script_id" "$input_id")
        min_length=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].inputs[@.id='$input_id'].minlength" 2>/dev/null | head -1)
        
        local validation_json
        validation_json=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].inputs[@.id='$input_id'].validation" 2>/dev/null | head -1)
        
        local display_label="$input_label"
        if [ -n "$min_length" ]; then
            display_label="${input_label}"
        fi
        
        if [ -n "$validation_json" ]; then
            local val_type min_val max_val
            val_type=$(echo "$validation_json" | jsonfilter -e '@.type' 2>/dev/null)
            
            if [ "$val_type" = "port" ]; then
                min_val=$(echo "$validation_json" | jsonfilter -e '@.min' 2>/dev/null)
                max_val=$(echo "$validation_json" | jsonfilter -e '@.max' 2>/dev/null)
                
                if [ -n "$min_val" ] && [ -n "$max_val" ]; then
                    display_label="${input_label} (${min_val}-${max_val})"
                fi
            fi
        fi
        
        if [ "$script_id" = "adguardhome" ]; then
            case "$input_envvar" in
                AGH_USER)
                    local current_user
                    current_user=$(get_adguardhome_yaml_value "username")
                    [ -n "$current_user" ] && input_default="$current_user"
                    ;;
                WEB_PORT)
                    local current_port
                    current_port=$(get_adguardhome_yaml_value "web_port")
                    [ -n "$current_port" ] && input_default="$current_port"
                    ;;
            esac
        fi
        
        if [ "$input_envvar" = "LAN_ADDR" ] && [ -n "$LAN_ADDR" ]; then
            input_default="$LAN_ADDR"
        fi
        
        if [ "$input_hidden" = "true" ]; then
            echo "${input_envvar}=\"${input_default}\"" >> "$CONFIG_DIR/script_vars_${script_id}.txt"
            continue
        fi
        
        while true; do
            value=$(show_inputbox "$breadcrumb" "$display_label" "$input_default")
            
            if ! [ $? -eq 0 ]; then
                rm -f "$CONFIG_DIR/script_vars_${script_id}.txt"
                return 1
            fi
            
            if [ -z "$value" ]; then
                if [ -n "$min_length" ]; then
                    continue
                else
                    value="$input_default"
                fi
            fi
            
            if [ -n "$min_length" ]; then
                local value_length="${#value}"
                if [ "$value_length" -lt "$min_length" ]; then
                    continue
                fi
            fi
            
            if ! validate_input_value "$value" "$validation_json"; then
                continue
            fi
            
            break
        done
        
		sed -i "/^${input_envvar}=/d" "$CONFIG_DIR/script_vars_${script_id}.txt" 2>/dev/null
		echo "${input_envvar}=\"${value}\"" >> "$CONFIG_DIR/script_vars_${script_id}.txt"

    done
    
    return 0
}

check_script_requirements() {
    local script_id="$1"
    
    # requirementsがなければスキップ
    local has_requirements
    has_requirements=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].requirements" 2>/dev/null)
    [ -z "$has_requirements" ] && return 0
    
    local min_mem rec_mem min_flash rec_flash
    min_mem=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].requirements.minMemory" 2>/dev/null)
    rec_mem=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].requirements.recommendedMemory" 2>/dev/null)
    min_flash=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].requirements.minFlash" 2>/dev/null)
    rec_flash=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].requirements.recommendedFlash" 2>/dev/null)
    
    local msg="$(translate 'tr-tui-customscript-resource-check')
$(translate 'tr-tui-customscript-memory'): ${MEM_FREE_MB}MB ($(translate 'tr-tui-customscript-minimum'): ${min_mem}MB / $(translate 'tr-tui-customscript-recommended'): ${rec_mem}MB)
$(translate 'tr-tui-customscript-storage'): ${FLASH_FREE_MB}MB ($(translate 'tr-tui-customscript-minimum'): ${min_flash}MB / $(translate 'tr-tui-customscript-recommended'): ${rec_flash}MB)"
    
    if [ "$MEM_FREE_MB" -lt "$min_mem" ] || [ "$FLASH_FREE_MB" -lt "$min_flash" ]; then
        msg="${msg}

$(translate 'tr-tui-customscript-resource-ng')"
        show_msgbox "$breadcrumb" "$msg"
        
        if show_yesno "$breadcrumb" "$(translate 'tr-tui-customscript-force-install-question')"; then
            export SKIP_RESOURCE_CHECK=1
            return 0
        else
            return 1
        fi
    fi
    
    msg="${msg}

$(translate 'tr-tui-customscript-resource-ok')"
    show_msgbox "$breadcrumb" "$msg"
    return 0
}

get_effective_connection_type() {
    local conn_type
    conn_type=$(grep "^connection_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
    
    if [ "$conn_type" = "auto" ]; then
        if [ "$DETECTED_CONN_TYPE" = "mape" ] && [ -n "$MAPE_BR" ]; then
            echo "mape"
            return 0
        elif [ "$DETECTED_CONN_TYPE" = "dslite" ] && [ -n "$DSLITE_AFTR" ]; then
            echo "dslite"
            return 0
        else
            echo "dhcp"
            return 0
        fi
    else
        echo "$conn_type"
        return 0
    fi
}

# =============================================================================
# should_show_item() - 修正版
# TUI版で表示すべきアイテムかどうかを判定
# 
# 追加機能:
#   - カテゴリレベルの guiOnly チェック
#   - アイテムレベルの guiOnly チェック  
#   - tr-agh- プレフィックスのクラスをTUIから除外
#
# 引数:
#   $1 - item_id (必須)
#   $2 - cat_id (オプション、カテゴリのguiOnlyチェック用)
# =============================================================================
should_show_item() {
    local item_id="$1"
    local cat_id="${2:-}"
    
    # 1. カテゴリの guiOnly チェック（cat_id が渡された場合）
    if [ -n "$cat_id" ]; then
        local cat_gui_only
        cat_gui_only=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].guiOnly" 2>/dev/null | head -1 | tr -d ' \n\r')
        if [ "$cat_gui_only" = "true" ]; then
            echo "[DEBUG] Item $item_id hidden: parent category $cat_id is guiOnly" >> "$CONFIG_DIR/debug.log"
            return 1
        fi
    fi
    
    # 2. アイテム自体の guiOnly チェック
    local item_gui_only
    item_gui_only=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].guiOnly" 2>/dev/null | head -1 | tr -d ' \n\r')
    if [ -z "$item_gui_only" ]; then
        item_gui_only=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].guiOnly" 2>/dev/null | head -1 | tr -d ' \n\r')
    fi
    if [ "$item_gui_only" = "true" ]; then
        echo "[DEBUG] Item $item_id hidden: item is guiOnly" >> "$CONFIG_DIR/debug.log"
        return 1
    fi
    
    # 3. tr-agh- プレフィックスのクラスを持つアイテムはTUIから除外
    local item_class
    item_class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].class" 2>/dev/null | head -1)
    if [ -z "$item_class" ]; then
        item_class=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].class" 2>/dev/null | head -1)
    fi
    if [ -n "$item_class" ] && [ "${item_class#tr-agh-}" != "$item_class" ]; then
        echo "[DEBUG] Item $item_id hidden: class '$item_class' has tr-agh- prefix (GUI only)" >> "$CONFIG_DIR/debug.log"
        return 1
    fi
    
    # 4. hidden チェック（既存ロジック）
    local is_hidden
    is_hidden=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].hidden" 2>/dev/null | head -1)
    
    if [ -z "$is_hidden" ]; then
        is_hidden=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].hidden" 2>/dev/null | head -1)
    fi
    
    [ "$is_hidden" = "true" ] && return 1
    
    # 5. showWhen チェック（既存ロジック）
    local show_when=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].showWhen" 2>/dev/null | head -1)
    
    if [ -z "$show_when" ]; then
        show_when=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].showWhen" 2>/dev/null | head -1)
    fi
    
    [ -z "$show_when" ] && return 0
    
    # ハイフンをアンダースコアに変換
    local show_when_normalized=$(echo "$show_when" | tr '-' '_')
    
    echo "[DEBUG] showWhen for $item_id: $show_when_normalized" >> $CONFIG_DIR/debug.log
    
    local var_name=$(echo "$show_when_normalized" | sed 's/^{ *"\([^"]*\)".*/\1/')
    
    echo "[DEBUG] var_name=$var_name" >> $CONFIG_DIR/debug.log
    
    local expected=$(jsonfilter -e "@.${var_name}[*]" 2>/dev/null <<EOF
$show_when_normalized
EOF
)
    
    if [ -z "$expected" ]; then
        expected=$(jsonfilter -e "@.${var_name}" 2>/dev/null <<EOF
$show_when_normalized
EOF
)
    fi
    
    echo "[DEBUG] expected values: $expected" >> $CONFIG_DIR/debug.log
    
    local current=$(grep "^${var_name}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
    
    echo "[DEBUG] current value of $var_name: '$current'" >> $CONFIG_DIR/debug.log
    
    [ -z "$current" ] && {
        echo "[DEBUG] No value set, hiding item" >> $CONFIG_DIR/debug.log
        return 1
    }
    
    if echo "$expected" | grep -q "^${current}\$"; then
        echo "[DEBUG] Match found, showing item" >> $CONFIG_DIR/debug.log
        return 0
    fi
    
    echo "[DEBUG] No match, hiding item" >> $CONFIG_DIR/debug.log
    return 1
}

# 依存情報の損失を防ぐためのスマート追加関数
add_auto_package_smart() {
    local p_id="$1"
    local entry
    
    # キャッシュから完全なエントリ（uniqueIdやinstallOptionsを含む）を検索
    entry=$(echo "$_PACKAGE_NAME_CACHE" | grep "^${p_id}=" | head -n 1)
    
    if [ -n "$entry" ]; then
        # フィールド11 (owner) を 'auto' に書き換えて保存用エントリを作成
        local new_entry=$(echo "$entry" | awk -F= 'BEGIN{OFS="="} {$11="auto"; print}')
        
        # すでにインストールリストにある場合は一旦削除（重複防止）して追加
        grep -q "^${p_id}=" "$INSTALLED_PACKAGES_FILE" 2>/dev/null && \
            sed -i "/^${p_id}=/d" "$INSTALLED_PACKAGES_FILE"
        
        echo "$new_entry" >> "$INSTALLED_PACKAGES_FILE"
        return 0
    else
        # キャッシュにない場合は通常のpkg_add（フォールバック）
        pkg_add "$p_id" "auto"
    fi
}

# =============================================================================
# Build conditional packages cache (V3: AND条件対応版)
# Extracts packages with "when" conditions from setup.json
# 
# Format: pkg_id|group_id|when_var|expected_values|uniqueId|cat_id
#   - group_id: 同じグループ内の条件はAND評価
#   - expected_values: カンマ区切りでOR評価
#   - cat_id: パッケージが属するカテゴリID
#
# Example cache entries:
#   kmod-tcp-bbr|g1|netopt_congestion|bbr||tuning-config
#   kmod-tcp-bbr|g2|net_optimizer|auto||tuning-config
#   kmod-tcp-bbr|g2|connection_type|dhcp,pppoe,ap||tuning-config
# =============================================================================

build_conditional_packages_cache() {
    if [ "$_CONDITIONAL_PACKAGES_LOADED" -eq 1 ]; then
        return 0
    fi
    
    debug_log "Building conditional packages cache..."
    
    # SETUP_JSONがまだダウンロードされていない場合はリトライ用にreturn
    if [ ! -f "$SETUP_JSON" ]; then
        debug_log "SETUP_JSON not found yet, will retry later: $SETUP_JSON"
        return 0
    fi
    
    _CONDITIONAL_PACKAGES_CACHE=""
    
    local group_counter=0
    local categories
    categories=$(jsonfilter -i "$SETUP_JSON" -e '@.categories[*].id' 2>/dev/null)
    
    for cat_id in $categories; do
        [ -z "$cat_id" ] && continue
        
        # このカテゴリのpackages配列を取得してインデックスでアクセス
        local pkg_idx=0
        while true; do
            local pkg_id unique_id when_json
            
            pkg_id=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].packages[$pkg_idx].id" 2>/dev/null)
            [ -z "$pkg_id" ] && break
            
            unique_id=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].packages[$pkg_idx].uniqueId" 2>/dev/null)
            when_json=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.id='$cat_id'].packages[$pkg_idx].when" 2>/dev/null)
            
            if [ -n "$when_json" ]; then
                debug_log "Found package with when: $pkg_id, when=$when_json"
                
                # 新しい条件グループを作成
                group_counter=$((group_counter + 1))
                local group_id="g${group_counter}"
                
                # whenオブジェクトのキーを取得
                local when_keys
                when_keys=$(echo "$when_json" | grep -oE '"[a-z_]+":' | tr -d '":' | sort -u)
                
                for when_var in $when_keys; do
                    [ -z "$when_var" ] && continue
                    
                    # 値を取得（配列または単一値）
                    local when_values=""
                    
                    # まず配列として試す
                    local arr_values
                    arr_values=$(echo "$when_json" | jsonfilter -e "@.${when_var}[*]" 2>/dev/null)
                    
                    if [ -n "$arr_values" ]; then
                        # 配列の場合：スペース区切り → カンマ区切り
                        when_values=$(echo "$arr_values" | tr '\n' ',' | sed 's/,$//')
                    else
                        # 単一値の場合
                        when_values=$(echo "$when_json" | jsonfilter -e "@.${when_var}" 2>/dev/null)
                    fi
                    
                    if [ -n "$when_values" ]; then
                        _CONDITIONAL_PACKAGES_CACHE="${_CONDITIONAL_PACKAGES_CACHE}${pkg_id}|${group_id}|${when_var}|${when_values}|${unique_id}|${cat_id}
"
						debug_log "Added cache entry: ${pkg_id}|${group_id}|${when_var}|${when_values}|${unique_id}|${cat_id}"
                    fi
                done
            fi
            
            pkg_idx=$((pkg_idx + 1))
        done
    done
    
    _CONDITIONAL_PACKAGES_LOADED=1
    
    # カウント（安全な方法）
    local count=0
    if [ -n "$_CONDITIONAL_PACKAGES_CACHE" ]; then
        count=$(printf '%s' "$_CONDITIONAL_PACKAGES_CACHE" | grep -c '|' 2>/dev/null || true)
        count=$(printf '%s' "$count" | tr -cd '0-9')
        count=${count:-0}
    fi
    
    debug_log "Conditional packages cache built: ${count} entries"
    
    if [ "$count" -gt 0 ] 2>/dev/null; then
        debug_log "Sample entries:"
        printf '%s' "$_CONDITIONAL_PACKAGES_CACHE" | head -10 >> "$CONFIG_DIR/debug.log"
    fi
}

# =============================================================================
# 条件評価ヘルパー関数
# グループ内の全条件がAND、expected_values内はOR
# =============================================================================
_evaluate_condition_group() {
    local pkg_id="$1"
    local group_id="$2"
    local effective_conn_type="$3"
    
    # このグループの条件をファイルに保存
    local cond_file="$CONFIG_DIR/cond_eval.tmp"
    printf '%s' "$_CONDITIONAL_PACKAGES_CACHE" | grep "^${pkg_id}|${group_id}|" > "$cond_file"
    
    local all_match=1
    
    while IFS='|' read -r _pkg _grp when_var expected_values _uid _cat; do
        [ -z "$when_var" ] && continue
        
        # 現在値を取得
        local current_val
        if [ "$when_var" = "connection_type" ]; then
            current_val="$effective_conn_type"
        else
            current_val=$(grep "^${when_var}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
        fi
        
        debug_log "    Condition: $when_var, expected=[$expected_values], current='$current_val'"
        
        # expected_values内のいずれかと一致するかチェック（OR）
        local value_match=0
        
        # カンマ区切りを処理
        local old_ifs="$IFS"
        IFS=','
        set -- $expected_values
        IFS="$old_ifs"
        
        for exp_val in "$@"; do
            if [ "$current_val" = "$exp_val" ]; then
                value_match=1
                debug_log "      Value matched: $exp_val"
                break
            fi
        done
        
        if [ "$value_match" -eq 0 ]; then
            debug_log "    Condition NOT matched"
            all_match=0
            break
        fi
    done < "$cond_file"
    
    rm -f "$cond_file"
    
    return $((1 - all_match))  # 0=成功(一致), 1=失敗(不一致)
}

# =============================================================================
# Auto add conditional packages (V4: カテゴリフィルタ)
# 
# 評価ロジック:
#   - 同じgroup_id内の全条件がAND（全て一致が必要）
#   - expected_values内の値はOR（いずれか一致でOK）
#   - 異なるgroup_idはOR（いずれかのグループが一致すればOK）
#   - cat_id="*" で全カテゴリ対象、それ以外は指定カテゴリのみ
# =============================================================================
auto_add_conditional_packages() {
    local cat_id="$1"
    debug_log "=== auto_add_conditional_packages called === ($cat_id)"
    
    # キャッシュ構築（初回のみ）
    build_conditional_packages_cache
    
    # キャッシュが空かチェック
    if [ -z "$_CONDITIONAL_PACKAGES_CACHE" ]; then
        debug_log "No conditional packages defined"
        return 0
    fi
    
    local cache_count=0
    cache_count=$(printf '%s' "$_CONDITIONAL_PACKAGES_CACHE" | grep -c '|' 2>/dev/null || true)
    cache_count=$(printf '%s' "$cache_count" | tr -cd '0-9')
    cache_count=${cache_count:-0}
    
    if [ "$cache_count" -eq 0 ] 2>/dev/null; then
        debug_log "No conditional packages defined (count=0)"
        return 0
    fi
    
    # 実効接続タイプを取得（修正版）
    local effective_conn_type
    effective_conn_type=$(grep "^connection_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
    
    debug_log "Raw connection_type: '$effective_conn_type'"
    
    # connection_typeが設定されていない場合は処理しない
    if [ -z "$effective_conn_type" ]; then
        debug_log "connection_type not set, skipping connection-dependent packages"
        effective_conn_type="__UNSET__"  # ダミー値で一致しないようにする
    elif [ "$effective_conn_type" = "auto" ]; then
        # autoの場合は connection_auto の値を使用
        local auto_type
        auto_type=$(grep "^connection_auto=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
        
        if [ -n "$auto_type" ]; then
            effective_conn_type="$auto_type"
            debug_log "connection_type=auto, resolved to: $auto_type"
        else
            debug_log "connection_type=auto but connection_auto not set, keeping 'auto'"
        fi
    fi
    
    debug_log "Effective connection type: $effective_conn_type"
    
    # ユニークなパッケージIDリストを取得
    local unique_pkgs
    unique_pkgs=$(printf '%s' "$_CONDITIONAL_PACKAGES_CACHE" | cut -d'|' -f1 | sort -u)
    
    for pkg_id in $unique_pkgs; do
        [ -z "$pkg_id" ] && continue
        
        debug_log "Evaluating package: $pkg_id"
        
        # このパッケージの全グループIDを取得
        local pkg_groups
        pkg_groups=$(printf '%s' "$_CONDITIONAL_PACKAGES_CACHE" | grep "^${pkg_id}|" | cut -d'|' -f2 | sort -u)
        
        local any_group_match=0
        
        for group_id in $pkg_groups; do
            [ -z "$group_id" ] && continue
            
            debug_log "  Checking group: $group_id"
            
            # グループの条件を評価
            if _evaluate_condition_group "$pkg_id" "$group_id" "$effective_conn_type"; then
                debug_log "  Group $group_id: MATCHED"
                any_group_match=1
                break  # 1つのグループが一致すればOK（OR）
            else
                debug_log "  Group $group_id: NOT matched"
            fi
        done
        
        debug_log "Package $pkg_id final result: any_group_match=$any_group_match"
        
        # アクション実行
        if [ "$any_group_match" -eq 1 ]; then
            # パッケージを追加
            if pkg_add "$pkg_id" "auto" "normal"; then
                debug_log "[AUTO] Added package: $pkg_id"
                
                # enableVar処理
                local unique_id
                unique_id=$(printf '%s' "$_CONDITIONAL_PACKAGES_CACHE" | grep "^${pkg_id}|" | head -1 | cut -d'|' -f5)
                local evar
                evar=$(get_package_enablevar "$pkg_id" "$unique_id")
                if [ -n "$evar" ] && ! grep -q "^${evar}=" "$SETUP_VARS" 2>/dev/null; then
                    echo "${evar}='1'" >> "$SETUP_VARS"
                    debug_log "[AUTO] Set enableVar: $evar='1'"
                fi
            fi
        else
            # パッケージを削除
            if pkg_remove "$pkg_id" "auto" "normal"; then
                debug_log "[AUTO] Removed package: $pkg_id (no matching conditions)"
                
                local unique_id
                unique_id=$(printf '%s' "$_CONDITIONAL_PACKAGES_CACHE" | grep "^${pkg_id}|" | head -1 | cut -d'|' -f5)
                local evar
                evar=$(get_package_enablevar "$pkg_id" "$unique_id")
                [ -n "$evar" ] && sed -i "/^${evar}=/d" "$SETUP_VARS"
            fi
        fi
    done
    
    debug_log "=== auto_add_conditional_packages finished ==="
}

get_section_controlling_radio_info() {
    local item_id="$1"
    local show_when controlling_var controlling_value radio_id radio_label current_val option_label
    
    show_when=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].showWhen" 2>/dev/null | head -1)
    [ -z "$show_when" ] && show_when=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].showWhen" 2>/dev/null | head -1)
    [ -z "$show_when" ] && return 1
    
    # 変数名と値の両方を抽出
    controlling_var=$(echo "$show_when" | sed 's/.*"\([^"]*\)"[[:space:]]*:.*/\1/' | head -1)
    controlling_value=$(echo "$show_when" | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/' | head -1)
    [ -z "$controlling_var" ] && return 1
    
    radio_id=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.variable='$controlling_var'].id" 2>/dev/null | head -1)
    [ -z "$radio_id" ] && return 1
    
    radio_label=$(get_setup_item_label "$radio_id")
    [ -z "$radio_label" ] && return 1
    
    # SETUP_VARSから取得、なければshowWhenの値をフォールバック
    current_val=$(grep "^${controlling_var}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
    [ -z "$current_val" ] && current_val="$controlling_value"
    [ -z "$current_val" ] && return 1
    
    option_label=$(get_setup_item_option_label "$radio_id" "$current_val")
    [ -z "$option_label" ] && return 1
    
    echo "${radio_label}|${option_label}"
    return 0
}

get_section_nested_items() {
    local item_id="$1"
    local cat_idx=0
    local item_idx=0
    local cat_id items idx itm
    
    for cat_id in $(get_setup_categories); do
        items=$(get_setup_category_items "$cat_id")
        idx=0
        for itm in $items; do
            if [ "$itm" = "$item_id" ]; then
                item_idx=$idx
                break 2
            fi
            idx=$((idx+1))
        done
        cat_idx=$((cat_idx+1))
    done
    
    jsonfilter -i "$SETUP_JSON" -e "@.categories[$cat_idx].items[$item_idx].items[*].id" 2>/dev/null
}

auto_cleanup_conditional_variables() {
    local cat_id="$1"
    
    echo "[DEBUG] === auto_cleanup_conditional_variables called ===" >> "$CONFIG_DIR/debug.log"
    
    # 実効接続タイプを取得
    local effective_conn_type
    effective_conn_type=$(get_effective_connection_type)
    echo "[DEBUG] Effective connection type: $effective_conn_type" >> "$CONFIG_DIR/debug.log"
    
    # connection_type の exclusiveVars を使ってクリーンアップ
    cleanup_radio_group_exclusive_vars "connection-type" "$effective_conn_type"
    
    # カテゴリ内の他のアイテムも処理
    for item_id in $(get_setup_category_items "$cat_id"); do
        local item_type
        item_type=$(get_setup_item_type "$item_id")
        
        if [ "$item_type" = "section" ]; then
            local nested_items
            nested_items=$(get_section_nested_items "$item_id")
            for nested_id in $nested_items; do
                check_and_cleanup_variable "$nested_id" "$effective_conn_type"
            done
        else
            check_and_cleanup_variable "$item_id" "$effective_conn_type"
        fi
    done
    
    echo "[DEBUG] === auto_cleanup_conditional_variables finished ===" >> "$CONFIG_DIR/debug.log"
}

cleanup_radio_group_exclusive_vars() {
    local item_id="$1"
    local current_value="$2"
    
    echo "[DEBUG] === cleanup_radio_group_exclusive_vars ===" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG] item_id=$item_id, current_value=$current_value" >> "$CONFIG_DIR/debug.log"

    # connection-type の場合は特別処理（データ変数は削除しない）
    if [ "$item_id" = "connection-type" ]; then
        local original_conn_type
        original_conn_type=$(grep "^connection_type=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
        
        echo "[DEBUG] cleanup_radio: original='$original_conn_type'" >> "$CONFIG_DIR/debug.log"
        
        # auto 以外の場合のみ connection_auto を削除
        if [ "$original_conn_type" != "auto" ]; then
            sed -i '/^connection_auto=/d' "$SETUP_VARS"
            echo "[EXCLUSIVE] Removed connection_auto (not auto mode)" >> "$CONFIG_DIR/debug.log"
        fi
        
        echo "[DEBUG] Data variables preserved" >> "$CONFIG_DIR/debug.log"
        return 0
    fi
	
    # exclusiveVars の存在確認
    local has_exclusive
    has_exclusive=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].exclusiveVars" 2>/dev/null | head -1)
    
    if [ -z "$has_exclusive" ]; then
        has_exclusive=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].exclusiveVars" 2>/dev/null | head -1)
    fi
    
    [ -z "$has_exclusive" ] && {
        echo "[DEBUG] No exclusiveVars defined for $item_id" >> "$CONFIG_DIR/debug.log"
        return 0
    }
    
    # 全オプションの変数リストを取得
    local all_exclusive_vars=""
    local options
    options=$(get_setup_item_options "$item_id")
    
    while read -r option_value; do
        [ -z "$option_value" ] || [ "$option_value" = "___EMPTY___" ] && continue
        
        # このオプションに紐づく変数リスト
        local vars_json
        vars_json=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].exclusiveVars.${option_value}[*]" 2>/dev/null)
        
        if [ -z "$vars_json" ]; then
            vars_json=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].exclusiveVars.${option_value}[*]" 2>/dev/null)
        fi
        
        # 現在選択されていないオプションの変数を削除対象に追加
        if [ "$option_value" != "$current_value" ]; then
            all_exclusive_vars="${all_exclusive_vars}${vars_json}
"
        fi
    done <<EOF
$options
EOF
    
    # 削除実行
    while read -r var_name; do
        [ -z "$var_name" ] && continue
        
        if grep -q "^${var_name}=" "$SETUP_VARS" 2>/dev/null; then
            sed -i "/^${var_name}=/d" "$SETUP_VARS"
            echo "[EXCLUSIVE] Removed variable: $var_name (not in current selection: $current_value)" >> "$CONFIG_DIR/debug.log"
        fi
    done <<EOF
$all_exclusive_vars
EOF
    
    echo "[DEBUG] === cleanup_radio_group_exclusive_vars finished ===" >> "$CONFIG_DIR/debug.log"
}

check_and_cleanup_variable() {
    local item_id="$1"
    local effective_type="${2:-}" # 第2引数で実効タイプを受け取る
    local variable show_when parent_section
    
    # この項目が変数を持っているか確認
    variable=$(get_setup_item_variable "$item_id")
    [ -z "$variable" ] && return 0
    
    # 1. showWhen条件を取得 (項目自身または親セクションから)
    show_when=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$item_id'].showWhen" 2>/dev/null | head -1)
    if [ -z "$show_when" ]; then
        show_when=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.id='$item_id'].showWhen" 2>/dev/null | head -1)
    fi
    if [ -z "$show_when" ]; then
        # 親セクションのshowWhenを確認
        parent_section=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.items[*].id='$item_id'].id" 2>/dev/null | head -1)
        [ -n "$parent_section" ] && show_when=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.id='$parent_section'].showWhen" 2>/dev/null | head -1)
    fi
    
    # showWhen がない場合は削除対象外として終了
    [ -z "$show_when" ] && return 0
    
    # 2. 条件を解析
    local show_when_normalized
    show_when_normalized=$(echo "$show_when" | tr '-' '_')
    local var_name
    var_name=$(echo "$show_when_normalized" | sed 's/^{ *"\([^"]*\)".*/\1/')
    
    local expected
    expected=$(jsonfilter -e "@.${var_name}[*]" 2>/dev/null <<EOF
$show_when_normalized
EOF
)
    [ -z "$expected" ] && expected=$(jsonfilter -e "@.${var_name}" 2>/dev/null <<EOF
$show_when_normalized
EOF
)
    
    # 3. 現在値を取得（ここで「実効値」変数を使用する）
    local current_val
    if [ "$var_name" = "connection_type" ] && [ -n "$effective_type" ]; then
        # connection_type の判定には、渡された実効値変数を使用する
        current_val="$effective_type"
    else
        # それ以外の変数は通常通り SETUP_VARS から取得
        current_val=$(grep "^${var_name}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
    fi
    
    # 4. 条件判定と削除実行
    local should_keep=0
    if [ -n "$current_val" ] && echo "$expected" | grep -q "^${current_val}\$"; then
        should_keep=1
    else
    	echo "[DEBUG] Variable check failed: item_id=$item_id, var_name=$var_name, expected='$expected', current='$current_val'" >> "$CONFIG_DIR/debug.log"
	fi
    
    if [ "$should_keep" -eq 0 ]; then
        if grep -q "^${variable}=" "$SETUP_VARS" 2>/dev/null; then
            sed -i "/^${variable}=/d" "$SETUP_VARS"
            echo "[AUTO] Removed variable: $variable (condition not met for $item_id, expected=$expected, current=$current_val)" >> "$CONFIG_DIR/debug.log"
        fi
    fi
}

# enableVar のクリーンアップ
cleanup_orphaned_enablevars() {
    local cat_id="$1"
    
    echo "[DEBUG] === cleanup_orphaned_enablevars called ===" >> "$CONFIG_DIR/debug.log"
    
    # enableVar のマップを一度だけ構築
    local enablevar_map=""
    while read -r cache_line; do
        local cached_id cached_enablevar
        cached_id=$(echo "$cache_line" | cut -d= -f1)
        cached_enablevar=$(echo "$cache_line" | cut -d= -f5)
        
        [ -n "$cached_enablevar" ] && enablevar_map="${enablevar_map}${cached_enablevar}|${cached_id}
"
    done <<EOF
$_PACKAGE_NAME_CACHE
EOF

    local setup_vars_content=""
    if [ -f "$SETUP_VARS" ]; then
        setup_vars_content=$(cat "$SETUP_VARS")
    fi
    
    # SETUP_VARSをスキャン（メモリ上のデータを使用）
    local temp_file="$CONFIG_DIR/temp_enablevars.txt"
    : > "$temp_file"
    
    while read -r line; do
        case "$line" in
            \#*|'') 
                echo "$line" >> "$temp_file"
                continue 
                ;;
        esac
        
        local var_name=$(echo "$line" | cut -d= -f1)
        
        # マップから高速検索
        local pkg_id=$(echo "$enablevar_map" | grep "^${var_name}|" | cut -d'|' -f2 | head -1)
        
        if [ -n "$pkg_id" ]; then
            # パッケージが選択されているかチェック
            if grep -q "^${pkg_id}=" "$SELECTED_PACKAGES" 2>/dev/null || \
               grep -q "^${pkg_id}=" "$SELECTED_CUSTOM_PACKAGES" 2>/dev/null; then
                echo "$line" >> "$temp_file"
            else
                echo "[CLEANUP] Removed orphaned enableVar: $var_name" >> "$CONFIG_DIR/debug.log"
            fi
        else
            # enableVarではない通常変数
            echo "$line" >> "$temp_file"
        fi
    done <<EOF
$setup_vars_content
EOF
    
    mv "$temp_file" "$SETUP_VARS"
    echo "[DEBUG] === cleanup_orphaned_enablevars finished ===" >> "$CONFIG_DIR/debug.log"
}

reset_state_for_next_session() {
    # 選択パッケージ（ファイル）をクリア（削除ではなく空にする）
    : > "$SELECTED_PACKAGES"
    : > "$SELECTED_CUSTOM_PACKAGES"
    # SETUP_VARS を完全にクリア（前回の設定は全て適用済み）
    : > "$SETUP_VARS"
    # 現在の言語設定を再取得
    get_language_code
    
    # 選択キャッシュをリセット
    unset _SELECTED_PACKAGES_CACHE
    unset _SELECTED_CUSTOM_CACHE
    unset _INSTALLED_PACKAGES_CACHE
    _SELECTED_PACKAGES_CACHE_LOADED=0
    _SELECTED_CUSTOM_CACHE_LOADED=0
    _INSTALLED_PACKAGES_LOADED=0
    
    # スナップショットファイルをクリア（後でcpで上書き）
    : > "$CONFIG_DIR/packages_initial_snapshot.txt"
    : > "$CONFIG_DIR/custom_packages_initial_snapshot.txt"
    : > "$CONFIG_DIR/lang_packages_initial_snapshot.txt"
    
    # 生成済み実行スクリプトの削除（一時ファイル）
    rm -f "$CONFIG_DIR/remove.sh"
    rm -f "$GENERATED_POSTINST"
    rm -f "$GENERATED_SETUP"
    rm -f "$CONFIG_DIR"/customfeeds-*.sh
    rm -f "$CONFIG_DIR"/customscripts-*.sh
    rm -f "$CONFIG_DIR/execution_plan.sh"
    rm -f "$CONFIG_DIR"/script_vars_*.txt
    
    # apply後の最新インストール状態を取得
    cache_installed_packages
    
    # インストール済みを初期選択として再生成（owner=system）
    initialize_installed_packages
    
    # apply後の状態を新しいスナップショットとして保存
    cp "$SELECTED_PACKAGES" "$CONFIG_DIR/packages_initial_snapshot.txt"
    cp "$SELECTED_CUSTOM_PACKAGES" "$CONFIG_DIR/custom_packages_initial_snapshot.txt"
    : > "$CONFIG_DIR/lang_packages_initial_snapshot.txt"
	
    clear_selection_cache
}

update_language_packages() {
    local new_lang old_lang
    
    echo "[DEBUG] update_language_packages called" >> "$CONFIG_DIR/debug.log"
    
    new_lang=$(grep "^language=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
    
    echo "[DEBUG] new_lang='$new_lang'" >> "$CONFIG_DIR/debug.log"
    
    [ -z "$new_lang" ] && return 0

    # キャッシュをファイルに書き出し（パイプ処理を回避）
    if [ "$_INSTALLED_PACKAGES_LOADED" -eq 0 ]; then
        cache_installed_packages
        local cache_file="$CONFIG_DIR/installed_packages_cache.txt"
        if [ -f "$cache_file" ]; then
            _INSTALLED_PACKAGES_CACHE=$(cat "$cache_file")
            _INSTALLED_PACKAGES_LOADED=1
        fi
    fi

    # 一時ファイル使用でパイプエラー回避
    local temp_base_pkg="$CONFIG_DIR/temp_base_pkg.txt"
    printf "%s\n" "$_INSTALLED_PACKAGES_CACHE" | grep "^luci-i18n-base-" > "$temp_base_pkg" 2>/dev/null || true

    local base_lang_pkg
    if [ -s "$temp_base_pkg" ]; then
        base_lang_pkg=$(head -1 "$temp_base_pkg")
        old_lang=$(echo "$base_lang_pkg" | sed 's/^luci-i18n-base-//')
    else
        old_lang="en"
    fi
    rm -f "$temp_base_pkg"
    
    echo "[DEBUG] old_lang='$old_lang'" >> "$CONFIG_DIR/debug.log"
    
    [ "$old_lang" = "$new_lang" ] && return 0
    
    # 既存言語パッケージ削除（一時ファイル使用）
    echo "[DEBUG] Removing old language packages for lang=$old_lang" >> "$CONFIG_DIR/debug.log"
    
    local temp_installed="$CONFIG_DIR/temp_installed.txt"
    printf "%s\n" "$_INSTALLED_PACKAGES_CACHE" > "$temp_installed"
    
    while IFS= read -r installed_pkg || [ -n "$installed_pkg" ]; do
        [ -z "$installed_pkg" ] && continue
        
        case "$installed_pkg" in
            luci-i18n-*-${old_lang})
                awk -F= -v pkg="$installed_pkg" '$1 != pkg' "$SELECTED_PACKAGES" > "$SELECTED_PACKAGES.tmp" 2>/dev/null || touch "$SELECTED_PACKAGES.tmp"
                mv "$SELECTED_PACKAGES.tmp" "$SELECTED_PACKAGES"
                echo "[DEBUG] Removed from SELECTED_PACKAGES: $installed_pkg" >> "$CONFIG_DIR/debug.log"
                ;;
        esac
    done < "$temp_installed"
    rm -f "$temp_installed"
    
    # パターン取得
    local exclude_patterns module_patterns language_prefixes
    exclude_patterns=$(get_language_exclude_patterns)
    module_patterns=$(get_language_module_patterns)
    language_prefixes=$(get_language_prefixes)
    
    echo "[DEBUG] Loaded language_exclude_patterns: $exclude_patterns" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG] Loaded language_module_patterns: $module_patterns" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG] Loaded language_prefixes: $language_prefixes" >> "$CONFIG_DIR/debug.log"
    
    # パッケージ収集（一時ファイル使用）
    local temp_all_pkgs="$CONFIG_DIR/temp_all_pkgs.txt"
    : > "$temp_all_pkgs"
    
    # インストール済みから収集
    while IFS= read -r pkg_id || [ -n "$pkg_id" ]; do
        [ -z "$pkg_id" ] && continue
        
        local excluded=0
        for pattern in $exclude_patterns; do
            case "$pkg_id" in
                ${pattern}*) excluded=1; break ;;
            esac
        done
        
        [ "$excluded" -eq 0 ] && echo "$pkg_id" >> "$temp_all_pkgs"
    done < "$CONFIG_DIR/installed_packages_cache.txt"
    
    # 選択済みから収集
    if [ -f "$SELECTED_PACKAGES" ]; then
        while IFS= read -r line || [ -n "$line" ]; do
            [ -z "$line" ] && continue
            local pkg_id=$(echo "$line" | cut -d= -f1)
            
            local excluded=0
            for pattern in $exclude_patterns; do
                case "$pkg_id" in
                    ${pattern}*) excluded=1; break ;;
                esac
            done
            
            if [ "$excluded" -eq 0 ]; then
                grep -qx "$pkg_id" "$temp_all_pkgs" || echo "$pkg_id" >> "$temp_all_pkgs"
            fi
        done < "$SELECTED_PACKAGES"
    fi
    
    echo "[DEBUG] all_packages count=$(wc -l < "$temp_all_pkgs" 2>/dev/null || echo 0)" >> "$CONFIG_DIR/debug.log"
    
    [ "$new_lang" = "en" ] && { rm -f "$temp_all_pkgs"; clear_selection_cache; return 0; }

    # ベースパッケージ追加
    for prefix in $language_prefixes; do
        local base_pkg="${prefix}${new_lang}"
        check_package_available "$base_pkg" "normal" && echo "${base_pkg}=${base_pkg}===" >> "$SELECTED_PACKAGES"
    done

    # 言語パック追加（一時ファイルから読み込み）
    while IFS= read -r pkg || [ -n "$pkg" ]; do
        [ -z "$pkg" ] && continue
        
        local lang_pkg_name=""
        local matched=0
        
        for pattern in $module_patterns; do
            case "$pkg" in
                ${pattern}*)
                    local module_name="${pkg#$pattern}"
                    lang_pkg_name="luci-i18n-${module_name}-${new_lang}"
                    matched=1
                    break
                    ;;
            esac
        done
        
        [ "$matched" -eq 0 ] && lang_pkg_name="luci-i18n-${pkg}-${new_lang}"
        
        echo "[DEBUG] Checking lang_pkg='$lang_pkg_name' for pkg='$pkg'" >> "$CONFIG_DIR/debug.log"
        
        if ! check_package_available "$lang_pkg_name" "normal"; then
            echo "[DEBUG] lang_pkg='$lang_pkg_name' NOT AVAILABLE (skipped)" >> "$CONFIG_DIR/debug.log"
            continue
        fi

        echo "[DEBUG] lang_pkg='$lang_pkg_name' AVAILABLE, adding" >> "$CONFIG_DIR/debug.log"
        
        grep -q "^${lang_pkg_name}=" "$SELECTED_PACKAGES" 2>/dev/null || echo "${lang_pkg_name}=${lang_pkg_name}===" >> "$SELECTED_PACKAGES"
    done < "$temp_all_pkgs"
    
    rm -f "$temp_all_pkgs"
    clear_selection_cache
}

# API値の動的追跡
track_api_value_changes() {
    local cat_id="$1"
    local snapshot_file="$CONFIG_DIR/vars_snapshot_${cat_id}.txt"
    
    echo "[DEBUG] === track_api_value_changes called ===" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG] cat_id=$cat_id" >> "$CONFIG_DIR/debug.log"
    
    # 初回実行時はスナップショットを作成
    if [ ! -f "$snapshot_file" ]; then
        cp "$SETUP_VARS" "$snapshot_file"
        echo "[DEBUG] Created initial snapshot" >> "$CONFIG_DIR/debug.log"
        return 0
    fi
    
    # 変更があった変数をリストアップ
    local changed_vars=""
    while read -r line; do
        case "$line" in
            \#*|'') continue ;;
        esac
        
        local var_name=$(echo "$line" | cut -d= -f1)
        local old_val=$(grep "^${var_name}=" "$snapshot_file" 2>/dev/null | cut -d"'" -f2)
        local new_val=$(grep "^${var_name}=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)
        
        if [ "$old_val" != "$new_val" ]; then
            changed_vars="${changed_vars}${var_name}\n"
            echo "[TRACK] ${var_name}: '$old_val' → '$new_val'" >> "$CONFIG_DIR/debug.log"
        fi
    done < "$SETUP_VARS"
    
    # 変更があった場合、関連パッケージを再評価
    if [ -n "$changed_vars" ]; then
        echo "[TRACK] Re-evaluating packages due to variable changes" >> "$CONFIG_DIR/debug.log"
        # ここで必要に応じて追加処理
    fi
    
    # スナップショットを更新
    cp "$SETUP_VARS" "$snapshot_file"
    echo "[DEBUG] === track_api_value_changes finished ===" >> "$CONFIG_DIR/debug.log"
}

# ========================================
# 言語パッケージの初期化
# システムにインストール済みの言語に基づき、
# 選択されたLuCIパッケージの言語パックを自動追加
# ========================================
initialize_language_packages() {
    debug_log "=== initialize_language_packages called ==="
    
    local installed_lang
    installed_lang=$(echo "$_INSTALLED_PACKAGES_CACHE" | grep "^luci-i18n-base-" | sed 's/^luci-i18n-base-//' | head -1)
    
    if [ -z "$installed_lang" ]; then
        debug_log "No base language package installed, skipping"
        return 0
    fi
    
    debug_log "Detected installed language: $installed_lang"
    
    local patterns
    patterns=$(get_language_module_patterns)
    
    if [ -s "$SELECTED_PACKAGES" ]; then
        while read -r cache_line; do
            [ -z "$cache_line" ] && continue
            
            local pkg_id
            pkg_id=$(echo "$cache_line" | cut -d= -f1)
            
            case "$pkg_id" in
                luci-i18n-*) continue ;;
            esac
            
            local module_name=""
            for pattern in $patterns; do
                case "$pkg_id" in
                    ${pattern}*)
                        module_name="${pkg_id#$pattern}"
                        break
                        ;;
                esac
            done
            
            if [ -n "$module_name" ]; then
                local lang_pkg="luci-i18n-${module_name}-${installed_lang}"
                
                # ★ availability check を追加
                if ! check_package_available "$lang_pkg" "normal"; then
                    debug_log "Language pack not available: $lang_pkg (skipping)"
                    continue
                fi
                
                if ! grep -q "^${lang_pkg}=" "$SELECTED_PACKAGES" 2>/dev/null && \
                   ! grep -q "=${lang_pkg}=" "$SELECTED_PACKAGES" 2>/dev/null; then
                    echo "${lang_pkg}=${lang_pkg}===" >> "$SELECTED_PACKAGES"
                    debug_log "Added LuCI language package: $lang_pkg for $pkg_id"
                fi
            fi
        done < "$SELECTED_PACKAGES"
    fi
    
    debug_log "=== initialize_language_packages finished ==="
}

compute_dslite_aftr() {
    local aftr_type="$1"
    local area="$2"
    local computed
    
    [ -z "$aftr_type" ] && return 1
    
    if [ "$aftr_type" = "transix" ]; then
        [ -z "$area" ] && return 1
        computed=$(jsonfilter -i "$SETUP_JSON" -e "@.constants.aftr_map.${aftr_type}.${area}" 2>/dev/null)
    else
        computed=$(jsonfilter -i "$SETUP_JSON" -e "@.constants.aftr_map.${aftr_type}" 2>/dev/null)
    fi
    
    if [ -n "$computed" ]; then
        echo "$computed"
        return 0
    fi
    
    return 1
}

# =============================================================================
# wget wrapper with IPv6 -> IPv4 fallback
# =============================================================================
# Args:
#   $1 - URL
#   $2 - output file ("-" for stdout)
#   $3 - timeout seconds (default: 10)
# Returns:
#   0 on success, 1 on failure
# =============================================================================
wget_fallback() {
    local url="$1"
    local output="$2"
    local timeout="${3:-10}"
    local wget_opts="-q -T $timeout"
    
    if [ "$output" = "-" ]; then
        wget_opts="$wget_opts -O-"
    else
        wget_opts="$wget_opts -O $output"
    fi
    
    # IPv6優先で試行
    if wget $wget_opts "$url" 2>/dev/null; then
        return 0
    fi
    
    debug_log "wget failed, retrying with IPv4: $url"
    
    # IPv4フォールバック
    if wget -4 $wget_opts "$url" 2>/dev/null; then
        return 0
    fi
    
    debug_log "wget IPv4 fallback also failed: $url"
    return 1
}

check_network_connectivity() {
    if wget_fallback "${BOOTSTRAP_URL}/config.js" "/dev/null" 5; then
        return 0
    fi
    return 1
}

__download_file_core() {
    local url="$1"
    local output_path="$2"
    local cache_buster full_url
    local max_retries=0
    local retry=0
    
    if echo "$url" | grep -q '?'; then
        cache_buster="&_t=$(date +%s)"
    else
        cache_buster="?_t=$(date +%s)"
    fi
    
    full_url="${url}${cache_buster}"
    
    echo "[DEBUG] Downloading: $url" >> "$CONFIG_DIR/debug.log"
    
    while [ $max_retries -eq 0 ] || [ $retry -lt $max_retries ]; do
        if [ $max_retries -eq 0 ]; then
            echo "[DEBUG] Attempt $((retry + 1)): $url" >> "$CONFIG_DIR/debug.log"
        else
            echo "[DEBUG] Attempt $((retry + 1))/$max_retries: $url" >> "$CONFIG_DIR/debug.log"
        fi
        
        if wget_fallback "$full_url" "$output_path" 10; then
            if [ -s "$output_path" ]; then
                echo "[DEBUG] Download successful: $url" >> "$CONFIG_DIR/debug.log"
                return 0
            else
                echo "[DEBUG] Downloaded file is empty: $url" >> "$CONFIG_DIR/debug.log"
            fi
        fi
        
        retry=$((retry + 1))
        [ $max_retries -eq 0 ] || [ $retry -lt $max_retries ] && sleep 1
    done
    
    echo "[ERROR] Failed to download after $max_retries attempts: $url" >> "$CONFIG_DIR/debug.log"
    return 1
}

# File Generation

fetch_cached_template() {
    local url="$1"
    local output_path="$2"
    
    if [ -f "$output_path" ] && [ -s "$output_path" ]; then
        return 0
    fi
    
    __download_file_core "$url" "$output_path"
    return $?
}

prefetch_templates() {
    local pids=""
    local job_count=0
    
    # ヘルパー関数：ジョブ数制御
    wait_if_full() {
        if [ "$job_count" -ge "$MAX_JOBS" ]; then
            wait -n
            job_count=$((job_count - 1))
        fi
    }
    
    # 基本テンプレート
    fetch_cached_template "$POSTINST_TEMPLATE_URL" "$TPL_POSTINST" &
    pids="$pids $!"
    job_count=$((job_count + 1))
    wait_if_full
    
    fetch_cached_template "$SETUP_TEMPLATE_URL" "$TPL_SETUP" &
    pids="$pids $!"
    job_count=$((job_count + 1))
    wait_if_full
    
    # customfeeds のテンプレート
    if [ -f "$CUSTOMFEEDS_JSON" ]; then
        while read -r cat_id; do
            local template_url tpl_custom
            template_url=$(get_customfeed_template_url "$cat_id")
            
            if [ -n "$template_url" ]; then
                tpl_custom="$CONFIG_DIR/tpl_custom_${cat_id}.sh"
                fetch_cached_template "$template_url" "$tpl_custom" &
                pids="$pids $!"
                job_count=$((job_count + 1))
                wait_if_full
            fi
        done <<CATEGORIES
$(get_customfeed_categories)
CATEGORIES
    fi
    
    # customscripts のテンプレート
    if [ -f "$CUSTOMSCRIPTS_JSON" ]; then
        while read -r script_id; do
            local script_file script_url template_path
            script_file=$(get_customscript_file "$script_id")
            [ -z "$script_file" ] && continue
            
            script_url="${BASE_URL}/custom-scripts/${script_file}"
            template_path="$CONFIG_DIR/tpl_customscript_${script_id}.sh"
            
            fetch_cached_template "$script_url" "$template_path" &
            pids="$pids $!"
            job_count=$((job_count + 1))
            wait_if_full
        done <<SCRIPTS
$(get_customscript_all_scripts)
SCRIPTS
    fi
    
    # 残りのジョブを待つ
    if [ -n "$pids" ]; then
        wait $pids
    fi
}

is_customfeed_installed() {
    local pattern="$1"
    local exclude="$2"
    
    # キャッシュから検索（grepパターンマッチ）
    [ "$_INSTALLED_PACKAGES_LOADED" -eq 0 ] && cache_installed_packages
    
    local result
    if [ -n "$exclude" ]; then
        result=$(echo "$_INSTALLED_PACKAGES_CACHE" | grep "^${pattern}" | grep -v "$exclude")
    else
        result=$(echo "$_INSTALLED_PACKAGES_CACHE" | grep "^${pattern}")
    fi
    
    echo "$result"
}

# ========================================
# 削除対象パッケージ検出
# ========================================
detect_packages_to_remove() {
    local remove_list=""
    
    echo "[DEBUG] === detect_packages_to_remove called ===" >> "$CONFIG_DIR/debug.log"

    # 重複追加防止用関数
    add_remove_pkg() {
        local pkg="$1"
        echo "$remove_list" | grep -qx "$pkg" && return
        remove_list="${remove_list}${pkg}
"
    }

    # ----------------------------------------
    # Phase 1: 通常パッケージ判定
    # ----------------------------------------
    if [ -f "$CONFIG_DIR/packages_initial_snapshot.txt" ]; then
        while read -r snapshot_line; do
            [ -z "$snapshot_line" ] && continue
            
            local pkg_id uid is_custom
            pkg_id=$(echo "$snapshot_line" | cut -d= -f1)
            uid=$(echo "$snapshot_line" | cut -d= -f3)
            is_custom=$(echo "$snapshot_line" | cut -d= -f12)
            
            echo "[DEBUG] Snapshot check: pkg=$pkg_id, is_custom=$is_custom" >> "$CONFIG_DIR/debug.log"
            
            # custom feed 管理下は Phase 1 で除外
            [ "$is_custom" = "1" ] && continue
            
            # インストール済みチェック
            is_package_installed "$pkg_id" || continue
            
            # 現在も選択されているかチェック
            local still_selected=0
            if [ -n "$uid" ]; then
                grep -q "=${uid}[=\$]" "$SELECTED_PACKAGES" 2>/dev/null && still_selected=1
            else
                grep -q "^${pkg_id}=" "$SELECTED_PACKAGES" 2>/dev/null && still_selected=1
            fi
            
            # 現在選択されていなければ削除対象
            if [ "$still_selected" -eq 0 ]; then
                add_remove_pkg "$pkg_id"
                echo "[REMOVE] User deselected: $pkg_id" >> "$CONFIG_DIR/debug.log"
            fi
        done < "$CONFIG_DIR/packages_initial_snapshot.txt"
    fi

    # ----------------------------------------
    # Phase 2: 言語パッケージ削除
    # ----------------------------------------
    local new_lang
    new_lang=$(grep "^language=" "$SETUP_VARS" 2>/dev/null | cut -d"'" -f2)

    if [ -n "$new_lang" ] && [ -f "$CONFIG_DIR/lang_packages_initial_snapshot.txt" ]; then
        while read -r pkg; do
            [ -z "$pkg" ] && continue
            
            # 新しい言語のパッケージはスキップ
            echo "$pkg" | grep -q -- "-${new_lang}$" && continue
            
            # 現在も選択されているかチェック
            grep -q "^${pkg}=" "$SELECTED_PACKAGES" 2>/dev/null && continue
            
            add_remove_pkg "$pkg"
            echo "[REMOVE] Marked language pack for removal: $pkg" >> "$CONFIG_DIR/debug.log"
        done < "$CONFIG_DIR/lang_packages_initial_snapshot.txt"
    fi

    # ----------------------------------------
    # Phase 3: カスタムフィード判定
    # ----------------------------------------
    local custom_remove_list=""
    
    if [ -f "$CONFIG_DIR/custom_packages_initial_snapshot.txt" ] && [ -f "$CUSTOMFEEDS_JSON" ]; then
        while read -r snapshot_line; do
            [ -z "$snapshot_line" ] && continue
            
            local pkg_id
            pkg_id=$(echo "$snapshot_line" | cut -d= -f1)
            
            local pattern exclude
            pattern=$(get_customfeed_package_pattern "$pkg_id")
            exclude=$(get_customfeed_package_exclude "$pkg_id")
            
            [ -z "$pattern" ] && continue
            
            local installed_pkgs
            installed_pkgs=$(is_customfeed_installed "$pattern" "$exclude")
            [ -z "$installed_pkgs" ] && continue
            
            # 現在も選択されているかチェック
            if ! grep -q "^${pkg_id}=" "$SELECTED_CUSTOM_PACKAGES" 2>/dev/null; then
                while read -r installed_pkg; do
                    [ -z "$installed_pkg" ] && continue
                    add_remove_pkg "$installed_pkg"
                    custom_remove_list="${custom_remove_list}${pkg_id} "
                    echo "[REMOVE] Custom feed deselected: $installed_pkg (pkg_id=$pkg_id)" >> "$CONFIG_DIR/debug.log"
                done <<EOF
$installed_pkgs
EOF
            fi
        done < "$CONFIG_DIR/custom_packages_initial_snapshot.txt"
    fi
    
    # カスタムフィード削除リストをファイルに保存
    pkg_list_to_command_args "$custom_remove_list" > "$CONFIG_DIR/custom_feed_remove_list.txt"
    
    # 改行区切りで返す（内部処理用）
    pkg_list_clean "$remove_list"
}

# ========================================
# 削除リスト展開（言語パッケージ + 依存関係）
# ========================================
expand_remove_list() {
    local packages="$1"
    local lang_packages=""
    local dep_packages=""
    local result=""
    
    for pkg in $packages; do
        # 1. 言語パッケージ検出
        local base_name=""
        local patterns
        patterns=$(get_language_module_patterns)
        
        for pattern in $patterns; do
            case "$pkg" in
                ${pattern}*)
                    base_name="${pkg#$pattern}"
                    break
                    ;;
            esac
        done
        
        if [ -n "$base_name" ]; then
            # ★修正：package-manager.json の listInstalledCommand を使用
            local found_lang
            found_lang=$(eval "$PKG_LIST_INSTALLED_CMD" 2>/dev/null | grep "^luci-i18n-${base_name}-")
            
            if [ -n "$found_lang" ]; then
                while read -r lang_pkg; do
                    [ -z "$lang_pkg" ] && continue
                    lang_packages="${lang_packages}${lang_pkg}
"
                done <<LANG
$found_lang
LANG
                echo "[DEBUG] Found lang package for $pkg: $found_lang" >> "$CONFIG_DIR/debug.log"
            fi
        fi
        
        # 2. 依存パッケージ（opkgのみ、JSONから取得したコマンドを使用）
        if [ "$PKG_MGR" = "opkg" ]; then
            local deps_cmd
            deps_cmd=$(expand_template "$PKG_DEPENDS_CMD" "package" "$pkg")
            
            local deps
            deps=$(eval "$deps_cmd" 2>/dev/null)
            
            for dep in $deps; do
                # システムパッケージ除外（JSONから取得したリスト）
                local is_system=0
                for sys_pkg in $PKG_SYSTEM_PACKAGES; do
                    case "$dep" in
                        ${sys_pkg}*) is_system=1; break ;;
                    esac
                done
                
                [ "$is_system" -eq 1 ] && continue
                
                # インストール済みチェック
                is_package_installed "$dep" || continue
                
                # 他のパッケージに依存されているかチェック
                local what_depends_cmd
                what_depends_cmd=$(expand_template "$PKG_WHATDEPENDS_CMD" "package" "$dep")
                
                local dependents
                dependents=$(eval "$what_depends_cmd" 2>/dev/null)
                
                local other_depends=0
                for dependent in $dependents; do
                    case " $packages " in
                        *" $dependent "*) ;;
                        *) other_depends=1; break ;;
                    esac
                done
                
                if [ "$other_depends" -eq 0 ]; then
                    dep_packages="${dep_packages}${dep}
"
                    echo "[DEBUG] Found removable dependency for $pkg: $dep" >> "$CONFIG_DIR/debug.log"
                fi
            done
        fi
        
        result="${result}${pkg}
"
    done
    
    # 順序: 言語パッケージ → 本体 → 依存パッケージ（改行区切り）
    pkg_list_merge "$lang_packages" "$result" "$dep_packages"
}

# ========================================
# 削除スクリプト生成
# ========================================
generate_remove_script() {
    local packages_to_remove="$1"
    local output_file="$CONFIG_DIR/remove.sh"
    
    [ -z "$packages_to_remove" ] && {
        echo "[DEBUG] No packages to remove" >> "$CONFIG_DIR/debug.log"
        return 0
    }
    
    echo "[DEBUG] Original packages to remove: $packages_to_remove" >> "$CONFIG_DIR/debug.log"
    
    # 言語パッケージと依存関係を展開
    local expanded_packages
    expanded_packages=$(expand_remove_list "$packages_to_remove")
    
    echo "[DEBUG] Expanded packages (newline): $expanded_packages" >> "$CONFIG_DIR/debug.log"
    
    # コマンド引数用にスペース区切りに変換
    local cmd_args
    cmd_args=$(pkg_list_to_command_args "$expanded_packages")
    
    echo "[DEBUG] Command args (space): $cmd_args" >> "$CONFIG_DIR/debug.log"
    
    local remove_cmd
    remove_cmd=$(expand_template "$PKG_REMOVE_CMD_TEMPLATE" "package" "$cmd_args")
    
    cat > "$output_file" <<'REMOVE_EOF'
#!/bin/sh
# Auto-generated package removal script
echo "========================================="
echo "Removing unselected packages..."
echo "========================================="
echo ""
REMOVE_EOF
    
    echo "${remove_cmd}" >> "$output_file"
    
    cat >> "$output_file" <<'REMOVE_EOF'
echo ""
echo "========================================="
echo "Package removal completed."
echo "========================================="
REMOVE_EOF
    
    chmod +x "$output_file"
    echo "[DEBUG] Remove script generated: $output_file" >> "$CONFIG_DIR/debug.log"
}

generate_files() {
    local pkgs selected_pkgs cat_id template_url api_url download_url pkg_id pattern
    local tpl_custom enable_var
    local script_id script_file template_path script_url
    local temp_enablevars="$CONFIG_DIR/temp_enablevars.txt"

    : > "$temp_enablevars"
    
    # ========================================
    # Phase 1: インストール対象パッケージの抽出（現在のインストール状態との比較）
    # ========================================
    local install_packages_content=""
    local packages_to_install=""
    
    if [ -s "$SELECTED_PACKAGES" ]; then
        # 現在インストールされているパッケージキャッシュをロード
        [ "$_INSTALLED_PACKAGES_LOADED" -eq 0 ] && cache_installed_packages
        
        # 新規インストール対象パッケージの抽出
        while read -r cache_line; do
            [ -z "$cache_line" ] && continue
            
            local pkg_id uid
            pkg_id=$(echo "$cache_line" | cut -d= -f1)
            uid=$(echo "$cache_line" | cut -d= -f3)
            
            # 現在インストールされているかチェック
            if ! is_package_installed "$pkg_id"; then
                packages_to_install="${packages_to_install}${cache_line}
"
                echo "[INFO] New install: $pkg_id" >> "$CONFIG_DIR/debug.log"
            else
                echo "[INFO] Skipping already installed: $pkg_id" >> "$CONFIG_DIR/debug.log"
            fi
        done < "$SELECTED_PACKAGES"
        
        # enableVar処理（新規インストール対象パッケージのみ）
        if [ -n "$packages_to_install" ]; then
            while read -r cache_line; do
                [ -z "$cache_line" ] && continue
                
                local pkg_id unique_id enable_var
                pkg_id=$(echo "$cache_line" | cut -d= -f1)
                unique_id=$(echo "$cache_line" | cut -d= -f3)
                
                enable_var=$(get_package_enablevar "$pkg_id" "$unique_id")
                
                if [ -n "$enable_var" ] && ! grep -q "^${enable_var}=" "$SETUP_VARS" 2>/dev/null; then
                    echo "${enable_var}='1'" >> "$temp_enablevars"
                fi
            done <<EOF
$packages_to_install
EOF
            
            [ -s "$temp_enablevars" ] && cat "$temp_enablevars" >> "$SETUP_VARS"
        fi
        
        install_packages_content="$packages_to_install"
    fi
    rm -f "$temp_enablevars"
    
    # ========================================
    # Phase 2: postinst.sh生成（未インストールパッケージのみ）
    # ========================================
    fetch_cached_template "$POSTINST_TEMPLATE_URL" "$TPL_POSTINST"
    
    if [ -f "$TPL_POSTINST" ]; then
        if [ -n "$install_packages_content" ]; then
            local id_opts_list=""
            
            while IFS='=' read -r pkg_id _name _unique install_opts _enablevar; do
                [ -z "$pkg_id" ] && continue
                
                local install_opts_value=""
                if [ -n "$install_opts" ]; then
                    install_opts_value=$(convert_install_option "$install_opts")
                fi
                
                id_opts_list="${id_opts_list}${pkg_id}|${install_opts_value}
"
            done <<EOF
$install_packages_content
EOF
            
            local final_list=""
            local processed_ids=""
            
            while IFS='|' read -r current_id current_opts; do
                [ -z "$current_id" ] && continue
                
                case "$processed_ids" in
                    *"${current_id}"*) continue ;;
                esac
                
                local same_id_lines
                same_id_lines=$(echo "$id_opts_list" | grep "^${current_id}|")
                local count
                count=$(echo "$same_id_lines" | grep -c "^${current_id}|")
                
                if [ "$count" -gt 1 ]; then
                    local no_opts_line
                    no_opts_line=$(echo "$same_id_lines" | grep "^${current_id}|$" | head -1)
                    
                    if [ -n "$no_opts_line" ]; then
                        final_list="${final_list}${current_id}
"
                    else
                        local has_opts_line opts_value
                        has_opts_line=$(echo "$same_id_lines" | grep "|.\+$" | head -1)
                        
                        if [ -n "$has_opts_line" ]; then
                            opts_value="${has_opts_line#*|}"
                            final_list="${final_list}${opts_value} ${current_id}
"
                        else
                            final_list="${final_list}${current_id}
"
                        fi
                    fi
                else
                    if [ -n "$current_opts" ]; then
                        final_list="${final_list}${current_opts} ${current_id}
"
                    else
                        final_list="${final_list}${current_id}
"
                    fi
                fi
                
                processed_ids="${processed_ids}${current_id}
"
            done <<IDOPTS
$(echo "$id_opts_list" | awk -F'|' 'NF==2 {print $1 "|" $2}')
IDOPTS
            
            local install_cmd=""
            pkgs=$(echo "$final_list" | xargs)
            
            if [ -n "$pkgs" ]; then
                install_cmd=$(expand_template "$PKG_INSTALL_CMD_TEMPLATE" "package" "$pkgs")
                # allowUntrustedプレースホルダーを削除
                install_cmd=$(echo "$install_cmd" | sed 's/{allowUntrusted}//g' | sed 's/  */ /g')
            fi
        else
            pkgs=""
            install_cmd=""
        fi
        
        awk -v install_cmd="$install_cmd" '
            /^# BEGIN_VARIABLE_DEFINITIONS/ {
                print
                print "INSTALL_CMD=\"" install_cmd "\""
                skip=1
                next
            }
            /^# END_VARIABLE_DEFINITIONS/ {
                skip=0
            }
            !skip
        ' "$TPL_POSTINST" > "$GENERATED_POSTINST"
        
        chmod +x "$GENERATED_POSTINST"
    fi
    
    # ========================================
    # Phase 3: setup.sh生成
    # ========================================
    fetch_cached_template "$SETUP_TEMPLATE_URL" "$TPL_SETUP"
    
    if [ -f "$TPL_SETUP" ]; then
        awk '
            /^# BEGIN_VARS/ {
                print
                if (vars_file != "") {
                    while ((getline line < vars_file) > 0) {
                        print line
                    }
                    close(vars_file)
                }
                skip=1
                next
            }
            /^# END_VARS/ {
                skip=0
            }
            !skip
        ' vars_file="$SETUP_VARS" "$TPL_SETUP" > "$GENERATED_SETUP"
        
        chmod +x "$GENERATED_SETUP"
    fi
    
# ========================================
# Phase 4: customfeedsスクリプト生成（並列）
# ========================================
if [ -f "$CUSTOMFEEDS_JSON" ]; then
    local pids=""
    local categories_list
    categories_list=$(get_customfeed_categories)
    
    # 初期スナップショットをロード
    local initial_custom=""
    if [ -f "$CONFIG_DIR/custom_packages_initial_snapshot.txt" ]; then
        initial_custom=$(cat "$CONFIG_DIR/custom_packages_initial_snapshot.txt")
    fi
    
    local category_packages=""
    while read -r cat_id; do
        local packages_for_cat
        packages_for_cat=$(get_category_packages "$cat_id")
        
        local selected_patterns=""
        while read -r pkg_id; do
            # 選択されているかチェック
            if ! grep -q "^${pkg_id}=" "$SELECTED_CUSTOM_PACKAGES" 2>/dev/null; then
                continue
            fi
            
            # スナップショットに存在しない = 新規インストール対象
            local in_snapshot=0
            if [ -n "$initial_custom" ]; then
                if echo "$initial_custom" | grep -q "^${pkg_id}="; then
                    in_snapshot=1
                fi
            fi
            
			# 新規インストール対象のみ追加
            if [ "$in_snapshot" -eq 0 ]; then
                local pattern exclude enable_service restart_service pkg_entry
                pattern=$(get_customfeed_package_pattern "$pkg_id")
                exclude=$(get_customfeed_package_exclude "$pkg_id")
                enable_service=$(get_customfeed_package_enable_service "$pkg_id")
                restart_service=$(get_customfeed_package_restart_service "$pkg_id")
                
                # Format: pattern:exclude:filename:enable_service:restart_service
                pkg_entry="${pattern}:${exclude}::${enable_service}:${restart_service}"
                selected_patterns="${selected_patterns}${pkg_entry} "
                echo "[INFO] Custom feed to install: $pkg_id (entry: $pkg_entry)" >> "$CONFIG_DIR/debug.log"
            else
                echo "[INFO] Skipping already installed custom feed: $pkg_id" >> "$CONFIG_DIR/debug.log"
            fi
        done <<EOF2
$packages_for_cat
EOF2
        
        category_packages="${category_packages}${cat_id}|${selected_patterns}
"
    done <<EOF3
$categories_list
EOF3

        local failed_pids=""
        while read -r cat_entry; do
            [ -z "$cat_entry" ] && continue
            
            (
                IFS='|' read -r cat_id selected_pkgs <<CATEOF
$cat_entry
CATEOF
                selected_pkgs=$(echo "$selected_pkgs" | sed 's/ $//')

                if [ -z "$selected_pkgs" ]; then
                    echo "[DEBUG] No packages selected for $cat_id, skipping script generation" >> "$CONFIG_DIR/debug.log"
                    exit 0
                fi
        
                template_url=$(get_customfeed_template_url "$cat_id")
                
                [ -z "$template_url" ] && exit 0
                
                tpl_custom="$CONFIG_DIR/tpl_custom_${cat_id}.sh"
                
                fetch_cached_template "$template_url" "$tpl_custom"
                
                [ ! -f "$tpl_custom" ] && exit 0
                
                api_url=$(get_customfeed_api_base "$cat_id")
                download_url=$(get_customfeed_download_base "$cat_id")
                
                awk -v packages="$selected_pkgs" \
                    -v api="$api_url" \
                    -v download="$download_url" '
                    /^# BEGIN_VARIABLE_DEFINITIONS/ {
                        print
                        print "PACKAGES=\"" packages "\""
                        print "API_URL=\"" api "\""
                        print "DOWNLOAD_BASE_URL=\"" download "\""
                        print "RUN_OPKG_UPDATE=\"0\""
                        skip=1
                        next
                    }
                    /^# END_VARIABLE_DEFINITIONS/ {
                        skip=0
                    }
                    !skip
                ' "$tpl_custom" > "$CONFIG_DIR/customfeeds-${cat_id}.sh"
                
                chmod +x "$CONFIG_DIR/customfeeds-${cat_id}.sh"
            ) &
            pids="$pids $!"
        done <<EOF4
$category_packages
EOF4
        
        for pid in $pids; do
            if ! wait $pid; then
                failed_pids="$failed_pids $pid"
            fi
        done
        
        if [ -n "$failed_pids" ]; then
            echo "[WARNING] Some customfeeds scripts failed to generate (PIDs:$failed_pids)" >> "$CONFIG_DIR/debug.log"
        fi
        
        echo "[DEBUG] customfeeds generation completed in parallel" >> "$CONFIG_DIR/debug.log"
    else
        {
            echo "#!/bin/sh"
            echo "# No custom feeds configured"
            echo "exit 0"
        } > "$CONFIG_DIR/customfeeds-none.sh"
        chmod +x "$CONFIG_DIR/customfeeds-none.sh"
    fi

	# ========================================
    # Phase 5: customscriptsスクリプト生成
    # ========================================
    if [ -f "$CUSTOMSCRIPTS_JSON" ]; then
        while read -r script_id; do
            [ ! -f "$CONFIG_DIR/script_vars_${script_id}.txt" ] && continue
            
            script_file=$(get_customscript_file "$script_id")
            [ -z "$script_file" ] && continue

            script_url="${BASE_URL}/custom-scripts/${script_file}"
            template_path="$CONFIG_DIR/tpl_customscript_${script_id}.sh"
        
            if [ -f "$template_path" ]; then
                {
                    awk '
                        /^# BEGIN_VARIABLE_DEFINITIONS/ {
                            print
                            if (vars_file != "") {
                                while ((getline line < vars_file) > 0) {
                                    print line
                                }
                                close(vars_file)
                            }
                            skip=1
                            next
                        }
                        /^# END_VARIABLE_DEFINITIONS/ {
                            skip=0
                        }
                        !skip
                    ' vars_file="$CONFIG_DIR/script_vars_${script_id}.txt" "$template_path"
                
                    echo ""
					echo "${script_id}_main -t"
                } > "$CONFIG_DIR/customscripts-${script_id}.sh"
            
                chmod +x "$CONFIG_DIR/customscripts-${script_id}.sh"
            fi
        done <<SCRIPTS
$(get_customscript_all_scripts)
SCRIPTS
    
        echo "[DEBUG] customscripts generation completed" >> "$CONFIG_DIR/debug.log"
    fi

    # ========================================
    # Phase 6: 削除対象パッケージの検出と削除スクリプト生成
    # ========================================
    local packages_to_remove=$(detect_packages_to_remove)
    
    if [ -n "$packages_to_remove" ]; then
        generate_remove_script "$packages_to_remove"
    else
        echo "[DEBUG] No packages to remove" >> "$CONFIG_DIR/debug.log"
    fi

    # ========================================
    # Phase 7: 実行計画ファイルの生成
    # ========================================
    generate_execution_plan

    # キャッシュクリア
    clear_selection_cache
}

# ========================================
# Phase 7: 実行計画ファイルの生成
# ========================================
generate_execution_plan() {
    local plan_file="$CONFIG_DIR/execution_plan.sh"
    
    local has_remove=0
    local has_install=0
    local has_customfeeds=0
    local has_setup=0
    local has_customscripts=0
    local needs_update=0
    
    # 削除対象チェック
    if [ -f "$CONFIG_DIR/remove.sh" ] && [ -s "$CONFIG_DIR/remove.sh" ]; then
        has_remove=1
        echo "[PLAN] has_remove=1" >> "$CONFIG_DIR/debug.log"
    fi
    
    # インストール対象チェック（postinst.sh の INSTALL_CMD）
    if [ -f "$GENERATED_POSTINST" ]; then
        local install_cmd
        install_cmd=$(grep '^INSTALL_CMD=' "$GENERATED_POSTINST" 2>/dev/null | cut -d'"' -f2)
        if [ -n "$install_cmd" ]; then
            has_install=1
            needs_update=1
            echo "[PLAN] has_install=1 (INSTALL_CMD=$install_cmd)" >> "$CONFIG_DIR/debug.log"
        fi
    fi
    
    # カスタムフィードチェック（customfeeds-*.sh の PACKAGES）
    for script in "$CONFIG_DIR"/customfeeds-*.sh; do
        [ -f "$script" ] || continue
        [ "$(basename "$script")" = "customfeeds-none.sh" ] && continue
        
        local packages_value
        packages_value=$(grep '^PACKAGES=' "$script" 2>/dev/null | cut -d'"' -f2)
        if [ -n "$packages_value" ]; then
            has_customfeeds=1
            needs_update=1
            echo "[PLAN] has_customfeeds=1 ($(basename "$script"): $packages_value)" >> "$CONFIG_DIR/debug.log"
            break
        fi
    done
    
    # 設定チェック（SETUP_VARS が空でないか）
    if [ -f "$SETUP_VARS" ] && [ -s "$SETUP_VARS" ]; then
        has_setup=1
        echo "[PLAN] has_setup=1" >> "$CONFIG_DIR/debug.log"
    fi
    
    # カスタムスクリプトチェック（script_vars_*.txt が存在するか）
    for var_file in "$CONFIG_DIR"/script_vars_*.txt; do
        if [ -f "$var_file" ]; then
            has_customscripts=1
            echo "[PLAN] has_customscripts=1 ($(basename "$var_file"))" >> "$CONFIG_DIR/debug.log"
            break
        fi
    done
    
    # 実行計画ファイル出力
    cat > "$plan_file" <<PLAN_EOF
# Execution Plan - Auto-generated
HAS_REMOVE=$has_remove
HAS_INSTALL=$has_install
HAS_CUSTOMFEEDS=$has_customfeeds
HAS_SETUP=$has_setup
HAS_CUSTOMSCRIPTS=$has_customscripts
NEEDS_UPDATE=$needs_update
PLAN_EOF
    
    echo "[PLAN] Execution plan generated: $plan_file" >> "$CONFIG_DIR/debug.log"
}

generate_config_summary() {
    local summary_file="$CONFIG_DIR/config_summary_light.txt"
    local tr_packages tr_customfeeds tr_variables tr_customscripts
    local has_content=0
    
    tr_packages=$(translate "tr-tui-summary-packages")
    tr_customfeeds=$(translate "tr-tui-summary-customfeeds")
    tr_variables=$(translate "tr-tui-summary-variables")
    tr_customscripts=$(translate "tr-tui-summary-customscripts")
    
    {
        [ "$_INSTALLED_PACKAGES_LOADED" -eq 0 ] && cache_installed_packages
        
        # ========================================
        # パッケージ変更（削除 + 追加）
        # ========================================
        local packages_to_remove=$(detect_packages_to_remove)
        local install_list=""
        local remove_list=""
        local package_header_printed=0
        
        local custom_feed_pkgs=""
        if [ -f "$CUSTOMFEEDS_JSON" ]; then
            for cat_id in $(get_customfeed_categories); do
                for pkg_id in $(get_category_packages "$cat_id"); do
                    local pattern exclude installed_pkgs
                    pattern=$(get_customfeed_package_pattern "$pkg_id")
                    exclude=$(get_customfeed_package_exclude "$pkg_id")
                    
                    [ -z "$pattern" ] && continue
                    
                    installed_pkgs=$(is_customfeed_installed "$pattern" "$exclude")
                    
                    if [ -n "$installed_pkgs" ]; then
                        while read -r installed_pkg; do
                            [ -z "$installed_pkg" ] && continue
                            custom_feed_pkgs="${custom_feed_pkgs}${installed_pkg}
"
                        done <<EOF
$installed_pkgs
EOF
                    fi
                done
            done
        fi
        
        # 削除リスト構築
        if [ -n "$packages_to_remove" ]; then
            for pkg in $packages_to_remove; do
                local is_custom
                is_custom=$(grep "^${pkg}=" "$CONFIG_DIR/packages_initial_snapshot.txt" 2>/dev/null | cut -d= -f12)
                
                if [ -z "$is_custom" ] && grep -q "^${pkg}=" "$CONFIG_DIR/custom_packages_initial_snapshot.txt" 2>/dev/null; then
                    is_custom="1"
                fi
                
                [ "$is_custom" = "1" ] && continue
                
                remove_list="${remove_list}${pkg}
"
            done
        fi
        
        # インストールリスト構築
        if [ -f "$SELECTED_PACKAGES" ] && [ -s "$SELECTED_PACKAGES" ]; then
            while read -r cache_line; do
                [ -z "$cache_line" ] && continue
                
                local pkg_id uid
                pkg_id=$(echo "$cache_line" | cut -d= -f1)
                uid=$(echo "$cache_line" | cut -d= -f3)
                
                if ! is_package_installed "$pkg_id"; then
                    install_list="${install_list}${pkg_id}
"
                fi
            done < "$SELECTED_PACKAGES"
        fi
        
        # ヘッダー出力とリスト出力
        if [ -n "$remove_list" ]; then
            if [ "$package_header_printed" -eq 0 ]; then
                printf "🔵 %s\n\n" "$tr_packages"
                package_header_printed=1
            fi
            while read -r pkg; do
                [ -z "$pkg" ] && continue
                printf "remove %s\n" "$pkg"
            done <<EOF
$remove_list
EOF
        fi
        
        if [ -n "$install_list" ]; then
            if [ "$package_header_printed" -eq 0 ]; then
                printf "🔵 %s\n\n" "$tr_packages"
                package_header_printed=1
            fi
            while read -r pkg; do
                [ -z "$pkg" ] && continue
                printf "install %s\n" "$pkg"
            done <<EOF
$install_list
EOF
        fi
        
        [ "$package_header_printed" -eq 1 ] && { echo ""; has_content=1; }
        
        # ========================================
        # カスタムフィード変更（削除 + 追加）
        # ========================================
        local custom_install=""
        local custom_remove=""
        local customfeed_header_printed=0
        
        if [ -f "$CUSTOMFEEDS_JSON" ]; then
            for cat_id in $(get_customfeed_categories); do
                for pkg_id in $(get_category_packages "$cat_id"); do
                    local pattern exclude installed_pkgs
                    pattern=$(get_customfeed_package_pattern "$pkg_id")
                    exclude=$(get_customfeed_package_exclude "$pkg_id")
                    
                    [ -z "$pattern" ] && continue
                    
                    installed_pkgs=$(is_customfeed_installed "$pattern" "$exclude")
                    
                    [ -z "$installed_pkgs" ] && continue
                    
                    if ! grep -q "^${pkg_id}=" "$SELECTED_CUSTOM_PACKAGES" 2>/dev/null; then
                        custom_remove="${custom_remove}${pkg_id}
"
                    fi
                done
            done
        fi
        
        if [ -f "$SELECTED_CUSTOM_PACKAGES" ] && [ -s "$SELECTED_CUSTOM_PACKAGES" ]; then
            while read -r cache_line; do
                [ -z "$cache_line" ] && continue
                
                local pkg_id pattern exclude installed_pkgs
                pkg_id=$(echo "$cache_line" | cut -d= -f1)
                pattern=$(get_customfeed_package_pattern "$pkg_id")
                exclude=$(get_customfeed_package_exclude "$pkg_id")
                
                [ -z "$pattern" ] && continue
                
                installed_pkgs=$(is_customfeed_installed "$pattern" "$exclude")
                
                if [ -z "$installed_pkgs" ]; then
                    custom_install="${custom_install}${pkg_id}
"
                fi
            done < "$SELECTED_CUSTOM_PACKAGES"
        fi
        
        # ヘッダー出力とリスト出力
        if [ -n "$custom_remove" ]; then
            if [ "$customfeed_header_printed" -eq 0 ]; then
                printf "🟢 %s\n\n" "$tr_customfeeds"
                customfeed_header_printed=1
            fi
            while read -r pkg; do
                [ -z "$pkg" ] && continue
                printf "remove %s\n" "$pkg"
            done <<EOF
$custom_remove
EOF
        fi
        
        if [ -n "$custom_install" ]; then
            if [ "$customfeed_header_printed" -eq 0 ]; then
                printf "🟢 %s\n\n" "$tr_customfeeds"
                customfeed_header_printed=1
            fi
            while read -r pkg; do
                [ -z "$pkg" ] && continue
                printf "install %s\n" "$pkg"
            done <<EOF
$custom_install
EOF
        fi
        
        [ "$customfeed_header_printed" -eq 1 ] && { echo ""; has_content=1; }
        
        # ========================================
        # 設定変数
        # ========================================
        if [ -f "$SETUP_VARS" ] && [ -s "$SETUP_VARS" ]; then
            printf "🟡 %s\n\n" "$tr_variables"
            cat "$SETUP_VARS"
            echo ""
            has_content=1
        fi
        
        # ========================================
        # カスタムスクリプト
        # ======================================== 
        local customscript_header_printed=0
        for var_file in "$CONFIG_DIR"/script_vars_*.txt; do
            [ -f "$var_file" ] || continue
            
            local script_id script_name
            script_id=$(basename "$var_file" | sed 's/^script_vars_//;s/\.txt$//')
            
            # CONFIRMEDがない場合はスキップ
            grep -q "^CONFIRMED=" "$var_file" 2>/dev/null || continue
            
            # 選択状態とインストール状態を比較
            local installed=0
            local confirmed=0
            is_script_installed "$script_id" && installed=1
            grep -q "^CONFIRMED='1'$" "$var_file" 2>/dev/null && confirmed=1
            
            # 差分がない場合はスキップ
            [ "$installed" -eq "$confirmed" ] && continue
            
            script_name=$(get_customscript_name "$script_id")
            [ -z "$script_name" ] && script_name="$script_id"
            
            # ヘッダーを1回だけ出力
            if [ "$customscript_header_printed" -eq 0 ]; then
                printf "🔴 %s\n\n" "$tr_customscripts"
                customscript_header_printed=1
            fi
            
            # アクション表示: remove/install (スクリプトIDを使用)
            if [ "$confirmed" -eq 1 ] && [ "$installed" -eq 0 ]; then
                printf "install %s\n\n" "$script_id"
            elif [ "$confirmed" -eq 0 ] && [ "$installed" -eq 1 ]; then
                printf "remove %s\n\n" "$script_id"
            fi
            
            # 設定変数を出力（SELECTED_OPTION と CONFIRMED 以外）
            grep -Ev "^(SELECTED_OPTION|CONFIRMED)=" "$var_file"
            echo ""
            
            has_content=1
        done
        
        [ "$customscript_header_printed" -eq 1 ] && echo ""
        
        if [ "$has_content" -eq 0 ]; then
            echo "$(translate 'tr-tui-no-config')"
        fi
    } > "$summary_file"
    
    echo "$summary_file"
}

update_package_manager() {
    local needs_update=0
    
    # execution_plan.sh から HAS_INSTALL/HAS_CUSTOMFEEDS を読み込む
    local plan_file="$CONFIG_DIR/execution_plan.sh"
    if [ -f "$plan_file" ]; then
        . "$plan_file"
        
        # インストールがない場合はupdateも不要
        if [ "$HAS_INSTALL" -eq 0 ] && [ "$HAS_CUSTOMFEEDS" -eq 0 ]; then
            echo "[DEBUG] No installations planned, skipping update" >> "$CONFIG_DIR/debug.log"
            return 0
        fi
    fi
    
    # 1. postinst.json - 選択済みパッケージがある場合のみチェック
    if [ "$needs_update" -eq 0 ] && [ -s "$SELECTED_PACKAGES" ]; then
        # ファイルレベル
        local update=$(jsonfilter -i "$PACKAGES_JSON" -e "@.requiresUpdate" 2>/dev/null)
        [ "$update" = "true" ] && needs_update=1
        
        # カテゴリ/アイテムレベル
        if [ "$needs_update" -eq 0 ]; then
            while read -r line; do
                local id=$(echo "$line" | cut -d= -f1)
                
                local update=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.packages[*].id='$id'].requiresUpdate" 2>/dev/null | head -1)
                [ "$update" = "true" ] && needs_update=1 && break
                
                update=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[*].packages[@.id='$id'].requiresUpdate" 2>/dev/null | head -1)
                [ "$update" = "true" ] && needs_update=1 && break
            done < "$SELECTED_PACKAGES"
        fi
    fi
    
    # 2. customfeeds.json - 選択済みカスタムパッケージがある場合のみチェック
    if [ "$needs_update" -eq 0 ] && [ -s "$SELECTED_CUSTOM_PACKAGES" ]; then
        # ファイルレベル
        local update=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.requiresUpdate" 2>/dev/null)
        [ "$update" = "true" ] && needs_update=1
        
        # カテゴリ/アイテムレベル
        if [ "$needs_update" -eq 0 ]; then
            while read -r line; do
                local id=$(echo "$line" | cut -d= -f1)
                
                local update=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.packages[*].id='$id'].requiresUpdate" 2>/dev/null | head -1)
                [ "$update" = "true" ] && needs_update=1 && break
                
                update=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[*].packages[@.id='$id'].requiresUpdate" 2>/dev/null | head -1)
                [ "$update" = "true" ] && needs_update=1 && break
            done < "$SELECTED_CUSTOM_PACKAGES"
        fi
    fi
    
    # 3. customscripts.json - 実行予定スクリプトがある場合のみチェック
    if [ "$needs_update" -eq 0 ]; then
        for var_file in "$CONFIG_DIR"/script_vars_*.txt; do
            [ -f "$var_file" ] || continue
            local script_id=$(basename "$var_file" | sed 's/^script_vars_//;s/\.txt$//')
            
            # スクリプトレベル
            local update=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].requiresUpdate" 2>/dev/null | head -1)
            [ "$update" = "true" ] && needs_update=1 && break
            
            # オプションレベル
            local option=$(grep "^SELECTED_OPTION=" "$var_file" 2>/dev/null | cut -d"'" -f2)
            [ -n "$option" ] && {
                update=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[@.id='$option'].requiresUpdate" 2>/dev/null | head -1)
                [ "$update" = "true" ] && needs_update=1 && break
            }
        done
    fi
    
    # 更新実行
    if [ "$needs_update" -eq 1 ]; then
        echo "Updating package database..."
        case "$PKG_MGR" in
            opkg) opkg update || return 1 ;;
            apk) apk update || return 1 ;;
        esac
    fi
}

needs_reboot_check() {
    local needs_reboot=0
    
    # Setup.json の変更チェック
    
    if [ -s "$SETUP_VARS" ]; then
        # ファイルレベルの reboot フラグ
        local file_reboot
        file_reboot=$(jsonfilter -i "$SETUP_JSON" -e "@.reboot" 2>/dev/null)
        if [ "$file_reboot" = "true" ]; then
            needs_reboot=1
        fi
        
        # カテゴリレベル/項目レベルのチェック（ファイルレベルがfalseの場合）
        if [ "$needs_reboot" -eq 0 ]; then
            while read -r line; do
                # コメント行と空行をスキップ
                case "$line" in
                    \#*|'') continue ;;
                esac
                
                local var_name
                var_name=$(echo "$line" | cut -d= -f1)
                
                # カテゴリレベルの reboot フラグをチェック
                local cat_reboot
                cat_reboot=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[@.items[*].variable='$var_name'].reboot" 2>/dev/null | head -1)
                if [ "$cat_reboot" = "true" ]; then
                    needs_reboot=1
                    break
                fi
                
                # 項目レベル（トップレベル）の reboot フラグ
                local item_reboot
                item_reboot=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[@.variable='$var_name'].reboot" 2>/dev/null | head -1)
                if [ "$item_reboot" = "true" ]; then
                    needs_reboot=1
                    break
                fi
                
                # 項目レベル（section内）の reboot フラグ
                if [ -z "$item_reboot" ] || [ "$item_reboot" = "null" ]; then
                    item_reboot=$(jsonfilter -i "$SETUP_JSON" -e "@.categories[*].items[*].items[@.variable='$var_name'].reboot" 2>/dev/null | head -1)
                    if [ "$item_reboot" = "true" ]; then
                        needs_reboot=1
                        break
                    fi
                fi
            done < "$SETUP_VARS"
        fi
    fi
    
    # postinst.json のパッケージチェック

    if [ "$needs_reboot" -eq 0 ] && [ -s "$SELECTED_PACKAGES" ]; then
        # ファイルレベルの reboot フラグ
        local file_reboot
        file_reboot=$(jsonfilter -i "$PACKAGES_JSON" -e "@.reboot" 2>/dev/null)
        if [ "$file_reboot" = "true" ]; then
            needs_reboot=1
        fi
        
        # カテゴリレベル/項目レベルのチェック
        if [ "$needs_reboot" -eq 0 ]; then
            while read -r pkg_id; do
                # カテゴリレベルの reboot フラグ
                local cat_reboot
                cat_reboot=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[@.packages[*].id='$pkg_id'].reboot" 2>/dev/null | head -1)
                if [ "$cat_reboot" = "true" ]; then
                    needs_reboot=1
                    break
                fi
                
                # 項目レベルの reboot フラグ
                local pkg_reboot
                pkg_reboot=$(jsonfilter -i "$PACKAGES_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].reboot" 2>/dev/null | head -1)
                if [ "$pkg_reboot" = "true" ]; then
                    needs_reboot=1
                    break
                fi
            done < "$SELECTED_PACKAGES"
        fi
    fi
    
    # customfeeds.json のパッケージチェック

    if [ "$needs_reboot" -eq 0 ] && [ -s "$SELECTED_CUSTOM_PACKAGES" ]; then
        # ファイルレベルの reboot フラグ
        local file_reboot
        file_reboot=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.reboot" 2>/dev/null)
        if [ "$file_reboot" = "true" ]; then
            needs_reboot=1
        fi
        
        # カテゴリレベル/項目レベルのチェック
        if [ "$needs_reboot" -eq 0 ]; then
            while read -r pkg_id; do
                # カテゴリレベルの reboot フラグ
                local cat_reboot
                cat_reboot=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[@.packages[*].id='$pkg_id'].reboot" 2>/dev/null | head -1)
                if [ "$cat_reboot" = "true" ]; then
                    needs_reboot=1
                    break
                fi
                
                # 項目レベルの reboot フラグ
                local pkg_reboot
                pkg_reboot=$(jsonfilter -i "$CUSTOMFEEDS_JSON" -e "@.categories[*].packages[@.id='$pkg_id'].reboot" 2>/dev/null | head -1)
                if [ "$pkg_reboot" = "true" ]; then
                    needs_reboot=1
                    break
                fi
            done < "$SELECTED_CUSTOM_PACKAGES"
        fi
    fi
    
    # customscripts.json のスクリプトチェック
    
    if [ "$needs_reboot" -eq 0 ]; then
        for var_file in "$CONFIG_DIR"/script_vars_*.txt; do
            [ -f "$var_file" ] || continue
            
            local script_id selected_option option_reboot script_reboot
            script_id=$(basename "$var_file" | sed 's/^script_vars_//;s/\.txt$//')
            
            # 選択されたオプションIDを取得
            selected_option=$(grep "^SELECTED_OPTION=" "$var_file" 2>/dev/null | cut -d"'" -f2)
            
            # オプションレベルの reboot フラグをチェック
            if [ -n "$selected_option" ]; then
                option_reboot=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].options[@.id='$selected_option'].reboot" 2>/dev/null | head -1)
                
                if [ "$option_reboot" = "true" ]; then
                    needs_reboot=1
                    break
                elif [ "$option_reboot" = "false" ]; then
                    # オプションで明示的にfalse → reboot不要、次のスクリプトへ
                    continue
                fi
            fi
            
            # オプションにrebootがない場合、スクリプトレベルをチェック
            script_reboot=$(jsonfilter -i "$CUSTOMSCRIPTS_JSON" -e "@.scripts[@.id='$script_id'].reboot" 2>/dev/null | head -1)
            
            if [ "$script_reboot" = "true" ]; then
                needs_reboot=1
                break
            fi
        done
    fi
    
    echo "$needs_reboot"
}

# Backup and Restore Functions

load_restore_path() {
    if [ -f "$RESTORE_PATH_CONFIG" ]; then
        cat "$RESTORE_PATH_CONFIG"
    else
        echo "$BACKUP_DIR"
    fi
}

save_restore_path() {
    local path="$1"
    mkdir -p "$(dirname "$RESTORE_PATH_CONFIG")"
    echo "$path" > "$RESTORE_PATH_CONFIG"
}

create_backup() {
    local trigger="${1:-manual}"
    local changes_summary="${2:-}"
    local timestamp backup_file meta_file
    
    backup_path=$(load_restore_path)
    timestamp=$(date +%Y%m%d_%H%M%S)
    backup_file="${backup_path}/backup-${timestamp}.tar.gz"
    meta_file="${backup_path}/backup-${timestamp}.meta.txt"
    
    mkdir -p "$backup_path" || return 1
    
    # システムバックアップ
    if ! sysupgrade -b "$backup_file"; then
        rm -f "$backup_file"
        return 1
    fi
    
    # メタデータ生成
    if [ -n "$changes_summary" ]; then
        local tr_restore_desc tr_settings_only
        tr_restore_desc=$(translate "tr-tui-restore-point-state-before-apply")
        tr_settings_only=$(translate "tr-tui-rollback-settings-only")
        
        {
            echo "$(date '+%Y-%m-%d %H:%M:%S')"
            echo "OpenWrt $OPENWRT_VERSION"
            echo ""
            echo "=== ${tr_restore_desc} ==="
            echo "${tr_settings_only}"
            echo ""
            echo "$changes_summary"
            echo ""
            echo "================================="
        } > "$meta_file"
    fi
    
    cleanup_old_backups "$backup_path"
    return 0
}

cleanup_old_backups() {
    local backup_count
    backup_count=$(ls -1 "$BACKUP_DIR"/backup-*.tar.gz 2>/dev/null | wc -l)
    
    if [ "$backup_count" -gt "$MAX_BACKUPS" ]; then
        ls -1t "$BACKUP_DIR"/backup-*.tar.gz | tail -n +$((MAX_BACKUPS + 1)) | xargs rm -f
    fi
}

restore_from_backup() {
    local backup_file="$1"
    
    if [ ! -f "$backup_file" ]; then
        echo "Error: Backup file not found: $backup_file" >&2
        return 1
    fi
    
    if ! create_backup "before_restore"; then
        echo "Error: Failed to create backup before restore" >&2
        return 1
    fi
    
    if ! sysupgrade -r "$backup_file"; then
        echo "Error: sysupgrade restore failed" >&2
        return 1
    fi
    
    return 0
}

# Main Entry Point

show_log() {
    if [ -f "$BASE_TMP_DIR/debug.log" ]; then
        cat "$BASE_TMP_DIR/debug.log"
    else
        echo "No log file found at $BASE_TMP_DIR/debug.log"
    fi
}

aios2_main() {
    START_TIME=$(cut -d' ' -f1 /proc/uptime)
    
    elapsed_time() {
        local current=$(cut -d' ' -f1 /proc/uptime)
        awk "BEGIN {printf \"%.3f\", $current - $START_TIME}"
    }
    
    clear
    print_banner
    mkdir -p "$CONFIG_DIR"
    get_language_code
    
    if ! check_network_connectivity; then
        echo "Error: Network connectivity check failed"
        echo "Please check your internet connection"
        printf "Press [Enter] to exit. "
        read -r _
        return 1
    fi
    
    __download_file_core "${BOOTSTRAP_URL}/config.js" "$CONFIG_DIR/config.js" || {
        echo "Error: Failed to download config.js"
        printf "Press [Enter] to exit. "
        read -r _
        return 1
    }
    
    init
    
    (download_file_with_cache "$PACKAGE_MANAGER_CONFIG_URL" "$PACKAGE_MANAGER_JSON") &
    PKG_MGR_DL_PID=$!
    
    (download_api_with_retry) &
    API_PID=$!
    
    (download_setup_json) &
    SETUP_PID=$!
    
    (download_postinst_json) &
    POSTINST_PID=$!
    
    (download_customfeeds_json >/dev/null 2>&1) &
    CUSTOMFEEDS_PID=$!
    
    (download_customscripts_json >/dev/null 2>&1) &
    CUSTOMSCRIPTS_PID=$!
	
    (prefetch_templates) &
    TEMPLATES_PID=$!
    
    (download_language_json "en" >/dev/null 2>&1) &
    LANG_EN_PID=$!
    
    NATIVE_LANG_PID=""
    if [ -n "$AUTO_LANGUAGE" ] && [ "$AUTO_LANGUAGE" != "en" ]; then
        (download_language_json "${AUTO_LANGUAGE}") &
        NATIVE_LANG_PID=$!
    fi
    
    (
        [ -n "$WHIPTAIL_UI_URL" ] && __download_file_core "$WHIPTAIL_UI_URL" "$CONFIG_DIR/aios2-whiptail.sh"
        [ -n "$SIMPLE_UI_URL" ] && __download_file_core "$SIMPLE_UI_URL" "$CONFIG_DIR/aios2-simple.sh"
    ) &
    UI_DL_PID=$!
    
    wait $SETUP_PID
    SETUP_STATUS=$?
    [ $SETUP_STATUS -ne 0 ] && {
        echo "Cannot continue without setup.json"
        printf "Press [Enter] to exit. "
        read -r _
        return 1
    }
    
    wait $POSTINST_PID
    POSTINST_STATUS=$?
    [ $POSTINST_STATUS -ne 0 ] && {
        echo "Cannot continue without postinst.json"
        printf "Press [Enter] to exit. "
        read -r _
        return 1
    }

    wait $API_PID
    
    get_extended_device_info
    
    build_version_compat_cache

    export DEVICE_TARGET
    export OPENWRT_VERSION
    export DISTRIB_RELEASE
    export ASU_URL
    export DEVICE_MODEL
    export DEVICE_ARCH
    export DEVICE_VENDOR
    export DEVICE_SUBTARGET
    export PKG_CHANNEL
    
    echo "[DEBUG] Exported variables:" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG]   DEVICE_ARCH='$DEVICE_ARCH'" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG]   DEVICE_VENDOR='$DEVICE_VENDOR'" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG]   DEVICE_SUBTARGET='$DEVICE_SUBTARGET'" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG]   DEVICE_TARGET='$DEVICE_TARGET'" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG]   OPENWRT_VERSION='$OPENWRT_VERSION'" >> "$CONFIG_DIR/debug.log"
    echo "[DEBUG]   ASU_URL='$ASU_URL'" >> "$CONFIG_DIR/debug.log"
    
    ( cache_package_availability >/dev/null 2>&1 ) &
    CACHE_PKG_PID=$!
    
    (
        cache_installed_packages
        wait $CACHE_PKG_PID
        cache_available_languages
        initialize_installed_packages
		
        : > "$SETUP_VARS"
	
        cp "$SELECTED_PACKAGES" "$CONFIG_DIR/packages_initial_snapshot.txt"
        cp "$SELECTED_CUSTOM_PACKAGES" "$CONFIG_DIR/custom_packages_initial_snapshot.txt"
        : > "$CONFIG_DIR/lang_packages_initial_snapshot.txt"
    ) &
    INIT_PKG_PID=$!
    
    echo "[DEBUG] $(date): Init complete (PKG_MGR=$PKG_MGR, PKG_CHANNEL=$PKG_CHANNEL)" >> "$CONFIG_DIR/debug.log"
    
    WHIPTAIL_AVAILABLE=0
    command -v whiptail >/dev/null 2>&1 && WHIPTAIL_AVAILABLE=1
    
    UI_START=$(cut -d' ' -f1 /proc/uptime)
    select_ui_mode
    UI_END=$(cut -d' ' -f1 /proc/uptime)
    UI_DURATION=$(awk "BEGIN {printf \"%.3f\", $UI_END - $UI_START}")
    
    if [ "$UI_MODE" = "whiptail" ] && [ "$WHIPTAIL_AVAILABLE" -eq 0 ]; then
        echo "Waiting for package manager configuration..."
        wait $PKG_MGR_DL_PID
        
        load_package_manager_config || {
            echo "Failed to load package manager config"
            printf "Press [Enter] to exit. "
            read -r _
            return 1
        }
        
        echo "Installing whiptail..."
        echo "Updating package lists..."
        eval "$PKG_UPDATE_CMD" || echo "Warning: Failed to update package lists"
        
        if ! install_package whiptail; then
            echo "Installation failed. Falling back to simple mode."
            UI_MODE="simple"
        else
            echo "Installation successful."
        fi
    fi
    
    TIME_BEFORE_UI=$(elapsed_time)
    echo "[TIME] Pre-UI processing: ${TIME_BEFORE_UI}s" >> "$CONFIG_DIR/debug.log"
    
	wait $CUSTOMFEEDS_PID $CUSTOMSCRIPTS_PID $TEMPLATES_PID $LANG_EN_PID $UI_DL_PID $INIT_PKG_PID

    if [ -n "$AUTO_LANGUAGE" ] && [ "$AUTO_LANGUAGE" != "en" ]; then
        [ ! -f "$CONFIG_DIR/lang_${AUTO_LANGUAGE}.json" ] && download_language_json "${AUTO_LANGUAGE}"
    fi
    
    CURRENT_TIME=$(cut -d' ' -f1 /proc/uptime)
    TOTAL_AUTO_TIME=$(awk "BEGIN {printf \"%.3f\", $CURRENT_TIME - $START_TIME - $UI_DURATION}")
    debug_log "Total auto-processing: ${TOTAL_AUTO_TIME}s"
    
    if [ "$UI_MODE" = "simple" ] && [ -f "$CONFIG_DIR/lang_${AUTO_LANGUAGE}.json" ]; then
        sed -i 's/"tr-tui-yes": "[^"]*"/"tr-tui-yes": "y"/' "$CONFIG_DIR/lang_${AUTO_LANGUAGE}.json"
        sed -i 's/"tr-tui-no": "[^"]*"/"tr-tui-no": "n"/' "$CONFIG_DIR/lang_${AUTO_LANGUAGE}.json"
    fi
    
    [ -n "$NATIVE_LANG_PID" ] && wait $NATIVE_LANG_PID
    
    if [ -f "$CONFIG_DIR/aios2-${UI_MODE}.sh" ]; then
        . "$CONFIG_DIR/aios2-${UI_MODE}.sh"
        aios2_${UI_MODE}_main
    else
        echo "Error: UI module aios2-${UI_MODE}.sh not found."
        return 1
    fi
}

# オプション処理
case "$1" in
    l|-log|--log)
        show_log
        ;;
    *)
        aios2_main
        ;;
esac
