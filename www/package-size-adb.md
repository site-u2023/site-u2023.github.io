# packages.adb によるパッケージインストールサイズ取得（未実装）

## 概要

OpenWrt の APK パッケージ管理（v25.12 以降）では、各フィードに `packages.adb` というバイナリインデックスが存在する。
このファイルを直接パースすることで、パッケージごとの **インストールサイズ** を一括取得できる。

従来の実装ではパッケージごとに個別のフェッチを行っていたが、`.adb` を使うことで
**フィード数（6〜7本固定）のリクエストだけで全パッケージのサイズを取得できる。**

### 対象バージョン

| パッケージマネージャー | バージョン | サイズ取得方法 |
|---|---|---|
| APK | v25.12 以降 | `packages.adb` を直接パース（本ドキュメント） |
| OPKG | v24.10 以前 | `Packages` テキストファイルの `Size:` フィールド（削除済み） |

---

## フェッチ対象

デバイスの `version` / `arch` / `vendor` / `subtarget` が確定した時点でフェッチする。

```
releases/{version}/packages/{arch}/base/packages.adb        （+ index.json）
releases/{version}/packages/{arch}/packages/packages.adb
releases/{version}/packages/{arch}/luci/packages.adb
releases/{version}/packages/{arch}/routing/packages.adb
releases/{version}/packages/{arch}/telephony/packages.adb
releases/{version}/targets/{vendor}/{subtarget}/packages/packages.adb
releases/{version}/targets/{vendor}/{subtarget}/kmods/{kmodVer}/packages.adb
```

`index.json` はパッケージ名一覧の取得に使う（名前セットとして `.adb` パースの照合に使用）。  
`packages.adb` と `index.json` は並列フェッチ（`Promise.all`）。

---

## `.adb` バイナリ構造

APK の `.adb` は **zlib raw 圧縮**されたバイナリ。先頭 4 バイトはマジックナンバーのためスキップ。

```
[4 bytes: magic] [zlib raw compressed data]
```

展開後のバイナリには以下の 2 種類のデータが混在している。

### サイズペア（installed / file）

上位 4 ビットが `0x1` の 32 ビット値が 2 つ連続する箇所がサイズペア。

```
v1 = uint32LE  →  (v1 >>> 28) === 0x1  かつ  installed = v1 & 0x0FFFFFFF
v2 = uint32LE  →  (v2 >>> 28) === 0x1  かつ  file      = v2 & 0x0FFFFFFF
```

フィルタ条件:
- `installed >= 100` かつ `file >= 100`（ノイズ除去）
- `file <= installed`（展開後は常にファイルサイズ以上）

### パッケージ名位置

バイト列をスキャンし、`index.json` の名前セットに一致する文字列を名前位置として記録する。

有効な文字: `[0-9A-Za-z+\-.]`（APK パッケージ名の文字セット）

名前の直後に続くバイナリデータ（長さ 20 または 32 バイトのハッシュ値と推定）を  
「バイナリ率 40% 以上」の条件で検出し、名前位置の確認として使用する。

### 名前とサイズペアの紐付け

名前位置オフセットから **+1500 バイト以内** にある最初のサイズペアを、そのパッケージのサイズとして採用。

---

## 検証結果（v25.12.0-rc5 / aarch64_cortex-a53 / mediatek filogic）

```
[base]      total=736   found=702   added=702   （95.4%）
[packages]  total=4550  found=3832  added=3832  （84.2%）
[luci]      total=3369  found=2752  added=2752  （81.7%）
[routing]   total=56    found=54    added=54    （96.4%）
[telephony] total=873   found=866   added=866   （99.2%）
[targets]   total=95    found=92    added=92    （96.8%）
[kmods]     total=1093  found=1081  added=1081  （98.9%）

総計: 9379 パッケージ
```

主要パッケージの結果:

```
dnsmasq:            installed=306KiB  file=144KiB  [base]
netifd:             installed=294KiB  file=117KiB  [base]
map:                installed=72KiB   file=8KiB    [base]
ds-lite:            installed=3KiB    file=2KiB    [base]
kmod-tcp-bbr:       installed=11KiB   file=6KiB    [kmods]
kmod-nft-nat:       installed=20KiB   file=5KiB    [kmods]
kmod-nft-offload:   installed=15KiB   file=5KiB    [kmods]
luci-base:          installed=9KiB    file=4KiB    [luci]
```

取得できていない残り（約 15〜18%）はバイナリ構造のエッジケースによるパース漏れ。  
実用上問題となるパッケージは全て取得できている。

---

## 実装コード

