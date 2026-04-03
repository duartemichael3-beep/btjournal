import React from 'react'
import ReactDOM from 'react-dom/client'
import{useState,useMemo,useEffect,useRef}from"react"
const SETUPS=["M1","M2","M3","J1","J2"],CTXS=["APERTURA","ROMPIMIENTO","GIRO"],DIRS=["RANGO","ALCISTA","BAJISTA"],RESS=["SL","BE","WIN"]
const NHS=["","08:30","09:45","10:00","10:30"],NIS=["","ALTO","MEDIO","BAJO"],NTS=["","NFP","CPI","PPI","FOMC","JOBLESS CLAIMS","GDP","RETAIL SALES","ISM","PCE","OTRA"]
const RV=300,SK="bt_journal_v7"
const DT={fecha:"",horaInicio:"09:30",horaFinal:"10:00",atr:"",setup:"M1",contexto:"APERTURA",buySell:"BUY",puntosSlStr:"",rResultado:"",rMaximo:"",resultado:"SL",breakRangoM30:"NO",direccionDia:"RANGO",m5:"",m15:"",m30:"",ddPuntos:"",hayNoticia:"NO",noticiaHora:"",noticiaImpacto:"",noticiaTipo:"",screenshot:null,screenshotPreview:null,notas:""}
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7)
const pn=v=>{const n=parseFloat(v);return isNaN(n)?0:n}
const fmt$=v=>(v<0?"-":"")+"$"+Math.abs(v).toLocaleString()
const fmtR=v=>(v>0?"+":"")+v+"R"
const fmtPF=v=>v===Infinity?"∞":v.toFixed(2)
const wom=ds=>ds?Math.ceil(new Date(ds).getDate()/7):""
const fmtD=ds=>{if(!ds)return"";const d=new Date(ds);return`${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getFullYear()).slice(-2)}`}
const getMo=ds=>ds?new Date(ds).toLocaleString("es",{month:"short"})+" "+String(new Date(ds).getFullYear()).slice(-2):""
const getYr=ds=>ds?String(new Date(ds).getFullYear()).slice(-2):""
const cDur=(s,e)=>{if(!s||!e)return"";const[sh,sm]=s.split(":").map(Number),[eh,em]=e.split(":").map(Number);let d=(eh*60+em)-(sh*60+sm);return d<0?d+1440:d}
const getDN=ds=>ds?new Date(ds).toLocaleString("es",{weekday:"short"}):""
const gR=t=>t.resultado==="SL"?-1:t.resultado==="BE"?0:pn(t.rResultado)>0?pn(t.rResultado):0
const gDD=t=>{const s=pn(t.puntosSlStr),d=pn(t.ddPuntos);return s&&d?Math.round(d/s*10000)/100:null}
const hBucket=h=>{if(!h||!h.includes(":"))return"";const[hh,mm]=h.split(":").map(Number);return`${String(hh).padStart(2,"0")}:${String(Math.floor(mm/5)*5).padStart(2,"0")}`}

function cS(trades){
  const z={total:0,wins:0,losses:0,bes:0,winRate:0,totalR:0,totalDollar:0,bestR:0,worstR:-1,profitFactor:0,expectancy:0,expectDollar:0,avgDDpct:0,avgDurWin:0,avgDurSL:0,avgDurBE:0,maxWinStreak:0,maxLossStreak:0,curWinStreak:0,curLossStreak:0,recoveryFactor:0,sharpeRatio:0,payoffRatio:0,sampleValid:false,consecWins:[],consecLosses:[]}
  if(!trades.length)return z
  const rs=trades.map(gR),w=rs.filter(r=>r>0),l=rs.filter(r=>r<0),b=rs.filter(r=>r===0)
  const tR=Math.round(rs.reduce((a,c)=>a+c,0)*100)/100,gw=w.reduce((a,r)=>a+r,0),gl=Math.abs(l.reduce((a,r)=>a+r,0))
  const dd=trades.map(gDD).filter(v=>v!==null),aDD=dd.length?Math.round(dd.reduce((a,c)=>a+c,0)/dd.length*100)/100:0
  const exp=Math.round((tR/trades.length)*100)/100
  const durW=trades.filter(t=>t.resultado==="WIN").map(t=>pn(t.duracionTrade)).filter(v=>v>0)
  const durS=trades.filter(t=>t.resultado==="SL").map(t=>pn(t.duracionTrade)).filter(v=>v>0)
  const durB=trades.filter(t=>t.resultado==="BE").map(t=>pn(t.duracionTrade)).filter(v=>v>0)
  // Streaks
  let mxW=0,mxL=0,cW=0,cL=0;const cWs=[],cLs=[]
  const sorted=[...trades].sort((a,b2)=>new Date(a.fecha)-new Date(b2.fecha))
  sorted.forEach(t=>{const r=gR(t);if(r>0){cW++;if(cL>0){cLs.push(cL);cL=0}}else if(r<0){cL++;if(cW>0){cWs.push(cW);cW=0}}else{if(cW>0)cWs.push(cW);if(cL>0)cLs.push(cL);cW=0;cL=0}; mxW=Math.max(mxW,cW);mxL=Math.max(mxL,cL)})
  if(cW>0)cWs.push(cW);if(cL>0)cLs.push(cL)
  // Max drawdown in R (equity curve)
  let peak=0,maxDD2=0,cum=0
  sorted.forEach(t=>{cum+=gR(t);if(cum>peak)peak=cum;const dd2=peak-cum;if(dd2>maxDD2)maxDD2=dd2})
  const recovF=maxDD2>0?Math.round(tR/maxDD2*100)/100:tR>0?Infinity:0
  // Sharpe ratio (mean R / stddev R)
  const mean=tR/trades.length
  const variance=rs.reduce((a,r)=>a+Math.pow(r-mean,2),0)/rs.length
  const stddev=Math.sqrt(variance)
  const sharpe=stddev>0?Math.round(mean/stddev*100)/100:0
  // Payoff ratio (avg win R / avg loss R)
  const avgWinR=w.length?Math.round(gw/w.length*100)/100:0
  const avgLossR=l.length?Math.round(gl/l.length*100)/100:1
  const payoff=avgLossR>0?Math.round(avgWinR/avgLossR*100)/100:avgWinR>0?Infinity:0
  // Sample size: need min 30 trades for statistical relevance
  const sampleOk=trades.length>=30
  return{total:trades.length,wins:w.length,losses:l.length,bes:b.length,winRate:Math.round(w.length/trades.length*10000)/100,totalR:tR,totalDollar:Math.round(tR*RV),bestR:rs.length?Math.max(...rs):0,worstR:rs.length?Math.min(...rs):0,profitFactor:gl?Math.round(gw/gl*10000)/10000:gw>0?Infinity:0,expectancy:exp,expectDollar:Math.round(exp*RV),avgDDpct:aDD,avgDurWin:durW.length?Math.round(durW.reduce((a,c)=>a+c,0)/durW.length):0,avgDurSL:durS.length?Math.round(durS.reduce((a,c)=>a+c,0)/durS.length):0,avgDurBE:durB.length?Math.round(durB.reduce((a,c)=>a+c,0)/durB.length):0,maxWinStreak:mxW,maxLossStreak:mxL,curWinStreak:cW,curLossStreak:cL,recoveryFactor:recovF,sharpeRatio:sharpe,payoffRatio:payoff,sampleValid:sampleOk,maxEquityDD:Math.round(maxDD2*100)/100,consecWins:cWs,consecLosses:cLs}
}
const grpBy=(trades,fn)=>{const m={};trades.forEach(t=>{const k=fn(t);if(k)(m[k]??=[]).push(t)});return Object.entries(m).sort((a,b)=>b[0].localeCompare(a[0])).map(([k,ts])=>({key:k,...cS(ts)}))}

