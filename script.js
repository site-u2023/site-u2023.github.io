// ==================================================
// グローバル変数と定数
// ==================================================
let currentLanguage = 'en';
let currentTheme = 'auto';

// デフォルト設定（キャッシュクリア時の復元用）
const DEFAULT_ADDRESSES = [
    '192.168.1.1',
    'openwrt.lan',
    '10.0.0.1'
];

const DEFAULT_SERVICES = {
    luci: { name: 'LuCI', port: '80', protocol: 'http' },
    ttyd: { name: 'ttyd', port: '7681', protocol: 'http' },
    filebrowser: { name: 'filebrowser', port: '8080', protocol: 'http' },
    adguard: { name: 'AdGuard', port: '3000', protocol: 'http' }
};

const DEFAULT_TERMINALS = {
    ssh: { name: 'SSH', command: '' },
    aios: { name: 'aios', command: 'if [ -f /usr/bin/aios ]; then /usr/bin/aios; else wget -O /usr/bin/aios https://raw.githubusercontent.com/site-u2023/aios/main/aios && chmod +x /usr/bin/aios && /usr/bin/aios; fi' }
};

// 現在の設定（localStorage と DEFAULT をマージして使用）
let currentAddresses = [];
let currentServices = {};
let currentTerminals = {};
let currentIP = '192.168.1.1';

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
        downloadHandlerButton: 'ダウンロード（ダウンロードしたsshcmd.regをダブルクリックしてインストールして下さい）',
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
        sshHandler: 'Protocol Handler Registration (First time only)',
        downloadHandlerButton: 'Download (Double-click the downloaded sshcmd.reg to install it)',
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
    const savedLanguage = localStorage.getItem('language') || 'en';
    currentLanguage = savedLanguage;
    
    // 翻訳を適用
    updateLanguageDisplay();
    
    // テーマ設定の復元
    const savedTheme = localStorage.getItem('theme') || 'auto';
    currentTheme = savedTheme;
    applyTheme(currentTheme);
    
    // アドレス設定の復元
    const savedAddresses = localStorage.getItem('addresses');
    currentAddresses = savedAddresses ? JSON.parse(savedAddresses) : [...DEFAULT_ADDRESSES];
    
    // サービス設定の復元
    const savedServices = localStorage.getItem('services');
    currentServices = savedServices ? JSON.parse(savedServices) : {...DEFAULT_SERVICES};
    
    // ターミナル設定の復元
    const savedTerminals = localStorage.getItem('terminals');
    currentTerminals = savedTerminals ? JSON.parse(savedTerminals) : {...DEFAULT_TERMINALS};
    
    // 現在のIPアドレスの復元
    const savedIP = localStorage.getItem('currentIP');
    if (savedIP) {
        currentIP = savedIP;
    } else {
        currentIP = currentAddresses[0] || '192.168.1.1';
    }
    
    // UI要素の初期化
    updateAddressSelector();
    updateServiceSelector();
    updateTerminalSelector();
    
    const ipInput = document.getElementById('global-ip-input');
    if (ipInput) {
        ipInput.value = currentIP;
    }
}

