// ── グローバル定数（再定義不要なもの）──
const SSH_COMMANDS_AIOS = [
    'wget -O /usr/bin/aios https://raw.githubusercontent.com/site-u2023/aios/main/aios',
    'chmod +x /usr/bin/aios',
    'sh /usr/bin/aios'
].join(' && ');
const SSH_CMD_ENCODED_AIOS = encodeURIComponent(SSH_COMMANDS_AIOS);

// ── サービス定義データベース ──
const SERVICES = {
    luci: {
        name: 'LuCI',
        port: 80, // LuCiのデフォルトポートを80に指定
        path: '/cgi-bin/luci',
        protocol: 'http',
        i18nKey: 'luciAdmin'
    },
    ttyd: {
        name: 'ttyd',
        port: 7681,
        path: '/',
        protocol: 'http',
        i18nKey: 'ttydTerminal'
    },
    filebrowser: {
        name: 'filebrowser',
        port: 8080,
        path: '/',
        protocol: 'http',
        i18nKey: 'filebrowserService'
    },
    adguard: {
        name: 'AdGuard Home',
        port: 3000,
        path: '/',
        protocol: 'http',
        i18nKey: 'adguardService'
    },
    custom: {
        name: 'Custom',
        port: null,
        path: '/',
        protocol: 'http',
        i18nKey: 'customService'
    }
};

// ── 言語切替機能データ（サービス追加） ──
const langData = {
    en: {
        deviceIP: 'Device Settings',
        update: 'Update',
        qrCodeDisplay: 'QR Code',
        qrCodeArea: 'QR Code Display Area',
        terminal: 'Terminal (for Windows)',
        sshHandler: 'Protocol handler registration (first-time use)',
        downloadHandlerButton: 'Download (Double-click sshcmd.reg to install)',
        sshConnection: 'SSH Connection: ',
        aiosExecution: 'Execute aios: ',
        console: 'Web Console',
        luciAdmin: 'LuCI: ',
        ttydTerminal: 'ttyd: ',
        filebrowserService: 'filebrowser: ',
        adguardService: 'AdGuard Home: ',
        customService: 'Custom: ',
        githubRepo: 'GitHub Repository',
        aiosScript: 'all in one script',
        configSoftware: 'config software (legacy)',
        footerMemo: 'OpenWrt A Beginner\'s Notebook',
        footerSiteU: 'site-u',
        footerDisclaimer: 'Disclaimer',
        disclaimerPageTitle: 'Disclaimer',
        disclaimerSiteUTitle: 'Disclaimer regarding site-u (this site)',
        disclaimerSiteUParagraph: 'All content (including websites, scripts, and other works) published on this site is open and freely available for use. However, the operators of this site assume no responsibility for any damages incurred through the use of this content. Please use it at your own risk.',
        disclaimerOpenWrtTitle: 'Disclaimer regarding OpenWrt',
        disclaimerOpenWrtParagraph: 'OpenWrt is a registered trademark of Software Freedom Conservancy. This site is not affiliated with or endorsed by the OpenWrt project. For official information and support regarding OpenWrt, please refer to the ',
        openWrtOfficialSite: 'OpenWrt official website',
        disclaimerOpenWrtSuffix: '.',
        langEn: 'English',
        langJa: '日本語'       
    },
    ja: {
        deviceIP: 'デバイス設定',
        update: '更新',
        qrCodeDisplay: 'QRコード',
        qrCodeArea: 'QRコード表示エリア', 
        terminal: 'ターミナル (Windows用)',
        sshHandler: 'プロトコルハンドラー登録 (初回のみ)',
        downloadHandlerButton: 'ダウンロード (sshcmd.reg をダブルクリックしてインストールしてください)',
        sshConnection: 'SSH接続: ',
        aiosExecution: 'aios実行: ',
        console: 'Webコンソール',
        luciAdmin: 'LuCI: ',
        ttydTerminal: 'ttyd: ',
        filebrowserService: 'filebrowser: ',
        adguardService: 'AdGuard Home: ',
        customService: 'カスタム: ',
        githubRepo: 'GitHubリポジトリ',
        aiosScript: 'オールインワンスクリプト',
        configSoftware: 'コンフォグソフトウェア (旧版)',
        footerMemo: 'OpenWrt初心者備忘録',
        footerSiteU: 'site-u',
        footerDisclaimer: '免責事項',
        disclaimerPageTitle: '免責事項',
        disclaimerSiteUTitle: 'site-u（当サイト）に関する免責事項',
        disclaimerSiteUParagraph: '当サイトで公開されているコンテンツ（ウェブサイト、スクリプト、その他の著作物を含む）は全てオープンであり、自由にご利用いただけます。しかしながら、これらのコンテンツの利用によって生じたいかなる損害についても、当サイトの運営者は一切の責任を負いません。利用者の皆様の責任においてご利用くださいますようお願いいたします。',
        disclaimerOpenWrtTitle: 'OpenWrtに関する免責事項',
        disclaimerOpenWrtParagraph: 'OpenWrtはSoftware Freedom Conservancyの登録商標です。当サイトはOpenWrtプロジェクトとは提携しておらず、また推奨もされていません。OpenWrtに関する公式情報やサポートについては、',
        openWrtOfficialSite: 'OpenWrt公式サイト',
        disclaimerOpenWrtSuffix: 'をご参照ください。',
        langEn: 'English',
        langJa: '日本語'
    }
};

