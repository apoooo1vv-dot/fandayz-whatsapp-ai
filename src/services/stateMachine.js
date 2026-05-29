/**
 * State Machine Service - نظام إدارة مراحل العميل
 * يتحكم في مسار المحادثة بشكل واضح ومنظم
 */

// تعريف المراحل
const STATES = {
  START: 'start',
  SERVICE_EXPLAINED: 'service_explained',
  PACKAGES_SENT: 'packages_sent',
  PACKAGE_SELECTED: 'package_selected',
  DATA_COLLECTED: 'data_collected',
  WAITING_REVIEW: 'waiting_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  WAITING_PAYMENT: 'waiting_payment',
  TRANSFERRING: 'transferring',
  COMPLETED: 'completed',
  HUMAN_HANDOFF: 'waiting_human_followup',
};

// الانتقالات المسموح بها
const TRANSITIONS = {
  [STATES.START]: [STATES.SERVICE_EXPLAINED, STATES.PACKAGES_SENT, STATES.HUMAN_HANDOFF],
  [STATES.SERVICE_EXPLAINED]: [STATES.PACKAGES_SENT, STATES.HUMAN_HANDOFF],
  [STATES.PACKAGES_SENT]: [STATES.PACKAGE_SELECTED, STATES.HUMAN_HANDOFF],
  [STATES.PACKAGE_SELECTED]: [STATES.DATA_COLLECTED, STATES.PACKAGES_SENT, STATES.HUMAN_HANDOFF],
  [STATES.DATA_COLLECTED]: [STATES.WAITING_REVIEW, STATES.HUMAN_HANDOFF],
  [STATES.WAITING_REVIEW]: [STATES.APPROVED, STATES.REJECTED, STATES.HUMAN_HANDOFF],
  [STATES.APPROVED]: [STATES.WAITING_PAYMENT, STATES.HUMAN_HANDOFF],
  [STATES.REJECTED]: [STATES.START],
  [STATES.WAITING_PAYMENT]: [STATES.TRANSFERRING, STATES.HUMAN_HANDOFF],
  [STATES.TRANSFERRING]: [STATES.COMPLETED],
  [STATES.COMPLETED]: [],
  [STATES.HUMAN_HANDOFF]: [STATES.START],
};

/**
 * التحقق من صحة الانتقال بين المراحل
 */
function canTransition(fromState, toState) {
  const allowed = TRANSITIONS[fromState] || [];
  return allowed.includes(toState);
}

/**
 * تحديد المرحلة التالية بناءً على رسالة المستخدم
 * @param {string} currentState - المرحلة الحالية
 * @param {string} userMessage - رسالة المستخدم
 * @param {Object} context - سياق إضافي (بيانات العميل، الباقة المختارة، إلخ)
 * @returns {string|null} - المرحلة التالية أو null إذا لم يكن هناك انتقال
 */
function determineNextState(currentState, userMessage, context = {}) {
  const msg = userMessage.toLowerCase().trim();

  // طلب موظف بشري في أي مرحلة
  const humanKeywords = ['موظف', 'بشري', 'مدير', 'مشرف', 'احد', 'انسان', 'تحويل', 'كلمني'];
  if (humanKeywords.some(k => msg.includes(k))) {
    return STATES.HUMAN_HANDOFF;
  }

  switch (currentState) {
    case STATES.START:
    case STATES.SERVICE_EXPLAINED:
      // إذا طلب الباقات
      if (msg.includes('باقات') || msg.includes('باقة') || msg.includes('الأسعار') || msg.includes('كم') || msg.includes('قائمة')) {
        return STATES.PACKAGES_SENT;
      }
      // إذا طلب شرح الخدمة
      if (msg.includes('كيف') || msg.includes('شرح') || msg.includes('طريقة') || msg.includes('ايش') || msg.includes('وش')) {
        return STATES.SERVICE_EXPLAINED;
      }
      break;

    case STATES.PACKAGES_SENT:
      // إذا اختار باقة
      if (context.selectedPackage || msg.match(/باقة\s*(الأولى|الثانية|الثالثة|الرابعة|الخامسة|السادسة|السابعة|[1-7]|الاولى)/)) {
        return STATES.PACKAGE_SELECTED;
      }
      break;

    case STATES.PACKAGE_SELECTED:
      // إذا أكد توفر القسط
      if (msg.includes('نعم') || msg.includes('موجود') || msg.includes('عندي') || msg.includes('متوفر') || msg.includes('ايه') || msg.includes('أيوه')) {
        return STATES.DATA_COLLECTED;
      }
      // إذا أراد تغيير الباقة
      if (msg.includes('غير') || msg.includes('باقة') || msg.includes('ارجع')) {
        return STATES.PACKAGES_SENT;
      }
      break;

    case STATES.DATA_COLLECTED:
      // إذا أرسل البيانات (رقم هوية + جوال)
      if (context.hasPhoneAndId) {
        return STATES.WAITING_REVIEW;
      }
      break;

    default:
      break;
  }

  return null; // لا يوجد انتقال
}

/**
 * الحصول على تعليمات النظام بناءً على المرحلة الحالية
 */
function getStateInstructions(state, packages = []) {
  const packagesText = packages.length > 0
    ? packages.map((p, i) => `الباقة ${i + 1}: صافي التحويل ${p.net_transfer} ريال | إجمالي الأقساط ${p.total_installments} ريال | القسط الشهري ${p.monthly_installment} ريال`).join('\n')
    : 'الباقات غير متوفرة حالياً';

  const instructions = {
    [STATES.START]: `أنت في بداية المحادثة. رحّب بالعميل بشكل مختصر واسأله عن حاجته. لا تشرح الخدمة كاملاً إلا إذا طلب.`,

    [STATES.SERVICE_EXPLAINED]: `العميل يريد معرفة كيفية عمل الخدمة. اشرح بإيجاز: نوفر سيولة مالية عبر تابي وتمارا. العميل يختار باقة، نرفع الطلب، وبعد القبول وسداد القسط الأول يتم التحويل. ثم اسأله إذا يريد رؤية الباقات.`,

    [STATES.PACKAGES_SENT]: `عرض الباقات التالية للعميل وانتظر اختياره:
${packagesText}

اسأله: أي باقة تناسبك؟`,

    [STATES.PACKAGE_SELECTED]: `العميل اختار باقة. أكد له تفاصيل الباقة المختارة ثم اسأله: هل متوفر معك القسط الأول؟`,

    [STATES.DATA_COLLECTED]: `العميل أكد توفر القسط. اطلب منه إرسال:
- رقم الجوال المسجل في تابي أو تمارا
- رقم الهوية أو الإقامة`,

    [STATES.WAITING_REVIEW]: `تم استلام بيانات العميل. أخبره أن طلبه قيد المراجعة وسيتم التواصل معه قريباً.`,

    [STATES.HUMAN_HANDOFF]: `العميل محوّل لموظف خدمة عملاء. البوت لا يرد.`,
  };

  return instructions[state] || `أنت في مرحلة: ${state}. تصرف بشكل مناسب.`;
}

module.exports = {
  STATES,
  TRANSITIONS,
  canTransition,
  determineNextState,
  getStateInstructions,
};
