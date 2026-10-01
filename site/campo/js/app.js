// FIAMS Campo · aplicativo
import { html, render, useState, useEffect, useMemo } from '../../vendor/preact-htm.js';
import { CONFIG } from './config.js';
import { STATUS, pctOf, ROLES, podeRevisar, ehEquipe } from './logic.js';
import { api, DEMO, flushAll } from './store.js';
import { Editor, SyncBadge } from './editor.js';
import { Supervisao } from './sup.js';
import { Bar, CatBars, StatusPill, Modal, Toaster, toast, nav, relTime, Empty, MapView, COLORS, Cobogo } from './ui.js';

function useRoute() {
  const get = () => (location.hash.replace(/^#/, '') || '/').split('/').filter(Boolean);
  const [r, setR] = useState(get());
  useEffect(() => { const h = () => setR(get()); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  return r;
}

// ---------------------------------------------------------------- login
function authErrorFromUrl() {
  const q = new URLSearchParams(location.search); const h = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
  const err = q.get('error_description') || h.get('error_description') || q.get('error') || h.get('error');
  if (!err) return '';
  history.replaceState(null, '', location.pathname + '#/');
  return /database error|somente/i.test(err)
    ? 'Só é possível entrar com uma conta Google.'
    : 'Não foi possível entrar: ' + err.replace(/\+/g, ' ');
}
function Login() {
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(authErrorFromUrl);
  const google = async () => { setBusy(true); setMsg(''); try { await api.signInGoogle(); } catch (er) { setMsg(er.message || String(er)); setBusy(false); } };
  const demo = async (e) => { e.preventDefault(); await api.signIn(email); };
  return html`<div class="login">
    <div class="login-art" aria-hidden="true"></div>
    <div class="login-card">
      <a class="back-portal" href="../">‹ Voltar ao portal</a>
      <div class="brand big"><${Cobogo} pct=${100} size=${44} /><div><b>Área da equipe</b><span>Inventário da Arquitetura Moderna de São Luís · 1930–1980</span></div></div>
      <p class="lead">Coleta em campo, revisão e publicação das fichas do inventário. Para alunos, supervisão, pesquisadores convidados e administração.</p>
      ${DEMO ? html`<div class="banner info">Modo demonstração: os dados ficam só neste navegador. Entre com <b>${CONFIG.SUPERVISORES[0]}</b> para ver a supervisão.</div>
        <form onSubmit=${demo}><label>E-mail<input type="email" required value=${email} onInput=${(e) => setEmail(e.target.value)} /></label><button class="btn primary full">Entrar (demonstração)</button></form>`
      : html`${msg && html`<p class="msg" role="alert">${msg}</p>`}
        <button class="btn google full" disabled=${busy} onClick=${google}>
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.5-4.2 7-10.3 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.600 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.6-5.900c-2.100 1.400-4.800 2.300-8.300 2.300-6.300 0-11.600-4-13.500-9.800l-7.900 6.100C6.500 42.600 14.600 48 24 48z"/></svg>
          ${busy ? 'Abrindo o Google…' : 'Entrar com Google'}</button>
        <p class="hint center">Use sua conta Google, pessoal ou institucional.</p>`}
      <p class="foot">LUPA · Centro Universitário UNDB · <a href="../privacidade.html">Privacidade</a></p>
    </div></div>`;
}

// ---------------------------------------------------------------- perfil
function ProfileForm({ profile, onSaved, first }) {
  const [p, setP] = useState({ nome: profile.nome || '', turma: profile.turma || '', matricula: profile.matricula || '' });
  const [busy, setBusy] = useState(false);
  const save = async (e) => { e.preventDefault(); setBusy(true); try { onSaved(await api.updateProfile(p)); toast('Perfil salvo.'); } catch (er) { toast(er.message, 'err'); } finally { setBusy(false); } };
  return html`<form class="card form" onSubmit=${save}>
    ${first && html`<h2>Antes de começar</h2><p class="hint">Estes dados identificam você na ficha (seção 25) e no painel da supervisão.</p>`}
    <label>Nome completo<input required value=${p.nome} onInput=${(e) => setP({ ...p, nome: e.target.value })} /></label>
    <label>Turma / disciplina<input required=${!!first && profile.role === 'aluno'} value=${p.turma} onInput=${(e) => setP({ ...p, turma: e.target.value })} placeholder="Ex.: Estúdio Urbano 2026.2" /></label>
    <label>Matrícula<input value=${p.matricula} onInput=${(e) => setP({ ...p, matricula: e.target.value })} /></label>
    <p class="hint">E-mail: ${profile.email} · Perfil: ${ROLES[profile.role] || profile.role}</p>
    <button class="btn primary" disabled=${busy}>${first ? 'Começar' : 'Salvar'}</button></form>`;
}

// ---------------------------------------------------------------- início do aluno
function Home({ profile, imoveis }) {
  const [fichas, setFichas] = useState(null);
  useEffect(() => { api.myFichas().then(setFichas).catch((e) => { toast(e.message, 'err'); setFichas([]); }); }, []);
  const imap = useMemo(() => Object.fromEntries((imoveis || []).map((i) => [i.id, i])), [imoveis]);
  const primeiro = (profile.nome || '').split(' ')[0];
  if (!fichas) return html`<div class="page"><div class="loading">Carregando suas fichas…</div></div>`;
  const cont = fichas.find((f) => ['rascunho', 'devolvida'].includes(f.status));
  const dev = fichas.filter((f) => f.status === 'devolvida').length;
  return html`<div class="page">
    <section class="hello"><h1>Olá, ${primeiro || 'bem-vindo'}.</h1>
      <p>${fichas.length ? `Você tem ${fichas.length} ficha${fichas.length > 1 ? 's' : ''}${dev ? `, ${dev} devolvida${dev > 1 ? 's' : ''} pela supervisão` : ''}.` : 'Escolha um imóvel do inventário para abrir a primeira ficha. Os dados já catalogados vêm preenchidos.'}</p>
      <div class="hello-a">${cont && html`<button class="btn primary" onClick=${() => nav('#/ficha/' + cont.id)}>Continuar ${imap[cont.imovel_id]?.id || 'ficha'}</button>`}
        <button class="btn ${cont ? 'ghost' : 'primary'}" onClick=${() => nav('#/imoveis')}>Escolher imóvel</button></div></section>
    ${fichas.length ? html`<div class="cards">${fichas.map((f) => {
      const im = imap[f.imovel_id] || {}; const pg = f.progresso || {};
      return html`<button class="fcard" onClick=${() => nav('#/ficha/' + f.id)}>
        <div class="fc-h"><span class="code">${f.imovel_id}</span><${StatusPill} s=${f.status} /></div>
        <h3>${im.nome || f.imovel_id}</h3><p class="muted">${im.endereco || ''}</p>
        <div class="fc-p"><${Bar} value=${pg.pct || 0} /><b>${pg.pct || 0}%</b></div>
        <${CatBars} cats=${pg.cats} compact />
        <p class="muted small">Atualizada ${relTime(f.updated_at)} · essenciais ${pg.ess ? `${pg.ess[0]}/${pg.ess[1]}` : '—'}</p></button>`;
    })}</div>` : html`<${Empty} title="Nenhuma ficha ainda" text="Abra o inventário, escolha um imóvel próximo e toque em Iniciar ficha." action=${html`<button class="btn primary" onClick=${() => nav('#/imoveis')}>Ver imóveis</button>`} />`}
  </div>`;
}

// ---------------------------------------------------------------- imóveis
const FILTROS = ['Todos', 'Monte Castelo', 'João Paulo', 'Filipinho', 'Com alertas', 'Sem minha ficha'];
function Imoveis({ imoveis, reload, profile }) {
  const coleta = profile.role !== 'pesquisador';
  const [q, setQ] = useState(''); const [fil, setFil] = useState('Todos'); const [view, setView] = useState('lista');
  const [sel, setSel] = useState(null); const [mine, setMine] = useState([]); const [novo, setNovo] = useState(false);
  useEffect(() => { api.myFichas().then(setMine).catch(() => {}); }, []);
  const mm = Object.fromEntries(mine.map((f) => [f.imovel_id, f]));
  const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const list = (imoveis || []).slice().sort((a, b) => (a.n || 999) - (b.n || 999) || a.id.localeCompare(b.id)).filter((i) => {
    if (q && !norm(`${i.id} ${i.nome} ${i.endereco} ${i.localidade} ${i.autor}`).includes(norm(q))) return false;
    if (['Monte Castelo', 'João Paulo', 'Filipinho'].includes(fil)) return i.bairro === fil;
    if (fil === 'Com alertas') return !!i.alertas;
    if (fil === 'Sem minha ficha') return !mm[i.id];
    return true;
  });
  const pts = list.map((i) => ({ ...i, color: mm[i.id] ? COLORS[mm[i.id].status] : COLORS.azulejo }));
  return html`<div class="page">
    <div class="page-h"><h1>Imóveis do inventário</h1><p class="muted">${list.length} de ${(imoveis || []).length} imóveis</p></div>
    <div class="toolbar">
      <input class="search" type="search" placeholder="Buscar por nome, código, endereço ou autor" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Buscar imóveis" />
      <div class="seg sm" role="tablist">${['lista', 'mapa'].map((v) => html`<button class=${view === v ? 'on' : ''} onClick=${() => setView(v)}>${v === 'lista' ? 'Lista' : 'Mapa'}</button>`)}</div>
    </div>
    <div class="chips">${FILTROS.map((f) => html`<button class=${'chip' + (fil === f ? ' on' : '')} onClick=${() => setFil(f)}>${f}</button>`)}
      ${coleta && html`<button class="chip add" onClick=${() => setNovo(true)}>+ Imóvel não listado</button>`}</div>
    ${view === 'mapa' ? html`<${MapView} points=${pts} onPick=${setSel} height=${Math.max(360, window.innerHeight - 300)} />
      <p class="hint">Azul: sem ficha sua. Cores de status: cinza em preenchimento, amarelo aguardando revisão, laranja devolvida, verde aprovada.</p>`
    : html`<ul class="imlist">${list.map((i) => html`<li><button onClick=${() => setSel(i)}>
        <span class="code">${i.id}</span><span class="im-n">${i.nome}</span>
        <span class="im-a">${i.endereco || 'endereço a confirmar'}${i.localidade && i.localidade !== i.bairro ? ` · ${i.localidade}` : ''}</span>
        <span class="im-f">${mm[i.id] ? html`<${StatusPill} s=${mm[i.id].status} />` : i.autor && !/^Autoria não/.test(i.autor) ? html`<span class="muted small">${i.autor}</span>` : ''}
          ${i.alertas && html`<span class="alert-dot" title=${i.alertas}>alertas</span>`}</span></button></li>`)}</ul>`}
    ${sel && html`<${ImovelDetail} im=${sel} ficha=${mm[sel.id]} coleta=${coleta} onClose=${() => setSel(null)} />`}
    ${novo && html`<${NovoImovel} imoveis=${imoveis} onClose=${() => setNovo(false)} onCreated=${reload} />`}
  </div>`;
}

function ImovelDetail({ im, ficha, coleta, onClose }) {
  const [busy, setBusy] = useState(false);
  const start = async () => { setBusy(true); try { const id = await api.createFicha(im.id); nav('#/ficha/' + id); } catch (e) { toast(e.message, 'err'); setBusy(false); } };
  const rows = [['Endereço', im.endereco], ['Bairro / localidade', [im.bairro, im.localidade].filter(Boolean).join(' · ')], ['Autoria', im.autor], ['Data', im.data_ref], ['Função no inventário', im.funcao], ['Levantamento 2026', im.levantamento_2026], ['Origem do registro', im.origem]];
  return html`<${Modal} title=${im.id} onClose=${onClose}>
    <h3 class="im-title">${im.nome}</h3>
    <dl class="dl">${rows.filter((r) => r[1]).map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>
    ${im.alertas && html`<div class="banner warn"><b>Verificar em campo:</b> ${im.alertas}.</div>`}
    <p class="hint">A ficha já vem preenchida com o que o Inventário v4 sabe sobre este imóvel (valores marcados como “do inventário”). Confirme ou corrija no local.</p>
    <div class="actions">
      <a class="btn ghost" href=${'../#/imovel/' + encodeURIComponent(im.id)}>Ver no portal</a>
      ${im.lat && html`<a class="btn ghost" target="_blank" rel="noopener" href=${`https://www.google.com/maps/dir/?api=1&destination=${im.lat},${im.lon}`}>Como chegar</a>`}
      ${ficha ? html`<button class="btn primary" onClick=${() => nav('#/ficha/' + ficha.id)}>Abrir minha ficha</button>`
        : coleta && html`<button class="btn primary" disabled=${busy} onClick=${start}>${busy ? 'Criando…' : 'Iniciar ficha'}</button>`}
    </div></${Modal}>`;
}

function NovoImovel({ imoveis, onClose, onCreated }) {
  const [v, setV] = useState({ nome: '', logr: '', num: '', bairro: 'Monte Castelo', localidade: '' }); const [busy, setBusy] = useState(false);
  const pfx = { 'Monte Castelo': 'MC', 'João Paulo': 'JP', 'Filipinho': 'FL' }[v.bairro];
  const next = 1 + Math.max(0, ...(imoveis || []).map((i) => parseInt(String(i.id).split('-')[2], 10) || 0));
  const id = `FIAMS-${pfx}-${String(next).padStart(3, '0')}`;
  const go = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const seed = { '1.1.1': id, '1.1.1|fonte': 'Cadastrado em campo (novo registro)', '1.2.1': v.nome, '1.3.1': v.logr, '1.3.2': v.num, '1.3.4': v.bairro, '1.3.5': v.localidade || undefined,
        '1.3.8': 'São Luís / Maranhão / Brasil', '1.4.5': '23M', '1.4.6': 'SIRGAS 2000', '25.3': 'LUPA — Laboratório de Urbanismo, Paisagem, Arquitetura e Artes · Centro Universitário UNDB', __pre: [] };
      await api.createImovel({ id, nome: v.nome, endereco: [v.logr, v.num].filter(Boolean).join(', '), bairro: v.bairro, localidade: v.localidade || v.bairro, origem: 'novo (campo)', autor: 'Autoria não identificada', seed });
      const fid = await api.createFicha(id); onCreated && onCreated(); nav('#/ficha/' + fid);
    } catch (er) { toast(er.message, 'err'); setBusy(false); }
  };
  return html`<${Modal} title="Cadastrar imóvel não listado" onClose=${onClose}><form class="form" onSubmit=${go}>
    <p class="hint">Use quando encontrar em campo um exemplar moderno que não está no inventário. Código proposto: <b>${id}</b> (a supervisão pode ajustar).</p>
    <label>Denominação<input required value=${v.nome} onInput=${(e) => setV({ ...v, nome: e.target.value })} placeholder="Ex.: Residência da Rua X, nº 00" /></label>
    <label>Logradouro<input required value=${v.logr} onInput=${(e) => setV({ ...v, logr: e.target.value })} /></label>
    <label>Número<input value=${v.num} onInput=${(e) => setV({ ...v, num: e.target.value })} /></label>
    <label>Bairro<select value=${v.bairro} onChange=${(e) => setV({ ...v, bairro: e.target.value })}><option>Monte Castelo</option><option>João Paulo</option><option>Filipinho</option></select></label>
    <label>Localidade / subárea<input value=${v.localidade} onInput=${(e) => setV({ ...v, localidade: e.target.value })} placeholder="Ex.: Apeadouro" /></label>
    <div class="actions"><button type="button" class="btn ghost" onClick=${onClose}>Cancelar</button><button class="btn primary" disabled=${busy}>Cadastrar e abrir ficha</button></div></form></${Modal}>`;
}

// ---------------------------------------------------------------- casca
function Shell({ profile, setProfile, route }) {
  const [imoveis, setImoveis] = useState(null);
  const load = () => api.listImoveis().then(setImoveis).catch((e) => { toast('Não foi possível carregar os imóveis: ' + e.message, 'err'); setImoveis([]); });
  useEffect(() => { load(); }, []);
  const sup = ehEquipe(profile); const leitor = profile.role === 'pesquisador';
  let [r0, r1, r2] = route;
  if (leitor && !r0) r0 = 'sup'; // pesquisador não coleta: começa pelo acompanhamento
  const tab = r0 === 'imoveis' ? 'imoveis' : r0 === 'sup' ? 'sup' : r0 === 'perfil' ? 'perfil' : 'inicio';
  const inEditor = r0 === 'ficha';
  let view;
  if (r0 === 'ficha') view = html`<${Editor} key=${r1} id=${r1} secParam=${r2 && decodeURIComponent(r2)} profile=${profile} />`;
  else if (r0 === 'imoveis') view = html`<${Imoveis} imoveis=${imoveis} reload=${load} profile=${profile} />`;
  else if (r0 === 'sup' && sup) view = html`<${Supervisao} route=${route.slice(1)} imoveis=${imoveis} reloadImoveis=${load} profile=${profile} />`;
  else if (r0 === 'perfil') view = html`<div class="page narrow"><h1>Perfil</h1><${ProfileForm} profile=${profile} onSaved=${setProfile} />
    <button class="btn ghost" onClick=${async () => { await flushAll(); nav('#/'); await api.signOut(); }}>Sair</button>
    <p class="hint">${DEMO ? 'Modo demonstração (dados locais).' : 'Conectado ao Supabase.'} · <a href="../">Abrir o portal público</a></p></div>`;
  else view = html`<${Home} profile=${profile} imoveis=${imoveis} />`;
  const links = [...(leitor ? [] : [['inicio', '#/', 'Minhas fichas']]), ['imoveis', '#/imoveis', 'Imóveis'], ...(sup ? [['sup', '#/sup', podeRevisar(profile) ? 'Supervisão' : 'Acompanhamento']] : []), ['perfil', '#/perfil', 'Perfil']];
  return html`<div class=${'shell' + (inEditor ? ' in-editor' : '')}>
    ${!inEditor && html`<header class="topbar"><a class="brand" href="#/"><${Cobogo} pct=${100} size=${28} color="#fff" /><b>FIAMS campo</b></a>
      <nav class="topnav">${links.map(([k, h, l]) => html`<a href=${h} class=${tab === k ? 'on' : ''}>${l}</a>`)}<a href="../" class="portal-link">Portal ↗</a></nav><${SyncBadge} /></header>`}
    <div class="content">${view}</div>
    ${!inEditor && html`<nav class="tabbar" aria-label="Navegação principal">${links.map(([k, h, l]) => html`<a href=${h} class=${tab === k ? 'on' : ''}><span class=${'ti ti-' + k} aria-hidden="true"></span>${l}</a>`)}</nav>`}
  </div>`;
}

function App() {
  const route = useRoute();
  const [session, setSession] = useState(undefined); const [profile, setProfile] = useState(null);
  useEffect(() => {
    api.getSession().then(setSession).catch(() => setSession(null));
    api.onAuth((s) => { setSession(s); if (!s) setProfile(null); });
  }, []);
  useEffect(() => { if (session) api.getProfile().then(setProfile).catch((e) => toast('Perfil não encontrado: ' + e.message, 'err')); }, [session?.user?.id]);
  let body;
  if (session === undefined || (session && !profile)) body = html`<div class="splash"><${Cobogo} pct=${100} size=${56} /><p>FIAMS campo</p></div>`;
  else if (!session) body = html`<${Login} />`;
  else if (!profile.nome || (profile.role === 'aluno' && !profile.turma)) body = html`<div class="page narrow"><${ProfileForm} profile=${profile} onSaved=${setProfile} first /></div>`;
  else body = html`<${Shell} profile=${profile} setProfile=${setProfile} route=${route} />`;
  return html`${body}<${Toaster} />`;
}

render(html`<${App} />`, document.getElementById('app'));
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
