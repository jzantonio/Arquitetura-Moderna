// FIAMS Campo · formulário da ficha
import { html, useState, useRef, useEffect } from '../../vendor/preact-htm.js';
import { LISTS, TAG_INFO, hiddenReason, inCat, iim, iimPoints, isEmpty } from './logic.js';
import { toast } from './ui.js';

const tagCls = (tag) => TAG_INFO[tag]?.cls || 'doc';

// ---------------------------------------------------------------- UTM (SIRGAS 2000 ≈ WGS84)
export function toUTM(lat, lon) {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996;
  const zone = Math.floor((lon + 180) / 6) + 1, lon0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const φ = lat * Math.PI / 180, λ = lon * Math.PI / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(φ) ** 2), T = Math.tan(φ) ** 2, C = ep2 * Math.cos(φ) ** 2, A = Math.cos(φ) * (λ - lon0);
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * φ - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * φ)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * φ) - (35 * e2 ** 3 / 3072) * Math.sin(6 * φ));
  const E = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  let Nn = k0 * (M + N * Math.tan(φ) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720));
  if (lat < 0) Nn += 10000000;
  const band = 'CDEFGHJKLMNPQRSTUVWXX'[Math.floor((lat + 80) / 8)];
  return { E: Math.round(E * 100) / 100, N: Math.round(Nn * 100) / 100, zona: `${zone}${band}` };
}

// ---------------------------------------------------------------- controles
export function Segmented({ options, value, onChange, ro, cls = '', name }) {
  return html`<div class=${'seg ' + cls} role="radiogroup" aria-label=${name}>
    ${options.map((o) => html`<button type="button" role="radio" aria-checked=${value === o} class=${value === o ? 'on' : ''} disabled=${ro}
      onClick=${() => onChange(value === o ? '' : o)}>${o}</button>`)}</div>`;
}
const useSeg = (opts) => opts.length <= 5 && opts.join('').length <= 64;

export function Control({ id, kind, list, value, onChange, ro, placeholder }) {
  if (list) {
    const opts = LISTS[list] || [];
    if (useSeg(opts)) return html`<${Segmented} options=${opts} value=${value} onChange=${onChange} ro=${ro} name=${id} />`;
    return html`<select id=${'in-' + id} value=${value ?? ''} disabled=${ro} onChange=${(e) => onChange(e.target.value)}>
      <option value="">Selecione…</option>${opts.map((o) => html`<option value=${o}>${o}</option>`)}</select>`;
  }
  if (kind === 'textarea') return html`<${AutoText} id=${'in-' + id} value=${value} onChange=${onChange} ro=${ro} placeholder=${placeholder} />`;
  if (kind === 'date') return html`<div class="row-in"><input id=${'in-' + id} type="date" value=${value || ''} disabled=${ro} onChange=${(e) => onChange(e.target.value)} />
    ${!ro && html`<button type="button" class="btn ghost sm" onClick=${() => onChange(new Date().toISOString().slice(0, 10))}>Hoje</button>`}</div>`;
  if (kind === 'number') return html`<${NumIn} id=${'in-' + id} value=${value} onChange=${onChange} ro=${ro} />`;
  return html`<${TextIn} id=${'in-' + id} value=${value} onChange=${onChange} ro=${ro} placeholder=${placeholder} />`;
}
function TextIn({ id, value, onChange, ro, placeholder }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  return html`<input id=${id} type="text" value=${v} disabled=${ro} placeholder=${placeholder || ''} onInput=${(e) => setV(e.target.value)} onBlur=${() => v !== (value ?? '') && onChange(v)} onKeyDown=${(e) => e.key === 'Enter' && e.target.blur()} />`;
}
function NumIn({ id, value, onChange, ro }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  const commit = () => {
    const s = String(v).trim().replace(',', '.');
    const n = s === '' ? '' : (isNaN(Number(s)) ? String(v) : Number(s));
    if (n !== (value ?? '')) onChange(n);
  };
  return html`<input id=${id} type="text" inputmode="decimal" value=${v} disabled=${ro} onInput=${(e) => setV(e.target.value)} onBlur=${commit} onKeyDown=${(e) => e.key === 'Enter' && e.target.blur()} />`;
}
function AutoText({ id, value, onChange, ro, placeholder }) {
  const [v, setV] = useState(value ?? ''); const ref = useRef();
  useEffect(() => setV(value ?? ''), [value]);
  useEffect(() => { const t = ref.current; if (t) { t.style.height = 'auto'; t.style.height = Math.min(520, t.scrollHeight + 2) + 'px'; } }, [v]);
  return html`<textarea ref=${ref} id=${id} rows="3" value=${v} disabled=${ro} placeholder=${placeholder || ''} onInput=${(e) => setV(e.target.value)} onBlur=${() => v !== (value ?? '') && onChange(v)}></textarea>`;
}

