// ==================================================
// 初期値設定（一括管理）
// ==================================================
const DEFAULT_VALUES = {
    // IPアドレス関連
    ip: '192.168.1.1',
    ipPlaceholder: 'openwrt.lan',
    
    // ブラウザ関連
    service: 'luci',        // LuCI
    port: '80',             // LuCIのデフォルトポート
    
    // ターミナル関連
    terminalType: 'aios',   // aios
    
    // その他
    language: 'en',
    theme: 'auto'
};

// ==================================================
// グローバル変数と定数
// ==================================================
let currentLanguage = DEFAULT_VALUES.language;
let currentTheme = DEFAULT_VALUES.theme;
let currentIP = DEFAULT_VALUES.ip;

// サービス設定
const SERVICE_CONFIGS = {
    luci: { port: '80', protocol: 'http' },
    ttyd: { port: '7681', protocol: 'http' },
    filebrowser: { port: '8080', protocol: 'http' },
    adguard: { port: '3000', protocol: 'http' },
    custom: { port: '', protocol: 'http' }
};

// ターミナルタイプ設定
const TERMINAL_CONFIGS = {
    ssh: { command: 'root@{ip}' },
    aios: { command: 'root@{ip}' },
    custom: { command: '' }
};

// ── グローバル定数（再定義不要なもの）──
const SSH_COMMANDS_AIOS = [
    'if [ -f /usr/bin/aios ]; then /usr/bin/aios; else wget -O /usr/bin/aios https://raw.githubusercontent.com/site-u2023/aios/main/aios && chmod +x /usr/bin/aios && /usr/bin/aios; fi'
];
const SSH_CMD_ENCODED_AIOS = encodeURIComponent(SSH_COMMANDS_AIOS.join(''));

// 多言語対応
const translations = {
    ja: {
        address: 'アドレス',
        browser: 'ブラウザ',
        terminal: 'ターミナル',
        apply: '適用',
        open: '開く',
        qrCodeDisplay: 'QRコード',
        qrCodeArea: 'QRコード表示エリア',
        sshHandler: 'プロトコルハンドラー登録 (初回のみ)',
        downloadHandlerButton: 'ダウンロード (ダウンロードしたsshcmd.regファイルをダブルクリックしてインストールして下さい。)',
        githubRepo: 'GitHubリポジトリ',
        aiosScript: 'オールインワンスクリプト',
        configSoftware: 'コンフィグソフトウェア',
        disclaimerPageTitle: '免責事項',
        disclaimerSiteUTitle: 'site-u（当サイト）に関する免責事項',
        disclaimerOpenWrtTitle: 'OpenWrtに関する免責事項',
        disclaimerSiteUParagraph: '当サイトで公開されているコンテンツ（ウェブサイト、スクリプト、その他の著作物を含む）は全てオープンであり、自由にご利用いただけます。しかしながら、これらのコンテンツの利用によって生じたいかなる損害についても、当サイトの運営者は一切の責任を負いません。利用者の皆様の責任においてご利用くださいますようお願いいたします。',
        disclaimerOpenWrtParagraph: 'OpenWrtはSoftware Freedom Conservancyの登録商標です。当サイトはOpenWrtプロジェクトとは提携しておらず、また推奨もされていません。OpenWrtに関する公式情報やサポートについては、OpenWrt公式サイトをご参照ください。',
        footerMemo: 'OpenWrt初心者備忘録',
        footerCopyright: '© site-u',
        footerDisclaimer: '免責事項',
        langEn: 'English',
        langJa: '日本語'
    },
    en: {
        address: 'Address',
        browser: 'Browser',
        terminal: 'Terminal',
        apply: 'Apply',
        open: 'Open',
        qrCodeDisplay: 'QR Code',
        qrCodeArea: 'QR Code Display Area',
        sshHandler: 'Protocol handler registration (first-time use)',
        downloadHandlerButton: 'Download (Double-click the downloaded sshcmd.reg file to install it.)',
        githubRepo: 'GitHub Repository',
        aiosScript: 'All-in-One Script',
        configSoftware: 'Config Software',
        disclaimerPageTitle: 'Disclaimer',
        disclaimerSiteUTitle: 'Disclaimer regarding site-u (this site)',
        disclaimerOpenWrtTitle: 'Disclaimer regarding OpenWrt',
        disclaimerSiteUParagraph: 'All content published on this site (including websites, scripts, and other works) is open and available for free use. However, the site operator assumes no responsibility for any damages arising from the use of this content. Please use at your own risk.',
        disclaimerOpenWrtParagraph: 'OpenWrt is a registered trademark of Software Freedom Conservancy. This site is not affiliated with or endorsed by the OpenWrt project. For official information and support regarding OpenWrt, please refer to the official OpenWrt website.',
        footerMemo: 'OpenWrt A Beginner\'s Notebook',
        footerCopyright: '© site-u',
        footerDisclaimer: 'Disclaimer',
        langEn: 'English',
        langJa: '日本語'
    }
};

