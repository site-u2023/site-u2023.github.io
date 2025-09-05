// custom.js - OpenWrt カスタム機能（動的パッケージ管理対応版）

console.log('custom.js loaded');

// ==================== グローバル変数 ====================
let customInitialized = false;
let customHTMLLoaded = false;
let PACKAGE_DB = null;
let devicePackages = [];
let setupConfig = null;
let formStructure = {};
let cachedApiInfo = null;
let defaultFieldValues = {}; // デフォルト値保存用
let dynamicPackages = new Set(); // 動的パッケージ管理用
let selectedLanguage = '';
let languageDelegatedBound = false; // 言語セレクタの委任リスナーがバインド済みか

// ==================== 初期化処理 ====================

// 元の updateImages をフック
const originalUpdateImages = window.updateImages;
window.updateImages = function(version, mobj) {
    if (originalUpdateImages) originalUpdateImages(version, mobj);

    // current_device が元コード側で確定済みかの確認と可用性チェック
    const langCode = (current_language || 'en').replace('_', '-').toLowerCase();
    isPackageAvailable(`luci-i18n-base-${langCode}`, 'luci').then(avail => {
    console.log(`Base language package for ${langCode} available:`, avail);
    });

    
    // パッケージリスト設定後にリサイズ
    if (mobj && "manifest" in mobj === false) {
        setTimeout(() => resizePostinstTextarea(), 100);
    }
    
    // 初回のみ custom.html を読み込む
    if (!customHTMLLoaded) {
        console.log("updateImages finished, now load custom.html");
        loadCustomHTML();
        customHTMLLoaded = true;
    } else {
        console.log("updateImages called again, reinitializing features");
        reinitializeFeatures();
    }
};

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

    cleanupExistingCustomElements();
    replaceAsuSection(asuSection, temp);
    insertExtendedInfo(temp);
    
    hookOriginalFunctions();
    
    // 設定とデータを並列で読み込み
    await Promise.all([
        loadSetupConfig(),
        loadPackageDatabase(),
        fetchAndDisplayIspInfo()
    ]);
    
    // 依存関係のある初期化（順序重要）
    setupEventListeners();
    loadUciDefaultsTemplate();
    initDeviceTranslation();
    
    // 言語セレクター設定（パッケージ処理の前に実行）
    setupLanguageSelector();
    
    // フォーム監視設定
    setupFormWatchers();
    
    customInitialized = true;
}

// #asuセクションを置き換え
function replaceAsuSection(asuSection, temp) {
    const newDiv = document.createElement('div');
    newDiv.id = 'asu';
    newDiv.className = asuSection.className;
    newDiv.style.width = '100%';
    
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

    newDiv.insertAdjacentHTML('beforeend', `
        <br>
        <div id="asu-buildstatus" class="hide"><span></span></div>
        <a href="javascript:buildAsuRequest()" class="custom-link">
            <span></span><span class="tr-request-build">REQUEST BUILD</span>
        </a>
    `);
    
    asuSection.parentNode.replaceChild(newDiv, asuSection);
}

// 拡張情報セクション挿入
function insertExtendedInfo(temp) {
    const extendedInfo = temp.querySelector('#extended-build-info');
    const imageLink = document.querySelector('#image-link');
    if (extendedInfo && imageLink && !document.querySelector('#extended-build-info')) {
        imageLink.closest('.row').insertAdjacentElement('afterend', extendedInfo);
        show('#extended-build-info');
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

// 再初期化処理
function reinitializeFeatures() {
    if (!document.querySelector('#asu')) return;
    
    console.log('reinitializeFeatures called');
    
    // 言語セレクター設定（初期値の取り直しと同期・即時反映のみ
    const mainLanguageSelect = document.querySelector('#languages-select');
    if (mainLanguageSelect) {
        mainLanguageSelect.removeEventListener('change', handleMainLanguageChange);
        mainLanguageSelect.addEventListener('change', handleMainLanguageChange);
    }
    const customLanguageSelect = document.querySelector('#aios-language');
    if (customLanguageSelect) {
        customLanguageSelect.removeEventListener('change', handleCustomLanguageChange);
        customLanguageSelect.addEventListener('change', handleCustomLanguageChange);
    }
    // 初回と同じく即時反映
    updateLanguagePackageImmediate();
    
    setupEventListeners();
    
    if (PACKAGE_DB) generatePackageSelector();
    fetchAndDisplayIspInfo();
    if (cachedApiInfo) updateAutoConnectionInfo(cachedApiInfo);
}

// ==================== 言語セレクター設定 ====================
function extractLanguagesFromHTML() {
    const select = document.querySelector('#languages-select');
    if (!select) {
        console.warn('languages-select not found');
        return [];
    }

    const options = Array.from(select.querySelectorAll('option'));
    const languages = options.map(opt => ({
        value: opt.value,
        label: opt.textContent
    }));

    console.log('Extracted languages from HTML:', languages.length);
    return languages;
}

// 言語セレクターの委任リスナーを一度だけバインド
function ensureLanguageDelegatedListeners() {
    if (languageDelegatedBound) return;
    document.addEventListener('change', async (e) => {
        const t = e.target;
        if (!t) return;
        if (t.id === 'languages-select') {
            await handleMainLanguageChange(e);
        } else if (t.id === 'aios-language') {
            await handleCustomLanguageChange(e);
        }
    }, true); // capture=true で差し替え直後でも確実に拾う
    languageDelegatedBound = true;
    console.log('Language delegated listeners bound');
}

function setupLanguageSelector() {
    console.log('setupLanguageSelector called');
    
    // 現在の言語を正確に取得（フォールバック付き）
    const mainLanguageSelect = document.querySelector('#languages-select');
    if (mainLanguageSelect && mainLanguageSelect.value) {
        selectedLanguage = mainLanguageSelect.value;
    } else if (current_language) {
        selectedLanguage = current_language;
    } else {
        selectedLanguage = config.default_language || 'en';
    }
    
    console.log('Initial selected language:', selectedLanguage);

    // イベントは委任で一度だけ張る
    ensureLanguageDelegatedListeners();

    // カスタムフォーム内の言語セレクターを同期
    const customLanguageSelect = document.querySelector('#aios-language');
    if (customLanguageSelect) {
        // メインセレクターと同期
        if (selectedLanguage && customLanguageSelect.value !== selectedLanguage) {
            customLanguageSelect.value = selectedLanguage;
        }
        
        console.log('Custom language selector initialized and synced');
    }
    
    // 初回言語パッケージ更新（重要：最初に実行）
    updateLanguagePackageImmediate();
}

function preserveInputValues() {
    const values = {};
    document.querySelectorAll('input, textarea, select').forEach(el => {
        if (el.id) values[el.id] = el.value;
    });
    return values;
}

function restoreInputValues(values) {
    Object.keys(values).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = values[id];
    });
}

