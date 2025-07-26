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
        qrCodeDisplay: 'LuCi QR Code',
        qrCodeArea: 'QR Code Display Area',
        downloadHandlerButton: 'Download: sshcmd.reg',
        sshHandler: 'Protocol handler registration (first-time use)',
        sshConnection: 'SSH Connection: ',
        aiosExecution: 'Execute aios: ',
        console: 'Console',
        luciAdmin: 'LuCI: ',
        ttydTerminal: 'ttyd: ',
        githubRepo: 'GitHub Repository',
        aiosScript: 'all in one script',
        configSoftware: 'config software (legacy)',
        footerMemo: 'OpenWrt A Beginner\'s Notebook',
        footerSiteU: 'site-u',
        footerDisclaimer: 'Disclaimer',
        disclaimerPageTitle: 'Disclaimer',
        disclaimerSiteUTitle: 'Disclaimer regarding site-u (this site)',
        disclaimerSiteUParagraph: 'All content (including websites, scripts, and other works) published on this site is open and freely available for use. However, the operators of this site assume no responsibility for any damages incurred through the use of this content. Please use it at your own risk.',
        disclaimerOpenWrtTitle: 'Disclaimer regarding OpenWrt',
        disclaimerOpenWrtParagraph: 'OpenWrt is a registered trademark of Software Freedom Conservancy. This site is not affiliated with or endorsed by the OpenWrt project. For official information and support regarding OpenWrt, please refer to the ',
        openWrtOfficialSite: 'OpenWrt official website',
        disclaimerOpenWrtSuffix: '.',
        langEn: '🇬🇧',
        langJa: '🇯🇵'       
    },
    ja: {
        deviceIP: 'デバイスIPアドレス',
        terminal: 'ターミナル (Windows用)',
        update: '更新',
        qrCodeDisplay: 'LuCi QRコード',
        qrCodeArea: 'QRコード表示エリア', 
        downloadHandlerButton: 'ダウンロード: sshcmd.reg',
        sshHandler: 'プロトコルハンドラー登録 (初回のみ)',
        sshConnection: 'SSH接続: ',
        aiosExecution: 'aios実行: ',
        console: 'コンソール',
        luciAdmin: 'LuCI: ',
        ttydTerminal: 'ttyd: ',
        githubRepo: 'GitHubリポジトリ',
        aiosScript: 'オールインワンスクリプト',
        configSoftware: 'コンフォグソフトウェア (旧版)',
        footerMemo: 'OpenWrt初心者備忘録',
        footerSiteU: 'site-u',
        footerDisclaimer: '免責事項',
        disclaimerPageTitle: '免責事項',
        disclaimerSiteUTitle: 'site-u（当サイト）に関する免責事項',
        disclaimerSiteUParagraph: '当サイトで公開されているコンテンツ（ウェブサイト、スクリプト、その他の著作物を含む）は全てオープンであり、自由にご利用いただけます。しかしながら、これらのコンテンツの利用によって生じたいかなる損害についても、当サイトの運営者は一切の責任を負いません。利用者の皆様の責任においてご利用くださいますようお願いいたします。',
        disclaimerOpenWrtTitle: 'OpenWrtに関する免責事項',
        disclaimerOpenWrtParagraph: 'OpenWrtはSoftware Freedom Conservancyの登録商標です。当サイトはOpenWrtプロジェクトとは提携しておらず、また推奨もされていません。OpenWrtに関する公式情報やサポートについては、',
        openWrtOfficialSite: 'OpenWrt公式サイト',
        disclaimerOpenWrtSuffix: 'をご参照ください。',
        langEn: '🇬🇧',
        langJa: '🇯🇵'
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
        if (qrContainer) {
            qrContainer.innerHTML = `<div style="width: 180px; height: 180px; background: var(--text-color); margin: 0 auto; display: flex; align-items: center; justify-content: center; color: var(--block-bg); font-size: 12px;"><span data-i18n="qrCodeArea">${langData[localStorage.getItem('lang-preference') || 'ja'].qrCodeArea}</span></div>`;
            qrContainer.querySelector('div span').setAttribute('data-text', 'QRiousライブラリがロードされていません'); // data-textは特に言語切り替えとは関係ないですが、元のコードに倣って維持
        }
        return;
    }
    qrContainer.innerHTML = '';
    const canvas = document.createElement('canvas');
    qrContainer.appendChild(canvas);

    const style = getComputedStyle(document.body);
    const darkColor = style.getPropertyValue('--qr-dark').trim();
    const lightColor = style.getPropertyValue('--qr-light').trim();

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

    const luciIpSpan = document.getElementById('luci-ip');
    const ttydIpSpan = document.getElementById('ttyd-ip');
    if (luciIpSpan) luciIpSpan.textContent = ip;
    if (ttydIpSpan) ttydIpSpan.textContent = ip;

    document.querySelectorAll('.link-item[data-ip-template]').forEach(link => {
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
        drawQRCode('qrcode-detail', `http://${ip}`);
    } else if (qrDetailContainer) {
        const qrCanvasContainer = document.getElementById('qrcode-detail');
        if (qrCanvasContainer) {
            const currentLang = localStorage.getItem('lang-preference') || 'ja';
            qrCanvasContainer.innerHTML = `<div style="width: 180px; height: 180px; background: var(--text-color); margin: 0 auto; display: flex; align-items: center; justify-content: center; color: var(--block-bg); font-size: 12px;"><span data-i18n="qrCodeArea">${langData[currentLang].qrCodeArea}</span></div>`;
            const dummyDivSpan = qrCanvasContainer.querySelector('div span');
            if (dummyDivSpan) {
                dummyDivSpan.setAttribute('data-text', 'QRiousライブラリがロードされていません');
            }
        }
    }
}

