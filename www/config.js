/* exported config */
var config = {
  // Show help text for images
  show_help: true,
  
  base_url: "https://site-u.pages.dev",
  base_path: "www",
  
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
  min_version: "23.05.0",

  // Auto-configuration API URL
  auto_config_api_url: "https://auto-config.site-u.workers.dev/",
  // auto-config.js database URL
  auto_config_json_path: "auto-config/auto-config.json",
  
  // Package manager configuration
  package_manager_config_path: "variables/package-manager.json",
  // packages.sh database URL
  packages_db_path: "post-install/postinst.json",
  // packages.sh template URL
  postinst_template_path: "post-install/postinst.sh",
  // setup.sh database URL
  setup_db_path: "uci-defaults/setup.json",
  // setup.sh template URL
  setup_template_path: "uci-defaults/setup.sh",
  setup_template_path_aios: "uci-defaults/setup.sh", 
  // Language file path template
  language_path_template: "langs/custom.{lang}.json",
  
  // Custom feeds database URL
  customfeeds_db_path: "custom-feeds/customfeeds.json",

  // Custom scripts database URL
  customscripts_db_path: "custom-scripts/customscripts.json",

  // UI modules paths
  whiptail_ui_path: "aios2-whiptail.sh",
  simple_ui_path: "aios2-simple.sh",

  whiptail_fallback_path: "whiptail",
  
  // デバイス言語
  device_language: "",
    
  // フォールバック言語
  fallback_language: "en"
};
// OFSリンク
const custom_ofs_version = "site-u2023.github.io"; 
const custom_ofs_link    = "https://github.com/site-u2023/site-u2023.github.io";
// フィードバックリンク
const custom_feedback_text = "Forum";
const custom_feedback_link = "https://forum.openwrt.org/t/builder-custom-firmware-selector-openwrt-org";
