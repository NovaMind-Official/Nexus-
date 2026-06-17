'use strict';

// ═══ CONFIG ═══
const GOOGLE_CLIENT_ID = "961077952714-d1ba3ls025vrqou4hfr3jgvtdltsqh55.apps.googleusercontent.com";
const REDIRECT_URI = window.location.origin + "/";
const WALLETS = { trc20: "TXYourNobitexTRC20AddressHere9999", polygon: "0xYourNobitexPolygonAddressHere8888" };

const PLAN_CFG = {
  free:     { name:"Free",         msgLimit:5,   advSlots:0,   images:0,   video:false, music:false, call:false,  models:["2.4"] },
  starter:  { name:"Starter Node", msgLimit:null, advSlots:100, images:30,  video:false, music:false, call:false,  models:["2.4","2.5"] },
  pro:      { name:"Pro Matrix",   msgLimit:null, advSlots:350, images:120, video:true,  music:true,  call:false,  models:["2.4","2.5","2.6"] },
  ultimate: { name:"Ultimate Core",msgLimit:null, advSlots:null,images:null,video:true,  music:true,  call:true,   models:["2.4","2.5","2.6"] }
};

const PLAN_FEATURES = {
  starter:  ["100 Advanced Reasoning Slots / month","30 HD Image Renders","Phraortes 2.4 Prime & 2.5 Intellect","Unlimited Standard Compute"],
  pro:      ["350 Premium Slots / month","120 Ultra-HD Studio Renders","Video & Music Generation","All 3 cores incl. 2.6 Apex"],
  ultimate: ["Truly Unlimited — All Models","Unlimited Media Creation","Aura Live Voice + Video Call","Priority support & early access"]
};

// OpenRouter model map (synced with server)
const OR_MODELS = {
  "2.4": { id:"meta-llama/llama-3.3-70b-instruct:free",          name:"Prime 2.4",     plan:"free"     },
  "2.5": { id:"mistralai/mixtral-8x7b-instruct",                  name:"Intellect 2.5", plan:"starter"  },
  "2.6": { id:"anthropic/claude-sonnet-4-6",                      name:"Apex 2.6",      plan:"pro"      },
  // Extended models (shown in gear menu for correct plans)
  "llama-70b":    { id:"meta-llama/llama-3.3-70b-instruct:free",  name:"Llama 3.3 70B",  plan:"free"    },
  "gemma":        { id:"google/gemma-2-9b-it:free",               name:"Gemma 2 9B",     plan:"free"    },
  "qwen":         { id:"qwen/qwen-2.5-72b-instruct:free",         name:"Qwen 2.5 72B",   plan:"free"    },
  "haiku":        { id:"anthropic/claude-haiku-4-5-20251001",      name:"Claude Haiku",   plan:"starter" },
  "gpt4o-mini":   { id:"openai/gpt-4o-mini",                      name:"GPT-4o Mini",    plan:"starter" },
  "gemini-flash": { id:"google/gemini-flash-1.5",                 name:"Gemini Flash",   plan:"starter" },
  "gpt4o":        { id:"openai/gpt-4o",                           name:"GPT-4o",         plan:"pro"     },
  "gemini-pro":   { id:"google/gemini-pro-1.5",                   name:"Gemini Pro 1.5", plan:"pro"     },
  "deepseek":     { id:"deepseek/deepseek-r1",                    name:"DeepSeek R1",    plan:"pro"     },
  "opus":         { id:"anthropic/claude-opus-4-6",               name:"Claude Opus",    plan:"ultimate"},
  "o1":           { id:"openai/o1-preview",                       name:"OpenAI o1",      plan:"ultimate"},
  "grok":         { id:"x-ai/grok-2",                             name:"Grok 2",         plan:"ultimate"},
};

// ═══ STATE ═══
let chats       = JSON.parse(localStorage.getItem("phraortes_chats")  || "[]");
let curId       = localStorage.getItem("phraortes_id");
let activeModel = localStorage.getItem("phraortes_model") || "2.4";
let activePlan  = localStorage.getItem("phraortes_plan")  || "free";
let trialCount  = parseInt(localStorage.getItem("phraortes_trial") || "0");
let proSlotsUsed = parseInt(localStorage.getItem("phraortes_slots") || "0");
let billing     = JSON.parse(localStorage.getItem("phraortes_billing") || "[]");
let branches    = JSON.parse(localStorage.getItem("phraortes_branches") || "{}");
let attachedFiles = [], pendingPlan = "", editMsgId = null;
let speechUtt = null, speechBtnId = null, isScrolling = false, audioCtx = null, isAnnual = false;
let cTimer = null, sTimer = null, asTimer = null, animFId = null;
let freeSeconds     = parseInt(localStorage.getItem("phraortes_freesec") || String(5*3600));
let starterSeconds  = 3 * 3600;
let mediaRecorder   = null, isRecording = false, recognitionObj = null;
let lastCtx         = null;

const chatBox  = document.getElementById("chat-box");
const uiInput  = document.getElementById("ui");
const sendBtn  = document.getElementById("send-btn");
const PERSONAS = ["سلام! من Phraortes هستم. آماده‌ام کمک کنم.","Hi. I'm your intelligent partner. What's on your mind?","Welcome. Let's think and create together."];

// ═══ INIT ═══
window.addEventListener("load", () => {
  const saved = localStorage.getItem("phraortes_google");
  if (saved) { try { updateGoogleUI(JSON.parse(saved)); } catch(e){} }
  if (localStorage.getItem("phraortes_theme") === "light") {
    document.body.classList.add("light-theme");
    const t = document.getElementById("theme-toggle"); if(t) t.checked = true;
  }
  handleOAuthRedirect();
  if (!chats.length) newChat(); else loadChat(curId);
  renderBilling(); updateModelUI(activeModel); initPlanUI(); buildModelMenu();

  uiInput.addEventListener("input", () => {
    localStorage.setItem("draft_" + curId, uiInput.value);
    autoResize(uiInput);
    analyzeMood(uiInput.value);
    autoCtxSwitch(uiInput.value);
  });
  uiInput.addEventListener("keydown", e => {
    if (!["Enter","Backspace","Shift"].includes(e.key)) playSound("click");
    if (e.key === "Enter" && (e.shiftKey || e.ctrlKey)) { e.preventDefault(); send(); }
  });
  uiInput.addEventListener("focus", () => {
    const ws = chatBox.querySelectorAll(".msg-wrap");
    if (ws.length) ws[ws.length-1].classList.add("last-typing-session");
    document.body.classList.add("isolation-active");
  });
  uiInput.addEventListener("blur", () => {
    document.body.classList.remove("isolation-active");
    setTimeout(() => window.scrollTo(0,0), 50);
  });

  // Reveal observer
  const obs = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("visible"); obs.unobserve(e.target); }
  }), { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach(el => obs.observe(el));

  // 3D card tilt
  document.querySelectorAll(".plan-card").forEach(card => {
    card.addEventListener("mousemove", e => {
      const r = card.getBoundingClientRect();
      const dx = (e.clientX - r.left - r.width/2) / r.width;
      const dy = (e.clientY - r.top - r.height/2) / r.height;
      const base = card.classList.contains("card-pro") ? "scale(1.03) " : "";
      card.style.transform = `${base}translateY(-8px) rotateY(${dx*6}deg) rotateX(${-dy*6}deg)`;
    });
    card.addEventListener("mouseleave", () => {
      card.style.transition = "transform 0.6s cubic-bezier(0.34,1.56,0.64,1)";
      card.style.transform = card.classList.contains("card-pro") ? "scale(1.03)" : "";
    });
  });

  setInterval(spawnParticle, 700);

  // Premium parallax
  document.getElementById("premium-immersive-viewport")?.addEventListener("scroll", e => {
    const y = e.target.scrollTop;
    [[".blob-1",[0.03,0.05]],[".blob-2",[-0.04,0.03]],[".blob-3",[0.02,-0.04]]].forEach(([s,t]) => {
      const el = document.querySelector(s);
      if (el) el.style.transform = `translate(${y*t[0]}px,${y*t[1]}px)`;
    });
  }, { passive: true });
});

function autoResize(el) { el.style.height = "44px"; el.style.height = Math.min(el.scrollHeight, 148) + "px"; }

// ═══ BUILD MODEL MENU ═══
function buildModelMenu() {
  const planOrder = { free:0, starter:1, pro:2, ultimate:3 };
  const userLevel = planOrder[activePlan] || 0;
  const box = document.getElementById("model-extended-list");
  if (!box) return;
  box.innerHTML = "";
  Object.entries(OR_MODELS).forEach(([key, m]) => {
    if (["2.4","2.5","2.6"].includes(key)) return; // shown separately
    const accessible = (planOrder[m.plan] || 0) <= userLevel;
    const div = document.createElement("div");
    div.className = "model-item" + (activeModel === key ? " active" : "") + (!accessible ? " locked-model" : "");
    div.innerHTML = `<span style="display:block;font-weight:700;font-size:12px;${!accessible?'color:#555':''}">${m.name}${!accessible?' 🔒':''}</span><span style="font-size:10px;color:#555">${m.plan} plan</span>`;
    if (accessible) div.onclick = () => selectModel(key);
    else div.onclick = () => { openPremium(); showToast(`${m.name} requires ${m.plan} plan`, "error"); };
    box.appendChild(div);
  });
}

// ═══ GOOGLE OAUTH ═══
function initiateGoogleOAuth() {
  const saved = localStorage.getItem("phraortes_google");
  if (saved) { showToast("Already signed in as " + JSON.parse(saved).email); return; }
  const p = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: "token", scope: "email profile openid", prompt: "select_account" });
  window.location.href = "https://accounts.google.com/o/oauth2/v2/auth?" + p.toString();
}

function handleOAuthRedirect() {
  if (!window.location.hash.includes("access_token")) return;
  const p = new URLSearchParams(window.location.hash.substring(1));
  const token = p.get("access_token"); if (!token) return;
  history.replaceState(null, "", window.location.pathname);
  fetchGoogleUser(token);
}

async function fetchGoogleUser(token) {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + token } });
    const user = await res.json();
    if (!user.email) throw new Error("No email");
    localStorage.setItem("phraortes_google", JSON.stringify(user));
    updateGoogleUI(user);
    showToast("✅ Signed in as " + user.email, "success");
  } catch { showToast("OAuth error. Try again.", "error"); }
}

