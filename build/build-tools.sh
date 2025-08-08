#!/bin/sh

# uci-defaults MAP-E/DS-Lite Auto Setup for OpenWrt (Enhanced Version)
# Place this file in firmware at: /etc/uci-defaults/99-auto-config

# Beware! This script will be in /rom/etc/uci-defaults/ as part of the image.
# Uncomment lines to apply:
#
# ROOT_PASSWORD="your_password"
# LAN_IP_ADDRESS="192.168.1.1"
# WLAN_NAME="MyOpenWrt"
# WLAN_PASSWORD="12345678"
#
# PPPOE_USERNAME="your_isp_username"
# PPPOE_PASSWORD="your_isp_password"

LANGUAGE=""

GUA_ADDR=""
PD_ADDR=""

API_URL="https://auto-config.site-u.workers.dev/"
WAN_DEF="wan"
MAP_NAME="map"          # MAP-E IPv4インターフェース
MAP6_NAME="map6"        # MAP-E IPv6インターフェース
DSLITE_NAME="dslite"    # DS-Lite IPv4インターフェース
DSLITE6_NAME="dslite6"  # DS-Lite IPv6インターフェース

# Global variables for device configuration (uncomment to use)
# ROOT_PASSWORD=""
# LAN_IP_ADDRESS=""
# WLAN_NAME=""
# WLAN_PASSWORD=""
# PPPOE_USERNAME=""
# PPPOE_PASSWORD=""

# Global variables for API response data
API_RESPONSE=""
BR=""
EALEN=""
IPV4_PREFIX=""
IPV4_PREFIXLEN=""
IPV6_PREFIX=""
IPV6_PREFIXLEN=""
PSID_OFFSET=""
COUNTRY=""
TIMEZONE=""
REGION_NAME=""
REGION_CODE=""
ISP=""
OS_VERSION=""

# DS-Lite関連変数
AFTR_TYPE=""
REGION=""
AFTER_ADDR=""

# OpenWrtネットワークAPIでIPv6アドレス取得後待機
get_address() {
    local timeout=60
    local count=0
    local ipv6_addr=""
    local ipv6_prefix=""
    
    logger -t auto-config "Waiting for IPv6 address..."
    
    # ネットワーク関数をロード
    . /lib/functions.sh
    . /lib/functions/network.sh

    while [ $count -lt $timeout ]; do
        network_flush_cache
        network_find_wan6 wan6_iface

        if [ -n "$wan6_iface" ]; then
            # GUA（グローバルIPv6アドレス）取得 - MAP-E/DS-Lite優先
            if network_get_ipaddr6 ipv6_addr "$wan6_iface" && [ -n "$ipv6_addr" ]; then
                GUA_ADDR="$ipv6_addr"
                logger -t auto-config "GUA address obtained: $GUA_ADDR"
                
                # GUAがあれば基本的に設定可能
                return 0
            fi
            
            # PD（委譲プレフィックス）取得 - フォールバック（主に10Gコース）
            if network_get_prefix6 ipv6_prefix "$wan6_iface" && [ -n "$ipv6_prefix" ]; then
                PD_ADDR="$ipv6_prefix"
                logger -t auto-config "PD prefix obtained: $PD_ADDR"
                
                # PDのみでも動作可能
                return 0
            fi
        fi

        sleep 2
        count=$((count + 2))
    done

    logger -t auto-config "IPv6 address not available after ${timeout}s"
    return 1
}

fetch_country_info() {
    logger -t auto-config "Fetching configuration from Cloudflare Worker..."
    
    # APIから設定情報を取得
    API_RESPONSE=$(wget -6 -q -O - --timeout=30 "$API_URL" 2>/dev/null)

    if [ -z "$API_RESPONSE" ]; then
        logger -t auto-config "Failed to fetch API response"
        return 1
    fi
    
    # 地域情報取得
    LANGUAGE=$(echo "$LANGUAGE" 2>/dev/null)
    COUNTRY=$(echo "$API_RESPONSE" | jsonfilter -e '@.country' 2>/dev/null)
    TIMEZONE=$(echo "$API_RESPONSE" | jsonfilter -e '@.timezone' 2>/dev/null)
    REGION_NAME=$(echo "$API_RESPONSE" | jsonfilter -e '@.regionName' 2>/dev/null)
    REGION_CODE=$(echo "$API_RESPONSE" | jsonfilter -e '@.region' 2>/dev/null)
    ISP=$(echo "$API_RESPONSE" | jsonfilter -e '@.isp' 2>/dev/null)
    
    logger -t auto-config "Configuration fetched successfully (Country: $COUNTRY, Region: $REGION_NAME[$REGION_CODE], ISP: $ISP, TZ: $TIMEZONE)"
    return 0
}

