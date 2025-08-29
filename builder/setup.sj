// ==================== テンプレート設定 ====================
async function updateConfiguredTemplate() {
    try {
        let content = document.getElementById('uci-defaults-content').value;

    if (!content || content.trim() === '' || content.includes('Failed to load setup.sh template')) {
        content = SETUP_SH_TEMPLATE;
        app.templateLoaded = true;
    } else if (!app.templateLoaded) {
        // 初期表示時にテンプレが未設定なら必ず適用
        document.getElementById('uci-defaults-content').value = SETUP_SH_TEMPLATE;
        app.templateLoaded = true;
    }

        const config = getAiosConfig();
        const apiInfo = window.cachedApiInfo || null;  // キャッシュのみ、API呼び出し削除

        const selectedPackages = new Set(split(document.getElementById('asu-packages').value));
        const customized = await customizeSetupScript(content, config, apiInfo, selectedPackages);
        document.getElementById('uci-defaults-content').value = customized;
    } catch (error) {
        console.error('Template update error:', error);
    }
}

async function customizeSetupScript(content, userConfig, apiInfo, selectedPackages) {
    let customized = content;

    // APIベースの推奨値
    const api = apiInfo?.mape || {};
    const apiHasDslite = !!api.aftrIpv6Address;
    const apiHasMape = !!api.brIpv6Address;

    // MAP-E 候補値
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

    // GUAプレフィックス
    const guaPrefix = userConfig.mapeGuaPrefix || calculateGuaPrefixFromApi() || '';

    // 選択プロトコル
    const manual = (userConfig.connectionMode === 'manual');
    let activeProto = '';

    if (manual) {
        activeProto = userConfig.connectionType;
    } else {
        if (apiHasDslite) activeProto = 'dslite';
        else if (apiHasMape) activeProto = 'mape';
        else activeProto = 'dhcp';
    }

    // AP判定（重要：variables定義より前に行う）
    const apActive = (activeProto === 'ap');
    
    // Wi-Fi設定判定
    const wifiActive = !!(userConfig.wifiSSID && userConfig.wifiPassword && String(userConfig.wifiPassword).length >= 8);
    
    // プロトコル別の判定
    const pppoeActive = (activeProto === 'pppoe');
    const mapeActive = (activeProto === 'mape');
    const guaActive = mapeActive && (userConfig.mapeType === 'gua' || userConfig.mapeType === 'auto');
    
    // DS-Lite設定
    let dsliteAddress = '';
    if (userConfig.dsliteMode === 'auto') {
        dsliteAddress = (apiInfo?.mape?.aftrIpv6Address) || userConfig.dsliteAftrAddress || '';
    } else {
        dsliteAddress = userConfig.dsliteAftrAddress || '';
    }
    const dsliteActive = (activeProto === 'dslite') && !!dsliteAddress;

    // 変数定義オブジェクトを構築
    const variables = {
        // Basic settings
        device_name: { value: userConfig.deviceName, active: !!userConfig.deviceName },
        root_password: { value: userConfig.rootPassword, active: !!userConfig.rootPassword },
        language: { value: userConfig.language, active: !!userConfig.language },
        country: { value: userConfig.country, active: !!userConfig.country },
        timezone: { value: userConfig.timezone, active: !!userConfig.timezone },
        zonename: { value: userConfig.zonename, active: !!userConfig.zonename },
        
        // Network settings（AP判定後に設定）
        lan_ip_address: { value: userConfig.lanIpv4, active: !!userConfig.lanIpv4 && !apActive },
        lan_ipv6_address: { value: userConfig.lanIpv6, active: !!userConfig.lanIpv6 && !apActive },
        
        // Wi-Fi
        wlan_name: { value: userConfig.wifiSSID, active: wifiActive },
        wlan_password: { value: userConfig.wifiPassword, active: wifiActive },
        
        // SSH
        ssh_interface: { value: userConfig.sshInterface, active: !!userConfig.sshInterface },
        ssh_port: { value: userConfig.sshPort, active: !!userConfig.sshPort },
        
        // System
        flow_offloading_type: { value: userConfig.flowOffloading, active: !!userConfig.flowOffloading },
        backup_path: { value: userConfig.backupPath, active: !!userConfig.backupPath },

        // PPPoE
        pppoe_username: { value: userConfig.pppoeUsername || '', active: pppoeActive },
        pppoe_password: { value: userConfig.pppoePassword || '', active: pppoeActive },

        // DS-Lite
        dslite_aftr_address: { value: dsliteAddress, active: dsliteActive },

        // MAP-E
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

        // AP
        ap_ip_address: { value: userConfig.apIpAddress, active: apActive && !!userConfig.apIpAddress },
        ap_gateway: { value: userConfig.apGateway, active: apActive && !!userConfig.apGateway },
        
        // Network Optimizer
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
    
    // enable_* フラグ（選択で ON、非選択は設定しない）
    if (selectedPackages) {
        const enableMap = {};
        
        PACKAGE_DB.categories.forEach(cat => {
            (cat.packages || []).forEach(pkg => {
                if (pkg.enableVar) {
                    enableMap[pkg.name] = pkg.enableVar;
                }
            });
        });

        // 選択されているパッケージに対応する enableVar を設定
        selectedPackages.forEach(pkgName => {
            const varName = enableMap[pkgName];
            if (varName) {
                variables[varName] = { value: '1', active: true };
            }
        });
    }

    // 変数定義を適用
    customized = setVariableDefinitions(customized, variables);

    // Custom Commands
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

// ==================== ISP情報関連 ====================
async function fetchApiInfoAndUpdate() {
    try {
        updateIspDisplay('Fetching', 'Retrieving ISP information...');
        const apiInfo = await fetchApiInfo();
        window.cachedApiInfo = apiInfo;
        if (apiInfo) {
            // Country と Timezone（空欄のみ設定）
            setIfEmpty('aios-country', apiInfo.country);
            setIfEmpty('aios-zonename', apiInfo.zonename);
            setIfEmpty('aios-timezone', apiInfo.timezone);

            // ISP表示は共通関数で構築
            const isp = buildIspStatus(apiInfo);
            updateIspDisplay(isp.status, isp.details);

            // MAP-E検出時のみmap.sh読み込み
            if (apiInfo.mape && apiInfo.mape.brIpv6Address) {
                await loadMapSh();
            }

            // GUA セクションの表示を更新
            updateGuaSectionVisibility();

            // ウィザードのON/OFFに関係なく、空欄には初期値を注入（上書きはしない）
            // MAP-E情報
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
            
            // DS-Lite情報（空欄のみ設定、既存値は保護）
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
