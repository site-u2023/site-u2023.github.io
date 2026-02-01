// custom.js
console.log('custom.js (R8.0201.1109) loaded');

// === CONFIGURATION SWITCH ===
const CONSOLE_MODE = {
    log: false,   // 通常ログ
    info: false,  // 情報
    warn: false,  // 警告
    debug: false, // デバッグ
    error: true   // エラー（常時 true 推奨）
};

// ===== Console Control Layer =====
(function() {
    const original = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug
    };

    const loggingState = { ...CONSOLE_MODE };

    window.ConsoleControl = {
        set(type, state) {
            if (type in loggingState) loggingState[type] = !!state;
        },
        enableAll() {
            for (const key in loggingState) loggingState[key] = true;
        },
        disableAll() {
            for (const key in loggingState) loggingState[key] = false;
            loggingState.error = true;
        },
        status() {
            return { ...loggingState };
        }
    };

    for (const [key, fn] of Object.entries(original)) {
        console[key] = (...args) => {
            if (loggingState[key]) fn.apply(console, args);
        };
    }

    console.info('[ConsoleControl] Logging control initialized.');
})();

// ==================== バージョンとリンクの初期化 ====================
window.addEventListener('load', () => {
    const versionEl = document.getElementById('ofs-version');
    if (versionEl && typeof custom_ofs_version !== 'undefined') {
        versionEl.innerText = custom_ofs_version;
    }
    
    const linkEl = versionEl?.closest('a');
    if (linkEl && typeof custom_ofs_link !== 'undefined') {
        linkEl.href = custom_ofs_link;
        linkEl.target = "_blank";
        linkEl.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                node.textContent = '';
            }
        });
    }
    
    const feedbackLink = document.querySelector('.tr-feedback-link');
    if (feedbackLink) {
        if (typeof custom_feedback_link !== 'undefined') {
            feedbackLink.href = custom_feedback_link;
        }
        if (typeof custom_feedback_text !== 'undefined') {
            feedbackLink.textContent = custom_feedback_text;
        }
        feedbackLink.target = "_blank";
    }
});

// ==================== 状態管理 ====================
const state = {
    device: {
        arch: null,
        version: null,
        target: null,
        vendor: null,
        subtarget: null,
        id: null
    },
    
    apiInfo: null,
    autoConfig: null, 
    apiValues: {},
    lookupTargetFields: null,
    extendedInfoConfig: null,
    
    packages: {
        json: null,
        default: [],
        device: [],
        extra: [],
        dynamic: new Set(),
        selected: new Set()
    },
    
    config: {
        setup: null,
        constants: {}
    },
    
    ui: {
        initialized: false,
        htmlLoaded: false,
        language: {
            selected: '',
            current: ''
        },
        managers: {
            packageSearch: null,
            commands: null
        }
    },
    
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
        packageSizes: new Map(),
        packageDescriptions: new Map(),
        packageVersions: new Map(),
        packageManagerCache: new Map()
    },

    dom: {
        textarea: null,
        packageLoadingIndicator: null
    },

    packageManager: {
        config: null,
        activeManager: null,
        activeChannel: null
    }
};

// ==================== パッケージマネージャー設定 ====================
async function loadPackageManagerConfig() {
    try {
        const url = config.package_manager_config_path;
        const response = await fetch(url + '?t=' + Date.now());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        state.packageManager = state.packageManager || {};
        state.packageManager.config = await response.json();
        console.log('Package manager config loaded:', state.packageManager.config);
        return state.packageManager.config;
    } catch (err) {
        console.error('Failed to load package-manager.json:', err);
        return null;
    }
}

function determinePackageManager(version) {
    if (!state.packageManager?.config) {
        throw new Error('Package manager config not loaded');
    }
    if (!version) {
        throw new Error('Version not specified');
    }
    
    if (state.cache.packageManagerCache.has(version)) {
        return state.cache.packageManagerCache.get(version);
    }
    
    const channel = version === 'SNAPSHOT' ? 'snapshotBare' 
              : version.includes('SNAPSHOT') ? 'snapshot' 
              : 'release';
    const channelConfig = state.packageManager.config.channels[channel];
    
    if (!channelConfig) {
        throw new Error(`Channel config not found: ${channel}`);
    }
    
    const versionNum = version.match(/^[\d.]+/)?.[0];
    
    let bestManager = null;
    let highestThreshold = '';
    
    for (const [managerName] of Object.entries(state.packageManager.config.packageManagers)) {
        const managerChannelConfig = channelConfig[managerName];
        if (!managerChannelConfig) continue;
        
        const threshold = managerChannelConfig.versionThreshold;
        
        if (threshold === undefined) {
            bestManager = managerName;
            continue;
        }
        
        if (!versionNum) continue;
        
        if (versionNum >= threshold && (!highestThreshold || threshold > highestThreshold)) {
            highestThreshold = threshold;
            bestManager = managerName;
        }
    }
    
    if (!bestManager) {
        throw new Error(`No package manager found for version ${version} in channel ${channel}`);
    }
    
    state.cache.packageManagerCache.set(version, bestManager);
    
    if (state.cache.packageManagerCache.size === 1) {
        console.log(`determinePackageManager: version=${version} channel=${channel} → ${bestManager}`);
    }
    
    return bestManager;
}

function applyUrlTemplate(template, vars) {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
}

function getConfiguredFeeds() {
    if (!state.device.version) {
        throw new Error('getConfiguredFeeds: version not set');
    }
    if (!state.packageManager.config) {
        throw new Error('getConfiguredFeeds: package manager config not loaded');
    }
    
    const manager = determinePackageManager(state.device.version);
    const managerConfig = state.packageManager.config.packageManagers[manager];
    
    const feeds = [...managerConfig.feeds];
    if (managerConfig.includeTargets) feeds.push('target');
    if (managerConfig.includeKmods) feeds.push('kmods');
    
    return feeds;
}

