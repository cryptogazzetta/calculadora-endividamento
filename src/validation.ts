/**
 * =============================================================================
 * VALIDAÇÃO DE INPUTS
 * =============================================================================
 *
 * Validação completa dos inputs do formulário com mensagens de erro
 * em português, calibradas para o público PME-Middle.
 *
 * Dois níveis de validação:
 *   1. Formato e range: campo vazio, fora dos limites, formato inválido
 *   2. Avisos (warnings): valores possíveis mas incomuns (ex: margem > 50%)
 *
 * Todas as mensagens seguem o tom da UX Microcopy: diretas, sem jargão
 * desnecessário, e com hint de correção quando possível.
 *
 * Referências:
 *   - UX Microcopy §2 (Tela 1 — validação inline)
 *   - §2 do Modelo Decisório (ranges de inputs)
 *
 * @version 1.0.0
 * @date Abril 2026
 */

import {
  InputsObrigatorios,
  InputsOpcionais,
  ValidacaoCampo,
  ValidacaoInputs,
} from './types';

import { LIMITES_INPUTS } from './constants';

import { formatarMoedaCompleta } from './formatters';

// =============================================================================
// VALIDADORES INDIVIDUAIS
// =============================================================================

/**
 * Valida a receita anual.
 *
 * Range: R$ 1.000.000 – R$ 500.000.000
 * Razão do floor: empresas abaixo de R$ 1M têm perfil de microempresa,
 * fora do público-alvo (PME-Middle e corporate).
 * Razão do cap: acima de R$ 500M, os benchmarks mudam significativamente.
 */
function validarReceita(valor: number | undefined | null): ValidacaoCampo {
  if (valor === undefined || valor === null || isNaN(valor)) {
    return {
      valido: false,
      mensagem: 'Informe a receita anual da empresa.',
      tipo: 'vazio',
    };
  }

  if (valor < LIMITES_INPUTS.RECEITA_MIN) {
    return {
      valido: false,
      mensagem: `A receita mínima é ${formatarMoedaCompleta(LIMITES_INPUTS.RECEITA_MIN)}. ` +
        `A calculadora é calibrada para PMEs e empresas de médio porte.`,
      tipo: 'fora_range',
    };
  }

  if (valor > LIMITES_INPUTS.RECEITA_MAX) {
    return {
      valido: false,
      mensagem: `A receita máxima é ${formatarMoedaCompleta(LIMITES_INPUTS.RECEITA_MAX)}. ` +
        `Para empresas deste porte, recomendamos uma análise personalizada.`,
      tipo: 'fora_range',
    };
  }

  return { valido: true };
}

/**
 * Valida a margem EBITDA.
 *
 * Range: 1% – 60%
 * Razão do floor: abaixo de 1%, a empresa praticamente não gera EBITDA.
 * Razão do cap: acima de 60% é raro mesmo em SaaS (possível erro de input).
 *
 * Warning: acima de 40% emite aviso, não erro.
 */
function validarMargem(valor: number | undefined | null): ValidacaoCampo {
  if (valor === undefined || valor === null || isNaN(valor)) {
    return {
      valido: false,
      mensagem: 'Informe a margem EBITDA (%).',
      tipo: 'vazio',
    };
  }

  if (valor < LIMITES_INPUTS.MARGEM_MIN) {
    return {
      valido: false,
      mensagem: `A margem mínima é ${LIMITES_INPUTS.MARGEM_MIN}%. ` +
        `Empresas sem geração de EBITDA não têm capacidade de endividamento mensurável.`,
      tipo: 'fora_range',
    };
  }

  if (valor > LIMITES_INPUTS.MARGEM_MAX) {
    return {
      valido: false,
      mensagem: `A margem máxima é ${LIMITES_INPUTS.MARGEM_MAX}%. ` +
        `Verifique se o valor informado é a margem EBITDA (e não a margem bruta).`,
      tipo: 'fora_range',
    };
  }

  // Warning para margens muito altas (possível confusão com margem bruta)
  if (valor > 40) {
    return {
      valido: true,
      mensagem: `Margem EBITDA de ${valor}% é incomum. ` +
        `Confirme que este é o EBITDA (resultado operacional antes de D&A), não a margem bruta.`,
      tipo: 'aviso',
    };
  }

  return { valido: true };
}