// ==================================================
// 初期化
// ==================================================
document.addEventListener('DOMContentLoaded', function() {
    initializeSettings();
    bindEvents();
    updateAllDisplays();
});

function initializeSettings() {
    // 言語設定の復元
    const savedLanguage = localStorage.getItem('language') || DEFAULT_VALUES.language;
    currentLanguage = savedLanguage;
    
    // テーマ設定の復元
    const savedTheme = localStorage.getItem('theme') || DEFAULT_VALUES.theme;
    currentTheme = savedTheme;
    applyTheme(currentTheme);
    
    // IPアドレスの復元と設定
    const savedIP = localStorage.getItem('currentIP') || DEFAULT_VALUES.ip;
    currentIP = savedIP;
    const ipInput = document.getElementById('global-ip-input');
    if (ipInput) {
        ipInput.value = currentIP;
    }
    
    // サービス選択の初期化（デフォルト値に統一）
    const serviceSelector = document.getElementById('service-selector');
    if (serviceSelector) {
        serviceSelector.value = DEFAULT_VALUES.service;
        updateServicePort();
    }
    
    // ターミナル選択の初期化（デフォルト値に統一）
    const terminalSelector = document.getElementById('terminal-selector');
    if (terminalSelector) {
        terminalSelector.value = DEFAULT_VALUES.terminalType;
        updateTerminalCommand();
    }
}

function bindEvents() {
    // IPアドレス関連
    const ipInput = document.getElementById('global-ip-input');
    const globalIpUpdate = document.getElementById('global-ip-update');
    
    if (ipInput) {
        ipInput.addEventListener('input', function() {
            currentIP = this.value;
            updateAllDisplays();
        });
    }
    
    if (globalIpUpdate) {
        globalIpUpdate.addEventListener('click', function() {
            if (ipInput) {
                currentIP = ipInput.value;
                localStorage.setItem('currentIP', currentIP);
                updateAllDisplays();
            }
        });
    }
    
    // ブラウザ関連
    const serviceSelector = document.getElementById('service-selector');
    const portInput = document.getElementById('port-input');
    const browserUpdate = document.getElementById('browser-update');
    const openCurrentUrl = document.getElementById('open-current-url');
    
    if (serviceSelector) {
        serviceSelector.addEventListener('change', updateServicePort);
    }
    
    if (portInput) {
        portInput.addEventListener('input', function() {
            const serviceSelector = document.getElementById('service-selector');
            if (serviceSelector) {
                const selectedService = serviceSelector.value;
                const portKey = `port_${selectedService}`;
                localStorage.setItem(portKey, this.value);
            }
            updateBrowserDisplay();
        });
    }
    
    if (browserUpdate) {
        browserUpdate.addEventListener('click', function() {
            updateBrowserDisplay();
        });
    }
    
    if (openCurrentUrl) {
        openCurrentUrl.addEventListener('click', function() {
            const url = generateBrowserURL();
            if (url) {
                window.open(url, '_blank');
            }
        });
    }
    
    // ターミナル関連
    const terminalSelector = document.getElementById('terminal-selector');
    const commandInput = document.getElementById('command-input');
    const terminalUpdate = document.getElementById('terminal-update');
    const openTerminal = document.getElementById('open-terminal');
    
    if (terminalSelector) {
        terminalSelector.addEventListener('change', updateTerminalCommand);
    }
    
    if (commandInput) {
        commandInput.addEventListener('input', updateTerminalDisplay);
    }
    
    if (terminalUpdate) {
        terminalUpdate.addEventListener('click', function() {
            updateTerminalDisplay();
        });
    }
    
    if (openTerminal) {
        openTerminal.addEventListener('click', function() {
            const url = generateTerminalURL();
            if (url) {
                window.location.href = url;
            }
        });
    }
}

