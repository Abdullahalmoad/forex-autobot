require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { checkAccountSignal } = require('../routes/signals.routes');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SYMBOLS_TO_WATCH = ['EURUSD.m'];

async function run() {
  console.log('🤖 بدء فحص الإشارات:', new Date().toISOString());

  const { data: accounts, error } = await supabase
    .from('broker_accounts')
    .select('id, account_type, is_active')
    .eq('is_active', true);

  if (error) throw error;

  for (const account of accounts || []) {
    for (const symbol of SYMBOLS_TO_WATCH) {
      try {
        const result = await checkAccountSignal(account.id, symbol, '15m');
        console.log(`✅ ${account.id} [${account.account_type}] ${symbol}:`, result.hasSignal ? result.signal?.direction : 'لا إشارة');
      } catch (err) {
        console.error(`❌ فشل فحص ${account.id} ${symbol}:`, err.message);
      }
    }
  }

  console.log('✅ انتهى الفحص بنجاح');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('فشل التشغيل:', err.message);
    process.exit(1);
  });
