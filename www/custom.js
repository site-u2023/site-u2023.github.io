console.log('custom.js loaded');

window.addEventListener('load', () => {
  function updateLink(element, text, href) {
    if (!element) return;
    if (text) element.textContent = text;
    if (href) {
      element.href = href;
      element.target = '_blank';
    }
  }

  const ofsLink = document.querySelector('#ofs-version')?.closest('a');
  updateLink(ofsLink, custom_ofs_version, custom_ofs_link);

  const feedbackLink = document.querySelector('a.tr-feedback-link');
  updateLink(feedbackLink, custom_feedback_text, custom_feedback_link);
});

// ==================== 状態管理（一元化） ====================
const state = {
    // デバイス情報
    device: {
        arch: null,
        version: null,
        target: null,
        vendor: null,
        subtarget: null,
        id: null
    },
    
    // API情報
    apiInfo: null,
    
    // パッケージ情報
    packages: {
        json: null,          // packages.json
        default: [],         // mobj.default_packages
        device: [],          // mobj.device_packages
        extra: [],           // config.asu_extra_packages
        dynamic: new Set(),  // 動的に追加されるパッケージ
        selected: new Set()  // 選択されたパッケージ
    },
    
    // 設定情報
    config: {
        setup: null,         // setup.json
        formStructure: {},   // フォーム構造
        defaultValues: {}    // デフォルト値
    },
    
    // UI状態
    ui: {
        initialized: false,
        htmlLoaded: false,
        language: {
            selected: '',         // デバイス言語
            current: ''          // UI言語
        },
        managers: {
            packageSearch: null,
            commands: null
        }
    },
    
    // キャッシュ
    cache: {
        kmods: {
            token: null,
            key: null
        },
        packageAvailability: new Map(),
        feed: new Map(),
        feedPackageSet: new Map(),
        availabilityIndex: new Map(),
        lastFormStateHash: null,
        lastPackageListHash: null,
        prevUISelections: new Set(),
        domElements: new Map(),
        packageSizes: new Map()
    }
};

// ==================== ユーティリティ ====================

const UI = {
    updateElement(idOrEl, opts = {}) {
        const el = typeof idOrEl === 'string'
            ? document.getElementById(idOrEl)
            : idOrEl;
        if (!el) return;

        if ('show' in opts) {
            el.style.display = opts.show ? '' : 'none';
        }
        if ('text' in opts) {
            el.textContent = opts.text;
        }
        if ('html' in opts) {
            el.innerHTML = opts.html;
        }
        if ('value' in opts) {
            el.value = opts.value;
        }
        if ('disabled' in opts) {
            el.disabled = !!opts.disabled;
        }
    }
};

const CustomUtils = {
    getVendor() {
        return state.device.vendor;
    },

    getSubtarget() {
        return state.device.subtarget;
    },

    updateDeviceInfo(target) {
        if (!target) return;
        const [vendor, subtarget] = target.split('/');
        state.device.vendor = vendor || null;
        state.device.subtarget = subtarget || '';
    },

    buildKmodsUrl: async function(version, vendor, isSnapshot) {
        if (!version || !vendor) {
            throw new Error(`Missing required parameters for kmods URL: version=${version}, vendor=${vendor}`);
        }
    
        const subtarget = this.getSubtarget();
        if (!subtarget) {
            throw new Error(`Missing subtarget for kmods URL: version=${version}, vendor=${vendor}`);
        }    
    
        const cacheKey = `${version}|${vendor}|${isSnapshot ? 'S' : 'R'}`;
    
        if (state.cache.kmods.token && state.cache.kmods.key === cacheKey) {
            const searchTpl = isSnapshot ? config.kmods_apk_search_url : config.kmods_opkg_search_url;
            return searchTpl
                .replace('{version}', version)
                .replace('{vendor}', vendor)
                .replace('{subtarget}', subtarget)
                .replace('{kmod}', state.cache.kmods.token);
        }
    
        const indexTpl = isSnapshot ? config.kmods_apk_index_url : config.kmods_opkg_index_url;
        const indexUrl = indexTpl
            .replace('{version}', version)
            .replace('{vendor}', vendor)
            .replace('{subtarget}', subtarget);
        
        console.log('Fetching kmods index:', indexUrl);
        const resp = await fetch(indexUrl, { cache: 'no-store' });
        if (!resp.ok) throw new Error(`Failed to fetch kmods index: HTTP ${resp.status} for ${indexUrl}`); 
        const html = await resp.text();

        let matches = [...html.matchAll(/href="([^/]+)\//g)].map(m => m[1]);
        matches = matches.filter(token =>
            token &&
            typeof token === 'string' &&
            !/^\s*$/.test(token) &&
            !token.startsWith('#') &&
            !token.startsWith('?') &&
            !token.startsWith('.') &&
            /^[\w.-]+$/.test(token)
        );

        if (!matches.length) throw new Error("kmods token not found");
    
        matches.sort();
        state.cache.kmods.token = matches[matches.length - 1];
        state.cache.kmods.key = cacheKey;
    
        const searchTpl = isSnapshot ? config.kmods_apk_search_url : config.kmods_opkg_search_url;
        return searchTpl
            .replace('{version}', version)
            .replace('{vendor}', vendor)
            .replace('{subtarget}', subtarget)
            .replace('{kmod}', state.cache.kmods.token);
    },
    
    inCidr: function(ipv6, cidr) {
        const [prefix, bits] = cidr.split('/');
        const addrBin = this.ipv6ToBinary(ipv6);
        const prefixBin = this.ipv6ToBinary(prefix);
        return addrBin.substring(0, bits) === prefixBin.substring(0, bits);
    },
    
    ipv6ToBinary: function(ipv6) {
        const full = ipv6.split('::').reduce((acc, part, i, arr) => {
            const segs = part.split(':').filter(Boolean);
            if (i === 0) {
                return segs;
            } else {
                const missing = 8 - (arr[0].split(':').filter(Boolean).length + segs.length);
                return acc.concat(Array(missing).fill('0'), segs);
            }
        }, []).map(s => s.padStart(4, '0'));
        return full.map(seg => parseInt(seg, 16).toString(2).padStart(16, '0')).join('');
    },
    
    generateGuaPrefixFromFullAddress: function(apiInfo) {
        if (!apiInfo?.ipv6) return null;
        const ipv6 = apiInfo.ipv6.toLowerCase();

        const ipv6Config = state?.config?.setup?.config?.ipv6 || config?.ipv6;
        if (!ipv6Config) return null;

        if (!this.inCidr(ipv6, ipv6Config.guaPrefixCheck)) return null;

        if (Array.isArray(ipv6Config.excludeCidrs) &&
            ipv6Config.excludeCidrs.some(cidr => this.inCidr(ipv6, cidr))) {
            return null;
        }

        const segments = ipv6.split(':');
        if (segments.length >= 4) {
            return `${segments[0]}:${segments[1]}:${segments[2]}:${segments[3]}::/64`;
        }
        return null;
    },

    setGuaPrefixIfAvailable: function() {
        const guaPrefixField = getEl('mapeGuaPrefix', '#mape-gua-prefix');
        if (!guaPrefixField || !state.apiInfo?.ipv6) return;
        const guaPrefix = this.generateGuaPrefixFromFullAddress(state.apiInfo);
        if (guaPrefix) {
            UI.updateElement(guaPrefixField, { value: guaPrefix });
        }
    },
    
    toggleVisibility(el, show = true) {
        const element = (typeof el === 'string') ? document.querySelector(el) : el;
        if (!element) return;
        
        const isVisible = Boolean(show);
        element.classList.toggle('hide', !isVisible);
        element.style.display = isVisible ? '' : 'none';
    },

    show(el) { this.toggleVisibility(el, true); },
    hide(el) { this.toggleVisibility(el, false); },

    setValue(selector, val) {
        const el = document.querySelector(selector);
        if (!el) return;

        if (['INPUT', 'TEXTAREA'].includes(el.tagName)) {
            el.value = val;
        } else {
            el.textContent = val;
        }
    },

    split(str = '') {
        return str.trim().match(/[^\s,]+/g) || [];
    },

    getNestedValue(obj, path) {
        if (!obj || !path) return undefined;
        return path.split('.').reduce((current, key) => current?.[key], obj);
    },

    restoreManualDefaults: function() {
        const tuningCategory = state.config.setup.categories.find(cat => cat.id === 'tuning-config');
        const manualSection = tuningCategory.packages.find(pkg => pkg.id === 'netopt-manual-section');
        const netoptFields = manualSection.children.find(child => child.id === 'netopt-fields');
    
        netoptFields.fields.forEach(field => {
            if (field.defaultValue !== undefined && field.defaultValue !== null) {
                const el = document.querySelector(field.selector || `#${field.id}`);
                if (el && !el.value) {
                    UI.updateElement(el, { value: field.defaultValue });
                }
            }
        });
    },

    restoreWifiDefaults: function() {
        const wifiCategory = state.config.setup.categories.find(cat => cat.id === 'wifi-config');
        if (!wifiCategory) return;

        function findWifiFields(pkg) {
            const fields = [];
            if (pkg.type === 'input-group' && pkg.fields) {
                fields.push(...pkg.fields);
            } else if (pkg.children) {
                pkg.children.forEach(child => {
                    fields.push(...findWifiFields(child));
                });
            }
            return fields;
        }

        const allWifiFields = [];
        wifiCategory.packages.forEach(pkg => {
            allWifiFields.push(...findWifiFields(pkg));
        });

        allWifiFields.forEach(field => {
            if (field.defaultValue !== undefined && field.defaultValue !== null) {
                const el = document.querySelector(field.selector || `#${field.id}`);
                if (el && !el.value) {
                    UI.updateElement(el, { value: field.defaultValue });
                }
            }
        });
    },
    
clearWifiFields: function() {
        const wifiCategory = state.config.setup.categories.find(cat => cat.id === 'wifi-config');
        if (!wifiCategory) return;

        function findAndClearWifiFields(pkg) {
            if (pkg.type === 'input-group' && pkg.fields) {
                pkg.fields.forEach(field => {
                    const el = document.querySelector(field.selector || `#${field.id}`);
                    if (el) {
                        UI.updateElement(el, { value: '' });
                    }
                });
            } else if (pkg.children) {
                pkg.children.forEach(child => {
                    findAndClearWifiFields(child);
                });
            }
        }

        wifiCategory.packages.forEach(pkg => {
            if (pkg.variableName !== 'wifi_mode') {
                findAndClearWifiFields(pkg);
            }
        });
    }
};

function restoreDefaultsFromJSON(sectionId) {
    function findSection(config, targetId) {
        for (const category of config.categories) {
            for (const pkg of category.packages) {
                if (pkg.id === targetId) return pkg;
                if (pkg.children) {
                    for (const child of pkg.children) {
                        const found = findSectionRecursive(child, targetId);
                        if (found) return found;
                    }
                }
            }
        }
        return null;
    }
    
    function findSectionRecursive(node, targetId) {
        if (node.id === targetId) return node;
        if (node.children) {
            for (const child of node.children) {
                const found = findSectionRecursive(child, targetId);
                if (found) return found;
            }
        }
        return null;
    }
    
    const section = findSection(state.config.setup, sectionId);
    if (!section) return;
    
    function restoreFields(node) {
        if (node.fields) {
            node.fields.forEach(field => {
                if (field.defaultValue !== undefined && field.defaultValue !== null) {
                    const el = document.querySelector(field.selector || `#${field.id}`);
                    if (el && !el.value) {
                        UI.updateElement(el, { value: field.defaultValue });
                    }
                }
            });
        }
        if (node.children) {
            node.children.forEach(restoreFields);
        }
    }
    
    restoreFields(section);
}

function getEl(key, selector) {
    if (!state.cache.domElements.has(key)) {
        state.cache.domElements.set(key, document.querySelector(selector));
    }
    return state.cache.domElements.get(key);
}

// ==================== 初期化処理 ====================
const originalUpdateImages = window.updateImages;

window.updateImages = function(version, mobj) {
    if (originalUpdateImages) originalUpdateImages(version, mobj);

    const oldArch = state.device.arch;
    const oldVersion = state.device.version;

    if (mobj && mobj.arch_packages) {
        state.device.arch = mobj.arch_packages;
        state.device.version = version;
        state.device.target = mobj.target || '';
        state.device.id = mobj.id || state.device.id;
        
        CustomUtils.updateDeviceInfo(mobj.target);

        console.log('[TRACE] device updated:', {
            ...state.device
        });

        if (oldArch !== mobj.arch_packages || oldVersion !== version) {
            console.log('[TRACE] Device changed, clearing caches');
            state.cache.packageAvailability.clear();
            state.cache.feed.clear();

            requestAnimationFrame(() => {
                if (!state.device.vendor) {
                    console.warn('[WARN] No vendor info, kmods may not verify');
                }

                const indicator = document.querySelector('#package-loading-indicator');
                if (indicator) {
                    UI.updateElement(indicator, { show: true });
                    const span = indicator.querySelector('span');
                    if (span) span.className = 'tr-checking-packages';
                }

                verifyAllPackages().then(function() {
                    if (indicator) UI.updateElement(indicator, { show: false });
                    console.log('[TRACE] Package verification complete');
                }).catch(function(err) {
                    console.error('[ERROR] Package verification failed:', err);
                    if (indicator) {
                        UI.updateElement(indicator, {
                            html: '<span class="tr-package-check-failed">Package availability check failed</span>',
                            show: true
                        });
                        indicator.addEventListener('click', () => {
                            UI.updateElement(indicator, { show: false });
                        }, { once: true });
                    }
                });
            });
        }
    }

    if (mobj && "manifest" in mobj === false) {
        state.packages.default = mobj.default_packages || [];
        state.packages.device = mobj.device_packages || [];
        state.packages.extra = config.asu_extra_packages || [];

        document.dispatchEvent(new Event('devicePackagesReady'));

        console.log('[TRACE] Device packages saved:', {
            default: state.packages.default.length,
            device: state.packages.device.length,
            extra: state.packages.extra.length,
            vendor: state.device.vendor
        });

        const initialPackages = state.packages.default
            .concat(state.packages.device)
            .concat(state.packages.extra);

        const textarea = document.querySelector('#asu-packages');
        if (textarea) {
            UI.updateElement(textarea, { value: initialPackages.join(' ') });
            console.log('[TRACE] Initial packages set:', initialPackages);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    textarea.style.height = 'auto';
                    textarea.style.height = textarea.scrollHeight + 'px';
                });
            });
        }

        if (state.ui.initialized) {
            requestAnimationFrame(() => {
                updateAllPackageState('device-packages-loaded');
            });
        }
    }

    if (!state.ui.htmlLoaded) {
        console.log('[TRACE] Loading custom.html');
        loadCustomHTML();
        state.ui.htmlLoaded = true;
    } else if (state.ui.initialized && state.device.arch) {
        const deviceLang = config.device_language || config?.fallback_language || 'en';
        console.log('[TRACE] Updating language packages for:', deviceLang);
        syncDeviceLanguageSelector(deviceLang);
        updateAllPackageState('device-changed-force');
    }
};

