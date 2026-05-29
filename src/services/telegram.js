/**
 * Telegram Notification Service - خدمة إشعارات تيليجرام
 * ترسل إشعارات للمشرف عند الأحداث المهمة
 */

const axios = require('axios');
const { supabase } = require('./supabase');

/**
 * الحصول على إعدادات Telegram من قاعدة البيانات
 */
async function getTelegramConfig() {
  // أولاً من متغيرات البيئة
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (botToken && chatId) {
    return { botToken, chatId };
  }

  // ثانياً من قاعدة البيانات
  if (supabase) {
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID']);

      if (data && data.length === 2) {
        const settings = {};
        data.forEach(row => { settings[row.key] = row.value; });
        if (settings.TELEGRAM_BOT_TOKEN && settings.TELEGRAM_CHAT_ID) {
          return {
            botToken: settings.TELEGRAM_BOT_TOKEN,
            chatId: settings.TELEGRAM_CHAT_ID,
          };
        }
      }
    } catch (err) {
      console.error('[Telegram] خطأ في جلب الإعدادات:', err.message);
    }
  }

  return null;
}

/**
 * إرسال رسالة Telegram
 */
async function sendTelegramMessage(text) {
  const config = await getTelegramConfig();
  if (!config || !config.botToken || !config.chatId) {
    console.log('[Telegram] الإعدادات غير مكتملة - تخطي الإشعار');
    return false;
  }

  try {
    await axios.post(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      chat_id: config.chatId,
      text,
      parse_mode: 'HTML',
    });
    console.log('[Telegram] ✅ تم إرسال الإشعار');
    return true;
  } catch (err) {
    console.error('[Telegram] ❌ خطأ في الإرسال:', err.message);
    return false;
  }
}

// =====================
// Notification Templates
// =====================

async function notifyNewCustomer(phoneNumber) {
  const msg = `🆕 <b>عميل جديد</b>
📱 الرقم: <code>${phoneNumber}</code>
⏰ ${new Date().toLocaleString('ar-SA')}`;
  return sendTelegramMessage(msg);
}

async function notifyDataSubmitted(phoneNumber, packageName, nationalId) {
  const msg = `📋 <b>تم إرسال البيانات</b>
📱 الرقم: <code>${phoneNumber}</code>
📦 الباقة: ${packageName || 'غير محدد'}
🪪 الهوية: <code>${nationalId || 'غير محدد'}</code>
⏰ ${new Date().toLocaleString('ar-SA')}

⚠️ يتطلب متابعة يدوية`;
  return sendTelegramMessage(msg);
}

async function notifyReadyForPayment(phoneNumber, packageName) {
  const msg = `💳 <b>جاهز للسداد</b>
📱 الرقم: <code>${phoneNumber}</code>
📦 الباقة: ${packageName || 'غير محدد'}
⏰ ${new Date().toLocaleString('ar-SA')}`;
  return sendTelegramMessage(msg);
}

async function notifyBotError(error, context = '') {
  const msg = `❌ <b>خطأ في البوت</b>
🔴 ${error}
📍 السياق: ${context}
⏰ ${new Date().toLocaleString('ar-SA')}`;
  return sendTelegramMessage(msg);
}

async function notifyBotStopped() {
  const msg = `⚠️ <b>البوت توقف</b>
⏰ ${new Date().toLocaleString('ar-SA')}`;
  return sendTelegramMessage(msg);
}

module.exports = {
  sendTelegramMessage,
  notifyNewCustomer,
  notifyDataSubmitted,
  notifyReadyForPayment,
  notifyBotError,
  notifyBotStopped,
};
