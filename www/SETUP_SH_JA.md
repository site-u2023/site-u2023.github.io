# setup.sh 解説

### システム情報記録

<details>
<summary>enable_notes</summary>

```sh
[ -n "${enable_notes}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    DEL() { uci -q delete "${SEC}${SEC:+.}" "$@"; }
    
    # このセクション固有の変数
    DATE="$(date '+%Y-%m-%d %H:%M')"  # 現在日時
    
    local SEC=system
    # システムの説明フィールドにセットアップ日時を記録
    SET @system[0].description="${DATE}"
    # ノートフィールドに参照URLを記録
    SET @system[0].notes="site-u.pages.dev"
}
```

</details>

### NTPサーバー設定

<details>
<summary>enable_ntp</summary>

```sh
[ -n "${enable_ntp}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    DEL() { uci -q delete "${SEC}${SEC:+.}" "$@"; }
    ADDLIST() { uci add_list "${SEC}${SEC:+.}" "$@"; }
    
    # このセクション固有の変数
    NTPDOMAIN=".pool.ntp.org"          # NTPドメインサフィックス
    COUNTRY="${country:-00}"           # 国コード（デフォルト00）
    
    local SEC=system
    SET ntp=timeserver
    SET ntp.enabled='1'              # NTPクライアント有効化
    SET ntp.enable_server='1'        # NTPサーバー機能有効化
    SET ntp.interface='lan'          # LANインターフェースで提供
    DEL ntp.server                   # 既存サーバーリストをクリア
    
    # 国コードを小文字に変換
    COUNTRY_LC=$(printf '%s' "$COUNTRY" | tr 'A-Z' 'a-z')
    
    # 4つのNTPサーバーを追加（0〜1は国別、2〜3はグローバル）
    for i in 0 1 2 3; do
        s="${i:0:2}.${COUNTRY_LC}${NTPDOMAIN}"  # 例: 0.jp.pool.ntp.org
        [ $i -gt 1 ] && s="${i}${NTPDOMAIN}"    # 2以降はグローバル
        ADDLIST ntp.server="$s"
    done
}
```

</details>

### ログ設定

<details>
<summary>enable_log</summary>

```sh
[ -n "${enable_log}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    
    local SEC=system
    SET @system[0].log_size='32'      # ログバッファサイズ32KB
    SET @system[0].conloglevel='1'    # コンソールログレベル（ALERT以上）
    SET @system[0].cronloglevel='9'   # cronログレベル（全て記録しない）
}
```

</details>

### LuCI診断設定

<details>
<summary>enable_diag</summary>

```sh
[ -n "${enable_diag}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    
    # このセクション固有の変数
    DIAG="one.one.one.one"  # 診断用ドメイン（Cloudflare DNS）
    
    local SEC=luci
    SET diag=diag
    SET diag.ping="${DIAG}"   # ping診断先（1.1.1.1）
    SET diag.route="${DIAG}"  # traceroute診断先
    SET diag.dns="${DIAG}"    # DNS診断先
}
```

</details>

### ホスト名設定

<details>
<summary>device_name</summary>

```sh
[ -n "${device_name}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    
    local SEC=system
    SET @system[0].hostname="${device_name}" # ホスト名を設定
}
```

</details>

### rootパスワード設定

<details>
<summary>root_password</summary>

```sh
[ -n "${root_password}" ] && 
    # パスワードを2回入力してpasswdコマンドに渡す
    printf '%s\n%s\n' "${root_password}" "${root_password}" | passwd >/dev/null
```

</details>

### LAN側IPアドレス設定

<details>
<summary>lan_ip_address</summary>

```sh
[ -n "${lan_ip_address}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    
    local SEC=network
    SET lan.ipaddr="${lan_ip_address}" # LAN側IPアドレスを設定
}
```

</details>

### LAN側IPv6アドレス設定

<details>
<summary>lan_ipv6_address</summary>

```sh
[ -n "${lan_ipv6_address}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    DEL() { uci -q delete "${SEC}${SEC:+.}" "$@"; }
    
    local SEC=network
    DEL lan.ip6assign              # IPv6プレフィックス委譲を無効化
    SET lan.ip6addr="${lan_ipv6_address}" # 固定IPv6アドレスを設定
}
```

