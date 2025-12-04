#!/bin/sh
# shellcheck shell=sh disable=SC2034,SC2086,SC3043
# BEGIN_VARS
# END_VARS
enable_notes="1"
enable_ntp="1"
enable_log="1"
enable_diag="1"
SET() { uci -q set "${SEC}${SEC:+.}$*"; }
DEL() { uci -q delete "${SEC}${SEC:+.}$*"; }
ADDLIST() { uci add_list "${SEC}${SEC:+.}$*"; }
DELLIST() { uci del_list "${SEC}${SEC:+.}$*"; }
DATE="$(date '+%Y-%m-%d %H:%M')"
LAN="$(uci -q get network.lan.device || echo lan)"
WAN="$(uci -q get network.wan.device || echo wan)"
DIAG="one.one.one.one"
NTPDOMAIN=".pool.ntp.org"
COUNTRY="${country:-00}"
DSL="dsl"
DSL6="dsl6"
MAPE="mape"
MAPE6="mape6"
AP="ap"
AP6="ap6"
NAS="openwrt"
MNT="/mnt/sda"
MEM=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
exec >/tmp/aios-setup.log 2>&1
disable_wan() {
    local SEC=network
    SET wan.disabled='1'
    SET wan.auto='0'
    SET wan6.disabled='1'
    SET wan6.auto='0'
}
dhcp_relay() {
    local SEC=dhcp
    SET $1=dhcp
    SET $1.interface="$1"
    SET $1.master='1'
    SET $1.ra='relay'
    SET $1.dhcpv6='relay'
    SET $1.ndp='relay'
    SET $1.ignore='1'
    SET lan.ra='relay'
    SET lan.dhcpv6='relay'
    SET lan.ndp='relay'
    SET lan.force='1'
}
firewall_wan() {
    local SEC=firewall
    DELLIST @zone[1].network="wan"
    DELLIST @zone[1].network="wan6"
    ADDLIST @zone[1].network="$1"
    ADDLIST @zone[1].network="$2"
    SET @zone[1].masq='1'
    SET @zone[1].mtu_fix='1'
}
[ -n "${enable_notes}" ] && {
    local SEC=system
    SET @system[0].description="${DATE}"
    SET @system[0].notes="site-u.pages.dev"
}
[ -n "${enable_ntp}" ] && {
    local SEC=system
    SET ntp=timeserver
    SET ntp.enabled='1'
    SET ntp.enable_server='1'
    SET ntp.interface='lan'
    DEL ntp.server
    COUNTRY_LC=$(printf '%s' "$COUNTRY" | tr 'A-Z' 'a-z')
    for i in 0 1 2 3; do
        s="${i:0:2}.${COUNTRY_LC}${NTPDOMAIN}"
        [ $i -gt 1 ] && s="${i}${NTPDOMAIN}"
        ADDLIST ntp.server="$s"
    done
}
[ -n "${enable_log}" ] && {
    local SEC=system
    SET @system[0].log_size='32'
    SET @system[0].conloglevel='1'
    SET @system[0].cronloglevel='9'
}

