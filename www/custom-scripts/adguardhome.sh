#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC3043,SC2086
# OpenWrt 19.07+ configuration
# Reference: https://openwrt.org/docs/guide-user/services/dns/adguard-home
#            https://github.com/AdguardTeam/AdGuardHome
# This script file can be used standalone.

VERSION="R7.1202.1439"

NET_ADDR=""
NET_ADDR6_LIST=""
SERVICE_NAME=""
INSTALL_MODE=""
ARCH=""
AGH=""
PACKAGE_MANAGER=""
FAMILY_TYPE=""
AGH_USER=""
AGH_PASS=""
AGH_PASS_HASH=""

# BEGIN_VARIABLE_DEFINITIONS
# END_VARIABLE_DEFINITIONS

MINIMUM_MEM="20"
MINIMUM_FLASH="25"
RECOMMENDED_MEM="50"
RECOMMENDED_FLASH="100"

AGH_USER="${AGH_USER:-admin}"
AGH_PASS="${AGH_PASS:-password}"
WEB_PORT="${WEB_PORT:-8000}"
DNS_PORT="${DNS_PORT:-53}"
DNS_BACKUP_PORT="${DNS_BACKUP_PORT:-54}"
LAN_ADDR="${LAN_ADDR:-192.168.1.1}"

LAN="${LAN:-br-lan}"
SCRIPT_BASE_URL="${SCRIPT_BASE_URL:-https://site-u.pages.dev/www/custom-scripts}"

INSTALLED_DEPS_FILE="/etc/adguardhome_installed_deps.txt"

check_package_manager() {
    if command -v opkg >/dev/null 2>&1; then
        PACKAGE_MANAGER="opkg"
    elif command -v apk >/dev/null 2>&1; then
        PACKAGE_MANAGER="apk"
    else
        printf "\033[1;31mNo supported package manager (apk or opkg) found.\033[0m\n"
        printf "\033[1;31mThis script is designed for OpenWrt systems only.\033[0m\n"
        return 1
    fi
    return 0
}

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
    
    check_package_manager || exit 1
    
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
    
    if [ "$MEM_FREE_MB" -lt "$MINIMUM_MEM" ]; then
        mem_col="1;31"
    else
        mem_col="1;32"
    fi
    if [ "$FLASH_FREE_MB" -lt "$MINIMUM_FLASH" ]; then
        flash_col="1;31"
    else
        flash_col="1;32"
    fi
    
    printf "Memory: Free \033[%sm%s MB\033[0m / Total %s MB\n" \
        "$mem_col" "$MEM_FREE_MB" "$MEM_TOTAL_MB"
    printf "Flash: Free \033[%sm%s MB\033[0m / Total %s MB\n" \
        "$flash_col" "$FLASH_FREE_MB" "$FLASH_TOTAL_MB"
    printf "LAN interface: %s\n" "$LAN"
    printf "Package manager: %s\n" "$PACKAGE_MANAGER"
    
    if [ -z "$SKIP_RESOURCE_CHECK" ]; then
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
    fi
}

install_prompt() {
    printf "\033[1;34mSystem resources are sufficient for AdGuard Home installation. Proceeding with setup.\033[0m\n"

    if [ -n "$INSTALL_MODE" ]; then
        case "$INSTALL_MODE" in
            official|openwrt) return ;;
            *) printf "\033[1;31mWarning: Unrecognized INSTALL_MODE '%s'. Proceeding with interactive prompt.\033[0m\n" "$INSTALL_MODE" ;;
        esac
    fi

    while true; do
        printf "[1] Install OpenWrt package\n"
        printf "[2] Install Official binary\n"
        printf "[0] Exit\n"
        printf "Please select (1, 2 or 0): "
        read -r choice

        case "$choice" in
            1|openwrt) INSTALL_MODE="openwrt"; break ;;
            2|official) INSTALL_MODE="official"; break ;;
            0|exit)
                printf "\033[1;33mInstallation cancelled.\033[0m\n"
                return 0
                ;;
            *) printf "\033[1;31mInvalid choice '%s'. Please enter 1, 2, or 0.\033[0m\n" "$choice" ;;
        esac
    done
}

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

remove_packages() {
    local pkgs="$*"
    
    case "$PACKAGE_MANAGER" in
        opkg)
            for p in $pkgs; do
                opkg remove "$p" >/dev/null 2>&1
            done
            ;;
        apk)
            for p in $pkgs; do
                apk del "$p" >/dev/null 2>&1
            done
            ;;
    esac
}

