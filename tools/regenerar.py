"""Regenera os dados do app a partir da planilha FIAMS e do Inventário v4.

Uso (na pasta tools):  python regenerar.py
Requisitos: Python 3.10+ e openpyxl  (pip install openpyxl)
Entrada:    input/Inventario_MonteCastelo_JoaoPaulo_Filipinho_v4_GERAL_1.xlsx  (não vai para o GitHub)
Saída:      ../js/schema.js   ../data/seed.json   ../supabase/02_seed_imoveis.sql
            work/  (arquivos intermediários e as 86 fichas em Excel; não vai para o GitHub)
"""
import subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENTRADA = HERE / "input" / "Inventario_MonteCastelo_JoaoPaulo_Filipinho_v4_GERAL_1.xlsx"
(HERE / "input").mkdir(exist_ok=True)
if not ENTRADA.exists():
    sys.exit(f"Falta o arquivo de entrada:\n  {ENTRADA}\nCopie para lá o Inventário v4 (aba Consolidado).")

ETAPAS = [
    ("build_ficha.py", "1/6  Ficha FIAMS em Excel (template) e esquema dos campos"),
    ("fill.py", "2/6  86 fichas pré-preenchidas a partir do Inventário v4"),
    ("blue.py", "3/6  Valores pré-preenchidos em azul nas fichas"),
    ("index.py", "4/6  Índice das fichas"),
    ("gen_app_data.py", "5/6  js/schema.js (campos do app)"),
    ("gen_seed.py", "6/6  data/seed.json e supabase/02_seed_imoveis.sql"),
]
for script, titulo in ETAPAS:
    print(f"\n== {titulo}")
    r = subprocess.run([sys.executable, str(HERE / script)], cwd=HERE)
    if r.returncode:
        sys.exit(f"Falhou em {script}")
print("\nPronto. Confira com 'git diff --stat' e faça o commit.")
print("Se mudou o pré-preenchimento, use o botão 'Carregar / atualizar' na Supervisão do app para gravar no banco.")
