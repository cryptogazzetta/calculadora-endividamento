/**
 * =============================================================================
 * GERADOR DE CENÁRIOS E FAIXA DE DÍVIDA
 * =============================================================================
 *
 * Implementação da Camada 3 (cenários) e parte da Camada 4 (faixa de dívida):
 *   - Cenário conservador: stress test (OCDE methodology)
 *   - Cenário base: números informados pelo usuário
 *   - Cenário otimista: upside moderado e realista
 *   - Faixa segura de dívida: [conservador, base, otimista]
 *   - Capacidade residual: quando a empresa já tem dívida
 *
 * A capacidade de cada cenário é o MENOR valor entre:
 *   - Capacidade por múltiplo de alavancagem (EBITDA × multiploMax)
 *   - Capacidade por fluxo de caixa (CFADS / (taxa + amortização))
 *
 * Isso garante que a calculadora nunca sugira dívida que a empresa
 * consiga "carregar" por alavancagem mas não "pagar" pelo fluxo, ou vice-versa.
 *
 * Referências:
 *   - §6 (Cenários) do Modelo Decisório
 *   - §7 (Faixa de Dívida)
 *   - §9 (Edge Cases: capacidade negativa)
 *   - OCDE: Corporate Stress Testing (-20% EBITDA, +200bps)
 *   - CFI/Offermarket: DSCR covenant mínimo 1.25x
 *
 * @version 1.0.0
 * @date Abril 2026
 */

import {
  CenarioId,
  InputsResolvidos,
  VariaveisDerivadas,
  ResultadoCenario,
  FaixaDivida,
  CapacidadeResidual,
  PremissasCenario,
} from './types';

import {
  PREMISSAS,
  CENARIOS,
  CENARIOS_LABELS,
} from './constants';

import {
  formatarMoeda,
  formatarMultiplo,
  formatarTaxa,
  clamp,
  pontoMedio,
} from './formatters';

// =============================================================================
// CÁLCULO DE UM CENÁRIO INDIVIDUAL
// =============================================================================

/**
 * Calcula a capacidade de dívida para um cenário específico.
 *
 * Fluxo (§6.2):
 *   1. Ajustar EBITDA pelo multiplicador do cenário
 *   2. Ajustar Capex pelo multiplicador do cenário
 *   3. Calcular CFADS ajustado = EBITDA_ajustado × 0.66 - Capex_ajustado
 *   4. Ajustar taxa de juros pelo cenário
 *   5. Capacidade por múltiplo = EBITDA_ajustado × multiploMax
 *   6. Capacidade por fluxo = CFADS_ajustado / (taxa_ajustada + amortização)
 *   7. Capacidade final = MIN(múltiplo, fluxo), floor em 0
 *
 * O dual-constraint (MIN) é o mecanismo central de segurança:
 *   - Múltiplo captura a perspectiva de mercado (quanto credores emprestam)
 *   - Fluxo captura a realidade operacional (quanto a empresa paga)
 *   - O menor dos dois é o limite real
 *
 * @param cenarioId - Identificador do cenário
 * @param inputs - Inputs resolvidos
 * @param derivadas - Variáveis derivadas (cenário base)
 * @returns Resultado completo do cenário com capacidade e premissas
 */
