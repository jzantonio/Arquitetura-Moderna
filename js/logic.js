// FIAMS Campo · regras da ficha (completude, lógica de salto, IIM, textos didáticos)
import { SCHEMA, LISTS } from './schema.js';

export { SCHEMA, LISTS };

export const CATS = [
  { id: 'todos', label: 'Tudo' },
  { id: 'campo', label: 'Campo' },
  { id: 'doc', label: 'Documental' },
  { id: 'ana', label: 'Análise' },
];
export const CAT_NAME = { campo: 'levantamento de campo', doc: 'pesquisa documental', ana: 'análise patrimonial' };
export const TAG_INFO = {
  'CAMPO': { label: 'Campo', cls: 'campo' },
  'CAMPO + DOC': { label: 'Campo + doc.', cls: 'campo' },
  'DOCUMENTAL': { label: 'Documental', cls: 'doc' },
  'ANÁLISE': { label: 'Análise', cls: 'ana' },
};
export const STATUS = {
  rascunho: { label: 'Em preenchimento', cls: 'st-rascunho' },
  enviada: { label: 'Aguardando revisão', cls: 'st-enviada' },
  devolvida: { label: 'Devolvida para correção', cls: 'st-devolvida' },
  aprovada: { label: 'Aprovada', cls: 'st-aprovada' },
};

export const inCat = (tag, cat) =>
  cat === 'todos' ||
  (cat === 'campo' && tag.includes('CAMPO')) ||
  (cat === 'doc' && (tag === 'DOCUMENTAL' || tag === 'CAMPO + DOC')) ||
  (cat === 'ana' && tag === 'ANÁLISE');

export const isEmpty = (v) =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

export const joinPt = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1]);

// ---------------------------------------------------------------- lógica de salto
const SEM_INTERIOR = ['8.2.2', '8.2.3', '8.2.4', '8.2.5', '9.5.3', '9.5.4', '22.3|Espaços internos', '22.3|Circulação'];
const anyYes = (d, code) => Object.keys(d).some((k) => k.startsWith(code + '|') && !k.endsWith('|fonte') && d[k] === 'Sim');

export function hiddenReason(id, d) {
  if (SEM_INTERIOR.includes(id) && d['8.2.1'] === 'Sem acesso ao interior') return 'sem acesso ao interior (8.2.1)';
  if (['1.5.3', '1.5.4', '1.5.5', '1.5.6'].includes(id) && (isEmpty(d['1.5.1']) || d['1.5.1'] === 'Sem proteção identificada'))
    return 'sem instrumento de proteção informado (1.5.1)';
  if (id === '3.1.2' && (isEmpty(d['3.1.1']) || /^Não identificad/.test(String(d['3.1.1'])))) return 'autoria não identificada (3.1.1)';
  if (['10.2', '10.3', '10.4', '10.5'].includes(id) && !anyYes(d, '10.1')) return 'nenhum bem integrado marcado em 10.1';
  if ((/^Q\d$/.test(id) || ['23.2', '23.3', '23.4', '23.5', '23.7'].includes(id)) && isEmpty(d['23.1']))
    return 'sem entrevista registrada (23.1)';
  return null;
}

// ---------------------------------------------------------------- itens contáveis
let _items = null;
export function allItems() {
  if (_items) return _items;
  const out = [];
  for (const s of SCHEMA.sections) {
    for (const it of s.items) {
      if (it.type === 'field') {
        if (it.count && it.kind !== 'computed') out.push({ id: it.id, sec: s.id, tag: it.tag, label: `${it.code} ${it.label}` });
      } else if (it.type === 'check') {
        for (const o of it.options) out.push({ id: `${it.id}|${o}`, sec: s.id, tag: it.tag, label: `${it.code} ${it.label}: ${o}` });
      } else if (it.type === 'table') {
        it.rows.forEach((r, i) => {
          if (r.count) out.push({ id: `${it.id}|${i}`, table: it.id, sec: s.id, tag: r.tag, label: `${it.rowHeader}: ${r.label}` });
        });
      } else if (it.type === 'rtable' && it.count) {
        out.push({ id: it.id, rt: true, sec: s.id, tag: it.tag, label: it.id === 'alteracoes' ? '15.2 Alterações posteriores' : it.id });
      }
    }
  }
  _items = out;
  return out;
}

export function isFilled(item, d) {
  if (item.table) {
    const cols = item.table === 'iim' ? ['D'] : ['D', 'E', 'F'];
    return cols.some((c) => !isEmpty(d[`${item.id}|${c}`]));
  }
  if (item.rt) return Array.isArray(d[item.id]) && d[item.id].some((r) => Object.values(r).some((v) => !isEmpty(v)));
  return !isEmpty(d[item.id]);
}

