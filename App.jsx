import { useState, useEffect, useCallback, useRef } from "react";

// ─── DEMO DATA ────────────────────────────────────────────────────────────────
const BASE_MATCHES = [
  {
    fixture_id: 1001, league: "Premier League", country: "England", minute: 87, status: "2H",
    home: { name: "Man City", goals: 1, possession: 68, shots_on_target: 9, corners: 7, dangerous_attacks: 42, yellow_cards: 2, red_cards: 0, favorite: true },
    away: { name: "Arsenal", goals: 1, possession: 32, shots_on_target: 3, corners: 2, dangerous_attacks: 18, yellow_cards: 1, red_cards: 1, favorite: false },
    dangerous_attacks_per_min: 2.41, heat_score: 91, alert_level: "🔥 EXTREME",
    odds: { next_goal_home: 1.65, next_goal_away: 3.20, over_05: 1.08 },
    breakdown: { high_pressure: 35, red_card_multiplier: 20, vila_effect: 31, triggers: ["Dominant possession: Man City 68%", "High attack rate: 2.41/min", "⚡ High Pressure Zone activated", "🟥 Red Card Multiplier: Arsenal (fav) down a man", "⏱️ Vila Effect (2nd half): 3′ remaining"] },
    timeline: [12,18,22,28,35,41,48,55,60,67,72,78,85,91]
  },
  {
    fixture_id: 1007, league: "Scottish Prem", country: "Scotland", minute: 85, status: "2H",
    home: { name: "Celtic", goals: 2, possession: 54, shots_on_target: 7, corners: 6, dangerous_attacks: 38, yellow_cards: 1, red_cards: 0, favorite: true },
    away: { name: "Rangers", goals: 2, possession: 46, shots_on_target: 5, corners: 5, dangerous_attacks: 29, yellow_cards: 2, red_cards: 0, favorite: false },
    dangerous_attacks_per_min: 1.85, heat_score: 78, alert_level: "🟠 HIGH",
    odds: { next_goal_home: 2.10, next_goal_away: 2.80, over_05: 1.12 },
    breakdown: { high_pressure: 22, red_card_multiplier: 0, vila_effect: 28, triggers: ["High attack rate: 1.85/min", "⏱️ Vila Effect (2nd half): 5′ remaining"] },
    timeline: [8,14,20,28,34,40,44,50,58,63,70,74,78]
  },
  {
    fixture_id: 1002, league: "La Liga", country: "Spain", minute: 38, status: "1H",
    home: { name: "Real Madrid", goals: 0, possession: 52, shots_on_target: 4, corners: 4, dangerous_attacks: 24, yellow_cards: 1, red_cards: 0, favorite: true },
    away: { name: "Barcelona", goals: 0, possession: 48, shots_on_target: 5, corners: 3, dangerous_attacks: 22, yellow_cards: 0, red_cards: 0, favorite: false },
    dangerous_attacks_per_min: 1.68, heat_score: 67, alert_level: "🟠 HIGH",
    odds: { next_goal_home: 2.40, next_goal_away: 2.60, over_05: 1.18 },
    breakdown: { high_pressure: 18, red_card_multiplier: 0, vila_effect: 22, triggers: ["High attack rate: 1.68/min", "⏱️ Vila Effect (1st half): 7′ remaining"] },
    timeline: [10,18,25,32,38,45,52,58,65,67]
  },
  {
    fixture_id: 1004, league: "Ligue 1", country: "France", minute: 56, status: "2H",
    home: { name: "PSG", goals: 2, possession: 61, shots_on_target: 6, corners: 5, dangerous_attacks: 35, yellow_cards: 0, red_cards: 0, favorite: true },
    away: { name: "Lyon", goals: 1, possession: 39, shots_on_target: 2, corners: 1, dangerous_attacks: 14, yellow_cards: 2, red_cards: 0, favorite: false },
    dangerous_attacks_per_min: 1.21, heat_score: 52, alert_level: "🟡 MEDIUM",
    odds: { next_goal_home: 1.90, next_goal_away: 3.80, over_05: 1.22 },
    breakdown: { high_pressure: 28, red_card_multiplier: 0, vila_effect: 0, triggers: ["Dominant possession: PSG 61%"] },
    timeline: [15,24,30,38,45,52,56]
  },
  {
    fixture_id: 1003, league: "Bundesliga", country: "Germany", minute: 14, status: "1H",
    home: { name: "Bayern Munich", goals: 1, possession: 67, shots_on_target: 3, corners: 2, dangerous_attacks: 18, yellow_cards: 0, red_cards: 0, favorite: true },
    away: { name: "Dortmund", goals: 0, possession: 33, shots_on_target: 1, corners: 1, dangerous_attacks: 7, yellow_cards: 0, red_cards: 0, favorite: false },
    dangerous_attacks_per_min: 1.11, heat_score: 38, alert_level: "🟡 MEDIUM",
    odds: { next_goal_home: 1.55, next_goal_away: 4.50, over_05: 1.30 },
    breakdown: { high_pressure: 12, red_card_multiplier: 0, vila_effect: 0, triggers: ["Dominant possession: Bayern 67%"] },
    timeline: [8,14]
  },
  {
    fixture_id: 1005, league: "Serie A", country: "Italy", minute: 61, status: "2H",
    home: { name: "Inter Milan", goals: 1, possession: 44, shots_on_target: 3, corners: 3, dangerous_attacks: 22, yellow_cards: 1, red_cards: 0, favorite: false },
    away: { name: "AC Milan", goals: 1, possession: 56, shots_on_target: 4, corners: 4, dangerous_attacks: 28, yellow_cards: 1, red_cards: 0, favorite: true },
    dangerous_attacks_per_min: 0.98, heat_score: 29, alert_level: "🟢 LOW",
    odds: { next_goal_home: 3.10, next_goal_away: 2.20, over_05: 1.40 },
    breakdown: { high_pressure: 10, red_card_multiplier: 0, vila_effect: 0, triggers: [] },
    timeline: [20,35,45,55,61]
  },
  {
    fixture_id: 1006, league: "Eredivisie", country: "Netherlands", minute: 23, status: "1H",
    home: { name: "Ajax", goals: 0, possession: 55, shots_on_target: 2, corners: 1, dangerous_attacks: 12, yellow_cards: 0, red_cards: 0, favorite: true },
    away: { name: "PSV", goals: 0, possession: 45, shots_on_target: 1, corners: 1, dangerous_attacks: 9, yellow_cards: 0, red_cards: 0, favorite: false },
    dangerous_attacks_per_min: 0.74, heat_score: 18, alert_level: "🟢 LOW",
    odds: { next_goal_home: 2.60, next_goal_away: 3.00, over_05: 1.55 },
    breakdown: { high_pressure: 5, red_card_multiplier: 0, vila_effect: 0, triggers: [] },
    timeline: [12,23]
  },
];

