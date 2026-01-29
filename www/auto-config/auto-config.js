// ========================================
// データベース定義セクション
// ========================================

/**
 * 東西判定用IPv6プレフィックス定義
 * NTT東日本・西日本のIPv6アドレス範囲を定義
 */
const JURISDICTION_PREFIXES = {
    east: [
      { prefix: "2400:4050::", length: 30 },
      { prefix: "240b:10::", length: 32 },
      { prefix: "2001:380:a000::", length: 44 },
      { prefix: "2001:380:a100::", length: 44 },
      { prefix: "2001:380:a200::", length: 44 },
      { prefix: "2001:380:a300::", length: 44 }
    ],
    west: [
      { prefix: "2400:4150::", length: 30 },
      { prefix: "240b:11::", length: 32 },
      { prefix: "2001:380:b000::", length: 44 },
      { prefix: "2001:380:b100::", length: 44 },
      { prefix: "2001:380:b200::", length: 44 },
      { prefix: "2001:380:b300::", length: 44 }
    ]
  };
  
/**
 * DS-Lite AFTRルールデータベース
 * IPv6プレフィックスからAFTRタイプを判定
 */
const dsliteRulesData = {
    aftrRules: [
      {
        aftrType: "xpass",
        asn: [2519, 17506], 
        ipv6PrefixRanges: [
          "2001:f60::/28",
          "2001:f70::/29"
        ],
        aftrAddresses: {
          east: "2001:f60:0:200::1:1",
          west: "2001:f60:0:200::1:1"
        },
        aftrFqdn: "dgw.xpass.jp",
        tunlink: "wan6"
      },
      {
        aftrType: "v6connect",
        asn: [4685],
        ipv6PrefixRanges: [
          "2405:6580::/29",
          "2001:c28::/32"
        ],
        aftrAddresses: null,
        aftrFqdn: "dslite.v6connect.net",
        tunlink: "wan6"
      },
      {
        aftrType: "transix",
        asn: [55391, 55392],
        ipv6PrefixRanges: [
            "2404:8e00::/32",
            "2404:8e01::/32"
        ],
        aftrAddresses: {
          east: "2404:8e00::feed:100",
          west: "2404:8e01::feed:100"
        },
        aftrFqdn: "gw.transix.jp",
        tunlink: "wan6"
      }
    ]
  };

  /**
   * MAP-E ルールデータベース
   * IPv6プレフィックスからMAP-E設定パラメータを判定
   */
