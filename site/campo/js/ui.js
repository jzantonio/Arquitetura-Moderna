// FIAMS Campo · componentes visuais compartilhados
import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { STATUS, TAG_INFO, pctOf } from './logic.js';

export const nav = (p) => { location.hash = p; };
export const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export function relTime(s) {
  if (!s) return '—';
  const d = (Date.now() - new Date(s).getTime()) / 1000;
  if (d < 60) return 'agora';
  if (d < 3600) return `há ${Math.round(d / 60)} min`;
  if (d < 86400) return `há ${Math.round(d / 3600)} h`;
  if (d < 86400 * 30) return `há ${Math.round(d / 86400)} dia${d >= 86400 * 1.5 ? 's' : ''}`;
  return fmtDate(s);
}

// ---------------------------------------------------------------- cobogó (assinatura visual)
const tone = (p) => (p >= 100 ? 'var(--azulejo)' : p >= 67 ? '#3B6FB0' : p >= 34 ? '#7FA3D1' : p > 0 ? '#C4D5EC' : 'transparent');
export function Cobogo({ pct = 0, size = 38, color }) {
  const f = color || tone(pct);
  return html`<svg class="cobogo" width=${size} height=${size} viewBox="0 0 40 40" aria-hidden="true">
    <rect x="1" y="1" width="38" height="38" rx="3" fill=${f} mask="url(#cobogo-mask)" />
    <rect x="1" y="1" width="38" height="38" rx="3" fill="none" stroke=${pct >= 100 ? 'var(--azulejo)' : 'var(--linha-forte)'} stroke-width="1.5" />
  </svg>`;
}

export function Bar({ value = 0, cls = '', label }) {
  return html`<div class=${'bar ' + cls} role="progressbar" aria-valuenow=${value} aria-valuemin="0" aria-valuemax="100" aria-label=${label || 'progresso'}>
    <span style=${`width:${Math.max(0, Math.min(100, value))}%`}></span></div>`;
}
export function CatBars({ cats, compact }) {
  if (!cats) return null;
  return html`<div class=${'catbars' + (compact ? ' compact' : '')}>
    ${[['campo', 'Campo'], ['doc', 'Documental'], ['ana', 'Análise']].map(([k, l]) => html`
      <div class="catbar"><span class=${'dot ' + k}></span><span class="cb-l">${l}</span><${Bar} value=${pctOf(cats[k])} cls=${k} label=${l} /><b>${pctOf(cats[k])}%</b></div>`)}
  </div>`;
}
export function Ring({ value = 0, size = 52 }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r;
  return html`<svg class="ring" width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`} role="img" aria-label=${`${value}% completo`}>
    <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke="var(--linha)" stroke-width="6" />
    <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke="var(--azulejo)" stroke-width="6" stroke-linecap="round"
      stroke-dasharray=${c} stroke-dashoffset=${c * (1 - value / 100)} transform=${`rotate(-90 ${size / 2} ${size / 2})`} />
    <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" class="ring-t">${value}%</text></svg>`;
}
export const StatusPill = ({ s }) => html`<span class=${'pill ' + (STATUS[s]?.cls || '')}>${STATUS[s]?.label || s}</span>`;
export const TagDot = ({ tag }) => html`<span class=${'tag ' + (TAG_INFO[tag]?.cls || '')}>${TAG_INFO[tag]?.label || tag}</span>`;

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose && onClose();
    document.addEventListener('keydown', k); document.body.classList.add('noscroll');
    return () => { document.removeEventListener('keydown', k); document.body.classList.remove('noscroll'); };
  }, []);
  return html`<div class="overlay" onClick=${(e) => e.target === e.currentTarget && onClose && onClose()}>
    <div class=${'sheet' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label=${title}>
      <div class="sheet-h"><h2>${title}</h2>${onClose && html`<button class="icon-btn" onClick=${onClose} aria-label="Fechar">✕</button>`}</div>
      <div class="sheet-b">${children}</div></div></div>`;
}

let toastSet = null;
export const toast = (msg, kind = '') => toastSet && toastSet({ msg, kind, t: Date.now() });
export function Toaster() {
  const [t, setT] = useState(null);
  toastSet = setT;
  useEffect(() => { if (!t) return; const h = setTimeout(() => setT(null), 3200); return () => clearTimeout(h); }, [t]);
  return t ? html`<div class=${'toast ' + t.kind} role="status">${t.msg}</div>` : null;
}

export function Empty({ title, text, action }) {
  return html`<div class="empty"><div class="empty-art" aria-hidden="true"></div><h3>${title}</h3><p>${text}</p>${action}</div>`;
}

// ---------------------------------------------------------------- gráficos (Chart.js)
const FONT = { family: "'Archivo', system-ui, sans-serif", size: 12 };
export function ChartBox({ type, data, options = {}, height = 240, label }) {
  const ref = useRef();
  useEffect(() => {
    if (!window.Chart) return;
    window.Chart.defaults.font = FONT; window.Chart.defaults.color = '#46545A';
    const ch = new window.Chart(ref.current, {
      type, data,
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500 },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } } }, ...options },
    });
    return () => ch.destroy();
  }, [JSON.stringify(data)]);
  return html`<div class="chartbox" style=${`height:${height}px`}><canvas ref=${ref} role="img" aria-label=${label || 'gráfico'}></canvas></div>`;
}
export const COLORS = { campo: '#E07B00', doc: '#3D6E9E', ana: '#4F7F45', azulejo: '#1F4E8C', rascunho: '#9AA7AD', enviada: '#E0A100', devolvida: '#C2410C', aprovada: '#2F7D4F' };

// ---------------------------------------------------------------- mapa (Leaflet)
export function MapView({ points, onPick, height = 420 }) {
  const ref = useRef(); const mapRef = useRef();
  useEffect(() => {
    if (!window.L) return;
    const m = window.L.map(ref.current, { zoomControl: true }).setView([-2.5395, -44.279], 15);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    mapRef.current = m;
    return () => m.remove();
  }, []);
  useEffect(() => {
    const m = mapRef.current; if (!m) return;
    const layer = window.L.layerGroup().addTo(m);
    const pts = points.filter((p) => p.lat && p.lon);
    pts.forEach((p) => {
      const mk = window.L.circleMarker([p.lat, p.lon], { radius: 8, weight: 2, color: '#fff', fillColor: p.color || COLORS.azulejo, fillOpacity: 0.95 })
        .addTo(layer).bindTooltip(`${p.id} · ${p.nome}`);
      mk.on('click', () => onPick && onPick(p));
    });
    if (pts.length) m.fitBounds(window.L.latLngBounds(pts.map((p) => [p.lat, p.lon])), { padding: [24, 24], maxZoom: 17 });
    setTimeout(() => m.invalidateSize(), 50);
    return () => layer.remove();
  }, [points]);
  return html`<div class="map" ref=${ref} style=${`height:${height}px`}></div>`;
}

export function download(name, text, type = 'text/csv;charset=utf-8') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
