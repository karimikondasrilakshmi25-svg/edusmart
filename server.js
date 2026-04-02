// ═══════════════════════════════════════════════════
//  EduSmart AI Backend Server
//  Using GROQ AI — 100% FREE FOREVER!
//  No credit card. No bills. No limits worries.
// ═══════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────
app.use(express.json());
app.use(cors({ origin: '*' }));
app.use(express.static('public'));

// ── Rate Limiting ───────────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT = 100;
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour

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

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, RATE_WINDOW);

// ── Health Check ────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: '🎓 EduSmart AI Server is running!',
    ai: 'Groq (Free)',
    model: 'llama-3.3-70b-versatile'
  });
});

// ── Main AI Endpoint ────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      error: '⚠️ Too many questions! You have used 100 questions this hour. Please wait and try again! 😊'
    });
  }

  const { system, messages, max_tokens } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid request.' });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: '❌ Server not configured. Add GROQ_API_KEY to .env file.' });
  }

  try {
    // Build messages array for Groq
    const groqMessages = [];

    // Add system message first
    if (system) {
      groqMessages.push({ role: 'system', content: system });
    }

    // Add conversation history
    for (const msg of messages) {
      groqMessages.push({ role: msg.role, content: msg.content });
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',  // Best free model on Groq
        messages: groqMessages,
        max_tokens: max_tokens || 1200,
        temperature: 0.7,
        stream: false
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('Groq API error:', response.status, errData);
      return res.status(response.status).json({
        error: errData.error?.message || 'AI error. Please try again.'
      });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';

    if (!text) throw new Error('Empty response from Groq');

    res.json({ text });

  } catch (err) {
    console.error('Server error:', err.message);
    res.status(500).json({ error: '⚠️ Server error. Please try again in a moment.' });
  }
});

// ── Start ───────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   🎓 EduSmart AI Server              ║');
  console.log('║   Powered by GROQ — 100% FREE!       ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`\n🌐 Open: http://localhost:${PORT}`);
  console.log(`🤖 Model: llama-3.3-70b-versatile`);
  console.log(`🔑 Groq Key: ${process.env.GROQ_API_KEY ? '✅ Loaded' : '❌ MISSING — add to .env'}`);
  console.log(`📊 Rate limit: ${RATE_LIMIT} questions/hour per user`);
  console.log(`💰 Cost: ZERO — Groq is FREE!\n`);
});
