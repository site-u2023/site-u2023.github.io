// selector/ui/form.js
// DOM バインドとイベントハンドラ。core/network/ui モジュールを連携。

import { getState, patch, resetSelection } from '../core/state.js';
import { fetchVersions, fetchDevices, fetchProfile, fetchIspInfo } from '../core/api.js';
import { loadPackagesDB, resolvePackages, addNetworkPackages } from '../core/packages.js';
import { loadTemplate, setScriptVar, embedMapSh, preloadMapScripts } from '../core/template.js';
import { decideProtocol } from '../network/net.wan.js';
import { updateGuaSectionVisibility } from './visibility.js';
import { buildAsuRequest, renderDownloadLinks } from './save.js';

let DB = null;               // packages DB
let TEMPLATE = '';           // setup.sh template

export async function init() {
  await preload();
  bindEvents();
  await initialIspFetch();
}

async function preload() {
  // Versions
  const { versions, selected } = await fetchVersions();
  patch({ versions, selectedVersion: selected });
  renderVersionSelect();

  // Devices for selected
  const devices = await fetchDevices(getState().selectedVersion);
  patch({ devices });

  // packages.json + template
  DB = await loadPackagesDB();
  TEMPLATE = await loadTemplate();

  // preload map.sh
  await preloadMapScripts();
}

function bindEvents() {
  document.getElementById('versions')?.addEventListener('change', onVersionChange);
  document.getElementById('models')?.addEventListener('input', onDeviceSearch);
  document.getElementById('use-aios-config')?.addEventListener('change', onToggleWizard);
  document.getElementById('use-package-selector')?.addEventListener('change', onToggleSelector);
  document.getElementById('request-build')?.addEventListener('click', onBuild);

  // Radio groups
  document.querySelectorAll('input[name="dsliteMode"]').forEach(r => r.addEventListener('change', applyConnectionChange));
  document.querySelectorAll('input[name="connectionMode"]').forEach(r => r.addEventListener('change', applyConnectionChange));
  document.querySelectorAll('input[name="connectionType"]').forEach(r => r.addEventListener('change', applyConnectionChange));
  document.querySelectorAll('input[name="mapeType"]').forEach(r => r.addEventListener('change', applyConnectionChange));

  // Wizard inputs
  const cfg = document.getElementById('aios-config');
  cfg?.addEventListener('input', () => document.getElementById('use-aios-config')?.checked && applyConnectionChange());
  cfg?.addEventListener('change', () => document.getElementById('use-aios-config')?.checked && applyConnectionChange());

  // Language affects i18n packages
  document.getElementById('aios-language')?.addEventListener('change', refreshPackagesOnly);
}

async function onVersionChange(e) {
  patch({ selectedVersion: e.target.value });
  resetSelection();
  hideDeviceInfo();
  const devices = await fetchDevices(getState().selectedVersion);
  patch({ devices });
}

function getDeviceTitle(d) {
  return (d.titles && d.titles.length > 0) ? (d.titles[0].title || d.id) : d.id;
}

function onDeviceSearch(e) {
  const q = e.target.value.toLowerCase();
  if (q.length < 2) return hideAutocomplete();

  const { devices } = getState();
  const matches = devices.filter(d => (getDeviceTitle(d).toLowerCase().includes(q) || d.id.toLowerCase().includes(q))).slice(0,10);
  showAutocomplete(matches);
}

function showAutocomplete(list) {
  const c = document.getElementById('models-autocomplete-list');
  c.innerHTML = '';
  if (!list.length) return hideAutocomplete();
  list.forEach(d => {
    const div = document.createElement('div');
    div.innerHTML = `<strong>${getDeviceTitle(d)}</strong><br><small>Target: ${d.target}</small>`;
    div.addEventListener('click', () => selectDevice(d));
    c.appendChild(div);
  });
  c.style.display = 'block';
}

function hideAutocomplete() {
  const c = document.getElementById('models-autocomplete-list');
  if (c) c.style.display = 'none';
}

