#!/bin/sh
# BEGIN_VARS
# END_VARS
enable_notes="1"
enable_ntp="1"
enable_log="1"
enable_diag="1"
DATE="$(date '+%Y-%m-%d %H:%M')"
LAN="$(uci -q get network.lan.device || echo lan)"
WAN="$(uci -q get network.wan.device || echo wan)"
DIAG="one.one.one.one"
NTP_DOMAIN=".pool.ntp.org"
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
exec >/tmp/setup.log 2>&1
disable_wan() {
    uci -q batch <<'DISABLE_WAN_EOF'
set network.wan.disabled='1'
set network.wan.auto='0'
set network.wan6.disabled='1'
set network.wan6.auto='0'
DISABLE_WAN_EOF
}
dhcp_relay() {
    uci -q batch <<DHCP_RELAY_EOF
set dhcp.$1=dhcp
set dhcp.$1.interface="$1"
set dhcp.$1.master='1'
set dhcp.$1.ra='relay'
set dhcp.$1.dhcpv6='relay'
set dhcp.$1.ndp='relay'
set dhcp.$1.ignore='1'
set dhcp.lan.ra='relay'
set dhcp.lan.dhcpv6='relay'
set dhcp.lan.ndp='relay'
set dhcp.lan.force='1'
DHCP_RELAY_EOF
}
firewall_wan() {
    uci -q batch <<FIREWALL_WAN_EOF
del_list firewall.@zone[1].network="wan"
del_list firewall.@zone[1].network="wan6"
add_list firewall.@zone[1].network="$1"
add_list firewall.@zone[1].network="$2"
set firewall.@zone[1].masq='1'
set firewall.@zone[1].mtu_fix='1'
FIREWALL_WAN_EOF
}
[ -n "${enable_notes}" ] && uci -q batch <<NOTES_EOF
set system.@system[0].description="${DATE}"
set system.@system[0].notes="site-u.pages.dev"
NOTES_EOF
[ -n "${enable_ntp}" ] && uci -q batch <<'NTP_EOF'
set system.ntp=timeserver
set system.ntp.enabled='1'
set system.ntp.enable_server='1'
set system.ntp.interface='lan'
delete system.ntp.server
NTP_EOF
COUNTRY_LC=$(printf '%s' "$COUNTRY" | tr 'A-Z' 'a-z')
for i in 0 1 2 3; do
    s="${i:0:2}.${COUNTRY_LC}${NTP_DOMAIN}"
    [ $i -gt 1 ] && s="${i}${NTP_DOMAIN}"
    uci add_list system.ntp.server="$s"
