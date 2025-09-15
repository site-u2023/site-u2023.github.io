console.log('custom.js loaded');

// OFSバージョン
window.addEventListener('load', () => {
    // バージョンテキストを更新
    const versionEl = document.getElementById('ofs-version');
    if (versionEl && typeof custom_ofs_version !== 'undefined') {
        versionEl.innerText = custom_ofs_version;
    }
    
    // リンク先を更新
    const linkEl = versionEl?.closest('a');
    if (linkEl && typeof custom_ofs_link !== 'undefined') {
        linkEl.href = custom_ofs_link;
        linkEl.target = "_blank";
    }
});

// ==================== グローバル変数 ====================
let customInitialized = false;
let customHTMLLoaded = false;
let packagesJson = null;
let setupConfig = null;
let formStructure = {};
let cachedApiInfo = null;
let cachedDeviceArch = null;
let defaultFieldValues = {};
let dynamicPackages = new Set();
let selectedLanguage = '';
let customLanguageMap = {};
let kmodsTokenCache = null;
let kmodsTokenCacheKey = null;
let packagesUrl;

// パッケージ存在確認キャッシュ（初回確認後は再利用）
const packageAvailabilityCache = new Map();
// フィード全体のキャッシュ（検索高速化用）
const feedCacheMap = new Map();

// デバイス固有パッケージ管理（重要：これらを常に維持）
let deviceDefaultPackages = [];  // mobj.default_packages
let deviceDevicePackages = [];   // mobj.device_packages  
let extraPackages = [];           // config.asu_extra_packages

// マルチインプットマネージャー用
let packageSearchManager = null;
let commandsManager = null;

// ==================== Vendor動的取得ヘルパー ====================
function getVendor() {
    // current_deviceから動的にvendorを取得
    if (current_device?.target) {
        const parts = current_device.target.split('/');
        return parts[0] || null;
    }
    return null;
}

function getSubtarget() {
    // current_deviceから動的にsubtargetを取得
    if (current_device?.target) {
        const parts = current_device.target.split('/');
        return parts[1] || '';
    }
    return '';
}

// ==================== 初期化処理 ====================
const originalUpdateImages = window.updateImages;

window.updateImages = function(version, mobj) {
    if (originalUpdateImages) originalUpdateImages(version, mobj);

    console.log('[TRACE] updateImages called with:', {
        version: version,
        target: mobj && mobj.target,
        subtarget: mobj && mobj.subtarget,
        arch: mobj && mobj.arch_packages,
        id: mobj && mobj.id
    });

    const oldArch = cachedDeviceArch;
    const oldVersion = current_device && current_device.version;

    if (mobj && mobj.arch_packages) {
        if (!current_device) current_device = {};

        current_device.arch = mobj.arch_packages;
        current_device.version = version;
        cachedDeviceArch = mobj.arch_packages;

        // targetを保存（vendorは動的に取得するため保存しない）
        current_device.target = mobj.target || '';
        if (mobj.id) current_device.id = mobj.id;

        console.log('[TRACE] current_device updated:', {
            ...current_device,
            vendor: getVendor(),  // 動的に取得
            subtarget: getSubtarget()  // 動的に取得
        });

        if (oldArch !== mobj.arch_packages || oldVersion !== version) {
            console.log('[TRACE] Device changed, clearing caches');
            packageAvailabilityCache.clear();
            feedCacheMap.clear();

            setTimeout(function() {
                const vendor = getVendor();
                if (!vendor) {
                    console.warn('[WARN] No vendor info, kmods may not verify');
                    console.log('[TRACE] current_device state:', current_device);
                }

                const indicator = document.querySelector('#package-loading-indicator');
                if (indicator) {
                    indicator.style.display = 'block';
                    const span = indicator.querySelector('span');
                    if (span) span.className = 'tr-checking-packages';
                }

                verifyAllPackages().then(function() {
                    if (indicator) indicator.style.display = 'none';
                    console.log('[TRACE] Package verification complete');
                }).catch(function(err) {
                    console.error('[ERROR] Package verification failed:', err);
                    if (indicator) {
                        indicator.innerHTML = '<span class="tr-package-check-failed">Package availability check failed</span>';
                        setTimeout(() => { indicator.style.display = 'none'; }, 3000);
                    }
                });
            }, 100);
        }
    }

    if (mobj && "manifest" in mobj === false) {
        deviceDefaultPackages = mobj.default_packages || [];
        deviceDevicePackages = mobj.device_packages || [];
        extraPackages = config.asu_extra_packages || [];

        if (!current_device) current_device = {};

        // targetを保存（vendorは動的に取得）
        current_device.target = mobj.target || '';
        current_device.version = version || current_device.version;
        current_device.arch = mobj.arch_packages || current_device.arch;

        console.log('[TRACE] Device packages saved:', {
            default: deviceDefaultPackages.length,
            device: deviceDevicePackages.length,
            extra: extraPackages.length,
            vendor: getVendor()  // 動的に取得
        });

        const initialPackages = deviceDefaultPackages
            .concat(deviceDevicePackages)
            .concat(extraPackages);

        const textarea = document.querySelector('#asu-packages');
        if (textarea) {
            textarea.value = initialPackages.join(' ');
            console.log('[TRACE] Initial packages set:', initialPackages);
            setTimeout(() => {
                textarea.style.height = 'auto';
                textarea.style.height = textarea.scrollHeight + 'px';
            }, 50);
        }

        if (customInitialized) {
            setTimeout(() => {
                updateAllPackageState('device-packages-loaded');
            }, 100);
        }
    }

    if (!customHTMLLoaded) {
        console.log('[TRACE] Loading custom.html');
        loadCustomHTML();
        customHTMLLoaded = true;
    } else if (customInitialized && current_device && current_device.arch) {
        const deviceLang = config.device_language || (config && config.fallback_language) || 'en';
        console.log('[TRACE] Updating language packages for:', deviceLang);
        syncDeviceLanguageSelector(deviceLang);
        updateAllPackageState('device-changed-force');
    }
};

// ==================== 統合パッケージ管理システム ====================
// 前回のフォーム状態ハッシュを保持
let lastFormStateHash = null;

// Fix for updateAllPackageState - add safety check
async function updateAllPackageState(source = 'unknown') {
    // CRITICAL FIX: Don't proceed if device packages aren't loaded yet
    if (!customInitialized && (deviceDefaultPackages.length === 0 && deviceDevicePackages.length === 0)) {
        console.log('updateAllPackageState: Device packages not ready, deferring update from:', source);
        return;
    }

    // 現在のフォーム状態を収集
    const currentState = collectFormValues();
    const hash = JSON.stringify(currentState);

    // 前回と同じ状態ならスキップ（device package loading は例外）
    if (hash === lastFormStateHash && !source.includes('device') && !source.includes('force')) {
        return;
    }
    lastFormStateHash = hash;

    console.log(`updateAllPackageState called from: ${source}`);

    // 1. setup.jsonベースの仮想チェックボックス操作
    updateSetupJsonPackagesCore();

    // 2. 言語パッケージの更新
    await updateLanguagePackageCore();

    // 3. Postinstテキストエリアへの反映（差分検知付き）
    updatePackageListToTextarea(source);

    // 4. setup.sh変数の更新
    updateVariableDefinitions();

    console.log('All package state updated successfully');
}

// Core関数1: setup.jsonベースの仮想チェックボックス操作（新実装）
function updateSetupJsonPackagesCore() {
    if (!setupConfig) return;
    
    setupConfig.categories.forEach(category => {
        category.packages.forEach(pkg => {
            if (pkg.type === 'radio-group' && pkg.variableName) {
                const selectedValue = getFieldValue(`input[name="${pkg.variableName}"]:checked`);
                if (selectedValue) {
                    console.log(`Radio group ${pkg.variableName} selected: ${selectedValue}`);
                    
                    // 全ての選択肢を先にリセット
                    pkg.options.forEach(opt => {
                        if (opt.value !== selectedValue) {
                            // 非選択状態のパッケージを無効化
                            toggleVirtualPackagesByType(pkg.variableName, opt.value, false);
                        }
                    });
                    
                    // 選択されたオプションのパッケージを有効化
                    toggleVirtualPackagesByType(pkg.variableName, selectedValue, true);
                    
                    // AUTO時の特別処理
                    if (pkg.variableName === 'connection_type' && selectedValue === 'auto' && cachedApiInfo) {
                        console.log('AUTO mode with API info, applying specific packages');
                        if (cachedApiInfo.mape?.brIpv6Address) {
                            console.log('Enabling MAP-E package');
                            toggleVirtualPackage('map', true);
                        } else if (cachedApiInfo.aftr) {
                            console.log('Enabling DS-Lite package');
                            toggleVirtualPackage('ds-lite', true);
                        }
                    }
                }
            }
        });
    });
}

