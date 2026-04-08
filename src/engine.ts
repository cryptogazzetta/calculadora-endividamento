/**
 * =============================================================================
 * MOTOR DE CÁLCULO — NÚCLEO
 * =============================================================================
 *
 * Implementação das camadas 1-3 do modelo decisório:
 *   Camada 1: Resolução de inputs (defaults por setor)
 *   Camada 2: Variáveis derivadas (EBITDA, NCG, CFADS, serviço da dívida)
 *   Camada 3: Scoring composto (5 métricas → score 0-100 → faixa)
 *
 * Referências:
 *   - §2 (Inputs) do Modelo Decisório
 *   - §3 (Variáveis Derivadas)
 *   - §5 (Scoring)
 *   - §9 (Edge Cases)
 *
 * @version 1.0.0
 * @date Abril 2026
 */

import {
  Setor,
  Faixa,
  FaixaMetrica,
  MetricaId,
  InputsObrigatorios,
  InputsOpcionais,
  InputsResolvidos,
  VariaveisDerivadas,
  ResultadoMetrica,
  ResultadoScoring,
} from './types';

import {
  PREMISSAS,
  SETORES,
  PESOS_METRICAS,
  FAIXAS_SCORE,
  PENALIDADES,
  SCORING_D_EBITDA,
  SCORING_ICR,
  SCORING_DSCR,
  SCORING_NCG_RECEITA,
  SCORING_CFADS_RECEITA,
  TEXTOS_REFERENCIA,
  NOMES_METRICAS,
  RegraPontuacao,
} from './constants';

import {
  formatarMultiplo,
  formatarPercentual,
  clamp,
} from './formatters';

// =============================================================================
// CAMADA 1 — RESOLUÇÃO DE INPUTS
// =============================================================================

/**
 * Resolve inputs opcionais aplicando defaults por setor.
 *
 * Lógica de defaults (§2.3):
 *   - setor: 'outros' se não informado
 *   - dividaAtual: 0 se não informado
 *   - taxaJurosMedia: CDI + 3% (PREMISSAS.TAXA_JUROS_DEFAULT) se não informado
 *   - capexManutencao: receita × capexDefaultPct do setor se não informado
 *
 * @param obrigatorios - Inputs obrigatórios do formulário
 * @param opcionais - Inputs opcionais do accordion "Refinar meu resultado"
 * @returns Inputs completos com todos os campos resolvidos
 */
export function resolverInputs(
  obrigatorios: InputsObrigatorios,
  opcionais: InputsOpcionais = {}
): InputsResolvidos {
  const setor = opcionais.setor ?? Setor.OUTROS;
  const parametrosSetor = SETORES[setor];

  return {
    receitaAnual: obrigatorios.receitaAnual,
    margemEbitdaPct: obrigatorios.margemEbitdaPct,
    cicloCaixaDias: obrigatorios.cicloCaixaDias,
    setor,
    dividaAtual: opcionais.dividaAtual ?? 0,
    taxaJurosMedia: opcionais.taxaJurosMedia ?? PREMISSAS.TAXA_JUROS_DEFAULT,
    capexManutencao: opcionais.capexManutencao
      ?? obrigatorios.receitaAnual * parametrosSetor.capexDefaultPct,
  };
}

// =============================================================================
// CAMADA 2 — VARIÁVEIS DERIVADAS
// =============================================================================

/**
 * Calcula todas as variáveis derivadas a partir dos inputs resolvidos.
 *
 * Fórmulas (§3):
 *   EBITDA = Receita × (Margem / 100)
 *   NCG = (Receita / 365) × CicloCaixa
 *   CFADS = EBITDA × (1 - 0.34) - Capex
 *   Despesa financeira = Dívida × Taxa
 *   Serviço da dívida = Despesa financeira + (Dívida / 5)
 *
 * A premissa de 34% de impostos é conservadora: muitas empresas têm carga
 * efetiva menor (Lucro Presumido, incentivos fiscais). Usar a alíquota
 * máxima garante que a calculadora não superestime a capacidade.
 *
 * A premissa de prazo de 5 anos e amortização linear (SAC) reflete o padrão
 * de debêntures e FIDC mid-market no Brasil.
 *
 * @param inputs - Inputs resolvidos (com defaults aplicados)
 * @returns Variáveis derivadas para uso no scoring e cenários
 */
