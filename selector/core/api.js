// selector/core/api.js
// downloads.openwrt.org と auto-config API へのアクセス

const VERSIONS_URL = 'https://downloads.openwrt.org/.versions.json';

export async function fetchVersions() {
  const r = await fetch(VERSIONS_URL, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`fetchVersions: HTTP ${r.status}`);
  const data = await r.json();
  const versions = ['SNAPSHOT'].concat(data.versions_list || []);
  const selected = data.stable_version || (data.versions_list ? data.versions_list[0] : 'SNAPSHOT');
  return { versions, selected };
}

export async function fetchDevices(version) {
  const url = (version === 'SNAPSHOT')
    ? 'https://downloads.openwrt.org/snapshots/.overview.json'
    : `https://downloads.openwrt.org/releases/${version}/.overview.json`;
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`fetchDevices: HTTP ${r.status}`);
  const data = await r.json();
  return data.profiles || [];
}

export async function fetchProfile(version, target, id) {
  const url = (version === 'SNAPSHOT')
    ? `https://downloads.openwrt.org/snapshots/targets/${target}/profiles.json`
    : `https://downloads.openwrt.org/releases/${version}/targets/${target}/profiles.json`;
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`fetchProfile: HTTP ${r.status}`);
  const data = await r.json();
  const versionCode = data.version_code || '';
  const profile = data.profiles?.[id];
  const defaultPackages = data.default_packages || [];
  const devicePackages = profile?.device_packages || [];
  return { versionCode, profile, defaultPackages, devicePackages };
}

// auto-config (ISP 検出)
export async function fetchIspInfo() {
  const r = await fetch('https://auto-config.site-u.workers.dev/', {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });
  if (!r.ok) return null;
  return await r.json();
}
