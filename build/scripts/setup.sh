#!/bin/sh
LAN_DEF="$(uci -q get network.lan.device || echo lan)"
WAN_DEF="$(uci -q get network.wan.device || echo wan)"
MAP_NAME="map"
MAP6_NAME="map6"
DSLITE_NAME="dslite"
DSLITE6_NAME="dslite6"
AP_NAME="ap"
AP6_NAME="ap6"
# BEGIN_VARIABLE_DEFINITIONS
# END_VARIABLE_DEFINITIONS
exec >/tmp/setup.log 2>&1

[ -n "\${device_name}" ] && uci batch <<'EOF'
set system.@system[0].hostname="\${device_name}"
EOF

[ -n "\${root_password}" ] && printf "%s\n%s\n" "\${root_password}" "\${root_password}" | passwd >/dev/null

uci batch <<'EOF'
[ -n "\${lan_ip_address}" ] && set network.lan.ipaddr="\${lan_ip_address}"
[ -n "\${lan_ipv6_address}" ] && set network.lan.ip6addr="\${lan_ipv6_address}"
[ -n "\${language}" ] && set system.@system[0].language="\${language}"
[ -n "\${timezone}" ] && set system.@system[0].timezone="\${timezone}"
[ -n "\${zonename}" ] && set system.@system[0].zonename="\${zonename}"
[ -n "\${ssh_interface}" ] && set dropbear.@dropbear[0].Interface="\${ssh_interface}"
[ -n "\${ssh_port}" ] && set dropbear.@dropbear[0].Port="\${ssh_port}"
[ "\${flow_offloading_type}" = "software" ] && set firewall.@defaults[0].flow_offloading='1'
[ "\${flow_offloading_type}" = "hardware" ] && { set firewall.@defaults[0].flow_offloading='1'; set firewall.@defaults[0].flow_offloading_hw='1'; }
EOF

if [ -n "\${wlan_name}" ] && [ -n "\${wlan_password}" ]; then
    for radio in $(uci -q show wireless | grep "wireless\.radio[0-9]*=" | cut -d. -f2 | cut -d= -f1); do
        band=$(uci -q get wireless.\${radio}.band)
        case "\${band}" in
            2g) suffix="-2g"; encryption='sae-mixed' ;;
            5g) suffix="-5g"; encryption='sae-mixed' ;;
            6g) suffix="-6g"; encryption='sae' ;;
            *) suffix=""; encryption='sae-mixed' ;;
        esac
        iface="default_\${radio}"
        uci batch <<'EOF'
set wireless.\${radio}.disabled='0'
set wireless.\${radio}.country="\${country:-00}"
[ -n "$(uci -q get wireless.\${iface})" ] && {
    set wireless.\${iface}.disabled='0'
    set wireless.\${iface}.encryption="\${encryption}"
    set wireless.\${iface}.ssid="\${wlan_name}\${suffix}"
    set wireless.\${iface}.key="\${wlan_password}"
}
EOF
    done
fi

[ -n "\${pppoe_username}" ] && [ -n "\${pppoe_password}" ] && uci batch <<'EOF'
set network.wan.proto='pppoe'
set network.wan.username="\${pppoe_username}"
set network.wan.password="\${pppoe_password}"
EOF

