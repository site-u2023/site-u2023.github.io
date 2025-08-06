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
    adguard: { name: 'AdGuard', port: '3000', protocol: 'http' }
};

const AIOS_URL = 'https://raw.githubusercontent.com/site-u2023/aios/main/aios';
const PROXY_URL = 'https://proxy.site-u.workers.dev/proxy?url=';
const AIOS_PATH = '/usr/bin/aios';
const SSHCMD_REG_URL = 'https://raw.githubusercontent.com/site-u2023/openwrt-note/main/file/sshcmd.reg';

const DEFAULT_TERMINALS = {
    aios: {
        name: 'aios',
        command: `if [ -f ${AIOS_PATH} ]; then ${AIOS_PATH}; else wget -O ${AIOS_PATH} ${AIOS_URL} || wget -O ${AIOS_PATH} "${PROXY_URL}${AIOS_URL}" && chmod +x ${AIOS_PATH} && ${AIOS_PATH}; fi`
    },
    ssh: {
        name: 'SSH',
        command: ''
    }
};

// プロンプト用デフォルト値（一元管理）
const PROMPT_DEFAULTS = {
    newAddress: '192.168.1.2',
    serviceName: 'custom',
    portNumber: '10000',
    protocol: 'http',
    terminalName: 'custom',
    defaultCommand: ''
};

// 現在の設定（localStorage と DEFAULT をマージして使用）
let currentAddresses = [];
let currentServices = {};
let currentTerminals = {};
let currentIP = '192.168.1.1';
let currentSelectedService = 'luci';
let currentSelectedTerminal = 'aios';

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
        openwrtOfficial: 'OpenWrt (公式)',
        firmwareDownload: 'デバイス用のOpenWrtファームウェアをダウンロード',
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
        langJa: '日本語',
        promptNewAddress: '新しいIPアドレスまたはホスト名を入力してください:',
        alertMinimumAddress: '最低1つのアドレスは必要です。',
        promptServiceName: 'サービス名を入力してください:',
        promptPortNumber: 'ポート番号を入力してください:',
        promptProtocol: 'プロトコルを入力してください (http/https):',
        alertMinimumService: '最低1つのサービスは必要です。',
        confirmDeleteService: 'サービス "{0}" を削除しますか？',
        promptTerminalName: 'ターミナルタイプ名を入力してください:',
        promptDefaultCommand: 'デフォルトコマンドを入力してください (空欄可):',
        alertMinimumTerminal: '最低1つのターミナルタイプは必要です。',
        confirmDeleteTerminal: 'ターミナルタイプ "{0}" を削除しますか？'
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
        openwrtOfficial: 'OpenWrt (Official)',
        firmwareDownload: 'Download OpenWrt firmware for your device',
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
        langJa: '日本語',
        promptNewAddress: 'Enter new IP address or hostname:',
        alertMinimumAddress: 'At least one address is required.',
        promptServiceName: 'Enter service name:',
        promptPortNumber: 'Enter port number:',
        promptProtocol: 'Enter protocol (http/https):',
        alertMinimumService: 'At least one service is required.',
        confirmDeleteService: 'Delete service "{0}"?',
        promptTerminalName: 'Enter terminal type name:',
        promptDefaultCommand: 'Enter default command (optional):',
        alertMinimumTerminal: 'At least one terminal type is required.',
        confirmDeleteTerminal: 'Delete terminal type "{0}"?'
    }
};

