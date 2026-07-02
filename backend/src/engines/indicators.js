function sma(values, period) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    out.push(sum / period);
  }
  return out;
}

function ema(values, period) {
  const out = [];
  const k = 2 / (period + 1);
  let prevEma = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    if (prevEma === null) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += values[j];
      prevEma = sum / period;
    } else {
      prevEma = values[i] * k + prevEma * (1 - k);
    }
    out.push(prevEma);
  }
  return out;
}

function rsi(candles, period = 14) {
  const closes = candles.map(c => c.close);
  const out = new Array(closes.length).fill(null);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period; avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return out;
}

function macd(candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const closes = candles.map(c => c.close);
  const emaFast = ema(closes, fastPeriod);
  const emaSlow = ema(closes, slowPeriod);
  const macdLine = closes.map((_, i) => emaFast[i] !== null && emaSlow[i] !== null ? emaFast[i] - emaSlow[i] : null);
  const macdValuesOnly = macdLine.map(v => (v === null ? 0 : v));
  const signalRaw = ema(macdValuesOnly, signalPeriod);
  const signalLine = macdLine.map((v, i) => (v === null ? null : signalRaw[i]));
  const histogram = macdLine.map((v, i) => v !== null && signalLine[i] !== null ? v - signalLine[i] : null);
  return { macdLine, signalLine, histogram };
}

function atr(candles, period = 14) {
  const trs = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) { trs.push(candles[i].high - candles[i].low); continue; }
    const highLow = candles[i].high - candles[i].low;
    const highClose = Math.abs(candles[i].high - candles[i - 1].close);
    const lowClose = Math.abs(candles[i].low - candles[i - 1].close);
    trs.push(Math.max(highLow, highClose, lowClose));
  }
  const out = new Array(trs.length).fill(null);
  let prevAtr = null;
  for (let i = 0; i < trs.length; i++) {
    if (i < period - 1) continue;
    if (prevAtr === null) {
      let sum = 0;
      for (let j = 0; j <= i; j++) sum += trs[j];
      prevAtr = sum / period;
    } else {
      prevAtr = (prevAtr * (period - 1) + trs[i]) / period;
    }
    out[i] = prevAtr;
  }
  return out;
}

function adx(candles, period = 14) {
  const len = candles.length;
  const plusDM = new Array(len).fill(0);
  const minusDM = new Array(len).fill(0);
  const tr = new Array(len).fill(0);
  for (let i = 1; i < len; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
    minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;
    const highLow = candles[i].high - candles[i].low;
    const highClose = Math.abs(candles[i].high - candles[i - 1].close);
    const lowClose = Math.abs(candles[i].low - candles[i - 1].close);
    tr[i] = Math.max(highLow, highClose, lowClose);
  }
  const smooth = (arr) => {
    const out = new Array(len).fill(null);
    let sum = 0;
    for (let i = 1; i <= period; i++) sum += arr[i] || 0;
    out[period] = sum;
    for (let i = period + 1; i < len; i++) {
      out[i] = out[i - 1] - (out[i - 1] / period) + arr[i];
    }
    return out;
  };
  const smoothTR = smooth(tr);
  const smoothPlusDM = smooth(plusDM);
  const smoothMinusDM = smooth(minusDM);
  const plusDI = new Array(len).fill(null);
  const minusDI = new Array(len).fill(null);
  const dx = new Array(len).fill(null);
  for (let i = period; i < len; i++) {
    if (!smoothTR[i]) continue;
    plusDI[i] = (smoothPlusDM[i] / smoothTR[i]) * 100;
    minusDI[i] = (smoothMinusDM[i] / smoothTR[i]) * 100;
    const diSum = plusDI[i] + minusDI[i];
    dx[i] = diSum === 0 ? 0 : (Math.abs(plusDI[i] - minusDI[i]) / diSum) * 100;
  }
  const adxOut = new Array(len).fill(null);
  let sumDx = 0, count = 0;
  for (let i = period; i < len; i++) {
    if (dx[i] === null) continue;
    count++;
    if (count <= period) {
      sumDx += dx[i];
      if (count === period) adxOut[i] = sumDx / period;
    } else {
      adxOut[i] = (adxOut[i - 1] * (period - 1) + dx[i]) / period;
    }
  }
  return { adx: adxOut, plusDI, minusDI };
}

