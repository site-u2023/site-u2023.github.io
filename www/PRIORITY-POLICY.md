# aios2 実行優先順位ポリシー

## 概要

全てのJSON設定ファイル内のアイテムに `priority` 値を設定し、実行順序を制御する。
値が小さいほど先に実行される。

---

## 256刻みルール

```
postinst:       256
customfeeds:    512
setup:          768
customscripts: 1024
```

---

## 優先順位帯域

| priority | 用途 | 対象JSON |
|----------|------|----------|
| 256 | 基本パッケージインストール | postinst.json |
| 512 | カスタムフィードパッケージ | customfeeds.json |
| 768 | UCI設定 | setup.json |
| 1024 | カスタムスクリプト | customscripts.json |

---

## 基本ルール

- 同一帯域内のアイテムは同じ値でOK
- 順序制御が必要な場合のみ +1, +2... で微調整

```json
// 通常（順序不問）
{ "id": "luci-i18n-base-ja", "priority": 256 }
{ "id": "luci-app-ttyd", "priority": 256 }
{ "id": "luci-base", "priority": 256 }

// 順序制御が必要な場合のみ
{ "id": "network-script", "priority": 1024 }
{ "id": "adguardhome", "priority": 1025 }  // DNS変更するため最後
```

---

## JSON記述例

### postinst.json

```json
{
  "id": "luci-i18n-base-ja",
  "priority": 256
}
```

### customfeeds.json

```json
{
  "id": "cpu-usage",
  "priority": 512
}
```

### customscripts.json

```json
{
  "id": "adguardhome",
  "priority": 1025
}
```

---

## 設計原則

1. **256刻みが基本**
2. **同列は同じ値**
3. **微調整は必要な時だけ +1**
4. **将来拡張は 1280, 1536...**

---

## 実行エンジン（将来実装）

```sh
collect_all_tasks | sort_by_priority | execute_tasks
```

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2024-11-27 | 初版作成 |
