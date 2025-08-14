/* Advanced expansion functionality for OpenWrt Firmware Selector */

// 展開状態の管理
let packageSelectorLoaded = false;
let scriptEditorLoaded = false;

// 展開イベントの監視
document.addEventListener('DOMContentLoaded', function() {
    // 全てのdetails要素を監視
    document.querySelectorAll('details').forEach(details => {
        const packageContent = details.querySelector('#package-selector-content');
        const scriptContent = details.querySelector('#script-editor-content');
        
        if (packageContent) {
            // パッケージセレクターの展開監視
            details.addEventListener('toggle', function() {
                if (this.open && !packageSelectorLoaded) {
                    loadPackageSelector();
                }
            });
        }
        
        if (scriptContent) {
            // スクリプトエディターの展開監視
            details.addEventListener('toggle', function() {
                if (this.open && !scriptEditorLoaded) {
                    loadScriptEditor();
                }
            });
        }
    });
});

// パッケージセレクター読み込み
async function loadPackageSelector() {
    const container = document.getElementById('package-selector-content');
    if (!container) return;

    try {
        // GitHubの直接URLを使用
        const response = await fetch('https://raw.githubusercontent.com/site-u2023/site-u2023.github.io/main/selector/packages/packages.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const packageData = await response.json();

        // パッケージ選択UIを生成
        generatePackageSelectorUI(container, packageData);
        packageSelectorLoaded = true;

    } catch (error) {
        console.error('Failed to load packages:', error);
        container.innerHTML = '<p>Failed to load package data: ' + error.message + '</p>';
    }
}

// スクリプトエディター読み込み
async function loadScriptEditor() {
    const container = document.getElementById('script-editor-content');
    if (!container) return;

    try {
        // GitHubの直接URLを使用
        const response = await fetch('https://raw.githubusercontent.com/site-u2023/site-u2023.github.io/main/selector/uci-defaults/setup.sh');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const scriptTemplate = await response.text();

        // スクリプト編集UIを生成
        generateScriptEditorUI(container, scriptTemplate);
        scriptEditorLoaded = true;

    } catch (error) {
        console.error('Failed to load script template:', error);
        container.innerHTML = '<p>Failed to load script template: ' + error.message + '</p>';
    }
}

// パッケージ選択UI生成
function generatePackageSelectorUI(container, packageData) {
    let html = '<div class="package-selector-controls">';
    html += '<button onclick="selectAllPackages()">Select All</button>';
    html += '<button onclick="deselectAllPackages()">Deselect All</button>';
    html += '<input type="text" id="package-search" placeholder="Search packages..." onkeyup="filterPackages()">';
    html += '</div>';

    html += '<div class="package-categories">';

    packageData.categories.forEach(category => {
        html += `<div class="package-category" data-category-id="${category.id}">`;
        html += `<h6 class="category-header">${category.name}</h6>`;
        html += `<div class="category-description">${category.description}</div>`;
        html += '<div class="package-grid">';

        category.packages.forEach(pkg => {
            if (!pkg.hidden) {
                html += `<div class="package-item" data-package-id="${pkg.id}">`;
                html += '<div class="form-check">';
                html += `<input class="form-check-input package-checkbox" type="checkbox" id="pkg-${pkg.id}" data-package="${pkg.name}"`;
                if (pkg.dependencies) {
                    html += ` data-dependencies="${pkg.dependencies.join(',')}"`;
                }
                html += ' onchange="handlePackageChange(this)">';
                html += `<label class="form-check-label" for="pkg-${pkg.id}">`;
                html += `<a href="${pkg.url}" target="_blank" class="package-link">${pkg.name}</a>`;
                html += '</label>';
                html += '</div>';
                html += '</div>';
            }
        });

        html += '</div></div>';
    });

    html += '</div>';
    html += '<div class="selected-packages">';
    html += '<h6>Selected Packages:</h6>';
    html += '<div id="selected-packages-list"></div>';
    html += '<button onclick="applyPackageSelection()">Apply to Package List</button>';
    html += '</div>';

    container.innerHTML = html;
}

// スクリプト編集UI生成
function generateScriptEditorUI(container, scriptTemplate) {
    let html = '<div class="script-editor-controls">';
    html += '<button onclick="loadBasicTemplate()">Basic Template</button>';
    html += '<button onclick="loadAdvancedTemplate()">Advanced Template</button>';
    html += '<button onclick="clearScript()">Clear</button>';
    html += '</div>';

    html += '<div class="quick-settings">';
    html += '<h6>Quick Settings:</h6>';
    html += '<div class="settings-grid">';
    html += '<label>Device Name: <input type="text" id="quick-device-name" placeholder="OpenWrt"></label>';
    html += '<label>Root Password: <input type="password" id="quick-root-password" placeholder="Password"></label>';
    html += '<label>LAN IP: <input type="text" id="quick-lan-ip" placeholder="192.168.1.1"></label>';
    html += '<label>WiFi Name: <input type="text" id="quick-wifi-name" placeholder="OpenWrt"></label>';
    html += '<label>WiFi Password: <input type="password" id="quick-wifi-password" placeholder="Min 8 chars"></label>';
    html += '</div>';
    html += '<button onclick="applyQuickSettings()">Apply Quick Settings</button>';
    html += '</div>';

    html += '<div class="script-editor">';
    html += '<h6>Script Editor:</h6>';
    html += `<textarea id="advanced-script-content" rows="15">${scriptTemplate}</textarea>`;
    html += '<button onclick="applyScriptToMain()">Apply to Main Script</button>';
    html += '</div>';

    container.innerHTML = html;
}

// パッケージ選択変更ハンドラー
function handlePackageChange(checkbox) {
    const packageName = checkbox.getAttribute('data-package');
    const dependencies = checkbox.getAttribute('data-dependencies');
    
    if (checkbox.checked && dependencies) {
        // 依存パッケージも選択
        dependencies.split(',').forEach(dep => {
            const depCheckbox = document.getElementById(`pkg-${dep.trim()}`);
            if (depCheckbox) {
                depCheckbox.checked = true;
            }
        });
    }
    
    updateSelectedPackagesList();
}

// 選択パッケージリスト更新
function updateSelectedPackagesList() {
    const checkboxes = document.querySelectorAll('.package-checkbox:checked');
    const selectedPackages = Array.from(checkboxes).map(cb => cb.getAttribute('data-package'));
    
    const listElement = document.getElementById('selected-packages-list');
    if (listElement) {
        listElement.textContent = selectedPackages.join(' ');
    }
}

// パッケージ検索
function filterPackages() {
    const searchTerm = document.getElementById('package-search').value.toLowerCase();
    const categories = document.querySelectorAll('.package-category');
    
    categories.forEach(category => {
        let hasVisiblePackages = false;
        const packages = category.querySelectorAll('.package-item');
        
        packages.forEach(packageItem => {
            const packageName = packageItem.querySelector('.package-link').textContent.toLowerCase();
            const isVisible = packageName.includes(searchTerm);
            packageItem.style.display = isVisible ? 'block' : 'none';
            if (isVisible) hasVisiblePackages = true;
        });
        
        category.style.display = hasVisiblePackages ? 'block' : 'none';
    });
}

// 全選択/全解除
function selectAllPackages() {
    document.querySelectorAll('.package-checkbox').forEach(cb => {
        cb.checked = true;
    });
    updateSelectedPackagesList();
}

function deselectAllPackages() {
    document.querySelectorAll('.package-checkbox').forEach(cb => {
        cb.checked = false;
    });
    updateSelectedPackagesList();
}

// パッケージ選択をメインに適用
function applyPackageSelection() {
    const selectedPackages = document.getElementById('selected-packages-list').textContent;
    const mainTextarea = document.getElementById('asu-packages');
    if (mainTextarea && selectedPackages) {
        mainTextarea.value = selectedPackages;
        alert('Package selection applied to main list!');
    }
}

// スクリプトテンプレート読み込み
function loadBasicTemplate() {
    const basicTemplate = `#!/bin/sh

# Basic OpenWrt setup script
echo "Starting basic configuration..."

# Configure root password
if [ -n "$root_password" ]; then
    echo "Setting root password..."
    (echo "$root_password"; sleep 1; echo "$root_password") | passwd > /dev/null
fi

# Configure device name
if [ -n "$device_name" ]; then
    echo "Setting device name: $device_name"
    uci set system.@system[0].hostname="$device_name"
fi

# Configure LAN IP
if [ -n "$lan_ip_address" ]; then
    echo "Setting LAN IP: $lan_ip_address"
    uci set network.lan.ipaddr="$lan_ip_address"
fi

# Configure WLAN
if [ -n "$wlan_name" ] && [ -n "$wlan_password" ]; then
    echo "Configuring WLAN: $wlan_name"
    uci set wireless.@wifi-device[0].disabled='0'
    uci set wireless.@wifi-iface[0].disabled='0'
    uci set wireless.@wifi-iface[0].encryption='sae-mixed'
    uci set wireless.@wifi-iface[0].ssid="$wlan_name"
    uci set wireless.@wifi-iface[0].key="$wlan_password"
fi

# Commit changes
uci commit

echo "Basic configuration completed!"`;

    const textarea = document.getElementById('advanced-script-content');
    if (textarea) {
        textarea.value = basicTemplate;
    }
}

function loadAdvancedTemplate() {
    // 既に読み込まれているsetup.shの内容を使用
    loadScriptEditor();
}

function clearScript() {
    const textarea = document.getElementById('advanced-script-content');
    if (textarea) {
        textarea.value = '';
    }
}

// クイック設定適用
function applyQuickSettings() {
    const deviceName = document.getElementById('quick-device-name').value;
    const rootPassword = document.getElementById('quick-root-password').value;
    const lanIp = document.getElementById('quick-lan-ip').value;
    const wifiName = document.getElementById('quick-wifi-name').value;
    const wifiPassword = document.getElementById('quick-wifi-password').value;
    
    let script = document.getElementById('advanced-script-content').value;
    
    // 変数を更新
    if (deviceName) script = updateScriptVariable(script, 'device_name', deviceName);
    if (rootPassword) script = updateScriptVariable(script, 'root_password', rootPassword);
    if (lanIp) script = updateScriptVariable(script, 'lan_ip_address', lanIp);
    if (wifiName) script = updateScriptVariable(script, 'wlan_name', wifiName);
    if (wifiPassword) script = updateScriptVariable(script, 'wlan_password', wifiPassword);
    
    document.getElementById('advanced-script-content').value = script;
}

// スクリプト変数更新
function updateScriptVariable(script, varName, value) {
    const regex = new RegExp(`^#?\\s*${varName}="[^"]*"`, 'm');
    const replacement = `${varName}="${value}"`;
    
    if (script.match(regex)) {
        return script.replace(regex, replacement);
    } else {
        // 変数が存在しない場合は先頭に追加
        return `${varName}="${value}"\n${script}`;
    }
}

// スクリプトをメインに適用
function applyScriptToMain() {
    const script = document.getElementById('advanced-script-content').value;
    const mainTextarea = document.getElementById('uci-defaults-content');
    if (mainTextarea && script) {
        mainTextarea.value = script;
        alert('Script applied to main editor!');
    }
}
