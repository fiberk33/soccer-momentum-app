import { useState, useEffect, useCallback, useRef } from "react";

// ── Backend ──────────────────────────────────────────────────────────────
// Override at build time with VITE_BACKEND_URL when needed.
const BACKEND_URL =
  (import.meta.env && import.meta.env.VITE_BACKEND_URL) ||
  "https://soccer-momentum-app-1.onrender.com";

const REFRESH = 60; // seconds between auto-refreshes

// ── Heat ring ────────────────────────────────────────────────────────────
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

// ── Momentum sparkline: last N heat scores per fixture ───────────────────
function MomentumSpark({ history, direction, delta }) {
  if (!history || history.length < 2) {
    return <span style={{ fontSize: 9.5, color: "#444", fontFamily: "monospace" }}>—</span>;
  }
  const max = 100;
  const w = 60, h = 20;
  const stepX = w / (history.length - 1);
  const points = history.map((v, i) => `${i * stepX},${h - (v / max) * h}`).join(" ");
  const color = direction === "up" ? "#ff3b30" : direction === "down" ? "#30d158" : "#888";
  const arrow = direction === "up" ? "↗" : direction === "down" ? "↘" : "→";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <svg width={w} height={h} style={{ overflow: "visible" }}>
        <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" points={points} opacity="0.85" />
      </svg>
      <span style={{ fontSize: 11, color, fontFamily: "monospace", fontWeight: 700 }}>
        {arrow} {delta > 0 ? "+" : ""}{delta ?? 0}
      </span>
    </span>
  );
}

