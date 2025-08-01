// ── グローバル定数（再定義不要なもの）──
const SSH_COMMANDS_AIOS = [
    'wget -O /usr/bin/aios https://raw.githubusercontent.com/site-u2023/aios/main/aios',
    'chmod +x /usr/bin/aios',
    'sh /usr/bin/aios'
].join(' && ');
const SSH_CMD_ENCODED_AIOS = encodeURIComponent(SSH_COMMANDS_AIOS);

// ── サービス定義データベース ──
const SERVICES = {
    luci: {
        name: 'LuCI',
        port: 80,
        path: '/cgi-bin/luci',
        protocol: 'http',
        i18nKey: 'luciAdmin'
    },
    ttyd: {
        name: 'ttyd',
        port: 7681,
        path: '/',
        protocol: 'http',
        i18nKey: 'ttydTerminal'
    },
    filebrowser: {
        name: 'filebrowser',
        port: 8080,
        path: '/',
        protocol: 'http',
        i18nKey: 'filebrowserService'
    },
    adguard: {
        name: 'AdGuard Home',
        port: 3000,
        path: '/',
        protocol: 'http',
        i18nKey: 'adguardService'
    },
    pihole: {
        name: 'Pi-hole',
        port: 8080,
        path: '/admin',
        protocol: 'http',
        i18nKey: 'piholeService'
    },
    custom: {
        name: 'Custom',
        port: null,
        path: '/',
        protocol: 'http',
        i18nKey: 'customService'
    }
};

// ── 言語切替機能データ（サービス追加） ──
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
        ttydTerminal: 'ttyd: ',
        filebrowserService: 'filebrowser: ',
        adguardService: 'AdGuard Home: ',
        piholeService: 'Pi-hole: ',
        customService: 'Custom: ',
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
        ttydTerminal: 'ttyd: ',
        filebrowserService: 'filebrowser: ',
        adguardService: 'AdGuard Home: ',
        piholeService: 'Pi-hole: ',
        customService: 'カスタム: ',
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

// ── 動的リンク生成関数 ──
function generateDynamicLinks() {
    const dynamicLinksContainer = document.getElementById('dynamic-links');
    if (!dynamicLinksContainer) return;

    // 既存のリンクをクリア
    dynamicLinksContainer.innerHTML = '';

    const ipInput = document.getElementById('ip-input');
    const serviceSelector = document.getElementById('service-selector');
    const portInput = document.getElementById('port-input');
    
    if (!ipInput || !serviceSelector || !portInput) return;

    const ip = ipInput.value.trim() || ipInput.placeholder;
    const selectedService = serviceSelector.value;
    const port = portInput.value.trim() || portInput.placeholder;
    const currentLang = localStorage.getItem('lang-preference') || 'en';

    // 選択されたサービス以外のすべてのサービスのリンクを生成
    Object.keys(SERVICES).forEach(serviceKey => {
        const service = SERVICES[serviceKey];
        
        // Customは除外（動的サービスではないため）
        if (serviceKey === 'custom') return;
        
        // 現在選択されているサービスの場合は、入力されたポートを使用
        const servicePort = serviceKey === selectedService ? port : service.port;
        const url = `${service.protocol}://${ip}:${servicePort}${service.path}`;
        
        // リンク要素を作成
        const li = document.createElement('li');
        const a = document.createElement('a');
        
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.className = 'link-item bordered-element';
        a.setAttribute('data-service', serviceKey);
        
        // リンクテキストとIPディスプレイを作成
        const linkText = document.createElement('span');
        linkText.className = 'link-text';
        linkText.textContent = langData[currentLang][service.i18nKey] || `${service.name}: `;
        
        const ipDisplay = document.createElement('span');
        ipDisplay.className = 'ip-display';
        ipDisplay.innerHTML = `${service.protocol}://<span class="service-ip">${ip}</span>:<span class="service-port">${servicePort}</span>`;
        
        a.appendChild(linkText);
        a.appendChild(ipDisplay);
        li.appendChild(a);
        dynamicLinksContainer.appendChild(li);
    });
}

// ── サービス選択変更処理 ──
function handleServiceChange() {
    const serviceSelector = document.getElementById('service-selector');
    const portInput = document.getElementById('port-input');
    
    if (!serviceSelector || !portInput) return;
    
    const selectedService = SERVICES[serviceSelector.value];
    if (!selectedService) return;
    
    // Customでない場合はポートを自動設定
    if (serviceSelector.value !== 'custom' && selectedService.port !== null) {
        portInput.value = selectedService.port;
        portInput.disabled = false; // ユーザーが変更可能
    } else if (serviceSelector.value === 'custom') {
        portInput.disabled = false;
        portInput.placeholder = 'Enter port';
    }
    
    // ローカルストレージに保存
    localStorage.setItem('site-u-service', serviceSelector.value);
    localStorage.setItem('site-u-port', portInput.value);
    
    // リンクを更新
    generateDynamicLinks();
}

