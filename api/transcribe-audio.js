export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb' // صدای WAV فشرده‌نشده حجم بیشتری از webm داره؛ پیش‌فرض ۱mb برای ضبط‌های چند ثانیه‌ای کافی نیست
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { audioData, mimeType } = req.body;
  if (!audioData || !mimeType) {
    return res.status(400).json({ error: 'Missing audioData or mimeType' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Gemini API key not configured' });
  }

  // Gemini فقط این فرمت‌های صوتی رو قبول می‌کنه — اگه چیز دیگه‌ای برسه بهتره زود و واضح خطا بدیم
  const SUPPORTED_MIME = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac'];
  const cleanMime = mimeType.split(';')[0].trim();
  if (!SUPPORTED_MIME.includes(cleanMime)) {
    console.error('Unsupported mimeType received:', cleanMime, '(raw:', mimeType, ')');
    return res.status(400).json({ error: `فرمت صدا (${cleanMime}) توسط Gemini پشتیبانی نمی‌شود.` });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: cleanMime, // فقط mime type بدون codecs
                  data: audioData
                }
              },
              {
                text: 'Please transcribe this audio exactly as spoken. If it is in Persian/Farsi, transcribe in Persian. If in English, transcribe in English. Return ONLY the transcription text, nothing else.'
              }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1000
          }
        })
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error('Gemini error:', data.error);
      return res.status(502).json({ error: data.error.message });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    return res.status(200).json({ text });

  } catch (err) {
    console.error('transcribe-audio error:', err);
    return res.status(500).json({ error: err.message });
  }
}
