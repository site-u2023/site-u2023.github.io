// custom.js - OpenWrt カスタム機能（統合版）

console.log('custom.js loaded');

// ==================== グローバル変数 ====================
let customInitialized = false;
let customHTMLLoaded = false;
let PACKAGE_DB = null;
let devicePackages = [];
let setupConfig = null;
let formStructure = {};
let cachedApiInfo = null;

// ==================== 初期化処理 ====================

// 元の updateImages をフック
const originalUpdateImages = window.updateImages;
window.updateImages = function(version, mobj) {
    if (originalUpdateImages) originalUpdateImages(version, mobj);
    
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
        const response = await fetch('custom.html');
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
    
    // 依存関係のある初期化
    setupEventListeners();
    loadUciDefaultsTemplate();
    initDeviceTranslation();
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
    
    setupEventListeners();
    if (PACKAGE_DB) generatePackageSelector();
    fetchAndDisplayIspInfo();
}

// ==================== setup.json 処理 ====================

async function loadSetupConfig() {
    try {
        const url = config?.setup_db_url || 'uci-defaults/setup.json';
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        setupConfig = await response.json();
        
        // フォーム構造を生成
        formStructure = generateFormStructure(setupConfig);
        
        console.log('Setup config loaded:', setupConfig);
        return setupConfig;
    } catch (err) {
        console.error('Failed to load setup.json:', err);
        return null;
    }
}

// setup.jsonからフォーム構造を生成
function generateFormStructure(config) {
    const structure = {
        fields: {},           // すべてのフィールド
        connectionTypes: {},  // 接続タイプ別フィールド
        categories: {},       // カテゴリ別フィールド
        fieldMapping: {}      // selector -> field情報のマッピング
    };
    
    config.categories.forEach(category => {
        structure.categories[category.id] = [];
        
        category.packages.forEach(pkg => {
            // フィールド情報を構造化
            const fieldInfo = {
                id: pkg.id,
                selector: pkg.selector,
                variableName: pkg.variableName || pkg.id.replace(/-/g, '_'),
                defaultValue: pkg.defaultValue,
                apiMapping: pkg.apiMapping
            };
            
            if (pkg.selector) {
                structure.fields[pkg.id] = fieldInfo;
                structure.categories[category.id].push(pkg.id);
                structure.fieldMapping[pkg.selector] = fieldInfo;
            }
            
            // 接続タイプの子要素を処理
            if (pkg.id === 'connection-type' && pkg.children) {
                pkg.children.forEach(child => {
                    structure.connectionTypes[child.id] = [];
                    if (child.children) {
                        child.children.forEach(grandChild => {
                            const childFieldInfo = {
                                id: grandChild.id,
                                selector: grandChild.selector,
                                variableName: grandChild.variableName || grandChild.id.replace(/-/g, '_'),
                                defaultValue: grandChild.defaultValue,
                                apiMapping: grandChild.apiMapping
                            };
                            
                            if (grandChild.selector) {
                                structure.fields[grandChild.id] = childFieldInfo;
                                structure.connectionTypes[child.id].push(grandChild.id);
                                structure.fieldMapping[grandChild.selector] = childFieldInfo;
                            }
                        });
                    }
                });
            }
        });
    });
    
    return structure;
}

// ==================== フォーム値処理 ====================

function collectFormValues() {
    const values = {};
    
    // setup.jsonベースで値を収集
    Object.values(formStructure.fields).forEach(field => {
        const value = getFieldValue(field.selector);
        
        // 値が存在し、デフォルト値と異なる場合のみ設定
        if (value && value !== field.defaultValue) {
            values[field.variableName] = value;
        }
    });
    
    // 特殊処理が必要なフィールド
    applySpecialFieldLogic(values);
    
    return values;
}

// フィールド値取得
function getFieldValue(selector) {
    const element = document.querySelector(selector);
    if (!element) return null;
    
    if (element.type === 'radio' || element.type === 'checkbox') {
        const checked = document.querySelector(`${selector}:checked`);
        return checked?.value;
    }
    return element.value;
}

