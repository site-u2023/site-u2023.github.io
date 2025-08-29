// ==================== グローバル変数 ====================
let app = {
    versions: [],
    devices: [],
    selectedVersion: '',
    templateLoaded: false,
    availablePackages: [],
    archPackagesMap: {},
    devicePackages: [],
    versionCode: null,
    kernelHash: null,
    snapshotKernelFallbacks: [],
    devicesMap: {}
};

// 公式と同じグローバル変数
let current_device = {};

// キャッシュ
let mapShCache = undefined;
let profileCache = {};
let eventsbound = false;
let apiInfoFetched = false;

// ==================== 共通ユーティリティ ====================
function split(str) {
    return str.match(/[^\s,]+/g) || [];
}

function hideAutocomplete() {
    const items = document.querySelector('.autocomplete-items');
    if (items) {
        items.remove();
    }
}

function setupAutocompleteList(input, list) {
    const parentContainer = input.parentNode;
    const itemsContainer = document.createElement('div');
    itemsContainer.setAttribute('id', 'package-search-autocomplete');
    itemsContainer.setAttribute('class', 'autocomplete-items');
    parentContainer.appendChild(itemsContainer);

    list.forEach(item => {
        const itemDiv = document.createElement('div');
        let text = item;
        let id = item;
        if (typeof item !== 'string') {
            text = item.name;
            id = item.id;
        }

        const matchIndex = text.toLowerCase().indexOf(input.value.toLowerCase());
        itemDiv.innerHTML = text.substr(0, matchIndex) + "<strong>" + text.substr(matchIndex, input.value.length) + "</strong>" + text.substr(matchIndex + input.value.length);
        itemDiv.innerHTML += `<input type='hidden' value='${id}'>`;

        itemDiv.addEventListener('click', function() {
            input.value = this.getElementsByTagName('input')[0].value;
            hideAutocomplete();
        });
        itemsContainer.appendChild(itemDiv);
    });
}

function setActive(x) {
    if (!x) return false;
    closeAllLists();
    if (x.length > 0) x[0].classList.add("autocomplete-active");
}

function closeAllLists(elmnt) {
    const items = document.querySelectorAll(".autocomplete-items");
    items.forEach(item => {
        if (elmnt !== item && elmnt !== document.getElementById(input.id)) {
            item.parentNode.removeChild(item);
        }
    });
}

function match(arr, query) {
    return arr.filter(name => name.toLowerCase().includes(query));
}

function adjustTextareaHeight(textareaId) {
    const textarea = document.getElementById(textareaId);
    if (!textarea) return;
    
    const lines = textarea.value.split('\n');
    const lineCount = lines.length;
    const rows = Math.max(6, lineCount + 1);
    
    textarea.rows = rows;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

function waitForReady(ids = []) {
    return new Promise(resolve => {
        const check = () => {
            if (ids.every(id => document.getElementById(id))) {
                resolve();
            } else {
                requestAnimationFrame(check);
            }
        };
        check();
    });
}

// ==================== エラーハンドリング統一 ====================
const ErrorHandler = {
    classify(error, response = null) {
        if (response?.status === 404) return 'VERSION_NOT_AVAILABLE';
        if (response?.status === 403) return 'PERMISSION_DENIED';
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            return 'NETWORK_ERROR';
        }
        if (error.message?.includes('timeout')) return 'TIMEOUT';
        return 'UNKNOWN';
    },

    handle(context, error, response = null) {
        const errorType = this.classify(error, response);
        const expectedBehaviors = ['VERSION_NOT_AVAILABLE', 'EXPECTED_CORS_REJECTION', 'PERMISSION_DENIED'];
        const isExpected = expectedBehaviors.includes(errorType);
        
        if (isExpected) {
            console.log(`[${context}] ${errorType}: Expected behavior for older versions`, {
                message: error.message,
                response: response ? {
                    status: response.status,
                    statusText: response.statusText,
                    url: response.url
                } : null
            });
        } else {
            console.error(`[${context}] ${errorType}: Unexpected error`, {
                message: error.message,
                stack: error.stack,
                response: response ? {
                    status: response.status,
                    statusText: response.statusText,
                    url: response.url
                } : null
            });
        }
        
        switch (errorType) {
            case 'VERSION_NOT_AVAILABLE':
                console.log(`✔ Version ${app.selectedVersion} not available - This is expected for older versions`);
                hideDeviceInfo();
                app.devicePackages = [];
                const pkgPanel = document.getElementById('packages');
                const categories = document.getElementById('package-categories');
                if (categories) categories.innerHTML = '';
                if (pkgPanel) pkgPanel.style.display = 'none';
                break;
            case 'PERMISSION_DENIED':
            case 'EXPECTED_CORS_REJECTION':
                console.log(`✔ Access blocked by CORS policy - This is expected for older versions`);
                hideDeviceInfo();
                break;
            case 'NETWORK_ERROR':
                console.warn(`Network connectivity issue in ${context}`);
                hideDeviceInfo();
                break;
            default:
                console.error(`Unexpected error in ${context}:`, error.message);
                hideDeviceInfo();
        }
        return { success: false, errorType, context, isExpected };
    },

    debug(context, message, data = null) {
        console.log(`[DEBUG] ${context}: ${message}`);
        if (data) {
            console.log('Data:', data);
        }
        
        if (context.includes('Package') || context.includes('package')) {
            this.packageDebug.checkMissing();
        }
    },

    trace(functionName, ...args) {
        console.log(`[TRACE] ${functionName}() called`);
        console.log('Arguments:', args);
        console.trace(`${functionName} call stack:`);
    },

    packageDebug: {
        logFetch(url, success, packages = []) {
            const source = url.split('/').slice(-2).join('/');
            
            if (success) {
                const kmods = packages.filter(p => 
                    (typeof p === 'string' ? p : p?.name)?.startsWith('kmod-')
                );
                console.log(`[PKG Fetch] OK ${source}: ${packages.length} pkgs (${kmods.length} kmods)`);
            } else {
                console.log(`[PKG Fetch] NG ${source}: FAILED`);
            }
        },
        
        checkMissing() {
            if (!window.PACKAGE_DB || !app.devicePackages) return;
            
            const missing = [];
            const notDisplayed = [];
            
            window.PACKAGE_DB.categories.forEach(category => {
                category.packages.forEach(pkg => {
                    const inDevice = app.devicePackages?.some(p => 
                        (typeof p === 'string' ? p : p?.name) === pkg.name
                    );
                    const inUI = document.querySelector(`[data-package="${pkg.name}"]`);
                    
                    if (!inDevice) missing.push(pkg.name);
                    if (inDevice && !inUI) notDisplayed.push(pkg.name);
                });
            });
            
            if (missing.length > 0) {
                console.warn('[NG] Missing from device packages:', missing);
            }
            if (notDisplayed.length > 0) {
                console.warn('[NG] In device but not displayed:', notDisplayed);
            }
            if (missing.length === 0 && notDisplayed.length === 0) {
                console.log('[OK] All packages available');
            }
        },
        
        dumpAll() {
            console.group('[Package Debug] Complete Dump');
            console.log('Device packages:', app.devicePackages?.length || 0);
            console.log('First 10 packages:', app.devicePackages?.slice(0, 10));
            const kmods = app.devicePackages?.filter(p => 
                (typeof p === 'string' ? p : p?.name)?.startsWith('kmod-')
            );
            console.log('Total kmods:', kmods?.length || 0);
            console.log('First 10 kmods:', kmods?.slice(0, 10).map(k => 
                typeof k === 'string' ? k : k?.name
            ));
            console.groupEnd();
        }
    }
};

