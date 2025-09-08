// custom.js - 言語セレクター連携修正版

console.log('custom.js (language selector fix) loaded');

// ==================== グローバル変数 ====================
let customInitialized = false;
let customHTMLLoaded = false;
let PACKAGE_DB = null;
let setupConfig = null;
let formStructure = {};
let cachedApiInfo = null;
let defaultFieldValues = {};
let dynamicPackages = new Set();
let selectedLanguage = '';

// デバイス固有パッケージ管理（重要：これらを常に維持）
let deviceDefaultPackages = [];  // mobj.default_packages
let deviceDevicePackages = [];   // mobj.device_packages  
let extraPackages = [];           // config.asu_extra_packages

// 言語セレクター管理用
let mainLanguageSelect = null;
let customLanguageSelect = null;
let isLanguageChanging = false;

// ==================== 初期化処理 ====================
// 元の updateImages をフック
const originalUpdateImages = window.updateImages;
window.updateImages = function(version, mobj) {
    if (originalUpdateImages) originalUpdateImages(version, mobj);

    // arch_packagesをcurrent_deviceに保存
    if (mobj && mobj.arch_packages && current_device) {
        current_device.arch = mobj.arch_packages;
        console.log('Architecture saved:', mobj.arch_packages);
        
        // デバイス選択時に言語パッケージを即座に更新
        setTimeout(() => {
            console.log('Device selected, updating language packages');
            updateLanguagePackage();
        }, 100);
    }

    // デバイス固有パッケージを保存（重要）
    if (mobj && "manifest" in mobj === false) {
        deviceDefaultPackages = mobj.default_packages || [];
        deviceDevicePackages = mobj.device_packages || [];
        extraPackages = config.asu_extra_packages || [];
        
        console.log('Device packages saved:', {
            default: deviceDefaultPackages.length,
            device: deviceDevicePackages.length,
            extra: extraPackages.length
        });
        
        // 初期パッケージリストを設定（index.jsの処理を維持）
        const initialPackages = deviceDefaultPackages
            .concat(deviceDevicePackages)
            .concat(extraPackages);
        
        const textarea = document.querySelector('#asu-packages');
        if (textarea) {
            textarea.value = initialPackages.join(' ');
            console.log('Initial packages set:', initialPackages.length);
        }
        
        // パッケージリスト設定後にリサイズ
        setTimeout(() => resizePostinstTextarea(), 100);
    }
    
    // 初回のみ custom.html を読み込む
    if (!customHTMLLoaded) {
        console.log("Loading custom.html");
        loadCustomHTML();
        customHTMLLoaded = true;
    } else {
        console.log("Reinitializing features");
        reinitializeFeatures();
    }
};

// 元の translate 関数をフック（custom部分の翻訳対応）
const originalTranslate = window.translate;
window.translate = function(lang) {
    if (originalTranslate) {
        originalTranslate(lang);
    }
    
    // custom部分の翻訳処理を追加
    translateCustomElements(lang || current_language);
};

// custom.html 読み込み
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

// #asu が存在するまで待機
function waitForAsuAndInit(temp, retry = 50) {
    const asuSection = document.querySelector('#asu');
    if (asuSection) {
        initializeCustomFeatures(asuSection, temp);
    } else if (retry > 0) {
        setTimeout(() => waitForAsuAndInit(temp, retry - 1), 50);
    } else {
        console.warn('#asu not found after waiting');
    }
}

// メイン初期化
async function initializeCustomFeatures(asuSection, temp) {
    console.log('initializeCustomFeatures called');
    
    if (customInitialized) {
        console.log('Already initialized, skipping');
        return;
    }

    cleanupExistingCustomElements();
    replaceAsuSection(asuSection, temp);
    insertExtendedInfo(temp);
    
    // 設定とデータを並列で読み込み
    await Promise.all([
        loadSetupConfig(),
        loadPackageDatabase(),
        fetchAndDisplayIspInfo()
    ]);
    
    // 依存関係のある初期化（順序重要）
    setupEventListeners();
    loadUciDefaultsTemplate();
    
    // 言語セレクター設定（改善版）
    setupLanguageSelectors();
    
    // フォーム監視設定
    setupFormWatchers();
    
    customInitialized = true;
    
    // 初期翻訳実行
    translateCustomElements(current_language);
}

