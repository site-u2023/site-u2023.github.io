console.log('custom.js loaded');

// ==================== バージョン情報 ====================
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
let customLanguageMap = {};
let kmodsTokenCache = null;
let kmodsTokenCacheKey = null;

// キャッシュマップ
const packageAvailabilityCache = new Map();
const feedCacheMap = new Map();

// デバイスパッケージ
let deviceDefaultPackages = [];
let deviceDevicePackages = [];
let extraPackages = [];

// マネージャー
let packageSearchManager = null;
let commandsManager = null;

// ステートハッシュ
let lastFormStateHash = null;
let lastPackageListHash = null;

// ==================== ヘルパー関数 ====================
const getVendor = () => current_device?.target?.split('/')[0] || null;
const getSubtarget = () => current_device?.target?.split('/')[1] || '';
const splitPackages = str => str.match(/[^\s,]+/g) || [];

// 名前を変更して衝突を防止
const showElement = el => {
    const e = typeof el === 'string' ? document.querySelector(el) : el;
    if (e) { e.classList.remove('hide'); e.style.display = ''; }
};

const hideElement = el => {
    const e = typeof el === 'string' ? document.querySelector(el) : el;
    if (e) { e.classList.add('hide'); e.style.display = 'none'; }
};
const setElementValue = (selector, val) => {
    const el = document.querySelector(selector);
    if (el) el[el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? 'value' : 'innerText'] = val;
};
const getNestedValue = (obj, path) => path.split('.').reduce((current, key) => current?.[key], obj);
const cssEscape = s => String(s).replace(/"/g, '\\"');

// ==================== 初期化処理 ====================
const originalUpdateImages = window.updateImages;

window.updateImages = function(version, mobj) {
    if (originalUpdateImages) originalUpdateImages(version, mobj);

    const oldArch = cachedDeviceArch;
    const oldVersion = current_device?.version;

    if (mobj) {
        if (!current_device) current_device = {};

        if (mobj.arch_packages) {
            current_device.arch = mobj.arch_packages;
            cachedDeviceArch = mobj.arch_packages;
        }
        
        current_device.version = version;
        current_device.target = mobj.target || '';
        if (mobj.id) current_device.id = mobj.id;

        // vendor/subtarget設定
        if (mobj.target) {
            const parts = mobj.target.split('/');
            mobj.vendor = parts[0] || 'unknown';
            mobj.subtarget = parts[1] || '';
        }

        // アーキテクチャ変更時のキャッシュクリア
        if (oldArch !== mobj.arch_packages || oldVersion !== version) {
            packageAvailabilityCache.clear();
            feedCacheMap.clear();

            if (mobj.arch_packages) {
                requestAnimationFrame(() => {
                    const indicator = document.querySelector('#package-loading-indicator');
                    if (indicator) indicator.style.display = 'block';

                    verifyAllPackages().then(() => {
                        if (indicator) indicator.style.display = 'none';
                    }).catch(err => {
                        console.error('Package verification failed:', err);
                        if (indicator) {
                            indicator.innerHTML = '<span class="tr-package-check-failed">Package availability check failed</span>';
                            indicator.addEventListener('click', () => indicator.style.display = 'none', { once: true });
                        }
                    });
                });
            }
        }

        // パッケージリストの保存
        if (!("manifest" in mobj)) {
            deviceDefaultPackages = mobj.default_packages || [];
            deviceDevicePackages = mobj.device_packages || [];
            extraPackages = config.asu_extra_packages || [];

            const initialPackages = [...deviceDefaultPackages, ...deviceDevicePackages, ...extraPackages];
            const textarea = document.querySelector('#asu-packages');
            if (textarea) {
                textarea.value = initialPackages.join(' ');
                requestAnimationFrame(() => {
                    textarea.style.height = 'auto';
                    textarea.style.height = textarea.scrollHeight + 'px';
                });
            }

            if (customInitialized) {
                requestAnimationFrame(() => updateAllPackageState('device-packages-loaded'));
            }
        }
    }

    // カスタムHTML読み込み
    if (!customHTMLLoaded) {
        loadCustomHTML();
        customHTMLLoaded = true;
    } else if (customInitialized && current_device?.arch) {
        const deviceLang = config.device_language || config?.fallback_language || 'en';
        syncDeviceLanguageSelector(deviceLang);
        updateAllPackageState('device-changed-force');
    }
};

// ==================== 統合パッケージ管理 ====================
async function updateAllPackageState(source = 'unknown') {
    if (!customInitialized && deviceDefaultPackages.length === 0 && deviceDevicePackages.length === 0) {
        return;
    }

    const currentState = collectFormValues();
    const hash = JSON.stringify(currentState);

    if (hash === lastFormStateHash && !source.includes('device') && !source.includes('force')) {
        return;
    }
    lastFormStateHash = hash;

    // Setup.json パッケージ更新
    updateSetupJsonPackages();
    
    // 言語パッケージ更新
    await updateLanguagePackages();
    
    // パッケージリスト更新
    updatePackageListToTextarea(source);
    
    // 変数定義更新
    updateVariableDefinitions();
}

function updateSetupJsonPackages() {
    if (!setupConfig) return;
    
    setupConfig.categories.forEach(category => {
        category.packages.forEach(pkg => {
            if (pkg.type === 'radio-group' && pkg.variableName) {
                const selectedValue = getFieldValue(`input[name="${pkg.variableName}"]:checked`);
                if (!selectedValue) return;
                
                // パッケージトグル処理
                const packageMap = {
                    'connection_type': { 'mape': ['map'], 'dslite': ['ds-lite'] },
                    'wifi_mode': { 'usteer': ['usteer-from-setup'] }
                };
                
                const packages = packageMap[pkg.variableName]?.[selectedValue];
                if (packages) {
                    packages.forEach(pkgId => toggleVirtualPackage(pkgId, true));
                }
                
                // AUTO接続時の特別処理
                if (pkg.variableName === 'connection_type' && selectedValue === 'auto' && cachedApiInfo) {
                    if (cachedApiInfo.mape?.brIpv6Address) {
                        toggleVirtualPackage('map', true);
                    } else if (cachedApiInfo.aftr) {
                        toggleVirtualPackage('ds-lite', true);
                    }
                }
            }
        });
    });
}

function toggleVirtualPackage(packageId, enabled) {
    const pkg = findPackageById(packageId);
    if (!pkg) return;
    
    const searchId = pkg.uniqueId || pkg.id;
    const checkbox = document.querySelector(`[data-package="${packageId}"], [data-unique-id="${searchId}"]`);
    
    if (checkbox) {
        checkbox.checked = enabled;
        
        // 依存関係処理
        if (enabled && checkbox.getAttribute('data-dependencies')) {
            checkbox.getAttribute('data-dependencies').split(',').forEach(depId => {
                const depPkg = findPackageById(depId);
                if (depPkg) {
                    const depCheckbox = document.querySelector(`[data-unique-id="${depPkg.uniqueId || depPkg.id}"]`);
                    if (depCheckbox) depCheckbox.checked = true;
                }
            });
        }
    }
}

async function updateLanguagePackages() {
    selectedLanguage = config.device_language || config?.fallback_language || 'en';
    
    // 既存の言語パッケージを削除
    Array.from(dynamicPackages).filter(pkg => pkg.startsWith('luci-i18n-')).forEach(pkg => dynamicPackages.delete(pkg));
    
    if (!selectedLanguage || selectedLanguage === 'en' || !current_device?.arch) return;
    
    const currentPackages = getCurrentPackageList();
    const langPackages = new Set();
    const version = current_device?.version || document.querySelector("#versions")?.value || '';
    const arch = current_device?.arch || cachedDeviceArch || '';
    
    // 基本言語パッケージ
    const basePkgs = [`luci-i18n-base-${selectedLanguage}`, `luci-i18n-firewall-${selectedLanguage}`];
    for (const pkg of basePkgs) {
        if (await isPackageAvailable(pkg, 'luci', version, arch)) langPackages.add(pkg);
    }
    
    // LuCI言語パッケージ
    const checkPromises = currentPackages
        .filter(pkg => pkg.startsWith('luci-') && !pkg.startsWith('luci-i18n-'))
        .map(async pkg => {
            const luciName = extractLuciName(pkg);
            if (luciName) {
                const langPkg = `luci-i18n-${luciName}-${selectedLanguage}`;
                if (await isPackageAvailable(langPkg, 'luci', version, arch)) langPackages.add(langPkg);
            }
        });
    
    await Promise.all(checkPromises);
    langPackages.forEach(pkg => dynamicPackages.add(pkg));
}

function updatePackageListToTextarea(source = 'unknown') {
    if (deviceDefaultPackages.length === 0 && deviceDevicePackages.length === 0 && extraPackages.length === 0) {
        return;
    }

    const packages = new Set([
        ...deviceDefaultPackages,
        ...deviceDevicePackages,
        ...extraPackages
    ]);

    // チェックされたパッケージ
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        if (pkgName) packages.add(pkgName);
    });

    // 検索されたパッケージ
    if (packageSearchManager) {
        packageSearchManager.getAllValues().forEach(pkg => packages.add(pkg));
    }

    // 動的パッケージ
    dynamicPackages.forEach(pkg => packages.add(pkg));

    // 手動追加パッケージ
    const textarea = document.querySelector('#asu-packages');
    if (textarea) {
        const knownPackages = new Set([...packages]);
        splitPackages(textarea.value).forEach(pkg => {
            if (!knownPackages.has(pkg) && !pkg.startsWith('luci-i18n-')) {
                packages.add(pkg);
            }
        });
    }

    const uniquePackages = [...packages];
    const currentHash = JSON.stringify(uniquePackages);
    
    if (currentHash === lastPackageListHash && source !== 'force-update') return;
    lastPackageListHash = currentHash;

    if (textarea) {
        textarea.value = uniquePackages.join(' ');
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }
}

