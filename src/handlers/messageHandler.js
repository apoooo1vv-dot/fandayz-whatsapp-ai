/**
 * Message Handler - معالج الرسائل الرئيسي
 * يستقبل رسائل واتساب ويعالجها ويرد عليها
 */

const { sendTextMessage, markAsRead } = require("../services/whatsapp");
const { getAIResponse, checkHandoffRequest } = require("../services/openai");
const {
  getHistory,
  addMessage,
  isHumanHandoff,
  setHumanHandoff,
} = require("../services/memory");

/**
 * رسالة التحويل للموظف البشري
 */
const HANDOFF_MESSAGE = `شكرًا لتواصلك معنا! 🙏

سيتواصل معك أحد موظفينا في أقرب وقت ممكن.

⏰ أوقات العمل: السبت - الخميس، 9 صباحًا - 6 مساءً

إذا كان طلبك عاجلًا، يمكنك التواصل مباشرة على:
📞 [رقم التواصل - يُضاف لاحقًا]

شكرًا لصبرك! يسعدنا خدمتك 😊`;

/**
 * رسالة وضع الموظف البشري (عندما يكون التحويل مفعّلًا)
 */
const HUMAN_MODE_MESSAGE = `أنت حاليًا متصل مع فريق خدمة العملاء. سيرد عليك موظفنا قريبًا.

إذا أردت العودة للمساعد الذكي، أرسل: *عودة للبوت*`;

/**
 * معالجة رسالة واتساب واردة
 * @param {Object} message - بيانات الرسالة من WhatsApp API
 */
async function handleIncomingMessage(message) {
  const from = message.from;
  const messageId = message.id;
  const messageType = message.type;

  console.log(`[Handler] 📨 رسالة جديدة من ${from} - النوع: ${messageType}`);

  // تأشير الرسالة كمقروءة
  await markAsRead(messageId);

  // معالجة الرسائل النصية فقط في الوقت الحالي
  if (messageType !== "text") {
    await sendTextMessage(
      from,
      "عذرًا، في الوقت الحالي أقدر أستقبل الرسائل النصية فقط. كيف أقدر أساعدك؟ 😊"
    );
    return;
  }

  const userText = message.text?.body?.trim();
  if (!userText) return;

  console.log(`[Handler] 💬 نص الرسالة: "${userText}"`);

  // التحقق من طلب العودة للبوت
  if (
    userText.toLowerCase() === "عودة للبوت" ||
    userText.toLowerCase() === "رجوع للبوت"
  ) {
    setHumanHandoff(from, false);
    await sendTextMessage(
      from,
      "أهلًا مجددًا! أنا فندي، كيف أقدر أخدمك؟ 😊"
    );
    return;
  }

  // التحقق من وضع التحويل للموظف البشري
  if (isHumanHandoff(from)) {
    console.log(`[Handler] 👤 المستخدم ${from} في وضع الموظف البشري`);
    await sendTextMessage(from, HUMAN_MODE_MESSAGE);
    return;
  }

  // التحقق من طلب التحويل للموظف البشري
  if (checkHandoffRequest(userText)) {
    console.log(`[Handler] 🔄 طلب تحويل للموظف البشري من ${from}`);
    setHumanHandoff(from, true);
    await sendTextMessage(from, HANDOFF_MESSAGE);
    return;
  }

  // الحصول على سياق المحادثة
  const history = getHistory(from);

  try {
    // الحصول على رد من AI Agent
    const aiReply = await getAIResponse(userText, history);

    // حفظ الرسالة والرد في الذاكرة
    addMessage(from, "user", userText);
    addMessage(from, "assistant", aiReply);

    // إرسال الرد
    await sendTextMessage(from, aiReply);

    console.log(`[Handler] ✅ تم الرد على ${from}`);
  } catch (error) {
    console.error(`[Handler] ❌ خطأ في معالجة الرسالة:`, error.message);

    // رسالة خطأ للمستخدم
    await sendTextMessage(
      from,
      "عذرًا، صار خطأ تقني مؤقت. حاول مرة ثانية بعد لحظة، أو تواصل معنا مباشرة. 🙏"
    );
  }
}

/**
 * معالجة حدث واتساب الوارد (يمكن أن يحتوي على رسائل متعددة)
 * @param {Object} body - جسم الطلب من WhatsApp API
 */
async function handleWebhookEvent(body) {
  try {
    const entry = body.entry?.[0];
    if (!entry) return;

    const changes = entry.changes?.[0];
    if (!changes) return;

    const value = changes.value;
    if (!value) return;

    // معالجة الرسائل الواردة
    const messages = value.messages;
    if (messages && messages.length > 0) {
      for (const message of messages) {
        await handleIncomingMessage(message);
      }
    }

    // معالجة تحديثات الحالة (status updates) - للـ logging فقط
    const statuses = value.statuses;
    if (statuses && statuses.length > 0) {
      for (const status of statuses) {
        console.log(
          `[Handler] 📊 تحديث حالة: ${status.status} للرسالة ${status.id}`
        );
      }
    }
  } catch (error) {
    console.error("[Handler] ❌ خطأ في معالجة حدث Webhook:", error.message);
  }
}

module.exports = { handleWebhookEvent };
