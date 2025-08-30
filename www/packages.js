
// ==================== パッケージデータベース ====================
let PACKAGE_DB = {};
loadPackageDb().then(db => {
    PACKAGE_DB = db;
    window.PACKAGE_DB = db; // グローバルに公開
});

async function loadPackageDb() {
    const res = await fetch('scripts/packages.json');
    const data = await res.json();
    applySearchUrls(data);
    return data;
}

const SEARCH_URL_TEMPLATE = 'https://openwrt.org/start?do=search&q={id}';
function applySearchUrls(db) {
    db.categories.forEach(category => {
        category.packages.forEach(pkg => {
            pkg.url = SEARCH_URL_TEMPLATE.replace(
                '{id}',
                encodeURIComponent(pkg.id)
            );
        });
    });
}

// ==================== i18nパッケージ関数 ====================
function normalizeLang(lang) {
    const map = {
        en: '',       // 英語は i18n パッケージ不要
        pt_br: 'pt-br',
        zh_cn: 'zh-cn',
        zh_tw: 'zh-tw'
    };
    return (map[lang] ?? String(lang || '').toLowerCase());
}

function asuI18nDB(lang) {
    const norm = normalizeLang(lang);
    const isEN = !norm;
    const s = isEN ? '' : `-${norm}`;
    const make = (key) => (isEN ? [] : [`luci-i18n-${key}${s}`]);
    
    const result = {
        base: make('base'),
        opkg: make('opkg'),
        firewall: make('firewall')
    };
    
    // PACKAGE_DBから動的に生成
    PACKAGE_DB.categories.forEach(category => {
        category.packages.forEach(pkg => {
            if (pkg.enableVar) {
                const key = pkg.enableVar.replace('enable_', '');
                result[key] = make(key);
            } else if (pkg.id.startsWith('luci-app-')) {
                const key = pkg.id.replace('luci-app-', '');
                result[key] = make(key);
            }
        });
    });
    
    return result;
}

function asuCollectPackages() {
    const lang = document.getElementById('aios-language').value?.trim() || 'en';
    const norm = normalizeLang(lang);
    const db = asuI18nDB(lang);
    const textarea = document.getElementById('asu-packages');
    let current = split(textarea.value);

    // 1) i18n の整理: 英語なら全 i18n を削除、非英語なら現在言語以外を削除
    current = current.filter(pkg => {
        if (!pkg.startsWith('luci-i18n-')) return true;
        const m = pkg.match(/^luci-i18n-(.+?)-([A-Za-z]{2}(?:-[A-Za-z]{2})?)$/);
        const suffix = (m && m[2]) ? m[2].toLowerCase() : '';
        if (!norm) return false; // 英語: i18n 全排除
        return suffix === norm;  // 現在言語のみ温存
    });

    // 2) ベースパッケージ集合（セレクター選択＋手動入力の双方）
    const baseSet = new Set();

    // セレクター選択から
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const names = cb.getAttribute('data-package')?.split(/\s+/) || [];
        names.forEach(n => baseSet.add(n));
    });

    // 手動入力から
    current.forEach(pkg => {
        if (pkg.startsWith('luci-i18n-')) return;
        baseSet.add(pkg);
    });

    // 3) 現在言語の i18n でも、対応するベースパッケージがなければ除去
    current = current.filter(pkg => {
        if (!pkg.startsWith('luci-i18n-')) return true;
        const m = pkg.match(/^luci-i18n-(.+?)-([A-Za-z]{2}(?:-[A-Za-z]{2})?)$/);
        if (!m) return false;
        const key = m[1];
        return baseSet.has(`luci-app-${key}`) || baseSet.has(key);
    });

    // 4) 追加関数
    const add = (pkg) => {
        if (pkg && !current.includes(pkg)) current.push(pkg);
    };

    // 5) 非英語のみ、基本 i18n を追加
    if (norm) {
        ['base', 'opkg', 'firewall'].forEach(k => (db[k] || []).forEach(add));
    }

    // 6) 全てのluci-app-xxxパッケージから動的にi18nパッケージを生成
    if (norm) {
        baseSet.forEach(pkg => {
            const m = pkg.match(/^luci-app-(.+)$/);
            if (m) {
                const key = m[1];
                const i18nPkg = `luci-i18n-${key}-${norm}`;
                add(i18nPkg);
            }
        });
    }

    // 8) 最終重複排除
    current = Array.from(new Set(current));

    textarea.value = current.join(' ');
}

