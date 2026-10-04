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

## Incidências dos eventos (S-1010)

- **04/10/2026, Paulo: *"podem seguir com a incidencia de eventos"*.**
  As regras de horários e afastamentos foram publicadas.
  - **O que já existia:** o catálogo de eventos (vindo do PDF do IOB) já trazia
    as marcas de incidência do IOB (IN, INF, IR, IRF, FG, RT, VR).
  - **O que faltava:** o lado eSocial, isto é, a rubrica do S-1010 com tpRubr,
    natRubr, codIncCP, codIncIRRF e codIncFGTS. É ela que monta as bases dos
    totalizadores S-5001 e S-5003.
- **Cadastros › Incidências** (`services/cadastros/rubricas.ts`):
  - Importa o S-1010 com recibo (201). Inclusão, alteração (inclusive
    novaValidade) e exclusão são aplicadas na ordem de dhProcessamento.
  - Guarda as vigências e escolhe a vigente na competência.
  - Liga cada rubrica ao evento do IOB pelo código (4 dígitos) ou por vínculo
    manual. O vínculo manual sobrevive à reimportação.
  - Confere tipo, INSS, FGTS e IRRF e exporta Excel.
- **Regras da conferência:**
  - V ↔ tpRubr 1; D ↔ tpRubr 2 ou 4.
  - IN ou INF ↔ codIncCP de base (11–16, 21, 22).
  - FG ↔ codIncFGTS 11, 12 ou 21.
  - IR ou IRF ↔ Tabela 21 nas faixas 11–15, 4x ou 51–55.
  - Ficam para conferir: suspensão judicial (9x/9xxx), salário-maternidade
    pago pelo INSS (CP 25/26) e código IRRF fora dessas faixas.
  - A natureza 9253 exige desconto e FGTS 31 (validação do XSD).
- **Fontes dos códigos:**
  - codIncCP e codIncFGTS: enumerações do XSD oficial do S-1010 (S-1.3).
  - Tabela 21: só 11, 12, 13, 14, 31, 41 e 51 foram conferidos em busca
    pública e têm rótulo; os demais aparecem como "conferir na Tabela 21".
- **Regra nova:** `cadastro_rubricas`, testada no emulador. Precisa de novo
  deploy das regras.

## Banco de dados: PostgreSQL 12 do SAGE × Firebase (pergunta do Paulo, 04/10/2026)

- **Recomendação:** manter o Firebase como banco do Consultor DP, a mesma
  decisão de 03/10/2026, e tratar o PostgreSQL 12 do SAGE como FONTE de
  dados, não como banco a copiar.
  - Migra-se dado (cadastros, rubricas, saldos de que a operação precisa),
    remodelado em documentos.
  - O histórico antigo fica consultável no backup restaurado ou no BigQuery.
- **Riscos do Firestore para a folha:** não tem JOIN, a leitura é cobrada
  por documento, os lotes têm limite de escritas e relatórios que varrem anos
  (ficha financeira, resumo) ficam caros e lentos.
- **Mitigação:** um documento por funcionário × competência com os
  lançamentos e os totais gravados junto; relatórios pesados pela extensão
  oficial Firestore → BigQuery.
- **Plano B, sem sair do Firebase:** Firebase Data Connect (PostgreSQL
  gerenciado) só para a parte de cálculo, se um teste de carga na Fase 3
  mostrar que o Firestore não dá conta. O PostgreSQL 12 está sem suporte da
  comunidade desde nov/2024, então não faz sentido adotá-lo como base própria.

## Painel de prazos do DP (Fase 1, item 3)

- **04/10/2026, Paulo: *"pode seguir com a proxima etapa"*.**
  - O download de eventos do eSocial depende do webservice com certificado,
    ou seja, do servidor ou do túnel do CFI.
  - O inventário e o de/para da Fase 2 dependem do backup real.
  - Por isso a próxima entrega possível agora foi o painel de prazos.
- **Nova aba Prazos** (`services/prazos/`, `components/prazos/PrazosPanel.tsx`).
- **Vencimentos mensais com ajuste de dia útil** (regras conferidas em
  04/10/2026):
  - S-1299 e DCTFWeb no dia 15, e dia não útil ADIA para o dia útil
    seguinte (IN RFB 2.162/2023; Manual do eSocial S-1.3);
  - DARF da DCTFWeb e FGTS Digital no dia 20, e dia não útil ANTECIPA;
  - salário no 5º dia útil, com o sábado contando como dia útil;
  - 13º: 30/11 e 20/12; S-1299 anual e DARF do 13º em 20/12.
- **Feriados considerados:** nacionais (incluindo o 20/11 desde 2024),
  Carnaval e Sexta-feira Santa. Estaduais e municipais não entram, e a tela
  avisa.
- **Prazos que saem dos cadastros, de todas as empresas:**
  - fim de contrato por prazo determinado (experiência quando tem até 90
    dias);
  - férias, com o último dia para começar o gozo (fim do concessivo − 29) e
    "vencidas = dobra". O gozo vem dos afastamentos com motivo 15, com ou sem
    período aquisitivo; não considera os arts. 130 e 133;
  - retorno de afastamento e 16º dia para o INSS em doença/acidente;
  - convenção coletiva a vencer e data-base.
  - Exporta Excel. ASO fica fora (SST é da medicina do trabalho).
