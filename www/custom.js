console.log('custom.js (v2.0 - Simplified) loaded');

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
        asuPackages: new Map(),
        asuValidation: new Map(),
        lastAsuCheck: null
    },

    dom: {
        textarea: null,
        sizeBreakdown: null,
        packageLoadingIndicator: null,
        dynamicConfigSections: null,
        packageCategories: null,
        autoInfo: null,
        extendedBuildInfo: null
    }
};

// ==================== ユーティリティ ====================
const UI = {
    updateElement(idOrEl, opts = {}) {
        const el = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
        if (!el) return;

        if ('show' in opts) el.style.display = opts.show ? '' : 'none';
        if ('text' in opts) el.textContent = opts.text;
        if ('html' in opts) el.innerHTML = opts.html;
        if ('value' in opts) el.value = opts.value;
        if ('disabled' in opts) el.disabled = !!opts.disabled;
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

        const guaPrefixCheck = "2000::/3";
        const excludeCidrs = [
            "2001:db8::/32",
            "2002::/16",
            "2001::/32",
            "2001:20::/28",
            "2001:2::/48",
            "2001:3::/32",
            "2001:4:112::/48"
        ];

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

    setGuaPrefixIfAvailable: function() {
        const guaPrefixField = document.getElementById('mape-gua-prefix');
        if (!guaPrefixField || !state.apiInfo?.ipv6) return;
        const guaPrefix = this.generateGuaPrefixFromFullAddress(state.apiInfo);
        if (guaPrefix) {
            UI.updateElement(guaPrefixField, { value: guaPrefix });
        }
    },
    
    toggleVisibility(el, show = true) {
        const element = (typeof el === 'string') ? document.querySelector(el) : el;
        if (!element) return;
        
        element.classList.toggle('hide', !show);
        element.style.display = show ? '' : 'none';
    },

    show(el) { this.toggleVisibility(el, true); },
    hide(el) { this.toggleVisibility(el, false); },

    split(str = '') {
        return str.trim().match(/[^\s,]+/g) || [];
    },

    getNestedValue(obj, path) {
        if (!obj || !path) return undefined;
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }
};

// ==================== DOM要素キャッシュ ====================
function cacheFrequentlyUsedElements() {
    state.dom.textarea = document.querySelector('#asu-packages');
    state.dom.sizeBreakdown = document.querySelector('#package-size-breakdown');
    state.dom.packageLoadingIndicator = document.querySelector('#package-loading-indicator');
    state.dom.dynamicConfigSections = document.querySelector('#dynamic-config-sections');
    state.dom.packageCategories = document.querySelector('#package-categories');
    state.dom.autoInfo = document.querySelector('#auto-info');
    state.dom.extendedBuildInfo = document.querySelector('#extended-build-info');
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

        if (mobj.id && mobj.target) {
            updateIrqbalanceByDevice(mobj.id, mobj.target);
        }        
      
        if (oldArch !== mobj.arch_packages || oldVersion !== version || oldDeviceId !== mobj.id) {
            console.log('[TRACE] Device changed, clearing caches');
            
            state.cache.packageAvailability.clear();
            state.cache.feed.clear();
            state.cache.feedPackageSet.clear();
            state.cache.availabilityIndex.clear();
            state.cache.packageSizes.clear();
            
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
        const url = config?.setup_db_path || 'uci-defaults/setup.json';
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
        h4.textContent = category.title || category.id || '';
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
                computeFieldValue(item.id);
            } else if (item.type === 'section' && item.items) {
                for (const subItem of item.items) {
                    if (subItem.type === 'field' && subItem.computed) {
                        console.log(`Found computed field in section: ${subItem.id}`);
                        computeFieldValue(subItem.id);
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
    
    if (field.showWhen) {
        row.setAttribute('data-show-when', JSON.stringify(field.showWhen));
        row.style.display = 'none';
    }

    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.textContent = field.label || field.id || '';
    if (field.id) label.setAttribute('for', field.id);
    if (field.class) label.classList.add(field.class);
    group.appendChild(label);

    let ctrl;
    if (field.fieldType === 'select') {
        ctrl = document.createElement('select');
        if (field.id) ctrl.id = field.id;
        
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
                updateVariableDefinitions();
            });
        } else if (field.id !== 'device-language') {
            ctrl.addEventListener('change', () => updateAllPackageState('form-field'));
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
        } else if (field.computeFrom === 'generateGuaPrefix' && state.apiInfo) {
            const guaPrefix = CustomUtils.generateGuaPrefixFromFullAddress(state.apiInfo);
            if (guaPrefix) setValue = guaPrefix;
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
        
        if (field.id !== 'device-language') {
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

    row.appendChild(group);
    return row;
}

function buildRadioGroup(item) {
    const row = document.createElement('div');
    row.className = 'form-row';

    const group = document.createElement('div');
    group.className = 'form-group';

    if (item.title) {
        const legend = document.createElement('div');
        legend.className = 'form-label';
        if (item.class) legend.classList.add(item.class);
        legend.textContent = item.title;
        group.appendChild(legend);
    }

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
        textSpan.textContent = opt.label || opt.value;
        if (opt.class) textSpan.classList.add(opt.class);
        
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

    if (section.title) {
        const h4 = document.createElement('h4');
        h4.textContent = section.title;
        if (section.class) h4.classList.add(section.class);
        wrapper.appendChild(h4);
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
    div.className = 'info-display';
    if (item.class) div.classList.add(item.class);
    div.textContent = item.content || '';
    
    if (item.showWhen) {
        div.setAttribute('data-show-when', JSON.stringify(item.showWhen));
        div.style.display = 'none';
    }
    
    return div;
}

function computeFieldValue(targetFieldId) {
    const targetField = document.getElementById(targetFieldId);
    if (!targetField) {
        console.error(`computeFieldValue: Target field not found: ${targetFieldId}`);
        return;
    }

    const fieldConfig = findFieldConfig(targetFieldId);
    if (!fieldConfig || !fieldConfig.computed) {
        console.error(`computeFieldValue: No computed config for: ${targetFieldId}`);
        return;
    }

    console.log(`Computing value for: ${targetFieldId}`);

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
    
    if (map[value1] && map[value1][value2]) {
        targetField.value = map[value1][value2];
        console.log(`  → ${targetField.value}`);
        targetField.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
        console.error(`No mapping found for: map[${value1}][${value2}]`);
    }
}

function findFieldByVariable(variableName) {
    if (!state.config.setup) return null;
    
    for (const category of state.config.setup.categories) {
        for (const item of category.items) {
            if (item.type === 'field' && item.variable === variableName) {
                return item;
            } else if (item.type === 'section' && item.items) {
                for (const subItem of item.items) {
                    if (subItem.type === 'field' && subItem.variable === variableName) {
                        return subItem;
                    }
                }
            }
        }
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

    requestAnimationFrame(() => {
        evaluateAllShowWhen();
    });
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
        
        const radioValues = {};
        category.items.forEach(item => {
            if (item.type === 'radio-group' && item.variable) {
                const checkedRadio = document.querySelector(`input[name="${item.variable}"]:checked`);
                if (checkedRadio) {
                    radioValues[item.variable] = checkedRadio.value;
                    console.log(`  Radio value: ${item.variable} = ${checkedRadio.value}`);
                }
            }
        });
        
        let effectiveConnectionType = radioValues.connection_type;
        if (effectiveConnectionType === 'auto' && state.apiInfo) {
            effectiveConnectionType = getConnectionTypeFromApi(state.apiInfo);
            console.log(`  AUTO mode: Using effective type = ${effectiveConnectionType}`);
        }
        
        category.packages.forEach(pkg => {
            if (!pkg.when) return;
            
            const shouldEnable = Object.entries(pkg.when).every(([key, value]) => {
                let actualValue = radioValues[key];
                
                if (key === 'connection_type' && radioValues.connection_type === 'auto') {
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
                toggleVirtualPackage(pkg.id, true);
            } else {
                console.log(`  ✗ Disabling package: ${pkg.id}`);
                toggleVirtualPackage(pkg.id, false);
            }
        });
    }
    
    console.log('=== evaluateInitialPackages END ===');
    
}

function getConnectionTypeFromApi(apiInfo) {
    if (!apiInfo) return 'dhcp';
    
    if (apiInfo.mape?.brIpv6Address) {
        return 'mape';
    }
    
    if (apiInfo.aftr?.aftrIpv6Address) {
        return 'dslite';
    }
    
    return 'dhcp';
}

function handleRadioChange(e) {
    const name = e.target.name;
    const value = e.target.value;
    
    console.log(`Radio changed: ${name} = ${value}`);
    
    evaluateAllShowWhen();
    
    updatePackagesForRadioGroup(name, value);
    
    updateAllPackageState(`radio-${name}`);
    
    if (current_language_json) {
        requestAnimationFrame(() => {
            applyCustomTranslations(current_language_json);
        });
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

function evaluateShowWhen(condition) {
    if (!condition || typeof condition !== 'object') return true;
    
    for (const [key, expectedValue] of Object.entries(condition)) {
        const actualValue = getFieldValue(`input[name="${key}"]:checked`) || 
                          getFieldValue(`#${key}`) ||
                          getFieldValue(`input[name="${key}"]`);
        
        if (Array.isArray(expectedValue)) {
            if (!expectedValue.includes(actualValue)) return false;
        } else {
            if (actualValue !== expectedValue) return false;
        }
    }
    
    return true;
}

function updatePackagesForRadioGroup(radioName, selectedValue) {
    if (!state.config.setup) return;
    
    let effectiveValue = selectedValue;
    if (radioName === 'connection_type' && selectedValue === 'auto' && state.apiInfo) {
        effectiveValue = getConnectionTypeFromApi(state.apiInfo);
        console.log(`AUTO mode in radio change: Using effective type = ${effectiveValue}`);
    }
    
    for (const category of state.config.setup.categories) {
        if (!category.packages) continue;
        
        category.packages.forEach(pkg => {
            if (!pkg.when) return;
            
            const isRelatedToThisRadio = Object.keys(pkg.when).includes(radioName);
            
            if (!isRelatedToThisRadio) {
                return;
            }
            
            const shouldEnable = Object.entries(pkg.when).every(([key, value]) => {
                const valueToCheck = (key === 'connection_type' && selectedValue === 'auto') 
                    ? effectiveValue 
                    : selectedValue;
                
                if (Array.isArray(value)) {
                    return value.includes(valueToCheck);
                }
                return value === valueToCheck;
            });
            
            if (shouldEnable) {
                console.log(`Package enabled by radio: ${pkg.id} for ${radioName}=${effectiveValue}`);
            } else {
                console.log(`Package disabled by radio: ${pkg.id} for ${radioName}=${effectiveValue}`);
            }
            
            toggleVirtualPackage(pkg.id, shouldEnable);
        });
    }
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

    const prefixes = ['luci-i18n-base-', 'luci-i18n-opkg-', 'luci-i18n-package-manager-', 'luci-i18n-firewall-'];

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
        } else if (pkg === 'usteer-from-setup') {
            moduleName = 'usteer';
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
        const baseSet = new Set([...state.packages.default, ...state.packages.device, ...state.packages.extra]);
        const addedPackages = uniquePackages.filter(pkg => !baseSet.has(pkg));
        
        const versionArchPrefix = `${state.device.version}:${state.device.arch}:`;
        
        let totalBytes = 0;
        for (const pkg of addedPackages) {
            const size = state.cache.packageSizes.get(versionArchPrefix + pkg);
            if (typeof size === 'number' && size > 0) {
                totalBytes += size;
            }
        }
        
        let baseBytes = 0;
        for (const pkg of baseSet) {
            const size = state.cache.packageSizes.get(versionArchPrefix + pkg);
            if (typeof size === 'number' && size > 0) {
                baseBytes += size;
            }
        }

        textarea.value = uniquePackages.join(' ');
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
        
        const sizeBreakdownEl = state.dom.sizeBreakdown || document.querySelector('#package-size-breakdown');
        if (sizeBreakdownEl) {
            const isSnapshot = state.device.version && state.device.version.includes('SNAPSHOT');
            const baseMB = isSnapshot ? '---' : (baseBytes / (1024 * 1024)).toFixed(2);
            const addedMB = isSnapshot ? '---' : (totalBytes / (1024 * 1024)).toFixed(2);
            const totalMB = isSnapshot ? '---' : ((baseBytes + totalBytes) / (1024 * 1024)).toFixed(2);
            sizeBreakdownEl.textContent = `${current_language_json['tr-base-size']}: ${baseMB} MB + ${current_language_json['tr-added-size']}: ${addedMB} MB = ${current_language_json['tr-total-size']}: ${totalMB} MB`;
            
            const noteEl = document.querySelector('#package-size-note');
            if (noteEl) {
                if (isSnapshot) {
                    noteEl.classList.remove('tr-package-size-note');
                    noteEl.classList.add('tr-package-size-snapshot-unavailable');
                } else {
                    noteEl.classList.remove('tr-package-size-snapshot-unavailable');
                    noteEl.classList.add('tr-package-size-note');
                }
                applyCustomTranslations(current_language_json);
            }
        }
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

// ==================== フォーム値収集 ====================
function collectFormValues() {
    const values = {};
    
    if (!state.config.setup || !state.config.setup.categories) {
        return values;
    }
    
    const connectionSettingFields = getConnectionSettingFields();

    const wifiModeUI = getFieldValue(`input[name="wifi_mode"]:checked`) || 'standard';
    const netOptUI = getFieldValue(`input[name="net_optimizer"]:checked`) || 'auto';
    const dnsmasqUI = getFieldValue(`input[name="enable_dnsmasq"]:checked`) || 'auto';
    
    const wifiUsteerFields = new Set(['mobility_domain', 'snr']);
    
    const netOptManualFields = new Set(['netopt_rmem', 'netopt_wmem', 'netopt_conntrack', 'netopt_backlog', 'netopt_somaxconn', 'netopt_congestion']);
    
    const dnsmasqManualFields = new Set(['dnsmasq_cache', 'dnsmasq_negcache']);
    
    for (const category of state.config.setup.categories) {
        for (const item of category.items) {
            if (item.type === 'field' && item.variable) {
                if (connectionSettingFields.has(item.variable)) continue;
                
                if (wifiModeUI === 'standard' && wifiUsteerFields.has(item.variable)) continue;
                
                if (wifiModeUI === 'disabled' && (item.variable === 'wlan_ssid' || item.variable === 'wlan_password' || wifiUsteerFields.has(item.variable))) continue;
                
                if ((netOptUI === 'auto' || netOptUI === 'disabled') && netOptManualFields.has(item.variable)) continue;
                
                if ((dnsmasqUI === 'auto' || dnsmasqUI === 'disabled') && dnsmasqManualFields.has(item.variable)) continue;
                
                const value = getFieldValue(`#${item.id}`);
                if (value !== null && value !== undefined && value !== "") {
                    if (item.variable === 'language' && value === 'en') {
                        continue;
                    }
                    values[item.variable] = value;
                }
            } else if (item.type === 'radio-group' && item.variable) {
                const value = getFieldValue(`input[name="${item.variable}"]:checked`);
                if (value !== null && value !== undefined && value !== "") {
                    if (!item.ui_variable) {
                        values[item.variable] = value;
                    }
                }
            } else if (item.type === 'section' && item.items) {
                for (const subItem of item.items) {
                    if (subItem.type === 'field' && subItem.variable) {
                        if (connectionSettingFields.has(subItem.variable)) continue;
                        
                        if (wifiModeUI === 'standard' && wifiUsteerFields.has(subItem.variable)) continue;
                        
                        if (wifiModeUI === 'disabled' && (subItem.variable === 'wlan_ssid' || subItem.variable === 'wlan_password' || wifiUsteerFields.has(subItem.variable))) continue;
                        
                        if ((netOptUI === 'auto' || netOptUI === 'disabled') && netOptManualFields.has(subItem.variable)) continue;
                        
                        if ((dnsmasqUI === 'auto' || dnsmasqUI === 'disabled') && dnsmasqManualFields.has(subItem.variable)) continue;
                        
                        const value = getFieldValue(`#${subItem.id}`);
                        if (value !== null && value !== undefined && value !== "") {
                            values[subItem.variable] = value;
                        }
                    } else if (subItem.type === 'radio-group' && subItem.variable) {
                        const value = getFieldValue(`input[name="${subItem.variable}"]:checked`);
                        if (value !== null && value !== undefined && value !== "") {
                            if (!subItem.ui_variable) {
                                values[subItem.variable] = value;
                            }
                        }
                    }
                }
            }
        }
    }
    
    applySpecialFieldLogic(values);
    
    return values;
}

function getConnectionSettingFields() {
    const fields = new Set();
    
    if (!state.config.setup) return fields;
    
    const connectionCategory = state.config.setup.categories.find(
        cat => cat.id === 'internet-connection'
    );
    
    if (!connectionCategory) return fields;
    
    connectionCategory.items.forEach(item => {
        if (item.type === 'section' && item.items) {
            item.items.forEach(subItem => {
                if (subItem.type === 'field' && subItem.variable) {
                    fields.add(subItem.variable);
                }
            });
        }
    });
    
    return fields;
}

function applySpecialFieldLogic(values) {
    const connectionTypeUI = getFieldValue(`input[name="connection_type"]:checked`) || 'auto';
    let actualConnectionType = connectionTypeUI;
    
    if (connectionTypeUI === 'auto' && state.apiInfo) {
        if (state.apiInfo.mape?.brIpv6Address) {
            actualConnectionType = 'mape';
        } else if (state.apiInfo.aftr?.aftrIpv6Address) {
            actualConnectionType = 'dslite';
        } else {
            actualConnectionType = 'dhcp';
        }
    }
    
    if (actualConnectionType === 'pppoe') {
        values.pppoe = '1';
        const username = getFieldValue('#pppoe-username');
        const password = getFieldValue('#pppoe-password');
        if (username) values.pppoe_username = username;
        if (password) values.pppoe_password = password;
        
    } else if (actualConnectionType === 'dslite') {
        values.dslite = '1';
        
        if (connectionTypeUI === 'auto' && state.apiInfo?.aftr) {
            if (state.apiInfo.aftr.aftrIpv6Address) {
                values.dslite_aftr_address = state.apiInfo.aftr.aftrIpv6Address;
            }
        } else {
            const aftrType = getFieldValue('#dslite-aftr-type');
            const area = getFieldValue('#dslite-area');
            const aftrAddress = getFieldValue('#dslite-aftr-address');
            if (aftrType) values.dslite_aftr_type = aftrType;
            if (area) values.dslite_area = area;
            if (aftrAddress) values.dslite_aftr_address = aftrAddress;
        }
        
    } else if (actualConnectionType === 'mape') {
        values.mape = '1';
        
        if (connectionTypeUI === 'auto' && state.apiInfo?.mape) {
            values.mape_br = state.apiInfo.mape.brIpv6Address;
            values.mape_ealen = state.apiInfo.mape.eaBitLength;
            values.mape_ipv4_prefix = state.apiInfo.mape.ipv4Prefix;
            values.mape_ipv4_prefixlen = state.apiInfo.mape.ipv4PrefixLength;
            values.mape_ipv6_prefix = state.apiInfo.mape.ipv6Prefix;
            values.mape_ipv6_prefixlen = state.apiInfo.mape.ipv6PrefixLength;
            values.mape_psid_offset = state.apiInfo.mape.psIdOffset;
            values.mape_psidlen = state.apiInfo.mape.psidlen;
            
            const guaPrefix = CustomUtils.generateGuaPrefixFromFullAddress(state.apiInfo);
            if (guaPrefix) values.mape_gua_prefix = guaPrefix;
        } else {
            const br = getFieldValue('#mape-br');
            const ealen = getFieldValue('#mape-ealen');
            const ipv4Prefix = getFieldValue('#mape-ipv4-prefix');
            const ipv4Prefixlen = getFieldValue('#mape-ipv4-prefixlen');
            const ipv6Prefix = getFieldValue('#mape-ipv6-prefix');
            const ipv6Prefixlen = getFieldValue('#mape-ipv6-prefixlen');
            const psidOffset = getFieldValue('#mape-psid-offset');
            const psidlen = getFieldValue('#mape-psidlen');
            
            if (br) values.mape_br = br;
            if (ealen) values.mape_ealen = ealen;
            if (ipv4Prefix) values.mape_ipv4_prefix = ipv4Prefix;
            if (ipv4Prefixlen) values.mape_ipv4_prefixlen = ipv4Prefixlen;
            if (ipv6Prefix) values.mape_ipv6_prefix = ipv6Prefix;
            if (ipv6Prefixlen) values.mape_ipv6_prefixlen = ipv6Prefixlen;
            if (psidOffset) values.mape_psid_offset = psidOffset;
            if (psidlen) values.mape_psidlen = psidlen;
            
            const mapeTypeUI = getFieldValue(`input[name="mape_type"]:checked`) || 'gua';
            if (mapeTypeUI === 'gua') {
                const guaPrefixForm = getFieldValue('#mape-gua-prefix');
                if (guaPrefixForm) values.mape_gua_prefix = guaPrefixForm;
            }
        }
        
    } else if (actualConnectionType === 'ap') {
        values.ap = '1';
        const apIp = getFieldValue('#ap-ip-address');
        const apGw = getFieldValue('#ap-gateway');
        if (apIp) values.ap_ip_address = apIp;
        if (apGw) values.ap_gateway = apGw;
    }
    
    const wifiModeUI = getFieldValue(`input[name="wifi_mode"]:checked`) || 'standard';
    if (wifiModeUI === 'usteer') {
        values.enable_usteer = '1';
    }
    
    const netOptUI = getFieldValue(`input[name="net_optimizer"]:checked`) || 'auto';
    if (netOptUI === 'auto' || netOptUI === 'manual') {
        values.enable_netopt = '1';
    }
    
    const dnsmasqUI = getFieldValue(`input[name="enable_dnsmasq"]:checked`) || 'auto';
    if (dnsmasqUI === 'auto' || dnsmasqUI === 'manual') {
        values.enable_dnsmasq = '1';
    }
}

function collectConnectionFields() {
    const fields = [];
    const category = state.config.setup?.categories?.find(cat => cat.id === 'internet-connection');
    if (!category) return fields;
    
    category.items.forEach(item => {
        if (item.type === 'section' && item.items) {
            item.items.forEach(subItem => {
                if (subItem.type === 'field' && subItem.variable) {
                    fields.push(subItem.variable);
                } else if (subItem.type === 'radio-group' && subItem.variable) {
                    fields.push(subItem.variable);
                }
            });
        }
    });
    
    return fields;
}

function getFieldsForConnectionType(type) {
    const category = state.config.setup?.categories?.find(cat => cat.id === 'internet-connection');
    if (!category) return [];
    
    const fields = ['connection_type'];
    
    if (type === 'auto' || type === 'dhcp') {
        return fields;
    }
    
    const section = category.items.find(item => 
        item.type === 'section' && 
        item.showWhen && 
        (item.showWhen.connection_type === type || 
         (Array.isArray(item.showWhen.connection_type) && item.showWhen.connection_type.includes(type)))
    );
    
    if (!section || !section.items) return fields;
    
    section.items.forEach(item => {
        if (item.type === 'field' && item.variable) {
            fields.push(item.variable);
        } else if (item.type === 'radio-group' && item.variable) {
            fields.push(item.variable);
        }
    });
    
    return fields;
}

function collectWifiFields() {
    const fields = [];
    const category = state.config.setup?.categories?.find(cat => cat.id === 'wifi-config');
    if (!category) return fields;
    
    category.items.forEach(item => {
        if (item.type === 'field' && item.variable) {
            fields.push(item.variable);
        }
    });
    
    return fields;
}

function getFieldsForWifiMode(mode) {
    const fields = ['wifi_mode'];
    
    if (mode === 'disabled') {
        return fields;
    }
    
    fields.push('wlan_ssid', 'wlan_password');
    
    if (mode === 'usteer') {
        fields.push('mobility_domain', 'snr');
    }
    
    return fields;
}

function collectNetOptFields() {
    const fields = [];
    const category = state.config.setup?.categories?.find(cat => cat.id === 'tuning-config');
    if (!category) return fields;
    
    category.items.forEach(item => {
        if (item.type === 'section' && item.id && item.id.includes('netopt')) {
            if (item.items) {
                item.items.forEach(subItem => {
                    if (subItem.type === 'field' && subItem.variable) {
                        fields.push(subItem.variable);
                    }
                });
            }
        }
    });
    
    return fields;
}

function getFieldsForNetOptMode(mode) {
    const fields = ['net_optimizer'];
    
    if (mode === 'disabled') {
        return fields;
    }
    
    if (mode === 'manual') {
        fields.push('netopt_rmem', 'netopt_wmem', 'netopt_conntrack', 
                   'netopt_backlog', 'netopt_somaxconn', 'netopt_congestion');
    }
    
    return fields;
}

function collectDnsmasqFields() {
    const fields = [];
    const category = state.config.setup?.categories?.find(cat => cat.id === 'tuning-config');
    if (!category) return fields;
    
    category.items.forEach(item => {
        if (item.type === 'section' && item.id && item.id.includes('dnsmasq')) {
            if (item.items) {
                item.items.forEach(subItem => {
                    if (subItem.type === 'field' && subItem.variable) {
                        fields.push(subItem.variable);
                    }
                });
            }
        }
    });
    
    return fields;
}

function getFieldsForDnsmasqMode(mode) {
    const fields = ['enable_dnsmasq'];
    
    if (mode === 'disabled') {
        return fields;
    }
    
    if (mode === 'manual') {
        fields.push('dnsmasq_cache', 'dnsmasq_negcache');
    }
    
    return fields;
}


// ==================== UCI-defaults処理 ====================
function updateVariableDefinitions() {
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    if (!textarea) return;

    const values = collectFormValues();
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
        if (value === 'disabled' || value === '' || value === null || value === undefined) {
            return;
        }
        const escapedValue = value.toString().replace(/'/g, "'\"'\"'");
        lines.push(`${key}='${escapedValue}'`);
    });
    return lines.join('\n');
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
            sizeElement.style.color = '#00cc00';
        }
    }
    
    return lines;
}

function loadUciDefaultsTemplate() {
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    const templatePath = 'uci-defaults/setup.sh';
    
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

// ==================== ISP情報処理 ====================
function getConnectionType(apiInfo) {
    if (apiInfo?.mape?.brIpv6Address) return 'MAP-E';
    if (apiInfo?.aftr) return 'DS-Lite';
    return 'DHCP/PPPoE';
}

async function fetchAndDisplayIspInfo() {
    if (!config?.auto_config_api_url) {
        console.log('Auto config API URL not configured');
        return;
    }
    
    try {
        const response = await fetch(config.auto_config_api_url);
        const apiInfo = await response.json();
        state.apiInfo = apiInfo;
        
        console.log('ISP info fetched:', apiInfo);
        
        displayIspInfo(apiInfo);
        updateAutoConnectionInfo(apiInfo);
        CustomUtils.setGuaPrefixIfAvailable();

    } catch (err) {
        console.error('Failed to fetch ISP info:', err);
    }
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

    const extendedInfo = document.getElementById("extended-build-info");
    if (extendedInfo) {
        extendedInfo.classList.remove('hide');
        extendedInfo.style.display = '';
        console.log('Extended build info shown');
    }
}

function updateAutoConnectionInfo(apiInfo) {
    const autoInfo = document.querySelector('#auto-info');
    if (!autoInfo) return;
    
    const connectionType = getConnectionType(apiInfo);
    
    let infoText = '';
    if (apiInfo?.isp) {
        infoText += `ISP: ${apiInfo.isp}<br>`;
        if (apiInfo.as) {
            infoText += `AS: ${apiInfo.as}<br>`;
        }
    }
    
    if (connectionType === 'MAP-E') {
        let gua = CustomUtils.generateGuaPrefixFromFullAddress(apiInfo);
        if (!gua) {
            const guaField = document.querySelector('#mape-gua-prefix');
            if (guaField && guaField.value) gua = guaField.value;
        }
        
        infoText += `<hr>`;
        infoText += `<p><span class="tr-mape-notice1">Note: Actual values may differ.</span></p>`;
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
        infoText += `(config-softwire)# <strong>map-version draft</strong><br>`;
        infoText += `(config-softwire)# <strong>rule &lt;0-65535&gt; ipv4-prefix ${apiInfo.mape.ipv4Prefix}/${apiInfo.mape.ipv4PrefixLength} ipv6-prefix ${apiInfo.mape.ipv6Prefix}/${apiInfo.mape.ipv6PrefixLength}</strong> [ea-length ${apiInfo.mape.eaBitLength}|psid-length ${apiInfo.mape.psidlen}] [offset ${apiInfo.mape.psIdOffset}] [forwarding]<br>`;
        infoText += `<hr>`;
        infoText += `<div style="text-align: center;"><a href="https://ipv4.web.fc2.com/map-e.html" target="_blank">Powered by config-softwire</a></div>`;     
    } else if (connectionType === 'DS-Lite') {
        infoText += `<hr>`;
        infoText += `<h4><span class="tr-dslite-notice1">Note: Actual values may differ.</span></h4>`;
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
        infoText += `<span class="tr-standard-notice">Standard connection will be used</span>`;
    }
    
    autoInfo.innerHTML = infoText;
    applyCustomTranslations(current_language_json);
}

function applyIspAutoConfig(apiInfo) {
    if (!apiInfo || !state.config.setup) return false;

    let mutated = false;

    for (const category of state.config.setup.categories) {
        for (const item of category.items) {
            if (item.type === 'field' && item.apiSource && item.id) {
                const element = document.getElementById(item.id);
                if (!element) continue;

                let value = CustomUtils.getNestedValue(apiInfo, item.apiSource);

                if (item.computeFrom === 'generateGuaPrefix') {
                    const guaPrefix = CustomUtils.generateGuaPrefixFromFullAddress(apiInfo);
                    if (guaPrefix) value = guaPrefix;
                }

                if (value !== null && value !== undefined && value !== '') {
                    if (element.value !== String(value)) {
                        UI.updateElement(element, { value: value });
                        mutated = true;
                    }
                }
            } else if (item.type === 'section' && item.items) {
                for (const subItem of item.items) {
                    if (subItem.type === 'field' && subItem.apiSource && subItem.id) {
                        const element = document.getElementById(subItem.id);
                        if (!element) continue;

                        let value = CustomUtils.getNestedValue(apiInfo, subItem.apiSource);

                        if (subItem.computeFrom === 'generateGuaPrefix') {
                            const guaPrefix = CustomUtils.generateGuaPrefixFromFullAddress(apiInfo);
                            if (guaPrefix) value = guaPrefix;
                        }

                        if (value !== null && value !== undefined && value !== '') {
                            if (element.value !== String(value)) {
                                UI.updateElement(element, { value: value });
                                mutated = true;
                            }
                        }
                    }
                }
            }
        }
    }

    if (mutated) {
        CustomUtils.setGuaPrefixIfAvailable();
        updateAutoConnectionInfo(apiInfo);
    }

    return mutated;
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
        const infoUrl = 'auto-config/information.json';
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

        console.log('Extended info DOM elements created');

        if (state.apiInfo) {
            displayIspInfo(state.apiInfo);
        }

    } catch (err) {
        console.error('Failed to load information.json:', err);
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
    const newLanguage = e?.target?.value || config?.fallback_language || 'en';
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
    const newLanguage = e.target.value || config?.fallback_language || 'en';
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
    
    if (!state.cache.originalAutoDetectionText) {
        state.cache.originalAutoDetectionText = map['tr-auto-detection'];
    }
    
    if (state.apiInfo && map['tr-auto-detection']) {
        const connectionType = getConnectionType(state.apiInfo);
        if (connectionType) {
            map['tr-auto-detection'] = state.cache.originalAutoDetectionText + ': ' + connectionType;
        }
    }
    
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

// ==================== パッケージ検索 ====================
function setupPackageSearch() {
    console.log('setupPackageSearch called (ASU enhanced)');
    
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
            searchPackagesImproved(query, inputElement);
        }
    });
    
    console.log('Package search setup complete (ASU enhanced)');
}

async function fetchPackagesFromASU(version, target) {
    const cacheKey = `asu:${version}:${target}`;
    
    if (state.cache.asuPackages && state.cache.asuPackages.has(cacheKey)) {
        console.log('Using cached ASU packages');
        return state.cache.asuPackages.get(cacheKey);
    }
    
    try {
        const url = `${config.asu_url}/api/v1/packages/${version}/${target}`;
        console.log('Fetching packages from ASU API:', url);
        
        const response = await fetch(url, { cache: 'force-cache' });
        if (!response.ok) {
            throw new Error(`ASU API returned ${response.status}`);
        }
        
        const data = await response.json();
        
        const packagesInfo = {
            packages: new Map(),
            totalSize: 0
        };
        
        if (data.packages) {
            for (const [name, info] of Object.entries(data.packages)) {
                packagesInfo.packages.set(name, {
                    name: name,
                    version: info.version || '',
                    size: info.size || 0,
                    depends: info.depends || [],
                    sha256sum: info.sha256sum || ''
                });
                
                const sizeCacheKey = `${version}:${state.device.arch}:${name}`;
                if (info.size) {
                    state.cache.packageSizes.set(sizeCacheKey, info.size);
                }
            }
        }
        
        if (!state.cache.asuPackages) {
            state.cache.asuPackages = new Map();
        }
        state.cache.asuPackages.set(cacheKey, packagesInfo);
        
        console.log(`ASU API: Loaded ${packagesInfo.packages.size} packages`);
        return packagesInfo;
        
    } catch (error) {
        console.error('Failed to fetch from ASU API, falling back to direct fetch:', error);
        return await fetchPackagesLegacy(version, target);
    }
}

async function fetchPackagesLegacy(version, target) {
    const feeds = ['base', 'packages', 'luci', 'routing', 'telephony'];
    const allPackages = new Map();
    
    for (const feed of feeds) {
        try {
            const packages = await getFeedPackageSet(feed, {
                version,
                arch: state.device.arch,
                vendor: state.device.vendor,
                subtarget: state.device.subtarget,
                isSnapshot: version.includes('SNAPSHOT')
            });
            
            packages.forEach(pkg => {
                allPackages.set(pkg, { name: pkg, size: 0, depends: [] });
            });
        } catch (err) {
            console.error(`Failed to fetch ${feed}:`, err);
        }
    }
    
    return { packages: allPackages, totalSize: 0 };
}

async function searchPackages(query, inputElement) {
    const arch = state.device.arch;
    const version = state.device.version || document.querySelector("#versions")?.value;
    const vendor = state.device.vendor;
    
    const allResults = new Set();
    
    let feeds;
    if (query.toLowerCase().startsWith('kmod-')) {
        feeds = vendor ? ['kmods'] : [];
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

            const resp = await fetch(url, { cache: 'force-cache' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

            const isSnapshot = version.includes('SNAPSHOT');

            let list = [];
            if (isSnapshot) {
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

async function searchPackagesImproved(query, inputElement) {
    const version = state.device.version || document.querySelector("#versions")?.value;
    const target = state.device.target;
    
    if (!version || !target) {
        console.warn('Version or target not available');
        return;
    }
    
    try {
        const packagesInfo = await fetchPackagesFromASU(version, target);
        
        const q = query.toLowerCase();
        const results = [];
        
        packagesInfo.packages.forEach((info, name) => {
            if (name.toLowerCase().includes(q)) {
                results.push({
                    name: name,
                    size: info.size,
                    version: info.version
                });
            }
        });
        
        results.sort((a, b) => {
            const aLower = a.name.toLowerCase();
            const bLower = b.name.toLowerCase();
            
            const aExact = (aLower === q);
            const bExact = (bLower === q);
            if (aExact && !bExact) return -1;
            if (bExact && !aExact) return 1;
            
            const aPrefix = aLower.startsWith(q);
            const bPrefix = bLower.startsWith(q);
            if (aPrefix && !bPrefix) return -1;
            if (bPrefix && !aPrefix) return 1;
            
            return a.name.localeCompare(b.name);
        });
        
        console.log(`Found ${results.length} packages matching "${query}"`);
        
        showPackageSearchResultsWithSize(results, inputElement);
        
    } catch (error) {
        console.error('Package search failed:', error);
        await searchPackages(query, inputElement);
    }
}

function showPackageSearchResultsWithSize(results, inputElement) {
    clearPackageSearchResults();
    
    if (!results || results.length === 0) return;
    
    const container = document.getElementById('package-search-autocomplete');
    if (!container) return;
    
    const resultsDiv = document.createElement('div');
    resultsDiv.className = 'package-search-results';
    
    results.forEach(pkg => {
        const item = document.createElement('div');
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = pkg.name;
        nameSpan.style.fontWeight = '500';
        
        const sizeSpan = document.createElement('span');
        if (pkg.size > 0) {
            const sizeKB = (pkg.size / 1024).toFixed(1);
            sizeSpan.textContent = ` (${sizeKB} KB)`;
            sizeSpan.style.color = 'var(--text-muted)';
            sizeSpan.style.fontSize = '0.9em';
        }
        
        item.appendChild(nameSpan);
        item.appendChild(sizeSpan);
        
        item.onmousedown = (e) => {
            e.preventDefault();
            
            console.log('Package selected:', pkg.name, pkg.size > 0 ? `(${(pkg.size / 1024).toFixed(1)} KB)` : '');
            
            try {
                inputElement.dataset.programmaticChange = 'true';
                inputElement.value = pkg.name;
                inputElement.setAttribute('data-confirmed', 'true');
                
                const inputIndex = state.ui.managers.packageSearch.inputs.indexOf(inputElement);
                if (inputIndex === state.ui.managers.packageSearch.inputs.length - 1) {
                    state.ui.managers.packageSearch.addInput('', true);
                }
                
                clearPackageSearchResults();
                state.ui.managers.packageSearch.options.onChange(
                    state.ui.managers.packageSearch.getAllValues()
                );
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

// ==================== パッケージ存在確認 ====================
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
                            feed: guessFeedForPackage(depPkg.id),
                            hidden: depPkg.hidden || false,
                            isDependency: true,
                            virtual: depPkg.virtual || false
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
            console.warn('[WARN] kmods feed required but vendor/subtarget missing');
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

function isAvailableInIndex(pkgName, feed, index) {
    return index.packages.has(pkgName) || 
           index.luci.has(pkgName) || 
           index.base.has(pkgName) || 
           index.target.has(pkgName) || 
           index.kmods.has(pkgName);
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

async function updateIrqbalanceByDevice(deviceId, target) {
    const checkbox = document.querySelector('[data-package="luci-app-irqbalance"]');
    if (!checkbox) return;
    
    const data = await fetchToHData();
    if (!data?.entries || !data?.columns) return;

    const idx = {
        deviceId: data.columns.indexOf('deviceid'),
        target: data.columns.indexOf('target'),
        subtarget: data.columns.indexOf('subtarget'),
        cpuCores: data.columns.indexOf('cpucores')
    };

    const device = data.entries.find(entry => {
        const entryDeviceId = entry[idx.deviceId];
        const entryTarget = entry[idx.target];
        const entrySubtarget = entry[idx.subtarget];
        const fullTarget = entryTarget && entrySubtarget ? `${entryTarget}/${entrySubtarget}` : entryTarget;
        return entryDeviceId === deviceId || fullTarget === target;
    });

    if (!device) return;

    const cores = parseInt(device[idx.cpuCores], 10);
    if (isNaN(cores)) return;

    const shouldBeEnabled = cores >= 2;
    
    if (checkbox.checked !== shouldBeEnabled) {
        checkbox.checked = shouldBeEnabled;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        requestAnimationFrame(() => updateAllPackageState('irqbalance-auto-check'));
    }
}

// ==================== パッケージデータベース ====================
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
    
    console.log(`Generated ${state.packages.json.categories.length} package categories (including hidden)`);
    
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

            verifyAllPackagesImproved().then(() => {
                if (indicator) {
                    UI.updateElement(indicator, { show: false });
                }
                console.log('Package verification completed (ASU API)');
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

    console.log('Commands input setup complete');
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

// ==================== 初期化 ====================
async function initializeCustomFeatures(asuSection, temp) {
    console.log('initializeCustomFeatures called');

    if (state.ui.initialized) {
        console.log('Already initialized, skipping');
        return;
    }

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

    setupBuildValidation();

    state.ui.initialized = true;
    
    console.log('Initialization complete. API Info:', state.apiInfo ? 'Available' : 'Not available');
}

async function validateBuildConfiguration() {
    if (!config.asu_url || !state.device.version || !state.device.target) {
        console.warn('Cannot validate: missing configuration');
        return { valid: true, warnings: [], errors: [] };
    }
    
    const allPackages = getCurrentPackageListForLanguage();
    
    const defaultPackages = new Set([
        ...state.packages.default,
        ...state.packages.device,
        ...state.packages.extra
    ]);
    
    const packagesToValidate = allPackages.filter(pkg => !defaultPackages.has(pkg));
    
    console.log('Validating packages:', {
        total: allPackages.length,
        default: defaultPackages.size,
        toValidate: packagesToValidate.length
    });
    
    if (packagesToValidate.length === 0) {
        console.log('No additional packages to validate');
        return { valid: true, warnings: [], errors: [] };
    }
    
    const cacheKey = `${state.device.version}:${state.device.target}:${packagesToValidate.join(',')}`;
    
    if (state.cache.asuValidation && state.cache.asuValidation.has(cacheKey)) {
        console.log('Using cached validation result');
        return state.cache.asuValidation.get(cacheKey);
    }
    
    try {
        const packagesInfo = await fetchPackagesFromASU(state.device.version, state.device.target);
        
        const validation = {
            valid: true,
            warnings: [],
            errors: []
        };
        
        const unavailable = [];
        packagesToValidate.forEach(pkg => {
            if (!packagesInfo.packages.has(pkg)) {
                unavailable.push(pkg);
            }
        });
        
        if (unavailable.length > 0) {
            const langPackages = unavailable.filter(pkg => pkg.startsWith('luci-i18n-'));
            const otherPackages = unavailable.filter(pkg => !pkg.startsWith('luci-i18n-'));
            
            if (otherPackages.length > 0) {
                validation.errors.push(
                    `The following packages are not available:\n${otherPackages.join(', ')}`
                );
                validation.valid = false;
            }
            
            if (langPackages.length > 0) {
                validation.warnings.push(
                    `Some language packages are not available: ${langPackages.length} package(s)`
                );
            }
        }
        
        let totalSize = 0;
        packagesToValidate.forEach(pkg => {
            const info = packagesInfo.packages.get(pkg);
            if (info && info.size) {
                totalSize += info.size;
            }
        });
        
        if (totalSize > 0) {
            const totalMB = totalSize / (1024 / 1024);
            if (totalMB > 50) {
                validation.warnings.push(
                    `Additional packages total approximately ${totalMB.toFixed(1)} MB. ` +
                    `Please ensure your device has sufficient storage.`
                );
            }
        }
        
        if (!state.cache.asuValidation) {
            state.cache.asuValidation = new Map();
        }
        state.cache.asuValidation.set(cacheKey, validation);
        
        console.log('Validation result:', validation);
        
        return validation;
        
    } catch (error) {
        console.error('Build validation failed:', error);
        return {
            valid: true,
            warnings: ['Build validation unavailable - proceeding with build'],
            errors: []
        };
    }
}

function setupBuildValidation() {
    const buildButton = document.querySelector('a[href="javascript:buildAsuRequest()"]');
    if (!buildButton) {
        console.log('Build button not found, will retry...');
        setTimeout(setupBuildValidation, 500);
        return;
    }
    
    console.log('Setting up build validation hook');
    
    buildButton.removeAttribute('href');
    buildButton.style.cursor = 'pointer';
    
    buildButton.addEventListener('click', async (e) => {
        e.preventDefault();
        
        console.log('Build button clicked, validating...');
        
        const validation = await validateBuildConfiguration();
        
        if (!validation.valid) {
            const errorMsg = validation.errors.join('\n');
            alert(`Build Validation Failed:\n\n${errorMsg}`);
            console.error('Build validation failed:', validation.errors);
            return;
        }
        
        if (validation.warnings.length > 0) {
            const warningMsg = validation.warnings.join('\n');
            const proceed = confirm(`Build Warnings:\n\n${warningMsg}\n\nDo you want to continue?`);
            if (!proceed) {
                console.log('Build cancelled by user');
                return;
            }
        }
        
        console.log('Validation passed, starting build...');
        buildAsuRequest();
    });
    
    console.log('Build validation hook installed');
}

console.log('custom.js (v2.0 - Simplified) fully loaded and ready');
