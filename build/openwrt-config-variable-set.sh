#!/bin/sh

CONFIG_SCRIPT="/tmp/openwrt-config.sh"

wget -O "$CONFIG_SCRIPT" "https://site-u.pages.dev/build/openwrt-config.sh" 2>/dev/null
if [ ! -f "$CONFIG_SCRIPT" ]; then
    printf "\033[31mError: Failed to download main config script\033[0m\n"
    exit 1
fi

chmod +x "$CONFIG_SCRIPT"
if [ ! -x "$CONFIG_SCRIPT" ]; then
    printf "\033[31mError: $CONFIG_SCRIPT not found or not executable.\033[0m\n" 
    exit 1
fi

printf "\033[33mNotes: Blank to skip\033[0m\n"

# --- password ---
while true; do
  printf "New password [with 8]: "
  read -rs pass1
  printf "\nRetype new password: "
  read -rs pass2
  printf "\n"

  if [ -z "$pass1" ] && [ -z "$pass2" ]; then
    ROOT_PASSWORD=""
    break
  fi

  if [ "$pass1" = "$pass2" ]; then
    ROOT_PASSWORD="$pass1"
    break
  fi

  printf "\033[31mPasswords do not match. Try again.\033[0m\n"

done

# --- device name ---
printf "Device name: "
read -r DEVICE_NAME

# --- Wi-Fi SSID and password ---
printf "Wi-Fi SSID: "
read -r WLAN_NAME
printf "Wi-Fi password: "
read -r WLAN_PASSWORD

# --- ISP mode ---
while :; do
  echo "Connection Type: [1] Auto  [2] DHCP  [3] PPPoE  [4] DS-Lite  [5] MAP-E  [6] None"
  printf "Choice [1]: "
  read -r choice
  [ -z "$choice" ] && choice=1
  case "$choice" in
    [1-6]) break ;;
  esac
done

isp_mode=""
PPPOE_USERNAME=""
PPPOE_PASSWORD=""

case "$choice" in
  1) isp_mode="" ;;
  2) isp_mode="dhcp" ;;
  3)
    printf "PPPoE username [blank=auto]: "
    read -r PPPOE_USERNAME
    printf "PPPoE password [blank=auto]: "
    read -r PPPOE_PASSWORD
    if [ -n "$PPPOE_USERNAME" ] && [ -n "$PPPOE_PASSWORD" ]; then
      isp_mode="pppoe"
    else
      isp_mode=""
    fi
    ;;
  4) isp_mode="dslite" ;;
  5) isp_mode="mape" ;;
  6) isp_mode="none" ;;
  *) isp_mode="" ;;
esac

export ROOT_PASSWORD PPPOE_USERNAME PPPOE_PASSWORD DEVICE_NAME WLAN_NAME WLAN_PASSWORD

exec sh "$CONFIG_SCRIPT" ${isp_mode:+$isp_mode}
