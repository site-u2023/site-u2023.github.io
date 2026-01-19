#!/bin/sh

# システムログ設定
uci set system.@system[0].log_file='/var/log/syslog'
uci set system.@system[0].conloglevel='5'
uci set system.@system[0].log_size='128'
uci commit system
service system restart
service log restart

# init.d/zzdfs 作成
cat << "EOF" > /etc/init.d/zzdfs
#!/bin/sh /etc/rc.common

FB_BAND=80    # fallback band
FB_CHANNEL=36 # fallback channel

START=99
STOP=01

start() {
    logger "ZZDFS: Starting daemon"
    mkdir -p /tmp/config-software/
    
    RADIO=$(uci show wireless | grep "band='5g'" | cut -d'.' -f2 | awk '{ print $1 }')
    CHS=$(echo ${RADIO} | wc -w)
    if [ ${CHS} = 2 ]; then
        RADIO=$(echo ${RADIO} | awk '{print $2}')
    fi
    
    echo ${RADIO} > /tmp/config-software/radio
    echo ${FB_BAND} > /tmp/config-software/fb_band
    echo ${FB_CHANNEL} > /tmp/config-software/fb_channel
    
    # 元のチャンネルを記録
    uci get wireless.${RADIO}.channel > /tmp/config-software/channel
    uci get wireless.${RADIO}.htmode > /tmp/config-software/htmode
    
    # DFSイベント履歴の初期化
    > /tmp/config-software/dfs_event
    > /tmp/config-software/nop_event
    
    /etc/config-software/zzdfs-daemon.sh &
    echo $! > /var/run/zzdfs.pid
}

restart() {
    stop
    start
}

stop() {
    logger "ZZDFS: Stopping daemon"
    if [ -f /var/run/zzdfs.pid ]; then
        kill $(cat /var/run/zzdfs.pid) 2>/dev/null
        rm -f /var/run/zzdfs.pid
    fi
    killall zzdfs-daemon.sh 2>/dev/null
    rm -rf /tmp/config-software
}
EOF

chmod +x /etc/init.d/zzdfs

# zzdfs-daemon.sh 作成（hostapd準拠版）
mkdir -p /etc/config-software/

cat << "EOF" > /etc/config-software/zzdfs-daemon.sh
#!/bin/sh

# 設定読み込み
read RADIO < /tmp/config-software/radio
read FB_CHANNEL < /tmp/config-software/fb_channel
read FB_BAND < /tmp/config-software/fb_band
read ORIG_CHANNEL < /tmp/config-software/channel
read ORIG_HTMODE < /tmp/config-software/htmode
ORIG_MODE=$(echo ${ORIG_HTMODE} | grep -o "[A-Z]*")

# WiFi起動待ち（タイムアウト180秒）
_WAIT_WIFI() {
    if iw dev | grep -q "Interface"; then
        return 0
    fi
    
    COUNT=0
    while [ ${COUNT} -lt 36 ]; do
        sleep 5
        COUNT=$((COUNT + 1))
        if logread | grep -q "hostapd.*AP-ENABLED"; then
            return 0
        fi
    done
    return 1
}

# フォールバック処理
_FALLBACK() {
    local reason="${1:-unknown}"
    logger "ZZDFS: Fallback to W52 (reason: ${reason})"
    
    uci -q batch << UCIEOF
set wireless.${RADIO}.channel='${FB_CHANNEL}'
set wireless.${RADIO}.htmode='${ORIG_MODE}${FB_BAND}'
commit wireless
UCIEOF
    wifi reload ${RADIO}
    
    # フォールバック成功待ち（最大30秒）
    COUNT=0
    while [ ${COUNT} -lt 6 ]; do
        sleep 5
        COUNT=$((COUNT + 1))
        if logread | tail -n 20 | grep -q "AP-ENABLED"; then
            logger "ZZDFS: Fallback successful"
            return 0
        fi
    done
    
    logger "ZZDFS: WARNING - Fallback may have failed"
    return 1
}

