/* exported config */

var config = {
  // Show help text for images
  show_help: true,

  // Versions list (optional if provided by .versions.json)
  versions: [],

  // Pre-selected version (optional if provided by .versions.json)
  default_version: "",

  // Image download URL (e.g. "https://downloads.openwrt.org")
  image_url: "https://downloads.openwrt.org",

  // Insert snapshot versions (optional)
  //show_snapshots: true,

  // Info link URL (optional)
  info_url: "https://openwrt.org/start?q={title}&do=search",

  // Attended Sysupgrade Server support (optional)
  asu_url: "https://sysupgrade.openwrt.org",
  asu_extra_packages: ["luci"],

  // 最小サポートバージョン（任意）
  min_version: "21.02.0"
};
