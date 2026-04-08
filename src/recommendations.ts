/**
 * =============================================================================
 * MOTOR DE RECOMENDAÇÕES E INSIGHTS DINÂMICOS
 * =============================================================================
 *
 * Implementação da Camada 4 do modelo decisório:
 *   - Headline e subtexto por faixa × com/sem dívida (8 combinações)
 *   - Recomendação principal (parágrafo descritivo)
 *   - Recomendações secundárias (bullets acionáveis)
 *   - Insight dinâmico baseado na métrica mais fraca
 *   - CTA com contexto (varia por faixa)
 *
 * Todas as recomendações são genéricas e educativas — nunca constituem
 * aconselhamento financeiro específico (ver §10 do Modelo Decisório).
 *
 * Referências:
 *   - §7 (Recomendações) do Modelo Decisório
 *   - §8 (Insights Dinâmicos)
 *   - UX Microcopy §3 (Tela 3)
 *
 * @version 1.0.0
 * @date Abril 2026
 */

import {
  Faixa,
  MetricaId,
  InputsResolvidos,
  VariaveisDerivadas,
  ResultadoScoring,
  FaixaDivida,
  CapacidadeResidual,
  Insight,
  Recomendacao,
  ResultadoRecomendacoes,
} from './types';

import {
  PREMISSAS,
  SETORES,
} from './constants';

import {
  formatarMoeda,
  formatarMultiplo,
  formatarPercentual,
  formatarDias,
} from './formatters';

// =============================================================================
// HEADLINES E SUBTEXTOS (§7.1)
// =============================================================================

/**
 * Mapa de headlines por faixa × tem/não tem dívida.
 * 8 combinações no total.
 *
 * Tom: confiante e não-alarmista. Mesmo na faixa vermelha, o texto
 * não é catastrofista — indica a situação e oferece caminho.
 */
const HEADLINES: Record<Faixa, { comDivida: string; semDivida: string }> = {
  [Faixa.VERDE]: {
    semDivida: 'Sua empresa tem uma base sólida para buscar crédito.',
    comDivida: 'Sua estrutura de dívida está saudável.',
  },
  [Faixa.AMARELO]: {
    semDivida: 'Sua empresa pode acessar crédito, com atenção aos limites.',
    comDivida: 'Sua dívida está em nível moderado — há espaço, mas com ressalvas.',
  },
  [Faixa.LARANJA]: {
    semDivida: 'O perfil da sua empresa pede cautela no endividamento.',
    comDivida: 'O nível de endividamento exige atenção.',
  },
  [Faixa.VERMELHO]: {
    semDivida: 'A operação precisa de ajustes antes de buscar crédito.',
    comDivida: 'O endividamento está acima do recomendado.',
  },
};

/**
 * Subtextos por faixa (complementam a headline).
 */
const SUBTEXTOS: Record<Faixa, { comDivida: string; semDivida: string }> = {
  [Faixa.VERDE]: {
    semDivida:
      'Os indicadores financeiros mostram geração de caixa robusta e ciclo operacional eficiente. ' +
      'Isso coloca sua empresa em posição favorável para negociar condições de crédito.',
    comDivida:
      'A relação entre geração de caixa e serviço da dívida está confortável. ' +
      'Há margem para novas operações ou renegociação em condições mais favoráveis.',
  },
  [Faixa.AMARELO]: {
    semDivida:
      'A empresa gera caixa, mas a margem disponível para servir dívida é moderada. ' +
      'Crédito é viável, desde que com estrutura adequada ao perfil.',
    comDivida:
      'A cobertura do serviço da dívida está dentro do aceitável, mas sem folga ampla. ' +
      'Novos financiamentos devem considerar o impacto no fluxo de caixa total.',
  },
  [Faixa.LARANJA]: {
    semDivida:
      'A geração de caixa livre é baixa em relação ao porte da operação. ' +
      'Endividamento neste momento representaria risco elevado de comprometimento do fluxo.',
    comDivida:
      'Os indicadores de cobertura estão abaixo dos patamares de conforto de mercado. ' +
      'Priorize a estabilização do fluxo antes de buscar novas linhas.',
  },
  [Faixa.VERMELHO]: {
    semDivida:
      'A operação atual não gera caixa livre suficiente para sustentar serviço de dívida. ' +
      'Foque em melhorias operacionais antes de considerar financiamento.',
    comDivida:
      'A dívida atual já compromete a capacidade operacional. ' +
      'Recomendamos buscar assessoria para reestruturação ou renegociação.',
  },
};

