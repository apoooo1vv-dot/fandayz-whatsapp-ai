/**
 * Message Handler - معالج الرسائل الرئيسي
 * يستقبل رسائل واتساب ويعالجها مع State Machine كامل
 */

const { sendTextMessage, markAsRead } = require("../services/whatsapp");
const { getAIResponse, checkHandoffRequest, detectCustomerData } = require("../services/openai");
const {
  getOrCreateCustomer,
  updateCustomer,
  updateCustomerState,
  setCustomerHandoff,
  saveMessage,
  getRecentMessages,
  isMessageProcessed,
  markMessageProcessed,
  getActivePackages,
  formatPackagesMessage,
  detectSelectedPackage,
} = require("../services/supabase");
const {
  STATES,
  determineNextState,
} = require("../services/stateMachine");
const {
  notifyNewCustomer,
  notifyDataSubmitted,
  notifyBotError,
} = require("../services/telegram");
// Fallback in-memory
const memoryFallback = require("../services/memory");

/**
 * رسالة التحويل النهائية للموظف البشري
 */
const HANDOFF_FINAL_MESSAGE = `تم استلام بياناتك ✅

سيتم تحويل المحادثة الآن لموظف خدمة العملاء لاستكمال الإجراءات.

⏰ أوقات العمل: السبت - الخميس، 9 صباحًا - 6 مساءً

شكرًا لتواصلك معنا 🌹`;

/**
 * معالجة رسالة واتساب واردة
 */
