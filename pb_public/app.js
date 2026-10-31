"use strict";
// Štedna knjižica — frontend koji radi sa PocketBase-om na istom serveru.

const pb = new PocketBase(location.origin);

const CATS = [
  { id: "namirnice", name: "Namirnice", c: "--c1" },
  { id: "restorani", name: "Restorani i dostava", c: "--c2" },
  { id: "kafici", name: "Kafići", c: "--c9" },
  { id: "izlasci", name: "Izlasci", c: "--c10" },
  { id: "gorivo", name: "Gorivo", c: "--c3" },
  { id: "auto", name: "Održavanje automobila", c: "--c11" },
  { id: "zdravlje", name: "Zdravlje i apoteka", c: "--c7" },
  { id: "kupovina", name: "Odeća i kupovina", c: "--c4" },
  { id: "kuca", name: "Kuća i domaćinstvo", c: "--c8" },
  { id: "pokloni", name: "Pokloni", c: "--c5" },
  { id: "putovanja", name: "Putovanja", c: "--c12" },
  { id: "ostalo", name: "Ostalo", c: "--c6" },
];
const MONTHS = ["Januar","Februar","Mart","April","Maj","Jun","Jul","Avgust","Septembar","Oktobar","Novembar","Decembar"];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const col = (c) => `var(${c})`;
const fmt = (n) => new Intl.NumberFormat("sr-RS", { style: "currency", currency: "EUR" }).format(n || 0);
const parse = (v) => { const n = parseFloat(String(v).replace(/\s/g, "").replace(",", ".")); return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0; };
const ym = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
const pad = (n) => String(n).padStart(2, "0");
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sumAmt = (arr) => (arr || []).reduce((a, x) => a + (x.amount || 0), 0);
const label = (k) => { const [y, m] = k.split("-"); return MONTHS[+m - 1] + " " + y; };
const short = (k) => MONTHS[+k.split("-")[1] - 1].slice(0, 3);
const shiftMonth = (k, d) => { const [y, m] = k.split("-"); return ym(new Date(+y, +m - 1 + d, 1)); };

const today = new Date();
let cur = ym(today);
let selCat = "namirnice";
let busy = false;

// Podaci iz baze
let fixed = [];          // [{id,name,amount}]
let monthRecs = {};      // key -> record {id,key,salary,extra,fixed_snap}
let expenses = [];       // [{id,month,date,amount,cat,note,by}]

const fixSum = () => sumAmt(fixed);
const hasPay = (k) => (monthRecs[k]?.salary || 0) > 0;
const latestPay = () => Object.keys(monthRecs).filter(hasPay).sort().pop() || null;
const isClosed = (k) => { const L = latestPay(); return !!L && k < L; };
const monthExpenses = (k) => expenses.filter((e) => e.month === k);

function monthCalc(k) {
  const m = monthRecs[k];
  const inc = (m?.salary || 0) + sumAmt(m?.extra);
  const vr = sumAmt(monthExpenses(k));
  const fx = Array.isArray(m?.fixed_snap) ? sumAmt(m.fixed_snap) : fixSum();
  return { inc, fix: inc ? fx : 0, vr };
}

function setStatus(t) { $("status").textContent = t || ""; }

async function loadAll() {
  const [f, m, e] = await Promise.all([
    pb.collection("fixed_costs").getFullList({ sort: "created" }),
    pb.collection("months").getFullList(),
    pb.collection("expenses").getFullList({ sort: "-date,-created" }),
  ]);
  fixed = f;
  monthRecs = Object.fromEntries(m.map((r) => [r.key, r]));
  expenses = e.map((r) => ({ ...r, date: String(r.date).slice(0, 10) }));
}

async function refresh() {
  try { await loadAll(); render(); setStatus(""); }
  catch (err) { handleError(err); }
}

function handleError(err) {
  console.error(err);
  if (err?.status === 401 || err?.status === 403) { pb.authStore.clear(); showLogin(); return; }
  setStatus(err?.status === 0 ? "Nema veze sa serverom. Pokušaj ponovo." : "Nešto nije uspelo. Osveži stranicu.");
}

// Pokreće izmenu, pa ponovo učitava podatke
async function act(fn) {
  if (busy) return;
  busy = true; setStatus("Čuvam…");
  try { await fn(); await loadAll(); render(); setStatus("Sačuvano"); setTimeout(() => setStatus(""), 1500); }
  catch (err) { handleError(err); }
  finally { busy = false; }
}

