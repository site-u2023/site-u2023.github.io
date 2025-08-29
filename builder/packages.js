async function loadPackageDb() {
  const res = await fetch('scripts/packages.json');
  const data = await res.json();
  applySearchUrls(data);
  return data;
}

let PACKAGE_DB = {};
loadPackageDb().then(db => {
  PACKAGE_DB = db;
});

// グローバル変数
let app = {
    versions: [],
    devices: [],
    selectedVersion: '',
    templateLoaded: false,
    availablePackages: [], // デバイス固有のパッケージリスト
    archPackagesMap: {},
};

// 公式と同じグローバル変数
let current_device = {};
        
// map.shのキャッシュ
let mapShCache = undefined;

