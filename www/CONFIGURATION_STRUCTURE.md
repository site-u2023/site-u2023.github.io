# 設定構造

### メインメニュー
<details><summary>1 基本設定</summary>

- 言語 [auto]
- 国コード [auto]
- エリア [auto]
- タイムゾーン [auto]
- 地域名 [auto]
- デバイス名
- ルートパスワード
- LAN IPv4アドレス [192.168.1.1]
- LAN IPv6アドレス
- SSHインターフェース [lan]
- SSHポート [22]
- フローオフロード方式 [無効]
- バックアップ復元パス [/root/backup.tar.gz] [GUI版]

</details>

<details><summary>2 Wi-Fi設定</summary>

- Wi-Fiモード [標準]
  - 標準
    - Wi-Fi SSID [OpenWrt]
    - Wi-Fiパスワード [password]
  - Usteer
    - Wi-Fi SSID [OpenWrt]
    - Wi-Fiパスワード [password]
    - モビリティドメイン [4f57]
    - ミニマムSNR [30 15 5]
  - 無効

</details>

<details><summary>3 インターネット接続</summary>

- 接続タイプ [自動]
  - 自動
    - MAP-E
    - DS-Lite
  - DHCP
  - PPPoE
    - ユーザー名
    - パスワード
  - DS-Lite
    - AFTRタイプ
      - gw.transix.jp
        - エリア
          - East Japan
            - AFTRアドレス [2404:8e00::feed:100]
          - West Japan
            - AFTRアドレス [2404:8e01::feed:100]
      - dgw.xpass.jp
        - AFTRアドレス [dgw.xpass.jp]
      - dslite.v6connect.net
        - AFTRアドレス [dslite.v6connect.net]
  - MAP-E
    - アドレスタイプ [GUA/PD]
      - GUA
      - PD
    - GUAプレフィックス
    - ピアアドレス
    - EA長
    - IPv4アドレス
    - IPv4プレフィックス長
    - IPv6プレフィックス
    - IPv6プレフィックス長
    - PSIDオフセット
    - PSID長
  - APモード
    - IPアドレス [192.168.1.2]
    - ゲートウェイ [192.168.1.1]

</details>

<details><summary>4 チューニング</summary>

- 動的ネットワーク最適化 [自動]
  - 自動
  - 手動
  - 無効
- 手動設定項目
  - TCPリードメモリ [4096 131072 8388608]
  - TCPライトメモリ [4096 131072 8388608]
  - コネクショントラッキング最大値 [131072]
  - ネットワークデバイスバックログ [5000]
  - ソケット最大接続数 [16384]
  - TCP輻輳制御 [cubic]
- DNSサーバー最適化 [自動]
  - 自動
  - 手動
  - 無効
- DNS手動設定項目
  - キャッシュサイズ [10000]
  - ネガティブキャッシュ [0]

</details>

<details><summary>5 パッケージインストール</summary>

- 基本システム機能
  - luci-app-ttyd [✓ GUI版]
  - openssh-sftp-server [✓ GUI版]
  - luci-app-commands
  - luci-app-filebrowser
- システム管理
  - luci-app-irqbalance
- ネットワーク管理
  - luci-app-sqm
    - tc-full
  - luci-app-statistics
    - collectd
    - rrdtool1
  - luci-app-nlbwmon
  - luci-app-vnstat2
  - luci-app-wol
  - luci-app-ddns
  - luci-app-tor
  - luci-app-mwan3
    - mwan3
- Wi-Fi管理
  - luci-app-wifischedule
  - luci-app-travelmate
- モデム対応
  - luci-proto-modemmanager
    - kmod-usb-wdm
    - kmod-usb-net-cdc-mbim
    - kmod-usb-net-qmi-wwan
    - uqmi
    - mbim-utils
    - screen
- セキュリティツール
  - fail2ban
  - luci-app-banip
  - luci-app-acme
- システム監視
  - luci-app-watchcat
- ネットワーク診断ツール
  - htop
    - collectd
    - collectd-mod-thermal
  - mtr-nojson
  - nmap
  - tcpdump
  - iperf3
  - speedtest-netperf
  - iftop
  - bind-dig
  - ethtool
- システム管理ツール
  - tmux
  - nano-plus
  - lsof
  - rsync
  - curl
  - netdata
- テーマとダッシュボード
  - luci-mod-dashboard [✓ GUI版]
  - luci-theme-openwrt
    - luci-theme-material
    - luci-theme-openwrt-2020
- ユーティリティ
  - luci-app-attendedsysupgrade [✓ GUI版]
    - owut
    - auc
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
  - logrotate
  - whiptail
    - libnewt
- USBストレージ対応
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
- ファイル共有
  - luci-app-samba4
    - wsdd2
  - luci-app-transmission
  - syncthing
- DNS & プライバシー
  - luci-app-adblock-fast
    - japan-tofukko-filter
  - luci-app-https-dns-proxy
  - stubby
  - luci-app-nextdns

- Setup連動パッケージ（自動管理）
  - map（MAP-E用）
  - coreutils-sha1sum（MAP-E用）
  - ds-lite（DS-Lite用）
  - luci-app-usteer（Usteer Wi-Fi用）

</details>

<details><summary>6 カスタムフィードパッケージインストール</summary>

- 1 gSpotx2fリポジトリ
- 2 jerrykukuリポジトリ

</details>

<details><summary>7 カスタムスクリプト</summary>

- AdGuard Home
  - OpenWrtパッケージのインストール
  - 公式バイナリのインストール
  - 削除

</details>

<details><summary>8 復元ポイント [TUI版]</summary>

- バックアップ復元パス [/etc/aios2/backup]
- 復元ポイント一覧
  - backup-YYYYMMDD_HHMMSS.tar.gz
  - 最大保存数: 10個
  - 復元時に現在の設定を自動バックアップ

</details>

<details><summary>9 設定確認と適用</summary>

- Select/Exit
  - デバイス情報
  - 設定パッケージ
  - 設定カスタムパッケージ
    - 1 gSpotx2fリポジトリ
    - 2 jerrykukuリポジトリ
  - 設定変数
  - postinst.sh
  - customfeeds.sh
    - 1 gSpotx2fリポジトリ
    - 2 jerrykukuリポジトリ
  - setup.sh
  - 設定適用

</details>