function extraS(trades){
  if(!trades.length)return{bestDay:"-",worstDay:"-",avgOps:0,bestWd:"-",worstWd:"-"}
  const bd={};trades.forEach(t=>{if(t.fecha)(bd[t.fecha]??=[]).push(t)})
  const dt=Object.entries(bd).map(([d,ts])=>({d,r:ts.reduce((a,t)=>a+gR(t),0)}))
  const b=dt.reduce((a,x)=>x.r>a.r?x:a,dt[0]),w=dt.reduce((a,x)=>x.r<a.r?x:a,dt[0])
  const bw2={};trades.forEach(t=>{if(!t.fecha)return;(bw2[getDN(t.fecha)]??=[]).push(t)})
  const wt=Object.entries(bw2).map(([wd,ts])=>({wd,r:ts.reduce((a,t)=>a+gR(t),0)}))
  const bw=wt.reduce((a,x)=>x.r>a.r?x:a,wt[0]),ww=wt.reduce((a,x)=>x.r<a.r?x:a,wt[0])
  return{bestDay:`${fmtD(b.d)} (${b.r>0?"+":""}${Math.round(b.r*100)/100}R)`,worstDay:`${fmtD(w.d)} (${w.r>0?"+":""}${Math.round(w.r*100)/100}R)`,avgOps:Math.round(trades.length/Object.keys(bd).length*100)/100,bestWd:`${bw.wd} (${bw.r>0?"+":""}${Math.round(bw.r*100)/100}R)`,worstWd:`${ww.wd} (${ww.r>0?"+":""}${Math.round(ww.r*100)/100}R)`}
}
function rDist(trades,field){
  const vs=trades.filter(t=>t.resultado==="WIN").map(t=>Math.round(pn(t[field]))).filter(v=>v>0)
  if(!vs.length)return{lvl:[],cnt:[],pct:[]}
  const mx=Math.max(...vs),lvl=[],cnt=[],pct=[]
  for(let r=1;r<=Math.min(mx,15);r++){const c=vs.filter(v=>v===r).length;lvl.push(r+"R");cnt.push(c);pct.push(Math.round(c/vs.length*10000)/100)}
  if(vs.some(v=>v>15)){const c=vs.filter(v=>v>15).length;lvl.push("16R+");cnt.push(c);pct.push(Math.round(c/vs.length*10000)/100)}
  return{lvl,cnt,pct}
}
function hourAnalysis(trades){
  const bh={};trades.forEach(t=>{const b=hBucket(t.horaInicio);if(b)(bh[b]??=[]).push(t)})
  return Object.entries(bh).sort((a,b)=>a[0].localeCompare(b[0])).map(([h,ts])=>{
    const s=cS(ts),rm=ts.filter(t=>t.resultado==="WIN").map(t=>pn(t.rMaximo)).filter(v=>v>0)
    return{hour:h,...s,avgRmax:rm.length?Math.round(rm.reduce((a,c)=>a+c,0)/rm.length*100)/100:0}
  })
}
function atrAnalysis(trades){
  const ranges=[[0,10,"0-10"],[10,15,"10-15"],[15,20,"15-20"],[20,25,"20-25"],[25,30,"25-30"],[30,40,"30-40"],[40,999,"40+"]]
  return ranges.map(([lo,hi,label])=>{const ts=trades.filter(t=>{const a=pn(t.atr);return a>lo&&a<=hi});return{range:label,...cS(ts)}}).filter(x=>x.total>0)
}
function slAnalysis(trades){
  const ranges=[[0,15,"1-15"],[15,20,"15-20"],[20,25,"20-25"],[25,30,"25-30"],[30,40,"30-40"],[40,999,"40+"]]
  return ranges.map(([lo,hi,label])=>{const ts=trades.filter(t=>{const p=pn(t.puntosSlStr);return p>lo&&p<=hi});return{range:label,...cS(ts)}}).filter(x=>x.total>0)
}
function suggestions(trades){
  if(trades.length<5)return[]
  const tips=[]
  const s=cS(trades),ha=hourAnalysis(trades),aa=atrAnalysis(trades),sa=slAnalysis(trades)
  // Best hour
  if(ha.length){const best=ha.reduce((a,x)=>x.totalR>a.totalR?x:a,ha[0]);if(best.total>=3)tips.push({type:"green",text:`Tu mejor hora de entrada es ${best.hour} con ${best.winRate.toFixed(2)}% win rate y ${best.totalR>0?"+":""}${best.totalR}R en ${best.total} trades`})}
  if(ha.length){const worst=ha.reduce((a,x)=>x.totalR<a.totalR?x:a,ha[0]);if(worst.total>=3&&worst.totalR<0)tips.push({type:"red",text:`Evita las ${worst.hour}: ${worst.winRate.toFixed(2)}% win rate y ${worst.totalR}R en ${worst.total} trades`})}
  // Best ATR
  if(aa.length>1){const best=aa.reduce((a,x)=>x.winRate>a.winRate&&x.total>=3?x:a,aa[0]);tips.push({type:"green",text:`ATR ${best.range} tiene el mejor win rate: ${best.winRate.toFixed(2)}% en ${best.total} trades`})}
  // Best SL
  if(sa.length>1){const best=sa.reduce((a,x)=>x.winRate>a.winRate&&x.total>=3?x:a,sa[0]);tips.push({type:"green",text:`SL de ${best.range} pts tiene mejor rendimiento: ${best.winRate.toFixed(2)}% win rate, PF ${fmtPF(best.profitFactor)}`})}
  // R taken vs max
  const wt=trades.filter(t=>t.resultado==="WIN"&&pn(t.rMaximo)>0&&pn(t.rResultado)>0)
  if(wt.length>=3){const avgTaken=Math.round(wt.reduce((a,t)=>a+pn(t.rResultado),0)/wt.length*100)/100;const avgMax=Math.round(wt.reduce((a,t)=>a+pn(t.rMaximo),0)/wt.length*100)/100;const pct=Math.round(avgTaken/avgMax*100);tips.push({type:pct<50?"yellow":"green",text:`Tomas promedio ${avgTaken}R de ${avgMax}R disponibles (${pct}% del movimiento)`})}
  // Duration
  if(s.avgDurWin&&s.avgDurSL)tips.push({type:"blue",text:`Duracion promedio: WIN=${s.avgDurWin}min, SL=${s.avgDurSL}min${s.avgDurBE?", BE="+s.avgDurBE+"min":""}`})
  // Best setup
  const su={};SETUPS.forEach(s2=>{const ts2=trades.filter(t=>t.setup===s2);if(ts2.length>=3)su[s2]=cS(ts2)})
  const suE=Object.entries(su);if(suE.length>1){const best=suE.reduce((a,[k,v])=>v.totalR>a[1].totalR?[k,v]:a,suE[0]);tips.push({type:"green",text:`Setup ${best[0]} es tu mas rentable: ${best[1].winRate.toFixed(2)}% win rate, ${fmtPF(best[1].profitFactor)} PF`})}
  // Streaks
  if(s.maxLossStreak>=3)tips.push({type:"red",text:`Tu racha negativa maxima es ${s.maxLossStreak} trades consecutivos. ${s.curLossStreak>=2?`ALERTA: llevas ${s.curLossStreak} losses seguidos ahora.`:""}`})
  if(s.maxWinStreak>=3)tips.push({type:"green",text:`Tu mejor racha positiva: ${s.maxWinStreak} wins consecutivos${s.curWinStreak>=2?` (actual: ${s.curWinStreak})`:""}`})
  // Recovery factor
  if(s.recoveryFactor!==Infinity&&s.recoveryFactor>0)tips.push({type:s.recoveryFactor>=2?"green":s.recoveryFactor>=1?"yellow":"red",text:`Recovery Factor: ${s.recoveryFactor.toFixed(2)} (ganancia total / max drawdown). ${s.recoveryFactor>=2?"Excelente recuperacion":s.recoveryFactor>=1?"Recuperacion aceptable":"Necesitas mejorar la recuperacion"}`})
  // Sharpe
  if(s.sharpeRatio!==0)tips.push({type:s.sharpeRatio>=1?"green":s.sharpeRatio>=0.5?"yellow":"red",text:`Sharpe Ratio: ${s.sharpeRatio.toFixed(2)}. ${s.sharpeRatio>=1?"Excelente consistencia":s.sharpeRatio>=0.5?"Consistencia aceptable":"Retornos muy volatiles, busca mas consistencia"}`})
  // Payoff
  if(s.payoffRatio!==Infinity&&s.payoffRatio>0)tips.push({type:s.payoffRatio>=2?"green":"yellow",text:`Payoff Ratio: ${s.payoffRatio.toFixed(2)} (promedio R ganado / promedio R perdido). ${s.payoffRatio>=2?"Tus wins compensan bien los losses":"Intenta dejar correr mas los winners"}`})
  // Sample size
  if(!s.sampleValid)tips.push({type:"yellow",text:`Tienes ${s.total} trades. Necesitas minimo 30 para que las estadisticas sean confiables.`})
  return tips
}