// ---------------------------------------------------------------- linha de campo
function PreBadge({ id, d, set, ro }) {
  if (!(d.__pre || []).includes(id)) return null;
  return html`<span class="pre" title="Valor trazido do Inventário v4">do inventário
    ${!ro && html`<button type="button" class="pre-ok" onClick=${() => set('__confirm', id)} title="Confirmar valor em campo">confirmar</button>`}</span>`;
}
function Fonte({ id, d, set, ro }) {
  const k = id + '|fonte'; const has = !isEmpty(d[k]);
  const [open, setOpen] = useState(has);
  if (ro && !has) return null;
  return html`<div class="fonte">
    ${!open ? html`<button type="button" class="link" onClick=${() => setOpen(true)}>+ Fonte ou observação</button>`
      : html`<label class="fonte-l" for=${'in-' + k}>Fonte · grau de certeza</label><${TextIn} id=${'in-' + k} value=${d[k]} onChange=${(v) => set(k, v)} ro=${ro} placeholder="Ex.: verificado in loco; OBS. do inventário; entrevista" />`}</div>`;
}

function GPS({ set, ro }) {
  const [busy, setBusy] = useState(false);
  if (ro) return null;
  const go = () => {
    if (!navigator.geolocation) return toast('Este aparelho não oferece localização.', 'err');
    setBusy(true);
    navigator.geolocation.getCurrentPosition((p) => {
      const { latitude: la, longitude: lo, altitude: al, accuracy: ac } = p.coords;
      const u = toUTM(la, lo); const quando = new Date().toLocaleString('pt-BR');
      set('__many', {
        '1.4.1': Math.round(la * 1e6) / 1e6, '1.4.1|fonte': `GPS do aparelho (±${Math.round(ac)} m), ${quando}`,
        '1.4.2': Math.round(lo * 1e6) / 1e6, '1.4.2|fonte': `GPS do aparelho (±${Math.round(ac)} m), ${quando}`,
        '1.4.3': u.E, '1.4.4': u.N, '1.4.5': u.zona,
        ...(al != null ? { '1.4.7': Math.round(al * 10) / 10 } : {}),
        '1.4.8': ac <= 1 ? 'GNSS geodésico (< 1 m)' : 'GPS de navegação / celular (± 5–10 m)',
      });
      setBusy(false); toast(`Posição registrada (precisão de ±${Math.round(ac)} m).`);
    }, (e) => { setBusy(false); toast('Não foi possível obter a posição: ' + (e.message || 'permissão negada'), 'err'); },
    { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
  };
  return html`<div class="gps"><button type="button" class="btn campo" onClick=${go} disabled=${busy}>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="2" fill="none"/></svg>
    ${busy ? 'Obtendo posição…' : 'Capturar posição pelo GPS'}</button>
    <p class="hint">Preenche latitude, longitude, UTM, altitude e precisão. Fique junto ao acesso principal do lote.</p></div>`;
}

export function FieldRow({ it, d, set, ro }) {
  const why = hiddenReason(it.id, d);
  if (why) return html`<div class="fld skipped"><span class="code">${it.code}</span> ${it.label} <em>— não se aplica: ${why}</em></div>`;
  if (it.kind === 'computed') {
    const m = iim(d);
    const v = it.id === '14.2.1' ? m.n : it.id === '14.2.2' ? (m.pct === null ? '—' : `${Math.round(m.pct * 1000) / 10}%`) : (m.cat || '—');
    return html`<div class=${'fld t-ana computed'}><div class="fld-h"><span class="code">${it.code}</span><span class="lbl">${it.label}</span></div><div class="computed-v">${v}</div><p class="hint">Calculado automaticamente a partir dos atributos A1–A7.</p></div>`;
  }
  return html`<div class=${'fld t-' + tagCls(it.tag) + (it.tag === 'CAMPO + DOC' ? ' cd' : '')} id=${'f-' + it.id}>
    ${it.id === '1.4.1' && html`<${GPS} set=${set} ro=${ro} />`}
    <div class="fld-h"><span class="code">${it.code}</span><label class="lbl" for=${'in-' + it.id}>${it.label}</label><${PreBadge} id=${it.id} d=${d} set=${set} ro=${ro} /></div>
    ${it.hint && html`<p class="hint">${it.hint}</p>`}
    <${Control} id=${it.id} kind=${it.kind} list=${it.list} value=${d[it.id]} onChange=${(v) => set(it.id, v)} ro=${ro} />
    <${Fonte} id=${it.id} d=${d} set=${set} ro=${ro} />
  </div>`;
}

export function CheckGroup({ it, d, set, ro, cat, after }) {
  const opts = LISTS[it.list] || [];
  return html`<div class=${'chk t-' + tagCls(it.tag)} id=${'f-' + it.id}>
    <div class="fld-h"><span class="code">${it.code}</span><span class="lbl">${it.label}</span></div>
    ${it.hint && html`<p class="hint">${it.hint}</p>`}
    <ul class="chk-l">${it.options.map((o) => {
      const id = `${it.id}|${o}`; const why = hiddenReason(id, d);
      if (why) return html`<li class="skipped">${o} <em>— não se aplica: ${why}</em></li>`;
      const pre = (d.__pre || []).includes(id);
      return html`<li class=${!isEmpty(d[id]) ? 'done' : ''}><span class="opt">${o}${pre && html` <span class="pre small">do inventário</span>`}</span>
        <${Segmented} options=${opts} value=${d[id]} onChange=${(v) => set(id, v)} ro=${ro} cls="sm" name=${o} />
        ${!isEmpty(d[id + '|fonte']) && html`<span class="opt-f">${d[id + '|fonte']}</span>`}</li>`;
    })}</ul>${after}</div>`;
}

function CellInput({ id, col, d, set, ro }) {
  if (col.computed) {
    const p = iimPoints(d[id.replace(/\|E$/, '|D')]);
    return html`<div class="pts">${p === null ? '—' : p} <small>pontos</small></div>`;
  }
  return html`<${Control} id=${id} kind=${col.kind || (col.list ? null : 'text')} list=${col.list} value=${d[id]} onChange=${(v) => set(id, v)} ro=${ro} />`;
}

export function TableFixed({ it, d, set, ro, cat }) {
  const m = it.id === 'iim' ? iim(d) : null;
  return html`<div class="tbl" id=${'f-' + it.id}>
    ${it.rows.map((r, i) => inCat(r.tag, cat) && html`<div class=${'trow t-' + tagCls(r.tag)}>
      <div class="trow-h"><b>${r.label}</b>${(d.__pre || []).some((k) => k.startsWith(`${it.id}|${i}|`)) && html`<span class="pre small">do inventário</span>`}</div>
      <div class="trow-c">${it.cols.map((c) => html`<div class="cell"><span class="cell-l">${c.label}</span>
        <${CellInput} id=${`${it.id}|${i}|${c.key}`} col=${c} d=${d} set=${set} ro=${ro} /></div>`)}</div></div>`)}
    ${m && html`<div class="iim-box"><div><span class="iim-n">${m.pct === null ? '—' : Math.round(m.pct * 100) + '%'}</span><span class="iim-c">${m.cat || 'Registre o estado dos atributos'}</span></div>
      <p class="hint">IIM = pontos ÷ (atributos aplicáveis × 2). Preservado 2 · Adaptado 1 · Suprimido 0 · n.a./s.d. fora do cálculo. ${m.n} de 7 atributos avaliados.</p></div>`}
  </div>`;
}

export function RTable({ it, d, set, ro }) {
  const rows = Array.isArray(d[it.id]) ? d[it.id] : [];
  const upd = (i, k, v) => { const n = rows.map((r) => ({ ...r })); n[i][k] = v; set(it.id, n); };
  return html`<div class="tbl rtbl" id=${'f-' + it.id}>
    ${rows.length === 0 && html`<p class="hint">Nenhum registro ainda.</p>`}
    ${rows.map((r, i) => html`<div class=${'trow t-' + tagCls(it.tag)}>
      <div class="trow-h"><b>Registro ${i + 1}</b>${!ro && html`<button type="button" class="link danger" onClick=${() => confirm('Remover este registro?') && set(it.id, rows.filter((_, j) => j !== i))}>Remover</button>`}</div>
      <div class="trow-c">${it.cols.map((c) => html`<div class="cell"><span class="cell-l">${c.label}</span>
        <${Control} id=${`${it.id}-${i}-${c.key}`} kind=${c.kind || 'text'} list=${c.list} value=${r[c.key]} onChange=${(v) => upd(i, c.key, v)} ro=${ro} /></div>`)}</div></div>`)}
    ${!ro && html`<button type="button" class="btn ghost" onClick=${() => set(it.id, [...rows, {}])}>+ Adicionar registro</button>`}</div>`;
}

export function Matrix({ it, d, set, ro }) {
  const sc = ['1', '2', '3', '4', '5'];
  return html`<div class="tbl" id=${'f-' + it.id}>${it.rows.map(([nome, esc], i) => {
    const a = Number(d[`matriz|${i}|ini`]), b = Number(d[`matriz|${i}|atu`]);
    const t = a && b ? (b > a ? '↑ melhora' : b < a ? '↓ piora' : '→ estável') : '';
    return html`<div class="trow t-ana"><div class="trow-h"><b>${nome}</b><span class="hint">${esc}</span>${t && html`<span class=${'trend ' + (b > a ? 'up' : b < a ? 'down' : '')}>${t}</span>`}</div>
      <div class="trow-c"><div class="cell"><span class="cell-l">Situação inicial</span><${Segmented} options=${sc} value=${d[`matriz|${i}|ini`]} onChange=${(v) => set(`matriz|${i}|ini`, v)} ro=${ro} cls="sm" /></div>
      <div class="cell"><span class="cell-l">Situação atual</span><${Segmented} options=${sc} value=${d[`matriz|${i}|atu`]} onChange=${(v) => set(`matriz|${i}|atu`, v)} ro=${ro} cls="sm" /></div></div></div>`;
  })}</div>`;
}

// ---------------------------------------------------------------- seção
function itemInCat(it, cat) {
  if (it.type === 'table') return it.rows.some((r) => inCat(r.tag, cat));
  if (it.type === 'matrix') return inCat(it.tag, cat);
  return it.tag ? inCat(it.tag, cat) : false;
}
export function SectionView({ sec, d, set, ro, cat, slots = {} }) {
  const blocks = []; let cur = { sub: null, items: [] };
  for (const it of sec.items) {
    if (it.type === 'sub') { blocks.push(cur); cur = { sub: it, items: [] }; } else cur.items.push(it);
  }
  blocks.push(cur);
  return html`<div class="secview">${blocks.map((b) => {
    const vis = b.items.filter((it) => it.type === 'note' ? cat === 'todos' : itemInCat(it, cat));
    if (!vis.length) return null;
    return html`<section class="blk">${b.sub && html`<h3 class="sub">${b.sub.title}</h3>`}
      ${vis.map((it) => {
        if (it.type === 'note') return html`<aside class="note">${it.text}</aside>`;
        if (it.type === 'field') return html`<${FieldRow} it=${it} d=${d} set=${set} ro=${ro} />`;
        if (it.type === 'check') return html`<${CheckGroup} it=${it} d=${d} set=${set} ro=${ro} cat=${cat} after=${slots[it.id]} />`;
        if (it.type === 'table') return html`<${TableFixed} it=${it} d=${d} set=${set} ro=${ro} cat=${cat} />`;
        if (it.type === 'rtable') return html`<${RTable} it=${it} d=${d} set=${set} ro=${ro} />`;
        if (it.type === 'matrix') return html`<${Matrix} it=${it} d=${d} set=${set} ro=${ro} />`;
        return null;
      })}</section>`;
  })}</div>`;
}
