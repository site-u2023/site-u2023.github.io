# setup.sh 解説

### システム情報記録

<details>
<summary>system description</summary>
    
```sh
SEC=system
SET @system[0].description="${DATE}"
SET @system[0].notes="site-u.pages.dev"
```

</details>

### ログ管理
<details> <summary>enable_log</summary>

```sh
enable_log="1"
[ -n "${enable_log}" ] && {
    local SEC=system
    SET @system[0].log_size='32'
    SET @system[0].conloglevel='1'
    SET @system[0].cronloglevel='9'
    SEC=dhcp
    SET @dnsmasq[0].quietdhcp='1'
    SET odhcpd.loglevel='0'
}
```

</details>

### NTPサーバー設定

<details>
<summary>ntp</summary>
    
```sh
[ -n "${ntp}" ] && {
    SEC=system
    DEL ntp
    SET ntp=timeserver
    SET ntp.enabled='1'
    SET ntp.enable_server='1'
    SET ntp.interface='lan'
    DEL ntp.server
    # 国別NTPサーバー（0-1）
    for i in 0 1; do
        ADDLIST ntp.server="${i}.$(echo "${country}" | tr 'A-Z' 'a-z').${ntp}"
    done
    # グローバルNTPサーバー（0-1）
    for i in 0 1; do
        ADDLIST ntp.server="${i}.${ntp}"
    done
}
```

</details>

### LuCI診断設定

<details>
<summary>diag</summary>
    
```sh
[ -n "${diag}" ] && {
    SEC=luci
    SET diag=diag
    SET diag.ping="${diag}"   # ping診断先
    SET diag.route="${diag}"  # traceroute診断先
    SET diag.dns="${diag}"    # DNS診断先
}
```

</details>

### ホスト名設定

<details>
<summary>device_name</summary>
    
```sh
[ -n "${device_name}" ] && { SEC=system; SET @system[0].hostname="${device_name}"; }
```

</details>

### rootパスワード設定

<details>
<summary>root_password</summary>
    
```sh
[ -n "${root_password}" ] && printf '%s\n%s\n' "${root_password}" "${root_password}" | passwd 2>&-
```

</details>

### LAN側IPアドレス設定

<details>
<summary>lan_ip_address</summary>
    
```sh
[ -n "${lan_ip_address}" ] && { SEC=network; SET lan.ipaddr="${lan_ip_address}"; }
```

</details>

### LAN側IPv6アドレス設定

<details>
<summary>lan_ipv6_address</summary>
    
```sh
[ -n "${lan_ipv6_address}" ] && { SEC=network; DEL lan.ip6assign; SET lan.ip6addr="${lan_ipv6_address}"; }
```

</details>

### 言語・タイムゾーン設定

<details>
<summary>language / timezone / zonename</summary>
    
```sh
[ -n "${language}" ] && { SEC=system; SET @system[0].language="${language}"; }
[ -n "${timezone}" ] && { SEC=system; SET @system[0].timezone="${timezone}"; }
[ -n "${zonename}" ] && { SEC=system; SET @system[0].zonename="${zonename}"; }
```

</details>

### SSH設定

<details>
<summary>ssh_interface / ssh_port</summary>
    
```sh
[ -n "${ssh_interface}" ] && { SEC=dropbear; SET @dropbear[0].Interface="${ssh_interface}"; }
[ -n "${ssh_port}" ] && { SEC=dropbear; SET @dropbear[0].Port="${ssh_port}"; }
```

</details>

### フローオフローディング設定

<details>
<summary>offload</summary>
    
```sh
[ -n "${offload}" ] && {
    SEC=firewall
    SET @defaults[0].flow_offloading='1'
    [ "${offload}" = "hardware" ] && SET @defaults[0].flow_offloading_hw='1'
}
```

</details>

### Wi-Fi設定

<details>
<summary>wifi_mode (standard / usteer / mlo)</summary>
    