const LEAGUES = ["All Leagues", "Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1", "Scottish Prem", "Eredivisie"];

// ─── MINI SPARKLINE ───────────────────────────────────────────────────────────
function Sparkline({ data, width = 120, height = 32 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  const last = data[data.length - 1];
  const color = last >= 80 ? "#ff3b30" : last >= 60 ? "#ff9500" : last >= 40 ? "#ffd60a" : "#30d158";
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`sg-${data[0]}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ─── MOMENTUM TIMELINE GRAPH ──────────────────────────────────────────────────
function MomentumGraph({ timeline, currentMinute }) {
  const W = 280, H = 60;
  if (!timeline || timeline.length < 2) return null;
  const max = 100, min = 0;
  const pts = timeline.map((v, i) => {
    const x = (i / (timeline.length - 1)) * W;
    const y = H - ((v - min) / (max - min)) * H;
    return `${x},${y}`;
  }).join(" ");
  const areaClose = ` ${W},${H} 0,${H}`;
  const color = timeline[timeline.length - 1] >= 80 ? "#ff3b30" : "#ff9500";

  return (
    <div style={{ marginTop: 12, padding: "10px 12px", background: "#ffffff04", borderRadius: 8, border: "1px solid #ffffff08" }}>
      <div style={{ fontSize: 10, color: "#444", fontFamily: "monospace", marginBottom: 8, letterSpacing: "0.07em" }}>MOMENTUM TIMELINE</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="mg-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[25, 50, 75].map(y => (
          <line key={y} x1="0" y1={H - (y / 100) * H} x2={W} y2={H - (y / 100) * H}
            stroke="#ffffff06" strokeWidth="1" strokeDasharray="3,4" />
        ))}
        <polygon points={`0,${H - ((timeline[0] - min) / (max - min)) * H} ${pts} ${areaClose}`}
          fill="url(#mg-fill)" />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {/* Current point */}
        <circle cx={(timeline.length - 1) / (timeline.length - 1) * W}
          cy={H - ((timeline[timeline.length - 1] - min) / (max - min)) * H}
          r="3" fill={color} />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#333", fontFamily: "monospace", marginTop: 4 }}>
        <span>0′</span><span>45′</span><span>{currentMinute}′</span>
      </div>
    </div>
  );
}

// ─── ODDS DISPLAY ─────────────────────────────────────────────────────────────
function OddsDisplay({ odds, homeName, awayName }) {
  if (!odds) return null;
  const badges = [
    { label: `⚽ ${homeName}`, val: odds.next_goal_home, color: "#0a84ff" },
    { label: `⚽ ${awayName}`, val: odds.next_goal_away, color: "#ff6b35" },
    { label: "Over 0.5", val: odds.over_05, color: "#30d158" },
  ];
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 10, color: "#444", fontFamily: "monospace", marginBottom: 6, letterSpacing: "0.07em" }}>LIVE ODDS</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {badges.map(({ label, val, color }) => (
          <div key={label} style={{
            flex: 1, minWidth: 70, padding: "8px 10px", borderRadius: 8,
            background: "#ffffff04", border: `1px solid ${color}33`,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 9, color: "#555", fontFamily: "monospace", marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color, fontFamily: "monospace" }}>{val.toFixed(2)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── HEAT RING ────────────────────────────────────────────────────────────────
function HeatRing({ score }) {
  const r = 26, cx = 34, cy = 34;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? "#ff3b30" : score >= 60 ? "#ff9500" : score >= 40 ? "#ffd60a" : "#30d158";
  const glow = score >= 80 ? "drop-shadow(0 0 8px #ff3b3088)" : score >= 60 ? "drop-shadow(0 0 5px #ff950066)" : "none";
  return (
    <svg width="68" height="68" style={{ filter: glow, flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ffffff0d" strokeWidth="5" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: "stroke-dasharray 0.8s ease" }} />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize="12" fontWeight="800" fontFamily="monospace">{score}</text>
    </svg>
  );
}

// ─── STAT BAR ─────────────────────────────────────────────────────────────────
function StatBar({ label, homeVal, awayVal, fmt = v => v }) {
  const total = (homeVal + awayVal) || 1;
  const hp = (homeVal / total) * 100;
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#666", marginBottom: 3, fontFamily: "monospace" }}>
        <span style={{ color: "#bbb" }}>{fmt(homeVal)}</span>
        <span style={{ color: "#444", letterSpacing: "0.05em" }}>{label}</span>
        <span style={{ color: "#bbb" }}>{fmt(awayVal)}</span>
      </div>
      <div style={{ height: 4, background: "#ffffff0a", borderRadius: 2, overflow: "hidden", display: "flex" }}>
        <div style={{ width: `${hp}%`, background: "linear-gradient(90deg,#0a84ff,#5ac8fa)", transition: "width .5s ease" }} />
        <div style={{ flex: 1, background: "linear-gradient(90deg,#ff6b35,#ff3b30)" }} />
      </div>
    </div>
  );
}

function BreakdownBar({ label, val, max, color }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "monospace", marginBottom: 3 }}>
        <span style={{ color: "#555" }}>{label}</span>
        <span style={{ color }}>{val}/{max}</span>
      </div>
      <div style={{ height: 4, background: "#ffffff08", borderRadius: 2 }}>
        <div style={{ width: `${(val / max) * 100}%`, height: "100%", background: color, borderRadius: 2, transition: "width .6s ease" }} />
      </div>
    </div>
  );
}

// ─── MATCH CARD ───────────────────────────────────────────────────────────────
function MatchCard({ match, expanded, onToggle, isFav, onFavToggle, alertThreshold }) {
  const s = match.heat_score;
  const border = s >= 80 ? "#ff3b3066" : s >= 60 ? "#ff950044" : s >= 40 ? "#ffd60a22" : "#30d15818";
  const bgFrom = s >= 80 ? "#180808" : "#111111";
  const isVila = (match.minute >= 35 && match.minute <= 45) || (match.minute >= 80 && match.minute <= 93);
  const isAlert = s >= alertThreshold;

  return (
    <div style={{
      background: `linear-gradient(135deg, ${bgFrom}, #0c0c0c)`,
      border: `1px solid ${isAlert && s >= 80 ? "#ff3b3066" : border}`,
      borderRadius: 12, padding: "14px 18px", cursor: "pointer",
      transition: "all 0.2s", position: "relative", overflow: "hidden",
      boxShadow: s >= 80 ? "0 0 24px #ff3b3018, inset 0 1px 0 #ff3b3010" : "0 2px 10px #00000050",
    }}>
      {s >= 80 && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse at 50% 0%, #ff3b3010, transparent 70%)", animation: "mpulse 2s ease-in-out infinite" }} />
      )}

      {/* FAV STAR */}
      <button onClick={e => { e.stopPropagation(); onFavToggle(match.fixture_id); }} style={{
        position: "absolute", top: 12, right: 14,
        background: "none", border: "none", cursor: "pointer",
        fontSize: 16, opacity: isFav ? 1 : 0.2, transition: "opacity 0.2s",
        filter: isFav ? "drop-shadow(0 0 4px #ffd60a)" : "none",
      }}>⭐</button>

      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <HeatRing score={s} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: "#444", fontFamily: "monospace", letterSpacing: "0.07em" }}>
              {match.country} · {match.league}
            </span>
            {isVila && <span style={{ fontSize: 9, background: "#ffd60a18", color: "#ffd60a", border: "1px solid #ffd60a44", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace" }}>VILA ⏱</span>}
            {isAlert && s < 80 && <span style={{ fontSize: 9, background: "#ff950018", color: "#ff9500", border: "1px solid #ff950044", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace" }}>🔔 ALERT</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#eee" }}>{match.home.name}</span>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", fontFamily: "monospace", background: "#ffffff0a", borderRadius: 7, padding: "3px 12px", border: "1px solid #ffffff0d", letterSpacing: "0.1em" }}>
              {match.home.goals} – {match.away.goals}
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#eee" }}>{match.away.name}</span>
          </div>
          {/* Mini sparkline inline */}
          <div style={{ marginTop: 5 }}>
            <Sparkline data={match.timeline} width={110} height={22} />
          </div>
          <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap" }}>
            {match.home.red_cards > 0 && <span style={{ fontSize: 9, background: "#ff3b3018", color: "#ff6b6b", border: "1px solid #ff3b3044", borderRadius: 4, padding: "1px 6px", fontFamily: "monospace" }}>🟥 {match.home.name} RED</span>}
            {match.away.red_cards > 0 && <span style={{ fontSize: 9, background: "#ff3b3018", color: "#ff6b6b", border: "1px solid #ff3b3044", borderRadius: 4, padding: "1px 6px", fontFamily: "monospace" }}>🟥 {match.away.name} RED</span>}
          </div>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0, paddingRight: 22 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#30d158", fontFamily: "monospace", lineHeight: 1 }}>{match.minute}′</div>
          <div style={{ fontSize: 9, color: "#333", marginTop: 1, fontFamily: "monospace" }}>{match.status}</div>
          <div style={{ fontSize: 10, marginTop: 5, color: s >= 80 ? "#ff3b30" : s >= 60 ? "#ff9500" : "#555" }}>{match.alert_level}</div>
        </div>
      </div>

      {expanded && (
        <div onClick={onToggle} style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #ffffff08" }}>
          {/* Odds */}
          <OddsDisplay odds={match.odds} homeName={match.home.name} awayName={match.away.name} />

          {/* Momentum graph */}
          <MomentumGraph timeline={match.timeline} currentMinute={match.minute} />

          {/* Stats + Breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: "#444", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 10 }}>MATCH STATS</div>
              <StatBar label="POSSESSION" homeVal={match.home.possession} awayVal={match.away.possession} fmt={v => `${v}%`} />
              <StatBar label="SHOTS ON TGT" homeVal={match.home.shots_on_target} awayVal={match.away.shots_on_target} />
              <StatBar label="CORNERS" homeVal={match.home.corners} awayVal={match.away.corners} />
              <StatBar label="DANGER ATTACKS" homeVal={match.home.dangerous_attacks} awayVal={match.away.dangerous_attacks} />
              <div style={{ fontSize: 10, color: "#444", fontFamily: "monospace", marginTop: 8 }}>⚡ {match.dangerous_attacks_per_min} attacks/min</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#444", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 10 }}>HEAT BREAKDOWN</div>
              <BreakdownBar label="High Pressure" val={match.breakdown.high_pressure} max={35} color="#0a84ff" />
              <BreakdownBar label="Red Card ×" val={match.breakdown.red_card_multiplier} max={30} color="#ff3b30" />
              <BreakdownBar label="Vila Effect" val={match.breakdown.vila_effect} max={35} color="#ffd60a" />
              <div style={{ marginTop: 10 }}>
                {match.breakdown.triggers.map((t, i) => (
                  <div key={i} style={{ fontSize: 9.5, color: "#777", fontFamily: "monospace", marginBottom: 4, lineHeight: 1.4 }}>{t}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ALERT SETTINGS PANEL ─────────────────────────────────────────────────────
function AlertPanel({ threshold, onChange, onClose }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200, background: "#000000cc",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#111", border: "1px solid #ffffff14", borderRadius: 14,
        padding: 24, width: "100%", maxWidth: 340,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 6 }}>🔔 Alert Settings</div>
        <div style={{ fontSize: 11, color: "#555", fontFamily: "monospace", marginBottom: 20 }}>
          Browser notification fires when Heat Score ≥ threshold
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: "#888" }}>Alert threshold</span>
            <span style={{ fontSize: 16, fontWeight: 800, fontFamily: "monospace", color: threshold >= 80 ? "#ff3b30" : threshold >= 60 ? "#ff9500" : "#ffd60a" }}>{threshold}</span>
          </div>
          <input type="range" min="40" max="95" step="5" value={threshold}
            onChange={e => onChange(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#ff3b30", cursor: "pointer" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#333", fontFamily: "monospace", marginTop: 4 }}>
            <span>40 MEDIUM</span><span>60 HIGH</span><span>80 EXTREME</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {[60, 70, 80].map(v => (
            <button key={v} onClick={() => onChange(v)} style={{
              padding: "8px 0", borderRadius: 8, cursor: "pointer",
              border: threshold === v ? "1px solid #ff3b3066" : "1px solid #ffffff0a",
              background: threshold === v ? "#ff3b3018" : "#ffffff05",
              color: threshold === v ? "#ff3b30" : "#555",
              fontSize: 12, fontFamily: "monospace", fontWeight: 700,
            }}>{v}</button>
          ))}
        </div>

        <button onClick={onClose} style={{
          width: "100%", marginTop: 16, padding: "10px 0", borderRadius: 8,
          background: "#ffffff08", border: "1px solid #ffffff14",
          color: "#aaa", fontSize: 12, cursor: "pointer", fontFamily: "monospace",
        }}>Done</button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
const REFRESH = 60;

export default function App() {
  const [matches, setMatches] = useState(() =>
    BASE_MATCHES.map(m => ({ ...m, timeline: [...(m.timeline || [m.heat_score])] }))
  );
  const [countdown, setCountdown] = useState(REFRESH);
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [leagueFilter, setLeagueFilter] = useState("All Leagues");
  const [favourites, setFavourites] = useState(new Set());
  const [alertFired, setAlertFired] = useState(new Set());
  const [alertThreshold, setAlertThreshold] = useState(80);
  const [showAlertPanel, setShowAlertPanel] = useState(false);
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    setMatches(prev => prev.map(m => {
      const jitter = Math.floor((Math.random() - 0.38) * 6);
      const newScore = Math.min(100, Math.max(0, m.heat_score + jitter));
      const newTimeline = [...m.timeline, newScore].slice(-20);
      return { ...m, heat_score: newScore, minute: Math.min(m.minute + 1, 93), timeline: newTimeline };
    }).sort((a, b) => b.heat_score - a.heat_score));
    setCountdown(REFRESH);
    setTick(t => t + 1);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown(c => { if (c <= 1) { refresh(); return REFRESH; } return c - 1; });
    }, 1000);
    return () => clearInterval(id);
  }, [refresh]);

  // Notifications
  useEffect(() => {
    matches.forEach(m => {
      if (m.heat_score >= alertThreshold && !alertFired.has(m.fixture_id)) {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(`🔔 Heat Alert (≥${alertThreshold})`, { body: `${m.home.name} vs ${m.away.name} — Score ${m.heat_score} (${m.minute}′)` });
        }
        setAlertFired(prev => new Set([...prev, m.fixture_id]));
      }
    });
  }, [matches, alertThreshold, alertFired]);

  const toggleFav = id => setFavourites(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  // Filter pipeline
  let displayed = [...matches];
  if (showFavsOnly) displayed = displayed.filter(m => favourites.has(m.fixture_id));
  if (leagueFilter !== "All Leagues") displayed = displayed.filter(m => m.league === leagueFilter);
  if (filter === "EXTREME") displayed = displayed.filter(m => m.heat_score >= 80);
  else if (filter === "HIGH") displayed = displayed.filter(m => m.heat_score >= 60 && m.heat_score < 80);
  else if (filter === "OTHER") displayed = displayed.filter(m => m.heat_score < 60);

  const extremeCount = matches.filter(m => m.heat_score >= 80).length;
  const alertCount = matches.filter(m => m.heat_score >= alertThreshold).length;

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#e0e0e0", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes mpulse { 0%,100%{opacity:.3} 50%{opacity:1} }
        @keyframes mblink { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes mslide { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#2a2a2a;border-radius:2px}
        input[type=range]::-webkit-slider-thumb { width:18px; height:18px; }
        @media(max-width:600px){
          .header-row { flex-direction: column; align-items: flex-start !important; gap: 10px !important; }
          .filter-row { overflow-x: auto; padding-bottom: 4px; }
          .league-row { overflow-x: auto; padding-bottom: 4px; }
          .card-teams { flex-wrap: wrap; }
          .expand-grid { grid-template-columns: 1fr !important; }
          .odds-row { flex-direction: column; }
        }
      `}</style>

      {showAlertPanel && <AlertPanel threshold={alertThreshold} onChange={setAlertThreshold} onClose={() => setShowAlertPanel(false)} />}

      {/* ── HEADER ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "#080808f0", backdropFilter: "blur(16px)", borderBottom: "1px solid #ffffff08", padding: "14px 16px 10px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>

          {/* Top row */}
          <div className="header-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>⚽</span>
              <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.03em", color: "#fff" }}>
                MOMENTUM<span style={{ color: "#ff3b30" }}>TRACK</span>
              </span>
              {extremeCount > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, background: "#ff3b30", color: "#fff", borderRadius: 20, padding: "2px 8px", fontFamily: "monospace", animation: "mblink 1.4s ease-in-out infinite" }}>
                  {extremeCount} 🔥
                </span>
              )}
            </div>

            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {/* Favs toggle */}
              <button onClick={() => setShowFavsOnly(f => !f)} style={{
                padding: "7px 11px", borderRadius: 8, cursor: "pointer",
                border: showFavsOnly ? "1px solid #ffd60a66" : "1px solid #ffffff0a",
                background: showFavsOnly ? "#ffd60a18" : "#ffffff06",
                color: showFavsOnly ? "#ffd60a" : "#444", fontSize: 13,
                transition: "all 0.15s",
              }} title="Watchlist">⭐ {favourites.size > 0 && <span style={{ fontSize: 10 }}>{favourites.size}</span>}</button>

              {/* Alert settings */}
              <button onClick={() => setShowAlertPanel(true)} style={{
                padding: "7px 11px", borderRadius: 8, cursor: "pointer",
                border: alertCount > 0 ? "1px solid #ff950066" : "1px solid #ffffff0a",
                background: alertCount > 0 ? "#ff950018" : "#ffffff06",
                color: alertCount > 0 ? "#ff9500" : "#444", fontSize: 13,
                transition: "all 0.15s",
              }} title="Alert Settings">🔔 <span style={{ fontSize: 10, fontFamily: "monospace" }}>{alertThreshold}</span></button>

              {/* Refresh */}
              <button onClick={refresh} style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "#ffffff06", border: "1px solid #ffffff0a",
                borderRadius: 8, padding: "7px 12px", cursor: "pointer",
                color: countdown < 10 ? "#ff9500" : "#444", fontSize: 12, fontFamily: "monospace",
              }}>
                ↻ <span>{countdown}s</span>
              </button>
            </div>
          </div>

          {/* League filter */}
          <div className="league-row" style={{ display: "flex", gap: 5, marginBottom: 8, flexWrap: "nowrap" }}>
            {LEAGUES.map(l => (
              <button key={l} onClick={() => setLeagueFilter(l)} style={{
                fontSize: 10, fontFamily: "monospace", padding: "4px 10px", borderRadius: 6,
                cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s", flexShrink: 0,
                border: leagueFilter === l ? "1px solid #0a84ff66" : "1px solid #ffffff08",
                background: leagueFilter === l ? "#0a84ff18" : "transparent",
                color: leagueFilter === l ? "#0a84ff" : "#444",
              }}>{l === "All Leagues" ? "🌍 All" : l}</button>
            ))}
          </div>

          {/* Heat filter */}
          <div className="filter-row" style={{ display: "flex", gap: 5 }}>
            {[
              { key: "ALL", label: `ALL (${matches.length})` },
              { key: "EXTREME", label: `🔥 EXTREME (${matches.filter(m => m.heat_score >= 80).length})` },
              { key: "HIGH", label: `🟠 HIGH (${matches.filter(m => m.heat_score >= 60 && m.heat_score < 80).length})` },
              { key: "OTHER", label: "OTHER" },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setFilter(key)} style={{
                fontSize: 10, fontFamily: "monospace", padding: "4px 10px", borderRadius: 6,
                cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s", flexShrink: 0,
                border: filter === key ? "1px solid #ffffff2a" : "1px solid #ffffff08",
                background: filter === key ? "#ffffff12" : "transparent",
                color: filter === key ? "#fff" : "#444",
              }}>{label}</button>
            ))}
          </div>

          <div style={{ fontSize: 10, color: "#2a2a2a", fontFamily: "monospace", marginTop: 8 }}>
            ● DEMO · {displayed.length} shown · refresh #{tick}
          </div>
        </div>
      </div>

      {/* ── MATCH LIST ── */}
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "14px 16px 40px" }}>
        {displayed.length === 0 ? (
          <div style={{ textAlign: "center", color: "#2a2a2a", padding: "60px 0", fontFamily: "monospace" }}>
            {showFavsOnly ? "No watchlisted matches. Star a game to track it." : "No matches in this category."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {displayed.map((m, i) => (
              <div key={m.fixture_id} style={{ animation: `mslide 0.25s ease ${i * 0.04}s both` }}>
                <MatchCard
                  match={m}
                  expanded={expanded === m.fixture_id}
                  onToggle={() => setExpanded(expanded === m.fixture_id ? null : m.fixture_id)}
                  isFav={favourites.has(m.fixture_id)}
                  onFavToggle={toggleFav}
                  alertThreshold={alertThreshold}
                />
              </div>
            ))}
          </div>
        )}

        {/* Legend */}
        <div style={{ marginTop: 24, padding: 14, borderRadius: 10, background: "#0d0d0d", border: "1px solid #ffffff06" }}>
          <div style={{ fontSize: 10, color: "#2a2a2a", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 10 }}>HEAT SCORE ALGORITHM</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 10 }}>
            {[
              { color: "#0a84ff", label: "High Pressure", pts: "35pt", desc: "Poss >65% + DA >1.5/min" },
              { color: "#ff3b30", label: "Red Card ×", pts: "30pt", desc: "Fav down a man while level/losing" },
              { color: "#ffd60a", label: "Vila Effect", pts: "35pt", desc: "35–45′ or 80–93′ window" },
            ].map(({ color, label, pts, desc }) => (
              <div key={label} style={{ padding: 8, background: "#ffffff03", borderRadius: 7, border: "1px solid #ffffff05" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#aaa" }}>{label}</span>
                  <span style={{ fontSize: 9, color, fontFamily: "monospace", marginLeft: "auto" }}>{pts}</span>
                </div>
                <div style={{ fontSize: 9, color: "#3a3a3a", lineHeight: 1.4 }}>{desc}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 9, color: "#222", fontFamily: "monospace" }}>
            Click card to expand · ⭐ star to watchlist · 🔔 set custom alert threshold · auto-refresh {REFRESH}s
          </div>
        </div>
      </div>
    </div>
  );
}