// ==================== マルチインプット管理 ====================
class MultiInputManager {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        
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
        Object.assign(input, {
            type: 'text',
            className: this.options.className,
            placeholder: this.options.placeholder,
            value: value,
            autocomplete: 'off',
            spellcheck: false,
            autocapitalize: 'off'
        });
        
        input.addEventListener('keydown', e => this.handleKeyDown(e, input));
        input.addEventListener('input', e => this.handleInput(e, input));
        input.addEventListener('blur', e => this.handleBlur(e, input));
        
        inputWrapper.appendChild(input);
        this.container.appendChild(inputWrapper);
        this.inputs.push(input);
        
        if (focus) requestAnimationFrame(() => input.focus());
        if (value) this.options.onAdd(value);
        
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
                const prevInput = this.inputs[index - 1];
                prevInput.focus();
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
        if (input.dataset.skipBlur) {
            delete input.dataset.skipBlur;
            return;
        }
        
        const value = input.value.trim();
        const index = this.inputs.indexOf(input);
        
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
            if (value) this.options.onRemove(value);
            this.options.onChange(this.getAllValues());
        }
    }
    
    getAllValues() {
        return this.inputs.map(input => input.value.trim()).filter(Boolean);
    }
    
    setValues(values) {
        this.container.innerHTML = '';
        this.inputs = [];
        
        if (values?.length > 0) {
            values.forEach(value => this.addInput(value, false));
        }
        this.addInput('', false);
    }
}

