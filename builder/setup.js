// ==================== Setup.sh テンプレート読み込み ====================
function loadSetupScript() {
    fetch('scripts/setup.sh', { cache: 'no-store' })
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.text();
        })
        .then(text => {
            window.SETUP_SH_TEMPLATE = text;
            const el = document.getElementById('setup-script');
            if (el) el.textContent = text;
        })
        .catch(err => {
            console.error('setup.sh 読み込みエラー:', err);
            window.SETUP_SH_TEMPLATE = '';
        });
}

document.addEventListener('DOMContentLoaded', loadSetupScript);

// ==================== MAP-E処理モジュール ====================
const MapEProcessor = {
    isActive(config, apiInfo) {
        if (config.connectionMode === 'auto') {
            return !!(apiInfo?.mape?.brIpv6Address);
        } else if (config.connectionMode === 'manual') {
            return config.connectionType === 'mape';
        }
        return false;
    },
    
    isScriptCached() {
        return window.mapShCache !== undefined && window.mapShCache !== null;
    },
    
    async ensureScriptReady() {
        if (!window.mapShCache) {
            await loadMapSh();
            
            if (!window.mapShCache) {
                throw new Error('Failed to download map.sh script. Please check your internet connection and try again.');
            }
        }
    },
    
    replacePlaceholder(content) {
        if (!content.includes('${map_sh_content}')) {
            return content;
        }
        
        if (!window.mapShCache) {
            throw new Error('MAP-E script not available in cache');
        }
        
        const result = content.replace(/\$\{map_sh_content\}/g, window.mapShCache);
        
        if (result.includes('${map_sh_content}')) {
            throw new Error('MAP-E script embedding failed - placeholder still exists');
        }
        
        return result;
    },
    
    async prepareForDisplay(config, apiInfo) {
        if (this.isActive(config, apiInfo)) {
            await loadMapSh();
        }
    },
    
    async processForBuild(script, config, apiInfo) {
        if (!this.isActive(config, apiInfo)) {
            return script;
        }
    
        if (!script.includes('${map_sh_content}')) {
            return script;
        }
    
        await this.ensureScriptReady();
        return this.replacePlaceholder(script);
    }
};

async function loadMapSh() {
    console.log('[MAP-E Download] Starting download');
    
    if (window.mapShCache !== undefined) {
        console.log('[MAP-E Download] Already cached');
        return;
    }
    
    try {
        const scriptUrl = 'https://site-u.pages.dev/build/scripts/map.sh.new';
        console.log('[MAP-E Download] URL:', scriptUrl);
        
        const response = await fetch(scriptUrl);
        if (response.ok) {
            const content = await response.text();
            if (content && content.trim().length > 0) {
                window.mapShCache = content;
                console.log('[MAP-E Download] ✔ Saved to cache, length:', content.length);
            } else {
                console.error('[MAP-E Download] ✗ Empty response');
                window.mapShCache = '';
            }
        } else {
            console.error('[MAP-E Download] ✗ HTTP', response.status);
            window.mapShCache = '';
        }
    } catch (error) {
        console.error('[MAP-E Download] ✗ Failed:', error);
        window.mapShCache = '';
    }
}

// ==================== ISP情報関連 ====================
async function fetchApiInfoAndUpdate() {
    try {
        updateIspDisplay('Fetching', 'Retrieving ISP information...');
        const apiInfo = await fetchApiInfo();
        window.cachedApiInfo = apiInfo;
        if (apiInfo) {
            setIfEmpty('aios-country', apiInfo.country);
            setIfEmpty('aios-zonename', apiInfo.zonename);
            setIfEmpty('aios-timezone', apiInfo.timezone);

            const isp = buildIspStatus(apiInfo);
            updateIspDisplay(isp.status, isp.details);

            if (apiInfo.mape && apiInfo.mape.brIpv6Address) {
                await loadMapSh();
            }

            updateGuaSectionVisibility();

            if (apiInfo.mape && apiInfo.mape.brIpv6Address) {
                setIfEmpty('mape-br', apiInfo.mape.brIpv6Address);
                setIfEmpty('mape-ealen', apiInfo.mape.eaBitLength || '');
                setIfEmpty('mape-ipv4-prefix', apiInfo.mape.ipv4Prefix || '');
                setIfEmpty('mape-ipv4-prefixlen', apiInfo.mape.ipv4PrefixLength || '');
                setIfEmpty('mape-ipv6-prefix', apiInfo.mape.ipv6Prefix || '');
                setIfEmpty('mape-ipv6-prefixlen', apiInfo.mape.ipv6PrefixLength || '');
                setIfEmpty('mape-psid-offset', apiInfo.mape.psIdOffset || '');
                setIfEmpty('mape-psidlen', apiInfo.mape.psidlen || '');
            }
            
            if (apiInfo.mape && apiInfo.mape.aftrType) {
                setIfEmpty('dslite-aftr-type', apiInfo.mape.aftrType);
                setIfEmpty('dslite-aftr-address', apiInfo.mape.aftrIpv6Address);
            }
            
        } else {
            updateIspDisplay(
                'Auto-detection failed',
                'API connection error or unsupported ISP\nManual configuration required.'
            );
        }

    } catch (error) {
        console.error('ISP info fetch error:', error);
        updateIspDisplay(
            'Fetch error',
            'API connection failed.\nPlease use manual configuration for offline environments.'
        );
    }
}

async function fetchApiInfo() {
    const apis = [
        'https://auto-config.site-u.workers.dev/',
        'https://site-u2023.github.io/api/auto-config/'
    ];
    
    for (const apiUrl of apis) {
        try {
            const cacheBreaker = `?_t=${Date.now()}&_r=${Math.random()}`;
            const finalUrl = apiUrl + cacheBreaker;
            
            const response = await fetch(finalUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                timeout: 10000
            });
            
            console.log(`API response status (${apiUrl}):`, response.status);
            
            if (!response.ok) {
                console.warn(`API access failed with status: ${response.status} (${apiUrl})`);
                continue;
            }
            
            const data = await response.json();
            
            if (data) {
                if (data.rule && data.mape === undefined) {
                    data.mape = data.rule;
                }
                if (data.mape && data.rule === undefined) {
                    data.rule = data.mape;
                }
            }
            
            return data;
            
        } catch (error) {
            console.error(`Failed to fetch from ${apiUrl}:`, error);
        }
    }
    
    console.error('All API endpoints failed');
    return null;
}

function updateIspDisplay(status, details) {
    const statusMessage = document.getElementById('isp-status-message');
    const technicalInfo = document.getElementById('isp-technical-info');

    statusMessage.textContent = status;

    if (details) {
        technicalInfo.innerHTML = details;
        technicalInfo.style.display = 'block';
    } else {
        technicalInfo.style.display = 'none';
    }
}

