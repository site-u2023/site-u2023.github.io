/* Minimal expansion functionality - direct port from build/index.html */

let packageSelectorLoaded = false;
let scriptEditorLoaded = false;

document.addEventListener('DOMContentLoaded', function() {
    // Find details elements by their content divs
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
        
        // Use existing generatePackageSelector from build/index.html
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
        
        // Load the existing form from build/index.html
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
    
    // Add event listeners
    container.querySelectorAll('.package-selector-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updatePackageList);
    });
}

function updatePackageList() {
    const checkboxes = document.querySelectorAll('.package-selector-checkbox:checked');
    const packages = Array.from(checkboxes).map(cb => cb.getAttribute('data-package'));
    const textarea = document.getElementById('asu-packages');
    if (textarea) {
        textarea.value = packages.join(' ');
    }
}

function loadAiosConfig(container, template) {
    // Load the exact aios-config from build/index.html
    const html = `
    <div class="aios-config">
        <h5>Basic Configuration</h5>
        <div class="form-row">
            <div class="form-group">
                <label for="aios-language">Language</label>
                <select id="aios-language" class="form-control">
                    <option value="en">English</option>
                    <option value="ja">日本語 (Japanese)</option>
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
                <input type="text" id="aios-lan-ip" class="form-control" placeholder="192.168.1.1">
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
            <input type="password" id="aios-wifi-password" class="form-control">
        </div>
    </div>`;
    
    container.innerHTML = html;
    
    // Update main textarea when values change
    container.addEventListener('input', function() {
        updateMainScript(template);
    });
}

function updateMainScript(template) {
    const textarea = document.getElementById('uci-defaults-content');
    if (textarea) {
        textarea.value = template;
    }
}
