/**
 * Message Handler - معالج الرسائل الرئيسي
 * يستقبل رسائل واتساب ويعالجها ويرد عليها
 * مع دعم Human Handoff الكامل وحفظ البيانات في Supabase
 */

const { sendTextMessage, markAsRead } = require("../services/whatsapp");
const { getAIResponse, checkHandoffRequest, detectCustomerData } = require("../services/openai");
const {
  getOrCreateCustomer,
  updateCustomer,
  getCustomerHandoffStatus,
  setCustomerHandoff,
  saveMessage,
  getRecentMessages,
} = require("../services/supabase");
// Fallback in-memory for when Supabase is not configured
const memoryFallback = require("../services/memory");

/**
 * رسالة التحويل النهائية للموظف البشري
 */
const HANDOFF_FINAL_MESSAGE = `تم استلام بياناتك ✅

سيتم تحويل المحادثة الآن لموظف خدمة العملاء لاستكمال الإجراءات.

⏰ أوقات العمل: السبت - الخميس، 9 صباحًا - 6 مساءً

شكرًا لتواصلك معنا 🌹`;

/**
 * رسالة وضع الموظف البشري (عندما يكون التحويل مفعّلًا)
 */
const HUMAN_MODE_MESSAGE = `أنت حاليًا متصل مع فريق خدمة العملاء.
سيرد عليك موظفنا قريبًا. 🌹`;

/**
 * معالجة رسالة واتساب واردة
 */
async function handleIncomingMessage(message) {
  const from = message.from;
  const messageId = message.id;
  const messageType = message.type;

  console.log(`[Handler] 📨 رسالة جديدة من ${from} - النوع: ${messageType}`);

  // تأشير الرسالة كمقروءة
  await markAsRead(messageId);

  // معالجة الرسائل النصية فقط
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

  // التأكد من وجود العميل في قاعدة البيانات
  const customer = await getOrCreateCustomer(from);

  // حفظ رسالة المستخدم
  await saveMessage(from, "user", userText, messageId);

  // التحقق من طلب العودة للبوت
  if (
    userText.toLowerCase() === "عودة للبوت" ||
    userText.toLowerCase() === "رجوع للبوت"
  ) {
    await setCustomerHandoff(from, false);
    await updateCustomer(from, { is_human_handoff: false, status: "new_customer" });
    memoryFallback.setHumanHandoff(from, false);
    const reply = "أهلًا مجددًا! أنا فندي، كيف أقدر أخدمك؟ 😊";
    await sendTextMessage(from, reply);
    await saveMessage(from, "assistant", reply);
    return;
  }

  // التحقق من وضع Human Handoff
  const isHandoff = customer
    ? customer.is_human_handoff
    : memoryFallback.isHumanHandoff(from);

  if (isHandoff) {
    console.log(`[Handler] 👤 المستخدم ${from} في وضع الموظف البشري - لا يرد البوت`);
    // البوت لا يرد - الرسالة محفوظة في DB للموظف ليراها في Dashboard
    return;
  }

  // التحقق من طلب التحويل للموظف البشري (يدوي)
  if (checkHandoffRequest(userText)) {
    console.log(`[Handler] 🔄 طلب تحويل للموظف البشري من ${from}`);
    await setCustomerHandoff(from, true);
    memoryFallback.setHumanHandoff(from, true);
    const reply = "أكيد عزيزي 👌\nسيتم تحويل طلبك لموظف خدمة العملاء.";
    await sendTextMessage(from, reply);
    await saveMessage(from, "assistant", reply);
    return;
  }

  // الحصول على سياق المحادثة
  let history = [];
  try {
    const dbMessages = await getRecentMessages(from, 20);
    history = dbMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));
  } catch (e) {
    history = memoryFallback.getHistory(from);
  }

  try {
    // الحصول على رد من AI
    const { reply: aiReply, shouldHandoff, customerData } = await getAIResponse(userText, history, customer);

    // حفظ الرد
    memoryFallback.addMessage(from, "user", userText);
    memoryFallback.addMessage(from, "assistant", aiReply);

    // إرسال الرد للعميل
    await sendTextMessage(from, aiReply);
    await saveMessage(from, "assistant", aiReply);

    // إذا اكتشف AI أن العميل أرسل بياناته وأكد القسط الأول
    if (shouldHandoff) {
      console.log(`[Handler] 🔄 تحويل تلقائي بعد إرسال البيانات من ${from}`);

      // تحديث بيانات العميل إذا كانت موجودة
      if (customerData) {
        const updates = { status: "data_submitted" };
        if (customerData.nationalId) updates.national_id = customerData.nationalId;
        if (customerData.phone) updates.tabby_tamara_number = customerData.phone;
        if (customerData.package) updates.selected_package = customerData.package;
        await updateCustomer(from, updates);
      }

      // إرسال رسالة التحويل
      await sendTextMessage(from, HANDOFF_FINAL_MESSAGE);
      await saveMessage(from, "assistant", HANDOFF_FINAL_MESSAGE);

      // تفعيل Human Handoff
      await setCustomerHandoff(from, true);
      memoryFallback.setHumanHandoff(from, true);
    }

    console.log(`[Handler] ✅ تم الرد على ${from}`);
  } catch (error) {
    console.error(`[Handler] ❌ خطأ في معالجة الرسالة:`, error.message);
    const errMsg = "عذرًا، صار خطأ تقني مؤقت. حاول مرة ثانية بعد لحظة، أو تواصل معنا مباشرة. 🙏";
    await sendTextMessage(from, errMsg);
    await saveMessage(from, "assistant", errMsg);
  }
}

/**
 * معالجة حدث واتساب الوارد
 */
async function handleWebhookEvent(body) {
  try {
    const entry = body.entry?.[0];
    if (!entry) return;

    const changes = entry.changes?.[0];
    if (!changes) return;

    const value = changes.value;
    if (!value) return;

    const messages = value.messages;
    if (messages && messages.length > 0) {
      for (const message of messages) {
        await handleIncomingMessage(message);
      }
    }

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