[ -n "\${dslite_aftr_address}" ] && uci batch <<'EOF'
set network.wan.disabled='1'
set network.wan.auto='0'
set network.wan6.disabled='1'
set network.wan6.auto='0'
set network.\${DSLITE6_NAME}=interface
set network.\${DSLITE6_NAME}.proto='dhcpv6'
set network.\${DSLITE6_NAME}.device="\${WAN_DEF}"
set network.\${DSLITE6_NAME}.reqaddress='try'
set network.\${DSLITE6_NAME}.reqprefix='auto'
set network.\${DSLITE_NAME}=interface
set network.\${DSLITE_NAME}.proto='dslite'
set network.\${DSLITE_NAME}.peeraddr="\${dslite_aftr_address}"
set network.\${DSLITE_NAME}.tunlink="\${DSLITE6_NAME}"
set network.\${DSLITE_NAME}.mtu='1460'
set network.\${DSLITE_NAME}.encaplimit='ignore'
set dhcp.\${DSLITE6_NAME}=dhcp
set dhcp.\${DSLITE6_NAME}.interface="\${DSLITE6_NAME}"
set dhcp.\${DSLITE6_NAME}.master='1'
set dhcp.\${DSLITE6_NAME}.ra='relay'
set dhcp.\${DSLITE6_NAME}.dhcpv6='relay'
set dhcp.\${DSLITE6_NAME}.ndp='relay'
set dhcp.\${DSLITE6_NAME}.ignore='1'
set dhcp.lan.ra='relay'
set dhcp.lan.dhcpv6='relay'
set dhcp.lan.ndp='relay'
set dhcp.lan.force='1'
del_list firewall.@zone[1].network="wan"
del_list firewall.@zone[1].network="wan6"
add_list firewall.@zone[1].network="\${DSLITE_NAME}"
add_list firewall.@zone[1].network="\${DSLITE6_NAME}"
set firewall.@zone[1].masq='1'
set firewall.@zone[1].mtu_fix='1'
EOF

[ -n "\${mape_br}" ] && [ -n "\${mape_ealen}" ] && {
    uci batch <<'EOF'
set network.wan.disabled='1'
set network.wan.auto='0'
set network.wan6.disabled='1'
set network.wan6.auto='0'
set network.\${MAP6_NAME}=interface
set network.\${MAP6_NAME}.proto='dhcpv6'
set network.\${MAP6_NAME}.device="\${WAN_DEF}"
set network.\${MAP6_NAME}.reqaddress='try'
set network.\${MAP6_NAME}.reqprefix='auto'
[ -n "\${mape_gua_mode}" ] && set network.\${MAP6_NAME}.ip6prefix="\${mape_gua_prefix}"
set network.\${MAP_NAME}=interface
set network.\${MAP_NAME}.proto='map'
set network.\${MAP_NAME}.maptype='map-e'
set network.\${MAP_NAME}.peeraddr="\${mape_br}"
set network.\${MAP_NAME}.ipaddr="\${mape_ipv4_prefix}"
set network.\${MAP_NAME}.ip4prefixlen="\${mape_ipv4_prefixlen}"
set network.\${MAP_NAME}.ip6prefix="\${mape_ipv6_prefix}"
set network.\${MAP_NAME}.ip6prefixlen="\${mape_ipv6_prefixlen}"
set network.\${MAP_NAME}.ealen="\${mape_ealen}"
set network.\${MAP_NAME}.psidlen="\${mape_psidlen}"
set network.\${MAP_NAME}.offset="\${mape_psid_offset}"
set network.\${MAP_NAME}.mtu='1460'
set network.\${MAP_NAME}.encaplimit='ignore'
set network.\${MAP_NAME}.legacymap='1'
set network.\${MAP_NAME}.tunlink="\${MAP6_NAME}"
set dhcp.\${MAP6_NAME}=dhcp
set dhcp.\${MAP6_NAME}.interface="\${MAP6_NAME}"
set dhcp.\${MAP6_NAME}.master='1'
set dhcp.\${MAP6_NAME}.ra='relay'
set dhcp.\${MAP6_NAME}.dhcpv6='relay'
set dhcp.\${MAP6_NAME}.ndp='relay'
set dhcp.\${MAP6_NAME}.ignore='1'
set dhcp.lan.ra='relay'
set dhcp.lan.dhcpv6='relay'
set dhcp.lan.ndp='relay'
set dhcp.lan.force='1'
del_list firewall.@zone[1].network="wan"
del_list firewall.@zone[1].network="wan6"
add_list firewall.@zone[1].network="\${MAP_NAME}"
add_list firewall.@zone[1].network="\${MAP6_NAME}"
set firewall.@zone[1].masq='1'
set firewall.@zone[1].mtu_fix='1'
EOF
    cat > /lib/netifd/proto/map.sh << 'MAP_SH_EOF'
\${map_sh_content}
MAP_SH_EOF
}