// ==================== ユーティリティ ====================
const UI = {
    updateElement(idOrEl, opts = {}) {
        const el = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
        if (!el) return;

        if ('show' in opts) {
            el.classList.toggle('hide', !opts.show);
            el.style.display = opts.show ? '' : 'none';
        }
        if ('text' in opts) el.textContent = opts.text;
        if ('html' in opts) el.innerHTML = opts.html;
        if ('value' in opts) el.value = opts.value;
        if ('disabled' in opts) el.disabled = !!opts.disabled;
    },
    
    show(el) {
        this.updateElement(el, { show: true });
    },
    
    hide(el) {
        this.updateElement(el, { show: false });
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

    createGridContainer(columns = 1) {
        const container = document.createElement('div');
        container.className = 'config-items-grid';
        container.style.display = 'grid';
        container.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
        container.style.gap = '1em';
        container.style.alignItems = 'start';
        return container;
    },
  
    buildKmodsUrl: async function(version, vendor, isSnapshot) {
        const subtarget = this.getSubtarget();
        if (!subtarget) {
            throw new Error(`Missing subtarget for kmods URL: version=${version}, vendor=${vendor}`);
        }
        
        const deviceInfo = {
            version,
            arch: state.device.arch,
            vendor,
            subtarget,
            isSnapshot
        };
        
        return await buildPackageUrl('kmods', deviceInfo);
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
    
    generateStaticPrefixFromFullAddress: function(apiInfo) {
        if (!apiInfo?.ipv6) return null;
        const ipv6 = apiInfo.ipv6.toLowerCase();

        const guaPrefixCheck = state.config.constants.static_validation.prefix_check;
        const excludeCidrs = state.config.constants.static_validation.exclude_cidrs;

        if (!this.inCidr(ipv6, guaPrefixCheck)) return null;

        if (excludeCidrs.some(cidr => this.inCidr(ipv6, cidr))) {
            return null;
        }

        const segments = ipv6.split(':');
        if (segments.length >= 4) {
            return `${segments[0]}:${segments[1]}:${segments[2]}:${segments[3]}::/64`;
        }
        return null;
    },

    setStaticPrefixIfAvailable: function() {
        const staticPrefixField = document.getElementById('mape-static-prefix');
        if (!staticPrefixField || !state.apiInfo?.ipv6) return;
        const staticPrefix = this.generateStaticPrefixFromFullAddress(state.apiInfo);
        if (staticPrefix) {
            UI.updateElement(staticPrefixField, { value: staticPrefix });
        }
    },

    split(str = '') {
        return str.trim().match(/[^\s,]+/g) || [];
    },

    getNestedValue(obj, path) {
        if (!obj || !path) return undefined;
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }
};

function clearSectionFields(categoryId, sectionId, excludeIds = []) {
    const category = state.config.setup?.categories?.find(cat => cat.id === categoryId);
    if (!category) return;
    
    const section = category.items?.find(item => item.id === sectionId);
    if (!section) return;
    
    section.items?.forEach(item => {
        if (item.type === 'field' && !excludeIds.includes(item.id)) {
            const el = document.getElementById(item.id);
            if (el) el.value = '';
        }
    });
}

// ==================== DOM要素キャッシュ ====================
function cacheFrequentlyUsedElements() {
    state.dom.textarea = document.querySelector('#asu-packages');
    state.dom.sizeBreakdown = document.querySelector('#package-size-breakdown');
    state.dom.packageLoadingIndicator = document.querySelector('#package-loading-indicator');
}

// ==================== 初期化処理 ====================
const originalUpdateImages = window.updateImages;

window.updateImages = function(version, mobj) {
    if (originalUpdateImages) originalUpdateImages(version, mobj);

    const oldArch = state.device.arch;
    const oldVersion = state.device.version;
    const oldDeviceId = state.device.id;

    if (mobj && mobj.arch_packages) {
        state.device.arch = mobj.arch_packages;
        state.device.version = version;
        state.device.target = mobj.target || '';
        state.device.id = mobj.id || state.device.id;
        
        CustomUtils.updateDeviceInfo(mobj.target);

        console.log('[TRACE] device updated:', state.device);    
      
if (oldArch !== mobj.arch_packages || oldVersion !== version || oldDeviceId !== mobj.id) {
            console.log('[TRACE] Device changed, clearing caches');
            
            state.cache.packageAvailability.clear();
            state.cache.feed.clear();
            state.cache.feedPackageSet.clear();
            state.cache.availabilityIndex.clear();
            state.cache.packageSizes.clear();
            state.cache.packageDescriptions.clear();
            state.cache.packageVersions.clear();
            state.cache.packageManagerCache.clear();
            state.cache.kmods.token = null;
            state.cache.kmods.key = null;
            state.cache.lastFormStateHash = null;
            state.cache.lastPackageListHash = null;
            state.cache.prevUISelections.clear();
            
            document.querySelectorAll('.package-item').forEach(item => {
                item.style.display = '';
            });
            document.querySelectorAll('.package-category').forEach(cat => {
                cat.style.display = '';
            });

            requestAnimationFrame(() => {
                if (!state.device.vendor) {
                    console.warn('[WARN] No vendor info, kmods may not verify');
                }

                const indicator = state.dom.packageLoadingIndicator || document.querySelector('#package-loading-indicator');
                if (indicator) {
                    UI.updateElement(indicator, { show: true });
                }

                verifyAllPackages().then(() => {
                    if (indicator) {
                        UI.updateElement(indicator, { show: false });
                    }
                    console.log('[TRACE] Package verification complete');
                }).catch(err => {
                    console.error('Package verification failed:', err);
                    if (indicator) {
                        UI.updateElement(indicator, {
                            html: '<span class="tr-package-check-failed">Package availability check failed</span>',
                            show: true
                        });
                    }
                });
                
                updatePackageListToTextarea('version-changed');
            });
        }
    }

    if (mobj && "manifest" in mobj === false) {
        state.packages.default = mobj.default_packages || [];
        state.packages.device = mobj.device_packages || [];
        state.packages.extra = config.asu_extra_packages || [];

        document.dispatchEvent(new Event('devicePackagesReady'));

        console.log('[TRACE] Device packages saved');

        const initialPackages = state.packages.default
            .concat(state.packages.device)
            .concat(state.packages.extra);

        const textarea = document.querySelector('#asu-packages');
        if (textarea) {
            UI.updateElement(textarea, { value: initialPackages.join(' ') });
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

// ==================== setup.json処理 ====================
async function loadSetupConfig() {
    try {
        const url = config.setup_db_path;
        const response = await fetch(url + '?t=' + Date.now());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        state.config.setup = await response.json();
        state.config.constants = state.config.setup.constants || {};
        
        console.log('Setup config loaded (v2.0):', state.config.setup);
        
        renderSetupConfig(state.config.setup);
        
        console.log('Setup config rendered successfully');
        return state.config.setup;
    } catch (err) {
        console.error('Failed to load setup.json:', err);
        return null;
    }
}

function renderSetupConfig(config) {
    const container = document.querySelector('#dynamic-config-sections');
    if (!container) {
        console.error('#dynamic-config-sections not found');
        return;
    }
    
    container.innerHTML = '';
    console.log('Container cleared, rebuilding...');

    const columns = config.columns || 1;

    (config.categories || []).forEach((category) => {
        const section = document.createElement('div');
        section.className = 'config-section';
        section.id = category.id;

        const h4 = document.createElement('h4');
        
        if (category.link) {
            const a = document.createElement('a');
            a.href = category.link;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.className = 'linked-title';
            if (category.class) {
                a.classList.add(category.class);
                a.textContent = category.class;
            } else {
                a.textContent = category.title || category.id || '';
            }
            h4.appendChild(a);
        } else {
            if (category.class) {
                h4.classList.add(category.class);
                h4.textContent = category.class;
            } else {
                h4.textContent = category.title || category.id || '';
            }
        }
        
        if (category.description || category.descriptionUrl) {
            addTooltip(h4, category.descriptionUrl || category.description);
        }
        
        section.appendChild(h4);
        
        const itemsContainer = CustomUtils.createGridContainer(columns);

        const items = category.items || [];
        const itemCount = items.length;

        items.forEach((item) => {
            try {
                const element = buildItem(item);
                if (element) {
                    if (item.type === 'info-display' || (item.id && item.id.includes('info'))) {
                        element.style.gridColumn = '1 / -1';
                    } 
                    else if (itemCount === 1 || item.type === 'radio-group' || item.type === 'section') {
                        element.style.gridColumn = '1 / -1';
                    }
                    itemsContainer.appendChild(element);
                }
            } catch (error) {
                console.error(`Error rendering item ${item.id}:`, error);
            }
        });

        section.appendChild(itemsContainer);
        container.appendChild(section);
    });

    requestAnimationFrame(() => {
        setupEventListeners();

        if (state.apiInfo) {
            applyIspAutoConfig(state.apiInfo);
            displayIspInfo(state.apiInfo);
            console.log('Applied ISP config after form render');
        }
        
        requestAnimationFrame(() => {
            evaluateAllComputedFields();
            if (current_language_json) {
                applyCustomTranslations(current_language_json);
            }
        });
    });
}

function evaluateAllComputedFields() {
    console.log('Evaluating all computed fields...');
    
    if (!state.config.setup) return;
    
    for (const category of state.config.setup.categories) {
        for (const item of category.items) {
            if (item.type === 'field' && item.computed) {
                console.log(`Found computed field: ${item.id}`);
                
                if (item.showWhen && !evaluateShowWhen(item.showWhen)) {
                    console.log(`Skipping hidden computed field: ${item.id}`);
                    continue;
                }
                
                computeFieldValue(item.variable);
            } else if (item.type === 'section' && item.items) {
                for (const subItem of item.items) {
                    if (subItem.type === 'field' && subItem.computed) {
                        console.log(`Found computed field in section: ${subItem.id}`);
                        
                        if (item.showWhen && !evaluateShowWhen(item.showWhen)) {
                            console.log(`Skipping field in hidden section: ${subItem.id}`);
                            continue;
                        }
                        if (subItem.showWhen && !evaluateShowWhen(subItem.showWhen)) {
                            console.log(`Skipping hidden computed field: ${subItem.id}`);
                            continue;
                        }
                        
                        computeFieldValue(subItem.variable);
                    }
                }
            }
        }
    }
}

function buildItem(item) {
    switch (item.type) {
        case 'field':
            return buildField(item);
        
        case 'radio-group':
            return buildRadioGroup(item);
        
        case 'section':
            return buildSection(item);
        
        case 'info-display':
            return buildInfoDisplay(item);
        
        default:
            console.warn(`Unknown item type: ${item.type}`);
            return null;
    }
}

function buildField(field) {
    const row = document.createElement('div');
    row.className = 'form-row';
    
    if (field.hidden) {
        row.style.display = 'none';
    }
    
    if (field.showWhen) {
        row.setAttribute('data-show-when', JSON.stringify(field.showWhen));
        if (!field.hidden) {
            row.style.display = 'none';
        }
    }

    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.appendChild(buildLinkOrSpan(field, field.label || field.id || ''));
    
    if (field.id) label.setAttribute('for', field.id);
    
    if (field.description || field.descriptionUrl) {
        addTooltip(label, field.descriptionUrl || field.description);
    }
    
    group.appendChild(label);

    let ctrl;
    if (field.fieldType === 'select') {
        ctrl = document.createElement('select');
        if (field.id) ctrl.id = field.id;
        if (field.variable) ctrl.name = field.variable;
        
        let optionsSource = [];
        if (field.source === 'browser-languages') {
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
            option.textContent = opt.label || opt.value;
            if (opt.class) option.classList.add(opt.class);
            if (opt.selected || (field.default && opt.value === field.default)) {
                option.selected = true;
            }
            ctrl.appendChild(option);
        });

        if (field.computeTarget) {
            ctrl.addEventListener('change', () => {
                computeFieldValue(field.computeTarget);
                evaluateAllShowWhen();
                updateVariableDefinitions();
            });
        } else if (field.id !== 'device-language') {
            ctrl.addEventListener('change', () => {
                evaluateAllShowWhen();
                if (field.variable) {
                    updatePackagesForRadioGroup(field.variable);
                }
                updateAllPackageState('form-field');
            });
        }
    } else {
        ctrl = document.createElement('input');
        ctrl.type = field.fieldType || 'text';
        if (field.id) ctrl.id = field.id;
        
        if (field.placeholder) ctrl.placeholder = field.placeholder;
        
        let setValue = null;
        if (field.default !== null && field.default !== undefined && field.default !== '') {
            setValue = field.default;
        } else if (field.apiSource && state.apiInfo) {
            const apiValue = CustomUtils.getNestedValue(state.apiInfo, field.apiSource);
            if (apiValue !== null && apiValue !== undefined && apiValue !== '') {
                setValue = apiValue;
            }
        }
        
        if (setValue !== null) {
            UI.updateElement(ctrl, { value: setValue });
        }
        
        if (field.min != null) ctrl.min = field.min;
        if (field.max != null) ctrl.max = field.max;
        if (field.maxlength != null) ctrl.maxLength = field.maxlength;
        if (field.minlength != null) ctrl.minLength = field.minlength;
        if (field.pattern != null) ctrl.pattern = field.pattern;
        
        if (field.computed) {
            ctrl.setAttribute('data-computed', 'true');
        }

        if (field.lookupTrigger) {
            ctrl.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    
                    const ipv6 = e.target.value.trim();
                    
                    if (ipv6) {
                        try {
                            const response = await fetch(`${config.auto_config_api_url}?ipv6=${encodeURIComponent(ipv6)}`);
                            const apiInfo = await response.json();
                            
                            if (field.targetFields && Array.isArray(field.targetFields)) {
                                for (const targetId of field.targetFields) {
                                    const targetElement = document.getElementById(targetId);
                                    if (!targetElement) continue;
                                    
                                    const targetConfig = findFieldConfig(targetId);
                                    if (!targetConfig?.apiSource) continue;
                                    
                                    const value = CustomUtils.getNestedValue(apiInfo, targetConfig.apiSource);
                                    if (value !== null && value !== undefined && value !== '') {
                                        targetElement.value = value;
                                    }
                                }
                            }
                            
                            if (field.computeField) {
                                const computed = field.computeField.method === 'generateStaticPrefix'
                                    ? CustomUtils.generateStaticPrefixFromFullAddress({ ipv6: ipv6 })
                                    : null;
                                if (computed) {
                                    const targetField = document.getElementById(field.computeField.target);
                                    if (targetField) {
                                        targetField.value = computed;
                                    }
                                }
                            }

                            updateAutoConnectionInfo(apiInfo);
                            
                        } catch (err) {
                            console.error('Lookup failed:', err);
                        }
                    } else {
                        if (field.clearSection) {
                            clearSectionFields(field.clearSection.category, field.clearSection.section, [field.id]);
                        }
                        updateAutoConnectionInfo(null);
                    }
                    
                    updateVariableDefinitions();
                }
            });
        }
        
        if (field.id !== 'device-language') {
            ctrl.addEventListener('blur', () => updateAllPackageState('form-field'));
        }
    }
    
    group.appendChild(ctrl);

    if (field.description && !field.descriptionUrl) {
        const small = document.createElement('small');
        small.className = 'text-muted';
        small.textContent = field.description;
        group.appendChild(small);
    }

    row.appendChild(group);
    
    if (field.fullWidth) {
        row.style.gridColumn = '1 / -1';
    }
    
    return row;
}

function buildLinkOrSpan(item, textFallback) {
    if (item.link) {
        const a = document.createElement('a');
        a.href = item.link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'linked-title';
        if (item.class) {
            a.classList.add(item.class);
            a.textContent = item.class;
        } else {
            a.textContent = textFallback || '';
        }
        return a;
    } else {
        const span = document.createElement('span');
        if (item.class) {
            span.classList.add(item.class);
            span.textContent = item.class;
        } else {
            span.textContent = textFallback || '';
        }
        return span;
    }
}

function buildRequirementsDisplay(requirements) {
    if (!requirements) return null;
    
    const reqDiv = document.createElement('div');
    reqDiv.className = 'resource-requirements';
    
    const minMem = requirements.minMemoryMB || 0;
    const minFlash = requirements.minFlashMB || 0;
    const recMem = requirements.recommendedMemoryMB || 0;
    const recFlash = requirements.recommendedFlashMB || 0;
    
    reqDiv.innerHTML = `<span class="tr-tui-customscript-minimum"></span>: <span class="tr-tui-customscript-memory"></span> ${minMem}MB / <span class="tr-tui-customscript-storage"></span> ${minFlash}MB | <span class="tr-tui-customscript-recommended"></span>: <span class="tr-tui-customscript-memory"></span> ${recMem}MB / <span class="tr-tui-customscript-storage"></span> ${recFlash}MB`;
    
    return reqDiv;
}

function buildRadioGroup(item) {
    const row = document.createElement('div');
    row.className = 'form-row';

    const group = document.createElement('div');
    group.className = 'form-group';

    if (item.title || item.class) {
        const legend = document.createElement('div');
        legend.className = 'form-label';
        legend.appendChild(buildLinkOrSpan(item, item.title));
        
        if (item.description || item.descriptionUrl) {
            addTooltip(legend, item.descriptionUrl || item.description);
        }
        
        group.appendChild(legend);
    }

    const reqEl = buildRequirementsDisplay(item.requirements);
    if (reqEl) group.appendChild(reqEl);

    const radioWrap = document.createElement('div');
    radioWrap.className = 'radio-group';
    
    (item.options || []).forEach(opt => {
        const lbl = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = item.variable || item.id;
        radio.value = opt.value;
        
        if (opt.checked || (item.default && opt.value === item.default)) {
            radio.checked = true;
        }

        const textSpan = document.createElement('span');
        if (opt.class) {
            textSpan.classList.add(opt.class);
            textSpan.textContent = opt.class;
        } else {
            textSpan.textContent = opt.label || opt.value;
        }
        
        lbl.appendChild(radio);
        lbl.appendChild(textSpan);
        radioWrap.appendChild(lbl);
    });

    group.appendChild(radioWrap);
    row.appendChild(group);
    return row;
}

function buildSection(section) {
    const wrapper = document.createElement('div');
    wrapper.id = section.id;
    wrapper.className = 'conditional-section';
    
    if (section.showWhen) {
        wrapper.setAttribute('data-show-when', JSON.stringify(section.showWhen));
        wrapper.style.display = 'none';
    }

    if (section.title || section.class) {
        const label = document.createElement('label');
        label.className = 'form-label';
        
        if (section.link) {
            const a = document.createElement('a');
            a.href = section.link;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.className = 'linked-title';
            if (section.class) {
                a.classList.add(section.class);
                a.textContent = section.class;
            } else {
                a.textContent = section.title;
            }
            label.appendChild(a);
        } else {
            const span = document.createElement('span');
            if (section.class) {
                span.classList.add(section.class);
                span.textContent = section.class;
            } else {
                span.textContent = section.title;
            }
            label.appendChild(span);
        }
        
        if (section.description || section.descriptionUrl) {
            addTooltip(label, section.descriptionUrl || section.description);
        }
        
        wrapper.appendChild(label);
    }

    const columns = state.config.setup.columns || 1;
    
    const itemsContainer = CustomUtils.createGridContainer(columns);

    const items = section.items || [];
    const itemCount = items.length;

    items.forEach(item => {
        const element = buildItem(item);
        if (element) {
            if (item.type === 'info-display' || (item.id && item.id.includes('info'))) {
                element.style.gridColumn = '1 / -1';
            }
            else if (itemCount === 1 || item.type === 'radio-group') {
                element.style.gridColumn = '1 / -1';
            }
            itemsContainer.appendChild(element);
        }
    });

    wrapper.appendChild(itemsContainer);
    return wrapper;
}

function buildInfoDisplay(item) {
    const div = document.createElement('div');
    div.id = item.id;
    div.className = item.linkOnly === "true" ? 'info-link' : 'info-display';
    
    if (item.showWhen) {
        div.setAttribute('data-show-when', JSON.stringify(item.showWhen));
        div.style.display = 'none';
    }
    
    if (item.centered === "true") {
        div.style.textAlign = 'center';
    }
    
    if (item.description) {
        const isUrlTemplate = item.description.includes('{');
        
        if (isUrlTemplate) {
            const linkEl = document.createElement('a');
            linkEl.className = 'linked-title';
            linkEl.target = '_blank';
            linkEl.setAttribute('data-url-template', item.description);
            linkEl.textContent = item.description;
            div.appendChild(linkEl);
        } else {
            const span = document.createElement('span');
            if (item.class) {
                span.classList.add(item.class);
                span.textContent = item.class;
            } else {
                span.textContent = item.description;
            }
            div.appendChild(span);
        }
    } else {
        const el = buildLinkOrSpan(item, item.content || '');
        div.appendChild(el);
    }
    
    const reqEl = buildRequirementsDisplay(item.requirements);
    if (reqEl) div.appendChild(reqEl);
    
    return div;
}

function computeFieldValue(targetVariable) {
    const fieldConfig = findFieldByVariable(targetVariable);
    if (!fieldConfig) {
        console.error(`computeFieldValue: Field not found for variable: ${targetVariable}`);
        return;
    }
    
    if (!fieldConfig.computed) {
        console.error(`computeFieldValue: No computed config for: ${targetVariable}`);
        return;
    }
    
    const targetField = document.getElementById(fieldConfig.id);
    if (!targetField) {
        console.error(`computeFieldValue: Target element not found: ${fieldConfig.id}`);
        return;
    }

    console.log(`Computing value for: ${targetVariable} (id: ${fieldConfig.id})`);

    const values = {};
    fieldConfig.computed.from.forEach(variableName => {
        const field = findFieldByVariable(variableName);
        if (!field) {
            console.error(`Source field config not found for variable: ${variableName}`);
            return;
        }
        
        const el = document.getElementById(field.id);
        if (!el) {
            console.error(`Source field element not found: ${field.id}`);
            return;
        }
        
        values[variableName] = el.value;
        console.log(`  ${variableName} = ${el.value}`);
    });

    const mapName = fieldConfig.computed.map;
    const map = state.config.constants[mapName];
    
    if (!map) {
        console.error(`Map not found: ${mapName}`);
        return;
    }

    const value1 = values[fieldConfig.computed.from[0]];
    const value2 = values[fieldConfig.computed.from[1]];
    
    console.log(`  map[${value1}][${value2}]`);
    
    targetField.value = map[value1]?.[value2] || map[value1] || '';
    console.log(`  → ${targetField.value}`);
    if (state.ui.initialized) {
        updateVariableDefinitions();
    }
}

function findFieldByVariable(variableName, context = {}) {
    if (!state.config.setup) return null;

    const candidates = [];
    
    const search = (items, parentShowWhen = null) => {
        if (!items || !Array.isArray(items)) return;
        for (const item of items) {
            if (item.variable === variableName) {
                candidates.push({ field: item, parentShowWhen });
            }
            if (item.items) {
                const newParentShowWhen = item.type === 'section' && item.showWhen ? item.showWhen : parentShowWhen;
                search(item.items, newParentShowWhen);
            }
        }
    };

    for (const category of state.config.setup.categories) {
        search(category.items);
    }
    
    for (const candidate of candidates) {
        if (candidate.parentShowWhen) {
            let matches = true;
            for (const [key, expectedValue] of Object.entries(candidate.parentShowWhen)) {
                let actualValue = context[key];  // ← まずcontextから
                if (!actualValue) {
                    actualValue = getFieldValue(`input[name="${key}"]:checked`) || 
                                 getFieldValue(`select[name="${key}"]`) ||
                                 getFieldValue(`[name="${key}"]`);
                }
                if (Array.isArray(expectedValue)) {
                    if (!expectedValue.includes(actualValue)) matches = false;
                } else {
                    if (actualValue !== expectedValue) matches = false;
                }
            }
            if (!matches) continue;
        }
        
        if (!candidate.field.showWhen) return candidate.field;
        
        let matches = true;
        for (const [key, expectedValue] of Object.entries(candidate.field.showWhen)) {
            let actualValue = context[key];
            if (!actualValue) {
                actualValue = getFieldValue(`input[name="${key}"]:checked`) || 
                             getFieldValue(`select[name="${key}"]`) ||
                             getFieldValue(`[name="${key}"]`);
            }
            if (Array.isArray(expectedValue)) {
                if (!expectedValue.includes(actualValue)) matches = false;
            } else {
                if (actualValue !== expectedValue) matches = false;
            }
        }
        
        if (matches) return candidate.field;
    }
    
    return null;
}

function findFieldConfig(fieldId) {
    for (const category of state.config.setup.categories) {
        for (const item of category.items) {
            if (item.id === fieldId) return item;
            if (item.type === 'section' && item.items) {
                for (const subItem of item.items) {
                    if (subItem.id === fieldId) return subItem;
                }
            }
        }
    }
    return null;
}

// ==================== イベント処理（汎用化） ====================
function setupEventListeners() {
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', handleRadioChange);
    });

    document.querySelectorAll('#dynamic-config-sections input[type="text"], #dynamic-config-sections input[type="number"], #dynamic-config-sections select').forEach(field => {
        field.addEventListener('input', () => {
            if (current_language_json) {
                applyCustomTranslations(current_language_json);
            }
        });
    });

    requestAnimationFrame(() => {
        evaluateAllShowWhen();
    });
}