// 仮想パッケージチェックボックス操作関数
function toggleVirtualPackage(packageId, enabled) {
    // packages.jsonから隠しパッケージも含めて検索
    const pkg = findPackageById(packageId);
    if (!pkg) {
        console.warn(`Virtual package not found in packages.json: ${packageId}`);
        return;
    }
    
    // uniqueIdがある場合はそれを使用、なければidを使用
    const searchId = pkg.uniqueId || pkg.id;
    const checkbox = document.querySelector(`[data-package="${packageId}"], [data-unique-id="${searchId}"]`);
    
    if (checkbox) {
        const wasChecked = checkbox.checked;
        checkbox.checked = enabled;
        
        if (wasChecked !== enabled) {
            console.log(`Virtual package ${packageId} (${searchId}): ${enabled ? 'enabled' : 'disabled'}`);
            
            // 依存関係も処理
            const dependencies = checkbox.getAttribute('data-dependencies');
            if (dependencies && enabled) {
                dependencies.split(',').forEach(depId => {
                    const depPkg = findPackageById(depId);
                    if (depPkg) {
                        const depSearchId = depPkg.uniqueId || depPkg.id;
                        const depCheckbox = document.querySelector(`[data-package="${depId}"], [data-unique-id="${depSearchId}"]`);
                        if (depCheckbox) {
                            depCheckbox.checked = true;
                            console.log(`Virtual dependency ${depId}: enabled`);
                        }
                    }
                });
            }
        }
    } else {
        console.warn(`Checkbox not found for virtual package: ${packageId} (searched: ${searchId})`);
    }
}

// タイプ別仮想パッケージ操作関数（新規追加）
function toggleVirtualPackagesByType(type, value, enabled) {
    const packageMap = {
        'connection_type': {
            'mape': ['map'],
            'dslite': ['ds-lite']
        },
        'wifi_mode': {
            'usteer': ['usteer-from-setup']
        }
    };
    
    const packages = packageMap[type]?.[value];
    if (packages) {
        console.log(`Toggle packages for ${type}=${value}: ${packages.join(', ')} -> ${enabled}`);
        packages.forEach(pkgId => {
            toggleVirtualPackage(pkgId, enabled);
        });
    } else {
        console.log(`No virtual packages defined for ${type}=${value}`);
    }
}

// Core関数2: 言語パッケージ更新（UI更新なし）
async function updateLanguagePackageCore() {
    // デバイス用言語セレクターから現在の言語を取得
    selectedLanguage = config.device_language || config?.fallback_language || 'en';
    
    console.log(`Language package update - Selected language: ${selectedLanguage}`);

    // 既存の言語パッケージを一旦全て削除
    const removedPackages = [];
    for (const pkg of Array.from(dynamicPackages)) {
        if (pkg.startsWith('luci-i18n-')) {
            dynamicPackages.delete(pkg);
            removedPackages.push(pkg);
        }
    }
    
    if (removedPackages.length > 0) {
        console.log('Removed old language packages:', removedPackages);
    }

    // 英語が選択されているか、デバイス情報がない場合は終了
    const hasArch = current_device?.arch || cachedDeviceArch;
    if (!selectedLanguage || selectedLanguage === 'en' || !hasArch) {
        console.log('Skipping language packages - English or no arch info');
        return;
    }
    
    // 現在の全パッケージリスト（LuCIパッケージ検出用）
    const currentPackages = getCurrentPackageListForLanguage();
    console.log(`Checking language packages for ${currentPackages.length} packages`);
    
    const addedLangPackages = new Set();
    
    // 基本言語パッケージをチェック
    const basePkg = `luci-i18n-base-${selectedLanguage}`;
    const firewallPkg = `luci-i18n-firewall-${selectedLanguage}`;
    
    try {
        if (await isPackageAvailable(basePkg, 'luci')) {
            dynamicPackages.add(basePkg);
            addedLangPackages.add(basePkg);
            console.log('Added base language package:', basePkg);
        }

        if (await isPackageAvailable(firewallPkg, 'luci')) {
            dynamicPackages.add(firewallPkg);
            addedLangPackages.add(firewallPkg);
            console.log('Added firewall language package:', firewallPkg);
        }
    } catch (err) {
        console.error('Error checking base/firewall package:', err);
    }

    // 全LuCIパッケージに対する言語パッケージを並行チェック
    const checkPromises = [];
    
    for (const pkg of currentPackages) {
        // 通常のLuCIパッケージと仮想パッケージの両方を処理
        let luciName = null;
        
        if (pkg.startsWith('luci-') && !pkg.startsWith('luci-i18n-')) {
            luciName = extractLuciName(pkg);
        } else if (pkg === 'usteer-from-setup') {
            // 仮想パッケージの特別処理
            luciName = 'usteer';
        }
        
        if (luciName) {
            const langPkg = `luci-i18n-${luciName}-${selectedLanguage}`;
            
            const promise = (async () => {
                try {
                    if (await isPackageAvailable(langPkg, 'luci')) {
                        dynamicPackages.add(langPkg);
                        addedLangPackages.add(langPkg);
                        console.log(`Added LuCI language package: ${langPkg} for ${pkg}`);
                    }
                } catch (err) {
                    console.error(`Error checking LuCI package ${langPkg}:`, err);
                }
            })();
            checkPromises.push(promise);
        }
    }

    await Promise.all(checkPromises);
    
    if (addedLangPackages.size > 0) {
        console.log(`Language package update complete: ${addedLangPackages.size} packages added`);
    }
}

// LuCI言語パッケージ用の完全なパッケージリスト取得
function getCurrentPackageListForLanguage() {
    const packages = new Set();
    
    // デバイス初期パッケージ
    deviceDefaultPackages.forEach(pkg => packages.add(pkg));
    deviceDevicePackages.forEach(pkg => packages.add(pkg));
    extraPackages.forEach(pkg => packages.add(pkg));
    
    // パッケージセレクターから選択されたパッケージ（隠しパッケージ含む）
    // チェックされているもののみを取得
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        const uniqueId = cb.getAttribute('data-unique-id');
        
        if (pkgName) {
            packages.add(pkgName);
            // uniqueIdも追加（usteer-from-setupなど）
            if (uniqueId && uniqueId !== pkgName) {
                packages.add(uniqueId);
            }
        }
    });
    
    // 検索で追加されたパッケージ
    if (packageSearchManager) {
        const searchValues = packageSearchManager.getAllValues();
        searchValues.forEach(pkg => packages.add(pkg));
    }
    
    // 仮想パッケージ（setup.jsonドリブン）- 言語パッケージ以外
    for (const pkg of dynamicPackages) {
        if (!pkg.startsWith('luci-i18n-')) {
            packages.add(pkg);
        }
    }
    
    // テキストエリアからは手動追加分のみ取得（チェックボックス管理のパッケージは除外）
    const checkedPackageSet = new Set();
    document.querySelectorAll('.package-selector-checkbox').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        if (pkgName) checkedPackageSet.add(pkgName);
    });
    
    const textarea = document.querySelector('#asu-packages');
    if (textarea) {
        const textPackages = split(textarea.value);
        textPackages.forEach(pkg => {
            // チェックボックス管理外のパッケージのみ追加
            if (!pkg.startsWith('luci-i18n-') && !checkedPackageSet.has(pkg)) {
                packages.add(pkg);
            }
        });
    }
    
    return Array.from(packages);
}

// Core関数3: Postinstテキストエリア更新（最終的な統合・差分検知付き）
let lastPackageListHash = null;

