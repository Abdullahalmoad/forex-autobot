const { getAccountInfo, getOpenPositions } = require('../services/metaapi.service');

async function evaluateSignal(riskSettings, signal, metaapiAccountId, dailyStats) {
  const accountInfo = await getAccountInfo(metaapiAccountId);
  const positions = await getOpenPositions(metaapiAccountId);

  if (!riskSettings.allowed_symbols.includes(signal.symbol)) {
    return { allowed: false, reason: `الرمز ${signal.symbol} غير مسموح بإعدادات المخاطرة` };
  }

  if (positions.length >= riskSettings.max_open_positions) {
    return { allowed: false, reason: 'تجاوز الحد الأقصى لعدد الصفقات المفتوحة' };
  }

  const dailyLossPercent = (dailyStats.currentPnlToday / dailyStats.startBalance) * 100;
  if (dailyLossPercent <= -Math.abs(riskSettings.max_daily_loss_percent)) {
    return {
      allowed: false,
      reason: 'تم الوصول للحد الأقصى للخسارة اليومية - البوت متوقف تلقائياً',
      shouldDisableBot: true,
    };
  }

  const drawdownPercent = ((accountInfo.balance - accountInfo.equity) / accountInfo.balance) * 100;
  if (drawdownPercent >= riskSettings.max_drawdown_percent) {
    return {
      allowed: false,
      reason: 'تم الوصول للحد الأقصى للـ Drawdown - البوت متوقف تلقائياً',
      shouldDisableBot: true,
    };
  }

  const riskAmount = accountInfo.balance * (riskSettings.max_risk_per_trade_percent / 100);
  const slDistance = Math.abs(signal.entryPrice - signal.stopLoss);
  if (slDistance <= 0) {
    return { allowed: false, reason: 'مسافة وقف الخسارة غير صالحة' };
  }

  let lotSize = calculateLotSize(riskAmount, slDistance, signal.symbol);
  lotSize = Math.min(lotSize, riskSettings.max_lot_size);

  if (lotSize <= 0) {
    return { allowed: false, reason: 'حجم اللوت المحسوب صفر أو أقل - رصيد غير كافٍ' };
  }

  return { allowed: true, lotSize };
}

function calculateLotSize(riskAmount, slDistancePips, symbol) {
  const pipValuePerLot = symbol.includes('JPY') ? 9.3 : symbol === 'XAUUSD' ? 10 : 10;
  const pipsAtRisk = slDistancePips * (symbol.includes('JPY') ? 100 : symbol === 'XAUUSD' ? 10 : 10000);
  if (pipsAtRisk <= 0) return 0;
  const rawLot = riskAmount / (pipsAtRisk * pipValuePerLot);
  return Math.max(0.01, Math.round(rawLot * 100) / 100);
}

module.exports = { evaluateSignal, calculateLotSize };
