# all in one scripts 2 解説

<details><summary><b>1 基本設定</b></summary>

- 言語 [auto]
- 国コード [auto]
- タイムゾーン [auto]
- 地域名 [auto]
- デバイス名
- ルートパスワード
- LAN IPv4アドレス [192.168.1.1/24]
- LAN IPv6アドレス [fd00::1/64]
- SSHインターフェース [lan]
- SSHポート [22]
- NTPドメイン [pool.ntp.org]
- 診断用アドレス [one.one.one.one]
- フローオフロード方式 [1 無効 /2 ソフトウェアフローオフロード /3 ハードウェアフローオフロード]

</details>

<details><summary><b>2 Wi-Fi設定</b></summary>
  
- Wi-Fiモード
  - 1 標準
    - Wi-Fi SSID [OpenWrt]
    - Wi-Fiパスワード [password]
  - 2 Usteer【DFS対策兼】
    - Wi-Fi SSID [OpenWrt]
    - Wi-Fiパスワード [password]
    - モビリティドメイン [4f57]
    - ミニマムSNR [30 15 5]
  - 3 3 MLO: Wi-Fi 7 (BE)【検証用】
    - Wi-Fi SSID [OpenWrt]
    - Wi-Fiパスワード [password]
    - MLD ID [4f575254]
  - 4 無効
    - Wi-Fi無効

</details>

<details><summary><b>3 インターネット接続</b></summary>

- 自動検出
   - 自動検出: MAP-E
     - ISP:
     - AS番号:
     - IPv6 Address for Lookup
     - Static Prefix
     - Peer Address (BR)
     - IPv4 Address
     - IPv4 Prefix
     - IPv6 Prefix
     - IPv6 Prefix Length
     - EA-len
     - PSID Length
     - PSID Offset
     - この自動検出された設定を使用しますか？ 
   - 自動検出: DS-LITE
     - ISP情報
     - AFTRアドレス
- 接続タイプ
  - 1 自動
    - 自動検出（ループ）
  - 2 DHCP
    - DHCP
  - 3 PPPoE
    - ユーザー名
    - パスワード
  - 4 DS-Lite
    - AFTRタイプ
      - transix
        - エリア
          - East Japan
            - AFTRアドレス [2404:8e00::feed:100]
          - West Japan
            - AFTRアドレス [2404:8e01::feed:100]
      - Xpass
        - AFTRアドレス [dgw.xpass.jp]
      - v6connect
        - AFTRアドレス [dslite.v6connect.net]
  - 5 MAP-E
    - IPv6アドレス（[自動取得]
    - アドレスタイプ [GUA/PD]
      - 固定 (Static) 
        - option ip6prefix (Static)
      - 委任 (PD) 
    - option peeraddr (BR)
    - option ipaddr
    - option ip4prefixlen
    - option ip6prefix
    - option ip6prefixlen
    - option ealen
    - option psidlen
    - option offset
  - 6 Dumb AP
    - IPアドレス [192.168.1.2/24]
    - ゲートウェイ [192.168.1.1/24]
  - 7 無効
    - インターネット無効

</details>

<details><summary><b>4 チューニング</b></summary>

- 動的ネットワーク最適化 [自動]
  - 1 自動
    - 自動最適化
  - 2 手動
    - TCPライトメモリ [4096 131072 8388608]
    - コネクショントラッキング最大値 [131072]
    - ネットワークデバイスバックログ [5000]
    - ソケット最大接続数 [16384]
    - TCP輻輳制御 [cubic/BBR]
  - 3 無効
    - 最適化無効 
- DNSサーバー設定 [自動]
  - 1 自動
    - 自動最適化 
  - 手動
    - キャッシュサイズ [10000]
    - ネガティブキャッシュ [0]
  - 無効
    - 最適化無効 

</details>

<details><summary><b>5 パッケージ</b></summary>

1 言語パッケージ
- 動的言語選択UI
  - LuCIインターフェースの言語を選択
    - bg
    - ca
    - cs
    - de
    - el
    - en
    - es
    - fr
    - he
    - hi
    - hu
    - it
    - ja
    - ko
    - mr
    - ms
    - no
    - pl
    - pt-br
    - ro
    - ru
    - sk
    - sv
    - tr
    - uk
    - vi
    - zh-cn
    - zhtw

2 基本システム機能
- luci-app-ttyd
- openssh-sftp-server
- luci-app-commands
- luci-app-filebrowser

3 システム管理
- luci-app-attendedsysupgrade [GUI版で初期選択]
- owut [✓]
- auc
- luci-app-irqbalance
- logrotate

4 システム監視
- luci-app-watchcat
- netdata
- htop
  - collectd
  - collectd-mod-thermal
- btop
- prometheus-node-exporter-lua
  - prometheus-node-exporter-lua-openwrt
  - prometheus-node-exporter-lua-nat_traffic
  - prometheus-node-exporter-lua-thermal

5 ネットワーク管理
- luci-app-sqm
  - tc-full
- luci-app-statistics
  - collectd
  - rrdtool1