function buildIspStatus(apiInfo) {
    if (!apiInfo) {
        return {
            status: 'Auto-detection failed',
            details: 'API connection error or unsupported ISP\nManual configuration required.'
        };
    }

    let statusText = 'Auto-detection successful';
    let details = '';

    if (apiInfo.isp) details += `ISP: ${apiInfo.isp}\n`;
    if (apiInfo.as) details += `AS: ${apiInfo.as}\n`;

    if (apiInfo.mape) {
        if (apiInfo.mape.aftrType) {
            statusText += ' - DS-Lite support detected';
            details += `\n[DS-Lite Configuration]\n`;
            details += `aftrType: ${apiInfo.mape.aftrType}\n`;
            if (apiInfo.mape.aftrIpv6Address) {
                details += `aftrIpv6Address: ${apiInfo.mape.aftrIpv6Address}\n`;
            }
        } else if (apiInfo.mape.brIpv6Address) {
            statusText += ' - MAP-E support detected';
            details += `\n[MAP-E Configuration]\n`;
            details += `brIpv6Address: ${apiInfo.mape.brIpv6Address}\n`;
            details += `eaBitLength: ${apiInfo.mape.eaBitLength}\n`;
            details += `ipv4Prefix: ${apiInfo.mape.ipv4Prefix}\n`;
            details += `ipv4PrefixLength: ${apiInfo.mape.ipv4PrefixLength}\n`;
            details += `ipv6Prefix: ${apiInfo.mape.ipv6Prefix}\n`;
            details += `ipv6PrefixLength: ${apiInfo.mape.ipv6PrefixLength}\n`;
            details += `psIdOffset: ${apiInfo.mape.psIdOffset}\n`;
            details += `psidlen: ${apiInfo.mape.psidlen}\n`;
        }
    } else {
        statusText += ' - DHCP/PPPoE environment';
        details += '\nStandard DHCP or PPPoE connection environment detected.';
    }

    const formatted = details
        .split('\n')
        .map(line => `<div>${line}</div>`)
        .join('');

    return { status: statusText, details: formatted };
}

function setIfEmpty(id, value) {
    const el = document.getElementById(id);
    if (el && !el.value && value != null && value !== '') {
        el.value = value;
    }
}

// ==================== 接続設定管理 ====================
function applyConnectionSettingsChange() {
    updateGuaSectionVisibility();
    applyInitialsFromApi(document.querySelector('input[name="connectionType"]:checked')?.value || '');
    syncTemplateAndPackages({ trigger: 'connection-change' });
    showDeviceInfo();
}

function handleConnectionModeChange(e) {
    const manualSection = document.getElementById('manual-connection-section');
    const ispDetectionGroup = document.getElementById('isp-detection-group');
    
    if (e.target.value === 'manual') {
        manualSection.style.display = 'block';
        if (ispDetectionGroup) {
            ispDetectionGroup.style.display = 'none';
        }
    } else {
        manualSection.style.display = 'none';
        
        window.ResetManager.resetAllConnectionValues();
        window.ResetManager.resetConnectionType();
        window.ResetManager.resetDsliteSettings();
        window.ResetManager.resetMapeSettings();
        
        if (ispDetectionGroup) {
            ispDetectionGroup.style.display = 'block';
        }
    }
    
    applyConnectionSettingsChange();
}

function handleConnectionTypeChange(e) {
    window.ResetManager.clearPPPoEValues();
    window.ResetManager.clearDSLiteValues();
    window.ResetManager.clearMAPEValues();
    window.ResetManager.clearAPValues();
    window.ResetManager.resetDsliteSettings();
    window.ResetManager.resetMapeSettings();
    
    document.getElementById('ap-ip-address').value = '192.168.1.2';
    document.getElementById('ap-gateway').value = '192.168.1.1';
    
    const api = window.cachedApiInfo?.mape || {};
    document.getElementById('mape-br').value = api.brIpv6Address || '';
    document.getElementById('mape-ealen').value = api.eaBitLength || '';
    document.getElementById('mape-ipv4-prefix').value = api.ipv4Prefix || '';
    document.getElementById('mape-ipv4-prefixlen').value = api.ipv4PrefixLength || '';
    document.getElementById('mape-ipv6-prefix').value = api.ipv6Prefix || '';
    document.getElementById('mape-ipv6-prefixlen').value = api.ipv6PrefixLength || '';
    document.getElementById('mape-psid-offset').value = api.psIdOffset || '';
    document.getElementById('mape-psidlen').value = api.psidlen || '';
    document.getElementById('mape-gua-prefix').value = '';

    const mapeAuto = document.getElementById('mape-auto');
    const mapeGua = document.getElementById('mape-gua');
    const mapePd = document.getElementById('mape-pd');
    if (mapeAuto) mapeAuto.checked = false;
    if (mapeGua) mapeGua.checked = false;
    if (mapePd) mapePd.checked = false;
    
    const dhcpSection = document.getElementById('dhcp-section');
    const pppoeSection = document.getElementById('pppoe-section');
    const dsliteSection = document.getElementById('dslite-section');
    const mapeManualSection = document.getElementById('mape-manual-section');
    const apSection = document.getElementById('ap-section');
    
    if (dhcpSection) dhcpSection.style.display = 'none';
    pppoeSection.style.display = 'none';
    dsliteSection.style.display = 'none';
    mapeManualSection.style.display = 'none';
    if (apSection) apSection.style.display = 'none';
    
    const apiInfo = window.cachedApiInfo || {};
    const hasAftr = !!(apiInfo.mape && apiInfo.mape.aftrIpv6Address);
    const hasMape = !!(apiInfo.mape && apiInfo.mape.brIpv6Address);
    
    if (e.target.value === 'dhcp') {
        if (dhcpSection) dhcpSection.style.display = 'block';
    } else if (e.target.value === 'pppoe') {
        pppoeSection.style.display = 'block';
    } else if (e.target.value === 'dslite') {
        dsliteSection.style.display = 'block';
        
        const dsliteAuto = document.getElementById('dslite-auto');
        const dsliteManual = document.getElementById('dslite-manual');
        const dsliteHint = document.getElementById('dslite-mode-hint');
        
        if (hasAftr) {
            dsliteAuto.disabled = false;
            dsliteAuto.checked = true;
            dsliteManual.checked = false;
            if (dsliteHint) dsliteHint.textContent = 'Auto: Use ISP-detected AFTR address';
        } else {
            dsliteAuto.disabled = true;
            dsliteAuto.checked = false;
            dsliteManual.checked = true;
            if (dsliteHint) dsliteHint.textContent = 'Auto not available (no AFTR detected)';
        }
        
        const manualFields = document.getElementById('dslite-manual-fields');
        if (manualFields) {
            manualFields.style.display = hasAftr ? 'none' : 'block';
        }
        
    } else if (e.target.value === 'mape') {
        mapeManualSection.style.display = 'block';
        
        const mapeAuto = document.getElementById('mape-auto');
        const mapeGua = document.getElementById('mape-gua');
        const mapePd = document.getElementById('mape-pd');
        
        if (hasMape) {
            mapeAuto.disabled = false;
            mapeAuto.checked = true;
            if (mapeGua) mapeGua.checked = false;
            if (mapePd) mapePd.checked = false;
        } else {
            mapeAuto.disabled = true;
            mapeAuto.checked = false;
            if (mapeGua) {
                mapeGua.checked = true;
            } else if (mapePd) {
                mapePd.checked = true;
            }
        }
        
        if (window.mapShCache === undefined) {
            (async () => {
                try {
                    await loadMapSh();
                } catch (err) {
                    console.error('map.sh load failed:', err);
                }
                applyConnectionSettingsChange();
            })();
            return;
        }
    } else if (e.target.value === 'ap') {
        if (apSection) apSection.style.display = 'block';
    }
    
    applyConnectionSettingsChange();
}