# NOP終了待ち＋復帰処理（hostapd準拠）
_RESTORE() {
    local nop_timeout=1800  # 30分
    local start_time=$(date +%s)
    
    logger "ZZDFS: Waiting for NOP clearance (30min timeout)..."
    
    # タイムアウトプロセス
    {
        sleep ${nop_timeout}
        logger "ZZDFS: NOP timeout reached (30min)"
        echo "TIMEOUT" > /tmp/config-software/nop_trigger
    } &
    TIMER_PID=$!
    
    # NOPイベント監視プロセス
    logread -f | while read LINE; do
        # DFS-NOP-FINISHED を検出
        if echo "${LINE}" | grep -q "DFS-NOP-FINISHED"; then
            local freq=$(echo "${LINE}" | sed -n 's/.*freq=\([0-9]*\).*/\1/p')
            local elapsed=$(($(date +%s) - start_time))
            
            logger "ZZDFS: NOP-FINISHED detected (freq=${freq}, elapsed=${elapsed}s)"
            echo "${LINE}" >> /tmp/config-software/nop_event
            echo "NOP-FINISHED" > /tmp/config-software/nop_trigger
            kill ${TIMER_PID} 2>/dev/null
            break
        fi
        
        # 追加のDFS検出（NOP中の再検出）
        if echo "${LINE}" | grep -q "DFS-RADAR-DETECTED"; then
            logger "ZZDFS: WARNING - Another radar detected during NOP"
            echo "${LINE}" >> /tmp/config-software/dfs_event
        fi
    done &
    LOG_PID=$!
    
    # どちらかの終了を待つ
    wait -n
    kill ${TIMER_PID} ${LOG_PID} 2>/dev/null
    
    # 復帰処理実行
    local trigger=$(cat /tmp/config-software/nop_trigger 2>/dev/null)
    rm -f /tmp/config-software/nop_trigger
    
    if [ "${trigger}" = "NOP-FINISHED" ]; then
        logger "ZZDFS: Attempting restore to original channel"
    else
        logger "ZZDFS: Timeout - attempting restore anyway"
    fi
    
    # 元のチャンネルに復帰
    uci -q batch << UCIEOF
set wireless.${RADIO}.channel='${ORIG_CHANNEL}'
set wireless.${RADIO}.htmode='${ORIG_HTMODE}'
commit wireless
UCIEOF
    wifi reload ${RADIO}
    
    # 復帰成功確認（最大30秒）
    COUNT=0
    while [ ${COUNT} -lt 6 ]; do
        sleep 5
        COUNT=$((COUNT + 1))
        if logread | tail -n 20 | grep -q "AP-ENABLED"; then
            logger "ZZDFS: Restore successful"
            return 0
        fi
    done
    
    logger "ZZDFS: WARNING - Restore status unclear"
    return 1
}

# CAC中のDFS再検出チェック（10分監視）
_CHECK_CAC() {
    local cac_timeout=600
    local end_time=$(($(date +%s) + cac_timeout))
    
    logger "ZZDFS: Monitoring CAC period (10min)..."
    
    logread -f | while read LINE; do
        local now=$(date +%s)
        
        # タイムアウトチェック
        if [ ${now} -ge ${end_time} ]; then
            logger "ZZDFS: CAC monitoring completed (no radar)"
            return 0
        fi
        
        # DFS再検出
        if echo "${LINE}" | grep -q "DFS-RADAR-DETECTED"; then
            logger "ZZDFS: Radar detected during CAC!"
            echo "${LINE}" >> /tmp/config-software/dfs_event
            return 1
        fi
        
        # CAC完了イベント
        if echo "${LINE}" | grep -q "DFS-CAC-COMPLETED"; then
            logger "ZZDFS: CAC completed successfully"
            return 0
        fi
    done
    
    return 0
}

# DFS検出待機
_WAIT_DFS() {
    logger "ZZDFS: Monitoring for DFS events..."
    
    logread -f | while read LINE; do
        # DFS-RADAR-DETECTED を検出
        if echo "${LINE}" | grep -q "DFS-RADAR-DETECTED"; then
            local freq=$(echo "${LINE}" | sed -n 's/.*freq=\([0-9]*\).*/\1/p')
            local chan_width=$(echo "${LINE}" | sed -n 's/.*chan_width=\([0-9]*\).*/\1/p')
            
            logger "ZZDFS: DFS-RADAR-DETECTED (freq=${freq}, width=${chan_width})"
            echo "${LINE}" >> /tmp/config-software/dfs_event
            return 0
        fi
        
        # 「no DFS channels left」の検出
        if echo "${LINE}" | grep -q "no DFS channels left"; then
            logger "ZZDFS: No DFS channels available - waiting for NOP"
            echo "${LINE}" >> /tmp/config-software/dfs_event
            return 0
        fi
    done
}

# WiFi起動待ち
logger "ZZDFS: Waiting for WiFi initialization..."
if ! _WAIT_WIFI; then
    logger "ZZDFS: ERROR - WiFi startup timeout"
    exit 1
fi

logger "ZZDFS: WiFi ready, starting DFS monitoring"

# メインループ
while true; do
    # DFS検出待機
    _WAIT_DFS
    
    # WiFi無効なら次のループへ
    WIFI=$(uci -q get wireless.${RADIO}.disabled)
    if [ "${WIFI}" = "1" ]; then
        logger "ZZDFS: WiFi disabled, skipping"
        sleep 10
        continue
    fi
    
    # フォールバック→NOP待機→復帰のサイクル
    while true; do
        _FALLBACK "DFS detected"
        
        _RESTORE
        
        # CAC期間の監視
        if _CHECK_CAC; then
            logger "ZZDFS: Cycle completed successfully"
            break
        else
            logger "ZZDFS: CAC failed - retrying cycle"
        fi
    done
