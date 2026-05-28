import { useState, useEffect, useCallback, useRef } from "react";

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

// ─── TOOLTIP ──────────────────────────────────────────────────────────────────
function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const handleMove = e => setPos({ x: e.clientX, y: e.clientY });
  if (!text) return children;
  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onMouseMove={handleMove}
    >
      {children}
      {visible && (
        <span style={{
          position: "fixed",
          left: pos.x + 12,
          top: pos.y - 36,
          zIndex: 9999,
          background: "#1a1a1a",
          color: "#fff",
          fontSize: 15,
          fontWeight: 500,
          padding: "5px 10px",
          borderRadius: 6,
          whiteSpace: "nowrap",
          boxShadow: "0 2px 8px #0004",
          pointerEvents: "none",
          border: "1.5px solid #333",
          maxWidth: 260,
          lineHeight: 1.5,
        }}>{text}</span>
      )}
    </span>
  );
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
      <div style={{ fontSize: 14, fontWeight: 700, color: "#555", marginBottom: 6, textAlign: "center", lineHeight: 1.5 }}>
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
        fontSize: 13, fontWeight: 800, color,
        letterSpacing: "0.05em", marginTop: 2, textAlign: "center",
      }}>{mot.label?.toUpperCase()}</div>

      {/* Standing tag */}
      {mot.tag && (
        <div style={{
          marginTop: 5, fontSize: 12, fontWeight: 700,
          background: `${mot.tag.color}15`,
          color: mot.tag.color,
          border: `1px solid ${mot.tag.color}33`,
          borderRadius: 20, padding: "5px 10px",
          textAlign: "center",
        }}>{mot.tag.text}</div>
      )}

      {/* Rank */}
      {mot.rank && (
        <div style={{ fontSize: 12, color: "#555", marginTop: 4, fontFamily: "monospace" }}>
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
    <div style={{ background: "#f9f9f9", padding: "12px 14px 14px", borderTop: "1.5px solid #eee" }}>

      {/* ── MOTIVATION INDEX PANEL ── */}
      {hasMot && (
        <div style={{ marginBottom: 14 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, #e0e0e0)" }} />
            <div style={{ fontSize: 13, fontWeight: 800, color: "#555", letterSpacing: "0.12em", whiteSpace: "nowrap" }}>
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
              <div style={{ fontSize: 13, fontWeight: 800, color: "#666" }}>VS</div>
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
                <div style={{ fontSize: 15, color: insight.color, lineHeight: 1.5 }}>{insight.text}</div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── HEAT SCORE BAR ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#555", letterSpacing: "0.1em", minWidth: 68 }}>HEAT SCORE</div>
        <div style={{ flex: 1, height: 6, background: "#e8e8e8", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${m.heat_score}%`, height: "100%", background: `linear-gradient(90deg, ${heatColor(m.heat_score)}99, ${heatColor(m.heat_score)})`, borderRadius: 3, transition: "width .6s ease" }} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: heatColor(m.heat_score), fontFamily: "monospace", minWidth: 24, textAlign: "right" }}>{m.heat_score}</div>
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
              <div style={{ fontSize: 16, marginBottom: 3 }}>{icon}</div>
              <div style={{ fontSize: 12, color: "#555", marginBottom: 4, letterSpacing: "0.05em" }}>{label.toUpperCase()}</div>
              <div style={{ height: 3, background: "#f0f0f0", borderRadius: 2, marginBottom: 4 }}>
                <div style={{ width: `${(val / max) * 100}%`, height: "100%", background: color, borderRadius: 2, transition: "width .6s" }} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: val > 0 ? color : "#ccc" }}>{val}<span style={{ fontSize: 13, fontWeight: 400, color: "#777" }}>/{max}</span></div>
            </div>
          ))}
        </div>
      )}

      {/* ── STATS GRID ── */}
      {hasStats && (
        <div style={{ background: "#fff", borderRadius: 8, border: "1.5px solid #eee", overflow: "hidden", marginBottom: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", padding: "6px 12px", background: "#f5f5f5", borderBottom: "1.5px solid #eee" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#555", textAlign: "right" }}>{m.home.name}</div>
            <div style={{ fontSize: 14, color: "#666", textAlign: "center", padding: "0 10px" }}>STATS</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#555" }}>{m.away.name}</div>
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
              <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", padding: "9px 14px", background: i % 2 === 0 ? "#fff" : "#fafafa", borderBottom: i < 5 ? "1.5px solid #f0f0f0" : "none", alignItems: "center" }}>
                <div style={{ fontSize: 16, color: homeWins ? "#111" : "#888", textAlign: "right", fontWeight: homeWins ? 700 : 400 }}>{hv}</div>
                <div style={{ fontSize: 14, color: "#666", textAlign: "center", padding: "0 10px", whiteSpace: "nowrap" }}>{label}</div>
                <div style={{ fontSize: 16, color: awayWins ? "#111" : "#888", textAlign: "left", fontWeight: awayWins ? 700 : 400 }}>{av}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TRIGGERS ── */}
      {triggers.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 8, border: "1.5px solid #eee", padding: "8px 12px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#666", letterSpacing: "0.1em", marginBottom: 6 }}>SIGNALS</div>
          {triggers.map((t, i) => (
            <div key={i} style={{ fontSize: 15, color: "#777", marginBottom: i < triggers.length - 1 ? 4 : 0, paddingLeft: 4, borderLeft: "2px solid #f0f0f0" }}>{t}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SPARKLINE CHART ─────────────────────────────────────────────────────────
// Renders 90-minute momentum timeline as mini SVG sparkline
// Shows momentum score history — spike = swing moment
function Sparkline({ data = [], width = 80, height = 24, color = "#e53935" }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");
  const lastY = height - ((data[data.length-1] - min) / range) * height;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(data.length-1)/(data.length-1)*width} cy={lastY} r="2.5" fill={color} />
    </svg>
  );
}

// ─── FIELD TILT BAR ───────────────────────────────────────────────────────────
function FieldTiltBar({ tilt, homeName, awayName }) {
  if (!tilt) return null;
  const { home: hT, away: aT, strength } = tilt;
  const hColor = hT > aT ? "#1565c0" : "#e0e0e0";
  const aColor = aT > hT ? "#e53935" : "#e0e0e0";
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#888", marginBottom: 3 }}>
        <span style={{ fontWeight: hT > aT ? 700 : 400, color: hT > aT ? "#1565c0" : "#aaa" }}>{hT}%</span>
        <span style={{ fontSize: 10, color: "#bbb" }}>Field Tilt</span>
        <span style={{ fontWeight: aT > hT ? 700 : 400, color: aT > hT ? "#e53935" : "#aaa" }}>{aT}%</span>
      </div>
      <div style={{ height: 6, display: "flex", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${hT}%`, background: hColor, transition: "width .6s" }} />
        <div style={{ width: `${aT}%`, background: aColor, transition: "width .6s" }} />
      </div>
    </div>
  );
}

// ─── FIRST HALF SCORE PREDICTOR ──────────────────────────────────────────────
// Dedicated HT prediction using 1H-specific research:
// - PerformanceOdds (2026): 70%+ of 1H goals in 35-45' window
// - Late 1H goals predict Over 2.5 FT (correlated momentum signal)
// - Corners + box pressure spike in final 10 mins of 1H
// - Attack duration & possession zone > raw possession % (NCAA/FIFA 2024)

function calcHalfTimeScore(m) {
  if (m.status !== "1H") return null;
  const minute = m.minute;
  if (minute < 1) return null;

  const homeGoals = m.home.goals || 0;
  const awayGoals = m.away.goals || 0;
  const totalGoals = homeGoals + awayGoals;
  const minsToHT = Math.max(0, 45 - minute);
  const inVilaWindow = minute >= 35;

  // Base lambda for 1H: avg 1.1 goals/45min in top leagues = 0.0244/min
  let lambda = 0.0244;
  const reasons = [];

  // 1. VILA WINDOW BOOST (biggest 1H signal)
  // 70%+ of 1H goals come 35-45' (PerformanceOdds 2026)
  if (minute >= 40) {
    lambda *= 2.2;
    reasons.push(`⏱️ Peak window (${minute}′) — 70% of 1H goals here`);
  } else if (minute >= 35) {
    lambda *= 1.8;
    reasons.push(`⏱️ Vila window active — entering peak 1H period`);
  } else if (minute >= 28) {
    lambda *= 1.3;
    reasons.push(`📈 Approaching Vila window`);
  }

  // 2. CORNER RATE (box pressure proxy — strongest 1H predictor)
  const totalCorners = (m.home.corners || 0) + (m.away.corners || 0);
  const cornerRate = totalCorners / Math.max(minute, 1) * 45;
  if (cornerRate >= 8) {
    lambda *= 1.35;
    reasons.push(`🚩 High corner rate: ${totalCorners} corners (${cornerRate.toFixed(1)}/45)`);
  } else if (cornerRate >= 5) {
    lambda *= 1.15;
    reasons.push(`🚩 ${totalCorners} corners — box pressure building`);
  }

  // 3. SHOTS ON TARGET (xG proxy)
  const totalSOT = (m.home.shots_on_target || 0) + (m.away.shots_on_target || 0);
  const sotRate = totalSOT / Math.max(minute, 1) * 45;
  if (sotRate >= 8) {
    lambda *= 1.4;
    reasons.push(`🎯 High xG proxy: ${totalSOT} shots on target`);
  } else if (sotRate >= 5) {
    lambda *= 1.2;
    reasons.push(`🎯 ${totalSOT} shots on target`);
  }

  // 4. POSSESSION DOMINANCE (sustained box pressure)
  const maxPoss = Math.max(m.home.possession || 0, m.away.possession || 0);
  if (maxPoss >= 68) {
    lambda *= 1.18;
    reasons.push(`⚡ One team dominating ${maxPoss}% possession`);
  }

  // 5. DANGEROUS ATTACK RATE
  const dapm = m.dangerous_attacks_per_min || 0;
  if (dapm >= 2.0) {
    lambda *= 1.25;
    reasons.push(`💥 Very high attack rate: ${dapm.toFixed(1)}/min`);
  } else if (dapm >= 1.5) {
    lambda *= 1.12;
  }

  // 6. ALREADY SCORED — open game
  if (totalGoals >= 2) {
    lambda *= 1.3;
    reasons.push(`🔥 ${totalGoals} goals already — open game`);
  } else if (totalGoals === 1) {
    lambda *= 1.1;
  }

  // 7. SCORE STATE — trailing team pushes in 1H
  const diff = Math.abs(homeGoals - awayGoals);
  if (diff >= 2) lambda *= 0.8; // big lead = trailing team gives up in 1H
  else if (diff === 1 && minute >= 35) {
    lambda *= 1.2;
    reasons.push(`⚡ Trailing by 1 — pushing before HT`);
  }

  // Poisson: P(≥1 goal in minsToHT)
  const expectedGoals = lambda * minsToHT;
  const probGoal = minsToHT > 0 ? 1 - Math.exp(-expectedGoals) : 0;
  const probPct = Math.round(probGoal * 100);

  // Score (1-10)
  const score = Math.min(10, Math.max(1, 1 + probGoal * 9));

  // Current HT score prediction
  // Most likely HT score based on current + expected goals
  const expMoreGoals = expectedGoals;
  const htHomeGoals = homeGoals + (m.home.possession > m.away.possession ? expMoreGoals * 0.55 : expMoreGoals * 0.45);
  const htAwayGoals = awayGoals + (m.away.possession > m.home.possession ? expMoreGoals * 0.55 : expMoreGoals * 0.45);

  // Best HT bet
  let bestBet = "Over 0.5 Goals Before HT";
  if (totalGoals >= 1 && probPct >= 55) bestBet = `Over ${totalGoals}.5 Goals at HT`;
  else if (totalGoals === 0 && probPct >= 65) bestBet = "Over 0.5 Goals at HT";
  else if (totalGoals === 0 && probPct < 40) bestBet = "Under 0.5 Goals at HT";

  const label = Math.round(score) >= 8 ? "STRONG HT BET"
    : Math.round(score) >= 6 ? "FAIR HT BET"
    : Math.round(score) >= 4 ? "WEAK"
    : "SKIP";

  const color = Math.round(score) >= 8 ? "#c62828"
    : Math.round(score) >= 6 ? "#e65100"
    : Math.round(score) >= 4 ? "#f9a825"
    : "#aaa";

  return {
    score: Math.round(score * 10) / 10,
    probPct,
    minsToHT,
    bestBet,
    label,
    color,
    reasons,
    inVilaWindow,
    currentScore: `${homeGoals}-${awayGoals}`,
  };
}

// ─── DEAD GAME DETECTOR ──────────────────────────────────────────────────────
// Identifies low-intensity 0-0 / low-scoring games not worth betting on.
//
// Research basis:
// - PerformanceOdds (2026): EPI > 6.5 = 75%+ chance of 1H goal
//   EPI = (SOT × xG_proxy) + (corners × 0.2) − (fouls × 0.1)
// - 20bet research (2025): 0-0 with <8 combined SOT = dead game signal
// - xGscore (2025): Low xG on both sides = structural goalless tendency
// - BBC/Opta: Total match xG < 0.5 = statistically dead game

function calcDeadGame(m) {
  if (m.status === "NS" || m.status === "FT" || m.status === "HT") return null;

  const minute = m.minute;
  if (minute < 15) return null; // too early to judge

  const homeGoals = m.home.goals || 0;
  const awayGoals = m.away.goals || 0;
  const totalGoals = homeGoals + awayGoals;

  // Only relevant for 0-0 or 1-0 low-action games
  if (totalGoals >= 2) return null; // already scoring — not a dead game

  const totalSOT   = (m.home.shots_on_target || 0) + (m.away.shots_on_target || 0);
  const totalDA    = (m.home.dangerous_attacks || 0) + (m.away.dangerous_attacks || 0);
  const totalCorners = (m.home.corners || 0) + (m.away.corners || 0);
  const hasStats   = totalSOT > 0 || totalDA > 0;

  if (!hasStats) return null; // can't judge without stats

  // ── EARLY PRESSURE INDEX (PerformanceOdds 2026) ───────────────────────────
  // EPI = (SOT × xG_proxy) + (corners × 0.2)
  // xG proxy: SOT rate per 90 min
  const sotPer90 = (totalSOT / Math.max(minute, 1)) * 90;
  const xgProxy  = Math.min(3.0, sotPer90 * 0.15); // rough xG estimate
  const epi = (totalSOT * xgProxy) + (totalCorners * 0.2);

  // ── ATTACK INTENSITY RATE ─────────────────────────────────────────────────
  const daPer90 = (totalDA / Math.max(minute, 1)) * 90;
  const sotRate = sotPer90;

  // ── DEAD GAME THRESHOLDS ──────────────────────────────────────────────────
  const deadSignals = [];
  let deadScore = 0; // 0=live, 10=definitely dead

  // Signal 1: Very low SOT (BBC/Opta: <8 combined = dead)
  if (totalSOT === 0 && minute >= 30) {
    deadScore += 4;
    deadSignals.push(`Zero shots on target at ${minute}′`);
  } else if (sotRate < 2 && minute >= 25) {
    deadScore += 3;
    deadSignals.push(`Very low shot rate: ${sotRate.toFixed(1)}/90`);
  } else if (sotRate < 4 && minute >= 20) {
    deadScore += 1.5;
    deadSignals.push(`Low shot rate: ${sotRate.toFixed(1)}/90`);
  }

  // Signal 2: Low EPI (PerformanceOdds threshold)
  if (epi < 1.5 && minute >= 20) {
    deadScore += 3;
    deadSignals.push(`Low pressure index: EPI ${epi.toFixed(1)} (need >6.5)`);
  } else if (epi < 3.5) {
    deadScore += 1.5;
    deadSignals.push(`Below average pressure: EPI ${epi.toFixed(1)}`);
  }

  // Signal 3: Low dangerous attack rate
  if (daPer90 < 15 && minute >= 20) {
    deadScore += 2;
    deadSignals.push(`Very low attack volume: ${daPer90.toFixed(0)}/90`);
  } else if (daPer90 < 25) {
    deadScore += 1;
  }

  // Signal 4: Low corners (territorial control indicator)
  const cornersPer90 = (totalCorners / Math.max(minute, 1)) * 90;
  if (cornersPer90 < 3 && minute >= 25) {
    deadScore += 1.5;
    deadSignals.push(`No box pressure: ${cornersPer90.toFixed(1)} corners/90`);
  }

  // Signal 5: Balanced but inactive possession
  const possBalance = Math.abs((m.home.possession || 50) - (m.away.possession || 50));
  if (possBalance < 8 && totalSOT <= 2 && minute >= 25) {
    deadScore += 1.5;
    deadSignals.push(`Balanced but passive: ${possBalance}% poss gap, only ${totalSOT} SOT`);
  }

  // Bonus: 0-0 at 60+ with low activity = very strong dead signal
  if (totalGoals === 0 && minute >= 60 && deadScore >= 4) {
    deadScore += 2;
    deadSignals.push(`0-0 at ${minute}′ with low activity — structural stalemate`);
  }

  // Clamp
  deadScore = Math.min(10, Math.max(0, deadScore));

  // Only return if meaningful signal
  if (deadScore < 3) return null;

  const isDead = deadScore >= 6;
  const isSuspect = deadScore >= 3 && deadScore < 6;

  return {
    deadScore,
    isDead,
    isSuspect,
    signals: deadSignals,
    epi: Math.round(epi * 10) / 10,
    sotRate: Math.round(sotRate * 10) / 10,
    verdict: isDead
      ? "⛔ SKIP — Dead game, very unlikely to score"
      : "⚠️ LOW ACTIVITY — Bet with caution",
    color: isDead ? "#c62828" : "#e65100",
    bg: isDead ? "#ffebee" : "#fff8e1",
    border: isDead ? "#ef9a9a" : "#ffe082",
  };
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
  if (m.status === "NS") return { score: 0, label: "—", color: "#666", bet: null, halfLabel: null, timeLeft: 0, reasons: [] };

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
function MatchRow({ m, expanded, onToggle, isFav, onFavToggle, isFanduel, onFanduelToggle, onEVOpen }) {
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

  if (bd.vila_effect > 0) {
    const isEnd2H = m.minute >= 80;
    const vilaConf = isEnd2H ? "76%" : "61%";
    const vilaLabel = isEnd2H ? `Vila 80'+ — peak pressure` : `Vila ${m.minute}'— end of half`;
    signals.push({ icon: "⏱️", text: vilaLabel, bet: `Over 0.5 Next Goal (${vilaConf})`, color: "#f9a825" });
  }
  if (bd.red_card_multiplier > 0) {
    const tenManTeam = (m.home.red_cards || 0) > 0 ? m.home : m.away;
    const fullTeam = tenManTeam === m.home ? m.away : m.home;
    signals.push({ icon: "🟥", text: `${tenManTeam.name} 10 men`, bet: `${fullTeam.name} Next Goal (73%)`, color: "#e53935" });
  }
  if (isDraw && m.minute > 60) {
    const minsLeft = m.minute >= 80 ? 90 - m.minute : 90 - m.minute;
    const drawConf = m.minute >= 83 ? "82%" : m.minute >= 75 ? "71%" : "58%";
    const drawLabel = m.minute >= 83 ? "Late draw — desperate" : m.minute >= 75 ? "Draw 75'+ — urgent" : "Draw — both pushing";
    signals.push({ icon: "⚡", text: drawLabel, bet: `Over 0.5 Next Goal (${drawConf})`, color: "#7b1fa2" });
  }
  if (dominant.possession >= 65)
    signals.push({ icon: "🔵", text: `${dominant.name} pressing`, bet: `${dominant.name} Next Goal`, color: "#1565c0" });
  const totalGoals = (m.home.goals || 0) + (m.away.goals || 0);
  const goalDiff = Math.abs((m.home.goals || 0) - (m.away.goals || 0));
  const isDrawHS = goalDiff === 0;
  const trailingTeam = (m.home.goals || 0) < (m.away.goals || 0) ? m.home : m.away;
  if (totalGoals >= 3) {
    const hsLabel = totalGoals >= 5 ? `${totalGoals} goals — chaos` : totalGoals >= 4 ? `${totalGoals} goals — wide open` : `${totalGoals} goals scored`;
    const hsBet = isDrawHS
      ? `${totalGoals}-${totalGoals} draw — both teams exposed → Over 0.5`
      : goalDiff === 1 && m.minute >= 65
        ? `${trailingTeam.name} chasing → Next Goal`
        : "Over 0.5 Next Goal";
    const hsConf = totalGoals >= 5 ? "90%" : totalGoals >= 4 ? "78%" : isDrawHS ? "74%" : "66%";
    signals.push({ icon: "🔥", text: hsLabel, bet: `${hsBet} (${hsConf})`, color: "#e53935" });
  }
  if (diff === 1 && m.minute > 70) {
    const behind = (m.home.goals || 0) < (m.away.goals || 0) ? m.home : m.away;
    const oneGoalConf = m.minute >= 80 ? "69%" : "54%";
    signals.push({ icon: "📈", text: `${behind.name} chasing`, bet: `${behind.name} Next Goal (${oneGoalConf})`, color: "#2e7d32" });
  }
  if (m.dangerous_attacks_per_min >= 1.5)
    signals.push({ icon: "⚡", text: "High Attacks", bet: "Over 0.5", color: "#f57c00" });

  const topSignals = signals.slice(0, 5);

  return (
    <div style={{ borderBottom: "2px solid #f0f0f0" }}>
      <div onClick={onToggle} style={{
        padding: "12px 14px",
        cursor: "pointer",
        background: expanded ? "#fafafa" : m.status === "FT" ? "#f9f9f9" : "#fff",
        opacity: m.status === "FT" ? 0.75 : 1,
      }}>

        {/* ROW 1: Minute | Teams & Score | Heat ring */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>

          {/* Minute */}
          <div style={{ width: 46, flexShrink: 0, textAlign: "center" }}>
            {m.status === "NS" ? (<>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1565c0", fontFamily: "monospace" }}>{m.kickoff_display}</div>
              <div style={{ fontSize: 12, color: "#1565c0" }}>{m.time_until}</div>
            </>) : m.status === "HT" ? (<>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#7b1fa2", fontFamily: "monospace" }}>HT</div>
              <div style={{ fontSize: 12, color: "#7b1fa2" }}>45′</div>
            </>) : m.status === "FT" ? (<>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#388e3c", fontFamily: "monospace" }}>FT</div>
              <div style={{ fontSize: 12, color: "#388e3c" }}>90′</div>
            </>) : (<>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#e53935", fontFamily: "monospace" }}>{m.minute}′</div>
              {isVila && <div style={{ fontSize: 11, color: "#f9a825", fontWeight: 800 }}>VILA</div>}
            </>)}
          </div>

          {/* Teams & Score — takes all remaining space */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Home */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
                {m.home.logo && <img src={m.home.logo} width="18" height="18" style={{ borderRadius: 3, flexShrink: 0 }} alt="" onError={e => e.target.style.display="none"} />}
                <span style={{ fontSize: 16, fontWeight: homeWin ? 700 : 500, color: homeWin ? "#111" : "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.home.name}
                </span>
                {m.home.red_cards > 0 && <span style={{ fontSize: 11, background: "#e53935", color: "#fff", borderRadius: 3, padding: "1px 5px", flexShrink: 0, fontWeight: 700 }}>RC</span>}
              </div>
              <span style={{ fontSize: 22, fontWeight: 800, color: "#111", fontFamily: "monospace", marginLeft: 8, flexShrink: 0 }}>{m.home.goals ?? "-"}</span>
            </div>
            {/* Away */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
                {m.away.logo && <img src={m.away.logo} width="18" height="18" style={{ borderRadius: 3, flexShrink: 0 }} alt="" onError={e => e.target.style.display="none"} />}
                <span style={{ fontSize: 16, fontWeight: awayWin ? 700 : 500, color: awayWin ? "#111" : "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.away.name}
                </span>
                {m.away.red_cards > 0 && <span style={{ fontSize: 11, background: "#e53935", color: "#fff", borderRadius: 3, padding: "1px 5px", flexShrink: 0, fontWeight: 700 }}>RC</span>}
              </div>
              <span style={{ fontSize: 22, fontWeight: 800, color: "#111", fontFamily: "monospace", marginLeft: 8, flexShrink: 0 }}>{m.away.goals ?? "-"}</span>
            </div>
          </div>

          {/* Heat ring + star + FD */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <Tooltip text={`Heat Score ${s}/100 — Trend: ${m.momentum?.trend || "neutral"} (${m.momentum?.delta > 0 ? "+" : ""}${m.momentum?.delta || 0}). ${m.momentum?.rising ? "Rising momentum — stronger signal." : m.momentum?.trend === "falling" ? "Falling — wait before betting." : "Stable pressure."}`}>
              <div style={{ position: "relative" }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", border: `2.5px solid ${color}`, background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color, fontFamily: "monospace" }}>{s}</span>
                </div>
                {m.momentum?.trend === "rising" && (
                  <span style={{ position: "absolute", top: -4, right: -4, fontSize: 11, background: "#43a047", color: "#fff", borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>↑</span>
                )}
                {m.momentum?.trend === "falling" && (
                  <span style={{ position: "absolute", top: -4, right: -4, fontSize: 11, background: "#e53935", color: "#fff", borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>↓</span>
                )}
              </div>
            </Tooltip>
            <Tooltip text={isFav ? "Remove from watchlist" : "Add to watchlist"}>
              <button onClick={e => { e.stopPropagation(); onFavToggle(m.fixture_id); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: isFav ? "#f9a825" : "#ddd", padding: 0, lineHeight: 1 }}>★</button>
            </Tooltip>
            {m.status !== "NS" && m.status !== "FT" && (
              <Tooltip text="Open EV Scanner for this game — auto-fills with live data">
                <button onClick={e => { e.stopPropagation(); onEVOpen && onEVOpen(m); }} style={{ background: "#e3f2fd", border: "1.5px solid #90caf9", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 800, color: "#1565c0", padding: "3px 6px", lineHeight: 1.2, marginTop: 2 }}>📊</button>
              </Tooltip>
            )}

          </div>
        </div>

        {/* DEAD GAME DETECTOR */}
        {m.status !== "NS" && m.status !== "FT" && (() => {
          const dg = calcDeadGame(m);
          if (!dg) return null;
          return (
            <div style={{ marginBottom: 8, padding: "8px 12px", background: dg.bg, border: `1.5px solid ${dg.border}`, borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: dg.color }}>{dg.verdict}</span>
                <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: dg.color, background: dg.isDead ? "#ffcdd2" : "#ffe082", borderRadius: 4, padding: "2px 7px" }}>
                  Dead: {dg.deadScore}/10
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {dg.signals.map((s, i) => (
                  <span key={i} style={{ fontSize: 11, color: dg.color, background: dg.isDead ? "#ffcdd2" : "#fff9c4", borderRadius: 10, padding: "2px 8px" }}>
                    {s}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 11, color: dg.color, marginTop: 5, opacity: 0.8 }}>
                EPI: {dg.epi} (need &gt;6.5 to trust) · Shot rate: {dg.sotRate}/90
              </div>
            </div>
          );
        })()}

        {/* CONFIDENCE INDICATOR */}
        {m.status !== "NS" && m.status !== "FT" && (() => {
          const gp = calcGoalProb(m);
          const heatHigh = m.heat_score >= 55;
          const probHigh = gp.rounded >= 6;
          const heatMed  = m.heat_score >= 35;
          const probMed  = gp.rounded >= 4;

          // Check for dead game first
          const dgCheck = calcDeadGame(m);
          let conf = null;
          if (dgCheck?.isDead) {
            // Dead game overrides all — never show HIGH CONFIDENCE on a dead game
            conf = null; // dead game banner already shown above
          } else if (heatHigh && probHigh && !dgCheck) {
            conf = { label: "⚡ HIGH CONFIDENCE BET", sublabel: `Heat ${m.heat_score} + ${gp.probPct}% goal chance — both signals aligned`, bg: "#e8f5e9", border: "#43a047", color: "#1b5e20", dot: "#43a047" };
          } else if (!heatHigh && probHigh && !dgCheck) {
            conf = { label: "🟡 MODERATE — Score-Driven", sublabel: `Goal prob ${gp.probPct}% from score state, not pressure. Verify on FanDuel.`, bg: "#fffde7", border: "#f9a825", color: "#e65100", dot: "#f9a825" };
          } else if (heatHigh && !probHigh) {
            conf = { label: "⚪ PRESSURE — LOW CHANCE", sublabel: `Heat ${m.heat_score} but only ${gp.probPct}% goal prob. Game may be decided.`, bg: "#f5f5f5", border: "#bbb", color: "#666", dot: "#bbb" };
          } else if (heatMed && probMed && !dgCheck?.isSuspect) {
            conf = { label: "👀 WATCH", sublabel: `Building — Heat ${m.heat_score}, ${gp.probPct}% chance. Not ready yet.`, bg: "#fff8f0", border: "#ffcc80", color: "#e65100", dot: "#ffcc80" };
          }

          if (!conf) return null;
          return (
            <div style={{ marginBottom: 8, padding: "7px 10px", background: conf.bg, border: `1.5px solid ${conf.border}`, borderRadius: 8, display: "flex", alignItems: "flex-start", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: conf.dot, flexShrink: 0, marginTop: 4 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: conf.color }}>{conf.label}</div>
                <div style={{ fontSize: 12, color: conf.color, opacity: 0.8, marginTop: 2 }}>{conf.sublabel}</div>
              </div>
            </div>
          );
        })()}

        {/* FIRST HALF PREDICTOR — only shows during 1H */}
        {m.status === "1H" && (() => {
          const ht = calcHalfTimeScore(m);
          if (!ht || ht.minsToHT <= 0) return null;
          return (
            <div style={{ marginBottom: 8, background: "#f3e5f5", border: `1.5px solid #9c27b0`, borderRadius: 8, padding: "8px 10px" }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14 }}>🏁</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#6a1b9a" }}>HT PREDICTOR</span>
                  <span style={{ fontSize: 11, color: "#9c27b0", fontFamily: "monospace" }}>{ht.minsToHT}′ to HT</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 16, fontWeight: 900, color: ht.color, fontFamily: "monospace" }}>{ht.score}</span>
                  <span style={{ fontSize: 11, color: ht.color, marginLeft: 4, fontWeight: 700 }}>{ht.label}</span>
                </div>
              </div>
              {/* Probability bar */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, height: 8, background: "#e1bee7", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${ht.probPct}%`, height: "100%", background: ht.color, borderRadius: 4, transition: "width .6s" }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: ht.color, fontFamily: "monospace", minWidth: 36 }}>{ht.probPct}%</span>
              </div>
              {/* Best bet */}
              <div style={{ fontSize: 13, fontWeight: 700, color: "#6a1b9a", marginBottom: 4 }}>
                → {ht.bestBet}
              </div>
              {/* Key reasons */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {ht.reasons.map((r, i) => (
                  <span key={i} style={{ fontSize: 11, color: "#7b1fa2", background: "#e1bee7", borderRadius: 10, padding: "2px 7px" }}>{r}</span>
                ))}
              </div>
            </div>
          );
        })()}

        {/* SPARKLINE — momentum timeline */}
        {m.status !== "NS" && m.status !== "FT" && m.timeline && m.timeline.length > 1 && (() => {
          const adv = m.advanced;
          const tiltDom = adv?.field_tilt?.dominant;
          const tiltStr = adv?.field_tilt?.strength;
          const homeXT  = adv?.xT?.home;
          const awayXT  = adv?.xT?.away;
          const swingAlert = adv?.swing_alert;
          const sparkColor = m.heat_score >= 65 ? "#e53935" : m.heat_score >= 40 ? "#f57c00" : "#1565c0";
          return (
            <div style={{ marginBottom: 6 }}>
              {/* Field tilt bar */}
              <FieldTiltBar tilt={adv?.field_tilt} homeName={m.home.name} awayName={m.away.name} />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* Sparkline */}
                <div style={{ flex: 1 }}>
                  <Sparkline data={m.timeline} width={120} height={20} color={sparkColor} />
                </div>
                {/* xT */}
                {homeXT !== undefined && (
                  <div style={{ display: "flex", gap: 6, fontSize: 11, color: "#888" }}>
                    <span style={{ fontWeight: homeXT > awayXT ? 700 : 400, color: homeXT > awayXT ? "#1565c0" : "#aaa" }}>xT {homeXT}</span>
                    <span style={{ color: "#ddd" }}>|</span>
                    <span style={{ fontWeight: awayXT > homeXT ? 700 : 400, color: awayXT > homeXT ? "#e53935" : "#aaa" }}>{awayXT} xT</span>
                  </div>
                )}
                {/* Swing alert */}
                {swingAlert && (
                  <span style={{ fontSize: 10, background: "#fff3e0", color: "#e65100", border: "1px solid #ffcc80", borderRadius: 8, padding: "2px 7px", fontWeight: 700, whiteSpace: "nowrap" }}>
                    ⚡ Momentum shift
                  </span>
                )}
              </div>
            </div>
          );
        })()}

        {/* ROW 2: Signals | Goal Probability */}
        {m.status !== "NS" && m.status !== "FT" && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>

            {/* Signals */}
            <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 4 }}>
              {topSignals.length === 0
                ? <span style={{ fontSize: 13, color: "#bbb", fontStyle: "italic" }}>No signals</span>
                : topSignals.map((sig, i) => (
                  <div key={i} style={{ background: `${sig.color}12`, border: `1.5px solid ${sig.color}44`, borderRadius: 6, padding: "4px 8px" }}>
                    <div style={{ fontSize: 13, color: sig.color, fontWeight: 700, whiteSpace: "nowrap" }}>{sig.icon} {sig.text}</div>
                    <div style={{ fontSize: 12, color: "#666", fontWeight: 600 }}>→ {sig.bet}</div>
                  </div>
                ))
              }
            </div>

            {/* Goal Probability */}
            {(() => {
              const gp = calcGoalProb(m);
              const bars = [1,2,3,4,5,6,7,8,9,10];
              return (
                <div style={{ flexShrink: 0, textAlign: "center", minWidth: 70 }}>
                  <Tooltip text={gp.score > 0 ? `${gp.probPct}% chance of a goal in next ${gp.timeLeft}′. Bet: ${gp.bet}` : "Not started"}>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: gp.color, fontFamily: "monospace", lineHeight: 1 }}>
                        {gp.score > 0 ? gp.score.toFixed(1) : "—"}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: gp.color }}>{gp.label}</div>
                      {/* Model vs Market */}
                      {m.poisson && (
                        <div style={{ marginTop: 3, fontSize: 11, color: "#888" }}>
                          <span style={{ color: "#555", fontWeight: 600 }}>xG: {m.poisson.total_xg}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 16, justifyContent: "center", marginTop: 3 }}>
                        {bars.map(b => (
                          <div key={b} style={{ width: 4, borderRadius: 1, height: `${(b/10)*16}px`, background: b <= Math.round(gp.score) ? gp.color : "#eee" }} />
                        ))}
                      </div>
                      {gp.probPct > 0 && (
                        <div style={{ fontSize: 13, fontWeight: 800, color: gp.color, marginTop: 2 }}>{gp.probPct}%</div>
                      )}
                      {gp.bet && Math.round(gp.score) >= 5 && (
                        <div style={{ fontSize: 11, color: "#666", marginTop: 1, lineHeight: 1.3 }}>{gp.bet}</div>
                      )}
                      {gp.timeLeft > 0 && (
                        <div style={{ fontSize: 11, color: "#aaa", fontFamily: "monospace" }}>{gp.timeLeft}′ to {gp.halfLabel}</div>
                      )}
                    </div>
                  </Tooltip>
                </div>
              );
            })()}
          </div>
        )}
      </div>
      {expanded && <MatchDetail m={m} />}
    </div>
  );
}

// ─── LEAGUE HEADER ────────────────────────────────────────────────────────────
function LeagueHeader({ label, topHeat, onHide }) {
  const color = heatColor(topHeat);
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "9px 14px", background: "#f5f5f5",
      borderBottom: "1.5px solid #e8e8e8", borderTop: "1.5px solid #e8e8e8",
      gap: 8,
    }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: "#555", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {topHeat >= 40 && (
          <span style={{
            fontSize: 13, fontWeight: 700, color,
            background: `${color}15`, border: `1px solid ${color}44`,
            borderRadius: 4, padding: "3px 8px", fontFamily: "monospace",
          }}>
            {topHeat >= 80 ? "🔥" : topHeat >= 60 ? "🟠" : "🟡"} {topHeat}
          </span>
        )}
        <button
          onClick={e => { e.stopPropagation(); onHide && onHide(label); }}
          title="Hide this league"
          style={{
            background: "#ddd", border: "none", borderRadius: 6,
            width: 28, height: 28, cursor: "pointer",
            fontSize: 18, fontWeight: 700, color: "#666",
            display: "flex", alignItems: "center", justifyContent: "center",
            lineHeight: 1, flexShrink: 0,
          }}
        >−</button>
      </div>
    </div>
  );
}

// ─── ALERT PANEL ──────────────────────────────────────────────────────────────
function AlertPanel({ threshold, onChange, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#00000066", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: 320, boxShadow: "0 8px 32px #0002" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#111", marginBottom: 6 }}>🔔 Alert Threshold</div>
        <div style={{ fontSize: 16, color: "#777", marginBottom: 20 }}>Notify when Heat Score ≥</div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 17, color: "#555" }}>Threshold</span>
          <span style={{ fontSize: 26, fontWeight: 800, fontFamily: "monospace", color: heatColor(threshold) }}>{threshold}</span>
        </div>
        <input type="range" min="40" max="95" step="5" value={threshold} onChange={e => onChange(Number(e.target.value))} style={{ width: "100%", accentColor: "#e53935", cursor: "pointer" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#666", marginTop: 4, marginBottom: 16 }}>
          <span>40</span><span>60</span><span>80</span><span>95</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[60, 70, 80].map(v => (
            <button key={v} onClick={() => onChange(v)} style={{
              padding: "10px 0", borderRadius: 8, cursor: "pointer",
              border: threshold === v ? "2px solid #e53935" : "1.5px solid #eee",
              background: threshold === v ? "#fdecea" : "#fafafa",
              color: threshold === v ? "#e53935" : "#888",
              fontSize: 18, fontWeight: 700,
            }}>{v}</button>
          ))}
        </div>
        <button onClick={onClose} style={{ width: "100%", padding: "11px 0", borderRadius: 8, background: "#f5f5f5", border: "none", color: "#555", fontSize: 17, cursor: "pointer" }}>Done</button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
// ─── EV SCANNER COMPONENT ────────────────────────────────────────────────────
// Fully automatic — reads all data from the live match, no manual input needed

function EVScanner({ match, onClose }) {
  const [tab, setTab] = useState('result');
  const [btMatch, setBtMatch] = useState(match?.home?.name && match?.away?.name ? `${match.home.name} vs ${match.away.name}` : '');
  const [btOdds, setBtOdds] = useState(1.85);
  const [btOut, setBtOut] = useState('');
  const [alerts, setAlerts] = useState(() => { try { return JSON.parse(localStorage.getItem('mt_bt')||'[]'); } catch { return []; } });

  const hasMatch = match && match.fixture_id;

  // ── AUTO-COMPUTE FROM LIVE DATA ─────────────────────────────────────────────
  function poi(k, L) { let p = Math.exp(-L); for (let i = 0; i < k; i++) p *= L/(i+1); return p; }
  function poiCum(max, L) { let s = 0; for (let i = 0; i <= max; i++) s += poi(i, L); return s; }

  const minute   = match?.minute || 0;
  const homeGoals = match?.home?.goals || 0;
  const awayGoals = match?.away?.goals || 0;
  const heatScore = match?.heat_score || 0;
  const timeLeft  = minute < 45 ? 45 - minute : 90 - minute;

  // Use Poisson data from API if available, else estimate from live stats
  let xH, xA, xT, modelProb;
  if (match?.poisson?.total_xg) {
    xH = match.poisson.home_xg;
    xA = match.poisson.away_xg;
    xT = match.poisson.total_xg;
    modelProb = match.poisson.prob_goal;
  } else {
    // Estimate from live stats when no standings data
    const sot = (match?.home?.shots_on_target || 0) + (match?.away?.shots_on_target || 0);
    const da  = (match?.home?.dangerous_attacks || 0) + (match?.away?.dangerous_attacks || 0);
    const corners = (match?.home?.corners || 0) + (match?.away?.corners || 0);
    // Intensity-based lambda
    const sotRate  = minute > 0 ? (sot / minute) * 90 : 6;
    const daRate   = minute > 0 ? (da  / minute) * 90 : 30;
    // Motivation multiplier
    const diff = homeGoals - awayGoals;
    const motMult = diff === 0 ? (minute >= 80 ? 1.6 : minute >= 70 ? 1.3 : 1.1) :
                    Math.abs(diff) === 1 ? (minute >= 80 ? 1.5 : minute >= 70 ? 1.3 : 1.1) : 0.8;
    const baseLambda = (sotRate * 0.04 + daRate * 0.005 + corners * 0.01) * motMult;
    xT = baseLambda * (timeLeft / 90);
    xH = xT * 0.55; xA = xT * 0.45;
    modelProb = Math.round((1 - Math.exp(-xT)) * 100);
  }

  // Confidence level
  const conf = match?.poisson ? "High — from league standings" : "Moderate — estimated from live stats";
  const confColor = match?.poisson ? "#2e7d32" : "#e65100";

  // Signal analysis from live match
  const signals = [];
  if (heatScore >= 70)       signals.push({ text: `🔥 Heat ${Math.round(heatScore)} — extreme pressure`, boost: "+12%" });
  if (heatScore >= 50)       signals.push({ text: `🟠 Heat ${Math.round(heatScore)} — high activity`, boost: "+7%" });
  const isVila = (minute >= 35 && minute <= 45) || (minute >= 80 && minute <= 93);
  if (isVila)                signals.push({ text: `⏱️ Vila window at ${minute}′ — peak scoring period`, boost: "+25%" });
  if (homeGoals === awayGoals && minute >= 70) signals.push({ text: `⚡ Late draw — both teams desperate`, boost: "+18%" });
  if ((match?.home?.red_cards || 0) + (match?.away?.red_cards || 0) > 0) signals.push({ text: `🟥 Red card — numerical advantage`, boost: "+30%" });
  if (match?.momentum?.rising) signals.push({ text: `↑ Rising momentum — pressure building`, boost: "+8%" });
  if (match?.momentum?.trend === "falling") signals.push({ text: `↓ Falling momentum — pressure dropping`, boost: "-10%" });

  // Motivation context
  const homeMot = match?.home?.motivation;
  const awayMot = match?.away?.motivation;

  // EV calculation at common odds tiers
  const oddsOptions = [1.50, 1.62, 1.75, 1.85, 1.95, 2.10, 2.30, 2.50];
  const myProbDecimal = modelProb / 100;

  // Dead game check
  const sot = (match?.home?.shots_on_target || 0) + (match?.away?.shots_on_target || 0);
  const sotRate90 = minute > 0 ? (sot/minute)*90 : 0;
  const isDead = sotRate90 < 2 && minute > 25 && (homeGoals + awayGoals) < 2;

  // Best bet determination
  let bestBet = "Over 0.5 Next Goal";
  if (homeGoals < awayGoals) bestBet = `${match?.home?.name} Next Goal`;
  else if (awayGoals < homeGoals) bestBet = `${match?.away?.name} Next Goal`;

  // Backtest helpers
  const settled = alerts.filter(a => a.out);
  const hits = settled.filter(a => a.out === 'yes');
  const hitRate = settled.length ? Math.round(hits.length/settled.length*100) : null;

  function logAlert() {
    if (!btMatch.trim()) return;
    const a = {
      id: Date.now(), m: btMatch,
      min: minute, heat: Math.round(heatScore),
      prob: modelProb, odds: btOdds,
      out: btOut, ts: new Date().toLocaleDateString()
    };
    const next = [...alerts, a];
    setAlerts(next);
    try { localStorage.setItem('mt_bt', JSON.stringify(next)); } catch {}
    setBtOut('');
  }

  const tabStyle = active => ({
    padding: "8px 14px", border: `1.5px solid ${active ? "#1565c0" : "#e0e0e0"}`,
    borderRadius: 8, background: active ? "#e3f2fd" : "#fafafa",
    cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 500,
    color: active ? "#1565c0" : "#666", whiteSpace: "nowrap",
  });

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#fff", zIndex: 1000, overflowY: "auto", maxWidth: 480, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "2px solid #f0f0f0", position: "sticky", top: 0, background: "#fff", zIndex: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#111", display: "flex", alignItems: "center", gap: 8 }}>
            <span>📊</span> EV Scanner
          </div>
          {hasMatch && (
            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
              {match.home?.name} {homeGoals}–{awayGoals} {match.away?.name} · {minute}′
            </div>
          )}
        </div>
        <button onClick={onClose} style={{ background: "#f0f0f0", border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#555", flexShrink: 0 }}>✕</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, padding: "10px 14px", overflowX: "auto", borderBottom: "1px solid #f0f0f0" }}>
        {[['result','🎯 Result'],['ev','💰 EV Table'],['signals','📡 Signals'],['backtest','📋 Backtest']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={tabStyle(tab===k)}>{l}</button>
        ))}
      </div>

      <div style={{ padding: "14px 14px 80px" }}>

        {/* ── TAB 1: RESULT — the main automatic analysis ── */}
        {tab === 'result' && (
          <div>
            {isDead ? (
              <div style={{ background: "#ffebee", border: "2px solid #e53935", borderRadius: 12, padding: "14px 16px", marginBottom: 14, textAlign: "center" }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>⛔</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#c62828" }}>SKIP THIS GAME</div>
                <div style={{ fontSize: 13, color: "#e53935", marginTop: 4 }}>Dead game detected — very low shot rate ({sotRate90.toFixed(1)}/90). Not worth betting.</div>
              </div>
            ) : (
              <div style={{ background: modelProb >= 65 ? "#e8f5e9" : modelProb >= 45 ? "#fff8e1" : "#f5f5f5", border: `2px solid ${modelProb >= 65 ? "#43a047" : modelProb >= 45 ? "#f9a825" : "#bbb"}`, borderRadius: 12, padding: "16px", marginBottom: 14, textAlign: "center" }}>
                <div style={{ fontSize: 48, fontWeight: 900, color: modelProb >= 65 ? "#2e7d32" : modelProb >= 45 ? "#e65100" : "#888", fontFamily: "monospace", lineHeight: 1 }}>
                  {modelProb}%
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: modelProb >= 65 ? "#2e7d32" : modelProb >= 45 ? "#e65100" : "#888", marginTop: 6, marginBottom: 8 }}>
                  {modelProb >= 65 ? "HIGH PROBABILITY — Strong bet signal" : modelProb >= 45 ? "MODERATE — Consider carefully" : "LOW — Not recommended"}
                </div>
                <div style={{ fontSize: 13, color: "#555", background: "#fff8", borderRadius: 8, padding: "8px 12px" }}>
                  Best bet: <strong>{bestBet}</strong>
                </div>
              </div>
            )}

            {/* Model details */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {[
                ['Goal prob', modelProb+'%', modelProb >= 65 ? "#2e7d32" : modelProb >= 45 ? "#e65100" : "#888"],
                ['xG remaining', xT?.toFixed(2) || '—', "#1565c0"],
                ['Time left', timeLeft+"′", "#555"],
                ['Heat', Math.round(heatScore), heatScore >= 60 ? "#e53935" : heatScore >= 40 ? "#f57c00" : "#888"],
              ].map(([l,v,c]) => (
                <div key={l} style={{ flex: 1, background: "#f9f9f9", borderRadius: 8, padding: "10px 6px", textAlign: "center", border: "1px solid #eee" }}>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 3 }}>{l}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: c }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Data confidence */}
            <div style={{ background: "#f9f9f9", borderRadius: 8, padding: "10px 12px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: confColor, flexShrink: 0 }} />
              <div style={{ fontSize: 12, color: confColor, fontWeight: 600 }}>Data confidence: {conf}</div>
            </div>

            {/* Motivation context */}
            {(homeMot || awayMot) && (
              <div style={{ background: "#f9f9f9", borderRadius: 10, border: "1px solid #eee", padding: "12px 14px", marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 10 }}>🧠 Motivation context</div>
                {[{team: match?.home, mot: homeMot}, {team: match?.away, mot: awayMot}].map(({team, mot}, i) => {
                  if (!mot) return null;
                  const mc = mot.score >= 8 ? "#d32f2f" : mot.score >= 6 ? "#e65100" : mot.score >= 5 ? "#1565c0" : "#757575";
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: i === 0 ? 8 : 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#333", minWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{team?.name}</span>
                      <div style={{ flex: 1, height: 8, background: "#e0e0e0", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${(mot.score/10)*100}%`, height: "100%", background: mc, borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: mc, minWidth: 20 }}>{mot.score.toFixed(0)}</span>
                      {mot.tag && <span style={{ fontSize: 11, borderRadius: 10, padding: "2px 7px", background: `${mot.tag.color}18`, color: mot.tag.color, border: `1px solid ${mot.tag.color}44`, whiteSpace: "nowrap" }}>{mot.tag.text}</span>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* EV at a glance */}
            <div style={{ background: "#f9f9f9", borderRadius: 10, border: "1px solid #eee", padding: "12px 14px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 10 }}>💰 Quick EV check — enter your odds</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                <input type="number" min="1.01" max="10" step="0.01" value={btOdds} onChange={e => setBtOdds(+e.target.value)}
                  style={{ flex: 1, padding: "10px 12px", border: "1.5px solid #1565c0", borderRadius: 8, fontSize: 18, fontWeight: 700, textAlign: "center" }} />
                <div style={{ flex: 2 }}>
                  {(() => {
                    const ev = myProbDecimal * btOdds;
                    const edge = (ev - 1) * 100;
                    const kelly = Math.max(0, (myProbDecimal - (1-myProbDecimal)/(btOdds-1))*100);
                    const isBet = ev >= 1.05;
                    return (
                      <div style={{ background: isBet ? "#e8f5e9" : "#ffebee", border: `2px solid ${isBet?"#43a047":"#e53935"}`, borderRadius: 8, padding: "8px 12px", textAlign: "center" }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: isBet ? "#1b5e20" : "#b71c1c" }}>{isBet ? "✅ BET" : "❌ SKIP"}</div>
                        <div style={{ fontSize: 12, color: isBet?"#2e7d32":"#c62828" }}>EV {ev.toFixed(2)} · Edge {edge>=0?'+':''}{edge.toFixed(1)}% · Kelly {kelly.toFixed(1)}%</div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: EV TABLE — all odds scenarios ── */}
        {tab === 'ev' && (
          <div>
            <div style={{ background: "#e3f2fd", borderRadius: 8, padding: "10px 12px", marginBottom: 14, fontSize: 13, color: "#1565c0", fontWeight: 600 }}>
              Model probability: {modelProb}% · Best bet: {bestBet}
            </div>
            <div style={{ background: "#f9f9f9", borderRadius: 10, border: "1px solid #eee", overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: "8px 12px", background: "#f0f0f0", borderBottom: "1px solid #e0e0e0" }}>
                {["Odds", "EV", "Edge", "Action"].map(h => <div key={h} style={{ fontSize: 12, fontWeight: 700, color: "#666" }}>{h}</div>)}
              </div>
              {oddsOptions.map(odds => {
                const ev = myProbDecimal * odds;
                const edge = (ev - 1) * 100;
                const kelly = Math.max(0, (myProbDecimal - (1-myProbDecimal)/(odds-1))*100);
                const isBet = ev >= 1.05;
                const isStrong = ev >= 1.10;
                return (
                  <div key={odds} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: "10px 12px", borderBottom: "1px solid #f0f0f0", background: isStrong ? "#e8f5e9" : isBet ? "#f9fff9" : "#fff" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>{odds}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: ev >= 1 ? "#2e7d32" : "#c62828" }}>{ev.toFixed(2)}</div>
                    <div style={{ fontSize: 13, color: edge >= 0 ? "#2e7d32" : "#c62828", fontWeight: 600 }}>{edge >= 0 ? "+" : ""}{edge.toFixed(1)}%</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: isBet ? "#2e7d32" : "#999" }}>{isStrong ? "⭐ Strong" : isBet ? "✅ Bet" : "❌ Skip"}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 12, color: "#aaa", marginTop: 8, textAlign: "center" }}>Kelly % = optimal stake % of bankroll</div>
          </div>
        )}

        {/* ── TAB 3: SIGNALS ── */}
        {tab === 'signals' && (
          <div>
            <div style={{ background: "#f9f9f9", borderRadius: 10, border: "1px solid #eee", padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 10 }}>Active signals for this game</div>
              {signals.length === 0 ? (
                <div style={{ fontSize: 13, color: "#aaa", textAlign: "center", padding: "1rem" }}>No strong signals detected</div>
              ) : signals.map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < signals.length-1 ? "1px solid #eee" : "none" }}>
                  <span style={{ fontSize: 13, color: "#333" }}>{s.text}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: s.boost.startsWith('+') ? "#2e7d32" : "#c62828" }}>{s.boost}</span>
                </div>
              ))}
            </div>
            <div style={{ background: "#f9f9f9", borderRadius: 10, border: "1px solid #eee", padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 10 }}>Live stats</div>
              {[
                ['Shots on target', `${(match?.home?.shots_on_target||0) + (match?.away?.shots_on_target||0)} total (${sotRate90.toFixed(1)}/90)`],
                ['Dangerous attacks', `${(match?.home?.dangerous_attacks||0) + (match?.away?.dangerous_attacks||0)} total`],
                ['Corners', `${(match?.home?.corners||0) + (match?.away?.corners||0)} total`],
                ['Momentum trend', match?.momentum?.trend || 'unknown'],
                ['Momentum delta', match?.momentum?.delta ? (match.momentum.delta > 0 ? '+' : '') + match.momentum.delta : '—'],
              ].map(([l, v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}>
                  <span style={{ color: "#777" }}>{l}</span>
                  <span style={{ fontWeight: 600, color: "#333" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 4: BACKTEST ── */}
        {tab === 'backtest' && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {[['Alerts', alerts.length],['Hit rate', hitRate !== null ? hitRate+'%' : '—'],['Avg heat', alerts.length ? Math.round(alerts.reduce((s,a)=>s+a.heat,0)/alerts.length) : '—']].map(([l,v]) => (
                <div key={l} style={{ flex: 1, background: "#f9f9f9", borderRadius: 8, padding: "10px 6px", textAlign: "center", border: "1px solid #eee" }}>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 3 }}>{l}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#333" }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ background: "#f9f9f9", borderRadius: 10, border: "1px solid #eee", padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 10 }}>Log this alert</div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
                Auto-filled: {match?.home?.name} vs {match?.away?.name} · {minute}′ · Heat {Math.round(heatScore)} · {modelProb}%
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: "#777", marginBottom: 4 }}>Your odds</div>
                <input type="number" min="1.01" max="10" step="0.01" value={btOdds} onChange={e => setBtOdds(+e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #e0e0e0", borderRadius: 6, fontSize: 14 }} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: "#777", marginBottom: 4 }}>Did a goal happen within 10 minutes?</div>
                <select value={btOut} onChange={e => setBtOut(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #e0e0e0", borderRadius: 6, fontSize: 13 }}>
                  <option value="">Pending</option>
                  <option value="yes">Yes — goal scored ✅</option>
                  <option value="no">No — no goal ❌</option>
                </select>
              </div>
              <button onClick={logAlert} style={{ width: "100%", background: "#1565c0", color: "#fff", border: "none", borderRadius: 8, padding: "12px", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>
                Log this alert
              </button>
            </div>
            {alerts.length === 0 ? (
              <div style={{ textAlign: "center", color: "#bbb", padding: "2rem", fontSize: 13 }}>No alerts logged yet.</div>
            ) : (
              <div style={{ background: "#f9f9f9", borderRadius: 10, border: "1px solid #eee", padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 8 }}>Recent ({alerts.length} total)</div>
                {[...alerts].reverse().slice(0, 8).map(a => {
                  const ev2 = ((a.prob/100)*a.odds-1)*100;
                  return (
                    <div key={a.id} style={{ padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{a.m}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: a.out==='yes'?"#2e7d32":a.out==='no'?"#c62828":"#888" }}>
                          {a.out==='yes'?'✅':a.out==='no'?'❌':'⏳'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "#888" }}>{a.min}′ · Heat {a.heat} · {a.prob}% · @{a.odds} · EV {ev2>=0?'+':''}{ev2.toFixed(1)}%</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


export default function App() {
  const [filterLive, setFilterLive] = useState(false);
  const [matches, setMatches] = useState(() => {
    try {
      const cached = localStorage.getItem('mt_matches_cache');
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        // Use cache if less than 10 minutes old
        if (data && Date.now() - ts < 10 * 60 * 1000) return data;
      }
    } catch {}
    return [];
  });
  const [loading, setLoading] = useState(() => {
    // Don't show loading if we have fresh cache
    try {
      const cached = localStorage.getItem('mt_matches_cache');
      if (cached) {
        const { ts } = JSON.parse(cached);
        if (Date.now() - ts < 10 * 60 * 1000) return false;
      }
    } catch {}
    return true;
  });
  const [error, setError] = useState(null);
  const [isDemo, setIsDemo] = useState(() => {
    try {
      const cached = localStorage.getItem('mt_matches_cache');
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (data && Date.now() - ts < 10 * 60 * 1000) return false;
      }
    } catch {}
    return false;
  });
  const [countdown, setCountdown] = useState(REFRESH);
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [favourites, setFavourites] = useState(() => {
    try {
      const saved = localStorage.getItem('mt_favourites');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [fanduelGames, setFanduelGames] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [rateLimit, setRateLimit] = useState(null);
  const [evMatch, setEvMatch] = useState(null); // null = closed, match object = open
  const [searchFocused, setSearchFocused] = useState(false);

  const [alertThreshold, setAlertThreshold] = useState(() => {
    try { return parseInt(localStorage.getItem('mt_threshold') || '80'); }
    catch { return 80; }
  });
  const [showAlertPanel, setShowAlertPanel] = useState(false);
  const [alertFired, setAlertFired] = useState(new Set());
  const [betNowGames, setBetNowGames] = useState([]);
  const [hiddenLeagues, setHiddenLeagues] = useState(() => {
    try {
      const saved = localStorage.getItem('mt_hidden_leagues');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('mt_sound') !== 'false'; }
    catch { return true; }
  });
  const audioCtxRef = useRef(null);
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
        const newMatches = json.matches.map(m => {
          const old = matches.find(p => p.fixture_id === m.fixture_id);
          const timeline = old ? [...(old.timeline||[]), m.heat_score].slice(-20) : [m.heat_score];
          return { ...m, timeline };
        }).sort((a, b) => b.heat_score - a.heat_score);
        setMatches(newMatches);
        // Cache to localStorage so app reopens instantly
        try {
          localStorage.setItem('mt_matches_cache', JSON.stringify({
            data: newMatches, ts: Date.now()
          }));
        } catch {}
        // Adaptive polling — use server recommendation
        if (json.recommended_poll_seconds) {
          setCountdown(json.recommended_poll_seconds);
          return; // skip the default setCountdown below
        }
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

  // ── SOUND ENGINE ──────────────────────────────────────────────────────────
  const playBeep = useCallback((frequency = 880, duration = 0.15, volume = 0.3) => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = frequency;
      osc.type = "sine";
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch {}
  }, []);

  const playBetNowSound = useCallback(() => {
    // Three ascending beeps = BET NOW alert
    setTimeout(() => playBeep(660, 0.12), 0);
    setTimeout(() => playBeep(880, 0.12), 150);
    setTimeout(() => playBeep(1100, 0.2), 300);
  }, [playBeep]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();

    const newBetNow = [];
    matches.forEach(m => {
      if (m.status === "NS" || m.status === "FT") return;
      const isBetNow = m.heat_score >= alertThreshold && m.probability_trigger;

      if (isBetNow && !alertFired.has(m.fixture_id)) {
        // Browser notification
        if (Notification.permission === "granted")
          new Notification(`🚨 BET NOW — ${m.home.name} vs ${m.away.name}`, {
            body: `Score ${m.home.goals}–${m.away.goals} · ${m.minute}′ · ${m.best_bet || "Over 0.5"}`,
          });
        // Sound
        if (soundEnabled) playBetNowSound();
        setAlertFired(prev => new Set([...prev, m.fixture_id]));
      }

      if (isBetNow) newBetNow.push(m);
    });

    setBetNowGames(newBetNow.sort((a, b) => b.heat_score - a.heat_score));
  }, [matches, alertThreshold, alertFired, soundEnabled, playBetNowSound]);

  const toggleFav = id => setFavourites(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    try { localStorage.setItem('mt_favourites', JSON.stringify([...n])); } catch {}
    return n;
  });
  const toggleLeague = label => setHiddenLeagues(prev => {
    const n = new Set(prev);
    n.has(label) ? n.delete(label) : n.add(label);
    try { localStorage.setItem('mt_hidden_leagues', JSON.stringify([...n])); } catch {}
    return n;
  });

  const toggleFanduel = id => setFanduelGames(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    try { localStorage.setItem('mt_fanduel', JSON.stringify([...n])); } catch {}
    return n;
  });

  let displayed = [...matches];
  if (filterLive) displayed = displayed.filter(m => m.status !== "NS" && m.status !== "FT");
  if (showFavsOnly) displayed = displayed.filter(m => favourites.has(m.fixture_id));

  if (filter === "EXTREME") displayed = displayed.filter(m => m.heat_score >= 80);
  else if (filter === "HIGH") displayed = displayed.filter(m => m.heat_score >= 60 && m.heat_score < 80);
  else if (filter === "OTHER") displayed = displayed.filter(m => m.heat_score < 60);

  // Search filter — wired into displayed pipeline
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    displayed = displayed.filter(m =>
      m.home.name.toLowerCase().includes(q) ||
      m.away.name.toLowerCase().includes(q) ||
      m.league.toLowerCase().includes(q) ||
      m.country.toLowerCase().includes(q)
    );
  }
  const searchFiltered = displayed; // alias for result count

  // Filter out hidden leagues
  const filteredDisplayed = displayed.filter(m => !hiddenLeagues.has(`${m.country} — ${m.league}`));
  // Exclude favourited games from league groups (they show in watchlist already)
  const leagueDisplayed = favourites.size > 0
    ? filteredDisplayed.filter(m => !favourites.has(m.fixture_id))
    : filteredDisplayed;
  const groups = groupByLeague(leagueDisplayed);
  const extremeCount = matches.filter(m => m.heat_score >= 80).length;

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", color: "#111", fontFamily: "'Segoe UI', system-ui, sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes spin { to { transform: rotate(360deg) } }
        body { background: #f5f5f5; }
      `}</style>

      {evMatch !== null && <EVScanner match={evMatch} onClose={() => setEvMatch(null)} />}
      {showAlertPanel && <AlertPanel threshold={alertThreshold} onChange={v => {
                setAlertThreshold(v);
                try { localStorage.setItem('mt_threshold', String(v)); } catch {}
              }} onClose={() => setShowAlertPanel(false)} />}

      {/* ── HEADER ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "#fff", boxShadow: "0 1px 4px #0000000f" }}>

        {/* Title bar — mobile optimized */}
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #f0f0f0" }}>
          {/* Row 1: Logo + Live toggle + Refresh */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 22 }}>⚽</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#111", letterSpacing: "-0.02em" }}>
              Momentum<span style={{ color: "#e53935" }}>Track</span>
            </span>
            {extremeCount > 0 && (
              <span style={{ fontSize: 12, background: "#e53935", color: "#fff", borderRadius: 10, padding: "3px 8px", fontWeight: 700, animation: "blink 1.5s infinite" }}>
                {extremeCount} 🔥
              </span>
            )}
            <div style={{ flex: 1 }} />
            {/* ALL / LIVE toggle */}
            <div style={{ display: "flex", background: "#f0f0f0", borderRadius: 20, padding: 2, gap: 1 }}>
              <button onClick={() => setFilterLive(false)} style={{ padding: "5px 10px", borderRadius: 18, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, background: !filterLive ? "#1565c0" : "transparent", color: !filterLive ? "#fff" : "#aaa" }}>ALL</button>
              <button onClick={() => setFilterLive(true)} style={{ padding: "5px 10px", borderRadius: 18, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, background: filterLive ? "#e53935" : "transparent", color: filterLive ? "#fff" : "#aaa" }}>● LIVE</button>
            </div>

            {/* EV Scanner */}
            <button onClick={() => setShowEV(v => !v)} style={{ background: showEV ? "#1565c0" : "#fafafa", border: `1px solid ${showEV ? "#1565c0" : "#e0e0e0"}`, borderRadius: 8, padding: "5px 9px", cursor: "pointer", fontSize: 12, fontWeight: 700, color: showEV ? "#fff" : "#555" }}>📊 EV</button>
            {/* Refresh */}
            <button onClick={load} style={{ background: "#fafafa", border: "1px solid #e0e0e0", borderRadius: 8, padding: "5px 8px", cursor: "pointer", fontSize: 13, fontFamily: "monospace", color: countdown < 10 ? "#f57c00" : "#aaa", display: "flex", alignItems: "center", gap: 3 }}>
              {loading ? <span style={{ display: "inline-block", width: 10, height: 10, border: "2px solid #e53935", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .7s linear infinite" }} /> : "↻"} {countdown}s
            </button>
          </div>
          {/* Row 2: Action buttons + API status */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setShowFavsOnly(f => !f)} style={{ flex: 1, background: showFavsOnly ? "#fff8e1" : "#fafafa", border: `1px solid ${showFavsOnly ? "#f9a82566" : "#e0e0e0"}`, borderRadius: 8, padding: "7px 6px", cursor: "pointer", fontSize: 13, fontWeight: 700, color: showFavsOnly ? "#f9a825" : "#777", textAlign: "center" }}>
              ★ Watchlist{favourites.size > 0 ? ` (${favourites.size})` : ""}
            </button>
            {/* Search bar */}
            <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
              <span style={{ position: "absolute", left: 10, fontSize: 14, color: "#aaa", pointerEvents: "none" }}>🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Search team or league..."
                style={{
                  width: "100%", padding: "8px 32px 8px 32px",
                  border: `1.5px solid ${searchFocused ? "#1565c0" : "#e0e0e0"}`,
                  borderRadius: 8, fontSize: 13, color: "#333",
                  background: "#fff", outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color .2s",
                }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ position: "absolute", right: 8, background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#aaa", padding: 0, lineHeight: 1 }}>✕</button>
              )}
            </div>
            {/* Rate limit indicator */}
            {rateLimit && (
              <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, padding: "3px 7px", borderRadius: 6, whiteSpace: "nowrap",
                color: rateLimit.circuit_open ? "#c62828" : rateLimit.pct_left < 10 ? "#e65100" : rateLimit.pct_left < 20 ? "#f9a825" : "#43a047",
                background: rateLimit.circuit_open ? "#ffebee" : rateLimit.pct_left < 10 ? "#fff3e0" : "#f9f9f9",
                border: `1px solid ${rateLimit.circuit_open ? "#ef9a9a" : rateLimit.pct_left < 10 ? "#ffcc80" : "#e0e0e0"}`,
              }}>
                {rateLimit.circuit_open ? "🔴 PAUSED" : `API ${rateLimit.pct_left}%`}
              </span>
            )}
            <button onClick={() => setSoundEnabled(s => {
              const next = !s;
              try { localStorage.setItem('mt_sound', String(next)); } catch {}
              return next;
            })} style={{ background: soundEnabled ? "#e8f5e9" : "#fafafa", border: `1px solid ${soundEnabled ? "#a5d6a7" : "#e0e0e0"}`, borderRadius: 8, padding: "7px 10px", cursor: "pointer", fontSize: 16 }}>
              {soundEnabled ? "🔊" : "🔇"}
            </button>
            <button onClick={() => setShowAlertPanel(true)} style={{ background: "#fafafa", border: "1px solid #e0e0e0", borderRadius: 8, padding: "7px 10px", cursor: "pointer", fontSize: 16 }}>🔔</button>
          </div>
        </div>

        {/* Error banners */}
        {error === "no_matches" && (
          <div style={{ padding: "6px 14px", background: "#fffde7", borderBottom: "1.5px solid #fff9c4", fontSize: 15, color: "#f57f17" }}>
            ⚽ No live matches right now — showing demo data
          </div>
        )}
        {error === "api_error" && (
          <div style={{ padding: "6px 14px", background: "#ffebee", borderBottom: "1.5px solid #ffcdd2", fontSize: 15, color: "#c62828" }}>
            ⚠️ API error — check APISPORTS_KEY in Vercel env vars
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: "flex", borderBottom: "1.5px solid #f0f0f0" }}>
          {[
            { key: "ALL", label: `All ${matches.length} · v3` },
            { key: "EXTREME", label: `🔥 ${matches.filter(m => m.heat_score >= 80).length}` },
            { key: "HIGH", label: `🟠 ${matches.filter(m => m.heat_score >= 60 && m.heat_score < 80).length}` },
            { key: "OTHER", label: "Low" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)} style={{
              flex: 1, padding: "12px 6px", border: "none", cursor: "pointer",
              fontSize: 16, fontWeight: filter === key ? 700 : 400,
              background: "#fff",
              color: filter === key ? "#e53935" : "#aaa",
              borderBottom: filter === key ? "2px solid #e53935" : "2px solid transparent",
              transition: "all .15s",
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── MATCH LIST ── */}
      {/* ── BET NOW BANNER ── */}
      {betNowGames.length > 0 && (
        <div style={{ margin: "8px 0", animation: "betpulse 1.5s ease-in-out infinite" }}>
          <div style={{ background: "linear-gradient(135deg, #c62828, #e53935)", borderRadius: 10, padding: "12px 16px", boxShadow: "0 4px 20px #e5393544" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>🚨</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#fff", letterSpacing: "-0.01em" }}>BET NOW</span>
              <span style={{ fontSize: 12, background: "#ffffff33", color: "#fff", borderRadius: 10, padding: "2px 8px", fontWeight: 700 }}>{betNowGames.length} game{betNowGames.length > 1 ? "s" : ""}</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#ffffff99" }}>Probability trigger fired</span>
            </div>
            {betNowGames.map(m => (
              <div key={m.fixture_id} style={{ background: "#ffffff18", borderRadius: 8, padding: "10px 12px", marginBottom: betNowGames.indexOf(m) < betNowGames.length - 1 ? 6 : 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                    {m.home.name} {m.home.goals}–{m.away.goals} {m.away.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#ffffff99", marginTop: 2 }}>
                    {m.minute}′ · {m.league} · {m.best_bet || "Over 0.5 Next Goal"}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", fontFamily: "monospace", lineHeight: 1 }}>
                    {m.heat_score}
                  </div>
                  <div style={{ fontSize: 11, color: "#ffffff88", fontFamily: "monospace" }}>
                    heat
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search results summary */}
      {searchQuery.trim() && (
        <div style={{ padding: "8px 14px", background: "#e3f2fd", borderBottom: "1px solid #bbdefb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "#1565c0", fontWeight: 600 }}>
            🔍 "{searchQuery}" — {searchFiltered.length} result{searchFiltered.length !== 1 ? "s" : ""}
          </span>
          <button onClick={() => setSearchQuery('')} style={{ fontSize: 12, color: "#1565c0", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>Clear</button>
        </div>
      )}

      {loading && matches.length === 0 ? (
        <div style={{ textAlign: "center", color: "#666", padding: "60px 0" }}>
          <div style={{ display: "inline-block", width: 28, height: 28, border: "3px solid #e53935", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .8s linear infinite", marginBottom: 12 }} />
          <div style={{ fontSize: 17 }}>Loading live matches…</div>
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ textAlign: "center", color: "#666", padding: "60px 0", fontSize: 17 }}>
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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "linear-gradient(90deg,#fff8e1,#fff)", borderBottom: "1.5px solid #ffe082", borderTop: "1.5px solid #ffe082" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: 19, color: "#f9a825" }}>★</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#f57f17", letterSpacing: "0.03em" }}>MY WATCHLIST</span>
                    <span style={{ fontSize: 14, background: "#f9a825", color: "#fff", borderRadius: 10, padding: "3px 9px", fontWeight: 700 }}>{favMatches.length}</span>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#f57c00", fontFamily: "monospace", background: "#fff8e1", border: "1.5px solid #ffe08266", borderRadius: 4, padding: "6px 11px" }}>
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
                    onEVOpen={setEvMatch}
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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "linear-gradient(90deg,#e8f5e9,#fff)", borderBottom: "1.5px solid #a5d6a7", borderTop: "1.5px solid #a5d6a7" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: 18 }}>🟢</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#2e7d32", letterSpacing: "0.03em" }}>FANDUEL LIVE</span>
                    <span style={{ fontSize: 14, background: "#43a047", color: "#fff", borderRadius: 10, padding: "3px 9px", fontWeight: 700 }}>{fdMatches.length}</span>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#2e7d32", fontFamily: "monospace", background: "#e8f5e9", border: "1.5px solid #a5d6a766", borderRadius: 4, padding: "6px 11px" }}>
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
                    onEVOpen={setEvMatch}
                  />
                ))}
              </div>
            );
          })()}

          {/* LEAGUE GROUPS */}
          {groups.map(group => (
            <div key={group.label}>
              <LeagueHeader label={group.label} topHeat={Math.max(...group.matches.map(m => m.heat_score))} onHide={toggleLeague} />
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
                  onEVOpen={setEvMatch}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Hidden leagues restore bar */}
      {hiddenLeagues.size > 0 && (
        <div style={{ margin: "12px 14px", padding: "10px 14px", background: "#fff3e0", border: "1.5px solid #ffcc80", borderRadius: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#e65100" }}>👁️ Hidden Leagues ({hiddenLeagues.size})</span>
            <button onClick={() => { setHiddenLeagues(new Set()); try { localStorage.removeItem('mt_hidden_leagues'); } catch {} }} style={{ fontSize: 12, background: "#ff9800", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontWeight: 700 }}>
              Show All
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[...hiddenLeagues].map(league => (
              <button key={league} onClick={() => toggleLeague(league)} style={{ fontSize: 12, background: "#fff", border: "1px solid #ffcc80", borderRadius: 16, padding: "4px 10px", cursor: "pointer", color: "#e65100", fontWeight: 600 }}>
                + {league.split(" — ")[1] || league}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ height: 40 }} />
    </div>
  );
}