async function selectDevice(device) {
  patch({ selectedDevice: device });
  document.getElementById('models').value = getDeviceTitle(device);

  const { selectedVersion } = getState();
  const { versionCode, profile, defaultPackages, devicePackages } = await fetchProfile(selectedVersion, device.target, device.id);
  patch({ versionCode });

  // 初期パッケージ（luci 付与）
  const all = [...defaultPackages, ...(devicePackages || []), 'luci'].filter(Boolean);
  document.getElementById('asu-packages').value = all.join(' ');

  renderDeviceInfo();

  // 初回テンプレ適用
  const txt = document.getElementById('uci-defaults-content');
  if (!txt.value || txt.value.trim() === '') {
    txt.value = TEMPLATE;
  }
}

function renderVersionSelect() {
  const sel = document.getElementById('versions');
  if (!sel) return;
  sel.innerHTML = '';
  const { versions, selectedVersion } = getState();
  versions.forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = v; if (v === selectedVersion) o.selected = true;
    sel.appendChild(o);
  });
}

function renderDeviceInfo() {
  const { selectedDevice, selectedVersion, versionCode } = getState();
  if (!selectedDevice) return;
  const fullVer = versionCode ? `${selectedVersion} (${versionCode})` : selectedVersion;

  const imageFolder = selectedVersion === 'SNAPSHOT'
    ? `https://downloads.openwrt.org/snapshots/targets/${selectedDevice.target}`
    : `https://downloads.openwrt.org/releases/${selectedVersion}/targets/${selectedDevice.target}`;

  const deviceLink = `${window.location.origin}${window.location.pathname}?version=${encodeURIComponent(selectedVersion)}&target=${encodeURIComponent(selectedDevice.target)}&id=${encodeURIComponent(selectedDevice.id)}`;
  const infoUrl = `https://openwrt.org/start?do=search&id=toh&q=${encodeURI(getDeviceTitle(selectedDevice))} @toh`;

  const infoHtml = `
    <h5>About this build</h5>
    <div class="row"><span class="col1">Model</span><span class="col2"><strong>${getDeviceTitle(selectedDevice)}</strong></span></div>
    <div class="row"><span class="col1">Platform</span><span class="col2">${selectedDevice.target}</span></div>
    <div class="row"><span class="col1">Version</span><span class="col2">${fullVer}</span></div>
    <div class="row">
      <span class="col1">Links</span>
      <span class="col2">
        <a id="image-folder" href="${imageFolder}" title="Browse image folder" target="_blank"></a>
        <a id="image-info" href="${infoUrl}" title="Device info" target="_blank"></a>
        <a id="image-link" href="#" title="Copy link" onclick="navigator.clipboard.writeText('${deviceLink}').then(() => alert('Link copied!')); return false;"></a>
      </span>
    </div>
  `;

  document.getElementById('info').innerHTML = infoHtml;
  document.getElementById('info').style.display = 'block';
  document.getElementById('packages').style.display = 'block';
  document.getElementById('request-build').style.display = 'inline-block';
}

function hideDeviceInfo() {
  document.getElementById('info').style.display = 'none';
  document.getElementById('packages').style.display = 'none';
  document.getElementById('request-build').style.display = 'none';
}

async function initialIspFetch() {
  displayIsp('Fetching', 'Retrieving ISP information...');
  const info = await fetchIspInfo().catch(() => null);
  patch({ apiInfo: info || null });
  renderIsp();
  applyConnectionChange();
}

function displayIsp(status, details) {
  const statusMessage = document.getElementById('isp-status-message');
  const technical = document.getElementById('isp-technical-info');
  if (statusMessage) statusMessage.textContent = status;
  if (technical) {
    if (details) { technical.innerHTML = details.replace(/\n/g, '<br>'); technical.style.display = 'block'; }
    else technical.style.display = 'none';
  }
}

