// custom.js - OpenWrt カスタム機能（null安全版）
console.log('custom.js loaded');

// 元の updateImages を保持
const originalUpdateImages = window.updateImages;

// updateImages をフック
window.updateImages = function(version, mobj) {
    if (typeof originalUpdateImages === 'function') {
        originalUpdateImages(version, mobj);
    }
    console.log("updateImages finished, now load custom.html");
    loadCustomHTML();
};

// custom.html 読み込み処理（null安全版）
async function loadCustomHTML() {
    try {
        const response = await fetch('custom.html');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        console.log('custom.html loaded');

        const temp = document.createElement('div');
        temp.innerHTML = html;

        const asuDetails = document.querySelector('#asu');
        if (asuDetails) {
            const summaryText = asuDetails.querySelector('summary span')?.innerText || '';
            asuDetails.innerHTML = `<summary><span class="tr-customize">${summaryText}</span></summary>`;

            const customPackages = temp.querySelector('#custom-packages-section details');
            if (customPackages) asuDetails.appendChild(customPackages);

            const customScripts = temp.querySelector('#custom-scripts-section details');
            if (customScripts) asuDetails.appendChild(customScripts);

            asuDetails.insertAdjacentHTML('beforeend', `
                <br>
                <div id="asu-buildstatus" class="hide"><span></span></div>
                <a href="javascript:buildAsuRequest()" class="custom-link">
                  <span></span><span class="tr-request-build">REQUEST BUILD</span>
                </a>
            `);
        }

        const extendedInfo = temp.querySelector('#extended-build-info');
        const imageLink = document.querySelector('#image-link');
        if (extendedInfo && imageLink) {
            const container = imageLink.closest('.row');
            if (container) container.insertAdjacentElement('afterend', extendedInfo);
            show?.('#extended-build-info');
        }

        initCustomFeatures();

    } catch (error) {
        console.error('Failed to load custom.html:', error);
    }
}

// ===== グローバル変数 =====
let cachedApiInfo = null;
let originalBuildAsuRequest = null;
let originalSetupUciDefaults = null;

// カスタム機能初期化
function initCustomFeatures() {
    console.log('initCustomFeatures called');

    if (typeof buildAsuRequest === 'function' && !originalBuildAsuRequest) {
        originalBuildAsuRequest = buildAsuRequest;
        window.buildAsuRequest = customBuildAsuRequest;
        console.log('buildAsuRequest hooked');
    }

    if (typeof updateImages === 'function' && !originalUpdateImages) {
        window.updateImages = customUpdateImages;
        console.log('updateImages hooked');
    }

    if (typeof setup_uci_defaults === 'function' && !originalSetupUciDefaults) {
        originalSetupUciDefaults = setup_uci_defaults;
        window.setup_uci_defaults = customSetupUciDefaults;
        console.log('setup_uci_defaults hooked');
    }

    initializeCustomFeatures();
}

// buildAsuRequest カスタム版
function customBuildAsuRequest(request_hash) {
    console.log('customBuildAsuRequest called with:', request_hash);

    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
        return originalFetch(url, options).then(response => {
            if ([200, 400, 422, 500].includes(response.status)) {
                response.clone().json().then(mobj => {
                    if (mobj?.stderr) {
                        initializeCustomFeatures(response.status !== 200);
                    }
                }).catch(()=>{});
            }
            return response;
        });
    };

    if (typeof originalBuildAsuRequest === 'function') originalBuildAsuRequest(request_hash);

    window.fetch = originalFetch;
}

// updateImages カスタム版
function customUpdateImages(version, mobj) {
    console.log('customUpdateImages called with:', version, mobj);
    if (typeof originalUpdateImages === 'function') originalUpdateImages(version, mobj);

    if (mobj) fetchAndDisplayIspInfo();
}

