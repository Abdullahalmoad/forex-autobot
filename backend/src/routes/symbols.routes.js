const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { getAvailableSymbolsForAccount } = require('../services/symbols.service');

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function resolveMetaapiAccountId(accountId) {
  const { data, error } = await supabase
    .from('broker_accounts')
    .select('metaapi_account_id')
    .eq('id', accountId)
    .single();

  if (error || !data) {
    throw new Error('لم يتم العثور على حساب الوسيط المرتبط بهذا المستخدم');
  }
  return data.metaapi_account_id;
}

router.get('/:accountId', async (req, res) => {
  const { accountId } = req.params;
  try {
    const metaapiAccountId = await resolveMetaapiAccountId(accountId);
    const availableSymbols = await getAvailableSymbolsForAccount(metaapiAccountId);

    const { data: riskSettings } = await supabase
      .from('risk_settings')
      .select('allowed_symbols')
      .eq('broker_account_id', accountId)
      .single();

    const currentlyEnabled = new Set(riskSettings?.allowed_symbols || []);
    const isFirstTime = !riskSettings;

      const { data: symbolSettingsRows } = await supabase
        .from('symbol_settings')
        .select('*')
        .eq('broker_account_id', accountId);
      const symbolSettingsMap = new Map((symbolSettingsRows || []).map((r) => [r.symbol_code, r]));

      const result = availableSymbols.map((sym) => ({
        ...sym,
        enabled: isFirstTime
          ? sym.defaultOn && sym.available
          : currentlyEnabled.has(sym.brokerSymbol),
        lot_size: symbolSettingsMap.get(sym.brokerSymbol)?.lot_size ?? 0.01,
        max_open_positions: symbolSettingsMap.get(sym.brokerSymbol)?.max_open_positions ?? 1,
      }));

    if (isFirstTime) {
      const defaultSymbols = result.filter((s) => s.enabled).map((s) => s.brokerSymbol);
      await supabase.from('risk_settings').upsert({
        broker_account_id: accountId,
        allowed_symbols: defaultSymbols,
      });
    }

    res.json({ success: true, symbols: result });
  } catch (err) {
    console.error('خطأ بجلب الرموز:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:accountId', async (req, res) => {
  const { accountId } = req.params;
    const { enabledCodes, symbolSettings: symbolSettingsInput } = req.body;

  if (!Array.isArray(enabledCodes)) {
    return res.status(400).json({ success: false, error: 'enabledCodes يجب أن تكون مصفوفة' });
  }

  try {
    const metaapiAccountId = await resolveMetaapiAccountId(accountId);
    const availableSymbols = await getAvailableSymbolsForAccount(metaapiAccountId);

    const brokerSymbolsToSave = availableSymbols
      .filter((s) => enabledCodes.includes(s.code) && s.available)
      .map((s) => s.brokerSymbol);

    const { error } = await supabase.from('risk_settings').upsert({
      broker_account_id: accountId,
      allowed_symbols: brokerSymbolsToSave,
    });

    if (error) throw error;

      if (Array.isArray(symbolSettingsInput)) {
        for (const item of symbolSettingsInput) {
          const matched = availableSymbols.find((s) => s.code === item.code);
          if (!matched) continue;
          await supabase.from('symbol_settings').upsert({
            broker_account_id: accountId,
            symbol_code: matched.brokerSymbol,
            lot_size: item.lot_size ?? 0.01,
            max_open_positions: item.max_open_positions ?? 1,
          }, { onConflict: 'broker_account_id,symbol_code' });
        }
      }

    res.json({ success: true, saved: brokerSymbolsToSave });
  } catch (err) {
    console.error('خطأ بحفظ الرموز:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
