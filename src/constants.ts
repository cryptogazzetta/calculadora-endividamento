/**
 * =============================================================================
 * CONSTANTES E TABELAS DE REFERÊNCIA
 * =============================================================================
 *
 * Todas as constantes são parametrizáveis e atualizáveis.
 * Ver §9.4 do Modelo Decisório para frequência de revisão.
 */

import {
  Setor,
  Faixa,
  FaixaMetrica,
  MetricaId,
  CenarioId,
  ParametrosSetor,
  PremissasCenario,
} from './types';

// =============================================================================
// PREMISSAS DO MODELO (§9.1)
// =============================================================================

export const PREMISSAS = {
  /**
   * P1: Alíquota efetiva de impostos sobre EBITDA.
   * IRPJ 15% + adicional 10% + CSLL 9% = 34%.
   * Conservador: muitas empresas têm carga efetiva menor.
   */
  ALIQUOTA_EFETIVA: 0.34,

  /** Fator pós-imposto: 1 - 0.34 = 0.66 */
  FATOR_POS_IMPOSTO: 0.66,

  /**
   * P2: Prazo médio da dívida em anos.
   * Típico de debêntures e FIDC mid-market no Brasil.
   */
  PRAZO_MEDIO_DIVIDA_ANOS: 5,

  /** Amortização anual = 1 / prazo = 0.20 */
  AMORTIZACAO_ANUAL: 0.20,

  /**
   * P5: Taxa de juros default (CDI + 3%).
   * CDI ~11.25% + spread 3% = 14.25% a.a. (abril 2026).
   * Custo de dívida médio para PME-Middle com risco moderado.
   *
   * ATUALIZAR: Trimestralmente após decisão COPOM.
   */
  TAXA_JUROS_DEFAULT: 0.1425,

  /**
   * P8: Capex manutenção default como % da receita.
   * Média cross-industry para PME. Ajustado por setor na tabela SETORES.
   */
  CAPEX_DEFAULT_PCT: 0.03,

  /** Versão do motor */
  VERSAO_MOTOR: '1.0.0',
} as const;

// =============================================================================
// PARÂMETROS POR SETOR (§2.3)
// =============================================================================

/**
 * Tabela de referência por setor.
 *
 * Fontes:
 *   - D/EBITDA: Capstone Partners Q4 2025, JPMorgan, FullRatio
 *   - CCC: JPMorgan Working Capital Index 2022, Hackett Group
 *   - Margem: FullRatio, Damodaran NYU, First Page Sage
 *   - Capex: Compilação mercado + ajuste BR
 *
 * ATUALIZAR: Semestralmente (D/EBITDA), anualmente (CCC, capex).
 */
