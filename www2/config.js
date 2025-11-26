<!DOCTYPE html>

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OpenWrt Firmware Selector</title>
    <link rel="icon" href="favicon.ico" />
    <link rel="stylesheet" href="index.css" />
    <link rel="stylesheet" href="custom.css" />
    <script src="config.js"></script>
    <script src="index.js"></script>
    <script src="custom.js" defer></script>

    <!-- リソースヒント -->
    <link rel="dns-prefetch" href="https://auto-config.site-u.workers.dev">
    <link rel="dns-prefetch" href="https://site-u.pages.dev">
    
  </head>
  <body onload="init()">
    <!-- header across the whole page -->
    <header>
      <div>
        <a href="https://openwrt.org">
          <img src="logo.svg" width="180" alt="Logo" />
        </a>
        <div style="flex-grow: 1"></div>
        <div>
          <select id="languages-select">
            <option value="ar">العربية (Arabic)</option>
            <option value="ast">Asturianu (Asturian)</option>
            <option value="bg">български (Bulgarian)</option>
            <option value="bn">বাংলা (Bengali)</option>
            <option value="ca">Català (Catalan)</option>
            <option value="cs">Čeština (Czech)</option>
            <option value="da">Dansk (Danish)</option>
            <option value="de">Deutsch (German)</option>
            <option value="el">Ελληνικά (Greek)</option>
            <option value="en">English</option>
            <option value="es">Español (Spanish)</option>
            <option value="fa">فارسی (Persian)</option>
            <option value="fi">Suomalainen (Finnish)</option>
            <option value="fil">Pilipino (Filipino)</option>
            <option value="fr">Français (French)</option>
            <option value="ga">Gaeilge (Irish)</option>
            <option value="gl">Galego (Galician)</option>
            <option value="hi">हिंदी (Hindi)</option>
            <option value="hu">Magyar (Hungarian)</option>
            <option value="id">Bahasa Indonesia (Indonesian)</option>
            <option value="it">Italiano (Italian)</option>
            <option value="ja">日本 (Japanese)</option>
            <option value="ka">ქართული (Georgian)</option>
            <option value="ko">한국어 (Korean)</option>
            <option value="lt">Lietuvių (Lithuanian)</option>
            <option value="lv">Latviešu (Latvian)</option>
            <option value="ml">മലയാളം (Malayalam)</option>
            <option value="mr">मराठी (Marathi)</option>
            <option value="no">Norsk (Norwegian)</option>
            <option value="pl">Polski (Polish)</option>
            <option value="pt">Português (Portuguese)</option>
            <option value="pt-br">Português do Brasil (Brazilian Portuguese)</option>
            <option value="ro">Română (Romanian)</option>
            <option value="ru">Русский (Russian)</option>
            <option value="sgs">Žemaitiu kalba (Samogitian)</option>
            <option value="sr_Cyrl">Српски (Serbian)</option>
            <option value="sr_Latn">Srpski (Serbian)</option>
            <option value="sk">Slovenčina (Slovak)</option>
            <option value="sv">Svenska (Swedish)</option>
            <option value="ta">தமிழ் (Tamil)</option>
            <option value="te">తెలుగు (Telugu)</option>
            <option value="tr">Türkçe (Turkish)</option>
            <option value="uk">Українська (Ukrainian)</option>
            <option value="vi">Tiếng Việt (Vietnamese)</option>
            <option value="zh-cn">简体中文 (Chinese Simplified)</option>
            <option value="zh-tw">繁體中文 (Chinese Traditional)</option>
          </select>
          <button id="languages-button"></button>
        </div>
      </div>
    </header>

    <!-- Settings Bar -->
    <div id="settings-bar">
      <div class="settings-bar-content">
        <div class="left-section">
          <div id="asu-status-container" class="asu-status">
            <span id="asu-status-indicator" class="status-indicator status-checking">●</span>
            <span id="asu-status-text" class="status-text tr-asu-status-checking">Checking...</span>
          </div>
          <div id="custom-build-badge" class="custom-build-badge">
            <span class="badge-icon">🔧</span>
            <span class="badge-text tr-custom-build-label">Custom Build (Unofficial)</span>
          </div>
        </div>
        <div class="right-section">
          <button id="import-settings-btn" class="settings-btn" title="Import Settings">
            📥 <span class="tr-import-settings">Import</span>
          </button>
          <button id="export-settings-btn" class="settings-btn" title="Export Settings">
            📤 <span class="tr-export-settings">Export</span>
          </button>
        </div>
      </div>
    </div>
    <input type="file" id="import-file-input" accept=".txt,.ini" style="display: none;">

    <div id="alert" class="hide"></div>

    <div class="container">
      <div>
        <h2 class="tr-load">Download OpenWrt Firmware for your Device</h2>
        <p class="tr-message">
          Type the name or model of your device, then select a stable build or
          the nightly "snapshot" build.
        </p>

        <!-- Model name and Build dropdown -->
        <div id="models-autocomplete" class="autocomplete">
          <input
            id="models"
            type="text"
            class="tr-model"
            placeholder="Model"
            spellcheck="false"
            autocapitalize="off"
            autofocus
          />
          <select id="versions" size="1"></select>
        </div>

        <div id="notfound" class="hide">
          <h3 class="tr-not-found">No model found!</h3>
        </div>

        <div id="images" class="hide">
          <!-- static information about the selected build -->
          <div>
            <h3 id="build-title" class="tr-version-build">About this build</h3>
            <div class="row">
              <div class="col1 tr-model">Model</div>
              <div class="col2" id="image-model"></div>
            </div>
            <div class="row">
              <div class="col1 tr-target">Target</div>
              <div class="col2" id="image-target"></div>
            </div>
            <div class="row">
              <div class="col1 tr-version">Version</div>
              <div class="col2">
                <span id="image-version"></span> (<span id="image-code"></span>)
              </div>
            </div>
            <div class="row">
              <div class="col1 tr-date">Date</div>
              <div class="col2" id="image-date"></div>
            </div>
            <div class="row">
              <div class="col1 tr-links">Links</div>
              <div class="col2">
                <a id="image-folder" href="#"></a>
                <a id="image-info" href="#"></a>
                <a id="image-link" href="#"></a>
              </div>
            </div>
            <div class="row">
              <details id="asu" class="hide" style="width: 100%">
                <summary>
                  <span class="tr-customize">Customize installed packages and/or first boot script</span>
                </summary>

                <!-- Packages Section -->
                <details id="packages-details">
                  <summary>
                    <h3 class="tr-custom-packages">Installed Packages</h3>
                  </summary>
                  <div id="package-selector-config">
                    <div class="package-search-container config-section">
                      <h4><span class="tr-package-search">Package Search</span></h4>
                      <div id="package-search-autocomplete" class="autocomplete">
                        <input type="text"
                          id="package-search"
                          placeholder="Type package name"
                          autocomplete="off"
                          spellcheck="false"
                          autocapitalize="off">
                      </div>
                    </div>
                    
                    <div id="package-categories">
                      <!-- packages.jsonから動的に生成される -->
                    </div>
                    
                    <details id="postinst-details" class="config-section">
                      <summary>
                        <h4 class="tr-postinst">Post-Install (Package installation script)</h4>
                        <div id="postinst-additional-info" class="additional-package-info">
                          <span id="package-size-breakdown"></span>
                          <br>
                          <span id="package-size-note" class="file-size-note tr-package-size-note"></span>
                        </div>
                      </summary> 
                      <textarea
                        id="asu-packages"
                        autocomplete="off"
                        spellcheck="false"
                        autocapitalize="off"
                      ></textarea>
                    </details>
                  </div>
                </details>

                <!-- Scripts Section -->
                <details id="scripts-details">
                  <summary>
                    <h3 class="tr-custom-defaults">Script to run on first boot (uci-defaults)</h3>
                  </summary>
                  <div id="scripts-config">
                    <div class="commands-container config-section">
                      <h4><span class="tr-add-commands">Add commands</span></h4>
                      <div id="commands-autocomplete" class="autocomplete">
                        <input type="text"
                          id="command"
                          placeholder="Type commands"
                          autocomplete="off"
                          spellcheck="false"
                          autocapitalize="off">
                      </div>
                    </div>
                    
                    <div id="dynamic-config-sections">
                      <!-- setup.jsonから動的に生成される -->
                    </div>

                    <details id="uci-defaults-details" class="config-section">
                      <summary>
                        <h4 class="tr-uci">UCI-defaults (Boot configuration script)</h4>
                        <div id="uci-defaults-size-info" class="file-size-info">
                          <span id="uci-defaults-size"></span>
                          <br>
                          <span id="uci-size-limit" class="file-size-note tr-uci-size-limit"></span>
                        </div>
                      </summary>
                      <div id="uci-defaults-group">
                        <textarea
                          id="uci-defaults-content"
                          autocomplete="off"
                          spellcheck="false"
                          autocapitalize="off"
                        ></textarea>
                      </div>
                    </details>
                  </div>
                </details>

                <!-- Build Status & Button -->
                <br>
                <div id="asu-buildstatus" class="hide">
                  <span></span>
                  <div id="asu-log" class="hide">
                    <details>
                      <summary>
                        <code>STDERR</code>
                      </summary>
                      <pre id="asu-stderr"></pre>
                    </details>
                    <details>
                      <summary>
                        <code>STDOUT</code>
                      </summary>
                      <pre id="asu-stdout"></pre>
                    </details>
                  </div>
                </div>
                <a href="javascript:buildAsuRequest()" class="custom-link">
                  <span></span><span class="tr-request-build">REQUEST BUILD</span>
                </a>

              </details>
            </div>
          </div>

          <div id="downloads1">
            <h3 class="tr-downloads">Download an image</h3>
            <table id="download-table1"></table>
          </div>

          <div id="downloads2" style="display: none">
            <h3 class="tr-downloads">Download an image</h3>
            <div id="download-links2"></div>
            <div id="download-extras2"></div>
          </div>
        </div>

        <div id="footer">
          <span
            ><a href="https://downloads.openwrt.org" class="tr-server-link"
              >All Downloads</a
            ></span
          >
          |
          <span
            >
              href="https://forum.openwrt.org/t/the-openwrt-firmware-selector/81721"
              class="tr-feedback-link"
              >Feedback</a
            ></span
          >
          |
          <span
            ><a href="https://github.com/openwrt/firmware-selector-openwrt-org/"
              >OFS <span id="ofs-version">0.0.0</span></a
            ></span
          >
        </div>
      </div>
    </div>
  </body>
</html>