// ==================== パッケージセレクター ====================
function togglePackageSelector(e) {
    const configSection = document.getElementById('package-selector-config');
    configSection.style.display = e.target.open ? 'block' : 'none';
}

function generatePackageSelector() {
    const container = document.getElementById('package-categories');
    if (!container) return;

    container.innerHTML = '';

    // 利用可能パッケージ名のセットを作成
    const availablePackages = new Set();
    if (Array.isArray(window.app.devicePackages) && window.app.devicePackages.length > 0) {
        window.app.devicePackages.forEach(pkg => {
            const name = (typeof pkg === 'string') ? pkg : pkg && pkg.name;
            if (name) availablePackages.add(name);
        });
    }

    // 判定直前の状態を総合デバッガで出力
    if (window.ErrorHandler?.debug) {
        window.ErrorHandler.debug(
            'generatePackageSelector',
            'State immediately before zero check',
            {
                devicePackages_raw: window.app.devicePackages,
                availablePackages_list: Array.from(availablePackages),
                availablePackages_size: availablePackages.size
            }
        );
    }

    // 取得できていない場合の処理
    if (availablePackages.size === 0) {
        container.innerHTML =
            '<p class="text-muted small">Unable to retrieve the package index for this OS version/device. ' +
            'Please try a different version or device, or try again later.</p>';
        return;
    }

    // 依存パッケージIDの集合を構築
    const depIds = new Set();
    PACKAGE_DB.categories.forEach(cat => {
        cat.packages.forEach(pkg => {
            if (Array.isArray(pkg.dependencies)) {
                pkg.dependencies.forEach(d => depIds.add(d));
            }
        });
    });

    PACKAGE_DB.categories.forEach(category => {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'package-category';

        const categoryTitle = document.createElement('h4');
        categoryTitle.textContent = category.name;
        categoryDiv.appendChild(categoryTitle);

        const categoryDescription = document.createElement('div');
        categoryDescription.className = 'package-category-description';
        categoryDescription.textContent = category.description;
        categoryDiv.appendChild(categoryDescription);

        const packageGrid = document.createElement('div');
        packageGrid.className = 'package-grid';

        let hasVisiblePackages = false;

        category.packages.forEach(pkg => {
            // 依存パッケージはトップレベル描画しない
            if (depIds.has(pkg.id)) return;

            // 厳格：available にあるものだけ表示
            const isAvailable = availablePackages.has(pkg.name);

            const packageItem = document.createElement('div');
            packageItem.className = 'package-item';

            if (!isAvailable) {
                packageItem.style.display = 'none';
                return;
            }

            hasVisiblePackages = true;

            const formCheck = document.createElement('div');
            formCheck.className = 'form-check';

            const checkbox = document.createElement('input');
            checkbox.className = 'form-check-input package-selector-checkbox';
            checkbox.type = 'checkbox';
            checkbox.id = `pkg-${pkg.id}`;
            checkbox.setAttribute('data-package', pkg.name);
            if (pkg.dependencies) {
                checkbox.setAttribute('data-dependencies', pkg.dependencies.join(','));
            }
            if (pkg.checked) {
                checkbox.checked = true;
                checkbox.setAttribute('data-user', '1');
            }
            checkbox.addEventListener('change', handlePackageSelection);

            const label = document.createElement('label');
            label.className = 'form-check-label';
            label.setAttribute('for', `pkg-${pkg.id}`);

            const link = document.createElement('a');
            link.href = pkg.url;
            link.target = '_blank';
            link.className = 'package-link';
            link.textContent = pkg.id;

            label.appendChild(link);
            formCheck.appendChild(checkbox);
            formCheck.appendChild(label);
            packageItem.appendChild(formCheck);

            // 依存パッケージも厳格判定
            if (Array.isArray(pkg.dependencies)) {
                pkg.dependencies.forEach(depId => {
                    let depPkg;
                    for (const cat of PACKAGE_DB.categories) {
                        depPkg = cat.packages.find(p => p.id === depId);
                        if (depPkg) break;
                    }

                    const depName = depPkg ? depPkg.name : depId;
                    const depIsAvailable = availablePackages.has(depName);
                    if (!depIsAvailable) return;

                    const depItem = document.createElement('div');
                    depItem.className = 'package-dependent';

                    const depCheck = document.createElement('input');
                    depCheck.className = 'form-check-input package-selector-checkbox';
                    depCheck.type = 'checkbox';
                    depCheck.id = `pkg-${depPkg ? depPkg.id : depId}`;
                    depCheck.setAttribute('data-package', depName);
                    depCheck.addEventListener('change', handlePackageSelection);

                    const depLabel = document.createElement('label');
                    depLabel.className = 'form-check-label';
                    depLabel.setAttribute('for', `pkg-${depPkg ? depPkg.id : depId}`);

                    if (depPkg) {
                        const depLink = document.createElement('a');
                        depLink.href = depPkg.url;
                        depLink.target = '_blank';
                        depLink.className = 'package-link';
                        depLink.textContent = depPkg.id;
                        depLabel.appendChild(depLink);
                    } else {
                        depLabel.textContent = depId;
                    }

                    depItem.appendChild(depCheck);
                    depItem.appendChild(depLabel);
                    packageItem.appendChild(depItem);
                });
            }

            packageGrid.appendChild(packageItem);
        });

        if (hasVisiblePackages) {
            categoryDiv.appendChild(packageGrid);
            container.appendChild(categoryDiv);
        }
    });

    updatePackageListFromSelector();
}

