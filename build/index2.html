async function loadSetupShTemplate() {
    const res = await fetch('build/scripts/setup.sh');
    if (!res.ok) throw new Error('Failed to load setup.sh');
    return await res.text();
}

let SETUP_SH_TEMPLATE = '';
let PACKAGE_DB = {};

// config.js相当の設定
const aiosConfig = {
    show_help: true,
    image_url: "https://downloads.openwrt.org",
    info_url: "https://openwrt.org/start?do=search&id=toh&q={title} @toh",
    asu_url: "https://sysupgrade.openwrt.org",
    asu_extra_packages: ["luci"]
};

// グローバル変数
let app = {
    versions: [],
    devices: [],
    selectedDevice: null,
    selectedVersion: '',
    templateLoaded: false
};

// map.shのキャッシュ
let mapShCache = {
    'new': null,
    '19': null
};

async function loadPackageDb() {
    const res = await fetch('scripts/packages.json');
    if (!res.ok) throw new Error('Failed to load packages.json');
    PACKAGE_DB = await res.json();
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        SETUP_SH_TEMPLATE = await loadSetupShTemplate();
        await loadPackageDb();

        // イベントバインド
        bindEvents();
        document.getElementById('aios-language').addEventListener('change', refreshTemplateAndPackages);

        init();
    } catch (err) {
        console.error('初期読み込みに失敗:', err);
    }
});

// ==================== 初期化関数 ====================
async function init() {
    try {
        await loadVersions();
        bindEvents();
        
        // map.shを事前ロード
        await loadMapShScripts();

        // パッケージセレクターを動的生成
        generatePackageSelector();
        
        refreshTemplateAndPackages();
        
        // ISP情報を初期取得（常時表示のため）
        console.log('Starting ISP info fetch...');
        await fetchApiInfoAndUpdate();

    } catch (error) {
        console.error('Failed to initialize:', error);
        updateIspDisplay('Initialization error', 'Failed to initialize application: ' + error.message);
    }
}

// ==================== パッケージ関数 ====================
function normalizeLang(lang) {
  const map = {
    en: '',       // 英語は i18n パッケージ不要
    pt_br: 'pt-br',
    zh_cn: 'zh-cn',
    zh_tw: 'zh-tw'
  };
  return (map[lang] ?? String(lang || '').toLowerCase());
}

function asuI18nDB(lang) {
  const norm = normalizeLang(lang);
  const isEN = !norm;
  const s = isEN ? '' : `-${norm}`;
  const make = (key) => (isEN ? [] : [`luci-i18n-${key}${s}`]);

  return {
    base: make('base'),
    opkg: make('opkg'),
    firewall: make('firewall'),
    ttyd: make('ttyd'),
    commands: make('commands'),
    irqbalance: make('irqbalance'),
    qos: make('qos'),
    sqm: make('sqm'),
    statistics: make('statistics'),
    nlbwmon: make('nlbwmon'),
    wifischedule: make('wifischedule'),
    wol: make('wol'),
    ddns: make('ddns'),
    banip: make('banip'),
    watchcat: make('watchcat'),
    dashboard: make('dashboard'),
    attendedsysupgrade: make('attendedsysupgrade'),
    dockerman: make('dockerman'),
    'hd-idle': make('hd-idle'),
    samba4: make('samba4'),
  };
}

function asuCollectPackages() {
  const lang = document.getElementById('aios-language').value?.trim() || 'en';
  const norm = normalizeLang(lang);
  const db = asuI18nDB(lang);
  const textarea = document.getElementById('asu-packages');
  let current = split(textarea.value);

  // 1) i18n の整理: 英語なら全 i18n を削除、非英語なら現在言語以外を削除
  current = current.filter(pkg => {
    if (!pkg.startsWith('luci-i18n-')) return true;
    const m = pkg.match(/^luci-i18n-(.+?)-([A-Za-z]{2}(?:-[A-Za-z]{2})?)$/);
    const suffix = (m && m[2]) ? m[2].toLowerCase() : '';
    if (!norm) return false; // 英語: i18n 全排除
    return suffix === norm;  // 現在言語のみ温存
  });

  // 2) ベースパッケージ集合（セレクター選択＋手動入力の双方）
  const baseSet = new Set();

  // セレクター選択から
  document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
    const names = cb.getAttribute('data-package')?.split(/\s+/) || [];
    names.forEach(n => baseSet.add(n));
  });

  // 手動入力から（luci-app- だけでなく素のパッケージ名もベースとして扱う）
  current.forEach(pkg => {
    // 除外: i18n 自体はベースではない
    if (pkg.startsWith('luci-i18n-')) return;
    baseSet.add(pkg);
  });

  // 3) 現在言語の i18n でも、対応するベースパッケージがなければ除去（ゴースト除去）
  current = current.filter(pkg => {
    if (!pkg.startsWith('luci-i18n-')) return true;
    const m = pkg.match(/^luci-i18n-(.+?)-([A-Za-z]{2}(?:-[A-Za-z]{2})?)$/);
    if (!m) return false;
    const key = m[1]; // luci-i18n-<key>-<lang>
    // luci-app-<key> がベースになるケースに対応
    return baseSet.has(`luci-app-${key}`) || baseSet.has(key);
  });

  // 4) 追加関数
  const add = (pkg) => {
    if (pkg && !current.includes(pkg)) current.push(pkg);
  };

  // 5) 非英語のみ、基本 i18n を追加
  ['base', 'opkg', 'firewall'].forEach(k => (db[k] || []).forEach(add));

  // 6) i18n 対象キー（セレクターと手打ちの両方から抽出）
  const keys = new Set();

  // セレクター選択中のパッケージからキー抽出
  document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
    const names = cb.getAttribute('data-package')?.split(/\s+/) || [];
    names.forEach(pkg => {
      const m = pkg.match(/^luci-app-(.+)$/);
      const key = m ? m[1] : pkg;
      if (db[key]) keys.add(key);
    });
  });

  // 手動入力からキー抽出（luci-app- と素の両対応）
  current.forEach(pkg => {
    if (pkg.startsWith('luci-i18n-')) return;
    const m = pkg.match(/^luci-app-(.+)$/);
    const key = m ? m[1] : pkg;
    if (db[key]) keys.add(key);
  });

  // 7) 現在言語の i18n のみ追加（英語は何も追加しない）
  keys.forEach(k => (db[k] || []).forEach(add));

  // 8) 最終重複排除
  current = Array.from(new Set(current));

  textarea.value = current.join(' ');
}
            
