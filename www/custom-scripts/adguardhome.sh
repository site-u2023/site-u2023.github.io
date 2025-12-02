#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC3043
# AdGuard Home Installation/Management Script for OpenWrt
# Reference: https://openwrt.org/docs/guide-user/services/dns/adguard-home
#            https://github.com/AdguardTeam/AdGuardHome
# This script file can be used standalone.

VERSION="R7.1202.1747"

# =============================================================================
# Configuration Variables
# =============================================================================

# BEGIN_VARIABLE_DEFINITIONS
# END_VARIABLE_DEFINITIONS

# System requirements
MINIMUM_MEM="20"
MINIMUM_FLASH="25"
RECOMMENDED_MEM="50"
RECOMMENDED_FLASH="100"

# Default values
AGH_USER="${AGH_USER:-admin}"
AGH_PASS="${AGH_PASS:-password}"
WEB_PORT="${WEB_PORT:-8000}"
DNS_PORT="${DNS_PORT:-53}"
DNS_BACKUP_PORT="${DNS_BACKUP_PORT:-54}"
LAN_ADDR="${LAN_ADDR:-192.168.1.1}"

# Network interface
LAN="${LAN:-br-lan}"

# Script base URL for YAML template download
SCRIPT_BASE_URL="${SCRIPT_BASE_URL:-https://site-u.pages.dev/www/custom-scripts}"

# Action mode (unified control variable)
# Values: install_openwrt, install_official, change_credentials, remove
ACTION_MODE="${ACTION_MODE:-}"

# Remove mode: auto or manual (for backward compatibility)
REMOVE_MODE="${REMOVE_MODE:-}"

# Skip resource check flag
SKIP_RESOURCE_CHECK="${SKIP_RESOURCE_CHECK:-}"

# No YAML generation flag
NO_YAML="${NO_YAML:-}"

# Internal variables
NET_ADDR=""
NET_ADDR6_LIST=""
SERVICE_NAME=""
INSTALL_TYPE=""
ARCH=""
AGH_PASS_HASH=""
PACKAGE_MANAGER=""
FAMILY_TYPE=""
YAML_PATH=""

# =============================================================================
# Utility Functions
# =============================================================================

print_color() {
    local color="$1"
    local message="$2"
    printf "\033[%sm%s\033[0m\n" "$color" "$message"
}

print_info() {
    print_color "1;34" "$1"
}

print_success() {
    print_color "1;32" "$1"
}

print_warning() {
    print_color "1;33" "$1"
}

print_error() {
    print_color "1;31" "$1"
}

# =============================================================================
# Detection Functions
# =============================================================================

detect_package_manager() {
    if command -v opkg >/dev/null 2>&1; then
        PACKAGE_MANAGER="opkg"
    elif command -v apk >/dev/null 2>&1; then
        PACKAGE_MANAGER="apk"
    else
        print_error "No supported package manager (apk or opkg) found."
        print_error "This script is designed for OpenWrt systems only."
        return 1
    fi
    return 0
}

detect_lan_interface() {
    LAN="$(ubus call network.interface.lan status 2>/dev/null | jsonfilter -e '@.l3_device')"
    if [ -z "$LAN" ]; then
        print_error "LAN interface not found. Aborting."
        return 1
    fi
    return 0
}

detect_architecture() {
    case "$(uname -m)" in
        aarch64|arm64) ARCH="arm64" ;;
        armv7l)        ARCH="armv7" ;;
        armv6l)        ARCH="armv6" ;;
        armv5l)        ARCH="armv5" ;;
        x86_64|amd64)  ARCH="amd64" ;;
        i386|i686)     ARCH="386" ;;
        mips)          ARCH="mipsle" ;;
        mips64)        ARCH="mips64le" ;;
        *)
            print_error "Unsupported architecture: $(uname -m)"
            return 1
            ;;
    esac
    return 0
}

is_adguardhome_installed() {
    if /etc/AdGuardHome/AdGuardHome --version >/dev/null 2>&1; then
        INSTALL_TYPE="official"
        SERVICE_NAME="AdGuardHome"
        YAML_PATH="/etc/AdGuardHome/AdGuardHome.yaml"
        return 0
    elif /usr/bin/AdGuardHome --version >/dev/null 2>&1; then
        INSTALL_TYPE="openwrt"
        SERVICE_NAME="adguardhome"
        YAML_PATH="/etc/adguardhome.yaml"
        return 0
    fi
    return 1
}

