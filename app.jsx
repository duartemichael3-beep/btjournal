import React from 'react'
import ReactDOM from 'react-dom/client'
import { useState, useMemo, useEffect, useRef, useCallback } from "react"

// ═══════════════════════════════════════════════
// SUPABASE CONFIG (fetch directo, NO SDK)
// ═══════════════════════════════════════════════
const SUPA_URL = "https://kkcsykncinisnknymonz.supabase.co"
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrY3N5a25jaW5pc25rbnltb256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjYxMzIsImV4cCI6MjA5MDg0MjEzMn0.m8M_nIg6h87ocMedXSOSzOr0Xv0iIwjMWuODTnbHmSI"
const supa = (path, opts = {}) => {
  const headers = new Headers()
  headers.set("apikey", SUPA_KEY)
  headers.set("Authorization", "Bearer " + SUPA_KEY)
  headers.set("Content-Type", "application/json")
  headers.set("Prefer", opts.prefer || "return=representation")
  if (opts.headers) { Object.entries(opts.headers).forEach(([k, v]) => headers.set(k, v)) }
  return fetch(SUPA_URL + "/rest/v1/" + path, { ...opts, headers })
}

// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════
const SETUPS = ["M1", "M2", "M3", "J1", "J2", "NO"]
const CTXS = ["APERTURA", "ROMPIMIENTO", "GIRO", "PULLBACK"]
const DIRS = ["RANGO", "ALCISTA", "BAJISTA"]
const RESS = ["SL", "BE", "WIN", "SIN OP"]
const SR = SETUPS.filter(s => s !== "NO")
let RV = 300
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
  screenshot: null, screenshotPreview: null, notas: "", blockName: ""
}
// Trading hours 9:30 AM to 12:00 PM in 5-min intervals
const HRS = []
for (let h = 9; h <= 11; h++) {
  const startM = h === 9 ? 30 : 0
  const endM = h === 11 ? 30 : 59
  for (let m = startM; m <= endM; m++) {
    HRS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`)
  }
}
const fmt12 = t => {
  if (!t) return ""
  const [hh, mm] = t.split(":").map(Number)
  const ampm = hh >= 12 ? "PM" : "AM"
  const h12 = hh > 12 ? hh - 12 : hh === 0 ? 12 : hh
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
const pn = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
const fmt$ = v => (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString()
const fmtR = v => (v > 0 ? "+" : "") + v + "R"
const fmtPF = v => v === Infinity ? "∞" : v.toFixed(2)

// Safe date parser: "YYYY-MM-DD" → local Date (no UTC shift)
const safeDate = ds => {
  if (!ds) return null
  const p = ds.split("-")
  if (p.length === 3) return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]))
  return new Date(ds)
}
const fmtD = ds => {
  if (!ds) return ""
  const p = ds.split("-")
  if (p.length === 3) return `${p[2].padStart(2, "0")}/${p[1].padStart(2, "0")}/${p[0].slice(-2)}`
  const d = new Date(ds)
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`
}
const getMo = ds => {
  if (!ds) return ""
  const p = ds.split("-")
  if (p.length === 3) {
    const mn = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]
    return `${mn[parseInt(p[1]) - 1]} ${p[0].slice(-2)}`
  }
  return ""
}
const getYr = ds => {
  if (!ds) return ""
  const p = ds.split("-")
  return p.length === 3 ? p[0].slice(-2) : ""
}
const cDur = (s, e) => {
  if (!s || !e) return ""
  const [sh, sm] = s.split(":").map(Number)
  const [eh, em] = e.split(":").map(Number)
  let d = (eh * 60 + em) - (sh * 60 + sm)
  return d < 0 ? d + 1440 : d
}
const getDN = ds => {
  if (!ds) return ""
  const p = ds.split("-")
  if (p.length === 3) {
    const d = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]))
    return d.toLocaleString("es", { weekday: "short" })
  }
  return ""
}
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
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

// Password helper (plain text)
const hashPass = async (text) => text

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
  m30: t.m30 || "", screenshot: t.screenshot || "", notas: t.notas || "",
  account_name: t.accountName || "",
  block_name: t.blockName || ""
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
  notas: d.notas || "", accountName: d.account_name || "", blockName: d.block_name || ""
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
  const sorted = [...t2].sort((a, b2) => safeDate(a.fecha) - safeDate(b2.fecha))
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
  const dflt = { bestDay: "-", worstDay: "-", avgOps: 0, bestWd: "-", worstWd: "-" }
  const t2 = rT(trades)
  if (!t2.length) return dflt
  const bd = {}
  t2.forEach(t => {
    if (t.fecha) {
      if (!bd[t.fecha]) bd[t.fecha] = []
      bd[t.fecha].push(t)
    }
  })
  const dt = Object.entries(bd).map(([d, ts]) => ({ d, r: ts.reduce((a, t) => a + gR(t), 0) }))
  if (!dt.length) return dflt
  const best = dt.reduce((a, x) => x.r > a.r ? x : a, dt[0])
  const worst = dt.reduce((a, x) => x.r < a.r ? x : a, dt[0])

  const bw = {}
  t2.forEach(t => {
    if (t.fecha) {
      const wd = getDN(t.fecha)
      if (wd) {
        if (!bw[wd]) bw[wd] = []
        bw[wd].push(t)
      }
    }
  })
  const wt = Object.entries(bw).map(([wd, ts]) => ({ wd, r: ts.reduce((a, t) => a + gR(t), 0) }))
  const bestDay = `${fmtD(best.d)} (${best.r > 0 ? "+" : ""}${Math.round(best.r * 100) / 100}R)`
  const worstDay = `${fmtD(worst.d)} (${worst.r > 0 ? "+" : ""}${Math.round(worst.r * 100) / 100}R)`
  const avgOps = Math.round(t2.length / Object.keys(bd).length * 100) / 100
  if (!wt.length) return { bestDay, worstDay, avgOps, bestWd: "-", worstWd: "-" }
  const bestW = wt.reduce((a, x) => x.r > a.r ? x : a, wt[0])
  const worstW = wt.reduce((a, x) => x.r < a.r ? x : a, wt[0])
  return {
    bestDay, worstDay, avgOps,
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

function beAnalysis(trades) {
  const bes = rT(trades).filter(t => t.resultado === "BE")
  if (!bes.length) return null

  const withRmax = bes.map(t => ({ ...t, rmx: pn(t.rMaximo) })).filter(t => t.rmx > 0)
  if (!withRmax.length) return { total: bes.length, withData: 0, buckets: [], totalMissed: 0, avgMissed: 0, worstMissed: null, bySetup: [] }

  // Buckets: how far did BE trades go before coming back
  const buckets = [
    { label: "< 0.5R", min: 0, max: 0.5 },
    { label: "0.5-1R", min: 0.5, max: 1 },
    { label: "1-1.5R", min: 1, max: 1.5 },
    { label: "1.5-2R", min: 1.5, max: 2 },
    { label: "2-3R", min: 2, max: 3 },
    { label: "3-5R", min: 3, max: 5 },
    { label: "5R+", min: 5, max: 999 }
  ].map(b => {
    const inBucket = withRmax.filter(t => t.rmx >= b.min && t.rmx < b.max)
    return { ...b, count: inBucket.length, pct: Math.round(inBucket.length / withRmax.length * 10000) / 100 }
  }).filter(b => b.count > 0)

  // Total R left on table
  const totalMissed = Math.round(withRmax.reduce((a, t) => a + t.rmx, 0) * 100) / 100
  const avgMissed = Math.round(totalMissed / withRmax.length * 100) / 100

  // Worst BE (highest rMax that ended BE)
  const worst = withRmax.reduce((a, t) => t.rmx > a.rmx ? t : a, withRmax[0])

  // BE by setup
  const setupMap = {}
  withRmax.forEach(t => {
    const s = t.setup || "?"
    if (!setupMap[s]) setupMap[s] = { count: 0, totalR: 0 }
    setupMap[s].count++
    setupMap[s].totalR += t.rmx
  })
  const bySetup = Object.entries(setupMap).map(([s, d]) => ({
    setup: s, count: d.count, totalR: Math.round(d.totalR * 100) / 100, avgR: Math.round(d.totalR / d.count * 100) / 100
  })).sort((a, b) => b.totalR - a.totalR)

  // BE by hour
  const hourMap = {}
  withRmax.forEach(t => {
    const h = hBucket(t.horaInicio)
    if (!h) return
    if (!hourMap[h]) hourMap[h] = { count: 0, totalR: 0 }
    hourMap[h].count++
    hourMap[h].totalR += t.rmx
  })
  const byHour = Object.entries(hourMap).map(([h, d]) => ({
    hour: h, count: d.count, totalR: Math.round(d.totalR * 100) / 100, avgR: Math.round(d.totalR / d.count * 100) / 100
  })).sort((a, b) => b.totalR - a.totalR)

  return {
    total: bes.length, withData: withRmax.length, buckets,
    totalMissed, avgMissed, totalMissedDollar: Math.round(totalMissed * RV),
    worstMissed: worst ? { fecha: worst.fecha, rmax: worst.rmx, setup: worst.setup } : null,
    bySetup, byHour
  }
}

function genTips(trades) {
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
// ═══════════════════════════════════════════════

// ── Small UI Components ──

// Date picker component — DD/Mes/AA dropdowns only
const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const DatePick = ({ value, onChange, label, compact }) => {
  const parsed = value ? new Date(value + "T12:00:00") : null
  const [dd, setDD] = useState(parsed ? parsed.getDate() : "")
  const [mm, setMM] = useState(parsed ? parsed.getMonth() : "")
  const [yy, setYY] = useState(parsed ? parsed.getFullYear() : "")

  useEffect(() => {
    if (value) {
      const p = new Date(value + "T12:00:00")
      if (!isNaN(p)) { setDD(p.getDate()); setMM(p.getMonth()); setYY(p.getFullYear()) }
    } else { setDD(""); setMM(""); setYY("") }
  }, [value])

  const years = []
  for (let y = 2020; y <= 2030; y++) years.push(y)

  const maxDay = mm !== "" && yy ? new Date(yy, mm + 1, 0).getDate() : 31
  const days = []
  for (let i = 1; i <= maxDay; i++) days.push(i)

  const emit = (d, m, y) => {
    if (d && m !== "" && y) {
      const safe = Math.min(d, new Date(y, m + 1, 0).getDate())
      onChange(`${y}-${String(m + 1).padStart(2, "0")}-${String(safe).padStart(2, "0")}`)
    }
  }

  const ss = {
    background: "var(--bg)", border: "1px solid var(--border2)", borderRadius: 6,
    color: "var(--text)", padding: compact ? "6px 4px" : "8px 6px",
    fontFamily: "var(--mono)", fontSize: compact ? 10 : 12, cursor: "pointer", outline: "none"
  }

  return (
    <div className="field" style={{ gap: 3 }}>
      {label && <label>{label}</label>}
      <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
        <select style={{ ...ss, width: compact ? 42 : 50 }} value={dd} onChange={e => { const v = parseInt(e.target.value); setDD(v); emit(v, mm, yy) }}>
          <option value="">DD</option>
          {days.map(d2 => <option key={d2} value={d2}>{String(d2).padStart(2, "0")}</option>)}
        </select>
        <select style={{ ...ss, width: compact ? 52 : 60 }} value={mm} onChange={e => { const v = parseInt(e.target.value); setMM(v); if (!dd) setDD(1); if (!yy) setYY(new Date().getFullYear()); emit(dd || 1, v, yy || new Date().getFullYear()) }}>
          <option value="">Mes</option>
          {MONTHS_ES.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select style={{ ...ss, width: compact ? 46 : 54 }} value={yy} onChange={e => { const v = parseInt(e.target.value); setYY(v); if (!dd) setDD(1); if (mm === "") setMM(0); emit(dd || 1, mm !== "" ? mm : 0, v) }}>
          <option value="">Año</option>
          {years.map(y => <option key={y} value={y}>{String(y).slice(-2)}</option>)}
        </select>
        {value && <button onClick={() => { setDD(""); setMM(""); setYY(""); onChange("") }} style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: compact ? 10 : 12, padding: "0 4px" }}>✕</button>}
      </div>
    </div>
  )
}

const TP = ({ value, onChange, label }) => (
  <div className="field">
    <label>{label}</label>
    <select className="inp" value={value} onChange={e => onChange(e.target.value)}>
      {HRS.map(h => <option key={h} value={h}>{fmt12(h)}</option>)}
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
  const sorted = [...t2].sort((a, b) => safeDate(a.fecha) - safeDate(b.fecha))
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
function DayModal({ date, trades, onClose, onViewSS, onNavigate }) {
  const dt = trades.filter(t => t.fecha === date)
  const real = rT(dt)
  const sinop = dt.filter(isSO)
  const s = cS(real)
  const dayR = Math.round(real.reduce((a, t) => a + gR(t), 0) * 100) / 100

  // Get sorted unique dates that have trades for navigation
  const allDates = [...new Set(trades.filter(t => t.fecha).map(t => t.fecha))].sort()
  const currentIdx = allDates.indexOf(date)
  const prevDate = currentIdx > 0 ? allDates[currentIdx - 1] : null
  const nextDate = currentIdx < allDates.length - 1 ? allDates[currentIdx + 1] : null

  const goTo = (d) => { if (d && onNavigate) onNavigate(d) }

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "ArrowLeft" && prevDate) goTo(prevDate)
      else if (e.key === "ArrowRight" && nextDate) goTo(nextDate)
      else if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [prevDate, nextDate])

  const navBtn = { background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", cursor: "pointer", color: "var(--text)", fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }
  const navBtnDisabled = { ...navBtn, opacity: 0.3, cursor: "default" }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 800, maxHeight: "85vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>

        {/* Header with navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={prevDate ? navBtn : navBtnDisabled} onClick={() => prevDate && goTo(prevDate)}>
            <span>◀</span>
            {prevDate && <span style={{ fontSize: 10, color: "var(--text3)" }}>{fmtD(prevDate)}</span>}
          </div>
          <div style={{ textAlign: "center" }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--mono)" }}>
              {fmtD(date)}{" "}
              <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 400 }}>{getDN(date)}</span>
            </h2>
            <span style={{ fontSize: 14, color: dayR >= 0 ? "var(--green)" : "var(--red)", fontFamily: "var(--mono)", fontWeight: 700 }}>
              {real.length ? `${dayR >= 0 ? "+" : ""}${dayR}R  ${fmt$(Math.round(dayR * RV))}` : ""}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={nextDate ? navBtn : navBtnDisabled} onClick={() => nextDate && goTo(nextDate)}>
              {nextDate && <span style={{ fontSize: 10, color: "var(--text3)" }}>{fmtD(nextDate)}</span>}
              <span>▶</span>
            </div>
            <button className="btn bo bx" onClick={onClose}>✕</button>
          </div>
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

            {/* Screenshots gallery */}
            {real.some(t => t.screenshot) && (
              <div style={{ marginTop: 14 }}>
                <div className="ml" style={{ marginBottom: 8 }}>Screenshots</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {real.filter(t => t.screenshot).map((t, i) => {
                    const r = gR(t)
                    return (
                      <div key={i} style={{ position: "relative", cursor: "pointer" }} onClick={() => onViewSS(t.screenshot)}>
                        <img src={t.screenshot} style={{ height: 90, borderRadius: 8, border: `2px solid ${r > 0 ? "var(--green)" : r < 0 ? "var(--red)" : "var(--yellow)"}` }} />
                        <div style={{ position: "absolute", bottom: 4, left: 4, background: "rgba(0,0,0,.7)", borderRadius: 4, padding: "2px 6px", fontSize: 9, fontFamily: "var(--mono)", color: r > 0 ? "var(--green)" : r < 0 ? "var(--red)" : "var(--yellow)" }}>
                          {fmtR(r)} {t.horaInicio}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {!dt.length && <div className="em">Sin actividad</div>}

        {/* Navigation hint */}
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 10, color: "var(--text3)" }}>
          ← → Flechas del teclado para navegar
        </div>
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
// SHARE CARD MODAL — generates PNG card for WhatsApp/IG
// ═══════════════════════════════════════════════
const DIAS_ES = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"]
const MESES_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
const MESES_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

function formatCardDate(fd1, fd2) {
  if (!fd1 && !fd2) return ""
  const d1 = fd1 ? new Date(fd1 + "T12:00:00") : null
  const d2 = fd2 ? new Date(fd2 + "T12:00:00") : null
  if (d1 && d2 && fd1 === fd2) {
    // Single day: Vie 15 Ago 2025
    return `${DIAS_ES[d1.getDay()].slice(0, 3)} ${d1.getDate()} ${MESES_SHORT[d1.getMonth()]} ${d1.getFullYear()}`
  }
  if (d1 && d2 && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear() && d2.getDate() - d1.getDate() <= 6) {
    // Same week: Sem 11-15 Ago
    return `Sem ${d1.getDate()}-${d2.getDate()} ${MESES_SHORT[d1.getMonth()]}`
  }
  if (d1 && d2 && d1.getDate() === 1 && d2.getDate() === new Date(d2.getFullYear(), d2.getMonth() + 1, 0).getDate() && d1.getMonth() === d2.getMonth()) {
    // Full month: Noviembre 2025
    return `${MESES_ES[d1.getMonth()]} ${d1.getFullYear()}`
  }
  if (d1 && d2) {
    // Range: 15 Ago → 20 Nov 2025
    const sameYear = d1.getFullYear() === d2.getFullYear()
    return `${d1.getDate()} ${MESES_SHORT[d1.getMonth()]}${sameYear ? "" : " " + d1.getFullYear()} → ${d2.getDate()} ${MESES_SHORT[d2.getMonth()]} ${d2.getFullYear()}`
  }
  if (d1) return `Desde ${d1.getDate()} ${MESES_SHORT[d1.getMonth()]} ${d1.getFullYear()}`
  if (d2) return `Hasta ${d2.getDate()} ${MESES_SHORT[d2.getMonth()]} ${d2.getFullYear()}`
  return ""
}

function ShareCardModal({ stats, modeLabel, instagram, fd1, fd2, onClose }) {
  const canvasRef = useRef()
  const [igInput, setIgInput] = useState(instagram || "")
  const [cardFd1, setCardFd1] = useState(fd1 || "")
  const [cardFd2, setCardFd2] = useState(fd2 || "")
  const dateLabel = formatCardDate(cardFd1, cardFd2) || "Historico"

  const drawCard = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    const W = 720, H = 920
    canvas.width = W; canvas.height = H

    // Background
    ctx.fillStyle = "#0a0e14"
    ctx.fillRect(0, 0, W, H)

    // Border
    ctx.strokeStyle = "#1e2738"
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, W - 2, H - 2)

    // Header
    ctx.fillStyle = "#4c9aff"
    ctx.font = "bold 22px 'JetBrains Mono', monospace"
    ctx.fillText("MY JOURNAL PRO", 32, 44)

    ctx.fillStyle = "#8892a4"
    ctx.font = "13px 'JetBrains Mono', monospace"
    ctx.textAlign = "right"
    ctx.fillText(modeLabel, W - 32, 44)
    ctx.textAlign = "left"

    // Date line
    ctx.fillStyle = "#5a6478"
    ctx.font = "14px 'DM Sans', sans-serif"
    ctx.fillText(dateLabel, 32, 72)

    // Separator
    ctx.strokeStyle = "#1e2738"
    ctx.beginPath(); ctx.moveTo(32, 88); ctx.lineTo(W - 32, 88); ctx.stroke()

    // Title
    ctx.fillStyle = "#d4dae4"
    ctx.font = "bold 16px 'JetBrains Mono', monospace"
    ctx.textAlign = "center"
    ctx.fillText("PERFORMANCE STATS", W / 2, 118)
    ctx.textAlign = "left"

    // Separator
    ctx.beginPath(); ctx.moveTo(32, 132); ctx.lineTo(W - 32, 132); ctx.stroke()

    // Metrics row 1
    const s = stats
    const drawMetric = (x, y, label, value, color) => {
      ctx.fillStyle = "#5a6478"
      ctx.font = "bold 10px 'JetBrains Mono', monospace"
      ctx.fillText(label, x, y)
      ctx.fillStyle = color || "#d4dae4"
      ctx.font = "bold 28px 'JetBrains Mono', monospace"
      ctx.fillText(value, x, y + 32)
    }

    const drawMetricSm = (x, y, label, value, color) => {
      ctx.fillStyle = "#5a6478"
      ctx.font = "bold 10px 'JetBrains Mono', monospace"
      ctx.fillText(label, x, y)
      ctx.fillStyle = color || "#d4dae4"
      ctx.font = "bold 22px 'JetBrains Mono', monospace"
      ctx.fillText(value, x, y + 28)
    }

    const pnlColor = s.totalR >= 0 ? "#00d68f" : "#ff4757"
    const wrColor = s.winRate >= 50 ? "#00d68f" : "#ff4757"
    const pfColor = s.profitFactor >= 1.5 ? "#00d68f" : s.profitFactor >= 1 ? "#ffc048" : "#ff4757"

    drawMetric(32, 160, "P&L", `${s.totalR >= 0 ? "+" : ""}${s.totalR}R`, pnlColor)
    drawMetric(260, 160, "WIN%", `${s.winRate.toFixed(2)}%`, wrColor)
    drawMetric(500, 160, "PF", fmtPF(s.profitFactor), pfColor)

    // Sub value for P&L
    ctx.fillStyle = "#5a6478"
    ctx.font = "14px 'JetBrains Mono', monospace"
    ctx.fillText(fmt$(s.totalDollar), 32, 208)

    drawMetricSm(32, 240, "EXPECTANCY", `${s.expectancy}R`, s.expectancy > 0 ? "#00d68f" : "#ff4757")
    drawMetricSm(260, 240, "SHARPE", s.sharpeRatio.toFixed(2), s.sharpeRatio >= 1 ? "#00d68f" : s.sharpeRatio >= 0.5 ? "#ffc048" : "#ff4757")
    drawMetricSm(500, 240, "TRADES", String(s.total), "#d4dae4")

    // Win/SL/BE bars
    const barY = 310
    const barW = W - 64
    const barH = 24
    const winPct = s.total ? s.wins / s.total : 0
    const slPct = s.total ? s.losses / s.total : 0
    const bePct = s.total ? s.bes / s.total : 0

    // Background
    ctx.fillStyle = "#1a2030"
    ctx.fillRect(32, barY, barW, barH); ctx.fillRect(32, barY + 36, barW, barH); ctx.fillRect(32, barY + 72, barW, barH)

    // Bars
    ctx.fillStyle = "#00d68f"; ctx.fillRect(32, barY, barW * winPct, barH)
    ctx.fillStyle = "#ff4757"; ctx.fillRect(32, barY + 36, barW * slPct, barH)
    ctx.fillStyle = "#ffc048"; ctx.fillRect(32, barY + 72, barW * bePct, barH)

    // Labels
    ctx.font = "bold 11px 'JetBrains Mono', monospace"
    ctx.fillStyle = "#d4dae4"
    ctx.fillText(`WIN ${(winPct * 100).toFixed(1)}% (${s.wins})`, 40, barY + 16)
    ctx.fillText(`SL ${(slPct * 100).toFixed(1)}% (${s.losses})`, 40, barY + 52)
    ctx.fillText(`BE ${(bePct * 100).toFixed(1)}% (${s.bes})`, 40, barY + 88)

    // Separator
    const secY = barY + 112
    ctx.strokeStyle = "#1e2738"
    ctx.beginPath(); ctx.moveTo(32, secY); ctx.lineTo(W - 32, secY); ctx.stroke()

    // Bottom stats
    const bsY = secY + 28
    ctx.fillStyle = "#5a6478"; ctx.font = "bold 10px 'JetBrains Mono', monospace"
    ctx.fillText("RACHA WIN", 32, bsY)
    ctx.fillText("MEJOR TRADE", 260, bsY)
    ctx.fillText("PAYOFF", 500, bsY)

    ctx.font = "bold 20px 'JetBrains Mono', monospace"
    ctx.fillStyle = "#00d68f"; ctx.fillText(String(s.maxWinStreak), 32, bsY + 26)
    ctx.fillStyle = "#00d68f"; ctx.fillText(`+${s.bestR}R`, 260, bsY + 26)
    ctx.fillStyle = s.payoffRatio >= 2 ? "#00d68f" : "#ffc048"; ctx.fillText(s.payoffRatio === Infinity ? "∞" : s.payoffRatio.toFixed(2), 500, bsY + 26)

    ctx.fillStyle = "#5a6478"; ctx.font = "bold 10px 'JetBrains Mono', monospace"
    ctx.fillText("RACHA SL", 32, bsY + 56)
    ctx.fillText("MAX DD", 260, bsY + 56)
    ctx.fillText("RECOVERY", 500, bsY + 56)

    ctx.font = "bold 20px 'JetBrains Mono', monospace"
    ctx.fillStyle = "#ff4757"; ctx.fillText(String(s.maxLossStreak), 32, bsY + 82)
    ctx.fillStyle = "#ff4757"; ctx.fillText(`${s.maxEquityDD}R`, 260, bsY + 82)
    ctx.fillStyle = s.recoveryFactor >= 2 ? "#00d68f" : "#ffc048"; ctx.fillText(s.recoveryFactor === Infinity ? "∞" : s.recoveryFactor.toFixed(2), 500, bsY + 82)

    // Instagram footer
    if (igInput) {
      ctx.strokeStyle = "#1e2738"
      ctx.beginPath(); ctx.moveTo(32, H - 52); ctx.lineTo(W - 32, H - 52); ctx.stroke()
      ctx.fillStyle = "#a78bfa"
      ctx.font = "bold 16px 'DM Sans', sans-serif"
      ctx.textAlign = "center"
      ctx.fillText(igInput.startsWith("@") ? igInput : "@" + igInput, W / 2, H - 24)
      ctx.textAlign = "left"
    }
  }

  useEffect(() => { drawCard() }, [stats, igInput, cardFd1, cardFd2])

  const download = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement("a")
    a.download = `journal_${dateLabel.replace(/\s/g, "_") || "stats"}.png`
    a.href = canvas.toDataURL("image/png")
    a.click()
  }

  const share = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const blob = await new Promise(r => canvas.toBlob(r, "image/png"))
      if (navigator.share) {
        await navigator.share({ files: [new File([blob], "journal_stats.png", { type: "image/png" })] })
      } else download()
    } catch { download() }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.9)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 500, maxHeight: "90vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--mono)" }}>Compartir Card</h2>
          <button className="btn bo bx" onClick={onClose}>✕</button>
        </div>
        <div className="form-grid" style={{ marginBottom: 14 }}>
          <DatePick value={cardFd1} onChange={setCardFd1} label="Desde" compact />
          <DatePick value={cardFd2} onChange={setCardFd2} label="Hasta" compact />
          <div className="field">
            <label>Instagram</label>
            <input className="inp" value={igInput} onChange={e => setIgInput(e.target.value)} placeholder="@tu_usuario" style={{ fontSize: 12 }} />
          </div>
        </div>
        <div style={{ background: "#0a0e14", borderRadius: 8, padding: 8, marginBottom: 14, textAlign: "center" }}>
          <canvas ref={canvasRef} style={{ width: "100%", maxWidth: 360, borderRadius: 4 }} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn bp" onClick={download}>Descargar PNG</button>
          <button className="btn bo" onClick={share}>Compartir</button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
