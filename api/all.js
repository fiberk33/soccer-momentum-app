// api/all.js — MomentumTrack Engine v3.0
// Adaptive Polling + Event-Driven Architecture + Momentum Delta Tracking
//
// Upgrades:
//   1. Adaptive Polling  — critical windows get 15s priority, low activity 60s
//   2. Event Filtering   — only Goals, Red Cards, Dangerous Attacks pulled
//   3. Momentum Delta    — tracks rate-of-change, rising score > high score
//   4. Pre-Trigger Validator — filters noise before alerting frontend
//   5. Full Urgency Engine v2 (4 pillars)

const BASE_URL = "https://v3.football.api-sports.io";

const FEATURED_LEAGUE_IDS = [
  39, 140, 78, 135, 61, 2, 3, 848, 45, 143, 137, 66,
  40, 88, 94, 179, 203, 253, 262, 307, 235,
];

// ─── IN-MEMORY STATE (persists across calls within same serverless instance) ──
// Stores last urgency scores per fixture for delta calculation
const fixtureHistory = new Map();  // fixture_id → [{ score, ts }]
const lastPolled     = new Map();  // fixture_id → timestamp
const HISTORY_MAX    = 12;         // keep last 12 readings (~10 min at 50s avg)

// ─── RATE LIMIT MANAGER ──────────────────────────────────────────────────────
// Implements: Circuit Breaker + Exponential Backoff + Header Monitoring
// Based on standard 429 handling patterns

const rateLimitState = {
  remaining: 999,          // X-RateLimit-Remaining
  limit: 1000,             // X-RateLimit-Limit  
  resetAt: null,           // X-RateLimit-Reset (epoch)
  circuitOpen: false,      // true = stop all requests
  circuitOpenAt: null,     // when circuit tripped
  consecutiveFails: 0,     // for exponential backoff
  lastBackoffMs: 0,        // current backoff duration
  totalRequests: 0,        // session counter
  throttledRequests: 0,    // how many were slowed
};

const CIRCUIT_RESET_MS   = 60_000;  // reopen circuit after 60s
const RATE_LIMIT_WARN    = 0.10;    // warn when <10% remaining
const RATE_LIMIT_SLOW    = 0.20;    // slow down when <20% remaining
const MAX_BACKOFF_MS     = 32_000;  // max 32s backoff

function parseRateLimitHeaders(headers) {
  const remaining = parseInt(headers.get?.('x-ratelimit-remaining') || headers['x-ratelimit-remaining'] || '999');
  const limit     = parseInt(headers.get?.('x-ratelimit-limit')     || headers['x-ratelimit-limit']     || '1000');
  const resetAt   = parseInt(headers.get?.('x-ratelimit-reset')     || headers['x-ratelimit-reset']     || '0');
  const retryAfter = parseInt(headers.get?.('retry-after')          || headers['retry-after']           || '0');

  if (!isNaN(remaining)) rateLimitState.remaining = remaining;
  if (!isNaN(limit))     rateLimitState.limit     = limit;
  if (!isNaN(resetAt))   rateLimitState.resetAt   = resetAt * 1000; // to ms

  const pctLeft = rateLimitState.remaining / rateLimitState.limit;

  if (pctLeft < RATE_LIMIT_WARN) {
    console.warn(`[RateLimit] ⚠️ Only ${rateLimitState.remaining}/${rateLimitState.limit} requests left (${Math.round(pctLeft*100)}%)`);
  }

  return { remaining, limit, resetAt, retryAfter, pctLeft };
}

function isCircuitOpen() {
  if (!rateLimitState.circuitOpen) return false;
  // Auto-reset circuit after CIRCUIT_RESET_MS
  if (Date.now() - rateLimitState.circuitOpenAt > CIRCUIT_RESET_MS) {
    console.log('[RateLimit] ⚡ Circuit breaker reset — resuming requests');
    rateLimitState.circuitOpen = false;
    rateLimitState.consecutiveFails = 0;
    rateLimitState.lastBackoffMs = 0;
    return false;
  }
  return true;
}

function tripCircuit() {
  rateLimitState.circuitOpen = true;
  rateLimitState.circuitOpenAt = Date.now();
  console.error('[RateLimit] 🔴 Circuit breaker TRIPPED — pausing all API requests for 60s');
}

function calcBackoff() {
  // Exponential backoff with jitter
  // 1s → 2s → 4s → 8s → 16s → 32s max
  const base = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, rateLimitState.consecutiveFails));
  const jitter = Math.random() * 1000; // up to 1s random jitter
  return base + jitter;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Resilient fetch with: circuit breaker + 429 handling + backoff + header monitoring
async function fetchWithRateLimit(url, options = {}, maxRetries = 3) {
  rateLimitState.totalRequests++;

  // Circuit breaker check
  if (isCircuitOpen()) {
    const msUntilReset = CIRCUIT_RESET_MS - (Date.now() - rateLimitState.circuitOpenAt);
    throw new Error(`Circuit breaker open — retry in ${Math.round(msUntilReset/1000)}s`);
  }

  // Proactive slowdown if near rate limit
  const pctLeft = rateLimitState.remaining / rateLimitState.limit;
  if (pctLeft < RATE_LIMIT_SLOW && pctLeft > RATE_LIMIT_WARN) {
    const slowDelay = 500 + Math.random() * 500; // 0.5-1s delay
    rateLimitState.throttledRequests++;
    await sleep(slowDelay);
  }

  // If reset time is known and we're out, wait for reset
  if (rateLimitState.remaining <= 0 && rateLimitState.resetAt) {
    const waitMs = Math.max(0, rateLimitState.resetAt - Date.now()) + 1000;
    console.log(`[RateLimit] Waiting ${Math.round(waitMs/1000)}s for rate limit reset`);
    await sleep(waitMs);
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Parse rate limit headers from every response
      parseRateLimitHeaders(response.headers);

      if (response.status === 429) {
        rateLimitState.consecutiveFails++;

        // Honor Retry-After header if provided
        const retryAfter = parseInt(response.headers.get?.('retry-after') || '0');
        const backoffMs = retryAfter > 0 ? retryAfter * 1000 : calcBackoff();
        rateLimitState.lastBackoffMs = backoffMs;

        console.warn(`[RateLimit] 429 received. Attempt ${attempt+1}/${maxRetries+1}. Backing off ${Math.round(backoffMs/1000)}s`);

        if (attempt === maxRetries) {
          tripCircuit();
          throw new Error('Rate limit exceeded — circuit breaker tripped');
        }

        await sleep(backoffMs);
        continue;
      }

      // Success — reset fail counter
      rateLimitState.consecutiveFails = 0;
      return response;

    } catch (err) {
      if (err.message.includes('Circuit breaker')) throw err;
      if (attempt === maxRetries) throw err;
      const backoffMs = calcBackoff();
      console.warn(`[RateLimit] Network error attempt ${attempt+1}: ${err.message}. Retrying in ${Math.round(backoffMs/1000)}s`);
      await sleep(backoffMs);
    }
  }
}

