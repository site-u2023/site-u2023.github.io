// 追加用.js
// Package Search Component - add to advanced.js

(function() {
    'use strict';

    // 既存の init 関数を保存
    const originalInit = window.init;

    // 新しい init 関数で既存の init をラップ
    window.init = async function() {
        if (originalInit) {
            await originalInit();
        }
        await initCustomFeatures();
    };

    // カスタム機能用の状態
    let customApp = {
        apiInfo: null,
        mapSh: { 'new': null, '19': null },
        templateLoaded: false,
        packageDB: null
    };
  
class PackageSearcher {
  constructor() {
    this.packages = new Map();
    this.packagesByName = new Map();
    this.currentTarget = null;
    this.currentVersion = null;
    this.isLoading = false;
  }

  // デバイスが確定された時に呼び出される
  async loadPackagesForDevice(version, target) {
    if (this.currentVersion === version && this.currentTarget === target) {
      return; // 既に読み込み済み
    }

    this.isLoading = true;
    this.currentVersion = version;
    this.currentTarget = target;

    try {
      // Method 1: Packages.gz を使用（推奨）
      await this.loadFromPackagesGz(version, target);
    } catch (error) {
      console.warn('Packages.gz failed, trying directory index:', error);
      try {
        // Method 2: ディレクトリインデックスをフォールバック
        await this.loadFromDirectoryIndex(version, target);
      } catch (fallbackError) {
        console.error('Both methods failed:', fallbackError);
        throw fallbackError;
      }
    } finally {
      this.isLoading = false;
    }
  }

  // Method 1: Packages.gz から読み込み
  async loadFromPackagesGz(version, target) {
    const packagesUrl = `${config.image_urls[version]}/targets/${target}/packages/Packages.gz`;
    
    const response = await fetch(packagesUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch Packages.gz: ${response.status}`);
    }

    const compressedData = await response.arrayBuffer();
    
    // pako.js や fflate.js などのライブラリが必要
    // ここでは仮にdecompressという関数があると仮定
    let packagesText;
    try {
      packagesText = await this.decompressGzip(compressedData);
    } catch (error) {
      throw new Error('Failed to decompress Packages.gz');
    }

    this.parsePackagesText(packagesText);
  }

  // Method 2: ディレクトリインデックスから読み込み（フォールバック）
  async loadFromDirectoryIndex(version, target) {
    const packagesUrl = `${config.image_urls[version]}/targets/${target}/packages/`;
    
    const response = await fetch(packagesUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch directory index: ${response.status}`);
    }

    const html = await response.text();
    const packageNames = this.parseDirectoryIndex(html);
    
    // パッケージ名のリストから簡易的なパッケージ情報を作成
    this.createPackagesFromNames(packageNames);
  }

  // Packages.gzの内容をパース
  parsePackagesText(packagesText) {
    this.packages.clear();
    this.packagesByName.clear();

    const packageBlocks = packagesText.split('\n\n').filter(block => block.trim());
    
    for (const block of packageBlocks) {
      const pkg = this.parsePackageBlock(block);
      if (pkg && pkg.Package) {
        this.packages.set(pkg.Package, pkg);
        this.packagesByName.set(pkg.Package, pkg);
      }
    }
  }

  // 個別のパッケージブロックをパース
  parsePackageBlock(block) {
    const pkg = {};
    const lines = block.split('\n');
    
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        pkg[key] = value;
      }
    }
    
    // 依存関係をパース
    if (pkg.Depends) {
      pkg.Dependencies = pkg.Depends.split(',').map(dep => dep.trim().split(/\s/)[0]);
    } else {
      pkg.Dependencies = [];
    }
    
    return pkg;
  }

  // ディレクトリインデックスからパッケージ名を抽出
  parseDirectoryIndex(html) {
    const packages = [];
    const linkRegex = /<a href="([^"]+\.ipk)">/gi;
    let match;
    
    while ((match = linkRegex.exec(html)) !== null) {
      const filename = match[1];
      const packageName = filename.replace(/_.*\.ipk$/, '');
      packages.push(packageName);
    }
    
    return packages;
  }

  // パッケージ名から簡易的なパッケージ情報を作成
  createPackagesFromNames(packageNames) {
    this.packages.clear();
    this.packagesByName.clear();

    for (const name of packageNames) {
      const pkg = {
        Package: name,
        Dependencies: [], // 依存関係は不明
        Description: '', // 説明は不明
        Section: 'unknown' // セクションは不明
      };
      this.packages.set(name, pkg);
      this.packagesByName.set(name, pkg);
    }
  }

  // gzip解凍（ライブラリが必要）
  async decompressGzip(compressedData) {
    // 実装例：pako.jsを使用する場合
    // return pako.inflate(new Uint8Array(compressedData), { to: 'string' });
    
    // ここではブラウザのDecompressionStream APIを使用（モダンブラウザ対応）
    if ('DecompressionStream' in window) {
      const stream = new DecompressionStream('gzip');
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();
      
      writer.write(new Uint8Array(compressedData));
      writer.close();
      
      const chunks = [];
      let done = false;
      
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) chunks.push(value);
      }
      
      const decompressed = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        decompressed.set(chunk, offset);
        offset += chunk.length;
      }
      
      return new TextDecoder().decode(decompressed);
    } else {
      throw new Error('Gzip decompression not supported');
    }
  }

  // パッケージ検索
  searchPackages(query) {
    if (!query) return Array.from(this.packages.values());
    
    const searchTerms = query.toLowerCase().split(/\s+/);
    const results = [];
    
    for (const pkg of this.packages.values()) {
      const searchText = [
        pkg.Package || '',
        pkg.Description || '',
        pkg.Section || ''
      ].join(' ').toLowerCase();
      
      const matches = searchTerms.every(term => searchText.includes(term));
      if (matches) {
        results.push(pkg);
      }
    }
    
    return results;
  }

  // カテゴリ別にパッケージを取得
  getPackagesByCategory() {
    const categories = new Map();
    
    for (const pkg of this.packages.values()) {
      const category = pkg.Section || 'unknown';
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category).push(pkg);
    }
    
    return categories;
  }

  // パッケージの詳細を取得
  getPackageInfo(packageName) {
    return this.packages.get(packageName);
  }

  // 依存関係を解決
  resolveDependencies(packageNames) {
    const resolved = new Set();
    const stack = [...packageNames];
    
    while (stack.length > 0) {
      const pkgName = stack.pop();
      if (resolved.has(pkgName)) continue;
      
      resolved.add(pkgName);
      
      const pkg = this.packages.get(pkgName);
      if (pkg && pkg.Dependencies) {
        for (const dep of pkg.Dependencies) {
          if (!resolved.has(dep)) {
            stack.push(dep);
          }
        }
      }
    }
    
    return resolved;
  }

  // 現在の状態を取得
  getStatus() {
    return {
      isLoading: this.isLoading,
      currentTarget: this.currentTarget,
      currentVersion: this.currentVersion,
      packageCount: this.packages.size
    };
  }
}

