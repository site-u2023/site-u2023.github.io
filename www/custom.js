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
    
    // パッケージリストが設定された後にリサイズを実行
    if (mobj && "manifest" in mobj === false) {
        // 少し遅延させて DOM 更新後にリサイズ
        setTimeout(() => {
            resizePostinstTextarea();
        }, 100);
    }
    
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
    
    // UCI-defaults自動読み込み
    loadUciDefaultsTemplate();
    
    // パッケージデータベースを読み込み
    loadPackageDatabase();

    // デバイス用言語セレクター初期化
    initDeviceTranslation();

    // フォーム全体の監視を開始する関数を呼び出す
    setupFormWatchers();
    
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

// 修正版：依存パッケージを同じ枠内に配置する
function createPackageCheckbox(pkgId, pkgName, isChecked = false, dependencies = null) {
    const packageItem = document.createElement('div');
    packageItem.className = 'package-item';
    
    // メインパッケージのチェックボックス作成
    const mainFormCheck = createSingleCheckbox(pkgId, pkgName, isChecked, dependencies);
    packageItem.appendChild(mainFormCheck);
    
    // 依存パッケージがある場合、同じpackage-item内に追加
    if (dependencies && Array.isArray(dependencies)) {
        dependencies.forEach(depId => {
            const depPkg = findPackageById(depId);
            const depName = depPkg ? depPkg.name : depId;
            
            // 利用可能なパッケージのみ追加
            const availablePackages = new Set(devicePackages.map(p => 
                typeof p === 'string' ? p : p.name
            ));
            
            if (availablePackages.has(depName)) {
                const depFormCheck = createSingleCheckbox(depId, depName, isChecked);
                depFormCheck.classList.add('package-dependent'); // 依存パッケージのスタイル
                packageItem.appendChild(depFormCheck); // 同じpackage-item内に追加
            }
        });
    }
    
    return packageItem;
}

// 単一のチェックボックスを作成するヘルパー関数
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

// 修正版のgeneratePackageSelector（依存パッケージの重複処理を削除）
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
        
        const categoryTitle = document.createElement('h4');
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
            
            // パッケージアイテム作成（依存パッケージも同じ枠内に含まれる）
            const packageItem = createPackageCheckbox(pkg.id, pkg.name, pkg.checked, pkg.dependencies);
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

// UCI-defaultsテキストエリアをリサイズする関数
function loadUciDefaultsTemplate() {
    console.log('loadUciDefaultsTemplate called');
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    if (!textarea || !config?.uci_defaults_setup_url) return;

    // 自動リサイズ関数
    function autoResize() {
        const lines = textarea.value.split('\n').length;
        textarea.rows = lines + 1;
    }

    // 初期設定
    // textarea.style.resize = 'both';
    
    // イベントリスナー設定
    textarea.addEventListener('input', autoResize);
    textarea.addEventListener('paste', () => setTimeout(autoResize, 10));

    fetch(config.uci_defaults_setup_url)
        .then(r => { 
            if (!r.ok) throw new Error(r.statusText); 
            return r.text(); 
        })
        .then(text => {
            textarea.value = text;
            // コンテンツ読み込み後にリサイズ
            autoResize();
            console.log('setup.sh loaded successfully');

            // 初期値をフォームから反映
            updateVariableDefinitions();      
        })
        .catch(err => {
            console.error('Failed to load setup.sh:', err);
        });
}

// Postinstテキストエリアをリサイズする関数
function resizePostinstTextarea() {
    const textarea = document.querySelector("#asu-packages");
    if (!textarea) return;

    // 初期設定
    // textarea.style.resize = 'both';
    
    // 一時的にheightをautoにして自然なサイズを取得
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
    
    console.log('Postinst textarea auto-resized');
}

// イベントリスナー設定
function setupEventListeners() {
    console.log('setupEventListeners called');
    
    // 既存のリスナーを削除してから再設定
    const connectionModeRadios = document.querySelectorAll('input[name="connectionMode"]');
    const connectionTypeRadios = document.querySelectorAll('input[name="connectionType"]');
    const netOptimizerRadios = document.querySelectorAll('input[name="netOptimizer"]');
    const wifiModeRadios = document.querySelectorAll('input[name="wifi_mode"]');
    
    console.log('Found wifi_mode radios:', wifiModeRadios.length);
    
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
    
    wifiModeRadios.forEach(r => {
        console.log('Adding event listener to wifi radio:', r.value);
        r.removeEventListener('change', handleWifiModeChange);
        r.addEventListener('change', handleWifiModeChange);
    });
    
    // Wi-Fi初期状態設定
    const checkedWifiMode = document.querySelector('input[name="wifi_mode"]:checked');
    if (checkedWifiMode) {
        console.log('Initial wifi mode:', checkedWifiMode.value);
        handleWifiModeChange({ target: checkedWifiMode });
    }
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
    hide("#auto-section");
    hide("#dhcp-section");
    hide("#pppoe-section");
    hide("#dslite-section");
    hide("#mape-section");
    hide("#ap-section");

    if (e.target.value === 'auto') show("#auto-section");
    else if (e.target.value === 'dhcp') show("#dhcp-section");
    else if (e.target.value === 'pppoe') show("#pppoe-section");
    else if (e.target.value === 'dslite') show("#dslite-section");
    else if (e.target.value === 'mape') show("#mape-section");
    else if (e.target.value === 'ap') show("#ap-section");
}