function bindEvents() {
    // IPアドレス関連
    const ipInput = document.getElementById('global-ip-input');
    const globalIpUpdate = document.getElementById('global-ip-update');
    const addressAdd = document.getElementById('address-add');
    const addressRemove = document.getElementById('address-remove');
    
    if (ipInput) {
        ipInput.addEventListener('input', function() {
            currentIP = this.value;
            localStorage.setItem('currentIP', currentIP);
            updateAllDisplays();
        });
    }
    
    if (globalIpUpdate) {
        globalIpUpdate.addEventListener('click', function() {
            if (ipInput) {
                currentIP = ipInput.value.trim();
                localStorage.setItem('currentIP', currentIP);
                updateAllDisplays();
            }
        });
    }
    
    if (addressAdd) {
        addressAdd.addEventListener('click', function() {
            const newAddress = prompt('新しいIPアドレスまたはホスト名を入力してください:', '192.168.1.2');
            if (newAddress && newAddress.trim()) {
                currentAddresses.push(newAddress.trim());
                localStorage.setItem('addresses', JSON.stringify(currentAddresses));
                updateAddressSelector();
            }
        });
    }
    
    if (addressRemove) {
        addressRemove.addEventListener('click', function() {
            if (currentAddresses.length > 1) {
                const currentValue = ipInput ? ipInput.value : currentIP;
                const index = currentAddresses.indexOf(currentValue);
                if (index > -1) {
                    currentAddresses.splice(index, 1);
                    localStorage.setItem('addresses', JSON.stringify(currentAddresses));
                    currentIP = currentAddresses[0];
                    localStorage.setItem('currentIP', currentIP);
                    if (ipInput) ipInput.value = currentIP;
                    updateAddressSelector();
                    updateAllDisplays();
                }
            } else {
                alert('最低1つのアドレスは必要です。');
            }
        });
    }
    
    // ブラウザ関連
    const serviceSelector = document.getElementById('service-selector');
    const portInput = document.getElementById('port-input');
    const browserUpdate = document.getElementById('browser-update');
    const openCurrentUrl = document.getElementById('open-current-url');
    const serviceAdd = document.getElementById('service-add');
    const serviceRemove = document.getElementById('service-remove');
    
    if (serviceSelector) {
        serviceSelector.addEventListener('change', updateServicePort);
    }
    
    if (portInput) {
        portInput.addEventListener('input', function() {
            const serviceSelector = document.getElementById('service-selector');
            if (serviceSelector) {
                const selectedService = serviceSelector.value;
                if (currentServices[selectedService]) {
                    currentServices[selectedService].port = this.value;
                    localStorage.setItem('services', JSON.stringify(currentServices));
                }
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
    
    if (serviceAdd) {
        serviceAdd.addEventListener('click', function() {
            const serviceName = prompt('サービス名を入力してください:', 'custom');
            if (serviceName && serviceName.trim()) {
                const serviceKey = serviceName.toLowerCase().replace(/[^a-z0-9]/g, '');
                const port = prompt('ポート番号を入力してください:', '8080');
                const protocol = prompt('プロトコルを入力してください (http/https):', 'http');
                
                if (serviceKey && port) {
                    currentServices[serviceKey] = {
                        name: serviceName.trim(),
                        port: port.trim(),
                        protocol: protocol.trim()
                    };
                    localStorage.setItem('services', JSON.stringify(currentServices));
                    updateServiceSelector();
                    
                    // 新しく追加したサービスを選択
                    if (serviceSelector) {
                        serviceSelector.value = serviceKey;
                        updateServicePort();
                    }
                }
            }
        });
    }
    
    if (serviceRemove) {
        serviceRemove.addEventListener('click', function() {
            const selectedService = serviceSelector ? serviceSelector.value : null;
            if (selectedService && Object.keys(currentServices).length > 1) {
                if (confirm(`サービス "${currentServices[selectedService].name}" を削除しますか？`)) {
                    delete currentServices[selectedService];
                    localStorage.setItem('services', JSON.stringify(currentServices));
                    updateServiceSelector();
                }
            } else if (Object.keys(currentServices).length <= 1) {
                alert('最低1つのサービスは必要です。');
            }
        });
    }
    
    // ターミナル関連
    const terminalSelector = document.getElementById('terminal-selector');
    const commandInput = document.getElementById('command-input');
    const terminalUpdate = document.getElementById('terminal-update');
    const openTerminal = document.getElementById('open-terminal');
    const terminalAdd = document.getElementById('terminal-add');
    const terminalRemove = document.getElementById('terminal-remove');
    
    if (terminalSelector) {
        terminalSelector.addEventListener('change', updateTerminalCommand);
    }
    
    if (commandInput) {
        commandInput.addEventListener('input', function() {
            const terminalSelector = document.getElementById('terminal-selector');
            if (terminalSelector) {
                const selectedType = terminalSelector.value;
                if (currentTerminals[selectedType]) {
                    currentTerminals[selectedType].command = this.value;
                    localStorage.setItem('terminals', JSON.stringify(currentTerminals));
                }
            }
            updateTerminalPreview();
        });
        
        commandInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                updateTerminalDisplay();
            }
        });
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
                console.log('Generated Terminal URL:', url);
                window.location.href = url;
            }
        });
    }
    
    if (terminalAdd) {
        terminalAdd.addEventListener('click', function() {
            const terminalName = prompt('ターミナルタイプ名を入力してください:', 'custom');
            if (terminalName && terminalName.trim()) {
                const terminalKey = terminalName.toLowerCase().replace(/[^a-z0-9]/g, '');
                const command = prompt('デフォルトコマンドを入力してください (空欄可):', '');
                
                if (terminalKey) {
                    currentTerminals[terminalKey] = {
                        name: terminalName.trim(),
                        command: command ? command.trim() : ''
                    };
                    localStorage.setItem('terminals', JSON.stringify(currentTerminals));
                    updateTerminalSelector();
                    
                    // 新しく追加したターミナルを選択
                    if (terminalSelector) {
                        terminalSelector.value = terminalKey;
                        updateTerminalCommand();
                    }
                }
            }
        });
    }
    
    if (terminalRemove) {
        terminalRemove.addEventListener('click', function() {
            const selectedTerminal = terminalSelector ? terminalSelector.value : null;
            if (selectedTerminal && Object.keys(currentTerminals).length > 1) {
                if (confirm(`ターミナルタイプ "${currentTerminals[selectedTerminal].name}" を削除しますか？`)) {
                    delete currentTerminals[selectedTerminal];
                    localStorage.setItem('terminals', JSON.stringify(currentTerminals));
                    updateTerminalSelector();
                }
            } else if (Object.keys(currentTerminals).length <= 1) {
                alert('最低1つのターミナルタイプは必要です。');
            }
        });
    }
}

