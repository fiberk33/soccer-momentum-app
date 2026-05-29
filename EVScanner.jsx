import { useState } from "react";

// ─── EV SCANNER ───────────────────────────────────────────────────────────────
// Accepts optional `match` prop to pre-fill from a live game
// Simple 3-indicator verdict: Pressure + Probability + Motivation
export default function EVScanner({ onClose, match }) {

  // ── PRE-FILL FROM MATCH ────────────────────────────────────────────────────
  // Safe match extraction - never crash if match is empty/null
  const hasMatch = !!(match && match.fixture_id);
  const minute   = match?.minute || 0;
  const hg       = match?.home?.goals ?? 0;
  const ag       = match?.away?.goals ?? 0;
  const heat     = match?.heat_score || match?.urgency_score || 0;
  const probPct  = match?.poisson?.prob_goal || 0;
  const homeName = match?.home?.name || "Home";
  const awayName = match?.away?.name || "Away";
  const homeMot  = match?.home?.motivation?.score ?? 5;
  const awayMot  = match?.away?.motivation?.score ?? 5;
  const trend    = match?.momentum?.trend || "stable";
  const rising   = match?.momentum?.rising || false;
  const deadGame = !!(match?.breakdown && (match.breakdown.dead_score || 0) >= 6);

  // ── TABS ───────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState(hasMatch ? 'verdict' : 'poisson');

  // ── POISSON INPUTS ─────────────────────────────────────────────────────────
  const [atkH, setAtkH] = useState(1.35);
  const [defH, setDefH] = useState(0.88);
  const [atkA, setAtkA] = useState(1.05);
  const [defA, setDefA] = useState(1.12);
  const [minEl, setMinEl] = useState(hasMatch ? minute : 67);
  const [gH, setGH]  = useState(hasMatch ? hg : 1);
  const [gA, setGA]  = useState(hasMatch ? ag : 1);
  const [bkOdds, setBkOdds] = useState(1.85);
  const [myProb, setMyProb] = useState(hasMatch ? (probPct || 62) : 62);
  const [edgeThresh, setEdgeThresh] = useState(1.05);

  // ── BACKTEST ───────────────────────────────────────────────────────────────
  const [alerts, setAlerts] = useState(() => { try { return JSON.parse(localStorage.getItem('mt_bt')||'[]'); } catch { return []; } });
  const [btMatch, setBtMatch] = useState(hasMatch ? `${homeName} vs ${awayName}` : '');
  const [btMin, setBtMin]   = useState(hasMatch ? minute : 78);
  const [btHeat, setBtHeat] = useState(hasMatch ? Math.round(heat) : 74);
  const [btProb, setBtProb] = useState(hasMatch ? (probPct || 68) : 68);
  const [btOdds, setBtOdds] = useState(1.88);
  const [btOut, setBtOut]   = useState('');

  function poi(k,L){let p=Math.exp(-L);for(let i=0;i<k;i++)p*=L/(i+1);return p;}
  function poiCum(max,L){let s=0;for(let i=0;i<=max;i++)s+=poi(i,L);return s;}

  const tl = Math.max(0,90-minEl);
  const motH = gH<gA?(tl<10?1.8:1.4):gH>gA?0.75:1.1;
  const motA = gA<gH?(tl<10?1.8:1.4):gA>gH?0.75:1.1;
  const xH = atkH*defA*1.36*(tl/90)*motH;
  const xA = atkA*defH*1.06*(tl/90)*motA;
  const xT2 = xH+xA;
  const pGoal = 1-Math.exp(-xT2);

  const evVal = (myProb/100)*bkOdds;
  const edge  = (evVal-1)*100;
  const mktP  = Math.round(100/bkOdds);
  const kelly = Math.max(0,(myProb/100-(1-myProb/100)/(bkOdds-1))*100);
  const isBet = evVal >= edgeThresh;

  function logAlert(){
    if(!btMatch.trim())return;
    const a={id:Date.now(),m:btMatch,min:btMin,heat:btHeat,prob:btProb,odds:btOdds,out:btOut,ts:new Date().toLocaleDateString()};
    const next=[...alerts,a];
    setAlerts(next);
    try{localStorage.setItem('mt_bt',JSON.stringify(next));}catch{}
    setBtMatch('');
  }

  const settled=alerts.filter(a=>a.out);
  const hits=settled.filter(a=>a.out==='yes');
  const hitRate=settled.length?Math.round(hits.length/settled.length*100):null;

  // ── SIMPLE VERDICT (3 indicators) ─────────────────────────────────────────
  // Indicator 1: Pressure (Heat Score)
  // Use myProb slider if no live data
  const effectiveProb = probPct > 0 ? probPct : myProb;
  const pressureOK = heat >= 55;
  const pressureScore = Math.min(10, Math.round(heat/10));

  // Indicator 2: Goal Probability
  const probOK = effectiveProb >= 55;
  const probScore = Math.min(10, Math.round(effectiveProb/10));

  // Indicator 3: Motivation match state
  const maxMot = Math.max(homeMot, awayMot);
  const motOK = maxMot >= 6.5;
  const motScore = Math.round(maxMot);

  // Dead game override
  const isDeadGame = deadGame || (heat < 15 && !probOK);

  // Trend bonus
  const trendBonus = rising ? 1 : trend === 'falling' ? -1 : 0;

  // Final verdict
  const goodCount = [pressureOK, probOK, motOK].filter(Boolean).length + trendBonus;
  let verdict, verdictColor, verdictBg, verdictEmoji;
  if (isDeadGame) {
    verdict='SKIP — Dead game'; verdictColor='#b71c1c'; verdictBg='#ffebee'; verdictEmoji='⛔';
  } else if (goodCount >= 3) {
    verdict='BET NOW'; verdictColor='#1b5e20'; verdictBg='#e8f5e9'; verdictEmoji='✅';
  } else if (goodCount === 2) {
    verdict='MODERATE — Check odds'; verdictColor='#e65100'; verdictBg='#fff3e0'; verdictEmoji='🟡';
  } else {
    verdict='SKIP — Not enough signals'; verdictColor='#555'; verdictBg='#f5f5f5'; verdictEmoji='⬜';
  }

  const tabStyle = k => ({
    padding:"7px 12px", border:`1.5px solid ${tab===k?"#1565c0":"#e0e0e0"}`,
    borderRadius:8, background:tab===k?"#e3f2fd":"#fafafa",
    cursor:"pointer", fontSize:13, fontWeight:tab===k?700:500,
    color:tab===k?"#1565c0":"#666", whiteSpace:"nowrap", flexShrink:0,
  });

  const ind = (ok, label, score, detail) => (
    <div style={{background:ok?"#e8f5e9":"#fff3e0", border:`1.5px solid ${ok?"#a5d6a7":"#ffcc80"}`, borderRadius:10, padding:"12px 14px", marginBottom:8}}>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4}}>
        <span style={{fontSize:15, fontWeight:800, color:ok?"#1b5e20":"#e65100"}}>{ok?"✅":"⚠️"} {label}</span>
        <span style={{fontSize:20, fontWeight:900, color:ok?"#1b5e20":"#e65100", fontFamily:"monospace"}}>{score}/10</span>
      </div>
      <div style={{height:8, background:"#e0e0e0", borderRadius:4, marginBottom:6}}>
        <div style={{width:`${score*10}%`, height:"100%", background:ok?"#43a047":"#ffa726", borderRadius:4}} />
      </div>
      <div style={{fontSize:12, color:"#666"}}>{detail}</div>
    </div>
  );

  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"#fff",zIndex:1000,overflowY:"auto",maxWidth:480,margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"2px solid #f0f0f0",position:"sticky",top:0,background:"#fff",zIndex:10}}>
        <div>
          <span style={{fontSize:17,fontWeight:800,color:"#111"}}>📊 EV Scanner</span>
          {hasMatch && <div style={{fontSize:12,color:"#888",marginTop:2}}>{homeName} {hg}–{ag} {awayName} · {minute}′</div>}
        </div>
        <button onClick={onClose} style={{background:"#f0f0f0",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:14,fontWeight:700,color:"#555"}}>✕</button>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:6,padding:"10px 14px",overflowX:"auto",borderBottom:"1px solid #f0f0f0"}}>
        {(hasMatch?[['verdict','🎯 Verdict'],['ev','💰 EV Calc'],['poisson','📐 Poisson'],['backtest','📋 Log']]:
                   [['poisson','📐 Poisson'],['ev','💰 EV Calc'],['strength','💪 Teams'],['backtest','📋 Log']])
          .map(([k,l])=><button key={k} onClick={()=>setTab(k)} style={tabStyle(k)}>{l}</button>)}
      </div>

      <div style={{padding:"14px 14px 80px"}}>

        {/* ── VERDICT TAB (live match only) ── */}
        {tab==='verdict' && hasMatch && (
          <div>
            {/* Main verdict */}
            <div style={{background:verdictBg,border:`2px solid ${verdictColor}`,borderRadius:12,padding:"16px",marginBottom:16,textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:8}}>{verdictEmoji}</div>
              <div style={{fontSize:22,fontWeight:900,color:verdictColor,marginBottom:4}}>{verdict}</div>
              <div style={{fontSize:13,color:verdictColor,opacity:0.8}}>
                {goodCount >= 3 ? "All 3 signals aligned — strong opportunity" :
                 goodCount === 2 ? "2 of 3 signals — verify odds before betting" :
                 isDeadGame ? "Game has no activity — skip this one" :
                 "Too few signals — wait for better setup"}
              </div>
            </div>

            {/* 3 indicators */}
            {ind(pressureOK, "Pressure", pressureScore,
              `Heat score: ${Math.round(heat)}/100${heat>=55?" — sustained attacking pressure":" — not enough pressure yet"}`)}
            {ind(probOK, "Goal Probability", probScore,
              `${probPct||myProb}% chance of next goal${(probPct||myProb)>=55?" — above threshold (55%)":" — below threshold (55%)"}`)}
            {ind(motOK, "Motivation", motScore,
              `${maxMot>=8?"High stakes — team MUST score":maxMot>=6.5?"Moderate motivation — pushing hard":"Low motivation — game feels settled"}`)}

            {/* Trend */}
            <div style={{background:rising?"#e8f5e9":trend==="falling"?"#ffebee":"#f5f5f5", borderRadius:10, padding:"10px 14px", marginBottom:12, display:"flex", alignItems:"center", gap:10}}>
              <span style={{fontSize:20}}>{rising?"📈":trend==="falling"?"📉":"➡️"}</span>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:rising?"#1b5e20":trend==="falling"?"#c62828":"#555"}}>
                  Momentum: {rising?"RISING ↑":trend==="falling"?"FALLING ↓":"STABLE →"}
                </div>
                <div style={{fontSize:12,color:"#888"}}>
                  {rising?"Rising momentum adds confidence to your bet":
                   trend==="falling"?"Falling momentum — wait before placing":
                   "Stable — use other signals to decide"}
                </div>
              </div>
            </div>

            {/* Quick EV check */}
            <div style={{background:"#f9f9f9",borderRadius:10,border:"1px solid #eee",padding:14}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Quick EV check</div>
              <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,color:"#888",marginBottom:4}}>Bookmaker odds</div>
                  <input type="number" min="1.01" max="20" step="0.01" value={bkOdds} onChange={e=>setBkOdds(+e.target.value)}
                    style={{width:"100%",padding:"8px 10px",border:"1px solid #e0e0e0",borderRadius:6,fontSize:15}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,color:"#888",marginBottom:4}}>Your prob %</div>
                  <input type="number" min="1" max="99" value={myProb} onChange={e=>setMyProb(+e.target.value)}
                    style={{width:"100%",padding:"8px 10px",border:"1px solid #e0e0e0",borderRadius:6,fontSize:15}}/>
                </div>
              </div>
              <div style={{background:isBet?"#e8f5e9":"#ffebee",borderRadius:8,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:14,fontWeight:800,color:isBet?"#1b5e20":"#b71c1c"}}>{isBet?"✅ BET":"❌ SKIP"}</span>
                <span style={{fontSize:13,color:isBet?"#2e7d32":"#c62828"}}>EV {evVal.toFixed(3)} · Edge {edge>=0?"+":""}{edge.toFixed(1)}% · Kelly {kelly.toFixed(1)}%</span>
              </div>
            </div>

            {/* Log button */}
            <button onClick={()=>setTab('backtest')} style={{width:"100%",marginTop:12,background:"#f5f5f5",border:"1px solid #e0e0e0",borderRadius:8,padding:10,cursor:"pointer",fontSize:13,fontWeight:600,color:"#555"}}>
              📋 Log this alert
            </button>
          </div>
        )}

        {/* ── POISSON TAB ── */}
        {tab==='poisson' && (
          <div>
            <div style={{display:"flex",gap:6,marginBottom:12}}>
              {[['Home xG',xH.toFixed(2)],['Away xG',xA.toFixed(2)],['Goal prob',Math.round(pGoal*100)+'%'],['Market','54%']].map(([l,v])=>(
                <div key={l} style={{flex:1,background:"#f5f5f5",borderRadius:8,padding:"10px 6px",textAlign:"center"}}>
                  <div style={{fontSize:11,color:"#888",marginBottom:3}}>{l}</div>
                  <div style={{fontSize:18,fontWeight:700}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{background:"#f9f9f9",borderRadius:10,border:"1px solid #eee",padding:14,marginBottom:12}}>
              {[['Home attack',atkH,setAtkH,0.5,2.5,0.01],['Home defence',defH,setDefH,0.5,2.5,0.01],
                ['Away attack',atkA,setAtkA,0.5,2.5,0.01],['Away defence',defA,setDefA,0.5,2.5,0.01],
                ['Minutes',minEl,setMinEl,1,90,1]].map(([l,v,fn,mn,mx,st])=>(
                <div key={l} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#777",marginBottom:3}}>
                    <span>{l}</span><span style={{fontWeight:700,color:"#333"}}>{typeof v==='number'&&v%1!==0?v.toFixed(2):v}</span>
                  </div>
                  <input type="range" min={mn} max={mx} step={st} value={v} onChange={e=>fn(+e.target.value)} style={{width:"100%"}}/>
                </div>
              ))}
              <div style={{display:"flex",gap:12}}>
                <div style={{flex:1}}><div style={{fontSize:12,color:"#777",marginBottom:3}}>Home goals</div><input type="number" min="0" max="9" value={gH} onChange={e=>setGH(+e.target.value)} style={{width:"100%",padding:"6px 10px",border:"1px solid #e0e0e0",borderRadius:6,fontSize:14}}/></div>
                <div style={{flex:1}}><div style={{fontSize:12,color:"#777",marginBottom:3}}>Away goals</div><input type="number" min="0" max="9" value={gA} onChange={e=>setGA(+e.target.value)} style={{width:"100%",padding:"6px 10px",border:"1px solid #e0e0e0",borderRadius:6,fontSize:14}}/></div>
              </div>
            </div>
            <div style={{background:"#f9f9f9",borderRadius:10,border:"1px solid #eee",padding:14}}>
              {[['P(0 more goals)',poi(0,xT2)],['P(exactly 1)',poi(1,xT2)],['P(exactly 2)',poi(2,xT2)],
                ['P(3+ goals)',1-poiCum(2,xT2)],['P(over 0.5)',pGoal],['P(over 1.5)',1-poiCum(1,xT2)]].map(([l,p])=>{
                const pct=Math.round(p*100),c=pct>=60?"#2e7d32":pct>=40?"#e65100":"#888";
                return <div key={l} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}><span style={{color:"#666"}}>{l}</span><span style={{fontWeight:700,color:c}}>{pct}%</span></div>
                  <div style={{height:7,background:"#e0e0e0",borderRadius:4}}><div style={{width:`${pct}%`,height:"100%",background:c,borderRadius:4}}/></div>
                </div>;
              })}
            </div>
          </div>
        )}

        {/* ── EV CALC TAB ── */}
        {tab==='ev' && (
          <div>
            <div style={{background:"#f9f9f9",borderRadius:10,border:"1px solid #eee",padding:14,marginBottom:12}}>
              <div style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#777",marginBottom:4}}><span>Your model probability</span><span style={{fontWeight:700,color:"#333"}}>{myProb}%</span></div>
                <input type="range" min="1" max="99" step="1" value={myProb} onChange={e=>setMyProb(+e.target.value)} style={{width:"100%"}}/>
              </div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:12,color:"#777",marginBottom:4}}>Bookmaker decimal odds</div>
                <input type="number" min="1.01" max="20" step="0.01" value={bkOdds} onChange={e=>setBkOdds(+e.target.value)} style={{width:"100%",padding:"8px 10px",border:"1px solid #e0e0e0",borderRadius:6,fontSize:15}}/>
              </div>
              <div>
                <div style={{fontSize:12,color:"#777",marginBottom:4}}>Minimum edge</div>
                <select value={edgeThresh} onChange={e=>setEdgeThresh(+e.target.value)} style={{width:"100%",padding:"8px",border:"1px solid #e0e0e0",borderRadius:6,fontSize:13}}>
                  <option value={1.02}>2% — conservative</option>
                  <option value={1.05}>5% — standard</option>
                  <option value={1.08}>8% — aggressive</option>
                  <option value={1.10}>10% — value only</option>
                </select>
              </div>
            </div>
            <div style={{background:isBet?"#e8f5e9":"#ffebee",borderRadius:10,border:`2px solid ${isBet?"#43a047":"#e53935"}`,padding:14}}>
              <div style={{fontSize:18,fontWeight:800,color:isBet?"#1b5e20":"#b71c1c",marginBottom:10}}>{isBet?"✅ BET — Positive EV":"❌ SKIP — No edge"}</div>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                {[['EV',evVal.toFixed(3)],['Edge',(edge>=0?'+':'')+edge.toFixed(1)+'%'],['Model',myProb+'%'],['Market',mktP+'%'],['Kelly',kelly.toFixed(1)+'%']].map(([l,v])=>(
                  <div key={l} style={{flex:1,background:"#fff8",borderRadius:6,padding:"6px 4px",textAlign:"center"}}>
                    <div style={{fontSize:10,color:isBet?"#2e7d32":"#c62828"}}>{l}</div>
                    <div style={{fontSize:13,fontWeight:700,color:isBet?"#1b5e20":"#b71c1c"}}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{fontSize:12,color:isBet?"#2e7d32":"#c62828"}}>{edge>=0?`Your model is ${Math.round(myProb-mktP)}pp above market — edge exists.`:"Market implies higher prob. No value."}</div>
            </div>
          </div>
        )}

        {/* ── TEAM STRENGTH TAB ── */}
        {tab==='strength' && (
          <div>
            <div style={{background:"#e3f2fd",borderRadius:8,padding:12,marginBottom:12,fontSize:13,color:"#1565c0"}}>
              <strong>Attack</strong> = team avg goals ÷ league avg (1.36 home / 1.06 away). <strong>Defence</strong> = avg conceded ÷ league avg. Lower defence = better.
            </div>
            {[{n:'Man City',ah:1.85,dh:0.62,aa:1.52,da:0.74,t:'Elite'},
              {n:'Arsenal',ah:1.65,dh:0.70,aa:1.38,da:0.82,t:'Top'},
              {n:'Liverpool',ah:1.72,dh:0.68,aa:1.44,da:0.79,t:'Elite'},
              {n:'Chelsea',ah:1.30,dh:0.91,aa:1.12,da:1.05,t:'Mid-top'},
              {n:'Man Utd',ah:1.05,dh:1.18,aa:0.88,da:1.28,t:'Mid'},
              {n:'Nottm Forest',ah:0.82,dh:0.88,aa:0.72,da:0.96,t:'Low-mid'}].map((t,i)=>{
              const tc={Elite:"#2e7d32",Top:"#1565c0","Mid-top":"#e65100",Mid:"#888","Low-mid":"#c62828"}[t.t]||"#888";
              return <div key={i} style={{background:"#f9f9f9",borderRadius:10,border:"1px solid #eee",padding:12,marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:15,fontWeight:700}}>{t.n}</span>
                  <span style={{fontSize:11,background:tc+"22",color:tc,border:`1px solid ${tc}44`,borderRadius:10,padding:"2px 8px",fontWeight:700}}>{t.t}</span>
                </div>
                <div style={{display:"flex",gap:6}}>
                  {[['Atk H',t.ah],['Def H',t.dh],['Atk A',t.aa],['Def A',t.da]].map(([l,v])=>(
                    <div key={l} style={{flex:1,background:"#fff",borderRadius:6,padding:"6px 4px",textAlign:"center",border:"1px solid #eee"}}>
                      <div style={{fontSize:10,color:"#888"}}>{l}</div>
                      <div style={{fontSize:14,fontWeight:700}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>;
            })}
          </div>
        )}

        {/* ── BACKTEST TAB ── */}
        {tab==='backtest' && (
          <div>
            <div style={{display:"flex",gap:6,marginBottom:12}}>
              {[['Alerts',alerts.length],['Hit rate',hitRate!==null?hitRate+'%':'—'],['Avg heat',alerts.length?Math.round(alerts.reduce((s,a)=>s+a.heat,0)/alerts.length):'—']].map(([l,v])=>(
                <div key={l} style={{flex:1,background:"#f5f5f5",borderRadius:8,padding:"10px 8px",textAlign:"center"}}>
                  <div style={{fontSize:11,color:"#888",marginBottom:3}}>{l}</div>
                  <div style={{fontSize:18,fontWeight:700}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{background:"#f9f9f9",borderRadius:10,border:"1px solid #eee",padding:14,marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Log alert</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <input type="text" value={btMatch} onChange={e=>setBtMatch(e.target.value)} placeholder="e.g. Arsenal vs Chelsea" style={{padding:"8px 10px",border:"1px solid #e0e0e0",borderRadius:6,fontSize:13}}/>
                <div style={{display:"flex",gap:8}}>
                  {[['Min',btMin,setBtMin,1,93],['Heat',btHeat,setBtHeat,0,100],['Prob%',btProb,setBtProb,1,99]].map(([l,v,fn,mn,mx])=>(
                    <div key={l} style={{flex:1}}><div style={{fontSize:11,color:"#888",marginBottom:3}}>{l}</div><input type="number" min={mn} max={mx} value={v} onChange={e=>fn(+e.target.value)} style={{width:"100%",padding:"7px 8px",border:"1px solid #e0e0e0",borderRadius:6,fontSize:13}}/></div>
                  ))}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <div style={{flex:1}}><div style={{fontSize:11,color:"#888",marginBottom:3}}>Odds</div><input type="number" min="1.01" max="10" step="0.01" value={btOdds} onChange={e=>setBtOdds(+e.target.value)} style={{width:"100%",padding:"7px 8px",border:"1px solid #e0e0e0",borderRadius:6,fontSize:13}}/></div>
                  <div style={{flex:2}}><div style={{fontSize:11,color:"#888",marginBottom:3}}>Outcome</div>
                    <select value={btOut} onChange={e=>setBtOut(e.target.value)} style={{width:"100%",padding:"7px 8px",border:"1px solid #e0e0e0",borderRadius:6,fontSize:13}}>
                      <option value="">Pending</option><option value="yes">Goal ✅</option><option value="no">No goal ❌</option>
                    </select>
                  </div>
                </div>
                <button onClick={logAlert} style={{background:"#1565c0",color:"#fff",border:"none",borderRadius:8,padding:10,cursor:"pointer",fontSize:14,fontWeight:700}}>Log alert</button>
              </div>
            </div>
            {alerts.length===0
              ? <div style={{textAlign:"center",color:"#bbb",padding:"2rem",fontSize:13}}>No alerts yet.</div>
              : <div style={{background:"#f9f9f9",borderRadius:10,border:"1px solid #eee",padding:14}}>
                  {[...alerts].reverse().slice(0,15).map(a=>{
                    const ev2=((a.prob/100)*a.odds-1)*100;
                    return <div key={a.id} style={{padding:"8px 0",borderBottom:"1px solid #eee"}}>
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <span style={{fontSize:13,fontWeight:600}}>{a.m}</span>
                        <span style={{fontSize:11,fontWeight:700,color:a.out==='yes'?"#2e7d32":a.out==='no'?"#c62828":"#888"}}>{a.out==='yes'?'✅':a.out==='no'?'❌':'⏳'}</span>
                      </div>
                      <div style={{fontSize:12,color:"#888"}}>{a.min}′ · Heat {a.heat} · {a.prob}% · {a.odds} · EV {ev2>=0?'+':''}{ev2.toFixed(1)}%</div>
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
