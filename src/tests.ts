/**
 * =============================================================================
 * SUITE DE TESTES — CALCULADORA DE CAPACIDADE DE ENDIVIDAMENTO
 * =============================================================================
 *
 * 12 cenários de teste cobrindo:
 *   - Cenários normais (verde, amarelo, laranja, vermelho)
 *   - Edge cases (CFADS negativo, sem dívida com margem baixa, super-alavancado)
 *   - Todos os setores
 *   - Validação de inputs
 *   - Cross-validations
 *   - Formatadores
 *
 * Para rodar: npx tsx src/tests.ts
 *
 * @version 1.0.0
 * @date Abril 2026
 */

import { Setor, Faixa, FaixaMetrica, MetricaId, CenarioId } from './types';
import { resolverInputs, calcularVariaveisDerivadas, calcularScoring } from './engine';
import { calcularFaixaDivida, calcularCapacidadeResidual, calcularCenario } from './scenarios';
import { gerarResultadoRecomendacoes } from './recommendations';
import { validarInputs } from './validation';
import {
  formatarMoeda,
  formatarMoedaCompleta,
  formatarMultiplo,
  formatarPercentual,
  formatarTaxa,
  formatarScore,
  formatarDias,
} from './formatters';
import { PREMISSAS, SETORES, CENARIOS } from './constants';