// グローバルインスタンス
const packageSearcher = new PackageSearcher();


    // グローバル変数
    let app = {
        versions: [],
        devices: [],
        selectedDevice: null,
        selectedVersion: '',
        versionCode: '',
        templateLoaded: false,
        apiInfo: null,
        packageDB: null,
        mapSh: { 'new': null, '19': null }
    };

    // map.shキャッシュ
    const MAP_NEW_URL = 'https://site-u.pages.dev/build/scripts/map.sh.new';
    const MAP_19_URL = 'https://site-u.pages.dev/build/scripts/map.sh.19';

    // SETUP_SHテンプレート（index3.htmlから）
    const SETUP_SH_TEMPLATE = `#!/bin/sh
# ... テンプレート内容 ...`;

    // パッケージDB
    const PACKAGE_DB = {
        categories: [/* index3.htmlのPACKAGE_DBと同じ内容 */]
    };

    // 初期化関数
    async function initCustomFeatures() {
        console.log('Initializing custom features...');
        
        // DOM準備を待つ
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setup);
        } else {
            await setup();
        }
    }

    async function setup() {
        try {
            // イベントバインディング
            bindCustomEvents();
            
            // map.shプリロード
            await preloadMapScripts();
            
            // パッケージセレクター生成
            generatePackageSelector();
            
            // ISP情報取得
            await fetchIspInfo();
            
            // 初期テンプレート設定
            initializeTemplate();
            
            console.log('Custom features initialized successfully');
        } catch (error) {
            console.error('Failed to initialize custom features:', error);
        }
    }

    function bindCustomEvents() {
        // パッケージセレクター
        const pkgSelector = document.getElementById('use-package-selector');
        if (pkgSelector) {
            pkgSelector.addEventListener('change', togglePackageSelector);
        }

        // AIOS設定
        const aiosConfig = document.getElementById('use-aios-config');
        if (aiosConfig) {
            aiosConfig.addEventListener('change', toggleAiosConfig);
        }

        // 言語変更
        const langSelect = document.getElementById('aios-language');
        if (langSelect) {
            langSelect.addEventListener('change', refreshTemplateAndPackages);
        }

        // 接続設定
        document.querySelectorAll('input[name="connectionMode"]').forEach(radio => {
            radio.addEventListener('change', handleConnectionModeChange);
        });

        document.querySelectorAll('input[name="connectionType"]').forEach(radio => {
            radio.addEventListener('change', handleConnectionTypeChange);
        });

        document.querySelectorAll('input[name="mapeType"]').forEach(radio => {
            radio.addEventListener('change', handleMapeTypeChange);
        });

        document.querySelectorAll('input[name="dsliteMode"]').forEach(radio => {
            radio.addEventListener('change', handleDsliteModeChange);
        });

        // 既存のbuildAsuRequest関数をオーバーライド
        window.buildAsuRequest = customBuildAsuRequest;
    }

    function togglePackageSelector(e) {
        const configSection = document.getElementById('package-selector-config');
        if (configSection) {
            configSection.style.display = e.target.checked ? 'block' : 'none';
        }
    }

    function toggleAiosConfig(e) {
        const configSection = document.getElementById('aios-config');
        if (configSection) {
            if (e.target.checked) {
                configSection.style.display = 'block';
                updateConfiguredTemplate();
            } else {
                configSection.style.display = 'none';
                resetTemplate();
            }
        }
    }

    // パッケージセレクター生成（index3.htmlから移植）
    function generatePackageSelector() {
        const container = document.getElementById('package-categories');
        if (!container) return;

        container.innerHTML = '';

        PACKAGE_DB.categories.forEach(category => {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'package-category';

            const categoryTitle = document.createElement('h6');
            categoryTitle.textContent = category.name;
            categoryDiv.appendChild(categoryTitle);

            const packageGrid = document.createElement('div');
            packageGrid.className = 'package-grid';

            category.packages.forEach(pkg => {
                if (pkg.hidden) return;

                const packageItem = document.createElement('div');
                packageItem.className = 'package-item';

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

                if (pkg.url) {
                    const link = document.createElement('a');
                    link.href = pkg.url;
                    link.target = '_blank';
                    link.className = 'package-link';
                    link.textContent = pkg.name;
                    label.appendChild(link);
                } else {
                    label.textContent = pkg.name;
                }

                formCheck.appendChild(checkbox);
                formCheck.appendChild(label);
                packageItem.appendChild(formCheck);
                packageGrid.appendChild(packageItem);

                // 依存パッケージ表示
                if (pkg.dependencies) {
                    pkg.dependencies.forEach(depId => {
                        const depPkg = findPackageById(depId);
                        if (depPkg && !depPkg.hidden) {
                            const depItem = createDependencyItem(depPkg);
                            packageGrid.appendChild(depItem);
                        }
                    });
                }
            });

            categoryDiv.appendChild(packageGrid);
            
            if (category.description) {
                const description = document.createElement('div');
                description.className = 'package-description';
                description.textContent = category.description;
                categoryDiv.appendChild(description);
            }

            container.appendChild(categoryDiv);
        });
    }

    function findPackageById(id) {
        for (const cat of PACKAGE_DB.categories) {
            const pkg = cat.packages.find(p => p.id === id);
            if (pkg) return pkg;
        }
        return null;
    }

    function createDependencyItem(pkg) {
        const depItem = document.createElement('div');
        depItem.className = 'package-item package-dependent';

        const formCheck = document.createElement('div');
        formCheck.className = 'form-check';

        const checkbox = document.createElement('input');
        checkbox.className = 'form-check-input package-selector-checkbox';
        checkbox.type = 'checkbox';
        checkbox.id = `pkg-${pkg.id}`;
        checkbox.setAttribute('data-package', pkg.name);
        checkbox.addEventListener('change', handlePackageSelection);

        const label = document.createElement('label');
        label.className = 'form-check-label';
        label.setAttribute('for', `pkg-${pkg.id}`);

        if (pkg.url) {
            const link = document.createElement('a');
            link.href = pkg.url;
            link.target = '_blank';
            link.className = 'package-link';
            link.textContent = '↳ ' + pkg.name;
            label.appendChild(link);
        } else {
            label.textContent = '↳ ' + pkg.name;
        }

        formCheck.appendChild(checkbox);
        formCheck.appendChild(label);
        depItem.appendChild(formCheck);

        return depItem;
    }

    function handlePackageSelection(e) {
        const pkg = e.target;
        const packageName = pkg.getAttribute('data-package');
        const isChecked = pkg.checked;
        const dependencies = pkg.getAttribute('data-dependencies');

        // 依存パッケージの同期
        if (dependencies) {
            dependencies.split(',').forEach(dep => {
                const depCheckbox = document.querySelector(`[data-package="${dep}"]`);
                if (depCheckbox) {
                    depCheckbox.checked = isChecked;
                }
            });
        }

        updatePackageListFromSelector();
    }

    function updatePackageListFromSelector() {
        const packagesTextarea = document.getElementById('asu-packages');
        if (!packagesTextarea) return;

        let currentPackages = split(packagesTextarea.value);
        
        // セレクター管理のパッケージ
        const selectorPackages = [];
        document.querySelectorAll('.package-selector-checkbox').forEach(checkbox => {
            const pkgName = checkbox.getAttribute('data-package');
            if (pkgName) {
                selectorPackages.push(pkgName);
            }
        });
        
        // 既存のパッケージからセレクター管理のものを削除
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
        
        refreshTemplateAndPackages();
    }

    // i18nパッケージ管理（index3.htmlから移植）
    function normalizeLang(lang) {
        const map = {
            en: '',
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
            // 他のi18nパッケージも同様に追加
        };
    }

    function asuCollectPackages() {
        const lang = document.getElementById('aios-language')?.value?.trim() || 'en';
        const norm = normalizeLang(lang);
        const db = asuI18nDB(lang);
        const textarea = document.getElementById('asu-packages');
        if (!textarea) return;

        let current = split(textarea.value);

        // i18n整理（英語なら全削除、非英語は現在言語以外を削除）
        current = current.filter(pkg => {
            if (!pkg.startsWith('luci-i18n-')) return true;
            if (!norm) return false;
            const m = pkg.match(/^luci-i18n-(.+?)-([A-Za-z]{2}(?:-[A-Za-z]{2})?)$/);
            const suffix = (m && m[2]) ? m[2].toLowerCase() : '';
            return suffix === norm;
        });

        // ベースパッケージ集合
        const baseSet = new Set();

        // セレクター選択から
        document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
            const names = cb.getAttribute('data-package')?.split(/\s+/) || [];
            names.forEach(n => baseSet.add(n));
        });

        // 手動入力から
        current.forEach(pkg => {
            if (!pkg.startsWith('luci-i18n-')) baseSet.add(pkg);
        });

        // i18n追加
        const i18nAdd = [];
        if (norm) {
            ['base', 'opkg', 'firewall'].forEach(k => (db[k] || []).forEach(x => i18nAdd.push(x)));
            
            // 各パッケージのi18n
            baseSet.forEach(pkg => {
                const key = pkg.replace(/^luci-app-/, '');
                if (db[key]) {
                    (db[key] || []).forEach(x => i18nAdd.push(x));
                }
            });
        }

        // 最終リスト構築
        const result = Array.from(new Set([...baseSet, ...i18nAdd]));
        textarea.value = result.join(' ');
    }

    // ISP情報取得（index3.htmlから移植）
    async function fetchIspInfo() {
        try {
            updateIspDisplay('Fetching', 'Retrieving ISP information...');
            
            const response = await fetch('https://auto-config.site-u.workers.dev/', {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            
            if (response.ok) {
                const data = await response.json();
                app.apiInfo = data;
                
                // 表示更新
                const isp = buildIspStatus(data);
                updateIspDisplay(isp.status, isp.details);
                
                // 空欄に初期値設定
                applyApiDefaults(data);
                
                // GUAセクション更新
                updateGuaSectionVisibility();
            } else {
                updateIspDisplay('Auto-detection failed', 'API connection error or unsupported ISP\nManual configuration required.');
            }
        } catch (error) {
            console.error('ISP info fetch error:', error);
            updateIspDisplay('Fetch error', 'API connection failed.');
        }
    }

    function updateIspDisplay(status, details) {
        const statusMessage = document.getElementById('isp-status-message');
        const technicalInfo = document.getElementById('isp-technical-info');

        if (statusMessage) statusMessage.textContent = status;
        if (technicalInfo) {
            if (details) {
                technicalInfo.innerHTML = details;
                technicalInfo.style.display = 'block';
            } else {
                technicalInfo.style.display = 'none';
            }
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
                // 他のMAP-Eパラメータも同様
            }
        }

        const formatted = details
            .split('\n')
            .map(line => `<div>${line}</div>`)
            .join('');

        return { status: statusText, details: formatted };
    }

    function applyApiDefaults(apiInfo) {
        if (!apiInfo) return;

        // Country と Timezone
        setIfEmpty('aios-country', apiInfo.country);
        setIfEmpty('aios-zonename', apiInfo.timezone);

        // MAP-E情報
        if (apiInfo.rule && apiInfo.rule.brIpv6Address) {
            setIfEmpty('mape-br', apiInfo.rule.brIpv6Address);
            setIfEmpty('mape-ealen', apiInfo.rule.eaBitLength);
            // 他のパラメータも同様
        }

        // DS-Lite情報
        if (apiInfo.rule && apiInfo.rule.aftrType) {
            const aftrType = document.getElementById('dslite-aftr-type');
            if (aftrType) aftrType.value = apiInfo.rule.aftrType;
            setIfEmpty('dslite-aftr-address', apiInfo.rule.aftrIpv6Address);
        }
    }

    function setIfEmpty(id, value) {
        const el = document.getElementById(id);
        if (el && !el.value && value != null && value !== '') {
            el.value = value;
        }
    }

    // 接続設定ハンドラー
    function handleConnectionModeChange(e) {
        const manualSection = document.getElementById('manual-connection-section');
        if (manualSection) {
            manualSection.style.display = e.target.value === 'manual' ? 'block' : 'none';
        }
        applyConnectionSettingsChange();
    }

    function handleConnectionTypeChange(e) {
        const sections = {
            'pppoe': document.getElementById('pppoe-section'),
            'dslite': document.getElementById('dslite-section'),
            'mape': document.getElementById('mape-manual-section')
        };

        // 全セクション非表示
        Object.values(sections).forEach(section => {
            if (section) section.style.display = 'none';
        });

        // 選択されたセクションを表示
        const selected = sections[e.target.value];
        if (selected) selected.style.display = 'block';

        applyConnectionSettingsChange();
    }

    function handleMapeTypeChange(e) {
        updateGuaSectionVisibility();
        applyConnectionSettingsChange();
    }

    function handleDsliteModeChange(e) {
        const manualConfig = document.getElementById('dslite-manual-config');
        if (manualConfig) {
            manualConfig.style.display = e.target.value === 'manual' ? 'block' : 'none';
        }
        applyConnectionSettingsChange();
    }

    function updateGuaSectionVisibility() {
        const guaSection = document.getElementById('mape-gua-section');
        if (!guaSection) return;

        const mapeType = document.querySelector('input[name="mapeType"]:checked')?.value;
        const connectionMode = document.querySelector('input[name="connectionMode"]:checked')?.value;
        const connectionType = document.querySelector('input[name="connectionType"]:checked')?.value;

        let shouldShow = false;

        if (connectionMode === 'auto' && app.apiInfo?.ipv6) {
            shouldShow = true;
        } else if (connectionMode === 'manual' && connectionType === 'mape') {
            if (mapeType === 'auto' && app.apiInfo?.ipv6) {
                shouldShow = true;
            } else if (mapeType === 'gua') {
                shouldShow = true;
            }
        }

        guaSection.style.display = shouldShow ? 'block' : 'none';

        // GUAプレフィックス設定
        if (shouldShow && app.apiInfo?.ipv6) {
            const guaInput = document.getElementById('mape-gua-prefix');
            if (guaInput && !guaInput.value) {
                const guaPrefix = calculateGuaPrefixFromApi();
                if (guaPrefix) {
                    guaInput.value = guaPrefix;
                }
            }
        }
    }

    function calculateGuaPrefixFromApi() {
        const ipv6 = app.apiInfo?.ipv6;
        if (!ipv6) return '';
        const segments = ipv6.split(':');
        if (segments.length >= 4) {
            const prefix = segments.slice(0, 4).join(':');
            return `${prefix}::/64`;
        }
        return '';
    }

    function applyConnectionSettingsChange() {
        updateGuaSectionVisibility();
        updateRequiredPackages();
        refreshTemplateAndPackages();
    }

    function updateRequiredPackages() {
        const config = getAiosConfig();
        const packagesTextarea = document.getElementById('asu-packages');
        if (!packagesTextarea) return;

        let currentPackages = split(packagesTextarea.value);

        // 自動追加対象を制限
        currentPackages = currentPackages.filter(pkg =>
            pkg !== 'map' && pkg !== 'ds-lite'
        );

        // 接続方式に応じたパッケージの追加
        if (config.connectionMode === 'auto' && app.apiInfo?.rule) {
            if (app.apiInfo.rule.aftrType) {
                currentPackages.push('ds-lite');
            } else if (app.apiInfo.rule.brIpv6Address) {
                currentPackages.push('map');
            }
        } else if (config.connectionMode === 'manual') {
            switch(config.connectionType) {
                case 'mape':
                    currentPackages.push('map');
                    break;
                case 'dslite':
                    currentPackages.push('ds-lite');
                    break;
            }
        }

        // 重複排除
        currentPackages = Array.from(new Set(currentPackages));
        packagesTextarea.value = currentPackages.join(' ');
    }

    // テンプレート管理
    function initializeTemplate() {
        const textarea = document.getElementById('uci-defaults-content');
        if (textarea && !textarea.value) {
            textarea.value = SETUP_SH_TEMPLATE;
            app.templateLoaded = true;
        }
    }

    function resetTemplate() {
        const textarea = document.getElementById('uci-defaults-content');
        if (textarea) {
            textarea.value = SETUP_SH_TEMPLATE;
        }
    }

    async function updateConfiguredTemplate() {
        const content = customizeSetupScript(
            SETUP_SH_TEMPLATE,
            getAiosConfig(),
            app.apiInfo,
            new Set(split(document.getElementById('asu-packages')?.value || ''))
        );
        
        const textarea = document.getElementById('uci-defaults-content');
        if (textarea) {
            textarea.value = content;
        }
    }

    function customizeSetupScript(content, config, apiInfo, selectedPackages) {
        // index3.htmlのcustomizeSetupScript関数と同じロジック
        let customized = content;

        // OpenWrt version flags
        const version = document.getElementById('versions')?.value || '';
        if (version.startsWith('19')) {
            customized = customized.replace(/^# openwrt_19=""/m, `openwrt_19="1"`);
            customized = customized.replace(/^# openwrt_21=""/m, `# openwrt_21=""`);
        } else {
            customized = customized.replace(/^# openwrt_19=""/m, `# openwrt_19=""`);
            customized = customized.replace(/^# openwrt_21=""/m, `openwrt_21="1"`);
        }

        // 基本設定
        customized = setScriptVar(customized, 'device_name', config.deviceName, !!config.deviceName);
        customized = setScriptVar(customized, 'lan_ip_address', config.lanIp, !!config.lanIp);
        
        // パスワード設定
        const samePw = (config.rootPassword === config.confirmPassword) ? config.rootPassword : '';
        customized = setScriptVar(customized, 'root_password', samePw, !!samePw);

        // 他の設定も同様に...

        // MAP-E選択時のみmap.sh埋め込み
        const mapeActive = (config.connectionType === 'mape' || 
                          (config.connectionMode === 'auto' && apiInfo?.rule?.brIpv6Address));
        if (mapeActive) {
            customized = loadMapShContentSync(customized, version);
        }

        return customized;
    }

    function setScriptVar(content, key, value, active) {
        const safe = (v) => (v === undefined || v === null) ? '' : String(v).trim();
        const val = safe(value);
        const re = new RegExp(`^#?\\s*${key}=".*"$`, 'm');
        const line = active ? `${key}="${val}"` : `# ${key}="${val}"`;
        return content.replace(re, line);
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

        return {
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

            dsliteMode: document.querySelector('input[name="dsliteMode"]:checked')?.value || 'auto',
            dsliteAftrType: parseOrEmpty('dslite-aftr-type'),
            dsliteArea: parseOrEmpty('dslite-area'),
            dsliteAftrAddress: parseOrEmpty('dslite-aftr-address'),

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
    }

    // map.sh関連
    async function preloadMapScripts() {
        try {
            const [newResp, oldResp] = await Promise.all([
                fetch(MAP_NEW_URL),
                fetch(MAP_19_URL)
            ]);

            if (newResp.ok) {
                app.mapSh['new'] = await newResp.text();
                console.log('Loaded map.sh.new successfully');
            }

            if (oldResp.ok) {
                app.mapSh['19'] = await oldResp.text();
                console.log('Loaded map.sh.19 successfully');
            }
        } catch (error) {
            console.error('Failed to load map.sh scripts:', error);
        }
    }

    function loadMapShContentSync(content, osVersion) {
        if (!content.includes('${map_sh_content}')) {
            return content;
        }

        let mapShContent = '';
        
        if (osVersion && osVersion.startsWith('19')) {
            mapShContent = app.mapSh['19'] || '';
            console.log('Using map.sh.19 for OpenWrt 19.x');
        } else {
            mapShContent = app.mapSh['new'] || '';
            console.log('Using map.sh.new for OpenWrt 21.02+');
        }

        if (!mapShContent) {
            console.warn('map.sh content not available');
            mapShContent = `#!/bin/sh\n# MAP-E script not embedded\nexit 1`;
        }

        return content.replace('${map_sh_content}', mapShContent);
    }

    function refreshTemplateAndPackages() {
        asuCollectPackages();
        
        if (document.getElementById('use-aios-config')?.checked) {
            updateConfiguredTemplate();
        }
    }

    // ビルドリクエスト（既存のbuildAsuRequest関数をカスタマイズ）
    async function customBuildAsuRequest() {
        const device = window.current_device;
        if (!device || !device.id) {
            alert('Please select a device first');
            return;
        }

        try {
            // ボタン無効化
            const btn = document.getElementById('request-build');
            if (btn) btn.disabled = true;

            showProgress('Sending build request...', 10);

            const packages = split(document.getElementById('asu-packages')?.value || '');
            const script = document.getElementById('uci-defaults-content')?.value || '';

            const requestBody = {
                target: device.target,
                profile: device.id,
                packages: packages,
                version: document.getElementById('versions')?.value || 'SNAPSHOT'
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
            const btn = document.getElementById('request-build');
            if (btn) btn.disabled = false;
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
                        showProgress(`Waiting for build to start... ${elapsedSeconds}s`, 10);
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
                const progressPercent = Math.min((elapsedSeconds / 600) * 85 + 10, 95);
                const progressMsg = status.detail || status.status || 'Processing';

                if (status.status === 'done' || status.status === 'success' || 
                    status.detail === 'done' || status.imagebuilder_status === 'done') {
                    const images = status.images || status.request?.images || [];
                    showProgress('Build completed!', 100);
                    setTimeout(() => {
                        hideProgress();
                        showBuildStatus('Build successful', 'info');
                        showDownloadLinks(images, status, requestHash);
                    }, 500);
                    return;
                }

                if (status.status === 'failed' || status.status === 'failure') {
                    throw new Error(`Build failed: ${status.detail || 'Unknown error'}`);
                }

                showProgress(`${progressMsg}... ${elapsedSeconds}s`, progressPercent);
                await new Promise(resolve => setTimeout(resolve, 5000));
                attempts++;

            } catch (error) {
                if (attempts >= 5) throw error;
                await new Promise(resolve => setTimeout(resolve, 5000));
                attempts++;
            }
        }

        throw new Error('Build timeout after 10 minutes');
    }

    function showProgress(message, percentage) {
        const msgEl = document.getElementById('build-message');
        const barEl = document.getElementById('progress-bar');
        const progressEl = document.getElementById('build-progress');

        if (msgEl) msgEl.textContent = message;
        if (barEl) barEl.style.width = `${percentage}%`;
        if (progressEl) progressEl.style.display = 'block';
    }

    function hideProgress() {
        const progressEl = document.getElementById('build-progress');
        if (progressEl) progressEl.style.display = 'none';
    }

    function showBuildStatus(message, type) {
        const bs = document.getElementById('asu-buildstatus');
        if (!bs) return;

        if (type === 'error') {
            bs.classList.remove('asu-info');
            bs.classList.add('asu-error');
        } else {
            bs.classList.remove('asu-error');
            bs.classList.add('asu-info');
        }

        const span = bs.querySelector('span');
        if (span) span.textContent = message;
        bs.style.display = 'block';
    }

    function showDownloadLinks(images, fullStatus, requestHash) {
        const container = document.getElementById('download-links');
        if (!container) return;

        if (!images || images.length === 0) {
            container.innerHTML = '<h4>Downloads</h4><p>No images available</p>';
            return;
        }

        container.innerHTML = `
            <div class="images">
                <h4>Factory Image</h4>
                <p class="text-muted">The factory image is used for the initial flashing of OpenWrt.</p>
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
            link.textContent = fileName;

            const type = (image.type || image.name).toLowerCase();

            if (type.includes('factory')) {
                factoryContainer.appendChild(link);
                factoryContainer.appendChild(document.createTextNode(' '));
                hasFactory = true;
            } else if (type.includes('sysupgrade')) {
                sysupgradeContainer.appendChild(link);
                sysupgradeContainer.appendChild(document.createTextNode(' '));
                hasSysupgrade = true;
            } else {
                otherContainer.appendChild(link);
                otherContainer.appendChild(document.createTextNode(' '));
                hasOther = true;
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

        // Build情報を表示
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

    // ユーティリティ関数
    function split(str) {
        return str.match(/[^\s,]+/g) || [];
    }

const originalChangeModel = window.changeModel;
if (originalChangeModel) {
    window.changeModel = function(version, overview, title) {
        originalChangeModel.apply(this, arguments);
        setTimeout(() => {
            const textarea = document.getElementById('uci-defaults-content');
            if (textarea && !textarea.value) {
                initializeTemplate();
            }
            refreshTemplateAndPackages();
        }, 100);
    };
}

// グローバル公開
// window.applyInitialsFromApi = applyInitialsFromApi;
window.buildAsuRequest = customBuildAsuRequest;

window.debugCustomFeatures = function() {
    console.log('Custom App State:', customApp);
    console.log('Package Selector:', document.getElementById('use-package-selector'));
    console.log('AIOS Config:', document.getElementById('use-aios-config'));
    console.log('Current Device:', window.current_device);
    console.log('Build Function:', window.buildAsuRequest);
};

})();
