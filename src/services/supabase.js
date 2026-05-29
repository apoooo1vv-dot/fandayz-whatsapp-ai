/**
 * Supabase Service - خدمة قاعدة البيانات
 * تتعامل مع العملاء والرسائل والباقات في Supabase
 */

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("[Supabase] ⚠️ متغيرات Supabase غير موجودة - سيعمل النظام بدون قاعدة بيانات");
}

const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

// =====================
// Anti-Duplicate Messages
// =====================

/**
 * التحقق من أن الرسالة لم تُعالج مسبقاً
 */
async function isMessageProcessed(whatsappMessageId) {
  if (!supabase || !whatsappMessageId) return false;
  try {
    const { data } = await supabase
      .from("processed_messages")
      .select("whatsapp_message_id")
      .eq("whatsapp_message_id", whatsappMessageId)
      .single();
    return !!data;
  } catch {
    return false;
  }
}

/**
 * تسجيل الرسالة كمعالجة
 */
async function markMessageProcessed(whatsappMessageId) {
  if (!supabase || !whatsappMessageId) return;
  try {
    await supabase
      .from("processed_messages")
      .insert({ whatsapp_message_id: whatsappMessageId })
      .onConflict("whatsapp_message_id")
      .ignore();
  } catch (err) {
    // تجاهل خطأ التكرار
  }
}

// =====================
// Packages Functions
// =====================

let packagesCache = null;
let packagesCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 دقائق

/**
 * الحصول على الباقات النشطة من قاعدة البيانات
 */
async function getActivePackages() {
  if (!supabase) return getDefaultPackages();

  // استخدام الكاش إذا كان حديثاً
  if (packagesCache && Date.now() - packagesCacheTime < CACHE_TTL) {
    return packagesCache;
  }

  try {
    const { data, error } = await supabase
      .from("packages")
      .select("*")
      .eq("is_active", true)
      .order("id", { ascending: true });

    if (error || !data || data.length === 0) {
      return getDefaultPackages();
    }

    packagesCache = data;
    packagesCacheTime = Date.now();
    return data;
  } catch (err) {
    console.error("[Supabase] خطأ في getActivePackages:", err.message);
    return getDefaultPackages();
  }
}

/**
 * الباقات الافتراضية (fallback إذا لم تكن قاعدة البيانات متاحة)
 */
function getDefaultPackages() {
  return [
    { id: 1, name: "الباقة الأولى", total_installments: 1080, monthly_installment: 180, net_transfer: 1050, duration_months: 6 },
    { id: 2, name: "الباقة الثانية", total_installments: 1350, monthly_installment: 225, net_transfer: 1300, duration_months: 6 },
    { id: 3, name: "الباقة الثالثة", total_installments: 1530, monthly_installment: 255, net_transfer: 1500, duration_months: 6 },
    { id: 4, name: "الباقة الرابعة", total_installments: 2700, monthly_installment: 450, net_transfer: 2600, duration_months: 6 },
    { id: 5, name: "الباقة الخامسة", total_installments: 5400, monthly_installment: 900, net_transfer: 5150, duration_months: 6 },
    { id: 6, name: "الباقة السادسة", total_installments: 8100, monthly_installment: 1350, net_transfer: 7700, duration_months: 6 },
    { id: 7, name: "الباقة السابعة", total_installments: 10800, monthly_installment: 1800, net_transfer: 10300, duration_months: 6 },
  ];
}

/**
 * تنسيق قائمة الباقات للإرسال عبر واتساب
 */
function formatPackagesMessage(packages) {
  const lines = ["📦 *الباقات المتوفرة:*\n"];
  packages.forEach((p, i) => {
    lines.push(`*${i + 1}. ${p.name}*`);
    lines.push(`• صافي التحويل: ${p.net_transfer} ريال`);
    lines.push(`• إجمالي الأقساط: ${p.total_installments} ريال`);
    lines.push(`• القسط الشهري: ${p.monthly_installment} ريال`);
    lines.push(`• عدد الأقساط: ${p.duration_months} أقساط\n`);
  });
  lines.push("أي باقة تناسبك؟");
  return lines.join("\n");
}

/**
 * استخراج الباقة المختارة من رسالة العميل
 */