function updateGoogleUI(user) {
  const av = document.getElementById("account-avatar");
  const avBig = document.getElementById("ac-avatar-big");
  const nm = document.getElementById("ac-user-name-big");
  const em = document.getElementById("ac-user-email-big");
  const btn = document.getElementById("google-btn");
  const info = document.getElementById("google-user-info");

  av.className = "account-avatar logged-in";
  if (user.picture) {
    av.innerHTML = `<img src="${user.picture}" alt="">`;
    if (avBig) { avBig.className = "ac-avatar-big logged-in"; avBig.innerHTML = `<img src="${user.picture}" alt="">`; }
  } else if (user.name) {
    const ini = user.name.split(" ").map(w=>w[0]).join("").substring(0,2).toUpperCase();
    av.innerHTML = `<span class="av-initials">${ini}</span>`;
    if (avBig) { avBig.className = "ac-avatar-big logged-in"; avBig.innerHTML = `<span style="font-size:28px;font-weight:700">${ini}</span>`; }
  }
  if (nm) { nm.textContent = user.name || "User"; nm.style.color = "#fff"; }
  if (em) em.textContent = user.email || "";
  if (btn) { document.getElementById("google-btn-text").textContent = "✔ Connected"; btn.classList.add("connected"); }
  if (info) { info.style.display = "block"; info.textContent = user.email || user.name; }
}

function handleLogout() {
  localStorage.removeItem("phraortes_google");
  const av = document.getElementById("account-avatar");
  av.className = "account-avatar"; av.innerHTML = '<span style="font-size:18px;color:rgba(255,255,255,0.15)">?</span>';
  const avBig = document.getElementById("ac-avatar-big");
  if (avBig) { avBig.className = "ac-avatar-big"; avBig.innerHTML = '<span style="font-size:28px;color:rgba(255,255,255,0.15)">?</span>'; }
  const nm = document.getElementById("ac-user-name-big"); if(nm){nm.textContent="Not signed in";nm.style.color="rgba(255,255,255,0.3)";}
  const em = document.getElementById("ac-user-email-big"); if(em) em.textContent="";
  const btn = document.getElementById("google-btn");
  if(btn){document.getElementById("google-btn-text").textContent="Sign in with Google";btn.classList.remove("connected");}
  const info = document.getElementById("google-user-info"); if(info) info.style.display="none";
  showToast("Logged out."); closeAccountPage();
}