// ==================================================
// ブラウザ関連機能
// ==================================================
function updateServicePort() {
    const serviceSelector = document.getElementById('service-selector');
    const portInput = document.getElementById('port-input');
    
    if (serviceSelector && portInput) {
        const selectedService = serviceSelector.value;
        const config = SERVICE_CONFIGS[selectedService];
        
        // カスタムポート値の保存キーを生成
        const portKey = `port_${selectedService}`;
        const savedPort = localStorage.getItem(portKey);
        
        if (config && selectedService !== 'custom') {
            // 保存された値があればそれを使用、なければデフォルト値
            portInput.value = savedPort || config.port;
        } else if (selectedService === 'custom') {
            portInput.value = savedPort || '';
        }
        
        updateBrowserDisplay();
    }
}

function updateBrowserDisplay() {
    updateQRCode();
}

function generateBrowserURL() {
    const serviceSelector = document.getElementById('service-selector');
    const portInput = document.getElementById('port-input');
    
    if (!serviceSelector || !portInput) return null;
    
    const selectedService = serviceSelector.value;
    const port = portInput.value || DEFAULT_VALUES.port;
    const config = SERVICE_CONFIGS[selectedService];
    const protocol = config ? config.protocol : 'http';
    
    return `${protocol}://${currentIP}:${port}`;
}

// ==================================================
// ターミナル関連機能
// ==================================================
function updateTerminalCommand() {
    const terminalSelector = document.getElementById('terminal-selector');
    const commandInput = document.getElementById('command-input');
    
    if (terminalSelector && commandInput) {
        const selectedType = terminalSelector.value;
        const config = TERMINAL_CONFIGS[selectedType];
        
        if (config) {
            if (selectedType === 'aios') {
                // OpenWrtが期待するURI形式を修正
                commandInput.value = `sshcmd://root@${currentIP}/${SSH_CMD_ENCODED_AIOS}`;
            } else if (config.command) {
                commandInput.value = `sshcmd://${config.command.replace('{ip}', currentIP)}`;
            } else {
                commandInput.value = '';
            }
        }
        
        updateTerminalDisplay();
    }
}

function updateTerminalDisplay() {
    // ターミナル表示の更新（必要に応じて実装）
}

function generateTerminalURL() {
    const commandInput = document.getElementById('command-input');
    
    if (!commandInput) return null;
    
    const command = commandInput.value;
    
    if (!command) {
        return null;
    }
    
    return command;
}

// ==================================================
// QRコード機能
// ==================================================
function updateQRCode() {
    const qrCodeContainer = document.getElementById('qrcode-detail');
    if (!qrCodeContainer) return;
    
    const url = generateBrowserURL();
    if (!url) return;
    
    try {
        // 既存のQRコードをクリア
        qrCodeContainer.innerHTML = '';
        
        // 新しいQRコードを生成
        const qr = new QRious({
            element: document.createElement('canvas'),
            value: url,
            size: 180,
            foreground: getComputedStyle(document.documentElement).getPropertyValue('--qr-dark').trim(),
            background: getComputedStyle(document.documentElement).getPropertyValue('--qr-light').trim()
        });
        
        qrCodeContainer.appendChild(qr.element);
    } catch (error) {
        console.error('QRコード生成エラー:', error);
        qrCodeContainer.innerHTML = '<div style="width: 180px; height: 180px; background: var(--text-color); margin: 0 auto; display: flex; align-items: center; justify-content: center; color: var(--block-bg); font-size: 12px;"><span data-i18n="qrCodeArea">QRコード表示エリア</span></div>';
    }
}