# Cloudflareワーカーから情報取得
fetch_mape_info() {
    # MAP-Eルールが見つかったかチェック
    local rule_exists=$(echo "$API_RESPONSE" | jsonfilter -e '@.rule' 2>/dev/null)
    if [ -z "$rule_exists" ] || [ "$rule_exists" = "null" ]; then
        logger -t auto-config "No MAP-E rule found for this IPv6 address"
        return 1
    fi

    # API レスポンスから値を抽出
    BR=$(echo "$API_RESPONSE" | jsonfilter -e '@.rule.brIpv6Address' 2>/dev/null)
    EALEN=$(echo "$API_RESPONSE" | jsonfilter -e '@.rule.eaBitLength' 2>/dev/null)
    IPV4_PREFIX=$(echo "$API_RESPONSE" | jsonfilter -e '@.rule.ipv4Prefix' 2>/dev/null)
    IPV4_PREFIXLEN=$(echo "$API_RESPONSE" | jsonfilter -e '@.rule.ipv4PrefixLength' 2>/dev/null)
    IPV6_PREFIX=$(echo "$API_RESPONSE" | jsonfilter -e '@.rule.ipv6Prefix' 2>/dev/null)
    IPV6_PREFIXLEN=$(echo "$API_RESPONSE" | jsonfilter -e '@.rule.ipv6PrefixLength' 2>/dev/null)
    PSID_OFFSET=$(echo "$API_RESPONSE" | jsonfilter -e '@.rule.psIdOffset' 2>/dev/null)

    # 必須パラメータのチェック
    if [ -z "$BR" ] || [ -z "$EALEN" ] || [ -z "$IPV4_PREFIX" ] || [ -z "$IPV4_PREFIXLEN" ] || [ -z "$IPV6_PREFIX" ] || [ -z "$IPV6_PREFIXLEN" ] || [ -z "$PSID_OFFSET" ]; then
        logger -t auto-config "Missing required MAP-E parameters"
        return 1
    fi

    logger -t auto-config "Configuration fetched successfully (BR: $BR)"
    return 0
}

# DS-Lite情報取得
fetch_dslite_info() {
    # APIからAFTR種別情報取得
    AFTR_TYPE=$(echo "$API_RESPONSE" | jsonfilter -e '@.rule.aftrType' 2>/dev/null)
    AFTER_ADDR=$(echo "$API_RESPONSE" | jsonfilter -e '@.rule.aftrIpv6Address' 2>/dev/null)
    
    if [ -z "$AFTR_TYPE" ] || [ "$AFTR_TYPE" = "null" ]; then
        logger -t auto-config "No AFTR type information"
        return 1
    fi

    logger -t auto-config "DS-Lite AFTR Type: $AFTR_TYPE, AFTR Address: $AFTER_ADDR"
    return 0
}