function renderIsp() {
  const ai = getState().apiInfo;
  if (!ai) {
    displayIsp('Auto-detection failed', 'API connection error or unsupported ISP<br>Manual configuration required.');
    return;
  }

  let statusText = 'Auto-detection successful';
  let lines = [];
  if (ai.isp) lines.push(`ISP: ${ai.isp}`);
  if (ai.country) lines.push(`Country/Region: ${ai.country}${ai.regionName ? ` (${ai.regionName})` : ''}`);
  if (ai.timezone) lines.push(`Timezone: ${ai.timezone}`);

  if (ai.rule) {
    if (ai.rule.aftrType || ai.rule.aftrIpv6Address) {
      statusText += ' - DS-Lite support detected';
      lines.push('[DS-Lite Configuration]');
      lines.push(`aftrType: ${ai.rule.aftrType || ''}`);
      if (ai.rule.aftrIpv6Address) lines.push(`aftrIpv6Address: ${ai.rule.aftrIpv6Address}`);
    } else if (ai.rule.brIpv6Address) {
      statusText += ' - MAP-E support detected';
      lines.push('[MAP-E Configuration]');
      lines.push(`brIpv6Address: ${ai.rule.brIpv6Address}`);
      lines.push(`eaBitLength: ${ai.rule.eaBitLength}`);
      lines.push(`ipv4Prefix: ${ai.rule.ipv4Prefix}/${ai.rule.ipv4PrefixLength}`);
      lines.push(`ipv6Prefix: ${ai.rule.ipv6Prefix}/${ai.rule.ipv6PrefixLength}`);
      lines.push(`psIdOffset: ${ai.rule.psIdOffset}`);
      lines.push(`psidlen: ${ai.rule.psidlen}`);
    }
  } else {
    statusText += ' - DHCP/PPPoE environment';
    lines.push('Standard DHCP or PPPoE connection environment detected.');
  }

  displayIsp(statusText, lines.join('\n'));
}

function onToggleWizard(e) {
  const on = e.target.checked;
  document.getElementById('aios-config').style.display = on ? 'block' : 'none';
  const txt = document.getElementById('uci-defaults-content');
  if (!on) txt.value = TEMPLATE;
  else applyConnectionChange();
}

function onToggleSelector(e) {
  document.getElementById('package-selector-config').style.display = e.target.checked ? 'block' : 'none';
}

function collectConfig() {
  const get = (id) => document.getElementById(id)?.value?.trim() || '';
  const getInt = (id) => {
    const v = get(id); const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : '';
  };
  const checkedVal = (name, def) => document.querySelector(`input[name="${name}"]:checked`)?.value || def;

  return {
    language: get('aios-language'),
    country: get('aios-country'),
    timezone: get('aios-timezone'),
    zonename: get('aios-zonename'),
    deviceName: get('aios-device-name'),
    lanIp: get('aios-lan-ip'),
    rootPassword: get('aios-root-password'),
    confirmPassword: get('aios-confirm-password'),
    wifiSSID: get('aios-wifi-ssid'),
    wifiPassword: get('aios-wifi-password'),

    connectionMode: checkedVal('connectionMode', 'auto'),
    connectionType: checkedVal('connectionType', 'dhcp'),
    mapeType: checkedVal('mapeType', 'auto'),

    pppoeUsername: get('pppoe-username'),
    pppoePassword: get('pppoe-password'),

    dsliteMode: checkedVal('dsliteMode', 'auto'),
    dsliteAftrType: get('dslite-aftr-type'),
    dsliteArea: get('dslite-area'),
    dsliteAftrAddress: get('dslite-aftr-address'),

    mapeBr: get('mape-br'),
    mapeEalen: getInt('mape-ealen'),
    mapeIpv4Prefix: get('mape-ipv4-prefix'),
    mapeIpv4Prefixlen: getInt('mape-ipv4-prefixlen'),
    mapeIpv6Prefix: get('mape-ipv6-prefix'),
    mapeIpv6Prefixlen: getInt('mape-ipv6-prefixlen'),
    mapePsidOffset: getInt('mape-psid-offset'),
    mapePsidlen: getInt('mape-psidlen'),
    mapeGuaPrefix: get('mape-gua-prefix')
  };
}

function language() {
  return document.getElementById('aios-language')?.value?.trim() || 'en';
}