const mapRulesData = {
  "basicMapRules": [
        // nuro
        {
            "brIpv6Address": "2001:3b8:200:ff9::1",
            "eaBitLength": "20",
            "ipv4Prefix": "219.104.128.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "240d:000f:0000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "4"
        },
        {
            "brIpv6Address": "2001:3b8:200:ff9::1",
            "eaBitLength": "20",
            "ipv4Prefix": "219.104.144.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "240d:000f:1000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "4"
        },
        {
            "brIpv6Address": "2001:3b8:200:ff9::1",
            "eaBitLength": "20",
            "ipv4Prefix": "219.104.160.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "240d:000f:2000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "4"
        },
        {
            "brIpv6Address": "2001:3b8:200:ff9::1",
            "eaBitLength": "20",
            "ipv4Prefix": "219.104.176.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "240d:000f:3000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "4"
        },
        {
            "brIpv6Address": "2001:3b8:200:ff9::1",
            "eaBitLength": "20",
            "ipv4Prefix": "219.104.138.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "240d:000f:a000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "4"
        },
        {
            "brIpv6Address": "2001:3b8:200:ff9::1",
            "eaBitLength": "20",
            "ipv4Prefix": "219.104.141.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "240d:000f:d000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "4"
        },
 
    // ocnなど
    {
      "brIpv6Address": "2404:9200:225:100::64",
      "eaBitLength": "25",
      "ipv4Prefix": "106.72.0.0",
      "ipv4PrefixLength": "15",
      "ipv6Prefix": "240b:10::",
      "ipv6PrefixLength": "31",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2404:9200:225:100::64",
      "eaBitLength": "25",
      "ipv4Prefix": "14.8.0.0",
      "ipv4PrefixLength": "15",
      "ipv6Prefix": "240b:12::",
      "ipv6PrefixLength": "31",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2404:9200:225:100::64",
      "eaBitLength": "25",
      "ipv4Prefix": "14.10.0.0",
      "ipv4PrefixLength": "15",
      "ipv6Prefix": "240b:250::",
      "ipv6PrefixLength": "31",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2404:9200:225:100::64",
      "eaBitLength": "25",
      "ipv4Prefix": "14.12.0.0",
      "ipv4PrefixLength": "15",
      "ipv6Prefix": "240b:252::",
      "ipv6PrefixLength": "31",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "25",
      "ipv4Prefix": "133.200.0.0",
      "ipv4PrefixLength": "15",
      "ipv6Prefix": "2404:7a80::",
      "ipv6PrefixLength": "31",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "25",
      "ipv4Prefix": "133.206.0.0",
      "ipv4PrefixLength": "15",
      "ipv6Prefix": "2404:7a84::",
      "ipv6PrefixLength": "31",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.196.208.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:0000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.196.212.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:0400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.198.140.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:0800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.198.144.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:0c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.198.212.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:1000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.198.244.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:1400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "122.131.104.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:1800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.195.20.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:1c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.160.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:2000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.164.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:2400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.168.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:2800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.172.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:2c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.176.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:3000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.180.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:3400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.184.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:3800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.188.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:3c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.209.0.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:4000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.209.4.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:4400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.209.8.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:4800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.209.12.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:4c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.209.16.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:5000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.209.20.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:5400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.209.24.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:5800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.209.28.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:5c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.192.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:6000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.196.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:6400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.200.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:6800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.204.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:6c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.208.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:7000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.212.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:7400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.216.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:7800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.220.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:7c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.224.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:8000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.228.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:8400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.232.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:8800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.236.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:8c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.240.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:9000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.244.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:9400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.248.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:9800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.252.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:9c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.194.192.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:a000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.194.196.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:a400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.194.200.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:a800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.194.204.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:ac00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "119.239.128.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:b000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "119.239.132.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:b400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "119.239.136.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:b800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "119.239.140.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:bc00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.194.32.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:c000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.194.36.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:c400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.194.40.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:c800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.194.44.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:cc00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.195.24.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:d000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.195.28.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:d400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "122.130.192.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:d800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "122.130.196.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:dc00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "122.135.64.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:e000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "122.135.68.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:e400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.192.240.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:e800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.192.244.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:ec00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.193.176.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:f000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.193.180.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:f400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "122.130.176.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:f800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "122.130.180.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a82:fc00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "122.131.24.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:0000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "122.131.28.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:0400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "122.131.32.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:0800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "122.131.36.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:0c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "119.243.112.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:1000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "119.243.116.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:1400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "219.107.136.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:1800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "219.107.140.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:1c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "220.144.224.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:2000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "220.144.228.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:2400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.194.64.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:2800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.194.68.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:2c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "221.171.40.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:3000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "221.171.44.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:3400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "110.233.80.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:3800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "110.233.84.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:3c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "119.241.184.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:4000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "119.241.188.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:4400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "119.243.56.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:4800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "119.243.60.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:4c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.199.8.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:5000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.199.12.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:5400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.196.96.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:5800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.196.100.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:5c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "122.130.104.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:6000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "122.130.108.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:6400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "122.130.112.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:6800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "122.130.116.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:6c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "49.129.152.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:7000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "49.129.156.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:7400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "49.129.192.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:7800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "49.129.196.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:7c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "49.129.120.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:8000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "49.129.124.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:8400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "221.170.40.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:8800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "221.170.44.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:8c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "60.239.108.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:9000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "60.236.24.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:9400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "122.130.120.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:9800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "60.236.84.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:9c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "60.239.180.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:a000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "60.239.184.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:a400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "118.110.136.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:a800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "119.242.136.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:ac00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "60.238.188.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:b000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "60.238.204.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:b400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "122.134.52.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:b800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "119.244.60.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:bc00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "119.243.100.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:c000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "221.170.236.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:c400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "221.171.48.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:c800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "60.238.36.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:cc00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.195.236.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:d000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "60.236.20.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:d400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "118.108.76.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:d800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "118.110.108.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:dc00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "118.110.112.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:e000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "118.111.88.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:e400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "118.111.228.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:e800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "118.111.236.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:ec00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "119.241.148.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:f000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "119.242.124.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:f400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.194.28.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:f800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:275",
      "eaBitLength": "18",
      "ipv4Prefix": "125.194.96.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a83:fc00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.128.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:0000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.132.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:0400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.136.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:0800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.140.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:0c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.144.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:1000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.148.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:1400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.152.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:1800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.156.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:1c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.160.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:2000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.164.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:2400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.168.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:2800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.172.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:2c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.176.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:3000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.180.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:3400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.184.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:3800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.188.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:3c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.192.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:4000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.196.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:4400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.200.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:4800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.204.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:4c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.208.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:5000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.212.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:5400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.216.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:5800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.203.220.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:5c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.0.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:6000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.4.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:6400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.8.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:6800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.12.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:6c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.16.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:7000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.20.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:7400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.24.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:7800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.28.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:7c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.64.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:8000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.68.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:8400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.72.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:8800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.76.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:8c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.80.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:9000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.84.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:9400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.88.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:9800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "133.204.92.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:9c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "221.171.112.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:a000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "221.171.116.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:a400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "221.171.120.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:a800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "221.171.124.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:ac00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "125.195.184.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:b000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "125.196.216.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:b400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "221.171.108.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:b800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "219.107.152.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:bc00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "60.239.128.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:c000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "60.239.132.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:c400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "60.239.136.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:c800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "60.239.140.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:cc00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "118.110.80.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:d000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "118.110.84.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:d400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "118.110.88.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:d800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "118.110.92.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:dc00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "125.194.176.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:e000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "125.194.180.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:e400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "125.194.184.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:e800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "125.194.188.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:ec00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "60.239.112.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:f000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "60.239.116.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:f400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "60.239.120.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:f800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "60.239.124.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a86:fc00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "125.195.56.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:0000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "125.195.60.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:0400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "125.196.32.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:0800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "125.196.36.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:0c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "118.108.80.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:1000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "118.108.84.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:1400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "118.111.80.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:1800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "118.111.84.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:1c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "218.227.176.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:2000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "218.227.180.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:2400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "60.239.208.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:2800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "60.239.212.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:2c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "118.109.56.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:3000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "118.109.60.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:3400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "122.131.88.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:3800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "122.131.92.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:3c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "122.131.96.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:4000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "122.131.100.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:4400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "122.130.48.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:4800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "122.130.52.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:4c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "125.198.224.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:5000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "125.198.228.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:5400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "119.243.104.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:5800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "119.243.108.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:5c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "118.109.152.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:6000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "118.109.156.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:6400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "118.111.104.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:6800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "118.111.108.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:6c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "119.239.48.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:7000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "119.239.52.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:7400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "122.130.16.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:7800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "122.130.20.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:7c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "125.196.128.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:8000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "125.196.132.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:8400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "122.131.48.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:8800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "122.131.52.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:8c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "122.134.104.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:9000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "122.134.108.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:9400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "60.238.208.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:9800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "60.238.212.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:9c00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "220.144.192.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:a000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "220.144.196.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:a400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "110.233.48.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:a800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "122.131.84.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:ac00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "111.169.152.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:b000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "119.241.132.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:b400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "119.241.136.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:b800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "119.244.68.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:bc00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "60.236.92.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:c000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "60.237.108.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:c400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "60.238.12.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:c800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "60.238.44.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:cc00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "60.238.216.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:d000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "60.238.232.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:d400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "49.129.72.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:d800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "110.233.4.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:dc00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "110.233.192.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:e000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "119.243.20.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:e400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "119.243.24.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:e800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "125.193.4.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:ec00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "125.193.148.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:f000::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "118.110.76.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:f400::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "118.110.96.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:f800::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    {
      "brIpv6Address": "2001:260:700:1::1:276",
      "eaBitLength": "18",
      "ipv4Prefix": "125.193.152.0",
      "ipv4PrefixLength": "22",
      "ipv6Prefix": "2404:7a87:fc00::",
      "ipv6PrefixLength": "38",
      "psIdOffset": "4"
    },
    
        // OCN
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "22",
            "ipv4Prefix": "153.240.0.0",
            "ipv4PrefixLength": "16",
            "ipv6Prefix": "2400:4050:0000::",
            "ipv6PrefixLength": "34",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "21",
            "ipv4Prefix": "153.241.0.0",
            "ipv4PrefixLength": "17",
            "ipv6Prefix": "2400:4050:4000::",
            "ipv6PrefixLength": "35",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "21",
            "ipv4Prefix": "153.241.128.0",
            "ipv4PrefixLength": "17",
            "ipv6Prefix": "2400:4050:6000::",
            "ipv6PrefixLength": "35",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "23",
            "ipv4Prefix": "153.242.0.0",
            "ipv4PrefixLength": "15",
            "ipv6Prefix": "2400:4050:8000::",
            "ipv6PrefixLength": "33",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "21",
            "ipv4Prefix": "122.26.0.0",
            "ipv4PrefixLength": "17",
            "ipv6Prefix": "2400:4051:0000::",
            "ipv6PrefixLength": "35",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "114.146.64.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4051:2000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "114.148.192.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4051:3000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "114.150.192.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4051:4000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "114.163.64.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4051:5000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "114.163.128.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4051:6000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "114.167.64.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4051:7000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "114.172.192.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4051:8000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "114.177.64.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4051:9000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "118.0.64.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4051:A000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "118.7.64.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4051:B000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "118.8.192.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4051:C000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "118.9.0.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4051:D000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "123.218.64.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4051:E000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "123.220.128.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4051:F000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "123.225.192.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4052:0000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "153.134.0.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4052:1000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "153.139.128.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4052:2000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "153.151.64.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4052:3000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "153.170.64.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4052:4000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "153.170.192.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4052:5000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "61.127.128.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4052:6000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "114.146.0.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4052:6800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "114.146.128.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4052:7000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "114.148.64.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4052:7800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "114.148.160.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4052:8000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "114.149.0.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4052:8800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "114.150.160.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4052:9000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "114.158.0.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4052:9800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "21",
            "ipv4Prefix": "153.193.0.0",
            "ipv4PrefixLength": "17",
            "ipv6Prefix": "2400:4052:A000::",
            "ipv6PrefixLength": "35",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "153.165.192.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4052:C000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "18",
            "ipv4Prefix": "180.49.0.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "2400:4052:D000::",
            "ipv6PrefixLength": "38",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "18",
            "ipv4Prefix": "180.49.16.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "2400:4052:D400::",
            "ipv6PrefixLength": "38",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "18",
            "ipv4Prefix": "180.49.32.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "2400:4052:D800::",
            "ipv6PrefixLength": "38",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "18",
            "ipv4Prefix": "180.49.48.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "2400:4052:DC00::",
            "ipv6PrefixLength": "38",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "18",
            "ipv4Prefix": "180.49.64.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "2400:4052:E000::",
            "ipv6PrefixLength": "38",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "18",
            "ipv4Prefix": "180.49.80.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "2400:4052:E400::",
            "ipv6PrefixLength": "38",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "18",
            "ipv4Prefix": "180.49.96.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "2400:4052:E800::",
            "ipv6PrefixLength": "38",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "18",
            "ipv4Prefix": "180.49.112.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "2400:4052:EC00::",
            "ipv6PrefixLength": "38",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "114.162.128.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4053:0000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "114.163.0.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4053:0800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "114.165.224.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4053:1000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "114.167.192.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4053:1800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "114.177.128.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4053:2000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "114.178.224.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4053:2800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "118.1.0.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4053:3000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "118.3.192.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4053:3800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "118.6.64.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4053:4000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "118.7.160.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4053:4800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "118.7.192.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4053:5000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "118.9.64.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4053:5800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "118.9.128.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4053:6000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "118.22.128.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4053:6800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "122.16.0.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4053:7000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "123.220.0.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4053:7800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "22",
            "ipv4Prefix": "153.173.0.0",
            "ipv4PrefixLength": "16",
            "ipv6Prefix": "2400:4053:8000::",
            "ipv6PrefixLength": "34",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "22",
            "ipv4Prefix": "153.238.0.0",
            "ipv4PrefixLength": "16",
            "ipv6Prefix": "2400:4053:C000::",
            "ipv6PrefixLength": "34",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "22",
            "ipv4Prefix": "153.239.0.0",
            "ipv4PrefixLength": "16",
            "ipv6Prefix": "2400:4150:0000::",
            "ipv6PrefixLength": "34",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "22",
            "ipv4Prefix": "153.252.0.0",
            "ipv4PrefixLength": "16",
            "ipv6Prefix": "2400:4150:4000::",
            "ipv6PrefixLength": "34",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "123.222.96.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4150:8000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "123.225.96.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4150:8800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "123.225.160.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4150:9000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "124.84.96.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4150:9800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "123.225.0.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4150:A000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
	{
	    "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "118.3.0.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4150:A800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"},
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "22",
            "ipv4Prefix": "180.60.0.0",
            "ipv4PrefixLength": "16",
            "ipv6Prefix": "2400:4151:0000::",
            "ipv6PrefixLength": "34",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "21",
            "ipv4Prefix": "153.139.0.0",
            "ipv4PrefixLength": "17",
            "ipv6Prefix": "2400:4151:4000::",
            "ipv6PrefixLength": "35",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "21",
            "ipv4Prefix": "219.161.128.0",
            "ipv4PrefixLength": "17",
            "ipv6Prefix": "2400:4151:6000::",
            "ipv6PrefixLength": "35",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "153.187.0.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4151:8000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "153.191.0.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4151:9000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "180.12.64.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4151:A000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "180.13.0.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4151:B000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "124.84.128.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4151:C000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "124.98.192.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4151:C800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "124.100.0.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4151:D000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "124.100.224.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4151:D800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "17",
            "ipv4Prefix": "122.26.232.0",
            "ipv4PrefixLength": "21",
            "ipv6Prefix": "2400:4151:E000::",
            "ipv6PrefixLength": "39",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "17",
            "ipv4Prefix": "122.26.224.0",
            "ipv4PrefixLength": "21",
            "ipv6Prefix": "2400:4151:E200::",
            "ipv6PrefixLength": "39",
            "psIdOffset": "6"
        },
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "18",
	    "ipv4Prefix": "118.3.64.0",
	    "ipv4PrefixLength": "20",
	    "ipv6Prefix": "2400:4151:E400::",
	    "ipv6PrefixLength": "38",
	    "psIdOffset": "6"
	},
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "180.16.0.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4152:0000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "180.29.128.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4152:1000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "180.59.64.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4152:2000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "20",
            "ipv4Prefix": "219.161.0.0",
            "ipv4PrefixLength": "18",
            "ipv6Prefix": "2400:4152:3000::",
            "ipv6PrefixLength": "36",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.129.160.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4152:4000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.130.0.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4152:4800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.131.96.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4152:5000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
	{
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "18",
            "ipv4Prefix": "180.26.192.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "2400:4152:5800::",
            "ipv6PrefixLength": "38",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "17",
            "ipv4Prefix": "114.172.144.0",
            "ipv4PrefixLength": "21",
            "ipv6Prefix": "2400:4152:5C00::",
            "ipv6PrefixLength": "39",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.131.128.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4152:6000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.132.128.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4152:6800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.134.64.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4152:7000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.137.0.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4152:7800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.139.192.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4152:8000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.151.32.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4152:8800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.156.96.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4152:9000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.156.128.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4152:9800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
	{
	    "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "17",
            "ipv4Prefix": "114.172.152.0",
            "ipv4PrefixLength": "21",
            "ipv6Prefix": "2400:4152:A000::",
            "ipv6PrefixLength": "39",
            "psIdOffset": "6"
	},
        {
	    "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "18",
            "ipv4Prefix": "180.26.208.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "2400:4152:A400::",
            "ipv6PrefixLength": "38",
            "psIdOffset": "6"
	},
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "17",
	    "ipv4Prefix": "124.98.32.0",
	    "ipv4PrefixLength": "21",
	    "ipv6Prefix": "2400:4152:A800::",
	    "ipv6PrefixLength": "39",
	    "psIdOffset": "6"
	},
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "17",
	    "ipv4Prefix": "124.98.40.0",
	    "ipv4PrefixLength": "21",
	    "ipv6Prefix": "2400:4152:AA00::",
	    "ipv6PrefixLength": "39",
	    "psIdOffset": "6"
	},
	{
	    "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "17",
            "ipv4Prefix": "122.26.240.0",
            "ipv4PrefixLength": "21",
            "ipv6Prefix": "2400:4152:B000::",
            "ipv6PrefixLength": "39",
            "psIdOffset": "6"
	},
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "18",
	    "ipv4Prefix": "114.172.128.0",
	    "ipv4PrefixLength": "20",
	    "ipv6Prefix": "2400:4152:B400::",
	    "ipv6PrefixLength": "38",
	    "psIdOffset": "6"
	},
	{
            "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "18",
	    "ipv4Prefix": "122.26.128.0",
	    "ipv4PrefixLength": "20",
	    "ipv6Prefix": "2400:4152:B800::",
	    "ipv6PrefixLength": "38",
	    "psIdOffset": "6"
	},
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "17",
	    "ipv4Prefix": "122.26.248.0",
	    "ipv4PrefixLength": "21",
	    "ipv6Prefix": "2400:4152:BC00::",
	    "ipv6PrefixLength": "39",
	    "psIdOffset": "6"
	},
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "17",
	    "ipv4Prefix": "123.225.152.0",
	    "ipv4PrefixLength": "21",
	    "ipv6Prefix": "2400:4152:BE00::",
	    "ipv6PrefixLength": "39",
	    "psIdOffset": "6"
        },
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "18",
	    "ipv4Prefix": "118.3.80.0",
	    "ipv4PrefixLength": "20",
	    "ipv6Prefix": "2400:4152:C000::",
	    "ipv6PrefixLength": "38",
	    "psIdOffset": "6"
	},
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "17",
	    "ipv4Prefix": "123.226.64.0",
	    "ipv4PrefixLength": "21",
	    "ipv6Prefix": "2400:4152:C400::",
	    "ipv6PrefixLength": "39",
	    "psIdOffset": "6"
	},
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "17",
	    "ipv4Prefix": "124.98.16.0",
	    "ipv4PrefixLength": "21",
	    "ipv6Prefix": "2400:4152:C600::",
	    "ipv6PrefixLength": "39",
	    "psIdOffset": "6"
	},
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "17",
	    "ipv4Prefix": "123.226.72.0",
	    "ipv4PrefixLength": "21",
	    "ipv6Prefix": "2400:4152:C800::",
	    "ipv6PrefixLength": "39",
	    "psIdOffset": "6"
	},
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "17",
	    "ipv4Prefix": "124.98.24.0",
	    "ipv4PrefixLength": "21",
	    "ipv6Prefix": "2400:4152:CA00::",
	    "ipv6PrefixLength": "39",
	    "psIdOffset": "6"
	},
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "17",
	    "ipv4Prefix": "124.98.8.0",
	    "ipv4PrefixLength": "21",
	    "ipv6Prefix": "2400:4152:CC00::",
	    "ipv6PrefixLength": "39",
	    "psIdOffset": "6"
	},
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "17",
	    "ipv4Prefix": "124.98.0.0",
	    "ipv4PrefixLength": "21",
	    "ipv6Prefix": "2400:4152:CE00::",
	    "ipv6PrefixLength": "39",
	    "psIdOffset": "6"
	},
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "17",
	    "ipv4Prefix": "118.3.112.0",
	    "ipv4PrefixLength": "21",
	    "ipv6Prefix": "2400:4152:D000::",
	    "ipv6PrefixLength": "39",
	    "psIdOffset": "6"
	},
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "17",
	    "ipv4Prefix": "118.3.120.0",
	    "ipv4PrefixLength": "21",
	    "ipv6Prefix": "2400:4152:D200::",
	    "ipv6PrefixLength": "39",
	    "psIdOffset": "6"
	},
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "18",
	    "ipv4Prefix": "118.3.48.0",
	    "ipv4PrefixLength": "20",
	    "ipv6Prefix": "2400:4152:E000::",
	    "ipv6PrefixLength": "38",
	    "psIdOffset": "6"
	},
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "17",
	    "ipv4Prefix": "118.3.96.0",
	    "ipv4PrefixLength": "21",
	    "ipv6Prefix": "2400:4152:E800::",
	    "ipv6PrefixLength": "39",
	    "psIdOffset": "6"
	},
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "17",
	    "ipv4Prefix": "123.226.88.0",
	    "ipv4PrefixLength": "21",
	    "ipv6Prefix": "2400:4152:EA00::",
	    "ipv6PrefixLength": "39",
	    "psIdOffset": "6"
	},
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "18",
	    "ipv4Prefix": "124.98.48.0",
	    "ipv4PrefixLength": "20",
	    "ipv6Prefix": "2400:4152:EC00::",
	    "ipv6PrefixLength": "38",
	    "psIdOffset": "6"
	},
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "17",
	    "ipv4Prefix": "118.3.104.0",
	    "ipv4PrefixLength": "21",
	    "ipv6Prefix": "2400:4152:F000::",
	    "ipv6PrefixLength": "39",
	    "psIdOffset": "6"
	},
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "17",
	    "ipv4Prefix": "123.226.80.0",
	    "ipv4PrefixLength": "21",
	    "ipv6Prefix": "2400:4152:F200::",
	    "ipv6PrefixLength": "39",
	    "psIdOffset": "6"
	},
	{
	    "brIpv6Address": "2001:380:A120::9",
	    "eaBitLength": "18",
	    "ipv4Prefix": "118.3.32.0",
	    "ipv4PrefixLength": "20",
	    "ipv6Prefix": "2400:4152:F400::",
	    "ipv6PrefixLength": "38",
	    "psIdOffset": "6"
	},
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.165.96.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:0000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.165.160.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:0800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.171.224.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:1000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.175.0.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:1800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.181.0.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:2000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.183.224.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:2800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.184.128.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:3000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.187.224.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:3800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "18",
            "ipv4Prefix": "220.106.32.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "2400:4153:4000::",
            "ipv6PrefixLength": "38",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "18",
            "ipv4Prefix": "220.106.48.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "2400:4153:4400::",
            "ipv6PrefixLength": "38",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.188.0.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:4800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.190.128.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:5000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.191.64.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:5800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.191.192.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:6000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "153.194.96.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:6800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "18",
            "ipv4Prefix": "220.106.64.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "2400:4153:7000::",
            "ipv6PrefixLength": "38",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "18",
            "ipv4Prefix": "220.106.80.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "2400:4153:7400::",
            "ipv6PrefixLength": "38",
            "psIdOffset": "6"
        },
	{
	    "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "18",
            "ipv4Prefix": "180.26.128.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "2400:4153:7800::",
            "ipv6PrefixLength": "38",
            "psIdOffset": "6"
	},
        {
	    "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "18",
            "ipv4Prefix": "180.26.144.0",
            "ipv4PrefixLength": "20",
            "ipv6Prefix": "2400:4153:7C00::",
            "ipv6PrefixLength": "38",
            "psIdOffset": "6"
	},
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "180.12.128.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:8000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "180.26.96.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:8800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "180.26.160.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:9000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "180.26.224.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:9800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "180.30.0.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:A000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "180.31.96.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:A800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "180.32.64.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:B000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "180.34.160.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:B800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "180.46.0.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:C000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "180.48.0.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:C800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "180.50.192.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:D000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "180.53.0.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:D800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "218.230.128.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:E000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "219.161.64.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:E800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "220.96.64.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:F000::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        },
        {
            "brIpv6Address": "2001:380:A120::9",
            "eaBitLength": "19",
            "ipv4Prefix": "220.99.0.0",
            "ipv4PrefixLength": "19",
            "ipv6Prefix": "2400:4153:F800::",
            "ipv6PrefixLength": "37",
            "psIdOffset": "6"
        }
    ]
  }
  /**
   * GUA（Global Unicast Address）検証ルール
   * RFC 4291に基づくグローバルユニキャストアドレスの判定
   */
  const guaValidation = {
      prefixCheck: "2000::/3",
      prefixLength: 3,
      excludeCidrs: [
        { prefix: "2001:db8::", length: 32 },   // ドキュメント用
        { prefix: "2002::", length: 16 },       // 6to4
        { prefix: "2001::", length: 32 },       // IETF Protocol Assignments
        { prefix: "2001:20::", length: 28 },    // ORCHIDv2
        { prefix: "2001:2::", length: 48 },     // Benchmarking
        { prefix: "2001:3::", length: 32 },     // AMT
        { prefix: "2001:4:112::", length: 48 }  // AS112-v6
      ]
    };  

  /**
   * OpenWrt タイムゾーン文字列マッピング
   * IANAタイムゾーン名 → OpenWrt TZ形式
   */
  const openwrtTimezones = {
    'Africa/Abidjan': 'GMT0',
    'Africa/Accra': 'GMT0',
    'Africa/Addis Ababa': 'EAT-3',
    'Africa/Algiers': 'CET-1',
    'Africa/Asmara': 'EAT-3',
    'Africa/Bamako': 'GMT0',
    'Africa/Bangui': 'WAT-1',
    'Africa/Banjul': 'GMT0',
    'Africa/Bissau': 'GMT0',
    'Africa/Blantyre': 'CAT-2',
    'Africa/Brazzaville': 'WAT-1',
    'Africa/Bujumbura': 'CAT-2',
    'Africa/Cairo': 'EET-2',
    'Africa/Casablanca': '<+01>-1',
    'Africa/Ceuta': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Africa/Conakry': 'GMT0',
    'Africa/Dakar': 'GMT0',
    'Africa/Dar es Salaam': 'EAT-3',
    'Africa/Djibouti': 'EAT-3',
    'Africa/Douala': 'WAT-1',
    'Africa/El Aaiun': '<+01>-1',
    'Africa/Freetown': 'GMT0',
    'Africa/Gaborone': 'CAT-2',
    'Africa/Harare': 'CAT-2',
    'Africa/Johannesburg': 'SAST-2',
    'Africa/Juba': 'CAT-2',
    'Africa/Kampala': 'EAT-3',
    'Africa/Khartoum': 'CAT-2',
    'Africa/Kigali': 'CAT-2',
    'Africa/Kinshasa': 'WAT-1',
    'Africa/Lagos': 'WAT-1',
    'Africa/Libreville': 'WAT-1',
    'Africa/Lome': 'GMT0',
    'Africa/Luanda': 'WAT-1',
    'Africa/Lubumbashi': 'CAT-2',
    'Africa/Lusaka': 'CAT-2',
    'Africa/Malabo': 'WAT-1',
    'Africa/Maputo': 'CAT-2',
    'Africa/Maseru': 'SAST-2',
    'Africa/Mbabane': 'SAST-2',
    'Africa/Mogadishu': 'EAT-3',
    'Africa/Monrovia': 'GMT0',
    'Africa/Nairobi': 'EAT-3',
    'Africa/Ndjamena': 'WAT-1',
    'Africa/Niamey': 'WAT-1',
    'Africa/Nouakchott': 'GMT0',
    'Africa/Ouagadougou': 'GMT0',
    'Africa/Porto-Novo': 'WAT-1',
    'Africa/Sao Tome': 'GMT0',
    'Africa/Tripoli': 'EET-2',
    'Africa/Tunis': 'CET-1',
    'Africa/Windhoek': 'CAT-2',
    'America/Adak': 'HST10HDT,M3.2.0,M11.1.0',
    'America/Anchorage': 'AKST9AKDT,M3.2.0,M11.1.0',
    'America/Anguilla': 'AST4',
    'America/Antigua': 'AST4',
    'America/Araguaina': '<-03>3',
    'America/Argentina/Buenos Aires': '<-03>3',
    'America/Argentina/Catamarca': '<-03>3',
    'America/Argentina/Cordoba': '<-03>3',
    'America/Argentina/Jujuy': '<-03>3',
    'America/Argentina/La Rioja': '<-03>3',
    'America/Argentina/Mendoza': '<-03>3',
    'America/Argentina/Rio Gallegos': '<-03>3',
    'America/Argentina/Salta': '<-03>3',
    'America/Argentina/San Juan': '<-03>3',
    'America/Argentina/San Luis': '<-03>3',
    'America/Argentina/Tucuman': '<-03>3',
    'America/Argentina/Ushuaia': '<-03>3',
    'America/Aruba': 'AST4',
    'America/Asuncion': '<-04>4<-03>,M10.1.0/0,M3.4.0/0',
    'America/Atikokan': 'EST5',
    'America/Bahia': '<-03>3',
    'America/Bahia Banderas': 'CST6CDT,M4.1.0,M10.5.0',
    'America/Barbados': 'AST4',
    'America/Belem': '<-03>3',
    'America/Belize': 'CST6',
    'America/Blanc-Sablon': 'AST4',
    'America/Boa Vista': '<-04>4',
    'America/Bogota': '<-05>5',
    'America/Boise': 'MST7MDT,M3.2.0,M11.1.0',
    'America/Cambridge Bay': 'MST7MDT,M3.2.0,M11.1.0',
    'America/Campo Grande': '<-04>4',
    'America/Cancun': 'EST5',
    'America/Caracas': '<-04>4',
    'America/Cayenne': '<-03>3',
    'America/Cayman': 'EST5',
    'America/Chicago': 'CST6CDT,M3.2.0,M11.1.0',
    'America/Chihuahua': 'MST7MDT,M4.1.0,M10.5.0',
    'America/Costa Rica': 'CST6',
    'America/Creston': 'MST7',
    'America/Cuiaba': '<-04>4',
    'America/Curacao': 'AST4',
    'America/Danmarkshavn': 'GMT0',
    'America/Dawson': 'MST7',
    'America/Dawson Creek': 'MST7',
    'America/Denver': 'MST7MDT,M3.2.0,M11.1.0',
    'America/Detroit': 'EST5EDT,M3.2.0,M11.1.0',
    'America/Dominica': 'AST4',
    'America/Edmonton': 'MST7MDT,M3.2.0,M11.1.0',
    'America/Eirunepe': '<-05>5',
    'America/El Salvador': 'CST6',
    'America/Fort Nelson': 'MST7',
    'America/Fortaleza': '<-03>3',
    'America/Glace Bay': 'AST4ADT,M3.2.0,M11.1.0',
    'America/Goose Bay': 'AST4ADT,M3.2.0,M11.1.0',
    'America/Grand Turk': 'EST5EDT,M3.2.0,M11.1.0',
    'America/Grenada': 'AST4',
    'America/Guadeloupe': 'AST4',
    'America/Guatemala': 'CST6',
    'America/Guayaquil': '<-05>5',
    'America/Guyana': '<-04>4',
    'America/Halifax': 'AST4ADT,M3.2.0,M11.1.0',
    'America/Havana': 'CST5CDT,M3.2.0/0,M11.1.0/1',
    'America/Hermosillo': 'MST7',
    'America/Indiana/Indianapolis': 'EST5EDT,M3.2.0,M11.1.0',
    'America/Indiana/Knox': 'CST6CDT,M3.2.0,M11.1.0',
    'America/Indiana/Marengo': 'EST5EDT,M3.2.0,M11.1.0',
    'America/Indiana/Petersburg': 'EST5EDT,M3.2.0,M11.1.0',
    'America/Indiana/Tell City': 'CST6CDT,M3.2.0,M11.1.0',
    'America/Indiana/Vevay': 'EST5EDT,M3.2.0,M11.1.0',
    'America/Indiana/Vincennes': 'EST5EDT,M3.2.0,M11.1.0',
    'America/Indiana/Winamac': 'EST5EDT,M3.2.0,M11.1.0',
    'America/Inuvik': 'MST7MDT,M3.2.0,M11.1.0',
    'America/Iqaluit': 'EST5EDT,M3.2.0,M11.1.0',
    'America/Jamaica': 'EST5',
    'America/Juneau': 'AKST9AKDT,M3.2.0,M11.1.0',
    'America/Kentucky/Louisville': 'EST5EDT,M3.2.0,M11.1.0',
    'America/Kentucky/Monticello': 'EST5EDT,M3.2.0,M11.1.0',
    'America/Kralendijk': 'AST4',
    'America/La Paz': '<-04>4',
    'America/Lima': '<-05>5',
    'America/Los Angeles': 'PST8PDT,M3.2.0,M11.1.0',
    'America/Lower Princes': 'AST4',
    'America/Maceio': '<-03>3',
    'America/Managua': 'CST6',
    'America/Manaus': '<-04>4',
    'America/Marigot': 'AST4',
    'America/Martinique': 'AST4',
    'America/Matamoros': 'CST6CDT,M3.2.0,M11.1.0',
    'America/Mazatlan': 'MST7MDT,M4.1.0,M10.5.0',
    'America/Menominee': 'CST6CDT,M3.2.0,M11.1.0',
    'America/Merida': 'CST6CDT,M4.1.0,M10.5.0',
    'America/Metlakatla': 'AKST9AKDT,M3.2.0,M11.1.0',
    'America/Mexico City': 'CST6CDT,M4.1.0,M10.5.0',
    'America/Miquelon': '<-03>3<-02>,M3.2.0,M11.1.0',
    'America/Moncton': 'AST4ADT,M3.2.0,M11.1.0',
    'America/Monterrey': 'CST6CDT,M4.1.0,M10.5.0',
    'America/Montevideo': '<-03>3',
    'America/Montserrat': 'AST4',
    'America/Nassau': 'EST5EDT,M3.2.0,M11.1.0',
    'America/New York': 'EST5EDT,M3.2.0,M11.1.0',
    'America/Nipigon': 'EST5EDT,M3.2.0,M11.1.0',
    'America/Nome': 'AKST9AKDT,M3.2.0,M11.1.0',
    'America/Noronha': '<-02>2',
    'America/North Dakota/Beulah': 'CST6CDT,M3.2.0,M11.1.0',
    'America/North Dakota/Center': 'CST6CDT,M3.2.0,M11.1.0',
    'America/North Dakota/New Salem': 'CST6CDT,M3.2.0,M11.1.0',
    'America/Nuuk': '<-03>3<-02>,M3.5.0/-2,M10.5.0/-1',
    'America/Ojinaga': 'MST7MDT,M3.2.0,M11.1.0',
    'America/Panama': 'EST5',
    'America/Pangnirtung': 'EST5EDT,M3.2.0,M11.1.0',
    'America/Paramaribo': '<-03>3',
    'America/Phoenix': 'MST7',
    'America/Port of Spain': 'AST4',
    'America/Port-au-Prince': 'EST5EDT,M3.2.0,M11.1.0',
    'America/Porto Velho': '<-04>4',
    'America/Puerto Rico': 'AST4',
    'America/Punta Arenas': '<-03>3',
    'America/Rainy River': 'CST6CDT,M3.2.0,M11.1.0',
    'America/Rankin Inlet': 'CST6CDT,M3.2.0,M11.1.0',
    'America/Recife': '<-03>3',
    'America/Regina': 'CST6',
    'America/Resolute': 'CST6CDT,M3.2.0,M11.1.0',
    'America/Rio Branco': '<-05>5',
    'America/Santarem': '<-03>3',
    'America/Santiago': '<-04>4<-03>,M9.1.6/24,M4.1.6/24',
    'America/Santo Domingo': 'AST4',
    'America/Sao Paulo': '<-03>3',
    'America/Scoresbysund': '<-01>1<+00>,M3.5.0/0,M10.5.0/1',
    'America/Sitka': 'AKST9AKDT,M3.2.0,M11.1.0',
    'America/St Barthelemy': 'AST4',
    'America/St Johns': 'NST3:30NDT,M3.2.0,M11.1.0',
    'America/St Kitts': 'AST4',
    'America/St Lucia': 'AST4',
    'America/St Thomas': 'AST4',
    'America/St Vincent': 'AST4',
    'America/Swift Current': 'CST6',
    'America/Tegucigalpa': 'CST6',
    'America/Thule': 'AST4ADT,M3.2.0,M11.1.0',
    'America/Thunder Bay': 'EST5EDT,M3.2.0,M11.1.0',
    'America/Tijuana': 'PST8PDT,M3.2.0,M11.1.0',
    'America/Toronto': 'EST5EDT,M3.2.0,M11.1.0',
    'America/Tortola': 'AST4',
    'America/Vancouver': 'PST8PDT,M3.2.0,M11.1.0',
    'America/Whitehorse': 'MST7',
    'America/Winnipeg': 'CST6CDT,M3.2.0,M11.1.0',
    'America/Yakutat': 'AKST9AKDT,M3.2.0,M11.1.0',
    'America/Yellowknife': 'MST7MDT,M3.2.0,M11.1.0',
    'Antarctica/Casey': '<+11>-11',
    'Antarctica/Davis': '<+07>-7',
    'Antarctica/DumontDUrville': '<+10>-10',
    'Antarctica/Macquarie': '<+11>-11',
    'Antarctica/Mawson': '<+05>-5',
    'Antarctica/McMurdo': 'NZST-12NZDT,M9.5.0,M4.1.0/3',
    'Antarctica/Palmer': '<-03>3',
    'Antarctica/Rothera': '<-03>3',
    'Antarctica/Syowa': '<+03>-3',
    'Antarctica/Troll': '<+00>0<+02>-2,M3.5.0/1,M10.5.0/3',
    'Antarctica/Vostok': '<+06>-6',
    'Arctic/Longyearbyen': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Asia/Aden': '<+03>-3',
    'Asia/Almaty': '<+06>-6',
    'Asia/Amman': 'EET-2EEST,M3.5.4/24,M10.5.5/1',
    'Asia/Anadyr': '<+12>-12',
    'Asia/Aqtau': '<+05>-5',
    'Asia/Aqtobe': '<+05>-5',
    'Asia/Ashgabat': '<+05>-5',
    'Asia/Atyrau': '<+05>-5',
    'Asia/Baghdad': '<+03>-3',
    'Asia/Bahrain': '<+03>-3',
    'Asia/Baku': '<+04>-4',
    'Asia/Bangkok': '<+07>-7',
    'Asia/Barnaul': '<+07>-7',
    'Asia/Beirut': 'EET-2EEST,M3.5.0/0,M10.5.0/0',
    'Asia/Bishkek': '<+06>-6',
    'Asia/Brunei': '<+08>-8',
    'Asia/Chita': '<+09>-9',
    'Asia/Choibalsan': '<+08>-8',
    'Asia/Colombo': '<+0530>-5:30',
    'Asia/Damascus': 'EET-2EEST,M3.5.5/0,M10.5.5/0',
    'Asia/Dhaka': '<+06>-6',
    'Asia/Dili': '<+09>-9',
    'Asia/Dubai': '<+04>-4',
    'Asia/Dushanbe': '<+05>-5',
    'Asia/Famagusta': 'EET-2EEST,M3.5.0/3,M10.5.0/4',
    'Asia/Gaza': 'EET-2EEST,M3.5.6/0,M10.5.6/1',
    'Asia/Hebron': 'EET-2EEST,M3.5.6/0,M10.5.6/1',
    'Asia/Ho Chi Minh': '<+07>-7',
    'Asia/Hong Kong': 'HKT-8',
    'Asia/Hovd': '<+07>-7',
    'Asia/Irkutsk': '<+08>-8',
    'Asia/Jakarta': 'WIB-7',
    'Asia/Jayapura': 'WIT-9',
    'Asia/Jerusalem': 'IST-2IDT,M3.4.4/26,M10.5.0',
    'Asia/Kabul': '<+0430>-4:30',
    'Asia/Kamchatka': '<+12>-12',
    'Asia/Karachi': 'PKT-5',
    'Asia/Kathmandu': '<+0545>-5:45',
    'Asia/Khandyga': '<+09>-9',
    'Asia/Kolkata': 'IST-5:30',
    'Asia/Krasnoyarsk': '<+07>-7',
    'Asia/Kuala Lumpur': '<+08>-8',
    'Asia/Kuching': '<+08>-8',
    'Asia/Kuwait': '<+03>-3',
    'Asia/Macau': 'CST-8',
    'Asia/Magadan': '<+11>-11',
    'Asia/Makassar': 'WITA-8',
    'Asia/Manila': 'PST-8',
    'Asia/Muscat': '<+04>-4',
    'Asia/Nicosia': 'EET-2EEST,M3.5.0/3,M10.5.0/4',
    'Asia/Novokuznetsk': '<+07>-7',
    'Asia/Novosibirsk': '<+07>-7',
    'Asia/Omsk': '<+06>-6',
    'Asia/Oral': '<+05>-5',
    'Asia/Phnom Penh': '<+07>-7',
    'Asia/Pontianak': 'WIB-7',
    'Asia/Pyongyang': 'KST-9',
    'Asia/Qatar': '<+03>-3',
    'Asia/Qostanay': '<+06>-6',
    'Asia/Qyzylorda': '<+05>-5',
    'Asia/Riyadh': '<+03>-3',
    'Asia/Sakhalin': '<+11>-11',
    'Asia/Samarkand': '<+05>-5',
    'Asia/Seoul': 'KST-9',
    'Asia/Shanghai': 'CST-8',
    'Asia/Singapore': '<+08>-8',
    'Asia/Srednekolymsk': '<+11>-11',
    'Asia/Taipei': 'CST-8',
    'Asia/Tashkent': '<+05>-5',
    'Asia/Tbilisi': '<+04>-4',
    'Asia/Tehran': '<+0330>-3:30<+0430>,J79/24,J263/24',
    'Asia/Thimphu': '<+06>-6',
    'Asia/Tokyo': 'JST-9',
    'Asia/Tomsk': '<+07>-7',
    'Asia/Ulaanbaatar': '<+08>-8',
    'Asia/Urumqi': '<+06>-6',
    'Asia/Ust-Nera': '<+10>-10',
    'Asia/Vientiane': '<+07>-7',
    'Asia/Vladivostok': '<+10>-10',
    'Asia/Yakutsk': '<+09>-9',
    'Asia/Yangon': '<+0630>-6:30',
    'Asia/Yekaterinburg': '<+05>-5',
    'Asia/Yerevan': '<+04>-4',
    'Atlantic/Azores': '<-01>1<+00>,M3.5.0/0,M10.5.0/1',
    'Atlantic/Bermuda': 'AST4ADT,M3.2.0,M11.1.0',
    'Atlantic/Canary': 'WET0WEST,M3.5.0/1,M10.5.0',
    'Atlantic/Cape Verde': '<-01>1',
    'Atlantic/Faroe': 'WET0WEST,M3.5.0/1,M10.5.0',
    'Atlantic/Madeira': 'WET0WEST,M3.5.0/1,M10.5.0',
    'Atlantic/Reykjavik': 'GMT0',
    'Atlantic/South Georgia': '<-02>2',
    'Atlantic/St Helena': 'GMT0',
    'Atlantic/Stanley': '<-03>3',
    'Australia/Adelaide': 'ACST-9:30ACDT,M10.1.0,M4.1.0/3',
    'Australia/Brisbane': 'AEST-10',
    'Australia/Broken Hill': 'ACST-9:30ACDT,M10.1.0,M4.1.0/3',
    'Australia/Currie': 'AEST-10AEDT,M10.1.0,M4.1.0/3',
    'Australia/Darwin': 'ACST-9:30',
    'Australia/Eucla': '<+0845>-8:45',
    'Australia/Hobart': 'AEST-10AEDT,M10.1.0,M4.1.0/3',
    'Australia/Lindeman': 'AEST-10',
    'Australia/Lord Howe': '<+1030>-10:30<+11>-11,M10.1.0,M4.1.0',
    'Australia/Melbourne': 'AEST-10AEDT,M10.1.0,M4.1.0/3',
    'Australia/Perth': 'AWST-8',
    'Australia/Sydney': 'AEST-10AEDT,M10.1.0,M4.1.0/3',
    'Europe/Amsterdam': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Andorra': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Astrakhan': '<+04>-4',
    'Europe/Athens': 'EET-2EEST,M3.5.0/3,M10.5.0/4',
    'Europe/Belgrade': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Berlin': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Bratislava': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Brussels': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Bucharest': 'EET-2EEST,M3.5.0/3,M10.5.0/4',
    'Europe/Budapest': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Busingen': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Chisinau': 'EET-2EEST,M3.5.0,M10.5.0/3',
    'Europe/Copenhagen': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Dublin': 'IST-1GMT0,M10.5.0,M3.5.0/1',
    'Europe/Gibraltar': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Guernsey': 'GMT0BST,M3.5.0/1,M10.5.0',
    'Europe/Helsinki': 'EET-2EEST,M3.5.0/3,M10.5.0/4',
    'Europe/Isle of Man': 'GMT0BST,M3.5.0/1,M10.5.0',
    'Europe/Istanbul': '<+03>-3',
    'Europe/Jersey': 'GMT0BST,M3.5.0/1,M10.5.0',
    'Europe/Kaliningrad': 'EET-2',
    'Europe/Kiev': 'EET-2EEST,M3.5.0/3,M10.5.0/4',
    'Europe/Kirov': '<+03>-3',
    'Europe/Lisbon': 'WET0WEST,M3.5.0/1,M10.5.0',
    'Europe/Ljubljana': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/London': 'GMT0BST,M3.5.0/1,M10.5.0',
    'Europe/Luxembourg': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Madrid': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Malta': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Mariehamn': 'EET-2EEST,M3.5.0/3,M10.5.0/4',
    'Europe/Minsk': '<+03>-3',
    'Europe/Monaco': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Moscow': 'MSK-3',
    'Europe/Oslo': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Paris': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Podgorica': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Prague': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Riga': 'EET-2EEST,M3.5.0/3,M10.5.0/4',
    'Europe/Rome': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Samara': '<+04>-4',
    'Europe/San Marino': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Sarajevo': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Saratov': '<+04>-4',
    'Europe/Simferopol': 'MSK-3',
    'Europe/Skopje': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Sofia': 'EET-2EEST,M3.5.0/3,M10.5.0/4',
    'Europe/Stockholm': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Tallinn': 'EET-2EEST,M3.5.0/3,M10.5.0/4',
    'Europe/Tirane': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Ulyanovsk': '<+04>-4',
    'Europe/Uzhgorod': 'EET-2EEST,M3.5.0/3,M10.5.0/4',
    'Europe/Vaduz': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Vatican': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Vienna': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Vilnius': 'EET-2EEST,M3.5.0/3,M10.5.0/4',
    'Europe/Volgograd': '<+03>-3',
    'Europe/Warsaw': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Zagreb': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Europe/Zaporozhye': 'EET-2EEST,M3.5.0/3,M10.5.0/4',
    'Europe/Zurich': 'CET-1CEST,M3.5.0,M10.5.0/3',
    'Indian/Antananarivo': 'EAT-3',
    'Indian/Chagos': '<+06>-6',
    'Indian/Christmas': '<+07>-7',
    'Indian/Cocos': '<+0630>-6:30',
    'Indian/Comoro': 'EAT-3',
    'Indian/Kerguelen': '<+05>-5',
    'Indian/Mahe': '<+04>-4',
    'Indian/Maldives': '<+05>-5',
    'Indian/Mauritius': '<+04>-4',
    'Indian/Mayotte': 'EAT-3',
    'Indian/Reunion': '<+04>-4',
    'Pacific/Apia': '<+13>-13',
    'Pacific/Auckland': 'NZST-12NZDT,M9.5.0,M4.1.0/3',
    'Pacific/Bougainville': '<+11>-11',
    'Pacific/Chatham': '<+1245>-12:45<+1345>,M9.5.0/2:45,M4.1.0/3:45',
    'Pacific/Chuuk': '<+10>-10',
    'Pacific/Easter': '<-06>6<-05>,M9.1.6/22,M4.1.6/22',
    'Pacific/Efate': '<+11>-11',
    'Pacific/Enderbury': '<+13>-13',
    'Pacific/Fakaofo': '<+13>-13',
    'Pacific/Fiji': '<+12>-12<+13>,M11.2.0,M1.2.3/99',
    'Pacific/Funafuti': '<+12>-12',
    'Pacific/Galapagos': '<-06>6',
    'Pacific/Gambier': '<-09>9',
    'Pacific/Guadalcanal': '<+11>-11',
    'Pacific/Guam': 'ChST-10',
    'Pacific/Honolulu': 'HST10',
    'Pacific/Kiritimati': '<+14>-14',
    'Pacific/Kosrae': '<+11>-11',
    'Pacific/Kwajalein': '<+12>-12',
    'Pacific/Majuro': '<+12>-12',
    'Pacific/Marquesas': '<-0930>9:30',
    'Pacific/Midway': 'SST11',
    'Pacific/Nauru': '<+12>-12',
    'Pacific/Niue': '<-11>11',
    'Pacific/Norfolk': '<+11>-11<+12>,M10.1.0,M4.1.0/3',
    'Pacific/Noumea': '<+11>-11',
    'Pacific/Pago Pago': 'SST11',
    'Pacific/Palau': '<+09>-9',
    'Pacific/Pitcairn': '<-08>8',
    'Pacific/Pohnpei': '<+11>-11',
    'Pacific/Port Moresby': '<+10>-10',
    'Pacific/Rarotonga': '<-10>10',
    'Pacific/Saipan': 'ChST-10',
    'Pacific/Tahiti': '<-10>10',
    'Pacific/Tarawa': '<+12>-12',
    'Pacific/Tongatapu': '<+13>-13',
    'Pacific/Wake': '<+12>-12',
    'Pacific/Wallis': '<+12>-12'
  };
  
    /**
   * 国コード→言語コードマッピング
   * CloudflareのCF-IPCountryヘッダーから言語を自動判定
   */
    const COUNTRY_TO_LANGUAGE = {
        'JP': 'ja',
        'CN': 'zh_cn',
        'TW': 'zh_tw',
        'HK': 'zh_tw',
        'MO': 'zh_tw',
        'BR': 'pt_br',
        'PT': 'pt',
        'KR': 'ko',
        'DE': 'de',
        'FR': 'fr',
        'ES': 'es',
        'IT': 'it',
        'RU': 'ru',
        'UA': 'uk',
        'TR': 'tr',
        'PL': 'pl',
        'NL': 'nl',
        'NO': 'no',
        'SE': 'sv',
        'DK': 'da',
        'FI': 'fi',
        'CZ': 'cs',
        'SK': 'sk',
        'BG': 'bg',
        'RO': 'ro',
        'HU': 'hu',
        'GR': 'el',
        'IL': 'he',
        'MY': 'ms',
        'LT': 'lt',
        'VN': 'vi'
      };

  /**
   * プライバシー通知メッセージ（多言語対応）
   * ユーザーに個人情報を収集しないことを通知
   */
  const noticeMessages = {
    en: "We do not store, share, or track personal information.",
    ar: "نحن لا نخزن أو نشارك أو نتتبع المعلومات الشخصية.",
    bg: "Ние не съхраняваме, споделяме или проследяваме лична информация.",
    ca: "No emmagatzemem, compartim ni seguim informació personal.",
    cs: "Neukládáme, nesdílíme ani nesledujeme osobní údaje.",
    da: "Vi gemmer, deler eller sporer ikke personlige oplysninger.",
    de: "Wir speichern, teilen oder verfolgen keine persönlichen Daten.",
    el: "Δεν αποθηκεύουμε, κοινοποιούμε ή παρακολουθούμε προσωπικές πληροφορίες.",
    es: "No almacenamos, compartimos ni rastreamos información personal.",
    fi: "Emme tallenna, jaa tai seuraa henkilötietoja.",
    fr: "Nous ne stockons, partageons ou suivons aucune information personnelle.",
    he: "אנחנו לא שומרים, משתפים או עוקבים אחר מידע אישי.",
    hu: "Nem tárolunk, osztunk meg vagy követünk személyes adatokat.",
    it: "Non memorizziamo, condividiamo o tracciamo informazioni personali.",
    ja: "個人情報の保存共有追跡はしません",
    ko: "개인정보의 저장, 공유 또는 추적은 하지 않습니다.",
    lt: "Mes nesaugome, nebendriname ir nesekame asmeninės informacijos.",
    ms: "Kami tidak menyimpan, berkongsi atau menjejaki maklumat peribadi.",
    nl: "Wij slaan geen persoonlijke gegevens op, delen deze niet of volgen deze niet.",
    no: "Vi lagrer, deler eller sporer ikke personlig informasjon.",
    pl: "Nie przechowujemy, nie udostępniamy ani nie śledzimy danych osobowych.",
    pt: "Não armazenamos, partilhamos ou rastreamos informações pessoais.",
    pt_br: "Não armazenamos, compartilhamos ou rastreamos informações pessoais.",
    ro: "Nu stocăm, partajăm sau urmărim informații personale.",
    ru: "Мы не сохраняем, не передаем и не отслеживаем личную информацию.",
    sk: "Neukladáme, nezdieľame ani nesledujeme osobné údaje.",
    sv: "Vi lagrar, delar eller spårar inte personlig information.",
    tr: "Kişisel bilgileri saklamayız, paylaşmayız veya izlemeyiz.",
    uk: "Ми не зберігаємо, не передаємо та не відстежуємо особисту інформацію.",
    vi: "Chúng tôi không lưu trữ, chia sẻ hoặc theo dõi thông tin cá nhân.",
    zh_cn: "我们不会保存、共享或追踪个人信息。",
    zh_tw: "我們不會儲存、分享或追蹤個人資訊。"
  };
  
