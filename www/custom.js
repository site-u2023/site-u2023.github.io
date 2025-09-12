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

// デバイス固有パッケージ管理（重要：これらを常に維持）
let deviceDefaultPackages = [];  // mobj.default_packages
let deviceDevicePackages = [];   // mobj.device_packages  
let extraPackages = [];           // config.asu_extra_packages

// マルチインプットマネージャー用
let packageSearchManager = null;
let commandsManager = null;

// ==================== 初期化処理 ====================
// 元の updateImages をフック
const originalUpdateImages = window.updateImages;
window.updateImages = function(version, mobj) {
    if (originalUpdateImages) originalUpdateImages(version, mobj);

    // arch_packagesをcurrent_deviceとキャッシュに保存
    if (mobj && mobj.arch_packages) {
        if (!current_device) current_device = {};
        current_device.arch = mobj.arch_packages;
        current_device.version = version;
        cachedDeviceArch = mobj.arch_packages;
        console.log('Architecture saved:', mobj.arch_packages);
    }

    // デバイス固有パッケージを保存（重要）
    if (mobj && "manifest" in mobj === false) {
        // デバイス固有パッケージを保存
        deviceDefaultPackages = mobj.default_packages || [];
        deviceDevicePackages = mobj.device_packages || [];
        extraPackages = config.asu_extra_packages || [];
        
        console.log('Device packages saved:', {
            default: deviceDefaultPackages.length,
            device: deviceDevicePackages.length,
            extra: extraPackages.length
        });
        
        // 初期パッケージリストを設定（index.jsの処理を維持）
        const initialPackages = deviceDefaultPackages
            .concat(deviceDevicePackages)
            .concat(extraPackages);
        
        const textarea = document.querySelector('#asu-packages');
        if (textarea) {
            textarea.value = initialPackages.join(' ');
            console.log('Initial packages set:', initialPackages.length);
        }
        
        // パッケージリスト設定後にリサイズ
        setTimeout(() => resizePostinstTextarea(), 100);
    }
    
    // 初回のみカスタムHTMLを読み込み
    if (!customHTMLLoaded) {
        console.log("Loading custom.html");
        loadCustomHTML();
        customHTMLLoaded = true;
    } else if (customInitialized && current_device?.arch) {
        // 既に初期化済みでデバイスが選択された場合、言語パッケージを強制更新
        console.log("Device changed, updating language packages");
        
        // メイン言語セレクターから現在の言語を取得
        const currentLang = document.querySelector('#languages-select')?.value || current_language || 'en';
        syncLanguageSelectors(currentLang);
        console.log("Force updating language packages for:", currentLang);
    }
};

// ==================== 統合パッケージ管理システム ====================
// 前回のフォーム状態ハッシュを保持
let lastFormStateHash = null;

// 差分検知付きのパッケージ状態更新
async function updateAllPackageState(source = 'unknown') {
    // 現在のフォーム状態を収集
    const currentState = collectFormValues();
    const hash = JSON.stringify(currentState);

    // 前回と同じ状態ならスキップ
    if (hash === lastFormStateHash) {
        return;
    }
    lastFormStateHash = hash;

    console.log(`updateAllPackageState called from: ${source}`);

    // 1. setup.jsonベースのパッケージ更新
    updateSetupJsonPackagesCore();

    // 2. 言語パッケージの更新
    await updateLanguagePackageCore();

    // 3. Postinstテキストエリアへの反映（差分検知付き）
    updatePackageListToTextarea(source);

    // 4. setup.sh変数の更新
    updateVariableDefinitions();

    console.log('All package state updated successfully');
}

// Core関数1: setup.jsonベースのパッケージ更新（UI更新なし）
function updateSetupJsonPackagesCore() {
    if (!setupConfig) return;
    
    setupConfig.categories.forEach(category => {
        category.packages.forEach(pkg => {
            if (pkg.type === 'radio-group' && pkg.variableName) {
                const selectedValue = getFieldValue(`input[name="${pkg.variableName}"]:checked`);
                if (selectedValue) {
                    const selectedOption = pkg.options.find(opt => opt.value === selectedValue);
                    if (selectedOption && selectedOption.packages) {
                        selectedOption.packages.forEach(pkgName => {
                            dynamicPackages.add(pkgName);
                        });
                    }
                    
                    pkg.options.forEach(opt => {
                        if (opt.value !== selectedValue && opt.packages) {
                            opt.packages.forEach(pkgName => {
                                dynamicPackages.delete(pkgName);
                            });
                        }
                    });
                    
                    // AUTO時の特別処理
                    if (pkg.variableName === 'connection_type' && selectedValue === 'auto' && cachedApiInfo) {
                        if (cachedApiInfo.mape?.brIpv6Address) {
                            const mapeOption = pkg.options.find(opt => opt.value === 'mape');
                            if (mapeOption && mapeOption.packages) {
                                mapeOption.packages.forEach(pkgName => {
                                    dynamicPackages.add(pkgName);
                                });
                            }
                        } else if (cachedApiInfo.aftr) {
                            const dsliteOption = pkg.options.find(opt => opt.value === 'dslite');
                            if (dsliteOption && dsliteOption.packages) {
                                dsliteOption.packages.forEach(pkgName => {
                                    dynamicPackages.add(pkgName);
                                });
                            }
                        }
                    }
                }
            }
        });
    });
}

// Core関数2: 言語パッケージ更新（UI更新なし）
async function updateLanguagePackageCore() {
    // デバイス用言語セレクターから現在の言語を取得
    const customLanguageSelect = document.querySelector('#aios-language');
    if (customLanguageSelect && customLanguageSelect.value) {
        selectedLanguage = customLanguageSelect.value;
    } else if (!selectedLanguage) {
        selectedLanguage = current_language || config?.fallback_language || 'en';
    }

    // 既存の言語パッケージを一旦全て削除
    const removedPackages = [];
    for (const pkg of Array.from(dynamicPackages)) {
        if (pkg.startsWith('luci-i18n-')) {
            dynamicPackages.delete(pkg);
            removedPackages.push(pkg);
        }
    }

    // 英語が選択されているか、デバイス情報がない場合は終了
    const hasArch = current_device?.arch || cachedDeviceArch;
    if (!selectedLanguage || selectedLanguage === 'en' || !hasArch) {
        return;
    }
    
    const basePkg = `luci-i18n-base-${selectedLanguage}`;
    const firewallPkg = `luci-i18n-firewall-${selectedLanguage}`;
    const addedLangPackages = new Set();

    // 基本言語パッケージ + firewall をチェックして追加
    try {
        if (await isPackageAvailable(basePkg, 'luci')) {
            dynamicPackages.add(basePkg);
            addedLangPackages.add(basePkg);
        }

        if (await isPackageAvailable(firewallPkg, 'luci')) {
            dynamicPackages.add(firewallPkg);
            addedLangPackages.add(firewallPkg);
        }
    } catch (err) {
        console.error('Error checking base/firewall package:', err);
    }

    // 現在の選択済みパッケージに対応する言語パッケージをチェックして追加
    const currentPackages = getCurrentPackageList();
    const checkPromises = [];
    
    for (const pkg of currentPackages) {
        if (pkg.startsWith('luci-') && !pkg.startsWith('luci-i18n-')) {
            const luciName = extractLuciName(pkg);
            if (luciName) {
                const langPkg = `luci-i18n-${luciName}-${selectedLanguage}`;
                
                const promise = (async () => {
                    try {
                        if (await isPackageAvailable(langPkg, 'luci')) {
                            dynamicPackages.add(langPkg);
                            addedLangPackages.add(langPkg);
                            console.log('Added validated LuCI language package:', langPkg);
                        }
                    } catch (err) {
                        console.error('Error checking LuCI package:', err);
                    }
                })();
                checkPromises.push(promise);
            }
        }
    }

    await Promise.all(checkPromises);
}