// ==================== 統合パッケージ管理システム ====================
async function updateAllPackageState(source = 'unknown') {
    if (!state.ui.initialized && state.packages.default.length === 0 && state.packages.device.length === 0) {
        console.log('updateAllPackageState: Device packages not ready, deferring update from:', source);
        document.addEventListener('devicePackagesReady', () => {
            console.log('Re-running updateAllPackageState after device packages ready (source was:', source, ')');
            updateAllPackageState('force-update');
        }, { once: true });
        return;
    }

    const formValues = collectFormValues();
    const searchValues = state.ui.managers.packageSearch ? state.ui.managers.packageSearch.getAllValues() : [];
    const hash = JSON.stringify({ form: formValues, search: searchValues });

    const forceSources = new Set([
        'package-selected',
        'package-search-change',
        'package-search-add',
        'package-search-remove'
    ]);
    const isForced = source.includes('device') || source.includes('force') || forceSources.has(source);

    if (!isForced && hash === state.cache.lastFormStateHash) return;
    state.cache.lastFormStateHash = hash;

    console.log(`updateAllPackageState called from: ${source}`);

    updateSetupJsonPackagesCore();
    await updateLanguagePackageCore();
    updatePackageListToTextarea(source);
    updateVariableDefinitions();

    console.log('All package state updated successfully');
}

function updateSetupJsonPackagesCore() {
    if (!state.config.setup) return;

    function handleRadioGroup(pkg) {
        const selectedValue = getFieldValue(`input[name="${pkg.variableName}"]:checked`);
        if (!selectedValue) return;

        console.log(`Radio group ${pkg.variableName} selected: ${selectedValue}`);

        pkg.options.forEach(opt => {
            const enable = (opt.value === selectedValue);
            toggleVirtualPackagesByType(pkg.variableName, opt.value, enable);
        });

        if (pkg.variableName === 'connection_type' && selectedValue === 'auto' && state.apiInfo) {
            console.log('AUTO mode with API info, applying specific packages');
            if (state.apiInfo.mape?.brIpv6Address) {
                console.log('Enabling MAP-E package');
                toggleVirtualPackage('map', true);
            } else if (state.apiInfo.aftr) {
                console.log('Enabling DS-Lite package');
                toggleVirtualPackage('ds-lite', true);
            }
        }
    }

    for (const category of state.config.setup.categories) {
        for (const pkg of category.packages) {
            if (pkg.type !== 'radio-group' || !pkg.variableName) continue;
            handleRadioGroup(pkg);
        }
    }
}

function toggleVirtualPackage(packageId, enabled) {
    const pkg = findPackageById(packageId);
    if (!pkg) {
        console.warn(`Virtual package not found in packages.json: ${packageId}`);
        return;
    }

    const searchId = pkg.uniqueId || pkg.id;
    const getCheckbox = (id, sid) =>
        document.querySelector(`[data-package="${id}"], [data-unique-id="${sid}"]`);

    const checkbox = getCheckbox(packageId, searchId);
    if (!checkbox) {
        console.warn(`Checkbox not found for virtual package: ${packageId} (searched: ${searchId})`);
        return;
    }

    const wasChecked = checkbox.checked;
    if (wasChecked === enabled) return;

    checkbox.checked = enabled;
    console.log(`Virtual package ${packageId} (${searchId}): ${enabled ? 'enabled' : 'disabled'}`);

    if (!enabled) return;

    const dependencies = checkbox.getAttribute('data-dependencies');
    if (!dependencies) return;

    for (const depId of dependencies.split(',')) {
        const depPkg = findPackageById(depId);
        if (!depPkg) continue;
        const depSearchId = depPkg.uniqueId || depPkg.id;
        const depCheckbox = getCheckbox(depId, depSearchId);
        if (depCheckbox && !depCheckbox.checked) {
            depCheckbox.checked = true;
            console.log(`Virtual dependency ${depId}: enabled`);
        }
    }
}

function toggleVirtualPackagesByType(type, value, enabled) {
    const mappings = state.config.setup.config.packageMappings;

    const targets = mappings?.[type]?.[value];
    if (!targets || targets.length === 0) {
        console.log(`No virtual packages defined for ${type}=${value}`);
        return;
    }

    console.log(`Toggle packages for ${type}=${value}: ${targets.join(', ')} -> ${enabled}`);
    for (const pkgId of targets) toggleVirtualPackage(pkgId, enabled);
}

async function updateLanguagePackageCore() {
    state.ui.language.selected = config.device_language || config.fallback_language || 'en';
    const lang = state.ui.language.selected;

    const langCfg = state.config.setup.config.languagePackages;
    if (!langCfg) {
        throw new Error('languagePackages config missing in setup.json');
    }
    if (!langCfg.packagePattern || typeof langCfg.packagePattern !== 'string') {
        throw new Error('languagePackages.packagePattern missing in setup.json');
    }

    console.log(`Language package update - Selected language: ${lang}`);

    const removedPackages = [];
    for (const pkg of Array.from(state.packages.dynamic)) {
        if (pkg.startsWith('luci-i18n-')) {
            state.packages.dynamic.delete(pkg);
            removedPackages.push(pkg);
        }
    }
    if (removedPackages.length > 0) {
        console.log('Removed old language packages:', removedPackages);
    }

    const hasArch = state.device.arch;

    if (!lang || lang === config.fallback_language || !hasArch) {
        console.log('Skipping language packages - fallback language or no arch info');
        return;
    }

    const currentPackages = getCurrentPackageListForLanguage();
    console.log(`Checking language packages for ${currentPackages.length} packages`);

    const addedLangPackages = new Set();

    const prefixEntries = Object.entries(langCfg).filter(
        ([k, v]) => typeof v === 'string' && k.endsWith('PackagePrefix')
    );

    for (const [, prefix] of prefixEntries) {
        const name = `${prefix}${lang}`;
        try {
            if (await isPackageAvailable(name, 'luci')) {
                state.packages.dynamic.add(name);
                addedLangPackages.add(name);
                console.log('Added language package from prefix:', name);
            }
        } catch (err) {
            console.error('Error checking language package from prefix:', name, err);
        }
    }

    const checkPromises = [];
    for (const pkg of currentPackages) {
        let moduleName = null;

        if (pkg.startsWith('luci-') && !pkg.startsWith('luci-i18n-')) {
            moduleName = extractLuciName(pkg);
        } else if (pkg === 'usteer-from-setup') {
            moduleName = 'usteer';
        }

        if (!moduleName) continue;

        const langPkg = langCfg.packagePattern
            .replace('{module}', moduleName)
            .replace('{language}', lang);

        const promise = (async () => {
            try {
                if (await isPackageAvailable(langPkg, 'luci')) {
                    state.packages.dynamic.add(langPkg);
                    addedLangPackages.add(langPkg);
                    console.log(`Added LuCI language package: ${langPkg} for ${pkg}`);
                }
            } catch (err) {
                console.error(`Error checking LuCI package ${langPkg}:`, err);
            }
        })();
        checkPromises.push(promise);
    }

    await Promise.all(checkPromises);

    if (addedLangPackages.size > 0) {
        console.log(`Language package update complete: ${addedLangPackages.size} packages added`);
    }
}

function getCurrentPackageListForLanguage() {
    const out = new Set([
        ...state.packages.default,
        ...state.packages.device,
        ...state.packages.extra
    ]);

    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const name = cb.getAttribute('data-package');
        const uid = cb.getAttribute('data-unique-id');
        if (name) out.add(name);
        if (uid && uid !== name) out.add(uid);
    });

    if (state.ui.managers.packageSearch) {
        for (const name of state.ui.managers.packageSearch.getAllValues()) out.add(name);
    }

    for (const name of state.packages.dynamic) {
        if (!name.startsWith('luci-i18n-')) out.add(name);
    }

    const allSelectable = new Set();
    document.querySelectorAll('.package-selector-checkbox').forEach(cb => {
        const n = cb.getAttribute('data-package');
        if (n) allSelectable.add(n);
    });

    const textarea = document.querySelector('#asu-packages');
    if (textarea) {
        for (const name of CustomUtils.split(textarea.value)) {
            if (!name.startsWith('luci-i18n-') && !allSelectable.has(name)) out.add(name);
        }
    }

    return Array.from(out);
}

function updatePackageListToTextarea(source = 'unknown') {
    if (!state.packages.default.length && !state.packages.device.length && !state.packages.extra.length) {
        console.warn('updatePackageListToTextarea: Device packages not loaded yet, skipping update from:', source);
        return;
    }

    const normalizePackages = (values) => {
        if (!values) return [];
        return (Array.isArray(values) ? values : CustomUtils.split(values))
            .map(v => v.trim())
            .filter(v => v.length > 0);
    };

    const addToSet = (targetSet, sources) => {
        sources.forEach(source => {
            normalizePackages(source).forEach(pkg => targetSet.add(pkg));
        });
        return targetSet;
    };

    const basePackages = addToSet(new Set(), [
        state.packages.default,
        state.packages.device,
    ]);

    console.log(`Base device packages: default=${state.packages.default.length}, device=${state.packages.device.length}, extra=${state.packages.extra.length}`);

    const checkedPackages = new Set();
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        if (pkgName) checkedPackages.add(pkgName);
    });

    const searchedPackages = new Set(
        state.ui.managers.packageSearch ? normalizePackages(state.ui.managers.packageSearch.getAllValues()) : []
    );

    if (searchedPackages.size > 0) {
        console.log('PackageSearchManager values:', [...searchedPackages]);
    }

    const knownSelectablePackages = new Set();
    state.packages.json?.categories?.forEach(cat => {
        cat.packages?.forEach(pkg => {
            if (pkg.id) knownSelectablePackages.add(pkg.id);
        });
    });

    const manualPackages = new Set();
    const textarea = document.querySelector('#asu-packages');

    if (textarea) {
        const currentTextareaPackages = normalizePackages(textarea.value);
        const confirmedSet = new Set([...basePackages, ...checkedPackages, ...searchedPackages, ...state.packages.dynamic]);
        const currentUISelections = new Set([...checkedPackages, ...searchedPackages]);

        currentTextareaPackages.forEach(pkg => {
            if (isManualPackage(pkg, confirmedSet, knownSelectablePackages, currentUISelections)) {
                manualPackages.add(pkg);
            }
        });

        state.cache.prevUISelections = currentUISelections;
    }

    const uniquePackages = [...new Set([
        ...basePackages,
        ...checkedPackages,
        ...searchedPackages,
        ...state.packages.dynamic,
        ...manualPackages
    ])];

    const currentHash = JSON.stringify(uniquePackages);
    if (currentHash === state.cache.lastPackageListHash && source !== 'force-update' && source !== 'package-verification-complete') {
        console.log('updatePackageListToTextarea: No changes detected, skipping update from:', source);
        return;
    }
    state.cache.lastPackageListHash = currentHash;

    console.log(`updatePackageListToTextarea from: ${source}`, {
        base: basePackages.size,
        checked: checkedPackages.size,
        searched: searchedPackages.size,
        dynamic: state.packages.dynamic.size,
        manual: manualPackages.size,
        total: uniquePackages.length
    });

if (textarea) {
    const baseSet = new Set([...state.packages.default, ...state.packages.device]);  // extraを削除
    const addedPackages = uniquePackages.filter(pkg => !baseSet.has(pkg));
    
    let totalBytes = 0;
    for (const pkg of addedPackages) {
        const sizeCacheKey = `${state.device.version}:${state.device.arch}:${pkg}`;
        const size = state.cache.packageSizes.get(sizeCacheKey);
        if (typeof size === 'number' && size > 0) {
            totalBytes += size;
        }
    }
    let baseBytes = 0;
    for (const pkg of [...state.packages.default, ...state.packages.device]) {  // extraを削除
        const sizeCacheKey = `${state.device.version}:${state.device.arch}:${pkg}`;
        const size = state.cache.packageSizes.get(sizeCacheKey);
        if (typeof size === 'number' && size > 0) {
            baseBytes += size;
        }
    }

        textarea.value = uniquePackages.join(' ');
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
        const sizeBreakdownEl = document.querySelector('#package-size-breakdown');
        if (sizeBreakdownEl) {
            const baseKB = (baseBytes / 1024).toFixed(1);
            const baseMB = (baseBytes / (1024 * 1024)).toFixed(1);     
            const addedKB = (totalBytes / 1024).toFixed(1);
            const addedMB = (totalBytes / (1024 * 1024)).toFixed(1);
            const totalKB = ((baseBytes + totalBytes) / 1024).toFixed(1);
            const totalMB = ((baseBytes + totalBytes) / (1024 * 1024)).toFixed(1);
            sizeBreakdownEl.textContent = `${current_language_json['tr-base-size'] || 'Base'}: ${baseMB} MB (${baseKB} KB) + ${current_language_json['tr-added-size'] || 'Added'}: ${addedMB} MB (${addedKB} KB) = ${current_language_json['tr-total-size'] || 'Total'}: ${totalMB} MB (${totalKB} KB)`;
        }
    }

    console.log(`Postinst package list updated: ${uniquePackages.length} packages`);
}

function isManualPackage(pkg, confirmedSet, knownSelectablePackages, currentUISelections) {
    if (confirmedSet.has(pkg)) return false;
    if (pkg.startsWith('luci-i18n-')) return false;
    if (knownSelectablePackages.has(pkg)) return false;
    
    const isCheckboxManaged = document.querySelector(`.package-selector-checkbox[data-package="${pkg}"]`) !== null;
    if (isCheckboxManaged) return false;
    
    const isSubstringOfConfirmed = [...confirmedSet].some(
        cpkg => cpkg.length > pkg.length && cpkg.includes(pkg)
    );
    if (isSubstringOfConfirmed) return false;
    
    if (state.cache.prevUISelections.has(pkg) && !currentUISelections.has(pkg)) return false;
    
    return true;
}