```sh
{ [ "${wifi_mode}" = "standard" ] || [ "${wifi_mode}" = "usteer" ] || [ "${wifi_mode}" = "mlo" ]; } && 
[ -n "${wlan_ssid}" ] && [ -n "${wlan_password}" ] && [ "${#wlan_password}" -ge 8 ] && {
    SEC=wireless
    RESET
    wireless_cfg=$(uci -q show wireless)
    link_id=0
    radio_count=0
    
    # 全ての無線デバイスに対して設定
    for radio in $(printf '%s\n' "${wireless_cfg}" | grep -E "wireless\.(radio|wifi)[0-9]*=" | cut -d. -f2 | cut -d= -f1); do
        SET "${radio}".disabled='0'
        SET ${radio}.country="${country}"
        [ "${wifi_mode}" = "mlo" ] && SET ${radio}.rnr='1'
        
        # 周波数帯判定
        band=$(GET wireless.${radio}.band 2>&-)
        if [ -z "$band" ]; then
            hwmode=$(GET wireless.${radio}.hwmode)
            band_attr=$(GET wireless.${radio}.band 2>&-)
            case "${hwmode}" in
                11axg|11ng|11bg|11g) band='2g' ;;
                11bea|11na|11ac|11a) [ "${band_attr}" = "3" ] && band='6g' || band='5g' ;;
            esac
        fi
        
        # SNR閾値とencryption設定
        S="30 15 5"
        set -- ${snr:-$S}
        case "${band}" in
            2g) [ "${wifi_mode}" = "mlo" ] && encryption='sae' || encryption='psk2'; band_snr=$1 ;;
            5g) [ "${wifi_mode}" = "mlo" ] && encryption='sae' || encryption='psk2'; band_snr=$2
                [ "${wifi_mode}" = "mlo" ] && SET ${radio}.background_radar='1' ;;
            6g) encryption='sae'; band_snr=$3 ;;
            *) continue ;;
        esac
        
        # SSID設定
        suffix=${band:+-$band}
        { [ "${wifi_mode}" = "usteer" ] || [ "${wifi_mode}" = "mlo" ]; } && ssid="${wlan_ssid}" || ssid="${wlan_ssid}${suffix}"
        
        iface="default_${radio}"
        [ -n "$(GET wireless.${iface})" ] && {
            # 既存設定をクリア
            for o in rnr background_radar; do DEL ${radio}.$o; done
            for o in isolate ieee80211r mobility_domain ft_over_ds nasid ieee80211k ieee80211v usteer_min_snr ieee80211w mlo mld_id mlo_link_id; do DEL ${iface}.$o; done
            
            # 基本設定
            SET ${iface}.disabled='0'
            SET ${iface}.encryption="${encryption}"
            SET ${iface}.ssid="${ssid}"
            SET ${iface}.key="${wlan_password}"
            [ "${encryption}" = "sae" ] && SET ${iface}.ieee80211w='2' || SET ${iface}.ieee80211w='0'
            
            # usteer/mlo共通設定
            { [ "${wifi_mode}" = "usteer" ] || [ "${wifi_mode}" = "mlo" ]; } && {
                SET ${iface}.isolate='1'
                
                # usteer固有設定（802.11r/k/v）
                [ "${wifi_mode}" = "usteer" ] && {
                    SET ${iface}.ieee80211r='1'
                    SET ${iface}.mobility_domain="${mobility_domain:-4f57}"
                    SET ${iface}.ft_over_ds='1'
                    SET ${iface}.nasid="${wlan_ssid}-${radio_count}"
                    SET ${iface}.ieee80211k='1'
                    SET ${iface}.ieee80211v='1'
                    SET ${iface}.usteer_min_snr="${band_snr}"
                }
            }
            
            # MLO固有設定
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
    
    # usteerデーモン設定
    [ "${wifi_mode}" = "usteer" ] && {
        SEC=usteer
        SET @usteer[0].roam_scan_snr='-65'
        SET @usteer[0].signal_diff_threshold='10'
        SET @usteer[0].min_snr='20'
        SET @usteer[0].max_snr='80'
    }
}
```

</details>

### PPPoE接続設定

<details>
<summary>connection_type: pppoe</summary>
    
```sh
[ "${connection_type}" = "pppoe" ] && [ -n "${pppoe_username}" ] && {
    SEC=network
    RESET
    SET wan.proto='pppoe'
    SET wan.username="${pppoe_username}"
    [ -n "${pppoe_password}" ] && SET wan.password="${pppoe_password}"
}
```