export const SETORES: Record<Setor, ParametrosSetor> = {
  [Setor.TECNOLOGIA_SAAS]: {
    id: Setor.TECNOLOGIA_SAAS,
    nome: 'Tecnologia / SaaS',
    dEbitdaRef: [3.0, 4.5],
    cccMedioDias: [30, 50],
    margemEbitdaRef: [20, 35],
    capexPctRef: [0.02, 0.04],
    capexDefaultPct: 0.03,
    ajusteFaixaDEbitda: true,  // setor tolera alavancagem mais alta
  },
  [Setor.SERVICOS_PROFISSIONAIS]: {
    id: Setor.SERVICOS_PROFISSIONAIS,
    nome: 'Serviços profissionais',
    dEbitdaRef: [2.0, 3.5],
    cccMedioDias: [30, 60],
    margemEbitdaRef: [12, 22],
    capexPctRef: [0.01, 0.03],
    capexDefaultPct: 0.02,
    ajusteFaixaDEbitda: false,
  },
  [Setor.INDUSTRIA_MANUFATURA]: {
    id: Setor.INDUSTRIA_MANUFATURA,
    nome: 'Indústria / Manufatura',
    dEbitdaRef: [2.5, 4.0],
    cccMedioDias: [60, 120],
    margemEbitdaRef: [8, 18],
    capexPctRef: [0.04, 0.08],
    capexDefaultPct: 0.06,
    ajusteFaixaDEbitda: false,
  },
  [Setor.COMERCIO_VAREJO]: {
    id: Setor.COMERCIO_VAREJO,
    nome: 'Comércio / Varejo',
    dEbitdaRef: [1.5, 3.0],
    cccMedioDias: [20, 50],
    margemEbitdaRef: [4, 10],
    capexPctRef: [0.02, 0.05],
    capexDefaultPct: 0.03,
    ajusteFaixaDEbitda: false,
  },
  [Setor.AGRONEGOCIO]: {
    id: Setor.AGRONEGOCIO,
    nome: 'Agronegócio',
    dEbitdaRef: [2.0, 3.5],
    cccMedioDias: [90, 180],
    margemEbitdaRef: [10, 20],
    capexPctRef: [0.03, 0.06],
    capexDefaultPct: 0.045,
    ajusteFaixaDEbitda: false,
  },
  [Setor.SAUDE_EDUCACAO]: {
    id: Setor.SAUDE_EDUCACAO,
    nome: 'Saúde / Educação',
    dEbitdaRef: [2.5, 4.0],
    cccMedioDias: [40, 80],
    margemEbitdaRef: [12, 20],
    capexPctRef: [0.03, 0.05],
    capexDefaultPct: 0.04,
    ajusteFaixaDEbitda: false,
  },
  [Setor.LOGISTICA_TRANSPORTE]: {
    id: Setor.LOGISTICA_TRANSPORTE,
    nome: 'Logística / Transporte',
    dEbitdaRef: [2.0, 3.5],
    cccMedioDias: [20, 40],
    margemEbitdaRef: [8, 15],
    capexPctRef: [0.05, 0.10],
    capexDefaultPct: 0.075,
    ajusteFaixaDEbitda: false,
  },
  [Setor.CONSTRUCAO_INFRA]: {
    id: Setor.CONSTRUCAO_INFRA,
    nome: 'Construção / Infraestrutura',
    dEbitdaRef: [2.0, 3.0],
    cccMedioDias: [60, 120],
    margemEbitdaRef: [8, 15],
    capexPctRef: [0.04, 0.08],
    capexDefaultPct: 0.06,
    ajusteFaixaDEbitda: false,
  },
  [Setor.OUTROS]: {
    id: Setor.OUTROS,
    nome: 'Outros',
    dEbitdaRef: [2.5, 3.5],
    cccMedioDias: [45, 90],
    margemEbitdaRef: [10, 18],
    capexPctRef: [0.03, 0.05],
    capexDefaultPct: 0.03,
    ajusteFaixaDEbitda: false,
  },
};

// =============================================================================
// TABELAS DE SCORING (§5.2)
// =============================================================================

/**
 * Tipo para uma regra de pontuação: [threshold_inferior, pontos].
 * A primeira regra que satisfaz `valor >= threshold` é aplicada.
 * As regras devem estar ordenadas de threshold mais alto para mais baixo.
 */
export type RegraPontuacao = { threshold: number; pontos: number; faixa: FaixaMetrica };

/**
 * D/EBITDA — 25 pontos máximos.
 *
 * Referências:
 *   - Investment-grade: 1.0-3.0x (CFI)
 *   - Mid-market saudável: 2.5-4.0x (Capstone, JPMorgan)
 *   - Acima de 4x: "alto" (IMF)
 *   - Acima de 5x: "potencialmente problemático"
 */
export const SCORING_D_EBITDA: RegraPontuacao[] = [
  // Sem dívida = 25pts (tratado no código, não na tabela)
  { threshold: 0,   pontos: 25, faixa: FaixaMetrica.VERDE },    // ≤ 1.0x
  { threshold: 1.0, pontos: 20, faixa: FaixaMetrica.VERDE },    // 1.0x – 2.0x
  { threshold: 2.0, pontos: 15, faixa: FaixaMetrica.AMARELO },  // 2.0x – 3.0x
  { threshold: 3.0, pontos: 10, faixa: FaixaMetrica.AMARELO },  // 3.0x – 3.5x
  { threshold: 3.5, pontos: 5,  faixa: FaixaMetrica.LARANJA },  // 3.5x – 5.0x
  { threshold: 5.0, pontos: 0,  faixa: FaixaMetrica.VERMELHO }, // > 5.0x
];

