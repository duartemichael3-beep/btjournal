/* ============================================================
   BT JOURNAL — app.jsx  (Parte 1 / 4)
   Constantes · Helpers · Stats · Parser NT8
   ============================================================ */
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ── Supabase ────────────────────────────────────────────────
const SUPABASE_URL = "https://kkcsykncinisnknymonz.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrY3N5a25jaW5pc25rbnltb256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjYxMzIsImV4cCI6MjA5MDg0MjEzMn0.m8M_nIg6h87ocMedXSOSzOr0Xv0iIwjMWuODTnbHmSI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Constantes de dominio ───────────────────────────────────
const R_VALUE = 300; // 1R = $300

const SETUPS   = ["M1", "M2", "M3", "J1", "J2"];
const CONTEXTOS = ["APERTURA", "ROMPIMIENTO", "GIRO"];
const DIRECCIONES = ["RANGO", "ALCISTA", "BAJISTA"];
const RESULTADOS  = ["SL", "BE", "WIN"];
const BUY_SELL    = ["BUY", "SELL"];

const NOTICIAS_HORAS   = ["08:30", "09:45", "10:00", "10:30"];
const NOTICIAS_IMPACTO = ["ALTO", "MEDIO", "BAJO"];
const NOTICIAS_TIPO    = [
  "NFP","CPI","PPI","FOMC","JOBLESS CLAIMS",
  "GDP","RETAIL SALES","ISM","PCE","OTRA",
];

const MODES = { BT: "bt", JOURNAL: "journal" };

// Pestañas disponibles (compartidas BT y Journal)
const TABS = [
  { key: "dashboard",  label: "Dashboard" },
  { key: "calendario", label: "Calendario" },
  { key: "trades",     label: "Trades" },
  { key: "nuevo",      label: "Nuevo" },
  { key: "stats",      label: "Stats" },
  { key: "setups",     label: "Setups" },
  { key: "avanzado",   label: "Avanzado" },
  { key: "tips",       label: "Tips" },
  { key: "importar",   label: "Importar NT8" }, // solo visible en mode journal
];

// ── Mapping camelCase <-> snake_case ────────────────────────
const FIELD_MAP = {
  horaInicio:     "hora_inicio",
  horaFinal:      "hora_final",
  duracionTrade:  "duracion_trade",
  buySell:        "buy_sell",
  puntosSl:       "puntos_sl",
  rResultado:     "r_resultado",
  rMaximo:        "r_maximo",
  breakRangoM30:  "break_rango_m30",
  direccionDia:   "direccion_dia",
  ddPuntos:       "dd_puntos",
  hayNoticia:     "hay_noticia",
  noticiaHora:    "noticia_hora",
  noticiaImpacto: "noticia_impacto",
  noticiaTipo:    "noticia_tipo",
  parentAccount:  "parent_account",
};

const FIELD_MAP_REV = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([k, v]) => [v, k])
);

function tradeToDb(t) {
  const out = {};
  for (const [k, v] of Object.entries(t)) {
    const dbKey = FIELD_MAP[k] || k;
    out[dbKey] = v;
  }
  return out;
}

function dbToTrade(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const jsKey = FIELD_MAP_REV[k] || k;
    out[jsKey] = v;
  }
  return out;
}

// ── Helpers de fecha / hora ─────────────────────────────────
function fmtDate(iso) {
  // YYYY-MM-DD -> DD/MM/YY
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function isoFromParts(d, m, y) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function weekOfMonth(isoDate) {
  if (!isoDate) return "";
  const d = new Date(isoDate + "T00:00:00");
  const day = d.getDate();
  return `S${Math.ceil(day / 7)}`;
}

function calcDuration(start, end) {
  if (!start || !end) return "";
  const [h1, m1] = start.split(":").map(Number);
  const [h2, m2] = end.split(":").map(Number);
  const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (diff <= 0) return "";
  const hh = Math.floor(diff / 60);
  const mm = diff % 60;
  return hh > 0 ? `${hh}h ${mm}m` : `${mm}m`;
}

function calcDurationMinutes(start, end) {
  if (!start || !end) return 0;
  const [h1, m1] = start.split(":").map(Number);
  const [h2, m2] = end.split(":").map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}

// Generar opciones de hora cada 1 min de 00:00 a 23:59
function generateTimeOptions() {
  const opts = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m++) {
      opts.push(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
      );
    }
  }
  return opts;
}
const TIME_OPTIONS = generateTimeOptions();

