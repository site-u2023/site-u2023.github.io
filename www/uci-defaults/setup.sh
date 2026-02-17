#!/bin/sh
# BEGIN_VARS
# END_VARS
enable_log="1"
DSL="dsl"
DSL6="dsl6"
MAPE="mape"
MAPE6="mape6"
AP="ap"
AP6="ap6"
CONF="/etc/config"
INIT="/etc/init.d"
GET() { uci -q get "$@"; }
SET() { uci -q set "${SEC}${SEC:+.}$*"; }
DEL() { uci -q delete "${SEC}${SEC:+.}$*"; }
RESET() {
    [ -f "/etc/uci-defaults/99-asu-defaults" ] && [ ! -f "${CONF}/${SEC}.def" ] && cp -f "${CONF}/${SEC}" "${CONF}/${SEC}.def"
    [ -f "/rom${CONF}/${SEC}" ] && cp -f "/rom${CONF}/${SEC}" "${CONF}/${SEC}" && return
    [ -f "${CONF}/${SEC}.def" ] && cp -f "${CONF}/${SEC}.def" "${CONF}/${SEC}" && return
    [ "$SEC" = "network" ] && { DEL ${DSL}; DEL ${DSL6}; DEL ${MAPE}; DEL ${MAPE6}; DEL ${AP}; DEL ${AP6}; }
    [ "$SEC" = "network" ] && { SEC=firewall; DEL block_quic_ipoe; SEC=network; }
}
ADDLIST() { uci -q add_list "${SEC}${SEC:+.}$*"; }
DELLIST() { uci -q del_list "${SEC}${SEC:+.}$*"; }
LAN="$(GET network.lan.device)"
WAN="$(GET network.wan.device)"
ZONE="$(uci show firewall | grep "=zone" | grep "network=.*wan" | cut -d. -f2 | cut -d= -f1 | head -n1)"
ZONE="${ZONE:-@zone[1]}"
MEM=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
FLASH=$(df -k / | awk 'NR==2 {print int($4/1024)}')
exec >/etc/uci-defaults/setup.log 2>&1
SEC=system
SET @system[0].description="$(date '+%Y-%m-%d %H:%M')"
[ -n "${enable_log}" ] && {
    SEC=system
    SET @system[0].conloglevel='1'
    SET @system[0].cronloglevel='9'
    SEC=dhcp
    SET @dnsmasq[0].quietdhcp='1'
    SET odhcpd.loglevel='0'
}
[ -n "${language}" ] && { SEC=system; SET @system[0].language="${language}"; }
[ -n "${timezone}" ] && { SEC=system; SET @system[0].timezone="${timezone}"; }
[ -n "${zonename}" ] && { SEC=system; SET @system[0].zonename="${zonename}"; }
[ -n "${device_name}" ] && { SEC=system; SET @system[0].hostname="${device_name}"; }
[ -n "${root_password}" ] && printf '%s\n%s\n' "${root_password}" "${root_password}" | passwd 2>&-
[ -n "${lan_ip_address}" ] && { SEC=network; SET lan.ipaddr="${lan_ip_address}"; }
[ -n "${lan_ipv6_address}" ] && { SEC=network; DEL lan.ip6assign; SET lan.ip6addr="${lan_ipv6_address}"; }
[ -n "${ssh_interface}" ] && { SEC=dropbear; SET @dropbear[0].Interface="${ssh_interface}"; }
[ -n "${ssh_port}" ] && { SEC=dropbear; SET @dropbear[0].Port="${ssh_port}"; }
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
[ -n "${offload}" ] && {
    SEC=firewall
    SET @defaults[0].flow_offloading='1'
    [ "${offload}" = "hardware" ] && SET @defaults[0].flow_offloading_hw='1'
}
{ [ "${wifi_mode}" = "standard" ] || [ "${wifi_mode}" = "usteer" ] || [ "${wifi_mode}" = "mlo" ]; } && [ -n "${wlan_ssid}" ] && [ -n "${wlan_password}" ] && [ "${#wlan_password}" -ge 8 ] && {
    SEC=wireless
    RESET
    S="30 15 5"; set -- ${snr:-$S}; rc=0; radios=""
    for r in $(uci -q show wireless | grep -E "wireless\.(radio|wifi)[0-9]*=" | cut -d. -f2 | cut -d= -f1); do
        SET ${r}.disabled='0'
        SET ${r}.country="${country}"
        band=$(GET wireless.${r}.band 2>&-)
        case "$band" in
            1) band='2g' ;;
            2) band='5g' ;;
            3) band='6g' ;;
        esac
        [ -z "$band" ] && {
            case "$(GET wireless.${r}.hwmode)" in
                11axg|11ng|11bg|11g) band='2g' ;;
                11bea|11na|11ac|11a) band='5g' ;;
            esac
        }
        [ "${wifi_mode}" = "mlo" ] && {
            SET ${r}.rnr='1'
            [ "$band" = "5g" ] && SET ${r}.background_radar='1'
            radios="${radios} ${r}"
            iface="default_${r}"
            [ -n "$(GET wireless.${iface})" ] && DEL ${iface}
        } || {
            case "$band" in
                2g) enc='psk2'; snr=$1 ;;
                5g) enc='psk2'; snr=$2 ;;
                6g) enc='sae'; snr=$3 ;;
                *) continue ;;
            esac
            [ "${wifi_mode}" = "usteer" ] && ssid="${wlan_ssid}" || ssid="${wlan_ssid}-${band}"
            iface="default_${r}"
            [ -n "$(GET wireless.${iface})" ] && {
                for o in rnr background_radar; do DEL ${r}.$o; done
                for o in isolate ieee80211r mobility_domain ft_over_ds nasid ieee80211k ieee80211v usteer_min_snr ieee80211w; do DEL ${iface}.$o; done
                SET ${iface}.disabled='0'
                SET ${iface}.ssid="$ssid"
                SET ${iface}.encryption="$enc"
                SET ${iface}.key="${wlan_password}"
                [ "$enc" = "sae" ] && SET ${iface}.ieee80211w='2' || SET ${iface}.ieee80211w='0'
                [ "${wifi_mode}" = "usteer" ] && {
                    SET ${iface}.isolate='1'
                    SET ${iface}.ieee80211r='1'
                    SET ${iface}.mobility_domain="${mobility_domain:-4f57}"
                    SET ${iface}.ft_over_ds='1'
                    SET ${iface}.nasid="${wlan_ssid}-${rc}"
                    SET ${iface}.ieee80211k='1'
                    SET ${iface}.ieee80211v='1'
                    SET ${iface}.usteer_min_snr="$snr"
                }
            }
            rc=$((rc+1))
        }
    done
    [ "${wifi_mode}" = "mlo" ] && {
        SET mlo=wifi-iface
        SET mlo.mode='ap'
        SET mlo.ssid="${wlan_ssid}"
        SET mlo.encryption='sae'
        SET mlo.key="${wlan_password}"
        SET mlo.ieee80211w='2'
        SET mlo.mlo='1'
        SET mlo.network='lan'
        for r in $radios; do ADDLIST mlo.device="$r"; done
    }
    [ "${wifi_mode}" = "usteer" ] && {
        SEC=usteer
        SET @usteer[0].roam_scan_snr='-65'
        SET @usteer[0].signal_diff_threshold='8'
    }
}
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
dscp_zero() {
    mkdir -p /usr/share/nftables.d/chain-post/mangle_postrouting
    cat > /usr/share/nftables.d/chain-post/mangle_postrouting/90-dscp-zero.nft << 'EOF'
ip dscp set cs0
ip6 dscp set cs0
EOF
}
[ "${connection_type}" = "pppoe" ] && [ -n "${pppoe_username}" ] && {
    SEC=network
    RESET
    SET wan.proto='pppoe'
    SET wan.username="${pppoe_username}"
    [ -n "${pppoe_password}" ] && SET wan.password="${pppoe_password}"
    dscp_zero
}
{ [ "${connection_type}" = "dslite" ] || { [ "${connection_type}" = "auto" ] && [ "${connection_auto}" = "dslite" ]; }; } && [ -n "${dslite_peeraddr}" ] && {
    SEC=network
    RESET
    disable_wan
    SET ${DSL6}=interface
    SET ${DSL6}.proto='dhcpv6'
    SET ${DSL6}.ifname="${WAN}"
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
    dscp_zero
}
{ [ "${connection_type}" = "mape" ] || { [ "${connection_type}" = "auto" ] && [ "${connection_auto}" = "mape" ]; }; } && [ -n "${peeraddr}" ] && {
    SEC=network
    RESET
    disable_wan
    SET ${MAPE6}=interface
    SET ${MAPE6}.proto='dhcpv6'
    SET ${MAPE6}.ifname="${WAN}"
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
    SET ${MAPE}.tunlink="${MAPE6}"
    [ -n "${ip6prefix_static}" ] && SET ${MAPE6}.ip6prefix="${ip6prefix_static}"
    dhcp_relay "${MAPE6}"
    firewall_wan "${MAPE}" "${MAPE6}"
    SET block_quic_ipoe=rule
    SET block_quic_ipoe.name='Block-QUIC-IPoE'
    SET block_quic_ipoe.proto='udp'
    SET block_quic_ipoe.dest_port='443'
    SET block_quic_ipoe.src='lan'
    SET block_quic_ipoe.dest='wan'
    SET block_quic_ipoe.target='DROP'
    SET block_quic_ipoe.family='ipv4'
    SET block_quic_ipoe.enabled='1'
    [ "$(sha1sum /lib/netifd/proto/map.sh | awk '{print $1}')" = "7f0682eeaf2dd7e048ff1ad1dbcc5b913ceb8de4" ] && {
        uci set network.mape.legacymap='1'
        dscp_zero
        cp "$MAPSH" "$MAPSH".old
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
\t\t\t\tportcount=`expr $portcount + 1\`\
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
        sed -i '/^}$/,$!{/proto_map_setup/,/^}/{/^}/i\
\t# conntrack tuning for MAP-E port conservation\
\tsysctl -w net.netfilter.nf_conntrack_tcp_timeout_established=3600 >/dev/null 2>\&1\
\tsysctl -w net.netfilter.nf_conntrack_tcp_timeout_time_wait=120 >/dev/null 2>\&1\
\tsysctl -w net.netfilter.nf_conntrack_udp_timeout=180 >/dev/null 2>\&1\
\tsysctl -w net.netfilter.nf_conntrack_udp_timeout_stream=180 >/dev/null 2>\&1\
\tsysctl -w net.netfilter.nf_conntrack_icmp_timeout=60 >/dev/null 2>\&1\
\tsysctl -w net.netfilter.nf_conntrack_generic_timeout=60 >/dev/null 2>\&1
}}' "$MAPSH"
    }
}
[ "${connection_type}" = "ap" ] && [ -n "${ap_ipaddr}" ] && [ -n "${gateway}" ] && {
    disable_wan
    {
        SEC=network
        RESET
        SET ${AP}=interface
        SET ${AP}.proto='static'
        SET ${AP}.ifname="${LAN}"
        SET ${AP}.ipaddr="${ap_ipaddr}"
        SET ${AP}.gateway="${gateway}"
        SET ${AP}.dns="${gateway}"
        SET ${AP}.delegate='0'
        SET ${AP6}=interface
        SET ${AP6}.proto='dhcpv6'
        SET ${AP6}.ifname="@${AP}"
        SET ${AP6}.reqaddress='try'
        SET ${AP6}.reqprefix='no'
    }
    SEC=wireless
    for r in 0 1 2; do
        GET wireless.default_radio$r >&- && SET default_radio$r.network="${AP}"
    done
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
[ -n "${prometheus}" ] && {
    SEC=prometheus-node-exporter-lua
    SET @prometheus-node-exporter-lua[0]=prometheus-node-exporter-lua
    SET @prometheus-node-exporter-lua[0].listen_address='0.0.0.0'
    SET @prometheus-node-exporter-lua[0].listen_port='9100'
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
[ -n "${net_optimizer}" ] && [ "${net_optimizer}" != "disabled" ] && [ "$MEM" -ge 400 ] && {
    C=/etc/sysctl.d/99-net-opt.conf
    P=$(grep -c ^processor /proc/cpuinfo)
    if [ "$MEM" -ge 2400 ]; then V6="512 1024 2048"
    elif [ "$MEM" -ge 1200 ]; then V6="256 512 1024"
    else V6="128 256 512"
    fi
    [ "${net_optimizer}" = "auto" ] && {
        if [ "$MEM" -ge 2400 ]; then R=16777216 W=16777216 TR="4096 262144 16777216" TW=$TR CT=262144 NB=5000 SC=16384
        elif [ "$MEM" -ge 1200 ]; then R=8388608 W=8388608 TR="4096 131072 8388608" TW=$TR CT=131072 NB=2500 SC=8192
        elif [ "$MEM" -ge 400 ]; then R=4194304 W=4194304 TR="4096 65536 4194304" TW=$TR CT=65536 NB=1000 SC=4096
        fi
        [ "$P" -gt 4 ] && { NB=$((NB*2)); SC=$((SC*2)); }
        [ "$P" -gt 2 ] && [ "$P" -le 4 ] && { NB=$((NB*3/2)); SC=$((SC*3/2)); }
    }
    [ "${net_optimizer}" = "manual" ] && {
        R=$(echo "${netopt_rmem}" | awk '{print $3}')
        W=$(echo "${netopt_wmem}" | awk '{print $3}')
        TR="${netopt_rmem}"
        TW="${netopt_wmem}"
        CT="${netopt_conntrack}"
        NB="${netopt_backlog}"
        SC="${netopt_somaxconn}"
    }
    printf "net.core.rmem_max=%s\nnet.core.wmem_max=%s\nnet.ipv4.tcp_rmem=%s\nnet.ipv4.tcp_wmem=%s\nnet.ipv4.tcp_fastopen=3\nnet.netfilter.nf_conntrack_max=%s\nnet.core.netdev_max_backlog=%s\nnet.core.somaxconn=%s\nnet.ipv6.neigh.default.gc_thresh1=%s\nnet.ipv6.neigh.default.gc_thresh2=%s\nnet.ipv6.neigh.default.gc_thresh3=%s\n" \
        "$R" "$W" "$TR" "$TW" "$CT" "$NB" "$SC" $V6 > "$C"
    sysctl -p "$C"
}
[ -n "${dnsmasq}" ] && [ "${dnsmasq}" != "disabled" ] && {
    SEC=dhcp
    if [ "${dnsmasq}" = "auto" ] && [ "$MEM" -ge 200 ]; then
        [ "$MEM" -ge 800 ] && CACHE_SIZE=10000 || \
        [ "$MEM" -ge 400 ] && CACHE_SIZE=5000 || CACHE_SIZE=1000
        NEG_CACHE=1
    else
        CACHE_SIZE="${dnsmasq_cache}"
        NEG_CACHE="${dnsmasq_negcache}"
    fi
    SET @dnsmasq[0].cachesize="${CACHE_SIZE}"
    SET @dnsmasq[0].nonegcache="${NEG_CACHE}"
}
[ "${dns_adblock}" = "adblock_fast" ] && {
    SEC=adblock-fast
    SET config.enabled='1'
    SET config.procd_trigger_wan6='1'
    [ -n "${filter_url}" ] && {
        IDX=$(uci add "$SEC" file_url)
        SET "$IDX".url="${filter_url}"
        SET "$IDX".action='block'
        SET "$IDX".enabled='1'
    }
}
[ "${dns_adblock}" = "adguardhome" ] && {
    [ -z "${apache_keep}" ] && {
        ${INIT}/apache stop 2>&- || true
        LIBS="libapr*.so* libexpat.so* libuuid.so*"
        [ -f /usr/bin/htpasswd ] && cp /usr/bin/htpasswd /tmp/
        for L in $LIBS; do cp /usr/lib/$L /tmp/ 2>&-; done
        apk del apache 2>&- || opkg remove apache 2>&-
        mv /tmp/htpasswd /usr/bin/ 2>&-
        for L in $LIBS; do mv /tmp/$L /usr/lib/ 2>&-; done
    }
}
[ "${dns_adblock}" = "adguardhome" ] && {
    lan_ip_address=$(GET network.lan.ipaddr | cut -d/ -f1)
    cfg_dhcp="${CONF}/dhcp"
    cfg_fw="${CONF}/firewall"
    cp "$cfg_dhcp" "$cfg_dhcp.adguard.bak"
    cp "$cfg_fw" "$cfg_fw.adguard.bak"
    if [ "$MEM" -ge "${agh_min_memory}" ] && [ "$FLASH" -ge "${agh_min_flash}" ]; then
        mkdir -p "${agh_dir}"
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
