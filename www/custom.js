// custom.js - OpenWrt カスタム機能

// ===== HTML読み込み処理 =====
document.addEventListener('DOMContentLoaded', async function() {
  try {
    const response = await fetch('custom.html');
    const html = await response.text();
    
    // 一時コンテナに読み込み
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    // 各セクションを適切な場所に挿入
    // （適切な挿入位置の処理 - 後で実装）
    
    // カスタム機能の初期化
    initCustomFeatures();
  } catch (error) {
    console.error('Failed to load custom.html:', error);
  }
});

// ===== グローバル変数 =====
let cachedApiInfo = null;
let originalBuildAsuRequest = null;
let originalUpdateImages = null;
let originalSetupUciDefaults = null;

// カスタム機能の初期化
function initCustomFeatures() {
  // オリジナル関数を保存してフック
  if (typeof buildAsuRequest === 'function' && !originalBuildAsuRequest) {
    originalBuildAsuRequest = buildAsuRequest;
    window.buildAsuRequest = customBuildAsuRequest;
  }
  
  if (typeof updateImages === 'function' && !originalUpdateImages) {
    originalUpdateImages = updateImages;
    window.updateImages = customUpdateImages;
  }
  
  if (typeof setup_uci_defaults === 'function' && !originalSetupUciDefaults) {
    originalSetupUciDefaults = setup_uci_defaults;
    window.setup_uci_defaults = customSetupUciDefaults;
  }
}

// buildAsuRequestのカスタム版
function customBuildAsuRequest(request_hash) {
  // オリジナルを実行する前にフェッチとステータス処理をフック
  const originalFetch = window.fetch;
  window.fetch = function(url, options) {
    return originalFetch(url, options).then(response => {
      if (response.status === 200 || response.status === 500 || response.status === 400 || response.status === 422) {
        response.clone().json().then(mobj => {
          if ("stderr" in mobj) {
            // エラーの場合は開く、成功の場合は閉じる
            initializeCustomFeatures(response.status !== 200);
          }
        });
      }
      return response;
    });
  };
  
  // オリジナル関数を実行
  originalBuildAsuRequest(request_hash);
  
  // フェッチを元に戻す
  window.fetch = originalFetch;
}

// updateImagesのカスタム版
function customUpdateImages(version, mobj) {
  // オリジナル関数を実行
  originalUpdateImages(version, mobj);
  
  // カスタム処理を追加
  if (mobj) {
    // Fetch and display ISP info
    fetchAndDisplayIspInfo();
  }
}

// updateImagesのカスタム版
function customUpdateImages(version, mobj) {
  // オリジナル関数を実行
  originalUpdateImages(version, mobj);
  
  // カスタム処理を追加
  if (mobj) {
    // Fetch and display ISP info
    fetchAndDisplayIspInfo();
  }
}

// setup_uci_defaultsのカスタム版  
function customSetupUciDefaults() {
  let textarea = document.querySelector("#uci-defaults-content");
  const link = config.uci_defaults_setup_url;
  
  fetch(link)
    .then((obj) => {
      if (obj.status != 200) {
        throw new Error(`Failed to fetch ${obj.url}`);
      }
      hideAlert();
      return obj.text();
    })
    .then((text) => {
      textarea.value = text;
    })
    .catch((err) => showAlert(err.message));
}

// UI要素の初期化（details要素の開閉制御）
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
    const detailsElements = asuSection.querySelectorAll('details');
    detailsElements.forEach(details => {
      if (open) {
        details.setAttribute('open', '');
      } else {
        details.removeAttribute('open');
      }
    });
  }
}

// ISP情報の取得と表示
function fetchAndDisplayIspInfo() {
  fetch(config.auto_config_api_url)
    .then(response => response.json())
    .then(apiInfo => {
      console.log("API response:", apiInfo);
      cachedApiInfo = apiInfo;
      if (apiInfo) {
        displayIspInfo(apiInfo);
      }
    })
    .catch(error => {
      console.error('Failed to fetch ISP info:', error);
    });
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
  if (apiInfo.mape && apiInfo.mape.brIpv6Address) {
    wanType = "MAP-E";
  } else if (apiInfo.aftr) {
    wanType = "DS-Lite";
  }
  setValue("#auto-config-method", wanType);
  setValue("#auto-config-notice", apiInfo.notice || "");
  
  show("#extended-build-info");
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
  
  if (apiInfo.mape && apiInfo.mape.brIpv6Address) {
    const mapeInputs = {
      'mape-br': apiInfo.mape.brIpv6Address,
      'mape-ealen': apiInfo.mape.eaBitLength
    };
    
    for (const [id, value] of Object.entries(mapeInputs)) {
      const input = document.querySelector(`#${id}`);
      if (input && !input.value && value) {
        input.value = value;
      }
    }
  }
  
  if (apiInfo.aftr) {
    const aftrInput = document.querySelector("#dslite-aftr-address");
    if (aftrInput && !aftrInput.value) {
      aftrInput.value = apiInfo.aftr;
    }
  }
}

function handleConnectionModeChange(e) {
  const manualSection = document.querySelector("#manual-connection-section");
  if (e.target.value === 'manual') {
    show(manualSection);
  } else {
    hide(manualSection);
    if (cachedApiInfo) {
      applyIspAutoConfig(cachedApiInfo);
    }
  }
}

function handleConnectionTypeChange(e) {
  hide("#pppoe-section");
  hide("#dslite-section");
  hide("#mape-section");
  
  switch(e.target.value) {
    case 'pppoe':
      show("#pppoe-section");
      break;
    case 'dslite':
      show("#dslite-section");
      break;
    case 'mape':
      show("#mape-section");
      break;
  }
}

// 初期化をDOMContentLoaded時に実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCustomFeatures);
} else {
  initCustomFeatures();
}