// ─── ADAPTIVE POLLING THRESHOLDS ─────────────────────────────────────────────
const POLL_CRITICAL   = 15;   // seconds — Vila window or high heat
const POLL_ELEVATED   = 30;   // seconds — moderate heat
const POLL_LOW        = 60;   // seconds — low activity

function getAdaptivePollInterval(minute, heatScore) {
  const inVila1H = minute >= 35 && minute <= 45;
  const inVila2H = minute >= 80 && minute <= 93;
  const highHeat = heatScore >= 65;
  const modHeat  = heatScore >= 40;

  if (inVila1H || inVila2H || highHeat) return POLL_CRITICAL;
  if (modHeat || (minute >= 28 && minute <= 47) || (minute >= 70 && minute <= 94))
    return POLL_ELEVATED;
  return POLL_LOW;
}

function shouldRefetch(fixtureId, minute, heatScore) {
  const last = lastPolled.get(fixtureId);
  if (!last) return true;
  const interval = getAdaptivePollInterval(minute, heatScore) * 1000;
  return (Date.now() - last) >= interval;
}

// ─── MOMENTUM DELTA ENGINE ────────────────────────────────────────────────────
// Calculates rate-of-change of urgency score over last N readings
// A rising score of 6.2 is more valuable than a falling score of 8.0
function calcMomentumDelta(fixtureId, currentScore) {
  const history = fixtureHistory.get(fixtureId) || [];

  // Add current reading
  history.push({ score: currentScore, ts: Date.now() });
  if (history.length > HISTORY_MAX) history.shift();
  fixtureHistory.set(fixtureId, history);

  if (history.length < 3) return { delta: 0, trend: "neutral", rising: false };

  // Linear regression over last 5 readings for trend
  const recent = history.slice(-5);
  const n = recent.length;
  const xs = recent.map((_, i) => i);
  const ys = recent.map(r => r.score);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  const slope = xs.reduce((acc, x, i) =>
    acc + (x - xMean) * (ys[i] - yMean), 0
  ) / xs.reduce((acc, x) => acc + (x - xMean) ** 2, 0.001);

  // Delta = absolute change over last 3 readings
  const delta = history.length >= 3
    ? history[history.length - 1].score - history[history.length - 3].score
    : 0;

  const trend = slope > 0.5 ? "rising"
    : slope < -0.5 ? "falling"
    : "stable";

  const rising = slope > 0.3;

  return {
    delta: Math.round(delta * 10) / 10,
    slope: Math.round(slope * 100) / 100,
    trend,
    rising,
    readings: history.length,
  };
}

// ─── PRE-TRIGGER VALIDATOR ────────────────────────────────────────────────────
// Validates before firing an alert to the frontend
// Filters: rising trend, minimum confidence, time window
function validateTrigger(urgencyScore, delta, trend, minute, heatScore, probTrigger) {
  const reasons = [];
  let valid = true;

  // Rule 1: Score must be above threshold
  if (urgencyScore < 55) { valid = false; reasons.push("Score below minimum (55)"); }

  // Rule 2: Must be rising or stable — not falling
  // A falling 8.0 is less valuable than a rising 6.0
  if (trend === "falling" && urgencyScore < 75) {
    valid = false;
    reasons.push("Momentum falling — wait for stabilization");
  }

  // Rule 3: Must have probability trigger from Poisson model
  if (!probTrigger) {
    valid = false;
    reasons.push("Poisson probability trigger not met");
  }

  // Rule 4: Must be in a meaningful time window
  if (minute < 10) { valid = false; reasons.push("Too early (< 10′)"); }
  if (minute > 93) { valid = false; reasons.push("Match ended"); }

  // Rule 5: Bonus — rising momentum gets a confidence boost
  const confidenceBoost = trend === "rising" ? 8 : trend === "stable" ? 0 : -5;
  const effectiveScore = urgencyScore + confidenceBoost;

  return {
    valid,
    effectiveScore,
    reasons,
    confidenceBoost,
    trend,
    delta,
  };
}

// ─── URGENCY ENGINE PILLARS ───────────────────────────────────────────────────

const W_SHOT_ON_TARGET   = 4.0;
const W_PASS_INTO_BOX    = 2.5;
const W_CORNER           = 2.0;
const W_FINAL_THIRD      = 1.2;
const W_DANGEROUS_ATTACK = 1.0;
const EWMA_LAMBDA        = 0.3;
const TRIGGER_THRESHOLD  = 72.0;