// ==================== 共通マルチインプット管理機能 ====================
class MultiInputManager {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`Container ${containerId} not found`);
            return;
        }
        
        this.options = {
            placeholder: options.placeholder || 'Type and press Enter',
            className: options.className || 'multi-input-item',
            onAdd: options.onAdd || (() => {}),
            onRemove: options.onRemove || (() => {}),
            onChange: options.onChange || (() => {}),
            autocomplete: options.autocomplete || null
        };
        
        this.inputs = [];
        this.init();
    }
    
    init() {
        this.container.innerHTML = '';
        this.container.className = 'multi-input-container';
        
        this.addInput('', true);
    }
    
    addInput(value = '', focus = false) {
        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'multi-input-wrapper';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = this.options.className;
        input.placeholder = this.options.placeholder;
        input.value = value;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.autocapitalize = 'off';
        
        input.addEventListener('keydown', (e) => this.handleKeyDown(e, input));
        input.addEventListener('input', (e) => this.handleInput(e, input));
        input.addEventListener('blur', (e) => this.handleBlur(e, input));
        
        inputWrapper.appendChild(input);
        this.container.appendChild(inputWrapper);
        this.inputs.push(input);
        
        if (focus) {
            requestAnimationFrame(() => input.focus());
        }
        
        if (value) {
            this.options.onAdd(value);
        }
        
        return input;
    }
    
    handleKeyDown(e, input) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const value = input.value.trim();
            
            if (value) {
                input.setAttribute('data-confirmed', 'true');
                
                this.addInput('', true);
                
                this.options.onChange(this.getAllValues());
            }
        } else if (e.key === 'Backspace' && input.value === '' && this.inputs.length > 1) {
            const index = this.inputs.indexOf(input);
            if (index > 0) {
                this.inputs[index - 1].focus();
                const prevInput = this.inputs[index - 1];
                prevInput.setSelectionRange(prevInput.value.length, prevInput.value.length);
            }
        }
    }
    
    handleInput(e, input) {
        const value = input.value.trim();
    
        if (this.options.autocomplete && value.length >= 2) {
            this.options.autocomplete(value, input);
        }
    
        if (!input.dataset.programmaticChange) {
            this.options.onChange(this.getAllValues());
        }
    
        delete input.dataset.programmaticChange;
    }
    
    handleBlur(e, input) {
        const value = input.value.trim();
        const index = this.inputs.indexOf(input);
        
        if (input.dataset.skipBlur) {
            delete input.dataset.skipBlur;
            return;
        }
        
        if (value === '' && this.inputs.length > 1 && index !== this.inputs.length - 1) {
            this.removeInput(input);
        }
        
        if (value && index === this.inputs.length - 1 && !input.getAttribute('data-confirmed')) {
            this.addInput('', false);
        }
    }
    
    removeInput(input) {
        const index = this.inputs.indexOf(input);
        if (index > -1 && this.inputs.length > 1) {
            const value = input.value.trim();
            
            input.parentElement.remove();
            
            this.inputs.splice(index, 1);
            
            if (value) {
                this.options.onRemove(value);
            }
            this.options.onChange(this.getAllValues());
        }
    }
    
    getAllValues() {
        return this.inputs
            .map(input => input.value.trim())
            .filter(value => value !== '');
    }
    
    setValues(values) {
        this.container.innerHTML = '';
        this.inputs = [];
        
        if (values && values.length > 0) {
            values.forEach(value => {
                this.addInput(value, false);
            });
        }
        
        this.addInput('', false);
    }
}

async function loadCustomHTML() {
    try {
        const response = await fetch('custom.html?t=' + Date.now());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        console.log('custom.html loaded');

        const temp = document.createElement('div');
        temp.innerHTML = html;
        waitForAsuAndInit(temp);
    } catch (err) {
        console.error('Failed to load custom.html:', err);
    }
}

