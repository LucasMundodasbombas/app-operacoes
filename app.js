/* Operações Mundo das Bombas: app de Veículos e Estoque.
   Dados no Supabase (config.js). Sem configuração, roda em modo demonstração com os dados só neste aparelho. */
(function () {
"use strict";

const CFG = window.APP_CONFIG || {};
const DEMO = !CFG.supabaseUrl || !CFG.supabaseKey;
// O Supabase entra com e-mail. O usuário digita só o nome de usuário; o app completa com um domínio fixo.
const EMAIL_DOM = "login.mundodasbombasgo.com.br";
const toEmail = u => u.trim().toLowerCase() + "@" + EMAIL_DOM;
const TIPOS = ["Combustível", "Manutenção", "Pneus", "Pedágio", "Estacionamento", "Lavagem", "Multa", "Documentação / IPVA", "Seguro", "Outros"];
const SITUACOES = ["Entregue ao cliente", "Retirado na loja", "Saiu no veículo da loja", "Enviado por transportadora"];
const FUNCOES = { gerente: "Gerente", estoque: "Estoque", motorista: "Motorista" };
const AREAS = {
  veiculos: { label: "Veículos", tabs: [["v-entregas", "Entregas do dia", ["gerente", "motorista"]], ["v-abast", "Abastecimento e gastos", ["gerente", "motorista"]], ["v-motoristas", "Motoristas", ["gerente"]], ["v-veiculos", "Veículos", ["gerente"]], ["v-rel", "Relatório", ["gerente"]]] },
  estoque: { label: "Estoque", tabs: [["e-saida", "Registrar saída", ["gerente", "estoque"]], ["e-historico", "Histórico", ["gerente", "estoque"]]] },
  equipe: { label: "Equipe", small: true, tabs: [["equipe", "Equipe e logins", ["gerente"]]] }
};

/* ================= utilidades ================= */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const today = () => ymd(new Date());
const nowHM = () => { const d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
const thisMonth = () => today().slice(0, 7);
const shiftDay = (s, n) => { const [y, m, d] = s.split("-").map(Number); return ymd(new Date(y, m - 1, d + n)); };
const monthRange = m => { const [y, mm] = m.split("-").map(Number); return [m + "-01", ymd(new Date(y, mm, 0))]; };
const fmtD = s => { if (!s) return ""; const [y, m, d] = s.slice(0, 10).split("-"); return d + "/" + m + "/" + y; };
const fmtDia = s => { if (!s) return ""; const [y, m, d] = s.split("-"); return new Date(+y, +m - 1, +d).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }); };
const fmtDiaC = s => { if (!s) return ""; const [y, m, d] = s.split("-"); return new Date(+y, +m - 1, +d).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }); };
const monthName = m => { const [y, mm] = m.split("-"); return new Date(+y, +mm - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); };
const hm = t => (t || "").slice(0, 5);
const brl = v => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v, d = 0) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id" + Date.now() + Math.random().toString(16).slice(2));
let toastT; function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3200); }
function msgErro(e) {
  const m = String((e && (e.message || e.error_description)) || e || "");
  if (e && e.code === "denied") return "Só o gerente pode alterar ou excluir.";
  if (/Invalid login credentials/i.test(m)) return "Usuário ou senha errados.";
  if (/already registered|already exists|duplicate key.*usuario|perfis_usuario_key/i.test(m)) return "Esse usuário já existe. Escolha outro nome.";
  if (/row-level security|permission denied|42501/i.test(m) || (e && e.code === "42501")) return "Você não tem permissão para isso.";
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "Sem internet. Confira a conexão e tente de novo.";
  if (/Password should be at least|at least 6/i.test(m)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/Email not confirmed/i.test(m)) return "Login ainda não confirmado. No Supabase, desligue “Confirm email” (veja o guia).";
  if (/signups not allowed|Signups not allowed/i.test(m)) return "No Supabase, ligue “Allow new users to sign up” (veja o guia).";
  return m || "Não deu certo. Tente de novo.";
}
let busy = false;
async function guard(fn, btn) {
  if (busy) return; busy = true; if (btn) btn.disabled = true;
  try { await fn(); } catch (e) { console.error(e); toast(msgErro(e)); } finally { busy = false; if (btn) btn.disabled = false; }
}
async function shrink(file, max = 1600, q = .82) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(b => r(b || file), "image/jpeg", q));
  } catch (e) { return file; }
}

/* ================= banco: Supabase ================= */
function supabaseBackend() {
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
  const ok = r => { if (r.error) throw r.error; return r.data; };
  return {
    async temSessao() { return !!ok(await sb.auth.getSession()).session; },
    async login(u, p) { ok(await sb.auth.signInWithPassword({ email: toEmail(u), password: p })); },
    async sair() { await sb.auth.signOut(); },
    async meuPerfil() {
      const { data: { user } } = await sb.auth.getUser(); if (!user) return null;
      return ok(await sb.from("perfis").select("*").eq("id", user.id).maybeSingle());
    },
    async existeGerente() { return ok(await sb.rpc("existe_gerente")); },
    async primeiroGerente(u, nome, p) {
      const r = await sb.auth.signUp({ email: toEmail(u), password: p });
      if (r.error && !/already registered/i.test(r.error.message)) throw r.error;
      if (!r.data || !r.data.session) ok(await sb.auth.signInWithPassword({ email: toEmail(u), password: p }));
      ok(await sb.rpc("primeiro_gerente", { p_usuario: u.trim().toLowerCase(), p_nome: nome }));
    },
    async trocarSenha(p) { ok(await sb.auth.updateUser({ password: p })); },
    async select(t, q = {}) {
      let r = sb.from(t).select(q.cols || "*");
      for (const [k, v] of Object.entries(q.eq || {})) r = r.eq(k, v);
      for (const [k, v] of Object.entries(q.gte || {})) r = r.gte(k, v);
      for (const [k, v] of Object.entries(q.lte || {})) r = r.lte(k, v);
      for (const [k, v] of Object.entries(q.lt || {})) r = r.lt(k, v);
      if (q.notNull) r = r.not(q.notNull, "is", null);
      if (q.search) r = r.or(q.search.cols.map(c => `${c}.ilike.%${q.search.text}%`).join(","));
      for (const o of [].concat(q.order || [])) r = r.order(o.replace(/^-/, ""), { ascending: !o.startsWith("-") });
      if (q.limit) r = r.limit(q.limit);
      return ok(await r);
    },
    async insert(t, row) { return ok(await sb.from(t).insert(row).select().single()); },
    async update(t, id, patch) { const d = ok(await sb.from(t).update(patch).eq("id", id).select()); if (!d.length) throw { code: "denied" }; return d[0]; },
    async remove(t, id) { const d = ok(await sb.from(t).delete().eq("id", id).select()); if (!d.length) throw { code: "denied" }; },
    async upload(path, blob) { ok(await sb.storage.from("fotos").upload(path, blob, { contentType: "image/jpeg", upsert: false })); return path; },
    async urls(paths) {
      if (!paths.length) return {};
      const d = ok(await sb.storage.from("fotos").createSignedUrls(paths, 3600));
      const m = {}; d.forEach(x => { if (x.signedUrl) m[x.path] = x.signedUrl; }); return m;
    },
    async removerFotos(paths) { if (paths.length) await sb.storage.from("fotos").remove(paths); },
    async criarLogin(u, nome, p, funcao) {
      // Um cliente separado cria a conta sem derrubar a sessão do gerente.
      const tmp = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "criar-" + Date.now() } });
      const r = await tmp.auth.signUp({ email: toEmail(u), password: p });
      if (r.error) throw r.error;
      const user = r.data && r.data.user;
      if (!user || (user.identities && user.identities.length === 0)) throw new Error("already registered");
      try { await tmp.auth.signOut({ scope: "local" }); } catch (e) {}
      ok(await sb.from("perfis").insert({ id: user.id, usuario: u.trim().toLowerCase(), nome, funcao }));
    },
    async redefinirSenha(id, p) { ok(await sb.rpc("redefinir_senha", { p_id: id, p_senha: p })); }
  };
}

