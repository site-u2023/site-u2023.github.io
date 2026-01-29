#!/bin/sh
# MAP-Eポートセット拡張スクリプト (OpenWrt 19.07 用)
# 全ポートセットを有効活用するための設定

echo "=== MAP-Eポートセット拡張設定開始 ==="

# firewall.user バックアップ
[ -f /etc/firewall.user ] && cp /etc/firewall.user /etc/firewall.user.bak_$(date +%Y%m%d)

# 必要モジュールの確認
opkg update
opkg install iptables-mod-ipopt

# === ubus生成のMAP-E natルールを削除 ===
echo "既存のubus生成MAP-Eルールを削除中..."

# POSTROUTING の ubus:mape ルールを全削除（逆順で番号ズレ防止）
iptables -t nat -L POSTROUTING --line-numbers -n | \
    grep 'ubus:mape\[map\]' | \
    awk '{print $1}' | \
    sort -rn | \
    while read linenum; do
        iptables -t nat -D POSTROUTING $linenum && echo "  削除: POSTROUTING ルール#$linenum"
    done

echo "既存ルール削除完了"

# === WAN zone の MASQUERADE は有効のまま（共存方式） ===
echo "MASQUERADE との共存モードで動作します"

# === 新しいルール書き込み ===
cat > /etc/firewall.user << 'EOF'
# MAP-E Port Set Expansion (全ポートセット活用 - MASQUERADE共存版)

# ubus生成のMAP-E natルールを削除（冪等性確保）
echo "ubus生成MAP-Eルールをクリア中..."
iptables -t nat -L POSTROUTING --line-numbers -n | \
    grep 'ubus:mape\[map\]' | \
    awk '{print $1}' | \
    sort -rn | \
    while read linenum; do
        iptables -t nat -D POSTROUTING $linenum 2>/dev/null
    done

# MAPパラメータ取得
API_RESPONSE="$(wget -qO- https://auto-config.site-u.workers.dev/)"
PSID=$(echo "$API_RESPONSE" | jsonfilter -e '@.mape.psid')
PSIDLEN=$(echo "$API_RESPONSE" | jsonfilter -e '@.mape.psidlen')

# units = 2^PSIDLEN
UNITS=$((1 << PSIDLEN))

# ポートセット幅（動的に計算）
PORT_SET_WIDTH=$((65536 / UNITS))
PORTS_PER_RULE=$((PORT_SET_WIDTH / 16))

# MAP-Eインターフェース自動検出
TUNDEV=$(ip -o link show | grep 'map-' | awk '{print $2}' | cut -d@ -f1 | head -n 1)
TUNDEV=${TUNDEV:-map-mape}

# WANのIPv4アドレス取得
. /lib/functions/network.sh
network_flush_cache
network_find_wan NET_IF
network_get_ipaddr NET_ADDR "${NET_IF}"

# 既存のpostrouting_wan_ruleチェーンをクリア
iptables -t nat -F postrouting_wan_rule 2>/dev/null

rule=0
while [ $rule -le 15 ]; do
    mark=$((rule + 16))
    pn=$rule
    portl=$((PSID * PORT_SET_WIDTH + rule * PORTS_PER_RULE))
    portr=$((portl + PORTS_PER_RULE - 1))

    # TCPのみをstatisticで分散（全パケットにマーク）
    iptables -t nat -A PREROUTING -p tcp -m statistic --mode nth --every 16 --packet $pn -j MARK --set-mark $mark
    iptables -t nat -A OUTPUT -p tcp -m statistic --mode nth --every 16 --packet $pn -j MARK --set-mark $mark

    # マークされたTCPパケットのみSNAT（MASQUERADEと共存）
    iptables -t nat -A postrouting_wan_rule -p tcp -m mark --mark $mark -j SNAT --to $NET_ADDR:$portl-$portr

    rule=$((rule + 1))
done

# ICMP/UDPはMASQUERADEに任せる（デフォルト動作）

echo "MAP-Eポートセット拡張ルール適用完了（MASQUERADE共存モード）"
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
iptables -t nat -L postrouting_wan_rule -n -v
