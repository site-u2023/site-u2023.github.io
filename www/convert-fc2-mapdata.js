/**
 * FC2.html の MAP-E ルールを auto-config.js 用 mapRulesData に変換
 * 仕様忠実版（31bit / 38bit 正確処理 + BRアドレス判定）
 */

const fs = require("fs");
const iconv = require("iconv-lite");

const fc2HtmlPath = process.argv[2] || "FC2.html";

if (!fs.existsSync(fc2HtmlPath)) {
  console.error("FC2.html が見つかりません");
  process.exit(1);
}

/* Shift_JIS 読み込み */
const html = iconv.decode(fs.readFileSync(fc2HtmlPath), "Shift_JIS");

/* <script> 抽出 */
const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  console.error("<script> タグが見つかりません");
  process.exit(1);
}

const js = scriptMatch[1];

/* ruleprefix 抽出 */
function extract(name) {
  const m = js.match(new RegExp(`var ${name} = (\\{[\\s\\S]*?\\n  \\})`));
  if (!m) throw new Error(`${name} が見つかりません`);
  return JSON.parse(
    m[1].replace(/0x([0-9a-fA-F]+):/g, '"0x$1":')
  );
}

const rule31 = extract("ruleprefix31");
const rule38 = extract("ruleprefix38");
const rule38_20 = extract("ruleprefix38_20");

/* IPv6 プレフィクス生成 */
function ipv6FromHex(hex, prefixLen) {
  const n = parseInt(hex, 16);

  if (prefixLen === 31) {
    const h1 = (n >>> 16) & 0xffff;
    const h2 = n & 0xffff;
    return `${h1.toString(16)}:${h2.toString(16)}::`;
  }

  if (prefixLen === 38) {
    const h1 = Math.floor(n / 0x1000000);
    const h2 = Math.floor(n / 0x100) & 0xffff;
    const h3 = (n & 0xff) << 8;
    return `${h1.toString(16)}:${h2.toString(16)}:${h3
      .toString(16)
      .padStart(4, "0")}::`;
  }

  return null;
}

/* IPv4 プレフィクス生成 */
function ipv4(arr) {
  return `${arr[0]}.${arr[1]}.${arr[2] || 0}.0`;
}

/* BRアドレス判定 */
function getBrAddress(hex, v6len, psidOffset) {
  const n = parseInt(hex, 16);
  
  // /31 (v6プラス固定IP、transix)
  if (v6len === 31) {
    const prefix31 = Math.floor(n / 0x10000) * 0x10000 + (n & 0xfffe);
    if (prefix31 >= 0x24047a80 && prefix31 < 0x24047a84) {
      return "2001:260:700:1::1:275";
    } else if (prefix31 >= 0x24047a84 && prefix31 < 0x24047a88) {
      return "2001:260:700:1::1:276";
    } else if ((prefix31 >= 0x240b0010 && prefix31 < 0x240b0014) ||
               (prefix31 >= 0x240b0250 && prefix31 < 0x240b0254)) {
      return "2404:9200:225:100::64";
    }
  }
  
  // /38 v6プラス (offset=4)
  else if (v6len === 38 && psidOffset === 4) {
    const seg2 = (n >> 8) & 0xffff;
    if (seg2 >= 0x7a84) {
      return "2001:260:700:1::1:276";
    } else {
      return "2001:260:700:1::1:275";
    }
  }
  
  // /38 OCN (offset=6)
  else if (v6len === 38 && psidOffset === 6) {
    return "2001:380:a120::9";
  }
  
  return "";
}

/* MAP-E ルール生成 */
function makeRule(hex, v4, v6len, v4len, psidOffset) {
  const psidLen = psidOffset === 6 ? 6 : 8;
  const eaLen = (32 - v4len) + psidLen;

  return {
    brIpv6Address: getBrAddress(hex, v6len, psidOffset),
    eaBitLength: String(eaLen),
    ipv4Prefix: ipv4(v4),
    ipv4PrefixLength: String(v4len),
    ipv6Prefix: ipv6FromHex(hex, v6len),
    ipv6PrefixLength: String(v6len),
    psIdOffset: String(psidOffset)
  };
}

const rules = [];

Object.entries(rule31).forEach(([k, v]) =>
  rules.push(makeRule(k, v, 31, 15, 4))
);

Object.entries(rule38).forEach(([k, v]) =>
  rules.push(makeRule(k, v, 38, 22, 4))
);

Object.entries(rule38_20).forEach(([k, v]) =>
  rules.push(makeRule(k, v, 38, 20, 6))
);

console.log(JSON.stringify({ basicMapRules: rules }, null, 2));
console.error(`変換完了: ${rules.length} 件`);