</details>

### 言語・タイムゾーン設定

<details>
<summary>language / timezone / zonename</summary>

```sh
[ -n "${language}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    
    local SEC=system
    SET @system[0].language="${language}" # UI言語設定
}

[ -n "${timezone}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    
    local SEC=system
    SET @system[0].timezone="${timezone}" # タイムゾーン（例: JST-9）
}

[ -n "${zonename}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    
    local SEC=system
    SET @system[0].zonename="${zonename}" # ゾーン名（例: Asia/Tokyo）
}
```

</details>

### SSH設定

<details>
<summary>ssh_interface / ssh_port</summary>

```sh
[ -n "${ssh_interface}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    
    local SEC=dropbear
    SET @dropbear[0].Interface="${ssh_interface}" # SSH待受インターフェース
}

[ -n "${ssh_port}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    
    local SEC=dropbear
    SET @dropbear[0].Port="${ssh_port}" # SSH待受ポート番号
}
```

</details>

### フローオフローディング設定

<details>
<summary>flow_offloading_type</summary>

```sh
[ -n "${flow_offloading_type}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    
    local SEC=firewall
    SET @defaults[0].flow_offloading='1' # ソフトウェアオフローディング有効化
    # ハードウェアオフローディング対応の場合
    [ "${flow_offloading_type}" = "hardware" ] && 
        SET @defaults[0].flow_offloading_hw='1'
}
```

</details>

### Wi-Fi設定

<details>
<summary>wifi_mode (standard / usteer)</summary>

```sh
{ [ "${wifi_mode}" = "standard" ] || [ "${wifi_mode}" = "usteer" ]; } && 
[ -n "${wlan_ssid}" ] && [ -n "${wlan_password}" ] && [ "${#wlan_password}" -ge 8 ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    
    # このセクション固有の変数
    COUNTRY="${country:-00}"  # 規制国コード
    
    local SEC=wireless
    wireless_cfg=$(uci -q show wireless)
    
    # 全ての無線デバイスに対して設定
    for radio in $(printf '%s\n' "${wireless_cfg}" | grep "wireless\.radio[0-9]*=" | cut -d. -f2 | cut -d= -f1); do
        SET ${radio}.disabled='0'           # 無線デバイスを有効化
        SET ${radio}.country="${COUNTRY}"   # 規制国コード設定
        
        # 周波数帯に応じた設定
        band=$(uci -q get wireless.${radio}.band)
        set -- 30 15 5  # SNR閾値（2g=30, 5g=15, 6g=5）
        case "${band}" in
            2g) encryption='psk-mixed'; nasid_suffix='-2g'; band_snr=$1;;
            5g) encryption='sae-mixed'; nasid_suffix='-5g'; band_snr=$2;;
            6g) encryption='sae'; nasid_suffix='-6g'; band_snr=$3;;
            *)  encryption='psk-mixed'; nasid_suffix=''; band_snr=20;;
        esac
        
        # SSID設定（usteerモードは統一、standardは帯域別）
        suffix=${band:+-$band}
        [ "${wifi_mode}" = "usteer" ] && ssid="${wlan_ssid}" || ssid="${wlan_ssid}${suffix}"
        
        iface="default_${radio}"
        [ -n "$(uci -q get wireless.${iface})" ] && {
            SET ${iface}.disabled='0'
            SET ${iface}.encryption="${encryption}"
            SET ${iface}.ssid="${ssid}"
            SET ${iface}.key="${wlan_password}"
            
            # usteerモード時は802.11r/k/v（高速ローミング）を有効化
            [ "${wifi_mode}" = "usteer" ] && {
                SET ${iface}.isolate='1'                              # クライアント間通信禁止
                SET ${iface}.ocv='1'                                  # Operating Channel Validation
                SET ${iface}.ieee80211r='1'                           # Fast BSS Transition
                SET ${iface}.mobility_domain="${mobility_domain:-4f57}" # モビリティドメインID
                SET ${iface}.ft_over_ds='1'                          # DS経由のFT
                SET ${iface}.nasid="${wlan_ssid}${nasid_suffix}"     # NAS識別子
                SET ${iface}.usteer_min_snr="${band_snr}"            # 最低SNR閾値
                SET ${iface}.ieee80211k='1'                          # Radio Resource Management
                SET ${iface}.ieee80211v='1'                          # BSS Transition Management
            }
        }
    done
    
    # usteerデーモン設定（バンドステアリング・負荷分散）
    [ "${wifi_mode}" = "usteer" ] && {
        local SEC=usteer
        SET @usteer[0].band_steering='1'           # 5GHz帯への誘導
        SET @usteer[0].load_balancing='1'          # AP間負荷分散
        SET @usteer[0].sta_block_timeout='300'     # ブロックタイムアウト（秒）
        SET @usteer[0].min_snr='20'                # 最低SNR（全体）
        SET @usteer[0].max_snr='80'                # 最大SNR
        SET @usteer[0].signal_diff_threshold='10'  # AP切替の信号差閾値
    }
}
```