function waitForAsuAndInit(temp) {
    const asuSection = document.querySelector('#asu');
    if (asuSection) {
        initializeCustomFeatures(asuSection, temp);
        return;
    }

    const observer = new MutationObserver(() => {
        const found = document.querySelector('#asu');
        if (found) {
            observer.disconnect();
            initializeCustomFeatures(found, temp);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// ==================== パッケージ検索機能 ====================
function setupPackageSearch() {
    console.log('setupPackageSearch called');
    
    const searchContainer = document.getElementById('package-search-autocomplete');
    
    if (!searchContainer) {
        console.log('package-search-autocomplete container not found');
        return;
    }
    
    const oldInput = document.getElementById('package-search');
    if (oldInput) {
        oldInput.remove();
    }
    
    state.ui.managers.packageSearch = new MultiInputManager('package-search-autocomplete', {
        placeholder: 'Type package name and press Enter',
        className: 'multi-input-item package-search-input',
        onAdd: (packageName) => {
            console.log('Package added:', packageName);
            updateAllPackageState('package-search-add');
        },
        onRemove: (packageName) => {
            console.log('Package removed:', packageName);
            updateAllPackageState('package-search-remove');
        },
        onChange: (values) => {
            updateAllPackageState('package-search-change');
        },
        autocomplete: (query, inputElement) => {
            searchPackages(query, inputElement);
        }
    });
    
    console.log('Package search setup complete');
}

async function searchPackages(query, inputElement) {
    const arch = state.device.arch;
    const version = state.device.version || document.querySelector("#versions")?.value;
    const vendor = state.device.vendor;
    
    if (query.toLowerCase().startsWith('kmod-') && !vendor) {
        console.log('searchPackages - device state:', state.device);
        console.log('searchPackages - vendor not available');
    }
    
    const allResults = new Set();
    
    let feeds;
    if (query.toLowerCase().startsWith('kmod-')) {
        feeds = vendor ? ['kmods'] : [];
        if (feeds.length === 0) {
            console.log('Cannot search kmods without vendor information');
        }
    } else {
        feeds = ['base', 'packages', 'luci', 'routing', 'telephony'];
    }
    
    for (const feed of feeds) {
        try {
            const results = await searchInFeed(query, feed, version, arch);
            results.forEach(pkg => allResults.add(pkg));
        } catch (err) {
            console.error(`Error searching ${feed}:`, err);
        }
    }
    
    const sortedResults = Array.from(allResults).sort((a, b) => {
        const q = query.toLowerCase();
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();
        
        const aExact = (aLower === q);
        const bExact = (bLower === q);
        if (aExact && !bExact) return -1;
        if (bExact && !aExact) return 1;
        if (aExact && bExact) return a.localeCompare(b);
        return a.localeCompare(b);
    });

    console.log(`Found ${sortedResults.length} packages`);
    
    showPackageSearchResults(sortedResults, inputElement);
}

async function searchInFeed(query, feed, version, arch) {
    const deviceInfo = getDeviceInfo();
    const cacheKey = `${version}:${arch}:${feed}`;

    try {
        if (!state.cache.feed.has(cacheKey)) {
            const url = await buildPackageUrl(feed, {
                version, arch,
                vendor: deviceInfo.vendor,
                subtarget: deviceInfo.subtarget,
                isSnapshot: version.includes('SNAPSHOT')
            });

            console.log(`[DEBUG] Search URL for ${feed}: ${url}`);
            const resp = await fetch(url, { cache: 'force-cache' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            const isSnapshot = version.includes('SNAPSHOT');

            let list = [];
            if (isSnapshot) {
                const data = await resp.json();
                if (data.packages && typeof data.packages === 'object') {
                    for (const [pkgName, pkgData] of Object.entries(data.packages)) {
                        list.push(pkgName);
                        if (pkgData && typeof pkgData.size === 'number' && pkgData.size > 0) {
                            const sizeCacheKey = `${version}:${arch}:${pkgName}`;
                            state.cache.packageSizes.set(sizeCacheKey, pkgData.size);
                        }
                    }
                } else {
                    list = [];
                }
            } else {
                const text = await resp.text();
                const lines = text.split('\n');
                let currentPackage = null;
                
                for (const line of lines) {
                    if (line.startsWith('Package: ')) {
                        currentPackage = line.substring(9).trim();
                        list.push(currentPackage);
                    } else if (line.startsWith('Size: ') && currentPackage) {
                        const size = parseInt(line.substring(6).trim());
                        if (size > 0) {
                            const sizeCacheKey = `${version}:${arch}:${currentPackage}`;
                            state.cache.packageSizes.set(sizeCacheKey, size);
                        }
                    }
                }
            }
            state.cache.feed.set(cacheKey, list);
        }

        const packages = state.cache.feed.get(cacheKey) || [];
        const q = query.toLowerCase();
        return packages.filter(name => name.toLowerCase().includes(q));
    } catch (err) {
        console.error('searchInFeed error:', err);
        return [];
    }
}

function showPackageSearchResults(results, inputElement) {
    
    clearPackageSearchResults();
    
    if (!results || results.length === 0) return;
    
    const container = document.getElementById('package-search-autocomplete');
    if (!container) return;
    
    const resultsDiv = document.createElement('div');
    resultsDiv.className = 'package-search-results';
    
    results.forEach(pkgName => {
        const item = document.createElement('div');
        item.textContent = pkgName;
        
        item.onmousedown = (e) => {
            e.preventDefault();
            
            console.log('Package selected:', pkgName);
            
            try {
                inputElement.dataset.programmaticChange = 'true';
                inputElement.value = pkgName;
                
                inputElement.setAttribute('data-confirmed', 'true');
                
                const inputIndex = state.ui.managers.packageSearch.inputs.indexOf(inputElement);
                if (inputIndex === state.ui.managers.packageSearch.inputs.length - 1) {
                    state.ui.managers.packageSearch.addInput('', true);
                }
                
                clearPackageSearchResults();
                state.ui.managers.packageSearch.options.onChange(state.ui.managers.packageSearch.getAllValues());
                updateAllPackageState('package-selected');
            } catch (error) {
                console.error('Error in package selection:', error);
            }
        };
  
        resultsDiv.appendChild(item);
    });
    
    container.appendChild(resultsDiv);
}

function clearPackageSearchResults() {
    const results = document.querySelectorAll('.package-search-results');
    results.forEach(el => el.remove());
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('#package-search-autocomplete')) {
        clearPackageSearchResults();
    }
});

function replaceAsuSection(asuSection, temp) {
    const newDiv = document.createElement('div');
    newDiv.id = 'asu';
    newDiv.className = asuSection.className;
    newDiv.style.width = '100%';
    
    const customPackages = temp.querySelector('#custom-packages-section details');
    const customScripts = temp.querySelector('#custom-scripts-section details');

    if (customPackages) {
        customPackages.id = 'custom-packages-details';
        newDiv.appendChild(customPackages);
    }
    if (customScripts) {
        customScripts.id = 'custom-scripts-details';
        newDiv.appendChild(customScripts);
    }

    const buildElements = document.createElement('div');
    buildElements.innerHTML = `
        <br>
        <div id="asu-buildstatus" class="hide">
            <span></span>
            <div id="asu-log" class="hide">
                <details>
                    <summary>
                        <code>STDERR</code>
                    </summary>
                    <pre id="asu-stderr"></pre>
                </details>
                <details>
                    <summary>
                        <code>STDOUT</code>
                    </summary>
                    <pre id="asu-stdout"></pre>
                </details>
            </div>
        </div>
        <textarea id="asu-packages" style="display:none;"></textarea>
        <a href="javascript:buildAsuRequest()" class="custom-link">
            <span></span><span class="tr-request-build">REQUEST BUILD</span>
        </a>
    `;
    
    while (buildElements.firstChild) {
        newDiv.appendChild(buildElements.firstChild);
    }
    
    asuSection.parentNode.replaceChild(newDiv, asuSection);
}

function cleanupExistingCustomElements() {
    ['#custom-packages-details', '#custom-scripts-details', '#extended-build-info']
        .forEach(selector => {
            const element = document.querySelector(selector);
            if (element) {
                element.remove();
                console.log(`Removed existing ${selector}`);
            }
        });
}

// ==================== 言語セレクター設定 ====================
function setupLanguageSelector() {
    const mainLanguageSelect = document.querySelector('#languages-select');
    const customLanguageSelect = document.querySelector('#aios-language');
    const fallback = config?.fallback_language || 'en';

    if (!current_language) {
        current_language = (navigator.language || navigator.userLanguage).toLowerCase().split('-')[0];
        state.ui.language.current = current_language;
    }
    if (!config.device_language) {
        config.device_language = current_language;
    }

    state.ui.language.selected = config.device_language;

    if (mainLanguageSelect) {
        mainLanguageSelect.value = current_language;
    }
    if (customLanguageSelect) {
        customLanguageSelect.value = state.ui.language.selected;
    }

    console.log('Language setup - Browser:', current_language, 'Device:', state.ui.language.selected);

    if (mainLanguageSelect) {
        mainLanguageSelect.removeEventListener('change', handleMainLanguageChange);
        mainLanguageSelect.addEventListener('change', handleMainLanguageChange);
    }
    if (customLanguageSelect) {
        customLanguageSelect.removeEventListener('change', handleCustomLanguageChange);
        customLanguageSelect.addEventListener('change', handleCustomLanguageChange);
    }
}

function syncBrowserLanguageSelector(lang) {
    const mainSelect = document.getElementById('languages-select');
    if (lang && mainSelect && mainSelect.value !== lang) {
        mainSelect.value = lang;
        console.log('Browser language selector synced to:', lang);
    }
}

function syncDeviceLanguageSelector(lang) {
    const customSelect = document.getElementById('aios-language');
    if (lang && customSelect && customSelect.value !== lang) {
        customSelect.removeEventListener('change', handleCustomLanguageChange);
        
        customSelect.value = lang;
        
        customSelect.addEventListener('change', handleCustomLanguageChange);
        
        console.log('Device language selector synced to:', lang);
    }
    state.ui.language.selected = lang;
}

async function handleMainLanguageChange(e) {
    const newLanguage = e?.target?.value || config?.fallback_language || 'en';
    if (newLanguage === current_language) return;

    const isUserAction = e && e.isTrusted === true;
    
    console.log('Main language change:', {
        newLanguage,
        oldLanguage: current_language,
        isUserAction,
        willSyncDevice: isUserAction
    });

    current_language = newLanguage;
    state.ui.language.current = newLanguage;
    
    await loadCustomTranslations(current_language);

    if (isUserAction) {
        const oldDeviceLanguage = state.ui.language.selected;
        config.device_language = current_language;
        state.ui.language.selected = current_language;
        
        syncDeviceLanguageSelector(state.ui.language.selected);
        
        console.log('Language sync completed:', {
            browser: current_language,
            device: state.ui.language.selected,
            changed: oldDeviceLanguage !== state.ui.language.selected
        });
        
        if (oldDeviceLanguage !== state.ui.language.selected) {
            updateAllPackageState('browser-language-changed');
        }
    } else {
        console.log('Programmatic change - device language not affected:', state.ui.language.selected);
    }

    if (typeof updateAutoConnectionInfo === 'function') {
        const info = state.autoConfig?.info || state.apiInfo;
        if (info) updateAutoConnectionInfo(info);
    }
}

async function handleCustomLanguageChange(e) {
    const newLanguage = e.target.value || config?.fallback_language || 'en';
    if (newLanguage === state.ui.language.selected) return;

    const oldDeviceLanguage = state.ui.language.selected;
    config.device_language = newLanguage;
    state.ui.language.selected = newLanguage;
    
    console.log('Device language change:', {
        newLanguage,
        oldLanguage: oldDeviceLanguage,
        browserUnchanged: current_language,
        note: 'Browser language intentionally not synced (one-way sync only)'
    });

    updateVariableDefinitions();
    updateAllPackageState('device-language-changed');
}

async function loadCustomTranslations(lang) {
    if (!lang) {
        lang = current_language || (navigator.language || config.fallback_language).split('-')[0];
    }
    
    const customLangFile = `langs/custom.${lang}.json`;
    try {
        const resp = await fetch(customLangFile, { cache: 'no-store' });

        if (!resp.ok) {
            if (lang !== config.fallback_language) {
                console.log(`Custom translation not found for ${lang}, falling back to ${config.fallback_language}`);
                return loadCustomTranslations(config.fallback_language);
            }
            console.log(`No custom translations available for ${lang}`);
            return;
        }

        applyCustomTranslations(JSON.parse(await resp.text()));
        
        console.log(`Custom translations loaded for UI language: ${lang}`);
    } catch (err) {
        console.error(`Error loading custom translations for ${lang}:`, err);
        if (lang !== config.fallback_language) {
            return loadCustomTranslations(config.fallback_language);
        }
    }
}

function applyCustomTranslations(map) {
    if (!map || typeof map !== 'object') return;
    
    Object.assign(current_language_json, map);
    
    for (const tr in map) {
        document.querySelectorAll(`.${tr}`).forEach(e => {
            if ('placeholder' in e) {
                e.placeholder = map[tr];
            } else {
                e.innerText = map[tr];
            }
        });
    }
    
    console.log('Custom translations applied to DOM');
}

function extractLuciName(pkg) {
    if (pkg === 'luci') return 'base';
    
    if (pkg === 'usteer-from-setup' || pkg === 'luci-app-usteer-setup') {
        return 'usteer';
    }

    const prefixMatch = pkg.match(/^luci-(?:app|mod|theme|proto)-(.+)$/);
    if (prefixMatch && prefixMatch[1]) {
        return prefixMatch[1];
    }
    return null;
}

function getCurrentPackageList() {
    const packages = new Set();
    
    state.packages.default.forEach(pkg => packages.add(pkg));
    state.packages.device.forEach(pkg => packages.add(pkg));
    state.packages.extra.forEach(pkg => packages.add(pkg));
    
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        if (pkgName) packages.add(pkgName);
    });
    
    if (state.ui.managers.packageSearch) {
        const searchValues = state.ui.managers.packageSearch.getAllValues();
        searchValues.forEach(pkg => packages.add(pkg));
    }
    
    const textarea = document.querySelector('#asu-packages');
    if (textarea) {
        const textPackages = CustomUtils.split(textarea.value);
        textPackages.forEach(pkg => {
            if (!state.packages.default.includes(pkg) && 
                !state.packages.device.includes(pkg) && 
                !state.packages.extra.includes(pkg)) {
                packages.add(pkg);
            }
        });
    }
    
    for (const pkg of state.packages.dynamic) {
        if (!pkg.startsWith('luci-i18n-')) {
            packages.add(pkg);
        }
    }
    
    return Array.from(packages);
}

function guessFeedForPackage(pkgName) {
    if (!pkgName) return 'packages';
    
    if (pkgName.startsWith('kmod-')) {
        return 'kmods';
    }
    
    if (pkgName.startsWith('luci-')) {
        return 'luci';
    }
    
    return 'packages';
}

function getDeviceInfo() {
    return {
        arch: state.device.arch,
        version: state.device.version || document.querySelector("#versions")?.value,
        vendor: state.device.vendor,
        subtarget: state.device.subtarget,
        isSnapshot: (state.device.version || document.querySelector("#versions")?.value || '').includes('SNAPSHOT')
    };
}

async function buildPackageUrl(feed, deviceInfo) {
    const { version, arch, vendor, subtarget, isSnapshot } = deviceInfo;
    
    if (feed === 'kmods') {
        if (!vendor || !subtarget) {
            throw new Error('Missing vendor or subtarget for kmods');
        }
        return await CustomUtils.buildKmodsUrl(version, vendor, isSnapshot);
    }
    
    if (feed === 'target') {
        if (!vendor || !subtarget) {
            throw new Error('Missing vendor or subtarget for target packages');
        }
        const template = isSnapshot ? config.apk_search_url : config.opkg_search_url;
        return template
            .replace('{version}', version)
            .replace('{arch}', arch)
            .replace('{feed}', `../../targets/${vendor}/${subtarget}/packages`);
    }
    
    const template = isSnapshot ? config.apk_search_url : config.opkg_search_url;
    return template
        .replace('{version}', version)
        .replace('{arch}', arch)
        .replace('{feed}', feed);
}

function parsePackageList(responseData, pkgName, isSnapshot) {
    if (isSnapshot) {
        if (Array.isArray(responseData.packages)) {
            return responseData.packages.some(p => p?.name === pkgName);
        } else if (responseData.packages && typeof responseData.packages === 'object') {
            return Object.prototype.hasOwnProperty.call(responseData.packages, pkgName);
        }
        return false;
    } else {
        return responseData.split('\n').some(line => line.trim() === `Package: ${pkgName}`);
    }
}

async function getFeedPackageSet(feed, deviceInfo) {
    const key = [
        deviceInfo.version,
        deviceInfo.arch,
        deviceInfo.vendor || '',
        deviceInfo.subtarget || '',
        deviceInfo.isSnapshot ? 'S' : 'R',
        feed
    ].join(':');

    if (state.cache.feedPackageSet.has(key)) {
        return state.cache.feedPackageSet.get(key);
    }

    const url = await buildPackageUrl(feed, deviceInfo);
    console.log(`[DEBUG] Fetching feed index for ${feed} at: ${url}`);

    const resp = await fetch(url, { cache: 'force-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const isSnapshot = deviceInfo.isSnapshot || (feed === 'kmods' && deviceInfo.isSnapshot);
    let pkgSet;

    if (isSnapshot) {
        const data = await resp.json();
        if (Array.isArray(data.packages)) {
            pkgSet = new Set(data.packages.map(p => p?.name).filter(Boolean));
        } else if (data.packages && typeof data.packages === 'object') {
            pkgSet = new Set(Object.keys(data.packages));
        } else {
            pkgSet = new Set();
        }
    } else {
        const text = await resp.text();
        const names = text.split('\n')
            .filter(line => line.startsWith('Package: '))
            .map(line => line.substring(9).trim())
            .filter(Boolean);
        pkgSet = new Set(names);
    }

    state.cache.feedPackageSet.set(key, pkgSet);
    return pkgSet;
}

async function isPackageAvailable(pkgName, feed) {
    if (!pkgName || !feed) return false;

    const deviceInfo = getDeviceInfo();
    if (!deviceInfo.arch || !deviceInfo.version) {
        console.log('Missing device info for package check:', deviceInfo);
        return false;
    }

    const cacheKey = `${deviceInfo.version}:${deviceInfo.arch}:${feed}:${pkgName}`;
    if (state.cache.packageAvailability.has(cacheKey)) {
        return state.cache.packageAvailability.get(cacheKey);
    }

    try {
        const pkgSet = await getFeedPackageSet(feed, deviceInfo);
        const result = pkgSet.has(pkgName);

        state.cache.packageAvailability.set(cacheKey, result);
        return result;
    } catch (err) {
        console.error('Package availability check error:', err);
        state.cache.packageAvailability.set(cacheKey, false);
        return false;
    }
}

// ==================== パッケージ存在確認 ====================
async function fetchFeedSet(feed, deviceInfo) {
    const url = await buildPackageUrl(feed, deviceInfo);
    const isSnapshot = deviceInfo.isSnapshot || (feed === 'kmods' && deviceInfo.isSnapshot);
    const resp = await fetch(url, { cache: 'force-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${feed} at ${url}`);

    if (isSnapshot) {
        const data = await resp.json();
        if (Array.isArray(data.packages)) {
            return new Set(data.packages.map(p => p?.name).filter(Boolean));
        } else if (data.packages && typeof data.packages === 'object') {
            for (const pkgName of Object.keys(data.packages)) {
                const pkgData = data.packages[pkgName];
                if (pkgData && pkgData.size) {
                    const sizeCacheKey = `${deviceInfo.version}:${deviceInfo.arch}:${pkgName}`;
                    state.cache.packageSizes.set(sizeCacheKey, pkgData.size);
                }
            }
            return new Set(Object.keys(data.packages));
        }
        return new Set();
    } else {
        const text = await resp.text();
        const lines = text.split('\n');
        const names = [];
        let currentPackage = null;
        
        for (const line of lines) {
            if (line.startsWith('Package: ')) {
                currentPackage = line.substring(9).trim();
                names.push(currentPackage);
            } else if (line.startsWith('Size: ') && currentPackage) {
                const size = parseInt(line.substring(6).trim());
                if (size > 0) {
                    const sizeCacheKey = `${deviceInfo.version}:${deviceInfo.arch}:${currentPackage}`;
                    state.cache.packageSizes.set(sizeCacheKey, size);
                }
            }
        }
        
        return new Set(names.filter(Boolean));
    }
}

async function buildAvailabilityIndex(deviceInfo, neededFeeds) {
    const cacheKey = [
        deviceInfo.version,
        deviceInfo.arch,
        deviceInfo.vendor || '',
        deviceInfo.subtarget || '',
        deviceInfo.isSnapshot ? 'S' : 'R'
    ].join(':');

    const cached = state.cache.availabilityIndex.get(cacheKey);
    if (cached) return cached;

    const index = { packages: new Set(), luci: new Set(), kmods: new Set(), base: new Set(), target: new Set() };
    const tasks = [];

    if (neededFeeds.has('packages')) {
        tasks.push(fetchFeedSet('packages', deviceInfo).then(set => index.packages = set).catch(() => (index.packages = new Set())));
    }
    if (neededFeeds.has('luci')) {
        tasks.push(fetchFeedSet('luci', deviceInfo).then(set => index.luci = set).catch(() => (index.luci = new Set())));
    }
    if (neededFeeds.has('base')) {
        tasks.push(fetchFeedSet('base', deviceInfo).then(set => index.base = set).catch(() => (index.base = new Set())));
    }
    if (neededFeeds.has('kmods')) {
        if (!deviceInfo.vendor || !deviceInfo.subtarget) {
            console.warn('[WARN] kmods feed required but vendor/subtarget missing; kmod checks will fail-open=false');
            index.kmods = new Set();
        } else {
            tasks.push(fetchFeedSet('kmods', deviceInfo).then(set => index.kmods = set).catch(() => (index.kmods = new Set())));
        }
    }
    if (neededFeeds.has('target')) {
        if (!deviceInfo.vendor || !deviceInfo.subtarget) {
            console.warn('[WARN] target feed required but vendor/subtarget missing');
            index.target = new Set();
        } else {
            tasks.push(fetchFeedSet('target', deviceInfo).then(set => index.target = set).catch(() => (index.target = new Set())));
        }
    }

    await Promise.all(tasks);
    state.cache.availabilityIndex.set(cacheKey, index);
    return index;
}

function isAvailableInIndex(pkgName, feed, index) {
    return index.packages.has(pkgName) || 
           index.luci.has(pkgName) || 
           index.base.has(pkgName) || 
           index.target.has(pkgName) || 
           index.kmods.has(pkgName);
}

async function verifyAllPackages() {
    const arch = state.device.arch;
    if (!state.packages.json || !arch) {
        console.log('Cannot verify packages: missing data');
        return;
    }

    const startTime = Date.now();
    console.log('Starting package verification...');

    const packagesToVerify = [];
    state.packages.json.categories.forEach(category => {
        category.packages.forEach(pkg => {
            packagesToVerify.push({
                id: pkg.id,
                uniqueId: pkg.uniqueId || pkg.id,
                feed: guessFeedForPackage(pkg.id),
                hidden: pkg.hidden || false,
                checked: pkg.checked || false
            });
            if (pkg.dependencies) {
                pkg.dependencies.forEach(depId => {
                    const depPkg = findPackageById(depId);
                    if (depPkg) {
                        packagesToVerify.push({
                            id: depPkg.id,
                            uniqueId: depPkg.uniqueId || depPkg.id,
                            feed: guessFeedForPackage(depPkg.id),
                            hidden: depPkg.hidden || false,
                            isDependency: true
                        });
                    }
                });
            }
        });
    });

    const uniquePackages = Array.from(new Set(packagesToVerify.map(p => `${p.id}:${p.feed}`)))
        .map(key => {
            const [id, feed] = key.split(':');
            const pkg = packagesToVerify.find(p => p.id === id && p.feed === feed);
            return pkg;
        });

    console.log(`Verifying ${uniquePackages.length} unique packages...`);

    const deviceInfo = getDeviceInfo();
    const neededFeeds = new Set(['base', 'packages', 'luci', 'target']);
    if (uniquePackages.some(p => p.feed === 'kmods')) {
        neededFeeds.add('kmods');
    }
    const index = await buildAvailabilityIndex(deviceInfo, neededFeeds);

    let unavailableCount = 0;
    const checkedUnavailable = [];

    for (const pkg of uniquePackages) {
        const available = isAvailableInIndex(pkg.id, pkg.feed, index);
        updatePackageAvailabilityUI(pkg.uniqueId, available);

        if (!available) {
            unavailableCount++;
            if (pkg.checked) checkedUnavailable.push(pkg.id);
        }
    }

    const elapsedTime = Date.now() - startTime;
    console.log(`Package verification completed in ${elapsedTime}ms`);
    console.log(`${unavailableCount} packages are not available for this device`);

    if (checkedUnavailable.length > 0) {
        console.warn('The following pre-selected packages are not available:', checkedUnavailable);
    }
    
    updatePackageSizeDisplay();
    
    updatePackageListToTextarea('package-verification-complete');
}

function updatePackageSizeDisplay() {
    if (!state.device.version || !state.device.arch) return;
    
    document.querySelectorAll('.package-selector-checkbox').forEach(checkbox => {
        const packageId = checkbox.getAttribute('data-package');
        if (!packageId) return;
        
        const label = checkbox.closest('label');
        if (!label) return;
        
        const packageName = label.getAttribute('data-package-name');
        if (!packageName) return;
        
        const sizeCacheKey = `${state.device.version}:${state.device.arch}:${packageId}`;
        const sizeBytes = state.cache.packageSizes.get(sizeCacheKey);
        
        const textElement = label.querySelector('a.package-link') || label.querySelector('span');
        if (!textElement) return;
        
        const currentText = textElement.textContent;
        const baseText = currentText.split(':')[0];

        if (typeof sizeBytes === 'number' && sizeBytes > 0) {
            const sizeKB = (sizeBytes / 1024).toFixed(1);
            textElement.textContent = `${baseText}: ${sizeKB} KB`;
        } else {
            textElement.textContent = baseText;
        }
    });
    
    console.log('Package size display updated');
}

function updatePackageAvailabilityUI(uniqueId, isAvailable) {
    const checkbox = document.querySelector(`#pkg-${uniqueId}`);
    if (!checkbox) return;
    
    const packageItem = checkbox.closest('.package-item');
    if (!packageItem) {
        const label = checkbox.closest('label');
        if (label) {
            UI.updateElement(label, { show: isAvailable });
            if (!isAvailable) checkbox.checked = false;
        }
        return;
    }
    
    const isMainPackage = !checkbox.closest('.package-dependent');
    
    if (isMainPackage) {
        if (isAvailable) {
            UI.updateElement(packageItem, { show: true });
        } else {
            UI.updateElement(packageItem, { show: false });
            checkbox.checked = false;
            const depCheckboxes = packageItem.querySelectorAll('.package-dependent input[type="checkbox"]');
            depCheckboxes.forEach(depCb => depCb.checked = false);
        }
    } else {
        const depLabel = checkbox.closest('label');
        if (depLabel) {
            UI.updateElement(depLabel, { show: isAvailable });
            if (!isAvailable) checkbox.checked = false;
        }
    }
    
    updateCategoryVisibility(packageItem);
}

function updateCategoryVisibility(packageItem) {
    const category = packageItem?.closest('.package-category');
    if (!category) return;
    
    const visiblePackages = category.querySelectorAll('.package-item:not([style*="display: none"])');
    
    if (visiblePackages.length === 0) {
        UI.updateElement(category, { show: false });
    } else {
        UI.updateElement(category, { show: true });
    }

}

// ==================== setup.json 処理 ====================
async function loadSetupConfig() {
    try {
        const url = config?.setup_db_path || 'uci-defaults/setup.json';
        const response = await fetch(url + '?t=' + Date.now());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        state.config.setup = await response.json();
        console.log('Setup config loaded (JSON-driven mode):', state.config.setup);
        
        state.config.formStructure = generateFormStructure(state.config.setup);
        storeDefaultValues(state.config.setup);
        renderSetupConfig(state.config.setup);
        
        console.log('Setup config rendered successfully with JSON-driven features');
        return state.config.setup;
    } catch (err) {
        console.error('Failed to load setup.json:', err);
        return null;
    }
}

function storeDefaultValues(config) {
    state.config.defaultValues = {};
    
    function walkFields(pkg) {
        if (pkg.defaultValue !== undefined && pkg.id) {
            state.config.defaultValues[pkg.id] = pkg.defaultValue;
        }
        if (pkg.children) {
            pkg.children.forEach(walkFields);
        }
        if (pkg.type === 'input-group' && pkg.rows) {
            pkg.rows.forEach(row => {
                if (row.columns) {
                    row.columns.forEach(walkFields);
                }
            });
        }
    }
    
    config.categories.forEach(category => {
        category.packages.forEach(walkFields);
    });
    
    console.log('Default values stored:', state.config.defaultValues);
}

function renderSetupConfig(config) {
    const container = document.querySelector('#dynamic-config-sections');
    if (!container) {
        console.error('#dynamic-config-sections not found');
        return;
    }
    
    container.innerHTML = '';
    console.log('Container cleared, rebuilding...');

    (config.categories || []).forEach((category, categoryIndex) => {
        const section = document.createElement('div');
        section.className = 'config-section';
        section.id = category.id;

        const h4 = document.createElement('h4');
        h4.textContent = category.name || category.id || '';
        if (category.class) {
            h4.classList.add(category.class);
        }
        section.appendChild(h4);
        if (category.description) {
            const desc = document.createElement('p');
            desc.className = 'package-category-description';
            desc.textContent = category.description;
            section.appendChild(desc);
        }

        (category.packages || []).forEach((pkg, packageIndex) => {
            try {
                buildField(section, pkg);
            } catch (error) {
                console.error(`Error rendering package ${pkg.id}:`, error);
            }
        });

        container.appendChild(section);
    });

    requestAnimationFrame(() => {
        initConditionalSections(config);

        if (state.apiInfo) {
            applyIspAutoConfig(state.apiInfo);
            displayIspInfo(state.apiInfo);
            console.log('Reapplied ISP config after form render');
        }

        const mapeTypeRadio = document.querySelector('input[name="mape_type"]:checked');
        if (mapeTypeRadio && mapeTypeRadio.value === 'pd') {
            const guaPrefixField = getEl('mapeGuaPrefix', '#mape-gua-prefix');
            if (guaPrefixField) {
                UI.updateElement(guaPrefixField, { show: false });
                console.log('Initial PD mode: GUA prefix hidden');
            }
        }
    });
}

function buildField(parent, pkg) {
    switch (pkg.type) {
        case 'input-group': {
            const rows = getRows(pkg);
            
            rows.forEach((row, rowIndex) => {
                const rowEl = document.createElement('div');
                rowEl.className = 'form-row';
                
                (row.columns || []).forEach((col, colIndex) => {
                    const groupEl = buildFormGroup(col);
                    if (groupEl) {
                        if (col.variableName === 'mape_gua_prefix') {
                            groupEl.setAttribute('data-show-when', 'mape_type:gua');
                            groupEl.style.display = 'none';
                        }
                        rowEl.appendChild(groupEl);
                    }
                });
                
                if (rowEl.children.length > 0) {
                    parent.appendChild(rowEl);
                }
            });
            break;
        }

case 'radio-group': {
    const row = document.createElement('div');
    row.className = 'form-row';

    const group = document.createElement('div');
    group.className = 'form-group';

    if (pkg.name || pkg.label) {
        const legend = document.createElement('div');
        legend.className = 'form-label';
        if (pkg.class) legend.classList.add(pkg.class);
        legend.textContent = pkg.name || pkg.label;
        group.appendChild(legend);
    }

    const radioWrap = document.createElement('div');
    radioWrap.className = 'radio-group';
    
    (pkg.options || []).forEach(opt => {
        const lbl = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = pkg.variableName || pkg.id;
        radio.value = opt.value;
        
        if (opt.checked || (pkg.defaultValue != null && opt.value === pkg.defaultValue)) {
            radio.checked = true;
        }

        const textSpan = document.createElement('span');
        textSpan.textContent = ' ' + (opt.label != null ? opt.label : String(opt.value));
        if (opt.class) {
            textSpan.classList.add(opt.class);
        }
        lbl.appendChild(radio);
        lbl.appendChild(textSpan);
        radioWrap.appendChild(lbl);
    });

    group.appendChild(radioWrap);
    row.appendChild(group);
    parent.appendChild(row);
    break;
}

        case 'conditional-section': {
            const condWrap = document.createElement('div');
            condWrap.id = pkg.id;
            condWrap.className = 'conditional-section';
            UI.updateElement(condWrap, { show: false });

            (pkg.children || []).forEach(child => {
                buildField(condWrap, child);
            });

            parent.appendChild(condWrap);
            break;
        }

        case 'info-display': {
          const infoDiv = document.createElement('div');
          infoDiv.id = pkg.id;
          infoDiv.className = 'info-display';
          if (pkg.class) {
              infoDiv.classList.add(pkg.class);
          }
          infoDiv.textContent = pkg.content || '';
          parent.appendChild(infoDiv);
          break;
        }
    }
}

function buildFormGroup(field) {
    if (!field) return null;

    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.textContent = field.label || field.name || field.id || '';
    if (field.id) label.setAttribute('for', field.id);
    if (field.class) {
        label.classList.add(field.class);
    }
    group.appendChild(label);

    let ctrl;
    if (field.type === 'select') {
        ctrl = document.createElement('select');
        if (field.id) ctrl.id = field.id;
        
        let optionsSource = [];
        if (field.id === 'aios-language') {
            const select = document.querySelector('#languages-select');
            if (select) {
                optionsSource = Array.from(select.querySelectorAll('option')).map(opt => ({
                    value: opt.value,
                    label: opt.textContent
                }));
            }
        } else {
            optionsSource = field.options || [];
        }

        optionsSource.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label != null ? opt.label : String(opt.value);
            if (opt.class) {
                option.classList.add(opt.class);
            }
            if (opt.selected || (field.defaultValue != null && opt.value === field.defaultValue)) {
                option.selected = true;
            }
            ctrl.appendChild(option);
        });

        if (field.id !== 'aios-language' && field.id !== 'languages-select') {
            ctrl.addEventListener('change', () => updateAllPackageState('form-field'));
        }
    } else {
        ctrl = document.createElement('input');
        ctrl.type = field.type || 'text';
        if (field.id) ctrl.id = field.id;
        if (field.placeholder) ctrl.placeholder = field.placeholder;
        let setValue = null;
        if (field.defaultValue !== null && field.defaultValue !== undefined && field.defaultValue !== '') {
            setValue = field.defaultValue;
        } else if (field.apiMapping && state.apiInfo) {
            const apiValue = CustomUtils.getNestedValue(state.apiInfo, field.apiMapping);
            if (apiValue !== null && apiValue !== undefined && apiValue !== '') {
                setValue = apiValue;
            }
        }
        if (setValue !== null) {
            UI.updateElement(ctrl, { value: setValue });
        }
        if (field.variableName === 'mape_gua_prefix') {
            CustomUtils.setGuaPrefixIfAvailable();
        }       
        if (field.min != null) ctrl.min = field.min;
        if (field.max != null) ctrl.max = field.max;
        if (field.maxlength != null) ctrl.maxLength = field.maxlength;
        if (field.pattern != null) ctrl.pattern = field.pattern;
        
        if (field.id !== 'aios-language' && field.id !== 'languages-select') {
            ctrl.addEventListener('input', () => updateAllPackageState('form-field'));
        }
    }
    
    group.appendChild(ctrl);

    if (field.description) {
        const small = document.createElement('small');
        small.className = 'text-muted';
        small.textContent = field.description;
        group.appendChild(small);
    }

    return group;
}

function initConditionalSections(config) {
    const conditionals = collectConditionals(config);
    const deps = buildDeps(conditionals);

    evaluateAll();

    for (const key of Object.keys(deps)) {
        const ctrls = findControlsByKey(key);
        
        ctrls.forEach(el => {
            const evt = el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number' || el.type === 'password') ? 'input' : 'change';
            el.addEventListener(evt, evaluateAll);
        });
    }

    function evaluateAll() {
        for (const cond of conditionals) {
            const visible = evaluateShowWhen(cond.showWhen, (key) => {
                return getFieldValue(key, { tryVariants: true, returnDefault: '' });
            });
            const el = document.getElementById(cond.id);
            if (!el) continue;
            UI.updateElement(el, { show: visible });
        }
    }
}

function findControlsByKey(key) {
    const keys = [key, key.replace(/-/g, '_'), key.replace(/_/g, '-')];
    const controls = [];
    
    for (const k of keys) {
        const radios = document.querySelectorAll(`input[type="radio"][name="${cssEscape(k)}"]`);
        controls.push(...radios);
        
        const byId = document.getElementById(k);
        if (byId) controls.push(byId);
        
        const byName = document.querySelectorAll(`[name="${cssEscape(k)}"]`);
        controls.push(...byName);
    }
    
    return [...new Set(controls)];
}

function collectConditionals(config) {
    const out = [];
    walkConfig(config, node => {
        if (node.type === 'conditional-section' && node.id && node.showWhen && node.showWhen.field) {
            out.push({ id: node.id, showWhen: node.showWhen });
        }
    });
    return out;
}

function buildDeps(conditionals) {
    const map = {};
    for (const c of conditionals) {
        const key = c.showWhen.field;
        if (!map[key]) map[key] = [];
        map[key].push(c.id);
    }
    return map;
}

function evaluateShowWhen(showWhen, getVal) {
    if (!showWhen || !showWhen.field) return true;
    const v = String(getVal(showWhen.field) ?? '');
    if (Array.isArray(showWhen.values)) {
        return showWhen.values.map(String).includes(v);
    }
    return Boolean(v);
}

function walkConfig(config, fn) {
    for (const cat of (config.categories || [])) {
        for (const pkg of (cat.packages || [])) walkNode(pkg, fn);
    }
    function walkNode(node, fn) {
        fn(node);
        if (node.type === 'input-group') {
            const rows = getRows(node);
            rows.forEach(r => (r.columns || []).forEach(col => walkNode(col, fn)));
        } else if (node.type === 'conditional-section') {
            (node.children || []).forEach(ch => walkNode(ch, fn));
        }
    }
}

function getRows(group) {
    const rows = [];
    const COLUMNS_PER_ROW = 2;
    const fields = group.fields || [];
    
    for (let i = 0; i < fields.length; i += COLUMNS_PER_ROW) {
        const columns = [];
        
        for (let j = 0; j < COLUMNS_PER_ROW && (i + j) < fields.length; j++) {
            columns.push(fields[i + j]);
        }
        
        rows.push({ columns: columns });
    }
    
    return rows;
}

function cssEscape(s) {
    return String(s).replace(/"/g, '\\"');
}

function generateFormStructure(config) {
    const structure = {
        fields: {},
        connectionTypes: {},
        categories: {},
        fieldMapping: {}
    };

    config.categories.forEach(category => {
        structure.categories[category.id] = [];

        category.packages.forEach(pkg => {
            collectFieldsFromPackage(pkg, structure, category.id);
        });
    });

    return structure;
}

function collectFieldsFromPackage(pkg, structure, categoryId) {
    if (pkg.selector) {
        const fieldInfo = {
            id: pkg.id,
            selector: pkg.selector,
            variableName: pkg.variableName || pkg.id.replace(/-/g, '_'),
            defaultValue: pkg.defaultValue,
            apiMapping: pkg.apiMapping
        };
        
        structure.fields[pkg.id] = fieldInfo;
        structure.categories[categoryId].push(pkg.id);
        structure.fieldMapping[pkg.selector] = fieldInfo;
    }
    
    if (pkg.children) {
        pkg.children.forEach(child => {
            collectFieldsFromPackage(child, structure, categoryId);
        });
    }
    
    if (pkg.type === 'input-group') {
        const rows = getRows(pkg);
        rows.forEach(row => {
            (row.columns || []).forEach(col => {
                collectFieldsFromPackage(col, structure, categoryId);
            });
        });
    }
    
    if (pkg.id === 'connection-type' && pkg.variableName === 'connection_type') {
        const connectionSections = ['auto-section', 'dhcp-section', 'pppoe-section', 'dslite-section', 'mape-section', 'ap-section'];
        connectionSections.forEach(sectionId => {
            structure.connectionTypes[sectionId.replace('-section', '')] = [];
        });
    }
}

// ==================== フォーム値処理 ====================

function collectFormValues() {
    const values = {};
    
    Object.values(state.config.formStructure.fields).forEach(field => {
        const value = getFieldValue(field.selector);
        
        // languageフィールドの場合、enは除外
        if (field.variableName === 'language' && value === 'en') {
            return; // forEach内ではcontinueではなくreturn
        }
        
        if (value !== null && value !== undefined && value !== "") {
            values[field.variableName] = value;
        }
    });
    
    applySpecialFieldLogic(values);
    
    return values;
}

function getFieldValue(selector, options = {}) {
    const tryVariants = options.tryVariants || false;
    const returnDefault = options.returnDefault !== undefined ? options.returnDefault : null;
    
    let element = null;
    
    if (tryVariants && typeof selector === 'string') {
        const keys = [selector, selector.replace(/-/g, '_'), selector.replace(/_/g, '-')];
        for (const k of keys) {
            const radios = document.querySelectorAll(`input[type="radio"][name="${cssEscape(k)}"]`);
            if (radios.length) {
                const checked = Array.from(radios).find(x => x.checked);
                if (checked) return checked.value;
            }
            
            element = document.getElementById(k) || document.querySelector(`[name="${cssEscape(k)}"]`);
            if (element) break;
        }
    } else {
        element = typeof selector === 'string' ? document.querySelector(selector) : selector;
    }
    
    if (!element) return returnDefault;
    
    if (element.type === 'radio') {
        const checked = document.querySelector(`input[name="${element.name}"]:checked`);
        return checked ? checked.value : returnDefault;
    } else if (element.type === 'checkbox') {
        return element.checked ? (element.value || 'on') : returnDefault;
    }
    
    return element.value !== undefined ? element.value : returnDefault;
}

// ==================== フォーム値処理（JSONドリブン版） ====================
function applySpecialFieldLogic(values) {
    const connectionType = getFieldValue('input[name="connection_type"]');
    
    const allConnectionFields = [];
    
    if (state.config.setup) {
        const internetCategory = state.config.setup.categories.find(cat => cat.id === 'internet-config');
        if (internetCategory) {
            internetCategory.packages.forEach(pkg => {
                if (pkg.type === 'conditional-section' && pkg.connectionFields) {
                    allConnectionFields.push(...pkg.connectionFields);
                }
            });
        }
    }
    
    const uniqueConnectionFields = [...new Set(allConnectionFields)];
    
    if (connectionType === 'auto') {
        uniqueConnectionFields.forEach(key => delete values[key]);
        
        if (state.apiInfo) {
            if (state.apiInfo.mape?.brIpv6Address) {
                values.mape_br = state.apiInfo.mape.brIpv6Address;
                values.mape_ealen = state.apiInfo.mape.eaBitLength;
                values.mape_ipv4_prefix = state.apiInfo.mape.ipv4Prefix;
                values.mape_ipv4_prefixlen = state.apiInfo.mape.ipv4PrefixLength;
                values.mape_ipv6_prefix = state.apiInfo.mape.ipv6Prefix;
                values.mape_ipv6_prefixlen = state.apiInfo.mape.ipv6PrefixLength;
                values.mape_psid_offset = state.apiInfo.mape.psIdOffset;
                values.mape_psidlen = state.apiInfo.mape.psidlen;
                
                const guaPrefix = CustomUtils.generateGuaPrefixFromFullAddress(state.apiInfo);
                if (guaPrefix) {
                    values.mape_gua_prefix = guaPrefix;
                }
            } else if (state.apiInfo.aftr?.aftrIpv6Address) {
                values.dslite_aftr_address = state.apiInfo.aftr.aftrIpv6Address;
            }
        }
    } else {
        const internetCategory = state.config.setup?.categories.find(cat => cat.id === 'internet-config');
        if (internetCategory) {
            const selectedSection = internetCategory.packages.find(pkg => 
                pkg.type === 'conditional-section' && 
                pkg.showWhen?.values?.includes(connectionType)
            );
            
            if (selectedSection?.connectionFields) {
                uniqueConnectionFields.forEach(key => {
                    if (!selectedSection.connectionFields.includes(key)) {
                        delete values[key];
                    }
                });
                
                if (connectionType === 'dslite') {
                    if (state.apiInfo?.aftr) {
                        values.dslite_aftr_type = state.apiInfo.aftr.aftrType || '';
                        values.dslite_area = state.apiInfo.aftr.jurisdiction || '';
                        values.dslite_aftr_address = state.apiInfo.aftr.aftrIpv6Address || '';
                    }
                    
                    const uiType = getFieldValue('#dslite-aftr-type');
                    const uiArea = getFieldValue('#dslite-area');
                    const uiAddr = getFieldValue('#dslite-aftr-address');
                    if (uiType) values.dslite_aftr_type = uiType;
                    if (uiArea) values.dslite_area = uiArea;
                    if (state.apiInfo?.aftr?.aftrIpv6Address) {
                        values.dslite_aftr_address = state.apiInfo.aftr.aftrIpv6Address;
                    } else if (uiAddr) {
                        values.dslite_aftr_address = uiAddr;
                    }
                } else if (connectionType === 'mape') {
                    if (state.apiInfo?.mape?.brIpv6Address) {
                        values.mape_br = state.apiInfo.mape.brIpv6Address;
                        values.mape_ealen = state.apiInfo.mape.eaBitLength;
                        values.mape_ipv4_prefix = state.apiInfo.mape.ipv4Prefix;
                        values.mape_ipv4_prefixlen = state.apiInfo.mape.ipv4PrefixLength;
                        values.mape_ipv6_prefix = state.apiInfo.mape.ipv6Prefix;
                        values.mape_ipv6_prefixlen = state.apiInfo.mape.ipv6PrefixLength;
                        values.mape_psid_offset = state.apiInfo.mape.psIdOffset;
                        values.mape_psidlen = state.apiInfo.mape.psidlen;
                        
                        const guaPrefix = CustomUtils.generateGuaPrefixFromFullAddress(state.apiInfo);
                        if (guaPrefix) {
                            values.mape_gua_prefix = guaPrefix;
                        }
                    }
                    
                    const mapeType = getFieldValue('input[name="mape_type"]');
                    if (mapeType === 'gua') {
                        const currentGUAValue = getFieldValue('#mape-gua-prefix');
                        if (currentGUAValue) {
                            values.mape_gua_prefix = currentGUAValue;
                        } else if (!values.mape_gua_prefix && state.apiInfo?.ipv6) {
                            const guaPrefix = CustomUtils.generateGuaPrefixFromFullAddress(state.apiInfo);
                            if (guaPrefix) {
                                values.mape_gua_prefix = guaPrefix;
                            }
                        }
                    } else if (mapeType === 'pd') {
                        delete values.mape_gua_prefix;
                    }
                }
            }
        }
    }
    
    const wifiMode = getFieldValue('input[name="wifi_mode"]');
    
    if (wifiMode === 'disabled') {
        ['wlan_ssid', 'wlan_password', 'enable_usteer', 'mobility_domain', 'snr'].forEach(key => {
            delete values[key];
        });
    } else if (wifiMode === 'standard') {
        const ssid = getFieldValue('#aios-wifi-ssid');
        const password = getFieldValue('#aios-wifi-password');
        
        if (ssid) values.wlan_ssid = ssid;
        if (password) values.wlan_password = password;
        
        delete values.enable_usteer;
        delete values.mobility_domain;
        delete values.snr;
    } else if (wifiMode === 'usteer') {
        const ssid = getFieldValue('#aios-wifi-ssid');
        const password = getFieldValue('#aios-wifi-password');
        const mobility = getFieldValue('#aios-wifi-mobility-domain');
        const snr = getFieldValue('#aios-wifi-snr');
        
        if (ssid) values.wlan_ssid = ssid;
        if (password) values.wlan_password = password;
        if (mobility) values.mobility_domain = mobility;
        if (snr) values.snr = snr;
        values.enable_usteer = '1';
    }

    const netOptimizer = getFieldValue('input[name="net_optimizer"]');
    
    if (netOptimizer === 'disabled') {
        ['enable_netopt', 'netopt_rmem', 'netopt_wmem', 'netopt_conntrack', 
         'netopt_backlog', 'netopt_somaxconn', 'netopt_congestion'].forEach(key => {
            delete values[key];
        });
    } else if (netOptimizer === 'auto') {
        values.enable_netopt = '1';
        
        ['netopt_rmem', 'netopt_wmem', 'netopt_conntrack', 
         'netopt_backlog', 'netopt_somaxconn', 'netopt_congestion'].forEach(key => {
            delete values[key];
        });
    } else if (netOptimizer === 'manual') {
        values.enable_netopt = '1';
        
        const rmem = getFieldValue('#netopt-rmem');
        const wmem = getFieldValue('#netopt-wmem');
        const conntrack = getFieldValue('#netopt-conntrack');
        const backlog = getFieldValue('#netopt-backlog');
        const somaxconn = getFieldValue('#netopt-somaxconn');
        const congestion = getFieldValue('#netopt-congestion');
        
        if (rmem) values.netopt_rmem = rmem;
        if (wmem) values.netopt_wmem = wmem;
        if (conntrack) values.netopt_conntrack = conntrack;
        if (backlog) values.netopt_backlog = backlog;
        if (somaxconn) values.netopt_somaxconn = somaxconn;
        if (congestion) values.netopt_congestion = congestion;
    }
    
    const dnsmasqMode = getFieldValue('input[name="enable_dnsmasq"]:checked');

    if (dnsmasqMode === 'disabled') {
        delete values.enable_dnsmasq;
        delete values.dnsmasq_cache;
        delete values.dnsmasq_negcache;

    } else if (dnsmasqMode === 'auto') {
        values.enable_dnsmasq = '1';
        delete values.dnsmasq_cache;
        delete values.dnsmasq_negcache;

    } else if (dnsmasqMode === 'manual') {
        values.enable_dnsmasq = '1';
        const cacheSize = getFieldValue('#dnsmasq-cache');
        const negCache = getFieldValue('#dnsmasq-negcache');

        if (cacheSize) {
            values.dnsmasq_cache = cacheSize;
        } else {
            delete values.dnsmasq_cache;
        }

        if (negCache) {
            values.dnsmasq_negcache = negCache;
        } else {
            delete values.dnsmasq_negcache;
        }
    }
}

// ==================== イベントハンドラ（JSONドリブン版） ====================

function setupEventListeners() {
    const radioGroups = {
        'connection_type': handleConnectionTypeChange,
        'net_optimizer': handleNetOptimizerChange,
        'wifi_mode': handleWifiModeChange,
        'mape_type': handleMapeTypeChange,
        'enable_dnsmasq': handleDnsmasqChange
    };
    
    Object.entries(radioGroups).forEach(([name, handler]) => {
        attachRadioListeners(name, handler, true);
    });

    setupDsliteAddressComputation();
    setupCommandsInput();
}

function attachRadioListeners(name, handler, triggerInitial = true) {
    document.querySelectorAll(`input[name="${name}"]`).forEach(radio => {
        radio.removeEventListener('change', handler);
        radio.addEventListener('change', handler);
    });
    
    if (triggerInitial) {
        const checked = document.querySelector(`input[name="${name}"]:checked`);
        if (checked) {
            handler({ target: checked });
        }
    }
}

function setupCommandsInput() {
    console.log('setupCommandsInput called');

    const commandsContainer = document.getElementById('commands-autocomplete');

    if (!commandsContainer) {
        console.log('commands-autocomplete container not found');
        return;
    }

    const oldInput = document.getElementById('command');
    if (oldInput) {
        oldInput.remove();
    }

    state.ui.managers.commands = new MultiInputManager('commands-autocomplete', {
        placeholder: 'Type command and press Enter',
        className: 'multi-input-item command-input',
        onAdd: (command) => {
            console.log('Command added:', command);
            updateCustomCommands();
        },
        onRemove: (command) => {
            console.log('Command removed:', command);
            updateCustomCommands();
        },
        onChange: (values) => {
            updateCustomCommands();
        }
    });

    console.log('Commands input setup complete');
}

function handleMapeTypeChange(e) {
    const mapeType = e.target.value;
    
    document.querySelectorAll('[data-show-when^="mape_type:"]').forEach(el => {
        const condition = el.getAttribute('data-show-when');
        const expectedValue = condition.split(':')[1];
        if (mapeType === expectedValue) {
            el.style.display = '';
            if (mapeType === 'gua') {
                const field = el.querySelector('#mape-gua-prefix');
                if (field && state.apiInfo?.ipv6) {
                    const guaPrefix = CustomUtils.generateGuaPrefixFromFullAddress(state.apiInfo);
                    if (guaPrefix && !field.value) {
                        field.value = guaPrefix;
                    }
                }
            }
        } else {
            el.style.display = 'none';
            if (mapeType === 'pd') {
                const field = el.querySelector('#mape-gua-prefix');
                if (field) {
                    field.value = '';
                }
            }
        }
    });

    updateAllPackageState('mape-type');
}

function setupDsliteAddressComputation() {
    const aftrType = document.querySelector('#dslite-aftr-type');
    const aftrArea = document.querySelector('#dslite-area');
    const aftrAddr = document.querySelector('#dslite-aftr-address');

    if (!aftrType || !aftrArea || !aftrAddr) return;

    function getAddressMap() {
        const internetCategory = state.config.setup.categories.find(cat => cat.id === 'internet-config');
        const dsliteSection = internetCategory.packages.find(pkg => pkg.id === 'dslite-section');
        const dsliteFields = dsliteSection.children.find(child => child.id === 'dslite-fields');
        const aftrTypeField = dsliteFields.fields.find(field => field.id === 'dslite-aftr-type');
        return aftrTypeField.computeField.addressMap;
    }

    function computeAftrAddress(type, area) {
        const addressMap = getAddressMap();
        return addressMap[type]?.[area] || '';
    }

    function syncAftrAddress(force = false) {
        const computed = computeAftrAddress(aftrType.value, aftrArea.value);
        if (!computed) return;
        
        if (force || !aftrAddr.value) {
            aftrAddr.value = computed;
            updateVariableDefinitions();
        }
    }

    aftrType.addEventListener('change', () => {
        syncAftrAddress(true);
        updateVariableDefinitionsWithDsliteCleanup();
    });
    
    aftrArea.addEventListener('change', () => {
        syncAftrAddress(true);
        updateVariableDefinitionsWithDsliteCleanup();
    });
    
    queueMicrotask(() => syncAftrAddress(false));
}

function updateVariableDefinitionsWithDsliteCleanup() {
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    if (!textarea) return;
    
    const values = collectFormValues();
    let emissionValues = { ...values };
    
    delete emissionValues.dslite_aftr_type;
    delete emissionValues.dslite_area;
    
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const enableVar = cb.getAttribute('data-enable-var');
        if (enableVar) {
            emissionValues[enableVar] = '1';
        }
    });
    
    const variableDefinitions = generateVariableDefinitions(emissionValues);
    updateTextareaContent(textarea, variableDefinitions);
}

function handleConditionalSectionChange(categoryId, fieldName, selectedValue, options = {}) {
    const category = state.config.setup.categories.find(cat => cat.id === categoryId);
    if (!category) return;
    
    category.packages.forEach(pkg => {
        if (pkg.type === 'conditional-section' && pkg.showWhen?.field === fieldName) {
            const section = document.querySelector(`#${pkg.id}`);
            if (!section) return;
            
            const shouldShow = pkg.showWhen.values?.includes(selectedValue);
            
            if (shouldShow) {
                CustomUtils.show(section);
                
                if (pkg.children && options.processChildren) {
                    processNestedSections(pkg.children, fieldName, selectedValue);
                }
            } else {
                CustomUtils.hide(section);
            }
        }
    });
    
    if (options.customHandler) {
        options.customHandler(selectedValue);
    }
    
    updateAllPackageState(options.updateSource || fieldName);
}

function processNestedSections(children, fieldName, selectedValue) {
    children.forEach(child => {
        if (child.type === 'conditional-section') {
            const childSection = document.querySelector(`#${child.id}`);
            if (childSection) {
                if (child.showWhen?.values?.includes(selectedValue)) {
                    CustomUtils.show(childSection);
                } else {
                    CustomUtils.hide(childSection);
                }
            }
        }
    });
}

function handleConnectionTypeChange(e) {
    const selectedType = e.target.value;
    
    handleConditionalSectionChange('internet-config', 'connection_type', selectedType, {
        updateSource: 'connection-type',
        customHandler: (value) => {
            if (value === 'auto' && state.apiInfo) {
                updateAutoConnectionInfo(state.apiInfo);
            } else if (value === 'mape' && state.apiInfo) {
                const guaPrefixField = getEl('mapeGuaPrefix', '#mape-gua-prefix');
                if (guaPrefixField && state.apiInfo.ipv6) {
                    const guaPrefix = CustomUtils.generateGuaPrefixFromFullAddress(state.apiInfo);
                    if (guaPrefix && !guaPrefixField.value) {
                        guaPrefixField.value = guaPrefix;
                        console.log('GUA prefix set for MAP-E:', guaPrefix);
                    }
                }
            }
        }
    });
}

function handleNetOptimizerChange(e) {
    const mode = e.target.value;
    
    handleConditionalSectionChange('tuning-config', 'net_optimizer', mode, {
        updateSource: 'net-optimizer',
        customHandler: (value) => {
            if (value === 'manual') {
                restoreDefaultsFromJSON('netopt-manual-section');
            }
        }
    });
}

function handleWifiModeChange(e) {
    const mode = e.target.value;
    
    handleConditionalSectionChange('wifi-config', 'wifi_mode', mode, {
        processChildren: true,
        updateSource: 'wifi-mode',
        customHandler: (value) => {
            if (value === 'disabled') {
                CustomUtils.clearWifiFields();
            } else {
                CustomUtils.restoreWifiDefaults();
            }
        }
    });
}

function handleDnsmasqChange(e) {
    const mode = e.target.value;
    
    handleConditionalSectionChange('tuning-config', 'enable_dnsmasq', mode, {
        updateSource: 'dnsmasq-mode',
        customHandler: (value) => {
            if (value === 'manual') {
                restoreDefaultsFromJSON('dnsmasq-manual-section');
            }
        }
    });
}

console.log('custom.js (JSON-driven clean version) fully loaded and ready');

// ==================== ISP情報処理 ====================

function getConnectionType(apiInfo) {
    if (apiInfo?.mape?.brIpv6Address) return 'MAP-E';
    if (apiInfo?.aftr) return 'DS-Lite';
    return 'DHCP/PPPoE';
}

async function fetchAndDisplayIspInfo() {
    if (!config?.auto_config_api_url) return;
    
    try {
        const response = await fetch(config.auto_config_api_url);
        const apiInfo = await response.json();
        state.apiInfo = apiInfo;
        
        console.log('ISP info fetched:', apiInfo);
        
        displayIspInfoIfReady();
        updateAutoConnectionInfo(apiInfo);
        CustomUtils.setGuaPrefixIfAvailable();

    } catch (err) {
        console.error('Failed to fetch ISP info:', err);
        const autoInfo = document.querySelector('#auto-info');
        if (autoInfo) {
            autoInfo.textContent = 'Failed to detect connection type.\nPlease select manually.';
        }
    }
}

function displayIspInfoIfReady() {
    if (!state.apiInfo) {
        return false;
    }
    
    const firstElement = document.querySelector('#auto-config-country');
    if (!firstElement) {
        return false;
    }
    
    displayIspInfo(state.apiInfo);

    const extInfo = document.querySelector('#extended-build-info');
    if (extInfo) {
        extInfo.classList.remove('hide');
        extInfo.style.display = 'block';
    }
    
    console.log('ISP info displayed');
    return true;
}

function displayIspInfo(apiInfo) {
    if (!apiInfo) return;

    UI.updateElement("auto-config-country", { text: apiInfo.country || "Unknown" });
    UI.updateElement("auto-config-timezone", { text: apiInfo.timezone || "Unknown" });
    UI.updateElement("auto-config-zonename", { text: apiInfo.zonename || "Unknown" });
    UI.updateElement("auto-config-isp", { text: apiInfo.isp || "Unknown" });
    UI.updateElement("auto-config-as", { text: apiInfo.as || "Unknown" });
    UI.updateElement("auto-config-ip", { text: [apiInfo.ipv4, apiInfo.ipv6].filter(Boolean).join(" / ") || "Unknown" });

    const wanType = getConnectionType(apiInfo);
    UI.updateElement("auto-config-method", { text: wanType });
    UI.updateElement("auto-config-notice", { text: apiInfo.notice || "" });

    UI.updateElement("extended-build-info", { show: true });
}

async function insertExtendedInfo(temp) {
    if (document.querySelector('#extended-build-info')) {
        console.log('Extended info already exists');
        return;
    }

    const imageLink = document.querySelector('#image-link');
    if (!imageLink) {
        console.log('Image link element not found');
        return;
    }

    try {
        const infoUrl = config?.information_path || 'auto-config/information.json';
        const response = await fetch(infoUrl + '?t=' + Date.now());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const infoConfig = await response.json();
        console.log('Information config loaded:', infoConfig);

        const extendedInfo = document.createElement('div');
        extendedInfo.id = 'extended-build-info';
        extendedInfo.className = 'hide';

        infoConfig.categories.forEach(category => {
            const h3 = document.createElement('h3');
            h3.textContent = category.name;
            if (category.class) h3.classList.add(category.class);
            extendedInfo.appendChild(h3);

            category.packages.forEach(pkg => {
                if (pkg.fields) {
                    pkg.fields.forEach(field => {
                        const row = document.createElement('div');
                        row.className = 'row';

                        const col1 = document.createElement('div');
                        col1.className = 'col1';
                        if (field.class) col1.classList.add(field.class);
                        col1.textContent = field.label;

                        const col2 = document.createElement('div');
                        col2.className = 'col2';
                        col2.id = field.id;
                        col2.textContent = current_language_json?.['tr-loading'] || 'Loading...';

                        row.appendChild(col1);
                        row.appendChild(col2);
                        extendedInfo.appendChild(row);
                    });
                }
            });
        });

        imageLink.closest('.row').insertAdjacentElement('afterend', extendedInfo);

        console.log('Extended info DOM elements created from information.json');

        if (state.apiInfo) {
            displayIspInfo(state.apiInfo);
        }

    } catch (err) {
        console.error('Failed to load information.json:', err);
    }
}

async function initializeCustomFeatures(asuSection, temp) {
    console.log('initializeCustomFeatures called');

    if (state.ui.initialized) {
        console.log('Already initialized, skipping');
        return;
    }

    cleanupExistingCustomElements();
    replaceAsuSection(asuSection, temp);
    
    if (!document.querySelector('#extended-build-info')) {
        await insertExtendedInfo(temp);
    }

    if (state.apiInfo) {
        displayIspInfoIfReady();
    }
    
    await Promise.all([
        window.autoConfigPromise,
        window.informationPromise,
        window.packagesDbPromise,
        window.setupJsonPromise,
        loadSetupConfig(),
        loadPackageDatabase(),
        fetchAndDisplayIspInfo()
    ]);

    setupEventListeners();
    loadUciDefaultsTemplate();

    setupLanguageSelector();

    setupPackageSearch();
    console.log('Package search initialized');

    await loadCustomTranslations(current_language);

    setupFormWatchers();

    let changed = false;
    if (window.autoConfigData || state.apiInfo) {
        changed = applyIspAutoConfig(window.autoConfigData || state.apiInfo);
    }

    generatePackageSelector();

    if (state.packages.default.length > 0 || state.packages.device.length > 0 || state.packages.extra.length > 0) {
        console.log('Force applying existing device packages');
        const initialPackages = state.packages.default
            .concat(state.packages.device)
            .concat(state.packages.extra);

        const textarea = document.querySelector('#asu-packages');
        if (textarea && initialPackages.length > 0) {
            UI.updateElement(textarea, { value: initialPackages.join(' ') });
            console.log('Device packages force applied:', initialPackages);
        }
    }

    if (changed) {
        console.log('All data and UI ready, updating package state');
        updateAllPackageState('isp-auto-config');
    } else {
        console.log('All data and UI ready, no changes from auto-config');
        const runWhenReady = () => {
            if ((state.packages.default && state.packages.default.length > 0) ||
                (state.packages.device && state.packages.device.length > 0) ||
                (state.packages.extra && state.packages.extra.length > 0)) {
                updateAllPackageState('force-device-packages');
                document.removeEventListener('devicePackagesReady', runWhenReady);
            }
        };
        document.addEventListener('devicePackagesReady', runWhenReady);
    }

    state.ui.initialized = true;
}

function applyIspAutoConfig(apiInfo) {
    if (!apiInfo || !state.config.formStructure || !state.config.formStructure.fields) {
        console.warn('applyIspAutoConfig: formStructure not ready, skipping');
        return false;
    }

    const rawType = getFieldValue('input[name="connection_type"]');
    const connectionType = (rawType === null || rawType === undefined || rawType === '') ? 'auto' : rawType;

    let mutated = false;

    Object.values(state.config.formStructure.fields).forEach(field => {
        if (!field.apiMapping) return;

        const isConnectionField = ['dslite', 'mape', 'ap', 'pppoe'].some(type =>
            state.config.formStructure.connectionTypes[type]?.includes(field.id)
        );

        if (isConnectionField && connectionType !== 'auto') {
            return;
        }

        let value = CustomUtils.getNestedValue(apiInfo, field.apiMapping);

        if (field.variableName === 'mape_gua_prefix') {
            const guaPrefix = CustomUtils.generateGuaPrefixFromFullAddress(state.apiInfo);
            if (guaPrefix) value = guaPrefix;
        }

        if (value !== null && value !== undefined && value !== '') {
            const element = document.querySelector(field.selector);
            if (element && element.value !== String(value)) {
                UI.updateElement(element, { value: value });
                mutated = true;
            }
        }
    });

    if (mutated) {
        CustomUtils.setGuaPrefixIfAvailable();
        updateAutoConnectionInfo(apiInfo);
    }

    return mutated;
}

function updateAutoConnectionInfo(apiInfo) {
    const autoInfo = document.querySelector('#auto-info');
    if (!autoInfo) return;
    let infoText = '';
    if (apiInfo?.isp) {
        infoText += `ISP: ${apiInfo.isp}<br>`;
        if (apiInfo.as) {
            infoText += `AS: ${apiInfo.as}<br>`;
        }
    }
    
    const connectionType = getConnectionType(apiInfo);
    if (connectionType === 'MAP-E') {
        let gua = apiInfo.guaPrefix;
        if (!gua) {
            try {
                gua = CustomUtils.generateGuaPrefixFromFullAddress(state.apiInfo || apiInfo) || null;
            } catch (e) {}
        }
        if (!gua) {
            const guaField = document.querySelector('#mape-gua-prefix');
            if (guaField && guaField.value) gua = guaField.value;
        }
        
        infoText += `${current_language_json['tr-auto-detection'] || 'Auto Detection:'} ${connectionType}<br>`;
        infoText += `<hr>`;
        infoText += `<p>${current_language_json['tr-mape-notice1'] || 'Note: Actual values may differ.'}</p>`;
        infoText += `option peeraddr ${apiInfo.mape.brIpv6Address}<br>`;
        infoText += `option ipaddr ${apiInfo.mape.ipv4Prefix}<br>`;
        infoText += `option ip4prefixlen ${apiInfo.mape.ipv4PrefixLength}<br>`;
        infoText += `option ip6prefix ${apiInfo.mape.ipv6Prefix}<br>`;
        infoText += `option ip6prefixlen ${apiInfo.mape.ipv6PrefixLength}<br>`;
        infoText += `option ealen ${apiInfo.mape.eaBitLength}<br>`;
        infoText += `option psidlen ${apiInfo.mape.psidlen}<br>`;
        infoText += `option offset ${apiInfo.mape.psIdOffset}<br>`;
        if (gua) {
            infoText += `option ip6prefix_gua ${gua}<br>`;
        }
        infoText += `<br>`;
        infoText += `export LEGACY=1<br>`;
        infoText += `<hr>`;
        infoText += `<span style="color:blue">(config-softwire)#</span> <strong>map-version draft</strong><br>`;
        infoText += `<span style="color:blue">(config-softwire)#</span> <strong>rule <span style="color:blue">&lt;0-65535&gt;</span> ipv4-prefix <span style="color:blue">${apiInfo.mape.ipv4Prefix}/${apiInfo.mape.ipv4PrefixLength}</span> ipv6-prefix <span style="color:blue">${apiInfo.mape.ipv6Prefix}/${apiInfo.mape.ipv6PrefixLength}</span></strong> [ea-length <span style="color:blue">${apiInfo.mape.eaBitLength}</span>|psid-length <span style="color:blue">${apiInfo.mape.psidlen}</span>] [offset <span style="color:blue">${apiInfo.mape.psIdOffset}</span>] [forwarding]<br>`;
        infoText += `<hr>`;
        infoText += `<div style="text-align: center;"><a href="https://ipv4.web.fc2.com/map-e.html" target="_blank">Powered by config-softwire</a></div>`;     
    } else if (connectionType === 'DS-Lite') {
        infoText += `${current_language_json['tr-auto-detection'] || 'Auto Detection:'} ${connectionType}<br>`;
        infoText += `<hr>`;
        infoText += `<h4>${current_language_json['tr-dslite-notice1'] || 'Note: Actual values may differ.'}</h4>`;
        infoText += `<hr>`;
        if (apiInfo.aftr?.aftrIpv6Address) {
            infoText += `option aftr_addr ${apiInfo.aftr.aftrIpv6Address}<br>`;
        }
        if (apiInfo.aftr?.aftrType) {
            infoText += `option aftr_type ${apiInfo.aftr.aftrType}<br>`;
        }
        if (apiInfo.aftr?.jurisdiction) {
            infoText += `option area ${apiInfo.aftr.jurisdiction}<br>`;
        }
        infoText += `<hr>`;
    } else {
        infoText += `${current_language_json['tr-auto-detection'] || 'Auto Detection:'} ${connectionType}<br>`;
        infoText += `${current_language_json['tr-standard-notice'] || 'Standard connection will be used'}`;
    }
    autoInfo.innerHTML = infoText;
}

// ==================== パッケージ管理 ====================

async function loadPackageDatabase() {
    try {
        const url = config?.packages_db_path || 'packages/packages.json';
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        state.packages.json = await response.json();
        console.log('Package database loaded:', state.packages.json);
        
        return state.packages.json;
    } catch (err) {
        console.error('Failed to load package database:', err);
        return null;
    }
}

function generatePackageSelector() {
    const container = document.querySelector('#package-categories');
    if (!container || !state.packages.json) {
        return;
    }
    
    container.innerHTML = '';
    
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'package-loading-indicator';
    UI.updateElement(loadingDiv, { show: false });
    loadingDiv.style.padding = '1em';
    loadingDiv.style.textAlign = 'center';
    loadingDiv.style.color = 'var(--text-muted)';
    loadingDiv.innerHTML = '<span class="tr-checking-packages">Checking package availability...</span>';
    container.appendChild(loadingDiv);
    
    state.packages.json.categories.forEach(category => {
        if (category.hidden) {
            console.log(`Processing hidden category: ${category.id}`);
            category.packages.forEach(pkg => {
                if (pkg.hidden) {
                    createHiddenPackageCheckbox(pkg);
                }
            });
            return;
        }
        
        const categoryDiv = createPackageCategory(category);
        if (categoryDiv) {
            container.appendChild(categoryDiv);
        }
    });
    
    updateAllPackageState('package-selector-init');
    console.log(`Generated ${state.packages.json.categories.length} package categories (including hidden)`);
    
    const arch = state.device.arch;
    if (arch) {
        requestAnimationFrame(() => {
            const indicator = document.querySelector('#package-loading-indicator');
            if (indicator) {
                UI.updateElement(indicator, { show: true });
            }

            verifyAllPackages().then(() => {
                if (indicator) {
                    UI.updateElement(indicator, { show: false });
                }
                console.log('Package verification completed');
            }).catch(err => {
                console.error('Package verification failed:', err);
                if (indicator) {
                    UI.updateElement(indicator, {
                        html: '<span class="tr-package-check-failed">Package availability check failed</span>',
                        show: true
                    });
                    indicator.addEventListener('click', () => {
                        UI.updateElement(indicator, { show: false });
                    }, { once: true });
                }
            });
        });
    } else {
        console.log('Device architecture not available, skipping package verification');
    }
    
    if (state.cache.packageSizes.size > 0) {
        requestAnimationFrame(() => {
            updatePackageSizeDisplay();
        });
    }
}

function createHiddenPackageCheckbox(pkg) {
    let hiddenContainer = document.querySelector('#hidden-packages-container');
    if (!hiddenContainer) {
        hiddenContainer = document.createElement('div');
        hiddenContainer.id = 'hidden-packages-container';
        UI.updateElement(hiddenContainer, { show: false });
        document.body.appendChild(hiddenContainer);
    }
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `pkg-${pkg.uniqueId || pkg.id}`;
    checkbox.className = 'package-selector-checkbox';
    checkbox.setAttribute('data-package', pkg.id);
    checkbox.setAttribute('data-unique-id', pkg.uniqueId || pkg.id);
    UI.updateElement(checkbox, { show: false });
    
    if (pkg.dependencies) {
        checkbox.setAttribute('data-dependencies', pkg.dependencies.join(','));
    }
    
    if (pkg.enableVar) {
        checkbox.setAttribute('data-enable-var', pkg.enableVar);
    }
    
    checkbox.addEventListener('change', handlePackageSelection);
    
    hiddenContainer.appendChild(checkbox);
    
    console.log(`Created hidden checkbox for: ${pkg.id} (${pkg.uniqueId || pkg.id})`);
}

function createPackageCategory(category) {
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'package-category';
    categoryDiv.setAttribute('data-category-id', category.id);
    
    const packageGrid = document.createElement('div');
    packageGrid.className = 'package-grid';
    
    let hasVisiblePackages = false;
    
    category.packages.forEach(pkg => {
        if (!pkg.hidden) {
            hasVisiblePackages = true;
            const packageItem = createPackageItem(pkg);
            packageGrid.appendChild(packageItem);
        }
    });
    
    if (!hasVisiblePackages) return null;
    
    const title = document.createElement('h4');
    title.textContent = category.name;
    if (category.class) {
        title.classList.add(category.class);
    }
    categoryDiv.appendChild(title);
 
    if (category.description) {
        const description = document.createElement('div');
        description.className = 'package-category-description';
        description.textContent = category.description;
        categoryDiv.appendChild(description);
    }
    
    categoryDiv.appendChild(packageGrid);
    return categoryDiv;
}
 
function createPackageItem(pkg) {
    const packageItem = document.createElement('div');
    packageItem.className = 'package-item';
    packageItem.setAttribute('data-package-id', pkg.id);
    
    const mainCheckbox = createPackageCheckbox(pkg, pkg.checked === true);
    packageItem.appendChild(mainCheckbox);
    
    if (pkg.dependencies && Array.isArray(pkg.dependencies)) {
        const depContainer = document.createElement('div');
        depContainer.className = 'package-dependencies';
        
        pkg.dependencies.forEach(depId => {
            const depPkg = findPackageById(depId);
            if (depPkg) {
                const depCheckbox = createPackageCheckbox(depPkg, pkg.checked === true, true);
                depCheckbox.classList.add('package-dependent');
                depContainer.appendChild(depCheckbox);
            }
        });
        
        if (depContainer.children.length > 0) {
            packageItem.appendChild(depContainer);
        }
    }
    
    if (pkg.enableVar) {
        const checkbox = packageItem.querySelector(`#pkg-${pkg.uniqueId || pkg.id}`);
        if (checkbox) {
            checkbox.setAttribute('data-enable-var', pkg.enableVar);
        }
    }
    
    return packageItem;
}

function createPackageCheckbox(pkg, isChecked = false, isDependency = false) {
    const label = document.createElement('label');
    label.className = 'form-check-label';
    label.setAttribute('for', `pkg-${pkg.uniqueId || pkg.id}`);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `pkg-${pkg.uniqueId || pkg.id}`; 
    checkbox.className = 'form-check-input package-selector-checkbox';
    checkbox.setAttribute('data-package', pkg.id);
    checkbox.setAttribute('data-unique-id', pkg.uniqueId || pkg.id); 
    
    if (pkg.dependencies) {
        checkbox.setAttribute('data-dependencies', pkg.dependencies.join(','));
    }
    
    if (isChecked) {
        checkbox.checked = true;
    }
    
    checkbox.addEventListener('change', handlePackageSelection);

    let sizeText = '';
    if (state.device.version && state.device.arch) {
        const sizeCacheKey = `${state.device.version}:${state.device.arch}:${pkg.id}`;
        const sizeBytes = state.cache.packageSizes.get(sizeCacheKey);
        if (typeof sizeBytes === 'number' && sizeBytes > 0) {
            const sizeKB = (sizeBytes / 1024).toFixed(1);
            sizeText = `: ${sizeKB} KB`;
        }
    }
    
    if (config?.package_url) {
        const link = document.createElement('a');
        link.href = config.package_url.replace("{id}", encodeURIComponent(pkg.id));
        link.target = '_blank';
        link.className = 'package-link';
        link.textContent = (pkg.name || pkg.id) + sizeText;
        link.onclick = (e) => e.stopPropagation();
        label.appendChild(checkbox);
        label.appendChild(link);
    } else {
        const span = document.createElement('span');
        span.textContent = (pkg.name || pkg.id) + sizeText;
        label.appendChild(checkbox);
        label.appendChild(span);
    }
    
    label.setAttribute('data-package-name', pkg.name || pkg.id);
    
    return label;
}

function handlePackageSelection(e) {
    const pkg = e.target;
    const isChecked = pkg.checked;
    
    const dependencies = pkg.getAttribute('data-dependencies');
    if (dependencies) {
        dependencies.split(',').forEach(depName => {
            const depPkg = findPackageById(depName);
            if (depPkg) {
                const depCheckbox = document.querySelector(`[data-unique-id="${depPkg.uniqueId || depPkg.id}"]`);
                if (depCheckbox) {
                    depCheckbox.checked = isChecked;
                    
                    const depDeps = depCheckbox.getAttribute('data-dependencies');
                    if (depDeps && isChecked) {
                        depDeps.split(',').forEach(subDepName => {
                            const subDepPkg = findPackageById(subDepName);
                            if (subDepPkg) {
                                const subDepCheckbox = document.querySelector(`[data-unique-id="${subDepPkg.uniqueId || subDepPkg.id}"]`);
                                if (subDepCheckbox) subDepCheckbox.checked = true;
                            }
                        });
                    }
                }
            }
        });
    }
    updateAllPackageState('force-update');
}

function findPackageById(id) {
    if (!state.packages.json) return null;
    
    for (const category of state.packages.json.categories) {
        const pkg = category.packages.find(p => p.uniqueId === id || p.id === id);
        if (pkg) return pkg;
    }
    return null;
}

// ==================== UCI-defaults処理 ====================

function updateUciDefaultsFileSize(text) {
    const lines = text.replace(/\n$/, '').split('\n').length;
    const bytes = new Blob([text]).size;
    const kb = (bytes / 1024).toFixed(1);
    
    const sizeElement = document.querySelector('#uci-defaults-size');
    if (sizeElement) {
        sizeElement.textContent = `setup.sh = ${lines} lines - ${bytes} bytes: ${kb} KB`;
        
        if (bytes > 20480) {
            sizeElement.style.color = '#ff0000';
        } else if (bytes > 20377) {
            sizeElement.style.color = '#ff8800';
        } else {
            sizeElement.style.color = '#00cc00';
        }
    }
    
    return lines;
}

function loadUciDefaultsTemplate() {
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    const templatePath = config?.uci_defaults_setup_path || 'uci-defaults/setup.sh';
    
    if (!textarea) {
        console.error('UCI-defaults textarea not found');
        return;
    }

    function autoResize() {
        const lines = textarea.value.split('\n').length;
        textarea.style.height = 'auto';
        textarea.style.height = `${lines * 1}em`;
    }

    textarea.addEventListener('input', () => {
        autoResize();
        updateUciDefaultsFileSize(textarea.value);
    });
    
    textarea.addEventListener('paste', () => {
        requestAnimationFrame(() => {
            autoResize();
            updateUciDefaultsFileSize(textarea.value);
        });
    });

    fetch(templatePath + '?t=' + Date.now())
        .then(r => { 
            if (!r.ok) throw new Error(`Failed to load setup.sh: ${r.statusText}`); 
            return r.text(); 
        })
        .then(text => {
            textarea.value = text;
            console.log('setup.sh loaded successfully');
            updateUciDefaultsFileSize(text);
            updateVariableDefinitions();
            autoResize();
        })
        .catch(err => {
            console.error('Failed to load setup.sh:', err);
            const defaultText = `#!/bin/sh
# BEGIN_VARS
# END_VARS

# BEGIN_CMDS
# END_CMDS

exit 0`;
            textarea.value = defaultText;
            updateUciDefaultsFileSize(defaultText);
            autoResize();
        });
}

function updateTextareaContent(textarea, variableDefinitions) {
    let content = textarea.value;
    const beginMarker = '# BEGIN_VARS';
    const endMarker = '# END_VARS';
    const beginIndex = content.indexOf(beginMarker);
    const endIndex = content.indexOf(endMarker);
    
    if (beginIndex !== -1 && endIndex !== -1) {
        const beforeSection = content.substring(0, beginIndex + beginMarker.length);
        const afterSection = content.substring(endIndex);
        const newSection = variableDefinitions ? '\n' + variableDefinitions + '\n' : '\n';
        textarea.value = beforeSection + newSection + afterSection;
        
        const lines = updateUciDefaultsFileSize(textarea.value);
        textarea.rows = lines + 1;
    }
}

function updateCustomCommands() {
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    if (!textarea) return;
    
    const customCommands = state.ui.managers.commands ? state.ui.managers.commands.getAllValues().join('\n') : '';
    
    let content = textarea.value;
    
    const beginMarker = '# BEGIN_CMDS';
    const endMarker = '# END_CMDS';
    
    const beginIndex = content.indexOf(beginMarker);
    const endIndex = content.indexOf(endMarker);
    
    if (beginIndex !== -1 && endIndex !== -1) {
        const beforeSection = content.substring(0, beginIndex + beginMarker.length);
        const afterSection = content.substring(endIndex);
        const newSection = customCommands ? '\n' + customCommands + '\n' : '\n';
        
        textarea.value = beforeSection + newSection + afterSection;
        
        const lines = updateUciDefaultsFileSize(textarea.value);
        textarea.rows = lines + 1;
    }
}

function updateVariableDefinitions() {
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    if (!textarea) return;

    const values = collectFormValues && typeof collectFormValues === 'function'
        ? collectFormValues()
        : {};

    if (values === null || values === undefined || typeof values !== 'object') {
        console.warn("updateVariableDefinitions: values collection failed");
        return;
    }

    let emissionValues = { ...values };

    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const enableVar = cb.getAttribute('data-enable-var');
        if (enableVar) {
            emissionValues[enableVar] = '1';
        }
    });

    const variableDefinitions = generateVariableDefinitions(emissionValues);
    updateTextareaContent(textarea, variableDefinitions);
}

function generateVariableDefinitions(values) {
    const lines = [];
    Object.entries(values).forEach(([key, value]) => {
        const escapedValue = value.toString().replace(/'/g, "'\"'\"'");
        lines.push(`${key}='${escapedValue}'`);
    });
    return lines.join('\n');
}

// ==================== フォーム監視 ====================

function setupFormWatchers() {
    if (!state.config.formStructure.fields) return;
    
    Object.values(state.config.formStructure.fields).forEach(field => {
        if (field.selector) {
            attachFieldListeners(field.selector, updateVariableDefinitions);
        }
    });
    
    updateVariableDefinitions();
}

function attachFieldListeners(selector, handler) {
    document.querySelectorAll(selector).forEach(element => {
        const eventType = getElementEventType(element);
        
        element.removeEventListener('input', handler);
        element.removeEventListener('change', handler);
        
        element.addEventListener(eventType, handler);
    });
}

function getElementEventType(element) {
    if (element.type === 'radio' || element.type === 'checkbox' || element.tagName === 'SELECT') {
        return 'change';
    }
    return 'input';
}

// ==================== エラーハンドリング ====================

if (window.DEBUG_MODE) {
    ['error', 'unhandledrejection'].forEach(event => {
        window.addEventListener(event, e => console.error(`Custom.js ${event}:`, e.reason || e.error));
    });
}
