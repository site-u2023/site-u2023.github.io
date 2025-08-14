# ネットワーク設定ツール構成（MAP-E / DS-Lite 統合）

## 目的と前提
最小構成で「情報取得 → 入力補完 → 選択 → パッケージ解決 → setup.sh 生成」までを一貫化。  
MAP-E／DS-Lite は単一エンジンで扱い、UI は薄く保つ。  
外部実体は次を使用する。

- **情報:** https://auto-config.site-u.workers.dev/
- **パッケージ:** `selector/packages/packages.json`
- **テンプレ:** `selector/uci-defaults/setup.sh`
- **言語:** `selector/language.js`
- **デバイス設定:** IP Address など（UI入力）
- **ネットワーク:** `dhcp` / `pppoe` / `map-e` / `ds-lite`

---

## 全体アーキテクチャ図
```
[UI (HTML/CSS)]
   |  ^                 ^                         ^
   v  |                 |                         |
[ui/form.js] ---> [core/state.js] <------------ [core/i18n.js]
   |                    |                         (wrap language.js)
   |                    v
   |            [core/api.js]  -- fetch -->  (auto-config endpoint)
   |                    |
   |                    v
   |           [network/net.wan.js]
   |            (dhcp/pppoe/mape/dslite 統合)
   |               |            |
   |               v            v
   |         [core/packages.js]  (packages.json)
   |               |
   |               v
   |         [core/template.js] -----> (uci-defaults/setup.sh をパッチ)
   |                    |
   v                    v
[ui/visibility.js]   [ui/save.js] ---> (出力/ダウンロード)
```


---

## モジュール構成

### core
- **state.js**: 単一状態源（選択値・API応答・派生値）
- **api.js**: 情報取得と最小キャッシュ
- **i18n.js**: `language.js` の薄いラッパ
- **packages.js**: `packages.json` 読み込みと解決
- **template.js**: `setup.sh` テンプレのパッチャ

### network
- **net.wan.js**: WAN 統合エンジン（map-e/ds-lite/dhcp/pppoe）
- **validators.js**: 入力検証（IPv6、Prefix、PPPoEユーザなど）

### ui
- **form.js**: DOM バインドと state 同期
- **visibility.js**: セクション表示制御
- **save.js**: 出力生成とダウンロード

### device
- **ipaddr.js**: IPv4/IPv6 入力支援
- **model.js**: デバイスプロファイル（必要に応じて）

---

## データフロー

1. **起動時**
   - UI 初期化 → `state` 初期化
   - `api.fetchIspInfo()` → API 応答を state に格納
   - 空欄入力へ API 値を自動補完
   - GUA プレフィックス計算 → 表示制御へ反映

2. **選択変更時**
   - プロトコル決定 → パッケージ解決
   - テンプレ反映 → プレビュー更新

3. **出力時**
   - テンプレ最終化 → 保存

---

## ネットワーク別 入力・出力

| モード    | 必要入力 | 追加パッケージ | テンプレ反映内容 |
|-----------|----------|---------------|------------------|
| DHCP      | 任意で VLAN | なし          | `proto=dhcp`     |
| PPPoE     | user/pass, VLAN任意 | なし | `proto=pppoe`, 認証情報 |
| MAP-E     | br, eaBitLength, IPv4/IPv6 Prefix, psIdOffset, psidlen | map | MAP-E セクション、GUA（必要時） |
| DS-Lite   | AFTR IPv6 または ISP推定 | ds-lite | DS-Lite セクション |
| Auto      | API応答優先（dslite→mape→dhcp） | APIに応じ付与 | 同上 |

---

## 作成・更新するファイル

- `selector/core/state.js`
- `selector/core/api.js`
- `selector/core/i18n.js`
- `selector/core/packages.js`
- `selector/core/template.js`
- `selector/network/net.wan.js`
- `selector/network/validators.js`
- `selector/ui/form.js`
- `selector/ui/visibility.js`
- `selector/ui/save.js`
- 既存:
  - `selector/language.js`
  - `selector/packages/packages.json`
  - `selector/uci-defaults/setup.sh`
