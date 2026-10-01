// FIAMS Campo · supervisão, acompanhamento (pesquisa) e administração
import { html, useState, useEffect, useMemo } from '../../vendor/preact-htm.js';
import { SCHEMA, STATUS, ROLES, progress, narrative, essentials, secTitle, pctOf, joinPt, sigRow, toCSV, podeRevisar, ehAdmin } from './logic.js';
import { PublicarBox, Publicacao, Pessoas, Textos } from './admin.js';
import { api, loadSeedFile } from './store.js';
import { Bar, CatBars, StatusPill, ChartBox, COLORS, Modal, toast, nav, relTime, fmtDate, Empty, download, Cobogo } from './ui.js';

const ART = { campo: 'o levantamento de campo', doc: 'a pesquisa documental', ana: 'a análise patrimonial' };
const cap = (t) => t[0].toUpperCase() + t.slice(1);
const dec = (v) => (Math.round(v * 10) / 10).toLocaleString('pt-BR');
const short = (s) => { const t = secTitle(s); return t.length > 30 ? t.slice(0, 29) + '…' : t; };
const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
const catPct = (f, c) => pctOf(f.progresso?.cats?.[c]);
const nomeAluno = (p) => p?.nome || p?.email || 'Aluno';

function useSupData() {
  const [fichas, setFichas] = useState(null); const [profiles, setProfiles] = useState([]); const [t, setT] = useState(0);
  useEffect(() => {
    Promise.all([api.allFichas(), api.listProfiles()]).then(([f, p]) => { setFichas(f); setProfiles(p); })
      .catch((e) => { toast('Erro ao carregar dados: ' + e.message, 'err'); setFichas([]); });
  }, [t]);
  return { fichas, profiles, reload: () => setT(t + 1) };
}

async function exportCSV(filterFn, name) {
  const all = await api.allFichas(true);
  const rows = all.filter(filterFn || (() => true)).map((f) => {
    const pg = f.progresso || {};
    return { ALUNO: nomeAluno(f.profiles), EMAIL: f.profiles?.email || '', TURMA: f.profiles?.turma || '', MATRICULA: f.profiles?.matricula || '',
      IMOVEL: f.imovel_id, STATUS: STATUS[f.status]?.label || f.status, COMPLETUDE_PCT: pg.pct ?? '', CAMPO_PCT: pctOf(pg.cats?.campo), DOCUMENTAL_PCT: pctOf(pg.cats?.doc),
      ANALISE_PCT: pctOf(pg.cats?.ana), ESSENCIAIS: pg.ess ? `${pg.ess[0]}/${pg.ess[1]}` : '', FOTOS: pg.fotos ?? '', ATUALIZADA: f.updated_at, ENVIADA: f.enviada_em || '', ...sigRow(f.dados || {}) };
  });
  if (!rows.length) return toast('Não há fichas para exportar.');
  download(name, toCSV(rows)); toast(`${rows.length} fichas exportadas.`);
}

