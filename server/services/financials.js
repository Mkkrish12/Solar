/**
 * Year-by-Year Financial Model for Solar vs Data Center comparison
 * Generates 20-year cumulative cash flow data with scenarios
 *
 * Inputs: dcEconomics (from dcEconomics.js), solarFinancials (from engine.js),
 *         dcLandscape (from dcProximity.js), resourceFeasibility (from resourceFeasibility.js)
 *
 * Solar discount rate: 5% (utility-grade, no-risk passive income)
 * DC discount rate: 8% (development risk, construction, lease-up)
 * Occupancy ramp: 50% → 70% → 90%+ (JLL Data Center Outlook 2024)
 * Solar escalator: 2% per year (typical PPA/lease escalation)
 */

function calcYearByYearFinancials({ dcEconomics, solarFinancials, dcLandscape, resourceFeasibility }) {
  if (!dcEconomics || !solarFinancials) return null;

  // ---- ADJUSTMENTS FROM LANDSCAPE + RESOURCE ----
  const coloMultiplier = dcLandscape?.coloRateMultiplier ?? 1.0;
  const interconnectionAdder = resourceFeasibility?.summary?.power?.interconnectionCostAdder ?? 100000;
  const coolingCapexMult = resourceFeasibility?.summary?.cooling?.coolingCapexMultiplier ?? 1.0;

  // Adjusted CapEx: add interconnection cost + cooling climate adjustment
  const capexAdjustment = interconnectionAdder + Math.round((dcEconomics.breakdown.cooling || 0) * (coolingCapexMult - 1.0));
  const totalCapexAdjusted = dcEconomics.totalCapex + capexAdjustment;

  // Adjusted annual opex: cooling climate affects power draw (PUE)
  const pueMultiplier = resourceFeasibility?.summary?.cooling?.estimatedPUE
    ? (resourceFeasibility.summary.cooling.estimatedPUE / 1.4)
    : 1.0;
  const adjustedAnnualOpex = Math.round(dcEconomics.annualOpex * (0.7 + 0.3 * pueMultiplier));

  // Adjusted colocation rate
  const adjustedColoRate = Math.round(dcEconomics.coloRatePerKwMonth * coloMultiplier);
  const adjustedAnnualRevenue = Math.round(dcEconomics.annualGrossRevenue * coloMultiplier);

  // ---- DC CASH FLOWS (20 years) ----
  // Ramp: 50% yr1, 70% yr2, 90% yr3–20
  const dcOccupancyRamp = (yr) => yr <= 0 ? 0.0 : yr === 1 ? 0.50 : yr === 2 ? 0.70 : 0.90;

  const dcDiscountRate = 0.08;
  let dcCumulative = -totalCapexAdjusted;
  let dcNPVAccum = -totalCapexAdjusted;
  let dcBreakEvenYear = null;
  const dcCashFlows = [{ year: 0, revenue: 0, opex: 0, net: -totalCapexAdjusted, cumulative: -totalCapexAdjusted, npvFactor: 1 }];

  for (let yr = 1; yr <= 20; yr++) {
    const occ = dcOccupancyRamp(yr);
    const revenue = Math.round(adjustedAnnualRevenue * occ);
    const net = revenue - adjustedAnnualOpex;
    dcCumulative += net;
    dcNPVAccum += net / Math.pow(1 + dcDiscountRate, yr);
    if (!dcBreakEvenYear && dcCumulative >= 0) dcBreakEvenYear = yr;
    dcCashFlows.push({ year: yr, revenue, opex: adjustedAnnualOpex, net, cumulative: Math.round(dcCumulative) });
  }

  // ---- SOLAR CASH FLOWS (20 years) ----
  // Owner-financed model: include upfront capex, O&M, inverter replacement, degradation, and rate inflation.
  const annualGenerationYear1 = Math.round(solarFinancials.annualKwh || 0);
  const baseRatePerKwh = Number(solarFinancials.siteElectricityRatePerKwh || 0.12);
  const annualRateInflation = Number(solarFinancials.electricityRateInflationPct || 0.025);
  const annualDegradation = Number(solarFinancials.annualGenerationDegradationPct || 0.005);
  const annualMaintenanceCost = Math.round(solarFinancials.annualMaintenanceCost || 0);
  const inverterReplacementYear = Number(solarFinancials.inverterReplacementYear || 13);
  const inverterReplacementCost = Math.round(solarFinancials.inverterReplacementCost || 0);
  const netUpfrontInvestment = Math.round(solarFinancials.netUpfrontInvestment || 0);
  const solarDiscountRate = 0.05;

  let solarCumulative = -netUpfrontInvestment;
  let solarNPVAccum = -netUpfrontInvestment;
  let solarBreakEvenYear = null;
  const solarCashFlows = [{
    year: 0,
    generationKwh: 0,
    electricityRatePerKwh: baseRatePerKwh,
    revenue: 0,
    opex: 0,
    inverter: 0,
    net: -netUpfrontInvestment,
    cumulative: -netUpfrontInvestment,
  }];

  for (let yr = 1; yr <= 20; yr++) {
    const generationKwh = Math.round(annualGenerationYear1 * Math.pow(1 - annualDegradation, yr - 1));
    const electricityRatePerKwh = baseRatePerKwh * Math.pow(1 + annualRateInflation, yr - 1);
    const savings = Math.round(generationKwh * electricityRatePerKwh);
    const inverterCost = yr === inverterReplacementYear ? inverterReplacementCost : 0;
    const net = savings - annualMaintenanceCost - inverterCost;
    solarCumulative += net;
    solarNPVAccum += net / Math.pow(1 + solarDiscountRate, yr);
    if (!solarBreakEvenYear && solarCumulative >= 0) solarBreakEvenYear = yr;
    solarCashFlows.push({
      year: yr,
      generationKwh,
      electricityRatePerKwh: +electricityRatePerKwh.toFixed(4),
      revenue: savings,
      opex: annualMaintenanceCost,
      inverter: inverterCost,
      net,
      cumulative: Math.round(solarCumulative),
    });
  }

  // ---- SATURATION SCENARIO ----
  // Market saturates by year 3: additional 15% rate compression
  const saturationRateMultiplier = (dcLandscape?.coloRateMultiplier ?? 1.0) * 0.85;
  const satRevenue = Math.round(dcEconomics.annualGrossRevenue * saturationRateMultiplier);

  let satCumulative = -totalCapexAdjusted;
  let satNPVAccum = -totalCapexAdjusted;
  let satBreakEvenYear = null;
  const satCashFlows = [{ year: 0, net: -totalCapexAdjusted, cumulative: -totalCapexAdjusted }];

  for (let yr = 1; yr <= 20; yr++) {
    const occ = dcOccupancyRamp(yr);
    const effRevenue = yr >= 3 ? Math.round(satRevenue * occ) : Math.round(adjustedAnnualRevenue * occ);
    const net = effRevenue - adjustedAnnualOpex;
    satCumulative += net;
    satNPVAccum += net / Math.pow(1 + dcDiscountRate, yr);
    if (!satBreakEvenYear && satCumulative >= 0) satBreakEvenYear = yr;
    satCashFlows.push({ year: yr, net, cumulative: Math.round(satCumulative), scenarioCumulative: Math.round(satCumulative) });
  }

  const solarNPVFinal = Math.round(solarNPVAccum);
  const dcNPVFinal = Math.round(dcNPVAccum);
  const satNPVFinal = Math.round(satNPVAccum);
  const solarTotalNetCashIn = solarCashFlows
    .slice(1)
    .reduce((acc, y) => acc + (y.net || 0), 0);
  const solarTotalSavings = solarTotalNetCashIn - netUpfrontInvestment;
  const solarROI = netUpfrontInvestment > 0
    ? (solarTotalSavings / netUpfrontInvestment) * 100
    : null;

  return {
    dc: {
      cashFlows: dcCashFlows,
      finalNPV: dcNPVFinal,
      breakEvenYear: dcBreakEvenYear,
      totalCapexAdjusted,
      adjustedAnnualOpex,
      adjustedColoRate,
      adjustedAnnualRevenue,
    },
    solar: {
      cashFlows: solarCashFlows,
      finalNPV: solarNPVFinal,
      annualBaseRevenue: solarCashFlows[1]?.revenue || 0,
      breakEvenYear: solarBreakEvenYear,
      netUpfrontInvestment,
      annualMaintenanceCost,
      inverterReplacementYear,
      inverterReplacementCost,
      totalSavings20Year: Math.round(solarTotalSavings),
      roiPct20Year: solarROI == null ? null : +solarROI.toFixed(1),
    },
    scenarios: {
      dcMarketSaturation: {
        cashFlows: satCashFlows,
        finalNPV: satNPVFinal,
        breakEvenYear: satBreakEvenYear,
        npvImpact: satNPVFinal - dcNPVFinal,
        saturationRateMultiplier,
      },
    },
    summary: {
      solarAdvantageNPV: solarNPVFinal - dcNPVFinal,
      recommendedPath: solarNPVFinal > dcNPVFinal ? 'solar' : 'dc',
    },
  };
}

module.exports = { calcYearByYearFinancials };