async function handleIncomingMessage(message) {
  const from = message.from;
  const messageId = message.id;
  const messageType = message.type;

  console.log(`[Handler] 📨 رسالة جديدة من ${from} - النوع: ${messageType}`);

  // ===== Anti-Duplicate: منع معالجة نفس الرسالة مرتين =====
  if (messageId) {
    const alreadyProcessed = await isMessageProcessed(messageId);
    if (alreadyProcessed) {
      console.log(`[Handler] ⚠️ رسالة مكررة تجاهلتها: ${messageId}`);
      return;
    }
    await markMessageProcessed(messageId);
  }

  // تأشير الرسالة كمقروءة
  try {
    await markAsRead(messageId);
  } catch (e) {
    console.warn("[Handler] تعذر تأشير الرسالة كمقروءة:", e.message);
  }

  // معالجة الرسائل النصية فقط
  if (messageType !== "text") {
    const reply = "عذرًا، في الوقت الحالي أقدر أستقبل الرسائل النصية فقط. كيف أقدر أساعدك؟";
    await sendTextMessage(from, reply);
    await saveMessage(from, "assistant", reply);
    return;
  }

  const userText = message.text?.body?.trim();
  if (!userText) return;

  console.log(`[Handler] 💬 "${userText}"`);

  // الحصول على بيانات العميل
  let customer = await getOrCreateCustomer(from);
  const isNewCustomer = !customer || customer.state_machine_status === STATES.START;

  // إشعار Telegram للعميل الجديد
  if (isNewCustomer && customer) {
    await notifyNewCustomer(from).catch(() => {});
  }

  // حفظ رسالة المستخدم
  await saveMessage(from, "user", userText, messageId);

  // التحقق من طلب العودة للبوت
  const resetKeywords = ["عودة للبوت", "رجوع للبوت", "ابدأ من جديد", "restart"];
  if (resetKeywords.some(k => userText.toLowerCase().includes(k))) {
    await setCustomerHandoff(from, false);
    await updateCustomerState(from, STATES.START);
    memoryFallback.setHumanHandoff(from, false);
    const reply = "أهلًا مجددًا! كيف أقدر أخدمك؟ 😊";
    await sendTextMessage(from, reply);
    await saveMessage(from, "assistant", reply);
    return;
  }

  // التحقق من وضع Human Handoff
  const isHandoff = customer?.is_human_handoff || memoryFallback.isHumanHandoff(from);
  if (isHandoff) {
    console.log(`[Handler] 👤 ${from} في وضع الموظف البشري - لا يرد البوت`);
    // الرسالة محفوظة في DB للموظف ليراها في Dashboard
    return;
  }

  // التحقق من طلب التحويل اليدوي
  if (checkHandoffRequest(userText)) {
    console.log(`[Handler] 🔄 طلب تحويل يدوي من ${from}`);
    await setCustomerHandoff(from, true);
    memoryFallback.setHumanHandoff(from, true);
    const reply = "أكيد عزيزي 👌\nسيتم تحويل طلبك لموظف خدمة العملاء.";
    await sendTextMessage(from, reply);
    await saveMessage(from, "assistant", reply);
    return;
  }

  // الحصول على الباقات من قاعدة البيانات
  const packages = await getActivePackages();

  // الحصول على سياق المحادثة
  let history = [];
  try {
    const dbMessages = await getRecentMessages(from, 10);
    history = dbMessages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role, content: m.content }));
  } catch (e) {
    history = memoryFallback.getHistory(from);
  }

  try {
    // الحصول على رد من AI مع مراعاة المرحلة الحالية
    const { reply: aiReply, shouldHandoff, customerData } = await getAIResponse(
      userText,
      history,
      customer,
      packages
    );

    // تحديث الذاكرة المؤقتة
    memoryFallback.addMessage(from, "user", userText);
    memoryFallback.addMessage(from, "assistant", aiReply);

    // إرسال الرد
    await sendTextMessage(from, aiReply);
    await saveMessage(from, "assistant", aiReply);

    // ===== تحديث State Machine =====
    const currentState = customer?.state_machine_status || STATES.START;

    // اكتشاف الباقة المختارة
    const selectedPkg = detectSelectedPackage(userText, packages);

    // تحديد المرحلة التالية
    const context = {
      selectedPackage: selectedPkg,
      hasPhoneAndId: !!(customerData?.nationalId && customerData?.phone),
    };
    const nextState = determineNextState(currentState, userText, context);

    if (nextState && nextState !== currentState) {
      const stateUpdates = { state_machine_status: nextState };

      // حفظ الباقة المختارة
      if (selectedPkg && nextState === STATES.PACKAGE_SELECTED) {
        stateUpdates.package_id = selectedPkg.id;
        stateUpdates.selected_package = selectedPkg.name;
      }

      // حفظ بيانات العميل
      if (customerData?.nationalId) stateUpdates.national_id = customerData.nationalId;
      if (customerData?.phone) stateUpdates.tabby_tamara_number = customerData.phone;

      await updateCustomer(from, stateUpdates);
      console.log(`[Handler] 🔄 State: ${currentState} → ${nextState}`);
    }

    // ===== تفعيل Human Handoff إذا أرسل البيانات =====
    if (shouldHandoff) {
      console.log(`[Handler] 🔄 تحويل تلقائي بعد إرسال البيانات من ${from}`);

      // تحديث بيانات العميل
      const updates = {
        status: "data_submitted",
        state_machine_status: STATES.WAITING_REVIEW,
      };
      if (customerData?.nationalId) updates.national_id = customerData.nationalId;
      if (customerData?.phone) updates.tabby_tamara_number = customerData.phone;
      await updateCustomer(from, updates);

      // إرسال رسالة التحويل
      await sendTextMessage(from, HANDOFF_FINAL_MESSAGE);
      await saveMessage(from, "assistant", HANDOFF_FINAL_MESSAGE);

      // تفعيل Human Handoff
      await setCustomerHandoff(from, true);
      memoryFallback.setHumanHandoff(from, true);

      // إشعار Telegram
      const pkgName = customer?.selected_package || "غير محدد";
      await notifyDataSubmitted(from, pkgName, customerData?.nationalId).catch(() => {});
    }

    console.log(`[Handler] ✅ تم الرد على ${from}`);
  } catch (error) {
    console.error(`[Handler] ❌ خطأ:`, error.message);
    await notifyBotError(error.message, `من: ${from}`).catch(() => {});
    const errMsg = "عذرًا، صار خطأ تقني مؤقت. حاول مرة ثانية بعد لحظة. 🙏";
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
        console.log(`[Handler] 📊 حالة: ${status.status} للرسالة ${status.id}`);
      }
    }
  } catch (error) {
    console.error("[Handler] ❌ خطأ في Webhook:", error.message);
    await notifyBotError(error.message, "Webhook Handler").catch(() => {});
  }
}

module.exports = { handleWebhookEvent };
