console.log('custom.js loaded');

window.addEventListener('load', () => {
    const versionEl = document.getElementById('ofs-version');
    if (versionEl && typeof custom_ofs_version !== 'undefined') {
        versionEl.innerText = custom_ofs_version;
    }
    
    const linkEl = versionEl?.closest('a');
    if (linkEl && typeof custom_ofs_link !== 'undefined') {
        linkEl.href = custom_ofs_link;
        linkEl.target = "_blank";
    }
});

// ==================== グローバル変数 ====================
let customInitialized = false;
let customHTMLLoaded = false;
let packagesJson = null;
let setupConfig = null;
let formStructure = {};
let cachedApiInfo = null;
let cachedDeviceArch = null;
let defaultFieldValues = {};
let dynamicPackages = new Set();
let selectedLanguage = '';
let kmodsTokenCache = null;
let kmodsTokenCacheKey = null;

const packageAvailabilityCache = new Map();
const feedCacheMap = new Map();

let deviceDefaultPackages = [];  // mobj.default_packages
let deviceDevicePackages = [];   // mobj.device_packages  
let extraPackages = [];           // config.asu_extra_packages

let packageSearchManager = null;
let commandsManager = null;

// ==================== ユーティリティ ====================
const CustomUtils = {
    /**
     * 現在選択されているデバイスのベンダー名を取得します。
     * @returns {string|null} ベンダー名、または取得できない場合はnull
     */
    getVendor: function() {
        if (current_device?.target) {
            const parts = current_device.target.split('/');
            return parts[0] || null;
        }
        return null;
    },

    /**
     * 現在選択されているデバイスのサブターゲット名を取得します。
     * @returns {string} サブターゲット名
     */
    getSubtarget: function() {
        if (current_device?.target) {
            const parts = current_device.target.split('/');
            return parts[1] || '';
        }
        return '';
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
    
        if (kmodsTokenCache && kmodsTokenCacheKey === cacheKey) {
            const searchTpl = isSnapshot ? config.kmods_apk_search_url : config.kmods_opkg_search_url;
            return searchTpl
                .replace('{version}', version)
                .replace('{vendor}', vendor)
                .replace('{subtarget}', subtarget)
                .replace('{kmod}', kmodsTokenCache);
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
        const matches = [...html.matchAll(/href="([^/]+)\/"/g)].map(m => m[1]);
        if (!matches.length) throw new Error("kmods token not found");
    
        matches.sort();
        kmodsTokenCache = matches[matches.length - 1];
        kmodsTokenCacheKey = cacheKey;
    
        const searchTpl = isSnapshot ? config.kmods_apk_search_url : config.kmods_opkg_search_url;
        return searchTpl
            .replace('{version}', version)
            .replace('{vendor}', vendor)
            .replace('{subtarget}', subtarget)
            .replace('{kmod}', kmodsTokenCache);
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
    
        if (!this.inCidr(ipv6, '2000::/3')) return null;
    
        const excludeCidrs = [
            '2001:db8::/32',  // ドキュメンテーション
            '2002::/16',      // 6to4
            '2001::/32',      // Teredo
            '2001:20::/28',   // ORCHIDv2
            '2001:2::/48',    // ベンチマーク
            '2001:3::/32',    // AMT
            '2001:4:112::/48' // AS112-v6
        ];
        if (excludeCidrs.some(cidr => this.inCidr(ipv6, cidr))) return null;
    
        const segments = ipv6.split(':');
        if (segments.length >= 4) {
            return `${segments[0]}:${segments[1]}:${segments[2]}:${segments[3]}::/64`;
        }
        return null;
    },
    
    show: function(el) {
        const e = typeof el === 'string' ? document.querySelector(el) : el;
        if (e) {
            e.classList.remove('hide');
            e.style.display = '';
        }
    },
    
    hide: function(el) {
        const e = typeof el === 'string' ? document.querySelector(el) : el;
        if (e) {
            e.classList.add('hide');
            e.style.display = 'none';
        }
    },
    
    setValue: function(selector, val) {
        const el = document.querySelector(selector);
        if (el) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.value = val;
            } else {
                el.innerText = val;
            }
        }
    },
    
    split: function(str) {
        return str.match(/[^\s,]+/g) || [];
    },
    
    getNestedValue: function(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    },
    
    setGuaPrefixIfAvailable: function() {
        const guaPrefixField = document.querySelector('#mape-gua-prefix');
        if (!guaPrefixField || !cachedApiInfo?.ipv6) return;
        const guaPrefix = this.generateGuaPrefixFromFullAddress(cachedApiInfo);
        if (guaPrefix) {
            guaPrefixField.value = guaPrefix;
        }
    },
    
    toggleGuaPrefixVisibility: function(mode) {
        const guaPrefixField = document.querySelector('#mape-gua-prefix');
        if (!guaPrefixField) return;
        const formGroup = guaPrefixField.closest('.form-group');
        if (mode === 'pd') {
            guaPrefixField.value = '';
            guaPrefixField.disabled = true;
            if (formGroup) formGroup.style.display = 'none';
            console.log('PD mode: GUA prefix hidden');
        } else if (mode === 'gua') {
            guaPrefixField.disabled = false;
            if (formGroup) formGroup.style.display = '';
            this.setGuaPrefixIfAvailable();
        }
    }
};

// ==================== 初期化処理 ====================
const originalUpdateImages = window.updateImages;

window.updateImages = function(version, mobj) {
    if (originalUpdateImages) originalUpdateImages(version, mobj);

    const oldArch = cachedDeviceArch;
    const oldVersion = current_device && current_device.version;

    if (mobj && mobj.arch_packages) {
        if (!current_device) current_device = {};

        current_device.arch = mobj.arch_packages;
        current_device.version = version;
        cachedDeviceArch = mobj.arch_packages;

        current_device.target = mobj.target || '';
        if (mobj.id) current_device.id = mobj.id;

        console.log('[TRACE] current_device updated:', {
            ...current_device,
            vendor: CustomUtils.getVendor(),
            subtarget: CustomUtils.getSubtarget()
        });

        if (oldArch !== mobj.arch_packages || oldVersion !== version) {
            console.log('[TRACE] Device changed, clearing caches');
            packageAvailabilityCache.clear();
            feedCacheMap.clear();

            requestAnimationFrame(() => {
                const vendor = CustomUtils.getVendor();
                if (!vendor) {
                    console.warn('[WARN] No vendor info, kmods may not verify');
                    console.log('[TRACE] current_device state:', current_device);
                }

                const indicator = document.querySelector('#package-loading-indicator');
                if (indicator) {
                    indicator.style.display = 'block';
                    const span = indicator.querySelector('span');
                    if (span) span.className = 'tr-checking-packages';
                }

                verifyAllPackages().then(function() {
                    if (indicator) indicator.style.display = 'none';
                    console.log('[TRACE] Package verification complete');
                }).catch(function(err) {
                    console.error('[ERROR] Package verification failed:', err);
                    if (indicator) {
                        indicator.innerHTML = '<span class="tr-package-check-failed">Package availability check failed</span>';
                        indicator.addEventListener('click', () => { indicator.style.display = 'none'; }, { once: true });
                    }
                });
            });
        }
    }

    if (mobj && "manifest" in mobj === false) {
        deviceDefaultPackages = mobj.default_packages || [];
        deviceDevicePackages = mobj.device_packages || [];
        extraPackages = config.asu_extra_packages || [];

        if (!current_device) current_device = {};

        document.dispatchEvent(new Event('devicePackagesReady'));
        
        current_device.target = mobj.target || '';
        current_device.version = version || current_device.version;
        current_device.arch = mobj.arch_packages || current_device.arch;

        console.log('[TRACE] Device packages saved:', {
            default: deviceDefaultPackages.length,
            device: deviceDevicePackages.length,
            extra: extraPackages.length,
            vendor: CustomUtils.getVendor()
        });

        const initialPackages = deviceDefaultPackages
            .concat(deviceDevicePackages)
            .concat(extraPackages);

        const textarea = document.querySelector('#asu-packages');
        if (textarea) {
            textarea.value = initialPackages.join(' ');
            console.log('[TRACE] Initial packages set:', initialPackages);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    textarea.style.height = 'auto';
                    textarea.style.height = textarea.scrollHeight + 'px';
                });
            });
        }

        if (customInitialized) {
            requestAnimationFrame(() => {
                updateAllPackageState('device-packages-loaded');
            });
        }
    }

    if (!customHTMLLoaded) {
        console.log('[TRACE] Loading custom.html');
        loadCustomHTML();
        customHTMLLoaded = true;
    } else if (customInitialized && current_device && current_device.arch) {
        const deviceLang = config.device_language || (config && config.fallback_language) || 'en';
        console.log('[TRACE] Updating language packages for:', deviceLang);
        syncDeviceLanguageSelector(deviceLang);
        updateAllPackageState('device-changed-force');
    }
};