// Core関数3: Postinstテキストエリア更新（最終的な統合・差分検知付き）
let lastPackageListHash = null;

function updatePackageListToTextarea(source = 'unknown') {
    // 基本パッケージセット（デバイス固有パッケージ）を準備
    const basePackages = new Set();

    // デバイス固有パッケージを必ず含める（最重要）
    deviceDefaultPackages.forEach(pkg => basePackages.add(pkg));
    deviceDevicePackages.forEach(pkg => basePackages.add(pkg));
    extraPackages.forEach(pkg => basePackages.add(pkg));

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

    // テキストエリアから既存パッケージを取得（上記以外の手動入力パッケージを保持）
    const manualPackages = new Set();
    const textarea = document.querySelector('#asu-packages');
    if (textarea) {
        const currentPackages = split(textarea.value);
        currentPackages.forEach(pkg => {
            // 既知のパッケージ以外を手動パッケージとして保持
            if (!basePackages.has(pkg) &&
                !checkedPackages.has(pkg) &&
                !searchedPackages.has(pkg) &&
                !dynamicPackages.has(pkg) &&
                !pkg.startsWith('luci-i18n-')) {
                manualPackages.add(pkg);
            }
        });
    }

    // 全てのパッケージを統合（順序：デバイス固有 → チェック済み → 検索 → 動的 → 手動）
    const finalPackages = [
        ...basePackages,      // デバイス固有パッケージ（必須）
        ...checkedPackages,   // チェックボックスで選択されたパッケージ
        ...searchedPackages,  // 検索で追加されたパッケージ
        ...dynamicPackages,   // 動的パッケージ（言語パッケージなど）
        ...manualPackages     // 手動で入力されたパッケージ
    ];

    // 重複を削除
    const uniquePackages = [...new Set(finalPackages)];

    // 差分検知（前回と同じならスキップ）
    const currentHash = JSON.stringify(uniquePackages);
    if (currentHash === lastPackageListHash) {
        return;
    }
    lastPackageListHash = currentHash;

    // ログと更新処理
    console.log(`updatePackageListToTextarea called from: ${source}`);
    
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

// メイン初期化
async function initializeCustomFeatures(asuSection, temp) {
    console.log('initializeCustomFeatures called');

    if (customInitialized) {
        console.log('Already initialized, skipping');
        return;
    }

    // DOM要素が既に存在する場合は置き換えない
    if (!document.querySelector('#custom-packages-details')) {
        cleanupExistingCustomElements();
        replaceAsuSection(asuSection, temp);
        insertExtendedInfo(temp);
    }

    // 外部データと設定を並列で読み込み
    await Promise.all([
        window.autoConfigPromise,       // auto-config.site-u.workers.dev
        window.informationPromise,      // information.json
        window.packagesDbPromise,       // packages.json
        window.setupJsonPromise,        // setup.json
        loadSetupConfig(),              // 既存処理
        loadPackageDatabase(),          // 既存処理
        fetchAndDisplayIspInfo()        // 既存処理
    ]);

    // 依存関係のある初期化（順序重要）
    setupEventListeners();
    loadUciDefaultsTemplate();

    // 言語セレクター設定（初期言語パッケージ処理を含む）
    setupLanguageSelector();

    // パッケージ検索機能を初期化
    setupPackageSearch();
    console.log('Package search initialized');

    // カスタム翻訳を読み込み（初期言語に基づいて）
    await loadCustomTranslations(selectedLanguage);

    // フォーム監視設定
    setupFormWatchers();

    // initializeCustomFeatures の末尾
    let changed = false;
    if (window.autoConfigData) {
        changed = applyIspAutoConfig(window.autoConfigData);
    }

    // パッケージセレクタ生成
    generatePackageSelector();

    // 最初の統合更新（変更があった場合のみ）
    if (changed) {
        console.log('All data and UI ready, updating package state');
        updateAllPackageState('isp-auto-config');
    } else {
        console.log('All data and UI ready, no changes from auto-config');
    }

    customInitialized = true;
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
    const version = current_device?.version || document.querySelector('#versions')?.value;
    
    const allResults = new Set();
    const feeds = ['packages', 'luci'];
    
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

// フィード内検索
async function searchInFeed(query, feed, version, arch) {
    // console.log(`searchInFeed: ${feed}, query: ${query}`);
    
    try {
        if (version.includes('SNAPSHOT')) {
            // APK形式
            const url = config.apk_search_url
                .replace('{arch}', arch)
                .replace('{feed}', feed);
            
            // console.log('Fetching APK index:', url);
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            
            const data = await resp.json();
            const results = [];
            
            if (data.packages && typeof data.packages === 'object') {
                Object.keys(data.packages).forEach(name => {
                    if (name.toLowerCase().includes(query.toLowerCase())) {
                        results.push(name);
                    }
                });
            }
            
            return results;
        } else {
            // OPKG形式
            const url = config.opkg_search_url
                .replace('{version}', version)
                .replace('{arch}', arch)
                .replace('{feed}', feed);
            
            // console.log('Fetching OPKG packages:', url);
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            
            const text = await resp.text();
            const results = [];
            const lines = text.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('Package: ')) {
                    const pkgName = line.substring(9).trim();
                    if (pkgName.toLowerCase().includes(query.toLowerCase())) {
                        results.push(pkgName);
                    }
                }
            }
            
            return results;
        }
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

    // index.jsが期待する全てのDOM要素を直接追加
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

// 拡張情報セクション挿入（JSON駆動で動的生成）
async function insertExtendedInfo(temp) {
    const extendedInfo = temp.querySelector('#extended-build-info');
    const imageLink = document.querySelector('#image-link');
    
    if (!extendedInfo || !imageLink || document.querySelector('#extended-build-info')) {
        return;
    }
    
    // information.jsonから構造を読み込み
    try {
        const infoUrl = config?.information_path || 'auto-config/information.json';
        const response = await fetch(infoUrl + '?t=' + Date.now());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const infoConfig = await response.json();
        console.log('Information config loaded:', infoConfig);
        
        // ISP情報セクションを動的生成
        extendedInfo.innerHTML = '';
        
        infoConfig.categories.forEach(category => {
            const h3 = document.createElement('h3');
            h3.textContent = category.name;
            if (category.class) h3.classList.add(category.class);
            extendedInfo.appendChild(h3);
            
            category.packages.forEach(pkg => {
                if (pkg.fields) {
                    pkg.fields.forEach(field => {
                        const row = document.createElement('div');
                        row.className = 'row';
                        
                        const col1 = document.createElement('div');
                        col1.className = 'col1';
                        if (field.class) col1.classList.add(field.class);
                        col1.textContent = field.label;
                        
                        const col2 = document.createElement('div');
                        col2.className = 'col2';
                        col2.id = field.id;
                        
                        row.appendChild(col1);
                        row.appendChild(col2);
                        extendedInfo.appendChild(row);
                    });
                }
            });
        });
        
        // DOMに挿入
        imageLink.closest('.row').insertAdjacentElement('afterend', extendedInfo);
        show('#extended-build-info');
        
    } catch (err) {
        console.error('Failed to load information.json:', err);
    }
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
    
    // 現在のデバイス用言語を決定（ブラウザ言語とは独立）
    let deviceLanguage = fallback;
    if (current_language) {
        deviceLanguage = current_language;
    }
    
    // グローバル変数を確実に設定（デバイス用言語）
    syncLanguageSelectors(deviceLanguage);
    window.selectedLanguage = deviceLanguage;
    console.log('Selected language for device:', deviceLanguage);

    if (mainLanguageSelect) {
        mainLanguageSelect.removeEventListener('change', handleMainLanguageChange);
        mainLanguageSelect.addEventListener('change', handleMainLanguageChange);
    }
    
    // 初回言語パッケージ更新（重要：必ず実行）
    console.log('Performing initial language package update for:', selectedLanguage);
    updateAllPackageState('initial-language');
}

function syncLanguageSelectors(newLang) {
    if (!newLang) return;
    const mainSelect = document.getElementById('languages-select');
    const customSelect = document.getElementById('aios-language');

    if (mainSelect && mainSelect.value !== newLang) {
        mainSelect.value = newLang;
    }
    if (customSelect && customSelect.value !== newLang) {
        customSelect.value = newLang;
    }

    selectedLanguage = newLang;
    updateAllPackageState('sync-language');
}

// メイン言語セレクター変更ハンドラー
async function handleMainLanguageChange(e) {
    const newLanguage = e.target.value || config?.fallback_language || 'en';
    console.log('Main language changed to:', newLanguage);

    syncLanguageSelectors(newLanguage);
    await loadCustomTranslations(newLanguage);

    console.log('Main language change processing completed');
}

async function loadCustomTranslations(lang) {
    if (!lang) {
        lang = selectedLanguage || (navigator.language || config.fallback_language).split('-')[0];
    }
    
    const customLangFile = `langs/custom.${lang}.json`;
    try {
        const resp = await fetch(customLangFile, { cache: 'no-store' });

        if (!resp.ok) {
            if (lang !== config.fallback_language) {
                return loadCustomTranslations(config.fallback_language);
            }
            return;
        }

        const text = await resp.text();
        const customMap = JSON.parse(text);
        customLanguageMap = customMap;
        applyCustomTranslations(customLanguageMap);
    } catch (err) {
        if (lang !== config.fallback_language) {
            return loadCustomTranslations(config.fallback_language);
        }
    }
}

// カスタム言語セレクター変更ハンドラー
async function handleCustomLanguageChange(e) {
    const newLanguage = e.target.value || config?.fallback_language || 'en';

    if (selectedLanguage === newLanguage) {
        console.log('Language not changed, skipping update');
        return;
    }

    syncLanguageSelectors(newLanguage);
    console.log('Custom language changed to:', newLanguage);

    await loadCustomTranslations(newLanguage);
    updateVariableDefinitions();

    console.log('Custom language change processing completed');
}

function applyCustomTranslations(map) {
    if (!map || typeof map !== 'object') return;
    Object.assign(current_language_json, map);
    for (const tr in map) {
        document.querySelectorAll(`.${tr}`).forEach(e => {
            if ('placeholder' in e) {
                e.placeholder = map[tr];
            } else {
                e.innerText = map[tr];
            }
        });
    }
}

function extractLuciName(pkg) {
    if (pkg === 'luci') return 'base';

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
            // デバイス初期パッケージでなければ追加
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

// パッケージ存在チェック
async function isPackageAvailable(pkgName, feed) {
    if (!pkgName || !feed) {
        return false;
    }
    
    // デバイス情報を確認
    const arch = current_device?.arch || cachedDeviceArch;
    const version = current_device?.version || $("#versions").value;
    
    if (!arch || !version) {
        console.log('Missing device info for package check:', { arch, version });
        return false;
    }
    
    
    try {
        let packagesUrl;
        
        if (version.includes('SNAPSHOT')) {
            packagesUrl = config.apk_search_url
                .replace('{arch}', arch)
                .replace('{feed}', feed);
            
            console.log('Checking APK URL:', packagesUrl);
            
            const resp = await fetch(packagesUrl, { cache: 'no-store' });
            if (!resp.ok) {
                console.log('APK fetch failed:', resp.status);
                return false;
            }
            
            const data = await resp.json();
            if (Array.isArray(data.packages)) {
                return data.packages.some(p => p?.name === pkgName);
            } else if (data.packages && typeof data.packages === 'object') {
                return Object.prototype.hasOwnProperty.call(data.packages, pkgName);
            }
            return false;
        } else {
            packagesUrl = config.opkg_search_url
                .replace('{version}', version)
                .replace('{arch}', arch)
                .replace('{feed}', feed);
            
            console.log('Checking OPKG URL:', packagesUrl);
            
            const resp = await fetch(packagesUrl, { cache: 'no-store' });
            if (!resp.ok) {
                console.log('OPKG fetch failed:', resp.status);
                return false;
            }
            
            const text = await resp.text();
            const found = text.split('\n').some(line => line.trim() === `Package: ${pkgName}`);
            console.log('Package check result for', pkgName, ':', found);
            return found;
        }
    } catch (err) {
        console.error('Package availability check error:', err);
        return false;
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
                
                if (opt.packages && Array.isArray(opt.packages)) {
                    radio.setAttribute('data-packages', JSON.stringify(opt.packages));
                }
                
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
        
        ctrl.addEventListener('change', () => updateAllPackageState('form-field'));
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
        
        ctrl.addEventListener('input', () => updateAllPackageState('form-field'));
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
    const packagesData = radio.getAttribute('data-packages');
    const sameNameRadios = document.querySelectorAll(`input[name="${radio.name}"]`);
    sameNameRadios.forEach(r => {
        if (r !== radio) {
            const otherPackagesData = r.getAttribute('data-packages');
            if (otherPackagesData) {
                try {
                    const otherPackages = JSON.parse(otherPackagesData);
                    otherPackages.forEach(pkg => {
                        dynamicPackages.delete(pkg);
                    });
                } catch (err) {
                    console.error('Error parsing other packages data:', err);
                }
            }
        }
    });
    
    // 選択されたラジオボタンの動的パッケージを追加
    if (packagesData) {
        try {
            const packages = JSON.parse(packagesData);
            packages.forEach(pkg => {
                dynamicPackages.add(pkg);
            });
        } catch (err) {
            console.error('Error parsing packages data:', err);
        }
    }
    
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
        if (password) values.wlan_password = password;
        if (mobility) values.mobility_domain = mobility;
        if (snr) values.snr = snr;
        values.enable_usteer = '1';
    }

    // Tuning設定の処理（改善版）
    const netOptimizer = getFieldValue('input[name="net_optimizer"]');
    
    if (netOptimizer === 'disabled') {
        // disabledの場合、最適化関連フィールドを全て削除
        ['enable_netopt', 'netopt_rmem', 'netopt_wmem', 'netopt_conntrack', 
         'netopt_backlog', 'netopt_somaxconn', 'netopt_congestion'].forEach(key => {
            delete values[key];
        });
    } else if (netOptimizer === 'auto') {
        // autoの場合、enable_netoptのみ設定
        values.enable_netopt = '1';
        
        // 手動設定フィールドを削除
        ['netopt_rmem', 'netopt_wmem', 'netopt_conntrack', 
         'netopt_backlog', 'netopt_somaxconn', 'netopt_congestion'].forEach(key => {
            delete values[key];
        });
    } else if (netOptimizer === 'manual') {
        // manualの場合、全てのフィールドを保持
        values.enable_netopt = '1';
        
        const rmem = getFieldValue('#netopt-rmem');
        const wmem = getFieldValue('#netopt-wmem');
        const conntrack = getFieldValue('#netopt-conntrack');
        const backlog = getFieldValue('#netopt-backlog');
        const somaxconn = getFieldValue('#netopt-somaxconn');
        const congestion = getFieldValue('#netopt-congestion');
        
        if (rmem) values.netopt_rmem = rmem;
        if (wmem) values.netopt_wmem = wmem;
        if (conntrack) values.netopt_conntrack = conntrack;
        if (backlog) values.netopt_backlog = backlog;
        if (somaxconn) values.netopt_somaxconn = somaxconn;
        if (congestion) values.netopt_congestion = congestion;
    }
}

// ==================== イベントハンドラ（JSONドリブン版） ====================

function setupEventListeners() {
    const radioGroups = {
        'connection_type': handleConnectionTypeChange,
        'net_optimizer': handleNetOptimizerChange,
        'wifi_mode': handleWifiModeChange
    };
    
    Object.entries(radioGroups).forEach(([name, handler]) => {
        document.querySelectorAll(`input[name="${name}"]`).forEach(radio => {
            radio.removeEventListener('change', handler);
            radio.addEventListener('change', handler);
        });
        
        const checked = document.querySelector(`input[name="${name}"]:checked`);
        if (checked) {
            handler({ target: checked });
        }
    });
    
    // MAP-Eタイプ切り替え（個別処理）
    document.querySelectorAll('input[name="mape_type"]').forEach(radio => {
        radio.addEventListener('change', handleMapeTypeChange);
    });

    // DS-Lite: JSONベースのAFTRアドレス自動補完
    setupDsliteAddressComputation();
   
    // コマンド入力のマルチインプット化
    setupCommandsInput();
}

// コマンド入力設定関数を追加
function setupCommandsInput() {
    console.log('setupCommandsInput called');
    
    const commandsContainer = document.getElementById('commands-autocomplete');
    
    if (!commandsContainer) {
        console.log('commands-autocomplete container not found');
        return;
    }
    
    // 既存のインプットを削除
    const oldInput = document.getElementById('command');
    if (oldInput) {
        oldInput.remove();
    }
    
    // マルチインプットマネージャーを初期化
    commandsManager = new MultiInputManager('commands-autocomplete', {
        placeholder: 'Type command and press Enter',
        className: 'multi-input-item command-input',
        onAdd: (command) => {
            console.log('Command added:', command);
            updateCustomCommands();
        },
        onRemove: (command) => {
            console.log('Command removed:', command);
            updateCustomCommands();
        },
        onChange: (values) => {
            // console.log('Commands changed:', values);
            updateCustomCommands();
        }
    });
    
    console.log('Commands input setup complete');
}

// MAP-Eタイプ変更ハンドラ（新規追加）
function handleMapeTypeChange(e) {
    const mapeType = e.target.value;
    
    // GUA prefix の表示/非表示制御
    toggleGuaPrefixVisibility(mapeType);
    
    // PDモードの場合、GUA prefixフィールドと値をクリア
    if (mapeType === 'pd') {
        const guaPrefixField = document.querySelector('#mape-gua-prefix');
        if (guaPrefixField) {
            guaPrefixField.value = '';
        }
        // values からも削除
        if (typeof values === 'object') {
            delete values.mape_gua_prefix;
        }
    }
    
    // setup.shを更新
    updateAllPackageState('mape-type');
}

// DS-Lite AFTR計算（個別処理に変更）
function setupDsliteAddressComputation() {
    const aftrType = document.querySelector('#dslite-aftr-type');
    const aftrArea = document.querySelector('#dslite-area');
    const aftrAddr = document.querySelector('#dslite-aftr-address');

    if (!aftrType || !aftrArea || !aftrAddr) return;

    // JSONからアドレスマッピングを取得
    function getAddressMap() {
        const internetCategory = setupConfig.categories.find(cat => cat.id === 'internet-config');
        const dsliteSection = internetCategory.packages.find(pkg => pkg.id === 'dslite-section');
        const dsliteFields = dsliteSection.children.find(child => child.id === 'dslite-fields');
        const aftrTypeField = dsliteFields.fields.find(field => field.id === 'dslite-aftr-type');
        return aftrTypeField.computeField.addressMap;
    }

    function computeAftrAddress(type, area) {
        const addressMap = getAddressMap();
        return addressMap[type]?.[area] || '';
    }

    function syncAftrAddress(force = false) {
        const computed = computeAftrAddress(aftrType.value, aftrArea.value);
        if (!computed) return;
        
        if (force || !aftrAddr.value) {
            aftrAddr.value = computed;
            updateVariableDefinitions();
        }
    }

    // DS-Lite個別のイベントハンドラ
    aftrType.addEventListener('change', () => {
        syncAftrAddress(true);
        // DS-Lite用の特別処理（UI制御フィールドをクリア）
        updateVariableDefinitionsWithDsliteCleanup();
    });
    
    aftrArea.addEventListener('change', () => {
        syncAftrAddress(true);
        // DS-Lite用の特別処理
        updateVariableDefinitionsWithDsliteCleanup();
    });
    
    setTimeout(() => syncAftrAddress(false), 0);
}

// DS-Lite専用のupdateVariableDefinitions
function updateVariableDefinitionsWithDsliteCleanup() {
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    if (!textarea) return;
    
    const values = collectFormValues();
    let emissionValues = { ...values };
    
    // DS-Lite: UI制御用フィールドを削除
    delete emissionValues.dslite_aftr_type;
    delete emissionValues.dslite_area;
    
    // パッケージの有効化変数を追加
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const enableVar = cb.getAttribute('data-enable-var');
        if (enableVar) {
            emissionValues[enableVar] = '1';
        }
    });
    
    const variableDefinitions = generateVariableDefinitions(emissionValues);
    updateTextareaContent(textarea, variableDefinitions);
}

// 接続タイプ変更ハンドラ（JSONドリブン）
function handleConnectionTypeChange(e) {
    const selectedType = e.target.value;
    
    const internetCategory = setupConfig.categories.find(cat => cat.id === 'internet-config');
    
    // 全ての接続タイプセクションを処理
    internetCategory.packages.forEach(pkg => {
        if (pkg.type === 'conditional-section' && pkg.showWhen?.field === 'connection_type') {
            const section = document.querySelector(`#${pkg.id}`);
            if (!section) return;
            
            // showWhen.valuesに基づいて表示/非表示を制御
            if (pkg.showWhen.values?.includes(selectedType)) {
                show(section);
                
                // 特定タイプ別の追加処理
                if (selectedType === 'auto' && cachedApiInfo) {
                    updateAutoConnectionInfo(cachedApiInfo);
                } else if (selectedType === 'mape' && cachedApiInfo) {
                    // MAP-E選択時にGUA prefixを設定
                    const guaPrefixField = document.querySelector('#mape-gua-prefix');
                    if (guaPrefixField && cachedApiInfo.ipv6) {
                        const guaPrefix = generateGuaPrefixFromFullAddress(cachedApiInfo);
                        if (guaPrefix && !guaPrefixField.value) {
                            guaPrefixField.value = guaPrefix;
                            console.log('GUA prefix set for MAP-E:', guaPrefix);
                        }
                    }
                }
            } else {
                hide(section);
            }
        }
    });
    
    updateAllPackageState('connection-type');
}

// ネットワーク最適化変更ハンドラ（JSONドリブン）
function handleNetOptimizerChange(e) {
    const mode = e.target.value;
    
    const tuningCategory = setupConfig.categories.find(cat => cat.id === 'tuning-config');
    
    // ネットワーク最適化関連のセクションを処理
    tuningCategory.packages.forEach(pkg => {
        if (pkg.type === 'conditional-section' && pkg.showWhen?.field === 'net_optimizer') {
            const section = document.querySelector(`#${pkg.id}`);
            if (!section) return;
            
            // showWhen.valuesに基づいて表示/非表示を制御
            if (pkg.showWhen.values?.includes(mode)) {
                show(section);
                
                // 手動モードの場合はデフォルト値を復元
                if (mode === 'manual') {
                    restoreManualDefaults();
                }
            } else {
                hide(section);
            }
        }
    });
    
    updateAllPackageState('net-optimizer');
}

// Wi-Fiモード変更ハンドラ（JSONドリブン）
function handleWifiModeChange(e) {
    const mode = e.target.value;
    
    const wifiCategory = setupConfig.categories.find(cat => cat.id === 'wifi-config');
    
    // Wi-Fiモード設定を取得
    const wifiModeConfig = wifiCategory.packages.find(pkg => 
        pkg.variableName === 'wifi_mode'
    );
    
    const selectedOption = wifiModeConfig.options.find(opt => opt.value === mode);
    
    // Wi-Fi関連のセクションを処理
    wifiCategory.packages.forEach(pkg => {
        if (pkg.type === 'conditional-section') {
            const section = document.querySelector(`#${pkg.id}`);
            if (!section) return;
            
            // showWhenに基づいて表示/非表示を制御
            if (pkg.showWhen?.values?.includes(mode)) {
                show(section);
                
                // 子要素も再帰的に処理
                if (pkg.children) {
                    pkg.children.forEach(child => {
                        if (child.type === 'conditional-section') {
                            const childSection = document.querySelector(`#${child.id}`);
                            if (childSection) {
                                if (child.showWhen?.values?.includes(mode)) {
                                    show(childSection);
                                } else {
                                    hide(childSection);
                                }
                            }
                        }
                    });
                }
            } else {
                hide(section);
            }
        }
    });
    
    // モード別の特別処理
    if (mode === 'disabled') {
        clearWifiFields();
    } else {
        restoreWifiDefaults();
    }
    
    updateAllPackageState('wifi-mode');
}

// デフォルト値復元（JSONドリブン）
function restoreManualDefaults() {
    const tuningCategory = setupConfig.categories.find(cat => cat.id === 'tuning-config');
    const manualSection = tuningCategory.packages.find(pkg => pkg.id === 'netopt-manual-section');
    const netoptFields = manualSection.children.find(child => child.id === 'netopt-fields');
    
    // JSONで定義されたデフォルト値を適用
    netoptFields.fields.forEach(field => {
        if (field.defaultValue !== undefined && field.defaultValue !== null) {
            const el = document.querySelector(field.selector || `#${field.id}`);
            if (el && !el.value) {
                el.value = field.defaultValue;
            }
        }
    });
}

function restoreWifiDefaults() {
    const wifiCategory = setupConfig.categories.find(cat => cat.id === 'wifi-config');
    
    // Wi-Fiフィールドを探す
    function findWifiFields(pkg) {
        const fields = [];
        
        if (pkg.type === 'input-group' && pkg.fields) {
            fields.push(...pkg.fields);
        } else if (pkg.children) {
            pkg.children.forEach(child => {
                fields.push(...findWifiFields(child));
            });
        }
        
        return fields;
    }
    
    // 全てのWi-Fiフィールドを収集
    const allWifiFields = [];
    wifiCategory.packages.forEach(pkg => {
        allWifiFields.push(...findWifiFields(pkg));
    });
    
    // デフォルト値を適用
    allWifiFields.forEach(field => {
        if (field.defaultValue !== undefined && field.defaultValue !== null) {
            const el = document.querySelector(field.selector || `#${field.id}`);
            if (el && !el.value) {
                el.value = field.defaultValue;
            }
        }
    });
}

function clearWifiFields() {
    const wifiCategory = setupConfig.categories.find(cat => cat.id === 'wifi-config');
    
    // Wi-Fiフィールドを再帰的に探す
    function findAndClearWifiFields(pkg) {
        if (pkg.type === 'input-group' && pkg.fields) {
            pkg.fields.forEach(field => {
                const el = document.querySelector(field.selector || `#${field.id}`);
                if (el) {
                    el.value = '';
                }
            });
        } else if (pkg.children) {
            pkg.children.forEach(child => {
                findAndClearWifiFields(child);
            });
        }
    }
    
    // Wi-Fiモード設定以外のフィールドをクリア
    wifiCategory.packages.forEach(pkg => {
        if (pkg.variableName !== 'wifi_mode') {
            findAndClearWifiFields(pkg);
        }
    });
}

console.log('custom.js (JSON-driven clean version) fully loaded and ready');

// ==================== ISP情報処理 ====================

async function fetchAndDisplayIspInfo() {
    if (!config?.auto_config_api_url) return;
    
    try {
        const response = await fetch(config.auto_config_api_url);
        const apiInfo = await response.json();
        cachedApiInfo = apiInfo;
        displayIspInfo(apiInfo);
        applyIspAutoConfig(apiInfo);
        updateAutoConnectionInfo(apiInfo);
        setGuaPrefixIfAvailable();       

    } catch (err) {
        console.error('Failed to fetch ISP info:', err);
        const autoInfo = document.querySelector('#auto-info');
        if (autoInfo) {
            autoInfo.textContent = 'Failed to detect connection type.\nPlease select manually.';
        }
    }
}

function displayIspInfo(apiInfo) {
    if (!apiInfo) return;
    
    setValue("#auto-config-country", apiInfo.country || "Unknown");
    setValue("#auto-config-timezone", apiInfo.timezone || "Unknown");
    setValue("#auto-config-zonename", apiInfo.zonename || "Unknown");
    setValue("#auto-config-isp", apiInfo.isp || "Unknown");
    setValue("#auto-config-as", apiInfo.as || "Unknown");
    setValue("#auto-config-ip", [apiInfo.ipv4, apiInfo.ipv6].filter(Boolean).join(" / ") || "Unknown");

    let wanType = "DHCP/PPPoE";
    if (apiInfo.mape?.brIpv6Address) wanType = "MAP-E";
    else if (apiInfo.aftr) wanType = "DS-Lite";
    setValue("#auto-config-method", wanType);
    setValue("#auto-config-notice", apiInfo.notice || "");
    
    show("#extended-build-info");
}

function applyIspAutoConfig(apiInfo) {
    // API情報またはフォーム構造が未定義なら安全にスキップ
    if (!apiInfo || !formStructure || !formStructure.fields) {
        console.warn('applyIspAutoConfig: formStructure not ready, skipping');
        return false;
    }

    // connection_type 未設定時の誤判定回避（未設定なら auto と同等扱い）
    const rawType = getFieldValue('input[name="connection_type"]');
    const connectionType = (rawType === null || rawType === undefined || rawType === '') ? 'auto' : rawType;

    let mutated = false;

    Object.values(formStructure.fields).forEach(field => {
        if (!field.apiMapping) return;

        const isConnectionField = ['dslite', 'mape', 'ap', 'pppoe'].some(type =>
            formStructure.connectionTypes[type]?.includes(field.id)
        );

        // 接続関連フィールドは auto 以外では反映しない
        if (isConnectionField && connectionType !== 'auto') {
            return;
        }

        let value = getNestedValue(apiInfo, field.apiMapping);

        // mape_gua_prefix は cachedApiInfo から再生成が優先
        if (field.variableName === 'mape_gua_prefix') {
            const guaPrefix = generateGuaPrefixFromFullAddress(cachedApiInfo);
            if (guaPrefix) value = guaPrefix;
        }

        if (value !== null && value !== undefined && value !== '') {
            const element = document.querySelector(field.selector);
            if (element && element.value !== String(value)) {
                element.value = value;
                mutated = true;
            }
        }
    });

    // 付随情報の更新（UI値に依存するため、反映があった場合のみ）
    if (mutated) {
        setGuaPrefixIfAvailable();
        updateAutoConnectionInfo(apiInfo);
    }

    return mutated;
}

function updateAutoConnectionInfo(apiInfo) {
    const autoInfo = document.querySelector('#auto-info');
    if (!autoInfo) return;

    let infoText = '';
    
    if (apiInfo?.mape?.brIpv6Address) {
        infoText = 'Detected: MAP-E\n';
        infoText += `\u00A0BR: ${apiInfo.mape.brIpv6Address}\n`;
        infoText += `\u00A0EA-len: ${apiInfo.mape.eaBitLength}\n`;
        infoText += `\u00A0IPv4 Prefix: ${apiInfo.mape.ipv4Prefix}/${apiInfo.mape.ipv4PrefixLength}\n`;
        infoText += `\u00A0IPv6 Prefix: ${apiInfo.mape.ipv6Prefix}/${apiInfo.mape.ipv6PrefixLength}\n`;
        infoText += `\u00A0PSID: offset=${apiInfo.mape.psIdOffset}\n`;
        infoText += `\u00A0PSID: length=${apiInfo.mape.psidlen}`;
    } else if (apiInfo?.aftr) {
        infoText = 'Detected: DS-Lite\n';
        infoText += `AFTR: ${apiInfo.aftr}`;
    } else if (apiInfo) {
        infoText = 'Detected: DHCP/PPPoE\n';
        infoText += '\u00A0Standard connection will be used';
    } else {
        infoText = 'No connection information available\n';
        infoText += '\u00A0Please select connection type manually';
    }

    if (apiInfo?.isp) {
        infoText += `\n\nISP: ${apiInfo.isp}`;
        if (apiInfo.as) {
            infoText += `\nAS: ${apiInfo.as}`;
        }
    }
    
    autoInfo.textContent = infoText;
}

// ==================== パッケージ管理 ====================

async function loadPackageDatabase() {
    try {
        const url = config?.packages_db_path || 'packages/packages.json';
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        packagesJson = await response.json();
        console.log('Package database loaded:', packagesJson);
        
        return packagesJson;
    } catch (err) {
        console.error('Failed to load package database:', err);
        return null;
    }
}

function generatePackageSelector() {
    const container = document.querySelector('#package-categories');
    if (!container || !packagesJson) {
        return;
    }
    
    container.innerHTML = '';
    
    packagesJson.categories.forEach(category => {
        const categoryDiv = createPackageCategory(category);
        if (categoryDiv) {
            container.appendChild(categoryDiv);
        }
    });
    
    updateAllPackageState('package-selector-init');
    console.log(`Generated ${packagesJson.categories.length} package categories`);
}

function createPackageCategory(category) {
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'package-category';
    categoryDiv.setAttribute('data-category-id', category.id);
    
    const packageGrid = document.createElement('div');
    packageGrid.className = 'package-grid';
    
    let hasVisiblePackages = false;
    
    category.packages.forEach(pkg => {
        if (!pkg.hidden) {
            hasVisiblePackages = true;
            const packageItem = createPackageItem(pkg);
            packageGrid.appendChild(packageItem);
        }
    });
    
    if (!hasVisiblePackages) return null;
    
    const title = document.createElement('h4');
    title.textContent = category.name;
    if (category.class) {
        title.classList.add(category.class);
    }
    categoryDiv.appendChild(title);
 
    if (category.description) {
        const description = document.createElement('div');
        description.className = 'package-category-description';
        description.textContent = category.description;
        categoryDiv.appendChild(description);
    }
    
    categoryDiv.appendChild(packageGrid);
    return categoryDiv;
}
 
function createPackageItem(pkg) {
    const packageItem = document.createElement('div');
    packageItem.className = 'package-item';
    packageItem.setAttribute('data-package-id', pkg.id);
    
    const mainCheckbox = createPackageCheckbox(pkg, pkg.checked || false);
    packageItem.appendChild(mainCheckbox);
    
    if (pkg.dependencies && Array.isArray(pkg.dependencies)) {
        const depContainer = document.createElement('div');
        depContainer.className = 'package-dependencies';
        
        pkg.dependencies.forEach(depId => {
            const depPkg = findPackageById(depId);
            if (depPkg) {
                const depCheckbox = createPackageCheckbox(depPkg, pkg.checked || false, true);
                depCheckbox.classList.add('package-dependent');
                depContainer.appendChild(depCheckbox);
            }
        });
        
        if (depContainer.children.length > 0) {
            packageItem.appendChild(depContainer);
        }
    }
    
    if (pkg.enableVar) {
        const checkbox = packageItem.querySelector(`#pkg-${pkg.id}`);
        if (checkbox) {
            checkbox.setAttribute('data-enable-var', pkg.enableVar);
        }
    }
    
    return packageItem;
}

function createPackageCheckbox(pkg, isChecked = false, isDependency = false) {
    const label = document.createElement('label');
    label.className = 'form-check-label';
    label.setAttribute('for', `pkg-${pkg.uniqueId || pkg.id}`);
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '0.5em';
    label.style.cursor = 'pointer';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `pkg-${pkg.uniqueId || pkg.id}`; 
    checkbox.className = 'form-check-input package-selector-checkbox';
    checkbox.setAttribute('data-package', pkg.id);   // id
    checkbox.setAttribute('data-unique-id', pkg.uniqueId || pkg.id); 
    
    if (pkg.dependencies) {
        checkbox.setAttribute('data-dependencies', pkg.dependencies.join(','));
    }
    
    if (isChecked) {
        checkbox.checked = true;
    }
    
    checkbox.addEventListener('change', handlePackageSelection);
    
    if (config?.package_url) {
        const link = document.createElement('a');
        link.href = config.package_url.replace("{id}", encodeURIComponent(pkg.id));
        link.target = '_blank';
        link.className = 'package-link';
        link.textContent = pkg.name || pkg.id;
        link.onclick = (e) => e.stopPropagation();
        label.appendChild(checkbox);
        label.appendChild(link);
    } else {
        const span = document.createElement('span');
        span.textContent = pkg.name || pkg.id;
        label.appendChild(checkbox);
        label.appendChild(span);
    }
    
    return label;
}

function handlePackageSelection(e) {
    const pkg = e.target;
    const isChecked = pkg.checked;
    
    // 依存関係の処理
    const dependencies = pkg.getAttribute('data-dependencies');
    if (dependencies) {
        dependencies.split(',').forEach(depName => {
            const depPkg = findPackageById(depName);
            if (depPkg) {
                const depCheckbox = document.querySelector(`[data-unique-id="${depPkg.uniqueId || depPkg.id}"]`);
                if (depCheckbox) {
                    depCheckbox.checked = isChecked;
                    
                    const depDeps = depCheckbox.getAttribute('data-dependencies');
                    if (depDeps && isChecked) {
                        depDeps.split(',').forEach(subDepName => {
                            const subDepPkg = findPackageById(subDepName);
                            if (subDepPkg) {
                                const subDepCheckbox = document.querySelector(`[data-unique-id="${subDepPkg.uniqueId || subDepPkg.id}"]`);
                                if (subDepCheckbox) subDepCheckbox.checked = true;
                            }
                        });
                    }
                }
            }
        });
    }
    
    // 統合パッケージ状態を更新
    console.log('Package selection changed:', pkg.getAttribute('data-package'), 'checked:', isChecked);
    updateAllPackageState('package-selection');
}

function findPackageById(id) {
    if (!packagesJson) return null;
    
    for (const category of packagesJson.categories) {
        const pkg = category.packages.find(p => p.uniqueId === id || p.id === id);
        if (pkg) return pkg;
    }
    return null;
}

// ==================== UCI-defaults処理 ====================

function loadUciDefaultsTemplate() {
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    const templatePath = config?.uci_defaults_setup_path || 'uci-defaults/setup.sh';
    
    if (!textarea) {
        console.error('UCI-defaults textarea not found');
        return;
    }

    function autoResize() {
        const lines = textarea.value.split('\n').length;
        textarea.style.height = 'auto';
        textarea.style.height = `${lines * 1.5}em`;
    }

    textarea.addEventListener('input', autoResize);
    textarea.addEventListener('paste', () => setTimeout(autoResize, 10));

    // setup.shを読み込み
    fetch(templatePath + '?t=' + Date.now())
        .then(r => { 
            if (!r.ok) throw new Error(`Failed to load setup.sh: ${r.statusText}`); 
            return r.text(); 
        })
        .then(text => {
            textarea.value = text;
            console.log('setup.sh loaded successfully');
            updateVariableDefinitions();
            autoResize();
        })
        .catch(err => {
            console.error('Failed to load setup.sh:', err);
            // フォールバックとして最小限のテンプレートを設定
            textarea.value = `#!/bin/sh
# BEGIN_VARIABLE_DEFINITIONS
# END_VARIABLE_DEFINITIONS

# BEGIN_CUSTOM_COMMANDS
# END_CUSTOM_COMMANDS

exit 0`;
            autoResize();
        });
}

function updateVariableDefinitions() {
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    if (!textarea) return;

    // collectFormValues が未定義や空を返す場合は安全にスキップ
    const values = collectFormValues && typeof collectFormValues === 'function'
        ? collectFormValues()
        : null;

    if (!values || typeof values !== 'object' || Object.keys(values).length === 0) {
        // 外部データ未取得などで値が空の場合は後で再実行できるようにログだけ残す
        console.warn("updateVariableDefinitions: values 未取得のためスキップ");
        return;
    }

    let emissionValues = { ...values };

    // パッケージの有効化変数を追加
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const enableVar = cb.getAttribute('data-enable-var');
        if (enableVar) {
            emissionValues[enableVar] = '1';
        }
    });

    const variableDefinitions = generateVariableDefinitions(emissionValues);
    updateTextareaContent(textarea, variableDefinitions);
}