// #asuセクションを置き換え（修正版：index.jsが期待するDOM要素を全て保持）
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

    // index.jsが期待する全てのDOM要素を追加
    newDiv.insertAdjacentHTML('beforeend', `
        <br>
        <div id="asu-buildstatus" class="hide">
            <span></span>
            <div id="asu-log" class="hide">
                <details>
                    <summary>
                        <code>STDERR</code>
                    </summary>
                    <pre id="asu-stderr"></pre>
                </details>
                <details>
                    <summary>
                        <code>STDOUT</code>
                    </summary>
                    <pre id="asu-stdout"></pre>
                </details>
            </div>
        </div>
        <a href="javascript:buildAsuRequest()" class="custom-link">
            <span></span><span class="tr-request-build">REQUEST BUILD</span>
        </a>
    `);
    
    asuSection.parentNode.replaceChild(newDiv, asuSection);
}

// 拡張情報セクション挿入
function insertExtendedInfo(temp) {
    const extendedInfo = temp.querySelector('#extended-build-info');
    const imageLink = document.querySelector('#image-link');
    if (extendedInfo && imageLink && !document.querySelector('#extended-build-info')) {
        imageLink.closest('.row').insertAdjacentElement('afterend', extendedInfo);
        show('#extended-build-info');
    }
}

// 既存要素クリーンアップ
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

// 再初期化処理
function reinitializeFeatures() {
    if (!document.querySelector('#asu')) return;
    
    setupEventListeners();
    setupLanguageSelectors(); // 言語セレクター再設定
    
    if (PACKAGE_DB) generatePackageSelector();
    fetchAndDisplayIspInfo();
    if (cachedApiInfo) updateAutoConnectionInfo(cachedApiInfo);
    
    // 再初期化時も翻訳実行
    translateCustomElements(current_language);
}

// ==================== 言語セレクター設定（改善版） ====================
function setupLanguageSelectors() {
    // セレクター要素を取得・保存
    mainLanguageSelect = document.querySelector('#languages-select');
    customLanguageSelect = document.querySelector('#aios-language');
    
    const fallback = config?.fallback_language || 'en';
    
    // 現在の言語を決定（優先順位：メイン言語セレクター > current_language > フォールバック）
    let currentLanguage = fallback;
    if (mainLanguageSelect && mainLanguageSelect.value) {
        currentLanguage = mainLanguageSelect.value;
    } else if (current_language) {
        currentLanguage = current_language;
    }
    
    selectedLanguage = currentLanguage;
    console.log('Selected language for device:', selectedLanguage);
    
    // カスタム言語セレクターを同期
    if (customLanguageSelect && customLanguageSelect.value !== selectedLanguage) {
        customLanguageSelect.value = selectedLanguage;
        console.log('Synchronized custom language selector to:', selectedLanguage);
    }
    
    // イベントリスナー設定
    setupLanguageEventListeners();
    
    // 初回言語パッケージ更新（重要：初期化時に必ず実行）
    console.log('Performing initial language package update');
    updateLanguagePackage();
}

function setupLanguageEventListeners() {
    // 既存のイベントリスナーを削除
    if (mainLanguageSelect) {
        const newMainSelect = mainLanguageSelect.cloneNode(true);
        mainLanguageSelect.parentNode.replaceChild(newMainSelect, mainLanguageSelect);
        mainLanguageSelect = newMainSelect;
    }
    
    if (customLanguageSelect) {
        const newCustomSelect = customLanguageSelect.cloneNode(true);
        customLanguageSelect.parentNode.replaceChild(newCustomSelect, customLanguageSelect);
        customLanguageSelect = newCustomSelect;
    }
    
    // メイン言語セレクター（ブラウザ表示用）のイベントリスナー
    if (mainLanguageSelect) {
        mainLanguageSelect.addEventListener('change', async function(e) {
            if (isLanguageChanging) return;
            
            isLanguageChanging = true;
            console.log('Main language selector changed to:', e.target.value);
            
            selectedLanguage = e.target.value || config?.fallback_language || 'en';
            
            // カスタム言語セレクターも同期
            if (customLanguageSelect && customLanguageSelect.value !== selectedLanguage) {
                customLanguageSelect.value = selectedLanguage;
                console.log('Synchronized custom language selector to:', selectedLanguage);
            }
            
            // 言語パッケージ更新
            await updateLanguagePackage();
            updatePackageListFromSelector();
            updateVariableDefinitions();
            
            console.log('Main language change processing completed');
            isLanguageChanging = false;
        });
    }
    
    // カスタム言語セレクター（デバイス設定用）のイベントリスナー
    if (customLanguageSelect) {
        customLanguageSelect.addEventListener('change', async function(e) {
            if (isLanguageChanging) return;
            
            isLanguageChanging = true;
            console.log('Custom language selector changed to:', e.target.value);
            
            selectedLanguage = e.target.value || config?.fallback_language || 'en';
            
            // 言語パッケージ更新（デバイス設定用のみ）
            await updateLanguagePackage();
            updatePackageListFromSelector();
            updateVariableDefinitions();
            
            console.log('Custom language change processing completed');
            isLanguageChanging = false;
        });
    }
}