const HOURS=[];for(let h=0;h<24;h++)for(let m=0;m<60;m++)HOURS.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`)
const TP=({value,onChange,label})=>(<div className="field"><label>{label}</label><select className="inp" value={value} onChange={e=>onChange(e.target.value)}>{HOURS.map(h=><option key={h} value={h}>{h}</option>)}</select></div>)
const M=({label,value,sub,color,big})=>(<div className="mc"><div className="ml">{label}</div><div className={`mv${big?" big":""}`} style={{color}}>{value}</div>{sub&&<div className="ms">{sub}</div>}</div>)
const RT=({res})=><span className={`tag ${res==="SL"?"tr":res==="BE"?"ty":"tg"}`}>{res}</span>
const DT2=({dir})=><span className={`tag ${dir==="ALCISTA"?"tg":dir==="BAJISTA"?"tr":"ty"}`}>{dir}</span>
const ST=({s})=><span className="tag ta">{s}</span>
const BT=({bs})=><span className={`tag ${bs==="BUY"?"tg":"tr"}`}>{bs}</span>

const EC=({trades})=>{
  if(trades.length<2)return<div className="em">Min 2 trades</div>
  const sorted=[...trades].sort((a,b)=>new Date(a.fecha)-new Date(b.fecha));let cum=0
  const pts=[0,...sorted.map(t=>(cum+=gR(t),Math.round(cum*100)/100))]
  const mn=Math.min(...pts),mx=Math.max(...pts),rng=mx-mn||1,w=600,h=180,p=40
  const tx=i=>p+(i/(pts.length-1))*(w-p*2),ty=v=>h-p-((v-mn)/rng)*(h-p*2)
  const line=pts.map((v,i)=>`${i===0?"M":"L"} ${tx(i).toFixed(1)} ${ty(v).toFixed(1)}`).join(" ")
  const area=line+` L ${tx(pts.length-1).toFixed(1)} ${ty(mn).toFixed(1)} L ${tx(0).toFixed(1)} ${ty(mn).toFixed(1)} Z`
  const col=cum>=0?"var(--green)":"var(--red)"
  return<svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%",display:"block"}}><defs><linearGradient id="eF" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity={.25}/><stop offset="100%" stopColor={col} stopOpacity={0}/></linearGradient></defs>{[0,.25,.5,.75,1].map((pc,i)=>{const y=ty(mn+pc*rng);return<g key={i}><line x1={p} y1={y} x2={w-p} y2={y} stroke="var(--border)" strokeWidth={.5} strokeDasharray="4 4"/><text x={p-6} y={y+4} textAnchor="end" fill="var(--text3)" fontSize={10} fontFamily="var(--mono)">{Math.round((mn+pc*rng)*10)/10}R</text></g>})}<path d={area} fill="url(#eF)"/><path d={line} fill="none" stroke={col} strokeWidth={2.5} strokeLinejoin="round"/><circle cx={tx(pts.length-1)} cy={ty(pts[pts.length-1])} r={4} fill={col}/></svg>
}
const BC=({data,labels,height=130,unit="",colors})=>{
  if(!data.length||data.every(v=>v===0))return<div className="em">Sin datos</div>
  const max=Math.max(...data.map(Math.abs),.1),bw=Math.min(44,Math.max(18,300/data.length)),tw=data.length*(bw+6)+16,bl=height-12
  return<div style={{overflowX:"auto"}}><svg width={Math.max(tw,200)} height={height+28}><line x1={8} y1={bl} x2={tw} y2={bl} stroke="var(--border)" strokeWidth={1}/>{data.map((v,i)=>{const bh=Math.abs(v)/max*(height-30),x=i*(bw+6)+12,pos=v>=0,y=pos?bl-bh:bl,fill=colors?colors[i]:pos?"var(--green)":"var(--red)";return<g key={i}><rect x={x} y={y} width={bw} height={Math.max(bh,2)} rx={3} fill={fill} opacity={.85}/><text x={x+bw/2} y={pos?y-4:y+bh+12} textAnchor="middle" fill="var(--text2)" fontSize={9} fontFamily="var(--mono)">{Math.round(v*10)/10}{unit}</text><text x={x+bw/2} y={height+22} textAnchor="middle" fill="var(--text3)" fontSize={8} fontFamily="var(--mono)">{labels?.[i]}</text></g>})}</svg></div>
}

// Calendar component
const Calendar=({trades,month,year,onPrev,onNext})=>{
  const daysInMonth=new Date(year,month+1,0).getDate()
  const firstDay=new Date(year,month,1).getDay()
  const moName=new Date(year,month).toLocaleString("es",{month:"long",year:"numeric"})
  const byDate={};trades.forEach(t=>{if(!t.fecha)return;const d=new Date(t.fecha);if(d.getMonth()===month&&d.getFullYear()===year){const key=d.getDate();(byDate[key]??=[]).push(t)}})
  const cells=[];for(let i=0;i<firstDay;i++)cells.push(null)
  for(let d=1;d<=daysInMonth;d++)cells.push(d)
  const weeks=[];for(let i=0;i<cells.length;i+=7)weeks.push(cells.slice(i,i+7))
  // Week summaries
  const weekSums=weeks.map(wk=>{let tR=0,cnt=0;wk.forEach(d=>{if(d&&byDate[d]){byDate[d].forEach(t=>{tR+=gR(t);cnt++})}});return{tR:Math.round(tR*100)/100,cnt}})
  // Month total
  const moTrades=trades.filter(t=>{if(!t.fecha)return false;const d=new Date(t.fecha);return d.getMonth()===month&&d.getFullYear()===year})
  const moR=Math.round(moTrades.reduce((a,t)=>a+gR(t),0)*100)/100
  return<div className="card" style={{padding:0,overflow:"hidden"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:"1px solid var(--border)"}}>
      <span style={{fontFamily:"var(--mono)",fontWeight:700,fontSize:16,textTransform:"capitalize"}}>{moName}</span>
      <div style={{display:"flex",gap:8}}><button className="btn bo bx" onClick={onPrev}>&lt;</button><button className="btn bo bx" onClick={onNext}>&gt;</button></div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",fontSize:11,fontFamily:"var(--mono)"}}>
      {["Dom","Lun","Mar","Mie","Jue","Vie","Sab","Semana"].map(d=><div key={d} style={{padding:"10px 4px",textAlign:"center",color:"var(--text3)",borderBottom:"1px solid var(--border)",fontWeight:600}}>{d}</div>)}
      {weeks.map((wk,wi)=><React.Fragment key={wi}>
        {wk.map((d,di)=>{
          if(!d)return<div key={di} style={{padding:12,borderBottom:"1px solid var(--border)",background:"var(--bg)"}}/>
          const dayTrades=byDate[d]||[]
          const dayR=Math.round(dayTrades.reduce((a,t)=>a+gR(t),0)*100)/100
          const bg=dayTrades.length?dayR>0?"rgba(0,214,143,.08)":dayR<0?"rgba(255,71,87,.08)":"var(--surface)":"var(--surface)"
          return<div key={di} style={{padding:"8px 6px",borderBottom:"1px solid var(--border)",borderRight:"1px solid var(--border)",background:bg,minHeight:60}}>
            <div style={{fontSize:10,color:"var(--text3)",marginBottom:4}}>{d}</div>
            {dayTrades.length?<>
              <div style={{fontSize:14,fontWeight:700,color:dayR>0?"var(--green)":dayR<0?"var(--red)":"var(--yellow)",fontFamily:"var(--mono)"}}>{fmt$(dayR*RV)}</div>
              <div style={{fontSize:9,color:"var(--text3)",marginTop:2}}>{dayTrades.length} trade{dayTrades.length>1?"s":""}</div>
            </>:<div style={{fontSize:9,color:"var(--text3)"}}>-</div>}
          </div>
        })}
        {/* pad to 7 */}
        {Array(7-wk.length).fill(null).map((_,i)=><div key={`p${i}`} style={{padding:12,borderBottom:"1px solid var(--border)",background:"var(--bg)"}}/>)}
        {/* Week summary */}
        <div style={{padding:"8px 6px",borderBottom:"1px solid var(--border)",background:"var(--surface2)",display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center"}}>
          <div style={{fontSize:9,color:"var(--text3)"}}>S{wi+1}</div>
          <div style={{fontSize:13,fontWeight:700,color:weekSums[wi].tR>0?"var(--green)":weekSums[wi].tR<0?"var(--red)":"var(--text3)",fontFamily:"var(--mono)"}}>{weekSums[wi].cnt?fmt$(weekSums[wi].tR*RV):"-"}</div>
        </div>
      </React.Fragment>)}
    </div>
    <div style={{display:"flex",justifyContent:"flex-end",gap:20,padding:"12px 20px",borderTop:"1px solid var(--border)",background:"var(--surface2)"}}>
      <span style={{fontSize:12,color:"var(--text3)",fontFamily:"var(--mono)"}}>TOTAL TRADES: <b style={{color:"var(--text)"}}>{moTrades.length}</b></span>
      <span style={{fontSize:12,color:"var(--text3)",fontFamily:"var(--mono)"}}>NET P&L: <b style={{color:moR>=0?"var(--green)":"var(--red)"}}>{moR>=0?"+":""}{fmt$(moR*RV)}</b></span>
    </div>
  </div>
}

function App(){
  const[trades,setTrades]=useState(()=>{try{return JSON.parse(localStorage.getItem(SK))||[]}catch{return[]}})
  const[tab,setTab]=useState("dashboard")
  const[form,setForm]=useState({...DT})
  const[editId,setEditId]=useState(null)
  const[fP,setFP]=useState("all")
  const[fS,setFS]=useState("all")
  const[fN,setFN]=useState("")
  const[viewSS,setViewSS]=useState(null)
  const[sb,setSb]=useState(window.innerWidth>900)
  const[calMonth,setCalMonth]=useState(new Date().getMonth())
  const[calYear,setCalYear]=useState(new Date().getFullYear())
  const fR=useRef()
  useEffect(()=>{try{localStorage.setItem(SK,JSON.stringify(trades))}catch{}},[trades])
  useEffect(()=>{const fn=()=>setSb(window.innerWidth>900);window.addEventListener("resize",fn);return()=>window.removeEventListener("resize",fn)},[])
  const setHI=v=>setForm(f=>({...f,horaInicio:v,duracionTrade:String(cDur(v,f.horaFinal)||"")}))
  const setHF=v=>setForm(f=>({...f,horaFinal:v,duracionTrade:String(cDur(f.horaInicio,v)||"")}))
  const filtered=useMemo(()=>{let ft=[...trades];if(fS!=="all")ft=ft.filter(t=>t.setup===fS);if(fN)ft=ft.slice(0,parseInt(fN)||ft.length);if(fP!=="all"){const now=new Date();if(fP==="week"){const w=new Date(now-7*864e5);ft=ft.filter(t=>new Date(t.fecha)>=w)}else if(fP==="month")ft=ft.filter(t=>{const d=new Date(t.fecha);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()});else if(fP==="year")ft=ft.filter(t=>new Date(t.fecha).getFullYear()===now.getFullYear())}return ft.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha))},[trades,fP,fS,fN])
  const stats=useMemo(()=>cS(filtered),[filtered])
  const extra=useMemo(()=>extraS(filtered),[filtered])
  const daily=useMemo(()=>grpBy(trades,t=>t.fecha),[trades])
  const weekly=useMemo(()=>grpBy(trades,t=>t.fecha?`S${wom(t.fecha)} ${getMo(t.fecha)}`:""  ),[trades])
  const monthly=useMemo(()=>grpBy(trades,t=>getMo(t.fecha)),[trades])
  const yearly=useMemo(()=>grpBy(trades,t=>t.fecha?`20${getYr(t.fecha)}`:""),[trades])
  const setupS=useMemo(()=>{const m={};SETUPS.forEach(s=>m[s]=cS(trades.filter(t=>t.setup===s)));return m},[trades])
  const rTaken=useMemo(()=>rDist(filtered,"rResultado"),[filtered])
  const rMax=useMemo(()=>rDist(filtered,"rMaximo"),[filtered])
  const hStats=useMemo(()=>hourAnalysis(filtered),[filtered])
  const atrS=useMemo(()=>atrAnalysis(filtered),[filtered])
  const slS=useMemo(()=>slAnalysis(filtered),[filtered])
  const tips=useMemo(()=>suggestions(filtered),[filtered])

  const save=()=>{if(!form.fecha)return alert("Fecha obligatoria");const t={...form,semana:String(wom(form.fecha)),duracionTrade:String(cDur(form.horaInicio,form.horaFinal)||"")};if(t.resultado==="SL")t.rResultado="-1";if(t.resultado==="BE")t.rResultado="0";if(editId){setTrades(ts=>ts.map(x=>x.id===editId?{...t,id:editId}:x));setEditId(null)}else setTrades(ts=>[...ts,{...t,id:uid()}]);setForm({...DT});setTab("trades")}
  const del=id=>{if(confirm("Eliminar?")){setTrades(ts=>ts.filter(t=>t.id!==id))}}
  const edit=t=>{setForm({...DT,...t});setEditId(t.id);setTab("addTrade")}
  const goTab=t=>{setTab(t);if(window.innerWidth<=900)setSb(false);if(t==="addTrade"&&!editId)setForm({...DT})}
  const exportCSV=()=>{const h=["fecha","semana","horaInicio","horaFinal","duracionTrade","atr","setup","contexto","buySell","puntosSlStr","rResultado","rMaximo","resultado","breakRangoM30","direccionDia","ddPuntos","hayNoticia","noticiaHora","noticiaImpacto","noticiaTipo","m5","m15","m30","notas"];const csv=[h.join(","),...trades.map(t=>h.map(k=>`"${t[k]||""}"`).join(","))].join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="bt_journal.csv";a.click()}
  const importCSV=e=>{const f=e.target.files[0];if(!f)return;const r2=new FileReader();r2.onload=ev=>{const lines=ev.target.result.split("\n").filter(Boolean);if(lines.length<2)return;const hd=lines[0].split(",").map(h=>h.replace(/"/g,"").trim());const imp=lines.slice(1).map(line=>{const vs=line.match(/(".*?"|[^",]+)/g)?.map(v=>v.replace(/"/g,"").trim())||[];const o={...DT,id:uid()};hd.forEach((h,i)=>{if(vs[i])o[h]=vs[i]});return o});setTrades(ts=>[...ts,...imp]);alert(`${imp.length} trades importados`)};r2.readAsText(f)}
  const handleFile=e=>{const f=e.target.files[0];if(!f)return;const r2=new FileReader();r2.onload=ev=>setForm(p=>({...p,screenshot:ev.target.result,screenshotPreview:ev.target.result}));r2.readAsDataURL(f)}
  const F=(l,n,type="text",opts)=>(<div className="field"><label>{l}</label>{opts?<select className="inp" value={form[n]||""} onChange={e=>setForm(f=>({...f,[n]:e.target.value}))}>{opts.map(o=><option key={o} value={o}>{o||"—"}</option>)}</select>:<input className="inp" type={type} value={form[n]||""} onChange={e=>setForm(f=>({...f,[n]:e.target.value}))} step={type==="number"?"any":undefined}/>}</div>)
  const isWin=form.resultado==="WIN",autoDur=cDur(form.horaInicio,form.horaFinal),autoWeek=wom(form.fecha),ddPct=gDD(form)
  const nav=[{id:"dashboard",l:"Dashboard",i:"◈"},{id:"calendario",l:"Calendario",i:"▦"},{id:"trades",l:"Trades",i:"☰"},{id:"addTrade",l:editId?"Editar":"Nuevo",i:"+"},{id:"estadisticas",l:"Stats",i:"▥"},{id:"setups",l:"Setups",i:"◆"},{id:"avanzado",l:"Avanzado",i:"◉"},{id:"tips",l:"Tips",i:"★"}]
  const STable=({title,data,cols,row,chart})=>(<div className="card"><div className="st">{title}</div><div style={{display:"grid",gridTemplateColumns:chart?"minmax(0,1.3fr) minmax(0,1fr)":"1fr",gap:16}}><div style={{overflowX:"auto"}}><table className="tbl"><thead><tr>{cols.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{data.map((d,i)=><tr key={i}>{row(d).map((c,j)=>{if(Array.isArray(c))return<td key={j} className={`mono ${c[1]} ${c[2]?"bold":""}`}>{c[0]}</td>;return<td key={j} className="mono">{c}</td>})}</tr>)}</tbody></table>{!data.length&&<div className="em">Sin datos</div>}</div>{chart&&<BC data={chart.slice(0,12).reverse().map(w=>w.totalR)} labels={chart.slice(0,12).reverse().map(w=>w.key)} unit="R"/>}</div></div>)
  const Filters=()=><div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
    <select className="inp" style={{width:"auto"}} value={fS} onChange={e=>setFS(e.target.value)}><option value="all">All setups</option>{SETUPS.map(s=><option key={s} value={s}>{s}</option>)}</select>
    <div className="pb">{["all","week","month","year"].map(p=><button key={p} className={`pbtn ${fP===p?"active":""}`} onClick={()=>setFP(p)}>{{all:"Todo",week:"7d",month:"Mes",year:"Ano"}[p]}</button>)}</div>
    <select className="inp" style={{width:"auto"}} value={fN} onChange={e=>setFN(e.target.value)}><option value="">Todos</option><option value="10">Ult 10</option><option value="20">Ult 20</option><option value="50">Ult 50</option><option value="100">Ult 100</option></select>
  </div>

  return(<>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');:root{--bg:#0a0e14;--surface:#12171f;--surface2:#1a2030;--border:#1e2738;--border2:#2a3548;--text:#d4dae4;--text2:#8892a4;--text3:#5a6478;--accent:#4c9aff;--accent2:#2d7adf;--ad:rgba(76,154,255,.12);--green:#00d68f;--gd:rgba(0,214,143,.12);--red:#ff4757;--rd:rgba(255,71,87,.12);--yellow:#ffc048;--yd:rgba(255,192,72,.12);--purple:#a78bfa;--pd:rgba(167,139,250,.12);--font:'DM Sans',sans-serif;--mono:'JetBrains Mono',monospace;--radius:10px;--rlg:14px}*{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg);color:var(--text);font-family:var(--font);font-size:14px;-webkit-font-smoothing:antialiased}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}.shell{display:flex;min-height:100vh}.sidebar{width:240px;background:var(--surface);border-right:1px solid var(--border);position:fixed;top:0;left:0;bottom:0;display:flex;flex-direction:column;z-index:100;transition:transform .25s}.sidebar.closed{transform:translateX(-240px)}.main{margin-left:240px;padding:28px 36px 60px;flex:1;min-width:0}.main.full{margin-left:0}.mobile-bar{display:none;position:fixed;top:0;left:0;right:0;height:52px;background:var(--surface);border-bottom:1px solid var(--border);z-index:101;align-items:center;padding:0 16px;justify-content:space-between}@media(max-width:900px){.mobile-bar{display:flex}.main{margin-left:0;padding:68px 16px 40px}.sidebar{transform:translateX(-240px)}.sidebar.open{transform:translateX(0)}}.overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99}.ss-modal{position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer}.ss-modal img{max-width:92vw;max-height:92vh;border-radius:var(--radius)}.sb-brand{padding:24px 20px 20px;border-bottom:1px solid var(--border)}.sb-brand h1{font-size:20px;font-weight:700;color:var(--accent);letter-spacing:-.5px}.sb-brand p{font-size:11px;color:var(--text3);margin-top:4px;font-family:var(--mono);text-transform:uppercase;letter-spacing:1px}.sb-nav{flex:1;padding:8px;display:flex;flex-direction:column;gap:1px;overflow-y:auto}.sb-btn{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;background:transparent;color:var(--text2);border:none;cursor:pointer;font:inherit;font-size:12px;font-weight:500;border-radius:7px;transition:all .15s;text-align:left}.sb-btn:hover{background:var(--surface2);color:var(--text)}.sb-btn.active{background:var(--ad);color:var(--accent)}.sb-footer{padding:12px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:6px}.sb-footer button,.sb-footer label{display:block;width:100%;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:7px;color:var(--text2);font:inherit;font-size:11px;font-weight:500;cursor:pointer;text-align:center}.sb-footer button:hover,.sb-footer label:hover{background:var(--border);color:var(--text)}.pt{font-size:24px;font-weight:700;letter-spacing:-.5px}.ps{color:var(--text2);font-size:13px;margin-top:2px}.st{font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px;font-family:var(--mono)}.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--rlg);padding:20px;margin-bottom:16px}.ch{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:20px}.mc{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px}.ml{font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.8px;font-family:var(--mono);margin-bottom:6px}.mv{font-size:20px;font-weight:700;font-family:var(--mono);letter-spacing:-.5px;line-height:1}.mv.big{font-size:26px}.ms{font-size:10px;color:var(--text3);margin-top:5px;font-family:var(--mono)}.tag{display:inline-block;padding:3px 8px;border-radius:5px;font-size:10px;font-weight:600;font-family:var(--mono)}.tg{background:var(--gd);color:var(--green)}.tr{background:var(--rd);color:var(--red)}.ty{background:var(--yd);color:var(--yellow)}.ta{background:var(--ad);color:var(--accent)}.tp{background:var(--pd);color:var(--purple)}.tbl{width:100%;border-collapse:collapse;font-size:12px}.tbl th{text-align:left;padding:8px 10px;border-bottom:1px solid var(--border);color:var(--text3);font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:.8px;font-family:var(--mono);white-space:nowrap}.tbl td{padding:8px 10px;border-bottom:1px solid var(--border)}.tbl tr:hover td{background:var(--surface2)}.tbl .mono{font-family:var(--mono)}.tbl .g{color:var(--green)}.tbl .r{color:var(--red)}.tbl .y{color:var(--yellow)}.tbl .bold{font-weight:600}.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.field{display:flex;flex-direction:column;gap:4px}.field label{font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;font-weight:600;font-family:var(--mono)}.inp{background:var(--bg);border:1px solid var(--border2);border-radius:7px;color:var(--text);padding:9px 11px;font:inherit;font-size:13px;width:100%;outline:none}.inp:focus{border-color:var(--accent)}select.inp{cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235a6478' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:28px}textarea.inp{resize:vertical;min-height:100px}input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(.6)}.btn{border:none;border-radius:7px;padding:9px 20px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s}.bp{background:var(--accent);color:#fff}.bp:hover{background:var(--accent2)}.bo{background:transparent;color:var(--text2);border:1px solid var(--border2)}.bo:hover{background:var(--surface2);color:var(--text)}.bd{background:var(--rd);color:var(--red)}.bd:hover{background:var(--red);color:#fff}.bs{padding:5px 11px;font-size:11px}.bx{padding:3px 7px;font-size:10px}.pb{display:flex;gap:3px;background:var(--surface);border:1px solid var(--border);border-radius:7px;padding:2px}.pbtn{padding:5px 12px;border:none;background:transparent;color:var(--text3);font:inherit;font-size:11px;font-weight:500;cursor:pointer;border-radius:5px}.pbtn.active{background:var(--ad);color:var(--accent)}.em{text-align:center;padding:24px;color:var(--text3);font-size:12px}.g2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}@media(max-width:700px){.g2,.g3{grid-template-columns:1fr}}.uz{border:2px dashed var(--border2);border-radius:var(--radius);padding:24px;text-align:center;cursor:pointer;color:var(--text3);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:80px}.uz:hover{border-color:var(--accent)}.uz img{max-width:100%;max-height:140px;border-radius:7px}.sc{border-left:3px solid var(--border2)}.sc.profit{border-left-color:var(--green)}.sc.loss{border-left-color:var(--red)}.af{background:var(--surface2);border:1px solid var(--border);border-radius:7px;padding:9px 11px;font-family:var(--mono);font-size:13px;color:var(--accent)}.info-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:14px}.info-item{background:var(--bg);border-radius:7px;padding:12px}.info-item .val{font-family:var(--mono);font-weight:600;font-size:13px;margin-top:4px}.tip-card{padding:14px 16px;border-radius:8px;margin-bottom:8px;font-size:13px;display:flex;align-items:flex-start;gap:10px}.tip-card .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:5px}@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.card,.mc{animation:fadeIn .3s ease both}`}</style>
    <div className="shell">
      {viewSS&&<div className="ss-modal" onClick={()=>setViewSS(null)}><img src={viewSS}/></div>}
      {sb&&window.innerWidth<=900&&<div className="overlay" onClick={()=>setSb(false)}/>}
      <div className="mobile-bar"><button onClick={()=>setSb(!sb)} style={{background:"none",border:"none",color:"var(--text)",fontSize:20,cursor:"pointer"}}>{"\u2630"}</button><span style={{fontWeight:700,color:"var(--accent)",fontFamily:"var(--mono)"}}>BT JOURNAL</span><div style={{width:28}}/></div>
      <div className={`sidebar ${sb?"open":"closed"}`}>
        <div className="sb-brand"><h1>BT Journal</h1><p>Pro v7</p></div>
        <nav className="sb-nav">{nav.map(n=><button key={n.id} className={`sb-btn ${tab===n.id?"active":""}`} onClick={()=>goTab(n.id)}><span style={{fontFamily:"var(--mono)",fontSize:14,width:18,textAlign:"center"}}>{n.i}</span><span>{n.l}</span></button>)}</nav>
        <div className="sb-footer"><button onClick={exportCSV}>Exportar CSV</button><label>Importar CSV<input type="file" accept=".csv" onChange={importCSV} style={{display:"none"}}/></label></div>
      </div>
      <div className={`main ${!sb||window.innerWidth<=900?"full":""}`}>