get_iface_addrs() {
    local flag=0
    
    NET_ADDR=""
    NET_ADDR6_LIST=""
    FAMILY_TYPE=""
    
    if ip -4 -o addr show dev "$LAN" scope global 2>/dev/null | grep -q 'inet '; then
        NET_ADDR=$(ip -4 -o addr show dev "$LAN" scope global | awk 'NR==1{sub(/\/.*/,"",$4); print $4}')
        flag=$((flag | 1))
    else
        print_warning "No IPv4 address on $LAN"
    fi
    
    if ip -6 -o addr show dev "$LAN" scope global 2>/dev/null | grep -q 'inet6 '; then
        NET_ADDR6_LIST=$(ip -6 -o addr show dev "$LAN" scope global | grep -v temporary | awk 'match($4,/^(2|fd|fc)/){sub(/\/.*/,"",$4); print $4;}')
        flag=$((flag | 2))
    else
        print_warning "No IPv6 address on $LAN"
    fi
    
    case $flag in
        3) FAMILY_TYPE="any"  ;;
        1) FAMILY_TYPE="ipv4" ;;
        2) FAMILY_TYPE="ipv6" ;;
        *) FAMILY_TYPE=""     ;;
    esac
}

# =============================================================================
# System Requirements Check
# =============================================================================

check_system_requirements() {
    local mem_total_kb mem_free_kb buffers_kb cached_kb
    local flash_total_kb flash_free_kb df_out
    local mem_ok flash_ok
    
    print_info "Checking system requirements"
    
    # Memory check
    mem_total_kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
    mem_free_kb=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
    buffers_kb=$(awk '/^Buffers:/ {print $2}' /proc/meminfo)
    cached_kb=$(awk '/^Cached:/ {print $2}' /proc/meminfo)
    
    if [ -n "$mem_free_kb" ]; then
        MEM_FREE_MB=$((mem_free_kb / 1024))
    else
        MEM_FREE_MB=$(((buffers_kb + cached_kb) / 1024))
    fi
    MEM_TOTAL_MB=$((mem_total_kb / 1024))
    
    # Flash check
    df_out=$(df -k / | awk 'NR==2 {print $2, $4}')
    flash_total_kb=$(printf '%s\n' "$df_out" | awk '{print $1}')
    flash_free_kb=$(printf '%s\n' "$df_out" | awk '{print $2}')
    FLASH_FREE_MB=$((flash_free_kb / 1024))
    FLASH_TOTAL_MB=$((flash_total_kb / 1024))
    
    # Display status
    if [ "$MEM_FREE_MB" -lt "$MINIMUM_MEM" ]; then
        mem_ok="1;31"
    else
        mem_ok="1;32"
    fi
    
    if [ "$FLASH_FREE_MB" -lt "$MINIMUM_FLASH" ]; then
        flash_ok="1;31"
    else
        flash_ok="1;32"
    fi
    
    printf "Memory: Free \033[%sm%s MB\033[0m / Total %s MB (Min: %s MB)\n" \
        "$mem_ok" "$MEM_FREE_MB" "$MEM_TOTAL_MB" "$MINIMUM_MEM"
    printf "Flash: Free \033[%sm%s MB\033[0m / Total %s MB (Min: %s MB)\n" \
        "$flash_ok" "$FLASH_FREE_MB" "$FLASH_TOTAL_MB" "$MINIMUM_FLASH"
    printf "LAN interface: %s\n" "$LAN"
    printf "Package manager: %s\n" "$PACKAGE_MANAGER"
    
    # Skip check if requested
    if [ -n "$SKIP_RESOURCE_CHECK" ]; then
        print_warning "Resource check skipped by user request"
        return 0
    fi
    
    # Verify requirements
    if [ "$MEM_FREE_MB" -lt "$MINIMUM_MEM" ]; then
        print_error "Insufficient memory. At least ${MINIMUM_MEM}MB RAM is required."
        return 1
    fi
    
    if [ "$FLASH_FREE_MB" -lt "$MINIMUM_FLASH" ]; then
        print_error "Insufficient flash storage. At least ${MINIMUM_FLASH}MB free space is required."
        return 1
    fi
    
    print_success "System requirements met"
    return 0
}

# =============================================================================
# Package Installation Functions
# =============================================================================

install_packages() {
    local opts="$1"
    shift
    local pkgs="$*"
    local p
    
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

update_package_lists() {
    printf "Updating package lists (%s)... " "$PACKAGE_MANAGER"
    
    case "$PACKAGE_MANAGER" in
        opkg)
            if opkg update >/dev/null 2>&1; then
                printf "Done\n"
                return 0
            fi
            ;;
        apk)
            if apk update >/dev/null 2>&1; then
                printf "Done\n"
                return 0
            fi
            ;;
    esac
    
    printf "Failed\n"
    print_warning "Showing detailed output:"
    
    case "$PACKAGE_MANAGER" in
        opkg) opkg update ;;
        apk)  apk update ;;
    esac
    
    print_error "Package update failed"
    return 1
}

