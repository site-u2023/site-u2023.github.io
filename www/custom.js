// custom.js - OpenWrt カスタム機能 完全版

console.log('custom.js loaded');

// ===== グローバル変数 =====
let cachedApiInfo = null;
let originalBuildAsuRequest = null;
let originalUpdateImages = null; // 使わない（再フック廃止）
let originalSetupUciDefaults = null;
let hasCustomHtmlLoaded = false;
let hasIspInfoRendered = false;
let hasCustomUIInitialized = false;
let isCustomHtmlLoading = false;

// 既存の show/hide を退避（index.js の実装に委譲する）
const ofsShow = window.show;
const ofsHide = window.hide;

// ==================== updateImages フック ====================
const _originalUpdateImages = window.updateImages;
window.updateImages = function(version, mobj) {
    if (_originalUpdateImages) _originalUpdateImages(version, mobj);
    loadCustomHTML(); // フック描画（排他制御あり）
    if (mobj && !hasIspInfoRendered) {
        fetchAndDisplayIspInfo();
    }
};

// ==================== custom.html 読み込み ====================
async function loadCustomHTML() {
    if (hasCustomHtmlLoaded || isCustomHtmlLoading) return; // 1回だけ（ロード中も抑止）
    try {
        isCustomHtmlLoading = true;

        const res = await fetch('custom.html');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const temp = document.createElement('div');
        temp.innerHTML = html;

        // ASUセクションの書き換え
        const asuDetails = document.querySelector('#asu');
        if (asuDetails) {
            const summaryText = asuDetails.querySelector('summary span')?.innerText || '';
            asuDetails.innerHTML = `<summary><span class="tr-customize">${summaryText}</span></summary>`;

            const customPackages = temp.querySelector('#custom-packages-section details');
            if (customPackages) asuDetails.appendChild(customPackages.cloneNode(true));

            const customScripts = temp.querySelector('#custom-scripts-section details');
            if (customScripts) asuDetails.appendChild(customScripts.cloneNode(true));

            asuDetails.insertAdjacentHTML('beforeend', `
                <br>
                <div id="asu-buildstatus" class="hide"><span></span></div>
                <a href="javascript:buildAsuRequest()" class="custom-link">
                    <span></span><span class="tr-request-build">REQUEST BUILD</span>
                </a>
            `);
        }

        // Extended info
        const extendedInfo = temp.querySelector('#extended-build-info');
        const imageLink = document.querySelector('#image-link');
        if (extendedInfo && imageLink) {
            const parent = imageLink.closest('.row');
            const oldExtended = parent.querySelector('#extended-build-info');
            if (oldExtended) oldExtended.remove();
            parent.insertAdjacentElement('afterend', extendedInfo.cloneNode(true));
        }

        initCustomFeatures();
        hasCustomHtmlLoaded = true;

    } catch (err) {
        console.error('Failed to load custom.html:', err);
    } finally {
        isCustomHtmlLoading = false;
    }
}

// ==================== カスタム機能初期化 ====================
function initCustomFeatures() {
    if (hasCustomUIInitialized) return; // 多重初期化防止

    if (typeof buildAsuRequest === 'function' && !originalBuildAsuRequest) {
        originalBuildAsuRequest = buildAsuRequest;
        window.buildAsuRequest = customBuildAsuRequest;
    }
    // updateImages は先頭で一度だけフック済み。ここでは再フックしない。
    if (typeof setup_uci_defaults === 'function' && !originalSetupUciDefaults) {
        originalSetupUciDefaults = setup_uci_defaults;
        window.setup_uci_defaults = customSetupUciDefaults;
    }

    initializeCustomUI(true);
    hasCustomUIInitialized = true;
}

// ==================== buildAsuRequest カスタム版 ====================
function customBuildAsuRequest(request_hash) {
    console.log('customBuildAsuRequest called', request_hash);
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
        return originalFetch(url, options).then(response => {
            if ([200,400,422,500].includes(response.status)) {
                response.clone().json().then(mobj => {
                    if ("stderr" in mobj) initializeCustomUI(response.status !== 200);
                }).catch(() => {}); // JSON でない応答に備える
            }
            return response;
        });
    };
    if (originalBuildAsuRequest) originalBuildAsuRequest(request_hash);
    window.fetch = originalFetch;
}

