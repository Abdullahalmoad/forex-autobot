require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `مرحباً 👋\nمعرف المحادثة الخاص فيك: \`${msg.chat.id}\`\nانسخه والصقه بصفحة "ربط تليجرام" داخل التطبيق عشان تستلم إشعارات صفقاتك.`,
    { parse_mode: 'Markdown' }
  );
});

async function notify(chatId, message) {
  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('فشل إرسال إشعار تليجرام:', err.message);
  }
}

function formatTradeOpened({ symbol, direction, volume, entryPrice, stopLoss, takeProfit, strategy }) {
  const dirEmoji = direction === 'buy' ? '🟢 شراء' : '🔴 بيع';
  return (
    `📊 *صفقة جديدة*\n` +
    `${dirEmoji} ${symbol}\n` +
    `الحجم: ${volume} لوت\n` +
    `الدخول: ${entryPrice}\n` +
    `وقف الخسارة: ${stopLoss}\n` +
    `جني الأرباح: ${takeProfit || '-'}\n` +
    `الاستراتيجية: ${strategy}`
  );
}

function formatRiskBreach(reason) {
  return `⚠️ *تنبيه مخاطرة*\n${reason}\n\nتم إيقاف البوت تلقائياً لحماية رصيدك.`;