async function ensureMonth(k) {
  if (monthRecs[k]) return monthRecs[k];
  try {
    const r = await pb.collection("months").create({ key: k, salary: 0, extra: [], fixed_snap: null });
    monthRecs[k] = r; return r;
  } catch (err) {
    // druga osoba je možda upravo napravila isti mesec
    const r = await pb.collection("months").getFirstListItem(pb.filter("key = {:k}", { k }));
    monthRecs[k] = r; return r;
  }
}

// Mesec se zatvara kad se unese plata za neki kasniji mesec: tada se zamrzavaju njegovi stalni troškovi.
async function syncFreeze() {
  const snap = fixed.map((f) => ({ name: f.name, amount: f.amount }));
  for (const k of Object.keys(monthRecs)) {
    const m = monthRecs[k];
    const frozen = Array.isArray(m.fixed_snap);
    if (isClosed(k) && !frozen) monthRecs[k] = await pb.collection("months").update(m.id, { fixed_snap: snap });
    else if (!isClosed(k) && frozen) monthRecs[k] = await pb.collection("months").update(m.id, { fixed_snap: null });
  }
}

function defaultDate() { return cur === ym(today) ? localDate(today) : cur + "-01"; }

function render() {
  const [y, mo] = cur.split("-");
  $("mlabel").textContent = MONTHS[+mo - 1] + " " + y;
  const m = monthRecs[cur];
  const c = monthCalc(cur);
  const closed = isClosed(cur);
  const left = c.inc - c.fix - c.vr;

  // Ušteđevina iz zatvorenih meseci
  const past = Object.keys(monthRecs).filter((k) => isClosed(k) && monthCalc(k).inc).sort();
  const contrib = past.map((k) => { const x = monthCalc(k); return { k, v: x.inc - x.fix - x.vr }; });
  const saved = contrib.reduce((a, x) => a + x.v, 0);
  $("saved").textContent = fmt(saved);
  $("vault").classList.toggle("neg", saved < 0);
  $("savedNote").textContent = past.length
    ? `Zbir onoga što je ostalo u ${past.length} ${past.length === 1 ? "zatvorenom mesecu" : "zatvorenih meseci"}. Mesec se zatvara kad uneseš sledeću platu.`
    : "Kad uneseš sledeću platu, sve što je ostalo neutrošeno prelazi ovde.";
  const recent = contrib.slice(-6), mx = Math.max(...recent.map((x) => Math.abs(x.v)), 1);
  $("hist").hidden = !recent.length;
  $("hist").innerHTML = recent.map((x) => `<div title="${label(x.k)}: ${fmt(x.v)}"><i class="${x.v < 0 ? "neg" : ""}" style="height:${Math.abs(x.v) / mx * 44}px"></i><span>${short(x.k)}</span></div>`).join("");

  // Bilans meseca
  $("left").textContent = fmt(left);
  $("balance").classList.toggle("neg", left < 0);
  $("leftLabel").textContent = closed ? "Ostalo u ovom mesecu" : "Ostaje ovog meseca";
  $("fIn").textContent = fmt(c.inc); $("fFix").textContent = "−" + fmt(c.fix); $("fVar").textContent = "−" + fmt(c.vr);
  const base = Math.max(c.inc, c.fix + c.vr) || 1;
  $("meter").innerHTML = `<i style="width:${c.fix / base * 100}%;background:rgba(0,0,0,.35)"></i><i style="width:${c.vr / base * 100}%;background:rgba(0,0,0,.18)"></i>`;
  $("total").textContent = closed ? "Mesec je zatvoren: stalni troškovi su zamrznuti, a ostatak je u ušteđevini." : (c.inc ? "Kad uneseš sledeću platu, ovaj iznos prelazi u ušteđevinu." : "");

  // Prihod
  if (document.activeElement !== $("salary")) $("salary").value = m?.salary ? String(m.salary).replace(".", ",") : "";
  const extra = Array.isArray(m?.extra) ? m.extra : [];
  $("extraList").innerHTML = extra.map((e, i) => `<div class="item"><span class="grow">${esc(e.name)}</span><span class="num">${fmt(e.amount)}</span><button class="del" data-x="${i}" aria-label="Obriši">✕</button></div>`).join("");

  // Stalni troškovi
  const fl = closed && Array.isArray(m?.fixed_snap) ? m.fixed_snap : fixed;
  $("fixSum").textContent = "−" + fmt(sumAmt(fl));
  $("fixHint").textContent = closed ? "Zamrznuti za ovaj mesec: izmene liste važe samo za otvorene mesece." : "Skidaju se automatski od plate. Kad uneseš sledeću platu, zamrzavaju se za ovaj mesec.";
  $("fxName").parentElement.hidden = closed;
  $("fixList").innerHTML = fl.length
    ? fl.map((f) => `<div class="item"><span class="grow">${esc(f.name)}</span><span class="num">${fmt(f.amount)}</span>${closed ? "" : `<button class="del" data-f="${f.id}" aria-label="Obriši ${esc(f.name)}">✕</button>`}</div>`).join("")
    : `<p class="hint">Još nema stalnih troškova.</p>`;

  // Ostali troškovi
  $("catChips").innerHTML = CATS.map((k) => `<button type="button" class="chip" aria-pressed="${k.id === selCat}" data-cat="${k.id}"><span class="dot" style="background:${col(k.c)}"></span>${k.name}</button>`).join("");
  if (!$("vDate").value || $("vDate").value.slice(0, 7) !== cur) $("vDate").value = defaultDate();
  $("varSum").textContent = "−" + fmt(c.vr);
  const list = monthExpenses(cur);
  const by = {}; list.forEach((e) => (by[e.cat] = (by[e.cat] || 0) + e.amount));
  const used = CATS.filter((k) => by[k.id]).sort((a, b) => by[b.id] - by[a.id]);
  $("stack").hidden = !used.length;
  $("stack").innerHTML = used.map((k) => `<i style="width:${by[k.id] / c.vr * 100}%;background:${col(k.c)}" title="${k.name}"></i>`).join("");
  $("cats").innerHTML = used.map((k) => `<div><span><span class="dot" style="background:${col(k.c)}"></span>${k.name}</span><span class="num">${fmt(by[k.id])}</span></div>`).join("");
  let lastDay = "", html = "";
  list.forEach((e) => {
    if (e.date !== lastDay) { lastDay = e.date; const dd = new Date(e.date + "T12:00"); html += `<div class="day">${dd.toLocaleDateString("sr-Latn-RS", { weekday: "long", day: "numeric", month: "long" })}</div>`; }
    const k = CATS.find((x) => x.id === e.cat) || CATS[CATS.length - 1];
    const sub = [e.note ? k.name : "", e.by ? `<span class="by">unos: ${esc(e.by)}</span>` : ""].filter(Boolean).join(" · ");
    html += `<div class="item"><span class="dot" style="width:10px;height:10px;border-radius:50%;flex:none;background:${col(k.c)}"></span><span class="grow">${esc(e.note || k.name)}${sub ? `<small>${sub}</small>` : ""}</span><span class="num">${fmt(e.amount)}</span><button class="del" data-v="${e.id}" aria-label="Obriši trošak">✕</button></div>`;
  });
  $("varList").innerHTML = html || `<p class="hint">Nema zabeleženih troškova za ovaj mesec.</p>`;

  renderReport();
}