/* ================= banco: demonstração (neste aparelho) ================= */
function demoBackend() {
  const KEY = "ops-demo-v1";
  let db; try { db = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { db = null; }
  db = db || { users: [], perfis: [], veiculos: [], motoristas: [], entregas: [], gastos: [], saidas: [], fotos: {}, sess: null };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast("O armazenamento deste aparelho encheu. No app de verdade as fotos vão para a nuvem."); } };
  const me = () => db.perfis.find(p => p.id === db.sess && p.ativo);
  const role = () => (me() || {}).funcao;
  const ver = { perfis: () => !!role(), veiculos: () => ["gerente", "motorista"].includes(role()), motoristas: () => ["gerente", "motorista"].includes(role()), entregas: () => ["gerente", "motorista"].includes(role()), gastos: () => ["gerente", "motorista"].includes(role()), saidas: () => ["gerente", "estoque"].includes(role()) };
  const criar = { perfis: () => role() === "gerente", veiculos: () => role() === "gerente", motoristas: () => role() === "gerente", entregas: ver.entregas, gastos: ver.gastos, saidas: ver.saidas };
  const deny = () => { throw { message: "row-level security" }; };
  return {
    async temSessao() { return !!db.sess; },
    async login(u, p) { const x = db.users.find(x => x.usuario === u.trim().toLowerCase() && x.senha === p); if (!x) throw new Error("Invalid login credentials"); db.sess = x.id; save(); },
    async sair() { db.sess = null; save(); },
    async meuPerfil() { return db.perfis.find(p => p.id === db.sess) || null; },
    async existeGerente() { return db.perfis.some(p => p.funcao === "gerente" && p.ativo); },
    async primeiroGerente(u, nome, p) { if (db.perfis.some(p => p.funcao === "gerente")) throw new Error("Já existe um gerente."); const id = uid(); db.users.push({ id, usuario: u.trim().toLowerCase(), senha: p }); db.perfis.push({ id, usuario: u.trim().toLowerCase(), nome, funcao: "gerente", ativo: true, criado_em: new Date().toISOString() }); db.sess = id; save(); },
    async trocarSenha(p) { const x = db.users.find(x => x.id === db.sess); if (x) x.senha = p; save(); },
    async select(t, q = {}) {
      if (!ver[t] || !ver[t]()) return [];
      let r = db[t].slice();
      for (const [k, v] of Object.entries(q.eq || {})) r = r.filter(x => x[k] === v);
      for (const [k, v] of Object.entries(q.gte || {})) r = r.filter(x => x[k] != null && x[k] >= v);
      for (const [k, v] of Object.entries(q.lte || {})) r = r.filter(x => x[k] != null && x[k] <= v);
      for (const [k, v] of Object.entries(q.lt || {})) r = r.filter(x => x[k] != null && x[k] < v);
      if (q.notNull) r = r.filter(x => x[q.notNull] != null);
      if (q.search) { const s = q.search.text.toLowerCase(); r = r.filter(x => q.search.cols.some(c => String(x[c] || "").toLowerCase().includes(s))); }
      for (const o of [].concat(q.order || []).reverse()) { const k = o.replace(/^-/, ""), d = o.startsWith("-") ? -1 : 1; r.sort((a, b) => (String(a[k] ?? "") > String(b[k] ?? "") ? d : String(a[k] ?? "") < String(b[k] ?? "") ? -d : 0)); }
      if (q.limit) r = r.slice(0, q.limit);
      return JSON.parse(JSON.stringify(r));
    },
    async insert(t, row) {
      if (!criar[t] || !criar[t]()) deny();
      if (t === "veiculos" && db.veiculos.some(v => v.placa === row.placa)) throw new Error("Essa placa já está cadastrada.");
      const r = { id: uid(), criado_em: new Date().toISOString(), ativo: true, ...row };
      if (["entregas", "gastos", "saidas"].includes(t)) r.criado_por = db.sess;
      db[t].push(r); save(); return r;
    },
    async update(t, id, patch) { if (role() !== "gerente") throw { code: "denied" }; const r = db[t].find(x => x.id === id); if (!r) throw { code: "denied" }; Object.assign(r, patch); save(); return r; },
    async remove(t, id) { if (role() !== "gerente") throw { code: "denied" }; const n = db[t].length; db[t] = db[t].filter(x => x.id !== id); if (db[t].length === n) throw { code: "denied" }; save(); },
    async upload(path, blob) {
      const small = await shrink(blob, 700, .6);
      db.fotos[path] = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(small); });
      save(); return path;
    },
    async urls(paths) { const m = {}; paths.forEach(p => { if (db.fotos[p]) m[p] = db.fotos[p]; }); return m; },
    async removerFotos(paths) { paths.forEach(p => delete db.fotos[p]); save(); },
    async criarLogin(u, nome, p, funcao) {
      if (role() !== "gerente") deny();
      const us = u.trim().toLowerCase(); if (db.users.some(x => x.usuario === us)) throw new Error("already registered");
      const id = uid(); db.users.push({ id, usuario: us, senha: p }); db.perfis.push({ id, usuario: us, nome, funcao, ativo: true, criado_em: new Date().toISOString() }); save();
    },
    async redefinirSenha(id, p) { if (role() !== "gerente") deny(); const x = db.users.find(x => x.id === id); if (x) x.senha = p; save(); }
  };
}

const api = DEMO ? demoBackend() : supabaseBackend();

/* ================= estado ================= */
const S = { me: null, area: null, view: null, veiculos: [], motoristas: [], perfis: [], urls: {}, shots: [], cache: {} };
const isG = () => S.me && S.me.funcao === "gerente";
const can = roles => S.me && (S.me.funcao === "gerente" || roles.includes(S.me.funcao));
const veic = id => S.veiculos.find(v => v.id === id);
const mot = id => S.motoristas.find(m => m.id === id);
const pnome = id => (S.perfis.find(p => p.id === id) || {}).nome || "—";
const vname = v => v ? (v.apelido || v.modelo) : "Veículo removido";
const plate = v => `<span class="plate"><i></i><b>${esc(v ? v.placa : "—")}</b></span>`;
const emptyBox = (t, s) => `<div class="empty"><strong>${t}</strong>${s}</div>`;
const kpis = rows => rows.map(([a, b, c]) => `<div class="kpi"><span>${a}</span><strong>${b}</strong><em>${c}</em></div>`).join("");
const delBtn = (t, id, label = "Excluir") => isG() ? `<button class="btn sm danger" type="button" data-del="${t}" data-id="${id}">${label}</button>` : "";
const editBtn = (t, id) => isG() ? `<button class="btn sm ghost" type="button" data-edit="${t}" data-id="${id}">Alterar</button>` : "";
function bars(el, rows, fmt) {
  const max = Math.max(0, ...rows.map(r => r[1]));
  el.innerHTML = rows.length ? rows.map(([k, v]) => `<div class="bar"><span title="${esc(k)}">${esc(k)}</span><div class="track"><div class="fill" style="width:${max ? Math.max(2, v / max * 100) : 0}%"></div></div><span class="v">${fmt(v)}</span></div>`).join("") : `<p class="hint">Sem dados neste mês.</p>`;
}
async function loadUrls(paths) {
  const need = [...new Set(paths.filter(p => p && !S.urls[p]))];
  if (need.length) { try { Object.assign(S.urls, await api.urls(need)); } catch (e) { console.error(e); } }
}
const fotoUrl = p => S.urls[p] || "";

