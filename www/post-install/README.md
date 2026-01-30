# postinst.json 解説

### 基本システム機能

Webターミナル
<details>
<summary>luci-app-ttyd</summary>

- ブラウザからルーターのシェルにアクセス
- SSH不要でコマンドライン操作

</details>

SFTPサーバー
<details>
<summary>openssh-sftp-server</summary>

- SSH経由でファイル転送
- SFTPクライアントで接続
- パスワード認証または鍵認証

</details>

カスタムコマンド実行
<details>
<summary>luci-app-commands</summary>

- コマンドをLuCI上のボタンとして登録
- ワンクリックでスクリプト実行

</details>

Webファイルブラウザ
<details>
<summary>luci-app-filebrowser</summary>

- ブラウザからルーターのファイルシステムを操作
- アップロード、ダウンロード、編集

</details>

### システム管理

自動システムアップグレード
<details>
<summary>luci-app-attendedsysupgrade</summary>

- LuCI上でファームウェア更新を自動化
- 現在のパッケージを維持したまま更新
- 依存: owut, auc

</details>

ファームウェア更新ツール
<details>
<summary>owut</summary>

- OpenWrt Update Tool

</details>

システムアップグレードクライアント
<details>
<summary>auc</summary>

Attended sysUpgrade Client

</details>

IRQ割り込みバランサー
<details>
<summary>luci-app-irqbalance</summary>

- マルチコアCPUで割り込み処理を分散
- CPU負荷を均等化

</details>

ログローテーション
<details>
<summary>logrotate</summary>

- ログファイルを自動で圧縮・削除
- ディスク容量の節約

</details>

### システム監視

Watchcatシステム監視
<details>
<summary>luci-app-watchcat</summary>

- ネットワーク接続を定期的にチェック
- 接続断が続く場合、自動再起動
- Pingテストやインターフェース監視

</details>

netdataリアルタイム監視
<details>
<summary>netdata</summary>

- Webダッシュボードでシステム監視
- CPU、メモリ、ネットワーク、ディスクI/Oを可視化
- アラート機能
- 注意: メモリ512MB以上推奨

</details>

htopプロセスモニター
<details>
<summary>htop</summary>

- CPUコア別使用率をリアルタイム表示
- メモリ、スワップ使用量を視覚化
- プロセス一覧とソート、検索機能
- 依存: collectd, collectd-mod-thermal

</details>

データ収集デーモン
<details>
<summary>collectd</summary>

- システム統計情報を収集

</details>

CPU温度センサーモジュール
<details>
<summary>collectd-mod-thermal</summary>

- 温度データの収集

</details>

btopプロセスモニター
<details>
<summary>btop</summary>

- 高機能リソースモニター
- CPU、メモリ、ディスク、ネットワークを視覚化

</details>

Prometheus Node Exporter
<details>
<summary>prometheus-node-exporter-lua</summary>

- Prometheusメトリクスエンドポイント
- OpenWrt、NAT、温度データをエクスポート
- 依存: prometheus-node-exporter-lua-openwrt, prometheus-node-exporter-lua-nat_traffic, prometheus-node-exporter-lua-thermal

</details>

Prometheus OpenWrtモジュール
<details>
<summary>prometheus-node-exporter-lua-openwrt</summary>

- OpenWrt固有のメトリクス収集

</details>

Prometheus NATトラフィックモジュール
<details>
<summary>prometheus-node-exporter-lua-nat_traffic</summary>

- NATトラフィックメトリクス収集

</details>

Prometheus温度モジュール
<details>
<summary>prometheus-node-exporter-lua-thermal</summary>

- 温度メトリクス収集

</details>

### ネットワーク管理

帯域制御
<details>
<summary>luci-app-sqm</summary>

- アップロード/ダウンロード速度を個別設定
- 依存: tc-full

</details>

トラフィック制御ツール
<details>
<summary>tc-full</summary>

- SQMで使用

</details>

システム統計グラフ
<details>
<summary>luci-app-statistics</summary>

- CPU、メモリ、ネットワークトラフィックをグラフ化
- 依存: collectd, rrdtool1

</details>

時系列データベースとグラフ生成
<details>
<summary>rrdtool1</summary>

- 統計データの保存と可視化