/**
 * ICR (Interest Coverage Ratio) — 20 pontos máximos.
 *
 * Referência primária: Damodaran/NYU Stern (small firms < $5B).
 * Ratings sintéticos por ICR calibrados com Federal Reserve default rates.
 */
export const SCORING_ICR: RegraPontuacao[] = [
  { threshold: 6.0, pontos: 20, faixa: FaixaMetrica.VERDE },    // A ou melhor
  { threshold: 4.5, pontos: 16, faixa: FaixaMetrica.VERDE },    // A-
  { threshold: 3.5, pontos: 12, faixa: FaixaMetrica.AMARELO },  // BBB / BB+
  { threshold: 2.5, pontos: 8,  faixa: FaixaMetrica.AMARELO },  // BB / B+
  { threshold: 1.5, pontos: 4,  faixa: FaixaMetrica.LARANJA },  // B / B-
  { threshold: 0,   pontos: 0,  faixa: FaixaMetrica.VERMELHO }, // CCC ou pior
];

/**
 * DSCR (Debt Service Coverage Ratio) — 25 pontos máximos.
 *
 * Referências:
 *   - Covenant mínimo padrão: 1.25x (CFI, Offermarket, mercado BR)
 *   - Headroom 50%+: confortável (1.50x+)
 *   - Abaixo de 1.05x: risco de não cobertura
 */
export const SCORING_DSCR: RegraPontuacao[] = [
  { threshold: 2.00, pontos: 25, faixa: FaixaMetrica.VERDE },    // Excelente
  { threshold: 1.50, pontos: 20, faixa: FaixaMetrica.VERDE },    // Confortável
  { threshold: 1.25, pontos: 15, faixa: FaixaMetrica.AMARELO },  // Covenant mínimo
  { threshold: 1.10, pontos: 8,  faixa: FaixaMetrica.LARANJA },  // Abaixo covenant
  { threshold: 1.00, pontos: 3,  faixa: FaixaMetrica.LARANJA },  // Limítrofe
  { threshold: 0,    pontos: 0,  faixa: FaixaMetrica.VERMELHO }, // Insuficiente
];

/**
 * NCG/Receita — 15 pontos máximos (escala invertida: menor = melhor).
 *
 * Referência: JPMorgan Working Capital Index 2022.
 * Média Fortune 500 = ~20%. PME BR tipicamente +3-5pp.
 */
export const SCORING_NCG_RECEITA: RegraPontuacao[] = [
  { threshold: 0,  pontos: 15, faixa: FaixaMetrica.VERDE },    // ≤ 8%
  { threshold: 8,  pontos: 12, faixa: FaixaMetrica.VERDE },    // 8% – 15%
  { threshold: 15, pontos: 8,  faixa: FaixaMetrica.AMARELO },  // 15% – 22%
  { threshold: 22, pontos: 4,  faixa: FaixaMetrica.LARANJA },  // 22% – 30%
  { threshold: 30, pontos: 0,  faixa: FaixaMetrica.VERMELHO }, // > 30%
];

/**
 * CFADS/Receita — 15 pontos máximos.
 *
 * Derivado: CFADS = EBITDA × 0.66 − Capex.
 * Alíquota de 34% reflete carga tributária BR.
 */
export const SCORING_CFADS_RECEITA: RegraPontuacao[] = [
  { threshold: 10, pontos: 15, faixa: FaixaMetrica.VERDE },    // Forte
  { threshold: 7,  pontos: 12, faixa: FaixaMetrica.VERDE },    // Boa
  { threshold: 4,  pontos: 8,  faixa: FaixaMetrica.AMARELO },  // Moderada
  { threshold: 2,  pontos: 4,  faixa: FaixaMetrica.LARANJA },  // Fraca
  { threshold: -Infinity, pontos: 0, faixa: FaixaMetrica.VERMELHO }, // Insuficiente
];

