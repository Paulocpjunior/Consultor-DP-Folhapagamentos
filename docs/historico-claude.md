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

## Cálculo: gravação do movimento do mês (04/10/2026)

- **Paulo: *"pode seguir com a gravação do movimento, e qual motor iremos
  usar?"*.**
- **Coleção nova:** `calculo_movimentos/{idDaFicha}_{AAAA-MM}`, com
  `empresaId`, `fichaId`, `competencia`, `movimento` e o autor.
  - **Regras:**
    - autor = usuário logado;
    - competência no formato AAAA-MM;
    - id = ficha + competência, e a ficha começa pelo id da empresa;
    - exclusão só pelo admin.
  - Testadas no emulador (9 testes, scratchpad `/regras`).
  - **Precisa publicar:** `firebase deploy --only firestore:rules --project
    consultor-dp-folha`.
- **Gravação:** em lote, junto com o registro em `cadastro_audit` ("lançar
  movimento" / "editar movimento"), com a diferença campo a campo.
  - Antes de gravar, o movimento é limpo: sem zeros, sem lançamentos em
    branco, valores arredondados.
- **Validação:**
  - horas extras até 300 por mês;
  - faltas, DSR e feriados até o número de dias do mês;
  - nenhum valor negativo;
  - lançamento com descrição e valor maior que zero.
- **Tela (aba Cálculo):**
  - carrega o movimento gravado da empresa e da competência;
  - marca "(não salvo)" no que mudou; o botão "Salvar movimento (n)" grava
    só o que mudou;
  - o holerite mostra quem salvou e quando;
  - pergunta antes de trocar de empresa ou competência e avisa ao fechar a
    página com algo não salvo.
- **Pergunta "qual motor":** o próprio motor do Consultor
  (`services/calculo`), em TypeScript, puro e testado, com memória de
  cálculo.
  - Hoje roda no navegador, como prévia.
  - Quando o cálculo virar oficial (fechamento da folha), o MESMO código
    roda no servidor (Cloud Functions ou no Cloud Run do CFI) e grava o
    resultado com a versão do motor. O resultado oficial fica fora do
    alcance do navegador.
  - Não há motor de terceiros: o IOB continua sendo a referência até a
    conferência com os holerites reais.

## Cálculo: conferência com os holerites do IOB pelo Gemini (04/10/2026)

- **Paulo:** *"o motor que digo é o de cálculo, nos outros apps usamos
  gemini 3.8"* e *"pode seguir com a conferência dos holerites pelo Gemini"*.
- **Decisão:** as contas da folha ficam no motor próprio, em código, que dá
  sempre o mesmo resultado e é auditável. O Gemini 3.8 fica em volta dele:
  aqui, só para TRANSCREVER o holerite em PDF.
- **CFI** (branch `claude/dp-holerites-gemini`): rota
  `POST /api/dp-integration/holerites/extrair`, no túnel do DP.
  - **Antes de chamar a IA:** confere o PDF (assinatura `%PDF-`, até 14 MB).
  - **Chamada:** Gemini Flash da família resolvida no CFI (3.8), com
    `responseSchema`, temperatura 0 e prompt de transcrição ("não calcule
    nada").
  - **Retorno:** holerites em centavos, com aviso quando a soma das verbas,
    os totais e o líquido não fecham.
  - **LGPD:** nada é gravado e o log não leva nomes nem valores.
  - A rota está declarada em `rotaTemChamada` como túnel do DP.
- **DP** (`services/calculo/conferenciaHolerites.ts`, sem IA):
  - **Classificação das verbas pela descrição:** salário, maternidade,
    horas extras 50%/100%, DSR sobre horas extras, faltas, DSR descontado,
    salário-família, pensão, INSS, IRRF e outros.
  - **Ligação holerite → ficha:** pelo CPF; senão pelo código do IOB (sem
    zeros à esquerda); senão pelo nome, com aviso.
  - **Comparação item a item, com tolerância de R$ 0,01:** cada classe,
    totais, líquido, base do INSS, base do FGTS e FGTS do mês. Verbas do
    IOB sem correspondente no motor deixam o resultado como "diverge".
  - **Movimento sugerido pelo holerite:**
    - horas e faltas pela referência ("10,50" ou "10:30");
    - pensão pelo valor;
    - as outras verbas viram lançamentos avulsos (provento incidindo em
      tudo, desconto em nada, com aviso para conferir).
- **Tela (aba Cálculo › "Conferir com holerites do IOB"):**
  - escolha de um ou mais PDFs e leitura pelo Gemini;
  - resumo: conferem, divergem, sem ficha, sem holerite;
  - por funcionário: as diferenças e o detalhe motor × IOB;
  - botão **"Aplicar movimento do holerite"**, que entra como "não salvo";
  - aba "Conferência IOB" no Excel;
  - cada leitura deixa registro em `cadastro_audit` (`holerites_iob`, com
    quem, quantos, arquivos e modelo).
- **Depende do deploy do CFI** com a rota nova. Não há regra nova do
  Firestore.
- **Revisão do PR #52 (Codex), corrigida antes do merge:**
  - **P1:** um holerite de outra competência não é comparado (situação
    "outra competência") nem vira movimento. Competência não lida gera aviso.
  - **P1:** um holerite sem nenhum valor lido fica como "ilegível", nunca
    como "confere". "Confere" exige pelo menos um item comparado.
  - **P1:** um holerite ligado a uma ficha sem cálculo na competência mantém
    o `fichaId` e não oferece "Aplicar movimento" (`podeAplicar`). A
    gravação ignora movimento sem ficha.
  - **P2:** DSR pago só conta como reflexo das horas extras quando diz isso
    ou vem sem qualificação. "DSR s/ comissões" e "DSR s/ adicional noturno"
    ficam em "outros" e viram lançamento avulso.

## Cálculo: 13º salário em prévia (04/10/2026)

- **Paulo: *"pode seguir próxima etapa"*.** Veio o 13º, pela urgência: a 1ª
  parcela vence em 30/11 e a 2ª em 20/12.
- **Motor** (`services/calculo/motor13.ts`; base legal: Lei 4.090/1962 e Lei
  4.749/1965):
  - **Avos, mês a mês** (mês com 15 dias ou mais trabalhados conta):
    - saem os dias pagos pelo INSS (doença ou acidente do 16º dia em diante;
      com infoMesmoMtv, desde o início), as suspensões e licenças não
      remuneradas e as faltas do movimento do mês;
    - contam férias, licença remunerada e licença-maternidade;
    - na 1ª parcela, os meses depois do pagamento são projetados como
      trabalhados.
  - **Média de horas extras:**
    - horas dos movimentos gravados nos meses antes do pagamento (1ª:
      janeiro a outubro; 2ª: janeiro a novembro);
    - valor da hora atual × adicional, mais o DSR de cada mês;
    - dividida pelos meses com vínculo no período.
  - **1ª parcela:** metade; sem INSS e sem IRRF; FGTS no mês do pagamento.
  - **2ª parcela:**
    - 13º integral menos o adiantamento. O adiantamento é o valor da 1ª
      calculada para novembro, ou o valor informado na tela (por exemplo,
      quando foi pago nas férias);
    - INSS do 13º em separado, pela tabela de dezembro;
    - IRRF exclusivo na fonte sobre o 13º integral, com dependentes, pela
      tabela do mês do pagamento;
    - FGTS sobre o integral menos a 1ª parcela.
  - **IRRF do 13º:** o redutor de 2026 (padrão: ligado) e o desconto
    simplificado (padrão: desligado) são OPÇÕES da tela, com aviso. A regra
    precisa ser confirmada na norma e na conferência com o IOB.
  - **Fora desta versão:** o 13º na rescisão (desligados no ano dão erro
    explicando), a provisão e médias de comissões e adicionais.
- **Movimentos do ano:** `listarMovimentosDoAno` filtra o ano no app (consulta
  só por `empresaId`, sem índice composto).
- **Tela (aba Cálculo):**
  - seletor "Folha": Mensal, 13º — 1ª parcela, 13º — 2ª parcela;
  - campo do ano; o pagamento padrão é 11 ou 12;
  - opções do IRRF do 13º;
  - "1ª parcela paga" por funcionário (não é gravada);
  - Excel `calculo-<código>-<ano>-13-<parcela>.xlsx`.
  - No 13º, não aparecem "Salvar movimento" nem a conferência com os
    holerites: as verbas de 13º ainda não estão na classificação.
- **Revisão do PR #53 (Codex), corrigida antes do merge:**
  - **P1:** o divisor da média de horas extras usa só os meses que dão avo
    (15 dias ou mais), não qualquer mês com algum dia.
  - **P1:** na 1ª parcela, quem foi admitido depois do mês do pagamento fica
    fora (`com13` com `admitidosAte`; o motor dá erro explicando). Quem foi
    admitido no ano recebe metade dos avos já cumpridos até o mês do
    pagamento (Decreto 10.854/2021, arts. 76 a 78). Quem tem o ano inteiro
    continua com os avos projetados (metade da remuneração).
  - **Na 2ª parcela:** sem 1ª parcela em novembro (por exemplo, admitido em
    dezembro), o adiantamento é zero.
  - **P2:** a resposta antiga dos movimentos do ano (troca rápida de empresa
    ou ano) é descartada e não sobrescreve a atual.

## Cálculo: férias em prévia (04/10/2026)

- **Paulo: *"pode seguir com férias"*.**
- **Motor** (`services/calculo/motorFerias.ts`): calcula o recibo de cada gozo
  lançado em Cadastros › Afastamentos com o **motivo 15** (gozo de férias,
  como no S-2230). Assim, a programação de férias é o próprio afastamento.
  - **Período aquisitivo:** o informado no afastamento; senão, o mais antigo
    em aberto, pela mesma `periodosFerias` do painel de Prazos (que também
    desconta os gozos anteriores). Concessivo de 12 meses.
  - **Direito pelas faltas do período**, conforme os movimentos gravados
    (art. 130): até 5 → 30 dias; 6 a 14 → 24; 15 a 23 → 18; 24 a 32 → 12;
    mais de 32 → nenhum. O saldo desconta os gozos anteriores do mesmo
    período.
  - **Perda do direito (art. 133):** mais de 180 dias de INSS ou mais de 30
    dias de licença remunerada no período.
  - **Remuneração:** salário atual mais a média das horas extras do período
    aquisitivo (÷ 12, com o DSR de cada mês); diária = remuneração ÷ 30.
  - **Verbas:**
    - férias e 1/3 constitucional;
    - **dobra** dos dias gozados depois do concessivo (art. 137), com o seu
      1/3, sem INSS e FGTS (Lei 8.212, art. 28, § 9º, "d");
    - **abono pecuniário** de até 1/3 dos dias de direito (art. 143), com o
      seu 1/3, sem INSS, FGTS e IRRF.
  - **INSS por competência do gozo**, pela tabela de cada mês. Quando o gozo
    pega dois meses, o motor avisa que a folha ajusta com o salário.
  - **IRRF em separado**, pela tabela do mês do pagamento. Desconto
    simplificado e redutor de 2026 são opções (padrão: os dois ligados), a
    confirmar com o IOB.
  - **FGTS** por competência. **Pagamento até 2 dias antes do início**
    (art. 145).
  - **Fora desta versão:** férias coletivas e antecipadas (antes de 12
    meses), a integração do INSS das férias com a folha do mês (o mensal
    segue "incompleto" com aviso) e o aviso de férias.
- **Movimentos:** `listarMovimentosDaEmpresa` busca todos os movimentos da
  empresa (consulta só pela empresa, sem índice composto);
  `listarMovimentosDoAno` passou a usá-la.
- **Tela (aba Cálculo):** opção "Férias" no seletor de folha.
  - Mostra o mês de início, os gozos daquele mês, as opções do IRRF e o
    recibo com período, direito, saldo, dobra, data-limite e a tabela por
    competência.
  - Os dias de abono são digitados na tela e não são gravados.
  - Excel `calculo-<código>-ferias-AAAA-MM.xlsx`.
- **Revisão do PR #54 (Codex), corrigida antes do merge:**
  - **P1:** depois de uma perda do direito (art. 133), o próximo período
    começa na volta ao trabalho (§ 2º). Novo `periodosAquisitivos` no motor:
    - recalcula os períodos marcando os perdidos;
    - se o funcionário ainda está afastado, não há período seguinte;
    - o período informado no afastamento casa com os novos inícios.
  - **P1:** as faltas e as médias usam todas as competências que o período
    toca. São 13 quando o período começa depois do dia 1º, e o motor avisa
    que o movimento é mensal.
  - **P1:** o abono pecuniário é gravado no afastamento (campo `abonoDias`,
    só no Consultor e fora do S-2230):
    - preenchido em Cadastros › Afastamentos ou pelo botão "Gravar abono no
      afastamento" no recibo;
    - o saldo do período desconta gozos E abonos anteriores;
    - a reimportação do eSocial não apaga o abono;
    - validação de 1 a 10 dias, só no motivo 15.
  - **P2:** um período com direito reduzido pelas faltas e já usado fica
    fechado, e o próximo gozo vai para o período seguinte.

## Cálculo: rescisão em prévia (04/10/2026)

- **Paulo: *"pode seguir com rescisão"*.**
- **Motor** (`services/calculo/motorRescisao.ts`): monta o TRCT sobre os
  outros motores.
  - **Saldo de salário e movimento do mês:** motor mensal com a data do
    desligamento (INSS e IRRF do mês).
  - **Aviso prévio:**
    - **proporcional** (Lei 12.506/2011): 30 dias + 3 por ano completo, até
      90. Indenizado na dispensa sem justa causa (02); pela metade no acordo
      (33, art. 484-A);
    - **trabalhado:** só os dias além de 30 são indenizados;
    - **pedido de demissão sem cumprir o aviso:** desconto de 30 dias
      (art. 487, § 2º);
    - **indenizado:** sem INSS e sem IRRF, com FGTS (Súmula 305 do TST).
      **Projeta** o fim do contrato para 13º e férias (OJ 82 da SDI-1).
  - **13º:**
    - proporcional até a data real, com INSS em separado e IRRF exclusivo;
    - 13º sobre o aviso indenizado (avos da projeção), sem INSS e com aviso
      de que a regra precisa de confirmação;
    - desconto do adiantamento informado;
    - na justa causa, não há 13º.
  - **Férias:**
    - **vencidas**, pelos `periodosAquisitivos` das férias: saldo do período
      (direito − gozos e abonos); em dobro quando o concessivo passou;
    - **proporcionais** em avos (fração de 15 dias), com o direito pelas
      faltas;
    - todas indenizadas: sem INSS, FGTS e IRRF;
    - na justa causa, só as vencidas;
    - **mais de um período vencido, ou com dobra, gera aviso e situação
      "incompleto"**: costuma ser histórico de férias que não foi lançado em
      Afastamentos.
  - **Contrato a termo:** art. 479 (metade dos dias restantes até o
    `fimContrato` da ficha) no término antecipado pelo empregador (03). O
    art. 480 (04) fica como aviso, para lançar como desconto.
  - **FGTS e prazo:**
    - FGTS do mês e rescisório;
    - **multa** de 40% (02 e 03) ou 20% (33) sobre o saldo informado mais o
      FGTS da rescisão, informativa (paga por guia);
    - regra de saque por motivo;
    - **pagamento em até 10 dias** (art. 477, § 6º).
  - **Motivos cobertos (Tabela 19):** 01, 02, 03, 04, 06, 07 e 33.
- **`services/calculo/tributos.ts`:** INSS e IRRF detalhados com memória
  (simplificado, redutor e mínimo de R$ 10), usados pela rescisão.
- **Tela (aba Cálculo):**
  - "Folha › Rescisão" mostra os desligados do mês pela ficha (S-2299)
    mais as **simulações** de funcionários ativos (funcionário, data, tipo,
    aviso);
  - no detalhe: tipo, aviso, data (na simulação), saldo do FGTS e
    adiantamento do 13º; aviso, projeção, prazo, multa e saque;
  - nada é gravado; Excel `calculo-<código>-rescisao-AAAA-MM.xlsx`.
- **Fora desta versão:** TRCT impresso, rescisão complementar,
  indenização adicional (Lei 7.238), estabilidades e categorias que não são
  de empregado.
- **Revisão do PR #55 (Codex), corrigida antes do merge:**
  - **P1:** os desligados do mês não recebem mais "sem justa causa" por
    padrão. O motivo do S-2299 ainda não é importado para a ficha, então o
    tipo é OBRIGATÓRIO: sem ele, a rescisão dá erro pedindo a escolha.
    Importar o `mtvDeslig` e a `dtProjFimAPI` do S-2299 fica como melhoria.
  - **P1:** quando a projeção do aviso entra no ano seguinte, os avos desse
    ano (fração de 15 dias) entram no 13º sobre o aviso.
  - **P2:** o adiantamento do 13º sai da base do FGTS rescisório, porque já
    teve FGTS quando foi pago. Corrige também a multa.
  - **P2:** o mês do pagamento da rescisão pode ser informado (tabela do
    IRRF pelo mês efetivo do pagamento). O padrão é o mês do prazo de 10
    dias, com aviso quando esse mês é diferente do mês do desligamento.
  - **P2:** as opções do IRRF da tela valem só para o 13º da rescisão, e o
    texto agora diz isso. O saldo de salário segue a regra mensal
    (simplificado e redutor, que são regra certa no mensal).

## Motor: motivo do S-2299 e férias na folha do mês (04/10/2026)

- **Paulo: *"pode seguir com a próxima etapa"*.** Duas pontas abertas do
  motor, sem depender de dados reais.
- **Motivo e fim projetado do S-2299 na ficha:**
  - `fichaDoEsocial` lê `infoDeslig/mtvDeslig` e `infoDeslig/dtProjFimAPI`
    do conteúdo do último S-2299 e grava `motivoDesligamento` e
    `dataProjetadaAviso` (campos novos na aba Ident. Adm., com origem
    "eSocial: S-2299").
  - **Na rescisão, o tipo vem do motivo da ficha** quando é um dos cobertos.
    Motivo não coberto dá erro explicando.
  - **A rescisão confere com o eSocial:** avisa se o tipo usado difere do
    motivo do S-2299, ou se o fim projetado calculado difere do
    `dtProjFimAPI`.
- **Férias integradas à folha do mês:**
  - `feriasDaCompetencia` soma, da competência, a parte de cada recibo de
    férias que toca o mês. Se algum recibo dá erro, a folha volta a ficar
    "incompleto" e aponta o recibo.
  - **Na folha mensal:**
    - entra "Férias + 1/3 do mês (pagas no recibo)" (soma no INSS e no
      FGTS, fora do IRRF) e o desconto de igual valor "Férias pagas no
      recibo";
    - o INSS do mês é calculado sobre salário + férias, **menos o INSS já
      retido no recibo**;
    - o mês deixa de ficar "incompleto".
  - **Mês comercial com férias:** o salário passa a ser 30 menos os dias
    fora (com 20 dias de férias num mês de 31, paga 10 de salário, e não
    11). Assim salário e férias fecham 30 dias.
  - A aba Cálculo carrega os movimentos da empresa na folha mensal, para as
    médias dos recibos. A rescisão também soma as férias do mês do
    desligamento.
  - **Conferência dos holerites:** as linhas de férias do holerite mensal
    do IOB são reconhecidas ("Férias + 1/3 do mês" e "Férias pagas no
    recibo"). "INSS s/ férias" continua como INSS e o abono como "outros".
- **Revisão do PR #56 (Codex), corrigida:**
  - **P1:** se a leitura dos movimentos da empresa falhar, a tela mostra o
    erro e fica sem histórico (o mês com férias fica "incompleto"). Antes,
    usava um histórico vazio, com médias e faltas zeradas, e marcava
    "calculado". O mesmo vale para o 13º e as férias.
  - **P2:** depois de salvar um movimento, os movimentos usados pelas
    férias são relidos.
  - **P2:** na folha do mês, o desconto do que o recibo já pagou é o
    **líquido das férias** (férias + 1/3 − INSS − IRRF da competência),
    mais as linhas "INSS das férias (retido no recibo)" e "IRRF das férias
    (retido no recibo)". O IRRF do recibo é rateado pela competência. Na
    conferência dos holerites, INSS e IRRF do motor somam o retido no
    recibo, para bater com "INSS s/ férias" e "IRRF férias" do IOB.

## Fase 5: holerite em PDF e resumo da folha (04/10/2026)

- **Paulo: *"pode seguir com a próxima etapa"*.**
- **`services/relatorios/resumoFolha.ts`** (puro):
  - totais por verba, com o número de funcionários;
  - férias vencidas de vários períodos numa linha;
  - lançamentos avulsos agrupados pela descrição, não pelo código
    posicional LAN1/LAN2;
  - situações (calculado, incompleto, erro); os com erro ficam fora dos
    totais;
  - bases;
  - **quadro para conferir as guias:** INSS dos segurados (inclui o do 13º,
    das férias e o retido no recibo), salário-família (dedução na DCTFWeb),
    salário-maternidade (compensação), IRRF retido (DCTFWeb do mês do
    pagamento) e FGTS.
- **`services/relatorios/holeritePdf.ts`** (jsPDF + autotable, já no
  projeto):
  - holerite com um funcionário por página: cabeçalho da empresa,
    funcionário, verbas, totais alinhados, bases e assinatura;
  - resumo da folha em PDF;
  - **marca d'água "PRÉVIA"** semitransparente por cima de tudo, mais o
    aviso em vermelho, até a conferência com o IOB;
  - `textoPdf` limpa caracteres fora da fonte padrão (sinal de menos,
    aspas curvas).
- **Aba Cálculo:**
  - botões "Resumo da folha" (quadro na tela, com "Resumo (PDF)"),
    "Holerites (PDF)" e, no detalhe, "PDF deste holerite";
  - nova aba "Resumo da folha" no Excel;
  - texto por folha explicando o que serve para a DCTFWeb e o FGTS Digital
    (o quadro vale para a guia na folha mensal; 13º, férias e rescisão
    mostram só o seu valor).
  - **Fica de fora a parte patronal** (20%, RAT, terceiros), que depende do
    enquadramento. O total segue conferido pelo S-5011 na Conferência
    pós-folha.
- **Catálogo IOB:** "Folha Mensal / Resumo da Folha" e "Holerite" passam a
  "parcial", com link para a aba Cálculo.
- **Revisão do PR #57 (Codex), corrigida:**
  - **P1:** a multa rescisória do FGTS entra no quadro das guias como linha
    própria (também é recolhida pelo FGTS Digital), na tela, no PDF e no
    Excel.
  - **P2:** "funcionários" conta pessoas distintas. Quando há mais de um
    cálculo por pessoa (dois recibos de férias no mês), mostra também o
    número de cálculos.
  - **P2:** as linhas do resumo na tela usam código + descrição como chave
    (os lançamentos avulsos têm o mesmo código "LAN").
  - **P2:** no holerite em PDF, se bases, declaração e assinatura não
    couberem no fim da página, vão para a página seguinte.

## Parte patronal: enquadramento da empresa e total da DCTFWeb (04/10/2026)

- **Paulo: *"pode seguir com próxima etapa e me atualize sobre nosso status"*.**
- **`services/cadastros/enquadramento.ts`** (puro):
  - por empresa e vigência: regime, FPAS, código de terceiros, patronal
    (%), RAT (1, 2 ou 3), FAP (0,5000 a 2,0000) e terceiros (%);
  - **regimes:**
    - normal: 20% + RAT × FAP + terceiros;
    - Simples Nacional, Anexo IV: 20% + RAT × FAP, sem terceiros (LC 123,
      art. 13, § 3º);
    - Simples Nacional, demais anexos: patronal no DAS, nada na folha;
  - **base patronal** = remuneração (base do INSS sem teto) − salário-
    maternidade (STF, Tema 72);
  - a vigente na competência é a de maior vigência até ela;
  - CPRB (desoneração) ainda não é calculada.
- **Coleção `cadastro_enquadramentos/{empresa_AAAA-MM}`**, com auditoria:
  - regra com autor, vigência AAAA-MM, regime entre os três e id = empresa
    + vigência; exclusão só pelo admin;
  - testada no emulador (10 testes). **Precisa publicar as regras.**
- **Cadastros › Enquadramento:** lista por vigência, com o total em % sobre a
  folha; formulário que mostra só os campos do regime.
- **Resumo da folha:**
  - com enquadramento vigente, mostra contribuição patronal, RAT ajustado,
    terceiros e o **total previdenciário da DCTFWeb** (segurados + patronal
    + RAT + terceiros − salário-família − salário-maternidade), na tela, no
    PDF e no Excel;
  - competência da parte patronal: a do mês na folha mensal e na rescisão,
    dezembro no 13º; nos recibos de férias não há (entra na folha do mês).
- **Catálogo IOB:** "Empresas › Parâmetros" aponta para Cadastros ›
  Enquadramento.
- **Revisão do PR #58 (Codex), corrigida:**
  - **P1:** a vigência de um enquadramento não muda na edição: o campo fica
    travado e o serviço recusa. Outra vigência é outro enquadramento (o id
    é empresa + vigência). O antigo continua valendo até o admin excluir.
  - **P2:** falha ao ler os enquadramentos não parece mais "empresa sem
    enquadramento". O erro aparece no resumo (alerta vermelho: "não use
    para a DCTFWeb"), no texto do PDF e numa linha do Excel.

## Restauração: zip de mais de 1 GB sem carregar na memória (04/10/2026)

- **Motivo:** o backup de cadastros do IOB SAGE do Paulo tem mais de 1 GB
  zipado, e a restauração recusava zip acima de 512 MB, porque lia o
  arquivo inteiro na memória do navegador. A ideia é que a primeira
  restauração funcione de primeira, sem tentativas.
- **`services/implantacao/zip.ts`:**
  - `indiceZip(fonte)` lê só o diretório central, pelo fim do arquivo
    (inclusive **ZIP64**: arquivos e entradas acima de 4 GB). Nomes em
    UTF-8 quando o zip marca; os outros, pela página do DOS (CP437, ou
    CP850 quando dá mais letras do português — é a do Windows no Brasil),
    ou pelo campo de caminho Unicode (0x7075), quando o CRC confere.
  - `fonteDaEntrada(fonte, entrada)` dá acesso por fatias a cada arquivo de
    dentro do zip:
    - "stored": lido direto do zip;
    - deflate até 32 MB: descomprimido inteiro, com cache LRU de 192 MB
      por zip;
    - deflate maior (ex.: um .backup dentro do zip): por cursor, que só
      guarda a janela pedida. Para a frente, segue o fluxo; para trás,
      recomeça do início. As leituras entram em fila.
  - Entrada protegida por senha ou com método desconhecido: erro claro.
  - `lerZip` passou a usar o mesmo índice (comportamento igual).
- **`restauracao.ts`:**
  - sem o limite de 512 MB;
  - entradas do zip entram como fontes por fatias;
  - entrada protegida por senha ou com método desconhecido aparece na
    lista como "Outro", com o motivo, sem derrubar o resto.
- **Restaurar backup:** o texto da tela avisa que zip de mais de 1 GB abre
  direto. Continua tudo no computador do usuário: nada é enviado nem
  gravado.
- **Testes** (`zipGrande.test.ts`): zips "virtuais", em que os zeros não
  ocupam memória, provam que nenhuma leitura passa de ~1 MB:
  - zip de 1,2 GB com DBF + memo deflate: lista, casa o memo e lê a tabela;
  - ZIP64 com entrada de 5 GB;
  - entrada deflate de 34 MB lida por cursor (frente, trás, concorrência);
  - senha e zip inválido.
  Conferido também, fora da suíte, com zips do Info-ZIP (ZIP64 forçado e
  descritor de dados).
- **Revisão do PR #59 (Codex), corrigida:**
  - **P2:** nome sem o bit 11 era lido como Windows-1252 ("latin1" no
    navegador): `0x80` virava `€` em vez de `Ç`. Agora usa a CP437 (ou a
    CP850, ver acima) da tabela do leitor DBF e o caminho Unicode; com
    teste.

## Etapa 1 dos ajustes do Paulo: nível GESTOR + Storage fechado (04/10/2026)

Pedido: ativar empresa e período antes de tudo; carteira por colaborador
(como no CFI); calendário de obrigações da folha; nível GESTORES acima dos
admins; cofre de certificados único do SaaS. Decisões do Paulo: carteira
própria do DP (mesmo modal do CFI); **admin só vê a própria carteira, só o
gestor vê todas**; o .pfx renovado sobe no app Legal, gravando no cofre do
CFI; ordem: gestores → carteira → empresa/período → cofre → calendário.

Achados do levantamento (para as próximas etapas):
- O app Legal **não guarda certificado**: espelha vencimentos do Jotform
  (`legalizacao_vencimentos`) e copia o arquivo para o SharePoint na
  renovação. O cofre de verdade (.pfx e senha cifrados) é o do CFI
  (`empresas_certificados`), no mesmo projeto Firebase do Legal. O CFI já
  tem o túnel `/api/admin/cadastro/certificados` (só metadados, aceita o
  DP).
- No DP, o certificado subia para o Storage do próprio DP com leitura e
  gravação para qualquer logado; as functions ainda procuram a senha em
  texto no Firestore (fica para a etapa do cofre).

Feito nesta etapa:
- **`services/auth/papeis.ts`** (puro, com testes): gestor > admin >
  colaborador > pendente; `ehAdmin`, `ehGestor`, `podeMudarPapel`,
  `papeisPermitidos`. Ninguém muda o próprio papel; gestor muda qualquer
  um; admin só entre pendente e colaborador.
- **Master** `junior@spassessoriacontabil.com.br` (o mesmo do CFI), com
  e-mail verificado, é sempre gestor: nasce gestor e, se já existia como
  admin, vira gestor ao entrar. É quem destrava o primeiro gestor.
- **Brecha fechada:** a regra de `users` aceitava criar o próprio perfil já
  como **admin** (bastava chamar o Firestore direto). Agora nasce pendente;
  gestor só o master. Sai o "primeiro usuário vira admin".
- **Regras:** `isApproved`/`isAdmin` incluem o gestor; `isGestor`. Admin
  só altera papel/aprovação de pendente e colaborador (nem a si mesmo, nem
  outros campos); excluir usuário admin/gestor e **excluir empresa** só o
  gestor.
- **Storage:** `certificados/**` só admin/gestor; o resto fechado. A tela
  de certificado esconde enviar/substituir/remover de quem não pode.
- **Usuários:** botões conforme o que o papel permite (aprovar, tornar
  admin/gestor, rebaixar, suspender), papel em destaque e erro claro de
  permissão. As checagens `role === 'admin'` espalhadas viraram `ehAdmin`
  (o papel inexistente "owner" do Ponto saiu).
- **Emulador:** 8 testes novos (perfil, master, admin × gestor, empresa,
  Storage) + os 10 anteriores: 18 passando. **Precisa publicar as regras
  do Firestore e do Storage.**

## Etapa 2: carteira do colaborador (04/10/2026)

Decisão do Paulo: carteira **própria do DP** (mesmo modal do CFI) e **admin
limitado à carteira**; só o gestor vê todas as empresas.

- **`carteira_acessos/{uid}`** `{ uid, nome, email, empresaIds[], atualizadoPor, atualizadoEm }`,
  gravada em lote com o registro em `cadastro_audit` (incluídas/retiradas).
- **Quem monta** (`services/carteira/carteira.ts`, puro, com testes):
  - gestor: a de qualquer admin ou colaborador, com qualquer empresa;
  - admin: só a de colaboradores, e só incluindo/retirando empresas da
    carteira dele; nunca a própria.
- **Quem vê:** gestor, todas; os demais, a carteira **e as empresas que
  eles mesmos cadastraram**.
- **Regras do Firestore** (`podeEmpresa`): `empresas` (lista inteira só o
  gestor; os outros leem empresa por empresa ou as que criaram; editar:
  gestor, criador ou admin da carteira; excluir: gestor), e todas as
  coleções com `empresaId`: funcionários, horários, afastamentos, rubricas,
  enquadramentos, movimentos do cálculo, eventos, FGTS e teses do eSocial.
  Gravar também exige a empresa na carteira; trocar o `empresaId` de um
  documento para fora dela é recusado.
- **Consultas:** `listarEmpresasVisiveis` substitui `listarTodasEmpresas`
  em todas as telas; as consultas que somavam todas as empresas (prazos,
  eSocial) passaram a `empresaId in carteira` em lotes de 30
  (`consultarPorEmpresas`). Lista paginada de eventos sem empresa, com
  mais de 30 empresas na carteira, pede para escolher a empresa.
- **Tela:** Usuários ganhou a coluna "Carteira" e o modal (busca, só as
  marcadas, marcar/desmarcar a lista, empresas fora da carteira do admin
  travadas, resumo do que muda). A Folha sem empresa explica a carteira.
- **Emulador:** 7 testes novos da carteira + 18 anteriores = 25 passando.
- **Ainda não travado por carteira** (chave é o código/CNPJ do cliente, não
  o id da empresa): `folha_selecoes_eventos`, `folha_mapeamentos`,
  `folha_historico`, `folha_perfis_colunas` e `ponto_layouts`. Entram com a
  etapa 3 (empresa ativa). As Cloud Functions do eSocial também não olham a
  carteira (usam o SDK de admin).
- **Ao publicar as regras:** colaboradores e admins passam a ver só a
  carteira (vazia no início). O gestor monta as carteiras logo em seguida
  em Usuários › Carteira.
- **Revisão do PR #60 (Codex), corrigida aqui:**
  - **P1:** num projeto novo, o master nasce sem e-mail verificado e não
    havia como verificar pelo app, então ninguém virava gestor. Agora a
    tela de espera (e a aba Usuários, para o master que já é admin) envia
    o link de verificação e, em "Já verifiquei", recarrega a conta e o
    token; o perfil é reavaliado e vira gestor.
  - **P2:** o gestor podia rebaixar ou apagar o próprio perfil direto no
    Firestore. Agora o gestor só muda e apaga **outros**; no próprio
    perfil, só o master, e só para virar gestor (nenhum outro campo).
    Emulador: 26 testes.
- **Revisão do PR #61 (Codex), corrigida:**
  - **P1:** a empresa recém-cadastrada sumia das telas até recarregar a
    página (o escopo guardado era o de antes). `criarEmpresa` agora esquece
    o escopo.
  - **P1:** em Eventos do eSocial, com mais de 30 empresas na carteira e
    sem filtro, o erro da lista também impedia de carregar o seletor de
    empresas. Agora as empresas carregam à parte e o erro aparece num aviso.
  - **P2:** "Editar" empresa só aparece para quem as regras deixam editar
    (gestor, admin nas empresas que enxerga, ou quem cadastrou).
  - **P2:** fora do gestor, certificados do Storage de empresas fora da
    carteira apareciam como "sem empresa cadastrada". Agora só aparecem os
    das empresas visíveis, e a lista de órfãos é só do gestor.

## Etapa 3: ativar empresa e período antes de qualquer ação (04/10/2026)

Como no CFI (`services/empresaAtiva.ts` de lá): a empresa ativa é o estado
da SESSÃO, não um filtro de tela.

- **`services/empresaAtiva/empresaAtiva.ts`** (puro, com testes): empresa e
  competência (AAAA-MM) ativas, guardadas no navegador por usuário.
  - **Usuários** e **Empresas** não exigem ativação; todas as outras abas
    exigem (lista explícita e curta: o padrão é exigir);
  - F5 mantém; **sair limpa**; outro usuário na mesma aba começa do zero;
  - a ativação guardada cai se a empresa saiu da carteira.
- **Portão** (`AtivarEmpresaScreen`): logo depois do login, lista só as
  empresas que o usuário enxerga (carteira + cadastradas; gestor, todas),
  com busca e competência (padrão: mês anterior). Carteira vazia explica e
  leva ao cadastro de empresas (ou a Usuários, para admin/gestor).
- **Faixa no topo:** empresa, CNPJ, código SAGE, competência e "⇄ Trocar
  empresa ou período". A troca é uma só no app, pela mesma tela.
- **Trocar de empresa ou de período remonta as telas** (dado de um cliente
  ou de um mês nunca fica na tela de outro).
- **Telas** (contexto `useEmpresaAtiva`; fora do app, nos testes, mantêm o
  seletor próprio):
  - Cálculo e Cadastros: sem seletor de empresa (mostram a ativa); o
    Cálculo abre na competência ativa e o pagamento no mês seguinte;
  - Folha › Apontamento: a sessão só oferece a empresa ativa, na
    competência ativa; "trocar empresa" abre o portão;
  - Prazos: abre na empresa ativa ("Todas da carteira" continua);
  - eSocial (eventos, FGTS/SERPRO, download, calendário) e Ponto: abrem
    na empresa e no período ativos;
  - Conferência pós-folha: avisa quando os totalizadores lidos são de outra
    empresa que não a ativa.
- Fica para depois: travar por carteira nas regras as coleções `folha_*`,
  `folha_perfis_colunas` e `ponto_layouts` (chave por código/CNPJ).

## Etapa 4 (DP): certificados pelo cofre único do SaaS (04/10/2026)

Decisão do Paulo: o .pfx renovado sobe pelo app Legal, gravando no cofre do
CFI. Achado: o app Legal não guardava certificado (só vencimentos do Jotform
e cópia no SharePoint na renovação); o cofre de verdade é o do CFI.

- **CFI (PR #1372):** o túnel `/api/admin/cadastro/certificados` cruza o
  cofre com o acompanhamento do Legal por CNPJ (`legal`, `divergenciaLegal`:
  `renovado-sem-upload` / `legal-desatualizado`). Só metadado.
- **`services/certificados/cofreCertificados.ts`** (puro + túnel, com
  testes): lê o panorama, filtra pela carteira (gestor vê todas), separa as
  empresas da carteira que o CFI não conhece, ordena quem pede atenção
  (vencido, ≤ 30 dias — inclusive pelo A1 da matriz —, sem certificado,
  renovado sem upload) e conta.
- **Aba "🔐 Certificados"** (e eSocial › Certificados): filtros, situação,
  titular, validade, o que o Legal acompanha, última renovação, divergência,
  "o que fazer" e exportação Excel. Não exige empresa ativa (é a carteira).
- **Empresas:** a coluna Certificado lê do cofre; o detalhe explica a
  situação e que a renovação sobe pelo app Legal.
- **Pendências e painel do eSocial** contam vencidos/vencendo pelo cofre.
- **Saiu o envio de .pfx pelo DP:** `CertificadoManager`,
  `ESocialCertificados` e `certificadoService` (que trazia a configuração
  do Firebase do CFI embutida e listava o Storage dele direto do navegador).
- **Storage do DP:** ninguém grava; só o gestor lê os .pfx antigos, para
  conferir que estão no cofre e apagá-los pelo console. Emulador: 26 testes.
- Pendente: as Cloud Functions do eSocial deste projeto ainda procuram a
  senha do certificado em coleções do Firestore em texto (fallback); revisar
  quando a transmissão passar pelo CFI.
- **Revisão do PR #63 (Codex):**
  - **P1 (carteira):** o túnel devolvia o cofre inteiro ao navegador e a
    carteira era filtrada só na tela. Agora o DP pede `?cnpjs=` (a carteira)
    e o CFI devolve só essas empresas (CFI #1372); o filtro na tela fica
    como segunda trava. Gestor continua vendo todas.
  - **P1 (transmissão do eSocial):** é anterior a este PR. As Cloud
    Functions de transmissão leem o .pfx do bucket do CFI no caminho antigo
    (`empresa.certificado.storagePath`); o envio antigo do DP gravava no
    Storage do PRÓPRIO DP (nunca foi lido por elas) e o cofre atual guarda o
    arquivo cifrado (que elas também não leem). A solução é transmitir pelo
    CFI com o A1 do cofre, como o download de eventos — próxima etapa,
    proposta ao Paulo.
  - **P2:** "Atualizar" em Empresas também recarrega o cofre; o painel do
    eSocial mostra a data do A1 da matriz quando é ele que vale.

## 05/10/2026 — Etapa 5: calendário de obrigações da folha por empresa

Pedido do Paulo: "ausência de calendário de obrigações mensais que se
referem à folha de pagamentos e seus encargos, como FGTS, eSocial, Reinf,
guias sindicais".

- **`services/prazos/obrigacoesEmpresa.ts` (puro):** obrigações da empresa
  na competência ativa. Parte dos vencimentos gerais (salário, S-1299,
  DCTFWeb, DARF, FGTS Digital, 13º e anuais do 13º) e acrescenta:
  - **EFD-Reinf:** dia 15 do mês seguinte, dia não útil adia (mesma régua
    do catálogo do CFI). Responsável: fiscal; o DP acompanha.
  - **Contribuição sindical (março):** recolhimento até 30/04, só de quem
    autorizou (CLT arts. 578, 579, 582 e 583).
  - **Comprovante de rendimentos (janeiro):** último dia útil de fevereiro
    (IN RFB 2.060/2021).
  - **Guias sindicais da convenção:** dia e meses vêm do cadastro do
    sindicato dos empregados ativos (CNPJ da ficha). Sem dia cadastrado não
    se inventa data: a tela avisa qual sindicato está sem guia.
  - Sem empregados ativos no cadastro, as obrigações ficam com a condição
    "confira se há folha" (S-1299 e DCTFWeb valem mesmo sem movimento).
- **Sindicato:** campos novos `guiaDia` (1 a 31; dia que não existe vira o
  último do mês; não útil antecipa), `guiaMeses` ("todos" ou "3, 9") e
  `guiaDescricao`, com validação e o bloco "Guia sindical no calendário".
- **`obrigacoes_status/{empresa}_{obrigação}`:** marcação "entregue" ou
  "não se aplica" (com motivo), vista por toda a equipe da empresa, com
  auditoria em `cadastro_audit`. Regras: só quem tem a empresa (carteira,
  cadastrou, ou gestor) lê, marca e desfaz; autor, status, competência e id
  conferidos. Emulador: 29 testes (3 novos).
- **Prazos:** no topo, "Calendário da empresa" da empresa e competência
  ativas — vencimento com ajuste de dia útil, responsável, base legal,
  atraso destacado, contadores e botões Entregue / Não se aplica / Desfazer.

## 05/10/2026 — Transmissão do eSocial pelo cofre do CFI

- **Paulo: *"pode seguir com a transmissão do esocial pelo cofre"*.**
- **Por que mudou:** as Cloud Functions antigas (`functions/`) liam o .pfx de
  um caminho que não existe mais e a senha em texto no Firestore, não
  conferiam a carteira e geravam eventos incompletos (o S-1200 saía só com o
  CPF). Saíram do repositório; a entrada `functions` do `firebase.json` também.
  Se alguma delas estiver publicada no projeto, apagar pelo console.
- **CFI** (`sefaz-backend/esocial-envio.js`, `dp-acesso-empresa.js`, rotas
  `/api/dp-integration/esocial/envio/{lote,consulta}`):
  - **Acesso:** só o projeto do DP entra. A carteira é conferida lendo a
    empresa no Firestore do DP com o token do próprio usuário: as regras do
    DP decidem, sem cópia da carteira no CFI.
  - **Conferência de cada evento:** raiz `<eSocial>`, tipo, Id, empregador,
    ambiente e grupo. O lote leva até 50 eventos, de um grupo só.
  - **Assinatura e envio:** assina com o A1 do cofre (o do escritório,
    procurador, ou o da empresa); a assinatura antiga do XML é trocada.
    Envia em `WsEnviarLoteEventos` (o lote em si não é assinado).
  - **Ambiente:** produção restrita é o padrão; produção exige
    `confirmoProducao`, como no gateway da EFD-Reinf.
  - **Consulta:** só aceita protocolo que saiu do túnel para a mesma empresa e
    ambiente.
  - **Auditoria:** `dp_esocial_envio_log`, sem o conteúdo dos eventos.
- **DP** (`services/esocial/transmissao.ts`, `transmissaoService.ts`, aba
  eSocial › Transmissão):
  - **Eventos gerados aqui:** S-1299 (mensal ou anual do 13º, com os
    indicadores e a DCTFWeb) e S-1298, leiaute S-1.3.
  - **XML pronto:** IOB ou outro sistema; a tela confere empresa e ambiente
    antes de enviar.
  - **`esocial_envios`:** protocolo, Ids, tipos, recibos e ocorrências. O
    usuário cria e a consulta atualiza; ninguém apaga. Precisa do índice
    `empresaId` + `enviadoEm`.
  - **Aba Eventos:** virou só controle. O botão "Transmitir" leva à aba
    Transmissão.
- **Validação contra os XSDs oficiais (nfephp sped-esocial):**
  - S-1299 mensal e anual e S-1298, assinados com o A1 de teste do CFI,
    passam em `evtFechaEvPer`/`evtReabreEvPer` v_S_01_03_00;
  - o lote passa em EnvioLoteEventos v1_1_1;
  - a consulta passa em ConsultaLoteEventos v1_0_0.
- **Testes:**
  - CFI: 14 novos (626 suítes, 9189 testes);
  - DP: 11 novos (485 testes);
  - regras no emulador: 32.
- **Pendente de teste real:**
  - Primeiro envio em produção restrita, depois do deploy do CFI, com o A1 do
    escritório no cofre.
  - Confirmar que a procuração cobre o envio; se não cobrir, usar
    "certificado da própria empresa".

## 05/10/2026 — Backup do IOB: sinônimos do FolhaWin e carga do enquadramento

- **Paulo: *"pode seguir com a carga de enquadramento e sinônimos"*.**
- **Sinônimos do FolhaWin no de/para** (`cargaBackupIob.ts`):
  - **Siglas:** `codfun`, `dtres`, `numcp`, `sercp`, `ufcp`, `orgrg`, `dtemrg`,
    `numtit`, `codsind`, `bcosal`, `agdsal` e `comple`.
  - **Resultado:** contra as 223 colunas reais da `func` (inventário do
    backup), a proposta acerta 34 dos 38 campos. Faltam o código do cargo
    (`codcargo` está na `funcdoc`) e o CNPJ do sindicato (não está na
    `func`).
  - **Salário e PIX:** vêm de tabelas complementares do mesmo schema, ligadas
    pelo `codfun`:
    - salário de `salarios`: o registro marcado em `ultimo` ou, sem marca, o
      de maior `anomes`;
    - PIX de `funcdoc.vlchavepix`.
    - O modal "Completar pelo backup do IOB" lê essas tabelas quando estão no
      backup.
  - **A conferir:** a `func` tem `cc` (proposto como conta) e `salban`; qual
    é a conta do salário ainda não foi confirmado com dados reais.
- **Carga do enquadramento** (`cargaEnquadramentoIob.ts`; botão em Cadastros ›
  Enquadramento › "Carregar do backup do IOB"):
  - **Escopo:** todas as empresas da carteira, ligadas pelo código SAGE
    (`CODEMPRESA`).
  - **Regime:** pela classificação tributária do S-1000 (`ES_S1000.FKCLASTRIB`):
    - 01 → Simples (CPP no DAS);
    - 02 → Simples Anexo IV;
    - 03 e 04 → conferir;
    - 06–14 e 60–99 → normal;
    - código desconhecido → conferir (pode ser índice interno do IOB).
  - **RAT e CNAE:** RAT (`PERCSAT`), RAT ajustado e CNAE vêm do `ES_S1005`.
    Estabelecimentos com RAT diferentes viram pendência.
  - **FAP:** por período (`ESOCIALEMPRESA`). Cada período ainda em uso
    (encerrado depois do corte, por padrão janeiro do ano anterior) vira uma
    vigência. Sem período, o FAP sai do RAT ajustado ÷ RAT, ou 1,0000
    provisório com pendência.
  - **CNPJ:** o CNPJ do IOB tem de ter a mesma raiz da empresa; senão, erro.
  - **FPAS e terceiros:** vêm do `depto` do schema `fNNNN`, que só existe no
    Backup SQL completo. Sem ele, a tela oferece um "FPAS padrão" (com
    sugestões da `TERC`), aplicado só a quem a equipe marcar, com pendência.
  - **Gravação:** nada é sobrescrito; enquadramento já cadastrado na vigência
    mostra as diferenças. Grava em lotes, com auditoria (origem "Backup IOB").
- **Testes:** 495 passando (11 novos).

## 05/10/2026 — Boas-vindas antes do portão de empresa e período

- **Paulo (print):** depois de publicar as regras, as empresas apareceram, mas
  *"não está gerando uma tela de login e boas-vindas"*.
- **Causa:** a saudação só era desenhada no layout principal. Desde o portão
  "Ativar empresa e período" (PR #61), o app mostrava o portão antes, e a
  saudação ficava escondida até ativar uma empresa.
- **Correção:** a ordem passa a ser login → boas-vindas → ativar empresa e
  período → pendências. Sem empresa ativa, o botão diz "Escolher empresa e
  período".
- **Login:** a tela não aparece com a sessão aberta (o Firebase mantém o login
  no navegador, como no CFI). Volta ao clicar em Sair.
- **Ajustes vistos no print seguinte (mesmo dia):**
  - **Selo do papel:** dizia "👑 Admin" também para o gestor; agora mostra o
    papel de verdade (Gestor ou Admin).
  - **Card "Selecionar empresa" da Folha:** dizia "1 empresa(s)" porque a tela
    só mostra a empresa ativa. Com empresa ativa, passa a dizer "Abra o
    período MM/AAAA da empresa ativa…".
  - **Cabeçalho:** o nome do app e "Templates e agendamentos" não quebram mais
    linha. O nome só aparece em telas largas, e o link fica "Templates ↗" nas
    estreitas.

## 06/10/2026 — Enquadramento pelo .backup de uma empresa (schema fNNNN)

- **Paulo mandou o inventário do backup do banco de uma empresa:** schema
  `f1200`, 367 tabelas, com dados reais (`func` com 85 KB, `salarios` com
  389 KB, `holerith` com 1 MB).
- **Funcionários:** o dicionário é o mesmo do `f1316`: `func` (223 colunas
  idênticas), `salarios` (com `ultimo`) e `funcdoc` (com `vlchavepix`). O
  de/para do PR #66 vale como está.
- **Enquadramento:** a carga exigia as tabelas de sistema do FolhaWin
  (`ES_S1005`…), que não vêm no `.backup`. Agora também lê o schema da
  empresa:
  - `esocialdadosficha_s1000`: o `classtrib` é o código do eSocial e tem
    preferência sobre o `FKCLASTRIB`; o `nrinsc` confere o CNPJ.
  - `depto_ma`: FPAS, código e % de terceiros, RAT e FAP mês a mês, da
    lotação com mais meses. Cada mudança de parâmetro vira uma vigência, e
    ficam as que ainda valem a partir do corte.
  - `depto`: FPAS, terceiros, RAT e CNAE, como reserva.
  - O schema `fNNNN` liga ao código SAGE `NNNN`.
- **Para o futuro, o mesmo backup tem:**
  - `holerith`/`holetot`, os holerites calculados pelo IOB, que podem servir
    para conferir o motor sem PDF;
  - `arquivoeventotransmissaoesocial`, os XMLs que o IOB transmitiu.

## 06/10/2026 — Código SAGE e CNPJ únicos; master vira gestor pela verificação no app

- **Paulo (print de Empresas):** *"você deve bloquear o cadastro de empresas
  com a mesma numeração, exemplo 1200"*. Havia duas empresas com SAGE 1200:
  SP (44.388.152/0001-89) e SP ASSESSORIA CONTABIL (04.896.300/0001-51).
- **Causa:** a checagem de CNPJ repetido olhava só as empresas visíveis, e a
  de código SAGE não existia. Fora do gestor, a lista não mostra as empresas
  de outras carteiras.
- **Trava:**
  - **Chaves:** `empresas_unicos/{sage_0000 | cnpj_…}` aponta a empresa dona.
  - **Criar:** a empresa e as duas chaves vão no mesmo lote. As regras só
    aceitam a empresa com as duas chaves dela.
  - **Trocar código ou CNPJ:** exige reservar a chave nova; a antiga é
    liberada quando a empresa deixa de usá-la ou é excluída.
  - **Dono fixo:** a chave não troca de dono (`update: false`).
  - **Mensagem:** a tela confere antes de gravar e diz com qual empresa
    conflita, ou que é "fora da sua carteira".
- **Empresas de antes da trava:**
  - **Botão do gestor:** "Proteger códigos e CNPJs das empresas existentes"
    reserva as chaves; a empresa mais antiga fica com a chave repetida.
  - **Aviso:** a lista marca em vermelho o código ou CNPJ repetido, para
    corrigir em "Editar".
  - **Reserva ao editar:** qualquer edição também reserva as chaves livres.
- **Master:** o print mostrou "Admin". A conta master só vira gestor com o
  e-mail verificado, e o aviso de verificação aparecia só na tela de
  "aguardando aprovação". Agora aparece no topo do app enquanto o master não
  for gestor.
- **Testes:** emulador com 38 testes (6 novos de chaves únicas); vitest com
  501.

## 06/10/2026 — Busca de empresa na Folha e na ativação

- **Paulo (prints):** *"a busca e pesquisa de empresa não está funcional, nem
  por nome, nem número SAGE"*.
- **Causa:** desde o portão (PR #61), a Folha só carregava a empresa ativa, e
  o modal "Selecionar / Abrir empresa" buscava apenas nela. Por isso 1200 e
  outros nomes não apareciam. A busca também não ignorava acentos e não
  achava o CNPJ digitado com pontuação.
- **Correção:**
  - **Busca única** (`services/empresas/buscaEmpresas.ts`): nome e razão
    social sem acento nem maiúscula, CNPJ com ou sem pontuação, código SAGE
    com ou sem zeros. Vale no modal da Folha e na tela de ativação.
  - **Modal da Folha:** busca em toda a carteira, com a empresa ativa já
    marcada. Escolhendo outra empresa (ou outro mês), o app troca a empresa
    ativa (`ativar` no contexto) e abre a folha dela direto: o pedido fica em
    `sessionStorage` enquanto a tela remonta.
