// custom.js - OpenWrt カスタム機能（多重表示修正版）

console.log('custom.js loaded');

// 初期化フラグ
let customInitialized = false;
let customHTMLLoaded = false;

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

    // #asu 内の HTML を完全にクリア
    asuSection.innerHTML = '';

    const customPackages = temp.querySelector('#custom-packages-section details');
    const customScripts = temp.querySelector('#custom-scripts-section details');

    if (customPackages) {
        customPackages.id = 'custom-packages-details';  // IDを付与して後で識別できるように
        asuSection.appendChild(customPackages);
    }
    if (customScripts) {
        customScripts.id = 'custom-scripts-details';  // IDを付与して後で識別できるように
        asuSection.appendChild(customScripts);
    }

    asuSection.insertAdjacentHTML('beforeend', `
        <br>
        <div id="asu-buildstatus" class="hide"><span></span></div>
        <a href="javascript:buildAsuRequest()" class="custom-link">
            <span></span><span class="tr-request-build">REQUEST BUILD</span>
        </a>
    `);

    // Extended info 挿入
    const extendedInfo = temp.querySelector('#extended-build-info');
    const imageLink = document.querySelector('#image-link');
    if (extendedInfo && imageLink && !document.querySelector('#extended-build-info')) {
        imageLink.closest('.row').insertAdjacentElement('afterend', extendedInfo);
        show('#extended-build-info');
    }

    hookOriginalFunctions();
    setupEventListeners();
    
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
    
    // ISP情報の更新
    fetchAndDisplayIspInfo();
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
