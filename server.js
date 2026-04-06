const express = require('express');
const path = require('path');
const app = express();

// ── CORS — allow requests from any origin ───────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL_CHAT    = 'claude-haiku-4-5-20251001';
const MODEL_VISION  = 'claude-sonnet-4-20250514';

// ── Helper: call Anthropic API ──────────────────────────────────────
async function callAnthropic(body) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || 'API error ' + resp.status);
  return data;
}

// ── /api/health — Check if server + API key are working ────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    keySet: !!ANTHROPIC_KEY,
    keyLength: ANTHROPIC_KEY.length,
    time: new Date().toISOString()
  });
});

// ── /api/chat — Text AI chat ────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set on server' });
    const { system, messages, max_tokens = 1000 } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array required' });
    }
    const data = await callAnthropic({
      model: MODEL_CHAT,
      max_tokens,
      system: (system || '').slice(0, 4000),
      messages: messages.slice(-10)
    });
    res.json(data);
  } catch (e) {
    console.error('/api/chat error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── /api/vision — Photo/image analysis ─────────────────────────────
app.post('/api/vision', async (req, res) => {
  try {
    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set on server' });
    const { system, prompt, image, mimeType, max_tokens = 1500 } = req.body;
    if (!image) return res.status(400).json({ error: 'image (base64) is required' });

    // Clean base64 — remove data URL prefix if present
    const cleanImage = image.replace(/^data:image\/[a-z]+;base64,/, '');
    const cleanMime  = (mimeType || 'image/jpeg').split(';')[0];

    const data = await callAnthropic({
      model: MODEL_VISION,
      max_tokens,
      system: (system || 'You are EduSmart AI tutor for Indian students. Analyze the image and provide a complete helpful academic answer.').slice(0, 4000),
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: cleanMime, data: cleanImage }
          },
          {
            type: 'text',
            text: prompt || 'Please analyze this image and provide a complete academic explanation.'
          }
        ]
      }]
    });
    res.json(data);
  } catch (e) {
    console.error('/api/vision error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── /api/lesson — AI lesson generation ─────────────────────────────
app.post('/api/lesson', async (req, res) => {
  try {
    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set on server' });
    const { system, messages, max_tokens = 1200 } = req.body;
    const data = await callAnthropic({
      model: MODEL_CHAT,
      max_tokens,
      system: (system || '').slice(0, 4000),
      messages: (messages || []).slice(-4)
    });
    res.json(data);
  } catch (e) {
    console.error('/api/lesson error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Serve index.html for all other routes ──────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ EduSmart server running on port ${PORT}`);
  console.log(`🔑 API Key set: ${!!ANTHROPIC_KEY}`);
});
