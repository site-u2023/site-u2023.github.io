#!/bin/sh
# language="en"
# country="US"
# timezone="UTC"
# zonename="America/New_York"
# lan_ip_address="192.168.1.1"
# lan_ipv6_address="fd00::1/64"
# device_name="OpenWrt"
# root_password="Password"
# wlan_name="OpenWrt"
# wlan_password="12345678"
# pppoe_username=""
# pppoe_password=""
# dslite_aftr_address=""
# mape_br=""
# mape_ealen=""
# mape_ipv4_prefix=""
# mape_ipv4_prefixlen=""
# mape_ipv6_prefix=""
# mape_ipv6_prefixlen=""
# mape_psidlen=""
# mape_psid_offset=""
# mape_gua_mode=""
# mape_gua_prefix=""
# openwrt_19=""
# openwrt_21=""
# ap_ip_address="192.168.1.2"
# ap_gateway="192.168.1.1"
# ssh_interface="lan"
# flow_offloading_type=""
# enable_ttyd=""
# enable_irqbalance=""
# enable_samba4=""
LAN_DEF="$(uci -q get network.lan.device || echo lan)"
WAN_DEF="$(uci -q get network.wan.device || echo wan)"
MAP_NAME="map"
MAP6_NAME="map6"
DSLITE_NAME="dslite"
DSLITE6_NAME="dslite6"
AP_NAME="ap"
AP6_NAME="ap6"
exec >/tmp/setup.log 2>&1
if [ -n "\${root_password}" ]; then
    (echo "\${root_password}"; sleep 1; echo "\${root_password}") | passwd >/dev/null 2>&1
fi
if [ -n "\${device_name}" ]; then
    uci set system.@system[0].hostname="\${device_name}"
fi
if [ -n "\${lan_ip_address}" ]; then
    uci set network.lan.ipaddr="\${lan_ip_address}"
fi
if [ -n "\${lan_ipv6_address}" ]; then
    uci set network.lan.ip6addr="\${lan_ipv6_address}"
fi
if [ -n "\${language}" ]; then
    uci set system.@system[0].language="\${language}"
fi
if [ -n "\${country}" ]; then
    uci set wireless.@wifi-device[0].country="\${country}" 2>/dev/null
fi
if [ -n "\${timezone}" ]; then
    uci set system.@system[0].timezone="\${timezone}"
fi
if [ -n "\${zonename}" ]; then
    uci set system.@system[0].zonename="\${zonename}"
fi
if [ -n "\${wlan_name}" ] && [ -n "\${wlan_password}" ] && [ \${wlan_password} -ge 8 ]; then
    uci set wireless.@wifi-device[0].disabled='0'
    uci set wireless.@wifi-iface[0].disabled='0'
    uci set wireless.@wifi-iface[0].encryption='sae-mixed'
    uci set wireless.@wifi-iface[0].ssid="\${wlan_name}"
    uci set wireless.@wifi-iface[0].key="\${wlan_password}"
fi
if [ -n "\${pppoe_username}" ] && [ -n "\${pppoe_password}" ]; then
    uci set network.wan.proto='pppoe'
    uci set network.wan.username="\${pppoe_username}"
    uci set network.wan.password="\${pppoe_password}"
fi
if [ -n "\${dslite_aftr_address}" ]; then
    cp -p /etc/config/network /etc/config/network.\${DSLITE_NAME}.bak 2>/dev/null
    cp -p /etc/config/dhcp /etc/config/dhcp.\${DSLITE_NAME}.bak 2>/dev/null
    cp -p /etc/config/firewall /etc/config/firewall.\${DSLITE_NAME}.bak 2>/dev/null
    uci set network.wan.disabled='1'
    uci set network.wan.auto='0'
    uci set network.wan6.disabled='1'
    uci set network.wan6.auto='0'
    uci set network.\${DSLITE6_NAME}=interface
    uci set network.\${DSLITE6_NAME}.proto='dhcpv6'
    uci set network.\${DSLITE6_NAME}.device="\${WAN_DEF}"
    uci set network.\${DSLITE6_NAME}.reqaddress='try'
    uci set network.\${DSLITE6_NAME}.reqprefix='auto'
    uci set network.\${DSLITE_NAME}=interface
    uci set network.\${DSLITE_NAME}.proto='dslite'
    uci set network.\${DSLITE_NAME}.peeraddr="\${dslite_aftr_address}"
    uci set network.\${DSLITE_NAME}.tunlink="\${DSLITE6_NAME}"
    uci set network.\${DSLITE_NAME}.mtu='1460'
    uci set network.\${DSLITE_NAME}.encaplimit='ignore'
    uci set dhcp.\${DSLITE6_NAME}=dhcp
    uci set dhcp.\${DSLITE6_NAME}.interface="\${DSLITE6_NAME}"
    uci set dhcp.\${DSLITE6_NAME}.master='1'
    uci set dhcp.\${DSLITE6_NAME}.ra='relay'
    uci set dhcp.\${DSLITE6_NAME}.dhcpv6='relay'
    uci set dhcp.\${DSLITE6_NAME}.ndp='relay'
    uci set dhcp.\${DSLITE6_NAME}.ignore='1'
    uci set dhcp.lan.ra='relay'
    uci set dhcp.lan.dhcpv6='relay'
    uci set dhcp.lan.ndp='relay'
    uci set dhcp.lan.force='1'
    uci add_list firewall.@zone[1].network="\${DSLITE_NAME}"
    uci add_list firewall.@zone[1].network="\${DSLITE6_NAME}"
    uci set firewall.@zone[1].masq='1'
    uci set firewall.@zone[1].mtu_fix='1'
