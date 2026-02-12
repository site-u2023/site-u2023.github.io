#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC2086,SC3043
# OpenWrt 19.07+ AdGuard Home Installation Script
# Reference: https://openwrt.org/docs/guide-user/services/dns/adguard-home
#            https://github.com/AdguardTeam/AdGuardHome
#
# FEATURES:
#   - Dual installation modes: OpenWrt package or official binary
#   - Non-disruptive installation: network connectivity maintained during setup
#   - Modular dependency management with automated cleanup
#   - Interactive and non-interactive operation modes
#   - In-place credential updates without reinstallation
#   - Automated configuration backup and restoration
#
# INSTALLATION BEHAVIOR:
#   Configuration changes are committed but not applied during installation.
#   DNS services remain operational throughout the process. AdGuard Home
#   activation occurs on next system boot, preventing service interruption.
#
# OPTIONS:
#   -i SOURCE    Installation source (openwrt|official)
#   -r MODE      Removal mode (auto|manual)
#   -m           Update credentials only
#   -c           Skip system resource validation
#   -n           Skip YAML generation (web-based initial setup)
#   -t           TUI mode (internal use)
#   -h           Display usage information
#
# ENVIRONMENT VARIABLES:
#   AGH_USER         Administrator username (default: admin)
#   AGH_PASS         Administrator password (default: password, minimum 8 characters)
#   WEB_PORT         Web interface port (default: 8000)
#   DNS_PORT         DNS service port (default: 53)
#   DNS_BACKUP_PORT  Fallback dnsmasq port (default: 54)

VERSION="R7.1225.2250"

# =============================================================================
# System Environment Detection
# =============================================================================

# Package Manager Detection (Must be defined before path logic)
PACKAGE_MANAGER="$(command -v apk >/dev/null 2>&1 && echo apk || echo opkg)"

# OS Version Information
OS_MAJOR_VERSION=0
IS_SNAPSHOT=false

check_os_version() {
    if [ -f /etc/openwrt_release ]; then
        # Extract major version (e.g., "23" from "23.05.5")
        OS_MAJOR_VERSION=$(grep "DISTRIB_RELEASE" /etc/openwrt_release | cut -d"'" -f2 | cut -d"." -f1)
        # Handle non-numeric versions like SNAPSHOT
        if ! [ "$OS_MAJOR_VERSION" -eq "$OS_MAJOR_VERSION" ] 2>/dev/null; then
            OS_MAJOR_VERSION=0
            if grep -q "SNAPSHOT" /etc/openwrt_release; then
                IS_SNAPSHOT=true
            fi
        fi
    fi
}

check_os_version

# =============================================================================
# AdGuard Home Path Definitions
# =============================================================================

# Determine the configuration path based on OS version/package manager
if [ "$OS_MAJOR_VERSION" -ge 24 ] || [ "$IS_SNAPSHOT" = true ] || [ "$PACKAGE_MANAGER" = "apk" ]; then
    # New standard path (OpenWrt 24.10+, SNAPSHOT, or APK-based systems)
    AGH_CONFIG_PATH="/etc/adguardhome/adguardhome.yaml"
else
    # Legacy path (OpenWrt 23.05 and earlier)
    AGH_CONFIG_PATH="/etc/adguardhome.yaml"
fi

# Binary paths
AGH_BINARY_OFFICIAL="/etc/AdGuardHome/AdGuardHome"
AGH_BINARY_OPENWRT="/usr/bin/AdGuardHome"

# Config file paths (Official binary uses a specific path)
AGH_CONFIG_OFFICIAL="/etc/AdGuardHome/AdGuardHome.yaml"

# Config directory paths
AGH_DIR_OFFICIAL="/etc/AdGuardHome"
AGH_DIR_SNAPSHOT="/etc/adguardhome"

# =============================================================================
# Variable Initialization (empty by default)
# =============================================================================

# Operation mode variables (set by command line options)
: "${INSTALL_MODE:=}"         # -i: openwrt|official
: "${REMOVE_MODE:=}"          # -r: auto|manual
: "${NO_YAML:=}"              # -n: skip YAML generation
: "${SKIP_RESOURCE_CHECK:=}"  # -c: skip resource check
: "${UPDATE_CREDENTIALS:=}"   # -m: update credentials mode
: "${TUI_MODE:=}"             # -t: tui mode

# Credential variables (set by environment or interactive input)
AGH_USER=""
AGH_PASS=""
AGH_PASS_HASH=""

# Port/Address variables (set by environment or defaults)
WEB_PORT=""
DNS_PORT=""
DNS_BACKUP_PORT=""

# System detection variables
NET_ADDR=""
NET_ADDR6_LIST=""
SERVICE_NAME=""
PACKAGE_MANAGER=""
FAMILY_TYPE=""
LAN="$(ubus call network.interface.lan status 2>/dev/null | jsonfilter -e '@.l3_device')"

# Service detection variables (set by detect_adguardhome_service)
DETECTED_SERVICE_TYPE=""
DETECTED_SERVICE_NAME=""
DETECTED_CONFIG_FILE=""

# Update state variables
UPDATE_PASSWORD=0

# =============================================================================
# Default Values (used as fallback)
# =============================================================================

DEFAULT_AGH_USER="admin"
DEFAULT_AGH_PASS="password"
DEFAULT_WEB_PORT="8000"
DEFAULT_DNS_PORT="53"
DEFAULT_DNS_BACKUP_PORT="54"

# =============================================================================
# Requirements
# =============================================================================

MINIMUM_MEM="20"
MINIMUM_FLASH="25"
RECOMMENDED_MEM="50"
RECOMMENDED_FLASH="100"

# =============================================================================
# Package Name Definitions
# =============================================================================

# Dependency packages for htpasswd
HTPASSWD_DEPS="libaprutil libapr libexpat libuuid1 libpcre2"
HTPASSWD_PROVIDER="apache"

# SSL certificate bundle
CA_BUNDLE_PKG="ca-bundle"

# =============================================================================
# Script Configuration
# =============================================================================

SCRIPT_BASE_URL="${SCRIPT_BASE_URL:-https://site-u.pages.dev/www/custom-scripts}"

# BEGIN_VARIABLE_DEFINITIONS
# END_VARIABLE_DEFINITIONS

# =============================================================================
# Error Handling Policy
# =============================================================================
# This script uses three error handling patterns:
#
#   1. Critical (no recovery possible):
#      command || exit 1
#
#   2. After configuration changes (rollback required):
#      command || { rollback_to_backup; exit 1; }
#
#   3. Ignorable (cleanup, optional features):
#      command 2>/dev/null || true
#
# =============================================================================

# =============================================================================
# Input Validation Module
# =============================================================================

# Validate port number
# Args:
#   $1 - Port number
#   $2 - Port name (for error message, e.g., "WEB_PORT")
# Returns:
#   0 - Valid
#   1 - Invalid
validate_port() {
    local port="$1"
    local name="${2:-Port}"
    
    # Check if numeric
    case "$port" in
        ''|*[!0-9]*)
            printf "\033[1;31mError: %s must be a number (got: '%s')\033[0m\n" "$name" "$port"
            return 1
            ;;
    esac
    
    # Check range (1-65535)
    if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
        printf "\033[1;31mError: %s must be 1-65535 (got: %s)\033[0m\n" "$name" "$port"
        return 1
    fi
    
    return 0
}

# =============================================================================
# Option Parser
# =============================================================================

print_usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  -i SOURCE    Install from specified source (openwrt|official)
  -r MODE      Remove AdGuard Home (auto|manual)
  -m           Update credentials (Username/Password/Web Port)
  -c           Skip system resource check
  -n           Skip YAML configuration generation (use web setup)
  -h           Show this help message