install_ca_certificates() {
    case "$PACKAGE_MANAGER" in
        apk)  install_packages "" ca-bundle ;;
        opkg) install_packages "--verbosity=0" ca-bundle ;;
    esac
}

install_htpasswd_dependencies() {
    print_info "Installing dependencies for password hashing"
    
    case "$PACKAGE_MANAGER" in
        opkg)
            install_packages "--nodeps" libaprutil libapr libexpat libuuid1 apache
            cp /usr/bin/htpasswd /tmp/htpasswd 2>/dev/null
            opkg remove --force-depends apache >/dev/null 2>&1
            mv /tmp/htpasswd /usr/bin/htpasswd 2>/dev/null
            chmod +x /usr/bin/htpasswd 2>/dev/null
            ;;
        apk)
            install_packages "--force" libaprutil libapr libexpat libuuid1 apache
            cp /usr/bin/htpasswd /tmp/htpasswd 2>/dev/null
            apk del --force apache >/dev/null 2>&1
            mv /tmp/htpasswd /usr/bin/htpasswd 2>/dev/null
            chmod +x /usr/bin/htpasswd 2>/dev/null
            ;;
    esac
    
    if command -v htpasswd >/dev/null 2>&1; then
        print_success "htpasswd installed successfully"
        return 0
    else
        print_error "htpasswd installation failed"
        return 1
    fi
}

# =============================================================================
# Credential Input Functions
# =============================================================================