// テキストエリア更新の共通処理
function updateTextareaContent(textarea, variableDefinitions) {
    let content = textarea.value;
    const beginMarker = '# BEGIN_VARIABLE_DEFINITIONS';
    const endMarker = '# END_VARIABLE_DEFINITIONS';
    const beginIndex = content.indexOf(beginMarker);
    const endIndex = content.indexOf(endMarker);
    
    if (beginIndex !== -1 && endIndex !== -1) {
        const beforeSection = content.substring(0, beginIndex + beginMarker.length);
        const afterSection = content.substring(endIndex);
        const newSection = variableDefinitions ? '\n' + variableDefinitions + '\n' : '\n';
        textarea.value = beforeSection + newSection + afterSection;
        textarea.rows = textarea.value.split('\n').length + 1;
    }
}

function generateVariableDefinitions(values) {
    const lines = [];
    Object.entries(values).forEach(([key, value]) => {
        const escapedValue = value.toString().replace(/'/g, "'\"'\"'");
        lines.push(`${key}='${escapedValue}'`);
    });
    return lines.join('\n');
}

function updateCustomCommands() {
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    if (!textarea) return;
    
    // マルチインプットマネージャーから値を取得
    const customCommands = commandsManager ? commandsManager.getAllValues().join('\n') : '';
    
    let content = textarea.value;
    
    const beginMarker = '# BEGIN_CUSTOM_COMMANDS';
    const endMarker = '# END_CUSTOM_COMMANDS';
    
    const beginIndex = content.indexOf(beginMarker);
    const endIndex = content.indexOf(endMarker);
    
    if (beginIndex !== -1 && endIndex !== -1) {
        const beforeSection = content.substring(0, beginIndex + beginMarker.length);
        const afterSection = content.substring(endIndex);
        const newSection = customCommands ? '\n' + customCommands + '\n' : '\n';
        
        textarea.value = beforeSection + newSection + afterSection;
        
        const lines = textarea.value.split('\n').length;
        textarea.rows = lines + 1;
    }
}