export function calcularCenario(
  cenarioId: CenarioId,
  inputs: InputsResolvidos,
  derivadas: VariaveisDerivadas
): ResultadoCenario {
  const premissas: PremissasCenario = CENARIOS[cenarioId];
  const label = CENARIOS_LABELS[cenarioId];

  // --- 1. EBITDA ajustado ---
  const ebitda = derivadas.ebitda * premissas.ebitdaMult;

  // --- 2. Capex ajustado ---
  const capex = derivadas.capexManutencao * premissas.capexMult;

  // --- 3. CFADS ajustado ---
  // CFADS = EBITDA × (1 - alíquota) - Capex
  const cfads = ebitda * PREMISSAS.FATOR_POS_IMPOSTO - capex;

  // --- 4. Taxa ajustada ---
  const taxaAjustada = inputs.taxaJurosMedia + premissas.taxaAjuste;

  // --- 5. Capacidade por múltiplo de alavancagem ---
  // "Quanto o mercado emprestaria com base no EBITDA"
  const capacidadeMultiplo = ebitda * premissas.multiploMax;

  // --- 6. Capacidade por fluxo de caixa ---
  // "Quanto a empresa consegue pagar com o caixa que gera"
  // Denominador: taxa de juros + amortização anual (1/prazo)
  // Se CFADS ≤ 0, capacidade por fluxo = 0 (não pode servir dívida)
  const denominador = taxaAjustada + PREMISSAS.AMORTIZACAO_ANUAL;
  const capacidadeFluxo = cfads > 0 && denominador > 0
    ? cfads / denominador
    : 0;

  // --- 7. Capacidade final: MIN(múltiplo, fluxo), floor em R$ 0 ---
  // Edge case 2 (§9.2): capacidade negativa → clamped a 0
  // Nunca sugerimos que a empresa "deve" R$ X — apenas que não tem capacidade
  const capacidadeBruta = Math.min(capacidadeMultiplo, capacidadeFluxo);
  const capacidade = Math.max(0, capacidadeBruta);

  // --- Múltiplo equivalente ---
  const capacidadeMultiploEbitda = derivadas.ebitda > 0
    ? capacidade / derivadas.ebitda
    : 0;

  // --- Qual limite foi binding ---
  const limitBinding: 'multiplo' | 'fluxo' = capacidadeMultiplo <= capacidadeFluxo
    ? 'multiplo'
    : 'fluxo';

  // --- Tooltip com premissas do cenário ---
  const tooltipPremissas = gerarTooltipPremissas(cenarioId, premissas, taxaAjustada);

  return {
    id: cenarioId,
    label,
    ebitda,
    cfads,
    capacidadeMultiplo,
    capacidadeFluxo,
    capacidade,
    capacidadeMultiploEbitda,
    limitBinding,
    tooltipPremissas,
  };
}

/**
 * Gera o texto do tooltip explicando as premissas do cenário.
 * Exibido no ícone (i) ao lado de cada barra no gráfico de cenários.
 */
function gerarTooltipPremissas(
  cenarioId: CenarioId,
  premissas: PremissasCenario,
  taxaAjustada: number
): string {
  if (cenarioId === CenarioId.BASE) {
    return 'Cenário base: seus números conforme informados, sem ajustes.';
  }

  const partes: string[] = [];

  if (premissas.ebitdaMult !== 1) {
    const pct = Math.round((premissas.ebitdaMult - 1) * 100);
    const sinal = pct > 0 ? '+' : '';
    partes.push(`EBITDA ${sinal}${pct}%`);
  }

  if (premissas.taxaAjuste !== 0) {
    const bps = Math.round(premissas.taxaAjuste * 10_000);
    const sinal = bps > 0 ? '+' : '';
    partes.push(`taxa ${sinal}${bps}bps (→ ${formatarTaxa(taxaAjustada)})`);
  }

  if (premissas.capexMult !== 1) {
    const pct = Math.round((premissas.capexMult - 1) * 100);
    const sinal = pct > 0 ? '+' : '';
    partes.push(`capex ${sinal}${pct}%`);
  }

  if (premissas.cicloCaixaAjuste !== 0) {
    const sinal = premissas.cicloCaixaAjuste > 0 ? '+' : '';
    partes.push(`ciclo de caixa ${sinal}${premissas.cicloCaixaAjuste} dias`);
  }

  partes.push(`múltiplo máx ${premissas.multiploMax}x`);
  partes.push(`DSCR mínimo ${premissas.dscrMinimo}x`);

  const prefixo = cenarioId === CenarioId.CONSERVADOR
    ? 'Cenário de stress (OCDE)'
    : 'Cenário otimista';

  return `${prefixo}: ${partes.join(', ')}.`;
}

// =============================================================================
// FAIXA DE DÍVIDA (Output visual principal)
// =============================================================================

