# Consultor DP Folha de Pagamentos — SP Assessoria Contábil

Memória de trabalho para sessões do Claude neste repositório. Atualize ao
assumir compromissos com o Paulo (admin/dono). É daqui que a próxima sessão
retoma. Mesmo formato do `docs/historico-claude.md` do CFI e do plano-contas-iob.
Criado em 03/10/2026.

## Prompts salvos

### 03/10/2026 — Viabilidade da migração da folha IOB/SAGE → Consultor DP

Prompt do Paulo, na íntegra:

> faça uma analise de viabilidade , como fizemos nos outros app, para possivel
> migracao do sistema de folha de pagamentos usado hoje da IOB / SAGE para o
> Consultor DP Folha de Pagamentos, aponte os pros e contras , quais principais
> impactos , quais opcoes de importacao da IOB/SAGe que usa postgresql 12 para
> nosso BD , principais melhorias se houver ? conectividade com esocial,
> atualizacoes de acordo com a legislacao , entrega de obrigacoes , geracao de
> guias e impostos , entre outros , salve este prompt

Resposta: `docs/viabilidade-migracao-folha-iob-sage.md`. Veredito: viável em
ondas, não como troca imediata. O IOB segue como sistema de registro até um
piloto em paralelo provar o cálculo próprio.

## Decisões permanentes

- **O código correto do funcionário é a matrícula do eSocial** (Paulo, 09/2026).
  A RAIS foi extinta e substituída pelo eSocial, e o XML do eSocial é a fonte do
  cadastro.
- **No IOB Office, o código do funcionário importado fica sequencial (000001)**
  e não pode ser editado. Paulo, 29/09/2026: *"este codigo nao interfere pode
  deixar desta forma"*. A matrícula do eSocial vai no campo Matrícula da ficha.
  No TXT de ponto, a matrícula do app tem de ser o código que está no IOB.
- **Carga de cadastro no IOB Office pela RAIS2009** (Utilitários › Importações),
  homologada em 28/09/2026. Só funciona com código de empresa que ainda não
  existe. O que a RAIS não traz é completado à mão pela aba "Completar após
  RAIS" do Excel de cadastro. Detalhes em `docs/implantacao-funcionarios.md`.
- **SST fica com a medicina do trabalho dos clientes** (Paulo, 03/10/2026).
  Os eventos S-2210, S-2220 e S-2240 estão fora do escopo do Consultor DP.
- **Atualização legal: toda atualização aplicada no SAGE tem de ser aplicada
  também no Consultor DP** (Paulo, 03/10/2026). Os apps já têm travas e agentes
  de validação governamental para isso.
- **Banco de dados: Firebase, como nos outros apps** (03/10/2026). A folha usa o
  Firestore com um documento por funcionário e competência, relatórios no
  BigQuery e região confirmada.
- **Backup: todo o SaaS já nasceu com backup no UNAS Pro 4 do escritório**
  (Paulo, 03/10/2026). Não propor outra rotina de backup.

## Fase 1 — conferência pós-folha

- **03/10/2026, Paulo: *"pode comecar a fase 1, conferencia pos folha"*.**
  Primeira entrega: `services/conferencia/` (leitor dos totalizadores e regras)
  e a aba Folha › Conferência pós-folha. O leitor segue os XSDs do leiaute
  S-1.3, tirados da biblioteca pública nfephp-org/sped-esocial
  (`schemes/v_S_01_03_00`). Os testes usam XML montado nessa estrutura: o
  primeiro lote real de totalizadores deve virar teste de regressão.
- Regras: INSS descontado (`vrDescSeg`) × calculado (`vrCpSeg`) por trabalhador,
  com até R$ 1,00 como arredondamento; CR 160601 (consignado) fica fora; empregado
  (categoria 1xx) com S-5001 e sem S-5003; soma dos trabalhadores × S-5011 e
  S-5013; DCTFWeb = `infoCRContrib` do S-5011 menos a parte suspensa; FGTS
  Digital = S-5013, mensal ou mensal + rescisório. Totalizador duplicado do
  mesmo trabalhador sai da conta e vira pendência, nunca é somado duas vezes.