fi
if [ -n "\${mape_br}" ] && [ -n "\${mape_ealen}" ]; then
    cp -p /etc/config/network /etc/config/network.\${MAP_NAME}.bak 2>/dev/null
    cp -p /etc/config/dhcp /etc/config/dhcp.\${MAP_NAME}.bak 2>/dev/null
    cp -p /etc/config/firewall /etc/config/firewall.\${MAP_NAME}.bak 2>/dev/null
    cp -p /lib/netifd/proto/map.sh /lib/netifd/proto/map.sh.bak 2>/dev/null
    uci set network.wan.disabled='1'
    uci set network.wan.auto='0'
    uci set network.wan6.disabled='1'
    uci set network.wan6.auto='0'
    uci set network.\${MAP6_NAME}=interface
    uci set network.\${MAP6_NAME}.proto='dhcpv6'
    uci set network.\${MAP6_NAME}.device="\${WAN_DEF}"
    uci set network.\${MAP6_NAME}.reqaddress='try'
    uci set network.\${MAP6_NAME}.reqprefix='auto'
    uci set network.\${MAP_NAME}=interface
    uci set network.\${MAP_NAME}.proto='map'
    uci set network.\${MAP_NAME}.maptype='map-e'
    uci set network.\${MAP_NAME}.peeraddr="\${mape_br}"
    uci set network.\${MAP_NAME}.ipaddr="\${mape_ipv4_prefix}"
    uci set network.\${MAP_NAME}.ip4prefixlen="\${mape_ipv4_prefixlen}"
    uci set network.\${MAP_NAME}.ip6prefix="\${mape_ipv6_prefix}"
    uci set network.\${MAP_NAME}.ip6prefixlen="\${mape_ipv6_prefixlen}"
    uci set network.\${MAP_NAME}.ealen="\${mape_ealen}"
    uci set network.\${MAP_NAME}.psidlen="\${mape_psidlen}"
    uci set network.\${MAP_NAME}.offset="\${mape_psid_offset}"
    uci set network.\${MAP_NAME}.mtu='1460'
    uci set network.\${MAP_NAME}.encaplimit='ignore'
    uci set dhcp.\${MAP6_NAME}=dhcp
    uci set dhcp.\${MAP6_NAME}.interface="\${MAP6_NAME}"
    uci set dhcp.\${MAP6_NAME}.master='1'
    uci set dhcp.\${MAP6_NAME}.ra='relay'
    uci set dhcp.\${MAP6_NAME}.dhcpv6='relay'
    uci set dhcp.\${MAP6_NAME}.ndp='relay'
    uci set dhcp.lan.ra='relay'
    uci set dhcp.lan.dhcpv6='relay'
    uci set dhcp.lan.ndp='relay'
    uci set dhcp.lan.force='1'
    uci add_list firewall.@zone[1].network="\${MAP_NAME}"
    uci add_list firewall.@zone[1].network="\${MAP6_NAME}"
    uci set firewall.@zone[1].masq='1'
    uci set firewall.@zone[1].mtu_fix='1'
    cat > /lib/netifd/proto/map.sh << 'MAP_SH_EOF'
\${map_sh_content}
MAP_SH_EOF
fi
if [ -n "\${mape_gua_mode}" ]; then
    uci set network.\${MAP6_NAME}.ip6prefix="\${mape_gua_prefix}"
fi
if [ -n "\${openwrt_19}" ]; then
    uci add_list network.\${MAP_NAME}.tunlink="\${MAP6_NAME}"
fi
if [ -n "\${openwrt_21}" ]; then
    uci set network.\${MAP_NAME}.legacymap='1'
    uci set network.\${MAP_NAME}.tunlink="\${MAP6_NAME}"
    uci set dhcp.\${MAP6_NAME}.ignore='1'