Environment Variables:
  AGH_USER         Admin username (default: admin)
  AGH_PASS         Admin password (default: password, min 8 chars)
  WEB_PORT         Web interface port (default: 8000)
  DNS_PORT         DNS service port (default: 53)
  DNS_BACKUP_PORT  Backup dnsmasq port (default: 54)

Examples:
  Interactive install:
    sh $(basename "$0")

  Non-interactive install:
    AGH_USER=admin AGH_PASS=mypassword sh $(basename "$0") -i official

  Update credentials:
    sh $(basename "$0") -m

  Remove with auto-confirm:
    sh $(basename "$0") -r auto

EOF
}

parse_options() {
    while [ $# -gt 0 ]; do
        case "$1" in
            -h|--help)
                print_usage
                exit 0
                ;;
            -c)
                SKIP_RESOURCE_CHECK="1"
                ;;
            -n)
                NO_YAML="1"
                ;;
            -m)
                UPDATE_CREDENTIALS="1"
                ;;
            -r)
                if [ -n "$2" ] && [ "${2#-}" = "$2" ]; then
                    REMOVE_MODE="$2"
                    shift
                else
                    printf "\033[1;31mError: -r requires an argument (auto|manual)\033[0m\n"
                    exit 1
                fi
                ;;
            -i)
                if [ -n "$2" ] && [ "${2#-}" = "$2" ]; then
                    INSTALL_MODE="$2"
                    shift
                else
                    printf "\033[1;31mError: -i requires an argument (openwrt|official)\033[0m\n"
                    exit 1
                fi
                ;;
            -t)
                TUI_MODE="1"
                ;;
            *)
                printf "\033[1;33mWarning: Unknown option: %s\033[0m\n" "$1"
                ;;
        esac
        shift
    done
}

apply_environment_variables() {
    # Apply environment variables if set, otherwise leave empty for later handling
    # Port/Address variables get defaults here as they're not interactive
    WEB_PORT="${WEB_PORT:-$DEFAULT_WEB_PORT}"
    DNS_PORT="${DNS_PORT:-$DEFAULT_DNS_PORT}"
    DNS_BACKUP_PORT="${DNS_BACKUP_PORT:-$DEFAULT_DNS_BACKUP_PORT}"
    
    # Validate ports (only if set from environment, not defaults)
    if ! validate_port "$WEB_PORT" "WEB_PORT"; then
        exit 1
    fi
    if ! validate_port "$DNS_PORT" "DNS_PORT"; then
        exit 1
    fi
    if ! validate_port "$DNS_BACKUP_PORT" "DNS_BACKUP_PORT"; then
        exit 1
    fi
    
    # AGH_USER and AGH_PASS remain as-is from environment (may be empty)
    # They will be handled by prompt_credentials() or set_default_credentials()
}

# =============================================================================
# Mode Detection
# =============================================================================

is_standalone_mode() {
    # Standalone mode: INSTALL_MODE not specified via args, and no REMOVE_MODE
    [ -z "$TUI_MODE" ]
}

is_interactive_mode() {
    # Interactive mode: standalone AND credentials not pre-set
    is_standalone_mode && [ -z "$AGH_USER" ] && [ -z "$AGH_PASS" ]
}

# =============================================================================
# Service Detection Module
# =============================================================================

# Detect installed AdGuard Home service
# Sets global variables: DETECTED_SERVICE_TYPE, DETECTED_SERVICE_NAME, DETECTED_CONFIG_FILE
# Returns:
#   0 - Service found
#   1 - Service not found
detect_adguardhome_service() {
    if [ -x "$AGH_BINARY_OFFICIAL" ] && "$AGH_BINARY_OFFICIAL" --version >/dev/null 2>&1; then
        DETECTED_SERVICE_TYPE="official"
        DETECTED_SERVICE_NAME="AdGuardHome"
        DETECTED_CONFIG_FILE="$AGH_CONFIG_OFFICIAL"
        return 0
    elif [ -x "$AGH_BINARY_OPENWRT" ] && "$AGH_BINARY_OPENWRT" --version >/dev/null 2>&1; then
        DETECTED_SERVICE_TYPE="openwrt"
        DETECTED_SERVICE_NAME="adguardhome"
        
        if [ -f "$AGH_CONFIG_SNAPSHOT" ]; then
            DETECTED_CONFIG_FILE="$AGH_CONFIG_SNAPSHOT"
        else
            DETECTED_CONFIG_FILE="$AGH_CONFIG_RELEASE"
        fi
        return 0
    else
        DETECTED_SERVICE_TYPE=""
        DETECTED_SERVICE_NAME=""
        DETECTED_CONFIG_FILE=""
        return 1
    fi
}

# =============================================================================
# Service Management Module
# =============================================================================

# Restart a single service with error handling
# Args:
#   $1 - Service name
# Returns:
#   0 - Success
#   1 - Failed
restart_service() {
    local service="$1"
    
    /etc/init.d/"$service" restart || {
        printf "\033[1;31mFailed to restart %s\033[0m\n" "$service"
        return 1
    }
    return 0
}

# Restart all network services
restart_network_services() {
    restart_service dnsmasq || exit 1
    restart_service odhcpd || exit 1
    restart_service firewall || exit 1
}

# =============================================================================
# Backup Module
# =============================================================================

# Backup a configuration file with timestamp
# Args:
#   $1 - File path to backup
# Returns:
#   0 - Success
#   1 - Failed or file not found
backup_config_file() {
    local file="$1"
    local backup
    backup="${file}.backup.$(date +%Y%m%d%H%M%S)"
    
    if [ -f "$file" ]; then
        cp "$file" "$backup" || {
            printf "\033[1;31mFailed to backup %s\033[0m\n" "$file"
            return 1
        }
        return 0
    fi
    return 1
}

# =============================================================================
# Reboot Module
# =============================================================================

# Prompt for reboot (only in standalone mode)
# Args:
#   $1 - Optional custom message (default: "Press [Enter] to reboot.")
# Returns: Does not return (reboots system)
prompt_reboot() {
    local message="${1:-Press [Enter] to reboot.}"
    
    # Only prompt in standalone mode
    if is_standalone_mode; then
        printf "\033[33m%s\033[0m" "$message"
        read -r _
        reboot
    fi
}

# =============================================================================
# System Check Functions
# =============================================================================