function updatePackageListToTextarea(source = 'unknown') {
    // 基本パッケージセット（デバイス固有パッケージ）を準備
    const basePackages = new Set();

    // デバイス固有パッケージを必ず含める（最重要）
    if (deviceDefaultPackages.length === 0 && deviceDevicePackages.length === 0 && extraPackages.length === 0) {
        console.warn('updatePackageListToTextarea: Device packages not loaded yet, skipping update from:', source);
        return;
    }

    deviceDefaultPackages.forEach(pkg => basePackages.add(pkg));
    deviceDevicePackages.forEach(pkg => basePackages.add(pkg));
    extraPackages.forEach(pkg => basePackages.add(pkg));

    console.log(`Base device packages loaded: default=${deviceDefaultPackages.length}, device=${deviceDevicePackages.length}, extra=${extraPackages.length}`);

    // チェックされたパッケージを追加
    const checkedPackages = new Set();
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        if (pkgName) {
            checkedPackages.add(pkgName);
        }
    });

    // 検索で追加されたパッケージを取得
    const searchedPackages = new Set();
    if (packageSearchManager) {
        const searchValues = packageSearchManager.getAllValues();
        searchValues.forEach(pkg => searchedPackages.add(pkg));
    }

    // 既知のUI管理パッケージ集合を事前に構築
    const knownSelectablePackages = new Set();
    if (packagesJson?.categories) {
        packagesJson.categories.forEach(cat => {
            (cat.packages || []).forEach(pkg => {
                if (pkg.id) knownSelectablePackages.add(pkg.id);
            });
        });
    }

    // テキストエリアから既存パッケージを取得（上記以外の手動入力パッケージを保持）
    const manualPackages = new Set();
    const textarea = document.querySelector('#asu-packages');
    if (textarea) {
        const currentPackages = split(textarea.value);
        currentPackages.forEach(pkg => {
            // UI管理対象は manual に残さない（チェックボックス管理のパッケージを確実に除外）
            const isCheckboxManaged = document.querySelector(`.package-selector-checkbox[data-package="${pkg}"]`) !== null;
        
            if (!basePackages.has(pkg) &&
                !checkedPackages.has(pkg) &&
                !searchedPackages.has(pkg) &&
                !dynamicPackages.has(pkg) &&
                !pkg.startsWith('luci-i18n-') &&
                !knownSelectablePackages.has(pkg) &&
                !isCheckboxManaged) {
                manualPackages.add(pkg);
            }
        });
    }

    // ===== 最終パッケージリスト構築 =====
    const finalPackages = [
        ...basePackages,
        ...checkedPackages,
        ...searchedPackages,
        ...dynamicPackages,
        ...manualPackages
    ];

    // 重複を削除
    const uniquePackages = [...new Set(finalPackages)];

    // 差分検知（前回と同じならスキップ）
    const currentHash = JSON.stringify(uniquePackages);
    if (currentHash === lastPackageListHash && source !== 'force-update') {
        console.log('updatePackageListToTextarea: No changes detected, skipping update from:', source);
        return;
    }
    lastPackageListHash = currentHash;

    // ログと更新処理
    console.log(`updatePackageListToTextarea called from: ${source}`);
    console.log(`Package breakdown:`, {
        base: basePackages.size,
        checked: checkedPackages.size,
        searched: searchedPackages.size,
        dynamic: dynamicPackages.size,
        manual: manualPackages.size,
        total: uniquePackages.length
    });

    if (textarea) {
        textarea.value = uniquePackages.join(' ');
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }

    console.log(`Postinst package list updated: ${uniquePackages.length} packages`);
    console.log('Final Postinst package list:', uniquePackages);
}

// ==================== 共通マルチインプット管理機能 ====================
class MultiInputManager {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`Container ${containerId} not found`);
            return;
        }
        
        this.options = {
            placeholder: options.placeholder || 'Type and press Enter',
            className: options.className || 'multi-input-item',
            onAdd: options.onAdd || (() => {}),
            onRemove: options.onRemove || (() => {}),
            onChange: options.onChange || (() => {}),
            autocomplete: options.autocomplete || null
        };
        
        this.inputs = [];
        this.init();
    }
    
    init() {
        // コンテナをクリア
        this.container.innerHTML = '';
        this.container.className = 'multi-input-container';
        
        // 初期インプットボックスを追加
        this.addInput('', true);
    }
    
    addInput(value = '', focus = false) {
        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'multi-input-wrapper';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = this.options.className;
        input.placeholder = this.options.placeholder;
        input.value = value;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.autocapitalize = 'off';
        
        // イベントリスナー設定
        input.addEventListener('keydown', (e) => this.handleKeyDown(e, input));
        input.addEventListener('input', (e) => this.handleInput(e, input));
        input.addEventListener('blur', (e) => this.handleBlur(e, input));
        
        inputWrapper.appendChild(input);
        this.container.appendChild(inputWrapper);
        this.inputs.push(input);
        
        if (focus) {
            setTimeout(() => input.focus(), 10);
        }
        
        if (value) {
            this.options.onAdd(value);
        }
        
        return input;
    }
    
    handleKeyDown(e, input) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const value = input.value.trim();
            
            if (value) {
                // 現在の値を確定
                input.setAttribute('data-confirmed', 'true');
                
                // 新しいインプットボックスを追加
                this.addInput('', true);
                
                // コールバック実行
                this.options.onChange(this.getAllValues());
            }
        } else if (e.key === 'Backspace' && input.value === '' && this.inputs.length > 1) {
            // 空のインプットでBackspaceを押した場合、前のインプットにフォーカス
            const index = this.inputs.indexOf(input);
            if (index > 0) {
                this.inputs[index - 1].focus();
                // カーソルを末尾に設定
                const prevInput = this.inputs[index - 1];
                prevInput.setSelectionRange(prevInput.value.length, prevInput.value.length);
            }
        }
    }
    
    handleInput(e, input) {
        const value = input.value.trim();
    
        // オートコンプリート処理
        if (this.options.autocomplete && value.length >= 2) {
            this.options.autocomplete(value, input);
        }
    
        // 候補選択によるプログラム的な値変更の場合はログ化をスキップ
        if (!input.dataset.programmaticChange) {
            // コールバック実行
            this.options.onChange(this.getAllValues());
        }
    
        // フラグをクリア
        delete input.dataset.programmaticChange;
    }
    
    handleBlur(e, input) {
        const value = input.value.trim();
        const index = this.inputs.indexOf(input);
        
        // 候補選択による処理中はスキップ
        if (input.dataset.skipBlur) {
            delete input.dataset.skipBlur;
            return;
        }
        
        // 値が空で、最後のインプットでない場合は削除
        if (value === '' && this.inputs.length > 1 && index !== this.inputs.length - 1) {
            this.removeInput(input);
        }
        
        // 最後のインプットに値がある場合、新しいインプットを追加（confirmed済みは除外）
        if (value && index === this.inputs.length - 1 && !input.getAttribute('data-confirmed')) {
            this.addInput('', false);
        }
    }
    
    removeInput(input) {
        const index = this.inputs.indexOf(input);
        if (index > -1 && this.inputs.length > 1) {
            const value = input.value.trim();
            
            // DOMから削除
            input.parentElement.remove();
            
            // 配列から削除
            this.inputs.splice(index, 1);
            
            // コールバック実行
            if (value) {
                this.options.onRemove(value);
            }
            this.options.onChange(this.getAllValues());
        }
    }
    
    getAllValues() {
        return this.inputs
            .map(input => input.value.trim())
            .filter(value => value !== '');
    }
    
    setValues(values) {
        // 全てクリア
        this.container.innerHTML = '';
        this.inputs = [];
        
        // 値を設定
        if (values && values.length > 0) {
            values.forEach(value => {
                this.addInput(value, false);
            });
        }
        
        // 最後に空のインプットを追加
        this.addInput('', false);
    }
}

// custom.html 読み込み
async function loadCustomHTML() {
    try {
        const response = await fetch('custom.html?t=' + Date.now());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        console.log('custom.html loaded');

        const temp = document.createElement('div');
        temp.innerHTML = html;
        waitForAsuAndInit(temp);
    } catch (err) {
        console.error('Failed to load custom.html:', err);
    }
}

// #asu が存在するまで待機
function waitForAsuAndInit(temp, retry = 50) {
    const asuSection = document.querySelector('#asu');
    if (asuSection) {
        initializeCustomFeatures(asuSection, temp);
    } else if (retry > 0) {
        setTimeout(() => waitForAsuAndInit(temp, retry - 1), 50);
    } else {
        console.warn('#asu not found after waiting');
    }
}

// ==================== パッケージ検索機能 ====================
function setupPackageSearch() {
    console.log('setupPackageSearch called');
    
    const searchContainer = document.getElementById('package-search-autocomplete');
    
    if (!searchContainer) {
        console.log('package-search-autocomplete container not found');
        return;
    }
    
    // 既存のインプットを削除
    const oldInput = document.getElementById('package-search');
    if (oldInput) {
        oldInput.remove();
    }
    
    // マルチインプットマネージャーを初期化
    packageSearchManager = new MultiInputManager('package-search-autocomplete', {
        placeholder: 'Type package name and press Enter',
        className: 'multi-input-item package-search-input',
        onAdd: (packageName) => {
            console.log('Package added:', packageName);
            // 動的にパッケージリストを更新
            updateAllPackageState('package-search-add');
        },
        onRemove: (packageName) => {
            console.log('Package removed:', packageName);
            // 動的にパッケージリストを更新
            updateAllPackageState('package-search-remove');
        },
        onChange: (values) => {
            // console.log('Package list changed:', values);
        },
        autocomplete: (query, inputElement) => {
            // console.log('Searching for packages:', query);
            searchPackages(query, inputElement);
        }
    });
    
    console.log('Package search setup complete');
}