/**
 * Calcula a faixa segura de dívida com os 3 cenários.
 *
 * A faixa é o output visual principal da calculadora:
 *   [Conservador -------- Base -------- Otimista]
 *   [R$ 2,8M ----------- R$ 4,2M ----- R$ 5,1M]
 *
 * Se o cenário conservador resultar em R$ 0, a faixa começa do zero
 * com texto explicativo sobre o ajuste.
 *
 * @param inputs - Inputs resolvidos
 * @param derivadas - Variáveis derivadas
 * @returns Faixa de dívida com cenários e texto interpretativo
 */
export function calcularFaixaDivida(
  inputs: InputsResolvidos,
  derivadas: VariaveisDerivadas
): FaixaDivida {
  // Calcular os 3 cenários
  const conservador = calcularCenario(CenarioId.CONSERVADOR, inputs, derivadas);
  const base = calcularCenario(CenarioId.BASE, inputs, derivadas);
  const otimista = calcularCenario(CenarioId.OTIMISTA, inputs, derivadas);

  const cenarios = [conservador, base, otimista];

  // Verificar se algum cenário teve capacidade negativa clamped a 0
  const cenarioNegativoClamped =
    (conservador.capacidade === 0 && (conservador.cfads <= 0 || conservador.capacidadeMultiplo < 0)) ||
    (base.capacidade === 0 && (base.cfads <= 0 || base.capacidadeMultiplo < 0));

  // Texto quando cenário conservador é zero
  let textoNegativoClamped: string | undefined;
  if (cenarioNegativoClamped) {
    if (base.capacidade === 0) {
      textoNegativoClamped =
        'No cenário base, a geração de caixa não suporta endividamento. ' +
        'Recomendamos priorizar o aumento da margem operacional antes de buscar crédito.';
    } else {
      textoNegativoClamped =
        'No cenário conservador (stress -20% EBITDA), a capacidade seria negativa. ' +
        'A faixa inferior foi ajustada para R$ 0. Isso indica que, sob pressão, ' +
        'a empresa teria dificuldade em servir dívida adicional.';
    }
  }

  // Múltiplos D/EBITDA equivalentes
  const ebitdaBase = derivadas.ebitda > 0 ? derivadas.ebitda : 1;
  const multiploInferior = conservador.capacidade / ebitdaBase;
  const multiploPontoMedio = base.capacidade / ebitdaBase;
  const multiploSuperior = otimista.capacidade / ebitdaBase;

  // Texto interpretativo
  const textoInterpretativo = gerarTextoInterpretativo(
    conservador.capacidade,
    base.capacidade,
    otimista.capacidade,
    multiploPontoMedio,
    derivadas.ebitda
  );

  return {
    limiteInferior: conservador.capacidade,
    pontoMedio: base.capacidade,
    limiteSuperior: otimista.capacidade,
    multiploInferior,
    multiploPontoMedio,
    multiploSuperior,
    textoInterpretativo,
    cenarios,
    cenarioNegativoClamped,
    textoNegativoClamped,
  };
}

/**
 * Gera o texto interpretativo principal abaixo da barra de faixa.
 *
 * Exemplos:
 *   "Sua empresa pode sustentar entre R$ 2,8 milhões e R$ 5,1 milhões
 *    em dívida total, equivalente a 1,9x–3,5x o EBITDA."
 *
 *   "Sua empresa tem capacidade limitada de endividamento.
 *    No melhor cenário, suportaria até R$ 890 mil (0,6x EBITDA)."
 */
function gerarTextoInterpretativo(
  inferior: number,
  medio: number,
  superior: number,
  multiploMedio: number,
  ebitda: number
): string {
  // Caso especial: capacidade base é zero
  if (medio === 0) {
    if (superior > 0) {
      return (
        `A geração de caixa atual não suporta endividamento no cenário base. ` +
        `Apenas em condições otimistas haveria capacidade de até ${formatarMoeda(superior)}.`
      );
    }
    return (
      'A geração de caixa atual não suporta endividamento em nenhum cenário. ' +
      'Priorize o aumento da margem operacional ou a redução do ciclo de caixa.'
    );
  }

  // Caso normal: faixa com valores positivos
  if (inferior > 0) {
    const multiploInf = ebitda > 0 ? inferior / ebitda : 0;
    const multiploSup = ebitda > 0 ? superior / ebitda : 0;
    return (
      `Sua empresa pode sustentar entre ${formatarMoeda(inferior)} e ${formatarMoeda(superior)} ` +
      `em dívida total, equivalente a ${formatarMultiplo(multiploInf)}–${formatarMultiplo(multiploSup)} o EBITDA.`
    );
  }

  // Faixa começa do zero (conservador clamped)
  return (
    `No cenário base, sua empresa suportaria até ${formatarMoeda(medio)} em dívida ` +
    `(${formatarMultiplo(multiploMedio)} EBITDA). Sob stress, a capacidade cairia para zero.`
  );
}

