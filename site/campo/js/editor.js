// FIAMS Campo · editor da ficha
import { html, useState, useEffect, useMemo, useCallback } from '../../vendor/preact-htm.js';
import { SCHEMA, CATS, progress, progressSummary, essentials, narrative, sectionHasCat, secTitle, stageOf, pctOf, isEmpty, STATUS } from './logic.js';
import { api, openFicha, saveFichaLocal, queuePhoto, pendingPhotos, flushAll, compressImage, onSync, getSyncState } from './store.js';
import { SectionView, Segmented } from './form.js';
import { Cobogo, Bar, Ring, CatBars, StatusPill, Modal, toast, nav, relTime } from './ui.js';

const VISTAS = SCHEMA.sections.find((s) => s.id === '22').items.find((i) => i.id === '22.3').options;
const ORIENT = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];

export function SyncBadge() {
  const [s, setS] = useState(getSyncState());
  useEffect(() => onSync(setS), []);
  let t = 'Salvo', c = 'ok', title = 'Tudo salvo no servidor.';
  if (!s.online) { t = 'Offline'; c = 'off'; title = s.pending ? 'Sem internet. As alterações estão guardadas no aparelho e serão enviadas quando a conexão voltar.' : 'Sem internet.'; }
  else if (s.saving) { t = 'Salvando…'; c = 'busy'; }
  else if (s.error) { t = 'Erro'; c = 'err'; title = 'Erro ao salvar: ' + s.error + '. As alterações continuam no aparelho.'; }
  else if (s.pending) { t = 'Salvando…'; c = 'busy'; }
  return html`<span class=${'sync ' + c} title=${title} aria-live="polite">${t}</span>`;
}

function NavGrid({ p, cat, cur, onPick }) {
  return html`<div class="navgrid">${SCHEMA.stages.map((st) => html`<div class="ng-stage">
    <div class="ng-h">${st.title}</div>
    <div class="ng-tiles">${st.secs.map((sid) => {
      const s = SCHEMA.sections.find((x) => x.id === sid); const on = sectionHasCat(s, cat);
      const pr = pctOf(p.secs[sid]);
      return html`<button type="button" class=${'ng-t' + (sid === cur ? ' cur' : '') + (on ? '' : ' dim')} onClick=${() => on && onPick(sid)} disabled=${!on}
        title=${`${secTitle(s)} — ${pr}%`} aria-label=${`${secTitle(s)}, ${pr}% completo`}>
        <${Cobogo} pct=${pr} size=${34} /><span>${sid === '0' ? 'V' : sid.replace('–27', '')}</span></button>`;
    })}</div></div>`)}</div>`;
}

function PhotoDialog({ onClose, onSave }) {
  const [file, setFile] = useState(null); const [url, setUrl] = useState('');
  const [vista, setVista] = useState('Fachada principal'); const [ori, setOri] = useState(''); const [leg, setLeg] = useState('');
  const [busy, setBusy] = useState(false);
  const pick = (e) => { const f = e.target.files[0]; if (!f) return; setFile(f); setUrl(URL.createObjectURL(f)); };
  const save = async () => { setBusy(true); try { await onSave(file, { vista, orientacao: ori, legenda: leg }); onClose(); } finally { setBusy(false); } };
  return html`<${Modal} title="Registrar foto" onClose=${onClose}>
    <label class="photo-pick">${url ? html`<img src=${url} alt="Pré-visualização" />` : html`<span>Tocar para fotografar ou escolher da galeria</span>`}
      <input type="file" accept="image/*" capture="environment" onChange=${pick} /></label>
    <div class="fld"><label class="lbl" for="vista">Vista ou elemento (22.3)</label>
      <select id="vista" onChange=${(e) => setVista(e.target.value)}>${VISTAS.map((v) => html`<option value=${v} selected=${v === vista}>${v}</option>`)}</select></div>
    <div class="fld"><span class="lbl">Orientação da câmera</span><${Segmented} options=${ORIENT} value=${ori} onChange=${setOri} cls="sm" name="Orientação" /></div>
    <div class="fld"><label class="lbl" for="leg">Legenda</label><input id="leg" type="text" value=${leg} onInput=${(e) => setLeg(e.target.value)} placeholder="Ex.: marquise curva sobre apoio central" /></div>
    <div class="actions"><button class="btn ghost" onClick=${onClose}>Cancelar</button><button class="btn primary" disabled=${!file || busy} onClick=${save}>${busy ? 'Salvando…' : 'Salvar foto'}</button></div>
  </${Modal}>`;
}

