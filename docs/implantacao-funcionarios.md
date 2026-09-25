# Implantação de funcionários: etapa de conferência

Acesse Folha > Implantação de funcionários. Informe CNPJ e data da implantação, adicione XMLs e abra cada ficha. O módulo aceita S-2200, S-2205, S-2206, S-2299 e S-3000 nas versões S-1.0 a S-1.3, inclusive envelopes `retornoEventoCompleto`. Outros eventos geram aviso e não são consolidados.

## Comportamento

- Cada vínculo é separado por raiz do CNPJ, CPF e matrícula eSocial; códigos alfanuméricos e zeros iniciais são preservados. O estabelecimento aparece como campo separado.
- Arquivos idênticos não são adicionados novamente. Mesmo ID com conteúdo diferente gera conflito.
- A consolidação usa a data de implantação, as alterações cadastrais e contratuais, retificações e exclusões com recibo associado. Eventos futuros não são aplicados.
- XML sem recibo pode fornecer dados para conferência, mas permanece com pendência de aceitação. O consolidador estrito exige recibo alvo e retorno 201 para retificações/exclusões; no painel, uma admissão S-2200 retificadora isolada com retorno 201 pode fornecer cadastro provisório, sempre com pendência de histórico e sem admitir alvo ambíguo ou admissões concorrentes; retornos rejeitados não alimentam o cadastro.
- Cadeias inconsistentes, concorrentes ou cíclicas não são aplicadas automaticamente. Arquivos não suportados, afastamentos, sucessões, reintegrações e demais históricos específicos exigem revisão; este módulo não conclui a situação completa da folha.
- S-2205 mantém nascimento do S-2200 e substitui o bloco cadastral aplicável; S-2206 mantém admissão e substitui o bloco contratual aplicável. Dependentes, deficiência e endereço no exterior são exibidos como dados estruturados do XML.
- `dtEf` é tratado como informação de efeitos remuneratórios para revisão. Não antecipa todos os campos do contrato; esta etapa não calcula retroativos.
- PDF.js lê localmente fichas Registro de Empregado com texto selecionável. A primeira página fornece sugestões, sem preencher campos em branco nem converter o número da ficha em código IOB. CNPJ completo, CPF válido e matrícula devem corresponder. O usuário confirma complementos e justifica divergências; a origem inclui o hash do PDF. Modelos não reconhecidos e PDFs digitalizados permanecem na conferência visual. Páginas complementares, incluindo jornada, exigem revisão visual.
- Cada complemento exige campo, valor, fonte, justificativa e confirmação de identidade. O XML original permanece no dossiê. A confirmação é operacional; não há validação criptográfica da assinatura XML nesta etapa.
- Código IOB é separado da matrícula eSocial. Não há alteração automática dos mapeamentos usados pelos apontamentos.

## Conservação do trabalho

Os dados ficam em memória por usuário, sem envio ao Firestore ou a serviços externos. A navegação interna preserva o dossiê; logout limpa a memória. Baixe o dossiê antes de encerrar a sessão. Ao recarregar/fechar a página com alterações, o navegador é solicitado a exibir seu aviso padrão.

O JSON contém XMLs e complementos. Ao reabrir, os hashes dos XMLs são conferidos e a consolidação é recalculada. Hash serve para integridade do arquivo, não para autenticar sua origem. Para PDFs, o JSON guarda apenas nome, tamanho e hash; preserve o PDF original e reabra-o quando necessário.

Limites: 10 MB por XML, 200 XMLs, 5.000 eventos por XML, 20 MB de texto XML no conjunto, até 25 MB de dossiê na adição de fontes; reabertura de JSON até 30 MB; PDF até 15 MB. Dossiês contêm dados pessoais e devem ser guardados em local apropriado do escritório.

## Saídas e limite de compatibilidade

- **Baixar dossiê**: continuar a conferência neste aplicativo.
- **Baixar conferência CSV**: revisão dos campos, origens, avisos e pendências; não é formato de cadastro IOB. Fórmulas em células são neutralizadas.
- **Cadastro IOB (TXT, Excel e XML)**: gerado no modal *Unificar XML + PDF e gerar cadastro IOB* (seção abaixo). O TXT de 40 posições continua exclusivo dos lançamentos mensais e não cria empregados.

**Qual IOB:** a rotina *Importação de Funcionários/Base de Cálculo* pertence ao **IOB Gestão Contábil**. No **IOB Office Folha de Pagamento** (verificado na instalação da 2XR, release R2026.08.20, em 25/09/2026) o menu Utilitários > Importações traz apenas RAIS, SEFIP, Ponto, Valores e Digitação Diária — nenhuma importa cadastro. Para quem usa o Office, o TXT cadastral não tem destino e o Excel é o roteiro de digitação; os layouts oficiais de importação de ponto estão em `services/folha/layoutCadastroIob.ts` e no exportador de apontamento.

