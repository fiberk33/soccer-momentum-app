import { useState, useEffect, useCallback } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
// Add VITE_RAPIDAPI_KEY to Vercel → Settings → Environment Variables
const RAPIDAPI_KEY = import.meta.env.VITE_RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = "api-football-v1.p.rapidapi.com";
const REFRESH = 60;
const LEAGUES = ["All Leagues","Premier League","La Liga","Bundesliga","Serie A","Ligue 1","Eredivisie","Champions League"];

// ─── HEAT SCORE ENGINE ────────────────────────────────────────────────────────
function calcHeatScore(match) {
  const { home, away, minute, dangerous_attacks_per_min: dapm } = match;
  let score = 0;
  const triggers = [];
  let high_pressure = 0, red_card_multiplier = 0, vila_effect = 0;

  const dominant = home.possession > away.possession ? home : away;
  let posScore = 0, atkScore = 0;
  if (dominant.possession >= 65) {
    posScore = Math.min(20, ((dominant.possession - 65) / 15) * 20);
    triggers.push(`Dominant possession: ${dominant.name} ${dominant.possession}%`);
  }
  if (dapm >= 1.5) {
    atkScore = Math.min(15, ((dapm - 1.5) / 2.5) * 15);
    triggers.push(`High attack rate: ${dapm.toFixed(2)}/min`);
  }
  if (posScore > 0 && atkScore > 0) triggers.push("⚡ High Pressure Zone activated");
  const sotBonus = Math.min(10, (home.shots_on_target + away.shots_on_target) * 1.2);
  high_pressure = Math.round(posScore + atkScore);
  score += high_pressure + sotBonus;

  const checkRC = (atk, def, ag, dg) => {
    if (def.red_cards >= 1 && atk.favorite === false && ag >= dg)
      return Math.min(30, 20 + def.red_cards * 10);
    return 0;
  };
  red_card_multiplier = Math.max(checkRC(home,away,home.goals,away.goals), checkRC(away,home,away.goals,home.goals));
  if (red_card_multiplier > 0) { score += red_card_multiplier; triggers.push("🟥 Red Card Multiplier active"); }

  const in1H = minute >= 35 && minute <= 45;
  const in2H = minute >= 80 && minute <= 93;
  if (in1H || in2H) {
    const remaining = in1H ? 45 - minute : 90 - minute;
    const urgency = Math.max(0, 10 - remaining);
    const cornerP = Math.min(10, (home.corners + away.corners) * 0.8);
    vila_effect = Math.round(Math.min(35, urgency * 2.5 + cornerP));
    score += vila_effect;
    triggers.push(`⏱️ Vila Effect: ${remaining}′ remaining`);
  }

  const final = Math.min(100, Math.max(0, Math.round(score)));
  const alert_level = final >= 80 ? "🔥 EXTREME" : final >= 60 ? "🟠 HIGH" : final >= 40 ? "🟡 MEDIUM" : "🟢 LOW";
  return { heat_score: final, alert_level, breakdown: { high_pressure, red_card_multiplier, vila_effect, triggers } };
}

// ─── API HELPERS ──────────────────────────────────────────────────────────────
function parseStat(stats, idx, name, fb = 0) {
  try {
    const s = stats[idx]?.statistics?.find(s => s.type === name);
    if (!s || s.value === null) return fb;
    if (typeof s.value === "string" && s.value.endsWith("%")) return parseFloat(s.value);
    return parseFloat(s.value) || fb;
  } catch { return fb; }
}

