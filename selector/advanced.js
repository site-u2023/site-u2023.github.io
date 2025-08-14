/* Minimal expansion functionality - direct port from build/index.html */

let packageSelectorLoaded = false;
let scriptEditorLoaded = false;

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
    let html = '<div id="package-categories">';
    
    packageData.categories.forEach(category => {
        html += `<div class="package-category">`;
        html += `<h6>${category.name}</h6>`;
        html += '<div class="package-grid">';
        
        category.packages.forEach(pkg => {
            if (!pkg.hidden) {
                html += `<div class="package-item">`;
                html += `<div class="form-check">`;
                html += `<input class="form-check-input package-selector-checkbox" type="checkbox" id="pkg-${pkg.id}" data-package="${pkg.name}">`;
                html += `<label class="form-check-label" for="pkg-${pkg.id}">`;
                html += `<a href="${pkg.url}" target="_blank" class="package-link">${pkg.name}</a>`;
                html += `</label></div></div>`;
            }
        });
        
        html += '</div></div>';
    });
    
    html += '</div>';
    container.innerHTML = html;
    
    container.querySelectorAll('.package-selector-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updatePackageList);
    });
}

function updatePackageList() {
    const checkboxes = document.querySelectorAll('.package-selector-checkbox:checked');
    const newPackages = Array.from(checkboxes).map(cb => cb.getAttribute('data-package'));
    const textarea = document.getElementById('asu-packages');
    
    if (textarea) {
        // 既存パッケージを保持して追加
        const existingPackages = textarea.value.trim().split(/\s+/).filter(p => p);
        const allPackages = [...new Set([...existingPackages, ...newPackages])];
        textarea.value = allPackages.join(' ');
    }
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