// =============================================================================
// RECOMENDAÇÃO PRINCIPAL (§7.2)
// =============================================================================

/**
 * Gera a recomendação principal — um parágrafo descritivo com ações sugeridas.
 *
 * A recomendação é mais granular que a headline: incorpora dados do cenário
 * e da métrica mais fraca para dar contexto específico ao usuário.
 */
function gerarRecomendacaoPrincipal(
  faixa: Faixa,
  temDivida: boolean,
  scoring: ResultadoScoring,
  faixaDivida: FaixaDivida,
  inputs: InputsResolvidos,
  derivadas: VariaveisDerivadas,
  capacidadeResidual?: CapacidadeResidual
): string {
  const metricaFraca = scoring.metricaMaisFraca;

  switch (faixa) {
    case Faixa.VERDE:
      if (temDivida) {
        return (
          `Com score ${scoring.score}/100, sua empresa demonstra capacidade sólida de endividamento. ` +
          `A faixa segura vai de ${formatarMoeda(faixaDivida.limiteInferior)} a ${formatarMoeda(faixaDivida.limiteSuperior)} ` +
          `(${formatarMultiplo(faixaDivida.multiploInferior)}–${formatarMultiplo(faixaDivida.multiploSuperior)} EBITDA). ` +
          `${capacidadeResidual && capacidadeResidual.residualBase > 0
            ? `Ainda há capacidade residual de ${formatarMoeda(capacidadeResidual.residualBase)} no cenário base.`
            : 'A dívida atual está próxima do limite, mas dentro da faixa saudável.'}`
        );
      }
      return (
        `Com score ${scoring.score}/100, sua empresa está em posição favorável para acessar crédito. ` +
        `A capacidade estimada no cenário base é de ${formatarMoeda(faixaDivida.pontoMedio)} ` +
        `(${formatarMultiplo(faixaDivida.multiploPontoMedio)} EBITDA). ` +
        `Para uma primeira operação, recomendamos começar pelo cenário conservador: ` +
        `até ${formatarMoeda(faixaDivida.limiteInferior)}.`
      );

    case Faixa.AMARELO:
      return (
        `Com score ${scoring.score}/100, o endividamento é viável, mas requer atenção à estrutura. ` +
        `A faixa sugerida é de ${formatarMoeda(faixaDivida.limiteInferior)} a ${formatarMoeda(faixaDivida.pontoMedio)} ` +
        `(${formatarMultiplo(faixaDivida.multiploInferior)}–${formatarMultiplo(faixaDivida.multiploPontoMedio)} EBITDA). ` +
        `O ponto de atenção é ${metricaFraca.nomeCurto} (${metricaFraca.valorFormatado}), ` +
        `que limita a capacidade pelo lado ${metricaFraca.id === MetricaId.NCG_RECEITA ? 'do capital de giro' : 'da geração de caixa'}.`
      );

    case Faixa.LARANJA:
      return (
        `Com score ${scoring.score}/100, o perfil atual pede cautela. ` +
        `${metricaFraca.nomeCurto} a ${metricaFraca.valorFormatado} é o principal limitador. ` +
        `Se optar por crédito, mantenha-se no cenário conservador: até ${formatarMoeda(faixaDivida.limiteInferior)}. ` +
        `Antes disso, trabalhar a ${metricaFraca.nomeCurto === 'NCG/Receita' ? 'eficiência do ciclo de caixa' : 'margem operacional'} ` +
        `traria benefício imediato na capacidade.`
      );

    case Faixa.VERMELHO:
      if (temDivida) {
        return (
          `Com score ${scoring.score}/100, a dívida atual excede a capacidade recomendada. ` +
          `${metricaFraca.nomeCurto} a ${metricaFraca.valorFormatado} indica pressão sobre o caixa operacional. ` +
          `A prioridade deve ser estabilizar o fluxo de caixa: renegociar prazos, ` +
          `reduzir custo de captação ou melhorar a margem operacional.`
        );
      }
      return (
        `Com score ${scoring.score}/100, a operação não está preparada para endividamento neste momento. ` +
        `${metricaFraca.nomeCurto} a ${metricaFraca.valorFormatado} é o principal gargalo. ` +
        `Recomendamos foco em melhorias operacionais — cada ponto de margem adicional ` +
        `amplia significativamente a capacidade futura.`
      );
  }
}