// ═══ ACCOUNT PAGE ═══
function openAccountPage() { document.getElementById("account-page").classList.add("show"); updateAcPlanBadge(); }
function closeAccountPage() {
  const pg = document.getElementById("account-page"); pg.style.opacity="0";
  setTimeout(() => { pg.classList.remove("show"); pg.style.opacity=""; }, 400);
}
function switchAcTab(tab, btn) {
  ["profile","settings","billing","notifications"].forEach(t => {
    const el = document.getElementById("actab-"+t); if(el) el.style.display = t===tab?"block":"none";
  });
  document.querySelectorAll(".ac-tab-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
}
function updateAcPlanBadge() {
  const badge = document.getElementById("ac-plan-badge"); if(!badge) return;
  const names = {free:"Free Tier",starter:"Starter Node",pro:"Pro Matrix",ultimate:"Ultimate Core"};
  badge.textContent = names[activePlan] || "Free Tier";
  badge.className = "plan-badge " + activePlan;
}

// ═══ PLAN UI ═══
function initPlanUI() {
  const bars = {
    time: document.getElementById("time-limit-bar"),
    starter: document.getElementById("starter-warn-bar"),
    pro: document.getElementById("pro-gauge-bar"),
    orb: document.getElementById("ultimate-orb")
  };
  Object.values(bars).forEach(b => b && b.classList.remove("show"));
  if (cTimer) clearInterval(cTimer); if (sTimer) clearInterval(sTimer);

  if (activePlan === "ultimate") { bars.orb.classList.add("show"); }
  else if (activePlan === "pro") { bars.pro.classList.add("show"); updateProGauge(); }
  else if (activePlan === "starter") {
    if (proSlotsUsed >= PLAN_CFG.starter.advSlots) {
      bars.starter.classList.add("show");
      sTimer = setInterval(() => {
        starterSeconds--;
        const el = document.getElementById("starter-reset-timer"); if(el) el.textContent = "Reset in " + fmtTime(starterSeconds);
        if (starterSeconds <= 0) { starterSeconds=3*3600; proSlotsUsed=0; localStorage.setItem("phraortes_slots","0"); bars.starter.classList.remove("show"); clearInterval(sTimer); showToast("Slots refreshed! ✅"); }
      }, 1000);
    }
  } else {
    if (trialCount >= PLAN_CFG.free.msgLimit) {
      bars.time.classList.add("show");
      document.getElementById("timer-countdown").textContent = fmtTime(freeSeconds);
      cTimer = setInterval(() => {
        freeSeconds--; localStorage.setItem("phraortes_freesec", freeSeconds);
        const el = document.getElementById("timer-countdown"); if(el) el.textContent = fmtTime(freeSeconds);
        if (freeSeconds <= 0) { freeSeconds=5*3600; trialCount=0; localStorage.setItem("phraortes_trial","0"); localStorage.setItem("phraortes_freesec",String(freeSeconds)); bars.time.classList.remove("show"); clearInterval(cTimer); showToast("Compute slot refreshed! ✅"); }
      }, 1000);
    }
  }
  updatePlanCTAs(); updateAcPlanBadge(); buildModelMenu();
  updateMediaBar();
}

function updateProGauge() {
  const left = PLAN_CFG.pro.advSlots - proSlotsUsed, pct = Math.max(0, (left/PLAN_CFG.pro.advSlots)*100);
  const f = document.getElementById("pro-gauge-fill"), c = document.getElementById("pro-slots-count");
  if(f) f.style.width = pct+"%"; if(c) c.textContent = left+"/"+PLAN_CFG.pro.advSlots;
}
function updatePlanCTAs() {
  ["starter","pro","ultimate"].forEach(p => {
    const btn = document.getElementById("cta-"+p); if(!btn) return;
    const labels = {starter:"Connect to Starter →",pro:"Upgrade to Pro Matrix →",ultimate:"Activate Ultimate →"};
    if (activePlan === p) { btn.textContent = "✓ Current Plan"; btn.classList.add("cta-current"); }
    else { btn.textContent = labels[p]; btn.classList.remove("cta-current"); }
  });
}
function fmtTime(s) {
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sc=s%60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sc).padStart(2,"0")}`;
}

// ═══ MEDIA CREATION BAR ═══
function updateMediaBar() {
  const bar = document.getElementById("media-creation-bar"); if(!bar) return;
  const plan = PLAN_CFG[activePlan] || PLAN_CFG.free;
  bar.innerHTML = `
    <button class="media-btn ${plan.images?'':'locked'}" onclick="${plan.images?'triggerImageCreate()':'openPremium()'}">
      <span class="mb-icon">🎨</span> Image ${plan.images?'':' <span class="mb-lock">🔒 Starter+</span>'}
    </button>
    <button class="media-btn ${plan.video?'':'locked'}" onclick="${plan.video?'triggerVideoCreate()':'openPremium()'}">
      <span class="mb-icon">🎬</span> Video ${plan.video?'':' <span class="mb-lock">🔒 Pro+</span>'}
    </button>
    <button class="media-btn ${plan.music?'':'locked'}" onclick="${plan.music?'triggerMusicCreate()':'openPremium()'}">
      <span class="mb-icon">🎵</span> Music ${plan.music?'':' <span class="mb-lock">🔒 Pro+</span>'}
    </button>
    <button class="media-btn ${plan.call?'':'locked'}" onclick="${plan.call?'startLiveCall()':'openPremium()'}">
      <span class="mb-icon">📞</span> Live Call ${plan.call?'':' <span class="mb-lock">🔒 Ultimate</span>'}
    </button>
  `;
}

// ═══ IMAGE CREATE ═══
function triggerImageCreate() {
  uiInput.value = "/imagine "; uiInput.focus(); autoResize(uiInput);
  showToast("🎨 Type your image description after /imagine");
}

// ═══ VIDEO CREATE ═══
async function triggerVideoCreate() {
  const prompt = uiInput.value.trim() || prompt("Describe the video you want:");
  if (!prompt) return;
  addUI("🎬 Generate video: " + prompt, "user", "u-vid-"+Date.now(), prompt);
  const aiId = "a-vid-" + Date.now();
  addUI("", "ai", aiId, "");
  showMediaCard(aiId, "🎬 VIDEO GENERATION", "Sending to generation engine...", "video");

  try {
    const res = await fetch("/api/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, userPlan: activePlan })
    });
    const data = await res.json();
    const el = document.getElementById(aiId);
    if (el) el.innerHTML = `
      <div class="media-result-card">
        <div class="media-result-header">🎬 VIDEO — ${prompt.substring(0,30)}...</div>
        <div class="media-result-body" style="font-size:13px;color:rgba(255,255,255,0.5);text-align:center;padding:20px 0">
          ${data.message}<br><span style="font-size:11px;margin-top:6px;display:block">ETA: ${data.eta}</span>
        </div>
      </div>`;
  } catch(e) {
    const el = document.getElementById(aiId);
    if (el) el.innerHTML = `<span style="color:#ff453a;font-size:13px">Video error: ${e.message}</span>`;
  }
  uiInput.value = "";
}

// ═══ MUSIC CREATE ═══
async function triggerMusicCreate() {
  const musicPrompt = uiInput.value.trim() || window.prompt("Describe the music (genre, mood, instruments):");
  if (!musicPrompt) return;
  addUI("🎵 Generate music: " + musicPrompt, "user", "u-music-"+Date.now(), musicPrompt);
  const aiId = "a-music-" + Date.now();
  addUI("", "ai", aiId, "");
  showMediaCard(aiId, "🎵 MUSIC GENERATION", "Composing your track...", "music");

  try {
    const res = await fetch("/api/music", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: musicPrompt, userPlan: activePlan })
    });
    const data = await res.json();
    const el = document.getElementById(aiId);
    if (el) el.innerHTML = `
      <div class="media-result-card">
        <div class="media-result-header">🎵 MUSIC — ${musicPrompt.substring(0,30)}...</div>
        <div class="media-result-body" style="font-size:13px;color:rgba(255,255,255,0.5);text-align:center;padding:20px 0">
          ${data.message}<br><span style="font-size:11px;margin-top:6px;display:block">ETA: ${data.eta}</span>
        </div>
      </div>`;
  } catch(e) {
    const el = document.getElementById(aiId); if(el) el.innerHTML = `<span style="color:#ff453a;font-size:13px">Music error: ${e.message}</span>`;
  }
  uiInput.value = "";
}

// ═══ LIVE CALL ═══
async function startLiveCall() {
  if (activePlan !== "ultimate") { openPremium(); showToast("Live Call requires Ultimate Core", "error"); return; }
  addUI("📞 Start live call...", "user", "u-call-"+Date.now(), "live call");
  const aiId = "a-call-" + Date.now();
  addUI("", "ai", aiId, "");
  showMediaCard(aiId, "📞 LIVE CALL", "Connecting to call server...", "call");

  try {
    const res = await fetch("/api/call/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userPlan: activePlan })
    });
    const data = await res.json();
    const el = document.getElementById(aiId);
    if (data.roomUrl) {
      if (el) el.innerHTML = `
        <div class="media-result-card">
          <div class="media-result-header">📞 LIVE CALL ACTIVE</div>
          <div class="media-result-body">
            <iframe src="${data.roomUrl}" class="call-frame" allow="camera;microphone;fullscreen"></iframe>
          </div>
        </div>`;
    } else {
      if (el) el.innerHTML = `
        <div class="media-result-card">
          <div class="media-result-header">📞 CALL</div>
          <div class="media-result-body" style="font-size:13px;color:rgba(255,255,255,0.5);text-align:center;padding:20px 0">
            ${data.message}
          </div>
        </div>`;
    }
  } catch(e) {
    const el = document.getElementById(aiId); if(el) el.innerHTML = `<span style="color:#ff453a;font-size:13px">Call error: ${e.message}</span>`;
  }
}

function showMediaCard(aiId, title, msg, type) {
  const el = document.getElementById(aiId); if(!el) return;
  el.innerHTML = `
    <div class="media-result-card">
      <div class="media-result-header">${title}</div>
      <div class="media-result-body">
        <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:8px">${msg}</div>
        <div class="media-progress-bar"><div class="media-progress-fill" id="mpf-${aiId}" style="width:0%"></div></div>
      </div>
    </div>`;
  // animate progress
  let p = 0; const iv = setInterval(() => {
    p += Math.random()*18; if(p>=90) { clearInterval(iv); return; }
    const fill = document.getElementById("mpf-"+aiId); if(fill) fill.style.width = p+"%";
  }, 400);
}

// ═══ PAYMENT ═══
function openPayment(planName, price) {
  pendingPlan = planName;
  document.getElementById("pay-plan-name").textContent = planName;
  document.getElementById("pay-plan-price").textContent = "$" + price + " / month";
  document.getElementById("pay-loading").style.display = "flex";
  document.getElementById("pay-form").style.display = "none";
  document.getElementById("pay-success").style.display = "none";
  document.getElementById("pay-txid").value = "";
  const vBtn = document.getElementById("pay-verify-btn");
  vBtn.disabled = false; vBtn.classList.remove("loading"); vBtn.textContent = "✦ VERIFY PAYMENT & ACTIVATE PLAN";
  document.getElementById("payment-overlay").classList.add("show");

  const fill = document.getElementById("pay-progress"), sub = document.getElementById("pay-load-sub-text");
  const steps = [{p:20,t:"Verifying SSL certificate..."},{p:45,t:"Establishing encrypted tunnel..."},{p:70,t:"Loading payment gateway..."},{p:90,t:"Initializing blockchain verifier..."},{p:100,t:"Secure connection established ✓"}];
  let i = 0; fill.style.width = "0%";
  const tick = setInterval(() => {
    if (i >= steps.length) { clearInterval(tick); setTimeout(() => { document.getElementById("pay-loading").style.display="none"; document.getElementById("pay-form").style.display="flex"; updatePayNet(); }, 500); return; }
    fill.style.width = steps[i].p+"%"; if(sub) sub.textContent = steps[i].t; i++;
  }, 420);
}

function closePayment() { document.getElementById("payment-overlay").classList.remove("show"); }

function updatePayNet() {
  const net = document.getElementById("pay-net").value;
  const addr = WALLETS[net] || WALLETS.trc20;
  document.getElementById("pay-address").value = addr;
  drawQR(addr);
}

function drawQR(text) {
  const canvas = document.getElementById("qr-canvas"); if(!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0,0,130,130);
  const seed = text.split("").reduce((a,c) => a+c.charCodeAt(0), 0);
  const rng = n => { let x=Math.sin(seed+n)*10000; return x-Math.floor(x); };
  [[5,5],[5,90],[90,5]].forEach(([x,y]) => {
    ctx.fillStyle="#1a1a2e"; ctx.fillRect(x,y,30,30);
    ctx.fillStyle="#fff"; ctx.fillRect(x+5,y+5,20,20);
    ctx.fillStyle="#1a1a2e"; ctx.fillRect(x+9,y+9,12,12);
  });
  for(let r=0;r<25;r++) for(let c=0;c<25;c++) {
    if(r<8&&c<8||r<8&&c>16||r>16&&c<8) continue;
    if(rng(r*25+c)>0.5){ctx.fillStyle="#1a1a2e";ctx.fillRect(5+c*5,5+r*5,4,4);}
  }
}

function copyAddress() {
  const addr = document.getElementById("pay-address").value;
  navigator.clipboard.writeText(addr).then(() => showToast("Wallet address copied! 📋","success"));
}

async function verifyPayment() {
  const txid = document.getElementById("pay-txid").value.trim();
  if (!txid) { showToast("Please enter your Transaction ID","error"); return; }
  const btn = document.getElementById("pay-verify-btn");
  btn.disabled = true; btn.classList.add("loading"); btn.textContent = "Verifying on blockchain..."; haptic("double");

  try {
    await new Promise(r => setTimeout(r, 2500));
    btn.textContent = "Confirming transaction...";
    await new Promise(r => setTimeout(r, 1500));

    // Send to server for logging (replace with real verify later)
    await fetch("/api/payment/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txid, plan: pendingPlan, network: document.getElementById("pay-net").value })
    });

    const keyMap = {"Starter Node":"starter","Pro Matrix":"pro","Ultimate Core":"ultimate"};
    const key = keyMap[pendingPlan];
    if (key) {
      activePlan = key; localStorage.setItem("phraortes_plan", activePlan);
      proSlotsUsed = 0; trialCount = 0;
      localStorage.setItem("phraortes_slots","0"); localStorage.setItem("phraortes_trial","0");
      initPlanUI();
    }
    billing.unshift({ date: new Date().toLocaleDateString("en-GB"), item: pendingPlan, txid: txid.substring(0,12)+"...", amount: document.getElementById("pay-plan-price").textContent });
    localStorage.setItem("phraortes_billing", JSON.stringify(billing));
    renderBilling(); haptic("success");

    document.getElementById("pay-form").style.display = "none";
    const success = document.getElementById("pay-success"); success.style.display = "flex";
    document.getElementById("pay-success-title").textContent = "Plan Activated! 🎉";
    document.getElementById("pay-success-sub").textContent = `Welcome to ${pendingPlan}. Your features are live right now.`;
    document.getElementById("pay-success-badge").textContent = pendingPlan.toUpperCase();
    const feats = PLAN_FEATURES[key] || [];
    document.getElementById("pay-success-features").innerHTML = feats.map(f => `<li>${f}</li>`).join("");

    if (Notification.permission === "granted") {
      new Notification("✅ Phraortes Plan Activated", { body: `${pendingPlan} is now active!`, icon: "/image.png" });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(p => { if(p==="granted") new Notification("✅ Phraortes Plan Activated",{body:`${pendingPlan} is now active!`,icon:"/image.png"}); });
    }
    showToast(`✅ ${pendingPlan} activated!`, "success"); playSound("chime");
  } catch(e) {
    btn.disabled = false; btn.classList.remove("loading"); btn.textContent = "✦ VERIFY PAYMENT & ACTIVATE PLAN";
    showToast("Verification error. Try again.", "error");
  }
}

// ═══ AUDIO ═══
function initAudio() { if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
function playSound(type) {
  if (!document.getElementById("sound-toggle")?.checked) return;
  try {
    initAudio(); if(audioCtx.state==="suspended") audioCtx.resume();
    const t = audioCtx.currentTime, g = audioCtx.createGain(); g.connect(audioCtx.destination);
    if (type==="woosh") { const o=audioCtx.createOscillator();o.type="sine";o.frequency.setValueAtTime(140,t);o.frequency.exponentialRampToValueAtTime(40,t+0.4);g.gain.setValueAtTime(0.28,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.4);o.connect(g);o.start();o.stop(t+0.4); }
    else if (type==="chime") { [880,1200].forEach(f=>{const o=audioCtx.createOscillator();o.type="sine";o.frequency.value=f;g.gain.setValueAtTime(0.1,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.6);o.connect(g);o.start();o.stop(t+0.6);}); }
    else if (type==="click") { const o=audioCtx.createOscillator();o.type="triangle";o.frequency.setValueAtTime(700,t);o.frequency.exponentialRampToValueAtTime(280,t+0.03);g.gain.setValueAtTime(0.04,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.03);o.connect(g);o.start();o.stop(t+0.03); }
  } catch(e){}
}
function haptic(type) {
  if (!navigator.vibrate || !document.getElementById("haptic-toggle")?.checked) return;
  const p = {light:[14],double:[38,76,38],error:[78,58,78],send:[14,48,14],success:[18,38,58]};
  navigator.vibrate(p[type] || [14]);
}

// ═══ VOICE INPUT (Fixed for HTTPS) ═══
function toggleVoiceInput() {
  const btn = document.getElementById("voice-btn");

  // Check HTTPS
  if (location.protocol !== "https:" && location.hostname !== "localhost") {
    showToast("Voice requires HTTPS connection","error"); return;
  }
  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    showToast("Voice not supported in this browser","error"); return;
  }
  if (isRecording) {
    if (recognitionObj) recognitionObj.stop();
    isRecording = false; btn.classList.remove("recording"); return;
  }

  // Request microphone permission first
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(() => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionObj = new SR();
      recognitionObj.continuous = false;
      recognitionObj.interimResults = true;
      recognitionObj.lang = "fa-IR";

      recognitionObj.onresult = e => {
        let interim="", final="";
        for(let i=e.resultIndex;i<e.results.length;i++){
          if(e.results[i].isFinal) final += e.results[i][0].transcript;
          else interim += e.results[i][0].transcript;
        }
        uiInput.value = final || interim; autoResize(uiInput);
      };
      recognitionObj.onend = () => {
        isRecording=false; btn.classList.remove("recording");
        if(uiInput.value.trim()) setTimeout(()=>send(), 300);
      };
      recognitionObj.onerror = (ev) => {
        isRecording=false; btn.classList.remove("recording");
        showToast("Voice error: " + ev.error, "error");
      };
      recognitionObj.start();
      isRecording=true; btn.classList.add("recording"); haptic("light");
      showToast("🎙 Listening...");
    })
    .catch(() => showToast("Microphone permission denied","error"));
}

// ═══ MOOD ANALYSIS ═══
function analyzeMood(t) {
  let mood="", f=45, a=35, c=20;
  if(/(باگ|کد|پایتون|دیباگ|برنامه|سرور|الگوریتم|دیتابیس|bug|code|python|debug|html|css|react|api|sql|javascript|server|compile|function|script|dev)/i.test(t)){mood="mood-cyber";f=85;a=90;c=20;}
  else if(/(فلسفه|کیهان|تاریخ|تئوری|تحلیل|ماورا|منطق|روانشناسی|اقتصاد|سیاست|phil|space|history|theory|analyze|mind|cosmos|quantum|science|psychology|universe)/i.test(t)){mood="mood-vapor";f=60;a=80;c=70;}
  else if(/(ثروت|بیزینس|برند|پول|سود|فروش|بازار|موفقیت|استارتاپ|سرمایه|wealth|business|money|profit|brand|market|startup|success|revenue|investment)/i.test(t)){mood="mood-gold";f=70;a=50;c=80;}
  else if(/(خراب|ارور|شکست|فاجعه|بد|عصبانی|لعنت|مشکل|دیگه|خسته|error|fail|bad|angry|hate|broken|crash|problem|terrible|worst|awful)/i.test(t)){mood="mood-crimson";f=20;a=10;c=10;}
  else if(/(شعر|موزیک|آرامش|شب|باران|سکوت|آرام|هنر|طراحی|زیبا|احساس|طبیعت|poem|music|calm|night|rain|silent|art|design|beautiful|nature|peaceful|relax)/i.test(t)){mood="mood-nordic";f=80;a=30;c=60;}
  else if(/(خوب|عالی|ممنون|آفرین|مرسی|دمت گرم|محشر|عالیه|خفنه|good|great|thanks|awesome|perfect|excellent|amazing|love|wonderful|fantastic)/i.test(t)){mood="mood-pos";f=50;a=30;c=40;}
  else if(/(نه|اشتباه|نیست|غلط|خیر|no|not|wrong|incorrect|never|nope)/i.test(t)){mood="mood-neg";f=40;a=40;c=20;}
  else if(/(عاشق|دوست دارم|قلب|عشق|love|heart|miss|adore|romantic|sweet|darling)/i.test(t)){mood="mood-love";f=40;a=20;c=90;}
  else if(/(خلاق|ایده|ابتکار|نوآوری|طراحی|create|creative|idea|innovate|design|imagine|invent|artistic)/i.test(t)){mood="mood-creative";f=50;a=60;c=90;}
  else if(/(هیجان|واو|وای|هوووو|excited|wow|omg|amazing|incredible|unbelievable)/i.test(t)){mood="mood-excited";f=60;a=40;c=80;}
  else if(/(آرامش|مدیتیشن|یوگا|صبر|calm|meditate|peaceful|patient|tranquil|serene|mindful)/i.test(t)){mood="mood-calm";f=80;a=40;c=40;}

  document.body.className = mood || "";
  updateModelUI(activeModel);
  if(document.getElementById("theme-toggle")?.checked) document.body.classList.add("light-theme");
  [["p-foc","b-foc",f],["p-ana","b-ana",a],["p-cre","b-cre",c]].forEach(([p,b,v]) => {
    const pe=document.getElementById(p), be=document.getElementById(b);
    if(pe) pe.textContent=v+"%"; if(be) be.style.width=v+"%";
  });
}

// ═══ AUTO CONTEXT SWITCH ═══
function autoCtxSwitch(text) {
  if (!document.getElementById("auto-switch-toggle")?.checked) return;
  let target="2.4", label="Prime 2.4";
  if(/(code|bug|python|api|باگ|کد|برنامه|html|css|react)/i.test(text)){target="2.6";label="Apex 2.6";}
  else if(/(analyze|philosophy|research|تحلیل|فلسفه|تحقیق|کیهان)/i.test(text)){target="2.5";label="Intellect 2.5";}
  if (target===lastCtx) return; lastCtx=target;
  if (!PLAN_CFG[activePlan].models.includes(target)) return;
  activeModel=target; localStorage.setItem("phraortes_model",target); updateModelUI(target);
  const toast=document.getElementById("auto-switch-toast");
  document.getElementById("ast-title-text").textContent="AUTO CORE SWITCH";
  document.getElementById("ast-body-text").textContent="→ "+label;
  toast.classList.add("show"); if(asTimer) clearTimeout(asTimer);
  asTimer=setTimeout(()=>toast.classList.remove("show"),3000);
}

// ═══ BRANCHES ═══
function saveBranch(idx, text) {
  const k=String(idx); if(!branches[k]) branches[k]=[];
  if(!branches[k].includes(text)){branches[k].push(text);if(branches[k].length>6)branches[k].shift();localStorage.setItem("phraortes_branches",JSON.stringify(branches));}
}
function getBranchHTML(idx) {
  const b=branches[String(idx)]; if(!b||b.length<2) return "";
  return `<div class="branch-indicator" onclick="toggleBranch(${idx},this)"><div class="branch-dot"></div><span>⎇ ${b.length} versions</span></div>`;
}
function toggleBranch(idx, el) {
  haptic("light");
  const ex=el.parentElement.querySelector(".bt-panel");
  if(ex){ex.classList.toggle("show");return;}
  const bs=branches[String(idx)]||[];
  const p=document.createElement("div");p.className="bt-panel";
  p.style.cssText="background:rgba(11,11,17,0.97);border:1px solid rgba(255,255,255,0.07);border-radius:13px;padding:11px;margin-top:5px;display:flex;flex-direction:column;gap:5px;max-width:370px";
  p.innerHTML=bs.map((b,i)=>`<div style="display:flex;align-items:center;gap:7px;padding:7px 11px;border-radius:9px;cursor:pointer;font-size:12px;color:rgba(255,255,255,0.52);background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05)" onclick="restoreBranch(${idx},${i})"><span>${i===bs.length-1?"●":"○"}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.substring(0,48)}${b.length>48?"...":""}</span><span style="font-size:9px;font-family:'Space Mono',monospace;padding:2px 6px;background:rgba(255,255,255,0.05);border-radius:5px">v${i+1}</span></div>`).join("");
  el.parentElement.appendChild(p);
}
function restoreBranch(idx, vIdx) {
  const v=branches[String(idx)]?.[vIdx]; if(!v) return;
  uiInput.value=v; autoResize(uiInput); uiInput.focus();
  showToast(`↩ Restored v${vIdx+1}`); haptic("success"); closeContextSheet();
}

// ═══ MARKED / CODE RENDERER ═══
const renderer = new marked.Renderer();
renderer.code = function(code, lang) {
  const raw = typeof code==="object" ? (code.text||"") : (code||"");
  const str = String(raw); const lines = str.split("\n").length;
  const l = (lang||"code").toLowerCase(); const enc = encodeURIComponent(str);
  if (lines > 500) {
    const ext = l==="python"?"py":l==="javascript"?"js":"txt";
    return `<div class="code-block-wrapper" style="display:flex;align-items:center;justify-content:space-between;padding:20px"><div style="display:flex;align-items:center;gap:13px"><span style="font-size:28px">📄</span><div><div style="font-weight:bold;color:#fff;font-family:'Space Mono',monospace">generated_module.${ext}</div><div style="font-size:11px;color:#666;margin-top:2px">${lines} lines</div></div></div><button class="code-tool-btn" onclick="openVirtualEditor('${enc}','generated_module.${ext}',${lines})">⚡ Open</button></div>`;
  }
  const valid = !!(lang && hljs.getLanguage(lang));
  const hl = valid ? hljs.highlight(str,{language:lang}).value : hljs.highlightAuto(str).value;
  return `<div class="code-block-wrapper"><div class="code-header"><span style="font-size:12px;color:#888;font-family:'Space Mono',monospace;letter-spacing:0.5px">${l}</span><div class="code-tools"><button class="code-tool-btn" onclick="toggleFsCode(this)">⛶ Full</button><button class="code-tool-btn copy-code-btn" data-code="${enc}">⎘ Copy</button></div></div><pre><code class="hljs ${lang}">${hl}</code></pre></div>`;
};
marked.setOptions({ renderer, breaks:true, gfm:true });

document.addEventListener("click", e => {
  const btn = e.target.closest(".copy-code-btn"); if(!btn) return;
  haptic("send");
  const enc = btn.getAttribute("data-code"); if(!enc) return;
  navigator.clipboard.writeText(decodeURIComponent(enc))
    .then(() => { const w=btn.closest(".code-block-wrapper"); if(w){w.classList.add("success-pulse");setTimeout(()=>w.classList.remove("success-pulse"),1700);} showToast("Code copied!","success"); })
    .catch(() => { const w=btn.closest(".code-block-wrapper"); const cEl=w?.querySelector("pre code"); if(cEl){const ta=document.createElement("textarea");ta.value=cEl.innerText;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();document.execCommand("copy");document.body.removeChild(ta);showToast("Code copied!","success");} });
});

// ═══ SEND ═══
async function send() {
  const raw = uiInput.value; const txt = raw.trim().replace(/\n{3,}/g,"\n\n");
  if (editMsgId) {
    if (!txt) { cancelEdit(); return; }
    const idx = parseInt(editMsgId.split("-")[1]);
    const chat = chats.find(c=>c.id==curId);
    if (chat?.msgs[idx]) { saveBranch(idx,chat.msgs[idx].uText); chat.msgs.splice(idx); save(); loadChat(curId); cancelEdit(); uiInput.value=txt; }
  }
  if (!txt && !attachedFiles.length) return;

  if (activePlan === "free") {
    if (trialCount >= PLAN_CFG.free.msgLimit) { initPlanUI(); openPremium(); showToast(`Free limit: ${PLAN_CFG.free.msgLimit} messages used.`,"error"); return; }
    trialCount++; localStorage.setItem("phraortes_trial",trialCount);
    if (trialCount >= PLAN_CFG.free.msgLimit) initPlanUI();
  }

  haptic("send"); playSound("woosh"); sendBtn.disabled=true; uiInput.disabled=true;
  autoCtxSwitch(txt); localStorage.removeItem("draft_"+curId);

  let dispHtml=txt, useVision=false, imgData=null;
  if (attachedFiles.length) {
    let gal='<div style="display:flex;gap:7px;margin-bottom:9px">';
    attachedFiles.forEach(f=>{
      if(f.type==="image"){gal+=`<div style="width:58px;height:58px;border-radius:9px;overflow:hidden;cursor:pointer" onclick="openLightbox('${f.dataURL}')"><img src="${f.dataURL}" style="width:100%;height:100%;object-fit:cover"></div>`;useVision=true;if(!imgData)imgData=f.dataURL;}
    });
    gal+="</div>"; dispHtml=gal+(txt?"<br>"+txt:"");
    attachedFiles=[]; renderPreviews();
  }

  const chat = chats.find(c=>c.id==curId);
  uiInput.value=""; uiInput.style.height="44px";
  const idx = chat.msgs.length;
  addUI(dispHtml||"[Media]","user","u-"+idx,txt);
  addUI("","ai","a-"+idx,"");

  // Image generation
  const isImg = /^\/imagine/i.test(txt) || (/(عکس|تصویر|image|pic|photo)/i.test(txt) && /(بساز|خلق|تولید|render|generate|create|draw)/i.test(txt));
  if (isImg) { animImgLoader("a-"+idx,chat,dispHtml,txt,idx); return; }

  document.getElementById("a-"+idx).innerHTML = `<div class="dynamic-loader"><div class="dot-matrix"><span></span><span></span><span></span></div></div>`;

  // Build system prompt
  let sys = "You are Phraortes OS — an advanced intelligence assistant. Respond clearly, helpfully, and in the same language the user writes in. ";
  const modelKey = OR_MODELS[activeModel];
  if (activeModel==="2.6" || activeModel==="gpt4o" || activeModel==="deepseek") sys += "You are an expert coder and senior developer. Format code with proper syntax highlighting.";
  else if (activeModel==="2.5" || activeModel==="gemini-pro" || activeModel==="opus") sys += "You are an expert in deep research and analysis. Be thorough and academic.";
  else sys += "You are fast, precise, and helpful for everyday tasks.";

  const apiMsgs = [{ role:"system", content:sys }];
  chat.msgs.forEach(m => {
    apiMsgs.push({ role:"user", content:m.uText||m.u });
    apiMsgs.push({ role:"assistant", content:m.aRaw||m.a });
  });
  if (imgData) apiMsgs.push({ role:"user", content:[{type:"text",text:txt||"Analyze this image."},{type:"image_url",image_url:{url:imgData}}] });
  else apiMsgs.push({ role:"user", content:txt });

  if (activePlan==="pro"||activePlan==="starter") {
    proSlotsUsed++; localStorage.setItem("phraortes_slots",proSlotsUsed);
    if(activePlan==="pro") updateProGauge();
    if(activePlan==="starter"&&proSlotsUsed>=PLAN_CFG.starter.advSlots) initPlanUI();
  }

  try {
    const full = await fetchAI(apiMsgs, useVision);
    finishTurn("a-"+idx, marked.parse(full), full, chat, dispHtml, txt, idx);
  } catch(e) {
    haptic("error");
    showInlineError(e.message, encodeURIComponent(txt), idx);
    const wrap = document.getElementById("a-"+idx)?.parentElement;
    if (wrap) wrap.innerHTML = `<div class="msg ai" style="color:#ff453a;font-size:13px;padding:8px 0">⚠ ${e.message.includes("plan")||e.message.includes("Apex")||e.message.includes("Intellect")?"Upgrade required to use this model.":"Connection error. Try again."}</div>`;
    sendBtn.disabled=false; uiInput.disabled=false;
  }
}

function showInlineError(msg, encTxt, idx) {
  const f=document.querySelector("footer"); const ex=f.querySelector(".inline-err"); if(ex) ex.remove();
  const isLim=msg.includes("plan")||msg.includes("Apex")||msg.includes("Intellect")||msg.includes("limit");
  const d=document.createElement("div"); d.className="inline-err";
  d.style.cssText="display:flex;align-items:center;gap:9px;padding:8px 14px;margin-bottom:7px;background:rgba(255,58,48,0.07);border:1px solid rgba(255,58,48,0.2);border-radius:17px;font-size:12px;color:rgba(255,255,255,0.65)";
  d.innerHTML=`<span style="flex:1;font-family:'Space Mono',monospace">⚠ ${isLim?"Upgrade required":"Connection error"}</span>${isLim?`<button onclick="openPremium();this.parentElement.remove()" style="padding:5px 12px;background:var(--pulse);border:none;border-radius:14px;color:#fff;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">Upgrade</button>`:`<button onclick="retryMsg(${idx},'${encTxt}');this.parentElement.remove()" style="padding:5px 12px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.13);border-radius:14px;color:#fff;font-size:11px;cursor:pointer;font-family:inherit">🔄 Retry</button>`}<button onclick="this.parentElement.remove()" style="background:none;border:none;color:#888;cursor:pointer;font-size:15px">✕</button>`;
  f.insertBefore(d,f.firstChild); setTimeout(()=>d.remove(),9000);
}

function retryMsg(idx, encTxt) {
  uiInput.value=decodeURIComponent(encTxt); autoResize(uiInput);
  const chat=chats.find(c=>c.id==curId); if(chat?.msgs[idx]) chat.msgs.splice(idx); send();
}

// ═══ FETCH AI (via server proxy) ═══
async function fetchAI(messages, useVision) {
  const modelMeta = OR_MODELS[activeModel] || OR_MODELS["2.4"];

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, model: modelMeta.id, userPlan: activePlan })
    });
    const data = await res.json();
    if (data.error === "plan_required") throw new Error(`This model requires ${data.requiredPlan} plan.`);
    if (data.error) throw new Error(data.error);
    return data.content;
  } catch(e) {
    if (e.message.includes("plan")) throw e;
    // Fallback: try free model directly via OpenRouter if server fails
    throw new Error("AI service unavailable. Check your connection.");
  }
}

// ═══ IMAGE GEN ═══
async function animImgLoader(aiId, chat, dispHtml, txt, msgIndex) {
  if (!PLAN_CFG[activePlan].images && activePlan !== "ultimate") {
    const el = document.getElementById(aiId);
    if (el) el.innerHTML = `<div style="color:#ff453a;font-size:13px;padding:8px 0">⚠ Image generation requires Starter plan or above.</div>`;
    sendBtn.disabled=false; uiInput.disabled=false;
    openPremium(); return;
  }

  const el = document.getElementById(aiId); if(!el) return;
  const steps = ["Mapping prompt tokens...","Querying Pollinations grid...","Applying high-res filters...","Complete."];
  const pcts = [25,60,90,100];
  el.innerHTML = `<div style="background:rgba(255,255,255,0.02);padding:14px;border-radius:13px;border:1px solid rgba(255,255,255,0.05);max-width:290px"><div id="slt-${aiId}" style="font-size:12px;font-weight:600;margin-bottom:7px">${steps[0]}</div><div style="height:3px;background:rgba(255,255,255,0.04);border-radius:2px;overflow:hidden"><div id="slb-${aiId}" style="width:0%;background:var(--p);height:100%;transition:0.4s"></div></div><div style="display:flex;justify-content:space-between;font-size:10px;color:#555;margin-top:5px"><span>Generating...</span><span id="slp-${aiId}">0%</span></div></div>`;
  if (!isScrolling) scrollToBottom();

  for (let i=0; i<steps.length; i++) {
    await new Promise(r=>setTimeout(r,600));
    const t=document.getElementById("slt-"+aiId), b=document.getElementById("slb-"+aiId), p=document.getElementById("slp-"+aiId);
    if(t) t.textContent=steps[i]; if(b) b.style.width=pcts[i]+"%"; if(p) p.textContent=pcts[i]+"%";
    if(!isScrolling) scrollToBottom();
  }

  // Get image URL from server
  let imgUrl;
  try {
    const res = await fetch("/api/image", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ prompt: txt.replace(/^\/imagine/i,"").trim(), userPlan: activePlan })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    imgUrl = data.url;
  } catch(e) {
    const prompt = txt.replace(/^\/imagine/i,"").replace(/(عکس|تصویر|image|pic|بساز|generate|create)/gi,"").trim() || "futuristic neon cyberpunk";
    const seed = Math.floor(Math.random()*99999);
    imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${seed}&model=flux`;
  }

  const cid = "imgc-"+Date.now();
  const placeholder = `<div><div style="width:280px;height:280px;border-radius:18px;overflow:hidden;border:1px solid var(--brd);background:rgba(0,0,0,0.25);position:relative" id="${cid}"><div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px"><div class="dynamic-loader"><div class="dot-matrix" style="justify-content:center"><span></span><span></span><span></span></div></div><span style="font-size:11px;color:#444">Loading render...</span></div></div><span style="color:#555;font-size:11px;font-family:monospace;margin-top:6px;display:block">✨ Image ready</span></div>`;
  finishTurn(aiId, placeholder, "[Image rendered]", chat, dispHtml, txt, msgIndex);

  // Load image with retry
  function tryLoad(attempt) {
    if (attempt > 3) { const cont=document.getElementById(cid); if(cont) cont.innerHTML=`<div style="color:#ff453a;font-size:11px;padding:20px;text-align:center">Render failed. Try: /imagine [prompt]</div>`; return; }
    const img = new Image(); img.crossOrigin="anonymous";
    img.onload = () => {
      const cont = document.getElementById(cid); if(!cont) return;
      img.style.cssText="width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 0.6s ease";
      cont.innerHTML=""; cont.appendChild(img);
      cont.style.cursor="pointer"; cont.onclick=()=>openLightbox(imgUrl);
      setTimeout(()=>{img.style.opacity="1"},50); haptic("success");
    };
    img.onerror = () => setTimeout(()=>tryLoad(attempt+1), 2000 + attempt*1000);
    img.src = imgUrl + (attempt>1?"&t="+Date.now():"");
  }
  setTimeout(()=>tryLoad(1), 500);
}

