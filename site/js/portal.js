// Portal público · Inventário da Arquitetura Moderna de São Luís
// Lê só o que o banco libera ao visitante (papel anon): imóveis, fichas publicadas, fotos delas, textos e números.
import { html, render, useState, useEffect, useRef, useMemo } from '../vendor/preact-htm.js';
import { CONFIG } from '../campo/js/config.js';
import { md } from './md.js';
import { FichaPublica, destaques, creditos, nomeDe } from './ficha-publica.js';

const CONFIGURADO = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
// cliente sempre anônimo: mesmo quem está logado na área da equipe vê aqui exatamente o que o público vê
const sb = CONFIGURADO ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'fiams-portal' } }) : null;
const ok = ({ data, error }) => { if (error) throw error; return data; };
const cache = {};
const once = (k, fn) => cache[k] || (cache[k] = fn().catch((e) => { delete cache[k]; throw e; }));
const db = {
  imoveis: () => once('im', async () => ok(await sb.from('imoveis').select('id,n,nome,endereco,bairro,localidade,lat,lon,autor,data_ref,funcao').order('n'))),
  publicadas: () => once('pub', async () => ok(await sb.from('fichas').select('id,imovel_id,publicada_em,dados_publicos').eq('publicada', true).order('publicada_em', { ascending: false }))),
  stats: () => once('st', async () => ok(await sb.rpc('estatisticas_publicas'))),
  textos: () => once('tx', async () => Object.fromEntries(ok(await sb.from('conteudo').select('chave,titulo,corpo,ordem').order('ordem')).map((c) => [c.chave, c]))),
  fotos: (ids) => once('ft:' + ids.join(','), async () => {
    if (!ids.length) return [];
    const rows = ok(await sb.from('fotos').select('id,ficha_id,path,vista,orientacao,legenda').in('ficha_id', ids).order('created_at'));
    if (!rows.length) return [];
    const { data } = await sb.storage.from('fotos').createSignedUrls(rows.map((r) => r.path), 3600);
    return rows.map((r, i) => ({ ...r, url: data?.[i]?.signedUrl })).filter((r) => r.url);
  }),
};
// fachada principal primeiro
const capa = (fotos, fichaId) => { const fs = fotos.filter((f) => f.ficha_id === fichaId); return fs.find((f) => f.vista === 'Fachada principal') || fs[0]; };

// ---------------------------------------------------------------- utilidades
function useRoute() {
  const get = () => (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean).map(decodeURIComponent);
  const [r, setR] = useState(get());
  useEffect(() => { const h = () => { setR(get()); window.scrollTo({ top: 0 }); }; addEventListener('hashchange', h); return () => removeEventListener('hashchange', h); }, []);
  return r;
}
function useAsync(fn, deps = []) {
  const [s, setS] = useState({ data: null, error: null, loading: true });
  useEffect(() => { let on = true; setS({ data: null, error: null, loading: true });
    fn().then((data) => on && setS({ data, error: null, loading: false })).catch((error) => on && setS({ data: null, error, loading: false }));
    return () => { on = false; }; }, deps);
  return s;
}
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmtData = (s) => (s ? new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '');
const semAutoria = (a) => !a || /^Autoria não/i.test(a);
const SIT = {
  publicada: { label: 'Ficha publicada', cor: '#1F4E8C' },
  estudo: { label: 'Em estudo pela equipe', cor: '#E07B00' },
  inventariado: { label: 'Inventariado', cor: '#8E9CA2' },
};
const situacao = (id, pubSet, estudoSet) => (pubSet.has(id) ? 'publicada' : estudoSet.has(id) ? 'estudo' : 'inventariado');

function Cobogo({ size = 28, color = 'currentColor' }) {
  return html`<svg class="cbg" width=${size} height=${size} viewBox="0 0 40 40" aria-hidden="true"><rect x="1" y="1" width="38" height="38" rx="3" fill=${color} mask="url(#cobogo-mask)" /></svg>`;
}
const Erro = ({ e }) => html`<div class="aviso">Não foi possível carregar os dados agora${e?.message ? ` (${e.message})` : ''}. Tente recarregar a página.</div>`;
const Carregando = ({ t = 'Carregando…' }) => html`<div class="carregando"><${Cobogo} size=${36} color="var(--azulejo)" /><span>${t}</span></div>`;