// ==================== 統合パッケージ管理システム ====================
let lastFormStateHash = null;

async function updateAllPackageState(source = 'unknown') {
    if (!customInitialized && (deviceDefaultPackages.length === 0 && deviceDevicePackages.length === 0)) {
        console.log('updateAllPackageState: Device packages not ready, deferring update from:', source);

        document.addEventListener('devicePackagesReady', () => {
            console.log('Re-running updateAllPackageState after device packages ready (source was:', source, ')');
            updateAllPackageState('force-update');
        }, { once: true });

        return;
    }

    const currentState = collectFormValues();

    const searchValues = packageSearchManager ? packageSearchManager.getAllValues() : [];
    const hashPayload = {
        form: currentState,
        search: searchValues,
    };
    const hash = JSON.stringify(hashPayload);

    const forceSources = new Set([
        'package-selected',
        'package-search-change',
        'package-search-add',
        'package-search-remove'
    ]);

    if (hash === lastFormStateHash &&
        !source.includes('device') &&
        !source.includes('force') &&
        !forceSources.has(source)) {
        return;
    }
    lastFormStateHash = hash;

    console.log(`updateAllPackageState called from: ${source}`);

    updateSetupJsonPackagesCore();

    await updateLanguagePackageCore();

    updatePackageListToTextarea(source);

    updateVariableDefinitions();

    console.log('All package state updated successfully');
}

function updateSetupJsonPackagesCore() {
    if (!setupConfig) return;
    
    setupConfig.categories.forEach(category => {
        category.packages.forEach(pkg => {
            if (pkg.type === 'radio-group' && pkg.variableName) {
                const selectedValue = getFieldValue(`input[name="${pkg.variableName}"]:checked`);
                if (selectedValue) {
                    console.log(`Radio group ${pkg.variableName} selected: ${selectedValue}`);
                    
                    pkg.options.forEach(opt => {
                        if (opt.value !== selectedValue) {
                            toggleVirtualPackagesByType(pkg.variableName, opt.value, false);
                        }
                    });
                    
                    toggleVirtualPackagesByType(pkg.variableName, selectedValue, true);
                    
                    if (pkg.variableName === 'connection_type' && selectedValue === 'auto' && cachedApiInfo) {
                        console.log('AUTO mode with API info, applying specific packages');
                        if (cachedApiInfo.mape?.brIpv6Address) {
                            console.log('Enabling MAP-E package');
                            toggleVirtualPackage('map', true);
                        } else if (cachedApiInfo.aftr) {
                            console.log('Enabling DS-Lite package');
                            toggleVirtualPackage('ds-lite', true);
                        }
                    }
                }
            }
        });
    });
}

function toggleVirtualPackage(packageId, enabled) {
    const pkg = findPackageById(packageId);
    if (!pkg) {
        console.warn(`Virtual package not found in packages.json: ${packageId}`);
        return;
    }
    
    const searchId = pkg.uniqueId || pkg.id;
    const checkbox = document.querySelector(`[data-package="${packageId}"], [data-unique-id="${searchId}"]`);
    
    if (checkbox) {
        const wasChecked = checkbox.checked;
        checkbox.checked = enabled;
        
        if (wasChecked !== enabled) {
            console.log(`Virtual package ${packageId} (${searchId}): ${enabled ? 'enabled' : 'disabled'}`);
            
            const dependencies = checkbox.getAttribute('data-dependencies');
            if (dependencies && enabled) {
                dependencies.split(',').forEach(depId => {
                    const depPkg = findPackageById(depId);
                    if (depPkg) {
                        const depSearchId = depPkg.uniqueId || depPkg.id;
                        const depCheckbox = document.querySelector(`[data-package="${depId}"], [data-unique-id="${depSearchId}"]`);
                        if (depCheckbox) {
                            depCheckbox.checked = true;
                            console.log(`Virtual dependency ${depId}: enabled`);
                        }
                    }
                });
            }
        }
    } else {
        console.warn(`Checkbox not found for virtual package: ${packageId} (searched: ${searchId})`);
    }
}

function toggleVirtualPackagesByType(type, value, enabled) {
    const packageMap = {
        'connection_type': {
            'mape': ['map'],
            'dslite': ['ds-lite']
        },
        'wifi_mode': {
            'usteer': ['usteer-from-setup']
        }
    };
    
    const packages = packageMap[type]?.[value];
    if (packages) {
        console.log(`Toggle packages for ${type}=${value}: ${packages.join(', ')} -> ${enabled}`);
        packages.forEach(pkgId => {
            toggleVirtualPackage(pkgId, enabled);
        });
    } else {
        console.log(`No virtual packages defined for ${type}=${value}`);
    }
}

async function updateLanguagePackageCore() {
    selectedLanguage = config.device_language || config?.fallback_language || 'en';
    
    console.log(`Language package update - Selected language: ${selectedLanguage}`);

    const removedPackages = [];
    for (const pkg of Array.from(dynamicPackages)) {
        if (pkg.startsWith('luci-i18n-')) {
            dynamicPackages.delete(pkg);
            removedPackages.push(pkg);
        }
    }
    
    if (removedPackages.length > 0) {
        console.log('Removed old language packages:', removedPackages);
    }

    const hasArch = current_device?.arch || cachedDeviceArch;
    if (!selectedLanguage || selectedLanguage === 'en' || !hasArch) {
        console.log('Skipping language packages - English or no arch info');
        return;
    }
    
    const currentPackages = getCurrentPackageListForLanguage();
    console.log(`Checking language packages for ${currentPackages.length} packages`);
    
    const addedLangPackages = new Set();
    
    const basePkg = `luci-i18n-base-${selectedLanguage}`;
    const firewallPkg = `luci-i18n-firewall-${selectedLanguage}`;
    
    try {
        if (await isPackageAvailable(basePkg, 'luci')) {
            dynamicPackages.add(basePkg);
            addedLangPackages.add(basePkg);
            console.log('Added base language package:', basePkg);
        }

        if (await isPackageAvailable(firewallPkg, 'luci')) {
            dynamicPackages.add(firewallPkg);
            addedLangPackages.add(firewallPkg);
            console.log('Added firewall language package:', firewallPkg);
        }
    } catch (err) {
        console.error('Error checking base/firewall package:', err);
    }

    const checkPromises = [];
    
    for (const pkg of currentPackages) {
        let luciName = null;
        
        if (pkg.startsWith('luci-') && !pkg.startsWith('luci-i18n-')) {
            luciName = extractLuciName(pkg);
        } else if (pkg === 'usteer-from-setup') {
            luciName = 'usteer';
        }
        
        if (luciName) {
            const langPkg = `luci-i18n-${luciName}-${selectedLanguage}`;
            
            const promise = (async () => {
                try {
                    if (await isPackageAvailable(langPkg, 'luci')) {
                        dynamicPackages.add(langPkg);
                        addedLangPackages.add(langPkg);
                        console.log(`Added LuCI language package: ${langPkg} for ${pkg}`);
                    }
                } catch (err) {
                    console.error(`Error checking LuCI package ${langPkg}:`, err);
                }
            })();
            checkPromises.push(promise);
        }
    }

    await Promise.all(checkPromises);
    
    if (addedLangPackages.size > 0) {
        console.log(`Language package update complete: ${addedLangPackages.size} packages added`);
    }
}

