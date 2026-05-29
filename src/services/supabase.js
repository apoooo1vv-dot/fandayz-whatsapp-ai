/**
 * Supabase Service - خدمة قاعدة البيانات
 * تتعامل مع العملاء والرسائل في Supabase
 */

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn(
    "[Supabase] ⚠️ متغيرات Supabase غير موجودة - سيعمل النظام بدون قاعدة بيانات"
  );
}

const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

// =====================
// Customer Functions
// =====================

/**
 * الحصول على عميل أو إنشاؤه بناءً على رقم الهاتف
 */
async function getOrCreateCustomer(phoneNumber) {
  if (!supabase) return null;
  try {
    const { data: existing, error: fetchError } = await supabase
      .from("customers")
      .select("*")
      .eq("phone_number", phoneNumber)
      .single();

    if (existing) return existing;

    const { data: newCustomer, error: insertError } = await supabase
      .from("customers")
      .insert({ phone_number: phoneNumber, status: "new_customer" })
      .select()
      .single();

    if (insertError) throw insertError;
    return newCustomer;
  } catch (err) {
    console.error("[Supabase] خطأ في getOrCreateCustomer:", err.message);
    return null;
  }
}

/**
 * تحديث بيانات العميل
 */
async function updateCustomer(phoneNumber, updates) {
  if (!supabase) return null;
  try {
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

/**
 * الحصول على حالة Human Handoff للعميل
 */
async function getCustomerHandoffStatus(phoneNumber) {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("is_human_handoff")
      .eq("phone_number", phoneNumber)
      .single();

    if (error || !data) return false;
    return data.is_human_handoff;
  } catch (err) {
    console.error("[Supabase] خطأ في getCustomerHandoffStatus:", err.message);
    return false;
  }
}

/**
 * تفعيل/إيقاف Human Handoff
 */
async function setCustomerHandoff(phoneNumber, status) {
  if (!supabase) return null;
  try {
    const updates = { is_human_handoff: status };
    if (status) {
      updates.status = "waiting_human_followup";
    }
    return await updateCustomer(phoneNumber, updates);
  } catch (err) {
    console.error("[Supabase] خطأ في setCustomerHandoff:", err.message);
    return null;
  }
}

/**
 * الحصول على جميع العملاء مع آخر رسالة
 */
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

/**
 * الحصول على عميل واحد بالـ ID
 */
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
    console.error("[Supabase] خطأ في getCustomerById:", err.message);
    return null;
  }
}

// =====================
// Message Functions
// =====================

/**
 * حفظ رسالة في قاعدة البيانات
 */
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

/**
 * الحصول على رسائل عميل معين
 */
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
    console.error("[Supabase] خطأ في getCustomerMessages:", err.message);
    return [];
  }
}

/**
 * الحصول على آخر N رسائل لعميل (للسياق)
 */
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
    console.error("[Supabase] خطأ في getRecentMessages:", err.message);
    return [];
  }
}

/**
 * الحصول على إحصائيات عامة
 */
async function getDashboardStats() {
  if (!supabase) return {};
  try {
    const { data: customers } = await supabase.from("customers").select("status");
    const total = customers?.length || 0;
    const byStatus = {};
    (customers || []).forEach((c) => {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    });
    return { total, byStatus };
  } catch (err) {
    console.error("[Supabase] خطأ في getDashboardStats:", err.message);
    return {};
  }
}

module.exports = {
  supabase,
  getOrCreateCustomer,
  updateCustomer,
  getCustomerHandoffStatus,
  setCustomerHandoff,
  getAllCustomers,
  getCustomerById,
  saveMessage,
  getCustomerMessages,
  getRecentMessages,
  getDashboardStats,
};
