const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const { getCandles, placeMarketOrder, getAccountInfo } = require('../services/metaapi.service');
const { generateSignal } = require('../engines/strategy.engine');
const { evaluateSignal } = require('../engines/risk.engine');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('⚠️ TELEGRAM_CHAT_ID غير موجود - تم تخطي الإشعار.');
    return;
  }
  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId, text, parse_mode: 'Markdown'
    });
  } catch (err) {
    console.error('فشل إرسال إشعار تيليجرام:', err.message);
  }
}

// ملاحظة: عمود الربح/الخسارة بجدول trades اسمه pnl (تم التأكد من schema.sql)
async function getDailyStats(brokerAccountId, currentBalance) {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todayTrades, error } = await supabase
      .from('trades')
      .select('pnl')
      .eq('broker_account_id', brokerAccountId)
      .gte('opened_at', todayStart.toISOString());
    if (error) throw error;
    const currentPnlToday = (todayTrades || []).reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
    return { currentPnlToday, startBalance: currentBalance - currentPnlToday || currentBalance };
  } catch (err) {
    console.warn('تعذر حساب إحصائيات اليوم من جدول trades، سيُفترض عدم وجود خسائر اليوم:', err.message);
    return { currentPnlToday: 0, startBalance: currentBalance };
  }
}

async function checkAccountSignal(brokerAccountId, symbol, timeframe = '15m') {
  const { data: account, error: accErr } = await supabase
    .from('broker_accounts')
    .select('*')
    .eq('id', brokerAccountId)
    .single();
  if (accErr || !account) throw new Error('الحساب غير موجود');
  if (!account.is_active) return { skipped: true, reason: 'الحساب غير مفعّل' };

  const { data: riskSettings, error: riskErr } = await supabase
    .from('risk_settings')
    .select('*')
    .eq('broker_account_id', brokerAccountId)
    .single();
  if (riskErr || !riskSettings) throw new Error('إعدادات المخاطرة غير موجودة لهذا الحساب');

  const candles = await getCandles(account.metaapi_account_id, symbol, timeframe, 250);
  const { signal, log } = generateSignal(candles, symbol);

  if (!signal) {
    return { hasSignal: false, log };
  }

  const accountInfoForStats = await getAccountInfo(account.metaapi_account_id);
  const dailyStats = await getDailyStats(brokerAccountId, accountInfoForStats.balance);

  const decision = await evaluateSignal(riskSettings, signal, account.metaapi_account_id, dailyStats);

  if (!decision.allowed) {
    await sendTelegramMessage(
      `⚠️ إشارة ${signal.direction === 'buy' ? 'شراء' : 'بيع'} على *${symbol}* رُفضت:\n${decision.reason}`
    );
    return { hasSignal: true, executed: false, signal, decision, log };
  }

  const order = await placeMarketOrder(account.metaapi_account_id, {
    symbol,
    direction: signal.direction,
    volume: decision.lotSize,
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfit,
    comment: 'auto-signal'
  });

  await sendTelegramMessage(
    `✅ تم تنفيذ صفقة *${signal.direction === 'buy' ? 'شراء' : 'بيع'}* على *${symbol}*\n` +
    `الحجم: ${decision.lotSize}\nالدخول: ${signal.entryPrice}\nوقف الخسارة: ${signal.stopLoss}\nجني الأرباح: ${signal.takeProfit}`
  );

  return { hasSignal: true, executed: true, signal, decision, order, log };
}

router.post('/check', async (req, res) => {
  const { brokerAccountId, symbol, timeframe } = req.body;
  if (!brokerAccountId || !symbol) {
    return res.status(400).json({ error: 'brokerAccountId و symbol مطلوبين' });
  }
  try {
    const result = await checkAccountSignal(brokerAccountId, symbol, timeframe || '15m');
    res.json(result);
  } catch (err) {
    console.error('خطأ فحص الإشارة:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, checkAccountSignal };