/**
 * Valida o ciclo de caixa.
 *
 * Range: 0 – 365 dias
 * Zero é válido: empresas com recebimento à vista e pagamento a prazo
 * podem ter ciclo zero ou negativo (clamped a 0).
 */
function validarCicloCaixa(valor: number | undefined | null): ValidacaoCampo {
  if (valor === undefined || valor === null || isNaN(valor)) {
    return {
      valido: false,
      mensagem: 'Informe o ciclo de caixa em dias.',
      tipo: 'vazio',
    };
  }

  if (valor < LIMITES_INPUTS.CICLO_MIN) {
    return {
      valido: false,
      mensagem: 'O ciclo de caixa não pode ser negativo. Use 0 para ciclos muito curtos.',
      tipo: 'fora_range',
    };
  }

  if (valor > LIMITES_INPUTS.CICLO_MAX) {
    return {
      valido: false,
      mensagem: `O ciclo máximo é ${LIMITES_INPUTS.CICLO_MAX} dias. ` +
        `Ciclos acima de 1 ano são atípicos — verifique o cálculo PMR + PME - PMP.`,
      tipo: 'fora_range',
    };
  }

  // Warning para ciclos muito longos
  if (valor > 180) {
    return {
      valido: true,
      mensagem: `Ciclo de ${valor} dias é elevado. ` +
        `Típico de agronegócio ou construção. Verifique se inclui apenas o ciclo operacional (PMR + PME - PMP).`,
      tipo: 'aviso',
    };
  }

  return { valido: true };
}

/**
 * Valida a dívida atual (campo opcional).
 *
 * Range: R$ 0 – R$ 500.000.000
 * Zero é o default (sem dívida).
 */
function validarDivida(valor: number | undefined | null): ValidacaoCampo {
  if (valor === undefined || valor === null) {
    return { valido: true }; // Opcional, usa default 0
  }

  if (isNaN(valor)) {
    return {
      valido: false,
      mensagem: 'Informe um valor numérico para a dívida.',
      tipo: 'formato_invalido',
    };
  }

  if (valor < LIMITES_INPUTS.DIVIDA_MIN) {
    return {
      valido: false,
      mensagem: 'A dívida não pode ser negativa.',
      tipo: 'fora_range',
    };
  }

  if (valor > LIMITES_INPUTS.DIVIDA_MAX) {
    return {
      valido: false,
      mensagem: `A dívida máxima é ${formatarMoedaCompleta(LIMITES_INPUTS.DIVIDA_MAX)}. ` +
        `Para valores acima, recomendamos análise personalizada.`,
      tipo: 'fora_range',
    };
  }

  return { valido: true };
}

/**
 * Valida a taxa de juros média (campo opcional, decimal).
 *
 * Range: 0 – 40% (0.00 – 0.40)
 * Default: CDI + 3% = 14.25%
 */
function validarTaxa(valor: number | undefined | null): ValidacaoCampo {
  if (valor === undefined || valor === null) {
    return { valido: true }; // Opcional, usa default CDI+3%
  }

  if (isNaN(valor)) {
    return {
      valido: false,
      mensagem: 'Informe um valor numérico para a taxa.',
      tipo: 'formato_invalido',
    };
  }

  // Detectar se o usuário informou em percentual em vez de decimal
  if (valor > 1 && valor <= 100) {
    return {
      valido: false,
      mensagem: `Parece que você informou ${valor}%. Informe em formato decimal: ${(valor / 100).toFixed(4)} para ${valor}%.`,
      tipo: 'formato_invalido',
    };
  }

  if (valor < LIMITES_INPUTS.TAXA_MIN) {
    return {
      valido: false,
      mensagem: 'A taxa não pode ser negativa.',
      tipo: 'fora_range',
    };
  }

  if (valor > LIMITES_INPUTS.TAXA_MAX) {
    return {
      valido: false,
      mensagem: 'Taxa acima de 40% a.a. excede o range de operações estruturadas. Verifique o valor.',
      tipo: 'fora_range',
    };
  }

  return { valido: true };
}

