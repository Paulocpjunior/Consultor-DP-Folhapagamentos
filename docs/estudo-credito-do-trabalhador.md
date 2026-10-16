# Crédito do Trabalhador (e-Consignado) — estudo e plano para o Consultor DP

Estudo de 15/10/2026, pedido pelo Paulo: analisar na íntegra o empréstimo consignado do Programa Crédito do Trabalhador
(gov.br) e como incorporá-lo à folha das empresas e ao desconto dos trabalhadores, conforme a legislação.

## 1. Base legal e documentos

| Norma / documento | O que define |
| --- | --- |
| Lei 10.820/2003 (alterada pela MP 1.292/2025, convertida na Lei 15.179/2025) | Consignado do empregado; desconto obrigatório com contrato averbado (art. 2º-A, § 2º, I); empregador responde como devedor principal e solidário pelo que deixar de reter ou repassar (art. 5º, § 1º); vedado interferir na escolha da instituição (art. 3º, § 1º). |
| Portaria MTE 435/2025 | Regulamento operacional: consulta mensal obrigatória ao Portal Emprega Brasil (art. 20); competência da 1ª parcela pela data de averbação, de 21 do mês anterior a 20 do mês corrente (art. 24); dever de informação (art. 25); limite de 35% da remuneração disponível e como apurá-la, inclusive na rescisão (art. 30, §§ 1º a 5º). |
| Portaria MTE 506/2026 | A partir da competência 02/2026, parcelas vencidas só pelo FGTS Digital, com IPCA, juros de 0,033% ao dia e multa de 2%. De 05/2025 a 01/2026, a regularização é direto com a instituição. |
| Manual de Orientação do Empregador, v2.1, 26/06/2026 (MTE) | Passo a passo: DET, Portal Emprega Brasil, eSocial, FGTS Digital/DAE, casos especiais (adiantamento, férias, afastamento, maternidade, transferência, 13º, rescisão com garantia). Lido na íntegra (61 páginas). |
| Leiaute do arquivo de empréstimos (Portal Emprega Brasil, versões até 1.4) | Arquivo da competência em CSV, XLS ou JSON, matriz e filiais juntas; campos como `ifConcessora.codigo`, `contrato`, `cpf`, `matricula`, `valorParcela`, `competencia` e, na 1.4, a data de admissão. O guia oficial (versão 1.4) publica o cabeçalho, a tabela de campos (tipo, formato, obrigatoriedade) e exemplos fictícios. **A página não abre deste ambiente: os campos acima vêm de fontes secundárias e serão conferidos com o guia oficial antes da importação.** |
| eSocial S-1.3 | Rubrica natureza 9253 (S-1010 com codIncCP 00, codIncIRRF 9, codIncFGTS 31), grupo `descFolha` (tpDesc, instFinanc, nrDoc, observacao) no S-1200, S-2299 e S-2399; vedada no S-1200 do 13º (REGRA_RUBRICA_COMPATIVEL_DECTERCEIRO); o grupo `consigFGTS` do S-2299 não se usa no programa. |

## 2. Como funciona (visão do empregador)

1. **Elegíveis:** categorias 101 (empregado CLT), 104 (doméstico) e 721 (diretor não empregado com FGTS), com vínculo ativo. A contratação é só do trabalhador, pela Carteira de Trabalho Digital ou, desde 25/04/2025, também pelos canais da instituição financeira (aplicativo, internet banking, agência); em qualquer canal, a Dataprev registra e administra o contrato e ele aparece para o empregador no Portal Emprega Brasil.
2. **Aviso no DET** (dias 21 a 25): "Contratação de Empréstimo Consignado…". É complementar; não ler o aviso não tira a obrigação.
3. **Portal Emprega Brasil › Crédito do Trabalhador** (dias 21 a 25, por competência):
   - Arquivos de Empréstimos: todos os trabalhadores com parcela na competência (CSV, XLS, JSON);
   - Consultar Contrato (por número e instituição) e Extrato (por CPF): saldo devedor e o **percentual das verbas rescisórias dado em garantia**;
   - também há API (JSON) para os sistemas de folha.
   - **Os dados mudam todo mês** (renegociação, quitação, portabilidade): não reutilizar a competência anterior.