check_system() {
    if detect_adguardhome_service; then
        printf "\033[1;33mAdGuard Home is already installed.\033[0m\n"
        printf "\nInstalled: \033[1;36m%s version\033[0m\n\n" "$DETECTED_SERVICE_TYPE"
        
        while true; do
            printf "[1] Update credentials (Username/Password/Web Port)\n"
            printf "[2] Remove and reinstall\n"
            printf "[0] Exit\n"
            printf "Please select (1, 2 or 0): "
            read -r choice
            
            case "$choice" in
                1) update_credentials; exit 0 ;;
                2) remove_adguardhome; break ;;
                0) printf "\033[1;33mCancelled.\033[0m\n"; exit 0 ;;
                *) printf "\033[1;31mInvalid choice '%s'. Please enter 1, 2, or 0.\033[0m\n" "$choice" ;;
            esac
        done
        return 0
    fi
    
    printf "\033[1;34mChecking system requirements\033[0m\n"
    
    if [ -z "$LAN" ]; then
        printf "\033[1;31mLAN interface not found. Aborting.\033[0m\n"
        exit 1
    fi
    
    if command -v opkg >/dev/null 2>&1; then
        PACKAGE_MANAGER="opkg"
    elif command -v apk >/dev/null 2>&1; then
        PACKAGE_MANAGER="apk"
    else
        printf "\033[1;31mNo supported package manager (apk or opkg) found.\033[0m\n"
        printf "\033[1;31mThis script is designed for OpenWrt systems only.\033[0m\n"
        exit 1
    fi
    
    printf "Using: %s\n" "$PACKAGE_MANAGER"
    
    MEM_TOTAL_KB=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
    MEM_FREE_KB=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
    BUFFERS_KB=$(awk '/^Buffers:/ {print $2}' /proc/meminfo)
    CACHED_KB=$(awk '/^Cached:/ {print $2}' /proc/meminfo)
    if [ -n "$MEM_FREE_KB" ]; then
        MEM_FREE_MB=$((MEM_FREE_KB / 1024))
    else
        MEM_FREE_MB=$(((BUFFERS_KB + CACHED_KB) / 1024))
    fi
    MEM_TOTAL_MB=$((MEM_TOTAL_KB / 1024))
    DF_OUT=$(df -k / | awk 'NR==2 {print $2, $4}')
    FLASH_TOTAL_KB=$(printf '%s\n' "$DF_OUT" | awk '{print $1}')
    FLASH_FREE_KB=$(printf '%s\n' "$DF_OUT" | awk '{print $2}')
    FLASH_FREE_MB=$((FLASH_FREE_KB / 1024))
    FLASH_TOTAL_MB=$((FLASH_TOTAL_KB / 1024))
    
    if [ "$MEM_FREE_MB" -lt "$RECOMMENDED_MEM" ]; then
        mem_col="1;33"
    else
        mem_col="1;32"
    fi
    if [ "$FLASH_FREE_MB" -lt "$RECOMMENDED_FLASH" ]; then
        flash_col="1;33"
    else
        flash_col="1;32"
    fi
    
    printf "Memory: Free \033[%sm%s MB\033[0m / Total %s MB (Min: %s MB / Recommended: %s MB)\n" \
        "$mem_col" "$MEM_FREE_MB" "$MEM_TOTAL_MB" "$MINIMUM_MEM" "$RECOMMENDED_MEM"
    printf "Flash: Free \033[%sm%s MB\033[0m / Total %s MB (Min: %s MB / Recommended: %s MB)\n" \
        "$flash_col" "$FLASH_FREE_MB" "$FLASH_TOTAL_MB" "$MINIMUM_FLASH" "$RECOMMENDED_FLASH"
    
    # Skip resource check if -c option specified
    if [ -n "$SKIP_RESOURCE_CHECK" ]; then
        printf "\033[1;33mResource check skipped by -c option\033[0m\n"
        return 0
    fi
    
    if [ "$MEM_FREE_MB" -lt "$MINIMUM_MEM" ]; then
        printf "\033[1;31mError: Insufficient memory. At least %sMB RAM is required.\033[0m\n" \
            "$MINIMUM_MEM"
        exit 1
    fi
    if [ "$FLASH_FREE_MB" -lt "$MINIMUM_FLASH" ]; then
        printf "\033[1;31mError: Insufficient flash storage. At least %sMB free space is required.\033[0m\n" \
            "$MINIMUM_FLASH"
        exit 1
    fi
}

# =============================================================================
# Password Input Module
# =============================================================================

# Read password with validation and confirmation
# Args:
#   $1 - Prompt message (optional, default: "Enter password")
#   $2 - Allow empty (optional: "1" to allow, default: "0")
# Returns:
#   0 - Success (password stored in PASSWORD_INPUT variable)
#   1 - User cancelled (only when allow_empty=1)
read_password() {
    local prompt="${1:-Enter password}"
    local allow_empty="${2:-0}"
    local input_pass confirm_pass
    
    while true; do
        printf "%s (min 8 chars%s): " "$prompt" "$([ "$allow_empty" = "1" ] && echo ", empty to skip" || echo "")"
        stty -echo 2>/dev/null
        read -r input_pass
        stty echo 2>/dev/null
        
        # Handle empty input
        if [ -z "$input_pass" ]; then
            if [ "$allow_empty" = "1" ]; then
                printf "\n"
                PASSWORD_INPUT=""
                return 1
            else
                printf "\n\033[1;31mPassword cannot be empty\033[0m\n"
                continue
            fi
        fi
        
        # Validate length
        if [ ${#input_pass} -lt 8 ]; then
            printf "\n\033[1;31mPassword must be at least 8 characters\033[0m\n"
            continue
        fi
        
        # Confirm password
        printf "Confirm password: "
        stty -echo 2>/dev/null
        read -r confirm_pass
        stty echo 2>/dev/null
        
        # Check match
        if [ "$input_pass" != "$confirm_pass" ]; then
            printf "\n\033[1;31mPasswords do not match\033[0m\n"
            continue
        fi
        
        PASSWORD_INPUT="$input_pass"
        printf "\n"
        return 0
    done
}

# =============================================================================
# Update Credentials Function
# =============================================================================

update_credentials() {
    printf "\033[1;34mUpdating AdGuard Home Credentials\033[0m\n\n"
    
    if [ -z "$LAN" ]; then
        printf "\033[1;31mLAN interface not found. Aborting.\033[0m\n"
        return 1
    fi
    
    if ! detect_adguardhome_service; then
        printf "\033[1;31mAdGuard Home not found.\033[0m\n"
        return 1
    fi
    
    CONFIG_FILE="$DETECTED_CONFIG_FILE"
    SERVICE_NAME="$DETECTED_SERVICE_NAME"
    
    CURRENT_USER=$(grep -A 5 '^users:' "$CONFIG_FILE" | grep 'name:' | head -1 | awk '{print $3}')
    CURRENT_PORT=$(grep -A 5 '^http:' "$CONFIG_FILE" | grep 'address:' | cut -d: -f3)
    
    # Check for non-interactive mode (all required variables set)
    if [ -n "$AGH_USER" ] && [ -n "$AGH_PASS" ] && [ -n "$WEB_PORT" ]; then
        # Non-interactive mode
        NEW_USER="$AGH_USER"
        NEW_PASS="$AGH_PASS"
        NEW_PORT="$WEB_PORT"
        UPDATE_PASSWORD=1

        # Validate port
        if ! validate_port "$NEW_PORT" "WEB_PORT"; then
            return 1
        fi
        
        printf "Updating credentials (non-interactive mode)\n"
        printf "  Username: %s\n" "$NEW_USER"
        printf "  Password: %s\n" "********"
        printf "  Web Port: %s\n" "$NEW_PORT"
    else
        # Interactive mode
        printf "Current settings:\n"
        printf "  Username: \033[1;36m%s\033[0m\n" "${CURRENT_USER:-<not set>}"
        printf "  Web Port: \033[1;36m%s\033[0m\n" "${CURRENT_PORT:-<not set>}"
        printf "\n"
        
        printf "Enter new username [%s]: " "${CURRENT_USER:-admin}"
        read -r input_user
        NEW_USER="${input_user:-${CURRENT_USER:-admin}}"
        
        if read_password "Enter new password" "1"; then
            NEW_PASS="$PASSWORD_INPUT"
            UPDATE_PASSWORD=1
        else
            UPDATE_PASSWORD=0
        fi
        
        # Web port input with validation loop
        while true; do
            printf "Enter new web port [%s]: " "${CURRENT_PORT:-8000}"
            read -r input_port
            NEW_PORT="${input_port:-${CURRENT_PORT:-8000}}"
            
            if validate_port "$NEW_PORT" "Web port"; then
                break
            fi
            printf "\033[1;33mPlease try again.\033[0m\n"
        done
    fi
    
    # Generate password hash if needed
    if [ "$UPDATE_PASSWORD" -eq 1 ]; then
        if ! command -v htpasswd >/dev/null 2>&1; then
            printf "\033[1;31mhtpasswd not found. Installing dependencies...\033[0m\n"
            install_dependencies || {
                printf "\033[1;31mFailed to install htpasswd. Cannot update password.\033[0m\n"
                return 1
            }
        fi
        
        NEW_PASS_HASH=$(htpasswd -B -n -b "" "$NEW_PASS" 2>/dev/null | cut -d: -f2)
        if [ -z "$NEW_PASS_HASH" ]; then
            printf "\033[1;31mFailed to generate password hash.\033[0m\n"
            return 1
        fi
    fi
    
    backup_config_file "$CONFIG_FILE"
    /etc/init.d/"$SERVICE_NAME" stop
    sed -i "/^users:/,/^[a-z]/ { /- name:/ s/name: .*/name: ${NEW_USER}/ }" "$CONFIG_FILE"
    if [ "$UPDATE_PASSWORD" -eq 1 ]; then
        sed -i "/^users:/,/^[a-z]/ { /password:/ s|password: .*|password: ${NEW_PASS_HASH}| }" "$CONFIG_FILE"
    fi
    sed -i "/^http:/,/^[a-z]/ { /address:/ s|address: .*|address: 0.0.0.0:${NEW_PORT}| }" "$CONFIG_FILE"
    /etc/init.d/"$SERVICE_NAME" start
    
    printf "\n\033[1;32mCredentials updated successfully!\033[0m\n\n"
    printf "New settings:\n"
    printf "  Username: \033[1;36m%s\033[0m\n" "$NEW_USER"
    if [ "$UPDATE_PASSWORD" -eq 1 ]; then
        printf "  Password: \033[1;36m%s\033[0m\n" "$NEW_PASS"
    else
        printf "  Password: \033[1;33m(unchanged)\033[0m\n"
    fi
    printf "  Web Port: \033[1;36m%s\033[0m\n" "$NEW_PORT"
    
    get_iface_addrs
    printf "\nWeb interface IPv4: http://%s:%s/\n" "$NET_ADDR" "$NEW_PORT"
    if [ -n "$NET_ADDR6_LIST" ]; then
        set -- $NET_ADDR6_LIST
        printf "Web interface IPv6: http://[%s]:%s/\n" "$1" "$NEW_PORT"
    fi
}

# =============================================================================
# Install Mode Selection
# =============================================================================

select_install_mode() {
    # If INSTALL_MODE already set (via -i option or environment), validate and return
    if [ -n "$INSTALL_MODE" ]; then
        case "$INSTALL_MODE" in
            openwrt|official)
                return 0
                ;;
            *)
                printf "\033[1;31mError: Invalid INSTALL_MODE '%s'. Use 'openwrt' or 'official'.\033[0m\n" "$INSTALL_MODE"
                exit 1
                ;;
        esac
    fi
    
    # Interactive selection
    printf "\033[1;32mSystem resources are sufficient for AdGuard Home installation.\033[0m\n"
    
    while true; do
        printf "[1] Install OpenWrt package\n"
        printf "[2] Install Official binary\n"
        printf "[0] Exit\n"
        printf "Please select (1, 2 or 0): "
        read -r choice
        
        case "$choice" in
            1) INSTALL_MODE="openwrt"; break ;;
            2) INSTALL_MODE="official"; break ;;
            0)
                printf "\033[1;33mInstallation cancelled.\033[0m\n"
                exit 0
                ;;
            *)
                printf "\033[1;31mInvalid choice '%s'. Please enter 1, 2, or 0.\033[0m\n" "$choice"
                ;;
        esac
    done
}