Para concluir a integração é necessário validar o TXT cadastral em base de teste da IOB, comparando a tela "Layout" da rotina Importação de Funcionários/Base de Cálculo com a aba "Layout TXT" do Excel gerado. A leitura dos XMLs e complementos já pode ser avaliada sem esse contrato.

## Carga de cadastro no IOB Office: a rota GDRAIS 2009

Levantamento feito na instalação da 2XR (IOB Office Folha de Pagamento, release
R2026.08.20) em 25/09/2026, com as telas do sistema.

*Utilitários > Importações* oferece cinco rotinas: RAIS, SEFIP, Ponto, Valores e
Digitação Diária. Quatro delas são movimento. A **Importação de Dados da RAIS2009
— (Engenharia Reversa)** é a única que carrega cadastro, e o aviso "Informações
Iniciais" da própria rotina diz o que ela espera:

> "importar para o Sistema, os dados contidos no arquivo gerado pelo sistema
> **GDRAIS 2009**, utilizando o método de Engenharia reversa (…) selecionando em
> seguida um **código de Empresa que ainda não exista no Sistema**."

Duas consequências, e elas definem o caso de uso:

1. **O formato é o arquivo de entrega do GDRAIS 2009** — o declarador do governo,
   não um layout proprietário da IOB. Está congelado desde 2009: é um alvo
   parado, diferente do TXT cadastral do Gestão Contábil. A RAIS ter sido
   extinta pelo eSocial não atrapalha, porque nada é declarado — o arquivo é só
   o veículo.
2. **A rotina CRIA uma empresa nova.** Ela não injeta vínculo em empresa
   existente; exige um código ainda não usado, lista as empresas encontradas no
   arquivo e monta a base. Por isso ela também não tem como sobrescrever
   cadastro que já está lá.

Logo:

- **Admissão avulsa em empresa já cadastrada** (o caso que motivou esta
  investigação): a rota RAIS não serve — criaria a empresa em duplicidade, e o
  IOB Office não tem transferência de funcionários entre empresas. A ficha se
  digita, usando o Excel deste módulo como roteiro.
- **Implantação de cliente novo**: é exatamente onde ela encaixa. Um arquivo no
  formato GDRAIS 2009 cria a empresa e todos os vínculos de uma vez, que é o
  problema que este módulo existe para resolver.

### Dois layouts de RAIS, e como saber qual é o certo

Transcrição em `services/implantacao/layoutRais.ts`. Existem dois, e eles não
são intercambiáveis:

| Layout | Registro | O que é |
|---|---|---|
| **GDRAIS Genérico 1976-2022** | **461 posições** | declarador mantido para anos-base anteriores, 2009 incluído — o candidato para a rotina da IOB |
| Anual ano-base 2022 | 584 posições | guardado como contraponto |

**Como decidir sem adivinhar:** o comprimento da linha denuncia o layout. Num
arquivo RAIS real, linha de 461 = genérico, 584 = anual. Um `wc -L` em qualquer
arquivo antigo do escritório responde, e é o teste que falta.

### O que a RAIS carrega, e o que ela não carrega

Transcrição em `services/implantacao/layoutRais.ts`, a partir do layout
**ano-base 2022** do MTE (⚠ a IOB pede o **2009**; entre um e outro a RAIS
ganhou campos, então as posições daquele arquivo não servem para gerar — a
estrutura, sim, é a mesma desde sempre).

O arquivo é texto, todos os registros com 584 posições: TIPO-0 (responsável),
TIPO-1 (estabelecimento), TIPO-2 (um por vínculo) e TIPO-9 (totais).

Do registro TIPO-2, o módulo já tem fonte para: PIS, nome, nascimento,
nacionalidade, grau de instrução, CPF, CTPS e série, admissão, tipo de
admissão, salário contratual, tipo de salário, horas semanais, CBO, vínculo,
raça/cor, sexo, município do local de trabalho, categoria e **matrícula** —
este último com 30 posições alfanuméricas, onde a matrícula do eSocial cabe
inteira, o que resolve o atrito de largura que o TXT cadastral tinha.

As tabelas de código da RAIS são próprias: nacionalidade, grau de instrução,
raça/cor, tipo de admissão e vínculo não coincidem com as do eSocial, e sexo é
1/2 na RAIS contra M/F no eSocial. Vale o mesmo cuidado dos de/para em
`services/folha/layoutCadastroIob.ts`.

**A RAIS não tem** endereço do trabalhador, filiação, estado civil, e-mail,
telefone, identidade, naturalidade nem registro de dependentes. Mesmo com a
rota funcionando, esses campos continuam na digitação — a carga resolve a
identificação e o contrato, não a ficha inteira.

No **genérico** a lista de ausências é maior: ele também não tem nacionalidade,
grau de instrução, raça/cor nem município do local de trabalho. Sobram PIS,
nome, nascimento, CPF, CTPS e série, admissão, tipo de admissão, salário, tipo
de salário, horas semanais, CBO, vínculo, deficiência, sexo, matrícula e
categoria — o núcleo de identificação e contrato.