record_installed_dep() {
    local pkg="$1"
    echo "$pkg" >> "$INSTALLED_DEPS_FILE"
}

install_dependencies() {
    printf "\033[1;34mInstalling dependencies for password hashing\033[0m\n"
    
    : > "$INSTALLED_DEPS_FILE"
    
    case "$PACKAGE_MANAGER" in
        opkg)
            # 1. apache の存在確認
            apache_exists=$(opkg list-installed | grep -q "^apache " && echo 1 || echo 0)
            
            # 2. htpasswd の存在確認
            htpasswd_exists=$(command -v htpasswd >/dev/null 2>&1 && echo 1 || echo 0)
            
            if [ "$apache_exists" -eq 1 ] && [ "$htpasswd_exists" -eq 1 ]; then
                # 両方有り → スキップ
                printf "\033[1;33mapache and htpasswd already exist, skipping\033[0m\n"
            else
                # 3. ライブラリの個別確認とインストール
                for pkg in libaprutil libapr libexpat libuuid1 ca-bundle; do
                    if ! opkg list-installed | grep -q "^${pkg} "; then
                        install_packages "--nodeps" "$pkg"
                        record_installed_dep "$pkg"
                    fi
                done
                
                # 4. apache と htpasswd の処理
                if [ "$apache_exists" -eq 0 ]; then
                    # apache 無し → 通常インストール
                    install_packages "--nodeps" "apache"
                    cp /usr/bin/htpasswd /tmp/htpasswd
                    opkg remove --force-depends apache >/dev/null 2>&1
                    mv /tmp/htpasswd /usr/bin/htpasswd
                    chmod +x /usr/bin/htpasswd
                    echo "FILE:/usr/bin/htpasswd" >> "$INSTALLED_DEPS_FILE"
                elif [ "$htpasswd_exists" -eq 0 ]; then
                    # apache 有り、htpasswd 無し → 強制再インストール
                    install_packages "--force" "apache"
                    cp /usr/bin/htpasswd /tmp/htpasswd
                    opkg remove --force-depends apache >/dev/null 2>&1
                    mv /tmp/htpasswd /usr/bin/htpasswd
                    chmod +x /usr/bin/htpasswd
                    echo "FILE:/usr/bin/htpasswd" >> "$INSTALLED_DEPS_FILE"
                fi
            fi
            ;;
        apk)
            # 1. apache の存在確認
            apache_exists=$(apk info -e apache >/dev/null 2>&1 && echo 1 || echo 0)
            
            # 2. htpasswd の存在確認
            htpasswd_exists=$(command -v htpasswd >/dev/null 2>&1 && echo 1 || echo 0)
            
            if [ "$apache_exists" -eq 1 ] && [ "$htpasswd_exists" -eq 1 ]; then
                # 両方有り → スキップ
                printf "\033[1;33mapache and htpasswd already exist, skipping\033[0m\n"
            else
                # 3. ライブラリの個別確認とインストール
                for pkg in libaprutil libapr libexpat libuuid1 ca-bundle; do
                    if ! apk info -e "$pkg" >/dev/null 2>&1; then
                        install_packages "--force" "$pkg"
                        record_installed_dep "$pkg"
                    fi
                done
                
                # 4. apache と htpasswd の処理
                if [ "$apache_exists" -eq 0 ]; then
                    # apache 無し → 通常インストール
                    install_packages "--force" "apache"
                    cp /usr/bin/htpasswd /tmp/htpasswd
                    apk del --force apache >/dev/null 2>&1
                    mv /tmp/htpasswd /usr/bin/htpasswd
                    chmod +x /usr/bin/htpasswd
                    echo "FILE:/usr/bin/htpasswd" >> "$INSTALLED_DEPS_FILE"
                elif [ "$htpasswd_exists" -eq 0 ]; then
                    # apache 有り、htpasswd 無し → 強制再インストール
                    install_packages "--force-overwrite" "apache"
                    cp /usr/bin/htpasswd /tmp/htpasswd
                    apk del --force apache >/dev/null 2>&1
                    mv /tmp/htpasswd /usr/bin/htpasswd
                    chmod +x /usr/bin/htpasswd
                    echo "FILE:/usr/bin/htpasswd" >> "$INSTALLED_DEPS_FILE"
                fi
            fi
            ;;
    esac
    
    if ! command -v htpasswd >/dev/null 2>&1; then
        printf "\033[1;31mhtpasswd not available\033[0m\n"
        return 1
    fi
    printf "\033[1;32mhtpasswd is ready\033[0m\n"
    return 0
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

