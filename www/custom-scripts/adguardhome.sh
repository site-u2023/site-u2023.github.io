#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC2086,SC3043
# OpenWrt 19.07+ configuration
# Reference: https://openwrt.org/docs/guide-user/services/dns/adguard-home
#            https://github.com/AdguardTeam/AdGuardHome
# This script file can be used standalone.
#
# INSTALLATION MODES:
# This script supports sixteen installation modes (2×2×2×2) by combining:
#   Package Manager: opkg (Release) / apk (SNAPSHOT 24.x+) - auto-detected
#   Package Source: OpenWrt repository / Official GitHub binary
#   Configuration: Automatic YAML setup / Manual web-based setup (NO_YAML=1)
#   Execution: Standalone (interactive) / Integrated (environment variables)
#
# COMMAND-LINE OPTIONS:
#   -c              Skip system resource checks (force installation)
#   -r <mode>       Removal mode: 'auto' (silent) / 'manual' (interactive)
#   -i <source>     Installation source: 'openwrt' / 'official'
#   -m              Change credentials (User/Password/WEB Port)
#
# ENVIRONMENT VARIABLES:
#   INSTALL_MODE       'openwrt' or 'official' (skips interactive prompt)
#   NO_YAML            '1' = skip YAML generation, use web interface for setup
#   AGH_USER           Admin username (default: admin)
#   AGH_PASS           Admin password (default: password, min 8 chars)
#   WEB_PORT           Web interface port (default: 8000)
#   DNS_PORT           DNS service port (default: 53)
#   DNS_BACKUP_PORT    dnsmasq port (default: 54)
#   SCRIPT_BASE_URL    Custom YAML template URL
#   REMOVE_MODE        'auto' for non-interactive removal
#   ACTION_MODE        'change_credentials' for credential change
#
# Usage Examples:
#   sh adguardhome.sh                                    # Interactive with YAML
#   NO_YAML=1 sh adguardhome.sh                          # Manual setup
#   INSTALL_MODE=official NO_YAML=1 sh adguardhome.sh    # Automated install
#   sh adguardhome.sh -c                                 # Force install
#   sh adguardhome.sh -r auto                            # Auto-remove
#   sh adguardhome.sh -m                                 # Change credentials

VERSION="R7.1202.2303"

NET_ADDR=""
NET_ADDR6_LIST=""
SERVICE_NAME=""
INSTALL_MODE=""
INSTALL_TYPE=""
ARCH=""
AGH=""
PACKAGE_MANAGER=""
UPDATE_CMD=""
INSTALL_CMD=""
REMOVE_CMD=""
FAMILY_TYPE=""
AGH_USER=""
AGH_PASS=""
AGH_PASS_HASH=""
NO_YAML=""
ACTION_MODE=""
YAML_PATH=""

# BEGIN_VARIABLE_DEFINITIONS
# END_VARIABLE_DEFINITIONS

export MINIMUM_MEM="20"
export MINIMUM_FLASH="25"
export RECOMMENDED_MEM="50"
export RECOMMENDED_FLASH="100"