// ネットワークオプティマイザー変更
function handleNetOptimizerChange(e) {
    // すべてのセクションを非表示
    hide("#netopt-auto-section");
    hide("#netopt-manual-section");
    hide("#netopt-disabled-section");
    
    // 選択された値に応じて表示
    if (e.target.value === 'auto') {
        show("#netopt-auto-section");
    } else if (e.target.value === 'manual') {
        show("#netopt-manual-section");
    } else if (e.target.value === 'disabled') {
        show("#netopt-disabled-section");
    }
}

// Wi-Fiモード変更
function handleWifiModeChange(e) {
    const wifiOptionsContainer = document.querySelector("#wifi-options-container");
    const usteerOptions = document.querySelector("#usteer-options");
    
    if (e.target.value === 'disabled') {
        hide(wifiOptionsContainer);
        hide(usteerOptions);
    } else {
        show(wifiOptionsContainer);
        
        if (e.target.value === 'usteer') {
            show(usteerOptions);
        } else {
            hide(usteerOptions);
        }
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

// デバイス用言語セレクター初期化関数
function initDeviceTranslation() {
    const select = document.querySelector("#aios-language");
    if (!select) return;

    // 初期言語設定
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

// フォーム値収集関数
function collectFormValues() {
    const values = {};
    
    // 基本設定
    const language = document.querySelector("#aios-language")?.value;
    const country = document.querySelector("#aios-country")?.value;
    const timezone = document.querySelector("#aios-timezone")?.value;
    const zonename = document.querySelector("#aios-zonename")?.value;
    const deviceName = document.querySelector("#aios-device-name")?.value;
    const rootPassword = document.querySelector("#aios-root-password")?.value;
    const lanIpAddress = document.querySelector("#aios-lan-ipv4")?.value;
    const lanIpv6Address = document.querySelector("#aios-lan-ipv6")?.value;
    const sshInterface = document.querySelector("#aios-ssh-interface")?.value;
    const sshPort = document.querySelector("#aios-ssh-port")?.value;
    const backupPath = document.querySelector("#aios-backup-path")?.value;
    
    // Flow offloading
    const flowOffloading = document.querySelector("#aios-flow-offloading")?.value;
    
    // Wi-Fi設定
    const wifiMode = document.querySelector('input[name="wifi_mode"]:checked')?.value;
    const wifiSsid = document.querySelector("#aios-wifi-ssid")?.value;
    const wifiPassword = document.querySelector("#aios-wifi-password")?.value;
    const mobilityDomain = document.querySelector("#aios-wifi-mobility-domain")?.value;
    const snr = document.querySelector("#aios-wifi-snr")?.value;
    
    // 接続タイプ設定
    const connectionType = document.querySelector('input[name="connectionType"]:checked')?.value;
    
    // PPPoE設定
    const pppoeUsername = document.querySelector("#pppoe-username")?.value;
    const pppoePassword = document.querySelector("#pppoe-password")?.value;
    
    // DS-Lite設定
    const dsliteAftrAddress = document.querySelector("#dslite-aftr-address")?.value;
    
    // MAP-E設定
    const mapeBr = document.querySelector("#mape-br")?.value;
    const mapeEalen = document.querySelector("#mape-ealen")?.value;
    const mapeIpv4Prefix = document.querySelector("#mape-ipv4-prefix")?.value;
    const mapeIpv4Prefixlen = document.querySelector("#mape-ipv4-prefixlen")?.value;
    const mapeIpv6Prefix = document.querySelector("#mape-ipv6-prefix")?.value;
    const mapeIpv6Prefixlen = document.querySelector("#mape-ipv6-prefixlen")?.value;
    const mapePsidOffset = document.querySelector("#mape-psid-offset")?.value;
    const mapePsidlen = document.querySelector("#mape-psidlen")?.value;
    const mapeGuaPrefix = document.querySelector("#mape-gua-prefix")?.value;
    const mapeType = document.querySelector('input[name="mapeType"]:checked')?.value;
    
    // AP設定
    const apIpAddress = document.querySelector("#ap-ip-address")?.value;
    const apGateway = document.querySelector("#ap-gateway")?.value;
    
    // Network Optimizer設定
    const netOptimizer = document.querySelector('input[name="netOptimizer"]:checked')?.value;
    const netoptRmem = document.querySelector("#netopt-rmem")?.value;
    const netoptWmem = document.querySelector("#netopt-wmem")?.value;
    const netoptConntrack = document.querySelector("#netopt-conntrack")?.value;
    const netoptBacklog = document.querySelector("#netopt-backlog")?.value;
    const netoptSomaxconn = document.querySelector("#netopt-somaxconn")?.value;
    const netoptCongestion = document.querySelector("#netopt-congestion")?.value;
    
    // 値が存在する場合のみ設定
    if (language && language !== "en") values.language = language;
    if (country) values.country = country;
    if (timezone) values.timezone = timezone;
    if (zonename) values.zonename = zonename;
    if (deviceName) values.device_name = deviceName;
    if (rootPassword) values.root_password = rootPassword;
    if (lanIpAddress) values.lan_ip_address = lanIpAddress;
    if (lanIpv6Address) values.lan_ipv6_address = lanIpv6Address;
    if (sshInterface && sshInterface !== "lan") values.ssh_interface = sshInterface;
    if (sshPort && sshPort !== "22") values.ssh_port = sshPort;
    if (backupPath && backupPath !== "/root/backup.tar.gz") values.backup_path = backupPath;
    
    // Flow offloading
    if (flowOffloading) values.flow_offloading_type = flowOffloading;
    
    // Wi-Fi設定
    if (wifiMode === "usteer") values.enable_usteer = "1";
    if (wifiSsid) values.wlan_ssid = wifiSsid;
    if (wifiPassword) values.wlan_password = wifiPassword;
    if (mobilityDomain) values.mobility_domain = mobilityDomain;
    if (snr) values.snr = snr;
    
    // PPPoE設定
    if (pppoeUsername) values.pppoe_username = pppoeUsername;
    if (pppoePassword) values.pppoe_password = pppoePassword;
    
    // DS-Lite設定
    if (dsliteAftrAddress) values.dslite_aftr_address = dsliteAftrAddress;
    
    // MAP-E設定
    if (mapeBr) values.mape_br = mapeBr;
    if (mapeEalen) values.mape_ealen = mapeEalen;
    if (mapeIpv4Prefix) values.mape_ipv4_prefix = mapeIpv4Prefix;
    if (mapeIpv4Prefixlen) values.mape_ipv4_prefixlen = mapeIpv4Prefixlen;
    if (mapeIpv6Prefix) values.mape_ipv6_prefix = mapeIpv6Prefix;
    if (mapeIpv6Prefixlen) values.mape_ipv6_prefixlen = mapeIpv6Prefixlen;
    if (mapePsidOffset) values.mape_psid_offset = mapePsidOffset;
    if (mapePsidlen) values.mape_psidlen = mapePsidlen;
    if (mapeGuaPrefix) values.mape_gua_prefix = mapeGuaPrefix;
    if (mapeType === "gua") values.mape_gua_mode = "1";
    
    // AP設定
    if (apIpAddress) values.ap_ip_address = apIpAddress;
    if (apGateway) values.ap_gateway = apGateway;
    
    // Network Optimizer設定
    if (netOptimizer === "auto") values.enable_netopt = "1";
    if (netOptimizer === "manual") {
        if (netoptRmem) values.netopt_rmem = netoptRmem;
        if (netoptWmem) values.netopt_wmem = netoptWmem;
        if (netoptConntrack) values.netopt_conntrack = netoptConntrack;
        if (netoptBacklog) values.netopt_backlog = netoptBacklog;
        if (netoptSomaxconn) values.netopt_somaxconn = netoptSomaxconn;
        if (netoptCongestion) values.netopt_congestion = netoptCongestion;
    }
    
    return values;
}

// 変数定義文字列生成関数
function generateVariableDefinitions(values) {
    const lines = [];
    
    // 各値をシェル変数として出力
    Object.entries(values).forEach(([key, value]) => {
        // 値をエスケープ（シングルクォートを含む場合の処理）
        const escapedValue = value.toString().replace(/'/g, "'\"'\"'");
        lines.push(`${key}='${escapedValue}'`);
    });
    
    return lines.join('\n');
}

// 変数定義部分更新関数
function updateVariableDefinitions() {
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    if (!textarea) {
        console.log('UCI defaults textarea not found');
        return;
    }
    
    const values = collectFormValues();
    const variableDefinitions = generateVariableDefinitions(values);
    
    let content = textarea.value;
    
    // BEGIN_VARIABLE_DEFINITIONS から END_VARIABLE_DEFINITIONS までを置換
    const beginMarker = '# BEGIN_VARIABLE_DEFINITIONS';
    const endMarker = '# END_VARIABLE_DEFINITIONS';
    
    const beginIndex = content.indexOf(beginMarker);
    const endIndex = content.indexOf(endMarker);
    
    if (beginIndex !== -1 && endIndex !== -1) {
        const beforeSection = content.substring(0, beginIndex + beginMarker.length);
        const afterSection = content.substring(endIndex);
        
        // 変数定義が空でない場合は改行を追加
        const newSection = variableDefinitions ? '\n' + variableDefinitions + '\n' : '\n';
        
        textarea.value = beforeSection + newSection + afterSection;
        
        // リサイズを実行
        const lines = textarea.value.split('\n').length;
        textarea.rows = lines + 1;
        
        console.log('Variable definitions updated:', Object.keys(values).length, 'variables');
    } else {
        console.log('Variable definition markers not found in content');
    }
}

// カスタムコマンド更新関数
function updateCustomCommands() {
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    if (!textarea) return;
    
    // カスタムコマンドの収集
    const commandInput = document.querySelector("#command");
    const customCommands = commandInput?.value || '';
    
    let content = textarea.value;
    
    // BEGIN_CUSTOM_COMMANDS から END_CUSTOM_COMMANDS までを置換
    const beginMarker = '# BEGIN_CUSTOM_COMMANDS';
    const endMarker = '# END_CUSTOM_COMMANDS';
    
    const beginIndex = content.indexOf(beginMarker);
    const endIndex = content.indexOf(endMarker);
    
    if (beginIndex !== -1 && endIndex !== -1) {
        const beforeSection = content.substring(0, beginIndex + beginMarker.length);
        const afterSection = content.substring(endIndex);
        
        // カスタムコマンドが空でない場合は改行を追加
        const newSection = customCommands ? '\n' + customCommands + '\n' : '\n';
        
        textarea.value = beforeSection + newSection + afterSection;
        
        // リサイズを実行
        const lines = textarea.value.split('\n').length;
        textarea.rows = lines + 1;
        
        console.log('Custom commands updated');
    }
}

// フォーム監視設定関数
function setupFormWatchers() {
    console.log('setupFormWatchers called');
    
    // 監視対象の要素セレクター
    const watchSelectors = [
        "#aios-language",
        "#aios-country", 
        "#aios-timezone",
        "#aios-zonename",
        "#aios-device-name",
        "#aios-root-password",
        "#aios-lan-ipv4",
        "#aios-lan-ipv6",
        "#aios-ssh-interface",
        "#aios-ssh-port",
        "#aios-flow-offloading",
        "#aios-backup-path",
        "#aios-wifi-ssid",
        "#aios-wifi-password",
        "#aios-wifi-mobility-domain",
        "#aios-wifi-snr",
        'input[name="wifi_mode"]',
        'input[name="connectionType"]',
        'input[name="netOptimizer"]',
        'input[name="mapeType"]',
        "#pppoe-username",
        "#pppoe-password",
        "#dslite-aftr-address",
        "#mape-br",
        "#mape-ealen",
        "#mape-ipv4-prefix",
        "#mape-ipv4-prefixlen",
        "#mape-ipv6-prefix",
        "#mape-ipv6-prefixlen",
        "#mape-psid-offset",
        "#mape-psidlen",
        "#mape-gua-prefix",
        "#ap-ip-address",
        "#ap-gateway",
        "#netopt-rmem",
        "#netopt-wmem",
        "#netopt-conntrack",
        "#netopt-backlog",
        "#netopt-somaxconn",
        "#netopt-congestion"
    ];
    
    // 各要素にイベントリスナーを設定
    let foundElements = 0;
    watchSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) foundElements += elements.length;
        
        elements.forEach(element => {
            // 既存のリスナーを削除
            element.removeEventListener('input', updateVariableDefinitions);
            element.removeEventListener('change', updateVariableDefinitions);
            
            // 新しいリスナーを追加
            if (element.type === 'radio' || element.type === 'checkbox' || element.tagName === 'SELECT') {
                element.addEventListener('change', updateVariableDefinitions);
            } else {
                element.addEventListener('input', updateVariableDefinitions);
            }
        });
    });
    
    console.log('Found', foundElements, 'elements to watch');
    
    // カスタムコマンド入力欄の監視
    const commandInput = document.querySelector("#command");
    if (commandInput) {
        commandInput.removeEventListener('input', updateCustomCommands);
        commandInput.addEventListener('input', updateCustomCommands);
        console.log('Command input watcher added');
    }
    
    // 初回実行
    updateVariableDefinitions();
    
    console.log('Form watchers setup completed');
}