// ==================== カスタムHTML読み込み ====================
async function loadCustomHTML() {
    try {
        const response = await fetch('custom.html?t=' + Date.now());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        
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

// ==================== カスタム機能初期化 ====================
async function initializeCustomFeatures(asuSection, temp) {
    if (customInitialized) return;

    if (!document.querySelector('#custom-packages-details')) {
        cleanupExistingCustomElements();
        replaceAsuSection(asuSection, temp);
        await insertExtendedInfo(temp);
    }

    // 並列読み込み
    await Promise.all([
        loadSetupConfig(),
        loadPackageDatabase(),
        fetchAndDisplayIspInfo(),
        loadCustomTranslations(current_language)
    ]);

    setupEventListeners();
    loadUciDefaultsTemplate();
    setupLanguageSelector();
    setupPackageSearch();
    setupFormWatchers();

    if (cachedApiInfo) {
        applyIspAutoConfig(cachedApiInfo);
        updateAllPackageState('isp-auto-config');
    }

    generatePackageSelector();

    // 既存デバイスパッケージの適用
    if (deviceDefaultPackages.length > 0 || deviceDevicePackages.length > 0) {
        const textarea = document.querySelector('#asu-packages');
        if (textarea) {
            textarea.value = [...deviceDefaultPackages, ...deviceDevicePackages, ...extraPackages].join(' ');
        }
    }

    customInitialized = true;
}

function cleanupExistingCustomElements() {
    ['#custom-packages-details', '#custom-scripts-details', '#extended-build-info'].forEach(selector => {
        document.querySelector(selector)?.remove();
    });
}

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

    newDiv.insertAdjacentHTML('beforeend', `
        <br>
        <div id="asu-buildstatus" class="hide">
            <span></span>
            <div id="asu-log" class="hide">
                <details>
                    <summary><code>STDERR</code></summary>
                    <pre id="asu-stderr"></pre>
                </details>
                <details>
                    <summary><code>STDOUT</code></summary>
                    <pre id="asu-stdout"></pre>
                </details>
            </div>
        </div>
        <textarea id="asu-packages" style="display:none;"></textarea>
        <a href="javascript:buildAsuRequest()" class="custom-link">
            <span></span><span class="tr-request-build">REQUEST BUILD</span>
        </a>
    `);
    
    asuSection.parentNode.replaceChild(newDiv, asuSection);
}

// ==================== パッケージ検索 ====================
function setupPackageSearch() {
    const searchContainer = document.getElementById('package-search-autocomplete');
    if (!searchContainer) return;
    
    document.getElementById('package-search')?.remove();
    
    packageSearchManager = new MultiInputManager('package-search-autocomplete', {
        placeholder: 'Type package name and press Enter',
        className: 'multi-input-item package-search-input',
        onAdd: () => updateAllPackageState('package-search-add'),
        onRemove: () => updateAllPackageState('package-search-remove'),
        autocomplete: (query, inputElement) => searchPackages(query, inputElement)
    });
}

async function searchPackages(query, inputElement) {
    const arch = current_device?.arch || cachedDeviceArch;
    const version = current_device?.version || document.querySelector("#versions")?.value;
    const vendor = getVendor();
    
    const feeds = query.toLowerCase().startsWith('kmod-') ? (vendor ? ['kmods'] : []) : ['packages', 'luci'];
    const allResults = new Set();
    
    for (const feed of feeds) {
        try {
            const results = await searchInFeed(query, feed, version, arch);
            results.forEach(pkg => allResults.add(pkg));
        } catch (err) {
            console.error(`Error searching ${feed}:`, err);
        }
    }
    
    showPackageSearchResults([...allResults].sort(), inputElement);
}

async function searchInFeed(query, feed, version, arch) {
    const cacheKey = `${version}:${arch}:${feed}`;
    
    let packages = [];
    if (feedCacheMap.has(cacheKey)) {
        packages = feedCacheMap.get(cacheKey);
    } else {
        let url;
        if (feed === 'kmods') {
            const vendor = getVendor();
            if (!vendor) return [];
            url = await buildKmodsUrl(version, vendor, version.includes('SNAPSHOT'));
        } else {
            const template = version.includes('SNAPSHOT') ? config.apk_search_url : config.opkg_search_url;
            url = template.replace('{version}', version).replace('{arch}', arch).replace('{feed}', feed);
        }

        const resp = await fetch(url, { cache: 'force-cache' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        if (feed === 'kmods') {
            const data = await resp.json();
            packages = data.packages ? Object.keys(data.packages) : [];
        } else {
            const text = await resp.text();
            packages = text.split('\n')
                .filter(line => line.startsWith('Package: '))
                .map(line => line.substring(9).trim());
        }

        feedCacheMap.set(cacheKey, packages);
    }

    return packages.filter(pkgName => pkgName.toLowerCase().includes(query.toLowerCase()));
}

function showPackageSearchResults(results, inputElement) {
    clearPackageSearchResults();
    
    if (!results?.length) return;
    
    const container = document.getElementById('package-search-autocomplete');
    if (!container) return;
    
    const resultsDiv = document.createElement('div');
    resultsDiv.className = 'package-search-results';
    
    results.forEach(pkgName => {
        const item = document.createElement('div');
        item.textContent = pkgName;
        
        item.onmousedown = e => {
            e.preventDefault();
            inputElement.dataset.programmaticChange = 'true';
            inputElement.value = pkgName;
            inputElement.setAttribute('data-confirmed', 'true');
            
            if (packageSearchManager.inputs.indexOf(inputElement) === packageSearchManager.inputs.length - 1) {
                packageSearchManager.addInput('', true);
            }
            
            clearPackageSearchResults();
            packageSearchManager.options.onChange(packageSearchManager.getAllValues());
            updateAllPackageState('package-selected');
        };
        
        resultsDiv.appendChild(item);
    });
    
    container.appendChild(resultsDiv);
}

function clearPackageSearchResults() {
    document.querySelectorAll('.package-search-results').forEach(el => el.remove());
}

document.addEventListener('click', e => {
    if (!e.target.closest('#package-search-autocomplete')) {
        clearPackageSearchResults();
    }
});

// ==================== 言語管理 ====================
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
        mainLanguageSelect.removeEventListener('change', handleMainLanguageChange);
        mainLanguageSelect.addEventListener('change', handleMainLanguageChange);
    }
    
    if (customLanguageSelect) {
        customLanguageSelect.value = config.device_language;
        customLanguageSelect.removeEventListener('change', handleCustomLanguageChange);
        customLanguageSelect.addEventListener('change', handleCustomLanguageChange);
    }

    selectedLanguage = config.device_language;
    updateAllPackageState('initial-language');
}

async function handleMainLanguageChange(e) {
    const newLanguage = e?.target?.value || config?.fallback_language || 'en';
    if (newLanguage === current_language) return;

    const isUserAction = e?.isTrusted === true;
    current_language = newLanguage;
    
    await loadCustomTranslations(current_language);

    if (isUserAction) {
        config.device_language = current_language;
        syncDeviceLanguageSelector(config.device_language);
        updateAllPackageState('browser-language-changed');
    }
}

async function handleCustomLanguageChange(e) {
    const newLanguage = e.target.value || config?.fallback_language || 'en';
    if (newLanguage === config.device_language) return;

    config.device_language = newLanguage;
    selectedLanguage = config.device_language;
    updateVariableDefinitions();
    updateAllPackageState('device-language-changed');
}

function syncDeviceLanguageSelector(lang) {
    const customSelect = document.getElementById('aios-language');
    if (lang && customSelect && customSelect.value !== lang) {
        customSelect.removeEventListener('change', handleCustomLanguageChange);
        customSelect.value = lang;
        customSelect.addEventListener('change', handleCustomLanguageChange);
    }
    selectedLanguage = lang;
}

async function loadCustomTranslations(lang) {
    if (!lang) lang = current_language || (navigator.language || config.fallback_language).split('-')[0];
    
    try {
        const resp = await fetch(`langs/custom.${lang}.json`, { cache: 'no-store' });
        if (!resp.ok) {
            if (lang !== config.fallback_language) {
                return loadCustomTranslations(config.fallback_language);
            }
            return;
        }

        customLanguageMap = await resp.json();
        applyCustomTranslations(customLanguageMap);
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
}

function extractLuciName(pkg) {
    if (pkg === 'luci') return 'base';
    if (pkg === 'usteer-from-setup' || pkg === 'luci-app-usteer-setup') return 'usteer';
    
    const match = pkg.match(/^luci-(?:app|mod|theme|proto)-(.+)$/);
    return match?.[1] || null;
}

function getCurrentPackageList() {
    const packages = new Set([
        ...deviceDefaultPackages,
        ...deviceDevicePackages,
        ...extraPackages
    ]);
    
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        if (pkgName) packages.add(pkgName);
    });
    
    if (packageSearchManager) {
        packageSearchManager.getAllValues().forEach(pkg => packages.add(pkg));
    }
    
    dynamicPackages.forEach(pkg => {
        if (!pkg.startsWith('luci-i18n-')) packages.add(pkg);
    });
    
    return [...packages];
}