</details>

### PPPoE接続設定

<details>
<summary>connection_type: pppoe</summary>

```sh
[ "${connection_type}" = "pppoe" ] && [ -n "${pppoe_username}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    
    local SEC=network
    SET wan.proto='pppoe'                   # WANプロトコルをPPPoEに変更
    SET wan.username="${pppoe_username}"    # プロバイダユーザー名
    [ -n "${pppoe_password}" ] && 
        SET wan.password="${pppoe_password}" # プロバイダパスワード
}
```

</details>

### DS-Lite接続設定

<details>
<summary>connection_type: dslite</summary>

```sh
[ "${connection_type}" = "auto" -o "${connection_type}" = "dslite" ] && 
[ -n "${dslite_aftr_address}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    ADDLIST() { uci add_list "${SEC}${SEC:+.}" "$@"; }
    DELLIST() { uci del_list "${SEC}${SEC:+.}" "$@"; }
    
    # このセクション固有の変数
    WAN="$(uci -q get network.wan.device || echo wan)"  # WANデバイス名
    DSL="dsl"       # DS-Lite IPv4インターフェース
    DSL6="dsl6"     # DS-Lite IPv6インターフェース
    
    # WAN接続を無効化する関数
    disable_wan() {
        local SEC=network
        SET wan.disabled='1'   # WANインターフェース無効化
        SET wan.auto='0'       # 自動起動無効化
        SET wan6.disabled='1'  # WAN IPv6無効化
        SET wan6.auto='0'
    }
    
    # DHCPリレーモードを設定する関数
    dhcp_relay() {
        local SEC=dhcp
        SET $1=dhcp
        SET $1.interface="$1"
        SET $1.master='1'           # マスターモード
        SET $1.ra='relay'           # Router Advertisementリレー
        SET $1.dhcpv6='relay'       # DHCPv6リレー
        SET $1.ndp='relay'          # NDPリレー
        SET $1.ignore='1'           # DHCPサーバー機能無効
        SET lan.ra='relay'
        SET lan.dhcpv6='relay'
        SET lan.ndp='relay'
        SET lan.force='1'
    }
    
    # ファイアウォールのWANゾーンを変更する関数
    firewall_wan() {
        local SEC=firewall
        DELLIST @zone[1].network="wan"   # 既存のwan/wan6を削除
        DELLIST @zone[1].network="wan6"
        ADDLIST @zone[1].network="$1"    # 新しいインターフェースを追加
        ADDLIST @zone[1].network="$2"
        SET @zone[1].masq='1'            # NATマスカレード有効化
        SET @zone[1].mtu_fix='1'         # MTU自動調整有効化
    }
    
    local SEC=network
    disable_wan  # 既存WAN設定を無効化
    
    # IPv6接続（DHCPv6）
    SET ${DSL6}=interface
    SET ${DSL6}.proto='dhcpv6'
    SET ${DSL6}.device="${WAN}"
    SET ${DSL6}.reqaddress='try'    # IPv6アドレス取得試行
    SET ${DSL6}.reqprefix='auto'    # プレフィックス委譲自動
    
    # DS-Liteトンネル（IPv4 over IPv6）
    SET ${DSL}=interface
    SET ${DSL}.proto='dslite'
    SET ${DSL}.peeraddr="${dslite_aftr_address}" # AFTRアドレス（例: dgw.xpass.jp）
    SET ${DSL}.tunlink="${DSL6}"                 # IPv6インターフェースをリンク
    SET ${DSL}.mtu='1460'                        # MTU値（トンネルオーバーヘッド考慮）
    SET ${DSL}.encaplimit='ignore'               # Encapsulation Limitを無視
    
    dhcp_relay "${DSL6}"           # DHCPリレー設定
    firewall_wan "${DSL}" "${DSL6}" # ファイアウォールゾーン変更
}
```

