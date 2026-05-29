/**
 * Dashboard API Routes - مسارات لوحة التحكم
 * API endpoints للـ Dashboard
 */

const express = require("express");
const router = express.Router();
const {
  getAllCustomers,
  getCustomerById,
  getCustomerMessages,
  updateCustomer,
  setCustomerHandoff,
  saveMessage,
  getDashboardStats,
} = require("../services/supabase");
const { sendTextMessage } = require("../services/whatsapp");

// ===== Middleware للتحقق من API Key =====
function requireApiKey(req, res, next) {
  const apiKey = req.headers["x-api-key"] || req.query.api_key;
  const validKey = process.env.DASHBOARD_API_KEY;

  if (!validKey) {
    // إذا لم يكن هناك API Key محدد، السماح بالوصول (للتطوير فقط)
    console.warn("[Dashboard] ⚠️ DASHBOARD_API_KEY غير محدد - الوصول مفتوح");
    return next();
  }

  if (apiKey !== validKey) {
    return res.status(401).json({ error: "غير مصرح - API Key غير صحيح" });
  }
  next();
}

// تطبيق الـ Middleware على جميع مسارات Dashboard
router.use(requireApiKey);

// ===== إحصائيات عامة =====
router.get("/stats", async (req, res) => {
  try {
    const stats = await getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== العملاء =====

// الحصول على جميع العملاء
router.get("/customers", async (req, res) => {
  try {
    const customers = await getAllCustomers();
    res.json({ success: true, data: customers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// الحصول على عميل واحد
router.get("/customers/:id", async (req, res) => {
  try {
    const customer = await getCustomerById(req.params.id);
    if (!customer) return res.status(404).json({ error: "العميل غير موجود" });
    res.json({ success: true, data: customer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تحديث بيانات عميل
router.patch("/customers/:id", async (req, res) => {
  try {
    const customer = await getCustomerById(req.params.id);
    if (!customer) return res.status(404).json({ error: "العميل غير موجود" });

    const allowedFields = ["name", "status", "notes", "is_human_handoff", "selected_package"];
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const updated = await updateCustomer(customer.phone_number, updates);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== المحادثات =====

// الحصول على رسائل عميل
router.get("/customers/:id/messages", async (req, res) => {
  try {
    const messages = await getCustomerMessages(req.params.id);
    res.json({ success: true, data: messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// إرسال رسالة يدوية من الموظف
router.post("/customers/:id/send-message", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "الرسالة مطلوبة" });

    const customer = await getCustomerById(req.params.id);
    if (!customer) return res.status(404).json({ error: "العميل غير موجود" });

    // إرسال الرسالة عبر WhatsApp
    await sendTextMessage(customer.phone_number, message);

    // حفظ الرسالة في قاعدة البيانات كـ human_agent
    await saveMessage(customer.phone_number, "human_agent", message);

    res.json({ success: true, message: "تم إرسال الرسالة بنجاح" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Human Handoff Control =====

// تفعيل/إيقاف البوت لعميل معين
router.post("/customers/:id/toggle-bot", async (req, res) => {
  try {
    const { botEnabled } = req.body;
    if (botEnabled === undefined) return res.status(400).json({ error: "botEnabled مطلوب" });

    const customer = await getCustomerById(req.params.id);
    if (!customer) return res.status(404).json({ error: "العميل غير موجود" });

    // botEnabled = true يعني البوت شغّال (is_human_handoff = false)
    await setCustomerHandoff(customer.phone_number, !botEnabled);

    res.json({
      success: true,
      message: botEnabled ? "تم تفعيل البوت" : "تم إيقاف البوت وتحويل للموظف",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تغيير حالة الطلب
router.post("/customers/:id/change-status", async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = [
      "new_customer",
      "waiting_customer_reply",
      "data_submitted",
      "waiting_human_followup",
      "payment_pending",
      "completed",
      "rejected",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "حالة غير صالحة", validStatuses });
    }

    const customer = await getCustomerById(req.params.id);
    if (!customer) return res.status(404).json({ error: "العميل غير موجود" });

    const updated = await updateCustomer(customer.phone_number, { status });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