# =============================================================================
# Package Installation Functions
# =============================================================================

install_packages() {
    local opts="$1"
    shift
    local pkgs="$*"
    
    case "$PACKAGE_MANAGER" in
        opkg)
            for p in $pkgs; do
                opkg install $opts "$p" >/dev/null 2>&1
            done
            ;;
        apk)
            for p in $pkgs; do
                apk add $opts "$p" >/dev/null 2>&1
            done
            ;;
    esac
}

# =============================================================================
# htpasswd Installation Module
# =============================================================================

# Check if apache was originally installed
# Returns: 0 if installed, 1 if not
is_apache_installed() {
    case "$PACKAGE_MANAGER" in
        opkg)
            opkg list-installed 2>/dev/null | grep -q "^${HTPASSWD_PROVIDER} "
            ;;
        apk)
            apk info -e "$HTPASSWD_PROVIDER" >/dev/null 2>&1
            ;;
    esac
}

# Install apache package
# Returns: 0 on success, 1 on failure
install_apache_package() {
    case "$PACKAGE_MANAGER" in
        opkg)
            opkg install --nodeps "$HTPASSWD_PROVIDER" >/dev/null 2>&1
            ;;
        apk)
            apk add --force "$HTPASSWD_PROVIDER" >/dev/null 2>&1
            ;;
    esac
}

# Remove apache package
# Returns: 0 on success, 1 on failure
remove_apache_package() {
    case "$PACKAGE_MANAGER" in
        opkg)
            opkg remove --force-depends "$HTPASSWD_PROVIDER" >/dev/null 2>&1
            ;;
        apk)
            apk del --force "$HTPASSWD_PROVIDER" >/dev/null 2>&1
            ;;
    esac
}

# Install htpasswd from apache package
# Preserves htpasswd binary and removes apache if it wasn't originally installed
# Returns: 0 on success, 1 on failure
install_htpasswd_from_apache() {
    local apache_was_installed=0
    
    is_apache_installed && apache_was_installed=1
    
    if [ ! -f /usr/bin/htpasswd ]; then
        printf "Installing %s package to obtain htpasswd... " "$HTPASSWD_PROVIDER"
        
        if [ "$apache_was_installed" -eq 1 ]; then
            remove_apache_package
        fi
        
        if install_apache_package && [ -f /usr/bin/htpasswd ]; then
            chmod +x /usr/bin/htpasswd 2>/dev/null
            printf "Done\n"
            
            if [ "$apache_was_installed" -eq 0 ]; then
                printf "Preserving htpasswd and removing %s... " "$HTPASSWD_PROVIDER"
                cp /usr/bin/htpasswd /tmp/htpasswd 2>/dev/null
                remove_apache_package
                mv /tmp/htpasswd /usr/bin/htpasswd 2>/dev/null
                chmod +x /usr/bin/htpasswd 2>/dev/null
                printf "Done\n"
            fi
            return 0
        else
            printf "Failed\n"
            printf "\033[1;31m%s package installation failed\033[0m\n" "$HTPASSWD_PROVIDER"
            return 1
        fi
    elif [ ! -x /usr/bin/htpasswd ]; then
        chmod +x /usr/bin/htpasswd 2>/dev/null
    fi
    
    return 0
}

install_dependencies() {
    printf "\033[1;34mEnsuring htpasswd and dependencies are available\033[0m\n"
    
    if command -v htpasswd >/dev/null 2>&1; then
        if htpasswd -B -n -b "" "test" >/dev/null 2>&1; then
            printf "\033[1;32mhtpasswd is already available and functional\033[0m\n"
            return 0
        fi
    fi
    
    # Install dependencies
    printf "Installing dependencies: "
    for p in $HTPASSWD_DEPS; do
        printf "%s " "$p"
        install_packages "" "$p"
    done
    printf "Done\n"
    
    if ! install_htpasswd_from_apache; then
        printf "\033[1;31mhtpasswd installation failed\033[0m\n"
        return 1
    fi
    
    if command -v htpasswd >/dev/null 2>&1; then
        printf "\033[1;32mhtpasswd is ready\033[0m\n"
        return 0
    else
        printf "\033[1;31mhtpasswd installation failed\033[0m\n"
        return 1
    fi
}

install_cacertificates() {
    case "$PACKAGE_MANAGER" in
        apk)
            install_packages "" "$CA_BUNDLE_PKG"
            ;;
        opkg)
            install_packages "--verbosity=0" "$CA_BUNDLE_PKG"
            ;;
    esac
}

# =============================================================================
# Download Module
# =============================================================================

