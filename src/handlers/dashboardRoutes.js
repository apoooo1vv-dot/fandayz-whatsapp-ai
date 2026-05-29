/**
 * Dashboard API Routes - مسارات لوحة التحكم
 * مع حماية API Key وإضافة endpoints للباقات والإعدادات
 */

const express = require("express");
const router = express.Router();
const {
  getAllCustomers,
  getCustomerById,
  getCustomerMessages,
  updateCustomer,
  updateCustomerState,
  setCustomerHandoff,
  saveMessage,
  getDashboardStats,
  getActivePackages,
  supabase,
} = require("../services/supabase");
const { sendTextMessage } = require("../services/whatsapp");

// ===== Middleware للتحقق من API Key =====
function requireApiKey(req, res, next) {
  const apiKey = req.headers["x-api-key"] || req.query.api_key;
  const validKey = process.env.DASHBOARD_API_KEY;

  if (!validKey) {
    console.warn("[Dashboard] ⚠️ DASHBOARD_API_KEY غير محدد");
    return next();
  }

  if (!apiKey || apiKey !== validKey) {
    return res.status(401).json({ error: "غير مصرح - API Key غير صحيح" });
  }
  next();
}

router.use(requireApiKey);

// ===== إحصائيات =====
router.get("/stats", async (req, res) => {
  try {
    const stats = await getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== العملاء =====
router.get("/customers", async (req, res) => {
  try {
    const customers = await getAllCustomers();
    res.json({ success: true, data: customers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/customers/:id", async (req, res) => {
  try {
    const customer = await getCustomerById(req.params.id);
    if (!customer) return res.status(404).json({ error: "العميل غير موجود" });
    res.json({ success: true, data: customer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/customers/:id", async (req, res) => {
  try {
    const customer = await getCustomerById(req.params.id);
    if (!customer) return res.status(404).json({ error: "العميل غير موجود" });

    const allowedFields = ["name", "status", "notes", "is_human_handoff", "selected_package", "state_machine_status"];
    const updates = {};
    allowedFields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const updated = await updateCustomer(customer.phone_number, updates);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== المحادثات =====
router.get("/customers/:id/messages", async (req, res) => {
  try {
    const messages = await getCustomerMessages(req.params.id);
    res.json({ success: true, data: messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/customers/:id/send-message", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "الرسالة مطلوبة" });

    const customer = await getCustomerById(req.params.id);
    if (!customer) return res.status(404).json({ error: "العميل غير موجود" });

    await sendTextMessage(customer.phone_number, message);
    await saveMessage(customer.phone_number, "human_agent", message);

    res.json({ success: true, message: "تم إرسال الرسالة بنجاح" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Human Handoff Control =====
router.post("/customers/:id/toggle-bot", async (req, res) => {
  try {
    const { botEnabled } = req.body;
    if (botEnabled === undefined) return res.status(400).json({ error: "botEnabled مطلوب" });

    const customer = await getCustomerById(req.params.id);
    if (!customer) return res.status(404).json({ error: "العميل غير موجود" });

    await setCustomerHandoff(customer.phone_number, !botEnabled);

    res.json({
      success: true,
      message: botEnabled ? "تم تفعيل البوت" : "تم إيقاف البوت وتحويل للموظف",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/customers/:id/change-status", async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = [
      "new_customer", "waiting_customer_reply", "data_submitted",
      "waiting_human_followup", "payment_pending", "completed", "rejected",
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

// ===== الباقات =====
router.get("/packages", async (req, res) => {
  try {
    const packages = await getActivePackages();
    res.json({ success: true, data: packages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/packages/:id", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
  try {
    const allowedFields = ["name", "total_installments", "monthly_installment", "net_transfer", "is_active"];
    const updates = {};
    allowedFields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const { data, error } = await supabase
      .from("packages")
      .update(updates)
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== إعدادات Telegram =====
router.get("/settings/telegram", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
  try {
    const { data } = await supabase
      .from("system_settings")
      .select("key, value, description")
      .in("key", ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]);
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/settings/telegram", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
  try {
    const { botToken, chatId } = req.body;
    if (!botToken || !chatId) return res.status(400).json({ error: "botToken وchatId مطلوبان" });

    await supabase.from("system_settings").upsert([
      { key: "TELEGRAM_BOT_TOKEN", value: botToken, description: "Token for Telegram Bot" },
      { key: "TELEGRAM_CHAT_ID", value: chatId, description: "Chat ID for Telegram notifications" },
    ]);

    res.json({ success: true, message: "تم حفظ إعدادات Telegram" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
