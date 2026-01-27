#!/bin/sh
# BEGIN_VARS
# END_VARS
DSL="dsl"
DSL6="dsl6"
MAPE="mape"
MAPE6="mape6"
AP="ap"
AP6="ap6"
CONF="/etc/config"
INIT="/etc/init.d"
NAS="openwrt"
MNT="/mnt/sda"
GET() { uci -q get "$@"; }
SET() { uci -q set "${SEC}${SEC:+.}$*"; }
DEL() { uci -q delete "${SEC}${SEC:+.}$*"; }
RESET() { cp -f "${CONF}/${SEC}" "${CONF}/${SEC}.def"; }
ADDLIST() { uci -q add_list "${SEC}${SEC:+.}$*"; }
DELLIST() { uci -q del_list "${SEC}${SEC:+.}$*"; }
LAN="$(GET network.lan.device 2>&- || echo lan)"
WAN="$(GET network.wan.device 2>&- || echo wan)"
ZONE="$(uci show firewall | grep "=zone" | grep "network=.*wan" | cut -d. -f2 | cut -d= -f1 | head -n1)"
ZONE="${ZONE:-@zone[1]}"
MEM=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
FLASH=$(df -k / | awk 'NR==2 {print int($4/1024)}')
exec >/tmp/setup.log 2>&1
SEC=system
SET @system[0].description="$(date +%F\ %H:%M) siteU"
disable_wan() {
    SEC=network
    SET wan.disabled='1'
    SET wan.auto='0'
    SET wan6.disabled='1'
    SET wan6.auto='0'
}
dhcp_relay() {
    SEC=dhcp
    RESET
    SET "$1"=dhcp
    SET $1.interface="$1"
    SET $1.master='1'
    SET $1.ra='relay'
    SET $1.dhcpv6='relay'
    SET $1.ndp='relay'
    SET $1.ignore='1'
    SET lan.dhcpv4='server'
    SET lan.ra='relay'
    SET lan.dhcpv6='relay'
    SET lan.ndp='relay'
    SET lan.force='1'
}
firewall_wan() {
    SEC=firewall
    DELLIST ${ZONE}.network="wan"
    DELLIST ${ZONE}.network="wan6"
    DELLIST ${ZONE}.network="$1"
    DELLIST ${ZONE}.network="$2"
    ADDLIST ${ZONE}.network="$1"
    ADDLIST ${ZONE}.network="$2"
    SET ${ZONE}.masq='1'
    SET ${ZONE}.mtu_fix='1'
}
[ -n "${ntp}" ] && {
    SEC=system
    DEL ntp
    SET ntp=timeserver
    SET ntp.enabled='1'
    SET ntp.enable_server='1'
    SET ntp.interface='lan'
    DEL ntp.server
    for i in 0 1; do
        ADDLIST ntp.server="${i}.$(echo "${country}" | tr 'A-Z' 'a-z').${ntp}"
    done
    for i in 0 1; do
        ADDLIST ntp.server="${i}.${ntp}"
    done
}
[ -n "${diag}" ] && {
    SEC=luci
    SET diag=diag
    SET diag.ping="${diag}"
    SET diag.route="${diag}"
    SET diag.dns="${diag}"
}
[ -n "${device_name}" ] && { SEC=system; SET @system[0].hostname="${device_name}"; }
[ -n "${root_password}" ] && printf '%s\n%s\n' "${root_password}" "${root_password}" | passwd >&-
[ -n "${lan_ip_address}" ] && { SEC=network; SET lan.ipaddr="${lan_ip_address}"; }
[ -n "${lan_ipv6_address}" ] && { SEC=network; DEL lan.ip6assign; SET lan.ip6addr="${lan_ipv6_address}"; }
[ -n "${language}" ] && { SEC=system; SET @system[0].language="${language}"; }
[ -n "${timezone}" ] && { SEC=system; SET @system[0].timezone="${timezone}"; }
[ -n "${zonename}" ] && { SEC=system; SET @system[0].zonename="${zonename}"; }
[ -n "${ssh_interface}" ] && { SEC=dropbear; SET @dropbear[0].Interface="${ssh_interface}"; }
[ -n "${ssh_port}" ] && { SEC=dropbear; SET @dropbear[0].Port="${ssh_port}"; }
[ -n "${offload}" ] && {
    SEC=firewall
    SET @defaults[0].flow_offloading='1'
    [ "${offload}" = "hardware" ] && SET @defaults[0].flow_offloading_hw='1'
}
{ [ "${wifi_mode}" = "standard" ] || [ "${wifi_mode}" = "usteer" ] || [ "${wifi_mode}" = "mlo" ]; } && [ -n "${wlan_ssid}" ] && [ -n "${wlan_password}" ] && [ "${#wlan_password}" -ge 8 ] && {
    SEC=wireless
    RESET
    wireless_cfg=$(uci -q show wireless)
    link_id=0
    radio_count=0
    for radio in $(printf '%s\n' "${wireless_cfg}" | grep "wireless\.radio[0-9]*=" | cut -d. -f2 | cut -d= -f1); do
        SET "${radio}".disabled='0'
        SET ${radio}.country="${country}"
        [ "${wifi_mode}" = "mlo" ] && SET ${radio}.rnr='1'
        band=$(GET wireless.${radio}.band)
        S="30 15 5"
        set -- ${snr:-$S}
        case "${band}" in
            2g) [ "${wifi_mode}" = "mlo" ] && encryption='sae' || encryption='psk2'; band_snr=$1 ;;
            5g) [ "${wifi_mode}" = "mlo" ] && encryption='sae' || encryption='psk2'; band_snr=$2; [ "${wifi_mode}" = "mlo" ] && SET ${radio}.background_radar='1' ;;
            6g) encryption='sae'; band_snr=$3 ;;
            *) continue ;;
        esac
        suffix=${band:+-$band}
        { [ "${wifi_mode}" = "usteer" ] || [ "${wifi_mode}" = "mlo" ]; } && ssid="${wlan_ssid}" || ssid="${wlan_ssid}${suffix}"
        iface="default_${radio}"
        [ -n "$(GET wireless.${iface})" ] && {
            for o in rnr background_radar; do DEL ${radio}.$o; done
            for o in isolate ieee80211r mobility_domain ft_over_ds nasid ieee80211k ieee80211v usteer_min_snr ieee80211w mlo mld_id mlo_link_id; do DEL ${iface}.$o; done
            SET ${iface}.disabled='0'
            SET ${iface}.encryption="${encryption}"
            SET ${iface}.ssid="${ssid}"
            SET ${iface}.key="${wlan_password}"
            [ "${encryption}" = "sae" ] && SET ${iface}.ieee80211w='2' || SET ${iface}.ieee80211w='0'
            { [ "${wifi_mode}" = "usteer" ] || [ "${wifi_mode}" = "mlo" ]; } && {
                SET ${iface}.isolate='1'
                [ "${wifi_mode}" = "usteer" ] && {
                    SET ${iface}.ieee80211r='1'
                    SET ${iface}.mobility_domain="${mobility_domain:-4f57}"
                    SET ${iface}.ft_over_ds='1'
                    SET ${iface}.nasid="${wlan_ssid}-${radio_count}"
                    SET ${iface}.ieee80211k='1'
                    SET ${iface}.ieee80211v='1'
                }
                [ "${wifi_mode}" = "usteer" ] && SET ${iface}.usteer_min_snr="${band_snr}"
            }
            [ "${wifi_mode}" = "mlo" ] && {
                SET ${iface}.ieee80211w='2'
                SET ${iface}.mlo='1'
                SET ${iface}.mld_id="${mld_id:-4f575254}"
                SET ${iface}.mlo_link_id="${link_id}"
            }
        }
        link_id=$((link_id + 1))
        radio_count=$((radio_count + 1))
    done
    [ "${wifi_mode}" = "usteer" ] && {
        SEC=usteer
        SET @usteer[0].roam_scan_snr='-65'
        SET @usteer[0].signal_diff_threshold='10'
        SET @usteer[0].min_snr='20'
        SET @usteer[0].max_snr='80'
    }
}
[ "${connection_type}" = "pppoe" ] && [ -n "${pppoe_username}" ] && {
    SEC=network
    RESET
    SET wan.proto='pppoe'
    SET wan.username="${pppoe_username}"
    [ -n "${pppoe_password}" ] && SET wan.password="${pppoe_password}"
}
{ [ "${connection_type}" = "dslite" ] || { [ "${connection_type}" = "auto" ] && [ "${connection_auto}" = "dslite" ]; }; } && [ -n "${dslite_peeraddr}" ] && {
    SEC=network
    RESET
    disable_wan
    SET ${DSL6}=interface
    SET ${DSL6}.proto='dhcpv6'
    SET ${DSL6}.device="${WAN}"
    SET ${DSL6}.reqaddress='try'
    SET ${DSL6}.reqprefix='auto'
    SET ${DSL}=interface
    SET ${DSL}.proto='dslite'
    SET ${DSL}.peeraddr="${dslite_peeraddr}"
    SET ${DSL}.tunlink="${DSL6}"
    SET ${DSL}.mtu='1460'
    SET ${DSL}.encaplimit='ignore'
    dhcp_relay "${DSL6}"
    firewall_wan "${DSL}" "${DSL6}"
}
{ [ "${connection_type}" = "mape" ] || { [ "${connection_type}" = "auto" ] && [ "${connection_auto}" = "mape" ]; }; } && [ -n "${peeraddr}" ] && {
    SEC=network
    RESET
    disable_wan
    SET ${MAPE6}=interface
    SET ${MAPE6}.proto='dhcpv6'
    SET ${MAPE6}.device="${WAN}"
    SET ${MAPE6}.reqaddress='try'
    SET ${MAPE6}.reqprefix='auto'
    SET ${MAPE}=interface
    SET ${MAPE}.proto='map'
    SET ${MAPE}.maptype='map-e'
    SET ${MAPE}.peeraddr="${peeraddr}"
    SET ${MAPE}.ipaddr="${ipaddr}"
    SET ${MAPE}.ip4prefixlen="${ip4prefixlen}"
    SET ${MAPE}.ip6prefix="${ip6prefix}"
    SET ${MAPE}.ip6prefixlen="${ip6prefixlen}"
    SET ${MAPE}.ealen="${ealen}"
    SET ${MAPE}.psidlen="${psidlen}"
    SET ${MAPE}.offset="${offset}"
    SET ${MAPE}.mtu='1460'
    SET ${MAPE}.encaplimit='ignore'
    SET ${MAPE}.legacymap='1'
    SET ${MAPE}.tunlink="${MAPE6}"
    [ -n "${ip6prefix_gua}" ] && SET ${MAPE6}.ip6prefix="${ip6prefix_gua}"
    dhcp_relay "${MAPE6}"
    firewall_wan "${MAPE}" "${MAPE6}"
    MAPSH="/lib/netifd/proto/map.sh"
    HASH="7f0682eeaf2dd7e048ff1ad1dbcc5b913ceb8de4"
    cp "$MAPSH" "$MAPSH".old
    [ "$(sha1sum "$MAPSH" | awk '{print $1}')" = "$HASH" ] && {
        sed -i '1a # github.com/fakemanhk/openwrt-jp-ipoe\nDONT_SNAT_TO="0"' "$MAPSH"
        sed -i 's/mtu:-1280/mtu:-1460/g' "$MAPSH"
        sed -i '137,158d' "$MAPSH"
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
\t\t\tnft add rule inet mape srcnat ip protocol $proto oifname "map-$cfg" counter snat ip to $(eval "echo \\$RULE_${k}_IPV4ADDR") : numgen inc mod $portcount map { $allports } comment "mape-snat-$proto"\
\t    done\
\t  fi' "$MAPSH"
    }
}
[ "${connection_type}" = "ap" ] && [ -n "${ap_ipaddr}" ] && [ -n "${gateway}" ] && {
    disable_wan
    {
        SEC=network
        RESET
        SET ${AP}=interface
        SET ${AP}.proto='static'
        SET ${AP}.device="${LAN}"
        SET ${AP}.ipaddr="${ap_ipaddr}"
        SET ${AP}.gateway="${gateway}"
        SET ${AP}.dns="${gateway}"
        SET ${AP}.delegate='0'
        SET ${AP6}=interface
        SET ${AP6}.proto='dhcpv6'
        SET ${AP6}.device="@${AP}"
        SET ${AP6}.reqaddress='try'
        SET ${AP6}.reqprefix='no'
    }
    {
        SEC=wireless
        for r in 0 1 2; do
            [ -n "$(GET wireless.default_radio$r)" ] && SET default_radio$r.network="${AP}"
        done
    }
    ${INIT}/odhcpd disable 2>&-
    ${INIT}/dnsmasq disable 2>&-
    uci -q delete firewall
    ${INIT}/firewall disable 2>&-
}
[ -n "${ttyd}" ] && {
    SEC=ttyd
    SET @ttyd[0].command='/bin/login -f root'
}
[ -n "${irqbalance}" ] && {
    SEC=irqbalance
    SET irqbalance=irqbalance
    SET irqbalance.enabled='1'
}
[ -n "${samba4}" ] && {
    SEC=samba4
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
[ -n "${usb_rndis}" ] && {
    printf '%s\n%s\n' "rndis_host" "cdc_ether" > /etc/modules.d/99-usb-net
    SEC=network
    ADDLIST @device[0].ports='usb0'
}
[ -n "${usb_gadget}" ] && {
    echo 'dtoverlay=dwc2' >> /boot/config.txt
    sed -i 's/\(root=[^ ]*\)/\1 modules-load=dwc2,g_ether/' /boot/cmdline.txt
    printf '%s\n%s\n' "dwc2" "g_ether" > /etc/modules.d/99-gadget
    SEC=network
    ADDLIST @device[0].ports='usb0'
}
[ -n "${net_optimizer}" ] && [ "${net_optimizer}" != "disabled" ] && [ $MEM -ge 400 ] && {
    C=/etc/sysctl.d/99-net-opt.conf
    P=$(grep -c ^processor /proc/cpuinfo)
    [ "${net_optimizer}" = "auto" ] && {
        if [ $MEM -ge 2400 ]; then R=16777216 W=16777216 TR="4096 262144 16777216" TW=$TR CT=262144 NB=5000 SC=16384
        elif [ $MEM -ge 1200 ]; then R=8388608 W=8388608 TR="4096 131072 8388608" TW=$TR CT=131072 NB=2500 SC=8192
        elif [ $MEM -ge 400 ]; then R=4194304 W=4194304 TR="4096 65536 4194304" TW=$TR CT=65536 NB=1000 SC=4096
        fi
        [ $P -gt 4 ] && { NB=$((NB*2)); SC=$((SC*2)); }
        [ $P -gt 2 ] && [ $P -le 4 ] && { NB=$((NB*3/2)); SC=$((SC*3/2)); }
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
    printf "net.core.rmem_max=%s\nnet.core.wmem_max=%s\nnet.ipv4.tcp_rmem=%s\nnet.ipv4.tcp_wmem=%s\nnet.ipv4.tcp_fastopen=3\nnet.netfilter.nf_conntrack_max=%s\nnet.core.netdev_max_backlog=%s\nnet.core.somaxconn=%s\n" \
    "$R" "$W" "$TR" "$TW" "$CT" "$NB" "$SC" > "$C"
    sysctl -p "$C"
}
[ -n "${dnsmasq}" ] && [ "${dnsmasq}" != "disabled" ] && {
    SEC=dhcp
    [ "${dnsmasq}" = "auto" ] && [ "$MEM" -ge 200 ] && {
        if [ "$MEM" -ge 800 ]; then CACHE_SIZE=10000
        elif [ "$MEM" -ge 400 ]; then CACHE_SIZE=5000
        elif [ "$MEM" -ge 200 ]; then CACHE_SIZE=1000
        fi
        NEG_CACHE=1
    }
    [ "${dnsmasq}" = "manual" ] && {
        CACHE_SIZE="${dnsmasq_cache}"
        NEG_CACHE="${dnsmasq_negcache}"
    }
    SET @dnsmasq[0].cachesize="${CACHE_SIZE}"
    SET @dnsmasq[0].nonegcache="${NEG_CACHE}"
}
[ "${dns_adblock}" = "adblock_fast" ] && {
    SEC=adblock-fast
    SET config.enabled='1'
    SET config.procd_trigger_wan6='1'
    [ -n "${filter_url}" ] && {
        local IDX
        IDX=$(uci add "$SEC" file_url)
        SET "$IDX".url="${filter_url}"
        SET "$IDX".action='block'
        SET "$IDX".enabled='1'
    }
}
[ "${dns_adblock}" = "adguardhome" ] && {
    if [ "$MEM" -ge "${agh_min_memory}" ] && [ "$FLASH" -ge "${agh_min_flash}" ]; then
        [ -z "${apache_keep}" ] && {
            ${INIT}/apache stop 2>&- || true
            htpasswd_bin="/usr/bin/htpasswd"
            htpasswd_libs="/usr/lib/libapr*.so* /usr/lib/libexpat.so* /usr/lib/libuuid.so*"
            tmp_libs="/tmp/libapr*.so* /tmp/libexpat.so* /tmp/libuuid.so*"
            [ -f "$htpasswd_bin" ] && cp "$htpasswd_bin" /tmp/htpasswd
            for lib in $htpasswd_libs; do
                [ -f "$lib" ] && cp "$lib" /tmp/
            done
            apk del apache 2>&-
            opkg remove apache 2>&-
            mv /tmp/htpasswd "$htpasswd_bin"
            for lib in $tmp_libs; do
                [ -f "$lib" ] && mv "$lib" /usr/lib/
            done
        }
    fi
}
[ "${dns_adblock}" = "adguardhome" ] && {
    lan_ip_address=$(GET network.lan.ipaddr | cut -d/ -f1)
    if [ "$MEM" -ge "${agh_min_memory}" ] && [ "$FLASH" -ge "${agh_min_flash}" ]; then
        mkdir -p "${agh_dir}"
        cfg_dhcp="${CONF}/dhcp"
        cfg_fw="${CONF}/firewall"
        cp "$cfg_dhcp" "$cfg_dhcp.adguard.bak"
        cp "$cfg_fw" "$cfg_fw.adguard.bak"
        agh_hash=$(htpasswd -B -n -b "" "${agh_pass}" 2>&- | cut -d: -f2)
        [ -n "$agh_hash" ] && {
        cat > "$agh_yaml" << 'AGHEOF'
http:
  address: 0.0.0.0:{{WEB_PORT}}
users:
  - name: {{AGH_USER}}
    password: {{AGH_HASH}}
dns:
  port: {{DNS_PORT}}
  refuse_any: true
  upstream_dns:
    - '[/lan/]127.0.0.1:{{DNS_BACKUP_PORT}}'
    - '[/{{NTP_DOMAIN}}/]2606:4700:4700::1111'
    - '[/{{NTP_DOMAIN}}/]1.1.1.1'
    - quic://unfiltered.adguard-dns.com
    - tls://unfiltered.adguard-dns.com
    - https://unfiltered.adguard-dns.com/dns-query
  bootstrap_dns:
    - 2606:4700:4700::1111
    - 2001:4860:4860::8888
    - 1.1.1.1
    - 8.8.8.8
  fallback_dns:
    - https://dns.cloudflare.com/dns-query
    - https://dns.google/dns-query
  upstream_mode: fastest_addr
  local_ptr_upstreams:
    - 127.0.0.1:{{DNS_BACKUP_PORT}}
filters:
  - enabled: true
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_1.txt
    name: AdGuard DNS filter
  - enabled: false
    url: {{FILTER_URL}}
    name: AdGuard language filter
log:
  file: ""
schema_version: 29
AGHEOF
       sed -i "s|{{AGH_USER}}|${agh_user}|g;s|{{AGH_HASH}}|${agh_hash}|g;s|{{WEB_PORT}}|${agh_web_port}|g;s|{{DNS_PORT}}|${agh_dns_port}|g;s|{{DNS_BACKUP_PORT}}|${agh_dns_backup_port}|g;s|{{FILTER_URL}}|${filter_url}|g" "$agh_yaml"
        sed -i "s|{{NTP_DOMAIN}}|$(GET system.ntp.server | head -n1 | awk -F. '{if (NF==4) print $0; else if (NF>=3) print $(NF-2)"."$(NF-1)"."$NF; else if (NF==2) print $(NF-1)"."$NF; else print $0}' 2>&-)|g" "$agh_yaml"
        chmod 600 "$agh_yaml"
        SEC=dhcp
        SET @dnsmasq[0].noresolv='1'
        SET @dnsmasq[0].cachesize='0'
        SET @dnsmasq[0].rebind_protection='0'
        SET @dnsmasq[0].port="${agh_dns_backup_port}"
        SET @dnsmasq[0].domain='lan'
        SET @dnsmasq[0].local='/lan/'
        SET @dnsmasq[0].expandhosts='1'
        DEL @dnsmasq[0].server
        ADDLIST @dnsmasq[0].server="127.0.0.1#${agh_dns_port}"
        ADDLIST @dnsmasq[0].server="::1#${agh_dns_port}"
        DEL lan.dhcp_option
        DEL lan.dhcp_option6
        ADDLIST lan.dhcp_option="6,${lan_ip_address}"
        SEC=firewall
        agh_rule="adguardhome_dns_${agh_dns_port}"
        DEL "${agh_rule}" 2>&-
        SET ${agh_rule}=redirect
        SET ${agh_rule}.name="AdGuard Home DNS Redirect"
        SET ${agh_rule}.family='any'
        SET ${agh_rule}.src='lan'
        SET ${agh_rule}.dest='lan'
        ADDLIST ${agh_rule}.proto='tcp'
        ADDLIST ${agh_rule}.proto='udp'
        SET ${agh_rule}.src_dport="${agh_dns_port}"
        SET ${agh_rule}.dest_port="${agh_dns_port}"
        SET ${agh_rule}.target='DNAT'
        }
    else
        ${INIT}/adguardhome stop 2>&-
        ${INIT}/adguardhome disable 2>&-
        echo "AdGuardHome: ${INIT}/adguardhome start then ${lan_ip_address}:3000"
    fi
}
# BEGIN_CMDS
# END_CMDS
uci commit 2>&-
[ -n "${backup_path}" ] && sysupgrade -q -k -b "${backup_path}"
echo "All done!"
exit 0
