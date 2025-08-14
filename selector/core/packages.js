// selector/core/packages.js
// packages.json を読み込み、依存・i18n を解決して最終パッケージ列を生成。

import { buildI18nMap, normalizeLang } from './i18n.js';

const PACKAGES_JSON = 'selector/packages/packages.json';

export async function loadPackagesDB() {
  const r = await fetch(PACKAGES_JSON, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`loadPackagesDB: HTTP ${r.status}`);
  return await r.json(); // { categories: [ { id,name,packages:[{id,name,dependencies,hidden,enableVar}] } ] }
}

export function splitList(str) {
  return str?.match(/[^\s,]+/g) || [];
}

// selector 選択（id 群）と手入力（文字列）から最終パッケージ配列を構築
export function resolvePackages({ db, selectedIds = [], manual = '', lang = 'en' }) {
  const manualList = splitList(manual);
  const i18nDB = buildI18nMap(lang);
  const norm = normalizeLang(lang);

  // id -> package metadata
  const idx = new Map();
  for (const cat of db.categories || []) {
    for (const p of (cat.packages || [])) idx.set(p.id, p);
  }

  // id -> real name(s)
  const idToName = (id) => {
    const meta = idx.get(id);
    return meta ? [meta.name] : [id];
  };

  // 1) ベース集合（selector + 手入力）
  const base = new Set();
  selectedIds.forEach(id => idToName(id).forEach(n => base.add(n)));
  manualList.forEach(n => {
    if (!n.startsWith('luci-i18n-')) base.add(n);
  });

  // 2) 依存展開
  const addDeps = (id) => {
    const m = idx.get(id);
    (m?.dependencies || []).forEach(did => {
      idToName(did).forEach(n => base.add(n));
    });
  };
  selectedIds.forEach(addDeps);

  // 3) 手入力の i18n を整理（英語は全削除、非英語は他言語を削除）
  const keepManual = manualList.filter(pkg => {
    if (!pkg.startsWith('luci-i18n-')) return true;
    if (!norm) return false;
    const m = pkg.match(/^luci-i18n-(.+?)-([A-Za-z]{2}(?:-[A-Za-z]{2})?)$/);
    const suffix = (m && m[2]) ? m[2].toLowerCase() : '';
    return suffix === norm;
  });

  // 4) i18n 付与: 現言語のみ。対応するベースが存在するものだけ。
  const keys = new Set();
  // selectedIds の luci-app-* / key 推出
  selectedIds.forEach(id => {
    const m = idx.get(id);
    const names = m ? [m.name] : [id];
    names.forEach(n => {
      const mm = n.match(/^luci-app-(.+)$/);
      keys.add(mm ? mm[1] : n);
    });
  });
  // manual からも
  keepManual.forEach(n => {
    if (n.startsWith('luci-i18n-')) return;
    const mm = n.match(/^luci-app-(.+)$/);
    keys.add(mm ? mm[1] : n);
  });

  const i18nAdd = [];
  if (norm) {
    ['base','opkg','firewall'].forEach(k => (i18nDB[k] || []).forEach(x => i18nAdd.push(x)));
    keys.forEach(k => (i18nDB[k] || []).forEach(x => i18nAdd.push(x)));
  }

  // 5) Auto 追加（ネットワーク用の最小セットは外部で付与）
  const result = Array.from(new Set([ ...base, ...keepManual.filter(p=>!p.startsWith('luci-i18n-')), ...i18nAdd ]));
  return result;
}

// 接続方式に応じて map/ds-lite を付与（その他は手動入力優先）
export function addNetworkPackages({ packages = [], auto = false, apiInfo = null, connectionType = 'dhcp' }) {
  const set = new Set(packages.filter(Boolean));
  if (auto) {
    const rule = apiInfo?.rule;
    if (rule?.aftrType || rule?.aftrIpv6Address) set.add('ds-lite');
    else if (rule?.brIpv6Address) set.add('map');
  } else {
    if (connectionType === 'mape') set.add('map');
    if (connectionType === 'dslite') set.add('ds-lite');
  }
  return Array.from(set);
}