- **Correção:** o calendário que já existia na aba eSocial mostrava o dia 15
  ou 20 no mês da competência e não ajustava dia útil. Agora usa as mesmas
  regras, e "atrasada" virou "prazo passou (conferir entrega)", porque a
  entrega não é verificada ali.

## Download de eventos do eSocial (Fase 1, item 2)

- **04/10/2026, Paulo: *"pode seguir com download dos eventos do esocial"*.**
  - **CFI, PR #1370:** rotas do túnel
    `/api/dp-integration/esocial/download/{identificadores,eventos}`. O CFI
    assina o pedido e abre o mTLS com o A1 do cofre (por padrão o do
    escritório, como procurador).
  - **DP:** aba eSocial › Download (`components/esocial/ESocialDownload.tsx`,
    `services/esocial/downloadEventos.ts`).
- **Na tela:**
  - **Consulta por trabalhador:** CPF e período, com sugestão dos CPFs da
    empresa e da admissão como início. Tem "consultar os próximos" a partir
    do `dhUltimoEvtRetornado`.
  - **Consulta por competência:** tpEvt + perApur, sem continuação; acima de 50
    eventos, consultar por trabalhador.
  - **Consulta de tabelas:** S-1010 e outras.
  - Baixa até 50 eventos por vez e acumula na sessão.
  - **Salvar .zip:** cada evento é remontado no formato do portal
    (retornoEventoCompleto: evento + recibo), e o zip entra direto em
    Cadastros (Funcionários, Afastamentos, Incidências) e na Conferência
    pós-folha. Os testes provam a leitura pelas quatro importações.
  - Os XMLs não são gravados no app.
  - A tela mostra quantos pedidos foram feitos hoje para a empresa, porque o
    eSocial limita por dia. O limite exato não foi confirmado em fonte
    oficial: as fontes falam em cerca de 10 a 12 por dia e 50 por resposta.
- **Pendente de teste real:** depende do deploy do CFI depois do merge do
  #1370 e de o A1 do escritório estar no cofre. O primeiro uso vai mostrar se
  a procuração cobre o download; se não cobrir, usar a opção "da própria
  empresa".
- **Ajuste de teste:** o teste do editor de layout do Cadastro IOB levava
  ~4,3 s, contra o limite padrão de 5 s, e estourava com a suíte cheia. O
  limite dele subiu para 15 s.

## IRRF na conferência pós-folha e telas do IOB Office (04/10/2026)

- **Paulo: *"pode seguir para proxima etapa"*.**
  - A Fase 2 ainda depende do backup real. O próximo item possível era fechar
    a conferência com o IRRF.
  - **Leitor:** S-5002 (evtIrrfBenef) e S-5012 (evtIrrf), conforme o XSD S-1.3.
    - No S-5002, `dmDev` e `totInfoIR` ficam dentro de `ideTrabalhador`. A
      leitura usa `totInfoIR/consolidApurMen` e, sem ele, soma
      `dmDev/totApurMen` por CRMen.
    - No S-5012, a leitura usa `infoIRRF/infoCRMen`.
  - **Regra 8 da conferência:**
    - soma dos S-5002 × S-5012 por código de receita;
    - S-5012 × débitos de IRRF da DCTFWeb (SERPRO) do mesmo mês;
    - duplicado fica fora;
    - lote só de IRRF não cobra S-5011 nem S-5013.
  - **Regime de caixa:** o IRRF segue o mês do PAGAMENTO (S-1210), por isso
    não é cruzado com o S-5001 nem com o relatório da folha.
  - Os códigos CRMen (056107 etc.) vêm do XSD.
  - O cálculo do imposto em si (tabela, dependentes, redutor) fica para o
    motor (Fase 3).
- **Prints do IOB Office enviados pelo Paulo:**
  - **Primeiro nível confirmado:** Arquivos, Processos, Relatórios,
    Listagens, Impressos, Diversos, Contratos, Utilitários, eSocial, Saúde e
    Segurança do Trabalho e Ajuda.
  - **Versão do banco: 12.22**, a mesma dos testes da restauração; servidor
    10.0.0.10.
  - Release R2026.08.20.
  - **Alertas na abertura:** "Auto Backup/Backup Online: Ocorreram problemas
    com o Backup" e empresas com pendências de eventos.
  - Mapa e catálogo atualizados. Faltam os submenus: prints com cada menu
    aberto.

## Fase 2: completar o cadastro pelo backup do IOB (04/10/2026)

- **Paulo: *"pode seguir, me dê o status de como e aonde estamos"*.**
  - Primeiro passo da Fase 2 que não precisa esperar o backup real: a carga
    pelo backup restaurado no navegador.
- **Onde fica:** Cadastros › Funcionários › "Completar pelo backup do IOB".
  - Aceita o Backup SQL do Office: o .zip com DBF e/ou o .backup do
    PostgreSQL. Usa a mesma leitura da restauração; nada sai do computador
    antes de gravar.