[ -n "\${ap_ip_address}" ] && {
    uci batch <<'EOF'
set network.wan.disabled='1'
set network.wan.auto='0'
set network.wan6.disabled='1'
set network.wan6.auto='0'
set network.\${AP_NAME}=interface
set network.\${AP_NAME}.proto='static'
set network.\${AP_NAME}.device="\${LAN_DEF}"
set network.\${AP_NAME}.ipaddr="\${ap_ip_address}"
set network.\${AP_NAME}.netmask='255.255.255.0'
set network.\${AP_NAME}.gateway="\${ap_gateway}"
set network.\${AP_NAME}.dns="\${ap_gateway}"
set network.\${AP_NAME}.delegate='0'
set network.\${AP6_NAME}=interface
set network.\${AP6_NAME}.proto='dhcpv6'
set network.\${AP6_NAME}.device="@\${AP_NAME}"
set network.\${AP6_NAME}.reqaddress='try'
set network.\${AP6_NAME}.reqprefix='no'
set network.\${AP6_NAME}.type='bridge'
EOF
    [ -n "$(uci -q get wireless.default_radio0)" ] && uci set wireless.default_radio0.network="\${AP_NAME}"
    [ -n "$(uci -q get wireless.default_radio1)" ] && uci set wireless.default_radio1.network="\${AP_NAME}"
    [ -n "$(uci -q get wireless.default_radio2)" ] && uci set wireless.default_radio2.network="\${AP_NAME}"
    [ -x /etc/init.d/odhcpd ] && /etc/init.d/odhcpd enabled && /etc/init.d/odhcpd disable
    [ -x /etc/init.d/odhcpd ] && /etc/init.d/odhcpd running && /etc/init.d/odhcpd stop
    [ -x /etc/init.d/dnsmasq ] && /etc/init.d/dnsmasq enabled && /etc/init.d/dnsmasq disable
    [ -x /etc/init.d/dnsmasq ] && /etc/init.d/dnsmasq running && /etc/init.d/dnsmasq stop
    [ -x /etc/init.d/firewall ] && /etc/init.d/firewall enabled && /etc/init.d/firewall disable
    [ -x /etc/init.d/firewall ] && /etc/init.d/firewall running && /etc/init.d/firewall stop
}

[ -n "\${enable_ttyd}" ] && uci batch <<'EOF'
set ttyd.@ttyd[0].ipv6='1'
set ttyd.@ttyd[0].command='/bin/login -f root'
EOF

[ -n "\${enable_irqbalance}" ] && uci batch <<'EOF'
set irqbalance.irqbalance=irqbalance
set irqbalance.irqbalance.enabled='1'
EOF

[ -n "\${enable_samba4}" ] && {
    NAS="openwrt"
    MNT="/mnt/sda"
    uci batch <<'EOF'
set samba4.@samba[0]=samba
set samba4.@samba[0].workgroup='WORKGROUP'
set samba4.@samba[0].charset='UTF-8'
set samba4.@samba[0].description='Samba on OpenWRT'
set samba4.@samba[0].enable_extra_tuning='1'
set samba4.@samba[0].interface='lan'
set samba4.sambashare=sambashare
set samba4.sambashare.name="\${NAS}"
set samba4.sambashare.path="\${MNT}"
set samba4.sambashare.read_only='no'
set samba4.sambashare.force_root='1'
set samba4.sambashare.guest_ok='yes'
set samba4.sambashare.inherit_owner='yes'
set samba4.sambashare.create_mask='0777'
set samba4.sambashare.dir_mask='0777'
EOF
}

# BEGIN_CUSTOM_COMMANDS
# END_CUSTOM_COMMANDS

uci commit 2>/dev/null
echo "All done!"
[ -n "\${backup_path}" ] && sysupgrade -q -k -b "\${backup_path}"
exit 0
