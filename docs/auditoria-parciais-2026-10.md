# Auditoria dos itens parciais do catálogo SAGE (11/10/2026)

Paulo: "faça essa auditoria completa, e qual arquivo precisa de mim da IOB". Conferência dos 21 itens marcados como
parciais em `services/iobSage/catalogoMenus.ts`, com o código, para dizer o que falta em cada um, de quem depende e
a ordem de entrega.

## Resultado

| Situação | Antes | Depois desta auditoria |
| --- | --- | --- |
| Disponível | 29 | 35 |
| Parcial | 21 | 16 |
| Planejado | 1 | 0 |
| Fora do escopo | 2 | 2 |

### Já completos, reclassificados como disponíveis

| Item | Por quê |
| --- | --- |
| Afastamentos/Retorno (`arq-afastamentos`) | Lançamento, importação e envio do S-2230 (início, término, retificação e exclusão), 16º dia, trava do Fim de mês. Nada do SAGE ficou de fora. |
| Tabelas legais (`arq-tabelas`) | INSS, IRRF (com o redutor), salário mínimo federal e estadual e salário-família por vigência, usados pelo motor. |
| Movimento eSocial, periódicos (`es-periodicos`) | S-1200 e S-1210 (mensal, férias, 1ª parcela e 13º anual), S-2299 e o S-1210 da rescisão, S-1299 e S-1298, retificação e S-3000. |
| Rescisão (`proc-rescisao`) | Cálculo, simulação, TRCT, S-2299, S-1210 do pagamento, efetivação com prazos e a rescisão complementar. |
| Vale-transporte e benefícios (`proc-beneficios`) | VT (6% e pedido por operadora), benefícios com desconto, coparticipação do plano e o plano no S-1210. |
| Importação de valores (`ut-imp-valores`, era planejado) | Entregue nesta rodada pelo layout oficial do IOB (abaixo). |

### Arquivo do IOB: a importação de valores não precisa de nenhum

O layout de importação de valores do IOB SAGE FOLHAMATIC **já está no Consultor**: é o "Ponto padrão Windows 3"
(40 posições) e "Windows 4" (50 posições, com a empresa e a competência), do documento que a IOB forneceu em
25/09/2026 e que o Apontamento já usa para gerar o TXT. A nova tela Folha do mês › Importação de valores lê esse
arquivo e lança no movimento do mês. A "Digitação diária" é o próprio movimento do Cálculo mensal; a importação da
SEFIP não se aplica (eSocial e FGTS Digital).

**O que ainda preciso do IOB (só para um item):** prints das abas **Complementos**, **Lanç. Automático** e
**Holerite** da ficha do funcionário no IOB Office (Arquivos › Funcionários › Cadastro Básico), com os campos
visíveis. Sem eles não dá para saber quais campos essas abas têm.

### Parciais que faltam (16), em ordem de entrega

| # | Item | O que falta | Depende de |
| --- | --- | --- | --- |
| 1 | ~~13º salário (`proc-13`)~~ **entregue em 11/10** | Parcela única em dezembro (sem 1ª parcela, sem desconto do adiantamento) e a 1ª parcela paga com as férias, a pedido do empregado (Lei 4.749/1965, art. 2º, § 2º), no recibo de férias. | nada |
| 2 | ~~Estorno do cálculo (`ut-estorno`)~~ **entregue em 11/10** | Estornar (apagar) a folha gravada da competência aberta, com o aviso dos eventos do eSocial já enviados (S-3000). | nada |
| 3 | ~~Processamento agrupado (`proc-agrupado`)~~ **entregue em 11/10** | 13º (1ª e 2ª parcelas) e as rotinas anuais em lote. | nada |
| 4 | ~~Ficha financeira (`rel-ficha`)~~ **entregue em 11/10** | Férias, 13º e rescisão pagos fora da folha mensal nos meses do Consultor (precisa gravar esses cálculos). | nada |
| 5 | ~~Listagens (`rel-listagens`)~~ **entregue em 11/10** | Etiquetas e a listagem de sindicatos. | nada |
| 6 | ~~Envio por e-mail (`ut-email`)~~ **entregue em 11/10** | Holerite individual por e-mail ao funcionário (o e-mail da ficha), pelo serviço de e-mail do escritório. | nada |
| 7 | ~~Crédito do Trabalhador (`proc-consignado`)~~ **entregue em 11/10** | Cadastro dos contratos, desconto mensal com o limite de 35%, o grupo do desconto em folha no S-1200 e o desconto na rescisão. | nada |
| 8 | ~~Horários (`arq-horarios`)~~ **entregue em 11/10** | Escalas e revezamento (12x36, turnos). | nada |
| 9 | ~~Diagnóstico eSocial (`es-diagnostico`)~~ **entregue em 11/10** | Diagnóstico do cadastro inteiro (fichas, rubricas, tabelas) antes de gerar, apto ou não apto. | nada |
| 10 | ~~Parâmetros da empresa (`arq-empresas`)~~ **entregue em 11/10** | Início da DCTFWeb e do FGTS Digital da empresa. | nada |
| 11 | ~~Eventos (`arq-eventos`)~~ **entregue em 11/10** | Fórmula própria por evento. | nada |
| 12 | ~~Processo trabalhista (`es-processo-trab`)~~ **entregue em 11/10** | Unicidade contratual, responsabilidade indireta e Justiça Comum no S-2500. | nada |
| 13 | ~~Pagamento de guias (`trib-pagamento`)~~ **entregue em 11/10** (baixa pelo comprovante; a consulta automática no e-CAC fica para quando houver a rota do CFI) | Baixa do DARF pago (consulta do pagamento no SERPRO pelo CFI, ou baixa manual). | rota do CFI, se for pela consulta |
| 14 | ~~Folha complementar (`proc-complementar`)~~ **entregue em 11/10** (a diferença do 13º de ano anterior segue pelo IOB) | RRA (diferenças de anos anteriores, IRRF pela tabela acumulada). | nada (fica por último, como combinado) |
| 15 | Integração contábil (`div-contabil`) | Importação direta no Consultor Contábil. | acesso ao `plano-contas-iob` ou o layout do CCI |
| 16 | Cadastro do funcionário (`arq-funcionarios`) | Abas Complementos, Lanç. Automático e Holerite. | prints do IOB Office |

## Entregue nesta rodada

- **Importação de valores** (`services/calculo/importacaoValores.ts`; tela Folha do mês › Importação de valores):
  - leitura do TXT nos layouts Windows 3 e Windows 4, com o erro de cada linha fora do layout (posições, campos numéricos, referência e valor juntos, competência inválida, layouts misturados);
  - o arquivo ANSI (Windows-1252) ou UTF-8;
  - cada linha vira um "Lançar evento" pelo cadastro do evento: horas, dias e % pelo salário do mês, e os eventos que o motor conhece no campo próprio do movimento;
  - funcionário pelo "Código no IOB" da ficha; código em mais de uma ficha ativa é recusado;
  - no Windows 4, linhas de outra empresa ou competência ficam de fora;
  - grava no movimento com a conferência do que mudou; importar de novo não duplica; competência encerrada não recebe.