// ── Side-by-side stat bar ────────────────────────────────────────────────
function StatBar({ label, homeVal, awayVal, fmt = (v) => v }) {
  const safeHome = homeVal ?? 0;
  const safeAway = awayVal ?? 0;
  const total = (safeHome + safeAway) || 1;
  const hp = (safeHome / total) * 100;
  const missing = homeVal == null && awayVal == null;
  return (
    <div style={{ marginBottom: 7, opacity: missing ? 0.45 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#666", marginBottom: 3, fontFamily: "monospace" }}>
        <span style={{ color: "#bbb" }}>{missing ? "—" : fmt(safeHome)}</span>
        <span style={{ color: "#444", letterSpacing: "0.05em" }}>{label}</span>
        <span style={{ color: "#bbb" }}>{missing ? "—" : fmt(safeAway)}</span>
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
  const xgH = match.home.xg;
  const xgA = match.away.xg;
  const hasXG = xgH != null || xgA != null;

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
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: "#444", fontFamily: "monospace", letterSpacing: "0.07em" }}>
              {match.country} · {match.league}
            </span>
            {isVila && (
              <span style={{ fontSize: 9, background: "#ffd60a18", color: "#ffd60a", border: "1px solid #ffd60a44", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace" }}>
                VILA ⏱
              </span>
            )}
            {!match.stats_loaded && (
              <span style={{ fontSize: 9, background: "#88888818", color: "#888", border: "1px solid #88888844", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace" }}>
                partial heat
              </span>
            )}
            <span style={{ marginLeft: "auto" }}>
              <MomentumSpark history={match.heat_trend} direction={match.heat_direction} delta={match.heat_delta} />
            </span>
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
            {match.home.yellow_cards > 0 && <span style={{ fontSize: 9, background: "#facc1518", color: "#facc15", border: "1px solid #facc1544", borderRadius: 4, padding: "1px 6px", fontFamily: "monospace" }}>🟨 {match.home.yellow_cards}</span>}
            {match.away.yellow_cards > 0 && <span style={{ fontSize: 9, background: "#facc1518", color: "#facc15", border: "1px solid #facc1544", borderRadius: 4, padding: "1px 6px", fontFamily: "monospace" }}>🟨 {match.away.yellow_cards}</span>}
            {hasXG && (
              <span style={{ fontSize: 9, background: "#0a84ff18", color: "#5ac8fa", border: "1px solid #0a84ff44", borderRadius: 4, padding: "1px 6px", fontFamily: "monospace" }}>
                xG {Number(xgH ?? 0).toFixed(2)} – {Number(xgA ?? 0).toFixed(2)}
              </span>
            )}
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
              <StatBar label="POSSESSION" homeVal={match.home.possession} awayVal={match.away.possession} fmt={(v) => `${v}%`} />
              <StatBar label="SHOTS ON TGT" homeVal={match.home.shots_on_target} awayVal={match.away.shots_on_target} />
              <StatBar label="CORNERS" homeVal={match.home.corners} awayVal={match.away.corners} />
              <StatBar label="DANGER ATTACKS" homeVal={match.home.dangerous_attacks} awayVal={match.away.dangerous_attacks} />
              <StatBar label="xG" homeVal={match.home.xg} awayVal={match.away.xg} fmt={(v) => Number(v).toFixed(2)} />
              <div style={{ fontSize: 10, color: "#444", fontFamily: "monospace", marginTop: 8 }}>⚡ {match.dangerous_attacks_per_min} attacks/min</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#444", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 10 }}>HEAT BREAKDOWN</div>
              <BreakdownBar label="High Pressure" val={match.breakdown.high_pressure} max={35} color="#0a84ff" />
              <BreakdownBar label="Red Card ×" val={match.breakdown.red_card_multiplier} max={30} color="#ff3b30" />
              <BreakdownBar label="Vila Effect" val={match.breakdown.vila_effect} max={35} color="#ffd60a" />
              <div style={{ marginTop: 10 }}>
                {(match.breakdown.triggers || []).map((t, i) => (
                  <div key={i} style={{ fontSize: 9.5, color: "#777", fontFamily: "monospace", marginBottom: 4, lineHeight: 1.4 }}>{t}</div>
                ))}
                {(!match.breakdown.triggers || match.breakdown.triggers.length === 0) && (
                  <div style={{ fontSize: 9.5, color: "#444", fontFamily: "monospace", fontStyle: "italic" }}>no triggers fired</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [matches, setMatches] = useState([]);
  const [countdown, setCountdown] = useState(REFRESH);
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [tick, setTick] = useState(0);
  const [alertFired, setAlertFired] = useState(() => new Set());
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState({ stats_loaded: 0, stats_top_n: 0 });
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${BACKEND_URL}/api/live`, { cache: "no-store" });
      if (!r.ok) throw new Error(`Backend HTTP ${r.status}`);
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setMatches((data.matches || []).slice().sort((a, b) => b.heat_score - a.heat_score));
      setMeta({ stats_loaded: data.stats_loaded || 0, stats_top_n: data.stats_top_n || 0 });
      setError(null);
    } catch (err) {
      setError(err.message || "Backend is waking up — retrying…");
    } finally {
      setLoading(false);
      setCountdown(REFRESH);
      setTick((t) => t + 1);
    }
  }, []);

  // Initial load
  useEffect(() => { refresh(); }, [refresh]);

  // Countdown + auto-refresh
  useEffect(() => {
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { refresh(); return REFRESH; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [refresh]);

  // Browser notifications when a match crosses into EXTREME (only first time per fixture)
  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      // Ask once on first interaction; non-blocking here.
      Notification.requestPermission().catch(() => {});
    }
    matches.forEach((m) => {
      if (m.heat_score >= 80 && !alertFired.has(m.fixture_id)) {
        if (Notification.permission === "granted") {
          new Notification("🔥 HIGH HEAT ALERT", {
            body: `${m.home.name} vs ${m.away.name} — Heat ${m.heat_score} (${m.minute}′)`,
          });
        }
        setAlertFired((prev) => new Set([...prev, m.fixture_id]));
      }
    });
  }, [matches, alertFired]);

  const filtered =
    filter === "ALL"     ? matches :
    filter === "EXTREME" ? matches.filter((m) => m.heat_score >= 80) :
    filter === "HIGH"    ? matches.filter((m) => m.heat_score >= 60 && m.heat_score < 80) :
    filter === "VILA"    ? matches.filter((m) => (m.minute >= 35 && m.minute <= 45) || (m.minute >= 80 && m.minute <= 93)) :
                           matches.filter((m) => m.heat_score < 60);

  const extremeCount = matches.filter((m) => m.heat_score >= 80).length;
  const highCount    = matches.filter((m) => m.heat_score >= 60 && m.heat_score < 80).length;
  const vilaCount    = matches.filter((m) => (m.minute >= 35 && m.minute <= 45) || (m.minute >= 80 && m.minute <= 93)).length;

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
                {error ? (
                  <span style={{ color: "#ff9500" }}>● {error}</span>
                ) : (
                  <>● LIVE · {matches.length} games · stats loaded {meta.stats_loaded}/{meta.stats_top_n} · refresh #{tick}</>
                )}
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

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { key: "ALL",     label: `ALL (${matches.length})` },
              { key: "EXTREME", label: `🔥 EXTREME (${extremeCount})` },
              { key: "HIGH",    label: `🟠 HIGH (${highCount})` },
              { key: "VILA",    label: `⏱ VILA (${vilaCount})` },
              { key: "OTHER",   label: "OTHER" },
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

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "16px 20px 40px" }}>
        {loading && matches.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#555", fontFamily: "monospace", fontSize: 13 }}>
            Scanning global matches…
          </div>
        ) : matches.length === 0 && !error ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#555", fontStyle: "italic" }}>
            No major live matches at this hour.
          </div>
        ) : (
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
        )}

        <div style={{ marginTop: 28, padding: 16, borderRadius: 10, background: "#0d0d0d", border: "1px solid #ffffff08" }}>
          <div style={{ fontSize: 10, color: "#333", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 12 }}>HEAT SCORE ALGORITHM</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
            {[
              { color: "#0a84ff", label: "High Pressure", pts: "35pt max", desc: "Possession >65% (+15) AND Dangerous Attacks >1.5/min (+20)" },
              { color: "#ff3b30", label: "Red Card ×",   pts: "30pt max", desc: "Favourite loses a player while drawing or losing" },
              { color: "#ffd60a", label: "Vila Effect",  pts: "35pt max", desc: "35′–45′ or 80′–93′ pressure-spike window" },
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
              { c: "#ffd60a", t: "40–59 MEDIUM"  }, { c: "#30d158", t: "0–39 LOW"   },
            ].map(({ c, t }) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />
                <span style={{ fontSize: 10, color: "#444", fontFamily: "monospace" }}>{t}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 10, color: "#2a2a2a", fontFamily: "monospace" }}>
            Click a card to expand · Browser notification fires once when score ≥ 80 · Auto-refresh every {REFRESH}s
          </div>
        </div>
      </div>
    </div>
  );
}
