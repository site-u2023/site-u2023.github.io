# AdGuard Home インストールスクリプト - 技術仕様書

## システム構成とアーキテクチャ原則
`adguardhome.sh`は独立したスタンドアロンスクリプトとして設計されており、その仕様とインターフェースは正規仕様として扱われる。UIは、adguardhome.shが定義するインターフェース仕様に完全に準拠しなければならない。

## 書式
```
adguardhome.sh [-c] [-n] [-r <mode>] [-i <source>]
```

## オプション

**-c**

システムリソースチェックを無効化する。環境変数`SKIP_RESOURCE_CHECK=1`と同等である。

**-n**

YAML設定ファイルの自動生成を無効化する。環境変数`NO_YAML=1`と同等である。この場合、Webインターフェース(デフォルトでポート3000)での初期設定が必要となる。

**-m**

認証情報更新モード。既存のAdGuard Homeインストールのユーザー名、パスワード、Webポート番号を更新する。環境変数`UPDATE_CREDENTIALS=1`と同等である。

**-r** *mode*

削除モードを指定する。環境変数`REMOVE_MODE`が優先される。

- **auto** - 確認なしで自動削除。設定ファイルも自動的に削除される。
- **manual** - 対話的確認後に削除。削除実行前と設定ファイル削除前の2回確認を求める。

**-i** *source*

インストールソースを指定する。環境変数`INSTALL_MODE`が優先される。

- **openwrt** - OpenWrtリポジトリパッケージ
- **official** - GitHub公式バイナリ

**-t**

TUIモード(内部使用)。統合モード実行時に使用される。

**-h**

使用方法を表示して終了する。

オプションの指定順序は任意である。

## 環境変数

**INSTALL_MODE**

インストールソースを指定する。`openwrt`または`official`を設定可能である。コマンドラインオプション`-i`により上書きされる。

**NO_YAML**

`1`を設定した場合、YAML自動生成を無効化する。コマンドラインオプション`-n`と同等である。

**UPDATE_CREDENTIALS**

`1`を設定した場合、認証情報更新モードで実行する。コマンドラインオプション`-m`と同等である。

**REMOVE_MODE**

削除モードを指定する。`auto`または`manual`を設定可能である。コマンドラインオプション`-r`により上書きされる。

**AGH_USER**

管理者ユーザー名を指定する。デフォルト値は`admin`である。`NO_YAML`未設定時のみ有効である。

**AGH_PASS**

管理者パスワードを指定する。デフォルト値は`password`、最小8文字である。`NO_YAML`未設定時のみ有効である。bcryptアルゴリズムでハッシュ化される。

注意: デフォルト値`password`は脆弱であり、本番環境では必ず変更すること。

**WEB_PORT**

Webインターフェースポート番号を指定する。デフォルト値は`8000`である。`NO_YAML`未設定時のみ有効である。`NO_YAML=1`の場合、AdGuard Homeはデフォルトでポート3000を使用する。

**DNS_PORT**

DNSサービスポート番号を指定する。デフォルト値は`53`である。`NO_YAML`未設定時のみ有効である。

**DNS_BACKUP_PORT**

バックアップdnsmasqポート番号を指定する。デフォルト値は`54`である。`NO_YAML`未設定時のみ有効である。

**LAN_ADDR**

LANインターフェースIPv4アドレスを指定する。未設定時は自動検出される。

**SCRIPT_BASE_URL**

YAMLテンプレートダウンロード元URLを指定する。デフォルト値は`https://site-u.pages.dev/www/custom-scripts`である。

**SKIP_RESOURCE_CHECK**

`1`を設定した場合、システムリソースチェックを無効化する。コマンドラインオプション`-c`と同等である。

**TUI_MODE**

`1`を設定した場合、TUI(統合)モードで実行する。コマンドラインオプション`-t`と同等である。この場合、再起動プロンプトが抑制される。

## YAML設定ファイル仕様（カスタム仕様）

本スクリプトは `-n` オプションまたは `NO_YAML=1` が指定されていない場合、`https://site-u.pages.dev/www/custom-script/adguardhome.yaml` からテンプレートを取得し、以下のプレースホルダーを環境変数で置換して `AdGuardHome.yaml` を生成します。