function handleMapeTypeChange(e) {
    applyConnectionSettingsChange();
}

function handleDsliteModeChange(e) {
    const manualFields = document.getElementById('dslite-manual-fields');
    const aftrAddressField = document.getElementById('dslite-aftr-address');
    
    if (e.target.value === 'manual') {
        manualFields.style.display = 'block';
        applyInitialsFromApi('dslite');
    } else {
        manualFields.style.display = 'none';
        if (window.cachedApiInfo && window.cachedApiInfo.mape && window.cachedApiInfo.mape.aftrIpv6Address) {
            aftrAddressField.value = window.cachedApiInfo.mape.aftrIpv6Address;
        }
    }
    
    applyConnectionSettingsChange();
}

const NETOPT_DEFAULTS = {
    rmem: '4096 131072 8388608',
    wmem: '4096 131072 8388608',
    conntrack: '131072',
    backlog: '5000',
    somaxconn: '16384',
    congestion: 'cubic'
};

function resetNetOptimizerValues() {
    document.getElementById('netopt-rmem').value = NETOPT_DEFAULTS.rmem;
    document.getElementById('netopt-wmem').value = NETOPT_DEFAULTS.wmem;
    document.getElementById('netopt-conntrack').value = NETOPT_DEFAULTS.conntrack;
    document.getElementById('netopt-backlog').value = NETOPT_DEFAULTS.backlog;
    document.getElementById('netopt-somaxconn').value = NETOPT_DEFAULTS.somaxconn;
    document.getElementById('netopt-congestion').value = NETOPT_DEFAULTS.congestion;
}

function handleNetOptimizerChange(e) {
    const optimizerSection = document.getElementById('net-optimizer-section');
    
    if (e.target.value === 'enabled') {
        optimizerSection.style.display = 'block';
        window.ResetManager.resetNetOptimizerSettings();
    } else {
        optimizerSection.style.display = 'none';
        document.getElementById('net-optimizer-manual').style.display = 'none';
        window.ResetManager.clearNetOptimizerValues();
    }
    
    syncTemplateAndPackages({ trigger: 'netopt-change' });
}

function handleNetOptimizerModeChange(e) {
    const manualSection = document.getElementById('net-optimizer-manual');
    
    if (e && e.target && e.target.value === 'manual') {
        manualSection.style.display = 'block';
        resetNetOptimizerValues();
    } else {
        manualSection.style.display = 'none';
        resetNetOptimizerValues();
    }
    
    syncTemplateAndPackages({ trigger: 'netopt-mode-change' });
}

// ==================== GUA関連 ====================
function isGlobalUnicastIPv6(ip) {
    if (!ip) return false;
    const norm = String(ip).trim().toLowerCase();
    return /^(2|3)[0-9a-f]/.test(norm) && !/^fd/.test(norm) && !/^fe8/.test(norm);
}

function updateGuaSectionVisibility() {
    const guaSection = document.getElementById('mape-gua-section');
    const mapeType = document.querySelector('input[name="mapeType"]:checked')?.value || 'auto';
    const connectionMode = document.querySelector('input[name="connectionMode"]:checked')?.value || 'auto';
    const connectionType = document.querySelector('input[name="connectionType"]:checked')?.value || 'dhcp';

    const api = window.cachedApiInfo || {};
    const apiMape = api.mape || {};
    const apiIPv6 = api.ipv6 || '';
    const hasGua = isGlobalUnicastIPv6(apiIPv6);

    let shouldShow = false;

    if (connectionType === 'mape') {
        if (connectionMode === 'auto') {
            shouldShow = !!apiMape.brIpv6Address && hasGua;
        } else {
            if (mapeType === 'gua') {
                shouldShow = true;
            } else if (mapeType === 'auto') {
                shouldShow = !!apiMape.brIpv6Address && hasGua;
            } else {
                shouldShow = false;
            }
        }
    }

    if (guaSection) {
        guaSection.style.display = shouldShow ? 'block' : 'none';
    }

    if (shouldShow) {
        const guaInput = document.getElementById('mape-gua-prefix');
        if (guaInput && !guaInput.value) {
            const guaPrefix = calculateGuaPrefixFromApi();
            if (guaPrefix) guaInput.value = guaPrefix;
        }
    }
}

function calculatePrefix(ipv6, length = 64) {
    if (!ipv6) return '';
    const segments = ipv6.split(':');
    if (segments.length >= 4) {
        const prefix = segments.slice(0, 4).join(':');
        return `${prefix}::/${length}`;
    }
    return '';
}

function calculateGuaPrefixFromApi() {
    return calculatePrefix(window.cachedApiInfo?.ipv6 || '', 64);
}

function applyInitialsFromApi(type) {
    if (type === 'dslite') {
        const aftrInput = document.getElementById('dslite-aftr-address');
        const dsliteMode = document.querySelector('input[name="dsliteMode"]:checked')?.value || 'auto';
        
        if (dsliteMode === 'auto') {
            if (window.cachedApiInfo && window.cachedApiInfo.mape && window.cachedApiInfo.mape.aftrIpv6Address) {
                if (aftrInput) {
                    aftrInput.value = window.cachedApiInfo.mape.aftrIpv6Address;
                }
            }
        } else {
            const areaSel = document.getElementById('dslite-area');
            const typeSel = document.getElementById('dslite-aftr-type');

            const area = areaSel?.value || 'east';
            const aftrType = typeSel?.value || 'transix';

            const aftrMap = {
                transix: {
                    east: '2404:8e00::feed:100',
                    west: '2404:8e01::feed:100'
                },
                xpass: {
                    east: '2001:f60:0:200::1:1',
                    west: '2001:f60:0:200::1:1'
                },
                v6option: {
                    east: '2404:8e00::feed:101',
                    west: '2404:8e01::feed:101'
                }
            };

            if (aftrInput) {
                const regionKey = area === 'west' ? 'west' : 'east';
                aftrInput.value = aftrMap[aftrType]?.[regionKey] || '';
            }
        }
    }

    if (type === 'mape') {
        const s = (window.cachedApiInfo && window.cachedApiInfo.mape) ? window.cachedApiInfo.mape : null;

        const set = (id, val) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (val !== undefined && val !== null) el.value = val;
        };

        if (s) {
            set('mape-br', s.brIpv6Address);
            set('mape-ealen', s.eaBitLength);
            set('mape-ipv4-prefix', s.ipv4Prefix);
            set('mape-ipv4-prefixlen', s.ipv4PrefixLength);
            set('mape-ipv6-prefix', s.ipv6Prefix);
            set('mape-ipv6-prefixlen', s.ipv6PrefixLength);
            set('mape-psid-offset', s.psIdOffset);
            set('mape-psidlen', s.psidlen);
        }
        
        const guaPrefix = calculateGuaPrefixFromApi();
        if (guaPrefix) {
            set('mape-gua-prefix', guaPrefix);
        }
        
        updateGuaSectionVisibility();
    }
}

