/**
 * =============================================================================
 * CALCULADORA DE CAPACIDADE DE ENDIVIDAMENTO — DeFin Global
 * =============================================================================
 *
 * Tipos e interfaces do motor de cálculo.
 *
 * Referências:
 *   - Modelo decisório: MODELO_DECISORIO_Calculadora_Endividamento.md
 *   - UX spec: UX_MICROCOPY_Calculadora_Endividamento.md
 *   - Damodaran/NYU Stern (small firms): ratings sintéticos por ICR
 *   - Federal Reserve: ICR e taxas de default
 *   - JPMorgan Working Capital Index: NCG/Receita benchmarks
 *   - OCDE: stress testing corporativo (-20% EBITDA, +200bps)
 *   - CFI/Offermarket: DSCR covenant mínimo 1.25x
 *
 * @version 1.0.0
 * @date Abril 2026
 */

// =============================================================================
// ENUMS
// =============================================================================

/**
 * Setores de atuação com parâmetros de referência calibrados.
 *
 * Fontes: Capstone Partners Q4 2025, FullRatio 2024-2025, Damodaran NYU 2025.
 * Ajuste Brasil: +0.5x spread sobre benchmarks globais (custo de capital e risco-país).
 */
export enum Setor {
  TECNOLOGIA_SAAS       = 'tecnologia_saas',
  SERVICOS_PROFISSIONAIS = 'servicos_profissionais',
  INDUSTRIA_MANUFATURA  = 'industria_manufatura',
  COMERCIO_VAREJO       = 'comercio_varejo',
  AGRONEGOCIO           = 'agronegocio',
  SAUDE_EDUCACAO        = 'saude_educacao',
  LOGISTICA_TRANSPORTE  = 'logistica_transporte',
  CONSTRUCAO_INFRA      = 'construcao_infra',
  OUTROS                = 'outros',
}

/**
 * Faixas de saúde financeira do score composto (0-100).
 *
 * Cada faixa gera uma headline, recomendações e CTA distintos.
 */
export enum Faixa {
  VERDE    = 'verde',     // 80-100: Saudável
  AMARELO  = 'amarelo',   // 60-79:  Moderado
  LARANJA  = 'laranja',   // 40-59:  Atenção
  VERMELHO = 'vermelho',  // 0-39:   Restrito
}

/**
 * Faixas individuais de cada métrica (semáforo).
 */
export enum FaixaMetrica {
  VERDE    = 'verde',
  AMARELO  = 'amarelo',
  LARANJA  = 'laranja',
  VERMELHO = 'vermelho',
}

/**
 * Identificadores das métricas do motor de scoring.
 */
export enum MetricaId {
  D_EBITDA      = 'd_ebitda',
  ICR           = 'icr',
  DSCR          = 'dscr',
  NCG_RECEITA   = 'ncg_receita',
  CFADS_RECEITA = 'cfads_receita',
}

/**
 * Cenários de stress/upside para cálculo de faixa de dívida.
 */
export enum CenarioId {
  CONSERVADOR = 'conservador',
  BASE        = 'base',
  OTIMISTA    = 'otimista',
}

// =============================================================================
// INPUTS
// =============================================================================

/**
 * Inputs obrigatórios do usuário (Tela 1 — campos básicos).
 */
export interface InputsObrigatorios {
  /** Receita anual bruta em R$. Range: 1_000_000 – 500_000_000 */
  receitaAnual: number;

  /** Margem EBITDA em percentual (ex: 15 para 15%). Range: 1 – 60 */
  margemEbitdaPct: number;

  /** Ciclo de caixa em dias. Range: 0 – 365 */
  cicloCaixaDias: number;
}

/**
 * Inputs opcionais (accordion "Refinar meu resultado").
 * Cada campo tem um default calculado se não informado.
 */
export interface InputsOpcionais {
  /** Setor de atuação. Default: 'outros' */
  setor?: Setor;

  /** Dívida bruta atual em R$. Default: 0 */
  dividaAtual?: number;

  /** Taxa de juros média ponderada (decimal, ex: 0.1425 para 14.25%). Default: CDI + 3% */
  taxaJurosMedia?: number;

  /** Capex de manutenção anual em R$. Default: receita × capex_pct_setor */
  capexManutencao?: number;
}

/**
 * Inputs completos resolvidos (obrigatórios + opcionais com defaults aplicados).
 */
export interface InputsResolvidos {
  receitaAnual: number;
  margemEbitdaPct: number;
  cicloCaixaDias: number;
  setor: Setor;
  dividaAtual: number;
  taxaJurosMedia: number;
  capexManutencao: number;
}

// =============================================================================
// VARIÁVEIS DERIVADAS (Camada 2)
// =============================================================================

/**
 * Variáveis calculadas a partir dos inputs.
 * Usadas internamente pelo motor; algumas exibidas na tela de resultado.
 */
export interface VariaveisDerivadas {
  /** EBITDA = Receita × (Margem / 100) */
  ebitda: number;

  /** Necessidade de capital de giro = (Receita / 365) × CicloCaixa */
  ncg: number;

  /** NCG como % da receita */
  ncgPctReceita: number;