{/* DASHBOARD */}
{tab==="dashboard"&&<><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:10}}><div><h1 className="pt">Dashboard</h1><p className="ps">{trades.length} trades | 1R={fmt$(RV)}</p></div><Filters/></div>
<div className="metrics"><M label="P&L" value={`${stats.totalR>=0?"+":""}${stats.totalR}R`} sub={fmt$(stats.totalDollar)} color={stats.totalR>=0?"var(--green)":"var(--red)"} big/><M label="Win rate" value={`${stats.winRate.toFixed(2)}%`} color={stats.winRate>=50?"var(--green)":"var(--red)"} sub={`${stats.wins}W|${stats.losses}L|${stats.bes}BE`}/><M label="PF" value={fmtPF(stats.profitFactor)} color={stats.profitFactor>=1.5?"var(--green)":stats.profitFactor>=1?"var(--yellow)":"var(--red)"}/><M label="Expectancy" value={`${stats.expectancy}R`} color={stats.expectancy>0?"var(--green)":"var(--red)"} sub={fmt$(stats.expectDollar)+"/trade"}/><M label="Sharpe" value={stats.sharpeRatio.toFixed(2)} color={stats.sharpeRatio>=1?"var(--green)":stats.sharpeRatio>=0.5?"var(--yellow)":"var(--red)"}/><M label="Recovery F" value={stats.recoveryFactor===Infinity?"∞":stats.recoveryFactor.toFixed(2)} color={stats.recoveryFactor>=2?"var(--green)":stats.recoveryFactor>=1?"var(--yellow)":"var(--red)"} sub={`Max DD: ${stats.maxEquityDD||0}R`}/><M label="Payoff" value={stats.payoffRatio===Infinity?"∞":stats.payoffRatio.toFixed(2)} color={stats.payoffRatio>=2?"var(--green)":stats.payoffRatio>=1?"var(--yellow)":"var(--red)"}/><M label="DD avg" value={`${stats.avgDDpct}%`} color="var(--purple)"/><M label="Trades" value={stats.total} sub={stats.sampleValid?"Muestra valida":"Necesitas 30+"} color={stats.sampleValid?"var(--green)":"var(--yellow)"}/></div>
<div className="card"><div className="st">Resumen</div><div className="info-grid"><div className="info-item"><div className="ml">Dia mas ganador</div><div className="val" style={{color:"var(--green)"}}>{extra.bestDay}</div></div><div className="info-item"><div className="ml">Dia mas perdedor</div><div className="val" style={{color:"var(--red)"}}>{extra.worstDay}</div></div><div className="info-item"><div className="ml">Ops/dia</div><div className="val">{extra.avgOps}</div></div><div className="info-item"><div className="ml">Mejor dia semana</div><div className="val" style={{color:"var(--green)"}}>{extra.bestWd}</div></div><div className="info-item"><div className="ml">Peor dia semana</div><div className="val" style={{color:"var(--red)"}}>{extra.worstWd}</div></div><div className="info-item"><div className="ml">Racha WIN max</div><div className="val" style={{color:"var(--green)"}}>{stats.maxWinStreak} trades{stats.curWinStreak>0?` (actual: ${stats.curWinStreak})`:""}</div></div><div className="info-item"><div className="ml">Racha LOSS max</div><div className="val" style={{color:"var(--red)"}}>{stats.maxLossStreak} trades{stats.curLossStreak>0?` (actual: ${stats.curLossStreak})`:""}</div></div><div className="info-item"><div className="ml">Duracion WIN</div><div className="val">{stats.avgDurWin}min</div></div><div className="info-item"><div className="ml">Duracion SL</div><div className="val">{stats.avgDurSL}min</div></div><div className="info-item"><div className="ml">Duracion BE</div><div className="val">{stats.avgDurBE}min</div></div></div></div>
<div className="g2" style={{marginBottom:14}}><div className="card"><div className="st">Equity curve</div><EC trades={filtered}/></div><div className="card"><div className="st">Resultados</div><div style={{display:"flex",gap:20,flexWrap:"wrap"}}>{[["WIN",stats.wins,"var(--green)"],["SL",stats.losses,"var(--red)"],["BE",stats.bes,"var(--yellow)"]].map(([l,v,c])=><div key={l} style={{textAlign:"center"}}><div style={{fontSize:28,fontWeight:700,fontFamily:"var(--mono)",color:c}}>{stats.total?Math.round(v/stats.total*10000)/100:0}%</div><div style={{fontSize:11,color:"var(--text3)",fontFamily:"var(--mono)"}}>{l} ({v})</div></div>)}</div></div></div>
<div className="card"><div className="st">P&L diario (R)</div><BC data={daily.slice(0,20).reverse().map(d=>d.totalR)} labels={daily.slice(0,20).reverse().map(d=>fmtD(d.key))} unit="R"/></div>
<div className="card"><div className="ch"><span className="st" style={{margin:0}}>Recientes</span><button className="btn bo bx" onClick={()=>setTab("trades")}>Ver todos</button></div><div style={{overflowX:"auto"}}><table className="tbl"><thead><tr><th>Fecha</th><th>Setup</th><th>B/S</th><th>R</th><th>Rmax</th><th>P&L</th><th>Result</th><th>DD%</th><th>Dir</th></tr></thead><tbody>{filtered.slice(0,8).map(t=>{const r=gR(t),dd=gDD(t);return<tr key={t.id} style={{cursor:"pointer"}} onClick={()=>edit(t)}><td className="mono">{fmtD(t.fecha)}</td><td><ST s={t.setup}/></td><td><BT bs={t.buySell}/></td><td className="mono bold" style={{color:r>0?"var(--green)":r<0?"var(--red)":"var(--yellow)"}}>{fmtR(r)}</td><td className="mono" style={{color:"var(--purple)"}}>{pn(t.rMaximo)>0?t.rMaximo+"R":""}</td><td className="mono bold" style={{color:r>=0?"var(--green)":"var(--red)"}}>{fmt$(r*RV)}</td><td><RT res={t.resultado}/></td><td className="mono" style={{color:"var(--purple)"}}>{dd!==null?dd+"%":""}</td><td><DT2 dir={t.direccionDia}/></td></tr>})}</tbody></table></div>{!filtered.length&&<div className="em">Sin trades</div>}</div></>}

