# Implantação de funcionários: etapa de conferência

Acesse Folha > Implantação de funcionários. Informe CNPJ e data da implantação, adicione XMLs e abra cada ficha. O módulo aceita S-2200, S-2205, S-2206, S-2299 e S-3000 nas versões S-1.0 a S-1.3, inclusive envelopes `retornoEventoCompleto`. Outros eventos geram aviso e não são consolidados.

## Comportamento

- Cada vínculo é separado por raiz do CNPJ, CPF e matrícula eSocial; códigos alfanuméricos e zeros iniciais são preservados. O estabelecimento aparece como campo separado.
- Arquivos idênticos não são adicionados novamente. Mesmo ID com conteúdo diferente gera conflito.
- A consolidação usa a data de implantação, as alterações cadastrais e contratuais, retificações e exclusões com recibo associado. Eventos futuros não são aplicados.
- XML sem recibo pode fornecer dados para conferência, mas permanece com pendência de aceitação. Retificações/exclusões precisam do recibo alvo e de retorno 201; retornos rejeitados não alimentam o cadastro.
- Cadeias inconsistentes, concorrentes ou cíclicas não são aplicadas automaticamente. Arquivos não suportados, afastamentos, sucessões, reintegrações e demais históricos específicos exigem revisão; este módulo não conclui a situação completa da folha.
- S-2205 mantém nascimento do S-2200 e substitui o bloco cadastral aplicável; S-2206 mantém admissão e substitui o bloco contratual aplicável. Dependentes, deficiência e endereço no exterior são exibidos como dados estruturados do XML.
- `dtEf` é tratado como informação de efeitos remuneratórios para revisão. Não antecipa todos os campos do contrato; esta etapa não calcula retroativos.
- PDF é visualizado localmente. Não há OCR automático nesta etapa. Confira empregador, CPF e vínculo antes de registrar complementos.
- Cada complemento exige campo, valor, fonte, justificativa e confirmação de identidade. O XML original permanece no dossiê. A confirmação é operacional; não há validação criptográfica da assinatura XML nesta etapa.
- Código IOB é separado da matrícula eSocial. Não há alteração automática dos mapeamentos usados pelos apontamentos.

## Conservação do trabalho

Os dados ficam em memória por usuário, sem envio ao Firestore ou a serviços externos. A navegação interna preserva o dossiê; logout limpa a memória. Baixe o dossiê antes de encerrar a sessão. Ao recarregar/fechar a página com alterações, o navegador é solicitado a exibir seu aviso padrão.

O JSON contém XMLs e complementos. Ao reabrir, os hashes dos XMLs são conferidos e a consolidação é recalculada. Hash serve para integridade do arquivo, não para autenticar sua origem. Para PDFs, o JSON guarda apenas nome, tamanho e hash; preserve o PDF original e reabra-o quando necessário.

Limites: 10 MB por XML, 200 XMLs, 5.000 eventos por XML, 20 MB de texto XML no conjunto, até 25 MB de dossiê na adição de fontes; reabertura de JSON até 30 MB; PDF até 15 MB. Dossiês contêm dados pessoais e devem ser guardados em local apropriado do escritório.

## Saídas e limite de compatibilidade

- **Baixar dossiê**: continuar a conferência neste aplicativo.
- **Baixar conferência CSV**: revisão dos campos, origens, avisos e pendências; não é formato de cadastro IOB. Fórmulas em células são neutralizadas.
- **Exportação cadastral IOB**: ainda não implementada/homologada. O layout existente no repositório é de lançamentos mensais, com 40 posições. Não deve ser utilizado para criar empregados.

Para concluir a integração é necessário obter o layout da rotina cadastral da linha IOB SAGE FOLHAMATIC efetivamente utilizada e validar um arquivo em base de teste. A leitura dos XMLs e complementos já pode ser avaliada sem esse contrato.

## Validação

`npm test` cobre o comportamento existente e o novo parser/consolidador, além de importação, complementação e navegação da interface. A amostra real fornecida foi verificada localmente, sem incluí-la no repositório. Os testes versionados usam dados fictícios.

O build Vite é a checagem usada pelo pipeline existente. Há falhas TypeScript anteriores em outros módulos e dependências do backend; esta mudança não as corrige nem modifica regras Firebase/Functions.

Referência consultada para os caminhos S-2200/S-2205/S-2206: https://www.gov.br/esocial/pt-br/documentacao-tecnica/leiautes-esocial-v-1.3
