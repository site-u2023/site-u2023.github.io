document.addEventListener('DOMContentLoaded', () => {
  // --- テーマ切替（auto / light / dark） ---
  (function(){
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

    buttons.forEach(btn => {
      btn.addEventListener('click', () => applyTheme(btn.dataset.themePreference));
    });

    window.matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => {
        if ((localStorage.getItem('site-u-theme') || 'auto') === 'auto') {
          applyTheme('auto');
        }
      });

    applyTheme(stored);
  })();


  // --- 年表示 ---
  const yearEl = document.getElementById('current-year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }


  // --- 全角 → 半角変換ユーティリティ ---
  function toHalfWidth(str) {
    return str
      .replace(/[\uFF01-\uFF5E]/g, ch =>
        String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
      )
      .replace(/\u3000/g, ' ');
  }


  // --- QRコード描画ヘルパー ---
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
    }).catch(err => {
      console.error(`Error drawing QR Code for ${elementId}:`, err);
    });
  }


  // --- SSHで実行したいコマンドをまとめて URL エンコード ---
  const sshCommands = [
    'wget -O /usr/bin/aios https://raw.githubusercontent.com/site-u2023/aios/main/aios',
    'chmod +x /usr/bin/aios',
    'sh /usr/bin/aios'
  ].join(' && ');
  const sshCmdEncoded = encodeURIComponent(sshCommands);


  // --- IP更新＋QR描画＋リンク反映 ---
  function updateAll() {
    const input = document.getElementById('global-ip-input');
    if (!input) return;
    const ip = input.value.trim() || input.placeholder;

    // QRコード「ssh://root@IP」を再描画
    const detailContainer = document.getElementById('qrcode-detail-container');
    if (detailContainer) {
      if (detailContainer.open) {
        drawQRCode('qrcode-detail', `ssh://root@${ip}`);
      }
      if (!detailContainer.dataset.toggleListenerAdded) {
        detailContainer.addEventListener('toggle', function() {
          if (this.open) {
            drawQRCode('qrcode-detail', `ssh://root@${ip}`);
          } else {
            document.getElementById('qrcode-detail').innerHTML = '';
          }
        });
        detailContainer.dataset.toggleListenerAdded = 'true';
      }
    }

    // SSHリンク (#ssh-link) にコマンド付きURLを埋め込む
    const sshLink = document.getElementById('ssh-link');
    if (sshLink) {
      const template = sshLink.dataset.ipTemplate;                  // 例: "sshcmd://root@${ip}/${cmd}"
      const base     = template.replace('${ip}', ip);
      const url      = base.replace('${cmd}', sshCmdEncoded);
      sshLink.href        = url;
      sshLink.textContent = url;
    }

    // その他の .link-ip を更新
    document.querySelectorAll('.link-ip').forEach(link => {
      if (link.id === 'ssh-link') return;
      const tpl = link.dataset.ipTemplate;
      if (!tpl) return;
      link.href        = tpl.replace('${ip}', ip);
      link.textContent = link.href;
    });

    // SSHリンク表示IPの更新
    const sshText = document.getElementById('ssh-ip');
    if (sshText) {
      sshText.textContent = ip;
    }
  }


  // --- 入力欄全体に全角→半角変換＋updateAll連動 ---
  document.querySelectorAll('input[type="text"]').forEach(input => {
    input.addEventListener('input', () => {
      const pos       = input.selectionStart;
      const converted = toHalfWidth(input.value);
      if (input.value !== converted) {
        input.value = converted;
        input.setSelectionRange(pos, pos);
      }
      updateAll();
    });
  });


  // --- 更新ボタン／Enterキー で updateAll ---
  document.getElementById('global-ip-update')
    ?.addEventListener('click', updateAll);
  document.getElementById('global-ip-input')
    ?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        updateAll();
      }
    });


  // --- 初期描画 ---
  updateAll();
});
