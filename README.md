# Fandayz WhatsApp AI Agent

وكيل ذكاء اصطناعي لخدمة عملاء واتساب لنشاط **فاندايز**، مبني على WhatsApp Cloud API وOpenAI GPT-4o-mini.

---

## المميزات

- استقبال وإرسال رسائل واتساب عبر WhatsApp Cloud API
- ذكاء اصطناعي يرد باللهجة السعودية
- ذاكرة محادثة (Context/Memory) لكل مستخدم
- تحويل المحادثة لموظف بشري عند الطلب
- Health Check و Stats endpoints للمراقبة
- جاهز للتوسع: Dashboard وقاعدة بيانات

---

## هيكل المشروع

```
fandayz-whatsapp-ai/
├── server.js                      # نقطة الدخول الرئيسية
├── package.json
├── .env.example                   # مثال على متغيرات البيئة
├── .gitignore
└── src/
    ├── handlers/
    │   ├── webhookRoutes.js       # مسارات Webhook (GET/POST)
    │   └── messageHandler.js     # معالج الرسائل الرئيسي
    ├── services/
    │   ├── whatsapp.js            # خدمة WhatsApp Cloud API
    │   ├── openai.js              # خدمة OpenAI + System Prompt
    │   └── memory.js              # خدمة الذاكرة (Context)
    └── utils/
        └── testWebhook.js         # أداة اختبار محلي
```

---

## متغيرات البيئة

أضف هذه المتغيرات في **Railway > Variables**:

| المتغير | الوصف | مثال |
|---------|-------|------|
| `WHATSAPP_TOKEN` | توكن WhatsApp Cloud API من Meta | `EAASrk...` |
| `PHONE_NUMBER_ID` | معرف رقم الهاتف في Meta | `1184335808086817` |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | معرف حساب الأعمال | `123456789` |
| `VERIFY_TOKEN` | توكن التحقق من Webhook (تختاره أنت) | `fandayz_verify_token_2024` |
| `OPENAI_API_KEY` | مفتاح OpenAI API | `sk-proj-...` |

> ملاحظة: لا تضيف `PORT` - Railway يضبطه تلقائيًا.

---

## خطوات الإعداد الكامل

### 1. إعداد Railway

1. افتح مشروعك على [Railway](https://railway.app)
2. اذهب إلى **Variables** وأضف جميع المتغيرات أعلاه
3. بعد رفع الكود، سيتم الـ Deploy تلقائيًا من GitHub

### 2. ربط Webhook مع Meta

بعد نجاح الـ Deploy على Railway:

1. افتح [Meta Developer Console](https://developers.facebook.com)
2. اذهب إلى تطبيقك > **WhatsApp > Configuration**
3. في قسم **Webhook**، اضغط **Edit**
4. أدخل:
   - **Callback URL**: `https://YOUR-RAILWAY-URL.railway.app/webhook`
   - **Verify Token**: نفس قيمة `VERIFY_TOKEN` في Railway
5. اضغط **Verify and Save**
6. في **Webhook Fields**، فعّل: `messages`

### 3. اختبار الـ Webhook

بعد الربط، أرسل رسالة واتساب على رقمك التجريبي وتحقق من الـ Logs في Railway.

---

## API Endpoints

| المسار | الطريقة | الوصف |
|--------|---------|-------|
| `/` | GET | Health check - يتحقق أن السيرفر يعمل |
| `/health` | GET | تفاصيل صحة السيرفر ومتغيرات البيئة |
| `/stats` | GET | إحصائيات المحادثات النشطة |
| `/webhook` | GET | التحقق من Webhook (Meta Verification) |
| `/webhook` | POST | استقبال رسائل واتساب |

---

## ميزة التحويل للموظف البشري

يمكن للعميل طلب التحويل بإرسال أي من هذه الكلمات:
- "موظف بشري"
- "أريد إنسان"
- "مدير" أو "مشرف"
- "شكوى رسمية"
- "ابغى موظف"

للعودة للبوت: أرسل **"عودة للبوت"**

---

## التطوير المحلي

```bash
# نسخ متغيرات البيئة
cp .env.example .env
# عدّل .env وأضف قيمك الحقيقية

# تثبيت التبعيات
npm install

# تشغيل السيرفر
npm run dev

# اختبار الـ endpoints
node src/utils/testWebhook.js
```

---

## خارطة التطوير المستقبلي

- [ ] إضافة قاعدة بيانات (PostgreSQL/MongoDB) لحفظ المحادثات
- [ ] Dashboard لمراقبة المحادثات وإدارة الموظفين
- [ ] دعم الصور والملفات في الرسائل
- [ ] تقارير وإحصائيات تفصيلية
- [ ] نظام تذاكر (Tickets) لخدمة العملاء
- [ ] ربط بـ CRM

---

## التقنيات المستخدمة

- **Node.js** + **Express** - السيرفر
- **WhatsApp Cloud API** - استقبال وإرسال الرسائل
- **OpenAI GPT-4o-mini** - الذكاء الاصطناعي
- **Railway** - الاستضافة والـ Deploy
- **GitHub** - إدارة الكود
