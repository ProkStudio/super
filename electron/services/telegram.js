const axios = require('axios');
const store = require('./store');

async function sendMessage(text) {
  const token = store.getSecret('telegramBotToken');
  const chatId = store.getSecret('telegramUserId');
  if (!token || !chatId) throw new Error('Telegram token or user ID not configured');

  const { data } = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
  }, { timeout: 15000 });

  if (!data.ok) throw new Error(data.description || 'Telegram API error');
  return data;
}

async function testConnection() {
  try {
    await sendMessage('✅ TechPro — тестовое сообщение');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

module.exports = { sendMessage, testConnection };