function Gallery({ fotos, pend, ro, onDel, onAdd }) {
  return html`<div class="gallery">
    ${fotos.map((f) => html`<figure><img src=${f.url} alt=${f.legenda || f.vista} loading="lazy" /><figcaption><b>${f.vista}</b>${f.orientacao ? ` (${f.orientacao})` : ''}${f.legenda ? html`<br/>${f.legenda}` : ''}</figcaption>
      ${!ro && html`<button class="icon-btn del" aria-label="Apagar foto" onClick=${() => confirm('Apagar esta foto?') && onDel(f)}>✕</button>`}</figure>`)}
    ${pend.map((p) => html`<figure class="pend"><div class="pend-box">Aguardando conexão para enviar</div><figcaption><b>${p.meta.vista}</b></figcaption></figure>`)}
    ${!ro && html`<button class="add-photo" onClick=${onAdd}>+ Foto</button>`}
  </div>`;
}

function SubmitDialog({ d, nFotos, onClose, onSubmit, goSec }) {
  const ess = essentials(d, nFotos); const ok = ess.every((e) => e.ok); const [busy, setBusy] = useState(false);
  return html`<${Modal} title="Revisar e enviar para supervisão" onClose=${onClose}>
    <div class="narr">${narrative(d, nFotos).map((t) => html`<p>${t}</p>`)}</div>
    <h3 class="sub">Itens essenciais</h3>
    <p class="hint">Só estes itens são exigidos para o envio. O restante pode ser completado depois, inclusive após o retorno da supervisão.</p>
    <ul class="ess">${ess.map((e) => html`<li class=${e.ok ? 'ok' : 'no'}><span aria-hidden="true">${e.ok ? '✓' : '!'}</span>${e.label}
      ${!e.ok && html`<button class="link" onClick=${() => { onClose(); goSec(e.sec); }}>Ir para a seção</button>`}</li>`)}</ul>
    <div class="actions"><button class="btn ghost" onClick=${onClose}>Continuar editando</button>
      <button class="btn primary" disabled=${!ok || busy} onClick=${async () => { setBusy(true); await onSubmit(); setBusy(false); }}>${busy ? 'Enviando…' : 'Enviar para supervisão'}</button></div>
  </${Modal}>`;
}