// ==================== テンプレート設定 ====================
async function updateConfiguredTemplate() {
    try {
        let content = document.getElementById('uci-defaults-content').value;

        if (!content || content.trim() === '' || content.includes('Failed to load setup.sh template')) {
            content = window.SETUP_SH_TEMPLATE;
            window.app.templateLoaded = true;
        } else if (!window.app.templateLoaded) {
            document.getElementById('uci-defaults-content').value = window.SETUP_SH_TEMPLATE;
            window.app.templateLoaded = true;
        }

        const config = getAiosConfig();
        const apiInfo = window.cachedApiInfo || null;

        const selectedPackages = new Set(split(document.getElementById('asu-packages').value));
        const customized = await customizeSetupScript(content, config, apiInfo, selectedPackages);
        document.getElementById('uci-defaults-content').value = customized;
    } catch (error) {
        console.error('Template update error:', error);
    }
}

async function customizeSetupScript(content, userConfig, apiInfo, selectedPackages) {
    let customized = content;

    const api = apiInfo?.mape || {};
    const apiHasDslite = !!api.aftrIpv6Address;
    const apiHasMape = !!api.brIpv6Address;

    const mapeVals = {
        br: userConfig.mapeBr || (apiHasMape ? api.brIpv6Address : ''),
        ealen: userConfig.mapeEalen || (apiHasMape ? api.eaBitLength : ''),
        v4p: userConfig.mapeIpv4Prefix || (apiHasMape ? api.ipv4Prefix : ''),
        v4l: userConfig.mapeIpv4Prefixlen || (apiHasMape ? api.ipv4PrefixLength : ''),
        v6p: userConfig.mapeIpv6Prefix || (apiHasMape ? api.ipv6Prefix : ''),
        v6l: userConfig.mapeIpv6Prefixlen || (apiHasMape ? api.ipv6PrefixLength : ''),
        off: userConfig.mapePsidOffset || (apiHasMape ? api.psIdOffset : ''),
        psid: userConfig.mapePsidlen || (apiHasMape ? api.psidlen : '')
    };

    const guaPrefix = userConfig.mapeGuaPrefix || calculateGuaPrefixFromApi() || '';

    const manual = (userConfig.connectionMode === 'manual');
    let activeProto = '';

    if (manual) {
        activeProto = userConfig.connectionType;
    } else {
        if (apiHasDslite) activeProto = 'dslite';
        else if (apiHasMape) activeProto = 'mape';
        else activeProto = 'dhcp';
    }

    const apActive = (activeProto === 'ap');
    const wifiActive = !!(userConfig.wifiSSID && userConfig.wifiPassword && String(userConfig.wifiPassword).length >= 8);
    const pppoeActive = (activeProto === 'pppoe');
    const mapeActive = (activeProto === 'mape');
    const guaActive = mapeActive && (userConfig.mapeType === 'gua' || userConfig.mapeType === 'auto');
    
    let dsliteAddress = '';
    if (userConfig.dsliteMode === 'auto') {
        dsliteAddress = (apiInfo?.mape?.aftrIpv6Address) || userConfig.dsliteAftrAddress || '';
    } else {
        dsliteAddress = userConfig.dsliteAftrAddress || '';
    }
    const dsliteActive = (activeProto === 'dslite') && !!dsliteAddress;

    const variables = {
        device_name: { value: userConfig.deviceName, active: !!userConfig.deviceName },
        root_password: { value: userConfig.rootPassword, active: !!userConfig.rootPassword },
        language: { value: userConfig.language, active: !!userConfig.language },
        country: { value: userConfig.country, active: !!userConfig.country },
        timezone: { value: userConfig.timezone, active: !!userConfig.timezone },
        zonename: { value: userConfig.zonename, active: !!userConfig.zonename },
        
        lan_ip_address: { value: userConfig.lanIpv4, active: !!userConfig.lanIpv4 && !apActive },
        lan_ipv6_address: { value: userConfig.lanIpv6, active: !!userConfig.lanIpv6 && !apActive },
        
        wlan_name: { value: userConfig.wifiSSID, active: wifiActive },
        wlan_password: { value: userConfig.wifiPassword, active: wifiActive },
        
        ssh_interface: { value: userConfig.sshInterface, active: !!userConfig.sshInterface },
        ssh_port: { value: userConfig.sshPort, active: !!userConfig.sshPort },
        
        flow_offloading_type: { value: userConfig.flowOffloading, active: !!userConfig.flowOffloading },
        backup_path: { value: userConfig.backupPath, active: !!userConfig.backupPath },

        pppoe_username: { value: userConfig.pppoeUsername || '', active: pppoeActive },
        pppoe_password: { value: userConfig.pppoePassword || '', active: pppoeActive },

        dslite_aftr_address: { value: dsliteAddress, active: dsliteActive },

        mape_br: { value: mapeVals.br || '', active: mapeActive },
        mape_ealen: { value: mapeVals.ealen || '', active: mapeActive },
        mape_ipv4_prefix: { value: mapeVals.v4p || '', active: mapeActive },
        mape_ipv4_prefixlen: { value: mapeVals.v4l || '', active: mapeActive },
        mape_ipv6_prefix: { value: mapeVals.v6p || '', active: mapeActive },
        mape_ipv6_prefixlen: { value: mapeVals.v6l || '', active: mapeActive },
        mape_psid_offset: { value: mapeVals.off || '', active: mapeActive },
        mape_psidlen: { value: mapeVals.psid || '', active: mapeActive },
        mape_gua_mode: { value: guaActive ? '1' : '', active: guaActive },
        mape_gua_prefix: { value: guaActive ? guaPrefix : '', active: guaActive },

        ap_ip_address: { value: userConfig.apIpAddress, active: apActive && !!userConfig.apIpAddress },
        ap_gateway: { value: userConfig.apGateway, active: apActive && !!userConfig.apGateway },
        
        enable_netopt: { 
            value: userConfig.netOptimizer === 'enabled' ? '1' : '', 
            active: userConfig.netOptimizer === 'enabled' 
        },
        netopt_manual: { 
            value: userConfig.netOptimizerMode === 'manual' ? '1' : '', 
            active: userConfig.netOptimizer === 'enabled' && userConfig.netOptimizerMode === 'manual' 
        },
        netopt_rmem: { 
            value: userConfig.netOptimizerMode === 'manual' ? userConfig.netOptRmem : NETOPT_DEFAULTS.rmem, 
            active: userConfig.netOptimizer === 'enabled' && userConfig.netOptimizerMode === 'manual' 
        },
        netopt_wmem: { 
            value: userConfig.netOptimizerMode === 'manual' ? userConfig.netOptWmem : NETOPT_DEFAULTS.wmem, 
            active: userConfig.netOptimizer === 'enabled' && userConfig.netOptimizerMode === 'manual' 
        },
        netopt_conntrack: { value: userConfig.netOptConntrack, active: userConfig.netOptimizer === 'enabled' && userConfig.netOptimizerMode === 'manual' },
        netopt_backlog: { value: userConfig.netOptBacklog, active: userConfig.netOptimizer === 'enabled' && userConfig.netOptimizerMode === 'manual' },
        netopt_somaxconn: { value: userConfig.netOptSomaxconn, active: userConfig.netOptimizer === 'enabled' && userConfig.netOptimizerMode === 'manual' },
        netopt_congestion: { value: userConfig.netOptCongestion, active: userConfig.netOptimizer === 'enabled' && userConfig.netOptimizerMode === 'manual' }
    };
    
    if (selectedPackages) {
        const enableMap = {};
        
        window.PACKAGE_DB.categories.forEach(cat => {
            (cat.packages || []).forEach(pkg => {
                if (pkg.enableVar) {
                    enableMap[pkg.name] = pkg.enableVar;
                }
            });
        });

        selectedPackages.forEach(pkgName => {
            const varName = enableMap[pkgName];
            if (varName) {
                variables[varName] = { value: '1', active: true };
            }
        });
    }

    customized = setVariableDefinitions(customized, variables);

    const customCommands = getCustomCommands();
    
    const managedRegion = /(# BEGIN_CUSTOM_COMMANDS\n)([\s\S]*?)(# END_CUSTOM_COMMANDS\n)/;
    
    if (customCommands.length > 0) {
        const commandsText = customCommands.join('\n');
        customized = customized.replace(managedRegion, `$1${commandsText}\n$3`);
    } else {
        customized = customized.replace(managedRegion, `$1$3`);
    }
    
    return customized;
}

function setVariableDefinitions(content, variables) {
    const variableLines = [];
    
    for (const [key, config] of Object.entries(variables)) {
        if (!config || typeof config !== 'object') continue;
        
        const { value, active } = config;
        const safeValue = (value === undefined || value === null) ? '' : String(value).trim();
        
        if (active && safeValue !== '') {
            variableLines.push(`${key}="${safeValue}"`);
        }
    }
    
    const variableText = variableLines.length > 0 ? variableLines.join('\n') : '';
    const managedRegion = /(# BEGIN_VARIABLE_DEFINITIONS\n)([\s\S]*?)(# END_VARIABLE_DEFINITIONS\n)/;
    
    return content.replace(managedRegion, `$1${variableText ? variableText + '\n' : ''}$3`);
}

function getCustomCommands() {
    const commands = [];
    const mainCommand = document.getElementById('command');
    if (mainCommand) {
        const val = mainCommand.value != null ? mainCommand.value.trim() : '';
        if (val.length > 0) {
            commands.push(val);
        }
    }
    const extraInputs = document.querySelectorAll('#commands-autocomplete input.command');
    extraInputs.forEach((el) => {
        if (!el) return;
        const val = el.value != null ? el.value.trim() : '';
        if (val.length > 0) {
            commands.push(val);
        }
    });
    const seen = new Set();
    const uniqueCommands = commands.filter(cmd => {
        if (seen.has(cmd)) return false;
        seen.add(cmd);
        return true;
    });
    return uniqueCommands;
}

function toggleAiosConfig(e) {
    const details = document.getElementById('use-aios-config-details');
    if (details && details.open) {
        updateConfiguredTemplate();
    } else {
        document.getElementById('uci-defaults-content').value = window.SETUP_SH_TEMPLATE;
        window.app.templateLoaded = true;
    }
}

function getAiosConfig() {
    const parseOrEmpty = (id, type = 'string') => {
        const element = document.getElementById(id);
        if (!element) return '';
        
        let val = element.value?.trim();
        if (!val && element.getAttribute('value')) {
            val = element.getAttribute('value').trim();
        }
        if (!val) return '';
        
        if (type === 'int') {
            const num = parseInt(val, 10);
            return isNaN(num) ? '' : num;
        }
        return val;
    };

    const config = {
        language: parseOrEmpty('aios-language'),
        country: parseOrEmpty('aios-country'),
        timezone: parseOrEmpty('aios-timezone'),
        zonename: parseOrEmpty('aios-zonename'),
        deviceName: parseOrEmpty('aios-device-name'),
        lanIpv4: parseOrEmpty('aios-lan-ipv4'),
        lanIpv6: parseOrEmpty('aios-lan-ipv6'),
        rootPassword: parseOrEmpty('aios-root-password'),
        wifiSSID: parseOrEmpty('aios-wifi-ssid'),
        wifiPassword: parseOrEmpty('aios-wifi-password'),
        apIpAddress: parseOrEmpty('ap-ip-address'),
        apGateway: parseOrEmpty('ap-gateway'),
        sshInterface: parseOrEmpty('aios-ssh-interface'),
        sshPort: parseOrEmpty('aios-ssh-port', 'int'),
        flowOffloading: parseOrEmpty('aios-flow-offloading'),
        backupPath: parseOrEmpty('aios-backup-path'),
        
        connectionMode: document.querySelector('input[name="connectionMode"]:checked')?.value || 'auto',
        connectionType: document.querySelector('input[name="connectionType"]:checked')?.value || 'dhcp',
        mapeType: document.querySelector('input[name="mapeType"]:checked')?.value || 'auto',

        pppoeUsername: parseOrEmpty('pppoe-username'),
        pppoePassword: parseOrEmpty('pppoe-password'),

        dsliteAftrAddress: parseOrEmpty('dslite-aftr-address'),
        dsliteMode: document.querySelector('input[name="dsliteMode"]:checked')?.value || 'auto',
        dsliteAftrType: parseOrEmpty('dslite-aftr-type'),
        dsliteArea: parseOrEmpty('dslite-area'),
        
        mapeBr: parseOrEmpty('mape-br'),
        mapeEalen: parseOrEmpty('mape-ealen', 'int'),
        mapeIpv4Prefix: parseOrEmpty('mape-ipv4-prefix'),
        mapeIpv4Prefixlen: parseOrEmpty('mape-ipv4-prefixlen', 'int'),
        mapeIpv6Prefix: parseOrEmpty('mape-ipv6-prefix'),
        mapeIpv6Prefixlen: parseOrEmpty('mape-ipv6-prefixlen', 'int'),
        mapePsidOffset: parseOrEmpty('mape-psid-offset', 'int'),
        mapePsidlen: parseOrEmpty('mape-psidlen', 'int'),
        mapeGuaPrefix: parseOrEmpty('mape-gua-prefix'),
        
        netOptimizer: document.querySelector('input[name="netOptimizer"]:checked')?.value || 'disabled',
        netOptimizerMode: document.querySelector('input[name="netOptimizerMode"]:checked')?.value || 'auto',
        netOptRmem: parseOrEmpty('netopt-rmem'),
        netOptWmem: parseOrEmpty('netopt-wmem'),
        netOptConntrack: parseOrEmpty('netopt-conntrack', 'int'),
        netOptBacklog: parseOrEmpty('netopt-backlog', 'int'),
        netOptSomaxconn: parseOrEmpty('netopt-somaxconn', 'int'),
        netOptCongestion: parseOrEmpty('netopt-congestion')
    };

    return config;
}

// ==================== Commands入力ボックス ====================
(function() {
    const cmdInput = document.getElementById('command');
    if (cmdInput) {
        const commitCommandValue = () => {
            const val = cmdInput.value.trim();
            if (val) {
                syncCommandsToTemplate();
                setTimeout(() => {
                    if (!document.querySelector('#commands-autocomplete input[value=""]')) {
                        createExtraCommandBox();
                    }
                }, 100);
            } else {
                const total = document.querySelectorAll('#command, #commands-autocomplete input.command').length;
                if (total > 1 && cmdInput.parentNode) {
                    cmdInput.parentNode.removeChild(cmdInput);
                }
                syncCommandsToTemplate();
            }
        };
        
        cmdInput.addEventListener('change', commitCommandValue);

        cmdInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.blur();
            }
        });
    }
})();

