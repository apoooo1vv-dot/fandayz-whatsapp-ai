/**
 * Webhook Routes - مسارات Webhook
 * مع حماية إضافية ومنع الطلبات المزيفة
 */

const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { handleWebhookEvent } = require("./messageHandler");

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET; // اختياري للتحقق من توقيع Meta

/**
 * التحقق من توقيع Meta (اختياري لكن موصى به)
 */
function verifyMetaSignature(req) {
  if (!WHATSAPP_APP_SECRET) return true; // تخطي إذا لم يكن محدداً

  const signature = req.headers["x-hub-signature-256"];
  if (!signature) return false;

  const expectedSignature = "sha256=" + crypto
    .createHmac("sha256", WHATSAPP_APP_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * GET /webhook - التحقق من Webhook
 */
router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log(`[Webhook] 🔐 طلب تحقق - mode: ${mode}`);

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[Webhook] ✅ تم التحقق بنجاح!");
    return res.status(200).send(challenge);
  }

  console.warn("[Webhook] ⚠️ فشل التحقق");
  return res.sendStatus(403);
});

/**
 * POST /webhook - استقبال الرسائل من WhatsApp
 */
router.post("/webhook", async (req, res) => {
  const body = req.body;

  // التحقق من أن الطلب من WhatsApp
  if (body.object !== "whatsapp_business_account") {
    console.warn("[Webhook] ⚠️ طلب غير معروف:", body.object);
    return res.sendStatus(404);
  }

  // التحقق من التوقيع (إذا كان APP_SECRET محدداً)
  if (WHATSAPP_APP_SECRET && !verifyMetaSignature(req)) {
    console.warn("[Webhook] ⚠️ توقيع غير صحيح - رفض الطلب");
    return res.sendStatus(401);
  }

  // الرد فورًا بـ 200 لإخبار Meta
  res.sendStatus(200);

  // معالجة الحدث بشكل غير متزامن
  setImmediate(async () => {
    try {
      await handleWebhookEvent(body);
    } catch (err) {
      console.error("[Webhook] ❌ خطأ في المعالجة:", err.message);
    }
  });
});

module.exports = router;
