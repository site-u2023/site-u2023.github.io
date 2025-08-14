// selector/core/i18n.js
// language.js を薄くラップする前提。ここでは i18n パッケージ名の決定のみ担当。

export function normalizeLang(lang) {
  const map = { en: '', pt_br: 'pt-br', zh_cn: 'zh-cn', zh_tw: 'zh-tw' };
  return (map[lang] ?? String(lang || '').toLowerCase());
}

export function buildI18nMap(lang) {
  const norm = normalizeLang(lang);
  const isEN = !norm;
  const suff = isEN ? '' : `-${norm}`;
  const make = k => (isEN ? [] : [`luci-i18n-${k}${suff}`]);

  return {
    base: make('base'),
    opkg: make('opkg'),
    firewall: make('firewall'),
    ttyd: make('ttyd'),
    commands: make('commands'),
    irqbalance: make('irqbalance'),
    qos: make('qos'),
    sqm: make('sqm'),
    statistics: make('statistics'),
    nlbwmon: make('nlbwmon'),
    wifischedule: make('wifischedule'),
    wol: make('wol'),
    ddns: make('ddns'),
    banip: make('banip'),
    watchcat: make('watchcat'),
    dashboard: make('dashboard'),
    attendedsysupgrade: make('attendedsysupgrade'),
    dockerman: make('dockerman'),
    'hd-idle': make('hd-idle'),
    samba4: make('samba4')
  };
}
