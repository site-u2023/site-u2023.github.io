// R7.1119.0912
// ==================================================
// グローバル変数と定数
// ==================================================
let currentLanguage = 'en';
let currentTheme = 'auto';
// デフォルト設定（キャッシュクリア時の復元用）
const DEFAULT_ADDRESSES = [
    '192.168.1.1',
    '192.168.0.1',
    '192.168.10.1',
    '192.168.100.1',
    'openwrt.lan',
    '10.0.0.1',
    '172.16.0.1'
];
const DEFAULT_SERVICES = {
    luci: { name: 'LuCI', port: '80', protocol: 'http' },
    ttyd: { name: 'ttyd', port: '7681', protocol: 'http' },
    filebrowser: { name: 'filebrowser', port: '8080', protocol: 'http' },
    adguard: { name: 'AdGuardHome', port: '8000', protocol: 'http' },
    netdata: { name: 'netdata', port: '19999', protocol: 'http' }
};
const AIOS_URL = 'https://raw.githubusercontent.com/site-u2023/aios/main/aios';
const AIOS_URL2 = 'https://site-u.pages.dev/www/aios2.sh';
const PROXY_URL = 'https://proxy.site-u.workers.dev/proxy?url=';
const BASE_DIR = '/tmp/aios';
const BASE_DIR2 = '/tmp/aios2';
const AIOS_PATH = `${BASE_DIR}/aios`;
const AIOS_PATH2 = `${BASE_DIR2}/aios2.sh`;
const SSHCMD_REG_URL = 'https://site-u.pages.dev/build/scripts/sshcmd.reg';
const DEFAULT_TERMINALS = {
  aios2: {
    name: 'aios2',
    command: `mkdir -p ${BASE_DIR2}; wget --no-check-certificate -O ${AIOS_PATH2} ${AIOS_URL2} && chmod +x ${AIOS_PATH2} && ${AIOS_PATH2}`
  },
  aios: {
    name: 'aios (Old version)',
    command: `mkdir -p ${BASE_DIR}; wget --no-check-certificate -O ${AIOS_PATH} "${PROXY_URL}${AIOS_URL}" && chmod +x ${AIOS_PATH} && ${AIOS_PATH}`
  },
  ssh: {
    name: 'SSH',
    command: ''
  }
};

const DEFAULT_SETUP_LINKS = {
    windows: 'file/sshcmd.reg',
    iphone: 'https://apps.apple.com/app/termius/id549039908',
    android: 'https://play.google.com/store/apps/details?id=com.sonelli.juicessh'
};

// プロンプト用デフォルト値（一元管理）
const PROMPT_DEFAULTS = {
    newAddress: '192.168.1.2',
    serviceName: 'custom',
    portNumber: '10000',
    protocol: 'http',
    terminalName: 'custom',
    defaultCommand: '',
    setupName: 'custom',
    setupLink: 'https://example.com'
};

// 現在の設定（localStorage と DEFAULT をマージして使用）
let currentAddresses = [];
let currentServices = {};
let currentTerminals = {};
let currentSetupLinks = {};
let currentIP = '192.168.1.1';
let currentSelectedService = 'luci';
let currentSelectedTerminal = 'aios';
let currentSelectedSetup = 'windows';