</details>

### DS-Lite接続設定

<details>
<summary>connection_type: dslite</summary>
    
```sh
{ [ "${connection_type}" = "dslite" ] || { [ "${connection_type}" = "auto" ] && [ "${connection_auto}" = "dslite" ]; }; } && 
[ -n "${dslite_peeraddr}" ] && {
    SEC=network
    RESET
    disable_wan
    
    # IPv6接続（DHCPv6）
    SET ${DSL6}=interface
    SET ${DSL6}.proto='dhcpv6'
    SET ${DSL6}.ifname="${WAN}"
    SET ${DSL6}.reqaddress='try'
    SET ${DSL6}.reqprefix='auto'
    
    # DS-Liteトンネル（IPv4 over IPv6）
    SET ${DSL}=interface
    SET ${DSL}.proto='dslite'
    SET ${DSL}.peeraddr="${dslite_peeraddr}"
    SET ${DSL}.tunlink="${DSL6}"
    SET ${DSL}.mtu='1460'
    SET ${DSL}.encaplimit='ignore'
    
    dhcp_relay "${DSL6}"
    firewall_wan "${DSL}" "${DSL6}"
}
```

</details>

### MAP-E接続設定

<details>
<summary>connection_type: mape</summary>
    
```sh
{ [ "${connection_type}" = "mape" ] || { [ "${connection_type}" = "auto" ] && [ "${connection_auto}" = "mape" ]; }; } && 
[ -n "${peeraddr}" ] && {
    SEC=network
    RESET
    disable_wan
    
    # IPv6接続（DHCPv6）
    SET ${MAPE6}=interface
    SET ${MAPE6}.proto='dhcpv6'
    SET ${MAPE6}.ifname="${WAN}"
    SET ${MAPE6}.reqaddress='try'
    SET ${MAPE6}.reqprefix='auto'
    
    # MAP-Eトンネル
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
    
    # Static IPv6プレフィックス設定
    [ -n "${ip6prefix_static}" ] && SET ${MAPE6}.ip6prefix="${ip6prefix_static}"
    
    dhcp_relay "${MAPE6}"
    firewall_wan "${MAPE}" "${MAPE6}"
    
    # map.shスクリプトのパッチ適用（日本IPv6 IPoE対応）
    MAPSH="/lib/netifd/proto/map.sh"
    HASH0="431ad78fc976b70c53cdc5adc4e09b3eb91fd97f"
    HASH1="7f0682eeaf2dd7e048ff1ad1dbcc5b913ceb8de4"
    HASH="$(sha1sum "$MAPSH" | awk '{print $1}')"
    
    # HASH1の場合のパッチ
    [ "$HASH" = "$HASH1" ] && {
        SET ${MAPE}.legacymap='1'
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
    
    # HASH0の場合のパッチ
    [ "$HASH" = "$HASH0" ] && {
        cp "$MAPSH" "$MAPSH".old
        sed -i 's/#export LEGACY=1/export LEGACY=1/' "$MAPSH"
        sed -i 's/json_add_boolean connlimit_ports 1/json_add_string connlimit_ports "1"/' "$MAPSH"
    }
}
```

</details>

### アクセスポイントモード設定

<details>
<summary>connection_type: ap</summary>
    
```sh
[ "${connection_type}" = "ap" ] && [ -n "${ap_ipaddr}" ] && [ -n "${gateway}" ] && {
    disable_wan
    
    # ネットワーク設定
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
    
    # 無線インターフェース設定
    SEC=wireless
    for r in 0 1 2; do
        GET wireless.default_radio$r >&- && SET default_radio$r.network="${AP}"
    done
    
    # ルーター機能無効化
    ${INIT}/odhcpd disable 2>&-
    ${INIT}/dnsmasq disable 2>&-
    uci -q delete firewall
    ${INIT}/firewall disable 2>&-
}
```

</details>

### Webターミナル有効化

<details>
<summary>ttyd</summary>
    
```sh
[ -n "${ttyd}" ] && {
    SEC=ttyd
    SET @ttyd[0].command='/bin/login -f root'
}
```

</details>

### IRQバランサー有効化

<details>
<summary>irqbalance</summary>
    