SCRIPT_NAME=${0##*/}

[ -n "${AGH_USER+x}" ] && AGH_USER_FROM_ENV=1
[ -n "${AGH_PASS+x}" ] && AGH_PASS_FROM_ENV=1

AGH_USER="${AGH_USER:-admin}"
AGH_PASS="${AGH_PASS:-password}"
WEB_PORT="${WEB_PORT:-8000}"
DNS_PORT="${DNS_PORT:-53}"
DNS_BACKUP_PORT="${DNS_BACKUP_PORT:-54}"
LAN_ADDR="${LAN_ADDR:-192.168.1.1}"

LAN="${LAN:-br-lan}"
SCRIPT_BASE_URL="${SCRIPT_BASE_URL:-https://site-u.pages.dev/www/custom-scripts}"

PKG_HTPASSWD_DEPS="libaprutil libapr libexpat libuuid1"
PKG_APACHE="apache"
PKG_CA_BUNDLE="ca-bundle"
PKG_ADGUARDHOME_OPENWRT="adguardhome"
PKG_ADGUARDHOME_OFFICIAL="AdGuardHome"

check_package_manager() {
  if command -v opkg >/dev/null 2>&1; then
      PACKAGE_MANAGER="opkg"
      UPDATE_CMD="opkg update"
      INSTALL_CMD="opkg install"
      REMOVE_CMD="opkg remove"
      DEPENDS_CMD="opkg whatdepends"
  elif command -v apk >/dev/null 2>&1; then
      PACKAGE_MANAGER="apk"
      UPDATE_CMD="apk update"
      INSTALL_CMD="apk add"
      REMOVE_CMD="apk del"
      DEPENDS_CMD="apk info -R"
  else
      printf "\033[1;31mError: No supported package manager found.\033[0m\n"
      exit 1
  fi
  printf "\033[1;32mUsing: %s\033[0m\n" "$PACKAGE_MANAGER"
}

is_adguardhome_installed() {
  if /etc/${PKG_ADGUARDHOME_OFFICIAL}/${PKG_ADGUARDHOME_OFFICIAL} --version >/dev/null 2>&1; then
    INSTALL_TYPE="official"
    SERVICE_NAME="$PKG_ADGUARDHOME_OFFICIAL"
    AGH="$PKG_ADGUARDHOME_OFFICIAL"
    YAML_PATH="/etc/${PKG_ADGUARDHOME_OFFICIAL}/${PKG_ADGUARDHOME_OFFICIAL}.yaml"
    return 0
  elif /usr/bin/AdGuardHome --version >/dev/null 2>&1; then
    INSTALL_TYPE="openwrt"
    SERVICE_NAME="$PKG_ADGUARDHOME_OPENWRT"
    AGH="$PKG_ADGUARDHOME_OPENWRT"
    YAML_PATH="/etc/${PKG_ADGUARDHOME_OPENWRT}.yaml"
    return 0
  fi
  return 1
}

detect_install_type() {
    if opkg list-installed | grep -q "^${PKG_ADGUARDHOME_OPENWRT} "; then
        INSTALL_TYPE="openwrt"
        AGH="$PKG_ADGUARDHOME_OPENWRT"
    elif [ -x "/etc/${PKG_ADGUARDHOME_OFFICIAL}/${PKG_ADGUARDHOME_OFFICIAL}" ]; then
        INSTALL_TYPE="official"
        AGH="$PKG_ADGUARDHOME_OFFICIAL"
    else
        INSTALL_TYPE=""
        AGH=""
    fi
}

check_system() {
  printf "\033[1;34mChecking system requirements\033[0m\n"
  
  LAN="$(ubus call network.interface.lan status 2>/dev/null | jsonfilter -e '@.l3_device')"
  if [ -z "$LAN" ]; then
    printf "\033[1;31mLAN interface not found. Aborting.\033[0m\n"
    exit 1
  fi

  check_package_manager
  
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

  printf "Memory: Free \033[%sm%s MB\033[0m / Total %s MB (Min: %s MB / Recommended: %s MB)\n" \
    "$mem_col" "$MEM_FREE_MB" "$MEM_TOTAL_MB" "$MINIMUM_MEM" "$RECOMMENDED_MEM"
  printf "Flash: Free \033[%sm%s MB\033[0m / Total %s MB (Min: %s MB / Recommended: %s MB)\n" \
    "$flash_col" "$FLASH_FREE_MB" "$FLASH_TOTAL_MB" "$MINIMUM_FLASH" "$RECOMMENDED_FLASH"

  if [ -n "$SKIP_RESOURCE_CHECK" ]; then
    printf "\033[1;33mResource check skipped by user request\033[0m\n"
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

update_packages() {
    printf "Updating package lists... "
    $UPDATE_CMD >/dev/null 2>&1 || {
        printf "\033[1;31mFailed\033[0m\n"
        $UPDATE_CMD
        exit 1
    }
    printf "\033[1;32mDone\033[0m\n"
}

install_package() {
    local opts="$1"; shift
    local pkgs="$*"
    [ -z "$pkgs" ] && return 1
    printf "Installing: %s " "$pkgs"
    if $INSTALL_CMD $opts $pkgs >/dev/null 2>&1; then
        printf "\033[1;32mDone\033[0m\n"
    else
        printf "\033[1;31mFailed\033[0m\n"
        return 1
    fi
}

remove_package() {
    local opts="$1"; shift
    local pkgs="$*"
    [ -z "$pkgs" ] && return 1

    for pkg in $pkgs; do
        printf "Removing: %s " "$pkg"
        $REMOVE_CMD $opts "$pkg" >/dev/null 2>&1
        printf "\033[1;32mDone\033[0m\n"
    done
}

show_install_prompt() {
  if [ -n "$INSTALL_MODE" ]; then
    case "$INSTALL_MODE" in
      official|openwrt) return 0 ;;
      *) printf "\033[1;31mWarning: Unrecognized INSTALL_MODE '%s'. Proceeding with interactive prompt.\033[0m\n" "$INSTALL_MODE" ;;
    esac
  fi

  printf "\033[1;34mSystem resources are sufficient for AdGuard Home installation. Proceeding with setup.\033[0m\n"

  while true; do
    printf "[1] Install OpenWrt package\n"
    printf "[2] Install Official binary\n"
    printf "[0] Exit\n"
    printf "Please select (1, 2 or 0): "
    read -r choice

    case "$choice" in
      1|openwrt) INSTALL_MODE="openwrt"; return 0 ;;
      2|official) INSTALL_MODE="official"; return 0 ;;
      0|exit)
        printf "\033[1;33mInstallation cancelled.\033[0m\n"
        return 1
        ;;
      *) printf "\033[1;31mInvalid choice '%s'. Please enter 1, 2, or 0.\033[0m\n" "$choice" ;;
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
      0|exit)
        printf "\033[1;33mOperation cancelled.\033[0m\n"
        return 1
        ;;
      *) printf "\033[1;31mInvalid choice '%s'. Please enter 1, 2, or 0.\033[0m\n" "$choice" ;;
    esac
  done
}