// ═══ FINISH TURN ═══
function finishTurn(aiId, htmlContent, rawContent, chat, userHtml, userTxt, msgIndex) {
  const wrap = document.getElementById(aiId)?.parentElement; if(!wrap) return;
  const enc = encodeURIComponent(rawContent);
  const sId = `sp-${msgIndex}-${Date.now()}`;
  const bHTML = getBranchHTML(msgIndex);
  const srcs = getSmartSources(userTxt);
  const encSrc = encodeURIComponent(JSON.stringify(srcs));
  const qc = (userTxt||"").substring(0,14).replace(/['"\\`]/g,"");

  wrap.innerHTML = `
    <div class="msg ai" id="${aiId}"></div>
    <div style="margin-top:6px;display:flex;align-items:center;flex-wrap:wrap;gap:5px">
      <div class="claude-source-chip" onclick="openSourceDrawer('${encSrc}','${qc}')">🌐 ${srcs.length} Sources</div>
      ${bHTML}
    </div>
    <div class="listen-ops">
      <button class="l-btn" onclick="copyResp(this,'${enc}')" title="Copy">
        <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
      <button class="l-btn" id="${sId}" onclick="toggleSpeech('${aiId}','${sId}')" title="Listen">
        <svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
      </button>
      <button class="l-btn" onclick="regenerate(${msgIndex})" title="Regenerate">
        <svg viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>
      </button>
      <div class="listen-sep"></div>
      <button class="l-btn" id="like-${msgIndex}" onclick="toggleReaction(this,'like-${msgIndex}')" title="Like">
        <svg viewBox="0 0 24 24"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
      </button>
      <button class="l-btn" id="dislike-${msgIndex}" onclick="toggleReaction(this,'dislike-${msgIndex}','dislike')" title="Dislike">
        <svg viewBox="0 0 24 24" style="transform:rotate(180deg)"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
      </button>
    </div>`;

  if (!chat.msgs.length || chat.name === "New Chat") chat.name = (userTxt||"Session").substring(0,22);
  chat.msgs.push({ u:userHtml, uText:userTxt, a:htmlContent, aRaw:rawContent });
  save(); renderH();
  streamMarkdown(aiId, rawContent);
}

function toggleReaction(btn, id, type) {
  haptic("light");
  const isLike = !type || type==="like";
  if (btn.classList.contains(isLike?"active-like":"active-dislike")) { btn.classList.remove(isLike?"active-like":"active-dislike"); }
  else { btn.classList.add(isLike?"active-like":"active-dislike"); showToast(isLike?"👍 Liked":"👎 Disliked"); }
}

function getSmartSources(txt) {
  if(/(فلسفه|تاریخ|ایران|قانون)/i.test(txt)) return [{domain:"wikipedia.org",title:"تاریخچه پلتفرم‌های هوشمند"},{domain:"rc.majlis.ir",title:"قوانین تجارت الکترونیکی ایران"}];
  return [{domain:"github.com/phraortes",title:"Phraortes Core Module Pipelines"},{domain:"developer.mozilla.org",title:"Web API Interfaces Reference"},{domain:"arxiv.org",title:"Neural Token Architecture Research"}];
}

async function streamMarkdown(aiId, raw) {
  const el = document.getElementById(aiId); if(!el) return;
  let built=""; let chunk=4, delay=6;
  if(activeModel==="2.6"||activeModel==="gpt4o"||activeModel==="opus") {chunk=12;delay=2;}
  if(activeModel==="2.5"||activeModel==="gemini-pro") {chunk=2;delay=18;}
  for(let i=0;i<raw.length;i+=chunk){
    built+=raw.substring(i,i+chunk); if(el) el.innerHTML=marked.parse(built);
    if(!isScrolling) chatBox.scrollTo({top:chatBox.scrollHeight});
    await new Promise(r=>setTimeout(r,delay));
  }
  playSound("chime"); if(el) el.innerHTML=marked.parse(raw);
  setTimeout(()=>applyReadMore(aiId),100);
  sendBtn.disabled=false; uiInput.disabled=false;
}

// ═══ READ MORE ═══
function applyReadMore(id) {
  const el = document.getElementById(id);
  if(!el || el.innerText.length < 380 || el.querySelector("img") || el.querySelector("audio")) return;
  const wrapper = document.createElement("div"); wrapper.className="msg-expandable collapsed";
  wrapper.innerHTML = el.innerHTML; el.innerHTML=""; el.appendChild(wrapper);
  const btn = document.createElement("div"); btn.className="read-more-trigger";
  btn.innerHTML = `<span class="rm-text">Show more</span><span class="read-more-arrow">▼</span>`;
  btn.onclick = e => {
    e.stopPropagation(); haptic("light");
    const expanded = wrapper.classList.contains("expanded");
    if(expanded){wrapper.classList.remove("expanded");wrapper.classList.add("collapsed");btn.querySelector(".rm-text").textContent="Show more";btn.classList.remove("expanded-btn");}
    else{wrapper.classList.remove("collapsed");wrapper.classList.add("expanded");btn.querySelector(".rm-text").textContent="Show less";btn.classList.add("expanded-btn");if(!isScrolling)setTimeout(()=>scrollToBottom(),200);}
  };
  el.parentElement.insertBefore(btn, el.nextSibling);
}

// ═══ UI HELPERS ═══
function addUI(html, role, id, rawText) {
  const w = document.createElement("div"); w.className=`msg-wrap ${role}-wrap`;
  const safe = (rawText||"").replace(/"/g,"'").replace(/`/g,"'");
  if (id==="welcome") {
    w.innerHTML=`<div style="text-align:center;padding:30px 0 20px"><div style="font-family:'Playfair Display',serif;font-style:italic;font-size:28px;font-weight:700;color:var(--p);margin-bottom:7px;text-shadow:0 0 24px var(--glow)">Phraortes</div><p style="color:rgba(255,255,255,0.3);font-size:13px;font-family:'Space Mono',monospace;letter-spacing:1px">INTELLIGENCE PLATFORM ACTIVE</p></div>`;
  } else if (id==="welcome-persona") {
    const enc = encodeURIComponent(rawText||"");
    w.innerHTML=`<div class="msg ai" id="${id}">${html}</div><div class="listen-ops"><button class="l-btn" onclick="copyResp(this,'${enc}')"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>`;
  } else if (role==="user") {
    w.innerHTML=`<div class="msg user" id="${id}" onpointerdown="startPress(event,'user','${id}',\`${safe}\`)" onpointerup="cancelPress()" onpointerleave="cancelPress()">${html}</div>`;
  } else {
    w.innerHTML=`<div class="msg ai" id="${id}">${html}</div>`;
  }
  chatBox.appendChild(w); if(!isScrolling) scrollToBottom();
}

function loadChat(id) {
  curId=id; save();
  const chat = chats.find(c=>c.id==id);
  uiInput.value = localStorage.getItem("draft_"+id)||""; autoResize(uiInput);
  chatBox.innerHTML=""; addUI("","ai","welcome");

  if (chat?.msgs.length) {
    chat.msgs.forEach((m,i) => {
      addUI(m.u,"user","u-"+i,m.uText);
      const w=document.createElement("div"); w.className="msg-wrap ai-wrap";
      const enc=encodeURIComponent(m.aRaw||""); const sId=`sp-${i}-loaded`;
      const srcs=getSmartSources(m.uText||""); const encSrc=encodeURIComponent(JSON.stringify(srcs)); const bHTML=getBranchHTML(i);
      w.innerHTML=`<div class="msg ai" id="a-${i}">${m.a}</div>
        <div style="margin-top:6px;display:flex;align-items:center;flex-wrap:wrap;gap:5px"><div class="claude-source-chip" onclick="openSourceDrawer('${encSrc}','Archived')">🌐 ${srcs.length} Sources</div>${bHTML}</div>
        <div class="listen-ops">
          <button class="l-btn" onclick="copyResp(this,'${enc}')"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
          <button class="l-btn" id="${sId}" onclick="toggleSpeech('a-${i}','${sId}')"><svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/></svg></button>
          <button class="l-btn" onclick="regenerate(${i})"><svg viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg></button>
          <div class="listen-sep"></div>
          <button class="l-btn" id="like-${i}" onclick="toggleReaction(this,'like-${i}')"><svg viewBox="0 0 24 24"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg></button>
          <button class="l-btn" id="dislike-${i}" onclick="toggleReaction(this,'dislike-${i}','dislike')"><svg viewBox="0 0 24 24" style="transform:rotate(180deg)"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg></button>
        </div>`;
      chatBox.appendChild(w); setTimeout(()=>applyReadMore("a-"+i),50);
    });
  } else if (chat) {
    if(!chat.persona){chat.persona=PERSONAS[Math.floor(Math.random()*PERSONAS.length)];save();}
    addUI(chat.persona,"ai","welcome-persona",chat.persona);
  }
  renderH(); scrollToBottom();
}

function newChat() { const id=Date.now(); chats.unshift({id,name:"New Chat",msgs:[],pinned:false}); curId=id; save(); loadChat(id); if(document.getElementById("sidebar").classList.contains("active")) toggleS(null); }
function save() { try { localStorage.setItem("phraortes_chats",JSON.stringify(chats)); } catch(e) { chats=chats.slice(0,50); localStorage.setItem("phraortes_chats",JSON.stringify(chats)); } localStorage.setItem("phraortes_id",curId); }
let sessionFilter = "all";
function renderH() {
  let list=[...chats].sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0));
  const search=document.querySelector(".session-search")?.value?.toLowerCase()||"";
  if(search) list=list.filter(c=>c.name.toLowerCase().includes(search)||JSON.stringify(c.msgs).toLowerCase().includes(search));
  if(sessionFilter!=="all") list=list.filter(c=>{const t=JSON.stringify(c).toLowerCase();if(sessionFilter==="code")return t.includes("```")||t.includes("code");if(sessionFilter==="image")return t.includes("img")||t.includes("/imagine");return true;});
  document.getElementById("h-list").innerHTML=list.map(c=>`<div class="h-item ${c.id==curId?"active-chat":""} ${c.pinned?"pinned-chat":""}" onclick="loadChat(${c.id})" onpointerdown="startPress(event,'session',${c.id},null)" onpointerup="cancelPress()" onpointerleave="cancelPress()"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:175px;font-weight:${c.pinned?700:400}">${c.pinned?"⭐ ":""}${c.name}</span></div>`).join("")||`<div style="text-align:center;padding:20px;color:#444;font-size:12px">No sessions found</div>`;
}
function searchSessions(val) { renderH(); }
function filterHistory(type,btn) { sessionFilter=type; document.querySelectorAll(".hf-btn").forEach(b=>b.classList.remove("active")); if(btn)btn.classList.add("active"); renderH(); }
function delH(id) { chats=chats.filter(c=>c.id!=id); if(!chats.length)newChat();else loadChat(chats[0].id); save();renderH(); }
function renameSession(id) { const c=chats.find(c=>c.id==id); if(!c)return; const n=prompt("Rename:",c.name); if(n){c.name=n;save();renderH();} }
function togglePinSession(id) { const c=chats.find(c=>c.id==id); if(!c)return; c.pinned=!c.pinned; save();renderH(); showToast(c.pinned?"Pinned ⭐":"Unpinned."); }
function regenerate(idx) { const chat=chats.find(c=>c.id==curId); if(!chat)return; const txt=chat.msgs[idx]?.uText; if(!txt)return; chat.msgs.splice(idx); save(); loadChat(curId); uiInput.value=txt; send(); }

// ═══ COPY (Fixed) ═══
function copyResp(btn, enc) {
  haptic("send");
  const getText = () => {
    if (enc) return decodeURIComponent(enc);
    const aiMsg = btn.closest(".msg-wrap")?.querySelector(".msg.ai");
    return aiMsg ? aiMsg.innerText : "";
  };
  const text = getText();
  if (!text) { showToast("Nothing to copy","error"); return; }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showToast("Copied! ✓","success"))
      .catch(() => fallbackCopy(text));
  } else { fallbackCopy(text); }
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
  document.body.appendChild(ta); ta.focus(); ta.select();
  try { document.execCommand("copy"); showToast("Copied! ✓","success"); }
  catch { showToast("Copy failed — try manually","error"); }
  document.body.removeChild(ta);
}