</details>

帯域幅モニター
<details>
<summary>luci-app-nlbwmon</summary>

- デバイス・ホスト別の通信量を記録
- 月間・日間の通信量統計

</details>

vnStat2トラフィック統計
<details>
<summary>luci-app-vnstat2</summary>

- トラフィック統計を保存
- 月間、日間、時間別のデータ記録

</details>

LAN内のPCをネットワーク経由で起動
<details>
<summary>luci-app-wol</summary>

- Wake on LAN
- MACアドレスを登録

</details>

動的IPアドレスをドメイン名に自動更新
<details>
<summary>luci-app-ddns</summary>

- Dynamic DNS
- No-IP、DuckDNS等のサービスに対応
- 依存: wget-ssl, bind-host

</details>

wget SSL版
<details>
<summary>wget-ssl</summary>

- HTTPS対応版wget

</details>

DNSホストルックアップツール
<details>
<summary>bind-host</summary>

- DNS問い合わせツール

</details>

Tor匿名化ネットワーク
<details>
<summary>luci-app-tor</summary>

- Tor経由で匿名通信

</details>

マルチWAN管理
<details>
<summary>luci-app-mwan3</summary>

- 複数WAN回線を束ねて負荷分散
- フェイルオーバー（回線障害時自動切替）
- 回線別ルーティングルール設定
- 依存: mwan3
- 注意: iptablesベース

</details>

マルチWANデーモン
<details>
<summary>mwan3</summary>

- 複数WAN回線の管理

</details>

ポリシーベースルーティング
<details>
<summary>luci-app-pbr</summary>

- 送信元/宛先IPやポートに基づくルーティング
- VPN経由ルーティング設定
- ドメインベースルーティング

</details>

### Wi-Fi管理

Wi-Fiスケジューラー
<details>
<summary>luci-app-wifischedule</summary>

- 時間帯別にWi-Fiオン/オフ自動化
- 曜日別スケジュール設定

</details>

ルーター自身を他のWi-Fiに接続
<details>
<summary>luci-app-travelmate</summary>

- 複数SSID登録で自動接続

</details>

### モデムサポート

ModemManagerプロトコル
<details>
<summary>luci-proto-modemmanager</summary>

- 4G/5Gモデムをネットワークインターフェースとして管理
- MBIM、QMI対応モデムをサポート
- SMS送受信機能
- 依存: kmod-usb-wdm, kmod-usb-net-cdc-mbim, kmod-usb-net-qmi-wwan, uqmi, mbim-utils, screen

</details>

USBワイヤレスデバイス管理カーネルモジュール
<details>
<summary>kmod-usb-wdm</summary>

- モデム通信に使用

</details>

MBIMプロトコルカーネルモジュール
<details>
<summary>kmod-usb-net-cdc-mbim</summary>

- 4G/5Gモデム通信

</details>

QMIプロトコルカーネルモジュール
<details>
<summary>kmod-usb-net-qmi-wwan</summary>

- 4G/5Gモデム通信

</details>

QMI管理ツール
<details>
<summary>uqmi</summary>

- モデム制御用コマンドラインツール

</details>

MBIM管理ツール
<details>
<summary>mbim-utils</summary>

- モデム制御用コマンドラインツール

</details>

ターミナルマルチプレクサ
<details>
<summary>screen</summary>

- セッション管理

</details>

### セキュリティツール

Fail2Ban侵入防止
<details>
<summary>fail2ban</summary>

- ログ監視で不審なアクセスを検出
- 一定回数失敗したIPを自動ブロック
- SSH、HTTP等のブルートフォース攻撃を防御

</details>

BanIP IPブロック
<details>
<summary>luci-app-banip</summary>

- IPリストで自動ブロック
- ブラックリストフィードに対応
- 国別IP範囲のブロック

</details>

ACME SSL証明書
<details>
<summary>luci-app-acme</summary>

- SSL証明書の自動取得・更新
- Let's Encrypt、ZeroSSL等に対応

</details>

### ネットワーク診断ツール

tracerouteとpingを組み合わせ
<details>
<summary>mtr-nojson</summary>

MTR
- 各ホップのパケットロス率と遅延表示

</details>

