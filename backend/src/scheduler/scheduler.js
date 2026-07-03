const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const { checkAccountSignal } = require('../routes/signals.routes');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SYMBOLS_TO_WATCH = ['EURUSD'];

function startScheduler() {
  cron.schedule('*/15 * * * *', async () => {
    console.log('⏰ فحص الإشارات التلقائي بدأ:', new Date().toISOString());
    try {
      const { data: accounts, error } = await supabase
        .from('broker_accounts')
        .select('id, account_type, is_active')
        .eq('is_active', true)
        .eq('account_type', 'demo');

      if (error) throw error;

      for (const account of accounts || []) {
        for (const symbol of SYMBOLS_TO_WATCH) {
          try {
            const result = await checkAccountSignal(account.id, symbol, '15m');
            console.log(`نتيجة ${symbol} للحساب ${account.id}:`, result.hasSignal ? result.signal?.direction : 'لا توجد إشارة');
          } catch (err) {
            console.error(`فشل فحص ${symbol} للحساب ${account.id}:`, err.message);
          }
        }
      }
    } catch (err) {
      console.error('فشل المجدول التلقائي:', err.message);
    }
  });
  console.log('✅ المجدول التلقائي شغال - فحص كل 15 دقيقة على حسابات Demo');
}

module.exports = { startScheduler };