{/* CALENDARIO */}
{tab==="calendario"&&<><h1 className="pt" style={{marginBottom:20}}>Calendario</h1><Calendar trades={trades} month={calMonth} year={calYear} onPrev={()=>{if(calMonth===0){setCalMonth(11);setCalYear(calYear-1)}else setCalMonth(calMonth-1)}} onNext={()=>{if(calMonth===11){setCalMonth(0);setCalYear(calYear+1)}else setCalMonth(calMonth+1)}}/></>}

{/* TRADES */}
{tab==="trades"&&<><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}><h1 className="pt">Trades</h1><div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}><Filters/><button className="btn bp bs" onClick={()=>goTab("addTrade")}>+ Nuevo</button></div></div>
<div className="card" style={{overflowX:"auto"}}><table className="tbl" style={{minWidth:1300}}><thead><tr>{["Fecha","Sem","Hora","Dur","Setup","Ctx","B/S","SL","R","Rmax","P&L","Res","DD","DD%","Brk","Dir","News","M5","M15","M30","Img",""].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{filtered.map(t=>{const r=gR(t),dd=gDD(t);return<tr key={t.id}><td className="mono">{fmtD(t.fecha)}</td><td className="mono">S{wom(t.fecha)}</td><td className="mono" style={{fontSize:11}}>{t.horaInicio}>{t.horaFinal}</td><td className="mono">{t.duracionTrade?t.duracionTrade+"m":""}</td><td><ST s={t.setup}/></td><td style={{fontSize:11}}>{t.contexto}</td><td><BT bs={t.buySell}/></td><td className="mono">{t.puntosSlStr}</td><td className="mono bold" style={{color:r>0?"var(--green)":r<0?"var(--red)":"var(--yellow)"}}>{fmtR(r)}</td><td className="mono" style={{color:"var(--purple)"}}>{pn(t.rMaximo)>0?t.rMaximo+"R":""}</td><td className="mono bold" style={{color:r>=0?"var(--green)":"var(--red)"}}>{fmt$(r*RV)}</td><td><RT res={t.resultado}/></td><td className="mono">{t.ddPuntos||""}</td><td className="mono" style={{color:"var(--purple)"}}>{dd!==null?dd+"%":""}</td><td>{t.breakRangoM30}</td><td><DT2 dir={t.direccionDia}/></td><td>{t.hayNoticia==="SI"?<span className="tag tp" style={{fontSize:8}}>{t.noticiaHora}</span>:""}</td><td className="mono">{t.m5}</td><td className="mono">{t.m15}</td><td className="mono">{t.m30}</td><td>{t.screenshot?<span style={{cursor:"pointer",color:"var(--accent)"}} onClick={()=>setViewSS(t.screenshot)}>Ver</span>:""}</td><td><div style={{display:"flex",gap:3}}><button className="btn bo bx" onClick={()=>edit(t)}>E</button><button className="btn bd bx" onClick={()=>del(t.id)}>X</button></div></td></tr>})}</tbody></table>{!filtered.length&&<div className="em">Sin trades</div>}</div></>}