function renderReport() {
  const pk = shiftMonth(cur, -1);
  const catTotals = (k) => { const o = {}; monthExpenses(k).forEach((e) => (o[e.cat] = (o[e.cat] || 0) + e.amount)); return o; };
  const a = catTotals(cur), b = catTotals(pk);
  const ca = monthCalc(cur), cb = monthCalc(pk);
  $("repTitle").textContent = `Izveštaj: ${MONTHS[+cur.split("-")[1] - 1]} vs ${MONTHS[+pk.split("-")[1] - 1]}`;
  if (!cb.vr && !cb.inc) { $("verdict").textContent = `Nema podataka za ${label(pk)}, pa nema sa čim da se poredi.`; $("rep").innerHTML = ""; return; }
  const diff = (x, y) => {
    const d = x - y; if (Math.abs(d) < 0.005) return `<span class="same">0</span>`;
    const pct = y ? ` <small>(${d > 0 ? "+" : ""}${Math.round(d / y * 100)}%)</small>` : "";
    return `<span class="${d > 0 ? "up" : "down"}">${d > 0 ? "▲ +" : "▼ −"}${fmt(Math.abs(d)).replace("€", "").trim()}${pct}</span>`;
  };
  const rows = CATS.filter((k) => a[k.id] || b[k.id]).map((k) => ({ k, x: a[k.id] || 0, y: b[k.id] || 0 })).sort((p, q) => Math.abs(q.x - q.y) - Math.abs(p.x - p.y));
  let h = `<tr><th>Kategorija</th><th>${short(cur)}</th><th>${short(pk)}</th><th>Razlika</th></tr>`;
  h += rows.map((r) => `<tr><td><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:${col(r.k.c)}"></span>${r.k.name}</td><td>${fmt(r.x)}</td><td>${fmt(r.y)}</td><td>${diff(r.x, r.y)}</td></tr>`).join("");
  h += `<tr><td>Stalni troškovi</td><td>${fmt(ca.fix)}</td><td>${fmt(cb.fix)}</td><td>${diff(ca.fix, cb.fix)}</td></tr>`;
  const ta = ca.vr + ca.fix, tb = cb.vr + cb.fix;
  h += `<tr class="sum"><td>Ukupno potrošeno</td><td>${fmt(ta)}</td><td>${fmt(tb)}</td><td>${diff(ta, tb)}</td></tr>`;
  $("rep").innerHTML = h;
  const d = ca.vr - cb.vr;
  const ups = rows.filter((r) => r.x > r.y).sort((p, q) => (q.x - q.y) - (p.x - p.y));
  const downs = rows.filter((r) => r.x < r.y).sort((p, q) => (p.x - p.y) - (q.x - q.y));
  let v = Math.abs(d) < 0.005 ? "Ostali troškovi su isti kao prošlog meseca." : `Na ostale troškove potrošeno je ${fmt(Math.abs(d))} ${d > 0 ? "više" : "manje"} nego prošlog meseca.`;
  if (ups[0]) v += ` Najveći rast: ${ups[0].k.name}.`;
  if (downs[0]) v += ` Najveća ušteda: ${downs[0].k.name}.`;
  if (!isClosed(cur)) v += " Ovaj mesec je još otvoren, pa se poređenje menja sa svakim unosom.";
  $("verdict").textContent = v;
}

