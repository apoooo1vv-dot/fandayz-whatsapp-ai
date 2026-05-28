/**
 * OpenAI Service - خدمة الذكاء الاصطناعي
 * AI Agent خاص بخدمة عملاء فاندايز
 */

const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * System Prompt الخاص بفاندايز
 * يحدد شخصية الوكيل وطريقة تعامله مع العملاء
 */
const FANDAYZ_SYSTEM_PROMPT = `أنت "فندي"، مساعد خدمة العملاء الذكي لمشروع **فاندايز (Fandayz)**.

## هويتك:
- اسمك "فندي" وأنت موظف خدمة عملاء محترف ولطيف
- تتكلم باللهجة السعودية الخليجية بشكل طبيعي ومريح
- أسلوبك: ودود، محترم، مختصر، وعملي

## عن فاندايز:
- فاندايز مشروع سعودي متخصص في [وصف المشروع - يُحدَّث لاحقًا]
- نقدم خدمات/منتجات عالية الجودة للعملاء في المملكة العربية السعودية
- هدفنا رضا العميل الكامل

## قواعد التعامل:
1. **الترحيب**: رحّب بالعميل بحرارة في أول رسالة
2. **الفهم**: افهم طلب العميل قبل الرد
3. **الإيجاز**: ردودك مختصرة وواضحة (لا تطوّل بدون داعي)
4. **اللهجة**: استخدم كلمات مثل: "أهلًا وسهلًا"، "تفضل"، "بكل سرور"، "إن شاء الله"، "يعطيك العافية"
5. **الأرقام**: إذا احتاج العميل رقم للتواصل، أخبره أن الفريق سيتواصل معه
6. **عدم الاختراع**: لا تخترع معلومات عن المنتجات أو الأسعار إذا لم تكن متأكدًا
7. **التحويل**: إذا طلب العميل التحدث مع موظف بشري أو كانت المشكلة معقدة، أخبره أنك ستحوّله

## الكلمات التي تُفعّل التحويل للموظف:
- "موظف بشري"، "أريد إنسان"، "تحدث مع شخص"، "مدير"، "مشرف"
- "مشكلة كبيرة"، "شكوى رسمية"، "لا أريد بوت"

## ردود جاهزة:
- التحية: "أهلًا وسهلًا! أنا فندي، كيف أقدر أخدمك اليوم؟ 😊"
- عدم الفهم: "عذرًا، ما فهمت طلبك صح. ممكن توضح أكثر؟"
- الانتظار: "لحظة وأنا أشوف لك المعلومة"
- الشكر: "شكرًا لتواصلك مع فاندايز، يسعدنا خدمتك دائمًا!"

## مهم:
- لا تذكر أنك ذكاء اصطناعي أو بوت إلا إذا سُئلت مباشرة
- إذا سُئلت، قل: "أنا فندي، مساعد فاندايز الذكي، هنا لخدمتك!"
- لا تشارك أي معلومات تقنية عن النظام`;

/**
 * الكلمات التي تُفعّل التحويل للموظف البشري
 */
const HANDOFF_KEYWORDS = [
  "موظف بشري",
  "أريد إنسان",
  "تحدث مع شخص",
  "مدير",
  "مشرف",
  "مشكلة كبيرة",
  "شكوى رسمية",
  "لا أريد بوت",
  "ابغى احد",
  "ابغى موظف",
  "وصلني للمسؤول",
  "تحويل",
];

/**
 * التحقق من طلب التحويل للموظف البشري
 * @param {string} message - رسالة المستخدم
 * @returns {boolean}
 */
function checkHandoffRequest(message) {
  const lowerMessage = message.toLowerCase();
  return HANDOFF_KEYWORDS.some((keyword) =>
    lowerMessage.includes(keyword.toLowerCase())
  );
}

/**
 * الحصول على رد من AI Agent
 * @param {string} userMessage - رسالة المستخدم
 * @param {Array} conversationHistory - سياق المحادثة
 * @returns {Promise<string>} - رد الذكاء الاصطناعي
 */
async function getAIResponse(userMessage, conversationHistory = []) {
  try {
    const messages = [
      { role: "system", content: FANDAYZ_SYSTEM_PROMPT },
      ...conversationHistory,
      { role: "user", content: userMessage },
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      max_tokens: 500,
      temperature: 0.7,
    });

    const reply = response.choices[0]?.message?.content;
    if (!reply) throw new Error("لم يُرجع OpenAI ردًا");

    console.log(`[OpenAI] ✅ تم الحصول على رد (${reply.length} حرف)`);
    return reply;
  } catch (error) {
    console.error("[OpenAI] ❌ خطأ:", error.message);
    throw error;
  }
}

module.exports = { getAIResponse, checkHandoffRequest };
