// ==================================================
// INI管理システム
// ==================================================

const INI_CONFIG = {
    githubINIUrl: 'https://raw.githubusercontent.com/site-u2023/site-u2023.github.io/refs/heads/main/aios.ini',
    // ローカル保存先
    localPath: 'C:\\aios\\aios.ini',
    filename: 'aios.ini'
};

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
     * ローカルINI存在確認
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
            
            // 次回用にキャッシュ
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
            
            // キャッシュとフラグ保存
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
     * デフォルト設定にフォールバック
     */
    fallbackToDefaults() {
        const defaultSettings = {
            addresses: [...DEFAULT_ADDRESSES],
            services: {...DEFAULT_SERVICES},
            terminals: {...DEFAULT_TERMINALS},
            currentIP: '192.168.1.1',
            currentSelectedService: 'luci',
            currentSelectedTerminal: 'aios',
            language: 'en',
            theme: 'auto'
        };
        
        this.applySettings(defaultSettings);
        console.log('Using default settings');
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

    /**
     * UI更新
     */
    updateUI() {
        setTimeout(() => {
            if (typeof updateAllSelectors === 'function') updateAllSelectors();
            if (typeof updateAllDisplays === 'function') updateAllDisplays();
            if (typeof updateLanguageDisplay === 'function') updateLanguageDisplay();
            if (typeof applyTheme === 'function') applyTheme(currentTheme);
            
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
        
        // キャッシュ更新
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
// グローバルインスタンス＆自動初期化
// ==================================================
const autoINIManager = new AutoINIManager();
let iniFileHandle = null;

// ページ読み込み完了後に自動初期化
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        autoINIManager.initialize();
    }, 500);
});

// 既存のinitializeSettings関数を置き換え
function initializeSettings() {
    // 言語・テーマ設定の復元（LocalStorageから）
    const savedLanguage = localStorage.getItem('language') || 'en';
    currentLanguage = savedLanguage;
    updateLanguageDisplay();
    
    const savedTheme = localStorage.getItem('theme') || 'auto';
    currentTheme = savedTheme;
    applyTheme(currentTheme);
    
    // INI設定は autoINIManager.initialize() で処理される
    
    // UI要素の初期化
    updateAddressSelector();
    updateServiceSelector();
    updateTerminalSelector();
    
    setTimeout(() => {
        restoreUIValues();
    }, 10);
}

// 設定変更時の自動保存
function saveCurrentSettings() {
    autoINIManager.saveSettings();
}

// すべてのlocalStorage設定保存を置き換え
const originalAddressAdd = document.getElementById('address-add');
// 既存のイベントリスナー内のlocalStorage.setItem呼び出しを
// saveCurrentSettings() に置き換える

// デバッグ用
function debugAutoINI() {
    console.log('=== Auto INI Debug ===');
    console.log('Has Local INI:', localStorage.getItem('hasLocalINI'));
    console.log('Last Download:', localStorage.getItem('lastAutoDownload'));
    console.log('Last Save:', localStorage.getItem('lastSaveTime'));
    console.log('GitHub URL:', INI_CONFIG.githubINIUrl);
}
