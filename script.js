// ==================================================
// グローバル変数と定数
// ==================================================
let currentLanguage = 'en';
let currentTheme = 'auto';

// INI設定
const INI_CONFIG = {
    githubINIUrl: 'https://raw.githubusercontent.com/site-u2023/site-u2023.github.io/refs/heads/main/aios.ini',
    localPath: 'C:\\aios\\aios.ini',
    filename: 'aios.ini'
};

// 最小限のフォールバック設定（INI取得失敗時のみ）
const MINIMAL_FALLBACK = {
    addresses: ['192.168.1.1'],
    services: { luci: { name: 'LuCI', port: '80', protocol: 'http' } },
    terminals: { aios: { name: 'aios', command: '' } },
    currentIP: '192.168.1.1',
    currentSelectedService: 'luci',
    currentSelectedTerminal: 'aios',
    language: 'en',
    theme: 'auto'
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

// 現在の設定（INIから読み込み）
let currentAddresses = [];
let currentServices = {};
let currentTerminals = {};
let currentIP = '192.168.1.1';
let currentSelectedService = 'luci';
let currentSelectedTerminal = 'aios';

// INI管理用グローバル変数
let iniFileHandle = null;
let autoINIManager = null;

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
        langJa: '日本語',
        // ダイアログメッセージを追加
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
        // ダイアログメッセージを追加
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
    // {0}, {1} などのプレースホルダーを置換
    args.forEach((arg, index) => {
        text = text.replace(`{${index}}`, arg);
    });
    return text;
}

// ==================================================
// INI管理システム
// ==================================================
class AutoINIManager {
    constructor() {
        this.isInitialized = false;
    }

    /**
     * 起動時の完全自動処理
     * 1. ローカルINI存在確認
     * 2. あれば自動読み込み
     * 3. なければGitHubから自動DL→自動適用
     */
    async initialize() {
        if (this.isInitialized) return;
        
        console.log('=== Auto INI Manager Starting ===');
        
        try {
            const hasLocalINI = this.checkLocalINIExists();
            
            if (hasLocalINI) {
                console.log('Local INI exists, attempting auto-load...');
                await this.autoLoadLocalINI();
            } else {
                console.log('Local INI not found, downloading from GitHub...');
                await this.downloadAndApplyINI();
            }
            
        } catch (error) {
            console.error('INI initialization error:', error);
            this.fallbackToDefaults();
        }
        
        this.isInitialized = true;
    }

    /**
     * ローカルINI存在確認（LocalStorageのフラグで判定）
     */
    checkLocalINIExists() {
        return localStorage.getItem('hasLocalINI') === 'true';
    }

    /**
     * ローカルINIの自動読み込み
     */
    async autoLoadLocalINI() {
        // File System Access API対応ブラウザの場合
        if ('showOpenFilePicker' in window) {
            // 自動読み込みはセキュリティ制限で不可能なため、
            // ユーザーに読み込みを促すが、これは一度設定すれば記憶される
            await this.promptQuickLoad();
        } else {
            // 代替: 前回保存した内容があれば使用
            const lastINIContent = localStorage.getItem('lastINIContent');
            if (lastINIContent) {
                this.applyINIContent(lastINIContent);
                console.log('Applied cached INI content');
            } else {
                console.log('No cached content, downloading from GitHub...');
                await this.downloadAndApplyINI();
            }
        }
    }

