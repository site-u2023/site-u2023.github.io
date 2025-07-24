// ── グローバル定数（再定義不要なもの）──
const SSH_COMMANDS_AIOS = [
    'wget -O /usr/bin/aios https://raw.githubusercontent.com/site-u2023/aios/main/aios',
    'chmod +x /usr/bin/aios',
    'sh /usr/bin/aios'
].join(' && ');
const SSH_CMD_ENCODED_AIOS = encodeURIComponent(SSH_COMMANDS_AIOS);

// ── 共通要素（ヘッダー・フッター）の読み込み関数 ──
// header.htmlとfooter.htmlのIDがHTMLに存在するか確認し、
// もしこれらのプレースホルダーが新しいHTML構造で不要になった場合は、この関数自体を削除します。
// （現在のHTMLでは<header class="main-header">と<footer class="page-footer-area">を直接使っており、
//   placeholder要素は存在しないはずなので、この関数は削除対象となる可能性が高いです。）
async function loadCommonElements() {
    const headerPlaceholder = document.getElementById('header-placeholder'); // このIDがHTMLにあるか確認
    const footerPlaceholder = document.getElementById('footer-placeholder'); // このIDがHTMLにあるか確認

    if (headerPlaceholder) {
        try {
            const response = await fetch('header.html');
            if (!response.ok) throw new Error(`Failed to load header.html: ${response.statusText}`);
            headerPlaceholder.innerHTML = await response.text();
        } catch (error) {
            console.error('Error loading header:', error);
            headerPlaceholder.innerHTML = '<p style="color: red;">ヘッダーの読み込みに失敗しました。</p>';
        }
    }

    if (footerPlaceholder) {
        try {
            const response = await fetch('footer.html');
            if (!response.ok) throw new Error(`Failed to load footer.html: ${response.statusText}`);
            footerPlaceholder.innerHTML = await response.text();
        } catch (error) {
            console.error('Error loading footer:', error);
            footerPlaceholder.innerHTML = '<p style="color: red;">フッターの読み込みに失敗しました。</p>';
        }
    }
}

// ── 言語切替機能データ ──
// （変更なし）
const langData = {
    en: {
        deviceIP: 'Device IP Address',
        terminal: 'Terminal for Windows',
        update: 'Update',
        sshHandler: 'Register Protocol handler (first-time use: download and double-click)',
        sshConnection: 'SSH Connection (root@<span id="ssh-ip">192.168.1.1</span>)',
        aiosExecution: 'Execute aios (root@<span id="aios-ip">192.168.1.1</span>)',
        console: 'Console',
        luciAdmin: 'LuCI (Admin Interface)',
        ttydTerminal: 'ttyd (Web Terminal)',
        githubRepo: 'GitHub Repository',
        aiosScript: 'all in one script',
        configSoftware: 'config-software (legacy)'
    },
    ja: {
        deviceIP: 'デバイスIPアドレス',
        terminal: 'ターミナル (Windows用)',
        update: '更新',
        sshHandler: 'プロトコルハンドラー登録 ※初回のみ、ダウンロード後ダブルクリック',
        sshConnection: 'SSH接続 (root@<span id="ssh-ip">192.168.1.1</span>)',
        aiosExecution: 'aios実行 (root@<span id="aios-ip">192.168.1.1</span>)',
        console: 'コンソール',
        luciAdmin: 'LuCI (管理画面)',
        ttydTerminal: 'ttyd (Webターミナル)',
        githubRepo: 'GitHubリポジトリ',
        aiosScript: 'オールインワンスクリプト',
        configSoftware: 'コンフォグソフトウェア (旧版)'
    }
};

// ── toHalfWidth 関数（グローバルスコープ） ──
// （変更なし）
function toHalfWidth(str) {
    return str
        .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
        .replace(/\u3000/g, ' '); // 全角スペースを半角スペースに
}

// ── drawQRCode 関数（グローバルスコープ） ──
// （QRiousライブラリがwindow.QRiousとして公開されることを想定して修正）
function drawQRCode(elementId, text) {
    const qrContainer = document.getElementById(elementId);
    // QRiousライブラリは通常window.QRiousとして公開されます。
    // qrcode.jsを使っている場合はwindow.QRCodeのままです。
    // お使いのライブラリに合わせて 'QRious' または 'QRCode' を選択してください。
    if (!qrContainer || typeof QRious === 'undefined') { // ここをQRiousに修正
        console.error(`QR code container #${elementId} not found or QRious library not loaded.`);
        return;
    }
    qrContainer.innerHTML = ''; // 既存のcanvasをクリア
    const canvas = document.createElement('canvas');
    qrContainer.appendChild(canvas);

    const style = getComputedStyle(document.body);
    const darkColor = style.getPropertyValue('--qr-dark').trim();
    const lightColor = style.getPropertyValue('--qr-light').trim();

    // QRiousのインスタンスを作成して描画
    new QRious({
        element: canvas,
        value: text,
        size: 180, // CSSの11.25em (180px) に合わせる
        foreground: darkColor,
        background: lightColor
    });
}

