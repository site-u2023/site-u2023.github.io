/* Minimal expansion functionality - direct port from build/index.html */

let packageSelectorLoaded = false;
let scriptEditorLoaded = false;

let ADV_PKG_INDEX = { byId: {}, byName: {} };
let ADV_DEP_REFCOUNT = Object.create(null);

function advParseTokens(str) {
  return String(str || '')
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function advBuildPackageIndex(packageData) {
  ADV_PKG_INDEX = { byId: {}, byName: {} };
  (packageData.categories || []).forEach(cat => {
    (cat.packages || []).forEach(pkg => {
      ADV_PKG_INDEX.byId[pkg.id] = pkg;
      ADV_PKG_INDEX.byName[pkg.name] = pkg;
    });
  });
}

function advResolveDepNames(depIds) {
  const out = [];
  (depIds || []).forEach(id => {
    const dep = ADV_PKG_INDEX.byId[id];
    if (dep && dep.name) out.push(dep.name);
  });
  return out;
}

function advBumpDepCount(depIds, delta) {
  (depIds || []).forEach(id => {
    const cur = ADV_DEP_REFCOUNT[id] || 0;
    ADV_DEP_REFCOUNT[id] = Math.max(0, cur + delta);
  });
}

function advGetDepCheckbox(depId) {
  return document.querySelector(`#pkg-${depId}`);
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        const allDetails = document.querySelectorAll('details');
        allDetails.forEach(details => {
            if (details.querySelector('#package-selector-content')) {
                details.addEventListener('toggle', function() {
                    if (this.open && !packageSelectorLoaded) {
                        loadPackageSelector();
                    }
                });
            }
            if (details.querySelector('#script-editor-content')) {
                details.addEventListener('toggle', function() {
                    if (this.open && !scriptEditorLoaded) {
                        loadScriptEditor();
                    }
                });
            }
        });
    }, 100);
});

async function loadPackageSelector() {
    const container = document.getElementById('package-selector-content');
    if (!container) return;
    
    try {
        const response = await fetch('https://raw.githubusercontent.com/site-u2023/site-u2023.github.io/main/selector/packages/packages.json');
        const packageData = await response.json();
        
        generatePackageCategories(container, packageData);
        packageSelectorLoaded = true;
    } catch (error) {
        container.innerHTML = '<p>Failed to load packages</p>';
    }
}

async function loadScriptEditor() {
    const container = document.getElementById('script-editor-content');
    if (!container) return;

    try {
        const response = await fetch('https://raw.githubusercontent.com/site-u2023/site-u2023.github.io/main/selector/uci-defaults/setup.sh');
        const template = await response.text();

        await loadAdvancedConfig(container, template);
        scriptEditorLoaded = true;
    } catch (error) {
        container.innerHTML = '<p>Failed to load script</p>';
    }
}

function generatePackageCategories(container, packageData) {
    // 索引を先に構築
    advBuildPackageIndex(packageData);
    ADV_DEP_REFCOUNT = Object.create(null);

    let html = '<div id="package-categories">';

    (packageData.categories || []).forEach(category => {
        html += `<div class="package-category">`;
        html += `<h6>${category.name}</h6>`;
        html += '<div class="package-grid">';

        // 依存として参照されるID集合（トップレベル重複を防ぐ用途）
        const depIdsAll = new Set();
        (category.packages || []).forEach(pkg => {
            (pkg.dependencies || []).forEach(d => depIdsAll.add(d));
        });

        (category.packages || []).forEach(pkg => {
            // トップレベルは hidden を描画しないポリシーは維持
            if (pkg.hidden) return;

            // 親行
            html += `<div class="package-item">`;
            html += `<div class="form-check">`;

            const depIds = pkg.dependencies || [];
            const depNames = advResolveDepNames(depIds);
            const depIdsAttr = depIds.join(' ');
            const depNamesAttr = depNames.join(' ');

            const pkgUrl = (pkg && pkg.url) ? pkg.url : `https://openwrt.org/packages/${encodeURIComponent(pkg.name)}`;

            html += `<input class="form-check-input package-selector-checkbox" type="checkbox" id="pkg-${pkg.id}" data-id="${pkg.id}" data-package="${pkg.name}"`;
            if (depIds.length) {
                html += ` data-dependencies="${depIdsAttr}" data-dep-names="${depNamesAttr}"`;
            }
            html += `>`;

            html += `<label class="form-check-label" for="pkg-${pkg.id}">`;
            html += `<a href="${pkgUrl}" target="_blank" rel="noopener" class="package-link">${pkg.name}</a>`;
            html += `</label></div>`;

            // 子行（依存）
            if (depIds.length) {
                depIds.forEach(depId => {
                    const depPkg = ADV_PKG_INDEX.byId[depId];
                    const depName = depPkg?.name || depId;
                    const depUrl = (depPkg && depPkg.url) ? depPkg.url : `https://openwrt.org/packages/${encodeURIComponent(depName)}`;
                    const depHidden = !!depPkg?.hidden;

                    html += `<div class="package-dependent${depHidden ? ' package-hidden' : ''}">`;
                    html += `<input class="form-check-input package-selector-checkbox" type="checkbox" id="pkg-${depId}" data-id="${depId}" data-package="${depName}">`;
                    html += `<label class="form-check-label" for="pkg-${depId}">`;
                    html += `<a href="${depUrl}" target="_blank" rel="noopener" class="package-link">${depName}</a>`;
                    html += `</label>`;
                    html += `</div>`;
                });
            }

            html += `</div>`;
        });

        html += '</div></div>';
    });

    html += '</div>';
    container.innerHTML = html;

    // イベント: 依存伝搬 + パッケージリスト更新
    container.querySelectorAll('.package-selector-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function(e) {
            advHandleDependencyToggle(e.target);
            updatePackageList();
        });
    });
}