done
[ -n "${enable_log}" ] && uci -q batch <<'LOG_EOF'
set system.@system[0].log_size='32'
set system.@system[0].conloglevel='1'
set system.@system[0].cronloglevel='9'
LOG_EOF
[ -n "${enable_diag}" ] && uci -q batch <<DIAG_EOF
set luci.diag=diag
set luci.diag.ping='${DIAG}'
set luci.diag.route='${DIAG}'
set luci.diag.dns='${DIAG}'
DIAG_EOF
[ -n "${device_name}" ] && uci -q set system.@system[0].hostname="${device_name}"
[ -n "${root_password}" ] && printf '%s\n%s\n' "${root_password}" "${root_password}" | passwd >/dev/null
[ -n "${lan_ip_address}" ] && uci -q set network.lan.ipaddr="${lan_ip_address}"
[ -n "${lan_ipv6_address}" ] && uci -q set network.lan.ip6addr="${lan_ipv6_address}"
[ -n "${language}" ] && uci -q set system.@system[0].language="${language}"
[ -n "${timezone}" ] && uci -q set system.@system[0].timezone="${timezone}"
[ -n "${zonename}" ] && uci -q set system.@system[0].zonename="${zonename}"
[ -n "${ssh_interface}" ] && uci -q set dropbear.@dropbear[0].Interface="${ssh_interface}"
[ -n "${ssh_port}" ] && uci -q set dropbear.@dropbear[0].Port="${ssh_port}"
[ -n "${flow_offloading_type}" ] && {
    uci -q set firewall.@defaults[0].flow_offloading='1'
    [ "${flow_offloading_type}" = "hardware" ] && uci -q set firewall.@defaults[0].flow_offloading_hw='1'
}
[ -n "${wlan_ssid}" ] && [ -n "${wlan_password}" ] && [ "${#wlan_password}" -ge 8 ] && {
    wireless_cfg=$(uci -q show wireless)
    for radio in $(printf '%s\n' "${wireless_cfg}" | grep "wireless\.radio[0-9]*=" | cut -d. -f2 | cut -d= -f1); do
        uci -q batch <<RADIO_EOF
set wireless.${radio}.disabled='0'
set wireless.${radio}.country="${COUNTRY}"
RADIO_EOF
        band=$(uci -q get wireless.${radio}.band) 
        set -- 30 15 5
        case "${band}" in
        2g) encryption='psk-mixed';nasid_suffix='-2g';band_snr=$1;;
        5g) encryption='sae-mixed';nasid_suffix='-5g';band_snr=$2;;
        6g) encryption='sae';nasid_suffix='-6g';band_snr=$3;;
        *) encryption='psk-mixed';nasid_suffix='';band_snr=20;;
        esac
        suffix=${band:+-$band}
        if [ -n "${enable_usteer}" ]; then
            ssid="${wlan_ssid}"
        else
            ssid="${wlan_ssid}${suffix}"
            n=2
            while printf '%s\n' "${wireless_cfg}" | grep -q "ssid='${ssid}'"; do
                ssid="${wlan_ssid}${suffix}${n}"
                n=$((n+1))
            done
        fi
        iface="default_${radio}"
        [ -n "$(uci -q get wireless.${iface})" ] && {
            uci -q batch <<WLAN_EOF
set wireless.${iface}.disabled='0'
set wireless.${iface}.encryption="${encryption}"
set wireless.${iface}.ssid="${ssid}"
set wireless.${iface}.key="${wlan_password}"
WLAN_EOF
            if [ -n "${enable_usteer}" ]; then
                uci -q batch <<USTEER_EOF
set wireless.${iface}.isolate='1'
set wireless.${iface}.ocv='1'
set wireless.${iface}.ieee80211r='1'
set wireless.${iface}.mobility_domain="${mobility_domain:-4f57}"
set wireless.${iface}.ft_over_ds='1'
set wireless.${iface}.nasid="${wlan_ssid}${nasid_suffix}"
set wireless.${iface}.usteer_min_snr="${band_snr}"
set wireless.${iface}.ieee80211k='1'
set wireless.${iface}.ieee80211v='1'
USTEER_EOF
            fi
        }
    done
    if [ -n "${enable_usteer}" ]; then
        uci -q batch <<'USTEERCFG_EOF'
