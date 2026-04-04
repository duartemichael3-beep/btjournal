import React from 'react'
import ReactDOM from 'react-dom/client'
import{useState,useMemo,useEffect,useRef,useCallback}from"react"

// ═══ SUPABASE CONFIG (fetch directo, NO SDK) ═══
const SUPA_URL="https://kkcsykncinisnknymonz.supabase.co"
const SUPA_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrY3N5a25jaW5pc25rbnltb256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjYxMzIsImV4cCI6MjA5MDg0MjEzMn0.m8M_nIg6h87ocMedXSOSzOr0Xv0iIwjMWuODTnbHmSI"
const supa=(path,opts={})=>fetch(`${SUPA_URL}/rest/v1/${path}`,{...opts,headers:{"apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Content-Type":"application/json","Prefer":opts.prefer||"return=representation",...(opts.headers||{})}})

// ═══ CONSTANTS ═══
const SETUPS=["M1","M2","M3","J1","J2"],CTXS=["APERTURA","ROMPIMIENTO","GIRO"],DIRS=["RANGO","ALCISTA","BAJISTA"],RESS=["SL","BE","WIN"]
const NHS=["","08:30","09:45","10:00","10:30"],NIS=["","ALTO","MEDIO","BAJO"],NTS=["","NFP","CPI","PPI","FOMC","JOBLESS CLAIMS","GDP","RETAIL SALES","ISM","PCE","OTRA"]
const RV=300
const DFT={fecha:"",horaInicio:"09:30",horaFinal:"10:00",atr:"",setup:"M1",contexto:"APERTURA",buySell:"BUY",puntosSlStr:"",rResultado:"",rMaximo:"",resultado:"SL",breakRangoM30:"NO",direccionDia:"RANGO",m5:"",m15:"",m30:"",ddPuntos:"",hayNoticia:"NO",noticiaHora:"",noticiaImpacto:"",noticiaTipo:"",screenshot:null,screenshotPreview:null,notas:""}
const HOURS=[];for(let h=0;h<24;h++)for(let m=0;m<60;m++)HOURS.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`)

// ═══ HELPERS ═══
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
const gR=t=>{if(t.resultado==="BE")return 0;const rv=pn(t.rResultado);if(t.resultado==="SL")return rv<0?rv:-1;return rv>0?rv:0}
const gDD=t=>{const s=pn(t.puntosSlStr),d=pn(t.ddPuntos);return s&&d?Math.round(d/s*10000)/100:null}
const hBucket=h=>{if(!h||!h.includes(":"))return"";const[hh,mm]=h.split(":").map(Number);return`${String(hh).padStart(2,"0")}:${String(Math.floor(mm/5)*5).padStart(2,"0")}`}

// ═══ NT8 CSV PARSER ═══
// Instrument multiplier: NQ=$20/pt, MNQ=$2/pt
const getMultiplier=instr=>{if(!instr)return 2;const u=instr.toUpperCase();if(u.startsWith("MNQ")||u.startsWith("MNQM")||u.includes("MICRO"))return 2;if(u.startsWith("NQ")||u.startsWith("NQM"))return 20;return 2}

function parseNT8CSV(csvText){
  const lines=csvText.replace(/\r/g,"").split("\n").filter(l=>l.trim())
  if(lines.length<2)return[]
  const hdr=lines[0].split(",").map(h=>h.trim())
  const iInst=hdr.indexOf("Instrument"),iAction=hdr.indexOf("Action"),iQty=hdr.indexOf("Quantity")
  const iPrice=hdr.indexOf("Price"),iTime=hdr.indexOf("Time"),iEX=hdr.indexOf("E/X")
  if(iAction<0||iQty<0||iPrice<0||iTime<0||iEX<0)return[]

  // Parse all rows, sorted by time
  const rows=lines.slice(1).map(line=>{
    const vs=line.split(",").map(v=>v.trim())
    return{instrument:vs[iInst]||"",action:vs[iAction]||"",qty:parseInt(vs[iQty])||0,price:parseFloat(vs[iPrice])||0,time:vs[iTime]||"",ex:(vs[iEX]||"").trim()}
  }).filter(r=>r.action&&r.qty&&r.price&&r.time)

  // Sort by parsed time
  rows.sort((a,b)=>{const ta=parseNT8Time(a.time),tb=parseNT8Time(b.time);return(ta||0)-(tb||0)})

  // Match: each Entry row pairs with subsequent Exit row(s) of OPPOSITE action
  // until exit qty >= entry qty, or next Entry appears
  const trades=[]
  let i=0
  while(i<rows.length){
    const r=rows[i]
    if(r.ex==="Entry"){
      const entryRow=r
      const entryQty=entryRow.qty
      const entryPrice=entryRow.price
      const isBuy=entryRow.action==="Buy"
      const instrument=entryRow.instrument
      const mult=getMultiplier(instrument)
      // Collect subsequent Exit rows of opposite action
      const exits=[]
      let exitQty=0
      let j=i+1
      while(j<rows.length&&exitQty<entryQty){
        const nr=rows[j]
        if(nr.ex==="Exit"){
          // Verify opposite action (Buy entry -> Sell exit, Sell entry -> Buy exit)
          const isOpposite=(isBuy&&nr.action==="Sell")||(!isBuy&&nr.action==="Buy")
          if(isOpposite){exits.push(nr);exitQty+=nr.qty}
          else break
        }else break // next Entry starts
        j++
      }
      if(exits.length>0){
        const totalExitQty=exits.reduce((a,e)=>a+e.qty,0)
        const avgExitPrice=exits.reduce((a,e)=>a+e.price*e.qty,0)/totalExitQty
        const points=isBuy?avgExitPrice-entryPrice:entryPrice-avgExitPrice
        const pointsRound=Math.round(points*100)/100
        const contracts=Math.min(entryQty,totalExitQty)
        const dollarPL=pointsRound*contracts*mult
        const rValue=Math.round(dollarPL/RV*100)/100

        const entryDate=parseNT8Time(entryRow.time)
        const exitDate=parseNT8Time(exits[exits.length-1].time)
        const fecha=entryDate?`${entryDate.getFullYear()}-${String(entryDate.getMonth()+1).padStart(2,"0")}-${String(entryDate.getDate()).padStart(2,"0")}`:""
        const horaInicio=entryDate?`${String(entryDate.getHours()).padStart(2,"0")}:${String(entryDate.getMinutes()).padStart(2,"0")}`:""
        const horaFinal=exitDate?`${String(exitDate.getHours()).padStart(2,"0")}:${String(exitDate.getMinutes()).padStart(2,"0")}`:""
        const dur=cDur(horaInicio,horaFinal)

        let resultado,rResultado
        if(dollarPL>5){resultado="WIN";rResultado=String(Math.round(Math.abs(rValue)*100)/100)}
        else if(dollarPL<-5){resultado="SL";rResultado=String(Math.round(rValue*100)/100)}
        else{resultado="BE";rResultado="0"}

        trades.push({
          ...DFT,fecha,horaInicio,horaFinal,duracionTrade:String(dur||""),
          buySell:isBuy?"BUY":"SELL",puntosSlStr:String(Math.abs(pointsRound)),
          rResultado,rMaximo:"",resultado,
          notas:`NT8: ${instrument} ${contracts}ct @ ${entryPrice}→${Math.round(avgExitPrice*100)/100} = ${pointsRound}pts ${fmt$(Math.round(dollarPL))} (${rValue}R)`
        })
        i=j
      }else{i++}
    }else{i++} // skip orphan Exit rows
  }
  return trades
}

function parseNT8Time(str){
  if(!str)return null
  // Format: "4/2/2026 9:36:35 AM" or "4/2/2026 9:36:35 PM"
  try{
    const parts=str.trim().split(" ")
    if(parts.length<3)return new Date(str)
    const[mo,dy,yr]=parts[0].split("/").map(Number)
    const[hh,mm,ss]=(parts[1]||"0:0:0").split(":").map(Number)
    const ampm=(parts[2]||"AM").toUpperCase()
    let h24=hh
    if(ampm==="PM"&&hh<12)h24=hh+12
    if(ampm==="AM"&&hh===12)h24=0
    return new Date(yr,mo-1,dy,h24,mm,ss||0)
  }catch{return null}
}

// ═══ TRADE <-> DB MAPPING ═══
const tradeToDb=(t,userId,mode="bt")=>({user_id:userId,mode,fecha:t.fecha,hora_inicio:t.horaInicio,hora_final:t.horaFinal,duracion_trade:t.duracionTrade||"",atr:t.atr||"",setup:t.setup,contexto:t.contexto,buy_sell:t.buySell,puntos_sl:t.puntosSlStr||"",r_resultado:t.rResultado||"",r_maximo:t.rMaximo||"",resultado:t.resultado,break_rango_m30:t.breakRangoM30,direccion_dia:t.direccionDia,dd_puntos:t.ddPuntos||"",hay_noticia:t.hayNoticia,noticia_hora:t.noticiaHora||"",noticia_impacto:t.noticiaImpacto||"",noticia_tipo:t.noticiaTipo||"",m5:t.m5||"",m15:t.m15||"",m30:t.m30||"",screenshot:t.screenshot||"",notas:t.notas||""})
const dbToTrade=d=>({id:d.id,mode:d.mode||"bt",fecha:d.fecha||"",horaInicio:d.hora_inicio||"",horaFinal:d.hora_final||"",duracionTrade:d.duracion_trade||"",atr:d.atr||"",setup:d.setup||"M1",contexto:d.contexto||"APERTURA",buySell:d.buy_sell||"BUY",puntosSlStr:d.puntos_sl||"",rResultado:d.r_resultado||"",rMaximo:d.r_maximo||"",resultado:d.resultado||"SL",breakRangoM30:d.break_rango_m30||"NO",direccionDia:d.direccion_dia||"RANGO",ddPuntos:d.dd_puntos||"",hayNoticia:d.hay_noticia||"NO",noticiaHora:d.noticia_hora||"",noticiaImpacto:d.noticia_impacto||"",noticiaTipo:d.noticia_tipo||"",m5:d.m5||"",m15:d.m15||"",m30:d.m30||"",screenshot:d.screenshot||null,screenshotPreview:d.screenshot||null,notas:d.notas||""})

// ═══ STATS ═══
function cS(trades){
  const z={total:0,wins:0,losses:0,bes:0,winRate:0,totalR:0,totalDollar:0,bestR:0,worstR:-1,profitFactor:0,expectancy:0,expectDollar:0,avgDDpct:0,avgDurWin:0,avgDurSL:0,avgDurBE:0,maxWinStreak:0,maxLossStreak:0,curWinStreak:0,curLossStreak:0,recoveryFactor:0,sharpeRatio:0,payoffRatio:0,sampleValid:false,maxEquityDD:0}
  if(!trades.length)return z
  const rs=trades.map(gR),w=rs.filter(r=>r>0),l=rs.filter(r=>r<0),b=rs.filter(r=>r===0)
  const tR=Math.round(rs.reduce((a,c)=>a+c,0)*100)/100,gw=w.reduce((a,r)=>a+r,0),gl=Math.abs(l.reduce((a,r)=>a+r,0))
  const dd=trades.map(gDD).filter(v=>v!==null),aDD=dd.length?Math.round(dd.reduce((a,c)=>a+c,0)/dd.length*100)/100:0
  const exp=Math.round((tR/trades.length)*100)/100
  const durW=trades.filter(t=>t.resultado==="WIN").map(t=>pn(t.duracionTrade)).filter(v=>v>0)
  const durS=trades.filter(t=>t.resultado==="SL").map(t=>pn(t.duracionTrade)).filter(v=>v>0)
  const durB=trades.filter(t=>t.resultado==="BE").map(t=>pn(t.duracionTrade)).filter(v=>v>0)
  let mxW=0,mxL=0,cW=0,cL=0
  const sorted=[...trades].sort((a,b2)=>new Date(a.fecha)-new Date(b2.fecha))
  sorted.forEach(t=>{const r=gR(t);if(r>0){cW++;cL=0}else if(r<0){cL++;cW=0}else{cW=0;cL=0};mxW=Math.max(mxW,cW);mxL=Math.max(mxL,cL)})
  let peak=0,maxDD2=0,cum=0
  sorted.forEach(t=>{cum+=gR(t);if(cum>peak)peak=cum;const d2=peak-cum;if(d2>maxDD2)maxDD2=d2})
  const recovF=maxDD2>0?Math.round(tR/maxDD2*100)/100:tR>0?Infinity:0
  const mean=tR/trades.length,variance=rs.reduce((a,r)=>a+Math.pow(r-mean,2),0)/rs.length,stddev=Math.sqrt(variance)
  const sharpe=stddev>0?Math.round(mean/stddev*100)/100:0
  const avgWR=w.length?gw/w.length:0,avgLR=l.length?gl/l.length:1
  const payoff=avgLR>0?Math.round(avgWR/avgLR*100)/100:avgWR>0?Infinity:0
  return{total:trades.length,wins:w.length,losses:l.length,bes:b.length,winRate:Math.round(w.length/trades.length*10000)/100,totalR:tR,totalDollar:Math.round(tR*RV),bestR:rs.length?Math.max(...rs):0,worstR:rs.length?Math.min(...rs):0,profitFactor:gl?Math.round(gw/gl*10000)/10000:gw>0?Infinity:0,expectancy:exp,expectDollar:Math.round(exp*RV),avgDDpct:aDD,avgDurWin:durW.length?Math.round(durW.reduce((a,c)=>a+c,0)/durW.length):0,avgDurSL:durS.length?Math.round(durS.reduce((a,c)=>a+c,0)/durS.length):0,avgDurBE:durB.length?Math.round(durB.reduce((a,c)=>a+c,0)/durB.length):0,maxWinStreak:mxW,maxLossStreak:mxL,curWinStreak:cW,curLossStreak:cL,recoveryFactor:recovF,sharpeRatio:sharpe,payoffRatio:payoff,sampleValid:trades.length>=30,maxEquityDD:Math.round(maxDD2*100)/100}
}
const grpBy=(trades,fn)=>{const m={};trades.forEach(t=>{const k=fn(t);if(k)(m[k]??=[]).push(t)});return Object.entries(m).sort((a,b)=>b[0].localeCompare(a[0])).map(([k,ts])=>({key:k,...cS(ts)}))}
function extraS(trades){
  if(!trades.length)return{bestDay:"-",worstDay:"-",avgOps:0,bestWd:"-",worstWd:"-"}
  const bd={};trades.forEach(t=>{if(t.fecha)(bd[t.fecha]??=[]).push(t)})
  const dt=Object.entries(bd).map(([d,ts])=>({d,r:ts.reduce((a,t)=>a+gR(t),0)}))
  const b=dt.reduce((a,x)=>x.r>a.r?x:a,dt[0]),w2=dt.reduce((a,x)=>x.r<a.r?x:a,dt[0])
  const bw2={};trades.forEach(t=>{if(!t.fecha)return;(bw2[getDN(t.fecha)]??=[]).push(t)})
  const wt=Object.entries(bw2).map(([wd,ts])=>({wd,r:ts.reduce((a,t)=>a+gR(t),0)}))
  const bw=wt.reduce((a,x)=>x.r>a.r?x:a,wt[0]),ww=wt.reduce((a,x)=>x.r<a.r?x:a,wt[0])
  return{bestDay:`${fmtD(b.d)} (${b.r>0?"+":""}${Math.round(b.r*100)/100}R)`,worstDay:`${fmtD(w2.d)} (${w2.r>0?"+":""}${Math.round(w2.r*100)/100}R)`,avgOps:Math.round(trades.length/Object.keys(bd).length*100)/100,bestWd:`${bw.wd} (${bw.r>0?"+":""}${Math.round(bw.r*100)/100}R)`,worstWd:`${ww.wd} (${ww.r>0?"+":""}${Math.round(ww.r*100)/100}R)`}
}
function rDist(trades,field){
  const vs=trades.filter(t=>t.resultado==="WIN").map(t=>Math.round(pn(t[field]))).filter(v=>v>0)
  if(!vs.length)return{lvl:[],cnt:[],pct:[]}
  const mx=Math.max(...vs),lvl=[],cnt=[],pct=[]
  for(let r=1;r<=Math.min(mx,15);r++){const c=vs.filter(v=>v===r).length;lvl.push(r+"R");cnt.push(c);pct.push(Math.round(c/vs.length*10000)/100)}
  if(vs.some(v=>v>15)){const c=vs.filter(v=>v>15).length;lvl.push("16R+");cnt.push(c);pct.push(Math.round(c/vs.length*10000)/100)}
  return{lvl,cnt,pct}
}
function hourAnalysis(trades){const bh={};trades.forEach(t=>{const b=hBucket(t.horaInicio);if(b)(bh[b]??=[]).push(t)});return Object.entries(bh).sort((a,b)=>a[0].localeCompare(b[0])).map(([h,ts])=>{const s=cS(ts),rm=ts.filter(t=>t.resultado==="WIN").map(t=>pn(t.rMaximo)).filter(v=>v>0);return{hour:h,...s,avgRmax:rm.length?Math.round(rm.reduce((a,c)=>a+c,0)/rm.length*100)/100:0}})}
function atrAnalysis(trades){return[[0,10,"0-10"],[10,15,"10-15"],[15,20,"15-20"],[20,25,"20-25"],[25,30,"25-30"],[30,40,"30-40"],[40,999,"40+"]].map(([lo,hi,l])=>({range:l,...cS(trades.filter(t=>{const a=pn(t.atr);return a>lo&&a<=hi}))})).filter(x=>x.total>0)}
function slAnalysis(trades){return[[0,15,"1-15"],[15,20,"15-20"],[20,25,"20-25"],[25,30,"25-30"],[30,40,"30-40"],[40,999,"40+"]].map(([lo,hi,l])=>({range:l,...cS(trades.filter(t=>{const p=pn(t.puntosSlStr);return p>lo&&p<=hi}))})).filter(x=>x.total>0)}
function suggestions(trades){
  if(trades.length<5)return[];const tips=[],s=cS(trades),ha=hourAnalysis(trades),aa=atrAnalysis(trades),sa=slAnalysis(trades)
  if(ha.length){const best=ha.reduce((a,x)=>x.totalR>a.totalR?x:a,ha[0]);if(best.total>=3)tips.push({type:"green",text:`Mejor hora: ${best.hour} (${best.winRate.toFixed(2)}% WR, ${best.totalR>0?"+":""}${best.totalR}R en ${best.total} trades)`})}
  if(ha.length){const worst=ha.reduce((a,x)=>x.totalR<a.totalR?x:a,ha[0]);if(worst.total>=3&&worst.totalR<0)tips.push({type:"red",text:`Evita ${worst.hour}: ${worst.winRate.toFixed(2)}% WR, ${worst.totalR}R en ${worst.total} trades`})}
  if(aa.length>1){const best=aa.reduce((a,x)=>x.winRate>a.winRate&&x.total>=3?x:a,aa[0]);tips.push({type:"green",text:`ATR ${best.range}: mejor WR ${best.winRate.toFixed(2)}% (${best.total} trades)`})}
  if(sa.length>1){const best=sa.reduce((a,x)=>x.winRate>a.winRate&&x.total>=3?x:a,sa[0]);tips.push({type:"green",text:`SL ${best.range}pts: ${best.winRate.toFixed(2)}% WR, PF ${fmtPF(best.profitFactor)}`})}
  const wt=trades.filter(t=>t.resultado==="WIN"&&pn(t.rMaximo)>0&&pn(t.rResultado)>0)
  if(wt.length>=3){const at=Math.round(wt.reduce((a,t)=>a+pn(t.rResultado),0)/wt.length*100)/100;const am=Math.round(wt.reduce((a,t)=>a+pn(t.rMaximo),0)/wt.length*100)/100;tips.push({type:Math.round(at/am*100)<50?"yellow":"green",text:`Capturas ${at}R de ${am}R disponibles (${Math.round(at/am*100)}%)`})}
  if(s.avgDurWin&&s.avgDurSL)tips.push({type:"blue",text:`Duracion: WIN=${s.avgDurWin}min, SL=${s.avgDurSL}min${s.avgDurBE?", BE="+s.avgDurBE+"min":""}`})
  const su2={};SETUPS.forEach(s2=>{const ts2=trades.filter(t=>t.setup===s2);if(ts2.length>=3)su2[s2]=cS(ts2)});const suE=Object.entries(su2);if(suE.length>1){const best=suE.reduce((a,[k,v])=>v.totalR>a[1].totalR?[k,v]:a,suE[0]);tips.push({type:"green",text:`Setup ${best[0]}: ${best[1].winRate.toFixed(2)}% WR, ${fmtPF(best[1].profitFactor)} PF`})}
  if(s.maxLossStreak>=3)tips.push({type:"red",text:`Racha negativa max: ${s.maxLossStreak} SL seguidos${s.curLossStreak>=2?" (llevas "+s.curLossStreak+" ahora)":""}`})
  if(s.recoveryFactor!==Infinity&&s.recoveryFactor>0)tips.push({type:s.recoveryFactor>=2?"green":s.recoveryFactor>=1?"yellow":"red",text:`Recovery Factor: ${s.recoveryFactor.toFixed(2)} ${s.recoveryFactor>=2?"(excelente)":s.recoveryFactor>=1?"(ok)":"(mejorar)"}`})
  if(s.sharpeRatio!==0)tips.push({type:s.sharpeRatio>=1?"green":s.sharpeRatio>=0.5?"yellow":"red",text:`Sharpe: ${s.sharpeRatio.toFixed(2)} ${s.sharpeRatio>=1?"(consistente)":s.sharpeRatio>=0.5?"(aceptable)":"(volatil)"}`})
  if(s.payoffRatio!==Infinity&&s.payoffRatio>0)tips.push({type:s.payoffRatio>=2?"green":"yellow",text:`Payoff: ${s.payoffRatio.toFixed(2)} ${s.payoffRatio>=2?"(wins compensan losses)":"(dejar correr winners)"}`})
  if(!s.sampleValid)tips.push({type:"yellow",text:`${s.total} trades. Min 30 para estadisticas confiables.`})
  return tips
}

// ═══ UI COMPONENTS ═══
const TP=({value,onChange,label})=>(<div className="field"><label>{label}</label><select className="inp" value={value} onChange={e=>onChange(e.target.value)}>{HOURS.map(h=><option key={h} value={h}>{h}</option>)}</select></div>)
const MC=({label,value,sub,color,big})=>(<div className="mc"><div className="ml">{label}</div><div className={`mv${big?" big":""}`} style={{color}}>{value}</div>{sub&&<div className="ms">{sub}</div>}</div>)
const RT=({res})=><span className={`tag ${res==="SL"?"tr":res==="BE"?"ty":"tg"}`}>{res}</span>
const DT2=({dir})=><span className={`tag ${dir==="ALCISTA"?"tg":dir==="BAJISTA"?"tr":"ty"}`}>{dir}</span>
const ST=({s})=><span className="tag ta">{s}</span>
const BT=({bs})=><span className={`tag ${bs==="BUY"?"tg":"tr"}`}>{bs}</span>
const EC=({trades})=>{if(trades.length<2)return<div className="em">Min 2 trades</div>;const sorted=[...trades].sort((a,b)=>new Date(a.fecha)-new Date(b.fecha));let cum=0;const pts=[0,...sorted.map(t=>(cum+=gR(t),Math.round(cum*100)/100))];const mn=Math.min(...pts),mx=Math.max(...pts),rng=mx-mn||1,w=600,h=180,p=40;const tx=i=>p+(i/(pts.length-1))*(w-p*2),ty=v=>h-p-((v-mn)/rng)*(h-p*2);const line=pts.map((v,i)=>`${i===0?"M":"L"} ${tx(i).toFixed(1)} ${ty(v).toFixed(1)}`).join(" ");const area=line+` L ${tx(pts.length-1).toFixed(1)} ${ty(mn).toFixed(1)} L ${tx(0).toFixed(1)} ${ty(mn).toFixed(1)} Z`;const col=cum>=0?"var(--green)":"var(--red)";return<svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%",display:"block"}}><defs><linearGradient id="eF" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity={.25}/><stop offset="100%" stopColor={col} stopOpacity={0}/></linearGradient></defs>{[0,.25,.5,.75,1].map((pc,i)=>{const y=ty(mn+pc*rng);return<g key={i}><line x1={p} y1={y} x2={w-p} y2={y} stroke="var(--border)" strokeWidth={.5} strokeDasharray="4 4"/><text x={p-6} y={y+4} textAnchor="end" fill="var(--text3)" fontSize={10} fontFamily="var(--mono)">{Math.round((mn+pc*rng)*10)/10}R</text></g>})}<path d={area} fill="url(#eF)"/><path d={line} fill="none" stroke={col} strokeWidth={2.5} strokeLinejoin="round"/><circle cx={tx(pts.length-1)} cy={ty(pts[pts.length-1])} r={4} fill={col}/></svg>}
const BC=({data,labels,height=130,unit="",colors})=>{if(!data.length||data.every(v=>v===0))return<div className="em">Sin datos</div>;const max=Math.max(...data.map(Math.abs),.1),bw=Math.min(44,Math.max(18,300/data.length)),tw=data.length*(bw+6)+16,bl=height-12;return<div style={{overflowX:"auto"}}><svg width={Math.max(tw,200)} height={height+28}><line x1={8} y1={bl} x2={tw} y2={bl} stroke="var(--border)" strokeWidth={1}/>{data.map((v,i)=>{const bh=Math.abs(v)/max*(height-30),x=i*(bw+6)+12,pos=v>=0,y=pos?bl-bh:bl,fill=colors?colors[i]:pos?"var(--green)":"var(--red)";return<g key={i}><rect x={x} y={y} width={bw} height={Math.max(bh,2)} rx={3} fill={fill} opacity={.85}/><text x={x+bw/2} y={pos?y-4:y+bh+12} textAnchor="middle" fill="var(--text2)" fontSize={9} fontFamily="var(--mono)">{Math.round(v*10)/10}{unit}</text><text x={x+bw/2} y={height+22} textAnchor="middle" fill="var(--text3)" fontSize={8} fontFamily="var(--mono)">{labels?.[i]}</text></g>})}</svg></div>}

// ═══ CALENDAR ═══
const Calendar=({trades,month,year,onPrev,onNext})=>{const dim=new Date(year,month+1,0).getDate(),fd=new Date(year,month,1).getDay(),mn=new Date(year,month).toLocaleString("es",{month:"long",year:"numeric"});const bd={};trades.forEach(t=>{if(!t.fecha)return;const d=new Date(t.fecha);if(d.getMonth()===month&&d.getFullYear()===year)(bd[d.getDate()]??=[]).push(t)});const cells=[];for(let i=0;i<fd;i++)cells.push(null);for(let d=1;d<=dim;d++)cells.push(d);const weeks=[];for(let i=0;i<cells.length;i+=7)weeks.push(cells.slice(i,i+7));const ws=weeks.map(wk=>{let r=0,c=0;wk.forEach(d=>{if(d&&bd[d])bd[d].forEach(t=>{r+=gR(t);c++})});return{r:Math.round(r*100)/100,c}});const mt=trades.filter(t=>{if(!t.fecha)return false;const d=new Date(t.fecha);return d.getMonth()===month&&d.getFullYear()===year});const mr=Math.round(mt.reduce((a,t)=>a+gR(t),0)*100)/100;return<div className="card" style={{padding:0,overflow:"hidden"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",borderBottom:"1px solid var(--border)"}}><span style={{fontFamily:"var(--mono)",fontWeight:700,fontSize:15,textTransform:"capitalize"}}>{mn}</span><div style={{display:"flex",gap:6}}><button className="btn bo bx" onClick={onPrev}>&lt;</button><button className="btn bo bx" onClick={onNext}>&gt;</button></div></div><div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",fontSize:10,fontFamily:"var(--mono)"}}>{["Do","Lu","Ma","Mi","Ju","Vi","Sa","Sem"].map(d=><div key={d} style={{padding:"8px 3px",textAlign:"center",color:"var(--text3)",borderBottom:"1px solid var(--border)",fontWeight:600}}>{d}</div>)}{weeks.map((wk,wi)=><React.Fragment key={wi}>{wk.map((d,di)=>{if(!d)return<div key={di} style={{padding:10,borderBottom:"1px solid var(--border)",background:"var(--bg)"}}/>;const dt=bd[d]||[],dr=Math.round(dt.reduce((a,t)=>a+gR(t),0)*100)/100,bg=dt.length?dr>0?"rgba(0,214,143,.08)":dr<0?"rgba(255,71,87,.08)":"var(--surface)":"var(--surface)";return<div key={di} style={{padding:"6px 4px",borderBottom:"1px solid var(--border)",borderRight:"1px solid var(--border)",background:bg,minHeight:55}}><div style={{fontSize:9,color:"var(--text3)",marginBottom:3}}>{d}</div>{dt.length?<><div style={{fontSize:13,fontWeight:700,color:dr>0?"var(--green)":dr<0?"var(--red)":"var(--yellow)",fontFamily:"var(--mono)"}}>{fmt$(dr*RV)}</div><div style={{fontSize:8,color:"var(--text3)",marginTop:1}}>{dt.length}t</div></>:<div style={{fontSize:8,color:"var(--text3)"}}>-</div>}</div>})}{Array(7-wk.length).fill(null).map((_,i)=><div key={`p${i}`} style={{padding:10,borderBottom:"1px solid var(--border)",background:"var(--bg)"}}/>)}<div style={{padding:"6px 4px",borderBottom:"1px solid var(--border)",background:"var(--surface2)",display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center"}}><div style={{fontSize:8,color:"var(--text3)"}}>S{wi+1}</div><div style={{fontSize:12,fontWeight:700,color:ws[wi].r>0?"var(--green)":ws[wi].r<0?"var(--red)":"var(--text3)",fontFamily:"var(--mono)"}}>{ws[wi].c?fmt$(ws[wi].r*RV):"-"}</div></div></React.Fragment>)}</div><div style={{display:"flex",justifyContent:"flex-end",gap:16,padding:"10px 18px",borderTop:"1px solid var(--border)",background:"var(--surface2)"}}><span style={{fontSize:11,color:"var(--text3)",fontFamily:"var(--mono)"}}>TRADES: <b style={{color:"var(--text)"}}>{mt.length}</b></span><span style={{fontSize:11,color:"var(--text3)",fontFamily:"var(--mono)"}}>P&L: <b style={{color:mr>=0?"var(--green)":"var(--red)"}}>{mr>=0?"+":""}{fmt$(mr*RV)}</b></span></div></div>}

// ═══ MODE TOGGLE COMPONENT ═══
const ModeToggle=({mode,setMode})=>(
  <div style={{display:"flex",gap:2,background:"var(--bg)",borderRadius:8,padding:3,marginBottom:8}}>
    <button onClick={()=>setMode("bt")} style={{flex:1,padding:"8px 0",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"var(--mono)",fontSize:11,fontWeight:700,letterSpacing:.5,background:mode==="bt"?"var(--ad)":"transparent",color:mode==="bt"?"var(--accent)":"var(--text3)",transition:"all .15s"}}>BT</button>
    <button onClick={()=>setMode("journal")} style={{flex:1,padding:"8px 0",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"var(--mono)",fontSize:11,fontWeight:700,letterSpacing:.5,background:mode==="journal"?"var(--pd)":"transparent",color:mode==="journal"?"var(--purple)":"var(--text3)",transition:"all .15s"}}>JOURNAL</button>
  </div>
)

// ═══ NT8 IMPORT MODAL ═══
function NT8ImportModal({onImport,onClose}){
  const[preview,setPreview]=useState(null)
  const[importing,setImporting]=useState(false)
  const[fileCount,setFileCount]=useState(0)

  const handleFiles=async e=>{
    const files=Array.from(e.target.files||[])
    if(!files.length)return
    setFileCount(files.length)
    // Read all files and merge rows
    const allTexts=await Promise.all(files.map(f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=ev=>res(ev.target.result);r.onerror=rej;r.readAsText(f)})))
    // Merge: take header from first file, data rows from all
    const allLines=[]
    let header=""
    allTexts.forEach((text,idx)=>{
      const lines=text.replace(/\r/g,"").split("\n").filter(l=>l.trim())
      if(lines.length<2)return
      if(!header)header=lines[0]
      allLines.push(...lines.slice(1))
    })
    if(!header||!allLines.length){setPreview([]);return}
    const merged=header+"\n"+allLines.join("\n")
    const parsed=parseNT8CSV(merged)
    setPreview(parsed)
  }

  const doImport=async()=>{
    if(!preview||!preview.length)return
    setImporting(true)
    await onImport(preview)
    setImporting(false)
    onClose()
  }

  return<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:16,padding:28,width:"100%",maxWidth:700,maxHeight:"85vh",overflow:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h2 style={{fontSize:18,fontWeight:700,color:"var(--purple)",fontFamily:"var(--mono)"}}>Importar NT8</h2>
        <button className="btn bo bx" onClick={onClose}>✕</button>
      </div>
      <p style={{fontSize:12,color:"var(--text2)",marginBottom:16}}>Sube uno o varios CSVs de ejecuciones de NinjaTrader 8. Puedes seleccionar multiples archivos a la vez. La app agrupara Entry + Exit, calculara P&L y R automaticamente.</p>
      <div style={{marginBottom:16}}>
        <input type="file" accept=".csv" multiple onChange={handleFiles} style={{fontSize:12,color:"var(--text)"}}/>
      </div>
      {preview&&<>
        <div style={{marginBottom:12,padding:"10px 14px",background:"var(--gd)",borderRadius:8,display:"flex",gap:16,alignItems:"center"}}>
          <span style={{fontFamily:"var(--mono)",fontSize:13,color:"var(--green)",fontWeight:700}}>{preview.length} trades detectados</span>
          {fileCount>1&&<span style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--text3)"}}>{fileCount} archivos</span>}
        </div>
        {(()=>{const w=preview.filter(t=>t.resultado==="WIN"),l=preview.filter(t=>t.resultado==="SL"),b=preview.filter(t=>t.resultado==="BE");const pnl=preview.reduce((a,t)=>{const r=gR(t);return a+r},0);return<div style={{display:"flex",gap:12,marginBottom:12,flexWrap:"wrap"}}><div style={{background:"var(--surface2)",borderRadius:8,padding:"8px 14px"}}><span style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--text3)"}}>P&L </span><span style={{fontFamily:"var(--mono)",fontSize:13,fontWeight:700,color:pnl>=0?"var(--green)":"var(--red)"}}>{fmt$(Math.round(pnl*RV))}</span></div><div style={{background:"var(--surface2)",borderRadius:8,padding:"8px 14px"}}><span style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--green)"}}>{w.length}W </span><span style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--red)"}}>{l.length}L </span><span style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--yellow)"}}>{b.length}BE</span></div><div style={{background:"var(--surface2)",borderRadius:8,padding:"8px 14px"}}><span style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--text3)"}}>Win% </span><span style={{fontFamily:"var(--mono)",fontSize:13,fontWeight:700,color:w.length/preview.length>=.5?"var(--green)":"var(--red)"}}>{(w.length/preview.length*100).toFixed(2)}%</span></div></div>})()}
        <div style={{overflowX:"auto",marginBottom:16,maxHeight:300,overflowY:"auto"}}>
          <table className="tbl"><thead><tr><th>Fecha</th><th>Hora</th><th>B/S</th><th>Pts</th><th>P&L</th><th>R</th><th>Resultado</th></tr></thead>
          <tbody>{preview.slice(0,30).map((t,i)=>{const r=gR(t);return<tr key={i}>
            <td className="mono">{fmtD(t.fecha)}</td>
            <td className="mono" style={{fontSize:10}}>{t.horaInicio}→{t.horaFinal}</td>
            <td><BT bs={t.buySell}/></td>
            <td className="mono">{t.puntosSlStr}</td>
            <td className="mono bold" style={{color:r>0?"var(--green)":r<0?"var(--red)":"var(--yellow)"}}>{fmt$(Math.round(r*RV))}</td>
            <td className="mono bold" style={{color:r>0?"var(--green)":r<0?"var(--red)":"var(--yellow)"}}>{fmtR(r)}</td>
            <td><RT res={t.resultado}/></td>
          </tr>})}</tbody></table>
          {preview.length>30&&<div style={{fontSize:11,color:"var(--text3)",textAlign:"center",padding:8}}>...y {preview.length-30} mas</div>}
        </div>
        <p style={{fontSize:11,color:"var(--text3)",marginBottom:12}}>Despues de importar puedes editar cada trade para agregar setup, contexto, noticias, etc.</p>
        <div style={{display:"flex",gap:8}}>
          <button className="btn bp" onClick={doImport} disabled={importing}>{importing?"Importando...":`Importar ${preview.length} trades`}</button>
          <button className="btn bo" onClick={onClose}>Cancelar</button>
        </div>
      </>}
      {!preview&&<div className="em">Selecciona uno o mas CSVs de NinjaTrader 8</div>}
    </div>
  </div>
}

// ═══ LOGIN SCREEN ═══
function LoginScreen({onLogin}){
  const[mode,setMode]=useState("login")
  const[user,setUser]=useState("")
  const[pass,setPass]=useState("")
  const[err,setErr]=useState("")
  const[loading,setLoading]=useState(false)

  const handleLogin=async()=>{
    if(!user||!pass)return setErr("Llena ambos campos")
    setLoading(true);setErr("")
    try{
      const res=await supa(`users?username=eq.${encodeURIComponent(user)}&select=*`)
      const data=await res.json()
      if(!data.length){setErr("Usuario no existe");setLoading(false);return}
      if(data[0].password!==pass){setErr("Contrasena incorrecta");setLoading(false);return}
      localStorage.setItem("btj_user",JSON.stringify({id:data[0].id,username:data[0].username}))
      onLogin(data[0])
    }catch(e){setErr("Error de conexion")}
    setLoading(false)
  }

  const handleRegister=async()=>{
    if(!user||!pass)return setErr("Llena ambos campos")
    if(user.length<3)return setErr("Min 3 caracteres")
    if(pass.length<4)return setErr("Min 4 caracteres")
    setLoading(true);setErr("")
    try{
      const countRes=await supa("users?select=id")
      const countData=await countRes.json()
      if(countData.length>=8){setErr("Maximo 8 usuarios alcanzado");setLoading(false);return}
      const chk=await supa(`users?username=eq.${encodeURIComponent(user)}&select=id`)
      const chkD=await chk.json()
      if(chkD.length){setErr("Usuario ya existe");setLoading(false);return}
      const res=await supa("users",{method:"POST",body:JSON.stringify({username:user,password:pass})})
      const data=await res.json()
      if(data&&data[0]){localStorage.setItem("btj_user",JSON.stringify({id:data[0].id,username:data[0].username}));onLogin(data[0])}
      else setErr("Error al crear usuario")
    }catch(e){setErr("Error de conexion")}
    setLoading(false)
  }

  return<div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"var(--font)"}}>
    <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:16,padding:"40px 36px",width:360,maxWidth:"90vw"}}>
      <h1 style={{fontSize:24,fontWeight:700,color:"var(--accent)",textAlign:"center",marginBottom:4,fontFamily:"var(--mono)"}}>BT Journal</h1>
      <p style={{textAlign:"center",color:"var(--text3)",fontSize:12,marginBottom:28,fontFamily:"var(--mono)"}}>Backtesting Pro</p>
      <div style={{display:"flex",gap:4,marginBottom:20,background:"var(--bg)",borderRadius:8,padding:3}}>
        <button onClick={()=>{setMode("login");setErr("")}} style={{flex:1,padding:"8px",border:"none",borderRadius:6,background:mode==="login"?"var(--ad)":"transparent",color:mode==="login"?"var(--accent)":"var(--text3)",fontFamily:"var(--font)",fontWeight:600,fontSize:13,cursor:"pointer"}}>Entrar</button>
        <button onClick={()=>{setMode("register");setErr("")}} style={{flex:1,padding:"8px",border:"none",borderRadius:6,background:mode==="register"?"var(--ad)":"transparent",color:mode==="register"?"var(--accent)":"var(--text3)",fontFamily:"var(--font)",fontWeight:600,fontSize:13,cursor:"pointer"}}>Registrarse</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div className="field"><label>Usuario</label><input className="inp" value={user} onChange={e=>setUser(e.target.value.toLowerCase().trim())} placeholder="tu nombre" onKeyDown={e=>e.key==="Enter"&&(mode==="login"?handleLogin():handleRegister())}/></div>
        <div className="field"><label>Contrasena</label><input className="inp" type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="****" onKeyDown={e=>e.key==="Enter"&&(mode==="login"?handleLogin():handleRegister())}/></div>
        {err&&<div style={{color:"var(--red)",fontSize:12,fontFamily:"var(--mono)",textAlign:"center"}}>{err}</div>}
        <button className="btn bp" style={{width:"100%",marginTop:8,opacity:loading?.6:1}} onClick={mode==="login"?handleLogin:handleRegister} disabled={loading}>{loading?"...":(mode==="login"?"Entrar":"Crear cuenta")}</button>
      </div>
    </div>
  </div>
}

// ═══ MAIN APP (after login) ═══
function MainApp({user,onLogout}){
  const[allTrades,setAllTrades]=useState([])
  const[loading,setLoading]=useState(true)
  const[tab,setTab]=useState("dashboard")
  const[form,setForm]=useState({...DFT})
  const[editId,setEditId]=useState(null)
  const[fP,setFP]=useState("all")
  const[fS,setFS]=useState("all")
  const[fN,setFN]=useState("")
  const[viewSS,setViewSS]=useState(null)
  const[sb,setSb]=useState(window.innerWidth>900)
  const[calMonth,setCalMonth]=useState(new Date().getMonth())
  const[calYear,setCalYear]=useState(new Date().getFullYear())
  const[saving,setSaving]=useState(false)
  const[appMode,setAppMode]=useState("bt") // "bt" or "journal"
  const[showNT8,setShowNT8]=useState(false)
  const fR=useRef()
  const nt8Ref=useRef()

  // Trades filtered by current mode (bt/journal)
  const trades=useMemo(()=>allTrades.filter(t=>(t.mode||"bt")===appMode),[allTrades,appMode])

  // Load ALL trades from Supabase (both modes)
  const loadTrades=useCallback(async()=>{
    try{
      const res=await supa(`trades?user_id=eq.${user.id}&select=*&order=created_at.desc`)
      const data=await res.json()
      if(Array.isArray(data))setAllTrades(data.map(dbToTrade))
    }catch(e){console.error(e)}finally{setLoading(false)}
  },[user.id])
  useEffect(()=>{loadTrades()},[loadTrades])
  useEffect(()=>{const fn=()=>setSb(window.innerWidth>900);window.addEventListener("resize",fn);return()=>window.removeEventListener("resize",fn)},[])

  const setHI=v=>setForm(f=>({...f,horaInicio:v,duracionTrade:String(cDur(v,f.horaFinal)||"")}))
  const setHF=v=>setForm(f=>({...f,horaFinal:v,duracionTrade:String(cDur(f.horaInicio,v)||"")}))

  const save=async()=>{
    if(!form.fecha)return alert("Fecha obligatoria")
    setSaving(true)
    const t={...form,semana:String(wom(form.fecha)),duracionTrade:String(cDur(form.horaInicio,form.horaFinal)||"")}
    if(appMode==="bt"){if(t.resultado==="SL")t.rResultado="-1";if(t.resultado==="BE")t.rResultado="0"}
    else{if(t.resultado==="BE")t.rResultado="0";if(t.resultado==="SL"&&!pn(t.rResultado))t.rResultado="-1"}
    try{
      if(editId){
        await supa(`trades?id=eq.${editId}`,{method:"PATCH",body:JSON.stringify(tradeToDb(t,user.id,appMode))})
        setEditId(null)
      }else{
        await supa("trades",{method:"POST",body:JSON.stringify(tradeToDb(t,user.id,appMode))})
      }
      await loadTrades()
      setForm({...DFT});setTab("trades")
    }catch(e){alert("Error guardando: "+e.message)}finally{setSaving(false)}
  }

  const del=async id=>{if(!confirm("Eliminar?"))return;try{await supa(`trades?id=eq.${id}`,{method:"DELETE"});await loadTrades()}catch(e){alert("Error")}}
  const edit=t=>{setForm({...DFT,...t});setEditId(t.id);setTab("addTrade")}
  const goTab=t=>{setTab(t);if(window.innerWidth<=900)setSb(false);if(t==="addTrade"&&!editId)setForm({...DFT})}

  const exportCSV=()=>{const h=["fecha","horaInicio","horaFinal","duracionTrade","atr","setup","contexto","buySell","puntosSlStr","rResultado","rMaximo","resultado","breakRangoM30","direccionDia","ddPuntos","hayNoticia","noticiaHora","noticiaImpacto","noticiaTipo","m5","m15","m30","notas"];const csv=[h.join(","),...trades.map(t=>h.map(k=>`"${t[k]||""}"`).join(","))].join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=`${appMode}_journal.csv`;a.click()}

  const importCSV=async e=>{
    const f=e.target.files[0];if(!f)return
    setSaving(true)
    const reader=new FileReader()
    reader.onload=async ev=>{
      try{
        const lines=ev.target.result.split("\n").filter(Boolean);if(lines.length<2)return
        const hd=lines[0].split(",").map(h=>h.replace(/"/g,"").trim())
        const rows=lines.slice(1).map(line=>{const vs=line.match(/(".*?"|[^",]+)/g)?.map(v=>v.replace(/"/g,"").trim())||[];const o={...DFT};hd.forEach((h,i)=>{if(vs[i])o[h]=vs[i]});return o})
        for(let i=0;i<rows.length;i+=20){
          const batch=rows.slice(i,i+20).map(t=>tradeToDb(t,user.id,appMode))
          await supa("trades",{method:"POST",body:JSON.stringify(batch)})
        }
        await loadTrades()
        alert(`${rows.length} trades importados en modo ${appMode.toUpperCase()}`)
      }catch(er){alert("Error importando: "+er.message)}finally{setSaving(false)}
    }
    reader.readAsText(f)
  }

  // NT8 Import handler
  const handleNT8Import=async(parsedTrades)=>{
    setSaving(true)
    try{
      for(let i=0;i<parsedTrades.length;i+=20){
        const batch=parsedTrades.slice(i,i+20).map(t=>tradeToDb(t,user.id,"journal"))
        await supa("trades",{method:"POST",body:JSON.stringify(batch)})
      }
      await loadTrades()
      setAppMode("journal")
      alert(`${parsedTrades.length} trades importados en JOURNAL`)
    }catch(e){alert("Error importando NT8: "+e.message)}finally{setSaving(false)}
  }

  const handleFile=e=>{const f=e.target.files[0];if(!f)return;const r2=new FileReader();r2.onload=ev=>setForm(p=>({...p,screenshot:ev.target.result,screenshotPreview:ev.target.result}));r2.readAsDataURL(f)}
  const F=(l,n,type="text",opts)=>(<div className="field"><label>{l}</label>{opts?<select className="inp" value={form[n]||""} onChange={e=>setForm(f=>({...f,[n]:e.target.value}))}>{opts.map(o=><option key={o} value={o}>{o||"—"}</option>)}</select>:<input className="inp" type={type} value={form[n]||""} onChange={e=>setForm(f=>({...f,[n]:e.target.value}))} step={type==="number"?"any":undefined}/>}</div>)

  const filtered=useMemo(()=>{let ft=[...trades];if(fS!=="all")ft=ft.filter(t=>t.setup===fS);if(fN)ft=ft.slice(0,parseInt(fN)||ft.length);if(fP!=="all"){const now=new Date();if(fP==="week"){const w=new Date(now-7*864e5);ft=ft.filter(t=>new Date(t.fecha)>=w)}else if(fP==="month")ft=ft.filter(t=>{const d=new Date(t.fecha);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()});else if(fP==="year")ft=ft.filter(t=>new Date(t.fecha).getFullYear()===now.getFullYear())}return ft.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha))},[trades,fP,fS,fN])
  const stats=useMemo(()=>cS(filtered),[filtered])
  const extra=useMemo(()=>extraS(filtered),[filtered])
  const daily=useMemo(()=>grpBy(trades,t=>t.fecha),[trades])
  const weekly=useMemo(()=>grpBy(trades,t=>t.fecha?`S${wom(t.fecha)} ${getMo(t.fecha)}`:""),[trades])
  const monthly=useMemo(()=>grpBy(trades,t=>getMo(t.fecha)),[trades])
  const yearly=useMemo(()=>grpBy(trades,t=>t.fecha?`20${getYr(t.fecha)}`:""),[trades])
  const setupS=useMemo(()=>{const m={};SETUPS.forEach(s=>m[s]=cS(trades.filter(t=>t.setup===s)));return m},[trades])
  const rTaken=useMemo(()=>rDist(filtered,"rResultado"),[filtered])
  const rMx=useMemo(()=>rDist(filtered,"rMaximo"),[filtered])
  const hStats=useMemo(()=>hourAnalysis(filtered),[filtered])
  const atrSt=useMemo(()=>atrAnalysis(filtered),[filtered])
  const slSt=useMemo(()=>slAnalysis(filtered),[filtered])
  const tips=useMemo(()=>suggestions(filtered),[filtered])
  const isWin=form.resultado==="WIN",autoDur=cDur(form.horaInicio,form.horaFinal),autoWeek=wom(form.fecha),ddPct=gDD(form)
  const nav=[{id:"dashboard",l:"Dashboard",i:"◈"},{id:"calendario",l:"Calendario",i:"▦"},{id:"trades",l:"Trades",i:"☰"},{id:"addTrade",l:editId?"Editar":"Nuevo",i:"+"},{id:"estadisticas",l:"Stats",i:"▥"},{id:"setups",l:"Setups",i:"◆"},{id:"avanzado",l:"Avanzado",i:"◉"},{id:"tips",l:"Tips",i:"★"}]
  const STable=({title,data,cols,row,chart})=>(<div className="card"><div className="st">{title}</div><div style={{display:"grid",gridTemplateColumns:chart?"minmax(0,1.3fr) minmax(0,1fr)":"1fr",gap:16}}><div style={{overflowX:"auto"}}><table className="tbl"><thead><tr>{cols.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{data.map((d,i)=><tr key={i}>{row(d).map((c,j)=>{if(Array.isArray(c))return<td key={j} className={`mono ${c[1]} ${c[2]?"bold":""}`}>{c[0]}</td>;return<td key={j} className="mono">{c}</td>})}</tr>)}</tbody></table>{!data.length&&<div className="em">Sin datos</div>}</div>{chart&&<BC data={chart.slice(0,12).reverse().map(w=>w.totalR)} labels={chart.slice(0,12).reverse().map(w=>w.key)} unit="R"/>}</div></div>)
  const Filters=()=><div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}><select className="inp" style={{width:"auto"}} value={fS} onChange={e=>setFS(e.target.value)}><option value="all">All</option>{SETUPS.map(s=><option key={s} value={s}>{s}</option>)}</select><div className="pb">{["all","week","month","year"].map(p=><button key={p} className={`pbtn ${fP===p?"active":""}`} onClick={()=>setFP(p)}>{{all:"Todo",week:"7d",month:"Mes",year:"Ano"}[p]}</button>)}</div><select className="inp" style={{width:"auto"}} value={fN} onChange={e=>setFN(e.target.value)}><option value="">All</option><option value="10">10</option><option value="20">20</option><option value="50">50</option></select></div>

  if(loading)return<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--bg)"}}><div style={{color:"var(--accent)",fontFamily:"var(--mono)",fontSize:16}}>Cargando trades...</div></div>

  const accentColor=appMode==="journal"?"var(--purple)":"var(--accent)"
  const modeLabel=appMode==="bt"?"BACKTESTING":"JOURNAL"

  return(<>
    {viewSS&&<div className="ss-modal" onClick={()=>setViewSS(null)}><img src={viewSS}/></div>}
    {showNT8&&<NT8ImportModal onImport={handleNT8Import} onClose={()=>setShowNT8(false)}/>}
    {sb&&window.innerWidth<=900&&<div className="overlay" onClick={()=>setSb(false)}/>}
    <div className="mobile-bar"><button onClick={()=>setSb(!sb)} style={{background:"none",border:"none",color:"var(--text)",fontSize:20,cursor:"pointer"}}>☰</button><span style={{fontWeight:700,color:accentColor,fontFamily:"var(--mono)"}}>BT JOURNAL <span style={{fontSize:10,color:appMode==="journal"?"var(--purple)":"var(--accent)"}}>{modeLabel}</span></span><div style={{width:28}}/></div>
    <div className={`sidebar ${sb?"open":"closed"}`}>
      <div className="sb-brand">
        <h1 style={{color:accentColor}}>BT Journal</h1>
        <p style={{color:"var(--green)"}}>{user.username}</p>
      </div>
      <div style={{padding:"10px 8px 0"}}>
        <ModeToggle mode={appMode} setMode={m=>{setAppMode(m);setTab("dashboard");setEditId(null);setForm({...DFT})}}/>
        <div style={{textAlign:"center",fontSize:9,fontFamily:"var(--mono)",color:appMode==="journal"?"var(--purple)":"var(--accent)",marginBottom:6,fontWeight:600,letterSpacing:1}}>{modeLabel}</div>
      </div>
      <nav className="sb-nav">{nav.map(n=><button key={n.id} className={`sb-btn ${tab===n.id?"active":""}`} onClick={()=>goTab(n.id)}><span style={{fontFamily:"var(--mono)",fontSize:14,width:18,textAlign:"center"}}>{n.i}</span><span>{n.l}</span></button>)}</nav>
      <div className="sb-footer">
        <button onClick={exportCSV}>Exportar CSV</button>
        <label>Importar CSV<input type="file" accept=".csv" onChange={importCSV} style={{display:"none"}}/></label>
        {appMode==="journal"&&<button onClick={()=>setShowNT8(true)} style={{color:"var(--purple)",borderColor:"var(--pd)",background:"var(--pd)"}}>Importar NT8</button>}
        <button onClick={()=>{localStorage.removeItem("btj_user");onLogout()}} style={{color:"var(--red)"}}>Cerrar sesion</button>
      </div>
    </div>
    <div className={`main ${!sb||window.innerWidth<=900?"full":""}`}>
    {saving&&<div style={{position:"fixed",top:60,right:20,background:"var(--ad)",color:"var(--accent)",padding:"8px 16px",borderRadius:8,fontFamily:"var(--mono)",fontSize:12,zIndex:999}}>Guardando...</div>}

{tab==="dashboard"&&<><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:10}}><div><h1 className="pt">Dashboard <span style={{fontSize:16,fontFamily:"var(--mono)",color:accentColor,fontWeight:600}}>{modeLabel}</span></h1><p className="ps">{trades.length} trades | 1R={fmt$(RV)}</p></div><Filters/></div>
<div className="metrics"><MC label="P&L" value={`${stats.totalR>=0?"+":""}${stats.totalR}R`} sub={fmt$(stats.totalDollar)} color={stats.totalR>=0?"var(--green)":"var(--red)"} big/><MC label="Win rate" value={`${stats.winRate.toFixed(2)}%`} color={stats.winRate>=50?"var(--green)":"var(--red)"} sub={`${stats.wins}W|${stats.losses}L|${stats.bes}BE`}/><MC label="PF" value={fmtPF(stats.profitFactor)} color={stats.profitFactor>=1.5?"var(--green)":stats.profitFactor>=1?"var(--yellow)":"var(--red)"}/><MC label="Expectancy" value={`${stats.expectancy}R`} color={stats.expectancy>0?"var(--green)":"var(--red)"} sub={fmt$(stats.expectDollar)+"/trade"}/><MC label="Sharpe" value={stats.sharpeRatio.toFixed(2)} color={stats.sharpeRatio>=1?"var(--green)":stats.sharpeRatio>=.5?"var(--yellow)":"var(--red)"}/><MC label="Recovery" value={stats.recoveryFactor===Infinity?"∞":stats.recoveryFactor.toFixed(2)} color={stats.recoveryFactor>=2?"var(--green)":"var(--yellow)"} sub={`MaxDD:${stats.maxEquityDD||0}R`}/><MC label="Payoff" value={stats.payoffRatio===Infinity?"∞":stats.payoffRatio.toFixed(2)} color={stats.payoffRatio>=2?"var(--green)":"var(--yellow)"}/><MC label="Trades" value={stats.total} sub={stats.sampleValid?"Muestra OK":"Min 30"} color={stats.sampleValid?"var(--green)":"var(--yellow)"}/></div>
<div className="card"><div className="st">Resumen</div><div className="info-grid"><div className="info-item"><div className="ml">Dia + ganador</div><div className="val" style={{color:"var(--green)"}}>{extra.bestDay}</div></div><div className="info-item"><div className="ml">Dia + perdedor</div><div className="val" style={{color:"var(--red)"}}>{extra.worstDay}</div></div><div className="info-item"><div className="ml">Ops/dia</div><div className="val">{extra.avgOps}</div></div><div className="info-item"><div className="ml">Mejor dia sem</div><div className="val" style={{color:"var(--green)"}}>{extra.bestWd}</div></div><div className="info-item"><div className="ml">Peor dia sem</div><div className="val" style={{color:"var(--red)"}}>{extra.worstWd}</div></div><div className="info-item"><div className="ml">Racha WIN</div><div className="val" style={{color:"var(--green)"}}>{stats.maxWinStreak}{stats.curWinStreak>1?` (now:${stats.curWinStreak})`:""}</div></div><div className="info-item"><div className="ml">Racha LOSS</div><div className="val" style={{color:"var(--red)"}}>{stats.maxLossStreak}{stats.curLossStreak>1?` (now:${stats.curLossStreak})`:""}</div></div><div className="info-item"><div className="ml">Dur WIN/SL/BE</div><div className="val">{stats.avgDurWin}/{stats.avgDurSL}/{stats.avgDurBE}min</div></div></div></div>
<div className="g2" style={{marginBottom:14}}><div className="card"><div className="st">Equity</div><EC trades={filtered}/></div><div className="card"><div className="st">Resultados</div><div style={{display:"flex",gap:20,flexWrap:"wrap"}}>{[["WIN",stats.wins,"var(--green)"],["SL",stats.losses,"var(--red)"],["BE",stats.bes,"var(--yellow)"]].map(([l,v,c])=><div key={l} style={{textAlign:"center"}}><div style={{fontSize:26,fontWeight:700,fontFamily:"var(--mono)",color:c}}>{stats.total?Math.round(v/stats.total*10000)/100:0}%</div><div style={{fontSize:10,color:"var(--text3)",fontFamily:"var(--mono)"}}>{l}({v})</div></div>)}</div></div></div>
<div className="card"><div className="st">P&L diario</div><BC data={daily.slice(0,20).reverse().map(d=>d.totalR)} labels={daily.slice(0,20).reverse().map(d=>fmtD(d.key))} unit="R"/></div>
<div className="card"><div className="ch"><span className="st" style={{margin:0}}>Recientes</span><button className="btn bo bx" onClick={()=>setTab("trades")}>Todos</button></div><div style={{overflowX:"auto"}}><table className="tbl"><thead><tr><th>Fecha</th><th>Setup</th><th>B/S</th><th>R</th><th>Rmax</th><th>P&L</th><th>Res</th><th>DD%</th><th>Dir</th></tr></thead><tbody>{filtered.slice(0,8).map(t=>{const r=gR(t),dd=gDD(t);return<tr key={t.id} style={{cursor:"pointer"}} onClick={()=>edit(t)}><td className="mono">{fmtD(t.fecha)}</td><td><ST s={t.setup}/></td><td><BT bs={t.buySell}/></td><td className="mono bold" style={{color:r>0?"var(--green)":r<0?"var(--red)":"var(--yellow)"}}>{fmtR(r)}</td><td className="mono" style={{color:"var(--purple)"}}>{pn(t.rMaximo)>0?t.rMaximo+"R":""}</td><td className="mono bold" style={{color:r>=0?"var(--green)":"var(--red)"}}>{fmt$(r*RV)}</td><td><RT res={t.resultado}/></td><td className="mono" style={{color:"var(--purple)"}}>{dd!==null?dd+"%":""}</td><td><DT2 dir={t.direccionDia}/></td></tr>})}</tbody></table></div>{!filtered.length&&<div className="em">Sin trades en {modeLabel}</div>}</div></>}

{tab==="calendario"&&<><h1 className="pt" style={{marginBottom:20}}>Calendario <span style={{fontSize:16,fontFamily:"var(--mono)",color:accentColor,fontWeight:600}}>{modeLabel}</span></h1><Calendar trades={trades} month={calMonth} year={calYear} onPrev={()=>{if(calMonth===0){setCalMonth(11);setCalYear(calYear-1)}else setCalMonth(calMonth-1)}} onNext={()=>{if(calMonth===11){setCalMonth(0);setCalYear(calYear+1)}else setCalMonth(calMonth+1)}}/></>}

{tab==="trades"&&<><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}><h1 className="pt">Trades <span style={{fontSize:16,fontFamily:"var(--mono)",color:accentColor,fontWeight:600}}>{modeLabel}</span></h1><div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}><Filters/><button className="btn bp bs" onClick={()=>goTab("addTrade")}>+ Nuevo</button>{appMode==="journal"&&<button className="btn bs" style={{background:"var(--pd)",color:"var(--purple)"}} onClick={()=>setShowNT8(true)}>NT8</button>}</div></div><div className="card" style={{overflowX:"auto"}}><table className="tbl" style={{minWidth:1200}}><thead><tr>{["Fecha","S","Hora","Dur","Setup","Ctx","B/S","SL","R","Rmax","P&L","Res","DD","DD%","Brk","Dir","News","M5","M15","M30","",""].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{filtered.map(t=>{const r=gR(t),dd=gDD(t);return<tr key={t.id}><td className="mono">{fmtD(t.fecha)}</td><td className="mono">S{wom(t.fecha)}</td><td className="mono" style={{fontSize:10}}>{t.horaInicio}→{t.horaFinal}</td><td className="mono">{t.duracionTrade?t.duracionTrade+"m":""}</td><td><ST s={t.setup}/></td><td style={{fontSize:10}}>{t.contexto}</td><td><BT bs={t.buySell}/></td><td className="mono">{t.puntosSlStr}</td><td className="mono bold" style={{color:r>0?"var(--green)":r<0?"var(--red)":"var(--yellow)"}}>{fmtR(r)}</td><td className="mono" style={{color:"var(--purple)"}}>{pn(t.rMaximo)>0?t.rMaximo+"R":""}</td><td className="mono bold" style={{color:r>=0?"var(--green)":"var(--red)"}}>{fmt$(r*RV)}</td><td><RT res={t.resultado}/></td><td className="mono">{t.ddPuntos}</td><td className="mono" style={{color:"var(--purple)"}}>{dd!==null?dd+"%":""}</td><td>{t.breakRangoM30}</td><td><DT2 dir={t.direccionDia}/></td><td>{t.hayNoticia==="SI"?<span className="tag tp" style={{fontSize:8}}>{t.noticiaHora}</span>:""}</td><td className="mono">{t.m5}</td><td className="mono">{t.m15}</td><td className="mono">{t.m30}</td><td>{t.screenshot?<span style={{cursor:"pointer",color:"var(--accent)"}} onClick={()=>setViewSS(t.screenshot)}>Img</span>:""}</td><td><div style={{display:"flex",gap:3}}><button className="btn bo bx" onClick={()=>edit(t)}>E</button><button className="btn bd bx" onClick={()=>del(t.id)}>X</button></div></td></tr>})}</tbody></table>{!filtered.length&&<div className="em">Sin trades en {modeLabel}</div>}</div></>}

{tab==="addTrade"&&<><h1 className="pt" style={{marginBottom:16}}>{editId?"Editar":"Nuevo trade"} <span style={{fontSize:16,fontFamily:"var(--mono)",color:accentColor,fontWeight:600}}>{modeLabel}</span></h1>
<div className="card"><div className="st">General</div><div className="form-grid">{F("Fecha","fecha","date")}<div className="field"><label>Semana</label><div className="af">S{autoWeek||"-"}</div></div><TP label="Hora inicio" value={form.horaInicio} onChange={setHI}/><TP label="Hora final" value={form.horaFinal} onChange={setHF}/><div className="field"><label>Duracion</label><div className="af">{autoDur?autoDur+"m":"-"}</div></div>{F("ATR","atr","number")}</div></div>
<div className="card"><div className="st">Trade</div><div className="form-grid">{F("Setup","setup",null,SETUPS)}{F("Contexto","contexto",null,CTXS)}{F("Buy/Sell","buySell",null,["BUY","SELL"])}{F("Puntos SL","puntosSlStr","number")}{F("DD pts","ddPuntos","number")}<div className="field"><label>DD%</label><div className="af" style={{color:ddPct!==null&&ddPct>50?"var(--red)":"var(--purple)"}}>{ddPct!==null?ddPct+"%":"-"}</div></div></div></div>
<div className="card"><div className="st">Resultado</div><div className="form-grid">{F("Resultado","resultado",null,RESS)}{(isWin||(appMode==="journal"&&form.resultado==="SL"))&&F("R ganados","rResultado","number")}{isWin&&F("R max mov","rMaximo","number")}{F("Break M30","breakRangoM30",null,["NO","SI"])}{F("Direccion","direccionDia",null,DIRS)}</div>{form.resultado==="SL"&&<p style={{marginTop:10,fontSize:12,color:"var(--red)",fontFamily:"var(--mono)"}}>{appMode==="bt"?`SL=-1R=-${fmt$(RV)}`:`SL=${pn(form.rResultado)?form.rResultado+"R="+fmt$(pn(form.rResultado)*RV):"-1R=-"+fmt$(RV)}`}</p>}{form.resultado==="BE"&&<p style={{marginTop:10,fontSize:12,color:"var(--yellow)",fontFamily:"var(--mono)"}}>BE=0R</p>}{isWin&&pn(form.rResultado)>0&&<p style={{marginTop:10,fontSize:12,color:"var(--green)",fontFamily:"var(--mono)"}}>+{form.rResultado}R=+{fmt$(pn(form.rResultado)*RV)}{pn(form.rMaximo)>0?` (max ${form.rMaximo}R)`:""}</p>}</div>
<div className="card"><div className="st">Noticias</div><div className="form-grid">{F("Noticia?","hayNoticia",null,["NO","SI"])}{form.hayNoticia==="SI"&&F("Hora","noticiaHora",null,NHS)}{form.hayNoticia==="SI"&&F("Impacto","noticiaImpacto",null,NIS)}{form.hayNoticia==="SI"&&F("Tipo","noticiaTipo",null,NTS)}</div></div>
<div className="card"><div className="st">ORB</div><div className="form-grid" style={{gridTemplateColumns:"repeat(3,1fr)"}}>{F("M5","m5","number")}{F("M15","m15","number")}{F("M30","m30","number")}</div></div>
<div className="card"><div className="st">Screenshot & Notas</div><div className="g2"><div><input ref={fR} type="file" accept="image/*" onChange={handleFile} style={{display:"none"}}/><div className="uz" onClick={()=>fR.current?.click()}>{form.screenshotPreview?<img src={form.screenshotPreview}/>:<span style={{fontSize:12}}>Subir img</span>}</div>{form.screenshotPreview&&<button className="btn bd bx" style={{marginTop:6}} onClick={()=>setForm(f=>({...f,screenshot:null,screenshotPreview:null}))}>Quitar</button>}</div><div className="field"><label>Notas</label><textarea className="inp" value={form.notas||""} onChange={e=>setForm(f=>({...f,notas:e.target.value}))}/></div></div></div>
<div style={{display:"flex",gap:10}}><button className="btn bp" onClick={save} disabled={saving}>{saving?"Guardando...":editId?"Guardar":"Registrar"}</button>{editId&&<button className="btn bo" onClick={()=>{setEditId(null);setForm({...DFT});setTab("trades")}}>Cancelar</button>}</div></>}

{tab==="estadisticas"&&<><h1 className="pt" style={{marginBottom:14}}>Stats <span style={{fontSize:16,fontFamily:"var(--mono)",color:accentColor,fontWeight:600}}>{modeLabel}</span></h1><div style={{marginBottom:12}}><Filters/></div>
<STable title="Dia" data={daily.slice(0,30)} cols={["Fecha","N","W","L","Win%","R","P&L","PF"]} row={d=>[fmtD(d.key),d.total,[d.wins,"g"],[d.losses,"r"],[`${d.winRate.toFixed(2)}%`,d.winRate>=50?"g":"r"],[`${d.totalR>0?"+":""}${d.totalR}R`,d.totalR>=0?"g":"r",true],[fmt$(d.totalDollar),d.totalDollar>=0?"g":"r"],fmtPF(d.profitFactor)]}/>
<STable title="Semana" data={weekly} cols={["Sem","N","Win%","R","P&L","PF"]} row={w=>[w.key,w.total,[`${w.winRate.toFixed(2)}%`,w.winRate>=50?"g":"r"],[`${w.totalR>0?"+":""}${w.totalR}R`,w.totalR>=0?"g":"r",true],[fmt$(w.totalDollar),w.totalDollar>=0?"g":"r"],fmtPF(w.profitFactor)]} chart={weekly}/>
<STable title="Mes" data={monthly} cols={["Mes","N","Win%","R","P&L","PF"]} row={m=>[m.key,m.total,[`${m.winRate.toFixed(2)}%`,m.winRate>=50?"g":"r"],[`${m.totalR>0?"+":""}${m.totalR}R`,m.totalR>=0?"g":"r",true],[fmt$(m.totalDollar),m.totalDollar>=0?"g":"r"],fmtPF(m.profitFactor)]} chart={monthly}/>
<STable title="Ano" data={yearly} cols={["Ano","N","Win%","R","P&L","PF"]} row={y=>[y.key,y.total,[`${y.winRate.toFixed(2)}%`,y.winRate>=50?"g":"r"],[`${y.totalR>0?"+":""}${y.totalR}R`,y.totalR>=0?"g":"r",true],[fmt$(y.totalDollar),y.totalDollar>=0?"g":"r"],fmtPF(y.profitFactor)]} chart={yearly}/></>}

{tab==="setups"&&<><h1 className="pt" style={{marginBottom:14}}>Setups <span style={{fontSize:16,fontFamily:"var(--mono)",color:accentColor,fontWeight:600}}>{modeLabel}</span></h1><div className="g2" style={{marginBottom:14}}>{SETUPS.map(su=>{const s2=setupS[su];return<div key={su} className={`card sc ${s2.totalR>0?"profit":s2.total?"loss":""}`}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{fontSize:16,fontWeight:700,color:accentColor,fontFamily:"var(--mono)"}}>{su}</span><span className="tag ta">{s2.total}</span></div><div className="g3" style={{gap:8}}>{[["Win%",`${s2.winRate.toFixed(2)}%`,s2.winRate>=50?"var(--green)":"var(--red)"],["P&L",`${s2.totalR>0?"+":""}${s2.totalR}R`,s2.totalR>=0?"var(--green)":"var(--red)"],["PF",fmtPF(s2.profitFactor),s2.profitFactor>=1.5?"var(--green)":"var(--red)"]].map(([l,v,c])=><div key={l}><div className="ml">{l}</div><div style={{fontSize:18,fontWeight:700,fontFamily:"var(--mono)",color:c}}>{v}</div></div>)}</div><div className="g3" style={{gap:8,marginTop:10,borderTop:"1px solid var(--border)",paddingTop:10}}>{[["Exp",`${s2.expectancy}R(${fmt$(s2.expectDollar)})`,s2.expectancy>=0?"var(--green)":"var(--red)"],["Best",`+${s2.bestR}R`,"var(--green)"],["DD",`${s2.avgDDpct}%`,"var(--purple)"]].map(([l,v,c])=><div key={l}><div className="ml">{l}</div><div style={{fontSize:13,fontWeight:600,fontFamily:"var(--mono)",color:c}}>{v}</div></div>)}</div></div>})}</div><div className="card"><div className="st">Win% por setup</div><BC data={SETUPS.map(s=>setupS[s].winRate)} labels={SETUPS} height={120} unit="%"/></div><div className="card"><div className="st">P&L por setup</div><BC data={SETUPS.map(s=>setupS[s].totalR)} labels={SETUPS} height={120} unit="R"/></div></>}

{tab==="avanzado"&&<><h1 className="pt" style={{marginBottom:14}}>Avanzado <span style={{fontSize:16,fontFamily:"var(--mono)",color:accentColor,fontWeight:600}}>{modeLabel}</span></h1><div style={{marginBottom:12}}><Filters/></div>
<div className="g2" style={{marginBottom:14}}><div className="card"><div className="st">R tomados</div>{rTaken.lvl.length?<><BC data={rTaken.pct} labels={rTaken.lvl} height={110} unit="%" colors={rTaken.lvl.map(()=>"var(--green)")}/><div style={{overflowX:"auto",marginTop:10}}><table className="tbl"><thead><tr><th>R</th><th>N</th><th>%</th></tr></thead><tbody>{rTaken.lvl.map((l,i)=><tr key={l}><td className="mono g bold">{l}</td><td className="mono">{rTaken.cnt[i]}</td><td className="mono">{rTaken.pct[i]}%</td></tr>)}</tbody></table></div></>:<div className="em">Sin wins</div>}</div><div className="card"><div className="st">R maximo mov</div>{rMx.lvl.length?<><BC data={rMx.pct} labels={rMx.lvl} height={110} unit="%" colors={rMx.lvl.map(()=>"var(--purple)")}/><div style={{overflowX:"auto",marginTop:10}}><table className="tbl"><thead><tr><th>Rmax</th><th>N</th><th>%</th></tr></thead><tbody>{rMx.lvl.map((l,i)=><tr key={l}><td className="mono bold" style={{color:"var(--purple)"}}>{l}</td><td className="mono">{rMx.cnt[i]}</td><td className="mono">{rMx.pct[i]}%</td></tr>)}</tbody></table></div></>:<div className="em">Sin datos Rmax</div>}</div></div>
{rTaken.lvl.length>0&&rMx.lvl.length>0&&<div className="card"><div className="st">R tomado vs R maximo</div><div style={{overflowX:"auto"}}><table className="tbl"><thead><tr><th>Nivel</th><th>%Tomado</th><th>%Max</th><th>Diff</th></tr></thead><tbody>{[...new Set([...rTaken.lvl,...rMx.lvl])].sort((a,b)=>parseInt(a)-parseInt(b)).map(l=>{const ti=rTaken.lvl.indexOf(l),mi=rMx.lvl.indexOf(l),tp=ti>=0?rTaken.pct[ti]:0,mp=mi>=0?rMx.pct[mi]:0;return<tr key={l}><td className="mono bold">{l}</td><td className="mono g">{tp}%</td><td className="mono" style={{color:"var(--purple)"}}>{mp}%</td><td className="mono y">{mp>tp?`+${(mp-tp).toFixed(2)}%`:"-"}</td></tr>})}</tbody></table></div></div>}
<div className="card"><div className="st">Por hora de entrada</div>{hStats.length?<><div style={{overflowX:"auto"}}><table className="tbl"><thead><tr><th>Hora</th><th>N</th><th>Win%</th><th>SL%</th><th>BE%</th><th>R</th><th>PF</th><th>Rmax avg</th></tr></thead><tbody>{hStats.map(h=><tr key={h.hour}><td className="mono bold">{h.hour}</td><td className="mono">{h.total}</td><td className={`mono ${h.winRate>=50?"g":"r"}`}>{h.winRate.toFixed(2)}%</td><td className="mono r">{h.total?Math.round(h.losses/h.total*10000)/100:0}%</td><td className="mono y">{h.total?Math.round(h.bes/h.total*10000)/100:0}%</td><td className={`mono bold ${h.totalR>=0?"g":"r"}`}>{h.totalR>0?"+":""}{h.totalR}R</td><td className="mono">{fmtPF(h.profitFactor)}</td><td className="mono" style={{color:"var(--purple)"}}>{h.avgRmax?h.avgRmax+"R":"-"}</td></tr>)}</tbody></table></div><div style={{marginTop:12}}><BC data={hStats.map(h=>h.winRate)} labels={hStats.map(h=>h.hour)} height={110} unit="%" colors={hStats.map(h=>h.winRate>=50?"var(--green)":"var(--red)")}/></div><div className="info-grid" style={{marginTop:12}}>{(()=>{if(!hStats.length)return null;const best=hStats.filter(h=>h.total>=2).reduce((a,x)=>x.totalR>a.totalR?x:a,hStats[0]);const worst=hStats.filter(h=>h.total>=2).reduce((a,x)=>x.totalR<a.totalR?x:a,hStats[0]);return<><div className="info-item"><div className="ml">Mejor hora</div><div className="val" style={{color:"var(--green)"}}>{best.hour} ({best.winRate.toFixed(2)}%WR)</div></div><div className="info-item"><div className="ml">Peor hora</div><div className="val" style={{color:"var(--red)"}}>{worst.hour} ({worst.winRate.toFixed(2)}%WR)</div></div></>})()}</div></>:<div className="em">Sin datos</div>}</div>
<div className="card"><div className="st">Por ATR</div>{atrSt.length?<div style={{overflowX:"auto"}}><table className="tbl"><thead><tr><th>ATR</th><th>N</th><th>Win%</th><th>R</th><th>PF</th></tr></thead><tbody>{atrSt.map(a=><tr key={a.range}><td className="mono bold">{a.range}</td><td className="mono">{a.total}</td><td className={`mono ${a.winRate>=50?"g":"r"}`}>{a.winRate.toFixed(2)}%</td><td className={`mono bold ${a.totalR>=0?"g":"r"}`}>{a.totalR>0?"+":""}{a.totalR}R</td><td className="mono">{fmtPF(a.profitFactor)}</td></tr>)}</tbody></table></div>:<div className="em">Sin datos</div>}</div>
<div className="card"><div className="st">Por SL pts</div>{slSt.length?<div style={{overflowX:"auto"}}><table className="tbl"><thead><tr><th>SL</th><th>N</th><th>Win%</th><th>R</th><th>PF</th></tr></thead><tbody>{slSt.map(s2=><tr key={s2.range}><td className="mono bold">{s2.range}</td><td className="mono">{s2.total}</td><td className={`mono ${s2.winRate>=50?"g":"r"}`}>{s2.winRate.toFixed(2)}%</td><td className={`mono bold ${s2.totalR>=0?"g":"r"}`}>{s2.totalR>0?"+":""}{s2.totalR}R</td><td className="mono">{fmtPF(s2.profitFactor)}</td></tr>)}</tbody></table></div>:<div className="em">Sin datos</div>}</div>
<div className="card"><div className="st">Por direccion</div><div className="g3">{DIRS.map(dir=>{const ds=cS(filtered.filter(t=>t.direccionDia===dir));return<div key={dir} style={{background:"var(--bg)",borderRadius:"var(--radius)",padding:12}}><DT2 dir={dir}/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:10}}>{[["N",ds.total],["Win%",`${ds.winRate.toFixed(2)}%`,ds.winRate>=50?"var(--green)":"var(--red)"],["R",`${ds.totalR>0?"+":""}${ds.totalR}R`,ds.totalR>=0?"var(--green)":"var(--red)"],["PF",fmtPF(ds.profitFactor)]].map(([l,v,c])=><div key={l}><div className="ml">{l}</div><div style={{fontWeight:600,fontFamily:"var(--mono)",color:c}}>{v}</div></div>)}</div></div>})}</div></div></>}

{tab==="tips"&&<><h1 className="pt" style={{marginBottom:14}}>Tips <span style={{fontSize:16,fontFamily:"var(--mono)",color:accentColor,fontWeight:600}}>{modeLabel}</span></h1><p className="ps" style={{marginBottom:16}}>Basado en {filtered.length} trades</p>{tips.length?tips.map((t,i)=>{const cs={green:{bg:"rgba(0,214,143,.08)",b:"var(--green)"},red:{bg:"rgba(255,71,87,.08)",b:"var(--red)"},yellow:{bg:"rgba(255,192,72,.08)",b:"var(--yellow)"},blue:{bg:"rgba(76,154,255,.08)",b:"var(--accent)"}}[t.type]||{bg:"var(--surface2)",b:"var(--border)"};return<div key={i} className="tip-card" style={{background:cs.bg,borderLeft:`3px solid ${cs.b}`}}><div className="dot" style={{background:cs.b,width:8,height:8,borderRadius:"50%",flexShrink:0,marginTop:5}}/><span>{t.text}</span></div>}):<div className="em">Min 5 trades para tips</div>}</>}

    </div>
  </>)
}

// ═══ ROOT APP ═══
function App(){
  const[user,setUser]=useState(()=>{try{return JSON.parse(localStorage.getItem("btj_user"))}catch{return null}})
  return<>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');:root{--bg:#0a0e14;--surface:#12171f;--surface2:#1a2030;--border:#1e2738;--border2:#2a3548;--text:#d4dae4;--text2:#8892a4;--text3:#5a6478;--accent:#4c9aff;--accent2:#2d7adf;--ad:rgba(76,154,255,.12);--green:#00d68f;--gd:rgba(0,214,143,.12);--red:#ff4757;--rd:rgba(255,71,87,.12);--yellow:#ffc048;--yd:rgba(255,192,72,.12);--purple:#a78bfa;--pd:rgba(167,139,250,.12);--font:'DM Sans',sans-serif;--mono:'JetBrains Mono',monospace;--radius:10px;--rlg:14px}*{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg);color:var(--text);font-family:var(--font);font-size:14px;-webkit-font-smoothing:antialiased}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}.shell{display:flex;min-height:100vh}.sidebar{width:240px;background:var(--surface);border-right:1px solid var(--border);position:fixed;top:0;left:0;bottom:0;display:flex;flex-direction:column;z-index:100;transition:transform .25s}.sidebar.closed{transform:translateX(-240px)}.main{margin-left:240px;padding:28px 36px 60px;flex:1;min-width:0}.main.full{margin-left:0}.mobile-bar{display:none;position:fixed;top:0;left:0;right:0;height:52px;background:var(--surface);border-bottom:1px solid var(--border);z-index:101;align-items:center;padding:0 16px;justify-content:space-between}@media(max-width:900px){.mobile-bar{display:flex}.main{margin-left:0;padding:68px 16px 40px}.sidebar{transform:translateX(-240px)}.sidebar.open{transform:translateX(0)}}.overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99}.ss-modal{position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer}.ss-modal img{max-width:92vw;max-height:92vh;border-radius:var(--radius)}.sb-brand{padding:24px 20px 16px;border-bottom:1px solid var(--border)}.sb-brand h1{font-size:20px;font-weight:700;color:var(--accent);letter-spacing:-.5px}.sb-brand p{font-size:11px;color:var(--text3);margin-top:4px;font-family:var(--mono);text-transform:uppercase;letter-spacing:1px}.sb-nav{flex:1;padding:8px;display:flex;flex-direction:column;gap:1px;overflow-y:auto}.sb-btn{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;background:transparent;color:var(--text2);border:none;cursor:pointer;font:inherit;font-size:12px;font-weight:500;border-radius:7px;transition:all .15s;text-align:left}.sb-btn:hover{background:var(--surface2);color:var(--text)}.sb-btn.active{background:var(--ad);color:var(--accent)}.sb-footer{padding:12px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:6px}.sb-footer button,.sb-footer label{display:block;width:100%;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:7px;color:var(--text2);font:inherit;font-size:11px;font-weight:500;cursor:pointer;text-align:center}.sb-footer button:hover,.sb-footer label:hover{background:var(--border);color:var(--text)}.pt{font-size:28px;font-weight:700;letter-spacing:-.5px}.ps{color:var(--text2);font-size:13px;margin-top:2px}.st{font-size:13px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px;font-family:var(--mono)}.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--rlg);padding:20px;margin-bottom:16px}.ch{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-bottom:20px}.mc{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px}.ml{font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.8px;font-family:var(--mono);margin-bottom:6px}.mv{font-size:20px;font-weight:700;font-family:var(--mono);letter-spacing:-.5px;line-height:1}.mv.big{font-size:26px}.ms{font-size:10px;color:var(--text3);margin-top:5px;font-family:var(--mono)}.tag{display:inline-block;padding:3px 8px;border-radius:5px;font-size:10px;font-weight:600;font-family:var(--mono)}.tg{background:var(--gd);color:var(--green)}.tr{background:var(--rd);color:var(--red)}.ty{background:var(--yd);color:var(--yellow)}.ta{background:var(--ad);color:var(--accent)}.tp{background:var(--pd);color:var(--purple)}.tbl{width:100%;border-collapse:collapse;font-size:12px}.tbl th{text-align:left;padding:8px 10px;border-bottom:1px solid var(--border);color:var(--text3);font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:.8px;font-family:var(--mono);white-space:nowrap}.tbl td{padding:8px 10px;border-bottom:1px solid var(--border)}.tbl tr:hover td{background:var(--surface2)}.tbl .mono{font-family:var(--mono)}.tbl .g{color:var(--green)}.tbl .r{color:var(--red)}.tbl .y{color:var(--yellow)}.tbl .bold{font-weight:600}.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px}.field{display:flex;flex-direction:column;gap:4px}.field label{font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;font-weight:600;font-family:var(--mono)}.inp{background:var(--bg);border:1px solid var(--border2);border-radius:7px;color:var(--text);padding:9px 11px;font:inherit;font-size:13px;width:100%;outline:none}.inp:focus{border-color:var(--accent)}select.inp{cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235a6478' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:28px}textarea.inp{resize:vertical;min-height:100px}input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(.6)}.btn{border:none;border-radius:7px;padding:9px 20px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s}.bp{background:var(--accent);color:#fff}.bp:hover{background:var(--accent2)}.bo{background:transparent;color:var(--text2);border:1px solid var(--border2)}.bo:hover{background:var(--surface2)}.bd{background:var(--rd);color:var(--red)}.bd:hover{background:var(--red);color:#fff}.bs{padding:5px 11px;font-size:11px}.bx{padding:3px 7px;font-size:10px}.pb{display:flex;gap:3px;background:var(--surface);border:1px solid var(--border);border-radius:7px;padding:2px}.pbtn{padding:5px 12px;border:none;background:transparent;color:var(--text3);font:inherit;font-size:11px;font-weight:500;cursor:pointer;border-radius:5px}.pbtn.active{background:var(--ad);color:var(--accent)}.em{text-align:center;padding:24px;color:var(--text3);font-size:12px}.g2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}@media(max-width:700px){.g2,.g3{grid-template-columns:1fr}}.uz{border:2px dashed var(--border2);border-radius:var(--radius);padding:20px;text-align:center;cursor:pointer;color:var(--text3);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:70px}.uz:hover{border-color:var(--accent)}.uz img{max-width:100%;max-height:120px;border-radius:7px}.sc{border-left:3px solid var(--border2)}.sc.profit{border-left-color:var(--green)}.sc.loss{border-left-color:var(--red)}.af{background:var(--surface2);border:1px solid var(--border);border-radius:7px;padding:9px 11px;font-family:var(--mono);font-size:13px;color:var(--accent)}.info-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:14px}.info-item{background:var(--bg);border-radius:7px;padding:12px}.info-item .val{font-family:var(--mono);font-weight:600;font-size:13px;margin-top:4px}.tip-card{padding:12px 14px;border-radius:8px;margin-bottom:8px;font-size:12px;display:flex;align-items:flex-start;gap:10px}@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.card,.mc{animation:fadeIn .3s ease both}`}</style>
    <div className="shell">
      {user?<MainApp user={user} onLogout={()=>{localStorage.removeItem("btj_user");setUser(null)}}/>:<LoginScreen onLogin={u=>setUser(u)}/>}
    </div>
  </>
}

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>)
