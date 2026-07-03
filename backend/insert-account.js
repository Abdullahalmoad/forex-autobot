require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { encrypt } = require('./src/utils/crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const encryptedPassword = encrypt('Amhrefah123123#');

  const { data, error } = await supabase
    .from('broker_accounts')
    .insert({
      user_id: 'c4565b7e-f065-411d-935e-e85c2d10821d',
      broker_name: 'JustMarkets',
      server: 'JustMarkets-Demo3',
      login: '1200157231',
      encrypted_password: encryptedPassword,
      metaapi_account_id: 'aeabf0d8-6658-476a-bcb7-f14e75bce333',
      account_type: 'demo',
      connection_status: 'connected',
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error('❌ خطأ:', error.message);
  } else {
    console.log('✅ تمت الإضافة:', data);
  }
}

run();