// Calcular DD%
function calcDDPercent(ddPuntos, puntosSl) {
  const dd = parseFloat(ddPuntos) || 0;
  const sl = parseFloat(puntosSl) || 0;
  if (sl === 0) return 0;
  return ((dd / sl) * 100).toFixed(2);
}

// ── Días del mes para calendario ────────────────────────────
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year, month) {
  // 0=domingo -> lo mapeamos a lunes=0
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

// ── Funciones de estadísticas ───────────────────────────────

function calcStats(trades) {
  if (!trades || trades.length === 0) {
    return {
      total: 0, wins: 0, losses: 0, bes: 0,
      winRate: 0, profitFactor: 0, expectancyR: 0, expectancy$: 0,
      sharpe: 0, recoveryFactor: 0, payoff: 0, maxDD: 0, ddPercent: 0,
      sampleSize: 0, maxWinStreak: 0, maxLossStreak: 0,
      avgDurationWin: 0, avgDurationSL: 0, avgDurationBE: 0,
      totalR: 0, totalPnL: 0,
    };
  }

  const wins   = trades.filter((t) => t.resultado === "WIN");
  const losses = trades.filter((t) => t.resultado === "SL");
  const bes    = trades.filter((t) => t.resultado === "BE");

  const total = trades.length;
  const winRate = total > 0 ? (wins.length / total) * 100 : 0;

  // R & P&L
  const rValues = trades.map((t) => {
    if (t.resultado === "SL") return -1;
    if (t.resultado === "BE") return 0;
    return parseFloat(t.rResultado) || 0;
  });
  const totalR   = rValues.reduce((a, b) => a + b, 0);
  const totalPnL = totalR * R_VALUE;

  const grossWinR  = rValues.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const grossLossR = Math.abs(rValues.filter((r) => r < 0).reduce((a, b) => a + b, 0));

  const profitFactor = grossLossR > 0 ? grossWinR / grossLossR : grossWinR > 0 ? Infinity : 0;

  // Expectancy
  const expectancyR = total > 0 ? totalR / total : 0;
  const expectancy$ = expectancyR * R_VALUE;

  // Sharpe (simplificado: media / stddev de R)
  const meanR = total > 0 ? totalR / total : 0;
  const variance =
    total > 1
      ? rValues.reduce((sum, r) => sum + (r - meanR) ** 2, 0) / (total - 1)
      : 0;
  const stdR = Math.sqrt(variance);
  const sharpe = stdR > 0 ? meanR / stdR : 0;

  // Max Drawdown (en R)
  let peak = 0;
  let cumR = 0;
  let maxDD = 0;
  for (const r of rValues) {
    cumR += r;
    if (cumR > peak) peak = cumR;
    const dd = peak - cumR;
    if (dd > maxDD) maxDD = dd;
  }
  const ddPercent = peak > 0 ? (maxDD / peak) * 100 : 0;

  // Recovery Factor
  const recoveryFactor = maxDD > 0 ? totalR / maxDD : totalR > 0 ? Infinity : 0;

  // Payoff Ratio
  const avgWinR  = wins.length > 0
    ? wins.reduce((s, t) => s + (parseFloat(t.rResultado) || 0), 0) / wins.length
    : 0;
  const avgLossR = losses.length > 0 ? 1 : 0; // SL siempre -1R
  const payoff = avgLossR > 0 ? avgWinR / avgLossR : 0;

  // Rachas
  let maxWinStreak = 0, maxLossStreak = 0, ws = 0, ls = 0;
  for (const t of trades) {
    if (t.resultado === "WIN") { ws++; ls = 0; }
    else if (t.resultado === "SL") { ls++; ws = 0; }
    else { ws = 0; ls = 0; }
    if (ws > maxWinStreak) maxWinStreak = ws;
    if (ls > maxLossStreak) maxLossStreak = ls;
  }

  // Duración promedio por resultado
  function avgDur(arr) {
    const durs = arr
      .map((t) => calcDurationMinutes(t.horaInicio, t.horaFinal))
      .filter((d) => d > 0);
    return durs.length > 0 ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
  }

  return {
    total,
    wins: wins.length,
    losses: losses.length,
    bes: bes.length,
    winRate,
    profitFactor,
    expectancyR,
    expectancy$,
    sharpe,
    recoveryFactor,
    payoff,
    maxDD,
    ddPercent,
    sampleSize: total,
    maxWinStreak,
    maxLossStreak,
    avgDurationWin: avgDur(wins),
    avgDurationSL:  avgDur(losses),
    avgDurationBE:  avgDur(bes),
    totalR,
    totalPnL,
  };
}

// Equity curve data  [{ idx, cumR, cumPnL }]
function buildEquityCurve(trades) {
  let cum = 0;
  return trades.map((t, i) => {
    const r =
      t.resultado === "SL" ? -1 : t.resultado === "BE" ? 0 : parseFloat(t.rResultado) || 0;
    cum += r;
    return { idx: i + 1, cumR: cum, cumPnL: cum * R_VALUE, fecha: t.fecha };
  });
}

// P&L por día  { "YYYY-MM-DD": totalPnL }
function pnlByDay(trades) {
  const map = {};
  for (const t of trades) {
    const r =
      t.resultado === "SL" ? -1 : t.resultado === "BE" ? 0 : parseFloat(t.rResultado) || 0;
    map[t.fecha] = (map[t.fecha] || 0) + r * R_VALUE;
  }
  return map;
}

// P&L por semana del mes  { "S1": totalPnL, ... }
function pnlByWeek(trades) {
  const map = {};
  for (const t of trades) {
    const w = weekOfMonth(t.fecha);
    const r =
      t.resultado === "SL" ? -1 : t.resultado === "BE" ? 0 : parseFloat(t.rResultado) || 0;
    map[w] = (map[w] || 0) + r * R_VALUE;
  }
  return map;
}

// Donut data  [{ label, value, color }]
function donutData(stats) {
  return [
    { label: "WIN", value: stats.wins,   color: "#22c55e" },
    { label: "SL",  value: stats.losses, color: "#ef4444" },
    { label: "BE",  value: stats.bes,    color: "#facc15" },
  ];
}

// Stats por setup
function statsBySetup(trades) {
  const map = {};
  for (const s of SETUPS) {
    const sub = trades.filter((t) => t.setup === s);
    map[s] = calcStats(sub);
  }
  return map;
}

// Stats por bloque de hora (cada 5 min)
function statsByHourBlock(trades) {
  const map = {};
  for (const t of trades) {
    if (!t.horaInicio) continue;
    const [h, m] = t.horaInicio.split(":").map(Number);
    const block = `${String(h).padStart(2, "0")}:${String(Math.floor(m / 5) * 5).padStart(2, "0")}`;
    if (!map[block]) map[block] = [];
    map[block].push(t);
  }
  const result = {};
  for (const [block, arr] of Object.entries(map)) {
    result[block] = calcStats(arr);
  }
  return result;
}

// Stats por ATR range
function statsByATR(trades) {
  const ranges = [
    { label: "0-20",  min: 0,  max: 20 },
    { label: "20-40", min: 20, max: 40 },
    { label: "40-60", min: 40, max: 60 },
    { label: "60-80", min: 60, max: 80 },
    { label: "80+",   min: 80, max: Infinity },
  ];
  const result = {};
  for (const r of ranges) {
    const sub = trades.filter((t) => {
      const a = parseFloat(t.atr) || 0;
      return a >= r.min && a < r.max;
    });
    if (sub.length > 0) result[r.label] = calcStats(sub);
  }
  return result;
}

// Stats por SL pts range
function statsBySLPts(trades) {
  const ranges = [
    { label: "0-5",   min: 0,  max: 5 },
    { label: "5-10",  min: 5,  max: 10 },
    { label: "10-15", min: 10, max: 15 },
    { label: "15-20", min: 15, max: 20 },
    { label: "20+",   min: 20, max: Infinity },
  ];
  const result = {};
  for (const r of ranges) {
    const sub = trades.filter((t) => {
      const sl = parseFloat(t.puntosSl) || 0;
      return sl >= r.min && sl < r.max;
    });
    if (sub.length > 0) result[r.label] = calcStats(sub);
  }
  return result;
}

// Stats por dirección
function statsByDirection(trades) {
  const result = {};
  for (const d of DIRECCIONES) {
    const sub = trades.filter((t) => t.direccionDia === d);
    if (sub.length > 0) result[d] = calcStats(sub);
  }
  return result;
}

// R tomado vs R máximo distribution
function rTakenVsMax(trades) {
  return trades
    .filter((t) => t.resultado === "WIN" && t.rResultado && t.rMaximo)
    .map((t) => ({
      taken: parseFloat(t.rResultado) || 0,
      max:   parseFloat(t.rMaximo) || 0,
      fecha: t.fecha,
      setup: t.setup,
    }));
}

// % de movimiento capturado
function capturePercent(trades) {
  const data = rTakenVsMax(trades);
  if (data.length === 0) return 0;
  const pcts = data.map((d) => (d.max > 0 ? (d.taken / d.max) * 100 : 0));
  return pcts.reduce((a, b) => a + b, 0) / pcts.length;
}

// ── Tips automáticos ────────────────────────────────────────
function generateTips(trades) {
  if (trades.length < 5) return ["Necesitas al menos 5 trades para generar tips."];

  const tips = [];
  const s = calcStats(trades);
  const byHour = statsByHourBlock(trades);
  const bySetup = statsBySetup(trades);
  const capture = capturePercent(trades);

  // Mejor / peor hora
  const hourEntries = Object.entries(byHour).filter(([, st]) => st.total >= 3);
  if (hourEntries.length > 0) {
    const best = hourEntries.reduce((a, b) => (a[1].winRate > b[1].winRate ? a : b));
    const worst = hourEntries.reduce((a, b) => (a[1].winRate < b[1].winRate ? a : b));
    tips.push(`🎯 Mejor hora: ${best[0]} (WR ${best[1].winRate.toFixed(1)}%, ${best[1].total} trades)`);
    tips.push(`⚠️ Peor hora: ${worst[0]} (WR ${worst[1].winRate.toFixed(1)}%, ${worst[1].total} trades)`);
  }

  // Mejor setup
  const setupEntries = Object.entries(bySetup).filter(([, st]) => st.total >= 3);
  if (setupEntries.length > 0) {
    const bestSetup = setupEntries.reduce((a, b) =>
      a[1].expectancyR > b[1].expectancyR ? a : b
    );
    tips.push(
      `📊 Mejor setup: ${bestSetup[0]} (Exp ${bestSetup[1].expectancyR.toFixed(2)}R, WR ${bestSetup[1].winRate.toFixed(1)}%)`
    );
  }

  // Capture %
  tips.push(`📈 Capturas promedio: ${capture.toFixed(1)}% del movimiento máximo`);

  // Rachas
  tips.push(`🔥 Racha WIN máx: ${s.maxWinStreak} | Racha SL máx: ${s.maxLossStreak}`);

  // Sharpe
  if (s.sharpe > 0) tips.push(`📉 Sharpe Ratio: ${s.sharpe.toFixed(2)}`);

  // Recovery
  if (s.recoveryFactor !== Infinity && s.recoveryFactor > 0)
    tips.push(`🔄 Recovery Factor: ${s.recoveryFactor.toFixed(2)}`);

  // Payoff
  if (s.payoff > 0) tips.push(`💰 Payoff Ratio: ${s.payoff.toFixed(2)}`);

  // Sample size
  if (s.total < 30) tips.push(`⚡ Sample size: ${s.total} — necesitas al menos 30 trades para resultados confiables`);

  // ATR óptimo
  const byATR = statsByATR(trades);
  const atrEntries = Object.entries(byATR).filter(([, st]) => st.total >= 3);
  if (atrEntries.length > 0) {
    const bestATR = atrEntries.reduce((a, b) => (a[1].expectancyR > b[1].expectancyR ? a : b));
    tips.push(`📏 ATR óptimo: ${bestATR[0]} (Exp ${bestATR[1].expectancyR.toFixed(2)}R)`);
  }

  // SL óptimo
  const bySL = statsBySLPts(trades);
  const slEntries = Object.entries(bySL).filter(([, st]) => st.total >= 3);
  if (slEntries.length > 0) {
    const bestSL = slEntries.reduce((a, b) => (a[1].expectancyR > b[1].expectancyR ? a : b));
    tips.push(`🎯 SL óptimo: ${bestSL[0]} pts (Exp ${bestSL[1].expectancyR.toFixed(2)}R)`);
  }

  return tips;
}

// ── Parser CSV NinjaTrader 8 ────────────────────────────────
//
// El CSV tiene columnas:
// Instrument, Action, Quantity, Price, Time, ID, E/X, Position, Order ID, Name, Commission, Rate, Account, Connection
//
// E/X = "Entry" o "Exit"
// Hay que agrupar por trade: un Entry seguido de uno o más Exits hasta que Position = "-" o "0" o cambia de dirección
// Parciales se juntan.

function parseNT8CSV(csvText) {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];

  // Parse header
  const header = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",").map((v) => v.trim());
    if (vals.length < header.length - 1) continue; // skip empty lines
    const row = {};
    header.forEach((h, idx) => {
      row[h] = vals[idx] || "";
    });
    rows.push(row);
  }

  if (rows.length === 0) return [];

  // Group into trades: each Entry starts a new trade, collect Exits until position closes
  const trades = [];
  let currentTrade = null;

  for (const row of rows) {
    const ex = (row["E/X"] || "").trim();
    const action = (row["Action"] || "").trim(); // Buy or Sell
    const qty = parseInt(row["Quantity"]) || 0;
    const price = parseFloat(row["Price"]) || 0;
    const time = (row["Time"] || "").trim();
    const account = (row["Account"] || "").trim();
    const position = (row["Position"] || "").trim();

    if (ex === "Entry") {
      // Close previous trade if still open
      if (currentTrade && currentTrade.exits.length > 0) {
        trades.push(currentTrade);
      }
      currentTrade = {
        action,        // Buy or Sell (direction of entry)
        entryQty: qty,
        entryPrice: price,
        entryTime: time,
        account,
        exits: [],
      };
    } else if (ex === "Exit" && currentTrade) {
      currentTrade.exits.push({ action, qty, price, time });
      // If position is "-" or "0", trade is fully closed
      const posNum = parseInt(position);
      if (position === "-" || position === "" || posNum === 0 || isNaN(posNum)) {
        trades.push(currentTrade);
        currentTrade = null;
      }
    }
  }
  // Push last trade if still open
  if (currentTrade && currentTrade.exits.length > 0) {
    trades.push(currentTrade);
  }

  // Convert grouped trades to our trade format
  return trades.map((t) => {
    const entryDir = t.action; // "Buy" = long, "Sell" = short
    const isLong = entryDir === "Buy";

    // Calculate P&L in points per contract, then total
    let totalPnLPoints = 0;
    let lastExitTime = t.entryTime;

    for (const exit of t.exits) {
      const diff = isLong
        ? exit.price - t.entryPrice
        : t.entryPrice - exit.price;
      totalPnLPoints += diff * exit.qty;
      lastExitTime = exit.time;
    }

    // MNQ = $0.50 per tick (0.25 point), so $2 per point per contract
    // But totalPnLPoints already has qty factored in as points * qty
    // Actually: PnL per contract = diff in points * $2/point for MNQ
    // totalPnLPoints is already (priceExit - priceEntry) * qty summed
    // For MNQ: 1 point = $2, but we've multiplied by qty already
    // So total $ = totalPnLPoints * $2 for MNQ
    // We store R = totalPnL$ / R_VALUE

    // MNQ point value = $2 per point per contract
    // NQ point value = $20 per point per contract
    const pointValue = 2; // MNQ — adjust if needed
    const totalPnL$ = totalPnLPoints * pointValue;
    const rResult = totalPnL$ / R_VALUE;

    // Parse dates
    const entryDate = parseNT8DateTime(t.entryTime);
    const exitDate  = parseNT8DateTime(lastExitTime);

    // Determine resultado
    let resultado = "WIN";
    if (rResult < -0.5) resultado = "SL";
    else if (Math.abs(rResult) <= 0.1) resultado = "BE";

    // Extract parent account: "BX-M75953071852!Bulenox!Bulenox" -> parent = "Bulenox"
    const accountParts = t.account.split("!");
    const parentAccount = accountParts.length > 1 ? accountParts[1] : t.account;

    return {
      fecha:       entryDate.date,
      horaInicio:  entryDate.time,
      horaFinal:   exitDate.time,
      duracionTrade: calcDuration(entryDate.time, exitDate.time),
      buySell:     isLong ? "BUY" : "SELL",
      resultado,
      rResultado:  resultado === "WIN" ? Math.abs(rResult).toFixed(2) : resultado === "SL" ? "" : "",
      rMaximo:     "", // No disponible en CSV
      puntosSl:    "", // No disponible en CSV
      atr:         "",
      setup:       "",
      contexto:    "",
      breakRangoM30: "",
      direccionDia:  "",
      ddPuntos:      "",
      hayNoticia:    "NO",
      noticiaHora:   "",
      noticiaImpacto: "",
      noticiaTipo:   "",
      m5:  "",
      m15: "",
      m30: "",
      screenshot: "",
      notas: `Importado NT8 | P&L: $${totalPnL$.toFixed(2)} | ${t.entryQty} contratos`,
      mode:    MODES.JOURNAL,
      account: t.account,
      parentAccount,
      _pnlDollars: totalPnL$, // internal, not saved
      _rCalc: rResult,         // internal, for display
    };
  });
}