</details>

### MAP-E接続設定

<details>
<summary>connection_type: mape</summary>
```sh
[ "${connection_type}" = "auto" -o "${connection_type}" = "mape" ] && 
[ -n "${mape_br}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    ADDLIST() { uci add_list "${SEC}${SEC:+.}" "$@"; }
    DELLIST() { uci del_list "${SEC}${SEC:+.}" "$@"; }
    
    # このセクション固有の変数
    WAN="$(uci -q get network.wan.device || echo wan)"  # WANデバイス名
    MAPE="mape"     # MAP-E IPv4インターフェース
    MAPE6="mape6"   # MAP-E IPv6インターフェース
    
    # WAN接続を無効化する関数
    disable_wan() {
        local SEC=network
        SET wan.disabled='1'
        SET wan.auto='0'
        SET wan6.disabled='1'
        SET wan6.auto='0'
    }
    
    # DHCPリレーモードを設定する関数
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
    
    # ファイアウォールのWANゾーンを変更する関数
    firewall_wan() {
        local SEC=firewall
        DELLIST @zone[1].network="wan"
        DELLIST @zone[1].network="wan6"
        ADDLIST @zone[1].network="$1"
        ADDLIST @zone[1].network="$2"
        SET @zone[1].masq='1'
        SET @zone[1].mtu_fix='1'
    }
    
    local SEC=network
    disable_wan
    
    # IPv6接続
    SET ${MAPE6}=interface
    SET ${MAPE6}.proto='dhcpv6'
    SET ${MAPE6}.device="${WAN}"
    SET ${MAPE6}.reqaddress='try'
    SET ${MAPE6}.reqprefix='auto'
    
    # MAP-Eトンネル
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

    # Static IPv6プレフィックス設定
    [ -n "${ip6prefix_static}" ] && SET ${MAPE6}.ip6prefix="${ip6prefix_static}"
    
    dhcp_relay "${MAPE6}"
    firewall_wan "${MAPE}" "${MAPE6}"
    
    # map.shスクリプトのパッチ適用（日本IPv6 IPoE対応）
    MAPSH="/lib/netifd/proto/map.sh"
    HASH0="431ad78fc976b70c53cdc5adc4e09b3eb91fd97f"
    HASH1="7f0682eeaf2dd7e048ff1ad1dbcc5b913ceb8de4"
    HASH="$(sha1sum "$MAPSH" | awk '{print $1}')"
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
    [ "$HASH" = "$HASH0" ] && {
        cp "$MAPSH" "$MAPSH".old
        sed -i 's/#export LEGACY=1/export LEGACY=1/' "$MAPSH"
        sed -i 's/json_add_boolean connlimit_ports 1/json_add_string connlimit_ports "1"/' "$MAPSH"
    }
}
```

</details>

### Webターミナル有効化

<details>
<summary>enable_ttyd</summary>
```sh
[ -n "${enable_ttyd}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    
    local SEC=ttyd
    SET @ttyd[0].command='/bin/login -f root'
}
```

</details>

### アクセスポイントモード設定

<details>
<summary>connection_type: ap</summary>