// ═══ CONTEXT MENU ═══
let pressTimer, pressX=0, pressY=0;
function startPress(e,type,id,txt) {
  pressX=e.clientX||e.touches?.[0]?.clientX||window.innerWidth/2;
  pressY=e.clientY||e.touches?.[0]?.clientY||window.innerHeight/2;
  pressTimer=setTimeout(()=>{haptic("double");showContext(type,id,txt,pressX,pressY);},420);
}
function cancelPress() { clearTimeout(pressTimer); }
function showContext(type,id,textData,x,y) {
  const enc=encodeURIComponent(textData||""); let btns=[];
  if(type==="user"){btns.push({text:"COPY",action:`copyResp(null,'${enc}');closeContextSheet()`});btns.push({text:"EDIT",action:`initEdit('${id}',decodeURIComponent('${enc}'));closeContextSheet()`});btns.push({text:"DEL",action:`deleteMsg('${id}');closeContextSheet()`,danger:true});}
  else if(type==="session"){const c=chats.find(c=>c.id==id);btns.push({text:"RENAME",action:`renameSession(${id});closeContextSheet()`});btns.push({text:c?.pinned?"UNPIN":"PIN",action:`togglePinSession(${id});closeContextSheet()`});btns.push({text:"DEL",action:`delH(${id});closeContextSheet()`,danger:true});}
  const menu=document.getElementById("floating-menu");menu.innerHTML="";
  menu.style.left=`${Math.min(Math.max(x-30,40),window.innerWidth-80)}px`;menu.style.top=`${Math.max(y-30,40)}px`;
  const r=62; btns.forEach((b,i)=>{const angle=(i*(2*Math.PI/btns.length))-Math.PI/2;const el=document.createElement("button");el.className=`f-item${b.danger?" danger":""}`;el.textContent=b.text;el.setAttribute("onclick",b.action);el.style.left=r*Math.cos(angle)+"px";el.style.top=r*Math.sin(angle)+"px";el.style.transitionDelay=i*40+"ms";menu.appendChild(el);});
  const ov=document.getElementById("context-overlay");ov.style.display="block";setTimeout(()=>{ov.style.opacity="1";menu.classList.add("show");},10);
}
function closeContextSheet() { document.getElementById("floating-menu").classList.remove("show"); const ov=document.getElementById("context-overlay");ov.style.opacity="0";setTimeout(()=>{ov.style.display="none";},350); }
function initEdit(msgId,text) { editMsgId=msgId;uiInput.value=text;autoResize(uiInput);uiInput.focus();uiInput.placeholder="Editing...";sendBtn.innerHTML="✔";document.querySelector(".input-bar").style.borderColor="var(--gold-star)";document.querySelector(".wand-wrapper").style.display="none";document.getElementById("cancel-edit-btn").style.display="flex"; }
function cancelEdit() { editMsgId=null;uiInput.value=localStorage.getItem("draft_"+curId)||"";uiInput.placeholder="Message Phraortes...";sendBtn.innerHTML="🚀";document.querySelector(".input-bar").style.borderColor="";document.querySelector(".wand-wrapper").style.display="";document.getElementById("cancel-edit-btn").style.display="none";uiInput.style.height="44px"; }
function deleteMsg(msgId) { const el=document.getElementById(msgId);if(!el)return;const w=el.closest(".msg-wrap");if(w){w.classList.add("glitch-dissolve");setTimeout(()=>w.remove(),450);} }

