// ==================================================
// aios Configuration Manager
// すべての設定はaios.iniファイルから読み込まれます
// INIファイルが利用できない場合は最小限の設定で動作します
// ==================================================
// すべての設定はINIファイルから読み込む
let currentLanguage = 'en';
let currentTheme = 'auto';
let currentAddresses = [];
let currentServices = {};
let currentTerminals = {};
let currentIP = '192.168.1.1';
let currentSelectedService = 'luci';
let currentSelectedTerminal = 'aios';

// INIファイルから読み込まれる
let PROMPT_DEFAULTS = {};
let translations = { ja: {}, en: {} };

// 翻訳テキスト取得関数
function getText(key, ...args) {
    // INIファイルから読み込まれた翻訳があればそれを使用
    // なければキーをそのまま返す（HTMLのデフォルト表示）
    let text = (translations[currentLanguage] && translations[currentLanguage][key]) || 
               (translations['en'] && translations['en'][key]) || 
               key;
    
    // プレースホルダーの置換
    args.forEach((arg, index) => {
        text = text.replace(`{${index}}`, arg);
    });
    return text;
}

// ==================================================
// INI管理システム
// ==================================================

const INI_CONFIG = {
    githubINIUrl: 'https://raw.githubusercontent.com/site-u2023/site-u2023.github.io/refs/heads/main/aios.ini',
    localPath: 'C:\\aios\\aios.ini',
    filename: 'aios.ini'
};

