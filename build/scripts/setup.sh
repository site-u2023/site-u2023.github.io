#!/bin/sh
DATE="$(date '+%Y-%m-%d %H:%M')"
LAN="$(uci -q get network.lan.device || echo lan)"
WAN="$(uci -q get network.wan.device || echo wan)"
MAPE="mape"
MAPE6="mape6"
DSL="dsl"
DSL6="dsl6"
AP="ap"
AP6="ap6"
# BEGIN_VARIABLE_DEFINITIONS
# END_VARIABLE_DEFINITIONS
exec >/tmp/setup.log 2>&1
uci set system.@system[0].description="\${DATE}"
uci set system.@system[0].notes="site-u.pages.dev/build"
[ -n "\${device_name}" ] && uci set system.@system[0].hostname="\${device_name}"
[ -n "\${root_password}" ] && printf '%s\\n%s\\n' "\${root_password}" "\${root_password}" | passwd >/dev/null
[ -n "\${lan_ip_address}" ] && uci set network.lan.ipaddr="\${lan_ip_address}"
[ -n "\${lan_ipv6_address}" ] && uci set network.lan.ip6addr="\${lan_ipv6_address}"
[ -n "\${language}" ] && uci set system.@system[0].language="\${language}"
[ -n "\${timezone}" ] && uci set system.@system[0].timezone="\${timezone}"
[ -n "\${zonename}" ] && uci set system.@system[0].zonename="\${zonename}"
[ -n "\${ssh_interface}" ] && uci set dropbear.@dropbear[0].Interface="\${ssh_interface}"
[ -n "\${ssh_port}" ] && uci set dropbear.@dropbear[0].Port="\${ssh_port}"
[ "\${flow_offloading_type}" = "software" ] && uci set firewall.@defaults[0].flow_offloading='1'
[ "\${flow_offloading_type}" = "hardware" ] && { uci set firewall.@defaults[0].flow_offloading='1'; uci set firewall.@defaults[0].flow_offloading_hw='1'; }
[ -n "\${wlan_name}" ] && [ -n "\${wlan_password}" ] && [ \${#wlan_password} -ge 8 ] && {
    for radio in $(uci -q show wireless | grep "wireless\.radio[0-9]*=" | cut -d. -f2 | cut -d= -f1); do
        uci set wireless.\${radio}.disabled='0'
        uci set wireless.\${radio}.country="\${country:-00}" 2>/dev/null
        band=$(uci -q get wireless.\${radio}.band)
        case "\${band}" in
            2g) suffix="-2g"; encryption='psk-mixed' ;;
            5g) suffix="-5g"; encryption='sae-mixed' ;;
            6g) suffix="-6g"; encryption='sae' ;;
            *) suffix=""; encryption='psk-mixed' ;;
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
    uci set network.\${DSL6}=interface
    uci set network.\${DSL6}.proto='dhcpv6'
    uci set network.\${DSL6}.device="\${WAN}"
    uci set network.\${DSL6}.reqaddress='try'
    uci set network.\${DSL6}.reqprefix='auto'
    uci set network.\${DSL}=interface
    uci set network.\${DSL}.proto='dslite'
    uci set network.\${DSL}.peeraddr="\${dslite_aftr_address}"
    uci set network.\${DSL}.tunlink="\${DSL6}"
    uci set network.\${DSL}.mtu='1460'
    uci set network.\${DSL}.encaplimit='ignore'
    uci set dhcp.\${DSL6}=dhcp
    uci set dhcp.\${DSL6}.interface="\${DSL6}"
    uci set dhcp.\${DSL6}.master='1'
    uci set dhcp.\${DSL6}.ra='relay'
    uci set dhcp.\${DSL6}.dhcpv6='relay'
    uci set dhcp.\${DSL6}.ndp='relay'
    uci set dhcp.\${DSL6}.ignore='1'
    uci set dhcp.lan.ra='relay'
    uci set dhcp.lan.dhcpv6='relay'
    uci set dhcp.lan.ndp='relay'
    uci set dhcp.lan.force='1'
    uci del_list firewall.@zone[1].network="wan"
    uci del_list firewall.@zone[1].network="wan6"
    uci add_list firewall.@zone[1].network="\${DSL}"
    uci add_list firewall.@zone[1].network="\${DSL6}"
    uci set firewall.@zone[1].masq='1'
    uci set firewall.@zone[1].mtu_fix='1'
}
[ -n "\${mape_br}" ] && [ -n "\${mape_ealen}" ] && {
    uci set network.wan.disabled='1'
    uci set network.wan.auto='0'
    uci set network.wan6.disabled='1'
    uci set network.wan6.auto='0'
    uci set network.\${MAPE6}=interface
    uci set network.\${MAPE6}.proto='dhcpv6'
    uci set network.\${MAPE6}.device="\${WAN}"
    uci set network.\${MAPE6}.reqaddress='try'
    uci set network.\${MAPE6}.reqprefix='auto'
    [ -n "\${mape_gua_mode}" ] && uci set network.\${MAPE6}.ip6prefix="\${mape_gua_prefix}"
    uci set network.\${MAPE}=interface
    uci set network.\${MAPE}.proto='map'
    uci set network.\${MAPE}.maptype='map-e'
    uci set network.\${MAPE}.peeraddr="\${mape_br}"
    uci set network.\${MAPE}.ipaddr="\${mape_ipv4_prefix}"
    uci set network.\${MAPE}.ip4prefixlen="\${mape_ipv4_prefixlen}"
    uci set network.\${MAPE}.ip6prefix="\${mape_ipv6_prefix}"
    uci set network.\${MAPE}.ip6prefixlen="\${mape_ipv6_prefixlen}"
    uci set network.\${MAPE}.ealen="\${mape_ealen}"
    uci set network.\${MAPE}.psidlen="\${mape_psidlen}"
    uci set network.\${MAPE}.offset="\${mape_psid_offset}"
    uci set network.\${MAPE}.mtu='1460'
    uci set network.\${MAPE}.encaplimit='ignore'
    uci set network.\${MAPE}.legacymap='1'
    uci set network.\${MAPE}.tunlink="\${MAPE6}"
    uci set dhcp.\${MAPE6}=dhcp
    uci set dhcp.\${MAPE6}.interface="\${MAPE6}"
    uci set dhcp.\${MAPE6}.master='1'
    uci set dhcp.\${MAPE6}.ra='relay'
    uci set dhcp.\${MAPE6}.dhcpv6='relay'
    uci set dhcp.\${MAPE6}.ndp='relay'
    uci set dhcp.\${MAPE6}.ignore='1'
    uci set dhcp.lan.ra='relay'
    uci set dhcp.lan.dhcpv6='relay'
    uci set dhcp.lan.ndp='relay'
    uci set dhcp.lan.force='1'
    uci del_list firewall.@zone[1].network="wan"
    uci del_list firewall.@zone[1].network="wan6"
    uci add_list firewall.@zone[1].network="\${MAPE}"
    uci add_list firewall.@zone[1].network="\${MAPE6}"
    uci set firewall.@zone[1].masq='1'
    uci set firewall.@zone[1].mtu_fix='1'
    cat > /lib/netifd/proto/map.sh <<'MAP_SH_EOF'
\${map_sh_content}
MAP_SH_EOF
}
[ -n "\${ap_ip_address}" ] && {
    uci set network.wan.disabled='1'
    uci set network.wan.auto='0'
    uci set network.wan6.disabled='1'
    uci set network.wan6.auto='0'
    uci set network.\${AP}=interface
    uci set network.\${AP}.proto='static'
    uci set network.\${AP}.device="\${LAN}"
    uci set network.\${AP}.ipaddr="\${ap_ip_address}"
    uci set network.\${AP}.netmask='255.255.255.0'
    uci set network.\${AP}.gateway="\${ap_gateway}"
    uci set network.\${AP}.dns="\${ap_gateway}"
    uci set network.\${AP}.delegate='0'
    uci set network.\${AP6}=interface
    uci set network.\${AP6}.proto='dhcpv6'
    uci set network.\${AP6}.device="@\${AP}"
    uci set network.\${AP6}.reqaddress='try'
    uci set network.\${AP6}.reqprefix='no'
    uci set network.\${AP6}.type='bridge'
    [ -n "$(uci -q get wireless.default_radio0)" ] && uci set wireless.default_radio0.network="\${AP}"
    [ -n "$(uci -q get wireless.default_radio1)" ] && uci set wireless.default_radio1.network="\${AP}"
    [ -n "$(uci -q get wireless.default_radio2)" ] && uci set wireless.default_radio2.network="\${AP}"
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
[ -n "\${enable_netopt}" ] && { cat > /etc/rc.local <<'EOF'
#!/bin/sh
C=/etc/sysctl.d/99-net-opt.conf
M=\$(awk '/MemTotal/{print int(\$2/1024)}' /proc/meminfo)
P=\$(grep -c ^processor /proc/cpuinfo)
if [ \$M -ge 3072 ]; then R=16777216 W=16777216 TR="4096 262144 16777216" TW=\$TR CT=262144 NB=5000 SC=16384
elif [ \$M -ge 1536 ]; then R=8388608 W=8388608 TR="4096 131072 8388608" TW=\$TR CT=131072 NB=2500 SC=8192
elif [ \$M -ge 512 ]; then R=4194304 W=4194304 TR="4096 65536 4194304" TW=\$TR CT=65536 NB=1000 SC=4096
else exit 0; fi
[ \$P -gt 4 ] && { NB=\$((NB*2)); SC=\$((SC*2)); }
[ \$P -gt 2 ] && [ \$P -le 4 ] && { NB=\$((NB*3/2)); SC=\$((SC*3/2)); }
printf "net.core.rmem_max=%s\\nnet.core.wmem_max=%s\\nnet.ipv4.tcp_rmem=%s\\nnet.ipv4.tcp_wmem=%s\\nnet.ipv4.tcp_congestion_control=cubic\\nnet.ipv4.tcp_fastopen=3\\nnet.netfilter.nf_conntrack_max=%s\\nnet.core.netdev_max_backlog=%s\\nnet.core.somaxconn=%s\\n" "\$R" "\$W" "\$TR" "\$TW" "\$CT" "\$NB" "\$SC" > \$C
sysctl -p \$C
cat > /etc/rc.local <<'RESET_EOF'
exit 0
RESET_EOF
exit 0
EOF
}
[ -n "\${backup_path}" ] && sysupgrade -q -k -b "\${backup_path}"
echo "All done!"
exit 0