// ==================== パッケージ検証 ====================
async function isPackageAvailable(pkgName, feed, version, arch) {
    try {
        if (!version) {
            console.warn("isPackageAvailable called without version:", { pkgName, feed, arch });
            return false;
        }

        let url;
        if (feed === 'kmods') {
            const vendor = getVendor();
            if (!vendor) return false;
            url = await buildKmodsUrl(version, vendor, version.includes('SNAPSHOT'));
        } else {
            const template = version.includes('SNAPSHOT') ? config.apk_search_url : config.opkg_search_url;
            url = template.replace('{version}', version).replace('{arch}', arch).replace('{feed}', feed);
        }

        const resp = await fetch(url, { cache: 'force-cache' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        let result = false;

        if (feed === 'kmods') {
            const data = await resp.json();
            result = data.packages && Object.prototype.hasOwnProperty.call(data.packages, pkgName);
        } else {
            const text = await resp.text();
            result = text.split('\n').some(line => line.trim() === `Package: ${pkgName}`);
        }

        return result;
    } catch (err) {
        console.error("Package availability check error:", err);
        return false;
    }
}

async function verifyAllPackages() {
    const arch = current_device?.arch || cachedDeviceArch;
    if (!packagesJson || !arch) return;
    
    const version = current_device?.version || document.querySelector("#versions")?.value || '';
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
    
    const uniquePackages = [...new Map(packagesToVerify.map(p => [`${p.id}:${p.feed}`, p])).values()];
    const BATCH_SIZE = 10;
    
    for (let i = 0; i < uniquePackages.length; i += BATCH_SIZE) {
        const batch = uniquePackages.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async pkg => {
            const isAvailable = await isPackageAvailable(pkg.id, pkg.feed, version, arch);
            if (!pkg.hidden) {
                updatePackageAvailabilityUI(pkg.uniqueId, isAvailable);
            }
        }));
    }
}

function updatePackageAvailabilityUI(uniqueId, isAvailable) {
    const checkbox = document.querySelector(`#pkg-${uniqueId}`);
    if (!checkbox) return;
    
    const packageItem = checkbox.closest('.package-item');
    const label = checkbox.closest('label');
    
    if (!isAvailable) {
        checkbox.checked = false;
        checkbox.disabled = true;
        
        if (packageItem) {
            packageItem.style.display = 'none';
            updateCategoryVisibility(packageItem);
        } else if (label) {
            label.style.display = 'none';
        }
    } else {
        checkbox.disabled = false;
        if (packageItem) packageItem.style.display = '';
        if (label) label.style.display = '';
    }
}

function updateCategoryVisibility(packageItem) {
    const category = packageItem?.closest('.package-category');
    if (!category) return;
    
    const visiblePackages = category.querySelectorAll('.package-item:not([style*="display: none"])');
    category.style.display = visiblePackages.length === 0 ? 'none' : '';
}

function guessFeedForPackage(pkgName) {
    if (pkgName.startsWith('kmod-')) return 'kmods';
    if (pkgName.startsWith('luci-')) return 'luci';
    return 'packages';
}

// ==================== Setup.json処理 ====================
async function loadSetupConfig() {
    try {
        const url = config?.setup_db_path || 'uci-defaults/setup.json';
        const response = await fetch(url + '?t=' + Date.now());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        setupConfig = await response.json();
        formStructure = generateFormStructure(setupConfig);
        storeDefaultValues(setupConfig);
        renderSetupConfig(setupConfig);
        
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
        if (pkg.children) pkg.children.forEach(walkFields);
        if (pkg.type === 'input-group' && pkg.rows) {
            pkg.rows.forEach(row => {
                if (row.columns) row.columns.forEach(walkFields);
            });
        }
    }
    
    config.categories.forEach(category => {
        category.packages.forEach(walkFields);
    });
}