// ==================== フォーム監視 ====================

function setupFormWatchers() {
    if (!formStructure.fields) {
        return;
    }
    
    Object.values(formStructure.fields).forEach(field => {
        if (field.selector) {
            document.querySelectorAll(field.selector).forEach(element => {
                element.removeEventListener('input', updateVariableDefinitions);
                element.removeEventListener('change', updateVariableDefinitions);
                
                if (element.type === 'radio' || element.type === 'checkbox' || element.tagName === 'SELECT') {
                    element.addEventListener('change', updateVariableDefinitions);
                } else {
                    element.addEventListener('input', updateVariableDefinitions);
                }
            });
        }
    });
    
    updateVariableDefinitions();
}

// ==================== ユーティリティ関数 ====================

// IPv6 が特定の CIDR に含まれるかを判定（簡易版）
function inCidr(ipv6, cidr) {
    const [prefix, bits] = cidr.split('/');
    const addrBin = ipv6ToBinary(ipv6);
    const prefixBin = ipv6ToBinary(prefix);
    return addrBin.substring(0, bits) === prefixBin.substring(0, bits);
}

// IPv6文字列 → 128bitバイナリ文字列
function ipv6ToBinary(ipv6) {
    // 短縮表記展開
    const full = ipv6.split('::').reduce((acc, part, i, arr) => {
        const segs = part.split(':').filter(Boolean);
        if (i === 0) {
            return segs;
        } else {
            const missing = 8 - (arr[0].split(':').filter(Boolean).length + segs.length);
            return acc.concat(Array(missing).fill('0'), segs);
        }
    }, []).map(s => s.padStart(4, '0'));
    // 16進 → 2進
    return full.map(seg => parseInt(seg, 16).toString(2).padStart(16, '0')).join('');
}

