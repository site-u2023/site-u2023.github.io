// selector/network/net.wan.js
// WAN 統合エンジン（プロトコル決定・派生値）

export function calculatePrefix(ipv6, length = 64) {
  if (!ipv6) return '';
  const seg = ipv6.split(':');
  if (seg.length >= 4) return `${seg.slice(0,4).join(':')}::/${length}`;
  return '';
}

export function guaFromApi(apiInfo) {
  return calculatePrefix(apiInfo?.ipv6 || '', 64);
}

export function decideProtocol({ mode = 'auto', type = 'dhcp', apiInfo = null }) {
  if (mode === 'manual') return type;
  const r = apiInfo?.rule;
  if (r?.aftrIpv6Address || r?.aftrType) return 'dslite';
  if (r?.brIpv6Address) return 'mape';
  return 'dhcp';
}
