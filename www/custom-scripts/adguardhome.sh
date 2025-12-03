#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC3043
# OpenWrt 19.07+ configuration
# Reference: https://openwrt.org/docs/guide-user/services/dns/adguard-home
#            https://github.com/AdguardTeam/AdGuardHome
# This script file can be used standalone.

VERSION="R7.1203.1040"

# =============================================================================
# Variable Initialization (empty by default)
# =============================================================================

# Operation mode variables (set by command line options)
INSTALL_MODE=""        # -i: openwrt|official
REMOVE_MODE=""         # -r: auto|manual
NO_YAML=""             # -n: skip YAML generation
SKIP_RESOURCE_CHECK="" # -c: skip resource check

# Credential variables (set by environment or interactive input)
AGH_USER=""
AGH_PASS=""
AGH_PASS_HASH=""

# Port/Address variables (set by environment or defaults)
WEB_PORT=""
DNS_PORT=""
DNS_BACKUP_PORT=""
LAN_ADDR=""

# System detection variables
NET_ADDR=""
NET_ADDR6_LIST=""
SERVICE_NAME=""
ARCH=""
AGH=""
PACKAGE_MANAGER=""
FAMILY_TYPE=""
LAN=""

# =============================================================================
# Default Values (used as fallback)
# =============================================================================

DEFAULT_AGH_USER="admin"
DEFAULT_AGH_PASS="password"
DEFAULT_WEB_PORT="8000"
DEFAULT_DNS_PORT="53"
DEFAULT_DNS_BACKUP_PORT="54"
DEFAULT_LAN_ADDR="192.168.1.1"
DEFAULT_LAN="br-lan"

# =============================================================================
# Requirements
# =============================================================================

REQUIRED_MEM="20"
REQUIRED_FLASH="25"

# =============================================================================
# Script Configuration
# =============================================================================

SCRIPT_BASE_URL="${SCRIPT_BASE_URL:-https://site-u.pages.dev/www/custom-scripts}"

# BEGIN_VARIABLE_DEFINITIONS
# END_VARIABLE_DEFINITIONS

# =============================================================================
# Option Parser
# =============================================================================

print_usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  -i SOURCE    Install from specified source (openwrt|official)
  -r MODE      Remove AdGuard Home (auto|manual)
  -c           Skip system resource check
  -n           Skip YAML configuration generation (use web setup)
  -h           Show this help message

Environment Variables:
  AGH_USER         Admin username (default: admin)
  AGH_PASS         Admin password (default: password, min 8 chars)
  WEB_PORT         Web interface port (default: 8000)
  DNS_PORT         DNS service port (default: 53)
  DNS_BACKUP_PORT  Backup dnsmasq port (default: 54)
  LAN_ADDR         LAN interface address (default: auto-detect)

Examples:
  Interactive install:
    sh $(basename "$0")

  Non-interactive install:
    AGH_USER=admin AGH_PASS=mypassword sh $(basename "$0") -i official

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
                    INSTALL_MODE_FROM_ARGS="1"
                    shift
                else
                    printf "\033[1;31mError: -i requires an argument (openwrt|official)\033[0m\n"
                    exit 1
                fi
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
    LAN_ADDR="${LAN_ADDR:-$DEFAULT_LAN_ADDR}"
    LAN="${LAN:-$DEFAULT_LAN}"
    
    # AGH_USER and AGH_PASS remain as-is from environment (may be empty)
    # They will be handled by prompt_credentials() or set_default_credentials()
}

# =============================================================================
# Mode Detection
# =============================================================================

INSTALL_MODE_FROM_ARGS=""

is_standalone_mode() {
    # Standalone mode: INSTALL_MODE not specified via args, and no REMOVE_MODE
    [ -z "$INSTALL_MODE_FROM_ARGS" ] && [ -z "$REMOVE_MODE" ]
}

is_interactive_mode() {
    # Interactive mode: standalone AND credentials not pre-set
    is_standalone_mode && [ -z "$AGH_USER" ] && [ -z "$AGH_PASS" ]
}

# =============================================================================
# System Check Functions
# =============================================================================

