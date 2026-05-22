// services/folha/folhaTypes.ts
// Tipos do módulo Folha (Eventos IOB SAGE + Apontamento IRB-GROUP)

/** Tipos de evento no IOB SAGE */
export type TipoEvento = 'V' | 'D'; // V=Vencimento, D=Desconto
export type ReferenciaValor = 'R' | 'V'; // R=Referência, V=Valor

/** Incidências de um evento (S=Sim, N=Não) */
export interface IncidenciasEvento {
    ir: 'S' | 'N';  // IRRF
    in: 'S' | 'N';  // INSS
    irf: 'S' | 'N'; // IRRF s/ Férias
    inf: 'S' | 'N'; // INSS s/ Férias
    fg: 'S' | 'N';  // FGTS
    rt: 'S' | 'N';  // Rendimento Tributável
    vr: 'S' | 'N';  // Vencimento RAIS
}

/** Um evento do catálogo IOB SAGE FOLHAMATIC */
export interface EventoIobSage {
    codigo: string;           // 4 dígitos
    descricao: string;
    tipo: TipoEvento;
    incidencias: IncidenciasEvento;
    rv: ReferenciaValor;
    coeficiente: number;
    ro: string;               // rotina de cálculo (3 dígitos)
}

/** Catálogo completo */
export interface CatalogoEventos {
    $schema?: string;
    cliente: string;
    empresa: string;
    origem_pdf?: string;
    total_eventos: number;
    total_vencimentos: number;
    total_descontos: number;
    legenda: {
        tp: Record<string, string>;
        rv: Record<string, string>;
        incidencias: Record<string, string>;
        ro: Record<string, string>;
    };
    eventos: EventoIobSage[];
}

/** Seleção de eventos por cliente */
export interface SelecaoEventos {
    cliente: string;
    codigos: string[];
    atualizadoEm: string;
    total: number;
}

// ─── Apontamento de Folha ───────────────────────────────────────────────

/** Regra de mapeamento de uma coluna para um evento */
export interface RegraColuna {
    evento: string;
    descricao_evento: string;
    tipo: TipoEvento;
    rv: ReferenciaValor;
    ignorar_se_zero?: boolean;
    nota?: string;
}

/** Regra condicional baseada em OBS */
export interface RegraObs {
    quando_obs_contem: string[];
    evento: string;
    descricao_evento: string;
    tipo: TipoEvento;
    rv: ReferenciaValor;
}

/**
 * Regra do evento de SALÁRIO. Diferente das regras de coluna, este lançamento
 * é gerado para todo funcionário presente na planilha — a referência é
 * QUANTIDADE DE DIAS (mensalista) ou HORAS (horista).
 * O IOB calcula vencimento a partir do Salário Base do cadastro × REF.
 *
 * - `coluna_dias` (opcional): coluna do apontamento contendo dias/horas
 *   (proporcionais p/ admissão, afastamento, rescisão; ou horas trabalhadas
 *   no caso de horistas).
 * - `dias_padrao`: usado quando `coluna_dias` não existe ou está vazia
 *   (mês cheio = 30).
 * - `ignorar_se_dias_zero`: pula o lançamento se a referência calculada for 0.
 * - `ignorar_se_coluna_nao_numerica`: pula o lançamento quando a célula da
 *   `coluna_dias` contém texto não-numérico (ex.: "mensalista" no INPLAF).
 *   Útil para clientes em que mensalistas NÃO devem exportar o evento de
 *   salário (IOB calcula sozinho do cadastro), apenas horistas.
 */
export interface RegraSalario {
    evento: string;
    descricao_evento: string;
    coluna_dias?: string;
    dias_padrao: number;
    ignorar_se_dias_zero?: boolean;
    ignorar_se_coluna_nao_numerica?: boolean;
}

/** Mapeamento completo do apontamento por cliente */
export interface MapeamentoApontamento {
    $schema?: string;
    cliente: string;
    empresa_base: string;
    competencia_default?: string;
    observacoes?: string[];
    empresas: Record<string, { codigo_sage: string; ativa: boolean }>;
    mapeamento_colunas: Record<string, RegraColuna>;
    regras_descontos_empresa: {
        coluna: string;
        campo_obs: string;
        evento_padrao: RegraColuna;
        regras: RegraObs[];
    };
    /**
     * Regra do evento de salário. `null` (explícito) desativa a geração — útil
     * para clientes onde o SAGE calcula salário do cadastro do funcionário.
     * `undefined` (omitido) faz `getMapeamento` aplicar o default migrando o doc.
     */
    regra_salario?: RegraSalario | null;
    /**
     * Tabela de valor-hora-aula por matrícula (R$/hora). Quando presente,
     * o pós-processador `aplicarValorHoraAulaEducati` converte lançamentos
     * do evento 0033 HORA AULA (rv=R, horas) em rv=V (valor em R$)
     * multiplicando: `valor = horas × valoresHoraAula[matricula]`.
     * Específico para clientes com hora-aula variável por professor.
     */
    valoresHoraAula?: Record<string, number>;
    matriculas: Record<string, Record<string, string>>;
}

/** Funcionário extraído da planilha */
export interface FuncionarioApontamento {
    nome: string;
    celulas: Record<string, unknown>;
    obs: string | null;
}

/** Empresa (sheet) extraída da planilha */
export interface EmpresaApontamento {
    nome: string;
    colunas: string[];
    funcionarios: FuncionarioApontamento[];
}

/** Resultado do parser do xlsx */
export interface ApontamentoParseado {
    parser: string;
    versao: string;
    processado_em: string;
    empresas: EmpresaApontamento[];
}

/** Lançamento gerado após aplicar o mapeamento */
export interface Lancamento {
    empresa: string;
    codigoSage: string;
    funcionario: string;
    matricula: string | null;
    coluna: string;
    evento: string;
    descricao_evento: string;
    tipo: TipoEvento;
    rv: ReferenciaValor;
    valor: number;
    origem: 'coluna' | 'obs' | 'padrao' | 'salario';
    obs?: string | null;
}

/** Resultado do mapeamento */
export interface ResultadoMapeamento {
    lancamentos: Lancamento[];
    alertas: string[];
}

/** Registro de exportação no histórico */
export interface HistoricoExportacao {
    cliente: string;
    competencia: string;
    timestamp: string;
    totalLancamentos: number;
    totaisPorEmpresa: Record<string, {
        funcionarios: number;
        lancamentos: number;
        valorTotal: number;
    }>;
    alertas: string[];
}