function advHandleDependencyToggle(sourceCB) {
    const isChecked = !!sourceCB.checked;
    const pkgId = sourceCB.getAttribute('data-id') || '';
    if (!pkgId) return;

    // 親 → 子（data-dependencies 属性保有時）
    const depIds = advParseTokens(sourceCB.getAttribute('data-dependencies'));
    if (depIds.length) {
        // 参照カウント更新
        advBumpDepCount(depIds, isChecked ? 1 : -1);

        depIds.forEach(depId => {
            const depCB = advGetDepCheckbox(depId);
            if (!depCB) return;

            if (isChecked) {
                // 親が増えた → 子を ON（カウントは既に加算済み）
                depCB.checked = true;
            } else {
                // 親が減った → カウント0なら子を OFF
                const cnt = ADV_DEP_REFCOUNT[depId] || 0;
                if (cnt === 0) depCB.checked = false;
            }
        });
    }

    // 子 → 親（ユーザーが子を直接操作した場合）
    // 親がこの子を依存に持っている場合、親は「子の状態に同期」しない。
    // 親は明示操作が優先のため、ここでは親の自動変更は行わない。
    // （親チェックで子はON、親解除で子は参照カウント0ならOFF。子単独ONは許容。）
}

function updatePackageList() {
    const textarea = document.getElementById('asu-packages');
    if (!textarea) return;

    // 小ユーティリティ: トークン配列へ
    const parseTokens = (v) =>
        String(v || '')
            .split(/[\s,]+/)
            .map(s => s.trim())
            .filter(Boolean);

    // 現在の値を配列化
    let current = textarea.value.trim().split(/\s+/).filter(Boolean);

    // 全チェックボックスを取得
    const checkboxes = Array.from(document.querySelectorAll('.package-selector-checkbox'));

    // 管理対象トークン収集 & 依存マップ構築
    const managedTokens = [];
    const depMap = new Map(); // token -> Set(deps)

    checkboxes.forEach(cb => {
        const selfNames = parseTokens(cb.getAttribute('data-package'));
        const depNames = parseTokens(cb.getAttribute('data-dep-names'));       // 平坦化された同梱名
        const depsEdges = parseTokens(cb.getAttribute('data-dependencies'));    // 依存先（グラフ）

        // 管理対象に自己/依存名/依存先をすべて含める（再構成の一貫性確保）
        managedTokens.push(...selfNames, ...depNames, ...depsEdges);

        // 自己トークンごとに依存先エッジを登録
        selfNames.forEach(t => {
            const set = depMap.get(t) || new Set();
            depsEdges.forEach(d => set.add(d));
            depMap.set(t, set);
        });
    });

    // 管理対象を一括削除（手動入力は残す）
    const managedSet = new Set(managedTokens);
    current = current.filter(tok => !managedSet.has(tok));

    // チェック済み: 基底集合（自己 + 平坦依存名）
    const base = new Set();
    const checkedDepNames = [];
    checkboxes.forEach(cb => {
        if (cb.checked) {
            parseTokens(cb.getAttribute('data-package')).forEach(t => base.add(t));
            const dn = parseTokens(cb.getAttribute('data-dep-names'));
            dn.forEach(t => base.add(t));
            checkedDepNames.push(...dn); // 明示追加も保持
        }
    });

    // 依存のトランジティブ閉包（data-dependencies を辿る）
    const required = new Set();
    const queue = [];

    base.forEach(t => {
        required.add(t);
        queue.push(t);
    });

    while (queue.length) {
        const t = queue.shift();
        const deps = depMap.get(t);
        if (!deps) continue;
        deps.forEach(d => {
            if (!required.has(d)) {
                required.add(d);
                // 依存先にも更なる依存がある場合のみ探索継続
                if (depMap.has(d)) queue.push(d);
            }
        });
    }

    // dep-names は平坦同梱として必ず追加（閉包に含まれていても問題なし）
    checkedDepNames.forEach(t => required.add(t));

    // 反映（手動残存 + 管理下再構成）、順序は入力順を維持
    const out = Array.from(new Set([...current, ...required]));
    textarea.value = out.join(' ');
}

