// selector/core/template.js
// setup.sh テンプレのロードとパッチ、map.sh の埋め込み

import { getState, patch } from './state.js';

const TEMPLATE_PATH = 'selector/uci-defaults/setup.sh';
const MAP_NEW_URL = 'https://site-u.pages.dev/build/scripts/map.sh.new';
const MAP_19_URL  = 'https://site-u.pages.dev/build/scripts/map.sh.19';

export async function loadTemplate() {
  const r = await fetch(TEMPLATE_PATH, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`loadTemplate: HTTP ${r.status}`);
  return await r.text();
}

export async function preloadMapScripts() {
  const s = getState();
  if (!s.mapSh.new) {
    try {
      const r = await fetch(MAP_NEW_URL);
      if (r.ok) s.mapSh.new = await r.text();
    } catch {}
  }
  if (!s.mapSh.v19) {
    try {
      const r = await fetch(MAP_19_URL);
      if (r.ok) s.mapSh.v19 = await r.text();
    } catch {}
  }
  patch({ mapSh: s.mapSh });
}

export function setScriptVar(content, key, value, active) {
  const safe = (v) => (v === undefined || v === null) ? '' : String(v).trim();
  const val = safe(value);
  const re = new RegExp(`^#?\\s*${key}=".*"$`, 'm');
  const line = active ? `${key}="${val}"` : `# ${key}="${val}"`;
  return content.replace(re, line);
}

export function embedMapSh(content) {
  if (!content.includes('${map_sh_content}')) return content;
  const { selectedVersion, mapSh } = getState();
  const v19 = selectedVersion?.startsWith('19');
  let body = v19 ? (mapSh.v19 || '') : (mapSh.new || '');
  if (!body) {
    body = `#!/bin/sh
# MAP-E script not embedded. Fallback placeholder.
echo "ERROR: map.sh missing" >&2
exit 1`;
  }
  return content.replace('${map_sh_content}', body);
}