# Download large binary file with resume support and progress bar
# Args:
#   $1 - URL
#   $2 - Output file path
#   $3 - Optional: wget additional options (e.g., "--no-check-certificate")
# Returns:
#   0 - Success
#   1 - Failed
# Usage:
#   download_file "https://example.com/file.tar.gz" "/tmp/file.tar.gz"
#   download_file "https://example.com/file.tar.gz" "/tmp/file.tar.gz" "--no-check-certificate"
download_file() {
    local url="$1"
    local output="$2"
    local extra_opts="${3:-}"

    # Try IPv6 first (native connection for MAP-E/DS-Lite environments)
    if wget --no-check-certificate -c --timeout=60 "$url" -O "$output"; then
        [ -s "$output" ] && return 0
    fi

    printf "\033[1;33mIPv6 failed, falling back to IPv4...\033[0m\n"
    if wget --no-check-certificate -4 -c --timeout=60 "$url" -O "$output"; then
        [ -s "$output" ] && return 0
    fi

    printf "\033[1;31mDownload failed.\033[0m\n"
    rm -f "$output"
    return 1
}

# Download small index/HTML page (quiet mode, no progress bar)
# Args:
#   $1 - URL
#   $2 - Output file path
# Returns:
#   0 - Success
#   1 - Failed
# Usage:
#   download_index "https://downloads.openwrt.org/packages/" "/tmp/index.html"
download_index() {
    local url="$1"
    local output="$2"
    
    if ! wget -q --timeout=15 "$url" -O "$output"; then
        printf "\033[1;31mFailed to fetch index from: %s\033[0m\n" "$url"
        rm -f "$output"
        return 1
    fi
    
    # Verify downloaded file
    if [ ! -s "$output" ]; then
        printf "\033[1;31mDownloaded index is empty.\033[0m\n"
        rm -f "$output"
        return 1
    fi
    
    return 0
}

# Download text file (YAML, config, script, etc.) with SSL fallback
# Args:
#   $1 - URL
#   $2 - Output file path
# Returns:
#   0 - Success
#   1 - Failed
# Usage:
#   download_text_file "https://example.com/config.yaml" "/tmp/config.yaml"
download_text_file() {
    local url="$1"
    local output="$2"
    
    # Try with SSL verification first, then without
    if ! { wget -q --timeout=15 -O "$output" "$url" || \
           wget -q --timeout=15 --no-check-certificate -O "$output" "$url"; }; then
        printf "\033[1;31mFailed to download from: %s\033[0m\n" "$url"
        rm -f "$output"
        return 1
    fi
    
    # Verify downloaded file
    if [ ! -s "$output" ]; then
        printf "\033[1;31mDownloaded file is empty or missing.\033[0m\n"
        rm -f "$output"
        return 1
    fi
    
    return 0
}

install_openwrt() {
    printf "Installing adguardhome (OpenWrt package)\n"
    
    case "$PACKAGE_MANAGER" in
        apk)
            printf "Checking apk repository for adguardhome...\n"
            
            PKG_VER=$(apk search adguardhome | grep "^adguardhome-" | sed 's/^adguardhome-//' | sed 's/-r[0-9]*$//')
            
            if [ -z "$PKG_VER" ]; then
                printf "\033[1;33mPackage 'adguardhome' not found in apk repository, falling back to official\033[0m\n"
                install_official
                return
            fi
            
            apk add adguardhome || {
                printf "\033[1;31mInstallation failed. Please check your network and try again.\033[0m\n"
                exit 1
            }
            
            printf "\033[1;32madguardhome %s has been installed\033[0m\n" "$PKG_VER"
            ;;
            
        opkg)
            printf "Checking opkg repository for adguardhome...\n"
            
            PKG_VER=$(opkg list | grep "^adguardhome " | awk '{print $3}')
            
            if [ -z "$PKG_VER" ]; then
                printf "\033[1;33mPackage 'adguardhome' not found in opkg repository, falling back to official\033[0m\n"
                install_official
                return
            fi
            
            opkg install adguardhome || {
                printf "\033[1;31mInstallation failed. Please check your network and try again.\033[0m\n"
                exit 1
            }
            
            printf "\033[1;32madguardhome %s has been installed\033[0m\n" "$PKG_VER"
            ;;
    esac
    
    SERVICE_NAME="adguardhome"
}

install_official() {
    local ARCH
    
    CA="--no-check-certificate"
    URL="https://api.github.com/repos/AdguardTeam/AdGuardHome/releases/latest"
    
    # Get version from GitHub API
    VER=$( { wget -q -O - "$URL" || wget -q "$CA" -O - "$URL"; } | jsonfilter -e '@.tag_name' )
    [ -n "$VER" ] || { 
        printf "\033[1;31mError: Failed to get AdGuardHome version from GitHub API.\033[0m\n"
        exit 1
    }
    
    mkdir -p /etc/AdGuardHome
    
    # Determine architecture
    case "$(uname -m)" in
        aarch64|arm64) ARCH=arm64 ;;
        armv7l)        ARCH=armv7 ;;
        armv6l)        ARCH=armv6 ;;
        armv5l)        ARCH=armv5 ;;
        x86_64|amd64)  ARCH=amd64 ;;
        i386|i686)     ARCH=386 ;;
        mips)          ARCH=mipsle ;;
        mips64)        ARCH=mips64le ;;
        *) printf "Unsupported arch: %s\n" "$(uname -m)"; exit 1 ;;
    esac
    
    TAR="AdGuardHome_linux_${ARCH}.tar.gz"
    URL2="https://github.com/AdguardTeam/AdGuardHome/releases/download/${VER}/${TAR}"
    DEST="/etc/AdGuardHome/${TAR}"
    
    printf "Downloading AdGuardHome (official binary)\n"
    
    # Use download_file helper
    if ! download_file "$URL2" "$DEST" "$CA"; then
        printf '\033[1;31mDownload failed. Please check network connection.\033[0m\n'
        exit 1
    fi
    
    printf "\033[1;32mAdGuardHome %s has been downloaded\033[0m\n" "$VER"
    
    tar -C /etc/ -xzf "$DEST"
    rm "$DEST"
    chmod +x /etc/AdGuardHome/AdGuardHome
    SERVICE_NAME="AdGuardHome"
    
    /etc/AdGuardHome/AdGuardHome -s install >/dev/null 2>&1 || {
        printf "\033[1;31mInitialization failed. Check AdGuardHome.yaml and port availability.\033[0m\n"
        exit 1
    }
    chmod 700 /etc/"$SERVICE_NAME"
}

# =============================================================================
# Credential Handling
# =============================================================================

set_default_credentials() {
    # Set defaults for non-interactive mode
    [ -z "$AGH_USER" ] && AGH_USER="$DEFAULT_AGH_USER"
    [ -z "$AGH_PASS" ] && AGH_PASS="$DEFAULT_AGH_PASS"
}

prompt_credentials() {
    printf "\033[1;34mAdGuard Home Admin Setup\033[0m\n"
    
    # Username input
    printf "Enter admin username [%s]: " "$DEFAULT_AGH_USER"
    read -r input_user
    AGH_USER="${input_user:-$DEFAULT_AGH_USER}"
    
    # Password input
    read_password "Enter admin password" || exit 1
    AGH_PASS="$PASSWORD_INPUT"
    
    # Web port input with validation loop
    while true; do
        printf "Enter web interface port [%s]: " "$DEFAULT_WEB_PORT"
        read -r input_port
        WEB_PORT="${input_port:-$DEFAULT_WEB_PORT}"
        
        if validate_port "$WEB_PORT" "Web port"; then
            break
        fi
        printf "\033[1;33mPlease try again.\033[0m\n"
    done
    
    # DNS port input with validation loop
    while true; do
        printf "Enter DNS service port [%s]: " "$DEFAULT_DNS_PORT"
        read -r input_dns
        DNS_PORT="${input_dns:-$DEFAULT_DNS_PORT}"
        
        if validate_port "$DNS_PORT" "DNS port"; then
            # WEBポートとの衝突チェック
            if [ "$DNS_PORT" = "$WEB_PORT" ]; then
                printf "\033[1;31mError: DNS port cannot be same as Web port (%s)\033[0m\n" "$WEB_PORT"
                printf "\033[1;33mPlease try again.\033[0m\n"
                continue
            fi
            break
        fi
        printf "\033[1;33mPlease try again.\033[0m\n"
    done
    
    printf "\n"
}

