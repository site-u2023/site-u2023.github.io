// グローバル変数
window.app = {
    versions: [],
    devices: [],
    devicesMap: {},
    selectedVersion: '',
    templateLoaded: false,
    devicePackages: [],
    archPackagesMap: {},
};

// 公式と同じグローバル変数
window.current_device = {};
        
// map.shのキャッシュ
window.mapShCache = undefined;

document.addEventListener('DOMContentLoaded', init);

// ==================== 統合・総合 デバッカー ====================
const ErrorHandler = {
    // エラータイプ分類
    classify(error, response = null) {
        // HTTPステータスコードベースの分類
        if (response?.status === 404) return 'VERSION_NOT_AVAILABLE';
        if (response?.status === 403) return 'PERMISSION_DENIED';
        
        if (response?.status === 404) return 'NOT_FOUND';
        // CORS エラーは真のエラーとして扱う
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            return 'NETWORK_ERROR';
        }
        
        if (error.name === 'TypeError' && error.message.includes('fetch')) return 'NETWORK_ERROR';
        if (error.message?.includes('timeout')) return 'TIMEOUT';
        return 'UNKNOWN';
    },

    // 統一エラー処理
    handle(context, error, response = null) {
        const errorType = this.classify(error, response);
        
        // 期待される動作の場合は通常ログ
        const expectedBehaviors = ['VERSION_NOT_AVAILABLE', 'EXPECTED_CORS_REJECTION', 'PERMISSION_DENIED'];
        const isExpected = expectedBehaviors.includes(errorType);
        
        // ログ出力（期待される動作は通常ログ、それ以外はエラーログ）
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
        
        // エラータイプ別処理
        switch (errorType) {
            case 'VERSION_NOT_AVAILABLE': {
                console.log(`✓ Version ${app.selectedVersion} not available - This is expected for older versions`);
                hideDeviceInfo();

                // パッケージセクターを厳格に閉じる／初期化
                app.devicePackages = [];
                // package-categories を空にしてパネルごと隠す
                const pkgPanel = document.getElementById('packages');
                const categories = document.getElementById('package-categories');
                if (categories) categories.innerHTML = '';
                if (pkgPanel) pkgPanel.style.display = 'none';

                break;
            }
            case 'PERMISSION_DENIED':
            case 'EXPECTED_CORS_REJECTION':
                console.log(`✓ Access blocked by CORS policy - This is expected for older versions`);
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

    // デバッグログ（拡張版）
    debug(context, message, data = null) {
        console.log(`[DEBUG] ${context}: ${message}`);
        if (data) {
            console.log('Data:', data);
        }
        
        // ★追加：パッケージ関連なら自動でパッケージ状態チェック
        if (context.includes('Package') || context.includes('package')) {
            this.packageDebug.checkMissing();
        }
    },

    // 関数呼び出し追跡
    trace(functionName, ...args) {
        console.log(`[TRACE] ${functionName}() called`);
        console.log('Arguments:', args);
        console.trace(`${functionName} call stack:`);
    },

    packageDebug: {
        // 取得ログ記録
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
        
        // 欠落パッケージチェック
        checkMissing() {
            if (!PACKAGE_DB || !app.devicePackages) return;
            
            const missing = [];
            const notDisplayed = [];
            
            // PACKAGE_DBの全パッケージをチェック
            PACKAGE_DB.categories.forEach(category => {
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
        
        // 全情報ダンプ
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

// Windowオブジェクトにエクスポート
window.ErrorHandler = ErrorHandler;

// ==================== リセット共通関数 ====================
const ResetManager = {
    // フィールド値をクリアする汎用関数
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
    
    // ラジオボタンをデフォルトにリセット
    resetRadio(name, defaultId) {
        const defaultRadio = document.getElementById(defaultId);
        if (defaultRadio) {
            defaultRadio.checked = true;
        }
    },
    
    // PPPoE値をクリア
    clearPPPoEValues() {
        this.clearFields(['pppoe-username', 'pppoe-password']);
    },
    
    // DS-Lite値をクリア
    clearDSLiteValues() {
        this.clearFields(['dslite-aftr-address']);
        // デフォルトに戻す（transix, East）
        const typeSelect = document.getElementById('dslite-aftr-type');
        const areaSelect = document.getElementById('dslite-area');
        if (typeSelect) typeSelect.value = 'transix';
        if (areaSelect) areaSelect.value = 'east';
    },
    
    // MAP-E値をクリア  
    clearMAPEValues() {
        this.clearFields([
            'mape-br', 'mape-ealen', 'mape-ipv4-prefix', 'mape-ipv4-prefixlen',
            'mape-ipv6-prefix', 'mape-ipv6-prefixlen', 'mape-psid-offset', 
            'mape-psidlen', 'mape-gua-prefix'
        ]);
    },
    
    // AP値をクリア
    clearAPValues() {
        this.clearFields(['ap-ip-address', 'ap-gateway']);
    },
    
    // Network Optimizer値をクリア
    clearNetOptimizerValues() {
        this.clearFields([
            'netopt-rmem', 'netopt-wmem', 'netopt-conntrack',
            'netopt-backlog', 'netopt-somaxconn'
        ]);
        const congestionSelect = document.getElementById('netopt-congestion');
        if (congestionSelect) congestionSelect.value = 'cubic';
    },
    
    // 接続タイプ全体をリセット
    resetAllConnectionValues() {
        this.clearPPPoEValues();
        this.clearDSLiteValues();
        this.clearMAPEValues();
        this.clearAPValues();
    },
    
    // 接続タイプをデフォルトにリセット
    resetConnectionType() {
        const dhcpRadio = document.getElementById('conn-dhcp');
        if (dhcpRadio) {
            dhcpRadio.checked = true;
        }
        
        // 全ての接続タイプ固有セクションを非表示
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
        
        // DHCPセクションのみ表示
        const dhcpSection = document.getElementById('dhcp-section');
        if (dhcpSection) dhcpSection.style.display = 'block';
    },
    
    // DS-Lite設定をデフォルトにリセット
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
    
    // MAP-E設定をデフォルトにリセット
    resetMapeSettings() {
        const mapeAuto = document.getElementById('mape-auto');
        if (mapeAuto) {
            mapeAuto.checked = true;
        }
    },
    
    // Network Optimizer設定をデフォルトにリセット
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

// ==================== オートコンプリート関数（公式版準拠） ====================
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

// ==================== URL管理の統一関数 ====================
function setupVersionUrls(version) {
    if (!config.image_urls) config.image_urls = {};
    if (!config.overview_urls) config.overview_urls = {};
    if (config.image_urls[version]) return;
    const overview_url = config.image_url;
    const image_url = (typeof upstream_config !== 'undefined' && upstream_config.image_url_override)
        ? upstream_config.image_url_override
        : config.image_url;
    const isSnapshot = /SNAPSHOT$/i.test(version);
    const basePath   = isSnapshot ? 'snapshots' : `releases/${encodeURIComponent(version)}`;
    config.overview_urls[version] = `${overview_url}/${basePath}/`;
    config.image_urls[version]    = `${image_url}/${basePath}/`;
} 

// textareaの高さを内容に合わせて自動調整
function adjustTextareaHeight(textareaId) {
    const textarea = document.getElementById(textareaId);
    if (!textarea) return;
    
    // 内容の行数を計算
    const lines = textarea.value.split('\n');
    const lineCount = lines.length;
    
    // 最小6行、最大は内容に応じて無制限
    const rows = Math.max(6, lineCount + 1);
    
    // rows属性を更新
    textarea.rows = rows;
    
    // スクロールバーが出ないように高さも調整
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

// ==================== パッケージDB読み込み ====================
async function loadPackageDb() {
    const res = await fetch('scripts/packages.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`packages.json 読み込み失敗: HTTP ${res.status}`);
    const data = await res.json();
    applySearchUrls(data);
    return data;
}

// ==================== setup.sh 読み込み ====================
async function loadSetupScript() {
    const res = await fetch('scripts/setup.sh', { cache: 'no-store' });
    if (!res.ok) throw new Error(`setup.sh 読み込み失敗: HTTP ${res.status}`);
    const text = await res.text();
    window.SETUP_SH_TEMPLATE = text;
    const el = document.getElementById('setup-script');
    if (el) el.textContent = text;
}

// ==================== 初期化関数 (init関数) ====================
async function init() {
    try {
        // バージョン読み込み
        await loadVersions();

        // パッケージDBロード
        PACKAGE_DB = await loadPackageDb();

        // setup.shロード
        await loadSetupScript();
        
        // イベントバインディング（要素存在チェック付き）
        if (typeof bindEvents === 'function') {
            try {
                bindEvents();
            } catch (error) {
                console.error('Failed to bind events:', error);
            }
        }

        // 初期化段階では生成しない（デバイス選択＋パッケージ取得完了後に生成

        // テンプレートとパッケージの更新
        try {
            if (typeof refreshTemplateAndPackages === 'function') {
                await refreshTemplateAndPackages();
            }
        } catch (error) {
            console.error('Failed to refresh template and packages:', error);
        }

        // ====== ここで必須DOMと依存状態が揃うまで待機 ======
        await waitForReady([
            'versions',
            'models',
            //'use-package-selector-details'
            // 必要なら他の要素も追加
        ]);

        // パッケージDBをロード＆UI反映
        try {
            // await loadPackageDatabase();
            // updateInstalledPackageList();
        } catch (error) {
            console.error('Failed to load/update package DB:', error);
        }

        // ISP情報取得は details 展開時に移動（auto トリガー）
        console.log('Initialization completed. ISP info will be fetched when details are opened.');
        
        // 初期化完了後、セレクターの初期値を確実に反映（バグ修正）
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

// ==================== DOM読み込み完了時に初期化開始 ====================
document.addEventListener('DOMContentLoaded', init);

// ==================== 必須要素の存在を待つユーティリティ ====================
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

// ==================== 公式互換デバイス管理関数 ====================
// 公式と同じ関数名・ロジックでデバイス設定
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
        
// ==================== map.sh関連 ====================
// グローバルスコープに追加
const downloadPromises = {};
        
// ==================== イベントバインディング統合関数（bindEventsの外で定義） ====================
function bindFieldEvents(fieldIds, events = ['input'], callback = null) {
    let debounceTimer;
    const debouncedHandler = (...args) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const handler = callback || (() => syncTemplateAndPackages({ trigger: 'script' }));
            handler(...args);
        }, 300); // 300ms デバウンス
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

// ==================== イベントバインディング ====================
let eventsbound = false;  // 重複実行防止フラグ
function bindEvents() {
    console.log('[BIND] bindEvents called, eventsbound =', eventsbound);
    
    if (eventsbound) {
        console.log('[BIND] Events already bound, skipping');
        return;
    }
    
    console.log('[BIND] Setting eventsbound = true');
    eventsbound = true;  // フラグセット
    
    const versionsEl = document.getElementById('versions');
    if (versionsEl) versionsEl.addEventListener('change', handleVersionChange);
    
    const modelsEl = document.getElementById('models');
    if (modelsEl) {
        // 初期化時にオートコンプリートをセットアップ
        if (window.app.devicesMap) {
            setupAutocompleteList(
                modelsEl,
                Object.keys(window.app.devicesMap),
                hideDeviceInfo,
                (input) => changeModel(window.app.selectedVersion, window.app.devicesMap, input.value)
            );
        }
    }

    const aiosConfigDetails = document.getElementById('use-aios-config-details');
    if (aiosConfigDetails) aiosConfigDetails.addEventListener('toggle', window.toggleAiosConfig);
    
    const pkgSelectorDetails = document.getElementById('use-package-selector-details');
    if (pkgSelectorDetails) pkgSelectorDetails.addEventListener('toggle', window.togglePackageSelector);
    
    const buildBtnEl = document.getElementById('request-build');
    if (buildBtnEl) {
        console.log('[BIND] Adding click listener to build button');
        
        buildBtnEl.removeAttribute('href');
        buildBtnEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            
            console.log('[BIND] About to call buildAsuRequest');
            window.buildAsuRequest();
            console.log('[BIND] buildAsuRequest call completed');
        });
    }

// Postinst/UCI-defaults展開時の自動高さ調整
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
    
    // textareaの内容変更時も高さ自動調整
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

// ===== 基本設定フィールドのリアルタイム反映 =====
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

    // ===== フィールドイベントの統合バインディング =====
    const fieldGroups = {
        basic: basicFields,  // 上で定義したbasicFieldsを使用
        pppoe: ['pppoe-username', 'pppoe-password'],
        dslite: ['dslite-aftr-address', 'dslite-aftr-type', 'dslite-area'],
        mape: [
            'mape-br', 'mape-ealen', 'mape-ipv4-prefix', 'mape-ipv4-prefixlen',
            'mape-ipv6-prefix', 'mape-ipv6-prefixlen', 'mape-psid-offset',
            'mape-psidlen', 'mape-gua-prefix'
        ],
        ap: ['ap-ip-address', 'ap-gateway']
    };

    // 一括バインディング
    bindFieldEvents(fieldGroups.basic);
    bindFieldEvents(fieldGroups.pppoe);
    bindFieldEvents(fieldGroups.dslite, ['input', 'change']);  // DS-Liteは2つのイベント
    bindFieldEvents(fieldGroups.mape);
    bindFieldEvents(fieldGroups.ap);

    // ===== ラジオボタンのリアルタイム反映 =====
    // DS-Lite mode
    document.querySelectorAll('input[name="dsliteMode"]').forEach(radio => {
        radio.addEventListener('change', window.handleDsliteModeChange);
    });
    
    // Connection mode
    document.querySelectorAll('input[name="connectionMode"]').forEach(radio => {
        radio.addEventListener('change', window.handleConnectionModeChange);
    });
    
    // Connection type
    document.querySelectorAll('input[name="connectionType"]').forEach(radio => {
        radio.addEventListener('change', handleConnectionTypeChange);
    });
    
    // MAP-E type
    document.querySelectorAll('input[name="mapeType"]').forEach(radio => {
        radio.addEventListener('change', handleMapeTypeChange);
    });
    
// ===== オートコンプリート関連 =====
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.autocomplete')) {
            hideAutocomplete();
        }
    });
    
    // Network Optimizer
    document.querySelectorAll('input[name="netOptimizer"]').forEach(radio => {
        radio.addEventListener('change', handleNetOptimizerChange);
    });
    
    document.querySelectorAll('input[name="netOptimizerMode"]').forEach(radio => {
        radio.addEventListener('change', handleNetOptimizerModeChange);
    });

    // Network Optimizer manual fields
    const netOptFields = [
        'netopt-rmem', 'netopt-wmem', 'netopt-conntrack',
        'netopt-backlog', 'netopt-somaxconn', 'netopt-congestion'
    ];
    bindFieldEvents(netOptFields);
    
// デフォルトはAutoモード
    const manualSection = document.getElementById('manual-connection-section');
    if (manualSection) manualSection.style.display = 'none';

    const ispDetectionGroup = document.getElementById('isp-detection-group');
    if (ispDetectionGroup) ispDetectionGroup.style.display = 'block'; // Auto時は表示

    // Dynamic Network Optimizer デフォルト設定
    const netOptimizerSection = document.getElementById('net-optimizer-section');
    if (netOptimizerSection) netOptimizerSection.style.display = 'block'; // Enabled時は表示
    const netOptimizerManual = document.getElementById('net-optimizer-manual');
    if (netOptimizerManual) netOptimizerManual.style.display = 'none'; // Autoモードなので手動設定は非表示

    // 全ての接続タイプ固有セクションを非表示（DHCPセクション含む）
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

// ==================== デバイス・バージョン統合管理 ====================
const DeviceContext = {
    // 統合更新入口
    async update(options = {}) {
        const {
            version = app.selectedVersion,
            deviceTitle = document.getElementById('models')?.value?.trim(),
            forceReload = false,
            trigger = 'unknown'
        } = options;
        
        console.log(`[DeviceContext] Update: ${trigger} | Version: ${version} | Device: ${deviceTitle || 'none'}`);
        
        try {
            // Phase 1: バージョン更新
            await this._updateVersion(version, forceReload);
            
            // Phase 2: デバイス処理
            await this._updateDevice(deviceTitle);
            
            // Phase 3: 統合後処理
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
    
        // MAP-E環境での事前準備
        if (window.cachedApiInfo?.mape?.brIpv6Address) {
            await loadMapSh();
        }
    
        // デバイス一覧更新
        if (forceReload || app.devices.length === 0) {
            await loadDevices();
        }
    },
    
    // デバイス更新処理
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
    
// デバイス選択処理
    async _selectDevice(device) {
        console.log(`[DeviceContext] Device selected: ${device.id}`);
        
        // デバイス状態更新
        window.current_device = {
            version: window.app.selectedVersion,
            id: device.id,
            target: device.target
        };
        
        // プロファイル読み込み
        try {
            const success = await loadDeviceProfile(device);
            // 成功時のみUI表示
            if (success) {
                // ISP 先読み（デバイス決定後・表示前）
                try {
                    await window.fetchApiInfoAndUpdate();
                    window.updateRequiredPackages();
                    window.asuCollectPackages();
                } catch (e) {
                    console.error('[DeviceContext] API fetch failed before showDeviceInfo:', e);
                }   
                showDeviceInfo();
            } else {
                // 失敗時はデバイス情報をクリア
                window.current_device = {};
            }
        } catch (error) {
            ErrorHandler.handle('DeviceContext._selectDevice', error);
            current_device = {};
            hideDeviceInfo();
            return;
        }  
    },
    
    // 統合後処理
    async _finalizeUpdate() {
        // ここでの API 取得は不要（_selectDevice で先読み済み）
    },
    
    // デバイス未発見処理
    _deviceNotFound(deviceTitle) {
        console.log(`[DeviceContext] Device not found: ${deviceTitle} (keeping name, hiding info)`);
        hideDeviceInfo();
    },
    
    // デバイスクリア処理
    _clearDevice() {
        hideDeviceInfo();
    },
    
    // エラー処理
    _handleError() {
        hideDeviceInfo();
        // current_deviceは保持（復旧の可能性のため）
    }
};

// ==================== 簡略化された入口関数 ====================
async function handleVersionChange(e) {
    await DeviceContext.update({
        version: e.target.value,
        forceReload: true,
        trigger: 'version-change'
    });
    
    // バージョン変更時にオートコンプリートを再セットアップ
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

function selectDevice(device) {
    const title = device.title || getDeviceTitle(device);
    document.getElementById('models').value = title;
    hideAutocomplete();
    
    DeviceContext.update({
        deviceTitle: title,
        trigger: 'device-selection'
    });
}

// ==================== changeModel関数の簡素化 ====================
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
        
// ==================== バージョン管理 ====================
async function loadVersions() {
    try {
        const response = await fetch('https://downloads.openwrt.org/.versions.json');
        const data = await response.json();
        // 公式と同じ: SNAPSHOTを最初に追加
        app.versions = ['SNAPSHOT'];
        
        // 安定版を追加（config.min_version以上のみ）
        if (data.versions_list) {
            let versionList = data.versions_list;
            
            // min_versionが設定されていればフィルタリング（21.02.0以降のみ）
            if (config.min_version) {
                const minParts = config.min_version.split('.').map(n => parseInt(n, 10));
                versionList = versionList.filter(version => {
                    const parts = version.split('.').map(n => parseInt(n, 10));
                    for (let i = 0; i < minParts.length; i++) {
                        if (parts[i] > minParts[i]) return true;
                        if (parts[i] < minParts[i]) return false;
                    }
                    return true;  // 完全一致も含む
                });
            }
            
            app.versions = app.versions.concat(versionList);
        }
        
        // 全バージョンのURL設定を事前に構築
        app.versions.forEach(ver => setupVersionUrls(ver));
        
        // デフォルト選択: 公式と同じく最新リリース版（2番目）
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

// ==================== デバイス管理 ====================
async function loadDevices() {
    if (!app.selectedVersion) return;
    
    const cacheKey = `devices:${app.selectedVersion}`;
    const notFoundKey = `404:${cacheKey}`;
    
    // 404キャッシュチェック
    if (profileCache[notFoundKey]) {
        console.log(`[loadDevices] Version ${app.selectedVersion} known to be unavailable`);
        app.devices = [];
        app.versionCode = null;
        app.kernelHash = null;
        hideDeviceInfo();
        return;
    }
    
    try {
        // URL設定を確認
        setupVersionUrls(app.selectedVersion);
        const url = config.overview_urls[app.selectedVersion] + '.overview.json';
        
        const response = await fetch(url, {
            cache: 'no-cache',
            credentials: 'omit',
            mode: 'cors'
        });
        
        // 404は真のエラーとして処理
        if (response.status === 404) {
            console.error(`Version ${app.selectedVersion} not found (HTTP 404)`);
            throw new Error('Version not available');
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        // 公式と同じ重複解決処理を追加
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
        
        // 各プロファイルの全タイトルを処理
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
        
        // プロファイルをオブジェクトに変換（公式と同じ）
        app.devicesMap = profiles.reduce((d, e) => ((d[e.title] = e), d), {});
        app.devices = profiles;  // 互換性のため配列も保持
        app.archPackagesMap = data.arch_packages || {};
        
    } catch (error) {
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('CORS'))) {
            console.log(`✓ Version ${app.selectedVersion} access blocked - Normal for older versions`);
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

function handleDeviceSearch(e) {
    // setupAutocompleteListに置き換え
    if (!app.devicesMap) return;
    
    setupAutocompleteList(
        document.getElementById('models'),
        Object.keys(app.devicesMap),
        hideDeviceInfo,  // onbegin
        (input) => {      // onend
            changeModel(app.selectedVersion, app.devicesMap, input.value);
        }
    );
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

function changeModel(version, devicesMap, title) {
    const device = devicesMap[title];
    if (device) {
        current_device = {
            version: version,
            id: device.id,
            target: device.target
        };
        selectDeviceProfile(device);
    } else {
        hideDeviceInfo();
        current_device = {};
    }
}

// selectDeviceのプロファイル読み込み部分を分離
async function selectDeviceProfile(device) {
    const success = await loadDeviceProfile(device);
    if (success) {
        try {
            await fetchApiInfoAndUpdate();
            updateRequiredPackages();
            asuCollectPackages();
        } catch (e) {
            console.error('[selectDeviceProfile] API fetch failed:', e);
        }
        showDeviceInfo();
    } else {
        current_device = {};
    }
}

function getDeviceTitle(device) {
    if (device.titles && device.titles.length > 0) {
        return device.titles[0].title || device.id;
    }
    return device.id;
}

function showAutocomplete(devices) {
    // 既存のautocomplete-itemsを削除
    let existingContainer = document.querySelector('.autocomplete-items');
    if (existingContainer) {
        existingContainer.remove();
    }
    
    // 新しく作成
    const autocompleteDiv = document.getElementById('models-autocomplete');
    const container = document.createElement('div');
    container.className = 'autocomplete-items';
    
    if (devices.length === 0) {
        autocompleteDiv.appendChild(container);
        container.style.display = 'none';
        return;
    }

    // DocumentFragmentを使用してバッチ処理
    const fragment = document.createDocumentFragment();
    
    devices.forEach(device => {
        const div = document.createElement('div');
        const title = device.title || getDeviceTitle(device);
        div.innerHTML = `<strong>${title}</strong><br><small>Target: ${device.target}</small>`;
        div.addEventListener('click', () => selectDevice(device));
        fragment.appendChild(div);
    });
    
    // 一度だけDOMに追加
    container.appendChild(fragment);
    autocompleteDiv.appendChild(container);
    container.style.display = 'block';
}
        
function hideAutocomplete() {
    const items = document.querySelector('.autocomplete-items');
    if (items) {
        items.remove();
    }
}

// 初回のみDL必須、同一デバイス＋同一OSバージョンはキャッシュ利用
const profileCache = {};

async function loadDeviceProfile(device) {
    if (!device || !device.target || !device.id) return false;
    const version = app.selectedVersion;
    const targetPath = device.target;
    const profileId = device.id;
    const cacheKey = `${version}::${targetPath}::${profileId}`;

    // URL設定を確認（通常はloadVersionsで設定済みだが念のため）
    setupVersionUrls(version);
    
    const profilesUrl = `${config.image_urls[version]}/targets/${targetPath}/profiles.json`;
    // キャッシュ命中時は即利用
    if (profileCache[cacheKey]) {
        console.log(`Using cached profile for ${cacheKey}`);
        applyProfileData(profileCache[cacheKey], profileId);
        Promise.allSettled([ window.fetchDevicePackages() ])
            .then(() => console.log('Background tasks completed (from cache)'));
        return true;
    }

    // 初回は必ずDL
    try {
        console.log(`Loading profile from: ${profilesUrl}`);
        const response = await fetch(profilesUrl, { cache: 'no-cache' });
        
        if (!response.ok) {
            if (response.status === 404) {
                // バージョンは存在するがパッケージが無い（期待される動作）
                console.log(`Device ${device.id} not supported in version ${version}`);
                hideDeviceInfo();
                current_device = {};
                return false;
            }
            // 404以外のHTTPエラーは本当のエラー
            throw new Error(`Failed to fetch profiles.json: HTTP ${response.status}`);
        }
        
        const profilesData = await response.json();
        console.log(`Loaded profiles data:`, profilesData);
        profileCache[cacheKey] = profilesData;
        applyProfileData(profilesData, profileId);

        // パッケージ取得完了を待ってから描画（SNAPSHOT版は別処理）
        try {
            await window.fetchDevicePackages();
        } catch (e) {
            console.error('fetchDevicePackages failed:', e);
        }
        // 取得完了後にだけ UI 生成（SNAPSHOTでも実行される）
        if (typeof window.generatePackageSelector === 'function') {
            window.generatePackageSelector();
        }
        return true;
        
    } catch (error) {
        // CORSエラー（古いバージョンで期待される動作）
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            console.log(`Version ${version} access blocked by CORS - Expected for older versions`);
            hideDeviceInfo();
            current_device = {};
            return false;
        }
        
        // それ以外は本当のネットワークエラー
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
        // 全てのカーネルディレクトリを抽出
        const kernelDirs = extractAllKernels(html);
        
        if (kernelDirs.length === 0) {
            console.log('[Kernel] No valid kernel directories found');
            return null;
        } else if (kernelDirs.length === 1) {
            // 単一カーネル → 即採用（効率化）
            console.log('[Kernel] Single kernel found:', kernelDirs[0].hash);
            return kernelDirs[0].hash;
        } else {
            // 複数カーネル → 日付で最新選択
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
            
            // "." や ".." ディレクトリを除外
            if (dirName === '.' || dirName === '..') continue;
            
            // カーネルハッシュ形式の検証
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
        // 日付でソートして最新を選択
        kernelDirs.sort((a, b) => b.date - a.date);
        const latestKernel = kernelDirs[0];
        
        console.log(`[Kernel] Selected latest kernel: ${latestKernel.hash} (${latestKernel.dateStr})`);
        
        // フォールバック情報も保存（パッケージが見つからない場合に使用）
        if (kernelDirs.length > 1) {
            app.snapshotKernelFallbacks = kernelDirs.slice(1, 3).map(k => k.hash);
            console.log(`[Kernel] Fallback kernels available: ${app.snapshotKernelFallbacks.join(', ')}`);
        }
        
        return latestKernel.hash;
    }

    if (profilesData.profiles && profilesData.profiles[profileId]) {
        const profile = profilesData.profiles[profileId];
        const defaultPackages = profilesData.default_packages || [];
        const devicePackages = profile.device_packages || [];
        const asuExtraPackages = ['luci'];
        
        // セレクターでチェックされているパッケージも収集
        const checkedPackages = [];
        document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
            const pkgName = cb.getAttribute('data-package');
            if (pkgName) {
                checkedPackages.push(pkgName);
            }
        });
        
        // 全パッケージを統合（重複除去）
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
       
function showDeviceInfo() {
    if (!current_device || !current_device.id) return;

    const device = app.devices.find(d => d.id === current_device.id && d.target === current_device.target);
    if (!device) return;
    
    // バージョン番号の取得（ビルド番号含む）
    let fullVersion = app.selectedVersion;
    let displayVersionCode = app.versionCode || 'null';  // versionCodeが無い場合は「null」を表示
    if (app.versionCode) {
        fullVersion = `${app.selectedVersion} (${app.versionCode})`;
    }
    
    // URL設定を確認
    setupVersionUrls(app.selectedVersion);
    
    // URLs生成
    const imageFolder = `${config.image_urls[app.selectedVersion]}targets/${device.target}`;
    
    const deviceLink = `${window.location.origin}${window.location.pathname}?version=${encodeURIComponent(app.selectedVersion)}&target=${encodeURIComponent(device.target)}&id=${encodeURIComponent(device.id)}`;
    
    const deviceTitle = device.title || getDeviceTitle(device);
    const infoUrl = (config.info_url || "")
        .replace("{title}", encodeURI(deviceTitle))
        .replace("{target}", device.target)
        .replace("{id}", device.id)
        .replace("{version}", app.selectedVersion);

    // ===== About this build 表示用 前処理ブロック =====
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
    const ispValue     = isp;
    const asValue      = asNumber;
    const ipAddressValue = [ipv4, ipv6].filter(Boolean).join(' / ') || 'unknown';

    // ▼ WAN 表示を Connection mode／type に合わせて動的変更
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
        // Auto: API 検出結果を反映
        if (aftr) {
            wanType = 'Auto (DS-Lite)';
        } else if (mape) {
            wanType = 'Auto (MAP-E)';
        } else {
            wanType = 'Auto (DHCP/PPPoE)';
        }
    }

    const noticeValue = notice.trim();
    
    // 公式形式のAbout this buildセクションを構築（After）
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

// テンプレートを最初に設定（まだ設定されていない場合のみ）
    const textarea = document.getElementById('uci-defaults-content');
    if (!app.templateLoaded && (!textarea.value || textarea.value.trim() === '')) {
        textarea.value = SETUP_SH_TEMPLATE;
        app.templateLoaded = true;
        console.log('Template loaded for the first time');
    }
}

function hideDeviceInfo() {
    document.getElementById('info').style.display = 'none';
    document.getElementById('packages').style.display = 'none';
    document.getElementById('request-build').style.display = 'none';
}

// ==================== auto トリガー関数 ====================
let apiInfoFetched = false;  // 重複防止用フラグ

/*
async function handleAsuDetailsToggle(e) {
    const details = e.target;
    
    if (details.open && !window.apiInfoFetched) {
        window.apiInfoFetched = true;  // グローバルフラグ
        
        try {
            await fetchApiInfoAndUpdate();
            updateRequiredPackages();
            asuCollectPackages();
        } catch (error) {
            window.apiInfoFetched = false;  // 失敗時リセット
            // エラー処理
        }
    }
}
*/

function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleString();
}
