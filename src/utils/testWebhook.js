/**
 * Webhook Test Utility
 * أداة اختبار Webhook محلي
 *
 * الاستخدام: node src/utils/testWebhook.js
 */

const http = require("http");

const BASE_URL = "http://localhost:3000";

async function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          body: data,
        });
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log("=".repeat(50));
  console.log("اختبار Fandayz WhatsApp AI Server");
  console.log("=".repeat(50));

  // اختبار 1: الصفحة الرئيسية
  console.log("\n[1] اختبار الصفحة الرئيسية GET /");
  const root = await makeRequest("GET", "/");
  console.log(`   Status: ${root.status}`);
  console.log(`   Body: ${root.body.substring(0, 100)}`);

  // اختبار 2: Health Check
  console.log("\n[2] اختبار Health Check GET /health");
  const health = await makeRequest("GET", "/health");
  console.log(`   Status: ${health.status}`);
  console.log(`   Body: ${health.body.substring(0, 200)}`);

  // اختبار 3: Webhook Verification
  console.log("\n[3] اختبار Webhook Verification GET /webhook");
  const verifyToken = process.env.VERIFY_TOKEN || "fandayz_verify_token_2024";
  const webhook = await makeRequest(
    "GET",
    `/webhook?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=TEST_123`
  );
  console.log(`   Status: ${webhook.status}`);
  console.log(
    `   Challenge Response: ${webhook.body} (يجب أن يكون: TEST_123)`
  );

  // اختبار 4: Webhook POST (محاكاة رسالة واتساب)
  console.log("\n[4] اختبار استقبال رسالة POST /webhook");
  const mockMessage = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "TEST_BUSINESS_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "966500000000",
                phone_number_id: "TEST_PHONE_ID",
              },
              messages: [
                {
                  from: "966512345678",
                  id: "TEST_MSG_ID",
                  timestamp: Date.now().toString(),
                  type: "text",
                  text: {
                    body: "مرحبا، أبغى أعرف عن منتجاتكم",
                  },
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };

  const postWebhook = await makeRequest("POST", "/webhook", mockMessage);
  console.log(`   Status: ${postWebhook.status} (يجب أن يكون: 200)`);

  console.log("\n" + "=".repeat(50));
  console.log("انتهى الاختبار");
  console.log("=".repeat(50));
}

runTests().catch(console.error);
