import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// =============================================================================
// ENGINE — Embedded calculation logic (mirrors src/*.ts exactly)
// =============================================================================

const Setor = {
  TECNOLOGIA_SAAS: "tecnologia_saas",
  SERVICOS_PROFISSIONAIS: "servicos_profissionais",
  INDUSTRIA_MANUFATURA: "industria_manufatura",
  COMERCIO_VAREJO: "comercio_varejo",
  AGRONEGOCIO: "agronegocio",
  SAUDE_EDUCACAO: "saude_educacao",
  LOGISTICA_TRANSPORTE: "logistica_transporte",
  CONSTRUCAO_INFRA: "construcao_infra",
  OUTROS: "outros",
};

const SETORES_LIST = [
  { id: Setor.TECNOLOGIA_SAAS, nome: "Tecnologia / SaaS", capexPct: 0.03 },
  { id: Setor.SERVICOS_PROFISSIONAIS, nome: "Serviços profissionais", capexPct: 0.02 },
  { id: Setor.INDUSTRIA_MANUFATURA, nome: "Indústria / Manufatura", capexPct: 0.06 },
  { id: Setor.COMERCIO_VAREJO, nome: "Comércio / Varejo", capexPct: 0.03 },
  { id: Setor.AGRONEGOCIO, nome: "Agronegócio", capexPct: 0.045 },
  { id: Setor.SAUDE_EDUCACAO, nome: "Saúde / Educação", capexPct: 0.04 },
  { id: Setor.LOGISTICA_TRANSPORTE, nome: "Logística / Transporte", capexPct: 0.075 },
  { id: Setor.CONSTRUCAO_INFRA, nome: "Construção / Infraestrutura", capexPct: 0.06 },
  { id: Setor.OUTROS, nome: "Outros", capexPct: 0.03 },
];

const SETORES_MAP = Object.fromEntries(SETORES_LIST.map(s => [s.id, s]));

const P = { TAX: 0.34, POST_TAX: 0.66, TERM: 5, AMORT: 0.2, RATE: 0.1425 };
const DEFAULT_PRAZO_ANOS = 5;

// Scoring tables: [threshold, points, band]
// Ranges: <1,5x verde | <2,5x amarelo | <3,5x laranja | >=3,5x vermelho
const SC_DE = [[3.5,0,"vermelho"],[2.5,10,"laranja"],[1.5,17,"amarelo"],[0,25,"verde"]];
const SC_ICR = [[6,20,"verde"],[4.5,16,"verde"],[3.5,12,"amarelo"],[2.5,8,"amarelo"],[1.5,4,"laranja"],[0,0,"vermelho"]];
const SC_DSCR = [[2,25,"verde"],[1.5,20,"verde"],[1.25,15,"amarelo"],[1.1,8,"laranja"],[1,3,"laranja"],[0,0,"vermelho"]];
const SC_NCG = [[30,0,"vermelho"],[22,4,"laranja"],[15,8,"amarelo"],[8,12,"verde"],[0,15,"verde"]];
const SC_CFADS = [[10,15,"verde"],[7,12,"verde"],[4,8,"amarelo"],[2,4,"laranja"],[-Infinity,0,"vermelho"]];

function scoreFromTable(v, table, inverted) {
  if (inverted) {
    for (let i = 0; i < table.length; i++) if (v >= table[i][0]) return { pts: table[i][1], band: table[i][2] };
    return { pts: table[table.length-1][1], band: table[table.length-1][2] };
  }
  for (let i = 0; i < table.length; i++) if (v >= table[i][0]) return { pts: table[i][1], band: table[i][2] };
  return { pts: table[table.length-1][1], band: table[table.length-1][2] };
}

const METRIC_NAMES = {
  d_ebitda: { nome: "Alavancagem — Dívida sobre lucro operacional", curto: "Dívida/EBITDA" },
  icr: { nome: "Cobertura de juros — Lucro vs. despesa financeira", curto: "ICR" },
  dscr: { nome: "Cobertura do serviço da dívida — Caixa vs. parcelas", curto: "DSCR" },
  ncg_receita: { nome: "Capital preso no giro — % da receita no ciclo operacional", curto: "NCG/Receita" },
  cfads_receita: { nome: "Caixa disponível para dívida — % da receita livre", curto: "CFADS/Receita" },
};

const METRIC_REFS = {
  d_ebitda: {
    verde: "Abaixo de 1,5x — a dívida é menor que 1,5 anos de lucro operacional. Confortável para a maioria dos setores e bem vista por bancos.",
    amarelo: "Entre 1,5x e 2,5x — a dívida equivale a 1,5–2,5 anos de lucro operacional. Dentro da faixa de mercado, mas exige monitoramento trimestral.",
    laranja: "Entre 2,5x e 3,5x — a dívida supera 2,5 anos de lucro operacional. Credores costumam exigir garantias adicionais ou spreads maiores.",
    vermelho: "Acima de 3,5x — a dívida levaria mais de 3,5 anos de lucro operacional para ser quitada. Risco elevado de não conseguir refinanciar no vencimento.",
  },
  icr: {
    verde: "Acima de 4.5x — o lucro operacional cobre os juros com folga de 4,5 vezes. Perfil equivalente a empresas com classificação de crédito A- ou superior.",
    amarelo: "Entre 2.5x e 4.5x — o lucro cobre os juros entre 2,5 e 4,5 vezes. Margem suficiente, mas sem grande folga para absorver quedas de receita.",
    laranja: "Entre 1.5x e 2.5x — o lucro operacional mal supera a despesa de juros. Qualquer queda na receita pode comprometer o pagamento.",
    vermelho: "Abaixo de 1.5x — zona crítica. O lucro operacional quase não cobre os juros, e qualquer oscilação pode gerar inadimplência.",
  },
  dscr: {
    verde: "Acima de 1.50x — o caixa livre cobre juros + amortização com folga de 50% ou mais. Posição sólida para tomar crédito.",
    amarelo: "Entre 1.25x e 1.50x — o caixa cobre a dívida, mas está no limite do que bancos costumam exigir como mínimo em contratos (covenant de 1,25x).",
    laranja: "Entre 1.05x e 1.25x — o caixa cobre a dívida por pouco. Abaixo do covenant padrão de mercado, o que pode gerar restrições contratuais.",
    vermelho: "Abaixo de 1.05x — o caixa gerado é insuficiente para pagar juros e amortização. A empresa precisaria de caixa acumulado ou novas captações.",
  },
  ncg_receita: {
    verde: "Até 12% da receita presa no ciclo operacional — eficiente. Sobra mais caixa livre para pagar dívida ou investir.",
    amarelo: "12% a 20% — nível normal, compatível com a média de grandes empresas. Há oportunidade de melhorar negociando prazos com fornecedores e clientes.",
    laranja: "20% a 30% — parte significativa da receita fica travada entre estoque, contas a receber e contas a pagar. Reduz o caixa disponível para dívida.",
    vermelho: "Acima de 30% — o ciclo de caixa longo compromete seriamente a geração de caixa. Priorize encurtar prazos de recebimento e estoque.",
  },
  cfads_receita: {
    verde: "Acima de 8% da receita convertida em caixa livre para dívida — geração robusta. Base sólida para tomar crédito com segurança.",
    amarelo: "5% a 8% — geração de caixa moderada. Endividamento é possível, mas a margem de segurança é limitada se a receita cair.",
    laranja: "2% a 5% — pouco caixa sobra após impostos e manutenção. Apenas dívidas muito conservadoras são recomendadas.",
    vermelho: "Abaixo de 2% — quase nada sobra de caixa. Antes de pensar em crédito, priorize aumentar a margem operacional ou reduzir custos fixos.",
  },
};