# デバイス基本設定（パスワード、IP、Wi-Fi名）
set_device_basic_config() {
    [ -n "$LAN_IP_ADDRESS" ] && cp /etc/config/network /etc/config/network.basic.bak 2>/dev/null
    [ -n "$WLAN_NAME" ] && cp /etc/config/wireless /etc/config/wireless.basic.bak 2>/dev/null
    
    logger -t auto-config "Setting device basic configuration..."
    
    # ログ出力設定（公式フォーマットに準拠）
    exec >/tmp/setup.log 2>&1
    
    # rootパスワード設定
    if [ -n "$ROOT_PASSWORD" ]; then
        logger -t auto-config "Setting root password"
        (echo "$ROOT_PASSWORD"; sleep 1; echo "$ROOT_PASSWORD") | passwd > /dev/null
    fi
    
    # LAN IPアドレス設定
    if [ -n "$LAN_IP_ADDRESS" ]; then
        logger -t auto-config "Setting LAN IP address to $LAN_IP_ADDRESS"
        uci set network.lan.ipaddr="$LAN_IP_ADDRESS"
    fi
    
    # WLAN設定（SSID & パスワード）
    if [ -n "$WLAN_NAME" ] && [ -n "$WLAN_PASSWORD" ] && [ ${#WLAN_PASSWORD} -ge 8 ]; then
        logger -t auto-config "Setting WLAN: $WLAN_NAME"
        uci set wireless.@wifi-device[0].disabled='0'
        uci set wireless.@wifi-iface[0].disabled='0'
        uci set wireless.@wifi-iface[0].encryption='psk2'
        uci set wireless.@wifi-iface[0].ssid="$WLAN_NAME"
        uci set wireless.@wifi-iface[0].key="$WLAN_PASSWORD"
    fi
    
    return 0
}

# 言語コード及びタイムゾーン設定
set_country() {
    cp /etc/config/system /etc/config/system.country.bak 2>/dev/null

    logger -t auto-config "Setting language..."
    
    # システム設定（言語）
    if [ -n "$LANGUAGE" ]; then
        uci set system.@system[0].language="$LANGUAGE" >/dev/null 2>&1      
        logger -t auto-config "Set language to $LANGUAGE"
    fi
    
    logger -t auto-config "Setting timezone..."
    
    # システム設定（タイムゾーン）
    if [ -n "$TIMEZONE" ]; then
        uci set system.@system[0].timezone="$TIMEZONE" >/dev/null 2>&1
        logger -t auto-config "Set timezone to $TIMEZONE"
    fi

    return 0
}

# ISP接続方式の判別ルーチン
# 戻り値: "pppoe" / "dslite" / "mape" / "dhcp"
detect_isp_mode() {
    # 1. PPPoE判定（ID/PASSが両方セットされていれば最優先）
    if [ -n "$PPPOE_USERNAME" ] && [ -n "$PPPOE_PASSWORD" ]; then
        echo "pppoe"
        return 0
    fi

    # 2. DS-Lite判定（APIレスポンスにAFTR種別またはAFTR IPv6アドレスがあれば）
    if [ -n "$API_RESPONSE" ]; then
        local aftr_type=$(echo "$API_RESPONSE" | jsonfilter -e '@.rule.aftrType' 2>/dev/null)
        local aftr_addr=$(echo "$API_RESPONSE" | jsonfilter -e '@.rule.aftrIpv6Address' 2>/dev/null)
        if [ "$aftr_type" = "transix" ] || [ "$aftr_type" = "xpass" ] || [ "$aftr_type" = "v6option" ] || [ -n "$aftr_addr" ]; then
            echo "dslite"
            return 0
        fi
    fi

    # 3. MAP-E判定（APIレスポンスにMAP-Eルールがあれば）
    if [ -n "$API_RESPONSE" ]; then
        local rule_exists=$(echo "$API_RESPONSE" | jsonfilter -e '@.rule' 2>/dev/null)
        if [ -n "$rule_exists" ] && [ "$rule_exists" != "null" ]; then
            echo "mape"
            return 0
        fi
    fi

    # 4. DHCP（上記すべて該当なし）
    echo "dhcp"
    return 0
}

# PPPoE設定
set_pppoe_config() {
    cp /etc/config/network /etc/config/network.pppoe.bak 2>/dev/null

    logger -t auto-config "Setting PPPoE configuration..."
    
    # PPPoE設定（公式フォーマットに準拠）
    if [ -n "$PPPOE_USERNAME" ] && [ -n "$PPPOE_PASSWORD" ]; then
        logger -t auto-config "Configuring PPPoE with username: $PPPOE_USERNAME"
        uci set network.wan.proto='pppoe'
        uci set network.wan.username="$PPPOE_USERNAME"
        uci set network.wan.password="$PPPOE_PASSWORD"
        
        # WAN6も無効化（PPPoE使用時）
        uci set network.wan6.disabled='1' >/dev/null 2>&1
        uci set network.wan6.auto='0' >/dev/null 2>&1
        
        # MAP-E/DS-Lite関連インターフェースを削除（競合回避）
        uci delete network.${WAN6_NAME} >/dev/null 2>&1
        uci delete network.${WANMAP_NAME} >/dev/null 2>&1
        uci delete network.${DSLITE_NAME} >/dev/null 2>&1
        uci delete dhcp.${WAN6_NAME} >/dev/null 2>&1
        
        logger -t auto-config "PPPoE configuration completed"
    else
        logger -t auto-config "PPPoE username or password not set, skipping PPPoE configuration"
    fi
    
    return 0
}

# DS-Lite設定関数
set_dslite_config() {
    cp /etc/config/network /etc/config/network.dslite.bak 2>/dev/null
    cp /etc/config/dhcp /etc/config/dhcp.dslite.bak 2>/dev/null
    cp /etc/config/firewall /etc/config/firewall.dslite.bak 2>/dev/null

    logger -t auto-config "Start DS-LITE detection and configuration"

    # ローカルIPv6アドレス確認
    if [ -n "$GUA_ADDR" ]; then
        logger -t auto-config "Local IPv6 address: $GUA_ADDR"
    else
        logger -t auto-config "Failed to get local IPv6 address"
        return 1
    fi

    # DS-Lite情報取得
    if ! fetch_dslite_info; then
        logger -t auto-config "Failed to fetch DS-Lite information"
        return 1
    fi

    # NTT東西判定
    if [ "$REGION_CODE" -le 15 ] || [ "$REGION_CODE" -eq 19 ] || [ "$REGION_CODE" -eq 20 ]; then
        REGION="east"
        logger -t auto-config "Detected: NTT East Japan (Region: $REGION_NAME[$REGION_CODE])"
    else
        REGION="west"
        logger -t auto-config "Detected: NTT West Japan (Region: $REGION_NAME[$REGION_CODE])"
    fi

    # AFTR IPv6アドレスの決定
    local aftr_addr="$AFTER_ADDR"
    
    # AFTRアドレスが指定されていない場合は、種別と東西で決定
    if [ -z "$aftr_addr" ] || [ "$aftr_addr" = "null" ]; then
        case "$AFTR_TYPE" in
            "transix")
                if [ "$REGION" = "east" ]; then
                    aftr_addr="2404:8e00::feed:100"
                else
                    aftr_addr="2404:8e01::feed:100"
                fi
                ;;
            "xpass")
                if [ "$REGION" = "east" ]; then
                    aftr_addr="2001:e30:1c1e:1::1"
                else
                    aftr_addr="2001:e30:1c1f:1::1"
                fi
                ;;
            "v6option")
                if [ "$REGION" = "east" ]; then
                    aftr_addr="2404:8e00::feed:101"
                else
                    aftr_addr="2404:8e01::feed:101"
                fi
                ;;
            *)
                logger -t auto-config "Unknown AFTR type: $AFTR_TYPE"
                return 1
                ;;
        esac
    fi

    logger -t auto-config "DS-LITE configuration: Type=$AFTR_TYPE, AFTR=$aftr_addr, Region=$REGION"

    # 既存のWAN設定を無効化
    uci set network.wan.disabled='1' >/dev/null 2>&1
    uci set network.wan.auto='0' >/dev/null 2>&1

    # IPv6インターフェース設定（DHCPv6）
    uci delete network.${DSLITE6_NAME} >/dev/null 2>&1
    uci set network.${DSLITE6_NAME}=interface
    uci set network.${DSLITE6_NAME}.proto='dhcpv6'
    uci set network.${DSLITE6_NAME}.device="${WAN_DEF}"
    uci set network.${DSLITE6_NAME}.reqaddress='try'
    uci set network.${DSLITE6_NAME}.reqprefix='auto'

    # DS-Liteインターフェース設定
    uci delete network.${DSLITE_NAME} >/dev/null 2>&1
    uci set network.${DSLITE_NAME}=interface
    uci set network.${DSLITE_NAME}.proto='dslite'
    uci set network.${DSLITE_NAME}.peeraddr="$aftr_addr"
    uci set network.${DSLITE_NAME}.tunlink="${DSLITE6_NAME}"
    uci set network.${DSLITE_NAME}.mtu='1460'
    uci set network.${DSLITE_NAME}.encaplimit='ignore'

    # DHCP設定
    uci delete dhcp.${DSLITE6_NAME} >/dev/null 2>&1
    uci set dhcp.${DSLITE6_NAME}=dhcp
    uci set dhcp.${DSLITE6_NAME}.interface="${DSLITE6_NAME}"
    uci set dhcp.${DSLITE6_NAME}.master='1'
    uci set dhcp.${DSLITE6_NAME}.ra='relay'
    uci set dhcp.${DSLITE6_NAME}.dhcpv6='relay'
    uci set dhcp.${DSLITE6_NAME}.ndp='relay'
    uci set dhcp.${DSLITE6_NAME}.ignore='1'

    # LANでIPv6リレー有効化
    uci set dhcp.lan.ra='relay' >/dev/null 2>&1
    uci set dhcp.lan.dhcpv6='relay' >/dev/null 2>&1
    uci set dhcp.lan.ndp='relay' >/dev/null 2>&1
    uci set dhcp.lan.force='1' >/dev/null 2>&1

    # ファイアウォール設定
    uci add_list firewall.@zone[1].network="${DSLITE_NAME}" >/dev/null 2>&1
    uci add_list firewall.@zone[1].network="${DSLITE6_NAME}" >/dev/null 2>&1
    uci set firewall.@zone[1].masq='1' >/dev/null 2>&1
    uci set firewall.@zone[1].mtu_fix='1' >/dev/null 2>&1

    logger -t auto-config "DS-Lite configuration completed (Type: $AFTR_TYPE, AFTR: $aftr_addr)"
    return 0
}