async function handleMainLanguageChange(e) {
    const savedValues = preserveInputValues();

    let newLanguage = e.target.value;
    console.log(`Main language changed from "${selectedLanguage}" to "${newLanguage}"`);

    const langCode = newLanguage.replace('_', '-').toLowerCase();
    if (!(await isPackageAvailable(`luci-i18n-base-${langCode}`, 'luci'))) {
    console.warn(`Base language package for ${langCode} not available, fallback to ${config.fallback_language}`);
    newLanguage = config.fallback_language;
    e.target.value = config.fallback_language;
    }
    
    selectedLanguage = newLanguage;
    
    const customLanguageSelect = document.querySelector('#aios-language');
    if (customLanguageSelect && customLanguageSelect.value !== selectedLanguage) {
        customLanguageSelect.value = selectedLanguage;
        console.log('Custom language selector synced');
    }
    
    updateLanguagePackageImmediate();
    setTimeout(() => {
        updateSetupJsonPackages();
        updatePackageListFromSelector();
        updateVariableDefinitions();
        restoreInputValues(savedValues);
    }, 50);
}

// 言語パッケージ存在チェック（opkg / apk 両対応）
/**
 * 任意パッケージの存在確認（feed 固定なし）
 * @param {string} pkgName - 確認するパッケージ名
 * @param {string} feed    - フィード名（例: "base", "packages", "routing", "telephony", "luci" など）
 * @returns {Promise<boolean>} 存在すれば true
 */
async function isPackageAvailable(pkgName, feed) {
    if (!pkgName || !feed) {
        throw new Error("pkgName と feed は必須です");
    }
    try {
        if (!current_device?.version || !current_device?.target) {
            console.warn("current_device not set:", current_device);
            return false;
        }

        const arch = await getArchForCurrentDevice?.();
        if (!arch) {
            console.warn("arch resolve failed for target:", current_device.target);
            return false;
        }

        let packagesUrl;

        if (current_device.version.includes('SNAPSHOT')) {
            packagesUrl = config.apk_search_url
                .replace('{arch}', arch)
                .replace('{feed}', feed);

            const resp = await fetch(packagesUrl, { cache: 'no-store' });
            if (!resp.ok) return false;

            const data = await resp.json();
            if (Array.isArray(data.packages)) {
                return data.packages.some(p => p?.name === pkgName);
            } else if (data.packages && typeof data.packages === 'object') {
                return Object.prototype.hasOwnProperty.call(data.packages, pkgName);
            }
            return false;

        } else {
            packagesUrl = config.opkg_search_url
                .replace('{version}', current_device.version)
                .replace('{arch}', arch)
                .replace('{feed}', feed);

            const resp = await fetch(packagesUrl, { cache: 'no-store' });
            if (!resp.ok) return false;

            const text = await resp.text();
            return text.split('\n').some(line => line.trim() === `Package: ${pkgName}`);
        }

    } catch (err) {
        console.error('Package availability check failed:', err);
        return false;
    }
}

async function handleCustomLanguageChange(e) {
    const savedValues = preserveInputValues();

    let newLanguage = e.target.value;
    console.log(`Custom language changed from "${selectedLanguage}" to "${newLanguage}"`);

    const langCode = newLanguage.replace('_', '-').toLowerCase();
    if (!(await isPackageAvailable(`luci-i18n-base-${langCode}`, 'luci'))) {
        console.warn(`Base language package for ${langCode} not available, fallback to ${config.fallback_language}`);
        newLanguage = config.fallback_language;
        e.target.value = config.fallback_language;
    }
    
    selectedLanguage = newLanguage;
    
    updateLanguagePackageImmediate();
    setTimeout(() => {
        updateSetupJsonPackages();
        updatePackageListFromSelector();
        updateVariableDefinitions();
        restoreInputValues(savedValues);
    }, 50);
}

// ==================== setup.json 処理 ====================

async function loadSetupConfig() {
    try {
        const url = config?.setup_db_url || 'uci-defaults/setup.json';
        const cacheBuster = '?t=' + Date.now();
        const response = await fetch(url + cacheBuster);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        setupConfig = await response.json();
        
        console.log('Setup config loaded:', setupConfig);
        
        // フォーム構造を生成
        formStructure = generateFormStructure(setupConfig);
        
        // デフォルト値を保存
        storeDefaultValues(setupConfig);

        // HTMLに描画（完全にクリアしてから）
        renderSetupConfig(setupConfig);
        
        console.log('Setup config rendered successfully');
        return setupConfig;
    } catch (err) {
        console.error('Failed to load setup.json:', err);
        return null;
    }
}

// デフォルト値を保存
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

// setup.json → HTML描画（完全修正版）
function renderSetupConfig(config) {
    const container = document.querySelector('#dynamic-config-sections');
    if (!container) {
        console.error('#dynamic-config-sections not found');
        return;
    }
    
    // 完全にクリア
    container.innerHTML = '';
    console.log('Container cleared, rebuilding...');

    (config.categories || []).forEach((category, categoryIndex) => {
        console.log(`Rendering category ${categoryIndex}: ${category.name}`);
        
        const section = document.createElement('div');
        section.className = 'config-section';
        section.id = category.id;

        const h4 = document.createElement('h4');
        h4.textContent = category.name || category.id || '';
        section.appendChild(h4);

        if (category.description) {
            const desc = document.createElement('p');
            desc.className = 'package-category-description';
            desc.textContent = category.description;
            section.appendChild(desc);
        }

        (category.packages || []).forEach((pkg, packageIndex) => {
            console.log(`Rendering package ${categoryIndex}-${packageIndex}: ${pkg.id || 'no-id'} (${pkg.type})`);
            try {
                buildField(section, pkg);
                console.log(`✓ Successfully rendered package ${pkg.id}`);
            } catch (error) {
                console.error(`✗ Error rendering package ${pkg.id}:`, error);
                console.trace(); // スタックトレース
            }
        });

        container.appendChild(section);
        console.log(`Added section: ${category.id}`);
    });
    
    // 条件表示の初期評価とイベント連動
    setTimeout(() => {
        initConditionalSections(config);
        console.log('Conditional sections initialized');
    }, 100);
}