install_packages() {
  local opts="$1"
  shift
  local pkgs="$*"
  
  install_package "$opts" "$pkgs"
}

install_dependencies() {
  printf "\033[1;34mEnsuring htpasswd and dependencies are available\033[0m\n"

  local apache_existed=0
  local all_deps_installed=1

  if opkg list-installed | grep -q '^apache '; then
    apache_existed=1
    printf "\033[1;33mApache is already installed, preserving existing installation\033[0m\n"
  fi

  for pkg in $PKG_HTPASSWD_DEPS; do
    if ! opkg list-installed | grep -q "^$pkg "; then
      all_deps_installed=0
      break
    fi
  done

  if command -v htpasswd >/dev/null 2>&1; then
    printf "\033[1;32mhtpasswd is already present\033[0m\n"
    return 0
  fi

  local install_list="$PKG_HTPASSWD_DEPS"
  [ "$apache_existed" -eq 0 ] && install_list="$install_list $PKG_APACHE"

  install_package "" $install_list || {
    printf "\033[1;31mFailed to install dependencies\033[0m\n"
    return 1
  }

  if [ ! -f /usr/bin/htpasswd ] && [ "$apache_existed" -eq 0 ]; then
    printf "\033[1;31mhtpasswd not found after installing Apache. Aborting.\033[0m\n"
    return 1
  fi

  chmod +x /usr/bin/htpasswd
  printf "\033[1;32mhtpasswd is ready\033[0m\n"
  return 0
}

install_cacertificates() {
  install_package "" $PKG_CA_BUNDLE
}

install_openwrt() {
  printf "Installing %s (OpenWrt package)\n" "$PKG_ADGUARDHOME_OPENWRT"
  
  PKG_VER=$($PACKAGE_MANAGER list | grep "^${PKG_ADGUARDHOME_OPENWRT} " | awk '{print $3}')
  if [ -n "$PKG_VER" ]; then
    install_package "" $PKG_ADGUARDHOME_OPENWRT || {
      printf "\033[1;31mNetwork error during install. Aborting.\033[0m\n"
      exit 1
    }
    printf "\033[1;32m%s %s has been installed\033[0m\n" "$PKG_ADGUARDHOME_OPENWRT" "$PKG_VER"
  else
    printf "\033[1;31mPackage '%s' not found in repository, falling back to official\033[0m\n" "$PKG_ADGUARDHOME_OPENWRT"
    install_official
    return
  fi
  
  SERVICE_NAME="$PKG_ADGUARDHOME_OPENWRT"
  YAML_PATH="/etc/${PKG_ADGUARDHOME_OPENWRT}.yaml"
}