// ==================== リセット共通関数 ====================
const ResetManager = {
    clearFields(fieldIds) {
        fieldIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                if (element.type === 'text' || element.type === 'password' || 
                    element.type === 'number' || element.tagName === 'TEXTAREA') {
                    element.value = '';
                } else if (element.type === 'select-one') {
                    element.selectedIndex = 0;
                } else if (element.type === 'radio' || element.type === 'checkbox') {
                    element.checked = false;
                }
            }
        });
    },
    
    resetRadio(name, defaultId) {
        const defaultRadio = document.getElementById(defaultId);
        if (defaultRadio) {
            defaultRadio.checked = true;
        }
    },
    
    clearPPPoEValues() {
        this.clearFields(['pppoe-username', 'pppoe-password']);
    },
    
    clearDSLiteValues() {
        this.clearFields(['dslite-aftr-address']);
        const typeSelect = document.getElementById('dslite-aftr-type');
        const areaSelect = document.getElementById('dslite-area');
        if (typeSelect) typeSelect.value = 'transix';
        if (areaSelect) areaSelect.value = 'east';
    },
    
    clearMAPEValues() {
        this.clearFields([
            'mape-br', 'mape-ealen', 'mape-ipv4-prefix', 'mape-ipv4-prefixlen',
            'mape-ipv6-prefix', 'mape-ipv6-prefixlen', 'mape-psid-offset', 
            'mape-psidlen', 'mape-gua-prefix'
        ]);
    },
    
    clearAPValues() {
        this.clearFields(['ap-ip-address', 'ap-gateway']);
    },
    
    clearNetOptimizerValues() {
        this.clearFields([
            'netopt-rmem', 'netopt-wmem', 'netopt-conntrack',
            'netopt-backlog', 'netopt-somaxconn'
        ]);
        const congestionSelect = document.getElementById('netopt-congestion');
        if (congestionSelect) congestionSelect.value = 'cubic';
    },
    
    resetAllConnectionValues() {
        this.clearPPPoEValues();
        this.clearDSLiteValues();
        this.clearMAPEValues();
        this.clearAPValues();
    },
    
    resetConnectionType() {
        const dhcpRadio = document.getElementById('conn-dhcp');
        if (dhcpRadio) {
            dhcpRadio.checked = true;
        }
        
        const sections = [
            'pppoe-section',
            'dslite-section', 
            'mape-manual-section',
            'ap-section',
            'dhcp-section'
        ];
        
        sections.forEach(id => {
            const section = document.getElementById(id);
            if (section) section.style.display = 'none';
        });
        
        const dhcpSection = document.getElementById('dhcp-section');
        if (dhcpSection) dhcpSection.style.display = 'block';
    },
    
    resetDsliteSettings() {
        const dsliteAuto = document.getElementById('dslite-auto');
        if (dsliteAuto) {
            dsliteAuto.checked = true;
        }
        
        const manualFields = document.getElementById('dslite-manual-fields');
        if (manualFields) {
            manualFields.style.display = 'none';
        }
    },
    
    resetMapeSettings() {
        const mapeAuto = document.getElementById('mape-auto');
        if (mapeAuto) {
            mapeAuto.checked = true;
        }
    },
    
    resetNetOptimizerSettings() {
        const netoptAuto = document.getElementById('netopt-auto');
        if (netoptAuto) {
            netoptAuto.checked = true;
        }
        
        const manualSection = document.getElementById('net-optimizer-manual');
        if (manualSection) {
            manualSection.style.display = 'none';
        }
    }
};

