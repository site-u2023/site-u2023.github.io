<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OpenWrt Firmware Selector</title>
    <link rel="icon" href="favicon.ico" />
    <link rel="stylesheet" href="index.css" />
    <link rel="stylesheet" href="advanced.css">
    <script src="config.js"></script>
    <script src="index.js"></script>
    <!-- advanced.jsはindex.jsの後に読み込む -->
    <script src="advanced.js" defer></script>
  </head>
  <body onload="init()">
    <!-- 既存のヘッダー部分はそのまま -->
    <header>
      <!-- 省略 -->
    </header>

    <div id="alert" class="hide"></div>

    <div class="container">
      <div>
        <!-- 既存の上部セクション -->
        <h2 class="tr-load">Download OpenWrt Firmware for your Device</h2>
        <!-- 省略 -->

        <!-- デバイス情報表示エリア -->
        <div id="info" class="hide">
          <!-- Device info will be dynamically generated -->
        </div>

        <!-- イメージ表示エリア -->
        <div id="images" class="hide">
          <!-- Device images will be shown here -->
        </div>

        <!-- パッケージ設定エリア（重要：IDを確認） -->
        <div id="packages" class="hide">
          <details id="asu" class="hide" style="width: 100%">
            <summary>
              <span class="tr-customize">
                Customize installed packages and/or first boot script
              </span>
            </summary>

            <!-- ビルドステータス -->
            <div id="asu-buildstatus" class="hide">
              <span></span>
              <div id="asu-log" class="hide">
                <details>
                  <summary><code>STDERR</code></summary>
                  <pre id="asu-stderr"></pre>
                </details>
                <details>
                  <summary><code>STDOUT</code></summary>
                  <pre id="asu-stdout"></pre>
                </details>
              </div>
            </div>

            <!-- パッケージセレクターセクション -->
            <div class="aios-section">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" id="use-package-selector">
                <label class="form-check-label" for="use-package-selector">
                  Installed Packages
                </label>
              </div>

              <div id="package-selector-config" class="aios-config">
                <small class="text-muted">Select additional packages to install.</small>
                
                <div id="package-categories">
                  <!-- カテゴリーとパッケージは動的に生成される -->
                </div>
                
                <div class="form-group" style="margin-top: 1.5rem;">
                  <label for="asu-packages">Packages</label>
                  <textarea id="asu-packages" class="form-control" rows="6" 
                           autocomplete="off" spellcheck="false" autocapitalize="off"></textarea>
                </div>
              </div>
            </div>

            <!-- setup.sh設定セクション（index3.htmlから移植） -->
            <div class="aios-section">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" id="use-aios-config">
                <label class="form-check-label" for="use-aios-config">
                  Script to run on first boot (uci-defaults)
                </label>
              </div>

              <div id="aios-config" class="aios-config">
                <h5>Basic Configuration</h5>
                
                <!-- 基本設定フィールド（index3.htmlから） -->
                <div class="form-row">
                  <div class="form-group">
                    <label for="aios-language">Language</label>
                    <select id="aios-language" class="form-control">
                      <option value="en">English</option>
                      <option value="ja">日本語 (Japanese)</option>
                      <!-- 他の言語オプション -->
                    </select>
                  </div>
                  <div class="form-group">
                    <label for="aios-country">Country</label>
                    <input type="text" id="aios-country" class="form-control" placeholder="US" maxlength="2">
                  </div>
                </div>

                <!-- 他の設定フィールドも同様に配置 -->
                <!-- 省略（index3.htmlの内容をそのまま使用） -->

                <!-- ISP検出表示 -->
                <div class="form-group">
                  <label>ISP Detection Status</label>
                  <div id="isp-info-display" class="info">
                    <div id="isp-status-message">ISP情報を取得中...</div>
                    <div id="isp-technical-info" style="display: none;"></div>
                  </div>
                </div>

                <!-- uci-defaults content -->
                <div class="form-group" style="margin-top: 1.5rem;">
                  <label for="uci-defaults-content">Scripts</label>
                  <textarea id="uci-defaults-content" class="form-control" rows="6" 
                           autocomplete="off" spellcheck="false" autocapitalize="off"></textarea>
                </div>
              </div>
            </div>

            <!-- ビルドリクエストボタン -->
            <a href="javascript:buildAsuRequest()" class="custom-link" id="request-build">
              <span></span>
              <span class="tr-request-build">REQUEST BUILD</span>
            </a>
          </details>
        </div>

        <!-- プログレス表示 -->
        <div id="build-progress" class="build-progress">
          <div id="build-message">Building image...</div>
          <div class="progress">
            <div id="progress-bar" class="progress-bar" style="width: 0%"></div>
          </div>
        </div>

        <!-- ダウンロードリンク表示エリア -->
        <div id="download-links"></div>

        <!-- フッター -->
        <div id="footer">
          <!-- 既存のフッター内容 -->
        </div>
      </div>
    </div>
  </body>
</html>