function buildField(parent, pkg) {
    console.log(`Building field: ${pkg.id} (type: ${pkg.type})`);
    
    switch (pkg.type) {
        case 'input-group': {
            const rows = getRows(pkg);
            console.log(`Input group ${pkg.id} has ${rows.length} rows`);
            
            rows.forEach((row, rowIndex) => {
                const rowEl = document.createElement('div');
                rowEl.className = 'form-row';
                
                console.log(`Row ${rowIndex} has ${(row.columns || []).length} columns`);
                
                (row.columns || []).forEach((col, colIndex) => {
                    console.log(`Building column ${rowIndex}-${colIndex}: ${col.id} (${col.type})`);
                    const groupEl = buildFormGroup(col);
                    if (groupEl) {
                        rowEl.appendChild(groupEl);
                    }
                });
                
                if (rowEl.children.length > 0) {
                    parent.appendChild(rowEl);
                    console.log(`Added row with ${rowEl.children.length} columns`);
                }
            });
            break;
        }

        case 'radio-group': {
            console.log(`Building radio group: ${pkg.id}`);
            const row = document.createElement('div');
            row.className = 'form-row';

            const group = document.createElement('div');
            group.className = 'form-group';

            if (pkg.name || pkg.label) {
                const legend = document.createElement('div');
                legend.className = 'form-label';
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
                
                // packagesプロパティを保存
                if (opt.packages && Array.isArray(opt.packages)) {
                    radio.setAttribute('data-packages', JSON.stringify(opt.packages));
                }
                
                if (opt.checked || (pkg.defaultValue != null && opt.value === pkg.defaultValue)) {
                    radio.checked = true;
                    console.log(`Radio ${pkg.id} default checked: ${opt.value}`);
                }
                
                // ラジオボタン変更時のイベントリスナーを追加
                radio.addEventListener('change', handleRadioChange);
                
                lbl.appendChild(radio);
                lbl.appendChild(document.createTextNode(' ' + (opt.label != null ? opt.label : String(opt.value))));
                radioWrap.appendChild(lbl);
            });

            group.appendChild(radioWrap);
            row.appendChild(group);
            parent.appendChild(row);
            break;
        }

        case 'conditional-section': {
            console.log(`Building conditional section: ${pkg.id}`);
            const condWrap = document.createElement('div');
            condWrap.id = pkg.id;
            condWrap.className = 'conditional-section';
            condWrap.style.display = 'none'; // 初期は非表示

            if (pkg.name) {
                const h5 = document.createElement('h5');
                h5.textContent = pkg.name;
                condWrap.appendChild(h5);
            }

            (pkg.children || []).forEach(child => {
                buildField(condWrap, child);
            });

            parent.appendChild(condWrap);
            break;
        }

        case 'info-display': {
            console.log(`Building info display: ${pkg.id}`);
            const infoDiv = document.createElement('div');
            infoDiv.id = pkg.id;
            infoDiv.className = 'info-display';
            infoDiv.style.padding = '1em';
            infoDiv.style.backgroundColor = 'var(--bg-item)';
            infoDiv.style.borderRadius = '0.2em';
            infoDiv.style.marginTop = '0.5em';
            infoDiv.style.whiteSpace = 'pre-line';
            infoDiv.textContent = pkg.content || '';
            parent.appendChild(infoDiv);
            break;
        }

        default:
            console.warn('Unknown field type:', pkg.type, pkg);
            break;
    }
}