function createExtraCommandBox() {
    const host = document.getElementById('commands-autocomplete');
    const newInput = document.createElement('input');
    newInput.type = 'text';
    newInput.className = 'form-control command';
    newInput.placeholder = 'uci set system.@system[0].hostname=\'MyRouter\'';
    newInput.autocomplete = 'off';
    newInput.spellcheck = false;
    newInput.autocapitalize = 'off';
    newInput.dataset.extra = '1';

    const commitValue = () => {
        const val = newInput.value.trim();
        if (val) {
            syncCommandsToTemplate();
            if (!document.querySelector('#commands-autocomplete input[value=""]')) {
                createExtraCommandBox();
            }
        } else {
            if (newInput.dataset.extra === '1') {
                host.removeChild(newInput);
            }
            syncCommandsToTemplate();
        }
    };

    newInput.addEventListener('change', commitValue);

    newInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.blur();
        }
    });

    host.appendChild(newInput);
    newInput.focus();
}

function syncCommandsToTemplate() {
    if (document.getElementById('use-aios-config-details').open) {
        updateConfiguredTemplate();
    }
}

// ==================== ビルドエラー処理統一 ====================
const BuildErrorHandler = {
    calculateTotalSize(script, packages) {
        const scriptSize = new Blob([script]).size;
        const packagesSize = new Blob([packages.join(' ')]).size;
        const systemOverhead = 1024;
        const totalSize = scriptSize + packagesSize + systemOverhead;
        
        console.log(`[SIZE CHECK] Script: ${scriptSize}B, Packages: ${packagesSize}B, System: ${systemOverhead}B, Total: ${totalSize}B`);
        
        return {
            scriptSize,
            packagesSize,
            systemOverhead,
            totalSize,
            isOverLimit: totalSize > 20480
        };
    },

    showError(errorType, statusCode, errorData, sizeInfo = null) {
        this.showErrorProgress(errorType, statusCode);
        
        hideProgress();
        showBuildStatus(`Build failed: ${errorType}`, 'error');
        
        const errorDetails = this.buildErrorDetails(errorType, statusCode, errorData, sizeInfo);
        
        const container = document.getElementById('download-links');
        container.innerHTML = errorDetails;
        
        setTimeout(() => {
            container.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
        }, 200);
    },

    showErrorProgress(errorType, statusCode) {
        const progressElement = document.getElementById('build-progress');
        const messageElement = document.getElementById('build-message');
        const progressBar = document.getElementById('progress-bar');
        
        progressBar.style.backgroundColor = '#dc3545';
        progressBar.style.width = '100%';
        messageElement.textContent = `Build failed: ${errorType} (HTTP ${statusCode})`;
        progressElement.style.display = 'block';
        
        setTimeout(() => {
            hideProgress();
        }, 5000);
    },

    buildErrorDetails(errorType, statusCode, errorData, sizeInfo) {
        let html = `
            <div class="asu-error" style="margin-top: 1rem;">
                <h4>Build Failed - ${errorType}</h4>
                <div><strong>HTTP Status:</strong> ${statusCode}</div>
        `;

        if (sizeInfo && sizeInfo.isOverLimit) {
            html += `
                <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 1rem; margin: 1rem 0; border-radius: 0.25rem;">
                    <h5 style="margin-top: 0; color: #721c24;">🚫 Size Limit Exceeded</h5>
                    <div><strong>Total Size:</strong> ${sizeInfo.totalSize} bytes (Limit: 20,480 bytes)</div>
                    <div><strong>Breakdown:</strong></div>
                    <ul style="margin: 0.5rem 0;">
                        <li>Script: ${sizeInfo.scriptSize} bytes</li>
                        <li>Packages: ${sizeInfo.packagesSize} bytes</li>
                        <li>System overhead: ${sizeInfo.systemOverhead} bytes</li>
                    </ul>
                    <div><strong>Over by:</strong> ${sizeInfo.totalSize - 20480} bytes</div>
                </div>
            `;
        }

        if (errorData) {
            if (typeof errorData === 'string') {
                html += `<div><strong>Error Details:</strong></div>
                         <pre style="background: #f8f8f8; padding: 10px; margin: 10px 0; border-radius: 4px; overflow-x: auto; font-size: 0.9em; max-height: 200px; color: #333;">${errorData}</pre>`;
            } else if (typeof errorData === 'object') {
                if (errorData.request_hash) {
                    html += `<div><strong>Request ID:</strong> <code>${errorData.request_hash}</code></div>`;
                }
                
                const excludeFields = ['request_hash'];
                for (const [key, value] of Object.entries(errorData)) {
                    if (!excludeFields.includes(key) && value != null) {
                        html += `<div><strong>${key}:</strong> ${JSON.stringify(value)}</div>`;
                    }
                }
            }
        }

        html += this.getTroubleshootingInfo(errorType, sizeInfo);
        html += '</div>';
        
        return html;
    },

    getTroubleshootingInfo(errorType, sizeInfo) {
        let tips = [];
        
        if (sizeInfo && sizeInfo.isOverLimit) {
            tips.push('Remove unnecessary packages or custom commands to reduce size');
            tips.push('Consider using minimal package selection');
        }
        
        if (errorType.includes('500')) {
            tips.push('Verify network connectivity and try again');
            tips.push('Check if custom script syntax is correct');
            tips.push('Try building without custom packages first');
        }
        
        if (tips.length === 0) {
            tips.push('Verify device selection and network connectivity');
            tips.push('Try again with reduced package selection');
        }

        return `
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 1rem; margin: 1rem 0; border-radius: 0.25rem;">
                <h5 style="margin-top: 0; color: #856404;">⚠️ Troubleshooting</h5>
                <ul style="margin-bottom: 0;">
                    ${tips.map(tip => `<li>${tip}</li>`).join('')}
                </ul>
            </div>
        `;
    }
};