// ==================== 初期化関数 ====================
document.addEventListener('DOMContentLoaded', init);

async function init() {
    try {
        // バージョン読み込み
        await loadVersions();

        // イベントバインディング
        if (typeof bindEvents === 'function') {
            try {
                bindEvents();
            } catch (error) {
                console.error('Failed to bind events:', error);
            }
        }

        // テンプレートとパッケージの更新
        try {
            if (typeof refreshTemplateAndPackages === 'function') {
                await refreshTemplateAndPackages();
            }
        } catch (error) {
            console.error('Failed to refresh template and packages:', error);
        }

        await waitForReady([
            'versions',
            'models'
        ]);

        console.log('Initialization completed. ISP info will be fetched when details are opened.');
        
        setTimeout(() => {
            refreshTemplateAndPackages();
        }, 100);

    } catch (error) {
        console.error('Failed to initialize:', error);
        updateIspDisplay(
            'Initialization error',
            'Failed to initialize application: ' + error.message
        );
    }
}

// ==================== バージョン管理 ====================
async function loadVersions() {
    try {
        const response = await fetch('https://downloads.openwrt.org/.versions.json');
        const data = await response.json();
        app.versions = ['SNAPSHOT'];
        
        if (data.versions_list) {
            let versionList = data.versions_list;
            
            if (config.min_version) {
                const minParts = config.min_version.split('.').map(n => parseInt(n, 10));
                versionList = versionList.filter(version => {
                    const parts = version.split('.').map(n => parseInt(n, 10));
                    for (let i = 0; i < minParts.length; i++) {
                        if (parts[i] > minParts[i]) return true;
                        if (parts[i] < minParts[i]) return false;
                    }
                    return true;
                });
            }
            
            app.versions = app.versions.concat(versionList);
        }
        
        app.versions.forEach(ver => setupVersionUrls(ver));
        
        app.selectedVersion = data.stable_version || (data.versions_list ? data.versions_list[0] : 'SNAPSHOT');
        updateVersionSelect();
        await loadDevices();
    } catch (error) {
        console.error('Failed to load versions:', error);
    }
}