// パッケージ検索実行
async function searchPackages(query, inputElement) {
    // console.log('searchPackages called with query:', query);
    
    const arch = current_device?.arch || cachedDeviceArch;
    const version = current_device?.version || document.querySelector("#versions")?.value;
    const vendor = getVendor();  // 動的に取得
    
    // デバッグ用ログ
    if (query.toLowerCase().startsWith('kmod-') && !vendor) {
        console.log('searchPackages - current_device:', current_device);
        console.log('searchPackages - vendor not available');
    }
    
    const allResults = new Set();
    
    // kmod-で始まる場合はkmodsフィードのみ検索
    // それ以外は通常のフィードを検索
    let feeds;
    if (query.toLowerCase().startsWith('kmod-')) {
        feeds = vendor ? ['kmods'] : [];
        if (feeds.length === 0) {
            console.log('Cannot search kmods without vendor information');
        }
    } else {
        feeds = ['packages', 'luci'];
    }
    
    for (const feed of feeds) {
        try {
            // console.log(`Searching in feed: ${feed}`);
            const results = await searchInFeed(query, feed, version, arch);
            results.forEach(pkg => allResults.add(pkg));
        } catch (err) {
            console.error(`Error searching ${feed}:`, err);
        }
    }
    
    const sortedResults = Array.from(allResults).sort((a, b) => {
        const q = query.toLowerCase();
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();
        
        // 完全一致を最上位に
        const aExact = (aLower === q);
        const bExact = (bLower === q);
        if (aExact && !bExact) return -1;
        if (bExact && !aExact) return 1;

        // 完全一致同士 → 名前順
        if (aExact && bExact) return a.localeCompare(b);

        // 部分一致同士 → 名前順
        return a.localeCompare(b);
    });

    console.log(`Found ${sortedResults.length} packages`);
    
    showPackageSearchResults(sortedResults, inputElement);
}

// フィード内検索（キャッシュ機能付き）
async function searchInFeed(query, feed, version, arch) {
    const vendor = getVendor();  // 動的に取得
    const cacheKey = `${version}:${arch}:${feed}`;

    try {
        let packages = [];

        if (feedCacheMap.has(cacheKey)) {
            packages = feedCacheMap.get(cacheKey);
        } else {
            let url;
            if (feed === 'kmods') {
                console.log('[DEBUG] vendor value:', vendor);
                // vendorが必須
                if (!vendor) {
                    console.warn('[WARN] Missing vendor for kmods search');
                    return [];
                }
                url = await buildKmodsUrl(version, vendor, version.includes('SNAPSHOT'));
                console.log('[DEBUG] kmods search URL:', url);
            } else if (version.includes('SNAPSHOT')) {
                url = config.apk_search_url
                    .replace('{arch}', arch)
                    .replace('{feed}', feed);
                console.log('[DEBUG] snapshot search URL:', url);
            } else {
                url = config.opkg_search_url
                    .replace('{version}', version)
                    .replace('{arch}', arch)
                    .replace('{feed}', feed);
                console.log('[DEBUG] opkg search URL:', url);
            }

            const resp = await fetch(url, { cache: 'force-cache' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            if (version.includes('SNAPSHOT') || (feed === 'kmods' && version.includes('SNAPSHOT'))) {
                const data = await resp.json();
                if (data.packages && typeof data.packages === 'object') {
                    packages = Object.keys(data.packages);
                }
            } else {
                const text = await resp.text();
                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.startsWith('Package: ')) {
                        packages.push(line.substring(9).trim());
                    }
                }
            }

            feedCacheMap.set(cacheKey, packages);
        }

        return packages.filter(pkgName =>
            pkgName.toLowerCase().includes(query.toLowerCase())
        );
    } catch (err) {
        console.error('searchInFeed error:', err);
        return [];
    }
}

// 検索結果表示
function showPackageSearchResults(results, inputElement) {
    // console.log('showPackageSearchResults:', results.length, 'results');
    
    clearPackageSearchResults();
    
    if (!results || results.length === 0) return;
    
    const container = document.getElementById('package-search-autocomplete');
    if (!container) return;
    
    const resultsDiv = document.createElement('div');
    resultsDiv.className = 'package-search-results';
    
    // 全ての結果を表示
    results.forEach(pkgName => {
        const item = document.createElement('div');
        item.textContent = pkgName;
        
        item.onmousedown = (e) => {
            e.preventDefault(); // blurイベントの発生を防止
            
            console.log('Package selected:', pkgName);
            
            // プログラム的変更フラグを設定
            inputElement.dataset.programmaticChange = 'true';
            inputElement.value = pkgName;
            
            // 手動でconfirmedマークを設定
            inputElement.setAttribute('data-confirmed', 'true');
            
            // 現在の入力が最後の入力の場合のみ新しい入力を追加
            const inputIndex = packageSearchManager.inputs.indexOf(inputElement);
            if (inputIndex === packageSearchManager.inputs.length - 1) {
                packageSearchManager.addInput('', true);
            }
            
            clearPackageSearchResults();
            
            // 変更通知とパッケージリスト更新
            packageSearchManager.options.onChange(packageSearchManager.getAllValues());
            updateAllPackageState('package-selected');
        };
  
        resultsDiv.appendChild(item);
    });
    
    container.appendChild(resultsDiv);
}

// 検索結果クリア
function clearPackageSearchResults() {
    const results = document.querySelectorAll('.package-search-results');
    results.forEach(el => el.remove());
}

// クリックで検索結果を閉じる
document.addEventListener('click', function(e) {
    if (!e.target.closest('#package-search-autocomplete')) {
        clearPackageSearchResults();
    }
});

// #asuセクションを置き換え（index.js互換要素を維持）
function replaceAsuSection(asuSection, temp) {
    const newDiv = document.createElement('div');
    newDiv.id = 'asu';
    newDiv.className = asuSection.className;
    newDiv.style.width = '100%';
    
    // custom.htmlから必要な要素を移動
    const customPackages = temp.querySelector('#custom-packages-section details');
    const customScripts = temp.querySelector('#custom-scripts-section details');

    if (customPackages) {
        customPackages.id = 'custom-packages-details';
        newDiv.appendChild(customPackages);
    }
    if (customScripts) {
        customScripts.id = 'custom-scripts-details';
        newDiv.appendChild(customScripts);
    }

    // index.jsが期待する全てのDOM要素を直接追加（隠しテキストエリアを含む）
    const buildElements = document.createElement('div');
    buildElements.innerHTML = `
        <br>
        <div id="asu-buildstatus" class="hide">
            <span></span>
            <div id="asu-log" class="hide">
                <details>
                    <summary>
                        <code>STDERR</code>
                    </summary>
                    <pre id="asu-stderr"></pre>
                </details>
                <details>
                    <summary>
                        <code>STDOUT</code>
                    </summary>
                    <pre id="asu-stdout"></pre>
                </details>
            </div>
        </div>
        <!-- index.js用の隠しパッケージリスト -->
        <textarea id="asu-packages" style="display:none;"></textarea>
        <a href="javascript:buildAsuRequest()" class="custom-link">
            <span></span><span class="tr-request-build">REQUEST BUILD</span>
        </a>
    `;
    
    // 子要素を追加
    while (buildElements.firstChild) {
        newDiv.appendChild(buildElements.firstChild);
    }
    
    asuSection.parentNode.replaceChild(newDiv, asuSection);
}

// 既存要素クリーンアップ
function cleanupExistingCustomElements() {
    ['#custom-packages-details', '#custom-scripts-details', '#extended-build-info']
        .forEach(selector => {
            const element = document.querySelector(selector);
            if (element) {
                element.remove();
                console.log(`Removed existing ${selector}`);
            }
        });
}

// ==================== 言語セレクター設定 ====================
function setupLanguageSelector() {
    const mainLanguageSelect = document.querySelector('#languages-select');
    const customLanguageSelect = document.querySelector('#aios-language');
    const fallback = config?.fallback_language || 'en';

    // 初期言語設定
    if (!current_language) {
        current_language = (navigator.language || fallback).split('-')[0];
    }
    if (!config.device_language) {
        config.device_language = current_language; // 最初だけコピー
    }

    // 初期同期（イベント登録前に実行）
    if (mainLanguageSelect) {
        mainLanguageSelect.value = current_language;
    }
    if (customLanguageSelect) {
        customLanguageSelect.value = config.device_language;
    }

    window.selectedLanguage = config.device_language;
    console.log('Language setup - Browser:', current_language, 'Device:', config.device_language);

    // イベント登録（初期同期後に行う）
    if (mainLanguageSelect) {
        mainLanguageSelect.removeEventListener('change', handleMainLanguageChange);
        mainLanguageSelect.addEventListener('change', handleMainLanguageChange);
    }
    if (customLanguageSelect) {
        customLanguageSelect.removeEventListener('change', handleCustomLanguageChange);
        customLanguageSelect.addEventListener('change', handleCustomLanguageChange);
    }

    updateAllPackageState('initial-language');
}

function syncBrowserLanguageSelector(lang) {
    const mainSelect = document.getElementById('languages-select');
    if (lang && mainSelect && mainSelect.value !== lang) {
        mainSelect.value = lang;
        console.log('Browser language selector synced to:', lang);
    }
}

