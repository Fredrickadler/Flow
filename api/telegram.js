// ─── لینک مینی اپ را اینجا وارد کنید ───
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://flow-gold-kappa.vercel.app/';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('FLOW Bot is running ✅');
  }

  const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TELEGRAM_TOKEN) {
    return res.status(500).json({ error: 'Telegram token not configured' });
  }

  const update = req.body;

  // فقط پیام‌های متنی رو پردازش کن
  if (!update.message) {
    return res.status(200).json({ ok: true });
  }

  const chatId = update.message.chat.id;
  const text = update.message.text || '';

  // برای هر پیامی (از جمله /start) خوش‌آمدگویی بفرست
  await sendWelcome(TELEGRAM_TOKEN, chatId);

  return res.status(200).json({ ok: true });
}

async function sendWelcome(token, chatId) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const body = {
    chat_id: chatId,
    text: `✨ *به FLOW خوش آمدید!*\n\nیک دستیار هوشمند برای ترجمه و پردازش متن، صدا و تصویر.\n\nبرای شروع روی دکمه زیر ضربه بزنید 👇`,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        {
          text: '⬡  ورود به مینی اپ',
          web_app: { url: MINI_APP_URL }
        }
      ]]
    }
  };

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}