Nmapポートスキャナー
<details>
<summary>nmap</summary>

- ネットワーク内のデバイスを検出
- 開いているポートとサービスを調査

</details>

tcpdumpパケットキャプチャ
<details>
<summary>tcpdump</summary>

- ネットワークパケットをキャプチャ
- プロトコル解析
- pcapファイル出力

</details>

iPerf3帯域測定
<details>
<summary>iperf3</summary>

- ネットワーク帯域幅をテスト
- TCP/UDP スループット測定

</details>

インターネット速度テスト
<details>
<summary>speedtest-netperf</summary>

- ダウンロード/アップロード速度測定

</details>

iftop帯域幅モニター
<details>
<summary>iftop</summary>

- リアルタイムで接続別トラフィック表示
- 送信/受信を個別表示

</details>

dig DNSクエリツール
<details>
<summary>bind-dig</summary>

- DNS問い合わせツール
- DNSサーバーの応答テスト
- レコードタイプ別クエリ

</details>

ethtoolイーサネット診断
<details>
<summary>ethtool</summary>

- イーサネットポートの状態確認
- リンク速度、デュプレックス設定
- NICドライバ情報

</details>

### システム管理ツール

tmuxターミナルマルチプレクサ
<details>
<summary>tmux</summary>

- ターミナルマルチプレクサ
- SSH切断してもセッション維持
- 画面分割

</details>

nanoテキストエディタ
<details>
<summary>nano-plus</summary>

- テキストエディタ
- シンタックスハイライト対応

</details>

lsofファイル/ポート使用確認
<details>
<summary>lsof</summary>

- プロセスが開いているファイルを確認
- ポート使用中のプロセスを特定

</details>

rsyncファイル同期
<details>
<summary>rsync</summary>

- 差分転送でファイル同期
- SSH経由でリモートサーバーと同期

</details>

curl HTTPクライアント
<details>
<summary>curl</summary>

- コマンドラインからHTTP/HTTPS通信
- API呼び出しやファイルダウンロード

</details>

### テーマとダッシュボード

LuCIダッシュボード
<details>
<summary>luci-mod-dashboard</summary>

- システム状態を一画面で把握
- CPU、メモリ、接続数、トラフィックを表示
- ウィジェット

</details>

OpenWrt公式テーマ
<details>
<summary>luci-theme-openwrt</summary>

</details>

マテリアルデザインテーマ
<details>
<summary>luci-theme-material</summary>

</details>

OpenWrt 2020版テーマ
<details>
<summary>luci-theme-openwrt-2020</summary>

</details>

### ユーティリティ

デュアルファームウェア再起動管理
<details>
<summary>luci-app-advanced-reboot</summary>

- デュアルファームウェア対応デバイス用
- Linksys、Xiaomi、ZyXEL等で利用可能
- パーティション切替と再起動

</details>

WireGuardプロトコル
<details>
<summary>luci-proto-wireguard</summary>

- L3 VPN
- 依存: luci-app-wireguard, wireguard-tools

</details>

WireGuard LuCI管理画面
<details>
<summary>luci-app-wireguard</summary>

- VPN接続の設定

</details>

WireGuardコマンドラインツール
<details>
<summary>wireguard-tools</summary>

- wg, wg-quickコマンド

</details>

仮想LANでデバイスを接続
<details>
<summary>zerotier</summary>

- NAT越え

</details>

Tailscaleメッシュ VPN
<details>
<summary>tailscale</summary>

- WireGuardベースのメッシュネットワーク
- デバイス間直接接続

</details>

Docker コンテナ管理
<details>
<summary>luci-app-dockerman</summary>

- LuCI上でDockerコンテナを管理
- イメージ、コンテナ、ネットワーク、ボリューム操作
- 依存: docker-compose
- 注意: iptablesベース、メモリ1GB以上推奨

</details>

コンテナオーケストレーション
<details>
<summary>docker-compose</summary>

- 複数コンテナの定義と実行

</details>

Dockerエンジン
<details>
<summary>docker</summary>

- コンテナ実行環境

</details>

サーバー・クライアント両対応
<details>
<summary>luci-app-openvpn</summary>

OpenVPN

</details>

MiniDLNAメディアサーバー
<details>
<summary>luci-app-minidlna</summary>

