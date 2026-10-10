# XSDs do eSocial (pré-voo)

Esquemas oficiais do leiaute **S-1.3** do eSocial (`v_S_01_03_00`), usados pelo pré-voo do Consultor DP
(`services/esocial/validadorXsd.ts`) para validar cada evento no navegador antes da transmissão.

- Origem: pacote de XSDs da documentação técnica do eSocial (gov.br), na distribuição do projeto
  `nfephp-org/sped-esocial` (licença MIT/LGPL/GPL), sem alteração.
- Troca de leiaute: copiar a nova pasta `v_S_xx_yy_zz`, mudar `VERSAO_XSD` em `validadorXsd.ts` e rodar os
  testes (`services/esocial/__tests__/saudeEsocial.test.ts`).