prompt_credentials() {
    print_info "AdGuard Home Admin Setup"
    
    # Username
    while [ -z "$AGH_USER" ] || [ "$AGH_USER" = "admin" ]; do
        printf "Enter admin username [admin]: "
        read -r AGH_USER
        AGH_USER="${AGH_USER:-admin}"
        break
    done
    
    # Password
    while [ -z "$AGH_PASS" ] || [ ${#AGH_PASS} -lt 8 ]; do
        printf "Enter admin password (min 8 chars): "
        stty -echo 2>/dev/null
        read -r AGH_PASS
        stty echo 2>/dev/null
        printf "\n"
        
        if [ ${#AGH_PASS} -lt 8 ]; then
            print_error "Password must be at least 8 characters"
            AGH_PASS=""
        fi
    done
    
    # Password confirmation
    printf "Confirm password: "
    stty -echo 2>/dev/null
    read -r pass_confirm
    stty echo 2>/dev/null
    printf "\n"
    
    if [ "$AGH_PASS" != "$pass_confirm" ]; then
        print_error "Passwords do not match. Aborting."
        return 1
    fi
    
    return 0
}

prompt_web_port() {
    local current_port="$1"
    local new_port
    
    printf "Enter WEB port [%s]: " "$current_port"
    read -r new_port
    
    if [ -z "$new_port" ]; then
        new_port="$current_port"
    fi
    
    WEB_PORT="$new_port"
}

generate_password_hash() {
    if ! command -v htpasswd >/dev/null 2>&1; then
        print_error "htpasswd not found. Cannot generate password hash."
        return 1
    fi
    
    AGH_PASS_HASH=$(htpasswd -B -n -b "" "$AGH_PASS" 2>/dev/null | cut -d: -f2)
    
    if [ -z "$AGH_PASS_HASH" ]; then
        print_error "Failed to generate password hash."
        return 1
    fi
    
    print_success "Password hash generated successfully"
    return 0
}

# =============================================================================
# YAML Configuration Functions
# =============================================================================

generate_yaml() {
    local yaml_template_url yaml_tmp
    
    if [ "$INSTALL_TYPE" = "official" ] || [ "$SERVICE_NAME" = "AdGuardHome" ]; then
        YAML_PATH="/etc/AdGuardHome/AdGuardHome.yaml"
    else
        YAML_PATH="/etc/adguardhome.yaml"
    fi
    
    yaml_template_url="${SCRIPT_BASE_URL}/adguardhome.yaml"
    yaml_tmp="/tmp/adguardhome.yaml.tmp"
    
    print_info "Downloading AdGuard Home configuration template"
    
    if ! { wget -q -O "$yaml_tmp" "$yaml_template_url" || wget -q --no-check-certificate -O "$yaml_tmp" "$yaml_template_url"; }; then
        print_error "Failed to download YAML template."
        return 1
    fi
    
    # Replace placeholders
    sed -i "s|{{AGH_USER}}|${AGH_USER}|g" "$yaml_tmp"
    sed -i "s|{{AGH_PASS_HASH}}|${AGH_PASS_HASH}|g" "$yaml_tmp"
    sed -i "s|{{DNS_PORT}}|${DNS_PORT}|g" "$yaml_tmp"
    sed -i "s|{{DNS_BACKUP_PORT}}|${DNS_BACKUP_PORT}|g" "$yaml_tmp"
    sed -i "s|{{WEB_PORT}}|${WEB_PORT}|g" "$yaml_tmp"
    
    mv "$yaml_tmp" "$YAML_PATH"
    chmod 600 "$YAML_PATH"
    
    print_success "Configuration file created: $YAML_PATH"
    return 0
}

update_yaml_credentials() {
    local yaml_file="$1"
    local new_user="$2"
    local new_hash="$3"
    local new_web_port="$4"
    
    if [ ! -f "$yaml_file" ]; then
        print_error "YAML file not found: $yaml_file"
        return 1
    fi
    
    print_info "Updating credentials in $yaml_file"
    
    # Backup original
    cp "$yaml_file" "${yaml_file}.bak"
    
    # Update username (find line with "name:" under "users:" section)
    sed -i "s/^\([[:space:]]*-[[:space:]]*name:[[:space:]]*\).*/\1${new_user}/" "$yaml_file"
    
    # Update password hash (find line with "password:" under "users:" section)
    # Escape special characters in hash for sed
    local escaped_hash
    escaped_hash=$(printf '%s\n' "$new_hash" | sed 's/[&/\$]/\\&/g')
    sed -i "s|^\([[:space:]]*password:[[:space:]]*\).*|\1${escaped_hash}|" "$yaml_file"
    
    # Update WEB port if provided
    if [ -n "$new_web_port" ]; then
        sed -i "s/^\([[:space:]]*address:[[:space:]]*[0-9.]*:\)[0-9]*/\1${new_web_port}/" "$yaml_file"
    fi
    
    print_success "Credentials updated"
    return 0
}

# =============================================================================
# System Configuration Functions
# =============================================================================

create_config_backup() {
    print_info "Creating configuration backup"
    
    cp /etc/config/network  /etc/config/network.adguard.bak 2>/dev/null
    cp /etc/config/dhcp     /etc/config/dhcp.adguard.bak 2>/dev/null
    cp /etc/config/firewall /etc/config/firewall.adguard.bak 2>/dev/null
}

configure_dnsmasq() {
    print_info "Configuring dnsmasq"
    
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
        local ip
        for ip in $NET_ADDR6_LIST; do
            uci add_list dhcp.lan.dhcp_option6="option6:dns=[${ip}]"
        done
    fi
    
    uci commit dhcp
}

configure_firewall() {
    local rule_name="adguardhome_dns_${DNS_PORT}"
    
    print_info "Configuring firewall"
    
    uci -q delete firewall."$rule_name" || true
    
    if [ -z "$FAMILY_TYPE" ]; then
        print_warning "No valid IP address family detected. Skipping firewall rule setup."
        return 0
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
    
    print_success "Firewall configuration completed"
}

restart_services() {
    print_info "Restarting services"
    
    /etc/init.d/dnsmasq restart || {
        print_error "Failed to restart dnsmasq"
        return 1
    }
    
    /etc/init.d/odhcpd restart || {
        print_error "Failed to restart odhcpd"
        return 1
    }
    
    /etc/init.d/firewall restart || {
        print_error "Failed to restart firewall"
        return 1
    }
    
    return 0
}

apply_system_configuration() {
    get_iface_addrs
    create_config_backup
    configure_dnsmasq
    configure_firewall
    
    if ! restart_services; then
        return 1
    fi
    
    /etc/init.d/"$SERVICE_NAME" enable
    /etc/init.d/"$SERVICE_NAME" start
    
    printf "Router IPv4: %s\n" "$NET_ADDR"
    if [ -z "$NET_ADDR6_LIST" ]; then
        print_warning "Router IPv6: none found"
    else
        printf "Router IPv6: %s\n" "$NET_ADDR6_LIST"
    fi
    
    print_success "System configuration completed"
    return 0
}

# =============================================================================
# Display Functions
# =============================================================================

display_access_info() {
    local cfg port addr
    
    # Get WEB port from config
    if [ -f "$YAML_PATH" ]; then
        addr=$(awk '
            $1=="http:" {flag=1; next}
            flag && /^[[:space:]]*address:/ {print $2; exit}
        ' "$YAML_PATH" 2>/dev/null)
        port="${addr##*:}"
    fi
    [ -z "$port" ] && port="$WEB_PORT"
    
    printf "\n"
    print_success "========================================"
    print_success "  AdGuard Home is ready!"
    print_success "========================================"
    print_warning "  Username: $AGH_USER"
    print_warning "  Password: $AGH_PASS"
    print_success "========================================"
    
    # IPv4 URL
    print_success "Web interface IPv4:"
    printf "  http://%s:%s/\n" "$NET_ADDR" "$port"
    
    # IPv6 URL (first address only)
    if [ -n "$NET_ADDR6_LIST" ]; then
        set -- $NET_ADDR6_LIST
        print_success "Web interface IPv6:"
        printf "  http://[%s]:%s/\n" "$1" "$port"
    fi
    
    # QR Code (if available)
    if command -v qrencode >/dev/null 2>&1; then
        printf "\n"
        print_info "QR Code for IPv4:"
        printf "http://%s:%s/\n" "$NET_ADDR" "$port" | qrencode -t UTF8 -v 3
        
        if [ -n "$NET_ADDR6_LIST" ]; then
            set -- $NET_ADDR6_LIST
            printf "\n"
            print_info "QR Code for IPv6:"
            printf "http://[%s]:%s/\n" "$1" "$port" | qrencode -t UTF8 -v 3
        fi
    fi
}

# =============================================================================
# Interactive Prompt Functions
# =============================================================================

show_install_prompt() {
    while true; do
        printf "[1] Install OpenWrt package\n"
        printf "[2] Install Official binary\n"
        printf "[0] Exit\n"
        printf "Please select (1, 2 or 0): "
        read -r choice
        
        case "$choice" in
            1) ACTION_MODE="install_openwrt"; return 0 ;;
            2) ACTION_MODE="install_official"; return 0 ;;
            0)
                print_warning "Installation cancelled."
                return 1
                ;;
            *)
                print_error "Invalid choice '$choice'. Please enter 1, 2, or 0."
                ;;
        esac
    done
}

show_manage_prompt() {
    while true; do
        printf "[1] Change credentials (User/Password/WEB Port)\n"
        printf "[2] Remove AdGuard Home\n"
        printf "[0] Exit\n"
        printf "Please select (1, 2 or 0): "
        read -r choice
        
        case "$choice" in
            1) ACTION_MODE="change_credentials"; return 0 ;;
            2) ACTION_MODE="remove"; return 0 ;;
            0)
                print_warning "Operation cancelled."
                return 1
                ;;
            *)
                print_error "Invalid choice '$choice'. Please enter 1, 2, or 0."
                ;;
        esac
    done
}