// ========================================
// ユーティリティ関数セクション
// ========================================

/**
 * IPv6アドレスが指定されたプレフィックス範囲内にあるかチェック
 * @param {string} ipv6 - チェック対象のIPv6アドレス
 * @param {string} prefixStr - プレフィックス文字列
 * @param {number} prefixLen - プレフィックス長
 * @returns {boolean}
 */
function checkIPv6InRangeJS(ipv6, prefixStr, prefixLen) {
    if (!ipv6 || !prefixStr) return false;
  
    function parseIPv6(ip) {
      const parts = ip.split(':');
      const groups = [];
      let zeroStart = -1;
  
      for (let i = 0; i < parts.length; i++) {
        if (parts[i] === '') {
          if (zeroStart === -1) zeroStart = i;
        } else {
          groups.push(parseInt(parts[i], 16));
        }
      }
  
      if (zeroStart !== -1) {
        const zeros = 8 - groups.length;
        const before = groups.slice(0, zeroStart);
        const after = groups.slice(zeroStart);
        return [...before, ...Array(zeros).fill(0), ...after];
      }
  
      return groups;
    }
  
    const ipGroups = parseIPv6(ipv6);
    const prefixGroups = parseIPv6(prefixStr);
  
    if (ipGroups.length !== 8 || prefixGroups.length !== 8) return false;
  
    const bitsToCheck = prefixLen;
    let checkedBits = 0;
  
    for (let i = 0; i < 8 && checkedBits < bitsToCheck; i++) {
      const bitsInGroup = Math.min(16, bitsToCheck - checkedBits);
      const mask = (0xFFFF << (16 - bitsInGroup)) & 0xFFFF;
  
      if ((ipGroups[i] & mask) !== (prefixGroups[i] & mask)) {
        return false;
      }
  
      checkedBits += bitsInGroup;
    }
  
    return true;
  }
  
  /**
   * IPv6アドレスから東西判定を行う
   * @param {string} ipv6 - 判定対象のIPv6アドレス
   * @returns {string|null} 'east'/'west'/null
   */
  function determineJurisdiction(ipv6) {
    if (!ipv6) return null;
  
    for (const prefix of JURISDICTION_PREFIXES.east) {
      if (checkIPv6InRangeJS(ipv6, prefix.prefix, prefix.length)) {
        return 'east';
      }
    }
  
    for (const prefix of JURISDICTION_PREFIXES.west) {
      if (checkIPv6InRangeJS(ipv6, prefix.prefix, prefix.length)) {
        return 'west';
      }
    }
  
    return null;
  }
  