/* ================= telas de entrada ================= */
function show(id) { ["boot", "tela-login", "tela-primeiro", "app"].forEach(x => ($(x).hidden = x !== id)); }
async function boot() {
  if (DEMO) { const b = $("banner"); b.hidden = false; b.textContent = "Modo demonstração: os dados ficam só neste aparelho. Depois de ligar o Supabase (config.js), tudo passa a ficar na nuvem."; }
  try {
    if (await api.temSessao()) {
      S.me = await api.meuPerfil();
      if (S.me && S.me.ativo) return entrar();
      await api.sair();
      if (S.me && !S.me.ativo) { S.me = null; show("tela-login"); erroLogin("Seu acesso foi desativado. Fale com o gerente."); return; }
    }
    show((await api.existeGerente()) ? "tela-login" : "tela-primeiro");
  } catch (e) { console.error(e); show("tela-login"); erroLogin(msgErro(e)); }
}
function erroLogin(m) { const e = $("l-erro"); e.textContent = m; e.hidden = !m; }
$("f-login").addEventListener("submit", e => {
  e.preventDefault(); erroLogin("");
  guard(async () => {
    try { await api.login($("l-user").value, $("l-pass").value); } catch (x) { erroLogin(msgErro(x)); return; }
    S.me = await api.meuPerfil();
    if (!S.me || !S.me.ativo) { await api.sair(); erroLogin(S.me ? "Seu acesso foi desativado. Fale com o gerente." : "Este login ainda não tem função. Peça ao gerente."); S.me = null; return; }
    $("l-pass").value = ""; entrar();
  }, e.submitter);
});
$("f-primeiro").addEventListener("submit", e => {
  e.preventDefault(); const er = $("pg-erro"); er.hidden = true;
  if ($("pg-pass").value !== $("pg-pass2").value) { er.textContent = "As duas senhas estão diferentes."; er.hidden = false; return; }
  guard(async () => {
    try { await api.primeiroGerente($("pg-user").value, $("pg-nome").value.trim(), $("pg-pass").value); }
    catch (x) { er.textContent = msgErro(x); er.hidden = false; return; }
    S.me = await api.meuPerfil(); entrar(); toast("Gerente criado. Agora cadastre os veículos e a equipe.");
  }, e.submitter);
});

async function entrar() {
  show("app");
  $("me-nome").textContent = S.me.nome; $("me-funcao").textContent = FUNCOES[S.me.funcao] || "";
  await carregarBase();
  let v = null; try { v = localStorage.getItem("ops-view"); } catch (e) {}
  go(v || "");
}
async function carregarBase() {
  const [perfis, veiculos, motoristas] = await Promise.all([
    api.select("perfis", { order: "nome" }).catch(() => []),
    can(["motorista"]) ? api.select("veiculos", { order: "placa" }).catch(() => []) : [],
    can(["motorista"]) ? api.select("motoristas", { order: "nome" }).catch(() => []) : []
  ]);
  S.perfis = perfis; S.veiculos = veiculos; S.motoristas = motoristas;
}
$("me").addEventListener("click", e => { e.stopPropagation(); $("menu").hidden = !$("menu").hidden; });
document.addEventListener("click", e => { if (!e.target.closest("#menu")) $("menu").hidden = true; });
$("m-sair").addEventListener("click", () => guard(async () => { await api.sair(); try { localStorage.removeItem("ops-view"); } catch (e) {} location.reload(); }));
$("m-senha").addEventListener("click", () => {
  $("menu").hidden = true;
  openSheet(`<h3>Trocar minha senha</h3><form id="f-trocar"><label>Nova senha<input id="ts-1" type="password" minlength="6" required autocomplete="new-password"></label><label>Repita a nova senha<input id="ts-2" type="password" minlength="6" required autocomplete="new-password"></label><div class="actions"><button class="btn" type="submit">Salvar</button><button class="btn ghost" type="button" data-close>Cancelar</button></div></form>`);
  $("f-trocar").addEventListener("submit", ev => { ev.preventDefault(); if ($("ts-1").value !== $("ts-2").value) { toast("As duas senhas estão diferentes."); return; } guard(async () => { await api.trocarSenha($("ts-1").value); closeSheet(); toast("Senha trocada."); }, ev.submitter); });
});

/* ================= navegação ================= */
const allowedTabs = a => AREAS[a].tabs.filter(t => can(t[2]));
const allowedAreas = () => Object.keys(AREAS).filter(a => allowedTabs(a).length);
function go(view) {
  const areas = allowedAreas(); if (!areas.length) return;
  let area = Object.keys(AREAS).find(a => AREAS[a].tabs.some(t => t[0] === view));
  if (!area || !areas.includes(area)) area = areas.includes(S.area) ? S.area : areas[0];
  const tabs = allowedTabs(area); if (!tabs.some(t => t[0] === view)) view = tabs[0][0];
  S.area = area; S.view = view;
  document.querySelectorAll("section[data-view]").forEach(s => (s.hidden = s.dataset.view !== view));
  $("areas").innerHTML = areas.map(a => `<button type="button" data-area="${a}" class="${AREAS[a].small ? "small" : ""}" aria-current="${a === area}">${AREAS[a].label}</button>`).join("");
  $("sub").innerHTML = tabs.map(([id, l]) => `<button type="button" data-view="${id}" aria-current="${id === view ? "page" : "false"}">${l}</button>`).join("");
  try { localStorage.setItem("ops-view", view); } catch (e) {}
  window.scrollTo(0, 0); render();
}
$("areas").addEventListener("click", e => { const b = e.target.closest("[data-area]"); if (b) go(allowedTabs(b.dataset.area)[0][0]); });
$("sub").addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (b) go(b.dataset.view); });
document.addEventListener("click", e => { const b = e.target.closest("[data-goview]"); if (b) go(b.dataset.goview); });
document.addEventListener("click", e => { const b = e.target.closest("[data-shift]"); if (!b) return; const i = $(b.dataset.shift); i.value = shiftDay(i.value || today(), +b.dataset.n); if (b.dataset.shift === "hi-dia") $("hi-busca").value = ""; render(); });
const RENDER = { "v-entregas": rEntregas, "v-abast": rAbast, "v-motoristas": rMotoristas, "v-veiculos": rVeiculos, "v-rel": rRel, "e-saida": rSaida, "e-historico": rHistorico, "equipe": rEquipe };
function render() { const f = RENDER[S.view]; if (f) f().catch(e => { console.error(e); toast(msgErro(e)); }); }

