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

// グローバル変数
let app = {
    versions: [],
    devices: [],
    selectedVersion: '',
    templateLoaded: false,
    availablePackages: [], // デバイス固有のパッケージリスト
    archPackagesMap: {},
};

// 公式と同じグローバル変数
let current_device = {};
        
// map.shのキャッシュ
let mapShCache = undefined;

// ==================== MAP-E専用処理モジュール ====================
const MapEProcessor = {
    // MAP-E設定がアクティブかどうかを判定
    isActive(config, apiInfo) {
        if (config.connectionMode === 'auto') {
            return !!(apiInfo?.mape?.brIpv6Address);
        } else if (config.connectionMode === 'manual') {
            return config.connectionType === 'mape';
        }
        return false;
    },
    
    // 必要なmap.shがキャッシュされているかチェック
    isScriptCached() {
        return mapShCache !== undefined && mapShCache !== null;
    },
    
    // map.shダウンロードの確保
    async ensureScriptReady() {
        if (!mapShCache) {
            await loadMapSh();
            
            if (!mapShCache) {
                throw new Error('Failed to download map.sh script. Please check your internet connection and try again.');
            }
        }
    },
    
    // プレースホルダーの置換
    replacePlaceholder(content) {
        if (!content.includes('${map_sh_content}')) {
            return content;
        }
        
        if (!mapShCache) {
            throw new Error('MAP-E script not available in cache');
        }
        
        const result = content.replace(/\$\{map_sh_content\}/g, mapShCache);
        
        if (result.includes('${map_sh_content}')) {
            throw new Error('MAP-E script embedding failed - placeholder still exists');
        }
        
        return result;
    },
    
    // 事前準備処理（設定画面表示時）
    async prepareForDisplay(config, apiInfo) {
        if (this.isActive(config, apiInfo)) {
            await loadMapSh();
        }
    },
    
    // ビルド時処理（プレースホルダー置換）
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

// Java Script -------------------------------------------------------------------
// JS ----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', init);

// ==================== エラーハンドリング統一 ====================
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

// ==================== 初期化関数 (init関数) ====================
async function init() {
    try {
        // バージョン読み込み
        await loadVersions();

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

async function loadMapSh() {
    console.log('[MAP-E Download] Starting download');
    
    if (mapShCache !== undefined) {
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
                mapShCache = content;
                console.log('[MAP-E Download] ✓ Saved to cache, length:', content.length);
            } else {
                console.error('[MAP-E Download] ✗ Empty response');
                mapShCache = '';
            }
        } else {
            console.error('[MAP-E Download] ✗ HTTP', response.status);
            mapShCache = '';
        }
    } catch (error) {
        console.error('[MAP-E Download] ✗ Failed:', error);
        mapShCache = '';
    }
}
        
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
        radio.addEventListener('change', handleDsliteModeChange);
    });
    
    // Connection mode
    document.querySelectorAll('input[name="connectionMode"]').forEach(radio => {
        radio.addEventListener('change', handleConnectionModeChange);
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
        current_device = {
            version: app.selectedVersion,
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
                    await fetchApiInfoAndUpdate();
                    updateRequiredPackages();
                    asuCollectPackages();
                } catch (e) {
                    console.error('[DeviceContext] API fetch failed before showDeviceInfo:', e);
                }   
                showDeviceInfo();
            } else {
                // 失敗時はデバイス情報をクリア
                current_device = {};
            }
        } catch (error) {
            const result = ErrorHandler.handle('DeviceContext._selectDevice', error);
            current_device = {};
            hideDeviceInfo();
            // ErrorHandlerで処理完了、制御フロー中断
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
        Promise.allSettled([ fetchDevicePackages() ])
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
            await fetchDevicePackages();
        } catch (e) {
            console.error('fetchDevicePackages failed:', e);
        }
        // 取得完了後にだけ UI 生成（SNAPSHOTでも実行される）
        if (typeof generatePackageSelector === 'function') {
            generatePackageSelector();
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

// ==================== 接続設定変更反映関数 ====================
function applyConnectionSettingsChange() {
    updateGuaSectionVisibility();
    applyInitialsFromApi(document.querySelector('input[name="connectionType"]:checked')?.value || '');
    // 終点ロジックへ
    syncTemplateAndPackages({ trigger: 'connection-change' });
    showDeviceInfo();
}

// ==================== 接続設定ハンドラー ====================
function handleConnectionModeChange(e) {
    const manualSection = document.getElementById('manual-connection-section');
    const ispDetectionGroup = document.getElementById('isp-detection-group');
    
    if (e.target.value === 'manual') {
        manualSection.style.display = 'block';
        // Manual時はISP Detection Statusを非表示
        if (ispDetectionGroup) {
            ispDetectionGroup.style.display = 'none';
        }
    } else {
        // Auto選択時 - 全てをリセット
        manualSection.style.display = 'none';
        
        // 全ての接続タイプの値をクリア
        ResetManager.resetAllConnectionValues();
        
        // 重要：接続タイプを DHCP にリセット
        ResetManager.resetConnectionType();
        
        // 各プロトコルの詳細設定もリセット
        ResetManager.resetDsliteSettings();
        ResetManager.resetMapeSettings();
        
        // Auto時はISP Detection Statusを表示
        if (ispDetectionGroup) {
            ispDetectionGroup.style.display = 'block';
        }
    }
    
    applyConnectionSettingsChange();
}

function handleConnectionTypeChange(e) {
    // ResetManagerを使用して統一的にリセット
    ResetManager.clearPPPoEValues();
    ResetManager.clearDSLiteValues();  // AFTRタイプ・地域もデフォルト値に戻す
    ResetManager.clearMAPEValues();
    ResetManager.clearAPValues();
    
    // 各プロトコルの詳細設定もリセット
    ResetManager.resetDsliteSettings();  // Auto/Manualもデフォルト状態に
    ResetManager.resetMapeSettings();
    
    // AP用の特定値設定
    document.getElementById('ap-ip-address').value = '192.168.1.2';
    document.getElementById('ap-gateway').value = '192.168.1.1';
    
    // MAP-E初期値（APIから）
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

    // MAP-Eラジオボタンもリセット
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
    
    // 全セクションを一旦非表示
    if (dhcpSection) dhcpSection.style.display = 'none';
    pppoeSection.style.display = 'none';
    dsliteSection.style.display = 'none';
    mapeManualSection.style.display = 'none';
    if (apSection) apSection.style.display = 'none';
    
    // APIデータ取得
    const apiInfo = window.cachedApiInfo || {};
    const hasAftr = !!(apiInfo.mape && apiInfo.mape.aftrIpv6Address);
    const hasMape = !!(apiInfo.mape && apiInfo.mape.brIpv6Address);
    
    // 選択された接続タイプに応じてセクションを表示
    if (e.target.value === 'dhcp') {
        if (dhcpSection) dhcpSection.style.display = 'block';
    } else if (e.target.value === 'pppoe') {
        pppoeSection.style.display = 'block';
    } else if (e.target.value === 'dslite') {
        dsliteSection.style.display = 'block';
        
        // DS-Lite: AFTRデータの有無でAuto/Manual制御
        const dsliteAuto = document.getElementById('dslite-auto');
        const dsliteManual = document.getElementById('dslite-manual');
        const dsliteHint = document.getElementById('dslite-mode-hint');
        
        if (hasAftr) {
            // AFTRデータあり：Auto有効（初期選択）
            dsliteAuto.disabled = false;
            dsliteAuto.checked = true;
            dsliteManual.checked = false;
            if (dsliteHint) dsliteHint.textContent = 'Auto: Use ISP-detected AFTR address';
        } else {
            // AFTRデータなし：Auto無効、Manual強制
            dsliteAuto.disabled = true;
            dsliteAuto.checked = false;
            dsliteManual.checked = true;
            if (dsliteHint) dsliteHint.textContent = 'Auto not available (no AFTR detected)';
        }
        
        // Manual設定エリアの表示制御
        const manualFields = document.getElementById('dslite-manual-fields');
        if (manualFields) {
            manualFields.style.display = hasAftr ? 'none' : 'block';
        }
        
} else if (e.target.value === 'mape') {
        mapeManualSection.style.display = 'block';
        
        // MAP-E: BRデータの有無でAuto/Manual制御
        const mapeAuto = document.getElementById('mape-auto');
        const mapeGua = document.getElementById('mape-gua');
        const mapePd = document.getElementById('mape-pd');
        
        if (hasMape) {
            // MAP-Eデータあり：Auto有効（初期選択）
            mapeAuto.disabled = false;
            mapeAuto.checked = true;
            if (mapeGua) mapeGua.checked = false;
            if (mapePd) mapePd.checked = false;
        } else {
            // MAP-Eデータなし：Auto無効、GUA選択
            mapeAuto.disabled = true;
            mapeAuto.checked = false;
            if (mapeGua) {
                mapeGua.checked = true;
            } else if (mapePd) {
                mapePd.checked = true;
            }
        }
        
        // キャッシュ確認してから必要時のみロード
        if (mapShCache === undefined) {
            // 未ロードの場合のみ非同期でロード
            (async () => {
                try {
                    await loadMapSh();
                } catch (err) {
                    console.error('map.sh load failed:', err);
                }
                applyConnectionSettingsChange();
            })();
            return; // 非同期処理完了後に反映するのでここで抜ける
        }
        // 既にキャッシュ済みの場合はそのまま続行
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

// Network Optimizer のデフォルト値定義
const NETOPT_DEFAULTS = {
    rmem: '4096 131072 8388608',
    wmem: '4096 131072 8388608',
    conntrack: '131072',
    backlog: '5000',
    somaxconn: '16384',
    congestion: 'cubic'
};

function resetNetOptimizerValues() {
    // 全フィールドをデフォルト値にリセット
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
        // デフォルト設定にリセット
        ResetManager.resetNetOptimizerSettings();
    } else {
        // Disabled時は全てクリア
        optimizerSection.style.display = 'none';
        document.getElementById('net-optimizer-manual').style.display = 'none';
        // 統一された関数で値をクリア
        ResetManager.clearNetOptimizerValues();
    }
    
    syncTemplateAndPackages({ trigger: 'netopt-change' });
}

function handleNetOptimizerModeChange(e) {
    const manualSection = document.getElementById('net-optimizer-manual');
    
    if (e && e.target && e.target.value === 'manual') {
        manualSection.style.display = 'block';
        // Manual選択時も常にデフォルト値を設定（編集の起点として）
        resetNetOptimizerValues();
    } else {
        // Auto選択時
        manualSection.style.display = 'none';
        // Autoは常にデフォルト値を使用するのでリセット
        resetNetOptimizerValues();
    }
    
    syncTemplateAndPackages({ trigger: 'netopt-mode-change' });
}

function isGlobalUnicastIPv6(ip) {
    if (!ip) return false;
    // GUA: 2000::/3 (starts with 2xxx or 3xxx), exclude ULA (fd00::/8) and link-local (fe80::/10)
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

    // 厳密条件:
    // - MAP-Eが対象
    // - PDでは絶対に表示しない
    // - Auto: APIでMAP-Eが検出され、かつ GUA アドレスがある時のみ
    // - Manual: mapeType が 'gua' の時のみ（'auto' の場合は API 要件を満たす時）
    let shouldShow = false;

    if (connectionType === 'mape') {
        if (connectionMode === 'auto') {
            shouldShow = !!apiMape.brIpv6Address && hasGua;
        } else {
            if (mapeType === 'gua') {
                shouldShow = true;
            } else if (mapeType === 'auto') {
                shouldShow = !!apiMape.brIpv6Address && hasGua;
            } else { // 'pd'
                shouldShow = false;
            }
        }
    }

    if (guaSection) {
        guaSection.style.display = shouldShow ? 'block' : 'none';
    }

    // 値の自動設定は表示が決まった後、未入力時のみ
    if (shouldShow) {
        const guaInput = document.getElementById('mape-gua-prefix');
        if (guaInput && !guaInput.value) {
            const guaPrefix = calculateGuaPrefixFromApi();
            if (guaPrefix) guaInput.value = guaPrefix;
        }
    }
}

// ==================== プレフィックス計算共通関数 ====================
function calculatePrefix(ipv6, length = 64) {
    if (!ipv6) return '';
    const segments = ipv6.split(':');
    if (segments.length >= 4) {
        const prefix = segments.slice(0, 4).join(':');
        return `${prefix}::/${length}`;
    }
    return '';
}

// APIのIPv6アドレスからGUAプレフィックスを計算
function calculateGuaPrefixFromApi() {
    return calculatePrefix(window.cachedApiInfo?.ipv6 || '', 64);
}
        
// ==================== フォーム初期値注入共通関数 ====================
function setIfEmpty(id, value) {
    const el = document.getElementById(id);
    if (el && !el.value && value != null && value !== '') {
        el.value = value;
    }
}

// ==================== ISP情報表示構築共通関数 ====================
function buildIspStatus(apiInfo) {
    if (!apiInfo) {
        return {
            status: 'Auto-detection failed',
            details: 'API connection error or unsupported ISP\nManual configuration required.'
        };
    }

    let statusText = 'Auto-detection successful';
    let details = '';

    // ISPとASの表示
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

async function fetchApiInfo() {
    const apis = [
        'https://auto-config.site-u.workers.dev/',
        'https://site-u2023.github.io/api/auto-config/'  // バックアップ
    ];
    
    for (const apiUrl of apis) {
        try {
            
            // キャッシュ無効化用のランダムパラメータを追加
            const cacheBreaker = `?_t=${Date.now()}&_r=${Math.random()}`;
            const finalUrl = apiUrl + cacheBreaker;
            
            const response = await fetch(finalUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                timeout: 10000  // 10秒タイムアウト
            });
            
            console.log(`API response status (${apiUrl}):`, response.status);
            
            if (!response.ok) {
                console.warn(`API access failed with status: ${response.status} (${apiUrl})`);
                continue;  // 次のAPIを試行
            }
            
            const data = await response.json();
            
            // 互換ラッパー: 新旧どちらのキーでも動くように相互コピー
            if (data) {
                if (data.rule && data.mape === undefined) {
                    data.mape = data.rule;
                }
                if (data.mape && data.rule === undefined) {
                    data.rule = data.mape;
                }
            }
            
            // console.log(`API Info fetched successfully from ${apiUrl}:`, data);
            return data;
            
        } catch (error) {
            console.error(`Failed to fetch from ${apiUrl}:`, error);
            // 次のAPIを試行
        }
    }
    
    console.error('All API endpoints failed');
    return null;
}

// ==================== テンプレ文字列の変数設定共通関数 ====================
function setVariableDefinitions(content, variables) {
    const variableLines = [];
    
    for (const [key, config] of Object.entries(variables)) {
        if (!config || typeof config !== 'object') continue;
        
        const { value, active } = config;
        const safeValue = (value === undefined || value === null) ? '' : String(value).trim();
        
        // activeがtrueで値がある場合のみ変数を定義
        if (active && safeValue !== '') {
            variableLines.push(`${key}="${safeValue}"`);
        }
    }
    
    const variableText = variableLines.length > 0 ? variableLines.join('\n') : '';
    const managedRegion = /(# BEGIN_VARIABLE_DEFINITIONS\n)([\s\S]*?)(# END_VARIABLE_DEFINITIONS\n)/;
    
    return content.replace(managedRegion, `$1${variableText ? variableText + '\n' : ''}$3`);
}

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
        
function getCustomCommands() {
    const commands = [];
    // メイン入力欄
    const mainCommand = document.getElementById('command');
    if (mainCommand) {
        const val = mainCommand.value != null ? mainCommand.value.trim() : '';
        if (val.length > 0) {
            commands.push(val);
        }
    }
    // 追加コマンド欄（空欄以外をすべて反映）
    const extraInputs = document.querySelectorAll('#commands-autocomplete input.command');
    extraInputs.forEach((el) => {
        if (!el) return;
        const val = el.value != null ? el.value.trim() : '';
        if (val.length > 0) {
            commands.push(val);
        }
    });
    // 重複除去（順序は保持）
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
        document.getElementById('uci-defaults-content').value = SETUP_SH_TEMPLATE;
        app.templateLoaded = true;
    }
}

function getAiosConfig() {
    const parseOrEmpty = (id, type = 'string') => {
        const element = document.getElementById(id);
        if (!element) return '';
        
        // value が空でも、HTML の初期値（placeholder や value 属性）を確認
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
        
        // Network Optimizer settings
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

function applyInitialsFromApi(type) {
    if (type === 'dslite') {
        const aftrInput = document.getElementById('dslite-aftr-address');
        const dsliteMode = document.querySelector('input[name="dsliteMode"]:checked')?.value || 'auto';
        
        if (dsliteMode === 'auto') {
            // API検出値を使用
            if (window.cachedApiInfo && window.cachedApiInfo.mape && window.cachedApiInfo.mape.aftrIpv6Address) {
                if (aftrInput) {
                    aftrInput.value = window.cachedApiInfo.mape.aftrIpv6Address;
                }
            }
        } else {
            // Manual mode: 地域・タイプベースの設定
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

    // MAP-E: APIの初期値をそのまま流し込む（初期化は無条件に上書き）
    if (type === 'mape') {
        const s = (window.cachedApiInfo && window.cachedApiInfo.mape) ? window.cachedApiInfo.mape : null;

        // 既知のキーが無い場合でも無条件初期化のポリシーに従い、値があるものは上書き
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
        
        // GUAプレフィックスも設定
        const guaPrefix = calculateGuaPrefixFromApi();
        if (guaPrefix) {
            set('mape-gua-prefix', guaPrefix);
        }
        
        // GUAセクションの表示を更新
        updateGuaSectionVisibility();
    }
}

// ==================== ビルドエラー処理統一 ====================
const BuildErrorHandler = {
    // スクリプトサイズ計算（システム使用分も含む）
    calculateTotalSize(script, packages) {
        const scriptSize = new Blob([script]).size;
        const packagesSize = new Blob([packages.join(' ')]).size;
        const systemOverhead = 1024; // システム使用分約1KB
        const totalSize = scriptSize + packagesSize + systemOverhead;
        
        console.log(`[SIZE CHECK] Script: ${scriptSize}B, Packages: ${packagesSize}B, System: ${systemOverhead}B, Total: ${totalSize}B`);
        
        return {
            scriptSize,
            packagesSize,
            systemOverhead,
            totalSize,
            isOverLimit: totalSize > 20480 // 20KB = 20480 bytes
        };
    },

    // エラー表示統一処理
    showError(errorType, statusCode, errorData, sizeInfo = null) {
        // 進捗バーを赤いエラー表示に変更
        this.showErrorProgress(errorType, statusCode);
        
        // ステータス表示
        hideProgress();
        showBuildStatus(`Build failed: ${errorType}`, 'error');
        
        // 詳細エラー情報を構築
        const errorDetails = this.buildErrorDetails(errorType, statusCode, errorData, sizeInfo);
        
        // エラー詳細をdownload-linksに表示
        const container = document.getElementById('download-links');
        container.innerHTML = errorDetails;
        
        // エラーエリアにスクロール
        setTimeout(() => {
            container.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
        }, 200);
    },

    // 進捗バーのエラー表示
    showErrorProgress(errorType, statusCode) {
        const progressElement = document.getElementById('build-progress');
        const messageElement = document.getElementById('build-message');
        const progressBar = document.getElementById('progress-bar');
        
        // 進捗バーを赤に変更
        progressBar.style.backgroundColor = '#dc3545';
        progressBar.style.width = '100%';
        messageElement.textContent = `Build failed: ${errorType} (HTTP ${statusCode})`;
        progressElement.style.display = 'block';
        
        // 5秒後に自動で隠す
        setTimeout(() => {
            hideProgress();
        }, 5000);
    },

    // エラー詳細HTML構築
    buildErrorDetails(errorType, statusCode, errorData, sizeInfo) {
        let html = `
            <div class="asu-error" style="margin-top: 1rem;">
                <h4>Build Failed - ${errorType}</h4>
                <div><strong>HTTP Status:</strong> ${statusCode}</div>
        `;

        // 20KB制限チェック
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

        // エラー詳細
        if (errorData) {
            if (typeof errorData === 'string') {
                html += `<div><strong>Error Details:</strong></div>
                         <pre style="background: #f8f8f8; padding: 10px; margin: 10px 0; border-radius: 4px; overflow-x: auto; font-size: 0.9em; max-height: 200px; color: #333;">${errorData}</pre>`;
            } else if (typeof errorData === 'object') {
                // リクエストハッシュがあれば表示
                if (errorData.request_hash) {
                    html += `<div><strong>Request ID:</strong> <code>${errorData.request_hash}</code></div>`;
                }
                
                // その他の詳細情報
                const excludeFields = ['request_hash'];
                for (const [key, value] of Object.entries(errorData)) {
                    if (!excludeFields.includes(key) && value != null) {
                        html += `<div><strong>${key}:</strong> ${JSON.stringify(value)}</div>`;
                    }
                }
            }
        }

        // トラブルシューティング情報
        html += this.getTroubleshootingInfo(errorType, sizeInfo);
        html += '</div>';
        
        return html;
    },

    // トラブルシューティング情報
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
    
    if (!current_device || !current_device.id) {
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
        
        // 初回の進捗表示時に確実にスクロール
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
        // MAP-E処理（必要時のみプレースホルダー置換）
        script = await MapEProcessor.processForBuild(
            script, 
            getAiosConfig(), 
            window.cachedApiInfo
        );
        console.log('[VERIFY] Script size:', originalSize, '→', script.length, '(', script.length - originalSize, 'bytes added)');
        console.log('[buildAsuRequest] MapEProcessor completed');

        console.log('[buildAsuRequest] Building request body');
        const requestBody = {
            target: current_device.target,
            profile: current_device.id,
            packages: packages,
            version: app.selectedVersion
        };

        console.log('[buildAsuRequest] About to send fetch request');

        if (script && script.trim()) {
            requestBody.defaults = script;
        }

        // サイズチェックを事前実行
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
                        mobj['id'] = current_device.id;
                        showDownloadLinks(mobj.images || [], mobj, mobj.request_hash);
                    });
                    break;
                case 202:
                    response.json().then((mobj) => {
                        showProgress(`${mobj.imagebuilder_status || 'Processing'}...`, 30);
                        setTimeout(() => pollBuildStatus(mobj.request_hash), 5000);
                    });
                    break;
                case 400: // bad request
                case 422: // bad package
                case 500: // build failed
                    response.text().then((responseText) => {
                        hideProgress();
                        showBuildStatus('Build failed: HTTP 500 Server Error', 'error');
                        
                        // 詳細なエラー情報を表示
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
                    
                    // STDERR/STDOUT の表示
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
                
                // ビルド失敗時も詳細情報を表示
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
    
    // 進捗バーエリアにスクロールして必ず見えるようにする
    setTimeout(() => {
        const progressElement = document.getElementById('build-progress');
        if (progressElement) {
            progressElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'nearest',
                inline: 'nearest'
            });
        }
    }, 100); // DOM更新後にスクロール
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

function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleString();
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
        
        // 公式に合わせたファイル名の表示形式
        let displayName = fileName;
        
        // ファイルタイプの判定と振り分け
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
            // typeが不明な場合はファイル名で判定
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
    
    // 空のセクションに「利用不可」メッセージを表示
    if (!hasFactory) {
        factoryContainer.innerHTML = '<span class="text-muted">No factory image available for this device.</span>';
    }
    
    if (!hasSysupgrade) {
        sysupgradeContainer.innerHTML = '<span class="text-muted">No sysupgrade image available for this device.</span>';
    }
    
    // その他のイメージがある場合のみセクションを表示
    if (hasOther) {
        otherSection.style.display = 'block';
    }
    
    // Build情報を表示（公式スタイル）
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
     
// ==================== Commands入力ボックス ====================
(function() {
    const cmdInput = document.getElementById('command');
    if (cmdInput) {
        // ---- 入力確定後（IME確定・Enter・フォーカスアウト）で反映 ----
        const commitCommandValue = () => {
            const val = cmdInput.value.trim();
            if (val) {
                syncCommandsToTemplate();
                // 空欄が無ければ追加欄生成（1つだけ）
                setTimeout(() => {
                    if (!document.querySelector('#commands-autocomplete input[value=""]')) {
                        createExtraCommandBox();
                    }
                }, 100);
            } else {
                // 空の場合は削除処理
                const total = document.querySelectorAll('#command, #commands-autocomplete input.command').length;
                if (total > 1 && cmdInput.parentNode) {
                    cmdInput.parentNode.removeChild(cmdInput);
                }
                syncCommandsToTemplate();
            }
        };
        
        // changeイベントのみに統一
        cmdInput.addEventListener('change', commitCommandValue);

        // Enterキー処理のみ追加（changeイベントを発火させる）
        cmdInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.blur(); // フォーカスを外してchangeイベントを発火
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

    // 確定時のみ反映（inputイベント削除）
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

    // changeイベントのみ
    newInput.addEventListener('change', commitValue);

    // Enterキー処理
    newInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.blur(); // changeイベントを発火
        }
    });

    host.appendChild(newInput);
    newInput.focus();
}

function syncCommandsToTemplate() {
    // リアルタイムでテンプレート更新（aios-config開状態のみ）
    if (document.getElementById('use-aios-config-details').open) {
        updateConfiguredTemplate();
    }
}