// ---------- Akcije ----------
$("prev").onclick = () => { cur = shiftMonth(cur, -1); $("vDate").value = ""; render(); };
$("next").onclick = () => { cur = shiftMonth(cur, 1); $("vDate").value = ""; render(); };

$("salary").addEventListener("change", (e) => {
  const val = parse(e.target.value);
  act(async () => {
    const m = await ensureMonth(cur);
    monthRecs[cur] = await pb.collection("months").update(m.id, { salary: val });
    await syncFreeze();
  });
});

$("exAdd").onclick = () => {
  const a = parse($("exAmt").value), n = $("exName").value.trim() || "Dodatni prihod";
  if (!a) return $("exAmt").focus();
  act(async () => {
    const m = await ensureMonth(cur);
    const extra = Array.isArray(m.extra) ? [...m.extra] : [];
    extra.push({ name: n, amount: a });
    await pb.collection("months").update(m.id, { extra });
    $("exAmt").value = $("exName").value = "";
  });
};

$("fxAdd").onclick = () => {
  const a = parse($("fxAmt").value), n = $("fxName").value.trim();
  if (!n) return $("fxName").focus();
  if (!a) return $("fxAmt").focus();
  act(async () => {
    await pb.collection("fixed_costs").create({ name: n, amount: a });
    $("fxAmt").value = $("fxName").value = "";
  });
};

$("vAdd").onclick = () => {
  const a = parse($("vAmt").value);
  if (!a) return $("vAmt").focus();
  const date = $("vDate").value || defaultDate();
  const u = pb.authStore.record;
  act(async () => {
    await pb.collection("expenses").create({
      month: cur, date: date + " 12:00:00.000Z", amount: a, cat: selCat,
      note: $("vNote").value.trim(), by: u?.name || (u?.email || "").split("@")[0],
    });
    $("vAmt").value = $("vNote").value = "";
  });
};
$("vAmt").addEventListener("keydown", (e) => { if (e.key === "Enter") $("vAdd").click(); });

document.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.cat) { selCat = b.dataset.cat; render(); return; }
  if (b.dataset.f) act(() => pb.collection("fixed_costs").delete(b.dataset.f));
  if (b.dataset.v) act(() => pb.collection("expenses").delete(b.dataset.v));
  if (b.dataset.x !== undefined) act(async () => {
    const m = monthRecs[cur]; if (!m) return;
    const extra = [...(m.extra || [])]; extra.splice(+b.dataset.x, 1);
    await pb.collection("months").update(m.id, { extra });
  });
});