function bollingerBands(candles, period = 20, stdDevMultiplier = 2) {
  const closes = candles.map(c => c.close);
  const middle = sma(closes, period);
  const upper = [], lower = [];
  for (let i = 0; i < closes.length; i++) {
    if (middle[i] === null) { upper.push(null); lower.push(null); continue; }
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += Math.pow(closes[j] - middle[i], 2);
    const stdDev = Math.sqrt(sumSq / period);
    upper.push(middle[i] + stdDev * stdDevMultiplier);
    lower.push(middle[i] - stdDev * stdDevMultiplier);
  }
  return { upper, middle, lower };
}

function stochastic(candles, kPeriod = 14, dPeriod = 3) {
  const kValues = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) { kValues.push(null); continue; }
    let highest = -Infinity, lowest = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      highest = Math.max(highest, candles[j].high);
      lowest = Math.min(lowest, candles[j].low);
    }
    const range = highest - lowest;
    kValues.push(range === 0 ? 50 : ((candles[i].close - lowest) / range) * 100);
  }
  const kClean = kValues.map(v => (v === null ? 0 : v));
  const dRaw = sma(kClean, dPeriod);
  const dValues = kValues.map((v, i) => (v === null ? null : dRaw[i]));
  return { k: kValues, d: dValues };
}

function supertrend(candles, period = 10, multiplier = 3) {
  const atrValues = atr(candles, period);
  const len = candles.length;
  const upperBand = new Array(len).fill(null);
  const lowerBand = new Array(len).fill(null);
  const trend = new Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    if (atrValues[i] === null) continue;
    const mid = (candles[i].high + candles[i].low) / 2;
    let basicUpper = mid + multiplier * atrValues[i];
    let basicLower = mid - multiplier * atrValues[i];
    const prevUpper = upperBand[i - 1];
    const prevLower = lowerBand[i - 1];
    const prevClose = i > 0 ? candles[i - 1].close : null;
    if (prevUpper !== null && !(basicUpper < prevUpper || prevClose > prevUpper)) basicUpper = prevUpper;
    if (prevLower !== null && !(basicLower > prevLower || prevClose < prevLower)) basicLower = prevLower;
    upperBand[i] = basicUpper;
    lowerBand[i] = basicLower;
    if (i === 0 || trend[i - 1] === null) {
      trend[i] = candles[i].close <= basicUpper ? 'down' : 'up';
    } else if (trend[i - 1] === 'up') {
      trend[i] = candles[i].close < lowerBand[i] ? 'down' : 'up';
    } else {
      trend[i] = candles[i].close > upperBand[i] ? 'up' : 'down';
    }
  }
  return { trend, upperBand, lowerBand };
}

function ichimoku(candles, conversionPeriod = 9, basePeriod = 26, spanBPeriod = 52) {
  const highLowAvg = (period, index) => {
    if (index < period - 1) return null;
    let highest = -Infinity, lowest = Infinity;
    for (let j = index - period + 1; j <= index; j++) {
      highest = Math.max(highest, candles[j].high);
      lowest = Math.min(lowest, candles[j].low);
    }
    return (highest + lowest) / 2;
  };
  const len = candles.length;
  const conversionLine = [], baseLine = [], spanA = [], spanB = [];
  for (let i = 0; i < len; i++) {
    conversionLine.push(highLowAvg(conversionPeriod, i));
    baseLine.push(highLowAvg(basePeriod, i));
    spanA.push(conversionLine[i] !== null && baseLine[i] !== null ? (conversionLine[i] + baseLine[i]) / 2 : null);
    spanB.push(highLowAvg(spanBPeriod, i));
  }
  return { conversionLine, baseLine, spanA, spanB };
}

function vwap(candles) {
  const out = [];
  let cumulativePV = 0, cumulativeVolume = 0;
  for (const c of candles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume || 0;
    cumulativePV += typicalPrice * vol;
    cumulativeVolume += vol;
    out.push(cumulativeVolume === 0 ? null : cumulativePV / cumulativeVolume);
  }
  return out;
}

function obv(candles) {
  const out = [0];
  for (let i = 1; i < candles.length; i++) {
    const vol = candles[i].volume || 0;
    if (candles[i].close > candles[i - 1].close) out.push(out[i - 1] + vol);
    else if (candles[i].close < candles[i - 1].close) out.push(out[i - 1] - vol);
    else out.push(out[i - 1]);
  }
  return out;
}

module.exports = { sma, ema, rsi, macd, atr, adx, bollingerBands, stochastic, supertrend, ichimoku, vwap, obv };
