# Arquitetura moderna de São Luís (FIAMS) — contexto para o Claude Code

Responda sempre em português do Brasil. O usuário é o Prof. José Antônio Viana Lopes (UNDB, coordenador do LUPA). Trabalhe de forma autônoma: execute, teste e só pergunte quando a decisão for dele.

## O que é

Plataforma do **Inventário da Arquitetura Moderna de São Luís (1930–1980)**, recorte Monte Castelo, João Paulo e Filipinho:

- **Portal público** (`/`): apresentação, números, mapa e acervo dos 86 imóveis, página de cada imóvel com a ficha publicada, textos do projeto. Visitante sem login.
- **Área da equipe** (`/campo/`): PWA de coleta da **Ficha FIAMS** (celular/tablet/desktop), supervisão (revisar, devolver, aprovar) e administração (publicar no portal, papéis, textos).

Endereços e serviços:
- Plataforma (Netlify): https://arquitetura-moderna-slz.netlify.app — site `arquitetura-moderna-slz`, id `3908b0d8-3500-4973-8eeb-14112664244c`. Publica a pasta `site/` (`netlify.toml`, sem build).
- Repositório: https://github.com/jzantonio/Arquitetura-Moderna (público). Clone local em `C:\Users\Jose Antonio\Downloads\fiams-campo\repo`.
- GitHub Pages (`jzantonio.github.io/Arquitetura-Moderna/`): só redireciona para a Netlify (`github-pages/`, `.github/workflows/pages.yml`).
- Supabase: projeto **Arquitetura Moderna SLZ**, id `mbaojesxkkwnjpmjgcqj`, URL `https://mbaojesxkkwnjpmjgcqj.supabase.co`. Site URL e Redirect URL: `https://arquitetura-moderna-slz.netlify.app/campo/` (o endereço do GitHub Pages continua na lista, para a transição).
- Google Cloud: projeto `fiams-campo` (conta joseantonioarq@gmail.com), OAuth Externo **em produção**, cliente Web "FIAMS campo (Supabase)". Branding: página inicial e privacidade na Netlify; domínios autorizados: o do Supabase e `arquitetura-moderna-slz.netlify.app`. A chave secreta do cliente fica só no Supabase.

## Publicar uma mudança

1. Commit e push na `main` (o push não publica a Netlify sozinho enquanto o repositório não estiver ligado a ela).
2. Publicar na Netlify: MCP da Netlify, `deploy-site` com o siteId acima; ele devolve um comando `npx -y @netlify/mcp@latest --site-id … --proxy-path …` para rodar na raiz do repositório.
3. Conferir com `curl` as páginas no ar.

## Stack e estrutura

Sem build. JavaScript ES modules, Preact + htm (`site/vendor/`), Chart.js, Leaflet, supabase-js (UMD). Nada de CDN além das fontes do Google.

```
site/index.html, css/portal.css, js/portal.js   portal (rotas #/, #/acervo, #/acervo/mapa, #/imovel/ID, #/projeto)
site/js/ficha-publica.js                        leitura da ficha publicada (usa campo/js/logic.js e schema.js)
site/js/md.js                                   formatação segura dos textos (escapa HTML)
site/privacidade.html                           política de privacidade (exigida pelo Google)
site/campo/index.html, sw.js, manifest          área da equipe (PWA; o service worker cobre /campo/)
site/campo/js/config.js                         URL e chave anon do Supabase; e-mails do modo demonstração
site/campo/js/schema.js                         GERADO por tools/: seções, campos, listas da ficha
site/campo/js/logic.js                          completude, salto, essenciais, IIM, textos, CSV, papéis (podeRevisar/ehEquipe/ehAdmin)
site/campo/js/store.js                          dados: Supabase e DEMO (localStorage); fila offline
site/campo/js/form.js editor.js ui.js           formulário, editor, componentes
site/campo/js/app.js                            login (Google), início, imóveis, perfil, rotas
site/campo/js/sup.js                            supervisão/acompanhamento: painel, alunos, fichas, revisão, inventário
site/campo/js/admin.js                          administração: Publicação, Pessoas, Textos do portal
site/campo/data/seed.json                       GERADO por tools/: 86 imóveis + pré-preenchimento
supabase/01_schema.sql, 02_seed_imoveis.sql (gerado), 03_plataforma.sql
tools/                                          geradores em Python (ver tools/README.md); sem Python nesta máquina, use Node
```

Teste local: servidor estático na pasta `site/` (o portal lê o banco real como visitante). Para a área da equipe, use uma cópia com as chaves esvaziadas em `campo/js/config.js` (modo demonstração; `jose.lopes@undb.edu.br` entra como admin).

## Banco (Supabase)

Tabelas: `profiles`, `papeis`, `imoveis`, `fichas`, `revisoes`, `fotos`, `conteudo`, mais o bucket privado `fotos`. RLS em tudo.