// 特殊なフィールドロジック適用
function applySpecialFieldLogic(values) {
    // 接続タイプに応じたフィルタリング
    const connectionType = getFieldValue('input[name="connectionType"]');
    if (connectionType && connectionType !== 'auto') {
        // 他の接続タイプのフィールドを除外
        Object.keys(formStructure.connectionTypes).forEach(type => {
            if (type !== connectionType) {
                formStructure.connectionTypes[type].forEach(fieldId => {
                    const field = formStructure.fields[fieldId];
                    if (field) delete values[field.variableName];
                });
            }
        });
    }
    
    // Wi-Fiモードに応じたフィルタリング
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
    
    // Network Optimizerモード
    const netOptimizer = getFieldValue('input[name="netOptimizer"]');
    if (netOptimizer === 'auto') {
        values.enable_netopt = '1';
        ['netopt_rmem', 'netopt_wmem', 'netopt_conntrack', 'netopt_backlog', 'netopt_somaxconn', 'netopt_congestion']
            .forEach(key => delete values[key]);
    } else if (netOptimizer === 'disabled') {
        ['enable_netopt', 'netopt_rmem', 'netopt_wmem', 'netopt_conntrack', 'netopt_backlog', 'netopt_somaxconn', 'netopt_congestion']
            .forEach(key => delete values[key]);
    }
    
    // MAP-E GUAモード
    if (connectionType === 'mape') {
        const mapeType = getFieldValue('input[name="mapeType"]');
        if (mapeType === 'gua') values.mape_gua_mode = '1';
    }
}

// ==================== イベントハンドラ ====================

function setupEventListeners() {
    console.log('setupEventListeners called');
    
    // ラジオボタンのイベント設定
    const radioGroups = {
        'connectionType': handleConnectionTypeChange,
        'netOptimizer': handleNetOptimizerChange,
        'wifi_mode': handleWifiModeChange
    };
    
    Object.entries(radioGroups).forEach(([name, handler]) => {
        document.querySelectorAll(`input[name="${name}"]`).forEach(radio => {
            radio.removeEventListener('change', handler);
            radio.addEventListener('change', handler);
        });
        
        // 初期状態を適用
        const checked = document.querySelector(`input[name="${name}"]:checked`);
        if (checked) handler({ target: checked });
    });
}

function handleConnectionTypeChange(e) {
    const selectedType = e.target.value;
    
    // すべてのセクションを制御
    Object.keys(formStructure.connectionTypes).forEach(type => {
        const section = document.querySelector(`#${type}-section`);
        if (section) {
            if (type === selectedType) {
                show(section);
            } else {
                hide(section);
                // フィールドをクリア
                clearConnectionTypeFields(type);
            }
        }
    });
    
    updateVariableDefinitions();
}

function clearConnectionTypeFields(type) {
    const fieldIds = formStructure.connectionTypes[type] || [];
    fieldIds.forEach(fieldId => {
        const field = formStructure.fields[fieldId];
        if (field) {
            const element = document.querySelector(field.selector);
            if (element) {
                if (element.type === 'radio' || element.type === 'checkbox') {
                    element.checked = false;
                } else {
                    element.value = '';
                }
            }
        }
    });
}

function handleNetOptimizerChange(e) {
    const mode = e.target.value;
    ['auto', 'manual', 'disabled'].forEach(m => {
        const section = document.querySelector(`#netopt-${m}-section`);
        if (section) {
            if (m === mode) show(section);
            else hide(section);
        }
    });
    
    if (mode !== 'manual') {
        // Manual設定をクリア
        ['netopt-rmem', 'netopt-wmem', 'netopt-conntrack', 'netopt-backlog', 'netopt-somaxconn', 'netopt-congestion']
            .forEach(id => {
                const el = document.querySelector(`#${id}`);
                if (el) el.value = '';
            });
    }
    
    updateVariableDefinitions();
}

