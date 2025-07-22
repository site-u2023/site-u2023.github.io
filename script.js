document.addEventListener('DOMContentLoaded', () => {
  // テーマ切替（auto / light / dark）
  (function(){
    const html    = document.documentElement; // html要素を取得
    const buttons = document.querySelectorAll('.theme-selector button');
    const stored  = localStorage.getItem('site-u-theme') || 'auto';

    function applyTheme(pref) {
      const theme = pref === 'auto'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : pref;
      html.setAttribute('data-theme', theme); // html要素にdata-theme属性を設定
      buttons.forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.themePreference === pref);
      });
      localStorage.setItem('site-u-theme', pref);
      updateAll(); // テーマ変更に伴い再描画
    }

    buttons.forEach(btn => {
      btn.addEventListener('click', () => applyTheme(btn.dataset.themePreference));
    });

    // 初回適用
    applyTheme(stored);

    // システムテーマの変更を監視
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if ((localStorage.getItem('site-u-theme') || 'auto') === 'auto') {
        applyTheme('auto');
      }
    });
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

  /**
   * 指定されたコンテナ要素内にQRコードを生成して描画するヘルパー関数
   * @param {string} containerId QRコードを表示するdiv要素のID
   * @param {string} data QRコードにエンコードするデータ
   * @param {object} options QRCode.toCanvasに渡すオプション
   */
  function createAndDrawQrCode(containerId, data, options) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.warn(`QRコードコンテナが見つかりません: #${containerId}`);
      return;
    }

    // 既存のcanvas要素があれば削除して再生成
    let canvas = container.querySelector('canvas');
    if (canvas) {
      // スタイルを維持するために、canvasの内容をクリア
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    } else {
      canvas = document.createElement('canvas');
      container.appendChild(canvas);
      // CSSで設定されたサイズを適用するために、QRコードのCSSクラスを付与
      canvas.classList.add('qr-code-canvas-inner'); // 新しいクラスを追加
    }

    if (window.QRCode) {
      QRCode.toCanvas(canvas, data, options, function (error) {
        if (error) console.error(`QRコード生成エラー (${containerId}):`, error);
      });
    } else {
      console.warn('QRCodeライブラリがロードされていません。');
    }
  }

  // IP更新＋QR描画＋リンク反映
  function updateAll() {
    const input = document.getElementById('global-ip-input');
    if (!input) return;
    const ip = input.value.trim() || input.placeholder;

    const style      = getComputedStyle(document.body);
    const darkColor  = style.getPropertyValue('--qr-dark').trim();
    const lightColor = style.getPropertyValue('--qr-light').trim();

    // QRコード（メイン）- IPアドレスの右横には描画しないようにコメントアウト
    // createAndDrawQrCode('qrcode-main', `http://${ip}`, {
    //   color: { dark: darkColor, light: lightColor }
    // });
    // もし #qrcode-main に以前のQRコードが残っている可能性があれば、以下の行でクリア
    const qrMainContainer = document.getElementById('qrcode-main');
    if (qrMainContainer) {
      const existingCanvas = qrMainContainer.querySelector('canvas');
      if (existingCanvas) {
        qrMainContainer.removeChild(existingCanvas);
      }
    }


    // QRコード（詳細）- ここにのみ描画
    // details要素が開いている場合のみ描画するロジックを追加
    const detailElement = document.querySelector('#terminal details');
    if (detailElement && detailElement.open) {
      createAndDrawQrCode('qrcode-detail', `ssh://root@${ip}`, {
        color: { dark: darkColor, light: lightColor }
      });
    } else {
      // detailsが閉じている場合はQRコードを非表示（canvas要素を削除）
      const qrDetailContainer = document.getElementById('qrcode-detail');
      if (qrDetailContainer) {
        const existingCanvas = qrDetailContainer.querySelector('canvas');
        if (existingCanvas) {
          qrDetailContainer.removeChild(existingCanvas);
        }
      }
    }


    // IPベースのリンクを更新
    document.querySelectorAll('.link-ip').forEach(link => {
      const template = link.dataset.ipTemplate;
      if (template && template.includes('${ip}')) {
        const url = template.replace('${ip}', ip);
        link.href = url;
        link.textContent = url; // リンクのテキストもURLに更新
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
      const caret     = input.selectionStart;
      const converted = toHalfWidth(input.value);
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
      updateAll();
      e.preventDefault(); // Enterキーによるフォーム送信を防止
    }
  });

  // details要素の開閉イベントを監視してQRコードを再描画
  document.querySelector('#terminal details')?.addEventListener('toggle', updateAll);

  // 初期描画
  updateAll();
});