// ==================== ビルド処理 ====================
async function buildAsuRequest() {
    console.log('[buildAsuRequest] Function entered');
    
    if (!window.current_device || !window.current_device.id) {
        console.log('[buildAsuRequest] No device selected');
        alert('Please select a device first');
        return;
    }
    
    console.log('[buildAsuRequest] Device check passed');

    try {
        console.log('[buildAsuRequest] Entering try block');
        document.getElementById('request-build').disabled = true;
        console.log('[buildAsuRequest] Button disabled');
        showProgress('Preparing build request...', 10);
        console.log('[buildAsuRequest] Progress shown');
        
        setTimeout(() => {
            const progressElement = document.getElementById('build-progress');
            if (progressElement) {
                progressElement.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
            }
        }, 200);

        console.log('[buildAsuRequest] Getting packages');
        const packages = split(document.getElementById('asu-packages').value);
        console.log('[buildAsuRequest] Getting script');
        let script = document.getElementById('uci-defaults-content').value;
        const originalSize = script.length;
        console.log('[buildAsuRequest] Calling MapEProcessor');
        
        script = await MapEProcessor.processForBuild(
            script, 
            getAiosConfig(), 
            window.cachedApiInfo
        );
        console.log('[VERIFY] Script size:', originalSize, '→', script.length, '(', script.length - originalSize, 'bytes added)');
        console.log('[buildAsuRequest] MapEProcessor completed');

        console.log('[buildAsuRequest] Building request body');
        const requestBody = {
            target: window.current_device.target,
            profile: window.current_device.id,
            packages: packages,
            version: window.app.selectedVersion
        };

        console.log('[buildAsuRequest] About to send fetch request');

        if (script && script.trim()) {
            requestBody.defaults = script;
        }

        const sizeInfo = BuildErrorHandler.calculateTotalSize(script, packages);
        
        fetch('https://sysupgrade.openwrt.org/api/v1/build', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestBody)
        })
        .then((response) => {
            switch (response.status) {
                case 200:
                    showProgress('Build completed!', 100);
                    response.json().then((mobj) => {
                        if ('stderr' in mobj) {
                            document.getElementById('asu-stderr').innerText = mobj.stderr;
                            document.getElementById('asu-stdout').innerText = mobj.stdout;
                            document.getElementById('asu-log').style.display = 'block';
                        } else {
                            document.getElementById('asu-log').style.display = 'none';
                        }
                        hideProgress();
                        showBuildStatus('Build successful', 'info');
                        mobj['id'] = window.current_device.id;
                        showDownloadLinks(mobj.images || [], mobj, mobj.request_hash);
                    });
                    break;
                case 202:
                    response.json().then((mobj) => {
                        showProgress(`${mobj.imagebuilder_status || 'Processing'}...`, 30);
                        setTimeout(() => pollBuildStatus(mobj.request_hash), 5000);
                    });
                    break;
                case 400:
                case 422:
                case 500:
                    response.text().then((responseText) => {
                        hideProgress();
                        showBuildStatus('Build failed: HTTP 500 Server Error', 'error');
                        
                        const container = document.getElementById('download-links');
                        container.innerHTML = `
                            <div class="asu-error" style="margin-top: 1rem;">
                                <h4>Build Failed - Server Error</h4>
                                <div><strong>HTTP Status:</strong> 500 Internal Server Error</div>
                                <div><strong>Error Details:</strong></div>
                                <pre style="background: #f8f8f8; padding: 10px; margin: 10px 0; border-radius: 4px; overflow-x: auto; font-size: 0.9em; max-height: 200px;">${responseText}</pre>
                            </div>
                            
                            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 1rem; margin: 1rem 0; border-radius: 0.25rem;">
                                <h5 style="margin-top: 0; color: #856404;">⚠️ Troubleshooting</h5>
                                <p style="margin-bottom: 0;">Please verify network connectivity, package selection, and script configuration. Try removing custom packages or scripts, then retry the build.</p>
                            </div>
                        `;
                    });
                    break;
            }
        })
        .catch((err) => {
            BuildErrorHandler.showError('Network Error', null, err.message, sizeInfo);
        });

    } catch (error) {
        console.error('Build request failed:', error);
        hideProgress();
        showBuildStatus(`Build failed: ${error.message}`, 'error');
    } finally {
        document.getElementById('request-build').disabled = false;
    }
}

