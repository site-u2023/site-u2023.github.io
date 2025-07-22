document.addEventListener('DOMContentLoaded', () => {
  // テーマ切替（auto / light / dark）
  (function(){
    const html    = document.documentElement;
    const buttons = document.querySelectorAll('.theme-selector button');
    const stored  = localStorage.getItem('site-u-theme') || 'auto';

    function applyTheme(pref) {
      const theme = pref === 'auto'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : pref;
      html.setAttribute('data-theme', theme);
      buttons.forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.themePreference === pref);
      });
      localStorage.setItem('site-u-theme', pref);
      updateAll(); // テーマ変更に伴い再描画
    }

    buttons.forEach(btn => {
      btn.addEventListener('click', () => applyTheme(btn.dataset.themePreference));
    });

    // システムテーマ変更を監視（追加）
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if ((localStorage.getItem('site-u-theme') || 'auto') === 'auto') {
        applyTheme('auto'); // auto設定ならシステムテーマに合わせて更新
      }
    });

    applyTheme(stored);
  })();

  // 年表示
  const yearEl = document.getElementById('current-year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // 全角 → 半角変換ユーティリティ
  function toHalfWidth(str) {
    return str
      .replace(/[\uFF01-\uFF5E]/g, ch =>
        String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
      )
      .replace(/\u3000/g, ' ');
  }

  // QRコード描画ヘルパー関数（再生成ロジックを追加）
  function drawQRCode(elementId, text) {
    const qrContainer = document.getElementById(elementId);
    if (!qrContainer || !window.QRCode) {
      // console.error(`QR Code container ${elementId} not found or QRCode library not loaded.`);
      return;
    }

    // 既存のコンテンツを全てクリアし、新しいcanvas要素を作成
    qrContainer.innerHTML = '';
    const canvas = document.createElement('canvas');
    qrContainer.appendChild(canvas);

    const style      = getComputedStyle(document.body);
    const darkColor  = style.getPropertyValue('--qr-dark').trim();
    const lightColor = style.getPropertyValue('--qr-light').trim();

    QRCode.toCanvas(canvas, text, {
      color: { dark: darkColor, light: lightColor }
    })
    .catch(err => {
      console.error(`Error drawing QR Code for ${elementId}:`, err);
    });
  }

  // IP更新＋QR描画＋リンク反映
  function updateAll() {
    const input = document.getElementById('global-ip-input');
    if (!input) return;
    const ip = input.value.trim() || input.placeholder;

    // QRコード（メイン）- 削除済みなので、ここでは何もしません
    // const qrMain = document.getElementById('qrcode-main');
    // if (qrMain && window.QRCode) {
    //   QRCode.toCanvas(qrMain, `http://${ip}`, {
    //     color: { dark: darkColor, light: lightColor }
    //   });
    // }

    // QRコード（詳細）- detailsタグが開かれたときにのみ描画する
    const detailContainer = document.getElementById('qrcode-detail-container'); // index.htmlにIDを追加します
    if (detailContainer) {
        // detailsが開かれたときに描画し、閉じたらクリア
        // toggleイベントは開閉両方で発火するので、openプロパティで判断
        detailContainer.removeEventListener('toggle', handleDetailToggle); // 既存のリスナーを一度削除
        detailContainer.addEventListener('toggle', handleDetailToggle); // 新しいリスナーを追加

        // ページロード時に既に開かれている場合も描画
        if (detailContainer.open) {
            drawQRCode('qrcode-detail', `ssh://root@${ip}`);
        }
    }

    // detailsの開閉をハンドリングする関数
    function handleDetailToggle() {
        if (this.open) { // detailsが開かれたら
            drawQRCode('qrcode-detail', `ssh://root@${ip}`);
        } else { // detailsが閉じたら、QRコードをクリア
            const qrDetail = document.getElementById('qrcode-detail');
            if (qrDetail) {
                qrDetail.innerHTML = ''; // 中身を空にする
            }
        }
    }


    // IPベースのリンクを更新
    document.querySelectorAll('.link-ip').forEach(link => {
      const template = link.dataset.ipTemplate;
      if (template && template.includes('${ip}')) {
        const url = template.replace('${ip}', ip);
        link.href = url;
        link.textContent = url;
      }
    });

    // SSHリンク内の表示IP
    const sshText = document.getElementById('ssh-ip');
    if (sshText) {
      sshText.textContent = ip;
    }
  }

  // 入力欄全体に半角変換適用＋updateAll連動
  document.querySelectorAll('input[type="text"]').forEach(input => {
    input.addEventListener('input', () => {
      const caret       = input.selectionStart;
      const converted   = toHalfWidth(input.value);
      if (input.value !== converted) {
        input.value = converted;
        input.setSelectionRange(caret, caret); // カーソル保持
      }
      updateAll(); // 即時反映
    });
  });

  // 更新ボタン・Enter で updateAll
  document.getElementById('global-ip-update')?.addEventListener('click', updateAll);
  document.getElementById('global-ip-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault(); // Enterキーによるフォーム送信を防止
        updateAll();
    }
  });

  // 初期描画
  updateAll();
});