export function Supervisao({ route, imoveis, reloadImoveis, profile }) {
  const { fichas, profiles, reload } = useSupData();
  const [r0, r1] = route;
  const tab = r0 || 'painel';
  const adm = ehAdmin(profile);
  const tabs = [['painel', 'Painel'], ['alunos', 'Alunos'], ['fichas', 'Fichas'], ['inventario', 'Inventário'],
    ...(adm ? [['publicacao', 'Publicação'], ['pessoas', 'Pessoas'], ['textos', 'Textos do portal']] : [])];
  let view;
  if (!fichas) view = html`<div class="loading">Carregando dados da turma…</div>`;
  else if (tab === 'alunos') view = html`<${Alunos} fichas=${fichas} profiles=${profiles} />`;
  else if (tab === 'aluno') view = html`<${AlunoDetail} id=${r1} fichas=${fichas} profiles=${profiles} />`;
  else if (tab === 'fichas') view = html`<${Fichas} fichas=${fichas} />`;
  else if (tab === 'ficha') view = html`<${Review} id=${r1} onChanged=${reload} profile=${profile} />`;
  else if (tab === 'inventario') view = html`<${Inventario} fichas=${fichas} imoveis=${imoveis} reloadImoveis=${reloadImoveis} profile=${profile} />`;
  else if (tab === 'publicacao' && adm) view = html`<${Publicacao} fichas=${fichas} onChanged=${reload} />`;
  else if (tab === 'pessoas' && adm) view = html`<${Pessoas} profiles=${profiles} fichas=${fichas} onChanged=${reload} me=${profile} />`;
  else if (tab === 'textos' && adm) view = html`<${Textos} />`;
  else view = html`<${Painel} fichas=${fichas} profiles=${profiles} imoveis=${imoveis} />`;
  const cur = tab === 'aluno' ? 'alunos' : tab === 'ficha' ? 'fichas' : tab;
  return html`<div class="page sup">
    <div class="page-h"><h1>${podeRevisar(profile) ? 'Supervisão' : 'Acompanhamento'}</h1><button class="btn ghost sm" onClick=${reload}>Atualizar</button></div>
    ${!podeRevisar(profile) && html`<div class="banner info">Perfil de pesquisa: você consulta todas as fichas, gráficos e exportações, sem editar, aprovar ou devolver.</div>`}
    <div class="subtabs" role="tablist">${tabs.map(([k, l]) => html`<a role="tab" aria-selected=${cur === k} class=${cur === k ? 'on' : ''} href=${'#/sup/' + (k === 'painel' ? '' : k)}>${l}</a>`)}</div>
    ${view}</div>`;
}