```sh
[ "${connection_type}" = "ap" ] && [ -n "${ap_ip_address}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    
    # このセクション固有の変数
    LAN="$(uci -q get network.lan.device || echo lan)"  # LANデバイス名
    AP="ap"         # アクセスポイントモードIPv4
    AP6="ap6"       # アクセスポイントモードIPv6
    
    # WAN接続を無効化する関数
    disable_wan() {
        local SEC=network
        SET wan.disabled='1'
        SET wan.auto='0'
        SET wan6.disabled='1'
        SET wan6.auto='0'
    }
    
    disable_wan  # WAN機能を無効化
    
    {
        local SEC=network
        # LANブリッジに静的IPを設定
        SET ${AP}=interface
        SET ${AP}.proto='static'
        SET ${AP}.device="${LAN}"
        SET ${AP}.ipaddr="${ap_ip_address}"     # AP自身のIPアドレス
        SET ${AP}.netmask='255.255.255.0'
        SET ${AP}.gateway="${ap_gateway}"       # 上位ルーターのIP
        SET ${AP}.dns="${ap_gateway}"           # DNS（上位ルーター）
        SET ${AP}.delegate='0'                  # プレフィックス委譲無効
        
        # IPv6（DHCPv6クライアント）
        SET ${AP6}=interface
        SET ${AP6}.proto='dhcpv6'
        SET ${AP6}.device="@${AP}"              # AP interfaceをリンク
        SET ${AP6}.reqaddress='try'
        SET ${AP6}.reqprefix='no'               # プレフィックス要求なし
    }
    
    {
        local SEC=wireless
        # 全無線インターフェースをAPネットワークに接続
        for r in 0 1 2; do
            [ -n "$(uci -q get wireless.default_radio$r)" ] && 
                SET default_radio$r.network="${AP}"
        done
    }
    
    # ルーター機能を完全無効化
    [ -x /etc/init.d/odhcpd ] && /etc/init.d/odhcpd disable   # DHCPv6サーバー停止
    [ -x /etc/init.d/dnsmasq ] && /etc/init.d/dnsmasq disable # DHCP/DNSサーバー停止
    uci -q delete firewall                                     # ファイアウォール削除
    [ -x /etc/init.d/firewall ] && /etc/init.d/firewall disable
}
```

</details>

### Webターミナル有効化

<details>
<summary>enable_ttyd</summary>

```sh
[ -n "${enable_ttyd}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    
    local SEC=ttyd
    SET @ttyd[0].ipv6='1'                     # IPv6対応
    SET @ttyd[0].command='/bin/login -f root' # rootで自動ログイン
}
```

</details>

### IRQバランサー有効化

<details>
<summary>enable_irqbalance</summary>

```sh
[ -n "${enable_irqbalance}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    
    local SEC=irqbalance
    SET irqbalance=irqbalance
    SET irqbalance.enabled='1'  # IRQ割り込みを複数CPUに分散
}
```

</details>

### Sambaファイル共有設定

<details>
<summary>enable_samba4</summary>

```sh
[ -n "${enable_samba4}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    
    # このセクション固有の変数
    NAS="openwrt"   # Samba共有名
    MNT="/mnt/sda"  # マウントポイント
    
    local SEC=samba4
    SET @samba[0]=samba
    SET @samba[0].workgroup='WORKGROUP'              # ワークグループ名
    SET @samba[0].charset='UTF-8'                    # 文字コード
    SET @samba[0].description='Samba on OpenWRT'     # サーバー説明
    SET @samba[0].enable_extra_tuning='1'            # パフォーマンスチューニング有効
    SET @samba[0].interface='lan'                    # LANインターフェースのみ
    
    # 共有設定
    SET sambashare=sambashare
    SET sambashare.name="${NAS}"                     # 共有名（openwrt）
    SET sambashare.path="${MNT}"                     # 共有パス（/mnt/sda）
    SET sambashare.read_only='no'                    # 読み書き可能
    SET sambashare.force_root='1'                    # 全アクセスをrootとして扱う
    SET sambashare.guest_ok='yes'                    # ゲストアクセス許可
    SET sambashare.inherit_owner='yes'               # 所有者継承
    SET sambashare.create_mask='0777'                # ファイル作成時パーミッション
    SET sambashare.dir_mask='0777'                   # ディレクトリ作成時パーミッション
}
```

