import React from 'react'
import ReactDOM from 'react-dom/client'
import { useState, useMemo, useEffect, useRef } from "react"

const SETUPS = ["M1", "M2", "M3", "J1", "J2"]
const CONTEXTOS = ["APERTURA", "ROMPIMIENTO", "GIRO"]
const DIRECCIONES = ["RANGO", "ALCISTA", "BAJISTA"]
const RESULTADOS = ["SL", "BE", "TP1", "TP2", "TP3"]
const R_VALUE = 300
const STORAGE_KEY = "bt_journal_v3"
const DEFAULT_TRADE = { semana:"",fecha:"",horaInicio:"09:30",horaFinal:"10:00",atr:"",duracionTrade:"",setup:"M1",contexto:"APERTURA",buySell:"BUY",puntosSlStr:"",rResultado:"",resultado:"SL",breakRangoM30:"NO",direccionDia:"RANGO",m5:"",m15:"",m30:"",screenshot:null,screenshotPreview:null,notas:"" }
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function pn(v){const n=parseFloat(v);return isNaN(n)?0:n}
function fmt$(v){return(v<0?"-":"")+"$"+Math.abs(v).toLocaleString()}
function fmtR(v){return(v>0?"+":"")+v+"R"}
function getRforTrade(t){if(t.resultado==="SL")return -1;if(t.resultado==="BE")return 0;const r=pn(t.rResultado);return r>0?r:0}
function calcStats(trades){if(!trades.length)return{total:0,wins:0,losses:0,bes:0,winRate:0,totalR:0,totalDollar:0,avgR:0,bestR:0,worstR:-1,profitFactor:0,expectancy:0};const rs=trades.map(getRforTrade);const wins=rs.filter(r=>r>0);const losses=rs.filter(r=>r<0);const bes=rs.filter(r=>r===0);const totalR=Math.round(rs.reduce((a,b)=>a+b,0)*100)/100;const gw=wins.reduce((a,r)=>a+r,0);const gl=Math.abs(losses.reduce((a,r)=>a+r,0));return{total:trades.length,wins:wins.length,losses:losses.length,bes:bes.length,winRate:Math.round((wins.length/trades.length)*100),totalR,totalDollar:Math.round(totalR*R_VALUE),avgR:Math.round((totalR/trades.length)*100)/100,bestR:rs.length?Math.max(...rs):0,worstR:rs.length?Math.min(...rs):0,profitFactor:gl?Math.round((gw/gl)*100)/100:gw>0?Infinity:0,expectancy:trades.length?Math.round((totalR/trades.length)*100)/100:0}}
function getWeek(d){if(!d)return"";const dt=new Date(d),s=new Date(dt.getFullYear(),0,1);return Math.ceil(((dt-s)/864e5+s.getDay()+1)/7)}
function getMo(d){if(!d)return"";return new Date(d).toLocaleString("es",{month:"short",year:"numeric"})}
function getYr(d){if(!d)return"";return new Date(d).getFullYear().toString()}
function groupBy(trades,keyFn){const m={};trades.forEach(t=>{const k=keyFn(t);if(k)(m[k]??=[]).push(t)});return Object.entries(m).sort((a,b)=>b[0].localeCompare(a[0])).map(([k,ts])=>({key:k,...calcStats(ts)}))}
const HOURS=[];for(let h=0;h<24;h++)for(let m=0;m<60;m+=5)HOURS.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`)

function TimePicker({value,onChange,label}){return(<div className="field"><label>{label}</label><select className="inp" value={value} onChange={e=>onChange(e.target.value)}>{HOURS.map(h=><option key={h} value={h}>{h}</option>)}</select></div>)}
function Metric({label,value,sub,color,big}){return(<div className="metric-card"><div className="metric-label">{label}</div><div className={`metric-value${big?" big":""}`} style={{color}}>{value}</div>{sub&&<div className="metric-sub">{sub}</div>}</div>)}
function ResTag({res}){const c=res==="SL"?"tag-red":res==="BE"?"tag-yellow":"tag-green";return<span className={`tag ${c}`}>{res}</span>}
function DirTag({dir}){const c=dir==="ALCISTA"?"tag-green":dir==="BAJISTA"?"tag-red":"tag-yellow";return<span className={`tag ${c}`}>{dir}</span>}
function SetupTag({setup}){return<span className="tag tag-accent">{setup}</span>}
function BuySellTag({bs}){return<span className={`tag ${bs==="BUY"?"tag-green":"tag-red"}`}>{bs}</span>}

function EquityCurve({trades}){
  if(trades.length<2)return<div className="empty-msg">Min 2 trades</div>
  const sorted=[...trades].sort((a,b)=>new Date(a.fecha)-new Date(b.fecha));let cum=0
  const pts=[0,...sorted.map(t=>(cum+=getRforTrade(t),Math.round(cum*100)/100))]
  const minY=Math.min(...pts),maxY=Math.max(...pts),rng=maxY-minY||1
  const w=600,h=180,p=40,toX=i=>p+(i/(pts.length-1))*(w-p*2),toY=v=>h-p-((v-minY)/rng)*(h-p*2)
  const line=pts.map((v,i)=>`${i===0?"M":"L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(" ")
  const area=line+` L ${toX(pts.length-1).toFixed(1)} ${toY(minY).toFixed(1)} L ${toX(0).toFixed(1)} ${toY(minY).toFixed(1)} Z`
  const col=cum>=0?"var(--green)":"var(--red)"
  return(<svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%",display:"block"}}><defs><linearGradient id="eqF" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity={0.25}/><stop offset="100%" stopColor={col} stopOpacity={0}/></linearGradient></defs>{[0,.25,.5,.75,1].map((pct,i)=>{const y=toY(minY+pct*rng);return<g key={i}><line x1={p} y1={y} x2={w-p} y2={y} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="4 4"/><text x={p-6} y={y+4} textAnchor="end" fill="var(--text3)" fontSize={10} fontFamily="var(--mono)">{Math.round((minY+pct*rng)*10)/10}R</text></g>})}<path d={area} fill="url(#eqF)"/><path d={line} fill="none" stroke={col} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"/><circle cx={toX(pts.length-1)} cy={toY(pts[pts.length-1])} r={4} fill={col}/></svg>)
}

function BarChart({data,labels,height=130,unit=""}){
  if(!data.length||data.every(v=>v===0))return<div className="empty-msg">Sin datos</div>
  const max=Math.max(...data.map(Math.abs),0.1),bw=Math.min(44,Math.max(20,320/data.length)),tw=data.length*(bw+8)+16,bl=height-12
  return(<div style={{overflowX:"auto"}}><svg width={Math.max(tw,200)} height={height+28}><line x1={8} y1={bl} x2={tw} y2={bl} stroke="var(--border)" strokeWidth={1}/>{data.map((v,i)=>{const bh=(Math.abs(v)/max)*(height-30),x=i*(bw+8)+12,pos=v>=0,y=pos?bl-bh:bl;return<g key={i}><rect x={x} y={y} width={bw} height={Math.max(bh,2)} rx={4} fill={pos?"var(--green)":"var(--red)"} opacity={0.8}/><text x={x+bw/2} y={pos?y-5:y+bh+13} textAnchor="middle" fill="var(--text2)" fontSize={10} fontFamily="var(--mono)">{Math.round(v*10)/10}{unit}</text><text x={x+bw/2} y={height+22} textAnchor="middle" fill="var(--text3)" fontSize={9} fontFamily="var(--mono)">{labels?.[i]}</text></g>})}</svg></div>)
}

function DonutChart({slices,size=150}){
  const valid=slices.filter(s=>s.value>0);if(!valid.length)return<div className="empty-msg">Sin datos</div>
  const total=valid.reduce((a,s)=>a+s.value,0),R=size/2-4,r=R*0.6,cx=size/2,cy=size/2;let angle=-Math.PI/2
  const arcs=valid.map(s=>{const a1=angle,sw=(s.value/total)*Math.PI*2;angle+=sw;const lg=sw>Math.PI?1:0;return{...s,d:`M ${cx+R*Math.cos(a1)} ${cy+R*Math.sin(a1)} A ${R} ${R} 0 ${lg} 1 ${cx+R*Math.cos(angle)} ${cy+R*Math.sin(angle)} L ${cx+r*Math.cos(angle)} ${cy+r*Math.sin(angle)} A ${r} ${r} 0 ${lg} 0 ${cx+r*Math.cos(a1)} ${cy+r*Math.sin(a1)} Z`,pct:Math.round((s.value/total)*100)}})
  return(<div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}><svg width={size} height={size}>{arcs.map((a,i)=><path key={i} d={a.d} fill={a.color} stroke="var(--surface)" strokeWidth={2}/>)}</svg><div style={{display:"flex",flexDirection:"column",gap:8}}>{arcs.map((a,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}><span style={{width:10,height:10,borderRadius:3,background:a.color,flexShrink:0}}/><span style={{color:"var(--text2)"}}>{a.label}</span><span style={{fontWeight:600,fontFamily:"var(--mono)",color:"var(--text)"}}>{a.pct}%</span></div>)}</div></div>)
}

function App(){
  const[trades,setTrades]=useState(()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||[]}catch{return[]}})
  const[tab,setTab]=useState("dashboard")
  const[form,setForm]=useState({...DEFAULT_TRADE})
  const[editId,setEditId]=useState(null)
  const[fPeriod,setFPeriod]=useState("all")
  const[fSetup,setFSetup]=useState("all")
  const[viewSS,setViewSS]=useState(null)
  const[sidebar,setSidebar]=useState(window.innerWidth>900)
  const fileRef=useRef()

  useEffect(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(trades))}catch{}},[trades])
  useEffect(()=>{const fn=()=>setSidebar(window.innerWidth>900);window.addEventListener("resize",fn);return()=>window.removeEventListener("resize",fn)},[])

  const filtered=useMemo(()=>{let ft=[...trades];if(fSetup!=="all")ft=ft.filter(t=>t.setup===fSetup);if(fPeriod!=="all"){const now=new Date();if(fPeriod==="week"){const w=new Date(now-7*864e5);ft=ft.filter(t=>new Date(t.fecha)>=w)}else if(fPeriod==="month")ft=ft.filter(t=>{const d=new Date(t.fecha);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()});else if(fPeriod==="year")ft=ft.filter(t=>new Date(t.fecha).getFullYear()===now.getFullYear())}return ft.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha))},[trades,fPeriod,fSetup])
  const stats=useMemo(()=>calcStats(filtered),[filtered])
  const daily=useMemo(()=>groupBy(trades,t=>t.fecha),[trades])
  const weekly=useMemo(()=>groupBy(trades,t=>`S${getWeek(t.fecha)}-${getYr(t.fecha)}`),[trades])
  const monthly=useMemo(()=>groupBy(trades,t=>getMo(t.fecha)),[trades])
  const setupS=useMemo(()=>{const m={};SETUPS.forEach(s=>m[s]=calcStats(trades.filter(t=>t.setup===s)));return m},[trades])

  const save=()=>{if(!form.fecha)return alert("Fecha obligatoria");const trade={...form};if(trade.resultado==="SL")trade.rResultado="-1";if(trade.resultado==="BE")trade.rResultado="0";if(editId){setTrades(ts=>ts.map(t=>t.id===editId?{...trade,id:editId}:t));setEditId(null)}else setTrades(ts=>[...ts,{...trade,id:uid()}]);setForm({...DEFAULT_TRADE});setTab("trades")}
  const del=id=>{if(confirm("¿Eliminar?")){setTrades(ts=>ts.filter(t=>t.id!==id))}}
  const edit=t=>{setForm({...t});setEditId(t.id);setTab("addTrade")}
  const goTab=t=>{setTab(t);if(window.innerWidth<=900)setSidebar(false);if(t==="addTrade"&&!editId)setForm({...DEFAULT_TRADE})}
  const exportCSV=()=>{const h=["fecha","semana","horaInicio","horaFinal","atr","duracionTrade","setup","contexto","buySell","puntosSlStr","rResultado","resultado","breakRangoM30","direccionDia","m5","m15","m30","notas"];const csv=[h.join(","),...trades.map(t=>h.map(k=>`"${t[k]||""}"`).join(","))].join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="bt_journal.csv";a.click()}
  const importCSV=e=>{const f=e.target.files[0];if(!f)return;const reader=new FileReader();reader.onload=ev=>{const lines=ev.target.result.split("\n").filter(Boolean);if(lines.length<2)return;const headers=lines[0].split(",").map(h=>h.replace(/"/g,"").trim());const imported=lines.slice(1).map(line=>{const vals=line.match(/(".*?"|[^",]+)/g)?.map(v=>v.replace(/"/g,"").trim())||[];const obj={...DEFAULT_TRADE,id:uid()};headers.forEach((h,i)=>{if(vals[i])obj[h]=vals[i]});return obj});setTrades(ts=>[...ts,...imported]);alert(`${imported.length} trades importados`)};reader.readAsText(f)}
  const handleFile=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>setForm(p=>({...p,screenshot:ev.target.result,screenshotPreview:ev.target.result}));r.readAsDataURL(f)}
  const F=(label,name,type="text",opts)=>(<div className="field"><label>{label}</label>{opts?<select className="inp" value={form[name]} onChange={e=>setForm(f=>({...f,[name]:e.target.value}))}>{opts.map(o=><option key={o} value={o}>{o}</option>)}</select>:<input className="inp" type={type} value={form[name]} onChange={e=>setForm(f=>({...f,[name]:e.target.value}))} step={type==="number"?"any":undefined}/>}</div>)
  const isTP=form.resultado.startsWith("TP")
  const nav=[{id:"dashboard",label:"Dashboard"},{id:"trades",label:"Trades"},{id:"addTrade",label:editId?"Editar":"Nuevo"},{id:"estadisticas",label:"Stats"},{id:"setups",label:"Setups"}]
  const icons={dashboard:"◈",trades:"☰",addTrade:"+",estadisticas:"▥",setups:"◆"}

  return(<>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
:root{--bg:#0a0e14;--surface:#12171f;--surface2:#1a2030;--border:#1e2738;--border2:#2a3548;--text:#d4dae4;--text2:#8892a4;--text3:#5a6478;--accent:#4c9aff;--accent2:#2d7adf;--accent-dim:rgba(76,154,255,.12);--green:#00d68f;--green-dim:rgba(0,214,143,.12);--red:#ff4757;--red-dim:rgba(255,71,87,.12);--yellow:#ffc048;--yellow-dim:rgba(255,192,72,.12);--font:'DM Sans',sans-serif;--mono:'JetBrains Mono',monospace;--radius:10px;--radius-lg:14px}
*{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg);color:var(--text);font-family:var(--font);font-size:14px;-webkit-font-smoothing:antialiased}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}
.shell{display:flex;min-height:100vh}.sidebar{width:240px;background:var(--surface);border-right:1px solid var(--border);position:fixed;top:0;left:0;bottom:0;display:flex;flex-direction:column;z-index:100;transition:transform .25s}.sidebar.closed{transform:translateX(-240px)}.main{margin-left:240px;padding:28px 36px 60px;flex:1;min-width:0;transition:margin .25s}.main.full{margin-left:0}
.mobile-bar{display:none;position:fixed;top:0;left:0;right:0;height:52px;background:var(--surface);border-bottom:1px solid var(--border);z-index:101;align-items:center;padding:0 16px;justify-content:space-between}
@media(max-width:900px){.mobile-bar{display:flex}.main{margin-left:0;padding:68px 16px 40px}.sidebar{transform:translateX(-240px)}.sidebar.open{transform:translateX(0)}}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99}.ss-modal{position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer}.ss-modal img{max-width:92vw;max-height:92vh;border-radius:var(--radius);border:1px solid var(--border2)}
.sb-brand{padding:24px 20px 20px;border-bottom:1px solid var(--border)}.sb-brand h1{font-size:20px;font-weight:700;color:var(--accent);letter-spacing:-.5px}.sb-brand p{font-size:11px;color:var(--text3);margin-top:4px;font-family:var(--mono);text-transform:uppercase;letter-spacing:1px}
.sb-nav{flex:1;padding:12px 8px;display:flex;flex-direction:column;gap:2px}.sb-btn{display:flex;align-items:center;gap:12px;width:100%;padding:11px 14px;background:transparent;color:var(--text2);border:none;cursor:pointer;font:inherit;font-size:13px;font-weight:500;border-radius:8px;transition:all .15s;text-align:left}.sb-btn:hover{background:var(--surface2);color:var(--text)}.sb-btn.active{background:var(--accent-dim);color:var(--accent)}
.sb-footer{padding:16px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px}.sb-footer button,.sb-footer label{display:block;width:100%;padding:9px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text2);font:inherit;font-size:12px;font-weight:500;cursor:pointer;text-align:center;transition:all .15s}.sb-footer button:hover,.sb-footer label:hover{background:var(--border);color:var(--text)}
.page-title{font-size:24px;font-weight:700;letter-spacing:-.5px}.page-sub{color:var(--text2);font-size:13px;margin-top:2px}.section-title{font-size:13px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.8px;margin-bottom:16px;font-family:var(--mono)}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px;margin-bottom:16px}.card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin-bottom:20px}.metric-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px 20px}.metric-label{font-size:11px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.8px;font-family:var(--mono);margin-bottom:8px}.metric-value{font-size:22px;font-weight:700;font-family:var(--mono);letter-spacing:-.5px;line-height:1}.metric-value.big{font-size:28px}.metric-sub{font-size:11px;color:var(--text3);margin-top:6px;font-family:var(--mono)}
.tag{display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;font-family:var(--mono);letter-spacing:.3px}.tag-green{background:var(--green-dim);color:var(--green)}.tag-red{background:var(--red-dim);color:var(--red)}.tag-yellow{background:var(--yellow-dim);color:var(--yellow)}.tag-accent{background:var(--accent-dim);color:var(--accent)}
.tbl{width:100%;border-collapse:collapse;font-size:13px}.tbl th{text-align:left;padding:10px 12px;border-bottom:1px solid var(--border);color:var(--text3);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.8px;font-family:var(--mono);white-space:nowrap}.tbl td{padding:10px 12px;border-bottom:1px solid var(--border)}.tbl tr:hover td{background:var(--surface2)}.tbl .mono{font-family:var(--mono)}.tbl .g{color:var(--green)}.tbl .r{color:var(--red)}.tbl .y{color:var(--yellow)}.tbl .bold{font-weight:600}
.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:14px}.field{display:flex;flex-direction:column;gap:5px}.field label{font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;font-weight:600;font-family:var(--mono)}.inp{background:var(--bg);border:1px solid var(--border2);border-radius:8px;color:var(--text);padding:10px 12px;font:inherit;font-size:13px;width:100%;outline:none;transition:border .15s}.inp:focus{border-color:var(--accent)}select.inp{cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235a6478' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:30px}textarea.inp{resize:vertical;min-height:120px}input[type="date"]::-webkit-calendar-picker-indicator,input[type="time"]::-webkit-calendar-picker-indicator{filter:invert(0.6)}
.btn{border:none;border-radius:8px;padding:10px 22px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:all .15s}.btn-primary{background:var(--accent);color:#fff}.btn-primary:hover{background:var(--accent2)}.btn-outline{background:transparent;color:var(--text2);border:1px solid var(--border2)}.btn-outline:hover{background:var(--surface2);color:var(--text)}.btn-danger{background:var(--red-dim);color:var(--red)}.btn-danger:hover{background:var(--red);color:#fff}.btn-sm{padding:5px 12px;font-size:12px}.btn-xs{padding:4px 8px;font-size:11px}
.period-bar{display:flex;gap:4px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:3px}.period-btn{padding:6px 14px;border:none;background:transparent;color:var(--text3);font:inherit;font-size:12px;font-weight:500;cursor:pointer;border-radius:6px;transition:all .15s}.period-btn.active{background:var(--accent-dim);color:var(--accent)}
.empty-msg{text-align:center;padding:28px;color:var(--text3);font-size:13px}
.grid-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}@media(max-width:700px){.grid-2,.grid-3{grid-template-columns:1fr}}
.upload-zone{border:2px dashed var(--border2);border-radius:var(--radius);padding:28px;text-align:center;cursor:pointer;color:var(--text3);transition:all .2s;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:90px}.upload-zone:hover{border-color:var(--accent);color:var(--accent)}.upload-zone img{max-width:100%;max-height:160px;border-radius:8px}
.setup-card{border-left:3px solid var(--border2)}.setup-card.profit{border-left-color:var(--green)}.setup-card.loss{border-left-color:var(--red)}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}.card,.metric-card{animation:fadeIn .3s ease both}`}</style>

    <div className="shell">
      {viewSS&&<div className="ss-modal" onClick={()=>setViewSS(null)}><img src={viewSS}/></div>}
      {sidebar&&window.innerWidth<=900&&<div className="overlay" onClick={()=>setSidebar(false)}/>}
      <div className="mobile-bar"><button onClick={()=>setSidebar(!sidebar)} style={{background:"none",border:"none",color:"var(--text)",fontSize:20,cursor:"pointer"}}>☰</button><span style={{fontWeight:700,color:"var(--accent)",fontFamily:"var(--mono)"}}>BT JOURNAL</span><div style={{width:28}}/></div>

      <div className={`sidebar ${sidebar?"open":"closed"}`}>
        <div className="sb-brand"><h1>BT Journal</h1><p>Backtesting Pro</p></div>
        <nav className="sb-nav">{nav.map(n=><button key={n.id} className={`sb-btn ${tab===n.id?"active":""}`} onClick={()=>goTab(n.id)}><span style={{fontFamily:"var(--mono)",fontSize:16,width:20,textAlign:"center"}}>{icons[n.id]}</span><span>{n.label}</span></button>)}</nav>
        <div className="sb-footer"><button onClick={exportCSV}>Exportar CSV</button><label>Importar CSV<input type="file" accept=".csv" onChange={importCSV} style={{display:"none"}}/></label></div>
      </div>

      <div className={`main ${!sidebar||window.innerWidth<=900?"full":""}`}>

        {tab==="dashboard"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24,flexWrap:"wrap",gap:12}}>
            <div><h1 className="page-title">Dashboard</h1><p className="page-sub">{trades.length} trades · 1R = {fmt$(R_VALUE)}</p></div>
            <div className="period-bar">{["all","week","month","year"].map(p=><button key={p} className={`period-btn ${fPeriod===p?"active":""}`} onClick={()=>setFPeriod(p)}>{{all:"Todo",week:"7d",month:"Mes",year:"Año"}[p]}</button>)}</div>
          </div>
          <div className="metrics">
            <Metric label="P&L total" value={`${stats.totalR>=0?"+":""}${stats.totalR}R`} sub={fmt$(stats.totalDollar)} color={stats.totalR>=0?"var(--green)":"var(--red)"} big/>
            <Metric label="Win rate" value={`${stats.winRate}%`} color={stats.winRate>=50?"var(--green)":"var(--red)"} sub={`${stats.wins}W · ${stats.losses}L · ${stats.bes}BE`}/>
            <Metric label="Profit factor" value={stats.profitFactor===Infinity?"∞":stats.profitFactor} color={stats.profitFactor>=1.5?"var(--green)":stats.profitFactor>=1?"var(--yellow)":"var(--red)"}/>
            <Metric label="Expectancy" value={`${stats.expectancy}R`} color={stats.expectancy>0?"var(--green)":"var(--red)"} sub={fmt$(Math.round(stats.expectancy*R_VALUE))+"/trade"}/>
            <Metric label="Total trades" value={stats.total}/>
          </div>
          <div className="grid-2" style={{marginBottom:16}}>
            <div className="card"><div className="section-title">Equity curve</div><EquityCurve trades={filtered}/></div>
            <div className="card"><div className="section-title">Resultados</div><DonutChart slices={RESULTADOS.map(r=>({label:r,value:filtered.filter(t=>t.resultado===r).length,color:{SL:"#ff4757",BE:"#ffc048",TP1:"#00d68f",TP2:"#00e8a0",TP3:"#00f0b0"}[r]}))}/></div>
          </div>
          <div className="card"><div className="section-title">P&L diario (R)</div><BarChart data={daily.slice(0,20).reverse().map(d=>d.totalR)} labels={daily.slice(0,20).reverse().map(d=>d.key.slice(5))} unit="R"/></div>
          <div className="card" style={{marginTop:16}}>
            <div className="card-header"><span className="section-title" style={{margin:0}}>Trades recientes</span><button className="btn btn-outline btn-xs" onClick={()=>setTab("trades")}>Ver todos</button></div>
            <div style={{overflowX:"auto"}}><table className="tbl"><thead><tr><th>Fecha</th><th>Setup</th><th>B/S</th><th>SL pts</th><th>R</th><th>P&L</th><th>Resultado</th><th>Dir</th></tr></thead><tbody>
              {filtered.slice(0,10).map(t=>{const r=getRforTrade(t);return<tr key={t.id} style={{cursor:"pointer"}} onClick={()=>edit(t)}><td className="mono">{t.fecha}</td><td><SetupTag setup={t.setup}/></td><td><BuySellTag bs={t.buySell}/></td><td className="mono">{t.puntosSlStr}</td><td className="mono bold" style={{color:r>0?"var(--green)":r<0?"var(--red)":"var(--yellow)"}}>{fmtR(r)}</td><td className="mono bold" style={{color:r>=0?"var(--green)":"var(--red)"}}>{fmt$(r*R_VALUE)}</td><td><ResTag res={t.resultado}/></td><td><DirTag dir={t.direccionDia}/></td></tr>})}
            </tbody></table></div>
            {!filtered.length&&<div className="empty-msg">Sin trades — agrega tu primero</div>}
          </div>
        </>}

        {tab==="trades"&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
            <h1 className="page-title">Trades</h1>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <select className="inp" style={{width:"auto"}} value={fSetup} onChange={e=>setFSetup(e.target.value)}><option value="all">All setups</option>{SETUPS.map(s=><option key={s} value={s}>{s}</option>)}</select>
              <div className="period-bar">{["all","week","month","year"].map(p=><button key={p} className={`period-btn ${fPeriod===p?"active":""}`} onClick={()=>setFPeriod(p)}>{{all:"Todo",week:"7d",month:"Mes",year:"Año"}[p]}</button>)}</div>
              <button className="btn btn-primary btn-sm" onClick={()=>goTab("addTrade")}>+ Nuevo</button>
            </div>
          </div>
          <div className="card" style={{overflowX:"auto"}}><table className="tbl" style={{minWidth:1050}}><thead><tr>{["Fecha","Sem","Hora","Setup","Ctx","B/S","SL pts","R","P&L","Result","BrkM30","Dir","M5","M15","M30","📷",""].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
            {filtered.map(t=>{const r=getRforTrade(t);return<tr key={t.id}><td className="mono">{t.fecha}</td><td className="mono">{t.semana}</td><td className="mono" style={{fontSize:12}}>{t.horaInicio}→{t.horaFinal}</td><td><SetupTag setup={t.setup}/></td><td style={{fontSize:12}}>{t.contexto}</td><td><BuySellTag bs={t.buySell}/></td><td className="mono">{t.puntosSlStr}</td><td className="mono bold" style={{color:r>0?"var(--green)":r<0?"var(--red)":"var(--yellow)"}}>{fmtR(r)}</td><td className="mono bold" style={{color:r>=0?"var(--green)":"var(--red)"}}>{fmt$(r*R_VALUE)}</td><td><ResTag res={t.resultado}/></td><td>{t.breakRangoM30}</td><td><DirTag dir={t.direccionDia}/></td><td className="mono">{t.m5}</td><td className="mono">{t.m15}</td><td className="mono">{t.m30}</td><td>{t.screenshot?<span style={{cursor:"pointer",color:"var(--accent)"}} onClick={()=>setViewSS(t.screenshot)}>Ver</span>:"—"}</td><td><div style={{display:"flex",gap:4}}><button className="btn btn-outline btn-xs" onClick={()=>edit(t)}>Edit</button><button className="btn btn-danger btn-xs" onClick={()=>del(t.id)}>✕</button></div></td></tr>})}
          </tbody></table>{!filtered.length&&<div className="empty-msg">Sin trades</div>}</div>
        </>}

        {tab==="addTrade"&&<>
          <h1 className="page-title" style={{marginBottom:20}}>{editId?"Editar trade":"Nuevo trade"}</h1>
          <div className="card"><div className="section-title">General</div><div className="form-grid">{F("Semana","semana","number")}{F("Fecha","fecha","date")}<TimePicker label="Hora inicio" value={form.horaInicio} onChange={v=>setForm(f=>({...f,horaInicio:v}))}/><TimePicker label="Hora final" value={form.horaFinal} onChange={v=>setForm(f=>({...f,horaFinal:v}))}/></div></div>
          <div className="card"><div className="section-title">Trade</div><div className="form-grid">{F("ATR","atr","number")}{F("Duración (min)","duracionTrade","number")}{F("Setup","setup",null,SETUPS)}{F("Contexto","contexto",null,CONTEXTOS)}{F("Buy / Sell","buySell",null,["BUY","SELL"])}{F("Puntos SL","puntosSlStr","number")}</div></div>
          <div className="card"><div className="section-title">Resultado</div><div className="form-grid">{F("Resultado","resultado",null,RESULTADOS)}{isTP&&F("R ganados","rResultado","number")}{F("Break rango M30","breakRangoM30",null,["NO","SI"])}{F("Dirección día","direccionDia",null,DIRECCIONES)}</div>{form.resultado==="SL"&&<p style={{marginTop:12,fontSize:12,color:"var(--text3)",fontFamily:"var(--mono)"}}>SL = -1R = -{fmt$(R_VALUE)}</p>}{form.resultado==="BE"&&<p style={{marginTop:12,fontSize:12,color:"var(--text3)",fontFamily:"var(--mono)"}}>BE = 0R = $0</p>}{isTP&&pn(form.rResultado)>0&&<p style={{marginTop:12,fontSize:12,color:"var(--green)",fontFamily:"var(--mono)"}}>+{form.rResultado}R = +{fmt$(pn(form.rResultado)*R_VALUE)}</p>}</div>
          <div className="card"><div className="section-title">ORB (puntos)</div><div className="form-grid" style={{gridTemplateColumns:"repeat(3,1fr)"}}>{F("M5","m5","number")}{F("M15","m15","number")}{F("M30","m30","number")}</div></div>
          <div className="card"><div className="section-title">Screenshot & Notas</div><div className="grid-2"><div><input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{display:"none"}}/><div className="upload-zone" onClick={()=>fileRef.current?.click()}>{form.screenshotPreview?<img src={form.screenshotPreview}/>:<><span style={{fontSize:28}}>📷</span><span style={{fontSize:12}}>Click para subir</span></>}</div>{form.screenshotPreview&&<button className="btn btn-danger btn-xs" style={{marginTop:8}} onClick={()=>setForm(f=>({...f,screenshot:null,screenshotPreview:null}))}>Quitar</button>}</div><div className="field"><label>Notas</label><textarea className="inp" value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} placeholder="Observaciones..."/></div></div></div>
          <div style={{display:"flex",gap:12}}><button className="btn btn-primary" onClick={save}>{editId?"Guardar":"Registrar trade"}</button>{editId&&<button className="btn btn-outline" onClick={()=>{setEditId(null);setForm({...DEFAULT_TRADE});setTab("trades")}}>Cancelar</button>}</div>
        </>}

        {tab==="estadisticas"&&<>
          <h1 className="page-title" style={{marginBottom:20}}>Estadísticas</h1>
          {[{title:"Por día",data:daily.slice(0,30),cols:["Fecha","Trades","W","L","Win%","R","P&L","PF"],row:d=>[d.key,d.total,[d.wins,"g"],[d.losses,"r"],[`${d.winRate}%`,d.winRate>=50?"g":"r"],[`${d.totalR>0?"+":""}${d.totalR}R`,d.totalR>=0?"g":"r",true],[fmt$(d.totalDollar),d.totalDollar>=0?"g":"r"],d.profitFactor===Infinity?"∞":d.profitFactor]},
            {title:"Por semana",data:weekly,cols:["Semana","Trades","Win%","R","P&L","PF"],row:w=>[w.key,w.total,[`${w.winRate}%`,w.winRate>=50?"g":"r"],[`${w.totalR>0?"+":""}${w.totalR}R`,w.totalR>=0?"g":"r",true],[fmt$(w.totalDollar),w.totalDollar>=0?"g":"r"],w.profitFactor===Infinity?"∞":w.profitFactor],chart:weekly},
            {title:"Por mes",data:monthly,cols:["Mes","Trades","Win%","R","P&L","PF"],row:m=>[m.key,m.total,[`${m.winRate}%`,m.winRate>=50?"g":"r"],[`${m.totalR>0?"+":""}${m.totalR}R`,m.totalR>=0?"g":"r",true],[fmt$(m.totalDollar),m.totalDollar>=0?"g":"r"],m.profitFactor===Infinity?"∞":m.profitFactor],chart:monthly}
          ].map(sec=><div key={sec.title} className="card"><div className="section-title">{sec.title}</div><div style={{display:"grid",gridTemplateColumns:sec.chart?"minmax(0,1.3fr) minmax(0,1fr)":"1fr",gap:16}}><div style={{overflowX:"auto"}}><table className="tbl"><thead><tr>{sec.cols.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{sec.data.map((d,i)=><tr key={i}>{sec.row(d).map((cell,j)=>{if(Array.isArray(cell))return<td key={j} className={`mono ${cell[1]} ${cell[2]?"bold":""}`}>{cell[0]}</td>;return<td key={j} className="mono">{cell}</td>})}</tr>)}</tbody></table>{!sec.data.length&&<div className="empty-msg">Sin datos</div>}</div>{sec.chart&&<BarChart data={sec.chart.slice(0,12).reverse().map(w=>w.totalR)} labels={sec.chart.slice(0,12).reverse().map(w=>w.key)} unit="R"/>}</div></div>)}
        </>}

        {tab==="setups"&&<>
          <h1 className="page-title" style={{marginBottom:20}}>Análisis por setup</h1>
          <div className="grid-2" style={{marginBottom:20}}>{SETUPS.map(su=>{const st=setupS[su];return<div key={su} className={`card setup-card ${st.totalR>0?"profit":st.total?"loss":""}`}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><span style={{fontSize:18,fontWeight:700,color:"var(--accent)",fontFamily:"var(--mono)"}}>{su}</span><span className="tag tag-accent">{st.total} trades</span></div><div className="grid-3" style={{gap:10}}>{[["Win%",`${st.winRate}%`,st.winRate>=50?"var(--green)":"var(--red)"],["P&L",`${st.totalR>0?"+":""}${st.totalR}R`,st.totalR>=0?"var(--green)":"var(--red)"],["PF",st.profitFactor===Infinity?"∞":st.profitFactor,st.profitFactor>=1.5?"var(--green)":"var(--red)"]].map(([l,v,c])=><div key={l}><div className="metric-label">{l}</div><div style={{fontSize:20,fontWeight:700,fontFamily:"var(--mono)",color:c}}>{v}</div></div>)}</div><div className="grid-3" style={{gap:10,marginTop:14,borderTop:"1px solid var(--border)",paddingTop:14}}>{[["$/trade",fmt$(Math.round(st.expectancy*R_VALUE))],["Mejor",`+${st.bestR}R`,"var(--green)"],["Peor",`${st.worstR}R`,"var(--red)"]].map(([l,v,c])=><div key={l}><div className="metric-label">{l}</div><div style={{fontSize:15,fontWeight:600,fontFamily:"var(--mono)",color:c}}>{v}</div></div>)}</div></div>})}</div>
          <div className="card"><div className="section-title">Win rate por setup</div><BarChart data={SETUPS.map(s=>setupS[s].winRate)} labels={SETUPS} height={130} unit="%"/></div>
          <div className="card"><div className="section-title">P&L por setup (R)</div><BarChart data={SETUPS.map(s=>setupS[s].totalR)} labels={SETUPS} height={130} unit="R"/></div>
          <div className="card"><div className="section-title">Por dirección</div><div className="grid-3">{DIRECCIONES.map(dir=>{const ds=calcStats(trades.filter(t=>t.direccionDia===dir));return<div key={dir} style={{background:"var(--bg)",borderRadius:"var(--radius)",padding:16}}><DirTag dir={dir}/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:14}}>{[["Trades",ds.total],["Win%",`${ds.winRate}%`,ds.winRate>=50?"var(--green)":"var(--red)"],["P&L",`${ds.totalR>0?"+":""}${ds.totalR}R`,ds.totalR>=0?"var(--green)":"var(--red)"],["PF",ds.profitFactor===Infinity?"∞":ds.profitFactor]].map(([l,v,c])=><div key={l}><div className="metric-label">{l}</div><div style={{fontWeight:600,fontFamily:"var(--mono)",color:c}}>{v}</div></div>)}</div></div>})}</div></div>
        </>}
      </div>
    </div>
  </>)
}

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>)
