// ========================================
// データベース定義セクション
// ========================================

/**
 * 東西判定用IPv6プレフィックス定義
 * NTT東日本・西日本のIPv6アドレス範囲を定義
 */
const JURISDICTION_PREFIXES = {
  east: [
    { prefix: "2400:4050::", length: 32 },
    { prefix: "2400:4051::", length: 32 },
    { prefix: "2400:4052::", length: 32 },
    { prefix: "2001:380:a000::", length: 44 },
    { prefix: "2001:380:a100::", length: 44 },
    { prefix: "2001:380:a200::", length: 44 },
    { prefix: "2001:380:a300::", length: 44 }
  ],
  west: [
    { prefix: "2400:4150::", length: 32 },
    { prefix: "2400:4151::", length: 32 },
    { prefix: "2400:4152::", length: 32 },
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
      aftrType: "transix",
      ipv6PrefixRanges: [
        "2404:8e00::/32", "2404:8e01::/32",
        "240b:0010::/32", "240b:0011::/32", "240b:0012::/32"
      ],
      aftrAddresses: {
        east: "2404:8e00::feed:100",
        west: "2404:8e01::feed:100"
      },
      aftrFqdn: "gw.transix.jp"
    },
    {
      aftrType: "xpass",
      ipv6PrefixRanges: [
        "2001:e30:1c1e::/48", "2001:e30:1c1f::/48"
      ],
      aftrAddresses: {
        east: "2404:8e02::feed:100",
        west: "2404:8e03::feed:100"
      },
      aftrFqdn: "dgw.xpass.jp"
    },
    {
      aftrType: "v6option",
      ipv6PrefixRanges: [
        "2404:8e00::/32", "2404:8e01::/32"
      ],
      aftrAddresses: {
        east: "2404:8e04::feed:100",
        west: "2404:8e05::feed:100"
      },
      aftrFqdn: "dslite.v6connect.net"
    }
  ]
};

/**
 * MAP-E ルールデータベース
 * IPv6プレフィックスからMAP-E設定パラメータを判定
 * 
 * ※注意: ここには最小限のサンプルのみ記載
 * 実際の運用スクリプトでは6000行以上のルールが入っています
 */
const mapRulesData = {
  "basicMapRules": [
    // OCN
    // v6プラス
    // nuro光
    {
      "brIpv6Address": "xxxx:xxxx:xxxx::x",
      "eaBitLength": "xx",
      "ipv4Prefix": "xxx.xxx.xxx.0",
      "ipv4PrefixLength": "xx",
      "ipv6Prefix": "24xx:xxxx:xx00::",
      "ipv6PrefixLength": "xx",
      "psIdOffset": "x"
    }
  ]
};

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
 * DS-Lite AFTRルールをチェック
 * @param {string} ipv6 - チェック対象のIPv6アドレス
 * @returns {object|null} マッチしたAFTRルール
 */
function checkDSLiteRule(ipv6) {
  if (!ipv6) return null;

  for (const rule of dsliteRulesData.aftrRules) {
    for (const range of rule.ipv6PrefixRanges) {
      const [prefix, lenStr] = range.split('/');
      const len = parseInt(lenStr, 10);

      if (checkIPv6InRangeJS(ipv6, prefix, len)) {
        const jurisdiction = determineJurisdiction(ipv6);
        const aftrIpv6Address = jurisdiction && rule.aftrAddresses
          ? rule.aftrAddresses[jurisdiction]
          : null;

        return {
          aftrType: rule.aftrType,
          jurisdiction: jurisdiction,
          aftrIpv6Address: aftrIpv6Address,
          peeraddr: rule.aftrFqdn
        };
      }
    }
  }

  return null;
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
    ...rule,
    calculatedOffset,
    psidlen
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

  // 2000::/3の範囲内かチェック
  if (!checkIPv6InRangeJS(ipv6, guaValidation.prefixCheck.split('/')[0], guaValidation.prefixLength)) {
    return false;
  }

  // 除外CIDRに該当しないかチェック
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

  const parts = ipv6.split(':');
  if (parts.length < 4) return null;

  return `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}::/64`;
}

/**
 * リクエストから最適な言語を選択
 * Accept-Languageヘッダーと国コードから判定
 * @param {Request} request - Cloudflare Request
 * @param {object} cf - Cloudflare CF object
 * @returns {string} 言語コード
 */
function selectLang(request, cf) {
  // Accept-Languageヘッダーから判定
  const accept = request.headers.get('Accept-Language') || '';
  if (accept) {
    const token = accept.split(',')[0].trim().toLowerCase();
    if (token) {
      // 中国語の地域判定
      if (token.startsWith('zh')) {
        if (token.includes('tw') || token.includes('hk') || token.includes('mo')) {
          return 'zh_tw';
        }
        return 'zh_cn';
      }
      // ポルトガル語の地域判定
      if (token.startsWith('pt')) {
        if (token.includes('br')) {
          return 'pt_br';
        }
        return 'pt';
      }
      // 基本言語コードで判定
      const base = token.split('-')[0];
      if (noticeMessages[base]) return base;
    }
  }

  // 国コードから判定
  const country = (cf && cf.country) ? cf.country.toUpperCase() : '';
  return COUNTRY_TO_LANGUAGE[country] || 'en';
}

// ========================================
// メインハンドラー
// ========================================

export default {
  async fetch(request, env, ctx) {
    const method = request.method;
    const cf = request.cf || {};

    // CORSプリフライト対応
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

    // 非GETメソッド拒否
    if (method !== 'GET') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    // IPv6/IPv4アドレス抽出
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

    // DS-Lite / MAP-E 判定
    let aftrRule = null;
    let mapRule = null;

    if (clientIPv6) {
      aftrRule = checkDSLiteRule(clientIPv6);
      if (!aftrRule) {
        mapRule = checkMapERule(clientIPv6);
        if (mapRule) {
          mapRule = enrichMapRule(mapRule);
          
          // MAP-EでGUAの場合、ipv6Prefix_guaを追加
          if (mapRule && checkGlobalUnicastAddress(clientIPv6)) {
            const guaPrefix = extractGUAPrefix(clientIPv6);
            if (guaPrefix) {
              mapRule.ipv6Prefix_gua = guaPrefix;
            }
          }
        }
      }
    }

    // AS情報構築
    const isp = cf.asOrganization || null;
    const asn = cf.asn || null;
    const as = (asn && isp) ? `AS${asn} ${isp}` : (isp || `AS${asn}` || null);

    // 言語・通知
    const lang = selectLang(request, cf);
    const notice = getNotice(lang);

    // タイムゾーン処理
    const zonename = cf.timezone || null;
    const timezone = zonename ? getOpenwrtTimezone(zonename) : null;

    // AFTRアドレスの選定ロジック
    if (aftrRule) {
      aftrRule.aftrAddress = aftrRule.aftrIpv6Address || aftrRule.peeraddr;
    }
    
    // レスポンス構築
    const responsePayload = {
      notice,
      language: lang,
      ipv4: clientIPv4 || null,
      ipv6: clientIPv6 || null,
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