function parseNT8DateTime(str) {
  // "4/2/2026 9:36:35 AM"  ->  { date: "2026-04-02", time: "09:36" }
  if (!str) return { date: "", time: "" };
  try {
    const [datePart, timePart, ampm] = str.split(" ");
    const [month, day, year] = datePart.split("/").map(Number);
    let [hour, min] = timePart.split(":").map(Number);

    if (ampm && ampm.toUpperCase() === "PM" && hour < 12) hour += 12;
    if (ampm && ampm.toUpperCase() === "AM" && hour === 12) hour = 0;

    return {
      date: isoFromParts(day, month, year),
      time: `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`,
    };
  } catch {
    return { date: "", time: "" };
  }
}

// ── CRUD Supabase ───────────────────────────────────────────

async function fetchTrades(userId, mode) {
  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .eq("user_id", userId)
    .eq("mode", mode)
    .order("fecha", { ascending: false })
    .order("hora_inicio", { ascending: false });

  if (error) { console.error("fetchTrades:", error); return []; }
  return (data || []).map(dbToTrade);
}

async function insertTrade(trade, userId, mode) {
  const row = tradeToDb({ ...trade, user_id: userId, mode });
  delete row.id;
  delete row._pnlDollars;
  delete row._rCalc;
  const { data, error } = await supabase.from("trades").insert([row]).select();
  if (error) { console.error("insertTrade:", error); return null; }
  return data?.[0] ? dbToTrade(data[0]) : null;
}