function calcMotivationMultiplier(attGoals, defGoals, minute, isFavorite, defRedCards) {
  const diff = attGoals - defGoals;
  const trailing = diff < 0, leading = diff > 0, drawing = diff === 0;
  const absDiff  = Math.abs(diff);
  const late = minute >= 70, veryLate = minute >= 80, critical = minute >= 85;

  let multiplier = 1.0;
  const reasons = [];

  if (trailing) {
    if (absDiff >= 3)      multiplier = critical ? 1.20 : 1.10;
    else if (absDiff === 2) multiplier = critical ? 1.50 : veryLate ? 1.40 : late ? 1.25 : 1.10;
    else                   multiplier = critical ? 1.80 : veryLate ? 1.65 : late ? 1.50 : minute >= 55 ? 1.30 : 1.15;
    reasons.push(`Trailing ${absDiff} at ${minute}′ ×${multiplier}`);
    if (isFavorite) { multiplier *= 1.10; reasons.push("Favourite trailing"); }
  } else if (drawing) {
    multiplier = critical ? 1.60 : veryLate ? 1.45 : late ? 1.25 : 1.05;
    if (late) reasons.push(`Draw at ${minute}′ ×${multiplier}`);
  } else {
    multiplier = absDiff >= 3 ? 0.60 : absDiff === 2 && veryLate ? 0.70 : absDiff === 1 && veryLate ? 0.85 : 0.90;
  }

  if (defRedCards >= 1) { multiplier *= 1.30; reasons.push(`Opp. ${11-defRedCards} men`); }
  return { multiplier: Math.round(multiplier * 1000) / 1000, reasons };
}

function calcMotivationScore(attGoals, defGoals, minute, isFavorite, defRedCards) {
  const { multiplier, reasons } = calcMotivationMultiplier(attGoals, defGoals, minute, isFavorite, defRedCards);
  const score = Math.max(0, Math.min(25, ((multiplier - 0.6) / 1.2) * 25));
  return { score: Math.round(score * 100) / 100, multiplier, reasons };
}

function calcEwmaPressure(history, currentAttacks, currentSOT) {
  const reasons = [];
  const intensity = s =>
    (s.dangerous_attacks || 0) * W_DANGEROUS_ATTACK +
    (s.shots_on_target || 0) * W_SHOT_ON_TARGET * 2 +
    (s.corners || 0) * W_CORNER;

  if (!history || history.length < 2) {
    const score = Math.min(15, (currentAttacks * 0.8 + currentSOT * 2.5) / 15 * 25 * 0.6);
    reasons.push("Limited history");
    return { score: Math.round(score * 100) / 100, reasons };
  }

  let ewma = intensity(history[0]);
  for (let i = 1; i < history.length; i++)
    ewma = EWMA_LAMBDA * intensity(history[i]) + (1 - EWMA_LAMBDA) * ewma;

  const currentIntensity = currentAttacks * W_DANGEROUS_ATTACK + currentSOT * W_SHOT_ON_TARGET * 2;
  ewma = EWMA_LAMBDA * currentIntensity + (1 - EWMA_LAMBDA) * ewma;

  const last10 = history.slice(-10);
  const avg10 = last10.reduce((s, h) => s + intensity(h), 0) / last10.length;
  const sustained = avg10 >= 4.0;

  if (sustained) reasons.push(`Sustained pressure: avg ${avg10.toFixed(1)} over ${last10.length} mins`);
  else reasons.push("Pressure spike — not sustained");

  const score = Math.min(25, Math.max(0, (ewma / 30) * 25 * (sustained ? 1.0 : 0.55)));
  return { score: Math.round(score * 100) / 100, reasons };
}

function calcDangerZone(sot, passesIntoBox, corners, finalThird, da, minute) {
  const reasons = [];
  const tf = Math.max(1, minute) / 90;
  const dangerIndex =
    (sot / tf) * W_SHOT_ON_TARGET +
    (passesIntoBox / tf) * W_PASS_INTO_BOX +
    (corners / tf) * W_CORNER +
    (finalThird / tf) * W_FINAL_THIRD +
    (da / tf) * W_DANGEROUS_ATTACK;

  if (sot >= 5)    reasons.push(`High SOT: ${sot}`);
  if (corners >= 4) reasons.push(`Corner cluster: ${corners}`);
  if (da >= 15)    reasons.push(`Attack volume: ${da}`);

  const score = Math.min(25, Math.max(0, (dangerIndex / 80) * 25));
  if (!reasons.length) reasons.push(`Danger index: ${dangerIndex.toFixed(1)}`);
  return { score: Math.round(score * 100) / 100, reasons };
}

function calcDefensiveFatigue(defYellows, defCorners, defDA, history) {
  const reasons = [];
  let score = 0;
  const last10 = (history || []).slice(-10);

  if (last10.length >= 2) {
    const windowCorners = Math.max(0, (last10[last10.length-1].corners||0) - (last10[0].corners||0));
    const windowAttacks = Math.max(0, (last10[last10.length-1].dangerous_attacks||0) - (last10[0].dangerous_attacks||0));
    if (windowCorners >= 3) { score += Math.min(10, (windowCorners-2)*2.5); reasons.push(`Corner fatigue: ${windowCorners} in 10 mins`); }
    if (windowAttacks >= 5) { score += Math.min(10, (windowAttacks-4)*1.5); reasons.push(`Attack fatigue: ${windowAttacks} in 10 mins`); }
  }

  if (defYellows >= 4) { score += 5; reasons.push(`${defYellows} yellow cards`); }
  else if (defYellows >= 2) score += 2;

  const totalPressure = defCorners * 1.5 + defDA * 0.5;
  if (totalPressure >= 25) { score += Math.min(8, ((totalPressure-25)/10)*4); reasons.push(`Cumulative pressure: ${totalPressure.toFixed(0)}`); }

  if (!reasons.length) reasons.push("Defensive structure intact");
  return { score: Math.min(25, Math.max(0, Math.round(score * 100) / 100)), reasons };
}

