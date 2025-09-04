// custom.js - OpenWrt カスタム機能（JSONベース動的生成版）

console.log('custom.js loaded');

// ==================== グローバル変数 ====================
let customInitialized = false;
let customHTMLLoaded = false;
let PACKAGE_DB = null;
let devicePackages = [];
let setupConfig = null;
let formStructure = {};
let cachedApiInfo = null;

// ==================== 初期化処理 ====================

// 元の updateImages をフック
const originalUpdateImages = window.updateImages;
window.updateImages = function(version, mobj) {
    if (originalUpdateImages) originalUpdateImages(version, mobj);
    
    // パッケージリスト設定後にリサイズ
    if (mobj && "manifest" in mobj === false) {
        setTimeout(() => resizePostinstTextarea(), 100);
    }
    
    // 初回のみ custom.html を読み込む
    if (!customHTMLLoaded) {
        console.log("updateImages finished, now load custom.html");
        loadCustomHTML();
        customHTMLLoaded = true;
    } else {
        console.log("updateImages called again, reinitializing features");
        reinitializeFeatures();
    }
};

// custom.html 読み込み
async function loadCustomHTML() {
    try {
        const response = await fetch('custom.html');
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
    
    hookOriginalFunctions();
    
    // 設定とデータを並列で読み込み
    await Promise.all([
        loadSetupConfig(),
        loadPackageDatabase(),
        fetchAndDisplayIspInfo()
    ]);
    
    // 依存関係のある初期化
    generateFormsFromJson();  // JSONからフォーム生成
    setupEventListeners();
    loadUciDefaultsTemplate();
    initDeviceTranslation();
    setupFormWatchers();
    
    customInitialized = true;
}

// #asuセクションを置き換え
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

    newDiv.insertAdjacentHTML('beforeend', `
        <br>
        <div id="asu-buildstatus" class="hide"><span></span></div>
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
    if (PACKAGE_DB) generatePackageSelector();
    fetchAndDisplayIspInfo();
    if (cachedApiInfo) updateAutoConnectionInfo(cachedApiInfo);
}

// ==================== JSONからフォーム動的生成 ====================

function generateFormsFromJson() {
    const container = document.querySelector('#scripts-config');
    if (!container || !setupConfig) return;
    
    // 既存コンテンツをクリア
    container.innerHTML = '';
    
    setupConfig.formSections.forEach(section => {
        if (section.type === 'commands') {
            // コマンド入力セクション
            const commandDiv = createCommandSection(section);
            container.appendChild(commandDiv);
        } else if (section.type === 'details') {
            // 詳細セクション（UCI-defaults）
            const detailsDiv = createDetailsSection(section);
            container.appendChild(detailsDiv);
        } else {
            // 通常セクション
            const sectionDiv = createFormSection(section);
            container.appendChild(sectionDiv);
        }
    });
    
    // フォーム構造を生成（値収集用）
    formStructure = generateFormStructure(setupConfig);
}

function createCommandSection(section) {
    const div = document.createElement('div');
    div.className = section.className;
    
    const title = document.createElement('h4');
    title.textContent = section.title;
    div.appendChild(title);
    
    if (section.description) {
        const desc = document.createElement('p');
        desc.className = 'text-muted';
        desc.textContent = section.description;
        div.appendChild(desc);
    }
    
    const autocompleteDiv = document.createElement('div');
    autocompleteDiv.id = 'commands-autocomplete';
    autocompleteDiv.className = 'autocomplete';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.id = section.fields[0].id;
    input.placeholder = section.fields[0].placeholder;
    input.autocomplete = 'off';
    input.spellcheck = 'false';
    input.autocapitalize = 'off';
    
    autocompleteDiv.appendChild(input);
    div.appendChild(autocompleteDiv);
    
    return div;
}

function createDetailsSection(section) {
    const details = document.createElement('details');
    details.id = section.id;
    details.className = section.className;
    
    const summary = document.createElement('summary');
    const title = document.createElement('h4');
    title.textContent = section.title;
    summary.appendChild(title);
    details.appendChild(summary);
    
    const groupDiv = document.createElement('div');
    groupDiv.id = section.id.replace('-details', '-group');
    
    section.fields.forEach(field => {
        const element = createFormField(field);
        groupDiv.appendChild(element);
    });
    
    details.appendChild(groupDiv);
    return details;
}

function createFormSection(section) {
    const div = document.createElement('div');
    div.id = section.id;
    div.className = section.className;
    
    const title = document.createElement('h4');
    title.textContent = section.title;
    div.appendChild(title);
    
    // メインフィールド
    if (section.fields) {
        const fieldsContainer = createFieldsContainer(section.fields);
        div.appendChild(fieldsContainer);
    }
    
    // サブセクション（Wi-Fi用）
    if (section.subSections) {
        section.subSections.forEach(subSection => {
            const subDiv = document.createElement('div');
            subDiv.id = subSection.id;
            if (subSection.showWhen) {
                subDiv.style.display = 'none';
            }
            
            const subFieldsContainer = createFieldsContainer(subSection.fields);
            subDiv.appendChild(subFieldsContainer);
            div.appendChild(subDiv);
        });
    }
    
    // 接続タイプ別セクション
    if (section.connectionTypes) {
        Object.entries(section.connectionTypes).forEach(([type, config]) => {
            const typeDiv = createConnectionTypeSection(config);
            typeDiv.style.display = 'none';
            div.appendChild(typeDiv);
        });
    }
    
    // オプティマイザータイプ別セクション
    if (section.optimizerTypes) {
        Object.entries(section.optimizerTypes).forEach(([type, config]) => {
            const typeDiv = createConnectionTypeSection(config);
            typeDiv.style.display = 'none';
            div.appendChild(typeDiv);
        });
    }
    
    return div;
}

function createFieldsContainer(fields, isRow = true) {
    const container = document.createElement('div');
    if (isRow && fields.length === 2) {
        container.className = 'form-row';
    }
    
    fields.forEach(field => {
        const formGroup = createFormGroup(field);
        container.appendChild(formGroup);
    });
    
    return container;
}

function createFormGroup(field) {
    const div = document.createElement('div');
    div.className = 'form-group';
    
    if (field.type === 'radio-group') {
        const label = document.createElement('label');
        label.textContent = field.label;
        div.appendChild(label);
        
        const radioGroup = document.createElement('div');
        radioGroup.className = 'radio-group';
        
        field.options.forEach(option => {
            const radioLabel = document.createElement('label');
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = field.id.replace(/^aios-/, '');
            radio.value = option.value;
            if (field.defaultValue === option.value) {
                radio.checked = true;
            }
            radioLabel.appendChild(radio);
            radioLabel.appendChild(document.createTextNode(' ' + option.label));
            radioGroup.appendChild(radioLabel);
        });
        
        div.appendChild(radioGroup);
    } else {
        if (field.label) {
            const label = document.createElement('label');
            label.setAttribute('for', field.id);
            label.textContent = field.label;
            div.appendChild(label);
        }
        
        const element = createFormField(field);
        div.appendChild(element);
        
        if (field.hint) {
            const small = document.createElement('small');
            small.className = 'form-text text-muted';
            small.textContent = field.hint;
            div.appendChild(small);
        }
    }
    
    return div;
}

function createFormField(field) {
    let element;
    
    if (field.type