以下は `custom.js` にそのまま組み込める形で記述している。  
依存ライブラリ: [pako](https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js)（zlib 展開）

### `parseAdbWithIndex` — コアパーサー

```javascript
// ==================== ADB パッケージサイズパーサー ====================
async function parseAdbWithIndex(indexUrl, adbUrl) {
    const [indexData, adbBuf] = await Promise.all([
        fetch(indexUrl).then(r => r.json()),
        fetch(adbUrl).then(r => r.arrayBuffer())
    ]);

    const packageNames = Object.keys(indexData.packages || {});
    const nameSet      = new Set(packageNames);
    const raw = pako.inflateRaw(new Uint8Array(adbBuf).slice(4));
    const dv  = new DataView(raw.buffer);

    const isNameChar = c =>
        (c >= 48 && c <= 57)  ||   // 0-9
        (c >= 65 && c <= 90)  ||   // A-Z
        (c >= 97 && c <= 122) ||   // a-z
        c === 43 || c === 45 || c === 46;  // + - .

    // サイズペアのスキャン
    const sizePairs = [];
    for (let i = 16; i < raw.length - 8; i += 4) {
        const v1 = dv.getUint32(i,   true);
        const v2 = dv.getUint32(i+4, true);
        if ((v1 >>> 28) !== 0x1 || (v2 >>> 28) !== 0x1) continue;
        const installed = v1 & 0x0FFFFFFF;
        const file      = v2 & 0x0FFFFFFF;
        if (installed < 100 || file < 100) continue;
        if (file > installed) continue;
        sizePairs.push({ offset: i, installed, file });
    }

    // パッケージ名位置のスキャン
    const namePositions = new Map();
    for (let i = 20; i < raw.length - 2; ) {
        const nlen = raw[i];
        if (nlen < 2 || nlen > 80 || i + 1 + nlen >= raw.length) { i++; continue; }
        let ok = true;
        for (let k = i + 1; k < i + 1 + nlen; k++) {
            if (!isNameChar(raw[k])) { ok = false; break; }
        }
        if (!ok) { i++; continue; }
        const name = String.fromCharCode(...raw.slice(i + 1, i + 1 + nlen));
        if (nameSet.has(name) && !namePositions.has(name)) {
            const scanEnd = Math.min(i + 300, raw.length - 1);
            for (let sp = i + 1 + nlen; sp < scanEnd; sp++) {
                const hlen = raw[sp];
                if (hlen !== 20 && hlen !== 32) continue;
                if (sp + 1 + hlen >= raw.length) continue;
                let binCount = 0;
                for (let k = sp + 1; k <= sp + hlen; k++) {
                    if (raw[k] < 32 || raw[k] > 126) binCount++;
                }
                if (binCount >= Math.floor(hlen * 0.4)) {
                    namePositions.set(name, i);
                    break;
                }
            }
        }
        i += 1 + nlen;
    }

    // 名前とサイズペアの紐付け
    const results = {};
    for (const [name, nameOff] of namePositions) {
        for (const sp of sizePairs) {
            if (sp.offset > nameOff && sp.offset < nameOff + 1500) {
                results[name] = { installed: sp.installed, file: sp.file };
                break;
            }
        }
    }

    return { results, found: Object.keys(results).length, total: packageNames.length };
}
```

### `loadPackageSizes` — 全フィード一括取得