- **Perfis** (`profiles.role`): `aluno`, `supervisor`, `pesquisador` (lê tudo, não escreve), `admin`. Funções: `is_supervisor()` (supervisor ou admin), `is_equipe()` (+ pesquisador), `is_admin()`. A tabela `papeis` (e-mail → papel) define o papel na criação da conta e, ao mudar, atualiza a conta existente; o gatilho impede ficar sem administrador. RPC `definir_papel(uid, papel)` só para admin. Hoje: José = admin, Luís = supervisor.
- **Cadastro só por Google, qualquer domínio** (gatilho `enforce_google`). A restrição `@undb.edu.br` foi retirada a pedido do usuário em 30/09/2026. Não afrouxe o "só Google" sem o usuário. Nunca coloque a chave `service_role` no repositório.
- **Publicação**: `fichas.publicada`, `publicada_em`, `dados_publicos`. Só admin publica, só ficha aprovada; sair de "aprovada" despublica. `dados_publicos = dados_para_publico(dados)` remove `v.*`, `23.*`, `Q1–Q7`, `24.5`, `1.1.3` e `__*`. No insert o gatilho força `rascunho` para não supervisores.
- **Leitura pública (anon)** por coluna: `imoveis` (id, n, nome, endereço, bairro, localidade, lat, lon, autor, data_ref, função), `fichas` publicadas (id, imovel_id, publicada, publicada_em, dados_publicos), `fotos` de fichas publicadas e seus arquivos no Storage, `conteudo`, RPC `estatisticas_publicas()`. O portal usa sempre um cliente anônimo (sem sessão). Nada de `select=*` como anon.
- `imoveis.seed` está vazio no banco; a área da equipe usa `campo/data/seed.json` (`getImovelSeed`).
- Rode `get_advisors` (security) depois de mudar o esquema. Avisos esperados: funções `security definer` executáveis (`estatisticas_publicas` pelo anon; `is_*` e `definir_papel` por autenticados) e "leaked password protection" (login por senha desligado).
- Os `supabase/*.sql` são a fonte de verdade para recriar (01 → 02 → 03). Se mudar o banco, atualize o arquivo correspondente.

## Regras da ficha (não mudar sem o usuário)

- **Recorte temporal 1930–1980** (decidido em 30/09/2026). Lista `PER` do 4.2: décadas até "1970–1979" e "1980".
- Ordem numérica da FIAMS, em 7 etapas (A a G). Seção 0 "Visita de campo" vem do Roteiro de campo.
- **Sem travas rígidas.** Lógica de salto suave. Única trava: enviar à supervisão exige os 10 itens essenciais (`essentials()`), incluindo GPS de campo e foto da fachada principal.
- IIM: A1–A7, Preservado 2 / Adaptado 1 / Suprimido 0; n.a./s.d. fora do cálculo.
- Valores do Inventário v4 aparecem como "do inventário", com botão para confirmar em campo. Divergências são sinalizadas, nunca resolvidas sozinhas.
- Nunca renumere códigos de campo (ex.: `8.2.1`): os dados são guardados por eles, e o filtro público depende de `v.`, `23.`, `Q1–Q7`, `24.5` e `1.1.3`.

## Convenções

- Texto da interface em pt-BR, frases curtas, sem jargão técnico.
- Identidade: concreto `#ECEEEA`, grafite `#1C2629`, azulejo `#1F4E8C`, campo `#E07B00`, documental `#3D6E9E`, análise `#4F7F45`; fonte Archivo; o cobogó é o elemento de assinatura.
- **Ao alterar arquivos da área da equipe, aumente a versão em `site/campo/sw.js` (`fiams-vN`)**. Arquivo novo usado pela área da equipe entra na lista `CORE` do `sw.js`.
- `schema.js`, `seed.json` e `02_seed_imoveis.sql` são **gerados** (`tools/regenerar.py`). Não edite à mão; o Inventário v4 (`tools/input/`) não vai para o GitHub.

## Estado atual e pendências

Feito (30/09/2026): plataforma publicada na Netlify (portal + área da equipe); banco com perfis, publicação, leitura pública e textos (`03_plataforma.sql`, aplicado e testado como anon e como admin numa transação desfeita); login com Google ativo e testado com jose.lopes@undb.edu.br; GitHub Pages redirecionando para a Netlify.

Pendente:
1. Ligar o repositório do GitHub à Netlify (publicação automática a cada push). Exige o usuário autorizar o app da Netlify no GitHub.
2. Primeira ficha real aprovada e publicada: conferir a página pública com fotos.
3. Testar com uma conta de aluno (Gmail qualquer): perfil, ficha, foto, envio, revisão.
4. Opcional: domínio próprio (ex.: inventario.lupa…); se mudar, atualizar Supabase (URLs) e Google (branding e domínios).

## Testes

Não há suíte no repositório. Validação feita no navegador: portal com dados reais (celular e computador), leitor de ficha publicada com dados do seed (sem vazamento dos campos sigilosos), área da equipe em modo demonstração com os perfis admin e pesquisador (publicar, pessoas, revisão só leitura), e regras do banco por SQL com `set role anon`/`authenticated`.