function updateVersionSelect() {
    const select = document.getElementById('versions');
    select.innerHTML = '';

    app.versions.forEach(version => {
        const option = document.createElement('option');
        option.value = version;
        option.textContent = version;
        if (version === app.selectedVersion) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

// ==================== URL管理 ====================
function setupVersionUrls(version) {
    if (!config.image_urls) config.image_urls = {};
    if (!config.overview_urls) config.overview_urls = {};
    if (config.image_urls[version]) return;
    const overview_url = config.image_url;
    const image_url = (typeof upstream_config !== 'undefined' && upstream_config.image_url_override)
        ? upstream_config.image_url_override
        : config.image_url;
    const isSnapshot = /SNAPSHOT$/i.test(version);
    const basePath = isSnapshot ? 'snapshots' : `releases/${encodeURIComponent(version)}`;
    config.overview_urls[version] = `${overview_url}/${basePath}/`;
    config.image_urls[version] = `${image_url}/${basePath}/`;
}

// ==================== デバイス管理 ====================
async function loadDevices() {
    if (!app.selectedVersion) return;
    
    const cacheKey = `devices:${app.selectedVersion}`;
    const notFoundKey = `404:${cacheKey}`;
    
    if (profileCache[notFoundKey]) {
        console.log(`[loadDevices] Version ${app.selectedVersion} known to be unavailable`);
        app.devices = [];
        app.versionCode = null;
        app.kernelHash = null;
        hideDeviceInfo();
        return;
    }
    
    try {
        setupVersionUrls(app.selectedVersion);
        const url = config.overview_urls[app.selectedVersion] + '.overview.json';
        
        const response = await fetch(url, {
            cache: 'no-cache',
            credentials: 'omit',
            mode: 'cors'
        });
        
        if (response.status === 404) {
            console.error(`Version ${app.selectedVersion} not found (HTTP 404)`);
            throw new Error('Version not available');
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        const dups = {};
        const profiles = [];
        
        function resolve_duplicate(e) {
            const tu = e.title.toUpperCase();
            if (tu in dups) {
                e.title += ` (${e.target})`;
                let o = dups[tu];
                if (o.title.toUpperCase() == tu) {
                    o.title += ` (${o.target})`;
                }
            } else {
                dups[tu] = e;
            }
        }
        
        for (const profile of data.profiles || []) {
            const modelTitles = profile.titles ? getModelTitles(profile.titles) : [profile.id];
            for (let title of modelTitles) {
                if (title.length == 0) {
                    console.warn(`Empty device title for model id: ${profile.target}, ${profile.id}`);
                    continue;
                }
                
                const e = Object.assign({ title: title }, profile);
                resolve_duplicate(e);
                profiles.push(e);
            }
        }
        
        app.devicesMap = profiles.reduce((d, e) => ((d[e.title] = e), d), {});
        app.devices = profiles;
        app.archPackagesMap = data.arch_packages || {};
        
    } catch (error) {
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('CORS'))) {
            console.log(`✔ Version ${app.selectedVersion} access blocked - Normal for older versions`);
            profileCache[notFoundKey] = true;
        } else {
            console.log(`[loadDevices] Error: ${error.message}`);
        }
        app.devices = [];
        app.devicesMap = {};
        app.versionCode = null;
        app.kernelHash = null;
        hideDeviceInfo();
    }
}

function getModelTitles(titles) {
    return titles.map((e) => {
        if (e.title) {
            return e.title;
        } else {
            return (
                (e.vendor || "") +
                " " +
                (e.model || "") +
                " " +
                (e.variant || "")
            ).trim();
        }
    });
}

function getDeviceTitle(device) {
    if (device.titles && device.titles.length > 0) {
        return device.titles[0].title || device.id;
    }
    return device.id;
}

// ==================== デバイス選択 ====================
function setModel(target, id) {
    if (target && id) {
        const title = document.getElementById('models').value;
        for (const device of app.devices) {
            const deviceTitle = device.title || getDeviceTitle(device);
            if ((device.target === target && device.id === id) || deviceTitle === title) {
                document.getElementById('models').value = deviceTitle;
                selectDevice(device);
                return;
            }
        }
    }
}

function selectDevice(device) {
    const title = device.title || getDeviceTitle(device);
    document.getElementById('models').value = title;
    hideAutocomplete();
    
    DeviceContext.update({
        deviceTitle: title,
        trigger: 'device-selection'
    });
}

function changeModel(device) {
    if (device) {
        DeviceContext.update({
            deviceTitle: getDeviceTitle(device),
            trigger: 'change-model'
        });
    } else {
        DeviceContext._clearDevice();
    }
}

// ==================== デバイス・バージョン統合管理 ====================
const DeviceContext = {
    async update(options = {}) {
        const {
            version = app.selectedVersion,
            deviceTitle = document.getElementById('models')?.value?.trim(),
            forceReload = false,
            trigger = 'unknown'
        } = options;
        
        console.log(`[DeviceContext] Update: ${trigger} | Version: ${version} | Device: ${deviceTitle || 'none'}`);
        
        try {
            await this._updateVersion(version, forceReload);
            await this._updateDevice(deviceTitle);
            await this._finalizeUpdate();
        } catch (error) {
            ErrorHandler.handle('DeviceContext.update', error);
        }
    },
    
    async _updateVersion(version, forceReload) {
        if (version !== app.selectedVersion) {
            app.selectedVersion = version;
            console.log(`[DeviceContext] Version changed: ${version}`);
        }
    
        if (window.cachedApiInfo?.mape?.brIpv6Address) {
            await loadMapSh();
        }
    
        if (forceReload || app.devices.length === 0) {
            await loadDevices();
        }
    },
    
    async _updateDevice(deviceTitle) {
        if (!deviceTitle || app.devices.length === 0) {
            this._clearDevice();
            return;
        }
        
        const device = app.devices.find(d => getDeviceTitle(d) === deviceTitle);
        
        if (device) {
            await this._selectDevice(device);
        } else {
            this._deviceNotFound(deviceTitle);
        }
    },

    async _selectDevice(device) {
        console.log(`[DeviceContext] Device selected: ${device.id}`);
        
        current_device = {
            version: app.selectedVersion,
            id: device.id,
            target: device.target
        };
        
        try {
            const success = await loadDeviceProfile(device);
            if (success) {
                try {
                    await fetchApiInfoAndUpdate();
                    updateRequiredPackages();
                    asuCollectPackages();
                } catch (e) {
                    console.error('[DeviceContext] API fetch failed before showDeviceInfo:', e);
                }   
                showDeviceInfo();
            } else {
                current_device = {};
            }
        } catch (error) {
            const result = ErrorHandler.handle('DeviceContext._selectDevice', error);
            current_device = {};
            hideDeviceInfo();
            return;
        }
    },
    
    async _finalizeUpdate() {
        // 統合後処理
    },
    
    _deviceNotFound(deviceTitle) {
        console.log(`[DeviceContext] Device not found: ${deviceTitle} (keeping name, hiding info)`);
        hideDeviceInfo();
    },
    
    _clearDevice() {
        hideDeviceInfo();
    },
    
    _handleError() {
        hideDeviceInfo();
    }
};

// ==================== デバイスプロファイル ====================
async function loadDeviceProfile(device) {
    if (!device || !device.target || !device.id) return false;
    const version = app.selectedVersion;
    const targetPath = device.target;
    const profileId = device.id;
    const cacheKey = `${version}::${targetPath}::${profileId}`;

    setupVersionUrls(version);
    
    const profilesUrl = `${config.image_urls[version]}/targets/${targetPath}/profiles.json`;
    
    if (profileCache[cacheKey]) {
        console.log(`Using cached profile for ${cacheKey}`);
        applyProfileData(profileCache[cacheKey], profileId);
        Promise.allSettled([ fetchDevicePackages() ])
            .then(() => console.log('Background tasks completed (from cache)'));
        return true;
    }

    try {
        console.log(`Loading profile from: ${profilesUrl}`);
        const response = await fetch(profilesUrl, { cache: 'no-cache' });
        
        if (!response.ok) {
            if (response.status === 404) {
                console.log(`Device ${device.id} not supported in version ${version}`);
                hideDeviceInfo();
                current_device = {};
                return false;
            }
            throw new Error(`Failed to fetch profiles.json: HTTP ${response.status}`);
        }
        
        const profilesData = await response.json();
        console.log(`Loaded profiles data:`, profilesData);
        profileCache[cacheKey] = profilesData;
        applyProfileData(profilesData, profileId);

        try {
            await fetchDevicePackages();
        } catch (e) {
            console.error('fetchDevicePackages failed:', e);
        }
        
        if (typeof generatePackageSelector === 'function') {
            generatePackageSelector();
        }
        return true;
        
    } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            console.log(`Version ${version} access blocked by CORS - Expected for older versions`);
            hideDeviceInfo();
            current_device = {};
            return false;
        }
        
        console.error('Network error loading device profile:', error);
        hideDeviceInfo();
        current_device = {};
        return false;
    }
}

