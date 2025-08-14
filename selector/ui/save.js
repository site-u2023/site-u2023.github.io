// selector/ui/save.js
// ASU へのビルド要求・進捗表示・ダウンロードリンク生成

const ASU_BASE = 'https://sysupgrade.openwrt.org';

export async function buildAsuRequest({ target, profile, version, packages, defaults, onProgress, onDone }) {
  onProgress?.('Sending build request...', 10);

  const body = { target, profile, packages, version };
  if (defaults && defaults.trim()) body.defaults = defaults;

  const resp = await fetch(`${ASU_BASE}/api/v1/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body)
  });

  const text = await resp.text();
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text}`);

  let result;
  try { result = JSON.parse(text); } catch { throw new Error(`Invalid JSON: ${text}`); }

  if (result.request_hash) {
    return await pollBuildStatus(result.request_hash, { onProgress, onDone });
  } else if (result.images?.length > 0) {
    onDone?.({ images: result.images, requestHash: null, status: result });
    return result;
  }
  throw new Error('No request hash or images in response');
}

async function pollBuildStatus(requestHash, { onProgress, onDone }) {
  const maxAttempts = 120;
  let attempts = 0;
  const start = Date.now();

  while (attempts < maxAttempts) {
    const url = `${ASU_BASE}/api/v1/build/${requestHash}`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });

    if (!resp.ok) {
      if (resp.status === 404 && attempts < 5) {
        const t = formatElapsed(start);
        onProgress?.(`Waiting for build to start... ${t}`, 10);
        await wait(5000);
        attempts++;
        continue;
      }
      throw new Error(`Status check failed: HTTP ${resp.status}`);
    }

    const text = await resp.text();
    let status;
    try { status = JSON.parse(text); } catch { throw new Error(`Invalid JSON in status response: ${text}`); }

    const t = formatElapsed(start);
    const pct = Math.min((elapsed(start) / 600) * 85 + 10, 95);
    const msg = status.detail || status.status || 'Processing';

    if (['done','success'].includes(status.status) || status.detail === 'done' || status.imagebuilder_status === 'done') {
      const images = status.images || status.request?.images || status.request?.files || status.files || [];
      onProgress?.('Build completed!', 100);
      onDone?.({ images, status, requestHash, stderr: status.stderr, stdout: status.stdout });
      return { images, status, requestHash };
    }

    if (['failed','failure'].includes(status.status) || status.detail === 'failed' || status.imagebuilder_status === 'failed') {
      throw new Error(`Build failed: ${status.detail || status.stdout || 'Unknown error'}`);
    }

    onProgress?.(`${msg}... ${t}`, pct);
    await wait(5000);
    attempts++;
  }

  throw new Error('Build timeout after 10 minutes');
}

function elapsed(start) { return Math.floor((Date.now() - start) / 1000); }
function formatElapsed(start) {
  const s = elapsed(start), m = Math.floor(s / 60), r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// ダウンロードリンク描画（必要なコンテナIDを渡す）
export function renderDownloadLinks({ images, requestHash, containerId = 'download-links' }) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!images || images.length === 0) {
    container.innerHTML = '<h4>Downloads</h4><p>No images available</p>';
    return;
  }

  container.innerHTML = `
    <div class="images">
      <h4>Factory Image</h4>
      <p class="text-muted">The factory image is used for the initial flashing of OpenWrt. This would replace an existing firmware.</p>
      <div id="factory-images"></div>
      <h4>Sysupgrade Image</h4>
      <p class="text-muted">The sysupgrade image is used to upgrade an existing OpenWrt installation.</p>
      <div id="sysupgrade-images"></div>
      <div id="other-images" style="display: none;">
        <h4>Other Images</h4>
        <div id="other-images-content"></div>
      </div>
    </div>
  `;

  const factory = document.getElementById('factory-images');
  const sysup = document.getElementById('sysupgrade-images');
  const other = document.getElementById('other-images-content');
  const otherSection = document.getElementById('other-images');

  let hasFactory = false, hasSysup = false, hasOther = false;

  images.forEach(image => {
    if (!image.name) return;
    const url = requestHash ? `${ASU_BASE}/store/${requestHash}/${image.name}` : image.url || '#';
    const link = document.createElement('a');
    link.href = url; link.className = 'download-link'; link.target = '_blank';
    link.download = image.name; link.title = image.name; link.textContent = image.name;

    const type = (image.type || image.name).toLowerCase();
    if (type.includes('factory')) { factory.appendChild(link); factory.appendChild(document.createTextNode(' ')); hasFactory = true; }
    else if (type.includes('sysupgrade')) { sysup.appendChild(link); sysup.appendChild(document.createTextNode(' ')); hasSysup = true; }
    else { other.appendChild(link); other.appendChild(document.createTextNode(' ')); hasOther = true; }
  });

  if (!hasFactory) factory.innerHTML = '<span class="text-muted">No factory image available for this device.</span>';
  if (!hasSysup) sysup.innerHTML = '<span class="text-muted">No sysupgrade image available for this device.</span>';
  if (hasOther) otherSection.style.display = 'block';
}