function evaluateShowWhen(condition) {
    if (!condition || typeof condition !== 'object') return true;
    
    for (const [variableName, expectedValue] of Object.entries(condition)) {
        let actualValue = null;
        
        const radioElement = document.querySelector(`input[name="${variableName}"]:checked`);
        if (radioElement) {
            actualValue = radioElement.value;
        } else {
            const fieldConfig = findFieldByVariable(variableName);
            if (fieldConfig && fieldConfig.id) {
                actualValue = getFieldValue(`#${fieldConfig.id}`);
            }
        }
        
        if (actualValue === null) return false;
        
        if (Array.isArray(expectedValue)) {
            if (!expectedValue.includes(actualValue)) return false;
        } else {
            if (actualValue !== expectedValue) return false;
        }
    }
    
    return true;
}

function evaluateInitialPackages() {
    if (!state.config.setup) return;
    
    console.log('=== evaluateInitialPackages START ===');
    console.log('API Info available:', !!state.apiInfo);
    if (state.apiInfo) {
        console.log('API detected connection type:', getConnectionTypeFromApi(state.apiInfo));
    }
    
    for (const category of state.config.setup.categories) {
        if (!category.packages || category.packages.length === 0) continue;
        
        console.log(`Evaluating packages for category: ${category.id}`);
        
        const formValues = {};
        
        const collectFormValues = (items) => {
            if (!items) return;
            items.forEach(item => {
                if (item.type === 'radio-group' && item.variable) {
                    const checkedRadio = document.querySelector(`input[name="${item.variable}"]:checked`);
                    if (checkedRadio) {
                        formValues[item.variable] = checkedRadio.value;
                        console.log(`  Radio value: ${item.variable} = ${checkedRadio.value}`);
                    }
                } else if (item.type === 'field' && item.fieldType === 'select' && item.variable) {
                    const select = document.getElementById(item.id);
                    if (select) {
                        formValues[item.variable] = select.value;
                        console.log(`  Select value: ${item.variable} = ${select.value}`);
                    }
                } else if (item.type === 'section' && item.items) {
                    collectFormValues(item.items);
                }
            });
        };
        
        collectFormValues(category.items);
        
        let effectiveConnectionType = formValues.connection_type;
        if (effectiveConnectionType === 'auto' && state.apiInfo) {
            effectiveConnectionType = getConnectionTypeFromApi(state.apiInfo);
            console.log(`  AUTO mode: Using effective type = ${effectiveConnectionType}`);
        }
        
        category.packages.forEach(pkg => {
            if (!pkg.when) return;
            
            const shouldEnable = Object.entries(pkg.when).every(([key, value]) => {
                let actualValue = formValues[key];
                
                if (key === 'connection_type' && formValues.connection_type === 'auto') {
                    actualValue = effectiveConnectionType;
                }
                
                if (!actualValue) return false;
                
                let result;
                if (Array.isArray(value)) {
                    result = value.includes(actualValue);
                } else {
                    result = value === actualValue;
                }
                
                console.log(`    Package ${pkg.id}: ${key}=${actualValue} matches ${JSON.stringify(value)}? ${result}`);
                return result;
            });
            
            if (shouldEnable) {
                console.log(`  ✓ Enabling package: ${pkg.id}`);
                toggleVirtualPackage(pkg.uniqueId || pkg.id, true);
            } else {
                console.log(`  ✗ Disabling package: ${pkg.id}`);
                toggleVirtualPackage(pkg.uniqueId || pkg.id, false);
            }
        });
    }
    
    console.log('=== evaluateInitialPackages END ===');
    
}

function getConnectionTypeFromApi(apiInfo) {
    if (!apiInfo) return state.autoConfig?.connectionDetection?.default || 'DHCP/PPPoE';
    
    const detection = state.autoConfig?.connectionDetection;
    if (!detection) {
        console.warn('connectionDetection config not loaded');
        return 'DHCP/PPPoE';
    }
    
    const resolveCheckField = (varName) => {
        for (const category in state.autoConfig.apiFields) {
            const field = state.autoConfig.apiFields[category].find(f => f.varName === varName);
            if (field) return field.jsonPath;
        }
        return null;
    };
    
    for (const [typeName, typeConfig] of Object.entries(detection)) {
        if (typeName === 'default') continue;
        
        const checkPath = resolveCheckField(typeConfig.checkField);
        if (!checkPath) continue;
        
        const value = CustomUtils.getNestedValue(apiInfo, checkPath);
        if (value !== null && value !== undefined && value !== '') {
            return typeConfig.returnValue;
        }
    }
    
    return detection.default;
}

function handleRadioChange(e) {
    const name = e.target.name;
    const value = e.target.value;
    
    console.log(`Radio changed: ${name} = ${value}`);
    
    evaluateAllShowWhen();
    
    applyRadioDependencies(name, value);
    
    if (name === 'connection_type' && value === 'auto') {
        console.log('Connection type changed to AUTO, fetching API info');
        fetchAndDisplayIspInfo();
        
        if (state.apiInfo) {
            requestAnimationFrame(() => {
                const basicInfoFieldIds = ['aios-country', 'aios-timezone', 'aios-zonename'];
                applyIspAutoConfig(state.apiInfo, { skipIds: basicInfoFieldIds });
                updateVariableDefinitions();
            });
        }
    }
    
    if (name === 'connection_type' && value === 'mape' && state.apiInfo) {
        console.log('Connection type changed to MAP-E, applying API info');
        requestAnimationFrame(() => {
            const basicInfoFieldIds = ['aios-country', 'aios-timezone', 'aios-zonename'];
            applyIspAutoConfig(state.apiInfo, { skipIds: basicInfoFieldIds });
            updateVariableDefinitions();
        });
    }
    
    updatePackagesForRadioGroup(name, value);
    
    updateAllPackageState(`radio-${name}`);
    
    if (current_language_json) {
        requestAnimationFrame(() => {
            applyCustomTranslations(current_language_json);
        });
    }
}

function applyRadioDependencies(radioName, selectedValue) {
    if (!state.config.setup) return;
    
    for (const category of state.config.setup.categories) {
        for (const item of category.items) {
            if (item.type === 'radio-group' && item.variable === radioName && item.dependencies) {
                const deps = item.dependencies[selectedValue];
                if (deps && typeof deps === 'object') {
                    for (const [depVar, depValue] of Object.entries(deps)) {
                        console.log(`Applying dependency: ${depVar} = ${depValue}`);
                        
                        const depRadio = document.querySelector(`input[name="${depVar}"][value="${depValue}"]`);
                        if (depRadio) {
                            depRadio.checked = true;
                            console.log(`Dependency radio set: ${depVar} = ${depValue}`);
                        }
                    }
                }
                return;
            }
        }
    }
}

function evaluateAllShowWhen() {
    document.querySelectorAll('[data-show-when]').forEach(element => {
        try {
            const condition = JSON.parse(element.getAttribute('data-show-when'));
            const shouldShow = evaluateShowWhen(condition);
            element.style.display = shouldShow ? '' : 'none';
        } catch (err) {
            console.error('Error evaluating showWhen:', err);
        }
    });
}

function updatePackagesForRadioGroup(variableName) {
    if (!state.config.setup || !variableName) return;
    
    console.log(`=== updatePackagesForRadioGroup(${variableName}) START ===`);
    
    for (const category of state.config.setup.categories) {
        if (!category.packages || category.packages.length === 0) continue;
        
        const hasRelatedPackage = category.packages.some(pkg => 
            pkg.when && Object.keys(pkg.when).includes(variableName)
        );
        
        if (!hasRelatedPackage) continue;
        
        const formValues = {};
        
        const collectFormValues = (items) => {
            if (!items) return;
            items.forEach(item => {
                if (item.type === 'radio-group' && item.variable) {
                    const checkedRadio = document.querySelector(`input[name="${item.variable}"]:checked`);
                    if (checkedRadio) {
                        formValues[item.variable] = checkedRadio.value;
                        console.log(`  Radio value: ${item.variable} = ${checkedRadio.value}`);
                    }
                } else if (item.type === 'field' && item.fieldType === 'select' && item.variable) {
                    const select = document.getElementById(item.id);
                    if (select) {
                        formValues[item.variable] = select.value;
                        console.log(`  Select value: ${item.variable} = ${select.value}`);
                    }
                } else if (item.type === 'section' && item.items) {
                    collectFormValues(item.items);
                }
            });
        };
        
        state.config.setup.categories.forEach(cat => {
            collectFormValues(cat.items);
        });
        
        let effectiveConnectionType = formValues.connection_type;
        if (effectiveConnectionType === 'auto' && state.apiInfo) {
            effectiveConnectionType = getConnectionTypeFromApi(state.apiInfo);
            console.log(`  AUTO mode: Using effective type = ${effectiveConnectionType}`);
        }
        
        const packageConditions = new Map();
        category.packages.forEach(pkg => {
            const pkgId = pkg.uniqueId || pkg.id;
            if (!packageConditions.has(pkgId)) {
                packageConditions.set(pkgId, []);
            }
            packageConditions.get(pkgId).push(pkg.when);
        });
        
        packageConditions.forEach((conditions, pkgId) => {
            const shouldEnable = conditions.some(when => {
                if (!when) return false;
                
                return Object.entries(when).every(([key, value]) => {
                    let actualValue = formValues[key];
                    
                    if (key === 'connection_type' && formValues.connection_type === 'auto') {
                        actualValue = effectiveConnectionType;
                    }
                    
                    if (!actualValue) return false;
                    
                    let result;
                    if (Array.isArray(value)) {
                        result = value.includes(actualValue);
                    } else {
                        result = value === actualValue;
                    }
                    
                    console.log(`    Package ${pkgId}: ${key}=${actualValue} matches ${JSON.stringify(value)}? ${result}`);
                    return result;
                });
            });
            
            if (shouldEnable) {
                console.log(`  ✓ Enabling package: ${pkgId}`);
                toggleVirtualPackage(pkgId, true);
            } else {
                console.log(`  ✗ Disabling package: ${pkgId}`);
                toggleVirtualPackage(pkgId, false);
            }
        });
    }
    
    console.log(`=== updatePackagesForRadioGroup(${variableName}) END ===`);
}

function toggleVirtualPackage(packageId, enabled) {
    const pkg = findPackageById(packageId);
    if (!pkg) {
        console.warn(`Virtual package not found: ${packageId}`);
        return;
    }

    const checkbox = document.querySelector(`[data-package="${packageId}"]`) ||
                    document.querySelector(`[data-unique-id="${pkg.uniqueId || packageId}"]`);
    
    if (!checkbox) {
        console.warn(`Checkbox not found for: ${packageId}`);
        return;
    }

    if (checkbox.checked !== enabled) {
        checkbox.checked = enabled;
        console.log(`Virtual package ${packageId}: ${enabled ? 'enabled' : 'disabled'}`);
    }
}

function getFieldValue(selector) {
    const element = document.querySelector(selector);
    if (!element) return null;
    
    if (element.type === 'radio') {
        const checked = document.querySelector(`input[name="${element.name}"]:checked`);
        return checked ? checked.value : null;
    } else if (element.type === 'checkbox') {
        return element.checked ? (element.value || 'on') : null;
    }
    
    return element.value || null;
}

function extractLuciName(pkg) {
    if (pkg === 'luci') return 'base';

    const patterns = state.config.setup?.constants?.language_module_patterns || [
        'luci-app-', 'luci-proto-', 'luci-mod-'
    ];
    
    for (const pattern of patterns) {
        if (pkg.startsWith(pattern)) {
            return pkg.substring(pattern.length);
        }
    }
    
    if (pkg.startsWith('luci-theme-')) {
        return null;
    }
    
    return null;
}

