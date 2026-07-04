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

    const result = availableSymbols.map((sym) => ({
      ...sym,
      enabled: isFirstTime
        ? sym.defaultOn && sym.available
        : currentlyEnabled.has(sym.brokerSymbol),
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
  const { enabledCodes } = req.body;

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

    res.json({ success: true, saved: brokerSymbolsToSave });
  } catch (err) {
    console.error('خطأ بحفظ الرموز:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