check_system() {
    if /etc/AdGuardHome/AdGuardHome --version >/dev/null 2>&1 || /usr/bin/AdGuardHome --version >/dev/null 2>&1; then
        printf "\033[1;33mAdGuard Home is already installed.\033[0m\n"
        remove_adguardhome
        return 0
    fi
    
    printf "\033[1;34mChecking system requirements\033[0m\n"
    
    LAN="$(ubus call network.interface.lan status 2>/dev/null | jsonfilter -e '@.l3_device')"
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
    
    if [ "$MEM_FREE_MB" -lt "$REQUIRED_MEM" ]; then
        mem_col="1;31"
    else
        mem_col="1;32"
    fi
    if [ "$FLASH_FREE_MB" -lt "$REQUIRED_FLASH" ]; then
        flash_col="1;31"
    else
        flash_col="1;32"
    fi
    
    printf "Memory: Free \033[%sm%s MB\033[0m / Total %s MB (Min: %s MB / Recommended: 50 MB)\n" \
        "$mem_col" "$MEM_FREE_MB" "$MEM_TOTAL_MB" "$REQUIRED_MEM"
    printf "Flash: Free \033[%sm%s MB\033[0m / Total %s MB (Min: %s MB / Recommended: 100 MB)\n" \
        "$flash_col" "$FLASH_FREE_MB" "$FLASH_TOTAL_MB" "$REQUIRED_FLASH"
    
    # Skip resource check if -c option specified
    if [ -n "$SKIP_RESOURCE_CHECK" ]; then
        printf "\033[1;33mResource check skipped by -c option\033[0m\n"
        return 0
    fi
    
    if [ "$MEM_FREE_MB" -lt "$REQUIRED_MEM" ]; then
        printf "\033[1;31mError: Insufficient memory. At least %sMB RAM is required.\033[0m\n" \
            "$REQUIRED_MEM"
        exit 1
    fi
    if [ "$FLASH_FREE_MB" -lt "$REQUIRED_FLASH" ]; then
        printf "\033[1;31mError: Insufficient flash storage. At least %sMB free space is required.\033[0m\n" \
            "$REQUIRED_FLASH"
        exit 1
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

install_dependencies() {
    printf "\033[1;34mEnsuring htpasswd and dependencies are available\033[0m\n"
    
    # Check if htpasswd is already available and functional
    if command -v htpasswd >/dev/null 2>&1; then
        if htpasswd -B -n -b "" "test" >/dev/null 2>&1; then
            printf "\033[1;32mhtpasswd is already available and functional\033[0m\n"
            return 0
        fi
    fi
    
    case "$PACKAGE_MANAGER" in
        opkg)
            printf "Installing dependencies: "
            for p in libaprutil libapr libexpat libuuid1; do
                printf "%s " "$p"
                opkg install --nodeps "$p" >/dev/null 2>&1
            done
            printf "Done\n"
            
            local apache_was_installed=0
            if opkg list-installed 2>/dev/null | grep -q "^apache "; then
                apache_was_installed=1
            fi
            
            # If htpasswd doesn't exist, reinstall apache
            if [ ! -f /usr/bin/htpasswd ]; then
                printf "Installing apache package to obtain htpasswd... "
                
                # Force reinstall if apache exists but htpasswd is missing
                if [ "$apache_was_installed" -eq 1 ]; then
                    opkg remove --force-depends apache >/dev/null 2>&1
                fi
                
                opkg install --nodeps apache >/dev/null 2>&1
                
                if [ -f /usr/bin/htpasswd ]; then
                    chmod +x /usr/bin/htpasswd 2>/dev/null
                    printf "Done\n"
                    
                    # Only remove apache if it wasn't originally installed
                    if [ "$apache_was_installed" -eq 0 ]; then
                        printf "Preserving htpasswd and removing apache... "
                        cp /usr/bin/htpasswd /tmp/htpasswd 2>/dev/null
                        opkg remove --force-depends apache >/dev/null 2>&1
                        mv /tmp/htpasswd /usr/bin/htpasswd 2>/dev/null
                        chmod +x /usr/bin/htpasswd 2>/dev/null
                        printf "Done\n"
                    fi
                else
                    printf "Failed\n"
                fi
            elif [ ! -x /usr/bin/htpasswd ]; then
                # File exists but not executable
                chmod +x /usr/bin/htpasswd 2>/dev/null
            fi
            ;;
        apk)
            printf "Installing dependencies: "
            for p in libaprutil libapr libexpat libuuid1; do
                printf "%s " "$p"
                apk add --force "$p" >/dev/null 2>&1
            done
            printf "Done\n"
            
            local apache_was_installed=0
            if apk info -e apache >/dev/null 2>&1; then
                apache_was_installed=1
            fi
            
            # If htpasswd doesn't exist, reinstall apache
            if [ ! -f /usr/bin/htpasswd ]; then
                printf "Installing apache package to obtain htpasswd... "
                
                # Force reinstall if apache exists but htpasswd is missing
                if [ "$apache_was_installed" -eq 1 ]; then
                    apk del --force apache >/dev/null 2>&1
                fi
                
                apk add --force apache >/dev/null 2>&1
                
                if [ -f /usr/bin/htpasswd ]; then
                    chmod +x /usr/bin/htpasswd 2>/dev/null
                    printf "Done\n"
                    
                    # Only remove apache if it wasn't originally installed
                    if [ "$apache_was_installed" -eq 0 ]; then
                        printf "Preserving htpasswd and removing apache... "
                        cp /usr/bin/htpasswd /tmp/htpasswd 2>/dev/null
                        apk del --force apache >/dev/null 2>&1
                        mv /tmp/htpasswd /usr/bin/htpasswd 2>/dev/null
                        chmod +x /usr/bin/htpasswd 2>/dev/null
                        printf "Done\n"
                    fi
                else
                    printf "Failed\n"
                fi
            elif [ ! -x /usr/bin/htpasswd ]; then
                # File exists but not executable
                chmod +x /usr/bin/htpasswd 2>/dev/null
            fi
            ;;
    esac
    
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
            install_packages "" ca-bundle
            ;;
        opkg)
            install_packages "--verbosity=0" ca-bundle
            ;;
    esac
}

