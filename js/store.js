// FIAMS Campo · camada de dados
// Supabase (produção) ou modo demonstração (localStorage), com cache e fila offline.
import { CONFIG } from './config.js';
import { progressSummary } from './logic.js';

export const DEMO = !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY;
const LS = window.localStorage;
const IM_COLS = 'id,n,nome,endereco,bairro,localidade,lat,lon,autor,data_ref,funcao,origem,levantamento_2026,alertas';

// ------------------------------------------------------------ eventos simples
const subs = new Set();
export const onSync = (fn) => { subs.add(fn); return () => subs.delete(fn); };
let syncState = { online: navigator.onLine, pending: 0, saving: false, error: null };
const emit = (patch) => { syncState = { ...syncState, ...patch }; subs.forEach((f) => f(syncState)); };
export const getSyncState = () => syncState;

// ------------------------------------------------------------ utilidades
export async function loadSeedFile() {
  const r = await fetch('data/seed.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('Não foi possível ler data/seed.json');
  return r.json();
}
export async function compressImage(file, max = 1800, q = 0.82) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', q));
}
const blobToDataURL = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));

// ------------------------------------------------------------ IndexedDB (fotos pendentes)
const idb = {
  db: null,
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((res, rej) => {
      const r = indexedDB.open('fiams-campo', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('fotos', { keyPath: 'key' });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return this.db;
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('fotos', mode); const st = t.objectStore('fotos');
      const out = fn(st); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error);
    });
  },
  put(v) { return this.tx('readwrite', (s) => s.put(v)); },
  del(k) { return this.tx('readwrite', (s) => s.delete(k)); },
  all() { return this.tx('readonly', (s) => s.getAll()); },
};