// ── drawQRCode 関数 ──
function drawQRCode(elementId, text) {
    const qrContainer = document.getElementById(elementId);
    if (!qrContainer || typeof QRious === 'undefined') {
        console.error(`QR code container #${elementId} not found or QRious library not loaded.`);
        if (qrContainer) {
            qrContainer.innerHTML = `<div style="width: 180px; height: 180px; background: var(--text-color); margin: 0 auto; display: flex; align-items: center; justify-content: center; color: var(--block-bg); font-size: 12px;"><span data-i18n="qrCodeArea">${langData[localStorage.getItem('lang-preference') || 'ja'].qrCodeArea}</span></div>`;
        }
        return;
    }
    qrContainer.innerHTML = '';
    const canvas = document.createElement('canvas');
    qrContainer.appendChild(canvas);

    const style = getComputedStyle(document.body);
    const darkColor = style.getPropertyValue('--qr-dark').trim();
    const lightColor = style.getPropertyValue('--qr-light').trim();

    new QRious({
        element: canvas,
        value: text,
        size: 180,
        foreground: darkColor,
        background: lightColor
    });
}

// ── 選択中サービスリンク生成関数 ──
function generateSelectedServiceLink() {
    const selectedServiceContainer = document.getElementById('selected-service-link');
    if (!selectedServiceContainer) return;

    selectedServiceContainer.innerHTML = ''; // リンク初期化

    const ipInput = document.getElementById('ip-input');
    const serviceSelector = document.getElementById('service-selector');
    const portInput = document.getElementById('port-input');
    
    if (!ipInput || !serviceSelector || !portInput) return;

    const ip = ipInput.value.trim() || ipInput.placeholder;
    const selectedServiceKey = serviceSelector.value;
    const port = portInput.value.trim();
    const currentLang = localStorage.getItem('lang-preference') || 'en';

    const service = SERVICES[selectedServiceKey];
    if (!service) return;

    const url = port
        ? `${service.protocol}://${ip}:${port}${service.path}`
        : `${service.protocol}://${ip}${service.path}`;
    
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'link-item bordered-element';
    a.setAttribute('data-service', selectedServiceKey);
    
    const linkText = document.createElement('span');
    linkText.className = 'link-text';
    linkText.textContent = langData[currentLang][service.i18nKey] || `${service.name}: `;
    
    const ipDisplay = document.createElement('span');
    ipDisplay.className = 'ip-display';
    ipDisplay.innerHTML = port
        ? `${service.protocol}://<span class="service-ip">${ip}</span>:<span class="service-port">${port}</span>`
        : `${service.protocol}://<span class="service-ip">${ip}</span>`;
    
    a.appendChild(linkText);
    a.appendChild(ipDisplay);
    selectedServiceContainer.appendChild(a);
}

// ── サービス選択変更処理 ──
function handleServiceChange() {
    const serviceSelector = document.getElementById('service-selector');
    const portInput = document.getElementById('port-input');
    
    if (!serviceSelector || !portInput) return;
    
    const selectedService = SERVICES[serviceSelector.value];
    if (!selectedService) return;
    
    portInput.value = selectedService.port || ''; // 選択されたサービスのポートを設定
    portInput.disabled = false; // 入力可能

    localStorage.setItem('site-u-service', serviceSelector.value);
    localStorage.setItem('site-u-port', portInput.value);
    
    generateSelectedServiceLink(); // サービスリンク更新
    updateQRCode(); // QRコード即時更新
}