function handleWifiModeChange(e) {
    const mode = e.target.value;
    const wifiOptionsContainer = document.querySelector("#wifi-options-container");
    const usteerOptions = document.querySelector("#usteer-options");
    
    if (mode === 'disabled') {
        hide(wifiOptionsContainer);
        // Wi-Fiフィールドをクリア
        ['aios-wifi-ssid', 'aios-wifi-password', 'aios-wifi-mobility-domain', 'aios-wifi-snr']
            .forEach(id => {
                const el = document.querySelector(`#${id}`);
                if (el) el.value = '';
            });
    } else {
        show(wifiOptionsContainer);
        if (mode === 'usteer') {
            show(usteerOptions);
        } else {
            hide(usteerOptions);
            // Usteerフィールドをクリア
            ['aios-wifi-mobility-domain', 'aios-wifi-snr'].forEach(id => {
                const el = document.querySelector(`#${id}`);
                if (el) el.value = '';
            });
        }
    }
    
    updateVariableDefinitions();
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
    } catch (err) {
        console.error('Failed to fetch ISP info:', err);
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
    
    // APIマッピングに基づいて値を設定
    Object.values(formStructure.fields).forEach(field => {
        if (field.apiMapping) {
            let value = getNestedValue(apiInfo, field.apiMapping);
            
            // GUA Prefix特別処理（/64を付加）
            if (field.apiMapping === 'mape.ipv6PrefixWith64' && apiInfo.mape?.ipv6Prefix) {
                const prefix = apiInfo.mape.ipv6Prefix;
                // 既に/が含まれていない場合、第四セグメントまで展開して/64を付加
                if (!prefix.includes('/')) {
                    const segments = prefix.split(':');
                    // 第四セグメントまで確保（足りない場合は0で埋める）
                    while (segments.length < 4) {
                        segments.push('0');
                    }
                    value = segments.slice(0, 4).join(':') + '::/64';
                } else {
                    value = prefix;
                }
            }
            
            if (value !== null && value !== undefined) {                    
                const element = document.querySelector(field.selector);
                if (element) {
                    element.value = value;
                }
            }
        }
    });
    
    // 接続タイプを自動判定
    let detectedType = null;
    if (apiInfo.mape?.brIpv6Address) detectedType = 'mape';
    else if (apiInfo.aftr) detectedType = 'dslite';
    
    // AUTO選択時のみ自動切替
    const autoRadio = document.querySelector('input[name="connectionType"][value="auto"]');
    if (autoRadio?.checked && detectedType) {
        const targetRadio = document.querySelector(`input[name="connectionType"][value="${detectedType}"]`);
        if (targetRadio) {
            targetRadio.checked = true;
            handleConnectionTypeChange({ target: targetRadio });
        }
    }
    
    updateVariableDefinitions();
}

// ==================== パッケージ管理 ====================

async function loadPackageDatabase() {
    try {
        const response = await fetch('packages/packages.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        PACKAGE_DB = await response.json();
        console.log('Package database loaded:', PACKAGE_DB);
        
        await fetchDevicePackages();
        generatePackageSelector();
    } catch (err) {
        console.error('Failed to load package database:', err);
    }
}

function generatePackageSelector() {
    const container = document.querySelector('#package-categories');
    if (!container || !PACKAGE_DB) return;
    
    container.innerHTML = '';
    
    if (!devicePackages || devicePackages.length === 0) {
        container.innerHTML = '<p class="text-muted small">Package information not available for this device.</p>';
        return;
    }
    
    const availablePackages = new Set(devicePackages.map(p => 
        typeof p === 'string' ? p : p.name
    ));
    
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
        if (categoryDiv) container.appendChild(categoryDiv);
    });
    
    updatePackageListFromSelector();
}

function createPackageCategory(category, availablePackages, depIds) {
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'package-category';
    
    const packageGrid = document.createElement('div');
    packageGrid.className = 'package-grid';
    
    let hasVisiblePackages = false;
    
    category.packages.forEach(pkg => {
        if (depIds.has(pkg.id)) return;
        if (!availablePackages.has(pkg.name)) return;
        
        hasVisiblePackages = true;
        const packageItem = createPackageCheckbox(pkg.id, pkg.name, pkg.checked, pkg.dependencies);
        packageGrid.appendChild(packageItem);
    });
    
    if (!hasVisiblePackages) return null;
    
    const title = document.createElement('h4');
    title.textContent = category.name;
    categoryDiv.appendChild(title);
    
    const description = document.createElement('div');
    description.className = 'package-category-description';
    description.textContent = category.description;
    categoryDiv.appendChild(description);
    
    categoryDiv.appendChild(packageGrid);
    return categoryDiv;
}

