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
  },
  zh: {
    deviceIP: '设备IP地址',
    terminal: '终端',
    update: '更新',
    sshHandler: '注册SSH协议处理程序 (Windows专用, 首次使用: 下载并双击)',
    sshConnection: 'SSH连接 (root@<span id="ssh-ip">192.168.1.1</span>)',
    aiosExecution: '执行aios (root@<span id="aios-ip">192.168.1.1</span>)',
    console: '控制台',
    luciAdmin: 'LuCI (管理界面)',
    ttydTerminal: 'ttyd (Web终端)',
    githubRepo: 'GitHub仓库',
    aiosScript: '一体化脚本',
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
  updateLinks(savedIp);

  // ★IPアドレスの変更を即時反映するためのイベントリスナーを追加
  globalIpInput.addEventListener('input', () => {
    // 全角文字を半角に変換（正規化）
    const normalizedIp = normalizeInput(globalIpInput.value);
    globalIpInput.value = normalizedIp; // 入力フィールドの表示も更新
    updateLinks(normalizedIp); // リンクも即時更新
  });

  globalIpUpdate.addEventListener('click', () => {
    const newIp = globalIpInput.value;
    localStorage.setItem('globalIp', newIp);
    updateLinks(newIp);
  });

  // ★全角文字を半角に変換する関数
  function normalizeInput(str) {
    return str.replace(/[Ａ-Ｚａ-ｚ０-９．]/g, function(s) {
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