function syncDeviceLanguageSelector(lang) {
    const customSelect = document.getElementById('aios-language');
    if (lang && customSelect && customSelect.value !== lang) {
        // イベントリスナーを一時削除
        customSelect.removeEventListener('change', handleCustomLanguageChange);
        
        // 値を変更
        customSelect.value = lang;
        
        // イベントリスナーを再追加
        customSelect.addEventListener('change', handleCustomLanguageChange);
        
        console.log('Device language selector synced to:', lang);
    }
    // デバイス言語の表示用スナップショット
    selectedLanguage = lang;
}

// メイン言語セレクター変更ハンドラー（ブラウザ用 → デバイス用に片方向同期）
async function handleMainLanguageChange(e) {
    const newLanguage = e?.target?.value || config?.fallback_language || 'en';
    if (newLanguage === current_language) return;

    // ユーザー操作かプログラム変更かを判定
    const isUserAction = e && e.isTrusted === true;
    
    console.log('Main language change:', {
        newLanguage,
        oldLanguage: current_language,
        isUserAction,
        willSyncDevice: isUserAction
    });

    // ブラウザ用言語を更新
    current_language = newLanguage;
    
    // UI翻訳を更新
    await loadCustomTranslations(current_language);

    if (isUserAction) {
        // ユーザー操作の場合のみ、デバイス用を同期（片方向同期）
        const oldDeviceLanguage = config.device_language;
        config.device_language = current_language;
        
        // デバイス用セレクターを同期（イベントリスナー制御で無限ループ防止）
        syncDeviceLanguageSelector(config.device_language);
        
        console.log('Language sync completed:', {
            browser: current_language,
            device: config.device_language,
            changed: oldDeviceLanguage !== config.device_language
        });
        
        // パッケージ状態を更新（デバイス言語が変更された場合のみ）
        if (oldDeviceLanguage !== config.device_language) {
            updateAllPackageState('browser-language-changed');
        }
    } else {
        console.log('Programmatic change - device language not affected:', config.device_language);
    }
}

// カスタム言語セレクター変更ハンドラー（デバイス用 → ブラウザ用は同期しない）
async function handleCustomLanguageChange(e) {
    const newLanguage = e.target.value || config?.fallback_language || 'en';
    if (newLanguage === config.device_language) return;

    const oldDeviceLanguage = config.device_language;
    config.device_language = newLanguage;
    
    console.log('Device language change:', {
        newLanguage,
        oldLanguage: oldDeviceLanguage,
        browserUnchanged: current_language,
        note: 'Browser language intentionally not synced (one-way sync only)'
    });

    // デバイス言語の表示用スナップショットを更新
    selectedLanguage = config.device_language;

    // setup.shの変数定義を更新
    updateVariableDefinitions();
    
    // パッケージ状態を更新
    updateAllPackageState('device-language-changed');
}

async function loadCustomTranslations(lang) {
    // UI翻訳は必ず current_language を使う
    if (!lang) {
        lang = current_language || (navigator.language || config.fallback_language).split('-')[0];
    }
    
    const customLangFile = `langs/custom.${lang}.json`;
    try {
        const resp = await fetch(customLangFile, { cache: 'no-store' });

        if (!resp.ok) {
            if (lang !== config.fallback_language) {
                console.log(`Custom translation not found for ${lang}, falling back to ${config.fallback_language}`);
                return loadCustomTranslations(config.fallback_language);
            }
            console.log(`No custom translations available for ${lang}`);
            return;
        }

        const text = await resp.text();
        const customMap = JSON.parse(text);
        customLanguageMap = customMap;
        applyCustomTranslations(customLanguageMap);
        
        console.log(`Custom translations loaded for UI language: ${lang}`);
    } catch (err) {
        console.error(`Error loading custom translations for ${lang}:`, err);
        if (lang !== config.fallback_language) {
            return loadCustomTranslations(config.fallback_language);
        }
    }
}

function applyCustomTranslations(map) {
    if (!map || typeof map !== 'object') return;
    
    // current_language_jsonに統合
    Object.assign(current_language_json, map);
    
    // DOMに適用
    for (const tr in map) {
        document.querySelectorAll(`.${tr}`).forEach(e => {
            if ('placeholder' in e) {
                e.placeholder = map[tr];
            } else {
                e.innerText = map[tr];
            }
        });
    }
    
    console.log('Custom translations applied to DOM');
}

function extractLuciName(pkg) {
    if (pkg === 'luci') return 'base';
    
    // 特別なマッピング
    if (pkg === 'usteer-from-setup' || pkg === 'luci-app-usteer-setup') {
        return 'usteer';
    }

    // "luci-app-", "luci-mod-", "luci-theme-", "luci-proto-" のプレフィックスを除去
    const prefixMatch = pkg.match(/^luci-(?:app|mod|theme|proto)-(.+)$/);
    if (prefixMatch && prefixMatch[1]) {
        return prefixMatch[1];
    }
    return null;
}

function getCurrentPackageList() {
    const packages = new Set();
    
    // デバイス初期パッケージを必ず含める
    deviceDefaultPackages.forEach(pkg => packages.add(pkg));
    deviceDevicePackages.forEach(pkg => packages.add(pkg));
    extraPackages.forEach(pkg => packages.add(pkg));
    
    // パッケージセレクターから選択されたパッケージ
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        if (pkgName) packages.add(pkgName);
    });
    
    // 検索で追加されたパッケージ
    if (packageSearchManager) {
        const searchValues = packageSearchManager.getAllValues();
        searchValues.forEach(pkg => packages.add(pkg));
    }
    
    // テキストエリアから既存パッケージ（デバイス初期パッケージ以外）
    const textarea = document.querySelector('#asu-packages');
    if (textarea) {
        const textPackages = split(textarea.value);
        textPackages.forEach(pkg => {
            if (!deviceDefaultPackages.includes(pkg) && 
                !deviceDevicePackages.includes(pkg) && 
                !extraPackages.includes(pkg)) {
                packages.add(pkg);
            }
        });
    }
    
    // 動的パッケージ（非言語パッケージのみ）
    for (const pkg of dynamicPackages) {
        if (!pkg.startsWith('luci-i18n-')) {
            packages.add(pkg);
        }
    }
    
    return Array.from(packages);
}

function guessFeedForPackage(pkgName) {
    if (!pkgName) return 'packages';
    
    // kmod- パッケージは kmods フィードにある
    if (pkgName.startsWith('kmod-')) {
        return 'kmods';
    }
    
    if (pkgName.startsWith('luci-')) {
        return 'luci';
    }
    
    return 'packages';
}

// パッケージ存在チェック（キャッシュ対応版）
async function isPackageAvailable(pkgName, feed) {
    if (!pkgName || !feed) return false;

    const arch = current_device?.arch || cachedDeviceArch;
    const version = current_device?.version || $("#versions").value;
    const vendor = getVendor();  // 動的に取得

    if (!arch || !version) {
        console.log('Missing device info for package check:', { arch, version });
        return false;
    }

    const cacheKey = `${version}:${arch}:${feed}:${pkgName}`;
    if (packageAvailabilityCache.has(cacheKey)) {
        return packageAvailabilityCache.get(cacheKey);
    }

    try {
        let packagesUrl;
        let result = false;

        if (feed === 'kmods') {
            console.log('[DEBUG] vendor value:', vendor);
            // vendorが必須
            if (!vendor) {
                console.log('Missing vendor for kmods check');
                packageAvailabilityCache.set(cacheKey, false);
                return false;
            }
            packagesUrl = await buildKmodsUrl(version, vendor, version.includes('SNAPSHOT'));

            console.log(`[DEBUG] kmods packagesUrl: ${packagesUrl}`);

        } else if (version.includes('SNAPSHOT')) {
            packagesUrl = config.apk_search_url
                .replace('{arch}', arch)
                .replace('{feed}', feed);
        } else {
            packagesUrl = config.opkg_search_url
                .replace('{version}', version)
                .replace('{arch}', arch)
                .replace('{feed}', feed);
        }

        const resp = await fetch(packagesUrl, { cache: 'force-cache' });
        if (resp.ok) {
            if (version.includes('SNAPSHOT') || (feed === 'kmods' && version.includes('SNAPSHOT'))) {
                const data = await resp.json();
                if (Array.isArray(data.packages)) {
                    result = data.packages.some(p => p?.name === pkgName);
                } else if (data.packages && typeof data.packages === 'object') {
                    result = Object.prototype.hasOwnProperty.call(data.packages, pkgName);
                }
            } else {
                const text = await resp.text();
                result = text.split('\n').some(line => line.trim() === `Package: ${pkgName}`);
            }
        }

        packageAvailabilityCache.set(cacheKey, result);
        return result;
    } catch (err) {
        console.error('Package availability check error:', err);
        packageAvailabilityCache.set(cacheKey, false);
        return false;
    }
}

