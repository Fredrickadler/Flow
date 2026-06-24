// مسیر: pages/api/transcribe-audio.js
// ── تبدیل صدا به متن کاملاً سمت سرور، بدون هیچ API key یا سرویس ابری ──
// از مدل متن‌باز Whisper (نسخه‌ی چندزبانه‌ی tiny) با کتابخونه‌ی @huggingface/transformers
// (اجرای ONNX روی Node.js) استفاده می‌کنیم. مدل فقط یک‌بار (موقع cold start) دانلود/کش
// می‌شه و کاربر نهایی هیچ چیزی دانلود نمی‌کنه — همه‌چیز روی خود Vercel اجرا می‌شه.

import { pipeline, env } from '@huggingface/transformers';

// روی Vercel فقط /tmp قابل‌نوشتنه؛ مدل رو همونجا کش می‌کنیم تا بین invocationهای
// یک instance گرم، دوباره دانلود نشه.
env.cacheDir = '/tmp/hf-cache';
env.allowLocalModels = false; // فقط از کش/CDN هاگینگ‌فیس بخون، نه از فایل سیستم پروژه

// pipeline فقط یک‌بار در طول عمر هر instance ساخته می‌شه (نه هر درخواست)
let transcriberPromise = null;
function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny', // نسخه‌ی چندزبانه (نه .en) چون فارسی هم نیاز داریم
      { quantized: true }
    );
  }
  return transcriberPromise;
}

// ── پارس کردن یک فایل WAV ساده (PCM 16-bit) و تبدیل به Float32Array نرمال‌شده ──
function parseWav(buffer) {
  if (
    buffer.length < 44 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('فایل WAV معتبر نیست (هدر RIFF/WAVE پیدا نشد)');
  }

  let offset = 12;
  let sampleRate = 16000;
  let numChannels = 1;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ') {
      numChannels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = chunkSize;
    }
    offset += 8 + chunkSize + (chunkSize % 2); // بایت padding اگه chunkSize فرد بود
  }

  if (dataOffset === -1) throw new Error('بخش data توی فایل WAV پیدا نشد');
  if (bitsPerSample !== 16) throw new Error('فقط WAV با PCM 16-bit پشتیبانی می‌شود');
  // محافظت در برابر دیتای data چاپ‌شده اشتباه/بزرگ‌تر از حد بافر واقعی
  dataSize = Math.min(dataSize, buffer.length - dataOffset);

  const numSamples = Math.floor(dataSize / 2 / numChannels);
  const mono = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    let sum = 0;
    for (let c = 0; c < numChannels; c++) {
      const sampleOffset = dataOffset + (i * numChannels + c) * 2;
      sum += buffer.readInt16LE(sampleOffset);
    }
    mono[i] = (sum / numChannels) / 0x8000;
  }
  return { samples: mono, sampleRate };
}

// Whisper روی نمونه‌برداری ۱۶kHz کار می‌کنه؛ اگه فرکانس ضبط چیز دیگه‌ای بود
// (مثلاً ۴۴۱۰۰ یا ۴۸۰۰۰ که خیلی از مرورگرها پیش‌فرضشونه) با interpolation خطی resample می‌کنیم
function resampleLinear(samples, fromRate, toRate) {
  if (fromRate === toRate) return samples;
  const ratio = fromRate / toRate;
  const newLength = Math.max(1, Math.round(samples.length / ratio));
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, samples.length - 1);
    const frac = srcIndex - i0;
    result[i] = samples[i0] * (1 - frac) + samples[i1] * frac;
  }
  return result;
}

// توجه: این پروژه Next.js نیست (یه Vercel Function ساده‌ست)، پس bodyParser.sizeLimit
// اینجا معنی ندارد. سقف واقعی حجم درخواست توسط خود پلتفرم Vercel ثابت و ۴.۵MB است
// و از کد قابل تغییر نیست؛ به همین خاطر سمت فرانت‌اند صدا رو به ۱۶kHz mono تبدیل و
// محدود به ~۱.۵ دقیقه می‌کنیم تا از این سقف رد نشه.
export const config = {
  maxDuration: 60, // برای cold start (لود مدل) + پردازش؛ پلن Hobby ممکنه نیاز به Fluid Compute داشته باشه
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { audioData, mimeType } = req.body || {};
  if (!audioData) {
    return res.status(400).json({ error: 'Missing audioData' });
  }

  try {
    const wavBuffer = Buffer.from(audioData, 'base64');
    const { samples, sampleRate } = parseWav(wavBuffer);
    const samples16k = resampleLinear(samples, sampleRate, 16000);

    if (samples16k.length < 1600) {
      // کمتر از ۰.۱ ثانیه صدای واقعی — چیزی برای تشخیص نیست
      return res.status(200).json({ text: '' });
    }

    const transcriber = await getTranscriber();
    const result = await transcriber(samples16k, {
      task: 'transcribe',
      // زبان رو مشخص نمی‌کنیم تا خودش بین فارسی/انگلیسی/... تشخیص بده
    });

    const text = (Array.isArray(result) ? result[0]?.text : result?.text) || '';
    return res.status(200).json({ text: text.trim() });
  } catch (err) {
    console.error('transcribe-audio (offline/whisper) error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
