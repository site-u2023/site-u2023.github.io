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
      updateAll(); // テーマ変更に伴いQRコードの色も更新されるように再描画を促す
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

    // 既存のcanvas要素があれば削除
    // QRCode.toCanvasは既存のcanvas要素を再利用するよりも、
    // 新しいcanvas要素に描画する方が確実な場合があるため、一旦削除して再生成
    let canvas = container.querySelector('canvas');
    if (canvas) {
      container.removeChild(canvas);
    }
    
    // 新しいcanvas要素を生成して追加
    canvas = document.createElement('canvas');
    container.appendChild(canvas);
    // CSSで設定されたサイズを適用するために、QRコードのCSSクラスを付与
    canvas.classList.add('qr-code-canvas-inner');

    if (window.QRCode) {
      QRCode.toCanvas(canvas, data, options)
        .then(() => {
          // 成功時の処理（必要であれば）
        })
        .catch(error => {
          console.error(`QRコード生成エラー (${containerId}):`, error);
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

    // #qrcode-main (IPアドレスの右横) からQRコードを削除/生成しない
    const qrMainContainer = document.getElementById('qrcode-main');
    if (qrMainContainer) {
      const existingCanvas = qrMainContainer.querySelector('canvas');
      if (existingCanvas) {
        qrMainContainer.removeChild(existingCanvas); // 存在すれば削除
      }
    }

    // QRコード（詳細）- details要素が開いている場合のみ描画
    const detailElement = document.querySelector('#terminal details');
    const qrDetailContainer = document.getElementById('qrcode-detail');

    if (detailElement && detailElement.open) {
      createAndDrawQrCode('qrcode-detail', `ssh://root@${ip}`, {
        color: { dark: darkColor, light: lightColor }
      });
    } else {
      // detailsが閉じている場合はQRコードを非表示（canvas要素を削除）
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

  // details要素の開閉イベントを監視してQRコードを再描画/削除
  document.querySelector('#terminal details')?.addEventListener('toggle', updateAll);

  // 初期描画
  updateAll();
});
