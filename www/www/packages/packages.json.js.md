# packages.json 解説

## Basic System Features (基本システム機能)

ターミナルアクセスとファイル転送ツール

<details>
<summary>luci-app-ttyd</summary>

**Webターミナル**
- ブラウザから直接ルーターのシェルにアクセス
- SSH不要でコマンドライン操作が可能
- デバッグやトラブルシューティングに便利
</details>

<details>
<summary>openssh-sftp-server</summary>

**SFTPサーバー**
- SSH経由で安全にファイル転送
- WinSCP、FileZilla等のSFTPクライアントで接続可能
- パスワード認証または鍵認証に対応
</details>

<details>
<summary>luci-app-commands</summary>

**カスタムコマンド実行**
- よく使うコマンドをLuCI上のボタンとして登録
- ワンクリックでスクリプトやコマンドを実行
- 再起動、ログクリア等の定型作業を簡単に
</details>

<details>
<summary>luci-app-filebrowser</summary>

**Webファイルブラウザ**
- ブラウザからルーターのファイルシステムを操作
- アップロード、ダウンロード、編集が可能
- 設定ファイルの編集に便利
</details>

## System Management (システム管理)

<details>
<summary>luci-app-irqbalance</summary>

**IRQ割り込みバランサー**
- マルチコアCPUで割り込み処理を分散
- CPU負荷を均等化してパフォーマンス向上
- 4コア以上のデバイスで効果的
</details>

## Network Management (ネットワーク管理)

QoS、帯域監視、Wi-Fiスケジュール、ネットワークユーティリティ

<details>
<summary>luci-app-sqm (+ tc-full)</summary>

**SQM QoS (Smart Queue Management)**
- 帯域制御でバッファブロートを防止
- オンラインゲームやビデオ通話の遅延改善
- アップロード/ダウンロード速度を個別設定
- **依存**: tc-full (トラフィック制御ツール)
</details>

<details>
<summary>luci-app-statistics (+ collectd + rrdtool1)</summary>

**システム統計グラフ**
- CPU、メモリ、ネットワークトラフィックをグラフ化
- 長期的なトレンド分析が可能
- RRDtoolで時系列データベース管理
- **依存**: collectd (データ収集), rrdtool1 (グラフ生成)
</details>

<details>
<summary>luci-app-nlbwmon</summary>

**帯域幅モニター (NetLink版)**
- デバイス・ホスト別の通信量を記録
- どのデバイスが帯域を使っているか把握
- 月間・日間の通信量統計
</details>

<details>
<summary>luci-app-vnstat2</summary>

**vnStat2 トラフィック統計**
- 長期的なトラフィック統計を保存
- 月間、日間、時間別のデータ記録
- データベース方式で軽量動作
</details>

<details>
<summary>luci-app-wol</summary>

**Wake on LAN**
- LAN内のPCをネットワーク経由で起動
- MACアドレスを登録してワンクリック起動
- 外出先からルーター経由でPC起動も可能
</details>

<details>
<summary>luci-app-ddns</summary>

**Dynamic DNS**
- 動的IPアドレスをドメイン名に自動更新
- No-IP、DuckDNS等のサービスに対応
- 外部から自宅サーバーへのアクセスを容易に
</details>

<details>
<summary>luci-app-tor</summary>

**Tor匿名化ネットワーク**
- Torネットワーク経由で匿名通信
- ルーターレベルでプライバシー保護
- 特定デバイスのみTor経由も可能
</details>

<details>
<summary>luci-app-mwan3 (+ mwan3)</summary>

**マルチWAN管理 (iptables版)**
- 複数のWAN回線を束ねて負荷分散
- フェイルオーバー (回線障害時自動切替)
- 回線別ルーティングルール設定
- **依存**: mwan3 (マルチWANデーモン)
- **注意**: iptablesベース (nftablesと競合する可能性)
</details>

## Wi-Fi Management (Wi-Fi管理)

Wi-Fiスケジュール、ローミング最適化、無線ユーティリティ

<details>
<summary>luci-app-wifischedule</summary>