fi
if [ -n "\${ap_ip_address}" ]; then
    cp -p /etc/config/network /etc/config/network.\${AP_NAME}.bak 2>/dev/null
    cp -p /etc/config/dhcp /etc/config/dhcp.\${AP_NAME}.bak 2>/dev/null
    cp -p /etc/config/firewall /etc/config/firewall.\${AP_NAME}.bak 2>/dev/null
    uci set network.wan.disabled='1'
    uci set network.wan.auto='0'
    uci set network.wan6.disabled='1'
    uci set network.wan6.auto='0'
    uci set network.\${AP_NAME}=interface
    uci set network.\${AP_NAME}.proto='static'
    uci set network.\${AP_NAME}.device="\${LAN_DEF}"
    uci set network.\${AP_NAME}.ipaddr="\${ap_ip_address}"
    uci set network.\${AP_NAME}.netmask='255.255.255.0'
    uci set network.\${AP_NAME}.gateway="\${ap_gateway}"
    uci set network.\${AP_NAME}.dns="\${ap_gateway}"
    uci set network.\${AP_NAME}.delegate='0'
    uci set network.\${AP6_NAME}=interface
    uci set network.\${AP6_NAME}.proto='dhcpv6'
    uci set network.\${AP6_NAME}.device="@\${AP_NAME}"
    uci set network.\${AP6_NAME}.reqaddress='try'
    uci set network.\${AP6_NAME}.reqprefix='no'
    uci set network.\${AP6_NAME}.type='bridge'
    [ -n "$(uci -q get wireless.default_radio0)" ] && uci set wireless.default_radio0.network="\${AP_NAME}"
    [ -n "$(uci -q get wireless.default_radio1)" ] && uci set wireless.default_radio1.network="\${AP_NAME}"
    [ -n "$(uci -q get wireless.default_radio2)" ] && uci set wireless.default_radio2.network="\${AP_NAME}"
    [ -x /etc/init.d/odhcpd ] && /etc/init.d/odhcpd enabled && /etc/init.d/odhcpd disable
    [ -x /etc/init.d/odhcpd ] && /etc/init.d/odhcpd running && /etc/init.d/odhcpd stop
    [ -x /etc/init.d/dnsmasq ] && /etc/init.d/dnsmasq enabled && /etc/init.d/dnsmasq disable
    [ -x /etc/init.d/dnsmasq ] && /etc/init.d/dnsmasq running && /etc/init.d/dnsmasq stop
    [ -x /etc/init.d/firewall ] && /etc/init.d/firewall enabled && /etc/init.d/firewall disable
    [ -x /etc/init.d/firewall ] && /etc/init.d/firewall running && /etc/init.d/firewall stop
fi
if [ -n "\${ssh_interface}" ]; then
    uci set dropbear.@dropbear[0].Interface="\${ssh_interface}"
fi
if [ -n "\${flow_offloading_type}" ]; then
    case "\${flow_offloading_type}" in
        "software")
            uci set firewall.@defaults[0].flow_offloading='1'
            ;;
        "hardware")
            uci set firewall.@defaults[0].flow_offloading='1'
            uci set firewall.@defaults[0].flow_offloading_hw='1'
            ;;
    esac
fi
if [ -n "$enable_ttyd" ]; then
    uci set ttyd.@ttyd[0].ttyd.ipv6='1' 
    uci set ttyd.@ttyd[0].command='/bin/login -f root' 
fi
if [ -n "$enable_irqbalance" ]; then
    uci set irqbalance.irqbalance=irqbalance
    uci set irqbalance.irqbalance.enabled='1'
fi
if [ -n "$enable_samba4" ]; then
    NAS="openwrt"
    MNT="/mnt/sda"
    uci set samba4.@samba[0]=samba
    uci set samba4.@samba[0].workgroup='WORKGROUP'
    uci set samba4.@samba[0].charset='UTF-8'
    uci set samba4.@samba[0].description='Samba on OpenWRT'
    uci set samba4.@samba[0].enable_extra_tuning='1'
    uci set samba4.@samba[0].interface='lan'
    uci set samba4.sambashare=sambashare
    uci set samba4.sambashare.name="\${NAS}"
    uci set samba4.sambashare.path="\${MNT}"
    uci set samba4.sambashare.read_only='no'
    uci set samba4.sambashare.force_root='1'
    uci set samba4.sambashare.guest_ok='yes'
    uci set samba4.sambashare.inherit_owner='yes'
    uci set samba4.sambashare.create_mask='0777'
    uci set samba4.sambashare.dir_mask='0777'
fi
uci commit 2>/dev/null
echo "All done!"
exit 0