# =============================================================================
# Main Action Functions
# =============================================================================

install_openwrt() {
    local pkg_ver
    
    print_info "Installing AdGuard Home (OpenWrt package)"
    
    case "$PACKAGE_MANAGER" in
        apk)
            pkg_ver=$(apk search adguardhome 2>/dev/null | grep "^adguardhome-" | sed 's/^adguardhome-//' | sed 's/-r[0-9]*$//')
            if [ -n "$pkg_ver" ]; then
                apk add adguardhome || {
                    print_error "Network error during apk add. Aborting."
                    return 1
                }
                print_success "adguardhome $pkg_ver has been installed"
            else
                print_warning "Package 'adguardhome' not found in apk repository"
                print_info "Falling back to official binary installation"
                install_official
                return $?
            fi
            ;;
        opkg)
            pkg_ver=$(opkg list 2>/dev/null | grep "^adguardhome " | awk '{print $3}')
            if [ -n "$pkg_ver" ]; then
                opkg install --verbosity=0 adguardhome || {
                    print_error "Network error during opkg install. Aborting."
                    return 1
                }
                print_success "adguardhome $pkg_ver has been installed"
            else
                print_warning "Package 'adguardhome' not found in opkg repository"
                print_info "Falling back to official binary installation"
                install_official
                return $?
            fi
            ;;
    esac
    
    SERVICE_NAME="adguardhome"
    INSTALL_TYPE="openwrt"
    YAML_PATH="/etc/adguardhome.yaml"
    
    return 0
}