function renderSetupConfig(config) {
    const container = document.querySelector('#dynamic-config-sections');
    if (!container) return;
    
    container.innerHTML = '';

    config.categories?.forEach(category => {
        const section = document.createElement('div');
        section.className = 'config-section';
        section.id = category.id;

        const h4 = document.createElement('h4');
        h4.textContent = category.name || category.id || '';
        if (category.class) h4.classList.add(category.class);
        section.appendChild(h4);
        
        if (category.description) {
            const desc = document.createElement('p');
            desc.className = 'package-category-description';
            desc.textContent = category.description;
            section.appendChild(desc);
        }

        category.packages?.forEach(pkg => {
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
        }
        
        const mapeTypeRadio = document.querySelector('input[name="mape_type"]:checked');
        if (mapeTypeRadio?.value === 'pd') {
            toggleGuaPrefixVisibility('pd');
        }
    });
}

function buildField(parent, pkg) {
    switch (pkg.type) {
        case 'input-group': {
            const rows = getRows(pkg);
            rows.forEach(row => {
                const rowEl = document.createElement('div');
                rowEl.className = 'form-row';
                
                row.columns?.forEach(col => {
                    const groupEl = buildFormGroup(col);
                    if (groupEl) rowEl.appendChild(groupEl);
                });
                
                if (rowEl.children.length > 0) parent.appendChild(rowEl);
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
            
            pkg.options?.forEach(opt => {
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
                if (opt.class) textSpan.classList.add(opt.class);
                
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

            pkg.children?.forEach(child => buildField(condWrap, child));
            parent.appendChild(condWrap);
            break;
        }

        case 'info-display': {
            const infoDiv = document.createElement('div');
            infoDiv.id = pkg.id;
            infoDiv.className = 'info-display';
            if (pkg.class) infoDiv.classList.add(pkg.class);
            Object.assign(infoDiv.style, {
                padding: '1em',
                backgroundColor: 'var(--bg-item)',
                borderRadius: '0.2em',
                marginTop: '0.5em',
                whiteSpace: 'pre-line'
            });
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
    if (field.class) label.classList.add(field.class);
    group.appendChild(label);

    let ctrl;
    if (field.type === 'select') {
        ctrl = document.createElement('select');
        if (field.id) ctrl.id = field.id;
        
        let optionsSource = field.options || [];
        
        // 言語セレクタの特別処理
        if (field.id === 'aios-language') {
            const select = document.querySelector('#languages-select');
            if (select) {
                optionsSource = Array.from(select.querySelectorAll('option')).map(opt => ({
                    value: opt.value,
                    label: opt.textContent
                }));
            }
        }

        optionsSource.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label != null ? opt.label : String(opt.value);
            if (opt.class) option.classList.add(opt.class);
            if (opt.selected || (field.defaultValue != null && opt.value === field.defaultValue)) {
                option.selected = true;
            }
            ctrl.appendChild(option);
        });

        if (field.id !== 'aios-language') {
            ctrl.addEventListener('change', () => updateAllPackageState('form-field'));
        }
    } else {
        ctrl = document.createElement('input');
        ctrl.type = field.type || 'text';
        if (field.id) ctrl.id = field.id;
        if (field.placeholder) ctrl.placeholder = field.placeholder;
        
        // 値の設定
        if (field.defaultValue !== undefined && field.defaultValue !== '') {
            ctrl.value = field.defaultValue;
        } else if (field.apiMapping && cachedApiInfo) {
            const apiValue = getNestedValue(cachedApiInfo, field.apiMapping);
            if (apiValue !== undefined && apiValue !== '') {
                ctrl.value = apiValue;
            }
        }
        
        if (field.min != null) ctrl.min = field.min;
        if (field.max != null) ctrl.max = field.max;
        if (field.maxlength != null) ctrl.maxLength = field.maxlength;
        if (field.pattern != null) ctrl.pattern = field.pattern;
        
        if (field.id !== 'aios-language') {
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

function getRows(group) {
    const rows = [];
    const COLUMNS_PER_ROW = 2;
    const fields = group.fields || [];
    
    for (let i = 0; i < fields.length; i += COLUMNS_PER_ROW) {
        rows.push({
            columns: fields.slice(i, i + COLUMNS_PER_ROW)
        });
    }
    
    return rows;
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
        category.packages.forEach(pkg => collectFieldsFromPackage(pkg, structure, category.id));
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
        pkg.children.forEach(child => collectFieldsFromPackage(child, structure, categoryId));
    }
    
    if (pkg.type === 'input-group') {
        getRows(pkg).forEach(row => {
            row.columns?.forEach(col => collectFieldsFromPackage(col, structure, categoryId));
        });
    }
    
    if (pkg.id === 'connection-type' && pkg.variableName === 'connection_type') {
        ['auto', 'dhcp', 'pppoe', 'dslite', 'mape', 'ap'].forEach(type => {
            structure.connectionTypes[type] = [];
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

function applySpecialFieldLogic(values) {
    const connectionType = getFieldValue('input[name="connection_type"]') || 'auto';
    
    // 接続タイプ別処理
    const connectionHandlers = {
        'auto': () => applyAutoConnection(values),
        'dslite': () => applyDsliteConnection(values),
        'mape': () => applyMapeConnection(values)
    };
    
    connectionHandlers[connectionType]?.();
    
    // Wi-Fiモード処理
    const wifiMode = getFieldValue('input[name="wifi_mode"]');
    const wifiHandlers = {
        'disabled': () => deleteWifiValues(values),
        'standard': () => applyStandardWifi(values),
        'usteer': () => applyUsteerWifi(values)
    };
    
    wifiHandlers[wifiMode]?.();
    
    // ネットワーク最適化処理
    const netOptimizer = getFieldValue('input[name="net_optimizer"]');
    const netHandlers = {
        'disabled': () => deleteNetOptValues(values),
        'auto': () => { values.enable_netopt = '1'; deleteNetOptManualValues(values); },
        'manual': () => applyManualNetOpt(values)
    };
    
    netHandlers[netOptimizer]?.();
}

function applyAutoConnection(values) {
    if (!cachedApiInfo) return;
    
    if (cachedApiInfo.mape?.brIpv6Address) {
        Object.assign(values, {
            mape_br: cachedApiInfo.mape.brIpv6Address,
            mape_ealen: cachedApiInfo.mape.eaBitLength,
            mape_ipv4_prefix: cachedApiInfo.mape.ipv4Prefix,
            mape_ipv4_prefixlen: cachedApiInfo.mape.ipv4PrefixLength,
            mape_ipv6_prefix: cachedApiInfo.mape.ipv6Prefix,
            mape_ipv6_prefixlen: cachedApiInfo.mape.ipv6PrefixLength,
            mape_psid_offset: cachedApiInfo.mape.psIdOffset,
            mape_psidlen: cachedApiInfo.mape.psidlen
        });
        
        const guaPrefix = generateGuaPrefixFromFullAddress(cachedApiInfo);
        if (guaPrefix) values.mape_gua_prefix = guaPrefix;
    } else if (cachedApiInfo.aftr?.aftrIpv6Address) {
        values.dslite_aftr_address = cachedApiInfo.aftr.aftrIpv6Address;
    }
}

function applyDsliteConnection(values) {
    if (cachedApiInfo?.aftr) {
        values.dslite_aftr_address = cachedApiInfo.aftr.aftrIpv6Address || '';
    }
    
    ['#dslite-aftr-type', '#dslite-area', '#dslite-aftr-address'].forEach(id => {
        const value = getFieldValue(id);
        if (value) {
            const key = id.replace('#', '').replace(/-/g, '_');
            values[key] = value;
        }
    });
}

function applyMapeConnection(values) {
    if (cachedApiInfo?.mape) {
        applyAutoConnection(values);
    }
    
    const mapeType = getFieldValue('input[name="mape_type"]');
    if (mapeType === 'pd') {
        delete values.mape_gua_prefix;
    } else if (mapeType === 'gua' && !values.mape_gua_prefix && cachedApiInfo?.ipv6) {
        const guaPrefix = generateGuaPrefixFromFullAddress(cachedApiInfo);
        if (guaPrefix) values.mape_gua_prefix = guaPrefix;
    }
}

function deleteWifiValues(values) {
    ['wlan_ssid', 'wlan_password', 'enable_usteer', 'mobility_domain', 'snr'].forEach(key => delete values[key]);
}

function applyStandardWifi(values) {
    const ssid = getFieldValue('#aios-wifi-ssid');
    const password = getFieldValue('#aios-wifi-password');
    if (ssid) values.wlan_ssid = ssid;
    if (password) values.wlan_password = password;
    delete values.enable_usteer;
    delete values.mobility_domain;
    delete values.snr;
}

function applyUsteerWifi(values) {
    applyStandardWifi(values);
    const mobility = getFieldValue('#aios-wifi-mobility-domain');
    const snr = getFieldValue('#aios-wifi-snr');
    if (mobility) values.mobility_domain = mobility;
    if (snr) values.snr = snr;
    values.enable_usteer = '1';
}

function deleteNetOptValues(values) {
    ['enable_netopt', 'netopt_rmem', 'netopt_wmem', 'netopt_conntrack', 
     'netopt_backlog', 'netopt_somaxconn', 'netopt_congestion'].forEach(key => delete values[key]);
}

function deleteNetOptManualValues(values) {
    ['netopt_rmem', 'netopt_wmem', 'netopt_conntrack', 
     'netopt_backlog', 'netopt_somaxconn', 'netopt_congestion'].forEach(key => delete values[key]);
}

function applyManualNetOpt(values) {
    values.enable_netopt = '1';
    
    const fields = ['netopt-rmem', 'netopt-wmem', 'netopt-conntrack', 
                   'netopt-backlog', 'netopt-somaxconn', 'netopt-congestion'];
    
    fields.forEach(id => {
        const value = getFieldValue(`#${id}`);
        if (value) values[id.replace('-', '_')] = value;
    });
}

// ==================== イベントハンドラ ====================
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
        if (checked) handler({ target: checked });
    });
    
    document.querySelectorAll('input[name="mape_type"]').forEach(radio => {
        radio.addEventListener('change', handleMapeTypeChange);
    });

    setupDsliteAddressComputation();
    setupCommandsInput();
}

function setupCommandsInput() {
    const commandsContainer = document.getElementById('commands-autocomplete');
    if (!commandsContainer) return;
    
    document.getElementById('command')?.remove();
    
    commandsManager = new MultiInputManager('commands-autocomplete', {
        placeholder: 'Type command and press Enter',
        className: 'multi-input-item command-input',
        onAdd: () => updateCustomCommands(),
        onRemove: () => updateCustomCommands(),
        onChange: () => updateCustomCommands()
    });
}

function handleRadioChange(e) {
    const radio = e.target;
    
    if (radio.name === 'mape_type') {
        toggleGuaPrefixVisibility(radio.value);
    }
    
    updateAllPackageState('radio-change');
}

function handleMapeTypeChange(e) {
    const mapeType = e.target.value;
    toggleGuaPrefixVisibility(mapeType);
    
    if (mapeType === 'pd') {
        const guaPrefixField = document.querySelector('#mape-gua-prefix');
        if (guaPrefixField) guaPrefixField.value = '';
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
        updateVariableDefinitions();
    });
    
    aftrArea.addEventListener('change', () => {
        syncAftrAddress(true);
        updateVariableDefinitions();
    });
    
    queueMicrotask(() => syncAftrAddress(false));
}

function handleConnectionTypeChange(e) {
    const selectedType = e.target.value;
    
    const internetCategory = setupConfig.categories.find(cat => cat.id === 'internet-config');
    
    internetCategory.packages.forEach(pkg => {
        if (pkg.type === 'conditional-section' && pkg.showWhen?.field === 'connection_type') {
            const section = document.querySelector(`#${pkg.id}`);
            if (!section) return;
            
            if (pkg.showWhen.values?.includes(selectedType)) {
                show(section);
                
                if (selectedType === 'auto' && cachedApiInfo) {
                    updateAutoConnectionInfo(cachedApiInfo);
                } else if (selectedType === 'mape' && cachedApiInfo?.ipv6) {
                    setGuaPrefixIfAvailable();
                }
            } else {
                hideElement(section);
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
                show(section);
                
                if (mode === 'manual') {
                    restoreManualDefaults();
                }
            } else {
                hideElement(section);
            }
        }
    });
    
    updateAllPackageState('net-optimizer');
}

function handleWifiModeChange(e) {
    const mode = e.target.value;
    
    const wifiCategory = setupConfig.categories.find(cat => cat.id === 'wifi-config');
    
    wifiCategory.packages.forEach(pkg => {
        if (pkg.type === 'conditional-section') {
            const section = document.querySelector(`#${pkg.id}`);
            if (!section) return;
            
            const isVisible = pkg.showWhen?.values?.includes(mode);
            section.style.display = isVisible ? '' : 'none';
            
            if (isVisible && pkg.children) {
                pkg.children.forEach(child => {
                    if (child.type === 'conditional-section') {
                        const childSection = document.querySelector(`#${child.id}`);
                        if (childSection) {
                            childSection.style.display = child.showWhen?.values?.includes(mode) ? '' : 'none';
                        }
                    }
                });
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
            if (el && !el.value) el.value = field.defaultValue;
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
            pkg.children.forEach(child => fields.push(...findWifiFields(child)));
        }
        return fields;
    }
    
    const allWifiFields = [];
    wifiCategory.packages.forEach(pkg => allWifiFields.push(...findWifiFields(pkg)));
    
    allWifiFields.forEach(field => {
        if (field.defaultValue !== undefined && field.defaultValue !== null) {
            const el = document.querySelector(field.selector || `#${field.id}`);
            if (el && !el.value) el.value = field.defaultValue;
        }
    });
}

function clearWifiFields() {
    const wifiCategory = setupConfig.categories.find(cat => cat.id === 'wifi-config');
    
    function clearFields(pkg) {
        if (pkg.type === 'input-group' && pkg.fields) {
            pkg.fields.forEach(field => {
                const el = document.querySelector(field.selector || `#${field.id}`);
                if (el) el.value = '';
            });
        } else if (pkg.children) {
            pkg.children.forEach(clearFields);
        }
    }
    
    wifiCategory.packages.forEach(pkg => {
        if (pkg.variableName !== 'wifi_mode') clearFields(pkg);
    });
}

// ==================== 条件付きセクション ====================
function initConditionalSections(config) {
    const conditionals = collectConditionals(config);
    const deps = buildDeps(conditionals);

    evaluateAll();

    for (const key of Object.keys(deps)) {
        findControlsByKey(key).forEach(el => {
            const evt = el.tagName === 'INPUT' && ['text', 'number', 'password'].includes(el.type) ? 'input' : 'change';
            el.addEventListener(evt, evaluateAll);
        });
    }

    function evaluateAll() {
        for (const cond of conditionals) {
            const visible = evaluateShowWhen(cond.showWhen, getControlValue);
            const el = document.getElementById(cond.id);
            if (el) el.style.display = visible ? '' : 'none';
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
        if (node.type === 'conditional-section' && node.id && node.showWhen?.field) {
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
    if (!showWhen?.field) return true;
    const v = String(getVal(showWhen.field) ?? '');
    return Array.isArray(showWhen.values) ? showWhen.values.map(String).includes(v) : Boolean(v);
}

function walkConfig(config, fn) {
    for (const cat of (config.categories || [])) {
        for (const pkg of (cat.packages || [])) walkNode(pkg, fn);
    }
    function walkNode(node, fn) {
        fn(node);
        if (node.type === 'input-group') {
            getRows(node).forEach(r => (r.columns || []).forEach(col => walkNode(col, fn)));
        } else if (node.type === 'conditional-section') {
            (node.children || []).forEach(ch => walkNode(ch, fn));
        }
    }
}

// ==================== ISP情報処理 ====================
async function fetchAndDisplayIspInfo() {
    if (!config?.auto_config_api_url) return;
    
    try {
        const response = await fetch(config.auto_config_api_url);
        const apiInfo = await response.json();
        cachedApiInfo = apiInfo;
        
        displayIspInfoIfReady();
        updateAutoConnectionInfo(apiInfo);
        setGuaPrefixIfAvailable();
    } catch (err) {
        console.error('Failed to fetch ISP info:', err);
        const autoInfo = document.querySelector('#auto-info');
        if (autoInfo) {
            autoInfo.textContent = 'Failed to detect connection type.\nPlease select manually.';
        }
    }
}

function displayIspInfoIfReady() {
    if (!cachedApiInfo || !document.querySelector('#auto-config-country')) return false;
    
    displayIspInfo(cachedApiInfo);
    return true;
}

function displayIspInfo(apiInfo) {
    if (!apiInfo) return;
    
    setElementValue("#auto-config-country", apiInfo.country || "Unknown");
    setElementValue("#auto-config-timezone", apiInfo.timezone || "Unknown");
    setElementValue("#auto-config-zonename", apiInfo.zonename || "Unknown");
    setElementValue("#auto-config-isp", apiInfo.isp || "Unknown");
    setElementValue("#auto-config-as", apiInfo.as || "Unknown");
    setElementValue("#auto-config-ip", [apiInfo.ipv4, apiInfo.ipv6].filter(Boolean).join(" / ") || "Unknown");
    setElementValue("#auto-config-method", getConnectionType(apiInfo));
    setElementValue("#auto-config-notice", apiInfo.notice || "");
    
    showElement("#extended-build-info");
}

function getConnectionType(apiInfo) {
    if (apiInfo?.mape?.brIpv6Address) return 'MAP-E';
    if (apiInfo?.aftr) return 'DS-Lite';
    return 'DHCP/PPPoE';
}

function updateAutoConnectionInfo(apiInfo) {
    const autoInfo = document.querySelector('#auto-info');
    if (!autoInfo) return;
    
    let infoText = '';
    const connectionType = getConnectionType(apiInfo);
    
    if (connectionType === 'MAP-E') {
        infoText = `Detected: MAP-E
 BR: ${apiInfo.mape.brIpv6Address}
 EA-len: ${apiInfo.mape.eaBitLength}
 IPv4 Prefix: ${apiInfo.mape.ipv4Prefix}/${apiInfo.mape.ipv4PrefixLength}
 IPv6 Prefix: ${apiInfo.mape.ipv6Prefix}/${apiInfo.mape.ipv6PrefixLength}
 PSID: offset=${apiInfo.mape.psIdOffset}
 PSID: length=${apiInfo.mape.psidlen}`;
    } else if (connectionType === 'DS-Lite') {
        infoText = `Detected: DS-Lite\nAFTR: ${apiInfo.aftr}`;
    } else {
        infoText = 'Detected: DHCP/PPPoE\n Standard connection will be used';
    }
    
    if (apiInfo?.isp) {
        infoText += `\n\nISP: ${apiInfo.isp}`;
        if (apiInfo.as) infoText += `\nAS: ${apiInfo.as}`;
    }
    
    autoInfo.textContent = infoText;
}

async function insertExtendedInfo(temp) {
    const extendedInfo = temp.querySelector('#extended-build-info');
    const imageLink = document.querySelector('#image-link');
    
    if (!extendedInfo || !imageLink || document.querySelector('#extended-build-info')) return;
    
    try {
        const infoUrl = config?.information_path || 'auto-config/information.json';
        const response = await fetch(infoUrl + '?t=' + Date.now());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const infoConfig = await response.json();
        
        extendedInfo.innerHTML = '';
        
        infoConfig.categories.forEach(category => {
            const h3 = document.createElement('h3');
            h3.textContent = category.name;
            if (category.class) h3.classList.add(category.class);
            extendedInfo.appendChild(h3);
            
            category.packages.forEach(pkg => {
                pkg.fields?.forEach(field => {
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
            });
        });
        
        imageLink.closest('.row').insertAdjacentElement('afterend', extendedInfo);
        displayIspInfoIfReady();
    } catch (err) {
        console.error('Failed to load information.json:', err);
    }
}

function applyIspAutoConfig(apiInfo) {
    if (!apiInfo || !formStructure?.fields) return false;

    const rawType = getFieldValue('input[name="connection_type"]');
    const connectionType = rawType || 'auto';

    let mutated = false;

    Object.values(formStructure.fields).forEach(field => {
        if (!field.apiMapping) return;

        const isConnectionField = ['dslite', 'mape', 'ap', 'pppoe'].some(type =>
            formStructure.connectionTypes[type]?.includes(field.id)
        );

        if (isConnectionField && connectionType !== 'auto') return;

        let value = getNestedValue(apiInfo, field.apiMapping);

        if (field.variableName === 'mape_gua_prefix') {
            const guaPrefix = generateGuaPrefixFromFullAddress(cachedApiInfo);
            if (guaPrefix) value = guaPrefix;
        }

        if (value !== undefined && value !== '') {
            const element = document.querySelector(field.selector);
            if (element && element.value !== String(value)) {
                element.value = value;
                mutated = true;
            }
        }
    });

    if (mutated) {
        setGuaPrefixIfAvailable();
        updateAutoConnectionInfo(apiInfo);
    }

    return mutated;
}

// ==================== パッケージ管理 ====================
async function loadPackageDatabase() {
    try {
        const url = config?.packages_db_path || 'packages/packages.json';
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        packagesJson = await response.json();
        return packagesJson;
    } catch (err) {
        console.error('Failed to load package database:', err);
        return null;
    }
}

function generatePackageSelector() {
    const container = document.querySelector('#package-categories');
    if (!container || !packagesJson) return;
    
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
            category.packages.forEach(pkg => {
                if (pkg.hidden) createHiddenPackageCheckbox(pkg);
            });
            return;
        }
        
        const categoryDiv = createPackageCategory(category);
        if (categoryDiv) container.appendChild(categoryDiv);
    });
    
    updateAllPackageState('package-selector-init');
    
    const arch = current_device?.arch || cachedDeviceArch;
    if (arch) {
        requestAnimationFrame(() => {
            const indicator = document.querySelector('#package-loading-indicator');
            if (indicator) indicator.style.display = 'block';

            verifyAllPackages().then(() => {
                if (indicator) indicator.style.display = 'none';
            }).catch(err => {
                console.error('Package verification failed:', err);
                if (indicator) {
                    indicator.innerHTML = '<span class="tr-package-check-failed">Package availability check failed</span>';
                    indicator.addEventListener('click', () => indicator.style.display = 'none', { once: true });
                }
            });
        });
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
            packageGrid.appendChild(createPackageItem(pkg));
        }
    });
    
    if (!hasVisiblePackages) return null;
    
    const title = document.createElement('h4');
    title.textContent = category.name;
    if (category.class) title.classList.add(category.class);
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
    
    if (pkg.dependencies?.length) {
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
        if (checkbox) checkbox.setAttribute('data-enable-var', pkg.enableVar);
    }
    
    return packageItem;
}

function createPackageCheckbox(pkg, isChecked = false, isDependency = false) {
    const label = document.createElement('label');
    label.className = 'form-check-label';
    label.setAttribute('for', `pkg-${pkg.uniqueId || pkg.id}`);
    Object.assign(label.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5em',
        cursor: 'pointer'
    });
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `pkg-${pkg.uniqueId || pkg.id}`;
    checkbox.className = 'form-check-input package-selector-checkbox';
    checkbox.setAttribute('data-package', pkg.id);
    checkbox.setAttribute('data-unique-id', pkg.uniqueId || pkg.id);
    
    if (pkg.dependencies) {
        checkbox.setAttribute('data-dependencies', pkg.dependencies.join(','));
    }
    
    checkbox.checked = isChecked;
    checkbox.addEventListener('change', handlePackageSelection);
    
    label.appendChild(checkbox);
    
    if (config?.package_url) {
        const link = document.createElement('a');
        link.href = config.package_url.replace("{id}", encodeURIComponent(pkg.id));
        link.target = '_blank';
        link.className = 'package-link';
        link.textContent = pkg.name || pkg.id;
        link.onclick = e => e.stopPropagation();
        label.appendChild(link);
    } else {
        const span = document.createElement('span');
        span.textContent = pkg.name || pkg.id;
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
    
    if (!textarea) return;

    function autoResize() {
        const lines = textarea.value.split('\n').length;
        textarea.style.height = 'auto';
        textarea.style.height = `${lines * 1}em`;
    }

    textarea.addEventListener('input', autoResize);
    textarea.addEventListener('paste', () => requestAnimationFrame(autoResize));

    fetch(templatePath + '?t=' + Date.now())
        .then(r => {
            if (!r.ok) throw new Error(`Failed to load setup.sh: ${r.statusText}`);
            return r.text();
        })
        .then(text => {
            textarea.value = text;
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

    const values = collectFormValues && typeof collectFormValues === 'function' ? collectFormValues() : null;
    if (!values || typeof values !== 'object' || Object.keys(values).length === 0) return;

    let emissionValues = { ...values };

    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const enableVar = cb.getAttribute('data-enable-var');
        if (enableVar) emissionValues[enableVar] = '1';
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
    return Object.entries(values)
        .map(([key, value]) => {
            const escapedValue = value.toString().replace(/'/g, "'\"'\"'");
            return `${key}='${escapedValue}'`;
        })
        .join('\n');
}

function updateCustomCommands() {
    const textarea = document.querySelector("#custom-scripts-details #uci-defaults-content");
    if (!textarea || !commandsManager) return;
    
    const customCommands = commandsManager.getAllValues().join('\n');
    
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
        textarea.rows = textarea.value.split('\n').length + 1;
    }
}

// ==================== フォーム監視 ====================
function setupFormWatchers() {
    if (!formStructure.fields) return;
    
    Object.values(formStructure.fields).forEach(field => {
        if (field.selector) {
            document.querySelectorAll(field.selector).forEach(element => {
                element.removeEventListener('input', updateVariableDefinitions);
                element.removeEventListener('change', updateVariableDefinitions);
                
                const event = ['radio', 'checkbox'].includes(element.type) || element.tagName === 'SELECT' ? 'change' : 'input';
                element.addEventListener(event, updateVariableDefinitions);
            });
        }
    });
    
    updateVariableDefinitions();
}

// ==================== ユーティリティ関数 ====================
async function buildKmodsUrl(version, vendor, isSnapshot) {
    if (!version || !vendor) {
        throw new Error(`Missing required parameters: version=${version}, vendor=${vendor}`);
    }

    const subtarget = getSubtarget();
    if (!subtarget) {
        throw new Error(`Missing subtarget: version=${version}, vendor=${vendor}`);
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
    
    const resp = await fetch(indexUrl, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`Failed to fetch kmods index: HTTP ${resp.status}`);
    
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
}

function generateGuaPrefixFromFullAddress(apiInfo) {
    if (!apiInfo?.ipv6) return null;
    const ipv6 = apiInfo.ipv6.toLowerCase();

    if (!inCidr(ipv6, '2000::/3')) return null;

    const excludeCidrs = [
        '2001:db8::/32',  // ドキュメンテーション
        '2002::/16',      // 6to4
        '2001::/32',      // Teredo
        '2001:20::/28',   // ORCHIDv2
        '2001:2::/48',    // ベンチマーク
        '2001:3::/32',    // AMT
        '2001:4:112::/48' // AS112-v6
    ];
    if (excludeCidrs.some(cidr => inCidr(ipv6, cidr))) return null;

    const segments = ipv6.split(':');
    if (segments.length >= 4) {
        return `${segments[0]}:${segments[1]}:${segments[2]}:${segments[3]}::/64`;
    }
    return null;
}

function inCidr(ipv6, cidr) {
    const [prefix, bits] = cidr.split('/');
    const addrBin = ipv6ToBinary(ipv6);
    const prefixBin = ipv6ToBinary(prefix);
    return addrBin.substring(0, bits) === prefixBin.substring(0, bits);
}

function ipv6ToBinary(ipv6) {
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
}

function setGuaPrefixIfAvailable() {
    const guaPrefixField = document.querySelector('#mape-gua-prefix');
    if (!guaPrefixField || !cachedApiInfo?.ipv6) return;
    const guaPrefix = generateGuaPrefixFromFullAddress(cachedApiInfo);
    if (guaPrefix) {
        guaPrefixField.value = guaPrefix;
    }
}

function toggleGuaPrefixVisibility(mode) {
    const guaPrefixField = document.querySelector('#mape-gua-prefix');
    if (!guaPrefixField) return;
    const formGroup = guaPrefixField.closest('.form-group');
    if (mode === 'pd') {
        guaPrefixField.value = '';
        guaPrefixField.disabled = true;
        if (formGroup) formGroup.style.display = 'none';
    } else if (mode === 'gua') {
        guaPrefixField.disabled = false;
        if (formGroup) formGroup.style.display = '';
        setGuaPrefixIfAvailable();
    }
}

// ==================== エラーハンドリング ====================
if (window.DEBUG_MODE) {
    ['error', 'unhandledrejection'].forEach(event => {
        window.addEventListener(event, e => console.error(`Custom.js ${event}:`, e.reason || e.error));
    });
}

console.log('custom.js (Optimized Version) fully loaded and ready');