// ---------------------------------------------------------------- mapa
function Mapa({ pontos, height = 460, onPick, zoom }) {
  const ref = useRef(); const mapRef = useRef(); const layerRef = useRef();
  useEffect(() => {
    let alive = true;
    const init = () => {
      if (!alive) return;
      if (!window.L) return setTimeout(init, 80);
      const m = window.L.map(ref.current, { scrollWheelZoom: false }).setView([-2.5395, -44.279], 15);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
      m.on('focus', () => m.scrollWheelZoom.enable()); m.on('blur', () => m.scrollWheelZoom.disable());
      mapRef.current = m; desenhar();
    };
    init();
    return () => { alive = false; mapRef.current && mapRef.current.remove(); mapRef.current = null; };
  }, []);
  const desenhar = () => {
    const m = mapRef.current; if (!m) return;
    layerRef.current && layerRef.current.remove();
    const layer = window.L.layerGroup().addTo(m); layerRef.current = layer;
    const pts = pontos.filter((p) => p.lat && p.lon);
    pts.forEach((p) => {
      const mk = window.L.circleMarker([p.lat, p.lon], { radius: p.destaque ? 10 : 7, weight: 2, color: '#fff', fillColor: p.cor, fillOpacity: 0.95 }).addTo(layer);
      mk.bindTooltip(`<b>${p.id}</b><br>${p.nome.replace(/</g, '&lt;')}`);
      mk.on('click', () => onPick && onPick(p));
    });
    if (pts.length) m.fitBounds(window.L.latLngBounds(pts.map((p) => [p.lat, p.lon])), { padding: [28, 28], maxZoom: zoom || 17 });
    setTimeout(() => m.invalidateSize(), 60);
  };
  useEffect(desenhar, [pontos]);
  return html`<div class="mapa" ref=${ref} style=${`height:${height}px`} role="region" aria-label="Mapa dos imóveis"></div>`;
}
const Legenda = () => html`<ul class="legenda">${Object.values(SIT).map((s) => html`<li><span style=${`background:${s.cor}`}></span>${s.label}</li>`)}</ul>`;

// ---------------------------------------------------------------- dados combinados
function useAcervo() {
  return useAsync(async () => {
    const [imoveis, pubs, stats] = await Promise.all([db.imoveis(), db.publicadas(), db.stats()]);
    const pubSet = new Set(pubs.map((f) => f.imovel_id)); const estudoSet = new Set(stats?.em_estudo || []);
    const fotos = await db.fotos(pubs.map((f) => f.id)).catch(() => []);
    const porImovel = {}; pubs.forEach((f) => { (porImovel[f.imovel_id] = porImovel[f.imovel_id] || []).push(f); });
    const lista = imoveis.map((i) => {
      const f = porImovel[i.id]?.[0]; const sit = situacao(i.id, pubSet, estudoSet);
      return { ...i, sit, cor: SIT[sit].cor, ficha: f, capa: f && capa(fotos, f.id) };
    });
    return { lista, pubs, stats, fotos };
  });
}

