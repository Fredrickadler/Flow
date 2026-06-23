# FLOW — راهنمای دیپلوی روی Vercel

## ۱. Environment Variables در Vercel

در پنل Vercel → Settings → Environment Variables این متغیرها را اضافه کن:

| نام متغیر | مقدار |
|---|---|
| `GEMINI_API_KEY` | کلید Gemini API |
| `ANTHROPIC_API_KEY` | کلید Claude API |
| `TELEGRAM_BOT_TOKEN` | توکن ربات تلگرام |
| `MINI_APP_URL` | آدرس کامل سایت (مثلاً https://flow-app.vercel.app) |

## ۲. تنظیم Webhook ربات تلگرام

بعد از دیپلوی، این URL را در مرورگر باز کن (یک بار کافیه):

```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<your-domain>.vercel.app/api/telegram
```

مثال:
```
https://api.telegram.org/bot8745299125:AAH.../setWebhook?url=https://flow-app.vercel.app/api/telegram
```

## ۳. ساختار پروژه

```
flow-project/
├── public/
│   └── index.html       ← اپ اصلی
├── api/
│   ├── gemini.js        ← پروکسی Gemini (OCR تصویر)
│   ├── transcribe.js    ← پروکسی Claude (تبدیل صدا به متن)
│   └── telegram.js      ← وبهوک ربات تلگرام
├── vercel.json
└── README.md
```