// =============================================================================
// BACKEND SUPABASE
// =============================================================================
function supabaseBackend() {
  const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, flowType: 'pkce' } });
  const ok = ({ data, error }) => { if (error) throw error; return data; };
  let me = null;
  return {
    mode: 'supabase',
    async getSession() { const { data } = await sb.auth.getSession(); me = data.session?.user || null; return data.session; },
    onAuth(fn) { sb.auth.onAuthStateChange((_e, s) => { me = s?.user || null; fn(s); }); },
    // Login somente por conta Google (o banco recusa qualquer outro cadastro)
    async signInGoogle() {
      ok(await sb.auth.signInWithOAuth({ provider: 'google', options: {
        redirectTo: location.origin + location.pathname,
        queryParams: { prompt: 'select_account' } } }));
    },
    async signOut() { await sb.auth.signOut(); },
    uid: () => me?.id,
    async getProfile() { return ok(await sb.from('profiles').select('*').eq('id', me.id).single()); },
    async updateProfile(p) { return ok(await sb.from('profiles').update({ nome: p.nome, turma: p.turma, matricula: p.matricula }).eq('id', me.id).select().single()); },
    async listProfiles() { return ok(await sb.from('profiles').select('*').order('nome')); },
    async listImoveis() { return ok(await sb.from('imoveis').select(IM_COLS).order('id')); },
    async getImovelSeed(id) {
      const s = ok(await sb.from('imoveis').select('seed').eq('id', id).single()).seed || {};
      if (Object.keys(s).length) return s;
      // banco sem pré-preenchimento: usa o arquivo data/seed.json publicado junto com o app
      try { return (await loadSeedFile()).find((r) => r.id === id)?.seed || {}; } catch { return {}; }
    },
    async createImovel(im) { return ok(await sb.from('imoveis').insert({ ...im, created_by: me.id }).select(IM_COLS).single()); },
    async importSeed(rows, onStep) {
      for (let i = 0; i < rows.length; i += 15) {
        const chunk = rows.slice(i, i + 15).map(({ n, ...r }) => ({ n, ...r }));
        ok(await sb.from('imoveis').upsert(chunk));
        onStep && onStep(Math.min(rows.length, i + 15));
      }
    },
    async myFichas() { return ok(await sb.from('fichas').select('id,imovel_id,aluno_id,status,progresso,updated_at,enviada_em').eq('aluno_id', me.id).order('updated_at', { ascending: false })); },
    async getFicha(id) { return ok(await sb.from('fichas').select('*, imoveis(id,nome,endereco,bairro,localidade,lat,lon,alertas,levantamento_2026)').eq('id', id).single()); },
    async createFicha(imovelId) {
      const ex = ok(await sb.from('fichas').select('id').eq('imovel_id', imovelId).eq('aluno_id', me.id));
      if (ex.length) return ex[0].id;
      const seed = await this.getImovelSeed(imovelId);
      const r = ok(await sb.from('fichas').insert({ imovel_id: imovelId, aluno_id: me.id, dados: seed, progresso: progressSummary(seed, 0) }).select('id').single());
      return r.id;
    },
    async saveFicha(id, dados, progresso) { return ok(await sb.from('fichas').update({ dados, progresso }).eq('id', id).select('id,updated_at').single()); },
    async setStatus(id, status, progresso) {
      const patch = { status }; if (progresso) patch.progresso = progresso;
      return ok(await sb.from('fichas').update(patch).eq('id', id).select('id,status').single());
    },
    async deleteFicha(id) { ok(await sb.from('fichas').delete().eq('id', id)); },
    async allFichas(withDados = false) {
      const cols = 'id,imovel_id,aluno_id,status,progresso,created_at,updated_at,enviada_em,revisada_em,imoveis(nome,bairro,localidade),profiles(nome,email,turma,matricula)' + (withDados ? ',dados' : '');
      return ok(await sb.from('fichas').select(cols).order('updated_at', { ascending: false }));
    },
    async listRevisoes(fichaId) { return ok(await sb.from('revisoes').select('*, profiles(nome,email)').eq('ficha_id', fichaId).order('created_at', { ascending: false })); },
    async addRevisao(r) { return ok(await sb.from('revisoes').insert(r).select().single()); },
    async resolveRevisao(id, v) { return ok(await sb.from('revisoes').update({ resolvido: v }).eq('id', id)); },
    async listFotos(fichaId) {
      const rows = ok(await sb.from('fotos').select('*').eq('ficha_id', fichaId).order('created_at'));
      if (!rows.length) return rows;
      const { data } = await sb.storage.from('fotos').createSignedUrls(rows.map((r) => r.path), 3600);
      return rows.map((r, i) => ({ ...r, url: data?.[i]?.signedUrl }));
    },
    async uploadFoto(fichaId, blob, meta) {
      const path = `${me.id}/${fichaId}/${Date.now()}.jpg`;
      ok(await sb.storage.from('fotos').upload(path, blob, { contentType: 'image/jpeg', upsert: false }));
      return ok(await sb.from('fotos').insert({ ficha_id: fichaId, aluno_id: me.id, path, ...meta }).select().single());
    },
    async deleteFoto(f) { await sb.storage.from('fotos').remove([f.path]); ok(await sb.from('fotos').delete().eq('id', f.id)); },
  };
}