[ -n "${enable_diag}" ] && {
    local SEC=luci
    SET diag=diag
    SET diag.ping="${DIAG}"
    SET diag.route="${DIAG}"
    SET diag.dns="${DIAG}"
}
[ -n "${device_name}" ] && { local SEC=system; SET @system[0].hostname="${device_name}"; }
[ -n "${root_password}" ] && printf '%s\n%s\n' "${root_password}" "${root_password}" | passwd >/dev/null
[ -n "${lan_ip_address}" ] && { local SEC=network; SET lan.ipaddr="${lan_ip_address}"; }
[ -n "${lan_ipv6_address}" ] && { local SEC=network; DEL lan.ip6assign; SET lan.ip6addr="${lan_ipv6_address}"; }
[ -n "${language}" ] && { local SEC=system; SET @system[0].language="${language}"; }
[ -n "${timezone}" ] && { local SEC=system; SET @system[0].timezone="${timezone}"; }
[ -n "${zonename}" ] && { local SEC=system; SET @system[0].zonename="${zonename}"; }
[ -n "${ssh_interface}" ] && { local SEC=dropbear; SET @dropbear[0].Interface="${ssh_interface}"; }
[ -n "${ssh_port}" ] && { local SEC=dropbear; SET @dropbear[0].Port="${ssh_port}"; }
[ -n "${flow_offloading_type}" ] && {
    local SEC=firewall
    SET @defaults[0].flow_offloading='1'
    [ "${flow_offloading_type}" = "hardware" ] && SET @defaults[0].flow_offloading_hw='1'
}
{ [ "${wifi_mode}" = "standard" ] || [ "${wifi_mode}" = "usteer" ]; } && [ -n "${wlan_ssid}" ] && [ -n "${wlan_password}" ] && [ "${#wlan_password}" -ge 8 ] && {
    local SEC=wireless
    wireless_cfg=$(uci -q show wireless)
    for radio in $(printf '%s\n' "${wireless_cfg}" | grep "wireless\.radio[0-9]*=" | cut -d. -f2 | cut -d= -f1); do
        SET ${radio}.disabled='0'
        SET ${radio}.country="${COUNTRY}"
        band=$(uci -q get wireless.${radio}.band)
        set -- 30 15 5
        case "${band}" in
            2g) encryption='psk-mixed'; nasid_suffix='-2g'; band_snr=$1;;
            5g) encryption='sae-mixed'; nasid_suffix='-5g'; band_snr=$2;;
            6g) encryption='sae'; nasid_suffix='-6g'; band_snr=$3;;
            *)  encryption='psk-mixed'; nasid_suffix=''; band_snr=20;;
        esac
        suffix=${band:+-$band}
        [ "${wifi_mode}" = "usteer" ] && ssid="${wlan_ssid}" || ssid="${wlan_ssid}${suffix}"
        iface="default_${radio}"
        [ -n "$(uci -q get wireless.${iface})" ] && {
            SET ${iface}.disabled='0'
            SET ${iface}.encryption="${encryption}"
            SET ${iface}.ssid="${ssid}"
            SET ${iface}.key="${wlan_password}"
            [ "${wifi_mode}" = "usteer" ] && {
                SET ${iface}.isolate='1'
                SET ${iface}.ocv='1'
                SET ${iface}.ieee80211r='1'
                SET ${iface}.mobility_domain="${mobility_domain:-4f57}"
                SET ${iface}.ft_over_ds='1'
                SET ${iface}.nasid="${wlan_ssid}${nasid_suffix}"
                SET ${iface}.usteer_min_snr="${band_snr}"
                SET ${iface}.ieee80211k='1'
                SET ${iface}.ieee80211v='1'
            }
        }
    done
    [ "${wifi_mode}" = "usteer" ] && {
        local SEC=usteer
        SET @usteer[0].band_steering='1'
        SET @usteer[0].load_balancing='1'
        SET @usteer[0].sta_block_timeout='300'
        SET @usteer[0].min_snr='20'
        SET @usteer[0].max_snr='80'
        SET @usteer[0].signal_diff_threshold='10'
    }
}
[ "${connection_type}" = "pppoe" ] && [ -n "${pppoe_username}" ] && {
    local SEC=network
    SET wan.proto='pppoe'
    SET wan.username="${pppoe_username}"
    [ -n "${pppoe_password}" ] && SET wan.password="${pppoe_password}"
}
[ "${connection_type}" = "auto" -o "${connection_type}" = "dslite" ] && [ -n "${dslite_aftr_address}" ] && {
    local SEC=network
    disable_wan
    SET ${DSL6}=interface
    SET ${DSL6}.proto='dhcpv6'
    SET ${DSL6}.device="${WAN}"
    SET ${DSL6}.reqaddress='try'
    SET ${DSL6}.reqprefix='auto'
    SET ${DSL}=interface
    SET ${DSL}.proto='dslite'
    SET ${DSL}.peeraddr="${dslite_aftr_address}"
    SET ${DSL}.tunlink="${DSL6}"
    SET ${DSL}.mtu='1460'
    SET ${DSL}.encaplimit='ignore'
    dhcp_relay "${DSL6}"
    firewall_wan "${DSL}" "${DSL6}"
}
[ "${connection_type}" = "auto" -o "${connection_type}" = "mape" ] && [ -n "${mape_br}" ] && {
    local SEC=network
    disable_wan
    SET ${MAPE6}=interface
    SET ${MAPE6}.proto='dhcpv6'
    SET ${MAPE6}.device="${WAN}"
    SET ${MAPE6}.reqaddress='try'
    SET ${MAPE6}.reqprefix='auto'
    SET ${MAPE}=interface
    SET ${MAPE}.proto='map'
    SET ${MAPE}.maptype='map-e'
    SET ${MAPE}.peeraddr="${mape_br}"
    SET ${MAPE}.ipaddr="${mape_ipv4_prefix}"
    SET ${MAPE}.ip4prefixlen="${mape_ipv4_prefixlen}"
    SET ${MAPE}.ip6prefix="${mape_ipv6_prefix}"
    SET ${MAPE}.ip6prefixlen="${mape_ipv6_prefixlen}"
    SET ${MAPE}.ealen="${mape_ealen}"
    SET ${MAPE}.psidlen="${mape_psidlen}"
    SET ${MAPE}.offset="${mape_psid_offset}"
    SET ${MAPE}.mtu='1460'
    SET ${MAPE}.encaplimit='ignore'
    SET ${MAPE}.legacymap='1'
    SET ${MAPE}.tunlink="${MAPE6}"
    dhcp_relay "${MAPE6}"
    firewall_wan "${MAPE}" "${MAPE6}"
    [ -n "${mape_gua_prefix}" ] && SET ${MAPE6}.ip6prefix="${mape_gua_prefix}"
    MAP_SH="/lib/netifd/proto/map.sh"   
    EXPECTED_HASH="7f0682eeaf2dd7e048ff1ad1dbcc5b913ceb8de4"
    ACTUAL_HASH=$(sha1sum "$MAP_SH" | awk '{print $1}')
    if [ "$ACTUAL_HASH" = "$EXPECTED_HASH" ]; then
    cp "$MAP_SH" "$MAP_SH".bak
    sed -i '1a # github.com/fakemanhk/openwrt-jp-ipoe\nDONT_SNAT_TO="0"' "$MAP_SH"
    sed -i 's/mtu:-1280/mtu:-1460/g' "$MAP_SH"
    sed -i '137,158d' "$MAP_SH"
    sed -i '136a\
\t  if [ -z "$(eval "echo \\$RULE_${k}_PORTSETS")" ]; then\
\t    json_add_object ""\
\t      json_add_string type nat\
\t      json_add_string target SNAT\
\t      json_add_string family inet\
\t      json_add_string snat_ip $(eval "echo \\$RULE_${k}_IPV4ADDR")\
\t    json_close_object\
\t  else\
\t    local portcount=0\
\t    local allports=""\
\t    for portset in $(eval "echo \\$RULE_${k}_PORTSETS"); do\
\t\tlocal startport=$(echo $portset | cut -d"-" -f1)\
\t\tlocal endport=$(echo $portset | cut -d"-" -f2)\
\t\tfor x in $(seq $startport $endport); do\
\t\t\tif ! echo "$DONT_SNAT_TO" | tr " " "\\n" | grep -qw $x; then\
\t\t\t\tallports="$allports $portcount : $x , "\
\t\t\t\tportcount=`expr $portcount + 1`\
\t\t\tfi\
\t\tdone\
\t    done\
\t\tallports=${allports%??}\
\t    nft add table inet mape\
\t    nft add chain inet mape srcnat {type nat hook postrouting priority 0\\; policy accept\\; }\
\t\tlocal counter=0\
\t    for proto in icmp tcp udp; do\
\t\t\tnft add rule inet mape srcnat ip protocol $proto oifname "map-$cfg" counter packets 0 bytes 0 snat ip to $(eval "echo \\$RULE_${k}_IPV4ADDR") : numgen inc mod $portcount map { $allports }\
\t    done\
\t  fi' "$MAP_SH"
fi
}
[ "${connection_type}" = "ap" ] && [ -n "${ap_ip_address}" ] && {
    disable_wan
    {
        local SEC=network
        SET ${AP}=interface
        SET ${AP}.proto='static'
        SET ${AP}.device="${LAN}"
        SET ${AP}.ipaddr="${ap_ip_address}"
        SET ${AP}.netmask='255.255.255.0'
        SET ${AP}.gateway="${ap_gateway}"
        SET ${AP}.dns="${ap_gateway}"
        SET ${AP}.delegate='0'
        SET ${AP6}=interface
        SET ${AP6}.proto='dhcpv6'
        SET ${AP6}.device="@${AP}"
        SET ${AP6}.reqaddress='try'
        SET ${AP6}.reqprefix='no'
    }
    {
        local SEC=wireless
        for r in 0 1 2; do
            [ -n "$(uci -q get wireless.default_radio$r)" ] && SET default_radio$r.network="${AP}"
        done
    }
    [ -x /etc/init.d/odhcpd ] && /etc/init.d/odhcpd disable
    [ -x /etc/init.d/dnsmasq ] && /etc/init.d/dnsmasq disable
    uci -q delete firewall
    [ -x /etc/init.d/firewall ] && /etc/init.d/firewall disable
}
[ -n "${enable_ttyd}" ] && {
    local SEC=ttyd
    SET @ttyd[0].command='/bin/login -f root'
}
[ -n "${enable_irqbalance}" ] && {
    local SEC=irqbalance
    SET irqbalance=irqbalance
    SET irqbalance.enabled='1'
}
[ -n "${enable_samba4}" ] && {
    local SEC=samba4
    SET @samba[0]=samba
    SET @samba[0].workgroup='WORKGROUP'
    SET @samba[0].charset='UTF-8'
    SET @samba[0].description='Samba on OpenWRT'
    SET @samba[0].enable_extra_tuning='1'
    SET @samba[0].interface='lan'
    SET sambashare=sambashare
    SET sambashare.name="${NAS}"
    SET sambashare.path="${MNT}"
    SET sambashare.read_only='no'
    SET sambashare.force_root='1'
    SET sambashare.guest_ok='yes'
    SET sambashare.inherit_owner='yes'
    SET sambashare.create_mask='0777'
    SET sambashare.dir_mask='0777'
}
[ -n "${enable_adblock_fast}" ] && {
    local SEC=adblock-fast
    SET config.enabled='1'
    SET config.procd_trigger_wan6='1'
    [ -n "${enable_tofukko_filter}" ] && {
        local IDX=$(uci add "$SEC" file_url)
        SET "$IDX".name='Tofukko Filter'
        SET "$IDX".url='https://raw.githubusercontent.com/tofukko/filter/master/Adblock_Plus_list.txt'
        SET "$IDX".action='block'
        SET "$IDX".enabled='1'
    }
}
[ -n "${enable_usb_rndis}" ] && {
    printf '%s\n%s\n' "rndis_host" "cdc_ether" > /etc/modules.d/99-usb-net
    local SEC=network
    ADDLIST @device[0].ports='usb0'
}
[ -n "${enable_usb_gadget}" ] && [ -d /boot ] && {
    echo 'dtoverlay=dwc2' >> /boot/config.txt
    sed -i 's/\(root=[^ ]*\)/\1 modules-load=dwc2,g_ether/' /boot/cmdline.txt
    printf '%s\n%s\n' "dwc2" "g_ether" > /etc/modules.d/99-gadget
    local SEC=network
    ADDLIST @device[0].ports='usb0'
}
[ -n "${net_optimizer}" ] && [ "${net_optimizer}" != "disabled" ] && {
    C=/etc/sysctl.d/99-net-opt.conf
    P=$(grep -c ^processor /proc/cpuinfo)
    
    [ "${net_optimizer}" = "auto" ] && {
        if   [ $MEM -ge 2400 ]; then R=16777216 W=16777216 TR="4096 262144 16777216" TW=$TR CT=262144 NB=5000 SC=16384
        elif [ $MEM -ge 1200 ]; then R=8388608  W=8388608  TR="4096 131072 8388608"  TW=$TR CT=131072 NB=2500 SC=8192
        elif [ $MEM -ge  400 ]; then R=4194304  W=4194304  TR="4096 65536  4194304"  TW=$TR CT=65536  NB=1000 SC=4096
        fi
        [ $P -gt 4 ] && { NB=$((NB*2));   SC=$((SC*2)); }
        [ $P -gt 2 ] && [ $P -le 4 ] && { NB=$((NB*3/2)); SC=$((SC*3/2)); }
        CONG=cubic
    }
    
    [ "${net_optimizer}" = "manual" ] && {
        R=$(echo "${netopt_rmem}" | awk '{print $3}')
        W=$(echo "${netopt_wmem}" | awk '{print $3}')
        TR="${netopt_rmem}"
        TW="${netopt_wmem}"
        CT="${netopt_conntrack}"
        NB="${netopt_backlog}"
        SC="${netopt_somaxconn}"
        CONG="${netopt_congestion:-cubic}"
    }
    
    printf "net.core.rmem_max=%s\nnet.core.wmem_max=%s\nnet.ipv4.tcp_rmem=%s\nnet.ipv4.tcp_wmem=%s\nnet.ipv4.tcp_congestion_control=%s\nnet.ipv4.tcp_fastopen=3\nnet.netfilter.nf_conntrack_max=%s\nnet.core.netdev_max_backlog=%s\nnet.core.somaxconn=%s\n" \
    "$R" "$W" "$TR" "$TW" "$CONG" "$CT" "$NB" "$SC" > "$C"
    sysctl -p "$C"
}
[ -n "${enable_dnsmasq}" ] && [ "${enable_dnsmasq}" != "disabled" ] && {
    local SEC=dhcp
    
    [ "${enable_dnsmasq}" = "auto" ] && {
        if   [ "$MEM" -ge 800 ]; then CACHE_SIZE=10000
        elif [ "$MEM" -ge 400 ]; then CACHE_SIZE=5000
        elif [ "$MEM" -ge 200 ]; then CACHE_SIZE=1000
        fi
        NEG_CACHE=1
    }
    
    [ "${enable_dnsmasq}" = "manual" ] && {
        CACHE_SIZE="${dnsmasq_cache}"
        NEG_CACHE="${dnsmasq_negcache}"
    }
    
    SET @dnsmasq[0].cachesize="${CACHE_SIZE}"
    SET @dnsmasq[0].nonegcache="${NEG_CACHE}"
}
[ -n "${enable_sd_resize}" ] && {
    :
}
# BEGIN_CMDS
# END_CMDS
uci commit 2>/dev/null
[ -n "${backup_path}" ] && sysupgrade -q -k -b "${backup_path}"
echo "All done!"
exit 0