function createPackageCheckbox(pkgId, pkgName, isChecked = false, dependencies = null) {
    const packageItem = document.createElement('div');
    packageItem.className = 'package-item';
    
    const mainFormCheck = createSingleCheckbox(pkgId, pkgName, isChecked, dependencies);
    packageItem.appendChild(mainFormCheck);
    
    if (dependencies && Array.isArray(dependencies)) {
        dependencies.forEach(depId => {
            const depPkg = findPackageById(depId);
            const depName = depPkg ? depPkg.name : depId;
            
            const availablePackages = new Set(devicePackages.map(p => 
                typeof p === 'string' ? p : p.name
            ));
            
            if (availablePackages.has(depName)) {
                const depFormCheck = createSingleCheckbox(depId, depName, isChecked);
                depFormCheck.classList.add('package-dependent');
                packageItem.appendChild(depFormCheck);
            }
        });
    }
    
    return packageItem;
}

function createSingleCheckbox(pkgId, pkgName, isChecked = false, dependencies = null) {
    const label = document.createElement('label');
    label.className = 'form-check-label';
    label.setAttribute('for', `pkg-${pkgId}`);
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '0.5em';
    label.style.cursor = 'pointer';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `pkg-${pkgId}`;
    checkbox.className = 'form-check-input package-selector-checkbox';
    checkbox.setAttribute('data-package', pkgName);
    if (dependencies) {
        checkbox.setAttribute('data-dependencies', dependencies.join(','));
    }
    if (isChecked) {
        checkbox.checked = true;
    }
    checkbox.addEventListener('change', handlePackageSelection);
    
    const link = document.createElement('a');
    link.href = config.package_url.replace("{id}", encodeURIComponent(pkgId));
    link.target = '_blank';
    link.className = 'package-link';
    link.textContent = pkgId;
    
    label.appendChild(checkbox);
    label.appendChild(link);
    
    return label;
}

function handlePackageSelection(e) {
    const pkg = e.target;
    const isChecked = pkg.checked;
    
    const dependencies = pkg.getAttribute('data-dependencies');
    if (dependencies) {
        dependencies.split(',').forEach(dep => {
            const depCheckbox = document.querySelector(`#pkg-${dep}`);
            if (depCheckbox) {
                depCheckbox.checked = isChecked;
            }
        });
    }
    
    updatePackageListFromSelector();
}

function updatePackageListFromSelector() {
    const checkedPkgs = [];
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        if (pkgName) checkedPkgs.push(pkgName);
    });
    
    const textarea = document.querySelector('#asu-packages');
    if (textarea) {
        const currentPackages = split(textarea.value);
        const nonSelectorPkgs = currentPackages.filter(pkg => {
            return !document.querySelector(`.package-selector-checkbox[data-package="${pkg}"]`);
        });
        const newList = [...nonSelectorPkgs, ...checkedPkgs];
        textarea.value = newList.join(' ');
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
    const allPackages = [];
    if (PACKAGE_DB) {
        PACKAGE_DB.categories.forEach(cat => {
            cat.packages.forEach(pkg => {
                allPackages.push(pkg.name);
            });
        });
    }
    devicePackages = allPackages;
    console.log('Device packages loaded:', devicePackages.length);
    return allPackages;
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
    
    // すべてのフィールドに監視を設定
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
    
    // カスタムコマンド入力の監視
    const commandInput = document.querySelector("#command");
    if (commandInput) {
        commandInput.removeEventListener('input', updateCustomCommands);
        commandInput.addEventListener('input', updateCustomCommands);
    }
    
    // 初期値を反映
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
