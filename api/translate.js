export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, sl, tl } = req.body;
  if (!text || !sl || !tl) {
    return res.status(400).json({ error: 'Missing text, sl, or tl' });
  }

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    if (!response.ok) throw new Error('HTTP ' + response.status);

    const data = await response.json();
    let result = '';
    if (Array.isArray(data[0])) {
      for (const chunk of data[0]) {
        if (chunk && chunk[0]) result += chunk[0];
      }
    }

    return res.status(200).json({ translated: result.trim() || text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