- Pendente na fase 1: DCTFWeb e FGTS Digital pelo SERPRO (via túnel do CFI),
  download de eventos do eSocial, comparação com o resumo da folha do IOB
  (precisa de um exemplo do relatório exportado), IRRF e painel de prazos.
- **03/10/2026, Paulo: *"pode seguir com a integracao serpro"*.** A conferência
  ganhou o botão Consultar SERPRO, pelo túnel do CFI (`/api/dp-integration`):
  fechamento do eSocial, situação da DCTFWeb e FGTS Digital devido × recolhido
  (`services/conferencia/serproConferencia.ts`). O valor do SERPRO não
  sobrescreve o digitado: são duas fontes, cada uma comparada com o S-5013.
  Consulta que falha vira pendência informativa, nunca "entregue" ou "pago";
  FGTS com devido 0 e recolhido 0 é "sem valor", porque o CFI devolve 0 quando
  o campo não vem.
- **Débitos da DCTFWeb por código de receita.** O CFI já lia esses débitos do
  XML da declaração (`consultarXmlDeclaracao` + `extrairDebitosDctfweb`, usados
  nas guias separadas). A rota nova do túnel `POST /api/dp-integration/dctfweb/debitos`
  (branch `claude/dp-dctfweb-debitos` no CFI) devolve esses débitos, com a
  identificação conferida pelo próprio XML. O DP compara com o S-5011 por
  código de receita, como atenção, porque a DCTFWeb traz o saldo a pagar já
  com deduções e compensações. Resposta em modo mock do CFI ou rota não
  publicada (404) ficam indisponíveis, nunca viram número.
- **04/10/2026, Paulo: *"pode seguir com o resumo da folha do IOB"*.** A
  conferência compara o relatório da folha exportado do IOB (Excel/CSV) com os
  totalizadores (`services/conferencia/resumoFolhaIob.ts`), por funcionário e
  no total. Sem exemplo real do relatório, o leitor NÃO assume layout: acha o
  cabeçalho pelos nomes (até a 30ª linha, mínimo 3 colunas reconhecidas),
  propõe o mapeamento por sinônimos e a equipe corrige na tela. Liga por CPF;
  sem CPF, pela matrícula do eSocial (o código sequencial do IOB não casa).
  Calculado no IOB e sem totalizador = crítica ("calculada e não transmitida").
  O primeiro relatório real deve virar teste de regressão. PDF ainda não.
- **Motor de cálculo: código determinístico, não IA** (resposta ao Paulo,
  03/10/2026). O Gemini fica como assistente: explicar divergência, ler
  convenção coletiva para sugerir parâmetros que um humano valida.

## Módulo IOB SAGE e restauração do backup PostgreSQL 12

- **03/10/2026, Paulo: *"vamos trabalhar em um modal que seja capaz de efetuar o
  restore dos backups feitos em PostgreSQL 12 usado na iob sage ... análises
  comparativas no módulo iob sage, criando os menus, submenus, os devidos
  modais"*.** Paulo também pediu para cortar os passos que fizeram perder
  tempo: o inventário "só estrutura primeiro" da fase 0 virou a própria
  restauração, que já entrega o inventário.
- **Restauração = leitura no navegador** (`services/iobSage/backupPostgres.ts`):
  formatos custom, tar, plain e plain.gz do pg_dump; nada sai do computador
  nem é gravado no Firestore. Gravar no Consultor DP depende do de/para da
  fase 2. Testado com dumps REAIS de pg_dump 12.3 e 16 sobre PostgreSQL 12.22
  (`services/iobSage/__tests__/fixtures/`), e em escala: 500 esquemas e 10 mil
  tabelas abrem em ~0,8 s, 1 milhão de linhas são lidas em ~0,8 s.
  Como os fixtures foram gerados: PostgreSQL 12.22 do pacote npm
  `@embedded-postgres/linux-x64@12.22.0-beta.15` e pg_dump 12.3 do conda-forge
  (`postgresql-12.3-hc2f5b80_3`), porque a rede deste ambiente só libera
  registros de pacotes.
