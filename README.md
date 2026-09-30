# FIAMS campo

Aplicativo web (celular, tablet e computador) para a coleta em campo da **Ficha de Inventário da Arquitetura Moderna de São Luís (FIAMS)**, recorte Monte Castelo, João Paulo e Filipinho.

Desenvolvido para o LUPA — Laboratório de Urbanismo, Paisagem, Arquitetura e Artes (Centro Universitário UNDB).

- Ficha completa, em sete etapas e na ordem numérica da FIAMS, com filtro por tipo de coleta: Campo, Documental ou Análise.
- 86 imóveis do Inventário v4 já cadastrados. Cada ficha abre pré-preenchida, com os valores marcados como "do inventário".
- Captura de coordenadas pelo GPS (latitude, longitude, UTM SIRGAS 2000), fotos pela câmera e cálculo automático do IIM (A1–A7).
- Funciona sem internet: salva no aparelho e sincroniza quando a conexão volta.
- Menu de **Supervisão** com:
  - painel da turma com textos e gráficos;
  - dados compilados por aluno, exportáveis em CSV;
  - revisão de cada ficha, mostrando o que falta, e as ações comentar, devolver ou aprovar.

---

## Estrutura

```
index.html, sw.js, manifest.webmanifest   página, modo offline e instalação (PWA)
css/app.css                               estilos
js/config.js                              ← ÚNICO arquivo que você edita (chaves do Supabase)
js/*.js                                   aplicativo
data/seed.json                            86 imóveis pré-preenchidos (botão de carga na Supervisão)
vendor/                                   bibliotecas (Preact, Supabase, Chart.js, Leaflet), sem depender de CDN
supabase/01_schema.sql                    banco: tabelas, papéis e regras de segurança
supabase/02_seed_imoveis.sql              carga dos 86 imóveis
.github/workflows/pages.yml               publicação automática no GitHub Pages
```

---

## Instalação (uma vez, cerca de 20 minutos)

### 1. Criar o repositório no GitHub

Pelo navegador, sem instalar nada:

1. Em github.com, clique em **New repository**. Nome sugerido: `fiams-campo`. Não marque a opção de criar README.
2. Na página do repositório vazio, clique em **uploading an existing file**.
3. Arraste **todo o conteúdo** desta pasta, inclusive a pasta `.github`. Depois clique em **Commit changes**.

A pasta `.github` começa com ponto e costuma ficar oculta. No macOS, pressione Cmd+Shift+. no Finder para exibi-la. No Windows, marque "Itens ocultos" no Explorador. Se o upload não levar a pasta, crie o arquivo `.github/workflows/pages.yml` pelo botão **Add file → Create new file** e cole o conteúdo.

Se preferir o terminal:

```bash
cd fiams-campo
git init -b main
git add .
git commit -m "FIAMS campo: primeira versão"
git remote add origin https://github.com/SEU-USUARIO/fiams-campo.git
git push -u origin main
```

### 2. Criar o banco no Supabase

1. Em supabase.com, crie uma conta e um **New project**. Região sugerida: South America (São Paulo).
2. Abra **SQL Editor**, cole o conteúdo de `supabase/01_schema.sql` e clique em **Run**.
3. Faça o mesmo com `supabase/02_seed_imoveis.sql`. Isso carrega os 86 imóveis.
4. Em **Authentication → URL Configuration**:
   - **Site URL:** o endereço do app (passo 4), por exemplo `https://SEU-USUARIO.github.io/fiams-campo/`
   - **Redirect URLs:** adicione o mesmo endereço.
5. Configure o login com Google (próxima seção). O cadastro por e-mail e senha não é usado.

#### Login com Google

O app só entra por conta Google, pessoal ou institucional (qualquer domínio). A regra é imposta pelo banco (`01_schema.sql`, gatilho `enforce_google`): qualquer cadastro que não venha do Google é recusado, mesmo que alguém tente burlar a tela. Qualquer pessoa com conta Google que tenha o link pode se cadastrar como aluno; o aluno só vê as próprias fichas, e só os e-mails da tabela `supervisores` têm acesso à supervisão.