async function loadAdvancedConfig(container, template) {
    try {
        const res = await fetch('advanced.html');
        const html = await res.text();
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = '<p>Failed to load advanced configuration</p>';
        return;
    }

    // uci-defaults 出力領域を重複なく 1 つに絞る
    const uciAreas = container.querySelectorAll('#uci-defaults-content');
    uciAreas.forEach((el, idx) => {
        if (idx > 0) el.remove();
    });

    // 言語セレクターにプレースホルダを追加
    const langSelect = container.querySelector('#advanced-language');
    if (langSelect) {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select language';
        langSelect.insertBefore(placeholder, langSelect.firstChild);
        langSelect.value = '';
    }

    // GitHub から po ファイル一覧を取得して <option> を生成
    await populateLanguageSelectorFromGitHub();

    // 選択言語が変わったらパッケージ更新＆スクリプト再生成
    if (langSelect) {
        langSelect.addEventListener('change', () => {
            updateLanguagePackages(langSelect.value);
            updateMainScript(template);
        });
    }

    // その他フォーム要素の入力イベントでスクリプト再生成
    container.addEventListener('input', () => {
        updateMainScript(template);
    });

    // 初回描画
    updateMainScript(template);
}

function updateLanguagePackages(language) {
    const textarea = document.getElementById('asu-packages');
    if (!textarea) return;
    
    let packages = textarea.value.trim().split(/\s+/).filter(p => p);
    
    // 既存の言語パッケージを削除
    packages = packages.filter(p => !p.startsWith('luci-i18n-'));
    
    // 新しい言語パッケージを追加（英語以外）
    if (language && language !== 'en') {
        const langCode = language.replace('_', '-');
        packages.push(`luci-i18n-base-${langCode}`);
        packages.push(`luci-i18n-opkg-${langCode}`);
        packages.push(`luci-i18n-firewall-${langCode}`);
    }
    
    textarea.value = packages.join(' ');
}

function updateMainScript(template) {
    const textarea = document.getElementById('uci-defaults-content');
    if (!textarea) return;
    
    let script = template;
    
    // フォーム値を取得してスクリプトに反映
    const deviceName = document.getElementById('device-name')?.value;
    const rootPassword = document.getElementById('root-password')?.value;
    const lanIp = document.getElementById('lan-ip')?.value;
    const language = document.getElementById('advanced-language')?.value;
    const country = document.getElementById('country')?.value;
    const wifiSSID = document.getElementById('wifi-ssid')?.value;
    const wifiPassword = document.getElementById('wifi-password')?.value;
    
    if (deviceName) script = updateScriptVariable(script, 'device_name', deviceName);
    if (rootPassword) script = updateScriptVariable(script, 'root_password', rootPassword);
    if (lanIp) script = updateScriptVariable(script, 'lan_ip_address', lanIp);
    if (language) script = updateScriptVariable(script, 'language', language);
    if (country) script = updateScriptVariable(script, 'country', country);
    if (wifiSSID) script = updateScriptVariable(script, 'wlan_name', wifiSSID);
    if (wifiPassword) script = updateScriptVariable(script, 'wlan_password', wifiPassword);
    
    textarea.value = script;
}

function updateScriptVariable(script, varName, value) {
    const regex = new RegExp(`^#?\\s*${varName}="[^"]*"`, 'm'); // #付き・無し両対応
    const replacement = `${varName}="${value}"`;
    return script.replace(regex, replacement);
}

function updateScriptVariable(script, varName, value) {
    const regex = new RegExp(`^#\\s*${varName}="[^"]*"`, 'm');
    const replacement = `${varName}="${value}"`;
    
    if (script.match(regex)) {
        return script.replace(regex, replacement);
    } else {
        return script;
    }
}

// window.LANG_AVAILABLE に「有効な言語コードの配列 or {code:true,...}」がある前提。
// ここに存在しない言語は選択時に 'en' へ強制フォールバックします。
// 言語リストは index.html の <select id="languages-select"> を唯一のソースとして複製します。
async function populateLanguageSelectorFromGitHub() {
    const source = document.getElementById('languages-select');
    const target = document.getElementById('advanced-language');
    if (!source || !target) return;

    // GitHubから取得して有効言語セットを作成
    const baseUrl = 'https://api.github.com/repos/openwrt/luci/contents/modules/luci-base/po?ref=master';
    let available = new Set();
    try {
        const res = await fetch(baseUrl);
        const dirs = await res.json();
        for (const entry of dirs) {
            if (entry.type === 'dir') {
                available.add(entry.name.toLowerCase());
            }
        }
    } catch (err) {
        console.warn('Failed to fetch language list:', err);
    }
    if (available.size === 0) available.add('en');

    // ソースの<option>から有効言語のみコピー
    target.innerHTML = '';
    for (const opt of source.options) {
        const code = opt.value.toLowerCase();
        if (!available.has(code)) continue; // 無効は表示しない
        const copy = document.createElement('option');
        copy.value = opt.value;
        copy.textContent = opt.textContent;
        target.appendChild(copy);
    }

    // 初期値を安全に設定（存在しない場合のみ en）
    if (!available.has((target.value || '').toLowerCase())) {
        target.value = 'en';
    }
}