function currentManualPackages() {
  return document.getElementById('asu-packages').value || '';
}

function setManualPackages(list) {
  document.getElementById('asu-packages').value = list.join(' ');
}

function selectedPackageIdsFromUI() {
  // 依存は packages.json に従い解決するので、トップレベル選択だけ集める
  const ids = [];
  document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
    const id = cb.getAttribute('data-id') || '';
    if (id) ids.push(id);
  });
  return ids;
}

function refreshPackagesOnly() {
  const lang = language();
  const resolved = resolvePackages({
    db: DB,
    selectedIds: selectedPackageIdsFromUI(),
    manual: currentManualPackages(),
    lang
  });
  setManualPackages(resolved);
}

function networkAdditions({ auto, connectionType }) {
  const pkgs = addNetworkPackages({
    packages: (document.getElementById('asu-packages').value || '').split(/\s+/),
    auto,
    apiInfo: getState().apiInfo,
    connectionType
  });
  setManualPackages(pkgs);
}

function applyConnectionChange() {
  // 表示
  updateGuaSectionVisibility({
    mode: document.querySelector('input[name="connectionMode"]:checked')?.value || 'auto',
    type: document.querySelector('input[name="connectionType"]:checked')?.value || 'dhcp',
    mapeType: document.querySelector('input[name="mapeType"]:checked')?.value || 'auto',
    apiInfo: getState().apiInfo
  });

  // パッケージ
  refreshPackagesOnly();
  const cfg = collectConfig();
  networkAdditions({ auto: cfg.connectionMode === 'auto', connectionType: cfg.connectionType });

  // テンプレ
  if (document.getElementById('use-aios-config')?.checked) {
    applyTemplate();
  }
}