async function pollBuildStatus(requestHash) {
    const maxAttempts = 120;
    let attempts = 0;
    const startTime = Date.now();

    while (attempts < maxAttempts) {
        try {
            const statusUrl = `https://sysupgrade.openwrt.org/api/v1/build/${requestHash}`;
            const response = await fetch(statusUrl, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                if (response.status === 404 && attempts < 5) {
                    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
                    const minutes = Math.floor(elapsedSeconds / 60);
                    const seconds = elapsedSeconds % 60;
                    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

                    showProgress(`Waiting for build to start... ${timeStr}`, 10);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    attempts++;
                    continue;
                }
                throw new Error(`Status check failed: HTTP ${response.status}`);
            }

            const statusText = await response.text();
            let status;

            try {
                status = JSON.parse(statusText);
            } catch (e) {
                throw new Error('Invalid JSON in status response: ' + statusText);
            }

            const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            const minutes = Math.floor(elapsedSeconds / 60);
            const seconds = elapsedSeconds % 60;
            const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

            const progressPercent = Math.min((elapsedSeconds / 600) * 85 + 10, 95);
            const progressMsg =
                status.detail && typeof status.detail === 'string' ? status.detail :
                status.status && typeof status.status === 'string' ? status.status :
                'Processing';

            if (status.status === 'done' || status.status === 'success' || 
                status.detail === 'done' || status.imagebuilder_status === 'done') {
                const images = status.images || 
                               status.request?.images || 
                               status.request?.files ||
                               status.files || [];

                const rh = status.request_hash || status.request?.request_hash;

                showProgress('Build completed!', 100);
                setTimeout(() => {
                    hideProgress();
                    showBuildStatus('Build successful', 'info');
                    
                    if (status.stderr || status.stdout) {
                        document.getElementById('asu-stderr').textContent = status.stderr || 'No errors';
                        document.getElementById('asu-stdout').textContent = status.stdout || 'No output';
                        document.getElementById('asu-log').style.display = 'block';
                    }
                    
                    showDownloadLinks(images, status, rh);
                }, 500);
                return;
            }

            if (status.status === 'failed' || status.status === 'failure' || 
                status.detail === 'failed' || status.imagebuilder_status === 'failed') {
                
                hideProgress();
                showBuildError(status, null);
                return;
            }

            showProgress(`${progressMsg}... ${timeStr}`, progressPercent);
            await new Promise(resolve => setTimeout(resolve, 5000));
            attempts++;

        } catch (error) {
            if (attempts >= 5) throw error;

            const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            showProgress(`Connection error, retrying... ${elapsedSeconds}s`, 5);
            await new Promise(resolve => setTimeout(resolve, 5000));
            attempts++;
        }
    }

    throw new Error('Build timeout after 10 minutes');
}