// ==================== map.sh関連 ====================
async function loadMapShScripts() {
    try {
        // OpenWrt 21.02以降用
        if (!mapShCache['new']) {
            const responseNew = await fetch('https://site-u.pages.dev/build/scripts/map.sh.new');
            if (responseNew.ok) {
                mapShCache['new'] = await responseNew.text();
                console.log('Loaded map.sh.new successfully');
            } else {
                console.error('Failed to load map.sh.new');
            }
        }
        
        // OpenWrt 19.x用
        if (!mapShCache['19']) {
            const response19 = await fetch('https://site-u.pages.dev/build/scripts/map.sh.19');
            if (response19.ok) {
                mapShCache['19'] = await response19.text();
                console.log('Loaded map.sh.19 successfully');
            } else {
                console.error('Failed to load map.sh.19');
            }
        }
    } catch (error) {
        console.error('Failed to load map.sh scripts:', error);
    }
}

// map.sh内容を埋め込む（同期版 - キャッシュから取得）
function loadMapShContentSync(content, osVersion) {
    // ${map_sh_content}プレースホルダーがない場合は何もしない
    if (!content.includes('${map_sh_content}')) {
        return content;
    }

    let mapShContent = '';
    
    // OSバージョンに応じて適切なmap.shを選択
    if (osVersion && osVersion.startsWith('19')) {
        mapShContent = mapShCache['19'] || '';
        console.log('Using map.sh.19 for OpenWrt 19.x');
    } else {
        mapShContent = mapShCache['new'] || '';
        console.log('Using map.sh.new for OpenWrt 21.02+');
    }
    
    // map.shが取得できていない場合の警告
    if (!mapShContent) {
        console.warn('map.sh content not available, using fallback');
        mapShContent = `#!/bin/sh
# MAP-E script not loaded - network download required
# This is a fallback placeholder. The actual script should be downloaded from:
# https://site-u.pages.dev/build/scripts/map.sh.new or map.sh.19
echo "ERROR: map.sh was not properly embedded during build" >&2
exit 1`;
    }
    
    // ${map_sh_content}を実際の内容で置換
    return content.replace('${map_sh_content}', mapShContent);
}

// ==================== イベントバインディング ====================
function bindEvents() {
    document.getElementById('versions').addEventListener('change', handleVersionChange);
    document.getElementById('models').addEventListener('input', handleDeviceSearch);
    document.getElementById('use-aios-config').addEventListener('change', toggleAiosConfig);
    document.getElementById('use-package-selector').addEventListener('change', togglePackageSelector);
    document.getElementById('request-build').addEventListener('click', buildAsuRequest);

    // パッケージ選択チェックボックスのイベントは動的生成時に設定

    // DS-Lite mode (auto/manual) の監視を追加
    document.querySelectorAll('input[name="dsliteMode"]').forEach(radio => {
        radio.addEventListener('change', handleDsliteModeChange);
    });
    
    // Connection mode (AUTO/OFF) の監視
    document.querySelectorAll('input[name="connectionMode"]').forEach(radio => {
        radio.addEventListener('change', handleConnectionModeChange);
    });

    // Connection type (DHCP/PPPoE/DS-Lite/MAP-E/None) の監視
    document.querySelectorAll('input[name="connectionType"]').forEach(radio => {
        radio.addEventListener('change', handleConnectionTypeChange);
    });

    // MAP-E type (auto/gua/pd) の監視
    document.querySelectorAll('input[name="mapeType"]').forEach(radio => {
        radio.addEventListener('change', handleMapeTypeChange);
    });

    // aios-config内の全ての入力フィールドに非同期リスナーを追加
    document.getElementById('aios-config').addEventListener('input', function(e) {
        if (document.getElementById('use-aios-config').checked) {
            applyConnectionSettingsChange();
        }
    });

    document.getElementById('aios-config').addEventListener('change', function(e) {
        if (document.getElementById('use-aios-config').checked) {
            applyConnectionSettingsChange();
        }
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.autocomplete')) {
            hideAutocomplete();
        }
    });

    // 初期状態設定：手動接続セクションを非表示
    document.getElementById('manual-connection-section').style.display = 'none';
    document.getElementById('pppoe-section').style.display = 'none';
    document.getElementById('dslite-section').style.display = 'none';
    document.getElementById('mape-manual-section').style.display = 'none';
}

// ==================== パッケージセレクター関連 ====================
function togglePackageSelector(e) {
    const configSection = document.getElementById('package-selector-config');
    if (e.target.checked) {
        configSection.style.display = 'block';
    } else {
        configSection.style.display = 'none';
    }
}

