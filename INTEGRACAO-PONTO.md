# Patch Fase 1 — Fundacao do Ponto Eletronico

Este pacote entrega a **camada de leitura e armazenamento** do modulo de Ponto Eletronico:
parser fixed-width (ACJEF/AFDT/AFD), services Firestore para modelos e layouts,
event bus em memoria e merger com deteccao de conflitos. **Sem UI** ainda — isso
vem na Fase 2 depois de validar o parser com 1 arquivo ACJEF real.

## Arquivos deste pacote

```
src/
  types/
    ponto.ts                      ← TODOS os tipos do modulo
  services/
    ponto/
      pontoFixedWidthParser.ts    ← Parser ACJEF (schema-driven)
      pontoModelosService.ts      ← CRUD em ponto_modelos
      pontoLayoutsService.ts      ← CRUD em ponto_layouts
    exportador/
      eventBus.ts                 ← Coleta eventos de folha + ponto na sessao
      merger.ts                   ← Detecta conflitos + aplica resolucoes
seed/
  acjef_p1510_v1.json             ← Modelo base ACJEF Portaria 1510
scripts/
  test-acjef-parser.mjs           ← Validador standalone (rodar ANTES de subir UI)
PATCH-firestore-rules.md          ← Regras das colecoes novas
INTEGRACAO.md                     ← este arquivo
```

## Roteiro de instalacao

### Passo 1 — Copiar arquivos para o projeto

```bash
cd ~/Documents/Consultor-DP-Folhapagamentos

# Copia os arquivos de codigo para a estrutura existente
cp -r ./caminho-pro-pacote-baixado/src/types/ponto.ts             ./types/
cp -r ./caminho-pro-pacote-baixado/src/services/ponto             ./services/
cp -r ./caminho-pro-pacote-baixado/src/services/exportador        ./services/

# Pasta de seed e script ficam na raiz, nao entram no build
mkdir -p ./seed-ponto ./scripts-ponto
cp ./caminho-pro-pacote-baixado/seed/acjef_p1510_v1.json          ./seed-ponto/
cp ./caminho-pro-pacote-baixado/scripts/test-acjef-parser.mjs     ./scripts-ponto/
```

> Atencao: os imports nos arquivos de service usam `'../firebase'`. Se o teu
> `firebase.ts` mora em outro path no projeto, ajusta o import. No projeto atual
> ele esta em `services/firebase.ts`, entao da pra deixar como esta.

### Passo 2 — Rodar typecheck pra garantir que nada quebrou

```bash
npm run typecheck
# ou
npx tsc --noEmit
```

Erros esperados se houver: caminho do `firebase.ts` ou import de tipos.
Nao deve quebrar nada existente — sao arquivos novos, sem conflito.

### Passo 3 — Atualizar Firestore Rules

Ver `PATCH-firestore-rules.md` no pacote. 5 minutos.

### Passo 4 — Cadastrar o modelo ACJEF base no Firestore

Usa o mesmo padrao que voce usou pra subir SPA: ou pelo Console manualmente,
ou usando um script Node parecido com o `seed-ferrante.mjs`.

**Via Console (recomendado pra so 1 doc):**

1. Abrir `https://console.firebase.google.com/project/consultor-dp-folha/firestore/data/~2Fponto_modelos`
2. `+ Iniciar colecao` -> nome: `ponto_modelos`
3. `+ Adicionar documento` -> ID: `acjef_p1510_v1`
4. Abrir o `seed/acjef_p1510_v1.json` e cadastrar campo a campo (ou use o "Editar como JSON" se aparecer)

**Via script (se preferir):**

Adapta o `seed-ferrante.mjs` que ja funcionou — troca o caminho do JSON e o
nome da colecao para `ponto_modelos`.

### Passo 5 — VALIDAR O PARSER COM ARQUIVO REAL  ⚠️

Este e o passo CRITICO antes de seguir pra Fase 2.

```bash
# Pega 1 arquivo ACJEF real de QUALQUER cliente teu (preferencialmente um
# mes recente que tu ja tenha importado manualmente, pra comparar resultados)
# Salva ele em ./scripts-ponto/exemplo.acjef

cd ~/Documents/Consultor-DP-Folhapagamentos/scripts-ponto

node test-acjef-parser.mjs ./exemplo.acjef ../seed-ponto/acjef_p1510_v1.json 60882552000100
#                          ^arquivo do cliente   ^modelo                        ^CNPJ esperado
```