export function calcularVariaveisDerivadas(inputs: InputsResolvidos): VariaveisDerivadas {
  // --- EBITDA ---
  const ebitda = inputs.receitaAnual * (inputs.margemEbitdaPct / 100);

  // --- NCG (Necessidade de Capital de Giro) ---
  // Fórmula simplificada: receita diária × dias de ciclo de caixa
  const ncg = (inputs.receitaAnual / 365) * inputs.cicloCaixaDias;
  const ncgPctReceita = (ncg / inputs.receitaAnual) * 100;

  // --- CFADS (Cash Flow Available for Debt Service) ---
  // EBITDA pós-impostos (34%) menos capex de manutenção
  // É a métrica central: quanto caixa a empresa realmente gera para servir dívida
  const cfads = ebitda * PREMISSAS.FATOR_POS_IMPOSTO - inputs.capexManutencao;
  const cfadsPctReceita = (cfads / inputs.receitaAnual) * 100;

  // --- Serviço da dívida ---
  const despesaFinanceira = inputs.dividaAtual * inputs.taxaJurosMedia;

  // P+I: juros + amortização linear (1/5 do principal por ano)
  const servicoDividaAnual = despesaFinanceira
    + (inputs.dividaAtual * PREMISSAS.AMORTIZACAO_ANUAL);

  // --- Flags ---
  const temDivida = inputs.dividaAtual > 0;
  const cfadsNegativo = cfads < 0;

  return {
    ebitda,
    ncg,
    ncgPctReceita,
    capexManutencao: inputs.capexManutencao,
    cfads,
    cfadsPctReceita,
    despesaFinanceira,
    servicoDividaAnual,
    temDivida,
    cfadsNegativo,
  };
}

// =============================================================================
// CAMADA 3 — SCORING INDIVIDUAL DE MÉTRICAS
// =============================================================================

/**
 * Aplica uma tabela de scoring a um valor.
 *
 * As tabelas de scoring são arrays de regras ordenadas do threshold mais alto
 * para o mais baixo. A primeira regra que satisfaz `valor >= threshold` é a
 * que determina a pontuação.
 *
 * Para métricas invertidas (NCG/Receita, onde menor é melhor), a tabela já
 * está calibrada de forma que thresholds menores dão mais pontos.
 *
 * @param valor - Valor da métrica
 * @param tabela - Tabela de regras de pontuação
 * @param invertida - Se true, ordena por threshold crescente (menor = melhor)
 * @returns Regra de pontuação aplicável
 */
function aplicarTabelaScoring(
  valor: number,
  tabela: RegraPontuacao[],
  invertida: boolean = false
): RegraPontuacao {
  if (invertida) {
    // Para métricas invertidas (NCG/Receita): percorre do threshold mais alto
    // para o mais baixo e retorna a primeira regra onde valor >= threshold.
    // Isso garante que valores altos (ruins) caiam nas faixas certas.
    for (let i = tabela.length - 1; i >= 0; i--) {
      if (valor >= tabela[i].threshold) {
        return tabela[i];
      }
    }
    return tabela[0]; // fallback: menor threshold
  }

  // Para métricas normais (maior = melhor): percorre do threshold mais alto
  // para o mais baixo e retorna a primeira regra onde valor < threshold_seguinte.
  // A tabela D_EBITDA é invertida no sentido de que menor D/EBITDA = melhor,
  // mas a ordenação da tabela já cuida disso.

  // Implementação genérica: percorre do mais alto para o mais baixo
  for (let i = tabela.length - 1; i >= 0; i--) {
    if (valor >= tabela[i].threshold) {
      return tabela[i];
    }
  }
  return tabela[0]; // fallback
}

