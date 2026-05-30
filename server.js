/**
 * Fandayz WhatsApp AI Agent - Server v5.0
 * النسخة المستقرة للإنتاج
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const webhookRoutes = require("./src/handlers/webhookRoutes");
const dashboardRoutes = require("./src/handlers/dashboardRoutes");
const { getDashboardStats, getClient } = require("./src/services/supabase");

const app = express();

// ===== Middleware =====
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: process.env.DASHBOARD_URL || "*",
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-api-key", "Authorization"],
}));

// Logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ===== Routes =====
app.get("/", (req, res) => {
  res.json({
    status: "running",
    service: "Fandayz WhatsApp AI Agent",
    version: "5.0.0",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", async (req, res) => {
  const db = getClient();
  let dbStatus = "disconnected";
  let dbCustomers = 0;

  if (db) {
    try {
      const { count } = await db.from("customers").select("*", { count: "exact", head: true });
      dbStatus = "connected";
      dbCustomers = count || 0;
    } catch (e) {
      dbStatus = "error: " + e.message;
    }
  }

  res.json({
    status: "healthy",
    uptime: process.uptime(),
    database: { status: dbStatus, customers: dbCustomers },
    environment: {
      hasWhatsAppToken: !!process.env.WHATSAPP_TOKEN,
      hasPhoneNumberId: !!process.env.PHONE_NUMBER_ID,
      hasVerifyToken: !!process.env.VERIFY_TOKEN,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasSupabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasDashboardKey: !!process.env.DASHBOARD_API_KEY,
    },
  });
});

app.use("/", webhookRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Error Handler
app.use((err, req, res, next) => {
  console.error("[Server] خطأ:", err.message);
  res.status(500).json({ error: "خطأ داخلي في السيرفر" });
});

app.use((req, res) => {
  res.status(404).json({ error: "المسار غير موجود", path: req.path });
});

// ===== Startup =====
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

app.listen(PORT, HOST, async () => {
  console.log("=".repeat(50));
  console.log("Fandayz WhatsApp AI Agent v5.0.0");
  console.log("=".repeat(50));
  console.log(`السيرفر: http://${HOST}:${PORT}`);
  console.log(`Health:  http://${HOST}:${PORT}/health`);
  console.log(`Webhook: http://${HOST}:${PORT}/webhook`);
  console.log(`API:     http://${HOST}:${PORT}/api/dashboard`);
  console.log("=".repeat(50));

  // فحص المتغيرات
  const required = ["WHATSAPP_TOKEN", "PHONE_NUMBER_ID", "VERIFY_TOKEN", "OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.warn("⚠️ متغيرات ناقصة:", missing.join(", "));
  } else {
    console.log("✅ جميع المتغيرات موجودة");
  }

  // اختبار الاتصال بـ Supabase
  const db = getClient();
  if (db) {
    try {
      const { count, error } = await db.from("customers").select("*", { count: "exact", head: true });
      if (error) throw error;
      console.log(`✅ Supabase متصل - ${count || 0} عميل في قاعدة البيانات`);
    } catch (e) {
      console.error("❌ Supabase خطأ:", e.message);
    }
  }
  console.log("=".repeat(50));
});

module.exports = app;
