console.log('custom.js loaded');

// ==================== グローバル設定アクセス ====================
const Config = {
    _cache: null,
    
    async load() {
        if (this._cache) return this._cache;
        
        try {
            const response = await fetch('uci-defaults/setup.json?t=' + Date.now());
            const data = await response.json();
            this._cache = data;
            return data;
        } catch (err) {
            console.error('Failed to load setup.json:', err);
            return null;
        }
    },
    
    get(path, defaultValue = null) {
        if (!this._cache) return defaultValue;
        return path.split('.').reduce((obj, key) => obj?.[key], this._cache) ?? defaultValue;
    },
    
    getConfig(key) {
        return this.get(`config.${key}`);
    }
};

// ==================== 状態管理（簡潔版） ====================
const state = {
    device: {},
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
        setup: null
    },
    ui: {
        initialized: false,
        language: {},
        managers: {}
    },
    cache: new Map()
};

// ==================== ユーティリティ（簡潔版） ====================
const UI = {
    update(el, opts = {}) {
        const element = typeof el === 'string' ? document.getElementById(el) : el;
        if (!element) return;
        
        Object.entries(opts).forEach(([key, value]) => {
            switch(key) {
                case 'show': element.style.display = value ? '' : 'none'; break;
                case 'text': element.textContent = value; break;
                case 'html': element.innerHTML = value; break;
                case 'value': element.value = value; break;
                case 'disabled': element.disabled = !!value; break;
            }
        });
    }
};

const CustomUtils = {
    async getVirtualPackages(type, value) {
        const mappings = Config.getConfig('packageMappings');
        return mappings?.[type]?.[value] || [];
    },
    
    async guessFeedForPackage(pkgName) {
        if (!pkgName) return Config.getConfig('feedRules.defaultFeed');
        
        const patterns = Config.getConfig('feedRules.patterns') || [];
        for (const rule of patterns) {
            if (pkgName.startsWith(rule.prefix)) {
                return rule.feed;
            }
        }
        return Config.getConfig('feedRules.defaultFeed');
    },
    
    async getConnectionType(apiInfo) {
        const types = Config.getConfig('connectionTypes.detection');
        if (!types) return 'Unknown';
        
        for (const [key, rule] of Object.entries(types)) {
            if (key === 'default') continue;
            if (this.getNestedValue(apiInfo, rule.check)) {
                return rule.displayName;
            }
        }
        return types.default?.displayName || 'Unknown';
    },
    
    async generateGuaPrefixFromFullAddress(apiInfo) {
        if (!apiInfo?.ipv6) return null;
        
        const ipv6Config = Config.getConfig('ipv6');
        if (!ipv6Config) return null;
        
        const ipv6 = apiInfo.ipv6.toLowerCase();
        
        // GUAプレフィックスチェック
        if (!this.inCidr(ipv6, ipv6Config.guaPrefixCheck)) return null;
        
        // 除外リストチェック
        if (ipv6Config.excludeCidrs?.some(cidr => this.inCidr(ipv6, cidr))) return null;
        
        const segments = ipv6.split(':');
        if (segments.length >= 4) {
            return `${segments[0]}:${segments[1]}:${segments[2]}:${segments[3]}::/64`;
        }
        return null;
    },
    
    inCidr(ipv6, cidr) {
        // 簡略化されたCIDRチェック実装
        const [prefix, bits] = cidr.split('/');
        // 実装省略
        return false;
    },
    
    getNestedValue(obj, path) {
        if (!obj || !path) return undefined;
        return path.split('.').reduce((current, key) => current?.[key], obj);
    },
    
    split(str = '') {
        return str.trim().match(/[^\s,]+/g) || [];
    }
};

// ==================== パッケージ管理（簡潔版） ====================
async function toggleVirtualPackagesByType(type, value, enabled) {
    const targets = await CustomUtils.getVirtualPackages(type, value);
    
    if (!targets.length) {
        console.log(`No virtual packages for ${type}=${value}`);
        return;
    }
    
    targets.forEach(pkgId => toggleVirtualPackage(pkgId, enabled));
}

function toggleVirtualPackage(packageId, enabled) {
    const checkbox = document.querySelector(`[data-package="${packageId}"]`);
    if (checkbox) checkbox.checked = enabled;
}

