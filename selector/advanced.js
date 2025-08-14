// advanced.js — ASU inputs controller (loaded on <details id="asu"> toggle)

(function main() {
  const asu = document.getElementById('asu');
  if (!asu) return;

  const taPkgs = document.getElementById('asu-packages');
  const taUci  = document.getElementById('uci-defaults-content');
  const tplBtn = document.getElementById('uci-defaults-template');

  // 1) 初期値（index.js 側で data に供給）を必要時のみ適用
  if (taPkgs && (!taPkgs.value || taPkgs.value.trim() === '')) {
    const pkgs = asu.dataset.pkgs || '';
    taPkgs.value = pkgs;
  }

  // 2) テンプレートアイコンのバインド（index.js から移管）
  if (tplBtn && taUci) {
    const link = tplBtn.getAttribute('data-link');
    tplBtn.onclick = function () {
      fetch(link)
        .then((obj) => {
          if (obj.status != 200) {
            throw new Error(`Failed to fetch ${obj.url}`);
          }
          return obj.text();
        })
        .then((text) => {
          // toggle text
          if (taUci.value.indexOf(text) != -1) {
            taUci.value = taUci.value.replace(text, '');
          } else {
            taUci.value = taUci.value + text;
          }
        })
        .catch((err) => {
          // index.js の showAlert を使わず、控えめに console に退避
          console.error(err.message);
        });
    };
  }

  // 3) 以降は必要に応じて、追加の独自イベント/検証をここにだけ実装する
})();