install_openwrt() {
    printf "Installing adguardhome (OpenWrt package)\n"
    
    case "$PACKAGE_MANAGER" in
        apk)
            PKG_VER=$(apk search adguardhome | grep "^adguardhome-" | sed 's/^adguardhome-//' | sed 's/-r[0-9]*$//')
            if [ -n "$PKG_VER" ]; then
                apk add adguardhome || {
                    printf "\033[1;31mNetwork error during apk add. Aborting.\033[0m\n"
                    exit 1
                }
                printf "\033[1;32madguardhome %s has been installed\033[0m\n" "$PKG_VER"
            else
                printf "\033[1;31mPackage 'adguardhome' not found in apk repository, falling back to official\033[0m\n"
                install_official
                return
            fi
            ;;
        opkg)
            PKG_VER=$(opkg list | grep "^adguardhome " | awk '{print $3}')
            if [ -n "$PKG_VER" ]; then
                opkg install --verbosity=0 adguardhome || {
                    printf "\033[1;31mNetwork error during opkg install. Aborting.\033[0m\n"
                    exit 1
                }
                printf "\033[1;32madguardhome %s has been installed\033[0m\n" "$PKG_VER"
            else
                printf "\033[1;31mPackage 'adguardhome' not found in opkg repository, falling back to official\033[0m\n"
                install_official
                return
            fi
            ;;
    esac
    
    SERVICE_NAME="adguardhome"
}