function computeUrgency(home, away, minute, history) {
  const homePressure = home.shots_on_target*3 + home.dangerous_attacks + home.corners*2;
  const awayPressure = away.shots_on_target*3 + away.dangerous_attacks + away.corners*2;
  const isHomeDom = homePressure >= awayPressure;
  const attacker = isHomeDom ? home : away;
  const defender = isHomeDom ? away : home;

  const attHistory = (history||[]).map(h => isHomeDom ? h.home : h.away).filter(Boolean);
  const defHistory = (history||[]).map(h => isHomeDom ? h.away : h.home).filter(Boolean);

  const mot     = calcMotivationScore(attacker.goals, defender.goals, minute, attacker.favorite||false, defender.red_cards||0);
  const pressure = calcEwmaPressure(attHistory, attacker.dangerous_attacks, attacker.shots_on_target);
  const danger   = calcDangerZone(attacker.shots_on_target, attacker.passes_into_box||0, attacker.corners, attacker.passes_final_third||0, attacker.dangerous_attacks, minute);
  const fatigue  = calcDefensiveFatigue(defender.yellow_cards||0, defender.corners||0, defender.dangerous_attacks||0, defHistory);

  const attackingPillars = (pressure.score + danger.score) * mot.multiplier;
  const total = attackingPillars + fatigue.score + mot.score;
  const urgencyScore = Math.round(Math.min(100, Math.max(0, (total/140)*100)) * 100) / 100;

  // Poisson probability trigger
  const lambda = 0.030 * mot.multiplier *
    (1 + (attacker.shots_on_target / Math.max(minute,1)) * 90 / 15 * 0.3);
  const timeLeft = minute < 45 ? 45 - minute : 90 - minute;
  const probGoal = 1 - Math.exp(-lambda * timeLeft);
  const trigger = urgencyScore >= TRIGGER_THRESHOLD && probGoal >= 0.45;

  const alertLevel = urgencyScore >= 80 ? "🔥 EXTREME" : urgencyScore >= 60 ? "🟠 HIGH" : urgencyScore >= 40 ? "🟡 MEDIUM" : "🟢 LOW";

  let bestBet = "Over 0.5 Next Goal";
  if (attacker.goals < defender.goals) bestBet = `${attacker.name} Next Goal`;

  return {
    urgency_score: urgencyScore,
    heat_score: urgencyScore,
    probability_trigger: trigger,
    prob_pct: Math.round(probGoal * 100),
    alert_level: alertLevel,
    dominant_team: isHomeDom ? "home" : "away",
    best_bet: bestBet,
    breakdown: {
      motivation: mot.score,
      sustained_pressure: pressure.score,
      danger_zone: danger.score,
      defensive_fatigue: fatigue.score,
      motivation_multiplier: mot.multiplier,
      high_pressure: Math.round(pressure.score + danger.score),
      red_card_multiplier: defender.red_cards >= 1 ? 20 : 0,
      vila_effect: (minute >= 35 && minute <= 45) || (minute >= 80 && minute <= 93) ? Math.round(fatigue.score * 0.5) : 0,
      triggers: [...mot.reasons, ...pressure.reasons, ...danger.reasons, ...fatigue.reasons],
    },
  };
}

// ─── ADVANCED METRICS ENGINE ─────────────────────────────────────────────────
// xT proxy, Field Tilt, Progressive Passing, Momentum Score (M)
// Based on: Karun Singh (2018) xT, Opta field tilt, StatsBomb research

const W_ATK=0.5, W_DA=2.0, W_SOT=4.0, W_COR=1.5, W_YEL=-0.5;

function calcMomentumScore(team, opp, minute) {
  const m=Math.max(1,minute);
  const atkRate=(team.dangerous_attacks||0)/m*90;
  const sotRate=(team.shots_on_target||0)/m*90;
  const cornRate=(team.corners||0)/m*90;
  const oppAtk=(opp.dangerous_attacks||0)/m*90;
  const M=W_ATK*atkRate+W_DA*atkRate*0.4+W_SOT*sotRate+W_COR*cornRate+W_YEL*(team.yellow_cards||0)-W_ATK*oppAtk*0.3;
  return Math.round(Math.max(0,M)*10)/10;
}

function calcFieldTilt(home, away) {
  const hA=(home.dangerous_attacks||0)+(home.shots_on_target||0)*2+(home.corners||0);
  const aA=(away.dangerous_attacks||0)+(away.shots_on_target||0)*2+(away.corners||0);
  const tot=hA+aA;
  if(!tot) return {home:50,away:50,dominant:null,strength:"neutral",maxTilt:50};
  const hT=Math.round(hA/tot*100), aT=100-hT;
  const dom=hT>=aT?"home":"away", mx=Math.max(hT,aT);
  const str=mx>=70?"dominant":mx>=60?"strong":mx>=55?"slight":"neutral";
  return {home:hT,away:aT,dominant:dom,strength:str,maxTilt:mx};
}

function calcXThreat(team, minute) {
  const tf=Math.max(1,minute)/90;
  const xT=((team.shots_on_target||0)*0.35+(team.dangerous_attacks||0)*0.08+(team.corners||0)*0.04)/tf;
  return Math.round(xT*100)/100;
}

function calcPressingIntensity(team, opp, minute) {
  const m=Math.max(1,minute);
  const atkRate=(team.dangerous_attacks||0)/m*90;
  const p=Math.min(10,(atkRate*0.15)+((team.yellow_cards||0)*0.5)+((team.corners||0)*0.2));
  return Math.round(p*10)/10;
}

function calcAdvancedMetrics(home, away, minute) {
  const homeM=calcMomentumScore(home,away,minute);
  const awayM=calcMomentumScore(away,home,minute);
  const tilt=calcFieldTilt(home,away);
  const homeXT=calcXThreat(home,minute);
  const awayXT=calcXThreat(away,minute);
  const homePress=calcPressingIntensity(home,away,minute);
  const awayPress=calcPressingIntensity(away,home,minute);
  const xtDom=homeXT>=awayXT?"home":"away";
  const shift=(xtDom==="home"&&awayPress>homePress+2)||(xtDom==="away"&&homePress>awayPress+2);
  return {
    momentum:{home:homeM,away:awayM,leader:homeM>=awayM?"home":"away"},
    field_tilt:tilt,
    xT:{home:homeXT,away:awayXT,dominant:xtDom},
    pressing:{home:homePress,away:awayPress},
    momentum_shift:shift,
    swing_alert:shift&&minute>=60,
  };
}

