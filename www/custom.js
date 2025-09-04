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
    if (cachedApiInfo) updateAutoConnectionInfo(cachedApiInfo);  // AUTO情報の再更新
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

        // HTMLに描画
        renderSetupConfig(setupConfig);
        
        console.log('Setup config loaded:', setupConfig);
        return setupConfig;
    } catch (err) {
        console.error('Failed to load setup.json:', err);
        return null;
    }
}

// setup.json → HTML描画
function renderSetupConfig(config) {
   const container = document.querySelector('#dynamic-config-sections');
   if (!container) return;
   container.innerHTML = '';

   config.categories.forEach(category => {
       const section = document.createElement('section');
       section.className = 'config-section';

       const h3 = document.createElement('h3');
       h3.textContent = category.name;
       section.appendChild(h3);

       category.packages.forEach(pkg => {
           buildField(section, pkg);
       });

       container.appendChild(section);
   });
}

function buildField(parent, pkg) {
   switch (pkg.type) {
       case 'input-group':
           pkg.fields.forEach(field => {
               const row = document.createElement('div');
               row.className = field.class || 'row';

               const label = document.createElement('label');
               label.textContent = field.label || field.id;
               label.setAttribute('for', field.id);
               if (field.labelClass) label.className = field.labelClass;
               row.appendChild(label);

               const input = document.createElement('input');
               input.id = field.id;
               input.type = field.type || 'text';
               if (field.placeholder) input.placeholder = field.placeholder;
               if (field.defaultValue) input.value = field.defaultValue;
               if (field.inputClass) input.className = field.inputClass;
               row.appendChild(input);

               parent.appendChild(row);
           });
           break;

       case 'select':
           const rowSel = document.createElement('div');
           rowSel.className = pkg.class || 'row';
           const labelSel = document.createElement('label');
           labelSel.textContent = pkg.label || pkg.id;
           labelSel.setAttribute('for', pkg.id);
           rowSel.appendChild(labelSel);
           const select = document.createElement('select');
           select.id = pkg.id;
           pkg.options.forEach(opt => {
               const option = document.createElement('option');
               option.value = opt.value;
               option.textContent = opt.label;
               if (opt.selected || opt.value === pkg.defaultValue) option.selected = true;
               select.appendChild(option);
           });
           rowSel.appendChild(select);
           parent.appendChild(rowSel);
           break;

       case 'radio-group':
           const wrapRadio = document.createElement('div');
           wrapRadio.className = pkg.class || 'radio-group';
           const labelRadio = document.createElement('div');
           labelRadio.textContent = pkg.label || pkg.id;
           wrapRadio.appendChild(labelRadio);
           pkg.options.forEach(opt => {
               const radioLabel = document.createElement('label');
               const radio = document.createElement('input');
               radio.type = 'radio';
               radio.name = pkg.variableName || pkg.id;
               radio.value = opt.value;
               if (opt.checked || opt.value === pkg.defaultValue) radio.checked = true;
               radioLabel.appendChild(radio);
               radioLabel.appendChild(document.createTextNode(opt.label));
               wrapRadio.appendChild(radioLabel);
           });
           parent.appendChild(wrapRadio);
           break;

       case 'conditional-section':
           const condWrap = document.createElement('div');
           condWrap.id = pkg.id;
           condWrap.className = 'conditional-section';
           pkg.children.forEach(child => buildField(condWrap, child));
           parent.appendChild(condWrap);
           break;

       case 'info-display':
           const info = document.createElement('div');
           info.id = pkg.id;
           info.textContent = pkg.content || '';
           parent.appendChild(info);
           break;
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
            const el = pkg.selector ? document.querySelector(pkg.selector) : null;

            // HTML の value を優先、無ければ setup.json の defaultValue
            const fieldInfo = {
                id: pkg.id,
                selector: pkg.selector,
                variableName: pkg.variableName || pkg.id.replace(/-/g, '_'),
                defaultValue: (el && el.value) ? el.value : pkg.defaultValue,
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
                            const elChild = grandChild.selector ? document.querySelector(grandChild.selector) : null;
                            const childFieldInfo = {
                                id: grandChild.id,
                                selector: grandChild.selector,
                                variableName: grandChild.variableName || grandChild.id.replace(/-/g, '_'),
                                defaultValue: (elChild && elChild.value) ? elChild.value : grandChild.defaultValue,
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
        
        // 値が存在すれば無条件で設定
        if (value !== null && value !== undefined && value !== "") {
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
    
    if (connectionType === 'auto') {
        // AUTO選択時は、全ての接続タイプのHTMLフィールド値を削除
        Object.keys(formStructure.connectionTypes).forEach(type => {
            if (type !== 'auto') {  // autoは元々フィールドがないのでスキップ
                formStructure.connectionTypes[type].forEach(fieldId => {
                    const field = formStructure.fields[fieldId];
                    if (field) delete values[field.variableName];
                });
            }
        });
        
        // その後、APIから検出された値のみを使用
        if (cachedApiInfo) {
            if (cachedApiInfo.mape?.brIpv6Address) {
                // MAP-Eの値を自動設定
                values.mape_br = cachedApiInfo.mape.brIpv6Address;
                values.mape_ealen = cachedApiInfo.mape.eaBitLength;
                values.mape_ipv4_prefix = cachedApiInfo.mape.ipv4Prefix;
                values.mape_ipv4_prefixlen = cachedApiInfo.mape.ipv4PrefixLength;
                values.mape_ipv6_prefix = cachedApiInfo.mape.ipv6Prefix;
                values.mape_ipv6_prefixlen = cachedApiInfo.mape.ipv6PrefixLength;
                values.mape_psid_offset = cachedApiInfo.mape.psIdOffset;
                values.mape_psidlen = cachedApiInfo.mape.psidlen;
                
                // GUA Prefix処理
                if (cachedApiInfo.mape.ipv6Prefix) {
                    const prefix = cachedApiInfo.mape.ipv6Prefix;
                    const segments = prefix.split(':');
                    while (segments.length < 4) {
                        segments.push('0');
                    }
                    values.mape_gua_prefix = segments.slice(0, 4).join(':') + '::/64';
                    values.mape_gua_mode = '1';
                }
            } else if (cachedApiInfo.aftr) {
                // DS-Liteの値を自動設定
                values.dslite_aftr_address = cachedApiInfo.aftr;
            }
            // 両方nullの場合は何も設定しない（接続タイプ関連は完全スキップ）
        }
    } else if (connectionType && connectionType !== 'auto') {
        // 手動選択時：他の接続タイプのフィールドを除外
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
    
    // MAP-E GUAモード（手動選択時のみ）
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
    
    // AUTOセクションも含めて制御
    const autoSection = document.querySelector('#auto-section');
    if (autoSection) {
        if (selectedType === 'auto') {
            show(autoSection);
            // AUTO選択時は検出された情報を再表示
            if (cachedApiInfo) {
                updateAutoConnectionInfo(cachedApiInfo);
            }
        } else {
            hide(autoSection);
        }
    }
    
    // すべてのセクションを制御
    Object.keys(formStructure.connectionTypes).forEach(type => {
        const section = document.querySelector(`#${type}-section`);
        if (section) {
            if (type === selectedType) {
                show(section);
            } else {
                hide(section);
                // 手動選択時はフィールドをクリアしない（HTMLの初期値を保持）
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
        // Disabled時のみフィールドをクリア
        ['aios-wifi-ssid', 'aios-wifi-password', 'aios-wifi-mobility-domain', 'aios-wifi-snr']
            .forEach(id => {
                const el = document.querySelector(`#${id}`);
                if (el) el.value = '';
            });
    } else {
        show(wifiOptionsContainer);
        if (mode === 'usteer') {
            show(usteerOptions);
            // Usteer選択時はクリアしない（HTMLの初期値を保持）
        } else {
            hide(usteerOptions);
            // Standard選択時もクリアしない（HTMLの初期値を保持）
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
        updateAutoConnectionInfo(apiInfo);  // AUTOセクションの情報を更新
    } catch (err) {
        console.error('Failed to fetch ISP info:', err);
        // エラー時もAUTO情報を更新
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

// ISP 情報でフォームを上書き（AUTO選択時のみ接続情報を上書き）
function applyIspAutoConfig(apiInfo) {
    if (!apiInfo || !formStructure.fields) return;
    
    // 現在の接続タイプを取得
    const connectionType = getFieldValue('input[name="connectionType"]');
    
    Object.values(formStructure.fields).forEach(field => {
        if (field.apiMapping) {
            // 接続関連フィールドかどうかを判定
            const isConnectionField = ['dslite', 'mape', 'ap', 'pppoe'].some(type => 
                formStructure.connectionTypes[type]?.includes(field.id)
            );
            
            // AUTO選択時以外は接続関連フィールドをスキップ
            if (isConnectionField && connectionType !== 'auto') {
                return;
            }
            
            let value = getNestedValue(apiInfo, field.apiMapping);

            // GUA Prefix特別処理（/64を付加）
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

            if (value !== null && value !== undefined) {
                const element = document.querySelector(field.selector);
                if (element) {
                    // ISP 情報が来たら上書き（ただし接続関連はAUTO時のみ）
                    element.value = value;
                }
            }
        }
    });
    
    updateAutoConnectionInfo(apiInfo);
    updateVariableDefinitions();
}

// AUTO接続情報の表示更新
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

// ==================== パッケージ管理（改良版） ====================

async function loadPackageDatabase() {
    try {
        const url = config?.packages_db_url || 'packages/packages.json';
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        PACKAGE_DB = await response.json();
        console.log('Package database loaded:', PACKAGE_DB);
        
        // デバイスパッケージを取得
        await fetchDevicePackages();
        
        // パッケージセレクタを生成
        generatePackageSelector();
        
        return PACKAGE_DB;
    } catch (err) {
        console.error('Failed to load package database:', err);
        return null;
    }
}

// パッケージセレクタの生成（改良版）
function generatePackageSelector() {
    const container = document.querySelector('#package-categories');
    if (!container || !PACKAGE_DB) {
        console.log('Container or PACKAGE_DB not found');
        return;
    }
    
    // コンテナをクリア
    container.innerHTML = '';
    
    // デバイスパッケージがない場合の処理を改良
    const availablePackages = new Set();
    
    if (!devicePackages || devicePackages.length === 0) {
        console.log('No device packages found, showing all packages');
        // デバイスパッケージが取得できない場合は全パッケージを表示
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
        // デバイスパッケージが取得できた場合
        devicePackages.forEach(p => {
            availablePackages.add(typeof p === 'string' ? p : p.name);
        });
    }
    
    // 依存関係パッケージのIDセットを作成
    const depIds = new Set();
    PACKAGE_DB.categories.forEach(cat => {
        cat.packages.forEach(pkg => {
            if (Array.isArray(pkg.dependencies)) {
                pkg.dependencies.forEach(d => depIds.add(d));
            }
        });
    });
    
    // 各カテゴリを生成
    PACKAGE_DB.categories.forEach(category => {
        const categoryDiv = createPackageCategory(category, availablePackages, depIds);
        if (categoryDiv) {
            container.appendChild(categoryDiv);
        }
    });
    
    // パッケージリストを更新
    updatePackageListFromSelector();
    
    console.log(`Generated ${PACKAGE_DB.categories.length} package categories`);
}

// パッケージカテゴリの作成（改良版）
function createPackageCategory(category, availablePackages, depIds) {
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'package-category';
    categoryDiv.setAttribute('data-category-id', category.id);
    
    const packageGrid = document.createElement('div');
    packageGrid.className = 'package-grid';
    
    let hasVisiblePackages = false;
    
    category.packages.forEach(pkg => {
        // hiddenフラグがtrueの場合はスキップ
        if (pkg.hidden) return;
        
        // 依存関係パッケージで、hiddenフラグがない場合もスキップ
        if (depIds.has(pkg.id) && !pkg.hidden === false) return;
        
        // デバイスパッケージリストが空の場合は全て表示
        if (availablePackages.size === 0 || availablePackages.has(pkg.name)) {
            hasVisiblePackages = true;
            const packageItem = createPackageItem(pkg, availablePackages);
            packageGrid.appendChild(packageItem);
        }
    });
    
    // 表示可能なパッケージがない場合はnullを返す
    if (!hasVisiblePackages) return null;
    
    // カテゴリタイトル
    const title = document.createElement('h4');
    title.textContent = category.name;
    categoryDiv.appendChild(title);
    
    // カテゴリ説明
    if (category.description) {
        const description = document.createElement('div');
        description.className = 'package-category-description';
        description.textContent = category.description;
        categoryDiv.appendChild(description);
    }
    
    categoryDiv.appendChild(packageGrid);
    return categoryDiv;
}

// パッケージアイテムの作成（改良版）
function createPackageItem(pkg, availablePackages) {
    const packageItem = document.createElement('div');
    packageItem.className = 'package-item';
    packageItem.setAttribute('data-package-id', pkg.id);
    
    // メインパッケージのチェックボックス
    const mainCheckbox = createPackageCheckbox(pkg, pkg.checked || false);
    packageItem.appendChild(mainCheckbox);
    
    // 依存関係パッケージの表示（改良）
    if (pkg.dependencies && Array.isArray(pkg.dependencies)) {
        const depContainer = document.createElement('div');
        depContainer.className = 'package-dependencies';
        
        pkg.dependencies.forEach(depId => {
            const depPkg = findPackageById(depId);
            if (depPkg && !depPkg.hidden) {
                const depName = depPkg.name || depId;
                
                // 依存パッケージが利用可能な場合のみ表示
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
    
    // enableVar が指定されている場合の処理
    if (pkg.enableVar) {
        const checkbox = packageItem.querySelector(`#pkg-${pkg.id}`);
        if (checkbox) {
            checkbox.setAttribute('data-enable-var', pkg.enableVar);
        }
    }
    
    return packageItem;
}

// パッケージチェックボックスの作成（改良版）
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
    
    // 依存パッケージでない場合のみイベントリスナーを追加
    if (!isDependency) {
        checkbox.addEventListener('change', handlePackageSelection);
    }
    
    // リンクまたはテキスト表示
    if (config?.package_url) {
        const link = document.createElement('a');
        link.href = config.package_url.replace("{id}", encodeURIComponent(pkg.id));
        link.target = '_blank';
        link.className = 'package-link';
        link.textContent = pkg.name || pkg.id;
        link.onclick = (e) => e.stopPropagation(); // チェックボックスの切り替えを防ぐ
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

// パッケージ選択ハンドラー（改良版）
function handlePackageSelection(e) {
    const pkg = e.target;
    const isChecked = pkg.checked;
    const packageId = pkg.getAttribute('data-package-id');
    
    // 依存パッケージの処理
    const dependencies = pkg.getAttribute('data-dependencies');
    if (dependencies) {
        dependencies.split(',').forEach(depId => {
            const depCheckbox = document.querySelector(`#pkg-${depId}`);
            if (depCheckbox) {
                depCheckbox.checked = isChecked;
                
                // 依存パッケージの依存関係も処理（再帰的）
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
    
    // enableVar の処理
    const enableVar = pkg.getAttribute('data-enable-var');
    if (enableVar) {
        // この変数を後でuci-defaultsスクリプトで使用
        updateVariableDefinitions();
    }
    
    // パッケージリストを更新
    updatePackageListFromSelector();
}

// パッケージリストの更新（改良版）
function updatePackageListFromSelector() {
    const checkedPkgs = new Set();
    
    // チェックされているパッケージを収集
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        if (pkgName) {
            checkedPkgs.add(pkgName);
        }
    });
    
    const textarea = document.querySelector('#asu-packages');
    if (textarea) {
        // 現在のパッケージリストを取得
        const currentPackages = split(textarea.value);
        
        // セレクタで管理されていないパッケージを保持
        const nonSelectorPkgs = currentPackages.filter(pkg => {
            return !document.querySelector(`.package-selector-checkbox[data-package="${pkg}"]`);
        });
        
        // 新しいリストを作成（重複を除外）
        const newList = [...new Set([...nonSelectorPkgs, ...checkedPkgs])];
        
        // テキストエリアを更新
        textarea.value = newList.join(' ');
        
        console.log(`Updated package list: ${newList.length} packages`);
    }
}

// パッケージIDでパッケージを検索（改良版）
function findPackageById(id) {
    if (!PACKAGE_DB) return null;
    
    for (const category of PACKAGE_DB.categories) {
        const pkg = category.packages.find(p => p.id === id);
        if (pkg) return pkg;
    }
    return null;
}

// デバイスパッケージの取得（改良版）
async function fetchDevicePackages() {
    try {
        // まず全パッケージリストを作成
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
        
        // デバイス固有のパッケージリストがある場合はここで取得
        // 現在は全パッケージを返す
        devicePackages = allPackages;
        
        console.log(`Device packages loaded: ${devicePackages.length} packages`);
        return devicePackages;
        
    } catch (err) {
        console.error('Failed to fetch device packages:', err);
        // エラー時は空配列を返す
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
    
    // パッケージのenableVar処理を追加
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