function detectSelectedPackage(message, packages) {
  const msg = message.toLowerCase();
  const arabicNumbers = {
    'الأولى': 1, 'الاولى': 1, 'أول': 1, 'اول': 1, '1': 1,
    'الثانية': 2, 'ثاني': 2, '2': 2,
    'الثالثة': 3, 'ثالث': 3, '3': 3,
    'الرابعة': 4, 'رابع': 4, '4': 4,
    'الخامسة': 5, 'خامس': 5, '5': 5,
    'السادسة': 6, 'سادس': 6, '6': 6,
    'السابعة': 7, 'سابع': 7, '7': 7,
  };

  for (const [key, num] of Object.entries(arabicNumbers)) {
    if (msg.includes(key) || msg.includes(`باقة ${num}`)) {
      return packages.find(p => p.id === num) || null;
    }
  }

  // البحث بالمبلغ
  for (const pkg of packages) {
    if (msg.includes(String(pkg.net_transfer)) || msg.includes(String(pkg.total_installments))) {
      return pkg;
    }
  }

  return null;
}

// =====================
// Customer Functions
// =====================

async function getOrCreateCustomer(phoneNumber) {
  if (!supabase) return null;
  try {
    const { data: existing } = await supabase
      .from("customers")
      .select("*")
      .eq("phone_number", phoneNumber)
      .single();

    if (existing) return existing;

    const { data: newCustomer, error } = await supabase
      .from("customers")
      .insert({
        phone_number: phoneNumber,
        status: "new_customer",
        state_machine_status: "start",
        last_interaction_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return newCustomer;
  } catch (err) {
    console.error("[Supabase] خطأ في getOrCreateCustomer:", err.message);
    return null;
  }
}

async function updateCustomer(phoneNumber, updates) {
  if (!supabase) return null;
  try {
    updates.last_interaction_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("customers")
      .update(updates)
      .eq("phone_number", phoneNumber)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error("[Supabase] خطأ في updateCustomer:", err.message);
    return null;
  }
}

async function getCustomerHandoffStatus(phoneNumber) {
  if (!supabase) return false;
  try {
    const { data } = await supabase
      .from("customers")
      .select("is_human_handoff")
      .eq("phone_number", phoneNumber)
      .single();
    return data?.is_human_handoff || false;
  } catch {
    return false;
  }
}

async function setCustomerHandoff(phoneNumber, status) {
  if (!supabase) return null;
  const updates = {
    is_human_handoff: status,
    state_machine_status: status ? "waiting_human_followup" : "start",
  };
  if (status) updates.status = "waiting_human_followup";
  return updateCustomer(phoneNumber, updates);
}

async function updateCustomerState(phoneNumber, newState, extraData = {}) {
  if (!supabase) return null;
  const updates = {
    state_machine_status: newState,
    ...extraData,
  };
  return updateCustomer(phoneNumber, updates);
}

async function getAllCustomers() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("[Supabase] خطأ في getAllCustomers:", err.message);
    return [];
  }
}

async function getCustomerById(id) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    return null;
  }
}

// =====================
// Message Functions
// =====================

async function saveMessage(phoneNumber, role, content, whatsappMessageId = null) {
  if (!supabase) return null;
  try {
    const customer = await getOrCreateCustomer(phoneNumber);
    if (!customer) return null;

    const { data, error } = await supabase
      .from("messages")
      .insert({
        customer_id: customer.id,
        role,
        content,
        whatsapp_message_id: whatsappMessageId,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error("[Supabase] خطأ في saveMessage:", err.message);
    return null;
  }
}

async function getCustomerMessages(customerId) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    return [];
  }
}

async function getRecentMessages(phoneNumber, limit = 20) {
  if (!supabase) return [];
  try {
    const customer = await getOrCreateCustomer(phoneNumber);
    if (!customer) return [];

    const { data, error } = await supabase
      .from("messages")
      .select("role, content")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []).reverse();
  } catch (err) {
    return [];
  }
}

async function getDashboardStats() {
  if (!supabase) return {};
  try {
    const { data: customers } = await supabase.from("customers").select("status, state_machine_status");
    const total = customers?.length || 0;
    const byStatus = {};
    const byState = {};
    (customers || []).forEach((c) => {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
      byState[c.state_machine_status] = (byState[c.state_machine_status] || 0) + 1;
    });
    return { total, byStatus, byState };
  } catch (err) {
    return {};
  }
}

module.exports = {
  supabase,
  // Anti-duplicate
  isMessageProcessed,
  markMessageProcessed,
  // Packages
  getActivePackages,
  getDefaultPackages,
  formatPackagesMessage,
  detectSelectedPackage,
  // Customers
  getOrCreateCustomer,
  updateCustomer,
  updateCustomerState,
  getCustomerHandoffStatus,
  setCustomerHandoff,
  getAllCustomers,
  getCustomerById,
  // Messages
  saveMessage,
  getCustomerMessages,
  getRecentMessages,
  // Stats
  getDashboardStats,
};