// ---------------------------------------------------------------- painel
function Painel({ fichas, profiles, imoveis }) {
  const alunos = profiles.filter((p) => p.role === 'aluno');
  const st = Object.fromEntries(Object.keys(STATUS).map((k) => [k, fichas.filter((f) => f.status === k).length]));
  const cobertos = new Set(fichas.map((f) => f.imovel_id)).size; const totalIm = (imoveis || []).length || 86;
  const media = avg(fichas.map((f) => f.progresso?.pct || 0));
  const cat = { campo: avg(fichas.map((f) => catPct(f, 'campo'))), doc: avg(fichas.map((f) => catPct(f, 'doc'))), ana: avg(fichas.map((f) => catPct(f, 'ana'))) };
  const semFicha = alunos.filter((a) => !fichas.some((f) => f.aluno_id === a.id));
  const essOk = fichas.filter((f) => f.progresso?.ess && f.progresso.ess[0] === f.progresso.ess[1]).length;
  // lacunas por seção (média de itens faltantes por ficha)
  const gaps = useMemo(() => {
    const acc = {};
    fichas.forEach((f) => Object.entries(f.progresso?.secs || {}).forEach(([s, [d, t]]) => { acc[s] = (acc[s] || 0) + (t - d); }));
    return Object.entries(acc).map(([s, v]) => [s, fichas.length ? v / fichas.length : 0]).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [fichas]);
  const dias = [...Array(21)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (20 - i)); return d.toISOString().slice(0, 10); });
  const ativ = dias.map((d) => fichas.filter((f) => (f.updated_at || '').slice(0, 10) === d).length);
  const bairros = ['Monte Castelo', 'João Paulo', 'Filipinho'];
  const cobB = bairros.map((b) => { const ims = (imoveis || []).filter((i) => i.bairro === b); const c = ims.filter((i) => fichas.some((f) => f.imovel_id === i.id)).length; return [c, ims.length - c]; });
  const bins = [0, 0, 0, 0, 0]; fichas.forEach((f) => { bins[Math.min(4, Math.floor((f.progresso?.pct || 0) / 20))]++; });
  const aguard = fichas.filter((f) => f.status === 'enviada').sort((a, b) => (a.enviada_em || '').localeCompare(b.enviada_em || ''));

  if (!fichas.length) return html`<${Empty} title="Nenhuma ficha ainda" text=${`${alunos.length} aluno${alunos.length === 1 ? '' : 's'} cadastrado${alunos.length === 1 ? '' : 's'}. Quando os alunos iniciarem fichas, os gráficos e o acompanhamento aparecem aqui.`} action=${html`<a class="btn ghost" href="#/sup/inventario">Conferir o inventário carregado</a>`} />`;
  const ordered = Object.entries(cat).sort((a, b) => b[1] - a[1]);
  const narr = [
    `${alunos.length === 1 ? 'O único aluno cadastrado produziu' : `Os ${alunos.length} alunos cadastrados produziram`} ${fichas.length} ficha${fichas.length === 1 ? '' : 's'}, cobrindo ${cobertos} dos ${totalIm} imóveis do inventário (${Math.round((100 * cobertos) / totalIm)}%).`,
    `A completude média é de ${media}%. ${cap(ART[ordered[0][0]])} é a frente mais adiantada (${ordered[0][1]}%) e ${ART[ordered[2][0]]}, a menos adiantada (${ordered[2][1]}%).`,
    st.enviada ? `${st.enviada} ficha${st.enviada > 1 ? 's aguardam' : ' aguarda'} sua revisão${aguard[0]?.enviada_em ? `; a mais antiga foi enviada ${relTime(aguard[0].enviada_em)}` : ''}.` : 'Não há fichas aguardando revisão.',
    `${essOk} de ${fichas.length} ficha${fichas.length > 1 ? 's' : ''} ${essOk === 1 ? 'já tem' : 'já têm'} todos os itens essenciais para envio.` + (semFicha.length ? ` ${semFicha.length} aluno${semFicha.length > 1 ? 's' : ''} ainda não ${semFicha.length > 1 ? 'iniciaram' : 'iniciou'} nenhuma ficha${semFicha.length <= 4 ? ': ' + joinPt(semFicha.map(nomeAluno)) : ''}.` : ''),
    gaps.length ? `As seções com mais lacunas são ${joinPt(gaps.slice(0, 3).map(([s, v]) => `${secTitle(SCHEMA.sections.find((x) => x.id === s))} (${dec(v)} itens por ficha)`))} — bons temas para orientar a turma.` : '',
  ].filter(Boolean);
  return html`<div class="dash">
    <div class="narr big">${narr.map((t) => html`<p>${t}</p>`)}</div>
    <div class="kpis">
      <a class="kpi warn" href="#/sup/fichas"><b>${st.enviada}</b><span>aguardando revisão</span></a>
      <div class="kpi"><b>${media}%</b><span>completude média</span></div>
      <div class="kpi"><b>${cobertos}<small>/${totalIm}</small></b><span>imóveis com ficha</span></div>
      <div class="kpi ok"><b>${st.aprovada}</b><span>fichas aprovadas</span></div>
    </div>
    <div class="charts">
      <div class="panel"><h3>Situação das fichas</h3><${ChartBox} type="doughnut" label="Situação das fichas" data=${{ labels: Object.values(STATUS).map((s) => s.label), datasets: [{ data: Object.keys(STATUS).map((k) => st[k]), backgroundColor: Object.keys(STATUS).map((k) => COLORS[k]), borderWidth: 2 }] }} options=${{ cutout: '62%' }} /></div>
      <div class="panel"><h3>Completude média por tipo de coleta</h3><${ChartBox} type="bar" label="Completude por tipo" data=${{ labels: ['Campo', 'Documental', 'Análise'], datasets: [{ data: [cat.campo, cat.doc, cat.ana], backgroundColor: [COLORS.campo, COLORS.doc, COLORS.ana], borderRadius: 6 }] }} options=${{ plugins: { legend: { display: false } }, scales: { y: { max: 100, ticks: { callback: (v) => v + '%' } } } }} /></div>
      <div class="panel"><h3>Cobertura do inventário por bairro</h3><${ChartBox} type="bar" label="Cobertura por bairro" data=${{ labels: bairros, datasets: [{ label: 'Com ficha', data: cobB.map((x) => x[0]), backgroundColor: COLORS.azulejo, borderRadius: 4 }, { label: 'Sem ficha', data: cobB.map((x) => x[1]), backgroundColor: '#C9D3D8', borderRadius: 4 }] }} options=${{ scales: { x: { stacked: true }, y: { stacked: true } } }} /></div>
      <div class="panel"><h3>Distribuição da completude</h3><${ChartBox} type="bar" label="Distribuição" data=${{ labels: ['0–19%', '20–39%', '40–59%', '60–79%', '80–100%'], datasets: [{ label: 'Fichas', data: bins, backgroundColor: ['#C4D5EC', '#9DB9DE', '#6F97CB', '#3B6FB0', COLORS.azulejo], borderRadius: 6 }] }} options=${{ plugins: { legend: { display: false } }, scales: { y: { ticks: { precision: 0 } } } }} /></div>
      <div class="panel wide"><h3>Seções com mais lacunas (itens em branco por ficha, em média)</h3><${ChartBox} type="bar" height=${260} label="Lacunas por seção" data=${{ labels: gaps.map(([s]) => short(SCHEMA.sections.find((x) => x.id === s))), datasets: [{ data: gaps.map(([, v]) => Math.round(v * 10) / 10), backgroundColor: '#E07B00', borderRadius: 4 }] }} options=${{ indexAxis: 'y', plugins: { legend: { display: false } } }} /></div>
      <div class="panel wide"><h3>Atividade nos últimos 21 dias (fichas atualizadas por dia)</h3><${ChartBox} type="line" height=${200} label="Atividade" data=${{ labels: dias.map((d) => d.slice(8, 10) + '/' + d.slice(5, 7)), datasets: [{ data: ativ, borderColor: COLORS.azulejo, backgroundColor: 'rgba(31,78,140,.12)', fill: true, tension: 0.3, pointRadius: 3 }] }} options=${{ plugins: { legend: { display: false } }, scales: { y: { ticks: { precision: 0 } } } }} /></div>
    </div>
    ${aguard.length > 0 && html`<div class="panel"><h3>Aguardando sua revisão</h3><${FichaRows} fichas=${aguard.slice(0, 6)} /></div>`}
  </div>`;
}

