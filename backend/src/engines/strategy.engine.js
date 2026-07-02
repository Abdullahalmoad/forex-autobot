const { ema, rsi, macd, atr, adx, supertrend, ichimoku } = require('./indicators');

const MIN_ADX_FOR_TREND = 20;

function analyzeTrend(candles) {
  const closes = candles.map(c => c.close);
  const ema200 = ema(closes, 200);
  const { adx: adxValues } = adx(candles, 14);
  const ich = ichimoku(candles);
  const i = candles.length - 1;
  const price = closes[i];
  const currentEma200 = ema200[i];
  const currentAdx = adxValues[i];
  const cloudTop = Math.max(ich.spanA[i] || -Infinity, ich.spanB[i] || -Infinity);
  const cloudBottom = Math.min(ich.spanA[i] || Infinity, ich.spanB[i] || Infinity);

  if (currentEma200 === null || currentAdx === null || ich.spanA[i] === null) {
    return { hasTrend: false, direction: null, reason: 'بيانات غير كافية لتحديد الاتجاه' };
  }
  if (currentAdx < MIN_ADX_FOR_TREND) {
    return { hasTrend: false, direction: null, reason: `السوق عرضي (ADX=${currentAdx.toFixed(1)}) - لا يوجد اتجاه واضح` };
  }
  const aboveEma = price > currentEma200;
  const aboveCloud = price > cloudTop;
  const belowCloud = price < cloudBottom;

  if (aboveEma && aboveCloud) {
    return { hasTrend: true, direction: 'up', reason: `اتجاه صاعد مؤكد (ADX=${currentAdx.toFixed(1)})` };
  }
  if (!aboveEma && belowCloud) {
    return { hasTrend: true, direction: 'down', reason: `اتجاه هابط مؤكد (ADX=${currentAdx.toFixed(1)})` };
  }
  return { hasTrend: false, direction: null, reason: 'تضارب بين EMA200 وسحابة Ichimoku' };
}

function findEntryTrigger(candles, trendDirection) {
  const st = supertrend(candles, 10, 3);
  const macdData = macd(candles);
  const i = candles.length - 1;
  const prevI = i - 1;

  if (prevI < 0 || st.trend[prevI] === null || macdData.macdLine[i] === null || macdData.macdLine[prevI] === null) {
    return { triggered: false, reason: 'بيانات غير كافية لتحديد نقطة الدخول' };
  }
  const supertrendFlippedUp = st.trend[prevI] === 'down' && st.trend[i] === 'up';
  const supertrendFlippedDown = st.trend[prevI] === 'up' && st.trend[i] === 'down';
  const macdCrossUp = macdData.macdLine[prevI] <= macdData.signalLine[prevI] && macdData.macdLine[i] > macdData.signalLine[i];
  const macdCrossDown = macdData.macdLine[prevI] >= macdData.signalLine[prevI] && macdData.macdLine[i] < macdData.signalLine[i];

  if (trendDirection === 'up' && (supertrendFlippedUp || macdCrossUp)) {
    return { triggered: true, direction: 'buy', reason: supertrendFlippedUp ? 'انعكاس Supertrend للصعود' : 'تقاطع MACD صاعد' };
  }
  if (trendDirection === 'down' && (supertrendFlippedDown || macdCrossDown)) {
    return { triggered: true, direction: 'sell', reason: supertrendFlippedDown ? 'انعكاس Supertrend للهبوط' : 'تقاطع MACD هابط' };
  }
  return { triggered: false, reason: 'لا توجد إشارة دخول حالياً بنفس اتجاه الترند' };
}

function confirmSignal(candles, direction) {
  const rsiValues = rsi(candles, 14);
  const i = candles.length - 1;
  const currentRsi = rsiValues[i];
  if (currentRsi === null) return { confirmed: false, reason: 'بيانات RSI غير كافية' };
  if (direction === 'buy' && currentRsi >= 75) return { confirmed: false, reason: `RSI مرتفع جداً (${currentRsi.toFixed(1)}) - تشبع شراء` };
  if (direction === 'sell' && currentRsi <= 25) return { confirmed: false, reason: `RSI منخفض جداً (${currentRsi.toFixed(1)}) - تشبع بيع` };
  return { confirmed: true, reason: `RSI ضمن نطاق آمن (${currentRsi.toFixed(1)})` };
}

function calculateRiskLevels(candles, direction, atrMultiplierSL = 1.5, riskRewardRatio = 2) {
  const atrValues = atr(candles, 14);
  const i = candles.length - 1;
  const currentAtr = atrValues[i];
  const entryPrice = candles[i].close;
  if (currentAtr === null) return null;
  const slDistance = currentAtr * atrMultiplierSL;
  const tpDistance = slDistance * riskRewardRatio;
  if (direction === 'buy') {
    return { entryPrice, stopLoss: entryPrice - slDistance, takeProfit: entryPrice + tpDistance };
  }
  return { entryPrice, stopLoss: entryPrice + slDistance, takeProfit: entryPrice - tpDistance };
}

function generateSignal(candles, symbol) {
  const log = [];
  if (!candles || candles.length < 200) {
    return { signal: null, log: ['بيانات غير كافية - يحتاج 200 شمعة على الأقل'] };
  }
  const trend = analyzeTrend(candles);
  log.push(`[اتجاه] ${trend.reason}`);
  if (!trend.hasTrend) return { signal: null, log };

  const entry = findEntryTrigger(candles, trend.direction);
  log.push(`[دخول] ${entry.reason}`);
  if (!entry.triggered) return { signal: null, log };

  const confirmation = confirmSignal(candles, entry.direction);
  log.push(`[تأكيد] ${confirmation.reason}`);
  if (!confirmation.confirmed) return { signal: null, log };

  const riskLevels = calculateRiskLevels(candles, entry.direction);
  if (!riskLevels) { log.push('[مخاطرة] تعذر حساب مستويات وقف الخسارة'); return { signal: null, log }; }
  log.push(`[مخاطرة] SL: ${riskLevels.stopLoss.toFixed(5)} | TP: ${riskLevels.takeProfit.toFixed(5)}`);

  return {
    signal: { symbol, direction: entry.direction, entryPrice: riskLevels.entryPrice, stopLoss: riskLevels.stopLoss, takeProfit: riskLevels.takeProfit },
    log,
  };
}

module.exports = { generateSignal, analyzeTrend, findEntryTrigger, confirmSignal, calculateRiskLevels };