// パッケージリスト全体の存在確認（並列処理版）
async function verifyAllPackages() {    
    const arch = current_device?.arch || cachedDeviceArch;
    if (!packagesJson || !arch) {
        console.log('Cannot verify packages: missing data');
        return;
    }
    
    const startTime = Date.now();
    console.log('Starting package verification...');
    
    // 全パッケージを収集
    const packagesToVerify = [];
    
    packagesJson.categories.forEach(category => {
        category.packages.forEach(pkg => {
            // 隠しパッケージも確認対象に含める（仮想パッケージチェックボックス用）
            packagesToVerify.push({ 
                id: pkg.id, 
                uniqueId: pkg.uniqueId || pkg.id,
                feed: guessFeedForPackage(pkg.id),
                hidden: pkg.hidden || false,
                checked: pkg.checked || false
            });
            
            if (pkg.dependencies) {
                pkg.dependencies.forEach(depId => {
                    const depPkg = findPackageById(depId);
                    if (depPkg) {
                        packagesToVerify.push({ 
                            id: depPkg.id,
                            uniqueId: depPkg.uniqueId || depPkg.id,
                            feed: guessFeedForPackage(depPkg.id),
                            hidden: depPkg.hidden || false,
                            isDependency: true
                        });
                    }
                });
            }
        });
    });
    
    // 重複を除去
    const uniquePackages = Array.from(new Set(packagesToVerify.map(p => `${p.id}:${p.feed}`)))
        .map(key => {
            const [id, feed] = key.split(':');
            const pkg = packagesToVerify.find(p => p.id === id && p.feed === feed);
            return pkg;
        });
    
    console.log(`Verifying ${uniquePackages.length} unique packages...`);
    
    // バッチサイズを定義（一度に処理するパッケージ数）
    const BATCH_SIZE = 10;
    const batches = [];
    
    for (let i = 0; i < uniquePackages.length; i += BATCH_SIZE) {
        batches.push(uniquePackages.slice(i, i + BATCH_SIZE));
    }
    
    let unavailableCount = 0;
    let checkedUnavailable = [];
    
    // バッチごとに並列処理
    for (const batch of batches) {
        const promises = batch.map(async pkg => {
            const isAvailable = await isPackageAvailable(pkg.id, pkg.feed);
            
            // 隠しパッケージでない場合のみUIを更新
            if (!pkg.hidden) {
                updatePackageAvailabilityUI(pkg.uniqueId, isAvailable);
            }
            
            if (!isAvailable) {
                unavailableCount++;
                // 初期チェック済みで利用不可のパッケージを記録
                if (pkg.checked) {
                    checkedUnavailable.push(pkg.id);
                }
            }
            
            return { id: pkg.id, uniqueId: pkg.uniqueId, available: isAvailable };
        });
        
        // バッチの完了を待つ
        await Promise.all(promises);
    }
    
    const elapsedTime = Date.now() - startTime;
    console.log(`Package verification completed in ${elapsedTime}ms`);
    console.log(`${unavailableCount} packages are not available for this device`);
    
    if (checkedUnavailable.length > 0) {
        console.warn('The following pre-selected packages are not available:', checkedUnavailable);
    }
}

// パッケージ利用可能性に基づいてUIを更新
function updatePackageAvailabilityUI(uniqueId, isAvailable) {
    const checkbox = document.querySelector(`#pkg-${uniqueId}`);
    if (!checkbox) return;
    
    // パッケージアイテム全体を取得（メインパッケージと依存関係を含む）
    const packageItem = checkbox.closest('.package-item');
    if (!packageItem) {
        // 依存関係パッケージの場合はラベルを非表示
        const label = checkbox.closest('label');
        if (label) {
            if (!isAvailable) {
                label.style.display = 'none';
                // チェックボックスも無効化
                checkbox.checked = false;
                checkbox.disabled = true;
            } else {
                label.style.display = '';
                checkbox.disabled = false;
            }
        }
        return;
    }
    
    if (!isAvailable) {
        // 利用不可のパッケージは完全に非表示
        packageItem.style.display = 'none';
        // チェックボックスも無効化
        checkbox.checked = false;
        checkbox.disabled = true;
        
        // 依存関係のチェックボックスも無効化
        const depCheckboxes = packageItem.querySelectorAll('.package-dependent input[type="checkbox"]');
        depCheckboxes.forEach(depCb => {
            depCb.checked = false;
            depCb.disabled = true;
        });
    } else {
        // 利用可能なパッケージは表示
        packageItem.style.display = '';
        checkbox.disabled = false;
    }
    
    // カテゴリ内に表示されているパッケージがあるか確認
    updateCategoryVisibility(packageItem);
}

// カテゴリの表示/非表示を更新
function updateCategoryVisibility(packageItem) {
    const category = packageItem?.closest('.package-category');
    if (!category) return;
    
    // カテゴリ内の表示されているパッケージを数える
    const visiblePackages = category.querySelectorAll('.package-item:not([style*="display: none"])');
    
    if (visiblePackages.length === 0) {
        // 表示するパッケージがない場合はカテゴリ全体を非表示
        category.style.display = 'none';
    } else {
        // 表示するパッケージがある場合はカテゴリを表示
        category.style.display = '';
    }
}

// ==================== setup.json 処理 ====================
async function loadSetupConfig() {
    try {
        const url = config?.setup_db_path || 'uci-defaults/setup.json';
        const response = await fetch(url + '?t=' + Date.now());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        setupConfig = await response.json();
        console.log('Setup config loaded (JSON-driven mode):', setupConfig);
        
        formStructure = generateFormStructure(setupConfig);
        storeDefaultValues(setupConfig);
        renderSetupConfig(setupConfig);
        
        console.log('Setup config rendered successfully with JSON-driven features');
        return setupConfig;
    } catch (err) {
        console.error('Failed to load setup.json:', err);
        return null;
    }
}

function storeDefaultValues(config) {
    defaultFieldValues = {};
    
    function walkFields(pkg) {
        if (pkg.defaultValue !== undefined && pkg.id) {
            defaultFieldValues[pkg.id] = pkg.defaultValue;
        }
        if (pkg.children) {
            pkg.children.forEach(walkFields);
        }
        if (pkg.type === 'input-group' && pkg.rows) {
            pkg.rows.forEach(row => {
                if (row.columns) {
                    row.columns.forEach(walkFields);
                }
            });
        }
    }
    
    config.categories.forEach(category => {
        category.packages.forEach(walkFields);
    });
    
    console.log('Default values stored:', defaultFieldValues);
}

function renderSetupConfig(config) {
    const container = document.querySelector('#dynamic-config-sections');
    if (!container) {
        console.error('#dynamic-config-sections not found');
        return;
    }
    
    container.innerHTML = '';
    console.log('Container cleared, rebuilding...');

    (config.categories || []).forEach((category, categoryIndex) => {
        const section = document.createElement('div');
        section.className = 'config-section';
        section.id = category.id;

        const h4 = document.createElement('h4');
        h4.textContent = category.name || category.id || '';
        if (category.class) {
            h4.classList.add(category.class);
        }
        section.appendChild(h4);
        if (category.description) {
            const desc = document.createElement('p');
            desc.className = 'package-category-description';
            desc.textContent = category.description;
            section.appendChild(desc);
        }

        (category.packages || []).forEach((pkg, packageIndex) => {
            try {
                buildField(section, pkg);
            } catch (error) {
                console.error(`Error rendering package ${pkg.id}:`, error);
            }
        });

        container.appendChild(section);
    });
    
    setTimeout(() => {
        initConditionalSections(config);
        
        // ISP情報が既にある場合は再適用（GUA prefix を含む）
        if (cachedApiInfo) {
            applyIspAutoConfig(cachedApiInfo);
            console.log('Reapplied ISP config after form render');
        }
        
        // MAP-Eタイプの初期状態を処理
        const mapeTypeRadio = document.querySelector('input[name="mape_type"]:checked');
        if (mapeTypeRadio && mapeTypeRadio.value === 'pd') {
            const guaPrefixField = document.querySelector('#mape-gua-prefix');
            if (guaPrefixField) {
                const formGroup = guaPrefixField.closest('.form-group');
                if (formGroup) {
                    formGroup.style.display = 'none';
                    console.log('Initial PD mode: GUA prefix hidden');
                }
            }
        }
    }, 100);
}