// フォームグループを構築（完全修正版）
function buildFormGroup(field) {
    if (!field) return null;

    console.log(`Building form group: ${field.id} (${field.type})`);

    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.textContent = field.label || field.name || field.id || '';
    if (field.id) label.setAttribute('for', field.id);
    group.appendChild(label);

    let ctrl;
    if (field.type === 'select') {
        console.log(`Creating select for ${field.id}`);
        ctrl = document.createElement('select');
        if (field.id) ctrl.id = field.id;
        
        let optionsSource = [];
        if (field.id === 'aios-language') {
            optionsSource = extractLanguagesFromHTML();
        } else {
            optionsSource = field.options || [];
        }

        optionsSource.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label != null ? opt.label : String(opt.value);
            if (opt.selected || (field.defaultValue != null && opt.value === field.defaultValue)) {
                option.selected = true;
                console.log(`Select ${field.id} default selected: ${opt.value}`);
            }
            ctrl.appendChild(option);
        });
        
        // セレクト変更時のイベントリスナーを追加
        ctrl.addEventListener('change', updatePackageListFromDynamicSources);
    } else {
        console.log(`Creating ${field.type || 'text'} input for ${field.id}`);
        ctrl = document.createElement('input');
        ctrl.type = field.type || 'text';
        if (field.id) ctrl.id = field.id;
        if (field.placeholder) ctrl.placeholder = field.placeholder;
        
        // デフォルト値設定（重要な修正）
        if (field.defaultValue !== null && field.defaultValue !== undefined) {
            ctrl.value = field.defaultValue;
            console.log(`Input ${field.id} default value set: ${field.defaultValue}`);
        }
        
        if (field.min != null) ctrl.min = field.min;
        if (field.max != null) ctrl.max = field.max;
        if (field.maxlength != null) ctrl.maxLength = field.maxlength;
        if (field.pattern != null) ctrl.pattern = field.pattern;
        
        // インプット変更時のイベントリスナーを追加
        ctrl.addEventListener('input', updatePackageListFromDynamicSources);
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

// ラジオボタン変更時の処理
function handleRadioChange(e) {
    const radio = e.target;
    const packagesData = radio.getAttribute('data-packages');
    
    console.log(`Radio changed: ${radio.name} = ${radio.value}`);
    
    // 同じ名前の他のラジオボタンから動的パッケージを削除
    const sameNameRadios = document.querySelectorAll(`input[name="${radio.name}"]`);
    sameNameRadios.forEach(r => {
        if (r !== radio) {
            const otherPackagesData = r.getAttribute('data-packages');
            if (otherPackagesData) {
                try {
                    const otherPackages = JSON.parse(otherPackagesData);
                    otherPackages.forEach(pkg => {
                        dynamicPackages.delete(pkg);
                        console.log(`Removed dynamic package: ${pkg}`);
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
                console.log(`Added dynamic package: ${pkg}`);
            });
        } catch (err) {
            console.error('Error parsing packages data:', err);
        }
    }
    
    // パッケージリストを段階的に更新
    updateSetupJsonPackages();
    updateLanguagePackageImmediate();
    updatePackageListFromSelector();
    updateVariableDefinitions();
}

// ==================== 動的パッケージ管理（修正版） ====================

function updatePackageListFromDynamicSources() {
    console.log('updatePackageListFromDynamicSources called');
    
    // setup.jsonのpackages要素の処理を先に実行
    updateSetupJsonPackages();
    
    // 言語パッケージの処理は後で実行
    updateLanguagePackageImmediate();
    
    // メインのパッケージリスト更新
    updatePackageListFromSelector();
    
    console.log('Dynamic packages updated:', Array.from(dynamicPackages));
}

// 言語パッケージの即座更新
function updateLanguagePackageImmediate() {
    console.log('updateLanguagePackageImmediate called, selectedLanguage:', selectedLanguage);
    
    // 既存の言語パッケージをdynamicPackagesから削除
    const languagePackagesToRemove = [];
    for (const pkg of dynamicPackages) {
        if (pkg.startsWith('luci-i18n-')) {
            languagePackagesToRemove.push(pkg);
        }
    }
    
    languagePackagesToRemove.forEach(pkg => {
        dynamicPackages.delete(pkg);
        console.log(`Removed language package from dynamics: ${pkg}`);
    });
    
    // テキストエリアからも言語パッケージを削除
    const textarea = document.querySelector('#asu-packages');
    if (textarea) {
        const currentPackages = split(textarea.value);
        const filteredPackages = currentPackages.filter(pkg => !pkg.startsWith('luci-i18n-'));
        textarea.value = filteredPackages.join(' ');
        console.log('Removed language packages from textarea');
    }
    
    // 新しい言語パッケージを追加（英語以外の場合）
    if (selectedLanguage && selectedLanguage !== 'en') {
        const langCode = selectedLanguage.replace('_', '-').toLowerCase();
        console.log(`Adding language packages for: ${langCode}`);
        
        // 現在のパッケージリストを取得（言語パッケージを除く）
        const currentPackages = getCurrentPackageListExcludingLanguages();
        console.log('Current packages (excluding language):', currentPackages.length);
        
        // luciパッケージを検出して対応する言語パッケージを追加
        const luciPackages = findLuciPackages(currentPackages);
        console.log('Found LuCI packages:', luciPackages);
        
        luciPackages.forEach(luciPkg => {
            const languagePackage = `luci-i18n-${luciPkg}-${langCode}`;
            dynamicPackages.add(languagePackage);
            console.log(`Added language package: ${languagePackage}`);
        });
        
        // ベース言語パッケージも追加
        const baseLanguagePackage = `luci-i18n-base-${langCode}`;
        dynamicPackages.add(baseLanguagePackage);
        console.log(`Added base language package: ${baseLanguagePackage}`);
        
        console.log(`Total language packages added: ${luciPackages.length + 1}`);
    } else {
        console.log('English selected or no language, no language packages added');
    }
}

function getCurrentPackageListExcludingLanguages() {
    const packages = new Set();
    
    // パッケージセレクターから選択されたパッケージ
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        if (pkgName && !pkgName.startsWith('luci-i18n-')) {
            packages.add(pkgName);
        }
    });
    
    // テキストエリアから既存パッケージ（言語パッケージ除外）
    const textarea = document.querySelector('#asu-packages');
    if (textarea) {
        const textPackages = split(textarea.value);
        textPackages.forEach(pkg => {
            if (!pkg.startsWith('luci-i18n-')) {
                packages.add(pkg);
            }
        });
    }
    
    // setup.json由来の動的パッケージ（言語パッケージ除外）
    for (const pkg of dynamicPackages) {
        if (!pkg.startsWith('luci-i18n-')) {
            packages.add(pkg);
        }
    }
    
    return Array.from(packages);
}

function findLuciPackages(packageList) {
    const luciPackages = new Set();
    
    packageList.forEach(pkg => {
        if (pkg.startsWith('luci-')) {
            // luci-i18n- パッケージは除外
            if (!pkg.startsWith('luci-i18n-')) {
                let luciName = '';
                
                // 特定のパッケージ名変換
                if (pkg === 'luci') {
                    luciName = 'base';
                } else if (pkg.startsWith('luci-app-')) {
                    luciName = pkg.substring(5); // "luci-" を除去してapp-から始まる部分を取得
                } else if (pkg.startsWith('luci-mod-')) {
                    luciName = pkg.substring(5); // "luci-" を除去してmod-から始まる部分を取得
                } else if (pkg.startsWith('luci-theme-')) {
                    luciName = pkg.substring(5); // "luci-" を除去してtheme-から始まる部分を取得
                } else if (pkg.startsWith('luci-proto-')) {
                    luciName = pkg.substring(5); // "luci-" を除去してproto-から始まる部分を取得
                } else if (pkg.startsWith('luci-lib-')) {
                    luciName = pkg.substring(5); // "luci-" を除去
                } else if (pkg.startsWith('luci-ssl')) {
                    // luci-ssl は特別扱いしない
                    return;
                } else {
                    // その他のluciパッケージ
                    luciName = pkg.substring(5);
                }
                
                if (luciName) {
                    luciPackages.add(luciName);
                    console.log(`Found LuCI package: ${pkg} -> ${luciName}`);
                }
            }
        }
    });
    
    return Array.from(luciPackages);
}

function updateSetupJsonPackages() {
    if (!setupConfig) return;
    
    // 現在の選択状況を確認して動的パッケージを更新
    setupConfig.categories.forEach(category => {
        category.packages.forEach(pkg => {
            if (pkg.type === 'radio-group' && pkg.variableName) {
                const selectedValue = getFieldValue(`input[name="${pkg.variableName}"]:checked`);
                if (selectedValue) {
                    // 選択されたオプションのパッケージを追加
                    const selectedOption = pkg.options.find(opt => opt.value === selectedValue);
                    if (selectedOption && selectedOption.packages) {
                        selectedOption.packages.forEach(pkgName => {
                            dynamicPackages.add(pkgName);
                            console.log(`Added setup.json package: ${pkgName}`);
                        });
                    }
                    
                    // 選択されていないオプションのパッケージを削除
                    pkg.options.forEach(opt => {
                        if (opt.value !== selectedValue && opt.packages) {
                            opt.packages.forEach(pkgName => {
                                dynamicPackages.delete(pkgName);
                                console.log(`Removed setup.json package: ${pkgName}`);
                            });
                        }
                    });
                    
                    // AUTO時の特別処理：APIから検出された接続タイプに応じてパッケージを追加
                    if (pkg.variableName === 'connection_type' && selectedValue === 'auto' && cachedApiInfo) {
                        if (cachedApiInfo.mape?.brIpv6Address) {
                            // MAP-Eが検出された場合
                            const mapeOption = pkg.options.find(opt => opt.value === 'mape');
                            if (mapeOption && mapeOption.packages) {
                                mapeOption.packages.forEach(pkgName => {
                                    dynamicPackages.add(pkgName);
                                    console.log(`Added AUTO-detected MAP-E package: ${pkgName}`);
                                });
                            }
                        } else if (cachedApiInfo.aftr) {
                            // DS-Liteが検出された場合
                            const dsliteOption = pkg.options.find(opt => opt.value === 'dslite');
                            if (dsliteOption && dsliteOption.packages) {
                                dsliteOption.packages.forEach(pkgName => {
                                    dynamicPackages.add(pkgName);
                                    console.log(`Added AUTO-detected DS-Lite package: ${pkgName}`);
                                });
                            }
                        }
                    }
                }
            }
        });
    });
}

// 条件表示の初期化
function initConditionalSections(config) {
    const conditionals = collectConditionals(config);
    const deps = buildDeps(conditionals);

    console.log('Conditional sections found:', conditionals.length);
    console.log('Dependencies:', deps);

    // 初期評価
    evaluateAll();

    // 依存コントローラにイベントを結線
    for (const key of Object.keys(deps)) {
        const ctrls = findControlsByKey(key);
        console.log(`Setting up listeners for ${key}, found ${ctrls.length} controls`);
        
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
    if (Array.isArray(group.rows) && group.rows.length) {
        return group.rows.map(r => ({ columns: Array.isArray(r.columns) ? r.columns : [] }));
    }
    const fields = Array.isArray(group.fields) ? group.fields : [];
    const rows = [];
    for (let i = 0; i < fields.length; i += 2) {
        const cols = [fields[i]];
        if (fields[i + 1]) cols.push(fields[i + 1]);
        rows.push({ columns: cols });
    }
    return rows;
}

function cssEscape(s) {
    return String(s).replace(/"/g, '\\"');
}

// フォーム構造生成
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

function applySpecialFieldLogic(values) {
    const connectionType = getFieldValue('input[name="connection_type"]');
    console.log('Connection type for filtering:', connectionType);
    
    // 全ての接続タイプのフィールド変数名をリストアップ
    const connectionFieldVars = [
        'pppoe_username', 'pppoe_password',
        'dslite_aftr_type', 'dslite_region', 'dslite_aftr_address', 
        'mape_br', 'mape_ealen', 'mape_ipv4_prefix', 'mape_ipv4_prefixlen',
        'mape_ipv6_prefix', 'mape_ipv6_prefixlen', 'mape_psid_offset', 'mape_psidlen',
        'mape_gua_prefix', 'mape_gua_mode', 'mape_type',
        'ap_ip_address', 'ap_gateway'
    ];
    
    if (connectionType === 'auto') {
        // AUTO: まず全ての接続フィールドを削除
        connectionFieldVars.forEach(key => delete values[key]);
        
        // APIから検出された値のみを追加
        if (cachedApiInfo) {
            if (cachedApiInfo.mape?.brIpv6Address) {
                // MAP-Eの値のみを設定
                values.mape_br = cachedApiInfo.mape.brIpv6Address;
                values.mape_ealen = cachedApiInfo.mape.eaBitLength;
                values.mape_ipv4_prefix = cachedApiInfo.mape.ipv4Prefix;
                values.mape_ipv4_prefixlen = cachedApiInfo.mape.ipv4PrefixLength;
                values.mape_ipv6_prefix = cachedApiInfo.mape.ipv6Prefix;
                values.mape_ipv6_prefixlen = cachedApiInfo.mape.ipv6PrefixLength;
                values.mape_psid_offset = cachedApiInfo.mape.psIdOffset;
                values.mape_psidlen = cachedApiInfo.mape.psidlen;
                
                if (cachedApiInfo.mape.ipv6Prefix) {
                    const prefix = cachedApiInfo.mape.ipv6Prefix;
                    const segments = prefix.split(':');
                    while (segments.length < 4) {
                        segments.push('0');
                    }
                    values.mape_gua_prefix = segments.slice(0, 4).join(':') + '::/64';
                    values.mape_gua_mode = '1';
                }
                console.log('AUTO: Applied MAP-E settings from API');
            } else if (cachedApiInfo.aftr) {
                // DS-Liteの値のみを設定
                values.dslite_aftr_address = cachedApiInfo.aftr;
                console.log('AUTO: Applied DS-Lite settings from API');
            } else {
                console.log('AUTO: No connection info from API, no connection fields set');
            }
        } else {
            console.log('AUTO: No API info available, no connection fields set');
        }
    } else if (connectionType === 'dhcp') {
        // DHCP: 全ての接続関連フィールドを削除
        connectionFieldVars.forEach(key => delete values[key]);
        console.log('DHCP: Removed all connection fields');
    } else if (connectionType === 'pppoe') {
        // PPPoE: PPPoE以外の接続フィールドを削除
        connectionFieldVars.filter(key => !key.startsWith('pppoe_')).forEach(key => delete values[key]);
        console.log('PPPoE: Kept only PPPoE fields');
    } else if (connectionType === 'dslite') {
        // DS-Lite: DS-Lite以外の接続フィールドを削除
        connectionFieldVars.filter(key => !key.startsWith('dslite_')).forEach(key => delete values[key]);
        
        // APIから実際の値がある場合は上書き
        if (cachedApiInfo?.aftr) {
            values.dslite_aftr_address = cachedApiInfo.aftr;
            console.log('DS-Lite: Overrode with API value');
        }
        console.log('DS-Lite: Kept only DS-Lite fields');
    } else if (connectionType === 'mape') {
        // MAP-E: MAP-E以外の接続フィールドを削除
        connectionFieldVars.filter(key => !key.startsWith('mape_')).forEach(key => delete values[key]);
        
        // APIから実際の値がある場合は上書き
        if (cachedApiInfo?.mape?.brIpv6Address) {
            values.mape_br = cachedApiInfo.mape.brIpv6Address;
            values.mape_ealen = cachedApiInfo.mape.eaBitLength;
            values.mape_ipv4_prefix = cachedApiInfo.mape.ipv4Prefix;
            values.mape_ipv4_prefixlen = cachedApiInfo.mape.ipv4PrefixLength;
            values.mape_ipv6_prefix = cachedApiInfo.mape.ipv6Prefix;
            values.mape_ipv6_prefixlen = cachedApiInfo.mape.ipv6PrefixLength;
            values.mape_psid_offset = cachedApiInfo.mape.psIdOffset;
            values.mape_psidlen = cachedApiInfo.mape.psidlen;
            
            if (cachedApiInfo.mape.ipv6Prefix) {
                const prefix = cachedApiInfo.mape.ipv6Prefix;
                const segments = prefix.split(':');
                while (segments.length < 4) {
                    segments.push('0');
                }
                values.mape_gua_prefix = segments.slice(0, 4).join(':') + '::/64';
                values.mape_gua_mode = '1';
            }
            console.log('MAP-E: Overrode with API values');
        }
        
        // MAP-E GUAモード設定
        const mapeType = getFieldValue('input[name="mape_type"]');
        if (mapeType === 'gua') values.mape_gua_mode = '1';
        console.log('MAP-E: Kept only MAP-E fields');
    } else if (connectionType === 'ap') {
        // AP: AP以外の接続フィールドを削除
        connectionFieldVars.filter(key => !key.startsWith('ap_')).forEach(key => delete values[key]);
        console.log('AP: Kept only AP fields');
    } else {
        // 未知の接続タイプ: 全ての接続フィールドを削除
        connectionFieldVars.forEach(key => delete values[key]);
        console.log('Unknown connection type: Removed all connection fields');
    }
    
    // Wi-Fiモード処理
    const wifiMode = getFieldValue('input[name="wifi_mode"]');
    if (wifiMode === 'disabled') {
        ['wlan_ssid', 'wlan_password', 'enable_usteer', 'mobility_domain', 'snr']
            .forEach(key => delete values[key]);
    } else if (wifiMode === 'standard') {
        ['enable_usteer', 'mobility_domain', 'snr']
            .forEach(key => delete values[key]);
    } else if (wifiMode === 'usteer') {
        values.enable_usteer = '1';
    }
    
    // Network Optimizerモード処理
    const netOptimizer = getFieldValue('input[name="net_optimizer"]');
    if (netOptimizer === 'auto') {
        values.enable_netopt = '1';
        ['netopt_rmem', 'netopt_wmem', 'netopt_conntrack', 'netopt_backlog', 'netopt_somaxconn', 'netopt_congestion']
            .forEach(key => delete values[key]);
    } else if (netOptimizer === 'disabled') {
        ['enable_netopt', 'netopt_rmem', 'netopt_wmem', 'netopt_conntrack', 'netopt_backlog', 'netopt_somaxconn', 'netopt_congestion']
            .forEach(key => delete values[key]);
    }
    
    console.log('Final values after filtering:', Object.keys(values));
}

// ==================== イベントハンドラ（完全修正版） ====================

function setupEventListeners() {
    console.log('setupEventListeners called');
    
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
            console.log(`Initial state for ${name}: ${checked.value}`);
            handler({ target: checked });
        }
    });
}

function handleConnectionTypeChange(e) {
    const selectedType = e.target.value;
    console.log('Connection type changed to:', selectedType);
    
    const sections = ['auto', 'dhcp', 'pppoe', 'dslite', 'mape', 'ap'];
    sections.forEach(type => {
        const section = document.querySelector(`#${type}-section`);
        if (section) {
            if (type === selectedType) {
                show(section);
                if (type === 'auto' && cachedApiInfo) {
                    updateAutoConnectionInfo(cachedApiInfo);
                }
            } else {
                hide(section);
            }
        }
    });
    
    // パッケージ更新を段階的に実行
    updateSetupJsonPackages();
    updateLanguagePackageImmediate();
    updatePackageListFromSelector();
    updateVariableDefinitions();
}

function handleNetOptimizerChange(e) {
    const mode = e.target.value;
    console.log('Net optimizer changed to:', mode);
    
    ['auto', 'manual', 'disabled'].forEach(m => {
        const section = document.querySelector(`#netopt-${m}-section`);
        if (section) {
            if (m === mode) {
                show(section);
                // Manual選択時にデフォルト値を復元
                if (m === 'manual') {
                    restoreManualDefaults();
                }
            } else {
                hide(section);
            }
        }
    });
    
    // パッケージ更新を段階的に実行
    updateSetupJsonPackages();
    updateLanguagePackageImmediate();
    updatePackageListFromSelector();
    updateVariableDefinitions();
}

// Manual設定のデフォルト値復元（新規追加）
function restoreManualDefaults() {
    const manualFields = {
        'netopt-rmem': '4096 131072 8388608',
        'netopt-wmem': '4096 131072 8388608',
        'netopt-conntrack': '131072',
        'netopt-backlog': '5000',
        'netopt-somaxconn': '16384',
        'netopt-congestion': 'cubic'
    };
    
    Object.entries(manualFields).forEach(([id, defaultValue]) => {
        const el = document.querySelector(`#${id}`);
        if (el && !el.value) { // 空の場合のみデフォルト値を設定
            el.value = defaultValue;
            console.log(`Restored default for ${id}: ${defaultValue}`);
        }
    });
}

function handleWifiModeChange(e) {
    const mode = e.target.value;
    console.log('WiFi mode changed to:', mode);
    
    const wifiOptionsContainer = document.querySelector("#wifi-options-container");
    const usteerOptions = document.querySelector("#usteer-options");
    
    if (mode === 'disabled') {
        hide(wifiOptionsContainer);
        // Disabledの場合のみクリア
        clearWifiFields();
    } else {
        show(wifiOptionsContainer);
        // StandardまたはUsteer選択時にデフォルト値を復元
        restoreWifiDefaults();
        
        if (mode === 'usteer') {
            show(usteerOptions);
        } else {
            hide(usteerOptions);
        }
    }
    
    // パッケージ更新を段階的に実行
    updateSetupJsonPackages();
    updateLanguagePackageImmediate();
    updatePackageListFromSelector();
    updateVariableDefinitions();
}

// WiFiフィールドクリア（新規追加）
function clearWifiFields() {
    ['aios-wifi-ssid', 'aios-wifi-password', 'aios-wifi-mobility-domain', 'aios-wifi-snr']
        .forEach(id => {
            const el = document.querySelector(`#${id}`);
            if (el) {
                el.value = '';
                console.log(`Cleared field: ${id}`);
            }
        });
}

// WiFiデフォルト値復元（新規追加）
function restoreWifiDefaults() {
    const wifiDefaults = {
        'aios-wifi-ssid': 'OpenWrt',
        'aios-wifi-password': 'openwrt123',
        'aios-wifi-mobility-domain': '4f57',
        'aios-wifi-snr': '30 15 5'
    };
    
    Object.entries(wifiDefaults).forEach(([id, defaultValue]) => {
        const el = document.querySelector(`#${id}`);
        if (el && !el.value) { // 空の場合のみデフォルト値を設定
            el.value = defaultValue;
            console.log(`Restored WiFi default for ${id}: ${defaultValue}`);
        }
    });
}

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
    if (!apiInfo || !formStructure.fields) return;
    
    const connectionType = getFieldValue('input[name="connection_type"]');
    
    Object.values(formStructure.fields).forEach(field => {
        if (field.apiMapping) {
            const isConnectionField = ['dslite', 'mape', 'ap', 'pppoe'].some(type => 
                formStructure.connectionTypes[type]?.includes(field.id)
            );
            
            if (isConnectionField && connectionType !== 'auto') {
                return;
            }
            
            let value = getNestedValue(apiInfo, field.apiMapping);

            if (field.apiMapping === 'mape.ipv6PrefixWith64' && apiInfo.mape?.ipv6Prefix) {
                const prefix = apiInfo.mape.ipv6Prefix;
                if (!prefix.includes('/')) {
                    const segments = prefix.split(':');
                    while (segments.length < 4) segments.push('0');
                    value = segments.slice(0, 4).join(':') + '::/64';
                } else {
                    value = prefix;
                }
            }

            if (value !== null && value !== undefined && value !== '') {
                const element = document.querySelector(field.selector);
                if (element) {
                    element.value = value;
                }
            }
        }
    });
    
    updateAutoConnectionInfo(apiInfo);
    
    // ISP情報適用後に動的パッケージ管理を実行
    updatePackageListFromDynamicSources();
    
    updateVariableDefinitions();
}