async function applyTemplate() {
  const s = getState();
  let content = document.getElementById('uci-defaults-content').value || TEMPLATE;

  // OpenWrt version flags
  if (s.selectedVersion?.startsWith('19')) {
    content = content.replace(/^# openwrt_19=""/m, `openwrt_19="1"`);
    content = content.replace(/^# openwrt_21=""/m, `# openwrt_21=""`);
  } else {
    content = content.replace(/^# openwrt_19=""/m, `# openwrt_19=""`);
    content = content.replace(/^# openwrt_21=""/m, `openwrt_21="1"`);
  }

  const cfg = collectConfig();
  const samePw = (cfg.rootPassword === cfg.confirmPassword) ? cfg.rootPassword : '';

  // Basic
  content = setScriptVar(content, 'device_name', cfg.deviceName, !!cfg.deviceName);
  content = setScriptVar(content, 'lan_ip_address', cfg.lanIp, !!cfg.lanIp);
  content = setScriptVar(content, 'root_password', samePw, !!samePw);
  content = setScriptVar(content, 'language', cfg.language, !!cfg.language);
  content = setScriptVar(content, 'country', cfg.country, !!cfg.country);
  content = setScriptVar(content, 'timezone', cfg.timezone, !!cfg.timezone);
  content = setScriptVar(content, 'zonename', cfg.zonename, !!cfg.zonename);

  // Wi-Fi
  const wifiActive = !!(cfg.wifiSSID && cfg.wifiPassword && String(cfg.wifiPassword).length >= 8);
  content = setScriptVar(content, 'wlan_name', cfg.wifiSSID, wifiActive);
  content = setScriptVar(content, 'wlan_password', cfg.wifiPassword, wifiActive);

  // プロトコル
  const proto = decideProtocol({ mode: cfg.connectionMode, type: cfg.connectionType, apiInfo: getState().apiInfo });

  // PPPoE
  const pppoeActive = (proto === 'pppoe');
  content = setScriptVar(content, 'pppoe_username', cfg.pppoeUsername, pppoeActive);
  content = setScriptVar(content, 'pppoe_password', cfg.pppoePassword, pppoeActive);

  // DS-Lite
  const dsliteAddr = (cfg.dsliteMode === 'auto')
    ? (getState().apiInfo?.rule?.aftrIpv6Address || cfg.dsliteAftrAddress || '')
    : (cfg.dsliteAftrAddress || '');
  const dsliteActive = (proto === 'dslite') && !!dsliteAddr;
  content = setScriptVar(content, 'dslite_aftr_address', dsliteAddr, dsliteActive);

  // MAP-E
  const api = getState().apiInfo?.rule || {};
  const mapeVals = {
    br: cfg.mapeBr || api.brIpv6Address || '',
    ealen: cfg.mapeEalen || api.eaBitLength || '',
    v4p: cfg.mapeIpv4Prefix || api.ipv4Prefix || '',
    v4l: cfg.mapeIpv4Prefixlen || api.ipv4PrefixLength || '',
    v6p: cfg.mapeIpv6Prefix || api.ipv6Prefix || '',
    v6l: cfg.mapeIpv6Prefixlen || api.ipv6PrefixLength || '',
    off: cfg.mapePsidOffset || api.psIdOffset || '',
    psid: cfg.mapePsidlen || api.psidlen || ''
  };
  const mapeActive = (proto === 'mape');
  content = setScriptVar(content, 'mape_br', mapeVals.br, mapeActive);
  content = setScriptVar(content, 'mape_ealen', mapeVals.ealen, mapeActive);
  content = setScriptVar(content, 'mape_ipv4_prefix', mapeVals.v4p, mapeActive);
  content = setScriptVar(content, 'mape_ipv4_prefixlen', mapeVals.v4l, mapeActive);
  content = setScriptVar(content, 'mape_ipv6_prefix', mapeVals.v6p, mapeActive);
  content = setScriptVar(content, 'mape_ipv6_prefixlen', mapeVals.v6l, mapeActive);
  content = setScriptVar(content, 'mape_psid_offset', mapeVals.off, mapeActive);
  content = setScriptVar(content, 'mape_psidlen', mapeVals.psid, mapeActive);

  // MAP-E GUA
  const guaActive = mapeActive && (cfg.mapeType === 'gua' || cfg.mapeType === 'auto');
  const guaPrefix = cfg.mapeGuaPrefix || '';
  content = setScriptVar(content, 'mape_gua_mode', guaActive ? '1' : '', guaActive);
  content = setScriptVar(content, 'mape_gua_prefix', guaActive ? guaPrefix : '', guaActive);

  // enable_* は packages.json の enableVar に基づいて必要なら別途実装（UI 側で反映可能）

  // MAP-E 選択時のみ map.sh 埋め込み
  if (mapeActive) content = embedMapSh(content);

  document.getElementById('uci-defaults-content').value = content;
}

async function onBuild() {
  const s = getState();
  if (!s.selectedDevice) {
    alert('Please select a device first');
    return;
  }
  const pkgs = (document.getElementById('asu-packages').value || '').trim().split(/\s+/).filter(Boolean);
  const defaults = document.getElementById('uci-defaults-content').value;

  const btn = document.getElementById('request-build');
  btn.disabled = true;
  showProgress('Building image...', 10);

  try {
    await buildAsuRequest({
      target: s.selectedDevice.target,
      profile: s.selectedDevice.id,
      version: s.selectedVersion,
      packages: pkgs,
      defaults,
      onProgress: showProgress,
      onDone: ({ images, status, requestHash, stderr, stdout }) => {
        hideProgress();
        showBuildStatus('Build successful', 'info', { stderr, stdout });
        renderDownloadLinks({ images, requestHash, containerId: 'download-links' });
      }
    });
  } catch (e) {
    hideProgress();
    showBuildStatus(`Build failed: ${e.message}`, 'error');
    alert('Build failed: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

// Progress / Status (DOM 直接)
function showProgress(message, percentage) {
  document.getElementById('build-message').textContent = message;
  document.getElementById('progress-bar').style.width = `${percentage}%`;
  document.getElementById('build-progress').style.display = 'block';
}
function hideProgress() {
  document.getElementById('build-progress').style.display = 'none';
}
function showBuildStatus(message, type, logs = {}) {
  const bs = document.getElementById('asu-buildstatus');
  if (type ===
