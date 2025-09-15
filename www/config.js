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

  // opkg_search_url: "https://openwrt.org/packages/pkgdata/{pkg}"
  
  // LuCI OPKG 検索エンドポイント
  // https://downloads.openwrt.org/releases/24.10.2/packages/aarch64_cortex-a53/packages/Packages
  // opkg_search_url: "https://downloads.openwrt.org/releases/{version}/packages/{arch}/{feed}/Packages",
  opkg_search_url: "https://downloads.openwrt.org/releases/{version}/packages/{arch}/{feed}/Packages",
  
  // LuCI APK 検索エンドポイント
  // https://downloads.openwrt.org/snapshots/packages/aarch64_cortex-a53/packages/index.json
  // apk_search_url: "https://downloads.openwrt.org/snapshots/packages/{arch}/{feed}/index.json",
  apk_search_url: "https://downloads.openwrt.org/snapshots/packages/{arch}/{feed}/index.json",

  // kmods 検索エンドポイント（OPKG用: リリース版）
  // 例: https://downloads.openwrt.org/releases/24.10.2/targets/mediatek/filogic/kmods/5.15.137-1-xxxxxxxx/Packages
  // kmods_opkg_search_url: "https://downloads.openwrt.org/releases/{version}/packages/{arch}/kmods/{kmod}/Packages",
  // kmods_opkg_index_url: "https://downloads.openwrt.org/releases/{version}/targets/{version}/kmods/",
  kmods_opkg_index_url:  "https://downloads.openwrt.org/releases/{version}/targets/{vendor}/{subtarget}/kmods/",
  kmods_opkg_search_url: "https://downloads.openwrt.org/releases/{version}/targets/{vendor}/{subtarget}/kmods/{kmod}/Packages",
  
  // kmods 検索エンドポイント（APK用: SNAPSHOT版）
  // 例: https://downloads.openwrt.org/snapshots/targets/mediatek/filogic/kmods/5.15.137-1-xxxxxxxx/index.json
  // kmods_apk_search_url: "https://downloads.openwrt.org/snapshots/packages/{arch}/kmods/{kmod}/index.json",
  // kmods_apk_index_url: "https://downloads.openwrt.org/snapshots/targets/{version}/kmods/",
  kmods_apk_index_url:   "https://downloads.openwrt.org/snapshots/targets/{vendor}/{subtarget}/kmods/",
  kmods_apk_search_url:  "https://downloads.openwrt.org/snapshots/targets/{vendor}/{subtarget}/kmods/{kmod}/index.json", 
  
  // デバイス言語
  device_language: "",
    
  // フォールバック言語（重要！）
  fallback_language: "en"
};

// Language
current_language = "en";

// OFSバージョン
const custom_ofs_version = "v5.1.0-json-driven";
const custom_ofs_url = "https://github.com/site-u2023/site-u2023.github.io/tree/main/www";

// カスタム機能の自動読み込み
(function() {
  // custom.jsを動的に読み込み
  const customScript = document.createElement('script');
  customScript.src = 'custom.js';
  document.head.appendChild(customScript);
  
  // custom.cssを動的に読み込み
  const customCSS = document.createElement('link');
  customCSS.rel = 'stylesheet';
  customCSS.href = 'custom.css';
  document.head.appendChild(customCSS);
})();