4. **Competência da 1ª parcela:** contrato averbado de 21/03 a 20/04 → desconto na folha de 05.
5. **Folha (eSocial):** rubrica 9253 com `descFolha`, uma por contrato (mesmo contrato em duas rubricas no mês: mesmos instFinanc e nrDoc, o S-5003 soma). O holerite discrimina cada operação.
6. **Limite:** 35% da **remuneração disponível** do mês (art. 30):
   - soma das rubricas de vencimento **com incidência de INSS**;
   - menos os descontos com incidência de INSS (faltas, atrasos, DSR), o INSS, o IRRF e os descontos compulsórios (pensão 9213, desconto do adiantamento do 13º 9214, retenções judiciais 9218, FIES 9260);
   - **não** entram: vencimentos sem INSS (prêmios, PLR, salário-família, ajuda de custo, VT, abono pecuniário, complemento de auxílio-doença 4010, 13º da folha anual…), descontos voluntários (convênios, plano de saúde, VT, outros empréstimos 9254) e o desconto de adiantamento salarial ou de férias (9200).
   - Acima do limite: desconto parcial (ou nenhum) e o empregador **avisa o trabalhador** (o manual sugere mensagem no holerite).
7. **Adiantamento salarial e de férias:** como o desconto do adiantamento não reduz a remuneração disponível, sem provisão o líquido pode não comportar a parcela; mesmo assim **a parcela dentro do limite tem de ser escriturada e recolhida** (gera insuficiência de saldo). O manual recomenda provisionar no adiantamento (natureza 9299) proporcionalmente e devolver na folha (1629), lançando a parcela integral em 9253; nas férias, a provisão no recibo pode ir em 9253 com o mesmo contrato.
8. **Recolhimento:** o FGTS Digital lê o S-5003 e inclui o consignado na guia (Guia Rápida, ou Parametrizada, Etapa 2). **Vencimento: dia 20 do mês seguinte à competência** (dia útil anterior), também quando descontado na rescisão. Doméstico, MEI e segurado especial: DAE (o eSocial Doméstico lança sozinho e já aplica os 35%).
9. **Atraso:** a partir de 02/2026, só pelo FGTS Digital, com encargos (Portaria 506/2026). Retificação no eSocial não muda débito já pago ou vencido.
10. **Casos especiais:**
    - **13º salário:** nenhum desconto (vedado no S-1200 anual);
    - **auxílio-doença:** só os dias pagos pela empresa entram; afastado o mês todo, nada a descontar;
    - **salário-maternidade pago pela empresa:** entra na remuneração disponível; pago pelo INSS, não há desconto;
    - **transferência no grupo ou sucessão:** a nova empresa só desconta quando o Portal mostrar o contrato no CNPJ dela.
11. **Rescisão (manual v2.1, item 5.7):**
    - só se desconta das verbas rescisórias se o contrato tiver **percentual de garantia** (Portal: "Garantia ofertada"). **Sem garantia (0%), nenhum desconto, nem a parcela do mês**;
    - desconto = **menor** entre (percentual de garantia × remuneração disponível na rescisão) e o **saldo devedor**;
    - remuneração disponível na rescisão: a mesma base do mês **mais** aviso prévio indenizado (6003), férias em dobro (6004), proporcionais (6006) e vencidas (6007) com o 1/3; **menos** também o desconto do aviso (6901) e a multa do art. 480 (6904);
    - o eSocial confere com o saldo e o percentual da Dataprev e alerta divergência;
    - depois do desligamento, nenhum desconto; o resto é entre o trabalhador e a instituição;
    - `consigFGTS` não se preenche; a garantia do FGTS (saldo e multa) é tratada pela CAIXA, sem o empregador.
12. **Responsabilidade:** não escriturar é infração acessória; descontar e não recolher torna o empregador devedor principal e solidário. As informações têm de ser as do Portal.

## 3. O que o Consultor já faz (entregue em 11/10/2026, `services/calculo/consignado.ts`)

- Contratos na ficha (aba Consignado): instituição (Tabela 37), número, parcela, início e fim, saldo para a rescisão.
- Folha mensal: desconto por contrato em rubrica `CONSIG` → natureza 9253 com `descFolha` no S-1200 e no S-2299 (XSD conferido); bloqueio de 9253 sem contrato e de consignado fora da 9253; regras da rubrica (FGTS 31, INSS 00, IRRF 9); nada no 13º; `consigFGTS` não usado.
- Limite de 35% com aviso quando a parcela não cabe.

## 4. Diferenças em relação ao manual (corrigir)

