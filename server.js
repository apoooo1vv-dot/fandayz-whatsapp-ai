const express = require("express");
const app = express();

app.use(express.json());

const VERIFY_TOKEN = "fandayz_verify_token";
const PHONE_NUMBER_ID = "1184335808086817";

const ACCESS_TOKEN = "EAASrkjRHwHwBRvR0Ab2v88XeAkftCBenR3HtxpApRI7OyZAFxZCI3CljPDtf12VAXORYXNuau2qN4PbPwYZCZAhVvP6IRGUcLBzNoGWg3o7zyYK2ZBH2z6QRWNZBDqz2PiY3Fiv0XybtJtJa0kgiT1XCxr5OZB8ASZAaKrsC7ZBODQQalHbP8D3uHPXC71YTJZBm6vSSlVFir0uWylalC2vWnNF0NE8w1YcFqgkAn8NFYpiukYJYlL8OARgdZA4oeXblCICHnv1oLNYgJ0UHcLucuHv";   // ← حط توكن ميتا هنا
const OPENAI_API_KEY = "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"; // ← حط توكن OpenAI هنا

app.get("/", (req, res) => {
  res.send("WhatsApp AI Server Running");
});

app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY_TOKEN
  ) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return res.sendStatus(200);

    const from = message.from;
    const userText = message.text?.body || "مرحبا";

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "أنت موظف خدمة عملاء ذكي لمشروع Fandayz. رد بالعربي بأسلوب محترم، مختصر، وواضح. خلك لبق وساعد العميل يكمل الطلب."
          },
          {
            role: "user",
            content: userText
          }
        ]
      })
    });

    const aiData = await aiResponse.json();
    const reply = aiData.choices?.[0]?.message?.content || "أهلًا، كيف أقدر أخدمك؟";

    await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: from,
        text: { body: reply }
      })
    });

    res.sendStatus(200);
  } catch (error) {
    console.error("Error:", error);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
