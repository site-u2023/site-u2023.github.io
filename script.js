// ==================================================
// INI管理システム（修正版）
// ==================================================
class AutoINIManager {
    constructor() {
        this.isInitialized = false;
        this.lastDownloadTime = 0; // ダウンロード制限用
        this.downloadCooldown = 5000; // 5秒のクールダウン
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
            
            // 初回のみサイレントダウンロード（バックアップ用）
            if (!this.checkLocalINIExists()) {
                this.silentDownload(iniContent);
                console.log('Initial backup downloaded');
            }
            
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
     * サイレントダウンロード（バックアップ用）- ダウンロード制限付き
     */
    silentDownload(content) {
        try {
            // ダウンロード制限チェック
            const now = Date.now();
            if (now - this.lastDownloadTime < this.downloadCooldown) {
                console.log('Download skipped (cooldown active)');
                return;
            }
            
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
            
            this.lastDownloadTime = now;
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
     * 設定保存（INI更新）- 改良版
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
        
        // フォールバック: サイレントダウンロード（制限付き）
        // ※頻繁な操作でのダウンロードを防ぐため、制限を設ける
        const now = Date.now();
        if (now - this.lastDownloadTime >= this.downloadCooldown) {
            this.silentDownload(iniContent);
            console.log('Settings cached, backup downloaded');
        } else {
            console.log('Settings cached (download skipped)');
        }
        
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

// INI設定保存のヘルパー関数（改良版）
function saveCurrentSettings() {
    if (autoINIManager) {
        // デバウンス処理を追加して頻繁な呼び出しを制限
        clearTimeout(saveCurrentSettings.timeout);
        saveCurrentSettings.timeout = setTimeout(() => {
            autoINIManager.saveSettings();
        }, 1000); // 1秒後に実行
    }
}
