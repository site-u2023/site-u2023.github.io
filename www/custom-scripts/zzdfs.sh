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
    
    # 起動時の最後のDFSイベント
    logread | grep "DFS->DISABLED" | awk '{ print $1,$2,$3,$4,$5 }' | tail -n 1 > /tmp/config-software/dfs_event
    
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

# zzdfs-daemon.sh 作成
mkdir -p /etc/config-software/

cat << "EOF" > /etc/config-software/zzdfs-daemon.sh
#!/bin/sh

# 起動時に一度だけ読み込み（以降不変）
read RADIO < /tmp/config-software/radio
read FB_CHANNEL < /tmp/config-software/fb_channel
read FB_BAND < /tmp/config-software/fb_band
read ORIG_CHANNEL < /tmp/config-software/channel
read ORIG_HTMODE < /tmp/config-software/htmode
LAST_DFS=$(cat /tmp/config-software/dfs_event)
ORIG_MODE=$(echo ${ORIG_HTMODE} | grep -o "[A-Z]*")

_FALLBACK() {
    logger "ZZDFS: DFS detected, fallback to W52"
    uci -q batch << UCIEOF
set wireless.${RADIO}.channel='${FB_CHANNEL}'
set wireless.${RADIO}.htmode='${ORIG_MODE}${FB_BAND}'
commit wireless
UCIEOF
    wifi reload ${RADIO}
}

# /etc/config-software/zzdfs-daemon.sh の _RESTORE部分を修正

_RESTORE() {
    logger "ZZDFS: Waiting for NOP clearance..."
    
    # 30分タイムアウト + NOP-FINISHEDイベント、どちらか早い方
    {
        sleep 1800
        logger "ZZDFS: NOP timeout (30min), attempting restore"
    } &
    TIMER_PID=$!
    
    logread -f | while read LINE; do
        echo "${LINE}" | grep -q "DFS-NOP-FINISHED" && {
            logger "ZZDFS: NOP cleared, attempting restore"
            kill ${TIMER_PID} 2>/dev/null
            break
        }
    done &
    LOG_PID=$!
    
    # どちらか先に終わるまで待機
    wait -n
    kill ${TIMER_PID} ${LOG_PID} 2>/dev/null
    
    # 復帰処理
    uci -q batch << UCIEOF
set wireless.${RADIO}.channel='${ORIG_CHANNEL}'
set wireless.${RADIO}.htmode='${ORIG_HTMODE}'
commit wireless
UCIEOF
    wifi reload ${RADIO}
}

# 新しいDFSイベントを待つ
_WAIT_DFS() {
    logread -f | while read LINE; do
        echo "${LINE}" | grep -q "DFS->DISABLED" || continue
        DFS_EVENT=$(echo "${LINE}" | awk '{ print $1,$2,$3,$4,$5 }')
        if [ "${DFS_EVENT}" != "${LAST_DFS}" ]; then
            LAST_DFS="${DFS_EVENT}"
            echo "${DFS_EVENT}" >> /tmp/config-software/dfs_event
            return 0
        fi
    done
}

# CAC中にDFS再発したかチェック（10分間）
_CHECK_CAC() {
    END_TIME=$(($(date +%s) + 600))
    
    logread -f | while read LINE; do
        [ $(date +%s) -ge ${END_TIME} ] && return 0
        echo "${LINE}" | grep -q "DFS->DISABLED" || continue
        DFS_EVENT=$(echo "${LINE}" | awk '{ print $1,$2,$3,$4,$5 }')
        if [ "${DFS_EVENT}" != "${LAST_DFS}" ]; then
            LAST_DFS="${DFS_EVENT}"
            echo "${DFS_EVENT}" >> /tmp/config-software/dfs_event
            return 1
        fi
    done
    return 0
}

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

logger "ZZDFS: Waiting for WiFi..."
if ! _WAIT_WIFI; then
    logger "ZZDFS: WiFi timeout, exiting"
    exit 1
fi

logger "ZZDFS: WiFi ready, monitoring DFS"

# メインループ
while true; do
    _WAIT_DFS
    
    WIFI=$(uci -q get wireless.${RADIO}.disabled)
    [ "${WIFI}" = "1" ] && continue
    
    while true; do
        _FALLBACK
        _RESTORE
        
        if _CHECK_CAC; then
            logger "ZZDFS: Restore successful"
            break
        fi
        logger "ZZDFS: DFS detected again during CAC, retrying"
    done
done
EOF

chmod +x /etc/config-software/zzdfs-daemon.sh

# zzdfsl 作成
cat << "EOF" > /usr/bin/zzdfsl
#!/bin/sh

echo -e "\033[1;36mZZDFS (daemon version)\033[0;39m"
echo -e "\033[1;36mLOG ------------------------------------\033[0;39m"
echo -e "\033[1;37mZZDFS LOG:\033[0;39m"
logread | grep "ZZDFS" | tail -n 10

echo -e "\033[1;37mDFS HISTORY:\033[0;39m"
cat /tmp/config-software/dfs_event 2>/dev/null | tail -n 5

echo -e "\033[1;36mINFORMATION ----------------------------\033[0;39m"

read FB_BAND < /tmp/config-software/fb_band
read FB_CHANNEL < /tmp/config-software/fb_channel
read RADIO < /tmp/config-software/radio
read ORIG_CHANNEL < /tmp/config-software/channel
read ORIG_HTMODE < /tmp/config-software/htmode

# 現在値
CHANNEL=$(uci get wireless.${RADIO}.channel)
HTMODE=$(uci get wireless.${RADIO}.htmode)
MODE=$(echo ${HTMODE} | grep -o "[A-Z]*")
WIFI=$(uci -q get wireless.${RADIO}.disabled)

if [ "${WIFI}" != "1" ]; then
    echo -e "\033[1;32mWi-Fi 5G ${RADIO} ENABLE\033[0;39m"
else
    echo -e "\033[1;31mWi-Fi 5G ${RADIO} DISABLE\033[0;39m"
fi

echo -e "\033[1;37mOriginal Channel/Htmode: ${ORIG_CHANNEL}Ch / ${ORIG_HTMODE}\033[0;39m"
echo -e "\033[1;37mFALLBACK Channel/Htmode: ${FB_CHANNEL}Ch / ${MODE}${FB_BAND}\033[0;39m"
echo -e "\033[1;33mCurrent  Channel/Htmode: ${CHANNEL}Ch / ${HTMODE}\033[0;39m"

if [ "${CHANNEL}" = "${FB_CHANNEL}" ]; then
    echo -e "\033[1;35mStatus: FALLBACK MODE\033[0;39m"
else
    echo -e "\033[1;32mStatus: Normal\033[0;39m"
fi

if [ -f /var/run/zzdfs.pid ]; then
    PID=$(cat /var/run/zzdfs.pid)
    if kill -0 ${PID} 2>/dev/null; then
        echo -e "\033[1;32mDaemon: Running (PID ${PID})\033[0;39m"
    else
        echo -e "\033[1;31mDaemon: Not running (stale PID)\033[0;39m"
    fi
else
    echo -e "\033[1;31mDaemon: Not running\033[0;39m"
fi

echo -e "\033[1;36m----------------------------------------\033[0;39m"
EOF

chmod +x /usr/bin/zzdfsl

service zzdfs enable
service zzdfs start

zzdfsl