function buildField(parent, pkg) {
    switch (pkg.type) {
        case 'input-group': {
            const rows = getRows(pkg);
            
            rows.forEach((row, rowIndex) => {
                const rowEl = document.createElement('div');
                rowEl.className = 'form-row';
                
                (row.columns || []).forEach((col, colIndex) => {
                    const groupEl = buildFormGroup(col);
                    if (groupEl) {
                        rowEl.appendChild(groupEl);
                    }
                });
                
                if (rowEl.children.length > 0) {
                    parent.appendChild(rowEl);
                }
            });
            break;
        }

        case 'radio-group': {
            const row = document.createElement('div');
            row.className = 'form-row';

            const group = document.createElement('div');
            group.className = 'form-group';

            if (pkg.name || pkg.label) {
                const legend = document.createElement('div');
                legend.className = 'form-label';
                if (pkg.class) legend.classList.add(pkg.class);
                legend.textContent = pkg.name || pkg.label;
                group.appendChild(legend);
            }

            const radioWrap = document.createElement('div');
            radioWrap.className = 'radio-group';
            
            (pkg.options || []).forEach(opt => {
                const lbl = document.createElement('label');
                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = pkg.variableName || pkg.id;
                radio.value = opt.value;
                
                if (opt.checked || (pkg.defaultValue != null && opt.value === pkg.defaultValue)) {
                    radio.checked = true;
                }
                
                radio.addEventListener('change', handleRadioChange);

                const textSpan = document.createElement('span');
                textSpan.textContent = ' ' + (opt.label != null ? opt.label : String(opt.value));
                if (opt.class) {
                    textSpan.classList.add(opt.class);
                }
                lbl.appendChild(radio);
                lbl.appendChild(textSpan);
                radioWrap.appendChild(lbl);
            });

            group.appendChild(radioWrap);
            row.appendChild(group);
            parent.appendChild(row);
            break;
        }

        case 'conditional-section': {
            const condWrap = document.createElement('div');
            condWrap.id = pkg.id;
            condWrap.className = 'conditional-section';
            condWrap.style.display = 'none';

            (pkg.children || []).forEach(child => {
                buildField(condWrap, child);
            });

            parent.appendChild(condWrap);
            break;
        }

        case 'info-display': {
            const infoDiv = document.createElement('div');
            infoDiv.id = pkg.id;
            infoDiv.className = 'info-display';
            if (pkg.class) {
                infoDiv.classList.add(pkg.class);
            }
            infoDiv.style.padding = '1em';
            infoDiv.style.backgroundColor = 'var(--bg-item)';
            infoDiv.style.borderRadius = '0.2em';
            infoDiv.style.marginTop = '0.5em';
            infoDiv.style.whiteSpace = 'pre-line';
            infoDiv.textContent = pkg.content || '';
            parent.appendChild(infoDiv);
            break;
        }
    }
}

function buildFormGroup(field) {
    if (!field) return null;

    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.textContent = field.label || field.name || field.id || '';
    if (field.id) label.setAttribute('for', field.id);
    if (field.class) {
        label.classList.add(field.class);
    }
    group.appendChild(label);

    let ctrl;
    if (field.type === 'select') {
        ctrl = document.createElement('select');
        if (field.id) ctrl.id = field.id;
        
        let optionsSource = [];
        if (field.id === 'aios-language') {
            const select = document.querySelector('#languages-select');
            if (select) {
                optionsSource = Array.from(select.querySelectorAll('option')).map(opt => ({
                    value: opt.value,
                    label: opt.textContent
                }));
            }
        } else {
            optionsSource = field.options || [];
        }

        optionsSource.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label != null ? opt.label : String(opt.value);
            if (opt.class) {
                option.classList.add(opt.class);
            }
            if (opt.selected || (field.defaultValue != null && opt.value === field.defaultValue)) {
                option.selected = true;
            }
            ctrl.appendChild(option);
        });

        // 言語セレクターは専用ハンドラーのみ
        if (field.id !== 'aios-language' && field.id !== 'languages-select') {
            ctrl.addEventListener('change', () => updateAllPackageState('form-field'));
        }
    } else {
        ctrl = document.createElement('input');
        ctrl.type = field.type || 'text';
        if (field.id) ctrl.id = field.id;
        if (field.placeholder) ctrl.placeholder = field.placeholder;        
        if (field.defaultValue !== null && field.defaultValue !== undefined && field.defaultValue !== '') {
            ctrl.value = field.defaultValue;
        } else if (field.apiMapping && cachedApiInfo) {
            const apiValue = getNestedValue(cachedApiInfo, field.apiMapping);
            if (apiValue !== null && apiValue !== undefined && apiValue !== '') {
                ctrl.value = apiValue;
            }
        }
        if (field.variableName === 'mape_gua_prefix') {
            setGuaPrefixIfAvailable();
        }        
        if (field.min != null) ctrl.min = field.min;
        if (field.max != null) ctrl.max = field.max;
        if (field.maxlength != null) ctrl.maxLength = field.maxlength;
        if (field.pattern != null) ctrl.pattern = field.pattern;
        
        // 言語セレクター以外の input のみ汎用リスナーを付ける
        if (field.id !== 'aios-language' && field.id !== 'languages-select') {
            ctrl.addEventListener('input', () => updateAllPackageState('form-field'));
        }
    }
    
    group.appendChild(ctrl);

    if (field.description) {
        const small = document.createElement('small');
        small.className = 'text-muted';
        small.textContent = field.description;
        group.appendChild(small);
    }

    return group;
}

function handleRadioChange(e) {
    const radio = e.target;
    
    // MAP-Eタイプ切り替え時の特別処理
    if (radio.name === 'mape_type') {
        toggleGuaPrefixVisibility(radio.value);
    }
    
    updateAllPackageState('radio-change');
}

// 条件表示の初期化
function initConditionalSections(config) {
    const conditionals = collectConditionals(config);
    const deps = buildDeps(conditionals);

    evaluateAll();

    for (const key of Object.keys(deps)) {
        const ctrls = findControlsByKey(key);
        
        ctrls.forEach(el => {
            const evt = el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number' || el.type === 'password') ? 'input' : 'change';
            el.addEventListener(evt, evaluateAll);
        });
    }

    function evaluateAll() {
        for (const cond of conditionals) {
            const visible = evaluateShowWhen(cond.showWhen, getControlValue);
            const el = document.getElementById(cond.id);
            if (!el) continue;
            el.style.display = visible ? '' : 'none';
        }
    }

    function getControlValue(key) {
        const keys = [key, key.replace(/-/g, '_'), key.replace(/_/g, '-')];

        for (const k of keys) {
            const radios = document.querySelectorAll(`input[type="radio"][name="${cssEscape(k)}"]`);
            if (radios.length) {
                const r = Array.from(radios).find(x => x.checked);
                if (r) return r.value;
            }
        }
        
        for (const k of keys) {
            const byId = document.getElementById(k);
            if (byId) return byId.value;
            const byName = document.querySelector(`[name="${cssEscape(k)}"]`);
            if (byName) return byName.value;
        }
        return '';
    }
}

function findControlsByKey(key) {
    const keys = [key, key.replace(/-/g, '_'), key.replace(/_/g, '-')];
    const controls = [];
    
    for (const k of keys) {
        const radios = document.querySelectorAll(`input[type="radio"][name="${cssEscape(k)}"]`);
        controls.push(...radios);
        
        const byId = document.getElementById(k);
        if (byId) controls.push(byId);
        
        const byName = document.querySelectorAll(`[name="${cssEscape(k)}"]`);
        controls.push(...byName);
    }
    
    return [...new Set(controls)];
}

function collectConditionals(config) {
    const out = [];
    walkConfig(config, node => {
        if (node.type === 'conditional-section' && node.id && node.showWhen && node.showWhen.field) {
            out.push({ id: node.id, showWhen: node.showWhen });
        }
    });
    return out;
}

function buildDeps(conditionals) {
    const map = {};
    for (const c of conditionals) {
        const key = c.showWhen.field;
        if (!map[key]) map[key] = [];
        map[key].push(c.id);
    }
    return map;
}

function evaluateShowWhen(showWhen, getVal) {
    if (!showWhen || !showWhen.field) return true;
    const v = String(getVal(showWhen.field) ?? '');
    if (Array.isArray(showWhen.values)) {
        return showWhen.values.map(String).includes(v);
    }
    return Boolean(v);
}

function walkConfig(config, fn) {
    for (const cat of (config.categories || [])) {
        for (const pkg of (cat.packages || [])) walkNode(pkg, fn);
    }
    function walkNode(node, fn) {
        fn(node);
        if (node.type === 'input-group') {
            const rows = getRows(node);
            rows.forEach(r => (r.columns || []).forEach(col => walkNode(col, fn)));
        } else if (node.type === 'conditional-section') {
            (node.children || []).forEach(ch => walkNode(ch, fn));
        }
    }
}

function getRows(group) {
    const rows = [];
    const COLUMNS_PER_ROW = 2; // デフォルト2列レイアウト
    const fields = group.fields || [];
    
    // フィールドをグループ化
    for (let i = 0; i < fields.length; i += COLUMNS_PER_ROW) {
        const columns = [];
        
        // 指定列数分のフィールドを追加
        for (let j = 0; j < COLUMNS_PER_ROW && (i + j) < fields.length; j++) {
            columns.push(fields[i + j]);
        }
        
        rows.push({ columns: columns });
    }
    
    return rows;
}

