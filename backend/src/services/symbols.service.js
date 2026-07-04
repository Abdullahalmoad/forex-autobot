const { getAccountConnection } = require('./metaapi.service');

const CANONICAL_SYMBOLS = [
  { code: 'XAUUSD', group: 'metals', labelAr: 'الذهب', labelEn: 'Gold', aliases: ['XAUUSD', 'GOLDUSD', 'GOLD'], defaultOn: true },
  { code: 'XAGUSD', group: 'metals', labelAr: 'الفضة', labelEn: 'Silver', aliases: ['XAGUSD', 'SILVERUSD', 'SILVER'], defaultOn: false },
  { code: 'BTCUSD', group: 'crypto', labelAr: 'بيتكوين', labelEn: 'Bitcoin', aliases: ['BTCUSD', 'BTCUSDT', 'XBTUSD'], defaultOn: true },
  { code: 'ETHUSD', group: 'crypto', labelAr: 'إيثيريوم', labelEn: 'Ethereum', aliases: ['ETHUSD', 'ETHUSDT'], defaultOn: false },
  { code: 'EURUSD', group: 'forex', labelAr: 'يورو / دولار', labelEn: 'EUR/USD', aliases: ['EURUSD'], defaultOn: false },
  { code: 'GBPUSD', group: 'forex', labelAr: 'استرليني / دولار', labelEn: 'GBP/USD', aliases: ['GBPUSD'], defaultOn: false },
  { code: 'USDJPY', group: 'forex', labelAr: 'دولار / ين', labelEn: 'USD/JPY', aliases: ['USDJPY'], defaultOn: false },
  { code: 'USDCHF', group: 'forex', labelAr: 'دولار / فرنك', labelEn: 'USD/CHF', aliases: ['USDCHF'], defaultOn: false },
  { code: 'AUDUSD', group: 'forex', labelAr: 'أسترالي / دولار', labelEn: 'AUD/USD', aliases: ['AUDUSD'], defaultOn: false },
  { code: 'USDCAD', group: 'forex', labelAr: 'دولار / كندي', labelEn: 'USD/CAD', aliases: ['USDCAD'], defaultOn: false },
  { code: 'NZDUSD', group: 'forex', labelAr: 'نيوزلندي / دولار', labelEn: 'NZD/USD', aliases: ['NZDUSD'], defaultOn: false },
  { code: 'EURGBP', group: 'forex_cross', labelAr: 'يورو / استرليني', labelEn: 'EUR/GBP', aliases: ['EURGBP'], defaultOn: false },
  { code: 'EURJPY', group: 'forex_cross', labelAr: 'يورو / ين', labelEn: 'EUR/JPY', aliases: ['EURJPY'], defaultOn: false },
  { code: 'GBPJPY', group: 'forex_cross', labelAr: 'استرليني / ين', labelEn: 'GBP/JPY', aliases: ['GBPJPY'], defaultOn: false },
];

const GROUP_LABELS = {
  metals: 'المعادن',
  crypto: 'العملات الرقمية',
  forex: 'أزواج العملات الرئيسية',
  forex_cross: 'أزواج متقاطعة',
};

function normalize(raw) {
  return raw.toUpperCase().replace(/[^A-Z]/g, '');
}

async function fetchBrokerSymbols(metaapiAccountId) {
  const connection = await getAccountConnection(metaapiAccountId);
  const rawSymbols = await connection.getSymbols();
  return rawSymbols.map((name) => ({ name, normalized: normalize(name) }));
}

function matchBrokerSymbol(canonical, brokerSymbols) {
  const candidates = brokerSymbols.filter((s) =>
    canonical.aliases.some((alias) => s.normalized.startsWith(alias))
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.normalized.length - b.normalized.length);
  return candidates[0].name;
}

async function getAvailableSymbolsForAccount(metaapiAccountId) {
  const brokerSymbols = await fetchBrokerSymbols(metaapiAccountId);
  return CANONICAL_SYMBOLS.map((canonical) => {
    const brokerSymbol = matchBrokerSymbol(canonical, brokerSymbols);
    return {
      code: canonical.code,
      labelAr: canonical.labelAr,
      labelEn: canonical.labelEn,
      group: canonical.group,
      groupLabel: GROUP_LABELS[canonical.group],
      available: Boolean(brokerSymbol),
      brokerSymbol: brokerSymbol || null,
      defaultOn: canonical.defaultOn,
    };
  });
}

module.exports = {
  CANONICAL_SYMBOLS,
  GROUP_LABELS,
  normalize,
  fetchBrokerSymbols,
  matchBrokerSymbol,
  getAvailableSymbolsForAccount,
};