function generatePackageSelector() {
    const container = document.getElementById('package-categories');
    if (!container) return;

    container.innerHTML = '';

    // 依存パッケージIDの集合を構築
    const depIds = new Set();
    PACKAGE_DB.categories.forEach(cat => {
        cat.packages.forEach(pkg => {
            if (pkg.dependencies) {
                pkg.dependencies.forEach(d => depIds.add(d));
            }
        });
    });

    PACKAGE_DB.categories.forEach(category => {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'package-category';

        const categoryTitle = document.createElement('h6');
        categoryTitle.textContent = category.name;
        categoryDiv.appendChild(categoryTitle);

        const packageGrid = document.createElement('div');
        packageGrid.className = 'package-grid';

        category.packages.forEach(pkg => {
            // 依存パッケージはトップレベル描画しない
            if (depIds.has(pkg.id)) return;

            // 親行
            const packageItem = document.createElement('div');
            packageItem.className = 'package-item';
            if (pkg.hidden) packageItem.classList.add('package-hidden');

            const formCheck = document.createElement('div');
            formCheck.className = 'form-check';

            const checkbox = document.createElement('input');
            checkbox.className = 'form-check-input package-selector-checkbox';
            checkbox.type = 'checkbox';
            checkbox.id = `pkg-${pkg.id}`;
            checkbox.setAttribute('data-package', pkg.name);
            if (pkg.dependencies) {
                checkbox.setAttribute('data-dependencies', pkg.dependencies.join(','));
            }
            checkbox.addEventListener('change', handlePackageSelection);

            const label = document.createElement('label');
            label.className = 'form-check-label';
            label.setAttribute('for', `pkg-${pkg.id}`);

            const link = document.createElement('a');
            link.href = pkg.url;
            link.target = '_blank';
            link.className = 'package-link';
            link.textContent = pkg.name;

            label.appendChild(link);
            formCheck.appendChild(checkbox);
            formCheck.appendChild(label);
            packageItem.appendChild(formCheck);

            // 子行（依存パッケージ）
            if (pkg.dependencies) {
                pkg.dependencies.forEach(depId => {
                    let depPkg;
                    for (const cat of PACKAGE_DB.categories) {
                        depPkg = cat.packages.find(p => p.id === depId);
                        if (depPkg) break;
                    }

                    const depItem = document.createElement('div');
                    depItem.className = 'package-dependent';

                    const depCheck = document.createElement('input');
                    depCheck.className = 'form-check-input package-selector-checkbox';
                    depCheck.type = 'checkbox';
                    depCheck.id = `pkg-${depPkg ? depPkg.id : depId}`;
                    depCheck.setAttribute('data-package', depPkg ? depPkg.name : depId);
                    depCheck.addEventListener('change', handlePackageSelection);

                    const depLabel = document.createElement('label');
                    depLabel.className = 'form-check-label';
                    depLabel.setAttribute('for', `pkg-${depPkg ? depPkg.id : depId}`);

                    if (depPkg) {
                        const depLink = document.createElement('a');
                        depLink.href = depPkg.url;
                        depLink.target = '_blank';
                        depLink.className = 'package-link';
                        depLink.textContent = depPkg.name;
                        depLabel.appendChild(depLink);
                    } else {
                        depLabel.textContent = depId;
                    }

                    depItem.appendChild(depCheck);
                    depItem.appendChild(depLabel);
                    packageItem.appendChild(depItem);
                });
            }

            packageGrid.appendChild(packageItem);
        });

        categoryDiv.appendChild(packageGrid);

        const description = document.createElement('div');
        description.className = 'package-description';
        description.textContent = category.description;
        categoryDiv.appendChild(description);

        container.appendChild(categoryDiv);
    });
}

function handlePackageSelection(e) {
    const pkg = e.target;
    const packageName = pkg.getAttribute('data-package');
    const isChecked = pkg.checked;

    // ユーザー操作の記録（任意上書きOK）
    if (isChecked) {
        pkg.setAttribute('data-user', '1');
    } else {
        pkg.removeAttribute('data-user');
    }

    // 依存パッケージの完全同調（カンマ/空白の両対応）
    const dependencies = pkg.getAttribute('data-dependencies') || '';
    const depPackages = dependencies.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);

    if (depPackages.length) {
        depPackages.forEach(dep => {
            const depCheckbox = document.querySelector(`#pkg-${dep}`);
            if (!depCheckbox) return;
            depCheckbox.checked = isChecked;
            depCheckbox.disabled = false; // 念のため解除
        });
    }

    updatePackageListFromSelector();
}
    
function updatePackageListFromSelector() {
    const packagesTextarea = document.getElementById('asu-packages');
    let currentPackages = split(packagesTextarea.value);
    
    // グラフィカルセレクターで管理するパッケージのリスト
    const selectorPackages = [];
    document.querySelectorAll('.package-selector-checkbox').forEach(checkbox => {
        const pkgName = checkbox.getAttribute('data-package');
        if (pkgName) {
            selectorPackages.push(pkgName);
        }
    });
    
    // 既存のパッケージから、セレクター管理のものを完全一致で削除
    currentPackages = currentPackages.filter(pkg => !selectorPackages.includes(pkg));
    
    // チェックされているパッケージを追加
    document.querySelectorAll('.package-selector-checkbox:checked').forEach(checkbox => {
        const pkgName = checkbox.getAttribute('data-package');
        if (pkgName) {
            currentPackages.push(pkgName);
        }
    });

    // 重複排除
    currentPackages = Array.from(new Set(currentPackages));
    
    packagesTextarea.value = currentPackages.join(' ');
    
    // パッケージとテンプレの一元反映
    refreshTemplateAndPackages();
}