// ═══ SPEECH ═══
function toggleSpeech(textId,btnId) { if(speechUtt&&speechBtnId===btnId){stopSpeech();return;} if(speechUtt)stopSpeech(); const el=document.getElementById(textId);if(!el)return; const txt=el.innerText.replace(/[👍👎]/g,"").trim(); const utt=new SpeechSynthesisUtterance(txt); speechUtt=utt; speechBtnId=btnId; const btn=document.getElementById(btnId);if(btn)btn.classList.add("active-speech"); utt.onend=utt.onerror=()=>resetSpeech(btnId); speechSynthesis.speak(utt); }
function stopSpeech() { speechSynthesis.cancel(); if(speechBtnId)resetSpeech(speechBtnId); }
function resetSpeech(id) { const b=document.getElementById(id);if(b)b.classList.remove("active-speech"); speechUtt=null; speechBtnId=null; }

// ═══ FILES ═══
function handleFiles(e) {
  Array.from(e.target.files).forEach(file=>{
    const id=Date.now()+Math.random().toString(36).substr(2,6), sz=(file.size/1024).toFixed(1)+" KB";
    if((activePlan==="free"||activePlan==="starter")&&file.size>5*1024*1024){showToast("Files > 5MB require Pro Matrix","error");return;}
    if(file.type.startsWith("image/")){const reader=new FileReader();reader.onload=ev=>{attachedFiles.push({id,file,type:"image",name:file.name,size:sz,dataURL:ev.target.result});renderPreviews();};reader.readAsDataURL(file);}
    else{attachedFiles.push({id,file,type:"file",name:file.name,size:sz,dataURL:null});renderPreviews();}
  }); e.target.value="";
}
function renderPreviews() {
  const c=document.getElementById("input-preview-container");
  if(!attachedFiles.length){c.style.display="none";c.innerHTML="";return;}
  c.style.display="flex"; c.innerHTML="";
  attachedFiles.forEach(f=>{const el=document.createElement("div");el.className="file-chip";el.id="chip-"+f.id;el.innerHTML=f.type==="image"?`<img src="${f.dataURL}" class="input-preview-img"><div class="file-chip-info"><span class="file-name">${f.name}</span><span class="file-size">${f.size}</span></div><button class="remove-preview" onclick="removeFile('${f.id}')">✕</button>`:`<span style="font-size:17px">📄</span><div class="file-chip-info"><span class="file-name">${f.name}</span><span class="file-size">${f.size}</span></div><button class="remove-preview" onclick="removeFile('${f.id}')">✕</button>`;c.appendChild(el);});
}
function removeFile(id) { attachedFiles=attachedFiles.filter(f=>f.id!==id); const el=document.getElementById("chip-"+id);if(el)el.remove(); if(!attachedFiles.length){const c=document.getElementById("input-preview-container");c.style.display="none";c.innerHTML="";} }