```sh
[ -n "${irqbalance}" ] && {
    SEC=irqbalance
    SET irqbalance=irqbalance
    SET irqbalance.enabled='1'
}
```

</details>

### Prometheus監視設定

<details>
<summary>prometheus</summary>
    
```sh
[ -n "${prometheus}" ] && {
    SEC=prometheus-node-exporter-lua
    SET @prometheus-node-exporter-lua[0]=prometheus-node-exporter-lua
    SET @prometheus-node-exporter-lua[0].listen_address='0.0.0.0'
    SET @prometheus-node-exporter-lua[0].listen_port='9100'
}
```

</details>

### Sambaファイル共有設定

<details>
<summary>samba4</summary>
    
```sh
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
```

</details>

### USB RNDIS有効化

<details>
<summary>usb_rndis</summary>
    
```sh
[ -n "${usb_rndis}" ] && {
    printf '%s\n%s\n' "rndis_host" "cdc_ether" > /etc/modules.d/99-usb-net
    SEC=network
    ADDLIST @device[0].ports='usb0'
}
```

</details>

### USB Gadgetモード設定

<details>
<summary>usb_gadget</summary>
    
```sh
[ -n "${usb_gadget}" ] && {
    echo 'dtoverlay=dwc2' >> /boot/config.txt
    sed -i 's/\(root=[^ ]*\)/\1 modules-load=dwc2,g_ether/' /boot/cmdline.txt
    printf '%s\n%s\n' "dwc2" "g_ether" > /etc/modules.d/99-gadget
    SEC=network
    ADDLIST @device[0].ports='usb0'
}
```

</details>

### ネットワーク最適化設定

<details>
<summary>net_optimizer</summary>
    
```sh
[ -n "${net_optimizer}" ] && [ "${net_optimizer}" != "disabled" ] && [ $MEM -ge 400 ] && {
    C=/etc/sysctl.d/99-net-opt.conf
    P=$(grep -c ^processor /proc/cpuinfo)
    
    # autoモード：メモリ量に応じて自動調整
    [ "${net_optimizer}" = "auto" ] && {
        if [ $MEM -ge 2400 ]; then R=16777216 W=16777216 TR="4096 262144 16777216" TW=$TR CT=262144 NB=5000 SC=16384
        elif [ $MEM -ge 1200 ]; then R=8388608 W=8388608 TR="4096 131072 8388608" TW=$TR CT=131072 NB=2500 SC=8192
        elif [ $MEM -ge 400 ]; then R=4194304 W=4194304 TR="4096 65536 4194304" TW=$TR CT=65536 NB=1000 SC=4096
        fi
        [ $P -gt 4 ] && { NB=$((NB*2)); SC=$((SC*2)); }
        [ $P -gt 2 ] && [ $P -le 4 ] && { NB=$((NB*3/2)); SC=$((SC*3/2)); }
    }
    
    # manualモード：ユーザー指定値を使用
    [ "${net_optimizer}" = "manual" ] && {
        R=$(echo "${netopt_rmem}" | awk '{print $3}')
        W=$(echo "${netopt_wmem}" | awk '{print $3}')
        TR="${netopt_rmem}"
        TW="${netopt_wmem}"
        CT="${netopt_conntrack}"
        NB="${netopt_backlog}"
        SC="${netopt_somaxconn}"
    }
    
    # sysctl設定ファイルを生成・適用
    printf "net.core.rmem_max=%s\nnet.core.wmem_max=%s\nnet.ipv4.tcp_rmem=%s\nnet.ipv4.tcp_wmem=%s\nnet.ipv4.tcp_fastopen=3\nnet.netfilter.nf_conntrack_max=%s\nnet.core.netdev_max_backlog=%s\nnet.core.somaxconn=%s\n" \
        "$R" "$W" "$TR" "$TW" "$CT" "$NB" "$SC" > "$C"
    sysctl -p "$C"
}
```

</details>

### DNSキャッシュ最適化

<details>
<summary>dnsmasq</summary>
    
```sh
[ -n "${dnsmasq}" ] && [ "${dnsmasq}" != "disabled" ] && {
    SEC=dhcp
    
    # autoモード：メモリ量に応じてキャッシュサイズを自動設定
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
```

