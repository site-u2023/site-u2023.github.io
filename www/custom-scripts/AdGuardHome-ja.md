# AdGuard Home インストールスクリプト（MAP-E / DS-Lite 対応）- 技術仕様書

## クイックスタート

スクリプトのダウンロードと実行は以下のワンライナーで可能である。
```bash
mkdir -p /tmp && wget --no-check-certificate -O /tmp/adguardhome.sh "https://site-u.pages.dev/www/custom-scripts/adguardhome.sh" && chmod +x /tmp/adguardhome.sh && sh /tmp/adguardhome.sh
```

このコマンドは以下の処理を順次実行する。

1. `/tmp`ディレクトリの作成（既存の場合はスキップ）
2. スクリプトのダウンロード（SSL証明書検証を無効化）
3. 実行権限の付与
4. スクリプトの実行

対話的にインストールモードと認証情報の入力が求められる。非対話実行を行う場合は、オプションを追加して実行すること。
```bash
sh /tmp/adguardhome.sh -i official
```

詳細な使用方法については「使用例」セクションを参照すること。

## ファイル配置

本スクリプトに関連するファイルは以下のリポジトリで管理されている。

### 実行ファイル

[adguardhome.sh](https://github.com/site-u2023/site-u2023.github.io/blob/main/www/custom-scripts/adguardhome.sh)

本体スクリプトである。全ての機能がこの単一ファイルに実装されている。

### 設定ファイルテンプレート

[adguardhome.yaml](https://github.com/site-u2023/site-u2023.github.io/blob/main/www/custom-scripts/adguardhome.yaml)

YAML設定ファイルのテンプレートである。スクリプトは環境変数`SCRIPT_BASE_URL`で指定されたURLからこのファイルをダウンロードし、プレースホルダーを実際の値で置換して使用する。デフォルトのダウンロード元は`https://site-u.pages.dev/www/custom-scripts/adguardhome.yaml`である。

### 技術仕様書

[AdGuardHome.md](https://github.com/site-u2023/site-u2023.github.io/blob/main/www/custom-scripts/AdGuardHome.md)

本ドキュメントである。スクリプトの仕様、動作、使用方法が詳細に記載されている。

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

環境変数による動作制御は、主に他のスクリプトからの統合実行を想定した実装である。スタンドアロン実行時はコマンドラインオプションの使用を推奨する。コマンドラインオプションが指定された場合、対応する環境変数の値は無視される。

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

`1`を設定した場合、TUI(統合)モードで実行する。コマンドラインオプション`-t`と同等である。

## YAML設定ファイル仕様（カスタム仕様）

本スクリプトは `-n` オプションまたは `NO_YAML=1` が指定されていない場合、`https://site-u.pages.dev/www/custom-scripts/adguardhome.yaml` からテンプレートを取得し、以下のプレースホルダーを環境変数で置換して `AdGuardHome.yaml` を生成します。

| プレースホルダー         | 置換される値                   | デフォルト値 |
|---------------------------|--------------------------------|--------------|
| `{{AGH_USER}}`            | 管理者ユーザー名               | `admin`      |
| `{{AGH_PASS_HASH}}`       | bcryptハッシュ化パスワード     | （入力値）   |
| `{{WEB_PORT}}`            | Web管理画面ポート              | `8000`       |
| `{{DNS_PORT}}`            | DNSサービスポート              | `53`         |
| `{{DNS_BACKUP_PORT}}`     | dnsmasqバックアップポート      | `54`         |
| `{{NTP_DOMAIN}}`          | NTPサーバードメイン            | （システム設定から取得、未設定時は行削除） |

### http セクション
```yaml
http:
  address: 0.0.0.0:{{WEB_PORT}}
```

### users セクション
```yaml
users:
  - name: {{AGH_USER}}
    password: {{AGH_PASS_HASH}}
```

### dns セクション
```yaml
dns:
  port: {{DNS_PORT}}
  refuse_any: true
  upstream_dns:
    - '# LAN domain intercept'
    - '[/lan/]127.0.0.1:{{DNS_BACKUP_PORT}}'
    - '# NTP service'
    - '[/{{NTP_DOMAIN}}/]2606:4700:4700::1111'
    - '[/{{NTP_DOMAIN}}/]1.1.1.1'
    - '# DNS-over-QUIC'
    - quic://unfiltered.adguard-dns.com
    - quic://dns.nextdns.io
    - '# DNS-over-TLS'
    - tls://unfiltered.adguard-dns.com
    - tls://one.one.one.one
    - tls://dns.google
    - tls://dns10.quad9.net
    - '# DNS-over-HTTPS(coercion HTTP/3)'
    - https://dns.cloudflare.com/dns-query
    - https://dns.google/dns-query
    - https://unfiltered.adguard-dns.com/dns-query
    - https://dns.nextdns.io
    - https://dns10.quad9.net/dns-query
```

### bootstrap_dns セクション
```yaml
  bootstrap_dns:
    - 2606:4700:4700::1111
    - 2001:4860:4860::8888
    - 1.1.1.1
    - 8.8.8.8
```

### fallback_dns セクション
```yaml
  fallback_dns:
    - https://dns.cloudflare.com/dns-query
    - https://dns.google/dns-query
    - https://unfiltered.adguard-dns.com/dns-query
    - https://dns.nextdns.io/dns-query
    - https://dns10.quad9.net/dns-query
  upstream_mode: parallel
  local_ptr_upstreams:
    - 127.0.0.1:{{DNS_BACKUP_PORT}}
```

### filters セクション
```yaml
filters:
  - enabled: true
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_1.txt
    name: AdGuard DNS filter
  - enabled: false
    url: https://adguardteam.github.io/HostlistsRegistry/assets/filter_2.txt
    name: AdAway Default Blocklist
  - enabled: false
    url: https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_10_Chinese/filter.txt
    name: AdGuard Chinese filter
  - enabled: false
    url: https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_8_Dutch/filter.txt
    name: AdGuard Dutch filter
  - enabled: false
    url: https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_5_French/filter.txt
    name: AdGuard French filter
  - enabled: false
    url: https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_4_German/filter.txt
    name: AdGuard German filter
  - enabled: false
    url: https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_7_Japanese/filter.txt
    name: AdGuard Japanese filter
  - enabled: false
    url: https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_3_Russian/filter.txt
    name: AdGuard Russian filter
  - enabled: false
    url: https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_6_Spanish/filter.txt
    name: AdGuard Spanish/Portuguese filter
  - enabled: false
    url: https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_9_Turkish/filter.txt
    name: AdGuard Turkish filter
  - enabled: false
    url: https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_13_Ukrainian/filter.txt
    name: AdGuard Ukrainian filter
  - enabled: false
    url: https://raw.githubusercontent.com/tofukko/filter/master/Adblock_Plus_list.txt
    name: 豆腐フィルタ
```

### user_rules セクション
```yaml
user_rules:
  - '# google analytics'
  - '@@||analytics.google.com'
  - '# 日本の主要サービス'
  - '@@||amazon.co.jp^$important'
  - '@@||rakuten.co.jp^$important'
  - '@@||yahoo.co.jp^$important'
  - '@@||mercari.com^$important'
  - '@@||zozo.jp^$important'
  - '@@||cookpad.com^$important'
  - '# SNS関連'
  - '@@||twitter.com^$important'
  - '@@||facebook.com^$important'
  - '@@||instagram.com^$important'
  - '@@||messenger.com^$important'
  - '# LINE関連'
  - '@@||line.me^$important'
  - '@@||line-scdn.net^$important'
  - '# 動画・配信サービス'
  - '@@||youtube.com^$important'
  - '@@||nicovideo.jp^$important'
  - '@@||abema.tv^$important'
  - '# 汎用広告除外'
  - '@@||google-analytics.com^$important'
  - '@@||doubleclick.net^$important'
```

### log セクション
```yaml
log:
  file: ""
```

### schema_version
```yaml
schema_version: 29
```

## 非対話モード実行

全ての環境変数を指定することで非対話モード実行が可能である。`AGH_USER`、`AGH_PASS`、`WEB_PORT`を指定した場合、対話的入力は実行されない。

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

スクリプトはインストール時に`/etc/config/`配下の設定ファイルを自動的にバックアップする。バックアップ対象は`dhcp`、`firewall`の2ファイルであり、それぞれタイムスタンプ付きの`.adguard.bak`拡張子を付与した形で保存される（例: `dhcp.adguard.bak`）。

削除時にバックアップファイルが存在する場合、自動的に元の設定へ復元される。バックアップファイルが存在しない場合は、dnsmasqの設定のみデフォルト値へリセットされる。バックアップファイルは削除処理の完了後に自動的に削除される。

## インストール動作の詳細

### 非破壊的インストール

本スクリプトは、インストール中のネットワーク接続を維持するため、非破壊的なインストールアプローチを採用している。

設定変更は全てUCIシステムにコミットされた後、dnsmasq、odhcpd、firewallサービスが順次再起動される。各サービスの再起動は個別に実行され、失敗時にはバックアップから復元される。AdGuard Homeサービスは全ての設定変更とネットワークサービスの再起動が完了した後に起動される。
これにより、設定の一貫性を保ちながら、万が一の失敗時には確実にロールバック可能な状態を維持する。

### インストール完了後の状態

インストール完了時点では以下の状態となる。

- AdGuard Homeサービスは有効化され、即座に起動している
- dnsmasq、odhcpd、firewallの設定変更は適用済みで各サービスは再起動完了
- dnsmasqはバックアップポート(デフォルト54)で動作し、上流DNSとして127.0.0.1#53(AdGuard Home)を参照
- AdGuard HomeがポートTCP/UDP 53をリスニングし、即座にDNSサービスを提供
- Webインターフェースは起動直後から利用可能

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

### ファイアウォール設定

DNS通信を捕捉するためのリダイレクトルールが追加される。ルール名は`adguardhome_dns_${DNS_PORT}`であり、検出されたIPアドレスファミリーに応じて`ipv4`、`ipv6`、または`any`が設定される。プロトコルはTCPおよびUDPの両方が対象となる。

削除時には、バックアップファイルが存在する場合は全ての設定が復元され、存在しない場合はdnsmasqのみデフォルト設定へリセットされる。いずれの場合も関連サービス(dnsmasq、odhcpd、firewall)が再起動される。

## ネットワーク検出と自動設定

LANインターフェースは`ubus call network.interface.lan status`により自動検出される。検出に失敗した場合はエラー終了する。

IPv4アドレスは`ip -4 -o addr show dev ${LAN} scope global`により取得される。IPv6グローバルアドレスは`ip -6 -o addr show dev ${LAN} scope global`により取得され、一時アドレスは除外される。正規表現`^(2|fd|fc)`に一致するアドレスのみが対象となる。

検出結果に基づいてファイアウォールルールのアドレスファミリーが決定される。IPv4のみ検出された場合は`ipv4`、IPv6のみの場合は`ipv6`、両方存在する場合は`any`が設定される。いずれのアドレスも検出できない場合、ファイアウォール設定はスキップされ、警告メッセージが表示される。

## パスワードハッシュ化処理

`NO_YAML`が設定されていない場合、管理者パスワードはbcryptアルゴリズムでハッシュ化される。この処理のために`htpasswd`コマンドが必要となる。

スクリプトは以下の手順で`htpasswd`の利用可能性を確保する。

1. 既存の`htpasswd`コマンドが機能的である場合、追加のインストールは実行されない
2. `htpasswd`が存在しない場合、または機能していない場合:
   - 依存パッケージ(`libaprutil`、`libapr`、`libexpat`、`libuuid1`、`libpcre2`)をインストール
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

パッケージマネージャーがopkgの場合、`opkg list`により利用可能なバージョンを確認し、`opkg install adguardhome`を実行する。apkの場合は`apk search adguardhome`および`apk add adguardhome`を実行する。

リポジトリにパッケージが存在しない場合、警告メッセージを表示して自動的に公式バイナリインストールへフォールバックする。ネットワークエラーが発生した場合はエラーメッセージを表示して終了する。

OpenWrtパッケージインストール時のサービス名は`adguardhome`となる。

## 設定ファイルパスの決定

設定ファイルのパスはOSバージョンとパッケージマネージャーに基づいて自動決定される。

- OpenWrt 24.10以降、SNAPSHOT、またはAPKベースのシステム: `/etc/adguardhome/adguardhome.yaml`
- OpenWrt 23.05以前: `/etc/adguardhome.yaml`
- 公式バイナリ: `/etc/AdGuardHome/AdGuardHome.yaml`

## YAML設定ファイルの生成タイミング

YAML設定ファイルは、AdGuard Homeパッケージのインストール前に生成される。これにより、パッケージインストール時に既存の設定ファイルが使用され、初期設定が自動的に適用される。

生成処理の流れは以下の通りである。

1. インストールモード（`openwrt`または`official`）に応じて`SERVICE_NAME`を決定
2. 設定ファイルの配置先ディレクトリを作成
3. テンプレートをダウンロードしてプレースホルダーを置換
4. パッケージまたはバイナリのインストールを実行

## 削除モードの詳細動作

削除モードは`-r`オプションまたは`REMOVE_MODE`環境変数により指定される。コマンドラインオプション`-r`が環境変数`REMOVE_MODE`より優先される。

### autoモード

全ての確認プロンプトをスキップし、設定ファイルも自動的に削除される。

削除実行前に「Auto-removing...」という警告メッセージが黄色で表示される。

### manualモード

削除実行前と設定ファイル削除前の2回、ユーザーへ確認を求める。確認に対して`y`または`Y`以外が入力された場合、処理をキャンセルして正常終了する。

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
9. 依存パッケージのクリーンアップ（htpasswd、依存ライブラリ、ca-bundle）
10. 関連サービス(dnsmasq、odhcpd、firewall)の再起動

### 依存パッケージのクリーンアップ

削除時には、インストール時に追加された依存パッケージが自動的にクリーンアップされる。ただし、`apache`パッケージが元々システムにインストールされていた場合は保護され、削除されない。

クリーンアップ対象:
- `htpasswd`バイナリ
- 依存ライブラリ（`libaprutil`、`libapr`、`libexpat`、`libuuid1`、`libpcre2`）
- `ca-bundle`パッケージ

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

dnsmasq、odhcpd、firewallの再起動に失敗した場合、エラーメッセージを表示して終了する。

### LANインターフェース検出

`ubus`によるLANインターフェース検出に失敗した場合、エラーメッセージを表示して終了する。OpenWrt以外の環境で実行された場合に発生する可能性がある。

## Webインターフェース情報の表示

インストール完了時、アクセス情報が以下の形式で表示される。この表示は`get_access`関数により処理される。

### ポート番号の取得

Webインターフェースのポート番号は以下の優先順位で決定される。

1. YAML設定ファイル(`/etc/AdGuardHome/AdGuardHome.yaml`、`/etc/adguardhome/adguardhome.yaml`、または`/etc/adguardhome.yaml`)の`http:`セクションの`address:`フィールドから取得
2. 設定ファイルが存在しない場合、または読み取れない場合は環境変数`WEB_PORT`の値を使用

### IPv4アクセスURL

`http://${NET_ADDR}:${WEB_PORT}/`の形式で表示される。

### IPv6アクセスURL

IPv6グローバルアドレスが検出された場合、`http://[${NET_ADDR6}]:${WEB_PORT}/`の形式で表示される。複数のIPv6アドレスが存在する場合は最初のアドレスのみが表示される。

### 認証情報

`NO_YAML`が設定されていない場合、管理者ユーザー名(`AGH_USER`)とパスワード(`AGH_PASS`)が緑色および黄色で強調表示される。

`NO_YAML=1`の場合、認証情報は表示されず、代わりに「Configure via web interface」というメッセージとデフォルトのセットアップURL(`http://${NET_ADDR}:3000/`)が表示される。

### QRコード生成

`qrencode`コマンドが利用可能な環境では、IPv4およびIPv6のアクセスURLに対応するQRコードが自動生成される。QRコードはUTF-8形式、バージョン3でターミナルに直接表示され、モバイルデバイスからのアクセスを容易にする。

## 使用例

本スクリプトの正式なインターフェースはコマンドラインオプションである。環境変数による制御も技術的には可能であるが、これは主に他のスクリプトからの統合実行を想定した実装詳細であり、通常の使用では推奨されない。

### 対話型インストール

オプション指定なしで実行すると、インストールモードの選択とクレデンシャルの入力が対話的に求められる。
```bash
sh adguardhome.sh
```

### 公式バイナリからのインストール
```bash
sh adguardhome.sh -i official
```

実行時にユーザー名、パスワード、Webポート番号の入力が求められる。

### OpenWrtパッケージからのインストール
```bash
sh adguardhome.sh -i openwrt
```

リポジトリにパッケージが存在しない場合、自動的に公式バイナリへフォールバックする。

### 認証情報更新
```bash
sh adguardhome.sh -m
```

既存のインストールのユーザー名、パスワード、Webポート番号を対話的に更新する。

### YAML生成スキップ
```bash
sh adguardhome.sh -i official -n
```

設定ファイルの自動生成を省略し、Webインターフェース（デフォルトでポート3000）での初期設定を行う。

### システムリソースチェック無効化
```bash
sh adguardhome.sh -i official -c
```

メモリおよびストレージの最小要件チェックをスキップする。

### 自動削除
```bash
sh adguardhome.sh -r auto
```

確認プロンプトなしで削除を実行する。設定ファイルも自動的に削除される。

### 対話的削除
```bash
sh adguardhome.sh -r manual
```

削除実行前と設定ファイル削除前の2回、確認プロンプトが表示される。

### 複合オプション
```bash
sh adguardhome.sh -i official -c -n
```

複数のオプションを同時に指定可能である。指定順序は任意である。

### TUI統合モード
```bash
sh adguardhome.sh -t -i official
```

他のスクリプトからの統合実行用モードである。

### 使用方法の表示
```bash
sh adguardhome.sh -h
```

オプション一覧と使用方法が表示される。

## スタンドアロンモードと統合モード

スクリプトは実行形態により動作が変化する。

### スタンドアロンモード

`$(basename "$0")` が `adguardhome.sh` と一致する場合、スタンドアロンモードとして実行される。

### 統合モード

他のスクリプトから`source`または`.`により読み込まれた場合、統合モードとして動作する。このモードでは、環境変数により全ての動作を制御可能である。外部からの制御を想定した設計となっている。

## 公式OpenWrtドキュメントとの相違点

### ルーター自己DNS解決（バグ対応）

公式OpenWrtのAdGuard Homeドキュメントでは、初期セットアップ時に管理Webインターフェースを`192.168.1.1:3000`にバインドするよう指示しています。この設定には重大な制限があります：

**問題点：**
- IPv6クライアントからWebインターフェースにアクセスできない
- IPv4のみに限定される

**解決方法：**
本スクリプトはYAML設定テンプレートで`0.0.0.0:{{WEB_PORT}}`を使用し、利用可能なすべてのネットワークインターフェース（IPv4とIPv6の両方）にバインドします。これにより以下が保証されます：
- ✓ IPv4クライアントからのアクセス
- ✓ IPv6クライアントからのアクセス
- ✓ ルーターの全インターフェース

ファイアウォール設定によりLANゾーンに制限されているため、セキュリティは維持されます。