// ─── MOTIVATION INDEX ──────────────────────────────────────────────────────────
function computeMotivationIndex(standing, leagueSize) {
  if (!standing) return null;
  const { rank, points, points_to_leader } = standing;
  const clSpots = leagueSize >= 18 ? 4 : 2;
  const elSpots = leagueSize >= 18 ? 6 : 3;
  const relegCutoff = leagueSize >= 18 ? leagueSize - 2 : leagueSize - 1;
  const playoffCutoff = leagueSize >= 18 ? leagueSize - 3 : leagueSize - 2;

  let score = 5, label = "Mid-table", tag = null;
  if (rank === 1)                               { score=9;   label="Title leader";      tag={text:"🏆 Title",color:"#f9a825"}; }
  else if (rank<=3 && points_to_leader<=6)      { score=10;  label="Title race";        tag={text:"🏆 Title race",color:"#f9a825"}; }
  else if (rank<=clSpots)                       { score=9;   label="CL spot";           tag={text:"⭐ CL spot",color:"#1565c0"}; }
  else if (rank<=clSpots+2)                     { score=8.5; label="Chasing CL";        tag={text:"⭐ Chasing CL",color:"#1976d2"}; }
  else if (rank<=elSpots)                       { score=7.5; label="EL spot";           tag={text:"🔵 EL spot",color:"#0288d1"}; }
  else if (rank===elSpots+1)                    { score=7;   label="Chasing EL";        tag={text:"🔵 Chasing EL",color:"#0288d1"}; }
  else if (rank<playoffCutoff)                  { score=4;   label="Mid-table";         tag={text:"😴 Nothing at stake",color:"#aaa"}; }
  else if (rank===playoffCutoff)                { score=8.5; label="Playoff battle";    tag={text:"⚠️ Playoff",color:"#e65100"}; }
  else if (rank>=relegCutoff)                   { score=10;  label="Relegation battle"; tag={text:"🆘 Relegation",color:"#c62828"}; }
  return { score: Math.min(10, Math.max(0, score)), label, tag, rank, points };
}

