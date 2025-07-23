document.addEventListener('DOMContentLoaded', () => {
  // ── SSHコマンド列（aios用）──
  const sshCommands = [
    'wget -O /usr/bin/aios https://raw.githubusercontent.com/site-u2023/aios/main/aios',
    'chmod +x /usr/bin/aios',
    'sh /usr/bin/aios'
  ].join(' && ');
  const sshCmdEncoded = encodeURIComponent(sshCommands);

  // ── テーマ切替（auto/light/dark）──
  (function(){
    const html    = document.documentElement;
    const btns    = document.querySelectorAll('.theme-selector button');
    const stored  = localStorage.getItem('site-u-theme') || 'auto';
    function applyTheme(pref) {
      const mode = pref === 'auto'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : pref;
      html.setAttribute('data-theme', mode);
      btns.forEach(b => b.classList.toggle('selected', b.dataset.themePreference === pref));
      localStorage.setItem('site-u-theme', pref);
      updateAll();
    }
    btns.forEach(b => b.addEventListener('click', () => applyTheme(b.dataset.themePreference)));
    window.matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => {
        if ((localStorage.getItem('site-u-theme')||'auto') === 'auto') applyTheme('auto');
      });
    applyTheme(stored);
  })();

  // 年表示
  const yearEl = document.getElementById('current-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // 全角→半角変換
  function toHalfWidth(str) {
    return str
      .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/\u3000/g, ' ');
  }

  // QRコード描画
  function drawQRCode(elementId, text) {
    const qrContainer = document.getElementById(elementId);
    if (!qrContainer || !window.QRCode) return;
    qrContainer.innerHTML = '';
    const canvas = document.createElement('canvas');
    qrContainer.appendChild(canvas);

    const style      = getComputedStyle(document.body);
    const darkColor  = style.getPropertyValue('--qr-dark').trim();
    const lightColor = style.getPropertyValue('--qr-light').trim();

    QRCode.toCanvas(canvas, text, {
      color: { dark: darkColor, light: lightColor }
    }).catch(() => {});
  }

  // 全リンク更新処理
  function updateAll() {
    const input = document.getElementById('global-ip-input');
    if (!input) return;
    const ip = input.value.trim() || input.placeholder;

    // QRコード（details開閉時も再描画）
    const detailContainer = document.getElementById('qrcode-detail-container');
    if (detailContainer) {
      if (detailContainer.open) drawQRCode('qrcode-detail', `ssh://root@${ip}`);
      if (!detailContainer.dataset.toggleListenerAdded) {
        detailContainer.addEventListener('toggle', function() {
          if (this.open) {
            drawQRCode('qrcode-detail', `ssh://root@${ip}`);
          } else {
            const qrDetail = document.getElementById('qrcode-detail');
            if (qrDetail) qrDetail.innerHTML = '';
          }
        });
        detailContainer.dataset.toggleListenerAdded = 'true';
      }
    }

    // SSH接続リンク
    const sshLink = document.getElementById('ssh-link');
    if (sshLink) {
      const tpl = sshLink.getAttribute('data-ip-template');
      const url = tpl.replace(/\$\{ip\}/g, ip);
      sshLink.href = url;
      const span = sshLink.querySelector('#ssh-ip');
      if (span) span.textContent = ip;
    }

    // aios実行リンク
    const aiosLink = document.getElementById('aios-link');
    if (aiosLink) {
      const tpl = aiosLink.getAttribute('data-ip-template');
      const url = tpl
        .replace(/\$\{ip\}/g, ip)
        .replace(/\$\{cmd\}/g, sshCmdEncoded);
      aiosLink.href = url;
      const span = aiosLink.querySelector('#aios-ip');
      if (span) span.textContent = ip;
    }

    // その他 .link-ip のhref更新（上記2つを除く）
    document.querySelectorAll('.link-ip').forEach(link => {
      if (link.id === 'ssh-link' || link.id === 'aios-link') return;
      const tpl = link.getAttribute('data-ip-template');
      if (!tpl) return;
      link.href = tpl.replace(/\$\{ip\}/g, ip);
    });
  }

  // 入力欄全角→半角＋updateAll
  document.querySelectorAll('input[type="text"]').forEach(inp => {
    inp.addEventListener('input', () => {
      const pos = inp.selectionStart;
      const v   = toHalfWidth(inp.value);
      if (v !== inp.value) {
        inp.value = v;
        inp.setSelectionRange(pos, pos);
      }
      updateAll();
    });
  });

  // 更新ボタン・Enterキーで updateAll
  document.getElementById('global-ip-update')?.addEventListener('click', updateAll);
  document.getElementById('global-ip-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      updateAll();
    }
  });

  // ── ここから追加（指示箇所）──
  // ローカルIPから推測し自動で初期値セット（常にセット）
  const inputEl = document.getElementById('global-ip-input');
  if (inputEl && !inputEl.value) {
    inputEl.value = inputEl.placeholder;
    updateAll();
  }   
    });
  }
  // ── ここまで追加 ──

  // 初回描画
  updateAll();
});