export function progress(d = {}, nFotos = 0) {
  const cats = { campo: [0, 0], doc: [0, 0], ana: [0, 0] };
  const secs = {};
  const missing = [];
  let done = 0, total = 0;
  for (const it of allItems()) {
    if (hiddenReason(it.id, d)) continue;
    const ok = isFilled(it, d);
    total++; if (ok) done++;
    for (const c of ['campo', 'doc', 'ana']) if (inCat(it.tag, c)) { cats[c][1]++; if (ok) cats[c][0]++; }
    secs[it.sec] = secs[it.sec] || [0, 0];
    secs[it.sec][1]++; if (ok) secs[it.sec][0]++;
    if (!ok) missing.push(it);
  }
  const ess = essentials(d, nFotos);
  const m = iim(d);
  return {
    pct: total ? Math.round((100 * done) / total) : 0, done, total, cats, secs, missing,
    ess: [ess.filter((e) => e.ok).length, ess.length], iim: m.pct, fotos: nFotos,
  };
}
export const pctOf = (pair) => (pair && pair[1] ? Math.round((100 * pair[0]) / pair[1]) : 0);

// resumo compacto gravado no banco (painel da supervisão não precisa carregar os dados completos)
export function progressSummary(d, nFotos) {
  const p = progress(d, nFotos);
  return { pct: p.pct, done: p.done, total: p.total, cats: p.cats, secs: p.secs, ess: p.ess, iim: p.iim, fotos: nFotos, at: new Date().toISOString() };
}

// ---------------------------------------------------------------- essenciais para envio
export function essentials(d = {}, nFotos = 0) {
  const geo = String(d['1.4.1|fonte'] || '').toLowerCase().includes('geocodifica');
  const iimAll = [0, 1, 2, 3, 4, 5, 6].every((i) => !isEmpty(d[`iim|${i}|D`]));
  return [
    { label: 'Data da visita de campo', ok: !isEmpty(d['v.data']), sec: '0' },
    { label: 'Código e denominação do bem', ok: !isEmpty(d['1.1.1']) && ['1.2.1', '1.2.2', '1.2.4'].some((k) => !isEmpty(d[k])), sec: '1' },
    { label: 'Endereço confirmado (logradouro e bairro)', ok: !isEmpty(d['1.3.1']) && !isEmpty(d['1.3.4']), sec: '1' },
    { label: 'Coordenadas capturadas em campo (GPS)', ok: !isEmpty(d['1.4.1']) && !isEmpty(d['1.4.2']) && !geo, sec: '1' },
    { label: 'Natureza do bem e uso atual', ok: !isEmpty(d['2.1.1']) && !isEmpty(d['11.2']), sec: '2' },
    { label: 'Número de pavimentos', ok: !isEmpty(d['8.1.1']), sec: '8' },
    { label: 'Acesso ao interior informado', ok: !isEmpty(d['8.2.1']), sec: '8' },
    { label: 'Estado dos sete atributos A1–A7 (IIM)', ok: iimAll, sec: '14' },
    { label: 'Estado de conservação geral', ok: !isEmpty(d['16.1']), sec: '16' },
    { label: 'Foto da fachada principal enviada', ok: nFotos > 0 && d['22.3|Fachada principal'] === 'Sim', sec: '22' },
  ];
}

// ---------------------------------------------------------------- IIM
export const iimPoints = (v) => (v === 'Preservado' ? 2 : v === 'Adaptado' ? 1 : v === 'Suprimido / Ausente' ? 0 : null);
export function iimCategory(p) {
  if (p === null || p === undefined) return '';
  if (p >= 0.85) return 'Íntegro (muito preservado)';
  if (p >= 0.7) return 'Preservado';
  if (p >= 0.55) return 'Preservado com adaptações';
  if (p >= 0.35) return 'Parcialmente preservado';
  if (p >= 0.15) return 'Descaracterizado';
  return 'Não preservado / substituído';
}
export function iim(d = {}) {
  let pts = 0, n = 0;
  for (let i = 0; i < 7; i++) {
    const p = iimPoints(d[`iim|${i}|D`]);
    if (p !== null) { pts += p; n++; }
  }
  const pct = n ? pts / (2 * n) : null;
  return { pts, n, pct, cat: iimCategory(pct) };
}

// ---------------------------------------------------------------- navegação
export function sectionById(id) { return SCHEMA.sections.find((s) => s.id === id); }
export function stageOf(secId) { return SCHEMA.stages.find((st) => st.secs.includes(secId)); }
export function sectionHasCat(sec, cat) {
  if (cat === 'todos') return true;
  return sec.items.some((it) => {
    if (it.type === 'table') return it.rows.some((r) => inCat(r.tag, cat));
    return it.tag && inCat(it.tag, cat);
  });
}
export function secTitle(s) { return s.id === '0' ? 'Visita de campo' : `${s.id}. ${s.title}`; }

