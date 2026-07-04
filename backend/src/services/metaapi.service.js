const MetaApi = require('metaapi.cloud-sdk').default;

const token = process.env.METAAPI_TOKEN;
if (!token) {
  console.warn('⚠️  METAAPI_TOKEN غير موجود بمتغيرات البيئة - خدمة MetaApi لن تعمل.');
}

const api = new MetaApi(token);
const symbolCache = new Map();

async function connectAccount({ login, password, server, accountType }) {
  const account = await api.metatraderAccountApi.createAccount({
    name: `user-${login}`,
    type: 'cloud',
    login,
    password,
    server,
    platform: 'mt5',
    magic: 900000,
    reliability: accountType === 'live' ? 'high' : 'regular',
  });

  await account.deploy();
  await account.waitConnected();

  return { metaapiAccountId: account.id, state: account.state };
}

async function getAccountConnection(metaapiAccountId) {
  const account = await api.metatraderAccountApi.getAccount(metaapiAccountId);
  const connection = account.getStreamingConnection();
  await connection.connect();
  await connection.waitSynchronized();
  return { account, connection };
}

async function getAccountInfo(metaapiAccountId) {
  const { connection } = await getAccountConnection(metaapiAccountId);
  return connection.terminalState.accountInformation;
}

async function getOpenPositions(metaapiAccountId) {
  const { connection } = await getAccountConnection(metaapiAccountId);
  return connection.terminalState.positions;
}

async function placeMarketOrder(metaapiAccountId, { symbol, direction, volume, stopLoss, takeProfit, comment }) {
  const { connection } = await getAccountConnection(metaapiAccountId);

  if (!stopLoss) {
    throw new Error('رفض تنفيذ الصفقة: لازم تحديد وقف خسارة لكل صفقة تلقائية.');
  }

  const method = direction === 'buy' ? 'createMarketBuyOrder' : 'createMarketSellOrder';
  const result = await connection[method](symbol, volume, stopLoss, takeProfit, {
    comment: comment || 'auto-bot',
  });
  return result;
}

async function closePosition(metaapiAccountId, positionId) {
  const { connection } = await getAccountConnection(metaapiAccountId);
  return connection.closePosition(positionId);
}

async function getCandles(metaapiAccountId, symbol, timeframe = '15m', limit = 250) {
  const account = await api.metatraderAccountApi.getAccount(metaapiAccountId);
  const candles = await account.getHistoricalCandles(symbol, timeframe, undefined, limit);
  const sorted = [...candles].sort((a, b) => new Date(a.time) - new Date(b.time));
  return sorted.map(c => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.tickVolume || c.volume || 0,
  }));
}

const COMMON_SUFFIXES = ['', '.m', 'm', '.a', '.pro', '.raw', '_i', '.i'];

async function resolveSymbol(metaapiAccountId, genericSymbol) {
  const cacheKey = `${metaapiAccountId}:${genericSymbol}`;
  if (symbolCache.has(cacheKey)) return symbolCache.get(cacheKey);

  for (const suffix of COMMON_SUFFIXES) {
    const candidate = `${genericSymbol}${suffix}`;
    try {
      const candles = await getCandles(metaapiAccountId, candidate, '15m', 2);
      if (candles && candles.length > 0) {
        symbolCache.set(cacheKey, candidate);
        return candidate;
      }
    } catch (err) {
        console.error(`resolveSymbol failed for ${candidate}:`, err.message);
    }
  }
  symbolCache.set(cacheKey, null);
  return null;
}

module.exports = {
  connectAccount,
  getAccountInfo,
  getOpenPositions,
  placeMarketOrder,
  closePosition,
  getCandles,
  resolveSymbol,
  getAccountConnection,
};