// =============================================================================
// CAPACIDADE RESIDUAL (quando já tem dívida)
// =============================================================================

/**
 * Calcula a capacidade residual: quanto a empresa ainda pode tomar emprestado
 * além da dívida que já tem.
 *
 * Residual = Capacidade total do cenário - Dívida atual
 *
 * Se residual for negativo, significa que a empresa já está acima da
 * capacidade recomendada para aquele cenário.
 *
 * @param faixaDivida - Faixa de dívida calculada
 * @param dividaAtual - Dívida bruta atual
 * @returns Capacidade residual com texto interpretativo
 */
export function calcularCapacidadeResidual(
  faixaDivida: FaixaDivida,
  dividaAtual: number
): CapacidadeResidual {
  const residualConservador = faixaDivida.limiteInferior - dividaAtual;
  const residualBase = faixaDivida.pontoMedio - dividaAtual;
  const residualOtimista = faixaDivida.limiteSuperior - dividaAtual;

  const textoInterpretativo = gerarTextoResidual(
    residualConservador,
    residualBase,
    residualOtimista,
    dividaAtual,
    faixaDivida.pontoMedio
  );

  return {
    residualBase,
    residualConservador,
    residualOtimista,
    textoInterpretativo,
  };
}

/**
 * Gera o texto interpretativo para a capacidade residual.
 *
 * 4 cenários de texto:
 *   1. Residual positivo em todos os cenários: "folga"
 *   2. Residual negativo no conservador mas positivo no base: "na faixa"
 *   3. Residual negativo no base: "acima da capacidade recomendada"
 *   4. Residual negativo em todos: "significativamente acima"
 */
function gerarTextoResidual(
  residualConservador: number,
  residualBase: number,
  residualOtimista: number,
  dividaAtual: number,
  capacidadeBase: number
): string {
  // Todos positivos: empresa tem folga
  if (residualConservador > 0) {
    return (
      `Com ${formatarMoeda(dividaAtual)} em dívida atual, sua empresa ainda tem capacidade ` +
      `residual de ${formatarMoeda(residualBase)} no cenário base. ` +
      `Mesmo sob stress, haveria folga de ${formatarMoeda(residualConservador)}.`
    );
  }

  // Conservador negativo, base positivo: na faixa, mas sem margem de segurança
  if (residualBase > 0) {
    return (
      `Sua dívida atual de ${formatarMoeda(dividaAtual)} está dentro da capacidade base ` +
      `(folga de ${formatarMoeda(residualBase)}), mas excede o limite conservador. ` +
      `Em cenário de stress, a dívida atual ultrapassaria a capacidade recomendada.`
    );
  }

  // Base negativo, otimista positivo: acima da capacidade recomendada
  if (residualOtimista > 0) {
    const excesso = Math.abs(residualBase);
    return (
      `Sua dívida atual de ${formatarMoeda(dividaAtual)} excede a capacidade recomendada ` +
      `em ${formatarMoeda(excesso)} no cenário base. ` +
      `Considere um plano de desalavancagem ou renegociação de prazos.`
    );
  }

  // Todos negativos: significativamente acima
  const excesso = Math.abs(residualBase);
  return (
    `Sua dívida atual de ${formatarMoeda(dividaAtual)} está ${formatarMoeda(excesso)} acima ` +
    `da capacidade recomendada em todos os cenários. ` +
    `Recomendamos prioridade máxima na redução do endividamento.`
  );
}