function handlePackageSelection(e) {
    const pkg = e.target;
    const packageName = pkg.getAttribute('data-package');
    const isChecked = pkg.checked;

    // ユーザー操作の記録
    if (isChecked) {
        pkg.setAttribute('data-user', '1');
    } else {
        pkg.removeAttribute('data-user');
    }

    // 依存パッケージの完全同調
    const dependencies = pkg.getAttribute('data-dependencies') || '';
    const depPackages = dependencies.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);

    if (depPackages.length) {
        depPackages.forEach(dep => {
            const depCheckbox = document.querySelector(`#pkg-${dep}`);
            if (!depCheckbox) return;
            depCheckbox.checked = isChecked;
            depCheckbox.disabled = false;
        });
    }

    updatePackageListFromSelector();
}

function updatePackageListFromSelector() {
    const checkedPkgs = [];
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const n = cb.getAttribute('data-package');
        if (n) checkedPkgs.push(n);
    });
    
    // 完全同期：selector由来のパッケージは差し替え
    const textarea = document.getElementById('asu-packages');
    const current = split(textarea.value);
    const nonSelectorPkgs = current.filter(pkg => {
        return !document.querySelector(`.package-selector-checkbox[data-package="${pkg}"]`);
    });
    const newList = [...nonSelectorPkgs, ...checkedPkgs];
    textarea.value = newList.join(' ');
    syncTemplateAndPackages({ trigger: 'selector' });
}

