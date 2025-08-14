// advanced.js
// Minimal: package links (from packages.json) + setup.sh textarea. No extra UI.

const PKG_DB_URL = 'selector/packages/packages.json'; // adjust if needed

document.addEventListener('DOMContentLoaded', () => {
  initPackages();
  bindTextareaSync();
});

async function initPackages() {
  const container = document.getElementById('package-categories');
  if (!container) return;

  try {
    const res = await fetch(PKG_DB_URL, { cache: 'no-cache' });
    const data = await res.json();

    // Build dependency id set to avoid rendering deps as top-level items
    const depIds = new Set();
    (data.categories || []).forEach(cat => {
      (cat.packages || []).forEach(pkg => {
        (pkg.dependencies || []).forEach(d => depIds.add(d));
      });
    });

    container.innerHTML = '';
    (data.categories || []).forEach(category => {
      const catEl = document.createElement('div');
      catEl.className = 'package-category';

      const h6 = document.createElement('h6');
      h6.textContent = category.name || '';
      catEl.appendChild(h6);

      const grid = document.createElement('div');
      grid.className = 'package-grid';

      (category.packages || []).forEach(pkg => {
        if (pkg.hidden) return;
        if (depIds.has(pkg.id)) return;

        const item = document.createElement('div');
        item.className = 'package-item';

        const formCheck = document.createElement('div');
        formCheck.className = 'form-check';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'form-check-input package-selector-checkbox';
        cb.id = `pkg-${pkg.id}`;
        cb.setAttribute('data-package', pkg.name);
        if (pkg.dependencies && pkg.dependencies.length) {
          cb.setAttribute('data-dependencies', pkg.dependencies.join(','));
        }

        const label = document.createElement('label');
        label.className = 'form-check-label';
        label.setAttribute('for', cb.id);

        const link = document.createElement('a');
        link.href = pkg.url || (`https://openwrt.org/packages/${encodeURIComponent(pkg.name)}`);
        link.target = '_blank';
        link.rel = 'noopener';
        link.className = 'package-link';
        link.textContent = pkg.name;

        label.appendChild(link);
        formCheck.appendChild(cb);
        formCheck.appendChild(label);
        item.appendChild(formCheck);

        // dependencies inline
        (pkg.dependencies || []).forEach(depId => {
          const depPkg = findPackageById(data, depId);

          const depDiv = document.createElement('div');
          depDiv.className = 'package-dependent' + (depPkg && depPkg.hidden ? ' package-hidden' : '');

          const depCb = document.createElement('input');
          depCb.type = 'checkbox';
          depCb.className = 'form-check-input package-selector-checkbox';
          depCb.id = `pkg-${depId}`;
          depCb.setAttribute('data-package', depPkg ? depPkg.name : depId);

          const depLabel = document.createElement('label');
          depLabel.className = 'form-check-label';
          depLabel.setAttribute('for', depCb.id);

          if (depPkg) {
            const depLink = document.createElement('a');
            depLink.href = depPkg.url || (`https://openwrt.org/packages/${encodeURIComponent(depPkg.name)}`);
            depLink.target = '_blank';
            depLink.rel = 'noopener';
            depLink.className = 'package-link';
            depLink.textContent = depPkg.name;
            depLabel.appendChild(depLink);
          } else {
            depLabel.textContent = depId;
          }

          depDiv.appendChild(depCb);
          depDiv.appendChild(depLabel);
          item.appendChild(depDiv);
        });

        grid.appendChild(item);
      });

      catEl.appendChild(grid);
      if (category.description) {
        const desc = document.createElement('div');
        desc.className = 'package-description';
        desc.textContent = category.description;
        catEl.appendChild(desc);
      }
      container.appendChild(catEl);
    });

    // wire events
    container.querySelectorAll('.package-selector-checkbox').forEach(cb => {
      cb.addEventListener('change', onPackageToggle);
    });

    // hydrate from textarea if pre-filled
    hydrateCheckboxesFromTextarea();

  } catch (e) {
    container.innerHTML = '<div class="form-group error">Failed to load packages</div>';
    // silent fail besides message
  }
}

function findPackageById(data, id) {
  for (const cat of (data.categories || [])) {
    const hit = (cat.packages || []).find(p => p.id === id);
    if (hit) return hit;
  }
  return null;
}

function onPackageToggle(e) {
  const cb = e.target;
  const checked = cb.checked;
  const deps = (cb.getAttribute('data-dependencies') || '')
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(Boolean);

  if (checked && deps.length) {
    deps.forEach(depId => {
      const depCb = document.getElementById(`pkg-${depId}`);
      if (depCb) depCb.checked = true;
    });
  }

  updatePackagesTextarea();
}

function updatePackagesTextarea() {
  const ta = document.getElementById('asu-packages');
  const current = new Set((ta.value || '').trim().split(/\s+/).filter(Boolean));

  // remove all managed names
  const managed = [];
  document.querySelectorAll('.package-selector-checkbox').forEach(cb => {
    const name = cb.getAttribute('data-package');
    if (name) managed.push(name);
  });
  managed.forEach(name => current.delete(name));

  // add all checked
  document.querySelectorAll('.package-selector-checkbox:checked').forEach(cb => {
    const name = cb.getAttribute('data-package');
    if (name) current.add(name);
  });

  ta.value = Array.from(current).join(' ');
}

function hydrateCheckboxesFromTextarea() {
  const ta = document.getElementById('asu-packages');
  const set = new Set((ta.value || '').split(/\s+/).filter(Boolean));
  document.querySelectorAll('.package-selector-checkbox').forEach(cb => {
    const name = cb.getAttribute('data-package');
    if (name && set.has(name)) cb.checked = true;
  });
}

function bindTextareaSync() {
  const ta = document.getElementById('asu-packages');
  if (!ta) return;
  ta.addEventListener('input', hydrateCheckboxesFromTextarea);
}