function fmtMoeda(v) {
  if (v === 0) return "R$ 0";
  const neg = v < 0;
  const abs = Math.abs(v);
  let s;
  if (abs >= 1e9) { const b = abs / 1e9; s = b === Math.floor(b) ? `R$ ${Math.floor(b)} ${b===1?"bilhão":"bilhões"}` : `R$ ${b.toFixed(1).replace(".",",")} ${b===1?"bilhão":"bilhões"}`; }
  else if (abs >= 1e6) { const m = abs / 1e6; s = m === Math.floor(m) ? `R$ ${Math.floor(m)} ${m===1?"milhão":"milhões"}` : `R$ ${m.toFixed(1).replace(".",",")} ${m===1?"milhão":"milhões"}`; }
  else if (abs >= 1000) { s = `R$ ${Math.round(abs / 1000)} mil`; }
  else { s = `R$ ${Math.round(abs)}`; }
  return neg ? `−${s.replace("R$ ", "R$ ")}` : s;
}
function fmtMult(v, d=1) { return v === Infinity ? "∞" : `${v.toFixed(d).replace(".",",")}x`; }
function fmtPct(v, d=1) { return `${v.toFixed(d).replace(".",",")}%`; }
function fmtTaxa(v) { return `${(v*100).toFixed(2).replace(".",",")}%`; }
function fmtScore(v) { return `${Math.round(v)}/100`; }