/* ================= selects ================= */
function setOptions(sel, html, keep = true) { const cur = sel.value; sel.innerHTML = html; if (keep && [...sel.options].some(o => o.value === cur)) sel.value = cur; }
function veiculoOptions(sel) { const l = S.veiculos.filter(v => v.ativo !== false); setOptions(sel, (l.length ? "" : `<option value="">Cadastre um veículo primeiro</option>`) + l.map(v => `<option value="${v.id}">${esc(v.placa)} · ${esc(vname(v))}</option>`).join("")); }
function motoristaOptions(sel, blank) {
  const l = S.motoristas.filter(m => m.ativo !== false);
  setOptions(sel, (blank ? `<option value="">—</option>` : l.length ? "" : `<option value="">Cadastre um motorista primeiro</option>`) + l.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join(""));
  const mine = l.find(m => m.usuario_id && S.me && m.usuario_id === S.me.id);
  if (mine && !sel.dataset.touched) sel.value = mine.id;
}
["en-motorista", "g-motorista"].forEach(i => $(i).addEventListener("change", () => ($(i).dataset.touched = "1")));
async function sugestoes() {
  if (S.cache.sug) return;
  S.cache.sug = true;
  const clientes = new Set(), destinos = new Set();
  try {
    if (can(["motorista"])) (await api.select("entregas", { cols: "destino,cliente", order: "-criado_em", limit: 400 })).forEach(r => { if (r.destino) destinos.add(r.destino); if (r.cliente) clientes.add(r.cliente); });
    if (can(["estoque"])) (await api.select("saidas", { cols: "cliente", order: "-criado_em", limit: 400 })).forEach(r => r.cliente && clientes.add(r.cliente));
  } catch (e) {}
  $("dl-clientes").innerHTML = [...clientes].sort().map(c => `<option value="${esc(c)}">`).join("");
  $("dl-destinos").innerHTML = [...destinos].sort().map(c => `<option value="${esc(c)}">`).join("");
}

/* ================= VEÍCULOS: entregas do dia ================= */
$("en-data").value = today(); $("en-hora").value = nowHM(); $("en-dia").value = today();
$("en-dia").addEventListener("change", render);
async function rEntregas() {
  veiculoOptions($("en-veiculo")); motoristaOptions($("en-motorista")); sugestoes();
  const dia = $("en-dia").value || today();
  const l = await api.select("entregas", { eq: { data: dia }, order: ["hora", "criado_em"] });
  const g = {}; l.forEach(e => (g[e.motorista_id || ""] = g[e.motorista_id || ""] || []).push(e));
  const nv = new Set(l.map(e => e.veiculo_id)).size;
  $("en-resumo").textContent = `${fmtDia(dia)} · ${l.length} entrega(s) · ${Object.keys(g).length} motorista(s) · ${nv} veículo(s)`;
  $("en-list").innerHTML = l.length ? Object.entries(g).map(([m, es]) => `<div class="group"><div class="group-head"><h4>${esc(mot(m) ? mot(m).nome : "Sem motorista")}</h4><span class="hint">${es.length} entrega(s)</span></div>${es.map(e => `<div class="item">${plate(veic(e.veiculo_id))}<div class="info"><strong>${esc(e.destino)}</strong><span class="meta">${e.hora ? hm(e.hora) + " · " : ""}${e.cliente ? esc(e.cliente) : "Sem cliente"}${e.nf ? " · NF " + esc(e.nf) : ""}</span>${e.obs ? `<span class="meta">${esc(e.obs)}</span>` : ""}<span class="meta">Lançado por ${esc(pnome(e.criado_por))}</span></div><div class="actions">${editBtn("entregas", e.id)}${delBtn("entregas", e.id)}</div></div>`).join("")}</div>`).join("") : emptyBox("Nenhuma entrega lançada neste dia", "Use o formulário para lançar uma por uma.");
  S.cache.entregas = l;
}
$("f-entrega").addEventListener("submit", e => {
  e.preventDefault();
  guard(async () => {
    if (!$("en-veiculo").value || !$("en-motorista").value) { toast("Escolha o veículo e o motorista."); return; }
    await api.insert("entregas", { data: $("en-data").value, hora: $("en-hora").value || null, veiculo_id: $("en-veiculo").value, motorista_id: $("en-motorista").value, destino: $("en-destino").value.trim(), cliente: $("en-cliente").value.trim() || null, nf: $("en-nf").value.trim() || null, obs: $("en-obs").value.trim() || null });
    ["en-destino", "en-cliente", "en-nf", "en-obs"].forEach(i => ($(i).value = "")); $("en-hora").value = nowHM();
    $("en-dia").value = $("en-data").value; S.cache.sug = false; toast("Entrega lançada. Pode lançar a próxima."); $("en-destino").focus(); render();
  }, e.submitter);
});

/* ================= VEÍCULOS: abastecimento e gastos ================= */
$("g-tipo").innerHTML = TIPOS.map(t => `<option>${t}</option>`).join(""); $("g-data").value = today(); $("g-mes").value = thisMonth();
const toggleComb = () => ($("g-comb").hidden = $("g-tipo").value !== "Combustível"); $("g-tipo").addEventListener("change", toggleComb); toggleComb();
$("g-foto").addEventListener("change", () => ($("g-foto-n").textContent = $("g-foto").files[0] ? "Foto escolhida" : ""));
$("g-mes").addEventListener("change", render);
async function rAbast() {
  veiculoOptions($("g-veiculo")); motoristaOptions($("g-motorista"), true);
  const m = $("g-mes").value || thisMonth(); const [a, b] = monthRange(m);
  const l = await api.select("gastos", { gte: { data: a }, lte: { data: b }, order: ["-data", "-criado_em"] });
  await loadUrls(l.map(g => g.foto));
  const tot = l.reduce((s, g) => s + (Number(g.valor) || 0), 0);
  $("g-list").innerHTML = l.length ? `<p class="hint">${l.length} lançamento(s) · total <strong class="mono">${brl(tot)}</strong></p>` + l.map(g => `<div class="item">${plate(veic(g.veiculo_id))}<div class="info"><strong>${esc(g.tipo)} · <span class="mono">${brl(g.valor)}</span></strong><span class="meta">${fmtD(g.data)}${g.litros ? " · " + num(g.litros, 2) + " L" : ""}${g.km ? " · km " + num(g.km) : ""}${g.fornecedor ? " · " + esc(g.fornecedor) : ""}${g.motorista_id ? " · " + esc((mot(g.motorista_id) || {}).nome || "") : ""}</span>${g.descricao ? `<span class="meta">${esc(g.descricao)}</span>` : ""}${g.foto && fotoUrl(g.foto) ? `<div class="photos"><a href="${fotoUrl(g.foto)}" target="_blank" rel="noopener"><img src="${fotoUrl(g.foto)}" alt="Cupom"></a></div>` : ""}</div><div class="actions">${editBtn("gastos", g.id)}${delBtn("gastos", g.id)}</div></div>`).join("") : emptyBox("Nada lançado em " + monthName(m), "Lance abastecimentos e outros gastos no formulário.");
}
$("f-gasto").addEventListener("submit", e => {
  e.preventDefault();
  guard(async () => {
    if (!$("g-veiculo").value) { toast("Cadastre um veículo primeiro."); return; }
    const comb = $("g-tipo").value === "Combustível"; let foto = null; const f = $("g-foto").files[0];
    if (f) { toast("Enviando foto…"); foto = await api.upload(`gastos/${$("g-data").value}/${uid()}.jpg`, await shrink(f)); }
    await api.insert("gastos", { data: $("g-data").value, veiculo_id: $("g-veiculo").value, motorista_id: $("g-motorista").value || null, tipo: $("g-tipo").value, valor: Number($("g-valor").value) || 0, litros: comb ? (Number($("g-litros").value) || null) : null, km: comb ? (Number($("g-km").value) || null) : null, fornecedor: $("g-fornecedor").value.trim() || null, descricao: $("g-desc").value.trim() || null, foto });
    ["g-valor", "g-litros", "g-km", "g-desc", "g-fornecedor", "g-foto"].forEach(i => ($(i).value = "")); $("g-foto-n").textContent = "";
    $("g-mes").value = $("g-data").value.slice(0, 7); toast("Lançamento salvo."); render();
  }, e.submitter);
});

