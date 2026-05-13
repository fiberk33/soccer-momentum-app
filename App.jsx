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

// Group matches by league
function groupByLeague(matches) {
  const groups = {};
  matches.forEach(m => {
    const key = `${m.country} — ${m.league}`;
    if (!groups[key]) groups[key] = { label: key, country: m.country, league: m.league, matches: [] };
    groups[key].matches.push(m);
  });
  return Object.values(groups);
}

// Heat color
function heatColor(score) {
  if (score >= 80) return "#ff3b30";
  if (score >= 60) return "#ff9500";
  if (score >= 40) return "#ffd60a";
  return "#4caf50";
}

// ─── EXPANDED DETAIL ──────────────────────────────────────────────────────────
function MatchDetail({ m }) {
  const hasStats = m.has_full_stats && (m.home.possession > 0 || m.home.shots_on_target > 0);
  const triggers = m.breakdown?.triggers || [];

  return (
    <div style={{ background: "#1a1a1a", padding: "10px 14px 12px", borderTop: "1px solid #2a2a2a" }}>
      {/* Heat Score bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#555", fontFamily: "monospace", minWidth: 70 }}>HEAT SCORE</div>
        <div style={{ flex: 1, height: 6, background: "#2a2a2a", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${m.heat_score}%`, height: "100%", background: heatColor(m.heat_score), borderRadius: 3, transition: "width .6s ease" }} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: heatColor(m.heat_score), fontFamily: "monospace", minWidth: 28, textAlign: "right" }}>{m.heat_score}</div>
      </div>

      {/* Breakdown bars */}
      {m.breakdown && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {[
            { label: "Pressure", val: m.breakdown.high_pressure, max: 35, color: "#0a84ff" },
            { label: "Red Card", val: m.breakdown.red_card_multiplier, max: 30, color: "#ff3b30" },
            { label: "Vila", val: m.breakdown.vila_effect, max: 35, color: "#ffd60a" },
          ].map(({ label, val, max, color }) => (
            <div key={label} style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: "#444", fontFamily: "monospace", marginBottom: 3, textAlign: "center" }}>{label}</div>
              <div style={{ height: 4, background: "#2a2a2a", borderRadius: 2 }}>
                <div style={{ width: `${(val / max) * 100}%`, height: "100%", background: color, borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 9, color, fontFamily: "monospace", textAlign: "center", marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Stats grid */}
      {hasStats && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "3px 8px", marginBottom: 10 }}>
          {[
            { label: "Possession", hv: `${m.home.possession}%`, av: `${m.away.possession}%` },
            { label: "Shots on Target", hv: m.home.shots_on_target, av: m.away.shots_on_target },
            { label: "Corners", hv: m.home.corners, av: m.away.corners },
            { label: "Danger Attacks", hv: m.home.dangerous_attacks, av: m.away.dangerous_attacks },
            { label: "Yellow Cards", hv: m.home.yellow_cards, av: m.away.yellow_cards },
            { label: "Red Cards", hv: m.home.red_cards, av: m.away.red_cards },
          ].map(({ label, hv, av }) => (
            <>
              <div key={`h-${label}`} style={{ fontSize: 11, color: "#ccc", textAlign: "right", fontFamily: "monospace" }}>{hv}</div>
              <div key={`l-${label}`} style={{ fontSize: 10, color: "#444", textAlign: "center", whiteSpace: "nowrap" }}>{label}</div>
              <div key={`a-${label}`} style={{ fontSize: 11, color: "#ccc", textAlign: "left", fontFamily: "monospace" }}>{av}</div>
            </>
          ))}
        </div>
      )}

      {/* Triggers */}
      {triggers.length > 0 && (
        <div style={{ borderTop: "1px solid #222", paddingTop: 8 }}>
          {triggers.map((t, i) => (
            <div key={i} style={{ fontSize: 10, color: "#666", fontFamily: "monospace", marginBottom: 3 }}>{t}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SINGLE MATCH ROW ─────────────────────────────────────────────────────────
function MatchRow({ m, expanded, onToggle, isFav, onFavToggle }) {
  const s = m.heat_score;
  const color = heatColor(s);
  const isVila = (m.minute >= 35 && m.minute <= 45) || (m.minute >= 80 && m.minute <= 93);

  return (
    <div style={{ borderBottom: "1px solid #1e1e1e" }}>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", padding: "10px 14px", cursor: "pointer", background: expanded ? "#161616" : "#111", transition: "background .15s" }}>

        {/* Minute */}
        <div style={{ width: 42, flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#e53935", fontFamily: "monospace", lineHeight: 1 }}>
            {m.minute}′
            {isVila && <span style={{ fontSize: 8, display: "block", color: "#ffd60a", marginTop: 1 }}>VILA</span>}
          </div>
        </div>

        {/* Teams + Score */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Home */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
              {m.home.logo && <img src={m.home.logo} width="14" height="14" style={{ borderRadius: 2, flexShrink: 0 }} alt="" onError={e => e.target.style.display = "none"} />}
              <span style={{ fontSize: 13, color: m.home.goals > m.away.goals ? "#fff" : "#aaa", fontWeight: m.home.goals > m.away.goals ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.home.name}
              </span>
              {m.home.red_cards > 0 && <span style={{ fontSize: 9, background: "#c62828", color: "#fff", borderRadius: 2, padding: "0 3px" }}>RC</span>}
            </div>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", fontFamily: "monospace", marginLeft: 8, flexShrink: 0 }}>{m.home.goals}</span>
          </div>
          {/* Away */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
              {m.away.logo && <img src={m.away.logo} width="14" height="14" style={{ borderRadius: 2, flexShrink: 0 }} alt="" onError={e => e.target.style.display = "none"} />}
              <span style={{ fontSize: 13, color: m.away.goals > m.home.goals ? "#fff" : "#aaa", fontWeight: m.away.goals > m.home.goals ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.away.name}
              </span>
              {m.away.red_cards > 0 && <span style={{ fontSize: 9, background: "#c62828", color: "#fff", borderRadius: 2, padding: "0 3px" }}>RC</span>}
            </div>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", fontFamily: "monospace", marginLeft: 8, flexShrink: 0 }}>{m.away.goals}</span>
          </div>
        </div>

        {/* Heat + Star */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, marginLeft: 12, flexShrink: 0 }}>
          {/* Heat badge */}
          <div style={{ width: 36, height: 36, borderRadius: "50%", border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", background: `${color}18` }}>
            <span style={{ fontSize: 11, fontWeight: 800, color, fontFamily: "monospace" }}>{s}</span>
          </div>
          {/* Star */}
          <button onClick={e => { e.stopPropagation(); onFavToggle(m.fixture_id); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: isFav ? "#ffd60a" : "#333", padding: 0, lineHeight: 1 }}>★</button>
        </div>
      </div>

      {expanded && <MatchDetail m={m} />}
    </div>
  );
}

// ─── LEAGUE GROUP HEADER ──────────────────────────────────────────────────────
function LeagueHeader({ label, topHeat }) {
  const color = heatColor(topHeat);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 14px", background: "#1a1a1a", borderBottom: "1px solid #222" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#ccc", letterSpacing: "0.03em" }}>{label}</span>
      {topHeat >= 40 && (
        <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: "monospace", background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 4, padding: "1px 6px" }}>
          {topHeat >= 80 ? "🔥" : topHeat >= 60 ? "🟠" : "🟡"} {topHeat}
        </span>
      )}
    </div>
  );
}

// ─── ALERT SETTINGS ───────────────────────────────────────────────────────────
function AlertPanel({ threshold, onChange, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 14, padding: 24, width: "100%", maxWidth: 320 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 6 }}>🔔 Alert Threshold</div>
        <div style={{ fontSize: 12, color: "#555", fontFamily: "monospace", marginBottom: 20 }}>Notify when Heat Score ≥</div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: "#888" }}>Threshold</span>
          <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "monospace", color: heatColor(threshold) }}>{threshold}</span>
        </div>
        <input type="range" min="40" max="95" step="5" value={threshold} onChange={e => onChange(Number(e.target.value))} style={{ width: "100%", accentColor: "#e53935", cursor: "pointer" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#333", fontFamily: "monospace", marginTop: 4, marginBottom: 16 }}>
          <span>40</span><span>60</span><span>80</span><span>95</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 14 }}>
          {[60, 70, 80].map(v => (
            <button key={v} onClick={() => onChange(v)} style={{ padding: "8px 0", borderRadius: 8, cursor: "pointer", border: threshold === v ? "1px solid #e5393566" : "1px solid #333", background: threshold === v ? "#e5393518" : "#222", color: threshold === v ? "#e53935" : "#555", fontSize: 13, fontFamily: "monospace", fontWeight: 700 }}>{v}</button>
          ))}
        </div>
        <button onClick={onClose} style={{ width: "100%", padding: "10px 0", borderRadius: 8, background: "#222", border: "1px solid #333", color: "#888", fontSize: 13, cursor: "pointer" }}>Done</button>
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
    } catch (e) {
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

  // Filter
  let displayed = [...matches];
  if (showFavsOnly) displayed = displayed.filter(m => favourites.has(m.fixture_id));
  if (filter === "EXTREME") displayed = displayed.filter(m => m.heat_score >= 80);
  else if (filter === "HIGH") displayed = displayed.filter(m => m.heat_score >= 60 && m.heat_score < 80);
  else if (filter === "OTHER") displayed = displayed.filter(m => m.heat_score < 60);

  const groups = groupByLeague(displayed);
  const extremeCount = matches.filter(m => m.heat_score >= 80).length;

  return (
    <div style={{ minHeight: "100vh", background: "#111", color: "#e0e0e0", fontFamily: "'Segoe UI', system-ui, sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes spin{to{transform:rotate(360deg)}}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:#2a2a2a;border-radius:2px}
      `}</style>

      {showAlertPanel && <AlertPanel threshold={alertThreshold} onChange={setAlertThreshold} onClose={() => setShowAlertPanel(false)} />}

      {/* ── TOP NAV ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "#1a1a1a", borderBottom: "1px solid #222" }}>
        {/* Title bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>⚽</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>
              Momentum<span style={{ color: "#e53935" }}>Track</span>
            </span>
            {extremeCount > 0 && (
              <span style={{ fontSize: 10, background: "#e53935", color: "#fff", borderRadius: 10, padding: "1px 7px", fontWeight: 700, animation: "blink 1.5s infinite" }}>
                {extremeCount} 🔥
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontFamily: "monospace", padding: "3px 7px", borderRadius: 4, border: `1px solid ${isDemo ? "#ffd60a44" : "#4caf5044"}`, color: isDemo ? "#ffd60a" : "#4caf50", background: isDemo ? "#ffd60a0a" : "#4caf500a" }}>
              {isDemo ? "DEMO" : "● LIVE"}
            </span>
            <button onClick={() => setShowFavsOnly(f => !f)} style={{ background: showFavsOnly ? "#ffd60a22" : "none", border: `1px solid ${showFavsOnly ? "#ffd60a55" : "#333"}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 13, color: showFavsOnly ? "#ffd60a" : "#555" }}>
              ★{favourites.size > 0 && ` ${favourites.size}`}
            </button>
            <button onClick={() => setShowAlertPanel(true)} style={{ background: "none", border: "1px solid #333", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 13, color: "#555" }}>🔔</button>
            <button onClick={load} style={{ background: "none", border: "1px solid #333", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 12, color: countdown < 10 ? "#ff9500" : "#555", fontFamily: "monospace", display: "flex", alignItems: "center", gap: 4 }}>
              {loading ? <span style={{ display: "inline-block", width: 10, height: 10, border: "2px solid #e53935", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .7s linear infinite" }} /> : "↻"} {countdown}s
            </button>
          </div>
        </div>

        {/* Error banners */}
        {error === "no_matches" && (
          <div style={{ padding: "6px 14px", background: "#2a2000", borderTop: "1px solid #ffd60a22", fontSize: 11, color: "#ffd60a", fontFamily: "monospace" }}>
            ⚽ No live matches right now — showing demo data
          </div>
        )}
        {error === "api_error" && (
          <div style={{ padding: "6px 14px", background: "#2a0000", borderTop: "1px solid #e5393522", fontSize: 11, color: "#e57373", fontFamily: "monospace" }}>
            ⚠️ API error — check APISPORTS_KEY in Vercel env vars
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: "flex", borderTop: "1px solid #222", overflow: "hidden" }}>
          {[
            { key: "ALL", label: `Canlı ${matches.length}` },
            { key: "EXTREME", label: `🔥 ${matches.filter(m => m.heat_score >= 80).length}` },
            { key: "HIGH", label: `🟠 ${matches.filter(m => m.heat_score >= 60 && m.heat_score < 80).length}` },
            { key: "OTHER", label: "Diğer" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)} style={{
              flex: 1, padding: "9px 4px", border: "none", cursor: "pointer",
              fontSize: 11, fontWeight: filter === key ? 700 : 400,
              background: filter === key ? "#111" : "#1a1a1a",
              color: filter === key ? "#fff" : "#555",
              borderBottom: filter === key ? "2px solid #e53935" : "2px solid transparent",
              transition: "all .15s",
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── MATCH LIST ── */}
      {loading && matches.length === 0 ? (
        <div style={{ textAlign: "center", color: "#333", padding: "60px 0", fontFamily: "monospace" }}>
          <div style={{ display: "inline-block", width: 24, height: 24, border: "3px solid #e53935", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .8s linear infinite", marginBottom: 12 }} />
          <div>Canlı maçlar yükleniyor…</div>
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ textAlign: "center", color: "#333", padding: "60px 0", fontSize: 13 }}>
          {showFavsOnly ? "Favori maç eklemediniz." : "Bu kategoride maç yok."}
        </div>
      ) : (
        groups.map(group => (
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
        ))
      )}

      {/* Bottom padding for mobile */}
      <div style={{ height: 40 }} />
    </div>
  );
}