async function applyProfileData(profilesData, profileId) {
    app.versionCode = profilesData.version_code || '';
    
    if (profilesData.linux_kernel) {
        const lk = profilesData.linux_kernel;
        app.kernelHash = `${lk.version}-${lk.release}-${lk.vermagic}`;
        console.log('[Kernel] From profiles.json:', app.kernelHash);
    } else {
        console.log('[Kernel] No linux_kernel in profiles.json, fetching from server...');
        app.kernelHash = await fetchActualKernelHash(app.selectedVersion, current_device.target);
        console.log('[Kernel] From server HTML:', app.kernelHash);
    }

    if (profilesData.profiles && profilesData.profiles[profileId]) {
        const profile = profilesData.profiles[profileId];
        const defaultPackages = profilesData.default_packages || [];
        const devicePackages = profile.device_packages || [];
        const asuExtraPackages = ['luci'];
        
        const checkedPackages = [];
        document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
            const pkgName = cb.getAttribute('data-package');
            if (pkgName) {
                checkedPackages.push(pkgName);
            }
        });
        
        const allPackages = Array.from(new Set([
            ...defaultPackages,
            ...devicePackages,
            ...asuExtraPackages,
            ...checkedPackages
        ]));
        
        document.getElementById('asu-packages').value = allPackages.join(' ');
        asuCollectPackages();
    }
}

async function fetchActualKernelHash(version, targetPath) {
    try {
        setupVersionUrls(version);
        const kmodsUrl = `${config.image_urls[version]}targets/${targetPath}/kmods/`;
    
        const response = await fetch(kmodsUrl, { cache: 'no-cache' });
        if (!response.ok) {
            console.log(`[Kernel] kmods directory not found: ${response.status}`);
            return null;
        }
    
        const html = await response.text();
        console.log('[Kernel] Fetched HTML from:', kmodsUrl);
    
        return await selectKernelSmart(html);
        
    } catch (error) {
        console.log('[Kernel] Failed to fetch kernel hash:', error.message);
        return null;
    }
}

async function selectKernelSmart(html) {
    const kernelDirs = extractAllKernels(html);
    
    if (kernelDirs.length === 0) {
        console.log('[Kernel] No valid kernel directories found');
        return null;
    } else if (kernelDirs.length === 1) {
        console.log('[Kernel] Single kernel found:', kernelDirs[0].hash);
        return kernelDirs[0].hash;
    } else {
        console.log(`[Kernel] Multiple kernels found (${kernelDirs.length}), selecting latest by date`);
        return selectLatestByDate(kernelDirs);
    }
}

function extractAllKernels(html) {
    const tableRowPattern = /<tr><td class="n"><a href="([^"\/]+)\/"[^>]*>([^<]+)<\/a>\/[^<]*<\/td><td class="s">[^<]*<\/td><td class="d">([^<]+)<\/td>/g;
    const kernelDirs = [];
    let match;
    
    while ((match = tableRowPattern.exec(html)) !== null) {
        const dirName = match[1];
        const dateStr = match[3];
        
        if (dirName === '.' || dirName === '..') continue;
        
        if (dirName.match(/^\d+\.\d+\.\d+-\d+-[a-f0-9]{32}$/)) {
            try {
                const date = new Date(dateStr);
                if (!isNaN(date.getTime())) {
                    kernelDirs.push({
                        hash: dirName,
                        date: date,
                        dateStr: dateStr
                    });
                }
            } catch (e) {
                console.log(`[Kernel] Invalid date format: ${dateStr}`);
            }
        }
    }
    
    return kernelDirs;
}

function selectLatestByDate(kernelDirs) {
    kernelDirs.sort((a, b) => b.date - a.date);
    const latestKernel = kernelDirs[0];
    
    console.log(`[Kernel] Selected latest kernel: ${latestKernel.hash} (${latestKernel.dateStr})`);
    
    if (kernelDirs.length > 1) {
        app.snapshotKernelFallbacks = kernelDirs.slice(1, 3).map(k => k.hash);
        console.log(`[Kernel] Fallback kernels available: ${app.snapshotKernelFallbacks.join(', ')}`);
    }
    
    return latestKernel.hash;
}

