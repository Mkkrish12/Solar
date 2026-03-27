/**
 * Data Center Economics Model — v3
 *
 * Computes real CapEx, OpEx, revenue, NPV and break-even for an edge DC
 * at the evaluated address. All benchmarks sourced from public datasets:
 *   - CapEx: Cushman & Wakefield Data Center Market Outlook
 *   - Colocation rates: CBRE / JLL Data Center Outlook
 *   - Staff: BLS Occupational Employment Statistics
 *   - Insurance: industry standard 0.5% of CapEx
 *
 * No external API calls — pure calculation from scores already in v2 pipeline.
 */

function calcDCEconomics({
  buildingFootprintSqFt,   // usable sqft from Google Solar API or estimate
  substationScore,          // 0-10 from v2 substation proximity
  fccFiberScore,            // 0-10 from v2 FCC/broadband scoring
  eiaRateCentsPerKwh,       // from v2 EIA module (e.g. 12.4)
  ixpScore,                 // 0-10 from v2 PeeringDB
  femaFloodZone,            // string e.g. "X", "AE", "VE"
  nriScore,                 // 0-10 natural hazard risk score (inverted: high = safe)
  stateAbbr,
}) {
  // ---- Capacity estimate from building footprint ----
  // Edge DC: 0.25–2.0 MW. Rule: 1 rack per ~100 sqft at 10kW/rack = 100W/sqft
  // Realistic edge DC range from footprint
  const footprint = Math.max(5000, buildingFootprintSqFt || 15000);
  const dcCapacityMW = Math.max(0.25, Math.min(2.0, footprint / 800 / 1000));

  // ---- CAPEX ----
  // Construction: $7–12M/MW midpoint $9.5M (Cushman & Wakefield)
  const constructionCost = Math.round(dcCapacityMW * 9_500_000);

  // Utility connection cost by substation distance
  const substationCost = substationScore >= 7 ? 500_000
    : substationScore >= 4 ? 1_000_000
    : 2_000_000;

  // Cooling: $1.5–3M/MW. High-rate states (hot/humid climate) need more cooling
  const coolingCostPerMW = eiaRateCentsPerKwh > 18 ? 2_750_000
    : eiaRateCentsPerKwh > 14 ? 2_000_000
    : 1_600_000;
  const coolingCapex = Math.round(dcCapacityMW * coolingCostPerMW);

  // Fiber/network connectivity capex
  const networkCapex = fccFiberScore >= 7 ? 50_000
    : fccFiberScore >= 4 ? 200_000
    : 500_000;

  // Generator + UPS: fixed for edge DC scale
  const generatorCapex = 650_000;

  // Permits/zoning: base $125K with risk multipliers
  const floodZoneStr = String(femaFloodZone || 'X').toUpperCase();
  const isHighFloodRisk = floodZoneStr.includes('AE') || floodZoneStr.includes('VE');
  const isHighSeismicRisk = nriScore < 4; // low score = high risk
  const riskMultiplier = isHighFloodRisk ? 1.4 : (isHighSeismicRisk ? 1.3 : 1.0);
  const permitCost = Math.round(125_000 * riskMultiplier);

  const totalCapex = constructionCost + substationCost + coolingCapex
    + networkCapex + generatorCapex + permitCost;

  // ---- OPEX (annual) ----
  // Power: MW -> kW conversion is 1000 (not 1,000,000). Include realistic average IT load.
  const averageLoadFactor = 0.75; // edge sites typically run below nameplate
  const annualKwhConsumption = Math.round(dcCapacityMW * 1000 * 8760 * 1.4 * averageLoadFactor);
  const annualPowerCost = Math.round(annualKwhConsumption * (eiaRateCentsPerKwh / 100));

  // Cooling maintenance: 8% of cooling CapEx per year (industry standard)
  const annualCoolingMaintenance = Math.round(coolingCapex * 0.08);

  // Staff: 2 FTE at BLS national median for "Computer and Information Systems Managers"
  // National median $169K/yr (BLS OES 2023), ×2 FTE
  const annualStaffCost = 340_000;

  // Bandwidth: by IXP proximity
  const annualBandwidthCost = ixpScore >= 7 ? 48_000
    : ixpScore >= 4 ? 72_000
    : 96_000;

  // Insurance: 0.5% of total CapEx (industry standard)
  const annualInsurance = Math.round(totalCapex * 0.005);

  const annualTotalOpex = annualPowerCost + annualCoolingMaintenance
    + annualStaffCost + annualBandwidthCost + annualInsurance;

  // ---- REVENUE ----
  // Colocation pricing: $150–$300/kW/month (CBRE/JLL market reports)
  // Premium markets (high IXP + connectivity) command higher rates
  const coloRatePerKwMonth = ixpScore >= 7 ? 275
    : ixpScore >= 4 ? 200
    : 160;

  const annualGrossRevenue = Math.round(dcCapacityMW * 1000 * coloRatePerKwMonth * 12);

  // Occupancy ramp: 50% yr1 → 70% yr2 → 90% yr3+ (JLL Data Center Outlook)
  const occupancyRamp = [0.50, 0.70, 0.90, 0.90, 0.90, 0.90, 0.90, 0.90, 0.90, 0.90];

  // NPV over 10 years at 8% discount rate (DC is higher risk than solar lease)
  const discountRate = 0.08;
  let npv = -totalCapex;
  for (let yr = 0; yr < 10; yr++) {
    const occupancy = occupancyRamp[yr] ?? 0.90;
    const netCashFlow = (annualGrossRevenue * occupancy) - annualTotalOpex;
    npv += netCashFlow / Math.pow(1 + discountRate, yr + 1);
  }

  const annualNetAtStabilized = annualGrossRevenue * 0.9 - annualTotalOpex;
  const breakEvenYears = annualNetAtStabilized > 0
    ? parseFloat((totalCapex / annualNetAtStabilized).toFixed(1))
    : null;

  console.log(`   🏢 DC Economics: ${dcCapacityMW}MW cap, $${(totalCapex/1e6).toFixed(1)}M CapEx, NPV $${(npv/1e6).toFixed(1)}M`);

  return {
    dcCapacityMW: parseFloat(dcCapacityMW.toFixed(2)),
    totalCapex,
    breakdown: {
      construction: constructionCost,
      powerInfrastructure: substationCost,
      cooling: coolingCapex,
      network: networkCapex,
      generator: generatorCapex,
      permits: permitCost,
    },
    annualOpex: annualTotalOpex,
    opexBreakdown: {
      power: annualPowerCost,
      cooling: annualCoolingMaintenance,
      staff: annualStaffCost,
      bandwidth: annualBandwidthCost,
      insurance: annualInsurance,
    },
    annualGrossRevenue,
    annualNetRevenue: Math.round(annualNetAtStabilized),
    tenYearNPV: Math.round(npv),
    breakEvenYears,
    coloRatePerKwMonth,
    annualKwhConsumption,
    source: 'Cushman & Wakefield / CBRE / BLS OES 2023',
  };
}

module.exports = { calcDCEconomics };
