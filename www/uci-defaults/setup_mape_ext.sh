#!/bin/sh
# MAP-Eポートセット拡張スクリプト (OpenWrt 19.07 用)
# 全ポートセットを有効活用するための設定

echo "=== MAP-Eポートセット拡張設定開始 ==="

# 1. 必要モジュールの確認
opkg update
opkg install iptables-mod-ipopt

# 2. MAPパラメータ取得
API_RESPONSE="$(wget -qO- https://auto-config.site-u.workers.dev/)"
PSID=$(echo "$API_RESPONSE" | jsonfilter -e '@.mape.psid')
PSIDLEN=$(echo "$API_RESPONSE" | jsonfilter -e '@.mape.psidlen')

# units = 2^PSIDLEN
UNITS=$((1 << PSIDLEN))

# ポートセット幅
PORT_SET_WIDTH=16

echo "PSID=$PSID, PSIDLEN=$PSIDLEN, UNITS=$UNITS"

# 3. LANのIPv4アドレス取得
. /lib/functions/network.sh
network_get_ipaddr LAN_IP4 lan

# 4. MAP-Eインターフェース自動検出
TUNDEV=$(ip -o link show | grep 'map-' | awk '{print $2}' | cut -d@ -f1 | head -n 1)
TUNDEV=${TUNDEV:-mape6}

echo "LAN IPv4: $LAN_IP4"
echo "TUNDEV: $TUNDEV"

# 5. firewall.user バックアップ
[ -f /etc/firewall.user ] && cp /etc/firewall.user /etc/firewall.user.bak_$(date +%Y%m%d)

# 6. 新しいルール書き込み
cat > /etc/firewall.user << EOF
# MAP-E Port Set Expansion (全ポートセット活用)

. /lib/functions/network.sh
network_get_ipaddr IP4 lan
TUNDEV='$TUNDEV'
PSID=$PSID
PORT_SET_WIDTH=$PORT_SET_WIDTH
UNITS=$UNITS

rule=1
while [ \$rule -le \$UNITS ]; do
    mark=\$(expr \$rule + 16)
    pn=\$(expr \$rule - 1)
    portl=\$(expr \$rule \\* 4096 + \$PSID \\* \$PORT_SET_WIDTH)
    portr=\$(expr \$portl + \$(expr \$PORT_SET_WIDTH - 1))

    # TCPのみをstatisticで分散
    iptables -t nat -A PREROUTING -p tcp -m statistic --mode nth --every \$UNITS --packet \$pn -j MARK --set-mark \$mark
    iptables -t nat -A OUTPUT -p tcp -m statistic --mode nth --every \$UNITS --packet \$pn -j MARK --set-mark \$mark

    # マークごとのSNAT（TCP）
    iptables -t nat -A POSTROUTING -p tcp -o \$TUNDEV -m mark --mark \$mark -j SNAT --to \$IP4:\$portl-\$portr

    # ICMP/UDPは全ポートセットでSNAT
    iptables -t nat -A POSTROUTING -p icmp -o \$TUNDEV -j SNAT --to \$IP4:\$portl-\$portr
    iptables -t nat -A POSTROUTING -p udp -o \$TUNDEV -j SNAT --to \$IP4:\$portl-\$portr

    rule=\$(expr \$rule + 1)
done
EOF

# 7. ファイアウォール再起動
/etc/init.d/firewall restart

echo "設定完了。動作確認をお願いします。"
echo "確認コマンド例: iptables -t nat -L -v -n"
