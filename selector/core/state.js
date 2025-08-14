// selector/core/state.js
// 単一状態源。subscribe/patch で UI・テンプレ・API を同期。

const listeners = new Set();

export const state = {
  versions: [],
  versionCode: '',
  devices: [],
  selectedVersion: '',
  selectedDevice: null,      // { id, target, titles, ... }
  apiInfo: null,             // auto-config 応答キャッシュ
  mapSh: { new: null, v19: null },
  templateLoaded: false
};

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function patch(p) {
  let changed = false;
  for (const k of Object.keys(p)) {
    if (state[k] !== p[k]) {
      state[k] = p[k];
      changed = true;
    }
  }
  if (changed) listeners.forEach(fn => fn(state));
}

export function resetSelection() {
  patch({ selectedDevice: null });
}