</details>

### 広告ブロック設定

<details>
<summary>enable_adblock_fast</summary>

```sh
[ -n "${enable_adblock_fast}" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    
    local SEC=adblock-fast
    SET config.enabled='1'              # 広告ブロック有効化
    SET config.procd_trigger_wan6='1'   # IPv6接続時もトリガー
    
    # Tofukkoフィルター追加（日本向け広告ブロックリスト）
    [ -n "${enable_tofukko_filter}" ] && {
        local IDX=$(uci add "$SEC" file_url)
        SET "$IDX".name='Tofukko Filter'
        SET "$IDX".url='https://raw.githubusercontent.com/tofukko/filter/master/Adblock_Plus_list.txt'
        SET "$IDX".action='block'
        SET "$IDX".enabled='1'
    }
}
```

</details>

### USB RNDIS有効化

<details>
<summary>enable_usb_rndis</summary>

```sh
[ -n "${enable_usb_rndis}" ] && {
    # UCI操作用ヘルパー関数
    ADDLIST() { uci add_list "${SEC}${SEC:+.}" "$@"; }
    
    # USBテザリング用カーネルモジュールを自動読込
    printf '%s\n%s\n' "rndis_host" "cdc_ether" > /etc/modules.d/99-usb-net
    local SEC=network
    ADDLIST @device[0].ports='usb0'  # LANブリッジにusb0を追加
}
```

</details>

### USB Gadgetモード設定

<details>
<summary>enable_usb_gadget</summary>

```sh
[ -n "${enable_usb_gadget}" ] && [ -d /boot ] && {
    # UCI操作用ヘルパー関数
    ADDLIST() { uci add_list "${SEC}${SEC:+.}" "$@"; }
    
    # Raspberry Pi config.txtにdwc2オーバーレイ追加
    echo 'dtoverlay=dwc2' >> /boot/config.txt
    # カーネルコマンドラインにモジュール読込指定
    sed -i 's/\(root=[^ ]*\)/\1 modules-load=dwc2,g_ether/' /boot/cmdline.txt
    # カーネルモジュール設定
    printf '%s\n%s\n' "dwc2" "g_ether" > /etc/modules.d/99-gadget
    local SEC=network
    ADDLIST @device[0].ports='usb0'  # LANブリッジにusb0を追加
}
```

</details>

### ネットワーク最適化設定

<details>
<summary>net_optimizer</summary>

```sh
[ -n "${net_optimizer}" ] && [ "${net_optimizer}" != "disabled" ] && {
    # このセクション固有の変数
    MEM=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)  # 搭載メモリ(MB)
    C=/etc/sysctl.d/99-net-opt.conf
    P=$(grep -c ^processor /proc/cpuinfo)  # CPU数を取得
    
    # autoモード：メモリ量に応じて自動調整
    [ "${net_optimizer}" = "auto" ] && {
        if   [ $MEM -ge 2400 ]; then R=16777216 W=16777216 TR="4096 262144 16777216" TW=$TR CT=262144 NB=5000 SC=16384
        elif [ $MEM -ge 1200 ]; then R=8388608  W=8388608  TR="4096 131072 8388608"  TW=$TR CT=131072 NB=2500 SC=8192
        elif [ $MEM -ge  400 ]; then R=4194304  W=4194304  TR="4096 65536  4194304"  TW=$TR CT=65536  NB=1000 SC=4096
        fi
        # CPU数に応じてバッファ調整
        [ $P -gt 4 ] && { NB=$((NB*2));   SC=$((SC*2)); }
        [ $P -gt 2 ] && [ $P -le 4 ] && { NB=$((NB*3/2)); SC=$((SC*3/2)); }
        CONG=cubic
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
        CONG="${netopt_congestion:-cubic}"
    }
    
    # sysctl設定ファイルを生成・適用
    printf "net.core.rmem_max=%s\nnet.core.wmem_max=%s\nnet.ipv4.tcp_rmem=%s\nnet.ipv4.tcp_wmem=%s\nnet.ipv4.tcp_congestion_control=%s\nnet.ipv4.tcp_fastopen=3\nnet.netfilter.nf_conntrack_max=%s\nnet.core.netdev_max_backlog=%s\nnet.core.somaxconn=%s\n" \
    "$R" "$W" "$TR" "$TW" "$CONG" "$CT" "$NB" "$SC" > "$C"
    sysctl -p "$C"
}
```