function updateAutoConnectionInfo(apiInfo) {
    const autoInfo = document.querySelector('#auto-info');
    if (!autoInfo) return;
    
    let infoText = '';
    
    if (apiInfo?.mape?.brIpv6Address) {
        infoText = '🌐 Detected: MAP-E\n';
        infoText += `   BR: ${apiInfo.mape.brIpv6Address}\n`;
        infoText += `   EA-len: ${apiInfo.mape.eaBitLength}\n`;
        infoText += `   IPv4 Prefix: ${apiInfo.mape.ipv4Prefix}/${apiInfo.mape.ipv4PrefixLength}\n`;
        infoText += `   IPv6 Prefix: ${apiInfo.mape.ipv6Prefix}/${apiInfo.mape.ipv6PrefixLength}\n`;
        infoText += `   PSID: offset=${apiInfo.mape.psIdOffset}, length=${apiInfo.mape.psidlen}`;
    } else if (apiInfo?.aftr) {
        infoText = '🌐 Detected: DS-Lite\n';
        infoText += `   AFTR: ${apiInfo.aftr}`;
    } else if (apiInfo) {
        infoText = '🌐 Detected: DHCP/PPPoE\n';
        infoText += '   Standard connection will be used';
    } else {
        infoText = '⚠ No connection information available\n';
        infoText += '   Please select connection type manually';
    }
    
    if (apiInfo?.isp) {
        infoText += `\n\n📡 ISP: ${apiInfo.isp}`;
        if (apiInfo.as) {
            infoText += ` (${apiInfo.as})`;
        }
    }
    
    autoInfo.textContent = infoText;
}