// GUA用プレフィックスを生成（RFC準拠）
function generateGuaPrefixFromFullAddress(apiInfo) {
    if (!apiInfo?.ipv6) return null;
    const ipv6 = apiInfo.ipv6.toLowerCase();

    // GUA範囲
    if (!inCidr(ipv6, '2000::/3')) return null;

    // 除外リスト（RFC/IANA準拠）
    const excludeCidrs = [
        '2001:db8::/32',  // ドキュメンテーション
        '2002::/16',      // 6to4
        '2001::/32',      // Teredo
        '2001:20::/28',   // ORCHIDv2
        '2001:2::/48',    // ベンチマーク
        '2001:3::/32',    // AMT
        '2001:4:112::/48' // AS112-v6
    ];
    if (excludeCidrs.some(cidr => inCidr(ipv6, cidr))) return null;

    // /64 プレフィックス生成
    const segments = ipv6.split(':');
    if (segments.length >= 4) {
        return `${segments[0]}:${segments[1]}:${segments[2]}:${segments[3]}::/64`;
    }
    return null;
}

function show(el) {
    const e = typeof el === 'string' ? document.querySelector(el) : el;
    if (e) {
        e.classList.remove('hide');
        e.style.display = '';
    }
}

function hide(el) {
    const e = typeof el === 'string' ? document.querySelector(el) : el;
    if (e) {
        e.classList.add('hide');
        e.style.display = 'none';
    }
}