# MAP-E設定
set_mape_config() {
    cp /etc/config/network /etc/config/network.mape.bak 2>/dev/null
    cp /etc/config/dhcp /etc/config/dhcp.mape.bak 2>/dev/null
    cp /etc/config/firewall /etc/config/firewall.mape.bak 2>/dev/null

    logger -t auto-config "Configuring MAP-E..."
    
    # OpenWrtバージョンを取得
    if [ -f "/etc/openwrt_release" ]; then
        OS_VERSION=$(grep "DISTRIB_RELEASE" /etc/openwrt_release | cut -d"'" -f2 2>/dev/null)
    fi

    # 既存のWAN/WAN6を無効化
    uci set network.wan.disabled='1' >/dev/null 2>&1
    uci set network.wan.auto='0' >/dev/null 2>&1
    uci set network.wan6.disabled='1' >/dev/null 2>&1
    uci set network.wan6.auto='0' >/dev/null 2>&1

    # IPv6インターフェース設定（DHCPv6）
    uci delete network.${MAP6_NAME} >/dev/null 2>&1
    uci set network.${MAP6_NAME}=interface
    uci set network.${MAP6_NAME}.proto='dhcpv6'
    uci set network.${MAP6_NAME}.device="${WAN_DEF}"
    uci set network.${MAP6_NAME}.reqaddress='try'
    uci set network.${MAP6_NAME}.reqprefix='auto'

    # GUA/PDアドレスが取得できている場合はプレフィックスを設定
    if [ -n "$PD_ADDR" ]; then
        uci set network.${MAP6_NAME}.ip6prefix="$PD_ADDR"
    elif [ -n "$GUA_ADDR" ]; then
        local wan6_prefix=$(echo "$GUA_ADDR" | sed 's/:[^:]*$/::/')
        uci set network.${MAP6_NAME}.ip6prefix="$wan6_prefix"
    fi

    # MAP-Eインターフェース設定
    uci delete network.${MAP_NAME} >/dev/null 2>&1
    uci set network.${MAP_NAME}=interface
    uci set network.${MAP_NAME}.proto='map'
    uci set network.${MAP_NAME}.maptype='map-e'
    uci set network.${MAP_NAME}.peeraddr="${BR}"
    uci set network.${MAP_NAME}.ipaddr="${IPV4_PREFIX}"
    uci set network.${MAP_NAME}.ip4prefixlen="${IPV4_PREFIXLEN}"
    uci set network.${MAP_NAME}.ip6prefix="${IPV6_PREFIX}"
    uci set network.${MAP_NAME}.ip6prefixlen="${IPV6_PREFIXLEN}"
    uci set network.${MAP_NAME}.ealen="${EALEN}"
    uci set network.${MAP_NAME}.offset="${PSID_OFFSET}"
    uci set network.${MAP_NAME}.mtu='1460'
    uci set network.${MAP_NAME}.encaplimit='ignore'

    # OpenWrt バージョン別設定
    if echo "$OS_VERSION" | grep -q "^19"; then
        uci delete network.${MAP_NAME}.legacymap >/dev/null 2>&1
        uci delete network.${MAP_NAME}.tunlink >/dev/null 2>&1
        uci add_list network.${MAP_NAME}.tunlink="${MAP6_NAME}"
    else
        uci set network.${MAP_NAME}.legacymap='1'
        uci set network.${MAP_NAME}.tunlink="${MAP6_NAME}"
    fi

    # DHCP設定
    uci delete dhcp.${MAP6_NAME} >/dev/null 2>&1
    uci set dhcp.${MAP6_NAME}=dhcp
    uci set dhcp.${MAP6_NAME}.interface="${MAP6_NAME}"
    uci set dhcp.${MAP6_NAME}.master='1'
    uci set dhcp.${MAP6_NAME}.ra='relay'
    uci set dhcp.${MAP6_NAME}.dhcpv6='relay'
    uci set dhcp.${MAP6_NAME}.ndp='relay'

    # OpenWrt 21.02+のみでignore設定
    if ! echo "$OS_VERSION" | grep -q "^19"; then
        uci set dhcp.${MAP6_NAME}.ignore='1'
    fi

    # LANでIPv6リレー有効化
    uci set dhcp.lan.ra='relay' >/dev/null 2>&1
    uci set dhcp.lan.dhcpv6='relay' >/dev/null 2>&1
    uci set dhcp.lan.ndp='relay' >/dev/null 2>&1
    uci set dhcp.lan.force='1' >/dev/null 2>&1

    # ファイアウォール設定
    uci add_list firewall.@zone[1].network="${MAP_NAME}" >/dev/null 2>&1
    uci add_list firewall.@zone[1].network="${MAP6_NAME}" >/dev/null 2>&1
    uci set firewall.@zone[1].masq='1' >/dev/null 2>&1
    uci set firewall.@zone[1].mtu_fix='1' >/dev/null 2>&1

    logger -t auto-config "MAP-E configuration completed (OpenWrt: $OS_VERSION)"
    return 0
}

