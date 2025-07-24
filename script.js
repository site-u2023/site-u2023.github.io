// ── 共通要素（ヘッダー・フッター）の読み込み関数 ──
async function loadCommonElements() {
    const headerPlaceholder = document.getElementById('header-placeholder');
    const footerPlaceholder = document.getElementById('footer-placeholder');

    // ヘッダーの読み込み
    if (headerPlaceholder) {
        try {
            const response = await fetch('header.html');
            if (!response.ok) {
                throw new Error(`Failed to load header.html: ${response.statusText}`);
            }
            const headerHtml = await response.text();
            headerPlaceholder.innerHTML = headerHtml;
        } catch (error) {
            console.error('Error loading header:', error);
            headerPlaceholder.innerHTML = '<p style="color: red;">ヘッダーの読み込みに失敗しました。</p>';
        }
    }

    // フッターの読み込み
    if (footerPlaceholder) {
        try {
            const response = await fetch('footer.html');
            if (!response.ok) {
                throw new Error(`Failed to load footer.html: ${response.statusText}`);
            }
            const footerHtml = await response.text();
            footerPlaceholder.innerHTML = footerHtml;
        } catch (error) {
            console.error('Error loading footer:', error);
            footerPlaceholder.innerHTML = '<p style="color: red;">フッターの読み込みに失敗しました。</p>';
        }
    }
}

// ── 言語切替機能データ ──
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

// ── toHalfWidth 関数（グローバルスコープに配置） ──
function toHalfWidth(str) {
    return str
        .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
        .replace(/\u3000/g, ' '); // 全角スペースを半角スペースに
}

// ── drawQRCode 関数（グローバルスコープに配置） ──
// QRiousライブラリがHTMLで読み込まれていることを前提とする
function drawQRCode(elementId, text) {
    const qrContainer = document.getElementById(elementId);
    // window.QRCode は QRious.js が公開するオブジェクト名なので、これでチェック
    if (!qrContainer || typeof QRCode === 'undefined') {
        console.error(`QR code container #${elementId} not found or QRCode library not loaded.`);
        return;
    }
    qrContainer.innerHTML = ''; // 既存のcanvasをクリア
    const canvas = document.createElement('canvas');
    qrContainer.appendChild(canvas);

    const style = getComputedStyle(document.body);
    const darkColor = style.getPropertyValue('--qr-dark').trim();
    const lightColor = style.getPropertyValue('--qr-light').trim();

    QRCode.toCanvas(canvas, text, {
        color: { dark: darkColor, light: lightColor }
    }).catch(error => {
        console.error('Error drawing QR code:', error);
    });
}

// ── 全リンク更新処理（グローバルスコープに配置） ──
// この関数は、DOMContentLoadedの後に呼び出される
function updateAll() {
    const input = document.getElementById('global-ip-input');
    if (!input) return;

    // updateAllが呼び出された時点で、最新のIPアドレスを取得
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
                // aios実行リンクのコマンド部分の置換
                // sshCommandsとsshCmdEncodedはDOMContentLoadedスコープで定義されるため、
                // updateAllがDOMContentLoaded外にある場合、ここで再定義または引数で渡す必要がある。
                // 今回はDOMContentLoaded内でupdateAllを呼び出すため、グローバルスコープに移動。
                const sshCommands = [
                    'wget -O /usr/bin/aios https://raw.githubusercontent.com/site-u2023/aios/main/aios',
                    'chmod +x /usr/bin/aios',
                    'sh /usr/bin/aios'
                ].join(' && ');
                const sshCmdEncoded = encodeURIComponent(sshCommands);
                newHref = newHref.replace(/\${cmd}/g, sshCmdEncoded);
            }
            link.href = newHref;
        }
    });

    // QRコード（details開閉時も再描画）
    const detailContainer = document.getElementById('qrcode-detail-container');
    if (detailContainer) {
        // updateAllが呼ばれた時点でdetailsが開いていれば、現在のIPで描画
        if (detailContainer.open) {
            drawQRCode('qrcode-detail', `ssh://root@${ip}`);
        }

        // toggleイベントリスナーの登録（一度だけ）
        // ここでの`ip`の取得は不要。updateAllは常に最新のIPで呼び出される
        if (!detailContainer.dataset.toggleListenerAdded) {
            detailContainer.addEventListener('toggle', function() {
                // toggleイベント内でupdateAllを再呼び出しするのではなく、
                // このリスナー内で現在のIPを使って描画する
                const currentIpForQr = toHalfWidth(input.value.trim()) || input.placeholder; // イベント時に最新IPを取得

                if (this.open) {
                    drawQRCode('qrcode-detail', `ssh://root@${currentIpForQr}`);
                } else {
                    const qrDetail = document.getElementById('qrcode-detail');
                    if (qrDetail) qrDetail.innerHTML = '';
                }
            });
            detailContainer.dataset.toggleListenerAdded = 'true';
        }
    }
}