// ACCOUNT MANAGER MODAL
// ═══════════════════════════════════════════════
const BLOCK_COLORS = ["#4c9aff", "#a78bfa", "#00d68f", "#ffc048", "#ff4757", "#f472b6", "#38bdf8", "#fb923c"]
const AM_FIRMS = ["Apex", "Bulenox", "TPT", "Topstep", "MyFundedFutures", "Otra"]
const AM_STATUSES = [
  { value: "active", label: "Activa", color: "var(--green)" },
  { value: "violated", label: "Violada", color: "var(--red)" },
  { value: "passed", label: "Pasada", color: "var(--accent)" },
  { value: "inactive", label: "Inactiva", color: "var(--text3)" }
]
const AM_DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie"]

function getMonday(d) {
  const dt = new Date(d)
  const day = dt.getDay()
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(dt.setDate(diff))
}

function fmtDateISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function AccountManager({ userId, onClose, inline }) {
  const [amTab, setAmTab] = useState("today")
  const [blocks, setBlocks] = useState([])
  const [amAccounts, setAmAccounts] = useState([])
  const [amSchedule, setAmSchedule] = useState([])
  const [amCompliance, setAmCompliance] = useState([])
  const [amLoading, setAmLoading] = useState(true)
  const [amSaving, setAmSaving] = useState(false)

  const [newBlockName, setNewBlockName] = useState("")
  const [newBlockColor, setNewBlockColor] = useState(BLOCK_COLORS[0])
  const [editAcct, setEditAcct] = useState(null)
  const [acctForm, setAcctForm] = useState({ name: "", prop_firm: "Apex", account_size: "", max_dd: "", current_balance: "", status: "active", block_id: "" })
  const [showAcctForm, setShowAcctForm] = useState(false)
  const [confirmOperate, setConfirmOperate] = useState(false)
  const [violationNote, setViolationNote] = useState("")
  const [selectedAcctIds, setSelectedAcctIds] = useState(new Set())
  const [editingDD, setEditingDD] = useState(null)
  const [ddInput, setDDInput] = useState("")

  const amToday = new Date()
  const amTodayISO = fmtDateISO(amToday)
  const amTodayDOW = amToday.getDay() === 0 ? 6 : amToday.getDay() - 1
  const amMonday = getMonday(amToday)
  const amMondayISO = fmtDateISO(amMonday)

  const [schedWeekOffset, setSchedWeekOffset] = useState(0)
  const schedMonday = new Date(amMonday)
  schedMonday.setDate(schedMonday.getDate() + schedWeekOffset * 7)
  const schedMondayISO = fmtDateISO(schedMonday)

  const loadAM = useCallback(async () => {
    try {
      const [bRes, aRes, sRes, cRes] = await Promise.all([
        supa(`am_blocks?user_id=eq.${userId}&select=*&order=created_at.asc`),
        supa(`am_accounts?user_id=eq.${userId}&select=*&order=created_at.asc`),
        supa(`am_schedule?user_id=eq.${userId}&select=*`),
        supa(`am_compliance?user_id=eq.${userId}&select=*&order=date.desc&limit=60`)
      ])
      const [bD, aD, sD, cD] = await Promise.all([bRes.json(), aRes.json(), sRes.json(), cRes.json()])
      if (Array.isArray(bD)) setBlocks(bD)
      if (Array.isArray(aD)) setAmAccounts(aD)
      if (Array.isArray(sD)) setAmSchedule(sD)
      if (Array.isArray(cD)) setAmCompliance(cD)
    } catch (e) { console.error("AM load error", e) }
    finally { setAmLoading(false) }
  }, [userId])

  useEffect(() => { loadAM() }, [loadAM])

  const todaySched = amSchedule.find(s => s.week_start === amMondayISO && s.day_of_week === amTodayDOW)
  const todayBlock = todaySched ? blocks.find(b => b.id === todaySched.block_id) : null
  const todayAccts = todayBlock ? amAccounts.filter(a => a.block_id === todayBlock.id) : []
  const todayComp = amCompliance.find(c => c.date === amTodayISO)
  const isWeekend = amTodayDOW >= 5

  const addBlock = async () => {
    if (!newBlockName.trim()) return
    setAmSaving(true)
    try {
      await supa("am_blocks", { method: "POST", body: JSON.stringify({ user_id: userId, name: newBlockName.trim(), color: newBlockColor }) })
      setNewBlockName("")
      setNewBlockColor(BLOCK_COLORS[(blocks.length + 1) % BLOCK_COLORS.length])
      await loadAM()
    } catch (e) { alert("Error: " + e.message) }
    finally { setAmSaving(false) }
  }

  const deleteBlock = async (blockId) => {
    if (!confirm("Eliminar bloque? Las cuentas quedarán sin bloque.")) return
    setAmSaving(true)
    try {
      await supa(`am_blocks?id=eq.${blockId}`, { method: "DELETE" })
      await loadAM()
    } catch (e) { alert("Error: " + e.message) }
    finally { setAmSaving(false) }
  }

  const openAcctForm = (acct) => {
    if (acct) {
      setEditAcct(acct)
      setAcctForm({ name: acct.name, prop_firm: acct.prop_firm || "Apex", account_size: String(acct.account_size || ""), max_dd: String(acct.max_dd || ""), current_balance: String(acct.current_balance || ""), status: acct.status || "active", block_id: acct.block_id ? String(acct.block_id) : "" })
    } else {
      setEditAcct(null)
      setAcctForm({ name: "", prop_firm: "Apex", account_size: "", max_dd: "", current_balance: "", status: "active", block_id: "" })
    }
    setShowAcctForm(true)
  }

  const saveAcct = async () => {
    if (!acctForm.name.trim()) return alert("Nombre requerido")
    setAmSaving(true)
    const payload = {
      user_id: userId, name: acctForm.name.trim(), prop_firm: acctForm.prop_firm,
      account_size: parseFloat(acctForm.account_size) || 0,
      max_dd: parseFloat(acctForm.max_dd) || 0,
      current_balance: parseFloat(acctForm.current_balance) || 0,
      status: acctForm.status,
      block_id: acctForm.block_id ? parseInt(acctForm.block_id) : null
    }
    try {
      if (editAcct) {
        await supa(`am_accounts?id=eq.${editAcct.id}`, { method: "PATCH", body: JSON.stringify(payload) })
      } else {
        await supa("am_accounts", { method: "POST", body: JSON.stringify(payload) })
      }
      setShowAcctForm(false)
      await loadAM()
    } catch (e) { alert("Error: " + e.message) }
    finally { setAmSaving(false) }
  }

  const deleteAcct = async (id) => {
    if (!confirm("Eliminar cuenta?")) return
    await supa(`am_accounts?id=eq.${id}`, { method: "DELETE" })
    await loadAM()
  }

  const toggleSelectAcct = (id) => {
    setSelectedAcctIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const assignToBlock = async (blockId) => {
    if (selectedAcctIds.size === 0) return
    setAmSaving(true)
    try {
      for (const acctId of selectedAcctIds) {
        await supa(`am_accounts?id=eq.${acctId}`, { method: "PATCH", body: JSON.stringify({ block_id: blockId }) })
      }
      setSelectedAcctIds(new Set())
      await loadAM()
    } catch (e) { alert("Error: " + e.message) }
    finally { setAmSaving(false) }
  }

  const unassignFromBlock = async (acctId) => {
    setAmSaving(true)
    try {
      await supa(`am_accounts?id=eq.${acctId}`, { method: "PATCH", body: JSON.stringify({ block_id: null }) })
      await loadAM()
    } catch (e) { alert("Error: " + e.message) }
    finally { setAmSaving(false) }
  }

  const saveDD = async (acctId) => {
    const val = parseFloat(ddInput)
    if (isNaN(val) || val <= 0) return
    setAmSaving(true)
    try {
      await supa(`am_accounts?id=eq.${acctId}`, { method: "PATCH", body: JSON.stringify({ max_dd: val }) })
      setEditingDD(null)
      setDDInput("")
      await loadAM()
    } catch (e) { alert("Error: " + e.message) }
    finally { setAmSaving(false) }
  }

  const setDayBlock = async (dayOfWeek, blockId) => {
    setAmSaving(true)
    try {
      await supa(`am_schedule?user_id=eq.${userId}&week_start=eq.${schedMondayISO}&day_of_week=eq.${dayOfWeek}`, { method: "DELETE" })
      if (blockId) {
        await supa("am_schedule", { method: "POST", body: JSON.stringify({ user_id: userId, week_start: schedMondayISO, day_of_week: dayOfWeek, block_id: parseInt(blockId) }) })
      }
      await loadAM()
    } catch (e) { alert("Error: " + e.message) }
    finally { setAmSaving(false) }
  }

  const copyToNextWeek = async () => {
    const thisWeekSched = amSchedule.filter(s => s.week_start === schedMondayISO)
    if (!thisWeekSched.length) return alert("No hay schedule esta semana para copiar")
    const nextMonday = new Date(schedMonday)
    nextMonday.setDate(nextMonday.getDate() + 7)
    const nextMondayISO = fmtDateISO(nextMonday)
    setAmSaving(true)
    try {
      await supa(`am_schedule?user_id=eq.${userId}&week_start=eq.${nextMondayISO}`, { method: "DELETE" })
      for (const s of thisWeekSched) {
        await supa("am_schedule", { method: "POST", body: JSON.stringify({ user_id: userId, week_start: nextMondayISO, day_of_week: s.day_of_week, block_id: s.block_id }) })
      }
      await loadAM()
      alert("Copiado a la semana siguiente!")
    } catch (e) { alert("Error: " + e.message) }
    finally { setAmSaving(false) }
  }

  const markCompliance = async (complied, operatedBlockId) => {
    setAmSaving(true)
    try {
      await supa(`am_compliance?user_id=eq.${userId}&date=eq.${amTodayISO}`, { method: "DELETE" })
      await supa("am_compliance", { method: "POST", body: JSON.stringify({
        user_id: userId, date: amTodayISO,
        scheduled_block_id: todayBlock ? todayBlock.id : null,
        operated_block_id: operatedBlockId || null,
        complied,
        violation_note: complied ? "" : violationNote
      })})
      setConfirmOperate(false)
      setViolationNote("")
      await loadAM()
    } catch (e) { alert("Error: " + e.message) }
    finally { setAmSaving(false) }
  }

  const compStats = useMemo(() => {
    if (!amCompliance.length) return { total: 0, complied: 0, violated: 0, pct: 0 }
    const total = amCompliance.length
    const ok = amCompliance.filter(c => c.complied).length
    return { total, complied: ok, violated: total - ok, pct: Math.round(ok / total * 100) }
  }, [amCompliance])

  const getDDInfo = (acct) => {
    if (!acct.max_dd || !acct.current_balance || !acct.account_size) return null
    const used = acct.account_size - acct.current_balance
    const remaining = acct.max_dd - used
    const pct = Math.round(remaining / acct.max_dd * 100)
    return { remaining: Math.round(remaining), pct, color: pct > 50 ? "var(--green)" : pct > 25 ? "var(--yellow)" : "var(--red)" }
  }

  const mBg = { position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }
  const mBox = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 900, maxHeight: "90vh", overflow: "auto" }
  const amTabBtn = (id, label) => (
    <button key={id} onClick={() => setAmTab(id)}
      style={{ padding: "7px 16px", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700,
        background: amTab === id ? "var(--ad)" : "transparent", color: amTab === id ? "var(--accent)" : "var(--text3)" }}>
      {label}
    </button>
  )

  if (amLoading) {
    if (inline) return <div className="em">Cargando Account Manager...</div>
    return <div style={mBg}><div style={mBox}><div className="em">Cargando Account Manager...</div></div></div>
  }

  const content = (
    <>
      {!inline && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--mono)", color: "var(--accent)" }}>📊 Account Manager</h2>
          <button className="btn bo bx" onClick={onClose}>✕</button>
        </div>
      )}

        <div style={{ display: "flex", gap: 2, background: "var(--bg)", borderRadius: 8, padding: 3, marginBottom: 20 }}>
          {amTabBtn("today", "🎯 Hoy")}
          {amTabBtn("config", "⚙ Cuentas")}
          {amTabBtn("schedule", "📅 Schedule")}
          {amTabBtn("history", "📈 Historial")}
        </div>

        {amSaving && <div style={{ padding: "6px 14px", background: "var(--ad)", borderRadius: 8, marginBottom: 12, fontSize: 11, fontFamily: "var(--mono)", color: "var(--accent)", textAlign: "center" }}>Guardando...</div>}

        {/* ═══ TAB: HOY ═══ */}
        {amTab === "today" && (
          <div>
            {isWeekend ? (
              <div style={{ textAlign: "center", padding: 40 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🏖️</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text2)" }}>Fin de semana — No hay operaciones</div>
              </div>
            ) : !todayBlock ? (
              <div style={{ textAlign: "center", padding: 40 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                <div style={{ fontSize: 14, color: "var(--text2)", marginBottom: 10 }}>No hay bloque asignado para hoy</div>
                <button className="btn bp bs" onClick={() => setAmTab("schedule")}>Ir a Schedule</button>
              </div>
            ) : (
              <>
                <div style={{ background: "var(--bg)", border: `2px solid ${todayBlock.color}`, borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Hoy operas</div>
                      <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "var(--mono)", color: todayBlock.color }}>{todayBlock.name}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>{AM_DAYS[amTodayDOW]} {amTodayISO}</div>
                      <div style={{ fontSize: 12, color: "var(--green)", fontFamily: "var(--mono)", fontWeight: 600 }}>{todayAccts.filter(a => a.status === "active").length} cuentas activas</div>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div className="st">Cuentas del bloque — {todayBlock.name}</div>
                  {todayAccts.length === 0 ? (
                    <div className="em">No hay cuentas en este bloque. Ve a Cuentas para agregar.</div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table className="tbl">
                        <thead><tr><th>Cuenta</th><th>Firma</th><th>Balance</th><th>DD Disp.</th><th>Estado</th></tr></thead>
                        <tbody>
                          {todayAccts.map(a => {
                            const dd = getDDInfo(a)
                            const st = AM_STATUSES.find(s => s.value === a.status) || AM_STATUSES[0]
                            return (
                              <tr key={a.id}>
                                <td className="mono bold">{a.name}</td>
                                <td style={{ fontSize: 11, color: "var(--text2)" }}>{a.prop_firm}</td>
                                <td className="mono">{a.current_balance ? fmt$(a.current_balance) : "-"}</td>
                                <td>
                                  {dd ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <div style={{ flex: 1, height: 6, background: "var(--bg)", borderRadius: 3, overflow: "hidden", minWidth: 60 }}>
                                        <div style={{ width: `${Math.max(dd.pct, 0)}%`, height: "100%", background: dd.color, borderRadius: 3 }} />
                                      </div>
                                      <span className="mono" style={{ fontSize: 11, color: dd.color, fontWeight: 600 }}>{fmt$(dd.remaining)}</span>
                                    </div>
                                  ) : <span style={{ color: "var(--text3)", fontSize: 11 }}>-</span>}
                                </td>
                                <td><span className="tag" style={{ background: st.color + "20", color: st.color }}>{st.label}</span></td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {blocks.filter(b => b.id !== todayBlock.id).length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div className="st" style={{ color: "var(--red)" }}>🔒 Bloques bloqueados hoy</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {blocks.filter(b => b.id !== todayBlock.id).map(b => {
                        const bAccts = amAccounts.filter(a => a.block_id === b.id)
                        return (
                          <div key={b.id} style={{ background: "rgba(255,71,87,.06)", border: "1px solid rgba(255,71,87,.2)", borderRadius: 10, padding: "12px 16px", opacity: 0.6, minWidth: 140 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 14 }}>🔒</span>
                              <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--text3)", fontSize: 13 }}>{b.name}</span>
                            </div>
                            <div style={{ fontSize: 10, color: "var(--text3)" }}>{bAccts.length} cuentas — NO OPERAR</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
                  <div className="st">Registro del día</div>
                  {todayComp ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 20 }}>{todayComp.complied ? "✅" : "❌"}</span>
                      <div>
                        <div style={{ fontFamily: "var(--mono)", fontWeight: 600, fontSize: 13, color: todayComp.complied ? "var(--green)" : "var(--red)" }}>
                          {todayComp.complied ? "Plan cumplido" : "Violación registrada"}
                        </div>
                        {todayComp.violation_note && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{todayComp.violation_note}</div>}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 10 }}>¿Operaste solo las cuentas del {todayBlock.name}?</p>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="btn bs" style={{ background: "var(--gd)", color: "var(--green)" }} onClick={() => markCompliance(true, todayBlock.id)}>✅ Sí, cumplí el plan</button>
                        <button className="btn bs" style={{ background: "var(--rd)", color: "var(--red)" }} onClick={() => setConfirmOperate(true)}>❌ No, operé otro bloque</button>
                        <button className="btn bo bx" onClick={() => markCompliance(true, null)}>No operé hoy</button>
                      </div>
                      {confirmOperate && (
                        <div style={{ marginTop: 12, padding: 12, background: "var(--bg)", borderRadius: 8 }}>
                          <label style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)", display: "block", marginBottom: 4 }}>¿Qué bloque operaste?</label>
                          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                            {blocks.filter(b => b.id !== todayBlock.id).map(b => (
                              <button key={b.id} className="btn bs" style={{ background: b.color + "20", color: b.color }} onClick={() => markCompliance(false, b.id)}>{b.name}</button>
                            ))}
                          </div>
                          <input className="inp" placeholder="Nota (opcional)" value={violationNote} onChange={e => setViolationNote(e.target.value)} style={{ fontSize: 11 }} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ TAB: CONFIG ═══ */}
        {amTab === "config" && (
          <div>
            {/* ── Create block ── */}
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
              <input className="inp" value={newBlockName} onChange={e => setNewBlockName(e.target.value)} placeholder="Nombre del bloque" style={{ width: 160, fontSize: 12 }}
                onKeyDown={e => { if (e.key === "Enter") addBlock() }} />
              <div style={{ display: "flex", gap: 3 }}>
                {BLOCK_COLORS.map(c => (
                  <div key={c} onClick={() => setNewBlockColor(c)}
                    style={{ width: 20, height: 20, borderRadius: 4, background: c, cursor: "pointer", border: newBlockColor === c ? "2px solid var(--text)" : "2px solid transparent" }} />
                ))}
              </div>
              <button className="btn bp bx" onClick={addBlock} disabled={amSaving}>+ Bloque</button>
            </div>

            {/* ── Selection hint ── */}
            {selectedAcctIds.size > 0 && (
              <div style={{ padding: "8px 14px", background: "var(--ad)", borderRadius: 8, marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>{selectedAcctIds.size} seleccionadas</span>
                <span style={{ fontSize: 11, color: "var(--text2)" }}>→ Click en un bloque para asignar</span>
                <button className="btn bo bx" onClick={() => setSelectedAcctIds(new Set())} style={{ fontSize: 10 }}>Deseleccionar</button>
              </div>
            )}

            {/* ── Blocks as drop targets ── */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
              {blocks.map(b => {
                const bAccts = amAccounts.filter(a => a.block_id === b.id)
                const isTarget = selectedAcctIds.size > 0
                return (
                  <div key={b.id}
                    onClick={() => isTarget ? assignToBlock(b.id) : null}
                    style={{
                      background: "var(--bg)", border: `2px solid ${isTarget ? b.color : b.color + "60"}`, borderRadius: 12,
                      padding: "12px 16px", minWidth: 200, flex: "1 1 200px", maxWidth: 400,
                      cursor: isTarget ? "pointer" : "default",
                      transition: "all .2s",
                      boxShadow: isTarget ? `0 0 12px ${b.color}30` : "none"
                    }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: b.color, fontSize: 16 }}>{b.name}</span>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <span style={{ fontSize: 10, color: "var(--text3)" }}>{bAccts.length} cuentas</span>
                        <button onClick={e => { e.stopPropagation(); deleteBlock(b.id) }} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 11, padding: 0 }}>✕</button>
                      </div>
                    </div>
                    {isTarget && (
                      <div style={{ textAlign: "center", padding: "6px 0", border: "1px dashed " + b.color, borderRadius: 6, fontSize: 11, color: b.color, marginBottom: 6 }}>
                        ↓ Soltar {selectedAcctIds.size} cuentas aquí ↓
                      </div>
                    )}
                    {bAccts.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {bAccts.map(a => {
                          const dd = getDDInfo(a)
                          return (
                            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: "var(--surface)", borderRadius: 6, fontSize: 11 }}>
                              <span className="mono" style={{ fontWeight: 600, color: "var(--text)" }}>{a.name}</span>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                {dd && <span className="mono" style={{ fontSize: 10, color: dd.color }}>{fmt$(dd.remaining)}</span>}
                                <button onClick={e => { e.stopPropagation(); unassignFromBlock(a.id) }} style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 10, padding: 0 }} title="Quitar del bloque">✕</button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              {blocks.length === 0 && <div className="em">Crea un bloque arriba para empezar</div>}
            </div>

            {/* ── Unassigned accounts (select to assign) ── */}
            <div className="st">Cuentas {amAccounts.filter(a => !a.block_id).length > 0 ? "— selecciona y luego click en un bloque" : ""}</div>
            {amAccounts.length === 0 ? (
              <div className="em">No hay cuentas. Sincroniza desde NT8 primero.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="tbl">
                  <thead><tr><th style={{ width: 30 }}></th><th>Cuenta</th><th>Firma</th><th>Bloque</th><th>Balance</th><th>DD Max</th><th>DD Disp.</th><th></th></tr></thead>
                  <tbody>
                    {amAccounts.map(a => {
                      const blk = blocks.find(b => b.id === a.block_id)
                      const dd = getDDInfo(a)
                      const isSelected = selectedAcctIds.has(a.id)
                      return (
                        <tr key={a.id} style={{ background: isSelected ? "rgba(76,154,255,.08)" : "transparent", cursor: "pointer" }}
                          onClick={() => toggleSelectAcct(a.id)}>
                          <td style={{ textAlign: "center" }}>
                            <div style={{ width: 16, height: 16, borderRadius: 4, border: isSelected ? "2px solid var(--accent)" : "2px solid var(--border2)", background: isSelected ? "var(--accent)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {isSelected && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>}
                            </div>
                          </td>
                          <td className="mono bold">{a.name}</td>
                          <td style={{ fontSize: 11, color: "var(--text2)" }}>{a.prop_firm}</td>
                          <td>{blk ? <span style={{ color: blk.color, fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600 }}>{blk.name}</span> : <span style={{ color: "var(--text3)", fontSize: 11 }}>Sin asignar</span>}</td>
                          <td className="mono" style={{ fontSize: 11 }}>{a.current_balance ? fmt$(Math.round(a.current_balance)) : "-"}</td>
                          <td onClick={e => e.stopPropagation()}>
                            {editingDD === a.id ? (
                              <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                                <input className="inp" type="number" value={ddInput} onChange={e => setDDInput(e.target.value)} placeholder="2500"
                                  style={{ width: 70, fontSize: 10, padding: "3px 6px" }} autoFocus
                                  onKeyDown={e => { if (e.key === "Enter") saveDD(a.id); if (e.key === "Escape") { setEditingDD(null); setDDInput("") } }} />
                                <button onClick={() => saveDD(a.id)} style={{ background: "none", border: "none", color: "var(--green)", cursor: "pointer", fontSize: 11 }}>✓</button>
                              </div>
                            ) : (
                              <span className="mono" style={{ fontSize: 11, color: a.max_dd ? "var(--text)" : "var(--text3)", cursor: "pointer", textDecoration: "underline dotted" }}
                                onClick={() => { setEditingDD(a.id); setDDInput(a.max_dd ? String(a.max_dd) : "") }}>
                                {a.max_dd ? fmt$(a.max_dd) : "Click"}
                              </span>
                            )}
                          </td>
                          <td>
                            {dd ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div style={{ width: 40, height: 5, background: "var(--bg)", borderRadius: 3, overflow: "hidden" }}>
                                  <div style={{ width: `${Math.max(dd.pct, 0)}%`, height: "100%", background: dd.color, borderRadius: 3 }} />
                                </div>
                                <span className="mono" style={{ fontSize: 10, color: dd.color, fontWeight: 600 }}>{fmt$(dd.remaining)}</span>
                              </div>
                            ) : <span style={{ color: "var(--text3)", fontSize: 10 }}>—</span>}
                          </td>
                          <td onClick={e => e.stopPropagation()}>
                            <button className="btn bd bx" onClick={() => deleteAcct(a.id)} style={{ fontSize: 9 }}>X</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: SCHEDULE ═══ */}
        {amTab === "schedule" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <button className="btn bo bx" onClick={() => setSchedWeekOffset(o => o - 1)}>&lt; Sem</button>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 14 }}>
                  Semana del {schedMonday.getDate()}/{schedMonday.getMonth() + 1}/{schedMonday.getFullYear()}
                </div>
                {schedWeekOffset === 0 && <div style={{ fontSize: 10, color: "var(--green)", fontFamily: "var(--mono)" }}>← semana actual</div>}
              </div>
              <button className="btn bo bx" onClick={() => setSchedWeekOffset(o => o + 1)}>Sem &gt;</button>
            </div>

            {blocks.length === 0 ? (
              <div className="em">Crea bloques primero en la pestaña Cuentas</div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 16 }}>
                  {AM_DAYS.map((dayName, di) => {
                    const daySched = amSchedule.find(s => s.week_start === schedMondayISO && s.day_of_week === di)
                    const dayBlock = daySched ? blocks.find(b => b.id === daySched.block_id) : null
                    const isToday2 = schedWeekOffset === 0 && di === amTodayDOW
                    return (
                      <div key={di} style={{ background: "var(--bg)", border: isToday2 ? "2px solid var(--accent)" : "1px solid var(--border)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: isToday2 ? "var(--accent)" : "var(--text3)", fontFamily: "var(--mono)", fontWeight: 700, marginBottom: 8 }}>{dayName}</div>
                        <select style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: 6, color: dayBlock ? dayBlock.color : "var(--text3)", padding: "8px 4px", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "center", outline: "none" }}
                          value={daySched ? daySched.block_id : ""} onChange={e => setDayBlock(di, e.target.value)}>
                          <option value="">—</option>
                          {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                        {dayBlock && <div style={{ fontSize: 9, color: "var(--text3)", marginTop: 4 }}>{amAccounts.filter(a => a.block_id === dayBlock.id).length} cuentas</div>}
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn bo bs" onClick={copyToNextWeek} disabled={amSaving}>📋 Copiar a semana siguiente</button>
                  <button className="btn bo bx" onClick={() => setSchedWeekOffset(0)}>Ir a semana actual</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ TAB: HISTORIAL ═══ */}
        {amTab === "history" && (
          <div>
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              {[
                ["Cumplimiento", compStats.pct + "%", compStats.pct >= 80 ? "var(--green)" : compStats.pct >= 60 ? "var(--yellow)" : "var(--red)"],
                ["Días", String(compStats.total), "var(--text)"],
                ["Cumplidos", String(compStats.complied), "var(--green)"],
                ["Violaciones", String(compStats.violated), "var(--red)"]
              ].map(([l, v, c]) => (
                <div key={l} style={{ background: "var(--bg)", borderRadius: 10, padding: "12px 20px", flex: 1, minWidth: 100, textAlign: "center" }}>
                  <div className="ml">{l}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--mono)", color: c }}>{v}</div>
                </div>
              ))}
            </div>

            <div className="st">Últimos 60 días</div>
            {amCompliance.length === 0 ? (
              <div className="em">Sin registros aún. Marca tu cumplimiento en la pestaña "Hoy".</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="tbl">
                  <thead><tr><th>Fecha</th><th>Programado</th><th>Operado</th><th>Estado</th><th>Nota</th></tr></thead>
                  <tbody>
                    {amCompliance.map(c => {
                      const sBlock = blocks.find(b => b.id === c.scheduled_block_id)
                      const oBlock = blocks.find(b => b.id === c.operated_block_id)
                      return (
                        <tr key={c.id}>
                          <td className="mono">{fmtD(c.date)}</td>
                          <td>{sBlock ? <span style={{ color: sBlock.color, fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600 }}>{sBlock.name}</span> : "—"}</td>
                          <td>{oBlock ? <span style={{ color: oBlock.color, fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600 }}>{oBlock.name}</span> : "—"}</td>
                          <td><span className={`tag ${c.complied ? "tg" : "tr"}`}>{c.complied ? "OK" : "VIOLACIÓN"}</span></td>
                          <td style={{ fontSize: 11, color: "var(--text3)" }}>{c.violation_note || ""}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </>
  )

  if (inline) return content

  return (
    <div style={mBg} onClick={onClose}>
      <div style={mBox} onClick={e => e.stopPropagation()}>
        {content}
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
  const [inviteCode, setInviteCode] = useState("")
  const [err, setErr] = useState("")
  const [loading, setLoading] = useState(false)

  const doLogin = async () => {
    if (!user || !pass) return setErr("Llena ambos campos")
    setLoading(true); setErr("")
    try {
      const res = await supa(`users?username=eq.${encodeURIComponent(user)}&select=*`)
      const data = await res.json()
      if (!data.length) { setErr("No existe"); setLoading(false); return }
      const hashed = await hashPass(pass)
      if (data[0].password !== hashed) { setErr("Incorrecta"); setLoading(false); return }
      localStorage.setItem("btj_user", JSON.stringify({ id: data[0].id, username: data[0].username, role: data[0].role || "user", instagram: data[0].instagram || "" }))
      onLogin(data[0])
    } catch { setErr("Error") }
    setLoading(false)
  }

  const doRegister = async () => {
    if (!user || !pass) return setErr("Llena ambos campos")
    if (!inviteCode.trim()) return setErr("Codigo de invitacion requerido")
    if (user.length < 3) return setErr("Min 3 caracteres")
    if (pass.length < 4) return setErr("Min 4 caracteres")
    setLoading(true); setErr("")
    try {
      // Verify invite code
      const codeRes = await supa(`invite_codes?code=eq.${encodeURIComponent(inviteCode.trim())}&used_by=is.null&select=*`)
      const codeData = await codeRes.json()
      if (!codeData || !codeData.length) { setErr("Codigo invalido o ya usado"); setLoading(false); return }
      const countRes = await supa("users?select=id")
      const countData = await countRes.json()
      if (countData.length >= 8) { setErr("Max 8 usuarios"); setLoading(false); return }
      const chk = await supa(`users?username=eq.${encodeURIComponent(user)}&select=id`)
      const chkD = await chk.json()
      if (chkD.length) { setErr("Ya existe"); setLoading(false); return }
      // Hash password
      const hashed = await hashPass(pass)
      const res = await supa("users", { method: "POST", body: JSON.stringify({ username: user, password: hashed }) })
      const data = await res.json()
      if (data && data[0]) {
        // Mark invite code as used
        await supa(`invite_codes?id=eq.${codeData[0].id}`, { method: "PATCH", body: JSON.stringify({ used_by: data[0].id, used_at: new Date().toISOString() }) })
        localStorage.setItem("btj_user", JSON.stringify({ id: data[0].id, username: data[0].username, role: data[0].role || "user", instagram: data[0].instagram || "" }))
        onLogin(data[0])
      } else setErr("Error al crear")
    } catch (e) { setErr("Error: " + e.message) }
    setLoading(false)
  }

  const handleKey = e => { if (e.key === "Enter") { mode === "login" ? doLogin() : doRegister() } }

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "40px 36px", width: 360, maxWidth: "90vw" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--accent)", textAlign: "center", marginBottom: 4, fontFamily: "var(--mono)" }}>My Journal Pro</h1>
        <p style={{ textAlign: "center", color: "var(--text3)", fontSize: 12, marginBottom: 28, fontFamily: "var(--mono)" }}>Trading Journal</p>
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "var(--bg)", borderRadius: 8, padding: 3 }}>
          <button onClick={() => { setMode("login"); setErr("") }} style={{ flex: 1, padding: 8, border: "none", borderRadius: 6, background: mode === "login" ? "var(--ad)" : "transparent", color: mode === "login" ? "var(--accent)" : "var(--text3)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Entrar</button>
          <button onClick={() => { setMode("register"); setErr("") }} style={{ flex: 1, padding: 8, border: "none", borderRadius: 6, background: mode === "register" ? "var(--ad)" : "transparent", color: mode === "register" ? "var(--accent)" : "var(--text3)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Registro</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="field"><label>Usuario</label><input className="inp" value={user} onChange={e => setUser(e.target.value.toLowerCase().trim())} onKeyDown={handleKey} /></div>
          <div className="field"><label>Contrasena</label><input className="inp" type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={handleKey} /></div>
          {mode === "register" && <div className="field"><label>Codigo de invitacion</label><input className="inp" value={inviteCode} onChange={e => setInviteCode(e.target.value)} onKeyDown={handleKey} placeholder="Requerido" /></div>}
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
  const [fAcct, setFAcct] = useState("all")  // account filter
  const [fDir, setFDir] = useState("all")   // direction filter
  const [viewSS, setViewSS] = useState(null)
  const [sb, setSb] = useState(window.innerWidth > 900)
  const [calMonth, setCM] = useState(new Date().getMonth())
  const [calYear, setCY] = useState(new Date().getFullYear())
  const [saving, setSaving] = useState(false)
  const [appMode, setAppMode] = useState("bt")
  const [showNT8, setShowNT8] = useState(false)
  const [dayModal, setDayModal] = useState(null)
  const [showCard, setShowCard] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [publicLink, setPublicLink] = useState("")
  const [selectMode, setSelectMode] = useState(false)
  const [selectedTradeIds, setSelectedTradeIds] = useState(new Set())
  const [analyzerOpen, setAnalyzerOpen] = useState(false)
  const [analyzerResult, setAnalyzerResult] = useState(null)
  const [analyzerPos, setAnalyzerPos] = useState({ x: null, y: null })
  const analyzerDragOffset = useRef({ x: 0, y: 0 })
  const fileRef = useRef()

  // Team state
  const [teamShares, setTeamShares] = useState([])    // shares I received
  const [myShares, setMyShares] = useState([])         // shares I gave
  const [allUsers, setAllUsers] = useState([])          // all users for picker
  const [teamTrades, setTeamTrades] = useState([])      // trades from selected teammate
  const [teamUser, setTeamUser] = useState(null)         // selected teammate to view
  const [teamMode, setTeamMode] = useState("bt")
  const [teamLoading, setTeamLoading] = useState(false)
  const [tCalM, setTCalM] = useState(null)  // team calendar month
  const [tCalY, setTCalY] = useState(null)  // team calendar year
  const [tDayModal, setTDayModal] = useState(null) // team day modal date

  // Admin state
  const isAdmin = (user.role || "user") === "admin"
  const [adminUsers, setAdminUsers] = useState([])
  const [adminViewUser, setAdminViewUser] = useState(null)
  const [adminViewTrades, setAdminViewTrades] = useState([])
  const [adminViewMode, setAdminViewMode] = useState("bt")
  const [inviteCodes, setInviteCodes] = useState([])
  const [userBlocks, setUserBlocks] = useState([])

  // User config
  const [userConfig, setUserConfig] = useState({ r_value: 300, setups: "M1,M2,M3,J1,J2,NO", contexts: "APERTURA,ROMPIMIENTO,GIRO,PULLBACK", show_orb: true, show_news: true, show_direction: true, show_atr: true })
  const [configLoaded, setConfigLoaded] = useState(false)
  const userSetups = useMemo(() => (userConfig.setups || "M1,M2,M3,J1,J2,NO").split(",").map(s => s.trim()).filter(Boolean), [userConfig.setups])
  const userContexts = useMemo(() => (userConfig.contexts || "APERTURA,ROMPIMIENTO,GIRO,PULLBACK").split(",").map(s => s.trim()).filter(Boolean), [userConfig.contexts])
  const userSR = useMemo(() => userSetups.filter(s => s !== "NO"), [userSetups])
  const userRV = userConfig.r_value || 300

  // Keep global RV in sync for stats functions
  useEffect(() => { RV = userRV }, [userRV])

  // Trades del modo actual
  const trades = useMemo(() => allTrades.filter(t => (t.mode || "bt") === appMode), [allTrades, appMode])

  // Load ALL trades
  const loadTrades = useCallback(async () => {
    try {
      const res = await supa(`trades?user_id=eq.${user.id}&select=*`)
      const data = await res.json()
      if (Array.isArray(data)) setAllTrades(data.map(d2t))
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [user.id])

  // Load user's blocks for journal form
  const loadUserBlocks = useCallback(async () => {
    try {
      const res = await supa(`am_blocks?user_id=eq.${user.id}&select=*&order=created_at.asc`)
      const data = await res.json()
      if (Array.isArray(data)) setUserBlocks(data)
    } catch (e) { console.error(e) }
  }, [user.id])

  const loadUserConfig = useCallback(async () => {
    try {
      const res = await supa(`user_config?user_id=eq.${user.id}&select=*`)
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        setUserConfig(data[0])
      } else {
        // Create default config for this user
        await supa("user_config", { method: "POST", body: JSON.stringify({ user_id: user.id }) })
        const res2 = await supa(`user_config?user_id=eq.${user.id}&select=*`)
        const data2 = await res2.json()
        if (Array.isArray(data2) && data2.length > 0) setUserConfig(data2[0])
      }
      setConfigLoaded(true)
    } catch (e) { console.error("config load error", e); setConfigLoaded(true) }
  }, [user.id])

  const saveUserConfig = async (updates) => {
    setSaving(true)
    try {
      const newConfig = { ...userConfig, ...updates }
      await supa(`user_config?user_id=eq.${user.id}`, { method: "PATCH", body: JSON.stringify(updates) })
      setUserConfig(newConfig)
    } catch (e) { alert("Error guardando config: " + e.message) }
    finally { setSaving(false) }
  }

  useEffect(() => { loadTrades() }, [loadTrades])
  useEffect(() => { loadUserBlocks() }, [loadUserBlocks])
  useEffect(() => { loadUserConfig() }, [loadUserConfig])
  useEffect(() => {
    const fn = () => setSb(window.innerWidth > 900)
    window.addEventListener("resize", fn)
    return () => window.removeEventListener("resize", fn)
  }, [])

  // ── Team functions ──
  const loadTeam = useCallback(async () => {
    try {
      // Shares I received (others shared with me)
      const r1 = await supa(`shares?shared_with=eq.${user.id}&select=*`)
      const d1 = await r1.json()
      if (Array.isArray(d1)) setTeamShares(d1)
      // Shares I gave
      const r2 = await supa(`shares?owner_id=eq.${user.id}&select=*`)
      const d2 = await r2.json()
      if (Array.isArray(d2)) setMyShares(d2)
      // All users (for picker)
      const r3 = await supa("users?select=id,username")
      const d3 = await r3.json()
      if (Array.isArray(d3)) setAllUsers(d3.filter(u => u.id !== user.id))
    } catch (e) { console.error("team load error", e) }
  }, [user.id])

  useEffect(() => { loadTeam() }, [loadTeam])

  const shareWith = async (targetUserId, shareType, shareFilter, mode) => {
    setSaving(true)
    try {
      // Upsert: delete old + insert new
      await supa(`shares?owner_id=eq.${user.id}&shared_with=eq.${targetUserId}&mode=eq.${mode}`, { method: "DELETE" })
      await supa("shares", { method: "POST", body: JSON.stringify({ owner_id: user.id, shared_with: targetUserId, share_type: shareType, share_filter: shareFilter, mode }) })
      await loadTeam()
      alert("Compartido!")
    } catch (e) { alert("Error: " + e.message) }
    finally { setSaving(false) }
  }

  const unshare = async (shareId) => {
    if (!confirm("Dejar de compartir?")) return
    await supa(`shares?id=eq.${shareId}`, { method: "DELETE" })
    await loadTeam()
  }

  const loadTeamTrades = async (ownerId, share) => {
    setTeamLoading(true)
    setTeamUser(ownerId)
    setTeamMode(share.mode || "bt")
    try {
      let query = `trades?user_id=eq.${ownerId}&mode=eq.${share.mode || "bt"}&select=*&order=created_at.desc`
      const res = await supa(query)
      const data = await res.json()
      if (Array.isArray(data)) {
        let t = data.map(d2t)
        // Apply share filter
        if (share.share_type === "month" && share.share_filter) {
          t = t.filter(tr => tr.fecha && tr.fecha.startsWith(share.share_filter))
        } else if (share.share_type === "daterange" && share.share_filter) {
          const [d1, d2] = share.share_filter.split("|")
          if (d1) t = t.filter(tr => tr.fecha >= d1)
          if (d2) t = t.filter(tr => tr.fecha <= d2)
        } else if (share.share_type === "setup" && share.share_filter) {
          t = t.filter(tr => tr.setup === share.share_filter)
        }
        setTeamTrades(t)
        // Auto-position calendar to month of most recent trade
        const dates = t.filter(tr => tr.fecha).map(tr => safeDate(tr.fecha)).filter(Boolean).sort((a, b) => b - a)
        if (dates.length) {
          setTCalM(dates[0].getMonth())
          setTCalY(dates[0].getFullYear())
        }
      }
    } catch (e) { console.error(e) }
    finally { setTeamLoading(false) }
  }

  // ── Admin functions ──
  const loadAdminUsers = useCallback(async () => {
    if (!isAdmin) return
    try {
      const res = await supa("users?select=id,username,role,created_at&order=created_at.asc")
      const data = await res.json()
      if (Array.isArray(data)) setAdminUsers(data)
    } catch (e) { console.error(e) }
  }, [isAdmin])

  useEffect(() => { loadAdminUsers() }, [loadAdminUsers])

  const loadInviteCodes = useCallback(async () => {
    if (!isAdmin) return
    try {
      const res = await supa("invite_codes?select=*&order=created_at.desc")
      const data = await res.json()
      if (Array.isArray(data)) setInviteCodes(data)
    } catch (e) { console.error(e) }
  }, [isAdmin])

  useEffect(() => { loadInviteCodes() }, [loadInviteCodes])

  const generateInviteCode = async () => {
    const code = "MJP-" + Math.random().toString(36).slice(2, 8).toUpperCase()
    try {
      await supa("invite_codes", { method: "POST", body: JSON.stringify({ code, created_by: user.id }) })
      await loadInviteCodes()
      try { await navigator.clipboard.writeText(code) } catch {}
      alert(`Codigo generado: ${code} (copiado al clipboard)`)
    } catch (e) { alert("Error: " + e.message) }
  }

  const deleteInviteCode = async (codeId) => {
    await supa(`invite_codes?id=eq.${codeId}`, { method: "DELETE" })
    await loadInviteCodes()
  }

  const adminResetPassword = async (userId, newPass) => {
    if (!newPass || newPass.length < 4) return alert("Min 4 caracteres")
    const hashed = await hashPass(newPass)
    await supa(`users?id=eq.${userId}`, { method: "PATCH", body: JSON.stringify({ password: hashed }) })
    alert("Contraseña actualizada (hasheada)")
  }

  const adminDeleteUser = async (userId, username) => {
    if (username === "admin") return alert("No puedes borrar admin")
    if (!confirm(`Borrar usuario "${username}" y TODOS sus trades?`)) return
    const typed = prompt("Escribe BORRAR para confirmar:")
    if (typed !== "BORRAR") return alert("Cancelado")
    try {
      await supa(`trades?user_id=eq.${userId}`, { method: "DELETE" })
      await supa(`shares?owner_id=eq.${userId}`, { method: "DELETE" })
      await supa(`shares?shared_with=eq.${userId}`, { method: "DELETE" })
      await supa(`public_links?user_id=eq.${userId}`, { method: "DELETE" })
      await supa(`invite_codes?used_by=eq.${userId}`, { method: "PATCH", body: JSON.stringify({ used_by: null, used_at: null }) })
      const res = await supa(`users?id=eq.${userId}`, { method: "DELETE" })
      const data = await res.json()
      if (res.ok) {
        await loadAdminUsers()
        alert("Usuario borrado correctamente")
      } else {
        alert("Error al borrar: " + JSON.stringify(data))
      }
    } catch (e) { alert("Error: " + e.message) }
  }

  const adminViewUserTrades = async (userId, mode) => {
    setAdminViewUser(userId)
    setAdminViewMode(mode)
    try {
      const res = await supa(`trades?user_id=eq.${userId}&mode=eq.${mode}&select=*&order=created_at.desc`)
      const data = await res.json()
      if (Array.isArray(data)) setAdminViewTrades(data.map(d2t))
    } catch (e) { console.error(e) }
  }

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
      const keepDate = form.fecha
      if (editId) {
        setEditId(null)
        setForm({ ...DFT })
        setTab("trades")
      } else {
        // Stay on addTrade, keep last fecha for backtesting flow
        setForm({ ...DFT, fecha: keepDate })
      }
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
  const toggleSelectTrade = (id) => {
    setSelectedTradeIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const selectAllFiltered = () => {
    setSelectedTradeIds(new Set(filtered.map(t => t.id)))
  }
  const deleteSelected = async () => {
    if (selectedTradeIds.size === 0) return
    if (!confirm(`⚠️ Borrar ${selectedTradeIds.size} trades seleccionados?\n\nEsta acción no se puede deshacer.`)) return
    setSaving(true)
    try {
      for (const id of selectedTradeIds) {
        await supa(`trades?id=eq.${id}`, { method: "DELETE" })
      }
      setSelectedTradeIds(new Set())
      setSelectMode(false)
      await loadTrades()
    } catch (e) { alert("Error: " + e.message) }
    finally { setSaving(false) }
  }

  // ── Local Analyzer ──
  const runAnalysis = (type) => {
    const s = stats
    const ex = extra
    const be = beAnalysis(filtered)
    const ha = hourAnalysis(filtered)
    const mo = grpBy(trades, t => getMo(t.fecha))
    const dy = grpBy(trades, t => t.fecha)
    const t2 = rT(filtered)
    let title = "", lines = []

    if (type === "resumen") {
      title = "📊 Resumen General"
      lines.push(`Modo: ${modeLabel} | ${s.total} trades analizados`)
      lines.push("")
      if (s.total === 0) { lines.push("No hay trades para analizar."); setAnalyzerResult({ title, lines }); return }
      lines.push(`P&L: ${s.totalR >= 0 ? "+" : ""}${s.totalR}R (${fmt$(s.totalDollar)})`)
      lines.push(`Win Rate: ${s.winRate.toFixed(2)}% (${s.wins}W / ${s.losses}L / ${s.bes}BE)`)
      lines.push(`Profit Factor: ${fmtPF(s.profitFactor)} | Expectancy: ${s.expectancy}R (${fmt$(s.expectDollar)}/trade)`)
      lines.push(`Sharpe: ${s.sharpeRatio.toFixed(2)} | Recovery: ${s.recoveryFactor === Infinity ? "∞" : s.recoveryFactor.toFixed(2)} | Payoff: ${s.payoffRatio === Infinity ? "∞" : s.payoffRatio.toFixed(2)}`)
      lines.push("")
      lines.push(`Racha WIN: ${s.maxWinStreak} | Racha LOSS: ${s.maxLossStreak} | Max DD: ${s.maxEquityDD}R`)
      lines.push(`Dur promedio → WIN: ${s.avgDurWin}min | SL: ${s.avgDurSL}min | BE: ${s.avgDurBE}min`)
      lines.push("")
      if (s.winRate >= 50 && s.profitFactor >= 1.5) lines.push("✅ Estadísticas sólidas. Mantén la disciplina.")
      else if (s.winRate >= 40 && s.profitFactor >= 1) lines.push("⚠️ Rentable pero ajustado. Busca mejorar el payoff ratio.")
      else lines.push("🔴 Necesitas ajustes. Revisa tus setups y gestión de riesgo.")
      if (s.bes > s.wins) lines.push(`⚠️ Tienes más BEs (${s.bes}) que WINs (${s.wins}). Revisa tu trailing stop.`)
    }

    else if (type === "be") {
      title = "💰 Análisis de BEs — Dinero sobre la mesa"
      if (!be || be.withData === 0) { lines.push("No hay BEs con R máximo registrado."); setAnalyzerResult({ title, lines }); return }
      lines.push(`Total BEs: ${be.total} | Con data de R max: ${be.withData}`)
      lines.push(`R dejados sobre la mesa: +${be.totalMissed}R (${fmt$(be.totalMissedDollar)})`)
      lines.push(`Promedio por BE: +${be.avgMissed}R (${fmt$(Math.round(be.avgMissed * RV))})`)
      lines.push("")
      if (be.worstMissed) lines.push(`🔴 Peor BE: +${be.worstMissed.rmax}R el ${fmtD(be.worstMissed.fecha)} (${be.worstMissed.setup})`)
      lines.push("")
      lines.push("Distribución de R máximo en BEs:")
      be.buckets.forEach(b => {
        const bar = "█".repeat(Math.max(1, Math.round(b.pct / 5)))
        lines.push(`  ${b.label.padEnd(8)} ${bar} ${b.count} (${b.pct}%)`)
      })
      lines.push("")
      if (be.bySetup.length) {
        lines.push("Por Setup:")
        be.bySetup.forEach(s2 => lines.push(`  ${s2.setup}: ${s2.count} BEs, +${s2.totalR}R dejados (prom ${s2.avgR}R)`))
      }
      lines.push("")
      const bigBEs = be.buckets.filter(b => b.min >= 2).reduce((a, b2) => a + b2.count, 0)
      if (bigBEs > 0) lines.push(`🔴 ${bigBEs} BEs pasaron de 2R. Ahí estás dejando dinero real.`)
      if (be.totalMissed > be.withData) lines.push(`💡 Si capturaras solo 1R en cada BE, ganarías +${be.withData}R (${fmt$(be.withData * RV)}) extra.`)
    }

    else if (type === "hora") {
      title = "🕐 Análisis por Hora"
      if (!ha.length) { lines.push("No hay data por hora."); setAnalyzerResult({ title, lines }); return }
      const best = ha.reduce((a, x) => x.totalR > a.totalR ? x : a, ha[0])
      const worst = ha.reduce((a, x) => x.totalR < a.totalR ? x : a, ha[0])
      lines.push("Hora      Trades  Win%    R Total  PF")
      lines.push("─".repeat(46))
      ha.forEach(h => {
        const flag = h === best ? " ✅" : h === worst && h.totalR < 0 ? " 🔴" : ""
        lines.push(`${h.hour.padEnd(10)}${String(h.total).padEnd(8)}${(h.winRate.toFixed(1) + "%").padEnd(8)}${((h.totalR >= 0 ? "+" : "") + h.totalR + "R").padEnd(10)}${fmtPF(h.profitFactor)}${flag}`)
      })
      lines.push("")
      if (best.total >= 3) lines.push(`✅ Mejor hora: ${best.hour} → ${best.winRate.toFixed(1)}%WR, +${best.totalR}R`)
      if (worst.total >= 3 && worst.totalR < 0) lines.push(`🔴 Peor hora: ${worst.hour} → ${worst.winRate.toFixed(1)}%WR, ${worst.totalR}R`)
      const profitable = ha.filter(h => h.totalR > 0 && h.total >= 2)
      if (profitable.length) lines.push(`💡 Horas rentables: ${profitable.map(h => h.hour).join(", ")}`)
    }

    else if (type === "setups") {
      title = "◆ Comparación de Setups"
      lines.push("Setup  Trades  Win%    R Total  PF      Exp")
      lines.push("─".repeat(52))
      userSR.forEach(su => {
        const ss = cS(trades.filter(t => t.setup === su))
        if (ss.total === 0) return
        lines.push(`${su.padEnd(7)}${String(ss.total).padEnd(8)}${(ss.winRate.toFixed(1) + "%").padEnd(8)}${((ss.totalR >= 0 ? "+" : "") + ss.totalR + "R").padEnd(10)}${fmtPF(ss.profitFactor).padEnd(8)}${ss.expectancy}R`)
      })
      lines.push("")
      const allSetups = userSR.map(su => ({ su, ...cS(trades.filter(t => t.setup === su)) })).filter(x => x.total >= 3)
      if (allSetups.length) {
        const bestS = allSetups.reduce((a, x) => x.expectancy > a.expectancy ? x : a, allSetups[0])
        const worstS = allSetups.reduce((a, x) => x.expectancy < a.expectancy ? x : a, allSetups[0])
        lines.push(`✅ Mejor setup: ${bestS.su} (${bestS.expectancy}R exp, ${bestS.winRate.toFixed(1)}%WR)`)
        if (worstS.expectancy < 0) lines.push(`🔴 Peor setup: ${worstS.su} (${worstS.expectancy}R exp) — considera eliminarlo`)
      }
    }

    else if (type === "tendencia") {
      title = "📈 Tendencia Reciente"
      const last10 = dy.slice(0, 10)
      const prev10 = dy.slice(10, 20)
      if (!last10.length) { lines.push("No hay suficientes datos."); setAnalyzerResult({ title, lines }); return }
      const r10 = Math.round(last10.reduce((a, d) => a + d.totalR, 0) * 100) / 100
      const wr10 = last10.length ? Math.round(last10.reduce((a, d) => a + d.wins, 0) / last10.reduce((a, d) => a + d.total, 0) * 10000) / 100 : 0
      lines.push("Últimos 10 días de trading:")
      last10.forEach(d => {
        const emoji = d.totalR > 0 ? "🟢" : d.totalR < 0 ? "🔴" : "🟡"
        lines.push(`  ${emoji} ${d.key}: ${d.totalR >= 0 ? "+" : ""}${d.totalR}R (${d.total}t, ${d.winRate.toFixed(0)}%WR)`)
      })
      lines.push("")
      lines.push(`Total últimos 10 días: ${r10 >= 0 ? "+" : ""}${r10}R | Win%: ${wr10}%`)
      if (prev10.length) {
        const rPrev = Math.round(prev10.reduce((a, d) => a + d.totalR, 0) * 100) / 100
        lines.push(`10 días anteriores: ${rPrev >= 0 ? "+" : ""}${rPrev}R`)
        if (r10 > rPrev) lines.push("✅ Tendencia mejorando")
        else if (r10 < rPrev) lines.push("⚠️ Tendencia empeorando")
        else lines.push("➡️ Tendencia estable")
      }
      // Win/loss streak check
      const recent = last10.slice(0, 5)
      const allGreen = recent.every(d => d.totalR >= 0)
      const allRed = recent.every(d => d.totalR < 0)
      if (allGreen) lines.push("🔥 5 días seguidos en positivo. Buen momento.")
      if (allRed) lines.push("🧊 5 días seguidos en negativo. Considera pausar y revisar.")
    }

    else if (type === "mensual") {
      title = "📅 Rendimiento Mensual"
      if (!mo.length) { lines.push("No hay data mensual."); setAnalyzerResult({ title, lines }); return }
      lines.push("Mes        Trades  Win%    R Total  PF")
      lines.push("─".repeat(48))
      mo.forEach(m => {
        const emoji = m.totalR > 0 ? "🟢" : m.totalR < 0 ? "🔴" : "🟡"
        lines.push(`${emoji} ${m.key.padEnd(9)}${String(m.total).padEnd(8)}${(m.winRate.toFixed(1) + "%").padEnd(8)}${((m.totalR >= 0 ? "+" : "") + m.totalR + "R").padEnd(10)}${fmtPF(m.profitFactor)}`)
      })
      lines.push("")
      const greenMonths = mo.filter(m => m.totalR > 0).length
      const totalMonths = mo.length
      lines.push(`Meses verdes: ${greenMonths}/${totalMonths} (${Math.round(greenMonths / totalMonths * 100)}%)`)
      const bestM = mo.reduce((a, x) => x.totalR > a.totalR ? x : a, mo[0])
      const worstM = mo.reduce((a, x) => x.totalR < a.totalR ? x : a, mo[0])
      lines.push(`✅ Mejor mes: ${bestM.key} (+${bestM.totalR}R)`)
      if (worstM.totalR < 0) lines.push(`🔴 Peor mes: ${worstM.key} (${worstM.totalR}R)`)
    }

    else if (type === "direccion") {
      title = "🧭 Análisis por Dirección del Día"
      const dirData = DIRS.map(d => {
        const dirTrades = rT(filtered).filter(t => t.direccionDia === d)
        if (!dirTrades.length) return null
        const ds = cS(dirTrades)
        const dirBE = beAnalysis(dirTrades)
        return { dir: d, ...ds, beMissed: dirBE && dirBE.withData > 0 ? dirBE.totalMissed : 0, beCount: dirBE ? dirBE.total : 0 }
      }).filter(Boolean)

      if (!dirData.length) { lines.push("No hay data de dirección."); setAnalyzerResult({ title, lines }); return }

      lines.push("Dirección   Trades  Win%    R Total  PF      BEs   R en mesa")
      lines.push("─".repeat(62))
      dirData.forEach(d => {
        const emoji = d.dir === "ALCISTA" ? "🟢" : d.dir === "BAJISTA" ? "🔴" : "🟡"
        lines.push(`${emoji} ${d.dir.padEnd(11)}${String(d.total).padEnd(8)}${(d.winRate.toFixed(1) + "%").padEnd(8)}${((d.totalR >= 0 ? "+" : "") + d.totalR + "R").padEnd(10)}${fmtPF(d.profitFactor).padEnd(8)}${String(d.beCount).padEnd(6)}${d.beMissed ? "+" + d.beMissed + "R" : "-"}`)
      })
      lines.push("")

      // Best direction
      const bestDir = dirData.reduce((a, x) => x.totalR > a.totalR ? x : a, dirData[0])
      const worstDir = dirData.reduce((a, x) => x.totalR < a.totalR ? x : a, dirData[0])
      lines.push(`✅ Mejor dirección: ${bestDir.dir} (${bestDir.winRate.toFixed(1)}%WR, +${bestDir.totalR}R, PF:${fmtPF(bestDir.profitFactor)})`)
      if (worstDir.totalR < 0) lines.push(`🔴 Peor dirección: ${worstDir.dir} (${worstDir.winRate.toFixed(1)}%WR, ${worstDir.totalR}R)`)
      lines.push("")

      // Setup breakdown per direction
      dirData.forEach(d => {
        const dirTrades2 = rT(filtered).filter(t => t.direccionDia === d.dir)
        const setupBreak = userSR.map(su => {
          const st = cS(dirTrades2.filter(t => t.setup === su))
          return st.total > 0 ? { su, ...st } : null
        }).filter(Boolean)
        if (setupBreak.length) {
          lines.push(`${d.dir} por Setup:`)
          setupBreak.forEach(sb2 => {
            lines.push(`  ${sb2.su}: ${sb2.total}t, ${sb2.winRate.toFixed(0)}%WR, ${sb2.totalR >= 0 ? "+" : ""}${sb2.totalR}R`)
          })
          lines.push("")
        }
      })

      // Context analysis per direction
      dirData.forEach(d => {
        const dirTrades3 = rT(filtered).filter(t => t.direccionDia === d.dir)
        const ctxBreak = CTXS.map(c => {
          const ct = cS(dirTrades3.filter(t => t.contexto === c))
          return ct.total > 0 ? { ctx: c, ...ct } : null
        }).filter(Boolean)
        if (ctxBreak.length) {
          lines.push(`${d.dir} por Contexto:`)
          ctxBreak.forEach(c => {
            lines.push(`  ${c.ctx}: ${c.total}t, ${c.winRate.toFixed(0)}%WR, ${c.totalR >= 0 ? "+" : ""}${c.totalR}R`)
          })
          lines.push("")
        }
      })

      // Insight
      if (bestDir.total >= 5 && worstDir.totalR < 0 && worstDir.total >= 5) {
        lines.push(`💡 En días ${bestDir.dir} rindes ${Math.abs(bestDir.totalR - worstDir.totalR)}R más que en días ${worstDir.dir}. Considera ajustar tu tamaño en días ${worstDir.dir}.`)
      }
    }

    setAnalyzerResult({ title, lines })
  }
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
        const raw = ev.target.result.replace(/\r/g, "")
        const allLines = raw.split("\n").filter(l => l.trim())
        // Detect separator: ; or ,
        const sep = allLines.some(l => l.split(";").length > 5) ? ";" : ","
        // Find header row (the one containing "fecha")
        let headerIdx = allLines.findIndex(l => l.toLowerCase().includes("fecha") && l.toLowerCase().includes("setup"))
        if (headerIdx < 0) headerIdx = 0
        const hd = allLines[headerIdx].split(sep).map(h => h.replace(/"/g, "").trim())
        // Find data start: first row after header that starts with a date (20XX)
        let dataStart = headerIdx + 1
        while (dataStart < allLines.length && !/^\d{4}/.test(allLines[dataStart].trim().replace(/"/g, ""))) dataStart++
        if (dataStart >= allLines.length) { alert("No se encontraron datos"); setSaving(false); return }

        // Normalize values
        const norm = (key, val) => {
          if (!val) return val
          // Fix decimal commas for numeric fields
          if (["atr", "puntosSlStr", "ddPuntos", "rResultado", "rMaximo", "m5", "m15", "m30"].includes(key)) {
            return val.replace(",", ".")
          }
          // Normalize contexto
          if (key === "contexto") {
            const u = val.toUpperCase()
            if (u.includes("BREAK") || u.includes("ROMP")) return "ROMPIMIENTO"
            if (u.includes("GIRO")) return "GIRO"
            if (u.includes("APERT")) return "APERTURA"
            return u
          }
          // Normalize buySell
          if (key === "buySell") {
            const u = val.toUpperCase()
            if (u === "BULL" || u === "LONG" || u.startsWith("B")) return "BUY"
            if (u === "BEAR" || u === "SHORT" || u.startsWith("S")) return "SELL"
            return u
          }
          // Normalize resultado
          if (key === "resultado") {
            const u = val.toUpperCase().trim()
            if (u === "WIN" || u === "W") return "WIN"
            if (u === "SL" || u === "LOSS" || u === "L") return "SL"
            if (u === "BE" || u === "BREAKEVEN") return "BE"
            return u
          }
          // Normalize hayNoticia / breakRangoM30
          if (key === "hayNoticia" || key === "breakRangoM30") {
            const u = val.toUpperCase().trim()
            return u === "SI" || u === "YES" || u === "S" ? "SI" : "NO"
          }
          // Fix hora format (9:48:00 -> 09:48)
          if (key === "horaInicio" || key === "horaFinal") {
            const parts = val.split(":")
            if (parts.length >= 2) return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`
          }
          return val
        }

        const rows = allLines.slice(dataStart).filter(l => /^\d{4}/.test(l.trim().replace(/"/g, ""))).map(line => {
          const vs = line.split(sep).map(v => v.replace(/"/g, "").trim())
          const o = { ...DFT }
          hd.forEach((h, i) => { if (vs[i] && vs[i].length) o[h] = norm(h, vs[i]) })
          // Auto-calc duracion
          if (o.horaInicio && o.horaFinal) o.duracionTrade = String(cDur(o.horaInicio, o.horaFinal) || "")
          // SL default
          if (o.resultado === "SL" && !o.rResultado) o.rResultado = "-1"
          if (o.resultado === "BE") o.rResultado = "0"
          return o
        })

        if (!rows.length) { alert("No se encontraron trades validos"); setSaving(false); return }

        for (let i = 0; i < rows.length; i += 20) {
          await supa("trades", { method: "POST", body: JSON.stringify(rows.slice(i, i + 20).map(t => t2d(t, user.id, appMode))) })
        }
        await loadTrades()
        alert(rows.length + " trades importados")
      } catch (err) { alert("Error importando: " + err.message) }
      finally { setSaving(false) }
    }
    reader.readAsText(f)
  }

  const deleteAll = async () => {
    if (!trades.length) return
    if (!confirm(`⚠️ Vas a borrar ${trades.length} trades de ${modeLabel}.\n\nEsto NO borra tu cuenta, solo los trades.\n\n¿Continuar?`)) return
    const typed = prompt(`Para confirmar, escribe BORRAR (en mayusculas):`)
    if (typed !== "BORRAR") { alert("Cancelado. No se borró nada."); return }
    setSaving(true)
    try { await supa(`trades?user_id=eq.${user.id}&mode=eq.${appMode}`, { method: "DELETE" }); await loadTrades(); alert("Trades borrados.") }
    catch { alert("Error al borrar") }
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

  const generatePublicLink = async (shareType, shareFilter) => {
    setSaving(true)
    try {
      const linkId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      await supa("public_links", { method: "POST", body: JSON.stringify({ id: linkId, user_id: user.id, mode: appMode, share_type: shareType, share_filter: shareFilter }) })
      const url = `${window.location.origin}${window.location.pathname}?pub=${linkId}`
      setPublicLink(url)
      try { await navigator.clipboard.writeText(url) } catch {}
      alert("Link copiado al clipboard!")
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
  // Unique account names from trades (for filter dropdown)
  const accountNames = useMemo(() => {
    const names = new Set()
    trades.forEach(t => { if (t.accountName) names.add(t.accountName) })
    return Array.from(names).sort()
  }, [trades])

  const filtered = useMemo(() => {
    let ft = [...trades]
    if (fAcct !== "all") ft = ft.filter(t => t.accountName === fAcct)
    if (fDir !== "all") ft = ft.filter(t => t.direccionDia === fDir)
    if (fS !== "all") ft = ft.filter(t => t.setup === fS)
    if (fd1) ft = ft.filter(t => t.fecha >= fd1)
    if (fd2) ft = ft.filter(t => t.fecha <= fd2)
    if (fP !== "all") {
      const now = new Date()
      if (fP === "week") { const w = new Date(now - 7 * 864e5); ft = ft.filter(t => safeDate(t.fecha) >= w) }
      else if (fP === "month") ft = ft.filter(t => { const d = safeDate(t.fecha); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() })
      else if (fP === "year") ft = ft.filter(t => safeDate(t.fecha).getFullYear() === now.getFullYear())
    }
    ft = ft.sort((a, b) => safeDate(b.fecha) - safeDate(a.fecha))
    // N trades filter — applied last so it gets the N most recent
    if (fN && parseInt(fN) > 0) ft = ft.slice(0, parseInt(fN))
    return ft
  }, [trades, fP, fS, fN, fd1, fd2, fAcct, fDir])

  const stats = useMemo(() => cS(filtered), [filtered])
  const extra = useMemo(() => extraS(filtered), [filtered])
  const daily = useMemo(() => grpBy(trades, t => t.fecha), [trades])
  const monthly = useMemo(() => grpBy(trades, t => getMo(t.fecha)), [trades])
  const yearly = useMemo(() => grpBy(trades, t => t.fecha ? `20${getYr(t.fecha)}` : ""), [trades])
  const setupStats = useMemo(() => { const m = {}; userSR.forEach(s => m[s] = cS(trades.filter(t => t.setup === s))); return m }, [trades, userSR])
  const rTaken = useMemo(() => rDist(filtered, "rResultado"), [filtered])
  const rMax = useMemo(() => rDist(filtered, "rMaximo"), [filtered])
  const hStats = useMemo(() => hourAnalysis(filtered), [filtered])
  const atrStats = useMemo(() => atrAnalysis(filtered), [filtered])
  const slStats = useMemo(() => slAnalysis(filtered), [filtered])
  const beStats = useMemo(() => beAnalysis(filtered), [filtered])
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
    { id: "tips", l: "Tips", i: "★" },
    ...(appMode === "journal" ? [{ id: "acctmgr", l: "Cuentas", i: "📊" }] : []),
    { id: "config", l: "Config", i: "⚙" },
    { id: "team", l: "Team", i: "♦" },
    ...(isAdmin ? [{ id: "admin", l: "Admin", i: "⚙" }] : [])
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
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
      {appMode === "journal" && accountNames.length > 0 && (
        <select className="inp" style={{ width: "auto", fontSize: 11, padding: "6px 8px", borderColor: fAcct !== "all" ? "var(--purple)" : "var(--border2)", color: fAcct !== "all" ? "var(--purple)" : "var(--text)" }} value={fAcct} onChange={e => setFAcct(e.target.value)}>
          <option value="all">Todas las cuentas</option>
          {accountNames.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      )}
      <select className="inp" style={{ width: "auto" }} value={fS} onChange={e => setFS(e.target.value)}>
        <option value="all">All</option>
        {userSR.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className="inp" style={{ width: "auto", fontSize: 11, padding: "6px 8px", borderColor: fDir !== "all" ? (fDir === "ALCISTA" ? "var(--green)" : fDir === "BAJISTA" ? "var(--red)" : "var(--yellow)") : "var(--border2)", color: fDir !== "all" ? (fDir === "ALCISTA" ? "var(--green)" : fDir === "BAJISTA" ? "var(--red)" : "var(--yellow)") : "var(--text)" }} value={fDir} onChange={e => setFDir(e.target.value)}>
        <option value="all">Dirección</option>
        {DIRS.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
      <div className="pb">
        {["all", "week", "month", "year"].map(p => (
          <button key={p} className={`pbtn ${fP === p ? "active" : ""}`} onClick={() => setFP(p)}>
            {{ all: "Todo", week: "7d", month: "Mes", year: "Ano" }[p]}
          </button>
        ))}
      </div>
      <DatePick value={fd1} onChange={v => { if (fd2 && v && v > fd2) { setFd1(fd2); setFd2(v); const dd = new Date(v + "T12:00:00"); setCM(dd.getMonth()); setCY(dd.getFullYear()) } else { setFd1(v); if (v) { const dd = new Date(v + "T12:00:00"); setCM(dd.getMonth()); setCY(dd.getFullYear()) } } }} label="Desde" compact />
      <DatePick value={fd2} onChange={v => { if (fd1 && v && v < fd1) { setFd2(fd1); setFd1(v); const dd = new Date(v + "T12:00:00"); setCM(dd.getMonth()); setCY(dd.getFullYear()) } else setFd2(v) }} label="Hasta" compact />
      <div className="field" style={{ gap: 3 }}>
        <label style={{ fontSize: 8 }}>N trades</label>
        <input className="inp" type="number" min="1" style={{ width: 60, fontSize: 11, padding: "6px 4px" }} value={fN} onChange={e => setFN(e.target.value)} placeholder="Ult" />
      </div>
      {(fd1 || fd2 || fS !== "all" || fP !== "all" || fN || fAcct !== "all" || fDir !== "all") && <button className="btn bo bx" style={{ fontSize: 10 }} onClick={() => { setFd1(""); setFd2(""); setFS("all"); setFP("all"); setFN(""); setFAcct("all"); setFDir("all"); setCM(new Date().getMonth()); setCY(new Date().getFullYear()) }}>Reset</button>}
    </div>
  )

  // ── Calendar data ──
  const calByDay = useMemo(() => {
    const bd = {}
    trades.forEach(t => {
      if (!t.fecha) return
      const d = safeDate(t.fecha)
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
    const d = safeDate(t.fecha)
    return d.getMonth() === calMonth && d.getFullYear() === calYear
  })
  const monthR = Math.round(rT(monthTrades).reduce((a, t) => a + gR(t), 0) * 100) / 100

  const makeDate = d => `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`

  if (loading) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ color: accentColor, fontFamily: "var(--mono)" }}>Cargando...</div>
    </div>
  }

  // ── RENDER empieza en PARTE 3 ──

  // ═══════════════════════════════════════════════
  // ═══════════════════════════════════════════════

  return (
    <>
      {/* Screenshot modal with navigation */}
      {viewSS && (() => {
        // Build list of all screenshots from current trades for navigation
        const allSS = trades.filter(t => t.screenshot).sort((a, b) => {
          const dc = (a.fecha || "").localeCompare(b.fecha || "")
          if (dc !== 0) return dc
          return (a.horaInicio || "").localeCompare(b.horaInicio || "")
        }).map(t => ({ url: t.screenshot, fecha: t.fecha, hora: t.horaInicio, r: gR(t), resultado: t.resultado }))
        const curIdx = allSS.findIndex(s => s.url === (typeof viewSS === "string" ? viewSS : viewSS.url))
        const ssUrl = typeof viewSS === "string" ? viewSS : viewSS.url
        const prev = curIdx > 0 ? allSS[curIdx - 1] : null
        const next = curIdx < allSS.length - 1 ? allSS[curIdx + 1] : null
        const cur = curIdx >= 0 ? allSS[curIdx] : null

        const goSS = (ss) => {
          setViewSS({ url: ss.url })
          if (ss.fecha && dayModal) setDayModal(ss.fecha)
          if (ss.fecha && tDayModal) setTDayModal(ss.fecha)
        }

        return (
          <div className="ss-modal" onClick={e => { e.stopPropagation(); setViewSS(null) }}
            onKeyDown={e => { if (e.key === "ArrowLeft" && prev) { e.stopPropagation(); goSS(prev) } else if (e.key === "ArrowRight" && next) { e.stopPropagation(); goSS(next) } }} tabIndex={0} ref={el => el && el.focus()}>
            {/* Left arrow */}
            {prev && (
              <div onClick={e => { e.stopPropagation(); goSS(prev) }}
                style={{ position: "fixed", left: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,.7)", borderRadius: 10, padding: "16px 12px", cursor: "pointer", zIndex: 10001, textAlign: "center" }}>
                <div style={{ fontSize: 24, color: "var(--text)" }}>◀</div>
                <div style={{ fontSize: 9, color: "var(--text3)", fontFamily: "var(--mono)", marginTop: 4 }}>{fmtD(prev.fecha)}</div>
                <div style={{ fontSize: 9, color: prev.r > 0 ? "var(--green)" : prev.r < 0 ? "var(--red)" : "var(--yellow)", fontFamily: "var(--mono)" }}>{fmtR(prev.r)}</div>
              </div>
            )}
            {/* Image */}
            <div onClick={e => e.stopPropagation()} style={{ position: "relative" }}>
              <img src={ssUrl} style={{ maxWidth: "85vw", maxHeight: "85vh", borderRadius: 10 }} />
              {cur && (
                <div style={{ position: "absolute", bottom: -30, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text)" }}>{fmtD(cur.fecha)} {cur.hora}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: cur.r > 0 ? "var(--green)" : cur.r < 0 ? "var(--red)" : "var(--yellow)" }}>{fmtR(cur.r)}</span>
                  <span style={{ fontSize: 10, color: "var(--text3)" }}>{curIdx + 1}/{allSS.length}</span>
                </div>
              )}
            </div>
            {/* Right arrow */}
            {next && (
              <div onClick={e => { e.stopPropagation(); goSS(next) }}
                style={{ position: "fixed", right: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,.7)", borderRadius: 10, padding: "16px 12px", cursor: "pointer", zIndex: 10001, textAlign: "center" }}>
                <div style={{ fontSize: 24, color: "var(--text)" }}>▶</div>
                <div style={{ fontSize: 9, color: "var(--text3)", fontFamily: "var(--mono)", marginTop: 4 }}>{fmtD(next.fecha)}</div>
                <div style={{ fontSize: 9, color: next.r > 0 ? "var(--green)" : next.r < 0 ? "var(--red)" : "var(--yellow)", fontFamily: "var(--mono)" }}>{fmtR(next.r)}</div>
              </div>
            )}
          </div>
        )
      })()}
      {/* NT8 import modal */}
      {showNT8 && <NT8Modal onImport={handleNT8Import} onClose={() => setShowNT8(false)} />}
      {/* Share card modal */}
      {showCard && <ShareCardModal stats={stats} modeLabel={modeLabel} instagram={user.instagram || ""} fd1={fd1} fd2={fd2} onClose={() => setShowCard(false)} />}
      {/* Day detail modal */}
      {dayModal && <DayModal date={dayModal} trades={trades} onClose={() => setDayModal(null)} onViewSS={setViewSS} onNavigate={setDayModal} />}
      {/* Team day detail modal */}
      {tDayModal && <DayModal date={tDayModal} trades={teamTrades} onClose={() => setTDayModal(null)} onViewSS={setViewSS} onNavigate={setTDayModal} />}
      {/* Mobile overlay */}
      {sb && window.innerWidth <= 900 && <div className="overlay" onClick={() => setSb(false)} />}

      {/* Mobile top bar */}
      <div className="mobile-bar">
        <button onClick={() => setSb(!sb)} style={{ background: "none", border: "none", color: "var(--text)", fontSize: 20, cursor: "pointer" }}>☰</button>
        <span style={{ fontWeight: 700, color: accentColor, fontFamily: "var(--mono)", fontSize: 13 }}>MY JOURNAL PRO</span>
        <div style={{ width: 28 }} />
      </div>

      {/* ── SIDEBAR ── */}
      <div className={`sidebar ${sb ? "open" : "closed"}`}>
        <div className="sb-brand">
          <h1 style={{ color: accentColor }}>My Journal Pro</h1>
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
    {/* Header */}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
      <div>
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--text3)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Dashboard</div>
        <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1 }}>{modeLabel} <span style={{ color: accentColor, fontSize: 14, fontFamily: "var(--mono)" }}>{stats.total} trades</span></h1>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
        <Filters />
        <div style={{ display: "flex", gap: 4, marginTop: 14 }}>
          <button className="btn bo bx" style={{ fontSize: 10 }} onClick={() => setShowCard(true)}>📱 Card</button>
          <button className="btn bo bx" style={{ fontSize: 10 }} onClick={() => {
            const sType = fd1 || fd2 ? "daterange" : "all"
            const sFilter = fd1 || fd2 ? `${fd1}|${fd2}` : ""
            generatePublicLink(sType, sFilter)
          }}>🔗 Link</button>
        </div>
      </div>
    </div>

    {/* Hero P&L Card */}
    <div className="card" style={{ padding: "24px 28px", marginBottom: 14, background: stats.totalR >= 0 ? "linear-gradient(135deg, rgba(0,214,143,.06) 0%, rgba(18,23,31,.8) 100%)" : "linear-gradient(135deg, rgba(255,71,87,.06) 0%, rgba(18,23,31,.8) 100%)", borderColor: stats.totalR >= 0 ? "rgba(0,214,143,.15)" : "rgba(255,71,87,.15)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text3)", letterSpacing: 1.5, marginBottom: 6 }}>PROFIT & LOSS</div>
          <div style={{ fontSize: 44, fontWeight: 700, fontFamily: "var(--mono)", color: stats.totalR >= 0 ? "var(--green)" : "var(--red)", letterSpacing: -2, lineHeight: 1 }}>{stats.totalR >= 0 ? "+" : ""}{stats.totalR}R</div>
          <div style={{ fontSize: 16, fontFamily: "var(--mono)", color: stats.totalR >= 0 ? "rgba(0,214,143,.6)" : "rgba(255,71,87,.6)", marginTop: 4 }}>{fmt$(stats.totalDollar)}</div>
        </div>
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          {/* Win Rate Donut */}
          <div style={{ textAlign: "center" }}>
            <svg viewBox="0 0 80 80" style={{ width: 76 }}>
              <circle cx={40} cy={40} r={32} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={6} />
              <circle cx={40} cy={40} r={32} fill="none" stroke={stats.winRate >= 50 ? "var(--green)" : "var(--red)"} strokeWidth={6}
                strokeDasharray={`${stats.winRate * 2.01} ${100 * 2.01}`} strokeLinecap="round" transform="rotate(-90 40 40)" />
              <text x={40} y={36} textAnchor="middle" fill="var(--text)" fontSize={15} fontWeight={700} fontFamily="var(--mono)">{stats.winRate.toFixed(1)}</text>
              <text x={40} y={50} textAnchor="middle" fill="var(--text3)" fontSize={8} fontFamily="var(--mono)">WIN%</text>
            </svg>
          </div>
          {/* Streak */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, fontWeight: 700, fontFamily: "var(--mono)", color: stats.curWinStreak > 0 ? "var(--green)" : stats.curLossStreak > 0 ? "var(--red)" : "var(--text3)" }}>
              {stats.curWinStreak > 0 ? stats.curWinStreak : stats.curLossStreak > 0 ? stats.curLossStreak : 0}
            </div>
            <div style={{ fontSize: 8, color: "var(--text3)", fontFamily: "var(--mono)", letterSpacing: 1 }}>
              {stats.curWinStreak > 0 ? "RACHA WIN" : stats.curLossStreak > 0 ? "RACHA LOSS" : "RACHA"}
            </div>
          </div>
          {/* 1R value */}
          <div style={{ textAlign: "center", padding: "6px 12px", background: "rgba(76,154,255,.08)", borderRadius: 8, border: "1px solid rgba(76,154,255,.15)" }}>
            <div style={{ fontSize: 8, color: "var(--text3)", fontFamily: "var(--mono)", letterSpacing: 1 }}>1R</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)", color: "var(--accent)" }}>{fmt$(userRV)}</div>
          </div>
        </div>
      </div>
      {/* Win/Loss/BE bar */}
      <div style={{ marginTop: 16, display: "flex", gap: 2, height: 8, borderRadius: 4, overflow: "hidden" }}>
        {stats.total > 0 && <>
          <div style={{ width: `${stats.wins / stats.total * 100}%`, background: "var(--green)", borderRadius: "4px 0 0 4px" }} />
          <div style={{ width: `${stats.losses / stats.total * 100}%`, background: "var(--red)" }} />
          <div style={{ width: `${stats.bes / stats.total * 100}%`, background: "var(--yellow)", borderRadius: "0 4px 4px 0" }} />
        </>}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, fontFamily: "var(--mono)", color: "var(--text3)" }}>
        <span><span style={{ color: "var(--green)" }}>{stats.wins}W</span> ({stats.total ? Math.round(stats.wins / stats.total * 100) : 0}%)</span>
        <span><span style={{ color: "var(--red)" }}>{stats.losses}L</span> ({stats.total ? Math.round(stats.losses / stats.total * 100) : 0}%)</span>
        <span><span style={{ color: "var(--yellow)" }}>{stats.bes}BE</span> ({stats.total ? Math.round(stats.bes / stats.total * 100) : 0}%)</span>
      </div>
    </div>

    {/* Metrics Grid */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
      {[
        { l: "PROFIT FACTOR", v: fmtPF(stats.profitFactor), c: stats.profitFactor >= 1.5 ? "var(--green)" : stats.profitFactor >= 1 ? "var(--yellow)" : "var(--red)" },
        { l: "EXPECTANCY", v: `${stats.expectancy}R`, s: fmt$(stats.expectDollar) + "/t", c: stats.expectancy > 0 ? "var(--green)" : "var(--red)" },
        { l: "SHARPE", v: stats.sharpeRatio.toFixed(2), c: stats.sharpeRatio >= 1 ? "var(--green)" : stats.sharpeRatio >= 0.5 ? "var(--yellow)" : "var(--red)" },
        { l: "RECOVERY", v: stats.recoveryFactor === Infinity ? "∞" : stats.recoveryFactor.toFixed(2), s: `DD: ${stats.maxEquityDD || 0}R`, c: stats.recoveryFactor >= 2 ? "var(--green)" : "var(--yellow)" }
      ].map((m, i) => (
        <div key={i} className="card" style={{ padding: "14px 16px", marginBottom: 0 }}>
          <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text3)", letterSpacing: 1.2, marginBottom: 6 }}>{m.l}</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--mono)", color: m.c, letterSpacing: -0.5 }}>{m.v}</div>
          {m.s && <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)", marginTop: 2 }}>{m.s}</div>}
        </div>
      ))}
    </div>

    {/* Equity + Radar */}
    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14, marginBottom: 14 }}>
      <div className="card" style={{ marginBottom: 0 }}>
        <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text3)", letterSpacing: 1.2, marginBottom: 10 }}>EQUITY CURVE</div>
        <EC trades={filtered} />
      </div>
      <div className="card" style={{ marginBottom: 0 }}>
        <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--text3)", letterSpacing: 1.2, marginBottom: 10 }}>PERFIL DE TRADING</div>
        {(() => {
          const radarM = [
            { label: "WR%", value: stats.winRate, max: 100 },
            { label: "PF", value: Math.min(stats.profitFactor === Infinity ? 4 : stats.profitFactor, 4), max: 4 },
            { label: "Sharpe", value: Math.min(Math.max(stats.sharpeRatio, 0), 3), max: 3 },
            { label: "Recov", value: Math.min(stats.recoveryFactor === Infinity ? 6 : stats.recoveryFactor, 6), max: 6 },
            { label: "Payoff", value: Math.min(stats.payoffRatio === Infinity ? 4 : stats.payoffRatio, 4), max: 4 },
          ]
          const cx2 = 100, cy2 = 100, rd = 65, n = radarM.length
          const angleStep = (Math.PI * 2) / n
          const gp = (i, val, max) => {
            const angle = angleStep * i - Math.PI / 2
            const ratio = Math.min(val / max, 1)
            return { x: cx2 + Math.cos(angle) * rd * ratio, y: cy2 + Math.sin(angle) * rd * ratio }
          }
          return (
            <svg viewBox="0 0 200 200" style={{ width: "100%", maxWidth: 320, display: "block", margin: "0 auto" }}>
              {[0.25, 0.5, 0.75, 1].map(level => (
                <polygon key={level} points={radarM.map((_, i) => { const p = gp(i, level * radarM[i].max, radarM[i].max); return `${p.x},${p.y}` }).join(" ")} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={0.5} />
              ))}
              {radarM.map((_, i) => { const p = gp(i, radarM[i].max, radarM[i].max); return <line key={i} x1={cx2} y1={cy2} x2={p.x} y2={p.y} stroke="rgba(255,255,255,.06)" strokeWidth={0.5} /> })}
              <polygon points={radarM.map((m, i) => { const p = gp(i, m.value, m.max); return `${p.x},${p.y}` }).join(" ")} fill="rgba(0,214,143,.12)" stroke="var(--green)" strokeWidth={1.5} />
              {radarM.map((m, i) => { const p = gp(i, m.value, m.max); return <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="var(--green)" /> })}
              {radarM.map((m, i) => { const p = gp(i, radarM[i].max * 1.25, radarM[i].max); return <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fill="var(--text3)" fontSize={7} fontFamily="var(--mono)">{m.label}</text> })}
            </svg>
          )
        })()}
      </div>
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
        <div className="info-item"><div className="ml">Racha WIN max</div><div className="val" style={{ color: "var(--green)" }}>{stats.maxWinStreak}</div></div>
        <div className="info-item"><div className="ml">Racha LOSS max</div><div className="val" style={{ color: "var(--red)" }}>{stats.maxLossStreak}</div></div>
        <div className="info-item"><div className="ml">Dur WIN/SL/BE</div><div className="val">{stats.avgDurWin}/{stats.avgDurSL}/{stats.avgDurBE}min</div></div>
        <div className="info-item"><div className="ml">Payoff Ratio</div><div className="val" style={{ color: stats.payoffRatio >= 2 ? "var(--green)" : "var(--yellow)" }}>{stats.payoffRatio === Infinity ? "∞" : stats.payoffRatio.toFixed(2)}</div></div>
      </div>
    </div>

    {/* P&L diario */}
    <div className="card">
      <div className="st">P&L diario</div>
      <BC data={daily.slice(0, 20).reverse().map(d => d.totalR)} labels={daily.slice(0, 20).reverse().map(d => fmtD(d.key))} unit="R" />
    </div>

    {/* ── CALENDAR ── */}
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15, textTransform: "capitalize" }}>{monthName}</span>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, fontFamily: "var(--mono)", color: monthR >= 0 ? "var(--green)" : "var(--red)", fontWeight: 700 }}>{monthR >= 0 ? "+" : ""}{fmt$(Math.round(monthR * RV))}</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="btn bo bx" onClick={() => { if (calMonth === 0) { setCM(11); setCY(calYear - 1) } else setCM(calMonth - 1) }}>&lt;</button>
            <button className="btn bo bx" onClick={() => { if (calMonth === 11) { setCM(0); setCY(calYear + 1) } else setCM(calMonth + 1) }}>&gt;</button>
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", fontSize: 10, fontFamily: "var(--mono)" }}>
        {["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Sem"].map(d => (
          <div key={d} style={{ padding: "8px 3px", textAlign: "center", color: "var(--text3)", borderBottom: "1px solid rgba(255,255,255,.04)", fontWeight: 600 }}>{d}</div>
        ))}
        {calWeeks.map((wk, wi) => (
          <React.Fragment key={wi}>
            {wk.map((d, di) => {
              if (!d) return <div key={di} style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,.03)", background: "var(--bg)" }} />
              const dayTrades = calByDay[d] || []
              const realTrades = rT(dayTrades)
              const hasSinOp = dayTrades.some(isSO)
              const dayR = Math.round(realTrades.reduce((a, t) => a + gR(t), 0) * 100) / 100
              const bg = hasSinOp && !realTrades.length ? "rgba(90,100,120,.05)"
                : realTrades.length ? (dayR > 0 ? "rgba(0,214,143,.05)" : dayR < 0 ? "rgba(255,71,87,.05)" : "var(--surface)")
                : "var(--surface)"
              return (
                <div key={di} style={{ padding: "6px 4px", borderBottom: "1px solid rgba(255,255,255,.03)", borderRight: "1px solid rgba(255,255,255,.03)", background: bg, minHeight: 58, cursor: dayTrades.length ? "pointer" : "default" }}
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
            {Array(7 - wk.length).fill(null).map((_, i) => (
              <div key={`p${i}`} style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,.03)", background: "var(--bg)" }} />
            ))}
            <div style={{ padding: "6px 4px", borderBottom: "1px solid rgba(255,255,255,.03)", background: "var(--surface2)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
              <div style={{ fontSize: 8, color: "var(--text3)" }}>S{wi + 1}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: weekSums[wi].r > 0 ? "var(--green)" : weekSums[wi].r < 0 ? "var(--red)" : "var(--text3)", fontFamily: "var(--mono)" }}>
                {weekSums[wi].c ? fmt$(Math.round(weekSums[wi].r * RV)) : "-"}
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, padding: "10px 18px", borderTop: "1px solid rgba(255,255,255,.04)", background: "var(--surface2)" }}>
        <span style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>TRADES: <b style={{ color: "var(--text)" }}>{rT(monthTrades).length}</b></span>
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
        <button className="btn bs" style={{ background: selectMode ? "var(--rd)" : "var(--surface2)", color: selectMode ? "var(--red)" : "var(--text3)" }}
          onClick={() => { setSelectMode(!selectMode); setSelectedTradeIds(new Set()) }}>
          {selectMode ? "Cancelar" : "Seleccionar"}
        </button>
      </div>
    </div>

    {/* Selection bar */}
    {selectMode && (
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 14px", background: "var(--rd)", borderRadius: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--red)", fontWeight: 700 }}>{selectedTradeIds.size} seleccionados</span>
        <button className="btn bx" style={{ background: "rgba(255,71,87,.2)", color: "var(--red)", fontSize: 10 }} onClick={selectAllFiltered}>Seleccionar todos ({filtered.length})</button>
        <button className="btn bx" style={{ background: "rgba(255,71,87,.2)", color: "var(--red)", fontSize: 10 }} onClick={() => setSelectedTradeIds(new Set())}>Deseleccionar</button>
        {selectedTradeIds.size > 0 && (
          <button className="btn bs" style={{ background: "var(--red)", color: "#fff", marginLeft: "auto" }} onClick={deleteSelected} disabled={saving}>
            {saving ? "..." : `Borrar ${selectedTradeIds.size} trades`}
          </button>
        )}
      </div>
    )}

    <div className="card" style={{ overflowX: "auto" }}>
      <table className="tbl" style={{ minWidth: 900 }}>
        <thead><tr>
          {selectMode && <th style={{ width: 30 }}></th>}
          {["Fecha", "Hora", "Setup", "B/S", "R", "P&L", "Res", "Dir", "", ""].map(h => <th key={h}>{h}</th>)}
        </tr></thead>
        <tbody>
          {filtered.map(t => {
            const isChecked = selectedTradeIds.has(t.id)
            if (isSO(t)) return (
              <tr key={t.id} style={{ opacity: 0.5, background: isChecked ? "rgba(255,71,87,.08)" : "transparent", cursor: selectMode ? "pointer" : "default" }}
                onClick={() => selectMode && toggleSelectTrade(t.id)}>
                {selectMode && <td style={{ textAlign: "center" }}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, border: isChecked ? "2px solid var(--red)" : "2px solid var(--border2)", background: isChecked ? "var(--red)" : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    {isChecked && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>}
                  </div>
                </td>}
                <td className="mono">{fmtD(t.fecha)}</td>
                <td colSpan={7} style={{ color: "var(--text3)", fontSize: 11 }}>SIN OP{t.notas ? " — " + t.notas : ""}</td>
                {!selectMode && <td><div style={{ display: "flex", gap: 3 }}><button className="btn bo bx" onClick={() => edit(t)}>E</button><button className="btn bd bx" onClick={() => del(t.id)}>X</button></div></td>}
              </tr>
            )
            const r = gR(t)
            return (
              <tr key={t.id} style={{ background: isChecked ? "rgba(255,71,87,.08)" : "transparent", cursor: selectMode ? "pointer" : "default" }}
                onClick={() => selectMode && toggleSelectTrade(t.id)}>
                {selectMode && <td style={{ textAlign: "center" }}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, border: isChecked ? "2px solid var(--red)" : "2px solid var(--border2)", background: isChecked ? "var(--red)" : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    {isChecked && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>}
                  </div>
                </td>}
                <td className="mono">{fmtD(t.fecha)}</td>
                <td className="mono" style={{ fontSize: 10 }}>{t.horaInicio}→{t.horaFinal}</td>
                <td><STag s={t.setup} /></td>
                <td><BTag b={t.buySell} /></td>
                <td className="mono bold" style={{ color: r > 0 ? "var(--green)" : r < 0 ? "var(--red)" : "var(--yellow)" }}>{fmtR(r)}</td>
                <td className="mono bold" style={{ color: r >= 0 ? "var(--green)" : "var(--red)" }}>{fmt$(Math.round(r * RV))}</td>
                <td><RTag r={t.resultado} /></td>
                <td><DTag d={t.direccionDia} /></td>
                <td>{t.screenshot && <span style={{ cursor: "pointer", color: accentColor }} onClick={e => { e.stopPropagation(); setViewSS(t.screenshot) }}>Img</span>}</td>
                {!selectMode && <td><div style={{ display: "flex", gap: 3 }}><button className="btn bo bx" onClick={() => edit(t)}>E</button><button className="btn bd bx" onClick={() => del(t.id)}>X</button></div></td>}
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
          <DatePick value={form.fecha} onChange={v => setForm(f => ({ ...f, fecha: v }))} label="Fecha" />
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
        <DatePick value={form.fecha} onChange={v => setForm(f => ({ ...f, fecha: v }))} label="Fecha" />
        <TP label="Hora inicio" value={form.horaInicio} onChange={setHI} />
        <TP label="Hora final" value={form.horaFinal} onChange={setHF} />
        <div className="field"><label>Dur</label><div className="af">{autoDur ? autoDur + "m" : "-"}</div></div>
        {userConfig.show_atr && F("ATR", "atr", "number")}
        {appMode === "journal" && userBlocks.length > 0 && (
          <div className="field">
            <label>Bloque</label>
            <select className="inp" value={form.blockName || ""} onChange={e => setForm(f => ({ ...f, blockName: e.target.value }))}
              style={{ borderColor: form.blockName ? (userBlocks.find(b => b.name === form.blockName) || {}).color || "var(--border2)" : "var(--border2)", color: form.blockName ? (userBlocks.find(b => b.name === form.blockName) || {}).color || "var(--text)" : "var(--text)" }}>
              <option value="">Sin bloque</option>
              {userBlocks.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
          </div>
        )}
      </div>
    </div>

    {/* Trade */}
    <div className="card">
      <div className="st">Trade</div>
      <div className="form-grid">
        <div className="field">
          <label>Setup</label>
          <select className="inp" value={form.setup || ""} onChange={e => {
            const su = e.target.value
            const ctxMap = { M1: "APERTURA", M2: "ROMPIMIENTO", M3: "GIRO", J1: "PULLBACK", J2: "PULLBACK" }
            setForm(f => ({ ...f, setup: su, contexto: ctxMap[su] || f.contexto }))
          }}>
            {userSetups.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        {F("Contexto", "contexto", null, userContexts)}
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
        {(isWin || form.resultado === "BE") && F("Rmax", "rMaximo", "number")}
        {userConfig.show_direction && F("Break M30", "breakRangoM30", null, ["NO", "SI"])}
        {userConfig.show_direction && F("Dir", "direccionDia", null, DIRS)}
      </div>
      {form.resultado === "SL" && <p style={{ marginTop: 8, fontSize: 12, color: "var(--red)", fontFamily: "var(--mono)" }}>{appMode === "bt" ? "SL=-1R" : `SL=${pn(form.rResultado) ? form.rResultado + "R" : "-1R"}`}</p>}
      {form.resultado === "BE" && <p style={{ marginTop: 8, fontSize: 12, color: "var(--yellow)", fontFamily: "var(--mono)" }}>BE=0R</p>}
      {form.resultado === "SIN OP" && <p style={{ marginTop: 8, fontSize: 12, color: "var(--text3)", fontFamily: "var(--mono)" }}>Sin operacion — no afecta stats</p>}
      {isWin && pn(form.rResultado) > 0 && <p style={{ marginTop: 8, fontSize: 12, color: "var(--green)", fontFamily: "var(--mono)" }}>+{form.rResultado}R = +{fmt$(Math.round(pn(form.rResultado) * RV))}</p>}
    </div>

    {/* Noticias */}
    {userConfig.show_news && (
    <div className="card">
      <div className="st">Noticias</div>
      <div className="form-grid">
        {F("Noticia?", "hayNoticia", null, ["NO", "SI"])}
        {form.hayNoticia === "SI" && F("Hora", "noticiaHora", null, NHS)}
        {form.hayNoticia === "SI" && F("Impacto", "noticiaImpacto", null, NIS)}
        {form.hayNoticia === "SI" && F("Tipo", "noticiaTipo", null, NTS)}
      </div>
    </div>
    )}

    {/* ORB */}
    {userConfig.show_orb && (
    <div className="card">
      <div className="st">ORB</div>
      <div className="form-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        {F("M5", "m5", "number")}
        {F("M15", "m15", "number")}
        {F("M30", "m30", "number")}
      </div>
    </div>
    )}

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
      {userSR.map(su => {
        const s2 = setupStats[su] || { total: 0, wins: 0, losses: 0, bes: 0, winRate: 0, totalR: 0, profitFactor: 0 }
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
    <div className="card"><div className="st">Win% por setup</div><BC data={userSR.map(s => (setupStats[s] || {}).winRate || 0)} labels={userSR} height={120} unit="%" /></div>
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

    {/* ── BE ANALYSIS: Dinero sobre la mesa ── */}
    {beStats && beStats.withData > 0 && (
      <div className="card" style={{ marginTop: 14, borderLeft: "3px solid var(--yellow)" }}>
        <div className="st" style={{ color: "var(--yellow)" }}>💰 Análisis BE — Dinero sobre la mesa</div>

        {/* Summary metrics */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ background: "var(--bg)", borderRadius: 8, padding: "10px 16px", textAlign: "center" }}>
            <div className="ml">Total BE</div>
            <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 22, color: "var(--yellow)" }}>{beStats.total}</div>
          </div>
          <div style={{ background: "var(--bg)", borderRadius: 8, padding: "10px 16px", textAlign: "center" }}>
            <div className="ml">R dejados</div>
            <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 22, color: "var(--yellow)" }}>+{beStats.totalMissed}R</div>
            <div className="ms">{fmt$(beStats.totalMissedDollar)}</div>
          </div>
          <div style={{ background: "var(--bg)", borderRadius: 8, padding: "10px 16px", textAlign: "center" }}>
            <div className="ml">Promedio por BE</div>
            <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 22, color: "var(--yellow)" }}>+{beStats.avgMissed}R</div>
            <div className="ms">{fmt$(Math.round(beStats.avgMissed * RV))}/trade</div>
          </div>
          {beStats.worstMissed && (
            <div style={{ background: "var(--bg)", borderRadius: 8, padding: "10px 16px", textAlign: "center" }}>
              <div className="ml">Peor BE</div>
              <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 22, color: "var(--red)" }}>+{beStats.worstMissed.rmax}R</div>
              <div className="ms">{fmtD(beStats.worstMissed.fecha)} ({beStats.worstMissed.setup})</div>
            </div>
          )}
        </div>

        {/* Distribution chart */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 8, fontFamily: "var(--mono)" }}>¿Cuánto recorrieron los BE antes de volver?</div>
          <BC data={beStats.buckets.map(b => b.count)} labels={beStats.buckets.map(b => b.label)} height={100} unit="" colors={beStats.buckets.map(b => b.max <= 1 ? "var(--text3)" : b.max <= 2 ? "var(--yellow)" : "var(--red)")} />
        </div>

        <div className="g2">
          {/* By setup */}
          {beStats.bySetup.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 6, fontFamily: "var(--mono)" }}>BE por Setup (R dejados)</div>
              <table className="tbl">
                <thead><tr><th>Setup</th><th>BEs</th><th>R dejados</th><th>Prom</th></tr></thead>
                <tbody>{beStats.bySetup.map(s2 => (
                  <tr key={s2.setup}>
                    <td><STag s={s2.setup} /></td>
                    <td className="mono">{s2.count}</td>
                    <td className="mono bold" style={{ color: "var(--yellow)" }}>+{s2.totalR}R</td>
                    <td className="mono" style={{ color: "var(--text2)" }}>{s2.avgR}R</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {/* By hour */}
          {beStats.byHour.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 6, fontFamily: "var(--mono)" }}>BE por Hora (R dejados)</div>
              <table className="tbl">
                <thead><tr><th>Hora</th><th>BEs</th><th>R dejados</th><th>Prom</th></tr></thead>
                <tbody>{beStats.byHour.map(h => (
                  <tr key={h.hour}>
                    <td className="mono bold">{h.hour}</td>
                    <td className="mono">{h.count}</td>
                    <td className="mono bold" style={{ color: "var(--yellow)" }}>+{h.totalR}R</td>
                    <td className="mono" style={{ color: "var(--text2)" }}>{h.avgR}R</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>

        {/* Insight */}
        <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(255,192,72,.06)", borderRadius: 8, fontSize: 12, color: "var(--text2)" }}>
          💡 {beStats.totalMissed > beStats.total ? (
            <span>Si hubieras capturado solo <b style={{ color: "var(--yellow)" }}>1R</b> en cada BE, habrías ganado <b style={{ color: "var(--green)" }}>+{beStats.withData}R ({fmt$(beStats.withData * RV)})</b> extra.</span>
          ) : (
            <span>La mayoría de tus BE no llegaron lejos. Tu gestión de trailing está funcionando razonablemente.</span>
          )}
          {beStats.bySetup.length > 1 && beStats.bySetup[0].totalR > beStats.bySetup[1].totalR * 2 && (
            <span> El setup <b style={{ color: "var(--yellow)" }}>{beStats.bySetup[0].setup}</b> es donde más R dejas sobre la mesa.</span>
          )}
        </div>
      </div>
    )}
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

{/* ═══ TAB: ACCOUNT MANAGER (solo journal) ═══ */}
{tab === "acctmgr" && appMode === "journal" && (
  <>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
      <div>
        <h1 className="pt">Account Manager</h1>
        <p className="ps">Gestión de bloques, cuentas y rotación semanal</p>
      </div>
    </div>
    <AccountManager userId={user.id} inline />
  </>
)}

{/* ═══ TAB: CONFIG ═══ */}
{tab === "config" && (
  <>
    <h1 className="pt" style={{ marginBottom: 16 }}>Configuración</h1>

    {/* Valor de R */}
    <div className="card">
      <div className="st">Valor de 1R (dólares)</div>
      <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 10 }}>Este valor se usa para calcular P&L en dólares en todo el dashboard.</p>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 14, color: "var(--text3)" }}>$</span>
        <input className="inp" type="number" value={userConfig.r_value || ""} onChange={e => setUserConfig(c => ({ ...c, r_value: parseFloat(e.target.value) || 0 }))}
          style={{ width: 120, fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)" }} />
        <button className="btn bp bs" onClick={() => saveUserConfig({ r_value: userConfig.r_value })} disabled={saving}>Guardar</button>
        <span style={{ fontSize: 11, color: "var(--text3)" }}>Actual: {fmt$(userRV)}</span>
      </div>
    </div>

    {/* Setups personalizados */}
    <div className="card">
      <div className="st">Setups</div>
      <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 10 }}>Define los nombres de tus setups. Separa con comas. Agrega "NO" al final para la opción SIN OP.</p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input className="inp" value={userConfig.setups || ""} onChange={e => setUserConfig(c => ({ ...c, setups: e.target.value }))}
          style={{ flex: 1, minWidth: 200, fontSize: 13, fontFamily: "var(--mono)" }} placeholder="M1,M2,M3,J1,J2,NO" />
        <button className="btn bp bs" onClick={() => saveUserConfig({ setups: userConfig.setups })} disabled={saving}>Guardar</button>
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 10 }}>
        {userSetups.map(s => (
          <span key={s} className={`tag ${s === "NO" ? "tgr" : "ta"}`}>{s}</span>
        ))}
      </div>
    </div>

    {/* Contextos personalizados */}
    <div className="card">
      <div className="st">Contextos</div>
      <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 10 }}>Define los contextos de operación. Separa con comas.</p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input className="inp" value={userConfig.contexts || ""} onChange={e => setUserConfig(c => ({ ...c, contexts: e.target.value }))}
          style={{ flex: 1, minWidth: 200, fontSize: 13, fontFamily: "var(--mono)" }} placeholder="APERTURA,ROMPIMIENTO,GIRO,PULLBACK" />
        <button className="btn bp bs" onClick={() => saveUserConfig({ contexts: userConfig.contexts })} disabled={saving}>Guardar</button>
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 10 }}>
        {userContexts.map(c => (
          <span key={c} className="tag tp">{c}</span>
        ))}
      </div>
    </div>

    {/* Mapeo Setup → Contexto automático */}
    <div className="card">
      <div className="st">Auto-fill Setup → Contexto</div>
      <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 10 }}>Cuando seleccionas un setup, el contexto se llena automáticamente. Personaliza el mapeo aquí:</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
        {userSR.map(su => (
          <div key={su} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg)", padding: "6px 10px", borderRadius: 8 }}>
            <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 12, color: "var(--accent)", minWidth: 30 }}>{su}</span>
            <span style={{ color: "var(--text3)", fontSize: 11 }}>→</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--purple)" }}>
              {{ M1: "APERTURA", M2: "ROMPIMIENTO", M3: "GIRO", J1: "PULLBACK", J2: "PULLBACK" }[su] || "—"}
            </span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 10, color: "var(--text3)", marginTop: 8 }}>El mapeo se puede cambiar en el código. El contexto siempre es editable manualmente al registrar un trade.</p>
    </div>

    {/* Campos opcionales */}
    <div className="card">
      <div className="st">Campos opcionales del formulario</div>
      <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 14 }}>Activa o desactiva secciones del formulario de nuevo trade.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          { key: "show_orb", label: "ORB (M5, M15, M30)", desc: "Opening Range Breakout" },
          { key: "show_news", label: "Noticias", desc: "Hora, impacto y tipo de noticia" },
          { key: "show_direction", label: "Dirección del día", desc: "Alcista / Bajista / Rango" },
          { key: "show_atr", label: "ATR", desc: "Average True Range" }
        ].map(opt => (
          <div key={opt.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--bg)", borderRadius: 8 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: "var(--text3)" }}>{opt.desc}</div>
            </div>
            <div onClick={() => saveUserConfig({ [opt.key]: !userConfig[opt.key] })}
              style={{ width: 44, height: 24, borderRadius: 12, background: userConfig[opt.key] ? "var(--green)" : "var(--border2)", cursor: "pointer", position: "relative", transition: "background .2s" }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: userConfig[opt.key] ? 23 : 3, transition: "left .2s" }} />
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Reset */}
    <div className="card" style={{ borderColor: "var(--rd)" }}>
      <div className="st" style={{ color: "var(--red)" }}>Restaurar valores por defecto</div>
      <button className="btn bd bs" onClick={async () => {
        if (!confirm("¿Restaurar toda la configuración a los valores por defecto?")) return
        await saveUserConfig({ r_value: 300, setups: "M1,M2,M3,J1,J2,NO", contexts: "APERTURA,ROMPIMIENTO,GIRO,PULLBACK", show_orb: true, show_news: true, show_direction: true, show_atr: true })
      }}>Restaurar defaults</button>
    </div>
  </>
)}

{/* ═══ TAB: TEAM ═══ */}
{tab === "team" && (
  <>
    <h1 className="pt" style={{ marginBottom: 16 }}>Team</h1>

    {/* Section 1: Compartir */}
    <div className="card">
      <div className="st">Compartir mis stats</div>
      <p style={{ fontSize: 12, color: "var(--text2)", marginBottom: 14 }}>Comparte tu modo {modeLabel} con un compañero.</p>
      <div className="form-grid">
        <div className="field"><label>Usuario</label>
          <select className="inp" id="share-target" defaultValue="">
            <option value="">— Seleccionar —</option>
            {allUsers.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
          </select>
        </div>
        <div className="field"><label>Que compartir</label>
          <select className="inp" id="share-type" defaultValue="all">
            <option value="all">Todo</option>
            <option value="month">Mes</option>
            <option value="daterange">Rango fechas</option>
            <option value="setup">Setup</option>
          </select>
        </div>
        <div className="field"><label>Filtro</label>
          <input className="inp" id="share-filter" placeholder="ej: 2025-10 o M1" />
        </div>
      </div>
      <p style={{ fontSize: 10, color: "var(--text3)", marginTop: 8 }}>Mes: YYYY-MM | Rango: fecha1|fecha2 | Setup: nombre</p>
      <button className="btn bp" style={{ marginTop: 12 }} onClick={() => {
        const target = document.getElementById("share-target").value
        const type = document.getElementById("share-type").value
        const filter = document.getElementById("share-filter").value
        if (!target) return alert("Selecciona un usuario")
        shareWith(target, type, filter, appMode)
      }} disabled={saving}>{saving ? "..." : "Compartir"}</button>
    </div>

    {/* Section 2: Mis shares activos */}
    {myShares.length > 0 && (
      <div className="card">
        <div className="st">Mis shares activos</div>
        <table className="tbl">
          <thead><tr><th>Usuario</th><th>Modo</th><th>Tipo</th><th>Filtro</th><th></th></tr></thead>
          <tbody>{myShares.map(s => {
            const u = allUsers.find(u2 => u2.id === s.shared_with)
            return (<tr key={s.id}>
              <td className="mono" style={{ color: "var(--accent)" }}>{u ? u.username : "?"}</td>
              <td><span className={`tag ${s.mode === "journal" ? "tp" : "ta"}`}>{s.mode === "journal" ? "JOURNAL" : "BT"}</span></td>
              <td className="mono">{s.share_type}</td>
              <td className="mono" style={{ color: "var(--text3)" }}>{s.share_filter || "todo"}</td>
              <td><button className="btn bd bx" onClick={() => unshare(s.id)}>✕</button></td>
            </tr>)
          })}</tbody>
        </table>
      </div>
    )}

    {/* Section 3: Compartidos conmigo */}
    <div className="card">
      <div className="st">Compartidos conmigo</div>
      {teamShares.length === 0 && <div className="em">Nadie ha compartido contigo aun</div>}
      {teamShares.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {teamShares.map(s => {
            const owner = allUsers.find(u => u.id === s.owner_id) || { username: "?" }
            const isActive = teamUser === s.owner_id && teamMode === s.mode
            return (
              <button key={s.id} className={`btn ${isActive ? "bp" : "bo"}`} style={{ fontSize: 12 }}
                onClick={() => loadTeamTrades(s.owner_id, s)}>
                {owner.username} <span style={{ fontSize: 10, opacity: 0.7 }}>{s.mode === "journal" ? "J" : "BT"}</span>
              </button>
            )
          })}
        </div>
      )}

      {teamLoading && <div className="em">Cargando...</div>}

      {/* ── Full teammate view ── */}
      {teamUser && !teamLoading && teamTrades.length > 0 && (() => {
        const ts = rT(teamTrades)
        const s = cS(ts)
        const ex = extraS(ts)
        const tName = (allUsers.find(u => u.id === teamUser) || { username: "?" }).username
        const tDaily = grpBy(ts, t => t.fecha)
        const tSetupStats = {}; userSR.forEach(su => tSetupStats[su] = cS(ts.filter(t => t.setup === su)))
        const tHour = hourAnalysis(ts)

        return (
          <>
            <div style={{ marginBottom: 14, padding: "10px 16px", background: "var(--surface2)", borderRadius: 8, borderLeft: "3px solid var(--accent)" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: "var(--accent)" }}>{tName}</span>
              <span style={{ fontSize: 12, color: "var(--text3)", marginLeft: 8 }}>{ts.length} trades | {teamMode === "journal" ? "JOURNAL" : "BT"}</span>
            </div>

            {/* Metrics */}
            <div className="metrics">
              <MC label="P&L" value={`${s.totalR >= 0 ? "+" : ""}${s.totalR}R`} sub={fmt$(s.totalDollar)} color={s.totalR >= 0 ? "var(--green)" : "var(--red)"} big />
              <MC label="Win%" value={`${s.winRate.toFixed(2)}%`} color={s.winRate >= 50 ? "var(--green)" : "var(--red)"} sub={`${s.wins}W|${s.losses}L|${s.bes}BE`} />
              <MC label="PF" value={fmtPF(s.profitFactor)} color={s.profitFactor >= 1.5 ? "var(--green)" : s.profitFactor >= 1 ? "var(--yellow)" : "var(--red)"} />
              <MC label="Exp" value={`${s.expectancy}R`} color={s.expectancy > 0 ? "var(--green)" : "var(--red)"} sub={fmt$(s.expectDollar) + "/t"} />
              <MC label="Sharpe" value={s.sharpeRatio.toFixed(2)} color={s.sharpeRatio >= 1 ? "var(--green)" : s.sharpeRatio >= 0.5 ? "var(--yellow)" : "var(--red)"} />
              <MC label="Payoff" value={s.payoffRatio === Infinity ? "∞" : s.payoffRatio.toFixed(2)} color={s.payoffRatio >= 2 ? "var(--green)" : "var(--yellow)"} />
            </div>

            {/* Resumen */}
            <div className="card" style={{ background: "var(--bg)" }}>
              <div className="st">Resumen</div>
              <div className="info-grid">
                <div className="info-item"><div className="ml">Dia + ganador</div><div className="val" style={{ color: "var(--green)" }}>{ex.bestDay}</div></div>
                <div className="info-item"><div className="ml">Dia + perdedor</div><div className="val" style={{ color: "var(--red)" }}>{ex.worstDay}</div></div>
                <div className="info-item"><div className="ml">Ops/dia</div><div className="val">{ex.avgOps}</div></div>
                <div className="info-item"><div className="ml">Racha WIN</div><div className="val" style={{ color: "var(--green)" }}>{s.maxWinStreak}</div></div>
                <div className="info-item"><div className="ml">Racha LOSS</div><div className="val" style={{ color: "var(--red)" }}>{s.maxLossStreak}</div></div>
                <div className="info-item"><div className="ml">Dur W/S/B</div><div className="val">{s.avgDurWin}/{s.avgDurSL}/{s.avgDurBE}min</div></div>
              </div>
            </div>

            {/* Equity */}
            <div className="card" style={{ background: "var(--bg)" }}>
              <div className="st">Equity</div>
              <EC trades={ts} />
            </div>

            {/* Calendar */}
            {tCalM !== null && tCalY !== null && (() => {
              const tCalBd = {}
              teamTrades.forEach(t => { if (!t.fecha) return; const d = safeDate(t.fecha); if (!d) return; if (d.getMonth() === tCalM && d.getFullYear() === tCalY) { const day = d.getDate(); if (!tCalBd[day]) tCalBd[day] = []; tCalBd[day].push(t) } })
              const tDim = new Date(tCalY, tCalM + 1, 0).getDate()
              const tFd = new Date(tCalY, tCalM, 1).getDay()
              const tMn = new Date(tCalY, tCalM).toLocaleString("es", { month: "long", year: "numeric" })
              const tCells = []; for (let i = 0; i < tFd; i++) tCells.push(null); for (let d = 1; d <= tDim; d++) tCells.push(d)
              const tWeeks = []; for (let i = 0; i < tCells.length; i += 7) tWeeks.push(tCells.slice(i, i + 7))
              const tMakeDate = d => `${tCalY}-${String(tCalM + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
              return (
                <div className="card" style={{ background: "var(--bg)", padding: 0, overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 14, textTransform: "capitalize" }}>{tMn}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn bo bx" onClick={() => { if (tCalM === 0) { setTCalM(11); setTCalY(tCalY - 1) } else setTCalM(tCalM - 1) }}>&lt;</button>
                      <button className="btn bo bx" onClick={() => { if (tCalM === 11) { setTCalM(0); setTCalY(tCalY + 1) } else setTCalM(tCalM + 1) }}>&gt;</button>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", fontSize: 10, fontFamily: "var(--mono)" }}>
                    {["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Sem"].map(d => (
                      <div key={d} style={{ padding: "6px 3px", textAlign: "center", color: "var(--text3)", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{d}</div>
                    ))}
                    {tWeeks.map((wk, wi) => {
                      let wkR = 0, wkC = 0
                      wk.forEach(d => { if (d && tCalBd[d]) rT(tCalBd[d]).forEach(t => { wkR += gR(t); wkC++ }) })
                      wkR = Math.round(wkR * 100) / 100
                      return (
                      <React.Fragment key={wi}>
                        {wk.map((d, di) => {
                          if (!d) return <div key={di} style={{ padding: 8, borderBottom: "1px solid var(--border)", background: "var(--surface)" }} />
                          const dt = tCalBd[d] || []
                          const rl = rT(dt)
                          const hasSO = dt.some(isSO)
                          const dr = Math.round(rl.reduce((a, t) => a + gR(t), 0) * 100) / 100
                          const hasScreenshot = dt.some(t => t.screenshot)
                          const bg = hasSO && !rl.length ? "rgba(90,100,120,.08)" : rl.length ? (dr > 0 ? "rgba(0,214,143,.08)" : dr < 0 ? "rgba(255,71,87,.08)" : "var(--surface)") : "var(--surface)"
                          return (
                            <div key={di} style={{ padding: "5px 3px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", background: bg, minHeight: 48, cursor: dt.length ? "pointer" : "default" }}
                              onClick={() => dt.length && setTDayModal(tMakeDate(d))}>
                              <div style={{ fontSize: 8, color: "var(--text3)", marginBottom: 2 }}>{d}</div>
                              {hasSO && !rl.length ? <div style={{ fontSize: 9, color: "var(--text3)" }}>SIN OP</div>
                                : rl.length ? <>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: dr > 0 ? "var(--green)" : dr < 0 ? "var(--red)" : "var(--yellow)", fontFamily: "var(--mono)" }}>{fmt$(Math.round(dr * RV))}</div>
                                    <div style={{ fontSize: 8, color: "var(--text3)" }}>{rl.length}t{hasScreenshot ? " 📷" : ""}</div>
                                  </>
                                : <div style={{ fontSize: 8, color: "var(--text3)" }}>-</div>}
                            </div>
                          )
                        })}
                        {Array(7 - wk.length).fill(null).map((_, i) => <div key={`p${i}`} style={{ padding: 8, borderBottom: "1px solid var(--border)", background: "var(--surface)" }} />)}
                        <div style={{ padding: "6px 4px", borderBottom: "1px solid var(--border)", background: "var(--surface2)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                          <div style={{ fontSize: 8, color: "var(--text3)" }}>S{wi + 1}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: wkR > 0 ? "var(--green)" : wkR < 0 ? "var(--red)" : "var(--text3)", fontFamily: "var(--mono)" }}>
                            {wkC ? fmt$(Math.round(wkR * RV)) : "-"}
                          </div>
                        </div>
                      </React.Fragment>
                    )})}
                  </div>
                </div>
              )
            })()}

            {/* Setups */}
            <div className="card" style={{ background: "var(--bg)" }}>
              <div className="st">Setups</div>
              <div className="g2">
                {userSR.map(su => {
                  const ss = tSetupStats[su] || { total: 0 }
                  if (!ss.total) return null
                  return (
                    <div key={su} style={{ background: "var(--surface)", borderRadius: 8, padding: 12, borderLeft: `3px solid ${ss.totalR > 0 ? "var(--green)" : "var(--red)"}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--accent)" }}>{su}</span>
                        <span className="tag ta">{ss.total}</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                        {[["Win%", `${ss.winRate.toFixed(1)}%`, ss.winRate >= 50 ? "var(--green)" : "var(--red)"],
                          ["P&L", `${ss.totalR > 0 ? "+" : ""}${ss.totalR}R`, ss.totalR >= 0 ? "var(--green)" : "var(--red)"],
                          ["PF", fmtPF(ss.profitFactor)]
                        ].map(([l, v, c]) => (
                          <div key={l}><div className="ml">{l}</div><div style={{ fontFamily: "var(--mono)", fontWeight: 600, fontSize: 13, color: c }}>{v}</div></div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Por hora */}
            {tHour.length > 0 && (
              <div className="card" style={{ background: "var(--bg)" }}>
                <div className="st">Por hora</div>
                <div style={{ overflowX: "auto" }}>
                  <table className="tbl">
                    <thead><tr><th>Hora</th><th>N</th><th>Win%</th><th>R</th><th>PF</th></tr></thead>
                    <tbody>{tHour.map(h => (
                      <tr key={h.hour}>
                        <td className="mono bold">{h.hour}</td><td className="mono">{h.total}</td>
                        <td className={`mono ${h.winRate >= 50 ? "g" : "r"}`}>{h.winRate.toFixed(2)}%</td>
                        <td className={`mono bold ${h.totalR >= 0 ? "g" : "r"}`}>{h.totalR > 0 ? "+" : ""}{h.totalR}R</td>
                        <td className="mono">{fmtPF(h.profitFactor)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Trades recientes */}
            <div className="card" style={{ background: "var(--bg)", overflowX: "auto" }}>
              <div className="st">Trades recientes</div>
              <table className="tbl">
                <thead><tr><th>Fecha</th><th>Setup</th><th>B/S</th><th>R</th><th>P&L</th><th>Res</th></tr></thead>
                <tbody>{ts.slice(0, 30).map((t, i) => {
                  const r = gR(t)
                  return (<tr key={i}>
                    <td className="mono">{fmtD(t.fecha)}</td><td><STag s={t.setup} /></td><td><BTag b={t.buySell} /></td>
                    <td className="mono bold" style={{ color: r > 0 ? "var(--green)" : r < 0 ? "var(--red)" : "var(--yellow)" }}>{fmtR(r)}</td>
                    <td className="mono bold" style={{ color: r >= 0 ? "var(--green)" : "var(--red)" }}>{fmt$(Math.round(r * RV))}</td>
                    <td><RTag r={t.resultado} /></td>
                  </tr>)
                })}</tbody>
              </table>
              {ts.length > 30 && <div style={{ fontSize: 11, color: "var(--text3)", textAlign: "center", padding: 8 }}>+ {ts.length - 30} mas</div>}
            </div>
          </>
        )
      })()}
      {teamUser && !teamLoading && teamTrades.length === 0 && <div className="em">Sin trades en este filtro</div>}
    </div>
  </>
)}

{/* ═══ TAB: ADMIN (solo admin) ═══ */}
{tab === "admin" && isAdmin && (
  <>
    <h1 className="pt" style={{ marginBottom: 16 }}>Admin <span style={{ fontSize: 14, color: "var(--red)", fontFamily: "var(--mono)" }}>⚙</span></h1>

    {/* Users list */}
    <div className="card">
      <div className="st">Usuarios ({adminUsers.length})</div>
      <table className="tbl">
        <thead><tr><th>Usuario</th><th>Rol</th><th>Creado</th><th>Nueva pass</th><th></th></tr></thead>
        <tbody>
          {adminUsers.map(u => (
            <tr key={u.id}>
              <td className="mono" style={{ color: u.role === "admin" ? "var(--accent)" : "var(--text)", fontWeight: u.role === "admin" ? 700 : 400 }}>{u.username}</td>
              <td><span className={`tag ${u.role === "admin" ? "ta" : "tgr"}`}>{u.role || "user"}</span></td>
              <td className="mono" style={{ fontSize: 10, color: "var(--text3)" }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"}</td>
              <td>
                <div style={{ display: "flex", gap: 4 }}>
                  <input className="inp" style={{ width: 100, fontSize: 11, padding: "4px 8px" }} id={`pw-${u.id}`} placeholder="nueva..." />
                  <button className="btn bo bx" onClick={() => {
                    const inp = document.getElementById(`pw-${u.id}`)
                    if (inp) adminResetPassword(u.id, inp.value)
                  }}>OK</button>
                </div>
              </td>
              <td>
                {u.username !== "admin" && (
                  <button className="btn bd bx" onClick={() => adminDeleteUser(u.id, u.username)}>Borrar</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* Invite Codes */}
    <div className="card">
      <div className="st">Codigos de invitacion</div>
      <p style={{ fontSize: 11, color: "var(--text3)", marginBottom: 12 }}>Cada codigo se usa una sola vez para crear una cuenta.</p>
      <button className="btn bp bs" onClick={generateInviteCode} style={{ marginBottom: 14 }}>+ Generar codigo</button>
      {inviteCodes.length > 0 && (
        <table className="tbl">
          <thead><tr><th>Codigo</th><th>Estado</th><th>Usado por</th><th>Fecha</th><th></th></tr></thead>
          <tbody>
            {inviteCodes.map(c => {
              const usedByUser = c.used_by ? adminUsers.find(u => u.id === c.used_by) : null
              return (
                <tr key={c.id}>
                  <td className="mono" style={{ fontWeight: 600, color: c.used_by ? "var(--text3)" : "var(--green)", letterSpacing: 1 }}>{c.code}</td>
                  <td><span className={`tag ${c.used_by ? "tgr" : "tg"}`}>{c.used_by ? "Usado" : "Disponible"}</span></td>
                  <td className="mono" style={{ fontSize: 11 }}>{usedByUser ? usedByUser.username : "-"}</td>
                  <td className="mono" style={{ fontSize: 10, color: "var(--text3)" }}>{c.used_at ? new Date(c.used_at).toLocaleDateString() : new Date(c.created_at).toLocaleDateString()}</td>
                  <td><button className="btn bd bx" onClick={() => deleteInviteCode(c.id)}>✕</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {inviteCodes.length === 0 && <div className="em">No hay codigos. Genera uno para invitar usuarios.</div>}
    </div>

    {/* View any user's stats */}
    <div className="card">
      <div className="st">Ver stats de usuario</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {adminUsers.map(u => (
          <div key={u.id} style={{ display: "flex", gap: 4 }}>
            <button className={`btn ${adminViewUser === u.id && adminViewMode === "bt" ? "bp" : "bo"}`} style={{ fontSize: 11 }}
              onClick={() => adminViewUserTrades(u.id, "bt")}>{u.username} BT</button>
            <button className={`btn ${adminViewUser === u.id && adminViewMode === "journal" ? "bp" : "bo"}`} style={{ fontSize: 11 }}
              onClick={() => adminViewUserTrades(u.id, "journal")}>{u.username} J</button>
          </div>
        ))}
      </div>

      {adminViewUser && adminViewTrades.length > 0 && (() => {
        const ts = rT(adminViewTrades)
        const s = cS(ts)
        const uName = (adminUsers.find(u => u.id === adminViewUser) || { username: "?" }).username
        return (
          <>
            <div style={{ marginBottom: 12, padding: "10px 16px", background: "var(--surface2)", borderRadius: 8, borderLeft: "3px solid var(--red)" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: "var(--accent)" }}>{uName}</span>
              <span style={{ fontSize: 12, color: "var(--text3)", marginLeft: 8 }}>{ts.length} trades | {adminViewMode.toUpperCase()}</span>
            </div>
            <div className="metrics">
              <MC label="P&L" value={`${s.totalR >= 0 ? "+" : ""}${s.totalR}R`} sub={fmt$(s.totalDollar)} color={s.totalR >= 0 ? "var(--green)" : "var(--red)"} big />
              <MC label="Win%" value={`${s.winRate.toFixed(2)}%`} color={s.winRate >= 50 ? "var(--green)" : "var(--red)"} sub={`${s.wins}W|${s.losses}L|${s.bes}BE`} />
              <MC label="PF" value={fmtPF(s.profitFactor)} color={s.profitFactor >= 1.5 ? "var(--green)" : s.profitFactor >= 1 ? "var(--yellow)" : "var(--red)"} />
              <MC label="Exp" value={`${s.expectancy}R`} color={s.expectancy > 0 ? "var(--green)" : "var(--red)"} />
              <MC label="Trades" value={s.total} />
            </div>
            <div className="card" style={{ background: "var(--bg)" }}>
              <div className="st">Equity</div>
              <EC trades={ts} />
            </div>
            <div className="card" style={{ background: "var(--bg)", overflowX: "auto" }}>
              <div className="st">Ultimos trades</div>
              <table className="tbl">
                <thead><tr><th>Fecha</th><th>Setup</th><th>R</th><th>P&L</th><th>Res</th></tr></thead>
                <tbody>{ts.slice(0, 30).map((t, i) => {
                  const r = gR(t)
                  return (<tr key={i}>
                    <td className="mono">{fmtD(t.fecha)}</td><td><STag s={t.setup} /></td>
                    <td className="mono bold" style={{ color: r > 0 ? "var(--green)" : r < 0 ? "var(--red)" : "var(--yellow)" }}>{fmtR(r)}</td>
                    <td className="mono bold" style={{ color: r >= 0 ? "var(--green)" : "var(--red)" }}>{fmt$(Math.round(r * RV))}</td>
                    <td><RTag r={t.resultado} /></td>
                  </tr>)
                })}</tbody>
              </table>
            </div>
          </>
        )
      })()}
      {adminViewUser && adminViewTrades.length === 0 && <div className="em">Sin trades</div>}
    </div>
  </>
)}

      </div>

      {/* ── Analyzer floating button ── */}
      <div onClick={() => setAnalyzerOpen(!analyzerOpen)}
        style={{ position: "fixed", bottom: 24, right: 24, width: 52, height: 52, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 20px rgba(76,154,255,.4)", zIndex: 998, fontSize: 22, transition: "transform .2s", transform: analyzerOpen ? "rotate(45deg)" : "none" }}>
        {analyzerOpen ? "+" : "📊"}
      </div>

      {/* ── Analyzer panel (draggable) ── */}
      {analyzerOpen && (
        <div style={{
          position: "fixed",
          bottom: analyzerPos.y !== null ? "auto" : 88,
          right: analyzerPos.x !== null ? "auto" : 24,
          top: analyzerPos.y !== null ? analyzerPos.y : "auto",
          left: analyzerPos.x !== null ? analyzerPos.x : "auto",
          width: 420, maxWidth: "calc(100vw - 48px)", height: 580, maxHeight: "calc(100vh - 100px)",
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, zIndex: 998,
          display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,.5)"
        }}>
          {/* Header (drag handle) */}
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "grab", userSelect: "none" }}
            onMouseDown={e => {
              const parent = e.currentTarget.parentElement
              const pr = parent.getBoundingClientRect()
              analyzerDragOffset.current = { x: e.clientX - pr.left, y: e.clientY - pr.top }
              const onMove = ev => { setAnalyzerPos({ x: ev.clientX - analyzerDragOffset.current.x, y: ev.clientY - analyzerDragOffset.current.y }) }
              const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
              window.addEventListener("mousemove", onMove)
              window.addEventListener("mouseup", onUp)
            }}>
            <div>
              <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 13, color: "var(--accent)" }}>📊 Analizador de Trading</div>
              <div style={{ fontSize: 10, color: "var(--text3)" }}>{modeLabel} • {trades.length} trades</div>
            </div>
            <button onClick={() => { setAnalyzerPos({ x: null, y: null }); setAnalyzerOpen(false) }} style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* Analysis buttons */}
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { id: "resumen", label: "📊 Resumen", color: "var(--accent)" },
              { id: "be", label: "💰 BEs", color: "var(--yellow)" },
              { id: "hora", label: "🕐 Horas", color: "var(--green)" },
              { id: "setups", label: "◆ Setups", color: "var(--purple)" },
              { id: "tendencia", label: "📈 Tendencia", color: "var(--accent)" },
              { id: "mensual", label: "📅 Mensual", color: "var(--green)" },
              { id: "direccion", label: "🧭 Dirección", color: "var(--yellow)" }
            ].map(b => (
              <button key={b.id} onClick={() => runAnalysis(b.id)}
                style={{ padding: "5px 10px", background: b.color + "15", color: b.color, border: `1px solid ${b.color}30`, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--mono)" }}>
                {b.label}
              </button>
            ))}
          </div>

          {/* Result area */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
            {!analyzerResult ? (
              <div style={{ textAlign: "center", padding: "40px 10px", color: "var(--text3)" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                <div style={{ fontSize: 13, marginBottom: 6 }}>Selecciona un análisis arriba</div>
                <div style={{ fontSize: 11, color: "var(--text3)" }}>Los datos se calculan de tus {trades.length} trades en {modeLabel}</div>
                <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 4 }}>Respeta los filtros activos del dashboard</div>
              </div>
            ) : (
              <div>
                <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15, color: "var(--accent)", marginBottom: 12 }}>{analyzerResult.title}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, lineHeight: 1.8, whiteSpace: "pre-wrap", color: "var(--text)" }}>
                  {analyzerResult.lines.map((line, i) => {
                    if (line.startsWith("✅")) return <div key={i} style={{ color: "var(--green)" }}>{line}</div>
                    if (line.startsWith("🔴")) return <div key={i} style={{ color: "var(--red)" }}>{line}</div>
                    if (line.startsWith("⚠️")) return <div key={i} style={{ color: "var(--yellow)" }}>{line}</div>
                    if (line.startsWith("💡")) return <div key={i} style={{ color: "var(--purple)" }}>{line}</div>
                    if (line.startsWith("🔥")) return <div key={i} style={{ color: "var(--green)" }}>{line}</div>
                    if (line.startsWith("🧊")) return <div key={i} style={{ color: "var(--accent)" }}>{line}</div>
                    if (line.startsWith("─")) return <div key={i} style={{ color: "var(--border2)" }}>{line}</div>
                    return <div key={i}>{line}</div>
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: "8px 14px", borderTop: "1px solid var(--border)", fontSize: 9, color: "var(--text3)" }}>
            Arrastra el header para mover • Sin conexión a internet requerida
          </div>
        </div>
      )}
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
.ss-modal{position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:10000;display:flex;align-items:center;justify-content:center;cursor:pointer}
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

// ═══════════════════════════════════════════════
// PUBLIC VIEW — read-only, isolated, no login links
// ═══════════════════════════════════════════════
function PublicView({ linkId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [viewSS, setViewSS] = useState(null)
  const [dayModal, setDayModal] = useState(null)
  const [pubCalM, setPubCalM] = useState(null)
  const [pubCalY, setPubCalY] = useState(null)

  useEffect(() => {
    (async () => {
      try {
        const lr = await supa(`public_links?id=eq.${encodeURIComponent(linkId)}&select=*`)
        const ld = await lr.json()
        if (!ld || !ld.length) { setError("Link no encontrado o expirado"); setLoading(false); return }
        const link = ld[0]
        // Check expiry
        if (link.expires_at && new Date(link.expires_at) < new Date()) { setError("Link expirado"); setLoading(false); return }
        // Get user info
        const ur = await supa(`users?id=eq.${link.user_id}&select=username,instagram`)
        const ud = await ur.json()
        const username = ud && ud[0] ? ud[0].username : "?"
        const instagram = ud && ud[0] ? ud[0].instagram || "" : ""
        // Get trades
        let query = `trades?user_id=eq.${link.user_id}&mode=eq.${link.mode}&select=*&order=created_at.desc`
        const tr = await supa(query)
        let trades = (await tr.json()).map(d2t)
        // Apply filters
        if (link.share_type === "daterange" && link.share_filter) {
          const [d1, d2] = link.share_filter.split("|")
          if (d1) trades = trades.filter(t => t.fecha >= d1)
          if (d2) trades = trades.filter(t => t.fecha <= d2)
        } else if (link.share_type === "month" && link.share_filter) {
          trades = trades.filter(t => t.fecha && t.fecha.startsWith(link.share_filter))
        } else if (link.share_type === "setup" && link.share_filter) {
          trades = trades.filter(t => t.setup === link.share_filter)
        }
        // Auto-position calendar
        const dates = trades.filter(t => t.fecha).map(t => new Date(t.fecha)).sort((a, b) => b - a)
        if (dates.length) { setPubCalM(dates[0].getMonth()); setPubCalY(dates[0].getFullYear()) }
        else { setPubCalM(new Date().getMonth()); setPubCalY(new Date().getFullYear()) }

        setData({ trades, username, instagram, mode: link.mode, link })
      } catch (e) { setError("Error cargando datos") }
      finally { setLoading(false) }
    })()
  }, [linkId])

  if (loading) return <div style={{ minHeight: "100vh", background: "#0a0e14", display: "flex", alignItems: "center", justifyContent: "center", color: "#4c9aff", fontFamily: "'JetBrains Mono', monospace" }}>Cargando...</div>
  if (error) return <div style={{ minHeight: "100vh", background: "#0a0e14", display: "flex", alignItems: "center", justifyContent: "center", color: "#ff4757", fontFamily: "'JetBrains Mono', monospace" }}>{error}</div>
  if (!data) return null

  const { trades, username, instagram, mode } = data
  const real = rT(trades)
  const s = cS(real)
  const ex = extraS(real)
  const modeLabel = mode === "journal" ? "JOURNAL" : "BACKTESTING"
  const accentColor = mode === "journal" ? "var(--purple)" : "var(--accent)"

  // Calendar
  const calBd = {}
  if (pubCalM !== null && pubCalY !== null) {
    trades.forEach(t => {
      if (!t.fecha) return
      const d = new Date(t.fecha)
      if (d.getMonth() === pubCalM && d.getFullYear() === pubCalY) {
        const day = d.getDate()
        if (!calBd[day]) calBd[day] = []
        calBd[day].push(t)
      }
    })
  }
  const dim = pubCalY !== null ? new Date(pubCalY, pubCalM + 1, 0).getDate() : 0
  const fwd = pubCalY !== null ? new Date(pubCalY, pubCalM, 1).getDay() : 0
  const mName = pubCalY !== null ? new Date(pubCalY, pubCalM).toLocaleString("es", { month: "long", year: "numeric" }) : ""
  const cells = []; for (let i = 0; i < fwd; i++) cells.push(null); for (let d = 1; d <= dim; d++) cells.push(d)
  const weeks = []; for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  const makeDate = d => `${pubCalY}-${String(pubCalM + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "40px 20px" }}>
      {viewSS && <div className="ss-modal" onClick={() => setViewSS(null)}><img src={viewSS} /></div>}
      {dayModal && <DayModal date={dayModal} trades={trades} onClose={() => setDayModal(null)} onViewSS={setViewSS} onNavigate={setDayModal} />}
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: accentColor, fontFamily: "var(--mono)", letterSpacing: -0.5 }}>My Journal Pro</h1>
          <p style={{ color: "var(--text3)", fontFamily: "var(--mono)", fontSize: 13, marginTop: 4 }}>{modeLabel} — {real.length} trades</p>
        </div>

        {/* Metrics */}
        <div className="metrics">
          <MC label="P&L" value={`${s.totalR >= 0 ? "+" : ""}${s.totalR}R`} sub={fmt$(s.totalDollar)} color={s.totalR >= 0 ? "var(--green)" : "var(--red)"} big />
          <MC label="Win%" value={`${s.winRate.toFixed(2)}%`} color={s.winRate >= 50 ? "var(--green)" : "var(--red)"} sub={`${s.wins}W|${s.losses}L|${s.bes}BE`} />
          <MC label="PF" value={fmtPF(s.profitFactor)} color={s.profitFactor >= 1.5 ? "var(--green)" : s.profitFactor >= 1 ? "var(--yellow)" : "var(--red)"} />
          <MC label="Exp" value={`${s.expectancy}R`} color={s.expectancy > 0 ? "var(--green)" : "var(--red)"} sub={fmt$(s.expectDollar) + "/t"} />
          <MC label="Sharpe" value={s.sharpeRatio.toFixed(2)} color={s.sharpeRatio >= 1 ? "var(--green)" : s.sharpeRatio >= 0.5 ? "var(--yellow)" : "var(--red)"} />
          <MC label="Payoff" value={s.payoffRatio === Infinity ? "∞" : s.payoffRatio.toFixed(2)} color={s.payoffRatio >= 2 ? "var(--green)" : "var(--yellow)"} />
        </div>

        {/* Resumen */}
        <div className="card">
          <div className="st">Resumen</div>
          <div className="info-grid">
            <div className="info-item"><div className="ml">Dia + ganador</div><div className="val" style={{ color: "var(--green)" }}>{ex.bestDay}</div></div>
            <div className="info-item"><div className="ml">Dia + perdedor</div><div className="val" style={{ color: "var(--red)" }}>{ex.worstDay}</div></div>
            <div className="info-item"><div className="ml">Ops/dia</div><div className="val">{ex.avgOps}</div></div>
            <div className="info-item"><div className="ml">Racha WIN</div><div className="val" style={{ color: "var(--green)" }}>{s.maxWinStreak}</div></div>
            <div className="info-item"><div className="ml">Racha LOSS</div><div className="val" style={{ color: "var(--red)" }}>{s.maxLossStreak}</div></div>
          </div>
        </div>

        {/* Equity */}
        <div className="card"><div className="st">Equity</div><EC trades={real} /></div>

        {/* Calendar */}
        {pubCalM !== null && (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15, textTransform: "capitalize" }}>{mName}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn bo bx" onClick={() => { if (pubCalM === 0) { setPubCalM(11); setPubCalY(pubCalY - 1) } else setPubCalM(pubCalM - 1) }}>&lt;</button>
                <button className="btn bo bx" onClick={() => { if (pubCalM === 11) { setPubCalM(0); setPubCalY(pubCalY + 1) } else setPubCalM(pubCalM + 1) }}>&gt;</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", fontSize: 10, fontFamily: "var(--mono)" }}>
              {["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"].map(d => (
                <div key={d} style={{ padding: "6px 3px", textAlign: "center", color: "var(--text3)", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{d}</div>
              ))}
              {weeks.map((wk, wi) => (
                <React.Fragment key={wi}>
                  {wk.map((d, di) => {
                    if (!d) return <div key={di} style={{ padding: 8, borderBottom: "1px solid var(--border)", background: "var(--bg)" }} />
                    const dt = calBd[d] || []
                    const rl = rT(dt)
                    const hasSO = dt.some(isSO)
                    const dr = Math.round(rl.reduce((a, t) => a + gR(t), 0) * 100) / 100
                    const bg = hasSO && !rl.length ? "rgba(90,100,120,.08)" : rl.length ? (dr > 0 ? "rgba(0,214,143,.08)" : dr < 0 ? "rgba(255,71,87,.08)" : "var(--surface)") : "var(--surface)"
                    return (
                      <div key={di} style={{ padding: "6px 4px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", background: bg, minHeight: 55, cursor: dt.length ? "pointer" : "default" }}
                        onClick={() => dt.length && setDayModal(makeDate(d))}>
                        <div style={{ fontSize: 9, color: "var(--text3)", marginBottom: 3 }}>{d}</div>
                        {hasSO && !rl.length ? <div style={{ fontSize: 10, color: "var(--text3)", fontWeight: 600 }}>SIN OP</div>
                          : rl.length ? <><div style={{ fontSize: 13, fontWeight: 700, color: dr > 0 ? "var(--green)" : dr < 0 ? "var(--red)" : "var(--yellow)", fontFamily: "var(--mono)" }}>{fmt$(Math.round(dr * RV))}</div><div style={{ fontSize: 8, color: "var(--text3)", marginTop: 1 }}>{rl.length}t</div></>
                          : <div style={{ fontSize: 8, color: "var(--text3)" }}>-</div>}
                      </div>
                    )
                  })}
                  {Array(7 - wk.length).fill(null).map((_, i) => <div key={`p${i}`} style={{ padding: 8, borderBottom: "1px solid var(--border)", background: "var(--bg)" }} />)}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Trades */}
        <div className="card" style={{ overflowX: "auto" }}>
          <div className="st">Trades</div>
          <table className="tbl">
            <thead><tr><th>Fecha</th><th>Setup</th><th>B/S</th><th>R</th><th>P&L</th><th>Res</th></tr></thead>
            <tbody>{real.slice(0, 50).map((t, i) => {
              const r = gR(t)
              return (<tr key={i}>
                <td className="mono">{fmtD(t.fecha)}</td><td><STag s={t.setup} /></td><td><BTag b={t.buySell} /></td>
                <td className="mono bold" style={{ color: r > 0 ? "var(--green)" : r < 0 ? "var(--red)" : "var(--yellow)" }}>{fmtR(r)}</td>
                <td className="mono bold" style={{ color: r >= 0 ? "var(--green)" : "var(--red)" }}>{fmt$(Math.round(r * RV))}</td>
                <td><RTag r={t.resultado} /></td>
              </tr>)
            })}</tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 24, color: "var(--text3)", fontSize: 11, fontFamily: "var(--mono)" }}>
          My Journal Pro{instagram ? ` — ${instagram.startsWith("@") ? instagram : "@" + instagram}` : ""}
        </div>
      </div>
    </div>
  )
}

function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("btj_user")) }
    catch { return null }
  })

  // Check for public link in URL
  const pubId = new URLSearchParams(window.location.search).get("pub")
  if (pubId) {
    return <><style>{CSS}</style><PublicView linkId={pubId} /></>
  }

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