</details>

### 広告ブロック設定（Adblock Fast）

<details>
<summary>dns_adblock: adblock_fast</summary>
    
```sh
[ "${dns_adblock}" = "adblock_fast" ] && {
    SEC=adblock-fast
    SET config.enabled='1'
    SET config.procd_trigger_wan6='1'
    
    # フィルターURL設定
    [ -n "${filter_url}" ] && {
        local IDX
        IDX=$(uci add "$SEC" file_url)
        SET "$IDX".url="${filter_url}"
        SET "$IDX".action='block'
        SET "$IDX".enabled='1'
    }
}
```

</details>

### htpasswd抽出

<details>
<summary>dns_adblock: adguardhome (htpasswd準備)</summary>
    
```sh
[ "${dns_adblock}" = "adguardhome" ] && {
    if [ "$MEM" -ge "${agh_min_memory}" ] && [ "$FLASH" -ge "${agh_min_flash}" ]; then
        [ -z "${apache_keep}" ] && {
            ${INIT}/apache stop 2>&- || true
            LIBS="libapr*.so* libexpat.so* libuuid.so*"
            [ -f /usr/bin/htpasswd ] && cp /usr/bin/htpasswd /tmp/
            for L in $LIBS; do cp /usr/lib/$L /tmp/ 2>&-; done
            apk del apache 2>&- || opkg remove apache 2>&-
            mv /tmp/htpasswd /usr/bin/ 2>&-
            for L in $LIBS; do mv /tmp/$L /usr/lib/ 2>&-; done
        }
    fi
}
```

</details>

### AdGuard Home設定

<details>
<summary>dns_adblock: adguardhome</summary>
    
```sh
[ "${dns_adblock}" = "adguardhome" ] && {
    lan_ip_address=$(GET network.lan.ipaddr | cut -d/ -f1)
    
    if [ "$MEM" -ge "${agh_min_memory}" ] && [ "$FLASH" -ge "${agh_min_flash}" ]; then
        mkdir -p "${agh_dir}"
        cfg_dhcp="${CONF}/dhcp"
        cfg_fw="${CONF}/firewall"
        cp "$cfg_dhcp" "$cfg_dhcp.adguard.bak"
        cp "$cfg_fw" "$cfg_fw.adguard.bak"
        
        # htpasswdでパスワードハッシュ生成
        agh_hash=$(htpasswd -B -n -b "" "${agh_pass}" 2>&- | cut -d: -f2)
        
        [ -n "$agh_hash" ] && {
        # AdGuard Home設定ファイル生成
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
        
        # プレースホルダー置換
        sed -i "s|{{AGH_USER}}|${agh_user}|g;s|{{AGH_HASH}}|${agh_hash}|g;s|{{WEB_PORT}}|${agh_web_port}|g;s|{{DNS_PORT}}|${agh_dns_port}|g;s|{{DNS_BACKUP_PORT}}|${agh_dns_backup_port}|g;s|{{FILTER_URL}}|${filter_url}|g" "$agh_yaml"
        sed -i "s|{{NTP_DOMAIN}}|$(GET system.ntp.server | head -n1 | awk -F. '{if (NF==4) print $0; else if (NF>=3) print $(NF-2)"."$(NF-1)"."$NF; else if (NF==2) print $(NF-1)"."$NF; else print $0}' 2>&-)|g" "$agh_yaml"
        chmod 600 "$agh_yaml"
        
        # dnsmasq設定
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
        
        # ファイアウォール設定
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
        # リソース不足の場合
        ${INIT}/adguardhome stop 2>&-
        ${INIT}/adguardhome disable 2>&-
        echo "AdGuardHome: ${INIT}/adguardhome start then ${lan_ip_address}:3000"
    fi
}
```

</details>

### 最終処理

<details>
<summary>設定のコミットとバックアップ</summary>
    
```sh
# BEGIN_CMDS
# END_CMDS

# UCI設定をコミット（永続化）
uci commit 2>&-

# バックアップパスが指定されている場合、設定をバックアップ
[ -n "${backup_path}" ] && sysupgrade -q -k -b "${backup_path}"

echo "All done!"
exit 0
```

</details>
