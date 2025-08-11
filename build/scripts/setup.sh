#!/bin/sh
# Beware! This script will be in /rom/etc/uci-defaults/ as part of the image.
# Uncomment lines to apply:
#
# Basic settings
root_password="12345678"
device_name="bpi-r4"
lan_ip_address="192.168.11.11"
language="ja"
timezone="JST-9"
country="JP"
#
# WLAN settings
wlan_name="ばなな"
wlan_password="12345678"
#
# PPPoE settings
# pppoe_username=""
# pppoe_password=""
#
# DS-Lite settings (from API or manual)
# dslite_aftr_address="2404:8e00::feed:100"
#
# MAP-E settings (from API or manual - all values pre-calculated)
mape_br="2001:380:a120::9"
mape_ealen="18"
mape_ipv4_prefix="153.187.0.0"
mape_ipv4_prefixlen="20"
mape_ipv6_prefix="2400:4151:8000::"
mape_ipv6_prefixlen="38"
mape_psidlen="12"
mape_psid_offset="6"
mape_gua_mode="1"
mape_gua_prefix="2400:4151:8000::/64"
#
# OpenWrt version flags (one will be set by web)
# openwrt_19=""
openwrt_21="1"

# Network interface names
WAN_DEF="wan"
MAP_NAME="map"
MAP6_NAME="map6"
DSLITE_NAME="dslite"
DSLITE6_NAME="dslite6"

# log potential errors
exec >/tmp/setup.log 2>&1

echo "Starting OpenWrt initial configuration..."

# Configure root password
if [ -n "$root_password" ]; then
    echo "Setting root password..."
    (echo "$root_password"; sleep 1; echo "$root_password") | passwd > /dev/null 2>&1
fi

# Configure device name
if [ -n "$device_name" ]; then
    echo "Setting device name: $device_name"
    uci set system.@system[0].hostname="$device_name"
fi

# Configure LAN IP
if [ -n "$lan_ip_address" ]; then
    echo "Setting LAN IP: $lan_ip_address"
    uci set network.lan.ipaddr="$lan_ip_address"
fi

# Configure language
if [ -n "$language" ]; then
    echo "Setting language: $language"
    uci set system.@system[0].language="$language"
fi

# Configure timezone
if [ -n "$timezone" ]; then
    echo "Setting timezone: $timezone"
    uci set system.@system[0].timezone="$timezone"
fi

# Configure country code for wireless
if [ -n "$country" ]; then
    echo "Setting country code: $country"
    uci set wireless.@wifi-device[0].country="$country" 2>/dev/null
fi