</details>

### DNSキャッシュ最適化

<details>
<summary>enable_dnsmasq</summary>

```sh
[ -n "${enable_dnsmasq}" ] && [ "${enable_dnsmasq}" != "disabled" ] && {
    # UCI操作用ヘルパー関数
    SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
    
    # このセクション固有の変数
    MEM=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)  # 搭載メモリ(MB)
    
    local SEC=dhcp
    
    # autoモード：メモリ量に応じてキャッシュサイズを自動設定
    [ "${enable_dnsmasq}" = "auto" ] && {
        if   [ "$MEM" -ge 800 ]; then CACHE_SIZE=10000
        elif [ "$MEM" -ge 400 ]; then CACHE_SIZE=5000
        elif [ "$MEM" -ge 200 ]; then CACHE_SIZE=1000
        fi
        NEG_CACHE=1  # ネガティブキャッシュ有効化
    }
    
    # manualモード：ユーザー指定値を使用
    [ "${enable_dnsmasq}" = "manual" ] && {
        CACHE_SIZE="${dnsmasq_cache}"
        NEG_CACHE="${dnsmasq_negcache}"
    }
    
    SET @dnsmasq[0].cachesize="${CACHE_SIZE}"      # DNSキャッシュサイズ
    SET @dnsmasq[0].nonegcache="${NEG_CACHE}"      # ネガティブキャッシュ（0=無効、1=有効）
}
```

</details>

### SDカードリサイズ

<details>
<summary>enable_sd_resize</summary>

```sh
[ -n "${enable_sd_resize}" ] && {
    :  # 将来の実装用プレースホルダー
}
```

</details>

### AdGuard Home設定

<details>
<summary>enable_adguardhome</summary>
    
```sh
[ -n "${enable_adguardhome}" ] && {
    # このセクション固有の変数
    MEM=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)  # 搭載メモリ(MB)
    FLASH=$(df -k / | awk 'NR==2 {print int($4/1024)}')        # 空きフラッシュ(MB)
    AGH_MIN_MEM="${agh_min_memory:-20}"                        # 最小メモリ要件
    AGH_MIN_FLASH="${agh_min_flash:-25}"                       # 最小ストレージ要件
    
    # リソースチェック
    if [ "$MEM" -ge "$AGH_MIN_MEM" ] && [ "$FLASH" -ge "$AGH_MIN_FLASH" ]; then
        # UCI操作用ヘルパー関数
        SET() { uci -q set "${SEC}${SEC:+.}" "$@"; }
        DEL() { uci -q delete "${SEC}${SEC:+.}" "$@"; }
        ADDLIST() { uci add_list "${SEC}${SEC:+.}" "$@"; }
        
        agh_yaml="/etc/adguardhome.yaml"
        cfg_dhcp="/etc/config/dhcp"
        cfg_fw="/etc/config/firewall"
        
        # 設定ファイルのバックアップ
        cp "$cfg_dhcp" "$cfg_dhcp.adguard.bak"
        cp "$cfg_fw" "$cfg_fw.adguard.bak"
        
        # htpasswdでパスワードハッシュ生成
        agh_hash=$(htpasswd -B -n -b "" "${agh_pass}" 2>/dev/null | cut -d: -f2)
        [ -z "$agh_hash" ] && { echo "Error: Failed to generate password hash"; exit 1; }
        
        # AdGuard Home設定ファイル生成（/etc/adguardhome.yaml）
        # - Webポート: ${agh_web_port}
        # - DNSポート: ${agh_dns_port}
        # - DNSバックアップポート: ${agh_dns_backup_port} (LANドメイン用)
        # - 上流DNS: DoH/DoT/DoQ対応プロバイダ
        # - ローカルドメイン(.lan)はdnsmasqに転送
        
        # dnsmasqをDNS転送モードに変更
        local SEC=dhcp
        SET @dnsmasq[0].noresolv='1'                    # resolv.conf無視
        SET @dnsmasq[0].cachesize='0'                   # キャッシュ無効化
        SET @dnsmasq[0].rebind_protection='0'           # リバインド保護無効
        SET @dnsmasq[0].port="${agh_dns_backup_port}"   # バックアップポート待受
        SET @dnsmasq[0].domain='lan'                    # LANドメイン設定
        SET @dnsmasq[0].local='/lan/'                   # ローカルドメイン処理
        SET @dnsmasq[0].expandhosts='1'                 # ホスト名展開
        DEL @dnsmasq[0].server                          # 既存DNS削除
        ADDLIST @dnsmasq[0].server="127.0.0.1#${agh_dns_port}"
        ADDLIST @dnsmasq[0].server="::1#${agh_dns_port}"
        
        # DHCPでLAN IPアドレスをDNSサーバーとして配布
        DEL lan.dhcp_option
        [ -n "${lan_ip_address}" ] && ADDLIST lan.dhcp_option="6,${lan_ip_address}"
        DEL lan.dhcp_option6
        
        # ファイアウォールにDNSリダイレクトルール追加
        local SEC=firewall
        agh_rule="adguardhome_dns_${agh_dns_port}"
        DEL "${agh_rule}" 2>/dev/null || true
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
    else
        # リソース不足の場合はサービス停止
        /etc/init.d/adguardhome stop 2>/dev/null
        /etc/init.d/adguardhome disable 2>/dev/null
    fi
}
```

