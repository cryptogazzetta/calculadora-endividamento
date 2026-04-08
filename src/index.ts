/**
 * =============================================================================
 * CALCULADORA DE CAPACIDADE DE ENDIVIDAMENTO — DeFin Global
 * =============================================================================
 *
 * Ponto de entrada do motor de cálculo.
 *
 * API pública:
 *   calcular(obrigatorios, opcionais?) → ResultadoCalculadora
 *   validarInputs(obrigatorios, opcionais?) → ValidacaoInputs
 *
 * O fluxo completo:
 *   1. Validação de inputs
 *   2. Resolução de defaults (por setor)
 *   3. Cálculo de variáveis derivadas (EBITDA, NCG, CFADS)
 *   4. Scoring composto (5 métricas → 0-100)
 *   5. Cenários (conservador, base, otimista)
 *   6. Faixa de dívida (output visual principal)
 *   7. Capacidade residual (se tem dívida)
 *   8. Recomendações e insights dinâmicos
 *
 * @version 1.0.0
 * @date Abril 2026
 */

// --- Re-exports públicos ---
export {
  // Enums
  Setor,
  Faixa,
  FaixaMetrica,
  MetricaId,
  CenarioId,
  // Input types
  type InputsObrigatorios,
  type InputsOpcionais,
  type InputsResolvidos,
  // Output types
  type VariaveisDerivadas,
  type ResultadoMetrica,
  type ResultadoScoring,
  type ResultadoCenario,
  type FaixaDivida,
  type CapacidadeResidual,
  type ResultadoRecomendacoes,
  type Insight,
  type Recomendacao,
  type ResultadoCalculadora,
  // Validation types
  type ValidacaoCampo,
  type ValidacaoInputs,
  // Sector params
  type ParametrosSetor,
} from './types';

export { PREMISSAS, SETORES, CENARIOS } from './constants';
export { validarInputs } from './validation';
export {
  formatarMoeda,
  formatarMoedaCompleta,
  formatarMultiplo,
  formatarPercentual,
  formatarTaxa,
  formatarScore,
  formatarDias,
} from './formatters';

// --- Imports internos ---
import {
  InputsObrigatorios,
  InputsOpcionais,
  ResultadoCalculadora,
} from './types';

import { PREMISSAS } from './constants';
import { resolverInputs, calcularVariaveisDerivadas, calcularScoring } from './engine';
import { calcularFaixaDivida, calcularCapacidadeResidual } from './scenarios';
import { gerarResultadoRecomendacoes } from './recommendations';
import { validarInputs } from './validation';

// =============================================================================
// FUNÇÃO PRINCIPAL
// =============================================================================

/**
 * Executa o cálculo completo da capacidade de endividamento.
 *
 * Esta é a função principal e única que o frontend precisa chamar.
 * Ela orquestra todas as camadas do motor e retorna o payload
 * completo para renderização na UI.
 *
 * Fluxo:
 *   1. Valida inputs → lança erro se inválidos
 *   2. Resolve defaults → InputsResolvidos
 *   3. Calcula derivadas → EBITDA, NCG, CFADS, serviço da dívida
 *   4. Calcula scoring → 5 métricas, score 0-100, faixa
 *   5. Calcula cenários → conservador/base/otimista
 *   6. Calcula faixa de dívida → [inferior, médio, superior]
 *   7. Calcula residual → se tem dívida
 *   8. Gera recomendações → headline, insight, CTA
 *
 * @param obrigatorios - Inputs obrigatórios do formulário
 * @param opcionais - Inputs opcionais do accordion
 * @returns ResultadoCalculadora completo (payload para UI)
 * @throws Error se os inputs forem inválidos
 *
 * @example
 * ```typescript
 * import { calcular, Setor } from './calculadora-engine';
 *
 * const resultado = calcular(
 *   { receitaAnual: 10_000_000, margemEbitdaPct: 15, cicloCaixaDias: 60 },
 *   { setor: Setor.SERVICOS_PROFISSIONAIS }
 * );
 *
 * console.log(resultado.scoring.score);        // 72
 * console.log(resultado.scoring.faixaLabel);    // "Moderado"
 * console.log(resultado.faixaDivida.pontoMedio); // 3_960_000
 * console.log(resultado.recomendacoes.headline); // "Sua empresa pode acessar..."
 * ```
 */
export function calcular(
  obrigatorios: InputsObrigatorios,
  opcionais: InputsOpcionais = {}
): ResultadoCalculadora {
  // --- 1. Validação ---
  const validacao = validarInputs(obrigatorios, opcionais);
  if (!validacao.valido) {
    const erros = Object.entries(validacao.campos)
      .filter(([_, v]) => !v.valido && v.tipo !== 'aviso')
      .map(([campo, v]) => `${campo}: ${v.mensagem}`)
      .join('; ');
    throw new Error(`Inputs inválidos: ${erros}`);
  }

  // --- 2. Resolução de defaults ---
  const inputs = resolverInputs(obrigatorios, opcionais);

  // --- 3. Variáveis derivadas ---
  const derivadas = calcularVariaveisDerivadas(inputs);

  // --- 4. Scoring ---
  const scoring = calcularScoring(inputs, derivadas);

  // --- 5-6. Cenários e faixa de dívida ---
  const faixaDivida = calcularFaixaDivida(inputs, derivadas);

  // --- 7. Capacidade residual (se tem dívida) ---
  const capacidadeResidual = derivadas.temDivida
    ? calcularCapacidadeResidual(faixaDivida, inputs.dividaAtual)
    : undefined;

  // --- 8. Recomendações ---
  const recomendacoes = gerarResultadoRecomendacoes(
    scoring,
    faixaDivida,
    inputs,
    derivadas,
    capacidadeResidual
  );

  // --- Resultado final ---
  return {
    inputs,
    derivadas,
    scoring,
    faixaDivida,
    capacidadeResidual,
    recomendacoes,
    calculadoEm: new Date().toISOString(),
    versaoMotor: PREMISSAS.VERSAO_MOTOR,
  };
}