/**
 * Valida o capex de manutenção (campo opcional).
 *
 * Range: R$ 0 – R$ 100.000.000
 * Default: receita × capex_pct do setor
 */
function validarCapex(valor: number | undefined | null): ValidacaoCampo {
  if (valor === undefined || valor === null) {
    return { valido: true }; // Opcional, usa default do setor
  }

  if (isNaN(valor)) {
    return {
      valido: false,
      mensagem: 'Informe um valor numérico para o capex.',
      tipo: 'formato_invalido',
    };
  }

  if (valor < LIMITES_INPUTS.CAPEX_MIN) {
    return {
      valido: false,
      mensagem: 'O capex não pode ser negativo.',
      tipo: 'fora_range',
    };
  }

  if (valor > LIMITES_INPUTS.CAPEX_MAX) {
    return {
      valido: false,
      mensagem: `Capex acima de ${formatarMoedaCompleta(LIMITES_INPUTS.CAPEX_MAX)} excede o range esperado. Verifique o valor.`,
      tipo: 'fora_range',
    };
  }

  return { valido: true };
}

// =============================================================================
// VALIDAÇÃO COMPLETA
// =============================================================================

/**
 * Valida todos os inputs do formulário.
 *
 * Retorna:
 *   - `valido`: true se todos os campos obrigatórios passam
 *   - `campos`: validação individual por campo (incluindo warnings)
 *   - `primeiroCampoErro`: ID do primeiro campo com erro (para auto-scroll)
 *
 * Nota: warnings (tipo 'aviso') NÃO impedem o cálculo.
 * Eles são exibidos na UI mas o botão "Calcular" permanece ativo.
 *
 * @param obrigatorios - Inputs obrigatórios do formulário
 * @param opcionais - Inputs opcionais do accordion
 * @returns Resultado da validação completa
 */
export function validarInputs(
  obrigatorios: Partial<InputsObrigatorios>,
  opcionais: Partial<InputsOpcionais> = {}
): ValidacaoInputs {
  const campos: Record<string, ValidacaoCampo> = {
    receitaAnual: validarReceita(obrigatorios.receitaAnual),
    margemEbitdaPct: validarMargem(obrigatorios.margemEbitdaPct),
    cicloCaixaDias: validarCicloCaixa(obrigatorios.cicloCaixaDias),
    dividaAtual: validarDivida(opcionais.dividaAtual),
    taxaJurosMedia: validarTaxa(opcionais.taxaJurosMedia),
    capexManutencao: validarCapex(opcionais.capexManutencao),
  };

  // Cross-validation: dívida > receita é suspeita
  if (
    obrigatorios.receitaAnual &&
    opcionais.dividaAtual &&
    opcionais.dividaAtual > obrigatorios.receitaAnual * 5
  ) {
    campos.dividaAtual = {
      valido: true,
      mensagem:
        `Dívida de ${formatarMoedaCompleta(opcionais.dividaAtual)} é mais de 5x a receita anual. ` +
        `Verifique se o valor está correto.`,
      tipo: 'aviso',
    };
  }

  // Cross-validation: capex > EBITDA implícito é suspeita
  if (
    obrigatorios.receitaAnual &&
    obrigatorios.margemEbitdaPct &&
    opcionais.capexManutencao
  ) {
    const ebitdaImplicito = obrigatorios.receitaAnual * (obrigatorios.margemEbitdaPct / 100);
    if (opcionais.capexManutencao > ebitdaImplicito) {
      campos.capexManutencao = {
        valido: true,
        mensagem:
          `O capex informado excede o EBITDA estimado. Isso resulta em CFADS negativo. ` +
          `Verifique se informou o capex de manutenção (não o capex total de expansão).`,
        tipo: 'aviso',
      };
    }
  }

  // Determinar se formulário é válido (erros, não warnings)
  const erros = Object.entries(campos).filter(
    ([_, v]) => !v.valido && v.tipo !== 'aviso'
  );
  const valido = erros.length === 0;

  // Primeiro campo com erro (para scroll automático)
  const primeiroCampoErro = erros.length > 0 ? erros[0][0] : undefined;

  return {
    valido,
    campos,
    primeiroCampoErro,
  };
}