// ── 全リンク更新処理（グローバルスコープ） ──
function updateAll() {
    const input = document.getElementById('global-ip-input');
    // global-ip-inputが存在しないページ（例: 免責事項ページ）では処理をスキップ
    if (!input) return;

    const ip = toHalfWidth(input.value.trim()) || input.placeholder;
    localStorage.setItem('site-u-ip', ip);

    // IPアドレス表示部分の更新
    const sshIpSpan = document.getElementById('ssh-ip');
    const aiosIpSpan = document.getElementById('aios-ip');
    if (sshIpSpan) sshIpSpan.textContent = ip;
    if (aiosIpSpan) aiosIpSpan.textContent = ip;
    
    // 各リンクの更新
    document.querySelectorAll('.link-ip').forEach(link => {
        const template = link.dataset.ipTemplate;
        if (template) {
            let newHref = template.replace(/\${ip}/g, ip);
            if (link.id === 'aios-link') {
                newHref = newHref.replace(/\${cmd}/g, SSH_CMD_ENCODED_AIOS); // 定数を使用
            }
            link.href = newHref;
        }
    });

    // QRコードの表示/非表示と再描画
    const qrDetailContainer = document.getElementById('qrcode-detail-container');
    if (qrDetailContainer && qrDetailContainer.open) {
        // detailsが開いている場合はQRコードを再描画
        drawQRCode('qrcode-detail', `ssh://root@${ip}`);
    } else if (qrDetailContainer) {
        // detailsが閉じている場合はキャンバスをクリア
        const qrCanvasContainer = document.getElementById('qrcode-detail');
        if (qrCanvasContainer) qrCanvasContainer.innerHTML = '';
    }
}

// ── 言語適用関数（グローバルスコープ） ──
// DOMContentLoadedの後に呼び出される
function applyLanguage(lang) {
    const langButtons = document.querySelectorAll('.language-selector button');

    langButtons.forEach(button => {
        if (button.dataset.lang === lang) {
            button.classList.add('selected');
        } else {
            button.classList.remove('selected');
        }
    });

    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (langData[lang] && langData[lang][key]) {
            // IPアドレス部分はupdateAllで更新されるため、innerHTMLの文字列置換は不要
            // ただし、<span>タグがHTMLに元々存在しない場合、innerHTMLで追加する現在の方式は有効
            // HTMLに<span>がある場合はtextContentを使う方が良い
            if (key === 'sshConnection' || key === 'aiosExecution') {
                // IPアドレスのspanはHTML側に存在すると仮定し、その中身だけを更新
                const ipSpanId = key === 'sshConnection' ? 'ssh-ip' : 'aios-ip';
                const currentIpText = document.getElementById(ipSpanId)?.textContent || ''; // 現在のIPを取得
                
                // langDataから取得した文字列でinnerHTMLを更新。IP部分は現在の値を維持。
                // これにより、IPアドレスが更新されても翻訳テキストは適用される
                element.innerHTML = langData[lang][key].replace(/<span id="(ssh|aios)-ip">.*?<\/span>/, `<span id="${ipSpanId}">${currentIpText}</span>`);
            } else {
                element.textContent = langData[lang][key];
            }
        }
    });
}