/**
 * Calcula D/EBITDA — Métrica de alavancagem (25 pontos).
 *
 * Especificidades:
 *   - Sem dívida: D/EBITDA = 0 → 25 pontos automáticos
 *   - A escala é invertida: menor D/EBITDA = melhor
 *   - Referência: Investment-grade 1-3x, mid-market 2.5-4x, alto > 4x
 *
 * @param dividaAtual - Dívida bruta atual em R$
 * @param ebitda - EBITDA calculado
 * @param temDivida - Flag: empresa tem dívida
 */
function calcularDEbitda(
  dividaAtual: number,
  ebitda: number,
  temDivida: boolean
): ResultadoMetrica {
  const id = MetricaId.D_EBITDA;
  const { nome, nomeCurto } = NOMES_METRICAS[id];

  // Sem dívida → 25 pontos (máximo), faixa verde
  if (!temDivida) {
    return {
      id,
      nome,
      nomeCurto,
      valor: 0,
      valorFormatado: '0,0x',
      pontos: PESOS_METRICAS[id],
      pesoMaximo: PESOS_METRICAS[id],
      faixa: FaixaMetrica.VERDE,
      textoReferencia: 'Sem dívida atual — alavancagem zero.',
      aplicavel: true,
    };
  }

  // Proteção: EBITDA zero ou negativo → D/EBITDA infinito → 0 pontos
  if (ebitda <= 0) {
    return {
      id,
      nome,
      nomeCurto,
      valor: Infinity,
      valorFormatado: '∞',
      pontos: 0,
      pesoMaximo: PESOS_METRICAS[id],
      faixa: FaixaMetrica.VERMELHO,
      textoReferencia: 'EBITDA nulo ou negativo — alavancagem indeterminada.',
      aplicavel: true,
    };
  }

  const valor = dividaAtual / ebitda;
  // D/EBITDA: menor = melhor. A tabela é organizada de forma que
  // thresholds crescentes dão MENOS pontos. Percorremos do mais alto.
  const regra = aplicarTabelaScoring(valor, SCORING_D_EBITDA, true);

  return {
    id,
    nome,
    nomeCurto,
    valor,
    valorFormatado: formatarMultiplo(valor),
    pontos: regra.pontos,
    pesoMaximo: PESOS_METRICAS[id],
    faixa: regra.faixa,
    textoReferencia: TEXTOS_REFERENCIA[id][regra.faixa],
    aplicavel: true,
  };
}

/**
 * Calcula ICR (Interest Coverage Ratio) — 20 pontos.
 *
 * ICR = EBITDA / Despesa Financeira
 *
 * Especificidades:
 *   - Sem dívida: ICR não é aplicável → pontuação máxima
 *   - Referência: Damodaran/NYU Stern (small firms < $5B)
 *   - ICR ≥ 6.0x → rating A (investment grade)
 *   - ICR < 1.5x → zona CCC (default iminente)
 *
 * @param ebitda - EBITDA calculado
 * @param despesaFinanceira - Juros anuais
 * @param temDivida - Flag: empresa tem dívida
 */