install_official() {
    local ca_opt url ver tar_file dest_file
    
    print_info "Installing AdGuard Home (official binary)"
    
    ca_opt="--no-check-certificate"
    url="https://api.github.com/repos/AdguardTeam/AdGuardHome/releases/latest"
    
    ver=$({ wget -q -O - "$url" || wget -q "$ca_opt" -O - "$url"; } | jsonfilter -e '@.tag_name')
    
    if [ -z "$ver" ]; then
        print_error "Failed to get AdGuardHome version from GitHub API."
        return 1
    fi
    
    if ! detect_architecture; then
        return 1
    fi
    
    mkdir -p /etc/AdGuardHome
    
    tar_file="AdGuardHome_linux_${ARCH}.tar.gz"
    dest_file="/etc/AdGuardHome/${tar_file}"
    url="https://github.com/AdguardTeam/AdGuardHome/releases/download/${ver}/${tar_file}"
    
    printf "Downloading AdGuardHome %s for %s\n" "$ver" "$ARCH"
    
    if ! { wget -q -O "$dest_file" "$url" || wget -q "$ca_opt" -O "$dest_file" "$url"; }; then
        print_error "Download failed. Please check network connection."
        return 1
    fi
    
    print_success "AdGuardHome $ver has been downloaded"
    
    tar -C /etc/ -xzf "$dest_file"
    rm -f "$dest_file"
    chmod +x /etc/AdGuardHome/AdGuardHome
    
    /etc/AdGuardHome/AdGuardHome -s install >/dev/null 2>&1 || {
        print_error "Service installation failed. Check AdGuardHome.yaml and port availability."
        return 1
    }
    
    chmod 700 /etc/AdGuardHome
    
    SERVICE_NAME="AdGuardHome"
    INSTALL_TYPE="official"
    YAML_PATH="/etc/AdGuardHome/AdGuardHome.yaml"
    
    print_success "AdGuard Home official binary installed successfully"
    return 0
}

