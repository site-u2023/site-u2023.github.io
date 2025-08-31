// custom.js - OpenWrt カスタム機能（完全版）

console.log('custom.js loaded');

// 元の updateImages を保持
const originalUpdateImages = window.updateImages;

// updateImages をフック
window.updateImages = function(version, mobj) {
    if (originalUpdateImages) originalUpdateImages(version, mobj);
    console.log("updateImages finished, now load custom.html");
    loadCustomHTML();
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

    // #asu 内の HTML を置換
    const summaryText = asuSection.querySelector('summary span')?.innerText || 'ASU';
    asuSection.innerHTML = `<summary><span class="tr-customize">${summaryText}</span></summary>`;

    const customPackages = temp.querySelector('#custom-packages-section details');
    const customScripts = temp.querySelector('#custom-scripts-section details');

    if (customPackages) asuSection.appendChild(customPackages);
    if (customScripts) asuSection.appendChild(customScripts);

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
    if (extendedInfo && imageLink) {
        imageLink.closest('.row').insertAdjacentElement('afterend', extendedInfo);
        show('#extended-build-info');
    }

    hookOriginalFunctions();
    setupEventListeners();
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
                if ("stderr" in mobj) initializeCustomFeatures(document.querySelector('#asu'));
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
        .then(r => { if (!r.ok) throw new Error(r.statusText); return r.text(); })
        .then(text => textarea.value = text)
        .catch(err => showAlert(err.message));
}

// イベントリスナー設定
function setupEventListeners() {
    document.querySelectorAll('input[name="connectionMode"]').forEach(r => 
        r.addEventListener('change', handleConnectionModeChange));
    document.querySelectorAll('input[name="connectionType"]').forEach(r => 
        r.addEventListener('change', handleConnectionTypeChange));
}

// 接続モード変更
function handleConnectionModeChange(e) {
    const manualSection = document.querySelector("#manual-connection-section");
    if (e.target.value === 'manual') show(manualSection);
    else { hide(manualSection); if (cachedApiInfo) applyIspAutoConfig(cachedApiInfo); }
}

// 接続タイプ変更
function handleConnectionTypeChange(e) {
    hide("#pppoe-section"); hide("#dslite-section"); hide("#mape-section");
    if (e.target.value === 'pppoe') show("#pppoe-section");
    else if (e.target.value === 'dslite') show("#dslite-section");
    else if (e.target.value === 'mape') show("#mape-section");
}

// ISP情報取得・表示
let cachedApiInfo = null;
function fetchAndDisplayIspInfo() {
    if (!config?.auto_config_api_url) return;
    fetch(config.auto_config_api_url)
        .then(r => r.json())
        .then(apiInfo => { cachedApiInfo = apiInfo; displayIspInfo(apiInfo); })
        .catch(err => console.error(err));
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

    applyIspAutoConfig(apiInfo);
}

function applyIspAutoConfig(apiInfo) {
    if (!apiInfo) return;
    if (apiInfo.country) document.querySelector("#aios-country")?.value || (document.querySelector("#aios-country").value = apiInfo.country);
    if (apiInfo.mape?.brIpv6Address) {
        const mapeInputs = { 'mape-br': apiInfo.mape.brIpv6Address, 'mape-ealen': apiInfo.mape.eaBitLength };
        Object.entries(mapeInputs).forEach(([id, val]) => document.querySelector(`#${id}`)?.value || (document.querySelector(`#${id}`).value = val));
    }
    if (apiInfo.aftr) document.querySelector("#dslite-aftr-address")?.value || (document.querySelector("#dslite-aftr-address").value = apiInfo.aftr);
}

// ヘルパー
function show(el) { const e = typeof el === 'string' ? document.querySelector(el) : el; if (e) e.classList.remove('hide'); }
function hide(el) { const e = typeof el === 'string' ? document.querySelector(el) : el; if (e) e.classList.add('hide'); }
function setValue(selector, val) { const el = document.querySelector(selector); if (el) el.value = val; }

// DOMContentLoaded で初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => fetchAndDisplayIspInfo());
} else fetchAndDisplayIspInfo();
