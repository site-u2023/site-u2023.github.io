// custom.js - OpenWrt カスタム機能（パッケージ機能統合版）

console.log('custom.js loaded');

// 初期化フラグ
let customInitialized = false;
let customHTMLLoaded = false;

// パッケージデータベース
let PACKAGE_DB = null;
let devicePackages = [];

// 元の updateImages を保持
const originalUpdateImages = window.updateImages;

// updateImages をフック
window.updateImages = function(version, mobj) {
    if (originalUpdateImages) originalUpdateImages(version, mobj);
    
    // 初回のみ custom.html を読み込む
    if (!customHTMLLoaded) {
        console.log("updateImages finished, now load custom.html");
        loadCustomHTML();
        customHTMLLoaded = true;
    } else {
        // 2回目以降は再初期化のみ
        console.log("updateImages called again, reinitializing features");
        reinitializeFeatures();
    }
};

// custom.html 読み込み＆挿入
async function loadCustomHTML() {
    try {
        const response = await fetch('custom.html');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        console.log('custom.html loaded');

        const temp = document.createElement('div');
        temp.innerHTML = html;

        // #asu が生成されるまで待機して初期化
        waitForAsuAndInit(temp);
    } catch (err) {
        console.error('Failed to load custom.html:', err);
    }
}

// #asu が存在するまで再試行
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

// 初期化処理
function initializeCustomFeatures(asuSection, temp) {
    console.log('initializeCustomFeatures called');
    
    // 既に初期化済みの場合はスキップ
    if (customInitialized) {
        console.log('Already initialized, skipping');
        return;
    }

    // 既存のカスタム要素をクリーンアップ
    cleanupExistingCustomElements();

    // #asuをdivタグに置き換える
    const newDiv = document.createElement('div');
    newDiv.id = 'asu';
    newDiv.className = asuSection.className;
    newDiv.style.width = '100%';
    
    const customPackages = temp.querySelector('#custom-packages-section details');
    const customScripts = temp.querySelector('#custom-scripts-section details');

    if (customPackages) {
        customPackages.id = 'custom-packages-details';  // IDを付与して後で識別できるように
        newDiv.appendChild(customPackages);
    }
    if (customScripts) {
        customScripts.id = 'custom-scripts-details';  // IDを付与して後で識別できるように
        newDiv.appendChild(customScripts);
    }

    newDiv.insertAdjacentHTML('beforeend', `
        <br>
        <div id="asu-buildstatus" class="hide"><span></span></div>
        <a href="javascript:buildAsuRequest()" class="custom-link">
            <span></span><span class="tr-request-build">REQUEST BUILD</span>
        </a>
    `);
    
    // 元の#asuを新しいdivで置き換える
    asuSection.parentNode.replaceChild(newDiv, asuSection);

    // Extended info 挿入
    const extendedInfo = temp.querySelector('#extended-build-info');
    const imageLink = document.querySelector('#image-link');
    if (extendedInfo && imageLink && !document.querySelector('#extended-build-info')) {
        imageLink.closest('.row').insertAdjacentElement('afterend', extendedInfo);
        show('#extended-build-info');
    }

    hookOriginalFunctions();
    setupEventListeners();
    
    // setup.shを自動読み込み
    loadUciDefaultsTemplate();
    
    // パッケージデータベースを読み込み
    loadPackageDatabase();
    
    // 初期化完了フラグ
    customInitialized = true;
}

// 既存のカスタム要素をクリーンアップ
function cleanupExistingCustomElements() {
    // 重複する可能性のある要素を削除
    const elementsToRemove = [
        '#custom-packages-details',
        '#custom-scripts-details',
        '#extended-build-info'
    ];
    
    elementsToRemove.forEach(selector => {
        const element = document.querySelector(selector);
        if (element) {
            element.remove();
            console.log(`Removed existing ${selector}`);
        }
    });
}

// 再初期化処理（2回目以降のupdateImages用）
function reinitializeFeatures() {
    const asuSection = document.querySelector('#asu');
    if (!asuSection) return;
    
    // イベントリスナーの再設定のみ行う
    setupEventListeners();
    
    // パッケージセレクターを再生成
    if (PACKAGE_DB) {
        generatePackageSelector();
    }
    
    // ISP情報の更新
    fetchAndDisplayIspInfo();
}