execute_credential_change() {
    local current_user current_port
    
    print_info "Changing AdGuard Home credentials"
    
    if [ ! -f "$YAML_PATH" ]; then
        print_error "Configuration file not found: $YAML_PATH"
        return 1
    fi
    
    # Get current values from YAML
    current_user=$(awk '
        /^users:/ { in_users=1; next }
        in_users && /^[^ ]/ { exit }
        in_users && $1 == "-" && $2 == "name:" { print $3; exit }
    ' "$YAML_PATH")
    
    current_port=$(awk '
        $1=="http:" {flag=1; next}
        flag && /^[[:space:]]*address:/ {
            split($2, a, ":")
            print a[2]
            exit
        }
    ' "$YAML_PATH")
    
    [ -z "$current_user" ] && current_user="admin"
    [ -z "$current_port" ] && current_port="$WEB_PORT"
    
    printf "Current username: %s\n" "$current_user"
    printf "Current WEB port: %s\n" "$current_port"
    printf "\n"
    
    # Reset variables to force new input
    AGH_USER=""
    AGH_PASS=""
    
    # Prompt for new credentials
    printf "Enter new username [%s]: " "$current_user"
    read -r AGH_USER
    [ -z "$AGH_USER" ] && AGH_USER="$current_user"
    
    # Password input
    while [ -z "$AGH_PASS" ] || [ ${#AGH_PASS} -lt 8 ]; do
        printf "Enter new password (min 8 chars): "
        stty -echo 2>/dev/null
        read -r AGH_PASS
        stty echo 2>/dev/null
        printf "\n"
        
        if [ ${#AGH_PASS} -lt 8 ]; then
            print_error "Password must be at least 8 characters"
            AGH_PASS=""
        fi
    done
    
    # Password confirmation
    printf "Confirm password: "
    stty -echo 2>/dev/null
    read -r pass_confirm
    stty echo 2>/dev/null
    printf "\n"
    
    if [ "$AGH_PASS" != "$pass_confirm" ]; then
        print_error "Passwords do not match. Aborting."
        return 1
    fi
    
    # WEB port
    prompt_web_port "$current_port"
    
    # Install htpasswd if needed
    if ! command -v htpasswd >/dev/null 2>&1; then
        if ! install_htpasswd_dependencies; then
            return 1
        fi
    fi
    
    # Generate password hash
    if ! generate_password_hash; then
        return 1
    fi
    
    # Update YAML
    if ! update_yaml_credentials "$YAML_PATH" "$AGH_USER" "$AGH_PASS_HASH" "$WEB_PORT"; then
        return 1
    fi
    
    # Restart service
    print_info "Restarting AdGuard Home service"
    /etc/init.d/"$SERVICE_NAME" restart || {
        print_error "Failed to restart service"
        return 1
    }
    
    printf "\n"
    print_success "========================================"
    print_success "  Credentials updated successfully!"
    print_success "========================================"
    print_warning "  Username: $AGH_USER"
    print_warning "  Password: $AGH_PASS"
    print_warning "  WEB Port: $WEB_PORT"
    print_success "========================================"
    
    return 0
}

remove_adguardhome() {
    local remove_mode="${1:-manual}"
    local confirm cfg bak rule_name
    
    print_info "Removing AdGuard Home"
    
    if ! is_adguardhome_installed; then
        print_error "AdGuard Home is not installed"
        return 1
    fi
    
    printf "Found AdGuard Home (%s version)\n" "$INSTALL_TYPE"
    
    # Confirmation (unless auto mode)
    if [ "$remove_mode" != "auto" ]; then
        printf "Do you want to remove it? (y/N): "
        read -r confirm
        case "$confirm" in
            [yY]*)
                ;;
            *)
                print_warning "Cancelled"
                return 0
                ;;
        esac
    else
        print_warning "Auto-removing AdGuard Home"
    fi
    
    # Stop and disable service
    /etc/init.d/"$SERVICE_NAME" stop 2>/dev/null || true
    /etc/init.d/"$SERVICE_NAME" disable 2>/dev/null || true
    
    # Remove installation
    if [ "$INSTALL_TYPE" = "official" ]; then
        /etc/AdGuardHome/AdGuardHome -s uninstall 2>/dev/null || true
    else
        case "$PACKAGE_MANAGER" in
            apk)  apk del adguardhome 2>/dev/null || true ;;
            opkg) opkg remove --verbosity=0 adguardhome 2>/dev/null || true ;;
        esac
    fi
    
    # Remove configuration files
    if [ -d "/etc/AdGuardHome" ] || [ -f "/etc/adguardhome.yaml" ]; then
        if [ "$remove_mode" != "auto" ]; then
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
    
    # Restore configuration from backup
    for cfg in network dhcp firewall; do
        bak="/etc/config/${cfg}.adguard.bak"
        if [ -f "$bak" ]; then
            print_info "Restoring $cfg configuration from backup"
            cp "$bak" "/etc/config/${cfg}"
            rm -f "$bak"
        fi
    done
    
    # Restore dnsmasq defaults if no backup
    if [ ! -f "/etc/config/dhcp.adguard.bak" ]; then
        print_info "Restoring dnsmasq to default configuration"
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
    rule_name="adguardhome_dns_${DNS_PORT}"
    if uci -q get firewall."$rule_name" >/dev/null 2>&1; then
        print_info "Removing firewall rule"
        uci -q delete firewall."$rule_name"
        uci commit firewall
    fi
    
    uci commit network
    uci commit dhcp
    uci commit firewall
    
    # Restart services
    /etc/init.d/dnsmasq restart || print_error "Failed to restart dnsmasq"
    /etc/init.d/odhcpd restart || print_error "Failed to restart odhcpd"
    /etc/init.d/firewall restart || print_error "Failed to restart firewall"
    
    print_success "AdGuard Home has been removed successfully."
    return 0
}

# =============================================================================
# Command Line Option Parser
# =============================================================================

parse_options() {
    while [ $# -gt 0 ]; do
        case "$1" in
            -c)
                SKIP_RESOURCE_CHECK=1
                ;;
            -n)
                NO_YAML=1
                ;;
            -r)
                shift
                if [ -z "$1" ]; then
                    print_error "Option -r requires an argument (auto or manual)"
                    return 1
                fi
                REMOVE_MODE="$1"
                ACTION_MODE="remove"
                ;;
            -i)
                shift
                if [ -z "$1" ]; then
                    print_error "Option -i requires an argument (openwrt or official)"
                    return 1
                fi
                case "$1" in
                    openwrt)  ACTION_MODE="install_openwrt" ;;
                    official) ACTION_MODE="install_official" ;;
                    *)
                        print_error "Invalid install mode: $1"
                        return 1
                        ;;
                esac
                ;;
            -m)
                ACTION_MODE="change_credentials"
                ;;
            -h|--help)
                printf "Usage: %s [OPTIONS]\n\n" "$(basename "$0")"
                printf "Options:\n"
                printf "  -i <mode>   Install mode: openwrt or official\n"
                printf "  -m          Change credentials (User/Password/WEB Port)\n"
                printf "  -r <mode>   Remove mode: auto or manual\n"
                printf "  -c          Skip resource check\n"
                printf "  -n          Skip YAML auto-generation\n"
                printf "  -h          Show this help\n"
                return 1
                ;;
            *)
                print_error "Unknown option: $1"
                return 1
                ;;
        esac
        shift
    done
    return 0
}

