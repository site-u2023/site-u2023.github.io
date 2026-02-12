#!/bin/sh
# ========================================
# ニチバン対策 (19.07用)
# ========================================
set -e
rm -f /etc/firewall.user
rm -f /etc/hotplug.d/iface/99-nichibann
cat > /etc/hotplug.d/iface/99-nichibann << 'EOF'
#!/bin/sh
[ "$ACTION" = "ifup" ] || exit 0

logger -t nichibann "=== 開始: $INTERFACE ==="

[[ "$INTERFACE" == *"6"* || "$INTERFACE" == *"_"* ]] && exit 0
PROTO=$(uci get network.$INTERFACE.proto 2>&-)
[ "$PROTO" = "map" ] || exit 0

logger -t nichibann "MAP-Eインターフェース検出"

MAPE_IF="$INTERFACE"
MAPE6_IF=$(uci get network.$MAPE_IF.tunlink 2>&-)
[ -z "$MAPE6_IF" ] && exit 1

sleep 5

. /lib/functions/network.sh

logger -t nichibann "API呼び出し開始"
API_RESPONSE="$(wget -6 --no-check-certificate --timeout=10 -qO- https://auto-config.site-u.workers.dev/ 2>&1)"
WGET_EXIT=$?

if [ $WGET_EXIT -ne 0 ]; then
    logger -t nichibann "API失敗: exit=$WGET_EXIT msg=$API_RESPONSE"
    exit 1
fi

logger -t nichibann "API成功"

# 以降は元のコードと同じ
MAPE_PSID="$(echo "$API_RESPONSE" | jsonfilter -e '@.mape.psid')"
MAPE_PSIDLEN="$(echo "$API_RESPONSE" | jsonfilter -e '@.mape.psidlen')"
MAPE_PSIDOFFSET="$(echo "$API_RESPONSE" | jsonfilter -e '@.mape.psIdOffset')"
[ -z "$MAPE_PSID" ] || [ -z "$MAPE_PSIDLEN" ] || [ -z "$MAPE_PSIDOFFSET" ] && exit 1

network_flush_cache
network_get_ipaddr IPV4 "$MAPE_IF"
[ -z "$IPV4" ] && exit 1

if [ "$MAPE_PSIDLEN" = "6" ]; then
    units=63
    port_multiplier=1024
elif [ "$MAPE_PSIDLEN" = "4" ]; then
    units=15
    port_multiplier=4096
else
    exit 1
fi

block_size_bits=`expr 16 - $MAPE_PSIDLEN - $MAPE_PSIDOFFSET`
port_block_size=1
i=0
while [ $i -lt $block_size_bits ]; do
    port_block_size=`expr $port_block_size \* 2`
    i=`expr $i + 1`
done

connlimit_max=`expr $port_block_size \* 8`
[ $connlimit_max -lt 128 ] && connlimit_max=128

network_get_device LANDEV "lan"
network_get_device WAN6DEV "$MAPE6_IF"
network_get_device TUNDEV "$MAPE_IF"
[ -z "$LANDEV" ] || [ -z "$WAN6DEV" ] || [ -z "$TUNDEV" ] && exit 1

iptables -t nat -F PREROUTING
iptables -t nat -F OUTPUT
iptables -t nat -F POSTROUTING

rule=1
while [ $rule -le $units ] ; do
    mark=`expr $rule + 16`
    pn=`expr $rule - 1`
    portl=`expr $rule \* $port_multiplier + $MAPE_PSID \* $port_block_size`
    portr=`expr $portl + $port_block_size - 1`
    
    iptables -t nat -A PREROUTING -p tcp -m statistic --mode nth --every $units --packet $pn -j MARK --set-mark $mark
    iptables -t nat -A OUTPUT -p tcp -m statistic --mode nth --every $units --packet $pn -j MARK --set-mark $mark
    iptables -t nat -A POSTROUTING -p icmp -m connlimit --connlimit-daddr --connlimit-upto $connlimit_max --connlimit-mask 0 -o $TUNDEV -j SNAT --to $IPV4:$portl-$portr
    iptables -t nat -A POSTROUTING -p tcp -o $TUNDEV -m mark --mark $mark -j SNAT --to $IPV4:$portl-$portr
    iptables -t nat -A POSTROUTING -p udp -m connlimit --connlimit-daddr --connlimit-upto $connlimit_max --connlimit-mask 0 -o $TUNDEV -j SNAT --to $IPV4:$portl-$portr
    
    rule=`expr $rule + 1`
done

sleep 5

iptables -t nat -A PREROUTING -i $LANDEV -j zone_lan_prerouting
iptables -t nat -A PREROUTING -i $WAN6DEV -j zone_wan_prerouting
iptables -t nat -A PREROUTING -i $TUNDEV -j zone_wan_prerouting
iptables -t nat -A POSTROUTING -o $LANDEV -j zone_lan_postrouting
iptables -t nat -A POSTROUTING -o $WAN6DEV -j zone_wan_postrouting
iptables -t nat -A POSTROUTING -o $TUNDEV -j zone_wan_postrouting

logger -t nichibann "適用完了: $MAPE_IF IP=$IPV4 PSID=$MAPE_PSID BlockSize=$port_block_size ConnLimit=$connlimit_max"
EOF

chmod +x /etc/hotplug.d/iface/99-nichibann
echo "設定完了"
