const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { encrypt, decrypt } = require('../utils/crypto');
const { connectAccount, getAccountInfo } = require('../services/metaapi.service');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

router.post('/connect', async (req, res) => {
  const { userId, brokerName, server, login, password, accountType } = req.body;

  if (!userId || !server || !login || !password) {
    return res.status(400).json({ error: 'بيانات ناقصة' });
  }

  try {
    const { metaapiAccountId, state } = await connectAccount({
      login,
      password,
      server,
      accountType: accountType || 'demo',
    });

    const encryptedPassword = encrypt(password);

    const { data, error } = await supabase
      .from('broker_accounts')
      .insert({
        user_id: userId,
        broker_name: brokerName || 'unknown',
        server,
        login,
        encrypted_password: encryptedPassword,
        metaapi_account_id: metaapiAccountId,
        account_type: accountType || 'demo',
        connection_status: state === 'DEPLOYED' ? 'connected' : 'pending',
        is_active: false,
      })
      .select()
      .single();

    if (error) throw error;

    await supabase.from('risk_settings').insert({
      broker_account_id: data.id,
    });

    res.json({ success: true, account: { id: data.id, connection_status: data.connection_status } });
  } catch (err) {
    console.error('خطأ بربط الحساب:', err.message);
    res.status(500).json({ error: 'فشل ربط الحساب. تأكد من صحة رقم الحساب، السيرفر، وكلمة المرور.' });
  }
});

router.get('/:accountId/info', async (req, res) => {
  try {
    const { data: account, error } = await supabase
      .from('broker_accounts')
      .select('metaapi_account_id')
      .eq('id', req.params.accountId)
      .single();

    if (error || !account) return res.status(404).json({ error: 'الحساب غير موجود' });

    const info = await getAccountInfo(account.metaapi_account_id);
    res.json({ balance: info.balance, equity: info.equity, currency: info.currency, leverage: info.leverage });
  } catch (err) {
    res.status(500).json({ error: 'فشل جلب معلومات الحساب' });
  }
});

module.exports = router;