// --- CORE ENGINE ---
function calculate(receita, margem, ciclo, setor, divida, taxa, capex, prazo) {
  const setorData = SETORES_MAP[setor] || SETORES_MAP[Setor.OUTROS];
  const resolvedTaxa = taxa ?? P.RATE;
  const resolvedCapex = capex ?? receita * setorData.capexPct;
  const resolvedDivida = divida ?? 0;
  const resolvedPrazo = prazo && prazo > 0 ? prazo : DEFAULT_PRAZO_ANOS;
  const amortRate = 1 / resolvedPrazo;
  const temDivida = resolvedDivida > 0;

  // Derived
  const ebitda = receita * (margem / 100);
  const ncg = (receita / 365) * ciclo;
  const ncgPct = (ncg / receita) * 100;
  const cfads = ebitda * P.POST_TAX - resolvedCapex;
  const cfadsPct = (cfads / receita) * 100;
  const despFin = resolvedDivida * resolvedTaxa;
  const servico = despFin + resolvedDivida * amortRate;

  // Metrics
  const metrics = [];

  // D/EBITDA
  if (!temDivida) {
    metrics.push({ id: "d_ebitda", valor: 0, fmt: "0,0x", pts: 25, max: 25, band: "verde", ref: "Você não possui dívida financeira hoje, o que significa alavancagem zero. É o melhor ponto de partida para avaliar nova captação.", aplicavel: true });
  } else if (ebitda <= 0) {
    metrics.push({ id: "d_ebitda", valor: Infinity, fmt: "∞", pts: 0, max: 25, band: "vermelho", ref: "O lucro operacional (EBITDA) é nulo ou negativo, o que torna qualquer nível de dívida insustentável. Priorize voltar à lucratividade operacional.", aplicavel: true });
  } else {
    const v = resolvedDivida / ebitda;
    const r = scoreFromTable(v, SC_DE, true);
    metrics.push({ id: "d_ebitda", valor: v, fmt: fmtMult(v), pts: r.pts, max: 25, band: r.band, ref: METRIC_REFS.d_ebitda[r.band], aplicavel: true });
  }

  // ICR
  if (!temDivida) {
    metrics.push({ id: "icr", valor: Infinity, fmt: "∞", pts: 20, max: 20, band: "verde", ref: "Sem dívida financeira, não há despesa de juros a cobrir. Este indicador passará a ser relevante quando houver endividamento.", aplicavel: false });
  } else if (despFin <= 0) {
    metrics.push({ id: "icr", valor: Infinity, fmt: "∞", pts: 20, max: 20, band: "verde", ref: "Sua dívida não gera despesa de juros no momento — cobertura plena.", aplicavel: true });
  } else {
    const v = ebitda / despFin;
    if (v < 0) { metrics.push({ id: "icr", valor: v, fmt: fmtMult(v), pts: 0, max: 20, band: "vermelho", ref: "O lucro operacional (EBITDA) é negativo — a empresa opera no prejuízo antes mesmo de pagar juros.", aplicavel: true }); }
    else { const r = scoreFromTable(v, SC_ICR, false); metrics.push({ id: "icr", valor: v, fmt: fmtMult(v), pts: r.pts, max: 20, band: r.band, ref: METRIC_REFS.icr[r.band], aplicavel: true }); }
  }

  // DSCR
  if (!temDivida) {
    metrics.push({ id: "dscr", valor: Infinity, fmt: "∞", pts: 25, max: 25, band: "verde", ref: "Sem dívida, não há parcelas a pagar. Quando houver endividamento, esta métrica mostrará se o caixa gerado cobre juros + amortização do principal.", aplicavel: false });
  } else if (servico <= 0) {
    metrics.push({ id: "dscr", valor: Infinity, fmt: "∞", pts: 25, max: 25, band: "verde", ref: "Não há parcelas de dívida a pagar. Todo o caixa operacional está livre.", aplicavel: true });
  } else {
    const v = cfads / servico;
    if (v < 0) { metrics.push({ id: "dscr", valor: v, fmt: fmtMult(v), pts: 0, max: 25, band: "vermelho", ref: "O caixa disponível para dívida (CFADS) é negativo — a operação não gera dinheiro suficiente após impostos e manutenção para pagar qualquer parcela.", aplicavel: true }); }
    else { const r = scoreFromTable(v, SC_DSCR, false); metrics.push({ id: "dscr", valor: v, fmt: fmtMult(v), pts: r.pts, max: 25, band: r.band, ref: METRIC_REFS.dscr[r.band], aplicavel: true }); }
  }

  // NCG/Receita
  { const r = scoreFromTable(ncgPct, SC_NCG, true); metrics.push({ id: "ncg_receita", valor: ncgPct, fmt: fmtPct(ncgPct), pts: r.pts, max: 15, band: r.band, ref: METRIC_REFS.ncg_receita[r.band], aplicavel: true }); }

  // CFADS/Receita
  { const r = scoreFromTable(cfadsPct, SC_CFADS, false); metrics.push({ id: "cfads_receita", valor: cfadsPct, fmt: fmtPct(cfadsPct), pts: r.pts, max: 15, band: r.band, ref: METRIC_REFS.cfads_receita[r.band], aplicavel: true }); }

  // Score
  let scorePre = metrics.reduce((a, m) => a + m.pts, 0);
  let penalty = 0, penaltyReason = null;
  if (!temDivida) {
    if (cfads < 0) { penalty = -25; penaltyReason = "Atenção: depois de descontar impostos (34%) e o investimento mínimo de manutenção, sua operação não gera caixa livre (CFADS negativo). O score foi reduzido em 25 pontos para refletir essa limitação."; }
    else if (cfadsPct < 2) { penalty = -15; penaltyReason = "Atenção: o caixa livre após impostos e manutenção representa menos de 2% da receita — um nível muito baixo para sustentar dívida. O score foi reduzido em 15 pontos."; }
  }
  const score = Math.max(0, Math.min(100, scorePre + penalty));
  const faixa = score >= 80 ? "verde" : score >= 60 ? "amarelo" : score >= 40 ? "laranja" : "vermelho";
  const faixaLabel = score >= 80 ? "Saudável" : score >= 60 ? "Moderado" : score >= 40 ? "Atenção" : "Restrito";

  // Weakest metric
  const aplicaveis = metrics.filter(m => m.aplicavel);
  const fraca = aplicaveis.reduce((w, m) => (m.pts / m.max) < (w.pts / w.max) ? m : w, aplicaveis[0]);

  // Scenarios
  const cenarios = [
    { id: "conservador", label: "Conservador", eMult: 0.8, cMult: 1.2, tAdj: 0.02, maxMult: 2 },
    { id: "base", label: "Base", eMult: 1, cMult: 1, tAdj: 0, maxMult: 3 },
    { id: "otimista", label: "Otimista", eMult: 1.1, cMult: 0.9, tAdj: -0.01, maxMult: 3.5 },
  ].map(c => {
    const cEbitda = ebitda * c.eMult;
    const cCapex = resolvedCapex * c.cMult;
    const cCfads = cEbitda * P.POST_TAX - cCapex;
    const cTaxa = resolvedTaxa + c.tAdj;
    const capMult = cEbitda * c.maxMult;
    const denom = cTaxa + amortRate;
    const capFlux = cCfads > 0 && denom > 0 ? cCfads / denom : 0;
    const cap = Math.max(0, Math.min(capMult, capFlux));
    return { ...c, ebitda: cEbitda, cfads: cCfads, capMult, capFlux, cap, multEquiv: ebitda > 0 ? cap / ebitda : 0 };
  });

  const cons = cenarios[0], base = cenarios[1], otm = cenarios[2];

  // Residual
  let residual = null;
  if (temDivida) {
    residual = {
      cons: cons.cap - resolvedDivida,
      base: base.cap - resolvedDivida,
      otm: otm.cap - resolvedDivida,
    };
  }

  // Recommendations
  const headlines = {
    verde: { sem: "Os indicadores financeiros da sua empresa mostram uma base sólida para buscar crédito com segurança.", com: "Sua estrutura de dívida está saudável — os indicadores mostram que a empresa consegue honrar os compromissos com folga." },
    amarelo: { sem: "Sua empresa pode acessar crédito, mas é importante respeitar os limites indicados para não comprometer o caixa.", com: "A dívida atual está em nível moderado — ainda há espaço para novas captações, mas com atenção aos indicadores de cobertura." },
    laranja: { sem: "Os números da sua empresa pedem cautela: há limitações no caixa ou no ciclo operacional que reduzem a capacidade de endividamento.", com: "O nível de endividamento atual exige atenção — alguns indicadores estão próximos do limite que credores costumam exigir." },
    vermelho: { sem: "A operação atual não gera caixa suficiente para sustentar dívida. É importante fortalecer a rentabilidade antes de buscar crédito.", com: "O endividamento está acima do que a geração de caixa consegue sustentar. Priorize renegociar condições ou reduzir o saldo devedor." },
  };

  const ctas = {
    verde: { text: "Quero meu diagnóstico completo", ctx: "Com um perfil saudável como o seu, um especialista pode ajudar a identificar as melhores condições de taxa, prazo e instrumento de crédito." },
    amarelo: { text: "Receber diagnóstico personalizado", ctx: "Seu perfil tem potencial, mas alguns ajustes podem ampliar significativamente a capacidade de crédito. Um diagnóstico personalizado mostra exatamente onde atuar." },
    laranja: { text: "Analisar opções com especialista", ctx: "Existem caminhos para fortalecer seus indicadores antes de captar — e escolher o instrumento certo faz toda a diferença. Vamos mapear juntos." },
    vermelho: { text: "Diagnóstico gratuito e urgente", ctx: "Antes de pensar em nova dívida, é essencial entender quais ajustes operacionais podem melhorar rapidamente a sua capacidade de crédito." },
  };

  // Insight
  let insight = { titulo: "", texto: "", acao: "" };
  if (fraca.id === "ncg_receita") {
    const lib = (receita / 365) * 10;
    insight = { titulo: "Otimize seu ciclo de caixa", texto: `O capital de giro (dinheiro preso entre comprar insumos e receber dos clientes) é o principal gargalo da sua empresa. Hoje, esse capital preso representa ${fraca.fmt} da sua receita — quanto maior esse percentual, menos caixa sobra para pagar dívida.`, acao: `Na prática: cada 10 dias a menos no ciclo de caixa (por exemplo, antecipando recebíveis ou negociando prazo com fornecedores) libera cerca de ${fmtMoeda(lib)} em capital de giro.` };
  } else if (fraca.id === "cfads_receita") {
    const lib = receita * 0.01 * P.POST_TAX;
    insight = { titulo: "Aumente a geração de caixa livre", texto: `O caixa disponível para pagar dívida (o que sobra após impostos e investimento de manutenção) representa apenas ${fraca.fmt} da sua receita. Esse é o principal limitador da sua capacidade de endividamento.`, acao: `Na prática: cada 1 ponto percentual a mais na margem operacional (EBITDA) gera aproximadamente ${fmtMoeda(lib)} adicionais em caixa livre por ano.` };
  } else if (fraca.id === "d_ebitda") {
    const custo = ebitda * 0.5 * resolvedTaxa;
    insight = { titulo: "Reduza o peso da dívida sobre o lucro", texto: `A relação dívida/lucro operacional está em ${fraca.fmt}, o que significa que sua dívida equivale a ${fraca.fmt} de lucro operacional anual. ${fraca.valor > 2.5 ? "Esse nível está acima do padrão de mercado e pode dificultar novas captações." : "Esse nível está no limite superior do que bancos consideram confortável."}`, acao: `Na prática: cada 0,5x de redução nessa relação (via amortização ou aumento de lucro) economiza aproximadamente ${fmtMoeda(custo)} por ano em despesa financeira.` };
  } else if (fraca.id === "icr") {
    insight = { titulo: "Melhore a cobertura de juros", texto: `A cobertura de juros (quantas vezes o lucro operacional cobre a despesa de juros) está em ${fraca.fmt}. Isso significa que há pouca margem de segurança — uma queda na receita pode comprometer o pagamento dos juros.`, acao: `Na prática: cada 1 ponto percentual de redução na taxa de juros economiza ${fmtMoeda(resolvedDivida * 0.01)} por ano e melhora diretamente esse indicador.` };
  } else if (fraca.id === "dscr") {
    const prazoAlvo = resolvedPrazo + 2;
    const s7 = despFin + resolvedDivida / prazoAlvo;
    const eco = servico - s7;
    insight = { titulo: "Alivie o peso das parcelas", texto: `A cobertura do serviço da dívida (caixa livre dividido por juros + amortização) está em ${fraca.fmt}. ${fraca.valor < 1.25 ? "Isso está abaixo do mínimo que bancos costumam exigir em contrato (1,25x), o que pode gerar restrições." : "A margem é apertada — qualquer oscilação de caixa pode comprometer o pagamento."}`, acao: eco > 0 ? `Na prática: alongar o prazo da dívida de ${resolvedPrazo} para ${prazoAlvo} anos reduziria as parcelas anuais em aproximadamente ${fmtMoeda(eco)}, aliviando o fluxo de caixa.` : "Na prática: aumente a margem operacional em 2–3 pontos percentuais para gerar mais caixa livre e melhorar essa cobertura." };
  }

  // Recs
  const recs = [];
  const metricaRec = {
    d_ebitda: `O peso da dívida sobre o lucro operacional (${fraca.fmt}) está acima do ideal. Considere fazer amortizações antecipadas ou buscar aumentar o lucro operacional para reduzir essa proporção.`,
    icr: `A cobertura de juros (${fraca.fmt}) está abaixo do ideal — o lucro operacional mal cobre os juros. Busque renegociar taxas menores ou aumente a rentabilidade da operação.`,
    dscr: `A cobertura do serviço da dívida (${fraca.fmt}) é o maior limitador. Aumente a margem operacional ou negocie prazos mais longos para reduzir o valor das parcelas anuais.`,
    ncg_receita: `O capital preso no ciclo operacional (${fraca.fmt} da receita) está alto e reduz o caixa disponível. Renegocie prazos de pagamento com fornecedores e encurte o prazo de recebimento dos clientes.`,
    cfads_receita: `O caixa livre para dívida (${fraca.fmt} da receita) é baixo. Priorize aumentar a margem operacional ou reduzir gastos com manutenção e investimentos recorrentes.`,
  };
  recs.push(metricaRec[fraca.id]);
  if (faixa === "verde" || faixa === "amarelo") {
    recs.push(temDivida ? "Aproveite a posição saudável para renegociar taxas e condições com seus credores — empresas com bons indicadores conseguem spreads (margens sobre o CDI) menores." : "Para a primeira operação de crédito, prefira o sistema SAC (parcelas decrescentes) com prazo de 3 a 5 anos — é o formato mais eficiente para quem está começando a usar dívida.");
    recs.push("Acompanhe trimestralmente a relação dívida/lucro operacional e a cobertura do serviço da dívida. São os dois indicadores que bancos mais observam.");
  } else if (faixa === "laranja") {
    recs.push("Se decidir captar crédito, prefira linhas que ofereçam carência de amortização (6–12 meses sem pagar principal), dando tempo para a operação gerar mais caixa.");
    recs.push("Considere instrumentos de capital de giro, como desconto de recebíveis ou fundos de direitos creditórios (FIDC), que não aumentam a dívida financeira no balanço.");
  } else {
    if (temDivida) { recs.push("Priorize renegociar prazos e condições com os credores atuais antes de buscar novas captações."); recs.push("Avalie a possibilidade de converter parte da dívida em participação societária (equity), reduzindo o peso das parcelas sobre o caixa."); }
    else { recs.push("O foco agora deve ser aumentar a margem operacional (diferença entre receita e custos), gerando mais caixa livre antes de pensar em crédito."); }
  }

  return {
    score, faixa, faixaLabel, scorePre, penalty, penaltyReason,
    metrics, fraca,
    cenarios, cons, base: cenarios[1], otm,
    residual,
    headline: headlines[faixa][temDivida ? "com" : "sem"],
    cta: ctas[faixa],
    insight, recs,
    ebitda, ncg, cfads, temDivida,
    inputs: { receita, margem, ciclo, setor, divida: resolvedDivida, taxa: resolvedTaxa, capex: resolvedCapex, prazo: resolvedPrazo },
  };
}