- **Mapa de menus** em `docs/mapa-menus-iob-folha.md`. A ajuda da IOB é
  bloqueada para leitura direta aqui; o mapa saiu de títulos e resumos de
  busca. O SGC (Gestão Contábil) tem árvore completa; o Office (o do
  escritório) só tem os menus de primeiro nível confirmados. Fechar as
  lacunas pede prints dos menus do Office ou o manual em PDF.
- **Catálogo comparativo** (`services/iobSage/catalogoMenus.ts`) com situação
  REAL por item: disponível, parcial, planejado (com fase) ou fora do escopo.
  Teste trava: item disponível aponta para a tela; planejado diz a fase.
- **Backup do IOB Office em duas partes** (pesquisa de 03/10/2026, a pedido do
  Paulo, que lembrou que a linha Office nasceu em DBF). Confirmado em fontes
  da IOB/Folhamatic: a linha Office nasceu em DBF e migra para PostgreSQL
  (driver ODBC); o cliente roda em DBF ou SQL conforme a "base ativada";
  Backup DBF = .zip, Backup SQL = .backup; e o Backup SQL tem DUAS partes:
  .zip com o cadastro das empresas e .backup com a folha (Ajuda Aprendo³,
  artigo 4898). NÃO confirmado ainda: que o .zip contém DBF (muito provável)
  e a versão do PostgreSQL (o modal mostra a de origem). Paulo: *"Pode seguir"*.
- **Leitor DBF** (`services/iobSage/dbf.ts`): dBASE III/IV, FoxPro e Visual
  FoxPro; tipos C, N, F, D, L, M, I, Y, B, T, V; memo .FPT e .DBT; code pages
  850, 437 e 1252, com dedução pelo conteúdo quando o cabeçalho não diz;
  registros apagados ficam fora. Fixtures reais geradas com a biblioteca
  Python `dbf` 0.99.11 (nome com extensão `.DBF`, senão ela quebra; memo nulo
  em dBASE III também quebra a biblioteca).
- **Restauração em duas partes** (`services/iobSage/restauracao.ts`): vários
  arquivos de uma vez, cada um reconhecido pela ASSINATURA (zip com extensão
  .SBAK/.SBKP também abre); o conteúdo do .zip é listado inteiro; DBF casa com
  o memo da mesma pasta; tabelas DBF e PostgreSQL na mesma lista.

## Cadastros (menu Arquivos do IOB Office)

- **04/10/2026, Paulo: *"pode mergear o pr #41 e comecar pelos cadastros"*.**
  Isso veio depois de ele notar que *"nao foram construidos os modulos como os existentes na iob"*.
  Nova aba **Cadastros** com dados no Firestore e auditoria
  (`services/cadastros/`, `components/cadastros/`):
  - **Funcionários:** ficha por empresa com as abas do Office (Dados, Ident.
    Adm., Documentos, Outros, Dependentes e Histórico).
    - A chave é empresa + CPF + matrícula do eSocial. O código sequencial do
      IOB fica num campo próprio, porque é ele que o TXT de ponto usa.
    - A carga vem do XML do eSocial, pela mesma consolidação da implantação,
      com prévia antes de gravar.
    - Campo editado à mão vira origem "Manual" e uma reimportação não o
      sobrescreve: a divergência aparece na prévia. Campo que veio do eSocial e
      sumiu do XML é removido. Código IOB, banco e observações nunca são
      tocados pela importação.
    - Exporta Excel.
  - **Sindicatos:** id = CNPJ, com data-base, piso, registro e vigência da
    convenção (alerta a 30 dias do fim) e contribuição.
  - **Tabelas legais:** INSS, IRRF, salário mínimo e salário-família por
    vigência (AAAA-MM).
    - **Nenhum valor vem pronto.** Sem norma não grava.
    - Qualquer aprovado inclui; corrigir ou excluir é só do admin (regra no
      Firestore).
    - Tabela que vale = a de maior vigência até a competência. Duas com a mesma
      vigência é erro.
    - O INSS mostra a contribuição no teto, para conferir com a portaria.
    - O redutor mensal do IRRF e as demais regras de cálculo entram com o motor
      (Fase 3).
  - **Eventos:** o atalho leva ao Catálogo de Eventos que já existe na Folha.
    Incidências ficam para a próxima entrega.