class AutoINIManager {
    constructor() {
        this.isInitialized = false;
    }

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
            // エラー時は何もしない（HTMLのデフォルト値がそのまま使われる）
        }
        
        this.isInitialized = true;
    }

    checkLocalINIExists() {
        return localStorage.getItem('hasLocalINI') === 'true';
    }

    async autoLoadLocalINI() {
        if ('showOpenFilePicker' in window) {
            await this.promptQuickLoad();
        } else {
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

    async promptQuickLoad() {
        try {
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
            
            localStorage.setItem('lastINIContent', content);
            iniFileHandle = fileHandle;
            
            console.log('Local INI loaded successfully');
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('File selection cancelled, downloading from GitHub...');
                await this.downloadAndApplyINI();
            } else {
                console.error('File loading error:', error);
            }
        }
    }

    async downloadAndApplyINI() {
        try {
            console.log(`Downloading INI from: ${INI_CONFIG.githubINIUrl}`);
            
            const response = await fetch(INI_CONFIG.githubINIUrl);
            console.log(`Response status: ${response.status}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const iniContent = await response.text();
            console.log(`INI content length: ${iniContent.length} bytes`);
            
            // ダウンロード実行
            this.silentDownload(iniContent);
            
            // 設定を適用
            this.applyINIContent(iniContent);
            
            // キャッシュに保存
            localStorage.setItem('lastINIContent', iniContent);
            localStorage.setItem('hasLocalINI', 'true');
            localStorage.setItem('lastAutoDownload', new Date().toISOString());
            
            console.log('✓ INI configuration loaded and applied');
            
        } catch (error) {
            console.error('Failed to download INI:', error.message);
            // エラー時は何もしない（HTMLのデフォルト値が使用される）
        }
    }

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
            console.log('✓ INI file downloaded to Downloads folder');
        } catch (error) {
            console.error('Download failed:', error.message);
        }
    }

    applyINIContent(iniContent) {
        try {
            const settings = this.parseINI(iniContent);
            this.applySettings(settings);
            console.log('INI settings applied');
        } catch (error) {
            console.error('INI parsing error:', error);
            // エラー時は何もしない
        }
    }

    fallbackToDefaults() {
        // INIファイルが読めない場合の最小限の設定
        // HTMLのデフォルト表示をそのまま使用
        console.log('INI file not available, using minimal defaults');
        
        // 最小限の動作保証のための設定
        currentAddresses = ['192.168.1.1'];
        currentServices = { luci: { name: 'LuCI', port: '80', protocol: 'http' } };
        currentTerminals = { aios: { name: 'aios', command: '' } };
        currentIP = '192.168.1.1';
        currentSelectedService = 'luci';
        currentSelectedTerminal = 'aios';
        currentLanguage = 'en';
        currentTheme = 'auto';
        
        // プロンプトのデフォルト値も最小限に
        PROMPT_DEFAULTS = {
            newAddress: '192.168.1.2',
            serviceName: 'custom',
            portNumber: '10000',
            protocol: 'http',
            terminalName: 'custom',
            defaultCommand: ''
        };
        
        this.updateUI();
    }

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
                    
                case 'translations_ja':
                    if (!translations.ja) translations.ja = {};
                    translations.ja[key] = value;
                    break;
                    
                case 'translations_en':
                    if (!translations.en) translations.en = {};
                    translations.en[key] = value;
                    break;
                    
                case 'prompt_defaults':
                    if (!PROMPT_DEFAULTS) PROMPT_DEFAULTS = {};
                    PROMPT_DEFAULTS[key] = value;
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

    applySettings(settings) {
        currentAddresses = settings.addresses.length > 0 ? settings.addresses : [...DEFAULT_ADDRESSES];
        currentServices = Object.keys(settings.services).length > 0 ? settings.services : {...DEFAULT_SERVICES};
        currentTerminals = Object.keys(settings.terminals).length > 0 ? settings.terminals : {...DEFAULT_TERMINALS};
        
        currentIP = settings.currentIP || currentAddresses[0];
        currentSelectedService = settings.currentSelectedService || Object.keys(currentServices)[0];
        currentSelectedTerminal = settings.currentSelectedTerminal || Object.keys(currentTerminals)[0];
        currentLanguage = settings.language || 'en';
        currentTheme = settings.theme || 'auto';
        
        this.updateUI();
    }

    updateUI() {
        console.log('Updating UI with loaded settings...');
        
        setTimeout(() => {
            updateAllSelectors();
            updateAllDisplays();
            updateLanguageDisplay();
            applyTheme(currentTheme);
            
            const ipSelector = document.getElementById('global-ip-input');
            if (ipSelector && currentIP) {
                ipSelector.value = currentIP;
                console.log(`IP selector set to: ${currentIP}`);
            }
            
            const serviceSelector = document.getElementById('service-selector');
            if (serviceSelector && currentSelectedService) {
                serviceSelector.value = currentSelectedService;
                console.log(`Service selector set to: ${currentSelectedService}`);
            }
            
            const terminalSelector = document.getElementById('terminal-selector');
            if (terminalSelector && currentSelectedTerminal) {
                terminalSelector.value = currentSelectedTerminal;
                console.log(`Terminal selector set to: ${currentSelectedTerminal}`);
            }
        }, 100);
    }

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
        
        localStorage.setItem('lastINIContent', iniContent);
        
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
        
        this.silentDownload(iniContent);
        console.log('Settings cached, backup downloaded');
        
        return false;
    }

    generateINI(settings) {
        let ini = `;
; aios Configuration File
; Generated: ${new Date().toISOString()}
; Recommended Path: ${INI_CONFIG.localPath}
; GitHub Repository: https://github.com/site-u2023/site-u2023.github.io
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
        
        // 翻訳セクションを追加（現在読み込まれているものを保持）
        if (translations.ja && Object.keys(translations.ja).length > 5) {
            ini += `[translations_ja]\n`;
            Object.entries(translations.ja).forEach(([key, value]) => {
                ini += `${key}=${value}\n`;
            });
        }
        
        if (translations.en && Object.keys(translations.en).length > 5) {
            ini += `\n[translations_en]\n`;
            Object.entries(translations.en).forEach(([key, value]) => {
                ini += `${key}=${value}\n`;
            });
        }
        
        // プロンプトデフォルトも保持
        ini += `\n[prompt_defaults]\n`;
        Object.entries(PROMPT_DEFAULTS).forEach(([key, value]) => {
            ini += `${key}=${value}\n`;
        });
        
        return ini;
    }
}

// グローバルインスタンス
const autoINIManager = new AutoINIManager();
let iniFileHandle = null;

// 設定変更時の自動保存
function saveCurrentSettings() {
    autoINIManager.saveSettings();
}

// すべてのセレクタを更新する関数
function updateAllSelectors() {
    if (currentAddresses.length > 0) updateAddressSelector();
    if (Object.keys(currentServices).length > 0) updateServiceSelector();
    if (Object.keys(currentTerminals).length > 0) updateTerminalSelector();
}

// ==================================================
// 初期化
// ==================================================
document.addEventListener('DOMContentLoaded', function() {
    // INI管理の初期化を実行（成功しても失敗してもイベントをバインド）
    autoINIManager.initialize().finally(() => {
        bindEvents();
        updateAllDisplays();
    });
    
    // ヘッダー・フッターの動的読み込み
    const headerExists = document.querySelector('.main-header');
    const footerExists = document.querySelector('.page-footer-area');
    
    if (headerExists || footerExists) {
        loadHeaderFooter();
    }
    
    updateLogo();
});

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
            saveCurrentSettings();
        });
    }
    
    if (globalIpUpdate) {
        globalIpUpdate.addEventListener('click', function() {
            if (ipSelector) {
                currentIP = ipSelector.value;
                console.log('IP updated to:', currentIP);
                updateAllDisplays();
                saveCurrentSettings();
            }
        });
    }
    
    if (addressAdd) {
        addressAdd.addEventListener('click', function() {
            const newAddress = prompt(getText('promptNewAddress'), PROMPT_DEFAULTS.newAddress || '192.168.1.2');
            if (newAddress && newAddress.trim()) {
                const trimmedAddress = newAddress.trim();
                if (!currentAddresses.includes(trimmedAddress)) {
                    currentAddresses.push(trimmedAddress);
                    currentIP = trimmedAddress;
                    
                    updateAddressSelector();
                    
                    setTimeout(() => {
                        if (ipSelector) {
                            ipSelector.value = currentIP;
                        }
                        updateAllDisplays();
                        saveCurrentSettings();
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
                    currentIP = currentAddresses[0];
                    
                    updateAddressSelector();
                    
                    setTimeout(() => {
                        if (ipSelector) {
                            ipSelector.value = currentIP;
                        }
                        updateAllDisplays();
                        saveCurrentSettings();
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
            saveCurrentSettings();
        });
    }
    
    if (portInput) {
        portInput.addEventListener('input', function() {
            const serviceSelector = document.getElementById('service-selector');
            if (serviceSelector) {
                const selectedService = serviceSelector.value;
                if (currentServices[selectedService]) {
                    currentServices[selectedService].port = this.value;
                    saveCurrentSettings();
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
            const serviceName = prompt(getText('promptServiceName'), PROMPT_DEFAULTS.serviceName || 'custom');
            if (serviceName && serviceName.trim()) {
                const serviceKey = serviceName.toLowerCase().replace(/[^a-z0-9]/g, '');
                const port = prompt(getText('promptPortNumber'), PROMPT_DEFAULTS.portNumber || '10000');
                const protocol = prompt(getText('promptProtocol'), PROMPT_DEFAULTS.protocol || 'http');
                
                if (serviceKey && port && !currentServices[serviceKey]) {
                    currentServices[serviceKey] = {
                        name: serviceName.trim(),
                        port: port.trim(),
                        protocol: protocol.trim() || 'http'
                    };
                    currentSelectedService = serviceKey;
                    
                    updateServiceSelector();
                    
                    setTimeout(() => {
                        if (serviceSelector) {
                            serviceSelector.value = currentSelectedService;
                        }
                        updateServicePort();
                        saveCurrentSettings();
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
                    currentSelectedService = Object.keys(currentServices)[0];
                    
                    updateServiceSelector();
                    
                    setTimeout(() => {
                        if (serviceSelector) {
                            serviceSelector.value = currentSelectedService;
                        }
                        updateServicePort();
                        saveCurrentSettings();
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
            saveCurrentSettings();
        });
    }
    
    if (commandInput) {
        commandInput.addEventListener('input', function() {
            const terminalSelector = document.getElementById('terminal-selector');
            if (terminalSelector) {
                const selectedType = terminalSelector.value;
                if (currentTerminals[selectedType]) {
                    currentTerminals[selectedType].command = this.value;
                    saveCurrentSettings();
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
            const terminalName = prompt(getText('promptTerminalName'), PROMPT_DEFAULTS.terminalName || 'custom');
            if (terminalName && terminalName.trim()) {
                const terminalKey = terminalName.toLowerCase().replace(/[^a-z0-9]/g, '');
                const command = prompt(getText('promptDefaultCommand'), PROMPT_DEFAULTS.defaultCommand || '');
                
                if (terminalKey && !currentTerminals[terminalKey]) {
                    currentTerminals[terminalKey] = {
                        name: terminalName.trim(),
                        command: command ? command.trim() : ''
                    };
                    currentSelectedTerminal = terminalKey;
                    
                    updateTerminalSelector();
                    
                    setTimeout(() => {
                        if (terminalSelector) {
                            terminalSelector.value = currentSelectedTerminal;
                        }
                        updateTerminalCommand();
                        saveCurrentSettings();
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
                    currentSelectedTerminal = Object.keys(currentTerminals)[0];
                    
                    updateTerminalSelector();
                    
                    setTimeout(() => {
                        if (terminalSelector) {
                            terminalSelector.value = currentSelectedTerminal;
                        }
                        updateTerminalCommand();
                        saveCurrentSettings();
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
    
    ipSelector.innerHTML = '';
    
    currentAddresses.forEach(address => {
        const option = document.createElement('option');
        option.value = address;
        option.textContent = address;
        ipSelector.appendChild(option);
    });
    
    if (currentAddresses.includes(currentIP)) {
        ipSelector.value = currentIP;
    } else {
        currentIP = currentAddresses[0] || '192.168.1.1';
        ipSelector.value = currentIP;
    }
}

// ==================================================
// サービス管理機能
// ==================================================
function updateServiceSelector() {
    const serviceSelector = document.getElementById('service-selector');
    if (!serviceSelector) return;
    
    serviceSelector.innerHTML = '';
    
    Object.keys(currentServices).forEach(key => {
        const service = currentServices[key];
        const option = document.createElement('option');
        option.value = key;
        option.textContent = service.name;
        serviceSelector.appendChild(option);
    });
    
    if (currentServices[currentSelectedService]) {
        serviceSelector.value = currentSelectedService;
    } else {
        currentSelectedService = Object.keys(currentServices)[0] || 'luci';
        serviceSelector.value = currentSelectedService;
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
    
    terminalSelector.innerHTML = '';
    
    Object.keys(currentTerminals).forEach(key => {
        const terminal = currentTerminals[key];
        const option = document.createElement('option');
        option.value = key;
        option.textContent = terminal.name;
        terminalSelector.appendChild(option);
    });
    
    if (currentTerminals[currentSelectedTerminal]) {
        terminalSelector.value = currentSelectedTerminal;
    } else {
        currentSelectedTerminal = Object.keys(currentTerminals)[0] || 'aios';
        terminalSelector.value = currentSelectedTerminal;
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
    
    updateLogo();
    setTimeout(updateQRCode, 100);
}

// ==================================================
// 多言語対応機能
// ==================================================
function updateLanguageDisplay() {
    // 翻訳データが読み込まれていない場合は何もしない
    // （HTMLのデフォルト表示をそのまま使用）
    if (!translations[currentLanguage] || Object.keys(translations[currentLanguage]).length === 0) {
        return;
    }
    
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
    saveCurrentSettings();
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
                saveCurrentSettings();
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

// デバッグ用
function debugAutoINI() {
    console.log('=== Auto INI Debug ===');
    console.log('Has Local INI:', localStorage.getItem('hasLocalINI'));
    console.log('Last Download:', localStorage.getItem('lastAutoDownload'));
    console.log('Last Save:', localStorage.getItem('lastSaveTime'));
    console.log('GitHub URL:', INI_CONFIG.githubINIUrl);
    console.log('--- Current Values ---');
    console.log('Language:', currentLanguage);
    console.log('Theme:', currentTheme);
    console.log('IP:', currentIP);
    console.log('Service:', currentSelectedService);
    console.log('Terminal:', currentSelectedTerminal);
    console.log('Addresses:', currentAddresses);
    console.log('Services:', currentServices);
    console.log('Terminals:', currentTerminals);
}