// ── QRコード更新処理 ──
function updateQRCode() {
    const qrDetailContainer = document.getElementById('qrcode-detail-container');
    if (!qrDetailContainer || !qrDetailContainer.open) return;

    const ipInput = document.getElementById('ip-input');
    const serviceSelector = document.getElementById('service-selector');
    const portInput = document.getElementById('port-input');
    
    const ip = ipInput ? (ipInput.value.trim() || ipInput.placeholder) : '192.168.1.1';
    const port = portInput ? portInput.value.trim() : ''; // 空欄OK
    const selectedService = serviceSelector ? serviceSelector.value : 'luci';
    const service = SERVICES[selectedService];
    
    if (service) {
        const serviceUrl = port
            ? `${service.protocol}://${ip}:${port}${service.path}`
            : `${service.protocol}://${ip}${service.path}`;
        drawQRCode('qrcode-detail', serviceUrl);
    }
}

// ── 全リンク更新処理 ──
function updateAll() {
    const ipInput = document.getElementById('ip-input');
    const serviceSelector = document.getElementById('service-selector');
    const portInput = document.getElementById('port-input');
    
    if (!ipInput || !serviceSelector || !portInput) return;

    const ip = ipInput.value.trim() || ipInput.placeholder;
    const selectedService = serviceSelector.value;
    const port = portInput.value.trim();
    
    localStorage.setItem('site-u-ip', ip);
    localStorage.setItem('site-u-service', selectedService);
    localStorage.setItem('site-u-port', port);

    const sshIpSpan = document.getElementById('ssh-ip');
    const aiosIpSpan = document.getElementById('aios-ip');
    if (sshIpSpan) sshIpSpan.textContent = ip;
    if (aiosIpSpan) aiosIpSpan.textContent = ip;

    generateSelectedServiceLink(); // サービスリンク更新
    updateQRCode(); // QRコード更新
}

// ── DOMContentLoaded ──
document.addEventListener('DOMContentLoaded', () => {
    const ipInput = document.getElementById('ip-input');
    const serviceSelector = document.getElementById('service-selector');
    const portInput = document.getElementById('port-input');

    if (ipInput) {
        const storedIp = localStorage.getItem('site-u-ip');
        if (storedIp) ipInput.value = storedIp;
    }

    if (serviceSelector) {
        const storedService = localStorage.getItem('site-u-service');
        serviceSelector.value = storedService || 'luci'; // 初期値をLuCiに設定
    }

    if (portInput) {
        const storedPort = localStorage.getItem('site-u-port');
        if (storedPort) {
            portInput.value = storedPort;
        } else {
            const selectedService = SERVICES[serviceSelector?.value];
            if (selectedService && selectedService.port !== null) {
                portInput.value = selectedService.port;
            }
        }
    }

    if (ipInput) {
        ipInput.addEventListener('compositionstart', e => e.preventDefault());
        ipInput.addEventListener('keydown', e => {
            const isIPAllowedChar =
                (e.key.length === 1 && /[0-9a-zA-Z.:\-_]/.test(e.key)) ||
                ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Enter'].includes(e.key);
            if (!isIPAllowedChar) {
                e.preventDefault();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                updateAll();
            }
        });
        ipInput.addEventListener('input', updateAll);
    }

    if (portInput) {
        portInput.addEventListener('compositionstart', e => e.preventDefault());
        portInput.addEventListener('keydown', e => {
            const isNumericAllowedChar =
                (e.key.length === 1 && /[0-9]/.test(e.key)) ||
                ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Enter'].includes(e.key);
            if (!isNumericAllowedChar) {
                e.preventDefault();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                updateAll();
            }
        });
        portInput.addEventListener('input', updateAll);
    }

    if (serviceSelector) {
        serviceSelector.addEventListener('change', handleServiceChange);
    }

    handleServiceChange();
    updateAll();

    const qrDetailContainer = document.getElementById('qrcode-detail-container');
    if (qrDetailContainer && !qrDetailContainer.dataset.toggleListenerAdded) {
        qrDetailContainer.addEventListener('toggle', function() {
            updateQRCode();
        });
        qrDetailContainer.dataset.toggleListenerAdded = 'true';
    }
});
