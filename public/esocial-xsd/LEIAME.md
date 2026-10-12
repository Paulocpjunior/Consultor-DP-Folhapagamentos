# XSDs do eSocial (pré-voo)

Esquemas oficiais do leiaute **S-1.3** do eSocial (`v_S_01_03_00`), usados pelo pré-voo do Consultor DP
(`services/esocial/validadorXsd.ts`) para validar cada evento no navegador antes da transmissão.

- Origem: pacote de XSDs da documentação técnica do eSocial (gov.br), na distribuição do projeto
  `nfephp-org/sped-esocial` (licença MIT/LGPL/GPL), sem alteração.
- Pacotes por data de implantação (12/10/2026): dentro do mesmo leiaute, o gov.br publica um pacote para cada
  etapa (NT 07/2026 rev.: 26/10, 23/11 e 14/12/2026 e 18/01/2027). Cada um fica em `v_S_01_03_00_AAAA-MM-DD`, com
  **só os arquivos que mudaram** em relação ao pacote anterior, sem alteração; o resto vem do anterior. O manifesto
  (`PACOTES_XSD` em `validadorXsd.ts`) diz a data de produção, a da produção restrita e os arquivos de cada pacote; o
  pré-voo usa o pacote da data do envio, no ambiente do lote. Pacote novo: baixar o zip da documentação técnica,
  copiar só os arquivos diferentes e acrescentar a entrada no manifesto (o teste confere que os arquivos existem).
- Troca de leiaute: copiar a nova pasta `v_S_xx_yy_zz`, mudar `VERSAO_XSD` em `validadorXsd.ts` e rodar os
  testes (`services/esocial/__tests__/saudeEsocial.test.ts`).