// ==================== 言語パッケージ管理（簡潔版） ====================
async function updateLanguagePackageCore() {
    const langConfig = Config.getConfig('languagePackages');
    if (!langConfig) return;
    
    const selected = state.ui.language.selected || Config.get('fallback_language') || 'en';
    
    // 既存の言語パッケージを削除
    for (const pkg of Array.from(state.packages.dynamic)) {
        if (pkg.startsWith('luci-i18n-')) {
            state.packages.dynamic.delete(pkg);
        }
    }
    
    // 英語または設定がない場合はスキップ
    if (selected === langConfig.excludeLanguage || !state.device.arch) return;
    
    // ベース言語パッケージを追加
    const basePkg = `${langConfig.basePackagePrefix}${selected}`;
    const firewallPkg = `${langConfig.firewallPackagePrefix}${selected}`;
    
    if (await isPackageAvailable(basePkg, 'luci')) {
        state.packages.dynamic.add(basePkg);
    }
    if (await isPackageAvailable(firewallPkg, 'luci')) {
        state.packages.dynamic.add(firewallPkg);
    }
}

// ==================== UI生成（簡潔版） ====================
async function createPackageCategory(category) {
    const classes = Config.getConfig('uiConfig.classNames');
    if (!classes) return null;
    
    const categoryDiv = document.createElement('div');
    categoryDiv.className = classes.packageCategory;
    
    const packageGrid = document.createElement('div');
    packageGrid.className = classes.packageGrid;
    
    // カテゴリタイトル
    const title = document.createElement('h4');
    title.textContent = category.name;
    if (category.class) title.classList.add(category.class);
    categoryDiv.appendChild(title);
    
    // パッケージグリッド
    categoryDiv.appendChild(packageGrid);
    
    return categoryDiv;
}

// ==================== フォーム処理（簡潔版） ====================
function buildField(parent, pkg) {
    const uiClasses = Config.getConfig('uiConfig.classNames');
    
    switch (pkg.type) {
        case 'input-group':
            buildInputGroup(parent, pkg);
            break;
            
        case 'radio-group':
            buildRadioGroup(parent, pkg);
            break;
            
        case 'conditional-section':
            buildConditionalSection(parent, pkg);
            break;
            
        case 'info-display':
            buildInfoDisplay(parent, pkg);
            break;
    }
}

function buildInputGroup(parent, pkg) {
    const columnsPerRow = Config.getConfig('uiConfig.defaults.columnsPerRow') || 2;
    const fields = pkg.fields || [];
    
    for (let i = 0; i < fields.length; i += columnsPerRow) {
        const rowEl = document.createElement('div');
        rowEl.className = Config.getConfig('uiConfig.classNames.formRow') || 'form-row';
        
        for (let j = 0; j < columnsPerRow && (i + j) < fields.length; j++) {
            const field = fields[i + j];
            const groupEl = buildFormGroup(field);
            if (groupEl) rowEl.appendChild(groupEl);
        }
        
        if (rowEl.children.length > 0) {
            parent.appendChild(rowEl);
        }
    }
}

function buildRadioGroup(parent, pkg) {
    const row = document.createElement('div');
    row.className = Config.getConfig('uiConfig.classNames.formRow') || 'form-row';
    
    const group = document.createElement('div');
    group.className = Config.getConfig('uiConfig.classNames.formGroup') || 'form-group';
    
    if (pkg.name || pkg.label) {
        const legend = document.createElement('div');
        legend.className = Config.getConfig('uiConfig.classNames.formLabel') || 'form-label';
        if (pkg.class) legend.classList.add(pkg.class);
        legend.textContent = pkg.name || pkg.label;
        group.appendChild(legend);
    }
    
    const radioWrap = document.createElement('div');
    radioWrap.className = Config.getConfig('uiConfig.classNames.radioGroup') || 'radio-group';
    
    (pkg.options || []).forEach(opt => {
        const lbl = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = pkg.variableName || pkg.id;
        radio.value = opt.value;
        
        if (opt.checked || (pkg.defaultValue && opt.value === pkg.defaultValue)) {
            radio.checked = true;
        }
        
        const textSpan = document.createElement('span');
        textSpan.textContent = ' ' + (opt.label || opt.value);
        if (opt.class) textSpan.classList.add(opt.class);
        
        lbl.appendChild(radio);
        lbl.appendChild(textSpan);
        radioWrap.appendChild(lbl);
    });
    
    group.appendChild(radioWrap);
    row.appendChild(group);
    parent.appendChild(row);
}

function buildConditionalSection(parent, pkg) {
    const condWrap = document.createElement('div');
    condWrap.id = pkg.id;
    condWrap.className = Config.getConfig('uiConfig.classNames.conditionalSection') || 'conditional-section';
    condWrap.style.display = 'none';
    
    (pkg.children || []).forEach(child => buildField(condWrap, child));
    
    parent.appendChild(condWrap);
}

