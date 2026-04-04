import React from 'react'
import ReactDOM from 'react-dom/client'
import { useState, useMemo, useEffect, useRef, useCallback } from "react"

// ═══════════════════════════════════════════════
// SUPABASE CONFIG (fetch directo, NO SDK)
// ═══════════════════════════════════════════════
const SUPA_URL = "https://kkcsykncinisnknymonz.supabase.co"
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrY3N5a25jaW5pc25rbnltb256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjYxMzIsImV4cCI6MjA5MDg0MjEzMn0.m8M_nIg6h87ocMedXSOSzOr0Xv0iIwjMWuODTnbHmSI"
const supa = (path, opts = {}) => fetch(`${SUPA_URL}/rest/v1/${path}`, {
  ...opts,
  headers: {
    "apikey": SUPA_KEY,
    "Authorization": `Bearer ${SUPA_KEY}`,
    "Content-Type": "application/json",
    "Prefer": opts.prefer || "return=representation",
    ...(opts.headers || {})
  }
})

// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════
const SETUPS = ["M1", "M2", "M3", "J1", "J2", "NO"]
const CTXS = ["APERTURA", "ROMPIMIENTO", "GIRO"]
const DIRS = ["RANGO", "ALCISTA", "BAJISTA"]
const RESS = ["SL", "BE", "WIN", "SIN OP"]
const SR = SETUPS.filter(s => s !== "NO")
const RV = 300
const NHS = ["", "08:30", "09:45", "10:00", "10:30"]
const NIS = ["", "ALTO", "MEDIO", "BAJO"]
const NTS = ["", "NFP", "CPI", "PPI", "FOMC", "JOBLESS CLAIMS", "GDP", "RETAIL SALES", "ISM", "PCE", "OTRA"]
const DFT = {
  fecha: "", horaInicio: "09:30", horaFinal: "10:00", atr: "",
  setup: "M1", contexto: "APERTURA", buySell: "BUY", puntosSlStr: "",
  rResultado: "", rMaximo: "", resultado: "SL",
  breakRangoM30: "NO", direccionDia: "RANGO",
  m5: "", m15: "", m30: "", ddPuntos: "",
  hayNoticia: "NO", noticiaHora: "", noticiaImpacto: "", noticiaTipo: "",
  screenshot: null, screenshotPreview: null, notas: ""
}
const HRS = []
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m++) {
    HRS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`)
  }
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
const pn = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
const fmt$ = v => (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString()
const fmtR = v => (v > 0 ? "+" : "") + v + "R"
const fmtPF = v => v === Infinity ? "∞" : v.toFixed(2)
const fmtD = ds => {
  if (!ds) return ""
  const d = new Date(ds)
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`
}
const getMo = ds => ds ? new Date(ds).toLocaleString("es", { month: "short" }) + " " + String(new Date(ds).getFullYear()).slice(-2) : ""
const getYr = ds => ds ? String(new Date(ds).getFullYear()).slice(-2) : ""
const cDur = (s, e) => {
  if (!s || !e) return ""
  const [sh, sm] = s.split(":").map(Number)
  const [eh, em] = e.split(":").map(Number)
  let d = (eh * 60 + em) - (sh * 60 + sm)
  return d < 0 ? d + 1440 : d
}
const getDN = ds => ds ? new Date(ds).toLocaleString("es", { weekday: "short" }) : ""
const isSO = t => t.resultado === "SIN OP" || t.setup === "NO"
const rT = ts => ts.filter(t => !isSO(t))

const gR = t => {
  if (isSO(t)) return 0
  if (t.resultado === "BE") return 0
  const rv = pn(t.rResultado)
  if (t.resultado === "SL") return rv < 0 ? rv : -1
  return rv > 0 ? rv : 0
}

const gDD = t => {
  const s = pn(t.puntosSlStr), d = pn(t.ddPuntos)
  return s && d ? Math.round(d / s * 10000) / 100 : null
}

const hBucket = h => {
  if (!h || !h.includes(":")) return ""
  const [hh, mm] = h.split(":").map(Number)
  return `${String(hh).padStart(2, "0")}:${String(Math.floor(mm / 5) * 5).padStart(2, "0")}`
}

// ═══════════════════════════════════════════════
// DB MAPPING
// ═══════════════════════════════════════════════
const t2d = (t, uid, mode = "bt") => ({
  user_id: uid, mode, fecha: t.fecha,
  hora_inicio: t.horaInicio, hora_final: t.horaFinal,
  duracion_trade: t.duracionTrade || "", atr: t.atr || "",
  setup: t.setup, contexto: t.contexto, buy_sell: t.buySell,
  puntos_sl: t.puntosSlStr || "", r_resultado: t.rResultado || "",
  r_maximo: t.rMaximo || "", resultado: t.resultado,
  break_rango_m30: t.breakRangoM30, direccion_dia: t.direccionDia,
  dd_puntos: t.ddPuntos || "", hay_noticia: t.hayNoticia,
  noticia_hora: t.noticiaHora || "", noticia_impacto: t.noticiaImpacto || "",
  noticia_tipo: t.noticiaTipo || "", m5: t.m5 || "", m15: t.m15 || "",
  m30: t.m30 || "", screenshot: t.screenshot || "", notas: t.notas || ""
})

const d2t = d => ({
  id: d.id, mode: d.mode || "bt", fecha: d.fecha || "",
  horaInicio: d.hora_inicio || "", horaFinal: d.hora_final || "",
  duracionTrade: d.duracion_trade || "", atr: d.atr || "",
  setup: d.setup || "M1", contexto: d.contexto || "APERTURA",
  buySell: d.buy_sell || "BUY", puntosSlStr: d.puntos_sl || "",
  rResultado: d.r_resultado || "", rMaximo: d.r_maximo || "",
  resultado: d.resultado || "SL", breakRangoM30: d.break_rango_m30 || "NO",
  direccionDia: d.direccion_dia || "RANGO", ddPuntos: d.dd_puntos || "",
  hayNoticia: d.hay_noticia || "NO", noticiaHora: d.noticia_hora || "",
  noticiaImpacto: d.noticia_impacto || "", noticiaTipo: d.noticia_tipo || "",
  m5: d.m5 || "", m15: d.m15 || "", m30: d.m30 || "",
  screenshot: d.screenshot || null, screenshotPreview: d.screenshot || null,
  notas: d.notas || ""
})

// ═══════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════
function cS(trades) {
  const t2 = rT(trades)
  const z = {
    total: 0, wins: 0, losses: 0, bes: 0, winRate: 0,
    totalR: 0, totalDollar: 0, bestR: 0,
    profitFactor: 0, expectancy: 0, expectDollar: 0,
    avgDDpct: 0, avgDurWin: 0, avgDurSL: 0, avgDurBE: 0,
    maxWinStreak: 0, maxLossStreak: 0, curWinStreak: 0, curLossStreak: 0,
    recoveryFactor: 0, sharpeRatio: 0, payoffRatio: 0,
    sampleValid: false, maxEquityDD: 0
  }
  if (!t2.length) return z

  const rs = t2.map(gR)
  const w = rs.filter(r => r > 0)
  const l = rs.filter(r => r < 0)
  const b = rs.filter(r => r === 0)
  const tR = Math.round(rs.reduce((a, c) => a + c, 0) * 100) / 100
  const gw = w.reduce((a, r) => a + r, 0)
  const gl = Math.abs(l.reduce((a, r) => a + r, 0))

  const dd = t2.map(gDD).filter(v => v !== null)
  const aDD = dd.length ? Math.round(dd.reduce((a, c) => a + c, 0) / dd.length * 100) / 100 : 0
  const exp = Math.round((tR / t2.length) * 100) / 100

  let mxW = 0, mxL = 0, cW = 0, cL = 0
  const sorted = [...t2].sort((a, b2) => new Date(a.fecha) - new Date(b2.fecha))
  sorted.forEach(t => {
    const r = gR(t)
    if (r > 0) { cW++; cL = 0 }
    else if (r < 0) { cL++; cW = 0 }
    else { cW = 0; cL = 0 }
    mxW = Math.max(mxW, cW)
    mxL = Math.max(mxL, cL)
  })

  let pk = 0, mDD = 0, cm = 0
  sorted.forEach(t => {
    cm += gR(t)
    if (cm > pk) pk = cm
    const dv = pk - cm
    if (dv > mDD) mDD = dv
  })

  const rF = mDD > 0 ? Math.round(tR / mDD * 100) / 100 : tR > 0 ? Infinity : 0
  const mn = tR / t2.length
  const va = rs.reduce((a, r) => a + Math.pow(r - mn, 2), 0) / rs.length
  const sh = Math.sqrt(va) > 0 ? Math.round(mn / Math.sqrt(va) * 100) / 100 : 0
  const avgW = w.length ? gw / w.length : 0
  const avgL = l.length ? gl / l.length : 1
  const po = avgL > 0 ? Math.round(avgW / avgL * 100) / 100 : avgW > 0 ? Infinity : 0

  const dW = t2.filter(t => t.resultado === "WIN").map(t => pn(t.duracionTrade)).filter(v => v > 0)
  const dS = t2.filter(t => t.resultado === "SL").map(t => pn(t.duracionTrade)).filter(v => v > 0)
  const dB = t2.filter(t => t.resultado === "BE").map(t => pn(t.duracionTrade)).filter(v => v > 0)

  return {
    total: t2.length, wins: w.length, losses: l.length, bes: b.length,
    winRate: Math.round(w.length / t2.length * 10000) / 100,
    totalR: tR, totalDollar: Math.round(tR * RV),
    bestR: rs.length ? Math.max(...rs) : 0,
    profitFactor: gl ? Math.round(gw / gl * 10000) / 10000 : gw > 0 ? Infinity : 0,
    expectancy: exp, expectDollar: Math.round(exp * RV),
    avgDDpct: aDD,
    avgDurWin: dW.length ? Math.round(dW.reduce((a, c) => a + c, 0) / dW.length) : 0,
    avgDurSL: dS.length ? Math.round(dS.reduce((a, c) => a + c, 0) / dS.length) : 0,
    avgDurBE: dB.length ? Math.round(dB.reduce((a, c) => a + c, 0) / dB.length) : 0,
    maxWinStreak: mxW, maxLossStreak: mxL,
    curWinStreak: cW, curLossStreak: cL,
    recoveryFactor: rF, sharpeRatio: sh, payoffRatio: po,
    sampleValid: t2.length >= 30,
    maxEquityDD: Math.round(mDD * 100) / 100
  }
}

const grpBy = (trades, fn) => {
  const m = {}
  rT(trades).forEach(t => {
    const k = fn(t)
    if (k) {
      if (!m[k]) m[k] = []
      m[k].push(t)
    }
  })
  return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0])).map(([k, ts]) => ({ key: k, ...cS(ts) }))
}

