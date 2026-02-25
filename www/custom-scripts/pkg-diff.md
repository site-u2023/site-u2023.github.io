# 追加パッケージ一覧 (pkg-diff)

現在のデバイスにインストールされているパッケージと、ASUの `profiles.json`（デバイス別固有パッケージ）をベースラインとして比較し、ユーザーが追加したパッケージを抽出するツール。

結果は `/tmp/aios2/pkg-diff-result.txt` に保存される。

---

## 実行方法

### aios2から実行

メインメニュー → カスタムスクリプト → 追加パッケージ一覧

### スタンドアロン実行

```sh
sh pkg-diff.sh
```

---

## 処理の仕組み

### 1. デバイス情報の検出

| 情報 | 取得元 |
|------|--------|
| バージョン | `/etc/openwrt_release` の `DISTRIB_RELEASE` |
| ターゲット | `/etc/openwrt_release` の `DISTRIB_TARGET` |
| プロファイル | `/etc/board.json` の `model.id`（カンマ→アンダースコア変換） |
| パッケージマネージャー | `apk` または `opkg` を自動判別 |

### 2. ベースラインの取得

```
ベースライン = default_packages + device_packages（-指定は除外） + EXTRA_BASELINE（luci）
```

- リリース版：`https://downloads.openwrt.org/releases/{version}/targets/{target}/profiles.json`
- SNAPSHOT版：`https://downloads.openwrt.org/snapshots/targets/{target}/profiles.json`

### 3. 現在のパッケージリスト取得

| PKG MGR | 取得元 |
|---------|--------|
| apk | `/etc/apk/world`（バージョン接尾辞を除去） |
| opkg | `/usr/lib/opkg/status`（`Status: install user installed` を抽出） |

### 4. 差分計算

```
[+] Added   = 現在インストール済み − ベースライン
[-] Removed = ベースライン − 現在インストール済み
```

### 5. トップレベルパッケージの抽出

Added パッケージの中から、他の Added パッケージの依存として解決されるものを除外し、最上位パッケージのみを抽出する。

例：`luci-i18n-ttyd-ja` が Added なら、その依存 `luci-app-ttyd` は除外される。

---

## apkについて

`/etc/apk/world` にはパッケージ名のみが記録され、インストール日時が存在しない。そのため、opkgで可能だったインストール日時とフラッシュ書き込み日時の比較によるユーザー追加判定はapkでは不可能となった。

この問題はOpenWrtフォーラムでも議論されている：

> **Apk: how to determine which packages were "user-installed"?**  
> https://forum.openwrt.org/t/apk-how-to-determine-which-packages-were-user-installed/245830
>
> *"Using apk, how does one determine which packages were 'user-installed'?  
> With ipkg it seems there was a way to determine the install date/time, so one could determine  
> which packages were installed after the firmware flashing process.  
> From what I can see, there isn't an easy way to quickly parse this out within the confines  
> of the installation itself."*  
> — davygravy, January 30, 2026

本ツールはこの制約に対し、ASUの `profiles.json` をベースラインとして直接取得・比較する方式を採用している。

---

## 既知の問題：パッケージ名の不整合

`profiles.json` はビルドシステムが使うvirtual name（メタパッケージ名）で記述されている。apkが実際にインストールする際にバージョン付きの実名に解決されるため、名前が一致しないケースがある。

例：`profiles.json` の `libgcc` → インストール後の実名 `libgcc1`

該当パッケージは `[-] Removed` に誤検出される。原因は特定済み、未対策。

---

## 出力フォーマット

```
============================================================
 pkg-diff result  2026-02-25 13:47:32
============================================================
 Profile  : bananapi_bpi-r4
 Version  : 25.12.0-rc5
 Target   : mediatek/filogic
 PKG MGR  : apk
 Baseline : 43 pkgs  |  Installed: 95 pkgs
------------------------------------------------------------

[+] Added packages (55)  <- not in baseline (user-installed)
------------------------------------------------------------
adguardhome
block-mount
...

[-] Removed packages (3)  <- in baseline but not installed
------------------------------------------------------------
libgcc
libustream-mbedtls
nftables

============================================================
 [ Copy-paste: top-level packages (45) ]
   Dependencies auto-resolved; only root packages listed.
============================================================
adguardhome block-mount conntrack ...（スペース区切り1行）...

============================================================
 Saved to: /tmp/aios2/pkg-diff-result.txt
============================================================
```

---

## 結果ファイルの取得

### ブラウザからDL

uhttpdのWebルートにシンボリックリンクを作成する。

```sh
ln -s /tmp/aios2 /www/dl
```

```
http://[LAN-IP]/dl/pkg-diff-result.txt
```

LAN内限定。認証なし。Reboot後はリンク先（`/tmp/aios2`）が消えるがリンク自体は残る。

### SCP

```sh
scp root@[LAN-IP]:/tmp/aios2/pkg-diff-result.txt ./
```

---

## 注意事項

- 実行にはインターネット接続が必要（`profiles.json` のダウンロードのため）
- `/tmp` はRAM上にあるため、Reboot後に結果ファイルは消える
