[ -n "${enable_adguardhome}" ] && {
AGH_HASH=$(htpasswd -B -n -b "" "${agh_pass:-password}" 2>/dev/null | cut -d: -f2)
[ -z "$AGH_HASH" ] && { echo "Error: Failed to generate AdGuard Home password hash"; exit 1; }
cat > /etc/adguardhome.yaml << 'AGHEOF'
http:
  address: 0.0.0.0:{{WEB_PORT}}
  session_ttl: 720h
users:
  - name: {{AGH_USER}}
    password: {{AGH_HASH}}
auth_attempts: 5
block_auth_min: 15
dns:
  port: {{DNS_PORT}}
  refuse_any: true
  upstream_dns:
    - '# LAN domain intercept'
    - '[/lan/]127.0.0.1:{{DNS_BACKUP_PORT}}'
    - '# NTP service'
    - '[/*.pool.ntp.org/]1.1.1.1'
    - '[/*.pool.ntp.org/]1.0.0.1'
    - '[/*.pool.ntp.org/]2606:4700:4700::1111'
    - '[/*.pool.ntp.org/]2606:4700:4700::1001'
    - '# DNS-over-QUIC'
    - quic://unfiltered.adguard-dns.com
    - '# DNS-over-TLS'
    - tls://1dot1dot1dot1.cloudflare-dns.com
    - tls://dns.google
    - tls://jp.tiar.app
    - tls://dns.nextdns.io
    - '# DNS-over-HTTPS(coercion HTTP/3)'
    - h3://cloudflare-dns.com/dns-query
    - h3://dns.google/dns-query
    - h3://unfiltered.adguard-dns.com/dns-query
    - h3://jp.tiarap.org/dns-query
    - h3://dns.nextdns.io
  bootstrap_dns:
    - 1.1.1.1
    - 1.0.0.1
    - 8.8.8.8
    - 8.8.4.4
    - 172.104.93.80
    - 129.250.35.250
    - 129.250.35.251
    - 2606:4700:4700::1111
    - 2606:4700:4700::1001
    - 2001:4860:4860::8888
    - 2001:4860:4860::8844
    - 2400:8902::f03c:91ff:feda:c514
    - 2001:418:3ff::53
    - 2001:418:3ff::1:53
  fallback_dns:
    - https://cloudflare-dns.com/dns-query
    - https://dns.google/dns-query
    - https://unfiltered.adguard-dns.com/dns-query
    - https://jp.tiar.app/dns-query
    - https://dns.nextdns.io
  upstream_mode: parallel
  cache_size: 1048576
  enable_dnssec: false
  use_private_ptr_resolvers: true
  local_ptr_upstreams:
    - 127.0.0.1:{{DNS_BACKUP_PORT}}
tls:
  enabled: false
filters:
  - enabled: true
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_1.txt
    name: AdGuard DNS filter
    id: 1
  - enabled: false
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_2.txt
    name: AdAway Default Blocklist
    id: 2
  - enabled: false
    url: https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_7_Japanese/filter.txt
    name: AdGuard Japanese filter
    id: 1764215105
  - enabled: false
    url: https://raw.githubusercontent.com/tofukko/filter/master/Adblock_Plus_list.txt
    name: 豆腐フィルタ
    id: 1764215106
user_rules:
  - '# 日本の主要サービス'
  - '@@||amazon.co.jp^$important'
  - '@@||rakuten.co.jp^$important'
  - '@@||yahoo.co.jp^$important'
  - '# LINE関連'
  - '@@||line.me^$important'
  - '@@||line-scdn.net^$important'
dhcp:
  enabled: false
filtering:
  parental_enabled: false
  safebrowsing_enabled: false
log:
  file: ""
schema_version: 29
AGHEOF
sed -i "s|{{AGH_USER}}|${agh_user:-admin}|g" /etc/adguardhome.yaml
sed -i "s|{{AGH_HASH}}|${AGH_HASH}|g" /etc/adguardhome.yaml
sed -i "s|{{WEB_PORT}}|${agh_web_port:-8000}|g" /etc/adguardhome.yaml
sed -i "s|{{DNS_PORT}}|${agh_dns_port:-53}|g" /etc/adguardhome.yaml
sed -i "s|{{DNS_BACKUP_PORT}}|${agh_dns_backup_port:-54}|g" /etc/adguardhome.yaml
chmod 600 /etc/adguardhome.yaml
local SEC=dhcp
SET @dnsmasq[0].noresolv='1'
SET @dnsmasq[0].cachesize='0'
SET @dnsmasq[0].rebind_protection='0'
SET @dnsmasq[0].port="${agh_dns_backup_port:-54}"
SET @dnsmasq[0].domain='lan'
SET @dnsmasq[0].local='/lan/'
SET @dnsmasq[0].expandhosts='1'
DEL @dnsmasq[0].server
ADDLIST @dnsmasq[0].server="127.0.0.1#${agh_dns_port:-53}"
ADDLIST @dnsmasq[0].server="::1#${agh_dns_port:-53}"
DEL lan.dhcp_option
[ -n "${lan_ip_address}" ] && ADDLIST lan.dhcp_option="6,${lan_ip_address}"
DEL lan.dhcp_option6
local SEC=firewall
local AGH_RULE="adguardhome_dns_${agh_dns_port:-53}"
DEL "${AGH_RULE}" 2>/dev/null || true
SET ${AGH_RULE}=redirect
SET ${AGH_RULE}.name="AdGuard Home DNS Redirect"
SET ${AGH_RULE}.family='any'
SET ${AGH_RULE}.src='lan'
SET ${AGH_RULE}.dest='lan'
ADDLIST ${AGH_RULE}.proto='tcp'
ADDLIST ${AGH_RULE}.proto='udp'
SET ${AGH_RULE}.src_dport="${agh_dns_port:-53}"
SET ${AGH_RULE}.dest_port="${agh_dns_port:-53}"
SET ${AGH_RULE}.target='DNAT'
[ -z "${apache_keep}" ] && { [ -f /usr/bin/htpasswd ] && { cp /usr/bin/htpasswd /tmp/htpasswd 2>/dev/null; case "$PACKAGE_MANAGER" in opkg) opkg remove apache >/dev/null 2>&1 || true ;; apk) apk del apache >/dev/null 2>&1 || true ;; esac; mv /tmp/htpasswd /usr/bin/htpasswd 2>/dev/null; chmod +x /usr/bin/htpasswd 2>/dev/null; }; }
}