function extraS(trades) {
  const t2 = rT(trades)
  if (!t2.length) return { bestDay: "-", worstDay: "-", avgOps: 0, bestWd: "-", worstWd: "-" }
  const bd = {}
  t2.forEach(t => {
    if (t.fecha) {
      if (!bd[t.fecha]) bd[t.fecha] = []
      bd[t.fecha].push(t)
    }
  })
  const dt = Object.entries(bd).map(([d, ts]) => ({ d, r: ts.reduce((a, t) => a + gR(t), 0) }))
  const best = dt.reduce((a, x) => x.r > a.r ? x : a, dt[0])
  const worst = dt.reduce((a, x) => x.r < a.r ? x : a, dt[0])
  const bw = {}
  t2.forEach(t => {
    if (t.fecha) {
      const wd = getDN(t.fecha)
      if (!bw[wd]) bw[wd] = []
      bw[wd].push(t)
    }
  })
  const wt = Object.entries(bw).map(([wd, ts]) => ({ wd, r: ts.reduce((a, t) => a + gR(t), 0) }))
  const bestW = wt.reduce((a, x) => x.r > a.r ? x : a, wt[0])
  const worstW = wt.reduce((a, x) => x.r < a.r ? x : a, wt[0])
  return {
    bestDay: `${fmtD(best.d)} (${best.r > 0 ? "+" : ""}${Math.round(best.r * 100) / 100}R)`,
    worstDay: `${fmtD(worst.d)} (${worst.r > 0 ? "+" : ""}${Math.round(worst.r * 100) / 100}R)`,
    avgOps: Math.round(t2.length / Object.keys(bd).length * 100) / 100,
    bestWd: `${bestW.wd} (${bestW.r > 0 ? "+" : ""}${Math.round(bestW.r * 100) / 100}R)`,
    worstWd: `${worstW.wd} (${worstW.r > 0 ? "+" : ""}${Math.round(worstW.r * 100) / 100}R)`
  }
}

function rDist(trades, field) {
  const vs = rT(trades).filter(t => t.resultado === "WIN").map(t => Math.round(pn(t[field]))).filter(v => v > 0)
  if (!vs.length) return { lvl: [], cnt: [], pct: [] }
  const mx = Math.max(...vs), lvl = [], cnt = [], pct = []
  for (let r = 1; r <= Math.min(mx, 15); r++) {
    const c = vs.filter(v => v === r).length
    lvl.push(r + "R"); cnt.push(c); pct.push(Math.round(c / vs.length * 10000) / 100)
  }
  if (vs.some(v => v > 15)) {
    const c = vs.filter(v => v > 15).length
    lvl.push("16R+"); cnt.push(c); pct.push(Math.round(c / vs.length * 10000) / 100)
  }
  return { lvl, cnt, pct }
}

function hourAnalysis(trades) {
  const bh = {}
  rT(trades).forEach(t => {
    const b = hBucket(t.horaInicio)
    if (b) {
      if (!bh[b]) bh[b] = []
      bh[b].push(t)
    }
  })
  return Object.entries(bh).sort((a, b) => a[0].localeCompare(b[0])).map(([h, ts]) => {
    const s = cS(ts)
    const rm = ts.filter(t => t.resultado === "WIN").map(t => pn(t.rMaximo)).filter(v => v > 0)
    return {
      hour: h, ...s,
      avgRmax: rm.length ? Math.round(rm.reduce((a, c) => a + c, 0) / rm.length * 100) / 100 : 0
    }
  })
}

function atrAnalysis(trades) {
  return [[0, 10, "0-10"], [10, 15, "10-15"], [15, 20, "15-20"], [20, 25, "20-25"], [25, 30, "25-30"], [30, 40, "30-40"], [40, 999, "40+"]]
    .map(([lo, hi, label]) => ({ range: label, ...cS(rT(trades).filter(t => { const a = pn(t.atr); return a > lo && a <= hi })) }))
    .filter(x => x.total > 0)
}

function slAnalysis(trades) {
  return [[0, 15, "1-15"], [15, 20, "15-20"], [20, 25, "20-25"], [25, 30, "25-30"], [30, 40, "30-40"], [40, 999, "40+"]]
    .map(([lo, hi, label]) => ({ range: label, ...cS(rT(trades).filter(t => { const p = pn(t.puntosSlStr); return p > lo && p <= hi })) }))
    .filter(x => x.total > 0)
}

function buildTips(trades) {
  const t2 = rT(trades)
  if (t2.length < 5) return []
  const tp = [], s = cS(t2), ha = hourAnalysis(t2)
  if (ha.length) {
    const best = ha.reduce((a, x) => x.totalR > a.totalR ? x : a, ha[0])
    if (best.total >= 3) tp.push({ type: "green", text: `Mejor hora: ${best.hour} (${best.winRate.toFixed(2)}%WR, ${best.totalR > 0 ? "+" : ""}${best.totalR}R)` })
  }
  if (ha.length) {
    const worst = ha.reduce((a, x) => x.totalR < a.totalR ? x : a, ha[0])
    if (worst.total >= 3 && worst.totalR < 0) tp.push({ type: "red", text: `Evita ${worst.hour}: ${worst.winRate.toFixed(2)}%WR, ${worst.totalR}R` })
  }
  if (s.maxLossStreak >= 3) tp.push({ type: "red", text: `Racha SL: ${s.maxLossStreak}${s.curLossStreak >= 2 ? " (now:" + s.curLossStreak + ")" : ""}` })
  if (s.recoveryFactor !== Infinity && s.recoveryFactor > 0) tp.push({ type: s.recoveryFactor >= 2 ? "green" : "yellow", text: `Recovery: ${s.recoveryFactor.toFixed(2)}` })
  if (s.sharpeRatio) tp.push({ type: s.sharpeRatio >= 1 ? "green" : s.sharpeRatio >= .5 ? "yellow" : "red", text: `Sharpe: ${s.sharpeRatio.toFixed(2)}` })
  if (!s.sampleValid) tp.push({ type: "yellow", text: `${s.total} trades. Min 30.` })
  return tp
}

// ═══════════════════════════════════════════════
// NT8 PARSER
// ═══════════════════════════════════════════════
function parseNT8Time(str) {
  if (!str) return null
  try {
    const parts = str.trim().split(" ")
    const dateParts = parts[0].split("/").map(Number)
    const timeParts = (parts[1] || "0:0:0").split(":").map(Number)
    const ampm = (parts[2] || "AM").toUpperCase()
    let h = timeParts[0]
    if (ampm === "PM" && h < 12) h += 12
    if (ampm === "AM" && h === 12) h = 0
    return new Date(dateParts[2], dateParts[0] - 1, dateParts[1], h, timeParts[1], timeParts[2] || 0)
  } catch { return null }
}

const getMultiplier = inst => {
  if (!inst) return 2
  const u = inst.toUpperCase()
  return u.startsWith("MNQ") ? 2 : u.startsWith("NQ") ? 20 : 2
}

function parseNT8CSV(csvText) {
  const lines = csvText.replace(/\r/g, "").split("\n").filter(l => l.trim())
  if (lines.length < 2) return []

  const hdr = lines[0].split(",").map(h => h.trim())
  const iI = hdr.indexOf("Instrument")
  const iA = hdr.indexOf("Action")
  const iQ = hdr.indexOf("Quantity")
  const iP = hdr.indexOf("Price")
  const iT = hdr.indexOf("Time")
  const iE = hdr.indexOf("E/X")
  if (iA < 0 || iQ < 0 || iP < 0 || iT < 0 || iE < 0) return []

  // Parse & deduplicate
  const seen = new Set()
  let rows = lines.slice(1).map(line => {
    const v = line.split(",").map(s => s.trim())
    return { inst: v[iI] || "", act: v[iA] || "", qty: parseInt(v[iQ]) || 0, pr: parseFloat(v[iP]) || 0, tm: v[iT] || "", ex: (v[iE] || "").trim() }
  }).filter(r => r.act && r.qty && r.pr && r.tm).filter(r => {
    const k = `${r.tm}|${r.act}|${r.qty}|${r.pr}|${r.ex}`
    if (seen.has(k)) return false
    seen.add(k); return true
  })
  rows.sort((a, b) => (parseNT8Time(a.tm) || 0) - (parseNT8Time(b.tm) || 0))

  // Build trade from entry + exits
  function makeTrade(isBuy, entryPrice, entryQty, instrument, entryTimeStr, exitRows) {
    const mult = getMultiplier(instrument)
    const totalXQ = exitRows.reduce((a, e) => a + e.qty, 0)
    const wavgExit = exitRows.reduce((a, e) => a + e.pr * e.qty, 0) / totalXQ
    const exitTime = parseNT8Time(exitRows[exitRows.length - 1].tm)
    const contracts = Math.min(entryQty, totalXQ)
    const pts = isBuy ? wavgExit - entryPrice : entryPrice - wavgExit
    const ptsR = Math.round(pts * 100) / 100
    const dollarPL = ptsR * contracts * mult
    const rVal = Math.round(dollarPL / RV * 100) / 100

    const entryDate = parseNT8Time(entryTimeStr)
    const fecha = entryDate ? `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, "0")}-${String(entryDate.getDate()).padStart(2, "0")}` : ""
    const hi = entryDate ? `${String(entryDate.getHours()).padStart(2, "0")}:${String(entryDate.getMinutes()).padStart(2, "0")}` : ""
    const hf = exitTime ? `${String(exitTime.getHours()).padStart(2, "0")}:${String(exitTime.getMinutes()).padStart(2, "0")}` : ""

    let resultado, rResultado
    if (dollarPL > 5) { resultado = "WIN"; rResultado = String(Math.round(Math.abs(rVal) * 100) / 100) }
    else if (dollarPL < -5) { resultado = "SL"; rResultado = String(Math.round(rVal * 100) / 100) }
    else { resultado = "BE"; rResultado = "0" }

    return {
      ...DFT, fecha, horaInicio: hi, horaFinal: hf,
      duracionTrade: String(cDur(hi, hf) || ""),
      buySell: isBuy ? "BUY" : "SELL",
      puntosSlStr: String(Math.abs(ptsR)),
      rResultado, resultado,
      notas: `NT8: ${instrument} ${contracts}ct ${ptsR}pts ${fmt$(Math.round(dollarPL))} (${rVal}R)`
    }
  }

  // ── PASS 1: Sequential Entry → opposite Exit ──
  const used = new Set()
  const trades = []
  let i = 0
  while (i < rows.length) {
    const r = rows[i]
    if (r.ex !== "Entry") { i++; continue }
    const isBuy = r.act === "Buy"
    const exits = []
    let xq = 0, j = i + 1
    while (j < rows.length && xq < r.qty) {
      const nr = rows[j]
      if (nr.ex === "Exit") {
        const isOpp = (isBuy && nr.act === "Sell") || (!isBuy && nr.act === "Buy")
        if (isOpp) { exits.push({ idx: j, ...nr }); xq += nr.qty } else break
      } else if (nr.ex === "Entry") break
      j++
    }
    if (exits.length) {
      trades.push(makeTrade(isBuy, r.pr, r.qty, r.inst, r.tm, exits))
      used.add(i)
      exits.forEach(e => used.add(e.idx))
      i = exits[exits.length - 1].idx + 1
    } else { i++ }
  }

  // ── PASS 2: Match leftovers same-day ──
  const unmatched = rows.map((r, idx) => ({ idx, ...r })).filter(r => !used.has(r.idx) && r.ex === "Entry")
  const orphans = rows.map((r, idx) => ({ idx, ...r })).filter(r => !used.has(r.idx) && r.ex === "Exit")

  const entryGroups = {}
  unmatched.forEach(r => {
    const d = parseNT8Time(r.tm)
    if (!d) return
    const k = `${d.toDateString()}|${r.act}`
    if (!entryGroups[k]) entryGroups[k] = []
    entryGroups[k].push(r)
  })
  const exitGroups = {}
  orphans.forEach(r => {
    const d = parseNT8Time(r.tm)
    if (!d) return
    const k = `${d.toDateString()}|${r.act}`
    if (!exitGroups[k]) exitGroups[k] = []
    exitGroups[k].push(r)
  })

  const used2 = new Set()
  Object.entries(entryGroups).forEach(([ekey, entries]) => {
    const [dateStr, eAction] = ekey.split("|")
    const isBuy = eAction === "Buy"
    const xkey = `${dateStr}|${isBuy ? "Sell" : "Buy"}`
    const availExits = (exitGroups[xkey] || []).filter(x => !used2.has(x.idx))
    if (!availExits.length) return

    const totalEQ = entries.reduce((a, e) => a + e.qty, 0)
    const wavgEP = entries.reduce((a, e) => a + e.pr * e.qty, 0) / totalEQ
    const et = parseNT8Time(entries[0].tm)
    if (!et) return

    const matched = []
    let mq = 0
    availExits.sort((a, b) => (parseNT8Time(a.tm) || 0) - (parseNT8Time(b.tm) || 0))
    for (const ex of availExits) {
      const xt = parseNT8Time(ex.tm)
      if (!xt || xt < et || (xt - et) / 1000 > 28800) continue
      matched.push(ex)
      mq += ex.qty
      if (mq >= totalEQ) break
    }
    if (matched.length) {
      trades.push(makeTrade(isBuy, wavgEP, totalEQ, entries[0].inst, entries[0].tm, matched))
      matched.forEach(x => used2.add(x.idx))
    }
  })

return trades
  }

