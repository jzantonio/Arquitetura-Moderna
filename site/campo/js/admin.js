// FIAMS Campo · administração: publicação no portal, pessoas e papéis, textos públicos
import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { ROLES } from './logic.js';
import { api } from './store.js';
import { toast, relTime, fmtDate, Empty } from './ui.js';
import { md } from '../../js/md.js';

const nomeAluno = (p) => p?.nome || p?.email || 'Aluno';
const PORTAL = (imovelId) => '../#/imovel/' + encodeURIComponent(imovelId);
const OCULTOS = 'dados da visita (V.1–V.6), entrevista e memória social (seção 23), fontes orais (24.5) e inscrição imobiliária (1.1.3)';
const confirmaPublicar = (quem) => confirm(`Publicar ${quem} no portal público?\n\nFicam de fora: ${OCULTOS}. As fotos da ficha passam a ser públicas.`);

// ---------------------------------------------------------------- publicação
export function PublicarBox({ f, adm, onChanged }) {
  const [busy, setBusy] = useState(false);
  const set = async (v) => {
    if (v ? !confirmaPublicar('esta ficha') : !confirm('Retirar esta ficha do portal público?')) return;
    setBusy(true);
    try { await api.setPublicada(f.id, v); toast(v ? 'Ficha publicada no portal.' : 'Ficha retirada do portal.'); onChanged && onChanged(); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return html`<div class=${'pubbox' + (f.publicada ? ' on' : '')}>
    <h3>Portal público</h3>
    ${f.publicada ? html`<p>Publicada em ${fmtDate(f.publicada_em)}. <a href=${PORTAL(f.imovel_id)} target="_blank" rel="noopener">Ver no portal</a></p>
      ${adm && html`<button class="btn ghost full" disabled=${busy} onClick=${() => set(false)}>Retirar do portal</button>`}`
    : html`<p>${adm ? 'Ficha aprovada, ainda não publicada.' : 'Ficha aprovada. A publicação no portal é decidida pela administração.'}</p>
      ${adm && html`<button class="btn primary full" disabled=${busy} onClick=${() => set(true)}>Publicar no portal</button>`}`}
  </div>`;
}

export function Publicacao({ fichas, onChanged }) {
  const apr = fichas.filter((f) => f.status === 'aprovada');
  const [busy, setBusy] = useState('');
  const pub = apr.filter((f) => f.publicada).length;
  const set = async (f, v) => {
    if (v ? !confirmaPublicar(`a ficha de ${f.imovel_id}`) : !confirm(`Retirar a ficha de ${f.imovel_id} do portal?`)) return;
    setBusy(f.id);
    try { await api.setPublicada(f.id, v); toast(v ? 'Publicada.' : 'Retirada do portal.'); onChanged(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(''); }
  };
  return html`<div>
    <div class="panel"><h3>Fichas no portal público</h3>
      <p>${apr.length ? `${apr.length} ficha${apr.length > 1 ? 's aprovadas' : ' aprovada'}; ${pub} publicada${pub === 1 ? '' : 's'} no portal.` : 'Nenhuma ficha aprovada ainda. Depois de aprovar uma ficha na revisão, ela aparece aqui para publicação.'}</p>
      <p class="hint">Só fichas aprovadas podem ser publicadas. Na versão pública ficam de fora ${OCULTOS}. Se a ficha for devolvida para correção, sai do portal automaticamente.</p></div>
    ${apr.length > 0 && html`<div class="panel"><ul class="publist">${apr.map((f) => html`<li><div class="pubrow">
      <span class="code">${f.imovel_id}</span><span class="fr-n">${f.imoveis?.nome || ''}<small>${nomeAluno(f.profiles)} · aprovada ${relTime(f.revisada_em)}</small></span>
      <span>${f.publicada ? html`<span class="pill st-aprovada">No portal desde ${fmtDate(f.publicada_em)}</span>` : html`<span class="pill st-rascunho">Não publicada</span>`}</span>
      <span class="pub-a"><a class="btn ghost sm" href=${'#/sup/ficha/' + f.id}>Revisão</a>
        ${f.publicada && html`<a class="btn ghost sm" href=${PORTAL(f.imovel_id)} target="_blank" rel="noopener">Ver</a>`}
        <button class=${'btn sm ' + (f.publicada ? 'ghost' : 'primary')} disabled=${busy === f.id} onClick=${() => set(f, !f.publicada)}>${f.publicada ? 'Retirar' : 'Publicar'}</button></span>
    </div></li>`)}</ul></div>`}
  </div>`;
}

// ---------------------------------------------------------------- pessoas e papéis
const ROLE_HELP = {
  aluno: 'preenche as próprias fichas',
  supervisor: 'revisa, comenta, aprova e devolve fichas',
  pesquisador: 'consulta tudo (fichas, gráficos, exportações), sem editar',
  admin: 'tudo da supervisão, mais papéis, publicação e textos do portal',
};
const RoleSelect = ({ value, onChange, label }) => html`<select value=${value} onChange=${(e) => onChange(e.target.value)} aria-label=${label}>
  ${Object.entries(ROLES).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select>`;

export function Pessoas({ profiles, fichas, onChanged, me }) {
  const [papeis, setPapeis] = useState([]); const [q, setQ] = useState('');
  const [novo, setNovo] = useState({ email: '', role: 'pesquisador' }); const [busy, setBusy] = useState(false);
  const loadP = () => api.listPapeis().then(setPapeis).catch((e) => toast(e.message, 'err'));
  useEffect(() => { loadP(); }, []);
  const emails = new Set(profiles.map((p) => (p.email || '').toLowerCase()));
  const pend = papeis.filter((p) => !emails.has(p.email));
  const list = profiles.filter((p) => !q || `${p.nome} ${p.email} ${p.turma}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email));
  const change = async (p, role) => {
    if (p.id === me.id && role !== 'admin' && !confirm('Você vai deixar de ser administrador. Continuar?')) return onChanged();
    try { await api.definirPapel(p.id, role); toast(`${p.nome || p.email}: ${ROLES[role]}.`); onChanged(); loadP(); } catch (e) { toast(e.message, 'err'); onChanged(); }
  };
  const registrar = async (e) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(novo.email.trim())) return toast('Informe um e-mail válido.', 'err');
    setBusy(true);
    try { await api.savePapel(novo.email, novo.role); toast('Papel registrado. Vale no primeiro acesso dessa pessoa.'); setNovo({ email: '', role: novo.role }); loadP(); onChanged(); }
    catch (er) { toast(er.message, 'err'); } finally { setBusy(false); }
  };
  const remover = async (p) => {
    if (!confirm(`Remover o papel registrado para ${p.email}?`)) return;
    try { await api.deletePapel(p.email); loadP(); } catch (e) { toast(e.message, 'err'); }
  };
  return html`<div>
    <div class="panel"><h3>Papéis</h3><ul class="roles">${Object.entries(ROLE_HELP).map(([k, v]) => html`<li><b>${ROLES[k]}</b>: ${v}.</li>`)}</ul>
      <p class="hint">Todos entram com uma conta Google. Quem não tem papel definido entra como aluno.</p></div>
    <div class="panel"><h3>Definir o papel de alguém que ainda não entrou</h3>
      <form class="invite" onSubmit=${registrar}>
        <input type="email" placeholder="email@exemplo.com" value=${novo.email} onInput=${(e) => setNovo({ ...novo, email: e.target.value })} aria-label="E-mail" />
        <${RoleSelect} value=${novo.role} onChange=${(v) => setNovo({ ...novo, role: v })} label="Papel" />
        <button class="btn primary" disabled=${busy}>Registrar</button></form>
      ${pend.length > 0 && html`<p class="hint">Aguardando o primeiro acesso:</p><ul class="pend-list">${pend.map((p) => html`<li>
        <span>${p.email}</span><span class="pill st-rascunho">${ROLES[p.role]}</span><button class="link danger" onClick=${() => remover(p)}>Remover</button></li>`)}</ul>`}</div>
    <div class="panel"><div class="toolbar"><h3 class="grow">Pessoas cadastradas (${profiles.length})</h3>
      <input class="search" type="search" placeholder="Buscar nome, e-mail ou turma" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
      <div class="tbl-wrap"><table class="tbl-inv"><thead><tr><th>Pessoa</th><th>Turma</th><th>Fichas</th><th>Papel</th></tr></thead><tbody>
      ${list.map((p) => html`<tr><td><b>${p.nome || '—'}</b>${p.id === me.id ? ' (você)' : ''}<br/><span class="muted small">${p.email}</span></td><td>${p.turma || '—'}</td>
        <td>${fichas.filter((f) => f.aluno_id === p.id).length || '—'}</td>
        <td><${RoleSelect} value=${p.role} onChange=${(v) => change(p, v)} label=${'Papel de ' + (p.nome || p.email)} /></td></tr>`)}
      </tbody></table></div></div>
  </div>`;
}

// ---------------------------------------------------------------- textos do portal
const ONDE = { inicio: 'Página inicial', sobre: 'O projeto', metodologia: 'O projeto · Metodologia', creditos: 'O projeto · Equipe e créditos' };
export function Textos() {
  const [items, setItems] = useState(null); const [cur, setCur] = useState(null); const [busy, setBusy] = useState(false);
  useEffect(() => { api.listConteudo().then((x) => { setItems(x); setCur(x[0] ? { ...x[0] } : null); }).catch((e) => { toast(e.message, 'err'); setItems([]); }); }, []);
  if (!items) return html`<div class="loading">Carregando textos…</div>`;
  if (!items.length) return html`<${Empty} title="Sem textos" text="A tabela de textos públicos está vazia. Rode supabase/03_plataforma.sql no Supabase." />`;
  const orig = items.find((x) => x.chave === cur?.chave);
  const dirty = !!(cur && orig && (cur.titulo !== orig.titulo || cur.corpo !== orig.corpo));
  const pick = (x) => { if (dirty && !confirm('Descartar as alterações não salvas?')) return; setCur({ ...x }); };
  const salvar = async () => {
    setBusy(true);
    try { const r = await api.saveConteudo(cur); setItems(items.map((x) => (x.chave === r.chave ? r : x))); setCur({ ...r }); toast('Texto publicado no portal.'); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return html`<div>
    <div class="chips">${items.map((x) => html`<button class=${'chip' + (cur?.chave === x.chave ? ' on' : '')} onClick=${() => pick(x)}>${x.titulo || x.chave}</button>`)}</div>
    ${cur && html`<div class="tx-grid">
      <div class="panel"><p class="hint">Aparece em: <b>${ONDE[cur.chave] || cur.chave}</b> · atualizado ${relTime(orig?.updated_at)}</p>
        <label>Título<input type="text" value=${cur.titulo} onInput=${(e) => setCur({ ...cur, titulo: e.target.value })} /></label>
        <label>Texto<textarea rows="16" value=${cur.corpo} onInput=${(e) => setCur({ ...cur, corpo: e.target.value })}></textarea></label>
        <p class="hint">Linha em branco separa parágrafos. <code>## Título</code> · <code>- item de lista</code> · <code>**negrito**</code> · <code>[texto](https://endereço)</code></p>
        <div class="actions"><button class="btn ghost" disabled=${!dirty || busy} onClick=${() => setCur({ ...orig })}>Desfazer</button>
          <button class="btn primary" disabled=${!dirty || busy} onClick=${salvar}>${busy ? 'Salvando…' : 'Salvar e publicar'}</button></div></div>
      <div class="panel preview"><p class="hint">Pré-visualização</p><h2>${cur.titulo}</h2><div class="md" dangerouslySetInnerHTML=${{ __html: md(cur.corpo) }}></div></div>
    </div>`}
  </div>`;
}
