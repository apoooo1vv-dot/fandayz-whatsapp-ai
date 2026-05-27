const express = require("express");
const app = express();

app.use(express.json());

const VERIFY_TOKEN = "fandayz_verify_token";

const PHONE_NUMBER_ID = "1184335808086817";
const ACCESS_TOKEN = "EAASrkjRHwHwBRq8Y90rBJYoVZAR3NiSm1oeIRYah7qxxQQQ8OZCrGh0k4lK5bQsLtUj9gDwzzNxbYNZATNZARZAxRvWvdFMlTGBbZAQCAZBapVQy5iXAJB1lfwgtbO5UlUBIYnVvtgMT3N61hWio5FRU379xBzSZCY8sHccKrlxf5BRoJg6dphFtMG4NqBRHiSwmJ8ckwbZBTJIS2zZCfq8ds8MTCLGI5ai0ZBwFyJarBlBp5a8VV9fCXCi1tBs5yTSCNXhJdTcuyB5d8v6vYa8R7HgxwZDZD";

app.get("/", (req, res) => {
  res.send("WhatsApp AI Server Running");
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (message) {
      const from = message.from;

      await fetch(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          text: {
            body: "تم استلام رسالتك 🤖🔥"
          }
        })
      });
    }

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
