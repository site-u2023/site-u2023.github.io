/* exported config */
var config = {
  // Show help text for images
  show_help: true,
  
  // Versions list (optional if provided by .versions.json)
  // 最新バージョンに更新
  versions: ["24.10.0", "23.05.5"],
  
  // Pre-selected version (optional if provided by .versions.json)
  default_version: "24.10.0",
  
  // Image download URL - OpenWrt公式ダウンロードサイト
  image_url: "https://downloads.openwrt.org",
  
  // Insert snapshot versions (optional)
  show_snapshots: true,
  
  // Show upcoming version (optional)
  upcoming_version: true,
  
  // Info link URL (optional) - OpenWrtのTable of Hardware検索
  info_url: "https://openwrt.org/start?do=search&id=toh&q={title} @toh",
  
  // Attended Sysupgrade Server support (optional)
  // 公式ASUサーバー
  asu_url: "https://sysupgrade.openwrt.org",
  
  // ASU追加パッケージ
  asu_extra_packages: [
    "luci",
    "luci-ssl",
    "luci-app-opkg"
  ],
};