// Multi-language Support
const translations = {
    ja: {
        address: 'アドレス',
        browser: 'ブラウザ',
        terminal: 'ターミナル (Windows用)',
        initialSetup: '初期設定 (ターミナル用)',
        apply: '適用',
        open: '開く',
        qrCodeDisplay: 'QRコード',
        qrCodeArea: 'QRコード表示エリア',
        OpenWrtCustom: 'キッティングツール（カスタムビルダー）',
        firmwareDownload: 'デバイス用のOpenWtファームウェアをダウンロード',
        githubRepo: 'コンソールツール (旧版)',
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
        langJa: '日本語',
        // Terminal Explanations
        aiosExplanation: 'メニュー式スクリプト (旧版)',
        aiosExplanationLink: 'https://github.com/site-u2023/aios/blob/main/aios',
        aios2Explanation: '永続化インストールスクリプト',
        aios2ExplanationLink: 'https://github.com/site-u2023/site-u2023.github.io/blob/main/www/aios2-install.sh',
        sshExplanation: 'SSHログイン',
        // iPhone
        termius: 'Termius (SSH)',
        appStore: 'App Storeで開く',
        connectNote: 'ダウンロード後、設定したIPアドレスでSSH接続して下さい',
        // Android
        juiceSSH: 'JuiceSSH',
        googlePlay: 'Google Playで開く',
        // Setup Explanations
        windowsSetupExplanation: 'プロトコルハンドラー登録 (レジストリファイルをダウンロードし、ダブルクリックしてインストールして下さい)',
        iphoneSetupExplanation: 'Termiusインストール (App StoreからTermiusをインストールし、設定したIPアドレスでSSH接続して下さい)',
        androidSetupExplanation: 'JuiceSSHインストール (Google PlayからJuiceSSHをインストールし、設定したIPアドレスでSSH接続して下さい)',
        // Dialog Messages - 日本語追加
        promptNewAddress: '新しいIPアドレスまたはホスト名を入力して下さい:',
        alertMinimumAddress: '最低1つのアドレスは必要です',
        promptServiceName: 'サービス名を入力してください:',
        promptPortNumber: 'ポート番号を入力してください:',
        promptProtocol: 'プロトコル（http/https）を入力してください:',
        confirmDeleteService: 'サービス "{0}" を削除しますか？',
        alertMinimumService: '最低1つのサービスは必要です',
        promptTerminalName: 'ターミナル名を入力してください:',
        promptDefaultCommand: 'デフォルトコマンドを入力してください:',
        confirmDeleteTerminal: 'ターミナル "{0}" を削除しますか？',
        alertMinimumTerminal: '最低1つのターミナルは必要です',
        promptSetupName: '初期設定名を入力してください:',
        promptSetupLink: 'リンクまたはファイルパスを入力してください:',
        confirmDeleteSetup: '初期設定 "{0}" を削除しますか？',
        alertMinimumSetup: '最低1つの初期設定は必要です',
        promptItemName: '項目名を入力してください:',
        promptValue: '値を入力してください:',
        alertMinimumItem: '最低1つの項目は必要です',
        confirmDeleteItem: '項目 "{0}" を削除します'
    },
    en: {
        address: 'Address',
        browser: 'Browser',
        terminal: 'Terminal (for Windows)',
        initialSetup: 'Initial Setup (for Terminal)',
        apply: 'Apply',
        open: 'Open',
        qrCodeDisplay: 'QR Code',
        qrCodeArea: 'QR Code Display Area',
        explanation: 'Explanation',
        OpenWrtCustom: 'Kitting Tools (Custom Builder)',
        firmwareDownload: 'Download OpenWrt firmware for your device',
        githubRepo: 'Console Tools (Old version)',
        aiosScript: 'all in one script',
        configSoftware: 'config software',
        disclaimerPageTitle: 'Disclaimer',
        disclaimerSiteUTitle: 'Disclaimer regarding site-u (this site)',
        disclaimerOpenWrtTitle: 'Disclaimer regarding OpenWrt',
        disclaimerSiteUParagraph: 'All content published on this site (including websites, scripts, and other works) is open and available for free use. However, the site operator assumes no responsibility for any damages arising from the use of this content. Please use at your own risk.',
        disclaimerOpenWrtParagraph: 'OpenWrt is a registered trademark of Software Freedom Conservancy. This site is not affiliated with or endorsed by the OpenWrt project. For official information and support regarding OpenWrt, please refer to the official OpenWrt website.',
        footerMemo: 'OpenWrt A Beginner\'s Notebook',
        footerCopyright: '© site-u',
        footerDisclaimer: 'Disclaimer',
        langEn: 'English',
        langJa: '日本語',
        // Terminal Explanations
        aiosExplanation: 'Menu-based script (Old version)',
        aiosExplanationLink: 'https://github.com/site-u2023/aios/blob/main/aios',
        aios2Explanation: 'Persistent installation script',
        aios2ExplanationLink: 'https://github.com/site-u2023/site-u2023.github.io/blob/main/www/aios2-install.sh',
        sshExplanation: 'SSH login',
        // iPhone
        termius: 'Termius (SSH)',
        appStore: 'Open in App Store',
        connectNote: 'After download, please connect via SSH using your configured IP address',
        // Android
        juiceSSH: 'JuiceSSH',
        googlePlay: 'Open in Google Play',
        // Setup Explanations
        setupExplanation: 'Explanation',
        windowsSetupExplanation: 'Protocol handler registration (Please download the registry file and double-click to install)',
        iphoneSetupExplanation: 'Termius installation (Please install Termius from App Store and connect via SSH using your configured IP address)',
        androidSetupExplanation: 'JuiceSSH installation (Please install JuiceSSH from Google Play and connect via SSH using your configured IP address)',
        // Dialog Messages
        promptNewAddress: 'Please enter a new IP address or hostname:',
        alertMinimumAddress: 'At least one address is required',
        promptServiceName: 'Please enter service name:',
        promptPortNumber: 'Please enter port number:',
        promptProtocol: 'Please enter protocol (http/https):',
        confirmDeleteService: 'Delete service "{0}"?',
        alertMinimumService: 'At least one service is required',
        promptTerminalName: 'Please enter terminal name:',
        promptDefaultCommand: 'Please enter default command:',
        confirmDeleteTerminal: 'Delete terminal "{0}"?',
        alertMinimumTerminal: 'At least one terminal is required',
        promptSetupName: 'Please enter setup name:',
        promptSetupLink: 'Please enter link or file path:',
        confirmDeleteSetup: 'Delete setup "{0}"?',
        alertMinimumSetup: 'At least one setup is required',
        promptItemName: 'Please enter item name:',
        promptValue: 'Please enter value:',
        alertMinimumItem: 'At least one item is required',
        confirmDeleteItem: 'Deleting item "{0}"'
    }
};

