document.addEventListener('DOMContentLoaded', () => {
  // ── テーマ切替（auto / light / dark） ──
  (function(){
    const html    = document.documentElement;
    const buttons = document.querySelectorAll('.theme-selector button');
    const stored  = localStorage.getItem('site-u-theme') || 'auto';

    function applyTheme(pref) {
      const theme = pref === 'auto'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : pref;
      html.setAttribute('data-theme', theme);
      buttons.forEach(btn =>
        btn.classList.toggle('selected', btn.dataset.themePreference === pref)
      );
      localStorage.setItem('site-u-theme', pref);
      updateAll();
    }

    buttons.forEach(btn =>
      btn.addEventListener('click', () => applyTheme(btn.dataset.themePreference))
    );
    window.matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => {
        if ((localStorage.getItem('site-u-theme')||'auto')==='auto') {
          applyTheme('auto');
        }
      });
    applyTheme(stored);
  })();

  // ── 年表示 ──
  const yearEl = document.getElementById('current-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ── 全角→半角変換 ──
  function toHalfWidth(s){
    return s.replace(/[\uFF01-\uFF5E]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0)-0xFEE0)
    ).replace(/\u3000/g,' ');
  }

  // ── QRコード描画ヘルパー ──
  function drawQRCode(id, text){
    const el = document.getElementById(id);
    if (!el||!window.QRCode) return;
    el.innerHTML = '';
    const canvas = document.createElement('canvas');
    el.appendChild(canvas);
    const style      = getComputedStyle(document.body);
    const darkColor  = style.getPropertyValue('--qr-dark').trim();
    const lightColor = style.getPropertyValue('--qr-light').trim();
    QRCode.toCanvas(canvas, text, {
      color:{dark:darkColor,light:lightColor}
    }).catch(console.error);
  }

  // ── SSHでまとめて実行したいコマンド（&& 連結＋URLエンコード） ──
  const sshCommands = [
    'wget -O /usr/bin/aios https://raw.githubusercontent.com/site-u2023/aios/main/aios',
    'chmod +x /usr/bin/aios',
    'sh /usr/bin/aios'
  ].join(' && ');
  const sshCmdEncoded = encodeURIComponent(sshCommands);

  // ── 全リンク更新処理 ──
  function updateAll(){
    const input = document.getElementById('global-ip-input');
    if (!input) return;
    const ip = input.value.trim()||input.placeholder;

    // QRコード
    const detail = document.getElementById('qrcode-detail-container');
    if (detail){
      if (detail.open) drawQRCode('qrcode-detail',`ssh://root@${ip}`);
      if (!detail.dataset.toggleListenerAdded){
        detail.addEventListener('toggle',function(){
          this.open
            ? drawQRCode('qrcode-detail',`ssh://root@${ip}`)
            : (document.getElementById('qrcode-detail').innerHTML='');
        });
        detail.dataset.toggleListenerAdded = 'true';
      }
    }

    // ◆ SSHリンク：hrefだけ更新し、テキストは <span id="ssh-ip"> に任せる
    const sshLink = document.getElementById('ssh-link');
    if (sshLink){
      const url = sshLink.dataset.ipTemplate
        .replace('${ip}', ip)
        .replace('${cmd}', sshCmdEncoded);
      sshLink.href = url;
      document.getElementById('ssh-ip').textContent = ip;
    }

    // ◆ その他の link-ip：hrefのみ更新
    document.querySelectorAll('.link-ip').forEach(link=>{
      if (link.id==='ssh-link') return;
      const tpl = link.dataset.ipTemplate;
      if (!tpl) return;
      link.href = tpl.replace('${ip}', ip);
    });
  }

  // ── 入力全角→半角＋updateAll ──
  document.querySelectorAll('input[type="text"]').forEach(input=>{
    input.addEventListener('input',()=>{
      const pos = input.selectionStart;
      const v   = toHalfWidth(input.value);
      if (v!==input.value){
        input.value = v;
        input.setSelectionRange(pos,pos);
      }
      updateAll();
    });
  });

  // ── 更新ボタン・Enter で updateAll ──
  document.getElementById('global-ip-update')
    .addEventListener('click', updateAll);
  document.getElementById('global-ip-input')
    .addEventListener('keydown', e => {
      if (e.key==='Enter'){
        e.preventDefault();
        updateAll();
      }
    });

  // ── 初期描画 ──
  updateAll();
});