| # | Hoje no Consultor | Pelo manual / Portaria 435 | Impacto |
| --- | --- | --- | --- |
| D1 | Remuneração disponível = **todos os proventos** − INSS, IRRF e pensão. | Só vencimentos **com INSS**, menos descontos com INSS (faltas, atrasos, DSR), INSS, IRRF e compulsórios (9213, 9214, 9218, 9260). | Hoje a margem fica maior que a legal (inclui salário-família, ajuda de custo, PLR…) e ignora faltas: risco de descontar acima de 35%. |
| D2 | O desconto nunca passa do **líquido** (para não ficar negativo). | Dentro dos 35%, a parcela é obrigatória: escritura e recolhe mesmo sem líquido (insuficiência de saldo), e o manual recomenda provisionar no adiantamento. | Hoje, com adiantamento grande, o Consultor desconta menos que o devido e o empregador fica devedor solidário. |
| D3 | Rescisão: desconta a parcela do mês (ou o "saldo para a rescisão") até 35% das verbas. | Só com **percentual de garantia**: menor entre % × remuneração disponível na rescisão (com aviso, férias e 1/3) e o **saldo devedor**; sem garantia, **nada**. | Hoje desconta quando não pode (sem garantia) e erra o valor quando há garantia. |
| D4 | Contrato fixo na ficha (parcela de início a fim). | Os dados valem **por competência**, do arquivo do Portal; não reutilizar o mês anterior. | Parcela renegociada, portada ou quitada passa despercebida. |
| D5 | Sem aviso ao trabalhador no holerite. | Desconto parcial ou não feito: informar o trabalhador. | Obrigação do art. 30, § 4º. |

## 5. O que falta (incorporar)

| # | Item | Como |
| --- | --- | --- |
| F1 | **Importar o arquivo do Portal Emprega Brasil** (CSV, XLS ou JSON) da competência. | Tela "Crédito do Trabalhador" na Folha do mês: lê o arquivo, liga pelo CPF e matrícula, mostra quem não foi achado, e grava as parcelas no **movimento da competência** (travado após o Fim de mês). A ficha guarda só o histórico. |
| F2 | Garantia e saldo devedor para a rescisão. | Campos no contrato (percentual de garantia, saldo devedor e a data da consulta), digitados do "Consultar Contrato"/"Extrato" no dia da rescisão; a rescisão calcula pela regra D3 e mostra a memória. |
| F3 | Provisão no adiantamento e nas férias. | Opção por empresa: provisionar a parcela do mês anterior no adiantamento (proporcional ao %) e no recibo de férias (proporcional aos dias); devolução e parcela integral na folha, com o mesmo contrato. |
| F4 | Mensagem no holerite. | Texto do manual quando houver desconto parcial ou nenhum desconto. |
| F5 | Relatório de repasse e prazo. | Relatório por competência (trabalhador, instituição, contrato, devido, descontado, motivo) e o vencimento do dia 20 no Prazos do DP e no calendário da empresa; aviso de atraso com os encargos da Portaria 506/2026. |
| F6 | Conferência com o eSocial/FGTS Digital. | Na conferência pós-folha, comparar o consignado do S-5003 com o da folha. |
| F7 | API da Dataprev (fase 2). | Buscar consignações, empréstimos e extratos direto pelo serviço da plataforma comum. A Dataprev publica a documentação técnica para empregadores desde 06/2026 (manual, autenticação por certificado ou procuração, estruturas JSON, homologação e produção; outros sistemas de folha já a usam). O site não abre deste ambiente, então a especificação será lida de outro lugar; a dependência real é o certificado A1 do empregador (ou a procuração do escritório). |
| F8 | Avisos de casos especiais. | Transferência no grupo (só após o Portal mostrar o novo CNPJ), doméstico/MEI (o eSocial lança e recolhe por DAE), afastado o mês todo, salário-maternidade pago pelo INSS, e retificação de mês já pago ou vencido. |
| F9 | MIA e catálogo. | A MIA explica o fluxo mensal e onde importar; o catálogo SAGE ganha o item. |

## 6. Plano proposto (em PRs, cada um com testes e o mata-burro)