function getCurrentPackageListForLanguage() {
    const packages = new Set();
    
    deviceDefaultPackages.forEach(pkg => packages.add(pkg));
    deviceDevicePackages.forEach(pkg => packages.add(pkg));
    extraPackages.forEach(pkg => packages.add(pkg));
    
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        const uniqueId = cb.getAttribute('data-unique-id');
        
        if (pkgName) {
            packages.add(pkgName);
            if (uniqueId && uniqueId !== pkgName) {
                packages.add(uniqueId);
            }
        }
    });
    
    if (packageSearchManager) {
        const searchValues = packageSearchManager.getAllValues();
        searchValues.forEach(pkg => packages.add(pkg));
    }
    
    for (const pkg of dynamicPackages) {
        if (!pkg.startsWith('luci-i18n-')) {
            packages.add(pkg);
        }
    }
    
    const checkedPackageSet = new Set();
    document.querySelectorAll('.package-selector-checkbox').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        if (pkgName) checkedPackageSet.add(pkgName);
    });
    
    const textarea = document.querySelector('#asu-packages');
    if (textarea) {
        const textPackages = CustomUtils.split(textarea.value);
        textPackages.forEach(pkg => {
            if (!pkg.startsWith('luci-i18n-') && !checkedPackageSet.has(pkg)) {
                packages.add(pkg);
            }
        });
    }
    
    return Array.from(packages);
}

let lastPackageListHash = null;

let prevUISelections = new Set();