# Wi-Fi設定（国コード）
set_wifi_config() {
    cp /etc/config/wireless /etc/config/wireless.country.bak 2>/dev/null
    
    logger -t auto-config "Setting WiFi configuration..."
    
    # 国コード設定関数
    set_country_code() {
        local device="$1"
        uci set wireless.${device}.country="$COUNTRY" >/dev/null 2>&1
    }

    # ワイヤレス設定（国コード）
    if [ -n "$COUNTRY" ]; then
        # 全ての無線デバイスに国コードを設定
        . /lib/functions.sh
        config_load wireless
        config_foreach set_country_code wifi-device
        logger -t auto-config "Set country code to $COUNTRY"
    fi

    return 0
}

openwrt_config_main() {
    logger -t auto-config "Starting OpenWrt auto configuration..."

    # 1. デバイス基本設定（パスワード、IP、Wi-Fi名）
    set_device_basic_config

    # 2. IPv6接続が利用可能になるまで待機
    if ! get_address; then
        logger -t auto-config "IPv6 address not available, fallback to DHCP only LAN setup"
        # DHCPのみのシンプルなLAN設定（必要なら追加）
        uci commit network
        uci commit dhcp
        uci commit firewall
        echo "DHCP only LAN setup completed."
        return 0
    fi

    # 3. Cloudflareワーカーから情報取得
    if ! fetch_country_info; then
        logger -t auto-config "Failed to fetch API country info, fallback to DHCP only LAN setup"
        uci commit network
        uci commit dhcp
        uci commit firewall
        echo "DHCP only LAN setup completed."
        return 0
    fi

    # 4. ISP優先判定
    local isp_mode
    isp_mode=$(detect_isp_mode)

    logger -t auto-config "Detected ISP mode: $isp_mode"

    # 5. タイムゾーン＆国コード設定
    set_country

    # 6. Wi-Fi設定
    set_wifi_config

    # 7. 各方式ごとの設定
    case "$isp_mode" in
        "pppoe")
            set_pppoe_config
            ;;
        "dslite")
            set_dslite_config
            ;;
        "mape")
            fetch_mape_info && set_mape_config
            ;;
        "dhcp")
            # DHCPのみのシンプルなLAN設定（必要なら追加）
            ;;
    esac

    # 8. 設定をコミット
    uci commit system >/dev/null 2>&1
    uci commit wireless >/dev/null 2>&1
    uci commit network
    uci commit dhcp  
    uci commit firewall

    logger -t auto-config "OpenWrt auto configuration completed successfully (ISP mode: $isp_mode, Region: $REGION_NAME[$REGION_CODE], Country: $COUNTRY, Timezone: $TIMEZONE)"
    echo "All done!"
    return 0
}

openwrt_config_main "$@"

exit 0
