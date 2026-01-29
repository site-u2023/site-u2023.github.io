#!/bin/sh
# MAP-Eポートセット拡張スクリプト (OpenWrt 19.07 用)
# 全ポートセットを有効活用するための設定

echo "=== MAP-Eポートセット拡張設定開始 ==="

# 1. 必要モジュールの確認
opkg update
opkg install iptables-mod-ipopt

# 2. firewall.user バックアップ
[ -f /etc/firewall.user ] && cp /etc/firewall.user /etc/firewall.user.bak_$(date +%Y%m%d)

# 3. 新しいルール書き込み
cat > /etc/firewall.user << 'EOF'
# MAP-E Port Set Expansion (全ポートセット活用)

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

rule=0
while [ $rule -le 15 ]; do
    mark=$((rule + 16))
    pn=$rule
    portl=$((PSID * PORT_SET_WIDTH + rule * PORTS_PER_RULE))
    portr=$((portl + PORTS_PER_RULE - 1))

    # TCPのみをstatisticで分散
    iptables -t nat -A PREROUTING -p tcp -m statistic --mode nth --every 16 --packet $pn -j MARK --set-mark $mark
    iptables -t nat -A OUTPUT -p tcp -m statistic --mode nth --every 16 --packet $pn -j MARK --set-mark $mark

    # マークごとのSNAT（TCP）
    iptables -t nat -A POSTROUTING -p tcp -o $TUNDEV -m mark --mark $mark -j SNAT --to $NET_ADDR:$portl-$portr

    # ICMP/UDPは全ポートセットでSNAT
    iptables -t nat -A POSTROUTING -p icmp -o $TUNDEV -j SNAT --to $NET_ADDR:$portl-$portr
    iptables -t nat -A POSTROUTING -p udp -o $TUNDEV -j SNAT --to $NET_ADDR:$portl-$portr

    rule=$((rule + 1))
done
EOF

# 4. ファイアウォール再起動
/etc/init.d/firewall restart

echo "設定完了。動作確認をお願いします。"
echo "確認コマンド例: iptables -t nat -L -v -n"
