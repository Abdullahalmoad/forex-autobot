const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const { checkAccountSignal } = require('../routes/signals.routes');
const { resolveSymbol } = require('../services/metaapi.service');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function startScheduler() {
  cron.schedule('*/15 * * * *', async () => {
    console.log('🔄 بدء فحص الإشارات التلقائي:', new Date().toISOString());
    try {
      const { data: accounts, error } = await supabase
        .from('broker_accounts')
        .select('id, account_type, is_active, metaapi_account_id')
        .eq('is_active', true)
        .eq('account_type', 'demo');

      if (error) throw error;

      for (const account of accounts || []) {
        try {
          const { data: riskSettings, error: riskErr } = await supabase
            .from('risk_settings')
            .select('allowed_symbols')
            .eq('broker_account_id', account.id)
            .single();

          if (riskErr || !riskSettings) {
            console.warn(`⚠️ لا توجد إعدادات مخاطرة للحساب ${account.id}`);
            continue;
          }

          const symbols = riskSettings.allowed_symbols || [];

          for (const genericSymbol of symbols) {
            try {
              const resolvedSymbol = await resolveSymbol(account.metaapi_account_id, genericSymbol);
              if (!resolvedSymbol) {
                console.warn(`⚠️ لم يتم إيجاد رمز مطابق لـ ${genericSymbol}`);
                continue;
              }
              const result = await checkAccountSignal(account.id, resolvedSymbol, '15m');
              console.log(`فحص ${genericSymbol} (${resolvedSymbol}):`, result.hasSignal ? result.signal?.direction : 'لا توجد إشارة');
            } catch (err) {
              console.error(`فشل فحص ${genericSymbol}:`, err.message);
            }
          }
        } catch (err) {
          console.error(`فشل معالجة الحساب ${account.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('فشل جلب الحسابات:', err.message);
    }
    console.log('✅ انتهى الفحص - التالي بعد 15 دقيقة');
  });

  console.log('⏰ الجدولة التلقائية مفعّلة - كل 15 دقيقة');
}

module.exports = { startScheduler };