// =============================================================================
// PESOS DAS MÉTRICAS (§5.1)
// =============================================================================

export const PESOS_METRICAS: Record<MetricaId, number> = {
  [MetricaId.D_EBITDA]:      25,
  [MetricaId.ICR]:           20,
  [MetricaId.DSCR]:          25,
  [MetricaId.NCG_RECEITA]:   15,
  [MetricaId.CFADS_RECEITA]: 15,
};

// =============================================================================
// FAIXAS DO SCORE COMPOSTO (§5.3)
// =============================================================================

export const FAIXAS_SCORE: Array<{ min: number; faixa: Faixa; label: string }> = [
  { min: 80, faixa: Faixa.VERDE,    label: 'Saudável' },
  { min: 60, faixa: Faixa.AMARELO,  label: 'Moderado' },
  { min: 40, faixa: Faixa.LARANJA,  label: 'Atenção' },
  { min: 0,  faixa: Faixa.VERMELHO, label: 'Restrito' },
];

// =============================================================================
// PREMISSAS DOS CENÁRIOS (§6.1)
// =============================================================================

/**
 * Cenários de stress/upside.
 *
 * Conservador:
 *   -20% EBITDA + +200bps taxa + +20% capex + +15 dias ciclo
 *   Alinhado com OCDE stress testing e práticas de covenant headroom.
 *
 * Base: Números informados pelo usuário, sem alteração.
 *
 * Otimista:
 *   +10% EBITDA + -100bps taxa + -10% capex + -10 dias ciclo
 *   Cenário favorável mas realista.
 */
export const CENARIOS: Record<CenarioId, PremissasCenario> = {
  [CenarioId.CONSERVADOR]: {
    ebitdaMult: 0.80,
    capexMult: 1.20,
    taxaAjuste: 0.02,
    multiploMax: 2.0,
    dscrMinimo: 1.50,
    cicloCaixaAjuste: 15,
  },
  [CenarioId.BASE]: {
    ebitdaMult: 1.00,
    capexMult: 1.00,
    taxaAjuste: 0.00,
    multiploMax: 3.0,
    dscrMinimo: 1.25,
    cicloCaixaAjuste: 0,
  },
  [CenarioId.OTIMISTA]: {
    ebitdaMult: 1.10,
    capexMult: 0.90,
    taxaAjuste: -0.01,
    multiploMax: 3.5,
    dscrMinimo: 1.10,
    cicloCaixaAjuste: -10,
  },
};

export const CENARIOS_LABELS: Record<CenarioId, string> = {
  [CenarioId.CONSERVADOR]: 'Conservador',
  [CenarioId.BASE]: 'Base',
  [CenarioId.OTIMISTA]: 'Otimista',
};

// =============================================================================
// PENALIDADES DE EDGE CASES (§9.2)
// =============================================================================

export const PENALIDADES = {
  /**
   * Edge case 3: Score alto mas CFADS baixo (sem dívida, margem baixa).
   * Corrige inflação artificial do score quando D/EBITDA, ICR e DSCR
   * recebem pontuação máxima automática por não ter dívida.
   */
  CFADS_BAIXO_SEM_DIVIDA: -15,      // CFADS/Receita < 2% e dívida = 0
  CFADS_NEGATIVO_SEM_DIVIDA: -25,   // CFADS < 0 e dívida = 0
} as const;

// =============================================================================
// VALIDAÇÃO DE INPUTS
// =============================================================================

export const LIMITES_INPUTS = {
  RECEITA_MIN: 1_000_000,
  RECEITA_MAX: 500_000_000,
  MARGEM_MIN: 1,
  MARGEM_MAX: 60,
  CICLO_MIN: 0,
  CICLO_MAX: 365,
  DIVIDA_MIN: 0,
  DIVIDA_MAX: 500_000_000,
  TAXA_MIN: 0,
  TAXA_MAX: 0.40,
  CAPEX_MIN: 0,
  CAPEX_MAX: 100_000_000,
} as const;