// =============================================================================
// RECOMENDAÇÕES SECUNDÁRIAS (§7.3)
// =============================================================================

/**
 * Gera lista de recomendações secundárias (bullets) baseadas no perfil.
 *
 * As recomendações são priorizadas e contextualizadas:
 *   - Prioridade 1: ação sobre a métrica mais fraca
 *   - Prioridade 2: ação estrutural (prazo, garantias, diversificação)
 *   - Prioridade 3: ação de monitoramento (covenants, revisão periódica)
 */
function gerarRecomendacoes(
  faixa: Faixa,
  temDivida: boolean,
  scoring: ResultadoScoring,
  inputs: InputsResolvidos,
  derivadas: VariaveisDerivadas
): Recomendacao[] {
  const recs: Recomendacao[] = [];
  const metricaFraca = scoring.metricaMaisFraca;

  // --- Recomendação específica por métrica mais fraca ---
  switch (metricaFraca.id) {
    case MetricaId.D_EBITDA:
      recs.push({
        texto: `Alavancagem (${metricaFraca.valorFormatado}) acima do ideal. ` +
          `Considere amortizações extraordinárias ou renegociação de prazos para reduzir o múltiplo.`,
        prioridade: 1,
      });
      break;

    case MetricaId.ICR:
      recs.push({
        texto: `Cobertura de juros (${metricaFraca.valorFormatado}) abaixo do ideal. ` +
          `Buscar taxas menores (CDI+ mais agressivo, garantias reais) ou aumentar EBITDA melhoraria este indicador.`,
        prioridade: 1,
      });
      break;

    case MetricaId.DSCR:
      recs.push({
        texto: `Cobertura do serviço da dívida (${metricaFraca.valorFormatado}) é o maior limitador. ` +
          `O DSCR considera impostos e capex — aumentar margem líquida ou alongar prazo da dívida ajudaria.`,
        prioridade: 1,
      });
      break;

    case MetricaId.NCG_RECEITA:
      recs.push({
        texto: `Capital preso no giro (${metricaFraca.valorFormatado} da receita) reduz caixa disponível. ` +
          `Renegociar prazos com fornecedores ou reduzir estoque liberaria capital para dívida.`,
        prioridade: 1,
      });
      break;

    case MetricaId.CFADS_RECEITA:
      recs.push({
        texto: `Geração de caixa para dívida (${metricaFraca.valorFormatado} da receita) está baixa. ` +
          `Priorize aumentar a margem EBITDA ou reduzir capex de manutenção.`,
        prioridade: 1,
      });
      break;
  }

  // --- Recomendações por faixa ---
  if (faixa === Faixa.VERDE || faixa === Faixa.AMARELO) {
    recs.push({
      texto: temDivida
        ? 'Aproveite a posição para renegociar spreads — credores costumam oferecer condições melhores para empresas com bons indicadores.'
        : 'Para uma primeira operação, prefira instrumentos com amortização gradual (SAC) e prazo de 3-5 anos.',
      prioridade: 2,
    });

    recs.push({
      texto: 'Monitore trimestralmente D/EBITDA e DSCR. Defina internamente limites de alerta antes de atingir covenants.',
      prioridade: 3,
    });
  }

  if (faixa === Faixa.LARANJA) {
    recs.push({
      texto: 'Se optar por crédito, prefira linhas com carência de amortização (6-12 meses) para aliviar o fluxo no curto prazo.',
      prioridade: 2,
    });

    recs.push({
      texto: 'Considere instrumentos de capital de giro (desconto de recebíveis, FIDC) em vez de dívida de longo prazo.',
      prioridade: 2,
    });
  }

  if (faixa === Faixa.VERMELHO) {
    if (temDivida) {
      recs.push({
        texto: 'Priorize renegociação de prazos com credores atuais. Alongar o perfil da dívida reduz o serviço anual e melhora o DSCR.',
        prioridade: 1,
      });
      recs.push({
        texto: 'Avalie a possibilidade de conversão de dívida em equity ou instrumentos híbridos para aliviar o balanço.',
        prioridade: 2,
      });
    } else {
      recs.push({
        texto: 'Foque em aumentar a margem EBITDA antes de buscar crédito. Cada ponto percentual adicional amplia a capacidade.',
        prioridade: 1,
      });
    }
  }

  // --- Recomendação contextual por setor ---
  const setorParams = SETORES[inputs.setor];
  if (derivadas.ncgPctReceita > setorParams.cccMedioDias[1] * (100 / 365)) {
    recs.push({
      texto: `Seu ciclo de caixa (${formatarDias(inputs.cicloCaixaDias)}) está acima da média do setor ` +
        `${setorParams.nome} (${setorParams.cccMedioDias[0]}-${setorParams.cccMedioDias[1]} dias). ` +
        `Otimizar o ciclo libera capital de giro e melhora todos os indicadores.`,
      prioridade: 2,
    });
  }

  return recs.sort((a, b) => a.prioridade - b.prioridade);
}