    /**
     * クイック読み込み促進
     */
    async promptQuickLoad() {
        try {
            // File System Access APIで自動的にファイル選択を開く
            const [fileHandle] = await window.showOpenFilePicker({
                types: [{
                    description: 'INI files',
                    accept: { 'text/plain': ['.ini', '.txt'] }
                }],
                startIn: 'documents'
            });

            const file = await fileHandle.getFile();
            const content = await file.text();
            
            this.applyINIContent(content);
            
            // 次回用にキャッシュ（LocalStorageを継続使用）
            localStorage.setItem('lastINIContent', content);
            iniFileHandle = fileHandle;
            
            console.log('Local INI loaded successfully');
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('File selection cancelled, downloading from GitHub...');
                await this.downloadAndApplyINI();
            } else {
                console.error('File loading error:', error);
                this.fallbackToDefaults();
            }
        }
    }

    /**
     * GitHubからINIダウンロード＆自動適用
     */
    async downloadAndApplyINI() {
        try {
            console.log(`Downloading from: ${INI_CONFIG.githubINIUrl}`);
            
            const response = await fetch(INI_CONFIG.githubINIUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const iniContent = await response.text();
            console.log('INI downloaded successfully');
            
            // 自動ダウンロード（バックアップ用）
            this.silentDownload(iniContent);
            
            // 内容を即座に適用
            this.applyINIContent(iniContent);
            
            // キャッシュとフラグ保存（LocalStorageを継続使用）
            localStorage.setItem('lastINIContent', iniContent);
            localStorage.setItem('hasLocalINI', 'true');
            localStorage.setItem('lastAutoDownload', new Date().toISOString());
            
            console.log('INI applied automatically');
            
        } catch (error) {
            console.error('GitHub download failed:', error);
            this.fallbackToDefaults();
        }
    }

    /**
     * サイレントダウンロード（バックアップ用）
     */
    silentDownload(content) {
        try {
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = INI_CONFIG.filename;
            a.style.display = 'none';
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            URL.revokeObjectURL(url);
            console.log('Backup INI downloaded silently');
        } catch (error) {
            console.log('Silent download failed:', error.message);
        }
    }

    /**
     * INI内容を設定として適用
     */
    applyINIContent(iniContent) {
        try {
            const settings = this.parseINI(iniContent);
            this.applySettings(settings);
            console.log('INI settings applied');
        } catch (error) {
            console.error('INI parsing error:', error);
            this.fallbackToDefaults();
        }
    }

    /**
     * 最小限のフォールバック設定
     */
    fallbackToDefaults() {
        console.log('Applying minimal fallback settings');
        this.applySettings(MINIMAL_FALLBACK);
    }

    /**
     * INI解析
     */
    parseINI(content) {
        const lines = content.split('\n');
        const settings = {
            addresses: [],
            services: {},
            terminals: {},
            currentIP: '192.168.1.1',
            currentSelectedService: 'luci',
            currentSelectedTerminal: 'aios',
            language: 'en',
            theme: 'auto'
        };
        
        let currentSection = '';
        let currentServiceKey = '';
        let currentTerminalKey = '';
        
        for (let line of lines) {
            line = line.trim();
            
            if (!line || line.startsWith(';') || line.startsWith('#')) continue;
            
            if (line.startsWith('[') && line.endsWith(']')) {
                currentSection = line.slice(1, -1);
                
                if (currentSection.startsWith('service_')) {
                    currentServiceKey = currentSection.replace('service_', '');
                    settings.services[currentServiceKey] = {};
                }
                
                if (currentSection.startsWith('terminal_')) {
                    currentTerminalKey = currentSection.replace('terminal_', '');
                    settings.terminals[currentTerminalKey] = {};
                }
                
                continue;
            }
            
            const equalIndex = line.indexOf('=');
            if (equalIndex === -1) continue;
            
            const key = line.substring(0, equalIndex).trim();
            const value = line.substring(equalIndex + 1).trim();
            
            switch (currentSection) {
                case 'general':
                    if (['currentIP', 'currentSelectedService', 'currentSelectedTerminal', 'language', 'theme'].includes(key)) {
                        settings[key] = value;
                    }
                    break;
                    
                case 'addresses':
                    if (key.startsWith('address') && value) {
                        settings.addresses.push(value);
                    }
                    break;
                    
                default:
                    if (currentSection.startsWith('service_') && currentServiceKey) {
                        if (['name', 'port', 'protocol'].includes(key)) {
                            settings.services[currentServiceKey][key] = value;
                        }
                    }
                    
                    if (currentSection.startsWith('terminal_') && currentTerminalKey) {
                        if (['name', 'command'].includes(key)) {
                            settings.terminals[currentTerminalKey][key] = value;
                        }
                    }
                    break;
            }
        }
        
        return settings;
    }

    /**
     * 設定適用
     */
    applySettings(settings) {
        currentAddresses = settings.addresses.length > 0 ? settings.addresses : MINIMAL_FALLBACK.addresses;
        currentServices = Object.keys(settings.services).length > 0 ? settings.services : MINIMAL_FALLBACK.services;
        currentTerminals = Object.keys(settings.terminals).length > 0 ? settings.terminals : MINIMAL_FALLBACK.terminals;
        
        currentIP = settings.currentIP || currentAddresses[0];
        currentSelectedService = settings.currentSelectedService || Object.keys(currentServices)[0];
        currentSelectedTerminal = settings.currentSelectedTerminal || Object.keys(currentTerminals)[0];
        currentLanguage = settings.language || 'en';
        currentTheme = settings.theme || 'auto';
        
        this.updateUI();
    }

    /**
     * UI更新
     */
    updateUI() {
        setTimeout(() => {
            updateAddressSelector();
            updateServiceSelector();
            updateTerminalSelector();
            updateAllDisplays();
            updateLanguageDisplay();
            applyTheme(currentTheme);
            
            const ipSelector = document.getElementById('global-ip-input');
            if (ipSelector) ipSelector.value = currentIP;
            
            const serviceSelector = document.getElementById('service-selector');
            if (serviceSelector) serviceSelector.value = currentSelectedService;
            
            const terminalSelector = document.getElementById('terminal-selector');
            if (terminalSelector) terminalSelector.value = currentSelectedTerminal;
        }, 100);
    }

    /**
     * 設定保存（INI更新）
     */
    async saveSettings() {
        const settings = {
            addresses: currentAddresses,
            services: currentServices,
            terminals: currentTerminals,
            currentIP: currentIP,
            currentSelectedService: currentSelectedService,
            currentSelectedTerminal: currentSelectedTerminal,
            language: currentLanguage,
            theme: currentTheme
        };

        const iniContent = this.generateINI(settings);
        
        // キャッシュ更新（LocalStorageを継続使用）
        localStorage.setItem('lastINIContent', iniContent);
        
        // File System Access APIが使用可能で、ファイルハンドルがある場合
        if (iniFileHandle && 'createWritable' in iniFileHandle) {
            try {
                const writable = await iniFileHandle.createWritable();
                await writable.write(iniContent);
                await writable.close();
                
                localStorage.setItem('lastSaveTime', new Date().toISOString());
                console.log('INI file updated successfully');
                
                return true;
            } catch (error) {
                console.error('INI save error:', error);
            }
        }
        
        // フォールバック: サイレントダウンロード
        this.silentDownload(iniContent);
        console.log('Settings cached, backup downloaded');
        
        return false;
    }

    /**
     * INI生成
     */
    generateINI(settings) {
        let ini = `;
; aios Configuration File
; Generated: ${new Date().toISOString()}
; Path: ${INI_CONFIG.localPath}
;

[general]
currentIP=${settings.currentIP}
currentSelectedService=${settings.currentSelectedService}
currentSelectedTerminal=${settings.currentSelectedTerminal}
language=${settings.language}
theme=${settings.theme}

[addresses]
`;
        
        settings.addresses.forEach((address, index) => {
            ini += `address${index + 1}=${address}\n`;
        });
        
        ini += '\n';
        
        Object.keys(settings.services).forEach(key => {
            const service = settings.services[key];
            ini += `[service_${key}]\n`;
            ini += `name=${service.name}\n`;
            ini += `port=${service.port}\n`;
            ini += `protocol=${service.protocol}\n\n`;
        });
        
        Object.keys(settings.terminals).forEach(key => {
            const terminal = settings.terminals[key];
            ini += `[terminal_${key}]\n`;
            ini += `name=${terminal.name}\n`;
            ini += `command=${terminal.command}\n\n`;
        });
        
        return ini;
    }
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
    // INI管理システムの初期化
    autoINIManager = new AutoINIManager();
    
    // 言語設定の復元（LocalStorageから暫定取得、INIで上書きされる）
    const savedLanguage = localStorage.getItem('language') || 'en';
    currentLanguage = savedLanguage;
    
    // 翻訳を適用
    updateLanguageDisplay();
    
    // テーマ設定の復元（LocalStorageから暫定取得、INIで上書きされる）
    const savedTheme = localStorage.getItem('theme') || 'auto';
    currentTheme = savedTheme;
    applyTheme(currentTheme);
    
    // INI設定の自動初期化（非同期）
    setTimeout(() => {
        autoINIManager.initialize();
    }, 500);
    
    // UI要素の初期化
    updateAddressSelector();
    updateServiceSelector();
    updateTerminalSelector();
    
    // UI要素の値を確実に復元
    setTimeout(() => {
        restoreUIValues();
    }, 10);
}