// =============================================================================
// BACKEND DEMONSTRAÇÃO (localStorage)
// =============================================================================
function demoBackend() {
  const KEY = 'fiams-demo-db';
  const load = () => JSON.parse(LS.getItem(KEY) || '{"users":[],"imoveis":[],"fichas":[],"revisoes":[],"fotos":[]}');
  let db = load();
  const save = () => { try { LS.setItem(KEY, JSON.stringify(db)); } catch (e) { alert('Armazenamento do navegador cheio (modo demonstração). Apague fotos de teste.'); } };
  let session = JSON.parse(LS.getItem('fiams-demo-session') || 'null');
  let authCb = () => {};
  const me = () => db.users.find((u) => u.id === session?.user?.id);
  const prof = (u) => u && { id: u.id, email: u.email, nome: u.nome, turma: u.turma || '', matricula: u.matricula || '', role: u.role };
  const imo = (id) => { const i = db.imoveis.find((x) => x.id === id); if (!i) return null; const { seed, ...rest } = i; return rest; };
  const withJoin = (f) => { const u = db.users.find((x) => x.id === f.aluno_id); const i = imo(f.imovel_id); return { ...f, imoveis: i, profiles: prof(u) }; };
  const delay = (v) => new Promise((r) => setTimeout(() => r(v), 60));
  async function ensureSeed() {
    if (db.imoveis.length) return;
    const rows = await loadSeedFile();
    db.imoveis = rows.map((r) => ({ ...r })); save();
  }
  return {
    mode: 'demo',
    async getSession() { await ensureSeed(); return session; },
    onAuth(fn) { authCb = fn; },
    async signIn(email) {
      email = email.trim().toLowerCase();
      let u = db.users.find((x) => x.email === email);
      if (!u) {
        u = { id: uid(), email, nome: '', role: CONFIG.SUPERVISORES.includes(email) ? 'supervisor' : 'aluno' };
        db.users.push(u); save();
      }
      session = { user: { id: u.id, email } }; LS.setItem('fiams-demo-session', JSON.stringify(session)); authCb(session);
    },
    async signUp(email, _p, nome) { await this.signIn(email); const u = me(); u.nome = nome; save(); authCb(session); return { needsConfirm: false }; },
    async resetPassword() {},
    async signOut() { session = null; LS.removeItem('fiams-demo-session'); authCb(null); },
    uid: () => session?.user?.id,
    async getProfile() { return delay(prof(me())); },
    async updateProfile(p) { const u = me(); Object.assign(u, { nome: p.nome, turma: p.turma, matricula: p.matricula }); save(); return prof(u); },
    async listProfiles() { return db.users.map(prof); },
    async listImoveis() { await ensureSeed(); return delay(db.imoveis.map(({ seed, ...r }) => r).sort((a, b) => a.id.localeCompare(b.id))); },
    async getImovelSeed(id) { return db.imoveis.find((x) => x.id === id)?.seed || {}; },
    async createImovel(im) { db.imoveis.push({ ...im, seed: im.seed || {} }); save(); return imo(im.id); },
    async importSeed(rows, onStep) {
      for (const r of rows) { const i = db.imoveis.findIndex((x) => x.id === r.id); if (i >= 0) db.imoveis[i] = r; else db.imoveis.push(r); }
      save(); onStep && onStep(rows.length);
    },
    async myFichas() { return delay(db.fichas.filter((f) => f.aluno_id === session.user.id).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(({ dados, ...f }) => f)); },
    async getFicha(id) { const f = db.fichas.find((x) => x.id === id); if (!f) throw new Error('Ficha não encontrada'); return delay(withJoin(JSON.parse(JSON.stringify(f)))); },
    async createFicha(imovelId) {
      const ex = db.fichas.find((f) => f.imovel_id === imovelId && f.aluno_id === session.user.id);
      if (ex) return ex.id;
      const seed = JSON.parse(JSON.stringify(await this.getImovelSeed(imovelId)));
      const now = new Date().toISOString();
      const f = { id: uid(), imovel_id: imovelId, aluno_id: session.user.id, dados: seed, progresso: progressSummary(seed, 0), status: 'rascunho', created_at: now, updated_at: now };
      db.fichas.push(f); save(); return f.id;
    },
    async saveFicha(id, dados, progresso) {
      const f = db.fichas.find((x) => x.id === id);
      if (!['rascunho', 'devolvida'].includes(f.status) && me().role !== 'supervisor') throw new Error('Ficha bloqueada para edição');
      Object.assign(f, { dados, progresso, updated_at: new Date().toISOString() }); save(); return { id, updated_at: f.updated_at };
    },
    async setStatus(id, status, progresso) {
      const f = db.fichas.find((x) => x.id === id); const now = new Date().toISOString();
      if (['aprovada', 'devolvida'].includes(status) && me().role !== 'supervisor') throw new Error('Somente a supervisão pode aprovar ou devolver fichas.');
      f.status = status; if (progresso) f.progresso = progresso; f.updated_at = now;
      if (status === 'enviada') f.enviada_em = now; else if (status !== 'rascunho') f.revisada_em = now;
      save(); return { id, status };
    },
    async deleteFicha(id) { db.fichas = db.fichas.filter((f) => f.id !== id); save(); },
    async allFichas(withDados = false) { return delay(db.fichas.map((f) => { const j = withJoin(f); if (!withDados) delete j.dados; return j; }).sort((a, b) => b.updated_at.localeCompare(a.updated_at))); },
    async listRevisoes(fichaId) { return db.revisoes.filter((r) => r.ficha_id === fichaId).map((r) => ({ ...r, profiles: prof(db.users.find((u) => u.id === r.autor_id)) })).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    async addRevisao(r) { const x = { id: uid(), autor_id: session.user.id, resolvido: false, created_at: new Date().toISOString(), ...r }; db.revisoes.push(x); save(); return x; },
    async resolveRevisao(id, v) { const r = db.revisoes.find((x) => x.id === id); r.resolvido = v; save(); },
    async listFotos(fichaId) { return db.fotos.filter((f) => f.ficha_id === fichaId).map((f) => ({ ...f, url: f.data })); },
    async uploadFoto(fichaId, blob, meta) {
      const small = await compressImage(blob, 900, 0.7);
      const f = { id: uid(), ficha_id: fichaId, aluno_id: session.user.id, path: 'demo', data: await blobToDataURL(small), created_at: new Date().toISOString(), ...meta };
      db.fotos.push(f); save(); return f;
    },
    async deleteFoto(f) { db.fotos = db.fotos.filter((x) => x.id !== f.id); save(); },
  };
}

export const api = DEMO ? demoBackend() : supabaseBackend();

// =============================================================================
// CACHE LOCAL + FILA OFFLINE (fichas e fotos)
// =============================================================================
const fkey = (id) => 'fiams-ficha:' + id;
export function localFicha(id) { try { return JSON.parse(LS.getItem(fkey(id)) || 'null'); } catch { return null; } }
function putLocal(id, obj) { try { LS.setItem(fkey(id), JSON.stringify(obj)); } catch { /* cota */ } }
function pendingIds() { return Object.keys(LS).filter((k) => k.startsWith(fkey(''))).map((k) => k.slice(fkey('').length)).filter((id) => localFicha(id)?.dirty); }

export async function openFicha(id) {
  const loc = localFicha(id);
  try {
    const remote = await api.getFicha(id);
    if (loc?.dirty && loc.ts > Date.parse(remote.updated_at || 0)) return { ...remote, dados: loc.dados, _localNewer: true };
    putLocal(id, { dados: remote.dados, ts: Date.parse(remote.updated_at || Date.now()), dirty: false, meta: { imoveis: remote.imoveis, status: remote.status } });
    return remote;
  } catch (e) {
    if (loc) return { id, dados: loc.dados, status: loc.meta?.status || 'rascunho', imoveis: loc.meta?.imoveis, _offline: true };
    throw e;
  }
}

const timers = {};
export function saveFichaLocal(id, dados, meta, nFotos = 0) {
  putLocal(id, { dados, ts: Date.now(), dirty: true, meta, nFotos });
  emit({ pending: pendingIds().length });
  clearTimeout(timers[id]);
  timers[id] = setTimeout(() => flushOne(id), 1200);
}
async function flushOne(id) {
  const loc = localFicha(id);
  if (!loc?.dirty) return;
  if (!navigator.onLine) { emit({ online: false, pending: pendingIds().length }); return; }
  emit({ saving: true });
  try {
    await api.saveFicha(id, loc.dados, progressSummary(loc.dados, loc.nFotos || 0));
    const cur = localFicha(id);
    if (cur && cur.ts === loc.ts) putLocal(id, { ...cur, dirty: false });
    emit({ saving: false, error: null, pending: pendingIds().length, lastSaved: Date.now() });
  } catch (e) {
    emit({ saving: false, error: e.message || String(e), pending: pendingIds().length });
  }
}
export async function flushAll() {
  for (const id of pendingIds()) await flushOne(id);
  await flushPhotos();
}

export async function queuePhoto(fichaId, blob, meta) {
  const key = uid();
  await idb.put({ key, fichaId, blob, meta, at: Date.now() });
  await flushPhotos();
  return key;
}
export async function pendingPhotos(fichaId) {
  try { return (await idb.all()).filter((p) => !fichaId || p.fichaId === fichaId); } catch { return []; }
}
let flushingPhotos = false;
async function flushPhotos() {
  if (flushingPhotos || !navigator.onLine) return;
  flushingPhotos = true;
  try {
    for (const p of await pendingPhotos()) {
      try { await api.uploadFoto(p.fichaId, p.blob, p.meta); await idb.del(p.key); window.dispatchEvent(new CustomEvent('fiams-foto', { detail: p.fichaId })); }
      catch (e) { emit({ error: 'Foto não enviada: ' + (e.message || e) }); break; }
    }
  } finally { flushingPhotos = false; }
}

window.addEventListener('online', () => { emit({ online: true }); flushAll(); });
window.addEventListener('offline', () => emit({ online: false }));
setInterval(() => { if (navigator.onLine) flushAll(); }, 20000);
emit({ pending: pendingIds().length });
