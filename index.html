import { useState, useEffect, useCallback, useRef } from "react";

const DEMO_MATCHES = [
  {
    fixture_id: 1001, league: "Premier League", country: "England", minute: 87, status: "2H",
    home: { name: "Man City", goals: 1, possession: 68, shots_on_target: 9, corners: 7, dangerous_attacks: 42, yellow_cards: 2, red_cards: 0, favorite: true },
    away: { name: "Arsenal", goals: 1, possession: 32, shots_on_target: 3, corners: 2, dangerous_attacks: 18, yellow_cards: 1, red_cards: 1, favorite: false },
    dangerous_attacks_per_min: 2.41, heat_score: 91, alert_level: "🔥 EXTREME",
    breakdown: { high_pressure: 35, red_card_multiplier: 20, vila_effect: 31, triggers: ["Dominant possession: Man City 68%", "High attack rate: 2.41/min", "⚡ High Pressure Zone activated", "🟥 Red Card Multiplier: Arsenal (fav) down a man", "⏱️ Vila Effect (2nd half): 3′ remaining"] }
  },
  {
    fixture_id: 1007, league: "Scottish Prem", country: "Scotland", minute: 85, status: "2H",
    home: { name: "Celtic", goals: 2, possession: 54, shots_on_target: 7, corners: 6, dangerous_attacks: 38, yellow_cards: 1, red_cards: 0, favorite: true },
    away: { name: "Rangers", goals: 2, possession: 46, shots_on_target: 5, corners: 5, dangerous_attacks: 29, yellow_cards: 2, red_cards: 0, favorite: false },
    dangerous_attacks_per_min: 1.85, heat_score: 78, alert_level: "🟠 HIGH",
    breakdown: { high_pressure: 22, red_card_multiplier: 0, vila_effect: 28, triggers: ["High attack rate: 1.85/min", "⏱️ Vila Effect (2nd half): 5′ remaining"] }
  },
  {
    fixture_id: 1002, league: "La Liga", country: "Spain", minute: 38, status: "1H",
    home: { name: "Real Madrid", goals: 0, possession: 52, shots_on_target: 4, corners: 4, dangerous_attacks: 24, yellow_cards: 1, red_cards: 0, favorite: true },
    away: { name: "Barcelona", goals: 0, possession: 48, shots_on_target: 5, corners: 3, dangerous_attacks: 22, yellow_cards: 0, red_cards: 0, favorite: false },
    dangerous_attacks_per_min: 1.68, heat_score: 67, alert_level: "🟠 HIGH",
    breakdown: { high_pressure: 18, red_card_multiplier: 0, vila_effect: 22, triggers: ["High attack rate: 1.68/min", "⏱️ Vila Effect (1st half): 7′ remaining"] }
  },
  {
    fixture_id: 1004, league: "Ligue 1", country: "France", minute: 56, status: "2H",
    home: { name: "PSG", goals: 2, possession: 61, shots_on_target: 6, corners: 5, dangerous_attacks: 35, yellow_cards: 0, red_cards: 0, favorite: true },
    away: { name: "Lyon", goals: 1, possession: 39, shots_on_target: 2, corners: 1, dangerous_attacks: 14, yellow_cards: 2, red_cards: 0, favorite: false },
    dangerous_attacks_per_min: 1.21, heat_score: 52, alert_level: "🟡 MEDIUM",
    breakdown: { high_pressure: 28, red_card_multiplier: 0, vila_effect: 0, triggers: ["Dominant possession: PSG 61%"] }
  },
  {
    fixture_id: 1003, league: "Bundesliga", country: "Germany", minute: 14, status: "1H",
    home: { name: "Bayern Munich", goals: 1, possession: 67, shots_on_target: 3, corners: 2, dangerous_attacks: 18, yellow_cards: 0, red_cards: 0, favorite: true },
    away: { name: "Dortmund", goals: 0, possession: 33, shots_on_target: 1, corners: 1, dangerous_attacks: 7, yellow_cards: 0, red_cards: 0, favorite: false },
    dangerous_attacks_per_min: 1.11, heat_score: 38, alert_level: "🟡 MEDIUM",
    breakdown: { high_pressure: 12, red_card_multiplier: 0, vila_effect: 0, triggers: ["Dominant possession: Bayern 67%"] }
  },
  {
    fixture_id: 1005, league: "Serie A", country: "Italy", minute: 61, status: "2H",
    home: { name: "Inter Milan", goals: 1, possession: 44, shots_on_target: 3, corners: 3, dangerous_attacks: 22, yellow_cards: 1, red_cards: 0, favorite: false },
    away: { name: "AC Milan", goals: 1, possession: 56, shots_on_target: 4, corners: 4, dangerous_attacks: 28, yellow_cards: 1, red_cards: 0, favorite: true },
    dangerous_attacks_per_min: 0.98, heat_score: 29, alert_level: "🟢 LOW",
    breakdown: { high_pressure: 10, red_card_multiplier: 0, vila_effect: 0, triggers: [] }
  },
  {
    fixture_id: 1006, league: "Eredivisie", country: "Netherlands", minute: 23, status: "1H",
    home: { name: "Ajax", goals: 0, possession: 55, shots_on_target: 2, corners: 1, dangerous_attacks: 12, yellow_cards: 0, red_cards: 0, favorite: true },
    away: { name: "PSV", goals: 0, possession: 45, shots_on_target: 1, corners: 1, dangerous_attacks: 9, yellow_cards: 0, red_cards: 0, favorite: false },
    dangerous_attacks_per_min: 0.74, heat_score: 18, alert_level: "🟢 LOW",
    breakdown: { high_pressure: 5, red_card_multiplier: 0, vila_effect: 0, triggers: [] }
  },
];

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

