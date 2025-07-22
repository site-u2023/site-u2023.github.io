// テーマ切替（auto / light / dark）
;(function(){
  const html    = document.documentElement;
  const buttons = document.querySelectorAll('.theme-selector button');
  const stored  = localStorage.getItem('site-u-theme') || 'auto';

  function applyTheme(pref) {
    const theme = pref === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : pref;
    html.setAttribute('data-theme', theme);
    buttons.forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.themePreference === pref);
    });
    localStorage.setItem('site-u-theme', pref);
    updateAll(); // テーマ変更に伴い再描画
  }

  buttons.forEach(btn =>
    btn.addEventListener('click', () =>
      applyTheme(btn.dataset.themePreference)
    )
  );

  applyTheme(stored);
})();

// 年表示
document.getElementById('current-year').textContent = new Date().getFullYear();

// 全角 → 半角変換ユーティリティ
function toHalfWidth(str) {
  return str.replace(/[\uFF01-\uFF5E]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  ).replace(/\u3000/g, ' ');
}

// IP更新＋QR描画＋リンク反映
function updateAll() {
  const input = document.getElementById('global-ip-input');
  const ip    = input.value.trim() || input.placeholder;

  const style      = getComputedStyle(document.body);
  const darkColor  = style.getPropertyValue('--qr-dark').trim();
  const lightColor = style.getPropertyValue('--qr-light').trim();

  // QRコード（メイン）
  const qrMain = document.getElementById('qrcode-main');
  if (qrMain) {
    QRCode.toCanvas(qrMain, `http://${ip}`, {
      color: { dark: darkColor, light: lightColor }
    });
  }

  // QRコード（詳細）
  const qrDetail = document.getElementById('qrcode-detail');
  if (qrDetail) {
    QRCode.toCanvas(qrDetail, `ssh://root@${ip}`, {
      color: { dark: darkColor, light: lightColor }
    });
  }

  // IPベースのリンクを更新
  document.querySelectorAll('.link-ip').forEach(link => {
    const template = link.dataset.ipTemplate;
    if (template && template.includes('${ip}')) {
      const url = template.replace('${ip}', ip);
      link.href = url;
      link.textContent = url;
    }
  });

  // SSHリンク内の表示IP
  const sshText = document.getElementById('ssh-ip');
  if (sshText) sshText.textContent = ip;
}

// 入力欄全体に半角変換適用＋updateAll連動
document.querySelectorAll('input[type="text"]').forEach(input => {
  input.addEventListener('input', () => {
    const caret     = input.selectionStart;
    const converted = toHalfWidth(input.value);
    if (input.value !== converted) {
      input.value = converted;
      input.setSelectionRange(caret, caret); // カーソル保持
    }
    updateAll(); // 即時反映
  });
});

// イベント
document.getElementById('global-ip-update')?.addEventListener('click', updateAll);
document.getElementById('global-ip-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') updateAll();
});

// 初期描画
updateAll();