- luci-app-nlbwmon
- luci-app-vnstat2
- luci-app-wol
- luci-app-ddns
  - wget-ssl
  - bind-host
- luci-app-tor
- luci-app-mwan3
  - mwan3
- luci-app-pbr

6 Wi-Fi管理
- luci-app-wifischedule
- luci-app-travelmate

7 モデム対応
- luci-proto-modemmanager
  - kmod-usb-wdm
  - kmod-usb-net-cdc-mbim
  - kmod-usb-net-qmi-wwan
  - uqmi
  - mbim-utils
  - screen

8 セキュリティツール
- fail2ban
- luci-app-banip
- luci-app-acme

9 ネットワーク診断ツール
- mtr-nojson
- nmap
- tcpdump
- iperf3
- speedtest-netperf
- iftop
- bind-dig
- ethtool

10 システム管理ツール
- tmux
- nano-plus
- lsof
- rsync
- curl

11 テーマとダッシュボード
- luci-mod-dashboard [GUI版]
- luci-theme-openwrt
  - luci-theme-material
  - luci-theme-openwrt-2020

12 ユーティリティ
- luci-app-advanced-reboot
- luci-proto-wireguard
  - luci-app-wireguard
  - wireguard-tools
- zerotier
- tailscale
- luci-app-dockerman
  - docker-compose
  - docker
- luci-app-openvpn
- luci-app-minidlna
- smartmontools
- whiptail [✓]
  - libnewt

13 USBストレージ対応
- kmod-usb-storage-uas
  - block-mount
  - usbutils
  - gdisk
- dosfstools
  - kmod-fs-vfat
- e2fsprogs
  - kmod-fs-ext4
- f2fs-tools
  - kmod-fs-f2fs
- exfat-fsck
  - kmod-fs-exfat
- ntfs-3g
  - kmod-fs-ntfs3
- hfsfsck
  - kmod-fs-hfs
  - kmod-fs-hfsplus
- luci-app-hd-idle
- kmod-usb-ledtrig-usbport
- kmod-usb-net-rndis
  - kmod-usb-net-cdc-ether
- kmod-usb-gadget-eth
  - kmod-usb-dwc2
- resize2fs
  - parted
  - f2fs-tools

14 ファイル共有
- luci-app-samba4
  - wsdd2
- luci-app-ksmbd
  - ksmbd-avahi-service
- luci-app-transmission
- syncthing

15 Webサーバーツール
- apache
  - htpasswd機能を含む

16 暗号化DNS
- luci-app-https-dns-proxy (DoH)
- stubby (DoT)

</details>

<details><summary><b>6 カスタムフィード</b></summary>

- gSpotx2fリポジトリ
  - luci-app-log-viewer
  - luci-app-cpu-status
  - luci-app-cpu-perf
  - luci-app-temp-status
  - luci-app-disks-info
  - internet-detector
  - luci-app-internet-detector
  - internet-detector-mod-modem
  - internet-detector-mod-email
- jerrykukuリポジトリ
  - luci-theme-argon

</details>

<details><summary><b>7 カスタムスクリプト</b></summary>

- アドガードホーム
  - OpenWrtパッケージのインストール
    - ユーザーID [admin]
    - パスワード（8文字以上） [password]
    - WEBポート [8000]
    - DNSポート [53]
    - LANアドレス [192.168.1.1]
  - 公式バイナリのインストール
    - ユーザーID [admin]
    - パスワード（8文字以上） [password]
    - WEBポート [8000]
    - DNSポート [53]
    - LANアドレス [192.168.1.1]
  - ID及びパスワード変更
    - ユーザーID
    - パスワード（8文字以上）
    - WEBポート
  - アドガードホームをリムーブ
- ファイルブラウザー
  - ファイルブラウザーをインストール
    - ユーザーID [admin]
    - パスワード（8文字以上） [admin12345678]
    - WEBポート [8080]
    - 言語 [en]
    - ルートパス [/]
  - ファイルブラウザーをリムーブ

</details>

<details><summary><b>8 ロールバック</b></summary>

- バックアップ復元パス [/etc/aios2/backup]
- ロールバックポイント一覧
  - === この設定適用前の状態に復元 ===
  - ※ロールバックで復元されるのは設定のみです
  - `YYYYMMDD HHMMSS`（最大保存数: 10個）
  - =================================
  - この時点の設定に戻しますか？
  - ※現在の設定は、ロールバック前に自動的にバックアップされます。

</details>

<details><summary><b>9 設定確認と適用</b></summary>

- 🔵 パッケージ変更
  - 削除対象（remove）
  - インストール対象（install）
  - 言語パッケージの自動追加
  - 依存関係の自動解決
- 🟢 カスタムフィード変更
  - 削除対象（remove）
  - インストール対象（install）
- 🟡 設定変数
  - SETUP_VARSの内容を全表示
- 🔴 カスタムスクリプト
  - インストール（install）
  - 削除（remove）
  - 設定変数（SELECTED_OPTION、CONFIRMED以外）

</details>