// ==================== 統合パッケージ管理 ====================
async function updateAllPackageState(source = 'unknown') {
    if (!state.ui.initialized && state.packages.default.length === 0 && state.packages.device.length === 0) {
        console.log('updateAllPackageState: Device packages not ready, deferring update from:', source);
        document.addEventListener('devicePackagesReady', () => {
            console.log('Re-running updateAllPackageState after device packages ready');
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

    const elements = {
        textarea: document.querySelector('#asu-packages'),
        sizeBreakdown: document.querySelector('#package-size-breakdown')
    };

    await updateLanguagePackageCore();
    updatePackageListToTextarea(source, elements);
    updateVariableDefinitions();

    console.log('All package state updated successfully');
}

async function updateLanguagePackageCore() {
    state.ui.language.selected = config.device_language || config.fallback_language || 'en';
    const lang = state.ui.language.selected;
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
    const prefixes = state.config.setup?.constants?.language_prefixes || [];
    console.log('Using language prefixes:', prefixes);
    for (const prefix of prefixes) {
        const name = `${prefix}${lang}`;
        try {
            if (await isPackageAvailable(name, 'luci')) {
                state.packages.dynamic.add(name);
                addedLangPackages.add(name);
                console.log('Added language package from prefix:', name);
            }
        } catch (err) {
            console.error('Error checking language package:', name, err);
        }
    }
    const checkPromises = [];
    for (const pkg of currentPackages) {
        let moduleName = null;
        if (pkg.startsWith('luci-') && !pkg.startsWith('luci-i18n-')) {
            moduleName = extractLuciName(pkg);
        }
        if (!moduleName) continue;
        const langPkg = `luci-i18n-${moduleName}-${lang}`;
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
        
        if (determinePackageManager(state.device.version) === 'apk') {
            const deviceInfo = {
                version: state.device.version,
                arch: state.device.arch,
                vendor: state.device.vendor,
                subtarget: state.device.subtarget,
                isSnapshot: (state.device.version || '').includes('SNAPSHOT')
            };
            
            const prefix = `${deviceInfo.version}:${deviceInfo.arch}:luci:`;
            const langPkgs = [];
            for (const pkg of addedLangPackages) {
                const ver = state.cache.packageVersions.get(prefix + pkg);
                if (ver) {
                    langPkgs.push({ name: pkg, feed: 'luci', version: ver });
                }
            }
            
            if (langPkgs.length > 0) {
                console.log(`Fetching sizes for ${langPkgs.length} language packages`);
                await fetchApkPackageSizes(langPkgs, deviceInfo);
            }
        }
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
        state.packages.extra,
    ]);

    const checkedPackages = new Set();
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        if (!pkgName) return;

        const pkgInfo = findPackageById(pkgName);
        if (pkgInfo && pkgInfo.virtual) {
            console.log(`Skipping virtual package: ${pkgName}`);
            return;
        }

        if (cb.disabled) {
            console.log(`Skipping disabled package: ${pkgName}`);
            return;
        }
        
        const packageElement = cb.closest('.package-item') || cb.closest('label');
        if (packageElement && packageElement.style.display === 'none') {
            console.log(`Skipping unavailable package: ${pkgName}`);
            return;
        }
    
        checkedPackages.add(pkgName);
    });

    const searchedPackages = new Set(
        state.ui.managers.packageSearch ? normalizePackages(state.ui.managers.packageSearch.getAllValues()) : []
    );

    const knownSelectablePackages = new Set();
    state.packages.json?.categories?.forEach(cat => {
        cat.packages?.forEach(pkg => {
            if (pkg.id) knownSelectablePackages.add(pkg.id);
        });
    });

    const manualPackages = new Set();
    const textarea = state.dom.textarea || document.querySelector('#asu-packages');

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
    if (currentHash === state.cache.lastPackageListHash && source !== 'force-update' && source !== 'package-verification-complete' && source !== 'version-changed') {
        console.log('updatePackageListToTextarea: No changes detected');
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
        textarea.value = uniquePackages.join(' ');
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }
    console.log(`Package list updated: ${uniquePackages.length} packages`);
}

function isManualPackage(pkg, confirmedSet, knownSelectablePackages, currentUISelections) {
    if (confirmedSet.has(pkg)) return false;
    if (pkg.startsWith('luci-i18n-')) return false;
    if (knownSelectablePackages.has(pkg)) return false;
    
    const isCheckboxManaged = document.querySelector(`.package-selector-checkbox[data-package="${pkg}"]`) !== null;
    if (isCheckboxManaged) return false;
    
    if (state.cache.prevUISelections.has(pkg) && !currentUISelections.has(pkg)) return false;
    
    return true;
}

// ==================== フォーム値収集 ====================

function shouldIncludeVariable(value) {
    return value !== 'disabled' && value !== null && value !== undefined && value !== '';
}

function collectExclusiveVars(varsToCollect, values, context = {}) {
    if (!varsToCollect || !Array.isArray(varsToCollect)) return;
    
    for (const varName of varsToCollect) {
        const fieldConfig = findFieldByVariable(varName, context);
        if (!fieldConfig) continue;
        
        let value;
        
        const fieldElement = document.getElementById(fieldConfig.id);
        
        if (fieldElement && fieldElement.offsetParent !== null) {
            value = fieldElement.value;
        } else {
            if (fieldConfig.apiSource && state.apiInfo) {
                value = CustomUtils.getNestedValue(state.apiInfo, fieldConfig.apiSource);
            }
        }
        
        if (shouldIncludeVariable(value)) {
            values[varName] = value;
        }
    }
}

function collectItemValue(item, values) {
    if (!item) return;
    
    if (item.type === 'radio-group' && item.variable) {
        const selectedValue = getFieldValue(`input[name="${item.variable}"]:checked`);
        
        if (!shouldIncludeVariable(selectedValue)) return;
        
        if (!item.ui_variable) {
            values[item.variable] = selectedValue;
        }
        
        if (selectedValue === 'disabled') return;
        
        const varsToCollect = item.exclusiveVars?.[selectedValue] || [];
        
        let effectiveValue = selectedValue;
        if (item.variable === 'connection_type' && selectedValue === 'auto' && state.apiInfo) {
            effectiveValue = getConnectionTypeFromApi(state.apiInfo);
            console.log(`AUTO mode in collectItemValue: Using effective type = ${effectiveValue}`);
        }
        
        collectExclusiveVars(varsToCollect, values, {[item.variable]: effectiveValue});
        
        return;
    }
    
    if (item.type === 'field' && item.variable) {
        if (item.showWhen && !evaluateShowWhen(item.showWhen)) {
            return;
        }
        
        if (item.variable === 'dslite_aftr_type' || item.variable === 'dslite_jurisdiction') {
            return;
        }
        
        const value = getFieldValue(`#${item.id}`);
        
        if (!shouldIncludeVariable(value)) return;
        
        const fallbackLang = config.fallback_language || 'en';
        if (item.variable === 'language' && value === fallbackLang) {
            return;
        }
        
        values[item.variable] = value;
        return;
    }
    
    if (item.type === 'section' && item.items) {
        if (item.showWhen && !evaluateShowWhen(item.showWhen)) {
            return;
        }
        
        for (const subItem of item.items) {
            if (subItem.showWhen && !evaluateShowWhen(subItem.showWhen)) {
                continue;
            }
            collectItemValue(subItem, values);
        }
    }
}

function collectCategoryValues(categoryId, values) {
    const category = state.config.setup?.categories?.find(cat => cat.id === categoryId);
    if (!category) return;
    
    for (const item of category.items) {
        collectItemValue(item, values);
    }
}

function collectFormValues() {
    const values = {};
    if (!state.config.setup || !state.config.setup.categories) {
        return values;
    }
    
    for (const category of state.config.setup.categories) {
        collectCategoryValues(category.id, values);
    }
    collectPackageEnableVars(values);
    
    if (values.connection_type === 'auto') { 
        delete values.connection_type;
        
        if (state.apiInfo?.mape?.brIpv6Address) {
            values.connection_auto = 'mape';
        } else if (state.apiInfo?.aftr?.aftrAddress) {
            values.connection_auto = 'dslite';
        } else {
            values.connection_auto = 'dhcp';
        }
    } else {
        delete values.connection_auto;
    }
    
    const dnsAdblock = getFieldValue('input[name="dns_adblock"]:checked');
    if (dnsAdblock === 'adguardhome' || dnsAdblock === 'adblock_fast') {
        const deviceLang = getFieldValue('#device-language') || config.device_language;
        
        let filterLanguageMap = null;
        for (const category of state.config.setup.categories) {
            for (const item of category.items) {
                if (item.type === 'radio-group' && item.variable === 'dns_adblock' && item.filterLanguageMap) {
                    filterLanguageMap = item.filterLanguageMap;
                    break;
                }
            }
            if (filterLanguageMap) break;
        }
        
        if (filterLanguageMap) {
            values.filter_url = filterLanguageMap[deviceLang] || filterLanguageMap['en'] || '';
            console.log(`Filter URL resolved: ${deviceLang} -> ${values.filter_url}`);
        }
    }
    
    if (dnsAdblock === 'adguardhome') {
        for (const category of state.config.setup.categories) {
            for (const item of category.items) {
                if (item.type === 'section' && item.id === 'adguardhome-section') {
                    for (const subItem of item.items) {
                        if (subItem.id === 'adguardhome-requirements' && subItem.requirements) {
                            values.agh_min_memory = subItem.requirements.minMemoryMB;
                            values.agh_min_flash = subItem.requirements.minFlashMB;
                            break;
                        }
                    }
                }
            }
        }
    }
    
    if (dnsAdblock === 'adguardhome') {
        let aghVariables = null;
        for (const category of state.config.setup.categories) {
            for (const item of category.items) {
                if (item.type === 'radio-group' && item.variable === 'dns_adblock' && item.variables) {
                    aghVariables = item.variables;
                    break;
                }
            }
            if (aghVariables) break;
        }
        
        if (aghVariables) {
            const packageManager = state.packageManager?.activeManager || 'opkg';
            
            if (packageManager === 'apk') {
                values.agh_yaml = aghVariables.agh_yaml;
                values.agh_dir = aghVariables.agh_dir;
            } else {
                values.agh_yaml = aghVariables.agh_yaml_old;
                values.agh_dir = ':';
            }
            
            console.log(`AdGuard Home YAML path resolved: ${packageManager} -> ${values.agh_yaml}`);
        }
    }
    
    if (state.importedVariables && typeof state.importedVariables === 'object') {
        Object.assign(values, state.importedVariables);
    }
    
    return values;
}

function getActualConnectionType() {
    if (state.apiInfo?.mape?.brIpv6Address) return 'mape';
    if (state.apiInfo?.aftr?.aftrIpv6Address) return 'dslite';
    return null;
}

function collectPackageEnableVars(values) {
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {

        const enableVar = cb.getAttribute('data-enable-var');
        if (!enableVar) return;

        const uniqueId = cb.getAttribute('data-unique-id');
        const pkgId    = cb.getAttribute('data-package');

        const effectiveId = uniqueId || pkgId;

        const pkgInfo = findPackageById(pkgId);
        if (pkgInfo && (pkgInfo.hidden || pkgInfo.virtual)) {
            return;
        }

        if (cb.dataset.auto === "true") {
            return;
        }

        values[enableVar] = '1';
    });
}

// ==================== UCI-defaults処理 ====================
function updateVariableDefinitions() {
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    if (!textarea) return;
    
    const values = collectFormValues();
    
    if (values.lan_ip_address && !values.lan_ip_address.includes('/')) {
        values.lan_ip_address += '/24';
    }

    if (values.lan_ipv6_address && !values.lan_ipv6_address.includes('/')) {
        values.lan_ipv6_address += '/64';
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
    const deferred = [];
    
    Object.entries(values).forEach(([key, value]) => {
        if (value === '' || value === null || value === undefined) {
            return;
        }
        const escapedValue = value.toString().replace(/'/g, "'\"'\"'");
        const line = `${key}='${escapedValue}'`;
        
        (key === 'peeraddr' ? deferred : lines).push(line);
    });
    
    return [...lines, ...deferred].join('\n');
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
        
        updateUciDefaultsFileSize(textarea.value);
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
        
        updateUciDefaultsFileSize(textarea.value);
    }
}

function updateUciDefaultsFileSize(text) {
    const lines = text.replace(/\n$/, '').split('\n').length;
    const bytes = new Blob([text]).size;
    const kb = (bytes / 1024).toFixed(2);
    
    const sizeElement = document.querySelector('#uci-defaults-size');
    if (sizeElement) {
        sizeElement.textContent = `setup.sh = ${lines} lines - ${bytes} bytes: ${kb} KB`;
        
        if (bytes > 20480) {
            sizeElement.style.color = '#ff0000';
        } else {
            sizeElement.style.color = '';
        }
    }
    
    return lines;
}

function loadUciDefaultsTemplate() {
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    const templatePath = config.setup_template_path;
    
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
        });
}

// ==================== auto-config.json ロード ====================

async function loadAutoConfig() {
    try {
        const url = config.auto_config_json_path || 'auto-config/auto-config.json';
        const response = await fetch(url + '?t=' + Date.now());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        state.autoConfig = await response.json();
        console.log('Auto-config loaded:', state.autoConfig);
        return state.autoConfig;
    } catch (err) {
        console.error('Failed to load auto-config.json:', err);
        return null;
    }
}

// ==================== APIレスポンスパース ====================

function parseApiValues(apiResponse) {
    if (!state.autoConfig?.apiFields || !apiResponse) return {};
    
    const values = {};
    Object.keys(state.autoConfig.apiFields).forEach(category => {
        (state.autoConfig.apiFields[category] || []).forEach(field => {
            values[field.varName] = CustomUtils.getNestedValue(apiResponse, field.jsonPath);
        });
    });
    
    state.apiValues = values;
    console.log('API values parsed:', state.apiValues);
    return values;
}

// ==================== 接続タイプ判定 ====================

function getConnectionType(apiInfo) {
    const detection = state.autoConfig?.connectionDetection;
    if (!detection) {
        console.warn('autoConfig not loaded');
        return 'DHCP/PPPoE';
    }
    
    if (state.apiValues[detection.mape.checkField]) return detection.mape.returnValue;
    if (state.apiValues[detection.dslite.checkField]) return detection.dslite.returnValue;
    
    return detection.default;
}

// ==================== ISP情報取得・表示 ====================

async function fetchAndDisplayIspInfo(forceRefresh = false) {
    if (!config?.auto_config_api_url) {
        console.log('Auto config API URL not configured');
        return;
    }
    
    try {
        if (!state.autoConfig) {
            await loadAutoConfig();
        }
        
        const options = forceRefresh ? { cache: 'no-store' } : {};
        const response = await fetch(config.auto_config_api_url, options);
        const apiInfo = await response.json();
        state.apiInfo = apiInfo;
        
        console.log('ISP info fetched:', apiInfo);
        
        parseApiValues(apiInfo);
        
        displayIspInfo(apiInfo);
        updateAutoConnectionInfo(apiInfo);
        CustomUtils.setStaticPrefixIfAvailable();
        
        const connectionType = getFieldValue('input[name="connection_type"]:checked');
        if (connectionType === 'auto') {
            console.log('AUTO mode active, applying API values to fields');
            requestAnimationFrame(() => {
                const basicInfoFieldIds = ['aios-country', 'aios-timezone', 'aios-zonename'];
                applyIspAutoConfig(apiInfo, { skipIds: basicInfoFieldIds });
                updateVariableDefinitions();
            });
        }
    } catch (err) {
        console.error('Failed to fetch ISP info:', err);
    }
}

// ==================== ISP情報表示 ====================

function displayIspInfo(apiInfo) {
    if (!apiInfo) return;
    
    parseApiValues(apiInfo);
    
    const displayConfig = state.autoConfig?.display?.extendedInfo;
    if (!displayConfig?.fields) {
        console.warn('extendedInfo fields not found');
        return;
    }
    
    displayConfig.fields.forEach(field => {
        let value = "Unknown";
        
        if (field.computed) {
            if (field.computed === "getConnectionType") {
                value = getConnectionType(apiInfo);
            }
        } else if (field.varNames) {
            const values = field.varNames
                .map(varName => state.apiValues[varName])
                .filter(Boolean);
            value = values.length > 0 ? values.join(field.separator || ", ") : "Unknown";
        } else if (field.varName) {
            value = state.apiValues[field.varName] || "Unknown";
        }
        
        UI.updateElement(field.id, { text: value });
    });
    
    const extendedInfo = document.getElementById(state.autoConfig?.display?.extendedInfo?.id);
    if (extendedInfo) {
        extendedInfo.classList.remove('hide');
        extendedInfo.style.display = '';
        console.log('Extended build info shown');
    }
}

// ==================== 接続情報表示 ====================