generate_password_hash() {
    if ! command -v htpasswd >/dev/null 2>&1; then
        printf "\033[1;31mhtpasswd not found. Cannot generate password hash.\033[0m\n"
        return 1
    fi
    
    AGH_PASS_HASH=$(htpasswd -B -n -b "" "$AGH_PASS" 2>/dev/null | cut -d: -f2)
    
    if [ -z "$AGH_PASS_HASH" ]; then
        printf "\033[1;31mFailed to generate password hash.\033[0m\n"
        return 1
    fi
    
    printf "\033[1;32mPassword hash generated successfully\033[0m\n"
    return 0
}

# =============================================================================
# YAML Configuration
# =============================================================================

generate_yaml() {
    local yaml_path yaml_template_url yaml_tmp ntp_domain
  
    if [ "$SERVICE_NAME" = "AdGuardHome" ]; then
        yaml_path="/etc/AdGuardHome/AdGuardHome.yaml"
    else
        # OpenWrt package: check which path exists
        if [ -f "/etc/adguardhome/adguardhome.yaml" ] || [ "$PACKAGE_MANAGER" = "apk" ]; then
            # New version (24.10+) or apk
            yaml_path="/etc/adguardhome/adguardhome.yaml"
            mkdir -p /etc/adguardhome
        else
            # Old version (23.05 or earlier)
            yaml_path="/etc/adguardhome.yaml"
        fi
    fi
    
    yaml_template_url="${SCRIPT_BASE_URL}/adguardhome.yaml"
    yaml_tmp="/tmp/adguardhome.yaml.tmp"
    
    printf "\033[1;34mDownloading AdGuard Home configuration template\033[0m\n"
    
    if ! download_text_file "$yaml_template_url" "$yaml_tmp"; then
        printf "\033[1;31mFailed to download YAML template.\033[0m\n"
        return 1
    fi
    
    # Get NTP domain from system configuration
    ntp_server=$(uci -q get system.ntp.server | head -n1)
    ntp_domain=$(echo "$ntp_server" | awk -F. '{
        if (NF==4) print $0;
        else if (NF>=3) print $(NF-2)"."$(NF-1)"."$NF;
        else if (NF==2) print $(NF-1)"."$NF;
        else print $0
    }')
    
    # Replace placeholders
    sed -i "s|{{AGH_USER}}|${AGH_USER}|g" "$yaml_tmp"
    sed -i "s|{{AGH_PASS_HASH}}|${AGH_PASS_HASH}|g" "$yaml_tmp"
    sed -i "s|{{DNS_PORT}}|${DNS_PORT}|g" "$yaml_tmp"
    sed -i "s|{{DNS_BACKUP_PORT}}|${DNS_BACKUP_PORT}|g" "$yaml_tmp"
    sed -i "s|{{WEB_PORT}}|${WEB_PORT}|g" "$yaml_tmp"
    
    # Handle NTP domain: replace if configured, remove lines if not
    if [ -n "$ntp_domain" ]; then
        sed -i "s|{{NTP_DOMAIN}}|${ntp_domain}|g" "$yaml_tmp"
    else
        sed -i "/{{NTP_DOMAIN}}/d" "$yaml_tmp"
    fi
    
    # Move to final location
    if ! mv "$yaml_tmp" "$yaml_path"; then
        printf "\033[1;31mFailed to move YAML file to: %s\033[0m\n" "$yaml_path"
        rm -f "$yaml_tmp"
        return 1
    fi

    if ! chmod 600 "$yaml_path"; then
        printf "\033[1;31mFailed to set permissions on: %s\033[0m\n" "$yaml_path"
        return 1
    fi
    
    # Set ownership for OpenWrt package version
    if [ "$SERVICE_NAME" = "adguardhome" ]; then
        if id adguardhome >/dev/null 2>&1; then
            chown adguardhome:adguardhome "$yaml_path"
            
            # Set ownership for parent directory (apk/SNAPSHOT only)
            if [ "$PACKAGE_MANAGER" = "apk" ]; then
                [ -d "/etc/adguardhome" ] && chown adguardhome:adguardhome /etc/adguardhome
            fi
        fi
    fi
    
    printf "\033[1;32mConfiguration file created: %s\033[0m\n" "$yaml_path"
}

# =============================================================================
# Network Configuration
# =============================================================================

get_iface_addrs() {
    local flag=0
    
    if ip -4 -o addr show dev "$LAN" scope global | grep -q 'inet '; then
        NET_ADDR=$(ip -4 -o addr show dev "$LAN" scope global | awk 'NR==1{sub(/\/.*/,"",$4); print $4}')
        flag=$((flag | 1))
    else
        printf "\033[1;33mWarning: No IPv4 address on %s\033[0m\n" "$LAN"
    fi

    if ip -6 -o addr show dev "$LAN" scope global | grep -q 'inet6 '; then
        NET_ADDR6_LIST=$(ip -6 -o addr show dev "$LAN" scope global | grep -v temporary | awk 'match($4,/^(2|fd|fc)/){sub(/\/.*/,"",$4); print $4;}')
        flag=$((flag | 2))
    else
        printf "\033[1;33mWarning: No IPv6 address on %s\033[0m\n" "$LAN"
    fi

    case $flag in
        3) FAMILY_TYPE=any  ;;
        1) FAMILY_TYPE=ipv4 ;;
        2) FAMILY_TYPE=ipv6 ;;
        *) FAMILY_TYPE=""   ;;
    esac
}

common_config() {
    cp /etc/config/dhcp     /etc/config/dhcp.adguard.bak
    cp /etc/config/firewall /etc/config/firewall.adguard.bak
    
    uci batch << EOF 2>/dev/null
set dhcp.@dnsmasq[0].noresolv='1'
set dhcp.@dnsmasq[0].cachesize='0'
set dhcp.@dnsmasq[0].rebind_protection='0'
set dhcp.@dnsmasq[0].port='${DNS_BACKUP_PORT}'
set dhcp.@dnsmasq[0].domain='lan'
set dhcp.@dnsmasq[0].local='/lan/'
set dhcp.@dnsmasq[0].expandhosts='1'
del dhcp.@dnsmasq[0].server
add_list dhcp.@dnsmasq[0].server='127.0.0.1#${DNS_PORT}'
add_list dhcp.@dnsmasq[0].server='::1#${DNS_PORT}'
del dhcp.lan.dhcp_option
add_list dhcp.lan.dhcp_option='6,${NET_ADDR}'
del dhcp.lan.dhcp_option6
EOF

    uci commit dhcp
    
    restart_service dnsmasq || { rollback_to_backup; exit 1; }
    restart_service odhcpd || { rollback_to_backup; exit 1; }
    /etc/init.d/"$SERVICE_NAME" enable
    
    printf "Router IPv4: %s\n" "$NET_ADDR"
    if [ -z "$NET_ADDR6_LIST" ]; then
        printf "\033[1;33mRouter IPv6: none found\033[0m\n"
    else
        printf "Router IPv6: %s\n" "$NET_ADDR6_LIST"
    fi
    
    printf "\033[1;32mSystem configuration completed\033[0m\n"
}