prompt_credentials() {
    printf "\033[1;34mAdGuard Home Admin Setup\033[0m\n"
    
    while [ -z "$AGH_USER" ]; do
        printf "Enter admin username [admin]: "
        read -r AGH_USER
        AGH_USER="${AGH_USER:-admin}"
    done
    
    while [ -z "$AGH_PASS" ] || [ ${#AGH_PASS} -lt 8 ]; do
        printf "Enter admin password (min 8 chars): "
        stty -echo 2>/dev/null
        read -r AGH_PASS
        stty echo 2>/dev/null
        printf "\n"
        if [ ${#AGH_PASS} -lt 8 ]; then
            printf "\033[1;31mPassword must be at least 8 characters\033[0m\n"
            AGH_PASS=""
        fi
    done
    
    printf "Confirm password: "
    stty -echo 2>/dev/null
    read -r AGH_PASS_CONFIRM
    stty echo 2>/dev/null
    printf "\n"
    
    if [ "$AGH_PASS" != "$AGH_PASS_CONFIRM" ]; then
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
    
    uci batch <<EOF
set dhcp.@dnsmasq[0].noresolv='1'
set dhcp.@dnsmasq[0].cachesize='0'
set dhcp.@dnsmasq[0].rebind_protection='0'
set dhcp.@dnsmasq[0].port='${DNS_BACKUP_PORT}'
set dhcp.@dnsmasq[0].domain='lan'
set dhcp.@dnsmasq[0].local='/lan/'
set dhcp.@dnsmasq[0].expandhosts='1'
delete dhcp.@dnsmasq[0].server
add_list dhcp.@dnsmasq[0].server='127.0.0.1#${DNS_PORT}'
add_list dhcp.@dnsmasq[0].server='::1#${DNS_PORT}'
delete dhcp.lan.dhcp_option
add_list dhcp.lan.dhcp_option='6,${NET_ADDR}'
delete dhcp.lan.dhcp_option6
EOF

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
    
    uci batch <<EOF
set firewall.${rule_name}=redirect
set firewall.${rule_name}.name='AdGuardHome DNS Redirect (${FAMILY_TYPE})'
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
    
    /etc/init.d/firewall restart || {
        printf "\033[1;31mFailed to restart firewall\033[0m\n"
        exit 1
    }
    
    printf "\033[1;32mFirewall configuration completed\033[0m\n"
}

remove_installed_dependencies() {
    if [ ! -f "$INSTALLED_DEPS_FILE" ]; then
        printf "\033[1;33mNo dependency record found, skipping dependency cleanup\033[0m\n"
        return 0
    fi
    
    local apache_installed=0
    case "$PACKAGE_MANAGER" in
        opkg)
            opkg list-installed | grep -q "^apache " && apache_installed=1
            ;;
        apk)
            apk info -e apache >/dev/null 2>&1 && apache_installed=1
            ;;
    esac
    
    if [ "$apache_installed" -eq 1 ]; then
        printf "\033[1;33mapache is currently installed, skipping dependency cleanup\033[0m\n"
        rm -f "$INSTALLED_DEPS_FILE"
        return 0
    fi
    
    printf "\033[1;34mRemoving installed dependencies\033[0m\n"
    
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        
        case "$line" in
            FILE:*)
                local filepath="${line#FILE:}"
                if [ -f "$filepath" ]; then
                    printf "  Removing file: %s\n" "$filepath"
                    rm -f "$filepath"
                fi
                ;;
            *)
                printf "  Removing package: %s\n" "$line"
                remove_packages "$line"
                ;;
        esac
    done < "$INSTALLED_DEPS_FILE"
    
    rm -f "$INSTALLED_DEPS_FILE"
    printf "\033[1;32mDependency cleanup completed\033[0m\n"
}

