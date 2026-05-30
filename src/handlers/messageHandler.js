/**
 * Message Handler - النسخة المستقرة
 * يضمن حفظ كل رسالة في Supabase بدون استثناء
 */

const { sendTextMessage, markAsRead } = require("../services/whatsapp");
const { getAIResponse, checkHandoffRequest, detectCustomerData } = require("../services/openai");
const {
  getOrCreateCustomer,
  updateCustomer,
  setCustomerHandoff,
  saveMessage,
  getRecentMessages,
  isMessageProcessed,
  markMessageProcessed,
  getActivePackages,
  detectSelectedPackage,
} = require("../services/supabase");
const { notifyNewCustomer, notifyDataSubmitted, notifyBotError } = require("../services/telegram");

// In-memory fallback للـ handoff state (في حال Supabase بطيء)
const handoffCache = new Map();

const HANDOFF_FINAL_MESSAGE = `تم استلام بياناتك ✅

سيتم تحويل المحادثة الآن لموظف خدمة العملاء لاستكمال الإجراءات.

⏰ أوقات العمل: السبت - الخميس، 9 صباحًا - 6 مساءً

شكرًا لتواصلك معنا 🌹`;

async function handleIncomingMessage(message) {
  const from = message.from;
  const messageId = message.id;
  const messageType = message.type;

  console.log(`[Handler] 📨 ${from} | نوع: ${messageType} | ID: ${messageId}`);

  // ===== 1. Anti-Duplicate =====
  if (messageId) {
    const processed = await isMessageProcessed(messageId);
    if (processed) {
      console.log(`[Handler] ⚠️ رسالة مكررة تجاهلتها: ${messageId}`);
      return;
    }
    await markMessageProcessed(messageId);
  }

  // ===== 2. Mark as Read =====
  try { await markAsRead(messageId); } catch (e) {
    console.warn("[Handler] تعذر تأشير مقروءة:", e.message);
  }

  // ===== 3. نصية فقط =====
  if (messageType !== "text") {
    const reply = "عذرًا، في الوقت الحالي أستقبل الرسائل النصية فقط. كيف أقدر أساعدك؟";
    await sendTextMessage(from, reply);
    await saveMessage(from, "assistant", reply);
    return;
  }

  const userText = message.text?.body?.trim();
  if (!userText) return;

  console.log(`[Handler] 💬 "${userText.substring(0, 80)}"`);

  // ===== 4. الحصول على بيانات العميل =====
  const customer = await getOrCreateCustomer(from);
  const isNew = customer && !customer.name; // عميل جديد إذا لم يكن له اسم

  // ===== 5. إشعار Telegram للعميل الجديد =====
  if (isNew) {
    notifyNewCustomer(from).catch(() => {});
  }

  // ===== 6. حفظ رسالة المستخدم =====
  await saveMessage(from, "user", userText, messageId);

  // ===== 7. فحص حالة Handoff =====
  const isHandoff = handoffCache.get(from) || customer?.is_human_handoff || false;

  // إذا كان في وضع الموظف البشري - لا يرد البوت
  if (isHandoff) {
    console.log(`[Handler] 👤 ${from} في وضع الموظف البشري - لا يرد البوت`);
    return;
  }

  // ===== 8. أوامر خاصة =====
  const lowerText = userText.toLowerCase().trim();

  // إعادة تشغيل البوت
  if (["عودة للبوت", "رجوع للبوت", "restart bot"].includes(lowerText)) {
    handoffCache.set(from, false);
    await setCustomerHandoff(from, false);
    const reply = "أهلًا مجددًا! كيف أقدر أخدمك؟ 😊";
    await sendTextMessage(from, reply);
    await saveMessage(from, "assistant", reply);
    return;
  }

  // طلب تحويل يدوي
  if (checkHandoffRequest(userText)) {
    handoffCache.set(from, true);
    await setCustomerHandoff(from, true);
    const reply = "أكيد عزيزي 👌\nسيتم تحويل طلبك لموظف خدمة العملاء.";
    await sendTextMessage(from, reply);
    await saveMessage(from, "assistant", reply);
    return;
  }

  // ===== 9. الحصول على الباقات =====
  const packages = await getActivePackages();

  // ===== 10. الحصول على سياق المحادثة =====
  let history = [];
  try {
    const dbMessages = await getRecentMessages(from, 15);
    history = dbMessages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role, content: m.content }));
  } catch (e) {
    console.warn("[Handler] تعذر جلب السياق:", e.message);
  }

  // ===== 11. الرد بالذكاء الاصطناعي =====
  try {
    const { reply: aiReply, shouldHandoff, customerData } = await getAIResponse(
      userText, history, customer, packages
    );

    // إرسال الرد
    await sendTextMessage(from, aiReply);
    await saveMessage(from, "assistant", aiReply);

    // ===== 12. تحديث بيانات العميل =====
    const updates = {};

    // اكتشاف الباقة المختارة
    const selectedPkg = detectSelectedPackage(userText, packages);
    if (selectedPkg) {
      updates.package_id = selectedPkg.id;
      updates.selected_package = selectedPkg.name;
    }

    // حفظ البيانات المستخرجة
    if (customerData?.nationalId) updates.national_id = customerData.nationalId;
    if (customerData?.phone) updates.tabby_tamara_number = customerData.phone;

    if (Object.keys(updates).length > 0) {
      await updateCustomer(from, updates);
    }

    // ===== 13. تفعيل Handoff إذا أرسل البيانات =====
    if (shouldHandoff) {
      console.log(`[Handler] 🔄 تحويل تلقائي من ${from}`);

      // إرسال رسالة التحويل
      await sendTextMessage(from, HANDOFF_FINAL_MESSAGE);
      await saveMessage(from, "assistant", HANDOFF_FINAL_MESSAGE);

      // تحديث حالة العميل
      handoffCache.set(from, true);
      await updateCustomer(from, { status: "data_submitted", state_machine_status: "waiting_review" });
      await setCustomerHandoff(from, true);

      // إشعار Telegram
      notifyDataSubmitted(
        from,
        customer?.selected_package || updates.selected_package || "غير محدد",
        customerData?.nationalId || customer?.national_id
      ).catch(() => {});
    }

    console.log(`[Handler] ✅ تم الرد على ${from}`);
  } catch (error) {
    console.error(`[Handler] ❌ خطأ:`, error.message);
    notifyBotError(error.message, `من: ${from}`).catch(() => {});
    const errMsg = "عذرًا، صار خطأ تقني مؤقت. حاول مرة ثانية بعد لحظة. 🙏";
    await sendTextMessage(from, errMsg);
    await saveMessage(from, "assistant", errMsg);
  }
}

async function handleWebhookEvent(body) {
  try {
    const entry = body.entry?.[0];
    if (!entry) return;

    const changes = entry.changes?.[0];
    if (!changes) return;

    const value = changes.value;
    if (!value) return;

    // معالجة الرسائل
    const messages = value.messages;
    if (messages?.length > 0) {
      for (const message of messages) {
        await handleIncomingMessage(message);
      }
    }

    // تحديثات الحالة
    const statuses = value.statuses;
    if (statuses?.length > 0) {
      for (const status of statuses) {
        console.log(`[Handler] 📊 ${status.status} → ${status.id}`);
      }
    }
  } catch (error) {
    console.error("[Handler] ❌ خطأ في Webhook:", error.message);
    notifyBotError(error.message, "Webhook Handler").catch(() => {});
  }
}

module.exports = { handleWebhookEvent };