// ==================================================
// テーマ切り替え機能
// ==================================================
function applyTheme(theme) {
    const html = document.documentElement;
    
    if (theme === 'auto') {
        // システムテーマに従う
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        html.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
        html.setAttribute('data-theme', theme);
    }
    
    currentTheme = theme;
    localStorage.setItem('theme', theme);
    
    // QRコードの更新（色が変わるため）
    setTimeout(updateQRCode, 100);
}

// ==================================================
// 多言語対応機能
// ==================================================
function updateLanguage(lang) {
    currentLanguage = lang;
    localStorage.setItem('language', lang);
    
    // 翻訳を適用
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (translations[lang] && translations[lang][key]) {
            element.textContent = translations[lang][key];
        }
    });
}

// ==================================================
// 共通更新機能
// ==================================================
function updateAllDisplays() {
    updateServicePort();
    updateTerminalCommand();
    updateQRCode();
}

// ==================================================
// ヘッダー・フッター対応（動的読み込み用）
// ==================================================
function loadHeaderFooter() {
    // ヘッダーの読み込み
    fetch('header.html')
        .then(response => response.text())
        .then(html => {
            const headerContainer = document.querySelector('.main-header');
            if (headerContainer) {
                headerContainer.innerHTML = html;
                bindHeaderEvents();
            }
        })
        .catch(error => console.error('ヘッダー読み込みエラー:', error));
    
    // フッターの読み込み
    fetch('footer.html')
        .then(response => response.text())
        .then(html => {
            const footerContainer = document.querySelector('.page-footer-area');
            if (footerContainer) {
                footerContainer.innerHTML = html;
                bindFooterEvents();
            }
        })
        .catch(error => console.error('フッター読み込みエラー:', error));
}

function bindHeaderEvents() {
    // ヘッダー内のイベントバインド（必要に応じて実装）
}

function bindFooterEvents() {
    // 言語切り替えボタンのイベントバインド
    const langButtons = document.querySelectorAll('.lang-button');
    langButtons.forEach(button => {
        button.addEventListener('click', function() {
            const lang = this.getAttribute('data-lang');
            if (lang) {
                updateLanguage(lang);
                updateLanguageButtons();
            }
        });
    });
    
    // テーマ切り替えボタンのイベントバインド
    const themeButtons = document.querySelectorAll('.theme-button');
    themeButtons.forEach(button => {
        button.addEventListener('click', function() {
            const theme = this.getAttribute('data-theme-preference');
            if (theme) {
                applyTheme(theme);
                updateThemeButtons();
            }
        });
    });
    
    updateLanguageButtons();
    updateThemeButtons();
}

function updateLanguageButtons() {
    const langButtons = document.querySelectorAll('.lang-button');
    langButtons.forEach(button => {
        const lang = button.getAttribute('data-lang');
        if (lang === currentLanguage) {
            button.classList.add('selected');
        } else {
            button.classList.remove('selected');
        }
    });
}

function updateThemeButtons() {
    const themeButtons = document.querySelectorAll('.theme-button');
    themeButtons.forEach(button => {
        const theme = button.getAttribute('data-theme-preference');
        if (theme === currentTheme) {
            button.classList.add('selected');
        } else {
            button.classList.remove('selected');
        }
    });
}

// システムテーマ変更の監視
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
    if (currentTheme === 'auto') {
        applyTheme('auto');
    }
});

// ヘッダー・フッターが存在する場合は動的読み込みを実行
document.addEventListener('DOMContentLoaded', function() {
    const headerExists = document.querySelector('.main-header');
    const footerExists = document.querySelector('.page-footer-area');
    
    if (headerExists || footerExists) {
        loadHeaderFooter();
    }
});