// =============================================================================
// INSIGHTS DINÂMICOS (§8)
// =============================================================================

/**
 * Gera insight dinâmico baseado na métrica mais fraca.
 *
 * O insight é a peça de valor diferencial da calculadora:
 * mostra uma AÇÃO QUANTIFICADA que o usuário pode tomar.
 *
 * Exemplos:
 *   - "Cada 10 dias a menos no ciclo de caixa libera R$ 822 mil em capital de giro"
 *   - "Cada ponto de margem EBITDA adicional gera R$ 300 mil em CFADS"
 *   - "Reduzir D/EBITDA de 3,2x para 2,5x economizaria R$ 150 mil/ano em juros"
 *
 * @param scoring - Resultado do scoring (contém métrica mais fraca)
 * @param inputs - Inputs resolvidos
 * @param derivadas - Variáveis derivadas
 * @returns Insight com título, texto e ação quantificada
 */
function gerarInsight(
  scoring: ResultadoScoring,
  inputs: InputsResolvidos,
  derivadas: VariaveisDerivadas
): Insight {
  const metrica = scoring.metricaMaisFraca;

  switch (metrica.id) {
    case MetricaId.NCG_RECEITA: {
      // Quantificar: cada 10 dias a menos no CCC libera quanto em NCG?
      const liberacaoPor10Dias = (inputs.receitaAnual / 365) * 10;
      return {
        titulo: 'Otimize seu ciclo de caixa',
        texto:
          `O capital de giro é o principal gargalo. Com NCG consumindo ${metrica.valorFormatado} ` +
          `da receita, uma parte significativa do caixa fica presa no ciclo operacional.`,
        metricaOrigem: metrica.id,
        acaoQuantificada:
          `Cada 10 dias a menos no ciclo de caixa libera ${formatarMoeda(liberacaoPor10Dias)} ` +
          `em capital de giro — recurso que pode reduzir necessidade de crédito ou servir dívida existente.`,
      };
    }

    case MetricaId.CFADS_RECEITA: {
      // Quantificar: cada ponto de margem EBITDA gera quanto em CFADS?
      const cfadsPorPontoMargem = inputs.receitaAnual * 0.01 * PREMISSAS.FATOR_POS_IMPOSTO;
      return {
        titulo: 'Aumente a geração de caixa',
        texto:
          `O caixa disponível para dívida (${metrica.valorFormatado} da receita) é o limitador. ` +
          `Isso é resultado da combinação de margem, impostos e capex de manutenção.`,
        metricaOrigem: metrica.id,
        acaoQuantificada:
          `Cada ponto percentual a mais na margem EBITDA gera ${formatarMoeda(cfadsPorPontoMargem)} adicionais em CFADS, ` +
          `aumentando diretamente a capacidade de endividamento.`,
      };
    }

    case MetricaId.D_EBITDA: {
      // Quantificar: quanto custa cada 0.5x de D/EBITDA em juros/ano?
      const dividaAtual = inputs.dividaAtual;
      const custoJurosPor05x = derivadas.ebitda * 0.5 * inputs.taxaJurosMedia;
      return {
        titulo: 'Reduza a alavancagem',
        texto:
          `A relação dívida/EBITDA de ${metrica.valorFormatado} está ` +
          `${metrica.valor > 3.5 ? 'acima do padrão de mercado' : 'no limite superior do aceitável'}. ` +
          `Reduzir a alavancagem melhora o rating sintético e o acesso a melhores condições.`,
        metricaOrigem: metrica.id,
        acaoQuantificada:
          `Cada 0,5x de redução em D/EBITDA economiza ~${formatarMoeda(custoJurosPor05x)}/ano em despesa financeira ` +
          `e pode melhorar o spread de novas captações em 50-100bps.`,
      };
    }

    case MetricaId.ICR: {
      // Quantificar: quanto o ICR melhora com 1pp de redução na taxa?
      const melhoriaPor1pp = derivadas.ebitda / (derivadas.despesaFinanceira * (1 - 0.01 / inputs.taxaJurosMedia));
      const icrAtual = metrica.valor;
      return {
        titulo: 'Melhore a cobertura de juros',
        texto:
          `O ICR de ${metrica.valorFormatado} indica que o EBITDA cobre os juros ` +
          `${icrAtual < 2 ? 'com margem muito estreita' : 'sem folga ampla'}. ` +
          `Renegociar a taxa de juros ou aumentar o EBITDA são os dois caminhos.`,
        metricaOrigem: metrica.id,
        acaoQuantificada:
          `Cada 1pp de redução na taxa média de juros economiza ` +
          `${formatarMoeda(inputs.dividaAtual * 0.01)}/ano e melhora o ICR proporcionalmente.`,
      };
    }

    case MetricaId.DSCR: {
      // Quantificar: impacto de alongar prazo de 5 para 7 anos
      const servicoAtual = derivadas.servicoDividaAnual;
      const servico7anos = derivadas.despesaFinanceira + (inputs.dividaAtual / 7);
      const economia = servicoAtual - servico7anos;
      return {
        titulo: 'Alivie o serviço da dívida',
        texto:
          `O DSCR de ${metrica.valorFormatado} mostra que o caixa operacional cobre o serviço da dívida ` +
          `${metrica.valor < 1.25 ? 'abaixo do covenant mínimo de mercado (1.25x)' : 'com margem apertada'}. ` +
          `Isso considera juros + amortização sobre o caixa pós-impostos e pós-capex.`,
        metricaOrigem: metrica.id,
        acaoQuantificada: economia > 0
          ? `Alongar o prazo médio de 5 para 7 anos reduziria o serviço anual em ` +
            `${formatarMoeda(economia)}, elevando o DSCR proporcionalmente.`
          : `Aumentar a margem EBITDA em 2-3pp melhoraria o CFADS e, por consequência, o DSCR.`,
      };
    }

    default:
      return {
        titulo: 'Analise seu perfil financeiro',
        texto: 'Consulte os indicadores individuais para identificar oportunidades de melhoria.',
        metricaOrigem: metrica.id,
      };
  }
}