function MatchCard({ match, expanded, onToggle }) {
  const s = match.heat_score;
  const border = s >= 80 ? "#ff3b3066" : s >= 60 ? "#ff950044" : s >= 40 ? "#ffd60a22" : "#30d15818";
  const bgFrom = s >= 80 ? "#180808" : "#111111";
  const isVila = (match.minute >= 35 && match.minute <= 45) || (match.minute >= 80 && match.minute <= 93);

  return (
    <div onClick={onToggle} style={{
      background: `linear-gradient(135deg, ${bgFrom}, #0c0c0c)`,
      border: `1px solid ${border}`,
      borderRadius: 12, padding: "14px 18px", cursor: "pointer",
      transition: "all 0.2s", position: "relative", overflow: "hidden",
      boxShadow: s >= 80 ? "0 0 24px #ff3b3018, inset 0 1px 0 #ff3b3010" : "0 2px 10px #00000050",
    }}>
      {s >= 80 && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse at 50% 0%, #ff3b3010, transparent 70%)",
          animation: "mpulse 2s ease-in-out infinite",
        }} />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <HeatRing score={s} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: "#444", fontFamily: "monospace", letterSpacing: "0.07em" }}>
              {match.country} · {match.league}
            </span>
            {isVila && (
              <span style={{ fontSize: 9, background: "#ffd60a18", color: "#ffd60a", border: "1px solid #ffd60a44", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace" }}>
                VILA ⏱
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#eee" }}>{match.home.name}</span>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", fontFamily: "monospace", background: "#ffffff0a", borderRadius: 7, padding: "3px 12px", border: "1px solid #ffffff0d", letterSpacing: "0.1em" }}>
              {match.home.goals} – {match.away.goals}
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#eee" }}>{match.away.name}</span>
          </div>
          <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
            {match.home.red_cards > 0 && <span style={{ fontSize: 9, background: "#ff3b3018", color: "#ff6b6b", border: "1px solid #ff3b3044", borderRadius: 4, padding: "1px 6px", fontFamily: "monospace" }}>🟥 {match.home.name} RED</span>}
            {match.away.red_cards > 0 && <span style={{ fontSize: 9, background: "#ff3b3018", color: "#ff6b6b", border: "1px solid #ff3b3044", borderRadius: 4, padding: "1px 6px", fontFamily: "monospace" }}>🟥 {match.away.name} RED</span>}
          </div>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#30d158", fontFamily: "monospace", lineHeight: 1 }}>{match.minute}′</div>
          <div style={{ fontSize: 9, color: "#333", marginTop: 1, fontFamily: "monospace" }}>{match.status}</div>
          <div style={{ fontSize: 10, marginTop: 5, color: s >= 80 ? "#ff3b30" : s >= 60 ? "#ff9500" : "#555" }}>{match.alert_level}</div>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #ffffff08" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
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

const REFRESH = 60;

export default function App() {
  const [matches, setMatches] = useState(DEMO_MATCHES);
  const [countdown, setCountdown] = useState(REFRESH);
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [tick, setTick] = useState(0);
  const [alertFired, setAlertFired] = useState(new Set());

  // Simulate live updates: jitter heat scores slightly
  const refresh = useCallback(() => {
    setMatches(prev => prev.map(m => {
      const jitter = Math.floor((Math.random() - 0.4) * 5);
      const newScore = Math.min(100, Math.max(0, m.heat_score + jitter));
      return { ...m, heat_score: newScore, minute: Math.min(m.minute + 1, 93) };
    }).sort((a, b) => b.heat_score - a.heat_score));
    setCountdown(REFRESH);
    setTick(t => t + 1);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { refresh(); return REFRESH; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [refresh]);

  // Browser notifications
  useEffect(() => {
    matches.forEach(m => {
      if (m.heat_score >= 80 && !alertFired.has(m.fixture_id)) {
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("🔥 HIGH HEAT ALERT", { body: `${m.home.name} vs ${m.away.name} — Score ${m.heat_score} (${m.minute}′)` });
        }
        setAlertFired(prev => new Set([...prev, m.fixture_id]));
      }
    });
  }, [matches, alertFired]);

  const filtered = filter === "ALL" ? matches
    : filter === "EXTREME" ? matches.filter(m => m.heat_score >= 80)
    : filter === "HIGH" ? matches.filter(m => m.heat_score >= 60 && m.heat_score < 80)
    : matches.filter(m => m.heat_score < 60);

  const extremeCount = matches.filter(m => m.heat_score >= 80).length;

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#e0e0e0", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes mpulse { 0%,100%{opacity:.3} 50%{opacity:1} }
        @keyframes mspin { to{transform:rotate(360deg)} }
        @keyframes mblink { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes mslide { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#2a2a2a;border-radius:2px}
      `}</style>

      {/* HEADER */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "#080808ee", backdropFilter: "blur(16px)", borderBottom: "1px solid #ffffff08", padding: "16px 20px 12px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24 }}>⚽</span>
                <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", color: "#fff" }}>
                  MOMENTUM<span style={{ color: "#ff3b30" }}>TRACK</span>
                </span>
                {extremeCount > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, background: "#ff3b30", color: "#fff", borderRadius: 20, padding: "2px 9px", fontFamily: "monospace", animation: "mblink 1.4s ease-in-out infinite" }}>
                    {extremeCount} EXTREME
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10, color: "#3a3a3a", marginTop: 3, fontFamily: "monospace" }}>
                ● DEMO MODE · {matches.length} live games · auto-refresh #{tick}
              </div>
            </div>

            <button onClick={refresh} style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "#ffffff08", border: "1px solid #ffffff12",
              borderRadius: 8, padding: "8px 14px", cursor: "pointer",
              color: countdown < 10 ? "#ff9500" : "#555", fontSize: 12, fontFamily: "monospace",
              transition: "all 0.2s",
            }}>
              <span style={{ display: "inline-block", fontSize: 14 }}>↻</span>
              <span>{countdown}s</span>
            </button>
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            {[
              { key: "ALL", label: `ALL (${matches.length})` },
              { key: "EXTREME", label: `🔥 EXTREME (${matches.filter(m => m.heat_score >= 80).length})` },
              { key: "HIGH", label: `🟠 HIGH (${matches.filter(m => m.heat_score >= 60 && m.heat_score < 80).length})` },
              { key: "OTHER", label: `OTHER` },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setFilter(key)} style={{
                fontSize: 11, fontFamily: "monospace", padding: "5px 12px", borderRadius: 6,
                cursor: "pointer", transition: "all 0.15s",
                border: filter === key ? "1px solid #ffffff2a" : "1px solid #ffffff08",
                background: filter === key ? "#ffffff12" : "transparent",
                color: filter === key ? "#fff" : "#444",
              }}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* MATCH LIST */}
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "16px 20px 40px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {filtered.map((m, i) => (
            <div key={m.fixture_id} style={{ animation: `mslide 0.3s ease ${i * 0.05}s both` }}>
              <MatchCard
                match={m}
                expanded={expanded === m.fixture_id}
                onToggle={() => setExpanded(expanded === m.fixture_id ? null : m.fixture_id)}
              />
            </div>
          ))}
        </div>

        {/* Algorithm Legend */}
        <div style={{ marginTop: 28, padding: 16, borderRadius: 10, background: "#0d0d0d", border: "1px solid #ffffff08" }}>
          <div style={{ fontSize: 10, color: "#333", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 12 }}>HEAT SCORE ALGORITHM</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
            {[
              { color: "#0a84ff", label: "High Pressure", pts: "35pt max", desc: "Possession >65% + Dangerous Attacks >1.5/min" },
              { color: "#ff3b30", label: "Red Card ×", pts: "30pt max", desc: "Favourite loses a player while drawing/losing" },
              { color: "#ffd60a", label: "Vila Effect", pts: "35pt max", desc: "35′–45′ or 80′–93′ pressure spike window" },
            ].map(({ color, label, pts, desc }) => (
              <div key={label} style={{ padding: 10, background: "#ffffff04", borderRadius: 8, border: "1px solid #ffffff06" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}88` }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#ccc" }}>{label}</span>
                  <span style={{ fontSize: 10, color, fontFamily: "monospace", marginLeft: "auto" }}>{pts}</span>
                </div>
                <div style={{ fontSize: 10, color: "#444", lineHeight: 1.4 }}>{desc}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {[
              { c: "#ff3b30", t: "80–100 EXTREME" }, { c: "#ff9500", t: "60–79 HIGH" },
              { c: "#ffd60a", t: "40–59 MEDIUM" }, { c: "#30d158", t: "0–39 LOW" }
            ].map(({ c, t }) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />
                <span style={{ fontSize: 10, color: "#444", fontFamily: "monospace" }}>{t}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 10, color: "#2a2a2a", fontFamily: "monospace" }}>
            Click any card to expand stats · Browser notification fires at score ≥ 80 · Auto-refresh every {REFRESH}s
          </div>
        </div>
      </div>
    </div>
  );
}