function FichaRows({ fichas, showAluno = true }) {
  return html`<ul class="frows">${fichas.map((f) => html`<li><a href=${'#/sup/ficha/' + f.id}>
    <span class="code">${f.imovel_id}</span><span class="fr-n">${f.imoveis?.nome || ''}${showAluno ? html`<small>${nomeAluno(f.profiles)}${f.profiles?.turma ? ' · ' + f.profiles.turma : ''}</small>` : ''}</span>
    <span class="fr-p"><${Bar} value=${f.progresso?.pct || 0} /><b>${f.progresso?.pct || 0}%</b></span>
    <span class="fr-e" title="Itens essenciais">${f.progresso?.ess ? `${f.progresso.ess[0]}/${f.progresso.ess[1]}` : '—'}</span>
    <${StatusPill} s=${f.status} /><span class="muted small">${relTime(f.updated_at)}</span></a></li>`)}</ul>`;
}

// ---------------------------------------------------------------- alunos
function Alunos({ fichas, profiles }) {
  const [q, setQ] = useState('');
  const alunos = profiles.filter((p) => p.role === 'aluno' || fichas.some((f) => f.aluno_id === p.id))
    .filter((p) => !q || `${p.nome} ${p.email} ${p.turma}`.toLowerCase().includes(q.toLowerCase()))
    .map((p) => { const fs = fichas.filter((f) => f.aluno_id === p.id); return { p, fs, media: avg(fs.map((f) => f.progresso?.pct || 0)), last: fs[0]?.updated_at }; })
    .sort((a, b) => (a.p.nome || a.p.email).localeCompare(b.p.nome || b.p.email));
  return html`<div>
    <div class="toolbar"><input class="search" type="search" placeholder="Buscar aluno ou turma" value=${q} onInput=${(e) => setQ(e.target.value)} />
      <button class="btn ghost" onClick=${() => exportCSV(null, 'fiams_dados_compilados_todos.csv')}>Exportar dados compilados (CSV)</button></div>
    ${!alunos.length ? html`<${Empty} title="Nenhum aluno" text="Os alunos aparecem aqui assim que criarem conta no app." />` : html`
    <div class="acards">${alunos.map(({ p, fs, media, last }) => {
      const cats = { campo: [avg(fs.map((f) => catPct(f, 'campo'))), 100], doc: [avg(fs.map((f) => catPct(f, 'doc'))), 100], ana: [avg(fs.map((f) => catPct(f, 'ana'))), 100] };
      return html`<a class="acard" href=${'#/sup/aluno/' + p.id}>
        <div class="ac-h"><div class="avatar">${(p.nome || p.email || '?').slice(0, 1).toUpperCase()}</div><div><b>${nomeAluno(p)}</b><small>${[p.turma, p.matricula].filter(Boolean).join(' · ') || p.email}</small></div><span class="ac-m">${media}%</span></div>
        ${fs.length ? html`<${CatBars} cats=${cats} compact />
          <div class="ac-s">${Object.keys(STATUS).map((k) => { const n = fs.filter((f) => f.status === k).length; return n ? html`<span class=${'pill ' + STATUS[k].cls}>${n} ${STATUS[k].label.toLowerCase()}</span>` : null; })}</div>
          <p class="muted small">${fs.length} ficha${fs.length > 1 ? 's' : ''} · última atividade ${relTime(last)}</p>`
        : html`<p class="muted small">Ainda não iniciou nenhuma ficha.</p>`}</a>`;
    })}</div>`}</div>`;
}