// ==================== パッケージ取得 ====================
async function fetchDevicePackages() {
    window.app.devicePackages = [];
    if (!window.current_device || !window.current_device.id || !window.app.selectedVersion) return;

    const version = window.app.selectedVersion;
    const targetPath = window.current_device.target;
    const isSnapshot = /SNAPSHOT$/i.test(version);

    // URLベース設定
    setupVersionUrls(version);
    const basePath = config.image_urls[version].replace(/\/$/, '');

    // 統合版 arch 解決
    const arch = await resolveArch(version, targetPath);
    if (!arch) {
        console.error('[fetchDevicePackages] Unable to resolve arch for target:', targetPath);
        if (typeof generatePackageSelector === 'function') generatePackageSelector();
        return;
    }

    const feeds = ["base", "luci", "packages", "routing", "telephony"];
    const urls = [];

    if (isSnapshot) {
        feeds.forEach(feed => {
            urls.push(`${basePath}/packages/${arch}/${feed}/index.json`);
        });
        if (window.app.kernelHash) {
            urls.push(`${basePath}/targets/${targetPath}/kmods/${window.app.kernelHash}/index.json`);
        }
    } else {
        urls.push(`${basePath}/targets/${targetPath}/packages/Packages`);
        if (window.app.kernelHash) {
            urls.push(`${basePath}/targets/${targetPath}/kmods/${window.app.kernelHash}/Packages`);
        }
        feeds.forEach(feed => {
            urls.push(`${basePath}/packages/${arch}/${feed}/Packages`);
        });
    }

    const allPkgsMap = new Map();

    await Promise.allSettled(urls.map(async (url) => {
        try {
            const res = await fetch(url, { cache: 'no-cache', credentials: 'omit', mode: 'cors' });
            if (!res.ok) {
                console.warn(`Package fetch ${res.status}: ${url}`);
                return;
            }
            if (url.endsWith('.json')) {
                const data = await res.json();
                const packages = data?.packages || {};
                Object.entries(packages).forEach(([name, info]) => {
                    if (!info || !info.properties || !info.properties.packageName) {
                        console.warn(`[fetchDevicePackages] Missing properties for package: ${name}`, info);
                        return; // スキップ
                    }
                    allPkgsMap.set(name, { name, ...info, source: url });
                });
                if (window.ErrorHandler && window.ErrorHandler.packageDebug) {
                    if (window.ErrorHandler && window.ErrorHandler.packageDebug) {
                        if (window.ErrorHandler?.packageDebug) {
                            window.ErrorHandler.packageDebug.logFetch(
                                url,
                                true,
                                Object.entries(packages)
                                    .filter(([n, i]) => i && i.properties && i.properties.packageName)
                                    .map(([n, i]) => ({ name: n, ...i }))
                            );
                        }
                    }
                }
            } else {
                const text = await res.text();
                const packages = parsePackagesText(text, url);
                packages.forEach(pkg => {
                    if (!pkg || !pkg.name) {
                        console.warn(`[fetchDevicePackages] Skipping invalid pkg record from ${url}`, pkg);
                        return;
                    }
                    allPkgsMap.set(pkg.name, pkg);
                });
                if (window.ErrorHandler && window.ErrorHandler.packageDebug) {
                    if (window.ErrorHandler && window.ErrorHandler.packageDebug) {
                        if (window.ErrorHandler?.packageDebug) {
                            window.ErrorHandler.packageDebug.logFetch(url, true, packages);
                        }
                    }
                }
            }
        } catch (err) {
            console.warn(`Package fetch failed: ${url} -> ${err.message}`);
        }
    }));

    // 最終正規化：name必須・string化、最低限の形に揃える
    wi
        ndow.app.devicePackages = Array.from(allPkgsMap.values())
        .map(p => {
            const name = (typeof p === 'string') ? p : p?.name;
            if (!name) return null;
            return (typeof p === 'string')
                ? name
                : { name, version: p.version, description: p.description, section: p.section, filename: p.filename, source: p.source };
        })
        .filter(Boolean);
    if (window.ErrorHandler && window.ErrorHandler.packageDebug) {
        if (window.ErrorHandler && window.ErrorHandler.packageDebug) {
            if (window.ErrorHandler?.packageDebug) {
                window.ErrorHandler.packageDebug.dumpAll();
            }
        }
    }

    function parsePackagesText(text, source) {
        const blocks = text.split(/\n\s*\n/);
        const pkgs = [];
        for (const blk of blocks) {
            const rec = {};
            for (const line of blk.split('\n')) {
                const m = line.match(/^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/);
                if (!m) continue;
                const key = m[1], val = m[2];
                if (key === "Package") rec.name = val.trim();
                else if (key === "Version") rec.version = val;
                else if (key === "Description") rec.description = val;
                else if (key === "Section") rec.section = val;
                else if (key === "Filename") rec.filename = val;
            }
            if (rec.name) {
                rec.source = source;
                pkgs.push(rec);
            }
        }
        return pkgs;
    }
}

async function resolveArch(version, targetPath, opts = {}) {
    try {
        // 0) キャッシュ優先
        if (window.app.archPackagesMap && window.app.archPackagesMap[targetPath]) {
            return window.app.archPackagesMap[targetPath];
        }

        // 1) 呼び出し元が profilesData を渡してきた場合
        if (opts.profilesData?.arch_packages) {
            const arch = opts.profilesData.arch_packages;
            window.app.archPackagesMap = window.app.archPackagesMap || {};
            window.app.archPackagesMap[targetPath] = arch;
            return arch;
        }

        // 2) URL構築
        setupVersionUrls(version);
        const basePath = (config.image_urls && config.image_urls[version])
            ? config.image_urls[version].replace(/\/$/, '')
            : '';

        // 3) profiles.json 直接参照
        const profilesUrl = `${basePath}/targets/${targetPath}/profiles.json`;
        try {
            const res = await fetch(profilesUrl, { cache: 'no-cache', credentials: 'omit', mode: 'cors' });
            if (res.ok) {
                const meta = await res.json();
                const arch = meta?.arch_packages || '';
                if (arch) {
                    window.app.archPackagesMap = window.app.archPackagesMap || {};
                    window.app.archPackagesMap[targetPath] = arch;
                    return arch;
                }
            }
        } catch (e) {
            console.log(`[ARCH] profiles.json fetch failed: ${e.message}`);
        }

        // 4) overview.json 由来のフォールバック
        if (window.app.archPackagesMap && window.app.archPackagesMap[targetPath]) {
            return window.app.archPackagesMap[targetPath];
        }

        return '';
    } catch (err) {
        console.error('[ARCH] unexpected error:', err);
        return '';
    }
}

