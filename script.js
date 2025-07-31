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
        deviceIP: 'Device Settings',
        update: 'Update',
        qrCodeDisplay: 'LuCi QR Code',
        qrCodeArea: 'QR Code Display Area',
        terminal: 'Terminal (for Windows)',
        sshHandler: 'Protocol handler registration (first-time use)',
        downloadHandlerButton: 'Download (Double-click sshcmd.reg to install)',
        sshConnection: 'SSH Connection: ',
        aiosExecution: 'Execute aios: ',
        console: 'Web Console',
        luciAdmin: 'LuCI: ',
        ttydTerminal: 'Ttyd: ',
        filebrowserService: 'Filebrowser: ',
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
        langEn: 'English',
        langJa: '日本語'       
    },
    ja: {
        deviceIP: 'デバイス設定',
        update: '更新',
        qrCodeDisplay: 'LuCi QRコード',
        qrCodeArea: 'QRコード表示エリア', 
        terminal: 'ターミナル (Windows用)',
        sshHandler: 'プロトコルハンドラー登録 (初回のみ)',
        downloadHandlerButton: 'ダウンロード (sshcmd.reg をダブルクリックしてインストールしてください)',
        sshConnection: 'SSH接続: ',
        aiosExecution: 'aios実行: ',
        console: 'Webコンソール',
        luciAdmin: 'LuCI: ',
        ttydTerminal: 'Ttyd: ',
        filebrowserService: 'Filebrowser: ',
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
        langEn: 'English',
        langJa: '日本語'
    }
};

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
    const ipInput = document.getElementById('ip-input');
    const ttydInput = document.getElementById('ttyd-input');
    const fbInput = document.getElementById('fb-input');
    
    if (!ipInput || !ttydInput || !fbInput) return;

    const ip = ipInput.value.trim() || ipInput.placeholder;
    const ttydPort = ttydInput.value.trim() || ttydInput.placeholder;
    const fbPort = fbInput.value.trim() || fbInput.placeholder;
    
    // localStorageに保存
    localStorage.setItem('site-u-ip', ip);
    localStorage.setItem('site-u-ttyd', ttydPort);
    localStorage.setItem('site-u-fb', fbPort);

    // SSH関連のIP表示を更新
    const sshIpSpan = document.getElementById('ssh-ip');
    const aiosIpSpan = document.getElementById('aios-ip');
    if (sshIpSpan) sshIpSpan.textContent = ip;
    if (aiosIpSpan) aiosIpSpan.textContent = ip;

    // Webコンソール関連の表示を更新
    const luciIpSpan = document.getElementById('luci-ip');
    const ttydIpSpan = document.getElementById('ttyd-ip');
    const ttydPortSpan = document.getElementById('ttyd-port');
    const filebrowserIpSpan = document.getElementById('filebrowser-ip');
    const filebrowserPortSpan = document.getElementById('filebrowser-port');
    
    if (luciIpSpan) luciIpSpan.textContent = ip;
    if (ttydIpSpan) ttydIpSpan.textContent = ip;
    if (ttydPortSpan) ttydPortSpan.textContent = ttydPort;
    if (filebrowserIpSpan) filebrowserIpSpan.textContent = ip;
    if (filebrowserPortSpan) filebrowserPortSpan.textContent = fbPort;

    // リンクのhrefを更新
    document.querySelectorAll('.link-item[data-ip-template]').forEach(link => {
        const template = link.dataset.ipTemplate;
        if (template) {
            let newHref = template
                .replace(/\${ip}/g, ip)
                .replace(/\${ttyd}/g, ttydPort)
                .replace(/\${fb}/g, fbPort);
                
            if (link.id === 'aios-link') {
                newHref = newHref.replace(/\${cmd}/g, SSH_CMD_ENCODED_AIOS);
            }
            link.href = newHref;
        }
    });

    // QRコード更新
    const qrDetailContainer = document.getElementById('qrcode-detail-container');
    if (qrDetailContainer && qrDetailContainer.open) {
        drawQRCode('qrcode-detail', `http://${ip}`);
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
            if (['sshConnection', 'aiosExecution', 'luciAdmin', 'ttydTerminal', 'filebrowserService'].includes(key)) {
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
        
        initializeThemeAndLanguageSelectors();
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
    const currentLang = localStorage.getItem('lang-preference') || 'en';
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
document.addEventListener('DOMContentLoaded', () => {
    // ★★★ ヘッダーとフッターを読み込み ★★★
    loadHeader();
    loadFooter();

    // 保存された値を読み込み
    const ipInput = document.getElementById('ip-input');
    const ttydInput = document.getElementById('ttyd-input');
    const fbInput = document.getElementById('fb-input');

    if (ipInput) {
        const storedIp = localStorage.getItem('site-u-ip');
        if (storedIp) ipInput.value = storedIp;
    }

    if (ttydInput) {
        const storedTtyd = localStorage.getItem('site-u-ttyd');
        if (storedTtyd) ttydInput.value = storedTtyd;
    }

    if (fbInput) {
        const storedFb = localStorage.getItem('site-u-fb');
        if (storedFb) fbInput.value = storedFb;
    }

let isComposing = false;

[ipInput, ttydInput, fbInput].forEach(input => {
    if (!input) return;

    input.addEventListener('input', () => {
        updateAll(); // IMEオフ前提で処理最小化
    });

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            updateAll(); // 手動確定でも更新
        }
    });
});

    // 初期表示時にも更新
    updateAll();

    // global-ip-update ボタン
    const globalIpUpdateBtn = document.getElementById('global-ip-update');
    if (globalIpUpdateBtn) {
        globalIpUpdateBtn.addEventListener('click', updateAll);
    }

    // QRコード関連
    const qrDetailContainer = document.getElementById('qrcode-detail-container');
    if (qrDetailContainer && !qrDetailContainer.dataset.toggleListenerAdded) {
        qrDetailContainer.addEventListener('toggle', function() {
            const ipInput = document.getElementById('ip-input');
            const currentIp = ipInput ? (ipInput.value.trim() || ipInput.placeholder) : '192.168.1.1';

            if (this.open) {
                drawQRCode('qrcode-detail', `http://${currentIp}`);
            } else {
                const qrCanvasContainer = document.getElementById('qrcode-detail');
                if (qrCanvasContainer) {
                    qrCanvasContainer.innerHTML = `<div style="width: 180px; height: 180px; background: var(--text-color); margin: 0 auto; display: flex; align-items: center; justify-content: center; color: var(--block-bg); font-size: 12px;"><span>QRコード表示エリア</span></div>`;
                }
            }
        });
        qrDetailContainer.dataset.toggleListenerAdded = 'true';
    }
});