function setValue(selector, val) {
    const el = document.querySelector(selector);
    if (el) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.value = val;
        } else {
            el.innerText = val;
        }
    }
}

function showAlert(message) {
    const alertEl = document.querySelector("#alert");
    if (alertEl) {
        alertEl.innerText = message;
        show(alertEl);
    }
}

function split(str) {
    return str.match(/[^\s,]+/g) || [];
}

function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

function resizePostinstTextarea() {
    const textarea = document.querySelector("#asu-packages");
    if (!textarea) return;
    
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

function setGuaPrefixIfAvailable() {
    const guaPrefixField = document.querySelector('#mape-gua-prefix');
    if (!guaPrefixField || !cachedApiInfo?.ipv6) return;
    const guaPrefix = generateGuaPrefixFromFullAddress(cachedApiInfo);
    if (guaPrefix) {
        guaPrefixField.value = guaPrefix;
        // console.log('GUA prefix set:', guaPrefix);
    }
}

function toggleGuaPrefixVisibility(mode) {
    const guaPrefixField = document.querySelector('#mape-gua-prefix');
    if (!guaPrefixField) return;
    const formGroup = guaPrefixField.closest('.form-group');
    if (mode === 'pd') {
        guaPrefixField.value = '';
        guaPrefixField.disabled = true;
        if (formGroup) formGroup.style.display = 'none';
        console.log('PD mode: GUA prefix hidden');
    } else if (mode === 'gua') {
        guaPrefixField.disabled = false;
        if (formGroup) formGroup.style.display = '';
        setGuaPrefixIfAvailable();
    }
}

// ==================== エラーハンドリング ====================

window.addEventListener('error', function(e) {
    console.error('Custom.js Error:', e.error);
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('Custom.js Unhandled Promise Rejection:', e.reason);
});

console.log('custom.js (Postinst Dynamic Management & setup.sh Fixed Version) fully loaded and ready');