function calcularICR(
  ebitda: number,
  despesaFinanceira: number,
  temDivida: boolean
): ResultadoMetrica {
  const id = MetricaId.ICR;
  const { nome, nomeCurto } = NOMES_METRICAS[id];

  // Sem dívida → não aplicável, mas recebe pontuação máxima
  // (não há despesa financeira para cobrir)
  if (!temDivida) {
    return {
      id,
      nome,
      nomeCurto,
      valor: Infinity,
      valorFormatado: '∞',
      pontos: PESOS_METRICAS[id],
      pesoMaximo: PESOS_METRICAS[id],
      faixa: FaixaMetrica.VERDE,
      textoReferencia: 'Sem dívida atual — cobertura de juros não se aplica.',
      aplicavel: false,
      textoNaoAplicavel: 'Sem dívida atual',
    };
  }

  // Proteção: despesa financeira zero (dívida > 0 mas taxa = 0 → edge case)
  if (despesaFinanceira <= 0) {
    return {
      id,
      nome,
      nomeCurto,
      valor: Infinity,
      valorFormatado: '∞',
      pontos: PESOS_METRICAS[id],
      pesoMaximo: PESOS_METRICAS[id],
      faixa: FaixaMetrica.VERDE,
      textoReferencia: 'Sem despesa financeira — cobertura infinita.',
      aplicavel: true,
    };
  }

  const valor = ebitda / despesaFinanceira;

  // ICR negativo (EBITDA negativo) → 0 pontos
  if (valor < 0) {
    return {
      id,
      nome,
      nomeCurto,
      valor,
      valorFormatado: formatarMultiplo(valor),
      pontos: 0,
      pesoMaximo: PESOS_METRICAS[id],
      faixa: FaixaMetrica.VERMELHO,
      textoReferencia: 'EBITDA negativo — empresa não cobre juros.',
      aplicavel: true,
    };
  }

  const regra = aplicarTabelaScoring(valor, SCORING_ICR, false);

  return {
    id,
    nome,
    nomeCurto,
    valor,
    valorFormatado: formatarMultiplo(valor),
    pontos: regra.pontos,
    pesoMaximo: PESOS_METRICAS[id],
    faixa: regra.faixa,
    textoReferencia: TEXTOS_REFERENCIA[id][regra.faixa],
    aplicavel: true,
  };
}

/**
 * Calcula DSCR (Debt Service Coverage Ratio) — 25 pontos.
 *
 * DSCR = CFADS / Serviço da Dívida Anual
 *
 * É a métrica mais rigorosa porque usa CFADS (pós-impostos, pós-capex)
 * no numerador e P+I (juros + amortização) no denominador.
 *
 * Especificidades:
 *   - Sem dívida: não aplicável → pontuação máxima
 *   - Covenant mínimo padrão de mercado: 1.25x
 *   - Abaixo de 1.0x: empresa não gera caixa suficiente para servir dívida
 *   - Edge case 4: empresas capital-intensive podem ter DSCR baixo mesmo
 *     com D/EBITDA moderado (capex consome o CFADS)
 *
 * @param cfads - Cash Flow Available for Debt Service
 * @param servicoDividaAnual - Juros + amortização anual
 * @param temDivida - Flag: empresa tem dívida
 */
function calcularDSCR(
  cfads: number,
  servicoDividaAnual: number,
  temDivida: boolean
): ResultadoMetrica {
  const id = MetricaId.DSCR;
  const { nome, nomeCurto } = NOMES_METRICAS[id];

  // Sem dívida → não aplicável, pontuação máxima
  if (!temDivida) {
    return {
      id,
      nome,
      nomeCurto,
      valor: Infinity,
      valorFormatado: '∞',
      pontos: PESOS_METRICAS[id],
      pesoMaximo: PESOS_METRICAS[id],
      faixa: FaixaMetrica.VERDE,
      textoReferencia: 'Sem dívida atual — cobertura do serviço não se aplica.',
      aplicavel: false,
      textoNaoAplicavel: 'Sem dívida atual',
    };
  }

  // Proteção: serviço da dívida zero
  if (servicoDividaAnual <= 0) {
    return {
      id,
      nome,
      nomeCurto,
      valor: Infinity,
      valorFormatado: '∞',
      pontos: PESOS_METRICAS[id],
      pesoMaximo: PESOS_METRICAS[id],
      faixa: FaixaMetrica.VERDE,
      textoReferencia: 'Sem serviço da dívida — cobertura infinita.',
      aplicavel: true,
    };
  }

  const valor = cfads / servicoDividaAnual;

  // CFADS negativo → DSCR negativo → 0 pontos
  if (valor < 0) {
    return {
      id,
      nome,
      nomeCurto,
      valor,
      valorFormatado: formatarMultiplo(valor),
      pontos: 0,
      pesoMaximo: PESOS_METRICAS[id],
      faixa: FaixaMetrica.VERMELHO,
      textoReferencia: 'CFADS negativo — caixa operacional não cobre o serviço da dívida.',
      aplicavel: true,
    };
  }

  const regra = aplicarTabelaScoring(valor, SCORING_DSCR, false);

  return {
    id,
    nome,
    nomeCurto,
    valor,
    valorFormatado: formatarMultiplo(valor),
    pontos: regra.pontos,
    pesoMaximo: PESOS_METRICAS[id],
    faixa: regra.faixa,
    textoReferencia: TEXTOS_REFERENCIA[id][regra.faixa],
    aplicavel: true,
  };
}

