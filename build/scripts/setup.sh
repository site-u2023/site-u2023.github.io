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
[ -n "\${device_name}" ] && uci set system.@system[0].hostname="\${device_name}"
[ -n "\${root_password}" ] && printf "%s\n%s\n" "\${root_password}" "\${root_password}" | passwd >/dev/null
[ -n "\${lan_ip_address}" ] && uci set network.lan.ipaddr="\${lan_ip_address}"
[ -n "\${lan_ipv6_address}" ] && uci set network.lan.ip6addr="\${lan_ipv6_address}"
[ -n "\${language}" ] && uci set system.@system[0].language="\${language}"
[ -n "\${timezone}" ] && uci set system.@system[0].timezone="\${timezone}"
[ -n "\${zonename}" ] && uci set system.@system[0].zonename="\${zonename}"
[ -n "\${ssh_interface}" ] && uci set dropbear.@dropbear[0].Interface="\${ssh_interface}"
[ -n "\${ssh_port}" ] && uci set dropbear.@dropbear[0].Port="\${ssh_port}"
[ "\${flow_offloading_type}" = "software" ] && uci set firewall.@defaults[0].flow_offloading='1'
[ "\${flow_offloading_type}" = "hardware" ] && { uci set firewall.@defaults[0].flow_offloading='1'; uci set firewall.@defaults[0].flow_offloading_hw='1'; }
[ -n "\${wlan_name}" ] && [ -n "\${wlan_password}" ] && {
    for radio in $(uci -q show wireless | grep "wireless\.radio[0-9]*=" | cut -d. -f2 | cut -d= -f1); do
        uci set wireless.\${radio}.disabled='0'
        uci set wireless.\${radio}.country="\${country:-00}" 2>/dev/null
        band=$(uci -q get wireless.\${radio}.band)
        case "\${band}" in
            2g) suffix="-2g"; encryption='sae-mixed' ;;
            5g) suffix="-5g"; encryption='sae-mixed' ;;
            6g) suffix="-6g"; encryption='sae' ;;
            *) suffix=""; encryption='sae-mixed' ;;
        esac
        iface="default_\${radio}"
        [ -n "$(uci -q get wireless.\${iface})" ] && {
            uci set wireless.\${iface}.disabled='0'
            uci set wireless.\${iface}.encryption="\${encryption}"
            uci set wireless.\${iface}.ssid="\${wlan_name}\${suffix}"
            uci set wireless.\${iface}.key="\${wlan_password}"
        }
    done
}
[ -n "\${pppoe_username}" ] && [ -n "\${pppoe_password}" ] && {
    uci set network.wan.proto='pppoe'
    uci set network.wan.username="\${pppoe_username}"
    uci set network.wan.password="\${pppoe_password}"
}
[ -n "\${dslite_aftr_address}" ] && {
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
    uci del_list firewall.@zone[1].network="wan"
    uci del_list firewall.@zone[1].network="wan6"
    uci add_list firewall.@zone[1].network="\${DSLITE_NAME}"
    uci add_list firewall.@zone[1].network="\${DSLITE6_NAME}"
    uci set firewall.@zone[1].masq='1'
    uci set firewall.@zone[1].mtu_fix='1'
}
[ -n "\${mape_br}" ] && [ -n "\${mape_ealen}" ] && {
    uci set network.wan.disabled='1'
    uci set network.wan.auto='0'
    uci set network.wan6.disabled='1'
    uci set network.wan6.auto='0'
    uci set network.\${MAP6_NAME}=interface
    uci set network.\${MAP6_NAME}.proto='dhcpv6'
    uci set network.\${MAP6_NAME}.device="\${WAN_DEF}"
    uci set network.\${MAP6_NAME}.reqaddress='try'
    uci set network.\${MAP6_NAME}.reqprefix='auto'
    [ -n "\${mape_gua_mode}" ] && uci set network.\${MAP6_NAME}.ip6prefix="\${mape_gua_prefix}"
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
    uci set network.\${MAP_NAME}.legacymap='1'
    uci set network.\${MAP_NAME}.tunlink="\${MAP6_NAME}"
    uci set dhcp.\${MAP6_NAME}=dhcp
    uci set dhcp.\${MAP6_NAME}.interface="\${MAP6_NAME}"
    uci set dhcp.\${MAP6_NAME}.master='1'
    uci set dhcp.\${MAP6_NAME}.ra='relay'
    uci set dhcp.\${MAP6_NAME}.dhcpv6='relay'
    uci set dhcp.\${MAP6_NAME}.ndp='relay'
    uci set dhcp.\${MAP6_NAME}.ignore='1'
    uci set dhcp.lan.ra='relay'
    uci set dhcp.lan.dhcpv6='relay'
    uci set dhcp.lan.ndp='relay'
    uci set dhcp.lan.force='1'
    uci del_list firewall.@zone[1].network="wan"
    uci del_list firewall.@zone[1].network="wan6"
    uci add_list firewall.@zone[1].network="\${MAP_NAME}"
    uci add_list firewall.@zone[1].network="\${MAP6_NAME}"
    uci set firewall.@zone[1].masq='1'
    uci set firewall.@zone[1].mtu_fix='1'
    cat > /lib/netifd/proto/map.sh << 'MAP_SH_EOF'
\${map_sh_content}
MAP_SH_EOF
}
[ -n "\${ap_ip_address}" ] && {
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
}
[ -n "\${enable_ttyd}" ] && {
    uci set ttyd.@ttyd[0].ipv6='1'
    uci set ttyd.@ttyd[0].command='/bin/login -f root'
}
[ -n "\${enable_irqbalance}" ] && {
    uci set irqbalance.irqbalance=irqbalance
    uci set irqbalance.irqbalance.enabled='1'
}
[ -n "\${enable_samba4}" ] && {
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
}
# BEGIN_CUSTOM_COMMANDS
# END_CUSTOM_COMMANDS
uci commit 2>/dev/null
echo "All done!"
[ -n "\${backup_path}" ] && sysupgrade -q -k -b "\${backup_path}"
exit 0