// ==================================================
// アドレス管理機能
// ==================================================
function updateAddressSelector() {
    // アドレスセレクタは現在HTMLに存在しないため、
    // 将来的にドロップダウン形式にする場合の準備
    // 現在は入力フィールドのみ使用
    
    // IPアドレス入力フィールドが現在のアドレスリストに含まれていない場合は追加
    const ipInput = document.getElementById('global-ip-input');
    if (ipInput && currentIP && !currentAddresses.includes(currentIP)) {
        currentAddresses.push(currentIP);
        localStorage.setItem('addresses', JSON.stringify(currentAddresses));
    }
}

// ==================================================
// サービス管理機能
// ==================================================
function updateServiceSelector() {
    const serviceSelector = document.getElementById('service-selector');
    if (!serviceSelector) return;
    
    // 現在の選択を保存
    const currentSelection = serviceSelector.value;
    
    // セレクタをクリア
    serviceSelector.innerHTML = '';
    
    // サービス一覧を追加
    Object.keys(currentServices).forEach(key => {
        const service = currentServices[key];
        const option = document.createElement('option');
        option.value = key;
        option.textContent = service.name;
        serviceSelector.appendChild(option);
    });
    
    // 可能であれば以前の選択を復元、そうでなければ最初の項目を選択
    if (currentSelection && currentServices[currentSelection]) {
        serviceSelector.value = currentSelection;
    } else if (Object.keys(currentServices).length > 0) {
        serviceSelector.value = Object.keys(currentServices)[0];
    }
    
    updateServicePort();
}

function updateServicePort() {
    const serviceSelector = document.getElementById('service-selector');
    const portInput = document.getElementById('port-input');
    
    if (serviceSelector && portInput) {
        const selectedService = serviceSelector.value;
        const service = currentServices[selectedService];
        
        if (service) {
            portInput.value = service.port;
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
    const service = currentServices[selectedService];
    const port = portInput.value || '80';
    const protocol = service ? service.protocol : 'http';
    
    return `${protocol}://${currentIP}:${port}`;
}

// ==================================================
// ターミナル管理機能
// ==================================================
function updateTerminalSelector() {
    const terminalSelector = document.getElementById('terminal-selector');
    if (!terminalSelector) return;
    
    // 現在の選択を保存
    const currentSelection = terminalSelector.value;
    
    // セレクタをクリア
    terminalSelector.innerHTML = '';
    
    // ターミナル一覧を追加
    Object.keys(currentTerminals).forEach(key => {
        const terminal = currentTerminals[key];
        const option = document.createElement('option');
        option.value = key;
        option.textContent = terminal.name;
        terminalSelector.appendChild(option);
    });
    
    // 可能であれば以前の選択を復元、そうでなければ最初の項目を選択
    if (currentSelection && currentTerminals[currentSelection]) {
        terminalSelector.value = currentSelection;
    } else if (Object.keys(currentTerminals).length > 0) {
        terminalSelector.value = Object.keys(currentTerminals)[0];
    }
    
    updateTerminalCommand();
}

function updateTerminalCommand() {
    const terminalSelector = document.getElementById('terminal-selector');
    const commandInput = document.getElementById('command-input');
    if (!terminalSelector || !commandInput) return;

    const type = terminalSelector.value;
    const terminal = currentTerminals[type];

    if (terminal) {
        commandInput.value = terminal.command;
    }

    updateTerminalDisplay();
}

function updateTerminalDisplay() {
    updateTerminalPreview();
}

function updateTerminalPreview() {
    const previewElement = document.getElementById('command-preview');
    if (previewElement) {
        const generatedURL = generateTerminalURL();
        previewElement.textContent = generatedURL || '';
    }
}

function generateTerminalURL() {
    const commandInput = document.getElementById('command-input');
    const terminalSelector = document.getElementById('terminal-selector');
    
    if (!commandInput || !terminalSelector) return null;

    const selectedType = terminalSelector.value;
    const terminal = currentTerminals[selectedType];
    let fullCommand = commandInput.value.trim();

    // コマンド欄が空の場合はデフォルトを使用
    if (!fullCommand && terminal) {
        fullCommand = terminal.command;
    }

    let baseURL = `sshcmd://root@${currentIP}`;
    if (!fullCommand) return baseURL;
    
    const encodedCommand = encodeURIComponent(fullCommand);
    return `${baseURL}/${encodedCommand}`;
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
function updateLogo() {
    const logoImg = document.getElementById('site-logo');
    if (!logoImg) return;
    
    const currentThemeAttr = document.documentElement.getAttribute('data-theme');
    
    if (currentThemeAttr === 'dark') {
        logoImg.src = 'img/openwrt_text_white_and_blue.svg';
    } else {
        logoImg.src = 'img/openwrt_text_blue_and_dark_blue.svg';
    }
}

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
    
    updateLogo();
    setTimeout(updateQRCode, 100);
}

// ==================================================
// 多言語対応機能
// ==================================================
function updateLanguageDisplay() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (translations[currentLanguage] && translations[currentLanguage][key]) {
            element.textContent = translations[currentLanguage][key];
        }
    });
}

function updateLanguage(lang) {
    currentLanguage = lang;
    localStorage.setItem('language', lang);
    updateLanguageDisplay();
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
    updateLogo();
}

function bindFooterEvents() {
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
    
    updateLogo();
});
