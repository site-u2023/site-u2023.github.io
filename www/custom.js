// Fix for initializeCustomFeatures - ensure device packages are applied
async function initializeCustomFeatures(asuSection, temp) {
    console.log('initializeCustomFeatures called');

    if (customInitialized) {
        console.log('Already initialized, skipping');
        return;
    }

    // DOM要素が既に存在する場合は置き換えない
    if (!document.querySelector('#custom-packages-details')) {
        cleanupExistingCustomElements();
        replaceAsuSection(asuSection, temp);
        insertExtendedInfo(temp);
    }

    // 外部データと設定を並列で読み込み
    await Promise.all([
        window.autoConfigPromise,       // auto-config.site-u.workers.dev
        window.informationPromise,      // information.json
        window.packagesDbPromise,       // packages.json
        window.setupJsonPromise,        // setup.json
        loadSetupConfig(),              // 既存処理
        loadPackageDatabase(),          // 既存処理
        fetchAndDisplayIspInfo()        // 既存処理
    ]);

    // 依存関係のある初期化（順序重要）
    setupEventListeners();
    loadUciDefaultsTemplate();

    // 言語セレクター設定（初期言語パッケージ処理を含む）
    setupLanguageSelector();

    // パッケージ検索機能を初期化
    setupPackageSearch();
    console.log('Package search initialized');

    // カスタム翻訳を読み込み（初期言語に基づいて）
    await loadCustomTranslations(selectedLanguage);

    // フォーム監視設定
    setupFormWatchers();

    // initializeCustomFeatures の末尾
    let changed = false;
    if (window.autoConfigData) {
        changed = applyIspAutoConfig(window.autoConfigData);
    }

    // パッケージセレクタ生成
    generatePackageSelector();

    // CRITICAL FIX: Force apply device packages if they exist
    if (deviceDefaultPackages.length > 0 || deviceDevicePackages.length > 0 || extraPackages.length > 0) {
        console.log('Force applying existing device packages');
        const initialPackages = deviceDefaultPackages
            .concat(deviceDevicePackages)
            .concat(extraPackages);
        
        const textarea = document.querySelector('#asu-packages');
        if (textarea && initialPackages.length > 0) {
            textarea.value = initialPackages.join(' ');
            console.log('Device packages force applied:', initialPackages);
        }
    }

    // 最初の統合更新（変更があった場合のみ）
    if (changed) {
        console.log('All data and UI ready, updating package state');
        updateAllPackageState('isp-auto-config');
    } else {
        console.log('All data and UI ready, no changes from auto-config');
        // CRITICAL FIX: Always force update to ensure device packages are included
        setTimeout(() => {
            updateAllPackageState('force-device-packages');
        }, 200);
    }

    customInitialized = true;
}

// Fix for updateAllPackageState - add safety check
async function updateAllPackageState(source = 'unknown') {
    // CRITICAL FIX: Don't proceed if device packages aren't loaded yet
    if (!customInitialized && (deviceDefaultPackages.length === 0 && deviceDevicePackages.length === 0)) {
        console.log('updateAllPackageState: Device packages not ready, deferring update from:', source);
        return;
    }

    // 現在のフォーム状態を収集
    const currentState = collectFormValues();
    const hash = JSON.stringify(currentState);

    // 前回と同じ状態ならスキップ（device package loading は例外）
    if (hash === lastFormStateHash && !source.includes('device') && !source.includes('force')) {
        return;
    }
    lastFormStateHash = hash;

    console.log(`updateAllPackageState called from: ${source}`);

    // 1. setup.jsonベースのパッケージ更新
    updateSetupJsonPackagesCore();

    // 2. 言語パッケージの更新
    await updateLanguagePackageCore();

    // 3. Postinstテキストエリアへの反映（差分検知付き）
    updatePackageListToTextarea(source);

    // 4. setup.sh変数の更新
    updateVariableDefinitions();

    console.log('All package state updated successfully');
}