// setup_uci_defaults カスタム版
function customSetupUciDefaults() {
    console.log('customSetupUciDefaults called');

    const textarea = document.querySelector("#uci-defaults-content");
    if (!textarea || !config?.uci_defaults_setup_url) return;

    fetch(config.uci_defaults_setup_url)
        .then(res => {
            if (res.status !== 200) throw new Error(`Failed to fetch ${res.url}`);
            hideAlert?.();
            return res.text();
        })
        .then(text => textarea.value = text)
        .catch(err => showAlert?.(err.message));
}

// UI 初期化（details開閉・connectionMode/type制御）
function initializeCustomFeatures(open = true) {
    document.querySelectorAll('input[name="connectionMode"]').forEach(radio => {
        radio.addEventListener('change', handleConnectionModeChange);
    });

    document.querySelectorAll('input[name="connectionType"]').forEach(radio => {
        radio.addEventListener('change', handleConnectionTypeChange);
    });

    const asuSection = document.querySelector("#asu");
    if (asuSection) {
        asuSection.classList.remove("hide");
        asuSection.querySelectorAll('details').forEach(details => {
            if (open) details.setAttribute('open', '');
            else details.removeAttribute('open');
        });
    }
}

// ISP情報取得・表示
function fetchAndDisplayIspInfo() {
    if (!config?.auto_config_api_url) return;

    fetch(config.auto_config_api_url)
        .then(r => r.json())
        .then(apiInfo => {
            cachedApiInfo = apiInfo;
            if (apiInfo) displayIspInfo(apiInfo);
        }).catch(()=>{});
}

function displayIspInfo(apiInfo) {
    if (!apiInfo) return;

    setValue?.("#auto-config-country", apiInfo.country || "Unknown");
    setValue?.("#auto-config-timezone", apiInfo.timezone || "Unknown");
    setValue?.("#auto-config-zonename", apiInfo.zonename || "Unknown");
    setValue?.("#auto-config-isp", apiInfo.isp || "Unknown");
    setValue?.("#auto-config-as", apiInfo.as || "Unknown");

    const ips = [];
    if (apiInfo.ipv4) ips.push(apiInfo.ipv4);
    if (apiInfo.ipv6) ips.push(apiInfo.ipv6);
    setValue?.("#auto-config-ip", ips.join(" / ") || "Unknown");

    let wanType = "DHCP/PPPoE";
    if (apiInfo.mape?.brIpv6Address) wanType = "MAP-E";
    else if (apiInfo.aftr) wanType = "DS-Lite";

    setValue?.("#auto-config-method", wanType);
    setValue?.("#auto-config-notice", apiInfo.notice || "");

    show?.("#extended-build-info");
    applyIspAutoConfig(apiInfo);
}

function applyIspAutoConfig(apiInfo) {
    if (!apiInfo) return;

    const countryInput = document.querySelector("#aios-country");
    if (countryInput && !countryInput.value && apiInfo.country) countryInput.value = apiInfo.country;

    if (apiInfo.mape?.brIpv6Address) {
        const mapeInputs = {
            'mape-br': apiInfo.mape.brIpv6Address,
            'mape-ealen': apiInfo.mape.eaBitLength
        };
        for (const [id, value] of Object.entries(mapeInputs)) {
            const input = document.querySelector(`#${id}`);
            if (input && !input.value && value) input.value = value;
        }
    }

    if (apiInfo.aftr) {
        const aftrInput = document.querySelector("#dslite-aftr-address");
        if (aftrInput && !aftrInput.value) aftrInput.value = apiInfo.aftr;
    }
}

function handleConnectionModeChange(e) {
    const manualSection = document.querySelector("#manual-connection-section");
    if (e.target.value === 'manual') show?.(manualSection);
    else {
        hide?.(manualSection);
        if (cachedApiInfo) applyIspAutoConfig(cachedApiInfo);
    }
}

function handleConnectionTypeChange(e) {
    hide?.("#pppoe-section");
    hide?.("#dslite-section");
    hide?.("#mape-section");

    switch(e.target.value) {
        case 'pppoe': show?.("#pppoe-section"); break;
        case 'dslite': show?.("#dslite-section"); break;
        case 'mape': show?.("#mape-section"); break;
    }
}

// 初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCustomFeatures);
} else {
    initCustomFeatures();
}
