#!/bin/sh
# MAP-Eポートセット分散スクリプト (OpenWrt 19.07 用・ニチバン対策)
# 注意: iptables-mod-ipopt と iptables-mod-statistic が必須

echo "=== MAP-Eポートセット拡張設定開始 ==="

# 1. 必要モジュールの確認
opkg update
opkg install iptables-mod-ipopt iptables-mod-statistic

# 2. MAPパラメータ取得（お使いのAPI）
API_RESPONSE="$(wget -qO- https://auto-config.site-u.workers.dev/)"
PSID=$(echo "$API_RESPONSE" | jsonfilter -e '@.mape.calculatedOffset')
PSIDLEN=$(echo "$API_RESPONSE" | jsonfilter -e '@.mape.psidlen')

# units = 2^PSIDLEN
UNITS=$(expr \( 1 "<<" "$PSIDLEN" \) - 1)

# ポートセット幅（事業者により16 or 8など。v6プラス系は16が多い）
PORT_SET_WIDTH=16

echo "PSID=$PSID, PSIDLEN=$PSIDLEN, UNITS=$UNITS"

# 3. firewall.user バックアップ
[ -f /etc/firewall.user ] && cp /etc/firewall.user /etc/firewall.user.bak_$(date +%Y%m%d)

# 4. 新しいルール書き込み
cat > /etc/firewall.user << 'EOF'
# MAP-E Port Set Expansion (ニチバン対策)

. /lib/functions/network.sh
network_get_ipaddr IP4 lan
TUNDEV='mape6'           # 実際のインターフェース名に合わせて変更

# 重要: 既存ルールを消去せず、必要なマーク・SNATだけ追加

rule=1
while [ $rule -le $UNITS ]; do
    mark=$(expr $rule + 16)
    pn=$(expr $rule - 1)
    portl=$(expr $rule \* 4096 + $PSID \* $PORT_SET_WIDTH)
    portr=$(expr $portl + $(expr $PORT_SET_WIDTH - 1))

    # TCPのみをstatisticで分散（これが最も効果的）
    iptables -t nat -A PREROUTING -p tcp -m statistic --mode nth --every $UNITS --packet $pn -j MARK --set-mark $mark
    iptables -t nat -A OUTPUT     -p tcp -m statistic --mode nth --every $UNITS --packet $pn -j MARK --set-mark $mark

    # マークごとのSNAT（TCP）
    iptables -t nat -A POSTROUTING -p tcp -o $TUNDEV -m mark --mark $mark -j SNAT --to $IP4:$portl-$portr

    # ICMP/UDPは簡易的に全ポートセットでSNAT（コネクション数制限を外すのが無難）
    iptables -t nat -A POSTROUTING -p icmp -o $TUNDEV -j SNAT --to $IP4:$portl-$portr
    iptables -t nat -A POSTROUTING -p udp  -o $TUNDEV -j SNAT --to $IP4:$portl-$portr

    rule=$(expr $rule + 1)
done

# 必要に応じて既存のMASQUERADEが後ろに残るよう、順序を意識
EOF

# 5. ファイアウォール再起動
/etc/init.d/firewall restart

echo "設定完了。動作確認をお願いします。"
echo "確認コマンド例: iptables -t nat -L -v -n"
