// ═══ PHRAORTES INTELLIGENCE OS — SERVER ═══
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.static(path.join(__dirname, 'public')));

// ═══ OPENROUTER MODELS (همه مدل‌های موجود) ═══
const OR_MODELS = {
  // FREE TIER
  free: [
    { id: 'meta-llama/llama-3.3-70b-instruct:free',     name: 'Llama 3.3 70B',        plan: 'free'    },
    { id: 'meta-llama/llama-3.2-11b-vision-instruct:free', name: 'Llama 3.2 Vision',   plan: 'free'    },
    { id: 'mistralai/mistral-7b-instruct:free',           name: 'Mistral 7B',           plan: 'free'    },
    { id: 'google/gemma-2-9b-it:free',                   name: 'Gemma 2 9B',           plan: 'free'    },
    { id: 'qwen/qwen-2.5-72b-instruct:free',             name: 'Qwen 2.5 72B',         plan: 'free'    },
  ],
  // STARTER TIER
  starter: [
    { id: 'anthropic/claude-haiku-4-5-20251001',         name: 'Claude Haiku',          plan: 'starter' },
    { id: 'openai/gpt-4o-mini',                          name: 'GPT-4o Mini',           plan: 'starter' },
    { id: 'google/gemini-flash-1.5',                     name: 'Gemini Flash 1.5',      plan: 'starter' },
    { id: 'meta-llama/llama-3.1-70b-instruct',           name: 'Llama 3.1 70B',         plan: 'starter' },
    { id: 'mistralai/mixtral-8x7b-instruct',             name: 'Mixtral 8x7B',          plan: 'starter' },
  ],
  // PRO TIER
  pro: [
    { id: 'anthropic/claude-sonnet-4-6',                 name: 'Claude Sonnet',         plan: 'pro'     },
    { id: 'openai/gpt-4o',                               name: 'GPT-4o',                plan: 'pro'     },
    { id: 'google/gemini-pro-1.5',                       name: 'Gemini Pro 1.5',        plan: 'pro'     },
    { id: 'meta-llama/llama-3.1-405b-instruct',          name: 'Llama 3.1 405B',        plan: 'pro'     },
    { id: 'mistralai/mistral-large',                     name: 'Mistral Large',         plan: 'pro'     },
    { id: 'cohere/command-r-plus',                       name: 'Command R+',            plan: 'pro'     },
    { id: 'deepseek/deepseek-r1',                        name: 'DeepSeek R1',           plan: 'pro'     },
  ],
  // ULTIMATE TIER
  ultimate: [
    { id: 'anthropic/claude-opus-4-6',                   name: 'Claude Opus',           plan: 'ultimate' },
    { id: 'openai/o1-preview',                           name: 'OpenAI o1 Preview',     plan: 'ultimate' },
    { id: 'openai/o1-mini',                              name: 'OpenAI o1 Mini',        plan: 'ultimate' },
    { id: 'google/gemini-ultra',                         name: 'Gemini Ultra',          plan: 'ultimate' },
    { id: 'perplexity/llama-3.1-sonar-huge-128k-online', name: 'Perplexity Sonar',      plan: 'ultimate' },
    { id: 'x-ai/grok-2',                                name: 'Grok 2',                plan: 'ultimate' },
  ]
};

const PLAN_HIERARCHY = { free: 0, starter: 1, pro: 2, ultimate: 3 };

// ═══ HELPER: Check plan access ═══
function canAccessModel(userPlan, modelPlan) {
  return (PLAN_HIERARCHY[userPlan] || 0) >= (PLAN_HIERARCHY[modelPlan] || 0);
}

// ═══ ROUTE: Get available models for plan ═══
app.get('/api/models', (req, res) => {
  const plan = req.query.plan || 'free';
  const available = [];
  Object.values(OR_MODELS).flat().forEach(m => {
    if (canAccessModel(plan, m.plan)) available.push(m);
  });
  res.json({ models: available });
});