// ==================== パッケージ管理 ====================
function split(str) {
    return str.match(/[^\s,]+/g) || [];
}

function updateRequiredPackages() {
    const config = getAiosConfig();
    const packagesTextarea = document.getElementById('asu-packages');
    let currentPackages = split(packagesTextarea.value);

    // 自動追加対象を制限（map, ds-lite のみ）
    currentPackages = currentPackages.filter(pkg =>
        pkg !== 'map' &&
        pkg !== 'ds-lite'
    );
    
    // 接続方式に応じたパッケージの追加
    if (config.connectionMode === 'auto') {
        if (window.cachedApiInfo && window.cachedApiInfo.mape) {
            if (window.cachedApiInfo.mape.aftrType) {
                if (!currentPackages.includes('ds-lite')) {
                    currentPackages.push('ds-lite');
                }
            } else if (window.cachedApiInfo.mape.brIpv6Address) {
                if (!currentPackages.includes('map')) {
                    currentPackages.push('map');
                }
            }
        }
    } else {
        switch(config.connectionType) {
            case 'mape':
                if (!currentPackages.includes('map')) {
                    currentPackages.push('map');
                }
                break;
            case 'dslite':
                if (!currentPackages.includes('ds-lite')) {
                    currentPackages.push('ds-lite');
                }
                break;
        }
    }

    // 最終重複排除
    currentPackages = Array.from(new Set(currentPackages));
    
    packagesTextarea.value = currentPackages.join(' ');
}

// ==================== 終点ロジック ====================
function syncTemplateAndPackages(opts = {}) {
    const textarea = document.getElementById('asu-packages');
    let pkgList = split(textarea.value);

    // 外部からの更新分をマージ
    if (Array.isArray(opts.updatedPackages)) {
        pkgList = mergeUnique(pkgList, opts.updatedPackages);
    }
    textarea.value = pkgList.join(' ');

    // 必須パッケージ追加 + i18n整理
    updateRequiredPackages();
    asuCollectPackages();

    // テンプレはGUI開状態のみ再生成
    if (document.getElementById('use-aios-config-details').open) {
        updateConfiguredTemplate();
    }
}

function mergeUnique(base, extra) {
    const set = new Set(base);
    (extra || []).forEach(p => set.add(p));
    return Array.from(set);
}

function refreshTemplateAndPackages() {
    // セレクターの初期値を反映
    const checkedPackages = [];
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        if (pkgName) checkedPackages.push(pkgName);
    });
    
    if (checkedPackages.length > 0) {
        const textarea = document.getElementById('asu-packages');
        const currentList = split(textarea.value);
        const mergedList = Array.from(new Set([...currentList, ...checkedPackages]));
        textarea.value = mergedList.join(' ');
    }
    
    // 必要パッケージの更新
    updateRequiredPackages();
    
    // i18n 整理
    asuCollectPackages();

    // aios-config 有効時のみテンプレ更新
    if (document.getElementById('use-aios-config-details').open) {
        updateConfiguredTemplate();
    }
}

// ==================== パッケージ入力ボックス ====================
(function() {
    const pkgInput = document.getElementById('package-search');
    let pkgSearchTimer;

    if (pkgInput) {
        pkgInput.addEventListener('input', function(e) {
            clearTimeout(pkgSearchTimer);
            const query = e.target.value.trim().toLowerCase();

            if (query.length < 2 || !Array.isArray(window.app.devicePackages) || window.app.devicePackages.length === 0) {
                hidePackageAutocomplete();
                return;
            }

            pkgSearchTimer = setTimeout(() => {
                const matches = window.app.devicePackages
                    .filter(pkg => {
                        const name = (typeof pkg === 'string') ? pkg : pkg.name || '';
                        return name.toLowerCase().includes(query);
                    })
                    .sort((a, b) => {
                        const nameA = (typeof a === 'string') ? a : a.name || '';
                        const nameB = (typeof b === 'string') ? b : b.name || '';
                        if (nameA.toLowerCase() === query && nameB.toLowerCase() !== query) return -1;
                        if (nameB.toLowerCase() === query && nameA.toLowerCase() !== query) return 1;
                        return 0;
                    });

                showPackageAutocomplete(matches, pkgInput);
            }, 200);
        });

        pkgInput.addEventListener('change', function() {
            if (!pkgInput.value.trim()) {
                const total = document.querySelectorAll('#package-search, #package-search-autocomplete input.package-search').length;
                if (total > 1 && pkgInput.parentNode) {
                    pkgInput.parentNode.removeChild(pkgInput);
                }
                syncTextareaFromBoxes();
            }
        });
    }
})();

