#!/bin/sh
# MAP-Eポートセット拡張スクリプト (OpenWrt 19.07 用)
# ニチバン問題対策 - 全ポートセットを有効活用

echo "=== MAP-Eポートセット拡張設定開始 ==="

# firewall.user バックアップ
[ -f /etc/firewall.user ] && cp /etc/firewall.user /etc/firewall.user.bak_$(date +%Y%m%d)

# === 新しいルール書き込み ===
cat > /etc/firewall.user << 'EOF'
# MAP-E Port Set Expansion (ニチバン対策完全版)

# MAPパラメータ取得
API_RESPONSE="$(wget -qO- https://auto-config.site-u.workers.dev/)"
PSID=$(echo "$API_RESPONSE" | jsonfilter -e '@.mape.psid')
PSIDLEN=$(echo "$API_RESPONSE" | jsonfilter -e '@.mape.psidlen')
OFFSET=$(echo "$API_RESPONSE" | jsonfilter -e '@.mape.psIdOffset')

# units = 2^PSIDLEN
UNITS=$((1 << PSIDLEN))

# ポートセット幅（動的に計算）
PORT_SET_WIDTH=$((65536 / UNITS))
PORTS_PER_RULE=$((PORT_SET_WIDTH / 16))

# インターフェース自動検出
LANDEV=$(uci -q get network.lan.ifname || echo br-lan)
WAN6DEV=$(ip -o link show | grep -E '@(eth|wan)' | grep -v 'map-' | awk '{print $2}' | cut -d@ -f1 | head -n1)
TUNDEV=$(ip -o link show | grep 'map-' | awk '{print $2}' | cut -d@ -f1 | head -n1)

# WANのIPv4アドレス取得
. /lib/functions/network.sh
network_flush_cache
network_find_wan NET_IF
network_get_ipaddr IP4 "${NET_IF}"

# NAT テーブルクリア
iptables -t nat -F PREROUTING
iptables -t nat -F OUTPUT
iptables -t nat -F POSTROUTING

# ポートセットごとにルール生成
rule=1
while [ $rule -le $UNITS ]; do
    mark=$((rule + 16))
    pn=$((rule - 1))
    portl=$((PSID * PORT_SET_WIDTH + OFFSET + rule * PORTS_PER_RULE))
    portr=$((portl + PORTS_PER_RULE - 1))

    # TCP: statisticで分散してMARK
    iptables -t nat -A PREROUTING -p tcp -m statistic --mode nth --every $UNITS --packet $pn -j MARK --set-mark $mark
    iptables -t nat -A OUTPUT -p tcp -m statistic --mode nth --every $UNITS --packet $pn -j MARK --set-mark $mark

    # POSTROUTING: プロトコル別にSNAT
    iptables -t nat -A POSTROUTING -p icmp -m connlimit --connlimit-daddr --connlimit-upto $PORTS_PER_RULE --connlimit-mask 0 -o $TUNDEV -j SNAT --to $IP4:$portl-$portr
    iptables -t nat -A POSTROUTING -p tcp -o $TUNDEV -m mark --mark $mark -j SNAT --to $IP4:$portl-$portr
    iptables -t nat -A POSTROUTING -p udp -m connlimit --connlimit-daddr --connlimit-upto $PORTS_PER_RULE --connlimit-mask 0 -o $TUNDEV -j SNAT --to $IP4:$portl-$portr

    rule=$((rule + 1))
done

sleep 5

# zone チェーン復元
iptables -t nat -A PREROUTING -i $LANDEV -j zone_lan_prerouting
iptables -t nat -A PREROUTING -i $WAN6DEV -j zone_wan_prerouting
iptables -t nat -A PREROUTING -i $TUNDEV -j zone_wan_prerouting

iptables -t nat -A POSTROUTING -o $LANDEV -j zone_lan_postrouting
iptables -t nat -A POSTROUTING -o $WAN6DEV -j zone_wan_postrouting
iptables -t nat -A POSTROUTING -o $TUNDEV -j zone_wan_postrouting

echo "MAP-Eポートセット拡張ルール適用完了（全${UNITS}ポートセット活用）"
EOF

# ホットプラグスクリプト作成
cat > /etc/hotplug.d/iface/99-mape-portset << 'EOF'
#!/bin/sh

# ifupイベントのみ処理
[ "$ACTION" = "ifup" ] || exit 0

# MAP-Eインターフェース判定（DEVICEが map- で始まる）
case "$DEVICE" in
    map-*)
        ;;
    *)
        exit 0
        ;;
esac

# /etc/firewall.user を実行
. /etc/firewall.user
EOF

chmod +x /etc/hotplug.d/iface/99-mape-portset

# ファイアウォール再起動
/etc/init.d/firewall restart

echo "設定完了。"

ping -c 3 8.8.8.8
iptables -t nat -L POSTROUTING -n -v --line-numbers | head -20
iptables -t nat -L zone_wan_postrouting -n -v
