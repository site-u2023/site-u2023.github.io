/* Minimal expansion functionality - direct port from build/index.html */

let packageSelectorLoaded = false;
let scriptEditorLoaded = false;

let ADV_PKG_INDEX = { byId: {}, byName: {} };
let ADV_DEP_REFCOUNT = Object.create(null);

function advParseTokens(str) {
  return String(str || '')
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function advBuildPackageIndex(packageData) {
  ADV_PKG_INDEX = { byId: {}, byName: {} };
  (packageData.categories || []).forEach(cat => {
    (cat.packages || []).forEach(pkg => {
      ADV_PKG_INDEX.byId[pkg.id] = pkg;
      ADV_PKG_INDEX.byName[pkg.name] = pkg;
    });
  });
}

function advResolveDepNames(depIds) {
  const out = [];
  (depIds || []).forEach(id => {
    const dep = ADV_PKG_INDEX.byId[id];
    if (dep && dep.name) out.push(dep.name);
  });
  return out;
}

function advBumpDepCount(depIds, delta) {
  (depIds || []).forEach(id => {
    const cur = ADV_DEP_REFCOUNT[id] || 0;
    ADV_DEP_REFCOUNT[id] = Math.max(0, cur + delta);
  });
}

function advGetDepCheckbox(depId) {
  return document.querySelector(`#pkg-${depId}`);
}

function advHandleDependencyToggle(sourceCB) {
  const isChecked = !!sourceCB.checked;
  const depIds = advParseTokens(sourceCB.getAttribute('data-dependencies'));
  if (depIds.length) {
    advBumpDepCount(depIds, isChecked ? 1 : -1);
    depIds.forEach(depId => {
      const depCB = advGetDepCheckbox(depId);
      if (!depCB) return;
      if (isChecked) {
        depCB.checked = true;
      } else {
        const cnt = ADV_DEP_REFCOUNT[depId] || 0;
        if (cnt === 0) depCB.checked = false;
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        const allDetails = document.querySelectorAll('details');
        allDetails.forEach(details => {
            if (details.querySelector('#package-selector-content')) {
                details.addEventListener('toggle', function() {
                    if (this.open && !packageSelectorLoaded) {
                        loadPackageSelector();
                    }
                });
            }
            if (details.querySelector('#script-editor-content')) {
                details.addEventListener('toggle', function() {
                    if (this.open && !scriptEditorLoaded) {
                        loadScriptEditor();
                    }
                });
            }
        });
    }, 100);
});

async function loadPackageSelector() {
    const container = document.getElementById('package-selector-content');
    if (!container) return;
    
    try {
        const response = await fetch('https://raw.githubusercontent.com/site-u2023/site-u2023.github.io/main/selector/packages/packages.json');
        const packageData = await response.json();
        
        generatePackageCategories(container, packageData);
        packageSelectorLoaded = true;
    } catch (error) {
        container.innerHTML = '<p>Failed to load packages</p>';
    }
}

async function loadScriptEditor() {
    const container = document.getElementById('script-editor-content');
    if (!container) return;
    
    try {
        const response = await fetch('https://raw.githubusercontent.com/site-u2023/site-u2023.github.io/main/selector/uci-defaults/setup.sh');
        const template = await response.text();
        
        loadAiosConfig(container, template);
        scriptEditorLoaded = true;
    } catch (error) {
        container.innerHTML = '<p>Failed to load script</p>';
    }
}

function generatePackageCategories(container, packageData) {
    // 索引を先に構築
    advBuildPackageIndex(packageData);
    ADV_DEP_REFCOUNT = Object.create(null);

    let html = '<div id="package-categories">';

    packageData.categories.forEach(category => {
        html += `<div class="package-category">`;
        html += `<h6>${category.name}</h6>`;
        html += '<div class="package-grid">';

        // 依存として参照されるID集合（トップレベル重複を防ぐ用途）
        const depIdsAll = new Set();
        (category.packages || []).forEach(pkg => {
            (pkg.dependencies || []).forEach(d => depIdsAll.add(d));
        });

        (category.packages || []).forEach(pkg => {
            // トップレベルは hidden を描画しないポリシーは維持
            if (pkg.hidden) return;

            // 親行
            html += `<div class="package-item">`;
            html += `<div class="form-check">`;

            const depIds = pkg.dependencies || [];
            const depNames = advResolveDepNames(depIds);
            const depIdsAttr = depIds.join(' ');
            const depNamesAttr = depNames.join(' ');

            html += `<input class="form-check-input package-selector-checkbox" type="checkbox" id="pkg-${pkg.id}" data-id="${pkg.id}" data-package="${pkg.name}"`;
            if (depIds.length) {
                html += ` data-dependencies="${depIdsAttr}" data-dep-names="${depNamesAttr}"`;
            }
            html += `>`;

            html += `<label class="form-check-label" for="pkg-${pkg.id}">`;
            html += `<a href="${pkg.url}" target="_blank" class="package-link">${pkg.name}</a>`;
            html += `</label></div>`;

            // 子行（依存）
            if (depIds.length) {
                depIds.forEach(depId => {
                    const depPkg = ADV_PKG_INDEX.byId[depId];
                    const depName = depPkg?.name || depId;
                    const depUrl = depPkg?.url || '#';
                    const depHidden = !!depPkg?.hidden;

                    html += `<div class="package-dependent${depHidden ? ' package-hidden' : ''}">`;
                    html += `<input class="form-check-input package-selector-checkbox" type="checkbox" id="pkg-${depId}" data-id="${depId}" data-package="${depName}">`;
                    html += `<label class="form-check-label" for="pkg-${depId}">`;
                    if (depPkg) {
                        html += `<a href="${depUrl}" target="_blank" class="package-link">${depName}</a>`;
                    } else {
                        html += `${depName}`;
                    }
                    html += `</label>`;
                    html += `</div>`;
                });
            }

            html += `</div>`;
        });

        html += '</div></div>';
    });

    html += '</div>';
    container.innerHTML = html;

    // イベント: 依存伝搬 + パッケージリスト更新
    container.querySelectorAll('.package-selector-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function(e) {
            advHandleDependencyToggle(e.target);
            updatePackageList();
        });
    });
}

