const MetaApi = require('metaapi.cloud-sdk').default;

const token = process.env.METAAPI_TOKEN;
if (!token) {
  console.warn('⚠️ METAAPI_TOKEN غير موجود - جميع عمليات MetaApi لن تعمل.');
}

const api = new MetaApi(token);

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

async function getCandles(metaapiAccountId, symbol, timeframe = '15m', limit = 250) {
  const account = await api.metatraderAccountApi.getAccount(metaapiAccountId);
  const candles = await account.getHistoricalCandles(symbol, timeframe, undefined, limit);
  return candles.map(c => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.tickVolume || c.volume || 0
  }));
}

async function placeMarketOrder(metaapiAccountId, { symbol, direction, volume, stopLoss, takeProfit, comment }) {
  const { connection } = await getAccountConnection(metaapiAccountId);

  if (!stopLoss) {
    throw new Error('يُرفض تنفيذ أي صفقة بدون تحديد وقف خسارة إلزامي.');
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

module.exports = {
  connectAccount,
  getAccountInfo,
  getOpenPositions,
  getCandles,
  placeMarketOrder,
  closePosition,
};