{/* ADD/EDIT */}
{tab==="addTrade"&&<><h1 className="pt" style={{marginBottom:16}}>{editId?"Editar":"Nuevo trade"}</h1>
<div className="card"><div className="st">General</div><div className="form-grid">{F("Fecha","fecha","date")}<div className="field"><label>Semana (auto)</label><div className="af">S{autoWeek||"-"}</div></div><TP label="Hora inicio" value={form.horaInicio} onChange={setHI}/><TP label="Hora final" value={form.horaFinal} onChange={setHF}/><div className="field"><label>Duracion (auto)</label><div className="af">{autoDur?autoDur+"min":"-"}</div></div>{F("ATR","atr","number")}</div></div>
<div className="card"><div className="st">Trade</div><div className="form-grid">{F("Setup","setup",null,SETUPS)}{F("Contexto","contexto",null,CTXS)}{F("Buy/Sell","buySell",null,["BUY","SELL"])}{F("Puntos SL","puntosSlStr","number")}{F("DD puntos","ddPuntos","number")}<div className="field"><label>DD% (auto)</label><div className="af" style={{color:ddPct!==null&&ddPct>50?"var(--red)":"var(--purple)"}}>{ddPct!==null?ddPct+"%":"-"}</div></div></div></div>
<div className="card"><div className="st">Resultado</div><div className="form-grid">{F("Resultado","resultado",null,RESS)}{isWin&&F("R ganados","rResultado","number")}{isWin&&F("R maximo mov","rMaximo","number")}{F("Break M30","breakRangoM30",null,["NO","SI"])}{F("Direccion","direccionDia",null,DIRS)}</div>{form.resultado==="SL"&&<p style={{marginTop:10,fontSize:12,color:"var(--red)",fontFamily:"var(--mono)"}}>SL=-1R=-{fmt$(RV)}</p>}{form.resultado==="BE"&&<p style={{marginTop:10,fontSize:12,color:"var(--yellow)",fontFamily:"var(--mono)"}}>BE=0R=$0</p>}{isWin&&pn(form.rResultado)>0&&<p style={{marginTop:10,fontSize:12,color:"var(--green)",fontFamily:"var(--mono)"}}>+{form.rResultado}R=+{fmt$(pn(form.rResultado)*RV)}{pn(form.rMaximo)>0?` (max ${form.rMaximo}R)`:""}</p>}</div>
<div className="card"><div className="st">Noticias</div><div className="form-grid">{F("Noticia?","hayNoticia",null,["NO","SI"])}{form.hayNoticia==="SI"&&F("Hora","noticiaHora",null,NHS)}{form.hayNoticia==="SI"&&F("Impacto","noticiaImpacto",null,NIS)}{form.hayNoticia==="SI"&&F("Tipo","noticiaTipo",null,NTS)}</div></div>
<div className="card"><div className="st">ORB</div><div className="form-grid" style={{gridTemplateColumns:"repeat(3,1fr)"}}>{F("M5","m5","number")}{F("M15","m15","number")}{F("M30","m30","number")}</div></div>
<div className="card"><div className="st">Screenshot & Notas</div><div className="g2"><div><input ref={fR} type="file" accept="image/*" onChange={handleFile} style={{display:"none"}}/><div className="uz" onClick={()=>fR.current?.click()}>{form.screenshotPreview?<img src={form.screenshotPreview}/>:<><span style={{fontSize:24}}>{"📷"}</span><span style={{fontSize:11}}>Subir</span></>}</div>{form.screenshotPreview&&<button className="btn bd bx" style={{marginTop:6}} onClick={()=>setForm(f=>({...f,screenshot:null,screenshotPreview:null}))}>Quitar</button>}</div><div className="field"><label>Notas</label><textarea className="inp" value={form.notas||""} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} placeholder="..."/></div></div></div>
<div style={{display:"flex",gap:10}}><button className="btn bp" onClick={save}>{editId?"Guardar":"Registrar"}</button>{editId&&<button className="btn bo" onClick={()=>{setEditId(null);setForm({...DT});setTab("trades")}}>Cancelar</button>}</div></>}

