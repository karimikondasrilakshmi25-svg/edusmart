const express = require('express');
const path = require('path');
const app = express();

// ── CORS ────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const GROQ_KEY   = process.env.GROQ_API_KEY || '';
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL_CHAT = 'llama-3.3-70b-versatile';      // best free Groq model
const MODEL_VIS  = 'meta-llama/llama-4-scout-17b-16e-instruct'; // Groq vision model

// ── Helper: call Groq chat ──────────────────────────────────────────
async function callGroq(messages, model, max_tokens = 1000) {
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
  return data;
}

// ── Helper: extract text from Groq response ─────────────────────────
function getText(data) {
  return data?.choices?.[0]?.message?.content || null;
}

// ── /api/health ─────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    provider: 'Groq AI',
    keySet: !!GROQ_KEY,
    keyLength: GROQ_KEY.length,
    time: new Date().toISOString()
  });
});

// ── /api/chat — Text AI chat ────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set on server' });
    const { system, messages, max_tokens = 1000 } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array required' });
    }
    const groqMsgs = [];
    if (system) groqMsgs.push({ role: 'system', content: system.slice(0, 4000) });
    messages.slice(-10).forEach(m => groqMsgs.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    }));
    const data = await callGroq(groqMsgs, MODEL_CHAT, max_tokens);
    const text = getText(data);
    if (!text) throw new Error('Empty response from Groq');
    // Return in Anthropic-compatible format so frontend works without changes
    res.json({ content: [{ type: 'text', text }] });
  } catch (e) {
    console.error('/api/chat error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── /api/vision — Photo analysis with Groq vision ──────────────────
app.post('/api/vision', async (req, res) => {
  try {
    if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set on server' });
    const { system, prompt, image, mimeType, max_tokens = 1500 } = req.body;
    if (!image) return res.status(400).json({ error: 'image (base64) is required' });

    const cleanImage = image.replace(/^data:image\/[a-z]+;base64,/, '');
    const cleanMime  = (mimeType || 'image/jpeg').split(';')[0];
    const dataUrl    = `data:${cleanMime};base64,${cleanImage}`;

    const groqMsgs = [];
    if (system) groqMsgs.push({ role: 'system', content: system.slice(0, 2000) });
    groqMsgs.push({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: dataUrl } },
        { type: 'text',      text: prompt || 'Analyze this image and provide a complete academic explanation.' }
      ]
    });

    const data = await callGroq(groqMsgs, MODEL_VIS, max_tokens);
    const text = getText(data);
    if (!text) throw new Error('Empty vision response from Groq');
    res.json({ content: [{ type: 'text', text }] });
  } catch (e) {
    console.error('/api/vision error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── /api/lesson — Lesson generation ────────────────────────────────
app.post('/api/lesson', async (req, res) => {
  try {
    if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set on server' });
    const { system, messages, max_tokens = 1200 } = req.body;
    const groqMsgs = [];
    if (system) groqMsgs.push({ role: 'system', content: system.slice(0, 4000) });
    (messages || []).slice(-4).forEach(m => groqMsgs.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    }));
    const data = await callGroq(groqMsgs, MODEL_CHAT, max_tokens);
    const text = getText(data);
    if (!text) throw new Error('Empty lesson response from Groq');
    res.json({ content: [{ type: 'text', text }] });
  } catch (e) {
    console.error('/api/lesson error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Serve index.html ────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ EduSmart running on port ${PORT}`);
  console.log(`🤖 Provider: Groq AI (FREE)`);
  console.log(`🔑 Key set: ${!!GROQ_KEY}`);
});