// =============================================================================
// TEXTOS DE REFERÊNCIA POR FAIXA DE MÉTRICA (UX Microcopy §3)
// =============================================================================

export const TEXTOS_REFERENCIA: Record<MetricaId, Record<FaixaMetrica, string>> = {
  [MetricaId.D_EBITDA]: {
    [FaixaMetrica.VERDE]:    'Abaixo de 2.0x — confortável para a maioria dos setores.',
    [FaixaMetrica.AMARELO]:  'Entre 2.0x e 3.5x — dentro da faixa de mercado, mas monitore.',
    [FaixaMetrica.LARANJA]:  'Entre 3.5x e 5.0x — acima do padrão; credores podem exigir mais garantias.',
    [FaixaMetrica.VERMELHO]: 'Acima de 5.0x — alavancagem elevada; risco de refinanciamento sobe.',
  },
  [MetricaId.ICR]: {
    [FaixaMetrica.VERDE]:    'Acima de 4.5x — equivalente a rating A- ou melhor (Damodaran, small firms).',
    [FaixaMetrica.AMARELO]:  'Entre 2.5x e 4.5x — rating B+ a BBB; margem suficiente mas sem folga.',
    [FaixaMetrica.LARANJA]:  'Entre 1.5x e 2.5x — rating B ou inferior; risco de default sobe.',
    [FaixaMetrica.VERMELHO]: 'Abaixo de 1.5x — zona crítica; EBITDA mal cobre os juros.',
  },
  [MetricaId.DSCR]: {
    [FaixaMetrica.VERDE]:    'Acima de 1.50x — o caixa operacional cobre dívida com folga de 50%+.',
    [FaixaMetrica.AMARELO]:  'Entre 1.25x e 1.50x — dentro do covenant mínimo de mercado (1.25x).',
    [FaixaMetrica.LARANJA]:  'Entre 1.05x e 1.25x — abaixo do covenant padrão; risco de breach.',
    [FaixaMetrica.VERMELHO]: 'Abaixo de 1.05x — caixa insuficiente para servir a dívida.',
  },
  [MetricaId.NCG_RECEITA]: {
    [FaixaMetrica.VERDE]:    'Até 12% — ciclo eficiente; mais caixa disponível para dívida.',
    [FaixaMetrica.AMARELO]:  '12% a 20% — normal; média de mercado para empresas Fortune 500.',
    [FaixaMetrica.LARANJA]:  '20% a 30% — capital preso no giro operacional reduz capacidade.',
    [FaixaMetrica.VERMELHO]: 'Acima de 30% — ciclo de caixa longo compromete geração de caixa.',
  },
  [MetricaId.CFADS_RECEITA]: {
    [FaixaMetrica.VERDE]:    'Acima de 8% — geração de caixa robusta; boa base para alavancagem.',
    [FaixaMetrica.AMARELO]:  '5% a 8% — moderada; endividamento possível mas com limites.',
    [FaixaMetrica.LARANJA]:  '2% a 5% — fraca; apenas dívidas muito conservadoras.',
    [FaixaMetrica.VERMELHO]: 'Abaixo de 2% — insuficiente; priorize aumentar margem operacional.',
  },
};

export const NOMES_METRICAS: Record<MetricaId, { nome: string; nomeCurto: string }> = {
  [MetricaId.D_EBITDA]:      { nome: 'Alavancagem (D/EBITDA)',            nomeCurto: 'D/EBITDA' },
  [MetricaId.ICR]:           { nome: 'Cobertura de juros (ICR)',          nomeCurto: 'ICR' },
  [MetricaId.DSCR]:          { nome: 'Cobertura do serviço (DSCR)',       nomeCurto: 'DSCR' },
  [MetricaId.NCG_RECEITA]:   { nome: 'Capital no giro (NCG/Receita)',     nomeCurto: 'NCG/Receita' },
  [MetricaId.CFADS_RECEITA]: { nome: 'Caixa para dívida (CFADS/Receita)', nomeCurto: 'CFADS/Receita' },
};