**Wi-Fiスケジューラー**
- 時間帯別にWi-Fiオン/オフを自動化
- 夜間・外出時に無線を自動停止して省電力
- 曜日別スケジュール設定可能
</details>

<details>
<summary>luci-app-travelmate</summary>

**Travelmate (Wi-Fiクライアント)**
- ルーター自身を他のWi-Fiに接続
- ホテル、カフェ等の公衆Wi-Fiを中継
- 複数のSSIDを登録して自動接続
</details>

## Modem Support (モデムサポート)

4G/5G モデム管理 (ModemManagerはSMS対応)

<details>
<summary>luci-proto-modemmanager (+ 依存パッケージ)</summary>

**ModemManager プロトコル**
- 4G/5Gモデムをネットワークインターフェースとして管理
- MBIM、QMI対応モデムをサポート
- SMS送受信機能も利用可能
- **依存パッケージ**:
  - kmod-usb-wdm: USBワイヤレスデバイス管理
  - kmod-usb-net-cdc-mbim: MBIMプロトコル
  - kmod-usb-net-qmi-wwan: QMIプロトコル
  - uqmi: QMI管理ツール
  - mbim-utils: MBIM管理ツール
  - screen: ターミナルマルチプレクサ
</details>

## Security Tools (セキュリティツール)

侵入防止とIPブロックツール

<details>
<summary>fail2ban</summary>

**Fail2Ban 侵入防止**
- ログを監視して不審なアクセスを検出
- 一定回数失敗したIPを自動ブロック
- SSH、HTTP等のブルートフォース攻撃を防御
</details>

<details>
<summary>luci-app-banip</summary>

**BanIP IPブロック**
- 既知の悪意あるIPリストで自動ブロック
- 各種ブラックリストフィードに対応
- 国別IP範囲のブロックも可能
</details>

<details>
<summary>luci-app-acme</summary>