function updatePackageListToTextarea(source = 'unknown') {
    const basePackages = new Set();

    if (deviceDefaultPackages.length === 0 &&
        deviceDevicePackages.length === 0 &&
        extraPackages.length === 0) {
        console.warn('updatePackageListToTextarea: Device packages not loaded yet, skipping update from:', source);
        return;
    }

    deviceDefaultPackages.forEach(pkg => basePackages.add(pkg));
    deviceDevicePackages.forEach(pkg => basePackages.add(pkg));
    extraPackages.forEach(pkg => basePackages.add(pkg));

    console.log(`Base device packages loaded: default=${deviceDefaultPackages.length}, device=${deviceDevicePackages.length}, extra=${extraPackages.length}`);

    const checkedPackages = new Set();
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        if (pkgName) checkedPackages.add(pkgName);
    });

    const searchedPackages = new Set();
    if (packageSearchManager) {
        packageSearchManager.getAllValues()
            .map(v => v.trim())
            .filter(v => v.length > 0)
            .forEach(pkg => searchedPackages.add(pkg));
        console.log('PackageSearchManager values (normalized):', [...searchedPackages]);
    } else {
        console.warn('PackageSearchManager is not initialized');
    }

    const knownSelectablePackages = new Set();
    if (packagesJson?.categories) {
        packagesJson.categories.forEach(cat => {
            (cat.packages || []).forEach(pkg => {
                if (pkg.id) knownSelectablePackages.add(pkg.id);
            });
        });
    }

    const manualPackages = new Set();
    const textarea = document.querySelector('#asu-packages');
    if (textarea) {
        const currentPackages = CustomUtils.split(textarea.value)
            .map(v => v.trim())
            .filter(v => v.length > 0);

        const confirmedSet = new Set([
            ...basePackages,
            ...checkedPackages,
            ...searchedPackages,
            ...dynamicPackages
        ]);

        const currentUISelections = new Set([
            ...checkedPackages,
            ...searchedPackages
        ]);

        currentPackages
            .map(v => v.trim())
            .filter(v => v.length > 0)
            .forEach(pkg => {
                const isCheckboxManaged = document.querySelector(`.package-selector-checkbox[data-package="${pkg}"]`) !== null;

                const isSubstringOfConfirmed = [...confirmedSet].some(
                    cpkg => cpkg.length > pkg.length && cpkg.includes(pkg)
                );

                if (!confirmedSet.has(pkg) &&
                    !pkg.startsWith('luci-i18n-') &&
                    !knownSelectablePackages.has(pkg) &&
                    !isCheckboxManaged &&
                    !isSubstringOfConfirmed &&
                    !(prevUISelections.has(pkg) && !currentUISelections.has(pkg))) {
                    manualPackages.add(pkg);
                }
            });

        prevUISelections = currentUISelections;
    }
    
    const finalPackages = [
        ...basePackages,
        ...checkedPackages,
        ...searchedPackages,
        ...dynamicPackages,
        ...manualPackages
    ];

    const uniquePackages = [...new Set(finalPackages)];

    const currentHash = JSON.stringify(uniquePackages);
    if (currentHash === lastPackageListHash && source !== 'force-update') {
        console.log('updatePackageListToTextarea: No changes detected, skipping update from:', source);
        return;
    }
    lastPackageListHash = currentHash;

    console.log(`updatePackageListToTextarea called from: ${source}`);
    console.log(`Package breakdown:`, {
        base: basePackages.size,
        checked: checkedPackages.size,
        searched: searchedPackages.size,
        dynamic: dynamicPackages.size,
        manual: manualPackages.size,
        total: uniquePackages.length
    });

    if (textarea) {
        textarea.value = uniquePackages.join(' ');
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }

    console.log(`Postinst package list updated: ${uniquePackages.length} packages`);
    console.log('Final Postinst package list:', uniquePackages);
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
    
    packageSearchManager = new MultiInputManager('package-search-autocomplete', {
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
    
    const arch = current_device?.arch || cachedDeviceArch;
    const version = current_device?.version || document.querySelector("#versions")?.value;
    const vendor = CustomUtils.getVendor();
    
    if (query.toLowerCase().startsWith('kmod-') && !vendor) {
        console.log('searchPackages - current_device:', current_device);
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
        feeds = ['packages', 'luci'];
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
    const vendor = CustomUtils.getVendor();
    const cacheKey = `${version}:${arch}:${feed}`;

    try {
        let packages = [];

        if (feedCacheMap.has(cacheKey)) {
            packages = feedCacheMap.get(cacheKey);
        } else {
            let url;
            if (feed === 'kmods') {
                console.log('[DEBUG] vendor value:', vendor);
                if (!vendor) {
                    console.warn('[WARN] Missing vendor for kmods search');
                    return [];
                }
                url = await CustomUtils.buildKmodsUrl(version, vendor, version.includes('SNAPSHOT'));
                console.log('[DEBUG] kmods search URL:', url);
            } else if (version.includes('SNAPSHOT')) {
                url = config.apk_search_url
                    .replace('{arch}', arch)
                    .replace('{feed}', feed);
                console.log('[DEBUG] snapshot search URL:', url);
            } else {
                url = config.opkg_search_url
                    .replace('{version}', version)
                    .replace('{arch}', arch)
                    .replace('{feed}', feed);
                console.log('[DEBUG] opkg search URL:', url);
            }

            const resp = await fetch(url, { cache: 'force-cache' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            if (version.includes('SNAPSHOT') || (feed === 'kmods' && version.includes('SNAPSHOT'))) {
                const data = await resp.json();
                if (data.packages && typeof data.packages === 'object') {
                    packages = Object.keys(data.packages);
                }
            } else {
                const text = await resp.text();
                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.startsWith('Package: ')) {
                        packages.push(line.substring(9).trim());
                    }
                }
            }

            feedCacheMap.set(cacheKey, packages);
        }

        return packages.filter(pkgName =>
            pkgName.toLowerCase().includes(query.toLowerCase())
        );
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
            
            try {  // ここにtryを追加
                inputElement.dataset.programmaticChange = 'true';
                inputElement.value = pkgName;
                
                inputElement.setAttribute('data-confirmed', 'true');
                
                const inputIndex = packageSearchManager.inputs.indexOf(inputElement);
                if (inputIndex === packageSearchManager.inputs.length - 1) {
                    packageSearchManager.addInput('', true);
                }
                
                clearPackageSearchResults();
                packageSearchManager.options.onChange(packageSearchManager.getAllValues());
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
        current_language = (navigator.language || fallback).split('-')[0];
    }
    if (!config.device_language) {
        config.device_language = current_language;
    }

    if (mainLanguageSelect) {
        mainLanguageSelect.value = current_language;
    }
    if (customLanguageSelect) {
        customLanguageSelect.value = config.device_language;
    }

    window.selectedLanguage = config.device_language;
    console.log('Language setup - Browser:', current_language, 'Device:', config.device_language);

    if (mainLanguageSelect) {
        mainLanguageSelect.removeEventListener('change', handleMainLanguageChange);
        mainLanguageSelect.addEventListener('change', handleMainLanguageChange);
    }
    if (customLanguageSelect) {
        customLanguageSelect.removeEventListener('change', handleCustomLanguageChange);
        customLanguageSelect.addEventListener('change', handleCustomLanguageChange);
    }

    updateAllPackageState('initial-language');
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
    selectedLanguage = lang;
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
    
    await loadCustomTranslations(current_language);

    if (isUserAction) {
        const oldDeviceLanguage = config.device_language;
        config.device_language = current_language;
        
        syncDeviceLanguageSelector(config.device_language);
        
        console.log('Language sync completed:', {
            browser: current_language,
            device: config.device_language,
            changed: oldDeviceLanguage !== config.device_language
        });
        
        if (oldDeviceLanguage !== config.device_language) {
            updateAllPackageState('browser-language-changed');
        }
    } else {
        console.log('Programmatic change - device language not affected:', config.device_language);
    }
}

async function handleCustomLanguageChange(e) {
    const newLanguage = e.target.value || config?.fallback_language || 'en';
    if (newLanguage === config.device_language) return;

    const oldDeviceLanguage = config.device_language;
    config.device_language = newLanguage;
    
    console.log('Device language change:', {
        newLanguage,
        oldLanguage: oldDeviceLanguage,
        browserUnchanged: current_language,
        note: 'Browser language intentionally not synced (one-way sync only)'
    });

    selectedLanguage = config.device_language;

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
    
    deviceDefaultPackages.forEach(pkg => packages.add(pkg));
    deviceDevicePackages.forEach(pkg => packages.add(pkg));
    extraPackages.forEach(pkg => packages.add(pkg));
    
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        if (pkgName) packages.add(pkgName);
    });
    
    if (packageSearchManager) {
        const searchValues = packageSearchManager.getAllValues();
        searchValues.forEach(pkg => packages.add(pkg));
    }
    
    const textarea = document.querySelector('#asu-packages');
    if (textarea) {
        const textPackages = CustomUtils.split(textarea.value);
        textPackages.forEach(pkg => {
            if (!deviceDefaultPackages.includes(pkg) && 
                !deviceDevicePackages.includes(pkg) && 
                !extraPackages.includes(pkg)) {
                packages.add(pkg);
            }
        });
    }
    
    for (const pkg of dynamicPackages) {
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

async function isPackageAvailable(pkgName, feed) {
    if (!pkgName || !feed) return false;

    const arch = current_device?.arch || cachedDeviceArch;
    const version = current_device?.version || $("#versions").value;
    const vendor = CustomUtils.getVendor();
    const subtarget = CustomUtils.getSubtarget();

    if (!arch || !version) {
        console.log('Missing device info for package check:', { arch, version });
        return false;
    }

    const cacheKey = `${version}:${arch}:${feed}:${pkgName}`;
    if (packageAvailabilityCache.has(cacheKey)) {
        return packageAvailabilityCache.get(cacheKey);
    }

    try {
        let packagesUrl;
        let result = false;

        if (feed === 'kmods') {
            console.log('[DEBUG] vendor value:', vendor);
            console.log('[DEBUG] subtarget value:', subtarget);
            if (!vendor || !subtarget) {
                console.log('Missing vendor or subtarget for kmods check');
                packageAvailabilityCache.set(cacheKey, false);
                return false;
            }
            packagesUrl = await CustomUtils.buildKmodsUrl(version, vendor, version.includes('SNAPSHOT'));

            console.log(`[DEBUG] kmods packagesUrl: ${packagesUrl}`);

        } else if (version.includes('SNAPSHOT')) {
            packagesUrl = config.apk_search_url
                .replace('{arch}', arch)
                .replace('{feed}', feed);
        } else {
            packagesUrl = config.opkg_search_url
                .replace('{version}', version)
                .replace('{arch}', arch)
                .replace('{feed}', feed);
        }

        const resp = await fetch(packagesUrl, { cache: 'force-cache' });
        if (resp.ok) {
            if (version.includes('SNAPSHOT') || (feed === 'kmods' && version.includes('SNAPSHOT'))) {
                const data = await resp.json();
                if (Array.isArray(data.packages)) {
                    result = data.packages.some(p => p?.name === pkgName);
                } else if (data.packages && typeof data.packages === 'object') {
                    result = Object.prototype.hasOwnProperty.call(data.packages, pkgName);
                }
            } else {
                const text = await resp.text();
                result = text.split('\n').some(line => line.trim() === `Package: ${pkgName}`);
            }
        }

        packageAvailabilityCache.set(cacheKey, result);
        return result;
    } catch (err) {
        console.error('Package availability check error:', err);
        packageAvailabilityCache.set(cacheKey, false);
        return false;
    }
}

// ==================== パッケージ存在確認 ====================
async function verifyAllPackages() {    
    const arch = current_device?.arch || cachedDeviceArch;
    if (!packagesJson || !arch) {
        console.log('Cannot verify packages: missing data');
        return;
    }
    
    const startTime = Date.now();
    console.log('Starting package verification...');
    
    const packagesToVerify = [];
    
    packagesJson.categories.forEach(category => {
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
    
    let BATCH_SIZE = 10;
    if ('connection' in navigator && typeof navigator.connection.downlink === 'number') {
        const speedMbps = navigator.connection.downlink;
        BATCH_SIZE = Math.min(25, Math.max(2, Math.round(speedMbps * 2)));
        console.log(`[INFO] Network downlink: ${speedMbps} Mbps → concurrency = ${BATCH_SIZE}`);
    } else {
        console.log(`[INFO] Network Information API not supported → concurrency = ${BATCH_SIZE}`);
    }

    const batches = [];
    for (let i = 0; i < uniquePackages.length; i += BATCH_SIZE) {
        batches.push(uniquePackages.slice(i, i + BATCH_SIZE));
    }
    
    let unavailableCount = 0;
    let checkedUnavailable = [];
    
    for (const batch of batches) {
        const promises = batch.map(async pkg => {
            const isAvailable = await isPackageAvailable(pkg.id, pkg.feed);
            
            updatePackageAvailabilityUI(pkg.uniqueId, isAvailable);
            
            if (!isAvailable) {
                unavailableCount++;
                if (pkg.checked) {
                    checkedUnavailable.push(pkg.id);
                }
            }
            
            return { id: pkg.id, uniqueId: pkg.uniqueId, available: isAvailable };
        });
        
        await Promise.all(promises);
    }
    
    const elapsedTime = Date.now() - startTime;
    console.log(`Package verification completed in ${elapsedTime}ms`);
    console.log(`${unavailableCount} packages are not available for this device`);
    
    if (checkedUnavailable.length > 0) {
        console.warn('The following pre-selected packages are not available:', checkedUnavailable);
    }
}

function updatePackageAvailabilityUI(uniqueId, isAvailable) {
    const checkbox = document.querySelector(`#pkg-${uniqueId}`);
    if (!checkbox) return;
    
    const packageItem = checkbox.closest('.package-item');
    if (!packageItem) {
        const label = checkbox.closest('label');
        if (label) {
            if (!isAvailable) {
                label.style.display = 'none';
                checkbox.checked = false;
                checkbox.disabled = true;
            } else {
                label.style.display = '';
                checkbox.disabled = false;
            }
        }
        return;
    }
    
    if (!isAvailable) {
        packageItem.style.display = 'none';
        checkbox.checked = false;
        checkbox.disabled = true;
        
        const depCheckboxes = packageItem.querySelectorAll('.package-dependent input[type="checkbox"]');
        depCheckboxes.forEach(depCb => {
            depCb.checked = false;
            depCb.disabled = true;
        });
    } else {
        packageItem.style.display = '';
        checkbox.disabled = false;
    }
    
    updateCategoryVisibility(packageItem);
}

function updateCategoryVisibility(packageItem) {
    const category = packageItem?.closest('.package-category');
    if (!category) return;
    
    const visiblePackages = category.querySelectorAll('.package-item:not([style*="display: none"])');
    
    if (visiblePackages.length === 0) {
        category.style.display = 'none';
    } else {
        category.style.display = '';
    }
}

// ==================== setup.json 処理 ====================
async function loadSetupConfig() {
    try {
        const url = config?.setup_db_path || 'uci-defaults/setup.json';
        const response = await fetch(url + '?t=' + Date.now());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        setupConfig = await response.json();
        console.log('Setup config loaded (JSON-driven mode):', setupConfig);
        
        formStructure = generateFormStructure(setupConfig);
        storeDefaultValues(setupConfig);
        renderSetupConfig(setupConfig);
        
        console.log('Setup config rendered successfully with JSON-driven features');
        return setupConfig;
    } catch (err) {
        console.error('Failed to load setup.json:', err);
        return null;
    }
}

function storeDefaultValues(config) {
    defaultFieldValues = {};
    
    function walkFields(pkg) {
        if (pkg.defaultValue !== undefined && pkg.id) {
            defaultFieldValues[pkg.id] = pkg.defaultValue;
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
    
    console.log('Default values stored:', defaultFieldValues);
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

        if (cachedApiInfo) {
            applyIspAutoConfig(cachedApiInfo);
            console.log('Reapplied ISP config after form render');
        }

        const mapeTypeRadio = document.querySelector('input[name="mape_type"]:checked');
        if (mapeTypeRadio && mapeTypeRadio.value === 'pd') {
            const guaPrefixField = document.querySelector('#mape-gua-prefix');
            if (guaPrefixField) {
                const formGroup = guaPrefixField.closest('.form-group');
                if (formGroup) {
                    formGroup.style.display = 'none';
                    console.log('Initial PD mode: GUA prefix hidden');
                }
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
                
                radio.addEventListener('change', handleRadioChange);

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
            condWrap.style.display = 'none';

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
            infoDiv.style.padding = '1em';
            infoDiv.style.backgroundColor = 'var(--bg-item)';
            infoDiv.style.borderRadius = '0.2em';
            infoDiv.style.marginTop = '0.5em';
            infoDiv.style.whiteSpace = 'pre-line';
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
        if (field.defaultValue !== null && field.defaultValue !== undefined && field.defaultValue !== '') {
            ctrl.value = field.defaultValue;
        } else if (field.apiMapping && cachedApiInfo) {
            const apiValue = CustomUtils.getNestedValue(cachedApiInfo, field.apiMapping);
            if (apiValue !== null && apiValue !== undefined && apiValue !== '') {
                ctrl.value = apiValue;
            }
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

function handleRadioChange(e) {
    const radio = e.target;
    
    if (radio.name === 'mape_type') {
        CustomUtils.toggleGuaPrefixVisibility(radio.value);
    }
    
    updateAllPackageState('radio-change');
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
            const visible = evaluateShowWhen(cond.showWhen, getControlValue);
            const el = document.getElementById(cond.id);
            if (!el) continue;
            el.style.display = visible ? '' : 'none';
        }
    }

    function getControlValue(key) {
        const keys = [key, key.replace(/-/g, '_'), key.replace(/_/g, '-')];

        for (const k of keys) {
            const radios = document.querySelectorAll(`input[type="radio"][name="${cssEscape(k)}"]`);
            if (radios.length) {
                const r = Array.from(radios).find(x => x.checked);
                if (r) return r.value;
            }
        }
        
        for (const k of keys) {
            const byId = document.getElementById(k);
            if (byId) return byId.value;
            const byName = document.querySelector(`[name="${cssEscape(k)}"]`);
            if (byName) return byName.value;
        }
        return '';
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
    const COLUMNS_PER_ROW = 2; // デフォルト2列レイアウト
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
    
    Object.values(formStructure.fields).forEach(field => {
        const value = getFieldValue(field.selector);
        
        if (value !== null && value !== undefined && value !== "") {
            values[field.variableName] = value;
        }
    });
    
    if (!values.language) {
        const languageValue = getFieldValue('#aios-language') || selectedLanguage || 'en';
        if (languageValue && languageValue !== 'en') {
            values.language = languageValue;
        }
    }
    
    applySpecialFieldLogic(values);
    
    return values;
}

function getFieldValue(selector) {
    const element = document.querySelector(selector);
    if (!element) return null;
    
    if (element.type === 'radio') {
        const checked = document.querySelector(`input[name="${element.name}"]:checked`);
        return checked?.value;
    } else if (element.type === 'checkbox') {
        return element.checked ? element.value : null;
    }
    return element.value;
}

// ==================== フォーム値処理（JSONドリブン版） ====================
function applySpecialFieldLogic(values) {
    const connectionType = getFieldValue('input[name="connection_type"]');
    
    const allConnectionFields = [];
    
    if (setupConfig) {
        const internetCategory = setupConfig.categories.find(cat => cat.id === 'internet-config');
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
        
        if (cachedApiInfo) {
            if (cachedApiInfo.mape?.brIpv6Address) {
                values.mape_br = cachedApiInfo.mape.brIpv6Address;
                values.mape_ealen = cachedApiInfo.mape.eaBitLength;
                values.mape_ipv4_prefix = cachedApiInfo.mape.ipv4Prefix;
                values.mape_ipv4_prefixlen = cachedApiInfo.mape.ipv4PrefixLength;
                values.mape_ipv6_prefix = cachedApiInfo.mape.ipv6Prefix;
                values.mape_ipv6_prefixlen = cachedApiInfo.mape.ipv6PrefixLength;
                values.mape_psid_offset = cachedApiInfo.mape.psIdOffset;
                values.mape_psidlen = cachedApiInfo.mape.psidlen;
                
                const guaPrefix = CustomUtils.generateGuaPrefixFromFullAddress(cachedApiInfo);
                if (guaPrefix) {
                    values.mape_gua_prefix = guaPrefix;
                }
            } else if (cachedApiInfo.aftr?.aftrIpv6Address) {
                values.dslite_aftr_address = cachedApiInfo.aftr.aftrIpv6Address;
            }
        }
    } else {
        const internetCategory = setupConfig?.categories.find(cat => cat.id === 'internet-config');
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
                    if (cachedApiInfo?.aftr) {
                        values.dslite_aftr_type = cachedApiInfo.aftr.aftrType || '';
                        values.dslite_area = cachedApiInfo.aftr.jurisdiction || '';
                        values.dslite_aftr_address = cachedApiInfo.aftr.aftrIpv6Address || '';
                    }
                    
                    const uiType = getFieldValue('#dslite-aftr-type');
                    const uiArea = getFieldValue('#dslite-area');
                    const uiAddr = getFieldValue('#dslite-aftr-address');
                    if (uiType) values.dslite_aftr_type = uiType;
                    if (uiArea) values.dslite_area = uiArea;
                    if (cachedApiInfo?.aftr?.aftrIpv6Address) {
                        values.dslite_aftr_address = cachedApiInfo.aftr.aftrIpv6Address;
                    } else if (uiAddr) {
                        values.dslite_aftr_address = uiAddr;
                    }
                } else if (connectionType === 'mape') {
                    if (cachedApiInfo?.mape?.brIpv6Address) {
                        values.mape_br = cachedApiInfo.mape.brIpv6Address;
                        values.mape_ealen = cachedApiInfo.mape.eaBitLength;
                        values.mape_ipv4_prefix = cachedApiInfo.mape.ipv4Prefix;
                        values.mape_ipv4_prefixlen = cachedApiInfo.mape.ipv4PrefixLength;
                        values.mape_ipv6_prefix = cachedApiInfo.mape.ipv6Prefix;
                        values.mape_ipv6_prefixlen = cachedApiInfo.mape.ipv6PrefixLength;
                        values.mape_psid_offset = cachedApiInfo.mape.psIdOffset;
                        values.mape_psidlen = cachedApiInfo.mape.psidlen;
                        
                        const guaPrefix = CustomUtils.generateGuaPrefixFromFullAddress(cachedApiInfo);
                        if (guaPrefix) {
                            values.mape_gua_prefix = guaPrefix;
                        }
                    }
                    
                    const mapeType = getFieldValue('input[name="mape_type"]');
                    if (mapeType === 'gua') {
                        const currentGUAValue = getFieldValue('#mape-gua-prefix');
                        if (currentGUAValue) {
                            values.mape_gua_prefix = currentGUAValue;
                        } else if (!values.mape_gua_prefix && cachedApiInfo?.ipv6) {
                            const guaPrefix = CustomUtils.generateGuaPrefixFromFullAddress(cachedApiInfo);
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
        'wifi_mode': handleWifiModeChange
    };
    
    Object.entries(radioGroups).forEach(([name, handler]) => {
        document.querySelectorAll(`input[name="${name}"]`).forEach(radio => {
            radio.removeEventListener('change', handler);
            radio.addEventListener('change', handler);
        });
        
        const checked = document.querySelector(`input[name="${name}"]:checked`);
        if (checked) {
            handler({ target: checked });
        }
    });
    
    document.querySelectorAll('input[name="mape_type"]').forEach(radio => {
        radio.addEventListener('change', handleMapeTypeChange);
    });

    setupDsliteAddressComputation();
   
    setupCommandsInput();
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
    
    commandsManager = new MultiInputManager('commands-autocomplete', {
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
    
    CustomUtils.toggleGuaPrefixVisibility(mapeType);
    
    if (mapeType === 'pd') {
        const guaPrefixField = document.querySelector('#mape-gua-prefix');
        if (guaPrefixField) {
            guaPrefixField.value = '';
        }
        if (typeof values === 'object') {
            delete values.mape_gua_prefix;
        }
    }
    
    updateAllPackageState('mape-type');
}

function setupDsliteAddressComputation() {
    const aftrType = document.querySelector('#dslite-aftr-type');
    const aftrArea = document.querySelector('#dslite-area');
    const aftrAddr = document.querySelector('#dslite-aftr-address');

    if (!aftrType || !aftrArea || !aftrAddr) return;

    function getAddressMap() {
        const internetCategory = setupConfig.categories.find(cat => cat.id === 'internet-config');
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

function handleConnectionTypeChange(e) {
    const selectedType = e.target.value;
    
    const internetCategory = setupConfig.categories.find(cat => cat.id === 'internet-config');
    
    internetCategory.packages.forEach(pkg => {
        if (pkg.type === 'conditional-section' && pkg.showWhen?.field === 'connection_type') {
            const section = document.querySelector(`#${pkg.id}`);
            if (!section) return;
            
            if (pkg.showWhen.values?.includes(selectedType)) {
                CustomUtils.show(section);
                
                if (selectedType === 'auto' && cachedApiInfo) {
                    updateAutoConnectionInfo(cachedApiInfo);
                } else if (selectedType === 'mape' && cachedApiInfo) {
                    const guaPrefixField = document.querySelector('#mape-gua-prefix');
                    if (guaPrefixField && cachedApiInfo.ipv6) {
                        const guaPrefix = CustomUtils.generateGuaPrefixFromFullAddress(cachedApiInfo);
                        if (guaPrefix && !guaPrefixField.value) {
                            guaPrefixField.value = guaPrefix;
                            console.log('GUA prefix set for MAP-E:', guaPrefix);
                        }
                    }
                }
            } else {
                CustomUtils.hide(section);
            }
        }
    });
    
    updateAllPackageState('connection-type');
}

function handleNetOptimizerChange(e) {
    const mode = e.target.value;
    
    const tuningCategory = setupConfig.categories.find(cat => cat.id === 'tuning-config');
    
    tuningCategory.packages.forEach(pkg => {
        if (pkg.type === 'conditional-section' && pkg.showWhen?.field === 'net_optimizer') {
            const section = document.querySelector(`#${pkg.id}`);
            if (!section) return;
            
            if (pkg.showWhen.values?.includes(mode)) {
                CustomUtils.show(section);
                
                if (mode === 'manual') {
                    restoreManualDefaults();
                }
            } else {
                CustomUtils.hide(section);
            }
        }
    });
    
    updateAllPackageState('net-optimizer');
}

function handleWifiModeChange(e) {
    const mode = e.target.value;
    
    const wifiCategory = setupConfig.categories.find(cat => cat.id === 'wifi-config');
    
    const wifiModeConfig = wifiCategory.packages.find(pkg => 
        pkg.variableName === 'wifi_mode'
    );
    
    const selectedOption = wifiModeConfig.options.find(opt => opt.value === mode);
    
    wifiCategory.packages.forEach(pkg => {
        if (pkg.type === 'conditional-section') {
            const section = document.querySelector(`#${pkg.id}`);
            if (!section) return;
            
            if (pkg.showWhen?.values?.includes(mode)) {
                CustomUtils.show(section);
                
                if (pkg.children) {
                    pkg.children.forEach(child => {
                        if (child.type === 'conditional-section') {
                            const childSection = document.querySelector(`#${child.id}`);
                            if (childSection) {
                                if (child.showWhen?.values?.includes(mode)) {
                                    CustomUtils.show(childSection);
                                } else {
                                    CustomUtils.hide(childSection);
                                }
                            }
                        }
                    });
                }
            } else {
                CustomUtils.hide(section);
            }
        }
    });
    
    if (mode === 'disabled') {
        clearWifiFields();
    } else {
        restoreWifiDefaults();
    }
    
    updateAllPackageState('wifi-mode');
}

function restoreManualDefaults() {
    const tuningCategory = setupConfig.categories.find(cat => cat.id === 'tuning-config');
    const manualSection = tuningCategory.packages.find(pkg => pkg.id === 'netopt-manual-section');
    const netoptFields = manualSection.children.find(child => child.id === 'netopt-fields');
    
    netoptFields.fields.forEach(field => {
        if (field.defaultValue !== undefined && field.defaultValue !== null) {
            const el = document.querySelector(field.selector || `#${field.id}`);
            if (el && !el.value) {
                el.value = field.defaultValue;
            }
        }
    });
}

function restoreWifiDefaults() {
    const wifiCategory = setupConfig.categories.find(cat => cat.id === 'wifi-config');
    
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
                el.value = field.defaultValue;
            }
        }
    });
}

function clearWifiFields() {
    const wifiCategory = setupConfig.categories.find(cat => cat.id === 'wifi-config');
    
    function findAndClearWifiFields(pkg) {
        if (pkg.type === 'input-group' && pkg.fields) {
            pkg.fields.forEach(field => {
                const el = document.querySelector(field.selector || `#${field.id}`);
                if (el) {
                    el.value = '';
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
        cachedApiInfo = apiInfo;
        
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
    if (!cachedApiInfo) {
        return false;
    }
    
    const firstElement = document.querySelector('#auto-config-country');
    if (!firstElement) {
        return false;
    }
    
    displayIspInfo(cachedApiInfo);
    console.log('ISP info displayed');
    return true;
}

function displayIspInfo(apiInfo) {
    if (!apiInfo) return;
    
    CustomUtils.setValue("#auto-config-country", apiInfo.country || "Unknown");
    CustomUtils.setValue("#auto-config-timezone", apiInfo.timezone || "Unknown");
    CustomUtils.setValue("#auto-config-zonename", apiInfo.zonename || "Unknown");
    CustomUtils.setValue("#auto-config-isp", apiInfo.isp || "Unknown");
    CustomUtils.setValue("#auto-config-as", apiInfo.as || "Unknown");
    CustomUtils.setValue("#auto-config-ip", [apiInfo.ipv4, apiInfo.ipv6].filter(Boolean).join(" / ") || "Unknown");

    const wanType = getConnectionType(apiInfo);
    CustomUtils.setValue("#auto-config-method", wanType);
    CustomUtils.setValue("#auto-config-notice", apiInfo.notice || "");
    
    CustomUtils.show("#extended-build-info");
}

async function insertExtendedInfo(temp) {
    const extendedInfo = temp.querySelector('#extended-build-info');
    const imageLink = document.querySelector('#image-link');
    
    if (!extendedInfo || !imageLink || document.querySelector('#extended-build-info')) {
        return;
    }
    
    try {
        const infoUrl = config?.information_path || 'auto-config/information.json';
        const response = await fetch(infoUrl + '?t=' + Date.now());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const infoConfig = await response.json();
        console.log('Information config loaded:', infoConfig);
        
        extendedInfo.innerHTML = '';
        
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
                        
                        row.appendChild(col1);
                        row.appendChild(col2);
                        extendedInfo.appendChild(row);
                    });
                }
            });
        });
        
        imageLink.closest('.row').insertAdjacentElement('afterend', extendedInfo);
        
        console.log('Extended info DOM elements created');
        displayIspInfoIfReady();
        
    } catch (err) {
        console.error('Failed to load information.json:', err);
    }
}

async function initializeCustomFeatures(asuSection, temp) {
    console.log('initializeCustomFeatures called');

    if (customInitialized) {
        console.log('Already initialized, skipping');
        return;
    }

    if (!document.querySelector('#custom-packages-details')) {
        cleanupExistingCustomElements();
        replaceAsuSection(asuSection, temp);
        await insertExtendedInfo(temp);  // 拡張情報セクション挿入（ISP表示含む）
    }

    await Promise.all([
        window.autoConfigPromise,       // auto-config.site-u.workers.dev
        window.informationPromise,      // information.json
        window.packagesDbPromise,       // packages.json
        window.setupJsonPromise,        // setup.json
        loadSetupConfig(),              // 既存処理
        loadPackageDatabase(),          // 既存処理
        fetchAndDisplayIspInfo()        // ISP情報取得
    ]);

    setupEventListeners();
    loadUciDefaultsTemplate();

    setupLanguageSelector();

    setupPackageSearch();
    console.log('Package search initialized');

    await loadCustomTranslations(current_language);

    setupFormWatchers();

    let changed = false;
    if (window.autoConfigData || cachedApiInfo) {
        changed = applyIspAutoConfig(window.autoConfigData || cachedApiInfo);  // ← ここで実行
    }

    generatePackageSelector();

    if (deviceDefaultPackages.length > 0 || deviceDevicePackages.length > 0 || extraPackages.length > 0) {
        console.log('Force applying existing device packages');
        const initialPackages = deviceDefaultPackages
            .concat(deviceDevicePackages)
            .concat(extraPackages);
        
        const textarea = document.querySelector('#asu-packages');
        if (textarea && initialPackages.length > 0) {
            textarea.value = initialPackages.join(' ');
            console.log('Device packages force applied:', initialPackages);
        }
    }

    if (changed) {
        console.log('All data and UI ready, updating package state');
        updateAllPackageState('isp-auto-config');
    } else {
        console.log('All data and UI ready, no changes from auto-config');
        const runWhenReady = () => {
            if ((deviceDefaultPackages && deviceDefaultPackages.length > 0) ||
                (deviceDevicePackages && deviceDevicePackages.length > 0) ||
                (extraPackages && extraPackages.length > 0)) {
                updateAllPackageState('force-device-packages');
                document.removeEventListener('devicePackagesReady', runWhenReady);
            }
        };
        document.addEventListener('devicePackagesReady', runWhenReady);
    }

    customInitialized = true;
}

function applyIspAutoConfig(apiInfo) {
    if (!apiInfo || !formStructure || !formStructure.fields) {
        console.warn('applyIspAutoConfig: formStructure not ready, skipping');
        return false;
    }

    const rawType = getFieldValue('input[name="connection_type"]');
    const connectionType = (rawType === null || rawType === undefined || rawType === '') ? 'auto' : rawType;

    let mutated = false;

    Object.values(formStructure.fields).forEach(field => {
        if (!field.apiMapping) return;

        const isConnectionField = ['dslite', 'mape', 'ap', 'pppoe'].some(type =>
            formStructure.connectionTypes[type]?.includes(field.id)
        );

        if (isConnectionField && connectionType !== 'auto') {
            return;
        }

        let value = CustomUtils.getNestedValue(apiInfo, field.apiMapping);

        if (field.variableName === 'mape_gua_prefix') {
            const guaPrefix = CustomUtils.generateGuaPrefixFromFullAddress(cachedApiInfo);
            if (guaPrefix) value = guaPrefix;
        }

        if (value !== null && value !== undefined && value !== '') {
            const element = document.querySelector(field.selector);
            if (element && element.value !== String(value)) {
                element.value = value;
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
    
    const connectionType = getConnectionType(apiInfo);
    if (connectionType === 'MAP-E') {
        infoText = 'Detected: MAP-E\n';
        infoText += `\u00A0BR: ${apiInfo.mape.brIpv6Address}\n`;
        infoText += `\u00A0EA-len: ${apiInfo.mape.eaBitLength}\n`;
        infoText += `\u00A0IPv4 Prefix: ${apiInfo.mape.ipv4Prefix}/${apiInfo.mape.ipv4PrefixLength}\n`;
        infoText += `\u00A0IPv6 Prefix: ${apiInfo.mape.ipv6Prefix}/${apiInfo.mape.ipv6PrefixLength}\n`;
        infoText += `\u00A0PSID: offset=${apiInfo.mape.psIdOffset}\n`;
        infoText += `\u00A0PSID: length=${apiInfo.mape.psidlen}`;
    } else if (connectionType === 'DS-Lite') {
        infoText = 'Detected: DS-Lite\n';
        infoText += `AFTR: ${apiInfo.aftr}`;
    } else {
        infoText = 'Detected: DHCP/PPPoE\n';
        infoText += '\u00A0Standard connection will be used';
    }
    
    if (apiInfo?.isp) {
        infoText += `\n\nISP: ${apiInfo.isp}`;
        if (apiInfo.as) {
            infoText += `\nAS: ${apiInfo.as}`;
        }
    }
    
    autoInfo.textContent = infoText;
}

// ==================== パッケージ管理 ====================

async function loadPackageDatabase() {
    try {
        const url = config?.packages_db_path || 'packages/packages.json';
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        packagesJson = await response.json();
        console.log('Package database loaded:', packagesJson);
        
        return packagesJson;
    } catch (err) {
        console.error('Failed to load package database:', err);
        return null;
    }
}

function generatePackageSelector() {
    const container = document.querySelector('#package-categories');
    if (!container || !packagesJson) {
        return;
    }
    
    container.innerHTML = '';
    
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'package-loading-indicator';
    loadingDiv.style.display = 'none';
    loadingDiv.style.padding = '1em';
    loadingDiv.style.textAlign = 'center';
    loadingDiv.style.color = 'var(--text-muted)';
    loadingDiv.innerHTML = '<span class="tr-checking-packages">Checking package availability...</span>';
    container.appendChild(loadingDiv);
    
    packagesJson.categories.forEach(category => {
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
    console.log(`Generated ${packagesJson.categories.length} package categories (including hidden)`);
    
    const arch = current_device?.arch || cachedDeviceArch;
    if (arch) {
        requestAnimationFrame(() => {
            const indicator = document.querySelector('#package-loading-indicator');
            if (indicator) {
                indicator.style.display = 'block';
            }

            verifyAllPackages().then(() => {
                if (indicator) {
                    indicator.style.display = 'none';
                }
                console.log('Package verification completed');
            }).catch(err => {
                console.error('Package verification failed:', err);
                if (indicator) {
                    indicator.innerHTML = '<span class="tr-package-check-failed">Package availability check failed</span>';
                    indicator.addEventListener('click', () => {
                        indicator.style.display = 'none';
                    }, { once: true });
                }
            });
        });
    } else {
        console.log('Device architecture not available, skipping package verification');
    }
}

function createHiddenPackageCheckbox(pkg) {
    let hiddenContainer = document.querySelector('#hidden-packages-container');
    if (!hiddenContainer) {
        hiddenContainer = document.createElement('div');
        hiddenContainer.id = 'hidden-packages-container';
        hiddenContainer.style.display = 'none';
        document.body.appendChild(hiddenContainer);
    }
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `pkg-${pkg.uniqueId || pkg.id}`;
    checkbox.className = 'package-selector-checkbox';
    checkbox.setAttribute('data-package', pkg.id);
    checkbox.setAttribute('data-unique-id', pkg.uniqueId || pkg.id);
    checkbox.style.display = 'none';
    
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
    
    const mainCheckbox = createPackageCheckbox(pkg, pkg.checked || false);
    packageItem.appendChild(mainCheckbox);
    
    if (pkg.dependencies && Array.isArray(pkg.dependencies)) {
        const depContainer = document.createElement('div');
        depContainer.className = 'package-dependencies';
        
        pkg.dependencies.forEach(depId => {
            const depPkg = findPackageById(depId);
            if (depPkg) {
                const depCheckbox = createPackageCheckbox(depPkg, pkg.checked || false, true);
                depCheckbox.classList.add('package-dependent');
                depContainer.appendChild(depCheckbox);
            }
        });
        
        if (depContainer.children.length > 0) {
            packageItem.appendChild(depContainer);
        }
    }
    
    if (pkg.enableVar) {
        const checkbox = packageItem.querySelector(`#pkg-${pkg.id}`);
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
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '0.5em';
    label.style.cursor = 'pointer';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `pkg-${pkg.uniqueId || pkg.id}`; 
    checkbox.className = 'form-check-input package-selector-checkbox';
    checkbox.setAttribute('data-package', pkg.id);   // id
    checkbox.setAttribute('data-unique-id', pkg.uniqueId || pkg.id); 
    
    if (pkg.dependencies) {
        checkbox.setAttribute('data-dependencies', pkg.dependencies.join(','));
    }
    
    if (isChecked) {
        checkbox.checked = true;
    }
    
    checkbox.addEventListener('change', handlePackageSelection);
    
    if (config?.package_url) {
        const link = document.createElement('a');
        link.href = config.package_url.replace("{id}", encodeURIComponent(pkg.id));
        link.target = '_blank';
        link.className = 'package-link';
        link.textContent = pkg.name || pkg.id;
        link.onclick = (e) => e.stopPropagation();
        label.appendChild(checkbox);
        label.appendChild(link);
    } else {
        const span = document.createElement('span');
        span.textContent = pkg.name || pkg.id;
        label.appendChild(checkbox);
        label.appendChild(span);
    }
    
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
    if (!packagesJson) return null;
    
    for (const category of packagesJson.categories) {
        const pkg = category.packages.find(p => p.uniqueId === id || p.id === id);
        if (pkg) return pkg;
    }
    return null;
}

// ==================== UCI-defaults処理 ====================

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

    textarea.addEventListener('input', autoResize);
    textarea.addEventListener('paste', () => {
        requestAnimationFrame(autoResize);
    });

    fetch(templatePath + '?t=' + Date.now())
        .then(r => { 
            if (!r.ok) throw new Error(`Failed to load setup.sh: ${r.statusText}`); 
            return r.text(); 
        })
        .then(text => {
            textarea.value = text;
            console.log('setup.sh loaded successfully');
            updateVariableDefinitions();
            autoResize();
        })
        .catch(err => {
            console.error('Failed to load setup.sh:', err);
            textarea.value = `#!/bin/sh
# BEGIN_VARIABLE_DEFINITIONS
# END_VARIABLE_DEFINITIONS

# BEGIN_CUSTOM_COMMANDS
# END_CUSTOM_COMMANDS

exit 0`;
            autoResize();
        });
}

function updateVariableDefinitions() {
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    if (!textarea) return;

    const values = collectFormValues && typeof collectFormValues === 'function'
        ? collectFormValues()
        : null;

    if (!values || typeof values !== 'object' || Object.keys(values).length === 0) {
        console.warn("updateVariableDefinitions: values 未取得のためスキップ");
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

function updateTextareaContent(textarea, variableDefinitions) {
    let content = textarea.value;
    const beginMarker = '# BEGIN_VARIABLE_DEFINITIONS';
    const endMarker = '# END_VARIABLE_DEFINITIONS';
    const beginIndex = content.indexOf(beginMarker);
    const endIndex = content.indexOf(endMarker);
    
    if (beginIndex !== -1 && endIndex !== -1) {
        const beforeSection = content.substring(0, beginIndex + beginMarker.length);
        const afterSection = content.substring(endIndex);
        const newSection = variableDefinitions ? '\n' + variableDefinitions + '\n' : '\n';
        textarea.value = beforeSection + newSection + afterSection;
        textarea.rows = textarea.value.split('\n').length + 1;
    }
}

function generateVariableDefinitions(values) {
    const lines = [];
    Object.entries(values).forEach(([key, value]) => {
        const escapedValue = value.toString().replace(/'/g, "'\"'\"'");
        lines.push(`${key}='${escapedValue}'`);
    });
    return lines.join('\n');
}

function updateCustomCommands() {
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    if (!textarea) return;
    
    const customCommands = commandsManager ? commandsManager.getAllValues().join('\n') : '';
    
    let content = textarea.value;
    
    const beginMarker = '# BEGIN_CUSTOM_COMMANDS';
    const endMarker = '# END_CUSTOM_COMMANDS';
    
    const beginIndex = content.indexOf(beginMarker);
    const endIndex = content.indexOf(endMarker);
    
    if (beginIndex !== -1 && endIndex !== -1) {
        const beforeSection = content.substring(0, beginIndex + beginMarker.length);
        const afterSection = content.substring(endIndex);
        const newSection = customCommands ? '\n' + customCommands + '\n' : '\n';
        
        textarea.value = beforeSection + newSection + afterSection;
        
        const lines = textarea.value.split('\n').length;
        textarea.rows = lines + 1;
    }
}

// ==================== フォーム監視 ====================

function setupFormWatchers() {
    if (!formStructure.fields) {
        return;
    }
    
    Object.values(formStructure.fields).forEach(field => {
        if (field.selector) {
            document.querySelectorAll(field.selector).forEach(element => {
                element.removeEventListener('input', updateVariableDefinitions);
                element.removeEventListener('change', updateVariableDefinitions);
                
                if (element.type === 'radio' || element.type === 'checkbox' || element.tagName === 'SELECT') {
                    element.addEventListener('change', updateVariableDefinitions);
                } else {
                    element.addEventListener('input', updateVariableDefinitions);
                }
            });
        }
    });
    
    updateVariableDefinitions();
}

// ==================== エラーハンドリング ====================

if (window.DEBUG_MODE) {
    ['error', 'unhandledrejection'].forEach(event => {
        window.addEventListener(event, e => console.error(`Custom.js ${event}:`, e.reason || e.error));
    });
}

console.log('custom.js (Unified Virtual Package Management System) fully loaded and ready');