function AlunoDetail({ id, fichas, profiles }) {
  const p = profiles.find((x) => x.id === id) || {}; const fs = fichas.filter((f) => f.aluno_id === id);
  const media = avg(fs.map((f) => f.progresso?.pct || 0));
  const c = { campo: avg(fs.map((f) => catPct(f, 'campo'))), doc: avg(fs.map((f) => catPct(f, 'doc'))), ana: avg(fs.map((f) => catPct(f, 'ana'))) };
  const ord = Object.entries(c).sort((a, b) => b[1] - a[1]);
  const primeiro = (p.nome || 'O aluno').split(' ')[0];
  const essFalt = fs.filter((f) => f.progresso?.ess && f.progresso.ess[0] < f.progresso.ess[1]);
  const narr = fs.length ? [
    `${primeiro} tem ${fs.length} ficha${fs.length > 1 ? 's' : ''}, com completude média de ${media}%.`,
    `Nas fichas de ${primeiro}, ${ART[ord[0][0]]} é a frente mais forte (${ord[0][1]}%) e ${ART[ord[2][0]]}, a mais fraca (${ord[2][1]}%).`,
    essFalt.length ? `${essFalt.length} ficha${essFalt.length > 1 ? 's ainda não têm' : ' ainda não tem'} todos os itens essenciais para envio.` : 'Todas as fichas têm os itens essenciais preenchidos.',
  ] : [`${primeiro} ainda não iniciou nenhuma ficha.`];
  return html`<div>
    <a class="link" href="#/sup/alunos">‹ Todos os alunos</a>
    <div class="ah"><div class="avatar big">${(p.nome || p.email || '?').slice(0, 1).toUpperCase()}</div><div><h2>${nomeAluno(p)}</h2><p class="muted">${[p.email, p.turma, p.matricula].filter(Boolean).join(' · ')}</p></div>
      <button class="btn ghost" onClick=${() => exportCSV((f) => f.aluno_id === id, `fiams_${(p.nome || 'aluno').replace(/\s+/g, '_')}.csv`)}>Exportar dados (CSV)</button></div>
    <div class="narr">${narr.map((t) => html`<p>${t}</p>`)}</div>
    ${fs.length > 0 && html`<div class="panel"><h3>Completude de cada ficha por tipo de coleta</h3>
      <${ChartBox} type="bar" height=${Math.max(180, fs.length * 46 + 60)} label="Completude por ficha" data=${{ labels: fs.map((f) => f.imovel_id), datasets: [
        { label: 'Campo', data: fs.map((f) => catPct(f, 'campo')), backgroundColor: COLORS.campo, borderRadius: 4 },
        { label: 'Documental', data: fs.map((f) => catPct(f, 'doc')), backgroundColor: COLORS.doc, borderRadius: 4 },
        { label: 'Análise', data: fs.map((f) => catPct(f, 'ana')), backgroundColor: COLORS.ana, borderRadius: 4 }] }}
        options=${{ indexAxis: 'y', scales: { x: { max: 100, ticks: { callback: (v) => v + '%' } } } }} /></div>
      <div class="panel"><h3>Fichas</h3><${FichaRows} fichas=${fs} showAluno=${false} /></div>`}
  </div>`;
}

