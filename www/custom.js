// custom.js - OpenWrt カスタム機能（デバイスパッケージ管理修正版）

console.log('custom.js loaded');

// ==================== グローバル変数 ====================
let customInitialized = false;
let customHTMLLoaded = false;
let PACKAGE_DB = null;
let setupConfig = null;
let formStructure = {};
let cachedApiInfo = null;
let defaultFieldValues = {};
let dynamicPackages = new Set();
let selectedLanguage = '';
let customLanguageMap = {};

// デバイス固有パッケージ管理（重要：これらを常に維持）
let deviceDefaultPackages = [];  // mobj.default_packages
let deviceDevicePackages = [];   // mobj.device_packages  
let extraPackages = [];           // config.asu_extra_packages

// ==================== 初期化処理 ====================
// 元の updateImages をフック
const originalUpdateImages = window.updateImages;
window.updateImages = function(version, mobj) {
    if (originalUpdateImages) originalUpdateImages(version, mobj);

    // arch_packagesをcurrent_deviceに保存
    if (mobj && mobj.arch_packages && current_device) {
        current_device.arch = mobj.arch_packages;
        console.log('Architecture saved:', mobj.arch_packages);
        
        // デバイス選択時に言語パッケージを即座に更新
        setTimeout(() => {
            console.log('Device selected, updating language packages');
            updateLanguagePackage();
        }, 100);
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
    
    // 初回のみ custom.html を読み込む
    if (!customHTMLLoaded) {
        console.log("Loading custom.html");
        loadCustomHTML();
        customHTMLLoaded = true;
    } else {
        console.log("Reinitializing features");
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
    
    // 設定とデータを並列で読み込み
    await Promise.all([
        loadSetupConfig(),
        loadPackageDatabase(),
        fetchAndDisplayIspInfo()
    ]);
    
    // 依存関係のある初期化（順序重要）
    setupEventListeners();
    loadUciDefaultsTemplate();
    
    // 言語セレクター設定（初期言語パッケージ処理を含む）
    setupLanguageSelector();
    loadCustomTranslations(selectedLanguage);
    
    // フォーム監視設定
    setupFormWatchers();
    
    customInitialized = true;
}

// #asuセクションを置き換え（修正版：index.jsが期待するDOM要素を全て保持）
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

    // index.jsが期待する全てのDOM要素を追加
    newDiv.insertAdjacentHTML('beforeend', `
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
    
    setupEventListeners();
    
    if (PACKAGE_DB) generatePackageSelector();
    fetchAndDisplayIspInfo();
    if (cachedApiInfo) updateAutoConnectionInfo(cachedApiInfo);

    if (customLanguageMap && Object.keys(customLanguageMap).length) {
        Object.assign(current_language_json, customLanguageMap);
        for (const tr in customLanguageMap) {
            document.querySelectorAll(`.${tr}`).forEach(e => {
                if ('placeholder' in e) {
                    e.placeholder = customLanguageMap[tr];
                } else {
                    e.innerText = customLanguageMap[tr];
                }
            });
        }
        console.log('Custom translations reapplied after reinit');
    }
}

// ==================== 言語セレクター設定 ====================
function setupLanguageSelector() {
    const mainLanguageSelect = document.querySelector('#languages-select');
    const customLanguageSelect = document.querySelector('#aios-language');
    const fallback = config?.fallback_language || 'en';
    
    // 現在の言語を決定（優先順位：メイン言語セレクター > current_language > フォールバック）
    let currentLanguage = fallback;
    if (mainLanguageSelect && mainLanguageSelect.value) {
        currentLanguage = mainLanguageSelect.value;
    } else if (current_language) {
        currentLanguage = current_language;
    }
    
    selectedLanguage = currentLanguage;
    console.log('Selected language for device:', selectedLanguage);
    
    // カスタム言語セレクターを同期（片方向制御）
    if (customLanguageSelect && customLanguageSelect.value !== selectedLanguage) {
        customLanguageSelect.value = selectedLanguage;
        console.log('Synchronized custom language selector to:', selectedLanguage);
    }
    
    // イベントリスナー設定（カスタム言語セレクターのみ）
    if (customLanguageSelect) {
        customLanguageSelect.addEventListener('change', handleCustomLanguageChange);
    }
    
    // 初回言語パッケージ更新（重要：初期化時に必ず実行）
    console.log('Performing initial language package update');
    updateLanguagePackage();
}

async function loadCustomTranslations(lang) {
    if (!lang) {
        lang = (navigator.language || config.fallback_language).split('-')[0];
    }
    selectedLanguage = lang;

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
        Object.assign(current_language_json, customMap);

        for (const tr in customMap) {
            document.querySelectorAll(`.${tr}`).forEach(e => {
                if ('placeholder' in e) {
                    e.placeholder = customMap[tr];
                } else {
                    e.innerText = customMap[tr];
                }
            });
        }
    } catch (err) {
        if (lang !== config.fallback_language) {
            return loadCustomTranslations(config.fallback_language);
        }
    }
}

async function handleCustomLanguageChange(e) {
    selectedLanguage = e.target.value || config?.fallback_language || 'en';
    console.log('Language changed to:', selectedLanguage);
    
    await updateLanguagePackage();
    updatePackageListFromSelector();
    updateVariableDefinitions();
    
    console.log('Language change processing completed');
}

// 言語パッケージの更新（完全修正版）
async function updateLanguagePackage() {
    console.log('updateLanguagePackage called, selectedLanguage:', selectedLanguage);
    
    // 既存の言語パッケージを削除
    for (const pkg of Array.from(dynamicPackages)) {
        if (pkg.startsWith('luci-i18n-')) {
            dynamicPackages.delete(pkg);
            console.log('Removed language package:', pkg);
        }
    }
    
    // 英語の場合は言語パッケージ不要
    if (!selectedLanguage || selectedLanguage === 'en') {
        console.log('English selected, no language packages needed');
        updatePackageListFromSelector();
        return;
    }
    
    // アーキテクチャとバージョンの確認（より詳細なログ）
    console.log('Current device state:', {
        arch: current_device?.arch,
        version: current_device?.version,
        target: current_device?.target,
        hasCurrentDevice: !!current_device
    });
    
    // デバイス情報が不完全な場合は基本言語パッケージのみ追加（条件緩和）
    if (!current_device?.arch) {
        console.log('Device architecture not available, adding basic language package anyway');
        const basePkg = `luci-i18n-base-${selectedLanguage}`;
        dynamicPackages.add(basePkg);
        console.log('Added basic language package without validation:', basePkg);
        updatePackageListFromSelector();
        return;
    }
    
    console.log('Device available, checking language packages for arch:', current_device.arch);
    
    // 基本言語パッケージをチェック
    const basePkg = `luci-i18n-base-${selectedLanguage}`;
    console.log('Checking base package:', basePkg);
    
    try {
        if (await isPackageAvailable(basePkg, 'luci')) {
            dynamicPackages.add(basePkg);
            console.log('Added validated base language package:', basePkg);
        } else {
            console.log('Base language package not available:', basePkg);
        }
    } catch (err) {
        console.error('Error checking base package:', err);
        // エラー時でも基本パッケージは追加
        dynamicPackages.add(basePkg);
        console.log('Added base language package despite error:', basePkg);
    }
    
    // 現在のパッケージに対応する言語パッケージをチェック
    const currentPackages = getCurrentPackageList();
    console.log('Current packages for language check:', currentPackages.length);
    
    for (const pkg of currentPackages) {
        if (pkg.startsWith('luci-') && !pkg.startsWith('luci-i18n-')) {
            const luciName = extractLuciName(pkg);
            if (luciName) {
                const langPkg = `luci-i18n-${luciName}-${selectedLanguage}`;
                console.log('Checking LuCI language package:', langPkg);
                
                try {
                    if (await isPackageAvailable(langPkg, 'luci')) {
                        dynamicPackages.add(langPkg);
                        console.log('Added LuCI language package:', langPkg);
                    }
                } catch (err) {
                    console.error('Error checking LuCI package:', err);
                }
            }
        }
    }
    
    console.log('Final dynamic packages:', Array.from(dynamicPackages));
    updatePackageListFromSelector();
}

function extractLuciName(pkg) {
    if (pkg === 'luci') return 'base';
    if (pkg.startsWith('luci-app-')) return pkg.substring(5);
    if (pkg.startsWith('luci-mod-')) return pkg.substring(5);
    if (pkg.startsWith('luci-theme-')) return pkg.substring(5);
    if (pkg.startsWith('luci-proto-')) return pkg.substring(5);
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
    
    // デバイス情報が不完全でも基本的なチェックは行う
    const arch = current_device?.arch;
    const version = current_device?.version;
    
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
        const url = config?.setup_db_url || 'uci-defaults/setup.json';
        const response = await fetch(url + '?t=' + Date.now());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        setupConfig = await response.json();
        console.log('Setup config loaded:', setupConfig);
        
        formStructure = generateFormStructure(setupConfig);
        storeDefaultValues(setupConfig);
        renderSetupConfig(setupConfig);
        
        console.log('Setup config rendered successfully');
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
                lbl.appendChild(document.createTextNode(' ' + (opt.label != null ? opt.label : String(opt.value))));
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
        
        ctrl.addEventListener('change', updatePackageListFromDynamicSources);
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

function handleRadioChange(e) {
    const radio = e.target;
    const packagesData = radio.getAttribute('data-packages');
    
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
    
    updatePackageListFromDynamicSources();
}

function updatePackageListFromDynamicSources() {
    updateSetupJsonPackages();
    updateLanguagePackage();
    updatePackageListFromSelector();
    updateVariableDefinitions();
}

function updateSetupJsonPackages() {
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
    
    const connectionFieldVars = [
        'pppoe_username', 'pppoe_password',
        'dslite_aftr_type', 'dslite_region', 'dslite_aftr_address', 
        'mape_br', 'mape_ealen', 'mape_ipv4_prefix', 'mape_ipv4_prefixlen',
        'mape_ipv6_prefix', 'mape_ipv6_prefixlen', 'mape_psid_offset', 'mape_psidlen',
        'mape_gua_prefix', 'mape_gua_mode', 'mape_type',
        'ap_ip_address', 'ap_gateway'
    ];
    
    if (connectionType === 'auto') {
        connectionFieldVars.forEach(key => delete values[key]);
        
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
                
                // GUA prefixの自動設定を改善
                const guaPrefix = generateGuaPrefixFromFullAddress(cachedApiInfo);
                if (guaPrefix) {
                    values.mape_gua_prefix = guaPrefix;
                    values.mape_gua_mode = '1';
                    console.log('Applied GUA prefix in auto mode:', guaPrefix);
                }
            } else if (cachedApiInfo.aftr) {
                values.dslite_aftr_address = cachedApiInfo.aftr;
            }
        }
    } else if (connectionType === 'dhcp') {
        connectionFieldVars.forEach(key => delete values[key]);
    } else if (connectionType === 'pppoe') {
        connectionFieldVars.filter(key => !key.startsWith('pppoe_')).forEach(key => delete values[key]);
    } else if (connectionType === 'dslite') {
        connectionFieldVars.filter(key => !key.startsWith('dslite_')).forEach(key => delete values[key]);
        
        if (cachedApiInfo?.aftr) {
            values.dslite_aftr_address = cachedApiInfo.aftr;
        }
    } else if (connectionType === 'mape') {
        connectionFieldVars.filter(key => !key.startsWith('mape_')).forEach(key => delete values[key]);
        
        // MAP-E設定の改善
        if (cachedApiInfo?.mape?.brIpv6Address) {
            values.mape_br = cachedApiInfo.mape.brIpv6Address;
            values.mape_ealen = cachedApiInfo.mape.eaBitLength;
            values.mape_ipv4_prefix = cachedApiInfo.mape.ipv4Prefix;
            values.mape_ipv4_prefixlen = cachedApiInfo.mape.ipv4PrefixLength;
            values.mape_ipv6_prefix = cachedApiInfo.mape.ipv6Prefix;
            values.mape_ipv6_prefixlen = cachedApiInfo.mape.ipv6PrefixLength;
            values.mape_psid_offset = cachedApiInfo.mape.psIdOffset;
            values.mape_psidlen = cachedApiInfo.mape.psidlen;
            
            // GUA prefix設定の改善
            const guaPrefix = generateGuaPrefixFromFullAddress(cachedApiInfo);
            if (guaPrefix) {
                values.mape_gua_prefix = guaPrefix;
                values.mape_gua_mode = '1';
                console.log('Applied GUA prefix in MAP-E mode:', guaPrefix);
            }
        }
        
        const mapeType = getFieldValue('input[name="mape_type"]');
        if (mapeType === 'gua') {
            values.mape_gua_mode = '1';
            
            // GUAタイプの場合、フィールドの値を取得または生成
            const currentGUAValue = getFieldValue('#mape-gua-prefix');
            if (currentGUAValue) {
                values.mape_gua_prefix = currentGUAValue;
            } else if (!values.mape_gua_prefix && cachedApiInfo?.ipv6) {
                // フィールドが空の場合は再生成
                const guaPrefix = generateGuaPrefixFromFullAddress(cachedApiInfo);
                if (guaPrefix) {
                    values.mape_gua_prefix = guaPrefix;
                    console.log('Generated GUA prefix for empty field:', guaPrefix);
                }
            }
        }
    } else if (connectionType === 'ap') {
        connectionFieldVars.filter(key => !key.startsWith('ap_')).forEach(key => delete values[key]);
    } else {
        connectionFieldVars.forEach(key => delete values[key]);
    }
    
    // Wi-Fi設定の処理
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
    
    // ネットワーク最適化の処理
    const netOptimizer = getFieldValue('input[name="net_optimizer"]');
    if (netOptimizer === 'auto') {
        values.enable_netopt = '1';
        ['netopt_rmem', 'netopt_wmem', 'netopt_conntrack', 'netopt_backlog', 'netopt_somaxconn', 'netopt_congestion']
            .forEach(key => delete values[key]);
    } else if (netOptimizer === 'disabled') {
        ['enable_netopt', 'netopt_rmem', 'netopt_wmem', 'netopt_conntrack', 'netopt_backlog', 'netopt_somaxconn', 'netopt_congestion']
            .forEach(key => delete values[key]);
    }
}

// ==================== イベントハンドラ ====================

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
    
    // MAP-Eタイプ切り替えハンドラーを追加
    document.querySelectorAll('input[name="mape_type"]').forEach(radio => {
        radio.addEventListener('change', e => {
            toggleGuaPrefixVisibility(e.target.value);
            updateVariableDefinitions();
        });
    });
}

function handleConnectionTypeChange(e) {
    const selectedType = e.target.value;
    
    const sections = ['auto', 'dhcp', 'pppoe', 'dslite', 'mape', 'ap'];
    sections.forEach(type => {
        const section = document.querySelector(`#${type}-section`);
        if (section) {
            if (type === selectedType) {
                show(section);
                if (type === 'auto' && cachedApiInfo) {
                    updateAutoConnectionInfo(cachedApiInfo);
                    } else if (type === 'mape' && cachedApiInfo) {
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
    
    updatePackageListFromDynamicSources();
}

function handleNetOptimizerChange(e) {
    const mode = e.target.value;
    
    ['auto', 'manual', 'disabled'].forEach(m => {
        const section = document.querySelector(`#netopt-${m}-section`);
        if (section) {
            if (m === mode) {
                show(section);
                if (m === 'manual') {
                    restoreManualDefaults();
                }
            } else {
                hide(section);
            }
        }
    });
    
    updatePackageListFromDynamicSources();
}

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
        if (el && !el.value) {
            el.value = defaultValue;
        }
    });
}

function handleWifiModeChange(e) {
    const mode = e.target.value;
    
    const wifiOptionsContainer = document.querySelector("#wifi-options-container");
    const usteerOptions = document.querySelector("#usteer-options");
    
    if (mode === 'disabled') {
        hide(wifiOptionsContainer);
        clearWifiFields();
    } else {
        show(wifiOptionsContainer);
        restoreWifiDefaults();
        
        if (mode === 'usteer') {
            show(usteerOptions);
        } else {
            hide(usteerOptions);
        }
    }
    
    updatePackageListFromDynamicSources();
}

function clearWifiFields() {
    ['aios-wifi-ssid', 'aios-wifi-password', 'aios-wifi-mobility-domain', 'aios-wifi-snr']
        .forEach(id => {
            const el = document.querySelector(`#${id}`);
            if (el) {
                el.value = '';
            }
        });
}

function restoreWifiDefaults() {
    const wifiDefaults = {
        'aios-wifi-ssid': 'OpenWrt',
        'aios-wifi-password': 'password',
        'aios-wifi-mobility-domain': '4f57',
        'aios-wifi-snr': '30 15 5'
    };
    
    Object.entries(wifiDefaults).forEach(([id, defaultValue]) => {
        const el = document.querySelector(`#${id}`);
        if (el && !el.value) {
            el.value = defaultValue;
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

            if (field.variableName === 'mape_gua_prefix') {
                const guaPrefix = generateGuaPrefixFromFullAddress(cachedApiInfo);
                if (guaPrefix) {
                    value = guaPrefix;
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
    
    setGuaPrefixIfAvailable();    
    updateAutoConnectionInfo(apiInfo);
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
        return;
    }
    
    container.innerHTML = '';
    
    PACKAGE_DB.categories.forEach(category => {
        const categoryDiv = createPackageCategory(category);
        if (categoryDiv) {
            container.appendChild(categoryDiv);
        }
    });
    
    updatePackageListFromSelector();
    console.log(`Generated ${PACKAGE_DB.categories.length} package categories`);
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
            if (depPkg && !depPkg.hidden) {
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
    
    updateLanguagePackage();
    updatePackageListFromSelector();
}

function updatePackageListFromSelector() {
    console.log('updatePackageListFromSelector called');
    
    // 基本パッケージセット（デバイス固有パッケージ）を準備
    const basePackages = new Set();
    
    // デバイス固有パッケージを必ず含める（最重要）
    deviceDefaultPackages.forEach(pkg => basePackages.add(pkg));
    deviceDevicePackages.forEach(pkg => basePackages.add(pkg));
    extraPackages.forEach(pkg => basePackages.add(pkg));
    
    console.log('Device base packages:', {
        default: deviceDefaultPackages.length,
        device: deviceDevicePackages.length,
        extra: extraPackages.length,
        total: basePackages.size
    });
    
    // チェックされたパッケージを追加
    const checkedPackages = new Set();
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        if (pkgName) {
            checkedPackages.add(pkgName);
        }
    });
    
    console.log('Checked packages from selector:', checkedPackages.size);
    
    // 動的パッケージ（言語パッケージを含む）を追加
    const dynamicPackagesList = Array.from(dynamicPackages);
    console.log('Dynamic packages (including language):', dynamicPackagesList.length);
    
    // テキストエリアから既存パッケージを取得（デバイス固有パッケージ以外）
    const manualPackages = new Set();
    const textarea = document.querySelector('#asu-packages');
    if (textarea) {
        const currentPackages = split(textarea.value);
        currentPackages.forEach(pkg => {
            // デバイス固有パッケージ、チェックボックス管理パッケージ、動的パッケージ以外を保持
            if (!basePackages.has(pkg) && 
                !checkedPackages.has(pkg) && 
                !dynamicPackages.has(pkg) &&
                !document.querySelector(`.package-selector-checkbox[data-package="${pkg}"]`)) {
                manualPackages.add(pkg);
            }
        });
    }
    
    console.log('Manual packages (user typed):', manualPackages.size);
    
    // 全てのパッケージを統合（順序：デバイス固有 → チェック済み → 動的 → 手動）
    const finalPackages = [
        ...basePackages,      // デバイス固有パッケージ（必須）
        ...checkedPackages,   // チェックボックスで選択されたパッケージ
        ...dynamicPackages,   // 動的パッケージ（言語パッケージなど）
        ...manualPackages     // 手動で入力されたパッケージ
    ];
    
    // 重複を削除
    const uniquePackages = [...new Set(finalPackages)];
    
    // テキストエリアを更新
    if (textarea) {
        textarea.value = uniquePackages.join(' ');
        console.log('Package list updated in textarea');

        // シンプルに高さを自動調整
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
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

// ==================== UCI-defaults処理 ====================

function loadUciDefaultsTemplate() {
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    if (!textarea || !config?.uci_defaults_setup_url) return;

    function autoResize() {
        const lines = textarea.value.split('\n').length;
        textarea.style.height = 'auto';
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
        })
        .catch(err => console.error('Failed to load setup.sh:', err));
}

function updateVariableDefinitions() {
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    if (!textarea) {
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
    
    const commandInput = document.querySelector("#command");
    if (commandInput) {
        commandInput.removeEventListener('input', updateCustomCommands);
        commandInput.addEventListener('input', updateCustomCommands);
    }
    
    updateVariableDefinitions();
}

// ==================== ユーティリティ関数 ====================

function generateGuaPrefixFromFullAddress(apiInfo) {
    if (apiInfo?.ipv6) {
        const segments = apiInfo.ipv6.split(':');
        return segments.slice(0, 4).join(':') + '::/64';
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
        console.log('GUA prefix set:', guaPrefix);
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

console.log('custom.js (device package management fixed) fully loaded and ready');
