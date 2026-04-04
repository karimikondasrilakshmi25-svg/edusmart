// EduSmart AI Backend — Groq FREE — Simple & Bulletproof

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(cors({ origin: '*' }));
app.use(express.static('public'));

// ── Rate Limiting ──
const rateLimitMap = new Map();
const RATE_LIMIT = 100;
const RATE_WINDOW = 60 * 60 * 1000;
function checkRateLimit(ip) {
  const now = Date.now();
  if (!rateLimitMap.has(ip)) { rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW }); return true; }
  const entry = rateLimitMap.get(ip);
  if (now > entry.resetAt) { rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW }); return true; }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ── Health ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok', groqKey: process.env.GROQ_API_KEY ? 'loaded' : 'MISSING' });
});

// ── Quick Test ──
app.get('/api/test', async (req, res) => {
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.json({ success: false, error: 'GROQ_API_KEY not set!' });
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'Say: EduSmart AI is working!' }], max_tokens: 20 })
    });
    const d = await r.json();
    if (!r.ok) return res.json({ success: false, error: d.error?.message, status: r.status });
    res.json({ success: true, message: d.choices?.[0]?.message?.content, model: 'llama-3.3-70b-versatile' });
  } catch(e) { res.json({ success: false, error: e.message }); }
});

// ── Main AI Chat ──
app.post('/api/chat', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'x').split(',')[0].trim();

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests! Please wait 1 hour.' });
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    console.error('GROQ_API_KEY missing!');
    return res.status(500).json({ error: 'Server not configured — GROQ_API_KEY missing!' });
  }

  let { system, messages, max_tokens } = req.body;

  // Validate
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages must be an array' });
  }

  // Build clean messages array
  const groqMessages = [];

  // Add system message
  if (system && typeof system === 'string') {
    groqMessages.push({
      role: 'system',
      content: system.slice(0, 2000)  // limit system prompt
    });
  }

  // Add conversation — only last 8 messages, clean roles
  const recent = messages.slice(-8);
  for (const msg of recent) {
    const role = msg.role === 'assistant' ? 'assistant' : 'user';
    const content = String(msg.content || '').slice(0, 2000);
    if (content.trim()) {
      groqMessages.push({ role, content });
    }
  }

  // Must have at least one message
  if (groqMessages.length === 0) {
    return res.status(400).json({ error: 'No valid messages' });
  }

  // Last message must be from user
  if (groqMessages[groqMessages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Last message must be from user' });
  }

  console.log(`[${new Date().toISOString()}] Chat request | messages: ${groqMessages.length} | IP: ${ip}`);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: groqMessages,
        max_tokens: Math.min(Number(max_tokens) || 1000, 1000),
        temperature: 0.7
      })
    });

    const text = await response.text();
    console.log(`[Groq] Status: ${response.status}`);

    if (!response.ok) {
      console.error('[Groq] Error:', text.slice(0, 300));
      let errMsg = 'AI error. Please try again.';
      try {
        const errJson = JSON.parse(text);
        errMsg = errJson.error?.message || errMsg;
      } catch(e) {}
      if (response.status === 401) errMsg = 'Invalid API key. Check Render environment variables.';
      if (response.status === 429) errMsg = 'Groq rate limit reached. Wait 1 minute.';
      return res.status(500).json({ error: errMsg });
    }

    const data = JSON.parse(text);
    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return res.status(500).json({ error: 'AI returned empty response. Try again!' });
    }

    console.log(`[Groq] OK — ${reply.length} chars`);
    res.json({ text: reply });

  } catch (err) {
    console.error('[Server] Error:', err.message);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ── Serve frontend ──
app.get('*', (req, res) => {
  res.sendFile('index.html', { root: 'public' });
});

app.listen(PORT, () => {
  console.log(`\n EduSmart AI Server`);
  console.log(` Port: ${PORT}`);
  console.log(` Groq Key: ${process.env.GROQ_API_KEY ? 'LOADED OK' : 'MISSING!'}\n`);
});

// ── Image Analysis — reads photo and answers question ──
app.post('/api/analyze-image', async (req, res) => {
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(500).json({ error: 'Server not configured' });

  const { image, mimeType, target } = req.body;
  if (!image) return res.status(400).json({ error: 'No image provided' });

  // Build prompt based on what the user wants
  let prompt;
  if (target === 'chat') {
    prompt = `A student has sent you a photo of a question from their textbook or notes. 
Look at this image carefully and:
1. Identify what academic question or topic is shown
2. Give a clear, detailed explanation and answer

Format your response as a helpful tutor explaining to a student.
If you cannot read the image clearly, say: "I can see this is a study-related image. Please type out the specific question and I will explain it in detail!"`;
  } else {
    prompt = `A student has taken a photo of a question, textbook page, or study material.
Identify the main academic topic shown in this image.
Reply with ONLY the topic in 4-8 words. Examples:
- "Quadratic equations factoring method"
- "Photosynthesis light dependent reactions"  
- "Newton second law of motion"
- "French Revolution causes and effects"
Just the topic, nothing else.`;
  }

  try {
    // Use Groq vision model - llama-3.2-11b-vision-preview supports images
    const messages = [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: `data:${mimeType || 'image/jpeg'};base64,${image}`
          }
        },
        {
          type: 'text',
          text: prompt
        }
      ]
    }];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'llama-3.2-11b-vision-preview',
        messages,
        max_tokens: target === 'chat' ? 800 : 30,
        temperature: 0.3
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Vision API error:', data.error?.message);
      return res.status(500).json({ error: data.error?.message || 'Vision API error' });
    }

    const result = data.choices?.[0]?.message?.content?.trim() || '';

    if (target === 'chat') {
      res.json({ answer: result, topic: result.split('\n')[0].slice(0, 60) });
    } else {
      res.json({ topic: result });
    }

  } catch(e) {
    console.error('Image analysis error:', e.message);
    res.status(500).json({ error: 'Could not analyze image: ' + e.message });
  }
});