// ---------------------------------------------------------------- textos didáticos
export function narrative(d = {}, nFotos = 0, quem = 'A ficha') {
  const p = progress(d, nFotos);
  const out = [];
  const c = { campo: pctOf(p.cats.campo), doc: pctOf(p.cats.doc), ana: pctOf(p.cats.ana) };
  out.push(`${quem} está ${p.pct}% completa: ${p.done} de ${p.total} itens preenchidos.`);
  const ART = { campo: 'o levantamento de campo', doc: 'a pesquisa documental', ana: 'a análise patrimonial' };
  const cap = (t) => t[0].toUpperCase() + t.slice(1);
  const ordered = Object.entries(c).sort((a, b) => b[1] - a[1]);
  const [hi, mid, lo] = ordered;
  if (hi[1] === 0) out.push('Nenhuma das três frentes (campo, documental e análise) foi iniciada ainda.');
  else if (hi[1] === lo[1]) out.push(`As três frentes estão no mesmo patamar (${hi[1]}%).`);
  else out.push(`${cap(ART[hi[0]])} é a frente mais adiantada (${hi[1]}%); ${ART[lo[0]]} é a que mais precisa de atenção (${lo[1]}%), e ${ART[mid[0]]} está em ${mid[1]}%.`);
  const ess = essentials(d, nFotos);
  const falt = ess.filter((e) => !e.ok);
  if (!falt.length) out.push('Todos os itens essenciais para envio à supervisão estão preenchidos.');
  else out.push(`Para enviar à supervisão ainda falta${falt.length > 1 ? 'm' : ''} ${falt.length} ${falt.length > 1 ? 'itens essenciais' : 'item essencial'}: ${joinPt(falt.map((e) => e.label[0].toLowerCase() + e.label.slice(1)))}.`);
  const gaps = Object.entries(p.secs).map(([id, [dn, t]]) => [id, t - dn]).filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (gaps.length) out.push(`As maiores lacunas estão em ${joinPt(gaps.map(([id, m]) => `${secTitle(sectionById(id))} (${m} ${m > 1 ? 'itens' : 'item'})`))}.`);
  const tips = [];
  if (String(d['1.4.1|fonte'] || '').toLowerCase().includes('geocodifica')) tips.push('as coordenadas ainda são as da geocodificação do inventário; capture a posição pelo GPS no local');
  if (!nFotos) tips.push('nenhuma foto foi enviada');
  const m = iim(d);
  if (m.n > 0 && m.n < 7) tips.push(`o IIM foi calculado com ${m.n} de 7 atributos; complete os demais ou marque n.a./s.d.`);
  if (c.ana > 40 && isEmpty(d['19.10'])) tips.push('a declaração de significância (19.10) ainda está em branco');
  if (tips.length) out.push(`Observações: ${joinPt(tips)}.`);
  return out;
}

// ---------------------------------------------------------------- exportação (atributos SIG da seção 29)
export function sigRow(d = {}) {
  const g = (k) => (isEmpty(d[k]) ? '' : d[k]);
  const m = iim(d);
  return {
    ID_FIAMS: g('1.1.1'), NOME_ATUAL: g('1.2.1'), NOME_ORIGINAL: g('1.2.2'),
    ENDERECO: [g('1.3.1'), g('1.3.2')].filter(Boolean).join(', '), BAIRRO: g('1.3.4'), LOCALIDADE: g('1.3.5'),
    LATITUDE: g('1.4.1'), LONGITUDE: g('1.4.2'), ANO_PROJETO: g('crono|0|D'), ANO_CONCLUSAO: g('crono|3|D'),
    ARQUITETO: g('3.1.1'), TIPOLOGIA: g('2.2.1'), LINGUAGEM_MODERNA: g('2.3.1'), USO_ORIGINAL: g('11.1'), USO_ATUAL: g('11.2'),
    PAVIMENTOS: g('8.1.1'), AREA_LOTE: g('7.1.1'), AREA_CONSTRUIDA: g('8.1.3'), PROTECAO: g('1.5.1'), INTEGRIDADE: g('14.1.10'),
    IIM_PCT: m.pct === null ? '' : Math.round(m.pct * 1000) / 10, IIM_CATEGORIA: m.cat, AUTENTICIDADE: g('20.4'), CONSERVACAO: g('16.1'),
    VALOR_HISTORICO: g('19.1'), VALOR_ARQUITETONICO: g('19.2'), VALOR_URBANISTICO: g('19.3'), VALOR_SOCIAL: g('19.6'),
    VALOR_DOCUMENTAL: g('19.8'), SIGNIFICANCIA: g('19.9'), PRIORIDADE: g('21.1'),
  };
}
export function toCSV(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '\ufeff' + [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\n');
}