install_official() {
  CA="--no-check-certificate"
  URL="https://api.github.com/repos/AdguardTeam/AdGuardHome/releases/latest"
  VER=$( { wget -q -O - "$URL" || wget -q "$CA" -O - "$URL"; } | jsonfilter -e '@.tag_name' )
  [ -n "$VER" ] || { printf "\033[1;31mError: Failed to get AdGuardHome version from GitHub API.\033[0m\n"; exit 1; }
  
  mkdir -p /etc/$PKG_ADGUARDHOME_OFFICIAL
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
  TAR="${PKG_ADGUARDHOME_OFFICIAL}_linux_${ARCH}.tar.gz"
  URL2="https://github.com/AdguardTeam/AdGuardHome/releases/download/${VER}/${TAR}"
  DEST="/etc/${PKG_ADGUARDHOME_OFFICIAL}/${TAR}"
  
  printf "Downloading %s (official binary)\n" "$PKG_ADGUARDHOME_OFFICIAL"
  if ! { wget -q -O "$DEST" "$URL2" || wget -q "$CA" -O "$DEST" "$URL2"; }; then
    printf '\033[1;31mDownload failed. Please check network connection.\033[0m\n'
    exit 1
  fi
  printf "\033[1;32m%s %s has been downloaded\033[0m\n" "$PKG_ADGUARDHOME_OFFICIAL" "$VER"
  
  tar -C /etc/ -xzf "/etc/${PKG_ADGUARDHOME_OFFICIAL}/${TAR}"
  rm "/etc/${PKG_ADGUARDHOME_OFFICIAL}/${TAR}"
  chmod +x /etc/$PKG_ADGUARDHOME_OFFICIAL/$PKG_ADGUARDHOME_OFFICIAL
  SERVICE_NAME="$PKG_ADGUARDHOME_OFFICIAL"
  YAML_PATH="/etc/${PKG_ADGUARDHOME_OFFICIAL}/${PKG_ADGUARDHOME_OFFICIAL}.yaml"
  
  /etc/$PKG_ADGUARDHOME_OFFICIAL/$PKG_ADGUARDHOME_OFFICIAL -s install >/dev/null 2>&1 || {
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
  
  if [ "$SERVICE_NAME" = "$PKG_ADGUARDHOME_OFFICIAL" ]; then
    yaml_path="/etc/${PKG_ADGUARDHOME_OFFICIAL}/${PKG_ADGUARDHOME_OFFICIAL}.yaml"
  else
    yaml_path="/etc/${PKG_ADGUARDHOME_OPENWRT}.yaml"
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
del dhcp.@dnsmasq[0].server
add_list dhcp.@dnsmasq[0].server='127.0.0.1#${DNS_PORT}'
add_list dhcp.@dnsmasq[0].server='::1#${DNS_PORT}'
del dhcp.lan.dhcp_option
add_list dhcp.lan.dhcp_option='6,${NET_ADDR}'
del dhcp.lan.dhcp_option6
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

execute_credential_change() {
  local current_user current_port
  
  printf "\033[1;34mChanging AdGuard Home credentials\033[0m\n"
  
  if [ ! -f "$YAML_PATH" ]; then
    printf "\033[1;31mConfiguration file not found: %s\033[0m\n" "$YAML_PATH"
    return 1
  fi
  
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
  
  if [ -z "${AGH_USER_FROM_ENV}" ]; then
    printf "Enter new username [%s]: " "$current_user"
    read -r new_user
    [ -z "$new_user" ] && new_user="$current_user"
    AGH_USER="$new_user"
    
    AGH_PASS=""
    while [ -z "$AGH_PASS" ] || [ ${#AGH_PASS} -lt 8 ]; do
      printf "Enter new password (min 8 chars): "
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
    read -r pass_confirm
    stty echo 2>/dev/null
    printf "\n"
    
    if [ "$AGH_PASS" != "$pass_confirm" ]; then
      printf "\033[1;31mPasswords do not match. Aborting.\033[0m\n"
      return 1
    fi
    
    printf "Enter WEB port [%s]: " "$current_port"
    read -r new_port
    [ -z "$new_port" ] && new_port="$current_port"
    WEB_PORT="$new_port"
  fi
  
  if ! command -v htpasswd >/dev/null 2>&1; then
    check_package_manager
    update_packages
    install_dependencies || return 1
  fi
  
  generate_password_hash || return 1
  
  printf "\033[1;34mUpdating configuration file\033[0m\n"
  
  cp "$YAML_PATH" "${YAML_PATH}.bak"
  
  sed -i "s/^\([[:space:]]*-[[:space:]]*name:[[:space:]]*\).*/\1${AGH_USER}/" "$YAML_PATH"
  
  local escaped_hash
  escaped_hash=$(printf '%s\n' "$AGH_PASS_HASH" | sed 's/[&/\$]/\\&/g')
  sed -i "s|^\([[:space:]]*password:[[:space:]]*\).*|\1${escaped_hash}|" "$YAML_PATH"
  
  sed -i "s/^\([[:space:]]*address:[[:space:]]*[0-9.]*:\)[0-9]*/\1${WEB_PORT}/" "$YAML_PATH"
  
  printf "\033[1;34mRestarting AdGuard Home service\033[0m\n"
  
  /etc/init.d/"$SERVICE_NAME" stop
  sleep 2
  
  if pgrep -f "$SERVICE_NAME" >/dev/null 2>&1; then
    pkill -9 -f "$SERVICE_NAME"
    sleep 1
  fi
  
  /etc/init.d/"$SERVICE_NAME" start || {
    printf "\033[1;31mFailed to restart service\033[0m\n"
    return 1
  }
  
  sleep 3
  
  printf "\n"
  printf "\033[1;32m========================================\033[0m\n"
  printf "\033[1;32m  Credentials updated successfully!\033[0m\n"
  printf "\033[1;32m========================================\033[0m\n"
  printf "\033[1;33m  Username: %s\033[0m\n" "$AGH_USER"
  printf "\033[1;33m  Password: %s\033[0m\n" "$AGH_PASS"
  printf "\033[1;33m  WEB Port: %s\033[0m\n" "$WEB_PORT"
  printf "\033[1;32m========================================\033[0m\n"
  
  return 0
}

remove_adguardhome() {
    local auto_confirm="$1"
    printf "\033[1;34mRemoving AdGuard Home\033[0m\n"

    detect_install_type
    if [ -z "$INSTALL_TYPE" ]; then
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

    /etc/init.d/"${AGH}" stop 2>/dev/null
    /etc/init.d/"${AGH}" disable 2>/dev/null

    if [ "$INSTALL_TYPE" = "official" ]; then
        "/etc/${AGH}/${AGH}" -s uninstall 2>/dev/null
    else
        remove_package "" "$AGH"
    fi

    if [ -d "/etc/${AGH}" ] || [ -f "/etc/${PKG_ADGUARDHOME_OPENWRT}.yaml" ]; then
        if [ "$auto_confirm" != "auto" ]; then
            printf "Do you want to delete the AdGuard Home configuration file(s)? (y/N): "
            read -r cfg
            case "$cfg" in
                [yY]*)
                    [ -d "/etc/${PKG_ADGUARDHOME_OFFICIAL:?}" ] && rm -rf "/etc/${PKG_ADGUARDHOME_OFFICIAL:?}"
                    [ -d "/etc/${PKG_ADGUARDHOME_OPENWRT:?}" ] && rm -rf "/etc/${PKG_ADGUARDHOME_OPENWRT:?}"
                    rm -f /etc/${PKG_ADGUARDHOME_OPENWRT}.yaml
                    ;;
            esac
        else
            [ -d "/etc/${PKG_ADGUARDHOME_OFFICIAL:?}" ] && rm -rf "/etc/${PKG_ADGUARDHOME_OFFICIAL:?}"
            [ -d "/etc/${PKG_ADGUARDHOME_OPENWRT:?}" ] && rm -rf "/etc/${PKG_ADGUARDHOME_OPENWRT:?}"
            rm -f /etc/${PKG_ADGUARDHOME_OPENWRT}.yaml
        fi
    fi

    printf "\033[1;34mRemoving htpasswd and dependencies\033[0m\n"
    rm -f /usr/bin/htpasswd
    remove_package "--force-depends" $PKG_HTPASSWD_DEPS

    for cfg in network dhcp firewall; do
        bak="/etc/config/${cfg}.adguard.bak"
        if [ -f "$bak" ]; then
            printf "\033[1;34mRestoring %s configuration from backup\033[0m\n" "$cfg"
            cp "$bak" "/etc/config/${cfg}"
            rm -f "$bak"
        fi
    done

    if [ ! -f "/etc/config/dhcp.adguard.bak" ]; then
        printf "\033[1;34mRestoring dnsmasq to default configuration\033[0m\n"
        uci batch <<EOF 2>/dev/null
del dhcp.@dnsmasq[0].noresolv
del dhcp.@dnsmasq[0].cachesize
del dhcp.@dnsmasq[0].rebind_protection
set dhcp.@dnsmasq[0].port='53'
del dhcp.@dnsmasq[0].server
del dhcp.lan.dhcp_option
del dhcp.lan.dhcp_option6
commit dhcp
EOF
    fi

    rule_name="adguardhome_dns_${DNS_PORT}"
    if uci -q get firewall."$rule_name" >/dev/null 2>&1; then
        printf "\033[1;34mRemoving firewall rule\033[0m\n"
        uci batch <<EOF
delete firewall.${rule_name}
commit firewall
EOF
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
  if [ -f "/etc/${PKG_ADGUARDHOME_OFFICIAL}/${PKG_ADGUARDHOME_OFFICIAL}.yaml" ]; then
    cfg="/etc/${PKG_ADGUARDHOME_OFFICIAL}/${PKG_ADGUARDHOME_OFFICIAL}.yaml"
  elif [ -f "/etc/${PKG_ADGUARDHOME_OPENWRT}.yaml" ]; then
    cfg="/etc/${PKG_ADGUARDHOME_OPENWRT}.yaml"
  fi
  if [ -n "$cfg" ]; then
    addr=$(awk '
      $1=="http:" {flag=1; next}
      flag && /^[[:space:]]*address:/ {print $2; exit}
    ' "$cfg" 2>/dev/null)
    port="${addr##*:}"
    [ -z "$port" ] && port=
  fi
  [ -z "$port" ] && port="${WEB_PORT}"

  printf "\n"
  printf "\033[1;32m========================================\033[0m\n"
  printf "\033[1;32m  AdGuard Home is ready!\033[0m\n"
  printf "\033[1;32m========================================\033[0m\n"
  
  if [ -z "$NO_YAML" ]; then
    printf "\033[1;33m  Username: %s\033[0m\n" "$AGH_USER"
    printf "\033[1;33m  Password: %s\033[0m\n" "$AGH_PASS"
    printf "\033[1;32m========================================\033[0m\n"
  fi
  
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

init_adguardhome() {
  OPTIND=1
  while getopts "cnmr:i:" opt; do
    case $opt in
      c) SKIP_RESOURCE_CHECK=1 ;;
      n) NO_YAML=1 ;;
      m) ACTION_MODE="change_credentials" ;;
      r) REMOVE_MODE="$OPTARG"; ACTION_MODE="remove" ;;
      i) INSTALL_MODE="$OPTARG" ;;
      *) 
        printf "Usage: %s [-c] [-n] [-m] [-r auto|manual] [-i openwrt|official]\n" "$SCRIPT_NAME"
        printf "  -c: Skip resource check (forced installation)\n"
        printf "  -n: Skip YAML configuration generation (manual web setup)\n"
        printf "  -m: Change credentials (User/Password/WEB Port)\n"
        printf "  -r: Remove mode (auto: auto-confirm, manual: interactive)\n"
        printf "  -i: Installation mode (openwrt: package, official: binary)\n"
        exit 1
        ;;
    esac
  done
}