/* ================= VEÍCULOS: motoristas ================= */
function cnhPill(m) { if (!m.cnh_validade) return ""; if (m.cnh_validade < today()) return `<span class="pill bad">CNH vencida</span>`; return m.cnh_validade <= shiftDay(today(), 30) ? `<span class="pill warn">CNH vence logo</span>` : ""; }
async function rMotoristas() {
  setOptions($("mo-user"), `<option value="">Sem login</option>` + S.perfis.filter(p => p.funcao === "motorista" && p.ativo).map(p => `<option value="${p.id}">${esc(p.nome)} (${esc(p.usuario)})</option>`).join(""));
  const l = S.motoristas.filter(m => m.ativo !== false);
  $("mo-list").innerHTML = l.length ? l.map(m => `<div class="item"><div class="info"><strong>${esc(m.nome)} ${cnhPill(m)}</strong><span class="meta">${m.telefone ? esc(m.telefone) + " · " : ""}CNH ${esc(m.cnh || "—")} ${esc(m.categoria || "")}${m.cnh_validade ? " · válida até " + fmtD(m.cnh_validade) : ""}</span><span class="meta">${m.usuario_id ? "Login: " + esc(pnome(m.usuario_id)) : "Sem login ligado"}</span></div><div class="actions">${editBtn("motoristas", m.id)}${delBtn("motoristas", m.id, "Desativar")}</div></div>`).join("") : emptyBox("Nenhum motorista cadastrado", "Cadastre para escolher nas entregas e no abastecimento.");
}
$("f-motorista").addEventListener("submit", e => {
  e.preventDefault();
  guard(async () => {
    await api.insert("motoristas", { nome: $("mo-nome").value.trim(), telefone: $("mo-tel").value.trim() || null, cnh: $("mo-cnh").value.trim() || null, categoria: $("mo-cat").value, cnh_validade: $("mo-val").value || null, usuario_id: $("mo-user").value || null });
    e.target.reset(); await carregarBase(); toast("Motorista cadastrado."); render();
  }, e.submitter);
});

/* ================= VEÍCULOS: cadastro ================= */
async function rVeiculos() {
  const l = S.veiculos.filter(v => v.ativo !== false);
  let leituras = [];
  try { leituras = await api.select("gastos", { cols: "veiculo_id,km", notNull: "km", order: "-km", limit: 1000 }); } catch (e) {}
  const kmAt = id => Math.max(Number((veic(id) || {}).km_inicial) || 0, ...leituras.filter(g => g.veiculo_id === id).map(g => Number(g.km) || 0));
  $("ve-list").innerHTML = l.length ? l.map(v => `<div class="item">${plate(v)}<div class="info"><strong>${esc(vname(v))}</strong><span class="meta">${esc(v.modelo)} · último km anotado <span class="mono">${num(kmAt(v.id))}</span></span></div><div class="actions">${editBtn("veiculos", v.id)}${delBtn("veiculos", v.id, "Desativar")}</div></div>`).join("") : emptyBox("Nenhum veículo cadastrado", "Cadastre a placa, o modelo e o km do painel.");
}
$("f-veiculo").addEventListener("submit", e => {
  e.preventDefault();
  guard(async () => {
    const placa = $("ve-placa").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    await api.insert("veiculos", { placa, modelo: $("ve-modelo").value.trim(), apelido: $("ve-apelido").value.trim() || null, km_inicial: Number($("ve-km").value) || 0 });
    e.target.reset(); await carregarBase(); toast("Veículo " + placa + " cadastrado."); render();
  }, e.submitter);
});

