/**
 * OpenAI Service - خدمة الذكاء الاصطناعي
 * ردود سعودية احترافية مرتبطة بمرحلة العميل
 */

const OpenAI = require("openai");
const { getStateInstructions, STATES } = require("./stateMachine");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * System Prompt الأساسي لفاندايز
 */
const BASE_SYSTEM_PROMPT = `أنت موظف خدمة عملاء احترافي في شركة فاندايز السعودية.

قواعد صارمة:
- تكلم بلهجة سعودية احترافية مختصرة وواضحة
- لا تكرر نفس الكلام في نفس المحادثة
- لا تخترع معلومات غير موجودة
- لا تعطي ضمانات أو وعود
- لا تذكر كلمة "بوت" أو "ذكاء اصطناعي"
- الردود قصيرة ومباشرة (3-5 أسطر كحد أقصى)
- افهم نية العميل من أول رسالة
- لا تسأل نفس السؤال مرتين

الخدمة:
فاندايز توفر سيولة مالية عبر تابي وتمارا. العميل يختار باقة، نرفع الطلب، وبعد القبول وسداد القسط الأول يتم تحويل المبلغ.

مهم:
- السداد يكون عبر بوابة دفع رسمية وليس تحويل شخصي
- التحقق يتم عبر نفاذ الوطني
- الطلب مرتبط ببيانات العميل الرسمية`;

/**
 * الكلمات التي تُفعّل التحويل للموظف البشري
 */
const HANDOFF_KEYWORDS = [
  "موظف بشري", "أريد إنسان", "مدير", "مشرف",
  "ابغى احد", "ابغى موظف", "كلمني احد", "بشري",
  "تحدث مع شخص", "لا أريد بوت",
];

function checkHandoffRequest(message) {
  const lowerMessage = message.toLowerCase();
  return HANDOFF_KEYWORDS.some(k => lowerMessage.includes(k.toLowerCase()));
}

/**
 * استخراج بيانات العميل (هوية + جوال)
 */
function detectCustomerData(text) {
  const data = {};
  // رقم الهوية الوطنية (10 أرقام تبدأ بـ 1 أو 2)
  const idMatch = text.match(/\b[12]\d{9}\b/);
  if (idMatch) data.nationalId = idMatch[0];
  // رقم الجوال السعودي
  const phoneMatch = text.match(/\b(05\d{8}|5\d{8}|\+9665\d{8})\b/);
  if (phoneMatch) data.phone = phoneMatch[0];
  return Object.keys(data).length > 0 ? data : null;
}

/**
 * الحصول على رد من AI مع مراعاة مرحلة العميل
 */
async function getAIResponse(userMessage, conversationHistory = [], customer = null, packages = []) {
  try {
    const currentState = customer?.state_machine_status || STATES.START;
    const stateInstructions = getStateInstructions(currentState, packages);

    const systemPrompt = `${BASE_SYSTEM_PROMPT}

=== المرحلة الحالية للعميل ===
${stateInstructions}

=== تعليمات إضافية ===
- إذا أرسل العميل رقم هوية ورقم جوال معاً، أضف [HANDOFF_TRIGGER] في نهاية ردك
- إذا طلب الباقات، اعرضها كاملة من المعلومات المتاحة
- لا تسأل عن معلومات مذكورة مسبقاً في المحادثة`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-10), // آخر 10 رسائل فقط
      { role: "user", content: userMessage },
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 400,
      temperature: 0.2,
    });

    let reply = response.choices[0]?.message?.content?.trim();
    if (!reply) throw new Error("لم يُرجع OpenAI ردًا");

    // التحقق من وجود HANDOFF_TRIGGER
    let shouldHandoff = false;
    if (reply.includes("[HANDOFF_TRIGGER]")) {
      shouldHandoff = true;
      reply = reply.replace("[HANDOFF_TRIGGER]", "").trim();
    }

    // استخراج بيانات العميل
    const customerData = detectCustomerData(userMessage);
    if (customerData?.nationalId && customerData?.phone) {
      shouldHandoff = true;
    }

    console.log(`[OpenAI] ✅ رد (${reply.length} حرف) | State: ${currentState} | Handoff: ${shouldHandoff}`);
    return { reply, shouldHandoff, customerData };
  } catch (error) {
    console.error("[OpenAI] ❌ خطأ:", error.message);
    throw error;
  }
}

module.exports = { getAIResponse, checkHandoffRequest, detectCustomerData };