function computeMatchStateMot(teamGoals, oppGoals, minute) {
  const trailing=teamGoals<oppGoals, leading=teamGoals>oppGoals;
  const late=minute>=70, veryLate=minute>=80;
  let score=5, label="In play", tag=null;
  if (trailing)     { score=veryLate?9.5:late?8:7;   label="Chasing";   tag={text:"⚡ Chasing",color:"#e53935"}; }
  else if (leading) { score=veryLate?3:late?4:5;      label=veryLate?"Managing":"In control"; tag=veryLate?{text:"🛡️ Managing",color:"#2e7d32"}:null; }
  else              { score=veryLate?8.5:late?7:5.5;  label=veryLate?"Must score":"Level"; tag=veryLate?{text:"🔥 Must score",color:"#7b1fa2"}:null; }
  return { score: Math.min(10, Math.max(1, score)), label, tag, rank: null, points: null };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function parseStat(stats, idx, name, fallback=0) {
  try {
    const s = stats[idx]?.statistics?.find(s=>s.type===name);
    if (!s||s.value===null) return fallback;
    if (typeof s.value==="string"&&s.value.endsWith("%")) return parseFloat(s.value);
    return parseFloat(s.value)||fallback;
  } catch { return fallback; }
}

async function fetchStatsSafe(fid, headers) {
  try {
    const r = await fetch(`${BASE_URL}/fixtures/statistics?fixture=${fid}`, { headers });
    const d = await r.json();
    return d.response||[];
  } catch { return []; }
}

async function fetchTeamLateHistory(teamId, headers) {
  try {
    const r = await fetch(`${BASE_URL}/fixtures?team=${teamId}&last=10&status=FT`, { headers });
    const d = await r.json();
    const fixtures = d.response||[];
    if (!fixtures.length) return null;
    let lateGoals=0, htGoals=0, gamesWithLate=0, gamesWithHT=0;
    for (const fx of fixtures) {
      let scoredLate=false, scoredHT=false;
      for (const ev of (fx.events||[])) {
        if (ev.type!=="Goal"||ev.team?.id!==teamId||ev.detail==="Own Goal") continue;
        const min=(ev.time?.elapsed||0)+(ev.time?.extra||0);
        if (min>=80) { lateGoals++; scoredLate=true; }
        if (min>=35&&min<=45) { htGoals++; scoredHT=true; }
      }
      if (scoredLate) gamesWithLate++;
      if (scoredHT) gamesWithHT++;
    }
    const n = fixtures.length;
    return {
      teamId, gamesAnalyzed:n,
      lateGoalRate: Math.round(gamesWithLate/n*100),
      htGoalRate: Math.round(gamesWithHT/n*100),
      vilaScore80: Math.round(gamesWithLate/n*100)/10,
      vilaScore35: Math.round(gamesWithHT/n*100)/10,
      isVilaTeam80: gamesWithLate/n>=0.4,
      isVilaTeam35: gamesWithHT/n>=0.4,
      isStrongVila80: gamesWithLate/n>=0.6,
      isStrongVila35: gamesWithHT/n>=0.6,
    };
  } catch { return null; }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method==="OPTIONS") return res.status(200).end();

  const apiKey = process.env.APISPORTS_KEY;
  if (!apiKey) return res.status(500).json({ error: "APISPORTS_KEY not set" });

  const headers = { "x-apisports-key": apiKey };
  const today = new Date().toISOString().split("T")[0];

  try {
    // Step 1: Fetch live + finished + upcoming
    const [liveRes, finishedRes, upcomingRes] = await Promise.all([
      fetchWithRateLimit(`${BASE_URL}/fixtures?live=all`, { headers }),
      fetchWithRateLimit(`${BASE_URL}/fixtures?date=${today}&status=FT`, { headers }),
      fetchWithRateLimit(`${BASE_URL}/fixtures?date=${today}&status=NS`, { headers }),
    ]);
    const [liveData, finishedData, upcomingData] = await Promise.all([
      liveRes.json(), finishedRes.json(), upcomingRes.json()
    ]);

    const liveFixtures     = liveData.response || [];
    const finishedFixtures = (finishedData.response||[]).filter(fx => FEATURED_LEAGUE_IDS.includes(fx.league.id));
    const upcomingFixtures = (upcomingData.response||[])
      .filter(fx => FEATURED_LEAGUE_IDS.includes(fx.league.id))
      .sort((a,b) => new Date(a.fixture.date)-new Date(b.fixture.date));

    // Step 2: Standings for live leagues
    const liveLeagueIds = [...new Set(liveFixtures.map(fx=>fx.league.id))];
    const standingsResults = await Promise.allSettled(
      liveLeagueIds.map(async lid => {
        try {
          const r25 = await fetchWithRateLimit(`${BASE_URL}/standings?league=${lid}&season=2025`,{headers}).catch(()=>null);
          const d25 = r25 ? await r25.json() : {};
          const s25 = d25.response?.[0]?.league?.standings?.[0]||[];
          if (s25.length>0) return {lid,standings:s25};
          const r24 = await fetchWithRateLimit(`${BASE_URL}/standings?league=${lid}&season=2024`,{headers}).catch(()=>null);
          const d24 = r24 ? await r24.json() : {};
          return {lid,standings:d24.response?.[0]?.league?.standings?.[0]||[]};
        } catch { return {lid,standings:[]}; }
      })
    );

    const teamStandingMap={}, leagueSizeMap={};
    standingsResults.forEach(r => {
      if (r.status!=="fulfilled") return;
      const {lid,standings} = r.value;
      leagueSizeMap[lid]=standings.length;

      // Compute league averages for attack/defence strength (Poisson model)
      const totalTeams = standings.length || 1;
      const leagueGoalsFor  = standings.reduce((s,t) => s+(t.all?.goals?.for||0), 0);
      const leagueGoalsAg   = standings.reduce((s,t) => s+(t.all?.goals?.against||0), 0);
      const leagueGamesPlay = standings.reduce((s,t) => s+(t.all?.played||0), 0) || totalTeams;
      const leagueAvgFor  = leagueGoalsFor  / leagueGamesPlay;  // avg goals scored/game
      const leagueAvgAg   = leagueGoalsAg   / leagueGamesPlay;  // avg goals conceded/game

      standings.forEach(s => {
        const played  = s.all?.played || 1;
        const gFor    = s.all?.goals?.for || 0;
        const gAg     = s.all?.goals?.against || 0;
        // Attack strength = team avg goals scored / league avg goals scored
        const atkStr  = leagueAvgFor  > 0 ? (gFor/played) / leagueAvgFor  : 1;
        // Defence strength = team avg goals conceded / league avg goals conceded
        // Lower = better defence
        const defStr  = leagueAvgAg   > 0 ? (gAg/played) / leagueAvgAg   : 1;

        teamStandingMap[s.team.id]={
          rank:s.rank, points:s.points,
          points_to_leader:(standings[0]?.points||0)-s.points,
          leagueId:lid,
          // Poisson strength ratings
          attack_strength: Math.round(atkStr*100)/100,
          defence_strength: Math.round(defStr*100)/100,
          goals_for_pg: Math.round(gFor/played*100)/100,
          goals_ag_pg: Math.round(gAg/played*100)/100,
        };
      });
    });

    // Step 3: Stats for top 12 live fixtures — ADAPTIVE PRIORITY
    // High-priority fixtures (Vila window or high heat) fetched first
    const prioritized = [...liveFixtures].sort((a, b) => {
      const mA = a.fixture.status.elapsed || 0;
      const mB = b.fixture.status.elapsed || 0;
      const vilaA = (mA>=35&&mA<=45)||(mA>=80&&mA<=93) ? 1 : 0;
      const vilaB = (mB>=35&&mB<=45)||(mB>=80&&mB<=93) ? 1 : 0;
      return vilaB - vilaA;
    }).slice(0, 12);

    const statsResults = await Promise.allSettled(
      prioritized.map(fx => fetchStatsSafe(fx.fixture.id, headers).then(s=>({id:fx.fixture.id,stats:s})))
    );
    const statsMap = {};
    statsResults.forEach(r => { if (r.status==="fulfilled") statsMap[r.value.id]=r.value.stats; });

    // Step 4: Vila history
    const in1H = fx => { const m=fx.fixture.status.elapsed; return m>=35&&m<=45; };
    const in2H = fx => { const m=fx.fixture.status.elapsed; return m>=75&&m<=93; };
    const vilaTeamIds = [...new Set(liveFixtures.filter(fx=>in1H(fx)||in2H(fx)).flatMap(fx=>[fx.teams.home.id,fx.teams.away.id]))].slice(0,8);
    const historyResults = await Promise.allSettled(vilaTeamIds.map(id=>fetchTeamLateHistory(id,headers)));
    const teamHistoryMap = {};
    historyResults.forEach((r,i)=>{ if (r.status==="fulfilled"&&r.value) teamHistoryMap[vilaTeamIds[i]]=r.value; });

    // Step 5: Build live matches with momentum delta tracking
    const liveMatches = liveFixtures.map(fx => {
      const fid=fx.fixture.id;
      const stats=statsMap[fid]||[];
      const minute=fx.fixture.status.elapsed||0;
      const events=fx.events||[];
      const homeId=fx.teams.home.id, awayId=fx.teams.away.id;
      const lid=fx.league.id, leagueSize=leagueSizeMap[lid]||20;

      let homeYellow=0,awayYellow=0,homeRed=0,awayRed=0;
      events.forEach(e=>{
        const isHome=e.team?.id===homeId;
        if (e.type==="Card") {
          if (e.detail==="Yellow Card") isHome?homeYellow++:awayYellow++;
          if (e.detail==="Red Card"||e.detail==="Second Yellow card") isHome?homeRed++:awayRed++;
        }
      });

      const hasStats=stats.length>0;
      const isVilaWindow=in1H(fx)||in2H(fx);
      const homeHistory=teamHistoryMap[homeId]||null;
      const awayHistory=teamHistoryMap[awayId]||null;

      const homeMot=computeMotivationIndex(teamStandingMap[homeId],leagueSize)||computeMatchStateMot(fx.goals.home??0,fx.goals.away??0,minute);
      const awayMot=computeMotivationIndex(teamStandingMap[awayId],leagueSize)||computeMatchStateMot(fx.goals.away??0,fx.goals.home??0,minute);
      const homeStr=teamStandingMap[homeId]||null;
      const awayStr=teamStandingMap[awayId]||null;
      // Poisson expected goals for remaining time
      const timeLeft=minute<45?45-minute:90-minute;
      const leagueHomeAvg=1.36, leagueAwayAvg=1.06;
      const homeXg=homeStr&&awayStr ? homeStr.attack_strength*awayStr.defence_strength*leagueHomeAvg*(timeLeft/90) : null;
      const awayXg=homeStr&&awayStr ? awayStr.attack_strength*homeStr.defence_strength*leagueAwayAvg*(timeLeft/90) : null;

      const home = {
        name:fx.teams.home.name, logo:fx.teams.home.logo||"", id:homeId,
        goals:fx.goals.home??0,
        possession: hasStats?parseStat(stats,0,"Ball Possession"):0,
        shots_on_target: hasStats?parseStat(stats,0,"Shots on Goal"):0,
        corners: hasStats?parseStat(stats,0,"Corner Kicks"):0,
        dangerous_attacks: hasStats?parseStat(stats,0,"Dangerous Attacks"):0,
        passes_into_box: hasStats?parseStat(stats,0,"Shots insidebox"):0,
        passes_final_third: hasStats?parseStat(stats,0,"Passes %"):0,
        yellow_cards: hasStats?parseStat(stats,0,"Yellow Cards"):homeYellow,
        red_cards: hasStats?parseStat(stats,0,"Red Cards"):homeRed,
        favorite:fx.teams.home.winner||false, motivation:homeMot,
        vila: homeHistory&&isVilaWindow?{
          vilaScore: in2H(fx)?homeHistory.vilaScore80:homeHistory.vilaScore35,
          lateGoalRate: in2H(fx)?homeHistory.lateGoalRate:homeHistory.htGoalRate,
          isVilaTeam: in2H(fx)?homeHistory.isVilaTeam80:homeHistory.isVilaTeam35,
          isStrongVila: in2H(fx)?homeHistory.isStrongVila80:homeHistory.isStrongVila35,
          gamesAnalyzed:homeHistory.gamesAnalyzed,
        }:null,
      };

      const away = {
        name:fx.teams.away.name, logo:fx.teams.away.logo||"", id:awayId,
        goals:fx.goals.away??0,
        possession: hasStats?parseStat(stats,1,"Ball Possession"):0,
        shots_on_target: hasStats?parseStat(stats,1,"Shots on Goal"):0,
        corners: hasStats?parseStat(stats,1,"Corner Kicks"):0,
        dangerous_attacks: hasStats?parseStat(stats,1,"Dangerous Attacks"):0,
        passes_into_box: hasStats?parseStat(stats,1,"Shots insidebox"):0,
        passes_final_third: hasStats?parseStat(stats,1,"Passes %"):0,
        yellow_cards: hasStats?parseStat(stats,1,"Yellow Cards"):awayYellow,
        red_cards: hasStats?parseStat(stats,1,"Red Cards"):awayRed,
        favorite:fx.teams.away.winner||false, motivation:awayMot,
        vila: awayHistory&&isVilaWindow?{
          vilaScore: in2H(fx)?awayHistory.vilaScore80:awayHistory.vilaScore35,
          lateGoalRate: in2H(fx)?awayHistory.lateGoalRate:awayHistory.htGoalRate,
          isVilaTeam: in2H(fx)?awayHistory.isVilaTeam80:awayHistory.isVilaTeam35,
          isStrongVila: in2H(fx)?awayHistory.isStrongVila80:awayHistory.isStrongVila35,
          gamesAnalyzed:awayHistory.gamesAnalyzed,
        }:null,
      };

      // ── RUN URGENCY ENGINE ──────────────────────────────────────────────
      const urgency = computeUrgency(home, away, minute, []);
      const advanced = calcAdvancedMetrics(home, away, minute);

      // ── MOMENTUM DELTA ──────────────────────────────────────────────────
      const momentumDelta = calcMomentumDelta(fid, urgency.urgency_score);

      // ── ADAPTIVE POLL INTERVAL ──────────────────────────────────────────
      const pollInterval = getAdaptivePollInterval(minute, urgency.urgency_score);
      lastPolled.set(fid, Date.now());

      // ── PRE-TRIGGER VALIDATOR ───────────────────────────────────────────
      const triggerValidation = validateTrigger(
        urgency.urgency_score,
        momentumDelta.delta,
        momentumDelta.trend,
        minute,
        urgency.urgency_score,
        urgency.probability_trigger
      );

      const dapm = +((home.dangerous_attacks+away.dangerous_attacks)/Math.max(minute,1)).toFixed(2);

      return {
        fixture_id:fid, league:fx.league.name, country:fx.league.country,
        league_id:lid, minute, status:fx.fixture.status.short,
        kickoff:fx.fixture.date, kickoff_display:null, time_until:null, mins_until:null,
        home, away, dangerous_attacks_per_min:dapm, odds:null,
        heat_score:urgency.urgency_score,
        urgency_score:urgency.urgency_score,
        probability_trigger:triggerValidation.valid, // uses validated trigger
        alert_level:urgency.alert_level,
        best_bet:urgency.best_bet,
        has_full_stats:hasStats,
        breakdown:urgency.breakdown,
        momentum: {
          delta: momentumDelta.delta,
          trend: momentumDelta.trend,
          rising: momentumDelta.rising,
          slope: momentumDelta.slope,
          readings: momentumDelta.readings,
          effective_score: triggerValidation.effectiveScore,
          trigger_valid: triggerValidation.valid,
          trigger_reasons: triggerValidation.reasons,
          confidence_boost: triggerValidation.confidenceBoost,
        },
        poll_interval: pollInterval,
        advanced,
        poisson: homeXg !== null ? {
          home_xg: Math.round(homeXg*100)/100,
          away_xg: Math.round(awayXg*100)/100,
          total_xg: Math.round((homeXg+awayXg)*100)/100,
          prob_goal: Math.round((1-Math.exp(-(homeXg+awayXg)))*100),
          home_attack: homeStr?.attack_strength,
          home_defence: homeStr?.defence_strength,
          away_attack: awayStr?.attack_strength,
          away_defence: awayStr?.defence_strength,
        } : null,
      };
    }).sort((a,b)=>b.heat_score-a.heat_score);

    // Step 6: Finished matches
    const finishedMatches = finishedFixtures.map(fx=>{
      const events=fx.events||[], homeId=fx.teams.home.id;
      let homeYellow=0,awayYellow=0,homeRed=0,awayRed=0;
      events.forEach(e=>{
        const isHome=e.team?.id===homeId;
        if(e.type==="Card"){if(e.detail==="Yellow Card")isHome?homeYellow++:awayYellow++;if(e.detail==="Red Card"||e.detail==="Second Yellow card")isHome?homeRed++:awayRed++;}
      });
      const lid=fx.league.id, ls=leagueSizeMap[lid]||20;
      return {
        fixture_id:fx.fixture.id, league:fx.league.name, country:fx.league.country,
        minute:fx.fixture.status.elapsed||90, status:"FT", kickoff:fx.fixture.date,
        kickoff_display:null, time_until:null, mins_until:null,
        heat_score:0, urgency_score:0, probability_trigger:false, alert_level:"✅ FT",
        has_full_stats:false, breakdown:{high_pressure:0,red_card_multiplier:0,vila_effect:0,triggers:[]},
        momentum:{delta:0,trend:"stable",rising:false,slope:0,readings:0,effective_score:0,trigger_valid:false,trigger_reasons:[],confidence_boost:0},
        poll_interval:POLL_LOW,
        home:{name:fx.teams.home.name,logo:fx.teams.home.logo||"",id:homeId,goals:fx.goals.home??0,possession:0,shots_on_target:0,corners:0,dangerous_attacks:0,yellow_cards:homeYellow,red_cards:homeRed,favorite:fx.teams.home.winner||false,motivation:computeMotivationIndex(teamStandingMap[homeId],ls)||computeMatchStateMot(fx.goals.home??0,fx.goals.away??0,90),vila:null},
        away:{name:fx.teams.away.name,logo:fx.teams.away.logo||"",id:fx.teams.away.id,goals:fx.goals.away??0,possession:0,shots_on_target:0,corners:0,dangerous_attacks:0,yellow_cards:awayYellow,red_cards:awayRed,favorite:fx.teams.away.winner||false,motivation:computeMotivationIndex(teamStandingMap[fx.teams.away.id],ls)||computeMatchStateMot(fx.goals.away??0,fx.goals.home??0,90),vila:null},
        dangerous_attacks_per_min:0, odds:null,
      };
    }).sort((a,b)=>new Date(b.kickoff)-new Date(a.kickoff));

    // Step 7: Upcoming matches
    const now=new Date();
    const upcomingMatches=upcomingFixtures.slice(0,60).map(fx=>{
      const kickoff=new Date(fx.fixture.date), diffMs=kickoff-now, diffMins=Math.round(diffMs/60000);
      const timeLabel=diffMins<=0?"Soon":diffMins<60?`${diffMins}m`:`${Math.floor(diffMins/60)}h ${diffMins%60}m`;
      const lid=fx.league.id, ls=leagueSizeMap[lid]||20;
      const homeMot=computeMotivationIndex(teamStandingMap[fx.teams.home.id],ls)||{score:5,label:"Pre-match",tag:null,rank:null,points:null};
      const awayMot=computeMotivationIndex(teamStandingMap[fx.teams.away.id],ls)||{score:5,label:"Pre-match",tag:null,rank:null,points:null};
      return {
        fixture_id:fx.fixture.id, league:fx.league.name, country:fx.league.country,
        league_id:lid, minute:0, status:"NS", kickoff:fx.fixture.date,
        kickoff_display:kickoff.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
        time_until:timeLabel, mins_until:diffMins,
        heat_score:0, urgency_score:0, probability_trigger:false, alert_level:"⏰ UPCOMING",
        has_full_stats:false, breakdown:{high_pressure:0,red_card_multiplier:0,vila_effect:0,triggers:[]},
        momentum:{delta:0,trend:"neutral",rising:false,slope:0,readings:0,effective_score:0,trigger_valid:false,trigger_reasons:[],confidence_boost:0},
        poll_interval:POLL_LOW,
        home:{name:fx.teams.home.name,logo:fx.teams.home.logo||"",id:fx.teams.home.id,goals:null,possession:0,shots_on_target:0,corners:0,dangerous_attacks:0,yellow_cards:0,red_cards:0,favorite:fx.teams.home.winner||false,motivation:homeMot,vila:null},
        away:{name:fx.teams.away.name,logo:fx.teams.away.logo||"",id:fx.teams.away.id,goals:null,possession:0,shots_on_target:0,corners:0,dangerous_attacks:0,yellow_cards:0,red_cards:0,favorite:fx.teams.away.winner||false,motivation:awayMot,vila:null},
        dangerous_attacks_per_min:0, odds:null,
      };
    });

    const matches=[...liveMatches,...finishedMatches,...upcomingMatches];

    // Adaptive poll recommendation for frontend
    const recommendedPoll = liveMatches.length === 0 ? POLL_LOW
      : Math.min(...liveMatches.map(m=>m.poll_interval));

    return res.status(200).json({
      source:"api-sports-pro",
      engine:"urgency-v3-adaptive",
      count:matches.length,
      live_count:liveMatches.length,
      finished_count:finishedMatches.length,
      upcoming_count:upcomingMatches.length,
      probability_triggers:liveMatches.filter(m=>m.probability_trigger).length,
      rising_games:liveMatches.filter(m=>m.momentum?.rising).length,
      recommended_poll_seconds:recommendedPoll,
      generated_at:new Date().toISOString(),
      matches,
    });

  } catch(err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}