// ==================== バージョン管理 ====================
async function loadVersions() {
    try {
        const response = await fetch('https://downloads.openwrt.org/.versions.json');
        const data = await response.json();

        // 公式と同じ: SNAPSHOTを最初に追加
        app.versions = ['SNAPSHOT'];
        
        // 安定版を追加
        if (data.versions_list) {
            app.versions = app.versions.concat(data.versions_list);
        }

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

async function handleVersionChange(e) {
    app.selectedVersion = e.target.value;
    app.selectedDevice = null;
    hideDeviceInfo();
    await loadDevices();
}

// ==================== デバイス管理 ====================
async function loadDevices() {
    if (!app.selectedVersion) return;

    try {
        let url;
        if (app.selectedVersion === 'SNAPSHOT') {
            url = 'https://downloads.openwrt.org/snapshots/.overview.json';
        } else {
            url = `https://downloads.openwrt.org/releases/${app.selectedVersion}/.overview.json`;
        }
        
        const response = await fetch(url);
        const data = await response.json();

        app.devices = data.profiles || [];
    } catch (error) {
        console.error('Failed to load devices:', error);
        app.devices = [];
    }
}

function handleDeviceSearch(e) {
    const query = e.target.value.toLowerCase();

    // 親要素に position: relative を付与（CSSまたはJSで）
    // ※ 既に relative なら上書きしません
    if (e.target.parentNode && getComputedStyle(e.target.parentNode).position === 'static') {
        e.target.parentNode.style.position = 'relative';
    }

    if (query.length < 2) {
        hideAutocomplete();
        return;
    }

    const matches = app.devices.filter(device => {
        const title = getDeviceTitle(device).toLowerCase();
        return title.includes(query) || device.id.toLowerCase().includes(query);
    }).slice(0, 10);

    showAutocomplete(matches);
}

function getDeviceTitle(device) {
    if (device.titles && device.titles.length > 0) {
        return device.titles[0].title || device.id;
    }
    return device.id;
}

// ここから修正後の showAutocomplete
function showAutocomplete(devices) {
    // input の親要素をアンカーにする
    const input = document.getElementById('models');
    if (!input || !input.parentNode) return;
    const wrapper = input.parentNode;

    // 親へ position: relative を保証（CSS or JS）
    if (getComputedStyle(wrapper).position === 'static') {
        wrapper.style.position = 'relative';
    }

    // 既存リストを取得 or 作成（CSS名は .autocomplete-items に統一）
    let list = document.getElementById('models-autocomplete-list');
    if (!list) {
        list = document.createElement('div');
        list.id = 'models-autocomplete-list';
        list.className = 'autocomplete-items';
        // 候補リストは input と同じ親要素にぶら下げる
        wrapper.appendChild(list); // ← this.parentNode.appendChild(list) と同義
    }

    if (!devices || devices.length === 0) {
        hideAutocomplete();
        return;
    }

    list.innerHTML = '';
    devices.forEach(device => {
        // .autocomplete-items div に対応させる
        const item = document.createElement('div');
        item.innerHTML = `<strong>${getDeviceTitle(device)}</strong><br><small>Target: ${device.target}</small>`;
        item.addEventListener('click', () => selectDevice(device));
        list.appendChild(item);
    });

    list.style.display = 'block';
}

function hideAutocomplete() {
    const list = document.getElementById('models-autocomplete-list');
    if (list) list.style.display = 'none';
}

function selectDevice(device) {
    app.selectedDevice = device;
    document.getElementById('models').value = getDeviceTitle(device);
    hideAutocomplete();
    loadDeviceProfile(device);
}

async function loadDeviceProfile(device) {
    if (!device || !device.target || !device.id) return;

    const version = app.selectedVersion;
    const target = device.target;
    const profileId = device.id;

    let profilesUrl;
    if (version === 'SNAPSHOT') {
        profilesUrl = `https://downloads.openwrt.org/snapshots/targets/${target}/profiles.json`;
    } else {
        profilesUrl = `https://downloads.openwrt.org/releases/${version}/targets/${target}/profiles.json`;
    }

    try {
        console.log(`Loading profile from: ${profilesUrl}`);
        const response = await fetch(profilesUrl, { cache: 'no-cache' });
        if (!response.ok) {
            throw new Error(`Failed to fetch profiles.json: ${response.status}`);
        }
        
const profilesData = await response.json();
        console.log(`Loaded profiles data:`, profilesData);

        // version_codeを保存（公式と同じ）
        app.versionCode = profilesData.version_code || '';

        if (profilesData.profiles && profilesData.profiles[profileId]) {
            const profile = profilesData.profiles[profileId];
            console.log(`Found profile for ${profileId}:`, profile);
            
            const defaultPackages = profilesData.default_packages || [];
            const devicePackages = profile.device_packages || [];
            const asuExtraPackages = ['luci'];
            const allPackages = defaultPackages.concat(devicePackages).concat(asuExtraPackages);
            
            console.log(`Setting packages: ${allPackages.join(' ')}`);
            document.getElementById('asu-packages').value = allPackages.join(' ');
            asuCollectPackages(); 
            
            showDeviceInfo();
        } else {
            console.error(`Profile ${profileId} not found in profiles.json`);
            showDeviceInfo();
        }
    } catch (error) {
        console.error('Failed to load device profile:', error);
        showDeviceInfo();
    }
}

function showDeviceInfo() {
    if (!app.selectedDevice) return;

    const device = app.selectedDevice;
    
    // バージョン番号の取得（ビルド番号含む）
    let fullVersion = app.selectedVersion;
    if (app.versionCode) {
        fullVersion = `${app.selectedVersion} (${app.versionCode})`;
    }
    
    // URLs生成
    const imageFolder = app.selectedVersion === 'SNAPSHOT' 
        ? `https://downloads.openwrt.org/snapshots/targets/${device.target}`
        : `https://downloads.openwrt.org/releases/${app.selectedVersion}/targets/${device.target}`;
    
    const deviceLink = `${window.location.origin}${window.location.pathname}?version=${encodeURIComponent(app.selectedVersion)}&target=${encodeURIComponent(device.target)}&id=${encodeURIComponent(device.id)}`;
    
    const infoUrl = (config.info_url || "")
        .replace("{title}", encodeURI(getDeviceTitle(device)))
        .replace("{target}", device.target)
        .replace("{id}", device.id)
        .replace("{version}", app.selectedVersion);
    
    // 公式形式のAbout this buildセクションを構築
    const infoHtml = `
        <h5>About this build</h5>
        <div class="row">
            <span class="col1">Model</span>
            <span class="col2"><strong>${getDeviceTitle(device)}</strong></span>
        </div>
        <div class="row">
            <span class="col1">Platform</span>
            <span class="col2">${device.target}</span>
        </div>
        <div class="row">
            <span class="col1">Version</span>
            <span class="col2">${fullVersion}</span>
        </div>
        ${app.buildDate ? `
        <div class="row">
            <span class="col1">Date</span>
            <span class="col2">${formatDate(app.buildDate)}</span>
        </div>
        ` : ''}
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

// ==================== 接続設定変更反映関数 ====================
function applyConnectionSettingsChange() {
    // 表示更新
    updateGuaSectionVisibility();
    // API値の適用（現在の接続種別を渡す）
    applyInitialsFromApi(document.querySelector('input[name="connectionType"]:checked')?.value || '');
    // 必要パッケージの更新
    updateRequiredPackages();
    // パッケージとテンプレの一元反映
    refreshTemplateAndPackages();
}

// ==================== 接続設定ハンドラー ====================
function handleConnectionModeChange(e) {
    const manualSection = document.getElementById('manual-connection-section');
    
    if (e.target.value === 'manual') {
        manualSection.style.display = 'block';
    } else {
        manualSection.style.display = 'none';
    }
    
    applyConnectionSettingsChange();
}

function handleConnectionTypeChange(e) {
    const pppoeSection = document.getElementById('pppoe-section');
    const dsliteSection = document.getElementById('dslite-section');
    const mapeManualSection = document.getElementById('mape-manual-section');

    pppoeSection.style.display = 'none';
    dsliteSection.style.display = 'none';
    mapeManualSection.style.display = 'none';

    if (e.target.value === 'pppoe') {
        pppoeSection.style.display = 'block';
    } else if (e.target.value === 'dslite') {
        dsliteSection.style.display = 'block';
    } else if (e.target.value === 'mape') {
        mapeManualSection.style.display = 'block';
        // map.sh 未ロード時の再ロード試行（必要時のみ）
        if (!mapShCache['new'] && !mapShCache['19']) {
            loadMapShScripts().then(() => {
                applyConnectionSettingsChange();
            });
            return;
        }
    }
    
    applyConnectionSettingsChange();
}

function handleMapeTypeChange(e) {
    applyConnectionSettingsChange();
}

function handleDsliteModeChange(e) {
    const manualConfig = document.getElementById('dslite-manual-config');
    const aftrAddressField = document.getElementById('dslite-aftr-address');
    
    if (e.target.value === 'manual') {
        manualConfig.style.display = 'block';
        applyInitialsFromApi('dslite');
    } else {
        manualConfig.style.display = 'none';
        if (window.cachedApiInfo && window.cachedApiInfo.rule && window.cachedApiInfo.rule.aftrIpv6Address) {
            aftrAddressField.value = window.cachedApiInfo.rule.aftrIpv6Address;
        }
    }
    
    applyConnectionSettingsChange();
}

// GUAセクションの表示/非表示を制御
function updateGuaSectionVisibility() {
    const guaSection = document.getElementById('mape-gua-section');
    const mapeType = document.querySelector('input[name="mapeType"]:checked')?.value;
    const connectionMode = document.querySelector('input[name="connectionMode"]:checked')?.value;
    const connectionType = document.querySelector('input[name="connectionType"]:checked')?.value;
    
    // 表示条件の判定
    let shouldShow = false;
    
    if (connectionMode === 'auto') {
        // AUTOモード：APIにGUA情報があれば表示
        if (window.cachedApiInfo && window.cachedApiInfo.ipv6) {
            shouldShow = true;
            // 値を設定
            const guaInput = document.getElementById('mape-gua-prefix');
            if (!guaInput.value) {
                const guaPrefix = calculateGuaPrefixFromApi();
                if (guaPrefix) {
                    guaInput.value = guaPrefix;
                }
            }
        }
    } else if (connectionMode === 'manual' && connectionType === 'mape') {
        // マニュアルモード + MAP-E選択時
        if (mapeType === 'auto') {
            // Auto-detectが選択されている場合：GUA情報があれば表示
            if (window.cachedApiInfo && window.cachedApiInfo.ipv6) {
                shouldShow = true;
                const guaInput = document.getElementById('mape-gua-prefix');
                if (!guaInput.value) {
                    const guaPrefix = calculateGuaPrefixFromApi();
                    if (guaPrefix) {
                        guaInput.value = guaPrefix;
                    }
                }
            }
        } else if (mapeType === 'gua') {
            // GUAモードが明示的に選択されている場合：常に表示
            shouldShow = true;
            // APIからの値があれば設定（なければ空欄のまま）
            if (window.cachedApiInfo && window.cachedApiInfo.ipv6) {
                const guaInput = document.getElementById('mape-gua-prefix');
                if (!guaInput.value) {
                    const guaPrefix = calculateGuaPrefixFromApi();
                    if (guaPrefix) {
                        guaInput.value = guaPrefix;
                    }
                }
            }
        } else if (mapeType === 'pd') {
            // PDモード：非表示
            shouldShow = false;
        }
    }
    
    // 表示/非表示を適用
    if (guaSection) {
        guaSection.style.display = shouldShow ? 'block' : 'none';
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

    if (apiInfo.isp) details += `ISP: ${apiInfo.isp}\n`;
    if (apiInfo.country) {
        details += `Country/Region: ${apiInfo.country}`;
        if (apiInfo.regionName) details += ` (${apiInfo.regionName})`;
        details += '\n';
    }
    if (apiInfo.timezone) details += `Timezone: ${apiInfo.timezone}\n`;

    if (apiInfo.rule) {
        if (apiInfo.rule.aftrType) {
            statusText += ' - DS-Lite support detected';
            details += `\n[DS-Lite Configuration]\n`;
            details += `aftrType: ${apiInfo.rule.aftrType}\n`;
            if (apiInfo.rule.aftrIpv6Address) {
                details += `aftrIpv6Address: ${apiInfo.rule.aftrIpv6Address}\n`;
            }
        } else if (apiInfo.rule.brIpv6Address) {
            statusText += ' - MAP-E support detected';
            details += `\n[MAP-E Configuration]\n`;
            details += `brIpv6Address: ${apiInfo.rule.brIpv6Address}\n`;
            details += `eaBitLength: ${apiInfo.rule.eaBitLength}\n`;
            details += `ipv4Prefix: ${apiInfo.rule.ipv4Prefix}\n`;
            details += `ipv4PrefixLength: ${apiInfo.rule.ipv4PrefixLength}\n`;
            details += `ipv6Prefix: ${apiInfo.rule.ipv6Prefix}\n`;
            details += `ipv6PrefixLength: ${apiInfo.rule.ipv6PrefixLength}\n`;
            details += `psIdOffset: ${apiInfo.rule.psIdOffset}\n`;
            details += `psidlen: ${apiInfo.rule.psidlen}\n`;
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
        console.log('Starting fetchApiInfoAndUpdate...');

        const apiInfo = await fetchApiInfo();
        console.log('fetchApiInfo returned:', apiInfo);

        window.cachedApiInfo = apiInfo;

        if (apiInfo) {
            // Country と Timezone（空欄のみ設定）
            setIfEmpty('aios-country', apiInfo.country);
            setIfEmpty('aios-zonename', apiInfo.timezone);

            // ISP表示は共通関数で構築
            const isp = buildIspStatus(apiInfo);
            updateIspDisplay(isp.status, isp.details);

            // GUA セクションの表示を更新
            updateGuaSectionVisibility();

            // ウィザードのON/OFFに関係なく、空欄には初期値を注入（上書きはしない）
            // MAP-E情報
            if (apiInfo.rule && apiInfo.rule.brIpv6Address) {
                setIfEmpty('mape-br', apiInfo.rule.brIpv6Address);
                setIfEmpty('mape-ealen', apiInfo.rule.eaBitLength || '');
                setIfEmpty('mape-ipv4-prefix', apiInfo.rule.ipv4Prefix || '');
                setIfEmpty('mape-ipv4-prefixlen', apiInfo.rule.ipv4PrefixLength || '');
                setIfEmpty('mape-ipv6-prefix', apiInfo.rule.ipv6Prefix || '');
                setIfEmpty('mape-ipv6-prefixlen', apiInfo.rule.ipv6PrefixLength || '');
                setIfEmpty('mape-psid-offset', apiInfo.rule.psIdOffset || '');
                setIfEmpty('mape-psidlen', apiInfo.rule.psidlen || '');
            }
            
            // DS-Lite情報
            if (apiInfo.rule && apiInfo.rule.aftrType) {
                document.getElementById('dslite-aftr-type').value = apiInfo.rule.aftrType;
                if (apiInfo.rule.aftrIpv6Address && !document.getElementById('dslite-aftr-address').value) {
                    document.getElementById('dslite-aftr-address').value = apiInfo.rule.aftrIpv6Address;
                }
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
    try {
        console.log('Fetching API info from auto-config.site-u.workers.dev...');
        
        const response = await fetch('https://auto-config.site-u.workers.dev/', {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        console.log('API response status:', response.status);
        
        if (!response.ok) {
            console.warn('API access failed with status:', response.status);
            return null;
        }
        
        const data = await response.json();
        console.log('API Info fetched successfully:', data);
        
        return data;
    } catch (error) {
        console.error('Failed to fetch API info:', error);
        return null;
    }
}

// ==================== テンプレ文字列の変数設定共通関数 ====================
function setScriptVar(content, key, value, active) {
    const safe = (v) => (v === undefined || v === null) ? '' : String(v).trim();
    const val = safe(value);
    const re = new RegExp(`^#?\\s*${key}=".*"$`, 'm');
    const line = active ? `${key}="${val}"` : `# ${key}="${val}"`;
    return content.replace(re, line);
}

// ==================== テンプレート設定 ====================
async function updateConfiguredTemplate() {
    try {
        let content = document.getElementById('uci-defaults-content').value;

        if (!content || content.trim() === '' || content.includes('Failed to load setup.sh template')) {
            content = SETUP_SH_TEMPLATE;
            app.templateLoaded = true;
        }

        const config = getAiosConfig();

        let apiInfo = window.cachedApiInfo;
        if (!apiInfo) {
            apiInfo = await fetchApiInfo();
            window.cachedApiInfo = apiInfo;
        }

        // 選択済みパッケージ（enable_* 反映用）
        const selectedPackages = new Set(split(document.getElementById('asu-packages').value));

        const customized = customizeSetupScript(content, aiosConfig, apiInfo, selectedPackages);
        document.getElementById('uci-defaults-content').value = customized;
    } catch (error) {
        console.error('Template update error:', error);
    }
}

function customizeSetupScript(content, config, apiInfo, selectedPackages) {
    let customized = content;

    // OpenWrt version flags
    if (app.selectedVersion && app.selectedVersion.startsWith('19')) {
        customized = customized.replace(/^# openwrt_19=""/m, `openwrt_19="1"`);
        customized = customized.replace(/^# openwrt_21=""/m, `# openwrt_21=""`);
    } else {
        customized = customized.replace(/^# openwrt_19=""/m, `# openwrt_19=""`);
        customized = customized.replace(/^# openwrt_21=""/m, `openwrt_21="1"`);
    }

    // Basic settings
    const samePw = (config.rootPassword === config.confirmPassword) ? config.rootPassword : '';
    customized = setScriptVar(customized, 'device_name', config.deviceName, !!config.deviceName);
    customized = setScriptVar(customized, 'lan_ip_address', config.lanIp, !!config.lanIp);
    customized = setScriptVar(customized, 'root_password', samePw, !!samePw);
    customized = setScriptVar(customized, 'language', config.language, !!config.language);
    customized = setScriptVar(customized, 'country', config.country, !!config.country);
    customized = setScriptVar(customized, 'timezone', config.timezone, !!config.timezone);
    customized = setScriptVar(customized, 'zonename', config.zonename, !!config.zonename);

    // Wi-Fi
    const wifiActive = !!(config.wifiSSID && config.wifiPassword && String(config.wifiPassword).length >= 8);
    customized = setScriptVar(customized, 'wlan_name', config.wifiSSID, wifiActive);
    customized = setScriptVar(customized, 'wlan_password', config.wifiPassword, wifiActive);

    // APIベースの推奨値
    const api = apiInfo?.rule || {};
    const apiHasDslite = !!api.aftrIpv6Address;
    const apiHasMape = !!api.brIpv6Address;

    // DS-Lite 候補値（未使用の dsliteVal は削除）
    // MAP-E 候補値
    const mapeVals = {
        br: config.mapeBr || (apiHasMape ? api.brIpv6Address : ''),
        ealen: config.mapeEalen || (apiHasMape ? api.eaBitLength : ''),
        v4p: config.mapeIpv4Prefix || (apiHasMape ? api.ipv4Prefix : ''),
        v4l: config.mapeIpv4Prefixlen || (apiHasMape ? api.ipv4PrefixLength : ''),
        v6p: config.mapeIpv6Prefix || (apiHasMape ? api.ipv6Prefix : ''),
        v6l: config.mapeIpv6Prefixlen || (apiHasMape ? api.ipv6PrefixLength : ''),
        off: config.mapePsidOffset || (apiHasMape ? api.psIdOffset : ''),
        psid: config.mapePsidlen || (apiHasMape ? api.psidlen : '')
    };

    // GUAプレフィックス
    const guaPrefix = config.mapeGuaPrefix || calculateGuaPrefixFromApi() || '';

    // 選択プロトコル
    const manual = (config.connectionMode === 'manual');
    let activeProto = '';

    if (manual) {
        activeProto = config.connectionType;
    } else {
        if (apiHasDslite) activeProto = 'dslite';
        else if (apiHasMape) activeProto = 'mape';
        else activeProto = 'dhcp';
    }

    // PPPoE
    const pppoeActive = (activeProto === 'pppoe');
    customized = setScriptVar(customized, 'pppoe_username', config.pppoeUsername || '', pppoeActive);
    customized = setScriptVar(customized, 'pppoe_password', config.pppoePassword || '', pppoeActive);

    // DS-Lite
    let dsliteAddress = '';
    if (config.dsliteMode === 'auto') {
        dsliteAddress = (apiInfo?.rule?.aftrIpv6Address) || config.dsliteAftrAddress || '';
    } else {
        dsliteAddress = config.dsliteAftrAddress || '';
    }
    const dsliteActive = (activeProto === 'dslite') && !!dsliteAddress;
    customized = setScriptVar(customized, 'dslite_aftr_address', dsliteAddress, dsliteActive);

    // MAP-E
    const mapeActive = (activeProto === 'mape');
    customized = setScriptVar(customized, 'mape_br', mapeVals.br || '', mapeActive);
    customized = setScriptVar(customized, 'mape_ealen', mapeVals.ealen || '', mapeActive);
    customized = setScriptVar(customized, 'mape_ipv4_prefix', mapeVals.v4p || '', mapeActive);
    customized = setScriptVar(customized, 'mape_ipv4_prefixlen', mapeVals.v4l || '', mapeActive);
    customized = setScriptVar(customized, 'mape_ipv6_prefix', mapeVals.v6p || '', mapeActive);
    customized = setScriptVar(customized, 'mape_ipv6_prefixlen', mapeVals.v6l || '', mapeActive);
    customized = setScriptVar(customized, 'mape_psid_offset', mapeVals.off || '', mapeActive);
    customized = setScriptVar(customized, 'mape_psidlen', mapeVals.psid || '', mapeActive);

    // MAP-E GUA
    const guaActive = mapeActive && (config.mapeType === 'gua' || config.mapeType === 'auto');
    customized = setScriptVar(customized, 'mape_gua_mode', guaActive ? '1' : '', guaActive);
    customized = setScriptVar(customized, 'mape_gua_prefix', guaActive ? guaPrefix : '', guaActive);

    // enable_* フラグ（パッケージ選択に応じて汎用的に有効化）
    if (selectedPackages) {
        // PACKAGE_DB から enableVar マップを構築
        const enableMap = {};
        PACKAGE_DB.categories.forEach(cat => {
            (cat.packages || []).forEach(pkg => {
                if (pkg.enableVar) {
                    enableMap[pkg.name] = pkg.enableVar;
                }
            });
        });
        // 選択されているパッケージに対応する enableVar をON
        selectedPackages.forEach(pkgName => {
            const varName = enableMap[pkgName];
            if (varName) {
                customized = setScriptVar(customized, varName, '1', true);
            }
        });
    }

    // MAP-E選択時のみmap.shを埋め込む
    if (mapeActive) {
        customized = loadMapShContentSync(customized, app.selectedVersion);
    }
    
    return customized;
}

function toggleAiosConfig(e) {
    const configSection = document.getElementById('aios-config');
    if (e.target.checked) {
        configSection.style.display = 'block';
        updateConfiguredTemplate();
    } else {
        configSection.style.display = 'none';
        document.getElementById('uci-defaults-content').value = SETUP_SH_TEMPLATE;
        app.templateLoaded = true;
    }
}

function getAiosConfig() {
    const parseOrEmpty = (id, type = 'string') => {
        const val = document.getElementById(id)?.value?.trim();
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
        lanIp: parseOrEmpty('aios-lan-ip'),
        rootPassword: parseOrEmpty('aios-root-password'),
        confirmPassword: parseOrEmpty('aios-confirm-password'),
        wifiSSID: parseOrEmpty('aios-wifi-ssid'),
        wifiPassword: parseOrEmpty('aios-wifi-password'),

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
        mapeGuaPrefix: parseOrEmpty('mape-gua-prefix')
    };

    return config;
}

function applyInitialsFromApi(type) {
    if (type === 'dslite') {
        const aftrInput = document.getElementById('dslite-aftr-address');
        const dsliteMode = document.querySelector('input[name="dsliteMode"]:checked')?.value || 'auto';
        
        if (dsliteMode === 'auto') {
            // API検出値を使用
            if (window.cachedApiInfo && window.cachedApiInfo.rule && window.cachedApiInfo.rule.aftrIpv6Address) {
                if (aftrInput) {
                    aftrInput.value = window.cachedApiInfo.rule.aftrIpv6Address;
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
                    east: '2001:e30:1c1e:1::1',
                    west: '2001:e30:1c1f:1::1'
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
        const s = (window.cachedApiInfo && window.cachedApiInfo.rule) ? window.cachedApiInfo.rule : null;

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

// ==================== 共通反映関数 ====================
function refreshTemplateAndPackages() {
    // i18n 整理
    asuCollectPackages();

    // aios-config 有効時のみテンプレ更新
    if (document.getElementById('use-aios-config').checked) {
        updateConfiguredTemplate().catch(console.error);
    }
}

// ==================== パッケージ管理 ====================
function split(str) {
    return str.match(/[^\s,]+/g) || [];
}

function updateRequiredPackages() {
  const config = getAiosConfig();
  const packagesTextarea = document.getElementById('asu-packages');
  let currentPackages = split(packagesTextarea.value);

  // 自動追加対象を制限（map, ds-lite のみ）
  currentPackages = currentPackages.filter(pkg =>
    pkg !== 'map' &&
    pkg !== 'ds-lite'
  );
    
  // 接続方式に応じたパッケージの追加
  if (config.connectionMode === 'auto') {
      if (window.cachedApiInfo && window.cachedApiInfo.rule) {
          if (window.cachedApiInfo.rule.aftrType) {
              if (!currentPackages.includes('ds-lite')) {
                  currentPackages.push('ds-lite');
              }
          } else if (window.cachedApiInfo.rule.brIpv6Address) {
              if (!currentPackages.includes('map')) {
                  currentPackages.push('map');
              }
          }
      }
  } else {
      switch(config.connectionType) {
          case 'mape':
              if (!currentPackages.includes('map')) {
                  currentPackages.push('map');
              }
              break;
          case 'dslite':
              if (!currentPackages.includes('ds-lite')) {
                  currentPackages.push('ds-lite');
              }
              break;
      }
  }

  // 最終重複排除（手入力重複などにも強くする）
  currentPackages = Array.from(new Set(currentPackages));
    
  packagesTextarea.value = currentPackages.join(' ');
}

// ==================== ビルド処理 ====================
async function buildAsuRequest() {
    if (!app.selectedDevice) {
        alert('Please select a device first');
        return;
    }

    try {
        document.getElementById('request-build').disabled = true;
        showProgress('Sending build request...', 10);

        const packages = split(document.getElementById('asu-packages').value);
        const script = document.getElementById('uci-defaults-content').value;

        const requestBody = {
            target: app.selectedDevice.target,
            profile: app.selectedDevice.id,
            packages: packages,
            version: app.selectedVersion
        };

        if (script && script.trim()) {
            requestBody.defaults = script;
        }

        const response = await fetch('https://sysupgrade.openwrt.org/api/v1/build', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const responseText = await response.text();

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${responseText}`);
        }

        let result;
        try {
            result = JSON.parse(responseText);
        } catch (e) {
            throw new Error('Invalid JSON response: ' + responseText);
        }

        if (result.request_hash) {
            await pollBuildStatus(result.request_hash);
        } else if (result.images && result.images.length > 0) {
            hideProgress();
            showDownloadLinks(result.images);
        } else {
            throw new Error('No request hash or images in response');
        }

    } catch (error) {
        console.error('Build request failed:', error);
        alert('Build failed: ' + error.message);
        hideProgress();
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
                throw new Error(`Build failed: ${status.detail || status.stdout || 'Unknown error'}`);
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