function buildInfoDisplay(parent, pkg) {
    const infoDiv = document.createElement('div');
    infoDiv.id = pkg.id;
    infoDiv.className = Config.getConfig('uiConfig.classNames.infoDisplay') || 'info-display';
    if (pkg.class) infoDiv.classList.add(pkg.class);
    
    infoDiv.style.padding = '1em';
    infoDiv.style.backgroundColor = 'var(--bg-item)';
    infoDiv.style.borderRadius = '0.2em';
    infoDiv.style.marginTop = '0.5em';
    infoDiv.style.whiteSpace = 'pre-line';
    infoDiv.textContent = pkg.content || '';
    
    parent.appendChild(infoDiv);
}

function buildFormGroup(field) {
    if (!field) return null;
    
    const group = document.createElement('div');
    group.className = Config.getConfig('uiConfig.classNames.formGroup') || 'form-group';
    
    const label = document.createElement('label');
    label.textContent = field.label || field.name || field.id || '';
    if (field.id) label.setAttribute('for', field.id);
    if (field.class) label.classList.add(field.class);
    group.appendChild(label);
    
    let ctrl;
    if (field.type === 'select') {
        ctrl = document.createElement('select');
        (field.options || []).forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label || opt.value;
            if (opt.selected || (field.defaultValue && opt.value === field.defaultValue)) {
                option.selected = true;
            }
            ctrl.appendChild(option);
        });
    } else {
        ctrl = document.createElement('input');
        ctrl.type = field.type || 'text';
        if (field.placeholder) ctrl.placeholder = field.placeholder;
        if (field.defaultValue !== undefined) ctrl.value = field.defaultValue;
        if (field.min != null) ctrl.min = field.min;
        if (field.max != null) ctrl.max = field.max;
        if (field.maxlength != null) ctrl.maxLength = field.maxlength;
        if (field.pattern != null) ctrl.pattern = field.pattern;
    }
    
    if (field.id) ctrl.id = field.id;
    group.appendChild(ctrl);
    
    if (field.description) {
        const small = document.createElement('small');
        small.className = 'text-muted';
        small.textContent = field.description;
        group.appendChild(small);
    }
    
    return group;
}

// ==================== イベント処理（簡潔版） ====================
async function setupEventListeners() {
    const eventMappings = Config.getConfig('eventMappings');
    if (!eventMappings) return;
    
    // ラジオグループのイベント設定
    const radioGroups = eventMappings.radioGroups || {};
    Object.entries(radioGroups).forEach(([name, config]) => {
        attachRadioListeners(name, window[config.handler], config.triggerInitial);
    });
    
    // 入力フィールドのイベント設定
    const inputFields = eventMappings.inputFields || {};
    Object.entries(inputFields).forEach(([id, config]) => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener(config.event, () => {
                window[config.handler](config.force);
            });
        }
    });
    
    setupDsliteAddressComputation();
    setupCommandsInput();
}

function attachRadioListeners(name, handler, triggerInitial = true) {
    const radios = document.querySelectorAll(`input[name="${name}"]`);
    radios.forEach(radio => {
        radio.removeEventListener('change', handler);
        radio.addEventListener('change', handler);
    });
    
    if (triggerInitial) {
        const checked = document.querySelector(`input[name="${name}"]:checked`);
        if (checked) handler({ target: checked });
    }
}

// ==================== UCIデフォルト処理（簡潔版） ====================
async function updateTextareaContent(textarea, variableDefinitions) {
    const markers = Config.getConfig('uciDefaults.markers.variableDefinitions');
    if (!markers) return;
    
    let content = textarea.value;
    const beginIndex = content.indexOf(markers.begin);
    const endIndex = content.indexOf(markers.end);
    
    if (beginIndex !== -1 && endIndex !== -1) {
        const beforeSection = content.substring(0, beginIndex + markers.begin.length);
        const afterSection = content.substring(endIndex);
        const newSection = variableDefinitions ? '\n' + variableDefinitions + '\n' : '\n';
        textarea.value = beforeSection + newSection + afterSection;
        textarea.rows = textarea.value.split('\n').length + 1;
    }
}

// ==================== MultiInputManager（簡潔版） ====================
class MultiInputManager {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        
        Config.load().then(() => {
            const defaults = Config.getConfig('uiConfig.defaults');
            this.options = {
                placeholder: options.placeholder || defaults.multiInputPlaceholder,
                className: options.className || Config.getConfig('uiConfig.classNames.multiInputItem'),
                onAdd: options.onAdd || (() => {}),
                onRemove: options.onRemove || (() => {}),
                onChange: options.onChange || (() => {}),
                autocomplete: options.autocomplete || null
            };
            this.init();
        });
        
