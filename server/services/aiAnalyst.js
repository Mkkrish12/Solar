const axios = require('axios');

/**
 * AI Roof Analyst — GPT-4o mini
 * Generates a persuasive 3-section "Roof Intelligence Report" personalized to the
 * building's actual score data. Framed as a GoSolar sales brief.
 *
 * Falls back gracefully if no API key is set.
 */
async function generateRoofReport(evaluationResult) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.startsWith('your_')) {
    console.log('   🤖 AI Analyst: no API key — skipping');
    return null;
  }

  const {
    address,
    dcScore,
    solarScore,
    criteria = [],
    solarFinancials,
    hardDisqualifiers = [],
    dcLandscape,
    resourceFeasibility,
    detailedFinancials,
  } = evaluationResult;

  const criteriaLines = criteria
    .filter(c => c.weight > 0 || c.isModifier)
    .map(c => `- ${c.name}: ${c.rawValue} (score: ${c.normalizedScore?.toFixed(1)}/10, weight: ${((c.weight || 0) * 100).toFixed(0)}%)`)
    .join('\n');

  const financialsBlock = solarFinancials
    ? `SOLAR FINANCIALS:
- Usable roof area: ${solarFinancials.usableRoofSqFt?.toLocaleString()} sq ft
- Max solar panels: ${solarFinancials.maxPanels}
- Annual energy production: ${solarFinancials.annualKwh?.toLocaleString()} kWh
- Monthly lease payment: $${solarFinancials.monthlyLeaseRevenue?.toLocaleString()}
- 20-year lease NPV: $${solarFinancials.twentyYearNPV?.toLocaleString()}
- Annual carbon offset: ${solarFinancials.annualCarbonOffsetTonnes} tonnes CO₂`
    : '';

  const disqualifiersBlock = hardDisqualifiers.length > 0
    ? `HARD DISQUALIFIERS FOR DATA CENTER:\n${hardDisqualifiers.join('\n')}`
    : '';

  const competitiveLandscapeBlock = dcLandscape
    ? `DC COMPETITIVE LANDSCAPE:
- Nearby data centers within 15 miles: ${dcLandscape.counts.within15Miles}
- Market saturation: ${dcLandscape.saturationLevel}
- Colocation rate adjustment: ${((dcLandscape.coloRateMultiplier - 1) * 100).toFixed(0)}% vs national benchmark
- In hyperscaler market: ${dcLandscape.inHyperscalerMarket ? 'Yes' : 'No'}
- DC score modifier: ${dcLandscape.marketSaturationDCScoreEffect > 0 ? '+' : ''}${dcLandscape.marketSaturationDCScoreEffect} points
- Market narrative: ${dcLandscape.narrative}`
    : '';

  const resourceBlock = resourceFeasibility
    ? `RESOURCE FEASIBILITY:
- Water stress: ${resourceFeasibility.summary.water.stressLevel} | ${resourceFeasibility.summary.water.interpretation}
- Grid interconnection queue: ${resourceFeasibility.summary.power.interconnectionDelayMonths} | ${resourceFeasibility.summary.power.interpretation}
- Cooling climate: ASHRAE Zone ${resourceFeasibility.summary.cooling.ashraeZone}, PUE ${resourceFeasibility.summary.cooling.estimatedPUE}, ${resourceFeasibility.summary.cooling.freeCoolingMonthsPerYear} free-cooling months/yr
- Hard resource constraints: ${resourceFeasibility.hardConstraints.length > 0 ? resourceFeasibility.hardConstraints.join('; ') : 'None identified'}`
    : '';

  const detailedFinancialsBlock = detailedFinancials
    ? `DETAILED 20-YEAR FINANCIAL COMPARISON:
- Solar 20-yr NPV (5% discount): $${(detailedFinancials.solar.finalNPV / 1e6).toFixed(1)}M | Net upfront investment: $${((detailedFinancials.solar.netUpfrontInvestment || 0) / 1e6).toFixed(2)}M | Break-even: ${detailedFinancials.solar.breakEvenYear ? 'Year ' + detailedFinancials.solar.breakEvenYear : 'Never within 20 years'}
- DC 20-yr NPV (8% discount, base): $${(detailedFinancials.dc.finalNPV / 1e6).toFixed(1)}M | Capital required: $${(detailedFinancials.dc.totalCapexAdjusted / 1e6).toFixed(1)}M | Break-even: ${detailedFinancials.dc.breakEvenYear ? 'Year ' + detailedFinancials.dc.breakEvenYear : 'Never within 20 years'}
- DC NPV under market saturation scenario: $${((detailedFinancials.dc.finalNPV + detailedFinancials.scenarios.dcMarketSaturation.npvImpact) / 1e6).toFixed(1)}M | Saturation break-even: ${detailedFinancials.scenarios.dcMarketSaturation.breakEvenYear ? 'Year ' + detailedFinancials.scenarios.dcMarketSaturation.breakEvenYear : 'Never'}
- Solar NPV advantage vs DC base: $${(detailedFinancials.summary.solarAdvantageNPV / 1e6).toFixed(1)}M`
    : '';

  const prompt = `You are a senior real estate analyst at GoSolar, a company that leases commercial rooftop space for solar installations. You have just completed a full site evaluation for a building owner weighing two options: (1) lease their roof to GoSolar for solar panels, or (2) convert their building to an edge data center.

Here is the complete evaluation data:

ADDRESS: ${address}
DC FEASIBILITY SCORE: ${dcScore}/100
SOLAR VIABILITY SCORE: ${solarScore}/100

KEY CRITERIA:
${criteriaLines}

${disqualifiersBlock}

${competitiveLandscapeBlock}

${resourceBlock}

${detailedFinancialsBlock}

${financialsBlock}

Write a professional 3-section report for the building owner. Be persuasive, factual, and direct. Use specific numbers from the data above. Do not invent numbers.

SECTION 1 — "THE VERDICT" (2-3 sentences): State clearly which option wins at this location and the single most decisive reason why, using actual data.

SECTION 2 — "THE DATA CENTER REALITY CHECK" (4-5 sentences): Use the competitive landscape data, resource feasibility constraints, and financial break-even year to explain exactly why the DC path is risky at this specific location. If nearby DCs are compressing rates, name that number. If water or grid constraints exist, state them. If break-even is beyond 10 years or never, call it out. If market saturation makes the case even weaker, note the saturation NPV impact.

SECTION 3 — "THE SOLAR OPPORTUNITY" (3-4 sentences): Lead with the NPV advantage figure. Mention solar net upfront investment and break-even year from the financial model, then compare with the DC capital required ($${detailedFinancials ? (detailedFinancials.dc.totalCapexAdjusted / 1e6).toFixed(1) + 'M' : 'millions'}) and DC break-even profile. Reference annual savings/cash flow and carbon impact.

Tone: Professional, confident, direct. Written for a business-minded commercial building owner. No hedging, no bullet points, pure prose paragraphs. Begin each section with its header in ALL CAPS.`;

  console.log('   🤖 AI Analyst: prompt built with', criteria.length, 'criteria,', dcLandscape ? 'landscape data' : 'no landscape', detailedFinancials ? 'detailed financials' : 'no financials');

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        max_tokens: 1100,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      }
    );

    const text = response.data?.choices?.[0]?.message?.content || null;
    if (text) {
      console.log('   🤖 AI Analyst: report generated successfully');
    }
    return text;
  } catch (err) {
    console.warn('   ⚠️ AI Analyst failed:', err.response?.status, err.response?.data?.error?.message || err.message);
    return null;
  }
}

module.exports = { generateRoofReport };
