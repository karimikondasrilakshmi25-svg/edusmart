const express = require('express');
const path = require('path');
const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '25mb' }));

// ⚠️ API routes MUST come BEFORE express.static
const GROQ_KEY  = process.env.GROQ_API_KEY || '';
const GROQ_URL  = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL_CHAT   = 'llama-3.3-70b-versatile';
const MODEL_VISION = 'meta-llama/llama-4-scout-17b-16e-instruct';

async function groq(messages, model, max_tokens = 1000) {
  const resp = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + GROQ_KEY
    },
    body: JSON.stringify({ model, messages, max_tokens, temperature: 0.7 })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || 'Groq error ' + resp.status);
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from Groq');
  return text;
}

const wrap = text => ({ content: [{ type: 'text', text }] });

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', provider: 'Groq AI', keySet: !!GROQ_KEY, keyLength: GROQ_KEY.length, time: new Date().toISOString() });
});

app.post('/api/chat', async (req, res) => {
  try {
    if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not configured' });
    const { system, messages, max_tokens = 1000 } = req.body;
    const msgs = [];
    if (system) msgs.push({ role: 'system', content: system.slice(0, 4000) });
    (messages || []).slice(-10).forEach(m => msgs.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
    }));
    const text = await groq(msgs, MODEL_CHAT, max_tokens);
    res.json(wrap(text));
  } catch(e) {
    console.error('[/api/chat]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/lesson', async (req, res) => {
  try {
    if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not configured' });
    const { system, messages, max_tokens = 1200 } = req.body;
    const msgs = [];
    if (system) msgs.push({ role: 'system', content: system.slice(0, 4000) });
    (messages || []).slice(-4).forEach(m => msgs.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
    }));
    const text = await groq(msgs, MODEL_CHAT, max_tokens);
    res.json(wrap(text));
  } catch(e) {
    console.error('[/api/lesson]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/vision', async (req, res) => {
  try {
    if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not configured' });
    const { system, prompt, image, mimeType, max_tokens = 1500 } = req.body;
    if (!image) return res.status(400).json({ error: 'image is required' });
    const cleanImg  = image.replace(/^data:image\/[a-z]+;base64,/, '');
    const cleanMime = (mimeType || 'image/jpeg').split(';')[0];
    const dataUrl   = `data:${cleanMime};base64,${cleanImg}`;
    const msgs = [];
    if (system) msgs.push({ role: 'system', content: system.slice(0, 2000) });
    msgs.push({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: dataUrl } },
        { type: 'text', text: prompt || 'Analyze this image and provide a complete academic explanation.' }
      ]
    });
    const text = await groq(msgs, MODEL_VISION, max_tokens);
    res.json(wrap(text));
  } catch(e) {
    console.error('[/api/vision]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Static files AFTER API routes
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all → index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ EduSmart on port ${PORT} | Groq key set: ${!!GROQ_KEY}`);
});
