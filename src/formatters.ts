/**
 * =============================================================================
 * FORMATADORES E UTILITÁRIOS
 * =============================================================================
 *
 * Formatação de valores monetários, múltiplos e percentuais
 * para exibição na UI da calculadora.
 *
 * Localização: pt-BR (separador decimal: vírgula; milhar: ponto).
 */

// =============================================================================
// MOEDA
// =============================================================================

/**
 * Formata valor monetário em formato legível para o público brasileiro.
 *
 * Regras:
 *   - Abaixo de R$ 1M: "R$ 890 mil"
 *   - R$ 1M – R$ 999M: "R$ 4,6 milhões"
 *   - Acima de R$ 1B: "R$ 1,2 bilhão/bilhões"
 *
 * @param valor - Valor em R$ (número bruto)
 * @param decimais - Casas decimais para a parte abreviada (default: 1)
 */
export function formatarMoeda(valor: number, decimais: number = 1): string {
  if (valor < 0) return `−R$ ${formatarMoeda(Math.abs(valor), decimais).replace('R$ ', '')}`;
  if (valor === 0) return 'R$ 0';

  if (valor < 1_000) {
    return `R$ ${Math.round(valor).toLocaleString('pt-BR')}`;
  }

  if (valor < 1_000_000) {
    const mil = valor / 1_000;
    if (mil === Math.floor(mil)) {
      return `R$ ${Math.floor(mil).toLocaleString('pt-BR')} mil`;
    }
    return `R$ ${mil.toFixed(decimais).replace('.', ',')} mil`;
  }

  if (valor < 1_000_000_000) {
    const milhoes = valor / 1_000_000;
    const label = milhoes === 1 ? 'milhão' : 'milhões';
    if (milhoes === Math.floor(milhoes)) {
      return `R$ ${Math.floor(milhoes)} ${label}`;
    }
    return `R$ ${milhoes.toFixed(decimais).replace('.', ',')} ${label}`;
  }

  const bilhoes = valor / 1_000_000_000;
  const label = bilhoes === 1 ? 'bilhão' : 'bilhões';
  if (bilhoes === Math.floor(bilhoes)) {
    return `R$ ${Math.floor(bilhoes)} ${label}`;
  }
  return `R$ ${bilhoes.toFixed(decimais).replace('.', ',')} ${label}`;
}

/**
 * Formata valor monetário completo (sem abreviação).
 * Ex: R$ 4.568.276
 */
export function formatarMoedaCompleta(valor: number): string {
  if (valor < 0) return `−R$ ${Math.abs(Math.round(valor)).toLocaleString('pt-BR')}`;
  return `R$ ${Math.round(valor).toLocaleString('pt-BR')}`;
}

// =============================================================================
// MÚLTIPLOS
// =============================================================================

/**
 * Formata um múltiplo (ratio) para exibição.
 * Ex: 2.15 → "2.1x", 0.8 → "0.8x"
 *
 * @param valor - Valor do múltiplo
 * @param decimais - Casas decimais (default: 1)
 */
export function formatarMultiplo(valor: number, decimais: number = 1): string {
  if (!isFinite(valor)) return '∞';
  return `${valor.toFixed(decimais).replace('.', ',')}x`;
}

// =============================================================================
// PERCENTUAIS
// =============================================================================

/**
 * Formata percentual para exibição.
 * Ex: 15.3 → "15,3%", 7.89 → "7,9%"
 *
 * @param valor - Valor percentual (ex: 15.3 para 15.3%)
 * @param decimais - Casas decimais (default: 1)
 */
export function formatarPercentual(valor: number, decimais: number = 1): string {
  return `${valor.toFixed(decimais).replace('.', ',')}%`;
}

/**
 * Formata taxa de juros (de decimal para percentual).
 * Ex: 0.1425 → "14,25%"
 */
export function formatarTaxa(valorDecimal: number): string {
  return `${(valorDecimal * 100).toFixed(2).replace('.', ',')}%`;
}

// =============================================================================
// SCORE
// =============================================================================

/**
 * Formata score para exibição.
 * Ex: 83 → "83/100"
 */
export function formatarScore(score: number): string {
  return `${Math.round(score)}/100`;
}

// =============================================================================
// DIAS
// =============================================================================

/**
 * Formata ciclo de caixa em dias.
 * Ex: 75 → "75 dias"
 */
export function formatarDias(dias: number): string {
  const d = Math.round(dias);
  return `${d} ${d === 1 ? 'dia' : 'dias'}`;
}

// =============================================================================
// UTILITÁRIOS NUMÉRICOS
// =============================================================================

/**
 * Clamp: garante que o valor está dentro de [min, max].
 */
export function clamp(valor: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, valor));
}

/**
 * Arredonda para N casas decimais.
 */
export function arredondar(valor: number, decimais: number): number {
  const fator = Math.pow(10, decimais);
  return Math.round(valor * fator) / fator;
}

/**
 * Ponto médio de um range [min, max].
 */
export function pontoMedio(range: [number, number]): number {
  return (range[0] + range[1]) / 2;
}