function updateAutoConnectionInfo(apiInfo) {
    const autoInfo = document.querySelector('#auto-info');
    if (!autoInfo) return;
    
    autoInfo.innerHTML = '';
    
    const connectionType = getConnectionType(apiInfo);
    
    if (state.apiValues.IPV6 === null) {
        const warningSpan = document.createElement('span');
        warningSpan.className = 'tr-ipv6-warning-auto';
        autoInfo.appendChild(warningSpan);
        autoInfo.appendChild(document.createElement('br'));
        autoInfo.appendChild(document.createElement('br'));
    }
    
    if (state.apiValues?.ISP) {
        autoInfo.appendChild(document.createTextNode(`ISP: ${state.apiValues.ISP}`));
        autoInfo.appendChild(document.createElement('br'));
        if (state.apiValues.AS) {
            autoInfo.appendChild(document.createTextNode(`AS: ${state.apiValues.AS}`));
            autoInfo.appendChild(document.createElement('br'));
        }
    }
    
    if (!state.autoConfig?.display) {
        console.warn('autoConfig.display not loaded');
        return;
    }
    
    const detection = state.autoConfig.connectionDetection;
    let targetDisplay = null;
    if (connectionType === detection.mape.returnValue) {
        targetDisplay = state.autoConfig.display.mapeInfo;
    } else if (connectionType === detection.dslite.returnValue) {
        targetDisplay = state.autoConfig.display.dsliteInfo;
    }
    
    if (targetDisplay) {
        renderConnectionInfo(autoInfo, targetDisplay);
    } else {
        const span = document.createElement('span');
        span.className = 'tr-standard-notice';
        autoInfo.appendChild(span);
    }
    
    applyCustomTranslations(current_language_json);
}

// ==================== 接続情報レンダリング ====================

function renderConnectionInfo(container, displayConfig) {
    if (!displayConfig) return;
    
    container.appendChild(document.createElement('hr'));
    
    if (displayConfig.notice) {
        const notice = document.createElement('p');
        const noticeSpan = document.createElement('span');
        noticeSpan.className = displayConfig.notice.class || '';
        noticeSpan.textContent = current_language_json?.[displayConfig.notice.class] || displayConfig.notice.default || '';
        notice.appendChild(noticeSpan);
        container.appendChild(notice);
    }
    
    if (displayConfig.fields) {
        displayConfig.fields.forEach(field => {
            let value = state.apiValues?.[field.varName];
            
            if (field.condition === 'computeStaticPrefix') {
                if (!value) {
                    value = CustomUtils.generateStaticPrefixFromFullAddress(state.apiInfo);
                    if (!value) {
                        const staticField = document.querySelector('#mape-static-prefix');
                        if (staticField && staticField.value) value = staticField.value;
                    }
                    if (value) state.apiValues[field.varName] = value;
                }
                if (!value) return;
            } else if (field.condition === 'hasValue') {
                if (!value) return;
            }
            
            if (value !== null && value !== undefined && value !== '') {
                container.appendChild(document.createTextNode(`${field.label} ${value}`));
                container.appendChild(document.createElement('br'));
            }
        });
    }
    
    if (displayConfig.footer?.text) {
        container.appendChild(document.createElement('br'));
        container.appendChild(document.createTextNode(displayConfig.footer.text));
        container.appendChild(document.createElement('br'));
    }
    
    if (displayConfig.link) {
        container.appendChild(document.createElement('hr'));
        
        const linkDiv = document.createElement('div');
        linkDiv.style.textAlign = 'center';
        
        const link = document.createElement('a');
        link.href = displayConfig.link.url;
        link.target = '_blank';
        link.className = 'linked-title';
        link.textContent = displayConfig.link.text;
        
        linkDiv.appendChild(link);
        container.appendChild(linkDiv);
    }
}

function applyIspAutoConfig(apiInfo, options = {}) {
    if (!apiInfo || !state.config.setup) return false;
    let mutated = false;
    const skipIds = options.skipIds || [];

    const processItems = (items) => {
        if (!items || !Array.isArray(items)) return;
        for (const item of items) {
            if (skipIds.includes(item.id)) continue;
            
            if (item.id) {
                const element = document.getElementById(item.id);
                if (element) {
                    let value = null;
                    
                    if (item.apiSource) {
                        const apiValue = CustomUtils.getNestedValue(apiInfo, item.apiSource);
                        if (apiValue !== null && apiValue !== undefined && apiValue !== '') {
                            value = apiValue;
                        }
                    }

                    if (value !== null && value !== undefined && value !== '') {
                        if (element.value !== String(value)) {
                            UI.updateElement(element, { value: value });
                            mutated = true;
                        }
                    }
                }
            }
            if (item.items) processItems(item.items);
        }
    };

    state.config.setup.categories.forEach(cat => processItems(cat.items));

    if (mutated) {
        updateAutoConnectionInfo(apiInfo);
    }
    return mutated;
}

// ==================== Extended Info DOM生成 ====================

async function insertExtendedInfo(temp) {
    const imageLink = document.querySelector('#image-link');
    if (!imageLink) {
        console.log('Image link element not found');
        return;
    }
    
    try {
        if (!state.autoConfig) {
            await loadAutoConfig();
        }
        
        if (!state.autoConfig?.display?.extendedInfo) {
            console.warn('extendedInfo not found in auto-config.json');
            return;
        }
        
        const displayConfig = state.autoConfig.display.extendedInfo;
        
        if (document.querySelector(`#${displayConfig.id}`)) {
            console.log('Extended info already exists');
            return;
        }
        
        const extendedInfo = document.createElement('div');
        extendedInfo.id = displayConfig.id;
        extendedInfo.className = 'hide';
        
        const h3 = document.createElement('h3');
        h3.textContent = displayConfig.name;
        if (displayConfig.class) h3.classList.add(displayConfig.class);
        extendedInfo.appendChild(h3);
        
        if (displayConfig.fields) {
            displayConfig.fields.forEach(field => {
                const row = document.createElement('div');
                row.className = 'row';
                
                const col1 = document.createElement('div');
                col1.className = 'col1';
                if (field.class) col1.classList.add(field.class);
                col1.textContent = field.label;
                
                const col2 = document.createElement('div');
                col2.className = 'col2';
                col2.id = field.id;
                col2.textContent = current_language_json?.[field.class] || 'Loading...';
                
                row.appendChild(col1);
                row.appendChild(col2);
                extendedInfo.appendChild(row);
            });
        }
        
        imageLink.closest('.row').insertAdjacentElement('afterend', extendedInfo);
        console.log('Extended info inserted');
        
    } catch (err) {
        console.error('Failed to load auto-config:', err);
    }
}

// ==================== 言語処理 ====================
function setupLanguageSelector() {
    const mainLanguageSelect = document.querySelector('#languages-select');
    const customLanguageSelect = document.querySelector('#device-language');
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

function syncDeviceLanguageSelector(lang) {
    const customSelect = document.getElementById('device-language');
    if (lang && customSelect && customSelect.value !== lang) {
        customSelect.removeEventListener('change', handleCustomLanguageChange);
        customSelect.value = lang;
        customSelect.addEventListener('change', handleCustomLanguageChange);
        console.log('Device language selector synced to:', lang);
    }
    state.ui.language.selected = lang;
}

async function handleMainLanguageChange(e) {
    const newLanguage = e?.target?.value || config.fallback_language;
    if (newLanguage === current_language) return;

    const isUserAction = e && e.isTrusted === true;
    
    console.log('Main language change:', {
        newLanguage,
        oldLanguage: current_language,
        isUserAction
    });

    current_language = newLanguage;
    state.ui.language.current = newLanguage;
    
    await loadCustomTranslations(current_language);
    
    updatePackageListToTextarea('language-changed');

    if (isUserAction) {
        const oldDeviceLanguage = state.ui.language.selected;
        config.device_language = current_language;
        state.ui.language.selected = current_language;
        
        syncDeviceLanguageSelector(state.ui.language.selected);
        
        if (oldDeviceLanguage !== state.ui.language.selected) {
            updateAllPackageState('browser-language-changed');
        }
    }

    if (typeof updateAutoConnectionInfo === 'function') {
        const info = state.apiInfo;
        if (info) updateAutoConnectionInfo(info);
    }
}

async function handleCustomLanguageChange(e) {
    const newLanguage = e.target.value || config.fallback_language;
    if (newLanguage === state.ui.language.selected) return;

    const oldDeviceLanguage = state.ui.language.selected;
    config.device_language = newLanguage;
    state.ui.language.selected = newLanguage;
    
    console.log('Device language change:', {
        newLanguage,
        oldLanguage: oldDeviceLanguage
    });

    updateVariableDefinitions();
    updateAllPackageState('device-language-changed');
}

async function loadCustomTranslations(lang) {
    if (!lang) {
        lang = current_language || navigator.language.split('-')[0];
    }
    
    const customLangFile = config.language_path_template.replace('{lang}', lang);
    try {
        const resp = await fetch(customLangFile, { cache: 'no-store' });

        if (!resp.ok) {
            console.log(`Custom translation not found for ${lang}, skipping custom translations`);
            return;
        }

        const langMap = JSON.parse(await resp.text());
        Object.assign(current_language_json, langMap);
        applyCustomTranslations(current_language_json);
        
        console.log(`Custom translations loaded and applied for: ${lang}`);
    } catch (err) {
        console.error(`Error loading custom translations for ${lang}:`, err);
    }
}

// ==================== 変数値の解決 ====================
function resolveVariableValue(varName) {
    const config = state.config.setup?.constants?.variableResolution?.[varName];
    
    if (config?.fallback) {
        for (const rule of config.fallback) {
            const el = document.getElementById(rule.field);
            if (!el) continue;
            
            const value = (rule.type === 'value' ? el.value : el.placeholder)?.trim();
            if (!value) continue;
            
            return rule.format === 'strip_cidr' ? value.split('/')[0] : value;
        }
        return '';
    }
    
    const field = findFieldByVariable(varName);
    if (field) {
        const el = document.getElementById(field.id);
        if (el) return el.value || el.placeholder || field.default || '';
    }
    
    return '';
}

function resolveTemplateVariables(template) {
    if (!template || typeof template !== 'string') return template;
    
    let result = template;
    const varMatches = template.matchAll(/\{([a-z_][a-z0-9_]*)\}/gi);
    
    for (const match of varMatches) {
        const varName = match[1];
        let value = resolveVariableValue(varName);
        
        if (value && value.includes('/')) {
            value = value.split('/')[0];
        }
        
        result = result.replace(`{${varName}}`, value || '');
    }
    
    return result;
}

function applyCustomTranslations(map) {
    if (!map || typeof map !== 'object') return;
    
    const currentLang = current_language || config.fallback_language || 'en';
    
    if (!state.cache.originalAutoDetectionTexts) {
        state.cache.originalAutoDetectionTexts = {};
    }
    
    if (!state.cache.originalAutoDetectionTexts[currentLang] && map['tr-auto-detection']) {
        state.cache.originalAutoDetectionTexts[currentLang] = map['tr-auto-detection'];
    }
    
    const translationMap = { ...map };
    
    if (state.apiInfo && state.cache.originalAutoDetectionTexts[currentLang]) {
        const connectionType = getConnectionType(state.apiInfo);
        if (connectionType) {
            translationMap['tr-auto-detection'] = state.cache.originalAutoDetectionTexts[currentLang] + ': ' + connectionType;
        }
    }
    
    Object.assign(current_language_json, translationMap);
    
    for (const tr in translationMap) {
        document.querySelectorAll(`.${tr}`).forEach(e => {
            if ('placeholder' in e) {
                e.placeholder = translationMap[tr];
            } else {
                let content = translationMap[tr];
                let hasHtml = false;
                
                const varMatches = content.matchAll(/\$([a-z_][a-z0-9_]*)/gi);
                for (const match of varMatches) {
                    const varName = match[1];
                    const value = resolveVariableValue(varName);
                    content = content.replace(`$${varName}`, value);
                }
                
                const linkMatch = content.match(/<(https?:\/\/[^>]+|[^>]+\.[^>]+)>/);
                if (linkMatch) {
                    const url = linkMatch[1];
                    const href = url.startsWith('http') ? url : `https://${url}`;
                    content = content.replace(`<${url}>`, `<a href="${href}" target="_blank">${url}</a>`);
                    hasHtml = true;
                }
                
                if (hasHtml) {
                    e.innerHTML = content;
                } else {
                    e.innerText = content;
                }
            }
        });
    }
    
    document.querySelectorAll('[data-url-template]').forEach(el => {
        const template = el.getAttribute('data-url-template');
        const content = resolveTemplateVariables(template);
        
        const linkMatch = content.match(/<(https?:\/\/[^>]+|[^>]+\.[^>]+)>/);
        if (linkMatch) {
            const url = linkMatch[1];
            const href = url.startsWith('http') ? url : `https://${url}`;
            const textBefore = content.substring(0, linkMatch.index);
            const textAfter = content.substring(linkMatch.index + linkMatch[0].length);
            el.innerHTML = `${textBefore}<a href="${href}" target="_blank" class="linked-title">${url}</a>${textAfter}`;
        } else {
            if (el.tagName === 'A') {
                el.href = content;
                el.textContent = content;
            } else {
                el.textContent = content;
            }
        }
    });
    
    console.log('Custom translations applied to DOM');
}

// ==================== 共通マルチインプット管理 ====================
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
                console.log('Package search confirmed:', value);
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

// ==================== パッケージ検索 ====================
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
    
    const h4 = document.querySelector('.package-search-container h4');
    if (h4) {
        addTooltip(h4, "Select extra packages to install. They'll be added to the list below.");
        console.log('Package search tooltip added');
    }
    
    console.log('Package search setup complete');
}

// ==================== searchPackages: kmodsの特別扱いのみ残す ====================
async function searchPackages(query, inputElement) {
    const arch = state.device.arch;
    const version = state.device.version || document.querySelector("#versions")?.value;
    const vendor = state.device.vendor;
    
    const allFeeds = getConfiguredFeeds();
    let feeds = allFeeds.filter(f => f !== 'kmods' && f !== 'target');
    
    if (query.toLowerCase().startsWith('kmod-') && vendor) {
        feeds = ['kmods'];
    }
    
    const results = await Promise.allSettled(
        feeds.map(feed => searchInFeed(query, feed, version, arch))
    );
    
    const allResults = new Set();
    results.forEach(result => {
        if (result.status === 'fulfilled') {
            result.value.forEach(pkg => allResults.add(pkg));
        }
    });
    
    const sortedResults = Array.from(allResults).sort((a, b) => {
        const q = query.toLowerCase();
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();
        
        const aExact = (aLower === q);
        const bExact = (bLower === q);
        if (aExact && !bExact) return -1;
        if (bExact && !aExact) return 1;
        return a.localeCompare(b);
    });
    
    showPackageSearchResults(sortedResults, inputElement);
}