done
EOF

chmod +x /etc/config-software/zzdfs-daemon.sh

# zzdfsl 作成（情報表示強化版）
cat << "EOF" > /usr/bin/zzdfsl
#!/bin/sh

echo -e "\033[1;36m╔═══════════════════════════════════════╗\033[0;39m"
echo -e "\033[1;36m║     ZZDFS (hostapd-aware daemon)     ║\033[0;39m"
echo -e "\033[1;36m╚═══════════════════════════════════════╝\033[0;39m"

echo -e "\n\033[1;37m📋 RECENT LOGS\033[0;39m"
echo -e "\033[0;36m─────────────────────────────────────────\033[0;39m"
logread | grep "ZZDFS" | tail -n 8

echo -e "\n\033[1;37m📡 DFS EVENTS HISTORY\033[0;39m"
echo -e "\033[0;36m─────────────────────────────────────────\033[0;39m"
if [ -f /tmp/config-software/dfs_event ]; then
    tail -n 5 /tmp/config-software/dfs_event | while read line; do
        echo -e "\033[0;33m🔴 ${line}\033[0;39m"
    done
else
    echo -e "\033[0;90m(No DFS events)\033[0;39m"
fi

echo -e "\n\033[1;37m✅ NOP-FINISHED EVENTS\033[0;39m"
echo -e "\033[0;36m─────────────────────────────────────────\033[0;39m"
if [ -f /tmp/config-software/nop_event ]; then
    tail -n 3 /tmp/config-software/nop_event | while read line; do
        echo -e "\033[0;32m✓ ${line}\033[0;39m"
    done
else
    echo -e "\033[0;90m(No NOP events)\033[0;39m"
fi

read RADIO < /tmp/config-software/radio
read FB_BAND < /tmp/config-software/fb_band
read FB_CHANNEL < /tmp/config-software/fb_channel
read ORIG_CHANNEL < /tmp/config-software/channel
read ORIG_HTMODE < /tmp/config-software/htmode

CHANNEL=$(uci get wireless.${RADIO}.channel)
HTMODE=$(uci get wireless.${RADIO}.htmode)
MODE=$(echo ${HTMODE} | grep -o "[A-Z]*")
WIFI=$(uci -q get wireless.${RADIO}.disabled)

echo -e "\n\033[1;37m⚙️  CONFIGURATION\033[0;39m"
echo -e "\033[0;36m─────────────────────────────────────────\033[0;39m"
echo -e "\033[0;37mRadio:          ${RADIO}\033[0;39m"
echo -e "\033[0;37mOriginal:       ${ORIG_CHANNEL}Ch / ${ORIG_HTMODE}\033[0;39m"
echo -e "\033[0;37mFallback:       ${FB_CHANNEL}Ch / ${MODE}${FB_BAND}\033[0;39m"
echo -e "\033[1;33mCurrent:        ${CHANNEL}Ch / ${HTMODE}\033[0;39m"

echo -e "\n\033[1;37m📊 STATUS\033[0;39m"
echo -e "\033[0;36m─────────────────────────────────────────\033[0;39m"

if [ "${WIFI}" = "1" ]; then
    echo -e "\033[1;31m⚠  WiFi 5G: DISABLED\033[0;39m"
else
    echo -e "\033[1;32m✓  WiFi 5G: ENABLED\033[0;39m"
fi

if [ "${CHANNEL}" = "${FB_CHANNEL}" ]; then
    echo -e "\033[1;35m🔄 Mode: FALLBACK (W52)\033[0;39m"
elif [ "${CHANNEL}" = "${ORIG_CHANNEL}" ]; then
    echo -e "\033[1;32m✓  Mode: Normal (Original)\033[0;39m"
else
    echo -e "\033[1;33m?  Mode: Unknown\033[0;39m"
fi

if [ -f /var/run/zzdfs.pid ]; then
    PID=$(cat /var/run/zzdfs.pid)
    if kill -0 ${PID} 2>/dev/null; then
        echo -e "\033[1;32m✓  Daemon: Running (PID ${PID})\033[0;39m"
    else
        echo -e "\033[1;31m⚠  Daemon: Dead (stale PID)\033[0;39m"
    fi
else
    echo -e "\033[1;31m✗  Daemon: Not running\033[0;39m"
fi

echo -e "\033[0;36m─────────────────────────────────────────\033[0;39m"
EOF

chmod +x /usr/bin/zzdfsl

service zzdfs enable
service zzdfs start

zzdfsl