# --------------------------------------------------
# adguardhome.yaml default
# --------------------------------------------------

    # Create YAML configuration
    cat > /etc/adguardhome.yaml << 'AGHEOF'
http:
  address: 0.0.0.0:{{WEB_PORT}}
  session_ttl: 720h
users:
  - name: {{AGH_USER}}
    password: {{AGH_HASH}}
auth_attempts: 5
block_auth_min: 15

dns:
  port: {{DNS_PORT}}
  refuse_any: true
  upstream_dns:
    - '[/lan/]127.0.0.1:{{DNS_BACKUP_PORT}}'
    - '[/*.pool.ntp.org/]1.1.1.1'
    - '[/*.pool.ntp.org/]1.0.0.1'
    - 'quic://unfiltered.adguard-dns.com'
    - 'tls://1dot1dot1dot1.cloudflare-dns.com'
    - 'tls://dns.google'
    - 'h3://cloudflare-dns.com/dns-query'
    - 'h3://dns.google/dns-query'
  bootstrap_dns:
    - 1.1.1.1
    - 1.0.0.1
    - 8.8.8.8
    - 2606:4700:4700::1111
  fallback_dns:
    - https://cloudflare-dns.com/dns-query
    - https://dns.google/dns-query
  upstream_mode: parallel
  cache_size: 1048576
  enable_dnssec: false
  use_private_ptr_resolvers: true
  local_ptr_upstreams:
    - 127.0.0.1:{{DNS_BACKUP_PORT}}

tls:
  enabled: false

filters:
  - enabled: true
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_1.txt
    name: AdGuard DNS filter
    id: 1

dhcp:
  enabled: false

filtering:
  parental_enabled: false
  safebrowsing_enabled: false

log:
  file: ""

schema_version: 29
AGHEOF
