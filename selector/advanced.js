// 追加用.js
// Package Search Component - add to advanced.js

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

function updatePackageUI() {
  const status = packageSearcher.getStatus();
  if (status.isLoading) {
    showPackageLoading();
    return;
  }
  
  if (status.packageCount === 0) {
    showPackageError('No packages found for this device');
    return;
  }
  
  const categories = packageSearcher.getPackagesByCategory();
  renderPackageCategories(categories);
  
  // 検索機能を有効化
  setupPackageSearch();
}

function clearPackageUI() {
  const selector = document.querySelector('.pkg-selector');
  if (selector) {
    selector.innerHTML = '';
  }
  
  const searchInput = document.getElementById('pkg-search');
  if (searchInput) {
    searchInput.disabled = true;
    searchInput.placeholder = 'Select a device first';
  }
}

function showPackageLoading() {
  const selector = document.querySelector('.pkg-selector');
  if (selector) {
    selector.innerHTML = '<div style="text-align: center; padding: 20px;">Loading packages...</div>';
  }
}

function showPackageError(message) {
  const selector = document.querySelector('.pkg-selector');
  if (selector) {
    selector.innerHTML = `<div style="text-align: center; padding: 20px; color: #999;">${message}</div>`;
  }
}

function renderPackageCategories(categories) {
  const selector = document.querySelector('.pkg-selector');
  if (!selector) return;
  
  selector.innerHTML = '';
  
  // カテゴリをソート
  const sortedCategories = Array.from(categories.entries()).sort(([a], [b]) => a.localeCompare(b));
  
  for (const [categoryName, packages] of sortedCategories) {
    if (packages.length === 0) continue;
    
    const catWrap = document.createElement('fieldset');
    catWrap.className = 'pkg-cat';
    
    const legend = document.createElement('legend');
    legend.textContent = `${categoryName} (${packages.length})`;
    catWrap.appendChild(legend);
    
    // パッケージをソート
    packages.sort((a, b) => (a.Package || '').localeCompare(b.Package || ''));
    
    for (const pkg of packages) {
      const packageDiv = createPackageElement(pkg);
      catWrap.appendChild(packageDiv);
    }
    
    selector.appendChild(catWrap);
  }
}

function createPackageElement(pkg) {
  const packageDiv = document.createElement('div');
  packageDiv.className = 'pkg-group';
  
  const label = document.createElement('label');
  label.className = 'pkg-item primary';
  
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.value = pkg.Package;
  checkbox.dataset.pkgName = pkg.Package;
  
  // textareaの既存の値をチェック
  const textarea = document.getElementById('asu-packages');
  if (textarea) {
    const currentPackages = (textarea.value.match(/[^\s,]+/g) || []);
    checkbox.checked = currentPackages.includes(pkg.Package);
  }
  
  checkbox.addEventListener('change', handlePackageSelection);
  
  label.appendChild(checkbox);
  label.appendChild(document.createTextNode(' ' + pkg.Package));
  
  // 説明があれば表示
  if (pkg.Description) {
    const desc = document.createElement('div');
    desc.className = 'pkg-description';
    desc.style.fontSize = '0.8em';
    desc.style.color = '#666';
    desc.style.marginLeft = '1.5em';
    desc.textContent = pkg.Description;
    packageDiv.appendChild(label);
    packageDiv.appendChild(desc);
  } else {
    packageDiv.appendChild(label);
  }
  
  return packageDiv;
}

function handlePackageSelection(event) {
  const checkbox = event.target;
  const packageName = checkbox.value;
  const textarea = document.getElementById('asu-packages');
  
  if (!textarea) return;
  
  let currentPackages = new Set((textarea.value.match(/[^\s,]+/g) || []));
  
  if (checkbox.checked) {
    // 依存関係を解決
    const resolved = packageSearcher.resolveDependencies([packageName]);
    for (const dep of resolved) {
      currentPackages.add(dep);
    }
    
    // 依存パッケージのチェックボックスも更新
    resolved.forEach(dep => {
      const depCheckbox = document.querySelector(`input[data-pkg-name="${dep}"]`);
      if (depCheckbox) {
        depCheckbox.checked = true;
      }
    });
  } else {
    currentPackages.delete(packageName);
  }
  
  textarea.value = Array.from(currentPackages).join(' ');
}

function setupPackageSearch() {
  const searchInput = document.getElementById('pkg-search');
  if (!searchInput) return;
  
  searchInput.disabled = false;
  searchInput.placeholder = 'Search packages...';
  
  let searchTimeout;
  searchInput.addEventListener('input', (event) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      performPackageSearch(event.target.value);
    }, 300); // 300ms debounce
  });
}

function performPackageSearch(query) {
  if (!query.trim()) {
    // 検索クエリが空の場合は全カテゴリを表示
    const categories = packageSearcher.getPackagesByCategory();
    renderPackageCategories(categories);
    return;
  }
  
  const results = packageSearcher.searchPackages(query);
  
  if (results.length === 0) {
    showPackageError(`No packages found for "${query}"`);
    return;
  }
  
  // 検索結果を単一カテゴリとして表示
  const searchCategories = new Map();
  searchCategories.set(`Search results for "${query}"`, results);
  renderPackageCategories(searchCategories);
}
