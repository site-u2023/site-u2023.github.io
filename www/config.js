/* exported config */

var config = {
  // Show help text for images
  show_help: true,

  // Versions list (optional if provided by .versions.json)
  // 最新バージョンに更新
  // versions: ["24.10.0", "23.05.5"],

  // Pre-selected version (optional if provided by .versions.json)
  // default_version: "24.10.0",

  // Image download URL (e.g. "https://downloads.openwrt.org")
  image_url: "https://downloads.openwrt.org",

  // Insert snapshot versions (optional)
  // show_snapshots: false,
  show_snapshots: true,
    
  // Info link URL (optional)
  info_url: "https://openwrt.org/start?q={title}&do=search",
  
  // Package search URL (optional)
  package_url: "https://openwrt.org/start?do=search&q={id}",
  
  // Attended Sysupgrade Server support (optional)
  asu_url: "https://sysupgrade.openwrt.org",
  
  // asu_url: "https://sysupgrade.openwrt.org?_=" + Date.now(),
  asu_extra_packages: ["luci"],

  // 最小サポートバージョン（任意）
  min_version: "21.02.0",
  
  // Auto-configuration API URL
  auto_config_api_url: "https://auto-config.site-u.workers.dev/",
  
  // UCI-defaults setup.sh URL
  information_path: "auto-config/information.json",

  // Package database URL
  packages_db_path: "packages/packages.json",

  // setup.sh database URL
  setup_db_path: "uci-defaults/setup.json",

  // LuCI OPKG 検索エンドポイント
  // opkg_search_url: "https://openwrt.org/packages/pkgdata/{pkg}"
  // https://downloads.openwrt.org/releases/24.10.2/packages/aarch64_cortex-a53/packages/Packages
  opkg_search_url: "https://downloads.openwrt.org/releases/{version}/packages/{arch}/{feed}/Packages",
  
  // LuCI APK 検索エンドポイント
  // https://downloads.openwrt.org/snapshots/packages/aarch64_cortex-a53/packages/index.json
  apk_search_url: "https://downloads.openwrt.org/snapshots/packages/{arch}/{feed}/index.json",

// kmods 検索エンドポイント（kernel ABI hash を含む）
  kmods_search_url: "https://downloads.openwrt.org/releases/{version}/targets/{target}/{subtarget}/kmods/{kmod}/Packages",
  
  // フォールバック言語（重要！）
  fallback_language: "en"
};

// Language
current_language = "en";

// OFSバージョン
const custom_ofs_version = "v5.1.0-json-driven";
const custom_ofs_url = "https://github.com/site-u2023/site-u2023.github.io/tree/main/www";

// === Prefetch: auto-config ===
window.autoConfigPromise = (function () {
  const url = config.auto_config_api_url;
  if (!url) return Promise.resolve(null);
  return fetch(url, { cache: "no-store" })
    .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
    .then(data => {
      window.autoConfigData = data;
      window.dispatchEvent(new CustomEvent("auto-config-ready", { detail: data }));
      console.log("Auto-config data loaded:", data);
      return data;
    })
    .catch(err => { console.error("Auto-config fetch failed:", err); return null; });
})();

// === Prefetch: custom.html ===
window.customHtmlPromise = fetch("custom.html", { cache: "no-store" })
  .then(r => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
  .then(html => {
    window.customHtmlContent = html;
    window.dispatchEvent(new CustomEvent("custom-html-ready", { detail: html }));
    console.log("custom.html loaded");
    return html;
  })
  .catch(err => { console.error("custom.html fetch failed:", err); return null; });

// === Prefetch: information.json ===
window.informationPromise = fetch(config.information_path, { cache: "no-store" })
  .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
  .then(json => {
    window.informationData = json;
    window.dispatchEvent(new CustomEvent("information-ready", { detail: json }));
    console.log("information.json loaded");
    return json;
  })
  .catch(err => { console.error("information.json fetch failed:", err); return null; });

// === Prefetch: setup.json ===
window.setupJsonPromise = fetch(config.setup_db_path + "?t=" + Date.now(), { cache: "no-store" })
  .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
  .then(json => {
    window.setupJsonData = json;
    window.dispatchEvent(new CustomEvent("setup-json-ready", { detail: json }));
    console.log("setup.json loaded");
    return json;
  })
  .catch(err => { console.error("setup.json fetch failed:", err); return null; });

// === Prefetch: packages.json ===
window.packagesDbPromise = fetch(config.packages_db_path, { cache: "no-store" })
  .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
  .then(json => {
    window.packagesDbData = json;
    window.dispatchEvent(new CustomEvent("packages-db-ready", { detail: json }));
    console.log("packages.json loaded");
    return json;
  })
  .catch(err => { console.error("packages.json fetch failed:", err); return null; });

// === Load custom.js and custom.css ===
(function() {
  const customScript = document.createElement('script');
  customScript.src = 'custom.js';
  document.head.appendChild(customScript);

  const customCSS = document.createElement('link');
  customCSS.rel = 'stylesheet';
  customCSS.href = 'custom.css';
  document.head.appendChild(customCSS);
})(); 