/**
 * Calcula NCG/Receita — 15 pontos (escala invertida: menor = melhor).
 *
 * NCG/Receita = (NCG / Receita) × 100
 *
 * Mede quanto capital fica preso no ciclo operacional.
 * Quanto maior o percentual, menos caixa disponível para dívida.
 *
 * Referência: JPMorgan Working Capital Index.
 *   - Fortune 500 média: ~20%
 *   - PME BR: tipicamente +3-5pp (23-25%)
 *   - Eficiente: < 8%
 *   - Elevado: > 30%
 *
 * @param ncgPctReceita - NCG como % da receita
 */
function calcularNCGReceita(ncgPctReceita: number): ResultadoMetrica {
  const id = MetricaId.NCG_RECEITA;
  const { nome, nomeCurto } = NOMES_METRICAS[id];

  // NCG/Receita é invertida: menor é melhor.
  // A tabela SCORING_NCG_RECEITA está organizada com thresholds crescentes
  // dando MENOS pontos.
  const regra = aplicarTabelaScoring(ncgPctReceita, SCORING_NCG_RECEITA, true);

  return {
    id,
    nome,
    nomeCurto,
    valor: ncgPctReceita,
    valorFormatado: formatarPercentual(ncgPctReceita),
    pontos: regra.pontos,
    pesoMaximo: PESOS_METRICAS[id],
    faixa: regra.faixa,
    textoReferencia: TEXTOS_REFERENCIA[id][regra.faixa],
    aplicavel: true,
  };
}

/**
 * Calcula CFADS/Receita — 15 pontos.
 *
 * CFADS/Receita = (CFADS / Receita) × 100
 *
 * Mede a eficiência da empresa em converter receita em caixa para dívida.
 * É afetada por margem, impostos e capex simultaneamente.
 *
 * @param cfadsPctReceita - CFADS como % da receita
 */
function calcularCFADSReceita(cfadsPctReceita: number): ResultadoMetrica {
  const id = MetricaId.CFADS_RECEITA;
  const { nome, nomeCurto } = NOMES_METRICAS[id];

  const regra = aplicarTabelaScoring(cfadsPctReceita, SCORING_CFADS_RECEITA, false);

  return {
    id,
    nome,
    nomeCurto,
    valor: cfadsPctReceita,
    valorFormatado: formatarPercentual(cfadsPctReceita),
    pontos: regra.pontos,
    pesoMaximo: PESOS_METRICAS[id],
    faixa: regra.faixa,
    textoReferencia: TEXTOS_REFERENCIA[id][regra.faixa],
    aplicavel: true,
  };
}

// =============================================================================
// CAMADA 3 — SCORING COMPOSTO
// =============================================================================

