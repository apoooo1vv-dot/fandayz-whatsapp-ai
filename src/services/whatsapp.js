/**
 * WhatsApp Cloud API Service
 * خدمة التواصل مع WhatsApp Cloud API
 */

const axios = require("axios");

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const API_VERSION = "v19.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

/**
 * إرسال رسالة نصية عبر واتساب
 * @param {string} to - رقم المستقبل
 * @param {string} message - نص الرسالة
 */
async function sendTextMessage(to, message) {
  try {
    const response = await axios.post(
      `${BASE_URL}/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "text",
        text: {
          preview_url: false,
          body: message,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`[WhatsApp] ✅ رسالة أُرسلت إلى ${to}`);
    return response.data;
  } catch (error) {
    const errMsg = error.response?.data || error.message;
    console.error(`[WhatsApp] ❌ فشل إرسال الرسالة إلى ${to}:`, errMsg);
    throw error;
  }
}

/**
 * إرسال رسالة "جاري الكتابة..." (typing indicator)
 * @param {string} to - رقم المستقبل
 */
async function markAsRead(messageId) {
  try {
    await axios.post(
      `${BASE_URL}/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    // تجاهل أخطاء mark as read - ليست حرجة
    console.warn("[WhatsApp] تحذير: لم يتم تأشير الرسالة كمقروءة");
  }
}

module.exports = { sendTextMessage, markAsRead };
