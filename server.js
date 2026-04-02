// ═══════════════════════════════════════════════════
//  EduSmart AI Backend Server
//  Using GROQ AI — 100% FREE FOREVER!
//  Node 18+ native fetch — no extra packages needed
// ═══════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(cors({ origin: '*' }));
app.use(express.static('public'));

// Rate Limiting
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

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, RATE_WINDOW);

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'EduSmart running!',
    key: process.env.GROQ_API_KEY ? 'loaded' : 'MISSING'
  });
});

// Main AI Endpoint
app.post('/api/chat', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many questions! Please wait an hour.' });
  }

  const { system, messages, max_tokens } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid request.' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('GROQ_API_KEY is not set!');
    return res.status(500).json({ error: 'Server not configured. Contact admin.' });
  }

  try {
    const groqMessages = [];
    if (system) groqMessages.push({ role: 'system', content: system });
    for (const msg of messages) {
      groqMessages.push({ role: msg.role, content: String(msg.content) });
    }

    console.log(`Calling Groq... messages: ${groqMessages.length}`);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: groqMessages,
        max_tokens: max_tokens || 1200,
        temperature: 0.7
      })
    });

    const responseText = await response.text();
    console.log(`Groq status: ${response.status}`);

    if (!response.ok) {
      console.error('Groq error:', responseText);
      return res.status(response.status).json({ error: 'AI error. Please try again.' });
    }

    const data = JSON.parse(responseText);
    const text = data.choices?.[0]?.message?.content?.trim() || '';

    if (!text) throw new Error('Empty response');

    console.log(`Success! ${text.length} chars`);
    res.json({ text });

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile('index.html', { root: 'public' });
});

app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   EduSmart AI Server — Groq FREE!    ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`Port: ${PORT}`);
  console.log(`Key: ${process.env.GROQ_API_KEY ? 'LOADED' : 'MISSING!'}`);
});
