/**
 * Fandayz WhatsApp AI Agent - Server
 * سيرفر وكيل الذكاء الاصطناعي لخدمة عملاء فاندايز
 *
 * @version 3.0.0 - مع Supabase + Human Handoff + Dashboard API
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const webhookRoutes = require("./src/handlers/webhookRoutes");
const dashboardRoutes = require("./src/handlers/dashboardRoutes");
const { getStats } = require("./src/services/memory");
const { getDashboardStats } = require("./src/services/supabase");

const app = express();

// ===== Middleware =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS للسماح للـ Dashboard بالوصول
app.use(
  cors({
    origin: process.env.DASHBOARD_URL || "*",
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-api-key", "Authorization"],
  })
);

// Logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ===== Routes =====

app.get("/", (req, res) => {
  res.json({
    status: "running",
    service: "Fandayz WhatsApp AI Agent",
    version: "3.0.0",
    timestamp: new Date().toISOString(),
    message: "السيرفر يعمل بشكل طبيعي",
    features: ["WhatsApp Bot", "Human Handoff", "Supabase DB", "Dashboard API"],
  });
});

app.get("/health", async (req, res) => {
  const stats = getStats();
  const dbStats = await getDashboardStats();
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    activeSessions: stats.activeSessions,
    database: dbStats,
    environment: {
      hasWhatsAppToken: !!process.env.WHATSAPP_TOKEN,
      hasPhoneNumberId: !!process.env.PHONE_NUMBER_ID,
      hasVerifyToken: !!process.env.VERIFY_TOKEN,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasSupabase: !!process.env.SUPABASE_URL,
      hasDashboardKey: !!process.env.DASHBOARD_API_KEY,
    },
  });
});

app.get("/stats", async (req, res) => {
  const stats = getStats();
  const dbStats = await getDashboardStats();
  res.json({
    ...stats,
    database: dbStats,
    timestamp: new Date().toISOString(),
  });
});

// Webhook Routes (WhatsApp)
app.use("/", webhookRoutes);

// Dashboard API Routes
app.use("/api/dashboard", dashboardRoutes);

// ===== Error Handling =====
app.use((err, req, res, next) => {
  console.error("[Server] خطأ غير متوقع:", err.message);
  res.status(500).json({
    error: "خطأ داخلي في السيرفر",
    message: err.message,
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: "المسار غير موجود",
    path: req.path,
  });
});

// ===== Server Startup =====
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log("==================================================");
  console.log("Fandayz WhatsApp AI Agent v3.0.0");
  console.log("==================================================");
  console.log("السيرفر يعمل على: http://" + HOST + ":" + PORT);
  console.log("Health Check: http://" + HOST + ":" + PORT + "/health");
  console.log("Webhook URL:  http://" + HOST + ":" + PORT + "/webhook");
  console.log("Dashboard API: http://" + HOST + ":" + PORT + "/api/dashboard");
  console.log("==================================================");

  const requiredVars = [
    "WHATSAPP_TOKEN",
    "PHONE_NUMBER_ID",
    "VERIFY_TOKEN",
    "OPENAI_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "DASHBOARD_API_KEY",
  ];
  const missingVars = requiredVars.filter((v) => !process.env[v]);

  if (missingVars.length > 0) {
    console.warn("تحذير - متغيرات البيئة الناقصة: " + missingVars.join(", "));
  } else {
    console.log("✅ جميع متغيرات البيئة موجودة");
  }
  console.log("==================================================");
});

module.exports = app;