// ==================== パッケージ管理 ====================

async function loadPackageDatabase() {
    try {
        const url = config?.packages_db_url || 'packages/packages.json';
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        PACKAGE_DB = await response.json();
        console.log('Package database loaded:', PACKAGE_DB);
        
        await fetchDevicePackages();
        generatePackageSelector();
        
        return PACKAGE_DB;
    } catch (err) {
        console.error('Failed to load package database:', err);
        return null;
    }
}

function generatePackageSelector() {
    const container = document.querySelector('#package-categories');
    if (!container || !PACKAGE_DB) {
        console.log('Container or PACKAGE_DB not found');
        return;
    }
    
    container.innerHTML = '';
    
    const availablePackages = new Set();
    
    if (!devicePackages || devicePackages.length === 0) {
        console.log('No device packages found, showing all packages');
        PACKAGE_DB.categories.forEach(cat => {
            cat.packages.forEach(pkg => {
                availablePackages.add(pkg.name);
                if (pkg.dependencies) {
                    pkg.dependencies.forEach(dep => {
                        const depPkg = findPackageById(dep);
                        if (depPkg) availablePackages.add(depPkg.name);
                    });
                }
            });
        });
    } else {
        devicePackages.forEach(p => {
            availablePackages.add(typeof p === 'string' ? p : p.name);
        });
    }
    
    const depIds = new Set();
    PACKAGE_DB.categories.forEach(cat => {
        cat.packages.forEach(pkg => {
            if (Array.isArray(pkg.dependencies)) {
                pkg.dependencies.forEach(d => depIds.add(d));
            }
        });
    });
    
    PACKAGE_DB.categories.forEach(category => {
        const categoryDiv = createPackageCategory(category, availablePackages, depIds);
        if (categoryDiv) {
            container.appendChild(categoryDiv);
        }
    });
    
    updatePackageListFromSelector();
    
    console.log(`Generated ${PACKAGE_DB.categories.length} package categories`);
}

