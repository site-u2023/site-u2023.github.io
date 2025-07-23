document.addEventListener('DOMContentLoaded', () => {
  // ── SSHコマンド列を自由に編集できる変数 ──
  const sshCommands = [
    'wget -O /usr/bin/aios https://raw.githubusercontent.com/site-u2023/aios/main/aios',
    'chmod +x /usr/bin/aios',
    'sh /usr/bin/aios'
  ].join(' && ');
  const sshCmdEncoded = encodeURIComponent(sshCommands);

  // ── テーマ切替（auto/light/dark） ──
  ;(function(){
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

  // ── 年表示 ──
  const yearEl = document.getElementById('current-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ── 全角→半角変換 ──
  function toHalfWidth(s) {
    return s
      .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/\u3000/g, ' ');
  }

  // ── QRコード描画ヘルパー ──
  function drawQRCode(id, txt) {
    const el = document.getElementById(id);
    if (!el || !window.QRCode) return;
    el.innerHTML = '';
    const canvas = document.createElement('canvas');
    el.appendChild(canvas);
    const style      = getComputedStyle(document.body);
    const darkColor  = style.getPropertyValue('--qr-dark').trim();
    const lightColor = style.getPropertyValue('--qr-light').trim();
    QRCode.toCanvas(canvas, txt, { color: { dark: darkColor, light: lightColor } })
      .catch(console.error);
  }

  // ── 全リンク更新処理 ──
  function updateAll() {
    const inEl = document.getElementById('global-ip-input');
    if (!inEl) return;
    const ip = inEl.value.trim() || inEl.placeholder;

    // QRコード再描画
    const det = document.getElementById('qrcode-detail-container');
    if (det) {
      if (det.open) drawQRCode('qrcode-detail', `ssh://root@${ip}`);
      if (!det.dataset.toggleListenerAdded) {
        det.addEventListener('toggle', function(){
          this.open
            ? drawQRCode('qrcode-detail', `ssh://root@${ip}`)
            : (document.getElementById('qrcode-detail').innerHTML = '');
        });
        det.dataset.toggleListenerAdded = 'true';
      }
    }

    // ── SSHリンクだけ href 更新 ──
    // HTML側で data-ip-template="sshcmd://root@${ip}/${cmd}" としてください
    const sshLink = document.getElementById('ssh-link');
    if (sshLink) {
      // ① 必ず getAttribute で「生のテンプレート」を取得
      const tpl = sshLink.getAttribute('data-ip-template');
      // ② ${ip}→IP, ${cmd}→URLエンコード済コマンド　を全置換
      const url = tpl
        .replace(/\$\{ip\}/g,  ip)
        .replace(/\$\{cmd\}/g, sshCmdEncoded);
      sshLink.href = url;
      // 表示用スパン内のIPも更新
      const span = sshLink.querySelector('#ssh-ip');
      if (span) span.textContent = ip;
    }

    // ── その他の .link-ip は href のみ更新 ──
    document.querySelectorAll('.link-ip').forEach(link => {
      if (link.id === 'ssh-link') return;
      const tpl = link.getAttribute('data-ip-template');
      if (!tpl) return;
      link.href = tpl.replace(/\$\{ip\}/g, ip);
    });
  }

  // ── テキスト入力全角→半角＋updateAll ──
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

  // ── 更新ボタンとEnterで updateAll ──
  document.getElementById('global-ip-update')
    .addEventListener('click', updateAll);
  document.getElementById('global-ip-input')
    .addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        updateAll();
      }
    });

  // ── 初回描画 ──
  updateAll();
});
