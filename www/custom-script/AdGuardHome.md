# AdGuard Home インストールスクリプト - 技術仕様書

## 書式
```
adguardhome.sh [-c] [-n] [-r <mode>] [-i <source>]
```

## オプション

**-c**

システムリソースチェックを無効化する。

**-n**

YAML設定ファイルの自動生成を無効化する。環境変数`NO_YAML=1`と同等である。

**-r** *mode*

削除モードを指定する。

- **auto** - 確認なしで自動削除
- **manual** - 対話的確認後に削除

**-i** *source*

インストールソースを指定する。

- **openwrt** - OpenWrtリポジトリパッケージ
- **official** - GitHub公式バイナリ

オプションの指定順序は任意である。

## 環境変数

**INSTALL_MODE**

インストールソースを指定する。`openwrt`または`official`を設定可能である。コマンドラインオプション`-i`が優先される。

**NO_YAML**

`1`を設定した場合、YAML自動生成を無効化する。コマンドラインオプション`-n`と同等である。

**REMOVE_MODE**

削除モードを指定する。`auto`または`manual`を設定可能である。コマンドラインオプション`-r`が優先される。

**AGH_USER**

管理者ユーザー名を指定する。デフォルト値は`admin`である。`NO_YAML`未設定時のみ有効である。

**AGH_PASS**

管理者パスワードを指定する。デフォルト値は`password`、最小8文字である。`NO_YAML`未設定時のみ有効である。bcryptハッシュ化される。

注意: デフォルト値`password`は脆弱であり、本番環境では必ず変更すること。

**WEB_PORT**

Webインターフェースポート番号を指定する。デフォルト値は`8000`である。`NO_YAML`未設定時のみ有効である。

**DNS_PORT**

DNSサービスポート番号を指定する。デフォルト値は`53`である。`NO_YAML`未設定時のみ有効である。

**DNS_BACKUP_PORT**

バックアップdnsmasqポート番号を指定する。デフォルト値は`54`である。`NO_YAML`未設定時のみ有効である。

**LAN_ADDR**

LANインターフェースIPv4アドレスを指定する。未設定時は自動検出される。`NO_YAML`未設定時のみ有効である。

**SCRIPT_BASE_URL**

YAMLテンプレートダウンロード元URLを指定する。デフォルト値は`https://site-u.pages.dev/www/custom-script`である。

**SKIP_RESOURCE_CHECK**

コマンドラインオプション`-c`により自動設定される内部変数である。

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

`MINIMUM_MEM`または`MINIMUM_FLASH`を下回った場合、エラー終了する。コマンドラインオプション`-c`によりチェックを無効化できる。

参考: AdGuard Home公式Wikiでは最小50MBのRAMおよび100MBのフラッシュストレージを要件として記載している。本スクリプトはこれより低い基準を設定しているが、公式要件を満たさない環境での動作は保証されない。

## パッケージマネージャー検出

opkgまたはapkを自動検出する。いずれも存在しない場合はエラー終了する。

## 使用例

対話型インストール:
```
sh adguardhome.sh
```

非対話型インストール:
```
INSTALL_MODE=official AGH_USER=admin AGH_PASS=securepass123 sh adguardhome.sh
```

Web手動設定モード:
```
sh adguardhome.sh -i official -n
```

リソースチェック無効化:
```
sh adguardhome.sh -i official -c
```

自動削除:
```
sh adguardhome.sh -r auto
```

複合指定:
```
AGH_USER=admin AGH_PASS=mypassword sh adguardhome.sh -i official -c -n
```