# =============================================================================
# Main Entry Point
# =============================================================================

adguardhome_main() {
    local standalone_mode=""
    
    # Detect standalone mode
    [ "$(basename "$0")" = "adguardhome.sh" ] && standalone_mode="1"
    
    printf "\n"
    print_info "========================================"
    print_info "  AdGuard Home Manager v$VERSION"
    print_info "========================================"
    printf "\n"
    
    # Detect package manager
    if ! detect_package_manager; then
        return 1
    fi
    
    # Detect LAN interface
    if ! detect_lan_interface; then
        return 1
    fi
    
    # Check installation status
    if is_adguardhome_installed; then
        # =====================================================================
        # AdGuard Home is INSTALLED
        # =====================================================================
        print_info "AdGuard Home is already installed ($INSTALL_TYPE version)"
        printf "\n"
        
        # Determine action if not set
        if [ -z "$ACTION_MODE" ]; then
            if [ -n "$REMOVE_MODE" ]; then
                ACTION_MODE="remove"
            else
                if ! show_manage_prompt; then
                    return 0
                fi
            fi
        fi
        
        # Execute action
        case "$ACTION_MODE" in
            change_credentials)
                execute_credential_change
                ;;
            remove)
                remove_adguardhome "${REMOVE_MODE:-manual}"
                
                # Reboot prompt for standalone mode
                if [ -n "$standalone_mode" ] && [ -z "$REMOVE_MODE" ]; then
                    printf "\n"
                    print_warning "Press [Enter] to reboot."
                    read -r _
                    reboot
                fi
                ;;
            *)
                print_error "Invalid action for installed state: $ACTION_MODE"
                return 1
                ;;
        esac
        
    else
        # =====================================================================
        # AdGuard Home is NOT INSTALLED
        # =====================================================================
        print_info "AdGuard Home is not installed"
        printf "\n"
        
        # Check system requirements
        if ! check_system_requirements; then
            return 1
        fi
        
        # Determine action if not set
        if [ -z "$ACTION_MODE" ]; then
            if ! show_install_prompt; then
                return 0
            fi
        fi
        
        # Validate action
        case "$ACTION_MODE" in
            install_openwrt|install_official)
                ;;
            change_credentials|remove)
                print_error "Cannot $ACTION_MODE: AdGuard Home is not installed"
                return 1
                ;;
            *)
                print_error "Invalid action: $ACTION_MODE"
                return 1
                ;;
        esac
        
        # Update package lists
        if ! update_package_lists; then
            return 1
        fi
        
        # Install htpasswd dependencies (for YAML generation)
        if [ -z "$NO_YAML" ]; then
            if ! install_htpasswd_dependencies; then
                return 1
            fi
        fi
        
        # Prompt for credentials (if not provided)
        if [ -z "$NO_YAML" ]; then
            if [ -z "$AGH_USER" ] || [ "$AGH_USER" = "admin" ] || [ -z "$AGH_PASS" ] || [ "$AGH_PASS" = "password" ]; then
                if ! prompt_credentials; then
                    return 1
                fi
            fi
            
            if ! generate_password_hash; then
                return 1
            fi
        fi
        
        # Install CA certificates
        install_ca_certificates
        
        # Execute installation
        case "$ACTION_MODE" in
            install_openwrt)
                if ! install_openwrt; then
                    return 1
                fi
                ;;
            install_official)
                if ! install_official; then
                    return 1
                fi
                ;;
        esac
        
        # Generate YAML configuration
        if [ -z "$NO_YAML" ]; then
            if ! generate_yaml; then
                return 1
            fi
        fi
        
        # Apply system configuration
        if ! apply_system_configuration; then
            return 1
        fi
        
        printf "\n"
        print_success "AdGuard Home installation completed successfully."
        
        # Display access information
        if [ -z "$NO_YAML" ]; then
            display_access_info
        else
            printf "\n"
            print_warning "YAML auto-generation was skipped."
            print_warning "Please complete the initial setup via web interface."
        fi
        
        # Reboot prompt for standalone mode
        if [ -n "$standalone_mode" ]; then
            printf "\n"
            print_warning "Press [Enter] to reboot."
            read -r _
            reboot
        fi
    fi
    
    return 0
}

# =============================================================================
# Script Entry Point
# =============================================================================

# Parse command line options
if ! parse_options "$@"; then
    exit 1
fi

# Run main function
if [ "$(basename "$0")" = "adguardhome.sh" ]; then
    adguardhome_main
fi