function advHandleDependencyToggle(sourceCB) {
    const isChecked = !!sourceCB.checked;
    const pkgId = sourceCB.getAttribute('data-id') || '';
    if (!pkgId) return;

    // 親 → 子（data-dependencies 属性保有時）
    const depIds = advParseTokens(sourceCB.getAttribute('data-dependencies'));
    if (depIds.length) {
        // 参照カウント更新
        advBumpDepCount(depIds, isChecked ? 1 : -1);

        depIds.forEach(depId => {
            const depCB = advGetDepCheckbox(depId);
            if (!depCB) return;

            if (isChecked) {
                // 親が増えた → 子を ON（カウントは既に加算済み）
                depCB.checked = true;
            } else {
                // 親が減った → カウント0なら子を OFF
                const cnt = ADV_DEP_REFCOUNT[depId] || 0;
                if (cnt === 0) depCB.checked = false;
            }
        });
    }

    // 子 → 親（ユーザーが子を直接操作した場合）
    // 親がこの子を依存に持っている場合、親は「子の状態に同期」しない。
    // 親は明示操作が優先のため、ここでは親の自動変更は行わない。
    // （親チェックで子はON、親解除で子は参照カウント0ならOFF。子単独ONは許容。）
}

function updatePackageList() {
    const textarea = document.getElementById('asu-packages');
    if (!textarea) return;

    // 現在の値を配列化
    let currentPackages = textarea.value.trim().split(/\s+/).filter(Boolean);

    // セレクタ管理下の全トークンを収集
    const selectorTokens = [];
    document.querySelectorAll('.package-selector-checkbox').forEach(cb => {
        String(cb.getAttribute('data-package') || '')
          .split(/[\s,]+/)
          .map(s => s.trim())
          .filter(Boolean)
          .forEach(t => selectorTokens.push(t));
    });

    // 入力欄からセレクタ管理のものを全削除
    const selectorSet = new Set(selectorTokens);
    currentPackages = currentPackages.filter(tok => !selectorSet.has(tok));

    // チェックされているものを追加
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        String(cb.getAttribute('data-package') || '')
          .split(/[\s,]+/)
          .map(s => s.trim())
          .filter(Boolean)
          .forEach(t => currentPackages.push(t));
    });

    // 重複排除して反映
    textarea.value = Array.from(new Set(currentPackages)).join(' ');
}