// =============================================================================
// COMPONENTS
// =============================================================================

const BAND_COLORS = {
  verde: { main: "#059669", bg: "#ECFDF5", border: "#A7F3D0", icon: "✓" },
  amarelo: { main: "#D97706", bg: "#FFFBEB", border: "#FDE68A", icon: "●" },
  laranja: { main: "#EA580C", bg: "#FFF7ED", border: "#FED7AA", icon: "▲" },
  vermelho: { main: "#DC2626", bg: "#FEF2F2", border: "#FECACA", icon: "!" },
};

// --- Animated number counter ---
function AnimatedNumber({ value, format = (v) => Math.round(v).toString(), duration = 800 }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const to = value;
    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return <span>{format(display)}</span>;
}

// --- Score gauge bar ---
function ScoreGauge({ score, faixa }) {
  const [width, setWidth] = useState(0);
  useEffect(() => { const t = setTimeout(() => setWidth(score), 100); return () => clearTimeout(t); }, [score]);
  const color = BAND_COLORS[faixa]?.main || "#6B7280";

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ fontSize: 14, color: "#4B5563", fontWeight: 500 }}>Score de saúde financeira</span>
        <span style={{ fontSize: 28, fontWeight: 700, color, fontFamily: "'DM Sans', sans-serif" }}>
          <AnimatedNumber value={score} format={v => `${Math.round(v)}/100`} duration={1200} />
        </span>
      </div>
      <div style={{ position: "relative", height: 12, borderRadius: 6, background: "#E5E7EB", overflow: "hidden" }}
        role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100}
        aria-label={`Score de saúde financeira: ${score} de 100, classificação ${faixa}`}>
        <div style={{
          height: "100%", borderRadius: 6, background: color,
          width: `${width}%`, transition: "width 1.2s cubic-bezier(0.25,0.46,0.45,0.94)",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "#9CA3AF" }}>
        <span>0 — Restrito</span><span>40 — Atenção</span><span>60 — Moderado</span><span>80 — Saudável</span><span>100</span>
      </div>
    </div>
  );
}

