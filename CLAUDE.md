# FIAMS campo — contexto para o Claude Code

Responda sempre em português do Brasil. O usuário é o Prof. José Antônio Viana Lopes (UNDB, coordenador do LUPA). Trabalhe de forma autônoma: execute, teste e só pergunte quando a decisão for dele.

## O que é

Web app (PWA, celular/tablet/desktop) para coleta em campo da **Ficha de Inventário da Arquitetura Moderna de São Luís (FIAMS)**, recorte Monte Castelo, João Paulo e Filipinho. Alunos preenchem fichas; a supervisão acompanha, revisa, devolve ou aprova.

- App no ar (GitHub Pages): https://jzantonio.github.io/Arquitetura-Moderna/
- Repositório: https://github.com/jzantonio/Arquitetura-Moderna (público; a publicação é automática a cada push na `main`, por `.github/workflows/pages.yml`)
- Supabase: projeto **Arquitetura Moderna SLZ**, id `mbaojesxkkwnjpmjgcqj`, URL `https://mbaojesxkkwnjpmjgcqj.supabase.co`
- Netlify: site `fiams-campo` (id `3908b0d8-3500-4973-8eeb-14112664244c`) criado e ainda vazio. Decidir com o usuário se será usado ou apagado.

## Stack e estrutura

Sem build. JavaScript ES modules, Preact + htm (em `vendor/`), Chart.js, Leaflet, supabase-js (UMD). Nada de CDN além das fontes do Google.

```
index.html, sw.js, manifest.webmanifest   página, offline (service worker), PWA
css/app.css                               estilos (mobile-first; identidade "cobogó")
js/config.js                              URL e chave anon do Supabase; lista de supervisores; domínio
js/schema.js                              GERADO por tools/: seções, campos, listas da ficha
js/logic.js                               completude, lógica de salto, essenciais, IIM, textos didáticos, CSV
js/store.js                               dados: backend Supabase e backend DEMO (localStorage); fila offline
js/form.js  editor.js  ui.js              formulário, editor da ficha, componentes
js/app.js                                 login (Google), início, imóveis, perfil, rotas (hash)
js/sup.js                                 menu Supervisão: painel, alunos, fichas, revisão, inventário
data/seed.json                            GERADO por tools/: 86 imóveis + pré-preenchimento (Inventário v4)
supabase/01_schema.sql, 02_seed_imoveis.sql (o 02 é gerado por tools/)
tools/                                    geradores em Python (ver tools/README.md)
```

Modo demonstração: se `SUPABASE_URL`/`SUPABASE_ANON_KEY` em `js/config.js` estiverem vazios, o app usa localStorage. Para testar local: `python -m http.server` na raiz, com as chaves esvaziadas numa cópia.

## Banco (Supabase)

Tabelas: `supervisores`, `profiles`, `imoveis`, `fichas`, `revisoes`, `fotos`, mais o bucket privado `fotos`. RLS em tudo. O aluno só vê as próprias fichas; supervisor vê tudo; só supervisor aprova ou devolve (gatilho `guard_status`).

- **Cadastro só por Google, qualquer domínio**, imposto no banco pelo gatilho `enforce_google` em `auth.users`. A restrição a `@undb.edu.br` foi retirada a pedido do usuário em 30/09/2026 (banco e app). Não afrouxe o "só Google" sem o usuário. Não peça para desativar a confirmação de e-mail e nunca coloque a chave `service_role` no repositório.
- Supervisores (super adm): `jose.lopes@undb.edu.br` e `luis.longhi@undb.edu.br`, definidos na tabela `supervisores`; o papel é atribuído na criação da conta.
- As migrações foram aplicadas direto no projeto pelo MCP do Supabase. Os arquivos `supabase/*.sql` são a fonte de verdade para recriar. Se mudar o banco, atualize também o `01_schema.sql`.
- A tabela `imoveis` tem os 86 imóveis **sem** o campo `seed` (pré-preenchimento). O app busca em `data/seed.json` quando o banco vem sem ele (`getImovelSeed` em `store.js`). O botão "Carregar / atualizar" na Supervisão grava o seed completo.
- O MCP do Supabase é o jeito mais rápido de conferir dados e aplicar SQL. Rode `get_advisors` (security) depois de mudar o esquema. Sobra um aviso esperado sobre `is_supervisor()`.

## Regras da ficha (não mudar sem o usuário)