// =============================================================================
// CTA (Call to Action)
// =============================================================================

/**
 * Gera texto do CTA e contexto, diferenciados por faixa.
 */
function gerarCTA(faixa: Faixa): { ctaTexto: string; ctaContexto: string } {
  switch (faixa) {
    case Faixa.VERDE:
      return {
        ctaTexto: 'Falar com um especialista em estruturação',
        ctaContexto:
          'Com um perfil saudável, você está em posição de negociar as melhores condições. ' +
          'Nosso time pode ajudar a estruturar a operação ideal para o seu momento.',
      };

    case Faixa.AMARELO:
      return {
        ctaTexto: 'Receber análise personalizada gratuita',
        ctaContexto:
          'Cada empresa tem particularidades que uma calculadora genérica não captura. ' +
          'Uma análise sob medida pode identificar a estrutura mais adequada ao seu perfil.',
      };

    case Faixa.LARANJA:
      return {
        ctaTexto: 'Avaliar opções com um especialista',
        ctaContexto:
          'Mesmo com indicadores moderados, existem instrumentos e estruturas que se adaptam ao seu perfil. ' +
          'Vamos identificar juntos o melhor caminho.',
      };

    case Faixa.VERMELHO:
      return {
        ctaTexto: 'Agendar diagnóstico financeiro',
        ctaContexto:
          'O primeiro passo é entender as alavancas específicas da sua operação. ' +
          'Nosso diagnóstico identifica as melhorias com maior impacto na capacidade de crédito.',
      };
  }
}