export function Editor({ id, secParam, profile, readonly }) {
  const [f, setF] = useState(null); const [d, setD] = useState(null); const [err, setErr] = useState('');
  const [cat, setCat] = useState(localStorage.getItem('fiams-cat') || 'todos');
  const [sec, setSec] = useState(secParam || '0');
  const [fotos, setFotos] = useState([]); const [pend, setPend] = useState([]); const [revs, setRevs] = useState([]);
  const [modal, setModal] = useState(null); const [navOpen, setNavOpen] = useState(false);

  const loadFotos = useCallback(async () => {
    try { setFotos(await api.listFotos(id)); } catch { /* offline */ }
    setPend(await pendingPhotos(id));
  }, [id]);
  useEffect(() => {
    let alive = true;
    openFicha(id).then((x) => { if (!alive) return; setF(x); setD(x.dados || {}); if (x._offline) toast('Sem conexão: exibindo a cópia salva no aparelho.'); })
      .catch((e) => setErr(e.message || String(e)));
    loadFotos(); api.listRevisoes(id).then(setRevs).catch(() => {});
    const h = (e) => e.detail === id && loadFotos(); window.addEventListener('fiams-foto', h);
    return () => { alive = false; window.removeEventListener('fiams-foto', h); };
  }, [id]);
  useEffect(() => { localStorage.setItem('fiams-cat', cat); }, [cat]);
  useEffect(() => { history.replaceState(null, '', `#/ficha/${id}/${encodeURIComponent(sec)}`); window.scrollTo({ top: 0 }); }, [sec]);

  const nFotos = fotos.length + pend.length;
  const p = useMemo(() => (d ? progress(d, nFotos) : null), [d, nFotos]);
  if (err) return html`<div class="page"><p class="err">Não foi possível abrir a ficha: ${err}</p><button class="btn" onClick=${() => nav('#/')}>Voltar</button></div>`;
  if (!f || !d) return html`<div class="page"><div class="loading">Abrindo ficha…</div></div>`;

  const owner = f.aluno_id ? f.aluno_id === api.uid() : true;
  const ro = readonly || !owner || !['rascunho', 'devolvida'].includes(f.status);
  const meta = { imoveis: f.imoveis, status: f.status };
  const set = (k, v) => {
    if (ro) return;
    setD((prev) => {
      let n;
      if (k === '__confirm') n = { ...prev, __pre: (prev.__pre || []).filter((x) => x !== v), [v + '|fonte']: `${prev[v + '|fonte'] ? prev[v + '|fonte'] + ' · ' : ''}confirmado em campo ${new Date().toLocaleDateString('pt-BR')}` };
      else if (k === '__many') n = { ...prev, ...v, __pre: (prev.__pre || []).filter((x) => !(x in v)) };
      else n = { ...prev, [k]: v, __pre: (prev.__pre || []).filter((x) => x !== k) };
      saveFichaLocal(id, n, meta, nFotos);
      return n;
    });
  };
  const secs = SCHEMA.sections.filter((s) => sectionHasCat(s, cat));
  let idx = secs.findIndex((s) => s.id === sec); if (idx < 0) idx = 0;
  const S = secs[idx]; const st = stageOf(S.id);
  const go = (sid) => { setSec(sid); setNavOpen(false); };
  const secRevs = revs.filter((r) => r.secao === S.id && r.tipo === 'comentario');

  const savePhoto = async (file, m) => {
    const blob = await compressImage(file);
    await queuePhoto(id, blob, m);
    set(`22.3|${m.vista}`, 'Sim');
    await loadFotos(); toast(navigator.onLine ? 'Foto enviada.' : 'Foto guardada no aparelho; será enviada quando houver conexão.');
  };
  const delPhoto = async (x) => { try { await api.deleteFoto(x); await loadFotos(); } catch (e) { toast('Não foi possível apagar: ' + e.message, 'err'); } };
  const submit = async () => {
    try { await flushAll(); await api.setStatus(id, 'enviada', progressSummary(d, nFotos)); setF({ ...f, status: 'enviada' }); setModal(null); toast('Ficha enviada para a supervisão.'); }
    catch (e) { toast('Não foi possível enviar: ' + (e.message || e), 'err'); }
  };
  const slots = { '22.3': html`<${Gallery} fotos=${fotos} pend=${pend} ro=${ro} onDel=${delPhoto} onAdd=${() => setModal('foto')} />` };
  const im = f.imoveis || {};
  const openRevs = revs.filter((r) => r.tipo === 'comentario' && !r.resolvido);

  return html`<div class="editor">
    <header class="ed-top">
      <button class="icon-btn back" onClick=${() => history.length > 1 ? history.back() : nav('#/')} aria-label="Voltar">‹</button>
      <div class="ed-id"><span class="ed-code">${d['1.1.1'] || im.id}</span><span class="ed-name">${d['1.2.1'] || d['1.2.2'] || d['1.2.4'] || im.nome}</span></div>
      ${!ro && html`<${SyncBadge} />`}
      <button class="ring-btn" onClick=${() => setModal('resumo')} aria-label="Ver resumo da ficha"><${Ring} value=${p.pct} size=${46} /></button>
    </header>
    <div class="ed-tools"><${Segmented} options=${CATS.map((c) => c.label)} value=${CATS.find((c) => c.id === cat).label}
      onChange=${(v) => { const c = CATS.find((x) => x.label === v) || CATS[0]; setCat(c.id); }} cls="cats" name="Filtrar por tipo de coleta" />
      <p class="tools-h">${cat === 'campo' ? 'Modo campo: só o que se observa, mede, fotografa ou pergunta no local.' : cat === 'doc' ? 'Pesquisa documental: arquivos, cartografia e bibliografia.' : cat === 'ana' ? 'Análise: avaliações feitas depois do campo.' : 'Ficha completa, na ordem da FIAMS.'}</p></div>
    <div class="ed-body">
      <aside class="ed-side"><${NavGrid} p=${p} cat=${cat} cur=${S.id} onPick=${go} />
        <div class="side-card"><h4>Por tipo de coleta</h4><${CatBars} cats=${p.cats} /></div></aside>
      <main class="ed-main">
        ${ro && html`<div class="banner info">${!owner ? 'Visualização da supervisão (somente leitura).' : f.status === 'aprovada' ? 'Ficha aprovada pela supervisão. Edição encerrada.' : 'Ficha enviada. A edição fica bloqueada até o retorno da supervisão.'} <${StatusPill} s=${f.status} /></div>`}
        ${owner && f.status === 'devolvida' && html`<div class="banner warn">A supervisão devolveu esta ficha${openRevs.length ? ` com ${openRevs.length} comentário${openRevs.length > 1 ? 's' : ''} em aberto` : ''}. Corrija e envie de novo.
          <button class="link" onClick=${() => setModal('revs')}>Ver comentários</button></div>`}
        <div class="stage-strip">${SCHEMA.stages.map((s2) => {
          const ss = s2.secs.filter((x) => secs.some((y) => y.id === x)); if (!ss.length) return null;
          const tot = ss.reduce((a, x) => [a[0] + (p.secs[x]?.[0] || 0), a[1] + (p.secs[x]?.[1] || 0)], [0, 0]);
          return html`<button class=${'stg' + (s2.id === st.id ? ' on' : '')} onClick=${() => go(ss[0])}><b>${s2.title}</b><${Bar} value=${pctOf(tot)} /></button>`;
        })}</div>
        <div class="sec-head"><div class="sec-num" aria-hidden="true">${S.id === '0' ? 'V' : S.id}</div>
          <div><p class="sec-stage">Etapa ${SCHEMA.stages.indexOf(st) + 1} de 7 · ${st.title}</p><h2>${S.id === '0' ? 'Visita de campo' : S.title}</h2>
          <div class="sec-prog"><${Bar} value=${pctOf(p.secs[S.id])} /><span>${p.secs[S.id] ? `${p.secs[S.id][0]} de ${p.secs[S.id][1]} itens` : 'sem itens obrigatórios'}</span></div></div></div>
        ${secRevs.map((r) => html`<div class=${'rev' + (r.resolvido ? ' done' : '')}><b>Supervisão${r.profiles?.nome ? ' · ' + r.profiles.nome : ''}</b><p>${r.comentario}</p>
          ${owner && !r.resolvido && html`<button class="link" onClick=${async () => { await api.resolveRevisao(r.id, true); setRevs(revs.map((x) => x.id === r.id ? { ...x, resolvido: true } : x)); }}>Marcar como resolvido</button>`}</div>`)}
        <${SectionView} sec=${S} d=${d} set=${set} ro=${ro} cat=${cat} slots=${slots} />
        <div class="sec-foot">
          <button class="btn ghost" disabled=${idx === 0} onClick=${() => go(secs[idx - 1].id)}>‹ ${idx > 0 ? secTitle(secs[idx - 1]) : 'Início'}</button>
          ${idx < secs.length - 1 ? html`<button class="btn primary" onClick=${() => go(secs[idx + 1].id)}>${secTitle(secs[idx + 1])} ›</button>`
            : !ro && html`<button class="btn primary" onClick=${() => setModal('enviar')}>Revisar e enviar</button>`}
        </div>
      </main>
    </div>
    <nav class="ed-bottom" aria-label="Navegação entre seções">
      <button disabled=${idx === 0} onClick=${() => go(secs[idx - 1].id)} aria-label="Seção anterior">‹</button>
      <button class="mid" onClick=${() => setNavOpen(true)}><${Cobogo} pct=${pctOf(p.secs[S.id])} size=${22} /> Seções <small>${idx + 1}/${secs.length}</small></button>
      ${idx < secs.length - 1 ? html`<button onClick=${() => go(secs[idx + 1].id)} aria-label="Próxima seção">›</button>` : html`<button class="send" disabled=${ro} onClick=${() => setModal('enviar')}>Enviar</button>`}
    </nav>
    ${!ro && html`<button class="fab" onClick=${() => setModal('foto')} aria-label="Registrar foto">
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M4 7h3l2-2.5h6L17 7h3v12H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.6" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>`}
    ${navOpen && html`<${Modal} title="Seções da ficha" onClose=${() => setNavOpen(false)}><${NavGrid} p=${p} cat=${cat} cur=${S.id} onPick=${go} />
      <p class="hint">Cada bloco vazado é uma seção da FIAMS; ele fica mais cheio à medida que a seção é preenchida.</p></${Modal}>`}
    ${modal === 'foto' && html`<${PhotoDialog} onClose=${() => setModal(null)} onSave=${savePhoto} />`}
    ${modal === 'enviar' && html`<${SubmitDialog} d=${d} nFotos=${nFotos} onClose=${() => setModal(null)} onSubmit=${submit} goSec=${go} />`}
    ${modal === 'resumo' && html`<${Modal} title="Resumo da ficha" onClose=${() => setModal(null)}>
      <div class="narr">${narrative(d, nFotos).map((t) => html`<p>${t}</p>`)}</div><${CatBars} cats=${p.cats} />
      ${!ro && html`<div class="actions"><button class="btn primary" onClick=${() => setModal('enviar')}>Revisar e enviar</button></div>`}</${Modal}>`}
    ${modal === 'revs' && html`<${Modal} title="Comentários da supervisão" onClose=${() => setModal(null)}>
      ${revs.length ? revs.map((r) => html`<div class=${'rev' + (r.resolvido ? ' done' : '')}><b>${r.tipo === 'devolucao' ? 'Devolução' : r.tipo === 'aprovacao' ? 'Aprovação' : 'Comentário'}${r.secao ? ' · ' + secTitle(SCHEMA.sections.find((s) => s.id === r.secao) || { id: r.secao, title: '' }) : ''}</b>
        <p>${r.comentario}</p><small>${relTime(r.created_at)}</small>${r.secao && html` <button class="link" onClick=${() => { setModal(null); go(r.secao); }}>Ir para a seção</button>`}</div>`) : html`<p>Nenhum comentário.</p>`}</${Modal}>`}
  </div>`;
}