async function fetchLiveMatches() {
  const headers = { "X-RapidAPI-Key": RAPIDAPI_KEY, "X-RapidAPI-Host": RAPIDAPI_HOST };
  const r = await fetch("https://api-football-v1.p.rapidapi.com/v3/fixtures?live=all", { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const { response: fixtures } = await r.json();
  if (!fixtures?.length) return [];

  const results = [];
  for (const fx of fixtures.slice(0, 15)) {
    try {
      const fid = fx.fixture.id;
      const sr = await fetch(`https://api-football-v1.p.rapidapi.com/v3/fixtures/statistics?fixture=${fid}`, { headers });
      const { response: stats } = await sr.json();
      const minute = fx.fixture.status.elapsed || 0;
      const home = {
        name: fx.teams.home.name, logo: fx.teams.home.logo,
        goals: fx.goals.home ?? 0,
        possession: parseStat(stats,0,"Ball Possession"),
        shots_on_target: parseStat(stats,0,"Shots on Goal"),
        corners: parseStat(stats,0,"Corner Kicks"),
        dangerous_attacks: parseStat(stats,0,"Dangerous Attacks"),
        yellow_cards: parseStat(stats,0,"Yellow Cards"),
        red_cards: parseStat(stats,0,"Red Cards"),
        favorite: fx.teams.home.winner,
      };
      const away = {
        name: fx.teams.away.name, logo: fx.teams.away.logo,
        goals: fx.goals.away ?? 0,
        possession: parseStat(stats,1,"Ball Possession"),
        shots_on_target: parseStat(stats,1,"Shots on Goal"),
        corners: parseStat(stats,1,"Corner Kicks"),
        dangerous_attacks: parseStat(stats,1,"Dangerous Attacks"),
        yellow_cards: parseStat(stats,1,"Yellow Cards"),
        red_cards: parseStat(stats,1,"Red Cards"),
        favorite: fx.teams.away.winner,
      };
      const dapm = +((home.dangerous_attacks + away.dangerous_attacks) / Math.max(minute,1)).toFixed(2);
      const base = { fixture_id: fid, league: fx.league.name, country: fx.league.country, minute, status: fx.fixture.status.short, home, away, dangerous_attacks_per_min: dapm, odds: null, timeline: [0] };
      results.push({ ...base, ...calcHeatScore(base) });
      await new Promise(r => setTimeout(r, 150));
    } catch {}
  }
  return results.sort((a,b) => b.heat_score - a.heat_score);
}

// ─── DEMO DATA ────────────────────────────────────────────────────────────────
const DEMO = [
  { fixture_id:1001, league:"Premier League", country:"England", minute:87, status:"2H", home:{name:"Man City",logo:"",goals:1,possession:68,shots_on_target:9,corners:7,dangerous_attacks:42,yellow_cards:2,red_cards:0,favorite:true}, away:{name:"Arsenal",logo:"",goals:1,possession:32,shots_on_target:3,corners:2,dangerous_attacks:18,yellow_cards:1,red_cards:1,favorite:false}, dangerous_attacks_per_min:2.41, odds:null, timeline:[12,18,22,28,35,41,48,55,60,67,72,78,85,91] },
  { fixture_id:1007, league:"Scottish Prem", country:"Scotland", minute:85, status:"2H", home:{name:"Celtic",logo:"",goals:2,possession:54,shots_on_target:7,corners:6,dangerous_attacks:38,yellow_cards:1,red_cards:0,favorite:true}, away:{name:"Rangers",logo:"",goals:2,possession:46,shots_on_target:5,corners:5,dangerous_attacks:29,yellow_cards:2,red_cards:0,favorite:false}, dangerous_attacks_per_min:1.85, odds:null, timeline:[8,14,20,28,34,40,44,50,58,63,70,74,78] },
  { fixture_id:1002, league:"La Liga", country:"Spain", minute:38, status:"1H", home:{name:"Real Madrid",logo:"",goals:0,possession:52,shots_on_target:4,corners:4,dangerous_attacks:24,yellow_cards:1,red_cards:0,favorite:true}, away:{name:"Barcelona",logo:"",goals:0,possession:48,shots_on_target:5,corners:3,dangerous_attacks:22,yellow_cards:0,red_cards:0,favorite:false}, dangerous_attacks_per_min:1.68, odds:null, timeline:[10,18,25,32,38] },
  { fixture_id:1004, league:"Ligue 1", country:"France", minute:56, status:"2H", home:{name:"PSG",logo:"",goals:2,possession:61,shots_on_target:6,corners:5,dangerous_attacks:35,yellow_cards:0,red_cards:0,favorite:true}, away:{name:"Lyon",logo:"",goals:1,possession:39,shots_on_target:2,corners:1,dangerous_attacks:14,yellow_cards:2,red_cards:0,favorite:false}, dangerous_attacks_per_min:1.21, odds:null, timeline:[15,24,30,38,45,52,56] },
  { fixture_id:1003, league:"Bundesliga", country:"Germany", minute:14, status:"1H", home:{name:"Bayern Munich",logo:"",goals:1,possession:67,shots_on_target:3,corners:2,dangerous_attacks:18,yellow_cards:0,red_cards:0,favorite:true}, away:{name:"Dortmund",logo:"",goals:0,possession:33,shots_on_target:1,corners:1,dangerous_attacks:7,yellow_cards:0,red_cards:0,favorite:false}, dangerous_attacks_per_min:1.11, odds:null, timeline:[8,14] },
].map(m => ({ ...m, ...calcHeatScore(m) }));

// ─── UI COMPONENTS ────────────────────────────────────────────────────────────
function Sparkline({ data, width=110, height=22 }) {
  if (!data||data.length<2) return null;
  const max=Math.max(...data,1),min=Math.min(...data),range=max-min||1;
  const pts=data.map((v,i)=>`${(i/(data.length-1))*width},${height-((v-min)/range)*(height-3)-1}`).join(" ");
  const c=data[data.length-1]>=80?"#ff3b30":data[data.length-1]>=60?"#ff9500":"#ffd60a";
  return <svg width={width} height={height}><polyline points={pts} fill="none" stroke={c} strokeWidth="1.5" strokeLinejoin="round" opacity="0.7"/></svg>;
}

function MomentumGraph({ timeline, minute }) {
  const W=280,H=56;
  if (!timeline||timeline.length<2) return null;
  const pts=timeline.map((v,i)=>`${(i/(timeline.length-1))*W},${H-(v/100)*H}`).join(" ");
  const c=timeline[timeline.length-1]>=80?"#ff3b30":"#ff9500";
  return (
    <div style={{marginTop:12,padding:"10px 12px",background:"#ffffff04",borderRadius:8,border:"1px solid #ffffff08"}}>
      <div style={{fontSize:10,color:"#444",fontFamily:"monospace",marginBottom:6}}>MOMENTUM TIMELINE</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
        <defs><linearGradient id="mgf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity="0.2"/><stop offset="100%" stopColor={c} stopOpacity="0"/></linearGradient></defs>
        {[25,50,75].map(y=><line key={y} x1="0" y1={H-(y/100)*H} x2={W} y2={H-(y/100)*H} stroke="#ffffff06" strokeWidth="1" strokeDasharray="3,4"/>)}
        <polygon points={`0,${H-(timeline[0]/100)*H} ${pts} ${W},${H} 0,${H}`} fill="url(#mgf)"/>
        <polyline points={pts} fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round"/>
        <circle cx={W} cy={H-(timeline[timeline.length-1]/100)*H} r="3" fill={c}/>
      </svg>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#333",fontFamily:"monospace",marginTop:3}}>
        <span>0′</span><span>45′</span><span>{minute}′</span>
      </div>
    </div>
  );
}

function OddsDisplay({ odds, homeName, awayName }) {
  if (!odds) return (
    <div style={{marginTop:12,fontSize:10,color:"#2a2a2a",fontFamily:"monospace",padding:"8px 10px",background:"#ffffff03",borderRadius:8,border:"1px solid #ffffff06"}}>
      Live odds require RapidAPI Ultra plan ($39/mo)
    </div>
  );
  return (
    <div style={{marginTop:12}}>
      <div style={{fontSize:10,color:"#444",fontFamily:"monospace",marginBottom:6}}>LIVE ODDS</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {[{label:`⚽ ${homeName}`,val:odds.next_goal_home,color:"#0a84ff"},{label:`⚽ ${awayName}`,val:odds.next_goal_away,color:"#ff6b35"},{label:"Over 0.5",val:odds.over_05,color:"#30d158"}].map(({label,val,color})=>(
          <div key={label} style={{flex:1,minWidth:70,padding:"8px 10px",borderRadius:8,background:"#ffffff04",border:`1px solid ${color}33`,textAlign:"center"}}>
            <div style={{fontSize:9,color:"#555",fontFamily:"monospace",marginBottom:3}}>{label}</div>
            <div style={{fontSize:16,fontWeight:800,color,fontFamily:"monospace"}}>{val.toFixed(2)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeatRing({ score }) {
  const r=26,cx=34,cy=34,circ=2*Math.PI*r;
  const color=score>=80?"#ff3b30":score>=60?"#ff9500":score>=40?"#ffd60a":"#30d158";
  return (
    <svg width="68" height="68" style={{filter:score>=80?"drop-shadow(0 0 8px #ff3b3088)":score>=60?"drop-shadow(0 0 5px #ff950066)":"none",flexShrink:0}}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ffffff0d" strokeWidth="5"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="5" strokeDasharray={`${(score/100)*circ} ${circ}`} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} style={{transition:"stroke-dasharray 0.8s ease"}}/>
      <text x={cx} y={cy+1} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize="12" fontWeight="800" fontFamily="monospace">{score}</text>
    </svg>
  );
}

function StatBar({ label, homeVal, awayVal, fmt=v=>v }) {
  const total=(homeVal+awayVal)||1;
  return (
    <div style={{marginBottom:7}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:3,fontFamily:"monospace"}}>
        <span style={{color:"#bbb"}}>{fmt(homeVal)}</span><span style={{color:"#444"}}>{label}</span><span style={{color:"#bbb"}}>{fmt(awayVal)}</span>
      </div>
      <div style={{height:4,background:"#ffffff0a",borderRadius:2,overflow:"hidden",display:"flex"}}>
        <div style={{width:`${(homeVal/total)*100}%`,background:"linear-gradient(90deg,#0a84ff,#5ac8fa)",transition:"width .5s ease"}}/>
        <div style={{flex:1,background:"linear-gradient(90deg,#ff6b35,#ff3b30)"}}/>
      </div>
    </div>
  );
}

function BdBar({ label, val, max, color }) {
  return (
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,fontFamily:"monospace",marginBottom:3}}>
        <span style={{color:"#555"}}>{label}</span><span style={{color}}>{val}/{max}</span>
      </div>
      <div style={{height:4,background:"#ffffff08",borderRadius:2}}>
        <div style={{width:`${(val/max)*100}%`,height:"100%",background:color,borderRadius:2,transition:"width .6s ease"}}/>
      </div>
    </div>
  );
}

function MatchCard({ match:m, expanded, onToggle, isFav, onFavToggle, alertThreshold }) {
  const s=m.heat_score;
  const isVila=(m.minute>=35&&m.minute<=45)||(m.minute>=80&&m.minute<=93);
  const border=s>=80?"#ff3b3066":s>=60?"#ff950044":s>=40?"#ffd60a22":"#30d15818";
  return (
    <div style={{background:`linear-gradient(135deg,${s>=80?"#180808":"#111111"},#0c0c0c)`,border:`1px solid ${border}`,borderRadius:12,padding:"14px 18px",transition:"all 0.2s",position:"relative",overflow:"hidden",boxShadow:s>=80?"0 0 24px #ff3b3018":"0 2px 10px #00000050"}}>
      {s>=80&&<div style={{position:"absolute",inset:0,pointerEvents:"none",background:"radial-gradient(ellipse at 50% 0%,#ff3b3010,transparent 70%)",animation:"mpulse 2s ease-in-out infinite"}}/>}
      <button onClick={e=>{e.stopPropagation();onFavToggle(m.fixture_id);}} style={{position:"absolute",top:12,right:14,background:"none",border:"none",cursor:"pointer",fontSize:15,opacity:isFav?1:0.15,transition:"opacity 0.2s",filter:isFav?"drop-shadow(0 0 4px #ffd60a)":"none"}}>⭐</button>

      <div onClick={onToggle} style={{cursor:"pointer"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <HeatRing score={s}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:3,flexWrap:"wrap"}}>
              {m.home.logo&&<img src={m.home.logo} width="14" height="14" style={{borderRadius:2}} alt=""/>}
              <span style={{fontSize:10,color:"#444",fontFamily:"monospace"}}>{m.country} · {m.league}</span>
              {isVila&&<span style={{fontSize:9,background:"#ffd60a18",color:"#ffd60a",border:"1px solid #ffd60a44",borderRadius:4,padding:"1px 5px",fontFamily:"monospace"}}>VILA ⏱</span>}
              {s>=alertThreshold&&s<80&&<span style={{fontSize:9,background:"#ff950018",color:"#ff9500",border:"1px solid #ff950044",borderRadius:4,padding:"1px 5px",fontFamily:"monospace"}}>🔔 ALERT</span>}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <span style={{fontSize:14,fontWeight:700,color:"#eee"}}>{m.home.name}</span>
              <div style={{fontSize:18,fontWeight:800,color:"#fff",fontFamily:"monospace",background:"#ffffff0a",borderRadius:7,padding:"3px 12px",border:"1px solid #ffffff0d",letterSpacing:"0.1em"}}>{m.home.goals} – {m.away.goals}</div>
              <span style={{fontSize:14,fontWeight:700,color:"#eee"}}>{m.away.name}</span>
            </div>
            <div style={{marginTop:5}}><Sparkline data={m.timeline}/></div>
            <div style={{display:"flex",gap:5,marginTop:4,flexWrap:"wrap"}}>
              {m.home.red_cards>0&&<span style={{fontSize:9,background:"#ff3b3018",color:"#ff6b6b",border:"1px solid #ff3b3044",borderRadius:4,padding:"1px 6px",fontFamily:"monospace"}}>🟥 {m.home.name} RED</span>}
              {m.away.red_cards>0&&<span style={{fontSize:9,background:"#ff3b3018",color:"#ff6b6b",border:"1px solid #ff3b3044",borderRadius:4,padding:"1px 6px",fontFamily:"monospace"}}>🟥 {m.away.name} RED</span>}
            </div>
          </div>
          <div style={{textAlign:"right",flexShrink:0,paddingRight:20}}>
            <div style={{fontSize:20,fontWeight:800,color:"#30d158",fontFamily:"monospace",lineHeight:1}}>{m.minute}′</div>
            <div style={{fontSize:9,color:"#333",marginTop:1,fontFamily:"monospace"}}>{m.status}</div>
            <div style={{fontSize:10,marginTop:5,color:s>=80?"#ff3b30":s>=60?"#ff9500":"#555"}}>{m.alert_level}</div>
          </div>
        </div>

        {expanded&&(
          <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #ffffff08"}}>
            <OddsDisplay odds={m.odds} homeName={m.home.name} awayName={m.away.name}/>
            <MomentumGraph timeline={m.timeline} minute={m.minute}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginTop:14}} className="expand-grid">
              <div>
                <div style={{fontSize:10,color:"#444",fontFamily:"monospace",marginBottom:10}}>MATCH STATS</div>
                <StatBar label="POSSESSION" homeVal={m.home.possession} awayVal={m.away.possession} fmt={v=>`${v}%`}/>
                <StatBar label="SHOTS ON TGT" homeVal={m.home.shots_on_target} awayVal={m.away.shots_on_target}/>
                <StatBar label="CORNERS" homeVal={m.home.corners} awayVal={m.away.corners}/>
                <StatBar label="DANGER ATK" homeVal={m.home.dangerous_attacks} awayVal={m.away.dangerous_attacks}/>
                <div style={{fontSize:10,color:"#444",fontFamily:"monospace",marginTop:8}}>⚡ {m.dangerous_attacks_per_min}/min</div>
              </div>
              <div>
                <div style={{fontSize:10,color:"#444",fontFamily:"monospace",marginBottom:10}}>HEAT BREAKDOWN</div>
                <BdBar label="High Pressure" val={m.breakdown.high_pressure} max={35} color="#0a84ff"/>
                <BdBar label="Red Card ×" val={m.breakdown.red_card_multiplier} max={30} color="#ff3b30"/>
                <BdBar label="Vila Effect" val={m.breakdown.vila_effect} max={35} color="#ffd60a"/>
                <div style={{marginTop:10}}>
                  {m.breakdown.triggers.map((t,i)=><div key={i} style={{fontSize:9.5,color:"#777",fontFamily:"monospace",marginBottom:4,lineHeight:1.4}}>{t}</div>)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AlertPanel({ threshold, onChange, onClose }) {
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:"#000000cc",display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#111",border:"1px solid #ffffff14",borderRadius:14,padding:24,width:"100%",maxWidth:320}}>
        <div style={{fontSize:14,fontWeight:700,color:"#fff",marginBottom:6}}>🔔 Alert Threshold</div>
        <div style={{fontSize:11,color:"#555",fontFamily:"monospace",marginBottom:20}}>Browser notification fires when Heat Score ≥</div>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
          <span style={{fontSize:12,color:"#888"}}>Threshold</span>
          <span style={{fontSize:18,fontWeight:800,fontFamily:"monospace",color:threshold>=80?"#ff3b30":threshold>=60?"#ff9500":"#ffd60a"}}>{threshold}</span>
        </div>
        <input type="range" min="40" max="95" step="5" value={threshold} onChange={e=>onChange(Number(e.target.value))} style={{width:"100%",accentColor:"#ff3b30",cursor:"pointer"}}/>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#333",fontFamily:"monospace",marginTop:4,marginBottom:16}}>
          <span>40</span><span>60</span><span>80</span><span>95</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:14}}>
          {[60,70,80].map(v=>(
            <button key={v} onClick={()=>onChange(v)} style={{padding:"8px 0",borderRadius:8,cursor:"pointer",border:threshold===v?"1px solid #ff3b3066":"1px solid #ffffff0a",background:threshold===v?"#ff3b3018":"#ffffff05",color:threshold===v?"#ff3b30":"#555",fontSize:12,fontFamily:"monospace",fontWeight:700}}>{v}</button>
          ))}
        </div>
        <button onClick={onClose} style={{width:"100%",padding:"10px 0",borderRadius:8,background:"#ffffff08",border:"1px solid #ffffff14",color:"#aaa",fontSize:12,cursor:"pointer",fontFamily:"monospace"}}>Done</button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // "no_key" | "no_matches" | "api_error" | null
  const [isDemo, setIsDemo] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH);
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [leagueFilter, setLeagueFilter] = useState("All Leagues");
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
      if (!RAPIDAPI_KEY) throw new Error("NO_KEY");
      const live = await fetchLiveMatches();
      if (live.length === 0) {
        setIsDemo(true);
        setMatches(DEMO.map(m => ({ ...m, timeline: [m.heat_score] })));
        setError("no_matches");
      } else {
        setIsDemo(false);
        setMatches(prev => live.map(m => {
          const old = prev.find(p => p.fixture_id === m.fixture_id);
          const timeline = old ? [...old.timeline, m.heat_score].slice(-20) : [m.heat_score];
          return { ...m, timeline };
        }));
      }
    } catch (e) {
      setIsDemo(true);
      setMatches(DEMO.map(m => ({ ...m, timeline: [m.heat_score] })));
      setError(e.message === "NO_KEY" ? "no_key" : "api_error");
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
        if (Notification.permission === "granted") new Notification(`🔔 Heat Alert ≥${alertThreshold}`, { body: `${m.home.name} vs ${m.away.name} — ${m.heat_score} pts (${m.minute}′)` });
        setAlertFired(prev => new Set([...prev, m.fixture_id]));
      }
    });
  }, [matches, alertThreshold, alertFired]);

  const toggleFav = id => setFavourites(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  let displayed = [...matches];
  if (showFavsOnly) displayed = displayed.filter(m => favourites.has(m.fixture_id));
  if (leagueFilter !== "All Leagues") displayed = displayed.filter(m => m.league === leagueFilter);
  if (filter === "EXTREME") displayed = displayed.filter(m => m.heat_score >= 80);
  else if (filter === "HIGH") displayed = displayed.filter(m => m.heat_score >= 60 && m.heat_score < 80);
  else if (filter === "OTHER") displayed = displayed.filter(m => m.heat_score < 60);

  const extremeCount = matches.filter(m => m.heat_score >= 80).length;

  return (
    <div style={{minHeight:"100vh",background:"#080808",color:"#e0e0e0",fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes mpulse{0%,100%{opacity:.3}50%{opacity:1}}
        @keyframes mblink{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes mslide{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#2a2a2a;border-radius:2px}
        @media(max-width:600px){.expand-grid{grid-template-columns:1fr!important}.hrow{flex-direction:column;align-items:flex-start!important}.frow,.lrow{overflow-x:auto;padding-bottom:4px}}
      `}</style>

      {showAlertPanel && <AlertPanel threshold={alertThreshold} onChange={setAlertThreshold} onClose={() => setShowAlertPanel(false)}/>}

      {/* HEADER */}
      <div style={{position:"sticky",top:0,zIndex:100,background:"#080808f0",backdropFilter:"blur(16px)",borderBottom:"1px solid #ffffff08",padding:"14px 16px 10px"}}>
        <div style={{maxWidth:820,margin:"0 auto"}}>
          <div className="hrow" style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <span style={{fontSize:22}}>⚽</span>
              <span style={{fontSize:19,fontWeight:800,letterSpacing:"-0.03em",color:"#fff"}}>MOMENTUM<span style={{color:"#ff3b30"}}>TRACK</span></span>
              {extremeCount > 0 && <span style={{fontSize:10,fontWeight:700,background:"#ff3b30",color:"#fff",borderRadius:20,padding:"2px 8px",fontFamily:"monospace",animation:"mblink 1.4s ease-in-out infinite"}}>{extremeCount} 🔥</span>}
              {isDemo
                ? <span style={{fontSize:9,background:"#ffd60a18",color:"#ffd60a",border:"1px solid #ffd60a33",borderRadius:4,padding:"2px 7px",fontFamily:"monospace"}}>DEMO</span>
                : <span style={{fontSize:9,background:"#30d15818",color:"#30d158",border:"1px solid #30d15833",borderRadius:4,padding:"2px 7px",fontFamily:"monospace"}}>● LIVE</span>
              }
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setShowFavsOnly(f=>!f)} style={{padding:"7px 11px",borderRadius:8,cursor:"pointer",border:showFavsOnly?"1px solid #ffd60a66":"1px solid #ffffff0a",background:showFavsOnly?"#ffd60a18":"#ffffff06",color:showFavsOnly?"#ffd60a":"#444",fontSize:13}}>⭐{favourites.size>0&&<span style={{fontSize:10}}> {favourites.size}</span>}</button>
              <button onClick={()=>setShowAlertPanel(true)} style={{padding:"7px 11px",borderRadius:8,cursor:"pointer",border:"1px solid #ffffff0a",background:"#ffffff06",color:"#444",fontSize:13}}>🔔 <span style={{fontSize:10,fontFamily:"monospace"}}>{alertThreshold}</span></button>
              <button onClick={load} style={{display:"flex",alignItems:"center",gap:5,background:"#ffffff06",border:"1px solid #ffffff0a",borderRadius:8,padding:"7px 12px",cursor:"pointer",color:countdown<10?"#ff9500":"#444",fontSize:12,fontFamily:"monospace"}}>
                {loading?<span style={{display:"inline-block",width:10,height:10,border:"2px solid #ff3b30",borderTopColor:"transparent",borderRadius:"50%"}}/>:"↻"} {countdown}s
              </button>
            </div>
          </div>

          {/* Banners */}
          {error==="no_key"&&<div style={{marginBottom:8,padding:"8px 12px",background:"#ff3b3012",border:"1px solid #ff3b3033",borderRadius:8,fontSize:11,color:"#ff6b6b",fontFamily:"monospace"}}>
            ⚠️ No API key — add <strong>VITE_RAPIDAPI_KEY</strong> in Vercel → Settings → Environment Variables → Redeploy
          </div>}
          {error==="no_matches"&&<div style={{marginBottom:8,padding:"8px 12px",background:"#ffd60a0a",border:"1px solid #ffd60a22",borderRadius:8,fontSize:11,color:"#ffd60a",fontFamily:"monospace"}}>
            ⚽ No live matches right now — showing demo. Real data loads automatically when games kick off.
          </div>}
          {error==="api_error"&&<div style={{marginBottom:8,padding:"8px 12px",background:"#ff3b3012",border:"1px solid #ff3b3033",borderRadius:8,fontSize:11,color:"#ff6b6b",fontFamily:"monospace"}}>
            ⚠️ API error — check your RapidAPI key or daily quota (free = 100 req/day). Showing demo data.
          </div>}

          <div className="lrow" style={{display:"flex",gap:5,marginBottom:7,flexWrap:"nowrap"}}>
            {LEAGUES.map(l=>(
              <button key={l} onClick={()=>setLeagueFilter(l)} style={{fontSize:10,fontFamily:"monospace",padding:"4px 10px",borderRadius:6,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,border:leagueFilter===l?"1px solid #0a84ff66":"1px solid #ffffff08",background:leagueFilter===l?"#0a84ff18":"transparent",color:leagueFilter===l?"#0a84ff":"#444"}}>
                {l==="All Leagues"?"🌍 All":l}
              </button>
            ))}
          </div>

          <div className="frow" style={{display:"flex",gap:5}}>
            {[{key:"ALL",label:`ALL (${matches.length})`},{key:"EXTREME",label:`🔥 EXTREME (${matches.filter(m=>m.heat_score>=80).length})`},{key:"HIGH",label:`🟠 HIGH (${matches.filter(m=>m.heat_score>=60&&m.heat_score<80).length})`},{key:"OTHER",label:"OTHER"}].map(({key,label})=>(
              <button key={key} onClick={()=>setFilter(key)} style={{fontSize:10,fontFamily:"monospace",padding:"4px 10px",borderRadius:6,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,border:filter===key?"1px solid #ffffff2a":"1px solid #ffffff08",background:filter===key?"#ffffff12":"transparent",color:filter===key?"#fff":"#444"}}>{label}</button>
            ))}
          </div>
          <div style={{fontSize:10,color:"#2a2a2a",fontFamily:"monospace",marginTop:6}}>
            {isDemo?"● DEMO":"● LIVE"} · {matches.length} matches · refresh #{tick}
          </div>
        </div>
      </div>

      {/* MATCH LIST */}
      <div style={{maxWidth:820,margin:"0 auto",padding:"14px 16px 40px"}}>
        {loading&&matches.length===0?(
          <div style={{textAlign:"center",color:"#333",padding:"60px 0",fontFamily:"monospace"}}>Fetching live matches…</div>
        ):displayed.length===0?(
          <div style={{textAlign:"center",color:"#2a2a2a",padding:"60px 0",fontFamily:"monospace"}}>
            {showFavsOnly?"No watchlisted matches yet — star a game to track it.":"No matches in this category."}
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {displayed.map((m,i)=>(
              <div key={m.fixture_id} style={{animation:`mslide 0.25s ease ${i*0.04}s both`}}>
                <MatchCard match={m} expanded={expanded===m.fixture_id} onToggle={()=>setExpanded(expanded===m.fixture_id?null:m.fixture_id)} isFav={favourites.has(m.fixture_id)} onFavToggle={toggleFav} alertThreshold={alertThreshold}/>
              </div>
            ))}
          </div>
        )}

        {/* Setup guide */}
        {isDemo&&(
          <div style={{marginTop:24,padding:14,borderRadius:10,background:"#0d0d0d",border:"1px solid #ffffff06"}}>
            <div style={{fontSize:10,color:"#2a2a2a",fontFamily:"monospace",marginBottom:8,letterSpacing:"0.08em"}}>CONNECT YOUR RAPIDAPI KEY</div>
            <div style={{fontSize:10,color:"#333",fontFamily:"monospace",lineHeight:2}}>
              1. rapidapi.com → search <span style={{color:"#0a84ff"}}>API-Football</span> → subscribe Free<br/>
              2. Copy your <span style={{color:"#0a84ff"}}>X-RapidAPI-Key</span><br/>
              3. Vercel → Settings → Environment Variables<br/>
              4. Add key: <span style={{color:"#30d158"}}>VITE_RAPIDAPI_KEY</span> = your_key<br/>
              5. Redeploy → banner switches from DEMO → ● LIVE
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