// custom部分の翻訳処理
function translateCustomElements(lang) {
    if (!lang || !current_language_json) return;
    
    console.log('Translating custom elements for language:', lang);
    
    // custom.htmlで追加された要素の翻訳
    // 例：tr-クラスを持つ要素の翻訳
    document.querySelectorAll('[class*="tr-"]').forEach(element => {
        const classList = Array.from(element.classList);
        const trClass = classList.find(cls => cls.startsWith('tr-'));
        
        if (trClass && current_language_json[trClass]) {
            if (element.placeholder !== undefined) {
                element.placeholder = current_language_json[trClass];
            } else if (element.tagName === 'OPTION') {
                element.textContent = current_language_json[trClass];
            } else {
                element.textContent = current_language_json[trClass];
            }
        }
    });
    
    // setup.jsonから生成されたフィールドの翻訳
    if (setupConfig && setupConfig.translations && setupConfig.translations[lang]) {
        const translations = setupConfig.translations[lang];
        
        Object.entries(translations).forEach(([key, value]) => {
            const element = document.getElementById(key) || document.querySelector(`[data-translation-key="${key}"]`);
            if (element) {
                if (element.tagName === 'LABEL') {
                    element.textContent = value;
                } else if (element.placeholder !== undefined) {
                    element.placeholder = value;
                } else {
                    element.textContent = value;
                }
            }
        });
    }
    
    console.log('Custom elements translation completed');
}

// 言語パッケージの更新（修正版）
async function updateLanguagePackage() {
    console.log('updateLanguagePackage called, selectedLanguage:', selectedLanguage);
    
    // 既存の言語パッケージを削除
    for (const pkg of Array.from(dynamicPackages)) {
        if (pkg.startsWith('luci-i18n-')) {
            dynamicPackages.delete(pkg);
            console.log('Removed language package:', pkg);
        }
    }
    
    // 英語の場合は言語パッケージ不要
    if (!selectedLanguage || selectedLanguage === 'en') {
        console.log('English selected, no language packages needed');
        updatePackageListFromSelector();
        return;
    }
    
    // アーキテクチャとバージョンの確認
    console.log('Current device state:', {
        arch: current_device?.arch,
        version: current_device?.version,
        target: current_device?.target,
        hasCurrentDevice: !!current_device
    });
    
    // デバイス情報が不完全な場合は基本言語パッケージのみ追加
    if (!current_device?.arch) {
        console.log('Device architecture not available, adding basic language package anyway');
        const basePkg = `luci-i18n-base-${selectedLanguage}`;
        dynamicPackages.add(basePkg);
        console.log('Added basic language package without validation:', basePkg);
        updatePackageListFromSelector();
        return;
    }
    
    console.log('Device available, checking language packages for arch:', current_device.arch);
    
    // 基本言語パッケージをチェック
    const basePkg = `luci-i18n-base-${selectedLanguage}`;
    console.log('Checking base package:', basePkg);
    
    try {
        if (await isPackageAvailable(basePkg, 'luci')) {
            dynamicPackages.add(basePkg);
            console.log('Added validated base language package:', basePkg);
        } else {
            console.log('Base language package not available:', basePkg);
        }
    } catch (err) {
        console.error('Error checking base package:', err);
        // エラー時でも基本パッケージは追加
        dynamicPackages.add(basePkg);
        console.log('Added base language package despite error:', basePkg);
    }
    
    // 現在のパッケージに対応する言語パッケージをチェック
    const currentPackages = getCurrentPackageList();
    console.log('Current packages for language check:', currentPackages.length);
    
    for (const pkg of currentPackages) {
        if (pkg.startsWith('luci-') && !pkg.startsWith('luci-i18n-')) {
            const luciName = extractLuciName(pkg);
            if (luciName) {
                const langPkg = `luci-i18n-${luciName}-${selectedLanguage}`;
                console.log('Checking LuCI language package:', langPkg);
                
                try {
                    if (await isPackageAvailable(langPkg, 'luci')) {
                        dynamicPackages.add(langPkg);
                        console.log('Added LuCI language package:', langPkg);
                    }
                } catch (err) {
                    console.error('Error checking LuCI package:', err);
                }
            }
        }
    }
    
    console.log('Final dynamic packages:', Array.from(dynamicPackages));
    updatePackageListFromSelector();
}

