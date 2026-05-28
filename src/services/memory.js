/**
 * Memory Service - خدمة الذاكرة
 * تخزين سياق المحادثات في الذاكرة (In-Memory)
 * قابل للترقية لاحقًا إلى Redis أو قاعدة بيانات
 */

// Map لتخزين محادثات كل مستخدم
const conversations = new Map();

// الحد الأقصى لعدد الرسائل في السياق لكل مستخدم
const MAX_HISTORY = 20;

// مدة انتهاء صلاحية المحادثة (6 ساعات بالميلي ثانية)
const SESSION_TIMEOUT = 6 * 60 * 60 * 1000;

/**
 * الحصول على تاريخ محادثة مستخدم
 * @param {string} userId - رقم المستخدم
 * @returns {Array} - مصفوفة رسائل المحادثة
 */
function getHistory(userId) {
  const session = conversations.get(userId);
  if (!session) return [];

  // التحقق من انتهاء صلاحية الجلسة
  if (Date.now() - session.lastActivity > SESSION_TIMEOUT) {
    conversations.delete(userId);
    console.log(`[Memory] انتهت جلسة المستخدم ${userId}`);
    return [];
  }

  return session.messages;
}

/**
 * إضافة رسالة إلى سياق المحادثة
 * @param {string} userId - رقم المستخدم
 * @param {string} role - "user" أو "assistant"
 * @param {string} content - محتوى الرسالة
 */
function addMessage(userId, role, content) {
  if (!conversations.has(userId)) {
    conversations.set(userId, {
      messages: [],
      lastActivity: Date.now(),
      isHumanHandoff: false,
    });
  }

  const session = conversations.get(userId);
  session.messages.push({ role, content });
  session.lastActivity = Date.now();

  // الحفاظ على الحد الأقصى للسياق
  if (session.messages.length > MAX_HISTORY) {
    // احذف أقدم رسالتين (لكن احتفظ بالسياق الأخير)
    session.messages.splice(0, 2);
  }
}

/**
 * التحقق من حالة التحويل للموظف البشري
 * @param {string} userId - رقم المستخدم
 * @returns {boolean}
 */
function isHumanHandoff(userId) {
  const session = conversations.get(userId);
  return session?.isHumanHandoff || false;
}

/**
 * تفعيل/إلغاء وضع التحويل للموظف البشري
 * @param {string} userId - رقم المستخدم
 * @param {boolean} status - true لتفعيل، false لإلغاء
 */
function setHumanHandoff(userId, status) {
  if (!conversations.has(userId)) {
    conversations.set(userId, {
      messages: [],
      lastActivity: Date.now(),
      isHumanHandoff: false,
    });
  }
  const session = conversations.get(userId);
  session.isHumanHandoff = status;
  session.lastActivity = Date.now();
  console.log(
    `[Memory] المستخدم ${userId} - وضع الموظف البشري: ${status ? "مفعّل" : "معطّل"}`
  );
}

/**
 * مسح محادثة مستخدم
 * @param {string} userId - رقم المستخدم
 */
function clearHistory(userId) {
  conversations.delete(userId);
  console.log(`[Memory] تم مسح محادثة المستخدم ${userId}`);
}

/**
 * الحصول على إحصائيات الذاكرة
 */
function getStats() {
  return {
    activeSessions: conversations.size,
    sessions: Array.from(conversations.entries()).map(([id, session]) => ({
      userId: id.slice(-4) + "****", // إخفاء جزء من الرقم للخصوصية
      messageCount: session.messages.length,
      isHumanHandoff: session.isHumanHandoff,
      lastActivity: new Date(session.lastActivity).toISOString(),
    })),
  };
}

module.exports = {
  getHistory,
  addMessage,
  isHumanHandoff,
  setHumanHandoff,
  clearHistory,
  getStats,
};
