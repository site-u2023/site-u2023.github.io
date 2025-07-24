// ── 言語切替機能追加 ──
const langData = {
  en: {
    deviceIP: 'Device IP Address',
    terminal: 'Terminal for Windows',
    update: 'Update',
    sshHandler: 'Register Protocol handler (first-time use: download and double-click)',
    sshConnection: 'SSH Connection (root@<span id="ssh-ip">192.168.1.1</span>)',
    aiosExecution: 'Execute aios (root@<span id="aios-ip">192.168.1.1</span>)',
    console: 'Console',
    luciAdmin: 'LuCI (Admin Interface)',
    ttydTerminal: 'ttyd (Web Terminal)',
    githubRepo: 'GitHub Repository',
    aiosScript: 'all in one script',
    configSoftware: 'config-software (legacy)'
  },
  ja: {
    deviceIP: 'デバイスIPアドレス',
    terminal: 'ターミナル (Windows用)',
    update: '更新',
    sshHandler: 'プロトコルハンドラー登録 ※初回のみ、ダウンロード後ダブルクリック',
    sshConnection: 'SSH接続 (root@<span id="ssh-ip">192.168.1.1</span>)',
    aiosExecution: 'aios実行 (root@<span id="aios-ip">192.168.1.1</span>)',
    console: 'コンソール',
    luciAdmin: 'LuCI (管理画面)',
    ttydTerminal: 'ttyd (Webターミナル)',
    githubRepo: 'GitHubリポジトリ',
    aiosScript: 'オールインワンスクリプト',
    configSoftware: 'コンフォグソフトウェア (旧版)'
  }
};

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
    const stored  = localStorage.getItem('site-u-theme') || 'auto'; // localStorageのキー名を統一
    const logoElement = document.getElementById('site-logo'); // ロゴ要素を取得

    function applyTheme(pref) {
      const mode = pref === 'auto'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : pref;
      
      html.setAttribute('data-theme', mode);
      
      // ロゴの切り替えロジックを追加
      if (logoElement) {
          if (mode === 'dark') {
              logoElement.src = 'img/openwrt_text_white_and_blue.svg'; // ダークテーマ用のロゴ
          } else {
              logoElement.src = 'img/openwrt_text_blue_and_dark_blue.svg'; // ライトテーマ用のロゴ
          }
      }

      btns.forEach(b => b.classList.toggle('selected', b.dataset.themePreference === pref));
      localStorage.setItem('site-u-theme', pref); // localStorageのキー名を統一
      updateAll(); // テーマ変更時にも全リンクを更新
    }

    btns.forEach(b => b.addEventListener('click', () => applyTheme(b.dataset.themePreference)));
    window.matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => {
        if ((localStorage.getItem('site-u-theme')||'auto') === 'auto') applyTheme('auto'); // localStorageのキー名を統一
      });
    applyTheme(stored); // 初期テーマ適用
  })();

  // 年表示
  const yearEl = document.getElementById('current-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // 全角→半角変換
  function toHalfWidth(str) {
    return str
      .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/\u3000/g, ' '); // 全角スペースを半角スペースに
  }

  // QRコード描画
  function drawQRCode(elementId, text) {
    const qrContainer = document.getElementById(elementId);
    if (!qrContainer || !window.QRCode) return; // QRCodeライブラリがあるか確認
    qrContainer.innerHTML = '';
    const canvas = document.createElement('canvas');
    qrContainer.appendChild(canvas);

    const style = getComputedStyle(document.body);
    const darkColor = style.getPropertyValue('--qr-dark').trim();
    const lightColor = style.getPropertyValue('--qr-light').trim();

    QRCode.toCanvas(canvas, text, {
      color: { dark: darkColor, light: lightColor }
    }).catch(() => {});
  }

  // 全リンク更新処理
  function updateAll() {
    const input = document.getElementById('global-ip-input');
    if (!input) return;

    const ip = toHalfWidth(input.value.trim()) || input.placeholder; // 全角→半角変換を追加
    localStorage.setItem('site-u-ip', ip); // localStorageのキー名を統一

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
      const v = toHalfWidth(inp.value);
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

  // 言語切替機能
  const langButtons = document.querySelectorAll('.language-selector button');
  const currentLang = localStorage.getItem('lang-preference') || 'ja'; // デフォルトは日本語

  applyLanguage(currentLang);

  langButtons.forEach(button => {
    button.addEventListener('click', () => {
      const newLang = button.dataset.lang;
      localStorage.setItem('lang-preference', newLang);
      applyLanguage(newLang);
    });
  });

  function applyLanguage(lang) {
    // Update active button visual
    langButtons.forEach(button => {
      if (button.dataset.lang === lang) {
        button.classList.add('selected');
      } else {
        button.classList.remove('selected');
      }
    });

    // Apply translations
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      if (langData[lang] && langData[lang][key]) {
        // preserve existing span for IP address in SSH/AIOS links
        if (key === 'sshConnection' || key === 'aiosExecution') {
          const ipSpanId = key === 'sshConnection' ? 'ssh-ip' : 'aios-ip';
          element.innerHTML = langData[lang][key].replace(/<span id="(ssh|aios)-ip">.*?<\/span>/, `<span id="${ipSpanId}">${document.getElementById(ipSpanId).textContent}</span>`);
        } else {
          element.textContent = langData[lang][key];
        }
      }
    });
  }
  
  // 初回描画 (IPアドレスの永続化とリンク更新)
  // localStorageからIPアドレスを読み込み、入力フィールドに設定
  const storedIp = localStorage.getItem('site-u-ip') || document.getElementById('global-ip-input').placeholder;
  document.getElementById('global-ip-input').value = storedIp;
  updateAll(); // IPアドレスで全てのリンクを更新
});