// ── 全リンク更新処理（更新版） ──
function updateAll() {
    const ipInput = document.getElementById('ip-input');
    const serviceSelector = document.getElementById('service-selector');
    const portInput = document.getElementById('port-input');
    
    if (!ipInput || !serviceSelector || !portInput) return;

    const ip = ipInput.value.trim() || ipInput.placeholder;
    const selectedService = serviceSelector.value;
    const port = portInput.value.trim() || portInput.placeholder;
    
    // localStorageに保存
    localStorage.setItem('site-u-ip', ip);
    localStorage.setItem('site-u-service', selectedService);
    localStorage.setItem('site-u-port', port);

    // SSH関連のIP表示を更新
    const sshIpSpan = document.getElementById('ssh-ip');
    const aiosIpSpan = document.getElementById('aios-ip');
    if (sshIpSpan) sshIpSpan.textContent = ip;
    if (aiosIpSpan) aiosIpSpan.textContent = ip;

    // 動的リンクを更新
    generateDynamicLinks();

    // 既存のSSHリンクを更新
    document.querySelectorAll('a[data-ip-template]').forEach(link => {
        const template = link.dataset.ipTemplate;
        if (template) {
            let newHref = template.replace(/\${ip}/g, ip);
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

// ── DOMContentLoaded（更新版） ──
document.addEventListener('DOMContentLoaded', () => {
    loadHeader();
    loadFooter();

    const ipInput = document.getElementById('ip-input');
    const serviceSelector = document.getElementById('service-selector');
    const portInput = document.getElementById('port-input');

    // 保存された値を復元
    if (ipInput) {
        const storedIp = localStorage.getItem('site-u-ip');
        if (storedIp) ipInput.value = storedIp;
    }

    if (serviceSelector) {
        const storedService = localStorage.getItem('site-u-service');
        if (storedService && SERVICES[storedService]) {
            serviceSelector.value = storedService;
        }
    }

    if (portInput) {
        const storedPort = localStorage.getItem('site-u-port');
        if (storedPort) {
            portInput.value = storedPort;
        } else {
            // サービス選択に基づいてデフォルトポートを設定
            const selectedService = SERVICES[serviceSelector?.value];
            if (selectedService && selectedService.port !== null) {
                portInput.value = selectedService.port;
            }
        }
    }

    // IPアドレス入力フィールドの処理（IPv4/IPv6/ホスト名対応）
    if (ipInput) {
        ipInput.addEventListener('compositionstart', e => e.preventDefault());

        ipInput.addEventListener('keydown', e => {
            const isIPAllowedChar =
                (e.key.length === 1 && /[0-9a-zA-Z.:\-_]/.test(e.key)) || // IPv4/IPv6/ホスト名に必要な文字
                ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Enter'].includes(e.key);

            if (!isIPAllowedChar) {
                e.preventDefault();
                return;
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                updateAll();
            }
        });

        ipInput.addEventListener('input', updateAll);
    }

    // ポート番号入力フィールドの処理（数字のみ）
    if (portInput) {
        portInput.addEventListener('compositionstart', e => e.preventDefault());

        portInput.addEventListener('keydown', e => {
            const isNumericAllowedChar =
                (e.key.length === 1 && /[0-9]/.test(e.key)) || // 数字のみを許可
                ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Enter'].includes(e.key);

            if (!isNumericAllowedChar) {
                e.preventDefault();
                return;
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                updateAll();
            }
        });

        portInput.addEventListener('input', updateAll);
    }

    // サービスセレクターの処理
    if (serviceSelector) {
        serviceSelector.addEventListener('change', handleServiceChange);
    }

    // 初期表示時にサービス設定とリンク生成
    handleServiceChange();
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

// ── applyLanguage 関数（サービスリンク対応版） ──
function applyLanguage(lang) {
    const langButtons = document.querySelectorAll('.language-selector button');
    langButtons.forEach(button => {
        button.classList.toggle('selected', button.dataset.lang === lang);
        if (langData[lang]['lang' + button.dataset.lang.toUpperCase()]) {
            button.textContent = langData[lang]['lang' + button.dataset.lang.toUpperCase()];
        }
    });

    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (langData[lang] && langData[lang][key] !== undefined) {
            if (['sshConnection', 'aiosExecution'].includes(key)) {
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
                const paragraphSuffix = langData[lang].disclaimerOpenWrtSuffix || '';

                element.innerHTML = `${paragraphPrefix}<a href="https://openwrt.org/" target="_blank" rel="noopener noreferrer" class="external-link"><span>${linkText}</span></a>${paragraphSuffix}`;
            } else {
                element.textContent = langData[lang][key];
            }
        }
    });

    // 動的サービスリンクの言語切り替え
    document.querySelectorAll('a[data-service]').forEach(link => {
        const serviceKey = link.getAttribute('data-service');
        const service = SERVICES[serviceKey];
        if (service && langData[lang][service.i18nKey]) {
            const linkTextSpan = link.querySelector('.link-text');
            if (linkTextSpan) {
                linkTextSpan.textContent = langData[lang][service.i18nKey];
            }
        }
    });

    // 全体を更新（動的リンクの再生成も含む）
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

// ── その他の既存関数は変更なし ──
// drawQRCode、updateLogoDisplay、loadHeader、loadFooter、initializeThemeAndLanguageSelectors
// これらの関数は元のコードのまま使用