</details>

### htpasswd抽出

<details>
<summary>enable_htpasswd</summary>

```sh
[ -n "${enable_htpasswd}" ] && {
    # このセクション固有の変数
    MEM=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
    FLASH=$(df -k / | awk 'NR==2 {print int($4/1024)}')
    AGH_MIN_MEM="${agh_min_memory:-20}"
    AGH_MIN_FLASH="${agh_min_flash:-25}"
    PACKAGE_MANAGER="$(command -v apk >/dev/null 2>&1 && echo apk || echo opkg)"
    
    # AdGuard Home用にリソースが十分な場合のみ実行
    if [ "$MEM" -ge "$AGH_MIN_MEM" ] && [ "$FLASH" -ge "$AGH_MIN_FLASH" ]; then
        # apache_keep変数が設定されていない場合のみhtpasswdを抽出
        [ -z "${apache_keep}" ] && {
            htpasswd_bin="/usr/bin/htpasswd"
            htpasswd_libs="/usr/lib/libapr*.so* /usr/lib/libexpat.so* /usr/lib/libuuid.so*"
            tmp_libs="/tmp/libapr*.so* /tmp/libexpat.so* /tmp/libuuid.so*"
            
            # htpasswdバイナリと依存ライブラリを一時退避
            [ -f "$htpasswd_bin" ] && cp "$htpasswd_bin" /tmp/htpasswd
            for lib in $htpasswd_libs; do
                [ -f "$lib" ] && cp "$lib" /tmp/
            done
            
            # Apacheパッケージを削除
            case "$PACKAGE_MANAGER" in
                opkg) opkg remove apache >/dev/null 2>&1 || true ;;
                apk) apk del apache >/dev/null 2>&1 || true ;;
            esac
            
            # htpasswdとライブラリを復元
            mv /tmp/htpasswd "$htpasswd_bin"
            chmod +x "$htpasswd_bin"
            for lib in $tmp_libs; do
                [ -f "$lib" ] && mv "$lib" /usr/lib/
            done
        }
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
uci commit 2>/dev/null

# バックアップパスが指定されている場合、設定をバックアップ
[ -n "${backup_path}" ] && sysupgrade -q -k -b "${backup_path}"

echo "All done!"
exit 0
```

</details>