// ── applyLanguage 関数 ──
function applyLanguage(lang) {
    const langButtons = document.querySelectorAll('.language-selector button');
    langButtons.forEach(button => {
        button.classList.toggle('selected', button.dataset.lang === lang);
        if (langData[lang]['lang' + button.dataset.lang.toUpperCase()]) { // 'langEN' または 'langJA' を動的に生成
             button.textContent = langData[lang]['lang' + button.dataset.lang.toUpperCase()];
        }
    });

    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (langData[lang] && langData[lang][key] !== undefined) {
            if (['sshConnection', 'aiosExecution', 'luciAdmin', 'ttydTerminal'].includes(key)) {
                const linkTextSpan = element.querySelector('.link-text');
                if (linkTextSpan) {
                    linkTextSpan.textContent = langData[lang][key];
                }
            } else if (key === 'sshHandler') {
                const linkTextSpan = element.querySelector('.link-text');
                const linkNoteSpan = element.querySelector('.link-note');
                const parts = langData[lang][key].split('※');
                if (linkTextSpan) {
                    linkTextSpan.textContent = parts[0].trim();
                }
                if (linkNoteSpan) {
                    linkNoteSpan.textContent = parts[1] ? '※' + parts[1].trim() : '';
                }
            } else if (element.tagName === 'SPAN' && element.parentElement.classList.contains('qr-code-canvas')) {
                element.textContent = langData[lang][key];
            } else if (key === 'disclaimerOpenWrtParagraph') {
                const paragraphPrefix = langData[lang].disclaimerOpenWrtParagraph || '';
                const linkText = langData[lang].openWrtOfficialSite || '';
                const paragraphSuffix = langData[lang].disclaimerOpenWrtSuffix || ''; // 新しく追加したキーを使用

                element.innerHTML = `${paragraphPrefix}<a href="https://openwrt.org/" target="_blank" rel="noopener noreferrer" class="external-link"><span>${linkText}</span></a>${paragraphSuffix}`;
            }
            else {
                 element.textContent = langData[lang][key];
            }
        }
    });

    updateAll();
}

// ── ロゴ表示切替 ──
function updateLogoDisplay() {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    const siteLogo = document.getElementById('site-logo');

    if (siteLogo) {
        if (theme === 'dark') {
            siteLogo.src = 'img/openwrt_text_white_and_blue.svg'; // Blue (Dark Theme)
        } else {
            siteLogo.src = 'img/openwrt_text_blue_and_dark_blue.svg'; // Black (Light Theme)
        }
    }
}

// ── ヘッダー読み込み関数 ──
async function loadHeader() {
    try {
        const response = await fetch('header.html');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const headerHtml = await response.text();
        const headerElement = document.createElement('div');
        headerElement.innerHTML = headerHtml;
        document.body.prepend(headerElement.firstElementChild);
        updateLogoDisplay();
    } catch (error) {
        console.error("Failed to load header.html:", error);
    }
}

