import { useState, useEffect, useCallback } from "react";

const API_URL = "/api/live";
const REFRESH = 60;

// ─── DEMO FALLBACK ────────────────────────────────────────────────────────────
const DEMO = [
  { fixture_id:1001, league:"Premier League", country:"England", minute:87, status:"2H", heat_score:91, alert_level:"🔥 EXTREME", has_full_stats:true, breakdown:{high_pressure:35,red_card_multiplier:20,vila_effect:31,triggers:["Dominant possession: Man City 68%","High attack rate: 2.41/min","⚡ High Pressure Zone","🟥 Red Card Multiplier","⏱️ Vila Effect: 3′ remaining"]}, home:{name:"Man City",logo:"",goals:1,possession:68,shots_on_target:9,corners:7,dangerous_attacks:42,yellow_cards:2,red_cards:0}, away:{name:"Arsenal",logo:"",goals:1,possession:32,shots_on_target:3,corners:2,dangerous_attacks:18,yellow_cards:1,red_cards:1}, dangerous_attacks_per_min:2.41 },
  { fixture_id:1007, league:"Scottish Prem", country:"Scotland", minute:85, status:"2H", heat_score:78, alert_level:"🟠 HIGH", has_full_stats:true, breakdown:{high_pressure:22,red_card_multiplier:0,vila_effect:28,triggers:["High attack rate: 1.85/min","⏱️ Vila Effect: 5′ remaining"]}, home:{name:"Celtic",logo:"",goals:2,possession:54,shots_on_target:7,corners:6,dangerous_attacks:38,yellow_cards:1,red_cards:0}, away:{name:"Rangers",logo:"",goals:2,possession:46,shots_on_target:5,corners:5,dangerous_attacks:29,yellow_cards:2,red_cards:0}, dangerous_attacks_per_min:1.85 },
  { fixture_id:1002, league:"La Liga", country:"Spain", minute:38, status:"1H", heat_score:67, alert_level:"🟠 HIGH", has_full_stats:true, breakdown:{high_pressure:18,red_card_multiplier:0,vila_effect:22,triggers:["High attack rate: 1.68/min","⏱️ Vila Effect: 7′ remaining"]}, home:{name:"Real Madrid",logo:"",goals:0,possession:52,shots_on_target:4,corners:4,dangerous_attacks:24,yellow_cards:1,red_cards:0}, away:{name:"Barcelona",logo:"",goals:0,possession:48,shots_on_target:5,corners:3,dangerous_attacks:22,yellow_cards:0,red_cards:0}, dangerous_attacks_per_min:1.68 },
  { fixture_id:1004, league:"Ligue 1", country:"France", minute:56, status:"2H", heat_score:52, alert_level:"🟡 MEDIUM", has_full_stats:false, breakdown:{high_pressure:0,red_card_multiplier:0,vila_effect:0,triggers:["⚽ 3 goals scored","⚡ 1 goal game — late pressure"]}, home:{name:"PSG",logo:"",goals:2,possession:0,shots_on_target:0,corners:0,dangerous_attacks:0,yellow_cards:0,red_cards:0}, away:{name:"Lyon",logo:"",goals:1,possession:0,shots_on_target:0,corners:0,dangerous_attacks:0,yellow_cards:2,red_cards:0}, dangerous_attacks_per_min:0 },
  { fixture_id:1003, league:"Bundesliga", country:"Germany", minute:14, status:"1H", heat_score:18, alert_level:"🟢 LOW", has_full_stats:false, breakdown:{high_pressure:0,red_card_multiplier:0,vila_effect:0,triggers:[]}, home:{name:"Bayern Munich",logo:"",goals:1,possession:0,shots_on_target:0,corners:0,dangerous_attacks:0,yellow_cards:0,red_cards:0}, away:{name:"Dortmund",logo:"",goals:0,possession:0,shots_on_target:0,corners:0,dangerous_attacks:0,yellow_cards:0,red_cards:0}, dangerous_attacks_per_min:0 },
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

// ─── EXPANDED DETAIL ──────────────────────────────────────────────────────────
function MatchDetail({ m }) {
  const hasStats = m.has_full_stats && (m.home.possession > 0 || m.home.shots_on_target > 0);
  const triggers = m.breakdown?.triggers || [];

  return (
    <div style={{ background: "#f9f9f9", padding: "12px 16px 14px", borderTop: "1px solid #eee" }}>

      {/* Heat Score bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#aaa", fontFamily: "monospace", minWidth: 75 }}>HEAT SCORE</div>
        <div style={{ flex: 1, height: 7, background: "#e8e8e8", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${m.heat_score}%`, height: "100%", background: heatColor(m.heat_score), borderRadius: 4, transition: "width .6s ease" }} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: heatColor(m.heat_score), fontFamily: "monospace", minWidth: 28, textAlign: "right" }}>{m.heat_score}</div>
      </div>

      {/* Breakdown bars */}
      {m.breakdown && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {[
            { label: "Pressure", val: m.breakdown.high_pressure, max: 35, color: "#1e88e5" },
            { label: "Red Card", val: m.breakdown.red_card_multiplier, max: 30, color: "#e53935" },
            { label: "Vila", val: m.breakdown.vila_effect, max: 35, color: "#f9a825" },
          ].map(({ label, val, max, color }) => (
            <div key={label} style={{ flex: 1, background: "#fff", borderRadius: 8, padding: "8px 6px", border: "1px solid #eee", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#bbb", marginBottom: 4 }}>{label}</div>
              <div style={{ height: 4, background: "#f0f0f0", borderRadius: 2, marginBottom: 4 }}>
                <div style={{ width: `${(val / max) * 100}%`, height: "100%", background: color, borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color }}>{val}<span style={{ color: "#ccc", fontWeight: 400 }}>/{max}</span></div>
            </div>
          ))}
        </div>
      )}

      {/* Stats grid */}
      {hasStats && (
        <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #eee", overflow: "hidden", marginBottom: 10 }}>
          {[
            { label: "Possession", hv: `${m.home.possession}%`, av: `${m.away.possession}%` },
            { label: "Shots on Target", hv: m.home.shots_on_target, av: m.away.shots_on_target },
            { label: "Corners", hv: m.home.corners, av: m.away.corners },
            { label: "Danger Attacks", hv: m.home.dangerous_attacks, av: m.away.dangerous_attacks },
            { label: "Yellow Cards", hv: m.home.yellow_cards, av: m.away.yellow_cards },
            { label: "Red Cards", hv: m.home.red_cards, av: m.away.red_cards },
          ].map(({ label, hv, av }, i) => (
            <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", padding: "7px 12px", background: i % 2 === 0 ? "#fff" : "#fafafa", borderBottom: i < 5 ? "1px solid #f0f0f0" : "none" }}>
              <div style={{ fontSize: 12, color: "#222", textAlign: "right", fontWeight: 600 }}>{hv}</div>
              <div style={{ fontSize: 11, color: "#aaa", textAlign: "center", padding: "0 12px", whiteSpace: "nowrap" }}>{label}</div>
              <div style={{ fontSize: 12, color: "#222", textAlign: "left", fontWeight: 600 }}>{av}</div>
            </div>
          ))}
        </div>
      )}

      {/* Triggers */}
      {triggers.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #eee", padding: "8px 12px" }}>
          {triggers.map((t, i) => (
            <div key={i} style={{ fontSize: 11, color: "#888", marginBottom: i < triggers.length - 1 ? 4 : 0 }}>{t}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MATCH ROW ────────────────────────────────────────────────────────────────
function MatchRow({ m, expanded, onToggle, isFav, onFavToggle }) {
  const s = m.heat_score;
  const color = heatColor(s);
  const isVila = (m.minute >= 35 && m.minute <= 45) || (m.minute >= 80 && m.minute <= 93);
  const homeWin = m.home.goals > m.away.goals;
  const awayWin = m.away.goals > m.home.goals;

  return (
    <div style={{ borderBottom: "1px solid #f0f0f0" }}>
      <div onClick={onToggle} style={{
        display: "flex", alignItems: "center", padding: "10px 14px",
        cursor: "pointer", background: expanded ? "#fafafa" : "#fff",
        transition: "background .15s",
      }}>

        {/* Minute */}
        <div style={{ width: 44, flexShrink: 0, textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#e53935", fontFamily: "monospace", lineHeight: 1.2 }}>
            {m.minute}′
          </div>
          {isVila && (
            <div style={{ fontSize: 8, color: "#f9a825", fontWeight: 700, marginTop: 2 }}>VILA</div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 36, background: "#f0f0f0", marginRight: 12, flexShrink: 0 }} />

        {/* Teams + Scores */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Home */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, flex: 1 }}>
              {m.home.logo
                ? <img src={m.home.logo} width="16" height="16" style={{ borderRadius: 2, flexShrink: 0 }} alt="" onError={e => e.target.style.display = "none"} />
                : <div style={{ width: 16, height: 16, background: "#e8e8e8", borderRadius: 2, flexShrink: 0 }} />
              }
              <span style={{ fontSize: 13, color: homeWin ? "#111" : "#555", fontWeight: homeWin ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.home.name}
              </span>
              {m.home.red_cards > 0 && <span style={{ fontSize: 8, background: "#e53935", color: "#fff", borderRadius: 2, padding: "1px 3px", flexShrink: 0, fontWeight: 700 }}>RC</span>}
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#111", marginLeft: 8, flexShrink: 0, minWidth: 16, textAlign: "right" }}>{m.home.goals}</span>
          </div>

          {/* Away */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, flex: 1 }}>
              {m.away.logo
                ? <img src={m.away.logo} width="16" height="16" style={{ borderRadius: 2, flexShrink: 0 }} alt="" onError={e => e.target.style.display = "none"} />
                : <div style={{ width: 16, height: 16, background: "#e8e8e8", borderRadius: 2, flexShrink: 0 }} />
              }
              <span style={{ fontSize: 13, color: awayWin ? "#111" : "#555", fontWeight: awayWin ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.away.name}
              </span>
              {m.away.red_cards > 0 && <span style={{ fontSize: 8, background: "#e53935", color: "#fff", borderRadius: 2, padding: "1px 3px", flexShrink: 0, fontWeight: 700 }}>RC</span>}
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#111", marginLeft: 8, flexShrink: 0, minWidth: 16, textAlign: "right" }}>{m.away.goals}</span>
          </div>
        </div>

        {/* Heat ring + star */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginLeft: 14, flexShrink: 0 }}>
          <div style={{
            width: 38, height: 38, borderRadius: "50%",
            border: `2.5px solid ${color}`,
            background: `${color}12`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 11, fontWeight: 800, color, fontFamily: "monospace" }}>{s}</span>
          </div>
          <button onClick={e => { e.stopPropagation(); onFavToggle(m.fixture_id); }} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 14, color: isFav ? "#f9a825" : "#ccc",
            padding: 0, lineHeight: 1,
          }}>★</button>
        </div>
      </div>

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
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH);
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [favourites, setFavourites] = useState(new Set());
  const [showFavsOnly, setShowFavsOnly] = useState(false);
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

  let displayed = [...matches];
  if (showFavsOnly) displayed = displayed.filter(m => favourites.has(m.fixture_id));
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
            <span style={{
              fontSize: 10, fontFamily: "monospace", padding: "3px 8px", borderRadius: 4, fontWeight: 700,
              border: `1px solid ${isDemo ? "#f9a82544" : "#43a04744"}`,
              color: isDemo ? "#f9a825" : "#43a047",
              background: isDemo ? "#fffde7" : "#e8f5e9",
            }}>
              {isDemo ? "DEMO" : "● LIVE"}
            </span>
            <button onClick={() => setShowFavsOnly(f => !f)} style={{
              background: showFavsOnly ? "#fff8e1" : "#fafafa",
              border: `1px solid ${showFavsOnly ? "#f9a82566" : "#e0e0e0"}`,
              borderRadius: 6, padding: "4px 9px", cursor: "pointer",
              fontSize: 13, color: showFavsOnly ? "#f9a825" : "#aaa",
            }}>★{favourites.size > 0 && ` ${favourites.size}`}</button>
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
            { key: "ALL", label: `Live ${matches.length}` },
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
