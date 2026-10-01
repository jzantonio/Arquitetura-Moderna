// Portal · leitura de uma ficha publicada (somente os dados liberados pelo banco em "dados_publicos")
import { html, useState } from '../vendor/preact-htm.js';
import { SCHEMA, LISTS, iim, isEmpty, secTitle } from '../campo/js/logic.js';

const FORA = new Set(['0', '23']); // visita de campo e entrevista nunca chegam ao público
const SIM = new Set(['SN', 'SNV', 'AMB', 'DANOMAP']);
const fmt = (v) => (typeof v === 'number' ? v.toLocaleString('pt-BR') : String(v));
const has = (v) => !isEmpty(v) && v !== '—';

export function nomeDe(d = {}, im = {}) { return d['1.2.1'] || d['1.2.2'] || d['1.2.3'] || d['1.2.4'] || im.nome || d['1.1.1'] || ''; }

// fatos principais, na ordem em que interessam a quem visita
export function destaques(d = {}) {
  const m = iim(d);
  const ano = d['4.1'] || d['crono|3|D'] || d['crono|0|D'];
  return [
    ['Nome original', d['1.2.2']], ['Data provável', ano], ['Período', d['4.2']], ['Autoria', d['3.1.1']],
    ['Tipologia original', d['2.2.1']], ['Linguagem moderna', d['2.3.1']], ['Uso original', d['11.1']], ['Uso atual', d['11.2']],
    ['Pavimentos', d['8.1.1']], ['Estado de conservação', d['16.1']], ['Proteção', d['1.5.1']],
    ['IIM', m.pct === null ? '' : `${Math.round(m.pct * 100)}% · ${m.cat}`], ['Prioridade', d['21.1']],
  ].filter(([, v]) => has(v));
}

function entradas(sec, d) {
  const out = []; let sub = null;
  const push = (e) => { if (sub) { out.push({ t: 'sub', label: sub }); sub = null; } out.push(e); };
  for (const it of sec.items) {
    if (it.type === 'sub') { sub = it.title; continue; }
    if (it.type === 'field') {
      if (it.kind === 'computed') {
        const m = iim(d); if (m.pct === null) continue;
        const v = it.id === '14.2.1' ? m.n : it.id === '14.2.2' ? `${Math.round(m.pct * 1000) / 10}%` : m.cat;
        push({ t: 'f', code: it.code, label: it.label, v }); continue;
      }
      if (has(d[it.id])) push({ t: 'f', code: it.code, label: it.label, v: d[it.id], fonte: d[it.id + '|fonte'] });
    } else if (it.type === 'check') {
      const vals = it.options.map((o) => [o, d[`${it.id}|${o}`]]).filter(([, v]) => has(v));
      if (!vals.length) continue;
      if (SIM.has(it.list)) { const sim = vals.filter(([, v]) => v === 'Sim').map(([o]) => o); if (sim.length) push({ t: 'tags', code: it.code, label: it.label, v: sim }); }
      else push({ t: 'pairs', code: it.code, label: it.label, v: vals });
    } else if (it.type === 'table') {
      const rows = it.rows.map((r, i) => [r.label, it.cols.map((c) => d[`${it.id}|${i}|${c.key}`]).filter(has)]).filter(([, v]) => v.length);
      if (rows.length) push({ t: 'rows', label: it.rowHeader || '', v: rows.map(([l, v]) => [l, v.map(fmt).join(' · ')]) });
    } else if (it.type === 'rtable') {
      const rows = (Array.isArray(d[it.id]) ? d[it.id] : []).map((r) => it.cols.map((c) => r[c.key]).filter(has).map(fmt).join(' · ')).filter(Boolean);
      if (rows.length) push({ t: 'list', label: it.id === 'alteracoes' ? 'Alterações registradas' : it.id === 'inspecoes' ? 'Inspeções' : 'Registros', v: rows });
    } else if (it.type === 'matrix') {
      const rows = it.rows.map(([nome], i) => [nome, d[`matriz|${i}|ini`], d[`matriz|${i}|atu`]]).filter(([, a, b]) => has(a) || has(b));
      if (rows.length) push({ t: 'rows', label: 'Matriz de monitoramento (1 a 5)', v: rows.map(([n, a, b]) => [n, `inicial ${a || '—'} · atual ${b || '—'}`]) });
    }
  }
  return out;
}

function Entrada({ e }) {
  if (e.t === 'sub') return html`<h4 class="fp-sub">${e.label}</h4>`;
  if (e.t === 'f') return html`<div class="fp-f"><dt><span class="fp-code">${e.code}</span> ${e.label}</dt><dd>${fmt(e.v)}${has(e.fonte) ? html`<small class="fp-fonte">${e.fonte}</small>` : ''}</dd></div>`;
  if (e.t === 'tags') return html`<div class="fp-f"><dt><span class="fp-code">${e.code}</span> ${e.label}</dt><dd class="fp-tags">${e.v.map((x) => html`<span>${x}</span>`)}</dd></div>`;
  if (e.t === 'pairs') return html`<div class="fp-f"><dt><span class="fp-code">${e.code}</span> ${e.label}</dt><dd><ul class="fp-pairs">${e.v.map(([o, v]) => html`<li>${o}: <b>${fmt(v)}</b></li>`)}</ul></dd></div>`;
  if (e.t === 'rows') return html`<div class="fp-f wide"><dt>${e.label}</dt><dd><table class="fp-tbl"><tbody>${e.v.map(([l, v]) => html`<tr><th>${l}</th><td>${v}</td></tr>`)}</tbody></table></dd></div>`;
  if (e.t === 'list') return html`<div class="fp-f wide"><dt>${e.label}</dt><dd><ol class="fp-list">${e.v.map((x) => html`<li>${x}</li>`)}</ol></dd></div>`;
  return null;
}

export function FichaPublica({ d }) {
  const secs = SCHEMA.sections.filter((s) => !FORA.has(s.id)).map((s) => ({ s, e: entradas(s, d) })).filter((x) => x.e.some((e) => e.t !== 'sub'));
  const [aberto, setAberto] = useState(false);
  return html`<div class="fp">
    <div class="fp-h"><h2>Ficha de inventário</h2><button class="lnk" onClick=${() => setAberto(!aberto)}>${aberto ? 'Recolher seções' : 'Abrir todas as seções'}</button></div>
    <p class="muted">${secs.length} seções da FIAMS com informação registrada. Toque em uma seção para ler.</p>
    ${secs.map(({ s, e }) => html`<details class="fp-sec" open=${aberto} key=${s.id + String(aberto)}>
      <summary><span class="fp-n">${s.id.replace('–27', '')}</span><span>${secTitle(s).replace(/^[\d–]+\.\s*/, '')}</span><small>${e.filter((x) => x.t !== 'sub').length}</small></summary>
      <dl class="fp-dl">${e.map((x) => html`<${Entrada} e=${x} />`)}</dl></details>`)}
  </div>`;
}

export function creditos(d = {}) {
  return [['Responsável técnico', d['25.1.1']], ['Pesquisa histórica', d['25.2.1']], ['Levantamento de campo', d['25.2.2']], ['SIG', d['25.2.3']],
    ['Avaliação patrimonial', d['25.2.4']], ['Instituição', d['25.3']], ['Revisão', d['25.5']]].filter(([, v]) => has(v));
}
export { LISTS };
