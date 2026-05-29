import { useState } from "react";

// ─── EV SCANNER COMPONENT ────────────────────────────────────────────────────

function EVScanner({ onClose }) {
  const [tab, setTab] = useState('poisson');
  const [atkH, setAtkH] = useState(1.35);
  const [defH, setDefH] = useState(0.88);
  const [atkA, setAtkA] = useState(1.05);
  const [defA, setDefA] = useState(1.12);
  const [minEl, setMinEl] = useState(67);
  const [gH, setGH] = useState(1);
  const [gA, setGA] = useState(1);
  const [bkOdds, setBkOdds] = useState(1.85);
  const [myProb, setMyProb] = useState(62);
  const [edgeThresh, setEdgeThresh] = useState(1.05);
  const [alerts, setAlerts] = useState(() => { try { return JSON.parse(localStorage.getItem('mt_bt')||'[]'); } catch { return []; } });
  const [btMatch, setBtMatch] = useState('');
  const [btMin, setBtMin] = useState(78);
  const [btHeat, setBtHeat] = useState(74);
  const [btProb, setBtProb] = useState(68);
  const [btOdds, setBtOdds] = useState(1.88);
  const [btOut, setBtOut] = useState('');

  function poi(k, L) { let p = Math.exp(-L); for (let i = 0; i < k; i++) p *= L/(i+1); return p; }
  function poiCum(max, L) { let s = 0; for (let i = 0; i <= max; i++) s += poi(i, L); return s; }

  const tl = Math.max(0, 90 - minEl);
  const diff = gH - gA;
  const motH = diff < 0 ? (tl < 10 ? 1.8 : 1.4) : diff > 0 ? 0.75 : 1.1;
  const motA = gA - gH < 0 && gA < gH ? (tl < 10 ? 1.8 : 1.4) : gA > gH ? 0.75 : 1.1;
  const xH = atkH * defA * 1.36 * (tl / 90) * motH;
  const xA = atkA * defH * 1.06 * (tl / 90) * motA;
  const xT = xH + xA;
  const probGoal = 1 - Math.exp(-xT);
  const modelProb = Math.round(probGoal * 100);

  const evVal = (myProb / 100) * bkOdds;
  const edge = (evVal - 1) * 100;
  const mktProb = Math.round(100 / bkOdds);
  const kelly = Math.max(0, (myProb/100 - (1 - myProb/100) / (bkOdds - 1)) * 100);
  const isBet = evVal >= edgeThresh;

  function logAlert() {
  if (!btMatch.trim()) return;
  const a = { id: Date.now(), m: btMatch, min: btMin, heat: btHeat, prob: btProb, odds: btOdds, out: btOut, ts: new Date().toLocaleDateString() };
  const next = [...alerts, a];
  setAlerts(next);
  try { localStorage.setItem('mt_bt', JSON.stringify(next)); } catch {}
  setBtMatch('');
  }

  const settled = alerts.filter(a => a.out);
  const hits = settled.filter(a => a.out === 'yes');
  const hitRate = settled.length ? Math.round(hits.length / settled.length * 100) : null;
  const avgHeat = alerts.length ? Math.round(alerts.reduce((s,a)=>s+a.heat,0)/alerts.length) : null;
  const windows = [
  {l:"35-45'",lo:35,hi:45},{l:"70-79'",lo:70,hi:79},
  {l:"80-93'",lo:80,hi:93},{l:"Other",lo:0,hi:34}
  ];
  const teams = [
  {n:'Man City',ah:1.85,dh:0.62,aa:1.52,da:0.74,t:'Elite'},
  {n:'Arsenal',ah:1.65,dh:0.70,aa:1.38,da:0.82,t:'Top'},
  {n:'Liverpool',ah:1.72,dh:0.68,aa:1.44,da:0.79,t:'Elite'},
  {n:'Chelsea',ah:1.30,dh:0.91,aa:1.12,da:1.05,t:'Mid-top'},
  {n:'Man Utd',ah:1.05,dh:1.18,aa:0.88,da:1.28,t:'Mid'},
  {n:'Nottm Forest',ah:0.82,dh:0.88,aa:0.72,da:0.96,t:'Low-mid'},
  ];

  const homeMot = null;
  const awayMot = null;

  const tabStyle = active => ({
  padding: "8px 12px", border: `1.5px solid ${active ? "#1565c0" : "#e0e0e0"}`,
  borderRadius: 8, background: active ? "#e3f2fd" : "#fafafa",
  cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 500,
  color: active ? "#1565c0" : "#666", whiteSpace: "nowrap",
  });
  const metCard = { flex: 1, background: "#f5f5f5", borderRadius: 8, padding: "10px 8px", textAlign: "center" };

  return (
  <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#fff", zIndex: 1000, overflowY: "auto", maxWidth: 480, margin: "0 auto" }}>
  {/* Header */}
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "2px solid #f0f0f0", position: "sticky", top: 0, background: "#fff", zIndex: 10 }}>
  <span style={{ fontSize: 17, fontWeight: 800, color: "#111" }}>📊 EV Scanner</span>
  <button onClick={onClose} style={{ background: "#f0f0f0", border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#555" }}>✕ Close</button>
  </div>

  {/* Tabs */}
  <div style={{ display: "flex", gap: 6, padding: "12px 14px", overflowX: "auto", borderBottom: "1px solid #f0f0f0" }}>
  {[['poisson','🎯 Poisson'],['ev','💰 EV Calc'],['strength','💪 Strength'],['backtest','📋 Backtest']].map(([k,l]) => (
  <button key={k} onClick={() => setTab(k)} style={tabStyle(tab===k)}>{l}</button>
  ))}
  </div>

  <div style={{ padding: "14px 14px 80px" }}>

  {/* POISSON */}
  {tab === 'poisson' && (
  <div>
  <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
  {[['Home xG', xH.toFixed(2)],['Away xG', xA.toFixed(2)],['Goal prob', Math.round(probGoal*100)+'%'],['Market*','54%']].map(([l,v]) => (
  <div key={l} style={metCard}><div style={{ fontSize: 11, color: "#888", marginBottom: 3 }}>{l}</div><div style={{ fontSize: 18, fontWeight: 700, color: "#111" }}>{v}</div></div>
  ))}
  </div>
  <div style={{ background: "#f9f9f9", borderRadius: 10, border: "1px solid #eee", padding: 14, marginBottom: 12 }}>
  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Match inputs</div>
  {[['Home attack',atkH,setAtkH,0.5,2.5,0.01],['Home defence',defH,setDefH,0.5,2.5,0.01],['Away attack',atkA,setAtkA,0.5,2.5,0.01],['Away defence',defA,setDefA,0.5,2.5,0.01],['Minutes',minEl,setMinEl,1,90,1]].map(([l,v,fn,mn,mx,st])=>(
  <div key={l} style={{ marginBottom: 10 }}>
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#777", marginBottom: 3 }}>
  <span>{l}</span><span style={{ fontWeight: 700, color: "#333" }}>{typeof v==='number'&&v%1!==0?v.toFixed(2):v}</span>
  </div>
  <input type="range" min={mn} max={mx} step={st} value={v} onChange={e=>fn(+e.target.value)} style={{ width: "100%" }} />
  </div>
  ))}
  <div style={{ display: "flex", gap: 12 }}>
  <div style={{ flex: 1 }}><div style={{ fontSize: 12, color: "#777", marginBottom: 3 }}>Home goals</div><input type="number" min="0" max="9" value={gH} onChange={e=>setGH(+e.target.value)} style={{ width: "100%", padding: "6px 10px", border: "1px solid #e0e0e0", borderRadius: 6, fontSize: 14 }} /></div>
  <div style={{ flex: 1 }}><div style={{ fontSize: 12, color: "#777", marginBottom: 3 }}>Away goals</div><input type="number" min="0" max="9" value={gA} onChange={e=>setGA(+e.target.value)} style={{ width: "100%", padding: "6px 10px", border: "1px solid #e0e0e0", borderRadius: 6, fontSize: 14 }} /></div>
  </div>
  </div>
  <div style={{ background: "#f9f9f9", borderRadius: 10, border: "1px solid #eee", padding: 14 }}>
  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Distribution</div>
  {[['P(0 more goals)',poi(0,xT)],['P(exactly 1)',poi(1,xT)],['P(exactly 2)',poi(2,xT)],['P(3+ goals)',1-poiCum(2,xT)],['P(over 0.5)',probGoal],['P(over 1.5)',1-poiCum(1,xT)]].map(([l,p])=>{
  const pct=Math.round(p*100), c=pct>=60?"#2e7d32":pct>=40?"#e65100":"#888";
  return <div key={l} style={{ marginBottom: 10 }}>
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}><span style={{ color: "#666" }}>{l}</span><span style={{ fontWeight: 700, color: c }}>{pct}%</span></div>
  <div style={{ height: 7, background: "#e0e0e0", borderRadius: 4 }}><div style={{ width: `${pct}%`, height: "100%", background: c, borderRadius: 4 }} /></div>
  </div>;
  })}
  </div>
  <div style={{ fontSize: 11, color: "#aaa", marginTop: 8 }}>* Market implied prob at odds 1.85</div>
  </div>
  )}

  {/* EV CALC */}
  {tab === 'ev' && (
  <div>
  <div style={{ background: "#f9f9f9", borderRadius: 10, border: "1px solid #eee", padding: 14, marginBottom: 12 }}>
  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Inputs</div>
  <div style={{ marginBottom: 12 }}>
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#777", marginBottom: 4 }}><span>Your model probability</span><span style={{ fontWeight: 700, color: "#333" }}>{myProb}%</span></div>
  <input type="range" min="1" max="99" step="1" value={myProb} onChange={e=>setMyProb(+e.target.value)} style={{ width: "100%" }} />
  </div>
  <div style={{ marginBottom: 12 }}>
  <div style={{ fontSize: 12, color: "#777", marginBottom: 4 }}>Bookmaker decimal odds</div>
  <input type="number" min="1.01" max="20" step="0.01" value={bkOdds} onChange={e=>setBkOdds(+e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid #e0e0e0", borderRadius: 6, fontSize: 15 }} />
  </div>
  <div>
  <div style={{ fontSize: 12, color: "#777", marginBottom: 4 }}>Minimum edge required</div>
  <select value={edgeThresh} onChange={e=>setEdgeThresh(+e.target.value)} style={{ width: "100%", padding: "8px", border: "1px solid #e0e0e0", borderRadius: 6, fontSize: 13 }}>
  <option value={1.02}>2% — conservative</option>
  <option value={1.05}>5% — standard</option>
  <option value={1.08}>8% — aggressive</option>
  <option value={1.10}>10% — value only</option>
  </select>
  </div>
  </div>
  <div style={{ background: isBet?"#e8f5e9":"#ffebee", borderRadius: 10, border: `2px solid ${isBet?"#43a047":"#e53935"}`, padding: 14, marginBottom: 12 }}>
  <div style={{ fontSize: 16, fontWeight: 800, color: isBet?"#1b5e20":"#b71c1c", marginBottom: 10 }}>{isBet?"✅ BET — Positive EV":"❌ SKIP — No edge"}</div>
  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
  {[['EV',evVal.toFixed(3)],['Edge',(edge>=0?'+':'')+edge.toFixed(1)+'%'],['Model',myProb+'%'],['Market',mktProb+'%'],['Kelly',kelly.toFixed(1)+'%']].map(([l,v])=>(
  <div key={l} style={{ flex: 1, background: "#fff8", borderRadius: 6, padding: "6px 4px", textAlign: "center" }}>
  <div style={{ fontSize: 10, color: isBet?"#2e7d32":"#c62828" }}>{l}</div>
  <div style={{ fontSize: 13, fontWeight: 700, color: isBet?"#1b5e20":"#b71c1c" }}>{v}</div>
  </div>
  ))}
  </div>
  <div style={{ fontSize: 12, color: isBet?"#2e7d32":"#c62828" }}>{edge>=0?`Your model is ${Math.round(myProb-mktProb)}pp above market — edge exists.`:"Market implies higher prob. No value."}</div>
  </div>
  </div>
  )}

  {/* STRENGTH */}
  {tab === 'strength' && (
  <div>
  <div style={{ background: "#e3f2fd", borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13, color: "#1565c0" }}>
  <strong>Formula:</strong> Attack = team avg goals ÷ league avg (1.36 home / 1.06 away). Defence = avg conceded ÷ league avg. Lower defence = better.
  </div>
  {teams.map((t,i)=>{
  const tc={Elite:"#2e7d32",Top:"#1565c0","Mid-top":"#e65100",Mid:"#888","Low-mid":"#c62828"}[t.t]||"#888";
  return <div key={i} style={{ background: "#f9f9f9", borderRadius: 10, border: "1px solid #eee", padding: 12, marginBottom: 8 }}>
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
  <span style={{ fontSize: 15, fontWeight: 700 }}>{t.n}</span>
  <span style={{ fontSize: 11, background: tc+"22", color: tc, border: `1px solid ${tc}44`, borderRadius: 10, padding: "2px 8px", fontWeight: 700 }}>{t.t}</span>
  </div>
  <div style={{ display: "flex", gap: 6 }}>
  {[['Atk H',t.ah],['Def H',t.dh],['Atk A',t.aa],['Def A',t.da]].map(([l,v])=>(
  <div key={l} style={{ flex: 1, background: "#fff", borderRadius: 6, padding: "6px 4px", textAlign: "center", border: "1px solid #eee" }}>
  <div style={{ fontSize: 10, color: "#888" }}>{l}</div>
  <div style={{ fontSize: 14, fontWeight: 700 }}>{v}</div>
  </div>
  ))}
  </div>
  </div>;
  })}
  </div>
  )}

  {/* BACKTEST */}
  {tab === 'backtest' && (
  <div>
  <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
  {[['Alerts',alerts.length],['Hit rate',hitRate!==null?hitRate+'%':'—'],['Avg heat',avgHeat||'—']].map(([l,v])=>(
  <div key={l} style={metCard}><div style={{ fontSize: 11, color: "#888", marginBottom: 3 }}>{l}</div><div style={{ fontSize: 18, fontWeight: 700 }}>{v}</div></div>
  ))}
  </div>
  <div style={{ background: "#f9f9f9", borderRadius: 10, border: "1px solid #eee", padding: 14, marginBottom: 12 }}>
  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Log new alert</div>
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
  <input type="text" value={btMatch} onChange={e=>setBtMatch(e.target.value)} placeholder="e.g. Arsenal vs Chelsea" style={{ padding: "8px 10px", border: "1px solid #e0e0e0", borderRadius: 6, fontSize: 13 }} />
  <div style={{ display: "flex", gap: 8 }}>
  {[['Min',btMin,setBtMin,1,93],['Heat',btHeat,setBtHeat,0,100],['Prob%',btProb,setBtProb,1,99]].map(([l,v,fn,mn,mx])=>(
  <div key={l} style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#888", marginBottom: 3 }}>{l}</div><input type="number" min={mn} max={mx} value={v} onChange={e=>fn(+e.target.value)} style={{ width: "100%", padding: "7px 8px", border: "1px solid #e0e0e0", borderRadius: 6, fontSize: 13 }} /></div>
  ))}
  </div>
  <div style={{ display: "flex", gap: 8 }}>
  <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#888", marginBottom: 3 }}>Odds</div><input type="number" min="1.01" max="10" step="0.01" value={btOdds} onChange={e=>setBtOdds(+e.target.value)} style={{ width: "100%", padding: "7px 8px", border: "1px solid #e0e0e0", borderRadius: 6, fontSize: 13 }} /></div>
  <div style={{ flex: 2 }}><div style={{ fontSize: 11, color: "#888", marginBottom: 3 }}>Outcome</div>
  <select value={btOut} onChange={e=>setBtOut(e.target.value)} style={{ width: "100%", padding: "7px 8px", border: "1px solid #e0e0e0", borderRadius: 6, fontSize: 13 }}>
  <option value="">Pending</option><option value="yes">Goal ✅</option><option value="no">No goal ❌</option>
  </select>
  </div>
  </div>
  <button onClick={logAlert} style={{ background: "#1565c0", color: "#fff", border: "none", borderRadius: 8, padding: "10px", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>Log alert</button>
  </div>
  </div>
  <div style={{ background: "#f9f9f9", borderRadius: 10, border: "1px solid #eee", padding: 14, marginBottom: 12 }}>
  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Window analysis</div>
  {windows.map(w=>{
  const wa=settled.filter(a=>a.min>=w.lo&&a.min<=w.hi);
  const wh=wa.filter(a=>a.out==='yes');
  const r=wa.length?Math.round(wh.length/wa.length*100):null;
  const rc=r===null?"#888":r>=70?"#2e7d32":r>=50?"#e65100":"#c62828";
  return <div key={w.l} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #eee" }}>
  <span style={{ fontSize: 13, color: "#555" }}>{w.l}</span>
  <span style={{ fontSize: 13, color: "#888" }}>{wa.length} alerts</span>
  <span style={{ fontSize: 14, fontWeight: 700, color: rc }}>{r!==null?r+'%':'—'}</span>
  </div>;
  })}
  </div>
  {alerts.length === 0
  ? <div style={{ textAlign: "center", color: "#bbb", padding: "2rem", fontSize: 13 }}>No alerts yet. Start logging.</div>
  : <div style={{ background: "#f9f9f9", borderRadius: 10, border: "1px solid #eee", padding: 14 }}>
  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Recent alerts</div>
  {[...alerts].reverse().slice(0,15).map(a=>{
  const ev2=((a.prob/100)*a.odds-1)*100;
  return <div key={a.id} style={{ padding: "8px 0", borderBottom: "1px solid #eee" }}>
  <div style={{ display: "flex", justifyContent: "space-between" }}>
  <span style={{ fontSize: 13, fontWeight: 600 }}>{a.m}</span>
  <span style={{ fontSize: 11, fontWeight: 700, color: a.out==='yes'?"#2e7d32":a.out==='no'?"#c62828":"#888" }}>{a.out==='yes'?'✅':a.out==='no'?'❌':'⏳'}</span>
  </div>
  <div style={{ fontSize: 12, color: "#888" }}>{a.min}′ · Heat {a.heat} · {a.prob}% · {a.odds} · EV {ev2>=0?'+':''}{ev2.toFixed(1)}%</div>
  </div>;
  })}
  </div>
  }
  </div>
  )}
  </div>
  </div>
  );
}

export default EVScanner;

