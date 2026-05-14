import { useState, useEffect, useCallback } from "react";

const API_URL = "/api/all";
const REFRESH = 60;

// Leagues FanDuel typically offers live soccer betting on
const FANDUEL_LEAGUES = [
  "Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1",
  "Champions League", "UEFA Champions League", "Europa League", "UEFA Europa League",
  "Conference League", "UEFA Europa Conference League",
  "Championship", "Eredivisie", "Primeira Liga", "Scottish Premiership",
  "Super Lig", "Brasileirao Serie A", "Liga MX", "MLS", "Jupiler Pro League",
  "Ligue 2", "Serie B", "2. Bundesliga", "La Liga 2",
];

// ─── DEMO FALLBACK ────────────────────────────────────────────────────────────
const DEMO = [
  { fixture_id:1001, league:"Premier League", country:"England", minute:87, status:"2H", heat_score:91, alert_level:"🔥 EXTREME", has_full_stats:true, breakdown:{high_pressure:35,red_card_multiplier:20,vila_effect:31,triggers:["Dominant possession: Man City 68%","High attack rate: 2.41/min","⚡ High Pressure Zone","🟥 Red Card Multiplier","⏱️ Vila Effect: 3′ remaining"]}, home:{name:"Man City",logo:"",goals:1,possession:68,shots_on_target:9,corners:7,dangerous_attacks:42,yellow_cards:2,red_cards:0,motivation:{score:9,label:"Title leader",tag:{text:"🏆 Title",color:"#f9a825"},rank:1,points:82},vila:null}, away:{name:"Arsenal",logo:"",goals:1,possession:32,shots_on_target:3,corners:2,dangerous_attacks:18,yellow_cards:1,red_cards:1,motivation:{score:10,label:"Title race",tag:{text:"🏆 Title race",color:"#f9a825"},rank:2,points:80},vila:{vilaScore:7,lateGoalRate:60,isVilaTeam:true,isStrongVila:true,gamesAnalyzed:10}}, dangerous_attacks_per_min:2.41 },
  { fixture_id:1007, league:"Scottish Prem", country:"Scotland", minute:85, status:"2H", heat_score:78, alert_level:"🟠 HIGH", has_full_stats:true, breakdown:{high_pressure:22,red_card_multiplier:0,vila_effect:28,triggers:["High attack rate: 1.85/min","⏱️ Vila Effect: 5′ remaining"]}, home:{name:"Celtic",logo:"",goals:2,possession:54,shots_on_target:7,corners:6,dangerous_attacks:38,yellow_cards:1,red_cards:0,motivation:{score:8.5,label:"CL spot",tag:{text:"⭐ CL spot",color:"#1565c0"},rank:2,points:71},vila:{vilaScore:5,lateGoalRate:50,isVilaTeam:true,isStrongVila:false,gamesAnalyzed:10}}, away:{name:"Rangers",logo:"",goals:2,possession:46,shots_on_target:5,corners:5,dangerous_attacks:29,yellow_cards:2,red_cards:0,motivation:{score:10,label:"Relegation battle",tag:{text:"🆘 Relegation",color:"#c62828"},rank:11,points:28},vila:null}, dangerous_attacks_per_min:1.85 },
  { fixture_id:1002, league:"La Liga", country:"Spain", minute:38, status:"1H", heat_score:67, alert_level:"🟠 HIGH", has_full_stats:true, breakdown:{high_pressure:18,red_card_multiplier:0,vila_effect:22,triggers:["High attack rate: 1.68/min","⏱️ Vila Effect: 7′ remaining"]}, home:{name:"Real Madrid",logo:"",goals:0,possession:52,shots_on_target:4,corners:4,dangerous_attacks:24,yellow_cards:1,red_cards:0,motivation:{score:9,label:"CL spot",tag:{text:"⭐ CL spot",color:"#1565c0"},rank:1,points:84},vila:null}, away:{name:"Barcelona",logo:"",goals:0,possession:48,shots_on_target:5,corners:3,dangerous_attacks:22,yellow_cards:0,red_cards:0,motivation:{score:4,label:"Mid-table",tag:{text:"😴 Nothing at stake",color:"#aaa"},rank:9,points:45},vila:null}, dangerous_attacks_per_min:1.68 },
  { fixture_id:1004, league:"Ligue 1", country:"France", minute:56, status:"2H", heat_score:52, alert_level:"🟡 MEDIUM", has_full_stats:false, breakdown:{high_pressure:0,red_card_multiplier:0,vila_effect:0,triggers:["⚽ 3 goals scored","⚡ 1 goal game — late pressure"]}, home:{name:"PSG",logo:"",goals:2,possession:0,shots_on_target:0,corners:0,dangerous_attacks:0,yellow_cards:0,red_cards:0,motivation:{score:9,label:"Title leader",tag:{text:"🏆 Title",color:"#f9a825"},rank:1,points:77},vila:null}, away:{name:"Lyon",logo:"",goals:1,possession:0,shots_on_target:0,corners:0,dangerous_attacks:0,yellow_cards:2,red_cards:0,motivation:{score:10,label:"Relegation battle",tag:{text:"🆘 Relegation",color:"#c62828"},rank:17,points:29},vila:null}, dangerous_attacks_per_min:0 },
  { fixture_id:1003, league:"Bundesliga", country:"Germany", minute:14, status:"1H", heat_score:18, alert_level:"🟢 LOW", has_full_stats:false, breakdown:{high_pressure:0,red_card_multiplier:0,vila_effect:0,triggers:[]}, home:{name:"Bayern Munich",logo:"",goals:1,possession:0,shots_on_target:0,corners:0,dangerous_attacks:0,yellow_cards:0,red_cards:0,motivation:{score:4,label:"Mid-table",tag:{text:"😴 Nothing at stake",color:"#aaa"},rank:8,points:44},vila:null}, away:{name:"Dortmund",logo:"",goals:0,possession:0,shots_on_target:0,corners:0,dangerous_attacks:0,yellow_cards:0,red_cards:0,motivation:{score:7.5,label:"EL spot",tag:{text:"🔵 EL spot",color:"#0288d1"},rank:6,points:52},vila:null}, dangerous_attacks_per_min:0 },
];

function groupByLeague(matches) {
  const groups = {};
  matches.forEach(m => {
    const key = `${m.country} — ${m.league}`;
    if (!groups[key]) groups[key] = { label: key, matches: [] };
    groups[key].matches.push(m);
  });
  return Object.values(groups);
}

function heatColor(score) {
  if (score >= 80) return "#e53935";
  if (score >= 60) return "#f57c00";
  if (score >= 40) return "#f9a825";
  return "#43a047";
}