// ═══ ROUTE: AI Chat (proxies to OpenRouter — key stays server-side) ═══
app.post('/api/chat', async (req, res) => {
  const { messages, model, userPlan } = req.body;
  if (!messages || !model) return res.status(400).json({ error: 'Missing fields' });

  // Find model meta
  const allModels = Object.values(OR_MODELS).flat();
  const modelMeta = allModels.find(m => m.id === model);
  if (!modelMeta) return res.status(400).json({ error: 'Unknown model' });
  if (!canAccessModel(userPlan || 'free', modelMeta.plan)) {
    return res.status(403).json({ error: 'plan_required', requiredPlan: modelMeta.plan });
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.ALLOWED_ORIGIN || 'https://phraortes.ai',
        'X-Title': 'Phraortes Intelligence OS'
      },
      body: JSON.stringify({ model, messages, max_tokens: 4096 })
    });
    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });
    res.json({ content: data.choices?.[0]?.message?.content || '' });
  } catch (e) {
    res.status(500).json({ error: 'AI service unavailable. Try again.' });
  }
});

// ═══ ROUTE: Image generation ═══
app.post('/api/image', async (req, res) => {
  const { prompt, userPlan } = req.body;
  if (!prompt) return res.status(400).json({ error: 'No prompt' });

  const planLimits = { free: 0, starter: 30, pro: 120, ultimate: -1 };
  if ((planLimits[userPlan] || 0) === 0) {
    return res.status(403).json({ error: 'plan_required', requiredPlan: 'starter' });
  }

  const seed = Math.floor(Math.random() * 99999);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${seed}&model=flux`;
  res.json({ url: imageUrl, seed });
});

// ═══ ROUTE: Video generation (placeholder - وصل کن به RunwayML) ═══
app.post('/api/video', async (req, res) => {
  const { prompt, userPlan } = req.body;
  if (userPlan !== 'pro' && userPlan !== 'ultimate') {
    return res.status(403).json({ error: 'plan_required', requiredPlan: 'pro' });
  }
  // TODO: وقتی RunwayML API گرفتی اینجا وصل کن
  // const runway = await fetch('https://api.runwayml.com/v1/generate', { ... });
  res.json({
    status: 'pending',
    message: 'Video generation coming soon. RunwayML integration in progress.',
    eta: '3-5 minutes'
  });
});

// ═══ ROUTE: Music generation (placeholder - وصل کن به Suno/Udio) ═══
app.post('/api/music', async (req, res) => {
  const { prompt, userPlan } = req.body;
  if (userPlan !== 'pro' && userPlan !== 'ultimate') {
    return res.status(403).json({ error: 'plan_required', requiredPlan: 'pro' });
  }
  // TODO: وقتی Suno API گرفتی اینجا وصل کن
  res.json({
    status: 'pending',
    message: 'Music generation coming soon. Suno integration in progress.',
    eta: '1-2 minutes'
  });
});

// ═══ ROUTE: Live Call token (placeholder - وصل کن به Daily.co) ═══
app.post('/api/call/token', async (req, res) => {
  const { userPlan } = req.body;
  if (userPlan !== 'ultimate') {
    return res.status(403).json({ error: 'plan_required', requiredPlan: 'ultimate' });
  }
  // TODO: وقتی Daily.co API گرفتی اینجا وصل کن
  // const token = await createDailyToken();
  res.json({
    status: 'pending',
    message: 'Live voice/video call coming soon.',
    roomUrl: null
  });
});

// ═══ ROUTE: Payment verify (بعداً blockchain verify واقعی بذار) ═══
app.post('/api/payment/verify', async (req, res) => {
  const { txid, plan, network } = req.body;
  if (!txid || !plan) return res.status(400).json({ error: 'Missing txid or plan' });

  // TODO: وقتی crypto gateway گرفتی اینجا verify واقعی بذار
  // مثلاً: const tx = await verifyOnChain(txid, network);
  // if (!tx.confirmed) return res.status(400).json({ error: 'Not confirmed yet' });

  // فعلاً فقط log می‌کنه — بعداً جایگزین کن
  console.log(`[PAYMENT] Plan: ${plan} | TXID: ${txid} | Network: ${network}`);

  res.json({
    success: true,
    plan,
    activatedAt: new Date().toISOString(),
    note: 'Manual verification active. Real blockchain verify coming soon.'
  });
});

// ═══ ROUTE: Serve app ═══
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✦ Phraortes running on port ${PORT}`));