| プレースホルダー         | 置換される値                   | デフォルト値 |
|---------------------------|--------------------------------|--------------|
| `{{AGH_USER}}`            | 管理者ユーザー名               | `admin`      |
| `{{AGH_PASS_HASH}}`       | bcryptハッシュ化パスワード     | （入力値）   |
| `{{WEB_PORT}}`            | Web管理画面ポート              | `8000`       |
| `{{DNS_PORT}}`            | DNSサービスポート              | `53`         |
| `{{DNS_BACKUP_PORT}}`     | dnsmasqバックアップポート      | `54`         |

### schema_version
```yaml
schema_version: 29
```

### http セクション
```yaml
http:
  address: 0.0.0.0:{{WEB_PORT}}
  session_ttl: 720h
```

### users セクション
```yaml
users:
  - name: {{AGH_USER}}
    password: {{AGH_PASS_HASH}}
auth_attempts: 5
block_auth_min: 15
```

### dns セクション
```yaml
dns:
  port: {{DNS_PORT}}
  refuse_any: true
  upstream_dns:
    - '# LAN domain intercept'
    - '[/lan/]127.0.0.1:54'
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
```

### bootstrap_dns セクション
```yaml
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
```

### fallback_dns セクション
```yaml
  fallback_dns:
    - https://cloudflare-dns.com/dns-query
    - https://dns.google/dns-query
    - https://unfiltered.adguard-dns.com/dns-query
    - https://jp.tiar.app/dns-query
    - https://dns.nextdns.io
  cache_size: 1048576
  enable_dnssec: false
  use_private_ptr_resolvers: true
  local_ptr_upstreams:
    - 127.0.0.1:{{DNS_BACKUP_PORT}}
```

### upstream_mod セクション
```yaml
  upstream_mode: parallel
```

### tls セクション
```yaml
tls:
  enabled: false
```

### filters セクション
```yaml
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
```

### user_rules セクション
```yaml
user_rules:
  - '# 日本の主要サービス'
  - '@@||amazon.co.jp^$important'
  - '@@||rakuten.co.jp^$important'
  - '@@||yahoo.co.jp^$important'
  - '# LINE関連'
  - '@@||line.me^$important'
  - '@@||line-scdn.net^$important'
```

### dhcp セクション
```yaml
dhcp:
  enabled: false
```

### filtering セクション
```yaml
filtering:
  parental_enabled: false
  safebrowsing_enabled: false
```

### log セクション
```yaml
log:
  file: ""
```

## 非対話モード実行

全ての環境変数を指定することで非対話モード実行が可能である。`AGH_USER`、`AGH_PASS`、`WEB_PORT`、`DNS_PORT`を指定した場合、対話的入力は実行されない。

## システム要件

本スクリプトは以下の値を設定している。
```
MINIMUM_MEM="20"
MINIMUM_FLASH="25"
RECOMMENDED_MEM="50"
RECOMMENDED_FLASH="100"
```

利用可能なメモリが`MINIMUM_MEM`未満、または空きフラッシュストレージが`MINIMUM_FLASH`未満の場合、エラー終了する。コマンドラインオプション`-c`または環境変数`SKIP_RESOURCE_CHECK=1`によりチェックを無効化できる。

推奨値を下回る場合は警告として黄色で表示されるが、最小値を満たしていればインストールは継続される。

参考: 本スクリプトはOpenWrtの制約環境を考慮してより低い基準(20MB)を設定しているが、実際の運用では50MB以上のRAMと100MB以上のフラッシュストレージが推奨される。公式要件を満たさない環境での動作は保証されない。

## パッケージマネージャー検出

opkgまたはapkを自動検出する。いずれも存在しない場合はエラー終了する。

## バックアップと復元機能

スクリプトはインストール時に`/etc/config/`配下の設定ファイルを自動的にバックアップする。バックアップ対象は`network`、`dhcp`、`firewall`の3ファイルであり、それぞれ`.adguard.bak`拡張子を付与した形で保存される。

