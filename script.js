// ── updateAll 関数（QRコード動的化対応） ──
function updateAll() {
    const ipInput = document.getElementById('ip-input');
    const serviceSelector = document.getElementById('service-selector');
    const portInput = document.getElementById('port-input');
    
    if (!ipInput || !serviceSelector || !portInput) return;

    const ip = ipInput.value.trim() || ipInput.placeholder;
    const selectedService = serviceSelector.value;
    const port = portInput.value.trim() || portInput.placeholder;
    
    // localStorageに保存
    localStorage.setItem('site-u-ip', ip);
    localStorage.setItem('site-u-service', selectedService);
    localStorage.setItem('site-u-port', port);

    // SSH関連のIP表示を更新
    const sshIpSpan = document.getElementById('ssh-ip');
    const aiosIpSpan = document.getElementById('aios-ip');
    if (sshIpSpan) sshIpSpan.textContent = ip;
    if (aiosIpSpan) aiosIpSpan.textContent = ip;

    // 選択されたサービスのリンクを更新
    generateSelectedServiceLink();

    // 既存のSSHリンクを更新
    document.querySelectorAll('a[data-ip-template]').forEach(link => {
        const template = link.dataset.ipTemplate;
        if (template) {
            let newHref = template.replace(/\${ip}/g, ip);
            if (link.id === 'aios-link') {
                newHref = newHref.replace(/\${cmd}/g, SSH_CMD_ENCODED_AIOS);
            }
            link.href = newHref;
        }
    });

    // QRコード更新（選択中サービスのURLに変更）
    const qrDetailContainer = document.getElementById('qrcode-detail-container');
    if (qrDetailContainer && qrDetailContainer.open) {
        const service = SERVICES[selectedService];
        if (service) {
            const serviceUrl = `${service.protocol}://${ip}:${port}${service.path}`;
            drawQRCode('qrcode-detail', serviceUrl);
        }
    }
}
