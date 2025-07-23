// ── 言語切替機能追加 ──
const langData = {
  en: {
    deviceIP: 'Device IP Address',
    terminal: 'Terminal',
    update: 'Update',
    sshHandler: 'Register Protocol handler for Windows (first-time use: download and double-click)',
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
    terminal: 'ターミナル',
    update: '更新',
    sshHandler: 'プロトコルハンドラー登録 (Windows用) ※初回のみ、ダウンロード後ダブルクリック',
    sshConnection: 'SSH接続 (root@<span id="ssh-ip">192.168.1.1</span>)',
    aiosExecution: 'aios実行 (root@<span id="aios-ip">192.168.1.1</span>)',
    console: 'コンソール',
    luciAdmin: 'LuCI (管理画面)',
    ttydTerminal: 'ttyd (Webターミナル)',
    githubRepo: 'GitHubリポジトリ',
    aiosScript: 'all in one script',
    configSoftware: 'config-software (旧版)'
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const globalIpInput = document.getElementById('global-ip-input');
  const globalIpUpdate = document.getElementById('global-ip-update');
  const sshLink = document.getElementById('ssh-link');
  const aiosLink = document.getElementById('aios-link');
  const sshIpSpan = document.getElementById('ssh-ip');
  const aiosIpSpan = document.getElementById('aios-ip');
  const luciLink = document.querySelector('a[data-i18n="luciAdmin"]');
  const ttydLink = document.querySelector('a[data-i18n="ttydTerminal"]');

  // Load saved IP or use default
  const savedIp = localStorage.getItem('globalIp') || '192.168.1.1';
  globalIpInput.value = savedIp;
  updateLinks(savedIp); // 初期表示時はリンクも更新

  // IPアドレスの入力変更時: テキストボックスの表示のみを更新（正規化）
  globalIpInput.addEventListener('input', () => {
    const normalizedIp = normalizeInput(globalIpInput.value);
    globalIpInput.value = normalizedIp; // テキストボックスの表示のみを更新
  });

  // IPアドレス入力フィールドからフォーカスが外れた時、またはEnterキーが押された時にリンクを更新
  globalIpInput.addEventListener('blur', () => {
    const newIp = globalIpInput.value;
    localStorage.setItem('globalIp', newIp); // localStorageに保存
    updateLinks(newIp); // リンクを更新
  });

  globalIpInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      globalIpInput.blur(); // Enterキーでblurイベントをトリガー
      event.preventDefault(); // デフォルトのEnter動作（フォーム送信など）を防止
    }
  });

  globalIpUpdate.addEventListener('click', () => {
    const newIp = globalIpInput.value;
    localStorage.setItem('globalIp', newIp);
    updateLinks(newIp); // 「更新」ボタンが押された時もリンクを更新
  });

  // 全角文字を半角に変換する関数
  function normalizeInput(str) {
    return str.replace(/[Ａ-Ｚａ-ｚ０-9．]/g, function(s) { // 全角の英数字とドット
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    }).replace(/。/g, '.'); // 全角の句点も半角ドットに変換
  }

  function updateLinks(ip) {
    // SSH Connection Link
    const sshTemplate = sshLink.getAttribute('data-ip-template');
    sshLink.href = sshTemplate.replace('${ip}', ip);
    sshIpSpan.textContent = ip;

    // AIOS Execution Link
    const aiosTemplate = aiosLink.getAttribute('data-ip-template');
    const aiosCmd = 'aios'; // You can change this if the command varies
    aiosLink.href = aiosTemplate.replace('${ip}', ip).replace('${cmd}', aiosCmd);
    aiosIpSpan.textContent = ip;

    // LuCI Admin Link
    const luciTemplate = luciLink.getAttribute('data-ip-template');
    luciLink.href = luciTemplate.replace('${ip}', ip);

    // ttyd Terminal Link
    const ttydTemplate = ttydLink.getAttribute('data-ip-template');
    ttydLink.href = ttydTemplate.replace('${ip}', ip);
  }

  // --- Theme Switching ---
  const themeButtons = document.querySelectorAll('.theme-selector button');
  const htmlElement = document.documentElement;

  // Load saved theme preference
  let savedTheme = localStorage.getItem('theme-preference');
  if (!savedTheme) {
      // If no preference, set based on system
      savedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      localStorage.setItem('theme-preference', savedTheme);
  }

  // Apply saved theme
  applyTheme(savedTheme);

  themeButtons.forEach(button => {
    button.addEventListener('click', () => {
      const themePreference = button.dataset.themePreference;
      localStorage.setItem('theme-preference', themePreference);
      applyTheme(themePreference);
    });
  });

  function applyTheme(preference) {
    let themeToApply = preference;
    if (preference === 'auto') {
      themeToApply = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    htmlElement.setAttribute('data-theme', themeToApply);

    // Update active button visual
    themeButtons.forEach(button => {
      if (button.dataset.themePreference === preference) {
        button.classList.add('selected');
      } else {
        button.classList.remove('selected');
      }
    });
  }

  // Listen for system theme changes if 'auto' is selected
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (localStorage.getItem('theme-preference') === 'auto') {
      applyTheme('auto'); // Re-apply 'auto' to pick up new system preference
    }
  });


  // --- Language Switching ---
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
          const currentIp = document.getElementById(ipSpanId).textContent;
          element.innerHTML = langData[lang][key].replace(/<span id="ssh-ip">.*?<\/span>/, `<span id="${ipSpanId}">${currentIp}</span>`);
        } else {
          element.textContent = langData[lang][key];
        }
      }
    });
  }

  // Set current year for copyright
  document.getElementById('current-year').textContent = new Date().getFullYear();

});