削除時にバックアップファイルが存在する場合、自動的に元の設定へ復元される。バックアップファイルが存在しない場合は、dnsmasqの設定のみデフォルト値へリセットされる。バックアップファイルは削除処理の完了後に自動的に削除される。

## インストール動作の詳細

### 非破壊的インストール

本スクリプトは、インストール中のネットワーク接続を維持するため、非破壊的なインストールアプローチを採用している。

設定変更は全てUCIシステムにコミットされるが、各サービスの再起動は実行されない。dnsmasq、odhcpd、firewallサービスは既存の設定で動作を継続し、AdGuard Homeは次回システム起動時に初めてアクティブ化される。

これにより、インストール処理中のDNSサービス中断が回避される。

### インストール完了後の状態

インストール完了時点では以下の状態となる。

- AdGuard Homeサービスは有効化されているが起動していない(`/etc/init.d/SERVICE_NAME enable`のみ実行)
- dnsmasq、odhcpd、firewallの設定変更はコミット済みだが未適用
- 既存のdnsmasqがDNSリゾルバとして機能を継続
- 次回再起動時にAdGuard HomeがポートTCP/UDP 53をリスニングし、dnsmasqはバックアップポート(デフォルト54)へ移行

### パッケージ更新動作

インストール開始時、パッケージマネージャーのリポジトリ一覧が更新される。

- opkgの場合: `opkg update`を実行
- apkの場合: `apk update`を実行

更新に失敗した場合、詳細な出力を表示してエラー終了する。

## システム設定の自動変更内容

### dnsmasq設定

インストール時に以下の設定変更が実行される。

- リゾルバ機能の無効化(`noresolv='1'`)
- キャッシュサイズのゼロ化(`cachesize='0'`)
- リバインド保護の無効化(`rebind_protection='0'`)
- ポート番号の変更(`port='${DNS_BACKUP_PORT}'`)
- 上流DNSサーバーの指定(`127.0.0.1#${DNS_PORT}`および`::1#${DNS_PORT}`)
- ローカルドメイン設定(`domain='lan'`, `local='/lan/'`, `expandhosts='1'`)

### DHCPサーバー設定

LANインターフェースに対して以下のDNSサーバーオプションが設定される。

- IPv4: `dhcp_option='6,${NET_ADDR}'`
- IPv6: `dhcp_option6="option6:dns=[${NET_ADDR6}]"`(検出された全てのグローバルアドレス)

### ファイアウォール設定

DNS通信を捕捉するためのリダイレクトルールが追加される。ルール名は`adguardhome_dns_${DNS_PORT}`であり、検出されたIPアドレスファミリーに応じて`ipv4`、`ipv6`、または`any`が設定される。プロトコルはTCPおよびUDPの両方が対象となる。

削除時には、バックアップファイルが存在する場合は全ての設定が復元され、存在しない場合はdnsmasqのみデフォルト設定へリセットされる。いずれの場合も関連サービス(dnsmasq、odhcpd、firewall)が再起動される。

## ネットワーク検出と自動設定

LANインターフェースは`ubus call network.interface.lan status`により自動検出される。検出に失敗した場合はエラー終了する。

IPv4アドレスは`ip -4 -o addr show dev ${LAN} scope global`により取得される。IPv6グローバルアドレスは`ip -6 -o addr show dev ${LAN} scope global`により取得され、一時アドレスは除外される。正規表現`^(2|fd|fc)`に一致するアドレスのみが対象となる。

検出結果に基づいてファイアウォールルールのアドレスファミリーが決定される。IPv4のみ検出された場合は`ipv4`、IPv6のみの場合は`ipv6`、両方存在する場合は`any`が設定される。いずれのアドレスも検出できない場合、ファイアウォール設定はスキップされ、警告メッセージが表示される。

## 証明書パッケージのインストール

HTTPSによるダウンロードを実行するため、証明書パッケージが自動的にインストールされる。パッケージマネージャーがopkgの場合は`ca-bundle`、apkの場合は`ca-certificates`が対象となる。このインストール処理は削除時には巻き戻されない。

