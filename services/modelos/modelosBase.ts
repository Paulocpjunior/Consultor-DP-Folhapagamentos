// services/modelos/modelosBase.ts
//
// Modelos-base do Consultor (os textos mais usados no DP). Ficam sempre disponíveis; para mudar, o usuário
// salva uma cópia (do escritório ou da empresa) e edita. Os importados do backup do SAGE entram ao lado.

import type { ModeloDocumento } from './modelos';

type Base = Pick<ModeloDocumento, 'id' | 'titulo' | 'categoria' | 'corpo'>;

const PARTES = `EMPREGADORA: {{empresa.razaoSocial}}, inscrita no CNPJ sob o nº {{empresa.cnpj}}.

EMPREGADO(A): {{funcionario.nome}}, {{funcionario.nacionalidade}}, {{funcionario.estadoCivil}}, nascido(a) em {{funcionario.nascimento}}, portador(a) do CPF nº {{funcionario.cpf}}, RG {{funcionario.rg}}, CTPS {{funcionario.ctps}}, PIS {{funcionario.pis}}, residente em {{funcionario.endereco}}.`;

const LOCAL = '{{digitado.cidade}}, {{data.extenso}}.';

export const MODELOS_BASE: Base[] = [
    {
        id: 'base-contrato-experiencia', categoria: 'contrato', titulo: 'Contrato de experiência',
        corpo: `# CONTRATO INDIVIDUAL DE TRABALHO POR PRAZO DETERMINADO (EXPERIÊNCIA)

${PARTES}

As partes acima celebram o presente contrato de experiência, nos termos dos artigos 443, § 2º, alínea "c", e 445, parágrafo único, da CLT, mediante as cláusulas seguintes.

## Cláusula 1ª – Função

O(A) EMPREGADO(A) é admitido(a) em {{contrato.admissao}} para exercer a função de {{contrato.cargo}} (CBO {{contrato.cbo}}), obrigando-se a prestar também os serviços compatíveis com sua condição pessoal que lhe forem determinados.

## Cláusula 2ª – Remuneração

A remuneração será de {{contrato.salario}} ({{contrato.salarioExtenso}}) por mês, paga até o 5º dia útil do mês seguinte ao vencido, sujeita aos descontos legais.

## Cláusula 3ª – Jornada

A jornada será de {{contrato.horasSemanais}} horas semanais, no horário {{contrato.jornada}}, podendo ser compensada ou prorrogada na forma da lei e do acordo coletivo.

## Cláusula 4ª – Prazo

Este contrato vigora por {{contrato.diasExperiencia}} dias, de {{contrato.admissao}} a {{contrato.fimExperiencia}}, podendo ser prorrogado uma única vez, desde que a soma dos dois períodos não ultrapasse 90 (noventa) dias. Vencido o prazo sem manifestação das partes, passa a vigorar por prazo indeterminado.

## Cláusula 5ª – Descontos e danos

Em caso de dano causado pelo(a) EMPREGADO(A), fica a EMPREGADORA autorizada a efetuar o desconto da importância correspondente, nos termos do art. 462, § 1º, da CLT.

## Cláusula 6ª – Regulamento

O(A) EMPREGADO(A) declara conhecer e se compromete a cumprir o regulamento interno da EMPREGADORA.

E, por estarem de acordo, assinam este instrumento em duas vias de igual teor, na presença de duas testemunhas.

${LOCAL}

{{assinaturas}}`,
    },
    {
        id: 'base-prorrogacao-experiencia', categoria: 'termo', titulo: 'Termo de prorrogação da experiência',
        corpo: `# TERMO DE PRORROGAÇÃO DO CONTRATO DE EXPERIÊNCIA

${PARTES}

As partes resolvem prorrogar o contrato de experiência celebrado em {{contrato.admissao}}, que passa a vigorar até {{contrato.fimProrrogacao}}, totalizando 90 (noventa) dias, nos termos do art. 445, parágrafo único, da CLT. Permanecem inalteradas as demais cláusulas do contrato.

${LOCAL}

{{assinaturas}}`,
    },
    {
        id: 'base-advertencia', categoria: 'disciplinar', titulo: 'Advertência disciplinar',
        corpo: `# ADVERTÊNCIA DISCIPLINAR

Ao(À) Sr.(a) {{funcionario.nome}}, CPF {{funcionario.cpf}}, função {{contrato.cargo}}.

Pela presente, fica V.Sa. advertido(a) em razão do seguinte fato: {{digitado.motivo}}, ocorrido em {{digitado.data}}.

Esclarecemos que a repetição de faltas desta natureza poderá ensejar a aplicação de penalidades mais severas, inclusive a rescisão do contrato de trabalho por justa causa, nos termos do art. 482 da CLT.

${LOCAL}

{{empresa.razaoSocial}}

Ciente do(a) empregado(a). Em caso de recusa em assinar, as testemunhas abaixo confirmam a leitura e a entrega desta advertência.

{{assinaturas}}`,
    },
    {
        id: 'base-suspensao', categoria: 'disciplinar', titulo: 'Suspensão disciplinar',
        corpo: `# SUSPENSÃO DISCIPLINAR

Ao(À) Sr.(a) {{funcionario.nome}}, CPF {{funcionario.cpf}}, função {{contrato.cargo}}.

Comunicamos que V.Sa. está suspenso(a) de suas atividades por {{digitado.dias}} dia(s), a partir de {{digitado.data}}, em razão do seguinte fato: {{digitado.motivo}}.

Os dias de suspensão não serão remunerados e serão descontados, com reflexo no descanso semanal remunerado. Lembramos que a reincidência poderá ensejar a rescisão do contrato de trabalho por justa causa (art. 482 da CLT). A suspensão não poderá ser superior a 30 dias consecutivos (art. 474 da CLT).

${LOCAL}

{{empresa.razaoSocial}}

Ciente do(a) empregado(a). Em caso de recusa em assinar, as testemunhas abaixo confirmam a leitura e a entrega desta comunicação.

{{assinaturas}}`,
    },
    {
        id: 'base-aviso-previo-empregador', categoria: 'desligamento', titulo: 'Aviso prévio do empregador',
        corpo: `# AVISO PRÉVIO DO EMPREGADOR

Ao(À) Sr.(a) {{funcionario.nome}}, CPF {{funcionario.cpf}}, admitido(a) em {{contrato.admissao}}, função {{contrato.cargo}}.

Comunicamos que, a partir desta data, V.Sa. está em aviso prévio, nos termos do art. 487 da CLT e da Lei nº 12.506/2011, sendo o último dia de trabalho {{digitado.data}}.

Durante o aviso trabalhado, V.Sa. poderá optar pela redução de 2 (duas) horas diárias, sem prejuízo do salário, ou pela ausência por 7 (sete) dias corridos ao final do prazo (art. 488 da CLT). Opção: (  ) redução de 2 horas diárias   (  ) 7 dias corridos.

Solicitamos o comparecimento para a homologação e o recebimento das verbas rescisórias no prazo do art. 477, § 6º, da CLT.

${LOCAL}

{{empresa.razaoSocial}}

{{assinaturas}}`,
    },
    {
        id: 'base-pedido-demissao', categoria: 'desligamento', titulo: 'Pedido de demissão',
        corpo: `# PEDIDO DE DEMISSÃO

À {{empresa.razaoSocial}}, CNPJ {{empresa.cnpj}}.

Eu, {{funcionario.nome}}, CPF {{funcionario.cpf}}, admitido(a) em {{contrato.admissao}} na função de {{contrato.cargo}}, venho por meio desta comunicar o meu pedido de demissão do emprego, por motivos particulares.

Quanto ao aviso prévio (art. 487 da CLT): (  ) cumprirei o aviso prévio de 30 dias   (  ) solicito a dispensa do cumprimento do aviso prévio, ciente do desconto correspondente, salvo se a empresa dispensar.

${LOCAL}

{{assinaturas}}`,
    },
    {
        id: 'base-acordo-484a', categoria: 'desligamento', titulo: 'Termo de extinção do contrato por acordo (art. 484-A)',
        corpo: `# TERMO DE EXTINÇÃO DO CONTRATO DE TRABALHO POR ACORDO

${PARTES}

As partes, de comum acordo e por livre manifestação de vontade, extinguem o contrato de trabalho iniciado em {{contrato.admissao}}, na função de {{contrato.cargo}}, com último dia de trabalho em {{digitado.data}}, nos termos do art. 484-A da CLT, com as consequências abaixo, das quais o(a) EMPREGADO(A) declara ciência:

1. São devidos pela metade o aviso prévio, se indenizado, e a indenização sobre o saldo do FGTS, de 20% (art. 484-A, I, e art. 18, § 1º, da Lei nº 8.036/1990).

2. São devidas integralmente as demais verbas trabalhistas: saldo de salário, 13º salário proporcional e férias vencidas e proporcionais, com o terço constitucional (art. 484-A, II).

3. O(A) EMPREGADO(A) poderá movimentar até 80% do saldo da sua conta vinculada do FGTS (art. 484-A, § 1º).

4. A extinção do contrato por acordo não autoriza o ingresso no Programa de Seguro-Desemprego (art. 484-A, § 2º).

As verbas rescisórias serão pagas até 10 (dez) dias contados do término do contrato (art. 477, § 6º, da CLT), conforme o Termo de Rescisão do Contrato de Trabalho.

${LOCAL}

{{assinaturas}}`,
    },
    {
        id: 'base-aviso-previo-indenizado', categoria: 'desligamento', titulo: 'Aviso prévio indenizado',
        corpo: `# AVISO PRÉVIO INDENIZADO

Ao(À) Sr.(a) {{funcionario.nome}}, CPF {{funcionario.cpf}}, admitido(a) em {{contrato.admissao}}, função {{contrato.cargo}}.

Comunicamos que, por iniciativa da empresa e sem justa causa, o seu contrato de trabalho fica rescindido em {{digitado.data}}, último dia de trabalho, ficando V.Sa. dispensado(a) do cumprimento do aviso prévio, que será indenizado nos termos do art. 487, § 1º, da CLT e da Lei nº 12.506/2011 (30 dias, acrescidos de 3 dias por ano completo de serviço, até 90 dias).

O período do aviso prévio indenizado integra o tempo de serviço para todos os efeitos legais, inclusive para o 13º salário e as férias proporcionais (art. 487, § 1º, da CLT).

As verbas rescisórias serão pagas até 10 (dez) dias contados do término do contrato (art. 477, § 6º, da CLT), conforme o Termo de Rescisão do Contrato de Trabalho.

${LOCAL}

{{empresa.razaoSocial}}

{{assinaturas}}`,
    },
    {
        id: 'base-termino-contrato', categoria: 'desligamento', titulo: 'Aviso de término do contrato de experiência',
        corpo: `# AVISO DE TÉRMINO DO CONTRATO DE EXPERIÊNCIA

Ao(À) Sr.(a) {{funcionario.nome}}, CPF {{funcionario.cpf}}, admitido(a) em {{contrato.admissao}}, função {{contrato.cargo}}.

Comunicamos que o seu contrato de trabalho por prazo determinado (experiência), firmado nos termos do art. 443, § 2º, "c", e do art. 445, parágrafo único, da CLT, não será prorrogado nem convertido em contrato por prazo indeterminado, encerrando-se no termo final ajustado, em {{contrato.fimContrato}}.

Por se tratar do término normal do prazo contratado, não há aviso prévio nem a indenização do art. 479 da CLT. Serão pagos o saldo de salário, o 13º salário proporcional e as férias proporcionais com o terço constitucional, até 10 (dez) dias contados do término do contrato (art. 477, § 6º, da CLT).

${LOCAL}

{{empresa.razaoSocial}}

{{assinaturas}}`,
    },
    {
        id: 'base-termino-antecipado-empregador', categoria: 'desligamento', titulo: 'Aviso de término antecipado do contrato de experiência (pelo empregador)',
        corpo: `# AVISO DE TÉRMINO ANTECIPADO DO CONTRATO DE EXPERIÊNCIA PELO EMPREGADOR

Ao(À) Sr.(a) {{funcionario.nome}}, CPF {{funcionario.cpf}}, admitido(a) em {{contrato.admissao}}, função {{contrato.cargo}}.

Comunicamos que a empresa, por sua iniciativa e sem justa causa, encerra antecipadamente o seu contrato de trabalho por prazo determinado (experiência), cujo término estava previsto para {{contrato.fimContrato}}, sendo o último dia de trabalho {{digitado.data}}.

Nos termos do art. 479 da CLT, V.Sa. receberá, a título de indenização, metade da remuneração a que teria direito até o termo do contrato, além do saldo de salário, do 13º salário proporcional, das férias proporcionais com o terço constitucional e da indenização de 40% sobre o saldo do FGTS, com o saque da conta vinculada.

Se o contrato tiver a cláusula assecuratória do direito recíproco de rescisão antecipada, aplicam-se, em lugar do art. 479, as regras do aviso prévio (art. 481 da CLT).

As verbas rescisórias serão pagas até 10 (dez) dias contados do término do contrato (art. 477, § 6º, da CLT).

${LOCAL}

{{empresa.razaoSocial}}

{{assinaturas}}`,
    },
    {
        id: 'base-termino-antecipado-empregado', categoria: 'desligamento', titulo: 'Pedido de término antecipado do contrato de experiência (pelo empregado)',
        corpo: `# PEDIDO DE TÉRMINO ANTECIPADO DO CONTRATO DE EXPERIÊNCIA

À {{empresa.razaoSocial}}, CNPJ {{empresa.cnpj}}.

Eu, {{funcionario.nome}}, CPF {{funcionario.cpf}}, admitido(a) em {{contrato.admissao}} na função de {{contrato.cargo}}, por contrato de trabalho por prazo determinado (experiência) com término previsto para {{contrato.fimContrato}}, comunico a minha decisão de encerrá-lo antecipadamente, por motivos particulares, sendo o meu último dia de trabalho {{digitado.data}}.

Declaro estar ciente de que, nos termos do art. 480 da CLT, sou obrigado(a) a indenizar a empresa pelos prejuízos decorrentes da saída antecipada, em valor que não excederá a metade da remuneração a que teria direito até o termo do contrato (art. 480, § 1º), e que esse valor poderá ser descontado das minhas verbas rescisórias. Estou ciente também de que, neste caso, não há saque do FGTS nem a indenização de 40%.

Se o contrato tiver a cláusula assecuratória do direito recíproco de rescisão antecipada, aplicam-se, em lugar do art. 480, as regras do aviso prévio (art. 481 da CLT).

${LOCAL}

{{assinaturas}}`,
    },
    {
        id: 'base-justa-causa', categoria: 'desligamento', titulo: 'Comunicação de dispensa por justa causa',
        corpo: `# COMUNICAÇÃO DE DISPENSA POR JUSTA CAUSA

Ao(À) Sr.(a) {{funcionario.nome}}, CPF {{funcionario.cpf}}, admitido(a) em {{contrato.admissao}}, função {{contrato.cargo}}.

Comunicamos que, a partir de {{digitado.data}}, o seu contrato de trabalho fica rescindido por justa causa, nos termos do art. 482 da CLT, pelo seguinte motivo:

{{digitado.motivo}}

Na dispensa por justa causa são devidos apenas o saldo de salário e as férias vencidas com o terço constitucional, se houver; não há aviso prévio, 13º salário proporcional, férias proporcionais, indenização de 40% do FGTS nem saque da conta vinculada. As verbas serão pagas até 10 (dez) dias contados do término do contrato (art. 477, § 6º, da CLT).

${LOCAL}

{{empresa.razaoSocial}}

Recusando-se o(a) empregado(a) a assinar, a comunicação é assinada por duas testemunhas.

{{assinaturas}}`,
    },
    {
        id: 'base-declaracao-dependentes', categoria: 'declaracao', titulo: 'Declaração de dependentes (IRRF e salário-família)',
        corpo: `# DECLARAÇÃO DE DEPENDENTES

Eu, {{funcionario.nome}}, CPF {{funcionario.cpf}}, empregado(a) da {{empresa.razaoSocial}}, declaro, para fins de dedução do Imposto de Renda Retido na Fonte (Lei nº 9.250/1995) e de salário-família (Lei nº 8.213/1991), que possuo os dependentes abaixo:

1. Nome: ____________________________ CPF: ______________ Nascimento: ___/___/______ Parentesco: ______________

2. Nome: ____________________________ CPF: ______________ Nascimento: ___/___/______ Parentesco: ______________

3. Nome: ____________________________ CPF: ______________ Nascimento: ___/___/______ Parentesco: ______________

Declaro estar ciente de que os dependentes informados não são deduzidos por outro contribuinte e de que devo comunicar qualquer alteração. Assumo a responsabilidade pela veracidade das informações, sob as penas da lei.

${LOCAL}

{{assinaturas}}`,
    },
    {
        id: 'base-vale-transporte', categoria: 'declaracao', titulo: 'Opção ou desistência do vale-transporte',
        corpo: `# DECLARAÇÃO DE OPÇÃO PELO VALE-TRANSPORTE

Eu, {{funcionario.nome}}, CPF {{funcionario.cpf}}, residente em {{funcionario.endereco}}, empregado(a) da {{empresa.razaoSocial}}, declaro, nos termos da Lei nº 7.418/1985 e do Decreto nº 10.854/2021:

(  ) OPTO pela utilização do vale-transporte, autorizando o desconto de até 6% (seis por cento) do meu salário-base, conforme os trajetos abaixo:

Trajeto residência → trabalho: linhas/meios ______________________________ tarifa R$ ________

Trajeto trabalho → residência: linhas/meios ______________________________ tarifa R$ ________

(  ) NÃO OPTO pela utilização do vale-transporte.

Comprometo-me a atualizar estas informações sempre que houver mudança de endereço ou dos meios de transporte, ciente de que a declaração falsa ou o uso indevido constitui falta grave, nos termos da legislação do vale-transporte.

${LOCAL}

{{assinaturas}}`,
    },
];