- DLNA/UPnP-AVメディアサーバー
- テレビ、ゲーム機で動画・音楽を再生

</details>

S.M.A.R.T.監視ツール
<details>
<summary>smartmontools</summary>

- ディスクの健康状態を監視
- S.M.A.R.T.情報の取得
- ディスク温度、エラーカウント確認

</details>

whiptailダイアログツール
<details>
<summary>whiptail</summary>

- TUIダイアログ表示ツール
- 依存: libnewt

</details>

newt ライブラリ
<details>
<summary>libnewt</summary>

- whiptailで使用

</details>

### USBストレージサポート

USB 3.0高速転送モード（UAS）カーネルモジュール
<details>
<summary>kmod-usb-storage-uas</summary>

- USBメモリ、外付けHDD/SSDを認識
- 依存: block-mount, usbutils, gdisk

</details>

ブロックデバイスの自動マウント
<details>
<summary>block-mount</summary>

- USB/SDカードの自動認識

</details>

USBデバイス情報表示ツール
<details>
<summary>usbutils</summary>

- lsusbコマンド

</details>

GPTパーティション管理ツール
<details>
<summary>gdisk</summary>

- パーティションの作成、削除、編集

</details>

FAT32ファイルシステムツール
<details>
<summary>dosfstools</summary>

- フォーマット、チェック
- 依存: kmod-fs-vfat

</details>

FAT32ファイルシステムカーネルモジュール
<details>
<summary>kmod-fs-vfat</summary>

- FAT32の読み書き

</details>

ext4ファイルシステムツール
<details>
<summary>e2fsprogs</summary>

- フォーマット、チェック、リサイズ
- 依存: kmod-fs-ext4

</details>

ext4ファイルシステムカーネルモジュール
<details>
<summary>kmod-fs-ext4</summary>

- ext4の読み書き

</details>

F2FSファイルシステムツール
<details>
<summary>f2fs-tools</summary>

- フォーマット、チェック
- 依存: kmod-fs-f2fs

</details>

F2FSファイルシステムカーネルモジュール
<details>
<summary>kmod-fs-f2fs</summary>

- F2FSの読み書き

</details>

exFATファイルシステムチェックツール
<details>
<summary>exfat-fsck</summary>

- ファイルシステムの検証と修復
- 依存: kmod-fs-exfat

</details>

exFATファイルシステムカーネルモジュール
<details>
<summary>kmod-fs-exfat</summary>

- exFATの読み書き

</details>

NTFSファイルシステムツール
<details>
<summary>ntfs-3g</summary>

- NTFSの読み書き
- 依存: kmod-fs-ntfs3

</details>

NTFSファイルシステムカーネルモジュール
<details>
<summary>kmod-fs-ntfs3</summary>

- NTFSの読み書き

</details>

HFS/HFS+ファイルシステムチェックツール
<details>
<summary>hfsfsck</summary>

- ファイルシステムの検証と修復
- 依存: kmod-fs-hfs, kmod-fs-hfsplus

</details>

HFSファイルシステムカーネルモジュール
<details>
<summary>kmod-fs-hfs</summary>

- HFSの読み書き

</details>

HFS+ファイルシステムカーネルモジュール
<details>
<summary>kmod-fs-hfsplus</summary>

- HFS+の読み書き

</details>

HD-Idleディスク省電力
<details>
<summary>luci-app-hd-idle</summary>

- 一定時間アクセスがないとHDDをスピンダウン
- タイムアウト時間設定

</details>

USB LEDトリガー
<details>
<summary>kmod-usb-ledtrig-usbport</summary>

- USBポート使用時にLEDを点灯
- USB機器接続状態の視覚的確認

</details>

RNDISプロトコルカーネルモジュール
<details>
<summary>kmod-usb-net-rndis</summary>

- スマートフォンのUSBテザリング
- 依存: kmod-usb-net-cdc-ether
- setup.json連携: enable_usb_rndis

</details>

CDC Ethernetカーネルモジュール
<details>
<summary>kmod-usb-net-cdc-ether</summary>

- USBネットワークデバイス

</details>

USB Gadget Ethernetカーネルモジュール
<details>
<summary>kmod-usb-gadget-eth</summary>