function showProgress(message, percentage) {
    document.getElementById('build-message').textContent = message;
    document.getElementById('progress-bar').style.width = `${percentage}%`;
    document.getElementById('build-progress').style.display = 'block';
    
    setTimeout(() => {
        const progressElement = document.getElementById('build-progress');
        if (progressElement) {
            progressElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'nearest',
                inline: 'nearest'
            });
        }
    }, 100);
}

function hideProgress() {
    document.getElementById('build-progress').style.display = 'none';
}

function showBuildStatus(message, type) {
    const bs = document.getElementById('asu-buildstatus');
    
    if (type === 'error') {
        bs.classList.remove('asu-info');
        bs.classList.add('asu-error');
    } else {
        bs.classList.remove('asu-error');
        bs.classList.add('asu-info');
    }
    
    bs.querySelector('span').textContent = message;
    bs.style.display = 'block';
}

function showDownloadLinks(images, fullStatus, requestHash) {
    const container = document.getElementById('download-links');
    
    if (!images || images.length === 0) {
        container.innerHTML = '<h4>Downloads</h4><p>No images available</p>';
        return;
    }
    
    container.innerHTML = `
        <div class="images">
            <h4>Factory Image</h4>
            <p class="text-muted">The factory image is used for the initial flashing of OpenWrt. This would replace an existing firmware.</p>
            <div id="factory-images"></div>
            
            <h4>Sysupgrade Image</h4>
            <p class="text-muted">The sysupgrade image is used to upgrade an existing OpenWrt installation.</p>
            <div id="sysupgrade-images"></div>
            
            <div id="other-images" style="display: none;">
                <h4>Other Images</h4>
                <div id="other-images-content"></div>
            </div>
        </div>
    `;

    const factoryContainer = document.getElementById('factory-images');
    const sysupgradeContainer = document.getElementById('sysupgrade-images');
    const otherContainer = document.getElementById('other-images-content');
    const otherSection = document.getElementById('other-images');
    
    let hasFactory = false;
    let hasSysupgrade = false;
    let hasOther = false;

    images.forEach((image) => {
        if (!image.name || !requestHash) return;
        
        const imageUrl = `https://sysupgrade.openwrt.org/store/${requestHash}/${image.name}`;
        const fileName = image.name;
        
        const link = document.createElement('a');
        link.href = imageUrl;
        link.className = 'download-link';
        link.target = '_blank';
        link.download = fileName;
        link.title = fileName;
        
        let displayName = fileName;
        
        if (image.type) {
            const type = image.type.toLowerCase();
            
            if (type.includes('factory')) {
                displayName = fileName;
                link.textContent = displayName;
                factoryContainer.appendChild(link);
                factoryContainer.appendChild(document.createTextNode(' '));
                hasFactory = true;
            } else if (type.includes('sysupgrade')) {
                displayName = fileName;
                link.textContent = displayName;
                sysupgradeContainer.appendChild(link);
                sysupgradeContainer.appendChild(document.createTextNode(' '));
                hasSysupgrade = true;
            } else {
                displayName = fileName;
                link.textContent = displayName;
                otherContainer.appendChild(link);
                otherContainer.appendChild(document.createTextNode(' '));
                hasOther = true;
            }
        } else {
            const nameLower = fileName.toLowerCase();
            if (nameLower.includes('factory')) {
                link.textContent = displayName;
                factoryContainer.appendChild(link);
                factoryContainer.appendChild(document.createTextNode(' '));
                hasFactory = true;
            } else if (nameLower.includes('sysupgrade')) {
                link.textContent = displayName;
                sysupgradeContainer.appendChild(link);
                sysupgradeContainer.appendChild(document.createTextNode(' '));
                hasSysupgrade = true;
            } else {
                link.textContent = displayName;
                otherContainer.appendChild(link);
                otherContainer.appendChild(document.createTextNode(' '));
                hasOther = true;
            }
        }
    });
    
    if (!hasFactory) {
        factoryContainer.innerHTML = '<span class="text-muted">No factory image available for this device.</span>';
    }
    
    if (!hasSysupgrade) {
        sysupgradeContainer.innerHTML = '<span class="text-muted">No sysupgrade image available for this device.</span>';
    }
    
    if (hasOther) {
        otherSection.style.display = 'block';
    }
    
    if (requestHash) {
        const buildInfo = document.createElement('div');
        buildInfo.className = 'info';
        buildInfo.style.marginTop = '1rem';
        buildInfo.innerHTML = `
            <h5>Build Information</h5>
            <div>Request ID: <code>${requestHash}</code></div>
            <div>Build completed successfully</div>
        `;
        container.appendChild(buildInfo);
    }
}

// Export functions for other modules
window.MapEProcessor = MapEProcessor;
window.loadMapSh = loadMapSh;
window.fetchApiInfoAndUpdate = fetchApiInfoAndUpdate;
window.updateIspDisplay = updateIspDisplay;
window.handleConnectionModeChange = handleConnectionModeChange;
window.handleConnectionTypeChange = handleConnectionTypeChange;
window.handleDsliteModeChange = handleDsliteModeChange;
window.handleMapeTypeChange = handleMapeTypeChange;
window.handleNetOptimizerChange = handleNetOptimizerChange;
window.handleNetOptimizerModeChange = handleNetOptimizerModeChange;
window.toggleAiosConfig = toggleAiosConfig;
window.getAiosConfig = getAiosConfig;
window.updateConfiguredTemplate = updateConfiguredTemplate;
window.buildAsuRequest = buildAsuRequest;
window.showDeviceInfo = showDeviceInfo;
window.setupVersionUrls = setupVersionUrls;
window.showBuildStatus = showBuildStatus;