install_official() {
    CA="--no-check-certificate"
    URL="https://api.github.com/repos/AdguardTeam/AdGuardHome/releases/latest"
    VER=$( { wget -q -O - "$URL" || wget -q "$CA" -O - "$URL"; } | jsonfilter -e '@.tag_name' )
    [ -n "$VER" ] || { printf "\033[1;31mError: Failed to get AdGuardHome version from GitHub API.\033[0m\n"; exit 1; }
    
    mkdir -p /etc/AdGuardHome
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
    if ! { wget -q -O "$DEST" "$URL2" || wget -q "$CA" -O "$DEST" "$URL2"; }; then
        printf '\033[1;31mDownload failed. Please check network connection.\033[0m\n'
        exit 1
    fi
    printf "\033[1;32mAdGuardHome %s has been downloaded\033[0m\n" "$VER"
    
    tar -C /etc/ -xzf "/etc/AdGuardHome/${TAR}"
    rm "/etc/AdGuardHome/${TAR}"
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
    
    # Password input with validation
    while true; do
        printf "Enter admin password (min 8 chars): "
        stty -echo 2>/dev/null
        read -r input_pass
        stty echo 2>/dev/null
        printf "\n"
        
        if [ -z "$input_pass" ]; then
            printf "\033[1;31mPassword cannot be empty\033[0m\n"
            continue
        fi
        
        if [ ${#input_pass} -lt 8 ]; then
            printf "\033[1;31mPassword must be at least 8 characters\033[0m\n"
            continue
        fi
        
        AGH_PASS="$input_pass"
        break
    done
    
    # Password confirmation
    printf "Confirm password: "
    stty -echo 2>/dev/null
    read -r confirm_pass
    stty echo 2>/dev/null
    printf "\n"
    
    if [ "$AGH_PASS" != "$confirm_pass" ]; then
        printf "\033[1;31mPasswords do not match. Aborting.\033[0m\n"
        exit 1
    fi
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
    local yaml_path yaml_template_url yaml_tmp
    
    if [ "$SERVICE_NAME" = "AdGuardHome" ]; then
        yaml_path="/etc/AdGuardHome/AdGuardHome.yaml"
    else
        yaml_path="/etc/adguardhome.yaml"
    fi
    
    yaml_template_url="${SCRIPT_BASE_URL}/adguardhome.yaml"
    yaml_tmp="/tmp/adguardhome.yaml.tmp"
    
    printf "\033[1;34mDownloading AdGuard Home configuration template\033[0m\n"
    
    if ! { wget -q -O "$yaml_tmp" "$yaml_template_url" || wget -q --no-check-certificate -O "$yaml_tmp" "$yaml_template_url"; }; then
        printf "\033[1;31mFailed to download YAML template.\033[0m\n"
        return 1
    fi
    
    sed -i "s|{{AGH_USER}}|${AGH_USER}|g" "$yaml_tmp"
    sed -i "s|{{AGH_PASS_HASH}}|${AGH_PASS_HASH}|g" "$yaml_tmp"
    sed -i "s|{{DNS_PORT}}|${DNS_PORT}|g" "$yaml_tmp"
    sed -i "s|{{DNS_BACKUP_PORT}}|${DNS_BACKUP_PORT}|g" "$yaml_tmp"
    sed -i "s|{{WEB_PORT}}|${WEB_PORT}|g" "$yaml_tmp"
    
    mv "$yaml_tmp" "$yaml_path"
    chmod 600 "$yaml_path"
    
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
    cp /etc/config/network  /etc/config/network.adguard.bak
    cp /etc/config/dhcp     /etc/config/dhcp.adguard.bak
    cp /etc/config/firewall /etc/config/firewall.adguard.bak
    
    uci set dhcp.@dnsmasq[0].noresolv="1"
    uci set dhcp.@dnsmasq[0].cachesize="0"
    uci set dhcp.@dnsmasq[0].rebind_protection='0'
    uci set dhcp.@dnsmasq[0].port="${DNS_BACKUP_PORT}"
    uci set dhcp.@dnsmasq[0].domain="lan"
    uci set dhcp.@dnsmasq[0].local="/lan/"
    uci set dhcp.@dnsmasq[0].expandhosts="1"
    uci -q del dhcp.@dnsmasq[0].server || true
    uci add_list dhcp.@dnsmasq[0].server="127.0.0.1#${DNS_PORT}"
    uci add_list dhcp.@dnsmasq[0].server="::1#${DNS_PORT}"
    uci -q del dhcp.lan.dhcp_option || true
    uci add_list dhcp.lan.dhcp_option="6,${NET_ADDR}"
    uci -q del dhcp.lan.dhcp_option6 || true
    if [ -n "$NET_ADDR6_LIST" ]; then
        for ip in $NET_ADDR6_LIST; do
            uci add_list dhcp.lan.dhcp_option6="option6:dns=[${ip}]"
        done
    fi
    uci commit dhcp
    
    /etc/init.d/dnsmasq restart || {
        printf "\033[1;31mFailed to restart dnsmasq\033[0m\n"
        exit 1
    }
    /etc/init.d/odhcpd restart || {
        printf "\033[1;31mFailed to restart odhcpd\033[0m\n"
        exit 1
    }
    /etc/init.d/"$SERVICE_NAME" enable
    /etc/init.d/"$SERVICE_NAME" start
    
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
    uci -q delete firewall."$rule_name" || true
    
    if [ -z "$FAMILY_TYPE" ]; then
        printf "\033[1;31mNo valid IP address family detected. Skipping firewall rule setup.\033[0m\n"
        return
    fi
    
    uci set "firewall.${rule_name}=redirect"
    uci set "firewall.${rule_name}.name=AdGuardHome DNS Redirect (${FAMILY_TYPE})"
    uci set "firewall.${rule_name}.family=${FAMILY_TYPE}"
    uci set "firewall.${rule_name}.src=lan"
    uci set "firewall.${rule_name}.dest=lan"
    uci add_list "firewall.${rule_name}.proto=tcp"
    uci add_list "firewall.${rule_name}.proto=udp"
    uci set "firewall.${rule_name}.src_dport=${DNS_PORT}"
    uci set "firewall.${rule_name}.dest_port=${DNS_PORT}"
    uci set "firewall.${rule_name}.target=DNAT"
    uci commit firewall
    
    /etc/init.d/firewall restart || {
        printf "\033[1;31mFailed to restart firewall\033[0m\n"
        exit 1
    }
    
    printf "\033[1;32mFirewall configuration completed\033[0m\n"
}

# =============================================================================
# Removal Functions
# =============================================================================

remove_adguardhome() {
    local auto_confirm="${1:-$REMOVE_MODE}"

    printf "\033[1;34mRemoving AdGuard Home\033[0m\n"

    if /etc/AdGuardHome/AdGuardHome --version >/dev/null 2>&1; then
        INSTALL_TYPE="official"; AGH="AdGuardHome"
    elif /usr/bin/AdGuardHome --version >/dev/null 2>&1; then
        INSTALL_TYPE="openwrt"; AGH="adguardhome"
    else
        printf "\033[1;31mAdGuard Home not found\033[0m\n"
        return 1
    fi

    printf "Found AdGuard Home (%s version)\n" "$INSTALL_TYPE"
    
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
    
    /etc/init.d/"${AGH}" stop    2>/dev/null || true
    /etc/init.d/"${AGH}" disable 2>/dev/null || true

    if [ "$INSTALL_TYPE" = "official" ]; then
        "/etc/${AGH}/${AGH}" -s uninstall 2>/dev/null || true
    else
        if command -v apk >/dev/null 2>&1; then
            apk del "$AGH" 2>/dev/null || true
        else
            opkg remove --verbosity=0 "$AGH" 2>/dev/null || true
        fi
    fi

    if [ -d "/etc/${AGH}" ] || [ -f "/etc/adguardhome.yaml" ]; then
        if [ "$auto_confirm" != "auto" ]; then
            printf "Do you want to delete the AdGuard Home configuration file(s)? (y/N): "
            read -r cfg
            case "$cfg" in
                [yY]*) 
                    [ -d "/etc/AdGuardHome" ] && rm -rf /etc/AdGuardHome
                    [ -d "/etc/adguardhome" ] && rm -rf /etc/adguardhome
                    rm -f /etc/adguardhome.yaml
                    ;;
            esac
        else
            [ -d "/etc/AdGuardHome" ] && rm -rf /etc/AdGuardHome
            [ -d "/etc/adguardhome" ] && rm -rf /etc/adguardhome
            rm -f /etc/adguardhome.yaml
        fi
    fi

    for cfg in network dhcp firewall; do
        bak="/etc/config/${cfg}.adguard.bak"
        if [ -f "$bak" ]; then
            printf "\033[1;34mRestoring %s configuration from backup\033[0m\n" "$cfg"
            cp "$bak" "/etc/config/${cfg}"
            rm -f "$bak"
        fi
    done
    
    # Restore defaults if no backup
    if [ ! -f "/etc/config/dhcp.adguard.bak" ]; then
        printf "\033[1;34mRestoring dnsmasq to default configuration\033[0m\n"
        uci -q del dhcp.@dnsmasq[0].noresolv
        uci -q del dhcp.@dnsmasq[0].cachesize
        uci -q del dhcp.@dnsmasq[0].rebind_protection
        uci set dhcp.@dnsmasq[0].port="53"
        uci -q del dhcp.@dnsmasq[0].server
        uci -q del dhcp.lan.dhcp_option
        uci -q del dhcp.lan.dhcp_option6
        uci commit dhcp
    fi
    
    # Remove firewall rule
    rule_name="adguardhome_dns_${DNS_PORT:-53}"
    if uci -q get firewall."$rule_name" >/dev/null 2>&1; then
        printf "\033[1;34mRemoving firewall rule\033[0m\n"
        uci -q delete firewall."$rule_name"
        uci commit firewall
    fi

    uci commit network
    uci commit dhcp
    uci commit firewall

    /etc/init.d/dnsmasq restart  || { printf "\033[1;31mFailed to restart dnsmasq\033[0m\n"; exit 1; }
    /etc/init.d/odhcpd restart   || { printf "\033[1;31mFailed to restart odhcpd\033[0m\n"; exit 1; }
    /etc/init.d/firewall restart || { printf "\033[1;31mFailed to restart firewall\033[0m\n"; exit 1; }

    printf "\033[1;32mAdGuard Home has been removed successfully.\033[0m\n"
    
    # Only prompt for reboot in standalone mode
    if is_standalone_mode; then
        printf "\033[33mPress [Enter] to reboot.\033[0m\n"
        read -r _
        reboot
    fi
}

# =============================================================================
# Access Information Display
# =============================================================================

get_access() {
    local cfg port addr
    
    if [ -f "/etc/AdGuardHome/AdGuardHome.yaml" ]; then
        cfg="/etc/AdGuardHome/AdGuardHome.yaml"
    elif [ -f "/etc/adguardhome.yaml" ]; then
        cfg="/etc/adguardhome.yaml"
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
# Main Entry Point
# =============================================================================

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
    # Phase 3: Route to appropriate handler based on mode
    # =========================================================================
    
    # --- Remove Mode ---
    if [ -n "$REMOVE_MODE" ]; then
        printf "\n\033[1;34m========================================\033[0m\n"
        printf "\033[1;34m  AdGuard Home Removal\033[0m\n"
        printf "\033[1;34m========================================\033[0m\n\n"
        remove_adguardhome "$REMOVE_MODE"
        return 0
    fi
    
    # --- Install Mode ---
    printf "\n\033[1;34m========================================\033[0m\n"
    printf "\033[1;34m  AdGuard Home Installation\033[0m\n"
    printf "\033[1;34m  Version: %s\033[0m\n" "$VERSION"
    printf "\033[1;34m========================================\033[0m\n"
    
    # System check
    check_system
    
    # Select install mode (interactive if not specified)
    select_install_mode
    
    # Update package lists
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
    
    # Handle YAML generation skip
    if [ -n "$NO_YAML" ]; then
        printf "\033[1;33mYAML generation skipped (-n option). Use web interface for initial setup.\033[0m\n"
        install_cacertificates
        install_"$INSTALL_MODE"
        get_iface_addrs
        common_config
        common_config_firewall
        printf "\n\033[1;32mAdGuard Home installed. Configure via web interface.\033[0m\n"
        printf "Access: http://%s:3000/\n" "$NET_ADDR"
        
        if is_standalone_mode; then
            printf "\033[33mPress [Enter] to reboot.\033[0m\n"
            read -r _
            reboot
        fi
        return 0
    fi
    
    # Install dependencies (htpasswd)
    install_dependencies || {
        printf "\033[1;31mFailed to install dependencies. Aborting.\033[0m\n"
        exit 1
    }
    
    # =========================================================================
    # Phase 4: Handle credentials based on mode
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
    # Phase 5: Install and configure
    # =========================================================================
    install_cacertificates
    install_"$INSTALL_MODE"
    generate_yaml
    get_iface_addrs
    common_config
    common_config_firewall
    
    printf "\n\033[1;32mAdGuard Home installation and configuration completed successfully.\033[0m\n\n"
    get_access
    
    # Prompt for reboot only in standalone mode
    if is_standalone_mode; then
        printf "\033[33mPress [Enter] to reboot.\033[0m\n"
        read -r _
        reboot
    fi
}

# =============================================================================
# Script Execution
# =============================================================================

if [ "$(basename "$0")" = "adguardhome.sh" ]; then
    adguardhome_main "$@"
fi