# Configure WLAN
if [ -n "$wlan_name" ] && [ -n "$wlan_password" ] && [ ${#wlan_password} -ge 8 ]; then
    echo "Configuring WLAN: $wlan_name"
    uci set wireless.@wifi-device[0].disabled='0'
    uci set wireless.@wifi-iface[0].disabled='0'
    uci set wireless.@wifi-iface[0].encryption='sae-mixed'
    uci set wireless.@wifi-iface[0].ssid="$wlan_name"
    uci set wireless.@wifi-iface[0].key="$wlan_password"
fi

# Configure PPPoE
if [ -n "$pppoe_username" ] && [ -n "$pppoe_password" ]; then
    echo "Configuring PPPoE..."
    uci set network.wan.proto='pppoe'
    uci set network.wan.username="$pppoe_username"
    uci set network.wan.password="$pppoe_password"
fi

# Configure DS-Lite
if [ -n "$dslite_aftr_address" ]; then
    echo "Configuring DS-Lite: AFTR=$dslite_aftr_address"
    
    # Disable WAN
    uci set network.wan.disabled='1'
    uci set network.wan.auto='0'
    
    # DS-Lite IPv6 interface
    uci set network.${DSLITE6_NAME}=interface
    uci set network.${DSLITE6_NAME}.proto='dhcpv6'
    uci set network.${DSLITE6_NAME}.device="${WAN_DEF}"
    uci set network.${DSLITE6_NAME}.reqaddress='try'
    uci set network.${DSLITE6_NAME}.reqprefix='auto'
    
    # DS-Lite interface
    uci set network.${DSLITE_NAME}=interface
    uci set network.${DSLITE_NAME}.proto='dslite'
    uci set network.${DSLITE_NAME}.peeraddr="$dslite_aftr_address"
    uci set network.${DSLITE_NAME}.tunlink="${DSLITE6_NAME}"
    uci set network.${DSLITE_NAME}.mtu='1460'
    uci set network.${DSLITE_NAME}.encaplimit='ignore'
    
    # DHCP settings
    uci set dhcp.${DSLITE6_NAME}=dhcp
    uci set dhcp.${DSLITE6_NAME}.interface="${DSLITE6_NAME}"
    uci set dhcp.${DSLITE6_NAME}.master='1'
    uci set dhcp.${DSLITE6_NAME}.ra='relay'
    uci set dhcp.${DSLITE6_NAME}.dhcpv6='relay'
    uci set dhcp.${DSLITE6_NAME}.ndp='relay'
    uci set dhcp.${DSLITE6_NAME}.ignore='1'
    
    # LAN IPv6 relay
    uci set dhcp.lan.ra='relay'
    uci set dhcp.lan.dhcpv6='relay'
    uci set dhcp.lan.ndp='relay'
    uci set dhcp.lan.force='1'
    
    # Firewall
    uci add_list firewall.@zone[1].network="${DSLITE_NAME}"
    uci add_list firewall.@zone[1].network="${DSLITE6_NAME}"
    uci set firewall.@zone[1].masq='1'
    uci set firewall.@zone[1].mtu_fix='1'
fi

# Configure MAP-E
if [ -n "$mape_br" ] && [ -n "$mape_ealen" ]; then
    echo "Configuring MAP-E: BR=$mape_br, EA-len=$mape_ealen"
    
    # Install map.sh (WEB side embeds content here)
    cat > /lib/netifd/proto/map.sh << 'MAP_SH_EOF'
#!/bin/sh
# MAP-E script will be loaded dynamically
MAP_SH_EOF
    
    # Disable WAN/WAN6
    uci set network.wan.disabled='1'
    uci set network.wan.auto='0'
    uci set network.wan6.disabled='1' 2>/dev/null
    uci set network.wan6.auto='0' 2>/dev/null
    
    # MAP-E IPv6 interface
    uci set network.${MAP6_NAME}=interface
    uci set network.${MAP6_NAME}.proto='dhcpv6'
    uci set network.${MAP6_NAME}.device="${WAN_DEF}"
    uci set network.${MAP6_NAME}.reqaddress='try'
    uci set network.${MAP6_NAME}.reqprefix='auto'
    
    # MAP-E interface
    uci set network.${MAP_NAME}=interface
    uci set network.${MAP_NAME}.proto='map'
    uci set network.${MAP_NAME}.maptype='map-e'
    uci set network.${MAP_NAME}.peeraddr="$mape_br"
    uci set network.${MAP_NAME}.ipaddr="$mape_ipv4_prefix"
    uci set network.${MAP_NAME}.ip4prefixlen="$mape_ipv4_prefixlen"
    uci set network.${MAP_NAME}.ip6prefix="$mape_ipv6_prefix"
    uci set network.${MAP_NAME}.ip6prefixlen="$mape_ipv6_prefixlen"
    uci set network.${MAP_NAME}.ealen="$mape_ealen"
    uci set network.${MAP_NAME}.psidlen="$mape_psidlen"
    uci set network.${MAP_NAME}.offset="$mape_psid_offset"
    uci set network.${MAP_NAME}.mtu='1460'
    uci set network.${MAP_NAME}.encaplimit='ignore'
    
    # DHCP settings
    uci set dhcp.${MAP6_NAME}=dhcp
    uci set dhcp.${MAP6_NAME}.interface="${MAP6_NAME}"
    uci set dhcp.${MAP6_NAME}.master='1'
    uci set dhcp.${MAP6_NAME}.ra='relay'
    uci set dhcp.${MAP6_NAME}.dhcpv6='relay'
    uci set dhcp.${MAP6_NAME}.ndp='relay'
    
    # LAN IPv6 relay
    uci set dhcp.lan.ra='relay'
    uci set dhcp.lan.dhcpv6='relay'
    uci set dhcp.lan.ndp='relay'
    uci set dhcp.lan.force='1'
    
    # Firewall
    uci add_list firewall.@zone[1].network="${MAP_NAME}"
    uci add_list firewall.@zone[1].network="${MAP6_NAME}"
    uci set firewall.@zone[1].masq='1'
    uci set firewall.@zone[1].mtu_fix='1'
fi

# MAP-E GUA mode settings
if [ -n "$mape_gua_mode" ]; then
    echo "Setting MAP-E GUA prefix: $mape_gua_prefix"
    uci set network.${MAP6_NAME}.ip6prefix="$mape_gua_prefix"
fi

# OpenWrt 19.x specific MAP-E settings
if [ -n "$openwrt_19" ]; then
    echo "Applying OpenWrt 19.x specific settings"
    uci add_list network.${MAP_NAME}.tunlink="${MAP6_NAME}"
fi

# OpenWrt 21.02+ specific MAP-E settings
if [ -n "$openwrt_21" ]; then
    echo "Applying OpenWrt 21.02+ specific settings"
    uci set network.${MAP_NAME}.legacymap='1'
    uci set network.${MAP_NAME}.tunlink="${MAP6_NAME}"
    uci set dhcp.${MAP6_NAME}.ignore='1'
fi

# Commit all changes
echo "Committing UCI configuration..."
uci commit system 2>/dev/null
uci commit wireless 2>/dev/null
uci commit network
uci commit dhcp
uci commit firewall

echo "Configuration completed successfully!"
echo "All done!"
exit 0