function extractLuciName(pkg) {
    if (pkg === 'luci') return 'base';
    if (pkg.startsWith('luci-app-')) return pkg.substring(5);
    if (pkg.startsWith('luci-mod-')) return pkg.substring(5);
    if (pkg.startsWith('luci-theme-')) return pkg.substring(5);
    if (pkg.startsWith('luci-proto-')) return pkg.substring(5);
    return null;
}

function getCurrentPackageList() {
    const packages = new Set();
    
    // デバイス初期パッケージを必ず含める
    deviceDefaultPackages.forEach(pkg => packages.add(pkg));
    deviceDevicePackages.forEach(pkg => packages.add(pkg));
    extraPackages.forEach(pkg => packages.add(pkg));
    
    // パッケージセレクターから選択されたパッケージ
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
        const pkgName = cb.getAttribute('data-package');
        if (pkgName) packages.add(pkgName);
    });
    
    // テキストエリアから既存パッケージ（デバイス初期パッケージ以外）
    const textarea = document.querySelector('#asu-packages');
    if (textarea) {
        const textPackages = split(textarea.value);
        textPackages.forEach(pkg => {
            // デバイス初期パッケージでなければ追加
            if (!deviceDefaultPackages.includes(pkg) && 
                !deviceDevicePackages.includes(pkg) && 
                !extraPackages.includes(pkg)) {
                packages.add(pkg);
            }
        });
    }
    
    // 動的パッケージ（非言語パッケージのみ）
    for (const pkg of dynamicPackages) {
        if (!pkg.startsWith('luci-i18n-')) {
            packages.add(pkg);
        }
    }
    
    return Array.from(packages);
}

// パッケージ存在チェック
async function isPackageAvailable(pkgName, feed) {
    if (!pkgName || !feed) {
        return false;
    }
    
    const arch = current_device?.arch;
    const version = current_device?.version;
    
    if (!arch || !version) {
        console.log('Missing device info for package check:', { arch, version });
        return false;
    }
    
    try {
        let packagesUrl;
        
        if (version.includes('SNAPSHOT')) {
            packagesUrl = config.apk_search_url
                .replace('{arch}', arch)
                .replace('{feed}', feed);
            
            console.log('Checking APK URL:', packagesUrl);
            
            const resp = await fetch(packagesUrl, { cache: 'no-store' });
            if (!resp.ok) {
                console.log('APK fetch failed:', resp.status);
                return false;
            }
            
            const data = await resp.json();
            if (Array.isArray(data.packages)) {
                return data.packages.some(p => p?.name === pkgName);
            } else if (data.packages && typeof data.packages === 'object') {
                return Object.prototype.hasOwnProperty.call(data.packages, pkgName);
            }
            return false;
        } else {
            packagesUrl = config.opkg_search_url
                .replace('{version}', version)
                .replace('{arch}', arch)
                .replace('{feed}', feed);
            
            console.log('Checking OPKG URL:', packagesUrl);
            
            const resp = await fetch(packagesUrl, { cache: 'no-store' });
            if (!resp.ok) {
                console.log('OPKG fetch failed:', resp.status);
                return false;
            }
            
            const text = await resp.text();
            const found = text.split('\n').some(line => line.trim() === `Package: ${pkgName}`);
            console.log('Package check result for', pkgName, ':', found);
            return found;
        }
    } catch (err) {
        console.error('Package availability check error:', err);
        return false;
    }
}

// 以下、他の関数は元のコードと同様...
// （setup.json処理、イベントハンドラ、ISP情報処理、パッケージ管理、UCI-defaults処理、フォーム監視、ユーティリティ関数など）

// ここでは主要な修正箇所のみ記載しています

console.log('custom.js (language selector fix) fully loaded and ready');