/**
 * Calcula o score composto e classifica em faixa de saúde financeira.
 *
 * Fluxo (§5):
 *   1. Calcula cada métrica individualmente
 *   2. Soma os pontos: score_bruto = Σ pontos
 *   3. Aplica penalidades de edge cases (§9.2)
 *   4. Clamp [0, 100]
 *   5. Classifica em faixa (verde/amarelo/laranja/vermelho)
 *   6. Identifica métrica mais fraca (para insight dinâmico)
 *
 * Edge cases (§9.2):
 *   - CFADS < 0 e sem dívida: -25 pontos (corrige inflação de D/EBITDA, ICR, DSCR)
 *   - CFADS/Receita < 2% e sem dívida: -15 pontos (corrige inflação moderada)
 *
 * @param inputs - Inputs resolvidos
 * @param derivadas - Variáveis derivadas
 * @returns Score composto com detalhamento por métrica
 */
export function calcularScoring(
  inputs: InputsResolvidos,
  derivadas: VariaveisDerivadas
): ResultadoScoring {
  // --- Calcular cada métrica ---
  const metricas: ResultadoMetrica[] = [
    calcularDEbitda(inputs.dividaAtual, derivadas.ebitda, derivadas.temDivida),
    calcularICR(derivadas.ebitda, derivadas.despesaFinanceira, derivadas.temDivida),
    calcularDSCR(derivadas.cfads, derivadas.servicoDividaAnual, derivadas.temDivida),
    calcularNCGReceita(derivadas.ncgPctReceita),
    calcularCFADSReceita(derivadas.cfadsPctReceita),
  ];

  // --- Score bruto ---
  const scorePrePenalidade = metricas.reduce((acc, m) => acc + m.pontos, 0);

  // --- Penalidades de edge cases (§9.2) ---
  let penalidade = 0;
  let razaoPenalidade: string | undefined;

  if (!derivadas.temDivida) {
    if (derivadas.cfadsNegativo) {
      // Edge case mais grave: CFADS negativo sem dívida
      // Sem dívida, D/EBITDA=25, ICR=20, DSCR=25 automáticos (70pts "grátis")
      // CFADS negativo indica que a operação não se sustenta, mas o score
      // ficaria inflado. -25 corrige isso.
      penalidade = PENALIDADES.CFADS_NEGATIVO_SEM_DIVIDA;
      razaoPenalidade =
        'CFADS negativo: a operação não gera caixa livre após impostos e manutenção. ' +
        'Score ajustado para refletir a capacidade real de endividamento.';
    } else if (derivadas.cfadsPctReceita < 2) {
      // Edge case moderado: CFADS muito baixo sem dívida
      // A empresa gera caixa, mas muito pouco — capacidade real é limitada.
      penalidade = PENALIDADES.CFADS_BAIXO_SEM_DIVIDA;
      razaoPenalidade =
        'CFADS/Receita abaixo de 2%: geração de caixa insuficiente para endividamento significativo. ' +
        'Score ajustado para refletir a limitação da margem operacional.';
    }
  }

  // --- Score final ---
  const score = clamp(scorePrePenalidade + penalidade, 0, 100);

  // --- Classificação em faixa ---
  const faixaInfo = FAIXAS_SCORE.find(f => score >= f.min) ?? FAIXAS_SCORE[FAIXAS_SCORE.length - 1];

  // --- Métrica mais fraca ---
  // Calculada como menor % de aproveitamento do peso máximo.
  // Apenas entre métricas aplicáveis (ignora ICR/DSCR sem dívida).
  const metricasAplicaveis = metricas.filter(m => m.aplicavel);
  const metricaMaisFraca = metricasAplicaveis.reduce((fraca, atual) => {
    const pctAtual = atual.pontos / atual.pesoMaximo;
    const pctFraca = fraca.pontos / fraca.pesoMaximo;
    return pctAtual < pctFraca ? atual : fraca;
  }, metricasAplicaveis[0]);

  return {
    score,
    scorePrePenalidade,
    penalidade,
    razaoPenalidade,
    faixa: faixaInfo.faixa,
    faixaLabel: faixaInfo.label,
    metricas,
    metricaMaisFraca,
  };
}