- **De/para assistido:** o dicionário do IOB Office ainda não é conhecido.
  - O app escolhe a tabela com mais colunas reconhecidas.
  - Propõe a coluna de cada campo pelo nome (CPF, PIS, DTADMISSAO, CODIGO,
    MATRICULA, SALARIO, BANCO etc.), e a equipe confere campo a campo.
  - Se a tabela tiver várias empresas, filtra por coluna e código. O
    código SAGE vem como sugestão; zeros à esquerda não contam.
- **Regras da carga** (`services/cadastros/cargaBackupIob.ts`):
  - **Ligação:** pelo CPF; sem CPF, pela matrícula do eSocial. Matrícula
    que pertence a outro CPF não liga e fica listada.
  - **Campo vazio** é preenchido, com origem "IOB: tabela".
  - **Campo com valor diferente** vira divergência listada; o valor do
    Consultor fica.
  - **Ficha nova:** só com a opção marcada, CPF válido e matrícula do
    eSocial. O resto vai para "sem ficha", com o motivo.
  - **Normalização:** datas em dd/mm/aaaa, aaaammdd ou ISO; CPF que perdeu
    o zero à esquerda; salário com vírgula.
  - **Gravação:** a mesma da importação do eSocial (ficha + auditoria em
    lote), com origem "Backup IOB: arquivos".
- **Falta, quando o backup real chegar:**
  - confirmar a tabela e as colunas do IOB Office e fixar o de/para;
  - trazer dependentes, sindicatos, horários e eventos pelo mesmo caminho.

## Fase 3: motor do cálculo mensal, em prévia (04/10/2026)

- **Paulo: *"pode seguir com a próxima etapa"*.**
  - A Fase 2 espera o backup real. Por isso começou a Fase 3 pelo cálculo
    mensal, usando as tabelas legais já cadastradas.
- **Motor** (`services/calculo/motorMensal.ts`): é puro, sem Firebase, e
  devolve cada verba com a memória de cálculo.
  - **Salário:** mensal, por hora (horas semanais × 5) ou por dia/quinzena.
  - **Mês comercial:**
    - mês inteiro sem afastamento vale 30 dias;
    - com afastamento, pagam-se os dias trabalhados, até 30;
    - em fevereiro, 30 menos os dias afastados;
    - na admissão ou no desligamento, os dias do vínculo, com aviso para
      conferir a regra com o IOB.
  - **Afastamentos:**
    - doença ou acidente: a empresa paga 15 dias e o INSS paga a partir do
      16º. Se for o mesmo motivo de um afastamento anterior (infoMesmoMtv),
      não há dias pagos pela empresa;
    - acidente do trabalho mantém o FGTS sobre os dias pagos pelo INSS
      (Lei 8.036, art. 15, § 5º);
    - licença-maternidade entra como salário-maternidade;
    - férias deixam o cálculo "incompleto";
    - licença remunerada (16) é paga; os outros motivos não são pagos, e os
      motivos 14, 24 e 25 geram aviso.
  - **Movimento:**
    - horas extras 50% e 100%, com DSR (dias úteis de segunda a sábado;
      descanso = domingos e feriados nacionais por lei, mais os feriados
      locais informados);
    - faltas e DSR descontado;
    - pensão alimentícia de valor fixo;
    - lançamentos avulsos, com incidências marcadas.
  - **INSS:** progressivo pela tabela da competência, limitado ao teto.
  - **Salário-família:**
    - devido até o mês em que o filho completa 14 anos, com remuneração até
      o limite;
    - proporcional na admissão e no desligamento.
  - **IRRF:**
    - tabela do **mês do pagamento** (regime de caixa); o padrão é o mês
      seguinte à competência;
    - usa o maior entre as deduções legais (INSS + dependentes + pensão) e
      o desconto simplificado;
    - aplica o **redutor da Lei 15.270/2025** sobre os rendimentos
      tributáveis: redução total até o primeiro limite e parcial (parcela
      fixa − coeficiente × rendimentos) até o segundo;
    - imposto de até R$ 10,00 não é retido (Lei 9.430/1996, art. 67).
  - **FGTS:** 8%; aprendiz (categoria 103) 2%.
  - **Fora desta versão:** férias, 13º, rescisão, adicionais (noturno,
    insalubridade, periculosidade), médias e categorias que não são de
    empregado.
- **Tabelas legais:** a tabela do IRRF ganhou os cinco campos do redutor.
  - São opcionais e vão completos ou ficam em branco.
  - O coeficiente é guardado em milionésimos (0,133145 → 133145).
- **Aba nova "Cálculo":**
  - escolha da empresa, da competência e do mês do pagamento;
  - lista com proventos, INSS, IRRF, salário-família, líquido e FGTS;
  - holerite com a memória de cálculo;
  - movimento digitado na tela, que **não é gravado**;
  - Excel com as abas Resumo, Verbas e Memória.
- **Próximos passos:**
  - conferir contra holerites reais do IOB (uma empresa, um mês);
  - gravar o movimento;
  - ligar as verbas aos eventos do IOB e às rubricas (Incidências);
  - férias e 13º.