async function searchInFeed(query, feed, version, arch) {
    const cacheKey = `${version}:${arch}:${feed}`;

    try {
        if (!state.cache.feed.has(cacheKey)) {
            const url = await buildPackageUrl(feed, {
                version, 
                arch,
                vendor: state.device.vendor,
                subtarget: state.device.subtarget,
                isSnapshot: version.includes('SNAPSHOT')
            });

            const resp = await fetch(url, { cache: 'force-cache' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            const packageManager = determinePackageManager(version);
            const isJsonFormat = (packageManager === 'apk');

            let list = [];
            if (isJsonFormat) {
                const data = await resp.json();
                
                if (Array.isArray(data.packages)) {
                    for (const pkg of data.packages) {
                        if (!pkg || !pkg.name) continue;
                        list.push(pkg.name);
                    }
                } else if (data.packages && typeof data.packages === 'object') {
                    list = Object.keys(data.packages);
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

async function fetchApkPackageSizes(packages, deviceInfo) {
    if (determinePackageManager(deviceInfo.version) !== 'apk') return;
    
    const prefix = `${deviceInfo.version}:${deviceInfo.arch}:`;
    const channel = deviceInfo.version === 'SNAPSHOT' ? 'snapshotBare'
              : deviceInfo.version.includes('SNAPSHOT') ? 'snapshot'
              : 'release';
    const channelConfig = state.packageManager.config.channels[channel].apk;
    
    const kmodPackages = packages.filter(p => p.feed === 'kmods');
    if (kmodPackages.length > 0 && !state.cache.kmods.token) {
        try {
            await buildPackageUrl('kmods', deviceInfo);
        } catch (err) {
            console.error('Failed to get kmods token:', err);
        }
    }
    
    const tasks = [];
    
    for (const { name, feed, version: pkgVer } of packages) {
        if (!pkgVer) continue;
        if (feed === 'target') continue;
        if (state.cache.packageSizes.has(prefix + name)) continue;
        
        let indexUrl;
        if (feed === 'kmods') {
            if (!state.cache.kmods.token) {
                console.warn(`kmods token not available for ${name}`);
                continue;
            }
            indexUrl = applyUrlTemplate(channelConfig.kmodsIndexUrl, {
                version: deviceInfo.version,
                arch: deviceInfo.arch,
                vendor: deviceInfo.vendor,
                subtarget: deviceInfo.subtarget,
                feed: feed,
                kmod: state.cache.kmods.token
            });
        } else {
            indexUrl = applyUrlTemplate(channelConfig.packageIndexUrl, {
                version: deviceInfo.version,
                arch: deviceInfo.arch,
                feed: feed
            });
        }
        
        const url = indexUrl.replace('index.json', `${name}-${pkgVer}.apk`);
        
        tasks.push(
            fetch(url, { method: 'HEAD', cache: 'force-cache' })
                .then(r => {
                    if (r.ok) {
                        const size = parseInt(r.headers.get('content-length') || '0');
                        if (size > 0) {
                            state.cache.packageSizes.set(prefix + name, size);
                            console.log(`Size fetched: ${name} = ${size} bytes`);
                        }
                    }
                })
                .catch(err => {
                    console.error(`Failed to fetch size for ${name}:`, err);
                })
        );
    }
    
    await Promise.all(tasks);
}

async function buildPackageUrl(feed, deviceInfo) {
    const { version, arch, vendor, subtarget } = deviceInfo;
    
    if (!state.packageManager.config) {
        await loadPackageManagerConfig();
    }
    
    const packageManager = determinePackageManager(version);
    const channel = version === 'SNAPSHOT' ? 'snapshotBare' 
              : version.includes('SNAPSHOT') ? 'snapshot' 
              : 'release';
    
    state.packageManager.activeManager = packageManager;
    state.packageManager.activeChannel = channel;
    
    const channelConfig = state.packageManager.config.channels[channel][packageManager];
    
    if (!channelConfig) {
        throw new Error(`Channel config not found: ${channel}/${packageManager}`);
    }
    
    const vars = { version, arch, vendor, subtarget, feed };
    
    if (feed === 'kmods') {
        if (!vendor || !subtarget) {
            throw new Error('Missing vendor or subtarget for kmods');
        }

        const cacheKey = `${version}|${vendor}|${subtarget}`;
        
        if (state.cache.kmods.token && state.cache.kmods.key === cacheKey) {
            vars.kmod = state.cache.kmods.token;
            return applyUrlTemplate(channelConfig.kmodsIndexUrl, vars);
        }
        
        const indexUrl = applyUrlTemplate(channelConfig.kmodsIndexBaseUrl, vars);
        
        const resp = await fetch(indexUrl, { cache: 'no-store' });
        if (!resp.ok) throw new Error(`Failed to fetch kmods index: HTTP ${resp.status}`);
        
        const html = await resp.text();
        const matches = [...html.matchAll(/href="([^/]+)\//g)]
            .map(m => m[1])
            .filter(t => t && /^[\w.-]+$/.test(t) && !t.startsWith('.'));
        
        if (!matches.length) throw new Error("kmods token not found");
        
        matches.sort();
        state.cache.kmods.token = matches[matches.length - 1];
        state.cache.kmods.key = cacheKey;
        
        vars.kmod = state.cache.kmods.token;
        return applyUrlTemplate(channelConfig.kmodsIndexUrl, vars);
        
    } else if (feed === 'target') {
        if (!vendor || !subtarget) {
            throw new Error('Missing vendor or subtarget for target packages');
        }
        return applyUrlTemplate(channelConfig.targetsIndexUrl, vars);
        
    } else {
        return applyUrlTemplate(channelConfig.packageIndexUrl, vars);
    }
}

// ==================== isPackageAvailable: 全feed検索 ====================
async function isPackageAvailable(pkgName) {
    if (!pkgName) return false;

    const deviceInfo = {
        arch: state.device.arch,
        version: state.device.version,
        vendor: state.device.vendor,
        subtarget: state.device.subtarget,
        isSnapshot: (state.device.version || '').includes('SNAPSHOT')
    };
    
    if (!deviceInfo.arch || !deviceInfo.version) {
        console.log('Missing device info for package check:', deviceInfo);
        return false;
    }

    const cacheKey = `${deviceInfo.version}:${deviceInfo.arch}:${pkgName}`;
    if (state.cache.packageAvailability.has(cacheKey)) {
        return state.cache.packageAvailability.get(cacheKey);
    }

    try {
        const feeds = getConfiguredFeeds().filter(f => f !== 'target');
        
        if (pkgName.startsWith('kmod-') && deviceInfo.vendor && deviceInfo.subtarget) {
            feeds.push('kmods');
        }
        
        for (const feed of feeds) {
            try {
                const pkgSet = await getFeedPackageSet(feed, deviceInfo);
                if (pkgSet.has(pkgName)) {
                    state.cache.packageAvailability.set(cacheKey, true);
                    return true;
                }
            } catch (err) {
            }
        }

        state.cache.packageAvailability.set(cacheKey, false);
        return false;
    } catch (err) {
        console.error('Package availability check error:', err);
        state.cache.packageAvailability.set(cacheKey, false);
        return false;
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

    const resp = await fetch(url, { cache: 'force-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${feed} at ${url}`);

    const packageManager = determinePackageManager(deviceInfo.version);
    const isJsonFormat = (packageManager === 'apk');
    
    let pkgSet;

    if (isJsonFormat) {
        const data = await resp.json();
        const names = new Set();
        
        if (Array.isArray(data.packages)) {
            data.packages.forEach(pkg => {
                if (pkg && pkg.name) {
                    names.add(pkg.name);
                    if (pkg.desc) {
                        const descKey = `${deviceInfo.version}:${deviceInfo.arch}:${pkg.name}`;
                        state.cache.packageDescriptions.set(descKey, pkg.desc);
                    }
                    if (pkg.size) {
                        const sizeKey = `${deviceInfo.version}:${deviceInfo.arch}:${pkg.name}`;
                        state.cache.packageSizes.set(sizeKey, parseInt(pkg.size));
                    }
                }
            });
        } else if (data.packages && typeof data.packages === 'object') {
            Object.entries(data.packages).forEach(([name, verOrInfo]) => {
                names.add(name);
                const vKey = `${deviceInfo.version}:${deviceInfo.arch}:${feed}:${name}`;
                if (typeof verOrInfo === 'string') {
                    state.cache.packageVersions.set(vKey, verOrInfo);
                } else if (verOrInfo && typeof verOrInfo === 'object') {
                    if (verOrInfo.version) state.cache.packageVersions.set(vKey, verOrInfo.version);
                    const descKey = `${deviceInfo.version}:${deviceInfo.arch}:${name}`;
                    if (verOrInfo.desc) {
                        state.cache.packageDescriptions.set(descKey, verOrInfo.desc);
                    }
                    if (verOrInfo.size) {
                        const sizeKey = `${deviceInfo.version}:${deviceInfo.arch}:${name}`;
                        state.cache.packageSizes.set(sizeKey, parseInt(verOrInfo.size));
                    }
                }
            });
        }
        
        pkgSet = names;
        
    } else {
        const text = await resp.text();
        const lines = text.split('\n');
        const names = [];
        let currentPackage = null;
        let currentDescription = '';
        let inDescription = false;
        
        for (const line of lines) {
            if (line.startsWith('Package: ')) {
                if (currentPackage && currentDescription) {
                    const descKey = `${deviceInfo.version}:${deviceInfo.arch}:${currentPackage}`;
                    state.cache.packageDescriptions.set(descKey, currentDescription.trim());
                }
                
                currentPackage = line.substring(9).trim();
                names.push(currentPackage);
                currentDescription = '';
                inDescription = false;
            } else if (line.startsWith('Size: ') && currentPackage) {
                const size = parseInt(line.substring(6).trim());
                if (size > 0) {
                    const sizeCacheKey = `${deviceInfo.version}:${deviceInfo.arch}:${currentPackage}`;
                    state.cache.packageSizes.set(sizeCacheKey, size);
                }
            } else if (line.startsWith('Description: ') && currentPackage) {
                currentDescription = line.substring(13).trim();
                inDescription = true;
            } else if (inDescription && currentPackage) {
                if (line.startsWith(' ')) {
                    currentDescription += '\n' + line.trim();
                } else if (!line.trim()) {
                    inDescription = false;
                } else if (!line.startsWith(' ')) {
                    inDescription = false;
                }
            }
        }
        
        if (currentPackage && currentDescription) {
            const descKey = `${deviceInfo.version}:${deviceInfo.arch}:${currentPackage}`;
            state.cache.packageDescriptions.set(descKey, currentDescription.trim());
        }
        
        pkgSet = new Set(names.filter(Boolean));
    }

    state.cache.feedPackageSet.set(key, pkgSet);
    return pkgSet;
}

function updatePackageSizeDisplay() {
    if (!state.device.version || !state.device.arch) return;
    
    document.querySelectorAll('.package-selector-checkbox').forEach(checkbox => {
        const packageId = checkbox.getAttribute('data-package');
        if (!packageId) return;
        
        const label = checkbox.closest('label');
        if (!label) return;
        
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

// ==================== verifyAllPackages: feed指定を削除 ====================
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
                hidden: pkg.hidden || false,
                checked: pkg.checked || false,
                virtual: pkg.virtual || false
            });
            if (pkg.dependencies) {
                pkg.dependencies.forEach(depId => {
                    const depPkg = findPackageById(depId);
                    if (depPkg) {
                        packagesToVerify.push({
                            id: depPkg.id,
                            uniqueId: depPkg.uniqueId || depPkg.id,
                            hidden: depPkg.hidden || false,
                            isDependency: true,
                            virtual: depPkg.virtual || false
                        });
                    }
                });
            }
        });
    });

    const uniquePackages = Array.from(new Set(packagesToVerify.map(p => p.id)))
        .map(id => {
            const pkg = packagesToVerify.find(p => p.id === id);
            return pkg;
        })
        .filter(pkg => !pkg.virtual);

    console.log(`Verifying ${uniquePackages.length} unique packages...`);

    const deviceInfo = {
        arch: state.device.arch,
        version: state.device.version,
        vendor: state.device.vendor,
        subtarget: state.device.subtarget,
        isSnapshot: (state.device.version || '').includes('SNAPSHOT')
    };
    
    const basePackages = [
        ...state.packages.default,
        ...state.packages.device,
        ...state.packages.extra
    ];
    
    const neededFeeds = new Set(getConfiguredFeeds().filter(f => f !== 'kmods' && f !== 'target'));
    
    if (deviceInfo.vendor && deviceInfo.subtarget) {
        neededFeeds.add('target');
        
        const hasKmods = uniquePackages.some(p => p.id.startsWith('kmod-')) || 
            basePackages.some(p => p.startsWith('kmod-'));
        if (hasKmods) {
            neededFeeds.add('kmods');
        }
    }
    
    console.log(`Fetching feeds: ${[...neededFeeds].join(', ')}`);
    
    const index = await buildAvailabilityIndex(deviceInfo, neededFeeds);

    let unavailableCount = 0;
    const checkedUnavailable = [];

    for (const pkg of uniquePackages) {
        const available = isAvailableInIndex(pkg.id, index);
        updatePackageAvailabilityUI(pkg.uniqueId, available);

        if (!available) {
            unavailableCount++;
            if (pkg.checked) checkedUnavailable.push(pkg.id);
        }
    }

    const elapsedTime = Date.now() - startTime;
    console.log(`Package verification completed in ${elapsedTime}ms`);
    console.log(`${unavailableCount} packages are not available for this device`);
    console.log(`Package sizes cached: ${state.cache.packageSizes.size}`);

    if (checkedUnavailable.length > 0) {
        console.warn('The following pre-selected packages are not available:', checkedUnavailable);
    }
    
    updatePackageSizeDisplay();
    updatePackageListToTextarea('package-verification-complete');
    
if (determinePackageManager(state.device.version) === 'apk') {
        const pkgs = [];
        const prefix = `${state.device.version}:${state.device.arch}:`;
        
        state.packages.json.categories.forEach(cat => {
            cat.packages.forEach(p => {
                for (const feed of getConfiguredFeeds()) {
                    const ver = state.cache.packageVersions.get(prefix + feed + ':' + p.id);
                    if (ver) {
                        pkgs.push({ name: p.id, feed, version: ver });
                        break;
                    }
                }
            });
        });
        
        await fetchApkPackageSizes(pkgs, {
            version: state.device.version,
            arch: state.device.arch,
            vendor: state.device.vendor,
            subtarget: state.device.subtarget,
            isSnapshot: (state.device.version || '').includes('SNAPSHOT')
        });
        
        updatePackageSizeDisplay();
        updatePackageListToTextarea('force-update');
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

    const index = {};
    const tasks = [];
    const needsVendorSubtarget = new Set(['kmods', 'target']);

    for (const feed of neededFeeds) {
        index[feed] = new Set();
        
        if (needsVendorSubtarget.has(feed)) {
            if (!deviceInfo.vendor || !deviceInfo.subtarget) {
                console.warn(`[WARN] ${feed} feed required but vendor/subtarget missing`);
                continue;
            }
        }
        
        tasks.push(
            getFeedPackageSet(feed, deviceInfo)
                .then(set => index[feed] = set)
                .catch(err => {
                    console.error(`Feed ${feed} fetch failed:`, err.message);
                    index[feed] = new Set();
                })
        );
    }

    await Promise.all(tasks);
    state.cache.availabilityIndex.set(cacheKey, index);
    return index;
}

// ==================== getPackageDescription: 全feed検索 ====================
async function getPackageDescription(pkgNameOrUrl) {
    if (typeof pkgNameOrUrl === 'string' && (pkgNameOrUrl.startsWith('http://') || pkgNameOrUrl.startsWith('https://'))) {
        const cacheKey = `url:${pkgNameOrUrl}`;
        
        if (state.cache.packageDescriptions.has(cacheKey)) {
            return state.cache.packageDescriptions.get(cacheKey);
        }
        
        try {
            const resp = await fetch(pkgNameOrUrl, { cache: 'force-cache' });
            if (!resp.ok) return null;
            const text = await resp.text();
            state.cache.packageDescriptions.set(cacheKey, text.trim());
            return text.trim();
        } catch (err) {
            console.error('Failed to fetch external description:', err);
            return null;
        }
    }
    
    if (typeof pkgNameOrUrl === 'string' && pkgNameOrUrl.includes(' ')) {
        return pkgNameOrUrl;
    }
    
    const pkgName = pkgNameOrUrl;
    const deviceInfo = {
        arch: state.device.arch,
        version: state.device.version,
        vendor: state.device.vendor,
        subtarget: state.device.subtarget,
        isSnapshot: (state.device.version || '').includes('SNAPSHOT')
    };
    
    if (!deviceInfo.arch || !deviceInfo.version) {
        return null;
    }
    
    const cacheKey = `${deviceInfo.version}:${deviceInfo.arch}:${pkgName}`;
    
    if (state.cache.packageDescriptions.has(cacheKey)) {
        return state.cache.packageDescriptions.get(cacheKey);
    }
    
    const feeds = getConfiguredFeeds().filter(f => f !== 'target' && f !== 'kmods');
    
    for (const feed of feeds) {
        try {
            const url = await buildPackageUrl(feed, deviceInfo);
            const resp = await fetch(url, { cache: 'force-cache' });
            if (!resp.ok) continue;
            
            const packageManager = determinePackageManager(deviceInfo.version);
            const isJsonFormat = (packageManager === 'apk');
            
            let description = null;
            
            if (isJsonFormat) {
                const data = await resp.json();
                let packages = [];
                
                if (Array.isArray(data.packages)) {
                    packages = data.packages;
                } else if (data.packages && typeof data.packages === 'object') {
                    packages = Object.entries(data.packages).map(([name, info]) => ({
                        name,
                        ...(typeof info === 'object' ? info : { version: info })
                    }));
                }
                
                const pkg = packages.find(p => p?.name === pkgName);
                if (pkg && pkg.desc) {
                    description = pkg.desc;
                }
            } else {
                const text = await resp.text();
                const lines = text.split('\n');
                let currentPackage = null;
                let currentDescription = '';
                let inDescription = false;
                
                for (const line of lines) {
                    if (line.startsWith('Package: ')) {
                        if (currentPackage === pkgName && currentDescription) {
                            description = currentDescription.trim();
                            break;
                        }
                        currentPackage = line.substring(9).trim();
                        currentDescription = '';
                        inDescription = false;
                    } else if (line.startsWith('Description: ') && currentPackage === pkgName) {
                        currentDescription = line.substring(13).trim();
                        inDescription = true;
                    } else if (inDescription && currentPackage === pkgName) {
                        if (line.startsWith(' ')) {
                            currentDescription += '\n' + line.trim();
                        } else if (line.trim() === '') {
                            inDescription = false;
                        } else if (!line.startsWith(' ')) {
                            break;
                        }
                    }
                }
                
                if (currentPackage === pkgName && currentDescription) {
                    description = currentDescription.trim();
                }
            }
            
            if (description) {
                state.cache.packageDescriptions.set(cacheKey, description);
                return description;
            }
        } catch (err) {
        }
    }
    
    return null;
}

function addTooltip(element, descriptionSource) {
    element.style.position = 'relative';
    
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    element.appendChild(tooltip);
    
    let isTooltipLoaded = false;
    
    element.addEventListener('mouseenter', async function() {
        if (isTooltipLoaded) return;
        
        let description = await getPackageDescription(descriptionSource);
        if (description) {
            description = resolveTemplateVariables(description);
            tooltip.textContent = description;
            isTooltipLoaded = true;
        } else {
            tooltip.textContent = 'No description available';
            isTooltipLoaded = true;
        }
    });
}

function isAvailableInIndex(pkgName, index) {
    for (const feedSet of Object.values(index)) {
        if (feedSet?.has?.(pkgName)) return true;
    }
    return false;
}

function updatePackageAvailabilityUI(uniqueId, isAvailable) {
    const checkbox = document.querySelector(`#pkg-${uniqueId}`);
    if (!checkbox) return;
    
    const packageItem = checkbox.closest('.package-item');
    if (!packageItem) {
        const label = checkbox.closest('label');
        if (label) {
            UI.updateElement(label, { show: isAvailable });
            if (!isAvailable) {
                checkbox.checked = false;
                checkbox.disabled = true;
            } else {
                checkbox.disabled = false;
                const pkgInfo = findPackageById(checkbox.getAttribute('data-package'));
                if (pkgInfo && pkgInfo.checked === "true") {
                    checkbox.checked = true;
                }
            }
        }
        return;
    }
    
    const isMainPackage = !checkbox.closest('.package-dependent');
    
    if (isMainPackage) {
        if (isAvailable) {
            UI.updateElement(packageItem, { show: true });
            checkbox.disabled = false;
            const pkgInfo = findPackageById(checkbox.getAttribute('data-package'));
            if (pkgInfo && pkgInfo.checked === "true") {
                checkbox.checked = true;
                const depCheckboxes = packageItem.querySelectorAll('.package-dependent input[type="checkbox"]');
                depCheckboxes.forEach(depCb => {
                    const depPkgInfo = findPackageById(depCb.getAttribute('data-package'));
                    if (depPkgInfo && depPkgInfo.checked === "true") {
                        depCb.checked = true;
                    }
                });
            }
        } else {
            UI.updateElement(packageItem, { show: false });
            checkbox.checked = false;
            checkbox.disabled = true;
            const depCheckboxes = packageItem.querySelectorAll('.package-dependent input[type="checkbox"]');
            depCheckboxes.forEach(depCb => {
                depCb.checked = false;
                depCb.disabled = true;
            });
        }
    } else {
        const depLabel = checkbox.closest('label');
        if (depLabel) {
            UI.updateElement(depLabel, { show: isAvailable });
            if (!isAvailable) {
                checkbox.checked = false;
                checkbox.disabled = true;
            } else {
                checkbox.disabled = false;
                const pkgInfo = findPackageById(checkbox.getAttribute('data-package'));
                if (pkgInfo && pkgInfo.checked === "true") {
                    checkbox.checked = true;
                }
            }
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

// ==================== OpenWrt ToH JSON ====================
let tohDataCache = null;

async function fetchToHData() {
    if (tohDataCache) return tohDataCache;
    
    try {
        const response = await fetch(config.device_info_url, { cache: 'force-cache' });
        if (!response.ok) return null;
        tohDataCache = await response.json();
        return tohDataCache;
    } catch (err) {
        console.warn('ToH data fetch failed:', err.message);
        return null;
    }
}

// ==================== パッケージデータベース ====================
async function loadPackageDatabase() {
    try {
        const url = config.packages_db_path;
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
                if (!pkg.hidden) pkg.hidden = true;
                createHiddenPackageCheckbox(pkg);
            });
            return;
        }
        
        const categoryDiv = createPackageCategory(category);
        if (categoryDiv) {
            container.appendChild(categoryDiv);
        }
    });
    
    console.log(`Generated ${state.packages.json.categories.length} package categories`);
    
    requestAnimationFrame(() => {
        evaluateInitialPackages();
    });
    
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
    
    requestAnimationFrame(() => {
        if (current_language_json) {
            applyCustomTranslations(current_language_json);
        }
    });
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
        if (pkg.hidden) {
            createHiddenPackageCheckbox(pkg);
        } else {
            hasVisiblePackages = true;
            const packageItem = createPackageItem(pkg);
            packageGrid.appendChild(packageItem);
        }
    });
    
if (!hasVisiblePackages) return null;
    
    const title = document.createElement('h4');
    const titleText = document.createElement('span');
    titleText.textContent = category.name;
    if (category.class) {
        titleText.classList.add(category.class);
    }
    title.appendChild(titleText);
    
    if (category.description) {
        addTooltip(title, category.description);
    }
    categoryDiv.appendChild(title);
    
    categoryDiv.appendChild(packageGrid);
    return categoryDiv;
}
 
function createPackageItem(pkg) {
    const packageItem = document.createElement('div');
    packageItem.className = 'package-item';
    packageItem.setAttribute('data-package-id', pkg.id);
    
    const isChecked = pkg.checked === "true";
    const mainCheckbox = createPackageCheckbox(pkg, isChecked);
    packageItem.appendChild(mainCheckbox);
    
    if (pkg.dependencies && Array.isArray(pkg.dependencies)) {
        const depContainer = document.createElement('div');
        depContainer.className = 'package-dependencies';
        
        pkg.dependencies.forEach(depId => {
            const depPkg = findPackageById(depId);
            if (depPkg) {
                const depCheckbox = createPackageCheckbox(depPkg, isChecked, true);
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

// ==================== パッケージデータベース ====================
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
        link.className = 'package-link linked-title';
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
    
    if (pkg.description && pkg.description.includes('{lan_ip_address}')) {
        const urlLink = document.createElement('a');
        urlLink.href = '#';
        urlLink.target = '_blank';
        urlLink.textContent = ' 🔗';
        urlLink.className = 'package-webui-link';
        urlLink.style.textDecoration = 'none';
        urlLink.setAttribute('data-package-url-template', pkg.description);
        
        urlLink.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const template = urlLink.getAttribute('data-package-url-template');
            const resolvedUrl = resolveTemplateVariables(template);
            window.open(resolvedUrl, '_blank');
        };
        
        label.appendChild(urlLink);
        
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        label.style.position = 'relative';
        label.appendChild(tooltip);
        
        urlLink.addEventListener('mouseenter', () => {
            const template = urlLink.getAttribute('data-package-url-template');
            const resolvedUrl = resolveTemplateVariables(template);
            tooltip.textContent = resolvedUrl;
        });
        
    } else if (pkg.description) {
        addTooltip(label, pkg.description);
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
                if (depCheckbox && !depCheckbox.disabled) {
                    depCheckbox.checked = isChecked;
                    
                    const depDeps = depCheckbox.getAttribute('data-dependencies');
                    if (depDeps && isChecked) {
                        depDeps.split(',').forEach(subDepName => {
                            const subDepPkg = findPackageById(subDepName);
                            if (subDepPkg) {
                                const subDepCheckbox = document.querySelector(`[data-unique-id="${subDepPkg.uniqueId || subDepPkg.id}"]`);
                                if (subDepCheckbox && !subDepCheckbox.disabled) {
                                    subDepCheckbox.checked = true;
                                }
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

// ==================== コマンド入力 ====================
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

    const h4 = document.querySelector('.commands-container h4');
    if (h4) {
        addTooltip(h4, "Add custom shell commands that run on first boot.");
        console.log('Commands tooltip added');
    }

    console.log('Commands input setup complete');
}

// ==================== Settings Import/Export ====================
function setupImportExport() {
    const importBtn = document.getElementById('import-settings-btn');
    const exportBtn = document.getElementById('export-settings-btn');
    const fileInput = document.getElementById('import-file-input');
    
    if (!importBtn || !exportBtn || !fileInput) {
        console.error('Import/Export buttons or file input not found');
        return;
    }
    
    importBtn.addEventListener('click', () => {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            importSettings(file);
        }
        fileInput.value = '';
    });
    
    exportBtn.addEventListener('click', () => {
        exportSettings();
    });
    
    console.log('Import/Export setup complete');
}

function buildVariableToFieldMap() {
    const map = {};
    
    if (!state.config.setup || !state.config.setup.categories) {
        return map;
    }
    
    for (const category of state.config.setup.categories) {
        for (const item of category.items) {
            if (item.type === 'field' && item.variable && item.id) {
                map[item.variable] = item.id;
            } else if (item.type === 'radio-group' && item.variable) {
                map[item.variable] = item.variable;
            } else if (item.type === 'section' && item.items) {
                for (const subItem of item.items) {
                    if (subItem.type === 'field' && subItem.variable && subItem.id) {
                        map[subItem.variable] = subItem.id;
                    } else if (subItem.type === 'radio-group' && subItem.variable) {
                        map[subItem.variable] = subItem.variable;
                    }
                }
            }
        }
    }
    
    console.log('Variable to field map built:', map);
    return map;
}

function exportSettings() {
    const deviceModel = document.querySelector('#models')?.value || '';
    const deviceName = getFieldValue('#aios-device-name') || 'OpenWrt';
    const osVersion = document.querySelector('#versions')?.value || 'SNAPSHOT';
    const now = new Date();
    const timestamp = now.toISOString();
    const dateStr = now.toISOString().replace(/[-:]/g, '').split('.')[0].replace('T', '-');
    const deviceId = state.device.id || state.device.target || deviceModel || 'unknown-device';
    const deviceLang = config.device_language || 'en';
    const userPackages = extractUserPackages();
    const variables = extractVariablesFromSetup();
    const commands = extractCommandsFromSetup();
    
    const AUTO_MODE_EXCLUSIONS = state.config.constants.export_exclusions;
    
    for (const [modeVar, exclusionMap] of Object.entries(AUTO_MODE_EXCLUSIONS)) {
        const modeValue = variables[modeVar];
        if (modeValue && exclusionMap[modeValue]) {
            const varsToExclude = exclusionMap[modeValue];
            varsToExclude.forEach(varName => {
                delete variables[varName];
            });
            console.log(`AUTO mode detected (${modeVar}=${modeValue}), excluded:`, varsToExclude);
        }
    }
    
    const ini = generateINI({
        metadata: {
            device_model: deviceModel,
            device_name: deviceName,
            language: deviceLang,
            os_version: osVersion,
            export_date: timestamp,
            version: '1.0'
        },
        packages: userPackages,
        variables: variables,
        commands: commands
    });
    const filename = `${deviceId}_${osVersion}_${deviceLang}_${dateStr}.txt`;
    const blob = new Blob([ini], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    console.log('Settings exported:', filename);
}

function importSettings(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        try {
            const content = e.target.result;
            const data = parseINI(content);
            
            if (!data) {
                alert('Invalid INI format');
                return;
            }
            
            applyImportedSettings(data);
            console.log('Settings imported successfully');
            
        } catch (err) {
            console.error('Import error:', err);
            alert('Failed to import settings: ' + err.message);
        }
    };
    
    reader.readAsText(file);
}

function parseINI(content) {
    const lines = content.split('\n');
    const data = {
        metadata: {},
        packages: [],
        variables: {},
        commands: []
    };
    
    let currentSection = null;
    
    for (let line of lines) {
        line = line.trim();
        
        if (!line || line.startsWith('#') || line.startsWith(';')) {
            continue;
        }
        
        if (line.startsWith('[') && line.endsWith(']')) {
            currentSection = line.slice(1, -1).toLowerCase();
            continue;
        }
        
        if (currentSection === 'metadata') {
            const [key, ...valueParts] = line.split('=');
            const value = valueParts.join('=').trim();
            if (key && value) {
                data.metadata[key.trim()] = value;
            }
        } else if (currentSection === 'packages') {
            if (line) {
                data.packages.push(line);
            }
        } else if (currentSection === 'variables') {
            const [key, ...valueParts] = line.split('=');
            const value = valueParts.join('=').trim();
            if (key && value) {
                data.variables[key.trim()] = value;
            }
        } else if (currentSection === 'commands') {
            if (line) {
                data.commands.push(line);
            }
        }
    }
    
    return data;
}

function generateINI(data) {
    let ini = '# OpenWrt Custom Settings Export\n';
    ini += `# Generated: ${data.metadata.export_date}\n\n`;
    
    ini += '[METADATA]\n';
    for (const [key, value] of Object.entries(data.metadata)) {
        ini += `${key}=${value}\n`;
    }
    ini += '\n';
    
    ini += '[PACKAGES]\n';
    for (const pkg of data.packages) {
        ini += `${pkg}\n`;
    }
    ini += '\n';
    
    ini += '[VARIABLES]\n';
    for (const [key, value] of Object.entries(data.variables)) {
        ini += `${key}=${value}\n`;
    }
    ini += '\n';
    
    ini += '[COMMANDS]\n';
    for (const cmd of data.commands) {
        ini += `${cmd}\n`;
    }
    
    return ini;
}

function extractUserPackages() {
    const basePackages = new Set([
        ...state.packages.default,
        ...state.packages.device,
        ...state.packages.extra
    ]);
    
    const userPackages = [];
    const currentPackages = getCurrentPackageListForLanguage();
    
    for (const pkg of currentPackages) {
        if (!basePackages.has(pkg) && !pkg.startsWith('luci-i18n-')) {
            userPackages.push(pkg);
        }
    }
    
    return userPackages;
}

function extractVariablesFromSetup() {
    const textarea = document.querySelector('#uci-defaults-content');
    if (!textarea) return {};
    
    const content = textarea.value;
    const beginMarker = '# BEGIN_VARS';
    const endMarker = '# END_VARS';
    const beginIndex = content.indexOf(beginMarker);
    const endIndex = content.indexOf(endMarker);
    
    if (beginIndex === -1 || endIndex === -1) return {};
    
    const varsSection = content.substring(beginIndex + beginMarker.length, endIndex);
    const lines = varsSection.split('\n');
    const variables = {};
    
    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue;
        
        const match = line.match(/^(\w+)='(.*)'/);
        if (match) {
            variables[match[1]] = match[2].replace(/'\"'\"'/g, "'");
        }
    }
    
    return variables;
}

function extractCommandsFromSetup() {
    const textarea = document.querySelector('#uci-defaults-content');
    if (!textarea) return [];
    
    const content = textarea.value;
    const beginMarker = '# BEGIN_CMDS';
    const endMarker = '# END_CMDS';
    const beginIndex = content.indexOf(beginMarker);
    const endIndex = content.indexOf(endMarker);
    
    if (beginIndex === -1 || endIndex === -1) return [];
    
    const cmdsSection = content.substring(beginIndex + beginMarker.length, endIndex);
    const lines = cmdsSection.split('\n');
    const commands = [];
    
    for (let line of lines) {
        line = line.trim();
        if (line && !line.startsWith('#')) {
            commands.push(line);
        }
    }
    
    return commands;
}

function applyImportedSettings(data) {
    console.log('Applying imported settings:', data);

    const variableToFieldMap = buildVariableToFieldMap();

    if (data.metadata.os_version) {
        const versionSelect = document.querySelector('#versions');
        if (versionSelect) {
            versionSelect.value = data.metadata.os_version;
            versionSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
    
    if (data.metadata.device_model) {
        const modelsInput = document.querySelector('#models');
        if (modelsInput) {
            modelsInput.value = data.metadata.device_model;
            modelsInput.onkeyup({ key: 'Enter', keyCode: 13 });
        }
    }
    
    if (data.metadata.device_name) {
        const deviceNameField = document.getElementById('aios-device-name');
        if (deviceNameField) {
            deviceNameField.value = data.metadata.device_name;
        }
    }
    
    if (data.metadata.language) {
        const languageField = document.getElementById('device-language');
        if (languageField) {
            languageField.value = data.metadata.language;
            state.ui.language.selected = data.metadata.language;
            config.device_language = data.metadata.language;
        }
    }

    if (data.packages && data.packages.length > 0) {
        const textarea = document.querySelector('#asu-packages');
        if (textarea) {
            const currentPackages = CustomUtils.split(textarea.value);
            const allPackages = [...new Set([...currentPackages, ...data.packages])];
            textarea.value = allPackages.join(' ');
        }
        
        for (const pkg of data.packages) {
            const checkbox = document.querySelector(`[data-package="${pkg}"]`);
            if (checkbox && checkbox.type === 'checkbox') {
                checkbox.checked = true;
            }
        }
    }

    if (data.variables && Object.keys(data.variables).length > 0) {
        for (const [variableName, value] of Object.entries(data.variables)) {
            const fieldId = variableToFieldMap[variableName];
            let field = fieldId ? document.getElementById(fieldId) : null;
            let handled = false;

            let radio = document.querySelector(`[name="${variableName}"][value="${value}"]`);
            if (radio && radio.type === 'radio') {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
                handled = true;
                
                if (variableName === 'connection_type' && value === 'auto') {
                    const category = state.config.setup?.categories?.find(cat => 
                        cat.items?.some(item => item.variable === 'connection_type')
                    );
                    const radioGroup = category?.items?.find(item => item.variable === 'connection_type');
                    const exclusiveVars = radioGroup?.exclusiveVars?.['auto'] || [];
                    
                    exclusiveVars.forEach(varName => {
                        const varFieldId = variableToFieldMap[varName];
                        const varField = varFieldId ? document.getElementById(varFieldId) : null;
                        if (varField) {
                            varField.value = '';
                            console.log(`Cleared exclusive var: ${varName}`);
                        }
                    });
                }
                
                continue;
            }

            if (field && field.tagName === 'SELECT') {
                field.value = value;
                field.dispatchEvent(new Event('change', { bubbles: true }));
                handled = true;
                continue;
            }

            if (field && !handled) {
                field.value = value;
                field.dispatchEvent(new Event('input', { bubbles: true }));
                handled = true;
                continue;
            }

            if (!handled) {
                console.warn(`Field not found for variable: ${variableName} (mapped to ${fieldId})`);
            }
        }
    }

    if (data.commands && data.commands.length > 0) {
        if (state.ui.managers.commands) {
            state.ui.managers.commands.setValues(data.commands);
        }
    }

    evaluateAllShowWhen();
    evaluateAllComputedFields();
    document.querySelectorAll('input[type="radio"]:checked').forEach(radio => {
        radio.dispatchEvent(new Event('change', { bubbles: true }));
    });

    requestAnimationFrame(() => {
        updateVariableDefinitions();
        updateCustomCommands();
        console.log('Import completed successfully');
    });
}

// ==================== HTML読み込み ====================
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

function replaceAsuSection(asuSection, temp) {
    const newDiv = document.createElement('div');
    newDiv.id = 'asu';
    newDiv.className = asuSection.className;
    newDiv.style.width = '100%';
    
    const customPackages = temp.querySelector('#custom-packages-section details');
    const customScripts = temp.querySelector('#custom-scripts-section details');
    const buildSection = temp.querySelector('#asu-build-section');

    if (customPackages) {
        customPackages.id = 'custom-packages-details';
        newDiv.appendChild(customPackages);
    }
    if (customScripts) {
        customScripts.id = 'custom-scripts-details';
        newDiv.appendChild(customScripts);
    }
    if (buildSection) {
        Array.from(buildSection.children).forEach(child => {
            newDiv.appendChild(child);
        });
    }
    
    asuSection.parentNode.replaceChild(newDiv, asuSection);
}

// ==================== ASU Server Status Check ====================
async function checkAsuServerStatus() {
    const statusIndicator = document.getElementById('asu-status-indicator');
    const statusText = document.getElementById('asu-status-text');
    
    if (!statusIndicator || !statusText) {
        console.log('ASU status elements not found');
        return;
    }
    
    if (!config?.asu_url) {
        console.log('ASU URL not configured');
        updateAsuStatus('offline', 'ASU not configured');
        return;
    }
    
    try {
        statusIndicator.className = 'status-indicator status-checking';
        statusText.className = 'status-text tr-asu-status-checking';
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(config.asu_url + '/api/v1/overview', {
            method: 'GET',
            signal: controller.signal,
            cache: 'no-store'
        });
        
        if (!response.ok) {
            clearTimeout(timeoutId);
            if (response.status >= 500) {
                updateAsuStatus('error', response.status);
                console.warn(`ASU server error: HTTP ${response.status}`);
            } else {
                updateAsuStatus('offline', response.status);
                console.warn(`ASU server unexpected status: HTTP ${response.status}`);
            }
            return;
        }
        
        // キュー長を取得
        let queueLength = null;
        try {
            const statsResponse = await fetch(config.asu_url + '/api/v1/stats', {
                method: 'GET',
                signal: controller.signal,
                cache: 'no-store'
            });
            if (statsResponse.ok) {
                const statsData = await statsResponse.json();
                queueLength = statsData.queue_length ?? null;
                console.log(`ASU queue length: ${queueLength}`);
            }
        } catch (statsErr) {
            console.warn('Failed to fetch ASU stats:', statsErr);
        }
        
        const versionSelect = document.getElementById('versions');
        const version = versionSelect?.value || config.versions?.[0];
        
        if (version && config.overview_urls?.[version]) {
            const overview_url = `${config.overview_urls[version]}/.overview.json`;
            const overviewResponse = await fetch(overview_url, { 
                cache: 'no-cache',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (overviewResponse.status != 200) {
                updateAsuStatus('offline', 'Overview JSON unavailable', queueLength);
                console.error(`Failed to fetch ${overview_url}`);
                return;
            }
        } else {
            clearTimeout(timeoutId);
        }
        
        updateAsuStatus('online', response.status, queueLength);
        console.log('ASU server is online');
        
    } catch (error) {
        if (error.name === 'AbortError') {
            updateAsuStatus('offline', 'timeout');
            console.error('ASU server check timeout');
        } else {
            updateAsuStatus('offline', error.message);
            console.error('ASU server check failed:', error);
        }
    }
}

function updateAsuStatus(status, detail, queueLength = null) {
    const statusIndicator = document.getElementById('asu-status-indicator');
    const statusText = document.getElementById('asu-status-text');
    const queueDisplay = document.getElementById('asu-queue-display');
    
    if (!statusIndicator || !statusText) return;
    
    statusIndicator.className = `status-indicator status-${status}`;
    
    const translationKey = `tr-asu-status-${status}`;
    statusText.className = `status-text ${translationKey}`;
    
    const detailText = detail ? ` (${detail})` : '';
    
    if (queueDisplay) {
        if (typeof queueLength === 'number' && queueLength >= 0) {
            const queueTemplate = current_language_json?.['tr-asu-queue'] || 'Queue: {queue}';
            queueDisplay.textContent = '(' + queueTemplate.replace('{queue}', queueLength.toLocaleString()) + ')';
        } else {
            queueDisplay.textContent = '';
        }
    }
    
    if (current_language_json && current_language_json[translationKey]) {
        const baseText = current_language_json[translationKey];
        
        if (status === 'online' && typeof detail === 'number') {
            statusText.textContent = baseText.replace('{status}', detail);
        } else if (status === 'error' && typeof detail === 'number') {
            statusText.textContent = baseText.replace('{status}', detail);
        } else if (status === 'offline') {
            if (detail === 'timeout') {
                statusText.textContent = baseText;
            } else if (typeof detail === 'number') {
                statusText.textContent = baseText.replace('{status}', detail);
            } else {
                statusText.textContent = baseText.replace('{error}', detail || 'Unknown');
            }
        } else {
            statusText.textContent = baseText;
        }
    } else {
        const statusMap = {
            checking: 'Checking...',
            online: `Online${detailText}`,
            offline: `Offline${detailText}`,
            error: `Error${detailText}`
        };
        statusText.textContent = statusMap[status] || 'Unknown';
    }
    
    console.log(`ASU Status updated: ${status} - ${detail || 'no detail'} - Queue: ${queueLength ?? 'N/A'}`);
}

// ==================== 初期化 ====================
async function initializeCustomFeatures(asuSection, temp) {
    console.log('initializeCustomFeatures called');

    if (state.ui.initialized) {
        console.log('Already initialized, skipping');
        return;
    }

    injectSettingsBar(temp);
  
    cleanupExistingCustomElements();
    replaceAsuSection(asuSection, temp);
    
    cacheFrequentlyUsedElements();

    if (!document.querySelector('#extended-build-info')) {
        await insertExtendedInfo(temp);
    }
    
    await fetchAndDisplayIspInfo();
    
    if (state.apiInfo) {
        const extendedInfo = document.querySelector('#extended-build-info');
        if (extendedInfo) {
            extendedInfo.classList.remove('hide');
            console.log('Extended build info displayed');
        }
    }

    await loadPackageManagerConfig();

    await Promise.all([
        loadSetupConfig(),
        loadPackageDatabase()
    ]);

    loadUciDefaultsTemplate();
    setupLanguageSelector();
    setupPackageSearch();
    setupCommandsInput();

    await loadCustomTranslations(current_language);

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

    await checkAsuServerStatus();
    
    state.ui.initialized = true;
    
    console.log('Initialization complete. API Info:', state.apiInfo ? 'Available' : 'Not available');
}

console.log('custom.js (v2.0 - Simplified) fully loaded and ready');

// ==================== Settings Import/Export Bar ====================
function injectSettingsBar(temp) {
    const header = document.querySelector('header');
    if (!header) {
        console.error('Header not found');
        return;
    }
    
    const template = temp.querySelector('#settings-bar-template');
    if (!template) {
        console.error('Settings bar template not found');
        return;
    }
    
    const settingsBar = template.querySelector('#settings-bar');
    const fileInput = template.querySelector('#import-file-input');
    
    if (settingsBar && fileInput) {
        header.insertAdjacentElement('afterend', settingsBar.cloneNode(true));
        document.body.appendChild(fileInput.cloneNode(true));
        console.log('Settings bar injected');
        
        setupImportExport();
    }
}