// ==================== setup_uci_defaults カスタム版 ====================
function customSetupUciDefaults() {
    const textarea = document.querySelector("#uci-defaults-content");
    if (!textarea) return console.warn('#uci-defaults-content not found');
    if (!config?.uci_defaults_setup_url) return console.warn('config.uci_defaults_setup_url not defined');

    fetch(config.uci_defaults_setup_url)
        .then(obj => {
            if (obj.status !== 200) throw new Error(`Failed to fetch ${obj.url}`);
            hideAlert();
            return obj.text();
        })
        .then(text => textarea.value = text)
        .catch(err => showAlert(err.message));
}

// ==================== UI初期化 ====================
function initializeCustomUI(open = true) {
    document.querySelectorAll('input[name="connectionMode"]').forEach(radio =>
        radio.addEventListener('change', handleConnectionModeChange)
    );
    document.querySelectorAll('input[name="connectionType"]').forEach(radio =>
        radio.addEventListener('change', handleConnectionTypeChange)
    );

    const asuSection = document.querySelector("#asu");
    if (asuSection) {
        asuSection.classList.remove("hide");
        asuSection.querySelectorAll('details').forEach(d => open ? d.setAttribute('open','') : d.removeAttribute('open'));
    }
}

// ==================== ISP情報取得 ====================
function fetchAndDisplayIspInfo() {
    if (hasIspInfoRendered) return;
    if (!config?.auto_config_api_url) return console.warn('config.auto_config_api_url not defined');

    fetch(config.auto_config_api_url)
        .then(res => res.json())
        .then(apiInfo => {
            cachedApiInfo = apiInfo;
            displayIspInfo(apiInfo);
            hasIspInfoRendered = true;
        })
        .catch(err => console.error('Failed to fetch ISP info:', err));
}

function displayIspInfo(apiInfo) {
    if (!apiInfo) return;
    const ips = [apiInfo.ipv4, apiInfo.ipv6].filter(Boolean).join(' / ');
    const method = apiInfo.mape?.brIpv6Address ? 'MAP-E' : apiInfo.aftr ? 'DS-Lite' : 'DHCP/PPPoE';

    const map = {
        "#auto-config-country": apiInfo.country,
        "#auto-config-timezone": apiInfo.timezone,
        "#auto-config-zonename": apiInfo.zonename,
        "#auto-config-isp": apiInfo.isp,
        "#auto-config-as": apiInfo.as,
        "#auto-config-ip": ips,
        "#auto-config-method": method,
        "#auto-config-notice": apiInfo.notice
    };

    Object.entries(map).forEach(([sel,val]) => {
        const el = document.querySelector(sel);
        if(el) el.textContent = val || "Unknown";
    });

    applyIspAutoConfig(apiInfo);
}

// ==================== ISP自動設定 ====================
function applyIspAutoConfig(apiInfo) {
    if (!apiInfo) return;

    if (apiInfo.country) {
        const el = document.querySelector("#aios-country");
        if (el && !el.value) el.value = apiInfo.country;
    }

    if (apiInfo.mape?.brIpv6Address) {
        const mapeMap = {
            'mape-br': apiInfo.mape.brIpv6Address,
            'mape-ealen': apiInfo.mape.eaBitLength
        };
        Object.entries(mapeMap).forEach(([id, val]) => {
            const input = document.querySelector(`#${id}`);
            if (input && !input.value && val) input.value = val;
        });
    }

    if (apiInfo.aftr) {
        const el = document.querySelector("#dslite-aftr-address");
        if (el && !el.value) el.value = apiInfo.aftr;
    }
}

// ==================== 変更イベント ====================
function handleConnectionModeChange(e) {
    const manualSection = document.querySelector("#manual-connection-section");
    if (e.target.value === 'manual') show(manualSection);
    else { hide(manualSection); if (cachedApiInfo) applyIspAutoConfig(cachedApiInfo); }
}

function handleConnectionTypeChange(e) {
    hide("#pppoe-section"); hide("#dslite-section"); hide("#mape-section");
    switch(e.target.value) {
        case 'pppoe': show("#pppoe-section"); break;
        case 'dslite': show("#dslite-section"); break;
        case 'mape': show("#mape-section"); break;
    }
}

// ==================== DOMContentLoaded 初期化 ====================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCustomFeatures, { once: true });
} else {
    initCustomFeatures();
}

// ==================== ヘルパー ====================
function show(sel) {
    if (typeof ofsShow === 'function') return ofsShow(sel);
    const el = typeof sel==='string'?document.querySelector(sel):sel; if(el) el.style.display='block';
}
function hide(sel) {
    if (typeof ofsHide === 'function') return ofsHide(sel);
    const el = typeof sel==='string'?document.querySelector(sel):sel; if(el) el.style.display='none';
}