// ---------- Nalozi (samo administrator aplikacije) ----------
const isAdmin = () => !!pb.authStore.record?.is_admin;
let pendingDelete = null;

async function renderAccounts() {
  $("accounts").hidden = !isAdmin();
  if (!isAdmin()) return;
  try {
    const users = await pb.collection("users").getFullList({ sort: "created" });
    const me = pb.authStore.record.id;
    $("userList").innerHTML = users.map((u) => `<div class="item"><span class="grow">${esc(u.name || "Bez imena")}${u.is_admin ? '<span class="tag">admin</span>' : ""}${u.email ? `<small>${esc(u.email)}</small>` : ""}</span>${u.id === me ? '<span class="hint">ti</span>' : `<button type="button" class="del${pendingDelete === u.id ? " confirm" : ""}" data-u="${u.id}" aria-label="Obriši nalog ${esc(u.name || u.email)}">${pendingDelete === u.id ? "Obriši?" : "✕"}</button>`}</div>`).join("");
  } catch (err) { handleError(err); }
}

$("uAdd").onclick = async () => {
  $("uErr").textContent = "";
  const name = $("uName").value.trim(), email = $("uEmail").value.trim(), pass = $("uPass").value;
  if (!email) return $("uEmail").focus();
  if (pass.length < 8) { $("uErr").textContent = "Lozinka mora imati najmanje 8 znakova."; return $("uPass").focus(); }
  try {
    await pb.collection("users").create({ name, email, password: pass, passwordConfirm: pass, emailVisibility: true, is_admin: $("uAdmin").checked });
    $("uName").value = $("uEmail").value = $("uPass").value = ""; $("uAdmin").checked = false;
    setStatus("Nalog napravljen"); setTimeout(() => setStatus(""), 2000);
    renderAccounts();
  } catch (err) {
    const d = err?.response?.data || {};
    $("uErr").textContent = d.email ? "Taj email je neispravan ili već postoji." : d.password ? "Lozinka nije prihvaćena (najmanje 8 znakova)." : "Nalog nije napravljen. Pokušaj ponovo.";
  }
};

document.addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-u]"); if (!b) return;
  const id = b.dataset.u;
  if (pendingDelete !== id) { pendingDelete = id; renderAccounts(); setTimeout(() => { if (pendingDelete === id) { pendingDelete = null; renderAccounts(); } }, 4000); return; }
  pendingDelete = null;
  try { await pb.collection("users").delete(id); setStatus("Nalog obrisan"); setTimeout(() => setStatus(""), 2000); }
  catch (err) { handleError(err); }
  renderAccounts();
});

// ---------- Prijava i uživo osvežavanje ----------
let liveTimer = null;
const liveRefresh = () => { clearTimeout(liveTimer); liveTimer = setTimeout(() => { if (!busy) refresh(); }, 300); };

async function startLive() {
  try {
    for (const c of ["fixed_costs", "months", "expenses"]) await pb.collection(c).subscribe("*", liveRefresh);
  } catch (err) { console.warn("Realtime nije dostupan", err); }
}

function showLogin() {
  pb.realtime.unsubscribe().catch(() => {});
  $("app").hidden = true; $("login").hidden = false; $("lEmail").focus();
}

async function showApp() {
  const u = pb.authStore.record;
  $("whoName").textContent = u?.name || u?.email || "";
  $("login").hidden = true; $("app").hidden = false;
  setStatus("Učitavam…");
  try { await loadAll(); await syncFreeze(); render(); setStatus(""); startLive(); renderAccounts(); }
  catch (err) { handleError(err); }
}

$("login").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("lErr").textContent = "";
  try {
    await pb.collection("users").authWithPassword($("lEmail").value.trim(), $("lPass").value);
    $("lPass").value = "";
    showApp();
  } catch (err) {
    $("lErr").textContent = err?.status === 400 ? "Pogrešan email ili lozinka." : "Server nije dostupan. Pokušaj ponovo.";
  }
});

$("logout").onclick = () => { pb.authStore.clear(); showLogin(); };

// Osveži podatke kad se aplikacija vrati u fokus (npr. sa početnog ekrana telefona)
document.addEventListener("visibilitychange", () => { if (!document.hidden && pb.authStore.isValid) refresh(); });

(async () => {
  if (pb.authStore.isValid) {
    try { await pb.collection("users").authRefresh(); return showApp(); }
    catch (_) { pb.authStore.clear(); }
  }
  showLogin();
})();