/* ================= VEÍCULOS: relatório ================= */
$("vr-mes").value = thisMonth(); $("vr-mes").addEventListener("change", render);
async function dadosMes(m) {
  const [a, b] = monthRange(m);
  const [es, gs, antes] = await Promise.all([
    api.select("entregas", { gte: { data: a }, lte: { data: b }, order: ["data", "hora"] }),
    api.select("gastos", { gte: { data: a }, lte: { data: b }, order: ["data"] }),
    api.select("gastos", { cols: "veiculo_id,km", lt: { data: a }, notNull: "km", order: "-km", limit: 1000 })
  ]);
  const porV = S.veiculos.map(v => {
    const e = es.filter(x => x.veiculo_id === v.id), g = gs.filter(x => x.veiculo_id === v.id);
    const comb = g.filter(x => x.tipo === "Combustível");
    const leit = g.map(x => Number(x.km) || 0).filter(Boolean);
    const base = Math.max(Number(v.km_inicial) || 0, ...antes.filter(x => x.veiculo_id === v.id).map(x => Number(x.km) || 0));
    const km = leit.length ? Math.max(0, Math.max(...leit) - base) : 0;
    const litros = comb.reduce((s, x) => s + (Number(x.litros) || 0), 0);
    const combV = comb.reduce((s, x) => s + (Number(x.valor) || 0), 0), total = g.reduce((s, x) => s + (Number(x.valor) || 0), 0);
    return { v, entregas: e.length, km, litros, combV, total, kmL: litros && km ? km / litros : 0, rkm: km ? total / km : 0 };
  }).filter(r => r.v.ativo !== false || r.entregas || r.total);
  return { es, gs, porV };
}
async function rRel() {
  const m = $("vr-mes").value || thisMonth(); const d = await dadosMes(m);
  const T = k => d.porV.reduce((s, r) => s + r[k], 0);
  const km = T("km"), litros = T("litros"), total = T("total"), combV = T("combV");
  $("vr-kpis").innerHTML = kpis([["Entregas", num(d.es.length), monthName(m)], ["Km rodado", num(km) + " km", "pelo km do abastecimento"], ["Gasto total", brl(total), d.gs.length + " lançamento(s)"], ["Combustível", brl(combV), num(litros, 1) + " litros"], ["Consumo médio", litros && km ? num(km / litros, 1) + " km/L" : "—", "km ÷ litros"], ["Custo por km", km ? brl(total / km) : "—", "gastos ÷ km"]]);
  $("vr-pv").innerHTML = `<thead><tr><th>Placa</th><th>Veículo</th><th class="n">Entregas</th><th class="n">Km</th><th class="n">Litros</th><th class="n">Combustível</th><th class="n">Outros</th><th class="n">Total</th><th class="n">km/L</th><th class="n">R$/km</th></tr></thead><tbody>` + (d.porV.length ? d.porV.map(r => `<tr><td class="mono">${esc(r.v.placa)}</td><td>${esc(vname(r.v))}</td><td class="n">${r.entregas}</td><td class="n">${num(r.km)}</td><td class="n">${num(r.litros, 1)}</td><td class="n">${brl(r.combV)}</td><td class="n">${brl(r.total - r.combV)}</td><td class="n">${brl(r.total)}</td><td class="n">${r.kmL ? num(r.kmL, 1) : "—"}</td><td class="n">${r.rkm ? num(r.rkm, 2) : "—"}</td></tr>`).join("") : `<tr><td colspan="10">Nenhum veículo cadastrado.</td></tr>`) + `</tbody><tfoot><tr><td colspan="2">Frota</td><td class="n">${d.es.length}</td><td class="n">${num(km)}</td><td class="n">${num(litros, 1)}</td><td class="n">${brl(combV)}</td><td class="n">${brl(total - combV)}</td><td class="n">${brl(total)}</td><td class="n">${litros && km ? num(km / litros, 1) : "—"}</td><td class="n">${km ? num(total / km, 2) : "—"}</td></tr></tfoot>`;
  const pm = {}; d.es.forEach(e => { const k = e.motorista_id || ""; (pm[k] = pm[k] || { e: 0, dias: new Set(), v: new Set() }); pm[k].e++; pm[k].dias.add(e.data); pm[k].v.add(e.veiculo_id); });
  $("vr-pm").innerHTML = `<thead><tr><th>Motorista</th><th class="n">Entregas</th><th class="n">Dias com entrega</th><th>Veículos usados</th></tr></thead><tbody>` + (Object.keys(pm).length ? Object.entries(pm).sort((a, b) => b[1].e - a[1].e).map(([k, r]) => `<tr><td>${esc(mot(k) ? mot(k).nome : "Sem motorista")}</td><td class="n">${r.e}</td><td class="n">${r.dias.size}</td><td class="mono">${[...r.v].map(id => esc((veic(id) || {}).placa || "—")).join(", ")}</td></tr>`).join("") : `<tr><td colspan="4">Nenhuma entrega em ${monthName(m)}.</td></tr>`) + `</tbody>`;
  const pd = {}; d.es.forEach(e => (pd[e.data] = (pd[e.data] || 0) + 1)); bars($("vr-dias"), Object.entries(pd).sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => [fmtDiaC(k), n]), v => num(v));
  const dest = {}; d.es.forEach(e => { const k = (e.destino || "").trim(); if (k) dest[k] = (dest[k] || 0) + 1; }); bars($("vr-dest"), Object.entries(dest).sort((a, b) => b[1] - a[1]).slice(0, 10), v => num(v));
  const pt = {}; d.gs.forEach(g => (pt[g.tipo] = (pt[g.tipo] || 0) + (Number(g.valor) || 0))); bars($("vr-tipos"), Object.entries(pt).sort((a, b) => b[1] - a[1]), brl);
  S.cache.rel = { m, d };
}
$("vr-csv").addEventListener("click", () => guard(async () => {
  const m = $("vr-mes").value || thisMonth(); const d = S.cache.rel && S.cache.rel.m === m ? S.cache.rel.d : await dadosMes(m);
  const q = v => '"' + String(v ?? "").replace(/"/g, '""') + '"', dec = v => (Number(v) || 0).toFixed(2).replace(".", ",");
  const L = [], row = a => L.push(a.join(";")), hdr = a => row(a.map(q));
  hdr(["Relatório veicular", monthName(m)]); L.push("");
  hdr(["Placa", "Veículo", "Entregas", "Km", "Litros", "Combustível (R$)", "Outros (R$)", "Total (R$)", "km/L", "R$/km"]);
  d.porV.forEach(r => row([q(r.v.placa), q(vname(r.v)), r.entregas, r.km, dec(r.litros), dec(r.combV), dec(r.total - r.combV), dec(r.total), dec(r.kmL), dec(r.rkm)]));
  L.push(""); hdr(["Data", "Hora", "Placa", "Motorista", "Para onde", "Cliente", "NF", "Observação"]);
  d.es.forEach(e => row([q(fmtD(e.data)), q(hm(e.hora)), q((veic(e.veiculo_id) || {}).placa), q((mot(e.motorista_id) || {}).nome), q(e.destino), q(e.cliente), q(e.nf), q(e.obs)]));
  L.push(""); hdr(["Data", "Placa", "Tipo", "Motorista", "Litros", "Km", "Valor (R$)", "Fornecedor", "Descrição"]);
  d.gs.forEach(g => row([q(fmtD(g.data)), q((veic(g.veiculo_id) || {}).placa), q(g.tipo), q((mot(g.motorista_id) || {}).nome), dec(g.litros), g.km || "", dec(g.valor), q(g.fornecedor), q(g.descricao)]));
  const blob = new Blob(["﻿" + L.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "relatorio-veiculos-" + m + ".csv"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}));

/* ================= ESTOQUE: registrar saída ================= */
$("sa-data").value = today();
function renderShots() {
  $("sa-shots").innerHTML = S.shots.map((s, i) => `<figure><img src="${s.url}" alt="Foto ${i + 1}"><button type="button" data-rmshot="${i}" aria-label="Remover foto">×</button></figure>`).join("");
  $("sa-cam-hint").textContent = S.shots.length ? `${S.shots.length} foto(s). Toque para tirar mais.` : "Pode tirar mais de uma";
}
$("sa-fotos").addEventListener("change", e => { [...e.target.files].forEach(f => S.shots.push({ file: f, url: URL.createObjectURL(f) })); e.target.value = ""; renderShots(); });
$("sa-shots").addEventListener("click", e => { const b = e.target.closest("[data-rmshot]"); if (!b) return; const [s] = S.shots.splice(+b.dataset.rmshot, 1); URL.revokeObjectURL(s.url); renderShots(); });
function saidaCard(r) {
  const f = (r.fotos || [])[0];
  return `<button type="button" class="item" data-open="${r.id}"><span class="thumb">${f && fotoUrl(f) ? `<img src="${fotoUrl(f)}" alt="" loading="lazy">` : f ? "Foto" : "Sem foto"}</span><span class="info"><strong>${esc(r.cliente)}</strong><span class="meta">${esc(r.descricao)}</span><span class="meta">${r.hora ? hm(r.hora) + " · " : ""}${r.nf ? "NF " + esc(r.nf) + " · " : ""}${r.pedido ? "Pedido " + esc(r.pedido) + " · " : ""}${esc(r.situacao || "")}${(r.fotos || []).length > 1 ? " · " + r.fotos.length + " fotos" : ""}</span></span></button>`;
}
async function rSaida() {
  sugestoes();
  const l = await api.select("saidas", { eq: { data: today() }, order: ["-hora", "-criado_em"] });
  await loadUrls(l.map(r => (r.fotos || [])[0]));
  S.cache.saidas = Object.fromEntries(l.map(r => [r.id, r]));
  $("sa-hoje-t").textContent = `Registrados hoje · ${l.length}`;
  $("sa-hoje").innerHTML = l.length ? l.map(saidaCard).join("") : emptyBox("Nada registrado hoje", "Cada saída salva aparece aqui na hora.");
}
$("f-saida").addEventListener("submit", e => {
  e.preventDefault();
  if (!S.shots.length) { toast("Tire pelo menos uma foto do que está saindo."); return; }
  const btn = $("sa-save");
  guard(async () => {
    btn.textContent = "Enviando fotos…";
    try {
      const d = $("sa-data").value; const paths = [];
      for (const s of S.shots) paths.push(await api.upload(`saidas/${d}/${uid()}.jpg`, await shrink(s.file)));
      await api.insert("saidas", { data: d, hora: d === today() ? nowHM() : null, descricao: $("sa-desc").value.trim(), nf: $("sa-nf").value.trim() || null, pedido: $("sa-ped").value.trim() || null, cliente: $("sa-cli").value.trim(), situacao: $("sa-sit").value, recebedor: $("sa-rec").value.trim() || null, obs: $("sa-obs").value.trim() || null, fotos: paths });
      S.shots.forEach(s => URL.revokeObjectURL(s.url)); S.shots = []; renderShots();
      ["sa-desc", "sa-nf", "sa-ped", "sa-cli", "sa-rec", "sa-obs"].forEach(i => ($(i).value = ""));
      S.cache.sug = false; toast("Saída registrada. Pode registrar a próxima."); window.scrollTo({ top: 0, behavior: "smooth" }); render();
    } finally { btn.textContent = "Salvar e registrar o próximo"; }
  }, btn);
});

/* ================= ESTOQUE: histórico ================= */
$("hi-dia").value = today(); $("hi-dia").addEventListener("change", () => { $("hi-busca").value = ""; render(); });
let hT; $("hi-busca").addEventListener("input", () => { clearTimeout(hT); hT = setTimeout(render, 300); });
async function rHistorico() {
  const q = $("hi-busca").value.trim().replace(/[,()%*\\]/g, " ").trim();
  let l;
  if (q) l = await api.select("saidas", { search: { text: q, cols: ["cliente", "nf", "pedido", "descricao", "recebedor"] }, order: ["-data", "-hora"], limit: 100 });
  else l = await api.select("saidas", { eq: { data: $("hi-dia").value || today() }, order: ["hora", "criado_em"] });
  await loadUrls(l.map(r => (r.fotos || [])[0]));
  S.cache.saidas = Object.fromEntries(l.map(r => [r.id, r]));
  if (q) {
    $("hi-resumo").textContent = `${l.length}${l.length === 100 ? "+" : ""} registro(s) encontrados em todos os dias.`;
    const g = {}; l.forEach(r => (g[r.data] = g[r.data] || []).push(r));
    $("hi-list").innerHTML = l.length ? Object.entries(g).map(([d, rs]) => `<div class="group"><div class="group-head"><h4>${esc(fmtDia(d))}</h4><span class="hint">${rs.length}</span></div>${rs.map(saidaCard).join("")}</div>`).join("") : emptyBox("Nada encontrado", "Confira o nome do cliente, a NF ou o número do pedido.");
  } else {
    const dia = $("hi-dia").value || today();
    $("hi-resumo").textContent = `${fmtDia(dia)} · ${l.length} saída(s) · ${l.reduce((s, r) => s + (r.fotos || []).length, 0)} foto(s)`;
    $("hi-list").innerHTML = l.length ? l.map(saidaCard).join("") : emptyBox("Nenhuma saída neste dia", "Use ‹ e › para andar pelos dias ou escolha outra data.");
  }
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-open]"); if (!b) return;
  const r = (S.cache.saidas || {})[b.dataset.open]; if (!r) return;
  guard(async () => {
    await loadUrls(r.fotos || []);
    openSheet(`<div class="panel-head"><h3>${esc(r.cliente)}</h3><button class="btn sm ghost" type="button" data-close>Fechar</button></div>
      <div class="big">${(r.fotos || []).length ? r.fotos.map((f, i) => fotoUrl(f) ? `<a href="${fotoUrl(f)}" target="_blank" rel="noopener"><img src="${fotoUrl(f)}" alt="Foto ${i + 1}"></a>` : `<p class="hint">Foto ${i + 1} não carregou.</p>`).join("") : `<p class="hint">Este registro não tem foto.</p>`}</div>
      <dl class="fields"><dt>Data</dt><dd>${esc(fmtDia(r.data))}${r.hora ? " às " + hm(r.hora) : ""}</dd><dt>O que é</dt><dd>${esc(r.descricao)}</dd><dt>Nota fiscal</dt><dd class="mono">${esc(r.nf || "—")}</dd><dt>Pedido</dt><dd class="mono">${esc(r.pedido || "—")}</dd><dt>Cliente</dt><dd>${esc(r.cliente)}</dd><dt>Situação</dt><dd>${esc(r.situacao || "—")}</dd>${r.recebedor ? `<dt>Recebeu / levou</dt><dd>${esc(r.recebedor)}</dd>` : ""}${r.obs ? `<dt>Observação</dt><dd>${esc(r.obs)}</dd>` : ""}<dt>Registrado por</dt><dd>${esc(pnome(r.criado_por))}</dd></dl>
      ${(r.fotos || []).length ? `<p class="hint">Toque na foto para abrir em tamanho real.</p>` : ""}
      ${isG() ? `<div class="actions">${editBtn("saidas", r.id)}${delBtn("saidas", r.id, "Excluir registro")}</div>` : ""}`);
  });
});

/* ================= EQUIPE ================= */
async function rEquipe() {
  S.perfis = await api.select("perfis", { order: "nome" });
  $("u-list").innerHTML = S.perfis.length ? S.perfis.map(p => `<div class="item"><div class="info"><strong>${esc(p.nome)}${p.id === S.me.id ? " (você)" : ""} ${p.ativo ? `<span class="pill info">${FUNCOES[p.funcao]}</span>` : `<span class="pill bad">Desativado</span>`}</strong><span class="meta">Usuário: <span class="mono">${esc(p.usuario)}</span></span></div>${p.id === S.me.id ? "" : `<div class="actions"><button class="btn sm ghost" type="button" data-perfil="${p.id}">Alterar</button></div>`}</div>`).join("") : emptyBox("Nenhum login", "");
}
$("f-user").addEventListener("submit", e => {
  e.preventDefault();
  guard(async () => {
    const u = $("u-user").value.trim().toLowerCase(), p = $("u-pass").value;
    await api.criarLogin(u, $("u-nome").value.trim(), p, $("u-funcao").value);
    openSheet(`<h3>Login criado</h3><p>Passe estes dados para ${esc($("u-nome").value.trim())}:</p><dl class="fields"><dt>Endereço</dt><dd class="mono">${esc(location.href.split("#")[0])}</dd><dt>Usuário</dt><dd class="mono">${esc(u)}</dd><dt>Senha</dt><dd class="mono">${esc(p)}</dd></dl><div class="actions"><button class="btn" type="button" data-close>Pronto</button></div>`);
    e.target.reset(); render();
  }, e.submitter);
});
document.addEventListener("click", e => {
  const b = e.target.closest("[data-perfil]"); if (!b) return;
  const p = S.perfis.find(x => x.id === b.dataset.perfil); if (!p) return;
  openSheet(`<div class="panel-head"><h3>${esc(p.nome)}</h3><button class="btn sm ghost" type="button" data-close>Fechar</button></div>
    <form id="f-perfil"><label>Nome<input id="pf-nome" value="${esc(p.nome)}" required></label><label>Função<select id="pf-funcao">${Object.entries(FUNCOES).map(([k, l]) => `<option value="${k}"${k === p.funcao ? " selected" : ""}>${l}</option>`).join("")}</select></label><label class="check"><input type="checkbox" id="pf-ativo"${p.ativo ? " checked" : ""} style="width:auto;min-height:0"> Acesso liberado</label><button class="btn" type="submit">Salvar</button></form>
    <form id="f-reset"><h4>Nova senha</h4><label>Senha nova<input id="pf-pass" minlength="6" required autocomplete="new-password"></label><button class="btn ghost" type="submit">Trocar a senha</button></form>`);
  $("f-perfil").addEventListener("submit", ev => { ev.preventDefault(); guard(async () => { await api.update("perfis", p.id, { nome: $("pf-nome").value.trim(), funcao: $("pf-funcao").value, ativo: $("pf-ativo").checked }); closeSheet(); toast("Salvo."); render(); }, ev.submitter); });
  $("f-reset").addEventListener("submit", ev => { ev.preventDefault(); guard(async () => { await api.redefinirSenha(p.id, $("pf-pass").value); closeSheet(); toast("Senha trocada. Passe a nova senha para " + p.nome + "."); }, ev.submitter); });
});

/* ================= alterar e excluir (só gerente) ================= */
const EDIT = {
  entregas: [["data", "Data", "date"], ["hora", "Hora", "time"], ["veiculo_id", "Veículo", "veiculo"], ["motorista_id", "Motorista", "motorista"], ["destino", "Para onde foi", "text", true], ["cliente", "Cliente"], ["nf", "Nota fiscal"], ["obs", "Observação"]],
  gastos: [["data", "Data", "date"], ["veiculo_id", "Veículo", "veiculo"], ["motorista_id", "Motorista", "motorista"], ["tipo", "Tipo", TIPOS], ["valor", "Valor (R$)", "number"], ["litros", "Litros", "number"], ["km", "Km no painel", "number"], ["fornecedor", "Posto / fornecedor"], ["descricao", "Descrição"]],
  saidas: [["data", "Data", "date"], ["hora", "Hora", "time"], ["descricao", "O que é", "text", true], ["nf", "Nota fiscal"], ["pedido", "Nº do pedido"], ["cliente", "Cliente", "text", true], ["situacao", "Situação", SITUACOES], ["recebedor", "Quem recebeu / levou"], ["obs", "Observação"]],
  veiculos: [["placa", "Placa", "text", true], ["modelo", "Modelo", "text", true], ["apelido", "Apelido"], ["km_inicial", "Km no cadastro", "number"]],
  motoristas: [["nome", "Nome", "text", true], ["telefone", "Telefone"], ["cnh", "Nº da CNH"], ["categoria", "Categoria"], ["cnh_validade", "Validade da CNH", "date"], ["usuario_id", "Login no app", "login"]]
};
async function getRow(t, id) {
  if (t === "veiculos") return veic(id); if (t === "motoristas") return mot(id);
  if (t === "saidas" && S.cache.saidas && S.cache.saidas[id]) return S.cache.saidas[id];
  return (await api.select(t, { eq: { id } }))[0];
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-edit]"); if (!b) return;
  const t = b.dataset.edit, id = b.dataset.id;
  guard(async () => {
    const r = await getRow(t, id); if (!r) return;
    const field = ([k, l, type, req]) => {
      const v = r[k] ?? "";
      let input;
      if (Array.isArray(type)) input = `<select name="${k}">${type.map(o => `<option${o === v ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
      else if (type === "veiculo") input = `<select name="${k}">${S.veiculos.map(x => `<option value="${x.id}"${x.id === v ? " selected" : ""}>${esc(x.placa)} · ${esc(vname(x))}</option>`).join("")}</select>`;
      else if (type === "motorista") input = `<select name="${k}"><option value="">—</option>${S.motoristas.map(x => `<option value="${x.id}"${x.id === v ? " selected" : ""}>${esc(x.nome)}</option>`).join("")}</select>`;
      else if (type === "login") input = `<select name="${k}"><option value="">Sem login</option>${S.perfis.filter(p => p.funcao === "motorista").map(x => `<option value="${x.id}"${x.id === v ? " selected" : ""}>${esc(x.nome)}</option>`).join("")}</select>`;
      else input = `<input name="${k}" type="${type || "text"}" value="${esc(type === "time" ? hm(v) : v)}"${type === "number" ? ' step="any" inputmode="decimal"' : ""}${req ? " required" : ""}>`;
      return `<label>${l}${input}</label>`;
    };
    openSheet(`<div class="panel-head"><h3>Alterar</h3><button class="btn sm ghost" type="button" data-close>Cancelar</button></div><form id="f-edit">${EDIT[t].map(field).join("")}<button class="btn" type="submit">Salvar alteração</button></form>`);
    $("f-edit").addEventListener("submit", ev => {
      ev.preventDefault();
      guard(async () => {
        const patch = {};
        EDIT[t].forEach(([k, , type]) => { let v = ev.target.elements[k].value; if (type === "number") v = v === "" ? null : Number(v); else if (typeof v === "string") v = v.trim() || null; if (k === "placa" && v) v = v.toUpperCase().replace(/[^A-Z0-9]/g, ""); patch[k] = v; });
        await api.update(t, id, patch);
        if (t === "veiculos" || t === "motoristas") await carregarBase();
        closeSheet(); toast("Alteração salva."); render();
      }, ev.submitter);
    });
  });
});
document.addEventListener("click", e => {
  const b = e.target.closest("[data-del]"); if (!b) return;
  if (!b.classList.contains("armed")) { b.classList.add("armed"); b.dataset.label = b.textContent; b.textContent = "Confirmar"; setTimeout(() => { if (b.isConnected) { b.classList.remove("armed"); b.textContent = b.dataset.label; } }, 4000); return; }
  const t = b.dataset.del, id = b.dataset.id;
  guard(async () => {
    if (t === "veiculos" || t === "motoristas") { await api.update(t, id, { ativo: false }); await carregarBase(); toast("Desativado. O histórico continua no relatório."); }
    else {
      const r = t === "saidas" ? await getRow(t, id) : t === "gastos" ? await getRow(t, id) : null;
      await api.remove(t, id);
      const fotos = r ? [].concat(r.fotos || [], r.foto || []) : [];
      try { await api.removerFotos(fotos); } catch (x) {}
      toast("Excluído.");
    }
    closeSheet(); render();
  });
});

/* ================= janela ================= */
function openSheet(html) { $("ov-sheet").innerHTML = html; $("ov").hidden = false; const f = $("ov-sheet").querySelector("input,select,button"); if (f) f.focus(); }
function closeSheet() { $("ov").hidden = true; $("ov-sheet").innerHTML = ""; }
document.addEventListener("click", e => { if (e.target.closest("[data-close]") || e.target === $("ov")) closeSheet(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("ov").hidden) closeSheet(); });

boot();
})();
