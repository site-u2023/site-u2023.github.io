document.addEventListener('DOMContentLoaded', () => {
  // ── SSHコマンド列（aios用）──
  const sshCommands = [
    'wget -O /usr/bin/aios https://raw.githubusercontent.com/site-u2023/aios/main/aios',
    'chmod +x /usr/bin/aios',
    'sh /usr/bin/aios'
  ].join(' && ');
  const sshCmdEncoded = encodeURIComponent(sshCommands);

  // ── テーマ切替（auto/light/dark）──
  (function(){
    const html    = document.documentElement;
    const btns    = document.querySelectorAll('.theme-selector button');
    const stored  = localStorage.getItem('site-u-theme') || 'auto';
    function applyTheme(pref) {
      const mode = pref === 'auto'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : pref;
      html.setAttribute('data-theme', mode);
      btns.forEach(b => b.classList.toggle('selected', b.dataset.themePreference === pref));
      localStorage.setItem('site-u-theme', pref);
      updateAll();
    }
    btns.forEach(b => b.addEventListener('click', () => applyTheme(b.dataset.themePreference)));
    window.matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => {
        if ((localStorage.getItem('site-u-theme')||'auto') === 'auto') applyTheme('auto');
      });
    applyTheme(stored);
  })();

  // 年表示
  const yearEl = document.getElementById('current-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // 全角→半角変換
  function toHalfWidth(str) {
    return str
      .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/\u3000/g, ' ');
  }

  // QRコード描画
  function drawQRCode(elementId, text) {
    const qrContainer = document.getElementById(elementId);
    if (!qrContainer || !window.QRCode) return;
    qrContainer.innerHTML = '';
    const canvas = document.createElement('canvas');
    qrContainer.appendChild(canvas);

    const style      = getComputedStyle(document.body);
    const darkColor  = style.getPropertyValue('--qr-dark').trim();
    const lightColor = style.getPropertyValue('--qr-light').trim();

    QRCode.toCanvas(canvas, text, {
      color: { dark: darkColor, light: lightColor }
    }).catch(() => {});
  }

  // 全リンク更新処理
  function updateAll() {
    const input = document.getElementById('global-ip-input');
    if (!input) return;
    const ip = input.value.trim() || input.placeholder;

    // QRコード（details開閉時も再描画）
    const detailContainer = document.getElementById('qrcode-detail-container');
    if (detailContainer) {
      if (detailContainer.open) drawQRCode('qrcode-detail', `ssh://root@${ip}`);
      if (!detailContainer.dataset.toggleListenerAdded) {
        detailContainer.addEventListener('toggle', function() {
          if (this.open) {
            drawQRCode('qrcode-detail', `ssh://root@${ip}`);
          } else {
            const qrDetail = document.getElementById('qrcode-detail');
            if (qrDetail) qrDetail.innerHTML = '';
          }
        });
        detailContainer.dataset.toggleListenerAdded = 'true';
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
      const v   = toHalfWidth(inp.value);
      if (v !== inp.value) {
        inp.value = v;
        inp.setSelectionRange(pos, pos);
      }
      updateAll();
    });
  });

  // 更新ボタン・Enterキーで updateAll
  document.getElementById('global-ip-update')?.addEventListener('click', updateAll);
  document.getElementById('global-ip-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      updateAll();
    }
  });

  // ── より確実なローカルIP取得処理 ──
  function detectLocalIP(callback) {
    console.log('Starting local IP detection...');
    
    const RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
    if (!RTCPeerConnection) {
      console.log('WebRTC not supported');
      return callback(null);
    }

    // 複数の方法を試す
    const methods = [
      // 方法1: Google STUN
      { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
      // 方法2: STUNなし（ローカルのみ）
      { iceServers: [] },
      // 方法3: 複数のSTUNサーバー
      { 
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ] 
      }
    ];

    let methodIndex = 0;
    let candidateFound = false;

    function tryMethod(config) {
      if (candidateFound || methodIndex >= methods.length) {
        if (!candidateFound) {
          console.log('❌ All methods failed');
          callback(null);
        }
        return;
      }

      console.log(`Trying method ${methodIndex + 1}:`, config);
      
      const rtc = new RTCPeerConnection(config);
      let candidateCount = 0;
      
      rtc.createDataChannel('test', { ordered: false, maxRetransmits: 0 });
      
      rtc.onicecandidate = event => {
        candidateCount++;
        
        if (candidateFound) return;
        
        if (event && event.candidate && event.candidate.candidate) {
          const candidateStr = event.candidate.candidate;
          console.log(`Method ${methodIndex + 1} - Candidate:`, candidateStr);
          
          // より広い範囲でIPを検索
          const ipMatches = candidateStr.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g);
          
          if (ipMatches) {
            for (const ip of ipMatches) {
              console.log('Found IP:', ip, 'Is private:', isPrivateIP(ip));
              if (isPrivateIP(ip)) {
                console.log('✓ Found valid private IP:', ip);
                candidateFound = true;
                rtc.close();
                callback(ip);
                return;
              }
            }
          }
        } else if (event && event.candidate === null) {
          console.log(`Method ${methodIndex + 1} - ICE gathering completed, candidates: ${candidateCount}`);
          rtc.close();
          
          // 次の方法を試す
          methodIndex++;
          setTimeout(() => tryMethod(methods[methodIndex]), 100);
        }
      };

      rtc.createOffer()
        .then(offer => rtc.setLocalDescription(offer))
        .catch(error => {
          console.log(`Method ${methodIndex + 1} - Error:`, error);
          rtc.close();
          methodIndex++;
          setTimeout(() => tryMethod(methods[methodIndex]), 100);
        });

      // 各方法に2秒のタイムアウト
      setTimeout(() => {
        if (!candidateFound) {
          console.log(`Method ${methodIndex + 1} - Timeout`);
          rtc.close();
          methodIndex++;
          tryMethod(methods[methodIndex]);
        }
      }, 2000);
    }

    // 最初の方法を開始
    tryMethod(methods[0]);
  }

  function isPrivateIP(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return false;
    
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    
    return false;
  }

  function guessRouterIP(localIP) {
    const segments = localIP.split('.');
    if (segments.length === 4) {
      segments[3] = '1'; // 第4オクテットを1に変更
      return segments.join('.');
    }
    return localIP;
  }

  const inputEl = document.getElementById('global-ip-input');
  if (inputEl && !inputEl.value.trim()) {
    detectLocalIP(function(localIP) {
      if (localIP) {
        inputEl.value = guessRouterIP(localIP);
      } else {
        inputEl.value = inputEl.placeholder;
      }
      updateAll();
    });
  }

  // 初回描画
  updateAll();
});