/**
 * DS-Lite判定関数
 * 1. IPv6プレフィックスで直接判定
 * 2. IPv6でマッチしない場合、AS番号で判定
 * @param {string} ipv6 - 判定対象のIPv6アドレス
 * @param {number|null} userAsn - ユーザーのAS番号
 * @returns {object|null} DS-Liteルール、またはnull
 */
function checkDSLiteRule(ipv6, userAsn = null) {
    if (!ipv6) return null;
    let matchedAsRule = null;

    for (const rule of dsliteRulesData.aftrRules) {
        if (rule.ipv6PrefixRanges) {
            for (const range of rule.ipv6PrefixRanges) {
                const [prefix, lenStr] = range.split('/');
                if (checkIPv6InRangeJS(ipv6, prefix, parseInt(lenStr, 10))) {
                    return createResult(rule, ipv6);
                }
            }
        }
        if (!matchedAsRule && userAsn && rule.asn && rule.asn.includes(userAsn)) {
            matchedAsRule = rule;
        }
    }

    if (matchedAsRule) {
        return createResult(matchedAsRule, ipv6);
    }

    return null;

    function createResult(rule, v6) {
        const result = {
            type: "ds-lite",
            aftrType: rule.aftrType,
            peeraddr: rule.aftrFqdn,
            tunlink: rule.tunlink || "wan6"
        };
        if (rule.aftrAddresses) {
            const jurisdiction = determineJurisdiction(v6);
            result.jurisdiction = jurisdiction;
            result.aftrIpv6Address = rule.aftrAddresses[jurisdiction];
        }
        return result;
    }
}
  
  /**
   * MAP-Eルールをチェック
   * @param {string} ipv6 - チェック対象のIPv6アドレス
   * @returns {object|null} マッチしたMAP-Eルール
   */
  function checkMapERule(ipv6) {
    if (!ipv6) return null;
  
    for (const rule of mapRulesData.basicMapRules) {
      if (rule.ipv6Prefix && rule.ipv6PrefixLength) {
        if (checkIPv6InRangeJS(ipv6, rule.ipv6Prefix, rule.ipv6PrefixLength)) {
          return rule;
        }
      }
    }
  
    return null;
  }
  
  /**
   * IPv4プレフィックス長からpsidOffsetを計算
   * @param {string} ipv4PrefixLength - IPv4プレフィックス長
   * @returns {number|null}
   */
  function derivePsidOffsetFromV4Len(ipv4PrefixLength) {
    const v4 = Number.parseInt(ipv4PrefixLength, 10);
    if (!Number.isFinite(v4)) return null;
    return 32 - v4;
  }
  
  /**
   * EAビット長とpsidOffsetからpsidlenを計算
   * @param {string} eaBitLength - EAビット長
   * @param {number} psidOffsetCalc - 計算されたpsidOffset
   * @returns {number|null}
   */
  function calculatePsidlenFromEaAndOffset(eaBitLength, psidOffsetCalc) {
    const ea = Number.parseInt(eaBitLength, 10);
    const off = Number.parseInt(psidOffsetCalc, 10);
    if (!Number.isFinite(ea) || !Number.isFinite(off)) return null;
    let psidlen = ea - off;
    if (psidlen < 0) psidlen = 0;
    if (psidlen > 16) return null;
    return psidlen;
  }
  
  /**
   * MAP-Eルールを補完計算
   * @param {object} rule - 基本MAP-Eルール
   * @returns {object|null} 補完されたルール
   */
  function enrichMapRule(rule) {
    const calculatedOffset = derivePsidOffsetFromV4Len(rule.ipv4PrefixLength);
    if (calculatedOffset == null) return null;
    const psidlen = calculatePsidlenFromEaAndOffset(rule.eaBitLength, calculatedOffset);
    if (psidlen == null) return null;
    return {
      brIpv6Address: rule.brIpv6Address,
      ipv4Prefix: rule.ipv4Prefix,
      ipv4PrefixLength: rule.ipv4PrefixLength,
      ipv6Prefix: rule.ipv6Prefix,
      ipv6PrefixLength: rule.ipv6PrefixLength,
      eaBitLength: rule.eaBitLength,
      psidlen,
      psIdOffset: rule.psIdOffset
    };
  }
  
  /**
   * IANAタイムゾーン名からOpenWrtタイムゾーン文字列を取得
   * @param {string} zonename - IANAタイムゾーン名
   * @returns {string|null}
   */
  function getOpenwrtTimezone(zonename) {
    return openwrtTimezones[zonename] || null;
  }
  
  /**
   * 言語コードから通知メッセージを取得
   * @param {string} langCode - 言語コード
   * @returns {string}
   */
  function getNotice(langCode) {
    return noticeMessages[langCode] || noticeMessages["en"];
  }
  
  /**
   * IPv6アドレスがGUA（Global Unicast Address）かどうかを判定
   * @param {string} ipv6 - 判定対象のIPv6アドレス
   * @returns {boolean} GUAの場合true
   */
  function checkGlobalUnicastAddress(ipv6) {
    if (!ipv6) return false;
  
    const [prefix, lenStr] = guaValidation.prefixCheck.split('/');
    const prefixLen = parseInt(lenStr, 10);
    if (!checkIPv6InRangeJS(ipv6, prefix, prefixLen)) {
      return false;
    }
  
    for (const exclude of guaValidation.excludeCidrs) {
      if (checkIPv6InRangeJS(ipv6, exclude.prefix, exclude.length)) {
        return false;
      }
    }
  
    return true;
  }
  
  /**
   * IPv6アドレスから/64プレフィックスを抽出
   * @param {string} ipv6 - IPv6アドレス
   * @returns {string|null} /64プレフィックス（例：2400:4151:80e2:7500::/64）
   */
  function extractGUAPrefix(ipv6) {
    if (!ipv6) return null;
    
    function normalizeIPv6(ip) {
      const parts = ip.split(':');
      const groups = [];
      let zeroStart = -1;
      
      for (let i = 0; i < parts.length; i++) {
        if (parts[i] === '') {
          if (zeroStart === -1) zeroStart = i;
        } else {
          groups.push(parts[i].padStart(4, '0'));
        }
      }
      
      if (zeroStart !== -1) {
        const zeros = 8 - groups.length;
        const before = groups.slice(0, zeroStart);
        const after = groups.slice(zeroStart);
        const fullGroups = [...before, ...Array(zeros).fill('0000'), ...after];
        return fullGroups.slice(0, 8).join(':');
      }
      
      return groups.join(':');
    }
    
    try {
      const normalized = normalizeIPv6(ipv6);
      const parts = normalized.split(':');
      
      if (parts.length < 4) return null;
      
      return `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}::/64`;
    } catch (e) {
      return null;
    }
  }
  
  /**
   * リクエストから最適な言語を選択
   * Accept-Languageヘッダーと国コードから判定
   * @param {Request} request - Cloudflare Request
   * @param {object} cf - Cloudflare CF object
   * @returns {string} 言語コード
   */
  function selectLang(request, cf) {
    const accept = request.headers.get('Accept-Language') || '';
    if (accept) {
      const token = accept.split(',')[0].trim().toLowerCase();
      if (token) {
        if (token.startsWith('zh')) {
          if (token.includes('tw') || token.includes('hk') || token.includes('mo')) {
            return 'zh_tw';
          }
          return 'zh_cn';
        }
        if (token.startsWith('pt')) {
          if (token.includes('br')) {
            return 'pt_br';
          }
          return 'pt';
        }
        const base = token.split('-')[0];
        if (noticeMessages[base]) return base;
      }
    }
  
    const country = (cf && cf.country) ? cf.country.toUpperCase() : '';
    return COUNTRY_TO_LANGUAGE[country] || 'en';
  }

  /**
   * IPv6アドレスからPSIDを計算
   * @param {string} ipv6 - ユーザーのIPv6アドレス
   * @param {object} rule - MAP-Eルール
   * @returns {number|null} PSID値
   */
  function calculatePsid(ipv6, rule) {
    if (!ipv6 || !rule) return null;

    const psidlen = parseInt(rule.psidlen, 10);
    if (isNaN(psidlen)) return null;

    function parseIPv6ToHextets(ip) {
      const field = ip.replace("::", ":0::").match(/([0-9a-f]{1,4}):([0-9a-f]{1,4}):([0-9a-f]{1,4}):([0-9a-f]{0,4})/i);
      if (!field) return null;
      
      const hextet = [];
      for (let i = 0; i < 4; i++) {
        hextet[i] = field[i + 1] ? parseInt(field[i + 1], 16) : 0;
      }
      return hextet;
    }

    const hextet = parseIPv6ToHextets(ipv6);
    if (!hextet) return null;

    let psid;
    if (psidlen === 8) {
      psid = (hextet[3] & 0xff00) >> 8;
    } else if (psidlen === 6) {
      psid = (hextet[3] & 0x3f00) >> 8;
    } else {
      return null;
    }

    return psid;
  }

  // ========================================
  // メインハンドラー
  // ========================================
  
  export default {
    async fetch(request, env, ctx) {
      const method = request.method;
      const cf = request.cf || {};

      if (method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Cache-Control': 'no-store'
          }
        });
      }

      if (method !== 'GET') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { 'Cache-Control': 'no-store' }
        });
      }
    
      const url = new URL(request.url);
      const queryIPv6 = url.searchParams.get('ipv6');
      const hasIPv6Param = url.searchParams.has('ipv6');

      const ipHeaders = [
        request.headers.get('CF-Connecting-IPv6'),
        request.headers.get('CF-Connecting-IP'),
        request.headers.get('X-Forwarded-For'),
        request.headers.get('X-Real-IP')
      ].filter(Boolean);

      let clientIPv6 = null;
      let clientIPv4 = null;

      for (const ip of ipHeaders.join(',').split(',').map(s => s.trim())) {
        if (!clientIPv6 && ip.includes(':')) clientIPv6 = ip;
        if (!clientIPv4 && ip.includes('.')) clientIPv4 = ip;
      }

      let lookupIPv6;

      if (hasIPv6Param) {
        lookupIPv6 = queryIPv6 || null;
      } else {
        lookupIPv6 = clientIPv6;
      }

      if (lookupIPv6 && lookupIPv6.includes('/')) {
        lookupIPv6 = lookupIPv6.split('/')[0];
      }

      const isp = cf.asOrganization || null;
      const asn = cf.asn || null;
      const as = (asn && isp) ? `AS${asn} ${isp}` : (isp || `AS${asn}` || null);

      let aftrRule = null;
      let mapRule = null;

      if (lookupIPv6) {
        mapRule = checkMapERule(lookupIPv6);
        
        if (!mapRule) {
          aftrRule = checkDSLiteRule(lookupIPv6, asn);
        }

        if (mapRule) {
          mapRule = enrichMapRule(mapRule);
          
          const isMatchedPrefix = checkIPv6InRangeJS(
            lookupIPv6,
            mapRule.ipv6Prefix,
            mapRule.ipv6PrefixLength
          );

          if (isMatchedPrefix && checkGlobalUnicastAddress(lookupIPv6)) {
            const guaPrefix = extractGUAPrefix(lookupIPv6);
            if (guaPrefix) mapRule.ipv6Prefix_gua = guaPrefix;

			const psid = calculatePsid(lookupIPv6, mapRule);
    		if (psid !== null) mapRule.psid = psid;
          }
        }
      }

      const lang = selectLang(request, cf);
      const notice = getNotice(lang);

      const zonename = cf.timezone || null;
      const timezone = zonename ? getOpenwrtTimezone(zonename) : null;

      if (aftrRule) {
        aftrRule.aftrAddress = aftrRule.aftrIpv6Address || aftrRule.aftrFqdn;
      }      

      const responsePayload = {
        notice,
        language: lang,
        detection: hasIPv6Param ? 'manual' : 'auto',
        ipv4: clientIPv4 || null,
        ipv6: hasIPv6Param ? (queryIPv6 ? queryIPv6.split('/')[0] : null) : (clientIPv6 || null),
        country: cf.country || null,
        zonename,
        timezone,
        isp,
        as,
        regionName: cf.region || null,
        region: cf.regionCode || null,
        aftr: aftrRule || null,
        mape: mapRule || null
      };

      return new Response(
        JSON.stringify(responsePayload, (k, v) => k === 'calculatedOffset' ? undefined : v, 2),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store'
          }
        }
      );
    }
  };