// 翻訳テキスト取得関数
function getText(key, ...args) {
    let text = translations[currentLanguage][key] || translations['en'][key] || key;
    // {0}, {1} などのプレースホルダーを置換
    args.forEach((arg, index) => {
        text = text.replace(`{${index}}`, arg);
    });
    return text;
}

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
    
    // 初期設定リンクの復元
    const savedSetupLinks = localStorage.getItem('setupLinks');
    currentSetupLinks = savedSetupLinks ? JSON.parse(savedSetupLinks) : {...DEFAULT_SETUP_LINKS};
    
    // **修正: 保存された現在のIPアドレスを確実に復元**
    const savedIP = localStorage.getItem('currentIP');
    if (savedIP && savedIP.trim()) {
        currentIP = savedIP;
        // 保存されたIPが現在のアドレス一覧にない場合は追加
        if (!currentAddresses.includes(currentIP)) {
            currentAddresses.unshift(currentIP);
            localStorage.setItem('addresses', JSON.stringify(currentAddresses));
        }
    } else {
        currentIP = currentAddresses[0] || '192.168.1.1';
    }
    
    // **修正: 保存された現在選択中のサービスを確実に復元**
    const savedService = localStorage.getItem('currentSelectedService');
    if (savedService && currentServices[savedService]) {
        currentSelectedService = savedService;
    } else {
        currentSelectedService = Object.keys(currentServices)[0] || 'luci';
    }
    
    // **修正: 保存された現在選択中のターミナルを確実に復元**
    const savedTerminal = localStorage.getItem('currentSelectedTerminal');
    if (savedTerminal && currentTerminals[savedTerminal]) {
        currentSelectedTerminal = savedTerminal;
    } else {
        currentSelectedTerminal = Object.keys(currentTerminals)[0] || 'aios';
    }
    
    // 初期設定セクションの復元
    const savedSetup = localStorage.getItem('currentSelectedSetup');
    if (savedSetup && currentSetupLinks[savedSetup]) {
        currentSelectedSetup = savedSetup;
    } else {
        currentSelectedSetup = Object.keys(currentSetupLinks)[0] || 'windows';
    }
    
    // UI要素の初期化
    updateAddressSelector();
    updateServiceSelector();
    updateTerminalSelector();
    updateSetupSelector();
    
    // **修正: より確実な値の設定**
    setTimeout(() => {
        restoreUIValues();
    }, 10);
}

// **新規追加: UI要素の値を確実に復元する関数**
function restoreUIValues() {
    const ipSelector = document.getElementById('global-ip-input');
    if (ipSelector) {
        ipSelector.value = currentIP;
        console.log('IP selector restored to:', currentIP);
    }
    
    const serviceSelector = document.getElementById('service-selector');
    if (serviceSelector) {
        serviceSelector.value = currentSelectedService;
        console.log('Service selector restored to:', currentSelectedService);
    }
    
    const terminalSelector = document.getElementById('terminal-selector');
    if (terminalSelector) {
        terminalSelector.value = currentSelectedTerminal;
        console.log('Terminal selector restored to:', currentSelectedTerminal);
    }
    
    const setupSelector = document.getElementById('setup-selector');
    if (setupSelector) {
        setupSelector.value = currentSelectedSetup;
        console.log('Setup selector restored to:', currentSelectedSetup);
    }
    
    // 各要素の表示を更新
    updateServicePort();
    updateTerminalCommand();
    updateSetupContent();
    updateTerminalExplanation();
}

