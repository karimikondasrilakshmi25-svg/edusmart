// EduSmart AI Backend — Groq FREE — Bulletproof Version

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(cors({ origin: '*' }));
app.use(express.static('public'));

// ── Rate Limiting ──
const rateLimitMap = new Map();
const RATE_LIMIT = 100;
const RATE_WINDOW = 60 * 60 * 1000;

function checkRateLimit(ip) {
  const now = Date.now();
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  const entry = rateLimitMap.get(ip);
  if (now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ── Health Check ──
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    server: 'EduSmart AI',
    groqKey: process.env.GROQ_API_KEY ? '✅ Loaded' : '❌ MISSING',
    time: new Date().toISOString()
  });
});

// ── Quick AI Test Endpoint ──
app.get('/api/test', async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.json({ success: false, error: 'GROQ_API_KEY not set in environment variables!' });
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'Say: EduSmart AI is working!' }],
        max_tokens: 30
      })
    });
    const data = await response.json();
    if (!response.ok) return res.json({ success: false, error: data.error?.message || 'Groq API error', status: response.status });
    const text = data.choices?.[0]?.message?.content || '';
    res.json({ success: true, message: text, model: 'llama-3.3-70b-versatile' });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

// ── Main AI Endpoint ──
app.post('/api/chat', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many questions! You have used 100 questions this hour. Please wait and try again.' });
  }

  const { system, messages, max_tokens } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid request — messages are required.' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('❌ GROQ_API_KEY is NOT set in environment variables!');
    return res.status(500).json({ error: 'Server not configured — GROQ_API_KEY missing. Contact the app admin.' });
  }

  try {
    // Build Groq messages
    const groqMessages = [];
    if (system) groqMessages.push({ role: 'system', content: String(system).slice(0, 4000) });
    for (const msg of messages.slice(-20)) { // Keep last 20 messages max
      if (msg.role && msg.content) {
        groqMessages.push({ role: msg.role, content: String(msg.content).slice(0, 3000) });
      }
    }

    if (groqMessages.length === 0) {
      return res.status(400).json({ error: 'No valid messages found.' });
    }

    console.log(`[${new Date().toISOString()}] IP: ${ip} | Messages: ${groqMessages.length}`);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: groqMessages,
        max_tokens: Math.min(max_tokens || 1200, 2000),
        temperature: 0.7
      })
    });

    const responseText = await response.text();

    if (!response.ok) {
      let errData = {};
      try { errData = JSON.parse(responseText); } catch(e) {}
      const errMsg = errData.error?.message || responseText;
      console.error(`❌ Groq error ${response.status}:`, errMsg);

      if (response.status === 401) return res.status(500).json({ error: 'Invalid Groq API key. Please update it in Render environment variables.' });
      if (response.status === 429) return res.status(429).json({ error: 'Groq rate limit hit. Please wait 1 minute and try again.' });
      if (response.status === 400) return res.status(400).json({ error: 'Bad request to AI: ' + errMsg });
      return res.status(500).json({ error: 'Groq API error: ' + errMsg });
    }

    let data;
    try { data = JSON.parse(responseText); } catch(e) {
      return res.status(500).json({ error: 'Invalid response from Groq API.' });
    }

    const text = data.choices?.[0]?.message?.content?.trim() || '';
    if (!text) return res.status(500).json({ error: 'Empty response from AI. Please try again.' });

    console.log(`✅ Success! ${text.length} chars`);
    res.json({ text });

  } catch (err) {
    console.error('❌ Server error:', err.message);
    if (err.message.includes('fetch')) {
      return res.status(503).json({ error: 'Cannot reach Groq API. Check internet connection.' });
    }
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
});

// ── Serve frontend for all other routes ──
app.get('*', (req, res) => {
  res.sendFile('index.html', { root: 'public' });
});

// ── Start ──
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   EduSmart AI — Groq FREE Server     ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`🌐 Port: ${PORT}`);
  console.log(`🔑 Groq Key: ${process.env.GROQ_API_KEY ? '✅ LOADED' : '❌ MISSING — add to Render env vars!'}`);
  console.log(`📊 Rate limit: ${RATE_LIMIT} requests/hour`);
  console.log(`💰 Cost: ZERO\n`);
  if (!process.env.GROQ_API_KEY) {
    console.error('⚠️  WARNING: GROQ_API_KEY is not set! AI will not work!');
    console.error('   Go to Render → Your Service → Environment → Add GROQ_API_KEY\n');
  }
});