## パスワードハッシュ化処理

`NO_YAML`が設定されていない場合、管理者パスワードはbcryptアルゴリズムでハッシュ化される。この処理のために`htpasswd`コマンドが必要となる。

スクリプトは以下の手順で`htpasswd`の利用可能性を確保する。

1. 既存の`htpasswd`コマンドが機能的である場合、追加のインストールは実行されない
2. `htpasswd`が存在しない場合、または機能していない場合:
   - 依存パッケージ(`libaprutil`、`libapr`、`libexpat`、`libuuid1`)をインストール
   - `apache`パッケージが既にインストール済みかを確認
   - `apache`パッケージをインストールして`htpasswd`を取得
   - `apache`が元々インストールされていなかった場合のみ、`htpasswd`バイナリを保存した後に`apache`パッケージを削除
   - `apache`が元々インストールされていた場合は、パッケージを保持

この処理により、`apache`が既存のシステムコンポーネントである場合は保護され、一時的な依存関係としてのみ必要な場合はクリーンアップされる。

`htpasswd`のインストールまたは機能確認に失敗した場合、エラーメッセージを表示して処理を中断する。

## 公式バイナリインストール時の動作

`INSTALL_MODE=official`が指定された場合、GitHub APIから最新リリース情報を取得し、アーキテクチャに応じた適切なバイナリをダウンロードする。

サポートされるアーキテクチャは以下の通りである。

- `aarch64`, `arm64` → `arm64`
- `armv7l` → `armv7`
- `armv6l` → `armv6`
- `armv5l` → `armv5`
- `x86_64`, `amd64` → `amd64`
- `i386`, `i686` → `386`
- `mips` → `mipsle`
- `mips64` → `mips64le`

上記以外のアーキテクチャが検出された場合、エラーメッセージを表示して終了する。

ダウンロードしたtarballは`/etc/AdGuardHome`へ展開され、バイナリに実行権限が付与される。その後、`/etc/AdGuardHome/AdGuardHome -s install`によりサービスのインストール処理が実行される。失敗時にはエラーメッセージを表示して終了する。

公式バイナリインストール時のサービス名は`AdGuardHome`となり、OpenWrtパッケージインストール時の`adguardhome`とは異なる。

## OpenWrtパッケージインストール時の動作

`INSTALL_MODE=openwrt`が指定された場合、パッケージマネージャーのリポジトリから`adguardhome`パッケージをインストールする。

パッケージマネージャーがopkgの場合、`opkg list`により利用可能なバージョンを確認し、`opkg install --verbosity=0 adguardhome`を実行する。apkの場合は`apk search adguardhome`および`apk add adguardhome`を実行する。

リポジトリにパッケージが存在しない場合、警告メッセージを表示して自動的に公式バイナリインストールへフォールバックする。ネットワークエラーが発生した場合はエラーメッセージを表示して終了する。

OpenWrtパッケージインストール時のサービス名は`adguardhome`となる。

## 削除モードの詳細動作

削除モードは`-r`オプションまたは`REMOVE_MODE`環境変数により指定される。コマンドラインオプション`-r`が環境変数`REMOVE_MODE`より優先される。

### autoモード

全ての確認プロンプトをスキップし、設定ファイルも自動的に削除される。処理完了後の再起動プロンプトは表示されない。

削除実行前に「Auto-removing...」という警告メッセージが黄色で表示される。

### manualモード

削除実行前と設定ファイル削除前の2回、ユーザーへ確認を求める。確認に対して`y`または`Y`以外が入力された場合、処理をキャンセルして正常終了する。

### 未指定時の動作

`REMOVE_MODE`が設定されていない場合、スタンドアロンモード(TUI_MODEが未設定)での実行時のみ、処理完了後に再起動プロンプトが表示される。Enterキー押下により即座に`reboot`コマンドが実行される。

統合モード(TUI_MODEが設定されている)では、再起動プロンプトは表示されない。

### 削除処理の実行内容

削除処理では以下の操作が順次実行される。