- **Recorte temporal 1930–1980** (decidido pelo usuário em 30/09/2026; antes era 1930–1970). Lista `PER` do 4.2: décadas até "1970–1979" e "1980". Os 8 imóveis dos anos 1970 deixaram de ter alerta "fora do recorte". Os arquivos gerados foram ajustados por script Node (sem Python nem Inventário v4 à mão), reproduzindo o que `fill.py`/`build_ficha.py` corrigidos gerariam.
- Ordem numérica da FIAMS, em 7 etapas (A a G). Seção 0 "Visita de campo" vem do Roteiro de campo.
- **Sem travas rígidas.** Lógica de salto suave: campo "não se aplica" some da conta (ex.: sem acesso ao interior oculta 8.2.2–8.2.5). Filtro Tudo/Campo/Documental/Análise = "modo campo".
- Única trava: **enviar à supervisão** exige 10 itens essenciais (`essentials()` em `logic.js`), incluindo GPS capturado em campo (não geocodificação) e foto da fachada principal.
- IIM: A1–A7, Preservado 2 / Adaptado 1 / Suprimido 0; n.a./s.d. ficam fora do cálculo.
- Valores vindos do Inventário v4 aparecem como "do inventário", com botão para confirmar em campo. Divergências são sinalizadas, nunca resolvidas sozinhas.
- Offline: cache local com bandeira de pendência, envio automático ao voltar a conexão; fotos em IndexedDB.

## Convenções

- Texto da interface em pt-BR, frases curtas, verbo no infinitivo ou imperativo, sem jargão técnico.
- Identidade: fundo concreto `#ECEEEA`, grafite `#1C2629`, azulejo `#1F4E8C`, campo `#E07B00`, documental `#3D6E9E`, análise `#4F7F45`; fonte Archivo; o cobogó é o elemento de assinatura (navegação por seções, logotipo, fundo do login).
- **Ao alterar qualquer arquivo do app, aumente a versão em `sw.js` (`fiams-v2` → `fiams-v3`)** para os celulares baixarem a nova versão.
- `js/schema.js`, `data/seed.json` e `supabase/02_seed_imoveis.sql` são **gerados** por `tools/regenerar.py` (Python + openpyxl) a partir da ficha FIAMS (`tools/build_ficha.py`) e do Inventário v4. Não edite esses três arquivos à mão: altere os geradores e rode de novo. O Inventário v4 (`tools/input/`) não vai para o GitHub; peça-o ao usuário se precisar regenerar. Nunca renumere códigos de campo (ex.: `8.2.1`): os dados dos alunos são guardados por eles.

## Estado atual e pendências

Feito: banco e regras no Supabase; 86 imóveis carregados; app publicado; regra de cadastro só-Google no banco; código de login com Google escrito e testado em modo demonstração; recorte 1930–1980 e cadastro aberto a qualquer conta Google publicados (30/09/2026).

Pendente, em ordem:
1. **Login com Google (ação do usuário):** criar o ID de cliente OAuth no Google Cloud Console, com redirecionamento `https://mbaojesxkkwnjpmjgcqj.supabase.co/auth/v1/callback`, e colar ID e chave secreta em Supabase → Authentication → Sign In / Providers → Google. A chave secreta é credencial: quem cola é o usuário. Depois desativar o provedor Email.
2. Em Supabase → Authentication → URL Configuration, o Site URL e o Redirect URL já são o endereço do GitHub Pages. Se o Netlify for usado, adicionar o endereço dele também.
3. **Testar de ponta a ponta** com uma conta real: entrar com Google como `jose.lopes@undb.edu.br`, conferir que o papel virou `supervisor` (`select email, role from profiles`), abrir "Cine Monte Castelo", iniciar ficha, preencher, recarregar, enviar foto, enviar à supervisão, revisar como supervisor.
4. Decidir sobre o Netlify (publicar aqui ou apagar o site vazio). Se publicar, o site vem com login SSO desativado.
5. Opcional: gravar o `seed` completo no banco (botão na Supervisão), depois de testar o login.

## Testes

Não há suíte no repositório. O fluxo foi validado com Playwright em modo demonstração (login, imóveis, ficha, GPS, IIM, foto, envio, supervisão) e as regras do banco com PostgreSQL local. Vale recriar um teste E2E básico (`tests/`) se o usuário quiser.