{/* STATS */}
{tab==="estadisticas"&&<><h1 className="pt" style={{marginBottom:16}}>Estadisticas</h1><div style={{marginBottom:14}}><Filters/></div>
<STable title="Por dia" data={daily.slice(0,30)} cols={["Fecha","N","W","L","Win%","R","P&L","PF"]} row={d=>[fmtD(d.key),d.total,[d.wins,"g"],[d.losses,"r"],[`${d.winRate.toFixed(2)}%`,d.winRate>=50?"g":"r"],[`${d.totalR>0?"+":""}${d.totalR}R`,d.totalR>=0?"g":"r",true],[fmt$(d.totalDollar),d.totalDollar>=0?"g":"r"],fmtPF(d.profitFactor)]}/>
<STable title="Por semana" data={weekly} cols={["Sem","N","Win%","R","P&L","PF"]} row={w=>[w.key,w.total,[`${w.winRate.toFixed(2)}%`,w.winRate>=50?"g":"r"],[`${w.totalR>0?"+":""}${w.totalR}R`,w.totalR>=0?"g":"r",true],[fmt$(w.totalDollar),w.totalDollar>=0?"g":"r"],fmtPF(w.profitFactor)]} chart={weekly}/>
<STable title="Por mes" data={monthly} cols={["Mes","N","Win%","R","P&L","PF"]} row={m=>[m.key,m.total,[`${m.winRate.toFixed(2)}%`,m.winRate>=50?"g":"r"],[`${m.totalR>0?"+":""}${m.totalR}R`,m.totalR>=0?"g":"r",true],[fmt$(m.totalDollar),m.totalDollar>=0?"g":"r"],fmtPF(m.profitFactor)]} chart={monthly}/>
<STable title="Por ano" data={yearly} cols={["Ano","N","Win%","R","P&L","PF"]} row={y=>[y.key,y.total,[`${y.winRate.toFixed(2)}%`,y.winRate>=50?"g":"r"],[`${y.totalR>0?"+":""}${y.totalR}R`,y.totalR>=0?"g":"r",true],[fmt$(y.totalDollar),y.totalDollar>=0?"g":"r"],fmtPF(y.profitFactor)]} chart={yearly}/></>}

{/* SETUPS */}
{tab==="setups"&&<><h1 className="pt" style={{marginBottom:16}}>Setups</h1>
<div className="g2" style={{marginBottom:16}}>{SETUPS.map(su=>{const s2=setupS[su];return<div key={su} className={`card sc ${s2.totalR>0?"profit":s2.total?"loss":""}`}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{fontSize:16,fontWeight:700,color:"var(--accent)",fontFamily:"var(--mono)"}}>{su}</span><span className="tag ta">{s2.total}</span></div><div className="g3" style={{gap:8}}>{[["Win%",`${s2.winRate.toFixed(2)}%`,s2.winRate>=50?"var(--green)":"var(--red)"],["P&L",`${s2.totalR>0?"+":""}${s2.totalR}R`,s2.totalR>=0?"var(--green)":"var(--red)"],["PF",fmtPF(s2.profitFactor),s2.profitFactor>=1.5?"var(--green)":"var(--red)"]].map(([l,v,c])=><div key={l}><div className="ml">{l}</div><div style={{fontSize:18,fontWeight:700,fontFamily:"var(--mono)",color:c}}>{v}</div></div>)}</div><div className="g3" style={{gap:8,marginTop:12,borderTop:"1px solid var(--border)",paddingTop:12}}>{[["Expect",`${s2.expectancy}R (${fmt$(s2.expectDollar)})`,s2.expectancy>=0?"var(--green)":"var(--red)"],["Best",`+${s2.bestR}R`,"var(--green)"],["DD",`${s2.avgDDpct}%`,"var(--purple)"]].map(([l,v,c])=><div key={l}><div className="ml">{l}</div><div style={{fontSize:13,fontWeight:600,fontFamily:"var(--mono)",color:c}}>{v}</div></div>)}</div></div>})}</div>
<div className="card"><div className="st">Win% por setup</div><BC data={SETUPS.map(s=>setupS[s].winRate)} labels={SETUPS} height={120} unit="%"/></div>
<div className="card"><div className="st">P&L por setup</div><BC data={SETUPS.map(s=>setupS[s].totalR)} labels={SETUPS} height={120} unit="R"/></div></>}