function bindEvents() {
    // IPアドレス関連
    const ipSelector = document.getElementById('global-ip-input');
    const globalIpUpdate = document.getElementById('global-ip-update');
    const addressAdd = document.getElementById('address-add');
    const addressRemove = document.getElementById('address-remove');
    
    if (ipSelector) {
        ipSelector.addEventListener('change', function() {
            currentIP = this.value;
            localStorage.setItem('currentIP', currentIP);
            console.log('IP changed to:', currentIP);
            updateAllDisplays();
        });
    }
    
    if (globalIpUpdate) {
        globalIpUpdate.addEventListener('click', function() {
            if (ipSelector) {
                currentIP = ipSelector.value;
                localStorage.setItem('currentIP', currentIP);
                console.log('IP updated to:', currentIP);
                updateAllDisplays();
            }
        });
    }
    
    if (addressAdd) {
        addressAdd.addEventListener('click', function() {
            const newAddress = prompt(getText('promptNewAddress'), PROMPT_DEFAULTS.newAddress);
            if (newAddress && newAddress.trim()) {
                const trimmedAddress = newAddress.trim();
                if (!currentAddresses.includes(trimmedAddress)) {
                    currentAddresses.push(trimmedAddress);
                    localStorage.setItem('addresses', JSON.stringify(currentAddresses));
                    
                    // 新しく追加したアドレスを選択
                    currentIP = trimmedAddress;
                    localStorage.setItem('currentIP', currentIP);
                    
                    updateAddressSelector();
                    
                    // セレクタの値を確実に設定
                    setTimeout(() => {
                        if (ipSelector) {
                            ipSelector.value = currentIP;
                        }
                        updateAllDisplays();
                    }, 10);
                }
            }
        });
    }
    
    if (addressRemove) {
        addressRemove.addEventListener('click', function() {
            if (currentAddresses.length > 1) {
                const currentValue = ipSelector ? ipSelector.value : currentIP;
                const index = currentAddresses.indexOf(currentValue);
                if (index > -1) {
                    currentAddresses.splice(index, 1);
                    localStorage.setItem('addresses', JSON.stringify(currentAddresses));
                    
                    // 削除後の新しい選択値を設定
                    currentIP = currentAddresses[0];
                    localStorage.setItem('currentIP', currentIP);
                    
                    updateAddressSelector();
                    
                    // セレクタの値を確実に設定
                    setTimeout(() => {
                        if (ipSelector) {
                            ipSelector.value = currentIP;
                        }
                        updateAllDisplays();
                    }, 10);
                }
            } else {
                alert(getText('alertMinimumAddress'));
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
        serviceSelector.addEventListener('change', function() {
            currentSelectedService = this.value;
            localStorage.setItem('currentSelectedService', currentSelectedService);
            console.log('Service changed to:', currentSelectedService);
            updateServicePort();
        });
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
            const serviceName = prompt(getText('promptServiceName'), PROMPT_DEFAULTS.serviceName);
            if (serviceName && serviceName.trim()) {
                const serviceKey = serviceName.toLowerCase().replace(/[^a-z0-9]/g, '');
                const port = prompt(getText('promptPortNumber'), PROMPT_DEFAULTS.portNumber);
                const protocol = prompt(getText('promptProtocol'), PROMPT_DEFAULTS.protocol);
                
                if (serviceKey && port && !currentServices[serviceKey]) {
                    currentServices[serviceKey] = {
                        name: serviceName.trim(),
                        port: port.trim(),
                        protocol: protocol.trim() || 'http'
                    };
                    localStorage.setItem('services', JSON.stringify(currentServices));
                    
                    // 新しく追加したサービスを選択
                    currentSelectedService = serviceKey;
                    localStorage.setItem('currentSelectedService', currentSelectedService);
                    
                    updateServiceSelector();
                    
                    // セレクタの値を確実に設定
                    setTimeout(() => {
                        if (serviceSelector) {
                            serviceSelector.value = currentSelectedService;
                        }
                        updateServicePort();
                    }, 10);
                }
            }
        });
    }
    
    if (serviceRemove) {
        serviceRemove.addEventListener('click', function() {
            const selectedService = serviceSelector ? serviceSelector.value : currentSelectedService;
            if (selectedService && Object.keys(currentServices).length > 1) {
                if (confirm(getText('confirmDeleteService', currentServices[selectedService].name))) {
                    delete currentServices[selectedService];
                    localStorage.setItem('services', JSON.stringify(currentServices));
                    
                    // 削除後の新しい選択値を設定
                    currentSelectedService = Object.keys(currentServices)[0];
                    localStorage.setItem('currentSelectedService', currentSelectedService);
                    
                    updateServiceSelector();
                    
                    // セレクタの値を確実に設定
                    setTimeout(() => {
                        if (serviceSelector) {
                            serviceSelector.value = currentSelectedService;
                        }
                        updateServicePort();
                    }, 10);
                }
            } else if (Object.keys(currentServices).length <= 1) {
                alert(getText('alertMinimumService'));
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
        terminalSelector.addEventListener('change', function() {
            currentSelectedTerminal = this.value;
            localStorage.setItem('currentSelectedTerminal', currentSelectedTerminal);
            console.log('Terminal changed to:', currentSelectedTerminal);
            updateTerminalCommand();
        });
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
            const terminalName = prompt(getText('promptTerminalName'), PROMPT_DEFAULTS.terminalName);
            if (terminalName && terminalName.trim()) {
                const terminalKey = terminalName.toLowerCase().replace(/[^a-z0-9]/g, '');
                const command = prompt(getText('promptDefaultCommand'), PROMPT_DEFAULTS.defaultCommand);
                
                if (terminalKey && !currentTerminals[terminalKey]) {
                    currentTerminals[terminalKey] = {
                        name: terminalName.trim(),
                        command: command ? command.trim() : ''
                    };
                    localStorage.setItem('terminals', JSON.stringify(currentTerminals));
                    
                    // 新しく追加したターミナルを選択
                    currentSelectedTerminal = terminalKey;
                    localStorage.setItem('currentSelectedTerminal', currentSelectedTerminal);
                    
                    updateTerminalSelector();
                    
                    // セレクタの値を確実に設定
                    setTimeout(() => {
                        if (terminalSelector) {
                            terminalSelector.value = currentSelectedTerminal;
                        }
                        updateTerminalCommand();
                    }, 10);
                }
            }
        });
    }
    
    if (terminalRemove) {
        terminalRemove.addEventListener('click', function() {
            const selectedTerminal = terminalSelector ? terminalSelector.value : currentSelectedTerminal;
            if (selectedTerminal && Object.keys(currentTerminals).length > 1) {
                if (confirm(getText('confirmDeleteTerminal', currentTerminals[selectedTerminal].name))) {
                    delete currentTerminals[selectedTerminal];
                    localStorage.setItem('terminals', JSON.stringify(currentTerminals));
                    
                    // 削除後の新しい選択値を設定
                    currentSelectedTerminal = Object.keys(currentTerminals)[0];
                    localStorage.setItem('currentSelectedTerminal', currentSelectedTerminal);
                    
                    updateTerminalSelector();
                    
                    // セレクタの値を確実に設定
                    setTimeout(() => {
                        if (terminalSelector) {
                            terminalSelector.value = currentSelectedTerminal;
                        }
                        updateTerminalCommand();
                    }, 10);
                }
            } else if (Object.keys(currentTerminals).length <= 1) {
                alert(getText('alertMinimumTerminal'));
            }
        });
    }
    
    // 初期設定関連のイベントリスナー（修正：実装を追加）
    const setupSelector = document.getElementById('setup-selector');
    const setupLinkInput = document.getElementById('setup-link-input');
    const setupUpdate = document.getElementById('setup-update');
    const openSetup = document.getElementById('open-setup');
    const setupAdd = document.getElementById('setup-add');
    const setupRemove = document.getElementById('setup-remove');
    
    if (setupSelector) {
        setupSelector.addEventListener('change', function() {
            currentSelectedSetup = this.value;
            localStorage.setItem('currentSelectedSetup', currentSelectedSetup);
            console.log('Setup changed to:', currentSelectedSetup);
            updateSetupContent();
        });
    }
    
    if (setupLinkInput) {
        setupLinkInput.addEventListener('input', function() {
            const setupSelector = document.getElementById('setup-selector');
            if (setupSelector) {
                const selectedSetup = setupSelector.value;
                if (currentSetupLinks[selectedSetup]) {
                    currentSetupLinks[selectedSetup] = this.value;
                    localStorage.setItem('setupLinks', JSON.stringify(currentSetupLinks));
                }
            }
        });
    }
    
    if (setupUpdate) {
        setupUpdate.addEventListener('click', function() {
            updateSetupContent();
        });
    }
    
    if (openSetup) {
        openSetup.addEventListener('click', function() {
            const linkInput = document.getElementById('setup-link-input');
            if (linkInput && linkInput.value) {
                openSetupLink(linkInput.value);
            }
        });
    }
    
    // 修正：初期設定の追加機能
    if (setupAdd) {
        setupAdd.addEventListener('click', function() {
            const setupName = prompt(getText('promptSetupName'), PROMPT_DEFAULTS.setupName);
            if (setupName && setupName.trim()) {
                const setupKey = setupName.toLowerCase().replace(/[^a-z0-9]/g, '');
                const setupLink = prompt(getText('promptSetupLink'), PROMPT_DEFAULTS.setupLink);
                
                if (setupKey && setupLink && !currentSetupLinks[setupKey]) {
                    currentSetupLinks[setupKey] = setupLink.trim();
                    localStorage.setItem('setupLinks', JSON.stringify(currentSetupLinks));
                    
                    // 新しく追加した初期設定を選択
                    currentSelectedSetup = setupKey;
                    localStorage.setItem('currentSelectedSetup', currentSelectedSetup);
                    
                    updateSetupSelector();
                    
                    // セレクタの値を確実に設定
                    setTimeout(() => {
                        if (setupSelector) {
                            setupSelector.value = currentSelectedSetup;
                        }
                        updateSetupContent();
                    }, 10);
                }
            }
        });
    }
    
    // 修正：初期設定の削除機能
    if (setupRemove) {
        setupRemove.addEventListener('click', function() {
            const selectedSetup = setupSelector ? setupSelector.value : currentSelectedSetup;
            if (selectedSetup && Object.keys(currentSetupLinks).length > 1) {
                if (confirm(getText('confirmDeleteSetup', selectedSetup))) {
                    delete currentSetupLinks[selectedSetup];
                    localStorage.setItem('setupLinks', JSON.stringify(currentSetupLinks));
                    
                    // 削除後の新しい選択値を設定
                    currentSelectedSetup = Object.keys(currentSetupLinks)[0];
                    localStorage.setItem('currentSelectedSetup', currentSelectedSetup);
                    
                    updateSetupSelector();
                    
                    // セレクタの値を確実に設定
                    setTimeout(() => {
                        if (setupSelector) {
                            setupSelector.value = currentSelectedSetup;
                        }
                        updateSetupContent();
                    }, 10);
                }
            } else if (Object.keys(currentSetupLinks).length <= 1) {
                alert(getText('alertMinimumSetup'));
            }
        });
    }
    
    // SSH Handler ダウンロードリンク
    const sshHandlerDownloadLink = document.getElementById('ssh-handler-download-link');
    if (sshHandlerDownloadLink) {
        sshHandlerDownloadLink.addEventListener('click', function(e) {
            e.preventDefault();
            downloadSSHHandler();
        });
    }
}

// ==================================================
// アドレス管理機能
// ==================================================
function updateAddressSelector() {
    const ipSelector = document.getElementById('global-ip-input');
    if (!ipSelector) return;
    
    // セレクタをクリア
    ipSelector.innerHTML = '';
    
    // アドレス一覧を追加
    currentAddresses.forEach(address => {
        const option = document.createElement('option');
        option.value = address;
        option.textContent = address;
        ipSelector.appendChild(option);
    });
    
    // **修正: 現在のIPが確実に選択されるように**
    if (currentAddresses.includes(currentIP)) {
        ipSelector.value = currentIP;
    } else {
        // 現在のIPがリストにない場合は最初のアドレスを使用
        currentIP = currentAddresses[0] || '192.168.1.1';
        ipSelector.value = currentIP;
        localStorage.setItem('currentIP', currentIP);
    }
}

// ==================================================
// サービス管理機能
// ==================================================
function updateServiceSelector() {
    const serviceSelector = document.getElementById('service-selector');
    if (!serviceSelector) return;
    
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
    
    // **修正: 現在選択中のサービスが確実に選択されるように**
    if (currentServices[currentSelectedService]) {
        serviceSelector.value = currentSelectedService;
    } else {
        // 現在選択中のサービスが存在しない場合は最初のサービスを使用
        currentSelectedService = Object.keys(currentServices)[0] || 'luci';
        serviceSelector.value = currentSelectedService;
        localStorage.setItem('currentSelectedService', currentSelectedService);
    }
}

function updateServicePort() {
    const serviceSelector = document.getElementById('service-selector');
    const portInput = document.getElementById('port-input');
    
    if (serviceSelector && portInput) {
        const selectedService = serviceSelector.value || currentSelectedService;
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
    
    const selectedService = serviceSelector ? serviceSelector.value : currentSelectedService;
    const service = currentServices[selectedService];
    const port = portInput ? portInput.value : (service ? service.port : '80');
    const protocol = service ? service.protocol : 'http';
    
    return `${protocol}://${currentIP}:${port}`;
}

// ==================================================
// ターミナル管理機能
// ==================================================
function updateTerminalSelector() {
    const terminalSelector = document.getElementById('terminal-selector');
    if (!terminalSelector) return;
    
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
    
    // **修正: 現在選択中のターミナルが確実に選択されるように**
    if (currentTerminals[currentSelectedTerminal]) {
        terminalSelector.value = currentSelectedTerminal;
    } else {
        // 現在選択中のターミナルが存在しない場合は最初のターミナルを使用
        currentSelectedTerminal = Object.keys(currentTerminals)[0] || 'aios';
        terminalSelector.value = currentSelectedTerminal;
        localStorage.setItem('currentSelectedTerminal', currentSelectedTerminal);
    }
}

function updateTerminalCommand() {
    const terminalSelector = document.getElementById('terminal-selector');
    const commandInput = document.getElementById('command-input');
    if (!terminalSelector || !commandInput) return;

    const type = terminalSelector.value || currentSelectedTerminal;
    const terminal = currentTerminals[type];

    if (terminal) {
        commandInput.value = terminal.command;
    }

    updateTerminalDisplay();
    
    // 説明文も更新
    updateTerminalExplanation();
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
    
    const selectedType = terminalSelector ? terminalSelector.value : currentSelectedTerminal;
    const terminal = currentTerminals[selectedType];
    let fullCommand = commandInput ? commandInput.value.trim() : '';

    // コマンド欄が空の場合はデフォルトを使用
    if (!fullCommand && terminal) {
        fullCommand = terminal.command;
    }

    let baseURL = `sshcmd://root@${currentIP}`;
    if (!fullCommand) return baseURL;
    
    const encodedCommand = encodeURIComponent(fullCommand);
    return `${baseURL}/${encodedCommand}`;
}

// ターミナル説明文更新機能
function updateTerminalExplanation() {
    const terminalSelector = document.getElementById('terminal-selector');
    const explanationText = document.getElementById('terminal-explanation-text');
    
    if (!terminalSelector || !explanationText) return;
    
    const selectedType = terminalSelector.value || currentSelectedTerminal;
    
    let explanationKey, linkKey;
    switch(selectedType) {
        case 'aios':
            explanationKey = 'aiosExplanation';
            linkKey = 'aiosExplanationLink';
            break;
        case 'aios2':
            explanationKey = 'aios2Explanation';
            linkKey = 'aios2ExplanationLink';
            break;
        case 'ssh':
            explanationKey = 'sshExplanation';
            linkKey = null;
            break;
        default:
            explanationKey = 'aiosExplanation';
            linkKey = 'aiosExplanationLink';
    }
    
    const text = getText(explanationKey);
    const link = linkKey ? getText(linkKey) : null;
    
    explanationText.setAttribute('data-i18n', explanationKey);
    const baseText = getText(explanationKey);
    
    // Windows の場合のみGitHubリンクを下段に追加
    if (selectedType === 'windows') {
        explanationText.innerHTML = baseText + '<br><a href="https://github.com/site-u2023/site-u2023.github.io/blob/main/file/sshcmd.reg" target="_blank" rel="noopener">https://github.com/site-u2023/site-u2023.github.io/blob/main/file/sshcmd.reg</a>';
    } else {
        explanationText.textContent = baseText;
    }
}

// ==================================================
// 初期設定管理機能
// ==================================================

// 修正：初期設定セレクター更新機能を追加
function updateSetupSelector() {
    const setupSelector = document.getElementById('setup-selector');
    if (!setupSelector) return;
    
    // セレクタをクリア
    setupSelector.innerHTML = '';
    
    // 初期設定一覧を追加
    Object.keys(currentSetupLinks).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = key.charAt(0).toUpperCase() + key.slice(1); // 先頭文字を大文字に
        setupSelector.appendChild(option);
    });
    
    // 現在選択中の初期設定が確実に選択されるように
    if (currentSetupLinks[currentSelectedSetup]) {
        setupSelector.value = currentSelectedSetup;
    } else {
        // 現在選択中の初期設定が存在しない場合は最初の初期設定を使用
        currentSelectedSetup = Object.keys(currentSetupLinks)[0] || 'windows';
        setupSelector.value = currentSelectedSetup;
        localStorage.setItem('currentSelectedSetup', currentSelectedSetup);
    }
}

// 初期設定コンテンツ更新機能
function updateSetupContent() {
    const setupSelector = document.getElementById('setup-selector');
    const linkInput = document.getElementById('setup-link-input');
    const explanationText = document.getElementById('setup-explanation-text');
    
    if (!setupSelector || !linkInput || !explanationText) return;
    
    const selectedType = setupSelector.value || currentSelectedSetup;
    
    // リンク入力フィールドの更新
    if (currentSetupLinks[selectedType]) {
        linkInput.value = currentSetupLinks[selectedType];
    }
    
    // 説明文の更新
    let explanationKey;
    switch(selectedType) {
        case 'windows':
            explanationKey = 'windowsSetupExplanation';
            break;
        case 'iphone':
            explanationKey = 'iphoneSetupExplanation';
            break;
        case 'android':
            explanationKey = 'androidSetupExplanation';
            break;
        default:
            explanationKey = 'windowsSetupExplanation';
    }
    
    explanationText.setAttribute('data-i18n', explanationKey);
    const baseText = getText(explanationKey);
    
    // Windows の場合のみGitHubリンクを追加
    if (selectedType === 'windows') {
        explanationText.innerHTML = `${baseText}<br><a href="https://github.com/site-u2023/site-u2023.github.io/blob/main/file/sshcmd.reg" target="_blank" rel="noopener" style="color: var(--link-color); text-decoration: underline; font-size: 0.9em; margin-top: 8px; display: inline-block;">View file on GitHub</a>`;
    } else {
        explanationText.textContent = baseText;
    }
}

// 初期設定リンクを開く機能
function openSetupLink(url) {
    if (!url) return;
    
    console.log('Opening setup link:', url);
    
    try {
        if (url.startsWith('file/')) {
            // ローカルファイルの場合はダウンロード
            const link = document.createElement('a');
            link.href = url;
            link.download = url.split('/').pop();
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            console.log('File download initiated:', url);
        } else {
            // 外部URLの場合は新しいタブで開く
            window.open(url, '_blank');
            console.log('External URL opened:', url);
        }
    } catch (error) {
        console.error('Failed to open setup link:', error);
        alert('リンクを開くことができませんでした。');
    }
}

// ==================================================
// SSH Handler ダウンロード機能
// ==================================================
async function downloadSSHHandler() {
    try {
        console.log('SSH Handler のダウンロードを開始...');
        
        // まず直接ダウンロードを試す
        let response;
        try {
            response = await fetch(SSHCMD_REG_URL);
            if (!response.ok) {
                throw new Error(`Direct download failed: ${response.status}`);
            }
            console.log('直接ダウンロード成功');
        } catch (error) {
            console.log('直接ダウンロード失敗、プロキシ経由で試行中...', error.message);
            // プロキシ経由でダウンロードを試す
            response = await fetch(PROXY_URL + encodeURIComponent(SSHCMD_REG_URL));
            if (!response.ok) {
                throw new Error(`Proxy download failed: ${response.status}`);
            }
            console.log('プロキシ経由でのダウンロード成功');
        }
        
        // レスポンスをBlobとして取得
        const blob = await response.blob();
        
        // ダウンロードリンクを作成
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sshcmd.reg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        console.log('sshcmd.reg のダウンロードが完了しました');
        
    } catch (error) {
        console.error('SSH Handler のダウンロードに失敗しました:', error);
        alert('ダウンロードに失敗しました。しばらく後に再試行してください。');
    }
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
    
    // 動的コンテンツも更新
    updateTerminalExplanation();
    updateSetupContent();
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
    updateSetupContent();
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