function createPackageCategory(category, availablePackages, depIds) {
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'package-category';
    categoryDiv.setAttribute('data-category-id', category.id);
    
    const packageGrid = document.createElement('div');
    packageGrid.className = 'package-grid';
    
    let hasVisiblePackages = false;
    
    category.packages.forEach(pkg => {
        if (pkg.hidden) return;
        
        if (depIds.has(pkg.id) && !pkg.hidden === false) return;
        
        if (availablePackages.size === 0 || availablePackages.has(pkg.name)) {
            hasVisiblePackages = true;
            const packageItem = createPackageItem(pkg, availablePackages);
            packageGrid.appendChild(packageItem);
        }
    });
    
    if (!hasVisiblePackages) return null;
    
    const title = document.createElement('h4');
    title.textContent = category.name;
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

function createPackageItem(pkg, availablePackages) {
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
            if (depPkg && !depPkg.hidden) {
                const depName = depPkg.name || depId;
                
                if (availablePackages.size === 0 || availablePackages.has(depName)) {
                    const depCheckbox = createPackageCheckbox(depPkg, pkg.checked || false, true);
                    depCheckbox.classList.add('package-dependent');
                    depContainer.appendChild(depCheckbox);
                }
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
    label.setAttribute('for', `pkg-${pkg.id}`);
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '0.5em';
    label.style.cursor = 'pointer';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `pkg-${pkg.id}`;
    checkbox.className = 'form-check-input package-selector-checkbox';
    checkbox.setAttribute('data-package', pkg.name);
    checkbox.setAttribute('data-package-id', pkg.id);
    
    if (pkg.dependencies) {
        checkbox.setAttribute('data-dependencies', pkg.dependencies.join(','));
    }
    
    if (isChecked) {
        checkbox.checked = true;
    }
    
    if (!isDependency) {
        checkbox.addEventListener('change', handlePackageSelection);
    }
    
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
    const packageId = pkg.getAttribute('data-package-id');
    
    const dependencies = pkg.getAttribute('data-dependencies');
    if (dependencies) {
        dependencies.split(',').forEach(depId => {
            const depCheckbox = document.querySelector(`#pkg-${depId}`);
            if (depCheckbox) {
                depCheckbox.checked = isChecked;
                
                const depDeps = depCheckbox.getAttribute('data-dependencies');
                if (depDeps && isChecked) {
                    depDeps.split(',').forEach(subDepId => {
                        const subDepCheckbox = document.querySelector(`#pkg-${subDepId}`);
                        if (subDepCheckbox) subDepCheckbox.checked = true;
                    });
                }
            }
        });
    }
    
    const enableVar = pkg.getAttribute('data-enable-var');
    if (enableVar) {
        updateVariableDefinitions();
    }
    
    // パッケージ選択変更時も言語パッケージを更新
    updateLanguagePackageImmediate();
    updatePackageListFromSelector();
}

function updatePackageListFromSelector() {
    const checkedPkgs = new Set();
    
    // パッケージセレクターからの選択パッケージを追加
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        if (pkgName) {
            checkedPkgs.add(pkgName);
        }
    });
    
    // 動的パッケージを追加
    dynamicPackages.forEach(pkg => {
        checkedPkgs.add(pkg);
    });
    
    const textarea = document.querySelector('#asu-packages');
    if (textarea) {
        const currentPackages = split(textarea.value);
        
        // セレクターで管理されていない、かつ動的でもない、かつ言語パッケージでもないパッケージを保持
        const nonSelectorPkgs = currentPackages.filter(pkg => {
            // パッケージセレクターにあるかチェック
            const hasInSelector = document.querySelector(`.package-selector-checkbox[data-package="${pkg}"]`);
            // 動的パッケージにあるかチェック
            const hasInDynamic = dynamicPackages.has(pkg);
            // 言語パッケージかチェック
            const isLanguagePkg = pkg.startsWith('luci-i18n-');
            // どれにも該当しない場合のみ保持
            return !hasInSelector && !hasInDynamic && !isLanguagePkg;
        });
        
        const newList = [...new Set([...nonSelectorPkgs, ...checkedPkgs])];
        
        textarea.value = newList.join(' ');
        
        console.log(`Updated package list: ${newList.length} packages`);
        console.log('Dynamic packages included:', Array.from(dynamicPackages));
    }
}