// ---------------------------------------------------------------- início
function Inicio() {
  const tx = useAsync(() => db.textos());
  const ac = useAcervo();
  const st = ac.data?.stats;
  const recentes = (ac.data?.lista || []).filter((i) => i.ficha).sort((a, b) => (b.ficha.publicada_em || '').localeCompare(a.ficha.publicada_em || '')).slice(0, 6);
  return html`<div>
    <section class="hero"><div class="hero-in">
      <p class="kicker">Inventário · 1930–1980</p>
      <h1>Arquitetura moderna de São Luís</h1>
      <p class="hero-lead">Identificação, documentação e avaliação do acervo moderno de Monte Castelo, João Paulo e Filipinho.</p>
      <div class="hero-a"><a class="btn claro" href="#/acervo">Explorar o acervo</a><a class="btn contorno" href="#/acervo/mapa">Ver no mapa</a></div>
    </div></section>
    <section class="numeros" aria-label="O inventário em números"><div class="wrap nums">
      ${[[st?.imoveis ?? '—', 'imóveis inventariados'], [st?.com_ficha ?? '—', 'em estudo de campo'], [st?.publicadas ?? '—', 'fichas publicadas'], ['3', 'bairros no recorte']].map(([n, l]) => html`<div class="num"><b>${n}</b><span>${l}</span></div>`)}
    </div></section>
    <section class="wrap duas">
      <div class="texto md">${tx.data?.inicio ? html`<h2>${tx.data.inicio.titulo}</h2><div dangerouslySetInnerHTML=${{ __html: md(tx.data.inicio.corpo) }}></div>` : tx.loading ? html`<${Carregando} />` : null}
        <p><a class="lnk" href="#/projeto">Conheça o projeto e a metodologia ›</a></p></div>
      <aside class="etapas"><h3>Como uma ficha chega aqui</h3><ol>
        <li><b>Campo.</b> Estudantes visitam o imóvel, fotografam, medem, georreferenciam e conversam com moradores.</li>
        <li><b>Revisão.</b> A supervisão confere a ficha, comenta e devolve até que esteja consistente.</li>
        <li><b>Publicação.</b> Aprovada, a ficha é publicada neste portal, sem dados pessoais nem entrevistas.</li></ol></aside>
    </section>
    <section class="wrap"><div class="sec-h"><h2>O acervo no mapa</h2><a class="lnk" href="#/acervo/mapa">Abrir o mapa completo ›</a></div>
      ${ac.error ? html`<${Erro} e=${ac.error} />` : ac.data ? html`<${Mapa} pontos=${ac.data.lista} height=${420} onPick=${(p) => { location.hash = '#/imovel/' + encodeURIComponent(p.id); }} /><${Legenda} />` : html`<${Carregando} t="Carregando o mapa…" />`}
    </section>
    <section class="wrap"><div class="sec-h"><h2>Fichas publicadas recentemente</h2><a class="lnk" href="#/acervo/publicadas">Ver todas ›</a></div>
      ${ac.data && (recentes.length ? html`<div class="cartoes">${recentes.map((i) => html`<${Cartao} i=${i} />`)}</div>`
        : html`<div class="vazio"><${Cobogo} size=${48} color="var(--azulejo)" /><p>As primeiras fichas aprovadas pela supervisão aparecerão aqui. Enquanto isso, explore os ${st?.imoveis || 86} imóveis do inventário.</p><a class="btn" href="#/acervo">Explorar o acervo</a></div>`)}
    </section>
  </div>`;
}

function Cartao({ i }) {
  return html`<a class="cartao" href=${'#/imovel/' + encodeURIComponent(i.id)}>
    <div class=${'c-img' + (i.capa ? '' : ' sem-foto')}>${i.capa ? html`<img src=${i.capa.url} alt=${i.capa.legenda || i.capa.vista || i.nome} loading="lazy" />` : html`<div class="c-cbg" aria-hidden="true"></div>`}
      <span class="c-sit" style=${`--c:${i.cor}`}>${SIT[i.sit].label}</span></div>
    <div class="c-b"><span class="c-code">${i.id}</span><h3>${i.ficha ? nomeDe(i.ficha.dados_publicos, i) : i.nome}</h3>
      <p>${[i.endereco, i.localidade && i.localidade !== i.bairro ? i.localidade : i.bairro].filter(Boolean).join(' · ')}</p>
      <p class="c-m">${[i.data_ref, semAutoria(i.autor) ? '' : i.autor].filter(Boolean).join(' · ')}</p></div></a>`;
}