function loadAiosConfig(container, template) {
    const html = `
    <div class="aios-section">
        <h5>Basic Configuration</h5>
        <div class="form-row">
            <div class="form-group">
                <label for="aios-language">Language</label>
                <select id="aios-language" class="form-control">
                    <option value="en">English</option>
                    <option value="ja">日本語 (Japanese)</option>
                    <option value="zh-cn">简体中文 (Chinese Simplified)</option>
                    <option value="de">Deutsch (German)</option>
                    <option value="fr">Français (French)</option>
                </select>
            </div>
            <div class="form-group">
                <label for="aios-country">Country</label>
                <input type="text" id="aios-country" class="form-control" placeholder="US">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="aios-device-name">Device name</label>
                <input type="text" id="aios-device-name" class="form-control" placeholder="OpenWrt">
            </div>
            <div class="form-group">
                <label for="aios-lan-ip">LAN IP Address</label>
                <input type="text" id="aios-lan-ip" class="form-control" placeholder="192.168.1.1" value="192.168.1.1">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label for="aios-root-password">Root password</label>
                <input type="password" id="aios-root-password" class="form-control">
            </div>
            <div class="form-group">
                <label for="aios-wifi-ssid">Wi-Fi SSID</label>
                <input type="text" id="aios-wifi-ssid" class="form-control" placeholder="OpenWrt">
            </div>
        </div>
        <div class="form-group">
            <label for="aios-wifi-password">Wi-Fi password</label>
            <input type="password" id="aios-wifi-password" class="form-control" placeholder="8+ characters">
        </div>
    </div>`;
    
    container.innerHTML = html;
    
    // 言語変更時のパッケージ自動追加
    const languageSelect = container.querySelector('#aios-language');
    if (languageSelect) {
        languageSelect.addEventListener('change', function() {
            updateLanguagePackages(this.value);
            updateMainScript(template);
        });
    }
    
    container.addEventListener('input', function() {
        updateMainScript(template);
    });
}

function updateLanguagePackages(language) {
    const textarea = document.getElementById('asu-packages');
    if (!textarea) return;
    
    let packages = textarea.value.trim().split(/\s+/).filter(p => p);
    
    // 既存の言語パッケージを削除
    packages = packages.filter(p => !p.startsWith('luci-i18n-'));
    
    // 新しい言語パッケージを追加（英語以外）
    if (language && language !== 'en') {
        const langCode = language.replace('_', '-');
        packages.push(`luci-i18n-base-${langCode}`);
        packages.push(`luci-i18n-opkg-${langCode}`);
        packages.push(`luci-i18n-firewall-${langCode}`);
    }
    
    textarea.value = packages.join(' ');
}

function updateMainScript(template) {
    const textarea = document.getElementById('uci-defaults-content');
    if (!textarea) return;
    
    let script = template;
    
    // フォーム値を取得してスクリプトに反映
    const deviceName = document.getElementById('aios-device-name')?.value;
    const rootPassword = document.getElementById('aios-root-password')?.value;
    const lanIp = document.getElementById('aios-lan-ip')?.value;
    const language = document.getElementById('aios-language')?.value;
    const country = document.getElementById('aios-country')?.value;
    const wifiSSID = document.getElementById('aios-wifi-ssid')?.value;
    const wifiPassword = document.getElementById('aios-wifi-password')?.value;
    
    if (deviceName) script = updateScriptVariable(script, 'device_name', deviceName);
    if (rootPassword) script = updateScriptVariable(script, 'root_password', rootPassword);
    if (lanIp) script = updateScriptVariable(script, 'lan_ip_address', lanIp);
    if (language) script = updateScriptVariable(script, 'language', language);
    if (country) script = updateScriptVariable(script, 'country', country);
    if (wifiSSID) script = updateScriptVariable(script, 'wlan_name', wifiSSID);
    if (wifiPassword) script = updateScriptVariable(script, 'wlan_password', wifiPassword);
    
    textarea.value = script;
}

function updateScriptVariable(script, varName, value) {
    const regex = new RegExp(`^#\\s*${varName}="[^"]*"`, 'm');
    const replacement = `${varName}="${value}"`;
    
    if (script.match(regex)) {
        return script.replace(regex, replacement);
    } else {
        return script;
    }
}