// ─── MOTIVATION GAUGE ─────────────────────────────────────────────────────────
function MotivationGauge({ team, side }) {
  const mot = team.motivation;
  if (!mot) return null;
  const score = mot.score || 5;
  const pct = (score / 10) * 100;

  const color = score >= 8 ? "#e53935"
    : score >= 6 ? "#f57c00"
    : score >= 5 ? "#1976d2"
    : "#9e9e9e";

  const bgGrad = score >= 8
    ? "linear-gradient(135deg, #fff5f5, #fff)"
    : score >= 6
    ? "linear-gradient(135deg, #fff8f0, #fff)"
    : score >= 5
    ? "linear-gradient(135deg, #f0f4ff, #fff)"
    : "linear-gradient(135deg, #f5f5f5, #fff)";

  // Arc SVG — semicircle gauge
  const r = 28, cx = 36, cy = 36;
  const arcLen = Math.PI * r; // half circle circumference
  const filled = (pct / 100) * arcLen;

  return (
    <div style={{
      flex: 1, background: bgGrad,
      borderRadius: 12, border: `1px solid ${color}22`,
      padding: "10px 10px 8px",
      display: "flex", flexDirection: "column", alignItems: "center",
      boxShadow: `0 2px 8px ${color}11`,
    }}>
      {/* Team name */}
      <div style={{ fontSize: 10, fontWeight: 700, color: "#555", marginBottom: 6, textAlign: "center", lineHeight: 1.2 }}>
        {team.name}
      </div>

      {/* Semicircle gauge */}
      <svg width="72" height="42" viewBox="0 0 72 42" style={{ overflow: "visible" }}>
        {/* Track */}
        <path
          d={`M 8,36 A ${r},${r} 0 0,1 64,36`}
          fill="none" stroke="#f0f0f0" strokeWidth="6" strokeLinecap="round"
        />
        {/* Fill */}
        <path
          d={`M 8,36 A ${r},${r} 0 0,1 64,36`}
          fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${filled} ${arcLen}`}
          style={{ transition: "stroke-dasharray .8s ease" }}
        />
        {/* Score number */}
        <text x="36" y="33" textAnchor="middle" fontSize="14" fontWeight="900"
          fill={color} fontFamily="monospace">{score.toFixed(1)}</text>
        <text x="36" y="43" textAnchor="middle" fontSize="7" fill="#bbb" fontFamily="sans-serif">/10</text>
      </svg>

      {/* Label */}
      <div style={{
        fontSize: 9, fontWeight: 800, color,
        letterSpacing: "0.05em", marginTop: 2, textAlign: "center",
      }}>{mot.label?.toUpperCase()}</div>

      {/* Standing tag */}
      {mot.tag && (
        <div style={{
          marginTop: 5, fontSize: 8, fontWeight: 700,
          background: `${mot.tag.color}15`,
          color: mot.tag.color,
          border: `1px solid ${mot.tag.color}33`,
          borderRadius: 20, padding: "2px 8px",
          textAlign: "center",
        }}>{mot.tag.text}</div>
      )}

      {/* Rank */}
      {mot.rank && (
        <div style={{ fontSize: 8, color: "#bbb", marginTop: 4, fontFamily: "monospace" }}>
          #{mot.rank} · {mot.points}pts
        </div>
      )}
    </div>
  );
}

// ─── EXPANDED DETAIL ──────────────────────────────────────────────────────────
function MatchDetail({ m }) {
  const hasStats = m.has_full_stats && (m.home.possession > 0 || m.home.shots_on_target > 0);
  const triggers = m.breakdown?.triggers || [];
  const hasMot = m.home.motivation || m.away.motivation;

  return (
    <div style={{ background: "#f9f9f9", padding: "12px 14px 14px", borderTop: "1px solid #eee" }}>

      {/* ── MOTIVATION INDEX PANEL ── */}
      {hasMot && (
        <div style={{ marginBottom: 14 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, #e0e0e0)" }} />
            <div style={{ fontSize: 9, fontWeight: 800, color: "#bbb", letterSpacing: "0.12em", whiteSpace: "nowrap" }}>
              🧠 MOTIVATION INDEX
            </div>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, #e0e0e0, transparent)" }} />
          </div>

          {/* Two gauges side by side */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <MotivationGauge team={m.home} side="home" />
            {/* VS divider */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, flexShrink: 0 }}>
              <div style={{ width: 1, flex: 1, background: "#eee" }} />
              <div style={{ fontSize: 9, fontWeight: 800, color: "#ccc" }}>VS</div>
              <div style={{ width: 1, flex: 1, background: "#eee" }} />
            </div>
            <MotivationGauge team={m.away} side="away" />
          </div>

          {/* Motivation insight banner */}
          {(() => {
            const hMot = m.home.motivation?.score || 5;
            const aMot = m.away.motivation?.score || 5;
            const hGoals = m.home.goals || 0;
            const aGoals = m.away.goals || 0;
            const isDraw = hGoals === aGoals;
            const hTrailing = hGoals < aGoals;
            const aTrailing = aGoals < hGoals;

            let insight = null;

            if (hMot <= 4 && !hTrailing && !isDraw)
              insight = { text: `😴 ${m.home.name} are leading with nothing at stake — expect them to sit back and defend. Low goal risk from them.`, color: "#9e9e9e", bg: "#f5f5f5", border: "#e0e0e0" };
            else if (aMot <= 4 && !aTrailing && !isDraw)
              insight = { text: `😴 ${m.away.name} are leading with nothing at stake — expect them to sit back and defend. Low goal risk from them.`, color: "#9e9e9e", bg: "#f5f5f5", border: "#e0e0e0" };
            else if (hMot >= 9 && hTrailing)
              insight = { text: `🆘 ${m.home.name} are in a relegation battle and trailing — expect desperate, all-out attack. High goal probability.`, color: "#c62828", bg: "#fff5f5", border: "#ffcdd2" };
            else if (aMot >= 9 && aTrailing)
              insight = { text: `🆘 ${m.away.name} are in a relegation battle and trailing — expect desperate, all-out attack. High goal probability.`, color: "#c62828", bg: "#fff5f5", border: "#ffcdd2" };
            else if (hMot >= 8 && aMot >= 8 && isDraw)
              insight = { text: `🔥 Both teams have high stakes in this draw — neither can afford to drop points. Expect end-to-end action.`, color: "#e53935", bg: "#fff8f5", border: "#ffccbc" };
            else if (hMot <= 4 && aMot <= 4)
              insight = { text: `😴 Both teams have nothing at stake — expect low intensity. Research shows these games have higher goals conceded but lower defensive effort overall.`, color: "#9e9e9e", bg: "#f5f5f5", border: "#e0e0e0" };
            else if ((hMot >= 8 && isDraw) || (aMot >= 8 && isDraw))
              insight = { text: `⚡ High-stakes team drawing — they need to win. Expect increased attacking urgency.`, color: "#f57c00", bg: "#fffde7", border: "#ffe082" };

            if (!insight) return null;
            return (
              <div style={{ background: insight.bg, border: `1px solid ${insight.border}`, borderRadius: 8, padding: "8px 12px" }}>
                <div style={{ fontSize: 11, color: insight.color, lineHeight: 1.5 }}>{insight.text}</div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── HEAT SCORE BAR ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: "#bbb", letterSpacing: "0.1em", minWidth: 68 }}>HEAT SCORE</div>
        <div style={{ flex: 1, height: 6, background: "#e8e8e8", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${m.heat_score}%`, height: "100%", background: `linear-gradient(90deg, ${heatColor(m.heat_score)}99, ${heatColor(m.heat_score)})`, borderRadius: 3, transition: "width .6s ease" }} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: heatColor(m.heat_score), fontFamily: "monospace", minWidth: 24, textAlign: "right" }}>{m.heat_score}</div>
      </div>

      {/* ── HEAT BREAKDOWN CARDS ── */}
      {m.breakdown && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {[
            { label: "Pressure", val: m.breakdown.high_pressure, max: 35, color: "#1976d2", icon: "⚡" },
            { label: "Red Card", val: m.breakdown.red_card_multiplier, max: 30, color: "#e53935", icon: "🟥" },
            { label: "Vila", val: m.breakdown.vila_effect, max: 35, color: "#f9a825", icon: "⏱️" },
          ].map(({ label, val, max, color, icon }) => (
            <div key={label} style={{ flex: 1, background: "#fff", borderRadius: 8, padding: "8px 6px", border: `1px solid ${val > 0 ? color + "33" : "#eee"}`, textAlign: "center", boxShadow: val > 0 ? `0 2px 6px ${color}15` : "none" }}>
              <div style={{ fontSize: 12, marginBottom: 3 }}>{icon}</div>
              <div style={{ fontSize: 8, color: "#bbb", marginBottom: 4, letterSpacing: "0.05em" }}>{label.toUpperCase()}</div>
              <div style={{ height: 3, background: "#f0f0f0", borderRadius: 2, marginBottom: 4 }}>
                <div style={{ width: `${(val / max) * 100}%`, height: "100%", background: color, borderRadius: 2, transition: "width .6s" }} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: val > 0 ? color : "#ccc" }}>{val}<span style={{ fontSize: 9, fontWeight: 400, color: "#ddd" }}>/{max}</span></div>
            </div>
          ))}
        </div>
      )}

      {/* ── STATS GRID ── */}
      {hasStats && (
        <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #eee", overflow: "hidden", marginBottom: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", padding: "6px 12px", background: "#f5f5f5", borderBottom: "1px solid #eee" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textAlign: "right" }}>{m.home.name}</div>
            <div style={{ fontSize: 10, color: "#ccc", textAlign: "center", padding: "0 10px" }}>STATS</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#888" }}>{m.away.name}</div>
          </div>
          {[
            { label: "Possession", hv: `${m.home.possession}%`, av: `${m.away.possession}%`, hNum: m.home.possession, aNum: m.away.possession },
            { label: "Shots on Target", hv: m.home.shots_on_target, av: m.away.shots_on_target, hNum: m.home.shots_on_target, aNum: m.away.shots_on_target },
            { label: "Corners", hv: m.home.corners, av: m.away.corners, hNum: m.home.corners, aNum: m.away.corners },
            { label: "Danger Attacks", hv: m.home.dangerous_attacks, av: m.away.dangerous_attacks, hNum: m.home.dangerous_attacks, aNum: m.away.dangerous_attacks },
            { label: "Yellow Cards", hv: m.home.yellow_cards, av: m.away.yellow_cards, hNum: m.home.yellow_cards, aNum: m.away.yellow_cards },
            { label: "Red Cards", hv: m.home.red_cards, av: m.away.red_cards, hNum: m.home.red_cards, aNum: m.away.red_cards },
          ].map(({ label, hv, av, hNum, aNum }, i) => {
            const homeWins = hNum > aNum;
            const awayWins = aNum > hNum;
            return (
              <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", padding: "7px 12px", background: i % 2 === 0 ? "#fff" : "#fafafa", borderBottom: i < 5 ? "1px solid #f0f0f0" : "none", alignItems: "center" }}>
                <div style={{ fontSize: 12, color: homeWins ? "#111" : "#888", textAlign: "right", fontWeight: homeWins ? 700 : 400 }}>{hv}</div>
                <div style={{ fontSize: 10, color: "#ccc", textAlign: "center", padding: "0 10px", whiteSpace: "nowrap" }}>{label}</div>
                <div style={{ fontSize: 12, color: awayWins ? "#111" : "#888", textAlign: "left", fontWeight: awayWins ? 700 : 400 }}>{av}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TRIGGERS ── */}
      {triggers.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #eee", padding: "8px 12px" }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: "#ccc", letterSpacing: "0.1em", marginBottom: 6 }}>SIGNALS</div>
          {triggers.map((t, i) => (
            <div key={i} style={{ fontSize: 11, color: "#777", marginBottom: i < triggers.length - 1 ? 4 : 0, paddingLeft: 4, borderLeft: "2px solid #f0f0f0" }}>{t}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SCIENTIFIC GOAL PROBABILITY ENGINE ──────────────────────────────────────
// Based on:
// - Dixon & Robinson (1998): Doubly stochastic Poisson process — goal rate
//   depends on game state (score, minute, red cards)
// - Skripnikov et al. (2024): Minute-by-minute Poisson regression across
//   EPL/La Liga/Bundesliga/Serie A/Ligue 1 — trailing teams attack more
// - Anzer & Bauer (2021): xG model — shots on target & dangerous attacks
//   are strongest proxies for goal probability
// - Bivariate Poisson (Ley et al.): corners, SOT, red cards, yellows
//   are statistically significant scoring intensity predictors
// Algorithm: Lambda (goal rate) = base_rate × state_multipliers
// Converted to 1–10 scale via P(≥1 goal in T minutes | lambda)

function calcGoalProb(m) {
  if (m.status === "NS") return { score: 0, label: "—", color: "#ccc", bet: null, halfLabel: null, timeLeft: 0, reasons: [] };

  const minute = m.minute;
  const bd = m.breakdown || {};
  const homeGoals = m.home.goals;
  const awayGoals = m.away.goals;
  const diff = Math.abs(homeGoals - awayGoals);
  const isDraw = diff === 0;
  const total = homeGoals + awayGoals;

  // ── TIME REMAINING ──────────────────────────────────────────────────────────
  const isFirstHalf = minute <= 45;
  const timeLeft = isFirstHalf ? Math.max(0, 45 - minute) : Math.max(0, 90 - minute);
  const halfLabel = isFirstHalf ? "HT" : "FT";

  // ── IDENTIFY TEAMS ──────────────────────────────────────────────────────────
  const dominant = m.home.possession >= m.away.possession ? m.home : m.away;
  const trailing = homeGoals < awayGoals ? m.home : awayGoals < homeGoals ? m.away : null;
  const leading  = homeGoals > awayGoals ? m.home : awayGoals > homeGoals ? m.away : null;

  // ── BASE LAMBDA: avg goals/min in soccer = 2.7 goals / 90 min ──────────────
  // Source: large-scale European league analysis
  let lambda = 2.7 / 90; // ~0.030 goals/min baseline

  // ── MULTIPLIER 1: SCORE STATE (Dixon & Robinson, Skripnikov) ───────────────
  // Trailing teams increase attacking intensity exponentially near end
  // Leading teams drop intensity by ~20%
  let stateMultiplier = 1.0;
  let bestBet = "Over 0.5 Next Goal";
  let betReason = "";

  if (isDraw) {
    // Both teams in balanced state — normal rate, slight urgency bonus
    if (minute >= 80) { stateMultiplier = 2.2; betReason = "Late draw — both desperate"; }
    else if (minute >= 70) { stateMultiplier = 1.8; betReason = "Draw 2nd half"; }
    else if (minute >= 60) { stateMultiplier = 1.5; betReason = "Draw midway 2nd half"; }
    else if (minute >= 38) { stateMultiplier = 1.4; betReason = "Draw end of 1st half"; }
    else { stateMultiplier = 1.1; }
  } else if (diff === 1) {
    // Trailing team attacks, leading team defends
    // Net effect: ~+30% goal rate vs neutral (Skripnikov)
    stateMultiplier = minute >= 75 ? 1.9 : minute >= 60 ? 1.5 : 1.2;
    if (trailing) {
      bestBet = `${trailing.name} Next Goal`;
      betReason = `${trailing.name} chasing equalizer`;
    }
  } else if (diff === 2) {
    // Leading team very conservative, trailing team desperate
    // Net goal rate slightly above average but less likely = losing team scores
    stateMultiplier = minute >= 75 ? 1.4 : 0.9;
    if (trailing) { bestBet = `${trailing.name} Next Goal`; betReason = "Chasing 2-goal deficit"; }
  } else if (diff >= 3) {
    // Game effectively over — low pressure
    stateMultiplier = 0.6;
    betReason = "Game decided";
  }

  lambda *= stateMultiplier;

  // ── MULTIPLIER 1b: MOTIVATION INDEX ────────────────────────────────────────
  // Research (Caley 2025): "Nothing to play for" teams show statistically
  // significant drop in defensive intensity — MORE goals conceded, less structure
  const homeMot = m.home.motivation?.score || 5;
  const awayMot = m.away.motivation?.score || 5;
  const homeGoals = m.home.goals || 0;
  const awayGoals = m.away.goals || 0;
  const homeTrailing = homeGoals < awayGoals;
  const awayTrailing = awayGoals < homeGoals;
  const bothDrawing = homeGoals === awayGoals;

  // High motivation trailing team = max aggression (Skripnikov 2024)
  if (homeTrailing && homeMot >= 8) lambda *= 1.55;
  else if (homeTrailing && homeMot >= 6) lambda *= 1.30;
  else if (homeTrailing && homeMot <= 4) lambda *= 1.10; // still tries but less urgent

  if (awayTrailing && awayMot >= 8) lambda *= 1.55;
  else if (awayTrailing && awayMot >= 6) lambda *= 1.30;
  else if (awayTrailing && awayMot <= 4) lambda *= 1.10;

  // Low motivation leading team = conserving energy (Caley 2025)
  if (!homeTrailing && !bothDrawing && homeMot <= 4) lambda *= 0.65;
  if (!awayTrailing && !bothDrawing && awayMot <= 4) lambda *= 0.65;

  // Both high motivation + draw = both going for it
  if (bothDrawing && homeMot >= 8 && awayMot >= 8) lambda *= 1.35;
  // Both low motivation + draw = happy with point, game stagnates
  else if (bothDrawing && homeMot <= 4 && awayMot <= 4) lambda *= 0.75;

  // Defending team with low motivation = more porous defense (Caley 2025)
  if (homeMot <= 4) lambda *= 1.15; // easier to score against them
  if (awayMot <= 4) lambda *= 1.15;

  // ── MULTIPLIER 2: RED CARD (strongest in-game signal) ──────────────────────
  // Red card increases goal rate by ~50% (Bivariate Poisson research)
  const totalRed = m.home.red_cards + m.away.red_cards;
  if (totalRed >= 1) {
    lambda *= 1.55;
    const teamWithAdvantage = m.home.red_cards > 0 ? m.away : m.home;
    bestBet = `${teamWithAdvantage.name} Next Goal`;
    betReason = "Numerical advantage after red card";
  }

  // ── MULTIPLIER 3: SHOTS ON TARGET (Anzer & Bauer xG proxy) ─────────────────
  // SOT is the strongest single proxy for xG without tracking data
  // Normalize per 90 min to get rate
  const totalSOT = m.home.shots_on_target + m.away.shots_on_target;
  const sotRate = minute > 0 ? (totalSOT / minute) * 90 : 0;
  // League average ~6 SOT/90min = neutral
  if (sotRate >= 14) lambda *= 1.45;
  else if (sotRate >= 10) lambda *= 1.25;
  else if (sotRate >= 7) lambda *= 1.10;
  else if (sotRate < 3 && minute > 20) lambda *= 0.80; // very low — sleepy game

  // ── MULTIPLIER 4: DANGEROUS ATTACKS RATE (intensity proxy) ─────────────────
  const dapm = m.dangerous_attacks_per_min || 0;
  if (dapm >= 3.0) lambda *= 1.30;
  else if (dapm >= 2.0) lambda *= 1.18;
  else if (dapm >= 1.5) lambda *= 1.08;

  // ── MULTIPLIER 5: POSSESSION DOMINANCE ─────────────────────────────────────
  // Heavy possession bias → one team creating much more
  const poss = Math.max(m.home.possession, m.away.possession);
  if (poss >= 72) { lambda *= 1.20; if (!totalRed && isDraw) bestBet = `${dominant.name} Next Goal`; }
  else if (poss >= 65) lambda *= 1.10;

  // ── MULTIPLIER 6: CORNERS (Bivariate Poisson — Ley et al.) ─────────────────
  // Corner rate is statistically significant in scoring intensity models
  const totalCorners = m.home.corners + m.away.corners;
  const cornerRate = minute > 0 ? (totalCorners / minute) * 90 : 0;
  if (cornerRate >= 14) lambda *= 1.18;
  else if (cornerRate >= 9) lambda *= 1.08;

  // ── MULTIPLIER 7: YELLOW CARDS (tension/foul pressure) ─────────────────────
  const totalYellow = m.home.yellow_cards + m.away.yellow_cards;
  if (totalYellow >= 6) lambda *= 1.10;
  else if (totalYellow >= 4) lambda *= 1.05;

  // ── MULTIPLIER 8: VILA WINDOW BONUS ────────────────────────────────────────
  // End-of-half push — empirically +25–40% goal rate in 35-45′ & 80-93′
  if (bd.vila_effect >= 20) lambda *= 1.35;
  else if (bd.vila_effect > 0) lambda *= 1.18;

  // ── POISSON: P(≥1 goal in timeLeft minutes) ────────────────────────────────
  // P(X≥1) = 1 - P(X=0) = 1 - e^(-lambda * timeLeft)
  // This is the scientifically correct conversion from rate to probability
  const expectedGoals = lambda * timeLeft;
  const probAtLeastOneGoal = 1 - Math.exp(-expectedGoals);

  // ── SCALE TO 1–10 ──────────────────────────────────────────────────────────
  // 0% → 1, 100% → 10, calibrated so:
  // P=0.50 (50%) → ~5.5, P=0.75 (75%) → ~7.8, P=0.90 (90%) → ~9.1
  const rawScore = Math.max(1, 1 + (probAtLeastOneGoal * 9));
  const final = Math.min(10, Math.max(1, Math.round(rawScore * 10) / 10));
  const rounded = Math.round(final);

  // Early game penalty — before min 20 with no red card, confidence is low
  const displayScore = (minute < 20 && !totalRed) ? Math.min(final, 4) : final;
  const displayRounded = Math.round(displayScore);

  const color = displayRounded >= 8 ? "#c62828"
    : displayRounded >= 6 ? "#e53935"
    : displayRounded >= 5 ? "#f57c00"
    : displayRounded >= 3 ? "#f9a825"
    : "#aaa";

  const label = displayRounded >= 9 ? "BET NOW"
    : displayRounded >= 7 ? "STRONG"
    : displayRounded >= 5 ? "FAIR"
    : displayRounded >= 3 ? "WEAK"
    : "SKIP";

  const reasons = [];
  if (betReason) reasons.push(betReason);
  if (totalRed >= 1) reasons.push("Red card: +55% goal rate");
  if (sotRate >= 10) reasons.push(`High SOT rate: ${sotRate.toFixed(1)}/90`);
  if (bd.vila_effect >= 20) reasons.push("Vila window: +35% goal rate");
  if (dapm >= 2) reasons.push(`Attack rate: ${dapm.toFixed(1)}/min`);

  return {
    score: displayScore,
    rounded: displayRounded,
    label,
    color,
    bet: bestBet,
    halfLabel,
    timeLeft,
    probPct: Math.round(probAtLeastOneGoal * 100),
    reasons: reasons.slice(0, 3),
  };
}

// ─── MATCH ROW ────────────────────────────────────────────────────────────────
function MatchRow({ m, expanded, onToggle, isFav, onFavToggle, isFanduel, onFanduelToggle }) {
  const s = m.heat_score;
  const color = heatColor(s);
  const isVila = (m.minute >= 35 && m.minute <= 45) || (m.minute >= 80 && m.minute <= 93);
  const homeWin = m.home.goals > m.away.goals;
  const awayWin = m.away.goals > m.home.goals;

  // Build up to 5 bet signals from match data
  const signals = [];
  const bd = m.breakdown || {};
  const triggers = bd.triggers || [];
  const diff = Math.abs(m.home.goals - m.away.goals);
  const isDraw = diff === 0;
  const dominant = m.home.possession > m.away.possession ? m.home : m.away;
  const recessive = dominant === m.home ? m.away : m.home;

  if (bd.vila_effect > 0)
    signals.push({ icon: "⏱️", text: "Vila Window", bet: "Over 0.5", color: "#f9a825" });
  if (bd.red_card_multiplier > 0)
    signals.push({ icon: "🟥", text: "Red Card", bet: recessive.red_cards > 0 ? `${dominant.name} Next Goal` : `${recessive.name} Next Goal`, color: "#e53935" });
  if (isDraw && m.minute > 60)
    signals.push({ icon: "⚡", text: "Late Draw", bet: "Over 0.5", color: "#7b1fa2" });
  if (dominant.possession >= 65)
    signals.push({ icon: "🔵", text: `${dominant.name} pressing`, bet: `${dominant.name} Next Goal`, color: "#1565c0" });
  if ((m.home.goals + m.away.goals) >= 3)
    signals.push({ icon: "🔥", text: "High Scoring", bet: "Over 0.5", color: "#e53935" });
  if (diff === 1 && m.minute > 70)
    signals.push({ icon: "📈", text: "1 Goal Late", bet: "Over 0.5", color: "#2e7d32" });
  if (m.dangerous_attacks_per_min >= 1.5)
    signals.push({ icon: "⚡", text: "High Attacks", bet: "Over 0.5", color: "#f57c00" });

  const topSignals = signals.slice(0, 5);

  return (
    <div style={{ borderBottom: "1px solid #f0f0f0" }}>
      <div onClick={onToggle} style={{
        display: "flex", alignItems: "flex-start", padding: "10px 10px 10px 14px",
        cursor: "pointer", background: expanded ? "#fafafa" : m.status === "FT" ? "#f9f9f9" : "#fff",
        transition: "background .15s", gap: 8, opacity: m.status === "FT" ? 0.75 : 1,
      }}>

        {/* Minute / Kickoff */}
        <div style={{ width: 44, flexShrink: 0, textAlign: "center", paddingTop: 2 }}>
          {m.status === "NS" ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#1565c0", fontFamily: "monospace", lineHeight: 1.2 }}>{m.kickoff_display}</div>
              <div style={{ fontSize: 8, color: "#1565c0", fontWeight: 600, marginTop: 2 }}>{m.time_until}</div>
            </>
          ) : m.status === "HT" ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#7b1fa2", fontFamily: "monospace", lineHeight: 1.2 }}>HT</div>
              <div style={{ fontSize: 8, color: "#7b1fa2", fontWeight: 600, marginTop: 2 }}>45′</div>
            </>
          ) : m.status === "FT" ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#388e3c", fontFamily: "monospace", lineHeight: 1.2 }}>FT</div>
              <div style={{ fontSize: 8, color: "#388e3c", fontWeight: 600, marginTop: 2 }}>90′</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#e53935", fontFamily: "monospace", lineHeight: 1.2 }}>
                {m.minute}′
              </div>
              {isVila && <div style={{ fontSize: 8, color: "#f9a825", fontWeight: 700, marginTop: 2 }}>VILA</div>}
            </>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: 1, alignSelf: "stretch", background: "#f0f0f0", flexShrink: 0 }} />

        {/* Teams + Scores + Motivation — col 1 */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* ── HOME TEAM ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, flex: 1 }}>
              {m.home.logo
                ? <img src={m.home.logo} width="14" height="14" style={{ borderRadius: 2, flexShrink: 0 }} alt="" onError={e => e.target.style.display = "none"} />
                : <div style={{ width: 14, height: 14, background: "#e8e8e8", borderRadius: 2, flexShrink: 0 }} />
              }
              <span style={{ fontSize: 12, color: homeWin ? "#111" : "#555", fontWeight: homeWin ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.home.name}
              </span>
              {m.home.red_cards > 0 && <span style={{ fontSize: 7, background: "#e53935", color: "#fff", borderRadius: 2, padding: "1px 3px", flexShrink: 0, fontWeight: 700 }}>RC</span>}
              {isVila && m.home.vila?.isVilaTeam && (
                <span style={{ fontSize: 7, borderRadius: 3, padding: "1px 4px", flexShrink: 0, fontWeight: 700, background: m.home.vila.isStrongVila ? "#f9a825" : "#fff3e0", color: m.home.vila.isStrongVila ? "#fff" : "#f57c00", border: `1px solid ${m.home.vila.isStrongVila ? "#f9a825" : "#ffe082"}` }}>
                  ⏱{m.home.vila.lateGoalRate}%
                </span>
              )}
            </div>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#111", marginLeft: 6, flexShrink: 0 }}>{m.home.goals}</span>
          </div>


          {/* Away row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, flex: 1 }}>
              {m.away.logo
                ? <img src={m.away.logo} width="15" height="15" style={{ borderRadius: 2, flexShrink: 0 }} alt="" onError={e => e.target.style.display = "none"} />
                : <div style={{ width: 15, height: 15, background: "#e8e8e8", borderRadius: 2, flexShrink: 0 }} />
              }
              <span style={{ fontSize: 12, color: awayWin ? "#111" : "#555", fontWeight: awayWin ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.away.name}
              </span>
              {m.away.red_cards > 0 && <span style={{ fontSize: 7, background: "#e53935", color: "#fff", borderRadius: 2, padding: "1px 3px", flexShrink: 0, fontWeight: 700 }}>RC</span>}
              {isVila && m.away.vila?.isVilaTeam && (
                <span style={{ fontSize: 7, borderRadius: 3, padding: "1px 4px", flexShrink: 0, fontWeight: 700, background: m.away.vila.isStrongVila ? "#f9a825" : "#fff3e0", color: m.away.vila.isStrongVila ? "#fff" : "#f57c00", border: `1px solid ${m.away.vila.isStrongVila ? "#f9a825" : "#ffe082"}` }}>
                  ⏱{m.away.vila.lateGoalRate}%
                </span>
              )}
            </div>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#111", marginLeft: 6, flexShrink: 0 }}>{m.away.goals}</span>
          </div>


                {(() => {
                  const hg = m.home.goals || 0;
                  const ag = m.away.goals || 0;
                  const isTrailing = ag < hg;
                  const isLeading = ag > hg;
                  const isDraw = hg === ag;
                  const late = m.minute >= 70;
                  const veryLate = m.minute >= 80;

                  let prominent = null;
                  if (tag) {
                    prominent = { text: tag.text, color: tag.color };
                  } else if (isTrailing && veryLate) {
                    prominent = { text: "🚨 MUST WIN", color: "#c62828" };
                  } else if (isTrailing && late) {
                    prominent = { text: "⚡ MUST SCORE", color: "#e53935" };
                  } else if (isTrailing) {
                    prominent = { text: "⚡ Chasing", color: "#f57c00" };
                  } else if (isLeading && score <= 4 && veryLate) {
                    prominent = { text: "🛡️ SAFE", color: "#2e7d32" };
                  } else if (isLeading && score <= 4) {
                    prominent = { text: "🛡️ Protecting", color: "#388e3c" };
                  } else if (isDraw && veryLate) {
                    prominent = { text: "🔥 MUST SCORE", color: "#7b1fa2" };
                  } else if (isDraw && late) {
                    prominent = { text: "⚡ Pushing", color: "#f57c00" };
                  } else {
                    prominent = { text: label, color: "#999" };
                  }

                  return (
                    <span style={{ fontSize: 8, borderRadius: 10, padding: "2px 7px", fontWeight: 700, background: `${prominent.color}18`, color: prominent.color, border: `1px solid ${prominent.color}44`, whiteSpace: "nowrap", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {prominent.text}
                    </span>
                  );

        </div>

        {/* Divider */}
        <div style={{ width: 1, alignSelf: "stretch", background: "#f0f0f0", flexShrink: 0 }} />

        {/* Signals column — col 2 */}
        <div style={{ width: 95, flexShrink: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          {topSignals.length === 0 ? (
            <div style={{ fontSize: 9, color: "#ccc", fontStyle: "italic", marginTop: 4 }}>No signals</div>
          ) : topSignals.map((sig, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", background: `${sig.color}0d`, border: `1px solid ${sig.color}33`, borderRadius: 4, padding: "2px 5px" }}>
              <div style={{ fontSize: 9, color: sig.color, fontWeight: 700 }}>{sig.icon} {sig.text}</div>
              <div style={{ fontSize: 8, color: "#888", fontWeight: 600 }}>→ {sig.bet}</div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ width: 1, alignSelf: "stretch", background: "#f0f0f0", flexShrink: 0 }} />

        {/* Goal Probability — col 3 */}
        {(() => {
          const gp = calcGoalProb(m);
          const bars = [1,2,3,4,5,6,7,8,9,10];
          return (
            <div style={{ width: 68, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, paddingTop: 2 }}>
              {/* Score display */}
              <div style={{ fontSize: 18, fontWeight: 900, color: gp.color, fontFamily: "monospace", lineHeight: 1 }}>
                {gp.score > 0 ? gp.score.toFixed(1) : "—"}
              </div>
              <div style={{ fontSize: 7, fontWeight: 800, color: gp.color, letterSpacing: "0.04em" }}>{gp.label}</div>
              {/* Bar chart */}
              <div style={{ display: "flex", gap: 1.5, alignItems: "flex-end", height: 18, marginTop: 2 }}>
                {bars.map(b => (
                  <div key={b} style={{
                    width: 4, borderRadius: 1,
                    height: `${(b / 10) * 18}px`,
                    background: b <= gp.rounded ? gp.color : "#f0f0f0",
                    transition: "background .3s",
                  }} />
                ))}
              </div>
              {/* Probability % */}
              {gp.probPct > 0 && (
                <div style={{ fontSize: 8, color: gp.color, fontWeight: 700, fontFamily: "monospace" }}>
                  {gp.probPct}%
                </div>
              )}
              {/* Best bet */}
              {gp.bet && gp.rounded >= 5 && (
                <div style={{ fontSize: 7, color: "#888", textAlign: "center", lineHeight: 1.3, maxWidth: 66 }}>
                  {gp.bet}
                </div>
              )}
              {/* Time label */}
              {gp.timeLeft > 0 && (
                <div style={{ fontSize: 7, color: "#bbb", fontFamily: "monospace" }}>
                  {gp.timeLeft}′ to {gp.halfLabel}
                </div>
              )}
            </div>
          );
        })()}

        {/* Divider */}
        <div style={{ width: 1, alignSelf: "stretch", background: "#f0f0f0", flexShrink: 0 }} />

        {/* Heat + star + FD — col 4 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            border: `2.5px solid ${color}`,
            background: `${color}12`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 10, fontWeight: 800, color, fontFamily: "monospace" }}>{s}</span>
          </div>
          <button onClick={e => { e.stopPropagation(); onFavToggle(m.fixture_id); }} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 14, color: isFav ? "#f9a825" : "#ccc",
            padding: 0, lineHeight: 1,
          }}>★</button>
          <button onClick={e => { e.stopPropagation(); onFanduelToggle && onFanduelToggle(m.fixture_id); }} style={{
            background: isFanduel ? "#e8f5e9" : "none",
            border: isFanduel ? "1px solid #a5d6a7" : "1px solid #e0e0e0",
            borderRadius: 4, cursor: "pointer",
            fontSize: 8, fontWeight: 700,
            color: isFanduel ? "#2e7d32" : "#ccc",
            padding: "2px 4px", lineHeight: 1.2,
          }}>FD</button>
        </div>
      </div>

      {/* ── MOTIVATION — simple visible row ── */}
      {m.status !== "NS" && m.status !== "FT" && (() => {
        const getLabel = (goals, opp, minute, mot) => {
          const late = minute >= 70, veryLate = minute >= 80;
          const trailing = goals < opp, leading = goals > opp, drawing = goals === opp;
          if (mot?.tag) return { text: mot.tag.text, color: mot.tag.color };
          if (trailing && veryLate) return { text: "🚨 MUST WIN", color: "#c62828" };
          if (trailing && late)     return { text: "⚡ MUST SCORE", color: "#e53935" };
          if (trailing)             return { text: "⚡ Chasing", color: "#f57c00" };
          if (leading && veryLate)  return { text: "🛡️ SAFE", color: "#2e7d32" };
          if (leading)              return { text: "🛡️ Protecting", color: "#388e3c" };
          if (drawing && veryLate)  return { text: "🔥 MUST SCORE", color: "#6a1b9a" };
          if (drawing && late)      return { text: "⚡ Pushing", color: "#f57c00" };
          return { text: "In play", color: "#aaa" };
        };
        const hLabel = getLabel(m.home.goals, m.away.goals, m.minute, m.home.motivation);
        const aLabel = getLabel(m.away.goals, m.home.goals, m.minute, m.away.motivation);
        const hScore = Math.min(10, Math.max(1, m.home.motivation?.score ??
          (m.home.goals < m.away.goals ? (m.minute >= 80 ? 9.5 : 7) : m.home.goals > m.away.goals ? (m.minute >= 80 ? 3 : 5) : (m.minute >= 80 ? 8.5 : 5.5))));
        const aScore = Math.min(10, Math.max(1, m.away.motivation?.score ??
          (m.away.goals < m.home.goals ? (m.minute >= 80 ? 9.5 : 7) : m.away.goals > m.home.goals ? (m.minute >= 80 ? 3 : 5) : (m.minute >= 80 ? 8.5 : 5.5))));
        const hColor = hScore >= 8 ? "#d32f2f" : hScore >= 6 ? "#e65100" : hScore >= 5 ? "#1565c0" : "#757575";
        const aColor = aScore >= 8 ? "#d32f2f" : aScore >= 6 ? "#e65100" : aScore >= 5 ? "#1565c0" : "#757575";
        return (
          <div style={{ margin: "2px 14px 10px", padding: "8px 10px", background: "#f8f8f8", borderRadius: 8, border: "1px solid #eee" }}>
            <div style={{ fontSize: 9, color: "#bbb", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 6 }}>🧠 MOTIVATION</div>
            {/* Home */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <span style={{ fontSize: 10, color: "#666", width: 85, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.home.name}</span>
              <div style={{ flex: 1, height: 8, background: "#ddd", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${Math.round((hScore/10)*100)}%`, height: "100%", background: hColor, borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, color: hColor, width: 16, textAlign: "right", fontFamily: "monospace" }}>{Math.round(hScore)}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: hLabel.color, background: hLabel.color + "18", border: "1px solid " + hLabel.color + "55", borderRadius: 8, padding: "2px 6px", whiteSpace: "nowrap", flexShrink: 0 }}>{hLabel.text}</span>
            </div>
            {/* Away */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "#666", width: 85, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.away.name}</span>
              <div style={{ flex: 1, height: 8, background: "#ddd", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${Math.round((aScore/10)*100)}%`, height: "100%", background: aColor, borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, color: aColor, width: 16, textAlign: "right", fontFamily: "monospace" }}>{Math.round(aScore)}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: aLabel.color, background: aLabel.color + "18", border: "1px solid " + aLabel.color + "55", borderRadius: 8, padding: "2px 6px", whiteSpace: "nowrap", flexShrink: 0 }}>{aLabel.text}</span>
            </div>
          </div>
        );
      })()}

      {expanded && <MatchDetail m={m} />}
    </div>
  );
}

// ─── LEAGUE HEADER ────────────────────────────────────────────────────────────
function LeagueHeader({ label, topHeat }) {
  const color = heatColor(topHeat);
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "7px 14px", background: "#f5f5f5",
      borderBottom: "1px solid #e8e8e8", borderTop: "1px solid #e8e8e8",
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#666", letterSpacing: "0.03em" }}>{label}</span>
      {topHeat >= 40 && (
        <span style={{
          fontSize: 10, fontWeight: 700, color,
          background: `${color}15`, border: `1px solid ${color}44`,
          borderRadius: 4, padding: "2px 7px", fontFamily: "monospace",
        }}>
          {topHeat >= 80 ? "🔥" : topHeat >= 60 ? "🟠" : "🟡"} {topHeat}
        </span>
      )}
    </div>
  );
}

// ─── ALERT PANEL ──────────────────────────────────────────────────────────────
function AlertPanel({ threshold, onChange, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#00000066", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: 320, boxShadow: "0 8px 32px #0002" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#111", marginBottom: 6 }}>🔔 Alert Threshold</div>
        <div style={{ fontSize: 12, color: "#aaa", marginBottom: 20 }}>Notify when Heat Score ≥</div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: "#888" }}>Threshold</span>
          <span style={{ fontSize: 22, fontWeight: 800, fontFamily: "monospace", color: heatColor(threshold) }}>{threshold}</span>
        </div>
        <input type="range" min="40" max="95" step="5" value={threshold} onChange={e => onChange(Number(e.target.value))} style={{ width: "100%", accentColor: "#e53935", cursor: "pointer" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#ccc", marginTop: 4, marginBottom: 16 }}>
          <span>40</span><span>60</span><span>80</span><span>95</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[60, 70, 80].map(v => (
            <button key={v} onClick={() => onChange(v)} style={{
              padding: "10px 0", borderRadius: 8, cursor: "pointer",
              border: threshold === v ? "2px solid #e53935" : "1px solid #eee",
              background: threshold === v ? "#fdecea" : "#fafafa",
              color: threshold === v ? "#e53935" : "#888",
              fontSize: 14, fontWeight: 700,
            }}>{v}</button>
          ))}
        </div>
        <button onClick={onClose} style={{ width: "100%", padding: "11px 0", borderRadius: 8, background: "#f5f5f5", border: "none", color: "#888", fontSize: 13, cursor: "pointer" }}>Done</button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [filterLive, setFilterLive] = useState(false);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH);
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [favourites, setFavourites] = useState(new Set());
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [fanduelGames, setFanduelGames] = useState(new Set());
  const [showFanduelOnly, setShowFanduelOnly] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState(80);
  const [showAlertPanel, setShowAlertPanel] = useState(false);
  const [alertFired, setAlertFired] = useState(new Set());
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(API_URL);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      if (!json.matches || json.matches.length === 0) {
        setIsDemo(true);
        setMatches(DEMO.map(m => ({ ...m, timeline: [m.heat_score] })));
        setError("no_matches");
      } else {
        setIsDemo(false);
        setMatches(prev =>
          json.matches.map(m => {
            const old = prev.find(p => p.fixture_id === m.fixture_id);
            const timeline = old ? [...old.timeline, m.heat_score].slice(-20) : [m.heat_score];
            return { ...m, timeline };
          }).sort((a, b) => b.heat_score - a.heat_score)
        );
      }
    } catch {
      setIsDemo(true);
      setMatches(DEMO.map(m => ({ ...m, timeline: [m.heat_score] })));
      setError("api_error");
    } finally {
      setLoading(false);
      setCountdown(REFRESH);
      setTick(t => t + 1);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown(c => { if (c <= 1) { load(); return REFRESH; } return c - 1; });
    }, 1000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    matches.forEach(m => {
      if (m.heat_score >= alertThreshold && !alertFired.has(m.fixture_id)) {
        if (Notification.permission === "granted")
          new Notification(`🔔 Heat Alert ≥${alertThreshold}`, { body: `${m.home.name} vs ${m.away.name} — ${m.heat_score} pts (${m.minute}′)` });
        setAlertFired(prev => new Set([...prev, m.fixture_id]));
      }
    });
  }, [matches, alertThreshold, alertFired]);

  const toggleFav = id => setFavourites(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleFanduel = id => setFanduelGames(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  let displayed = [...matches];
  if (filterLive) displayed = displayed.filter(m => m.status !== "NS" && m.status !== "FT");
  if (showFavsOnly) displayed = displayed.filter(m => favourites.has(m.fixture_id));
  if (showFanduelOnly) displayed = displayed.filter(m => fanduelGames.has(m.fixture_id));
  if (filter === "EXTREME") displayed = displayed.filter(m => m.heat_score >= 80);
  else if (filter === "HIGH") displayed = displayed.filter(m => m.heat_score >= 60 && m.heat_score < 80);
  else if (filter === "OTHER") displayed = displayed.filter(m => m.heat_score < 60);

  const groups = groupByLeague(displayed);
  const extremeCount = matches.filter(m => m.heat_score >= 80).length;

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", color: "#111", fontFamily: "'Segoe UI', system-ui, sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes spin { to { transform: rotate(360deg) } }
        body { background: #f5f5f5; }
      `}</style>

      {showAlertPanel && <AlertPanel threshold={alertThreshold} onChange={setAlertThreshold} onClose={() => setShowAlertPanel(false)} />}

      {/* ── HEADER ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "#fff", boxShadow: "0 1px 4px #0000000f" }}>

        {/* Title bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #f0f0f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22 }}>⚽</span>
            <span style={{ fontSize: 17, fontWeight: 800, color: "#111", letterSpacing: "-0.02em" }}>
              Momentum<span style={{ color: "#e53935" }}>Track</span>
            </span>
            {extremeCount > 0 && (
              <span style={{ fontSize: 10, background: "#e53935", color: "#fff", borderRadius: 10, padding: "2px 8px", fontWeight: 700, animation: "blink 1.5s infinite" }}>
                {extremeCount} 🔥
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ display: "flex", background: "#f0f0f0", borderRadius: 20, padding: 2, gap: 1 }}>
              <button onClick={() => setFilterLive(false)} style={{
                padding: "4px 10px", borderRadius: 18, border: "none", cursor: "pointer",
                fontSize: 11, fontWeight: 700,
                background: !filterLive ? "#1565c0" : "transparent",
                color: !filterLive ? "#fff" : "#aaa",
                transition: "all .2s",
              }}>ALL</button>
              <button onClick={() => setFilterLive(true)} style={{
                padding: "4px 10px", borderRadius: 18, border: "none", cursor: "pointer",
                fontSize: 11, fontWeight: 700,
                background: filterLive ? "#e53935" : "transparent",
                color: filterLive ? "#fff" : "#aaa",
                transition: "all .2s",
              }}>● LIVE</button>
            </div>
            <button onClick={() => setShowFavsOnly(f => !f)} style={{
              background: showFavsOnly ? "#fff8e1" : "#fafafa",
              border: `1px solid ${showFavsOnly ? "#f9a82566" : "#e0e0e0"}`,
              borderRadius: 6, padding: "4px 9px", cursor: "pointer",
              fontSize: 13, color: showFavsOnly ? "#f9a825" : "#aaa",
            }}>★{favourites.size > 0 && ` ${favourites.size}`}</button>
            <button onClick={() => setShowFanduelOnly(f => !f)} style={{
              background: showFanduelOnly ? "#e8f5e9" : "#fafafa",
              border: `1px solid ${showFanduelOnly ? "#43a04766" : "#e0e0e0"}`,
              borderRadius: 6, padding: "4px 9px", cursor: "pointer",
              fontSize: 11, fontWeight: 700,
              color: showFanduelOnly ? "#2e7d32" : "#aaa",
              letterSpacing: "0.02em",
            }}>🟢 FD{fanduelGames.size > 0 ? ` ${fanduelGames.size}` : ""}{showFanduelOnly ? " ✓" : ""}</button>
            <button onClick={() => setShowAlertPanel(true)} style={{ background: "#fafafa", border: "1px solid #e0e0e0", borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontSize: 13, color: "#aaa" }}>🔔</button>
            <button onClick={load} style={{
              background: "#fafafa", border: "1px solid #e0e0e0", borderRadius: 6,
              padding: "4px 9px", cursor: "pointer", fontSize: 12,
              color: countdown < 10 ? "#f57c00" : "#aaa",
              fontFamily: "monospace", display: "flex", alignItems: "center", gap: 4,
            }}>
              {loading
                ? <span style={{ display: "inline-block", width: 10, height: 10, border: "2px solid #e53935", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
                : "↻"
              } {countdown}s
            </button>
          </div>
        </div>

        {/* Error banners */}
        {error === "no_matches" && (
          <div style={{ padding: "6px 14px", background: "#fffde7", borderBottom: "1px solid #fff9c4", fontSize: 11, color: "#f57f17" }}>
            ⚽ No live matches right now — showing demo data
          </div>
        )}
        {error === "api_error" && (
          <div style={{ padding: "6px 14px", background: "#ffebee", borderBottom: "1px solid #ffcdd2", fontSize: 11, color: "#c62828" }}>
            ⚠️ API error — check APISPORTS_KEY in Vercel env vars
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #f0f0f0" }}>
          {[
            { key: "ALL", label: `All ${matches.length}` },
            { key: "EXTREME", label: `🔥 ${matches.filter(m => m.heat_score >= 80).length}` },
            { key: "HIGH", label: `🟠 ${matches.filter(m => m.heat_score >= 60 && m.heat_score < 80).length}` },
            { key: "OTHER", label: "Low" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)} style={{
              flex: 1, padding: "10px 4px", border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: filter === key ? 700 : 400,
              background: "#fff",
              color: filter === key ? "#e53935" : "#aaa",
              borderBottom: filter === key ? "2px solid #e53935" : "2px solid transparent",
              transition: "all .15s",
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── MATCH LIST ── */}
      {loading && matches.length === 0 ? (
        <div style={{ textAlign: "center", color: "#ccc", padding: "60px 0" }}>
          <div style={{ display: "inline-block", width: 28, height: 28, border: "3px solid #e53935", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .8s linear infinite", marginBottom: 12 }} />
          <div style={{ fontSize: 13 }}>Loading live matches…</div>
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ textAlign: "center", color: "#ccc", padding: "60px 0", fontSize: 13 }}>
          {showFavsOnly ? "No favourites yet — tap ★ on a match." : "No matches in this category."}
        </div>
      ) : (
        <div style={{ background: "#fff", marginTop: 8 }}>

          {/* FAVOURITES GROUP — pinned at top when any starred */}
          {favourites.size > 0 && (() => {
            const favMatches = matches.filter(m => favourites.has(m.fixture_id)).sort((a, b) => b.heat_score - a.heat_score);
            if (favMatches.length === 0) return null;
            const topHeat = Math.max(...favMatches.map(m => m.heat_score));
            return (
              <div style={{ borderBottom: "3px solid #f9a825", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "linear-gradient(90deg,#fff8e1,#fff)", borderBottom: "1px solid #ffe082", borderTop: "1px solid #ffe082" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: 15, color: "#f9a825" }}>★</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#f57f17", letterSpacing: "0.03em" }}>MY WATCHLIST</span>
                    <span style={{ fontSize: 10, background: "#f9a825", color: "#fff", borderRadius: 10, padding: "1px 7px", fontWeight: 700 }}>{favMatches.length}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#f57c00", fontFamily: "monospace", background: "#fff8e1", border: "1px solid #ffe08266", borderRadius: 4, padding: "2px 7px" }}>
                    TOP {topHeat}
                  </span>
                </div>
                {favMatches.map(m => (
                  <MatchRow
                    key={"fav-" + m.fixture_id}
                    m={m}
                    expanded={expanded === "fav-" + m.fixture_id}
                    onToggle={() => setExpanded(expanded === "fav-" + m.fixture_id ? null : "fav-" + m.fixture_id)}
                    isFav={true}
                    onFavToggle={toggleFav}
                    isFanduel={fanduelGames.has(m.fixture_id)}
                    onFanduelToggle={toggleFanduel}
                  />
                ))}
              </div>
            );
          })()}

          {/* FANDUEL LIVE GROUP */}
          {fanduelGames.size > 0 && (() => {
            const fdMatches = matches.filter(m => fanduelGames.has(m.fixture_id)).sort((a, b) => b.heat_score - a.heat_score);
            if (fdMatches.length === 0) return null;
            const topHeat = Math.max(...fdMatches.map(m => m.heat_score));
            return (
              <div style={{ borderBottom: "3px solid #43a047", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "linear-gradient(90deg,#e8f5e9,#fff)", borderBottom: "1px solid #a5d6a7", borderTop: "1px solid #a5d6a7" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: 14 }}>🟢</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#2e7d32", letterSpacing: "0.03em" }}>FANDUEL LIVE</span>
                    <span style={{ fontSize: 10, background: "#43a047", color: "#fff", borderRadius: 10, padding: "1px 7px", fontWeight: 700 }}>{fdMatches.length}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#2e7d32", fontFamily: "monospace", background: "#e8f5e9", border: "1px solid #a5d6a766", borderRadius: 4, padding: "2px 7px" }}>
                    TOP {topHeat}
                  </span>
                </div>
                {fdMatches.map(m => (
                  <MatchRow
                    key={"fd-" + m.fixture_id}
                    m={m}
                    expanded={expanded === "fd-" + m.fixture_id}
                    onToggle={() => setExpanded(expanded === "fd-" + m.fixture_id ? null : "fd-" + m.fixture_id)}
                    isFav={favourites.has(m.fixture_id)}
                    onFavToggle={toggleFav}
                    isFanduel={true}
                    onFanduelToggle={toggleFanduel}
                  />
                ))}
              </div>
            );
          })()}

          {/* LEAGUE GROUPS */}
          {groups.map(group => (
            <div key={group.label}>
              <LeagueHeader label={group.label} topHeat={Math.max(...group.matches.map(m => m.heat_score))} />
              {group.matches.map(m => (
                <MatchRow
                  key={m.fixture_id}
                  m={m}
                  expanded={expanded === m.fixture_id}
                  onToggle={() => setExpanded(expanded === m.fixture_id ? null : m.fixture_id)}
                  isFav={favourites.has(m.fixture_id)}
                  onFavToggle={toggleFav}
                  isFanduel={fanduelGames.has(m.fixture_id)}
                  onFanduelToggle={toggleFanduel}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 40 }} />
    </div>
  );
}