function findPackageById(id) {
    if (!PACKAGE_DB) return null;
    
    for (const category of PACKAGE_DB.categories) {
        const pkg = category.packages.find(p => p.id === id);
        if (pkg) return pkg;
    }
    return null;
}

async function fetchDevicePackages() {
    try {
        const allPackages = [];
        
        if (PACKAGE_DB) {
            PACKAGE_DB.categories.forEach(cat => {
                cat.packages.forEach(pkg => {
                    allPackages.push({
                        id: pkg.id,
                        name: pkg.name,
                        hidden: pkg.hidden
                    });
                });
            });
        }
        
        devicePackages = allPackages;
        
        console.log(`Device packages loaded: ${devicePackages.length} packages`);
        return devicePackages;
        
    } catch (err) {
        console.error('Failed to fetch device packages:', err);
        devicePackages = [];
        return [];
    }
}

// ==================== UCI-defaults処理 ====================

function loadUciDefaultsTemplate() {
    console.log('loadUciDefaultsTemplate called');
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    if (!textarea || !config?.uci_defaults_setup_url) return;

    function autoResize() {
        const lines = textarea.value.split('\n').length;
        textarea.rows = lines + 1;
    }

    textarea.addEventListener('input', autoResize);
    textarea.addEventListener('paste', () => setTimeout(autoResize, 10));

    fetch(config.uci_defaults_setup_url)
        .then(r => { 
            if (!r.ok) throw new Error(r.statusText); 
            return r.text(); 
        })
        .then(text => {
            textarea.value = text;
            updateVariableDefinitions();
            autoResize();
            console.log('setup.sh loaded successfully');
        })
        .catch(err => console.error('Failed to load setup.sh:', err));
}

function updateVariableDefinitions() {
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    if (!textarea) {
        console.log('UCI defaults textarea not found');
        return;
    }
    
    const values = collectFormValues();
    
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const enableVar = cb.getAttribute('data-enable-var');
        if (enableVar) {
            values[enableVar] = '1';
        }
    });
    
    const variableDefinitions = generateVariableDefinitions(values);
    
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
        
        const lines = textarea.value.split('\n').length;
        textarea.rows = lines + 1;
        
        console.log('Variable definitions updated:', Object.keys(values).length, 'variables');
    } else {
        console.log('Variable definition markers not found in content');
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
    
    const commandInput = document.querySelector("#command");
    const customCommands = commandInput?.value || '';
    
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
        
        console.log('Custom commands updated');
    }
}

// ==================== フォーム監視 ====================

function setupFormWatchers() {
    console.log('setupFormWatchers called');
    
    if (!formStructure.fields) {
        console.log('Form structure not ready, skipping watchers');
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
    
    const commandInput = document.querySelector("#command");
    if (commandInput) {
        commandInput.removeEventListener('input', updateCustomCommands);
        commandInput.addEventListener('input', updateCustomCommands);
    }
    
    updateVariableDefinitions();
}

// ==================== オリジナル関数フック ====================

let originalBuildAsuRequest = null;
let originalSetupUciDefaults = null;

function hookOriginalFunctions() {
    if (typeof buildAsuRequest === 'function' && !originalBuildAsuRequest) {
        originalBuildAsuRequest = buildAsuRequest;
        window.buildAsuRequest = customBuildAsuRequest;
    }

    if (typeof setup_uci_defaults === 'function' && !originalSetupUciDefaults) {
        originalSetupUciDefaults = setup_uci_defaults;
        window.setup_uci_defaults = customSetupUciDefaults;
    }
}

function customBuildAsuRequest(request_hash) {
    console.log('customBuildAsuRequest called with:', request_hash);

    const origFetch = window.fetch;
    window.fetch = function(url, options) {
        return origFetch(url, options).then(res => {
            res.clone().json().then(mobj => {
                if ("stderr" in mobj) {
                    console.log('Build error detected, skipping reinitialization');
                }
            }).catch(() => {});
            return res;
        });
    };

    if (originalBuildAsuRequest) originalBuildAsuRequest(request_hash);
    window.fetch = origFetch;
}

function customSetupUciDefaults() {
    console.log('customSetupUciDefaults called');
    const textarea = document.querySelector("#uci-defaults-content");
    if (!textarea || !config?.uci_defaults_setup_url) return;

    fetch(config.uci_defaults_setup_url)
        .then(r => { 
            if (!r.ok) throw new Error(r.statusText); 
            return r.text(); 
        })
        .then(text => {
            textarea.value = text;
            updateVariableDefinitions();
        })
        .catch(err => showAlert(err.message));
}

// ==================== ユーティリティ関数 ====================

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
    
    console.log('Postinst textarea auto-resized');
}

function initDeviceTranslation() {
    const select = document.querySelector("#aios-language");
    if (!select) return;

    const long = (navigator.language || navigator.userLanguage).toLowerCase();
    const short = long.split("-")[0];

    if (select.querySelector(`[value="${long}"]`)) {
        select.value = long;
    } else if (select.querySelector(`[value="${short}"]`)) {
        select.value = short;
    } else {
        select.value = current_language;
    }
}

// ==================== デバッグ用ヘルパー関数 ====================

function debugFormStructure() {
    console.log('Form Structure:', formStructure);
    console.log('Cached API Info:', cachedApiInfo);
    console.log('Setup Config:', setupConfig);
    console.log('Default Field Values:', defaultFieldValues);
    console.log('Dynamic Packages:', Array.from(dynamicPackages));
    console.log('Selected Language:', selectedLanguage);
}

function debugCollectValues() {
    const values = collectFormValues();
    console.log('Collected Form Values:', values);
    return values;
}

// ==================== エラーハンドリング ====================

window.addEventListener('error', function(e) {
    console.error('Custom.js Error:', e.error);
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('Custom.js Unhandled Promise Rejection:', e.reason);
});

// ==================== 初期化完了通知 ====================

console.log('custom.js (dynamic package management version) fully loaded and ready');