// ---------------------------------------------------------------- fichas
function Fichas({ fichas }) {
  const [f, setF] = useState(fichas.some((x) => x.status === 'enviada') ? 'enviada' : 'todas'); const [q, setQ] = useState('');
  const list = fichas.filter((x) => (f === 'todas' || x.status === f) && (!q || `${x.imovel_id} ${x.imoveis?.nome} ${x.profiles?.nome} ${x.profiles?.email}`.toLowerCase().includes(q.toLowerCase())));
  return html`<div>
    <div class="toolbar"><input class="search" type="search" placeholder="Buscar imóvel ou aluno" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
    <div class="chips">${[['todas', 'Todas'], ...Object.entries(STATUS).map(([k, v]) => [k, v.label])].map(([k, l]) => html`<button class=${'chip' + (f === k ? ' on' : '')} onClick=${() => setF(k)}>${l} <small>${k === 'todas' ? fichas.length : fichas.filter((x) => x.status === k).length}</small></button>`)}</div>
    ${list.length ? html`<div class="panel"><${FichaRows} fichas=${list} /></div>` : html`<${Empty} title="Nada por aqui" text="Nenhuma ficha com este filtro." />`}</div>`;
}

// ---------------------------------------------------------------- revisão de uma ficha
function Review({ id, onChanged, profile }) {
  const revisa = podeRevisar(profile); const adm = ehAdmin(profile);
  const [f, setF] = useState(null); const [fotos, setFotos] = useState([]); const [revs, setRevs] = useState([]);
  const [sec, setSec] = useState(''); const [txt, setTxt] = useState(''); const [busy, setBusy] = useState(false);
  const load = async () => { const x = await api.getFicha(id); setF(x); api.listFotos(id).then(setFotos).catch(() => {}); api.listRevisoes(id).then(setRevs).catch(() => {}); };
  useEffect(() => { load().catch((e) => toast(e.message, 'err')); }, [id]);
  if (!f) return html`<div class="loading">Abrindo ficha…</div>`;
  const d = f.dados || {}; const p = progress(d, fotos.length); const ess = essentials(d, fotos.length);
  const aluno = f.profiles || {};
  const secsMiss = SCHEMA.sections.map((s) => ({ s, pr: p.secs[s.id], miss: p.missing.filter((m) => m.sec === s.id) })).filter((x) => x.pr);
  const comment = async (tipo = 'comentario') => {
    if (!txt.trim() && tipo !== 'aprovacao') return toast('Escreva o comentário.', 'err');
    setBusy(true);
    try {
      if (txt.trim() || tipo === 'aprovacao') await api.addRevisao({ ficha_id: id, secao: sec || null, tipo, comentario: txt.trim() || 'Ficha aprovada.' });
      if (tipo === 'devolucao') await api.setStatus(id, 'devolvida');
      if (tipo === 'aprovacao') await api.setStatus(id, 'aprovada');
      setTxt(''); await load(); onChanged && onChanged();
      toast(tipo === 'devolucao' ? 'Ficha devolvida ao aluno.' : tipo === 'aprovacao' ? 'Ficha aprovada.' : 'Comentário registrado.');
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return html`<div class="review">
    <a class="link" href="#/sup/fichas">‹ Fichas</a>
    <div class="rv-h"><div><span class="code">${f.imovel_id}</span><h2>${d['1.2.1'] || d['1.2.2'] || d['1.2.4'] || f.imoveis?.nome}</h2>
      <p class="muted">${nomeAluno(aluno)}${aluno.turma ? ' · ' + aluno.turma : ''} · atualizada ${relTime(f.updated_at)}${f.enviada_em ? ' · enviada em ' + fmtDate(f.enviada_em) : ''}</p></div><${StatusPill} s=${f.status} /></div>
    <div class="rv-grid">
      <div class="rv-main">
        <div class="panel"><h3>Leitura da ficha</h3><div class="narr">${narrative(d, fotos.length, 'A ficha').map((t) => html`<p>${t}</p>`)}</div><${CatBars} cats=${p.cats} /></div>
        <div class="panel"><h3>Itens essenciais</h3><ul class="ess">${ess.map((e) => html`<li class=${e.ok ? 'ok' : 'no'}><span aria-hidden="true">${e.ok ? '✓' : '!'}</span>${e.label}</li>`)}</ul></div>
        <div class="panel"><h3>O que falta, seção por seção</h3>
          <p class="hint">Cada bloco é uma seção da FIAMS. Abra para ver os itens em branco e, se quiser, comente a seção.</p>
          <div class="misslist">${secsMiss.map(({ s, pr, miss }) => html`<details open=${false}>
            <summary><${Cobogo} pct=${pctOf(pr)} size=${24} /><span class="ms-t">${secTitle(s)}</span><span class="ms-n">${miss.length ? `faltam ${miss.length} de ${pr[1]}` : 'completa'}</span></summary>
            ${miss.length ? html`<ul>${miss.slice(0, 40).map((m) => html`<li>${m.label}</li>`)}${miss.length > 40 ? html`<li>… e mais ${miss.length - 40}</li>` : ''}</ul>` : html`<p class="hint">Todos os itens desta seção foram preenchidos.</p>`}
            <button class="link" onClick=${() => { setSec(s.id); document.getElementById('rv-txt')?.focus(); }}>Comentar esta seção</button></details>`)}</div></div>
        <div class="panel"><h3>Fotos (${fotos.length})</h3>${fotos.length ? html`<div class="gallery">${fotos.map((x) => html`<figure><a href=${x.url} target="_blank" rel="noopener"><img src=${x.url} alt=${x.vista} loading="lazy" /></a><figcaption><b>${x.vista}</b>${x.legenda ? html`<br/>${x.legenda}` : ''}</figcaption></figure>`)}</div>` : html`<p class="hint">Nenhuma foto enviada.</p>`}</div>
      </div>
      <aside class="rv-side">
        <div class="panel sticky">${f.status === 'aprovada' && html`<${PublicarBox} f=${f} adm=${adm} onChanged=${async () => { await load(); onChanged && onChanged(); }} />`}
          ${revisa ? html`<h3>Retorno ao aluno</h3>
          <label>Seção<select value=${sec} onChange=${(e) => setSec(e.target.value)}><option value="">Ficha inteira</option>${SCHEMA.sections.map((s) => html`<option value=${s.id}>${secTitle(s)}</option>`)}</select></label>
          <label>Comentário<textarea id="rv-txt" rows="5" value=${txt} onInput=${(e) => setTxt(e.target.value)} placeholder="Ex.: confira a numeração no local; a fachada lateral não foi fotografada."></textarea></label>
          <button class="btn ghost full" disabled=${busy} onClick=${() => comment('comentario')}>Adicionar comentário</button>
          <div class="rv-act"><button class="btn warn" disabled=${busy} onClick=${() => comment('devolucao')}>Devolver ao aluno</button>
            <button class="btn ok" disabled=${busy} onClick=${() => confirm('Aprovar esta ficha? O aluno não poderá mais editá-la.') && comment('aprovacao')}>Aprovar</button></div>`
          : html`<h3>Consulta</h3><p class="hint">Somente leitura. Comentários, devoluções e aprovações ficam com a supervisão.</p>`}
          <a class="btn ghost full" href=${'#/ficha/' + id}>Abrir a ficha completa</a>
          <h4>Histórico</h4>${revs.length ? html`<ul class="hist">${revs.map((r) => html`<li class=${r.resolvido ? 'done' : ''}><b>${r.tipo === 'devolucao' ? 'Devolução' : r.tipo === 'aprovacao' ? 'Aprovação' : 'Comentário'}</b>${r.secao ? ` · seção ${r.secao}` : ''}<p>${r.comentario}</p><small>${nomeAluno(r.profiles)} · ${relTime(r.created_at)}${r.resolvido ? ' · resolvido pelo aluno' : ''}</small></li>`)}</ul>` : html`<p class="hint">Sem registros.</p>`}
        </div></aside></div></div>`;
}

// ---------------------------------------------------------------- inventário
function Inventario({ fichas, imoveis, reloadImoveis, profile }) {
  const [f, setF] = useState('todos'); const [imp, setImp] = useState(null);
  const by = {}; fichas.forEach((x) => { (by[x.imovel_id] = by[x.imovel_id] || []).push(x); });
  const list = (imoveis || []).filter((i) => f === 'todos' || (f === 'sem' ? !by[i.id] : f === 'com' ? by[i.id] : (by[i.id] || []).some((x) => x.status === 'aprovada')));
  const importar = async () => {
    if (!confirm('Carregar ou atualizar os imóveis do Inventário v4 com as fichas pré-preenchidas? Fichas já iniciadas pelos alunos não são alteradas.')) return;
    try { const rows = await loadSeedFile(); setImp([0, rows.length]); await api.importSeed(rows, (n) => setImp([n, rows.length])); toast(`${rows.length} imóveis carregados.`); reloadImoveis(); }
    catch (e) { toast('Falha ao carregar: ' + e.message, 'err'); } finally { setImp(null); }
  };
  return html`<div>
    <div class="panel"><h3>Inventário no banco de dados</h3>
      <p>${(imoveis || []).length} imóveis cadastrados; ${Object.keys(by).length} com pelo menos uma ficha. Os 86 imóveis do Inventário v4 são carregados pelo arquivo <code>02_seed_imoveis.sql</code> ou pelo botão abaixo.</p>
      <div class="actions left">${podeRevisar(profile) && html`<button class="btn ghost" disabled=${!!imp} onClick=${importar}>${imp ? `Carregando ${imp[0]}/${imp[1]}…` : 'Carregar / atualizar os 86 imóveis'}</button>`}
        <button class="btn ghost" onClick=${() => exportCSV(null, 'fiams_todas_as_fichas.csv')}>Exportar todas as fichas (CSV)</button></div></div>
    <div class="chips">${[['todos', 'Todos'], ['sem', 'Sem ficha'], ['com', 'Com ficha'], ['apr', 'Com ficha aprovada']].map(([k, l]) => html`<button class=${'chip' + (f === k ? ' on' : '')} onClick=${() => setF(k)}>${l}</button>`)}</div>
    <div class="panel"><table class="tbl-inv"><thead><tr><th>Código</th><th>Imóvel</th><th>Bairro</th><th>Fichas</th><th>Melhor completude</th><th>Situação</th></tr></thead>
      <tbody>${list.map((i) => { const fs = by[i.id] || []; const best = fs.reduce((a, x) => (x.progresso?.pct || 0) > (a?.progresso?.pct || -1) ? x : a, null);
        return html`<tr><td class="code">${i.id}</td><td>${i.nome}</td><td>${i.localidade || i.bairro}</td><td>${fs.length || '—'}</td>
          <td>${best ? html`<a href=${'#/sup/ficha/' + best.id}>${best.progresso?.pct || 0}%</a>` : '—'}</td><td>${best ? html`<${StatusPill} s=${best.status} />` : html`<span class="muted small">sem ficha</span>`}</td></tr>`; })}</tbody></table></div>
  </div>`;
}
