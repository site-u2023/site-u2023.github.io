// ── グローバル定数（再定義不要なもの）──
const SSH_COMMANDS_AIOS = [
    'wget -O /usr/bin/aios https://raw.githubusercontent.com/site-u2023/aios/main/aios',
    'chmod +x /usr/bin/aios',
    'sh /usr/bin/aios'
].join(' && ');
const SSH_CMD_ENCODED_AIOS = encodeURIComponent(SSH_COMMANDS_AIOS);

// ── 言語切替機能データ ──
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

// ── toHalfWidth 関数 ──
function toHalfWidth(str) {
    return str
        .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
        .replace(/\u3000/g, ' ');
}

// ── drawQRCode 関数 ──
function drawQRCode(elementId, text) {
    const qrContainer = document.getElementById(elementId);
    if (!qrContainer || typeof QRious === 'undefined') {
        console.error(`QR code container #${elementId} not found or QRious library not loaded.`);
        return;
    }
    qrContainer.innerHTML = '';
    const canvas = document.createElement('canvas');
    qrContainer.appendChild(canvas);

    const style = getComputedStyle(document.body);
    const darkColor = style.getPropertyValue('--qr-dark')?.trim() || '#111';
    const lightColor = style.getPropertyValue('--qr-light')?.trim() || '#fff';

    new QRious({
        element: canvas,
        value: text,
        size: 180,
        foreground: darkColor,
        background: lightColor
    });
}

// ── 全リンク更新処理 ──
function updateAll() {
    const input = document.getElementById('global-ip-input');
    if (!input) return;

    const ip = toHalfWidth(input.value.trim()) || input.placeholder;
    localStorage.setItem('site-u-ip', ip);

    const sshIpSpan = document.getElementById('ssh-ip');
    const aiosIpSpan = document.getElementById('aios-ip');
    if (sshIpSpan) sshIpSpan.textContent = ip;
    if (aiosIpSpan) aiosIpSpan.textContent = ip;

    document.querySelectorAll('.link-ip').forEach(link => {
        const template = link.dataset.ipTemplate;
        if (template) {
            let newHref = template.replace(/\${ip}/g, ip);
            if (link.id === 'aios-link')
                newHref = newHref.replace(/\${cmd}/g, SSH_CMD_ENCODED_AIOS);
            link.href = newHref;
        }
    });

    const qrDetailContainer = document.getElementById('qrcode-detail-container');
    if (qrDetailContainer && qrDetailContainer.open) {
        drawQRCode('qrcode-detail', `ssh://root@${ip}`);
    } else if (qrDetailContainer) {
        const qrCanvasContainer = document.getElementById('qrcode-detail');
        if (qrCanvasContainer) qrCanvasContainer.innerHTML = '';
    }
}

// ── 言語適用関数 ──
function applyLanguage(lang) {
    const langButtons = document.querySelectorAll('.language-selector button');
    langButtons.forEach(button => {
        button.classList.toggle('selected', button.dataset.lang === lang);
    });
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (langData[lang] && langData[lang][key]) {
            if (key === 'sshConnection' || key === 'aiosExecution') {
                const ipSpanId = key === 'sshConnection' ? 'ssh-ip' : 'aios-ip';
                const currentIpText = document.getElementById(ipSpanId)?.textContent || '';
                element.innerHTML = langData[lang][key].replace(/<span id="(ssh|aios)-ip">.*?<\/span>/, `<span id="${ipSpanId}">${currentIpText}</span>`);
            } else {
                element.textContent = langData[lang][key];
            }
        }
    });
}

// ── ロゴ表示切替（2画像方式） ──
function updateLogoDisplay() {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    const logoLight = document.getElementById('site-logo-light');
    const logoDark = document.getElementById('site-logo-dark');
    if (logoLight && logoDark) {
        logoLight.style.display = theme === 'light' ? 'block' : 'none';
        logoDark.style.display = theme === 'dark' ? 'block' : 'none';
    }
}

// ── DOMContentLoaded ──
document.addEventListener('DOMContentLoaded', () => {
    // ── テーマ切替（auto/light/dark）──
    (function(){
        const html = document.documentElement;
        const btns = document.querySelectorAll('.theme-selector button');
        const stored = localStorage.getItem('site-u-theme') || 'auto';
        function applyTheme(pref) {
            const mode = pref === 'auto'
                ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                : pref;
            html.setAttribute('data-theme', mode);
            btns.forEach(b => b.classList.toggle('selected', b.dataset.themePreference === pref));
            localStorage.setItem('site-u-theme', pref);
            updateLogoDisplay();
            updateAll();
        }
        if (btns.length > 0) {
            btns.forEach(b => b.addEventListener('click', () => applyTheme(b.dataset.themePreference)));
            window.matchMedia('(prefers-color-scheme: dark)')
                .addEventListener('change', () => {
                    if ((localStorage.getItem('site-u-theme')||'auto') === 'auto') applyTheme('auto');
                });
            applyTheme(stored);
        } else {
            applyTheme(stored);
        }
        // ロゴ表示の初期化＋テーマ変更監視
        updateLogoDisplay();
        const observer = new MutationObserver(updateLogoDisplay);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    })();

    // 年表示
    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // ── IPアドレス関連初期化 ──
    const globalIpInput = document.getElementById('global-ip-input');
    const globalIpUpdateBtn = document.getElementById('global-ip-update');
    if (globalIpInput) {
        const storedIp = localStorage.getItem('site-u-ip');
        globalIpInput.value = storedIp || globalIpInput.placeholder || '192.168.1.1';
        globalIpInput.addEventListener('input', () => {
            const pos = globalIpInput.selectionStart;
            const v = toHalfWidth(globalIpInput.value);
            if (v !== globalIpInput.value) {
                globalIpInput.value = v;
                globalIpInput.setSelectionRange(pos, pos);
            }
            updateAll();
        });
        globalIpInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                updateAll();
            }
        });
    }
    if (globalIpUpdateBtn) {
        globalIpUpdateBtn.addEventListener('click', updateAll);
    }

    // ── QRコードdetails要素イベントリスナー ──
    const qrDetailContainer = document.getElementById('qrcode-detail-container');
    if (qrDetailContainer && !qrDetailContainer.dataset.toggleListenerAdded) {
        qrDetailContainer.addEventListener('toggle', function() {
            const input = document.getElementById('global-ip-input');
            const currentIpForQr = input ? (toHalfWidth(input.value.trim()) || input.placeholder) : '192.168.1.1';
            if (this.open) {
                drawQRCode('qrcode-detail', `ssh://root@${currentIpForQr}`);
            } else {
                const qrCanvasContainer = document.getElementById('qrcode-detail');
                if (qrCanvasContainer) qrCanvasContainer.innerHTML = '';
            }
        });
        qrDetailContainer.dataset.toggleListenerAdded = 'true';
    }

    // ── 言語切替機能 ──
    const langButtons = document.querySelectorAll('.language-selector button');
    const currentLang = localStorage.getItem('lang-preference') || 'ja';
    if (langButtons.length > 0) {
        langButtons.forEach(button => {
            button.addEventListener('click', () => {
                const newLang = button.dataset.lang;
                localStorage.setItem('lang-preference', newLang);
                applyLanguage(newLang);
            });
        });
    }
    applyLanguage(currentLang);

    // ページロード時の初期更新
    if (globalIpInput) {
        updateAll();
    }
});
