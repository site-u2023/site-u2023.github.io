# gSpotx2f カスタムフィードインストールスクリプト - 技術仕様書

## 概要

gSpotx2fリポジトリから提供されるLuCIアプリケーションパッケージをインストールするためのスクリプトである。システムモニタリング、ログビューア、インターネット接続監視などの機能を提供するパッケージ群をGitHubから直接取得してインストールする。

## ファイル配置

本スクリプトに関連するファイルは以下のリポジトリで管理されている。

### 実行ファイル

[gSpotx2f.sh](https://github.com/site-u2023/site-u2023.github.io/blob/main/www/custom-feeds/gSpotx2f.sh)

本体スクリプトである。パッケージのダウンロードとインストール処理が実装されている。

### 設定ファイル

[customfeeds.json](https://github.com/site-u2023/site-u2023.github.io/blob/main/www/custom-feeds/customfeeds.json)

パッケージ定義とリポジトリ情報が記載されたJSON設定ファイルである。

### 技術仕様書

[gSpotx2f.md](https://github.com/site-u2023/site-u2023.github.io/blob/main/www/custom-feeds/gSpotx2f.md)

本ドキュメントである。スクリプトの仕様、動作、提供パッケージが詳細に記載されている。

## システム要件

### 対応OpenWrtバージョン

- 最小バージョン: OpenWrt 21.02以降
- パッケージマネージャー: opkg または apk

### パッケージマネージャー別対応

| パッケージマネージャー | 拡張子 | リポジトリパス |
|------------------------|--------|----------------|
| opkg | `.ipk` | 24.10 |
| apk | `.apk` | 25.12 |

## リポジトリ情報

### API エンドポイント

パッケージ一覧の取得に使用されるGitHub Contents APIのURLは以下の通りである。

- opkg用: `https://api.github.com/repos/gSpotx2f/packages-openwrt/contents/24.10`
- apk用: `https://api.github.com/repos/gSpotx2f/packages-openwrt/contents/25.12`

### ダウンロードベースURL

パッケージファイルのダウンロードに使用されるURLは以下の通りである。

- opkg用: `https://raw.githubusercontent.com/gSpotx2f/packages-openwrt/master/24.10`
- apk用: `https://raw.githubusercontent.com/gSpotx2f/packages-openwrt/master/25.12`

## 提供パッケージ一覧

### luci-app-log-viewer

システムログビューアである。LuCIインターフェースからシステムログをリアルタイムで閲覧可能にする。

| 項目 | 値 |
|------|-----|
| パターン | `luci-app-log-viewer` |
| 最小OpenWrtバージョン | 22.03 |
| 再起動サービス | rpcd |
| 依存パッケージ | なし |

### luci-app-cpu-status

CPU状態モニターである。LuCIステータスページにCPU使用率を表示する。

| 項目 | 値 |
|------|-----|
| パターン | `luci-app-cpu-status` |
| 除外パターン | `luci-app-cpu-status-mini` |
| 最小OpenWrtバージョン | 21.02 |
| 再起動サービス | rpcd |
| 依存パッケージ | なし |

### luci-app-cpu-perf

CPUパフォーマンスモニターである。詳細なCPUパフォーマンス情報を提供する。

| 項目 | 値 |
|------|-----|
| パターン | `luci-app-cpu-perf` |
| 最小OpenWrtバージョン | 22.03 |
| 有効化サービス | cpu-perf |
| 再起動サービス | rpcd |
| 依存パッケージ | なし |

### luci-app-temp-status

システム温度モニターである。LuCIステータスページにシステム温度を表示する。

| 項目 | 値 |
|------|-----|
| パターン | `luci-app-temp-status` |
| 最小OpenWrtバージョン | 22.03 |
| 再起動サービス | rpcd |
| 依存パッケージ | なし |

### luci-app-disks-info

ディスク情報表示である。接続されているストレージデバイスの情報を表示する。

| 項目 | 値 |
|------|-----|
| パターン | `luci-app-disks-info` |
| 最小OpenWrtバージョン | 21.02 |
| 依存パッケージ | なし |

### internet-detector

インターネット接続監視デーモンである。インターネット接続状態を監視し、切断時にアクションを実行可能にする。

| 項目 | 値 |
|------|-----|
| パターン | `internet-detector-` |
| 除外パターン | `luci-app-internet-detector\|internet-detector-mod-` |
| 最小OpenWrtバージョン | 21.02 |
| 有効化サービス | internet-detector |
| 依存パッケージ | luci-app-internet-detector, internet-detector-mod-modem, internet-detector-mod-email |

### luci-app-internet-detector

Internet DetectorのLuCIインターフェースである。

| 項目 | 値 |
|------|-----|
| パターン | `luci-app-internet-detector` |
| 最小OpenWrtバージョン | 21.02 |
| 再起動サービス | rpcd |
| 依存パッケージ | なし |

### internet-detector-mod-modem

モデム再起動モジュールである。インターネット切断時にモデムを自動再起動する機能を提供する。

| 項目 | 値 |
|------|-----|
| パターン | `internet-detector-mod-modem` |
| 最小OpenWrtバージョン | 21.02 |
| 再起動サービス | internet-detector |
| 依存パッケージ | なし |

### internet-detector-mod-email

メール通知モジュールである。インターネット接続状態の変化をメールで通知する機能を提供する。

| 項目 | 値 |
|------|-----|
| パターン | `internet-detector-mod-email` |
| 最小OpenWrtバージョン | 21.02 |
| 再起動サービス | internet-detector |
| 依存パッケージ | なし |

## スクリプト動作の詳細

### 環境変数

スクリプトは以下の環境変数を使用する。これらは呼び出し元から設定される。

**PKG_MGR**

使用するパッケージマネージャーを指定する。`opkg`または`apk`である。

**PKG_EXT**

パッケージファイルの拡張子を指定する。`ipk`または`apk`である。

**PACKAGES**

インストール対象のパッケージ定義をスペース区切りで指定する。各パッケージは以下の形式である。
```
pattern:exclude:filename:enable_service:restart_service
```

**API_URL**

パッケージ一覧取得用のAPIエンドポイントURLを指定する。

**DOWNLOAD_BASE_URL**

パッケージダウンロード用のベースURLを指定する。

**PKG_INSTALL_CMD_TEMPLATE**

パッケージインストールコマンドのテンプレートを指定する。`{package}`プレースホルダーが実際のパッケージパスに置換される。

### パッケージ検索ロジック

1. GitHub Contents APIからファイル一覧を取得
2. パターンと拡張子でフィルタリング
3. 除外パターンに一致するものを除外
4. 最初に一致したパッケージを選択

### インストール処理

1. パッケージファイルをダウンロード
2. パッケージマネージャーでインストール
3. `enable_service`が指定されている場合、サービスを有効化して起動
4. `restart_service`が指定されている場合、サービスを再起動
5. ダウンロードしたパッケージファイルを削除

### テンプレート展開

`expand_template`関数により、コマンドテンプレート内のプレースホルダーが実際の値に置換される。
```
{package} → 実際のパッケージファイルパス
```

## ログ出力

スクリプトの実行ログは以下のファイルに出力される。
```
/tmp/aios2/debug.log
```

ログには以下の情報が記録される。

- 使用パッケージマネージャー
- 処理対象パッケージパターン
- 検出されたパッケージ名
- ダウンロードURL
- インストール結果
- サービス操作結果

## エラーハンドリング

### API取得失敗

GitHub APIからのレスポンス取得に失敗した場合、エラーメッセージを出力して終了する。

### パッケージ未検出

指定されたパターンに一致するパッケージが見つからない場合、エラーメッセージを出力して次のパッケージ処理に進む。

### ダウンロード失敗

パッケージのダウンロードに失敗した場合、エラーメッセージを出力し、一時ファイルを削除して次のパッケージ処理に進む。

## 外部リンク

- [gSpotx2f/packages-openwrt](https://github.com/gSpotx2f/packages-openwrt) - パッケージリポジトリ
- [gSpotx2f/luci-app-cpu-status](https://github.com/gSpotx2f/luci-app-cpu-status) - CPU Status
- [gSpotx2f/luci-app-temp-status](https://github.com/gSpotx2f/luci-app-temp-status) - Temperature Status
- [gSpotx2f/internet-detector](https://github.com/gSpotx2f/internet-detector) - Internet Detector
