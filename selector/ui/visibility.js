// selector/ui/visibility.js
// UI セクションの表示制御

import { guaFromApi } from '../network/net.wan.js';

export function updateGuaSectionVisibility({ doc = document, mode, type, mapeType, apiInfo }) {
  const guaSection = doc.getElementById('mape-gua-section');
  if (!guaSection) return;
  let show = false;

  if (mode === 'auto') {
    if (apiInfo?.ipv6) show = true;
    if (show) {
      const el = doc.getElementById('mape-gua-prefix');
      if (el && !el.value) {
        const p = guaFromApi(apiInfo);
        if (p) el.value = p;
      }
    }
  } else if (mode === 'manual' && type === 'mape') {
    if (mapeType === 'auto') {
      if (apiInfo?.ipv6) {
        show = true;
        const el = doc.getElementById('mape-gua-prefix');
        if (el && !el.value) {
          const p = guaFromApi(apiInfo);
          if (p) el.value = p;
        }
      }
    } else if (mapeType === 'gua') {
      show = true;
      const el = doc.getElementById('mape-gua-prefix');
      if (el && !el.value && apiInfo?.ipv6) {
        const p = guaFromApi(apiInfo);
        if (p) el.value = p;
      }
    }
  }

  guaSection.style.display = show ? 'block' : 'none';
}