1. AdGuard Homeサービスの検出(detect_adguardhome_service関数)
2. サービスの停止および無効化
3. 公式バイナリ版の場合: アンインストールコマンドの実行
4. OpenWrtパッケージ版の場合: パッケージマネージャーによる削除
5. 設定ファイルの削除(autoモードの場合は自動、それ以外は確認後)
6. バックアップファイルからの設定復元(存在する場合)
7. バックアップが存在しない場合: dnsmasq設定のデフォルト値へのリセット
8. ファイアウォールルール(`adguardhome_dns_${DNS_PORT}`)の削除
9. 関連サービス(dnsmasq、odhcpd、firewall)の再起動
10. 再起動プロンプトの表示(スタンドアロンモードかつREMOVE_MODE未設定の場合のみ)

## エラーハンドリングと復旧処理

### システムリソースチェック

利用可能なメモリが`MINIMUM_MEM`未満、または空きフラッシュストレージが`MINIMUM_FLASH`未満の場合、エラーメッセージを表示して終了する。`-c`オプションまたは`SKIP_RESOURCE_CHECK=1`によりこのチェックは無効化可能である。

### パッケージマネージャー更新

opkgまたはapkによるパッケージリスト更新が失敗した場合、詳細な出力を表示してエラー終了する。ネットワーク接続の問題またはリポジトリの障害が主な原因となる。

### 依存パッケージインストール

`htpasswd`のインストールに失敗した場合、エラーメッセージを表示して処理を中断する。この処理は`NO_YAML=1`が設定されている場合はスキップされる。

### AdGuard Homeインストール

公式バイナリのダウンロード失敗、サービスインストール失敗、OpenWrtパッケージのインストール失敗時には、それぞれエラーメッセージを表示して終了する。OpenWrtパッケージが利用不可の場合は公式バイナリへ自動的にフォールバックする。

### サービス再起動

dnsmasq、odhcpd、firewallの再起動に失敗した場合、エラーメッセージを表示して終了する。設定の不整合またはサービスの異常が主な原因となる。

### LANインターフェース検出

`ubus`によるLANインターフェース検出に失敗した場合、エラーメッセージを表示して終了する。OpenWrt以外の環境で実行された場合に発生する可能性がある。

## Webインターフェース情報の表示

インストール完了時、アクセス情報が以下の形式で表示される。この表示は`get_access`関数により処理される。

### ポート番号の取得

Webインターフェースのポート番号は以下の優先順位で決定される。

1. YAML設定ファイル(`/etc/AdGuardHome/AdGuardHome.yaml`または`/etc/adguardhome.yaml`)の`http:`セクションの`address:`フィールドから取得
2. 設定ファイルが存在しない場合、または読み取れない場合は環境変数`WEB_PORT`の値を使用

### IPv4アクセスURL

`http://${NET_ADDR}:${WEB_PORT}/`の形式で表示される。

### IPv6アクセスURL

IPv6グローバルアドレスが検出された場合、`http://[${NET_ADDR6}]:${WEB_PORT}/`の形式で表示される。複数のIPv6アドレスが存在する場合は最初のアドレスのみが表示される。

### 認証情報

`NO_YAML`が設定されていない場合、管理者ユーザー名(`AGH_USER`)とパスワード(`AGH_PASS`)が緑色および黄色で強調表示される。

`NO_YAML=1`の場合、認証情報は表示されず、代わりに「Configure via web interface」というメッセージとデフォルトのセットアップURL(`http://${NET_ADDR}:3000/`)が表示される。

### 再起動の注意事項

インストール完了後、黄色で「Note: Web interface will be available after reboot」というメッセージが表示される。これは、設定変更がコミットされているものの、AdGuard Homeサービスの実際の起動は次回システム起動時に行われるためである。

### QRコード生成

`qrencode`コマンドが利用可能な環境では、IPv4およびIPv6のアクセスURLに対応するQRコードが自動生成される。QRコードはUTF-8形式、バージョン3でターミナルに直接表示され、モバイルデバイスからのアクセスを容易にする。

## 使用例

### 対話型インストール

オプション指定なしで実行した場合、インストールモードの選択とクレデンシャルの入力を対話的に求められる。
```bash
sh adguardhome.sh
```