// UI要素の値を確実に復元する関数
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
    
    // 各要素の表示を更新
    updateServicePort();
    updateTerminalCommand();
}

// INI設定保存のヘルパー関数
function saveCurrentSettings() {
    if (autoINIManager) {
        autoINIManager.saveSettings();
    }
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
            console.log('IP changed to:', currentIP);
            updateAllDisplays();
            saveCurrentSettings(); // INI保存
        });
    }
    
    if (globalIpUpdate) {
        globalIpUpdate.addEventListener('click', function() {
            if (ipSelector) {
                currentIP = ipSelector.value;
                console.log('IP updated to:', currentIP);
                updateAllDisplays();
                saveCurrentSettings(); // INI保存
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
                    
                    // 新しく追加したアドレスを選択
                    currentIP = trimmedAddress;
                    
                    updateAddressSelector();
                    
                    // セレクタの値を確実に設定
                    setTimeout(() => {
                        if (ipSelector) {
                            ipSelector.value = currentIP;
                        }
                        updateAllDisplays();
                        saveCurrentSettings(); // INI保存
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
                    
                    // 削除後の新しい選択値を設定
                    currentIP = currentAddresses[0];
                    
                    updateAddressSelector();
                    
                    // セレクタの値を確実に設定
                    setTimeout(() => {
                        if (ipSelector) {
                            ipSelector.value = currentIP;
                        }
                        updateAllDisplays();
                        saveCurrentSettings(); // INI保存
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
            console.log('Service changed to:', currentSelectedService);
            updateServicePort();
            saveCurrentSettings(); // INI保存
        });
    }
    
    if (portInput) {
        portInput.addEventListener('input', function() {
            const serviceSelector = document.getElementById('service-selector');
            if (serviceSelector) {
                const selectedService = serviceSelector.value;
                if (currentServices[selectedService]) {
                    currentServices[selectedService].port = this.value;
                    saveCurrentSettings(); // INI保存
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
                    
                    // 新しく追加したサービスを選択
                    currentSelectedService = serviceKey;
                    
                    updateServiceSelector();
                    
                    // セレクタの値を確実に設定
                    setTimeout(() => {
                        if (serviceSelector) {
                            serviceSelector.value = currentSelectedService;
                        }
                        updateServicePort();
                        saveCurrentSettings(); // INI保存
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
                    
                    // 削除後の新しい選択値を設定
                    currentSelectedService = Object.keys(currentServices)[0];
                    
                    updateServiceSelector();
                    
                    // セレクタの値を確実に設定
                    setTimeout(() => {
                        if (serviceSelector) {
                            serviceSelector.value = currentSelectedService;
                        }
                        updateServicePort();
                        saveCurrentSettings(); // INI保存
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
            console.log('Terminal changed to:', currentSelectedTerminal);
            updateTerminalCommand();
            saveCurrentSettings(); // INI保存
        });
    }
    
    if (commandInput) {
        commandInput.addEventListener('input', function() {
            const terminalSelector = document.getElementById('terminal-selector');
            if (terminalSelector) {
                const selectedType = terminalSelector.value;
                if (currentTerminals[selectedType]) {
                    currentTerminals[selectedType].command = this.value;
                    saveCurrentSettings(); // INI保存
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
                    
                    // 新しく追加したターミナルを選択
                    currentSelectedTerminal = terminalKey;
                    
                    updateTerminalSelector();
                    
                    // セレクタの値を確実に設定
                    setTimeout(() => {
                        if (terminalSelector) {
                            terminalSelector.value = currentSelectedTerminal;
                        }
                        updateTerminalCommand();
                        saveCurrentSettings(); // INI保存
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
                    
                    // 削除後の新しい選択値を設定
                    currentSelectedTerminal = Object.keys(currentTerminals)[0];
                    
                    updateTerminalSelector();
                    
                    // セレクタの値を確実に設定
                    setTimeout(() => {
                        if (terminalSelector) {
                            terminalSelector.value = currentSelectedTerminal;
                        }
                        updateTerminalCommand();
                        saveCurrentSettings(); // INI保存
                    }, 10);
                }
            } else if (Object.keys(currentTerminals).length <= 1) {
                alert(getText('alertMinimumTerminal'));
            }
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
    
    // 現在のIPが確実に選択されるように
    if (currentAddresses.includes(currentIP)) {
        ipSelector.value = currentIP;
    } else {
        // 現在のIPがリストにない場合は最初のアドレスを使用
        currentIP = currentAddresses[0] || '192.168.1.1';
        ipSelector.value = currentIP;
        saveCurrentSettings(); // INI保存
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
    
    // 現在選択中のサービスが確実に選択されるように
    if (currentServices[currentSelectedService]) {
        serviceSelector.value = currentSelectedService;
    } else {
        // 現在選択中のサービスが存在しない場合は最初のサービスを使用
        currentSelectedService = Object.keys(currentServices)[0] || 'luci';
        serviceSelector.value = currentSelectedService;
        saveCurrentSettings(); // INI保存
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
    
    // 現在選択中のターミナルが確実に選択されるように
    if (currentTerminals[currentSelectedTerminal]) {
        terminalSelector.value = currentSelectedTerminal;
    } else {
        // 現在選択中のターミナルが存在しない場合は最初のターミナルを使用
        currentSelectedTerminal = Object.keys(currentTerminals)[0] || 'aios';
        terminalSelector.value = currentSelectedTerminal;
        saveCurrentSettings(); // INI保存
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
    saveCurrentSettings(); // INI保存
    
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
    updateLanguageDisplay();
    saveCurrentSettings(); // INI保存
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

// ==================================================
// デバッグ用関数
// ==================================================
function debugAutoINI() {
    console.log('=== Auto INI Debug ===');
    console.log('Has Local INI:', localStorage.getItem('hasLocalINI'));
    console.log('Last Download:', localStorage.getItem('lastAutoDownload'));
    console.log('Last Save:', localStorage.getItem('lastSaveTime'));
    console.log('GitHub URL:', INI_CONFIG.githubINIUrl);
    console.log('Current Settings:', {
        addresses: currentAddresses,
        services: currentServices,
        terminals: currentTerminals,
        currentIP: currentIP,
        currentSelectedService: currentSelectedService,
        currentSelectedTerminal: currentSelectedTerminal,
        language: currentLanguage,
        theme: currentTheme
    });
}