function hidePackageAutocomplete() {
    const el = document.querySelector('#package-search-autocomplete .autocomplete-items');
    if (el) el.remove();
}

function showPackageAutocomplete(matches, inputEl) {
    hidePackageAutocomplete();
    const host = document.getElementById('package-search-autocomplete');
    if (!host) return;

    const container = document.createElement('div');
    container.className = 'autocomplete-items';

    (matches || []).forEach(item => {
        const name = (typeof item === 'string') ? item : (item && item.name) || '';
        if (!name) return;
        const div = document.createElement('div');
        div.textContent = name;
        div.addEventListener('click', () => {
            inputEl.value = name;
            hidePackageAutocomplete();
            syncTextareaFromBoxes();
            if (!document.querySelector('#package-search-autocomplete input[value=""]')) {
                createExtraPackageBox();
            }
        });
        container.appendChild(div);
    });

    host.appendChild(container);
}

function syncTextareaFromBoxes() {
    const extras = [];
    const mainSearch = document.getElementById('package-search');
    if (mainSearch && mainSearch.value.trim()) {
        extras.push(mainSearch.value.trim());
    }
    document.querySelectorAll('#package-search-autocomplete input.package-search').forEach(el => {
        const val = el.value.trim();
        if (val) extras.push(val);
    });
    syncTemplateAndPackages({ trigger: 'manual', updatedPackages: extras });
}

function createExtraPackageBox() {
    const host = document.getElementById('package-search-autocomplete');
    const newInput = document.createElement('input');
    newInput.type = 'text';
    newInput.className = 'form-control package-search';
    newInput.placeholder = 'Type package name';
    newInput.autocomplete = 'off';
    newInput.spellcheck = false;
    newInput.autocapitalize = 'off';
    newInput.dataset.extra = '1';

    let timer;
    newInput.addEventListener('input', function() {
        clearTimeout(timer);
        const query = this.value.trim().toLowerCase();

        if (query.length < 2 || !Array.isArray(window.app.devicePackages) || window.app.devicePackages.length === 0) {
            hidePackageAutocomplete();
            return;
        }

        timer = setTimeout(() => {
            const matches = window.app.devicePackages
                .filter(pkg => {
                    const name = (typeof pkg === 'string') ? pkg : pkg.name || '';
                    return name.toLowerCase().includes(query);
                })
                .sort((a, b) => {
                    const nameA = (typeof a === 'string') ? a : a.name || '';
                    const nameB = (typeof b === 'string') ? b : b.name || '';
                    if (nameA.toLowerCase() === query && nameB.toLowerCase() !== query) return -1;
                    if (nameB.toLowerCase() === query && nameA.toLowerCase() !== query) return 1;
                    return 0;
                });

            showPackageAutocomplete(matches, newInput);
        }, 200);
    });

    newInput.addEventListener('change', function() {
        if (!this.value.trim() && this.dataset.extra === '1') {
            host.removeChild(this);
            syncTextareaFromBoxes();
        }
    });

    host.appendChild(newInput);
    newInput.focus();
}

document.addEventListener('click', function (e) {
    if (!e.target.closest('#package-search-autocomplete')) {
        hidePackageAutocomplete();
    }
});

// Export functions for other modules
window.PACKAGE_DB = PACKAGE_DB;
window.generatePackageSelector = generatePackageSelector;
window.togglePackageSelector = togglePackageSelector;
window.updateRequiredPackages = updateRequiredPackages;
window.asuCollectPackages = asuCollectPackages;
window.fetchDevicePackages = fetchDevicePackages;
window.syncTemplateAndPackages = syncTemplateAndPackages;
window.refreshTemplateAndPackages = refreshTemplateAndPackages;
window.split = split;