### 非対話型インストール

`-i`オプションでインストールモードを指定し、環境変数で認証情報を設定することで、非対話型実行が可能となる。環境変数`AGH_USER`、`AGH_PASS`、`WEB_PORT`が全て設定されている場合、入力プロンプトは表示されない。
```bash
sh adguardhome.sh -i official
```

上記の場合、認証情報の入力が求められる。環境変数で事前設定することで完全な非対話実行となる。
```bash
AGH_USER=admin AGH_PASS=securepass123 WEB_PORT=8000 sh adguardhome.sh -i official
```

### OpenWrtパッケージからのインストール

`-i openwrt`オプションによりOpenWrtリポジトリからインストールする。パッケージが利用不可の場合、自動的に公式バイナリへフォールバックする。
```bash
sh adguardhome.sh -i openwrt
```

### 認証情報更新

`-m`オプションにより既存のインストールの認証情報を更新する。対話的に入力を求められる。
```bash
sh adguardhome.sh -m
```

環境変数を設定することで非対話実行も可能である。
```bash
AGH_USER=newadmin AGH_PASS=newpassword123 WEB_PORT=8080 sh adguardhome.sh -m
```

### YAML生成スキップモード

`-n`オプションにより設定ファイルの自動生成をスキップする。この場合、AdGuard Homeはデフォルトでポート3000を使用し、Webインターフェースでの初期設定が必要となる。
```bash
sh adguardhome.sh -i official -n
```

### システムリソースチェック無効化

`-c`オプションによりメモリおよびストレージの要件チェックをスキップする。
```bash
sh adguardhome.sh -i official -c
```

### 削除モード（自動）

`-r auto`オプションにより確認プロンプトなしで削除を実行する。設定ファイルも自動的に削除される。
```bash
sh adguardhome.sh -r auto
```

### 削除モード（手動）

`-r manual`オプションにより削除前に確認を求める。削除実行前と設定ファイル削除前の2回確認が表示される。
```bash
sh adguardhome.sh -r manual
```

### 複合オプション指定

複数のオプションを同時に指定可能である。オプションの順序は任意である。
```bash
sh adguardhome.sh -i official -c -n
```

環境変数を併用する場合、オプションで指定されていないクレデンシャルのみ環境変数から読み取られる。
```bash
AGH_USER=admin AGH_PASS=mypassword123 sh adguardhome.sh -i official -c
```

### TUI統合モード

`-t`オプションは他のスクリプトからの統合実行用である。このモードでは処理完了後の再起動プロンプトが抑制される。環境変数`TUI_MODE=1`も同等である。
```bash
sh adguardhome.sh -t -i official
```

環境変数との組み合わせ例。
```bash
AGH_USER=admin AGH_PASS=pass12345 WEB_PORT=8000 sh adguardhome.sh -t -i official
```

### 環境変数による完全指定

全ての動作を環境変数で制御することも可能である。この場合、コマンドラインオプションは不要となる。ただし、明示性の観点からオプション指定を推奨する。
```bash
INSTALL_MODE=official AGH_USER=admin AGH_PASS=securepass123 WEB_PORT=8000 sh adguardhome.sh
```

削除を環境変数で指定する例。
```bash
REMOVE_MODE=auto sh adguardhome.sh
```

注意: コマンドラインオプションが指定された場合、該当する環境変数は無視される。例えば`-i official`が指定された場合、環境変数`INSTALL_MODE`の値は使用されない。

## スタンドアロンモードと統合モード

スクリプトは実行形態により動作が変化する。

### スタンドアロンモード

`$(basename "$0")` が `adguardhome.sh` と一致する場合、スタンドアロンモードとして実行される。このモードでは、`INSTALL_MODE`および`REMOVE_MODE`が未設定の場合に限り、処理完了後に再起動プロンプトが表示される。

### 統合モード

他のスクリプトから`source`または`.`により読み込まれた場合、統合モードとして動作する。このモードでは、環境変数により全ての動作を制御可能であり、再起動プロンプトは表示されない。外部からの制御を想定した設計となっている。