        this.inputs = [];
    }
    
    init() {
        this.container.innerHTML = '';
        this.container.className = Config.getConfig('uiConfig.classNames.multiInputContainer');
        this.addInput('', true);
    }
    
    addInput(value = '', focus = false) {
        const inputWrapper = document.createElement('div');
        inputWrapper.className = Config.getConfig('uiConfig.classNames.multiInputWrapper');
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = this.options.className;
        input.placeholder = this.options.placeholder;
        input.value = value;
        input.autocomplete = 'off';
        
        input.addEventListener('keydown', (e) => this.handleKeyDown(e, input));
        input.addEventListener('input', (e) => this.handleInput(e, input));
        input.addEventListener('blur', (e) => this.handleBlur(e, input));
        
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
        }
    }
    
    handleInput(e, input) {
        const value = input.value.trim();
        const minLength = Config.getConfig('uiConfig.defaults.autocompleteMinLength') || 2;
        
        if (this.options.autocomplete && value.length >= minLength) {
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
        return this.inputs.map(input => input.value.trim()).filter(value => value !== '');
    }
}

// ==================== 初期化 ====================
async function initialize() {
    await Config.load();
    state.config.setup = Config._cache;
    console.log('Configuration loaded and initialized');
    
    // 残りの初期化処理
}

// DOM読み込み完了時に初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

// ==================== 既存の関数定義（簡略化） ====================
// 必要な関数のみを残し、setup.jsonの設定を使用するように修正

function updateAllPackageState(source = 'unknown') {
    console.log(`Package state update from: ${source}`);
    // 実装省略
}

function isPackageAvailable(pkgName, feed) {
    // 実装省略
    return Promise.resolve(false);
}

function setupPackageSearch() {
    const placeholder = Config.getConfig('uiConfig.defaults.packageSearchPlaceholder');
    const className = Config.getConfig('uiConfig.classNames.packageSearchInput');
    
    state.ui.managers.packageSearch = new MultiInputManager('package-search-autocomplete', {
        placeholder: placeholder,
        className: className,
        onAdd: (packageName) => updateAllPackageState('package-search-add'),
        onRemove: (packageName) => updateAllPackageState('package-search-remove'),
        onChange: (values) => updateAllPackageState('package-search-change'),
        autocomplete: (query, inputElement) => searchPackages(query, inputElement)
    });
}

function setupCommandsInput() {
    const placeholder = Config.getConfig('uiConfig.defaults.commandInputPlaceholder');
    const className = Config.getConfig('uiConfig.classNames.commandInput');
    
    state.ui.managers.commands = new MultiInputManager('commands-autocomplete', {
        placeholder: placeholder,
        className: className,
        onAdd: (command) => console.log('Command added:', command),
        onRemove: (command) => console.log('Command removed:', command),
        onChange: (values) => updateCustomCommands()
    });
}

function searchPackages(query, inputElement) {
    // 実装省略
}

function updateCustomCommands() {
    // 実装省略
}

function setupDsliteAddressComputation() {
    // DS-Lite アドレスマップはsetup.jsonから取得
    const dsliteSection = Config._cache?.categories
        ?.find(cat => cat.id === 'internet-config')
        ?.packages?.find(pkg => pkg.id === 'dslite-section');
    
    if (!dsliteSection) return;
    
    const addressMap = dsliteSection.children
        ?.find(child => child.id === 'dslite-fields')
        ?.fields?.find(field => field.id === 'dslite-aftr-type')
        ?.computeField?.addressMap;
    
    // 残りの実装
}

// ハンドラー関数
window.handleConnectionTypeChange = function(e) {
    const value = e.target.value;
    updateAllPackageState('connection-type');
};

window.handleNetOptimizerChange = function(e) {
    const value = e.target.value;
    updateAllPackageState('net-optimizer');
};

window.handleWifiModeChange = function(e) {
    const value = e.target.value;
    updateAllPackageState('wifi-mode');
};

window.handleMapeTypeChange = function(e) {
    const value = e.target.value;
    updateAllPackageState('mape-type');
};

window.handleDnsmasqChange = function(e) {
    const value = e.target.value;
    updateAllPackageState('dnsmasq-mode');
};

window.syncAftrAddress = function(force) {
    // 実装省略
};

console.log('custom.js (setup.json driven) initialized');