common_config_firewall() {
    rule_name="adguardhome_dns_${DNS_PORT}"
    uci -q delete firewall."$rule_name" 2>/dev/null || true
    
    if [ -z "$FAMILY_TYPE" ]; then
        printf "\033[1;31mNo valid IP address family detected. Skipping firewall rule setup.\033[0m\n"
        return
    fi
    
    uci batch << EOF 2>/dev/null
set firewall.${rule_name}=redirect
set firewall.${rule_name}.name='AdGuard Home DNS Redirect (${FAMILY_TYPE})'
set firewall.${rule_name}.family='${FAMILY_TYPE}'
set firewall.${rule_name}.src='lan'
set firewall.${rule_name}.dest='lan'
add_list firewall.${rule_name}.proto='tcp'
add_list firewall.${rule_name}.proto='udp'
set firewall.${rule_name}.src_dport='${DNS_PORT}'
set firewall.${rule_name}.dest_port='${DNS_PORT}'
set firewall.${rule_name}.target='DNAT'
commit firewall
EOF
    
    restart_service firewall || { rollback_to_backup; exit 1; }
    
    printf "\033[1;32mFirewall configuration completed\033[0m\n"
}

# =============================================================================
# Configuration Restore Module
# =============================================================================

# Rollback to backup files (for installation errors)
rollback_to_backup() {
    printf "Rolling back to backup configuration\n"
    
    for cfg in dhcp firewall; do
        bak="/etc/config/${cfg}.adguard.bak"
        if [ -f "$bak" ]; then
            cp "$bak" "/etc/config/${cfg}"
        fi
    done
    
    restart_service dnsmasq 2>/dev/null
    restart_service odhcpd 2>/dev/null
    restart_service firewall 2>/dev/null
    
    printf "\033[1;32mRollback completed\033[0m\n"
}

# Restore network configuration to OpenWrt defaults
# This ensures network connectivity even if installation fails
restore_defaults() {
    printf "\033[1;31mRestoring network configuration to defaults\033[0m\n"
    
    # Restore dnsmasq
    uci batch << EOF 2>/dev/null
del dhcp.@dnsmasq[0].noresolv
del dhcp.@dnsmasq[0].cachesize
del dhcp.@dnsmasq[0].rebind_protection
set dhcp.@dnsmasq[0].port='53'
del dhcp.@dnsmasq[0].server
del dhcp.lan.dhcp_option
del dhcp.lan.dhcp_option6
commit dhcp
EOF
    
    # Remove firewall rule
    local rule_name="adguardhome_dns_${DNS_PORT:-53}"
    uci -q delete firewall."$rule_name" 2>/dev/null
    uci commit firewall 2>/dev/null
    
    # Restart services
    restart_service dnsmasq 2>/dev/null
    restart_service odhcpd 2>/dev/null
    restart_service firewall 2>/dev/null
    
    printf "\033[1;32mDefaults restored\033[0m\n"
}

# =============================================================================
# Removal Functions
# =============================================================================

remove_dependencies() {
    printf "\033[1;34mCleaning up dependencies\033[0m\n"
    
    # Check if apache was originally installed
    if is_apache_installed; then
        printf "%s is installed - skipping htpasswd and dependencies cleanup\n" "$HTPASSWD_PROVIDER"
        return 0
    fi
    
    # Remove htpasswd binary
    if [ -f /usr/bin/htpasswd ]; then
        printf "Removing htpasswd... "
        rm -f /usr/bin/htpasswd && printf "Done\n" || printf "Failed\n"
    fi
    
    # Remove dependency libraries
    printf "Removing dependency libraries... "
    case "$PACKAGE_MANAGER" in
        apk)
            for pkg in $HTPASSWD_DEPS; do
                apk del "$pkg" >/dev/null 2>&1
            done
            ;;
        opkg)
            for pkg in $HTPASSWD_DEPS; do
                opkg remove --force-depends "$pkg" >/dev/null 2>&1
            done
            ;;
    esac
    printf "Done\n"
    
    # Remove ca-bundle
    printf "Removing %s... " "$CA_BUNDLE_PKG"
    case "$PACKAGE_MANAGER" in
        apk)
            apk del "$CA_BUNDLE_PKG" >/dev/null 2>&1
            ;;
        opkg)
            opkg remove "$CA_BUNDLE_PKG" >/dev/null 2>&1
            ;;
    esac
    printf "Done\n"
    
    printf "\033[1;32mDependency cleanup completed\033[0m\n"
}

remove_adguardhome() {
    local auto_confirm="${1:-$REMOVE_MODE}"
    local detected_service

    printf "\033[1;34mRemoving AdGuard Home\033[0m\n"

    if ! detect_adguardhome_service; then
        printf "\033[1;31mAdGuard Home not found\033[0m\n"
        return 1
    fi

    detected_service="$DETECTED_SERVICE_NAME"

    printf "Found AdGuard Home (%s version)\n" "$DETECTED_SERVICE_TYPE"
    
    if [ "$auto_confirm" != "auto" ]; then
        printf "Do you want to remove it? (y/N): "
        read -r confirm
        case "$confirm" in
            [yY]*) ;;
            *) printf "\033[1;33mCancelled\033[0m\n"; return 0 ;;
        esac
    else
        printf "\033[1;33mAuto-removing...\033[0m\n"
    fi
    
    /etc/init.d/"${detected_service}" stop    2>/dev/null || true
    /etc/init.d/"${detected_service}" disable 2>/dev/null || true

    if [ "$DETECTED_SERVICE_TYPE" = "official" ]; then
        # Official binary: uninstall service
        "/etc/${detected_service}/${detected_service}" -s uninstall 2>/dev/null || true
    else
        # OpenWrt package: remove via package manager
        if [ -z "$PACKAGE_MANAGER" ]; then
            if command -v apk >/dev/null 2>&1; then
                PACKAGE_MANAGER="apk"
            elif command -v opkg >/dev/null 2>&1; then
                PACKAGE_MANAGER="opkg"
            else
                printf "\033[1;31mPackage manager not detected\033[0m\n"
                return 1
            fi
        fi
        
        # Remove package
        printf "Removing adguardhome package... "
        case "$PACKAGE_MANAGER" in
            apk)
                apk del adguardhome >/dev/null 2>&1 && printf "Done\n" || printf "Failed\n"
                ;;
            opkg)
                opkg remove adguardhome >/dev/null 2>&1 && printf "Done\n" || printf "Failed\n"
                ;;
        esac
    fi

    if [ -d "$AGH_DIR_OFFICIAL" ] || [ -d "$AGH_DIR_SNAPSHOT" ] || [ -f "$AGH_CONFIG_RELEASE" ]; then
        if [ "$auto_confirm" != "auto" ]; then
            printf "Do you want to delete the AdGuard Home configuration file(s)? (y/N): "
            read -r cfg
            case "$cfg" in
                [yY]*) 
                    [ -d "$AGH_DIR_OFFICIAL" ] && rm -rf "$AGH_DIR_OFFICIAL"
                    [ -d "$AGH_DIR_SNAPSHOT" ] && rm -rf "$AGH_DIR_SNAPSHOT"
                    rm -f "$AGH_CONFIG_RELEASE"
                    ;;
            esac
        else
            [ -d "$AGH_DIR_OFFICIAL" ] && rm -rf "$AGH_DIR_OFFICIAL"
            [ -d "$AGH_DIR_SNAPSHOT" ] && rm -rf "$AGH_DIR_SNAPSHOT"
            rm -f "$AGH_CONFIG_RELEASE"
        fi
    fi

    # Restore from backup if exists, otherwise use defaults
    if [ -f "/etc/config/dhcp.adguard.bak" ]; then
        rollback_to_backup
        # Remove backup files
        for cfg in dhcp firewall; do
            rm -f "/etc/config/${cfg}.adguard.bak"
        done
    else
        printf "\033[1;33mNo backup found, restoring safe defaults\033[0m\n"
        restore_defaults
    fi

    # Remove firewall rule
    rule_name="adguardhome_dns_${DNS_PORT:-53}"
    if uci -q get firewall."$rule_name" >/dev/null 2>&1; then
        printf "\033[1;34mRemoving firewall rule\033[0m\n"
        uci batch << EOF 2>/dev/null
