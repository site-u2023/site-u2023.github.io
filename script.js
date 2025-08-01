// ==================================================
// グローバル変数と定数
// ==================================================
let currentLanguage = 'ja';
let currentTheme = 'auto';
let currentIP = '192.168.1.1';

// サービス設定
const SERVICE_CONFIGS = {
    luci: { port: '80', protocol: 'http', path: '/cgi-bin/luci' },
    ttyd: { port: '7681', protocol: 'http', path: '/' },
    filebrowser: { port: '8080', protocol: 'http', path: '/' },
    adguard: { port: '3000', protocol: 'http', path: '/' },
    custom: { port: '', protocol: 'http', path: '/' }
};

// SSH コマンドエンコード（aios用）
const SSH_COMMANDS_AIOS = [
    'wget -O /usr/bin/aios https://raw.githubusercontent.com/site-u2023/aios/main/aios',
    'chmod +x /usr/bin/aios',
    'sh /usr/bin/aios'
].join(' && ');
const SSH_CMD_ENCODED_AIOS = encodeURIComponent(SSH_COMMANDS_AIOS);

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
        downloadHandlerButton: 'ダウンロード',
        sshConnection: 'SSH 接続: ',
        aiosExecution: 'aios 実行: ',
        githubRepo: 'GitHubリポジトリ',
        aiosScript: 'オールインワンスクリプト',
        configSoftware: 'コンフォグソフトウェア'
    },
    en: {
        address: 'Address',
        browser: 'Browser',
        terminal: 'Terminal',
        apply: 'Apply',
        open: 'Open',
        qrCodeDisplay: 'QR Code',
        qrCodeArea: 'QR Code Display Area',
        sshHandler: 'Protocol Handler Registration (First time only)',
        downloadHandlerButton: 'Download',
        sshConnection: 'SSH Connection: ',
        aiosExecution: 'Execute aios: ',
        githubRepo: 'GitHub Repository',
        aiosScript: 'All-in-One Script',
        configSoftware: 'Config Software'
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
    const savedLanguage = localStorage.getItem('language') || 'ja';
    currentLanguage = savedLanguage;
    
    // テーマ設定の復元
    const savedTheme = localStorage.getItem('theme') || 'auto';
    currentTheme = savedTheme;
    applyTheme(currentTheme);
    
    // IPアドレスの復元
    const savedIP = localStorage.getItem('currentIP') || '192.168.1.1';
    currentIP = savedIP;
    const ipInput = document.getElementById('ip-input');
    if (ipInput) {
        ipInput.value = currentIP;
    }
    
    // サービス選択の初期化
    const serviceSelector = document.getElementById('service-selector');
    if (serviceSelector) {
        const savedService = localStorage.getItem('browserService') || 'ttyd';
        serviceSelector.value = savedService;
    }
    updateServicePort();
}

function bindEvents() {
    // IPアドレス関連
    const ipInput = document.getElementById('ip-input');
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
        serviceSelector.addEventListener('change', () => {
             localStorage.setItem('browserService', serviceSelector.value);
             updateServicePort();
        });
    }
    
    if (portInput) {
        portInput.addEventListener('input', () => {
            const service = document.getElementById('service-selector').value;
            localStorage.setItem(`port-${service}`, portInput.value);
            updateBrowserDisplay();
        });
    }
    
    if (browserUpdate) {
        browserUpdate.addEventListener('click', updateBrowserDisplay);
    }
    
    if (openCurrentUrl) {
        openCurrentUrl.addEventListener('click', function() {
            const url = generateBrowserURL();
            if (url) {
                window.open(url, '_blank');
            }
        });
    }

    // QRコードのトグルイベント
    const qrDetailContainer = document.getElementById('qrcode-detail-container');
    if (qrDetailContainer) {
        qrDetailContainer.addEventListener('toggle', function() {
            if (this.open) {
                updateQRCode();
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
        const savedPort = localStorage.getItem(`port-${selectedService}`);
        const config = SERVICE_CONFIGS[selectedService];
        
        if (savedPort) {
            portInput.value = savedPort;
        } else if (config) {
            portInput.value = config.port;
        } else {
            portInput.value = '';
        }
        
        updateBrowserDisplay();
    }
}

function updateBrowserDisplay() {
    const qrDetailContainer = document.getElementById('qrcode-detail-container');
    if (qrDetailContainer && qrDetailContainer.open) {
        updateQRCode();
    }
}

function generateBrowserURL() {
    const serviceSelector = document.getElementById('service-selector');
    const portInput = document.getElementById('port-input');
    
    if (!serviceSelector || !portInput) return null;
    
    const selectedService = serviceSelector.value;
    const port = portInput.value || '80';
    const config = SERVICE_CONFIGS[selectedService];
    
    if (!config) return null;

    const protocol = config.protocol;
    const path = config.path;
    
    return `${protocol}://${currentIP}:${port}${path}`;
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
        qrCodeContainer.innerHTML = '';
        
        new QRious({
            element: document.createElement('canvas'),
            value: url,
            size: 180,
            foreground: getComputedStyle(document.documentElement).getPropertyValue('--qr-dark').trim(),
            background: getComputedStyle(document.documentElement).getPropertyValue('--qr-light').trim()
        });
        
        qrCodeContainer.appendChild(qr.element);
    } catch (error) {
        console.error('QRコード生成エラー:', error);
        qrCodeContainer.innerHTML = `<div style="width: 180px; height: 180px; background: var(--text-color); margin: 0 auto; display: flex; align-items: center; justify-content: center; color: var(--block-bg); font-size: 12px;"><span data-i18n="qrCodeArea">${translations[currentLanguage].qrCodeArea}</span></div>`;
    }
}

// ==================================================
// テーマ切り替え機能
// ==================================================
function applyTheme(theme) {
    const html = document.documentElement;
    
    if (theme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        html.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
        html.setAttribute('data-theme', theme);
    }
    
    currentTheme = theme;
    localStorage.setItem('theme', theme);
    
    setTimeout(updateBrowserDisplay, 100);
}

// ==================================================
// 多言語対応機能
// ==================================================
function updateLanguage(lang) {
    currentLanguage = lang;
    localStorage.setItem('language', lang);
    
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (translations[lang] && translations[lang][key]) {
            const linkTextSpan = element.querySelector('.link-text');
            if (linkTextSpan) {
                 linkTextSpan.textContent = translations[lang][key];
            } else {
                 element.textContent = translations[lang][key];
            }
        }
    });
}

// ==================================================
// 共通更新機能
// ==================================================
function updateAllDisplays() {
    // SSH関連のIP表示とリンクを更新
    document.querySelectorAll('.ssh-ip-display').forEach(span => {
        span.textContent = currentIP;
    });

    document.querySelectorAll('a[data-ip-template]').forEach(link => {
        const template = link.dataset.ipTemplate;
        if (template) {
            let newHref = template.replace(/\${ip}/g, currentIP);
            if (link.id === 'aios-link') {
                newHref = newHref.replace(/\${cmd}/g, SSH_CMD_ENCODED_AIOS);
            }
            link.href = newHref;
        }
    });
    
    updateBrowserDisplay();
}

// ==================================================
// ヘッダー・フッター対応（動的読み込み用）
// ==================================================
// (省略：ユーザー提供のコードには含まれていないため、変更なし)

// システムテーマ変更の監視
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
    if (currentTheme === 'auto') {
        applyTheme('auto');
    }
});
