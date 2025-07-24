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
        sshHandler: 'Protocol handler registration (first-time use: download and double-click)',
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
        // QRコード表示エリアにテキストを挿入
        if (qrContainer) {
            qrContainer.innerHTML = '<div style="width: 180px; height: 180px; background: var(--text-color); margin: 0 auto; display: flex; align-items: center; justify-content: center; color: var(--block-bg); font-size: 12px;">QRコード表示エリア</div>';
            qrContainer.querySelector('div').setAttribute('data-text', 'QRiousライブラリがロードされていません');
        }
        return;
    }
    qrContainer.innerHTML = '';
    const canvas = document.createElement('canvas');
    qrContainer.appendChild(canvas);

    const style = getComputedStyle(document.body);
    const darkColor = style.getPropertyValue('--qr-dark').trim(); // CSS変数から取得
    const lightColor = style.getPropertyValue('--qr-light').trim(); // CSS変数から取得

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

    // SSH/AIOSリンクのIP表示更新 (index.html内)
    const sshIpSpan = document.getElementById('ssh-ip');
    const aiosIpSpan = document.getElementById('aios-ip');
    if (sshIpSpan) sshIpSpan.textContent = ip;
    if (aiosIpSpan) aiosIpSpan.textContent = ip;

    // data-ip-templateを持つすべてのリンクを更新
    document.querySelectorAll('.link-item[data-ip-template]').forEach(link => {
        const template = link.dataset.ipTemplate;
        if (template) {
            let newHref = template.replace(/\${ip}/g, ip);
            if (link.id === 'aios-link')
                newHref = newHref.replace(/\${cmd}/g, SSH_CMD_ENCODED_AIOS);
            link.href = newHref;
        }
    });

    // QRコードの表示/非表示と更新
    const qrDetailContainer = document.getElementById('qrcode-detail-container');
    if (qrDetailContainer && qrDetailContainer.open) {
        drawQRCode('qrcode-detail', `ssh://root@${ip}`);
    } else if (qrDetailContainer) {
        const qrCanvasContainer = document.getElementById('qrcode-detail');
        if (qrCanvasContainer) {
            qrCanvasContainer.innerHTML = '<div style="width: 180px; height: 180px; background: var(--text-color); margin: 0 auto; display: flex; align-items: center; justify-content: center; color: var(--block-bg); font-size: 12px;">QRコード表示エリア</div>';
            const dummyDiv = qrCanvasContainer.querySelector('div');
            if (dummyDiv) {
                dummyDiv.setAttribute('data-text', 'QRiousライブラリがロードされていません');
            }
        }
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
            if (element.classList.contains('section-title') || element.classList.contains('link-text') || element.classList.contains('link-note') || element.id === 'global-ip-update') {
                if (key === 'sshConnection' || key === 'aiosExecution') {
                    const ipSpanId = key === 'sshConnection' ? 'ssh-ip' : 'aios-ip';
                    const currentIpHtml = element.querySelector(`#${ipSpanId}`) ? element.querySelector(`#${ipSpanId}`).outerHTML : '';
                    let newHtml = langData[lang][key];
                    if (currentIpHtml) {
                        newHtml = newHtml.replace(/<span id="(ssh|aios)-ip">.*?<\/span>/, currentIpHtml);
                    }
                    element.innerHTML = newHtml;
                } else if (key === 'sshHandler') {
                    const linkTextSpan = element.querySelector('.link-text');
                    const linkNoteSpan = element.querySelector('.link-note');
                    if (linkTextSpan) {
                         linkTextSpan.textContent = langData[lang][key].split(' ※')[0];
                    }
                    if (linkNoteSpan) {
                         linkNoteSpan.textContent = langData[lang][key].split('※')[1] ? '※' + langData[lang][key].split('※')[1] : '';
                    }
                } else {
                    element.textContent = langData[lang][key];
                }
            } else {
                element.textContent = langData[lang][key];
            }
        }
    });
}