set usteer.@usteer[0].band_steering='1'
set usteer.@usteer[0].load_balancing='1'
set usteer.@usteer[0].sta_block_timeout='300'
set usteer.@usteer[0].min_snr='20'
set usteer.@usteer[0].max_snr='80'
set usteer.@usteer[0].signal_diff_threshold='10'
USTEERCFG_EOF
    fi
}
[ -n "${pppoe_username}" ] && [ -n "${pppoe_password}" ] && uci -q batch <<PPPOE_EOF
set network.wan.proto='pppoe'
set network.wan.username="${pppoe_username}"
set network.wan.password="${pppoe_password}"
PPPOE_EOF
[ -n "${dslite_aftr_address}" ] && {
    disable_wan
    uci -q batch <<DSLITE_EOF
set network.${DSL6}=interface
set network.${DSL6}.proto='dhcpv6'
set network.${DSL6}.device="${WAN}"
set network.${DSL6}.reqaddress='try'
set network.${DSL6}.reqprefix='auto'
set network.${DSL}=interface
set network.${DSL}.proto='dslite'
set network.${DSL}.peeraddr="${dslite_aftr_address}"
set network.${DSL}.tunlink="${DSL6}"
set network.${DSL}.mtu='1460'
set network.${DSL}.encaplimit='ignore'
DSLITE_EOF
    dhcp_relay "${DSL6}"
    firewall_wan "${DSL}" "${DSL6}"
}
[ -n "${mape_br}" ] && [ -n "${mape_ealen}" ] && {
    disable_wan
    uci -q batch <<MAPE_EOF
set network.${MAPE6}=interface
set network.${MAPE6}.proto='dhcpv6'
set network.${MAPE6}.device="${WAN}"
set network.${MAPE6}.reqaddress='try'
set network.${MAPE6}.reqprefix='auto'
set network.${MAPE}=interface
set network.${MAPE}.proto='map'
set network.${MAPE}.maptype='map-e'
set network.${MAPE}.peeraddr="${mape_br}"
set network.${MAPE}.ipaddr="${mape_ipv4_prefix}"
set network.${MAPE}.ip4prefixlen="${mape_ipv4_prefixlen}"
set network.${MAPE}.ip6prefix="${mape_ipv6_prefix}"
set network.${MAPE}.ip6prefixlen="${mape_ipv6_prefixlen}"
set network.${MAPE}.ealen="${mape_ealen}"
set network.${MAPE}.psidlen="${mape_psidlen}"
set network.${MAPE}.offset="${mape_psid_offset}"
set network.${MAPE}.mtu='1460'
set network.${MAPE}.encaplimit='ignore'
set network.${MAPE}.legacymap='1'
set network.${MAPE}.tunlink="${MAPE6}"
MAPE_EOF
    dhcp_relay "${MAPE6}"
    firewall_wan "${MAPE}" "${MAPE6}"
[ -n "${mape_gua_prefix}" ] && uci -q set network.${MAPE6}.ip6prefix="${mape_gua_prefix}"
MAP_SH="/lib/netifd/proto/map.sh"
cp "$MAP_SH" "$MAP_SH".bak
cat << 'MAP_SH_EOF' > "$MAP_SH"
#!/bin/sh
DONT_SNAT_TO="0"
[ -n "$INCLUDE_ONLY" ] || {
	. /lib/functions.sh
	. /lib/functions/network.sh
	. ../netifd-proto.sh
	init_proto "$@"
}
proto_map_setup() {
	local cfg="$1"
	local iface="$2"
	local link="map-$cfg"
	local maptype type legacymap mtu ttl tunlink zone encaplimit
	local rule ipaddr ip4prefixlen ip6prefix ip6prefixlen peeraddr ealen psidlen psid offset
	json_get_vars maptype type legacymap mtu ttl tunlink zone encaplimit
	json_get_vars rule ipaddr ip4prefixlen ip6prefix ip6prefixlen peeraddr ealen psidlen psid offset
	[ "$zone" = "-" ] && zone=""
	[ -z "$maptype" ] && maptype="$type"
	[ -z "$maptype" ] && maptype="map-e"
	( proto_add_host_dependency "$cfg" "::" "$tunlink" )
	[ "$maptype" = lw4o6 ] && sleep 5
	if [ -z "$rule" ]; then
		rule="type=$maptype,ipv6prefix=$ip6prefix,prefix6len=$ip6prefixlen,ipv4prefix=$ipaddr,prefix4len=$ip4prefixlen"
		[ -n "$psid" ] && rule="$rule,psid=$psid"
		[ -n "$psidlen" ] && rule="$rule,psidlen=$psidlen"
		[ -n "$offset" ] && rule="$rule,offset=$offset"
		[ -n "$ealen" ] && rule="$rule,ealen=$ealen"
		if [ "$maptype" = "map-t" ]; then
			rule="$rule,dmr=$peeraddr"
		else
			rule="$rule,br=$peeraddr"
		fi
	fi
	echo "rule=$rule" > /tmp/map-$cfg.rules
	RULE_DATA=$(LEGACY="$legacymap" mapcalc ${tunlink:-\*} $rule)
	if [ "$?" != 0 ]; then
		proto_notify_error "$cfg" "INVALID_MAP_RULE"
		proto_block_restart "$cfg"
		return
	fi
	echo "$RULE_DATA" >> /tmp/map-$cfg.rules
	eval $RULE_DATA
	if [ -z "$RULE_BMR" ]; then
		proto_notify_error "$cfg" "NO_MATCHING_PD"
		proto_block_restart "$cfg"
		return
	fi
	k=$RULE_BMR
	if [ "$maptype" = "lw4o6" -o "$maptype" = "map-e" ]; then
		proto_init_update "$link" 1
		proto_add_ipv4_address $(eval "echo \$RULE_${k}_IPV4ADDR") "" "" ""
		proto_add_tunnel
		json_add_string mode ipip6
		json_add_int mtu "${mtu:-1460}"
		json_add_int ttl "${ttl:-64}"
		json_add_string local $(eval "echo \$RULE_${k}_IPV6ADDR")
		json_add_string remote $(eval "echo \$RULE_${k}_BR")
		json_add_string link $(eval "echo \$RULE_${k}_PD6IFACE")
		json_add_object "data"
			[ -n "$encaplimit" ] && json_add_string encaplimit "$encaplimit"
			if [ "$maptype" = "map-e" ]; then
				json_add_array "fmrs"
				for i in $(seq $RULE_COUNT); do
					[ "$(eval "echo \$RULE_${i}_FMR")" != 1 ] && continue
					json_add_object ""
					json_add_string prefix6 "$(eval "echo \$RULE_${i}_IPV6PREFIX")/$(eval "echo \$RULE_${i}_PREFIX6LEN")"
					json_add_string prefix4 "$(eval "echo \$RULE_${i}_IPV4PREFIX")/$(eval "echo \$RULE_${i}_PREFIX4LEN")"
					json_add_int ealen $(eval "echo \$RULE_${i}_EALEN")
					json_add_int offset $(eval "echo \$RULE_${i}_OFFSET")
					json_close_object
				done
				json_close_array
			fi
		json_close_object
		proto_close_tunnel
	elif [ "$maptype" = "map-t" -a -f "/proc/net/nat46/control" ]; then
		proto_init_update "$link" 1
		local style="MAP"
		[ "$legacymap" = 1 ] && style="MAP0"
		echo add $link > /proc/net/nat46/control
		local cfgstr="local.style $style local.v4 $(eval "echo \$RULE_${k}_IPV4PREFIX")/$(eval "echo \$RULE_${k}_PREFIX4LEN")"
		cfgstr="$cfgstr local.v6 $(eval "echo \$RULE_${k}_IPV6PREFIX")/$(eval "echo \$RULE_${k}_PREFIX6LEN")"
		cfgstr="$cfgstr local.ea-len $(eval "echo \$RULE_${k}_EALEN") local.psid-offset $(eval "echo \$RULE_${k}_OFFSET")"
		cfgstr="$cfgstr remote.v4 0.0.0.0/0 remote.v6 $(eval "echo \$RULE_${k}_DMR") remote.style RFC6052 remote.ea-len 0 remote.psid-offset 0"
		echo config $link $cfgstr > /proc/net/nat46/control
		for i in $(seq $RULE_COUNT); do
			[ "$(eval "echo \$RULE_${i}_FMR")" != 1 ] && continue
			local cfgstr="remote.style $style remote.v4 $(eval "echo \$RULE_${i}_IPV4PREFIX")/$(eval "echo \$RULE_${i}_PREFIX4LEN")"
			cfgstr="$cfgstr remote.v6 $(eval "echo \$RULE_${i}_IPV6PREFIX")/$(eval "echo \$RULE_${i}_PREFIX6LEN")"
			cfgstr="$cfgstr remote.ea-len $(eval "echo \$RULE_${i}_EALEN") remote.psid-offset $(eval "echo \$RULE_${i}_OFFSET")"
			echo insert $link $cfgstr > /proc/net/nat46/control
		done
	else
		proto_notify_error "$cfg" "UNSUPPORTED_TYPE"
		proto_block_restart "$cfg"
	fi
	proto_add_ipv4_route "0.0.0.0" 0
	proto_add_data
	[ -n "$zone" ] && json_add_string zone "$zone"
	json_add_array firewall
	  if [ -z "$(eval "echo \$RULE_${k}_PORTSETS")" ]; then
	    json_add_object ""
	      json_add_string type nat
	      json_add_string target SNAT
	      json_add_string family inet
	      json_add_string snat_ip $(eval "echo \$RULE_${k}_IPV4ADDR")
	    json_close_object
	  else
	    local portcount=0
	    local allports=""
	    for portset in $(eval "echo \$RULE_${k}_PORTSETS"); do
		local startport=$(echo $portset | cut -d'-' -f1)
		local endport=$(echo $portset | cut -d'-' -f2)
		for x in $(seq $startport $endport); do
			if ! echo "$DONT_SNAT_TO" | tr ' ' '\n' | grep -qw $x; then                        
				allports="$allports $portcount : $x , "
				portcount=`expr $portcount + 1`
			fi
		done
	    done
		allports=${allports%??}
            nft add table inet mape
            nft add chain inet mape srcnat {type nat hook postrouting priority 0\; policy accept\; }
	    local counter=0  
        for proto in icmp tcp udp; do
			nft add rule inet mape srcnat ip protocol $proto oifname "map-$cfg" counter packets 0 bytes 0 snat ip to $(eval "echo \$RULE_${k}_IPV4ADDR") : numgen inc mod $portcount map { $allports }
	    done
	  fi
	  if [ "$maptype" = "map-t" ]; then
		[ -z "$zone" ] && zone=$(fw3 -q network $iface 2>/dev/null)
		[ -n "$zone" ] && {
			json_add_object ""
				json_add_string type rule
				json_add_string family inet6
				json_add_string proto all
				json_add_string direction in
				json_add_string dest "$zone"
				json_add_string src "$zone"
				json_add_string src_ip $(eval "echo \$RULE_${k}_IPV6ADDR")
				json_add_string target ACCEPT
			json_close_object
			json_add_object ""
				json_add_string type rule
				json_add_string family inet6
				json_add_string proto all
				json_add_string direction out
				json_add_string dest "$zone"
				json_add_string src "$zone"
				json_add_string dest_ip $(eval "echo \$RULE_${k}_IPV6ADDR")
				json_add_string target ACCEPT
			json_close_object
		}
		proto_add_ipv6_route $(eval "echo \$RULE_${k}_IPV6ADDR") 128
	  fi
	json_close_array
	proto_close_data
	proto_send_update "$cfg"
	if [ "$maptype" = "lw4o6" -o "$maptype" = "map-e" ]; then
		json_init
		json_add_string name "${cfg}_"
		json_add_string ifname "@$(eval "echo \$RULE_${k}_PD6IFACE")"
		json_add_string proto "static"
		json_add_array ip6addr
		json_add_string "" "$(eval "echo \$RULE_${k}_IPV6ADDR")"
		json_close_array
		json_close_object
		ubus call network add_dynamic "$(json_dump)"
	fi
}
proto_map_teardown() {
	local cfg="$1"
	local link="map-$cfg"
	json_get_var type type
	[ -z "$maptype" ] && maptype="$type"
	[ -z "$maptype" ] && maptype="map-e"
	case "$maptype" in
		"map-e"|"lw4o6") ifdown "${cfg}_" ;;
		"map-t") [ -f "/proc/net/nat46/control" ] && echo del $link > /proc/net/nat46/control ;;
	esac
	rm -f /tmp/map-$cfg.rules
}
proto_map_init_config() {
	no_device=1
	available=1
	proto_config_add_string "maptype"
	proto_config_add_string "rule"
	proto_config_add_string "ipaddr"
	proto_config_add_int "ip4prefixlen"
	proto_config_add_string "ip6prefix"
	proto_config_add_int "ip6prefixlen"
	proto_config_add_string "peeraddr"
	proto_config_add_int "ealen"
	proto_config_add_int "psidlen"
	proto_config_add_int "psid"
	proto_config_add_int "offset"
	proto_config_add_boolean "legacymap"
	proto_config_add_string "tunlink"
	proto_config_add_int "mtu"
	proto_config_add_int "ttl"
	proto_config_add_string "zone"
	proto_config_add_string "encaplimit"
}
[ -n "$INCLUDE_ONLY" ] || {
        add_protocol map
}
MAP_SH_EOF
}
[ -n "${ap_ip_address}" ] && {
    disable_wan
    uci -q batch <<AP_EOF
set network.${AP}=interface
set network.${AP}.proto='static'
set network.${AP}.device="${LAN}"
set network.${AP}.ipaddr="${ap_ip_address}"
set network.${AP}.netmask='255.255.255.0'
set network.${AP}.gateway="${ap_gateway}"
set network.${AP}.dns="${ap_gateway}"
set network.${AP}.delegate='0'
set network.${AP6}=interface
set network.${AP6}.proto='dhcpv6'
set network.${AP6}.device="@${AP}"
set network.${AP6}.reqaddress='try'
set network.${AP6}.reqprefix='no'
AP_EOF
    for r in 0 1 2; do
    	[ -n "$(uci -q get wireless.default_radio$r)" ] && uci -q set wireless.default_radio$r.network="${AP}"
	done
    [ -x /etc/init.d/odhcpd ] && /etc/init.d/odhcpd disable
    [ -x /etc/init.d/dnsmasq ] && /etc/init.d/dnsmasq disable  
    uci -q delete firewall
    [ -x /etc/init.d/firewall ] && /etc/init.d/firewall disable
}
[ -n "${enable_ttyd}" ] && uci -q batch <<'TTYD_EOF'
set ttyd.@ttyd[0].ipv6='1'
set ttyd.@ttyd[0].command='/bin/login -f root'
TTYD_EOF
[ -n "${enable_irqbalance}" ] && uci -q batch <<'IRQ_EOF'
set irqbalance.irqbalance=irqbalance
set irqbalance.irqbalance.enabled='1'
IRQ_EOF
[ -n "${enable_samba4}" ] && uci -q batch <<SAMBA_EOF
set samba4.@samba[0]=samba
set samba4.@samba[0].workgroup='WORKGROUP'
set samba4.@samba[0].charset='UTF-8'
set samba4.@samba[0].description='Samba on OpenWRT'
set samba4.@samba[0].enable_extra_tuning='1'
set samba4.@samba[0].interface='lan'
set samba4.sambashare=sambashare
set samba4.sambashare.name="${NAS}"
set samba4.sambashare.path="${MNT}"
set samba4.sambashare.read_only='no'
set samba4.sambashare.force_root='1'
set samba4.sambashare.guest_ok='yes'
set samba4.sambashare.inherit_owner='yes'
set samba4.sambashare.create_mask='0777'
set samba4.sambashare.dir_mask='0777'
SAMBA_EOF
[ -n "${enable_usb_rndis}" ] && {
    printf '%s\n%s\n' "rndis_host" "cdc_ether" > /etc/modules.d/99-usb-net
	uci add_list network.@device[0].ports='usb0'
}
[ -n "${enable_usb_gadget}" ] && [ -d /boot ] && {
    ! grep -q 'dtoverlay=dwc2' /boot/config.txt && echo 'dtoverlay=dwc2' >> /boot/config.txt
    sed -i 's/rootwait/& modules-load=dwc2,g_ether/' /boot/cmdline.txt
    printf '%s\n%s\n' "dwc2" "g_ether" > /etc/modules.d/99-gadget
    sed -i '/^exit 0/i [ -d /sys/class/net/usb0 ] && { uci add_list network.@device[0].ports="usb0"; uci commit network; sed -i "/usb0/d" /etc/rc.local; }' /etc/rc.local
}
[ -n "${enable_netopt}" ] && {
    C=/etc/sysctl.d/99-net-opt.conf
    P=$(grep -c ^processor /proc/cpuinfo)
    RMEM=${netopt_rmem:-}
    WMEM=${netopt_wmem:-}
    TR=${netopt_rmem:-}
    TW=${netopt_wmem:-}
    CT=${netopt_conntrack:-}
    NB=${netopt_backlog:-}
    SC=${netopt_somaxconn:-}
    CONG=${netopt_congestion:-cubic}
    if [ -z "$RMEM" ] || [ -z "$WMEM" ]; then
        if   [ $MEM -ge 2400 ]; then R=16777216 W=16777216 TR="4096 262144 16777216" TW=$TR CT=262144 NB=5000 SC=16384
        elif [ $MEM -ge 1200 ]; then R=8388608  W=8388608  TR="4096 131072 8388608"  TW=$TR CT=131072 NB=2500 SC=8192
        elif [ $MEM -ge  400 ]; then R=4194304  W=4194304  TR="4096 65536  4194304"  TW=$TR CT=65536  NB=1000 SC=4096
        fi
        [ $P -gt 4 ] && { NB=$((NB*2));   SC=$((SC*2)); }
        [ $P -gt 2 ] && [ $P -le 4 ] && { NB=$((NB*3/2)); SC=$((SC*3/2)); }
    else
        R=$(echo "$RMEM" | cut -d' ' -f3)
        W=$(echo "$WMEM" | cut -d' ' -f3)
    fi
    printf "net.core.rmem_max=%s\nnet.core.wmem_max=%s\nnet.ipv4.tcp_rmem=%s\nnet.ipv4.tcp_wmem=%s\nnet.ipv4.tcp_congestion_control=%s\nnet.ipv4.tcp_fastopen=3\nnet.netfilter.nf_conntrack_max=%s\nnet.core.netdev_max_backlog=%s\nnet.core.somaxconn=%s\n" \
    "$R" "$W" "$TR" "$TW" "$CONG" "$CT" "$NB" "$SC" > "$C"
    sysctl -p "$C"
}
[ -n "${enable_dnsmasq}" ] && {
    CACHE_SIZE="${dnsmasq_cache:-}"
    NEG_CACHE="${dnsmasq_negcache:-1}"
    if [ -z "$CACHE_SIZE" ]; then
        if   [ "$MEM" -ge 800 ]; then CACHE_SIZE=10000
        elif [ "$MEM" -ge 400 ]; then CACHE_SIZE=5000
        elif [ "$MEM" -ge 200 ]; then CACHE_SIZE=1000
        fi
    fi
    uci -q batch <<DNSMASQ_EOF
set dhcp.@dnsmasq[0].cachesize='${CACHE_SIZE}'
set dhcp.@dnsmasq[0].nonegcache='${NEG_CACHE}'
DNSMASQ_EOF
}
# BEGIN_CMDS
# END_CMDS
uci commit 2>/dev/null
[ -n "${backup_path}" ] && sysupgrade -q -k -b "${backup_path}"
echo "All done!"
exit 0