// ── DOMContentLoaded イベントリスナー ──
document.addEventListener('DOMContentLoaded', async () => {
    // 共通ヘッダーとフッターをまず読み込む
    // もしheader.htmlとfooter.htmlのプレースホルダーIDがHTMLから削除されている場合、
    // loadCommonElements() の呼び出し自体も不要になります。
    await loadCommonElements(); // 必要に応じて削除

    // ── テーマ切替（auto/light/dark）──
    (function(){
        const html = document.documentElement;
        // footer.htmlが読み込まれた後にボタンを取得（loadCommonElements()が不要な場合でも必要）
        const btns = document.querySelectorAll('.theme-selector button');
        const stored = localStorage.getItem('site-u-theme') || 'auto';
        // header.htmlが読み込まれた後にロゴ要素を取得（loadCommonElements()が不要な場合でも必要）
        const logoElement = document.getElementById('site-logo');

        function applyTheme(pref) {
            const mode = pref === 'auto'
                ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                : pref;
            
            html.setAttribute('data-theme', mode);
            
            // ロゴの切り替えロジック
            if (logoElement) {
                if (mode === 'dark') {
                    logoElement.src = 'img/openwrt_text_white_and_blue.svg'; // ダークテーマ用のロゴ
                } else {
                    logoElement.src = 'img/openwrt_text_blue_and_dark_blue.svg'; // ライトテーマ用のロゴ
                }
            }

            btns.forEach(b => b.classList.toggle('selected', b.dataset.themePreference === pref));
            localStorage.setItem('site-u-theme', pref);
            updateAll(); // テーマ変更時にも全リンクを更新
        }

        // ボタンの存在を確認してからイベントリスナーを追加
        if (btns.length > 0) { // ボタンが1つ以上存在する場合のみ
            btns.forEach(b => b.addEventListener('click', () => applyTheme(b.dataset.themePreference)));
            window.matchMedia('(prefers-color-scheme: dark)')
                .addEventListener('change', () => {
                    if ((localStorage.getItem('site-u-theme')||'auto') === 'auto') applyTheme('auto');
                });
            applyTheme(stored); // 初期テーマ適用
        } else {
            // テーマ切り替えボタンがない場合でも、data-theme属性の初期適用とロゴの初期設定は必要
            applyTheme(stored); // 初期テーマ適用のみ
        }
    })();

    // 年表示 (footer.htmlの内容が読み込まれた後に取得)
    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();


    // ── IPアドレス関連の初期化とイベントリスナー設定 ──
    const globalIpInput = document.getElementById('global-ip-input');
    const globalIpUpdateBtn = document.getElementById('global-ip-update');

    if (globalIpInput) { // global-ip-inputが存在するページでのみ実行
        const storedIp = localStorage.getItem('site-u-ip');
        if (storedIp) {
            globalIpInput.value = storedIp;
        } else {
            globalIpInput.value = globalIpInput.placeholder || '192.168.1.1';
        }

        globalIpInput.addEventListener('input', () => {
            const pos = globalIpInput.selectionStart;
            const v = toHalfWidth(globalIpInput.value);
            if (v !== globalIpInput.value) {
                globalIpInput.value = v;
                globalIpInput.setSelectionRange(pos, pos);
            }
            updateAll(); // 入力ごとに更新
        });

        globalIpInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                updateAll();
            }
        });
    }
    
    if (globalIpUpdateBtn) { // 更新ボタンが存在する場合のみ
        globalIpUpdateBtn.addEventListener('click', updateAll);
    }

    // ── QRコードのdetails要素イベントリスナー（重複登録防止）──
    const qrDetailContainer = document.getElementById('qrcode-detail-container');
    if (qrDetailContainer && !qrDetailContainer.dataset.toggleListenerAdded) {
        qrDetailContainer.addEventListener('toggle', function() {
            // toggleイベント内でupdateAllを再呼び出しするのではなく、
            // このリスナー内で現在のIPを使って描画/クリアする
            const input = document.getElementById('global-ip-input'); // イベント発生時に最新のinput要素を取得
            const currentIpForQr = input ? (toHalfWidth(input.value.trim()) || input.placeholder) : '192.168.1.1'; // inputがない場合のフォールバック

            if (this.open) {
                drawQRCode('qrcode-detail', `ssh://root@${currentIpForQr}`);
            } else {
                const qrCanvasContainer = document.getElementById('qrcode-detail');
                if (qrCanvasContainer) qrCanvasContainer.innerHTML = '';
            }
        });
        qrDetailContainer.dataset.toggleListenerAdded = 'true';
    }


    // ── 言語切替機能 ──
    // footer.htmlが読み込まれた後にボタン要素を取得し、初期言語を適用
    const langButtons = document.querySelectorAll('.language-selector button');
    const currentLang = localStorage.getItem('lang-preference') || 'ja'; // デフォルトは日本語

    if (langButtons.length > 0) { // ボタンが1つ以上存在する場合のみ
        langButtons.forEach(button => {
            button.addEventListener('click', () => {
                const newLang = button.dataset.lang;
                localStorage.setItem('lang-preference', newLang);
                applyLanguage(newLang);
            });
        });
    }
    applyLanguage(currentLang); // 初期言語適用

    // ページロード時の初期更新（IPアドレスの永続化とリンク更新）
    // globalIpInputが存在するページでのみupdateAllを呼び出す
    if (globalIpInput) {
        updateAll();
    }
});