// ==================== パッケージ管理関数 ====================
async function loadPackageDatabase() {
    try {
        const response = await fetch('packages/packages.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        PACKAGE_DB = await response.json();
        console.log('Package database loaded:', PACKAGE_DB);
        
        // デバイスパッケージを取得（ダミー）
        await fetchDevicePackages();
        
        // パッケージセレクターを生成
        generatePackageSelector();
    } catch (err) {
        console.error('Failed to load package database:', err);
    }
}

function generatePackageSelector() {
    const container = document.querySelector('#package-categories');
    if (!container || !PACKAGE_DB) return;
    
    container.innerHTML = '';
    
    // デバイスパッケージが取得できていない場合
    if (!devicePackages || devicePackages.length === 0) {
        container.innerHTML = '<p class="text-muted small">Package information not available for this device.</p>';
        return;
    }
    
    // 利用可能パッケージ名のセット
    const availablePackages = new Set(devicePackages.map(p => 
        typeof p === 'string' ? p : p.name
    ));
    
    // 依存パッケージIDの集合
    const depIds = new Set();
    PACKAGE_DB.categories.forEach(cat => {
        cat.packages.forEach(pkg => {
            if (Array.isArray(pkg.dependencies)) {
                pkg.dependencies.forEach(d => depIds.add(d));
            }
        });
    });
    
    PACKAGE_DB.categories.forEach(category => {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'package-category';
        
        const categoryTitle = document.createElement('h5');
        categoryTitle.textContent = category.name;
        categoryDiv.appendChild(categoryTitle);
        
        const categoryDescription = document.createElement('div');
        categoryDescription.className = 'package-category-description';
        categoryDescription.textContent = category.description;
        categoryDiv.appendChild(categoryDescription);
        
        const packageGrid = document.createElement('div');
        packageGrid.className = 'package-grid';
        
        let hasVisiblePackages = false;
        
        category.packages.forEach(pkg => {
            // 依存パッケージはトップレベル描画しない
            if (depIds.has(pkg.id)) return;
            
            // 利用可能なパッケージのみ表示
            const isAvailable = availablePackages.has(pkg.name);
            if (!isAvailable) return;
            
            hasVisiblePackages = true;
            
            const packageItem = document.createElement('div');
            packageItem.className = 'package-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `pkg-${pkg.id}`;
            checkbox.className = 'package-selector-checkbox';
            checkbox.setAttribute('data-package', pkg.name);
            if (pkg.dependencies) {
                checkbox.setAttribute('data-dependencies', pkg.dependencies.join(','));
            }
            if (pkg.checked) {
                checkbox.checked = true;
            }
            checkbox.addEventListener('change', handlePackageSelection);
            
            const label = document.createElement('label');
            label.setAttribute('for', `pkg-${pkg.id}`);
            label.innerHTML = `<span class="package-link">${pkg.id}</span>`;
            
            packageItem.appendChild(checkbox);
            packageItem.appendChild(label);
            
            // 依存パッケージの表示
            if (Array.isArray(pkg.dependencies)) {
                pkg.dependencies.forEach(depId => {
                    const depPkg = findPackageById(depId);
                    const depName = depPkg ? depPkg.name : depId;
                    
                    if (!availablePackages.has(depName)) return;
                    
                    const depItem = document.createElement('div');
                    depItem.className = 'package-dependent';
                    
                    const depCheck = document.createElement('input');
                    depCheck.type = 'checkbox';
                    depCheck.id = `pkg-${depId}`;
                    depCheck.className = 'package-selector-checkbox';
                    depCheck.setAttribute('data-package', depName);
                    depCheck.addEventListener('change', handlePackageSelection);
                    
                    const depLabel = document.createElement('label');
                    depLabel.setAttribute('for', `pkg-${depId}`);
                    depLabel.textContent = depId;
                    
                    depItem.appendChild(depCheck);
                    depItem.appendChild(depLabel);
                    packageItem.appendChild(depItem);
                });
            }
            
            packageGrid.appendChild(packageItem);
        });
        
        if (hasVisiblePackages) {
            categoryDiv.appendChild(packageGrid);
            container.appendChild(categoryDiv);
        }
    });
    
    updatePackageListFromSelector();
}

function findPackageById(id) {
    if (!PACKAGE_DB) return null;
    
    for (const category of PACKAGE_DB.categories) {
        const pkg = category.packages.find(p => p.id === id);
        if (pkg) return pkg;
    }
    return null;
}

function handlePackageSelection(e) {
    const pkg = e.target;
    const packageName = pkg.getAttribute('data-package');
    const isChecked = pkg.checked;
    
    // 依存パッケージの同期
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

function split(str) {
    return str.match(/[^\s,]+/g) || [];
}

// デバイスパッケージの取得（ダミー実装）
async function fetchDevicePackages() {
    // 実際の実装では、デバイスに応じたパッケージリストを取得
    // ここではすべてのパッケージを利用可能として返す（テスト用）
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

// オリジナル関数をフック
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

// buildAsuRequest カスタム版
function customBuildAsuRequest(request_hash) {
    console.log('customBuildAsuRequest called with:', request_hash);

    const origFetch = window.fetch;
    window.fetch = function(url, options) {
        return origFetch(url, options).then(res => {
            res.clone().json().then(mobj => {
                if ("stderr" in mobj) {
                    // エラー時の再初期化は不要
                    console.log('Build error detected, skipping reinitialization');
                }
            }).catch(() => {
                // JSON解析エラーは無視
            });
            return res;
        });
    };

    if (originalBuildAsuRequest) originalBuildAsuRequest(request_hash);
    window.fetch = origFetch;
}

// setup_uci_defaults カスタム版
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
        })
        .catch(err => showAlert(err.message));
}

