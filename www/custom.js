// custom.js - OpenWrt カスタム機能

console.log('custom.js loaded');

// init() の後に実行されるようにフック
window.addEventListener('load', function() {
  // init() 実行完了を待つ
  setTimeout(function() {
    console.log('Starting custom initialization...');
    loadCustomHTML();
  }, 100);
});

// HTML読み込み処理
async function loadCustomHTML() {
  try {
    const response = await fetch('custom.html');
    const html = await response.text();
    console.log('custom.html loaded');

    // 一時コンテナに読み込み
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // ASUセクションの中身を置き換え
    const asuDetails = document.querySelector('#asu');
    if (asuDetails) {
      const summaryText = asuDetails.querySelector('summary span').innerText;
      asuDetails.innerHTML = '';
      asuDetails.innerHTML = `<summary><span class="tr-customize">${summaryText}</span></summary>`;

      const customPackages = temp.querySelector('#custom-packages-section');
      if (customPackages) {
        asuDetails.appendChild(customPackages.querySelector('details'));
      }

      const customScripts = temp.querySelector('#custom-scripts-section');
      if (customScripts) {
        asuDetails.appendChild(customScripts.querySelector('details'));
      }

      asuDetails.insertAdjacentHTML('beforeend', `
        <br>
        <div id="asu-buildstatus" class="hide"><span></span></div>
        <a href="javascript:buildAsuRequest()" class="custom-link">
          <span></span><span class="tr-request-build">REQUEST BUILD</span>
        </a>
      `);
    }

    // Extended info を追加
    const extendedInfo = temp.querySelector('#extended-build-info');
    const imageLink = document.querySelector('#image-link');
    if (extendedInfo && imageLink) {
      imageLink.closest('.row').insertAdjacentElement('afterend', extendedInfo);
    }

    initCustomFeatures();

  } catch (error) {
    console.error('Failed to load custom.html:', error);
  }
}
  
  try {
    console.log('Attempting to fetch custom.html...');
    const response = await fetch('./custom.html');
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    console.log('custom.html loaded successfully, length:', html.length);
    
    // 一時コンテナに読み込み
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // 各セクションを適切な場所に挿入
    
    // 1. Extended Build Info を追加
    const extendedInfo = temp.querySelector('#extended-build-info');
    const imageLink = document.querySelector('#image-link');
    console.log('Extended info found:', !!extendedInfo, 'Image link found:', !!imageLink);
    
    if (extendedInfo && imageLink) {
      const targetRow = imageLink.closest('.row');
      if (targetRow) {
        targetRow.insertAdjacentElement('afterend', extendedInfo);
        console.log('Extended build info inserted');
      } else {
        console.warn('Could not find .row parent for image-link');
      }
    }

    // 2. ASUセクション内を完全に置き換え
    const asuDetails = document.querySelector('#asu');
    console.log('ASU section found:', !!asuDetails);
    
    if (asuDetails) {
        console.log('Replacing ASU section content...');
        
        // 既存の中身を全削除（summaryは残す）
        const summary = asuDetails.querySelector('summary');
        asuDetails.innerHTML = '';
        
        // summaryを戻す
        if (summary) {
            asuDetails.appendChild(summary);
        }
        
        // カスタムパッケージセクションを追加
        const customPackages = temp.querySelector('#custom-packages-section');
        if (customPackages) {
            const packagesDetails = customPackages.querySelector('details');
            if (packagesDetails) {
                asuDetails.appendChild(packagesDetails);
                console.log('Custom packages section added');
            }
        }
        
        // カスタムスクリプトセクションを追加
        const customScripts = temp.querySelector('#custom-scripts-section');
        if (customScripts) {
            const scriptsDetails = customScripts.querySelector('details');
            if (scriptsDetails) {
                asuDetails.appendChild(scriptsDetails);
                console.log('Custom scripts section added');
            }
        }
        
        // ビルドステータスとログを戻す
        const buildStatusHtml = `
            <br>
            <div id="asu-buildstatus" class="hide">
                <span></span>
                <div id="asu-log" class="hide">
                    <details>
                        <summary><code>STDERR</code></summary>
                        <pre id="asu-stderr"></pre>
                    </details>
                    <details>
                        <summary><code>STDOUT</code></summary>
                        <pre id="asu-stdout"></pre>
                    </details>
                </div>
            </div>
            <a href="javascript:buildAsuRequest()" class="custom-link">
                <span></span><span class="tr-request-build">REQUEST BUILD</span>
            </a>
        `;
        asuDetails.insertAdjacentHTML('beforeend', buildStatusHtml);
        console.log('Build status and log sections restored');
        
        // ASUセクションを表示
        asuDetails.classList.remove('hide');
        asuDetails.style.display = '';
    }

    // カスタム機能の初期化
    console.log('Initializing custom features...');
    initCustomFeatures();
    
  } catch (error) {
    console.error('Failed to load custom.html:', error);
    
    // フォールバック：最低限の初期化だけ実行
    console.log('Executing fallback initialization...');
    initCustomFeatures();
  }
});

// ===== グローバル変数 =====
let cachedApiInfo = null;
let originalBuildAsuRequest = null;
let originalUpdateImages = null;
let originalSetupUciDefaults = null;

// カスタム機能の初期化
function initCustomFeatures() {
  console.log('initCustomFeatures called');
  console.log('Available functions:', {
    buildAsuRequest: typeof buildAsuRequest,
    updateImages: typeof updateImages,
    setup_uci_defaults: typeof setup_uci_defaults
  });
  
  // オリジナル関数を保存してフック
  if (typeof buildAsuRequest === 'function' && !originalBuildAsuRequest) {
    originalBuildAsuRequest = buildAsuRequest;
    window.buildAsuRequest = customBuildAsuRequest;
    console.log('buildAsuRequest hooked');
  }
  
  if (typeof updateImages === 'function' && !originalUpdateImages) {
    originalUpdateImages = updateImages;
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
  if (originalBuildAsuRequest) {
    originalBuildAsuRequest(request_hash);
  } else {
    console.warn('Original buildAsuRequest not found');
  }
  
  // フェッチを元に戻す
  window.fetch = originalFetch;
}

// updateImagesのカスタム版
function customUpdateImages(version, mobj) {
  console.log('customUpdateImages called with:', version, mobj);
  
  // オリジナル関数を実行
  if (originalUpdateImages) {
    originalUpdateImages(version, mobj);
  }
  
  // カスタム処理を追加
  if (mobj) {
    // Fetch and display ISP info
    fetchAndDisplayIspInfo();
  }
}

// setup_uci_defaultsのカスタム版  
function customSetupUciDefaults() {
  console.log('customSetupUciDefaults called');
  
  let textarea = document.querySelector("#uci-defaults-content");
  if (!textarea) {
    console.warn('#uci-defaults-content not found');
    return;
  }
  
  if (!config || !config.uci_defaults_setup_url) {
    console.warn('config.uci_defaults_setup_url not defined');
    return;
  }
  
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
  console.log('initializeCustomFeatures called with open =', open);
  
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
    console.log('Found details elements:', detailsElements.length);
    
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
  console.log('fetchAndDisplayIspInfo called');
  
  if (!config || !config.auto_config_api_url) {
    console.warn('config.auto_config_api_url not defined');
    return;
  }
  
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
  
  console.log('displayIspInfo called with:', apiInfo);
  
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
  
  console.log('applyIspAutoConfig called with:', apiInfo);
  
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