1. Em console.cloud.google.com, crie um projeto (ex.: "FIAMS campo") e abra **APIs e serviços → Tela de consentimento OAuth**. Tipo de usuário: **Externo** (o tipo "Interno" limitaria o acesso às contas de uma organização).
2. Em **Credenciais → Criar credenciais → ID do cliente OAuth**, escolha **Aplicativo da Web**.
3. Em **URIs de redirecionamento autorizados**, cole exatamente: `https://mbaojesxkkwnjpmjgcqj.supabase.co/auth/v1/callback`
4. Copie o **ID do cliente** e a **chave secreta do cliente**.
5. No Supabase, abra **Authentication → Sign In / Providers → Google**, ative, cole os dois valores e salve.
6. Ainda em **Sign In / Providers**, desative **Email** (não é usado). Não é obrigatório, porque o banco já recusa.

**Supervisores (acesso total):** `jose.lopes@undb.edu.br` e `luis.longhi@undb.edu.br`. Ao entrar pela primeira vez com Google, a conta já nasce como supervisora. Para alterar a lista, edite a tabela `supervisores` no Supabase (Table Editor); vale para novas contas.

### 3. Ligar o app ao banco

> Neste pacote o `js/config.js` **já aponta para o projeto "Arquitetura Moderna SLZ"** (URL e chave anon preenchidas) e o esquema do passo 2 já foi aplicado nele. Só use as instruções abaixo se trocar de projeto.

No Supabase, abra **Project Settings → API** e copie a **Project URL** e a chave **anon public**. No GitHub, abra `js/config.js`, clique no lápis (editar), cole os dois valores e faça o commit:

```js
SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOi...',
```

A chave *anon* foi feita para ficar no navegador e pode ir para o repositório. Quem protege os dados são as regras de segurança criadas no passo 2. **Nunca** coloque a chave *service_role* neste arquivo.

### 4. Publicar no GitHub Pages

1. No repositório, abra **Settings → Pages**.
2. Em **Source**, escolha **GitHub Actions**.
3. Abra a aba **Actions**. A publicação roda sozinha a cada commit; se não começar, clique em *Publicar no GitHub Pages → Run workflow*.
4. Em um ou dois minutos o endereço aparece em Settings → Pages: `https://SEU-USUARIO.github.io/fiams-campo/`.

Volte ao passo 2.4 e confira se esse endereço está no Supabase.

Observação: o GitHub Pages é gratuito para repositórios **públicos**. Para publicar a partir de um repositório **privado**, a conta precisa de GitHub Pro, que professores obtêm gratuitamente pelo GitHub Education. Outra opção é deixar o repositório privado e publicar pela Netlify, conectando o repositório ou arrastando a pasta em app.netlify.com/drop.

---

## Uso

**Supervisores** (`jose.lopes@undb.edu.br` e `luis.longhi@undb.edu.br`): entrem com **Entrar com Google**. O menu **Supervisão** aparece automaticamente.

**Alunos:**
1. Abrem o link no celular e tocam em **Entrar com Google**, com qualquer conta Google. No primeiro acesso informam nome e turma.
2. Instalam o app: no Android, pelo menu ⋮ → *Instalar app*; no iPhone, pelo botão Compartilhar → *Adicionar à Tela de Início*.
3. Em **Imóveis**, escolhem o bem e tocam em **Iniciar ficha**.

**Sem internet:** tudo o que for preenchido fica guardado no aparelho, inclusive as fotos, e sobe sozinho quando a conexão voltar. O indicador no topo mostra *Salvo*, *Salvando…* ou *Offline*. Recomende abrir o app uma vez com internet antes de ir a campo.

**Envio à supervisão:** exige apenas os 10 itens essenciais listados na tela *Revisar e enviar*. O resto pode ser completado depois.

**Exportação:** em Supervisão → Alunos ou Inventário, gere o CSV com as fichas e os atributos da tabela SIG (seção 29).

## Atualizar o app

Edite os arquivos no GitHub (ou envie um novo commit). O GitHub Pages republica sozinho. Ao mudar arquivos do app, altere também a primeira linha de `sw.js` (`fiams-v1` → `fiams-v2`) para que os celulares baixem a nova versão.

## Modo demonstração

Enquanto `js/config.js` estiver sem as chaves, o app funciona em modo demonstração, com os dados guardados só no navegador. Serve para testar e apresentar. Nesse modo, entrar com `jose.lopes@undb.edu.br` (sem senha) mostra o menu de supervisão.