// ==================== デバイス情報表示 ====================
function showDeviceInfo() {
    if (!current_device || !current_device.id) return;

    const device = app.devices.find(d => d.id === current_device.id && d.target === current_device.target);
    if (!device) return;
    
    let fullVersion = app.selectedVersion;
    let displayVersionCode = app.versionCode || 'null';
    if (app.versionCode) {
        fullVersion = `${app.selectedVersion} (${app.versionCode})`;
    }
    
    setupVersionUrls(app.selectedVersion);
    
    const imageFolder = `${config.image_urls[app.selectedVersion]}targets/${device.target}`;
    
    const deviceLink = `${window.location.origin}${window.location.pathname}?version=${encodeURIComponent(app.selectedVersion)}&target=${encodeURIComponent(device.target)}&id=${encodeURIComponent(device.id)}`;
    
    const deviceTitle = device.title || getDeviceTitle(device);
    const infoUrl = (config.info_url || "")
        .replace("{title}", encodeURI(deviceTitle))
        .replace("{target}", device.target)
        .replace("{id}", device.id)
        .replace("{version}", app.selectedVersion);

    const {
        country = 'unknown',
        zonename = 'unknown',
        timezone = 'unknown',
        isp = 'unknown',
        as: asNumber = 'unknown',
        ipv4 = '',
        ipv6 = '',
        aftr,
        mape,
        notice = ''
    } = window.cachedApiInfo || {};

    const countryValue = country;
    const timezoneValue = timezone || 'unknown';
    const zonenameValue = zonename || 'unknown';
    const ispValue = isp;
    const asValue = asNumber;
    const ipAddressValue = [ipv4, ipv6].filter(Boolean).join(' / ') || 'unknown';

    const connMode = document.querySelector('input[name="connectionMode"]:checked')?.value || 'auto';
    const connType = document.querySelector('input[name="connectionType"]:checked')?.value || '';
    let wanType = 'Unknown';

    if (connMode === 'manual') {
        switch (connType) {
            case 'dhcp':
                wanType = 'Manual (DHCP)';
                break;
            case 'pppoe':
                wanType = 'Manual (PPPoE)';
                break;
            case 'dslite':
                wanType = 'Manual (DS-Lite)';
                break;
            case 'mape':
                wanType = 'Manual (MAP-E)';
                break;
            case 'ap':
                wanType = 'Manual (AP)';
                break;
            default:
                wanType = 'Manual (Unknown)';
        }
    } else {
        if (aftr) {
            wanType = 'Auto (DS-Lite)';
        } else if (mape) {
            wanType = 'Auto (MAP-E)';
        } else {
            wanType = 'Auto (DHCP/PPPoE)';
        }
    }

    const noticeValue = notice.trim();
    
    const infoHtml = `
        <h5>About this build</h5>
        <div class="row">
            <span class="col1">Model</span>
            <span class="col2" id="image-model"><strong>${device.title || getDeviceTitle(device)}</strong></span>
        </div>
        <div class="row">
            <span class="col1">Target</span>
            <span class="col2" id="image-target">${device.target}</span>
        </div>
        <div class="row">
            <span class="col1">Version</span>
            <span class="col2">
                <span id="image-version">${app.selectedVersion}</span>
                (<span id="image-code">${displayVersionCode}</span>)
            </span>
        </div>
        <div class="row">
            <span class="col1">Country</span>
            <span class="col2" id="image-country">${countryValue}</span>
        </div>
        <div class="row">
            <span class="col1">Timezone</span>
            <span class="col2" id="image-timezone">${timezoneValue}</span>
        </div>
        <div class="row">
            <span class="col1">Zonename</span>
            <span class="col2" id="image-zonename">${zonenameValue}</span>
        </div>
        <div class="row">
            <span class="col1">ISP</span>
            <span class="col2" id="image-isp">${ispValue}</span>
        </div>
        <div class="row">
            <span class="col1">AS</span>
            <span class="col2" id="image-as">${asValue}</span>
        </div>
        <div class="row">
            <span class="col1">IP Address</span>
            <span class="col2" id="image-ip-address">${ipAddressValue}</span>
        </div>
        <div class="row">
            <span class="col1">WAN</span>
            <span class="col2" id="wan-type">${wanType}</span>
        </div>
        <div class="row">
            <span class="col1">Notice</span>
            <span class="col2" id="image-notice">${noticeValue}</span>
        </div>
        <div class="row">
            <span class="col1">Links</span>
            <span class="col2">
                <a id="image-folder" href="${imageFolder}" title="Browse image folder" target="_blank"></a>
                <a id="image-info" href="${infoUrl}" title="Device info" target="_blank"></a>
                <a id="image-link" href="#" title="Copy link" onclick="navigator.clipboard.writeText('${deviceLink}').then(() => alert('Link copied!')); return false;"></a>
            </span>
        </div>
    `;
    
    document.getElementById('info').innerHTML = infoHtml;
    document.getElementById('info').style.display = 'block';
    document.getElementById('packages').style.display = 'block';
    document.getElementById('request-build').style.display = 'inline-block';

    const textarea = document.getElementById('uci-defaults-content');
    if (!app.templateLoaded && (!textarea.value || textarea.value.trim() === '')) {
        textarea.value = window.SETUP_SH_TEMPLATE;
        app.templateLoaded = true;
        console.log('Template loaded for the first time');
    }
}

function hideDeviceInfo() {
    document.getElementById('info').style.display = 'none';
    document.getElementById('packages').style.display = 'none';
    document.getElementById('request-build').style.display = 'none';
}