// 翻訳テキスト取得関数
function getText(key, ...args) {
    let text = translations[currentLanguage][key] || translations['en'][key] || key;
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
    
    // 保存された現在のIPアドレスを復元
    const savedIP = localStorage.getItem('currentIP');
    if (savedIP && savedIP.trim()) {
        currentIP = savedIP;
        if (!currentAddresses.includes(currentIP)) {
            currentAddresses.unshift(currentIP);
            localStorage.setItem('addresses', JSON.stringify(currentAddresses));
        }
    } else {
        currentIP = currentAddresses[0];
    }
    
    // 保存された現在選択中のサービスを復元
    const savedService = localStorage.getItem('currentSelectedService');
    if (savedService && currentServices[savedService]) {
        currentSelectedService = savedService;
    } else {
        currentSelectedService = Object.keys(currentServices)[0];
    }
    
    // 保存された現在選択中のターミナルを復元
    const savedTerminal = localStorage.getItem('currentSelectedTerminal');
    if (savedTerminal && currentTerminals[savedTerminal]) {
        currentSelectedTerminal = savedTerminal;
    } else {
        currentSelectedTerminal = Object.keys(currentTerminals)[0];
    }
    
    // HTML要素に初期値を設定（一元管理）
    const ipInput = document.getElementById('global-ip-input');
    if (ipInput) {
        ipInput.value = currentIP;
    }
    
    const serviceInput = document.getElementById('service-selector');
    if (serviceInput && currentServices[currentSelectedService]) {
        serviceInput.value = currentServices[currentSelectedService].name;
    }
    
    const portInput = document.getElementById('port-input');
    if (portInput && currentServices[currentSelectedService]) {
        portInput.value = currentServices[currentSelectedService].port;
    }
    
    const terminalInput = document.getElementById('terminal-selector');
    if (terminalInput && currentTerminals[currentSelectedTerminal]) {
        terminalInput.value = currentTerminals[currentSelectedTerminal].name;
    }
    
    const commandInput = document.getElementById('command-input');
    if (commandInput && currentTerminals[currentSelectedTerminal]) {
        commandInput.value = currentTerminals[currentSelectedTerminal].command;
    }
    
    // datalistの初期化
    updateAddressSelector();
    updateServiceSelector();
    updateTerminalSelector();
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
            updateAllDisplays();
        });
    }
    
    if (globalIpUpdate) {
        globalIpUpdate.addEventListener('click', function() {
            if (ipSelector) {
                currentIP = ipSelector.value;
                localStorage.setItem('currentIP', currentIP);
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
                    currentIP = trimmedAddress;
                    localStorage.setItem('currentIP', currentIP);
                    updateAddressSelector();
                    if (ipSelector) {
                        ipSelector.value = currentIP;
                    }
                    updateAllDisplays();
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
                    currentIP = currentAddresses[0];
                    localStorage.setItem('currentIP', currentIP);
                    updateAddressSelector();
                    if (ipSelector) {
                        ipSelector.value = currentIP;
                    }
                    updateAllDisplays();
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
            const selectedName = this.value;
            for (const key in currentServices) {
                if (currentServices[key].name === selectedName) {
                    currentSelectedService = key;
                    break;
                }
            }
            localStorage.setItem('currentSelectedService', currentSelectedService);
            updateServicePort();
        });
    }
    
    if (portInput) {
        portInput.addEventListener('input', function() {
            if (serviceSelector) {
                const selectedName = serviceSelector.value;
                for (const key in currentServices) {
                    if (currentServices[key].name === selectedName) {
                        currentServices[key].port = this.value;
                        localStorage.setItem('services', JSON.stringify(currentServices));
                        break;
                    }
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
                    currentSelectedService = serviceKey;
                    localStorage.setItem('currentSelectedService', currentSelectedService);
                    updateServiceSelector();
                    if (serviceSelector) {
                        serviceSelector.value = currentServices[currentSelectedService].name;
                    }
                    updateServicePort();
                }
            }
        });
    }
    
    if (serviceRemove) {
        serviceRemove.addEventListener('click', function() {
            const serviceSelector = document.getElementById('service-selector');
            let selectedKey = currentSelectedService;
            
            if (serviceSelector) {
                const selectedName = serviceSelector.value;
                for (const key in currentServices) {
                    if (currentServices[key].name === selectedName) {
                        selectedKey = key;
                        break;
                    }
                }
            }
            
            if (selectedKey && Object.keys(currentServices).length > 1) {
                if (confirm(getText('confirmDeleteService', currentServices[selectedKey].name))) {
                    delete currentServices[selectedKey];
                    localStorage.setItem('services', JSON.stringify(currentServices));
                    currentSelectedService = Object.keys(currentServices)[0];
                    localStorage.setItem('currentSelectedService', currentSelectedService);
                    updateServiceSelector();
                    if (serviceSelector) {
                        serviceSelector.value = currentServices[currentSelectedService].name;
                    }
                    updateServicePort();
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
            const selectedName = this.value;
            for (const key in currentTerminals) {
                if (currentTerminals[key].name === selectedName) {
                    currentSelectedTerminal = key;
                    break;
                }
            }
            localStorage.setItem('currentSelectedTerminal', currentSelectedTerminal);
            updateTerminalCommand();
        });
    }
    
    if (commandInput) {
        commandInput.addEventListener('input', function() {
            if (terminalSelector) {
                const selectedName = terminalSelector.value;
                for (const key in currentTerminals) {
                    if (currentTerminals[key].name === selectedName) {
                        currentTerminals[key].command = this.value;
                        localStorage.setItem('terminals', JSON.stringify(currentTerminals));
                        break;
                    }
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
                    currentSelectedTerminal = terminalKey;
                    localStorage.setItem('currentSelectedTerminal', currentSelectedTerminal);
                    updateTerminalSelector();
                    if (terminalSelector) {
                        terminalSelector.value = currentTerminals[currentSelectedTerminal].name;
                    }
                    updateTerminalCommand();
                }
            }
        });
    }
    
    if (terminalRemove) {
        terminalRemove.addEventListener('click', function() {
            const terminalSelector = document.getElementById('terminal-selector');
            let selectedKey = currentSelectedTerminal;
            
            if (terminalSelector) {
                const selectedName = terminalSelector.value;
                for (const key in currentTerminals) {
                    if (currentTerminals[key].name === selectedName) {
                        selectedKey = key;
                        break;
                    }
                }
            }
            
            if (selectedKey && Object.keys(currentTerminals).length > 1) {
                if (confirm(getText('confirmDeleteTerminal', currentTerminals[selectedKey].name))) {
                    delete currentTerminals[selectedKey];
                    localStorage.setItem('terminals', JSON.stringify(currentTerminals));
                    currentSelectedTerminal = Object.keys(currentTerminals)[0];
                    localStorage.setItem('currentSelectedTerminal', currentSelectedTerminal);
                    updateTerminalSelector();
                    if (terminalSelector) {
                        terminalSelector.value = currentTerminals[currentSelectedTerminal].name;
                    }
                    updateTerminalCommand();
                }
            } else if (Object.keys(currentTerminals).length <= 1) {
                alert(getText('alertMinimumTerminal'));
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
    const datalist = document.getElementById('ip-datalist');
    if (!ipSelector || !datalist) return;
    
    datalist.innerHTML = '';
    
    currentAddresses.forEach(address => {
        const option = document.createElement('option');
        option.value = address;
        datalist.appendChild(option);
    });

    if (currentAddresses.includes(currentIP)) {
        ipSelector.value = currentIP;
    } else {
        currentIP = currentAddresses[0];
        ipSelector.value = currentIP;
        localStorage.setItem('currentIP', currentIP);
    }
}

// ==================================================
// サービス管理機能
// ==================================================
function updateServiceSelector() {
    const serviceSelector = document.getElementById('service-selector');
    const datalist = document.getElementById('service-datalist');
    if (!serviceSelector || !datalist) return;
    
    datalist.innerHTML = '';
    
    Object.keys(currentServices).forEach(key => {
        const service = currentServices[key];
        const option = document.createElement('option');
        option.value = service.name;
        datalist.appendChild(option);
    });
    
    if (currentServices[currentSelectedService]) {
        serviceSelector.value = currentServices[currentSelectedService].name;
    } else {
        currentSelectedService = Object.keys(currentServices)[0];
        serviceSelector.value = currentServices[currentSelectedService].name;
        localStorage.setItem('currentSelectedService', currentSelectedService);
    }
}

function updateServicePort() {
    const serviceSelector = document.getElementById('service-selector');
    const portInput = document.getElementById('port-input');
    
    if (serviceSelector && portInput) {
        const selectedName = serviceSelector.value;
        let selectedKey = currentSelectedService;
        for (const key in currentServices) {
            if (currentServices[key].name === selectedName) {
                selectedKey = key;
                break;
            }
        }
        
        const service = currentServices[selectedKey];
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
    
    let selectedKey = currentSelectedService;
    if (serviceSelector) {
        const selectedName = serviceSelector.value;
        for (const key in currentServices) {
            if (currentServices[key].name === selectedName) {
                selectedKey = key;
                break;
            }
        }
    }
    
    const service = currentServices[selectedKey];
    const port = portInput ? portInput.value : (service ? service.port : '80');
    const protocol = service ? service.protocol : 'http';
    
    return `${protocol}://${currentIP}:${port}`;
}

// ==================================================
// ターミナル管理機能
// ==================================================
function updateTerminalSelector() {
    const terminalSelector = document.getElementById('terminal-selector');
    const datalist = document.getElementById('terminal-datalist');
    if (!terminalSelector || !datalist) return;
    
    datalist.innerHTML = '';
    
    Object.keys(currentTerminals).forEach(key => {
        const terminal = currentTerminals[key];
        const option = document.createElement('option');
        option.value = terminal.name;
        datalist.appendChild(option);
    });
    
    if (currentTerminals[currentSelectedTerminal]) {
        terminalSelector.value = currentTerminals[currentSelectedTerminal].name;
    } else {
        currentSelectedTerminal = Object.keys(currentTerminals)[0];
        terminalSelector.value = currentTerminals[currentSelectedTerminal].name;
        localStorage.setItem('currentSelectedTerminal', currentSelectedTerminal);
    }
}

function updateTerminalCommand() {
    const terminalSelector = document.getElementById('terminal-selector');
    const commandInput = document.getElementById('command-input');
    if (!terminalSelector || !commandInput) return;

    const selectedName = terminalSelector.value;
    let selectedKey = currentSelectedTerminal;
    for (const key in currentTerminals) {
        if (currentTerminals[key].name === selectedName) {
            selectedKey = key;
            break;
        }
    }

    const terminal = currentTerminals[selectedKey];
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
    
    let selectedKey = currentSelectedTerminal;
    if (terminalSelector) {
        const selectedName = terminalSelector.value;
        for (const key in currentTerminals) {
            if (currentTerminals[key].name === selectedName) {
                selectedKey = key;
                break;
            }
        }
    }
    
    const terminal = currentTerminals[selectedKey];
    let fullCommand = commandInput ? commandInput.value.trim() : '';

    if (!fullCommand && terminal) {
        fullCommand = terminal.command;
    }

    let baseURL = `sshcmd://root@${currentIP}`;
    if (!fullCommand) return baseURL;
    
    const encodedCommand = encodeURIComponent(fullCommand);
    return `${baseURL}/${encodedCommand}`;
}

// ==================================================
// SSH Handler ダウンロード機能
// ==================================================
async function downloadSSHHandler() {
    try {
        let response;
        try {
            response = await fetch(SSHCMD_REG_URL);
            if (!response.ok) {
                throw new Error(`Direct download failed: ${response.status}`);
            }
        } catch (error) {
            response = await fetch(PROXY_URL + encodeURIComponent(SSHCMD_REG_URL));
            if (!response.ok) {
                throw new Error(`Proxy download failed: ${response.status}`);
            }
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sshcmd.reg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
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

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
    if (currentTheme === 'auto') {
        applyTheme('auto');
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const headerExists = document.querySelector('.main-header');
    const footerExists = document.querySelector('.page-footer-area');
    
    if (headerExists || footerExists) {
        loadHeaderFooter();
    }
    
    updateLogo();
});