function cssEscape(s) {
    return String(s).replace(/"/g, '\\"');
}

function generateFormStructure(config) {
    const structure = {
        fields: {},           
        connectionTypes: {},  
        categories: {},       
        fieldMapping: {}      
    };
    
    config.categories.forEach(category => {
        structure.categories[category.id] = [];
        
        category.packages.forEach(pkg => {
            collectFieldsFromPackage(pkg, structure, category.id);
        });
    });
    
    return structure;
}

function collectFieldsFromPackage(pkg, structure, categoryId) {
    if (pkg.selector) {
        const fieldInfo = {
            id: pkg.id,
            selector: pkg.selector,
            variableName: pkg.variableName || pkg.id.replace(/-/g, '_'),
            defaultValue: pkg.defaultValue,
            apiMapping: pkg.apiMapping
        };
        
        structure.fields[pkg.id] = fieldInfo;
        structure.categories[categoryId].push(pkg.id);
        structure.fieldMapping[pkg.selector] = fieldInfo;
    }
    
    if (pkg.children) {
        pkg.children.forEach(child => {
            collectFieldsFromPackage(child, structure, categoryId);
        });
    }
    
    if (pkg.type === 'input-group') {
        const rows = getRows(pkg);
        rows.forEach(row => {
            (row.columns || []).forEach(col => {
                collectFieldsFromPackage(col, structure, categoryId);
            });
        });
    }
    
    if (pkg.id === 'connection-type' && pkg.variableName === 'connection_type') {
        const connectionSections = ['auto-section', 'dhcp-section', 'pppoe-section', 'dslite-section', 'mape-section', 'ap-section'];
        connectionSections.forEach(sectionId => {
            structure.connectionTypes[sectionId.replace('-section', '')] = [];
        });
    }
}

// ==================== フォーム値処理 ====================

function collectFormValues() {
    const values = {};
    
    Object.values(formStructure.fields).forEach(field => {
        const value = getFieldValue(field.selector);
        
        if (value !== null && value !== undefined && value !== "") {
            values[field.variableName] = value;
        }
    });
    
    // 言語設定を確実に取得
    if (!values.language) {
        const languageValue = getFieldValue('#aios-language') || selectedLanguage || 'en';
        if (languageValue && languageValue !== 'en') {
            values.language = languageValue;
        }
    }
    
    applySpecialFieldLogic(values);
    
    return values;
}

function getFieldValue(selector) {
    const element = document.querySelector(selector);
    if (!element) return null;
    
    if (element.type === 'radio') {
        const checked = document.querySelector(`input[name="${element.name}"]:checked`);
        return checked?.value;
    } else if (element.type === 'checkbox') {
        return element.checked ? element.value : null;
    }
    return element.value;
}

// ==================== フォーム値処理（JSONドリブン版） ====================
function applySpecialFieldLogic(values) {
    const connectionType = getFieldValue('input[name="connection_type"]');
    
    // JSONから接続タイプ別のフィールドを取得
    const allConnectionFields = [];
    
    if (setupConfig) {
        const internetCategory = setupConfig.categories.find(cat => cat.id === 'internet-config');
        if (internetCategory) {
            internetCategory.packages.forEach(pkg => {
                if (pkg.type === 'conditional-section' && pkg.connectionFields) {
                    allConnectionFields.push(...pkg.connectionFields);
                }
            });
        }
    }
    
    // 全ての接続関連フィールドをクリア
    const uniqueConnectionFields = [...new Set(allConnectionFields)];
    
    if (connectionType === 'auto') {
        uniqueConnectionFields.forEach(key => delete values[key]);
        
        if (cachedApiInfo) {
            if (cachedApiInfo.mape?.brIpv6Address) {
                values.mape_br = cachedApiInfo.mape.brIpv6Address;
                values.mape_ealen = cachedApiInfo.mape.eaBitLength;
                values.mape_ipv4_prefix = cachedApiInfo.mape.ipv4Prefix;
                values.mape_ipv4_prefixlen = cachedApiInfo.mape.ipv4PrefixLength;
                values.mape_ipv6_prefix = cachedApiInfo.mape.ipv6Prefix;
                values.mape_ipv6_prefixlen = cachedApiInfo.mape.ipv6PrefixLength;
                values.mape_psid_offset = cachedApiInfo.mape.psIdOffset;
                values.mape_psidlen = cachedApiInfo.mape.psidlen;
                
                const guaPrefix = generateGuaPrefixFromFullAddress(cachedApiInfo);
                if (guaPrefix) {
                    values.mape_gua_prefix = guaPrefix;
                }
            } else if (cachedApiInfo.aftr?.aftrIpv6Address) {
                values.dslite_aftr_address = cachedApiInfo.aftr.aftrIpv6Address;
            }
        }
    } else {
        const internetCategory = setupConfig?.categories.find(cat => cat.id === 'internet-config');
        if (internetCategory) {
            const selectedSection = internetCategory.packages.find(pkg => 
                pkg.type === 'conditional-section' && 
                pkg.showWhen?.values?.includes(connectionType)
            );
            
            if (selectedSection?.connectionFields) {
                uniqueConnectionFields.forEach(key => {
                    if (!selectedSection.connectionFields.includes(key)) {
                        delete values[key];
                    }
                });
                
                if (connectionType === 'dslite') {
                    if (cachedApiInfo?.aftr) {
                        values.dslite_aftr_type = cachedApiInfo.aftr.aftrType || '';
                        values.dslite_area = cachedApiInfo.aftr.jurisdiction || '';
                        values.dslite_aftr_address = cachedApiInfo.aftr.aftrIpv6Address || '';
                    }
                    
                    const uiType = getFieldValue('#dslite-aftr-type');
                    const uiArea = getFieldValue('#dslite-area');
                    const uiAddr = getFieldValue('#dslite-aftr-address');
                    if (uiType) values.dslite_aftr_type = uiType;
                    if (uiArea) values.dslite_area = uiArea;
                    if (cachedApiInfo?.aftr?.aftrIpv6Address) {
                        values.dslite_aftr_address = cachedApiInfo.aftr.aftrIpv6Address;
                    } else if (uiAddr) {
                        values.dslite_aftr_address = uiAddr;
                    }
                } else if (connectionType === 'mape') {
                    if (cachedApiInfo?.mape?.brIpv6Address) {
                        values.mape_br = cachedApiInfo.mape.brIpv6Address;
                        values.mape_ealen = cachedApiInfo.mape.eaBitLength;
                        values.mape_ipv4_prefix = cachedApiInfo.mape.ipv4Prefix;
                        values.mape_ipv4_prefixlen = cachedApiInfo.mape.ipv4PrefixLength;
                        values.mape_ipv6_prefix = cachedApiInfo.mape.ipv6Prefix;
                        values.mape_ipv6_prefixlen = cachedApiInfo.mape.ipv6PrefixLength;
                        values.mape_psid_offset = cachedApiInfo.mape.psIdOffset;
                        values.mape_psidlen = cachedApiInfo.mape.psidlen;
                        
                        const guaPrefix = generateGuaPrefixFromFullAddress(cachedApiInfo);
                        if (guaPrefix) {
                            values.mape_gua_prefix = guaPrefix;
                        }
                    }
                    
                    const mapeType = getFieldValue('input[name="mape_type"]');
                    if (mapeType === 'gua') {
                        const currentGUAValue = getFieldValue('#mape-gua-prefix');
                        if (currentGUAValue) {
                            values.mape_gua_prefix = currentGUAValue;
                        } else if (!values.mape_gua_prefix && cachedApiInfo?.ipv6) {
                            const guaPrefix = generateGuaPrefixFromFullAddress(cachedApiInfo);
                            if (guaPrefix) {
                                values.mape_gua_prefix = guaPrefix;
                            }
                        }
                    } else if (mapeType === 'pd') {
                        delete values.mape_gua_prefix;
                    }
                }
            }
        }
    }
    
    // Wi‑Fi設定の処理（改善版）
    const wifiMode = getFieldValue('input[name="wifi_mode"]');
    
    if (wifiMode === 'disabled') {
        // disabledの場合、WiFi関連フィールドを全て削除
        ['wlan_ssid', 'wlan_password', 'enable_usteer', 'mobility_domain', 'snr'].forEach(key => {
            delete values[key];
        });
    } else if (wifiMode === 'standard') {
        // standardの場合、基本フィールドのみ保持
        const ssid = getFieldValue('#aios-wifi-ssid');
        const password = getFieldValue('#aios-wifi-password');
        
        if (ssid) values.wlan_ssid = ssid;
        if (password) values.wlan_password = password;
        
        // Usteer固有フィールドを削除
        delete values.enable_usteer;
        delete values.mobility_domain;
        delete values.snr;
    } else if (wifiMode === 'usteer') {
        // usteerの場合、全てのフィールドを保持
        const ssid = getFieldValue('#aios-wifi-ssid');
        const password = getFieldValue('#aios-wifi-password');
        const mobility = getFieldValue('#aios-wifi-mobility-domain');
        const snr = getFieldValue('#aios-wifi-snr');
        
        if (ssid) values.wlan_ssid = ssid;
        if (password) values.wlan
