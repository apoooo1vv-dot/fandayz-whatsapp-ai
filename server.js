/**
 * Fandayz WhatsApp AI Agent - Server
 * سيرفر وكيل الذكاء الاصطناعي لخدمة عملاء فاندايز
 *
 * @version 2.0.0
 */

// تحميل متغيرات البيئة (في التطوير المحلي فقط)
require("dotenv").config();

const express = require("express");
const webhookRoutes = require("./src/handlers/webhookRoutes");
const { getStats } = require("./src/services/memory");

const app = express();

// ===== Middleware =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware بسيط
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ===== Routes =====

/**
 * GET / - الصفحة الرئيسية (Health Check)
 * يُستخدم للتحقق من أن السيرفر يعمل
 */
app.get("/", (req, res) => {
  res.json({
    status: "running",
    service: "Fandayz WhatsApp AI Agent",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
    message: "السيرفر يعمل بشكل طبيعي",
  });
});

/**
 * GET /health - فحص صحة السيرفر
 */
app.get("/health", (req, res) => {
  const stats = getStats();
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    activeSessions: stats.activeSessions,
    environment: {
      hasWhatsAppToken: !!process.env.WHATSAPP_TOKEN,
      hasPhoneNumberId: !!process.env.PHONE_NUMBER_ID,
      hasVerifyToken: !!process.env.VERIFY_TOKEN,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
    },
  });
});

/**
 * GET /stats - إحصائيات المحادثات (للمراقبة)
 */
app.get("/stats", (req, res) => {
  const stats = getStats();
  res.json({
    ...stats,
    timestamp: new Date().toISOString(),
  });
});

// Webhook Routes
app.use("/", webhookRoutes);

// ===== Error Handling =====
app.use((err, req, res, next) => {
  console.error("[Server] خطأ غير متوقع:", err.message);
  res.status(500).json({
    error: "خطأ داخلي في السيرفر",
    message: err.message,
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: "المسار غير موجود",
    path: req.path,
  });
});

// ===== Server Startup =====
// مهم: Railway يتطلب الاستماع على 0.0.0.0 وليس localhost
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log("==================================================");
  console.log("Fandayz WhatsApp AI Agent v2.0.0");
  console.log("==================================================");
  console.log("السيرفر يعمل على: http://" + HOST + ":" + PORT);
  console.log("Health Check: http://" + HOST + ":" + PORT + "/health");
  console.log("Webhook URL: http://" + HOST + ":" + PORT + "/webhook");
  console.log("==================================================");

  // التحقق من المتغيرات المطلوبة
  const requiredVars = [
    "WHATSAPP_TOKEN",
    "PHONE_NUMBER_ID",
    "VERIFY_TOKEN",
    "OPENAI_API_KEY",
  ];
  const missingVars = requiredVars.filter((v) => !process.env[v]);

  if (missingVars.length > 0) {
    console.warn("تحذير - متغيرات البيئة الناقصة: " + missingVars.join(", "));
    console.warn("اضفها في Railway Environment Variables");
  } else {
    console.log("جميع متغيرات البيئة موجودة");
  }
  console.log("==================================================");
});

module.exports = app;