- ルーターをUSBイーサネットデバイスとして動作
- 依存: kmod-usb-dwc2
- setup.json連携: enable_usb_gadget
- 注意: 有効化には再起動が必要

</details>

DWC2 USBコントローラカーネルモジュール
<details>
<summary>kmod-usb-dwc2</summary>

- USB Gadget機能

</details>

ext4ファイルシステムリサイズツール
<details>
<summary>resize2fs</summary>

- パーティション拡張
- 依存: parted, f2fs-tools

</details>

パーティション編集ツール
<details>
<summary>parted</summary>

- パーティションの作成、削除、リサイズ

</details>

### ファイル共有

Samba4ファイルサーバー
<details>
<summary>luci-app-samba4</summary>

- Windows互換のファイル共有（SMB/CIFS）
- 依存: wsdd2
- setup.json連携: enable_samba4

</details>

Web Services Discoveryデーモン
<details>
<summary>wsdd2</summary>

- Windows 10/11のネットワーク探索に対応

</details>

ksmbd ファイルサーバー
<details>
<summary>luci-app-ksmbd</summary>

- カーネル実装のSMBサーバー
- Samba4より軽量
- 依存: ksmbd-avahi-service

</details>

ksmbd Avahiサービス
<details>
<summary>ksmbd-avahi-service</summary>

- ネットワーク自動検出用サービス

</details>

TransmissionBitTorrentクライアント
<details>
<summary>luci-app-transmission</summary>

- BitTorrentクライアント
- Web UIでリモート操作

</details>

Syncthingファイル同期
<details>
<summary>syncthing</summary>

- P2Pファイル同期ツール
- 複数デバイス間でリアルタイム同期

</details>

### Webサーバーツール

Webサーバー
<details>
<summary>apache</summary>

- Apacheウェブサーバー
- htpasswdコマンド含む

</details>

### DNS & プライバシー

HTTPS経由で暗号化DNS通信（DoH）
<details>
<summary>luci-app-https-dns-proxy</summary>

DNS over HTTPS
- Cloudflare、Google、Quad9等のプロバイダに対応

</details>

TLS経由で暗号化DNS通信（DoT）
<details>
<summary>stubby</summary>

DNS over TLS

</details>

### Setup連動パッケージ

MAP-Eプロトコル
<details>
<summary>map</summary>

- IPv4 over IPv6カプセル化方式
- OCNバーチャルコネクト、v6オプション、NURO光で使用
- setup.jsonで connection_type: "mape" 選択時に自動インストール

</details>

SHA1チェックサムユーティリティ
<details>
<summary>coreutils-sha1sum</summary>

- MAP-E用SHA1計算ツール

</details>

DS-Liteプロトコル
<details>
<summary>ds-lite</summary>

- IPv4 over IPv6カプセル化方式
- transix、v6プラス、クロスパス等で使用
- setup.jsonで connection_type: "dslite" 選択時に自動インストール

</details>

Usteerバンドステアリング
<details>
<summary>luci-app-usteer</summary>

- バンドステアリングとローミング最適化
- 5GHz帯への自動誘導
- 負荷分散機能
- setup.jsonで wifi_mode: "usteer" 選択時に自動インストール

</details>

AdGuard Home DNS広告ブロック
<details>
<summary>adguardhome</summary>

- DNS over HTTPS (DoH)対応の広告ブロッカー
- Webインターフェースで詳細設定
- ブロックリスト管理、統計表示
- カスタムスクリプトで管理
- 必須: メモリ 20MB / ストレージ 25MB
- 推奨: メモリ 50MB / ストレージ 100MB

</details>

広告ブロック
<details>
<summary>luci-app-adblock-fast</summary>

- DNS応答を書き換えて広告をブロック
- dnsmasq/unboundベース
- ブロックリストに対応
- カスタムスクリプトで管理

</details>

NextDNS
<details>
<summary>luci-app-nextdns</summary>

- クラウドベースDNSフィルタリング
- カスタムスクリプトで管理

</details>

BBR TCP輻輳制御
<details>
<summary>kmod-tcp-bbr</summary>

- Googleが開発したTCP輻輳制御アルゴリズム
- ネットワークチューニングで選択時に自動インストール

</details>