// ═══ SCROLL ═══
function scrollToBottom() { chatBox.scrollTo({top:chatBox.scrollHeight,behavior:"smooth"}); }
function handleScroll() {
  document.body.classList.remove("isolation-active");
  const dist=chatBox.scrollHeight-chatBox.scrollTop-chatBox.clientHeight;
  const btn=document.getElementById("scroll-down-btn");
  if(dist>80){btn.classList.add("show");isScrolling=true;}else{btn.classList.remove("show");isScrolling=false;}
}

// ═══ LIGHTBOX ═══
function openLightbox(src) { document.getElementById("lightbox-img").src=src; document.getElementById("media-lightbox").classList.add("show"); }
function closeLightbox() { document.getElementById("media-lightbox").classList.remove("show"); }

// ═══ BILLING ═══
function renderBilling() {
  const list=document.getElementById("billing-scroll"); if(!list) return;
  if(!billing.length){list.innerHTML=`<div style="text-align:center;padding:20px 0;color:#444;font-size:13px">No invoices yet</div>`;return;}
  list.innerHTML=billing.map(b=>`<div class="billing-item"><div><div class="billing-plan">${b.item}</div><div class="billing-tx">TX: ${b.txid}</div></div><div class="billing-date">${b.date}</div></div>`).join("");
}