// ---------------------------------------------------------------- acervo (lista e mapa)
const FILTROS = [['todos', 'Todos'], ['Monte Castelo', 'Monte Castelo'], ['João Paulo', 'João Paulo'], ['Filipinho', 'Filipinho'], ['publicadas', 'Com ficha publicada'], ['estudo', 'Em estudo']];
function Acervo({ modo }) {
  const ac = useAcervo();
  const [q, setQ] = useState(''); const [f, setF] = useState(modo === 'publicadas' ? 'publicadas' : 'todos');
  const vista = modo === 'mapa' ? 'mapa' : 'lista';
  const lista = useMemo(() => (ac.data?.lista || []).filter((i) => {
    if (q && !norm(`${i.id} ${i.nome} ${i.endereco} ${i.localidade} ${i.autor} ${i.funcao}`).includes(norm(q))) return false;
    if (f === 'publicadas') return i.sit === 'publicada';
    if (f === 'estudo') return i.sit === 'estudo';
    if (f !== 'todos') return i.bairro === f;
    return true;
  }), [ac.data, q, f]);
  return html`<div class="wrap pagina">
    <div class="sec-h"><div><h1>Acervo</h1><p class="muted">${ac.data ? `${lista.length} de ${ac.data.lista.length} imóveis` : ''}</p></div>
      <div class="alterna" role="tablist"><a role="tab" aria-selected=${vista === 'lista'} class=${vista === 'lista' ? 'on' : ''} href="#/acervo">Lista</a><a role="tab" aria-selected=${vista === 'mapa'} class=${vista === 'mapa' ? 'on' : ''} href="#/acervo/mapa">Mapa</a></div></div>
    <input class="busca" type="search" placeholder="Buscar por nome, endereço, autor ou código" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Buscar no acervo" />
    <div class="filtros">${FILTROS.map(([k, l]) => html`<button class=${f === k ? 'on' : ''} aria-pressed=${f === k} onClick=${() => setF(k)}>${l}</button>`)}</div>
    ${ac.error ? html`<${Erro} e=${ac.error} />` : !ac.data ? html`<${Carregando} />`
      : vista === 'mapa' ? html`<${Mapa} pontos=${lista} height=${Math.max(420, window.innerHeight - 330)} onPick=${(p) => { location.hash = '#/imovel/' + encodeURIComponent(p.id); }} /><${Legenda} />`
      : lista.length ? html`<div class="cartoes">${lista.map((i) => html`<${Cartao} i=${i} />`)}</div>` : html`<div class="vazio"><p>Nenhum imóvel encontrado com esses filtros.</p></div>`}
  </div>`;
}