remove_adguardhome() {
    local auto_confirm="$1"

    printf "\033[1;34mRemoving AdGuard Home\033[0m\n"
    
    check_package_manager || return 1

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
        printf "\033[1;33mAuto-removing due to installation error\033[0m\n"
    fi
    
    /etc/init.d/"${AGH}" stop    2>/dev/null || true
    /etc/init.d/"${AGH}" disable 2>/dev/null || true

    if [ "$INSTALL_TYPE" = "official" ]; then
        "/etc/${AGH}/${AGH}" -s uninstall 2>/dev/null || true
    else
        case "$PACKAGE_MANAGER" in
            apk)
                apk del "$AGH" 2>/dev/null || true
                ;;
            opkg)
                opkg remove --verbosity=0 "$AGH" 2>/dev/null || true
                ;;
        esac
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

    remove_installed_dependencies

    for cfg in network dhcp firewall; do
        bak="/etc/config/${cfg}.adguard.bak"
        if [ -f "$bak" ]; then
            printf "\033[1;34mRestoring %s configuration from backup\033[0m\n" "$cfg"
            cp "$bak" "/etc/config/${cfg}"
            rm -f "$bak"
        fi
    done
    
    # Restore defaults if no backup (manual install or backup missing)
    if [ ! -f "/etc/config/dhcp.adguard.bak" ]; then
        printf "\033[1;34mRestoring dnsmasq to default configuration\033[0m\n"
        uci batch <<EOF 2>/dev/null
delete dhcp.@dnsmasq[0].noresolv
delete dhcp.@dnsmasq[0].cachesize
delete dhcp.@dnsmasq[0].rebind_protection
set dhcp.@dnsmasq[0].port='53'
delete dhcp.@dnsmasq[0].server
delete dhcp.lan.dhcp_option
delete dhcp.lan.dhcp_option6
commit dhcp
EOF
    fi
    
    # Remove firewall rule if exists
    rule_name="adguardhome_dns_${DNS_PORT}"
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
    
    if [ -z "$REMOVE_MODE" ]; then
        printf "\033[33mPress [Enter] to reboot.\033[0m\n"
        read -r _
        reboot
    fi
}

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
        [ -z "$port" ] && port=
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

adguardhome_main() {
    local standalone_mode="" mode_label="Installation"
    [ -z "$INSTALL_MODE" ] && [ -z "$REMOVE_MODE" ] && standalone_mode="1"
    [ -n "$REMOVE_MODE" ] && mode_label="Removal"
    
    printf "\n\033[1;34m========================================\033[0m\n"
    printf "\033[1;34m  AdGuard Home %s\033[0m\n" "$mode_label"
    printf "\033[1;34m  Version: %s\033[0m\n" "$VERSION"
    printf "\033[1;34m========================================\033[0m\n\n"
    
    if [ -n "$REMOVE_MODE" ]; then
        remove_adguardhome "$REMOVE_MODE"
        return 0
    fi
    
    check_system
    install_prompt
    
    case "$PACKAGE_MANAGER" in
        opkg)
            printf "Updating package lists (opkg)... "
            if opkg update >/dev/null 2>&1; then
                printf "Done\n"
            else
                printf "Failed\n"
                printf "\033[1;33mShowing detailed output:\033[0m\n"
                opkg update
                printf "\033[1;31mPackage update failed\033[0m\n"
                exit 1
            fi
            ;;
        apk)
            printf "Updating package lists (apk)... "
            if apk update >/dev/null 2>&1; then
                printf "Done\n"
            else
                printf "Failed\n"
                printf "\033[1;33mShowing detailed output:\033[0m\n"
                apk update
                printf "\033[1;31mPackage update failed\033[0m\n"
                exit 1
            fi
            ;;
    esac
    
    install_dependencies || {
        printf "\033[1;31mFailed to install dependencies. Aborting.\033[0m\n"
        exit 1
    }
    if [ -z "$AGH_USER" ] || [ -z "$AGH_PASS" ]; then
        prompt_credentials
    fi
    generate_password_hash || {
        printf "\033[1;31mFailed to generate password hash. Aborting.\033[0m\n"
        exit 1
    }
    install_"$INSTALL_MODE"
    generate_yaml
    get_iface_addrs
    common_config
    common_config_firewall
    printf "\n\033[1;32mAdGuard Home installation and configuration completed successfully.\033[0m\n\n"
    get_access
    
    if [ -n "$standalone_mode" ]; then
        printf "\033[33mPress [Enter] to reboot.\033[0m\n"
        read -r _
        reboot
    fi
}

if [ "$(basename "$0")" = "adguardhome.sh" ]; then
    adguardhome_main "$@"
fi