// setup.shを自動読み込みする関数
function loadUciDefaultsTemplate() {
    console.log('loadUciDefaultsTemplate called');
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    if (!textarea || !config?.uci_defaults_setup_url) return;

    fetch(config.uci_defaults_setup_url)
        .then(r => { 
            if (!r.ok) throw new Error(r.statusText); 
            return r.text(); 
        })
        .then(text => {
            textarea.value = text;
            console.log('setup.sh loaded successfully');
        })
        .catch(err => {
            console.error('Failed to load setup.sh:', err);
        });
}

// イベントリスナー設定
function setupEventListeners() {
    // 既存のリスナーを削除してから再設定
    const connectionModeRadios = document.querySelectorAll('input[name="connectionMode"]');
    const connectionTypeRadios = document.querySelectorAll('input[name="connectionType"]');
    const netOptimizerRadios = document.querySelectorAll('input[name="netOptimizer"]');
    const netOptimizerModeRadios = document.querySelectorAll('input[name="netOptimizerMode"]');
    
    connectionModeRadios.forEach(r => {
        r.removeEventListener('change', handleConnectionModeChange);
        r.addEventListener('change', handleConnectionModeChange);
    });
    
    connectionTypeRadios.forEach(r => {
        r.removeEventListener('change', handleConnectionTypeChange);
        r.addEventListener('change', handleConnectionTypeChange);
    });
    
    netOptimizerRadios.forEach(r => {
        r.removeEventListener('change', handleNetOptimizerChange);
        r.addEventListener('change', handleNetOptimizerChange);
    });
    
    netOptimizerModeRadios.forEach(r => {
        r.removeEventListener('change', handleNetOptimizerModeChange);
        r.addEventListener('change', handleNetOptimizerModeChange);
    });
}

// 接続モード変更
function handleConnectionModeChange(e) {
    const manualSection = document.querySelector("#manual-connection-section");
    if (e.target.value === 'manual') {
        show(manualSection);
    } else {
        hide(manualSection);
        if (cachedApiInfo) applyIspAutoConfig(cachedApiInfo);
    }
}

// 接続タイプ変更
function handleConnectionTypeChange(e) {
    hide("#pppoe-section");
    hide("#dslite-section");
    hide("#mape-section");
    
    if (e.target.value === 'pppoe') show("#pppoe-section");
    else if (e.target.value === 'dslite') show("#dslite-section");
    else if (e.target.value === 'mape') show("#mape-section");
}

// ネットワークオプティマイザー変更
function handleNetOptimizerChange(e) {
    const optimizerSection = document.querySelector("#net-optimizer-section");
    if (e.target.value === 'enabled') {
        show(optimizerSection);
    } else {
        hide(optimizerSection);
    }
}

// ネットワークオプティマイザーモード変更
function handleNetOptimizerModeChange(e) {
    const manualSection = document.querySelector("#net-optimizer-manual");
    if (e.target.value === 'manual') {
        show(manualSection);
    } else {
        hide(manualSection);
    }
}

// ISP情報取得・表示
let cachedApiInfo = null;
function fetchAndDisplayIspInfo() {
    if (!config?.auto_config_api_url) return;
    
    fetch(config.auto_config_api_url)
        .then(r => r.json())
        .then(apiInfo => {
            cachedApiInfo = apiInfo;
            displayIspInfo(apiInfo);
        })
        .catch(err => console.error('Failed to fetch ISP info:', err));
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
    
    const extendedInfo = document.querySelector("#extended-build-info");
    if (extendedInfo) show(extendedInfo);

    applyIspAutoConfig(apiInfo);
}

function applyIspAutoConfig(apiInfo) {
    if (!apiInfo) return;
    
    if (apiInfo.country) {
        const countryInput = document.querySelector("#aios-country");
        if (countryInput && !countryInput.value) {
            countryInput.value = apiInfo.country;
        }
    }
    
    if (apiInfo.timezone) {
        const timezoneInput = document.querySelector("#aios-timezone");
        if (timezoneInput && !timezoneInput.value) {
            timezoneInput.value = apiInfo.timezone;
        }
    }
    
    if (apiInfo.zonename) {
        const zonenameInput = document.querySelector("#aios-zonename");
        if (zonenameInput && !zonenameInput.value) {
            zonenameInput.value = apiInfo.zonename;
        }
    }
    
    if (apiInfo.mape?.brIpv6Address) {
        const mapeInputs = {
            'mape-br': apiInfo.mape.brIpv6Address,
            'mape-ealen': apiInfo.mape.eaBitLength
        };
        Object.entries(mapeInputs).forEach(([id, val]) => {
            const input = document.querySelector(`#${id}`);
            if (input && !input.value) {
                input.value = val;
            }
        });
    }
    
    if (apiInfo.aftr) {
        const dsliteInput = document.querySelector("#dslite-aftr-address");
        if (dsliteInput && !dsliteInput.value) {
            dsliteInput.value = apiInfo.aftr;
        }
    }
}

// ヘルパー関数
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

// DOMContentLoaded で初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        fetchAndDisplayIspInfo();
    });
} else {
    fetchAndDisplayIspInfo();
}
