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
- **Débitos da DCTFWeb por código de receita: ainda digitados.** O túnel só
  devolve a situação da declaração. O CFI já baixa o XML da declaração
  (`CONSXMLDECLARACAO38`, `consultarXmlDeclaracao`), mas não há leitor dos
  débitos previdenciários nem XML real para montá-lo. Próximo passo: rota
  `dctfweb/xml` no túnel e o primeiro XML real como gabarito.
- **Motor de cálculo: código determinístico, não IA** (resposta ao Paulo,
  03/10/2026). O Gemini fica como assistente: explicar divergência, ler
  convenção coletiva para sugerir parâmetros que um humano valida.