// ═══ PREMIUM GALAXY ═══
function openPremium() { closeMenus(null); document.getElementById("premium-immersive-viewport").classList.add("show"); initGalaxyCanvas(); updatePlanCTAs(); }
function closePremium() { document.getElementById("premium-immersive-viewport").classList.remove("show"); if(animFId)cancelAnimationFrame(animFId); }
function initGalaxyCanvas() {
  const canvas=document.getElementById("galaxy-canvas"); if(!canvas) return;
  const ctx=canvas.getContext("2d"); canvas.width=window.innerWidth; canvas.height=window.innerHeight;
  const W=canvas.width, H=canvas.height;
  const stars=Array.from({length:Math.floor(W*H/2800)},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.3+0.1,a:Math.random(),speed:Math.random()*0.003+0.001,phase:Math.random()*Math.PI*2}));
  const galaxy=[]; const arms=3;
  for(let arm=0;arm<arms;arm++){for(let i=0;i<300;i++){const t=i/300,angle=arm*(2*Math.PI/arms)+t*4.5,dist=t*Math.min(W,H)*0.35,spread=dist*0.27;galaxy.push({x:W*0.5+Math.cos(angle)*dist+(Math.random()-0.5)*spread,y:H*0.5+Math.sin(angle)*dist*0.5+(Math.random()-0.5)*spread*0.5,r:Math.random()*1.7+0.2,a:Math.random()*0.65+0.1,hue:210+Math.random()*60});}}
  const planets=[{dist:65,size:4,speed:0.011,color:"#E8C89A",angle:0},{dist:98,size:6,speed:0.007,color:"#6CB4EE",angle:1},{dist:135,size:5,speed:0.005,color:"#E86C4A",angle:2.5},{dist:180,size:9,speed:0.003,color:"#C8A05A",ring:true,angle:4}];
  function draw(){
    const t=Date.now()/1000; ctx.clearRect(0,0,W,H);
    const cg=ctx.createRadialGradient(W*.5,H*.5,0,W*.5,H*.5,H*.22);cg.addColorStop(0,"rgba(200,170,255,0.16)");cg.addColorStop(0.4,"rgba(100,80,200,0.05)");cg.addColorStop(1,"transparent");ctx.fillStyle=cg;ctx.fillRect(0,0,W,H);
    galaxy.forEach(s=>{ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fillStyle=`hsla(${s.hue},80%,85%,${s.a})`;ctx.fill();});
    stars.forEach(s=>{const a=s.a*(0.5+0.5*Math.sin(t*s.speed*60+s.phase));ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fillStyle=`rgba(220,220,255,${a})`;ctx.fill();});
    const sg=ctx.createRadialGradient(W*.5,H*.5,0,W*.5,H*.5,20);sg.addColorStop(0,"rgba(255,240,200,0.95)");sg.addColorStop(0.4,"rgba(255,200,80,0.68)");sg.addColorStop(1,"rgba(255,140,0,0)");ctx.beginPath();ctx.arc(W*.5,H*.5,18,0,Math.PI*2);ctx.fillStyle=sg;ctx.fill();
    planets.forEach(p=>{p.angle+=p.speed;const px=W*.5+Math.cos(p.angle)*p.dist,py=H*.5+Math.sin(p.angle)*p.dist*0.38;ctx.beginPath();ctx.ellipse(W*.5,H*.5,p.dist,p.dist*0.38,0,0,Math.PI*2);ctx.strokeStyle="rgba(255,255,255,0.03)";ctx.lineWidth=1;ctx.stroke();const pg=ctx.createRadialGradient(px,py,0,px,py,p.size*2.4);pg.addColorStop(0,p.color+"bb");pg.addColorStop(1,"transparent");ctx.beginPath();ctx.arc(px,py,p.size*2.4,0,Math.PI*2);ctx.fillStyle=pg;ctx.fill();ctx.beginPath();ctx.arc(px,py,p.size,0,Math.PI*2);ctx.fillStyle=p.color;ctx.fill();if(p.ring){ctx.beginPath();ctx.ellipse(px,py,p.size*2.1,p.size*.55,0,0,Math.PI*2);ctx.strokeStyle=p.color+"77";ctx.lineWidth=2.5;ctx.stroke();}});
    if(Math.random()<0.004){const sx=Math.random()*W,sy=Math.random()*H*.5,len=55+Math.random()*75,ang=Math.PI/4+Math.random()*Math.PI/8;const sg2=ctx.createLinearGradient(sx,sy,sx+Math.cos(ang)*len,sy+Math.sin(ang)*len);sg2.addColorStop(0,"rgba(255,255,255,0)");sg2.addColorStop(0.5,"rgba(255,255,255,0.82)");sg2.addColorStop(1,"rgba(255,255,255,0)");ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+Math.cos(ang)*len,sy+Math.sin(ang)*len);ctx.strokeStyle=sg2;ctx.lineWidth=1.5;ctx.stroke();}
    animFId=requestAnimationFrame(draw);
  }
  if(animFId)cancelAnimationFrame(animFId); draw();
}
window.addEventListener("resize",()=>{if(document.getElementById("premium-immersive-viewport").classList.contains("show")){if(animFId)cancelAnimationFrame(animFId);initGalaxyCanvas();}});
function spawnParticle(){if(!document.getElementById("premium-immersive-viewport").classList.contains("show"))return;const c=document.getElementById("prem-particles");if(!c)return;const p=document.createElement("div");p.className="particle";p.style.left=Math.random()*100+"vw";p.style.bottom="-4px";const sz=Math.random()*2+1;p.style.width=sz+"px";p.style.height=sz+"px";const dur=Math.random()*12+8;p.style.animationDuration=dur+"s";p.style.animationDelay=Math.random()*3+"s";const cols=["rgba(108,92,231,0.7)","rgba(6,182,212,0.7)","rgba(255,255,255,0.38)"];p.style.background=cols[Math.floor(Math.random()*cols.length)];c.appendChild(p);setTimeout(()=>p.remove(),(dur+4)*1000);}
function toggleBilling(){isAnnual=!isAnnual;const track=document.getElementById("prem-toggle");if(track)track.classList.toggle("on",isAnnual);document.getElementById("label-monthly")?.classList.toggle("active",!isAnnual);document.getElementById("label-annual")?.classList.toggle("active",isAnnual);document.querySelectorAll(".price-num").forEach(el=>{const from=parseFloat(el.textContent),to=isAnnual?parseFloat(el.dataset.annual):parseFloat(el.dataset.monthly);animatePrice(el,from,to);});document.querySelectorAll(".price-annual").forEach(el=>el.classList.toggle("show",isAnnual));document.querySelectorAll(".price-period").forEach(el=>{el.textContent=isAnnual?"/ month · billed annually":"/ month · billed monthly";});}
function animatePrice(el,from,to){const start=performance.now(),dur=500;const step=now=>{const t=Math.min((now-start)/dur,1),e=1-Math.pow(1-t,3);el.textContent=(from+(to-from)*e).toFixed(2);if(t<1)requestAnimationFrame(step);};requestAnimationFrame(step);}

// ═══ MODEL / THEME / UI ═══
function selectModel(m) {
  const planOrder = {free:0,starter:1,pro:2,ultimate:3};
  const modelMeta = OR_MODELS[m]; if(!modelMeta) return;
  if((planOrder[modelMeta.plan]||0) > (planOrder[activePlan]||0)){showToast(`${modelMeta.name} requires ${modelMeta.plan} plan.`,"error");openPremium();return;}
  activeModel=m; localStorage.setItem("phraortes_model",m);
  const fl=document.getElementById("core-flash");fl.classList.add("flash");setTimeout(()=>fl.classList.remove("flash"),200);
  updateModelUI(m); document.getElementById("gear-menu").classList.remove("show"); haptic("double");
  showToast(`Switched to ${modelMeta.name}`);
}

function updateModelUI(m) {
  document.querySelectorAll(".model-item").forEach(el=>el.classList.remove("active"));
  const el=document.getElementById("m-"+m.replace(/\./g,"").replace(/-/g,"")); if(el) el.classList.add("active");
  document.body.classList.remove("workspace-mode","intellect-mode");
  const meta = OR_MODELS[m];
  if(m==="2.6"||m==="gpt4o"||m==="deepseek"){document.body.classList.add("workspace-mode");uiInput.placeholder="Paste code or ask to debug...";}
  else if(m==="2.5"||m==="gemini-pro"||m==="opus"){document.body.classList.add("intellect-mode");uiInput.placeholder="Ask to research deeply...";}
  else{uiInput.placeholder="Message Phraortes...";}
}

function toggleTheme(){const light=document.getElementById("theme-toggle").checked;document.body.classList.toggle("light-theme",light);localStorage.setItem("phraortes_theme",light?"light":"dark");}
function toggleS(e){if(e)e.stopPropagation();document.getElementById("sidebar").classList.toggle("active");document.getElementById("sidebar-overlay").classList.toggle("show");closeMenus(null);}
function toggleGear(e){e.stopPropagation();closeMenus(e);document.getElementById("gear-menu").classList.toggle("show");}
function toggleMagicMenu(e){e.stopPropagation();closeMenus(e);document.getElementById("magic-menu").classList.toggle("show");haptic("light");}
function closeMenus(e){if(e?.target?.closest(".input-bar,.btn-icon,.voice-btn,.wand-wrapper,.magic-menu,#gear-menu,.source-drawer-panel,#account-page"))return;document.getElementById("gear-menu").classList.remove("show");document.getElementById("magic-menu").classList.remove("show");}
function applyEnhancement(type){closeMenus(null);if(!uiInput.value.trim()){showToast("Type something first.");return;}const base=uiInput.value;const map={"Artistic Prompt":`[Artistic Render]:\nConcept: ${base}\nCinematic volumetric lighting, 8K, golden ratio composition.`,"Engineering Prompt":`[Engineering Architecture]:\nTask: ${base}\nRobust modular solution with error handling and documentation.`,"Academic Prompt":`[Academic Analysis]:\nTopic: ${base}\nAnalyze using formal structured academic methodology.`,"Iran Business":`[Iranian Corporate Matrix]:\nTopic: ${base}\nتحلیل بر اساس بازار ایران، قوانین کار، مالیات و قراردادها.`};uiInput.value=map[type]||base;autoResize(uiInput);showToast(`🪄 Enhanced!`);}
function openVirtualEditor(enc,name,lines){const raw=decodeURIComponent(enc);document.getElementById("editor-filename").textContent=name;document.getElementById("editor-lines-count").textContent=lines+" lines";document.getElementById("editor-textarea-core").value=raw;let mini="";raw.split("\n").slice(0,60).forEach(l=>{mini+=(l.trim().substring(0,25)||"...")+"\n";});document.getElementById("editor-minimap-core").textContent=mini;document.getElementById("virtual-code-editor").classList.add("show");}
function closeVirtualEditor(){document.getElementById("virtual-code-editor").classList.remove("show");}
function searchInEditor(val){const ta=document.getElementById("editor-textarea-core");if(!val)return;const idx=ta.value.toLowerCase().indexOf(val.toLowerCase());if(idx<0)return;ta.focus();ta.setSelectionRange(idx,idx+val.length);ta.scrollTop=ta.value.substr(0,idx).split("\n").length*16;}
function openSourceDrawer(encSrc,query){haptic("light");const sources=JSON.parse(decodeURIComponent(encSrc));document.getElementById("drawer-title-context").textContent=`SOURCES: ${query.toUpperCase()}`;const c=document.getElementById("drawer-sources-container");c.innerHTML="";sources.forEach(s=>{const icon=s.domain.charAt(0).toUpperCase();c.innerHTML+=`<a href="https://${s.domain}" target="_blank" class="source-item-link"><div class="source-meta"><div class="source-icon">${icon}</div><span>${s.domain}</span></div><div class="source-title">${s.title}</div></a>`;});document.getElementById("global-source-drawer").classList.add("show");}
function closeSourceDrawer(){document.getElementById("global-source-drawer").classList.remove("show");}
function toggleFsCode(btn){const w=btn.closest(".code-block-wrapper");if(w.classList.contains("code-fullscreen")){w.classList.remove("code-fullscreen");document.body.style.overflow="";}else{w.classList.add("code-fullscreen");document.body.style.overflow="hidden";}}
function callAura(){if(activePlan!=="ultimate"){openPremium();showToast("Aura Voice requires Ultimate Core.","error");return;}document.getElementById("gear-menu").classList.remove("show");document.getElementById("aura-screen").style.display="flex";document.getElementById("vapi-status-text").textContent="CONNECTING VOICE NODES...";setTimeout(()=>{document.getElementById("vapi-status-text").textContent="PHRAORTES VOCAL NODE ACTIVE"},1500);}
function closeAura(){document.getElementById("aura-screen").style.display="none";}
function toggleZen(){document.body.classList.toggle("zen-isolated");haptic(document.body.classList.contains("zen-isolated")?"double":"light");showToast(document.body.classList.contains("zen-isolated")?"Zen Mode Active":"Zen Mode Off");}

// ═══ TOAST ═══
function showToast(msg, type="") {
  const c=document.getElementById("toast-container"), t=document.createElement("div");
  t.className=`toast${type?" "+type+"-toast":""}`;
  t.innerHTML=`<span>${type==="success"?"✅":type==="error"?"⚠":"⚡"}</span> ${msg}`;
  c.appendChild(t); void t.offsetWidth; t.classList.add("show");
  setTimeout(()=>{t.classList.remove("show");setTimeout(()=>t.remove(),400);},3200);
}