// --- Debt range bar ---
function DebtRangeBar({ cons, base, otm }) {
  const max = otm * 1.15 || 1;
  const [animate, setAnimate] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimate(true), 200); return () => clearTimeout(t); }, []);

  const pos = (v) => `${Math.max(0, (v / max) * 100)}%`;

  return (
    <div style={{ position: "relative", padding: "32px 0 8px" }}>
      <div style={{ height: 10, borderRadius: 5, background: "#E5E7EB", position: "relative", overflow: "visible" }}>
        <div style={{
          position: "absolute", left: pos(cons), right: `${100 - (otm / max * 100)}%`,
          height: "100%", borderRadius: 5,
          background: "linear-gradient(90deg, #059669, #2563EB, #7C3AED)",
          opacity: animate ? 1 : 0, transform: animate ? "scaleX(1)" : "scaleX(0)", transformOrigin: "left",
          transition: "all 0.8s cubic-bezier(0.25,0.46,0.45,0.94)",
        }} />
        {[
          { v: cons, label: "Conservador", color: "#059669" },
          { v: base, label: "Base", color: "#2563EB" },
          { v: otm, label: "Otimista", color: "#7C3AED" },
        ].map((p, i) => (
          <div key={i} style={{
            position: "absolute", left: pos(p.v), transform: "translateX(-50%)",
            display: "flex", flexDirection: "column", alignItems: "center", top: -28,
            opacity: animate ? 1 : 0, transition: `opacity 0.4s ease ${0.4 + i * 0.2}s`,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: p.color, whiteSpace: "nowrap" }}>{fmtMoeda(p.v)}</span>
            <div style={{ width: 2, height: 14, background: p.color, margin: "4px 0 2px", borderRadius: 1 }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, fontSize: 12, color: "#6B7280" }}>
        <span>Conservador</span><span>Base</span><span>Otimista</span>
      </div>
    </div>
  );
}

// --- Metric card ---
function MetricCard({ metric, delay = 0 }) {
  const c = BAND_COLORS[metric.band];
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), delay); return () => clearTimeout(t); }, [delay]);

  return (
    <div style={{
      background: "white", border: `1px solid ${c.border}`, borderRadius: 8, padding: "16px 18px",
      opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(12px)",
      transition: "all 0.4s cubic-bezier(0.16,1,0.3,1)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: "#4B5563", fontWeight: 500 }}>{METRIC_NAMES[metric.id]?.nome || metric.id}</span>
        <span style={{
          width: 24, height: 24, borderRadius: 12, background: c.bg, border: `1.5px solid ${c.main}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, color: c.main,
        }}>{c.icon}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: c.main, fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>
        {metric.fmt}
      </div>
      <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.5 }}>{metric.ref}</div>
    </div>
  );
}

// --- Staggered section ---
function FadeIn({ delay = 0, children, style = {} }) {
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div style={{
      opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(16px)",
      transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)", ...style,
    }}>
      {children}
    </div>
  );
}

// --- Input field ---
function InputField({ label, help, placeholder, value, onChange, error, warning, inputMode, suffix, id, onBlur, required }) {
  const [focused, setFocused] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const hasError = error && !focused;
  const borderColor = hasError ? "#EF4444" : focused ? "#3B82F6" : "#D1D5DB";

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <label htmlFor={id} style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>
          {label}{required && <span style={{ color: "#DC2626", marginLeft: 2 }}>*</span>}
        </label>
        {help && (
          <button
            type="button"
            onClick={() => setShowHelp(!showHelp)}
            style={{
              width: 18, height: 18, borderRadius: 9, border: "1.5px solid #9CA3AF", background: "none",
              fontSize: 11, color: "#9CA3AF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 600, lineHeight: 1, padding: 0,
            }}
            aria-label={`Ajuda para ${label}`}
          >i</button>
        )}
      </div>
      {showHelp && (
        <div style={{
          fontSize: 13, color: "#6B7280", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 6,
          padding: "10px 12px", marginBottom: 8, lineHeight: 1.6,
          animation: "fadeIn 0.2s ease",
        }}>{help}</div>
      )}
      <div style={{ position: "relative" }}>
        <input
          id={id}
          type="text"
          inputMode={inputMode || "text"}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); onBlur?.(); }}
          style={{
            width: "100%", height: 48, borderRadius: 6, border: `1.5px solid ${borderColor}`,
            padding: suffix ? "0 40px 0 16px" : "0 16px", fontSize: 16, color: "#111827",
            outline: "none", boxSizing: "border-box", background: "white",
            transition: "border-color 150ms ease, box-shadow 150ms ease",
            boxShadow: focused ? "0 0 0 3px rgba(59,130,246,0.1)" : "none",
            fontFamily: "'DM Sans', 'Inter', sans-serif",
          }}
          aria-describedby={hasError ? `${id}-error` : warning ? `${id}-warn` : undefined}
          aria-invalid={hasError}
        />
        {suffix && (
          <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#9CA3AF" }}>{suffix}</span>
        )}
      </div>
      {hasError && (
        <div id={`${id}-error`} role="alert" style={{ fontSize: 13, color: "#DC2626", marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 14 }}>⚠</span> {error}
        </div>
      )}
      {warning && !error && (
        <div id={`${id}-warn`} style={{ fontSize: 13, color: "#D97706", marginTop: 6 }}>{warning}</div>
      )}
    </div>
  );
}

// --- Select field ---
function SelectField({ label, help, value, onChange, options, id, placeholder }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label htmlFor={id} style={{ fontSize: 14, fontWeight: 500, color: "#111827", display: "block", marginBottom: 6 }}>{label}</label>
      <select
        id={id} value={value} onChange={e => onChange(e.target.value)}
        style={{
          width: "100%", height: 48, borderRadius: 6, border: "1.5px solid #D1D5DB",
          padding: "0 16px", fontSize: 16, color: value ? "#111827" : "#9CA3AF",
          background: "white", outline: "none", cursor: "pointer", boxSizing: "border-box",
          fontFamily: "'DM Sans', 'Inter', sans-serif",
        }}
      >
        <option value="" disabled>{placeholder || "Selecione"}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// =============================================================================
// SCREENS
// =============================================================================

function ScreenInputs({ onCalculate, initialValues }) {
  const [receita, setReceita] = useState(initialValues?.receita || "");
  const [margem, setMargem] = useState(initialValues?.margem || "");
  const [ciclo, setCiclo] = useState(initialValues?.ciclo || "");
  const [showOptional, setShowOptional] = useState(initialValues?.showOptional || false);
  const [setor, setSetor] = useState(initialValues?.setor || "");
  const [divida, setDivida] = useState(initialValues?.divida || "");
  const [taxa, setTaxa] = useState(initialValues?.taxa || "");
  const [capex, setCapex] = useState(initialValues?.capex || "");
  const [prazo, setPrazo] = useState(initialValues?.prazo || 5);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [shakeField, setShakeField] = useState(null);
  const firstErrorRef = useRef(null);

  const parseNum = (v) => { const n = parseFloat(String(v).replace(/\./g, "").replace(",", ".")); return isNaN(n) ? null : n; };

  const validate = useCallback(() => {
    const e = {};
    const r = parseNum(receita);
    if (!receita) e.receita = "Este campo é necessário para o cálculo.";
    else if (r === null) e.receita = "Informe apenas números.";
    else if (r < 1e6) e.receita = "Informe um valor a partir de R$ 1 milhão.";
    else if (r > 5e8) e.receita = "Para empresas acima de R$ 500 milhões, entre em contato.";

    const m = parseNum(margem);
    if (!margem) e.margem = "Este campo é necessário para o cálculo.";
    else if (m === null) e.margem = "Informe apenas números.";
    else if (m < 1) e.margem = "Margens abaixo de 1% indicam operação no limiar de break-even.";
    else if (m > 60) e.margem = "Margens acima de 60% são atípicas. Verifique o valor.";

    const c = parseNum(ciclo);
    if (!ciclo && ciclo !== "0" && ciclo !== 0) e.ciclo = "Este campo é necessário para o cálculo.";
    else if (c === null) e.ciclo = "Informe apenas números.";
    else if (c < 0) e.ciclo = "O ciclo de caixa não pode ser negativo.";
    else if (c > 365) e.ciclo = "Ciclos acima de 365 dias são atípicos.";

    return e;
  }, [receita, margem, ciclo]);

  const warnings = useMemo(() => {
    const w = {};
    const m = parseNum(margem);
    if (m && m > 40 && m <= 60) w.margem = `Margem de ${m}% é incomum. Confirme que é o EBITDA (não margem bruta).`;
    const c = parseNum(ciclo);
    if (c && c > 180) w.ciclo = `Ciclo de ${c} dias é elevado. Verifique o cálculo PMR + PME − PMP.`;
    return w;
  }, [margem, ciclo]);

  const canSubmit = receita && margem && (ciclo || ciclo === "0" || ciclo === 0);

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    const errs = validate();
    setErrors(errs);
    setTouched({ receita: true, margem: true, ciclo: true });
    if (Object.keys(errs).length > 0) {
      const first = Object.keys(errs)[0];
      setShakeField(first);
      setTimeout(() => setShakeField(null), 500);
      document.getElementById(`input-${first}`)?.focus();
      return;
    }
    onCalculate({
      receita: parseNum(receita), margem: parseNum(margem), ciclo: parseNum(ciclo),
      setor: setor || Setor.OUTROS,
      divida: parseNum(divida) || undefined,
      taxa: parseNum(taxa) ? parseNum(taxa) / 100 : undefined,
      capex: parseNum(capex) || undefined,
      prazo: Number(prazo) || 5,
      showOptional,
    });
  };

  const shakeStyle = (field) => shakeField === field ? {
    animation: "shake 0.4s ease",
  } : {};

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 6px", fontFamily: "'DM Sans', sans-serif" }}>
          Calculadora de capacidade de endividamento
        </h2>
        <p style={{ fontSize: 15, color: "#6B7280", margin: 0 }}>Preencha os dados abaixo para ver sua faixa segura de dívida.</p>
      </div>

      <div style={shakeStyle("receita")}>
        <InputField
          id="input-receita" label="Receita anual bruta (R$)" placeholder="Ex: 30.000.000"
          value={receita} onChange={setReceita} inputMode="numeric" required
          error={touched.receita && errors.receita} onBlur={() => setTouched(t => ({ ...t, receita: true }))}
          help="O faturamento total bruto da empresa nos últimos 12 meses (antes de descontar impostos sobre vendas). Se a empresa tem menos de 12 meses, multiplique a receita mensal média por 12."
        />
      </div>
      <div style={shakeStyle("margem")}>
        <InputField
          id="input-margem" label="Margem EBITDA (%)" placeholder="Ex: 15" suffix="%"
          value={margem} onChange={setMargem} inputMode="decimal" required
          error={touched.margem && errors.margem} warning={warnings.margem}
          onBlur={() => setTouched(t => ({ ...t, margem: true }))}
          help="O EBITDA é o lucro operacional antes de juros, impostos, depreciação e amortização — ou seja, quanto a operação gera de lucro por si mesma. A margem EBITDA é esse valor dividido pela receita, em percentual. Referências por setor: Tecnologia 20–35%, Serviços 12–22%, Indústria 8–18%, Comércio 4–10%."
        />
      </div>
      <div style={shakeStyle("ciclo")}>
        <InputField
          id="input-ciclo" label="Ciclo de caixa (dias)" placeholder="Ex: 75" suffix="dias"
          value={ciclo} onChange={setCiclo} inputMode="numeric" required
          error={touched.ciclo && errors.ciclo} warning={warnings.ciclo}
          onBlur={() => setTouched(t => ({ ...t, ciclo: true }))}
          help="O ciclo de caixa mede quantos dias o dinheiro fica 'preso' na operação. Cálculo: prazo médio de recebimento (PMR) + prazo médio de estoque (PME) − prazo médio de pagamento a fornecedores (PMP). Quanto maior, mais capital de giro a empresa precisa. Referências: Tecnologia 30–50 dias, Serviços 30–60, Indústria 60–120, Comércio 20–50."
        />
      </div>

      {/* Optional accordion */}
      <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 16, marginTop: 4 }}>
        <button
          type="button" onClick={() => setShowOptional(!showOptional)}
          style={{
            background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center",
            gap: 8, padding: 0, fontSize: 14, color: "#2563EB", fontWeight: 500,
          }}
          aria-expanded={showOptional}
        >
          <span style={{ transform: showOptional ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 200ms ease", display: "inline-block" }}>▸</span>
          {showOptional ? "Campos opcionais — quanto mais dados, mais preciso" : "Refinar meu resultado (opcional)"}
        </button>
        <div style={{
          maxHeight: showOptional ? 600 : 0, overflow: "hidden",
          transition: "max-height 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.25s ease",
          opacity: showOptional ? 1 : 0, marginTop: showOptional ? 16 : 0,
        }}>
          <SelectField
            id="input-setor" label="Setor de atuação" value={setor} onChange={setSetor}
            placeholder="Selecione seu setor"
            options={SETORES_LIST.map(s => ({ value: s.id, label: s.nome }))}
          />
          <InputField
            id="input-divida" label="Dívida bruta atual (R$)" placeholder="Ex: 5.000.000"
            value={divida} onChange={setDivida} inputMode="numeric"
            help="A soma de todos os empréstimos bancários, financiamentos, debêntures e outras dívidas financeiras (de curto e longo prazo). Não inclua contas a pagar do dia a dia (fornecedores, salários, impostos)."
          />
          <InputField
            id="input-taxa" label="Taxa de juros média (% a.a.)" placeholder="Ex: 14.25" suffix="% a.a."
            value={taxa} onChange={setTaxa} inputMode="decimal"
            help="A taxa de juros média de todas as suas dívidas, ponderada pelo valor de cada uma. Se não souber, a calculadora usará como padrão CDI + 3% ao ano (14,25%), que é uma referência de mercado para empresas de médio porte."
          />
          <InputField
            id="input-capex" label="Investimento anual de manutenção (R$)" placeholder="Ex: 900.000"
            value={capex} onChange={setCapex} inputMode="numeric"
            help="Quanto a empresa gasta por ano para manter máquinas, equipamentos e infraestrutura funcionando (não inclui investimentos para crescimento). Se não souber, a calculadora usará a média do setor, que varia de 2% a 7,5% da receita."
          />

          {/* Prazo desejado (slider opcional) */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <label htmlFor="input-prazo" style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>
                Prazo desejado da operação
              </label>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#2563EB", fontFamily: "'DM Sans', sans-serif" }}>
                {prazo} {Number(prazo) === 1 ? "ano" : "anos"}
              </span>
            </div>
            <input
              id="input-prazo"
              type="range"
              min={1}
              max={20}
              step={1}
              value={prazo}
              onChange={(e) => setPrazo(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#2563EB", cursor: "pointer" }}
              aria-label="Prazo desejado da operação em anos"
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
              <span>1 ano</span>
              <span>20 anos</span>
            </div>
            <div style={{ fontSize: 13, color: "#6B7280", marginTop: 6, lineHeight: 1.5 }}>
              Usado para calcular a amortização do principal no serviço da dívida. Se não ajustado, consideramos 5 anos como referência padrão.
            </div>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        style={{
          width: "100%", height: 52, borderRadius: 8, border: "none",
          background: canSubmit ? "#2563EB" : "#D1D5DB",
          color: canSubmit ? "white" : "#9CA3AF",
          fontSize: 16, fontWeight: 600, cursor: canSubmit ? "pointer" : "not-allowed",
          marginTop: 24, transition: "all 150ms ease",
          fontFamily: "'DM Sans', 'Inter', sans-serif",
        }}
        onMouseEnter={e => { if (canSubmit) e.target.style.background = "#1D4ED8"; }}
        onMouseLeave={e => { if (canSubmit) e.target.style.background = "#2563EB"; }}
      >
        {canSubmit ? "Ver meu resultado" : "Preencha os 3 campos acima para continuar"}
      </button>
    </form>
  );
}

function ScreenProcessing() {
  const [step, setStep] = useState(0);
  const steps = ["Calculando lucro operacional e caixa disponível para dívida", "Simulando cenários de stress (conservador, base e otimista)", "Gerando seu diagnóstico com recomendações personalizadas"];

  useEffect(() => {
    const timers = [setTimeout(() => setStep(1), 500), setTimeout(() => setStep(2), 1000)];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 280, gap: 24 }}>
      <div style={{ width: 48, height: 48, position: "relative" }}>
        <div style={{
          width: 48, height: 48, borderRadius: 24, border: "3px solid #E5E7EB", borderTopColor: "#2563EB",
          animation: "spin 0.8s linear infinite",
        }} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "#111827" }}>Analisando seus números...</div>
      <div style={{ textAlign: "center" }}>
        {steps.map((s, i) => (
          <div key={i} style={{
            fontSize: 14, color: i <= step ? "#4B5563" : "transparent", height: 24,
            transition: "all 0.3s ease", opacity: i <= step ? 1 : 0,
            transform: i <= step ? "translateY(0)" : "translateY(8px)",
          }}>
            {i < step && <span style={{ color: "#059669", marginRight: 6 }}>✓</span>}
            {i === step && <span style={{ color: "#2563EB", marginRight: 6 }}>●</span>}
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScreenResults({ result, onRecalculate, onCapture }) {
  const r = result;
  const c = BAND_COLORS[r.faixa];

  return (
    <div>
      {/* Block 1: Headline + Score */}
      <FadeIn delay={0}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            display: "inline-block", padding: "4px 14px", borderRadius: 20,
            background: c.bg, border: `1px solid ${c.border}`, fontSize: 13, fontWeight: 600, color: c.main,
            marginBottom: 12,
          }}>{c.icon} {r.faixaLabel}</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 6px", lineHeight: 1.35, fontFamily: "'DM Sans', sans-serif" }}>{r.headline}</h2>
          {r.penaltyReason && (
            <div style={{ fontSize: 12, color: "#D97706", background: "#FFFBEB", padding: "6px 12px", borderRadius: 6, marginTop: 8 }}>
              {r.penaltyReason}
            </div>
          )}
        </div>
        <ScoreGauge score={r.score} faixa={r.faixa} />
      </FadeIn>

      {/* Block 2: Debt range */}
      <FadeIn delay={200} style={{ marginTop: 32 }}>
        <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "20px 22px", border: "1px solid #E5E7EB" }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#111827", margin: "0 0 4px" }}>Faixa segura de endividamento</h3>
          <DebtRangeBar cons={r.cons.cap} base={r.base.cap} otm={r.otm.cap} />
          <p style={{ fontSize: 14, color: "#4B5563", lineHeight: 1.6, margin: "16px 0 0" }}>
            {r.base.cap === 0
              ? "A geração de caixa atual não suporta endividamento no cenário base."
              : r.cons.cap > 0
                ? <>Sua empresa pode sustentar entre <strong>{fmtMoeda(r.cons.cap)}</strong> e <strong>{fmtMoeda(r.otm.cap)}</strong> em dívida total, equivalente a <strong>{fmtMult(r.cons.multEquiv)}–{fmtMult(r.otm.multEquiv)}</strong> o EBITDA.</>
                : <>No cenário base, sua empresa suportaria até <strong>{fmtMoeda(r.base.cap)}</strong> ({fmtMult(r.base.multEquiv)} EBITDA). Sob stress, a capacidade cairia para zero.</>
            }
          </p>
          {r.residual && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "white", borderRadius: 6, border: "1px solid #E5E7EB", fontSize: 13, color: "#4B5563", lineHeight: 1.5 }}>
              <strong style={{ color: "#111827" }}>Capacidade residual:</strong>{" "}
              {r.residual.base > 0
                ? <>Ainda há folga de <strong>{fmtMoeda(r.residual.base)}</strong> no cenário base.</>
                : <>Sua dívida atual excede a capacidade recomendada em <strong>{fmtMoeda(Math.abs(r.residual.base))}</strong>.</>
              }
            </div>
          )}
        </div>
      </FadeIn>

      {/* Block 3: Metrics */}
      <FadeIn delay={400} style={{ marginTop: 28 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "#111827", margin: "0 0 14px" }}>Suas métricas em detalhe</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {r.metrics.map((m, i) => <MetricCard key={m.id} metric={m} delay={450 + i * 100} />)}
        </div>
      </FadeIn>

      {/* Block 4: Insight + recommendations */}
      <FadeIn delay={700} style={{ marginTop: 28 }}>
        <div style={{ background: "#EFF6FF", borderRadius: 10, padding: "20px 22px", border: "1px solid #BFDBFE" }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "#1E40AF", margin: "0 0 6px" }}>{r.insight.titulo}</h3>
          <p style={{ fontSize: 14, color: "#1E3A5F", margin: "0 0 10px", lineHeight: 1.5 }}>{r.insight.texto}</p>
          {r.insight.acao && (
            <div style={{ fontSize: 14, color: "#1D4ED8", fontWeight: 500, background: "white", padding: "10px 14px", borderRadius: 6, lineHeight: 1.5 }}>
              💡 {r.insight.acao}
            </div>
          )}
        </div>

        <div style={{ marginTop: 20 }}>
          <h4 style={{ fontSize: 15, fontWeight: 600, color: "#111827", margin: "0 0 10px" }}>Próximos passos recomendados</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {r.recs.map((rec, i) => (
              <div key={i} style={{ display: "flex", gap: 10, fontSize: 14, color: "#374151", lineHeight: 1.5 }}>
                <span style={{ color: "#2563EB", fontWeight: 600, flexShrink: 0 }}>{i + 1}.</span>
                <span>{rec}</span>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>

      {/* Block 5: CTA */}
      <FadeIn delay={900} style={{ marginTop: 28 }}>
        <div style={{
          background: "linear-gradient(135deg, #1E3A5F 0%, #1E40AF 100%)", borderRadius: 12, padding: "28px 24px",
          color: "white", textAlign: "center",
        }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, opacity: 0.7, marginBottom: 8 }}>Resultado personalizado?</div>
          <p style={{ fontSize: 15, lineHeight: 1.6, margin: "0 0 16px", opacity: 0.9 }}>{r.cta.ctx}</p>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, marginBottom: 20, fontSize: 14, textAlign: "left", maxWidth: 360, margin: "0 auto 20px" }}>
            {["Análise completa da sua estrutura de capital e capacidade de endividamento", "Simulação com taxas e prazos reais de mercado para seu perfil", "Recomendações de instrumento de crédito (fundos, debêntures, notas comerciais)", "Conversa individual com especialista DeFin — sem compromisso"].map((b, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ color: "#60A5FA", flexShrink: 0 }}>✓</span>
                <span style={{ opacity: 0.92 }}>{b}</span>
              </div>
            ))}
          </div>
          <button
            onClick={onCapture}
            style={{
              height: 48, borderRadius: 8, border: "none", background: "white", color: "#1E40AF",
              fontSize: 16, fontWeight: 600, cursor: "pointer", padding: "0 32px",
              transition: "transform 150ms ease, box-shadow 150ms ease",
              fontFamily: "'DM Sans', 'Inter', sans-serif",
            }}
            onMouseEnter={e => { e.target.style.transform = "translateY(-1px)"; e.target.style.boxShadow = "0 4px 14px rgba(0,0,0,0.15)"; }}
            onMouseLeave={e => { e.target.style.transform = "none"; e.target.style.boxShadow = "none"; }}
          >
            {r.cta.text}
          </button>
        </div>
      </FadeIn>

      {/* Recalculate */}
      <div style={{ textAlign: "center", marginTop: 20 }}>
        <button
          onClick={onRecalculate}
          style={{
            background: "none", border: "1.5px solid #2563EB", borderRadius: 8, height: 44,
            padding: "0 28px", color: "#2563EB", fontSize: 14, fontWeight: 600, cursor: "pointer",
            transition: "all 150ms ease",
          }}
          onMouseEnter={e => { e.target.style.background = "#EFF6FF"; }}
          onMouseLeave={e => { e.target.style.background = "none"; }}
        >
          ← Recalcular
        </button>
      </div>
    </div>
  );
}

// --- Gate de e-mail (exigido antes de ver o resultado) ---
// TODO: substituir pela URL real do webhook de leads
const WEBHOOK_EMAIL_URL = "TODO_WEBHOOK_URL";

// Regex robusto para validar formato de e-mail real:
// - parte local sem espaços, com caracteres válidos
// - domínio com pelo menos um ponto e TLD de 2+ letras
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function validarEmail(email) {
  const valor = (email || "").trim();
  if (!valor) return "Informe seu e-mail.";
  if (!EMAIL_REGEX.test(valor)) return "Informe um e-mail válido (ex: nome@empresa.com).";
  return "";
}

async function enviarEmailWebhook(email) {
  if (!WEBHOOK_EMAIL_URL || WEBHOOK_EMAIL_URL === "TODO_WEBHOOK_URL") {
    console.warn("[CalculadoraEndividamento] WEBHOOK_EMAIL_URL não configurado — pulando envio.");
    return;
  }
  try {
    await fetch(WEBHOOK_EMAIL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        origem: "calculadora-capacidade-endividamento",
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.warn("[CalculadoraEndividamento] Falha ao enviar e-mail para webhook:", err);
  }
}

function ScreenEmailGate({ onUnlock, onBack }) {
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    const msg = validarEmail(email);
    if (msg) { setErro(msg); return; }
    setErro("");
    setEnviando(true);
    await enviarEmailWebhook(email.trim());
    setEnviando(false);
    onUnlock(email.trim());
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 56, height: 56, borderRadius: 28, background: "#EFF6FF",
          border: "1.5px solid #BFDBFE", marginBottom: 14,
        }}>
          <span style={{ fontSize: 26 }}>🔒</span>
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 8px", fontFamily: "'DM Sans', sans-serif" }}>
          Seu resultado está pronto
        </h2>
        <p style={{ fontSize: 15, color: "#6B7280", margin: 0, lineHeight: 1.55 }}>
          Informe seu <strong>e-mail</strong> para acessar o relatório completo e receber uma cópia por e-mail.
        </p>
      </div>

      <InputField
        id="gate-email"
        label="E-mail"
        placeholder="nome@suaempresa.com.br"
        value={email}
        onChange={(v) => { setEmail(v); if (erro) setErro(""); }}
        error={erro}
        inputMode="email"
        required
      />

      <button
        type="submit"
        disabled={enviando}
        style={{
          width: "100%", height: 52, borderRadius: 8, border: "none",
          background: enviando ? "#93C5FD" : "#2563EB",
          color: "white", fontSize: 16, fontWeight: 600,
          cursor: enviando ? "wait" : "pointer", marginTop: 8,
          fontFamily: "'DM Sans', 'Inter', sans-serif",
          transition: "background 150ms ease",
        }}
        onMouseEnter={(e) => { if (!enviando) e.target.style.background = "#1D4ED8"; }}
        onMouseLeave={(e) => { if (!enviando) e.target.style.background = "#2563EB"; }}
      >
        {enviando ? "Liberando..." : "Ver meu resultado"}
      </button>

      <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", marginTop: 14, lineHeight: 1.6 }}>
        Ao continuar, você concorda com nossa{" "}
        <a
          href="https://defin.global/politica-de-privacidade"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#2563EB", textDecoration: "underline" }}
        >
          Política de Privacidade
        </a>.
      </p>

      {onBack && (
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button
            type="button"
            onClick={onBack}
            style={{ background: "none", border: "none", color: "#6B7280", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}
          >
            Voltar e revisar os dados
          </button>
        </div>
      )}
    </form>
  );
}

function ScreenCapture({ onSubmit, onBack, initialEmail }) {
  const [email, setEmail] = useState(initialEmail || "");
  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [cargo, setCargo] = useState("");
  const [tel, setTel] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState({});

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!email || !/\S+@\S+\.\S+/.test(email)) errs.email = "Informe um email válido.";
    if (!nome) errs.nome = "Informe seu nome.";
    if (!empresa) errs.empresa = "Informe o nome da empresa.";
    if (!consent) errs.consent = "É necessário concordar para continuar.";
    setErrors(errs);
    if (Object.keys(errs).length === 0) onSubmit({ email, nome, empresa, cargo, tel });
  };

  const emailWarning = null;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <button
        type="button" onClick={onBack}
        style={{ background: "none", border: "none", cursor: "pointer", color: "#2563EB", fontSize: 14, fontWeight: 500, padding: 0, marginBottom: 16, display: "flex", alignItems: "center", gap: 4 }}
      >← Voltar ao resultado</button>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 6px", fontFamily: "'DM Sans', sans-serif" }}>Receba seu diagnóstico personalizado</h2>
      <p style={{ fontSize: 15, color: "#6B7280", margin: "0 0 24px" }}>Preencha seus dados abaixo. Um especialista da DeFin vai analisar seu resultado e entrar em contato em até 24 horas com um diagnóstico completo e personalizado.</p>

      <InputField id="cap-email" label="Email" placeholder="nome@empresa.com.br" value={email} onChange={setEmail} error={errors.email} warning={emailWarning} required />
      <InputField id="cap-nome" label="Seu nome" placeholder="João da Silva" value={nome} onChange={setNome} error={errors.nome} required />
      <InputField id="cap-empresa" label="Nome da empresa" placeholder="Empresa S.A." value={empresa} onChange={setEmpresa} error={errors.empresa} required />
      <InputField id="cap-cargo" label="Seu cargo" placeholder="CFO, Controller, Sócio..." value={cargo} onChange={setCargo} />
      <InputField id="cap-tel" label="Telefone (opcional)" placeholder="(11) 99999-0000" value={tel} onChange={setTel} inputMode="tel" />

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "16px 0", cursor: "pointer" }}>
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
          style={{ marginTop: 3, accentColor: "#2563EB", width: 16, height: 16 }} />
        <span style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.5 }}>
          Concordo em receber comunicações da DeFin sobre meu diagnóstico e conteúdos relacionados. Posso cancelar a qualquer momento.
        </span>
      </label>
      {errors.consent && <div style={{ fontSize: 13, color: "#DC2626", marginBottom: 12 }}>⚠ {errors.consent}</div>}

      <button type="submit" style={{
        width: "100%", height: 52, borderRadius: 8, border: "none", background: "#2563EB",
        color: "white", fontSize: 16, fontWeight: 600, cursor: "pointer", marginTop: 8,
        fontFamily: "'DM Sans', 'Inter', sans-serif",
        transition: "background 150ms ease",
      }}
        onMouseEnter={e => e.target.style.background = "#1D4ED8"}
        onMouseLeave={e => e.target.style.background = "#2563EB"}
      >Enviar e agendar diagnóstico</button>
      <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", marginTop: 10 }}>
        Seus dados estão seguros.{" "}
        <a
          href="https://defin.global/politica-de-privacidade"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#2563EB" }}
        >
          Política de Privacidade
        </a>.
      </p>
    </form>
  );
}

function ScreenConfirmation({ email }) {
  const [showCheck, setShowCheck] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShowCheck(true), 200); return () => clearTimeout(t); }, []);

  return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{
        width: 64, height: 64, borderRadius: 32, background: "#ECFDF5", border: "2px solid #059669",
        display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px",
        transform: showCheck ? "scale(1)" : "scale(0.5)", opacity: showCheck ? 1 : 0,
        transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)",
      }}>
        <span style={{ fontSize: 28, color: "#059669" }}>✓</span>
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 10px", fontFamily: "'DM Sans', sans-serif" }}>Diagnóstico agendado!</h2>
      <p style={{ fontSize: 15, color: "#4B5563", lineHeight: 1.6, margin: "0 0 28px" }}>
        Enviamos um email para <strong>{email}</strong> com o resumo completo do seu resultado. Um especialista da DeFin vai analisar seus indicadores e entrar em contato em até 24 horas para discutir as melhores opções para a sua empresa.
      </p>

      <div style={{ textAlign: "left", background: "#F9FAFB", borderRadius: 10, padding: "20px 22px", border: "1px solid #E5E7EB" }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: "#111827", margin: "0 0 14px" }}>Enquanto isso, aprofunde-se:</p>
        {[
          { icon: "📄", text: "Qual o nível seguro de endividamento? Guia prático para empresas em crescimento", sub: "Artigo no blog" },
          { icon: "📊", text: "5 Mitos sobre Endividamento — série no LinkedIn", sub: "Carrossel LinkedIn" },
          { icon: "📥", text: "Baixar meu resultado em PDF", sub: "Download direto" },
        ].map((l, i) => (
          <a key={i} href="#" style={{
            display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0",
            borderTop: i > 0 ? "1px solid #E5E7EB" : "none", textDecoration: "none", color: "inherit",
            transition: "background 100ms ease",
          }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>{l.icon}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#2563EB" }}>{l.text}</div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>{l.sub}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN CALCULATOR COMPONENT
// =============================================================================

export default function CalculadoraEndividamento() {
  const [screen, setScreen] = useState("inputs"); // inputs | processing | emailgate | results | capture | confirm
  const [result, setResult] = useState(null);
  const [savedInputs, setSavedInputs] = useState(null);
  const [captureEmail, setCaptureEmail] = useState("");
  const [gateEmail, setGateEmail] = useState(""); // e-mail capturado no gate (libera resultado na sessão)
  const widgetRef = useRef(null);

  const handleCalculate = (vals) => {
    setSavedInputs(vals);
    setScreen("processing");

    // Simulate processing time (UX spec: 1.5s)
    setTimeout(() => {
      const r = calculate(vals.receita, vals.margem, vals.ciclo, vals.setor, vals.divida, vals.taxa, vals.capex, vals.prazo);
      setResult(r);
      // Se já liberou o e-mail nesta sessão, pula o gate
      setScreen(gateEmail ? "results" : "emailgate");
      widgetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 1800);
  };

  const handleEmailGateUnlock = (email) => {
    setGateEmail(email);
    setScreen("results");
    widgetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleRecalculate = () => {
    setScreen("inputs");
  };

  const handleCapture = () => {
    setScreen("capture");
    widgetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleLeadSubmit = (data) => {
    setCaptureEmail(data.email);
    setScreen("confirm");
    widgetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div style={{
      minHeight: "100vh", background: "linear-gradient(180deg, #F0F4FF 0%, #F9FAFB 40%, #FFFFFF 100%)",
      fontFamily: "'DM Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      padding: "0 16px",
    }}>
      {/* Global styles */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(5px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(3px)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulseGlow { 0%,100%{box-shadow:0 0 0 0 rgba(37,99,235,0.2)} 50%{box-shadow:0 0 0 8px rgba(37,99,235,0)} }
        *, *::before, *::after { box-sizing: border-box; }
        input, select, button { font-family: inherit; }
        ::selection { background: #BFDBFE; }
      `}</style>

      {/* Hero */}
      {screen === "inputs" && (
        <div style={{ textAlign: "center", maxWidth: 560, margin: "0 auto", paddingTop: 48, paddingBottom: 20 }}>
          <div style={{
            display: "inline-block", padding: "5px 14px", borderRadius: 20,
            background: "rgba(37,99,235,0.08)", fontSize: 12, fontWeight: 600, color: "#2563EB",
            letterSpacing: 0.5, marginBottom: 16, textTransform: "uppercase",
          }}>
            DeFin Global — Ferramenta gratuita
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: "#0F172A", margin: "0 0 12px", lineHeight: 1.2, letterSpacing: -0.5 }}>
            Qual o nível seguro de endividamento da sua empresa?
          </h1>
          <p style={{ fontSize: 17, color: "#4B5563", margin: "0 0 8px", lineHeight: 1.6 }}>
            Descubra em 3 minutos quanto sua empresa pode tomar de crédito com segurança — usando as mesmas métricas que bancos e fundos analisam antes de emprestar.
          </p>
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: "0 0 32px" }}>
            Metodologia baseada em referências de análise de crédito institucional (Damodaran/NYU, JPMorgan, OCDE)
          </p>
        </div>
      )}

      {/* Widget */}
      <div
        ref={widgetRef}
        style={{
          maxWidth: 640, margin: "0 auto", background: "white", borderRadius: 16,
          padding: screen === "processing" ? "40px 28px" : "32px 28px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
          border: "1px solid #E5E7EB",
          marginBottom: 40,
          transition: "padding 0.3s ease",
        }}
      >
        {screen === "inputs" && <ScreenInputs onCalculate={handleCalculate} initialValues={savedInputs} />}
        {screen === "processing" && <ScreenProcessing />}
        {screen === "emailgate" && <ScreenEmailGate onUnlock={handleEmailGateUnlock} onBack={() => setScreen("inputs")} />}
        {screen === "results" && <ScreenResults result={result} onRecalculate={handleRecalculate} onCapture={handleCapture} />}
        {screen === "capture" && <ScreenCapture onSubmit={handleLeadSubmit} onBack={() => setScreen("results")} initialEmail={gateEmail} />}
        {screen === "confirm" && <ScreenConfirmation email={captureEmail} />}
      </div>

      {/* Disclaimer */}
      <div style={{ maxWidth: 640, margin: "0 auto 48px", textAlign: "center" }}>
        <p style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.6 }}>
          Esta calculadora é uma ferramenta educacional. Os resultados não constituem recomendação de investimento, oferta de crédito ou aconselhamento financeiro. Consulte um assessor qualificado antes de tomar decisões.
        </p>
      </div>
    </div>
  );
}
