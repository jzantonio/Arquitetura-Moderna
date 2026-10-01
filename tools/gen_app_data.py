import json, re, glob, datetime
from pathlib import Path
HERE=Path(__file__).resolve().parent; WORK=HERE/'work'; ROOT=HERE.parent
from openpyxl import load_workbook
raw=json.load(open(WORK/'schema_raw.json')); SC=raw['schema']; LISTS=raw['lists']
TITLES={"1":"Identificação do bem","2":"Caracterização do bem","3":"Autoria e agentes da produção","4":"Cronologia do bem","5":"História e desenvolvimento",
"6":"Documentação histórica","7":"Implantação e relação com o lote","8":"Caracterização arquitetônica","9":"Caracterização técnico-construtiva",
"10":"Bens integrados e síntese das artes","11":"Uso e apropriação","12":"Relação com o entorno e a paisagem urbana","13":"Análise da autenticidade",
"14":"Integridade","15":"Alterações e transformações","16":"Estado de conservação","17":"Mapa de danos e patologias","18":"Riscos e ameaças",
"19":"Valores culturais e significância","20":"Avaliação do exemplar modernista","21":"Classificação de prioridade para preservação",
"22":"Documentação gráfica (dossiê)","23":"Entrevista e memória social","24":"Fontes e referências","25":"Equipe e responsabilidade técnica",
"26–27":"Monitoramento periódico","28":"Síntese final do inventário"}
STAGES=[{"id":"A","title":"Identificação","secs":["0","1","2"]},{"id":"B","title":"Autoria e história","secs":["3","4","5","6"]},
 {"id":"C","title":"Lote e arquitetura","secs":["7","8","9","10"]},{"id":"D","title":"Uso, entorno e avaliação","secs":["11","12","13","14"]},
 {"id":"E","title":"Transformações e conservação","secs":["15","16","17","18"]},{"id":"F","title":"Valores e prioridade","secs":["19","20","21"]},
 {"id":"G","title":"Dossiê, memória e síntese","secs":["22","23","24","25","26–27","28"]}]
TIDS=["crono","usos","iim","projobra","alteracoes","componentes","danos","riscos"]
def fix(t):
    if not t: return t
    t=t.replace("(especificar na coluna E)","(especifique na observação)").replace("(coluna E)","(especifique na observação)")
    t=t.replace("na coluna E","no campo de observação").replace("Nome do arquivo na coluna E.","Informe o nome do arquivo na observação.")
    t=t.replace("Números das fotos na coluna E (ver log fotográfico na aba Roteiro_Campo).","Marcado automaticamente ao enviar fotos com esta vista.")
    t=t.replace("Registrar divergências com cadastro/bibliografia na coluna E.","Registre divergências com cadastro/bibliografia na observação.")
    t=t.replace("Informar o método na coluna E","Informe o método na observação").replace("indicar o método na coluna E","indique o método na observação")
    t=t.replace("registrar esquerdo/direito na coluna E","registre esquerdo/direito na observação").replace("Explicitar o critério na coluna E","Explicite o critério na observação")
    t=t.replace("Registrar 'Demolido' na coluna E","Registre 'Demolido' na observação")
    return t
sections=[]; cur=None; rowmap={}  # id -> (row, kind)
ti=0
# seção 0 (Roteiro de campo)
sections.append({"id":"0","title":"Visita de campo","items":[
 {"type":"note","text":"Dados da visita, do Roteiro de campo da FIAMS. Preencha ao chegar ao imóvel."},
 {"type":"field","id":"v.data","code":"V.1","label":"Data da visita","tag":"CAMPO","kind":"date","count":True},
 {"type":"field","id":"v.horario","code":"V.2","label":"Horário (início – fim)","tag":"CAMPO","kind":"text","count":False,"hint":"Ex.: 09:10 – 10:25"},
 {"type":"field","id":"v.equipe","code":"V.3","label":"Equipe","tag":"CAMPO","kind":"text","count":True},
 {"type":"field","id":"v.clima","code":"V.4","label":"Condições climáticas / luz","tag":"CAMPO","kind":"text","count":False},
 {"type":"field","id":"v.autorizacao","code":"V.5","label":"Autorização do proprietário / ocupante","tag":"CAMPO","list":"VIS","count":True},
 {"type":"field","id":"v.contato","code":"V.6","label":"Contato no local (nome / telefone)","tag":"CAMPO","kind":"text","count":False}]})
