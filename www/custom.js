// custom.js - OpenWrt カスタム機能（修正版）

console.log('custom.js loaded');

// updateImages をフックして、処理後に custom.html を差し込む
const originalUpdateImages = window.updateImages;

window.updateImages = function(version, mobj) {
  if (originalUpdateImages) {
    originalUpdateImages(version, mobj);
  }
  console.log("updateImages finished, now load custom.html");
  loadCustomHTML();
};

// HTML読み込み処理
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

      const customPackages = temp.querySelector('#custom-packages-section');
      if (customPackages) {
        const details = customPackages.querySelector('details');
        if (details) asuDetails.appendChild(details);
      }

      const customScripts = temp.querySelector('#custom-scripts-section');
      if (customScripts) {
        const details = customScripts.querySelector('details');
        if (details) asuDetails.appendChild(details);
      }

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
      imageLink.closest('.row')?.insertAdjacentElement('afterend', extendedInfo);
      show('#extended-build-info');
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

// カスタム機能の初期化
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
}

// buildAsuRequestのカスタム版
function customBuildAsuRequest(request_hash) {
  console.log('customBuildAsuRequest called with:', request_hash);

  const originalFetch = window.fetch;
  window.fetch = function(url, options) {
    return originalFetch(url, options).then(response => {
      if ([200, 400, 422, 500].includes(response.status)) {
        response.clone().json().then(mobj => {
          if ("stderr" in mobj) {
            initializeCustomFeatures(response.status !== 200);
          }
        });
      }
      return response;
    });
  };

  if (originalBuildAsuRequest) originalBuildAsuRequest(request_hash);

  window.fetch = originalFetch;
}

// updateImagesのカスタム版
function customUpdateImages(version, mobj) {
  console.log('customUpdateImages called with:', version, mobj);

  if (originalUpdateImages) originalUpdateImages(version, mobj);

  if (mobj) fetchAndDisplayIspInfo();
}

// setup_uci_defaultsのカスタム版
function customSetupUciDefaults() {
  console.log('customSetupUciDefaults called');

  const textarea = document.querySelector("#uci-defaults-content");
  if (!textarea) return;

  if (!config?.uci_defaults_setup_url) return;

  fetch(config.uci_defaults_setup_url)
    .then(resp => {
      if (resp.status !== 200) throw new Error(`Failed to fetch ${resp.url}`);
      hideAlert();
      return resp.text();
    })
    .then(text => textarea.value = text)
    .catch(err => showAlert(err.message));
}

// UI初期化
function initializeCustomFeatures(open = true) {
  document.querySelectorAll('input[name="connectionMode"]').forEach(r => {
    r.addEventListener('change', handleConnectionModeChange);
  });
  document.querySelectorAll('input[name="connectionType"]').forEach(r => {
    r.addEventListener('change', handleConnectionTypeChange);
  });

  const asuSection = document.querySelector("#asu");
  if (asuSection) {
    asuSection.classList.remove("hide");
    asuSection.querySelectorAll('details').forEach(d => {
      if (open) d.setAttribute('open', '');
      else d.removeAttribute('open');
    });
  }
}

// ISP情報取得・表示
function fetchAndDisplayIspInfo() {
  if (!config?.auto_config_api_url) return;

  fetch(config.auto_config_api_url)
    .then(resp => resp.json())
    .then(apiInfo => {
      cachedApiInfo = apiInfo;
      if (apiInfo) displayIspInfo(apiInfo);
    })
    .catch(err => console.error(err));
}

function displayIspInfo(apiInfo) {
  if (!apiInfo) return;

  setValue("#auto-config-country", apiInfo.country || "Unknown");
  setValue("#auto-config-timezone", apiInfo.timezone || "Unknown");
  setValue("#auto-config-zonename", apiInfo.zonename || "Unknown");
  setValue("#auto-config-isp", apiInfo.isp || "Unknown");
  setValue("#auto-config-as", apiInfo.as || "Unknown");

  const ips = [];
  if (apiInfo.ipv4) ips.push(apiInfo.ipv4);
  if (apiInfo.ipv6) ips.push(apiInfo.ipv6);
  setValue("#auto-config-ip", ips.join(" / ") || "Unknown");

  let wanType = "DHCP/PPPoE";
  if (apiInfo.mape?.brIpv6Address) wanType = "MAP-E";
  else if (apiInfo.aftr) wanType = "DS-Lite";
  setValue("#auto-config-method", wanType);

  show("#extended-build-info");

  // 値を安全にセット
  if (apiInfo.country) {
    const countryInput = document.querySelector("#aios-country");
    if (countryInput && !countryInput.value) countryInput.value = apiInfo.country;
  }

  if (apiInfo.mape?.brIpv6Address) {
    const brInput = document.querySelector("#mape-br");
    if (brInput && !brInput.value) brInput.value = apiInfo.mape.brIpv6Address;
    const eaInput = document.querySelector("#mape-ealen");
    if (eaInput && !eaInput.value) eaInput.value = apiInfo.mape.eaBitLength;
  }

  if (apiInfo.aftr) {
    const aftrInput = document.querySelector("#dslite-aftr-address");
    if (aftrInput && !aftrInput.value) aftrInput.value = apiInfo.aftr;
  }
}

function handleConnectionModeChange(e) {
  const manualSection = document.querySelector("#manual-connection-section");
  if (e.target.value === 'manual') show(manualSection);
  else {
    hide(manualSection);
    if (cachedApiInfo) applyIspAutoConfig(cachedApiInfo);
  }
}

function handleConnectionTypeChange(e) {
  hide("#pppoe-section");
  hide("#dslite-section");
  hide("#mape-section");

  switch(e.target.value) {
    case 'pppoe': show("#pppoe-section"); break;
    case 'dslite': show("#dslite-section"); break;
    case 'mape': show("#mape-section"); break;
  }
}

// DOMContentLoaded時に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCustomFeatures);
} else {
  initCustomFeatures();
}