**ACME (Let's Encrypt)**
- 無料SSL証明書の自動取得・更新
- HTTPSでルーター管理画面にアクセス
- Let's Encrypt、ZeroSSL等に対応
</details>

## System Monitoring (システム監視)

システムウォッチドッグとネットワーク監視

<details>
<summary>luci-app-watchcat</summary>

**Watchcat システム監視**
- ネットワーク接続を定期的にチェック
- 接続断が続く場合、自動再起動
- Pingテストやインターフェース監視
</details>

## Network Diagnostic Tools (ネットワーク診断ツール)

ネットワークテスト、監視、分析、DNSトラブルシューティングツール

<details>
<summary>htop (+ collectd + collectd-mod-thermal)</summary>

**htop プロセスモニター**
- CPUコア別使用率をリアルタイム表示
- メモリ、スワップ使用量を視覚化
- プロセス一覧とソート、検索機能
- **依存**: collectd (CPU温度取得), collectd-mod-thermal (温度センサー)
</details>

<details>
<summary>mtr-nojson</summary>

**MTR (My TraceRoute)**
- tracerouteとpingを組み合わせたツール
- 各ホップのパケットロス率と遅延を表示
- ネットワーク経路の問題箇所を特定
</details>

<details>
<summary>nmap</summary>

**Nmap ポートスキャナー**
- ネットワーク内のデバイスを検出
- 開いているポートとサービスを調査
- セキュリティ監査に使用
</details>

<details>
<summary>tcpdump</summary>

**tcpdump パケットキャプチャ**
- ネットワークパケットを詳細にキャプチャ
- プロトコル解析とトラブルシューティング
- Wiresharkで開けるpcapファイル出力
</details>

<details>
<summary>iperf3</summary>

**iPerf3 帯域測定**
- ネットワーク帯域幅をテスト
- TCP/UDP スループット測定
- 有線LAN、Wi-Fi速度の実測に
</details>

<details>
<summary>speedtest-netperf</summary>

**Speedtest (netperf版)**
- インターネット速度テスト
- ダウンロード/アップロード速度測定
- OpenWrt向け軽量実装
</details>

<details>
<summary>iftop</summary>

**iftop 帯域幅モニター**
- リアルタイムで接続別トラフィック表示
- どの接続が帯域を使っているか瞬時に把握
- 送信/受信を個別表示
</details>

<details>
<summary>bind-dig</summary>

**dig DNSクエリツール**
- DNS問い合わせの詳細情報を取得
- DNSサーバーの応答テスト
- レコードタイプ別クエリ (A, AAAA, MX等)
</details>

<details>
<summary>ethtool</summary>

**ethtool イーサネット診断**
- イーサネットポートの状態確認
- リンク速度、デュプレックス設定
- NICドライバ情報とハードウェア統計
</details>

## System Administration Tools (システム管理ツール)

ターミナル強化、デバッグ、ファイル管理、HTTPクライアントツール

<details>
<summary>tmux</summary>

**tmux ターミナルマルチプレクサ**
- 複数のターミナルセッションを管理
- SSH切断してもセッション維持
- 画面分割で複数コマンドを同時実行
</details>

<details>
<summary>nano-plus</summary>

**nano テキストエディタ (機能拡張版)**
- シンプルで使いやすいCLIエディタ
- シンタックスハイライト対応
- 設定ファイルの編集に最適
</details>

<details>
<summary>lsof</summary>

**lsof ファイル/ポート使用確認**
- どのプロセスがどのファイルを開いているか確認
- ポート使用中のプロセスを特定
- デバイスがアンマウントできない原因調査に
</details>

<details>
<summary>rsync</summary>

**rsync ファイル同期**
- 差分転送で効率的にファイル同期
- バックアップスクリプト作成に
- SSH経由でリモートサーバーと同期
</details>

<details>
<summary>curl</summary>

**curl HTTPクライアント**
- コマンドラインからHTTP/HTTPS通信
- API呼び出しやファイルダウンロード
- スクリプトでのWeb操作に必須
</details>

<details>
<summary>netdata</summary>

**Netdata リアルタイム監視**
- 美しいWebダッシュボードでシステム監視
- CPU、メモリ、ネットワーク、ディスクI/Oを可視化
- アラート機能付き
- **注意**: メモリ使用量が大きいため512MB以上推奨
</details>

## Themes and Dashboard (テーマとダッシュボード)

UIテーマとダッシュボード改善

<details>
<summary>luci-mod-dashboard</summary>

**LuCIダッシュボード**
- システム状態を一画面で把握
- CPU、メモリ、接続数、トラフィックを表示
- カスタマイズ可能なウィジェット
</details>

<details>
<summary>luci-theme-openwrt (+ material + 2020)</summary>

**OpenWrtテーマパック**
- OpenWrt公式テーマ各種
- **含まれるテーマ**:
  - luci-theme-material: マテリアルデザイン
  - luci-theme-openwrt-2020: 2020版デザイン
- 好みに応じてテーマ切替可能
</details>

## Utilities (ユーティリティ)

システムアップグレード、VPN、メディアサーバーユーティリティ

<details>
<summary>luci-app-attendedsysupgrade (+ owut + auc)</summary>

**自動システムアップグレード**
- LuCI上でファームウェア更新を自動化
- 現在のパッケージを維持したまま更新
- カスタムビルドにも対応
- **依存**:
  - owut: OpenWrt Update Tool
  - auc: Attended sysUpgrade Client
</details>

<details>
<summary>luci-proto-wireguard (+ luci-app-wireguard + wireguard-tools)</summary>

**WireGuard VPN**
- 高速・軽量な最新VPN技術
- L3 (ネットワーク層) VPN
- モバイルデバイスとの親和性が高い
- **依存**:
  - luci-app-wireguard: LuCI管理画面
  - wireguard-tools: コマンドラインツール
</details>

<details>
<summary>zerotier</summary>

**ZeroTier SDN**
- 仮想LANでデバイスを接続
- 世界中のデバイスを同一ネットワークに
- NAT越えが簡単
</details>

<details>
<summary>tailscale</summary>

**Tailscale メッシュVPN**
- WireGuardベースのメッシュネットワーク
- 各デバイスが直接接続
- 簡単なセットアップと管理
</details>

<details>
<summary>luci-app-dockerman (+ docker-compose + docker)</summary>

**Docker コンテナ管理 (iptables版)**
- LuCI上でDockerコンテナを管理
- イメージ、コンテナ、ネットワーク、ボリューム操作
- **依存**:
  - docker-compose: コンテナオーケストレーション
  - docker: Dockerエンジン
- **注意**: iptablesベース、メモリ1GB以上推奨
</details>

<details>
<summary>luci-app-openvpn</summary>

**OpenVPN**
- 歴史ある信頼性の高いVPN
- サーバー・クライアント両対応
- 柔軟な設定が可能
</details>

<details>
<summary>luci-app-minidlna</summary>

**MiniDLNA メディアサーバー**
- DLNA/UPnP-AVメディアサーバー
- テレビ、ゲーム機で動画・音楽を再生
- USB HDDをメディアサーバー化
</details>

<details>
<summary>smartmontools</summary>

**S.M.A.R.T. 監視ツール**
- HDD/SSDの健康状態を監視
- 故障予兆を事前に検出
- ディスク温度、エラーカウント確認
</details>

<details>
<summary>logrotate</summary>

**ログローテーション**
- ログファイルを自動で圧縮・削除
- ディスク容量の節約
- 古いログの自動アーカイブ
</details>

## USB Storage Support (USBストレージサポート)

USBストレージカーネルモジュールとファイルシステムツール

<details>
<summary>kmod-usb-storage-uas (+ block-mount + usbutils + gdisk)</summary>

**USB Storage (UAS対応)**
- USB 3.0高速転送モード (UAS) サポート
- USBメモリ、外付けHDD/SSDを認識
- **依存**:
  - block-mount: ブロックデバイスマウント管理
  - usbutils: USB情報表示 (lsusb)
  - gdisk: GPTパーティション編集
</details>

<details>
<summary>dosfstools (+ kmod-fs-vfat)</summary>

**FAT32 ファイルシステム**
- FAT32フォーマットのUSBドライブ読み書き
- Windows/Mac/Linuxで共通利用可能
- **依存**: kmod-fs-vfat (VFATカーネルモジュール)
</details>

<details>
<summary>e2fsprogs (+ kmod-fs-ext4)</summary>

**ext4 ファイルシステム**
- Linux標準のext4フォーマット対応
- ジャーナリング機能で安全性向上
- **依存**: kmod-fs-ext4 (ext4カーネルモジュール)
</details>

<details>
<summary>f2fs-tools (+ kmod-fs-f2fs)</summary>

**F2FS ファイルシステム**
- フラッシュメモリ最適化FS
- SDカード、SSDで高速動作
- **依存**: kmod-fs-f2fs (F2FSカーネルモジュール)
</details>

<details>
<summary>exfat-fsck (+ kmod-fs-exfat)</summary>

**exFAT ファイルシステム**
- 大容量ファイル対応 (4GB以上)
- Windows/Mac標準サポート
- **依存**: kmod-fs-exfat (exFATカーネルモジュール)
</details>

<details>
<summary>ntfs-3g (+ kmod-fs-ntfs3)</summary>

**NTFS ファイルシステム**
- Windows NTFSの読み書き対応
- 外付けHDDでよく使用される
- **依存**: kmod-fs-ntfs3 (NTFS3カーネルモジュール)
</details>

<details>
<summary>hfsfsck (+ kmod-fs-hfs + kmod-fs-hfsplus)</summary>

**HFS/HFS+ ファイルシステム**
- Mac OS用ファイルシステム対応
- 古いMacフォーマットのドライブ読み書き
- **依存**:
  - kmod-fs-hfs: HFSカーネルモジュール
  - kmod-fs-hfsplus: HFS+カーネルモジュール
</details>

<details>
<summary>luci-app-hd-idle</summary>

**HD-Idle ディスク省電力**
- 一定時間アクセスがないとHDDをスピンダウン
- 消費電力削減と騒音低減
- タイムアウト時間をカスタマイズ可能
</details>

<details>
<summary>kmod-usb-ledtrig-usbport</summary>

**USB LEDトリガー**
- USBポート使用時にLEDを点灯
- USB機器接続状態を視覚的に確認
- ルーターのUSB LEDを活用
</details>

<details>
<summary>kmod-usb-net-rndis (+ kmod-usb-net-cdc-ether)</summary>

**USB RNDIS (テザリング)**
- スマートフォンのUSBテザリングに対応
- Android/iPhoneをWANとして使用
- モバイル回線のバックアップに
- **依存**: kmod-usb-net-cdc-ether (CDC Ethernetドライバ)
- **setup.json連携**: `enable_usb_rndis`
</details>

<details>
<summary>kmod-usb-gadget-eth (+ kmod-usb-dwc2)</summary>

**USB Gadget イーサネット (要再起動)**
- ルーター自身をUSBイーサネットデバイスとして動作
- PCのUSBポートに接続してネットワーク共有
- Raspberry Pi等で使用
- **依存**: kmod-usb-dwc2 (DWC2 USBコントローラ)
- **setup.json連携**: `enable_usb_gadget`
- **注意**: 有効化には再起動が必要
</details>

<details>
<summary>resize2fs (+ parted + f2fs-tools)</summary>

**ファイルシステムリサイズ**
- SDカードの未使用領域を拡張
- パーティションとFSを同時にリサイズ
- **依存**:
  - parted: パーティション編集
  - f2fs-tools: F2FSリサイズ機能
- **setup.json連携**: `enable_sd_resize`
</details>

## File Sharing (ファイル共有)

SMB/CIFSファイル共有サーバー

<details>
<summary>luci-app-samba4 (+ wsdd2)</summary>

**Samba4 ファイル共有**
- Windows互換のファイル共有 (SMB/CIFS)
- ネットワークドライブとしてマウント可能
- ゲストアクセスまたは認証設定
- **依存**: wsdd2 (Windows Service Discovery、ネットワーク上での自動検出)
- **setup.json連携**: `enable_samba4`
</details>

<details>
<summary>luci-app-transmission</summary>

**Transmission BitTorrentクライアント**
- 軽量なBitTorrentダウンロードクライアント
- USB HDDに直接ダウンロード
- Web UIでリモート操作
</details>

## DNS & Privacy (DNS & プライバシー)

DNSベース広告ブロックと暗号化DNS (DoH/DoT)

<details>
<summary>luci-app-adblock-fast (+ Tofukko Filter)</summary>

**高速広告ブロック**
- DNS応答を書き換えて広告をブロック
- dnsmasq/unboundベースで軽量高速
- 複数のブロックリストに対応
- **オプション**: Japan Tofukko Filter (日本向け広告ブロックリスト)
- **setup.json連携**: 
  - `enable_adblock_fast`: 広告ブロック有効化
  - `enable_tofukko_filter`: Tofukkoフィルター追加
</details>

<details>
<summary>luci-app-https-dns-proxy</summary>

**DNS over HTTPS (DoH)**
- HTTPS経由で暗号化DNS通信
- ISPによるDNS監視を防ぐ
- Cloudflare、Google、Quad9等のプロバイダに対応
</details>

<details>
<summary>stubby</summary>

**DNS over TLS (DoT)**
- TLS経由で暗号化DNS通信
- DoHの代替プロトコル
- プライバシー保護
</details>

## Setup-driven Packages (Setup連動パッケージ)

setup.json設定により自動管理されるパッケージ

<details>
<summary>map</summary>

**MAP-E サポート**
- IPv4 over IPv6 トンネル (MAP-E)
- 日本のIPv6 IPoE接続に必須
- setup.jsonで `connection_type: "mape"` 選択時に自動インストール
</details>

<details>
<summary>ds-lite</summary>

**DS-Lite サポート**
- IPv4 over IPv6 トンネル (DS-Lite)
- 一部プロバイダのIPv6接続に使用
- setup.jsonで `connection_type: "dslite"` 選択時に自動インストール
</details>

<details>
<summary>luci-app-usteer</summary>

**Usteer バンドステアリング**
- 複数APでの高速ローミング
- 5GHz帯への自動誘導
- 負荷分散機能
- setup.jsonで `wifi_mode: "usteer"` 選択時に自動インストール
</details>
