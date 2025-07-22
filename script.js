// テーマ切替（auto/light/dark）
;(function(){
  const html = document.documentElement;
  const buttons = document.querySelectorAll('.theme-selector button');
  const stored = localStorage.getItem('site-u-theme') || 'auto';

  function applyTheme(pref) {
    let theme = pref === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : pref;
    html.setAttribute('data-theme', theme);
    buttons.forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.themePreference === pref);
    });
    localStorage.setItem('site-u-theme', pref);
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.themePreference));
  });

  applyTheme(stored);
})();

// 年表示
document.getElementById('current-year').textContent = new Date().getFullYear();

// IP更新＋QR描画
function updateAll() {
  const input = document.getElementById('global-ip-input');
  const ip = input.value.trim() || input.placeholder;
  const style = getComputedStyle(document.body);
  const darkColor  = style.getPropertyValue('--qr-dark').trim();
  const lightColor = style.getPropertyValue('--qr-light').trim();
  const target = document.getElementById('qrcode-main');

  target.innerHTML = '';
  QRCode.toCanvas(target, `http://${ip}`, {
    width: 180,
    color: { dark: darkColor, light: lightColor }
  });
}

document.getElementById('global-ip-update')
  .addEventListener('click', updateAll);

document.getElementById('global-ip-input')
  .addEventListener('keydown', e => {
    if (e.key === 'Enter') updateAll();
  });

updateAll();