delete firewall.${rule_name}
commit firewall
EOF
    fi

    # Clean up dependencies
    remove_dependencies

    restart_network_services

    printf "\033[1;32mAdGuard Home has been removed successfully.\033[0m\n"
}

# =============================================================================
# Access Information Display
# =============================================================================

get_access() {
    local cfg port addr
    
    if [ -f "$AGH_CONFIG_OFFICIAL" ]; then
        cfg="$AGH_CONFIG_OFFICIAL"
    elif [ -f "$AGH_CONFIG_SNAPSHOT" ]; then
        cfg="$AGH_CONFIG_SNAPSHOT"
    elif [ -f "$AGH_CONFIG_RELEASE" ]; then
        cfg="$AGH_CONFIG_RELEASE"
    fi
    
    if [ -n "$cfg" ]; then
        addr=$(awk '
            $1=="http:" {flag=1; next}
            flag && /^[[:space:]]*address:/ {print $2; exit}
        ' "$cfg" 2>/dev/null)
        port="${addr##*:}"
    fi
    [ -z "$port" ] && port=$WEB_PORT

    printf "\n"
    printf "\033[1;32m========================================\033[0m\n"
    printf "\033[1;32m  AdGuard Home is ready!\033[0m\n"
    printf "\033[1;32m========================================\033[0m\n"
    printf "\033[1;33m  Username: %s\033[0m\n" "$AGH_USER"
    printf "\033[1;33m  Password: %s\033[0m\n" "$AGH_PASS"
    printf "\033[1;32m========================================\033[0m\n"
    
    printf "\033[1;32mWeb interface is now available:\033[0m\n\n"
    
    printf "\033[1;32mWeb interface IPv4:\033[0m\n"
    printf "  http://%s:%s/\n" "$NET_ADDR" "$port"
    
    if [ -n "$NET_ADDR6_LIST" ]; then
        set -- $NET_ADDR6_LIST
        printf "\033[1;32mWeb interface IPv6:\033[0m\n"
        printf "  http://[%s]:%s/\n" "$1" "$port"
    fi
    
    if command -v qrencode >/dev/null 2>&1; then
        printf "\n\033[1;34mQR Code for IPv4:\033[0m\n"
        printf "http://%s:%s/\n" "$NET_ADDR" "$port" | qrencode -t UTF8 -v 3
        if [ -n "$NET_ADDR6_LIST" ]; then
            set -- $NET_ADDR6_LIST
            printf "\n\033[1;34mQR Code for IPv6:\033[0m\n"
            printf "http://[%s]:%s/\n" "$1" "$port" | qrencode -t UTF8 -v 3
        fi
    fi
}

# =============================================================================
# Banner Function
# =============================================================================

print_banner() {
    local title="$1"
    local version="$2"
    
    printf "\n"
    printf "\033[1;34m========================================\033[0m\n"
    printf "\033[1;34m  %s\033[0m\n" "$title"
    if [ -n "$version" ]; then
        printf "\033[1;36m  Version: %s\033[0m\n" "$version"
    fi
    printf "\033[1;34m========================================\033[0m\n"
    printf "\n"
}

adguardhome_main() {
    # =========================================================================
    # Phase 1: Parse command line options
    # =========================================================================
    parse_options "$@"
    
    # =========================================================================
    # Phase 2: Apply environment variables
    # =========================================================================
    apply_environment_variables
    
    # =========================================================================
    # Phase 3: Force official mode for OpenWrt < 21 (no adguardhome package)
    # =========================================================================
    if [ "$OS_MAJOR_VERSION" -ne 0 ] && [ "$OS_MAJOR_VERSION" -lt 21 ] && [ "$IS_SNAPSHOT" != true ]; then
        INSTALL_MODE="official"
    fi
    
    # =========================================================================
    # Phase 4: Route to appropriate handler based on mode
    # =========================================================================
    
    # --- Update Credentials Mode ---
    if [ -n "$UPDATE_CREDENTIALS" ]; then
        print_banner "AdGuard Home Credentials Update"
        update_credentials
        exit 0
    fi
    
    # --- Remove Mode ---
    if [ -n "$REMOVE_MODE" ]; then
        print_banner "AdGuard Home Removal"
        remove_adguardhome "$REMOVE_MODE"
        return 0
    fi
    
    # --- Install Mode ---
    print_banner "AdGuard Home Installation" "$VERSION"
    
    # System check
    check_system
    
    # Select install mode (interactive if not specified)
    select_install_mode

    # Update package lists (only in standalone mode)
    if [ -z "$TUI_MODE" ]; then
        # Standalone mode: perform package list update
        case "$PACKAGE_MANAGER" in
            opkg)
                printf "Updating package lists... "
                if opkg update >/dev/null 2>&1; then
                    printf "Done\n"
                else
                    printf "Failed\n"
                    opkg update
                    exit 1
                fi
                ;;
            apk)
                printf "Updating package lists... "
                if apk update >/dev/null 2>&1; then
                    printf "Done\n"
                else
                    printf "Failed\n"
                    apk update
                    exit 1
                fi
                ;;
        esac
    else
        # TUI mode: package list update already handled by update_package_manager()
        printf "Package lists already updated (TUI mode)\n"
    fi
    
    # Handle YAML generation skip
    if [ -n "$NO_YAML" ]; then
        printf "\033[1;33mYAML generation skipped (-n option). Use web interface for initial setup.\033[0m\n"
        install_cacertificates
        if ! install_"$INSTALL_MODE"; then
            printf "\033[1;31mInstallation failed. Aborting.\033[0m\n"
            exit 1
        fi
        get_iface_addrs
        common_config
        common_config_firewall
        printf "\n\033[1;32mAdGuard Home installed. Configure via web interface.\033[0m\n"
        printf "Access: http://%s:3000/\n" "$NET_ADDR"
        return 0
        
        # prompt_reboot
    fi
    
    # Install dependencies (htpasswd)
    install_dependencies || {
        printf "\033[1;31mFailed to install dependencies. Aborting.\033[0m\n"
        exit 1
    }
    
    # =========================================================================
    # Phase 5: Handle credentials based on mode
    # =========================================================================
    if is_interactive_mode; then
        # Interactive mode: prompt for credentials
        prompt_credentials
    else
        # Non-interactive mode: use environment or defaults
        set_default_credentials
    fi
    
    # Generate password hash
    generate_password_hash || {
        printf "\033[1;31mFailed to generate password hash. Aborting.\033[0m\n"
        exit 1
    }
    
    # =========================================================================
    # Phase 6: Install and configure
    # =========================================================================
    
    install_cacertificates
    
    # Determine SERVICE_NAME and prepare directory before YAML generation
    case "$INSTALL_MODE" in
        official)
            SERVICE_NAME="AdGuardHome"
            mkdir -p /etc/AdGuardHome
            ;;
        openwrt)
            SERVICE_NAME="adguardhome"
            if [ "$PACKAGE_MANAGER" = "apk" ]; then
                mkdir -p /etc/adguardhome
            fi
            ;;
    esac
    
    # Generate YAML first (before package installation)
    if ! generate_yaml; then
        printf "\033[1;31mYAML generation failed. Aborting.\033[0m\n"
        exit 1
    fi
    
    # Install package (will use existing YAML)
    if ! install_"$INSTALL_MODE"; then
        printf "\033[1;31mInstallation failed. Aborting.\033[0m\n"
        exit 1
    fi
    
    get_iface_addrs
    common_config
    common_config_firewall

    /etc/init.d/"$SERVICE_NAME" start
    
    printf "\n\033[1;32mAdGuard Home installation and configuration completed successfully.\033[0m\n\n"
    get_access
    
    # prompt_reboot
}

# =============================================================================
# Script Execution
# =============================================================================

if [ "$(basename "$0")" = "adguardhome.sh" ]; then
    adguardhome_main "$@"
fi
