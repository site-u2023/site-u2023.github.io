// selector/network/validators.js
// 入力検証（必要に応じ拡張）

export function isIPv6(str) {
  return typeof str === 'string' && /:/.test(str) && str.length <= 39;
}

export function isIPv4(str) {
  return typeof str === 'string' && /^\d{1,3}(\.\d{1,3}){3}$/.test(str);
}

export function isIntIn(str, min, max) {
  const n = Number(str);
  return Number.isInteger(n) && n >= min && n <= max;
}