{/* AVANZADO */}
{tab==="avanzado"&&<><h1 className="pt" style={{marginBottom:16}}>Analisis avanzado</h1><div style={{marginBottom:14}}><Filters/></div>
{/* R Distribution */}
<div className="g2" style={{marginBottom:14}}>
<div className="card"><div className="st">Distribucion R tomados (wins)</div>{rTaken.lvl.length?<><BC data={rTaken.pct} labels={rTaken.lvl} height={120} unit="%" colors={rTaken.lvl.map(()=>"var(--green)")}/><div style={{overflowX:"auto",marginTop:12}}><table className="tbl"><thead><tr><th>R</th><th>Trades</th><th>%</th></tr></thead><tbody>{rTaken.lvl.map((l,i)=><tr key={l}><td className="mono bold" style={{color:"var(--green)"}}>{l}</td><td className="mono">{rTaken.cnt[i]}</td><td className="mono">{rTaken.pct[i]}%</td></tr>)}</tbody></table></div></>:<div className="em">Sin wins</div>}</div>
<div className="card"><div className="st">Distribucion R maximo del movimiento</div>{rMax.lvl.length?<><BC data={rMax.pct} labels={rMax.lvl} height={120} unit="%" colors={rMax.lvl.map(()=>"var(--purple)")}/><div style={{overflowX:"auto",marginTop:12}}><table className="tbl"><thead><tr><th>Rmax</th><th>Trades</th><th>%</th></tr></thead><tbody>{rMax.lvl.map((l,i)=><tr key={l}><td className="mono bold" style={{color:"var(--purple)"}}>{l}</td><td className="mono">{rMax.cnt[i]}</td><td className="mono">{rMax.pct[i]}%</td></tr>)}</tbody></table></div></>:<div className="em">Sin datos de Rmax</div>}</div>
</div>
{/* R taken vs max comparison */}
{rTaken.lvl.length>0&&rMax.lvl.length>0&&<div className="card"><div className="st">R tomado vs R maximo (comparacion)</div><div style={{overflowX:"auto"}}>{(()=>{const allLvl=[...new Set([...rTaken.lvl,...rMax.lvl])].sort((a,b)=>parseInt(a)-parseInt(b));return<table className="tbl"><thead><tr><th>Nivel</th><th>% Tomado</th><th>% Maximo</th><th>Diferencia</th></tr></thead><tbody>{allLvl.map(l=>{const ti=rTaken.lvl.indexOf(l),mi=rMax.lvl.indexOf(l),tp=ti>=0?rTaken.pct[ti]:0,mp=mi>=0?rMax.pct[mi]:0;return<tr key={l}><td className="mono bold">{l}</td><td className="mono g">{tp}%</td><td className="mono" style={{color:"var(--purple)"}}>{mp}%</td><td className="mono" style={{color:mp>tp?"var(--yellow)":"var(--text3)"}}>{mp>tp?`+${(mp-tp).toFixed(2)}% sin tomar`:"-"}</td></tr>})}</tbody></table>})()}</div></div>}

{/* Hour analysis */}
<div className="card"><div className="st">Analisis por hora de entrada</div>{hStats.length?<><div style={{overflowX:"auto"}}><table className="tbl"><thead><tr><th>Hora</th><th>Trades</th><th>Win%</th><th>SL%</th><th>BE%</th><th>R total</th><th>P&L</th><th>PF</th><th>Rmax avg</th></tr></thead><tbody>{hStats.map(h=><tr key={h.hour}><td className="mono bold">{h.hour}</td><td className="mono">{h.total}</td><td className={`mono ${h.winRate>=50?"g":"r"}`}>{h.winRate.toFixed(2)}%</td><td className="mono r">{h.total?Math.round(h.losses/h.total*10000)/100:0}%</td><td className="mono y">{h.total?Math.round(h.bes/h.total*10000)/100:0}%</td><td className={`mono bold ${h.totalR>=0?"g":"r"}`}>{h.totalR>0?"+":""}{h.totalR}R</td><td className={`mono ${h.totalDollar>=0?"g":"r"}`}>{fmt$(h.totalDollar)}</td><td className="mono">{fmtPF(h.profitFactor)}</td><td className="mono" style={{color:"var(--purple)"}}>{h.avgRmax?h.avgRmax+"R":"-"}</td></tr>)}</tbody></table></div>
<div style={{marginTop:14}}><div className="st">Win rate por hora</div><BC data={hStats.map(h=>h.winRate)} labels={hStats.map(h=>h.hour)} height={120} unit="%" colors={hStats.map(h=>h.winRate>=50?"var(--green)":"var(--red)")}/></div>
<div className="info-grid" style={{marginTop:14}}>{(()=>{if(!hStats.length)return null;const best=hStats.filter(h=>h.total>=2).reduce((a,x)=>x.totalR>a.totalR?x:a,hStats[0]);const worst=hStats.filter(h=>h.total>=2).reduce((a,x)=>x.totalR<a.totalR?x:a,hStats[0]);return<><div className="info-item"><div className="ml">Mejor hora</div><div className="val" style={{color:"var(--green)"}}>{best.hour} ({best.winRate.toFixed(2)}% WR, {best.totalR>0?"+":""}{best.totalR}R)</div></div><div className="info-item"><div className="ml">Peor hora</div><div className="val" style={{color:"var(--red)"}}>{worst.hour} ({worst.winRate.toFixed(2)}% WR, {worst.totalR>0?"+":""}{worst.totalR}R)</div></div></>})()}</div>
</>:<div className="em">Sin datos</div>}</div>

{/* ATR analysis */}
<div className="card"><div className="st">Rendimiento por rango de ATR</div>{atrS.length?<div style={{overflowX:"auto"}}><table className="tbl"><thead><tr><th>ATR</th><th>Trades</th><th>Win%</th><th>R</th><th>PF</th><th>SL sugerido</th></tr></thead><tbody>{atrS.map(a=>{const slTrades=trades.filter(t=>pn(t.atr)>0&&t.resultado==="WIN").filter(t=>{const av=pn(t.atr);return av>parseFloat(a.range)||0});const avgSL=slTrades.length?Math.round(slTrades.map(t=>pn(t.puntosSlStr)).reduce((x,y)=>x+y,0)/slTrades.length):"-";return<tr key={a.range}><td className="mono bold">{a.range}</td><td className="mono">{a.total}</td><td className={`mono ${a.winRate>=50?"g":"r"}`}>{a.winRate.toFixed(2)}%</td><td className={`mono bold ${a.totalR>=0?"g":"r"}`}>{a.totalR>0?"+":""}{a.totalR}R</td><td className="mono">{fmtPF(a.profitFactor)}</td><td className="mono" style={{color:"var(--accent)"}}>{avgSL} pts</td></tr>})}</tbody></table></div>:<div className="em">Sin datos ATR</div>}</div>

{/* SL analysis */}
<div className="card"><div className="st">Rendimiento por puntos de SL</div>{slS.length?<div style={{overflowX:"auto"}}><table className="tbl"><thead><tr><th>SL pts</th><th>Trades</th><th>Win%</th><th>R</th><th>PF</th></tr></thead><tbody>{slS.map(s2=><tr key={s2.range}><td className="mono bold">{s2.range}</td><td className="mono">{s2.total}</td><td className={`mono ${s2.winRate>=50?"g":"r"}`}>{s2.winRate.toFixed(2)}%</td><td className={`mono bold ${s2.totalR>=0?"g":"r"}`}>{s2.totalR>0?"+":""}{s2.totalR}R</td><td className="mono">{fmtPF(s2.profitFactor)}</td></tr>)}</tbody></table></div>:<div className="em">Sin datos</div>}</div>

{/* Direction */}
<div className="card"><div className="st">Por direccion</div><div className="g3">{DIRS.map(dir=>{const ds=cS(filtered.filter(t=>t.direccionDia===dir));return<div key={dir} style={{background:"var(--bg)",borderRadius:"var(--radius)",padding:14}}><DT2 dir={dir}/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:12}}>{[["N",ds.total],["Win%",`${ds.winRate.toFixed(2)}%`,ds.winRate>=50?"var(--green)":"var(--red)"],["R",`${ds.totalR>0?"+":""}${ds.totalR}R`,ds.totalR>=0?"var(--green)":"var(--red)"],["PF",fmtPF(ds.profitFactor)]].map(([l,v,c])=><div key={l}><div className="ml">{l}</div><div style={{fontWeight:600,fontFamily:"var(--mono)",color:c}}>{v}</div></div>)}</div></div>})}</div></div>
</>}

{/* TIPS */}
{tab==="tips"&&<><h1 className="pt" style={{marginBottom:16}}>Sugerencias</h1><p className="ps" style={{marginBottom:20}}>Basadas en tus ultimos {filtered.length} trades</p>
{tips.length?tips.map((t,i)=>{const colors={green:{bg:"rgba(0,214,143,.08)",border:"var(--green)",dot:"var(--green)"},red:{bg:"rgba(255,71,87,.08)",border:"var(--red)",dot:"var(--red)"},yellow:{bg:"rgba(255,192,72,.08)",border:"var(--yellow)",dot:"var(--yellow)"},blue:{bg:"rgba(76,154,255,.08)",border:"var(--accent)",dot:"var(--accent)"}}[t.type]||{bg:"var(--surface2)",border:"var(--border)",dot:"var(--text3)"};return<div key={i} className="tip-card" style={{background:colors.bg,borderLeft:`3px solid ${colors.border}`}}><div className="dot" style={{background:colors.dot}}/><span>{t.text}</span></div>}):<div className="em">Necesitas minimo 5 trades para ver sugerencias</div>}</>}

      </div></div></>)
}
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>)
