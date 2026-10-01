# Geradores de dados do FIAMS campo

Estes programas produzem os arquivos que o app usa, a partir da **planilha FIAMS** (definida em `build_ficha.py`) e do **Inventário v4**. Só precisam rodar quando a ficha ou o inventário mudarem.

| Saída | O que é |
|---|---|
| `../site/campo/js/schema.js` | seções, campos e listas da ficha no app |
| `../site/campo/data/seed.json` | 86 imóveis com o pré-preenchimento de cada ficha |
| `../supabase/02_seed_imoveis.sql` | mesma carga, em SQL para o Supabase |
| `work/fichas/` | as 86 fichas em Excel, com o pré-preenchido em azul (não vai para o GitHub) |
| `work/template.xlsx` | a ficha FIAMS em branco, em Excel (não vai para o GitHub) |

## Como rodar

```bash
pip install -r requirements.txt
# coloque o Inventário v4 em tools/input/  (nome exato abaixo)
python regenerar.py
```

Arquivo de entrada: `input/Inventario_MonteCastelo_JoaoPaulo_Filipinho_v4_GERAL_1.xlsx`, com a aba **Consolidado**. As pastas `input/` e `work/` não são enviadas ao GitHub.

## O que cada script faz

1. `build_ficha.py` gera a ficha FIAMS em Excel e o esquema de campos (`work/schema_raw.json`). É a fonte da estrutura da ficha: para mudar um campo, uma lista ou um texto, edite este arquivo.
2. `fill.py` preenche uma ficha por imóvel com os dados do Inventário v4. Os valores extraídos das observações de cada registro estão em `overrides.py`; ao revisar o inventário, ajuste-os lá.
3. `blue.py` marca em azul o que veio do inventário.
4. `index.py` monta o índice das fichas.
5. `gen_app_data.py` converte o esquema em `site/campo/js/schema.js` (títulos das seções, etapas, tabelas).
6. `gen_seed.py` lê as fichas e escreve `site/campo/data/seed.json` e `02_seed_imoveis.sql`.

## Depois de regenerar

1. `git diff --stat` para ver o que mudou.
2. Aumente a versão em `sw.js` (`fiams-vN`) para os celulares atualizarem.
3. Se o pré-preenchimento mudou, use o botão **Carregar / atualizar** em Supervisão → Inventário. Isso atualiza o banco, e as fichas que os alunos já iniciaram não são alteradas.
4. Se um imóvel entrou ou saiu, atualize também a tabela `imoveis` no Supabase (o SQL usa `on conflict`, então rodar o `02_seed_imoveis.sql` de novo atualiza os existentes).

Atenção: mudar a numeração ou os códigos dos campos (`1.4.1`, `8.2.1`…) quebra as fichas já preenchidas, porque os dados dos alunos são guardados por esses códigos. Avise o usuário antes.