O script vai imprimir:

- Cabecalho extraido (CNPJ, razao, periodo, versao do layout)
- Primeiros 5 eventos com TODOS os campos decodificados
- Inventario: PIS distintos, codigos distintos
- Quais codigos ainda nao tem mapeamento

**O que olhar:**

| Indicador | OK significa | Problema significa |
|---|---|---|
| CNPJ no cabecalho | bate com `cnpjEsperado` | posicao 13-26 do schema esta deslocada |
| Razao social | nome legivel | provavel deslocamento — ajustar inicio/tamanho |
| Datas DD/MM/AAAA | datas plausiveis (ex: 01/04/2026) | posicao das datas errada no schema |
| Codigos de evento | 4 chars numericos ou alfanum. plausiveis | posicao do `codEvento` esta deslocada |
| Tempo apurado | numero positivo razoavel (HHMM em minutos: ex 480 = 8h) | posicao de `tempoApurado` errada |

Se algum sair embolado, ajusta as posicoes no `acjef_p1510_v1.json`, atualiza
no Firestore Console e roda o script de novo. **Schema-as-data e isso: nao precisa
mexer em codigo nem fazer deploy.**

Quando tudo sair bonito, manda o output do script aqui no chat que eu valido
junto e libero a Fase 2.

## Fase 2 — UI (vai vir depois da validacao)

Apos o parser estar comprovadamente lendo um arquivo real:

1. **Selector de tipo no fluxo de Folha**: adicionar "Ponto Eletronico" ao lado de
   "Folha de Salario", "13o", etc.
2. **`ApontamentoPontoPanel.tsx`**: tela de upload do arquivo de ponto, similar
   ao `ApontamentoFolhaPanel`.
3. **`WizardModeloPonto.tsx`**: modal de 1a importacao por empresa — escolhe o
   modelo (ACJEF padrao, DIMEP, Henry, etc), salva em `ponto_layouts/{cnpj}_{sage}`.
4. **`ConflictResolutionModal.tsx`**: modal interativo que lista os conflitos
   entre folha e ponto e deixa o usuario decidir caso a caso (foi a opcao escolhida
   sobre a regra de merger).
5. **Integracao com exportador IOB SAGE existente**: alimenta o exportador atual
   com `[...folhaEventos, ...pontoEventos]` resolvidos, gerando 1 TXT mesclado.

A entrega da Fase 2 sera mais rapida porque a logica esta toda aqui — restara
apenas casca de UI e o "fio" pro export.

## Decisoes de design ja tomadas (registradas pra historia)

- **Schema-as-data**: campos do ACJEF moram no Firestore, nao no codigo. Ajustes
  nao requerem deploy.
- **Encoding ISO-8859-1**: padrao da Portaria 1510, decoded via TextDecoder.
- **Dois servicos paralelos** (`ponto_modelos` + `ponto_layouts`): catalogo
  reutilizavel + parametrizacao por empresa, mesmo padrao da folha.
- **Event bus separado por origem**: cada evento carrega `origem: 'folha' | 'ponto'`,
  o que viabiliza o merger com resolucao de conflitos.
- **Merger interativo**: nao auto-resolve. Detecta conflitos e devolve pra UI
  decidir via modal. Decisao do CEO.
- **TXT mesclado**: 1 arquivo por empresa por competencia, fundindo eventos das
  duas fontes. Decisao do CEO.
- **Validacao cruzada de CNPJ**: parser aborta se header do arquivo trouxer CNPJ
  diferente da empresa selecionada. Previne upload de arquivo errado pra empresa
  errada (situacao real e cara de reverter).

## Scripts auxiliares relevantes (ja existem no projeto)

- `seed-ferrante.mjs` — modelo de seed via Node Admin SDK, da pra adaptar pra
  popular `ponto_modelos` em batch quando tivermos varios fabricantes.
- `audit-ferrante.mjs` — modelo de auditoria, util pra criar `audit-ponto.mjs`
  futuramente.
