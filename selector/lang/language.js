// 言語セレクター初期化
async function populateLanguageSelectorFromGitHub() {
    const baseUrl = 'https://api.github.com/repos/openwrt/luci/contents/modules/luci-base/po?ref=master';
    const source = document.getElementById('languages-select');       // index.html の言語一覧
    const target = document.getElementById('aios-language');      // advanced 側のセレクト (IDを修正)
    if (!source || !target) return;

    try {
        const res = await fetch(baseUrl);
        const dirs = await res.json();
        const available = new Set(
            dirs.filter(e => e && e.type === 'dir' && e.name)
                .map(e => e.name.toLowerCase())
        );

        target.innerHTML = '';
        for (const opt of source.options) {
            const code = opt.value.toLowerCase();
            if (!available.has(code)) continue;
            const copy = document.createElement('option');
            copy.value = opt.value;
            copy.textContent = opt.textContent;
            target.appendChild(copy);
        }

        // index.html 側で選択されている言語を初期値に
        const selectedCode = source.value.toLowerCase();
        target.value = available.has(selectedCode) ? source.value : 'en';

    } catch (err) {
        console.warn('Failed to populate language selector:', err);
    }
}
