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

// ── DOMContentLoaded イベントリスナー ──
document.addEventListener('DOMContentLoaded', async () => {
    // 共通ヘッダーとフッターをまず読み込む
    await loadCommonElements();

    // ── SSHコマンド列（aios用）──
    const sshCommands = [
        'wget -O /usr/bin/aios https://raw.githubusercontent.com/site-u2023/aios/main/aios',
        'chmod +x /usr/bin/aios',
        'sh /usr/bin/aios'
    ].join(' && ');
    const sshCmdEncoded = encodeURIComponent(sshCommands);

    // ── テーマ切替（auto/light/dark）──
    (function(){
        const html = document.documentElement;
        const btns = document.querySelectorAll('.theme-selector button');
        const stored = localStorage.getItem('site-u-theme') || 'auto';
        const logoElement = document.getElementById('site-logo'); // ロゴ要素を取得

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

    // 全角→半角変換
    function toHalfWidth(str) {
        return str
            .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
            .replace(/\u3000/g, ' '); // 全角スペースを半角スペースに
    }

    // QRコード描画
    function drawQRCode(elementId, text) {
        const qrContainer = document.getElementById(elementId);
        if (!qrContainer || !window.QRCode) return; // QRCodeライブラリがあるか確認
        qrContainer.innerHTML = '';
        const canvas = document.createElement('canvas');
        qrContainer.appendChild(canvas);

        const style = getComputedStyle(document.body);
        const darkColor = style.getPropertyValue('--qr-dark').trim();
        const lightColor = style.getPropertyValue('--qr-light').trim();

        QRCode.toCanvas(canvas, text, {
            color: { dark: darkColor, light: lightColor }
        }).catch(() => {});
    }

    // 全リンク更新処理
        function updateAll() {
            const input = document.getElementById('global-ip-input');
            if (!input) return;

            // updateAllが呼び出された時点で、最新のIPアドレスを取得
            const ip = toHalfWidth(input.value.trim()) || input.placeholder;
            localStorage.setItem('site-u-ip', ip);

            // IPアドレス表示部分の更新 (もしあれば)
            const sshIpSpan = document.getElementById('ssh-ip');
            const aiosIpSpan = document.getElementById('aios-ip');
            if (sshIpSpan) sshIpSpan.textContent = ip;
            if (aiosIpSpan) aiosIpSpan.textContent = ip;
        
            // 各リンクの更新（以前のコードに準ずる）
            document.querySelectorAll('.link-ip').forEach(link => {
                const template = link.dataset.ipTemplate;
                if (template) {
                    let newHref = template.replace(/\${ip}/g, ip);
                    if (link.id === 'aios-link') {
                        // ここはAIOSのコマンドリストを保持する
                        const sshCommands = [
                            'echo "OpenWrt is awesome!"',
                            'logread | tail -n 20'
                        ];
                        const sshCmdEncoded = encodeURIComponent(sshCommands.join('; '));
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
                    // ここでdrawQRCodeに渡すIPも、常に最新のものを取得するようにする
                    drawQRCode('qrcode-detail', `ssh://root@${ip}`);
                }

                // toggleイベントリスナーの登録（一度だけ）
                if (!detailContainer.dataset.toggleListenerAdded) {
                    detailContainer.addEventListener('toggle', function() {
                        // ★重要★ ここでも、常に最新のIPアドレスをinputから取得する
                        const currentIpForQr = toHalfWidth(input.value.trim()) || input.placeholder;

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

        // SSH接続リンク
        const sshLink = document.getElementById('ssh-link');
        if (sshLink) {
            const tpl = sshLink.getAttribute('data-ip-template');
            const url = tpl.replace(/\$\{ip\}/g, ip);
            sshLink.href = url;
            const span = sshLink.querySelector('#ssh-ip');
            if (span) span.textContent = ip;
        }

        // aios実行リンク
        const aiosLink = document.getElementById('aios-link');
        if (aiosLink) {
            const tpl = aiosLink.getAttribute('data-ip-template');
            const url = tpl
                .replace(/\$\{ip\}/g, ip)
                .replace(/\$\{cmd\}/g, sshCmdEncoded);
            aiosLink.href = url;
            const span = aiosLink.querySelector('#aios-ip');
            if (span) span.textContent = ip;
        }

        // その他 .link-ip のhref更新（上記2つを除く）
        document.querySelectorAll('.link-ip').forEach(link => {
            if (link.id === 'ssh-link' || link.id === 'aios-link') return;
            const tpl = link.getAttribute('data-ip-template');
            if (!tpl) return;
            link.href = tpl.replace(/\$\{ip\}/g, ip);
        });
    }

    // 入力欄全角→半角＋updateAll
    document.querySelectorAll('input[type="text"]').forEach(inp => {
        inp.addEventListener('input', () => {
            const pos = inp.selectionStart;
            const v = toHalfWidth(inp.value);
            if (v !== inp.value) {
                inp.value = v;
                inp.setSelectionRange(pos, pos);
            }
            updateAll();
        });
    });

    // 更新ボタン・Enterキーで updateAll
    // nullチェック ? を使用し、要素が存在しないページでもエラーにならないようにする
    document.getElementById('global-ip-update')?.addEventListener('click', updateAll);
    document.getElementById('global-ip-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            updateAll();
        }
    });

    // 言語切替機能
    // ボタン要素は、footer.htmlが読み込まれた後に取得する
    const langButtons = document.querySelectorAll('.language-selector button');
    const currentLang = localStorage.getItem('lang-preference') || 'ja'; // デフォルトは日本語

    applyLanguage(currentLang);

    langButtons.forEach(button => {
        button.addEventListener('click', () => {
            const newLang = button.dataset.lang;
            localStorage.setItem('lang-preference', newLang);
            applyLanguage(newLang);
        });
    });

    function applyLanguage(lang) {
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
                // preserve existing span for IP address in SSH/AIOS links
                if (key === 'sshConnection' || key === 'aiosExecution') {
                    const ipSpanId = key === 'sshConnection' ? 'ssh-ip' : 'aios-ip';
                    // Elementがまだ存在しない可能性があるので、取得前に確認
                    const ipSpanElement = document.getElementById(ipSpanId);
                    const currentIpText = ipSpanElement ? ipSpanElement.textContent : '';
                    element.innerHTML = langData[lang][key].replace(/<span id="(ssh|aios)-ip">.*?<\/span>/, `<span id="${ipSpanId}">${currentIpText}</span>`);
                } else {
                    element.textContent = langData[lang][key];
                }
            }
        });
    }
    
    // 初回描画 (IPアドレスの永続化とリンク更新)
    // localStorageからIPアドレスを読み込み、入力フィールドに設定
    const globalIpInput = document.getElementById('global-ip-input');
    if (globalIpInput) { // global-ip-inputが存在するページでのみ実行
        const storedIp = localStorage.getItem('site-u-ip') || globalIpInput.placeholder;
        globalIpInput.value = storedIp;
    }
    updateAll(); // IPアドレスで全てのリンクを更新 (global-ip-inputがないページでは何もしない)
});
