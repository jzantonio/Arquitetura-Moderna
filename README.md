# Arquitetura moderna de São Luís · plataforma do inventário

Plataforma do **Inventário da Arquitetura Moderna de São Luís (1930–1980)**, recorte Monte Castelo, João Paulo e Filipinho. Ela articula a coleta em campo, o banco de dados e a divulgação pública. Desenvolvida para o LUPA — Laboratório de Urbanismo, Paisagem, Arquitetura e Artes (Centro Universitário UNDB).

**Endereço:** https://arquitetura-moderna-slz.netlify.app

| Parte | Endereço | Para quem |
|---|---|---|
| Portal público | `/` | qualquer pessoa, sem login |
| Área da equipe | `/campo/` | alunos, supervisão, pesquisadores convidados e administração (login com Google) |

## Portal público

- Página inicial com apresentação, números do inventário, mapa do acervo e fichas publicadas recentemente.
- **Acervo:** os 86 imóveis em lista ou mapa, com busca e filtros por bairro e situação (inventariado, em estudo, ficha publicada).
- **Página de cada imóvel:** dados do inventário, mapa, e, quando publicada, a ficha completa com fotos, destaques (datas, autoria, uso, conservação, IIM), declaração de significância, créditos e referência para citação.
- **O projeto:** apresentação, metodologia e créditos. Os textos são editados pela administração, sem mexer em código.

O público **nunca** vê: dados da visita de campo (V.1–V.6), entrevistas (seção 23), fontes orais (24.5), inscrição imobiliária (1.1.3), alertas internos, nem dados de cadastro das pessoas. A regra é imposta pelo banco (`supabase/03_plataforma.sql`), não só pela tela.

## Área da equipe (app de campo)

- Ficha completa, em sete etapas e na ordem numérica da FIAMS, com filtro por tipo de coleta: Campo, Documental ou Análise.
- 86 imóveis do Inventário v4 já cadastrados. Cada ficha abre pré-preenchida, com os valores marcados como "do inventário".
- GPS (latitude, longitude, UTM SIRGAS 2000), fotos pela câmera e cálculo automático do IIM (A1–A7).
- Funciona sem internet: salva no aparelho e sincroniza quando a conexão volta. Instalável no celular.

### Perfis

| Perfil | O que faz |
|---|---|
| Aluno | preenche as próprias fichas e envia à supervisão |
| Supervisão | revisa, comenta, devolve e aprova fichas; painel da turma; exportação CSV |
| Pesquisa (só leitura) | consulta todas as fichas, gráficos e exportações, sem editar |
| Administração | tudo da supervisão, mais: **Publicação** (decide quais fichas aprovadas vão ao portal), **Pessoas** (atribui papéis, inclusive antes do primeiro acesso) e **Textos do portal** |

Todos entram com conta Google (qualquer domínio). Quem não tem papel definido entra como aluno. Administração atual: `jose.lopes@undb.edu.br`; supervisão: `luis.longhi@undb.edu.br`.

Fluxo de uma ficha: aluno preenche → envia → supervisão revisa (devolve ou aprova) → administração publica no portal. Se uma ficha publicada for devolvida, ela sai do portal sozinha.

---

## Estrutura

```
site/                         ← o que a Netlify publica
  index.html, css/portal.css  portal público
  js/portal.js                portal: páginas, mapa, acervo, imóvel
  js/ficha-publica.js         leitura de uma ficha publicada
  js/md.js                    formatação dos textos públicos
  privacidade.html            política de privacidade
  campo/                      área da equipe (PWA)
    index.html, sw.js, manifest.webmanifest
    js/config.js              ← chaves do Supabase (anon) e lista de supervisores do modo demonstração
    js/*.js                   app: ficha, supervisão, administração (admin.js)
    data/seed.json            86 imóveis pré-preenchidos (gerado)
  vendor/, icons/             bibliotecas e ícones, sem CDN
supabase/01_schema.sql        banco: tabelas e regras de segurança básicas
supabase/02_seed_imoveis.sql  carga dos 86 imóveis (gerado)
supabase/03_plataforma.sql    perfis, publicação, leitura pública e textos do portal
tools/                        geradores em Python (ver tools/README.md)
netlify.toml                  publicação na Netlify (pasta site/)
github-pages/                 endereço antigo: redireciona para a Netlify
```

---

## Serviços

- **Netlify** — site `arquitetura-moderna-slz`. Publica a pasta `site/` (sem etapa de build).
- **Supabase** — projeto *Arquitetura Moderna SLZ*. Banco, login e fotos.
- **Google Cloud** — projeto *FIAMS campo*: login com Google (cliente OAuth "FIAMS campo (Supabase)", em produção).
- **GitHub Pages** — só redireciona o endereço antigo (`jzantonio.github.io/Arquitetura-Moderna/`) para a Netlify.

### Recriar do zero

1. **Supabase:** no SQL Editor, rode `supabase/01_schema.sql`, depois `02_seed_imoveis.sql`, depois `03_plataforma.sql`.
2. **Login com Google:** no Google Cloud, crie um ID de cliente OAuth do tipo *Aplicativo da Web*, com o URI de redirecionamento `https://SEU-PROJETO.supabase.co/auth/v1/callback`. Tela de consentimento: tipo *Externo*, página inicial e política de privacidade apontando para o site, e **publicada** (em "Teste", só os testadores entram). No Supabase, em *Authentication → Sign In / Providers*, ative o Google com o ID e a chave secreta, e desative o Email.
3. **Supabase → Authentication → URL Configuration:** Site URL `https://SEU-SITE/campo/`, e o mesmo endereço em *Redirect URLs*.
4. **`site/campo/js/config.js`:** URL do projeto e chave *anon public* (pode ficar no repositório; quem protege os dados são as regras do banco). **Nunca** coloque a chave *service_role*.
5. **Netlify:** crie o site e publique o repositório (o `netlify.toml` já indica a pasta `site/`).

## Atualizar

1. Edite os arquivos em `site/`. Se mudar algo da área da equipe, aumente a versão na primeira linha útil de `site/campo/sw.js` (`fiams-vN`) para os celulares baixarem a nova versão.
2. Envie ao GitHub e publique na Netlify. Se o repositório estiver ligado à Netlify, a publicação é automática a cada envio.

## Modo demonstração

Com `SUPABASE_URL` e `SUPABASE_ANON_KEY` vazios em `site/campo/js/config.js`, a área da equipe funciona só no navegador, para testar e apresentar. Entrar com `jose.lopes@undb.edu.br` (sem senha) mostra a administração. O portal precisa do banco.
