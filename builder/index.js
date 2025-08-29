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
