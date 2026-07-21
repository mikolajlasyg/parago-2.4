import { useState, useEffect, useMemo, useRef, Component } from "react";
import { createClient } from "@supabase/supabase-js";

/* ---------- Supabase (konta + synchronizacja) ----------
   Bez skonfigurowanych zmiennych środowiskowych aplikacja działa w trybie lokalnym
   (bez logowania), dokładnie jak dotychczas. */
const SUPA_URL = String((typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_URL) || "https://ojmqfxkrnvdxpvnucvlk.supabase.co").trim();
const SUPA_KEY = String((typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) || "sb_publishable_vnaNQ6fjB18w8lKpJD5kIg_hkW4Ik9m").trim();
let supabaseClient = null;
try {
  if (/^https:\/\/[^\s]+$/i.test(SUPA_URL) && SUPA_KEY.length > 10) supabaseClient = createClient(SUPA_URL, SUPA_KEY);
  else if (SUPA_URL || SUPA_KEY) console.error("Paragon AI: nieprawidłowe dane Supabase (URL musi zaczynać się od https:// i nie mieć spacji). Aplikacja działa w trybie lokalnym.");
} catch (e) {
  console.error("Paragon AI: nie udało się połączyć z Supabase — tryb lokalny.", e);
  supabaseClient = null;
}
const supabase = supabaseClient;
const AUTH_ENABLED = !!supabase;

/* ---------- Stripe Payment Links (płatności subskrypcji) ----------
   Wklej linki płatności ze Stripe w zmiennych środowiskowych; brak = płatność symulowana. */
const STRIPE_LINKS = {
  starter: { monthly: (typeof import.meta !== "undefined" && import.meta.env?.VITE_STRIPE_LINK_STARTER) || "", yearly: (typeof import.meta !== "undefined" && import.meta.env?.VITE_STRIPE_LINK_STARTER_Y) || "" },
  pro: { monthly: (typeof import.meta !== "undefined" && import.meta.env?.VITE_STRIPE_LINK_PRO) || "", yearly: (typeof import.meta !== "undefined" && import.meta.env?.VITE_STRIPE_LINK_PRO_Y) || "" },
  family: { monthly: (typeof import.meta !== "undefined" && import.meta.env?.VITE_STRIPE_LINK_FAMILY) || "", yearly: (typeof import.meta !== "undefined" && import.meta.env?.VITE_STRIPE_LINK_FAMILY_Y) || "" },
};

/* ============================================================
   PARAGON AI · v3 "Velvet+"
   Nowości: aparat w aplikacji (getUserMedia), profil, ustawienia,
   plany Starter/Pro/Family z limitami, eksport CSV, trial 14 dni.
   ============================================================ */

const CATEGORIES = [
  { slug: "nabial", name: "Nabiał", icon: "🥛", color: "#5BB8E8" },
  { slug: "mieso", name: "Mięso i wędliny", icon: "🥩", color: "#E87E7E" },
  { slug: "pieczywo", name: "Pieczywo", icon: "🥖", color: "#D9A968" },
  { slug: "owoce_warzywa", name: "Owoce i warzywa", icon: "🥦", color: "#7FC97F" },
  { slug: "slodycze", name: "Słodycze i przekąski", icon: "🍫", color: "#BC85D4" },
  { slug: "napoje", name: "Napoje", icon: "🥤", color: "#54CBDC" },
  { slug: "alkohol", name: "Alkohol", icon: "🍺", color: "#EFB45C" },
  { slug: "jedzenie_inne", name: "Jedzenie — inne", icon: "🍝", color: "#A8CB6E" },
  { slug: "chemia", name: "Chemia domowa", icon: "🧴", color: "#8490DC" },
  { slug: "kosmetyki", name: "Kosmetyki i higiena", icon: "🧼", color: "#EC86B2" },
  { slug: "leki", name: "Apteka i zdrowie", icon: "💊", color: "#5FC6B5" },
  { slug: "dziecko", name: "Dziecko", icon: "🍼", color: "#F0D169" },
  { slug: "zwierzeta", name: "Zwierzęta", icon: "🐾", color: "#B0917D" },
  { slug: "paliwo", name: "Paliwo i auto", icon: "⛽", color: "#93A6B2" },
  { slug: "dom_ogrod", name: "Dom i ogród", icon: "🛠️", color: "#A07D6C" },
  { slug: "odziez", name: "Odzież i obuwie", icon: "👕", color: "#A189DB" },
  { slug: "elektronika", name: "Elektronika", icon: "🔌", color: "#6FA8EC" },
  { slug: "inne", name: "Inne", icon: "📦", color: "#A8B4BB" },
];
const catBySlug = (s) => CATEGORIES.find((c) => c.slug === s) || CATEGORIES[17];

const STORE_GROUPS = [
  { label: "🛒 Dyskonty i supermarkety", stores: ["Biedronka", "Lidl", "Aldi", "Netto", "Dino", "Kaufland", "Auchan", "Carrefour", "E.Leclerc", "Intermarché", "Stokrotka", "Polomarket", "Lewiatan", "Społem"] },
  { label: "🏪 Sklepy osiedlowe", stores: ["Żabka", "Carrefour Express", "Delikatesy Centrum", "ABC", "Freshmarket"] },
  { label: "🧴 Drogerie i apteki", stores: ["Rossmann", "Hebe", "dm", "Super-Pharm", "Apteka"] },
  { label: "⛽ Stacje paliw", stores: ["Orlen", "BP", "Shell", "Circle K", "Moya", "Amic"] },
  { label: "👕 Odzież i obuwie", stores: ["Pepco", "Sinsay", "Reserved", "H&M", "Zara", "House", "Cropp", "C&A", "KiK", "CCC", "Deichmann", "4F", "Decathlon"] },
  { label: "📺 Elektronika i AGD", stores: ["Media Expert", "RTV Euro AGD", "Media Markt", "x-kom", "Komputronik"] },
  { label: "🏠 Dom i budowlane", stores: ["IKEA", "Jysk", "Action", "Pepco Home", "TEDi", "Dealz", "Leroy Merlin", "Castorama", "OBI", "Bricomarché"] },
  { label: "🍔 Jedzenie na mieście", stores: ["McDonald's", "KFC", "Burger King", "Restauracja", "Kawiarnia", "Pizzeria"] },
  { label: "🧸 Inne", stores: ["Empik", "Smyk", "Maxi Zoo", "Poczta / Paczkomat", "Inny sklep"] },
];
const STORES = STORE_GROUPS.flatMap((g) => g.stores);
const MONTHS_PL = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
const MONTHS_SHORT = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];

const PLANS = [
  { id: "free", name: "Free", price: "0", limit: 5, tagline: "Na start",
    features: ["5 skanów AI miesięcznie", "Ręczne dodawanie bez limitu", "Pulpit i analiza miesięczna", "1 konto"] },
  { id: "starter", name: "Starter", price: "9,99", limit: 30, tagline: "Na początek",
    features: ["30 skanów AI miesięcznie", "Cele oszczędnościowe (skarbonki)", "Historia i wyszukiwarka paragonów", "1 konto"] },
  { id: "pro", name: "Pro", price: "19,99", limit: null, tagline: "Najpopularniejszy",
    features: ["Wszystko ze Startera", "Paragony bez limitu", "Lista zakupów z Twojej historii", "Budżety kategorii + eksport CSV"] },
  { id: "family", name: "Family", price: "29,99", limit: null, tagline: "Dla domu",
    features: ["Wszystko z planu Pro", "Do 5 kont domowników", "Wspólne cele i lista zakupów", "Podział wydatków na osoby"] },
];

const zl = (n) => (Number(n) || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";
const num = (n) => (Number(n) || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthKey = (d) => (d || "").slice(0, 7);
const todayKey = () => new Date().toISOString().slice(0, 10);
const nowMonth = () => todayKey().slice(0, 7);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* Pamięć trwała: w podglądzie Claude działa window.storage; poza nim (Vercel) localStorage. */
const store = {
  async get(key) {
    try {
      if (typeof window !== "undefined" && window.storage && typeof window.storage.get === "function") {
        return await window.storage.get(key);
      }
    } catch (e) { /* fallback niżej */ }
    try {
      const v = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
      return v != null ? { value: v } : null;
    } catch (e) { return null; }
  },
  async set(key, value) {
    try {
      if (typeof window !== "undefined" && window.storage && typeof window.storage.set === "function") {
        return await window.storage.set(key, value);
      }
    } catch (e) { /* fallback niżej */ }
    try { if (typeof localStorage !== "undefined") localStorage.setItem(key, value); } catch (e) { /* brak miejsca */ }
  },
};

function fmtDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return `${day} ${MONTHS_SHORT[(m || 1) - 1]} ${y}`;
}
function monthLabel(mk) { const [y, m] = mk.split("-").map(Number); return `${MONTHS_PL[(m || 1) - 1]} ${y}`; }
function shiftMonth(mk, delta) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function daysInMonth(mk) { const [y, m] = mk.split("-").map(Number); return new Date(y, m, 0).getDate(); }

/* ---------- tokeny ---------- */
const T = {
  bg: "var(--c-bg)", glass: "var(--c-glass)", glassBorder: "var(--c-glassBorder)",
  glassBorderSoft: "var(--c-glassBorderSoft)", mint: "#2DD4A0", mintDeep: "#16916B",
  gold: "#D8B878", paper: "#FAF7F0", paperInk: "#1C2620", paperSub: "#8A938C",
  text: "var(--c-text)", sub: "var(--c-sub)", faint: "var(--c-faint)", danger: "#E6766D", warn: "#E5C46B",
  surface: "var(--c-surface)",
  easeOut: "cubic-bezier(0.23, 1, 0.32, 1)",
};
const TIER_BADGE = {
  free: { label: "FREE", color: "#9FB3A9" },
  starter: { label: "STARTER", color: "#A8B8C2" },
  pro: { label: "PRO", color: T.mint },
  family: { label: "FAMILY", color: T.gold },
};
const MEMBER_COLORS = ["#2DD4A0", "#D8B878", "#5BB8E8", "#EC86B2", "#A189DB"];
const BUDGET_CATS = ["nabial", "mieso", "jedzenie_inne", "chemia", "kosmetyki", "napoje"];

/* ---------- przykładowe dane ---------- */
function demoReceipts() {
  const dayOffset = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const R = (date, store, items) => ({
    id: uid(), store, date, sample: true, // dane pokazowe — nie liczą się do osiągnięć
    items: items.map(([name, total_price, category, qty = 1]) => ({ id: uid(), name, qty, total_price, category })),
    total: Math.round(items.reduce((s, i) => s + i[1], 0) * 100) / 100, createdAt: Date.now(),
  });
  // Produkty z powtarzalnym rytmem — daty liczone względem DZIŚ, by "Lista zakupów" miała dane.
  // Mleko ~co 4 dni (ostatnio 5 dni temu → pora dokupić). Chleb ~co 3 dni (ostatnio 4 dni temu → pora).
  // Kawa ~co 7 dni (ostatnio 6 dni temu → niedługo). Karma kota ~co 14 dni (ostatnio 13 dni temu → pora).
  return [
    R(dayOffset(4), "Biedronka", [["Mleko Łaciate 3,2% 1L", 4.29, "nabial", 2], ["Chleb wiejski krojony", 5.49, "pieczywo"], ["Masło ekstra 82%", 7.99, "nabial"], ["Pomidory malinowe", 9.98, "owoce_warzywa"]]),
    R(dayOffset(5), "Żabka", [["Bułka kajzerka ×4", 2.99, "pieczywo"], ["Coca-Cola 1,5L", 8.99, "napoje"]]),
    R(dayOffset(6), "Lidl", [["Kawa Lavazza mielona 250g", 21.99, "napoje"], ["Jogurt Pilos 4-pak", 6.49, "nabial"], ["Filet z piersi kurczaka", 14.67, "mieso"], ["Banany luz 0,82kg", 5.43, "owoce_warzywa"]]),
    R(dayOffset(8), "Biedronka", [["Mleko Łaciate 3,2% 1L", 4.29, "nabial", 2], ["Chleb wiejski krojony", 5.49, "pieczywo"], ["Ser Gouda w plastrach", 7.99, "nabial"]]),
    R(dayOffset(11), "Kaufland", [["Mleko Łaciate 3,2% 1L", 4.19, "nabial"], ["Chleb wiejski krojony", 5.29, "pieczywo"], ["Karma Whiskas ×12", 32.99, "zwierzeta"], ["Papier toaletowy 8 rolek", 12.99, "chemia"]]),
    R(dayOffset(13), "Lidl", [["Kawa Lavazza mielona 250g", 22.49, "napoje"], ["Jogurt Pilos 4-pak", 6.49, "nabial"], ["Masło ekstra 82%", 8.19, "nabial"]]),
    R(dayOffset(15), "Biedronka", [["Mleko Łaciate 3,2% 1L", 4.29, "nabial"], ["Chleb wiejski krojony", 5.49, "pieczywo"], ["Schab b/k ok. 0,75kg", 18.74, "mieso"], ["Czekolada Milka mleczna", 6.49, "slodycze"]]),
    R(dayOffset(18), "Rossmann", [["Szampon Head & Shoulders", 19.99, "kosmetyki"], ["Pasta Colgate Total", 8.49, "kosmetyki"], ["Płyn do naczyń Fairy", 9.99, "chemia"]]),
    R(dayOffset(20), "Lidl", [["Mleko Łaciate 3,2% 1L", 4.19, "nabial"], ["Kawa Lavazza mielona 250g", 21.99, "napoje"], ["Jogurt Pilos 4-pak", 6.29, "nabial"], ["Piwo Perła Export 4-pak", 14.96, "alkohol"]]),
    R(dayOffset(25), "Kaufland", [["Karma Whiskas ×12", 32.49, "zwierzeta"], ["Mleko Łaciate 3,2% 1L", 4.29, "nabial"], ["Chleb wiejski krojony", 5.29, "pieczywo"], ["Jabłka Ligol 1,2kg", 6.78, "owoce_warzywa"]]),
    R(dayOffset(28), "Orlen", [["Paliwo PB95 32,4L", 198.5, "paliwo"], ["Kawa latte z automatu", 9.99, "napoje"]]),
  ];
}

/* ---------- obraz: skalowanie ---------- */
async function dataUrlScaled(dataUrl, maxSide = 1568) {
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Nie udało się otworzyć zdjęcia"));
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL("image/jpeg", 0.85);
  return { base64: out.split(",")[1], mediaType: "image/jpeg", preview: out };
}
async function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("Nie udało się odczytać pliku"));
    r.readAsDataURL(file);
  });
}

/* ---------- analiza powtarzalnych zakupów (Pro+) ---------- */
const normName = (s) => (s || "").toLowerCase().trim()
  .replace(/\d+([.,]\d+)?\s?(kg|g|l|ml|szt|x|%)\b/gi, "")
  .replace(/[.,;:()]/g, " ").replace(/\s+/g, " ").trim();
function analyzeRecurring(receipts) {
  const map = {};
  receipts.forEach((r) => {
    const day = r.date;
    if (!day) return;
    r.items.forEach((i) => {
      if (i.name === "Wydatek ręczny") return;
      const key = normName(i.name);
      if (key.length < 3) return;
      const e = map[key] = map[key] || { key, name: i.name, category: i.category, dates: [], lastPrice: 0, totalSpent: 0, times: 0 };
      e.dates.push(day); e.times += 1; e.totalSpent += Number(i.total_price) || 0;
      if (day >= (e.lastDay || "")) { e.lastDay = day; e.lastPrice = Number(i.total_price) || 0; e.name = i.name; }
    });
  });
  const today = new Date(todayKey());
  const out = [];
  Object.values(map).forEach((e) => {
    if (e.times < 2) return; // potrzebujemy min. 2 zakupów, by mówić o cyklu
    const sorted = [...new Set(e.dates)].sort();
    let gaps = [];
    for (let k = 1; k < sorted.length; k++) {
      const d = (new Date(sorted[k]) - new Date(sorted[k - 1])) / 864e5;
      if (d > 0) gaps.push(d);
    }
    if (!gaps.length) return;
    const avgGap = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
    const sinceLast = Math.round((today - new Date(e.lastDay)) / 864e5);
    const ratio = avgGap > 0 ? sinceLast / avgGap : 0;
    out.push({ ...e, avgGap, sinceLast, ratio, due: ratio >= 0.8 });
  });
  return out.sort((a, b) => b.ratio - a.ratio);
}

/* Cykliczne opłaty (subskrypcje): pozycje o stałej kwocie wracające co ~miesiąc */
function analyzeSubscriptions(receipts) {
  const map = {};
  receipts.forEach((r) => {
    const day = r.date;
    if (!day) return;
    r.items.forEach((i) => {
      const price = Number(i.total_price) || 0;
      if (price <= 0) return;
      const key = normName(i.name);
      if (key.length < 3) return;
      const e = map[key] = map[key] || { key, name: i.name, prices: [], dates: [], category: i.category || "inne" };
      e.prices.push(price); e.dates.push(day);
      if (day >= (e.lastDay || "")) { e.lastDay = day; e.name = i.name; }
    });
  });
  const out = [];
  Object.values(map).forEach((e) => {
    const dates = [...new Set(e.dates)].sort();
    if (dates.length < 2) return;
    let gaps = [];
    for (let k = 1; k < dates.length; k++) gaps.push((new Date(dates[k]) - new Date(dates[k - 1])) / 864e5);
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (avgGap < 24 || avgGap > 38) return; // tylko cykl ~miesięczny
    const avgPrice = e.prices.reduce((a, b) => a + b, 0) / e.prices.length;
    const maxDev = Math.max(...e.prices.map((p) => Math.abs(p - avgPrice)));
    if (avgPrice <= 0 || maxDev / avgPrice > 0.15) return; // kwota musi być stała (±15%)
    out.push({ key: e.key, name: e.name, category: e.category, avgPrice: Math.round(avgPrice * 100) / 100, times: e.prices.length, lastDay: e.lastDay });
  });
  return out.sort((a, b) => b.avgPrice - a.avgPrice);
}
function cycleLabel(avgGap) {
  if (avgGap <= 2) return "co 1–2 dni";
  if (avgGap <= 4) return "co kilka dni";
  if (avgGap <= 9) return "co tydzień";
  if (avgGap <= 18) return "co ~2 tygodnie";
  if (avgGap <= 45) return "co miesiąc";
  return `co ~${Math.round(avgGap / 30)} mies.`;
}

/* Plan odkładania na cel z datą docelową */
function goalPace(goal) {
  if (!goal.deadline) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(goal.deadline); end.setHours(0, 0, 0, 0);
  const remaining = Math.max((Number(goal.target) || 0) - (Number(goal.saved) || 0), 0);
  const daysLeft = Math.round((end - today) / 864e5);
  const done = (Number(goal.saved) || 0) >= (Number(goal.target) || 0);
  if (done) return { done: true, daysLeft, status: "done" };
  const overdue = daysLeft < 0;
  const monthsLeft = Math.max(daysLeft / 30.44, 0);
  const perMonth = monthsLeft > 0.03 ? remaining / monthsLeft : remaining;
  const perWeek = daysLeft > 0 ? remaining / (daysLeft / 7) : remaining;
  let status = "ontrack";
  if (overdue) status = "overdue";
  else if (daysLeft <= 7 && remaining > (Number(goal.target) || 1) * 0.15) status = "behind";
  return { done: false, daysLeft, monthsLeft, perMonth: Math.round(perMonth * 100) / 100, perWeek: Math.round(perWeek * 100) / 100, remaining, overdue, status };
}
function deadlineLabel(deadline) {
  if (!deadline) return "";
  const [y, m, d] = deadline.split("-").map(Number);
  return `${d} ${["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"][(m || 1) - 1]} ${y}`;
}

/* Seria dni (streak): ile dni z rzędu dodano co najmniej 1 paragon (po dacie DODANIA) */
/* ---------- OSIĄGNIĘCIA (kamienie milowe z nagrodami) ----------
   Postęp liczony wprost z danych; nagrody-skany odbierane kliknięciem. */
const ACHIEVEMENTS = [
  { id: "first-scan", emoji: "🌱", title: "Pierwszy krok", desc: "Dodaj swój pierwszy paragon.", metric: "receipts", target: 1, reward: 3, xp: 10 , cat: "scans" },
  { id: "scans-10", emoji: "📄", title: "Dziesiątka", desc: "10 paragonów w aplikacji.", metric: "receipts", target: 10, reward: 3, xp: 15 , cat: "scans" },
  { id: "scans-25", emoji: "🗂️", title: "Kolekcjoner", desc: "25 paragonów w aplikacji.", metric: "receipts", target: 25, reward: 4, xp: 25 , cat: "scans" },
  { id: "scans-50", emoji: "📚", title: "Archiwista", desc: "50 paragonów w aplikacji.", metric: "receipts", target: 50, reward: 0, xp: 40 , cat: "scans" },
  { id: "scans-100", emoji: "💯", title: "Setka!", desc: "100 paragonów — pełna kontrola wydatków.", metric: "receipts", target: 100, reward: 0, xp: 80, proDays: 3, titleReward: true , cat: "scans" },
  { id: "scans-250", emoji: "🏛️", title: "Skarbnik", desc: "250 paragonów w historii.", metric: "receipts", target: 250, reward: 0, xp: 140, proDays: 5 , cat: "scans" },
  { id: "scans-500", emoji: "🗿", title: "Legenda paragonów", desc: "500 paragonów. Szacunek.", metric: "receipts", target: 500, reward: 0, xp: 220, proDays: 14, titleReward: true , cat: "scans" },
  { id: "streak-3", emoji: "🔥", title: "Rozgrzewka", desc: "3 dni skanowania z rzędu.", metric: "streak", target: 3, reward: 0, xp: 15 , cat: "streak" },
  { id: "streak-7", emoji: "⚡", title: "Tydzień mocy", desc: "7 dni skanowania z rzędu.", metric: "streak", target: 7, reward: 0, xp: 30 , cat: "streak" },
  { id: "streak-14", emoji: "🌟", title: "Dwa tygodnie", desc: "14 dni skanowania z rzędu.", metric: "streak", target: 14, reward: 0, xp: 60 , cat: "streak" },
  { id: "streak-30", emoji: "🚀", title: "Miesiąc żelaznej rutyny", desc: "30 dni skanowania z rzędu.", metric: "streak", target: 30, reward: 0, xp: 120, proDays: 7, titleReward: true , cat: "streak" },
  { id: "goal-first", emoji: "🎯", title: "Marzyciel", desc: "Załóż pierwszy cel oszczędnościowy.", metric: "goals", target: 1, reward: 0, xp: 15 , cat: "goals" },
  { id: "goal-done", emoji: "🏝️", title: "Spełniacz marzeń", desc: "Ukończ pierwszy cel oszczędnościowy.", metric: "goalsDone", target: 1, reward: 0, xp: 50 , cat: "goals" },
  { id: "goals-done-3", emoji: "🌈", title: "Seryjny spełniacz", desc: "Ukończ 3 cele oszczędnościowe.", metric: "goalsDone", target: 3, reward: 0, xp: 100, proDays: 3 , cat: "goals" },
  { id: "saved-100", emoji: "🐷", title: "Pierwsza stówka", desc: "Odłóż łącznie 100 zł na cele.", metric: "saved", target: 100, reward: 0, xp: 20 , cat: "goals" },
  { id: "saved-1000", emoji: "💰", title: "Tysiąc w skarbonce", desc: "Odłóż łącznie 1 000 zł na cele.", metric: "saved", target: 1000, reward: 0, xp: 60 , cat: "goals" },
  { id: "saved-5000", emoji: "🏦", title: "Prywatny bank", desc: "Odłóż łącznie 5 000 zł na cele.", metric: "saved", target: 5000, reward: 0, xp: 150, proDays: 5, titleReward: true , cat: "goals" },
  { id: "challenge-1", emoji: "🥇", title: "Pierwsza wygrana", desc: "Wygraj pierwsze wyzwanie.", metric: "challengesWon", target: 1, reward: 0, xp: 25 , cat: "challenges" },
  { id: "challenges-5", emoji: "🏆", title: "Pogromca wyzwań", desc: "Wygraj 5 wyzwań.", metric: "challengesWon", target: 5, reward: 0, xp: 70 , cat: "challenges" },
  { id: "explorer", emoji: "🧭", title: "Odkrywca kategorii", desc: "Zakupy w 8 różnych kategoriach.", metric: "categories", target: 8, reward: 0, xp: 30 , cat: "explore" },
  { id: "stores-5", emoji: "🏪", title: "Obieżysklep", desc: "Paragony z 5 różnych sklepów.", metric: "stores", target: 5, reward: 0, xp: 25 , cat: "explore" },
  { id: "stores-10", emoji: "🏙️", title: "Zdobywca miasta", desc: "Paragony z 10 różnych sklepów.", metric: "stores", target: 10, reward: 0, xp: 60 , cat: "explore" },
  { id: "cats-12", emoji: "🗺️", title: "Kartograf", desc: "Zakupy w 12 różnych kategoriach.", metric: "categories", target: 12, reward: 0, xp: 50 , cat: "explore" },
  { id: "night-owl", emoji: "🦉", title: "Nocny Marek", desc: "Dodaj paragon między 22:00 a 5:00.", metric: "nightScans", target: 1, reward: 0, xp: 20 , cat: "secret", secret: true },
  { id: "early-bird", emoji: "🐓", title: "Ranny ptaszek", desc: "Dodaj paragon przed 7:00 rano.", metric: "earlyScans", target: 1, reward: 0, xp: 20 , cat: "secret", secret: true },
  { id: "big-fish", emoji: "🐋", title: "Gruby paragon", desc: "Jeden paragon na co najmniej 300 zł.", metric: "maxReceipt", target: 300, reward: 0, xp: 25 , cat: "scans" },
  { id: "mega-fish", emoji: "🦈", title: "Rekin zakupów", desc: "Jeden paragon na co najmniej 1 000 zł.", metric: "maxReceipt", target: 1000, reward: 0, xp: 50 , cat: "secret", secret: true },
  { id: "tiny", emoji: "🐜", title: "Drobnica", desc: "Paragon za maksymalnie 5 zł. Liczy się każdy grosz!", metric: "hasTiny", target: 1, reward: 0, xp: 15 , cat: "secret", secret: true },
  { id: "day-5", emoji: "🌪️", title: "Maraton zakupowy", desc: "5 paragonów jednego dnia.", metric: "maxPerDay", target: 5, reward: 0, xp: 30 , cat: "secret", secret: true },
  { id: "weekend-10", emoji: "🛋️", title: "Weekendowicz", desc: "10 paragonów z sobót i niedziel.", metric: "weekendCount", target: 10, reward: 0, xp: 25 , cat: "secret", secret: true },
  { id: "months-3", emoji: "📆", title: "Stały bywalec", desc: "Paragony w 3 różnych miesiącach.", metric: "monthsActive", target: 3, reward: 0, xp: 50 , cat: "streak" },
  { id: "months-6", emoji: "🎗️", title: "Weteran", desc: "Paragony w 6 różnych miesiącach.", metric: "monthsActive", target: 6, reward: 0, xp: 110, proDays: 3, titleReward: true , cat: "streak" },
  { id: "total-10k", emoji: "💸", title: "Dziesięć koła", desc: "Łączna wartość paragonów: 10 000 zł.", metric: "allTotal", target: 10000, reward: 0, xp: 90 , cat: "scans" },
  { id: "scan-master", emoji: "📷", title: "Snajper skanera", desc: "50 paragonów dodanych skanem AI.", metric: "scannedCount", target: 50, reward: 0, xp: 60 , cat: "scans" },
  { id: "scribe", emoji: "✍️", title: "Skryba", desc: "20 wydatków dodanych ręcznie.", metric: "manualCount", target: 20, reward: 0, xp: 30 , cat: "scans" },
  { id: "profile-done", emoji: "🪪", title: "Osobowość", desc: "Uzupełnij imię i e-mail w profilu.", metric: "profileComplete", target: 1, reward: 0, xp: 15 , cat: "explore" },
  { id: "challenges-10", emoji: "🛡️", title: "Niezłomny", desc: "Wygraj 10 wyzwań.", metric: "challengesWon", target: 10, reward: 0, xp: 130, proDays: 5, titleReward: true , cat: "challenges" },
  { id: "master-crown", emoji: "👑", title: "Korona Mistrza", desc: "Odbierz wszystkie pozostałe osiągnięcia. Absolutny szczyt.", metric: "master", target: 0, reward: 0, xp: 300, proDays: 30, titleReward: true , cat: "master" },
];
const LEVELS = [
  { xp: 0, name: "Nowicjusz" },
  { xp: 40, name: "Zbieracz", scans: 2 },
  { xp: 100, name: "Odkrywca" },
  { xp: 180, name: "Bywalec", scans: 2 },
  { xp: 280, name: "Łowca Okazji", title: "Łowca Okazji" },
  { xp: 400, name: "Znawca" },
  { xp: 540, name: "Kasjer Domowy", scans: 3 },
  { xp: 700, name: "Analityk" },
  { xp: 880, name: "Strateg" },
  { xp: 1080, name: "Mistrz Paragonów", proDays: 1, title: "Mistrz Paragonów" },
  { xp: 1300, name: "Skarbnik" },
  { xp: 1540, name: "Ekspert" },
  { xp: 1800, name: "Rachmistrz", scans: 3 },
  { xp: 2080, name: "Wirtuoz" },
  { xp: 2380, name: "Guru Budżetu", proDays: 2, title: "Guru Budżetu" },
  { xp: 2700, name: "Ekonomista" },
  { xp: 3040, name: "Inspektor Cen" },
  { xp: 3400, name: "Architekt Oszczędności" },
  { xp: 3780, name: "Wilk Zakupowy" },
  { xp: 4180, name: "Legenda", proDays: 3, title: "Legenda Paragonów" },
  { xp: 4600, name: "Alchemik Finansów" },
  { xp: 5040, name: "Kanclerz Skarbu" },
  { xp: 5500, name: "Tytan" },
  { xp: 5980, name: "Wyrocznia Wydatków" },
  { xp: 6480, name: "Hegemon Budżetu", proDays: 4, title: "Hegemon Budżetu" },
  { xp: 7000, name: "Imperator Oszczędności" },
  { xp: 7600, name: "Strażnik Fortuny" },
  { xp: 8300, name: "Arcymistrz" },
  { xp: 9100, name: "Nieśmiertelny" },
  { xp: 10000, name: "Absolut", proDays: 7, title: "Absolut" },
];
const relTime = (ts) => {
  if (!ts) return "wcześniej";
  const d = Math.floor((Date.now() - ts) / 864e5);
  if (d <= 0) return "dziś";
  if (d === 1) return "wczoraj";
  if (d < 30) return `${d} dni temu`;
  return new Date(ts).toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
};
const levelOf = (xp) => { let i = 0; for (let k = 0; k < LEVELS.length; k++) if (xp >= LEVELS[k].xp) i = k; return i; };
const ACH_TIERS = {
  bronze: { name: "Brąz", color: "#C08552" },
  silver: { name: "Srebro", color: "#AEBCC6" },
  gold: { name: "Złoto", color: "#D8B878" },
  legend: { name: "Legenda", color: "#A189DB" },
};
/* ---------- seria dni: progi i korzyści ---------- */
const STREAK_TIERS = [
  { d: 0,   name: "Rozgrzewka", emoji: "·",   mult: 1,   c: "#5E7268" },
  { d: 3,   name: "Iskra",      emoji: "✨",  mult: 1.2, c: "#E5C46B" },
  { d: 7,   name: "Płomień",    emoji: "🔥",  mult: 1.5, c: "#F2A65A" },
  { d: 14,  name: "Ognisko",    emoji: "🔥",  mult: 1.8, c: "#EE8B4F" },
  { d: 30,  name: "Pożar",      emoji: "🌋",  mult: 2.2, c: "#E6766D" },
  { d: 60,  name: "Wulkan",     emoji: "🌋",  mult: 2.6, c: "#D8628F" },
  { d: 100, name: "Słońce",     emoji: "☀️",  mult: 3,   c: "#D8B878" },
];
const streakTier = (n) => STREAK_TIERS.slice().reverse().find((t) => n >= t.d) || STREAK_TIERS[0];
const streakNext = (n) => STREAK_TIERS.find((t) => t.d > n) || null;
/* jednorazowe prezenty za kamienie milowe serii */
const STREAK_GIFTS = {
  7:   { seeds: 50,  msg: "Tydzień bez przerwy!" },
  14:  { freeze: 1,  msg: "Dwa tygodnie — ochrona serii w prezencie" },
  30:  { proDays: 1, seeds: 100, msg: "Miesiąc z rzędu — szacunek!" },
  60:  { seeds: 300, freeze: 1, msg: "Dwa miesiące — jesteś maszyną" },
  100: { proDays: 3, title: "Niezłomny", msg: "STO DNI. Legenda." },
};

/* ---------- ekonomia: Ziarna 🌱 ---------- */
const SEED_SCAN = 2;            // za zeskanowany paragon
const SEED_CHALLENGE = 40;      // za wygrane wyzwanie
const SEED_WEEK_BUDGET = 25;    // za tydzień zamknięty pod budżetem — GŁÓWNE źródło
const SEED_BY_TIER = { bronze: 10, silver: 20, gold: 35, legend: 50 };
const SHOP = [
  { id: "freeze", ico: "🧊", name: "Ochrona serii", desc: "Jeden dzień przerwy nie zerwie passy. Zużywa się sama.", cost: 60, max: 2 },
  { id: "scans5", ico: "📷", name: "+5 skanów AI", desc: "Doładowanie na ten miesiąc.", cost: 80 },
  { id: "pro1", ico: "👑", name: "1 dzień Pro", desc: "Pełne możliwości na dobę.", cost: 150 },
  { id: "pro7", ico: "👑", name: "7 dni Pro", desc: "Tydzień bez limitów — najlepszy stosunek.", cost: 800, best: true },
  { id: "theme-gold", ico: "🏆", name: "Motyw: Złoty zmierzch", desc: "Ciepła, złota paleta.", cost: 200, theme: true },
  { id: "theme-navy", ico: "🌌", name: "Motyw: Nocny granat", desc: "Głęboki granat z błękitem.", cost: 200, theme: true },
];

const achTier = (a) => (a.id === "master-crown" || (a.proDays || 0) >= 14 ? "legend" : (a.proDays || 0) > 0 || (a.xp || 0) >= 80 ? "gold" : (a.xp || 0) >= 30 ? "silver" : "bronze");
const ACH_CATS = [
  { key: "scans", label: "Paragony", emoji: "🧾" },
  { key: "streak", label: "Systematyczność", emoji: "🔥" },
  { key: "goals", label: "Cele i oszczędności", emoji: "🎯" },
  { key: "challenges", label: "Wyzwania", emoji: "🏆" },
  { key: "explore", label: "Odkrywanie", emoji: "🧭" },
  { key: "secret", label: "Sekretne", emoji: "🔮" },
];

function achMetrics(receipts, goals, challenges, streak, profile) {
  const cats = new Set(); const stores = new Set(); const months = new Set(); const perDay = {};
  let night = 0, early = 0, maxR = 0, hasTiny = 0, weekend = 0, scanned = 0, manual = 0, allT = 0;
  receipts.forEach((r) => {
    if (r.store) stores.add(r.store.toLowerCase().trim());
    r.items.forEach((i) => { if ((Number(i.total_price) || 0) > 0) cats.add(i.category || "inne"); });
    const tot = Number(r.total) || 0;
    allT += tot;
    if (tot > maxR) maxR = tot;
    if (tot > 0 && tot <= 5) hasTiny = 1;
    if (r.date) {
      months.add(r.date.slice(0, 7));
      perDay[r.date] = (perDay[r.date] || 0) + 1;
      const dow = new Date(r.date + "T12:00:00").getDay();
      if (dow === 0 || dow === 6) weekend++;
    }
    if (r.createdAt) { const h = new Date(r.createdAt).getHours(); if (h >= 22 || h < 5) night++; else if (h < 7) early++; }
    if (r.scanned) scanned++; else manual++;
  });
  return {
    nightScans: night, earlyScans: early, maxReceipt: maxR, hasTiny,
    maxPerDay: Math.max(0, ...Object.values(perDay)), weekendCount: weekend,
    monthsActive: months.size, allTotal: Math.floor(allT), scannedCount: scanned, manualCount: manual,
    profileComplete: profile && profile.name && profile.email ? 1 : 0,
    receipts: receipts.length,
    streak,
    goals: goals.length,
    goalsDone: goals.filter((g) => (Number(g.saved) || 0) >= (Number(g.target) || Infinity)).length,
    saved: goals.reduce((s, g) => s + (Number(g.saved) || 0), 0),
    challengesWon: challenges.filter((c) => c.status === "won").length,
    categories: cats.size,
    stores: stores.size,
  };
}

/* ---------- WYZWANIA OSZCZĘDNOŚCIOWE ----------
   Tygodniowe wyzwania weryfikowane automatycznie z paragonów. */
const CHALLENGE_TPLS = [
  { id: "no-sweets", emoji: "🍬", title: "Tydzień bez słodyczy", desc: "Przez 7 dni żadnej pozycji ze słodyczy na paragonach.", type: "no_category", category: "slodycze", days: 7, badge: "Cukrowy Detoks" },
  { id: "no-alcohol", emoji: "🍺", title: "Tydzień bez alkoholu", desc: "7 dni bez alkoholu na paragonach — zdrowie i portfel dziękują.", type: "no_category", category: "alkohol", days: 7, badge: "Czysty Umysł" },
  { id: "no-sweet-drinks", emoji: "🥤", title: "Bez napojów przez 5 dni", desc: "5 dni bez kupowania napojów — woda z kranu wygrywa.", type: "no_category", category: "napoje", days: 5, badge: "Kranówka Master" },
  { id: "limit-sweets", emoji: "🍫", title: "Słodycze max 25 zł", desc: "Nie przekrocz 25 zł na słodycze przez 7 dni.", type: "limit_category", category: "slodycze", limit: 25, days: 7, badge: "Słodka Dyscyplina" },
  { id: "limit-alcohol", emoji: "🍷", title: "Alkohol max 50 zł", desc: "Utrzymaj wydatki na alkohol poniżej 50 zł przez 7 dni.", type: "limit_category", category: "alkohol", limit: 50, days: 7, badge: "Złoty Umiar" },
  { id: "no-spend-2", emoji: "🧘", title: "2 dni bez wydatków", desc: "W ciągu 7 dni znajdź 2 dni całkowicie bez zakupów.", type: "no_spend_days", target: 2, days: 7, badge: "Mistrz Zen" },
  { id: "no-spend-3", emoji: "🏜️", title: "3 dni bez wydatków", desc: "Aż 3 dni bez żadnego paragonu w ciągu tygodnia. Da się!", type: "no_spend_days", target: 3, days: 7, badge: "Pustynny Wędrowiec" },
  { id: "daily-60", emoji: "🎯", title: "Dzień poniżej 60 zł", desc: "Każdego dnia przez 5 dni wydawaj mniej niż 60 zł.", type: "daily_under", limit: 60, days: 5, badge: "Snajper Budżetu" },
  { id: "daily-40", emoji: "🥷", title: "Dzień poniżej 40 zł", desc: "Hardkor: 5 dni z rzędu poniżej 40 zł dziennie.", type: "daily_under", limit: 40, days: 5, badge: "Ninja Oszczędzania" },
  { id: "scan-5", emoji: "📸", title: "Skanuj 5 dni z rzędu", desc: "Dodawaj co najmniej 1 paragon dziennie przez 5 dni.", type: "scan_streak", target: 5, days: 5, badge: "Kronikarz" },
  { id: "scan-7", emoji: "🗓️", title: "Pełny tydzień skanowania", desc: "7 dni z rzędu z co najmniej 1 paragonem. Pełna kontrola.", type: "scan_streak", target: 7, days: 7, badge: "Żelazna Rutyna" },
  { id: "limit-fastfood", emoji: "🍔", title: "Jedzenie na mieście max 40 zł", desc: "Gotuj w domu — max 40 zł na jedzenie poza domem przez 7 dni.", type: "limit_category", category: "jedzenie_inne", limit: 40, days: 7, badge: "Szef Kuchni" },
];

/* Ocena wyzwania: zwraca { status: 'active'|'won'|'lost', pct 0..1, label, daysLeft } */
function challengeEval(inst, receipts, todayStr) {
  const tpl = CHALLENGE_TPLS.find((t) => t.id === inst.tplId);
  if (!tpl) return null;
  const start = new Date(inst.startKey); start.setHours(0, 0, 0, 0);
  const today = new Date(todayStr || new Date()); today.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + tpl.days - 1); // ostatni dzień wyzwania
  const dayMs = 864e5;
  const daysElapsed = Math.min(Math.floor((today - start) / dayMs) + 1, tpl.days); // ile dni objętych (łącznie z dziś)
  const daysLeft = Math.max(Math.ceil((end - today) / dayMs), 0);
  const finished = today > end;
  const dayKeyOf = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
  const inRange = (r) => { const d = r.date || ""; return d >= dayKeyOf(start) && d <= dayKeyOf(end); };
  const rs = receipts.filter(inRange);

  if (tpl.type === "no_category") {
    const dirty = rs.some((r) => r.items.some((i) => (i.category || "inne") === tpl.category && (Number(i.total_price) || 0) > 0));
    if (dirty) return { status: "lost", pct: 0, label: "Pojawiły się zakupy z tej kategorii", daysLeft };
    if (finished) return { status: "won", pct: 1, label: "Czysto do końca!", daysLeft: 0 };
    return { status: "active", pct: daysElapsed / tpl.days, label: `${daysElapsed}/${tpl.days} dni czysto`, daysLeft };
  }
  if (tpl.type === "limit_category") {
    const spent = rs.reduce((s, r) => s + r.items.filter((i) => (i.category || "inne") === tpl.category).reduce((a, i) => a + (Number(i.total_price) || 0), 0), 0);
    if (spent > tpl.limit) return { status: "lost", pct: 1, label: `Przekroczono: ${spent.toFixed(2).replace(".", ",")} zł`, daysLeft };
    if (finished) return { status: "won", pct: spent / tpl.limit, label: "Limit utrzymany!", daysLeft: 0 };
    return { status: "active", pct: spent / tpl.limit, label: `${spent.toFixed(2).replace(".", ",")} / ${tpl.limit} zł`, daysLeft, invert: true };
  }
  if (tpl.type === "no_spend_days") {
    const spendDays = new Set(rs.filter((r) => (Number(r.total) || 0) > 0).map((r) => r.date));
    let clean = 0;
    for (let i = 0; i < daysElapsed; i++) { const d = new Date(start); d.setDate(d.getDate() + i); if (!spendDays.has(dayKeyOf(d))) clean++; }
    if (clean >= tpl.target) return { status: "won", pct: 1, label: `${clean} dni bez wydatków!`, daysLeft: 0 };
    const remaining = tpl.days - daysElapsed;
    if (finished || clean + remaining < tpl.target) return { status: finished ? "lost" : "lost", pct: clean / tpl.target, label: "Zabrakło czystych dni", daysLeft };
    return { status: "active", pct: clean / tpl.target, label: `${clean}/${tpl.target} dni bez wydatków`, daysLeft };
  }
  if (tpl.type === "daily_under") {
    const byDay = {};
    rs.forEach((r) => { byDay[r.date] = (byDay[r.date] || 0) + (Number(r.total) || 0); });
    // sprawdzamy tylko dni już MINIONE w całości (dzisiejszy jeszcze trwa — nie przegrywa, chyba że już przekroczony)
    for (let i = 0; i < daysElapsed; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i); const k = dayKeyOf(d);
      const sum = byDay[k] || 0;
      if (sum > tpl.limit) return { status: "lost", pct: i / tpl.days, label: `${k.slice(8)}. dnia: ${sum.toFixed(0)} zł > ${tpl.limit} zł`, daysLeft };
    }
    if (finished) return { status: "won", pct: 1, label: "Każdy dzień w limicie!", daysLeft: 0 };
    return { status: "active", pct: daysElapsed / tpl.days, label: `${daysElapsed}/${tpl.days} dni w limicie`, daysLeft };
  }
  if (tpl.type === "scan_streak") {
    const scanDays = new Set(receipts.map((r) => { const d = new Date(r.createdAt || 0); return d.getTime() > 0 ? dayKeyOf(d) : null; }).filter(Boolean));
    let run = 0;
    for (let i = 0; i < daysElapsed; i++) { const d = new Date(start); d.setDate(d.getDate() + i); if (scanDays.has(dayKeyOf(d))) run++; else if (dayKeyOf(d) !== dayKeyOf(today)) { return { status: "lost", pct: run / tpl.target, label: "Przerwa w skanowaniu", daysLeft }; } }
    if (run >= tpl.target) return { status: "won", pct: 1, label: "Seria zaliczona!", daysLeft: 0 };
    return { status: "active", pct: run / tpl.target, label: `${run}/${tpl.target} dni ze skanem`, daysLeft };
  }
  return null;
}

function computeStreak(receipts, freezeDays = []) {
  const days = new Set(receipts.map((r) => { const d = new Date(r.createdAt || 0); d.setHours(0, 0, 0, 0); return d.getTime(); }).filter((t) => t > 0));
  (freezeDays || []).forEach((t) => { if (t > 0) days.add(t); }); // 🧊 dni uratowane ochroną liczą się do serii
  if (!days.size) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let cursor = today.getTime();
  // seria może zaczynać się dziś albo wczoraj (dziś jeszcze nie skanowałeś = seria trwa)
  if (!days.has(cursor)) cursor -= 864e5;
  let streak = 0;
  while (days.has(cursor)) { streak += 1; cursor -= 864e5; }
  return streak;
}

/* Pełne statystyki miesiąca do podsumowania ("Twój miesiąc w liczbach") */
function computeMonthStats(receipts, mk) {
  const rs = receipts.filter((r) => (r.date || "").slice(0, 7) === mk);
  const total = rs.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const prevMk = (() => { const [y, m] = mk.split("-").map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })();
  const prevTotal = receipts.filter((r) => (r.date || "").slice(0, 7) === prevMk).reduce((s, r) => s + (Number(r.total) || 0), 0);
  const delta = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
  const catMap = {};
  rs.forEach((r) => r.items.forEach((i) => { if ((Number(i.total_price) || 0) > 0) { const cat = i.category || "inne"; catMap[cat] = (catMap[cat] || 0) + Number(i.total_price); } }));
  const cats = Object.entries(catMap).map(([slug, value]) => ({ slug, value })).sort((a, b) => b.value - a.value);
  const storeMap = {};
  rs.forEach((r) => { const s = r.store || "Inny"; storeMap[s] = (storeMap[s] || 0) + (Number(r.total) || 0); });
  const storeVisits = {};
  rs.forEach((r) => { const s = r.store || "Inny"; storeVisits[s] = (storeVisits[s] || 0) + 1; });
  const mostVisited = Object.entries(storeVisits).sort((a, b) => b[1] - a[1])[0];
  const [y, m] = mk.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const isCurrent = mk === new Date().toISOString().slice(0, 7);
  const daysElapsed = isCurrent ? new Date().getDate() : daysInMonth;
  const dailyAvg = daysElapsed > 0 ? total / daysElapsed : 0;
  const biggest = rs.reduce((mx, r) => (Number(r.total) || 0) > (Number(mx?.total) || 0) ? r : mx, null);
  const itemCount = rs.reduce((s, r) => s + r.items.filter((i) => (Number(i.total_price) || 0) > 0).length, 0);
  return { mk, rs, total, prevTotal, delta, cats, mostVisited, dailyAvg, biggest, itemCount, count: rs.length, daysInMonth };
}

/* ---------- parsowanie przez Claude ---------- */
function extractJSON(text) {
  if (!text) return null;
  let t = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(t); } catch (e) { /* próbujemy wyłuskać */ }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch (e) { /* nadal nie */ }
  }
  return null;
}
async function parseReceiptWithAI(base64, mediaType) {
  const slugs = CATEGORIES.map((c) => c.slug).join("|");
  const prompt = `Jesteś precyzyjnym parserem polskich paragonów fiskalnych. Odczytaj zdjęcie i zwróć WYŁĄCZNIE poprawny JSON (bez markdown, bez komentarzy, bez tekstu wokół):
{"store":"<DOKŁADNA nazwa sklepu odczytana z paragonu, np. Biedronka, H&M, Orlen, Carrefour — jeśli nieczytelna, wpisz Inny sklep>","date":"YYYY-MM-DD","total":0.00,"items":[{"name":"nazwa po polsku, czytelna","qty":1,"total_price":0.00,"category":"<slug>"}]}
Dozwolone slugi kategorii: ${slugs}.

KRYTYCZNE ZASADY DOT. RABATÓW I OPUSTÓW (najczęstszy błąd):
- Każdą linię typu "RABAT", "OPUST", "PROMOCJA", "ZNIŻKA", "-X,XX", linie zaczynające się od minusa, lub linie z ujemną kwotą — MUSISZ odjąć od pozycji bezpośrednio powyżej.
- Linia rabatu NIE jest osobną pozycją — NIGDY nie dodawaj jej do "items".
- Przykład: jeśli widzisz "JOGURT 8,99" a linijkę niżej "RABAT -2,00" — w JSON ma być JEDNA pozycja: {"name":"Jogurt","total_price":6.99}, NIE dwie.
- "total" to ostateczna kwota DO ZAPŁATY (linia SUMA/RAZEM/PLN) — po wszystkich rabatach.
- Suma wszystkich items.total_price MUSI być równa polu total (± 0,01 zł). To jest test poprawności — jeśli się nie zgadza, znalazłeś rabat którego nie odjąłeś.

POZOSTAŁE ZASADY:
- Czytaj WSZYSTKIE pozycje, nawet przy słabej jakości zdjęcia.
- Pomiń linie: PTU, SUMA PTU, NIP, numery systemowe, "Niefiskalny", "Reszta", reklamy, "Karta lojalnościowa".
- Rozwiń skróty ("MLEKO ŁAC.UHT 3,2%" → "Mleko Łaciate UHT 3,2%").
- Kwoty z przecinkiem zamień na kropkę.
- Jeśli daty nie widać, ustaw "date": null.
- Jeśli na zdjęciu NIE ma paragonu/rachunku, zwróć dokładnie {"error":"not_receipt"}.`;

  // Klucz Groq z env (Vite). NIGDY nie wpisuj klucza na sztywno w kodzie.
  const apiKey = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_GROQ_API_KEY) || (typeof window !== "undefined" && window.GROQ_API_KEY) || "";
  if (!apiKey) throw new Error("nokey");

  let response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "qwen/qwen3.6-27b",
        temperature: 0,
        max_completion_tokens: 3000,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64}` } },
        ]}],
      }),
    });
  } catch (e) {
    throw new Error("network");
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("nokey");
    if (response.status === 429) throw new Error("rate");
    let bodyText = "";
    try { bodyText = (await response.text()).slice(0, 180); } catch (e) { /* nic */ }
    const err = new Error("http");
    err.detail = `HTTP ${response.status}${bodyText ? " · " + bodyText : ""}`;
    throw err;
  }
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJSON(text);
  if (!parsed) throw new Error("parse");
  if (parsed.error === "not_receipt") throw new Error("not_receipt");
  if (!Array.isArray(parsed.items)) parsed.items = [];

  // Post-walidacja rabatów: jeśli model nie odjął rabatów, suma items > total.
  // Dorzucamy pozycję "Rabat" z różnicą, żeby końcówka zgadzała się z paragonem.
  const itemsSum = parsed.items.reduce((s, i) => s + (Number(i.total_price) || 0), 0);
  const total = Number(parsed.total) || 0;
  if (total > 0 && itemsSum - total > 0.5) {
    const diff = Math.round((total - itemsSum) * 100) / 100; // ujemne
    parsed.items.push({ name: "Rabat / opust", qty: 1, total_price: diff, category: "inne" });
  }
  return parsed;
}

/* ---------- eksport CSV ---------- */
function exportCSV(receipts) {
  const rows = [["Data", "Sklep", "Produkt", "Kategoria", "Kwota (zł)"]];
  [...receipts].sort((a, b) => (a.date < b.date ? 1 : -1)).forEach((r) =>
    r.items.forEach((i) => rows.push([r.date, r.store, i.name, catBySlug(i.category).name, String(Number(i.total_price).toFixed(2)).replace(".", ",")]))
  );
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `paragon-ai-${todayKey()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* Kopia zapasowa: pobiera pełny stan jako plik JSON */
function downloadBackup(state) {
  const payload = { app: "paragon-ai", version: 1, exportedAt: new Date().toISOString(), data: state };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `paragon-ai-kopia-${todayKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- hooki ---------- */
function useCountUp(value, dur = 700) {
  const [v, setV] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current, to = Number(value) || 0;
    if (from === to) { setV(to); return; }
    const t0 = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min((t - t0) / dur, 1);
      const e = p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setV(from + (to - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, dur]);
  return v;
}

/* ---------- style globalne ---------- */
function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

      /* ---- PALETY: ciemna (domyślna) ---- */
      :root, html[data-pa-theme="dark"] {
        --c-bg: #0A1410;
        --c-bgSolid: rgba(10,20,16,.9);
        --c-glow: #143024;
        --c-surface: #13241C;
        --c-glass: rgba(255,255,255,.045);
        --c-glassBorder: rgba(255,255,255,.08);
        --c-glassBorderSoft: rgba(255,255,255,.055);
        --c-text: #EDF3EF;
        --c-sub: #93A69C;
        --c-faint: #5E7268;
        --c-hdrA: rgba(10,20,16,.92);
        --c-hdrB: rgba(10,20,16,.62);
        --c-dim: rgba(4,10,7,.62);
        --ovc: 255,255,255;
        --sf1: rgba(255,255,255,.045);
        --sf2: rgba(255,255,255,.075);
        --sf3: rgba(255,255,255,.13);
        --sh1: rgba(0,0,0,.3);
        --sh2: rgba(0,0,0,.55);
        --c-outer: #050B08;
        --c-hero: linear-gradient(150deg, #17503F 0%, #0F3A2B 42%, #0A2A1F 100%);
        --c-avatar: #0B1712;
        --c-up: #F2A69E;
        --c-down: #9BE8CB;
        --g-free: linear-gradient(140deg,#1A2B23,#0E1A14);
        --g-starter: linear-gradient(140deg,#1B2E33,#0E1A1D);
        --g-pro: linear-gradient(140deg,#15493A 0%,#0E3528 50%,#0A2A1F 100%);
        --g-family: linear-gradient(140deg,#3A3320 0%,#241E0E 55%,#1A1608 100%);
        --c-scheme: dark;
      }
      /* ---- PALETA JASNA ---- */
      html[data-pa-theme="light"] {
        --c-bg: #EFF4F0;
        --c-bgSolid: rgba(239,244,240,.92);
        --c-glow: #DCEDE3;
        --c-surface: #FFFFFF;
        --c-glass: #FFFFFF;
        --c-glassBorder: rgba(16,32,25,.12);
        --c-glassBorderSoft: rgba(16,32,25,.085);
        --c-text: #101F18;
        --c-sub: #46574E;
        --c-faint: #71837A;
        --c-hdrA: rgba(239,244,240,.94);
        --c-hdrB: rgba(239,244,240,.65);
        --c-dim: rgba(16,32,25,.34);
        --ovc: 16,32,25;
        --sf1: #FFFFFF;
        --sf2: #FFFFFF;
        --sf3: rgba(16,32,25,.055);
        --sh1: rgba(16,32,25,.07);
        --sh2: rgba(16,32,25,.16);
        --c-outer: #DDE6DF;
        --c-hero: linear-gradient(150deg, #FFFFFF 0%, #F0FAF5 45%, #DFF3E9 100%);
        --c-avatar: #FFFFFF;
        --c-up: #C0453B;
        --c-down: #0B7A59;
        --g-free: linear-gradient(140deg,#FFFFFF,#EFF4F1);
        --g-starter: linear-gradient(140deg,#F7FCFD,#E9F2F5);
        --g-pro: linear-gradient(140deg,#F0FBF6 0%,#E1F6EC 50%,#D2F0E0 100%);
        --g-family: linear-gradient(140deg,#FEFAF0 0%,#F8F1DE 55%,#F1E7CE 100%);
        --c-scheme: light;
      }
      /* ---- PALETA: ZŁOTY ZMIERZCH (do kupienia) ---- */
      html[data-pa-theme="gold"] {
        --c-bg: #14100A; --c-bgSolid: rgba(20,16,10,.9); --c-glow: #33280F; --c-surface: #1F1810;
        --c-glass: rgba(255,240,210,.055); --c-glassBorder: rgba(255,240,210,.1); --c-glassBorderSoft: rgba(255,240,210,.07);
        --c-text: #F6EEDC; --c-sub: #B0A085; --c-faint: #7A6C56;
        --c-hdrA: rgba(20,16,10,.92); --c-hdrB: rgba(20,16,10,.62); --c-dim: rgba(10,7,3,.66);
        --ovc: 255,240,210; --sf1: rgba(255,240,210,.05); --sf2: rgba(255,240,210,.08); --sf3: rgba(255,240,210,.14);
        --sh1: rgba(0,0,0,.34); --sh2: rgba(0,0,0,.6); --c-outer: #0A0704;
        --c-hero: linear-gradient(150deg, #4A3A18 0%, #2E2410 45%, #1C1509 100%);
        --c-avatar: #1A140C; --c-up: #F2A69E; --c-down: #E8CF9B;
        --g-free: linear-gradient(140deg,#2A2114,#17110A); --g-starter: linear-gradient(140deg,#2C2418,#18120B);
        --g-pro: linear-gradient(140deg,#4A3A18 0%,#33280F 50%,#221A0B 100%);
        --g-family: linear-gradient(140deg,#5A4520 0%,#3A2C12 55%,#241B0A 100%);
        --c-scheme: dark;
      }
      /* ---- PALETA: NOCNY GRANAT (do kupienia) ---- */
      html[data-pa-theme="navy"] {
        --c-bg: #0A1020; --c-bgSolid: rgba(10,16,32,.9); --c-glow: #16224A; --c-surface: #131C33;
        --c-glass: rgba(214,230,255,.055); --c-glassBorder: rgba(214,230,255,.1); --c-glassBorderSoft: rgba(214,230,255,.07);
        --c-text: #E6EDFA; --c-sub: #93A3C2; --c-faint: #5E6C8A;
        --c-hdrA: rgba(10,16,32,.92); --c-hdrB: rgba(10,16,32,.62); --c-dim: rgba(4,8,18,.66);
        --ovc: 214,230,255; --sf1: rgba(214,230,255,.05); --sf2: rgba(214,230,255,.08); --sf3: rgba(214,230,255,.14);
        --sh1: rgba(0,0,0,.34); --sh2: rgba(0,0,0,.6); --c-outer: #05080F;
        --c-hero: linear-gradient(150deg, #1E3468 0%, #16244A 45%, #0E1730 100%);
        --c-avatar: #0F1728; --c-up: #F2A69E; --c-down: #8FD8FF;
        --g-free: linear-gradient(140deg,#1B2440,#101728); --g-starter: linear-gradient(140deg,#1C2A4A,#101A2E);
        --g-pro: linear-gradient(140deg,#1E3468 0%,#16244A 50%,#0E1730 100%);
        --g-family: linear-gradient(140deg,#3A3320 0%,#241E0E 55%,#1A1608 100%);
        --c-scheme: dark;
      }
      html { background: var(--c-bg); }
      .pa-app { transition: background 340ms var(--pa-smooth, ease); }
      * { -webkit-tap-highlight-color: transparent; }
      .pa-display { font-family: 'Space Grotesk', sans-serif; letter-spacing: -0.01em; }
      .pa-body { font-family: 'Inter', sans-serif; }
      .pa-mono { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
      :root { --pa-spring: cubic-bezier(0.34, 1.56, 0.64, 1); --pa-expo: cubic-bezier(0.16, 1, 0.3, 1); --pa-smooth: cubic-bezier(0.22, 1, 0.36, 1); }
      .pa-press { transition: transform 240ms var(--pa-spring), filter 180ms ease; will-change: transform; }
      .pa-press:active { transform: scale(0.955); filter: brightness(1.09); }
      .pa-fade { animation: paFade 420ms var(--pa-expo) both; }
      @keyframes paFade { from { opacity: 0; transform: translateY(12px) scale(.99); filter: blur(4px) } to { opacity: 1; transform: none; filter: blur(0) } }
      .pa-rise { animation: paRise 620ms var(--pa-spring) both; }
      @keyframes paRise { 0% { opacity: 0; transform: translateY(24px) scale(.93); filter: blur(7px) } 55% { opacity: 1; filter: blur(0) } 100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0) } }
      .pa-sheet { animation: paSheet 480ms var(--pa-expo) both; }
      @keyframes paSheet { from { transform: translateY(100%) scale(.97) } to { transform: translateY(0) scale(1) } }
      .pa-float { animation: paFloat 5.5s ease-in-out infinite; }
      @keyframes paFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-5px) } }
      .pa-flame { display: inline-block; transform-origin: 50% 85%; animation: paFlame 1.7s ease-in-out infinite; }
      @keyframes paFlame { 0%,100% { transform: scale(1) rotate(-3deg) } 35% { transform: scale(1.16) rotate(3deg) } 68% { transform: scale(1.05) rotate(-1deg) } }
      .pa-tab-ico { transition: transform 380ms var(--pa-spring), filter 240ms ease, opacity 240ms ease; position: relative; z-index: 1; }
      .pa-tab-on .pa-tab-ico { transform: translateY(-2px) scale(1.12); }
      .pa-tab-pill { position: absolute; top: -1px; left: 50%; transform: translateX(-50%) scale(.7); width: 44px; height: 30px; border-radius: 999px;
        background: linear-gradient(140deg, ${T.mint}24, ${T.mint}0A); border: 1px solid ${T.mint}30; opacity: 0; transition: all 420ms var(--pa-spring); }
      .pa-tab-on .pa-tab-pill { opacity: 1; transform: translateX(-50%) scale(1); }
      .pa-mono, .pa-num { font-variant-numeric: tabular-nums; }
      ::selection { background: ${T.mint}45; color: #fff; }
      .pa-scroll::-webkit-scrollbar { width: 0; height: 0; }
      button:focus-visible, [role="button"]:focus-visible, input:focus-visible { outline: 2px solid ${T.mint}88; outline-offset: 2px; border-radius: 10px; }
      input { caret-color: ${T.mint}; }
      .pa-hdr { position: sticky; top: 0; z-index: 5; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
        background: linear-gradient(180deg, var(--c-hdrA), var(--c-hdrB) 78%, transparent);
        border-bottom: 1px solid rgba(var(--ovc),.05); }
      .pa-dim { animation: paDim 200ms ease both; }
      @keyframes paDim { from { opacity: 0; } to { opacity: 1; } }
      .pa-pulse { animation: paPulse 1.3s ease-in-out infinite; }
      @keyframes paPulse { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
      .pa-scan { animation: paScan 2.1s var(--pa-smooth) infinite; }
      @keyframes paOrbit { to { transform: rotate(360deg) } }
      .pa-orbit { position: absolute; border-radius: 50%; background: conic-gradient(from 0deg, transparent 0deg, ${T.mint}00 200deg, ${T.mint}cc 330deg, ${T.mint} 360deg); animation: paOrbit 2.6s linear infinite; pointer-events: none; }
      @keyframes paRingPulse { 0% { transform: scale(1); opacity: .55 } 100% { transform: scale(1.55); opacity: 0 } }
      .pa-ring-pulse { position: absolute; border-radius: 22px; border: 1.5px solid ${T.mint}; animation: paRingPulse 2.4s var(--pa-expo) infinite; pointer-events: none; }
      @keyframes paBracket { 0%,100% { opacity: .45; transform: scale(1) } 50% { opacity: 1; transform: scale(1.06) } }
      .pa-bracket { position: absolute; width: 20px; height: 20px; border-color: ${T.mint}; animation: paBracket 2s ease-in-out infinite; pointer-events: none; }
      @keyframes paScan { 0% { transform: translateY(0) } 50% { transform: translateY(128px) } 100% { transform: translateY(0) } }
      .pa-shimmer { background: linear-gradient(100deg, rgba(var(--ovc),.035) 30%, rgba(var(--ovc),.13) 50%, rgba(var(--ovc),.035) 70%); background-size: 240% 100%; animation: paShim 1.8s var(--pa-smooth) infinite; }
      @keyframes paShim { from { background-position: 210% 0 } to { background-position: -30% 0 } }
      .pa-pop { animation: paPop 640ms var(--pa-spring) both; }
      @keyframes paPop { 0% { opacity:0; transform: scale(.68) rotate(-5deg) } 55% { opacity:1; transform: scale(1.08) rotate(1.5deg) } 78% { transform: scale(.975) rotate(-.5deg) } 100% { opacity:1; transform: scale(1) rotate(0) } }
      .pa-aurora { position: absolute; border-radius: 50%; filter: blur(34px); pointer-events: none; animation: paAurora 14s ease-in-out infinite alternate; }
      @keyframes paAurora { 0% { transform: translate(0,0) scale(1) } 100% { transform: translate(18px,-22px) scale(1.18) } }
      .pa-sheen { position: relative; overflow: hidden; }
      .pa-sheen::after { content:''; position:absolute; top:0; left:-60%; width:45%; height:100%; pointer-events: none;
        background: linear-gradient(100deg, transparent, rgba(var(--ovc),.35), transparent); transform: skewX(-18deg);
        animation: paSheen 6.5s var(--pa-smooth) infinite; }
      @keyframes paSheen { 0%,72% { left:-60% } 86% { left:130% } 100% { left:130% } }
      .pa-glow { animation: paGlow 2.6s ease-in-out infinite; }
      @keyframes paGlow { 0%,100% { box-shadow: 0 10px 28px ${T.mint}44, inset 0 1.5px 0 rgba(var(--ovc),.45), 0 0 0 5px var(--c-bgSolid) } 50% { box-shadow: 0 12px 34px ${T.mint}77, inset 0 1.5px 0 rgba(var(--ovc),.5), 0 0 0 5px var(--c-bgSolid) } }
      .pa-zz-paper { height: 9px; background:
        linear-gradient(-45deg, transparent 6.5px, ${T.paper} 0) 0 0 / 13px 13px repeat-x,
        linear-gradient(45deg, transparent 6.5px, ${T.paper} 0) 0 0 / 13px 13px repeat-x; }
      .pa-zz-paper-top { height: 9px; background:
        linear-gradient(-135deg, transparent 6.5px, ${T.paper} 0) 0 0 / 13px 13px repeat-x,
        linear-gradient(135deg, transparent 6.5px, ${T.paper} 0) 0 0 / 13px 13px repeat-x; }
      .pa-barcode { height: 30px; background: repeating-linear-gradient(90deg,
        ${T.paperInk} 0 2px, transparent 2px 4px, ${T.paperInk} 4px 5px, transparent 5px 9px,
        ${T.paperInk} 9px 12px, transparent 12px 14px, ${T.paperInk} 14px 15px, transparent 15px 17px,
        ${T.paperInk} 17px 19px, transparent 19px 24px); opacity:.82; }
      input, select { color-scheme: dark; }
      input:focus, select:focus { outline: none; border-color: ${T.mint}99 !important; box-shadow: 0 0 0 3px ${T.mint}1F; }
      select { -webkit-appearance: none; appearance: none; }
      ::-webkit-scrollbar { display: none; }
      .pa-scroll { overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; touch-action: pan-y; }
      .pa-lvl-track { display: flex; align-items: flex-start; overflow-x: auto; overflow-y: hidden;
        touch-action: pan-x; -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain;
        scroll-snap-type: x proximity; scrollbar-width: none; -ms-overflow-style: none; }
      .pa-lvl-track::-webkit-scrollbar { display: none; }
      .pa-lvl-node { scroll-snap-align: center; }
      @keyframes paGiftBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
      .pa-gift { animation: paGiftBob 2.1s ease-in-out infinite; }
      .pa-app { height: 100vh; height: 100dvh; }
      @keyframes paBarGrow { from { transform: scaleY(0) } to { transform: scaleY(1) } }
      .pa-bar { transform-origin: bottom; animation: paBarGrow 800ms cubic-bezier(0.23, 1, 0.32, 1) both; }
      @keyframes paScanMove { 0% { top: 8% } 50% { top: 86% } 100% { top: 8% } }
      .pa-scanline { animation: paScanMove 2.6s ease-in-out infinite; }
      @keyframes paFill { from { width: 4% } to { width: 72% } }
      .pa-fill { animation: paFill 1.2s 300ms cubic-bezier(0.23, 1, 0.32, 1) both; }
      @keyframes paSlideIn { from { opacity: 0; transform: translateX(40px) scale(.97); filter: blur(6px) } to { opacity: 1; transform: none; filter: blur(0) } }
      .pa-slidein { animation: paSlideIn 520ms var(--pa-expo) both; }
      @keyframes paFabRing { 0% { transform: scale(.7); opacity: .85; border-width: 2.5px } 100% { transform: scale(2.15); opacity: 0; border-width: .5px } }
      .pa-fab-ring { position: absolute; inset: 0; border-radius: 999px; border: 2.5px solid #2DD4A0; animation: paFabRing 2.4s var(--pa-expo) infinite; pointer-events: none; }
      .pa-fab-ring-2 { animation-delay: 1.2s; }
      @keyframes paGlint { 0% { transform: translateX(-120%) } 60%, 100% { transform: translateX(320%) } }
      .pa-bar-glint { position: relative; overflow: hidden; }
      .pa-bar-glint::after { content: ""; position: absolute; top: 0; bottom: 0; width: 34%; background: linear-gradient(90deg, transparent, rgba(var(--ovc),.55), transparent); animation: paGlint 2.6s ease-in-out infinite; }
      @keyframes paCrown { 0%, 100% { box-shadow: 0 0 26px rgba(216,184,120,.35), inset 0 1px 0 rgba(var(--ovc),.25) } 50% { box-shadow: 0 0 44px rgba(216,184,120,.6), inset 0 1px 0 rgba(var(--ovc),.35) } }
      @keyframes paNodeRing { 0% { transform: scale(.8); opacity: .9; } 100% { transform: scale(1.9); opacity: 0; } }
      .pa-node-ring { position: absolute; inset: -2px; border-radius: 999px; border: 2px solid ${T.gold}; animation: paNodeRing 1.6s var(--pa-expo) infinite; pointer-events: none; }
      @keyframes paNodeBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2.5px); } }
      .pa-node-bob { animation: paNodeBob 1.8s ease-in-out infinite; }
      @keyframes paNodePop { 0% { transform: scale(1); filter: brightness(1); } 35% { transform: scale(1.45) rotate(6deg); filter: brightness(1.9); } 65% { transform: scale(.92) rotate(-3deg); } 100% { transform: scale(1); filter: brightness(1); } }
      .pa-node-pop { animation: paNodePop 620ms var(--pa-spring); }
      @keyframes paNodeBurst { 0% { transform: scale(.4); opacity: .95; border-width: 3px; } 100% { transform: scale(3.1); opacity: 0; border-width: .5px; } }
      .pa-node-burst { position: absolute; inset: -3px; border-radius: 999px; border: 3px solid ${T.gold}; animation: paNodeBurst 750ms var(--pa-expo) forwards; pointer-events: none; }
      @keyframes paRays { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .pa-rays { position: absolute; inset: -46px; border-radius: 999px; pointer-events: none;
        background: conic-gradient(from 0deg, ${T.gold}2E 0deg 14deg, transparent 14deg 40deg, ${T.gold}22 40deg 54deg, transparent 54deg 86deg, ${T.gold}2E 86deg 100deg, transparent 100deg 132deg, ${T.gold}22 132deg 146deg, transparent 146deg 178deg, ${T.gold}2E 178deg 192deg, transparent 192deg 224deg, ${T.gold}22 224deg 238deg, transparent 238deg 270deg, ${T.gold}2E 270deg 284deg, transparent 284deg 316deg, ${T.gold}22 316deg 330deg, transparent 330deg 360deg);
        -webkit-mask: radial-gradient(circle, transparent 34%, #000 40%, #000 68%, transparent 74%); mask: radial-gradient(circle, transparent 34%, #000 40%, #000 68%, transparent 74%);
        animation: paRays 7s linear infinite; }
      @keyframes paStageIn { 0% { opacity: 0; transform: translateY(14px) scale(.94); filter: blur(5px); } 100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } }
      .pa-stage { opacity: 0; animation: paStageIn 480ms var(--pa-spring) forwards; }
      @keyframes paWelcomeScan { 0% { top: 6%; opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { top: 94%; opacity: 0; } }
      .pa-w-scan { position: absolute; left: 6%; right: 6%; height: 2px; border-radius: 2px;
        background: linear-gradient(90deg, transparent, ${T.mint}, transparent);
        box-shadow: 0 0 14px ${T.mint}, 0 0 30px ${T.mint}77; animation: paWelcomeScan 2.6s var(--pa-smooth) infinite; }
      @keyframes paItemIn { from { opacity: 0; transform: translateX(-7px); } to { opacity: 1; transform: translateX(0); } }
      .pa-w-item { animation: paItemIn 420ms var(--pa-spring) backwards; }
      @keyframes paBreathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.045); } }
      .pa-breathe { animation: paBreathe 4.2s ease-in-out infinite; }
      @keyframes paHaloSpin { to { transform: rotate(360deg); } }
      .pa-halo { animation: paHaloSpin 14s linear infinite; }
      .pa-crown { animation: paCrown 2.4s ease-in-out infinite; }
      @keyframes paConfetti {
        0%   { transform: translate3d(0,0,0) rotate3d(1,1,.3,0deg) scale(.6); opacity: 1; animation-timing-function: cubic-bezier(.12,.72,.35,1) }
        45%  { transform: translate3d(calc(var(--dx) * .72), var(--peak), 0) rotate3d(1,1,.3,calc(var(--rot) * .55)) scale(1); opacity: 1; animation-timing-function: cubic-bezier(.55,0,.85,.55) }
        100% { transform: translate3d(var(--dx), var(--dy), 0) rotate3d(1,1,.3,var(--rot)) scale(.9); opacity: 0 }
      }
      .pa-confetti { position: absolute; animation: paConfetti 1900ms forwards; will-change: transform; }
      @keyframes paBurst { 0% { transform: scale(.25); opacity: .85; border-width: 4px } 100% { transform: scale(2.8); opacity: 0; border-width: 0 } }
      .pa-burst { position: absolute; border-radius: 50%; border: 4px solid rgba(216,184,120,.7); animation: paBurst 1200ms var(--pa-expo) forwards; pointer-events: none; }
      @keyframes paSpark { 0%,100% { transform: scale(.4) rotate(0deg); opacity: 0 } 50% { transform: scale(1.15) rotate(180deg); opacity: 1 } }
      .pa-spark { position: absolute; animation: paSpark 1500ms ease-in-out infinite; pointer-events: none; }
      @keyframes paSpotPulse { 0%,100% { box-shadow: 0 0 0 9999px rgba(3,9,6,.8), 0 0 0 3px rgba(45,212,160,.9), 0 0 22px 6px rgba(45,212,160,.35) } 50% { box-shadow: 0 0 0 9999px rgba(3,9,6,.8), 0 0 0 3px rgba(45,212,160,.55), 0 0 30px 10px rgba(45,212,160,.5) } }
      .pa-spot { box-shadow: 0 0 0 9999px rgba(3,9,6,.8), 0 0 0 3px rgba(45,212,160,.8); animation: paSpotPulse 2.2s var(--pa-smooth) infinite; transition: top 320ms var(--pa-smooth), left 320ms var(--pa-smooth), width 320ms var(--pa-smooth), height 320ms var(--pa-smooth), border-radius 260ms ease; }
      @media (prefers-reduced-motion: reduce) {
        .pa-fade, .pa-rise, .pa-sheet, .pa-scan, .pa-shimmer, .pa-pop, .pa-aurora, .pa-glow, .pa-bar, .pa-scanline, .pa-fill, .pa-spot, .pa-slidein, .pa-fab-ring, .pa-confetti, .pa-crown, .pa-float, .pa-flame, .pa-burst, .pa-spark, .pa-orbit, .pa-ring-pulse, .pa-bracket, .pa-node-ring, .pa-node-bob, .pa-node-pop, .pa-node-burst, .pa-rays, .pa-stage, .pa-w-scan, .pa-w-item, .pa-breathe, .pa-halo { animation: none; filter: none; }
        .pa-press:active { transform: scale(.98); }
        .pa-tab-ico { transition: none; }
      .pa-bar-glint::after { animation: none; display: none; }
        .pa-sheen::after { animation: none; display: none; }
      }
      .pa-noise { position: absolute; inset: 0; pointer-events: none; opacity: .035; mix-blend-mode: overlay;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
    `}</style>
  );
}

/* ---------- donut ---------- */
/* ---------- krzywa narastających wydatków (z widmem poprzedniego miesiąca) ---------- */
function SpendCurve({ receipts, month, height = 66 }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(r); }, [month]);
  const days = daysInMonth(month);
  const prevMonth = shiftMonth(month, -1);
  const prevDays = daysInMonth(prevMonth);
  const isCur = month === nowMonth();
  const todayD = isCur ? Number(todayKey().slice(8, 10)) : days;

  const { cum, prevCum, max } = useMemo(() => {
    const cur = Array(days).fill(0), prv = Array(prevDays).fill(0);
    receipts.forEach((r) => {
      const mk = (r.date || "").slice(0, 7);
      const d = Number((r.date || "").slice(8, 10));
      const v = Number(r.total) || 0;
      if (mk === month && d >= 1 && d <= days) cur[d - 1] += v;
      else if (mk === prevMonth && d >= 1 && d <= prevDays) prv[d - 1] += v;
    });
    const acc = (arr) => { let s = 0; return arr.map((v) => (s += v)); };
    const c = acc(cur), p = acc(prv);
    return { cum: c, prevCum: p, max: Math.max(c[c.length - 1] || 0, p[p.length - 1] || 0, 1) };
  }, [receipts, month, prevMonth, days, prevDays]);

  const W = 300, H = height, padB = 2;
  const px = (i, n) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const py = (v) => H - padB - (v / max) * (H - padB - 3);
  const line = (arr, n) => arr.slice(0, n).map((v, i) => `${i === 0 ? "M" : "L"} ${px(i, arr.length).toFixed(1)} ${py(v).toFixed(1)}`).join(" ");
  const curPath = line(cum, todayD);
  const areaPath = todayD > 1 ? `${curPath} L ${px(todayD - 1, days).toFixed(1)} ${H} L 0 ${H} Z` : "";
  const prevPath = line(prevCum, prevDays);
  const lastX = px(Math.max(todayD - 1, 0), days), lastY = py(cum[Math.max(todayD - 1, 0)] || 0);

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id="pa-curve-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={T.mint} stopOpacity="0.34" />
          <stop offset="100%" stopColor={T.mint} stopOpacity="0" />
        </linearGradient>
      </defs>
      {prevCum.some((v) => v > 0) && (
        <path d={prevPath} fill="none" stroke="rgba(var(--ovc),.28)" strokeWidth="1.6" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      )}
      {areaPath && <path d={areaPath} fill="url(#pa-curve-fill)" style={{ opacity: ready ? 1 : 0, transition: "opacity 700ms ease 200ms" }} />}
      {curPath && (
        <path d={curPath} fill="none" stroke={T.mint} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
          style={{ strokeDasharray: 900, strokeDashoffset: ready ? 0 : 900, transition: `stroke-dashoffset 1100ms ${T.easeOut}`, filter: `drop-shadow(0 2px 8px ${T.mint}66)` }} />
      )}
      {curPath && (
        <circle cx={lastX} cy={lastY} r="3.6" fill="#0B1712" stroke={T.mint} strokeWidth="2.4" vectorEffect="non-scaling-stroke"
          style={{ opacity: ready ? 1 : 0, transition: "opacity 400ms ease 900ms" }} />
      )}
    </svg>
  );
}

function CatTile({ slug, size = 34, fs = 16 }) {
  const c = catBySlug(slug);
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.32, background: `linear-gradient(145deg, ${c.color}33, ${c.color}14)`,
      border: `1px solid ${c.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: fs, flexShrink: 0 }}>
      {c.icon}
    </div>
  );
}
function CategoryChip({ slug, onClick, light }) {
  const c = catBySlug(slug);
  return (
    <button onClick={onClick} className="pa-press pa-body"
      style={{ display: "inline-flex", alignItems: "center", gap: 5,
        background: c.color + (light ? "1C" : "1A"), color: light ? "#3A463F" : T.text,
        border: `1px solid ${c.color}${light ? "66" : "45"}`, borderRadius: 999, padding: "3px 10px",
        fontSize: 11, fontWeight: 500, cursor: onClick ? "pointer" : "default" }}>
      <span style={{ fontSize: 12 }}>{c.icon}</span>{c.name}
      {onClick && <span style={{ fontSize: 8, opacity: .55, marginLeft: 1 }}>▾</span>}
    </button>
  );
}
function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} className="pa-press"
      style={{ width: 46, height: 27, borderRadius: 999, border: `1px solid ${on ? T.mint + "66" : "rgba(var(--ovc),.12)"}`,
        background: on ? `linear-gradient(135deg, ${T.mint}, ${T.mintDeep})` : "rgba(var(--ovc),.07)",
        position: "relative", cursor: "pointer", transition: `background 220ms ease, border-color 220ms ease`, flexShrink: 0 }}>
      <span style={{ position: "absolute", top: 2.5, left: on ? 21 : 3, width: 20, height: 20, borderRadius: 999, background: "#fff",
        boxShadow: "0 2px 6px var(--sh1)", transition: `left 220ms ${T.easeOut}` }} />
    </button>
  );
}

function CategorySheet({ current, onPick, onClose }) {
  return (
    <div className="pa-dim" onClick={onClose} style={{ position: "absolute", inset: 0, background: "var(--c-dim)", backdropFilter: "blur(3px)", zIndex: 50, display: "flex", alignItems: "flex-end" }}>
      <div className="pa-sheet pa-scroll" onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--c-surface)", border: "1px solid rgba(var(--ovc),.08)", borderBottom: "none", width: "100%", borderRadius: "22px 22px 0 0", padding: "16px 16px 28px", maxHeight: "72%", overflowY: "auto", boxShadow: "0 -16px 50px var(--sh2)" }}>
        <div style={{ width: 38, height: 4, background: "var(--sf3)", borderRadius: 2, margin: "0 auto 16px" }} />
        <div className="pa-display" style={{ fontSize: 16, fontWeight: 600, marginBottom: 14, color: T.text }}>Wybierz kategorię</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {CATEGORIES.map((c, i) => (
            <button key={c.slug} onClick={() => onPick(c.slug)} className="pa-press pa-body pa-fade"
              style={{ animationDelay: `${Math.min(i * 18, 200)}ms`, display: "flex", alignItems: "center", gap: 9, padding: "10px 11px", borderRadius: 13, textAlign: "left",
                border: current === c.slug ? `1.5px solid ${T.mint}` : `1px solid rgba(var(--ovc),.08)`,
                background: current === c.slug ? T.mint + "14" : "rgba(var(--ovc),.03)",
                fontSize: 12.5, fontWeight: 500, color: T.text, cursor: "pointer" }}>
              <span style={{ fontSize: 17 }}>{c.icon}</span>{c.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConfirmSheet({ title, body, confirmLabel, onConfirm, onClose }) {
  return (
    <div className="pa-dim" onClick={onClose} style={{ position: "absolute", inset: 0, background: "var(--c-dim)", backdropFilter: "blur(3px)", zIndex: 60, display: "flex", alignItems: "flex-end" }}>
      <div className="pa-sheet pa-scroll" onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--c-surface)", border: "1px solid rgba(var(--ovc),.08)", borderBottom: "none", width: "100%", borderRadius: "22px 22px 0 0", padding: "20px 18px calc(26px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 -16px 50px var(--sh2)", maxHeight: "88%", boxSizing: "border-box" }}>
        <div className="pa-display" style={{ fontSize: 16.5, fontWeight: 600, color: T.text, marginBottom: 6 }}>{title}</div>
        <div className="pa-body" style={{ fontSize: 13, color: T.sub, marginBottom: 18, lineHeight: 1.5 }}>{body}</div>
        <button className="pa-press pa-display" onClick={onConfirm}
          style={{ width: "100%", padding: "13px 0", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #C9655C, #A8463E)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", boxShadow: "0 6px 18px rgba(180,70,60,.3)" }}>
          {confirmLabel}
        </button>
        <button className="pa-press pa-body" onClick={onClose}
          style={{ width: "100%", padding: "12px 0", marginTop: 8, borderRadius: 14, border: "1px solid rgba(var(--ovc),.1)", background: "none", color: T.sub, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
          Anuluj
        </button>
      </div>
    </div>
  );
}

/* edycja profilu / dodanie domownika — własny stan = brak problemu z fokusem */
function InputSheet({ title, icon, note, fields, submitLabel, onSubmit, onClose }) {
  const [vals, setVals] = useState(() => Object.fromEntries(fields.map((f) => [f.key, f.value || ""])));
  return (
    <div className="pa-dim" onClick={onClose} style={{ position: "absolute", inset: 0, background: "var(--c-dim)", backdropFilter: "blur(3px)", zIndex: 60, display: "flex", alignItems: "flex-end" }}>
      <div className="pa-sheet pa-scroll" onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--c-surface)", border: "1px solid rgba(var(--ovc),.08)", borderBottom: "none", width: "100%", borderRadius: "22px 22px 0 0", padding: "20px 18px calc(26px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 -16px 50px var(--sh2)", maxHeight: "88%", boxSizing: "border-box" }}>
        <div className="pa-display" style={{ fontSize: 16.5, fontWeight: 600, color: T.text, marginBottom: note ? 6 : 16, display: "flex", alignItems: "center", gap: 8 }}>
          {icon && <span style={{ fontSize: 18 }}>{icon}</span>}{title}
        </div>
        {note && <div className="pa-body" style={{ fontSize: 11.5, color: T.faint, marginBottom: 16, lineHeight: 1.5 }}>{note}</div>}
        {fields.map((f) => (
          <div key={f.key} style={{ marginBottom: 13 }}>
            <label className="pa-body" style={{ display: "block", fontSize: 10, fontWeight: 600, color: T.faint, textTransform: "uppercase", letterSpacing: ".09em", marginBottom: 5 }}>{f.label}</label>
            <input value={vals[f.key]} placeholder={f.placeholder || ""} type={f.type || "text"} min={f.min}
              onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
              className="pa-body" style={{ width: "100%", padding: "11px 12px", borderRadius: 12, border: `1px solid ${T.glassBorder}`, background: "var(--sf1)", fontSize: 14, color: T.text, boxSizing: "border-box" }} />
          </div>
        ))}
        <button className="pa-press pa-display" onClick={() => onSubmit(vals)}
          style={{ width: "100%", marginTop: 6, padding: "13px 0", borderRadius: 14, border: "none", background: `linear-gradient(135deg, ${T.mint}, ${T.mintDeep})`, color: "#06251A", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: `0 8px 24px ${T.mint}38` }}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

/* ---------- ONBOARDING (pierwsze uruchomienie) — 5 slajdów premium ---------- */
function OnboardingScreen({ onFinish, onSkip }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");

  /* ilustracje slajdów budowane w CSS */
  const IlluScan = () => (
    <div style={{ position: "relative", width: 150, height: 170, margin: "0 auto" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 14, background: "linear-gradient(180deg,#F7F4EC,#EDE9DE)", boxShadow: "0 24px 60px var(--sh2), 0 4px 14px var(--sh1)", padding: "16px 14px", boxSizing: "border-box" }}>
        <div style={{ height: 9, width: "58%", borderRadius: 5, background: "#28362E", margin: "0 auto 12px", opacity: .85 }} />
        {[82, 64, 74, 50, 68].map((w, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
            <div style={{ height: 6, width: `${w - 22}%`, borderRadius: 3, background: "#9AA69E" }} />
            <div style={{ height: 6, width: "16%", borderRadius: 3, background: "#6E7B72" }} />
          </div>
        ))}
        <div style={{ height: 1.5, background: "repeating-linear-gradient(90deg,#B9C2BB 0 6px,transparent 6px 11px)", margin: "10px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div style={{ height: 8, width: "34%", borderRadius: 4, background: "#28362E" }} />
          <div style={{ height: 8, width: "24%", borderRadius: 4, background: "#16916B" }} />
        </div>
      </div>
      <div className="pa-scanline" style={{ position: "absolute", left: -8, right: -8, height: 3, borderRadius: 2, background: `linear-gradient(90deg, transparent, ${T.mint}, transparent)`, boxShadow: `0 0 16px 3px ${T.mint}66` }} />
      <div style={{ position: "absolute", top: -13, right: -13, fontSize: 26, filter: "drop-shadow(0 4px 10px rgba(216,184,120,.5))" }}>✨</div>
    </div>
  );
  const IlluChart = () => (
    <div style={{ width: 170, height: 150, margin: "0 auto", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 13, padding: "0 0 6px" }}>
      {[{ h: 58, c: "#3A5247", d: 0 }, { h: 96, c: T.mintDeep, d: 120 }, { h: 74, c: "#3A5247", d: 240 }, { h: 128, c: T.mint, d: 360, glow: true }].map((b, i) => (
        <div key={i} style={{ position: "relative", width: 30 }}>
          <div className="pa-bar" style={{ height: b.h, borderRadius: "9px 9px 4px 4px", background: `linear-gradient(180deg, ${b.c}, ${b.c}99)`, animationDelay: `${b.d}ms`, boxShadow: b.glow ? `0 0 24px ${T.mint}55` : "none" }} />
          {b.glow && <div className="pa-fade" style={{ position: "absolute", top: -26, left: "50%", transform: "translateX(-50%)", fontSize: 15, animationDelay: "700ms" }}>📉</div>}
        </div>
      ))}
    </div>
  );
  const IlluGoal = () => (
    <div style={{ width: 210, margin: "0 auto", borderRadius: 18, background: "var(--sf2)", border: "1px solid rgba(var(--ovc),.11)", padding: "16px 16px 15px", boxShadow: "0 20px 50px var(--sh2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 13 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: `${T.gold}1C`, border: `1px solid ${T.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>🏝️</div>
        <div>
          <div className="pa-display" style={{ fontSize: 13.5, fontWeight: 600, color: T.text, textAlign: "left" }}>Wakacje w Grecji</div>
          <div className="pa-mono" style={{ fontSize: 10.5, color: T.faint, textAlign: "left" }}>2 160 / 3 000 zł</div>
        </div>
      </div>
      <div style={{ height: 9, background: "var(--sf2)", borderRadius: 5, overflow: "hidden" }}>
        <div className="pa-fill" style={{ height: "100%", borderRadius: 5, background: `linear-gradient(90deg, ${T.gold}, #B2945A)`, boxShadow: `0 0 12px ${T.gold}66` }} />
      </div>
      <div className="pa-body pa-fade" style={{ fontSize: 10.5, color: T.mint, marginTop: 10, animationDelay: "900ms" }}>✨ Odkładaj 280 zł/mies. — zdążysz na lipiec</div>
    </div>
  );

  const slides = [
    {
      illu: (
        <div style={{ textAlign: "center" }}>
          <div className="pa-glow" style={{ width: 104, height: 104, margin: "0 auto", borderRadius: 32, background: `linear-gradient(140deg, ${T.mint}, ${T.mintDeep})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="receipt" size={48} sw={1.8} color="#06251A" />
          </div>
        </div>
      ),
      title: "Witaj w Paragon AI",
      body: "Aplikacja, która zamienia zwykłe paragony w pełny obraz Twoich finansów — automatycznie, w kilka sekund.",
      chips: ["📸 Skanowanie AI", "📊 Analiza wydatków", "🎯 Cele oszczędnościowe"],
    },
    { illu: <IlluScan />, title: "Skanuj paragony", body: "Zrób zdjęcie, a sztuczna inteligencja sama odczyta sklep, produkty, ceny i rabaty. Koniec ręcznego przepisywania i zgadywania, gdzie znikają pieniądze." },
    { illu: <IlluChart />, title: "Analizuj wydatki", body: "Kategorie, trendy i porównania miesiąc do miesiąca. Zobaczysz czarno na białym, co zjada Twój budżet — i gdzie łatwo zaoszczędzić." },
    { illu: <IlluGoal />, title: "Oszczędzaj na cele", body: "Załóż skarbonkę na wakacje, telefon czy poduszkę finansową. Podasz termin — policzymy, ile odkładać miesięcznie, żeby zdążyć." },
    { isName: true, title: "Jak się do Ciebie zwracać?", body: "Podaj imię, a aplikacja przywita Cię osobiście. Możesz to pominąć." },
  ];
  const s = slides[step];
  const last = step === slides.length - 1;

  return (
    <div className="pa-fade" style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <div className="pa-aurora" style={{ top: -110, right: -70, width: 280, height: 280, background: `radial-gradient(circle, ${T.mint}2E, transparent 68%)` }} />
      <div className="pa-aurora" style={{ bottom: -90, left: -80, width: 240, height: 240, background: `radial-gradient(circle, ${T.gold}22, transparent 68%)`, animationDelay: "3s" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 22px 0", position: "relative", zIndex: 1 }}>
        <div className="pa-mono" style={{ fontSize: 10, letterSpacing: ".18em", color: T.faint }}>PARAGON·AI</div>
        <button className="pa-press pa-body" onClick={onSkip}
          style={{ background: "none", border: "none", color: T.faint, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Pomiń</button>
      </div>

      <div key={step} className="pa-rise pa-scroll" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 32px", textAlign: "center", position: "relative", zIndex: 1 }}>
        {!s.isName && <div style={{ marginBottom: 30 }}>{s.illu}</div>}
        {s.isName && (
          <div style={{ width: 88, height: 88, borderRadius: 28, background: `linear-gradient(140deg, ${T.mint}1E, rgba(var(--ovc),.03))`, border: `1px solid ${T.mint}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, marginBottom: 26, boxShadow: `0 20px 50px ${T.mint}22` }}>👋</div>
        )}
        <div className="pa-display" style={{ fontSize: 24, fontWeight: 700, color: T.text, marginBottom: 12 }}>{s.title}</div>
        <div className="pa-body" style={{ fontSize: 13.5, color: T.sub, lineHeight: 1.65, maxWidth: 300 }}>{s.body}</div>
        {s.chips && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 22 }}>
            {s.chips.map((c) => (
              <span key={c} className="pa-body" style={{ fontSize: 11, fontWeight: 600, color: T.sub, background: "var(--sf2)", border: "1px solid rgba(var(--ovc),.1)", borderRadius: 999, padding: "6px 12px" }}>{c}</span>
            ))}
          </div>
        )}
        {s.isName && (
          <input className="pa-body" value={name} placeholder="np. Michał" autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onFinish(name.trim()); }}
            style={{ marginTop: 24, width: "100%", maxWidth: 260, padding: "13px 15px", borderRadius: 14, border: `1px solid ${T.mint}45`, background: "var(--sf1)", fontSize: 15, color: T.text, textAlign: "center", boxSizing: "border-box", outline: "none" }} />
        )}
      </div>

      <div style={{ padding: "0 22px calc(30px + env(safe-area-inset-bottom, 0px))", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 7, marginBottom: 20 }}>
          {slides.map((_, i) => (
            <div key={i} style={{ width: i === step ? 22 : 7, height: 7, borderRadius: 999, background: i === step ? T.mint : "rgba(var(--ovc),.18)", transition: `all 300ms ${T.easeOut}` }} />
          ))}
        </div>
        <button className="pa-press pa-display" onClick={() => last ? onFinish(name.trim()) : setStep((x) => x + 1)}
          style={{ width: "100%", padding: "14px 0", borderRadius: 14, border: "none", cursor: "pointer", fontSize: 15, fontWeight: 700,
            background: `linear-gradient(135deg, ${T.mint}, ${T.mintDeep})`, color: "#06251A", boxShadow: `0 8px 24px ${T.mint}38, inset 0 1px 0 rgba(var(--ovc),.35)` }}>
          {last ? "Zaczynamy! 🚀" : "Dalej"}
        </button>
        {step > 0 && (
          <button className="pa-press pa-body" onClick={() => setStep((x) => x - 1)}
            style={{ width: "100%", marginTop: 10, padding: "8px 0", background: "none", border: "none", color: T.faint, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            ‹ Wstecz
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- SAMOUCZEK (interaktywny przewodnik po Pulpicie) ---------- */
const TUTORIAL_STEPS = [
  {
    spot: { bottom: "calc(33px + env(safe-area-inset-bottom, 0px))", left: "50%", transform: "translateX(-50%)", width: 76, height: 76, borderRadius: 999 },
    bubble: { bottom: "calc(136px + env(safe-area-inset-bottom, 0px))", left: 20, right: 20 },
    arrow: "down", shape: "circle",
    title: "Serce aplikacji 💚",
    body: "Tap — skanujesz paragon aparatem, a AI odczyta wszystko. Przytrzymaj dłużej — szybko dodasz wydatek ręcznie, bez paragonu.",
  },
  {
    spot: { top: 76, left: 12, right: 12, height: 330, borderRadius: 28 },
    bubble: { top: 420, left: 20, right: 20 },
    arrow: "up",
    title: "Twój miesiąc na żywo",
    body: "Suma wydatków, porównanie z poprzednim miesiącem, krzywa dzień po dniu, prognoza i pasek budżetu — wszystko odświeża się po każdym paragonie.",
  },
  {
    spot: { top: 12, right: 8, width: 168, height: 58, borderRadius: 18 },
    bubble: { top: 84, left: 20, right: 20 },
    arrow: "up-right",
    title: "Podróż w czasie",
    body: "Strzałkami przełączasz miesiące — sprawdzisz historię wydatków i porównasz, czy jest lepiej niż kiedyś.",
  },
  {
    spot: { bottom: "calc(6px + env(safe-area-inset-bottom, 0px))", left: 8, right: 8, height: 82, borderRadius: 26 },
    bubble: { bottom: "calc(112px + env(safe-area-inset-bottom, 0px))", left: 20, right: 20 },
    arrow: "down",
    title: "Wszystko pod ręką",
    body: "Paragony — pełna historia zakupów. Analiza — wykresy, trendy i cykliczne opłaty. Profil — budżety, cele i ustawienia.",
  },
  {
    spot: { bottom: "calc(10px + env(safe-area-inset-bottom, 0px))", right: 10, width: 92, height: 74, borderRadius: 20 },
    bubble: { bottom: "calc(112px + env(safe-area-inset-bottom, 0px))", left: 20, right: 20 },
    arrow: "down",
    title: "Nagrody czekają 🎁",
    body: "W Profilu znajdziesz Osiągnięcia i Wyzwania — zdobywaj odznaki za kamienie milowe i odbieraj darmowe skany ponad limit. Zajrzyj po pierwszym paragonie!",
  },
];
function TutorialOverlay({ step, targets, appRef, onNext, onSkip }) {
  const s = TUTORIAL_STEPS[step];
  const [box, setBox] = useState(null); // zmierzony prostokąt reflektora (px, względem aplikacji)
  const [appH, setAppH] = useState(0);
  useEffect(() => {
    let raf = 0, frames = 0, scroller = null;

    const measure = () => {
      try {
        const app = appRef?.current;
        const el = targets?.[step]?.current;
        if (!app) { setBox(null); return; }
        const a = app.getBoundingClientRect();
        setAppH(a.height);
        if (!el) { setBox(null); return; }
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) { setBox(null); return; }
        const pad = s?.shape === "circle" ? 9 : 7;
        const nb = {
          top: r.top - a.top - pad, left: r.left - a.left - pad,
          width: r.width + pad * 2, height: r.height + pad * 2,
          radius: s?.shape === "circle" ? 999 : Math.min(24, (r.height + pad * 2) / 3),
        };
        // aktualizuj tylko przy realnej zmianie (bez zbędnych re-renderów)
        setBox((prev) => (prev
          && Math.abs(prev.top - nb.top) < 0.5 && Math.abs(prev.left - nb.left) < 0.5
          && Math.abs(prev.width - nb.width) < 0.5 && Math.abs(prev.height - nb.height) < 0.5)
          ? prev : nb);
      } catch (e) { setBox(null); }
    };

    // przewiń zawartość tak, by CAŁY element był widoczny (z miejscem na dymek)
    const bringIntoView = () => {
      try {
        const el = targets?.[step]?.current;
        if (!el || typeof el.closest !== "function") return;
        scroller = el.closest(".pa-scroll");
        if (!scroller) return;
        const er = el.getBoundingClientRect();
        const sr = scroller.getBoundingClientRect();
        const pad = 16;
        const bubbleSpace = 215; // miejsce na dymek pod elementem
        const fits = er.height + bubbleSpace <= sr.height;
        const delta = fits
          ? er.top - sr.top - pad                                        // do góry: dymek zmieści się pod spodem
          : er.top - sr.top - Math.max((sr.height - er.height) / 2, pad); // wyższy niż kadr: wyśrodkuj
        const top = Math.max(0, scroller.scrollTop + delta);
        if (typeof scroller.scrollTo === "function") scroller.scrollTo({ top, behavior: "smooth" });
        else scroller.scrollTop = top;
      } catch (e) { /* nic */ }
    };

    // śledź element przez ~1s: przez animację wejścia (620ms) i płynne przewijanie
    const loop = () => {
      measure();
      if (frames++ < 66) raf = requestAnimationFrame(loop);
    };

    bringIntoView();
    loop();
    const onMove = () => measure();
    scroller?.addEventListener?.("scroll", onMove, { passive: true });
    window.addEventListener("resize", onMove);
    return () => {
      cancelAnimationFrame(raf);
      scroller?.removeEventListener?.("scroll", onMove);
      window.removeEventListener("resize", onMove);
    };
  }, [step, targets, appRef, s]);
  if (!s) return null;
  const last = step === TUTORIAL_STEPS.length - 1;
  const spotStyle = box
    ? { top: box.top, left: box.left, width: box.width, height: box.height, borderRadius: box.radius }
    : s.spot; // fallback: pozycja przybliżona
  // dymek: pod reflektorem gdy ten jest w górnej połowie ekranu, nad — gdy w dolnej
  const bubbleStyle = box && appH
    ? (box.top + box.height / 2 < appH / 2
      ? { top: Math.min(box.top + box.height + 14, appH - 210), left: 20, right: 20 }
      : { bottom: Math.max(appH - box.top + 14, 96), left: 20, right: 20 })
    : s.bubble;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 70 }}>
      {/* reflektor: wycięcie + przyciemnienie całej reszty */}
      <div className="pa-spot" style={{ position: "absolute", transition: `all 320ms ${T.easeOut}`, ...spotStyle }} />
      {/* dymek */}
      <div key={step} className="pa-rise" style={{ position: "absolute", ...bubbleStyle, background: "var(--c-surface)", border: `1px solid ${T.mint}3A`,
        borderRadius: 20, padding: "16px 17px 14px", boxShadow: "0 24px 60px var(--sh2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div className="pa-display" style={{ fontSize: 15.5, fontWeight: 700, color: T.text }}>{s.title}</div>
          <span className="pa-mono" style={{ fontSize: 10, color: T.faint }}>{step + 1}/{TUTORIAL_STEPS.length}</span>
        </div>
        <div className="pa-body" style={{ fontSize: 12.5, color: T.sub, lineHeight: 1.6 }}>{s.body}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
          <button className="pa-press pa-body" onClick={onSkip}
            style={{ background: "none", border: "none", color: T.faint, fontSize: 11.5, fontWeight: 600, cursor: "pointer", padding: "6px 2px" }}>
            Pomiń samouczek
          </button>
          <button className="pa-press pa-display" onClick={onNext}
            style={{ padding: "9px 22px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
              background: `linear-gradient(135deg, ${T.mint}, ${T.mintDeep})`, color: "#06251A", boxShadow: `0 6px 18px ${T.mint}38` }}>
            {last ? "Rozumiem ✓" : "Dalej →"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 12 }}>
          {TUTORIAL_STEPS.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? T.mint : "rgba(var(--ovc),.12)", transition: "background 250ms ease" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- pole kodu zaproszenia (własny stan = nie gubi fokusa) ---------- */
function JoinCodeBox({ onJoin, busy, small }) {
  const [code, setCode] = useState("");
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input className="pa-body pa-mono" value={code} placeholder={small ? "MAM KOD" : "KOD"} maxLength={6}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        onKeyDown={(e) => { if (e.key === "Enter" && code.trim()) onJoin(code); }}
        style={{ width: small ? 110 : undefined, flex: small ? undefined : 1, padding: small ? "9px 11px" : "11px 13px", borderRadius: small ? 11 : 12,
          border: "1px solid rgba(var(--ovc),.14)", background: "var(--sf1)", fontSize: small ? 12 : 14,
          letterSpacing: ".2em", color: "var(--c-text)", textAlign: "center", outline: "none" }} />
      <button className="pa-press pa-body" disabled={busy} onClick={() => onJoin(code)}
        style={{ padding: small ? "9px 14px" : "0 18px", height: small ? undefined : 42, borderRadius: small ? 11 : 12,
          border: `1px solid ${T.mint}45`, background: `${T.mint}12`, color: T.mint, fontSize: small ? 11.5 : 12.5, fontWeight: 700, cursor: "pointer" }}>
        Dołącz
      </button>
    </div>
  );
}

/* ---------- EKRAN LOGOWANIA (Supabase) ---------- */

/* ---------- elementy ekranu startowego (poza komponentem = animacje nie restartują) ---------- */
  /* ---- tło: aurora + delikatna siatka ---- */
function Backdrop() {
  return (
    <>
      <div className="pa-aurora" style={{ top: -120, right: -80, width: 300, height: 300, background: `radial-gradient(circle, ${T.mint}2E, transparent 68%)` }} />
      <div className="pa-aurora" style={{ bottom: -100, left: -90, width: 260, height: 260, background: `radial-gradient(circle, ${T.gold}22, transparent 68%)`, animationDelay: "1.4s" }} />
    </>
  );
}

  /* ---- logo z wirującą aureolą ---- */
function Logo({ size = 78 }) {
  return (
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
      <div className="pa-halo" style={{ position: "absolute", inset: -9, borderRadius: 30,
        background: `conic-gradient(from 0deg, ${T.mint}00, ${T.mint}88, ${T.gold}66, ${T.mint}00)`,
        WebkitMask: "radial-gradient(circle, transparent 62%, #000 66%)", mask: "radial-gradient(circle, transparent 62%, #000 66%)" }} />
      <div className="pa-breathe" style={{ width: size, height: size, borderRadius: 26, display: "flex", alignItems: "center", justifyContent: "center",
        background: `linear-gradient(140deg, ${T.mint}, ${T.mintDeep})`, boxShadow: `0 18px 44px ${T.mint}40, inset 0 2px 0 rgba(255,255,255,.35)` }}>
        <Icon name="receipt" size={Math.round(size * 0.46)} sw={1.9} color="#06251A" />
      </div>
    </div>
  );
}

  /* ---- żywy pokaz: paragon skanowany w kółko ---- */
function LiveDemo({ demoN }) {
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 260, margin: "0 auto", borderRadius: 18, overflow: "hidden",
      background: T.paper, boxShadow: `0 20px 44px var(--sh2), 0 0 0 1px rgba(var(--ovc),.06)`, padding: "15px 16px 16px" }}>
      <div className="pa-w-scan" style={{ top: "6%" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 9 }}>
        <span className="pa-display" style={{ fontSize: 12, fontWeight: 700, color: T.paperInk }}>Biedronka</span>
        <span className="pa-mono" style={{ fontSize: 8.5, color: T.paperSub }}>DZIŚ 17:42</span>
      </div>
      <div style={{ height: 1, background: "rgba(0,0,0,.09)", marginBottom: 9 }} />
      <div style={{ minHeight: 92 }}>
        {DEMO_LINES.slice(0, demoN).map((it, i) => (
          <div key={it[0]} className="pa-w-item" style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6, animationDelay: `${i * 40}ms` }}>
            <span className="pa-body" style={{ fontSize: 10.5, color: T.paperInk, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it[0]}</span>
            <span className="pa-mono" style={{ fontSize: 10.5, color: T.paperInk, flexShrink: 0 }}>{it[1]}</span>
          </div>
        ))}
      </div>
      <div style={{ height: 1, background: "rgba(0,0,0,.09)", margin: "4px 0 8px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="pa-mono" style={{ fontSize: 9, letterSpacing: ".1em", color: T.paperSub }}>RAZEM</span>
        <span className="pa-display" style={{ fontSize: 15, fontWeight: 700, color: demoN >= DEMO_LINES.length ? "#0E7A5A" : T.paperSub }}>
          {demoN >= DEMO_LINES.length ? "27,75 zł" : "…"}
        </span>
      </div>
      {demoN >= DEMO_LINES.length && (
        <div className="pa-fade" style={{ position: "absolute", top: 11, right: 11, display: "flex", alignItems: "center", gap: 4,
          background: "#0E7A5A", borderRadius: 999, padding: "3px 8px" }}>
          <span style={{ fontSize: 8.5, color: "#fff", fontWeight: 700 }}>✓ ODCZYTANE</span>
        </div>
      )}
    </div>
  );
}


const DEMO_LINES = [["Mleko Łaciate 3,2%", "4,29"], ["Chleb wiejski", "5,49"], ["Masło extra 82%", "7,99"], ["Pomidory malinowe", "9,98"]];

function AuthScreen({ onGuest, onLoggedIn }) {
  const [stage, setStage] = useState("welcome"); // welcome | form
  const [showPass, setShowPass] = useState(false);
  const [demoN, setDemoN] = useState(0);
  useEffect(() => {
    if (stage !== "welcome") return undefined;
    const iv = setInterval(() => setDemoN((n) => (n >= DEMO_LINES.length ? 0 : n + 1)), 820);
    return () => clearInterval(iv);
  }, [stage]);
  const [mode, setMode] = useState("login"); // login | register
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const plErr = (m) => {
    const s = String(m || "");
    const l = s.toLowerCase();
    if (l.includes("invalid login credentials")) return "Nieprawidłowy e-mail lub hasło.";
    if (l.includes("user already registered") || l.includes("already been registered")) return "Konto z tym adresem już istnieje — zaloguj się.";
    if (l.includes("password should be at least")) return "Hasło musi mieć co najmniej 6 znaków.";
    if (l.includes("valid email") || l.includes("email address") && l.includes("invalid")) return "Ten adres e-mail został odrzucony przez serwer. Spróbuj innego.";
    if (l.includes("email not confirmed")) return "Potwierdź adres e-mail — sprawdź skrzynkę.";
    if (l.includes("signups not allowed") || l.includes("signup is disabled") || l.includes("sign ups") || l.includes("not allowed for this instance"))
      return "Rejestracja jest wyłączona w ustawieniach Supabase. Włącz: Authentication → Sign In / Providers → Email → „Allow new users to sign up”.";
    if (l.includes("provider is not enabled") || l.includes("unsupported provider")) return "Logowanie przez Google nie jest jeszcze włączone w tej aplikacji. Zaloguj się e-mailem i hasłem — albo poproś administratora o włączenie Google w Supabase.";
    if (l.includes("invalid api key") || l.includes("no api key")) return "Nieprawidłowy klucz API (VITE_SUPABASE_ANON_KEY). Skopiuj ponownie klucz publiczny z Supabase i zrób Redeploy.";
    if (l.includes("database error")) return "Błąd bazy danych po stronie Supabase — sprawdź, czy tabela user_state została utworzona (SQL z instrukcji).";
    if (l.includes("rate limit") || l.includes("too many")) return "Za dużo prób. Odczekaj kilka minut.";
    if (l.includes("failed to fetch") || l.includes("networkerror")) return "Brak połączenia z Supabase — sprawdź adres URL projektu.";
    return `Serwer odrzucił żądanie: ${s || "nieznany błąd"}`;
  };

  const submit = async () => {
    setErr(""); setInfo("");
    if (!supabase) { setErr("Konta w chmurze nie są jeszcze włączone w tej instalacji. Kliknij „Kontynuuj bez konta” — wszystko działa, a dane zapisują się na tym urządzeniu."); return; }
    const em = email.trim().toLowerCase();
    if (!em || !pass) { setErr("Podaj e-mail i hasło."); return; }
    if (mode === "register" && pass.length < 6) { setErr("Hasło musi mieć co najmniej 6 znaków."); return; }
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: em, password: pass });
        if (error) { console.error("Supabase signIn error:", error); setErr(plErr(error.message)); }
        else { try { localStorage.removeItem("paragon-guest"); } catch (e) {} onLoggedIn?.(); }
      } else {
        const { data, error } = await supabase.auth.signUp({ email: em, password: pass, options: { data: { name: name.trim() } } });
        if (error) { console.error("Supabase signUp error:", error); setErr(plErr(error.message)); }
        else if (data?.session) { try { localStorage.removeItem("paragon-guest"); } catch (e) {} onLoggedIn?.(); }
        else { setInfo("Konto utworzone! Sprawdź skrzynkę i kliknij link potwierdzający, potem zaloguj się."); setMode("login"); }
      }
    } catch (e) { console.error("Supabase auth exception:", e); setErr("Brak połączenia z serwerem. Sprawdź internet oraz adres URL projektu Supabase."); }
    setBusy(false);
  };

  const google = async () => {
    setErr(""); setBusy(true);
    if (!supabase) { setErr("Konta w chmurze nie są jeszcze włączone w tej instalacji. Kliknij „Kontynuuj bez konta” — wszystko działa, a dane zapisują się na tym urządzeniu."); setBusy(false); return; }
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
      if (error) setErr("Logowanie Google jest niedostępne. Skorzystaj z e-maila albo trybu bez konta.");
    } catch (e) { setErr("Brak połączenia. Sprawdź internet."); }
    setBusy(false);
  };


  const inputSt = { width: "100%", padding: "13px 14px", borderRadius: 14, border: `1px solid ${T.glassBorder}`,
    background: "var(--sf1)", color: T.text, fontSize: 14.5, outline: "none", boxSizing: "border-box" };
  const label = { display: "block", fontSize: 10, fontWeight: 600, color: T.faint, textTransform: "uppercase", letterSpacing: ".09em", marginBottom: 6 };

  /* ================= ETAP 1: POWITANIE ================= */
  if (stage === "welcome") {
    return (
      <div className="pa-fade" style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
        <Backdrop />
        <div className="pa-scroll" style={{ flex: 1, padding: "40px 24px calc(22px + env(safe-area-inset-bottom, 0px))", position: "relative", zIndex: 1, display: "flex", flexDirection: "column" }}>
          <div className="pa-rise" style={{ textAlign: "center" }}>
            <Logo />
            <div className="pa-display" style={{ fontSize: 28, fontWeight: 700, color: T.text, marginTop: 17, letterSpacing: "-.02em" }}>Paragon AI</div>
            <div className="pa-body" style={{ fontSize: 13, color: T.sub, marginTop: 6, lineHeight: 1.55, maxWidth: 270, marginLeft: "auto", marginRight: "auto" }}>
              Zrób zdjęcie paragonu — resztę zrobi AI.<br />Wydatki, budżet i oszczędności w jednym miejscu.
            </div>
          </div>

          <div className="pa-rise" style={{ margin: "26px 0 22px", animationDelay: "120ms" }}>
            <LiveDemo demoN={demoN} />
          </div>

          <div className="pa-rise" style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 22, animationDelay: "220ms" }}>
            {[["🤖", "Skan w 3 sekundy", "AI czyta pozycje, ceny i kategorie"],
              ["📊", "Wiesz, gdzie ucieka kasa", "Podział na kategorie, sklepy i trendy"],
              ["🏆", "38 osiągnięć i 30 poziomów", "Oszczędzanie, które wciąga"]].map(([ico, ttl, sub], i) => (
              <div key={ttl} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 14,
                background: "var(--sf1)", border: `1px solid ${T.glassBorderSoft}` }}>
                <span style={{ fontSize: 17, flexShrink: 0 }}>{ico}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="pa-display" style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>{ttl}</div>
                  <div className="pa-body" style={{ fontSize: 10.5, color: T.faint, marginTop: 1.5 }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ flex: 1, minHeight: 8 }} />

          <div className="pa-rise" style={{ animationDelay: "320ms" }}>
            <button className="pa-press pa-display pa-glow" onClick={() => { setStage("form"); setMode("register"); setErr(""); setInfo(""); }}
              style={{ width: "100%", padding: "15px 0", borderRadius: 16, border: "none", cursor: "pointer", fontSize: 15, fontWeight: 700,
                background: `linear-gradient(135deg, ${T.mint}, ${T.mintDeep})`, color: "#06251A" }}>
              Zacznij za darmo
            </button>
            <button className="pa-press pa-body" onClick={() => { setStage("form"); setMode("login"); setErr(""); setInfo(""); }}
              style={{ width: "100%", marginTop: 9, padding: "13px 0", borderRadius: 15, cursor: "pointer", fontSize: 13.5, fontWeight: 600,
                border: `1px solid ${T.glassBorder}`, background: "var(--sf1)", color: T.text }}>
              Mam już konto
            </button>
            <button className="pa-press pa-body" onClick={onGuest}
              style={{ width: "100%", marginTop: 14, background: "none", border: "none", color: T.faint, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Kontynuuj bez konta <span style={{ color: T.mint }}>→</span>
            </button>
            <div className="pa-body" style={{ fontSize: 10, color: T.faint, textAlign: "center", marginTop: 7, lineHeight: 1.5 }}>
              Bez konta dane zostają tylko na tym urządzeniu.
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ================= ETAP 2: FORMULARZ ================= */
  return (
    <div className="pa-slidein" style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <Backdrop />
      <div className="pa-scroll" style={{ flex: 1, padding: "16px 24px calc(24px + env(safe-area-inset-bottom, 0px))", position: "relative", zIndex: 1, display: "flex", flexDirection: "column" }}>
        <button className="pa-press" onClick={() => { setStage("welcome"); setErr(""); setInfo(""); }}
          style={{ alignSelf: "flex-start", width: 38, height: 38, borderRadius: 12, cursor: "pointer",
            border: `1px solid ${T.glassBorder}`, background: "var(--sf1)", color: T.sub, fontSize: 17 }}>‹</button>

        <div style={{ textAlign: "center", margin: "10px 0 22px" }}>
          <Logo size={56} />
          <div className="pa-display" style={{ fontSize: 21, fontWeight: 700, color: T.text, marginTop: 13 }}>
            {mode === "login" ? "Witaj ponownie" : "Załóż konto"}
          </div>
          <div className="pa-body" style={{ fontSize: 12, color: T.sub, marginTop: 4 }}>
            {mode === "login" ? "Twoje dane czekają w chmurze" : "Dane bezpieczne, dostępne na każdym urządzeniu"}
          </div>
        </div>

        <div style={{ display: "flex", background: "var(--sf1)", border: `1px solid ${T.glassBorderSoft}`, borderRadius: 999, padding: 4, marginBottom: 20 }}>
          {[["login", "Logowanie"], ["register", "Rejestracja"]].map(([id, lbl]) => (
            <button key={id} className="pa-press pa-body" onClick={() => { setMode(id); setErr(""); setInfo(""); }}
              style={{ flex: 1, padding: "9px 0", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                background: mode === id ? `linear-gradient(135deg, ${T.mint}, ${T.mintDeep})` : "none",
                color: mode === id ? "#06251A" : T.sub, transition: `all 240ms ${T.easeOut}` }}>{lbl}</button>
          ))}
        </div>

        {mode === "register" && (
          <div className="pa-fade" style={{ marginBottom: 13 }}>
            <label className="pa-body" style={label}>Imię (opcjonalnie)</label>
            <input className="pa-body" style={inputSt} value={name} placeholder="Jan" onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
          </div>
        )}
        <div style={{ marginBottom: 13 }}>
          <label className="pa-body" style={label}>E-mail</label>
          <input className="pa-body" style={inputSt} type="email" inputMode="email" value={email} placeholder="jan@example.com"
            onChange={(e) => setEmail(e.target.value)} autoComplete="email" onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        </div>
        <div style={{ marginBottom: 6 }}>
          <label className="pa-body" style={label}>Hasło</label>
          <div style={{ position: "relative" }}>
            <input className="pa-body" style={{ ...inputSt, paddingRight: 52 }} type={showPass ? "text" : "password"} value={pass}
              placeholder={mode === "register" ? "min. 6 znaków" : "••••••"} onChange={(e) => setPass(e.target.value)}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
            <button className="pa-press pa-body" type="button" onClick={() => setShowPass((v) => !v)}
              style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", padding: "7px 9px", borderRadius: 9,
                border: "none", background: "none", color: T.faint, fontSize: 15, cursor: "pointer" }}
              title={showPass ? "Ukryj hasło" : "Pokaż hasło"}>{showPass ? "🙈" : "👁️"}</button>
          </div>
        </div>

        {err && <div className="pa-body pa-fade" style={{ fontSize: 12, color: T.danger, background: "rgba(230,118,109,.1)", border: "1px solid rgba(230,118,109,.3)", borderRadius: 12, padding: "10px 12px", marginTop: 12, lineHeight: 1.5 }}>{err}</div>}
        {info && <div className="pa-body pa-fade" style={{ fontSize: 12, color: "#0E7A5A", background: "rgba(45,212,160,.12)", border: "1px solid rgba(45,212,160,.32)", borderRadius: 12, padding: "10px 12px", marginTop: 12, lineHeight: 1.5 }}>{info}</div>}

        <button className="pa-press pa-display" onClick={submit} disabled={busy}
          style={{ width: "100%", marginTop: 16, padding: "14px 0", borderRadius: 15, border: "none", cursor: "pointer", fontSize: 14.5, fontWeight: 700,
            background: `linear-gradient(135deg, ${T.mint}, ${T.mintDeep})`, color: "#06251A", boxShadow: `0 8px 24px ${T.mint}38`, opacity: busy ? 0.65 : 1 }}>
          {busy ? "Chwileczkę…" : mode === "login" ? "Zaloguj się" : "Utwórz konto"}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0" }}>
          <div style={{ flex: 1, height: 1, background: "var(--sf3)" }} />
          <span className="pa-body" style={{ fontSize: 10.5, color: T.faint }}>LUB</span>
          <div style={{ flex: 1, height: 1, background: "var(--sf3)" }} />
        </div>

        <button className="pa-press pa-body" onClick={google} disabled={busy}
          style={{ width: "100%", padding: "12px 0", borderRadius: 14, border: "1px solid rgba(var(--ovc),.16)", background: "#fff", color: "#1F2937",
            fontSize: 13.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 9, opacity: busy ? 0.6 : 1 }}>
          <svg width="17" height="17" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C36.9 40.2 44 35 44 24c0-1.3-.1-2.7-.4-3.9z"/></svg>
          Kontynuuj z Google
        </button>

        <div style={{ flex: 1, minHeight: 14 }} />
        <button className="pa-press pa-body" onClick={onGuest}
          style={{ background: "none", border: "none", color: T.faint, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "8px 0" }}>
          Kontynuuj bez konta <span style={{ color: T.mint }}>→</span>
        </button>
      </div>
    </div>
  );
}

/* szybkie ręczne dodawanie wydatku — długie przytrzymanie FAB */
function QuickAddSheet({ onSubmit, onClose }) {
  const [store, setStore] = useState(STORES[0]);
  const [date, setDate] = useState(todayKey());
  const [amount, setAmount] = useState("");
  const [cat, setCat] = useState("jedzenie_inne");
  const [err, setErr] = useState("");
  const touchY = useRef(null);
  const fieldStyle = { width: "100%", padding: "11px 12px", borderRadius: 12, border: "1px solid rgba(var(--ovc),.08)", background: "var(--sf1)", fontSize: 13.5, color: T.text, boxSizing: "border-box" };
  const submit = () => {
    const n = Number(String(amount).replace(",", ".").replace(/\s/g, ""));
    if (!(n > 0)) { setErr("Podaj kwotę większą od zera"); return; }
    onSubmit({ store, date: date || todayKey(), amount: Math.round(n * 100) / 100, category: cat });
  };
  return (
    <div className="pa-dim" onClick={onClose} style={{ position: "absolute", inset: 0, background: "var(--c-dim)", backdropFilter: "blur(3px)", zIndex: 65, display: "flex", alignItems: "flex-end" }}>
      <div className="pa-sheet pa-scroll" onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { touchY.current = e.touches[0].clientY; }}
        onTouchMove={(e) => { if (touchY.current !== null && e.touches[0].clientY - touchY.current > 70) { touchY.current = null; onClose(); } }}
        onTouchEnd={() => { touchY.current = null; }}
        style={{ background: "var(--c-surface)", border: "1px solid rgba(var(--ovc),.08)", borderBottom: "none", width: "100%", borderRadius: "22px 22px 0 0", padding: "14px 18px calc(26px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 -16px 50px var(--sh2)", maxHeight: "88%", boxSizing: "border-box" }}>
        <div style={{ width: 38, height: 4, background: "var(--sf3)", borderRadius: 2, margin: "0 auto 12px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div className="pa-display" style={{ fontSize: 16.5, fontWeight: 600, color: T.text }}>⚡ Szybki wydatek</div>
          <button className="pa-press" onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 9, border: "1px solid rgba(var(--ovc),.1)", background: "var(--sf1)", color: T.sub, fontSize: 13, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <input type="text" inputMode="decimal" autoFocus value={amount} placeholder="0,00"
            onChange={(e) => { setAmount(e.target.value); if (err) setErr(""); }}
            className="pa-mono" style={{ width: 180, textAlign: "center", fontSize: 28, fontWeight: 600, padding: "10px 12px", borderRadius: 14,
              border: err ? `1.5px solid ${T.danger}` : "1px solid rgba(var(--ovc),.1)", background: "var(--sf1)", color: T.text, boxSizing: "border-box" }} />
          <div className="pa-body" style={{ fontSize: 11, color: T.faint, marginTop: 5 }}>kwota w zł</div>
          {err && <div className="pa-body" style={{ fontSize: 11.5, color: T.danger, marginTop: 6, fontWeight: 600 }}>{err}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <div>
            <label className="pa-body" style={{ display: "block", fontSize: 10, fontWeight: 600, color: T.faint, textTransform: "uppercase", letterSpacing: ".09em", marginBottom: 5 }}>Sklep</label>
            <select value={store} onChange={(e) => setStore(e.target.value)} className="pa-body" style={fieldStyle}>
              {store && !STORES.includes(store) && <option value={store} style={{ background: "var(--c-surface)" }}>{store}</option>}
              {STORE_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.stores.map((s) => <option key={s} style={{ background: "var(--c-surface)" }}>{s}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="pa-body" style={{ display: "block", fontSize: 10, fontWeight: 600, color: T.faint, textTransform: "uppercase", letterSpacing: ".09em", marginBottom: 5 }}>Data</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="pa-body" style={fieldStyle} />
          </div>
          <div>
            <label className="pa-body" style={{ display: "block", fontSize: 10, fontWeight: 600, color: T.faint, textTransform: "uppercase", letterSpacing: ".09em", marginBottom: 5 }}>Kategoria</label>
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="pa-body" style={fieldStyle}>
              {CATEGORIES.map((c) => <option key={c.slug} value={c.slug} style={{ background: "var(--c-surface)" }}>{c.icon} {c.name}</option>)}
            </select>
          </div>
        </div>
        <button className="pa-press pa-display" onClick={submit}
          style={{ width: "100%", marginTop: 16, padding: "13px 0", borderRadius: 14, border: "none", background: `linear-gradient(135deg, ${T.mint}, ${T.mintDeep})`, color: "#06251A", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: `0 8px 24px ${T.mint}38` }}>
          Dodaj wydatek
        </button>
      </div>
    </div>
  );
}

/* ---------- przetwarzanie ---------- */
const PROCESSING_STEPS = ["Odczytuję paragon…", "Rozpoznaję produkty…", "Przypisuję kategorie…", "Liczę sumy…"];
function ProcessingView({ preview }) {
  const [step, setStep] = useState(0);
  useEffect(() => { const t = setInterval(() => setStep((s) => (s + 1) % PROCESSING_STEPS.length), 1700); return () => clearInterval(t); }, []);
  return (
    <div className="pa-fade" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ position: "relative", width: 200, height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* wirująca orbita AI */}
        <div className="pa-orbit" style={{ inset: 0, mask: "radial-gradient(circle, transparent 68%, #000 69%)", WebkitMask: "radial-gradient(circle, transparent 68%, #000 69%)" }} />
        {[0, 1].map((i) => (
          <div key={i} className="pa-ring-pulse" style={{ inset: 22, animationDelay: `${i * 1200}ms` }} />
        ))}
        {/* paragon */}
        <div className="pa-float" style={{ position: "relative", width: 116, height: 152, borderRadius: 12, overflow: "hidden", background: T.paper, boxShadow: `0 18px 50px var(--sh2), 0 0 0 1px rgba(var(--ovc),.1), 0 0 34px ${T.mint}30` }}>
          {preview ? <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div className="pa-shimmer" style={{ width: "100%", height: "100%" }} />}
          <div className="pa-scan" style={{ position: "absolute", left: -6, right: -6, top: 14, height: 2.5, background: T.mint, boxShadow: `0 0 22px 6px ${T.mint}88` }} />
          <div className="pa-scan" style={{ position: "absolute", left: 0, right: 0, top: 0, height: 46, background: `linear-gradient(180deg, ${T.mint}26, transparent)` }} />
        </div>
        {/* celownik */}
        <div className="pa-bracket" style={{ top: 14, left: 14, borderTop: "2.5px solid", borderLeft: "2.5px solid", borderTopLeftRadius: 6 }} />
        <div className="pa-bracket" style={{ top: 14, right: 14, borderTop: "2.5px solid", borderRight: "2.5px solid", borderTopRightRadius: 6, animationDelay: "300ms" }} />
        <div className="pa-bracket" style={{ bottom: 14, left: 14, borderBottom: "2.5px solid", borderLeft: "2.5px solid", borderBottomLeftRadius: 6, animationDelay: "600ms" }} />
        <div className="pa-bracket" style={{ bottom: 14, right: 14, borderBottom: "2.5px solid", borderRight: "2.5px solid", borderBottomRightRadius: 6, animationDelay: "900ms" }} />
      </div>
      <div key={step} className="pa-fade pa-display" style={{ marginTop: 20, fontSize: 15.5, fontWeight: 600, color: T.text }}>{PROCESSING_STEPS[step]}</div>
      <div className="pa-body" style={{ marginTop: 7, fontSize: 12, color: T.faint }}>Sztuczna inteligencja czyta zdjęcie · zwykle 5–10 sekund</div>
      <div style={{ display: "flex", gap: 5, marginTop: 18 }}>
        {PROCESSING_STEPS.map((_, i) => (
          <div key={i} style={{ width: i === step ? 18 : 6, height: 6, borderRadius: 3, background: i === step ? T.mint : "rgba(var(--ovc),.14)", transition: `all 250ms ${T.easeOut}` }} />
        ))}
      </div>
    </div>
  );
}

/* ============================================================ APLIKACJA */
function ParagonAIInner() {
  const [receipts, setReceipts] = useState([]);
  const [plan, setPlan] = useState(null);           // {tier, trialEndsAt?, members?[]}
  const [profile, setProfile] = useState({ name: "", email: "" });
  const [settings, setSettings] = useState({ push: true, budget: true, weekly: true });
  const [themePref, setThemePref] = useState("dark"); // preferencja URZĄDZENIA — poza synchronizacją
  const [quota, setQuota] = useState({ month: nowMonth(), used: 0 });
  const [budget, setBudget] = useState(null);
  const [budgets, setBudgets] = useState({});
  const [quickAdd, setQuickAdd] = useState(false);
  const [restockDone, setRestockDone] = useState({});
  const [goals, setGoals] = useState([]); // [{id,name,target,saved,icon}]
  const [income, setIncome] = useState(null); // miesięczny dochód (do "wolnych środków")
  const [loaded, setLoaded] = useState(false);
  const [onboarded, setOnboarded] = useState(true); // true do czasu wczytania, by nie mignął
  const [tutStep, setTutStep] = useState(null); // aktywny krok samouczka (null = wyłączony)
  const [tutorialDone, setTutorialDone] = useState(true);
  const [challenges, setChallenges] = useState([]); // wyzwania: {tplId, startKey, status, celebrated}
  const [claimedAch, setClaimedAch] = useState([]); // odebrane osiągnięcia (id)
  const [seenAch, setSeenAch] = useState([]);
  const [claimedLvls, setClaimedLvls] = useState([]); // odebrane nagrody poziomów (indeksy) // osiągnięcia, o których już powiadomiono
  const [achPopup, setAchPopup] = useState(null); // aktualnie wyświetlany popup osiągnięcia
  const [achFilter, setAchFilter] = useState("all"); // all | claim | done | todo
  const [lvlPop, setLvlPop] = useState(null); // węzeł ścieżki w trakcie animacji odbioru
  const [lvlInfo, setLvlInfo] = useState(null); // podgląd węzła ścieżki (dymek)
  const [achOpen, setAchOpen] = useState(null); // otwarte kategorie (null = auto)
  const [achDates, setAchDates] = useState({}); // id osiągnięcia -> timestamp odebrania
  const [bonusScans, setBonusScans] = useState(0);
  /* ---- ekonomia: Ziarna 🌱 ---- */
  const [seeds, setSeeds] = useState(0);
  const [freezes, setFreezes] = useState(0);        // posiadane ochrony serii
  const [freezeDays, setFreezeDays] = useState([]); // dni uratowane ochroną (znaczniki czasu)
  const [seedWeeks, setSeedWeeks] = useState([]);   // tygodnie już rozliczone (bonus za budżet)
  const [themesOwned, setThemesOwned] = useState([]);
  const [claimedStreaks, setClaimedStreaks] = useState([]); // odebrane kamienie milowe serii // darmowe skany z nagród (ponad limit planu)
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(!AUTH_ENABLED);
  const [guest, setGuest] = useState(false); // "kontynuuj bez konta"
  const [household, setHousehold] = useState(null); // {id, name, inviteCode, role, members:[{userId,name}]}
  const [householdBusy, setHouseholdBusy] = useState(false);
  const [householdErr, setHouseholdErr] = useState("");
  useEffect(() => {
    if (!AUTH_ENABLED) return;
    let sub;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setSession(data?.session || null);
        sub = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null)).data?.subscription;
      } catch (e) { /* offline — tryb lokalny */ }
      setAuthChecked(true);
    })();
    return () => sub?.unsubscribe?.();
  }, []);

  const [tab, setTab] = useState("pulpit");
  const [view, setView] = useState({ name: "tabs" }); // tabs|scan|camera|verify|details|plans
  const [month, setMonth] = useState(nowMonth());
  const [scan, setScan] = useState({ step: "pick" });
  const [draft, setDraft] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [confirmBox, setConfirmBox] = useState(null);
  const [inputSheet, setInputSheet] = useState(null);
  const [toast, setToast] = useState(null);
  const [drill, setDrill] = useState(null);
  const [searchQ, setSearchQ] = useState("");
  const [selPlan, setSelPlan] = useState("pro");
  const [billing, setBilling] = useState("monthly"); // monthly | yearly (-30%)
  const fileRef = useRef(null);
  const scrollRef = useRef(null);
  const backupRef = useRef(null);
  const appRef = useRef(null);
  const tutFabRef = useRef(null);
  const tutHeroRef = useRef(null);
  const tutMonthRef = useRef(null);
  const tutNavRef = useRef(null);
  const tutProfileRef = useRef(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [tab, view.name]);

  /* przywracanie kopii zapasowej z pliku JSON */
  function restoreBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const data = parsed && parsed.app === "paragon-ai" && parsed.data ? parsed.data : parsed;
        if (!data || !Array.isArray(data.receipts)) { showToast("To nie jest kopia zapasowa Paragon AI"); return; }
        setConfirmBox({
          title: "Przywrócić kopię?",
          body: `Znaleziono ${data.receipts.length} paragonów. Obecne dane w aplikacji zostaną zastąpione danymi z pliku.`,
          confirmLabel: "Przywróć",
          onConfirm: () => {
            setReceipts(Array.isArray(data.receipts) ? data.receipts : []);
            if (data.plan && data.plan.tier) setPlan(data.plan);
            if (data.profile) setProfile({ name: data.profile.name || "", email: data.profile.email || "" });
            if (data.settings) setSettings((s) => ({ ...s, ...data.settings }));
            if (data.quota && data.quota.month) setQuota(data.quota);
            if (typeof data.budget === "number") setBudget(data.budget);
            if (data.budgets && typeof data.budgets === "object") setBudgets(data.budgets);
            if (Array.isArray(data.goals)) setGoals(data.goals);
            if (typeof data.income === "number" && data.income > 0) setIncome(data.income);
            if (Array.isArray(data.challenges)) setChallenges(data.challenges);
            if (Array.isArray(data.claimedAch)) setClaimedAch(data.claimedAch);
            if (Array.isArray(data.seenAch)) setSeenAch(data.seenAch);
            if (Array.isArray(data.claimedLvls)) setClaimedLvls(data.claimedLvls);
            if (data.achDates && typeof data.achDates === "object") setAchDates(data.achDates);
            if (typeof data.bonusScans === "number" && data.bonusScans > 0) setBonusScans(Math.floor(data.bonusScans));
            setConfirmBox(null); showToast("Kopia przywrócona ✓"); navigator.vibrate?.(30);
          },
        });
      } catch (e) { showToast("Nie udało się odczytać pliku kopii"); }
    };
    reader.readAsText(file);
  }

  /* ---- trwały zapis + synchronizacja z chmurą ---- */
  const applyState = (st) => {
    setReceipts(st.receipts || []);
    setProfile(st.profile || { name: "", email: "" });
    setSettings({ push: true, budget: true, weekly: true, ...(st.settings || {}) });
    setQuota(st.quota && st.quota.month === nowMonth() ? st.quota : { month: nowMonth(), used: 0 });
    setPlan(st.plan && st.plan.tier && st.plan.tier !== "trial" ? st.plan : { tier: "free" });
    setBudget(typeof st.budget === "number" && st.budget > 0 ? st.budget : null);
    setBudgets(st.budgets && typeof st.budgets === "object" ? st.budgets : {});
    setGoals(Array.isArray(st.goals) ? st.goals : []);
    setIncome(typeof st.income === "number" && st.income > 0 ? st.income : null);
    setOnboarded(st.onboarded !== false);
    setTutorialDone(st.tutorialDone !== false);
    setChallenges(Array.isArray(st.challenges) ? st.challenges : []);
    setClaimedAch(Array.isArray(st.claimedAch) ? st.claimedAch : []);
    setSeenAch(Array.isArray(st.seenAch) ? st.seenAch : []);
    setClaimedLvls(Array.isArray(st.claimedLvls) ? st.claimedLvls : []);
    setAchDates(st.achDates && typeof st.achDates === "object" ? st.achDates : {});
    setBonusScans(typeof st.bonusScans === "number" && st.bonusScans > 0 ? Math.floor(st.bonusScans) : 0);
    setSeeds(Math.max(0, Math.floor(Number(st.seeds) || 0)));
    setFreezes(Math.max(0, Math.min(2, Math.floor(Number(st.freezes) || 0))));
    setFreezeDays(Array.isArray(st.freezeDays) ? st.freezeDays.filter((t) => typeof t === "number" && t > 0) : []);
    setSeedWeeks(Array.isArray(st.seedWeeks) ? st.seedWeeks.filter((w) => typeof w === "string") : []);
    setThemesOwned(Array.isArray(st.themesOwned) ? st.themesOwned.filter((t) => typeof t === "string") : []);
    setClaimedStreaks(Array.isArray(st.claimedStreaks) ? st.claimedStreaks.filter((n) => typeof n === "number") : []);
  };
  useEffect(() => {
    if (!authChecked) return;
    (async () => {
      // 1) stan lokalny (zawsze czytamy — może posłużyć do migracji na konto)
      let localSt = null;
      try {
        const res = await store.get("paragon-state");
        if (res && res.value) localSt = JSON.parse(res.value);
      } catch (e) { /* brak */ }
      if (!localSt) {
        try {
          const old = await store.get("paragon-receipts");
          if (old && old.value) localSt = { receipts: JSON.parse(old.value) };
        } catch (e) { /* brak */ }
      }
      try { setGuest(localStorage.getItem("paragon-guest") === "1"); } catch (e) { /* nic */ }

      // 2) zalogowany → stan z chmury (a przy pierwszym logowaniu migrujemy lokalny)
      if (AUTH_ENABLED && session?.user?.id) {
        try {
          // 2a) członek rodziny? → wspólny stan rodziny ma pierwszeństwo
          const hh = await refreshHousehold();
          if (hh) {
            const { data: hs } = await supabase.from("household_state").select("state").eq("household_id", hh.id).maybeSingle();
            if (hs?.state) { applyState(hs.state); setLoaded(true); return; }
          }
          const { data, error } = await supabase.from("user_state").select("state").eq("user_id", session.user.id).maybeSingle();
          if (!error && data?.state) {
            applyState(data.state);
            setLoaded(true);
            return;
          }
          if (!error && !data && localSt && (localSt.receipts?.length || localSt.goals?.length)) {
            // pierwsze logowanie z danymi lokalnymi → przenosimy je na konto
            await supabase.from("user_state").upsert({ user_id: session.user.id, state: localSt, updated_at: new Date().toISOString() });
            applyState(localSt);
            setLoaded(true);
            showToast("Dane przeniesione na Twoje konto ☁️");
            return;
          }
        } catch (e) { /* offline → lokalnie poniżej */ }
      }

      // 3) tryb lokalny / brak danych w chmurze
      if (localSt) applyState(localSt);
      else { setPlan({ tier: "free" }); setOnboarded(false); setTutorialDone(false); }
      setLoaded(true);
    })();
  }, [authChecked, session?.user?.id]);

  /* ---------- RODZINA (Family multi-konto) ---------- */
  const genInviteCode = () => Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");

  const refreshHousehold = async () => {
    if (!AUTH_ENABLED || !session?.user?.id) { setHousehold(null); return null; }
    try {
      const { data: mem, error: e1 } = await supabase.from("household_members").select("household_id").eq("user_id", session.user.id).maybeSingle();
      if (e1 || !mem) { setHousehold(null); return null; }
      const { data: hh, error: e2 } = await supabase.from("households").select("id,name,owner_id,invite_code").eq("id", mem.household_id).maybeSingle();
      if (e2 || !hh) { setHousehold(null); return null; }
      const { data: members } = await supabase.from("household_members").select("user_id,name").eq("household_id", hh.id);
      const h = {
        id: hh.id, name: hh.name, inviteCode: hh.invite_code,
        role: hh.owner_id === session.user.id ? "owner" : "member",
        members: (members || []).map((m) => ({ userId: m.user_id, name: m.name || "Domownik" })),
      };
      setHousehold(h);
      return h;
    } catch (e) { setHousehold(null); return null; }
  };

  const createHousehold = async (name) => {
    if (!session?.user?.id) return;
    setHouseholdBusy(true); setHouseholdErr("");
    try {
      const code = genInviteCode();
      const { data: hh, error: e1 } = await supabase.from("households").insert({ name: name || "Moja rodzina", owner_id: session.user.id, invite_code: code }).select().single();
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("household_members").insert({ household_id: hh.id, user_id: session.user.id, name: profile.name || "Ja" });
      if (e2) throw e2;
      // przenosimy obecny stan konta jako startowy stan rodziny
      const snapshot = { receipts, plan, profile, settings, quota, budget, budgets, goals, income, onboarded, tutorialDone, challenges, claimedAch, seenAch, claimedLvls, achDates, bonusScans, seeds, freezes, freezeDays, seedWeeks, themesOwned, claimedStreaks };
      await supabase.from("household_state").upsert({ household_id: hh.id, state: snapshot, updated_at: new Date().toISOString() });
      await refreshHousehold();
      showToast("Rodzina założona 🎉");
    } catch (e) {
      console.error("createHousehold error:", e);
      setHouseholdErr("Nie udało się założyć rodziny. Sprawdź, czy tabele household_* istnieją w Supabase (SQL z instrukcji).");
    }
    setHouseholdBusy(false);
  };

  const joinHousehold = async (codeRaw) => {
    if (!session?.user?.id) return;
    const code = codeRaw.trim().toUpperCase();
    if (code.length < 4) { setHouseholdErr("Podaj poprawny kod zaproszenia."); return; }
    setHouseholdBusy(true); setHouseholdErr("");
    try {
      const { data: hh, error: e1 } = await supabase.from("households").select("id,name").eq("invite_code", code).maybeSingle();
      if (e1 || !hh) { setHouseholdErr("Nie znaleziono rodziny z tym kodem. Sprawdź, czy jest poprawny."); setHouseholdBusy(false); return; }
      const { error: e2 } = await supabase.from("household_members").insert({ household_id: hh.id, user_id: session.user.id, name: profile.name || "Domownik" });
      if (e2) { setHouseholdErr(e2.message?.includes("duplicate") ? "Już należysz do jakiejś rodziny." : "Nie udało się dołączyć."); setHouseholdBusy(false); return; }
      const { data: st } = await supabase.from("household_state").select("state").eq("household_id", hh.id).maybeSingle();
      if (st?.state) applyState(st.state);
      await refreshHousehold();
      showToast(`Dołączono do rodziny „${hh.name}" 👨‍👩‍👧`);
    } catch (e) {
      console.error("joinHousehold error:", e);
      setHouseholdErr("Brak połączenia z serwerem. Spróbuj ponownie.");
    }
    setHouseholdBusy(false);
  };

  const leaveHousehold = async () => {
    if (!session?.user?.id || !household) return;
    setHouseholdBusy(true);
    try {
      await supabase.from("household_members").delete().eq("household_id", household.id).eq("user_id", session.user.id);
      setHousehold(null);
      showToast("Opuszczono rodzinę");
    } catch (e) { console.error("leaveHousehold error:", e); }
    setHouseholdBusy(false);
  };

  const deleteHousehold = async () => {
    if (!household || household.role !== "owner") return;
    setHouseholdBusy(true);
    try {
      await supabase.from("households").delete().eq("id", household.id);
      setHousehold(null);
      showToast("Rodzina rozwiązana");
    } catch (e) { console.error("deleteHousehold error:", e); }
    setHouseholdBusy(false);
  };


  useEffect(() => {
    if (!loaded) return;
    try {
      const p = new URLSearchParams(window.location.search);
      const paid = p.get("paid");
      if (paid && ["starter", "pro", "family"].includes(paid)) {
        const cycle = p.get("cycle") === "y" ? "yearly" : "monthly";
        setPlan((prev) => ({ tier: paid, billing: cycle, members: paid === "family" ? (prev?.members?.length ? prev.members : [{ id: uid(), name: profile.name || "Ty", owner: true }]) : undefined }));
        window.history.replaceState({}, "", window.location.pathname);
        showToast(`Płatność przyjęta — plan ${paid === "starter" ? "Starter" : paid === "pro" ? "Pro" : "Family"} aktywny 🎉`);
        navigator.vibrate?.([30, 60, 30]);
      }
    } catch (e) { /* nic */ }
  }, [loaded]);

  const syncTimer = useRef(null);
  useEffect(() => {
    if (!loaded) return;
    const snapshot = { receipts, plan, profile, settings, quota, budget, budgets, goals, income, onboarded, tutorialDone, challenges, claimedAch, seenAch, claimedLvls, achDates, bonusScans, seeds, freezes, freezeDays, seedWeeks, themesOwned, claimedStreaks };
    (async () => {
      try { await store.set("paragon-state", JSON.stringify(snapshot)); }
      catch (e) { console.error(e); }
    })();
    // synchronizacja do chmury (debounce, żeby nie zalewać bazy)
    if (AUTH_ENABLED && session?.user?.id) {
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(async () => {
        try {
          if (household?.id) await supabase.from("household_state").upsert({ household_id: household.id, state: snapshot, updated_at: new Date().toISOString() });
          else await supabase.from("user_state").upsert({ user_id: session.user.id, state: snapshot, updated_at: new Date().toISOString() });
        }
        catch (e) { /* offline — lokalny zapis wystarczy */ }
        syncTimer.current = null;
      }, 1200);
    }
  }, [receipts, plan, profile, settings, quota, budget, budgets, goals, income, onboarded, tutorialDone, challenges, claimedAch, seenAch, claimedLvls, achDates, bonusScans, seeds, freezes, freezeDays, seedWeeks, themesOwned, claimedStreaks, loaded, session?.user?.id, household?.id]);

  useEffect(() => {
    if (!AUTH_ENABLED || !household?.id || !loaded) return;
    const pull = async () => {
      if (document.visibilityState !== "visible") return;
      if (syncTimer.current) return; // trwa wysyłka lokalnych zmian — nie nadpisuj
      try {
        const { data } = await supabase.from("household_state").select("state,updated_at").eq("household_id", household.id).maybeSingle();
        if (data?.state) applyState(data.state);
      } catch (e) { /* offline */ }
    };
    document.addEventListener("visibilitychange", pull);
    const iv = setInterval(pull, 45000); // co 45 s, gdy apka otwarta
    return () => { document.removeEventListener("visibilitychange", pull); clearInterval(iv); };
  }, [household?.id, loaded]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await store.get("paragon-theme");
      if (alive && r?.value && ["dark", "light", "auto", "gold", "navy"].includes(r.value)) setThemePref(r.value);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const mq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
    const apply = () => {
      const mode = themePref === "auto" ? (mq && mq.matches ? "light" : "dark") : themePref;
      const isLight = mode === "light";
      try {
        document.documentElement.dataset.paTheme = mode;
        document.documentElement.style.colorScheme = isLight ? "light" : "dark";
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute("content", { light: "#EFF4F0", gold: "#14100A", navy: "#0A1020" }[mode] || "#0A1410");
        document.body.style.background = { light: "#EFF4F0", gold: "#14100A", navy: "#0A1020" }[mode] || "#0A1410";
      } catch (e) { /* nic */ }
    };
    apply();
    store.set("paragon-theme", themePref);
    if (themePref === "auto" && mq) {
      mq.addEventListener?.("change", apply);
      return () => mq.removeEventListener?.("change", apply);
    }
    return undefined;
  }, [themePref]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2400); };

  /* ---- plan / limity ---- */
  const baseTier = plan?.tier && TIER_BADGE[plan.tier] ? plan.tier : "free";
  const proTrialActive = baseTier === "free" && (plan?.proUntil || 0) > Date.now();
  const effTier = proTrialActive ? "pro" : baseTier;
  const tierLimit = effTier === "free" ? 5 : effTier === "starter" ? 30 : null;
  const canScan = tierLimit === null || quota.used < tierLimit || bonusScans > 0;
  const badge = TIER_BADGE[effTier];
  const isPro = effTier === "pro" || effTier === "family";
  const hasGoals = effTier === "starter" || isPro; // cele: od Startera w górę
  const GOAL_ICONS = ["🎯", "✈️", "🏖️", "🚗", "🎁", "🏠", "💻", "📱", "🎓", "💍"];
  function addGoal(name, target, icon, deadline) {
    setGoals((g) => [...g, { id: uid(), name: name.trim(), target: Math.round(target * 100) / 100, saved: 0, icon: icon || "🎯", deadline: deadline || null }]);
  }
  function depositGoal(id, amount) {
    if (income != null && freeFunds != null && amount > freeFunds) return false;
    setGoals((g) => g.map((x) => x.id === id ? { ...x, saved: Math.max(0, Math.round((x.saved + amount) * 100) / 100) } : x));
    return true;
  }
  const members = effTier === "family" ? (plan?.members || []) : [];
  const memberName = (id) => members.find((m) => m.id === id)?.name || members[0]?.name || "Ty";

  function activatePlan(id) {
    // Prawdziwa płatność: przekierowanie do Stripe Payment Link (jeśli skonfigurowany).
    if (id !== "free") {
      const link = STRIPE_LINKS[id]?.[billing] || STRIPE_LINKS[id]?.monthly || "";
      if (link) {
        const ref = session?.user?.id || "local";
        const url = link + (link.includes("?") ? "&" : "?") + "client_reference_id=" + encodeURIComponent(ref);
        showToast("Przenoszę do bezpiecznej płatności…");
        setTimeout(() => { window.location.href = url; }, 350);
        return;
      }
    }
    // Tryb bez płatności (brak linków Stripe) — aktywacja symulowana jak dotychczas.
    setPlan((prev) => ({ tier: id, billing: id === "free" ? undefined : billing, members: id === "family" ? (prev?.members?.length ? prev.members : [{ id: uid(), name: profile.name || "Ty", owner: true }]) : undefined }));
    setView({ name: "tabs" }); setTab("profil");
    showToast(id === "free" ? "Jesteś na planie Free" : `Plan ${PLANS.find((p) => p.id === id).name} aktywny 🎉`);
  }

  /* ---- długie przytrzymanie FAB → szybki wydatek ---- */
  const lpTimer = useRef(null);
  const lpFired = useRef(false);
  const fabDown = () => {
    if (lpTimer.current) clearTimeout(lpTimer.current);
    lpFired.current = false;
    lpTimer.current = setTimeout(() => { lpFired.current = true; navigator.vibrate?.(30); setQuickAdd(true); }, 500);
  };
  const fabUp = () => { if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; } };
  const fabClick = () => { if (lpFired.current) { lpFired.current = false; return; } startScan(); };

  /* ---- skanowanie ---- */
  function startScan() {
    if (!canScan) { setView({ name: "plans", reason: "limit" }); return; }
    setView({ name: "scan" }); setScan({ step: "pick" });
  }
  async function processDataUrl(dataUrl) {
    setView({ name: "scan" });
    setScan({ step: "processing" });
    try {
      const { base64, mediaType, preview } = await dataUrlScaled(dataUrl);
      setScan({ step: "processing", preview });
      const parsed = await parseReceiptWithAI(base64, mediaType);
      const items = (parsed.items || []).map((i) => ({
        id: uid(), name: i.name || "Pozycja", qty: Number(i.qty) || 1,
        total_price: Math.round((Number(i.total_price) || 0) * 100) / 100,
        category: CATEGORIES.some((c) => c.slug === i.category) ? i.category : "inne",
      }));
      setDraft({
        id: uid(), store: (String(parsed.store || "").trim().slice(0, 40)) || "Inny sklep",
        date: parsed.date || todayKey(),
        total: Math.round((Number(parsed.total) || items.reduce((s, i) => s + i.total_price, 0)) * 100) / 100,
        items, createdAt: Date.now(), scanned: true,
      });
      setView({ name: "verify" });
      setScan({ step: "pick" });
      if (!items.length) showToast("Odczytałem paragon, ale nie pozycje — dodaj je ręcznie");
    } catch (e) {
      const reasons = {
        nokey: "Brak klucza API Groq. Dodaj klucz w ustawieniach projektu (VITE_GROQ_API_KEY), aby włączyć skanowanie. Na razie możesz dodawać paragony ręcznie.",
        not_receipt: "To zdjęcie nie wygląda na paragon. Wykadruj sam paragon i spróbuj ponownie.",
        network: "Brak połączenia z internetem. Sprawdź sieć i spróbuj ponownie.",
        rate: "Za dużo zapytań w krótkim czasie. Odczekaj chwilę i spróbuj ponownie.",
        http: "Usługa rozpoznawania chwilowo nie odpowiada. Spróbuj ponownie za moment.",
        parse: "Nie udało się odczytać tego paragonu. Zrób ostrzejsze zdjęcie w dobrym świetle albo dodaj wpis ręcznie.",
      };
      const reasonMsg = reasons[e.message] || `Nie udało się odczytać paragonu. ${e.detail || "Sprawdź ostrość i oświetlenie."}`;
      setScan({ step: "error", reason: reasonMsg });
    }
  }
  async function handleFile(file) {
    if (!file) return;
    if (!canScan) { setView({ name: "plans", reason: "limit" }); return; }
    try { processDataUrl(await fileToDataUrl(file)); }
    catch (e) { setScan({ step: "error", reason: "Nie udało się odczytać pliku." }); setView({ name: "scan" }); }
  }
  function newManualDraft() {
    setDraft({ id: uid(), store: "Biedronka", date: todayKey(), total: 0, items: [], createdAt: Date.now(), manual: true });
    setView({ name: "verify" });
  }
  function saveDraft() {
    const items = draft.items.map((i) => ({ ...i, total_price: Math.round((Number(String(i.total_price).replace(",", ".")) || 0) * 100) / 100 }));
    const total = items.length ? Math.round(items.reduce((s, i) => s + i.total_price, 0) * 100) / 100 : Number(draft.total) || 0;
    const rec = { ...draft, items, total, memberId: draft.memberId || members[0]?.id };
    setReceipts((rs) => [rec, ...rs.filter((r) => !r.sample)]);
    addSeeds(SEED_SCAN);
    if (rec.scanned && tierLimit !== null) {
      const usedNow = quota.month === nowMonth() ? quota.used : 0;
      if (usedNow >= tierLimit && bonusScans > 0) { setBonusScans((b) => Math.max(b - 1, 0)); showToast(`Użyto bonusowego skanu · zostało ${bonusScans - 1} 🎁`); }
      else setQuota({ month: nowMonth(), used: usedNow + 1 });
    }
    setMonth(monthKey(rec.date) || nowMonth());
    setView({ name: "tabs" }); setTab("pulpit"); setDraft(null);
    showToast("Paragon zapisany ✓");
  }
  function updateItem(receiptId, itemId, patch) {
    if (receiptId === "draft") setDraft((d) => ({ ...d, items: d.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) }));
    else setReceipts((rs) => rs.map((r) => r.id !== receiptId ? r : { ...r, items: r.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) }));
  }
  function deleteReceipt(id) {
    setReceipts((rs) => rs.filter((r) => r.id !== id));
    setView({ name: "tabs" }); setTab("paragony"); setConfirmBox(null);
    showToast("Paragon usunięty");
  }

  /* ---- dane miesiąca ---- */
  const monthReceipts = useMemo(() => receipts.filter((r) => monthKey(r.date) === month).sort((a, b) => (a.date < b.date ? 1 : -1)), [receipts, month]);
  const monthTotal = useMemo(() => monthReceipts.reduce((s, r) => s + (Number(r.total) || 0), 0), [monthReceipts]);
  const prevTotal = useMemo(() => receipts.filter((r) => monthKey(r.date) === shiftMonth(month, -1)).reduce((s, r) => s + (Number(r.total) || 0), 0), [receipts, month]);
  const byCategory = useMemo(() => {
    const map = {};
    monthReceipts.forEach((r) => r.items.forEach((i) => { const cat = i.category || "inne"; map[cat] = (map[cat] || 0) + (Number(i.total_price) || 0); }));
    return Object.entries(map).map(([slug, value]) => ({ slug, value, ...catBySlug(slug) })).sort((a, b) => b.value - a.value);
  }, [monthReceipts]);
  const delta = prevTotal > 0 ? Math.round(((monthTotal - prevTotal) / prevTotal) * 100) : null;
  const heroAmount = useCountUp(monthTotal, 900);
  const heroPace = useMemo(() => {
    if (!monthReceipts.length || monthTotal <= 0) return null;
    const dim = daysInMonth(month);
    const isCur = month === nowMonth();
    const elapsed = isCur ? Math.max(Number(todayKey().slice(8, 10)), 1) : dim;
    const perDay = monthTotal / elapsed;
    const forecast = isCur && elapsed < dim ? perDay * dim : null;
    return { perDay, forecast, worse: forecast != null && prevTotal > 0 && forecast > prevTotal };
  }, [monthReceipts, monthTotal, month, prevTotal]);
  const allTotal = useMemo(() => receipts.reduce((s, r) => s + (Number(r.total) || 0), 0), [receipts]);
  const totalSavedAll = useMemo(() => goals.reduce((s, g) => s + (Number(g.saved) || 0), 0), [goals]);
  const curMonthSpent = useMemo(() => receipts.filter((r) => monthKey(r.date) === nowMonth()).reduce((s, r) => s + (Number(r.total) || 0), 0), [receipts]);
  const streak = useMemo(() => computeStreak(receipts, freezeDays), [receipts, freezeDays]);
  const realReceipts = useMemo(() => receipts.filter((r) => !r.sample), [receipts]);
  const realStreak = useMemo(() => computeStreak(realReceipts, freezeDays), [realReceipts, freezeDays]);
  const hasSample = realReceipts.length !== receipts.length;
  const sTier = streakTier(realStreak);          // 🔥 próg serii
  const sNext = streakNext(realStreak);
  const seedMult = sTier.mult;                   // mnożnik WSZYSTKICH Ziaren
  const addSeeds = (n) => setSeeds((v) => v + Math.round(n * seedMult));

  /* 🧊 ochrona serii: gdy wczoraj wypadło, a masz ochronę — zużyj ją i uratuj passę */
  useEffect(() => {
    if (!loaded || freezes <= 0) return;
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const today = d0.getTime();
    const yest = today - 864e5;
    const dayOf = (r) => { const d = new Date(r.createdAt || 0); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const days = new Set(realReceipts.map(dayOf).filter((t) => t > 0));
    if (!days.size) return;
    if (days.has(yest) || freezeDays.includes(yest)) return;   // wczoraj jest pokryte
    const last = Math.max(...days);
    if (last !== yest - 864e5) return;                          // ratujemy tylko świeżą przerwę (przedwczoraj)
    setFreezes((f) => Math.max(0, f - 1));
    setFreezeDays((arr) => [...arr, yest].slice(-30));
    showToast("🧊 Ochrona serii uratowała Twoją passę!");
    navigator.vibrate?.([25, 60, 25]);
  }, [loaded, freezes, freezeDays, realReceipts]);

  /* 🔥 kamienie milowe serii — jednorazowe prezenty */
  useEffect(() => {
    if (!loaded || realStreak <= 0) return;
    const due = Object.keys(STREAK_GIFTS).map(Number).sort((x, y) => x - y)
      .filter((d) => realStreak >= d && !claimedStreaks.includes(d));
    if (!due.length) return;
    const top = due[due.length - 1];
    let sd = 0, fz = 0, pd = 0, ttl = null;
    due.forEach((d) => { const g = STREAK_GIFTS[d];
      sd += g.seeds || 0; fz += g.freeze || 0; pd += g.proDays || 0; if (g.title) ttl = g.title; });
    setClaimedStreaks((arr) => [...arr, ...due]);
    if (sd) setSeeds((v) => v + Math.round(sd * seedMult));
    if (fz) setFreezes((f) => Math.min(2, f + fz));
    if (pd) setPlan((p) => ({ ...p, proUntil: Math.max(p?.proUntil || 0, Date.now()) + pd * 864e5 }));
    if (ttl) setProfile((p) => ({ ...p, title: ttl }));
    const parts = [];
    if (sd) parts.push(`+${Math.round(sd * seedMult)} 🌱`);
    if (fz) parts.push(`+${fz} 🧊 ochrona`);
    if (pd) parts.push(`+${pd} ${pd === 1 ? "dzień" : "dni"} Pro 👑`);
    if (ttl) parts.push(`tytuł „${ttl}"`);
    setCelebrate({ emoji: streakTier(top).emoji, title: `Seria ${top} dni!`,
      badge: parts.join(" · "), tag: STREAK_GIFTS[top].msg });
    navigator.vibrate?.([40, 70, 40, 70, 130]);
  }, [loaded, realStreak, claimedStreaks, seedMult]);

  /* 🌱 rozliczenie zakończonych tygodni: pod budżetem = nagroda */
  useEffect(() => {
    if (!loaded || !budget || budget <= 0) return;
    const wkKey = (d) => { const t = new Date(d); const day = (t.getDay() + 6) % 7; t.setDate(t.getDate() - day); t.setHours(0,0,0,0); return t.toISOString().slice(0, 10); };
    const nowWk = wkKey(new Date());
    const weekly = budget / 4.345;                       // budżet miesięczny → tygodniowy
    const spentBy = {};
    realReceipts.forEach((r) => { const k = wkKey(r.date || r.createdAt); spentBy[k] = (spentBy[k] || 0) + (r.total || 0); });
    const done = Object.keys(spentBy).filter((k) => k < nowWk && spentBy[k] <= weekly && !seedWeeks.includes(k));
    if (!done.length) return;
    setSeedWeeks((w) => [...w, ...done]);
    const gain = Math.round(done.length * SEED_WEEK_BUDGET * seedMult);
    setSeeds((v) => v + gain);
    showToast(`🌱 +${gain} za tydzień pod budżetem!${seedMult > 1 ? ` (×${seedMult} od serii)` : ""}`);
  }, [loaded, realReceipts, budget, seedWeeks]);

  const freeFunds = income != null ? Math.round((income - curMonthSpent - totalSavedAll) * 100) / 100 : null;
  const recurring = useMemo(() => (isPro ? analyzeRecurring(receipts) : []), [receipts, isPro]);
  const subs = useMemo(() => (isPro ? analyzeSubscriptions(receipts) : []), [receipts, isPro]);
  const dueItems = useMemo(() => recurring.filter((r) => r.due && !restockDone[r.key]), [recurring, restockDone]);
  const greeting = (() => { const h = new Date().getHours(); return h < 5 ? "Dobranoc" : h < 12 ? "Dzień dobry" : h < 18 ? "Miłego dnia" : "Dobry wieczór"; })();
  const initials = (profile.name || "Ty").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  /* ---- wspólne ---- */
  const navBtn = { width: 30, height: 30, borderRadius: 9, border: `1px solid ${T.glassBorder}`, background: T.glass, color: T.sub, fontSize: 16, cursor: "pointer", lineHeight: "28px", textAlign: "center", padding: 0 };
  const primaryBtn = {
    background: `linear-gradient(135deg, ${T.mint}, ${T.mintDeep})`, color: "#06251A", border: "none", borderRadius: 14,
    padding: "13px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer",
    boxShadow: `0 8px 24px ${T.mint}38, inset 0 1px 0 rgba(var(--ovc),.35)`,
  };
  const lbl = { display: "block", fontSize: 10, fontWeight: 600, color: T.faint, textTransform: "uppercase", letterSpacing: ".09em", marginBottom: 5 };
  const input = { width: "100%", padding: "10px 11px", borderRadius: 11, border: `1px solid ${T.glassBorder}`, background: "var(--sf1)", fontSize: 13.5, color: T.text, boxSizing: "border-box", transition: "border-color 150ms ease, box-shadow 150ms ease" };
  const card = { background: T.glass, border: `1px solid ${T.glassBorderSoft}`, borderRadius: 17 };

  const MonthNav = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--sf1)", border: "1px solid rgba(var(--ovc),.09)", borderRadius: 999, padding: "3px 4px", boxShadow: "inset 0 1px 0 rgba(var(--ovc),.05)" }}>
      <button className="pa-press" onClick={() => setMonth((m) => shiftMonth(m, -1))} style={navBtn}>‹</button>
      <div className="pa-display" style={{ fontSize: 13, fontWeight: 600, color: T.text, minWidth: 108, textAlign: "center", textTransform: "capitalize" }}>{monthLabel(month)}</div>
      <button className="pa-press" onClick={() => setMonth((m) => shiftMonth(m, 1))} style={navBtn}>›</button>
    </div>
  );
  const Header = ({ title, onBack }) => (
    <div className="pa-hdr" style={{ display: "flex", alignItems: "center", gap: 11, padding: "15px 16px 11px" }}>
      <button className="pa-press" onClick={onBack} style={{ ...navBtn, fontSize: 17 }}>‹</button>
      <div className="pa-display" style={{ fontSize: 16.5, fontWeight: 600, color: T.text }}>{title}</div>
    </div>
  );
  const StoreMono = ({ store }) => (
    <div className="pa-display" style={{ width: 40, height: 40, borderRadius: 13, flexShrink: 0,
      background: `linear-gradient(145deg, ${T.mint}26, ${T.mint}0D)`, border: `1px solid ${T.mint}33`,
      color: T.mint, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15 }}>
      {store[0]}
    </div>
  );
  const ReceiptRow = ({ r, idx = 0 }) => (
    <button className="pa-press pa-fade" onClick={() => setView({ name: "details", id: r.id })}
      style={{ animationDelay: `${Math.min(idx * 45, 320)}ms`, display: "flex", alignItems: "center", gap: 12, width: "100%",
        ...card, borderRadius: 16, padding: "12px 14px", cursor: "pointer", textAlign: "left" }}>
      <StoreMono store={r.store} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="pa-body" style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{r.store}</div>
        <div className="pa-body" style={{ fontSize: 11.5, color: T.faint, marginTop: 1 }}>{fmtDate(r.date)} · {r.items.length} pozycji</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="pa-mono" style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{zl(r.total)}</div>
        <div style={{ display: "flex", gap: 3, justifyContent: "flex-end", marginTop: 4 }}>
          {[...new Set(r.items.map((i) => i.category))].slice(0, 4).map((s) => (
            <span key={s} style={{ width: 7, height: 7, borderRadius: 2.5, background: catBySlug(s).color, display: "inline-block" }} />
          ))}
        </div>
      </div>
    </button>
  );
  const SettingRow = ({ ic, tint, label, sub, right, onClick, danger }) => (
    <div className={onClick ? "pa-press" : ""} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", boxSizing: "border-box",
        padding: "11px 14px", cursor: onClick ? "pointer" : "default", textAlign: "left", userSelect: "none" }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        background: danger ? "rgba(230,118,109,.12)" : `${tint || T.mint}16`, border: `1px solid ${danger ? "rgba(230,118,109,.3)" : (tint || T.mint) + "33"}` }}>
        <Icon name={ic} size={16} color={danger ? T.danger : (tint || T.mint)} sw={1.8} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="pa-body" style={{ fontSize: 13.5, fontWeight: 500, color: danger ? T.danger : T.text }}>{label}</div>
        {sub && <div className="pa-body" style={{ fontSize: 10.5, color: T.faint, marginTop: 1 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
  const Divider = () => <div style={{ height: 1, background: "var(--sf2)", margin: "0 14px 0 58px" }} />;
  const SectionLabel = ({ children }) => (
    <div className="pa-body" style={{ fontSize: 10, fontWeight: 700, color: T.faint, textTransform: "uppercase", letterSpacing: ".11em", margin: "20px 6px 9px" }}>{children}</div>
  );

  /* ================= EKRANY ================= */

  const Pulpit = () => (
    <div className="pa-fade" style={{ padding: "18px 18px 118px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <div className="pa-body" style={{ fontSize: 12, color: T.faint, display: "flex", alignItems: "center", gap: 7 }}>
            <span>{greeting}{profile.name ? `, ${profile.name.split(" ")[0]}` : ""} 👋</span>
            {streak >= 2 && (
              <span className="pa-mono" title="Dni z rzędu ze skanem"
                style={{ fontSize: 10, fontWeight: 700, color: "#FFB35C", background: "rgba(255,140,60,.14)", border: "1px solid rgba(255,150,70,.35)", borderRadius: 999, padding: "2px 8px" }}>
                <span className="pa-flame">🔥</span> {streak}
              </span>
            )}
          </div>
          <div className="pa-display" style={{ fontSize: 22, fontWeight: 700, color: T.text, marginTop: 2 }}>Twoje wydatki</div>
        </div>
        <div ref={tutMonthRef}><MonthNav /></div>
      </div>

      {monthReceipts.length >= 3 && (
        <button className="pa-press pa-rise" onClick={() => setView({ name: "summary", mk: month })}
          style={{ width: "100%", textAlign: "left", marginBottom: 12, cursor: "pointer", position: "relative", overflow: "hidden",
            borderRadius: 16, border: `1px solid ${T.mint}3A`, background: `linear-gradient(120deg, ${T.mint}18, rgba(var(--ovc),.02))`, padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: `${T.mint}1E`, border: `1px solid ${T.mint}50`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 17 }}>📊</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="pa-display" style={{ fontSize: 13.5, fontWeight: 600, color: T.text, textTransform: "capitalize" }}>Podsumowanie: {monthLabel(month)}</div>
              <div className="pa-body" style={{ fontSize: 11, color: T.faint }}>Zobacz swój miesiąc w liczbach · gotowe do udostępnienia</div>
            </div>
            <span style={{ color: T.mint, fontSize: 18 }}>›</span>
          </div>
        </button>
      )}

      {/* Wyzwania oszczędnościowe */}
      <button className="pa-press pa-rise" onClick={() => setView({ name: "challenges" })}
        style={{ width: "100%", textAlign: "left", marginBottom: 12, cursor: "pointer", position: "relative", overflow: "hidden",
          borderRadius: 16, border: `1px solid ${chActive.length ? T.gold + "45" : "rgba(var(--ovc),.09)"}`,
          background: chActive.length ? `linear-gradient(120deg, ${T.gold}14, rgba(var(--ovc),.02))` : T.glass, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, background: `${T.gold}18`, border: `1px solid ${T.gold}45`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 17 }}>
            {chActive.length ? chActive[0].tpl.emoji : "🏆"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pa-display" style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>
              {chActive.length ? `Wyzwania w toku: ${chActive.length}` : "Wyzwania oszczędnościowe"}
            </div>
            {chActive.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
                {chActive.slice(0, 2).map((c) => (
                  <div key={c.tplId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 4, background: "var(--sf2)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(Math.max((c.ev?.pct || 0) * 100, 4), 100)}%`, borderRadius: 2, background: T.gold }} />
                    </div>
                    <span className="pa-mono" style={{ fontSize: 9.5, color: T.faint, flexShrink: 0 }}>{c.ev?.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="pa-body" style={{ fontSize: 11, color: T.faint }}>Podejmij wyzwanie — pilnuję postępu z paragonów 😉</div>
            )}
          </div>
          <span style={{ color: T.gold, fontSize: 18 }}>›</span>
        </div>
      </button>

      {tierLimit !== null && (
        <div className="pa-fade" style={{ ...card, padding: "11px 14px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
            <span className="pa-body" style={{ fontSize: 11.5, color: T.sub, fontWeight: 600 }}>Skany AI w tym miesiącu {effTier === "free" && <span style={{ color: T.faint }}>· plan Free</span>}</span>
            <span className="pa-mono" style={{ fontSize: 11.5, color: quota.used >= tierLimit && !bonusScans ? T.danger : T.text }}>{quota.used}/{tierLimit}{bonusScans > 0 && <span style={{ color: T.gold }}> +{bonusScans} 🎁</span>}</span>
          </div>
          <div style={{ height: 5, background: "var(--sf2)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min((quota.used / tierLimit) * 100, 100)}%`, borderRadius: 3,
              background: quota.used >= tierLimit ? T.danger : quota.used >= tierLimit * 0.8 ? T.warn : `linear-gradient(90deg, ${T.mint}, ${T.mintDeep})`, transition: `width 400ms ${T.easeOut}` }} />
          </div>
          {quota.used >= tierLimit * 0.8 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 7 }}>
              <button className="pa-body" onClick={() => setView({ name: "plans", reason: "limit" })} style={{ background: "none", border: "none", color: T.mint, fontSize: 11.5, fontWeight: 600, cursor: "pointer", padding: 0 }}>
                Skanuj bez limitu — zobacz plany →
              </button>
              {quota.used >= tierLimit && <span className="pa-body" style={{ fontSize: 10.5, color: T.faint }}>Ręczne wpisywanie nadal działa</span>}
            </div>
          )}
        </div>
      )}

      {isPro ? (
        budget ? (() => {
          const left = budget - monthTotal;
          const pct = Math.min(monthTotal / budget, 1);
          const col = left < 0 ? T.danger : pct >= 0.8 ? T.warn : T.mint;
          return (
            <button className="pa-press pa-fade" onClick={() => setInputSheet({
                title: "Budżet miesięczny", fields: [{ key: "amount", label: "Kwota budżetu (zł) — wpisz 0, aby usunąć", value: String(budget).replace(".", ","), placeholder: "3000" }], submitLabel: "Zapisz budżet",
                onSubmit: (v) => { const n = Number(String(v.amount).replace(",", ".").replace(/\s/g, "")); setBudget(n > 0 ? Math.round(n * 100) / 100 : null); setInputSheet(null); showToast(n > 0 ? "Budżet zapisany ✓" : "Budżet usunięty"); },
              })}
              style={{ width: "100%", textAlign: "left", ...card, padding: "12px 14px", marginBottom: 12, cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
                <span className="pa-body" style={{ fontSize: 11.5, color: T.sub, fontWeight: 600 }}>🎯 Budżet · {monthLabel(month).split(" ")[0]}</span>
                <span className="pa-mono" style={{ fontSize: 12.5, fontWeight: 600, color: col }}>
                  {left >= 0 ? `zostało ${zl(left)}` : `przekroczony o ${zl(-left)}`}
                </span>
              </div>
              <div style={{ height: 6, background: "var(--sf2)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.max(pct * 100, 2)}%`, borderRadius: 3, background: left < 0 ? T.danger : `linear-gradient(90deg, ${col}, ${col}99)`, transition: `width 500ms ${T.easeOut}` }} />
              </div>
              <div className="pa-body" style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: T.faint, marginTop: 6 }}>
                <span>wydano {zl(monthTotal)}</span><span>z {zl(budget)} · dotknij, by zmienić</span>
              </div>
            </button>
          );
        })() : (
          <button className="pa-press pa-fade" onClick={() => setInputSheet({
              title: "Ustaw budżet miesięczny", fields: [{ key: "amount", label: "Kwota budżetu (zł)", placeholder: "3000" }], submitLabel: "Zapisz budżet",
              onSubmit: (v) => { const n = Number(String(v.amount).replace(",", ".").replace(/\s/g, "")); if (n > 0) { setBudget(Math.round(n * 100) / 100); showToast("Budżet zapisany ✓"); } setInputSheet(null); },
            })}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: "none", border: `1.5px dashed rgba(var(--ovc),.16)`, borderRadius: 14, padding: "12px 14px", marginBottom: 12, cursor: "pointer", textAlign: "left" }}>
            <span style={{ fontSize: 15 }}>🎯</span>
            <span className="pa-body" style={{ flex: 1, fontSize: 12.5, color: T.sub, fontWeight: 500 }}>Ustaw budżet miesięczny — zobaczysz, ile Ci zostało</span>
            <span style={{ color: T.mint, fontSize: 16 }}>+</span>
          </button>
        )
      ) : receipts.length > 0 && (
        <button className="pa-press pa-fade" onClick={() => setView({ name: "plans", reason: "feature" })}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: `${T.gold}0C`, border: `1px solid ${T.gold}30`, borderRadius: 14, padding: "11px 14px", marginBottom: 12, cursor: "pointer", textAlign: "left" }}>
          <span>🎯</span>
          <span className="pa-body" style={{ flex: 1, fontSize: 12, color: "#D9CCA8" }}>Budżet miesięczny i licznik "ile zostało" — od planu <b>Pro</b></span>
          <span style={{ color: T.gold }}>→</span>
        </button>
      )}

      {receipts.length === 0 ? (
        <div className="pa-rise" style={{ background: `linear-gradient(160deg, rgba(var(--ovc),.05), rgba(var(--ovc),.02))`, border: `1px solid ${T.glassBorder}`, borderRadius: 22, padding: "38px 24px", textAlign: "center" }}>
          <div style={{ width: 72, height: 72, margin: "0 auto", borderRadius: 22, background: `linear-gradient(145deg, ${T.mint}22, ${T.mint}08)`, border: `1px solid ${T.mint}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>🧾</div>
          <div className="pa-display" style={{ fontSize: 17, fontWeight: 600, margin: "16px 0 7px", color: T.text }}>Zacznij od pierwszego paragonu</div>
          <div className="pa-body" style={{ fontSize: 13, color: T.sub, marginBottom: 22, lineHeight: 1.55 }}>Sfotografuj paragon, a pokażemy Ci,<br />gdzie uciekają pieniądze.</div>
          <button className="pa-press pa-display" onClick={startScan} style={primaryBtn}>Skanuj paragon</button>
          <div style={{ marginTop: 14 }}>
            <button className="pa-body" onClick={() => { setReceipts(demoReceipts()); showToast("Załadowano przykładowe dane"); }}
              style={{ background: "none", border: "none", color: T.mint, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              albo zobacz na przykładowych danych →
            </button>
          </div>
        </div>
      ) : (
        <>
          {hasSample && (
            <div className="pa-fade" style={{ marginBottom: 13, padding: "13px 14px 12px", borderRadius: 18,
              background: "var(--sf1)", border: `1px dashed ${T.mint}55`, boxShadow: `0 6px 20px ${T.mint}12` }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 11 }}>
                <span style={{ fontSize: 17, flexShrink: 0, marginTop: -1 }}>👀</span>
                <div style={{ minWidth: 0 }}>
                  <div className="pa-display" style={{ fontSize: 13, fontWeight: 700, color: T.text }}>To są dane pokazowe</div>
                  <div className="pa-body" style={{ fontSize: 10.8, color: T.faint, marginTop: 2.5, lineHeight: 1.5 }}>
                    Pokazują, jak działa aplikacja. <b style={{ color: T.sub }}>Nie liczą się do osiągnięć</b> — zacznij od własnego paragonu.
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="pa-press pa-display" onClick={() => { setReceipts((rs) => rs.filter((r) => !r.sample)); startScan(); }}
                  style={{ flex: 1, padding: "11px 0", borderRadius: 13, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                    background: `linear-gradient(135deg, ${T.mint}, ${T.mintDeep})`, color: "#06251A", boxShadow: `0 6px 18px ${T.mint}33` }}>
                  📷 Skanuj swój paragon
                </button>
                <button className="pa-press pa-body" onClick={() => { setReceipts((rs) => rs.filter((r) => !r.sample)); showToast("Usunięto dane pokazowe"); }}
                  style={{ flexShrink: 0, padding: "11px 14px", borderRadius: 13, cursor: "pointer", fontSize: 12.5, fontWeight: 600,
                    border: `1px solid ${T.glassBorder}`, background: "var(--sf2)", color: T.sub }}>
                  Usuń
                </button>
              </div>
            </div>
          )}
          <div ref={tutHeroRef} className="pa-rise pa-sheen" style={{ position: "relative", borderRadius: 26, overflow: "hidden",
            background: "var(--c-hero)",
            border: "1px solid rgba(var(--ovc),.11)", boxShadow: "0 26px 64px var(--sh2), inset 0 1px 0 rgba(var(--ovc),.14)", padding: "18px 18px 16px" }}>
            <div style={{ position: "absolute", top: -80, right: -60, width: 240, height: 240, borderRadius: "50%", background: `radial-gradient(circle, ${T.mint}32, transparent 66%)`, pointerEvents: "none" }} />
            <div style={{ position: "absolute", bottom: -100, left: -70, width: 250, height: 250, borderRadius: "50%", background: "radial-gradient(circle, rgba(216,184,120,.12), transparent 66%)", pointerEvents: "none" }} />

            {/* nagłówek + kwota */}
            <div style={{ position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div className="pa-mono" style={{ fontSize: 9, letterSpacing: ".15em", color: "rgba(var(--ovc),.5)" }}>WYDANE · {monthLabel(month).split(" ")[0].toUpperCase()}</div>
                <div className="pa-display" style={{ fontSize: 36, fontWeight: 700, color: T.text, lineHeight: 1.1, marginTop: 5, letterSpacing: "-.02em", whiteSpace: "nowrap" }}>
                  {num(heroAmount)} <span style={{ fontSize: 17, fontWeight: 600, color: "rgba(var(--ovc),.55)" }}>zł</span>
                </div>
              </div>
              {delta !== null && (
                <div className="pa-body" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, marginTop: 4,
                  color: delta > 0 ? "var(--c-up)" : "var(--c-down)", background: delta > 0 ? "rgba(230,118,109,.16)" : `${T.mint}1E`,
                  border: `1px solid ${delta > 0 ? "rgba(230,118,109,.34)" : T.mint + "3A"}`, borderRadius: 999, padding: "5px 10px" }}>
                  {delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {Math.abs(delta)}%
                </div>
              )}
            </div>

            {/* prognoza / tempo */}
            <div className="pa-body" style={{ position: "relative", fontSize: 11.5, color: "rgba(var(--ovc),.62)", marginTop: 7, lineHeight: 1.5 }}>
              {heroPace ? (
                <>≈ <span className="pa-mono" style={{ color: T.text }}>{num(heroPace.perDay)} zł</span> dziennie{heroPace.forecast ? <> · w tym tempie miesiąc zamkniesz na <span className="pa-mono" style={{ color: heroPace.worse ? "#F2A69E" : "#9BE8CB" }}>~{num(heroPace.forecast)} zł</span></> : null}</>
              ) : "Dodaj paragony, by zobaczyć tempo wydatków"}
            </div>

            {/* krzywa narastających wydatków */}
            <div style={{ position: "relative", marginTop: 12 }}>
              <SpendCurve receipts={receipts} month={month} height={64} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                <span className="pa-mono" style={{ fontSize: 8.5, color: "rgba(var(--ovc),.38)" }}>1</span>
                {prevTotal > 0 && (
                  <span className="pa-body" style={{ fontSize: 8.5, color: "rgba(var(--ovc),.42)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 12, height: 0, borderTop: "1.5px dashed rgba(var(--ovc),.45)", display: "inline-block" }} /> poprzedni miesiąc
                  </span>
                )}
                <span className="pa-mono" style={{ fontSize: 8.5, color: "rgba(var(--ovc),.38)" }}>{daysInMonth(month)}</span>
              </div>
            </div>

            {/* pasek kategorii + legenda */}
            {byCategory.length > 0 && (
              <div style={{ position: "relative", marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(var(--ovc),.09)" }}>
                <div style={{ display: "flex", height: 9, borderRadius: 5, overflow: "hidden", background: "var(--sf2)", gap: 1.5 }}>
                  {byCategory.slice(0, 6).map((c) => (
                    <div key={c.slug} title={`${c.name}: ${zl(c.value)}`}
                      style={{ width: `${Math.max((c.value / monthTotal) * 100, 1.5)}%`, background: c.color, boxShadow: `0 0 8px ${c.color}55`, transition: `width 600ms ${T.easeOut}` }} />
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
                  {byCategory.slice(0, 3).map((c) => (
                    <div key={c.slug} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--sf1)", border: "1px solid rgba(var(--ovc),.08)", borderRadius: 999, padding: "5px 10px" }}>
                      <span style={{ width: 7, height: 7, borderRadius: 2.5, background: c.color, flexShrink: 0, boxShadow: `0 0 6px ${c.color}88` }} />
                      <span className="pa-body" style={{ fontSize: 10.5, color: "#CBDCD2" }}>{c.name}</span>
                      <span className="pa-mono" style={{ fontSize: 10, color: "#fff", fontWeight: 600 }}>{Math.round((c.value / monthTotal) * 100)}%</span>
                    </div>
                  ))}
                  <div onClick={() => setTab("analiza")} role="button" className="pa-press"
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, background: `${T.mint}12`, border: `1px solid ${T.mint}30`, borderRadius: 999, padding: "5px 10px", cursor: "pointer" }}>
                    <span className="pa-body" style={{ fontSize: 10.5, color: T.mint, fontWeight: 600 }}>Analiza ›</span>
                  </div>
                </div>
              </div>
            )}

            {/* budżet miesięczny */}
            {budget > 0 && (() => {
              const pct = Math.min(monthTotal / budget, 1);
              const left = Math.max(budget - monthTotal, 0);
              const over = monthTotal > budget;
              const dLeft = month === nowMonth() ? Math.max(daysInMonth(month) - Number(todayKey().slice(8, 10)) + 1, 1) : 0;
              const perDayLeft = dLeft > 0 ? left / dLeft : 0;
              const col = over ? T.danger : pct >= 0.8 ? T.warn : T.mint;
              return (
                <div style={{ position: "relative", marginTop: 14, paddingTop: 13, borderTop: "1px solid rgba(var(--ovc),.09)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
                    <span className="pa-body" style={{ fontSize: 10.5, color: "rgba(var(--ovc),.55)", fontWeight: 600, letterSpacing: ".05em" }}>BUDŻET MIESIĄCA</span>
                    <span className="pa-mono" style={{ fontSize: 11, color: col, fontWeight: 600 }}>{num(monthTotal)} / {num(budget)} zł</span>
                  </div>
                  <div style={{ height: 7, background: "var(--sf2)", borderRadius: 4, overflow: "hidden" }}>
                    <div className="pa-bar-glint" style={{ height: "100%", width: `${Math.max(pct * 100, 2)}%`, borderRadius: 4,
                      background: over ? `linear-gradient(90deg, ${T.warn}, ${T.danger})` : `linear-gradient(90deg, ${T.mint}, ${T.mintDeep})`,
                      boxShadow: `0 0 10px ${col}66`, transition: `width 600ms ${T.easeOut}` }} />
                  </div>
                  <div className="pa-body" style={{ fontSize: 10.5, color: over ? "#F2A69E" : "rgba(var(--ovc),.55)", marginTop: 7 }}>
                    {over
                      ? `Przekroczono o ${zl(monthTotal - budget)}`
                      : dLeft > 0
                        ? <>Zostało <span className="pa-mono" style={{ color: T.text }}>{num(left)} zł</span> na {dLeft} {dLeft === 1 ? "dzień" : "dni"} · <span className="pa-mono" style={{ color: col }}>{num(perDayLeft)} zł/dzień</span></>
                        : `Zostało ${zl(left)}`}
                  </div>
                </div>
              );
            })()}

            {/* budżety kategorii (Pro) */}
            {isPro && (() => {
              const rows = BUDGET_CATS.map((slug) => ({
                slug,
                limit: Number(String(budgets[slug] ?? "").replace(",", ".").replace(/\s/g, "")) || 0,
                spent: byCategory.find((c) => c.slug === slug)?.value || 0,
              })).filter((r) => r.limit > 0 && r.spent > 0);
              if (!rows.length) return null;
              return (
                <div style={{ position: "relative", marginTop: 13, paddingTop: 13, borderTop: "1px solid rgba(var(--ovc),.09)", display: "flex", flexDirection: "column", gap: 9 }}>
                  {rows.map((r) => {
                    const c = catBySlug(r.slug);
                    const pct = Math.min(r.spent / r.limit, 1);
                    const hot = r.spent / r.limit >= 0.8;
                    return (
                      <div key={r.slug}>
                        <div className="pa-body" style={{ fontSize: 11, color: "rgba(var(--ovc),.6)", marginBottom: 5 }}>
                          {c.icon} {c.name} · <span className="pa-mono">{num(r.spent)} / {num(r.limit)} zł</span>
                        </div>
                        <div style={{ width: "100%", height: 5, background: "var(--sf2)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.max(pct * 100, 2)}%`, borderRadius: 3,
                            background: hot ? `linear-gradient(90deg, ${T.warn}, ${T.danger})` : `linear-gradient(90deg, ${T.mint}, ${T.mintDeep})`,
                            transition: `width 500ms ${T.easeOut}` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {isPro && dueItems.length > 0 && (
            <button className="pa-press pa-rise" onClick={() => setView({ name: "restock" })}
              style={{ width: "100%", textAlign: "left", marginTop: 12, cursor: "pointer", position: "relative", overflow: "hidden",
                background: `linear-gradient(135deg, ${T.gold}14, rgba(var(--ovc),.03))`, border: `1px solid ${T.gold}40`, borderRadius: 18, padding: "14px 15px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 11, background: `${T.gold}1E`, border: `1px solid ${T.gold}50`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="cart" size={17} color={T.gold} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="pa-display" style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>Pora dokupić</div>
                  <div className="pa-body" style={{ fontSize: 11, color: T.faint }}>{dueItems.length} {dueItems.length === 1 ? "produkt prawdopodobnie się kończy" : "produktów prawdopodobnie się kończy"}</div>
                </div>
                <span className="pa-mono" style={{ fontSize: 9, color: T.gold, letterSpacing: ".12em" }}>PRO</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {dueItems.slice(0, 4).map((it) => (
                  <span key={it.key} className="pa-body" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#E2D3A8", background: `${T.gold}12`, border: `1px solid ${T.gold}33`, borderRadius: 999, padding: "3px 9px" }}>
                    {catBySlug(it.category).icon} {it.name}
                  </span>
                ))}
                {dueItems.length > 4 && <span className="pa-body" style={{ fontSize: 11, color: T.faint, alignSelf: "center" }}>+{dueItems.length - 4}</span>}
              </div>
            </button>
          )}

          {hasGoals && goals.length > 0 && (
            <button className="pa-press pa-rise" onClick={() => setView({ name: "goals" })}
              style={{ width: "100%", textAlign: "left", marginTop: 12, cursor: "pointer", ...card, padding: "14px 15px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 11, background: `${T.gold}1A`, border: `1px solid ${T.gold}40`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="piggy" size={17} color={T.gold} sw={1.6} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="pa-display" style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>Cele oszczędnościowe</div>
                  <div className="pa-body" style={{ fontSize: 11, color: T.faint }}>{goals.length} {goals.length === 1 ? "aktywny cel" : "aktywne cele"}</div>
                </div>
                <span style={{ color: T.faint }}>›</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {goals.slice(0, 2).map((g) => {
                  const pct = g.target > 0 ? Math.min(g.saved / g.target, 1) : 0;
                  const done = g.saved >= g.target;
                  return (
                    <div key={g.id}>
                      <div className="pa-body" style={{ fontSize: 11, color: T.sub, marginBottom: 5, display: "flex", justifyContent: "space-between" }}>
                        <span>{g.icon} {g.name}</span>
                        <span className="pa-mono" style={{ color: done ? T.mint : T.sub }}>{num(g.saved)} / {num(g.target)} zł</span>
                      </div>
                      <div style={{ height: 5, background: "var(--sf2)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.max(pct * 100, 3)}%`, borderRadius: 3,
                          background: done ? `linear-gradient(90deg, ${T.mint}, ${T.mintDeep})` : `linear-gradient(90deg, ${T.gold}, #B2945A)`, transition: `width 500ms ${T.easeOut}` }} />
                      </div>
                    </div>
                  );
                })}
                {goals.length > 2 && <div className="pa-body" style={{ fontSize: 10.5, color: T.faint, textAlign: "center" }}>+ {goals.length - 2} {goals.length - 2 === 1 ? "kolejny cel" : "kolejne cele"}</div>}
              </div>
            </button>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "22px 2px 12px" }}>
            <div className="pa-display" style={{ fontSize: 15, fontWeight: 600, color: T.text }}>Ostatnie paragony</div>
            <button className="pa-body pa-press" onClick={() => setTab("paragony")} style={{ background: "none", border: "none", color: T.mint, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Zobacz wszystkie →</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {monthReceipts.slice(0, 4).map((r, i) => <ReceiptRow key={r.id} r={r} idx={i} />)}
            {monthReceipts.length === 0 && <div className="pa-fade pa-body" style={{ fontSize: 13, color: T.faint, textAlign: "center", padding: 20 }}><span className="pa-float" style={{ display: "inline-block", fontSize: 30, marginBottom: 8 }}>🧾</span><br />Brak paragonów w tym miesiącu.</div>}
          </div>
        </>
      )}
    </div>
  );

  const Paragony = () => {
    const q = searchQ.trim().toLowerCase();
    const filtered = q
      ? monthReceipts.filter((r) => r.store.toLowerCase().includes(q) || r.items.some((i) => (i.name || "").toLowerCase().includes(q)))
      : monthReceipts;
    const groups = {};
    filtered.forEach((r) => { (groups[r.date] = groups[r.date] || []).push(r); });
    const dates = Object.keys(groups).sort().reverse();
    let idx = 0;
    return (
      <div className="pa-fade" style={{ padding: "18px 18px 118px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div className="pa-display" style={{ fontSize: 22, fontWeight: 700, color: T.text }}>Paragony</div>
          <MonthNav />
        </div>
        <div style={{ position: "relative", marginBottom: 16 }}>
          <span style={{ position: "absolute", left: 13, top: 12, opacity: .6, pointerEvents: "none" }}><Icon name="search" size={15} color={T.sub} /></span>
          <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Szukaj sklepu lub produktu…"
            className="pa-body" style={{ ...input, padding: "11px 12px 11px 38px", borderRadius: 14 }} />
          {searchQ && (
            <button className="pa-press" onClick={() => setSearchQ("")}
              style={{ position: "absolute", right: 9, top: 8, width: 24, height: 24, borderRadius: 8, border: "none", background: "var(--sf2)", color: T.sub, fontSize: 11, cursor: "pointer" }}>✕</button>
          )}
        </div>
        {dates.length === 0 ? (
          <div className="pa-rise pa-body" style={{ textAlign: "center", color: T.faint, fontSize: 13, padding: "40px 0", lineHeight: 1.7 }}>
            <div className="pa-float" style={{ fontSize: 44, marginBottom: 12, filter: `drop-shadow(0 10px 22px ${T.mint}30)` }}>{q ? "🔍" : "🧾"}</div>
            {q ? <>Nic nie znaleziono dla „{searchQ.trim()}”.</> : <>Brak paragonów w tym miesiącu.<br />
            <button className="pa-press pa-glow" onClick={startScan} style={{ ...primaryBtn, marginTop: 14, fontSize: 13, padding: "11px 20px" }}>Zeskanuj pierwszy</button></>}
          </div>
        ) : dates.map((d) => (
          <div key={d} style={{ marginBottom: 18 }}>
            <div className="pa-body" style={{ fontSize: 10.5, fontWeight: 700, color: T.faint, textTransform: "uppercase", letterSpacing: ".09em", margin: "0 2px 8px" }}>
              {d === todayKey() ? "Dzisiaj" : fmtDate(d)}
              <span className="pa-mono" style={{ float: "right", fontWeight: 500 }}>{zl(groups[d].reduce((s, r) => s + r.total, 0))}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {groups[d].map((r) => <ReceiptRow key={r.id} r={r} idx={idx++} />)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const Analiza = () => {
    const prodMap = {};
    monthReceipts.forEach((r) => r.items.forEach((i) => {
      const k = (i.name || "").trim().toLowerCase();
      if (!k) return;
      const e = prodMap[k] = prodMap[k] || { name: i.name, count: 0, sum: 0, category: i.category };
      e.count += Number(i.qty) || 1; e.sum += Number(i.total_price) || 0;
    }));
    const topProducts = Object.values(prodMap).sort((a, b) => b.sum - a.sum).slice(0, 5);
    const perMember = members.length > 1 ? members.map((m, mi) => ({
      ...m, color: MEMBER_COLORS[mi % MEMBER_COLORS.length],
      sum: monthReceipts.filter((r) => (r.memberId || members[0].id) === m.id).reduce((s, r) => s + (Number(r.total) || 0), 0),
    })).sort((a, b) => b.sum - a.sum) : [];
    return (
    <div className="pa-fade" style={{ padding: "18px 18px 118px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div className="pa-display" style={{ fontSize: 22, fontWeight: 700, color: T.text }}>Analiza</div>
        <MonthNav />
      </div>
      {byCategory.length === 0 ? (
        <div className="pa-body" style={{ textAlign: "center", color: T.faint, fontSize: 13, padding: "48px 0" }}>Zeskanuj paragony, żeby zobaczyć analizę.</div>
      ) : (
        <>
          <div className="pa-rise"  style={{ animationDelay: "0ms", ...card, padding: "14px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <div className="pa-body" style={{ fontSize: 10.5, color: T.faint, letterSpacing: ".08em", fontWeight: 600 }}>SUMA MIESIĄCA</div>
              <div className="pa-mono" style={{ fontSize: 24, fontWeight: 600, color: T.text, marginTop: 3 }}>{zl(monthTotal)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="pa-body" style={{ fontSize: 10.5, color: T.faint, letterSpacing: ".08em", fontWeight: 600 }}>ŚREDNIO / PARAGON</div>
              <div className="pa-mono" style={{ fontSize: 15, fontWeight: 600, color: T.gold, marginTop: 6 }}>{zl(monthReceipts.length ? monthTotal / monthReceipts.length : 0)}</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {byCategory.map((c, ci) => {
              const pct = monthTotal > 0 ? c.value / monthTotal : 0;
              const open = drill === c.slug;
              const items = [];
              monthReceipts.forEach((r) => r.items.forEach((i) => { if (i.category === c.slug) items.push({ ...i, store: r.store }); }));
              return (
                <div key={c.slug} className="pa-fade" style={{ animationDelay: `${Math.min(ci * 40, 320)}ms`, background: T.glass, border: `1px solid ${open ? c.color + "55" : T.glassBorderSoft}`, borderRadius: 17, overflow: "hidden", transition: "border-color 200ms ease" }}>
                  <button className="pa-press" onClick={() => setDrill(open ? null : c.slug)}
                    style={{ width: "100%", background: "none", border: "none", padding: "12px 14px", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                      <CatTile slug={c.slug} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="pa-body" style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{c.name}</div>
                        <div className="pa-body" style={{ fontSize: 11, color: T.faint, marginTop: 1 }}>{items.length} {items.length === 1 ? "produkt" : items.length < 5 ? "produkty" : "produktów"}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="pa-mono" style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{zl(c.value)}</div>
                        <div className="pa-body" style={{ fontSize: 10.5, color: T.faint, marginTop: 1 }}>{Math.round(pct * 100)}%</div>
                      </div>
                    </div>
                    <div style={{ height: 5, background: "var(--sf2)", borderRadius: 3, marginTop: 10, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.max(pct * 100, 2)}%`, background: `linear-gradient(90deg, ${c.color}, ${c.color}99)`, borderRadius: 3, transition: `width 500ms ${T.easeOut}`, boxShadow: `0 0 10px ${c.color}55` }} />
                    </div>
                  </button>
                  {open && (
                    <div className="pa-fade" style={{ borderTop: `1px dashed rgba(var(--ovc),.12)`, padding: "9px 14px 13px" }}>
                      {items.sort((a, b) => b.total_price - a.total_price).map((i) => (
                        <div key={i.id} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5.5px 0" }}>
                          <div className="pa-body" style={{ flex: 1, fontSize: 12.5, color: T.sub, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.name}</div>
                          <div className="pa-body" style={{ fontSize: 10, color: T.faint }}>{i.store}</div>
                          <div className="pa-mono" style={{ fontSize: 12, fontWeight: 500, color: T.text }}>{zl(i.total_price)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {perMember.length > 0 && (
            <>
              <div className="pa-display" style={{ fontSize: 15, fontWeight: 600, color: T.text, margin: "20px 2px 10px" }}>Na osobę</div>
              <div className="pa-rise"  style={{ animationDelay: "60ms", ...card, padding: "5px 0" }}>
                {perMember.map((m) => {
                  const pct = monthTotal > 0 ? m.sum / monthTotal : 0;
                  return (
                    <div key={m.id} style={{ padding: "9px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span className="pa-body" style={{ fontSize: 12.5, fontWeight: 600, color: T.text, display: "inline-flex", alignItems: "center", gap: 7 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: m.color }} />{m.name}
                        </span>
                        <span className="pa-mono" style={{ fontSize: 12, color: T.text }}>{zl(m.sum)} <span style={{ color: T.faint, fontSize: 10 }}>({Math.round(pct * 100)}%)</span></span>
                      </div>
                      <div style={{ height: 5, background: "var(--sf2)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.max(pct * 100, 2)}%`, background: m.color, borderRadius: 3, transition: `width 500ms ${T.easeOut}` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {topProducts.length > 0 && (
            <>
              <div className="pa-display" style={{ fontSize: 15, fontWeight: 600, color: T.text, margin: "20px 2px 10px" }}>Top produkty</div>
              <div className="pa-rise"  style={{ animationDelay: "120ms", ...card, overflow: "hidden" }}>
                {topProducts.map((p, i) => (
                  <div key={p.name + i}>
                    {i > 0 && <Divider />}
                    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 14px" }}>
                      <div className="pa-mono" style={{ width: 22, fontSize: 12, fontWeight: 600, color: i === 0 ? T.gold : T.faint }}>#{i + 1}</div>
                      <CatTile slug={p.category} size={30} fs={14} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="pa-body" style={{ fontSize: 12.5, fontWeight: 500, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                        <div className="pa-body" style={{ fontSize: 10.5, color: T.faint }}>{p.count}× w tym miesiącu</div>
                      </div>
                      <div className="pa-mono" style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>{zl(p.sum)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {isPro && subs.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "20px 2px 10px" }}>
                <div className="pa-display" style={{ fontSize: 15, fontWeight: 600, color: T.text }}>Cykliczne opłaty</div>
                <span className="pa-mono" style={{ fontSize: 11.5, color: T.gold }}>{zl(subs.reduce((s, x) => s + x.avgPrice, 0))}/mies.</span>
              </div>
              <div className="pa-rise"  style={{ animationDelay: "180ms", ...card, border: `1px solid ${T.gold}30`, overflow: "hidden" }}>
                {subs.slice(0, 6).map((x, i) => (
                  <div key={x.key}>
                    {i > 0 && <Divider />}
                    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 14px" }}>
                      <CatTile slug={x.category} size={30} fs={14} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="pa-body" style={{ fontSize: 12.5, fontWeight: 500, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.name}</div>
                        <div className="pa-body" style={{ fontSize: 10.5, color: T.faint }}>co miesiąc · płacone {x.times}×</div>
                      </div>
                      <div className="pa-mono" style={{ fontSize: 12.5, fontWeight: 600, color: T.gold }}>{zl(x.avgPrice)}</div>
                    </div>
                  </div>
                ))}
                <div className="pa-body" style={{ fontSize: 10.5, color: T.faint, padding: "9px 14px 12px", lineHeight: 1.55, borderTop: "1px solid rgba(var(--ovc),.05)" }}>
                  Wykryte na podstawie stałej kwoty wracającej co ~miesiąc. Sprawdź, czy z każdej z tych opłat nadal korzystasz.
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
    );
  };

  /* ---------- PROFIL + USTAWIENIA ---------- */
  const Profil = () => {
    const planMetaMap = { free: { ic: "spark", c: "#9FB3A9", grad: "var(--g-free)" },
      starter: { ic: "spark", c: "#A8B8C2", grad: "var(--g-starter)" },
      pro: { ic: "crown", c: T.mint, grad: "var(--g-pro)" },
      family: { ic: "crown", c: T.gold, grad: "var(--g-family)" } };
    const planMeta = planMetaMap[effTier] || planMetaMap.free;
    const planName = PLANS.find((p) => p.id === effTier)?.name || "Free";

    const openEditProfile = () => setInputSheet({
      title: "Edytuj profil",
      fields: [{ key: "name", label: "Imię i nazwisko", value: profile.name, placeholder: "Jan Kowalski" }, { key: "email", label: "E-mail", value: profile.email, placeholder: "jan@example.com", type: "email" }],
      submitLabel: "Zapisz",
      onSubmit: (v) => { setProfile({ name: v.name.trim(), email: v.email.trim() }); setInputSheet(null); showToast("Profil zapisany ✓"); },
    });
    return (
    <div className="pa-fade" style={{ padding: "18px 18px 124px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div className="pa-display" style={{ fontSize: 22, fontWeight: 700, color: T.text }}>Profil</div>
        <button className="pa-press" onClick={openEditProfile} aria-label="Edytuj profil"
          style={{ ...navBtn, width: 38, height: 38, background: "var(--sf2)", borderColor: "rgba(var(--ovc),.12)", color: T.sub, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="pencil" size={16} color={T.sub} />
        </button>
      </div>

      {/* MEMBERSHIP CARD */}
      <div className="pa-rise pa-sheen" style={{ position: "relative", borderRadius: 26, overflow: "hidden",
        background: planMeta.grad, border: "1px solid rgba(var(--ovc),.11)",
        boxShadow: "0 26px 64px var(--sh2), inset 0 1px 0 rgba(var(--ovc),.14)", padding: "20px 18px 18px", marginBottom: 22 }}>
        <div className="pa-aurora" style={{ top: -90, right: -60, width: 220, height: 220, background: `radial-gradient(circle, ${planMeta.c}33, transparent 68%)` }} />
        {/* górny pasek: ranga + plan */}
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div className="pa-mono" style={{ fontSize: 9, letterSpacing: ".18em", color: "rgba(var(--ovc),.55)" }}>PARAGON·AI</div>
          <button className="pa-press" onClick={() => setView({ name: "plans" })}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, background: `${planMeta.c}1E`, border: `1px solid ${planMeta.c}55`, borderRadius: 999, padding: "4px 11px 4px 8px", cursor: "pointer" }}>
            <Icon name={planMeta.ic} size={12} color={planMeta.c} sw={1.8} />
            <span className="pa-mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".08em", color: planMeta.c }}>{planName.toUpperCase()}</span>
          </button>
        </div>
        {/* monogram + nazwa — tap otwiera edycję profilu */}
        <div className="pa-press" role="button" tabIndex={0} onClick={openEditProfile}
          onKeyDown={(e) => { if (e.key === "Enter") openEditProfile(); }}
          style={{ position: "relative", display: "flex", alignItems: "center", gap: 15, cursor: "pointer", userSelect: "none" }}>
          <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
            <div style={{ position: "absolute", inset: -3, borderRadius: 22, background: `conic-gradient(from 140deg, ${planMeta.c}, ${T.gold}, ${planMeta.c})`, opacity: .85 }} />
            <div className="pa-display" style={{ position: "absolute", inset: 0, borderRadius: 20, background: "var(--c-avatar)", color: T.text,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 23, fontWeight: 700, letterSpacing: ".02em" }}>
              {initials}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pa-display" style={{ fontSize: 19, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile.name || "Twój profil"}</span>
              <Icon name="pencil" size={13} color="rgba(var(--ovc),.45)" />
            </div>
            <div className="pa-body" style={{ fontSize: 12, color: "rgba(var(--ovc),.6)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile.email || "Dodaj swoje dane — dotknij, aby edytować"}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              {profile.title && (
                <span className="pa-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".06em", color: T.gold, background: `${T.gold}18`, border: `1px solid ${T.gold}45`, borderRadius: 999, padding: "3px 9px" }}>🏷️ {profile.title}</span>
              )}
              {proTrialActive && (
                <span className="pa-mono" style={{ fontSize: 9, fontWeight: 700, color: "#fff", background: `linear-gradient(135deg, ${T.gold}, #B2945A)`, borderRadius: 999, padding: "3px 9px" }}>👑 Pro do {new Date(plan.proUntil).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}</span>
              )}
            </div>
          </div>
        </div>
        {/* poziom XP */}
        <div className="pa-press" role="button" onClick={() => setView({ name: "achievements" })} style={{ position: "relative", marginTop: 18, cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
            <span className="pa-body" style={{ fontSize: 12, fontWeight: 700, color: "#fff", display: "inline-flex", alignItems: "center", gap: 6 }}>
              ⚡ Poziom {lvl + 1} · {LEVELS[lvl].name}
            </span>
            <span className="pa-mono" style={{ fontSize: 10.5, color: "rgba(var(--ovc),.55)" }}>
              {totalXp}{lvlNext ? ` / ${lvlNext.xp}` : ""} XP{streak >= 2 ? ` · 🔥 ${streak}` : ""}
            </span>
          </div>
          <div style={{ height: 6, background: "var(--sh1)", borderRadius: 3, overflow: "hidden", boxShadow: "inset 0 1px 2px var(--sh2)" }}>
            <div className="pa-bar-glint" style={{ height: "100%", width: `${Math.max(lvlPct * 100, 4)}%`, borderRadius: 3,
              background: `linear-gradient(90deg, ${planMeta.c}, ${T.gold})`, transition: `width 700ms ${T.easeOut}`, boxShadow: `0 0 10px ${planMeta.c}77` }} />
          </div>
          <div className="pa-body" style={{ fontSize: 10, color: "rgba(var(--ovc),.45)", marginTop: 6 }}>
            {lvlNext ? `Jeszcze ${lvlNext.xp - totalXp} XP do poziomu „${lvlNext.name}" · zdobywaj w Osiągnięciach ›` : "Maksymalny poziom — Absolut! 👑"}
          </div>
        </div>
        {/* statystyki */}
        <div style={{ position: "relative", display: "flex", gap: 1, marginTop: 18, background: "var(--sf2)", border: "1px solid rgba(var(--ovc),.09)", borderRadius: 15, overflow: "hidden" }}>
          {[["Paragony", receipts.length, "receipt"], ["Wydano łącznie", zl(allTotal), "chart"], ["Ten miesiąc", zl(monthTotal), "cart"]].map(([k, v, ic], i) => (
            <div key={k} style={{ flex: 1, padding: "11px 10px", background: "var(--sh1)", borderLeft: i ? "1px solid rgba(var(--ovc),.07)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                <Icon name={ic} size={11} color="rgba(var(--ovc),.5)" sw={1.8} />
                <span className="pa-body" style={{ fontSize: 8.5, color: "rgba(var(--ovc),.5)", letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k}</span>
              </div>
              <div className="pa-mono" style={{ fontSize: 13, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* PLAN / ZARZĄDZANIE */}
      <SectionLabel>Konto</SectionLabel>
      <div className="pa-rise"  style={{ animationDelay: "0ms", ...card, overflow: "hidden" }}>
        {session ? (
              <>
                <SettingRow ic="check" tint={T.mint} label="Zalogowano"
                  sub={`${session.user?.email || ""} · dane synchronizowane w chmurze`} />
                <Divider />
                <SettingRow ic="repeat" danger label="Wyloguj się" right={<span style={{ color: T.faint }}>›</span>}
                  onClick={() => setConfirmBox({
                    title: "Wylogować się?",
                    body: "Dane pozostaną zapisane na Twoim koncie w chmurze. Na tym urządzeniu wrócisz do ekranu logowania.",
                    confirmLabel: "Wyloguj",
                    onConfirm: async () => {
                      try { await supabase.auth.signOut(); } catch (e) { /* nic */ }
                      try { localStorage.removeItem("paragon-guest"); } catch (e) { /* nic */ }
                      setGuest(false); setConfirmBox(null); showToast("Wylogowano");
                    },
                  })} />
              </>
            ) : (
              <SettingRow ic="lock" tint={T.mint} label="Zaloguj się / Utwórz konto"
                sub="Chmura: dane bezpieczne i dostępne z każdego urządzenia"
                right={<span style={{ color: T.faint }}>›</span>}
                onClick={() => { try { localStorage.removeItem("paragon-guest"); } catch (e) {} setGuest(false); }} />
        )}
      </div>

      {AUTH_ENABLED && session && (
        <>
          <SectionLabel>Rodzina 👨‍👩‍👧</SectionLabel>
          <div className="pa-rise"  style={{ animationDelay: "60ms", ...card, overflow: "hidden", padding: "14px 15px" }}>
            {household ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: `${T.gold}16`, border: `1px solid ${T.gold}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🏠</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="pa-display" style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{household.name}</div>
                    <div className="pa-body" style={{ fontSize: 10.5, color: T.faint }}>{household.members.length} {household.members.length === 1 ? "osoba" : household.members.length < 5 ? "osoby" : "osób"} · wspólne dane na żywo</div>
                  </div>
                </div>
                {household.role === "owner" && (
                  <div className="pa-press" role="button" onClick={() => { try { navigator.clipboard?.writeText(household.inviteCode); showToast("Kod skopiowany 📋"); } catch (e) { /* nic */ } }}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: `${T.mint}0E`, border: `1px dashed ${T.mint}50`, borderRadius: 13, padding: "11px 14px", marginBottom: 11, cursor: "pointer" }}>
                    <div>
                      <div className="pa-body" style={{ fontSize: 10, color: T.faint }}>KOD ZAPROSZENIA — wyślij domownikowi</div>
                      <div className="pa-mono" style={{ fontSize: 20, fontWeight: 700, letterSpacing: ".28em", color: T.mint, marginTop: 3 }}>{household.inviteCode}</div>
                    </div>
                    <span className="pa-body" style={{ fontSize: 11, color: T.mint, fontWeight: 600 }}>Kopiuj</span>
                  </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
                  {household.members.map((m) => (
                    <span key={m.userId} className="pa-body" style={{ fontSize: 11, fontWeight: 600, color: T.sub, background: "var(--sf1)", border: "1px solid rgba(var(--ovc),.1)", borderRadius: 999, padding: "6px 12px" }}>
                      {m.userId === session.user.id ? "⭐ Ty" : `👤 ${m.name}`}
                    </span>
                  ))}
                </div>
                <button className="pa-press pa-body" disabled={householdBusy}
                  onClick={() => setConfirmBox(household.role === "owner"
                    ? { title: "Rozwiązać rodzinę?", body: "Wszyscy członkowie stracą dostęp do wspólnych danych (każdy zachowa dane lokalne na swoim urządzeniu).", confirmLabel: "Rozwiąż", onConfirm: () => { deleteHousehold(); setConfirmBox(null); } }
                    : { title: "Opuścić rodzinę?", body: "Przestaniesz widzieć wspólne dane rodziny. Twoje dane lokalne zostaną na urządzeniu.", confirmLabel: "Opuść", onConfirm: () => { leaveHousehold(); setConfirmBox(null); } })}
                  style={{ width: "100%", padding: "10px 0", borderRadius: 12, border: `1px solid ${T.danger}45`, background: `${T.danger}10`, color: T.danger, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {household.role === "owner" ? "Rozwiąż rodzinę" : "Opuść rodzinę"}
                </button>
              </>
            ) : effTier === "family" ? (
              <>
                <div className="pa-body" style={{ fontSize: 12, color: T.sub, lineHeight: 1.6, marginBottom: 12 }}>
                  Załóż rodzinę i zaproś domowników kodem — każdy loguje się <b style={{ color: T.text }}>własnym kontem</b>, a paragony, budżet i cele macie wspólne.
                </div>
                <button className="pa-press pa-display" disabled={householdBusy} onClick={() => createHousehold(profile.name ? `Rodzina ${profile.name}` : "Moja rodzina")}
                  style={{ width: "100%", padding: "12px 0", borderRadius: 13, border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 700, background: `linear-gradient(135deg, ${T.mint}, ${T.mintDeep})`, color: "#06251A", marginBottom: 9 }}>
                  {householdBusy ? "Zakładanie..." : "🏠 Załóż rodzinę"}
                </button>
                <JoinCodeBox onJoin={joinHousehold} busy={householdBusy} />
                {householdErr && <div className="pa-fade pa-body" style={{ marginTop: 9, fontSize: 11, color: T.danger, lineHeight: 1.5 }}>{householdErr}</div>}
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <div style={{ flex: 1 }}>
                  <div className="pa-body" style={{ fontSize: 12, color: T.sub, lineHeight: 1.55 }}>
                    Wspólne konto rodzinne (każdy domownik loguje się osobno) dostępne w planie <b style={{ color: T.gold }}>Family</b>.
                  </div>
                  {householdErr && <div className="pa-body" style={{ marginTop: 6, fontSize: 11, color: T.danger }}>{householdErr}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 9, alignItems: "center", flexWrap: "wrap" }}>
                    <JoinCodeBox onJoin={joinHousehold} busy={householdBusy} small />
                    <button className="pa-press pa-body" onClick={() => setView({ name: "plans" })}
                      style={{ marginLeft: "auto", padding: "9px 14px", borderRadius: 11, border: `1px solid ${T.gold}45`, background: `${T.gold}12`, color: T.gold, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                      Family →
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <SectionLabel>Subskrypcja</SectionLabel>
      <div className="pa-rise"  style={{ animationDelay: "120ms", ...card, overflow: "hidden" }}>
        <SettingRow ic={planMeta.ic} tint={planMeta.c} label={`Plan ${planName}`}
          sub={tierLimit !== null ? `${quota.used}/${tierLimit} skanów AI w tym miesiącu` : "Subskrypcja aktywna · zarządzaj"}
          right={effTier === "free"
            ? <span className="pa-mono pa-press" style={{ fontSize: 10, fontWeight: 700, color: "#06251A", background: `linear-gradient(135deg, ${T.mint}, ${T.mintDeep})`, borderRadius: 999, padding: "5px 12px", letterSpacing: ".05em" }}>ULEPSZ</span>
            : <span style={{ color: T.faint }}>›</span>}
          onClick={() => setView({ name: "plans" })} />
        <Divider />
        <SettingRow ic="repeat" tint={T.mint} label="Lista zakupów"
          sub={isPro ? (dueItems.length ? `${dueItems.length} produktów się kończy` : "Powtarzalne zakupy z historii") : "Inteligentna lista — od planu Pro"}
          right={isPro
            ? (dueItems.length > 0 ? <span className="pa-mono" style={{ fontSize: 11, color: T.gold, background: `${T.gold}18`, border: `1px solid ${T.gold}40`, borderRadius: 999, padding: "2px 8px" }}>{dueItems.length}</span> : <span style={{ color: T.faint }}>›</span>)
            : <span className="pa-mono" style={{ fontSize: 9, color: T.gold, letterSpacing: ".1em" }}>PRO</span>}
          onClick={() => isPro ? setView({ name: "restock" }) : setView({ name: "plans", reason: "feature" })} />
        <Divider />
        <SettingRow ic="piggy" tint={T.gold} label="Cele oszczędnościowe"
          sub={hasGoals ? (goals.length ? `${goals.length} ${goals.length === 1 ? "aktywny cel" : "aktywne cele"}` : "Odkładaj na wymarzone cele") : "Skarbonki — od planu Starter"}
          right={hasGoals
            ? (goals.length > 0 ? <span className="pa-mono" style={{ fontSize: 11, color: T.gold, background: `${T.gold}18`, border: `1px solid ${T.gold}40`, borderRadius: 999, padding: "2px 8px" }}>{goals.length}</span> : <span style={{ color: T.faint }}>›</span>)
            : <span className="pa-mono" style={{ fontSize: 9, color: "#A8B8C2", letterSpacing: ".1em" }}>STARTER</span>}
          onClick={() => hasGoals ? setView({ name: "goals" }) : setView({ name: "plans", reason: "feature" })} />
      </div>

      {/* BUDŻETY KATEGORII */}
      <SectionLabel>Budżety miesięczne</SectionLabel>
      {isPro ? (
        <div className="pa-rise"  style={{ animationDelay: "180ms", ...card, overflow: "hidden" }}>
          {BUDGET_CATS.map((slug, i) => {
            const c = catBySlug(slug);
            const set = (budgets[slug] ?? "") !== "" && Number(String(budgets[slug]).replace(",", ".")) > 0;
            return (
              <div key={slug}>
                {i > 0 && <Divider />}
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px" }}>
                  <CatTile slug={slug} size={32} fs={15} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="pa-body" style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{c.name}</div>
                    <div className="pa-body" style={{ fontSize: 10, color: set ? T.mint : T.faint, marginTop: 1 }}>{set ? "limit ustawiony" : "bez limitu"}</div>
                  </div>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <input type="text" inputMode="decimal" value={budgets[slug] ?? ""} placeholder="0"
                      onChange={(e) => setBudgets((b) => ({ ...b, [slug]: e.target.value }))}
                      onBlur={(e) => {
                        const n = Number(String(e.target.value).replace(",", ".").replace(/\s/g, ""));
                        setBudgets((b) => { const nb = { ...b }; if (n > 0) nb[slug] = Math.round(n * 100) / 100; else delete nb[slug]; return nb; });
                      }}
                      className="pa-mono" style={{ width: 90, textAlign: "right", fontSize: 13, padding: "8px 26px 8px 10px", borderRadius: 11,
                        border: `1px solid ${set ? T.mint + "55" : "rgba(var(--ovc),.08)"}`, background: "var(--sf1)", color: T.text, boxSizing: "border-box" }} />
                    <span className="pa-body" style={{ position: "absolute", right: 9, fontSize: 11, color: T.faint, pointerEvents: "none" }}>zł</span>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="pa-body" style={{ fontSize: 10.5, color: T.faint, padding: "8px 14px 12px", lineHeight: 1.5, borderTop: "1px solid rgba(var(--ovc),.05)" }}>
            Paski postępu pojawią się na Pulpicie, gdy w kategorii z budżetem będą wydatki.
          </div>
        </div>
      ) : (
        <button className="pa-press pa-rise" onClick={() => setView({ name: "plans", reason: "feature" })}
          style={{ width: "100%", ...card, padding: "13px 14px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: `${T.gold}16`, border: `1px solid ${T.gold}33`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="alert" size={16} color={T.gold} sw={1.8} />
          </div>
          <span className="pa-body" style={{ flex: 1, fontSize: 12.5, color: T.sub }}>Budżety na kategorie — od planu <b style={{ color: T.text }}>Pro</b></span>
          <span style={{ color: T.gold }}>→</span>
        </button>
      )}

      {/* POWIADOMIENIA */}
      <SectionLabel>Wygląd</SectionLabel>
      <div className="pa-rise" style={{ ...card, padding: "13px 14px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11 }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
            background: `${T.mint}16`, border: `1px solid ${T.mint}38` }}>🎨</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pa-display" style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>Motyw aplikacji</div>
            <div className="pa-body" style={{ fontSize: 10.5, color: T.faint, marginTop: 2 }}>
              {({ auto: "Dopasowuje się do ustawień telefonu", light: "Jasny — dobry w dzień i w słońcu", gold: "Złoty zmierzch — ciepła paleta 🏆", navy: "Nocny granat — głęboki błękit 🌌" })[themePref] || "Ciemny — oszczędza baterię wieczorem"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, background: "var(--sf3)", borderRadius: 13, padding: 4, flexWrap: "wrap" }}>
          {[["dark", "🌙", "Ciemny"], ["light", "☀️", "Jasny"], ["auto", "⚙️", "Auto"],
            ...(themesOwned.includes("theme-gold") ? [["gold", "🏆", "Złoty"]] : []),
            ...(themesOwned.includes("theme-navy") ? [["navy", "🌌", "Granat"]] : [])].map(([id, ico, label]) => {
            const on = themePref === id;
            return (
              <button key={id} className="pa-press pa-body" onClick={() => setThemePref(id)}
                style={{ flex: "1 1 28%", minWidth: 76, padding: "9px 0", borderRadius: 10, cursor: "pointer", fontSize: 11.5, fontWeight: on ? 700 : 500,
                  border: `1px solid ${on ? T.mint + "55" : "transparent"}`,
                  background: on ? `${T.mint}1E` : "transparent",
                  color: on ? T.mint : T.sub,
                  boxShadow: on ? `0 3px 12px ${T.mint}22` : "none",
                  transition: `all 260ms ${T.easeOut}` }}>
                <span style={{ marginRight: 5 }}>{ico}</span>{label}
              </button>
            );
          })}
        </div>
      </div>

      <SectionLabel>Powiadomienia</SectionLabel>
      <div className="pa-rise"  style={{ animationDelay: "240ms", ...card, overflow: "hidden" }}>
        <SettingRow ic="bell" tint="#5BB8E8" label="Przypomnienia o skanowaniu" right={<Toggle on={settings.push} onChange={(v) => setSettings((s) => ({ ...s, push: v }))} />} />
        <Divider />
        <SettingRow ic="report" tint={T.mint} label="Raport tygodniowy" right={<Toggle on={settings.weekly} onChange={(v) => setSettings((s) => ({ ...s, weekly: v }))} />} />
        <Divider />
        <SettingRow ic="alert" tint={T.warn} label="Alerty przekroczenia budżetu" right={<Toggle on={settings.budget} onChange={(v) => setSettings((s) => ({ ...s, budget: v }))} />} />
      </div>

      {/* DANE */}
      <SectionLabel>Dane</SectionLabel>
      <div className="pa-rise"  style={{ animationDelay: "300ms", ...card, overflow: "hidden" }}>
        <SettingRow ic="chart" tint={T.mint} label="Podsumowanie miesiąca" sub="Twój miesiąc w liczbach — gotowe do udostępnienia" right={<span style={{ color: T.faint }}>›</span>}
          onClick={() => setView({ name: "summary", mk: nowMonth() })} />
        <Divider />
        <SettingRow ic="download" tint={T.mint} label="Eksportuj dane" sub="CSV / Excel" right={<span style={{ color: T.faint }}>›</span>}
          onClick={() => {
            if (!isPro) { setView({ name: "plans", reason: "feature" }); return; }
            if (!receipts.length) { showToast("Brak danych do eksportu"); return; }
            exportCSV(receipts); showToast("Plik CSV pobrany ✓");
          }} />
        <Divider />
        <SettingRow ic="download" tint={T.gold} label="Kopia zapasowa" sub="Zapisz wszystkie dane do pliku"
          right={<span style={{ color: T.faint }}>›</span>}
          onClick={() => {
            if (!receipts.length && !goals.length) { showToast("Brak danych do zapisania"); return; }
            downloadBackup({ receipts, plan, profile, settings, quota, budget, budgets, goals, income, challenges, claimedAch, seenAch, claimedLvls, achDates, bonusScans });
            showToast("Kopia zapisana ✓");
          }} />
        <Divider />
        <SettingRow ic="repeat" tint="#5BB8E8" label="Przywróć z kopii" sub="Wczytaj dane z pliku kopii zapasowej"
          right={<span style={{ color: T.faint }}>›</span>}
          onClick={() => backupRef.current?.click()} />
        <Divider />
        <SettingRow ic="trash" danger label="Wyczyść wszystkie dane" right={<span style={{ color: T.faint }}>›</span>}
          onClick={() => setConfirmBox({ title: "Wyczyścić dane?", body: "Usunie wszystkie paragony zapisane w aplikacji. Tej operacji nie można cofnąć.", confirmLabel: "Wyczyść wszystko", onConfirm: () => { setReceipts([]); setQuota({ month: nowMonth(), used: 0 }); setConfirmBox(null); showToast("Dane wyczyszczone"); } })} />
      </div>

      {/* INFORMACJE */}
      <SectionLabel>Informacje</SectionLabel>
      <div className="pa-rise"  style={{ animationDelay: "360ms", ...card, overflow: "hidden" }}>
        <SettingRow ic="lock" tint="#8490DC" label="Polityka prywatności" right={<span style={{ color: T.faint }}>›</span>} onClick={() => showToast("Dokument dostępny w pełnej wersji")} />
        <Divider />
        <SettingRow ic="crown" tint={T.gold} label="Osiągnięcia"
          sub={(achToClaim.length + lvlClaimable.length) ? `${achToClaim.length + lvlClaimable.length} do odebrania — czekają nagrody!` : `Zdobyte: ${claimedAch.length}/${ACHIEVEMENTS.length} · poziom ${lvl + 1}`}
          right={(achToClaim.length + lvlClaimable.length)
            ? <span className="pa-mono" style={{ fontSize: 10, fontWeight: 700, color: "#241C08", background: `linear-gradient(135deg, ${T.gold}, #B2945A)`, borderRadius: 999, padding: "4px 10px" }}>{achToClaim.length + lvlClaimable.length} 🎁</span>
            : <span style={{ color: T.faint }}>›</span>}
          onClick={() => setView({ name: "achievements" })} />
        <Divider />
        <SettingRow ic="spark" tint={T.mint} label="Samouczek" sub="Zobacz ponownie, jak działa aplikacja" right={<span style={{ color: T.faint }}>›</span>}
          onClick={() => { setView({ name: "tabs" }); setTab("pulpit"); setTutStep(0); }} />
        <Divider />
        <SettingRow ic="doc" tint="#A8B4BB" label="Regulamin" right={<span style={{ color: T.faint }}>›</span>} onClick={() => showToast("Dokument dostępny w pełnej wersji")} />
        <Divider />
        <SettingRow ic="info" tint="#5FC6B5" label="Wersja aplikacji" right={<span className="pa-mono" style={{ fontSize: 11.5, color: T.faint }}>0.5.0</span>} />
      </div>

      <div className="pa-body" style={{ textAlign: "center", fontSize: 10.5, color: T.faint, marginTop: 22, letterSpacing: ".03em" }}>
        Paragon AI · zaprojektowane w Polsce 🇵🇱
      </div>
    </div>
    );
  };

  /* ---------- OSIĄGNIĘCIA ---------- */
  const achMx = useMemo(() => achMetrics(realReceipts, goals, challenges, realStreak, profile), [realReceipts, goals, challenges, realStreak, profile]);
  const achList = useMemo(() => ACHIEVEMENTS.map((a) => {
    if (a.id === "master-crown") {
      const others = ACHIEVEMENTS.filter((o) => o.id !== "master-crown");
      const target = others.length;
      const cur = others.filter((o) => claimedAch.includes(o.id)).length;
      return { ...a, cur, target, unlocked: cur >= target, claimed: claimedAch.includes(a.id) };
    }
    const cur = Math.min(achMx[a.metric] || 0, a.target);
    const unlocked = (achMx[a.metric] || 0) >= a.target;
    return { ...a, cur, unlocked, claimed: claimedAch.includes(a.id) };
  }), [achMx, claimedAch]);
  const achToClaim = achList.filter((a) => a.unlocked && !a.claimed);
  const totalXp = useMemo(() => achList.filter((a) => a.claimed).reduce((sum, a) => sum + (a.xp || 0), 0) + challenges.filter((c) => c.status === "won").length * 25, [achList, challenges]);
  const lvl = levelOf(totalXp);
  const lvlNext = LEVELS[lvl + 1] || null;
  const lvlPct = lvlNext ? (totalXp - LEVELS[lvl].xp) / (lvlNext.xp - LEVELS[lvl].xp) : 1;
  // popup o świeżo odblokowanym osiągnięciu (kolejka; raz na osiągnięcie)
  useEffect(() => {
    if (!loaded || !onboarded || achPopup) return;
    const next = achList.find((a) => a.unlocked && !a.claimed && !seenAch.includes(a.id));
    if (next) {
      setAchPopup(next);
      setSeenAch((arr) => arr.includes(next.id) ? arr : [...arr, next.id]);
      navigator.vibrate?.([25, 60, 25]);
    }
  }, [achList, seenAch, achPopup, loaded, onboarded]);
  useEffect(() => {
    if (!achPopup) return;
    const t = setTimeout(() => setAchPopup(null), 5000);
    return () => clearTimeout(t);
  }, [achPopup]);
  const lvlClaimable = useMemo(() => LEVELS.map((L, i) => ({ ...L, i }))
    .filter((L) => L.i > 0 && L.i <= lvl && (L.scans || L.proDays || L.title) && !claimedLvls.includes(L.i)), [lvl, claimedLvls]);
  const claimLevel = (L) => {
    if (claimedLvls.includes(L.i) || L.i > lvl || lvlPop !== null) return;
    setLvlPop(L.i);
    navigator.vibrate?.(35);
    setTimeout(() => {
      setClaimedLvls((arr) => (arr.includes(L.i) ? arr : [...arr, L.i]));
      if (L.scans) setBonusScans((b) => b + L.scans);
      if (L.proDays) setPlan((p) => ({ ...p, proUntil: Math.max(p?.proUntil || 0, Date.now()) + L.proDays * 864e5 }));
      if (L.title) setProfile((p) => ({ ...p, title: L.title }));
      const parts = [];
      if (L.scans) parts.push(`+${L.scans} skanów 🎁`);
      if (L.proDays) parts.push(`+${L.proDays} ${L.proDays === 1 ? "dzień" : "dni"} Pro 👑`);
      if (L.title) parts.push(`tytuł „${L.title}"`);
      setCelebrate({ emoji: "🎖️", tag: "NOWY POZIOM", title: `Poziom ${L.i + 1} · ${L.name}`, badge: parts.join(" · ") });
      navigator.vibrate?.([40, 80, 40, 80, 120]);
      setLvlPop(null);
      // płynny dojazd ścieżki do kolejnej czekającej nagrody
      setTimeout(() => {
        try {
          const el = document.querySelector("[data-lvlpath]");
          const nxt = el?.querySelector("[data-lvlgold]");
          if (el && nxt) el.scrollTo({ left: Math.max(0, nxt.offsetLeft - el.clientWidth / 2 + 22), behavior: "smooth" });
        } catch (e) { /* nic */ }
      }, 350);
    }, 430);
  };
  const grantRewards = (list) => {
    const scans = list.reduce((n, a) => n + (a.reward || 0), 0);
    const xp = list.reduce((n, a) => n + (a.xp || 0), 0);
    const days = list.reduce((n, a) => n + (a.proDays || 0), 0);
    const titled = [...list].reverse().find((a) => a.titleReward);
    const sd = Math.round(list.reduce((n, a) => n + (SEED_BY_TIER[achTier(a)] || 10), 0) * seedMult);
    if (sd > 0) setSeeds((v) => v + sd);
    if (scans > 0) setBonusScans((b) => b + scans);
    if (days > 0) setPlan((p) => ({ ...p, proUntil: Math.max(p?.proUntil || 0, Date.now()) + days * 864e5 }));
    if (titled) setProfile((p) => ({ ...p, title: titled.title }));
    const parts = [];
    if (scans > 0) parts.push(`+${scans} skanów 🎁`);
    if (xp > 0) parts.push(`+${xp} XP ⚡`);
    if (sd > 0) parts.push(`+${sd} 🌱`);
    if (days > 0) parts.push(`+${days} dni Pro 👑`);
    if (titled) parts.push(`tytuł „${titled.title}"`);
    return parts.join(" · ");
  };
  const claimAch = (a) => {
    if (!a.unlocked || claimedAch.includes(a.id)) return;
    setClaimedAch((arr) => [...arr, a.id]);
    setAchDates((d) => ({ ...d, [a.id]: Date.now() }));
    const badge = grantRewards([a]);
    setCelebrate({ emoji: a.emoji, tag: "OSIĄGNIĘCIE ZDOBYTE", title: a.title, badge: badge || a.title });
    navigator.vibrate?.([40, 80, 40, 80, 120]);
  };
  const claimAll = () => {
    const list = achList.filter((a) => a.unlocked && !a.claimed);
    const lvls = lvlClaimable;
    if (!list.length && !lvls.length) return;
    if (list.length) {
      setClaimedAch((arr) => [...arr, ...list.map((a) => a.id)]);
      setAchDates((d) => { const nd = { ...d }; const now = Date.now(); list.forEach((a) => { nd[a.id] = now; }); return nd; });
    }
    if (lvls.length) {
      setClaimedLvls((arr) => [...arr, ...lvls.map((L) => L.i)]);
      const sc = lvls.reduce((n, L) => n + (L.scans || 0), 0);
      const pd = lvls.reduce((n, L) => n + (L.proDays || 0), 0);
      const tt = [...lvls].reverse().find((L) => L.title);
      if (sc) setBonusScans((b) => b + sc);
      if (pd) setPlan((p) => ({ ...p, proUntil: Math.max(p?.proUntil || 0, Date.now()) + pd * 864e5 }));
      if (tt && !list.some((a) => a.titleReward)) setProfile((p) => ({ ...p, title: tt.title }));
    }
    const lp = [];
    {
      const sc2 = lvls.reduce((n, L) => n + (L.scans || 0), 0);
      const pd2 = lvls.reduce((n, L) => n + (L.proDays || 0), 0);
      if (sc2) lp.push(`+${sc2} skanów 🎁`);
      if (pd2) lp.push(`+${pd2} dni Pro 👑`);
    }
    const badge = [grantRewards(list), lp.join(" · ")].filter(Boolean).join(" · ");
    const cnt = list.length + lvls.length;
    setCelebrate({
      emoji: cnt > 1 ? "🎊" : list.length ? list[0].emoji : "🎖️",
      tag: cnt > 1 ? "NAGRODY ODEBRANE" : list.length ? "OSIĄGNIĘCIE ZDOBYTE" : "NOWY POZIOM",
      title: cnt > 1 ? `Odebrano ${cnt} nagród!` : list.length ? list[0].title : `Poziom ${lvls[0].i + 1} · ${lvls[0].name}`,
      badge: badge || "Nagrody odebrane",
    });
    navigator.vibrate?.([40, 80, 40, 80, 160]);
  };

  /* ---------- SKLEP ZA ZIARNA ---------- */
  const buyItem = (it) => {
    if (seeds < it.cost) { showToast("Za mało Ziaren 🌱"); return; }
    if (it.id === "freeze" && freezes >= (it.max || 2)) { showToast("Masz już maksimum ochron 🧊"); return; }
    if (it.theme && themesOwned.includes(it.id)) { showToast("Ten motyw już masz 🎨"); return; }
    setSeeds((v) => v - it.cost);
    if (it.id === "freeze") { setFreezes((f) => f + 1); showToast("🧊 Ochrona serii kupiona"); }
    else if (it.id === "scans5") { setBonusScans((b) => b + 5); showToast("📷 +5 skanów AI"); }
    else if (it.id === "pro1" || it.id === "pro7") {
      const d = it.id === "pro1" ? 1 : 7;
      setPlan((p) => ({ ...p, proUntil: Math.max(p?.proUntil || 0, Date.now()) + d * 864e5 }));
      showToast(`👑 Pro na ${d === 1 ? "1 dzień" : "7 dni"}!`);
    } else if (it.theme) {
      setThemesOwned((t) => [...t, it.id]);
      setThemePref(it.id === "theme-gold" ? "gold" : "navy");
      showToast("🎨 Motyw odblokowany i włączony");
    }
    navigator.vibrate?.([20, 50, 20]);
  };

  const ShopView = () => (
    <div className="pa-slidein" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Header title="Sklep za Ziarna" onBack={() => setView({ name: "achievements" })} />
      <div className="pa-scroll" style={{ flex: 1, minHeight: 0, padding: "6px 18px 48px" }}>
        <div className="pa-rise" style={{ ...card, padding: "15px 16px", marginBottom: 15, textAlign: "center",
          background: `linear-gradient(140deg, ${T.mint}1C, ${T.gold}12)`, border: `1px solid ${T.mint}3A` }}>
          <div className="pa-mono" style={{ fontSize: 9.5, letterSpacing: ".16em", color: T.faint }}>TWOJE ZIARNA</div>
          <div className="pa-display" style={{ fontSize: 34, fontWeight: 700, color: T.text, marginTop: 4 }}>
            {seeds} <span style={{ fontSize: 22 }}>🌱</span>
          </div>
          {seedMult > 1 && (
            <div className="pa-mono" style={{ display: "inline-block", marginTop: 7, fontSize: 10, fontWeight: 700, color: "#241C08",
              background: `linear-gradient(135deg, ${sTier.c}, ${sTier.c}CC)`, borderRadius: 999, padding: "4px 11px" }}>
              🔥 SERIA {realStreak} DNI · ZIARNA ×{seedMult}
            </div>
          )}
          <div className="pa-body" style={{ fontSize: 10.5, color: T.sub, marginTop: 7, lineHeight: 1.5 }}>
            Najwięcej dostajesz za <b style={{ color: T.mint }}>tydzień zamknięty pod budżetem</b> (+{SEED_WEEK_BUDGET} 🌱{seedMult > 1 ? ` → +${Math.round(SEED_WEEK_BUDGET * seedMult)} 🌱` : ""})
          </div>
        </div>

        {freezes > 0 && (
          <div className="pa-rise" style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 13px", borderRadius: 14,
            background: "rgba(91,184,232,.12)", border: "1px solid rgba(91,184,232,.3)", marginBottom: 13 }}>
            <span style={{ fontSize: 16 }}>🧊</span>
            <span className="pa-body" style={{ fontSize: 11, color: T.sub, lineHeight: 1.45 }}>
              Masz <b style={{ color: "#5BB8E8" }}>{freezes}</b> {freezes === 1 ? "ochronę" : "ochrony"} serii — zadziała sama, gdy opuścisz dzień.
            </span>
          </div>
        )}

        {SHOP.map((it, i) => {
          const owned = it.theme && themesOwned.includes(it.id);
          const full = it.id === "freeze" && freezes >= (it.max || 2);
          const can = seeds >= it.cost && !owned && !full;
          return (
            <div key={it.id} className="pa-rise" style={{ ...card, padding: "13px 14px", marginBottom: 9, animationDelay: `${i * 45}ms`,
              border: it.best ? `1px solid ${T.gold}55` : card.border }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <div style={{ width: 40, height: 40, borderRadius: 13, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 19, background: "var(--sf3)" }}>{it.ico}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="pa-display" style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{it.name}</span>
                    {it.best && <span className="pa-mono" style={{ fontSize: 7.5, fontWeight: 700, color: "#241C08", background: T.gold, borderRadius: 999, padding: "1.5px 6px" }}>HIT</span>}
                  </div>
                  <div className="pa-body" style={{ fontSize: 10.3, color: T.faint, marginTop: 2, lineHeight: 1.45 }}>{it.desc}</div>
                </div>
                <button className="pa-press pa-mono" onClick={() => buyItem(it)} disabled={!can}
                  style={{ flexShrink: 0, padding: "9px 12px", borderRadius: 12, cursor: can ? "pointer" : "default", fontSize: 11.5, fontWeight: 700,
                    border: can ? "none" : `1px solid ${T.glassBorder}`,
                    background: owned || full ? "var(--sf3)" : can ? `linear-gradient(135deg, ${T.mint}, ${T.mintDeep})` : "var(--sf2)",
                    color: owned || full ? T.faint : can ? "#06251A" : T.faint,
                    boxShadow: can ? `0 5px 16px ${T.mint}30` : "none" }}>
                  {owned ? "MASZ" : full ? "MAX" : `${it.cost} 🌱`}
                </button>
              </div>
            </div>
          );
        })}

        <div className="pa-body" style={{ fontSize: 10, color: T.faint, textAlign: "center", marginTop: 14, lineHeight: 1.6 }}>
          Ziarna zdobywasz za tygodnie pod budżetem, wyzwania,<br />osiągnięcia, serię dni i skanowanie paragonów.
        </div>
      </div>
    </div>
  );

  const AchievementsView = () => {
    const claimable = achList.filter((a) => a.unlocked && !a.claimed);
    const done = achList.filter((a) => a.claimed);
    const todo = achList.filter((a) => !a.unlocked && a.id !== "master-crown")
      .sort((a, b) => (b.cur / b.target) - (a.cur / a.target));
    const master = achList.find((a) => a.id === "master-crown");
    const nextGoal = todo.find((a) => !a.secret) || todo[0];
    const totalReward = claimable.reduce((sum, a) => sum + (a.xp || 0), 0);
    const pct = achList.length ? done.length / achList.length : 0;
    const R = 30, C = 2 * Math.PI * R;

    const Card = ({ a, claimable: canClaim, compact }) => {
      const king = a.id === "master-crown";
      const tier = ACH_TIERS[achTier(a)];
      const hidden = a.secret && !a.unlocked;
      const prog = Math.min(a.cur / a.target, 1);
      return (
        <div className={king ? "pa-crown" : canClaim ? "pa-sheen" : ""} style={{ ...card,
          padding: king ? "15px 15px" : "12px 14px",
          border: `1px solid ${king ? T.gold + "70" : canClaim ? T.gold + "55" : a.claimed ? tier.color + "45" : "rgba(var(--ovc),.07)"}`,
          background: king ? `linear-gradient(135deg, rgba(216,184,120,.16), rgba(var(--ovc),.03))`
            : canClaim ? `linear-gradient(135deg, ${T.gold}12, rgba(var(--ovc),.02))` : card.background,
          boxShadow: canClaim && !king ? `0 8px 26px ${T.gold}20` : card.boxShadow, opacity: hidden ? 0.72 : 1 }}>
          {king && <div className="pa-mono" style={{ fontSize: 8.5, letterSpacing: ".16em", color: T.gold, marginBottom: 9 }}>★ NAGRODA SPECJALNA · +50 SKANÓW</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
              background: a.claimed ? `${tier.color}18` : canClaim ? `${T.gold}1C` : "rgba(var(--ovc),.05)",
              border: `1px solid ${a.claimed || canClaim ? tier.color + "55" : "rgba(var(--ovc),.09)"}`,
              filter: !a.unlocked ? "grayscale(.75)" : "none",
              boxShadow: canClaim ? `0 0 16px ${T.gold}40` : "none" }}>
              {hidden ? "🔒" : a.emoji}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span className="pa-display" style={{ fontSize: 13.5, fontWeight: 600, color: hidden ? T.sub : T.text }}>
                  {hidden ? "Sekretne osiągnięcie" : a.title}
                </span>
                <span className="pa-mono" style={{ fontSize: 8, fontWeight: 700, letterSpacing: ".08em", color: tier.color, background: `${tier.color}16`, border: `1px solid ${tier.color}38`, borderRadius: 999, padding: "2px 6px" }}>
                  {tier.name.toUpperCase()}
                </span>
                {!hidden && (a.proDays || 0) > 0 && (
                  <span className="pa-mono" style={{ fontSize: 9, fontWeight: 700, color: T.gold, background: `${T.gold}14`, border: `1px solid ${T.gold}3A`, borderRadius: 999, padding: "2px 7px" }}>👑 {a.proDays} dni Pro</span>
                )}
                {!hidden && a.reward > 0 && (
                  <span className="pa-mono" style={{ fontSize: 9, fontWeight: 700, color: T.mint, background: `${T.mint}12`, border: `1px solid ${T.mint}35`, borderRadius: 999, padding: "2px 7px" }}>🎁 {a.reward}</span>
                )}
                {!hidden && (a.xp || 0) > 0 && (
                  <span className="pa-mono" style={{ fontSize: 9, fontWeight: 700, color: "#9FB3C8", background: "var(--sf1)", border: "1px solid rgba(var(--ovc),.1)", borderRadius: 999, padding: "2px 7px" }}>⚡{a.xp}</span>
                )}
              </div>
              <div className="pa-body" style={{ fontSize: 10.5, color: T.faint, marginTop: 3, lineHeight: 1.45 }}>
                {hidden ? "Odkryjesz je, używając aplikacji. Nagroda czeka 👀" : a.desc}
                {a.claimed && <span style={{ color: T.mint + "AA" }}> · zdobyte {relTime(achDates[a.id])}</span>}
              </div>
              {!a.unlocked && !compact && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
                  <div style={{ flex: 1, height: 4, background: "var(--sf2)", borderRadius: 2, overflow: "hidden" }}>
                    <div className={prog > 0.5 ? "pa-bar-glint" : ""} style={{ height: "100%", width: `${Math.max(prog * 100, 3)}%`, borderRadius: 2, background: `linear-gradient(90deg, ${tier.color}, ${tier.color}99)`, transition: `width 600ms ${T.easeOut}` }} />
                  </div>
                  <span className="pa-mono" style={{ fontSize: 9.5, color: prog > 0.75 ? tier.color : T.faint, flexShrink: 0, fontWeight: prog > 0.75 ? 700 : 400 }}>
                    {hidden ? "?" : `${Math.floor(a.cur)}/${a.target}`}
                  </span>
                </div>
              )}
            </div>
            {canClaim ? (
              <button className="pa-press pa-display pa-glow" onClick={() => claimAch(a)}
                style={{ flexShrink: 0, padding: "10px 14px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 700,
                  background: `linear-gradient(135deg, ${T.gold}, #B2945A)`, color: "#241C08" }}>
                Odbierz
              </button>
            ) : a.claimed ? <span style={{ fontSize: 17, flexShrink: 0 }}>✅</span> : null}
          </div>
        </div>
      );
    };

    const Chip = ({ k, label, n }) => (
      <button className="pa-press pa-body" onClick={() => setAchFilter(k)}
        style={{ flexShrink: 0, padding: "7px 13px", borderRadius: 999, cursor: "pointer", fontSize: 11.5, fontWeight: 600,
          border: `1px solid ${achFilter === k ? T.mint + "60" : "rgba(var(--ovc),.1)"}`,
          background: achFilter === k ? `${T.mint}18` : "rgba(var(--ovc),.04)",
          color: achFilter === k ? T.mint : T.sub, transition: `all 240ms ${T.easeOut}` }}>
        {label}{n != null ? ` ${n}` : ""}
      </button>
    );

    const shown = achFilter === "claim" ? claimable : achFilter === "done" ? done : achFilter === "todo" ? todo : null;

    return (
      <div className="pa-slidein" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Header title="Osiągnięcia" onBack={() => setView({ name: "tabs" })} />
        <div className="pa-scroll" style={{ flex: 1, padding: "6px 18px 48px" }}>
          {/* podsumowanie z pierścieniem */}
          <div className="pa-rise"  style={{ animationDelay: "360ms", ...card, padding: "16px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 15 }}>
            <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
              <svg width="72" height="72" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="36" cy="36" r={R} fill="none" stroke="rgba(var(--ovc),.08)" strokeWidth="6" />
                <circle cx="36" cy="36" r={R} fill="none" stroke={T.gold} strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
                  style={{ transition: `stroke-dashoffset 1100ms ${T.easeOut}`, filter: `drop-shadow(0 0 6px ${T.gold}66)` }} />
                {pct > 0.02 && (
                  <circle cx={36 + R * Math.cos(2 * Math.PI * pct)} cy={36 + R * Math.sin(2 * Math.PI * pct)} r="4.5"
                    fill="var(--c-text)" style={{ transition: `all 1100ms ${T.easeOut}`, filter: `drop-shadow(0 0 7px ${T.gold})` }} />
                )}
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span className="pa-display" style={{ fontSize: 16, fontWeight: 700, color: T.text, lineHeight: 1 }}>{Math.round(pct * 100)}%</span>
                <span className="pa-mono" style={{ fontSize: 8.5, color: T.faint, marginTop: 1 }}>{done.length}/{achList.length}</span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="pa-display" style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Twoja kolekcja</div>
              <div className="pa-body" style={{ fontSize: 11, color: T.faint, marginTop: 3, lineHeight: 1.5 }}>
                {claimable.length ? <>Czeka <b style={{ color: T.gold }}>{claimable.length}</b> {claimable.length === 1 ? "nagroda" : "nagrody"} do odebrania</> : "Zdobywaj odznaki i darmowe skany"}
              </div>
              <div style={{ marginTop: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                  <span className="pa-display" style={{ fontSize: 11.5, fontWeight: 700, color: T.mint }}>⚡ Poziom {lvl + 1} · {LEVELS[lvl].name}</span>
                  <span className="pa-mono" style={{ fontSize: 9.5, color: T.faint }}>{totalXp}{lvlNext ? ` / ${lvlNext.xp}` : ""} XP</span>
                </div>
                <div style={{ height: 5, background: "var(--sf2)", borderRadius: 3, overflow: "hidden" }}>
                  <div className="pa-bar-glint" style={{ height: "100%", width: `${Math.max(lvlPct * 100, 2)}%`, borderRadius: 3, background: `linear-gradient(90deg, ${T.mint}, ${T.mintDeep})`, transition: `width 700ms ${T.easeOut}` }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {bonusScans > 0 && <span className="pa-mono" style={{ fontSize: 10, fontWeight: 700, color: T.mint, background: `${T.mint}12`, border: `1px solid ${T.mint}35`, borderRadius: 999, padding: "4px 9px" }}>🎁 {bonusScans} skanów</span>}
                {claimable.length > 0 && (
                  <span className="pa-mono" style={{ fontSize: 10, fontWeight: 700, color: T.gold, background: `${T.gold}12`, border: `1px solid ${T.gold}35`, borderRadius: 999, padding: "4px 9px" }}>+{claimable.reduce((n, a) => n + (a.xp || 0), 0)} XP do wzięcia</span>
                )}
              </div>
            </div>
          </div>

          {/* 🔥 seria: próg + mnożnik + następny prezent */}
          <div className="pa-rise" style={{ ...card, padding: "14px 15px", marginBottom: 12,
            background: `linear-gradient(135deg, ${sTier.c}18, ${sTier.c}06)`, border: `1px solid ${sTier.c}40` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center",
                background: `${sTier.c}1E`, border: `1px solid ${sTier.c}55` }}>
                <span className={realStreak > 0 ? "pa-flame" : ""} style={{ fontSize: 23 }}>{realStreak > 0 ? sTier.emoji : "🌱"}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
                  <span className="pa-display" style={{ fontSize: 17, fontWeight: 700, color: T.text }}>
                    {realStreak} {realStreak === 1 ? "dzień" : "dni"}
                  </span>
                  <span className="pa-mono" style={{ fontSize: 9.5, fontWeight: 700, color: sTier.c }}>{sTier.name.toUpperCase()}</span>
                </div>
                <div className="pa-body" style={{ fontSize: 10.5, color: T.faint, marginTop: 2.5, lineHeight: 1.45 }}>
                  {seedMult > 1
                    ? <>Wszystkie Ziarna <b style={{ color: sTier.c }}>×{seedMult}</b> dzięki serii</>
                    : "Skanuj 3 dni z rzędu, a Ziarna zaczną się mnożyć"}
                </div>
              </div>
              {seedMult > 1 && (
                <div className="pa-mono" style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: "#241C08",
                  background: `linear-gradient(135deg, ${sTier.c}, ${sTier.c}CC)`, borderRadius: 11, padding: "6px 10px" }}>
                  ×{seedMult}
                </div>
              )}
            </div>

            {sNext && (() => {
              const prev = sTier.d, span = sNext.d - prev, done = Math.max(0, realStreak - prev);
              const pct = Math.min(100, Math.round((done / span) * 100));
              const gift = STREAK_GIFTS[sNext.d];
              const giftTxt = gift ? [gift.seeds && `+${gift.seeds} 🌱`, gift.freeze && `+${gift.freeze} 🧊`, gift.proDays && `+${gift.proDays} dni Pro 👑`, gift.title && `tytuł`].filter(Boolean).join(" · ") : null;
              return (
                <div style={{ marginTop: 12 }}>
                  <div style={{ height: 6, borderRadius: 999, background: "var(--sf3)", overflow: "hidden" }}>
                    <div className="pa-fill" style={{ width: `${pct}%`, height: "100%", borderRadius: 999,
                      background: `linear-gradient(90deg, ${sTier.c}, ${sNext.c})` }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <span className="pa-body" style={{ fontSize: 10, color: T.faint }}>
                      Jeszcze <b style={{ color: T.sub }}>{sNext.d - realStreak}</b> {sNext.d - realStreak === 1 ? "dzień" : "dni"} do „{sNext.name}" (×{sNext.mult})
                    </span>
                    {giftTxt && <span className="pa-mono" style={{ fontSize: 9, color: T.gold, flexShrink: 0 }}>🎁 {giftTxt}</span>}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* sklep za Ziarna */}
          <div className="pa-press pa-rise" role="button" onClick={() => setView({ name: "shop" })}
            style={{ ...card, padding: "13px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 11, cursor: "pointer",
              background: `linear-gradient(135deg, ${T.mint}14, ${T.gold}0E)`, border: `1px solid ${T.mint}38` }}>
            <div style={{ width: 40, height: 40, borderRadius: 13, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 19, background: `${T.mint}1C`, border: `1px solid ${T.mint}44` }}>🌱</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="pa-display" style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>
                {seeds} <span style={{ fontSize: 11, color: T.sub, fontWeight: 500 }}>Ziaren</span>
              </div>
              <div className="pa-body" style={{ fontSize: 10.3, color: T.faint, marginTop: 2 }}>
                {seedMult > 1 ? `×${seedMult} od serii · ` : ""}{freezes > 0 ? `🧊 ${freezes} w zapasie · ` : ""}Wymień na skany, Pro i motywy
              </div>
            </div>
            <span style={{ flexShrink: 0, color: T.mint, fontSize: 17 }}>›</span>
          </div>

          {/* ścieżka poziomów */}
          <div className="pa-rise" style={{ ...card, padding: "14px 0 12px", marginBottom: 14, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "0 15px", marginBottom: 12, gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div className="pa-display" style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>🎖️ Ścieżka poziomów</div>
                <div className="pa-body" style={{ fontSize: 9.8, color: T.faint, marginTop: 2.5 }}>
                  {lvlClaimable.length ? "Złote węzły czekają — dotknij, by odebrać" : "Przesuń palcem, by zobaczyć nagrody →"}
                </div>
              </div>
              <span className="pa-mono" style={{ flexShrink: 0, fontSize: 9.5, marginTop: 2, color: lvlClaimable.length ? T.gold : T.faint, fontWeight: lvlClaimable.length ? 700 : 400 }}>
                {lvlClaimable.length ? `${lvlClaimable.length} do odebrania ✨` : `${lvl + 1} / ${LEVELS.length}`}
              </span>
            </div>

            <div style={{ position: "relative" }}>
              <div className="pa-lvl-track" data-lvlpath="1"
                ref={(el) => { if (el && !el.dataset.c) { el.dataset.c = "1"; el.scrollLeft = Math.max(0, lvl * 62 - 110); } }}
                style={{ padding: "6px 15px 8px" }}>
                {LEVELS.map((L, i) => {
                  const got = i <= lvl;
                  const isNow = i === lvl;
                  const hasReward = !!(L.scans || L.proDays || L.title);
                  const canTake = got && i > 0 && hasReward && !claimedLvls.includes(i);
                  const taken = hasReward && claimedLvls.includes(i);
                  const rewardIco = L.proDays ? "👑" : L.scans ? "🎁" : L.title ? "🏷️" : null;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", flexShrink: 0 }}>
                      {i > 0 && (
                        <div style={{ width: 20, height: 3, borderRadius: 3, marginTop: 27,
                          background: got ? `linear-gradient(90deg, ${T.mint}, ${T.mint}CC)` : "rgba(var(--ovc),.09)" }} />
                      )}
                      <div className="pa-press pa-lvl-node" role="button" data-lvlgold={canTake ? "1" : undefined}
                        onClick={canTake ? () => claimLevel({ ...L, i }) : () => setLvlInfo(lvlInfo === i ? null : i)}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 54, cursor: "pointer" }}>

                        <div style={{ position: "relative", height: 13, display: "flex", alignItems: "center" }}>
                          {isNow ? (
                            <span className="pa-mono" style={{ fontSize: 7, fontWeight: 700, letterSpacing: ".08em",
                              color: canTake ? "#241C08" : "#06251A", background: canTake ? T.gold : T.mint,
                              borderRadius: 999, padding: "1.5px 6px", whiteSpace: "nowrap" }}>{canTake ? "TU ✨" : "TU"}</span>
                          ) : canTake ? (
                            <span className="pa-gift" style={{ fontSize: 10 }}>✨</span>
                          ) : null}
                        </div>

                        <div className={lvlPop === i ? "pa-node-pop" : canTake ? "pa-node-bob" : ""}
                          style={{ position: "relative", width: 46, height: 46, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: rewardIco ? 18 : 14, fontWeight: 700,
                            background: canTake ? `linear-gradient(135deg, ${T.gold}, #B2945A)`
                              : taken ? `${T.mint}22` : got ? `${T.mint}16` : "var(--sf3)",
                            border: `2px solid ${lvlInfo === i ? T.text : canTake ? T.gold : isNow ? T.mint : got ? T.mint + "55" : "rgba(var(--ovc),.09)"}`,
                            color: canTake ? "#241C08" : got ? T.mint : T.faint,
                            boxShadow: canTake ? `0 0 20px ${T.gold}66, 0 4px 12px ${T.gold}33`
                              : isNow ? `0 0 18px ${T.mint}55` : "none",
                            opacity: got ? 1 : .72 }}>
                          {canTake && lvlPop !== i && <span className="pa-node-ring" />}
                          {lvlPop === i && <span className="pa-node-burst" />}
                          {canTake ? rewardIco : taken ? "✓" : got ? (rewardIco || "✓") : (rewardIco || i + 1)}
                        </div>

                        <div style={{ textAlign: "center", width: "100%" }}>
                          <div className="pa-body" style={{ fontSize: 8, lineHeight: 1.25, fontWeight: isNow ? 700 : 500,
                            color: isNow ? T.mint : got ? T.sub : T.faint,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{L.name}</div>
                          <div className="pa-mono" style={{ fontSize: 7.5, color: T.faint, marginTop: 1 }}>
                            {L.xp >= 1000 ? (L.xp / 1000).toFixed(1).replace(".0", "") + "k" : L.xp}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 20, pointerEvents: "none",
                background: `linear-gradient(90deg, var(--c-glass), transparent)` }} />
              <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 20, pointerEvents: "none",
                background: `linear-gradient(270deg, var(--c-glass), transparent)` }} />
            </div>

            {lvlInfo !== null && LEVELS[lvlInfo] ? (() => { const L = LEVELS[lvlInfo]; const got = lvlInfo <= lvl; const taken = claimedLvls.includes(lvlInfo);
              const rw = [L.scans && `🎁 +${L.scans} skanów`, L.proDays && `👑 +${L.proDays} ${L.proDays === 1 ? "dzień" : "dni"} Pro`, L.title && `🏷️ tytuł „${L.title}"`].filter(Boolean).join(" · ");
              return (
                <div key={lvlInfo} className="pa-fade" style={{ margin: "8px 13px 0", padding: "10px 13px", borderRadius: 13, background: got ? `${T.mint}0C` : "rgba(var(--ovc),.04)", border: `1px solid ${got ? T.mint + "35" : "rgba(var(--ovc),.1)"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <span className="pa-display" style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>Poziom {lvlInfo + 1} · {L.name}</span>
                    <span className="pa-mono" style={{ fontSize: 9, color: got ? T.mint : T.faint, flexShrink: 0 }}>{got ? (taken || !rw ? "✓ osiągnięty" : "do odebrania ✨") : `${L.xp} XP`}</span>
                  </div>
                  <div className="pa-body" style={{ fontSize: 10.5, color: rw ? T.gold : T.faint, marginTop: 4, lineHeight: 1.5 }}>
                    {rw ? <>Nagroda: {rw}</> : "Poziom prestiżowy — sama chwała ⚡"}
                    {!got && <span style={{ color: T.faint }}> · brakuje {L.xp - totalXp} XP</span>}
                  </div>
                </div>
              ); })() : (
              <div className="pa-body" style={{ fontSize: 9.5, color: T.faint, padding: "7px 15px 0", lineHeight: 1.5 }}>
                Poziom {lvl + 1}: <b style={{ color: T.text }}>{LEVELS[lvl].name}</b>{lvlNext ? <> · do „{lvlNext.name}" brakuje <b style={{ color: T.mint }}>{lvlNext.xp - totalXp} XP</b></> : " · maksymalny 👑"} · dotknij węzła, by zobaczyć nagrodę
              </div>
            )}
          </div>

          {/* odbierz wszystkie */}
          {(claimable.length + lvlClaimable.length) > 1 && (
            <button className="pa-press pa-display pa-glow" onClick={claimAll}
              style={{ width: "100%", marginBottom: 16, padding: "13px 0", borderRadius: 14, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700,
                background: `linear-gradient(135deg, ${T.gold}, #B2945A)`, color: "#241C08" }}>
              🎁 Odbierz wszystkie ({claimable.length + lvlClaimable.length}){totalReward > 0 ? ` · +${totalReward} XP` : ""}
            </button>
          )}

          {/* filtry */}
          <div className="pa-scroll" style={{ display: "flex", gap: 7, marginBottom: 16, overflowX: "auto", paddingBottom: 2 }}>
            <Chip k="all" label="Wszystkie" />
            <Chip k="claim" label="🎁 Do odebrania" n={claimable.length + lvlClaimable.length} />
            <Chip k="todo" label="W drodze" n={todo.length} />
            <Chip k="done" label="Zdobyte" n={done.length} />
          </div>

          {shown ? (
            (shown.length || (achFilter === "claim" && lvlClaimable.length)) ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {achFilter === "claim" && lvlClaimable.map((L) => (
                  <div key={"lvl" + L.i} className="pa-sheen" style={{ ...card, padding: "12px 14px", border: `1px solid ${T.gold}55`, background: `linear-gradient(135deg, ${T.gold}12, rgba(var(--ovc),.02))`, display: "flex", alignItems: "center", gap: 11 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 999, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, background: `${T.gold}1C`, border: `1px solid ${T.gold}55` }}>🎖️</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="pa-display" style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>Poziom {L.i + 1} · {L.name}</div>
                      <div className="pa-body" style={{ fontSize: 10.5, color: T.gold, marginTop: 3 }}>
                        {[L.scans && `🎁 +${L.scans} skanów`, L.proDays && `👑 +${L.proDays} dni Pro`, L.title && `🏷️ „${L.title}"`].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <button className="pa-press pa-display pa-glow" onClick={() => claimLevel(L)}
                      style={{ flexShrink: 0, padding: "10px 14px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 700, background: `linear-gradient(135deg, ${T.gold}, #B2945A)`, color: "#241C08" }}>
                      Odbierz
                    </button>
                  </div>
                ))}
                {shown.map((a) => <Card key={a.id} a={a} claimable={a.unlocked && !a.claimed} />)}
              </div>
            ) : (
              <div className="pa-fade pa-body" style={{ textAlign: "center", color: T.faint, fontSize: 12.5, padding: "34px 0", lineHeight: 1.7 }}>
                <div className="pa-float" style={{ fontSize: 36, marginBottom: 10 }}>🗂️</div>
                {achFilter === "claim" ? "Brak nagród do odebrania — zdobądź kolejne osiągnięcia!" : achFilter === "done" ? "Jeszcze nic tu nie ma. Pierwsza odznaka czeka!" : "Wszystko zdobyte. Szacunek! 👑"}
              </div>
            )
          ) : (
            <>
              {/* Korona Mistrza — zawsze na wierzchu */}
              {master && (
                <div style={{ marginBottom: 16 }}>
                  <Card a={master} claimable={master.unlocked && !master.claimed} />
                  {!master.unlocked && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ height: 5, background: "var(--sf2)", borderRadius: 3, overflow: "hidden" }}>
                        <div className="pa-bar-glint" style={{ height: "100%", width: `${Math.max((master.cur / master.target) * 100, 2)}%`, borderRadius: 3, background: `linear-gradient(90deg, ${T.gold}, #A189DB)`, transition: `width 700ms ${T.easeOut}` }} />
                      </div>
                      <div className="pa-body" style={{ fontSize: 10, color: T.faint, textAlign: "center", marginTop: 6 }}>
                        {master.cur} / {master.target} osiągnięć odebranych · zostało {master.target - master.cur}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Do odebrania */}
              {claimable.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div className="pa-display" style={{ fontSize: 14, fontWeight: 700, color: T.gold, margin: "0 2px 9px" }}>✨ Do odebrania</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {claimable.map((a) => <Card key={a.id} a={a} claimable />)}
                  </div>
                </div>
              )}

              {/* Następny cel */}
              {nextGoal && (
                <div style={{ marginBottom: 18 }}>
                  <div className="pa-display" style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: "0 2px 9px" }}>🎯 Najbliżej zdobycia</div>
                  <Card a={nextGoal} />
                </div>
              )}

              {/* kategorie */}
              {ACH_CATS.map((c) => {
                const items = achList.filter((a) => a.cat === c.key);
                if (!items.length) return null;
                const got = items.filter((a) => a.claimed).length;
                const takeN = items.filter((a) => a.unlocked && !a.claimed).length;
                const open = achOpen ? !!achOpen[c.key] : takeN > 0; // auto: otwarte tylko z nagrodami
                const nearest = items.filter((a) => !a.unlocked && !a.secret).sort((a, b) => (b.cur / b.target) - (a.cur / a.target))[0];
                const sorted = [...items].sort((a, b) => {
                  const rank = (x) => (x.unlocked && !x.claimed ? 0 : !x.unlocked ? 1 : 2);
                  return rank(a) - rank(b) || (b.cur / b.target) - (a.cur / a.target);
                });
                return (
                  <div key={c.key} style={{ marginBottom: 12 }}>
                    <div className="pa-press" role="button"
                      onClick={() => setAchOpen((o) => { const base = o || Object.fromEntries(ACH_CATS.map((x) => [x.key, achList.some((a) => a.cat === x.key && a.unlocked && !a.claimed)])); return { ...base, [c.key]: !base[c.key] }; })}
                      style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 13px", borderRadius: open ? "14px 14px 0 0" : 14, cursor: "pointer",
                        background: "var(--sf1)", border: "1px solid rgba(var(--ovc),.08)", borderBottom: open ? "none" : "1px solid rgba(var(--ovc),.08)" }}>
                      <span style={{ fontSize: 15 }}>{c.emoji}</span>
                      <span className="pa-display" style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: T.text }}>{c.label}</span>
                      {takeN > 0 && <span className="pa-mono" style={{ fontSize: 9, fontWeight: 700, color: "#241C08", background: `linear-gradient(135deg, ${T.gold}, #B2945A)`, borderRadius: 999, padding: "3px 8px" }}>{takeN} 🎁</span>}
                      <span className="pa-mono" style={{ fontSize: 10, color: got === items.length ? T.mint : T.faint }}>{got}/{items.length}</span>
                      <span style={{ color: T.faint, fontSize: 11, transform: open ? "rotate(90deg)" : "none", transition: `transform 260ms ${T.easeOut}`, display: "inline-block" }}>›</span>
                    </div>
                    {open ? (
                      <div className="pa-fade" style={{ display: "flex", flexDirection: "column", gap: 9, padding: "10px 0 0" }}>
                        {sorted.map((a) => <Card key={a.id} a={a} claimable={a.unlocked && !a.claimed} />)}
                      </div>
                    ) : nearest ? (
                      <div className="pa-body" style={{ fontSize: 9.5, color: T.faint, padding: "6px 13px 0", lineHeight: 1.4 }}>
                        najbliżej: {nearest.title} · {Math.floor(nearest.cur)}/{nearest.target}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </>
          )}

          <div className="pa-body" style={{ fontSize: 10.5, color: T.faint, textAlign: "center", marginTop: 6, lineHeight: 1.55 }}>
            🎁 = darmowe skany ponad miesięczny limit. Nie przepadają z końcem miesiąca.
          </div>
        </div>
      </div>
    );
  };

  /* ---------- WYZWANIA ---------- */
  const chAll = useMemo(() => challenges.map((c) => ({ ...c, tpl: CHALLENGE_TPLS.find((t) => t.id === c.tplId), ev: c.status === "active" ? challengeEval(c, realReceipts) : null })).filter((c) => c.tpl), [challenges, realReceipts]);
  const chActive = chAll.filter((c) => c.status === "active");
  const chWon = chAll.filter((c) => c.status === "won");
  const maxActive = effTier === "free" ? 1 : 3;
  const [celebrate, setCelebrate] = useState(null);
  // commit zakończonych + celebracja wygranych
  useEffect(() => {
    if (!loaded) return;
    const done = chActive.filter((c) => c.ev && c.ev.status !== "active");
    if (!done.length) return;
    setChallenges((arr) => arr.map((c) => {
      const d = done.find((x) => x.tplId === c.tplId && x.startKey === c.startKey);
      return d ? { ...c, status: d.ev.status } : c;
    }));
    const win = done.find((c) => c.ev.status === "won");
    if (win) { setCelebrate(win.tpl); addSeeds(SEED_CHALLENGE); navigator.vibrate?.([40, 80, 40, 80, 120]); }
    else showToast("Wyzwanie nie wyszło — spróbuj ponownie 💪");
  }, [chAll, loaded]);
  const startChallenge = (tplId) => {
    if (chActive.length >= maxActive) {
      if (effTier === "free") { setView({ name: "plans", reason: "feature" }); return; }
      showToast(`Maksymalnie ${maxActive} aktywne wyzwania`); return;
    }
    if (chActive.some((c) => c.tplId === tplId)) { showToast("To wyzwanie już trwa"); return; }
    setChallenges((arr) => [...arr, { tplId, startKey: todayKey(), status: "active", celebrated: false }]);
    showToast("Wyzwanie przyjęte! 🔥"); navigator.vibrate?.(20);
  };
  const ChallengeCard = ({ c }) => {
    const done = c.status !== "active";
    const ev = c.ev || { pct: 1, label: c.status === "won" ? "Wygrane!" : "Nieudane", daysLeft: 0, status: c.status };
    const col = ev.status === "won" ? T.mint : ev.status === "lost" ? T.danger : c.tpl.type === "limit_category" ? T.gold : T.mint;
    return (
      <div style={{ ...card, padding: "14px 15px", border: `1px solid ${done ? col + "40" : T.glassBorderSoft}`, opacity: c.status === "lost" ? 0.65 : 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 11 }}>
          <div style={{ width: 42, height: 42, borderRadius: 13, background: `${col}14`, border: `1px solid ${col}38`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{c.tpl.emoji}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pa-display" style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{c.tpl.title}</div>
            <div className="pa-body" style={{ fontSize: 10.5, color: ev.status === "lost" ? T.danger : T.faint, marginTop: 1 }}>
              {ev.label}{ev.status === "active" && ev.daysLeft > 0 ? ` · zostało ${ev.daysLeft} dni` : ""}
            </div>
          </div>
          {ev.status === "won" && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <span className="pa-mono" style={{ fontSize: 8.5, fontWeight: 700, color: T.mint, background: `${T.mint}12`, border: `1px solid ${T.mint}38`, borderRadius: 999, padding: "2px 7px" }}>⚡+25 XP</span>
              <span style={{ fontSize: 19 }}>🏆</span>
            </span>
          )}
          {ev.status === "active" && (
            <button className="pa-press" onClick={() => setConfirmBox({ title: "Porzucić wyzwanie?", body: `„${c.tpl.title}" zniknie z aktywnych. Możesz podjąć je ponownie później.`, confirmLabel: "Porzuć", onConfirm: () => { setChallenges((arr) => arr.filter((x) => !(x.tplId === c.tplId && x.startKey === c.startKey))); setConfirmBox(null); } })}
              style={{ width: 26, height: 26, borderRadius: 8, border: "1px solid rgba(var(--ovc),.08)", background: "var(--sf1)", color: T.faint, fontSize: 11, cursor: "pointer", flexShrink: 0 }}>✕</button>
          )}
        </div>
        <div style={{ height: 6, background: "var(--sf2)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(Math.max(ev.pct * 100, 3), 100)}%`, borderRadius: 3, background: `linear-gradient(90deg, ${col}, ${col}99)`, transition: `width 500ms ${T.easeOut}`, boxShadow: `0 0 8px ${col}55` }} />
        </div>
      </div>
    );
  };
  const ChallengesView = () => {
    const activeIds = new Set(chActive.map((c) => c.tplId));
    const available = CHALLENGE_TPLS.filter((t) => !activeIds.has(t.id));
    const badges = chWon.map((c) => c.tpl);
    return (
      <div className="pa-slidein" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Header title="Wyzwania" onBack={() => setView({ name: "tabs" })} />
        <div className="pa-scroll" style={{ flex: 1, padding: "6px 18px 48px" }}>
          <div className="pa-body" style={{ fontSize: 12, color: T.sub, lineHeight: 1.6, margin: "2px 2px 16px" }}>
            Podejmij wyzwanie, a postęp będę śledzić automatycznie z Twoich paragonów. Bez oszukiwania — liczą się twarde dane. 😉
          </div>
          <button className="pa-press" onClick={() => setView({ name: "achievements" })}
            style={{ width: "100%", textAlign: "left", marginBottom: 18, cursor: "pointer", borderRadius: 14, padding: "11px 14px",
              border: `1px solid ${achToClaim.length ? T.gold + "50" : "rgba(var(--ovc),.09)"}`, background: achToClaim.length ? `${T.gold}10` : T.glass,
              display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ fontSize: 17 }}>🎖️</span>
            <span className="pa-body" style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: T.text }}>
              Osiągnięcia{achToClaim.length ? <span style={{ color: T.gold }}> · {achToClaim.length} do odebrania 🎁</span> : ""}
            </span>
            <span style={{ color: T.faint }}>›</span>
          </button>
          {chActive.length > 0 && (
            <>
              <div className="pa-display" style={{ fontSize: 14.5, fontWeight: 600, color: T.text, margin: "0 2px 10px" }}>Aktywne <span className="pa-mono" style={{ fontSize: 10.5, color: T.faint }}>{chActive.length}/{maxActive}</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                {chActive.map((c) => <ChallengeCard key={c.tplId + c.startKey} c={c} />)}
              </div>
            </>
          )}
          {badges.length > 0 && (
            <>
              <div className="pa-display" style={{ fontSize: 14.5, fontWeight: 600, color: T.text, margin: "0 2px 10px" }}>Twoje odznaki 🏆</div>
              <div className="pa-rise"  style={{ animationDelay: "360ms", ...card, padding: "13px 14px", marginBottom: 20, display: "flex", flexWrap: "wrap", gap: 9 }}>
                {badges.map((b, i) => (
                  <div key={i} title={b.title} style={{ display: "flex", alignItems: "center", gap: 7, background: `${T.gold}10`, border: `1px solid ${T.gold}35`, borderRadius: 999, padding: "7px 13px" }}>
                    <span style={{ fontSize: 15 }}>{b.emoji}</span>
                    <span className="pa-body" style={{ fontSize: 11, fontWeight: 600, color: T.gold }}>{b.badge}</span>
                    <span className="pa-mono" style={{ fontSize: 8, fontWeight: 700, color: T.mint, background: `${T.mint}12`, border: `1px solid ${T.mint}35`, borderRadius: 999, padding: "1px 6px" }}>⚡+25</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="pa-display" style={{ fontSize: 14.5, fontWeight: 600, color: T.text, margin: "0 2px 10px" }}>Do podjęcia</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {available.map((t) => (
              <div key={t.id} style={{ ...card, padding: "13px 15px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--sf1)", border: "1px solid rgba(var(--ovc),.09)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>{t.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="pa-display" style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>{t.title}</div>
                  <div className="pa-body" style={{ fontSize: 10.5, color: T.faint, marginTop: 2, lineHeight: 1.45 }}>{t.desc}</div>
                </div>
                <button className="pa-press pa-body" onClick={() => startChallenge(t.id)}
                  style={{ flexShrink: 0, padding: "9px 14px", borderRadius: 11, border: `1px solid ${T.mint}45`, background: `${T.mint}12`, color: T.mint, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                  Podejmij
                </button>
              </div>
            ))}
          </div>
          {effTier === "free" && (
            <div className="pa-body" style={{ fontSize: 10.5, color: T.faint, textAlign: "center", marginTop: 16, lineHeight: 1.5 }}>
              Plan Free: 1 aktywne wyzwanie. <span style={{ color: T.mint, fontWeight: 600, cursor: "pointer" }} onClick={() => setView({ name: "plans", reason: "feature" })}>Odblokuj 3 równoległe →</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ---------- PODSUMOWANIE MIESIĄCA ("Twój miesiąc w liczbach") ---------- */
  const SummaryView = () => {
    const mk = view.mk || nowMonth();
    const st = computeMonthStats(receipts, mk);
    const savedThisMonth = totalSavedAll;
    const topCat = st.cats[0] ? { ...catBySlug(st.cats[0].slug), value: st.cats[0].value } : null;
    const topCatPct = topCat && st.total > 0 ? Math.round((topCat.value / st.total) * 100) : 0;
    const deltaDown = st.delta != null && st.delta < 0;

    const shareText = () => [
        `📊 Mój ${monthLabel(mk)} w Paragon AI`,
        `Wydałem: ${zl(st.total)}`,
        st.delta != null ? `${deltaDown ? "📉" : "📈"} ${deltaDown ? "" : "+"}${st.delta}% vs poprzedni miesiąc` : null,
        topCat ? `Najwięcej na: ${topCat.name} (${zl(topCat.value)})` : null,
        st.mostVisited ? `Ulubiony sklep: ${st.mostVisited[0]}` : null,
        savedThisMonth > 0 ? `💰 Odłożone na cele: ${zl(savedThisMonth)}` : null,
      ].filter(Boolean).join("\n");
    const doShare = async () => {
      const text = shareText();
      try {
        if (navigator.share) { await navigator.share({ title: "Mój miesiąc w Paragon AI", text }); }
        else { await navigator.clipboard?.writeText(text); showToast("Skopiowano do schowka ✓"); }
      } catch (e) { /* anulowano */ }
    };

    const Stat = ({ emoji, tint, label, value, sub }) => (
      <div style={{ ...card, padding: "13px 14px", flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: `${tint}18`, border: `1px solid ${tint}38`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13 }}>{emoji}</div>
          <span className="pa-body" style={{ fontSize: 9.5, color: T.faint, letterSpacing: ".04em", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        </div>
        <div className="pa-mono" style={{ fontSize: 15, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
        {sub && <div className="pa-body" style={{ fontSize: 10, color: T.faint, marginTop: 2 }}>{sub}</div>}
      </div>
    );

    return (
      <div className="pa-slidein" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Header title="Podsumowanie miesiąca" onBack={() => setView({ name: "tabs" })} />
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 48px" }}>
          {st.count === 0 ? (
            <div className="pa-fade" style={{ textAlign: "center", padding: "44px 18px" }}>
              <div style={{ width: 66, height: 66, margin: "0 auto", borderRadius: 21, background: `${T.mint}14`, border: `1px solid ${T.mint}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>📊</div>
              <div className="pa-display" style={{ fontSize: 16.5, fontWeight: 600, margin: "14px 0 7px", color: T.text }}>Brak danych za {monthLabel(mk)}</div>
              <div className="pa-body" style={{ fontSize: 13, color: T.sub, lineHeight: 1.55, maxWidth: 280, margin: "0 auto" }}>
                Dodaj paragony z tego miesiąca, a przygotuję pełne podsumowanie Twoich wydatków.
              </div>
            </div>
          ) : (
            <>
              <div className="pa-rise pa-sheen" style={{ position: "relative", overflow: "hidden", borderRadius: 24, padding: "22px 20px",
                background: "var(--g-pro)", border: "1px solid rgba(var(--ovc),.11)",
                boxShadow: "0 24px 60px var(--sh2), inset 0 1px 0 rgba(var(--ovc),.13)", marginBottom: 14 }}>
                <div className="pa-aurora" style={{ top: -90, right: -60, width: 230, height: 230, background: `radial-gradient(circle, ${T.mint}33, transparent 68%)` }} />
                <div style={{ position: "relative" }}>
                  <div className="pa-mono" style={{ fontSize: 10, letterSpacing: ".16em", color: "rgba(var(--ovc),.55)" }}>PARAGON·AI</div>
                  <div className="pa-display" style={{ fontSize: 13, color: "rgba(var(--ovc),.75)", marginTop: 10, textTransform: "capitalize" }}>Twój {monthLabel(mk)} w liczbach</div>
                  <div className="pa-mono" style={{ fontSize: 38, fontWeight: 600, color: "#fff", marginTop: 4, lineHeight: 1.05 }}>{zl(st.total)}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    {st.delta != null && (
                      <span className="pa-body" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600,
                        color: deltaDown ? "#7EE8C4" : "#F0B8B2", background: deltaDown ? "rgba(45,212,160,.16)" : "rgba(230,118,109,.16)",
                        border: `1px solid ${deltaDown ? "rgba(45,212,160,.35)" : "rgba(230,118,109,.35)"}`, borderRadius: 999, padding: "3px 10px" }}>
                        {deltaDown ? "▼" : "▲"} {Math.abs(st.delta)}% vs poprz. mies.
                      </span>
                    )}
                    <span className="pa-body" style={{ fontSize: 11.5, color: "rgba(var(--ovc),.6)" }}>{st.count} {st.count === 1 ? "paragon" : "paragonów"} · {st.itemCount} pozycji</span>
                  </div>
                </div>
              </div>

              {topCat && (
                <div className="pa-rise"  style={{ animationDelay: "360ms", ...card, padding: "15px 16px", marginBottom: 11 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <CatTile slug={st.cats[0].slug} size={44} fs={21} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="pa-body" style={{ fontSize: 10.5, color: T.faint, textTransform: "uppercase", letterSpacing: ".06em" }}>Najwięcej wydałeś na</div>
                      <div className="pa-display" style={{ fontSize: 16, fontWeight: 600, color: T.text, marginTop: 1 }}>{topCat.name}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="pa-mono" style={{ fontSize: 15, fontWeight: 600, color: T.mint }}>{zl(topCat.value)}</div>
                      <div className="pa-body" style={{ fontSize: 10.5, color: T.faint, marginTop: 1 }}>{topCatPct}% budżetu</div>
                    </div>
                  </div>
                  <div style={{ height: 5, background: "var(--sf2)", borderRadius: 3, marginTop: 12, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${topCatPct}%`, borderRadius: 3, background: `linear-gradient(90deg, ${T.mint}, ${T.mintDeep})` }} />
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 11, marginBottom: 11 }}>
                <Stat emoji="📅" tint={T.gold} label="Śr. dziennie" value={zl(st.dailyAvg)} />
                <Stat emoji="🧾" tint="#5BB8E8" label="Największy" value={st.biggest ? zl(st.biggest.total) : "—"} sub={st.biggest?.store} />
              </div>
              {st.mostVisited && (
                <div style={{ display: "flex", gap: 11, marginBottom: 11 }}>
                  <Stat emoji="🏪" tint="#EC86B2" label="Ulubiony sklep" value={st.mostVisited[0]} sub={`${st.mostVisited[1]} ${st.mostVisited[1] === 1 ? "wizyta" : "wizyt"}`} />
                  {savedThisMonth > 0
                    ? <Stat emoji="🐷" tint={T.mint} label="Odłożone na cele" value={zl(savedThisMonth)} />
                    : <Stat emoji="📂" tint="#A189DB" label="Kategorii" value={String(st.cats.length)} />}
                </div>
              )}

              {st.cats.length > 1 && (
                <div className="pa-rise"  style={{ animationDelay: "360ms", ...card, padding: "14px 16px", marginBottom: 14 }}>
                  <div className="pa-display" style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 12 }}>Na co poszły pieniądze</div>
                  {st.cats.slice(0, 5).map((c) => {
                    const meta = catBySlug(c.slug);
                    const p = st.total > 0 ? Math.round((c.value / st.total) * 100) : 0;
                    return (
                      <div key={c.slug} style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                          <span className="pa-body" style={{ fontSize: 12, color: T.sub }}>{meta.icon} {meta.name}</span>
                          <span className="pa-mono" style={{ fontSize: 11.5, color: T.text }}>{zl(c.value)} <span style={{ color: T.faint }}>· {p}%</span></span>
                        </div>
                        <div style={{ height: 4, background: "var(--sf2)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.max(p, 2)}%`, borderRadius: 2, background: meta.color || T.mint }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <button className="pa-press pa-display" onClick={doShare}
                style={{ ...primaryBtn, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Icon name="share" size={16} sw={2} color="#06251A" /> Udostępnij podsumowanie
              </button>
              <div className="pa-body" style={{ textAlign: "center", fontSize: 10.5, color: T.faint, marginTop: 12, lineHeight: 1.5 }}>
                Pochwal się postępami — udostępnij znajomym albo zapisz na pamiątkę.
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  /* ---------- CELE OSZCZĘDNOŚCIOWE (Starter+) ---------- */
  const GoalsView = () => {
    const totalSaved = goals.reduce((s, g) => s + (Number(g.saved) || 0), 0);
    const totalTarget = goals.reduce((s, g) => s + (Number(g.target) || 0), 0);
    const openNew = () => setInputSheet({
      title: "Nowy cel oszczędnościowy", icon: "🎯",
      note: "Data docelowa jest opcjonalna — jeśli ją podasz, policzę ile odkładać miesięcznie.",
      fields: [
        { key: "name", label: "Na co odkładasz?", placeholder: "np. Wakacje w Grecji" },
        { key: "target", label: "Kwota celu (zł)", placeholder: "3000", type: "text" },
        { key: "deadline", label: "Data docelowa (opcjonalnie)", type: "date", min: todayKey() },
      ],
      submitLabel: "Utwórz cel",
      onSubmit: (v) => {
        const t = Number(String(v.target).replace(",", ".").replace(/\s/g, ""));
        if (!v.name.trim()) { showToast("Podaj nazwę celu"); return; }
        if (!(t > 0)) { showToast("Podaj kwotę większą od zera"); return; }
        if (v.deadline && v.deadline < todayKey()) { showToast("Data docelowa nie może być w przeszłości"); return; }
        const used = goals.map((g) => g.icon);
        const icon = GOAL_ICONS.find((i) => !used.includes(i)) || "🎯";
        addGoal(v.name, t, icon, v.deadline || null); setInputSheet(null); showToast("Cel utworzony 🎯");
      },
    });
    const openIncome = () => setInputSheet({
      title: "Miesięczny dochód", icon: "💰",
      note: "Na tej podstawie liczymy wolne środki. Wpisz 0, aby wyłączyć.",
      fields: [{ key: "amount", label: "Dochód miesięczny (zł)", value: income ? String(income).replace(".", ",") : "", placeholder: "5000", type: "text" }],
      submitLabel: "Zapisz",
      onSubmit: (v) => {
        const n = Number(String(v.amount).replace(",", ".").replace(/\s/g, ""));
        setIncome(n > 0 ? Math.round(n * 100) / 100 : null);
        setInputSheet(null);
        showToast(n > 0 ? "Dochód zapisany ✓" : "Wyłączono wolne środki");
      },
    });
    const openDeposit = (g) => setInputSheet({
      title: `Wpłać na: ${g.name}`, icon: g.icon,
      note: freeFunds != null ? `Wolne środki w tym miesiącu: ${zl(Math.max(freeFunds, 0))}` : null,
      fields: [{ key: "amount", label: "Kwota wpłaty (zł)", placeholder: "100", type: "text" }],
      submitLabel: "Dodaj do skarbonki",
      onSubmit: (v) => {
        const a = Number(String(v.amount).replace(",", ".").replace(/\s/g, ""));
        if (!(a > 0)) { showToast("Podaj kwotę większą od zera"); return; }
        if (freeFunds != null && a > freeFunds) { showToast(`Brak wolnych środków — masz ${zl(Math.max(freeFunds, 0))}`); return; }
        const ok = depositGoal(g.id, a);
        if (!ok) { showToast("Brak wystarczających wolnych środków"); return; }
        setInputSheet(null);
        if (g.saved + a >= g.target) { navigator.vibrate?.([30, 60, 30]); showToast(`Cel „${g.name}" osiągnięty! 🎉`); }
        else { navigator.vibrate?.(20); showToast(`Wpłacono ${zl(a)} ✓`); }
      },
    });
    return (
      <div className="pa-slidein" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Header title="Cele oszczędnościowe" onBack={() => setView({ name: "tabs" })} />
        <div className="pa-scroll" style={{ flex: 1, padding: "6px 18px 48px" }}>
          {goals.length === 0 ? (
            <div className="pa-fade" style={{ textAlign: "center", padding: "40px 18px" }}>
              <div style={{ width: 68, height: 68, margin: "0 auto", borderRadius: 22, background: `${T.gold}16`, border: `1px solid ${T.gold}38`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="piggy" size={30} color={T.gold} sw={1.6} />
              </div>
              <div className="pa-display" style={{ fontSize: 17, fontWeight: 600, margin: "14px 0 7px", color: T.text }}>Zacznij odkładać na cel</div>
              <div className="pa-body" style={{ fontSize: 13, color: T.sub, lineHeight: 1.55, maxWidth: 290, margin: "0 auto 22px" }}>
                Wakacje, nowy telefon, poduszka finansowa — ustaw cel i śledź, jak rośnie Twoja skarbonka.
              </div>
              <button className="pa-press pa-display" onClick={openNew} style={{ ...primaryBtn }}>+ Utwórz pierwszy cel</button>
            </div>
          ) : (
            <>
              {/* podsumowanie */}
              <div className="pa-rise pa-sheen" style={{ position: "relative", overflow: "hidden", borderRadius: 20, padding: "16px 18px", marginBottom: 16,
                background: "var(--g-family)", border: `1px solid ${T.gold}33`, boxShadow: "0 18px 44px var(--sh2)" }}>
                <div className="pa-aurora" style={{ top: -80, right: -50, width: 200, height: 200, background: `radial-gradient(circle, ${T.gold}30, transparent 68%)` }} />
                <div style={{ position: "relative" }}>
                  <div className="pa-body" style={{ fontSize: 11, color: "rgba(var(--ovc),.6)", letterSpacing: ".06em", fontWeight: 600 }}>ODŁOŻONE ŁĄCZNIE</div>
                  <div className="pa-mono" style={{ fontSize: 26, fontWeight: 600, color: "#fff", marginTop: 4 }}>{zl(totalSaved)}</div>
                  <div className="pa-body" style={{ fontSize: 11.5, color: "rgba(var(--ovc),.5)", marginTop: 2 }}>z {zl(totalTarget)} we wszystkich celach</div>
                </div>
              </div>

              {income != null ? (
                <button className="pa-press" onClick={openIncome}
                  style={{ width: "100%", textAlign: "left", ...card, padding: "13px 15px", marginBottom: 16, cursor: "pointer",
                    border: freeFunds < 0 ? "1px solid rgba(230,118,109,.4)" : `1px solid ${T.mint}33` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div className="pa-body" style={{ fontSize: 11, color: T.faint, fontWeight: 600, letterSpacing: ".05em" }}>WOLNE ŚRODKI W TYM MIESIĄCU</div>
                      <div className="pa-mono" style={{ fontSize: 20, fontWeight: 600, color: freeFunds < 0 ? T.danger : T.mint, marginTop: 3 }}>{zl(Math.max(freeFunds, 0))}</div>
                    </div>
                    <Icon name="pencil" size={15} color={T.faint} />
                  </div>
                  <div className="pa-body" style={{ fontSize: 10.5, color: T.faint, marginTop: 8, lineHeight: 1.5 }}>
                    Dochód {zl(income)} − wydatki {zl(curMonthSpent)} − odłożone {zl(totalSaved)}
                    {freeFunds < 0 && <span style={{ color: T.danger }}> · przekroczono dostępne środki</span>}
                  </div>
                </button>
              ) : (
                <button className="pa-press" onClick={openIncome}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: `${T.mint}0C`, border: `1px dashed ${T.mint}45`, borderRadius: 14, padding: "12px 14px", marginBottom: 16, cursor: "pointer", textAlign: "left" }}>
                  <Icon name="spark" size={16} color={T.mint} />
                  <span className="pa-body" style={{ flex: 1, fontSize: 12, color: T.sub }}>Podaj miesięczny dochód, a wpłaty na cele będą pomniejszać <b style={{ color: T.text }}>wolne środki</b></span>
                  <span style={{ color: T.mint }}>+</span>
                </button>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                {goals.map((g, gi) => {
                  const pct = g.target > 0 ? Math.min(g.saved / g.target, 1) : 0;
                  const done = g.saved >= g.target;
                  const left = Math.max(g.target - g.saved, 0);
                  const pace = goalPace(g);
                  return (
                    <div key={g.id} className="pa-fade" style={{ animationDelay: `${Math.min(gi * 50, 300)}ms`, ...card,
                      border: done ? `1px solid ${T.mint}55` : `1px solid ${T.glassBorderSoft}`, padding: "14px", position: "relative", overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                        <div style={{ width: 42, height: 42, borderRadius: 13, background: done ? `${T.mint}1C` : `${T.gold}16`, border: `1px solid ${done ? T.mint + "45" : T.gold + "38"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{g.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="pa-display" style={{ fontSize: 14.5, fontWeight: 600, color: T.text }}>{g.name}</div>
                          <div className="pa-body" style={{ fontSize: 11, color: done ? T.mint : T.faint, marginTop: 1 }}>
                            {done ? "✓ Cel osiągnięty!" : `zostało ${zl(left)}`}
                            {!done && g.deadline && <span> · do {deadlineLabel(g.deadline)}</span>}
                          </div>
                        </div>
                        <button className="pa-press" onClick={() => setConfirmBox({ title: "Usunąć cel?", body: `„${g.name}" — odłożone ${zl(g.saved)} zostanie usunięte z aplikacji.`, confirmLabel: "Usuń cel", onConfirm: () => { setGoals((arr) => arr.filter((x) => x.id !== g.id)); setConfirmBox(null); showToast("Cel usunięty"); } })}
                          style={{ width: 28, height: 28, borderRadius: 9, border: "1px solid rgba(var(--ovc),.08)", background: "var(--sf1)", color: T.faint, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>✕</button>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                        <span className="pa-mono" style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{zl(g.saved)}</span>
                        <span className="pa-mono" style={{ fontSize: 11, color: T.faint }}>{Math.round(pct * 100)}% z {zl(g.target)}</span>
                      </div>
                      <div style={{ height: 8, background: "var(--sf2)", borderRadius: 4, overflow: "hidden", boxShadow: "inset 0 1px 2px var(--sh1)" }}>
                        <div style={{ height: "100%", width: `${Math.max(pct * 100, 3)}%`, borderRadius: 4,
                          background: done ? `linear-gradient(90deg, ${T.mint}, ${T.mintDeep})` : `linear-gradient(90deg, ${T.gold}, #B2945A)`,
                          transition: `width 600ms ${T.easeOut}`, boxShadow: `0 0 10px ${done ? T.mint : T.gold}66` }} />
                      </div>

                      {!done && pace && (() => {
                        const cfg = pace.overdue
                          ? { c: T.danger, bg: "rgba(230,118,109,.1)", bd: "rgba(230,118,109,.3)", txt: `Termin minął ${Math.abs(pace.daysLeft)} dni temu`, sub: `Brakuje jeszcze ${zl(pace.remaining)}` }
                          : pace.status === "behind"
                          ? { c: T.warn, bg: `${T.warn}12`, bd: `${T.warn}33`, txt: `Zostało ${pace.daysLeft} dni`, sub: `Dołóż ${zl(pace.remaining)}, by zdążyć` }
                          : { c: T.mint, bg: `${T.mint}0E`, bd: `${T.mint}2E`, txt: `Odkładaj ${zl(pace.perMonth)}/mies.`, sub: pace.daysLeft > 60 ? `lub ${zl(pace.perWeek)}/tydzień · zostało ${Math.round(pace.monthsLeft)} mies.` : `zostało ${pace.daysLeft} dni` };
                        return (
                          <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 11, padding: "9px 11px", borderRadius: 11, background: cfg.bg, border: `1px solid ${cfg.bd}` }}>
                            <span style={{ fontSize: 15 }}>{pace.status === "ontrack" ? "✨" : "⚠️"}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="pa-body" style={{ fontSize: 12, fontWeight: 600, color: cfg.c }}>{cfg.txt}</div>
                              <div className="pa-body" style={{ fontSize: 10.5, color: T.faint, marginTop: 1 }}>{cfg.sub}</div>
                            </div>
                          </div>
                        );
                      })()}

                      {!done && !g.deadline && (
                        <button className="pa-press pa-body" onClick={() => setInputSheet({
                            title: `Termin celu: ${g.name}`, icon: g.icon,
                            note: "Ustaw datę, a policzę ile odkładać miesięcznie, żeby zdążyć.",
                            fields: [{ key: "deadline", label: "Data docelowa", type: "date", min: todayKey() }],
                            submitLabel: "Ustaw termin",
                            onSubmit: (v) => { if (!v.deadline) { showToast("Wybierz datę"); return; } if (v.deadline < todayKey()) { showToast("Data nie może być w przeszłości"); return; } setGoals((arr) => arr.map((x) => x.id === g.id ? { ...x, deadline: v.deadline } : x)); setInputSheet(null); showToast("Termin ustawiony ✓"); },
                          })}
                          style={{ width: "100%", marginTop: 11, padding: "8px 0", borderRadius: 11, border: "1px dashed rgba(var(--ovc),.15)", background: "none", color: T.faint, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
                          + Dodaj termin (policzę tempo)
                        </button>
                      )}

                      {!done && (
                        <button className="pa-press pa-body" onClick={() => openDeposit(g)}
                          style={{ width: "100%", marginTop: 11, padding: "10px 0", borderRadius: 12, border: `1px solid ${T.gold}40`, background: `${T.gold}12`, color: T.gold, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                          + Wpłać do skarbonki
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <button className="pa-press pa-body" onClick={openNew}
                style={{ width: "100%", marginTop: 12, padding: "12px 0", borderRadius: 14, border: "1.5px dashed rgba(var(--ovc),.18)", background: "none", color: T.sub, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                + Dodaj kolejny cel
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  /* ---------- LISTA ZAKUPÓW / POWTARZALNE (Pro+) ---------- */
  const RestockView = () => {
    const due = recurring.filter((r) => r.due);
    const soon = recurring.filter((r) => !r.due && r.ratio >= 0.45);
    const cartCount = Object.values(restockDone).filter(Boolean).length;
    const Row = (it) => {
      const checked = !!restockDone[it.key];
      const pct = Math.min(it.ratio, 1);
      const col = it.due ? T.gold : T.mint;
      return (
        <div key={it.key} className="pa-fade" style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 14px", opacity: checked ? 0.5 : 1, transition: "opacity 200ms ease" }}>
          <button className="pa-press" onClick={() => { setRestockDone((d) => ({ ...d, [it.key]: !d[it.key] })); if (!checked) navigator.vibrate?.(20); }}
            style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              border: checked ? "none" : `1.5px solid rgba(var(--ovc),.2)`, background: checked ? `linear-gradient(135deg, ${T.mint}, ${T.mintDeep})` : "transparent" }}>
            {checked && <Icon name="check" size={15} sw={2.5} color="#06251A" />}
          </button>
          <CatTile slug={it.category} size={32} fs={15} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pa-body" style={{ fontSize: 13, fontWeight: 600, color: T.text, textDecoration: checked ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
            <div className="pa-body" style={{ fontSize: 10.5, color: T.faint, marginTop: 2 }}>
              kupujesz {cycleLabel(it.avgGap)} · ostatnio {it.sinceLast === 0 ? "dziś" : it.sinceLast === 1 ? "wczoraj" : `${it.sinceLast} dni temu`}
            </div>
            <div style={{ height: 3, background: "var(--sf2)", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.max(pct * 100, 4)}%`, background: col, borderRadius: 2, transition: `width 400ms ${T.easeOut}` }} />
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div className="pa-mono" style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{zl(it.lastPrice)}</div>
            <div className="pa-body" style={{ fontSize: 9.5, color: T.faint, marginTop: 1 }}>ost. cena</div>
          </div>
        </div>
      );
    };
    return (
      <div className="pa-slidein" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Header title="Lista zakupów" onBack={() => setView({ name: "tabs" })} />
        <div className="pa-scroll" style={{ flex: 1, padding: "6px 18px 48px" }}>
          {recurring.length === 0 ? (
            <div className="pa-fade" style={{ textAlign: "center", padding: "44px 18px" }}>
              <div style={{ width: 64, height: 64, margin: "0 auto", borderRadius: 20, background: `${T.mint}14`, border: `1px solid ${T.mint}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="repeat" size={26} color={T.mint} />
              </div>
              <div className="pa-display" style={{ fontSize: 16, fontWeight: 600, margin: "14px 0 7px", color: T.text }}>Jeszcze się uczę Twoich zakupów</div>
              <div className="pa-body" style={{ fontSize: 13, color: T.sub, lineHeight: 1.55, maxWidth: 290, margin: "0 auto" }}>
                Skanuj paragony przez kilka tygodni. Gdy zobaczę, że jakiś produkt kupujesz regularnie, podpowiem, kiedy prawdopodobnie się kończy.
              </div>
            </div>
          ) : (
            <>
              <div className="pa-fade pa-body" style={{ fontSize: 12.5, color: T.sub, lineHeight: 1.55, margin: "4px 2px 16px" }}>
                Na podstawie Twojej historii rozpoznałem rytm zakupów. <span style={{ color: T.text }}>Odhacz to, co masz w koszyku.</span>
              </div>

              {due.length > 0 && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "0 2px 9px" }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: T.gold }} />
                    <span className="pa-display" style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>Pora dokupić</span>
                    <span className="pa-mono" style={{ fontSize: 11, color: T.faint }}>({due.length})</span>
                  </div>
                  <div className="pa-rise"  style={{ animationDelay: "360ms", ...card, border: `1px solid ${T.gold}33`, overflow: "hidden", marginBottom: 18 }}>
                    {due.map((it, i) => (<div key={it.key}>{i > 0 && <Divider />}{Row(it)}</div>))}
                  </div>
                </>
              )}

              {soon.length > 0 && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "0 2px 9px" }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: T.mint }} />
                    <span className="pa-display" style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>Niedługo</span>
                    <span className="pa-mono" style={{ fontSize: 11, color: T.faint }}>({soon.length})</span>
                  </div>
                  <div className="pa-rise"  style={{ animationDelay: "360ms", ...card, overflow: "hidden", marginBottom: 18 }}>
                    {soon.map((it, i) => (<div key={it.key}>{i > 0 && <Divider />}{Row(it)}</div>))}
                  </div>
                </>
              )}

              {due.length === 0 && soon.length === 0 && (
                <div className="pa-fade" style={{ textAlign: "center", padding: "30px 18px" }}>
                  <div style={{ fontSize: 34 }}>✅</div>
                  <div className="pa-display" style={{ fontSize: 15, fontWeight: 600, margin: "10px 0 6px", color: T.text }}>Wszystko zaopatrzone</div>
                  <div className="pa-body" style={{ fontSize: 12.5, color: T.sub }}>Żaden z Twoich regularnych produktów nie kończy się w najbliższym czasie.</div>
                </div>
              )}

              {cartCount > 0 && (
                <button className="pa-press pa-body" onClick={() => { setRestockDone({}); showToast("Koszyk wyczyszczony"); }}
                  style={{ width: "100%", padding: "11px 0", borderRadius: 13, border: "1px solid rgba(var(--ovc),.1)", background: "none", color: T.sub, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                  Wyczyść koszyk ({cartCount})
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  /* ---------- PLANY / PAYWALL ---------- */
  const PlansView = () => {
    const reason = view.reason;
    const heading = reason === "limit" ? "Wykorzystałeś darmowe skany"
      : reason === "feature" ? "Ta funkcja wymaga planu Pro"
      : "Wybierz swój plan";
    const sub = reason === "limit" ? `${tierLimit ?? 5} skanów AI w tym miesiącu za Tobą. Wybierz plan albo dodawaj paragony ręcznie — to zawsze za darmo.`
      : reason === "feature" ? "Budżet miesięczny i eksport danych dostępne są w planach Pro i Family."
      : "Zacznij za darmo. Zmienisz plan w każdej chwili.";
    return (
      <div className="pa-slidein" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Header title="Plany" onBack={() => setView({ name: "tabs" })} />
        <div className="pa-scroll" style={{ flex: 1, padding: "6px 18px 48px" }}>
          <div className="pa-fade" style={{ textAlign: "center", margin: "8px 0 16px" }}>
            <div className="pa-display" style={{ fontSize: 20, fontWeight: 700, color: T.text }}>{heading}</div>
            <div className="pa-body" style={{ fontSize: 12.5, color: T.sub, marginTop: 6, lineHeight: 1.55 }}>{sub}</div>
          </div>

          {/* przełącznik rozliczenia */}
          {proTrialActive && (
            <div className="pa-fade" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "11px 13px", borderRadius: 14, background: `linear-gradient(135deg, ${T.gold}16, rgba(var(--ovc),.02))`, border: `1px solid ${T.gold}45` }}>
              <span style={{ fontSize: 16 }}>👑</span>
              <div className="pa-body" style={{ flex: 1, fontSize: 11.5, color: T.sub, lineHeight: 1.5 }}>
                <b style={{ color: T.gold }}>Testujesz Pro</b> do {new Date(plan.proUntil).toLocaleDateString("pl-PL", { day: "numeric", month: "long" })} — kup plan, aby nielimitowane skany i analizy zostały na stałe.
              </div>
            </div>
          )}
          {AUTH_ENABLED && !session && (
            <div className="pa-fade" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "11px 13px", borderRadius: 14, background: `${T.gold}10`, border: `1px solid ${T.gold}30` }}>
              <span style={{ fontSize: 16 }}>☁️</span>
              <div className="pa-body" style={{ flex: 1, fontSize: 11.5, color: T.sub, lineHeight: 1.5 }}>
                <b style={{ color: T.text }}>Zaloguj się przed zakupem</b> — subskrypcja przypisze się do Twojego konta i przetrwa zmianę telefonu.
              </div>
              <button className="pa-press pa-body" onClick={() => { try { localStorage.removeItem("paragon-guest"); } catch (e) {} setGuest(false); }}
                style={{ flexShrink: 0, padding: "8px 13px", borderRadius: 11, border: `1px solid ${T.mint}45`, background: `${T.mint}14`, color: T.mint, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                Zaloguj
              </button>
            </div>
          )}
          <div className="pa-fade" style={{ display: "flex", background: "var(--sf1)", border: "1px solid rgba(var(--ovc),.09)", borderRadius: 999, padding: 4, marginBottom: 16, position: "relative" }}>
            {[["monthly", "Miesięcznie"], ["yearly", "Rocznie"]].map(([id, lbl]) => (
              <button key={id} className="pa-press pa-body" onClick={() => { setBilling(id); navigator.vibrate?.(8); }}
                style={{ flex: 1, padding: "9px 0", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                  background: billing === id ? `linear-gradient(135deg, ${T.mint}, ${T.mintDeep})` : "none",
                  color: billing === id ? "#06251A" : T.sub, transition: "all 220ms ease", position: "relative" }}>
                {lbl}{id === "yearly" && <span className="pa-mono" style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: billing === id ? "#06251A" : T.gold, background: billing === id ? "var(--sh1)" : `${T.gold}1C`, border: billing === id ? "none" : `1px solid ${T.gold}45`, borderRadius: 999, padding: "2px 7px" }}>−30%</span>}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {PLANS.map((p, i) => {
              const sel = selPlan === p.id;
              const isCurrent = baseTier === p.id;
              const accent = p.id === "family" ? T.gold : T.mint;
              const base = Number(p.price.replace(",", "."));
              const yearly = billing === "yearly" && base > 0;
              const shownPrice = yearly ? (Math.round(base * 0.7 * 100) / 100).toFixed(2).replace(".", ",") : p.price;
              const yearTotal = yearly ? (Math.round(base * 0.7 * 12 * 100) / 100).toFixed(2).replace(".", ",") : null;
              return (
                <button key={p.id} className="pa-press pa-fade" onClick={() => setSelPlan(p.id)}
                  style={{ animationDelay: `${i * 60}ms`, position: "relative", width: "100%", textAlign: "left", cursor: "pointer",
                    background: sel ? `linear-gradient(150deg, ${accent}14, rgba(var(--ovc),.03))` : T.glass,
                    border: sel ? `1.5px solid ${accent}` : `1px solid ${T.glassBorder}`,
                    borderRadius: 20, padding: "16px 16px 14px",
                    boxShadow: sel ? `0 12px 36px ${accent}22` : "none", transition: "border-color 200ms ease, box-shadow 200ms ease" }}>
                  {p.id === "pro" && (
                    <div className="pa-mono" style={{ position: "absolute", top: -9, right: 14, background: `linear-gradient(135deg, ${T.mint}, ${T.mintDeep})`, color: "#06251A", fontSize: 8.5, fontWeight: 600, letterSpacing: ".1em", borderRadius: 999, padding: "3.5px 10px", boxShadow: `0 4px 12px ${T.mint}55` }}>NAJPOPULARNIEJSZY</div>
                  )}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <div className="pa-display" style={{ fontSize: 17, fontWeight: 700, color: p.id === "family" ? T.gold : T.text }}>{p.name}</div>
                    <div className="pa-body" style={{ fontSize: 10.5, color: T.faint }}>{p.tagline}</div>
                    <div style={{ flex: 1 }} />
                    <div style={{ textAlign: "right" }}>
                      <div className="pa-mono" style={{ fontSize: 17, fontWeight: 600, color: T.text }}>
                        {yearly && <span style={{ fontSize: 11, color: T.faint, textDecoration: "line-through", marginRight: 6 }}>{p.price}</span>}
                        {shownPrice} <span style={{ fontSize: 10.5, color: T.faint }}>zł/mies.</span>
                      </div>
                      {yearly && <div className="pa-body" style={{ fontSize: 9.5, color: T.gold, marginTop: 1 }}>rozliczane {yearTotal} zł/rok</div>}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 11 }}>
                    {p.features.map((f) => (
                      <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="pa-mono" style={{ color: accent, fontSize: 11 }}>✓</span>
                        <span className="pa-body" style={{ fontSize: 12, color: T.sub }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  {isCurrent && <div className="pa-mono" style={{ marginTop: 10, fontSize: 9.5, color: accent, letterSpacing: ".1em" }}>● TWÓJ AKTUALNY PLAN</div>}
                </button>
              );
            })}
          </div>

          <button className="pa-press pa-display" onClick={() => activatePlan(selPlan)}
            disabled={baseTier === selPlan}
            style={{ ...primaryBtn, width: "100%", marginTop: 18, opacity: baseTier === selPlan ? 0.45 : 1,
              background: selPlan === "family" ? `linear-gradient(135deg, ${T.gold}, #B2945A)` : primaryBtn.background,
              boxShadow: selPlan === "family" ? `0 8px 24px ${T.gold}38, inset 0 1px 0 rgba(var(--ovc),.35)` : primaryBtn.boxShadow }}>
            {baseTier === selPlan ? "Ten plan jest aktywny" : selPlan === "free" ? "Zostaję na planie Free" : (() => {
              const pp = PLANS.find((p) => p.id === selPlan);
              const bb = Number(pp.price.replace(",", "."));
              const price = billing === "yearly" ? (Math.round(bb * 0.7 * 100) / 100).toFixed(2).replace(".", ",") : pp.price;
              return `Wybieram ${pp.name} — ${price} zł/mies.${billing === "yearly" ? " (rocznie)" : ""}`;
            })()}
          </button>
          {reason === "limit" && (
            <button className="pa-press pa-body" onClick={newManualDraft}
              style={{ width: "100%", marginTop: 10, padding: "12px 0", borderRadius: 14, border: "1px solid rgba(var(--ovc),.12)", background: "none", color: T.sub, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              ✍️ Wpisz paragon ręcznie (za darmo)
            </button>
          )}
          <div className="pa-body" style={{ fontSize: 10.5, color: T.faint, textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
            {STRIPE_LINKS.pro.monthly
              ? <>Bezpieczna płatność kartą lub BLIK przez <b style={{ color: T.sub }}>Stripe</b>.<br />Anulujesz w każdej chwili — plan odnawia się automatycznie.</>
              : <>Prototyp — płatność symulowana. W pełnej aplikacji: bezpieczna płatność Stripe,<br />anulujesz w każdej chwili. Plan odnawia się automatycznie.</>}
          </div>
        </div>
      </div>
    );
  };

  /* ---------- SKANOWANIE ---------- */
  const ScanView = () => (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <Header title="Skanowanie" onBack={() => { setView({ name: "tabs" }); setScan({ step: "pick" }); }} />
      {scan.step === "processing" ? <ProcessingView preview={scan.preview} />
        : scan.step === "error" ? (
        <div className="pa-fade" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 28, textAlign: "center" }}>
          <div style={{ width: 72, height: 72, borderRadius: 22, background: "rgba(230,118,109,.12)", border: "1px solid rgba(230,118,109,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>📷</div>
          <div className="pa-display" style={{ fontSize: 16.5, fontWeight: 600, margin: "16px 0 7px", color: T.text }}>Nie udało się odczytać paragonu</div>
          <div className="pa-body" style={{ fontSize: 13, color: T.sub, marginBottom: 22, maxWidth: 280, lineHeight: 1.55 }}>{scan.reason}</div>
          <label htmlFor="pa-cam" className="pa-press pa-display" style={{ ...primaryBtn, display: "inline-block", textAlign: "center" }}>Zrób zdjęcie ponownie</label>
          <button className="pa-body pa-press" onClick={newManualDraft} style={{ marginTop: 13, background: "none", border: "none", color: T.mint, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Wpisz ręcznie</button>
        </div>
      ) : (
        <div className="pa-fade" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 28 }}>
          {/* główna akcja: aparat systemowy telefonu */}
          <label htmlFor="pa-cam" className="pa-press"
            style={{ width: "100%", maxWidth: 320, borderRadius: 22, border: `1.5px solid ${T.mint}55`,
              background: `linear-gradient(150deg, ${T.mint}16, rgba(var(--ovc),.02))`, padding: "26px 20px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer",
              boxShadow: `0 14px 40px ${T.mint}1A`, boxSizing: "border-box" }}>
            <div style={{ width: 64, height: 64, borderRadius: 999, background: `linear-gradient(135deg, ${T.mint}, ${T.mintDeep})`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 10px 28px ${T.mint}50, inset 0 1.5px 0 rgba(var(--ovc),.45)` }}>
              <Icon name="camera" size={28} sw={2} color="#06251A" />
            </div>
            <div className="pa-display" style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Zrób zdjęcie paragonu</div>
            <div className="pa-body" style={{ fontSize: 11.5, color: T.sub }}>Otwiera aparat Twojego telefonu</div>
          </label>

          <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", maxWidth: 320, margin: "18px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--sf2)" }} />
            <span className="pa-body" style={{ fontSize: 10.5, color: T.faint }}>LUB</span>
            <div style={{ flex: 1, height: 1, background: "var(--sf2)" }} />
          </div>

          <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 320 }}>
            <label htmlFor="pa-file" className="pa-press pa-body"
              style={{ flex: 1, ...card, padding: "13px 0", textAlign: "center", fontSize: 12.5, fontWeight: 600, color: T.text, cursor: "pointer" }}>
              🖼️ Z galerii
            </label>
            <button className="pa-press pa-body" onClick={newManualDraft}
              style={{ flex: 1, ...card, padding: "13px 0", textAlign: "center", fontSize: 12.5, fontWeight: 600, color: T.text, cursor: "pointer" }}>
              ✍️ Ręcznie
            </button>
          </div>
          <div className="pa-body" style={{ fontSize: 11, color: T.faint, marginTop: 18, textAlign: "center", lineHeight: 1.6 }}>
            Najlepsze wyniki: cały paragon w kadrze,<br />dobre światło, paragon wyprostowany.
          </div>
        </div>
      )}
    </div>
  );

  /* ---------- WERYFIKACJA ---------- */
  const VerifyView = () => {
    if (!draft) return null;
    const itemsSum = Math.round(draft.items.reduce((s, i) => s + (Number(String(i.total_price).replace(",", ".")) || 0), 0) * 100) / 100;
    const mismatch = !draft.manual && draft.total > 0 && draft.items.length > 0 && Math.abs(itemsSum - draft.total) > 0.01;
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative", minHeight: 0 }}>
        <Header title={draft.manual ? "Nowy paragon" : "Sprawdź wyniki"} onBack={() => { setView({ name: "tabs" }); setDraft(null); }} />
        <div className="pa-scroll" style={{ flex: 1, padding: "10px 16px 130px" }}>
          <div className="pa-rise" style={{ ...card, padding: 14, marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label className="pa-body" style={lbl}>Sklep</label>
                <select value={draft.store} onChange={(e) => setDraft({ ...draft, store: e.target.value })} className="pa-body" style={input}>
                  {draft.store && !STORES.includes(draft.store) && <option value={draft.store} style={{ background: "var(--c-surface)" }}>{draft.store}</option>}
                  {STORE_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.stores.map((s) => <option key={s} style={{ background: "var(--c-surface)" }}>{s}</option>)}
                </optgroup>
              ))}
                </select>
              </div>
              <div style={{ width: 142 }}>
                <label className="pa-body" style={lbl}>Data</label>
                <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="pa-body" style={input} />
              </div>
            </div>
          </div>

          {members.length > 1 && (
            <div className="pa-fade" style={{ ...card, padding: "11px 14px", marginBottom: 12 }}>
              <div className="pa-body" style={{ fontSize: 10, fontWeight: 600, color: T.faint, textTransform: "uppercase", letterSpacing: ".09em", marginBottom: 8 }}>Kto zrobił zakupy?</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {members.map((m, mi) => {
                  const mc = MEMBER_COLORS[mi % MEMBER_COLORS.length];
                  const sel = (draft.memberId || members[0].id) === m.id;
                  return (
                    <button key={m.id} className="pa-press pa-body" onClick={() => setDraft((d) => ({ ...d, memberId: m.id }))}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, cursor: "pointer",
                        border: sel ? `1.5px solid ${mc}` : "1px solid rgba(var(--ovc),.1)",
                        background: sel ? `${mc}18` : "rgba(var(--ovc),.03)", color: sel ? T.text : T.sub, fontSize: 12, fontWeight: 600 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: mc }} />{m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {mismatch && (
            <div className="pa-body pa-fade" style={{ display: "flex", gap: 9, background: "rgba(229,196,107,.1)", border: "1px solid rgba(229,196,107,.32)", color: "#EBD9A4", borderRadius: 13, padding: "10px 13px", fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
              <span>⚠️</span>
              <span>Suma pozycji (<b className="pa-mono">{zl(itemsSum)}</b>) różni się od sumy z paragonu (<b className="pa-mono">{zl(draft.total)}</b>). Sprawdź pozycje.</span>
            </div>
          )}

          <div className="pa-display" style={{ fontSize: 13.5, fontWeight: 600, color: T.text, margin: "4px 2px 9px" }}>
            Pozycje <span className="pa-mono" style={{ color: T.faint, fontWeight: 500 }}>({draft.items.length})</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {draft.items.map((i, idx) => (
              <div key={i.id} className="pa-fade" style={{ animationDelay: `${Math.min(idx * 35, 280)}ms`, ...card, borderRadius: 14, padding: "10px 12px" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={i.name} placeholder="Nazwa produktu" onChange={(e) => updateItem("draft", i.id, { name: e.target.value })} className="pa-body" style={{ ...input, flex: 1, fontSize: 13 }} />
                  <input type="text" inputMode="decimal" value={String(i.total_price)} placeholder="0,00"
                    onChange={(e) => updateItem("draft", i.id, { total_price: e.target.value })}
                    onBlur={(e) => updateItem("draft", i.id, { total_price: Math.round((Number(String(e.target.value).replace(",", ".")) || 0) * 100) / 100 })}
                    className="pa-mono" style={{ ...input, width: 86, textAlign: "right", fontSize: 13 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 9 }}>
                  <CategoryChip slug={i.category} onClick={() => setSheet({ itemId: i.id, context: "draft" })} />
                  <button className="pa-body pa-press" onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((x) => x.id !== i.id) }))}
                    style={{ background: "none", border: "none", color: T.danger, fontSize: 11.5, fontWeight: 600, cursor: "pointer", opacity: .85 }}>Usuń</button>
                </div>
              </div>
            ))}
          </div>
          <button className="pa-press pa-body" onClick={() => setDraft((d) => ({ ...d, items: [...d.items, { id: uid(), name: "", qty: 1, total_price: 0, category: "inne" }] }))}
            style={{ marginTop: 10, width: "100%", padding: "12px 0", borderRadius: 14, border: `1.5px dashed rgba(var(--ovc),.18)`, background: "none", color: T.sub, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Dodaj pozycję
          </button>
        </div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "26px 16px 20px", background: `linear-gradient(transparent, ${T.bg} 40%)` }}>
          <button className="pa-press pa-display" onClick={saveDraft} style={{ ...primaryBtn, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Zapisz paragon</span>
            <span className="pa-mono" style={{ fontWeight: 600 }}>{zl(draft.items.length ? itemsSum : draft.total)}</span>
          </button>
        </div>
        {sheet && sheet.context === "draft" && (
          <CategorySheet current={draft.items.find((i) => i.id === sheet.itemId)?.category}
            onPick={(slug) => { updateItem("draft", sheet.itemId, { category: slug }); setSheet(null); }}
            onClose={() => setSheet(null)} />
        )}
      </div>
    );
  };

  /* ---------- SZCZEGÓŁY ---------- */
  const DetailsView = () => {
    const r = receipts.find((x) => x.id === view.id);
    if (!r) return null;
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative", minHeight: 0 }}>
        <Header title="Szczegóły paragonu" onBack={() => setView({ name: "tabs" })} />
        <div className="pa-scroll" style={{ flex: 1, padding: "12px 22px 48px" }}>
          <div className="pa-rise" style={{ filter: "drop-shadow(0 22px 40px var(--sh2))" }}>
            <div className="pa-zz-paper-top" />
            <div style={{ background: T.paper, padding: "20px 18px 8px" }}>
              <div style={{ textAlign: "center", marginBottom: 14 }}>
                <div className="pa-display" style={{ fontSize: 18, fontWeight: 700, color: T.paperInk, letterSpacing: ".01em" }}>{r.store.toUpperCase()}</div>
                <div className="pa-mono" style={{ fontSize: 10, color: T.paperSub, marginTop: 4, letterSpacing: ".12em" }}>PARAGON FISKALNY</div>
                <div className="pa-mono" style={{ fontSize: 10.5, color: T.paperSub, marginTop: 2 }}>{fmtDate(r.date)} · {r.items.length} poz.</div>
                {effTier === "family" && r.memberId && (
                  <div className="pa-mono" style={{ fontSize: 9.5, color: T.paperSub, marginTop: 3, letterSpacing: ".08em" }}>KUPIŁ(A): {memberName(r.memberId).toUpperCase()}</div>
                )}
              </div>
              <div style={{ borderTop: `1.5px dashed #D8D2C4`, paddingTop: 11 }}>
                {r.items.map((i) => (
                  <div key={i.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 0" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="pa-mono" style={{ fontSize: 12.5, color: T.paperInk, fontWeight: 500, lineHeight: 1.35 }}>{i.name}</div>
                      <div style={{ marginTop: 5 }}>
                        <CategoryChip light slug={i.category} onClick={() => setSheet({ itemId: i.id, context: "details", receiptId: r.id })} />
                      </div>
                    </div>
                    <div className="pa-mono" style={{ fontSize: 13, fontWeight: 600, color: T.paperInk, paddingTop: 1 }}>{num(i.total_price)}</div>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: `2px solid ${T.paperInk}`, marginTop: 10, paddingTop: 11, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div className="pa-mono" style={{ fontSize: 13, fontWeight: 600, color: T.paperInk, letterSpacing: ".05em" }}>SUMA PLN</div>
                <div className="pa-mono" style={{ fontSize: 17, fontWeight: 600, color: T.paperInk }}>{num(r.total)}</div>
              </div>
              <div style={{ margin: "16px 8px 10px" }}>
                <div className="pa-barcode" />
                <div className="pa-mono" style={{ textAlign: "center", fontSize: 9, color: T.paperSub, marginTop: 5, letterSpacing: ".22em" }}>PARAGON·AI·{r.id.slice(0, 8).toUpperCase()}</div>
              </div>
            </div>
            <div className="pa-zz-paper" />
          </div>

          <button className="pa-press pa-body" onClick={() => setConfirmBox({
              title: "Usunąć paragon?",
              body: `${r.store}, ${fmtDate(r.date)} — ${zl(r.total)}. Tej operacji nie można cofnąć.`,
              confirmLabel: "Usuń paragon", onConfirm: () => deleteReceipt(r.id),
            })}
            style={{ marginTop: 22, width: "100%", padding: "12px 0", borderRadius: 14, border: "1px solid rgba(230,118,109,.3)", background: "rgba(230,118,109,.07)", color: T.danger, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Usuń paragon
          </button>
        </div>
        {sheet && sheet.context === "details" && (
          <CategorySheet current={r.items.find((i) => i.id === sheet.itemId)?.category}
            onPick={(slug) => { updateItem(sheet.receiptId, sheet.itemId, { category: slug }); setSheet(null); showToast("Kategoria zmieniona"); }}
            onClose={() => setSheet(null)} />
        )}
      </div>
    );
  };

  /* ---------- RENDER ---------- */
  return (
    <div className="pa-body" style={{ minHeight: "100vh", background: "var(--c-outer)", display: "flex", justifyContent: "center" }}>
      <GlobalStyle />
      <input id="pa-file" ref={fileRef} type="file" accept="image/*"
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", clip: "rect(0 0 0 0)", pointerEvents: "none" }}
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
      <input id="pa-cam" type="file" accept="image/*" capture="environment"
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", clip: "rect(0 0 0 0)", pointerEvents: "none" }}
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={backupRef} type="file" accept="application/json,.json"
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", clip: "rect(0 0 0 0)", pointerEvents: "none" }}
        onChange={(e) => { restoreBackup(e.target.files?.[0]); e.target.value = ""; }} />

      <div ref={appRef} className="pa-app" style={{ width: "100%", maxWidth: 430, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden",
        background: `radial-gradient(1200px 520px at 50% -160px, var(--c-glow) 0%, transparent 60%),
          radial-gradient(900px 420px at 88% 108%, rgba(216,184,120,.05) 0%, transparent 60%),
          radial-gradient(700px 380px at -10% 92%, ${T.mint}08 0%, transparent 55%), ${T.bg}`,
        boxShadow: "0 0 90px var(--sh2), inset 0 0 120px var(--sh1)" }}>

        <div className="pa-aurora" style={{ top: -120, left: -80, width: 260, height: 260, background: `radial-gradient(circle, ${T.mint}26, transparent 70%)` }} />
        <div className="pa-aurora" style={{ top: 40, right: -110, width: 240, height: 240, background: `radial-gradient(circle, ${T.gold}1C, transparent 70%)`, animationDelay: "-6s" }} />
        <div className="pa-noise" />

        {/* pasek marki */}
        <div style={{ position: "relative", zIndex: 1, padding: "16px 18px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div className="pa-mono pa-sheen" style={{ background: `linear-gradient(135deg, ${T.mint}, ${T.mintDeep})`, color: "#06251A", borderRadius: 9, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, boxShadow: `0 4px 14px ${T.mint}40, inset 0 1px 0 rgba(var(--ovc),.4)` }}>P</div>
            <div className="pa-display" style={{ color: T.text, fontSize: 15.5, fontWeight: 700 }}>Paragon <span style={{ color: T.mint }}>AI</span></div>
          </div>
          <button className="pa-press pa-mono" onClick={() => setView({ name: "plans" })}
            style={{ color: badge.color, fontSize: 9.5, letterSpacing: ".14em", border: `1px solid ${badge.color}55`, background: `${badge.color}12`, borderRadius: 999, padding: "4px 11px", fontWeight: 600, cursor: "pointer" }}>
            {tierLimit !== null ? `${badge.label} · ${quota.used}/${tierLimit}` : badge.label}
          </button>
        </div>

        {!loaded ? (
          <div style={{ flex: 1, padding: "18px" }}>
            <div className="pa-shimmer" style={{ height: 230, borderRadius: 24 }} />
            <div className="pa-shimmer" style={{ height: 64, borderRadius: 16, marginTop: 22 }} />
            <div className="pa-shimmer" style={{ height: 64, borderRadius: 16, marginTop: 9 }} />
          </div>
        ) : !session && !guest ? (
          <AuthScreen
            onGuest={() => { try { localStorage.setItem("paragon-guest", "1"); } catch (e) {} setGuest(true); }}
            onLoggedIn={() => setGuest(false)} />
        ) : !onboarded ? (
          <OnboardingScreen
            onFinish={(nm) => { if (nm) setProfile((p) => ({ ...p, name: nm })); setOnboarded(true); if (!tutorialDone) setTutStep(0); navigator.vibrate?.(20); }}
            onSkip={() => { setOnboarded(true); setTutorialDone(true); }} />
        )
          : view.name === "scan" ? ScanView()
          : view.name === "verify" ? VerifyView()
          : view.name === "details" ? DetailsView()
          : view.name === "plans" ? PlansView()
          : view.name === "restock" ? RestockView()
          : view.name === "goals" ? GoalsView()
          : view.name === "summary" ? SummaryView()
          : view.name === "challenges" ? ChallengesView()
          : view.name === "achievements" ? AchievementsView()
          : view.name === "shop" ? ShopView()
          : (
          <>
            <div ref={scrollRef} className="pa-scroll" style={{ flex: 1, minHeight: 0, position: "relative", zIndex: 1 }}>
              {tab === "pulpit" && <div key={month} className="pa-fade" style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>{Pulpit()}</div>}
              {tab === "paragony" && Paragony()}
              {tab === "analiza" && Analiza()}
              {tab === "profil" && Profil()}
            </div>
            {/* pływająca nawigacja */}
            <div ref={tutNavRef} style={{ position: "absolute", bottom: "calc(14px + env(safe-area-inset-bottom, 0px))", left: 14, right: 14, zIndex: 30,
              background: "rgba(14,26,20,.82)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
              border: "1px solid rgba(var(--ovc),.09)", borderRadius: 24, display: "flex", alignItems: "center",
              padding: "9px 10px", boxShadow: "0 14px 40px var(--sh2), inset 0 1px 0 rgba(var(--ovc),.07)" }}>
              <TabBtn k="pulpit" label="Pulpit" icon="home" tab={tab} setTab={setTab} />
              <TabBtn k="paragony" label="Paragony" icon="receipt" tab={tab} setTab={setTab} />
              <button ref={tutFabRef} className="pa-press pa-glow" onClick={fabClick}
                onTouchStart={fabDown} onTouchEnd={fabUp} onTouchCancel={fabUp}
                onMouseDown={fabDown} onMouseUp={fabUp} onMouseLeave={fabUp}
                onContextMenu={(e) => e.preventDefault()}
                title="Tap: skanuj · Przytrzymaj: szybki wydatek"
                style={{ width: 58, height: 58, borderRadius: 999, background: `linear-gradient(135deg, ${T.mint}, ${T.mintDeep})`, color: "#06251A", boxShadow: `0 10px 28px ${T.mint}55, inset 0 1.5px 0 rgba(var(--ovc),.4), 0 0 0 5px ${T.mint}14`,
                  border: "none", cursor: "pointer", margin: "-30px 8px 0", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  userSelect: "none", WebkitUserSelect: "none", touchAction: "manipulation", position: "relative" }}>
                {receipts.length === 0 && <><span className="pa-fab-ring" /><span className="pa-fab-ring pa-fab-ring-2" /></>}
                <Icon name="camera" size={25} sw={2} color="#06251A" />
              </button>
              <TabBtn k="analiza" label="Analiza" icon="chart" tab={tab} setTab={setTab} />
              <TabBtn innerRef={tutProfileRef} k="profil" label="Profil" icon="user" tab={tab} setTab={setTab} />
            </div>
          </>
        )}

        {toast && (
          <div className="pa-pop pa-body" style={{ position: "absolute", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg, rgba(26,48,38,.97), rgba(16,32,25,.97))", backdropFilter: "blur(10px)", border: `1px solid ${T.mint}45`, color: T.text, borderRadius: 999, padding: "11px 20px", fontSize: 12.5, fontWeight: 600, boxShadow: `0 14px 38px var(--sh2), 0 0 22px ${T.mint}22`, zIndex: 70, whiteSpace: "nowrap", maxWidth: "88%", overflow: "hidden", textOverflow: "ellipsis" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 17, height: 17, borderRadius: 999, background: `${T.mint}22`, border: `1px solid ${T.mint}55`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, color: T.mint, flexShrink: 0 }}>✓</span>
              {toast}
            </span>
          </div>
        )}
        {quickAdd && (
          <QuickAddSheet
            onClose={() => setQuickAdd(false)}
            onSubmit={(d) => {
              const rec = {
                id: uid(), store: d.store, date: d.date, total: d.amount,
                items: [{ id: uid(), name: "Wydatek ręczny", qty: 1, total_price: d.amount, category: d.category }],
                createdAt: Date.now(), manual: true, memberId: members[0]?.id,
              };
              setReceipts((rs) => [rec, ...rs.filter((r) => !r.sample)]);
              setMonth(monthKey(d.date) || nowMonth());
              setQuickAdd(false);
              showToast("Wydatek dodany ✓");
            }} />
        )}
        {confirmBox && <ConfirmSheet {...confirmBox} onClose={() => setConfirmBox(null)} />}
        {inputSheet && <InputSheet {...inputSheet} onClose={() => setInputSheet(null)} />}
        {achPopup && (
          <div className="pa-rise" role="button" onClick={() => { setAchPopup(null); setView({ name: "achievements" }); }}
            style={{ position: "absolute", top: "calc(14px + env(safe-area-inset-top, 0px))", left: 14, right: 14, zIndex: 72, cursor: "pointer",
              background: "linear-gradient(140deg, #2A2412, #1A1608)", border: `1px solid ${T.gold}55`, borderRadius: 18, padding: "13px 15px",
              boxShadow: `0 18px 50px var(--sh2), 0 0 26px ${T.gold}25`, display: "flex", alignItems: "center", gap: 12 }}>
            <div className="pa-glow" style={{ width: 44, height: 44, borderRadius: 14, background: `linear-gradient(135deg, ${T.gold}, #B2945A)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21, flexShrink: 0 }}>{achPopup.emoji}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="pa-mono" style={{ fontSize: 8.5, letterSpacing: ".14em", color: T.gold }}>NOWE OSIĄGNIĘCIE</div>
              <div className="pa-display" style={{ fontSize: 14.5, fontWeight: 700, color: "#fff", marginTop: 2 }}>{achPopup.title}</div>
              <div className="pa-body" style={{ fontSize: 10.5, color: "rgba(var(--ovc),.65)", marginTop: 1 }}>
                {[achPopup.reward > 0 && `+${achPopup.reward} skanów`, achPopup.xp > 0 && `+${achPopup.xp} XP`, achPopup.proDays > 0 && `+${achPopup.proDays} dni Pro`].filter(Boolean).join(" · ") ? `Dotknij, by odebrać: ${[achPopup.reward > 0 && `+${achPopup.reward} skanów 🎁`, achPopup.xp > 0 && `+${achPopup.xp} XP ⚡`, achPopup.proDays > 0 && `+${achPopup.proDays} dni Pro 👑`].filter(Boolean).join(" · ")}` : "Dotknij, by zobaczyć odznakę"}
              </div>
            </div>
            <button className="pa-press" onClick={(e) => { e.stopPropagation(); setAchPopup(null); }}
              style={{ width: 26, height: 26, borderRadius: 9, border: "1px solid rgba(var(--ovc),.14)", background: "var(--sf2)", color: "rgba(var(--ovc),.6)", fontSize: 11, cursor: "pointer", flexShrink: 0 }}>✕</button>
          </div>
        )}
        {celebrate && (
          <div className="pa-fade" onClick={() => setCelebrate(null)}
            style={{ position: "absolute", inset: 0, zIndex: 80, background: "rgba(3,9,6,.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 28, cursor: "pointer" }}>
            {[0, 1, 2].map((i) => (
              <span key={"b" + i} className="pa-burst" style={{ left: "50%", top: "38%", width: 90, height: 90, marginLeft: -45, marginTop: -45,
                borderColor: i === 1 ? "rgba(45,212,160,.6)" : "rgba(216,184,120,.65)", animationDelay: `${i * 180}ms` }} />
            ))}
            {Array.from({ length: 22 }).map((_, i) => {
              const c = ["#2DD4A0", "#D8B878", "#E6766D", "#5BB8E8", "#EC86B2", "#A189DB", "#E5C46B", "#7EE8C4"][i % 8];
              const ang = (i / 22) * Math.PI * 2 + (i % 3) * 0.22;
              const power = 110 + (i % 5) * 42;
              const round = i % 3 === 0;
              const sz = 7 + (i % 4) * 3;
              return <span key={i} className="pa-confetti" style={{ left: "50%", top: "38%", background: c,
                width: round ? sz : sz - 2, height: round ? sz : sz + 6, borderRadius: round ? "50%" : 2,
                boxShadow: `0 0 10px ${c}77`, animationDelay: `${i * 26}ms`,
                "--dx": `${Math.cos(ang) * power}px`,
                "--peak": `${-60 - (i % 6) * 26}px`,
                "--dy": `${180 + (i % 5) * 60}px`,
                "--rot": `${320 + i * 53}deg` }} />;
            })}
            {["✨", "⭐", "✦"].map((e, i) => (
              <span key={"s" + i} className="pa-spark" style={{ left: `${26 + i * 24}%`, top: `${24 + (i % 2) * 30}%`, fontSize: 16 + i * 4, animationDelay: `${i * 260}ms` }}>{e}</span>
            ))}
            <div className="pa-pop" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 300, width: "100%", textAlign: "center", background: "var(--c-surface)", position: "relative", zIndex: 2,
              border: `1px solid ${T.gold}50`, borderRadius: 24, padding: "28px 22px 22px", boxShadow: `0 30px 80px var(--sh2), 0 0 40px ${T.gold}22`, cursor: "default" }}>
              <div style={{ position: "relative", display: "inline-block" }}>
                <span className="pa-rays" />
                <div className="pa-float" style={{ position: "relative", fontSize: 52, lineHeight: 1, filter: "drop-shadow(0 8px 20px rgba(216,184,120,.45))" }}>{celebrate.emoji}</div>
              </div>
              <div className="pa-mono pa-stage" style={{ fontSize: 9.5, letterSpacing: ".16em", color: T.gold, margin: "14px 0 6px", animationDelay: "120ms" }}>{celebrate.tag || "WYZWANIE UKOŃCZONE"}</div>
              <div className="pa-display pa-stage" style={{ fontSize: 19, fontWeight: 700, color: T.text, animationDelay: "220ms" }}>{celebrate.title}</div>
              <div className="pa-stage" style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 12, background: `${T.gold}14`, border: `1px solid ${T.gold}45`, borderRadius: 999, padding: "8px 16px", animationDelay: "360ms" }}>
                <span style={{ fontSize: 15 }}>🏆</span>
                <span className="pa-body" style={{ fontSize: 12, fontWeight: 700, color: T.gold }}>{celebrate.badge}</span>
              </div>
              <button className="pa-press pa-display pa-stage" onClick={() => setCelebrate(null)}
                style={{ ...primaryBtn, width: "100%", marginTop: 18, fontSize: 14, animationDelay: "500ms" }}>
                Świetnie! 🎉
              </button>
            </div>
          </div>
        )}
        {tutStep !== null && loaded && onboarded && view.name === "tabs" && (
          <TutorialOverlay step={tutStep} appRef={appRef}
            targets={{ 0: tutFabRef, 1: tutHeroRef, 2: tutMonthRef, 3: tutNavRef, 4: tutProfileRef }}
            onNext={() => { if (tutStep >= TUTORIAL_STEPS.length - 1) { setTutStep(null); setTutorialDone(true); showToast("Gotowe — zeskanuj pierwszy paragon! 📸"); } else { setTutStep(tutStep + 1); navigator.vibrate?.(8); } }}
            onSkip={() => { setTutStep(null); setTutorialDone(true); }} />
        )}
      </div>
    </div>
  );
}

function TabBtn({ k, label, icon, tab, setTab, innerRef }) {
  const active = tab === k;
  return (
    <button ref={innerRef} className={`pa-press pa-body${active ? " pa-tab-on" : ""}`} onClick={() => { if (tab !== k) { navigator.vibrate?.(8); setTab(k); } }}
      style={{ flex: 1, background: "none", border: "none", cursor: "pointer", color: active ? "#2DD4A0" : "#7E938A",
        fontSize: 10, fontWeight: active ? 700 : 500, padding: "3px 0", transition: "color 240ms ease", position: "relative" }}>
      <span className="pa-tab-pill" />
      <div className="pa-tab-ico" style={{ display: "flex", justifyContent: "center", marginBottom: 3, filter: active ? "drop-shadow(0 0 9px rgba(45,212,160,.6))" : "none", opacity: active ? 1 : 0.65 }}>
        <Icon name={icon} size={19} color={active ? "#2DD4A0" : "#8AA096"} sw={active ? 2 : 1.7} />
      </div>
      {label}
      {active && <div style={{ position: "absolute", top: -9, left: "50%", transform: "translateX(-50%)", width: 18, height: 3, borderRadius: 2, background: "#2DD4A0", boxShadow: "0 0 10px rgba(45,212,160,.7)" }} />}
    </button>
  );
}

const ICONS = {
  home: <path d="M3 10.5 12 3l9 7.5M5.5 9.5V20a1 1 0 0 0 1 1H10v-5.5h4V21h3.5a1 1 0 0 0 1-1V9.5" />,
  receipt: <path d="M6 2.5h12V21l-2.4-1.6L13.2 21l-2.4-1.6L8.4 21 6 19.4V2.5ZM9 7.5h6M9 11h6M9 14.5h4" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />,
  share: <path d="M12 3v13M12 3 8 7m4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />,
  user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8.5c.8-3.2 3.6-5 7-5s6.2 1.8 7 5" />,
  camera: <path d="M4 7.5h3l1.5-2.5h7L17 7.5h3a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1Zm8 9.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />,
  search: <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm10 3-4.8-4.8" />,
  repeat: <path d="M4 9a5 5 0 0 1 5-5h8l-2.5-2.5M20 15a5 5 0 0 1-5 5H7l2.5 2.5" />,
  cart: <path d="M3 4h2l2.2 11.5a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2L21 8H6M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />,
  check: <path d="M20 6 9 17l-5-5" />,
  bell: <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />,
  report: <path d="M3 3v18h18M8 17V9M13 17V5M18 17v-6" />,
  alert: <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />,
  download: <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />,
  trash: <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />,
  lock: <path d="M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Zm2 0V8a5 5 0 0 1 10 0v3" />,
  doc: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM14 3v5h5M9 13h6M9 17h6" />,
  info: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13h.01M11 12h1v4h1" />,
  crown: <path d="M3 7l4 5 5-7 5 7 4-5v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" />,
  pencil: <path d="M4 20h4L19 9a2 2 0 0 0-3-3L5 17v3ZM14 7l3 3" />,
  spark: <path d="M12 3v4m0 10v4m9-9h-4M7 12H3m13.5-6.5-2.5 2.5m-5 5-2.5 2.5m12.5 0-2.5-2.5m-5-5L7.5 5.5" />,
  target: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />,
  piggy: <path d="M19 9c0-3-3-5-7-5s-7 2-7 5c0 1.4.7 2.7 1.8 3.6V16h2.4v-1.5c.9.3 1.8.5 2.8.5s1.9-.2 2.8-.5V16H19v-3.4c1.1-.9 1.8-2.2 1.8-3.6M9 8h.01M3 11h2" />,
  plus: <path d="M12 5v14M5 12h14" />,
};
function Icon({ name, size = 19, color = "currentColor", sw = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name] || null}
    </svg>
  );
}

/* ---------- Error Boundary: łapie crash i pokazuje komunikat zamiast czarnego ekranu ---------- */
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) { console.error("Paragon AI error:", error, info); }
  handleReset = () => {
    try { localStorage.removeItem("paragon-state"); } catch (e) { /* nic */ }
    if (typeof window !== "undefined") window.location.reload();
  };
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", background: "#050B08", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Inter, system-ui, sans-serif" }}>
          <div style={{ maxWidth: 340, textAlign: "center" }}>
            <div style={{ fontSize: 42, marginBottom: 14 }}>🛠️</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#EDF3EF", marginBottom: 8 }}>Coś poszło nie tak</div>
            <div style={{ fontSize: 13.5, color: "#9DB0A6", lineHeight: 1.6, marginBottom: 22 }}>
              Aplikacja napotkała nieoczekiwany błąd. Odśwież — Twoje dane zwykle pozostają zapisane. Jeśli błąd wraca, użyj przycisku poniżej, aby wyczyścić pamięć aplikacji.
            </div>
            <button onClick={() => window.location.reload()}
              style={{ width: "100%", padding: "13px 0", borderRadius: 14, border: "none", background: "linear-gradient(135deg,#2DD4A0,#1BA47D)", color: "#06251A", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>
              Odśwież aplikację
            </button>
            <button onClick={this.handleReset}
              style={{ width: "100%", padding: "11px 0", borderRadius: 14, border: "1px solid rgba(255,255,255,.12)", background: "none", color: "#9DB0A6", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              Wyczyść dane i zacznij od nowa
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ParagonAI() {
  return (
    <ErrorBoundary>
      <ParagonAIInner />
    </ErrorBoundary>
  );
}