  /** Capex de manutenção (informado ou default do setor) */
  capexManutencao: number;

  /**
   * Cash Flow Available for Debt Service.
   * CFADS = EBITDA × (1 - 0.34) - Capex
   *
   * Métrica central do modelo. Reflete o caixa realmente disponível
   * para servir dívida após impostos (34%) e manutenção da operação.
   */
  cfads: number;

  /** CFADS como % da receita */
  cfadsPctReceita: number;

  /** Despesa financeira anual = Dívida × Taxa */
  despesaFinanceira: number;

  /**
   * Serviço da dívida anual (P+I).
   * = Despesa financeira + (Dívida / 5)
   *
   * Premissa: prazo médio de 5 anos, amortização linear (SAC).
   */
  servicoDividaAnual: number;

  /** Flag: empresa tem dívida informada */
  temDivida: boolean;

  /** Flag: CFADS é negativo (edge case 1) */
  cfadsNegativo: boolean;
}

// =============================================================================
// MÉTRICAS (Camada 3)
// =============================================================================

/**
 * Resultado de uma métrica individual com valor, pontuação e classificação.
 */
export interface ResultadoMetrica {
  /** Identificador da métrica */
  id: MetricaId;

  /** Nome legível da métrica */
  nome: string;

  /** Nome curto para exibição em cards */
  nomeCurto: string;

  /** Valor calculado (ex: 2.15 para D/EBITDA de 2.15x) */
  valor: number;

  /** Valor formatado para exibição (ex: "2.1x", "15,3%") */
  valorFormatado: string;

  /** Pontos obtidos na escala da métrica */
  pontos: number;

  /** Peso máximo da métrica (pontos possíveis) */
  pesoMaximo: number;

  /** Faixa da métrica (verde/amarelo/laranja/vermelho) */
  faixa: FaixaMetrica;

  /** Texto de referência para a faixa (o que significa na prática) */
  textoReferencia: string;

  /** Se a métrica é aplicável (ex: ICR não se aplica sem dívida) */
  aplicavel: boolean;

  /** Texto quando não aplicável (ex: "Sem dívida atual") */
  textoNaoAplicavel?: string;
}

// =============================================================================
// SCORING (Camada 3)
// =============================================================================

/**
 * Resultado do motor de scoring com score composto e classificação.
 */
export interface ResultadoScoring {
  /** Score composto (0-100) */
  score: number;

  /** Score antes de penalidades de edge cases */
  scorePrePenalidade: number;

  /** Penalidade aplicada (0, -15 ou -25) */
  penalidade: number;

  /** Razão da penalidade, se aplicada */
  razaoPenalidade?: string;

  /** Faixa resultante */
  faixa: Faixa;

  /** Label da faixa para UI */
  faixaLabel: string;

  /** Detalhamento por métrica */
  metricas: ResultadoMetrica[];

  /** Métrica mais fraca (menor % de aproveitamento do peso) */
  metricaMaisFraca: ResultadoMetrica;
}

// =============================================================================
// CENÁRIOS (Camada 3)
// =============================================================================

/**
 * Premissas de um cenário de stress/upside.
 */
export interface PremissasCenario {
  /** Multiplicador sobre EBITDA (ex: 0.80 para -20%) */
  ebitdaMult: number;

  /** Multiplicador sobre Capex (ex: 1.20 para +20%) */
  capexMult: number;

  /** Ajuste absoluto na taxa de juros (ex: 0.02 para +200bps) */
  taxaAjuste: number;

  /** Múltiplo D/EBITDA máximo para o cenário */
  multiploMax: number;

  /** DSCR mínimo exigido no cenário */
  dscrMinimo: number;

  /** Ajuste no ciclo de caixa em dias (ex: +15 para conservador) */
  cicloCaixaAjuste: number;
}

/**
 * Resultado de um cenário com capacidade de dívida calculada.
 */
export interface ResultadoCenario {
  /** Identificador do cenário */
  id: CenarioId;

  /** Label para UI */
  label: string;

  /** EBITDA ajustado pelo cenário */
  ebitda: number;

  /** CFADS ajustado pelo cenário */
  cfads: number;

  /** Capacidade por múltiplo de alavancagem */
  capacidadeMultiplo: number;

  /** Capacidade por fluxo de caixa */
  capacidadeFluxo: number;

  /**
   * Capacidade final = MIN(múltiplo, fluxo).
   * Floor em 0 (edge case 2: capacidade negativa).
   */
  capacidade: number;

  /** Capacidade como múltiplo do EBITDA base */
  capacidadeMultiploEbitda: number;

  /** Qual limite foi binding (múltiplo ou fluxo) */
  limitBinding: 'multiplo' | 'fluxo';

  /** Tooltip com premissas do cenário */
  tooltipPremissas: string;
}

// =============================================================================
// INSIGHTS E RECOMENDAÇÕES (Camada 4)
// =============================================================================

/**
 * Insight dinâmico baseado na métrica mais fraca.
 */
export interface Insight {
  /** Título curto do insight */
  titulo: string;

  /** Texto completo do insight com valores interpolados */
  texto: string;

  /** Métrica que originou o insight */
  metricaOrigem: MetricaId;