```javascript
// ==================== ADB 全フィード一括取得 ====================
// 戻り値: Map<pkgName, { installed: number, file: number, feed: string }>
// キャッシュキー: state.cache.packageSizes （version:arch をキーに再利用）
async function loadPackageSizes(version, arch, vendor, subtarget) {
    const cacheKey = `${version}:${arch}`;
    if (state.cache.packageSizes && state.cache.packageSizes.has(cacheKey)) {
        return state.cache.packageSizes.get(cacheKey);
    }

    const allResults = new Map();
    const base = `https://downloads.openwrt.org/releases/${version}`;

    // フィードフィード（固定順。先勝ち）
    const feeds = ['base', 'packages', 'luci', 'routing', 'telephony'];
    for (const feed of feeds) {
        const feedBase = `${base}/packages/${arch}/${feed}`;
        try {
            const { results } = await parseAdbWithIndex(
                `${feedBase}/index.json`,
                `${feedBase}/packages.adb`
            );
            for (const [name, val] of Object.entries(results)) {
                if (!allResults.has(name)) {
                    allResults.set(name, { ...val, feed });
                }
            }
        } catch (e) {
            console.warn(`[loadPackageSizes] feed=${feed} failed:`, e.message);
        }
    }

    // targets
    try {
        const targetsBase = `${base}/targets/${vendor}/${subtarget}/packages`;
        const { results } = await parseAdbWithIndex(
            `${targetsBase}/index.json`,
            `${targetsBase}/packages.adb`
        );
        for (const [name, val] of Object.entries(results)) {
            if (!allResults.has(name)) {
                allResults.set(name, { ...val, feed: 'targets' });
            }
        }
    } catch (e) {
        console.warn('[loadPackageSizes] targets failed:', e.message);
    }

    // kmods（バージョンディレクトリを動的取得）
    try {
        const kmodsBase = `${base}/targets/${vendor}/${subtarget}/kmods`;
        const dirHtml = await fetch(`${kmodsBase}/`).then(r => r.text());
        const kmodVer = dirHtml.match(/href="([0-9]+\.[0-9]+\.[0-9]+-[0-9]+-[0-9a-f]+)\//)?.[1];
        if (kmodVer) {
            const kmodsUrl = `${kmodsBase}/${kmodVer}`;
            const { results } = await parseAdbWithIndex(
                `${kmodsUrl}/index.json`,
                `${kmodsUrl}/packages.adb`
            );
            for (const [name, val] of Object.entries(results)) {
                if (!allResults.has(name)) {
                    allResults.set(name, { ...val, feed: 'kmods' });
                }
            }
        }
    } catch (e) {
        console.warn('[loadPackageSizes] kmods failed:', e.message);
    }

    if (!state.cache.packageSizes) state.cache.packageSizes = new Map();
    state.cache.packageSizes.set(cacheKey, allResults);

    console.log(`[loadPackageSizes] ${allResults.size} packages loaded for ${cacheKey}`);
    return allResults;
}
```

### `getPackageInstalledSize` — 個別サイズ取得ヘルパー

```javascript
// ==================== 個別パッケージインストールサイズ取得 ====================
// 戻り値: installed サイズ（バイト）。未取得の場合は null。
function getPackageInstalledSize(pkgName) {
    if (!state.cache.packageSizes) return null;
    const cacheKey = `${state.device.version}:${state.device.arch}`;
    const sizeMap = state.cache.packageSizes.get(cacheKey);
    if (!sizeMap) return null;
    return sizeMap.get(pkgName)?.installed ?? null;
}
```

### `updatePackageSizeDisplay` — UI 反映

```javascript
// ==================== パッケージサイズ UI 反映 ====================
// createPackageCheckbox で生成した label 内の .pkg-size スパンにサイズを書き込む。
// generatePackageSelector → verifyAllPackages 完了後に呼び出す。
function updatePackageSizeDisplay() {
    const cacheKey = `${state.device.version}:${state.device.arch}`;
    const sizeMap  = state.cache.packageSizes?.get(cacheKey);
    if (!sizeMap) return;

    document.querySelectorAll('.package-selector-checkbox').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        if (!pkgName) return;

        const entry = sizeMap.get(pkgName);
        if (!entry) return;

        const label = cb.closest('label');
        if (!label) return;

        let sizeSpan = label.querySelector('.pkg-size');
        if (!sizeSpan) {
            sizeSpan = document.createElement('span');
            sizeSpan.className = 'pkg-size';
            label.appendChild(sizeSpan);
        }

        const kib = Math.round(entry.installed / 1024);
        sizeSpan.textContent = ` ${kib.toLocaleString()} KiB`;
    });
}
```

### CSS（`custom.css` に追加）

```css
/* パッケージサイズ表示 */
.pkg-size {
    color: var(--text-muted);
    font-size: 0.8em;
    margin-left: 0.4em;
}
```

---

## 実装時の呼び出しフロー

```
window.updateImages（version/arch確定）
    ↓
loadPackageSizes(version, arch, vendor, subtarget)   ← 非同期で開始
    ↓
verifyAllPackages() 完了
    ↓
updatePackageSizeDisplay()   ← sizeMap が揃っていれば即時反映
```

デバイス変更時のキャッシュクリア（既存の `window.updateImages` 内）に以下を追加:

```javascript
state.cache.packageSizes?.clear();
```

---

## 関連ファイル

| ファイル | 関連箇所 |
|---|---|
| `www/custom.js` | `createPackageCheckbox`, `generatePackageSelector`, `verifyAllPackages`, `window.updateImages` |
| `www/custom.css` | `.pkg-size` スタイル |
| `www/post-install/postinst.json` | 表示対象パッケージ定義 |
| `www/variables/package-manager.json` | フィード URL テンプレート |