// ── ロゴ表示切替（2画像方式） ──
function updateLogoDisplay() {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    const siteLogo = document.getElementById('site-logo');
    if (siteLogo) {
        if (theme === 'dark') {
            siteLogo.src = 'img/openwrt_text_blue_and_dark_blue.svg'; // Blue
        } else {
            siteLogo.src = 'img/openwrt_text_black_and_white.svg'; // Black
        }
    }
}

// ── ヘッダー読み込み関数を追加 ──
async function loadHeader() {
    try {
        const response = await fetch('header.html'); // header.htmlのパス
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const headerHtml = await response.text();
        const headerElement = document.createElement('div');
        headerElement.innerHTML = headerHtml;

        // bodyの先頭に挿入
        document.body.prepend(headerElement.firstElementChild);

        // ヘッダー読み込み後にロゴ表示を更新
        updateLogoDisplay();

    } catch (error) {
        console.error("Failed to load header.html:", error);
    }
}

// ── フッター読み込み関数 ──
async function loadFooter() {
    try {
        const response = await fetch('footer.html'); // footer.htmlのパス
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const footerHtml = await response.text();
        const footerElement = document.createElement('div');
        footerElement.innerHTML = footerHtml;

        // bodyの最後に挿入
        document.body.appendChild(footerElement.firstElementChild);

        // 年表示を更新（フッター読み込み後に改めて実行）
        const yearEl = document.getElementById('current-year');
        if (yearEl) yearEl.textContent = new Date().getFullYear();

        // フッター内の言語・テーマボタンにイベントリスナーを再設定
        initializeThemeAndLanguageSelectors();

    } catch (error) {
        console.error("Failed to load footer.html:", error);
    }
}

// ── テーマ・言語セレクターの初期化処理を関数化 ──
function initializeThemeAndLanguageSelectors() {
    // テーマ切替
    const html = document.documentElement;
    const themeBtns = document.querySelectorAll('.theme-selector button');
    const storedTheme = localStorage.getItem('site-u-theme') || 'auto';
    function applyTheme(pref) {
        const mode = pref === 'auto'
            ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
            : pref;
        html.setAttribute('data-theme', mode);
        themeBtns.forEach(b => b.classList.toggle('selected', b.dataset.themePreference === pref));
        localStorage.setItem('site-u-theme', pref);
        updateLogoDisplay(); // ロゴ更新
        updateAll(); // QRコードの色を再適用するため
    }
    if (themeBtns.length > 0) {
        themeBtns.forEach(b => b.addEventListener('click', () => applyTheme(b.dataset.themePreference)));
        window.matchMedia('(prefers-color-scheme: dark)')
            .addEventListener('change', () => {
                if ((localStorage.getItem('site-u-theme')||'auto') === 'auto') applyTheme('auto');
            });
        applyTheme(storedTheme);
    } else {
        applyTheme(storedTheme);
    }
    updateLogoDisplay();
    const observer = new MutationObserver(updateLogoDisplay);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // 言語切替
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
}


// ── DOMContentLoaded ──
document.addEventListener('DOMContentLoaded', async () => {
    // ヘッダーを最初に読み込む
    await loadHeader();

    // フッターを読み込む
    await loadFooter();

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
                if (qrCanvasContainer) {
                    qrCanvasContainer.innerHTML = '<div style="width: 180px; height: 180px; background: var(--text-color); margin: 0 auto; display: flex; align-items: center; justify-content: center; color: var(--block-bg); font-size: 12px;">QRコード表示エリア</div>';
                    const dummyDiv = qrCanvasContainer.querySelector('div');
                    if (dummyDiv) {
                        dummyDiv.setAttribute('data-text', 'QRコード表示エリア');
                    }
                }
            }
        });
        qrDetailContainer.dataset.toggleListenerAdded = 'true';
    }

    // ページロード時の初期更新
    if (globalIpInput) {
        updateAll();
    }
});