1. **Correções de cálculo (D1, D2, D5 e F4):** remuneração disponível pelas incidências de INSS e os compulsórios; parcela dentro dos 35% mesmo sem líquido (insuficiência de saldo, como já existe na rescisão); mensagem no holerite; testes com os 7 exemplos do manual (valores conferidos com o manual). **Feita em 16/10/2026:** testes com os exemplos 01, 02, 03, 04, 06 e 07 (o 05 é rescisão, etapa 2); o limite de 35% é truncado no centavo (o exemplo 04 do manual arredonda para R$ 1.330,85; o Consultor dá R$ 1.330,84).
2. **Rescisão com garantia (D3 e F2):** percentual e saldo devedor no contrato; base da rescisão do § 5º; sem garantia, nenhum desconto; testes com os 2 exemplos do item 5.7. **Feita em 16/10/2026:** campos de garantia, saldo devedor e data da consulta na aba Consignado; sem a consulta, a rescisão fica incompleta (o S-2299 não sai); exemplos 1 e 2 do item 5.7.3 conferidos (R$ 4.311,25 e R$ 700,00). O exemplo 05 do item 5.2.1 (desligado no mês, parcela de R$ 1.000,00 limitada a 35% e férias fora da base) contradiz o item 5.7.2 ("nem mesmo o valor da parcela mensal" sem garantia); o Consultor segue o 5.7, que é a regra específica da rescisão.
3. **Importação do arquivo do Portal (D4 e F1):** pelo leiaute oficial 1.4 (cabeçalho e tabela de campos) e pelos exemplos fictícios do guia, que servem de testes. Um arquivo real não é necessário; se o Paulo quiser uma validação extra, só anonimizado e pelo chat, nunca no repositório.
4. **Repasse, prazo e conferência (F5, F6 e F8):** relatório, dia 20 no calendário, comparação com o S-5003. **Feita em 16/10/2026:** Folha do mês › Crédito do Trabalhador (repasse por contrato com motivo, total por instituição, vencimento e Excel); eConsignado do S-5003 na conferência pós-folha, comparado com a folha gravada e somado à guia do FGTS Digital; Prazos do DP com o arquivo do Portal (21 a 25) e a guia levando o consignado; avisos de afastado o mês todo e doméstico.
5. **Provisão no adiantamento e nas férias (F3):** opção por empresa. **Feita em 16/10/2026:** "Provisionar o consignado" nos parâmetros da folha (Cálculo mensal), desligada por padrão; adiantamento com a provisão na proporção dele (9299) e devolução na folha (1629); recibo de férias com a provisão pelos dias de gozo de cada mês, abatida do líquido das férias na folha; a parcela inteira sempre na 9253. Exemplos 03 e 04 do manual nos testes. A opção vale por competência: ligar ou desligar não muda meses anteriores.
6. **API da Dataprev (F7):** a documentação técnica já existe; depende do certificado A1 da empresa (ou procuração) e de ler a especificação fora deste ambiente.

## 7. Dependências do Paulo

- Como os sites do MTE e da Dataprev não abrem deste ambiente: copiar pelo chat o texto do guia do leiaute 1.4 (cabeçalho, tabela de campos e exemplos fictícios), ou o PDF do manual técnico da API. Não é preciso enviar arquivo com dados reais.
- Se o escritório acessa o Portal Emprega Brasil e o DET por procuração eletrônica (SPE) para os clientes.
- Se as empresas querem a provisão no adiantamento (F3) ou preferem a insuficiência de saldo.

## 8. Fontes

- [Manual de Orientação do Empregador, v2.1 (MTE)](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/credito-do-trabalhador/empregador/manual-operacional-do-empregador)
- [FGTS Digital passa a receber parcelas em atraso (MTE, 03/2026)](https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo/2026/marco/fgts-digital-passa-a-receber-parcelas-em-atraso-do-credito-do-trabalhador)
- [Lei 15.179/2025](https://www.jusbrasil.com.br/legislacao/4298993724/lei-15179-25)
- [Guia dos arquivos de empréstimos do Portal do Empregador (MTE)](https://servicos.mte.gov.br/empregador/manuais/leiauteArquivoEmprestimos.html) e [versão 1.4](https://servicos.mte.gov.br/empregador/manuais/leiauteArquivoEmprestimos1.4.html)
- [Tutorial do fluxo operacional (MTE)](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/credito-do-trabalhador/empregador/tutorial-credito-do-trabalhador.pdf)
- [Portal técnico da Dataprev](https://docs.dataprev.gov.br/docs/credito-trabalhador/) e [obtenção de dados de consignações via API](https://docs.dataprev.gov.br/docs/credito-trabalhador/orientacao-para-empregadores/obtencao-de-dados-de-consignacoes-via-api/)
- [Contratação também pelos bancos desde 25/04/2025 (MTE)](https://www.gov.br/trabalho-e-emprego/pt-br/noticias-e-conteudo/2025/abril/sao-paulo-e-rio-de-janeiro-lideram-adesao-ao-credito-do-trabalhador)