// ==================== オートコンプリート ====================
function setupAutocompleteList(input, items, onbegin, onend) {
    let currentFocus = -1;
    
    const collator = new Intl.Collator(undefined, {
        numeric: true,
        sensitivity: "base",
    });
    
    items.sort(collator.compare);
    
    input.oninput = function () {
        onbegin();
        
        let pattern = this.value;
        closeAllLists();
        
        if (pattern.length === 0) {
            return false;
        }
        
        if (items.includes(pattern)) {
            closeAllLists();
            onend(input);
            return false;
        }
        
        const list = document.createElement("DIV");
        list.setAttribute("id", this.id + "-autocomplete-list");
        list.setAttribute("class", "autocomplete-items");
        this.parentNode.appendChild(list);
        
        const patterns = split(pattern.toUpperCase());
        let count = 0;
        for (const item of items) {
            const matches = match(item, patterns);
            if (matches.length == 0) {
                continue;
            }
            
            count += 1;
            if (count >= 15) {
                let div = document.createElement("DIV");
                div.innerText = "...";
                list.appendChild(div);
                break;
            } else {
                let div = document.createElement("DIV");
                let prev = 0;
                let html = "";
                for (const m of matches) {
                    html += item.substr(prev, m.begin - prev);
                    html += `<strong>${item.substr(m.begin, m.length)}</strong>`;
                    prev = m.begin + m.length;
                }
                html += item.substr(prev);
                html += `<input type="hidden" value="${item}">`;
                div.innerHTML = html;
                
                div.addEventListener("click", function () {
                    input.value = this.getElementsByTagName("input")[0].value;
                    closeAllLists();
                    onend(input);
                });
                
                list.appendChild(div);
            }
        }
    };
    
    input.onkeydown = function (e) {
        let x = document.getElementById(this.id + "-autocomplete-list");
        if (x) x = x.getElementsByTagName("div");
        if (e.keyCode == 40) {
            currentFocus += 1;
            setActive(x);
        } else if (e.keyCode == 38) {
            currentFocus -= 1;
            setActive(x);
        } else if (e.keyCode == 13) {
            e.preventDefault();
            if (currentFocus > -1) {
                if (x) x[currentFocus].click();
            }
        }
    };
    
    function setActive(xs) {
        if (!xs) return false;
        for (const x of xs) {
            x.classList.remove("autocomplete-active");
        }
        if (currentFocus >= xs.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = xs.length - 1;
        xs[currentFocus].classList.add("autocomplete-active");
    }
    
    function closeAllLists(elmnt) {
        for (const x of document.querySelectorAll(".autocomplete-items")) {
            if (elmnt != x && elmnt != input) {
                x.parentNode.removeChild(x);
            }
        }
    }
    
    document.addEventListener("click", (e) => {
        closeAllLists(e.target);
    });
}

function match(value, patterns) {
    const item = value.toUpperCase();
    let matches = [];
    for (const p of patterns) {
        const i = item.indexOf(p);
        if (i == -1) return [];
        matches.push({ begin: i, length: p.length });
    }
    
    matches.sort((a, b) => a.begin > b.begin);
    
    let prev = null;
    let ranges = [];
    for (const m of matches) {
        if (prev && m.begin <= prev.begin + prev.length) {
            prev.length = Math.max(prev.length, m.begin + m.length - prev.begin);
        } else {
            ranges.push(m);
            prev = m;
        }
    }
    return ranges;
}

// ==================== イベントハンドラ ====================
async function handleVersionChange(e) {
    await DeviceContext.update({
        version: e.target.value,
        forceReload: true,
        trigger: 'version-change'
    });
    
    if (app.devicesMap) {
        const modelsEl = document.getElementById('models');
        if (modelsEl) {
            setupAutocompleteList(
                modelsEl,
                Object.keys(app.devicesMap),
                hideDeviceInfo,
                (input) => changeModel(app.selectedVersion, app.devicesMap, input.value)
            );
        }
    }
}

// ==================== イベントバインディング ====================
function bindFieldEvents(fieldIds, events = ['input'], callback = null) {
    let debounceTimer;
    const debouncedHandler = (...args) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const handler = callback || (() => syncTemplateAndPackages({ trigger: 'script' }));
            handler(...args);
        }, 300);
    };
    
    fieldIds.forEach(fieldId => {
        const el = document.getElementById(fieldId);
        if (el) {
            const eventList = Array.isArray(events) ? events : [events];
            eventList.forEach(eventType => {
                el.addEventListener(eventType, debouncedHandler);
            });
        }
    });
}