async function updateTrade(id, trade) {
  const row = tradeToDb(trade);
  delete row.id;
  delete row.user_id;
  delete row.mode;
  delete row._pnlDollars;
  delete row._rCalc;
  const { data, error } = await supabase.from("trades").update(row).eq("id", id).select();
  if (error) { console.error("updateTrade:", error); return null; }
  return data?.[0] ? dbToTrade(data[0]) : null;
}

async function deleteTrade(id) {
  const { error } = await supabase.from("trades").delete().eq("id", id);
  if (error) console.error("deleteTrade:", error);
  return !error;
}

async function insertMultipleTrades(trades, userId, mode) {
  const rows = trades.map((t) => {
    const row = tradeToDb({ ...t, user_id: userId, mode });
    delete row.id;
    delete row._pnlDollars;
    delete row._rCalc;
    return row;
  });
  const { data, error } = await supabase.from("trades").insert(rows).select();
  if (error) { console.error("insertMultiple:", error); return []; }
  return (data || []).map(dbToTrade);
}

// ── Auth helpers ────────────────────────────────────────────

async function loginUser(username, password) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("username", username)
    .eq("password", password)
    .single();
  if (error || !data) return null;
  return { id: data.id, username: data.username };
}

async function registerUser(username, password) {
  const { data, error } = await supabase
    .from("users")
    .insert([{ username, password }])
    .select()
    .single();
  if (error) return { error: error.message };
  return { user: { id: data.id, username: data.username } };
}

// ── Colores y estilos base ──────────────────────────────────
const COLORS = {
  bg:        "#0f0f13",
  card:      "#1a1a24",
  cardHover: "#22222e",
  border:    "#2a2a3a",
  text:      "#e4e4e7",
  textDim:   "#71717a",
  accent:    "#6366f1", // indigo
  accentBT:  "#6366f1",
  accentJournal: "#f59e0b", // amber for journal mode
  green:     "#22c55e",
  red:       "#ef4444",
  yellow:    "#facc15",
  white:     "#ffffff",
};

/* ============================================================
   FIN PARTE 1 — Constantes, Helpers, Stats, Parser NT8, CRUD
   La Parte 2 contendrá los componentes de UI (Login, Sidebar,
   Dashboard, Calendario, etc.)
   ============================================================ */
