/* Package selector functionality only - no duplicate UI creation */

let packageSelectorLoaded = false;

// Package selector initialization when details opened
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        const packageDetails = document.querySelector('details:has(#package-selector-content)');
        if (packageDetails) {
            packageDetails.addEventListener('toggle', function() {
                if (this.open && !packageSelectorLoaded) {
                    loadPackageSelector();
                }
            });
        }
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

function generatePackageCategories(container, packageData) {
    let html = '<div id="package-categories">';

    (packageData.categories || []).forEach(category => {
        html += `<div class="package-category">`;
        html += `<h6>${category.name}</h6>`;
        html += '<div class="package-grid">';

        const depIdsAll = new Set();
        (category.packages || []).forEach(pkg => {
            (pkg.dependencies || []).forEach(d => depIdsAll.add(d));
        });

        (category.packages || []).forEach(pkg => {
            if (pkg.hidden) return;

            html += `<div class="package-item">`;
            html += `<div class="form-check">`;

            const depIds = pkg.dependencies || [];
            const depIdsAttr = depIds.join(' ');
            const pkgUrl = pkg.url || `https://openwrt.org/packages/${encodeURIComponent(pkg.name)}`;

            html += `<input class="form-check-input package-selector-checkbox" type="checkbox" id="pkg-${pkg.id}" data-id="${pkg.id}" data-package="${pkg.name}"`;
            if (depIds.length) {
                html += ` data-dependencies="${depIdsAttr}"`;
            }
            html += `>`;

            html += `<label class="form-check-label" for="pkg-${pkg.id}">`;
            html += `<a href="${pkgUrl}" target="_blank" rel="noopener" class="package-link">${pkg.name}</a>`;
            html += `</label></div>`;

            // Dependencies
            if (depIds.length) {
                depIds.forEach(depId => {
                    const depPkg = findPackageById(packageData, depId);
                    const depName = depPkg?.name || depId;
                    const depUrl = (depPkg && depPkg.url) ? depPkg.url : `https://openwrt.org/packages/${encodeURIComponent(depName)}`;
                    const depHidden = !!depPkg?.hidden;

                    html += `<div class="package-dependent${depHidden ? ' package-hidden' : ''}">`;
                    html += `<input class="form-check-input package-selector-checkbox" type="checkbox" id="pkg-${depId}" data-id="${depId}" data-package="${depName}">`;
                    html += `<label class="form-check-label" for="pkg-${depId}">`;
                    html += `<a href="${depUrl}" target="_blank" rel="noopener" class="package-link">${depName}</a>`;
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

    // Add event listeners for package selection
    container.querySelectorAll('.package-selector-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function(e) {
            handlePackageToggle(e.target);
            updatePackageList();
        });
    });
}

function findPackageById(packageData, id) {
    for (const cat of packageData.categories || []) {
        const pkg = (cat.packages || []).find(p => p.id === id);
        if (pkg) return pkg;
    }
    return null;
}

function handlePackageToggle(checkbox) {
    const isChecked = checkbox.checked;
    const depIds = (checkbox.getAttribute('data-dependencies') || '').split(' ').filter(Boolean);
    
    if (depIds.length && isChecked) {
        // Check dependencies when parent is checked
        depIds.forEach(depId => {
            const depCheckbox = document.querySelector(`#pkg-${depId}`);
            if (depCheckbox) {
                depCheckbox.checked = true;
            }
        });
    }
}

function updatePackageList() {
    const textarea = document.getElementById('asu-packages');
    if (!textarea) return;

    let current = textarea.value.trim().split(/\s+/).filter(Boolean);
    
    // Get all managed packages
    const managedPackages = [];
    document.querySelectorAll('.package-selector-checkbox').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        if (pkgName) {
            managedPackages.push(pkgName);
        }
    });
    
    // Remove managed packages from current list
    current = current.filter(pkg => !managedPackages.includes(pkg));
    
    // Add checked packages
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        if (pkgName) {
            current.push(pkgName);
        }
    });
    
    // Remove duplicates
    current = Array.from(new Set(current));
    
    textarea.value = current.join(' ');
}

// 言語セレクター初期化
async function populateLanguageSelectorFromGitHub() {
    const baseUrl = 'https://api.github.com/repos/openwrt/luci/contents/modules/luci-base/po?ref=master';
    const source = document.getElementById('languages-select');       // index.html の言語一覧
    const target = document.getElementById('advanced-language');      // advanced 側のセレクト
    if (!source || !target) return;

    try {
        const res = await fetch(baseUrl);
        const dirs = await res.json();
        const available = new Set(
            dirs.filter(e => e && e.type === 'dir' && e.name)
                .map(e => e.name.toLowerCase())
        );

        target.innerHTML = '';
        for (const opt of source.options) {
            const code = opt.value.toLowerCase();
            if (!available.has(code)) continue;
            const copy = document.createElement('option');
            copy.value = opt.value;
            copy.textContent = opt.textContent;
            target.appendChild(copy);
        }

        // index.html 側で選択されている言語を初期値に
        const selectedCode = source.value.toLowerCase();
        target.value = available.has(selectedCode) ? source.value : 'en';

    } catch (err) {
        console.warn('Failed to populate language selector:', err);
    }
}

// 初期化で一度だけ呼び出す（package selectorとは別）
document.addEventListener('DOMContentLoaded', () => {
    populateLanguageSelectorFromGitHub();
});