function bindEvents() {
    console.log('[BIND] bindEvents called, eventsbound =', eventsbound);
    
    if (eventsbound) {
        console.log('[BIND] Events already bound, skipping');
        return;
    }
    
    console.log('[BIND] Setting eventsbound = true');
    eventsbound = true;
    
    const versionsEl = document.getElementById('versions');
    if (versionsEl) versionsEl.addEventListener('change', handleVersionChange);
    
    const modelsEl = document.getElementById('models');
    if (modelsEl) {
        if (app.devicesMap) {
            setupAutocompleteList(
                modelsEl,
                Object.keys(app.devicesMap),
                hideDeviceInfo,
                (input) => changeModel(app.selectedVersion, app.devicesMap, input.value)
            );
        }
    }

    const aiosConfigDetails = document.getElementById('use-aios-config-details');
    if (aiosConfigDetails) aiosConfigDetails.addEventListener('toggle', toggleAiosConfig);
    
    const pkgSelectorDetails = document.getElementById('use-package-selector-details');
    if (pkgSelectorDetails) pkgSelectorDetails.addEventListener('toggle', togglePackageSelector);
    
    const buildBtnEl = document.getElementById('request-build');
    if (buildBtnEl) {
        console.log('[BIND] Adding click listener to build button');
        
        buildBtnEl.removeAttribute('href');
        buildBtnEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            
            console.log('[BIND] About to call buildAsuRequest');
            buildAsuRequest();
            console.log('[BIND] buildAsuRequest call completed');
        });
    }

    const postinstDetails = document.getElementById('postinst-details');
    if (postinstDetails) {
        postinstDetails.addEventListener('toggle', function() {
            if (this.open) {
                adjustTextareaHeight('asu-packages');
            }
        });
    }
    
    const uciDefaultsDetails = document.getElementById('uci-defaults-details');
    if (uciDefaultsDetails) {
        uciDefaultsDetails.addEventListener('toggle', function() {
            if (this.open) {
                adjustTextareaHeight('uci-defaults-content');
            }
        });
    }
    
    const asuPackages = document.getElementById('asu-packages');
    if (asuPackages) {
        asuPackages.addEventListener('input', function() {
            adjustTextareaHeight('asu-packages');
        });
    }
    
    const uciDefaultsContent = document.getElementById('uci-defaults-content');
    if (uciDefaultsContent) {
        uciDefaultsContent.addEventListener('input', function() {
            adjustTextareaHeight('uci-defaults-content');
        });
    }

    const basicFields = [
        'aios-language',
        'aios-country', 
        'aios-timezone',
        'aios-zonename',
        'aios-lan-ipv4',
        'aios-lan-ipv6',
        'aios-device-name',
        'aios-root-password',
        'aios-wifi-ssid',
        'aios-wifi-password',
        'aios-ssh-interface',
        'aios-ssh-port',
        'aios-flow-offloading',
        'aios-backup-path'
    ];

    const fieldGroups = {
        basic: basicFields,
        pppoe: ['pppoe-username', 'pppoe-password'],
        dslite: ['dslite-aftr-address', 'dslite-aftr-type', 'dslite-area'],
        mape: [
            'mape-br', 'mape-ealen', 'mape-ipv4-prefix', 'mape-ipv4-prefixlen',
            'mape-ipv6-prefix', 'mape-ipv6-prefixlen', 'mape-psid-offset',
            'mape-psidlen', 'mape-gua-prefix'
        ],
        ap: ['ap-ip-address', 'ap-gateway']
    };

    bindFieldEvents(fieldGroups.basic);
    bindFieldEvents(fieldGroups.pppoe);
    bindFieldEvents(fieldGroups.dslite, ['input', 'change']);
    bindFieldEvents(fieldGroups.mape);
    bindFieldEvents(fieldGroups.ap);

    document.querySelectorAll('input[name="dsliteMode"]').forEach(radio => {
        radio.addEventListener('change', handleDsliteModeChange);
    });
    
    document.querySelectorAll('input[name="connectionMode"]').forEach(radio => {
        radio.addEventListener('change', handleConnectionModeChange);
    });
    
    document.querySelectorAll('input[name="connectionType"]').forEach(radio => {
        radio.addEventListener('change', handleConnectionTypeChange);
    });
    
    document.querySelectorAll('input[name="mapeType"]').forEach(radio => {
        radio.addEventListener('change', handleMapeTypeChange);
    });
    
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.autocomplete')) {
            hideAutocomplete();
        }
    });
    
    document.querySelectorAll('input[name="netOptimizer"]').forEach(radio => {
        radio.addEventListener('change', handleNetOptimizerChange);
    });
    
    document.querySelectorAll('input[name="netOptimizerMode"]').forEach(radio => {
        radio.addEventListener('change', handleNetOptimizerModeChange);
    });

    const netOptFields = [
        'netopt-rmem', 'netopt-wmem', 'netopt-conntrack',
        'netopt-backlog', 'netopt-somaxconn', 'netopt-congestion'
    ];
    bindFieldEvents(netOptFields);
    
    const manualSection = document.getElementById('manual-connection-section');
    if (manualSection) manualSection.style.display = 'none';

    const ispDetectionGroup = document.getElementById('isp-detection-group');
    if (ispDetectionGroup) ispDetectionGroup.style.display = 'block';

    const netOptimizerSection = document.getElementById('net-optimizer-section');
    if (netOptimizerSection) netOptimizerSection.style.display = 'block';
    const netOptimizerManual = document.getElementById('net-optimizer-manual');
    if (netOptimizerManual) netOptimizerManual.style.display = 'none';

    const connectionSections = [
        'dhcp-section',
        'pppoe-section',
        'dslite-section', 
        'mape-manual-section',
        'ap-section'
    ];

    connectionSections.forEach(id => {
        const section = document.getElementById(id);
        if (section) section.style.display = 'none';
    });
}

// Export functions for other modules
window.appState = app;
window.currentDevice = current_device;
window.ErrorHandler = ErrorHandler;
window.ResetManager = ResetManager;
window.DeviceContext = DeviceContext;

