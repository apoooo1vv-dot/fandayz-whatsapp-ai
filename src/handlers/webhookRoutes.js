/**
 * Webhook Routes - مسارات Webhook
 * يتعامل مع التحقق والاستقبال من WhatsApp Cloud API
 */

const express = require("express");
const router = express.Router();
const { handleWebhookEvent } = require("./messageHandler");

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

/**
 * GET /webhook - التحقق من Webhook (Meta Verification)
 * يُستخدم مرة واحدة عند ربط الـ Webhook في Meta Developer Console
 */
router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log(`[Webhook] 🔐 طلب تحقق - mode: ${mode}, token: ${token}`);

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[Webhook] ✅ تم التحقق بنجاح!");
    return res.status(200).send(challenge);
  }

  console.warn("[Webhook] ⚠️ فشل التحقق - توكن غير صحيح");
  return res.sendStatus(403);
});

/**
 * POST /webhook - استقبال الرسائل والأحداث من WhatsApp
 */
router.post("/webhook", async (req, res) => {
  const body = req.body;

  // التحقق من أن الطلب من WhatsApp
  if (body.object !== "whatsapp_business_account") {
    console.warn("[Webhook] ⚠️ طلب غير معروف:", body.object);
    return res.sendStatus(404);
  }

  // الرد فورًا بـ 200 لإخبار Meta أننا استلمنا الطلب
  // (Meta تتوقع ردًا خلال 20 ثانية)
  res.sendStatus(200);

  // معالجة الحدث بشكل غير متزامن
  await handleWebhookEvent(body);
});

module.exports = router;