// ── 言語適用関数（グローバルスコープに配置） ──
// DOMContentLoadedの後に呼び出される
function applyLanguage(lang) {
    // ボタンの存在は、DOMContentLoaded後に確認
    const langButtons = document.querySelectorAll('.language-selector button');

    // Update active button visual
    langButtons.forEach(button => {
        if (button.dataset.lang === lang) {
            button.classList.add('selected');
        } else {
            button.classList.remove('selected');
        }
    });

    // Apply translations
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (langData[lang] && langData[lang][key]) {
            if (key === 'sshConnection' || key === 'aiosExecution') {
                const ipSpanId = key === 'sshConnection' ? 'ssh-ip' : 'aios-ip';
                const ipSpanElement = document.getElementById(ipSpanId);
                const currentIpText = ipSpanElement ? ipSpanElement.textContent : '';
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
    await loadCommonElements();

    // ── テーマ切替（auto/light/dark）──
    (function(){
        const html = document.documentElement;
        // footer.htmlが読み込まれた後にボタンを取得
        const btns = document.querySelectorAll('.theme-selector button');
        const stored = localStorage.getItem('site-u-theme') || 'auto';
        // header.htmlが読み込まれた後にロゴ要素を取得
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
        btns.forEach(b => b.addEventListener('click', () => applyTheme(b.dataset.themePreference)));
        window.matchMedia('(prefers-color-scheme: dark)')
            .addEventListener('change', () => {
                if ((localStorage.getItem('site-u-theme')||'auto') === 'auto') applyTheme('auto');
            });
        applyTheme(stored); // 初期テーマ適用
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

        // 入力時の全角→半角変換と更新
        globalIpInput.addEventListener('input', () => {
            const pos = globalIpInput.selectionStart;
            const v = toHalfWidth(globalIpInput.value);
            if (v !== globalIpInput.value) {
                globalIpInput.value = v;
                globalIpInput.setSelectionRange(pos, pos);
            }
            updateAll(); // 入力ごとに更新
        });

        // Enterキーでの更新
        globalIpInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                updateAll();
            }
        });
    }
    
    // 更新ボタンクリックでの更新
    if (globalIpUpdateBtn) {
        globalIpUpdateBtn.addEventListener('click', updateAll);
    }

    // ── 言語切替機能 ──
    // footer.htmlが読み込まれた後にボタン要素を取得し、初期言語を適用
    const langButtons = document.querySelectorAll('.language-selector button');
    const currentLang = localStorage.getItem('lang-preference') || 'ja'; // デフォルトは日本語

    // ボタンにイベントリスナーを追加
    langButtons.forEach(button => {
        button.addEventListener('click', () => {
            const newLang = button.dataset.lang;
            localStorage.setItem('lang-preference', newLang);
            applyLanguage(newLang);
        });
    });
    applyLanguage(currentLang); // 初期言語適用


    // ページロード時の初期更新（IPアドレスの永続化とリンク更新）
    updateAll(); 
});
