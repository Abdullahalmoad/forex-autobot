const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { encrypt } = require('../utils/crypto');
const { connectAccount } = require('../services/metaapi.service');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function notifyOwner(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId, text, parse_mode: 'Markdown'
    });
  } catch (err) {
    console.error('فشل إرسال إشعار تلغرام:', err.message);
  }
}

router.post('/', async (req, res) => {
  const { fullName, phone, brokerName, server, login, password, accountType } = req.body;

  if (!fullName || !phone || !server || !login || !password) {
    return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
  }

  try {
    const placeholderEmail = `wa${phone.replace(/[^0-9]/g, '')}@users.forexautobot.local`;
    const authPassword = crypto.randomBytes(16).toString('hex');

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: placeholderEmail,
      password: authPassword,
      email_confirm: true,
      phone,
    });
    if (authError) throw authError;

    const userId = authData.user.id;
    const trialExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: profileError } = await supabase.from('profiles').insert({
      id: userId,
      full_name: fullName,
      phone,
      subscription_tier: 'free',
      subscription_status: 'trial',
      subscription_expires_at: trialExpiresAt,
    });
    if (profileError) throw profileError;

    const { metaapiAccountId, state } = await connectAccount({
      login,
      password,
      server,
      accountType: accountType || 'demo',
    });

    const encryptedPassword = encrypt(password);

    const { data: brokerAccount, error: brokerError } = await supabase
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
    if (brokerError) throw brokerError;

    await supabase.from('risk_settings').insert({ broker_account_id: brokerAccount.id });

    await notifyOwner(
      `🆕 *تسجيل جديد*\n👤 ${fullName}\n📱 ${phone}\n🏦 ${brokerName || 'غير محدد'}\n🖥 السيرفر: ${server}\n🔑 لوجن: ${login}\n📅 التجربة تنتهي: ${new Date(trialExpiresAt).toLocaleDateString('ar-EG')}`
    );

    res.json({ success: true, accountId: brokerAccount.id, trialExpiresAt });
  } catch (err) {
    console.error('خطأ بالتسجيل:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