**Pendente para implementar:** o layout do arquivo do GDRAIS 2009. Enquanto ele
não for obtido e conferido contra um arquivo real, nada é gerado — chutar
posição foi o que produziu o TXT de 781 posições que a IOB leu sem importar
nada.

## Validação

`npm test` cobre o comportamento existente e o novo parser/consolidador, além de importação, complementação e navegação da interface. A amostra real fornecida foi verificada localmente, sem incluí-la no repositório. Os testes versionados usam dados fictícios.

O build Vite é a checagem usada pelo pipeline existente. Há falhas TypeScript anteriores em outros módulos e dependências do backend; esta mudança não as corrige nem modifica regras Firebase/Functions.

Referência consultada para os caminhos S-2200/S-2205/S-2206: https://www.gov.br/esocial/pt-br/documentacao-tecnica/leiautes-esocial-v-1.3

## Fluxo unificado (2.3.0)

A área Folha oferece Primeiro acesso — implantação cadastral e Rotina mensal — apontamentos. O componente ExportacaoIobModal é compartilhado pelos dois fluxos. O modo mensal mantém o exportador de 40 posições e suas validações. O modo cadastral gera um pacote de conferência (`importavelIob: false`) com identidades, dados, origens, pendências e hashes, sem lançamentos, referências ou valores de apontamento. Salário contratual continua no cadastro. O pacote não deve ser aberto como dossiê.

PDF: até 30 páginas, limite de 45 segundos, um funcionário por arquivo. Dados pessoais dos exemplos não são versionados. Testes usam dados fictícios e cobrem identidade, colunas do PDF, campos vazios, divergências, confirmação, modal e admissão retificadora provisória. Node.js 22.13+ é necessário para a versão atual do PDF.js; o pipeline usa Node 22.

## Cadastro IOB: unificação automática e exportação (2.4.0)

O botão **Unificar XML + PDF e gerar cadastro IOB** (painel de implantação e modo cadastral do modal de exportação) abre o modal `CadastroIobModal`. Ele recebe, em uma única seleção, os XMLs do eSocial e as fichas PDF "Registro de Empregado", e:

- adiciona os XMLs ao dossiê pelo mesmo fluxo de `lerXml`/`consolidar`;
- lê cada PDF localmente (`lerFichaPdf`) e o une ao vínculo cuja identidade confere (CNPJ completo, CPF válido e matrícula eSocial, via `conferirIdentidade`). Fichas sem correspondência ficam listadas com o motivo. Uma segunda ficha para o mesmo vínculo é ignorada com aviso;
- mantém o XML como fonte principal: campos ausentes são preenchidos pela ficha (origem com nome e hash do PDF); divergências XML × PDF são listadas por campo e viram pendência, sem substituição automática;
- permite registrar os complementos da ficha no dossiê (`complementosDaUnificacao`), com justificativa padrão de identidade conferida;
- exporta três saídas, todas sem eventos, referências ou valores de apontamento:
  1. **TXT de cadastro** para *Folha de Pagamento > Utilitários > Importação de Funcionários/Base de Cálculo*. O layout é dado (`services/implantacao/layoutCadastroIob.ts`, `LAYOUT_PADRAO`): ordem, tamanho, tipo (alfanumérico, numérico, data, valor decimal), constantes e preenchimentos em branco são editáveis no modal, salvos por usuário no navegador e exportáveis em JSON. Convenções da documentação IOB: numéricos à direita com zeros, alfanuméricos à esquerda sem acentos, decimais implícitos, ANSI, CRLF. O padrão está marcado como **não homologado** até ser validado em base de teste; a matrícula eSocial é o código do funcionário e nunca é truncada (erro explícito).
  2. **Excel de cadastro** (`template-cadastro-iob-sage-<CNPJ>.xlsx`), no mesmo espírito do modelo de apontamentos: aba *Funcionários* com uma coluna por campo do layout, *Dependentes* (do XML), *Origem dos campos*, *Pendências*, *Layout TXT* (posições) e *Instruções*. A aba *Layout TXT* pode ser reimportada no editor.
  3. **XMLs S-2200 (ZIP)**: o evento original é extraído do envelope `retornoEventoCompleto`, com assinatura, um arquivo por vínculo, para a rotina "Importação de Dados por XML" da IOB Gestão Contábil (eventos S-2200/S-2300/S-1030), quando disponível na versão instalada.

Referências consultadas: IOB Gestão Contábil, ajuda on-line das rotinas "Importação de Funcionários/Base de Cálculo" (layouts de funções e dependentes, regras de preenchimento) e "Importação de Dados por XML". O conteúdo integral das páginas de layout não pôde ser reproduzido no ambiente de desenvolvimento; por isso o layout é configurável e a homologação depende do teste na SAGE.

Novos campos cadastrais lidos da ficha: Função, Horário de trabalho e Horário de intervalo. Testes: `services/implantacao/__tests__/unificacaoAutomatica.test.ts`, `layoutCadastroIob.test.ts`, `modeloCadastroExcel.test.ts`, `zip.test.ts` e `cadastroIobModal.test.tsx`, com dados fictícios.