print_banner() {
  local mode="$1"
  printf "\n\033[1;34m========================================\033[0m\n"
  printf "\033[1;34m  AdGuard Home %s\033[0m\n" "$mode"
  printf "\033[1;34m  Version: %s\033[0m\n" "$VERSION"
  printf "\033[1;34m========================================\033[0m\n\n"
}

adguardhome_main() {
  init_adguardhome "$@"

  local standalone_mode=""
  [ -z "$INSTALL_MODE" ] && [ -z "$REMOVE_MODE" ] && [ -z "$ACTION_MODE" ] && standalone_mode="1"
  
  if is_adguardhome_installed; then
    printf "\033[1;33mAdGuard Home is already installed (%s version)\033[0m\n\n" "$INSTALL_TYPE"
    
    if [ -z "$ACTION_MODE" ]; then
      if ! show_manage_prompt; then
        return 0
      fi
    fi
    
    case "$ACTION_MODE" in
      change_credentials)
        print_banner "Credential Change"
        execute_credential_change
        ;;
      remove)
        print_banner "Removal"
        remove_adguardhome "${REMOVE_MODE:-manual}"
        ;;
      *)
        printf "\033[1;31mInvalid action: %s\033[0m\n" "$ACTION_MODE"
        return 1
        ;;
    esac
  else
    print_banner "Installation"
    check_system
    
    if ! show_install_prompt; then
      return 0
    fi
    
    update_packages
    
    if [ -z "$NO_YAML" ]; then
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
    fi
    install_cacertificates
    install_"$INSTALL_MODE"
    if [ -z "$NO_YAML" ]; then
      generate_yaml
    fi
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
  fi
}

if [ "$SCRIPT_NAME" = "adguardhome.sh" ]; then
    adguardhome_main "$@"
fi