// ── フッター読み込み関数 ──
async function loadFooter() {
    try {
        const response = await fetch('footer.html');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const footerHtml = await response.text();
        const footerElement = document.createElement('div');
        footerElement.innerHTML = footerHtml;
        document.body.appendChild(footerElement.firstElementChild);
        const yearEl = document.getElementById('current-year');
        if (yearEl) yearEl.textContent = new Date().getFullYear();
    } catch (error) {
        console.error("Failed to load footer.html:", error);
    }
}

// ── テーマ・言語セレクターの初期化処理を関数化 ──
function initializeThemeAndLanguageSelectors() {
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
        updateLogoDisplay();
        updateAll(); // テーマ変更時にもIPアドレスとQRコードを更新
    }

    if (themeBtns.length > 0) {
        themeBtns.forEach(b => {
            b.removeEventListener('click', () => applyTheme(b.dataset.themePreference)); // 既存のリスナーを削除（重複防止）
            b.addEventListener('click', () => applyTheme(b.dataset.themePreference));
        });
        window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', () => {
            if ((localStorage.getItem('site-u-theme')||'auto') === 'auto') applyTheme('auto');
        });
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if ((localStorage.getItem('site-u-theme')||'auto') === 'auto') applyTheme('auto');
        });
        applyTheme(storedTheme);
    } else {
        applyTheme(storedTheme);
    }

    if (!html.dataset.themeObserverRegistered) {
        const observer = new MutationObserver(updateLogoDisplay);
        observer.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
        html.dataset.themeObserverRegistered = 'true';
    }

    const langButtons = document.querySelectorAll('.language-selector button');
    const currentLang = localStorage.getItem('lang-preference') || 'ja';
    if (langButtons.length > 0) {
        langButtons.forEach(button => {
            button.removeEventListener('click', () => applyLanguage(button.dataset.lang)); // 既存のリスナーを削除（重複防止）
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
    await loadHeader();
    await loadFooter();
    initializeThemeAndLanguageSelectors();

    const globalIpInput = document.getElementById('global-ip-input');
    const globalIpUpdateBtn = document.getElementById('global-ip-update'); // 現在HTMLでコメントアウトされていますが、残しておきます
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
            updateAll(); // 入力時にも更新
        });
        globalIpInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                updateAll(); // Enterキーでも更新
            }
        });
    }
    // global-ip-update ボタンがHTMLにないため、このブロックは現在無効
    if (globalIpUpdateBtn) {
        globalIpUpdateBtn.addEventListener('click', updateAll);
    }

    const qrDetailContainer = document.getElementById('qrcode-detail-container');
    if (qrDetailContainer && !qrDetailContainer.dataset.toggleListenerAdded) {
        qrDetailContainer.addEventListener('toggle', function() {
            const input = document.getElementById('global-ip-input');
            const currentIpForQr = input ? (toHalfWidth(input.value.trim()) || input.placeholder) : '192.168.1.1';
            if (this.open) {
                drawQRCode('qrcode-detail', `http://${currentIpForQr}`);
            } else {
                const qrCanvasContainer = document.getElementById('qrcode-detail');
                if (qrCanvasContainer) {
                    // QRコードが閉じた時のダミー表示も言語設定を考慮するように変更
                    const currentLang = localStorage.getItem('lang-preference') || 'ja';
                    qrCanvasContainer.innerHTML = `<div style="width: 180px; height: 180px; background: var(--text-color); margin: 0 auto; display: flex; align-items: center; justify-content: center; color: var(--block-bg); font-size: 12px;"><span data-i18n="qrCodeArea">${langData[currentLang].qrCodeArea}</span></div>`;
                    const dummyDivSpan = qrCanvasContainer.querySelector('div span');
                    if (dummyDivSpan) {
                        dummyDivSpan.setAttribute('data-text', 'QRiousライブラリがロードされていません');
                    }
                }
            }
        });
        qrDetailContainer.dataset.toggleListenerAdded = 'true';
    }

    if (globalIpInput) {
        updateAll(); // 初期表示時にも更新
    }
});
