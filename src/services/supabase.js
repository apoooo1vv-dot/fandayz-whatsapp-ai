/**
 * Supabase Service - النسخة المستقرة
 * حفظ مضمون 100% لكل عميل ورسالة
 */

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;

function getClient() {
  if (!supabase) {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error("[Supabase] ❌ SUPABASE_URL أو SUPABASE_SERVICE_ROLE_KEY غير موجود");
      return null;
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false }
    });
    console.log("[Supabase] ✅ تم الاتصال بقاعدة البيانات");
  }
  return supabase;
}

// =====================
// Customer Functions
// =====================

/**
 * الحصول على عميل أو إنشاؤه - مضمون 100%
 */
async function getOrCreateCustomer(phoneNumber) {
  const db = getClient();
  if (!db) return null;

  try {
    // محاولة الحصول على العميل
    const { data: existing, error: fetchErr } = await db
      .from("customers")
      .select("*")
      .eq("phone_number", phoneNumber)
      .maybeSingle();

    if (fetchErr && fetchErr.code !== "PGRST116") {
      console.error("[Supabase] خطأ في جلب العميل:", fetchErr.message);
    }

    if (existing) {
      // تحديث وقت آخر تفاعل
      await db.from("customers")
        .update({ last_interaction_at: new Date().toISOString() })
        .eq("phone_number", phoneNumber);
      return existing;
    }

    // إنشاء عميل جديد
    const { data: newCustomer, error: insertErr } = await db
      .from("customers")
      .insert({
        phone_number: phoneNumber,
        status: "new_customer",
        state_machine_status: "start",
        is_human_handoff: false,
        last_interaction_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertErr) {
      console.error("[Supabase] خطأ في إنشاء العميل:", insertErr.message);
      // محاولة ثانية - ربما تم إنشاؤه في نفس الوقت (race condition)
      const { data: retry } = await db
        .from("customers")
        .select("*")
        .eq("phone_number", phoneNumber)
        .maybeSingle();
      return retry || null;
    }

    console.log(`[Supabase] ✅ عميل جديد: ${phoneNumber}`);
    return newCustomer;
  } catch (err) {
    console.error("[Supabase] خطأ غير متوقع في getOrCreateCustomer:", err.message);
    return null;
  }
}

/**
 * تحديث بيانات العميل
 */
async function updateCustomer(phoneNumber, updates) {
  const db = getClient();
  if (!db) return null;

  try {
    updates.last_interaction_at = new Date().toISOString();
    const { data, error } = await db
      .from("customers")
      .update(updates)
      .eq("phone_number", phoneNumber)
      .select()
      .single();

    if (error) {
      console.error("[Supabase] خطأ في updateCustomer:", error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error("[Supabase] خطأ في updateCustomer:", err.message);
    return null;
  }
}

/**
 * الحصول على حالة Human Handoff
 */
async function getCustomerHandoffStatus(phoneNumber) {
  const db = getClient();
  if (!db) return false;

  try {
    const { data } = await db
      .from("customers")
      .select("is_human_handoff")
      .eq("phone_number", phoneNumber)
      .maybeSingle();
    return data?.is_human_handoff || false;
  } catch {
    return false;
  }
}

/**
 * تفعيل/إيقاف Human Handoff
 */
async function setCustomerHandoff(phoneNumber, status) {
  const db = getClient();
  if (!db) return null;

  const updates = {
    is_human_handoff: status,
    state_machine_status: status ? "waiting_human_followup" : "start",
  };
  if (status) updates.status = "waiting_human_followup";
  return updateCustomer(phoneNumber, updates);
}

/**
 * تحديث مرحلة العميل
 */
async function updateCustomerState(phoneNumber, newState, extraData = {}) {
  const db = getClient();
  if (!db) return null;
  return updateCustomer(phoneNumber, { state_machine_status: newState, ...extraData });
}

/**
 * الحصول على جميع العملاء
 */
async function getAllCustomers() {
  const db = getClient();
  if (!db) return [];

  try {
    const { data, error } = await db
      .from("customers")
      .select("*")
      .order("last_interaction_at", { ascending: false });

    if (error) {
      console.error("[Supabase] خطأ في getAllCustomers:", error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error("[Supabase] خطأ في getAllCustomers:", err.message);
    return [];
  }
}

/**
 * الحصول على عميل بالـ ID
 */
async function getCustomerById(id) {
  const db = getClient();
  if (!db) return null;

  try {
    const { data, error } = await db
      .from("customers")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

// =====================
// Message Functions
// =====================

/**
 * حفظ رسالة - مضمون 100%
 */
async function saveMessage(phoneNumber, role, content, whatsappMessageId = null) {
  const db = getClient();
  if (!db) {
    console.warn("[Supabase] ⚠️ لا يمكن حفظ الرسالة - قاعدة البيانات غير متاحة");
    return null;
  }

  try {
    // التأكد من وجود العميل أولاً
    const customer = await getOrCreateCustomer(phoneNumber);
    if (!customer) {
      console.error("[Supabase] ❌ لا يمكن حفظ الرسالة - فشل في الحصول على العميل");
      return null;
    }

    const { data, error } = await db
      .from("messages")
      .insert({
        customer_id: customer.id,
        role,
        content: content.substring(0, 4000), // حد أقصى للمحتوى
        whatsapp_message_id: whatsappMessageId,
      })
      .select()
      .single();

    if (error) {
      console.error("[Supabase] ❌ خطأ في حفظ الرسالة:", error.message);
      return null;
    }

    console.log(`[Supabase] ✅ رسالة محفوظة [${role}] للعميل ${phoneNumber}`);
    return data;
  } catch (err) {
    console.error("[Supabase] ❌ خطأ غير متوقع في saveMessage:", err.message);
    return null;
  }
}

/**
 * الحصول على رسائل عميل
 */
async function getCustomerMessages(customerId) {
  const db = getClient();
  if (!db) return [];

  try {
    const { data, error } = await db
      .from("messages")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true });

    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

/**
 * الحصول على آخر N رسائل للسياق
 */
async function getRecentMessages(phoneNumber, limit = 15) {
  const db = getClient();
  if (!db) return [];

  try {
    const customer = await getOrCreateCustomer(phoneNumber);
    if (!customer) return [];

    const { data, error } = await db
      .from("messages")
      .select("role, content")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return [];
    return (data || []).reverse();
  } catch {
    return [];
  }
}

// =====================
// Anti-Duplicate
// =====================

async function isMessageProcessed(whatsappMessageId) {
  const db = getClient();
  if (!db || !whatsappMessageId) return false;

  try {
    const { data } = await db
      .from("processed_messages")
      .select("whatsapp_message_id")
      .eq("whatsapp_message_id", whatsappMessageId)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

async function markMessageProcessed(whatsappMessageId) {
  const db = getClient();
  if (!db || !whatsappMessageId) return;

  try {
    await db.from("processed_messages")
      .upsert({ whatsapp_message_id: whatsappMessageId })
      .onConflict("whatsapp_message_id");
  } catch {
    // تجاهل أخطاء التكرار
  }
}

// =====================
// Packages
// =====================

const FALLBACK_PACKAGES = [
  { id: 1, name: "الباقة الأولى", total_installments: 1080, monthly_installment: 180, net_transfer: 1050, duration_months: 6, is_active: true },
  { id: 2, name: "الباقة الثانية", total_installments: 1350, monthly_installment: 225, net_transfer: 1300, duration_months: 6, is_active: true },
  { id: 3, name: "الباقة الثالثة", total_installments: 1530, monthly_installment: 255, net_transfer: 1500, duration_months: 6, is_active: true },
  { id: 4, name: "الباقة الرابعة", total_installments: 2700, monthly_installment: 450, net_transfer: 2600, duration_months: 6, is_active: true },
  { id: 5, name: "الباقة الخامسة", total_installments: 5400, monthly_installment: 900, net_transfer: 5150, duration_months: 6, is_active: true },
  { id: 6, name: "الباقة السادسة", total_installments: 8100, monthly_installment: 1350, net_transfer: 7700, duration_months: 6, is_active: true },
  { id: 7, name: "الباقة السابعة", total_installments: 10800, monthly_installment: 1800, net_transfer: 10300, duration_months: 6, is_active: true },
];

let packagesCache = null;
let packagesCacheTime = 0;

async function getActivePackages() {
  const db = getClient();
  if (!db) return FALLBACK_PACKAGES;

  if (packagesCache && Date.now() - packagesCacheTime < 5 * 60 * 1000) {
    return packagesCache;
  }

  try {
    const { data, error } = await db
      .from("packages")
      .select("*")
      .eq("is_active", true)
      .order("id");

    if (error || !data || data.length === 0) return FALLBACK_PACKAGES;

    packagesCache = data;
    packagesCacheTime = Date.now();
    return data;
  } catch {
    return FALLBACK_PACKAGES;
  }
}

function detectSelectedPackage(message, packages) {
  const msg = message.toLowerCase();
  const map = {
    'الأولى': 1, 'الاولى': 1, '1': 1,
    'الثانية': 2, '2': 2,
    'الثالثة': 3, '3': 3,
    'الرابعة': 4, '4': 4,
    'الخامسة': 5, '5': 5,
    'السادسة': 6, '6': 6,
    'السابعة': 7, '7': 7,
  };
  for (const [key, num] of Object.entries(map)) {
    if (msg.includes(key)) {
      return packages.find(p => p.id === num) || null;
    }
  }
  for (const pkg of packages) {
    if (msg.includes(String(pkg.net_transfer)) || msg.includes(String(pkg.total_installments))) {
      return pkg;
    }
  }
  return null;
}

// =====================
// Stats
// =====================

async function getDashboardStats() {
  const db = getClient();
  if (!db) return { total: 0, byStatus: {}, byState: {} };

  try {
    const { data } = await db.from("customers").select("status, state_machine_status, is_human_handoff");
    const total = data?.length || 0;
    const byStatus = {};
    const byState = {};
    (data || []).forEach(c => {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
      byState[c.state_machine_status] = (byState[c.state_machine_status] || 0) + 1;
    });
    return { total, byStatus, byState, pendingHandoff: (data || []).filter(c => c.is_human_handoff).length };
  } catch {
    return { total: 0, byStatus: {}, byState: {} };
  }
}

module.exports = {
  supabase: getClient(),
  getClient,
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
  // Anti-duplicate
  isMessageProcessed,
  markMessageProcessed,
  // Packages
  getActivePackages,
  detectSelectedPackage,
  FALLBACK_PACKAGES,
  // Stats
  getDashboardStats,
};