for el in SC:
    t=el['t']
    if t=='section':
        num=el['title'].split('.')[0]
        cur={"id":num,"title":TITLES.get(num,el['title']),"items":[]}; sections.append(cur); continue
    if t=='sub': cur['items'].append({"type":"sub","title":el['title']}); continue
    if t=='note': cur['items'].append({"type":"note","text":fix(el['text'])}); continue
    if t=='field':
        code=el['code']; kind=el['kind']
        if code in ("14.2.1","14.2.2","14.2.3"): kind="computed"
        it={"type":"field","id":code,"code":code,"label":fix(el['label']).strip(),"tag":el['tag'],"kind":kind,"count":el['count'] and kind!="computed"}
        if el['dv']: it['list']=el['dv']; it.pop('kind') if kind=='text' else None
        if el['hint']: it['hint']=fix(el['hint'])
        if el['val'] is not None: it['default']=el['val']
        cur['items'].append(it); rowmap[code]=el['row']; continue
    if t=='check':
        code=el['code']; opts=[fix(o) for o in el['options']]
        cur['items'].append({"type":"check","id":code,"code":code,"label":el['label'],"tag":el['tag'],"list":el['dv'],"hint":fix(el['hint']),"options":opts})
        for i,o in enumerate(el['options']): rowmap[f"{code}|{fix(o)}"]=el['row']+1+i
        continue
    if t=='table':
        tid=TIDS[ti]; ti+=1; h=el['headers']; dvs=el['dvs']
        cols=[{"key":k,"label":h[i+2],**({"list":dvs[k]} if k in dvs else {})} for i,k in enumerate("DEF")]
        if tid=="iim": cols[1]={"key":"E","label":"Pontos","computed":True}
        if all(x=="" for x in el['rows']):
            cols=[{"key":"B","label":h[0]}]+cols
            cur['items'].append({"type":"rtable","id":tid,"tag":el['tags'][0],"cols":cols,"count":el['count'][0]})
            rowmap[tid]=(el['row']+1,len(el['rows']))
        else:
            rows=[{"label":lab,"tag":el['tags'][i],"count":el['count'][i]} for i,lab in enumerate(el['rows'])]
            cur['items'].append({"type":"table","id":tid,"rowHeader":h[0],"cols":cols,"rows":rows})
            rowmap[tid]=(el['row']+1,len(rows))
# monitoramento
for s in sections:
    if s['id']=="26–27":
        s['items']=[{"type":"note","text":"Transforma a ficha em instrumento de gestão. Cada inspeção é uma linha; não sobrescreva registros anteriores."},
        {"type":"sub","title":"26. Registro de inspeções"},
        {"type":"rtable","id":"inspecoes","tag":"CAMPO","count":False,"cols":[{"key":"data","label":"Data da inspeção","kind":"date"},{"key":"situacao","label":"Situação comparada à última inspeção","list":"SITMON"},
          {"key":"alteracoes","label":"Alterações observadas"},{"key":"patologias","label":"Novas patologias"},{"key":"intervencoes","label":"Novas intervenções"},{"key":"entorno","label":"Alterações no entorno"},
          {"key":"acao","label":"Necessidade de ação","list":"ACAO"},{"key":"proxima","label":"Próxima inspeção","kind":"date"},{"key":"responsavel","label":"Responsável"}]},
        {"type":"sub","title":"27. Matriz de monitoramento (1 a 5; 5 = situação mais favorável)"},
        {"type":"matrix","id":"matriz","tag":"ANÁLISE","rows":[["Integridade","1 muito baixa → 5 muito alta"],["Autenticidade","1 muito baixa → 5 muito alta"],["Estado de conservação","1 ruína → 5 excelente"],["Integridade do entorno","1 descaracterizado → 5 preservado"],["Compatibilidade de uso","1 incompatível → 5 compatível"],["Risco de descaracterização","1 crítico → 5 muito baixo"],["Risco de perda","1 crítico → 5 muito baixo"],["Pressão imobiliária","1 muito alta → 5 muito baixa"],["Proteção legal","1 nenhuma → 5 tombamento"],["Documentação disponível","1 inexistente → 5 completa"]]}]
LISTS["SITMON"]=LISTS["SITMON"]; 
open(ROOT/'site'/'campo'/'js'/'schema.js','w').write("export const SCHEMA="+json.dumps({"sections":sections,"stages":STAGES},ensure_ascii=False)+";\nexport const LISTS="+json.dumps(LISTS,ensure_ascii=False)+";\n")
json.dump(rowmap,open(WORK/'rowmap.json','w'),ensure_ascii=False)
print(len(sections),sum(len(s['items']) for s in sections))