// ═══════════════════════════════════════════════
// PARTE 2: COMPONENTS + MODALS + MAIN APP LOGIC
// ═══════════════════════════════════════════════

// ── Small UI Components ──
const TP = ({ value, onChange, label }) => (
  <div className="field">
    <label>{label}</label>
    <select className="inp" value={value} onChange={e => onChange(e.target.value)}>
      {HRS.map(h => <option key={h} value={h}>{h}</option>)}
    </select>
  </div>
)

const MC = ({ label, value, sub, color, big }) => (
  <div className="mc">
    <div className="ml">{label}</div>
    <div className={`mv${big ? " big" : ""}`} style={{ color }}>{value}</div>
    {sub && <div className="ms">{sub}</div>}
  </div>
)

const RTag = ({ r }) => (
  <span className={`tag ${r === "SL" ? "tr" : r === "BE" ? "ty" : r === "SIN OP" ? "tgr" : "tg"}`}>{r}</span>
)
const DTag = ({ d }) => (
  <span className={`tag ${d === "ALCISTA" ? "tg" : d === "BAJISTA" ? "tr" : "ty"}`}>{d}</span>
)
const STag = ({ s }) => (
  <span className={`tag ${s === "NO" ? "tgr" : "ta"}`}>{s}</span>
)
const BTag = ({ b }) => (
  <span className={`tag ${b === "BUY" ? "tg" : "tr"}`}>{b}</span>
)

// ── Equity Curve ──
const EC = ({ trades: ts }) => {
  const t2 = rT(ts)
  if (t2.length < 2) return <div className="em">Min 2 trades</div>
  const sorted = [...t2].sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
  let cum = 0
  const pts = [0, ...sorted.map(t => (cum += gR(t), Math.round(cum * 100) / 100))]
  const mn = Math.min(...pts), mx = Math.max(...pts), rng = mx - mn || 1
  const w = 600, h = 180, p = 40
  const tx = i => p + (i / (pts.length - 1)) * (w - p * 2)
  const ty = v => h - p - ((v - mn) / rng) * (h - p * 2)
  const line = pts.map((v, i) => `${i === 0 ? "M" : "L"} ${tx(i).toFixed(1)} ${ty(v).toFixed(1)}`).join(" ")
  const area = line + ` L ${tx(pts.length - 1).toFixed(1)} ${ty(mn).toFixed(1)} L ${tx(0).toFixed(1)} ${ty(mn).toFixed(1)} Z`
  const col = cum >= 0 ? "var(--green)" : "var(--red)"
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", display: "block" }}>
      <defs>
        <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity={0.25} />
          <stop offset="100%" stopColor={col} stopOpacity={0} />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((pc, i) => {
        const y = ty(mn + pc * rng)
        return (
          <g key={i}>
            <line x1={p} y1={y} x2={w - p} y2={y} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="4 4" />
            <text x={p - 6} y={y + 4} textAnchor="end" fill="var(--text3)" fontSize={10} fontFamily="var(--mono)">
              {Math.round((mn + pc * rng) * 10) / 10}R
            </text>
          </g>
        )
      })}
      <path d={area} fill="url(#eqFill)" />
      <path d={line} fill="none" stroke={col} strokeWidth={2.5} strokeLinejoin="round" />
      <circle cx={tx(pts.length - 1)} cy={ty(pts[pts.length - 1])} r={4} fill={col} />
    </svg>
  )
}