- **Coleções novas:** `cadastro_funcionarios`, `cadastro_sindicatos`,
  `cadastro_tabelas_legais` e `cadastro_audit` (esta só aceita inclusão).
  - As regras estão em `firestore.rules`. Foram testadas no emulador do
    Firestore (firebase-tools 14 + @firebase/rules-unit-testing) e cobrem
    colaborador, pendente, admin, id do documento, autor e auditoria imutável.
  - **O deploy das regras é manual:** `firebase deploy --only firestore:rules
    --project consultor-dp-folha`. Sem ele, a tela mostra "Sem permissão" com
    o comando.
- **Faltam:**
  - abas Complementos, Lanç. Automático e Holerite (aguardam os prints do
    Office);
  - Horários e Afastamentos;
  - incidências dos eventos;
  - carga a partir do backup restaurado (de/para das tabelas do SAGE).
- **Pendente de teste real:** o XML do André na pasta de testes é uma
  retificação (indRetif 2) sem recibo nem original, e a importação a recusa,
  como a implantação. Para importar, é preciso o XML com o recibo
  (retornoEventoCompleto) ou o S-2200 original.
- **04/10/2026, Paulo: *"regras publicadas, pode seguir com horarios e afastamentos"*.**
  As regras dos cadastros foram publicadas pelo Paulo.
  - **Horários** (`services/cadastros/horarios.ts`): cada empresa tem seus
    horários, com id = empresa_código.
    - Para cada dia da semana: tipo (trabalho, folga/compensado ou DSR),
      entrada, intervalo e saída. Uma saída antes da entrada conta como o dia
      seguinte.
    - Calcula o total semanal e as horas noturnas (22h–5h, também na hora
      reduzida de 52min30s), e gera a descrição da jornada no formato do
      `dscJorn` do S-2200.
    - Limites da CLT (arts. 58/59, 66, 67, 71 e CF 7º XIII) aparecem como
      AVISO, não bloqueiam, porque há exceções legais como 12x36,
      compensação e norma coletiva.
    - A ficha (Ident. Adm.) tem o campo Horário e confere as horas semanais
      do S-2200 com o total do horário.
  - **Afastamentos** (`services/cadastros/afastamentos.ts`): o S-2230, com
    id = empresa_cpf_matrícula_início.
    - A importação lê o XML com o recibo (201).
    - Junta início e término que vêm em eventos separados.
    - Retificação substitui o original pelo recibo, e um S-3000 com tpEvento
      S-2230 exclui o evento.
    - Vínculo sem ficha vira aviso.
    - Lançamento manual valida datas, admissão e desligamento, sobreposição, e
      os campos que só valem para os motivos 01/03 (mesmo motivo,
      acidente de trânsito) ou 15 (período aquisitivo).
    - Afastamento manual não é trocado por uma reimportação.
    - Mostra os dias por competência e o 16º dia para o INSS em
      doença/acidente sem "mesmo motivo" (Lei 8.213, art. 60). A lista de
      funcionários mostra "Afastado desde".
  - **Tabela 18:** só tem rótulo o que foi conferido em busca pública
    (01, 03, 06, 07, 11, 14–21, 24, 25, 29, 30, 33, 35 e os 43–45 da
    NT 04/2025, com a nova descrição do 21). Qualquer outro código de 2
    dígitos é aceito como "conferir na Tabela 18".
    - O portal gov.br e os PDFs da tabela estão bloqueados neste ambiente;
      falta conferir a tabela inteira na fonte oficial.
  - **Regras novas:** `cadastro_horarios` e `cadastro_afastamentos`, testadas
    no emulador. **Precisam de novo deploy das regras.**
  - **Faltam:** escalas e revezamento (12x36 como escala, não só como aviso),
    transmissão do S-2230 e férias com cálculo (Fase 3).