// =============================================================================
// ORQUESTRADOR DE RECOMENDAÇÕES
// =============================================================================

/**
 * Gera o resultado completo de recomendações — tudo que a UI precisa
 * para renderizar a Tela 3 (resultados).
 *
 * @param scoring - Resultado do scoring
 * @param faixaDivida - Faixa de dívida calculada
 * @param inputs - Inputs resolvidos
 * @param derivadas - Variáveis derivadas
 * @param capacidadeResidual - Capacidade residual (se tem dívida)
 * @returns Resultado completo de recomendações
 */
export function gerarResultadoRecomendacoes(
  scoring: ResultadoScoring,
  faixaDivida: FaixaDivida,
  inputs: InputsResolvidos,
  derivadas: VariaveisDerivadas,
  capacidadeResidual?: CapacidadeResidual
): ResultadoRecomendacoes {
  const { faixa } = scoring;
  const temDivida = derivadas.temDivida;

  // Headline e subtexto
  const headline = temDivida
    ? HEADLINES[faixa].comDivida
    : HEADLINES[faixa].semDivida;

  const subtexto = temDivida
    ? SUBTEXTOS[faixa].comDivida
    : SUBTEXTOS[faixa].semDivida;

  // Recomendação principal
  const recomendacaoPrincipal = gerarRecomendacaoPrincipal(
    faixa, temDivida, scoring, faixaDivida, inputs, derivadas, capacidadeResidual
  );

  // Recomendações secundárias
  const recomendacoes = gerarRecomendacoes(faixa, temDivida, scoring, inputs, derivadas);

  // Insight dinâmico
  const insight = gerarInsight(scoring, inputs, derivadas);

  // CTA
  const { ctaTexto, ctaContexto } = gerarCTA(faixa);

  return {
    headline,
    subtexto,
    recomendacaoPrincipal,
    recomendacoes,
    insight,
    ctaTexto,
    ctaContexto,
  };
}