// ── Bar Chart ──
const BC = ({ data, labels, height = 130, unit = "", colors }) => {
  if (!data.length || data.every(v => v === 0)) return <div className="em">-</div>
  const max = Math.max(...data.map(Math.abs), 0.1)
  const bw = Math.min(44, Math.max(18, 300 / data.length))
  const tw = data.length * (bw + 6) + 16
  const bl = height - 12
  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={Math.max(tw, 200)} height={height + 28}>
        <line x1={8} y1={bl} x2={tw} y2={bl} stroke="var(--border)" strokeWidth={1} />
        {data.map((v, i) => {
          const bh = Math.abs(v) / max * (height - 30)
          const x = i * (bw + 6) + 12
          const pos = v >= 0
          const y = pos ? bl - bh : bl
          const fill = colors ? colors[i] : pos ? "var(--green)" : "var(--red)"
          return (
            <g key={i}>
              <rect x={x} y={y} width={bw} height={Math.max(bh, 2)} rx={3} fill={fill} opacity={0.85} />
              <text x={x + bw / 2} y={pos ? y - 4 : y + bh + 12} textAnchor="middle" fill="var(--text2)" fontSize={9} fontFamily="var(--mono)">
                {Math.round(v * 10) / 10}{unit}
              </text>
              <text x={x + bw / 2} y={height + 22} textAnchor="middle" fill="var(--text3)" fontSize={8} fontFamily="var(--mono)">
                {labels && labels[i]}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ═══════════════════════════════════════════════
// DAY MODAL — click en un dia del calendario
// ═══════════════════════════════════════════════
function DayModal({ date, trades, onClose, onViewSS }) {
  const dt = trades.filter(t => t.fecha === date)
  const real = rT(dt)
  const sinop = dt.filter(isSO)
  const s = cS(real)
  const dayR = Math.round(real.reduce((a, t) => a + gR(t), 0) * 100) / 100

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 800, maxHeight: "85vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--mono)" }}>
            {fmtD(date)}{" "}
            <span style={{ fontSize: 14, color: dayR >= 0 ? "var(--green)" : "var(--red)" }}>
              {real.length ? fmt$(Math.round(dayR * RV)) : ""}
            </span>
          </h2>
          <button className="btn bo bx" onClick={onClose}>✕</button>
        </div>

        {sinop.length > 0 && (
          <div style={{ marginBottom: 12, padding: "8px 14px", background: "rgba(90,100,120,.1)", borderRadius: 8, borderLeft: "3px solid var(--text3)" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text3)", fontWeight: 600 }}>SIN OP</span>
            {sinop.map((t, i) => t.notas ? <span key={i} style={{ fontSize: 12, color: "var(--text2)", marginLeft: 8 }}>— {t.notas}</span> : null)}
          </div>
        )}

        {real.length > 0 && (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              {[
                ["N", s.total],
                ["Win%", s.winRate.toFixed(2) + "%", s.winRate >= 50 ? "var(--green)" : "var(--red)"],
                ["R", fmtR(s.totalR), s.totalR >= 0 ? "var(--green)" : "var(--red)"],
                ["PF", fmtPF(s.profitFactor)]
              ].map(([l, v, c]) => (
                <div key={l} style={{ background: "var(--bg)", borderRadius: 8, padding: "8px 14px" }}>
                  <div className="ml">{l}</div>
                  <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 14, color: c }}>{v}</div>
                </div>
              ))}
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead><tr><th>Hora</th><th>Setup</th><th>B/S</th><th>R</th><th>P&L</th><th>Res</th><th></th></tr></thead>
                <tbody>
                  {real.map(t => {
                    const r = gR(t)
                    return (
                      <tr key={t.id}>
                        <td className="mono" style={{ fontSize: 11 }}>{t.horaInicio}→{t.horaFinal}</td>
                        <td><STag s={t.setup} /></td>
                        <td><BTag b={t.buySell} /></td>
                        <td className="mono bold" style={{ color: r > 0 ? "var(--green)" : r < 0 ? "var(--red)" : "var(--yellow)" }}>{fmtR(r)}</td>
                        <td className="mono bold" style={{ color: r >= 0 ? "var(--green)" : "var(--red)" }}>{fmt$(Math.round(r * RV))}</td>
                        <td><RTag r={t.resultado} /></td>
                        <td>
                          {t.screenshot && (
                            <img
                              src={t.screenshot}
                              style={{ maxHeight: 40, borderRadius: 4, cursor: "pointer" }}
                              onClick={() => onViewSS(t.screenshot)}
                            />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!dt.length && <div className="em">Sin actividad</div>}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
// NT8 IMPORT MODAL
// ═══════════════════════════════════════════════
function NT8Modal({ onImport, onClose }) {
  const [preview, setPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [fileCount, setFileCount] = useState(0)

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setFileCount(files.length)
    const texts = await Promise.all(files.map(f => new Promise((res, rej) => {
      const rd = new FileReader()
      rd.onload = ev => res(ev.target.result)
      rd.onerror = rej
      rd.readAsText(f)
    })))
    const allLines = []
    let header = ""
    texts.forEach(text => {
      const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim())
      if (lines.length < 2) return
      if (!header) header = lines[0]
      allLines.push(...lines.slice(1))
    })
    if (!header) { setPreview([]); return }
    setPreview(parseNT8CSV(header + "\n" + allLines.join("\n")))
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 700, maxHeight: "85vh", overflow: "auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--purple)", fontFamily: "var(--mono)" }}>Importar NT8</h2>
          <button className="btn bo bx" onClick={onClose}>✕</button>
        </div>

        <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 14 }}>
          Sube CSVs de ejecuciones de NinjaTrader 8 (puedes seleccionar multiples).
        </p>

        <input type="file" accept=".csv" multiple onChange={handleFiles} style={{ fontSize: 12, color: "var(--text)", marginBottom: 14, display: "block" }} />

        {preview && preview.length > 0 && (
          <>
            <div style={{ marginBottom: 10, padding: "8px 14px", background: "var(--gd)", borderRadius: 8, display: "flex", gap: 16, alignItems: "center" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--green)", fontWeight: 700 }}>{preview.length} trades</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>
                {preview.filter(t => t.resultado === "WIN").length}W{" "}
                {preview.filter(t => t.resultado === "SL").length}L{" "}
                {preview.filter(t => t.resultado === "BE").length}BE
              </span>
              {fileCount > 1 && <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)" }}>{fileCount} archivos</span>}
            </div>

            <div style={{ overflowX: "auto", maxHeight: 250, overflowY: "auto", marginBottom: 14 }}>
              <table className="tbl">
                <thead><tr><th>Fecha</th><th>B/S</th><th>P&L</th><th>Res</th></tr></thead>
                <tbody>
                  {preview.slice(0, 25).map((t, i) => {
                    const r = gR(t)
                    return (
                      <tr key={i}>
                        <td className="mono">{fmtD(t.fecha)}</td>
                        <td><BTag b={t.buySell} /></td>
                        <td className="mono bold" style={{ color: r > 0 ? "var(--green)" : r < 0 ? "var(--red)" : "var(--yellow)" }}>{fmt$(Math.round(r * RV))}</td>
                        <td><RTag r={t.resultado} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {preview.length > 25 && <div style={{ fontSize: 11, color: "var(--text3)", textAlign: "center", padding: 8 }}>...y {preview.length - 25} mas</div>}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn bp" onClick={async () => { setImporting(true); await onImport(preview); setImporting(false); onClose() }} disabled={importing}>
                {importing ? "..." : `Importar ${preview.length}`}
              </button>
              <button className="btn bo" onClick={onClose}>Cancelar</button>
            </div>
          </>
        )}

        {preview && preview.length === 0 && <div className="em">No se detectaron trades</div>}
        {!preview && <div className="em">Selecciona CSVs de NinjaTrader 8</div>}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
// LOGIN SCREEN
// ═══════════════════════════════════════════════
function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState("login")
  const [user, setUser] = useState("")
  const [pass, setPass] = useState("")
  const [err, setErr] = useState("")
  const [loading, setLoading] = useState(false)

  const doLogin = async () => {
    if (!user || !pass) return setErr("Llena ambos campos")
    setLoading(true); setErr("")
    try {
      const res = await supa(`users?username=eq.${encodeURIComponent(user)}&select=*`)
      const data = await res.json()
      if (!data.length) { setErr("No existe"); setLoading(false); return }
      if (data[0].password !== pass) { setErr("Incorrecta"); setLoading(false); return }
      localStorage.setItem("btj_user", JSON.stringify({ id: data[0].id, username: data[0].username }))
      onLogin(data[0])
    } catch { setErr("Error") }
    setLoading(false)
  }

  const doRegister = async () => {
    if (!user || !pass) return setErr("Llena ambos campos")
    if (user.length < 3) return setErr("Min 3 caracteres")
    if (pass.length < 4) return setErr("Min 4 caracteres")
    setLoading(true); setErr("")
    try {
      const countRes = await supa("users?select=id")
      const countData = await countRes.json()
      if (countData.length >= 8) { setErr("Max 8 usuarios"); setLoading(false); return }
      const chk = await supa(`users?username=eq.${encodeURIComponent(user)}&select=id`)
      const chkD = await chk.json()
      if (chkD.length) { setErr("Ya existe"); setLoading(false); return }
      const res = await supa("users", { method: "POST", body: JSON.stringify({ username: user, password: pass }) })
      const data = await res.json()
      if (data && data[0]) {
        localStorage.setItem("btj_user", JSON.stringify({ id: data[0].id, username: data[0].username }))
        onLogin(data[0])
      } else setErr("Error al crear")
    } catch { setErr("Error") }
    setLoading(false)
  }

  const handleKey = e => { if (e.key === "Enter") { mode === "login" ? doLogin() : doRegister() } }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "40px 36px", width: 360, maxWidth: "90vw" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--accent)", textAlign: "center", marginBottom: 4, fontFamily: "var(--mono)" }}>BT Journal</h1>
        <p style={{ textAlign: "center", color: "var(--text3)", fontSize: 12, marginBottom: 28, fontFamily: "var(--mono)" }}>Trading Pro</p>
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "var(--bg)", borderRadius: 8, padding: 3 }}>
          <button onClick={() => { setMode("login"); setErr("") }} style={{ flex: 1, padding: 8, border: "none", borderRadius: 6, background: mode === "login" ? "var(--ad)" : "transparent", color: mode === "login" ? "var(--accent)" : "var(--text3)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Entrar</button>
          <button onClick={() => { setMode("register"); setErr("") }} style={{ flex: 1, padding: 8, border: "none", borderRadius: 6, background: mode === "register" ? "var(--ad)" : "transparent", color: mode === "register" ? "var(--accent)" : "var(--text3)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Registro</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="field"><label>Usuario</label><input className="inp" value={user} onChange={e => setUser(e.target.value.toLowerCase().trim())} onKeyDown={handleKey} /></div>
          <div className="field"><label>Contrasena</label><input className="inp" type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={handleKey} /></div>
          {err && <div style={{ color: "var(--red)", fontSize: 12, fontFamily: "var(--mono)", textAlign: "center" }}>{err}</div>}
          <button className="btn bp" style={{ width: "100%", marginTop: 8 }} onClick={mode === "login" ? doLogin : doRegister} disabled={loading}>
            {loading ? "..." : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
// MAIN APP — State + Logic (sin render)
// ═══════════════════════════════════════════════
function MainApp({ user, onLogout }) {
  const [allTrades, setAllTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState("dashboard")
  const [form, setForm] = useState({ ...DFT })
  const [editId, setEditId] = useState(null)
  const [fP, setFP] = useState("all")
  const [fS, setFS] = useState("all")
  const [fN, setFN] = useState("")
  const [fd1, setFd1] = useState("")
  const [fd2, setFd2] = useState("")
  const [viewSS, setViewSS] = useState(null)
  const [sb, setSb] = useState(window.innerWidth > 900)
  const [calMonth, setCM] = useState(new Date().getMonth())
  const [calYear, setCY] = useState(new Date().getFullYear())
  const [saving, setSaving] = useState(false)
  const [appMode, setAppMode] = useState("bt")
  const [showNT8, setShowNT8] = useState(false)
  const [dayModal, setDayModal] = useState(null)
  const fileRef = useRef()

  // Trades del modo actual
  const trades = useMemo(() => allTrades.filter(t => (t.mode || "bt") === appMode), [allTrades, appMode])

  // Load ALL trades
  const loadTrades = useCallback(async () => {
    try {
      const res = await supa(`trades?user_id=eq.${user.id}&select=*&order=created_at.desc`)
      const data = await res.json()
      if (Array.isArray(data)) setAllTrades(data.map(d2t))
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [user.id])

  useEffect(() => { loadTrades() }, [loadTrades])
  useEffect(() => {
    const fn = () => setSb(window.innerWidth > 900)
    window.addEventListener("resize", fn)
    return () => window.removeEventListener("resize", fn)
  }, [])

  const setHI = v => setForm(f => ({ ...f, horaInicio: v, duracionTrade: String(cDur(v, f.horaFinal) || "") }))
  const setHF = v => setForm(f => ({ ...f, horaFinal: v, duracionTrade: String(cDur(f.horaInicio, v) || "") }))

  // ── Save trade ──
  const save = async () => {
    if (!form.fecha) return alert("Fecha obligatoria")
    setSaving(true)
    const t = { ...form, duracionTrade: String(cDur(form.horaInicio, form.horaFinal) || "") }
    if (isSO(t)) {
      t.rResultado = "0"; t.resultado = "SIN OP"; t.setup = "NO"
    } else if (appMode === "bt") {
      if (t.resultado === "SL") t.rResultado = "-1"
      if (t.resultado === "BE") t.rResultado = "0"
    } else {
      if (t.resultado === "BE") t.rResultado = "0"
      if (t.resultado === "SL" && !pn(t.rResultado)) t.rResultado = "-1"
    }
    try {
      if (editId) {
        await supa(`trades?id=eq.${editId}`, { method: "PATCH", body: JSON.stringify(t2d(t, user.id, appMode)) })
        setEditId(null)
      } else {
        await supa("trades", { method: "POST", body: JSON.stringify(t2d(t, user.id, appMode)) })
      }
      await loadTrades()
      setForm({ ...DFT })
      setTab("dashboard")
    } catch (e) { alert("Error guardando") }
    finally { setSaving(false) }
  }

  // ── Save SIN OP (directo) ──
  const saveSinOp = async () => {
    if (!form.fecha) return alert("Fecha obligatoria")
    setSaving(true)
    try {
      await supa("trades", {
        method: "POST",
        body: JSON.stringify(t2d({ ...DFT, fecha: form.fecha, setup: "NO", resultado: "SIN OP", rResultado: "0", notas: form.notas || "" }, user.id, appMode))
      })
      await loadTrades()
      setForm({ ...DFT })
      alert("SIN OP registrado")
    } catch { alert("Error") }
    finally { setSaving(false) }
  }

  const del = async id => { if (!confirm("Eliminar?")) return; await supa(`trades?id=eq.${id}`, { method: "DELETE" }); await loadTrades() }
  const edit = t => { setForm({ ...DFT, ...t }); setEditId(t.id); setTab("addTrade") }
  const goTab = t => { setTab(t); if (window.innerWidth <= 900) setSb(false); if (t === "addTrade" && !editId) setForm({ ...DFT }) }

  const exportCSV = () => {
    const h = ["fecha", "horaInicio", "horaFinal", "duracionTrade", "atr", "setup", "contexto", "buySell", "puntosSlStr", "rResultado", "rMaximo", "resultado", "breakRangoM30", "direccionDia", "ddPuntos", "hayNoticia", "noticiaHora", "noticiaImpacto", "noticiaTipo", "m5", "m15", "m30", "notas"]
    const csv = [h.join(","), ...trades.map(t => h.map(k => `"${t[k] || ""}"`).join(","))].join("\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    a.download = `${appMode}_journal.csv`
    a.click()
  }

  const importCSV = async (e) => {
    const f = e.target.files[0]; if (!f) return
    setSaving(true)
    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        const lines = ev.target.result.split("\n").filter(Boolean)
        if (lines.length < 2) return
        const hd = lines[0].split(",").map(h => h.replace(/"/g, "").trim())
        const rows = lines.slice(1).map(line => {
          const vs = (line.match(/(".*?"|[^",]+)/g) || []).map(v => v.replace(/"/g, "").trim())
          const o = { ...DFT }
          hd.forEach((h, i) => { if (vs[i]) o[h] = vs[i] })
          return o
        })
        for (let i = 0; i < rows.length; i += 20) {
          await supa("trades", { method: "POST", body: JSON.stringify(rows.slice(i, i + 20).map(t => t2d(t, user.id, appMode))) })
        }
        await loadTrades()
        alert(rows.length + " trades importados")
      } catch { alert("Error importando") }
      finally { setSaving(false) }
    }
    reader.readAsText(f)
  }

  const deleteAll = async () => {
    if (!trades.length) return
    if (!confirm(`Borrar ${trades.length} trades?`)) return
    if (!confirm("CONFIRMAR: Esto es permanente.")) return
    setSaving(true)
    try { await supa(`trades?user_id=eq.${user.id}&mode=eq.${appMode}`, { method: "DELETE" }); await loadTrades() }
    catch { }
    finally { setSaving(false) }
  }

  const handleNT8Import = async (parsedTrades) => {
    setSaving(true)
    try {
      for (let i = 0; i < parsedTrades.length; i += 20) {
        await supa("trades", { method: "POST", body: JSON.stringify(parsedTrades.slice(i, i + 20).map(t => t2d(t, user.id, "journal"))) })
      }
      await loadTrades()
      setAppMode("journal")
      alert(parsedTrades.length + " trades importados en JOURNAL")
    } catch (e) { alert("Error: " + e.message) }
    finally { setSaving(false) }
  }

  const handleFile = e => {
    const f = e.target.files[0]; if (!f) return
    const r = new FileReader()
    r.onload = ev => setForm(p => ({ ...p, screenshot: ev.target.result, screenshotPreview: ev.target.result }))
    r.readAsDataURL(f)
  }

  const F = (label, name, type = "text", opts) => (
    <div className="field">
      <label>{label}</label>
      {opts
        ? <select className="inp" value={form[name] || ""} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}>
            {opts.map(o => <option key={o} value={o}>{o || "—"}</option>)}
          </select>
        : <input className="inp" type={type} value={form[name] || ""} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))} step={type === "number" ? "any" : undefined} />
      }
    </div>
  )

  // ── Computed data ──
  const filtered = useMemo(() => {
    let ft = [...trades]
    if (fS !== "all") ft = ft.filter(t => t.setup === fS)
    if (fd1) ft = ft.filter(t => t.fecha >= fd1)
    if (fd2) ft = ft.filter(t => t.fecha <= fd2)
    if (fN) ft = ft.slice(0, parseInt(fN) || ft.length)
    if (fP !== "all") {
      const now = new Date()
      if (fP === "week") { const w = new Date(now - 7 * 864e5); ft = ft.filter(t => new Date(t.fecha) >= w) }
      else if (fP === "month") ft = ft.filter(t => { const d = new Date(t.fecha); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() })
      else if (fP === "year") ft = ft.filter(t => new Date(t.fecha).getFullYear() === now.getFullYear())
    }
    return ft.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
  }, [trades, fP, fS, fN, fd1, fd2])

  const stats = useMemo(() => cS(filtered), [filtered])
  const extra = useMemo(() => extraS(filtered), [filtered])
  const daily = useMemo(() => grpBy(trades, t => t.fecha), [trades])
  const monthly = useMemo(() => grpBy(trades, t => getMo(t.fecha)), [trades])
  const yearly = useMemo(() => grpBy(trades, t => t.fecha ? `20${getYr(t.fecha)}` : ""), [trades])
  const setupStats = useMemo(() => { const m = {}; SR.forEach(s => m[s] = cS(trades.filter(t => t.setup === s))); return m }, [trades])
  const rTaken = useMemo(() => rDist(filtered, "rResultado"), [filtered])
  const rMax = useMemo(() => rDist(filtered, "rMaximo"), [filtered])
  const hStats = useMemo(() => hourAnalysis(filtered), [filtered])
  const atrStats = useMemo(() => atrAnalysis(filtered), [filtered])
  const slStats = useMemo(() => slAnalysis(filtered), [filtered])
  const tipsData = useMemo(() => genTips(filtered), [filtered])

  const isSinOpForm = isSO(form)
  const isWin = form.resultado === "WIN"
  const autoDur = cDur(form.horaInicio, form.horaFinal)
  const ddPct = gDD(form)

  const accentColor = appMode === "journal" ? "var(--purple)" : "var(--accent)"
  const modeLabel = appMode === "bt" ? "BACKTESTING" : "JOURNAL"

  const nav = [
    { id: "dashboard", l: "Dashboard", i: "◈" },
    { id: "trades", l: "Trades", i: "☰" },
    { id: "addTrade", l: editId ? "Editar" : "Nuevo", i: "+" },
    { id: "sinop", l: "Sin Op", i: "○" },
    { id: "estadisticas", l: "Stats", i: "▥" },
    { id: "setups", l: "Setups", i: "◆" },
    { id: "avanzado", l: "Avanzado", i: "◉" },
    { id: "tips", l: "Tips", i: "★" }
  ]

  // ── Stats table helper ──
  const STable = ({ title, data, cols, row, chart }) => (
    <div className="card">
      <div className="st">{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: chart ? "minmax(0,1.3fr) minmax(0,1fr)" : "1fr", gap: 16 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead><tr>{cols.map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{data.map((d, i) => (
              <tr key={i}>{row(d).map((c, j) => {
                if (Array.isArray(c)) return <td key={j} className={`mono ${c[1]} ${c[2] ? "bold" : ""}`}>{c[0]}</td>
                return <td key={j} className="mono">{c}</td>
              })}</tr>
            ))}</tbody>
          </table>
          {!data.length && <div className="em">-</div>}
        </div>
        {chart && <BC data={chart.slice(0, 12).reverse().map(w => w.totalR)} labels={chart.slice(0, 12).reverse().map(w => w.key)} unit="R" />}
      </div>
    </div>
  )

  // ── Filters bar ──
  const Filters = () => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <select className="inp" style={{ width: "auto" }} value={fS} onChange={e => setFS(e.target.value)}>
        <option value="all">All</option>
        {SR.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <div className="pb">
        {["all", "week", "month", "year"].map(p => (
          <button key={p} className={`pbtn ${fP === p ? "active" : ""}`} onClick={() => setFP(p)}>
            {{ all: "Todo", week: "7d", month: "Mes", year: "Ano" }[p]}
          </button>
        ))}
      </div>
      <input type="date" className="inp" style={{ width: 130, fontSize: 11 }} value={fd1} onChange={e => setFd1(e.target.value)} title="Desde" />
      <input type="date" className="inp" style={{ width: 130, fontSize: 11 }} value={fd2} onChange={e => setFd2(e.target.value)} title="Hasta" />
      {(fd1 || fd2) && <button className="btn bx bo" onClick={() => { setFd1(""); setFd2("") }}>✕</button>}
    </div>
  )

  // ── Calendar data ──
  const calByDay = useMemo(() => {
    const bd = {}
    trades.forEach(t => {
      if (!t.fecha) return
      const d = new Date(t.fecha)
      if (d.getMonth() === calMonth && d.getFullYear() === calYear) {
        const day = d.getDate()
        if (!bd[day]) bd[day] = []
        bd[day].push(t)
      }
    })
    return bd
  }, [trades, calMonth, calYear])

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay()
  const monthName = new Date(calYear, calMonth).toLocaleString("es", { month: "long", year: "numeric" })

  const calCells = []
  for (let i = 0; i < firstDayOfWeek; i++) calCells.push(null)
  for (let d = 1; d <= daysInMonth; d++) calCells.push(d)
  const calWeeks = []
  for (let i = 0; i < calCells.length; i += 7) calWeeks.push(calCells.slice(i, i + 7))

  const weekSums = calWeeks.map(wk => {
    let r = 0, c = 0
    wk.forEach(d => {
      if (d && calByDay[d]) rT(calByDay[d]).forEach(t => { r += gR(t); c++ })
    })
    return { r: Math.round(r * 100) / 100, c }
  })

  const monthTrades = trades.filter(t => {
    if (!t.fecha) return false
    const d = new Date(t.fecha)
    return d.getMonth() === calMonth && d.getFullYear() === calYear
  })
  const monthR = Math.round(rT(monthTrades).reduce((a, t) => a + gR(t), 0) * 100) / 100

  const makeDate = d => `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`

  if (loading) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ color: accentColor, fontFamily: "var(--mono)" }}>Cargando...</div>
    </div>
  }

    // ═══════════════════════════════════════════════
  // PARTE 3: RENDER JSX
  // ═══════════════════════════════════════════════

  return (
    <>
      {/* Screenshot modal */}
      {viewSS && <div className="ss-modal" onClick={() => setViewSS(null)}><img src={viewSS} /></div>}
      {/* NT8 import modal */}
      {showNT8 && <NT8Modal onImport={handleNT8Import} onClose={() => setShowNT8(false)} />}
      {/* Day detail modal */}
      {dayModal && <DayModal date={dayModal} trades={trades} onClose={() => setDayModal(null)} onViewSS={setViewSS} />}
      {/* Mobile overlay */}
      {sb && window.innerWidth <= 900 && <div className="overlay" onClick={() => setSb(false)} />}

      {/* Mobile top bar */}
      <div className="mobile-bar">
        <button onClick={() => setSb(!sb)} style={{ background: "none", border: "none", color: "var(--text)", fontSize: 20, cursor: "pointer" }}>☰</button>
        <span style={{ fontWeight: 700, color: accentColor, fontFamily: "var(--mono)", fontSize: 13 }}>BT JOURNAL</span>
        <div style={{ width: 28 }} />
      </div>

      {/* ── SIDEBAR ── */}
      <div className={`sidebar ${sb ? "open" : "closed"}`}>
        <div className="sb-brand">
          <h1 style={{ color: accentColor }}>BT Journal</h1>
          <p style={{ color: "var(--green)" }}>{user.username}</p>
        </div>
        {/* Mode toggle BT / Journal */}
        <div style={{ padding: "10px 8px 0" }}>
          <div style={{ display: "flex", gap: 2, background: "var(--bg)", borderRadius: 8, padding: 3, marginBottom: 6 }}>
            <button onClick={() => { setAppMode("bt"); setTab("dashboard"); setEditId(null); setForm({ ...DFT }) }}
              style={{ flex: 1, padding: "8px 0", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700,
                background: appMode === "bt" ? "var(--ad)" : "transparent", color: appMode === "bt" ? "var(--accent)" : "var(--text3)" }}>BT</button>
            <button onClick={() => { setAppMode("journal"); setTab("dashboard"); setEditId(null); setForm({ ...DFT }) }}
              style={{ flex: 1, padding: "8px 0", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700,
                background: appMode === "journal" ? "var(--pd)" : "transparent", color: appMode === "journal" ? "var(--purple)" : "var(--text3)" }}>JOURNAL</button>
          </div>
        </div>
        {/* Nav buttons */}
        <nav className="sb-nav">
          {nav.map(n => (
            <button key={n.id} className={`sb-btn ${tab === n.id ? "active" : ""}`} onClick={() => goTab(n.id)}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 14, width: 18, textAlign: "center" }}>{n.i}</span>
              <span>{n.l}</span>
            </button>
          ))}
        </nav>
        {/* Footer buttons */}
        <div className="sb-footer">
          <button onClick={exportCSV}>Exportar CSV</button>
          <label>Importar CSV<input type="file" accept=".csv" onChange={importCSV} style={{ display: "none" }} /></label>
          {appMode === "journal" && <button onClick={() => setShowNT8(true)} style={{ color: "var(--purple)", background: "var(--pd)" }}>Importar NT8</button>}
          {trades.length > 0 && <button onClick={deleteAll} style={{ color: "var(--red)", background: "var(--rd)", fontSize: 10 }}>Borrar {trades.length} {modeLabel}</button>}
          <button onClick={() => { localStorage.removeItem("btj_user"); onLogout() }} style={{ color: "var(--red)" }}>Salir</button>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className={`main ${!sb || window.innerWidth <= 900 ? "full" : ""}`}>
        {saving && <div style={{ position: "fixed", top: 60, right: 20, background: "var(--ad)", color: accentColor, padding: "8px 16px", borderRadius: 8, fontFamily: "var(--mono)", fontSize: 12, zIndex: 999 }}>Guardando...</div>}

{/* ═══ TAB: DASHBOARD + CALENDAR ═══ */}
{tab === "dashboard" && (
  <>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
      <div>
        <h1 className="pt">Dashboard <span style={{ fontSize: 16, fontFamily: "var(--mono)", color: accentColor, fontWeight: 600 }}>{modeLabel}</span></h1>
        <p className="ps">{rT(trades).length} trades | 1R={fmt$(RV)}</p>
      </div>
      <Filters />
    </div>

    {/* Metrics */}
    <div className="metrics">
      <MC label="P&L" value={`${stats.totalR >= 0 ? "+" : ""}${stats.totalR}R`} sub={fmt$(stats.totalDollar)} color={stats.totalR >= 0 ? "var(--green)" : "var(--red)"} big />
      <MC label="Win%" value={`${stats.winRate.toFixed(2)}%`} color={stats.winRate >= 50 ? "var(--green)" : "var(--red)"} sub={`${stats.wins}W|${stats.losses}L|${stats.bes}BE`} />
      <MC label="PF" value={fmtPF(stats.profitFactor)} color={stats.profitFactor >= 1.5 ? "var(--green)" : stats.profitFactor >= 1 ? "var(--yellow)" : "var(--red)"} />
      <MC label="Exp" value={`${stats.expectancy}R`} color={stats.expectancy > 0 ? "var(--green)" : "var(--red)"} sub={fmt$(stats.expectDollar) + "/t"} />
      <MC label="Sharpe" value={stats.sharpeRatio.toFixed(2)} color={stats.sharpeRatio >= 1 ? "var(--green)" : stats.sharpeRatio >= 0.5 ? "var(--yellow)" : "var(--red)"} />
      <MC label="Recovery" value={stats.recoveryFactor === Infinity ? "∞" : stats.recoveryFactor.toFixed(2)} color={stats.recoveryFactor >= 2 ? "var(--green)" : "var(--yellow)"} sub={`DD:${stats.maxEquityDD || 0}R`} />
      <MC label="Payoff" value={stats.payoffRatio === Infinity ? "∞" : stats.payoffRatio.toFixed(2)} color={stats.payoffRatio >= 2 ? "var(--green)" : "var(--yellow)"} />
      <MC label="Trades" value={stats.total} sub={stats.sampleValid ? "OK" : "<30"} />
    </div>

    {/* Resumen */}
    <div className="card">
      <div className="st">Resumen</div>
      <div className="info-grid">
        <div className="info-item"><div className="ml">Dia + ganador</div><div className="val" style={{ color: "var(--green)" }}>{extra.bestDay}</div></div>
        <div className="info-item"><div className="ml">Dia + perdedor</div><div className="val" style={{ color: "var(--red)" }}>{extra.worstDay}</div></div>
        <div className="info-item"><div className="ml">Ops/dia</div><div className="val">{extra.avgOps}</div></div>
        <div className="info-item"><div className="ml">Mejor dia sem</div><div className="val" style={{ color: "var(--green)" }}>{extra.bestWd}</div></div>
        <div className="info-item"><div className="ml">Peor dia sem</div><div className="val" style={{ color: "var(--red)" }}>{extra.worstWd}</div></div>
        <div className="info-item"><div className="ml">Racha WIN</div><div className="val" style={{ color: "var(--green)" }}>{stats.maxWinStreak}{stats.curWinStreak > 1 ? ` (now:${stats.curWinStreak})` : ""}</div></div>
        <div className="info-item"><div className="ml">Racha LOSS</div><div className="val" style={{ color: "var(--red)" }}>{stats.maxLossStreak}{stats.curLossStreak > 1 ? ` (now:${stats.curLossStreak})` : ""}</div></div>
        <div className="info-item"><div className="ml">Dur WIN/SL/BE</div><div className="val">{stats.avgDurWin}/{stats.avgDurSL}/{stats.avgDurBE}min</div></div>
      </div>
    </div>

    {/* Equity + Resultados */}
    <div className="g2" style={{ marginBottom: 14 }}>
      <div className="card"><div className="st">Equity</div><EC trades={filtered} /></div>
      <div className="card">
        <div className="st">Resultados</div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {[["WIN", stats.wins, "var(--green)"], ["SL", stats.losses, "var(--red)"], ["BE", stats.bes, "var(--yellow)"]].map(([l, v, c]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "var(--mono)", color: c }}>{stats.total ? Math.round(v / stats.total * 10000) / 100 : 0}%</div>
              <div style={{ fontSize: 10, color: "var(--text3)" }}>{l}({v})</div>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* P&L diario */}
    <div className="card">
      <div className="st">P&L diario</div>
      <BC data={daily.slice(0, 20).reverse().map(d => d.totalR)} labels={daily.slice(0, 20).reverse().map(d => fmtD(d.key))} unit="R" />
    </div>

    {/* ── CALENDAR (same page) ── */}
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15, textTransform: "capitalize" }}>{monthName}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn bo bx" onClick={() => { if (calMonth === 0) { setCM(11); setCY(calYear - 1) } else setCM(calMonth - 1) }}>&lt;</button>
          <button className="btn bo bx" onClick={() => { if (calMonth === 11) { setCM(0); setCY(calYear + 1) } else setCM(calMonth + 1) }}>&gt;</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", fontSize: 10, fontFamily: "var(--mono)" }}>
        {["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Sem"].map(d => (
          <div key={d} style={{ padding: "8px 3px", textAlign: "center", color: "var(--text3)", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{d}</div>
        ))}
        {calWeeks.map((wk, wi) => (
          <React.Fragment key={wi}>
            {wk.map((d, di) => {
              if (!d) return <div key={di} style={{ padding: 10, borderBottom: "1px solid var(--border)", background: "var(--bg)" }} />
              const dayTrades = calByDay[d] || []
              const realTrades = rT(dayTrades)
              const hasSinOp = dayTrades.some(isSO)
              const dayR = Math.round(realTrades.reduce((a, t) => a + gR(t), 0) * 100) / 100
              const bg = hasSinOp && !realTrades.length ? "rgba(90,100,120,.08)"
                : realTrades.length ? (dayR > 0 ? "rgba(0,214,143,.08)" : dayR < 0 ? "rgba(255,71,87,.08)" : "var(--surface)")
                : "var(--surface)"
              return (
                <div key={di} style={{ padding: "6px 4px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", background: bg, minHeight: 58, cursor: dayTrades.length ? "pointer" : "default" }}
                  onClick={() => dayTrades.length && setDayModal(makeDate(d))}>
                  <div style={{ fontSize: 9, color: "var(--text3)", marginBottom: 3 }}>{d}</div>
                  {hasSinOp && !realTrades.length
                    ? <div style={{ fontSize: 10, color: "var(--text3)", fontWeight: 600 }}>SIN OP</div>
                    : realTrades.length
                      ? <><div style={{ fontSize: 13, fontWeight: 700, color: dayR > 0 ? "var(--green)" : dayR < 0 ? "var(--red)" : "var(--yellow)", fontFamily: "var(--mono)" }}>{fmt$(Math.round(dayR * RV))}</div>
                          <div style={{ fontSize: 8, color: "var(--text3)", marginTop: 1 }}>{realTrades.length}t</div></>
                      : <div style={{ fontSize: 8, color: "var(--text3)" }}>-</div>
                  }
                </div>
              )
            })}
            {/* Pad remaining days */}
            {Array(7 - wk.length).fill(null).map((_, i) => (
              <div key={`p${i}`} style={{ padding: 10, borderBottom: "1px solid var(--border)", background: "var(--bg)" }} />
            ))}
            {/* Week summary */}
            <div style={{ padding: "6px 4px", borderBottom: "1px solid var(--border)", background: "var(--surface2)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
              <div style={{ fontSize: 8, color: "var(--text3)" }}>S{wi + 1}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: weekSums[wi].r > 0 ? "var(--green)" : weekSums[wi].r < 0 ? "var(--red)" : "var(--text3)", fontFamily: "var(--mono)" }}>
                {weekSums[wi].c ? fmt$(Math.round(weekSums[wi].r * RV)) : "-"}
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>
      {/* Month footer */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, padding: "10px 18px", borderTop: "1px solid var(--border)", background: "var(--surface2)" }}>
        <span style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>TRADES: <b style={{ color: "var(--text)" }}>{rT(monthTrades).length}</b></span>
        <span style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>P&L: <b style={{ color: monthR >= 0 ? "var(--green)" : "var(--red)" }}>{monthR >= 0 ? "+" : ""}{fmt$(Math.round(monthR * RV))}</b></span>
      </div>
    </div>
  </>
)}

{/* ═══ TAB: TRADES ═══ */}
{tab === "trades" && (
  <>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
      <h1 className="pt">Trades</h1>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <Filters />
        <button className="btn bp bs" onClick={() => goTab("addTrade")}>+</button>
        {appMode === "journal" && <button className="btn bs" style={{ background: "var(--pd)", color: "var(--purple)" }} onClick={() => setShowNT8(true)}>NT8</button>}
      </div>
    </div>
    <div className="card" style={{ overflowX: "auto" }}>
      <table className="tbl" style={{ minWidth: 900 }}>
        <thead><tr>{["Fecha", "Hora", "Setup", "B/S", "R", "P&L", "Res", "Dir", "", ""].map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {filtered.map(t => {
            if (isSO(t)) return (
              <tr key={t.id} style={{ opacity: 0.5 }}>
                <td className="mono">{fmtD(t.fecha)}</td>
                <td colSpan={7} style={{ color: "var(--text3)", fontSize: 11 }}>SIN OP{t.notas ? " — " + t.notas : ""}</td>
                <td><div style={{ display: "flex", gap: 3 }}><button className="btn bo bx" onClick={() => edit(t)}>E</button><button className="btn bd bx" onClick={() => del(t.id)}>X</button></div></td>
              </tr>
            )
            const r = gR(t)
            return (
              <tr key={t.id}>
                <td className="mono">{fmtD(t.fecha)}</td>
                <td className="mono" style={{ fontSize: 10 }}>{t.horaInicio}→{t.horaFinal}</td>
                <td><STag s={t.setup} /></td>
                <td><BTag b={t.buySell} /></td>
                <td className="mono bold" style={{ color: r > 0 ? "var(--green)" : r < 0 ? "var(--red)" : "var(--yellow)" }}>{fmtR(r)}</td>
                <td className="mono bold" style={{ color: r >= 0 ? "var(--green)" : "var(--red)" }}>{fmt$(Math.round(r * RV))}</td>
                <td><RTag r={t.resultado} /></td>
                <td><DTag d={t.direccionDia} /></td>
                <td>{t.screenshot && <span style={{ cursor: "pointer", color: accentColor }} onClick={() => setViewSS(t.screenshot)}>Img</span>}</td>
                <td><div style={{ display: "flex", gap: 3 }}><button className="btn bo bx" onClick={() => edit(t)}>E</button><button className="btn bd bx" onClick={() => del(t.id)}>X</button></div></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!filtered.length && <div className="em">Sin trades</div>}
    </div>
  </>
)}

{/* ═══ TAB: SIN OP ═══ */}
{tab === "sinop" && (
  <>
    <h1 className="pt" style={{ marginBottom: 16 }}>Dia sin operacion</h1>
    <div className="card">
      <div className="form-grid">
        <div className="field">
          <label>Fecha</label>
          <input className="inp" type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
        </div>
        <div className="field">
          <label>Razon / Notas</label>
          <textarea className="inp" value={form.notas || ""} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} style={{ minHeight: 80 }} />
        </div>
      </div>
      <button className="btn bp" style={{ marginTop: 14 }} onClick={saveSinOp} disabled={saving}>
        {saving ? "..." : "Registrar SIN OP"}
      </button>
    </div>
  </>
)}

{/* ═══ TAB: ADD/EDIT TRADE ═══ */}
{tab === "addTrade" && (
  <>
    <h1 className="pt" style={{ marginBottom: 16 }}>{editId ? "Editar" : "Nuevo trade"}</h1>

    {/* General */}
    <div className="card">
      <div className="st">General</div>
      <div className="form-grid">
        {F("Fecha", "fecha", "date")}
        <TP label="Hora inicio" value={form.horaInicio} onChange={setHI} />
        <TP label="Hora final" value={form.horaFinal} onChange={setHF} />
        <div className="field"><label>Dur</label><div className="af">{autoDur ? autoDur + "m" : "-"}</div></div>
        {F("ATR", "atr", "number")}
      </div>
    </div>

    {/* Trade */}
    <div className="card">
      <div className="st">Trade</div>
      <div className="form-grid">
        {F("Setup", "setup", null, SETUPS)}
        {F("Contexto", "contexto", null, CTXS)}
        {F("Buy/Sell", "buySell", null, ["BUY", "SELL"])}
        {F("Puntos SL", "puntosSlStr", "number")}
        {F("DD pts", "ddPuntos", "number")}
        <div className="field">
          <label>DD%</label>
          <div className="af" style={{ color: ddPct !== null && ddPct > 50 ? "var(--red)" : "var(--purple)" }}>{ddPct !== null ? ddPct + "%" : "-"}</div>
        </div>
      </div>
    </div>

    {/* Resultado */}
    <div className="card">
      <div className="st">Resultado</div>
      <div className="form-grid">
        {F("Resultado", "resultado", null, RESS)}
        {(isWin || (appMode === "journal" && form.resultado === "SL")) && F("R", "rResultado", "number")}
        {isWin && F("Rmax", "rMaximo", "number")}
        {F("Break M30", "breakRangoM30", null, ["NO", "SI"])}
        {F("Dir", "direccionDia", null, DIRS)}
      </div>
      {form.resultado === "SL" && <p style={{ marginTop: 8, fontSize: 12, color: "var(--red)", fontFamily: "var(--mono)" }}>{appMode === "bt" ? "SL=-1R" : `SL=${pn(form.rResultado) ? form.rResultado + "R" : "-1R"}`}</p>}
      {form.resultado === "BE" && <p style={{ marginTop: 8, fontSize: 12, color: "var(--yellow)", fontFamily: "var(--mono)" }}>BE=0R</p>}
      {form.resultado === "SIN OP" && <p style={{ marginTop: 8, fontSize: 12, color: "var(--text3)", fontFamily: "var(--mono)" }}>Sin operacion — no afecta stats</p>}
      {isWin && pn(form.rResultado) > 0 && <p style={{ marginTop: 8, fontSize: 12, color: "var(--green)", fontFamily: "var(--mono)" }}>+{form.rResultado}R = +{fmt$(Math.round(pn(form.rResultado) * RV))}</p>}
    </div>

    {/* Noticias */}
    <div className="card">
      <div className="st">Noticias</div>
      <div className="form-grid">
        {F("Noticia?", "hayNoticia", null, ["NO", "SI"])}
        {form.hayNoticia === "SI" && F("Hora", "noticiaHora", null, NHS)}
        {form.hayNoticia === "SI" && F("Impacto", "noticiaImpacto", null, NIS)}
        {form.hayNoticia === "SI" && F("Tipo", "noticiaTipo", null, NTS)}
      </div>
    </div>

    {/* ORB */}
    <div className="card">
      <div className="st">ORB</div>
      <div className="form-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        {F("M5", "m5", "number")}
        {F("M15", "m15", "number")}
        {F("M30", "m30", "number")}
      </div>
    </div>

    {/* Screenshot & Notas */}
    <div className="card">
      <div className="st">Screenshot & Notas</div>
      <div className="g2">
        <div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
          <div className="uz" onClick={() => fileRef.current && fileRef.current.click()}>
            {form.screenshotPreview ? <img src={form.screenshotPreview} /> : <span style={{ fontSize: 12 }}>Subir img</span>}
          </div>
          {form.screenshotPreview && <button className="btn bd bx" style={{ marginTop: 6 }} onClick={() => setForm(f => ({ ...f, screenshot: null, screenshotPreview: null }))}>X</button>}
        </div>
        <div className="field">
          <label>Notas</label>
          <textarea className="inp" value={form.notas || ""} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
        </div>
      </div>
    </div>

    {/* Buttons */}
    <div style={{ display: "flex", gap: 10 }}>
      <button className="btn bp" onClick={save} disabled={saving}>{saving ? "..." : editId ? "Guardar" : "Registrar"}</button>
      {editId && <button className="btn bo" onClick={() => { setEditId(null); setForm({ ...DFT }); setTab("trades") }}>Cancelar</button>}
    </div>
  </>
)}

{/* ═══ TAB: STATS ═══ */}
{tab === "estadisticas" && (
  <>
    <h1 className="pt" style={{ marginBottom: 14 }}>Stats</h1>
    <div style={{ marginBottom: 12 }}><Filters /></div>
    <STable title="Dia" data={daily.slice(0, 30)} cols={["Fecha", "N", "W", "L", "Win%", "R", "P&L", "PF"]}
      row={d => [fmtD(d.key), d.total, [d.wins, "g"], [d.losses, "r"], [`${d.winRate.toFixed(2)}%`, d.winRate >= 50 ? "g" : "r"], [`${d.totalR > 0 ? "+" : ""}${d.totalR}R`, d.totalR >= 0 ? "g" : "r", true], [fmt$(d.totalDollar), d.totalDollar >= 0 ? "g" : "r"], fmtPF(d.profitFactor)]} />
    <STable title="Mes" data={monthly} cols={["Mes", "N", "Win%", "R", "P&L", "PF"]}
      row={m => [m.key, m.total, [`${m.winRate.toFixed(2)}%`, m.winRate >= 50 ? "g" : "r"], [`${m.totalR > 0 ? "+" : ""}${m.totalR}R`, m.totalR >= 0 ? "g" : "r", true], [fmt$(m.totalDollar), m.totalDollar >= 0 ? "g" : "r"], fmtPF(m.profitFactor)]} chart={monthly} />
    <STable title="Ano" data={yearly} cols={["Ano", "N", "Win%", "R", "P&L", "PF"]}
      row={y => [y.key, y.total, [`${y.winRate.toFixed(2)}%`, y.winRate >= 50 ? "g" : "r"], [`${y.totalR > 0 ? "+" : ""}${y.totalR}R`, y.totalR >= 0 ? "g" : "r", true], [fmt$(y.totalDollar), y.totalDollar >= 0 ? "g" : "r"], fmtPF(y.profitFactor)]} chart={yearly} />
  </>
)}

{/* ═══ TAB: SETUPS ═══ */}
{tab === "setups" && (
  <>
    <h1 className="pt" style={{ marginBottom: 14 }}>Setups</h1>
    <div className="g2" style={{ marginBottom: 14 }}>
      {SR.map(su => {
        const s2 = setupStats[su]
        return (
          <div key={su} className={`card sc ${s2.totalR > 0 ? "profit" : s2.total ? "loss" : ""}`}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: accentColor, fontFamily: "var(--mono)" }}>{su}</span>
              <span className="tag ta">{s2.total}</span>
            </div>
            <div className="g3" style={{ gap: 8 }}>
              {[["Win%", `${s2.winRate.toFixed(2)}%`, s2.winRate >= 50 ? "var(--green)" : "var(--red)"],
                ["P&L", `${s2.totalR > 0 ? "+" : ""}${s2.totalR}R`, s2.totalR >= 0 ? "var(--green)" : "var(--red)"],
                ["PF", fmtPF(s2.profitFactor), s2.profitFactor >= 1.5 ? "var(--green)" : "var(--red)"]
              ].map(([l, v, c]) => (
                <div key={l}><div className="ml">{l}</div><div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)", color: c }}>{v}</div></div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
    <div className="card"><div className="st">Win% por setup</div><BC data={SR.map(s => setupStats[s].winRate)} labels={SR} height={120} unit="%" /></div>
  </>
)}

{/* ═══ TAB: AVANZADO ═══ */}
{tab === "avanzado" && (
  <>
    <h1 className="pt" style={{ marginBottom: 14 }}>Avanzado</h1>
    <div style={{ marginBottom: 12 }}><Filters /></div>

    <div className="g2" style={{ marginBottom: 14 }}>
      <div className="card">
        <div className="st">R tomados</div>
        {rTaken.lvl.length ? <BC data={rTaken.pct} labels={rTaken.lvl} height={110} unit="%" colors={rTaken.lvl.map(() => "var(--green)")} /> : <div className="em">-</div>}
      </div>
      <div className="card">
        <div className="st">R max mov</div>
        {rMax.lvl.length ? <BC data={rMax.pct} labels={rMax.lvl} height={110} unit="%" colors={rMax.lvl.map(() => "var(--purple)")} /> : <div className="em">-</div>}
      </div>
    </div>

    <div className="card">
      <div className="st">Por hora</div>
      {hStats.length ? (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Hora</th><th>N</th><th>Win%</th><th>R</th><th>PF</th></tr></thead>
              <tbody>{hStats.map(h => (
                <tr key={h.hour}>
                  <td className="mono bold">{h.hour}</td>
                  <td className="mono">{h.total}</td>
                  <td className={`mono ${h.winRate >= 50 ? "g" : "r"}`}>{h.winRate.toFixed(2)}%</td>
                  <td className={`mono bold ${h.totalR >= 0 ? "g" : "r"}`}>{h.totalR > 0 ? "+" : ""}{h.totalR}R</td>
                  <td className="mono">{fmtPF(h.profitFactor)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <BC data={hStats.map(h => h.winRate)} labels={hStats.map(h => h.hour)} height={100} unit="%" colors={hStats.map(h => h.winRate >= 50 ? "var(--green)" : "var(--red)")} />
        </>
      ) : <div className="em">-</div>}
    </div>

    <div className="g2">
      <div className="card">
        <div className="st">Por ATR</div>
        {atrStats.length ? (
          <table className="tbl"><thead><tr><th>ATR</th><th>N</th><th>Win%</th><th>R</th></tr></thead>
          <tbody>{atrStats.map(a => (
            <tr key={a.range}><td className="mono bold">{a.range}</td><td className="mono">{a.total}</td>
            <td className={`mono ${a.winRate >= 50 ? "g" : "r"}`}>{a.winRate.toFixed(2)}%</td>
            <td className={`mono bold ${a.totalR >= 0 ? "g" : "r"}`}>{a.totalR > 0 ? "+" : ""}{a.totalR}R</td></tr>
          ))}</tbody></table>
        ) : <div className="em">-</div>}
      </div>
      <div className="card">
        <div className="st">Por SL</div>
        {slStats.length ? (
          <table className="tbl"><thead><tr><th>SL</th><th>N</th><th>Win%</th><th>R</th></tr></thead>
          <tbody>{slStats.map(s2 => (
            <tr key={s2.range}><td className="mono bold">{s2.range}</td><td className="mono">{s2.total}</td>
            <td className={`mono ${s2.winRate >= 50 ? "g" : "r"}`}>{s2.winRate.toFixed(2)}%</td>
            <td className={`mono bold ${s2.totalR >= 0 ? "g" : "r"}`}>{s2.totalR > 0 ? "+" : ""}{s2.totalR}R</td></tr>
          ))}</tbody></table>
        ) : <div className="em">-</div>}
      </div>
    </div>
  </>
)}

{/* ═══ TAB: TIPS ═══ */}
{tab === "tips" && (
  <>
    <h1 className="pt" style={{ marginBottom: 14 }}>Tips</h1>
    {tipsData.length ? tipsData.map((t, i) => {
      const cs = {
        green: { bg: "rgba(0,214,143,.08)", b: "var(--green)" },
        red: { bg: "rgba(255,71,87,.08)", b: "var(--red)" },
        yellow: { bg: "rgba(255,192,72,.08)", b: "var(--yellow)" },
        blue: { bg: "rgba(76,154,255,.08)", b: "var(--accent)" }
      }[t.type] || { bg: "var(--surface2)", b: "var(--border)" }
      return (
        <div key={i} className="tip-card" style={{ background: cs.bg, borderLeft: `3px solid ${cs.b}` }}>
          <div style={{ background: cs.b, width: 8, height: 8, borderRadius: "50%", flexShrink: 0, marginTop: 5 }} />
          <span>{t.text}</span>
        </div>
      )
    }) : <div className="em">Min 5 trades</div>}
  </>
)}

      </div>
    </>
  )
} // ← closes MainApp

// ═══════════════════════════════════════════════
// ROOT APP + CSS
// ═══════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
:root{--bg:#0a0e14;--surface:#12171f;--surface2:#1a2030;--border:#1e2738;--border2:#2a3548;--text:#d4dae4;--text2:#8892a4;--text3:#5a6478;--accent:#4c9aff;--accent2:#2d7adf;--ad:rgba(76,154,255,.12);--green:#00d68f;--gd:rgba(0,214,143,.12);--red:#ff4757;--rd:rgba(255,71,87,.12);--yellow:#ffc048;--yd:rgba(255,192,72,.12);--purple:#a78bfa;--pd:rgba(167,139,250,.12);--font:'DM Sans',sans-serif;--mono:'JetBrains Mono',monospace;--radius:10px;--rlg:14px}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:var(--font);font-size:14px;-webkit-font-smoothing:antialiased}
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}
.shell{display:flex;min-height:100vh}
.sidebar{width:240px;background:var(--surface);border-right:1px solid var(--border);position:fixed;top:0;left:0;bottom:0;display:flex;flex-direction:column;z-index:100;transition:transform .25s}
.sidebar.closed{transform:translateX(-240px)}
.main{margin-left:240px;padding:28px 36px 60px;flex:1;min-width:0}
.main.full{margin-left:0}
.mobile-bar{display:none;position:fixed;top:0;left:0;right:0;height:52px;background:var(--surface);border-bottom:1px solid var(--border);z-index:101;align-items:center;padding:0 16px;justify-content:space-between}
@media(max-width:900px){.mobile-bar{display:flex}.main{margin-left:0;padding:68px 16px 40px}.sidebar{transform:translateX(-240px)}.sidebar.open{transform:translateX(0)}}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99}
.ss-modal{position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer}
.ss-modal img{max-width:92vw;max-height:92vh;border-radius:var(--radius)}
.sb-brand{padding:24px 20px 16px;border-bottom:1px solid var(--border)}
.sb-brand h1{font-size:20px;font-weight:700;letter-spacing:-.5px}
.sb-brand p{font-size:11px;margin-top:4px;font-family:var(--mono);text-transform:uppercase;letter-spacing:1px}
.sb-nav{flex:1;padding:8px;display:flex;flex-direction:column;gap:1px;overflow-y:auto}
.sb-btn{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;background:transparent;color:var(--text2);border:none;cursor:pointer;font:inherit;font-size:12px;font-weight:500;border-radius:7px;text-align:left}
.sb-btn:hover{background:var(--surface2);color:var(--text)}
.sb-btn.active{background:var(--ad);color:var(--accent)}
.sb-footer{padding:12px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:6px}
.sb-footer button,.sb-footer label{display:block;width:100%;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:7px;color:var(--text2);font:inherit;font-size:11px;cursor:pointer;text-align:center}
.sb-footer button:hover,.sb-footer label:hover{background:var(--border);color:var(--text)}
.pt{font-size:28px;font-weight:700;letter-spacing:-.5px}
.ps{color:var(--text2);font-size:13px;margin-top:2px}
.st{font-size:13px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px;font-family:var(--mono)}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--rlg);padding:20px;margin-bottom:16px}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:20px}
.mc{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px}
.ml{font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.8px;font-family:var(--mono);margin-bottom:6px}
.mv{font-size:20px;font-weight:700;font-family:var(--mono);letter-spacing:-.5px;line-height:1}
.mv.big{font-size:26px}
.ms{font-size:10px;color:var(--text3);margin-top:5px;font-family:var(--mono)}
.tag{display:inline-block;padding:3px 8px;border-radius:5px;font-size:10px;font-weight:600;font-family:var(--mono)}
.tg{background:var(--gd);color:var(--green)}
.tr{background:var(--rd);color:var(--red)}
.ty{background:var(--yd);color:var(--yellow)}
.ta{background:var(--ad);color:var(--accent)}
.tp{background:var(--pd);color:var(--purple)}
.tgr{background:rgba(90,100,120,.15);color:var(--text3)}
.tbl{width:100%;border-collapse:collapse;font-size:12px}
.tbl th{text-align:left;padding:8px 10px;border-bottom:1px solid var(--border);color:var(--text3);font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:.8px;font-family:var(--mono);white-space:nowrap}
.tbl td{padding:8px 10px;border-bottom:1px solid var(--border)}
.tbl tr:hover td{background:var(--surface2)}
.tbl .mono{font-family:var(--mono)}
.tbl .g{color:var(--green)}
.tbl .r{color:var(--red)}
.tbl .y{color:var(--yellow)}
.tbl .bold{font-weight:600}
.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px}
.field{display:flex;flex-direction:column;gap:4px}
.field label{font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;font-weight:600;font-family:var(--mono)}
.inp{background:var(--bg);border:1px solid var(--border2);border-radius:7px;color:var(--text);padding:9px 11px;font:inherit;font-size:13px;width:100%;outline:none}
.inp:focus{border-color:var(--accent)}
select.inp{cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235a6478' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:28px}
textarea.inp{resize:vertical;min-height:100px}
input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(.6)}
.btn{border:none;border-radius:7px;padding:9px 20px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.bp{background:var(--accent);color:#fff}
.bp:hover{background:var(--accent2)}
.bo{background:transparent;color:var(--text2);border:1px solid var(--border2)}
.bo:hover{background:var(--surface2)}
.bd{background:var(--rd);color:var(--red)}
.bs{padding:5px 11px;font-size:11px}
.bx{padding:3px 7px;font-size:10px}
.pb{display:flex;gap:3px;background:var(--surface);border:1px solid var(--border);border-radius:7px;padding:2px}
.pbtn{padding:5px 12px;border:none;background:transparent;color:var(--text3);font:inherit;font-size:11px;cursor:pointer;border-radius:5px}
.pbtn.active{background:var(--ad);color:var(--accent)}
.em{text-align:center;padding:24px;color:var(--text3);font-size:12px}
.g2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
.g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
@media(max-width:700px){.g2,.g3{grid-template-columns:1fr}}
.uz{border:2px dashed var(--border2);border-radius:var(--radius);padding:20px;text-align:center;cursor:pointer;color:var(--text3);min-height:70px;display:flex;align-items:center;justify-content:center}
.uz:hover{border-color:var(--accent)}
.uz img{max-width:100%;max-height:120px;border-radius:7px}
.sc{border-left:3px solid var(--border2)}
.sc.profit{border-left-color:var(--green)}
.sc.loss{border-left-color:var(--red)}
.af{background:var(--surface2);border:1px solid var(--border);border-radius:7px;padding:9px 11px;font-family:var(--mono);font-size:13px;color:var(--accent)}
.info-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:14px}
.info-item{background:var(--bg);border-radius:7px;padding:12px}
.info-item .val{font-family:var(--mono);font-weight:600;font-size:13px;margin-top:4px}
.tip-card{padding:12px 14px;border-radius:8px;margin-bottom:8px;font-size:12px;display:flex;align-items:flex-start;gap:10px}
@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.card,.mc{animation:fadeIn .3s ease both}
`

function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("btj_user")) }
    catch { return null }
  })

  return (
    <>
      <style>{CSS}</style>
      <div className="shell">
        {user
          ? <MainApp user={user} onLogout={() => { localStorage.removeItem("btj_user"); setUser(null) }} />
          : <LoginScreen onLogin={u => setUser(u)} />
        }
      </div>
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