// =============================================================================
// TEST RUNNER (minimal, no dependencies)
// =============================================================================

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string, detail?: string): void {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${testName}`);
  } else {
    failedTests++;
    const msg = detail ? `${testName}: ${detail}` : testName;
    failures.push(msg);
    console.log(`  ✗ ${testName}${detail ? ` — ${detail}` : ''}`);
  }
}

function assertApprox(actual: number, expected: number, tolerance: number, testName: string): void {
  const diff = Math.abs(actual - expected);
  assert(
    diff <= tolerance,
    testName,
    diff > tolerance ? `expected ~${expected}, got ${actual} (diff: ${diff.toFixed(4)})` : undefined
  );
}

function section(name: string): void {
  console.log(`\n═══ ${name} ═══`);
}

// =============================================================================
// TEST 1: Serviços Profissionais — Sem dívida, margem 15%
// Expectativa: Score alto (verde), boa capacidade
// =============================================================================

section('TEST 1: Serviços Profissionais — Sem dívida, margem 15%');

(() => {
  const inputs = resolverInputs(
    { receitaAnual: 10_000_000, margemEbitdaPct: 15, cicloCaixaDias: 45 },
    { setor: Setor.SERVICOS_PROFISSIONAIS }
  );

  assert(inputs.setor === Setor.SERVICOS_PROFISSIONAIS, 'Setor resolvido');
  assert(inputs.dividaAtual === 0, 'Dívida default = 0');
  assert(inputs.taxaJurosMedia === PREMISSAS.TAXA_JUROS_DEFAULT, 'Taxa default CDI+3%');
  assertApprox(inputs.capexManutencao, 200_000, 1, 'Capex = receita × 2% (setor serviços)');

  const derivadas = calcularVariaveisDerivadas(inputs);
  assertApprox(derivadas.ebitda, 1_500_000, 1, 'EBITDA = 10M × 15%');
  assertApprox(derivadas.cfads, 1_500_000 * 0.66 - 200_000, 1, 'CFADS = EBITDA×0.66 - capex');
  assert(derivadas.cfads > 0, 'CFADS positivo');
  assert(!derivadas.temDivida, 'Sem dívida');

  const scoring = calcularScoring(inputs, derivadas);
  // Sem dívida: D/EBITDA=25, ICR=20, DSCR=25 (automáticos)
  assert(scoring.scorePrePenalidade >= 70, `Score pré-penalidade >= 70 (got ${scoring.scorePrePenalidade})`);
  assert(scoring.penalidade === 0, 'Sem penalidade (CFADS ok)');
  assert(scoring.faixa === Faixa.VERDE || scoring.faixa === Faixa.AMARELO, `Faixa verde ou amarela (got ${scoring.faixa})`);

  const faixa = calcularFaixaDivida(inputs, derivadas);
  assert(faixa.pontoMedio > 0, 'Capacidade base > 0');
  assert(faixa.limiteInferior <= faixa.pontoMedio, 'Conservador <= Base');
  assert(faixa.pontoMedio <= faixa.limiteSuperior, 'Base <= Otimista');
})();

// =============================================================================
// TEST 2: Indústria — Com dívida, margem 12%
// Expectativa: Score moderado, DSCR pode ser o limitador
// =============================================================================

section('TEST 2: Indústria — Com dívida R$ 3M, margem 12%');

(() => {
  const inputs = resolverInputs(
    { receitaAnual: 15_000_000, margemEbitdaPct: 12, cicloCaixaDias: 90 },
    { setor: Setor.INDUSTRIA_MANUFATURA, dividaAtual: 3_000_000 }
  );

  assertApprox(inputs.capexManutencao, 900_000, 1, 'Capex = 15M × 6% (indústria)');

  const derivadas = calcularVariaveisDerivadas(inputs);
  assertApprox(derivadas.ebitda, 1_800_000, 1, 'EBITDA = 15M × 12%');
  assert(derivadas.temDivida, 'Tem dívida');

  const dEbitda = inputs.dividaAtual / derivadas.ebitda;
  assertApprox(dEbitda, 1.667, 0.01, 'D/EBITDA ≈ 1.67x');

  const scoring = calcularScoring(inputs, derivadas);
  assert(scoring.penalidade === 0, 'Sem penalidade (tem dívida)');

  // DSCR deve ser rigoroso (pós-imposto, pós-capex)
  const dscrMetrica = scoring.metricas.find(m => m.id === MetricaId.DSCR)!;
  assert(dscrMetrica.aplicavel, 'DSCR aplicável (tem dívida)');
  // CFADS = 1.8M × 0.66 - 0.9M = 0.288M
  // Serviço = 3M × 0.1425 + 3M/5 = 0.4275 + 0.6 = 1.0275M
  // DSCR = 0.288/1.0275 ≈ 0.28
  assert(dscrMetrica.valor < 1, `DSCR < 1 (got ${dscrMetrica.valor.toFixed(2)})`);

  const faixa = calcularFaixaDivida(inputs, derivadas);
  const residual = calcularCapacidadeResidual(faixa, inputs.dividaAtual);
  assert(residual !== undefined, 'Capacidade residual calculada');
  assert(residual!.textoInterpretativo.length > 0, 'Texto interpretativo residual');
})();

// =============================================================================
// TEST 3: SaaS — Alta margem, sem dívida
// Expectativa: Score verde, alta capacidade
// =============================================================================

section('TEST 3: Tecnologia SaaS — Margem 30%, sem dívida');

(() => {
  const inputs = resolverInputs(
    { receitaAnual: 20_000_000, margemEbitdaPct: 30, cicloCaixaDias: 35 },
    { setor: Setor.TECNOLOGIA_SAAS }
  );

  const derivadas = calcularVariaveisDerivadas(inputs);
  assertApprox(derivadas.ebitda, 6_000_000, 1, 'EBITDA = 20M × 30%');

  // CFADS deve ser alto: 6M × 0.66 - 0.6M = 3.36M
  assertApprox(derivadas.cfads, 3_360_000, 1, 'CFADS = 3.36M');
  assertApprox(derivadas.cfadsPctReceita, 16.8, 0.1, 'CFADS/Receita = 16.8%');

  const scoring = calcularScoring(inputs, derivadas);
  assert(scoring.score >= 80, `Score >= 80 (got ${scoring.score})`);
  assert(scoring.faixa === Faixa.VERDE, 'Faixa verde');
  assert(scoring.penalidade === 0, 'Sem penalidade');

  // NCG/Receita deve ser boa (35 dias de ciclo)
  const ncgMetrica = scoring.metricas.find(m => m.id === MetricaId.NCG_RECEITA)!;
  assert(ncgMetrica.faixa === FaixaMetrica.VERDE || ncgMetrica.faixa === FaixaMetrica.AMARELO,
    `NCG/Receita verde ou amarela (got ${ncgMetrica.faixa})`);

  const faixa = calcularFaixaDivida(inputs, derivadas);
  assert(faixa.pontoMedio > 9_000_000, `Capacidade base > R$9M (got ${faixa.pontoMedio.toFixed(0)})`);
})();

// =============================================================================
// TEST 4: Comércio — Margem baixa (5%), sem dívida
// Edge case 3: Score inflado? Deve ter penalidade
// =============================================================================

section('TEST 4: Comércio — Margem 5%, sem dívida (edge case 3)');

(() => {
  const inputs = resolverInputs(
    { receitaAnual: 30_000_000, margemEbitdaPct: 5, cicloCaixaDias: 30 },
    { setor: Setor.COMERCIO_VAREJO }
  );

  const derivadas = calcularVariaveisDerivadas(inputs);
  assertApprox(derivadas.ebitda, 1_500_000, 1, 'EBITDA = 30M × 5%');

  // CFADS = 1.5M × 0.66 - 0.9M = 0.09M
  // CFADS/Receita = 0.09/30 × 100 = 0.3%
  assert(derivadas.cfadsPctReceita < 2, `CFADS/Receita < 2% (got ${derivadas.cfadsPctReceita.toFixed(2)}%)`);

  const scoring = calcularScoring(inputs, derivadas);
  // Deve ter penalidade por CFADS baixo sem dívida
  assert(scoring.penalidade < 0, `Penalidade aplicada (got ${scoring.penalidade})`);
  assert(scoring.razaoPenalidade !== undefined, 'Razão da penalidade presente');
})();

// =============================================================================
// TEST 5: Agronegócio — Ciclo longo (150 dias)
// Expectativa: NCG/Receita é o limitador
// =============================================================================

section('TEST 5: Agronegócio — Ciclo 150 dias');

(() => {
  const inputs = resolverInputs(
    { receitaAnual: 25_000_000, margemEbitdaPct: 18, cicloCaixaDias: 150 },
    { setor: Setor.AGRONEGOCIO }
  );

  const derivadas = calcularVariaveisDerivadas(inputs);
  // NCG = (25M/365) × 150 = 10.27M
  // NCG/Receita = 41.1%
  assertApprox(derivadas.ncgPctReceita, 41.1, 0.5, 'NCG/Receita ≈ 41%');

  const scoring = calcularScoring(inputs, derivadas);
  const ncg = scoring.metricas.find(m => m.id === MetricaId.NCG_RECEITA)!;
  assert(ncg.faixa === FaixaMetrica.VERMELHO, `NCG/Receita vermelha (got ${ncg.faixa})`);

  // NCG should be or be near the weakest metric
  assert(
    scoring.metricaMaisFraca.id === MetricaId.NCG_RECEITA ||
    scoring.metricaMaisFraca.id === MetricaId.CFADS_RECEITA,
    `Métrica mais fraca é NCG ou CFADS (got ${scoring.metricaMaisFraca.id})`
  );
})();

// =============================================================================
// TEST 6: Super-alavancado — Dívida = 5x EBITDA
// Expectativa: Score vermelho, D/EBITDA vermelho
// =============================================================================

section('TEST 6: Super-alavancado — D/EBITDA 5x+');

(() => {
  const inputs = resolverInputs(
    { receitaAnual: 10_000_000, margemEbitdaPct: 15, cicloCaixaDias: 60 },
    { setor: Setor.OUTROS, dividaAtual: 8_000_000 }
  );

  const derivadas = calcularVariaveisDerivadas(inputs);
  const dEbitda = inputs.dividaAtual / derivadas.ebitda;
  assertApprox(dEbitda, 5.33, 0.1, 'D/EBITDA ≈ 5.3x');

  const scoring = calcularScoring(inputs, derivadas);
  const dEbitdaMetrica = scoring.metricas.find(m => m.id === MetricaId.D_EBITDA)!;
  assert(dEbitdaMetrica.faixa === FaixaMetrica.VERMELHO, 'D/EBITDA vermelho');
  assert(dEbitdaMetrica.pontos === 0, 'D/EBITDA 0 pontos');

  assert(scoring.faixa === Faixa.VERMELHO || scoring.faixa === Faixa.LARANJA,
    `Faixa vermelha ou laranja (got ${scoring.faixa})`);

  // Capacidade residual deve ser negativa
  const faixa = calcularFaixaDivida(inputs, derivadas);
  const residual = calcularCapacidadeResidual(faixa, inputs.dividaAtual);
  assert(residual.residualBase < 0, `Residual base negativo (got ${residual.residualBase.toFixed(0)})`);
})();

// =============================================================================
// TEST 7: Margem mínima (2%) — Edge case CFADS negativo
// =============================================================================

section('TEST 7: Margem 2% — CFADS negativo (edge case 1)');

(() => {
  const inputs = resolverInputs(
    { receitaAnual: 50_000_000, margemEbitdaPct: 2, cicloCaixaDias: 60 },
    { setor: Setor.INDUSTRIA_MANUFATURA } // capex 6% = 3M
  );

  const derivadas = calcularVariaveisDerivadas(inputs);
  // EBITDA = 1M, CFADS = 1M × 0.66 - 3M = -2.34M
  assert(derivadas.cfadsNegativo, 'CFADS negativo');

  const scoring = calcularScoring(inputs, derivadas);
  assert(scoring.penalidade === -25, 'Penalidade -25 (CFADS negativo sem dívida)');

  const faixa = calcularFaixaDivida(inputs, derivadas);
  // All scenarios should have capacity = 0 or very low
  assert(faixa.pontoMedio === 0 || faixa.limiteInferior === 0,
    'Capacidade zero em pelo menos um cenário');
})();

// =============================================================================
// TEST 8: Cenários individuais
// =============================================================================

section('TEST 8: Verificação de cenários individuais');

(() => {
  const inputs = resolverInputs(
    { receitaAnual: 20_000_000, margemEbitdaPct: 20, cicloCaixaDias: 45 },
    { setor: Setor.TECNOLOGIA_SAAS }
  );
  const derivadas = calcularVariaveisDerivadas(inputs);

  const conservador = calcularCenario(CenarioId.CONSERVADOR, inputs, derivadas);
  const base = calcularCenario(CenarioId.BASE, inputs, derivadas);
  const otimista = calcularCenario(CenarioId.OTIMISTA, inputs, derivadas);

  // EBITDA adjustments
  assertApprox(conservador.ebitda, derivadas.ebitda * 0.80, 1, 'Conservador: EBITDA -20%');
  assertApprox(base.ebitda, derivadas.ebitda, 1, 'Base: EBITDA unchanged');
  assertApprox(otimista.ebitda, derivadas.ebitda * 1.10, 1, 'Otimista: EBITDA +10%');

  // Capacity ordering
  assert(conservador.capacidade <= base.capacidade, 'Conservador ≤ Base');
  assert(base.capacidade <= otimista.capacidade, 'Base ≤ Otimista');

  // Each capacity = MIN(multiplo, fluxo)
  assert(
    conservador.capacidade <= conservador.capacidadeMultiplo &&
    conservador.capacidade <= conservador.capacidadeFluxo,
    'Conservador: cap = MIN(multiplo, fluxo)'
  );

  // Tooltips
  assert(conservador.tooltipPremissas.includes('stress'), 'Tooltip conservador menciona stress');
  assert(base.tooltipPremissas.includes('base'), 'Tooltip base menciona base');
  assert(otimista.tooltipPremissas.includes('otimista'), 'Tooltip otimista menciona otimista');
})();

// =============================================================================
// TEST 9: Recomendações — cobertura de faixas e dívida
// =============================================================================

section('TEST 9: Recomendações por faixa');

(() => {
  // Verde sem dívida
  const inputsVerde = resolverInputs(
    { receitaAnual: 20_000_000, margemEbitdaPct: 25, cicloCaixaDias: 30 },
    { setor: Setor.TECNOLOGIA_SAAS }
  );
  const derivadasVerde = calcularVariaveisDerivadas(inputsVerde);
  const scoringVerde = calcularScoring(inputsVerde, derivadasVerde);
  const faixaVerde = calcularFaixaDivida(inputsVerde, derivadasVerde);
  const recsVerde = gerarResultadoRecomendacoes(scoringVerde, faixaVerde, inputsVerde, derivadasVerde);

  assert(recsVerde.headline.length > 0, 'Headline presente (verde)');
  assert(recsVerde.subtexto.length > 0, 'Subtexto presente');
  assert(recsVerde.recomendacaoPrincipal.length > 0, 'Recomendação principal presente');
  assert(recsVerde.recomendacoes.length >= 1, 'Pelo menos 1 recomendação secundária');
  assert(recsVerde.insight.titulo.length > 0, 'Insight tem título');
  assert(recsVerde.insight.acaoQuantificada !== undefined, 'Insight tem ação quantificada');
  assert(recsVerde.ctaTexto.length > 0, 'CTA presente');

  // Vermelho com dívida
  const inputsVerm = resolverInputs(
    { receitaAnual: 10_000_000, margemEbitdaPct: 8, cicloCaixaDias: 90 },
    { setor: Setor.COMERCIO_VAREJO, dividaAtual: 5_000_000 }
  );
  const derivadasVerm = calcularVariaveisDerivadas(inputsVerm);
  const scoringVerm = calcularScoring(inputsVerm, derivadasVerm);
  const faixaVerm = calcularFaixaDivida(inputsVerm, derivadasVerm);
  const residualVerm = calcularCapacidadeResidual(faixaVerm, inputsVerm.dividaAtual);
  const recsVerm = gerarResultadoRecomendacoes(scoringVerm, faixaVerm, inputsVerm, derivadasVerm, residualVerm);

  assert(recsVerm.headline !== recsVerde.headline, 'Headlines diferentes por faixa');
  assert(recsVerm.recomendacoes.some(r => r.prioridade === 1), 'Tem recomendação prioridade 1');
})();

// =============================================================================
// TEST 10: Validação de inputs
// =============================================================================

section('TEST 10: Validação de inputs');

(() => {
  // Válido
  const v1 = validarInputs(
    { receitaAnual: 10_000_000, margemEbitdaPct: 15, cicloCaixaDias: 60 }
  );
  assert(v1.valido, 'Inputs válidos aceitos');

  // Receita abaixo do mínimo
  const v2 = validarInputs(
    { receitaAnual: 500_000, margemEbitdaPct: 15, cicloCaixaDias: 60 }
  );
  assert(!v2.valido, 'Receita < 1M rejeitada');
  assert(v2.campos.receitaAnual.tipo === 'fora_range', 'Tipo: fora_range');

  // Margem acima do máximo
  const v3 = validarInputs(
    { receitaAnual: 10_000_000, margemEbitdaPct: 75, cicloCaixaDias: 60 }
  );
  assert(!v3.valido, 'Margem > 60% rejeitada');

  // Campo vazio (undefined)
  const v4 = validarInputs({} as any);
  assert(!v4.valido, 'Campos vazios rejeitados');
  assert(v4.primeiroCampoErro !== undefined, 'Primeiro campo com erro indicado');

  // Warning: margem alta (40-60%)
  const v5 = validarInputs(
    { receitaAnual: 10_000_000, margemEbitdaPct: 45, cicloCaixaDias: 60 }
  );
  assert(v5.valido, 'Margem 45% aceita (warning, não erro)');
  assert(v5.campos.margemEbitdaPct.tipo === 'aviso', 'Warning emitido para margem alta');

  // Taxa em percentual ao invés de decimal (erro comum)
  const v6 = validarInputs(
    { receitaAnual: 10_000_000, margemEbitdaPct: 15, cicloCaixaDias: 60 },
    { taxaJurosMedia: 14.25 } // deveria ser 0.1425
  );
  assert(!v6.valido, 'Taxa em percentual rejeitada');
  assert(v6.campos.taxaJurosMedia.mensagem?.includes('decimal') ?? false, 'Mensagem sugere formato decimal');

  // Cross-validation: dívida > 5x receita
  const v7 = validarInputs(
    { receitaAnual: 10_000_000, margemEbitdaPct: 15, cicloCaixaDias: 60 },
    { dividaAtual: 60_000_000 }
  );
  assert(v7.valido, 'Dívida alta aceita (é warning)');
  assert(v7.campos.dividaAtual.tipo === 'aviso', 'Warning para dívida > 5x receita');
})();

// =============================================================================
// TEST 11: Formatadores
// =============================================================================

section('TEST 11: Formatadores');

(() => {
  assert(formatarMoeda(0) === 'R$ 0', 'Moeda: zero');
  assert(formatarMoeda(500) === 'R$ 500', 'Moeda: centenas');
  assert(formatarMoeda(890_000) === 'R$ 890 mil', 'Moeda: milhares');
  assert(formatarMoeda(4_600_000) === 'R$ 4,6 milhões', 'Moeda: milhões');
  assert(formatarMoeda(1_000_000) === 'R$ 1 milhão', 'Moeda: 1 milhão (singular)');
  assert(formatarMoeda(1_200_000_000) === 'R$ 1,2 bilhões', 'Moeda: bilhões');
  assert(formatarMoeda(1_000_000_000).includes('1 bilh'), 'Moeda: 1 bilhão (singular)');

  // Negativo
  const neg = formatarMoeda(-500_000);
  assert(neg.includes('−') || neg.includes('-'), 'Moeda negativa tem sinal');
  assert(neg.includes('500'), 'Moeda negativa tem valor absoluto');

  assert(formatarMoedaCompleta(4_568_276) === 'R$ 4.568.276', 'Moeda completa');
  assert(formatarMultiplo(2.15) === '2,1x' || formatarMultiplo(2.15) === '2,2x', 'Múltiplo 2.15 → 2,1x ou 2,2x');
  assert(formatarMultiplo(Infinity) === '∞', 'Múltiplo infinito');
  assert(formatarPercentual(15.3) === '15,3%', 'Percentual');
  assert(formatarTaxa(0.1425) === '14,25%', 'Taxa 14.25%');
  assert(formatarScore(83) === '83/100', 'Score');
  assert(formatarDias(75) === '75 dias', 'Dias plural');
  assert(formatarDias(1) === '1 dia', 'Dia singular');
})();

// =============================================================================
// TEST 12: Resolução de defaults por setor
// =============================================================================

section('TEST 12: Defaults por setor');

(() => {
  const setores = [
    Setor.TECNOLOGIA_SAAS,
    Setor.SERVICOS_PROFISSIONAIS,
    Setor.INDUSTRIA_MANUFATURA,
    Setor.COMERCIO_VAREJO,
    Setor.AGRONEGOCIO,
    Setor.SAUDE_EDUCACAO,
    Setor.LOGISTICA_TRANSPORTE,
    Setor.CONSTRUCAO_INFRA,
    Setor.OUTROS,
  ];

  for (const setor of setores) {
    const params = SETORES[setor];
    const inputs = resolverInputs(
      { receitaAnual: 10_000_000, margemEbitdaPct: 15, cicloCaixaDias: 60 },
      { setor }
    );

    const capexEsperado = 10_000_000 * params.capexDefaultPct;
    assertApprox(inputs.capexManutencao, capexEsperado, 1,
      `${params.nome}: capex = ${(params.capexDefaultPct * 100).toFixed(1)}% receita`);
  }
})();

// =============================================================================
// TEST 13: Integração completa — Full pipeline
// =============================================================================

section('TEST 13: Integração completa');

(() => {
  // Simulates the full calcular() flow manually
  const obrigatorios = { receitaAnual: 15_000_000, margemEbitdaPct: 18, cicloCaixaDias: 50 };
  const opcionais = { setor: Setor.SAUDE_EDUCACAO, dividaAtual: 2_000_000 };

  // Validate
  const validacao = validarInputs(obrigatorios, opcionais);
  assert(validacao.valido, 'Inputs válidos para integração');

  // Resolve
  const inputs = resolverInputs(obrigatorios, opcionais);
  assert(inputs.setor === Setor.SAUDE_EDUCACAO, 'Setor correto');

  // Derive
  const derivadas = calcularVariaveisDerivadas(inputs);
  assert(derivadas.ebitda === 2_700_000, 'EBITDA = 15M × 18%');
  assert(derivadas.temDivida, 'Tem dívida');

  // Score
  const scoring = calcularScoring(inputs, derivadas);
  assert(scoring.score >= 0 && scoring.score <= 100, `Score no range [0,100] (got ${scoring.score})`);
  assert(scoring.metricas.length === 5, '5 métricas calculadas');
  assert(scoring.metricaMaisFraca !== undefined, 'Métrica mais fraca identificada');

  // Faixa
  const faixa = calcularFaixaDivida(inputs, derivadas);
  assert(faixa.cenarios.length === 3, '3 cenários calculados');
  assert(faixa.limiteInferior >= 0, 'Limite inferior ≥ 0');

  // Residual
  const residual = calcularCapacidadeResidual(faixa, inputs.dividaAtual);
  assert(residual.textoInterpretativo.length > 0, 'Texto residual gerado');

  // Recommendations
  const recs = gerarResultadoRecomendacoes(scoring, faixa, inputs, derivadas, residual);
  assert(recs.headline.length > 0, 'Headline gerada');
  assert(recs.insight.metricaOrigem !== undefined, 'Insight vinculado a métrica');

  // Verify all parts connect
  assert(
    scoring.faixa === Faixa.VERDE || scoring.faixa === Faixa.AMARELO ||
    scoring.faixa === Faixa.LARANJA || scoring.faixa === Faixa.VERMELHO,
    'Faixa é um valor válido'
  );
})();

// =============================================================================
// RESULTADO FINAL
// =============================================================================

console.log('\n═══════════════════════════════════════');
console.log(`RESULTADO: ${passedTests}/${totalTests} testes passaram`);
if (failedTests > 0) {
  console.log(`\n${failedTests} FALHA(S):`);
  failures.forEach(f => console.log(`  → ${f}`));
  process.exit(1);
} else {
  console.log('Todos os testes passaram! ✓');
  process.exit(0);
}