  /** Ação quantificada (ex: "cada 10 dias a menos libera R$ 822 mil") */
  acaoQuantificada?: string;
}

/**
 * Recomendação para o usuário.
 */
export interface Recomendacao {
  /** Texto da recomendação */
  texto: string;

  /** Prioridade (1 = mais importante) */
  prioridade: number;
}

/**
 * Resultado completo das recomendações.
 */
export interface ResultadoRecomendacoes {
  /** Headline principal (varia por faixa × tem/não tem dívida) */
  headline: string;

  /** Subtexto abaixo da headline */
  subtexto: string;

  /** Texto da recomendação principal (parágrafo) */
  recomendacaoPrincipal: string;

  /** Lista de recomendações secundárias (bullets) */
  recomendacoes: Recomendacao[];

  /** Insight dinâmico baseado na métrica mais fraca */
  insight: Insight;

  /** Texto do CTA */
  ctaTexto: string;

  /** Texto contextual acima do CTA */
  ctaContexto: string;
}

// =============================================================================
// FAIXA DE DÍVIDA (Output principal)
// =============================================================================

/**
 * Faixa segura de dívida — output visual principal da calculadora.
 */
export interface FaixaDivida {
  /** Limite inferior (cenário conservador). Mínimo: 0 */
  limiteInferior: number;

  /** Ponto médio (cenário base) */
  pontoMedio: number;

  /** Limite superior (cenário otimista) */
  limiteSuperior: number;

  /** Múltiplo D/EBITDA equivalente ao limite inferior */
  multiploInferior: number;

  /** Múltiplo D/EBITDA equivalente ao ponto médio */
  multiploPontoMedio: number;

  /** Múltiplo D/EBITDA equivalente ao limite superior */
  multiploSuperior: number;

  /** Texto interpretativo para o usuário */
  textoInterpretativo: string;

  /** Detalhamento dos 3 cenários */
  cenarios: ResultadoCenario[];

  /** Flag: algum cenário teve capacidade negativa clamped a 0 */
  cenarioNegativoClamped: boolean;

  /** Texto adicional se cenário negativo foi clamped */
  textoNegativoClamped?: string;
}

/**
 * Capacidade residual (quando há dívida atual).
 */
export interface CapacidadeResidual {
  /** Capacidade total (cenário base) menos dívida atual */
  residualBase: number;

  /** Capacidade total (conservador) menos dívida atual */
  residualConservador: number;

  /** Capacidade total (otimista) menos dívida atual */
  residualOtimista: number;

  /** Texto interpretativo */
  textoInterpretativo: string;
}

// =============================================================================
// RESULTADO FINAL (Camada 4 — output completo)
// =============================================================================

/**
 * Resultado completo da calculadora — tudo que a UI precisa para renderizar.
 */
export interface ResultadoCalculadora {
  /** Inputs resolvidos (com defaults aplicados) */
  inputs: InputsResolvidos;

  /** Variáveis derivadas */
  derivadas: VariaveisDerivadas;

  /** Resultado do scoring */
  scoring: ResultadoScoring;

  /** Faixa segura de dívida */
  faixaDivida: FaixaDivida;

  /** Capacidade residual (se tem dívida) */
  capacidadeResidual?: CapacidadeResidual;

  /** Recomendações e insights */
  recomendacoes: ResultadoRecomendacoes;

  /** Timestamp do cálculo */
  calculadoEm: string;

  /** Versão do motor */
  versaoMotor: string;
}

// =============================================================================
// VALIDAÇÃO
// =============================================================================

/**
 * Resultado da validação de um campo.
 */
export interface ValidacaoCampo {
  /** Campo é válido? */
  valido: boolean;

  /** Mensagem de erro (se inválido) */
  mensagem?: string;

  /** Tipo de erro */
  tipo?: 'vazio' | 'fora_range' | 'formato_invalido' | 'aviso';
}

/**
 * Resultado da validação completa dos inputs.
 */
export interface ValidacaoInputs {
  /** Todos os campos são válidos? */
  valido: boolean;

  /** Validação por campo */
  campos: Record<string, ValidacaoCampo>;

  /** Primeiro campo com erro (para scroll automático) */
  primeiroCampoErro?: string;
}

// =============================================================================
// PARÂMETROS DO SETOR
// =============================================================================

/**
 * Parâmetros de referência por setor, usados para defaults e contextualização.
 */
export interface ParametrosSetor {
  /** Identificador */
  id: Setor;

  /** Nome legível */
  nome: string;

  /** Range de D/EBITDA referência: [min, max] */
  dEbitdaRef: [number, number];

  /** Range de CCC médio em dias: [min, max] */
  cccMedioDias: [number, number];

  /** Range de margem EBITDA típica: [min, max] */
  margemEbitdaRef: [number, number];

  /** Range de capex manutenção como % receita: [min, max] */
  capexPctRef: [number, number];

  /** Capex default como % da receita (ponto médio) */
  capexDefaultPct: number;

  /** Se o setor justifica ajuste nas faixas de D/EBITDA (+0.5x) */
  ajusteFaixaDEbitda: boolean;
}