// ---------------------------------------------------------------- imóvel
function Imovel({ id }) {
  const s = useAsync(async () => {
    const [imoveis, pubs, stats] = await Promise.all([db.imoveis(), db.publicadas(), db.stats()]);
    const im = imoveis.find((x) => x.id === id);
    const fichas = pubs.filter((f) => f.imovel_id === id);
    const fotos = await db.fotos(fichas.map((f) => f.id)).catch(() => []);
    return { im, fichas, fotos, estudo: (stats?.em_estudo || []).includes(id) };
  }, [id]);
  const [idx, setIdx] = useState(0);
  if (s.error) return html`<div class="wrap pagina"><${Erro} e=${s.error} /></div>`;
  if (!s.data) return html`<div class="wrap pagina"><${Carregando} /></div>`;
  const { im, fichas, fotos, estudo } = s.data;
  if (!im) return html`<div class="wrap pagina"><h1>Imóvel não encontrado</h1><p>O código <b>${id}</b> não está no inventário.</p><a class="btn" href="#/acervo">Voltar ao acervo</a></div>`;
  const f = fichas[Math.min(idx, fichas.length - 1)]; const d = f?.dados_publicos || {};
  const fs = f ? fotos.filter((x) => x.ficha_id === f.id).sort((a, b) => (a.vista === 'Fachada principal' ? -1 : b.vista === 'Fachada principal' ? 1 : 0)) : [];
  const sit = f ? 'publicada' : estudo ? 'estudo' : 'inventariado';
  const nome = f ? nomeDe(d, im) : im.nome;
  const cred = f ? creditos(d) : [];
  const url = location.href.split('#')[0] + '#/imovel/' + encodeURIComponent(im.id);
  const ano = f?.publicada_em ? new Date(f.publicada_em).getFullYear() : new Date().getFullYear();
  const citacao = `${im.id}: ${nome}. In: INVENTÁRIO da Arquitetura Moderna de São Luís (FIAMS). São Luís: LUPA/UNDB, ${ano}. Disponível em: ${url}. Acesso em: ${new Date().toLocaleDateString('pt-BR')}.`;
  return html`<div class="wrap pagina imovel">
    <a class="lnk voltar" href="#/acervo">‹ Acervo</a>
    <header class="im-h"><span class="c-code">${im.id}</span><h1>${nome}</h1>
      <p class="im-end">${[im.endereco, im.localidade, im.bairro !== im.localidade ? im.bairro : ''].filter(Boolean).join(' · ')}</p>
      <span class="c-sit inline" style=${`--c:${SIT[sit].cor}`}>${SIT[sit].label}</span></header>
    ${fs.length > 0 && html`<${Galeria} fotos=${fs} />`}
    <div class="im-grid">
      <div class="im-main">
        ${f ? html`
          ${fichas.length > 1 && html`<div class="filtros">${fichas.map((x, i) => html`<button class=${i === idx ? 'on' : ''} onClick=${() => setIdx(i)}>Ficha ${i + 1} · ${fmtData(x.publicada_em)}</button>`)}</div>`}
          <dl class="destaques">${destaques(d).map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
          ${d['19.10'] && html`<blockquote class="signif"><p class="kicker">Declaração de significância</p>${d['19.10']}</blockquote>`}
          <${FichaPublica} d=${d} />`
        : html`<div class="vazio esq"><${Cobogo} size=${44} color="var(--azulejo)" />
            <h2>${estudo ? 'Ficha em elaboração' : 'Ainda sem ficha de campo'}</h2>
            <p>${estudo ? 'A equipe está estudando este imóvel. A ficha será publicada aqui depois de revisada e aprovada pela supervisão.' : 'Este imóvel consta do inventário, mas ainda não foi visitado pela equipe de campo. Os dados abaixo vêm do levantamento inicial.'}</p></div>`}
      </div>
      <aside class="im-side">
        ${im.lat && html`<${Mapa} pontos=${[{ ...im, cor: SIT[sit].cor, destaque: true }]} height=${240} zoom=${17} />`}
        <div class="painel"><h3>Dados do inventário</h3><dl class="dl">
          ${[['Código', im.id], ['Endereço', im.endereco], ['Bairro', im.bairro], ['Localidade', im.localidade], ['Data de referência', im.data_ref], ['Autoria', im.autor], ['Função', im.funcao]].filter(([, v]) => v).map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>
          ${im.lat && html`<a class="lnk" target="_blank" rel="noopener" href=${`https://www.google.com/maps/dir/?api=1&destination=${im.lat},${im.lon}`}>Como chegar ›</a>`}</div>
        ${f && html`<div class="painel"><h3>Autoria da ficha</h3>${cred.length ? html`<dl class="dl">${cred.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>` : html`<p class="muted">Equipe LUPA/UNDB.</p>`}
          <p class="muted pq">Publicada em ${fmtData(f.publicada_em)}.</p></div>
          <div class="painel"><h3>Como citar</h3><p class="cita">${citacao}</p>
            <button class="lnk" onClick=${() => navigator.clipboard?.writeText(citacao).then(() => alert('Referência copiada.'))}>Copiar referência</button></div>`}
      </aside>
    </div>
  </div>`;
}

function Galeria({ fotos }) {
  const [i, setI] = useState(0); const f = fotos[i];
  return html`<figure class="galeria">
    <div class="g-img"><img src=${f.url} alt=${f.legenda || f.vista} />
      ${fotos.length > 1 && html`<button class="g-nav ant" aria-label="Foto anterior" onClick=${() => setI((i - 1 + fotos.length) % fotos.length)}>‹</button>
        <button class="g-nav prox" aria-label="Próxima foto" onClick=${() => setI((i + 1) % fotos.length)}>›</button>`}</div>
    <figcaption><b>${f.vista}</b>${f.orientacao ? ` · vista para ${f.orientacao}` : ''}${f.legenda ? ` — ${f.legenda}` : ''}<span>${i + 1}/${fotos.length}</span></figcaption>
    ${fotos.length > 1 && html`<div class="g-thumbs">${fotos.map((x, j) => html`<button class=${j === i ? 'on' : ''} onClick=${() => setI(j)} aria-label=${`Foto ${j + 1}: ${x.vista}`}><img src=${x.url} alt="" loading="lazy" /></button>`)}</div>`}
  </figure>`;
}

// ---------------------------------------------------------------- o projeto
function Projeto() {
  const tx = useAsync(() => db.textos());
  if (tx.error) return html`<div class="wrap pagina"><${Erro} e=${tx.error} /></div>`;
  if (!tx.data) return html`<div class="wrap pagina"><${Carregando} /></div>`;
  const partes = ['sobre', 'metodologia', 'creditos'].map((k) => tx.data[k]).filter(Boolean);
  return html`<div class="wrap pagina projeto">
    <nav class="indice" aria-label="Nesta página">${partes.map((p) => html`<a href=${'#/projeto/' + p.chave}>${p.titulo}</a>`)}</nav>
    ${partes.map((p) => html`<section class="md bloco" id=${'p-' + p.chave}><h1>${p.titulo}</h1><div dangerouslySetInnerHTML=${{ __html: md(p.corpo) }}></div></section>`)}
  </div>`;
}

// ---------------------------------------------------------------- casca
function App() {
  const r = useRoute();
  const [r0, r1] = r;
  useEffect(() => { if (r0 === 'projeto' && r1) setTimeout(() => document.getElementById('p-' + r1)?.scrollIntoView({ behavior: 'smooth' }), 120); }, [r0, r1]);
  let view; let aba = 'inicio';
  if (!CONFIGURADO) view = html`<div class="wrap pagina"><div class="aviso">Portal sem conexão com o banco de dados (js/config.js sem as chaves do Supabase).</div></div>`;
  else if (r0 === 'acervo') { view = html`<${Acervo} modo=${r1} key=${r1 || 'lista'} />`; aba = 'acervo'; }
  else if (r0 === 'imovel' && r1) { view = html`<${Imovel} id=${r1} key=${r1} />`; aba = 'acervo'; }
  else if (r0 === 'projeto') { view = html`<${Projeto} />`; aba = 'projeto'; }
  else view = html`<${Inicio} />`;
  useEffect(() => {
    const t = { inicio: 'Arquitetura moderna de São Luís · Inventário', acervo: 'Acervo · Arquitetura moderna de São Luís', projeto: 'O projeto · Arquitetura moderna de São Luís' };
    if (r0 !== 'imovel') document.title = t[aba];
  }, [aba, r0]);
  const links = [['inicio', '#/', 'Início'], ['acervo', '#/acervo', 'Acervo'], ['projeto', '#/projeto', 'O projeto']];
  return html`<div class="portal">
    <a class="pular" href="#conteudo">Pular para o conteúdo</a>
    <header class="topo"><div class="wrap topo-in">
      <a class="marca" href="#/"><${Cobogo} size=${30} color="#fff" /><span><b>Arquitetura Moderna</b><small>São Luís · 1930–1980</small></span></a>
      <nav class="menu" aria-label="Principal">${links.map(([k, h, l]) => html`<a href=${h} class=${aba === k ? 'on' : ''} aria-current=${aba === k ? 'page' : undefined}>${l}</a>`)}</nav>
      <a class="btn equipe" href="campo/"><span class="lg">Área da equipe</span><span class="sm">Equipe</span></a></div></header>
    <main id="conteudo">${view}</main>
    <footer class="rodape"><div class="wrap rod-in">
      <div><b>Inventário da Arquitetura Moderna de São Luís</b><p>LUPA — Laboratório de Urbanismo, Paisagem, Arquitetura e Artes · Centro Universitário UNDB</p></div>
      <nav aria-label="Rodapé"><a href="#/projeto">O projeto</a><a href="campo/">Área da equipe</a><a href="privacidade.html">Privacidade</a></nav></div></footer>
  </div>`;
}

render(html`<${App} />`, document.getElementById('app'));
