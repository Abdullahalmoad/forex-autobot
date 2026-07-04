const { getAccountConnection } = require('./metaapi.service');

// ==== قواعد التصنيف التلقائي (تشتغل مع أي وسيط بالعالم) ====

const CURRENCY_LABELS_AR = {
  USD: 'دولار أمريكي', EUR: 'يورو', GBP: 'استرليني', JPY: 'ين ياباني',
  CHF: 'فرنك سويسري', AUD: 'دولار استرالي', CAD: 'دولار كندي', NZD: 'دولار نيوزلندي',
  CNH: 'يوان صيني', SGD: 'دولار سنغافوري', TRY: 'ليرة تركية', ZAR: 'راند جنوب أفريقي',
  MXN: 'بيزو مكسيكي', HKD: 'دولار هونج كونج', SEK: 'كرونة سويدية', NOK: 'كرونة نرويجية',
  DKK: 'كرونة دنماركية', PLN: 'زلوتي بولندي', SAR: 'ريال سعودي', AED: 'درهم إماراتي',
};
const CURRENCY_CODES = Object.keys(CURRENCY_LABELS_AR).concat([
  'HUF', 'CZK', 'ILS', 'THB', 'RUB', 'INR', 'BRL', 'KRW', 'IDR', 'PHP'
]);

const METAL_LABELS_AR = { XAU: 'الذهب', XAG: 'الفضة', XPT: 'البلاتين', XPD: 'البلاديوم' };

const CRYPTO_LABELS_AR = {
  BTC: 'بيتكوين', ETH: 'إيثيريوم', XRP: 'ريبل', LTC: 'لايتكوين', BCH: 'بيتكوين كاش',
  ADA: 'كاردانو', DOT: 'بولكادوت', SOL: 'سولانا', DOGE: 'دوجكوين', BNB: 'بينانس كوين',
  LINK: 'تشين لينك', MATIC: 'بوليجون', AVAX: 'أفالانش', TRX: 'ترون', ATOM: 'كوزموس',
  UNI: 'يونيسواب', XLM: 'ستيلر', ETC: 'إيثيريوم كلاسيك', FIL: 'فايلكوين', SHIB: 'شيبا إينو',
  NEAR: 'نير', ALGO: 'ألجوراند', VET: 'فيتشين', ICP: 'إنترنت كمبيوتر',
};

const INDEX_PATTERNS = [
  'US30', 'US500', 'USTEC', 'US100', 'US2000', 'NAS100', 'SPX500', 'DJI30',
  'UK100', 'GER40', 'GER30', 'DE40', 'DE30', 'FRA40', 'EU50', 'STOXX50',
  'JP225', 'JPN225', 'AUS200', 'HK50', 'CHINA50', 'CHINAH', 'ESP35', 'ITA40'
];

function stripBrokerSuffix(raw) {
  // يشيل لواحق الوسيط الشائعة مثل .a .m .pro أو أرقام آخر الرمز
  return raw.replace(/[._-]?(m|c|pro|ecn|raw|micro|a|i)?\d*$/i, raw).trim();
}

function normalize(raw) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function classifySymbol(rawName) {
  const norm = normalize(rawName);

  // مؤشرات
  const indexMatch = INDEX_PATTERNS.find((p) => norm.startsWith(p));
  if (indexMatch) {
    return { group: 'indices', groupLabel: 'المؤشرات', labelAr: indexMatch, labelEn: indexMatch, code: indexMatch };
  }

  // معادن
  const metalCode = Object.keys(METAL_LABELS_AR).find((m) => norm.startsWith(m));
  if (metalCode) {
    const quote = CURRENCY_CODES.find((c) => norm.includes(c) && c !== metalCode);
    const code = quote ? metalCode + quote : metalCode + 'USD';
    return {
      group: 'metals', groupLabel: 'المعادن',
      labelAr: METAL_LABELS_AR[metalCode], labelEn: metalCode + '/' + (quote || 'USD'), code,
    };
  }

  // كريبتو
  const cryptoCode = Object.keys(CRYPTO_LABELS_AR).find((c) => norm.startsWith(c));
  if (cryptoCode) {
    const quote = CURRENCY_CODES.concat(['USDT', 'USDC']).find((c) => norm.slice(cryptoCode.length).startsWith(c));
    const code = cryptoCode + (quote || 'USD');
    return {
      group: 'crypto', groupLabel: 'العملات الرقمية',
      labelAr: CRYPTO_LABELS_AR[cryptoCode], labelEn: cryptoCode + '/' + (quote || 'USD'), code,
    };
  }

  // فوركس: عملتين من 3 أحرف
  if (norm.length >= 6) {
    const base = norm.slice(0, 3);
    const quote = norm.slice(3, 6);
    if (CURRENCY_CODES.includes(base) && CURRENCY_CODES.includes(quote)) {
      const isMajor = base === 'USD' || quote === 'USD';
      const baseAr = CURRENCY_LABELS_AR[base] || base;
      const quoteAr = CURRENCY_LABELS_AR[quote] || quote;
      return {
        group: isMajor ? 'forex' : 'forex_cross',
        groupLabel: isMajor ? 'أزواج العملات الرئيسية' : 'أزواج متقاطعة',
        labelAr: `${baseAr} / ${quoteAr}`, labelEn: `${base}/${quote}`, code: base + quote,
      };
    }
  }

  // أي شي ثاني (أسهم، عقود آجلة، رموز خاصة بالوسيط)
  return { group: 'other', groupLabel: 'رموز أخرى', labelAr: rawName, labelEn: rawName, code: norm };
}

async function fetchBrokerSymbols(metaapiAccountId) {
  const { connection } = await getAccountConnection(metaapiAccountId);

  if (!connection.synchronized) {
    await connection.waitSynchronized({ timeoutInSeconds: 60 });
  }

  const specifications = connection.terminalState.specifications;

  if (!specifications || specifications.length === 0) {
    throw new Error('لا توجد رموز متزامنة بعد - terminalState.specifications فاضية');
  }

  return specifications.map((spec) => spec.symbol);
}

// النتيجة: كل رموز الوسيط الفعلية، مصنّفة تلقائياً، بدون الاعتماد على قائمة ثابتة
async function getAvailableSymbolsForAccount(metaapiAccountId) {
  const rawSymbols = await fetchBrokerSymbols(metaapiAccountId);

  const results = rawSymbols.map((brokerSymbol) => {
    const classified = classifySymbol(brokerSymbol);
    return {
      ...classified,
      available: true,
      brokerSymbol,
      defaultOn: ['XAUUSD', 'BTCUSD', 'EURUSD'].includes(classified.code),
    };
  });

  // ترتيب: معادن ثم كريبتو ثم فوركس رئيسي ثم متقاطع ثم مؤشرات ثم الباقي
  const groupOrder = { metals: 0, crypto: 1, forex: 2, forex_cross: 3, indices: 4, other: 5 };
  results.sort((a, b) => (groupOrder[a.group] - groupOrder[b.group]) || a.code.localeCompare(b.code));

  return results;
}

module.exports = {
  normalize,
  classifySymbol,
  fetchBrokerSymbols,
  getAvailableSymbolsForAccount,
};
