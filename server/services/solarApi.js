const axios = require('axios');

/**
 * Google Solar API — buildingInsights:findClosest
 * Returns satellite-derived per-building solar data: actual roof area, panel count,
 * annual sunshine hours, shading, roof segments, and best system configuration.
 *
 * Falls back gracefully to null if building not found or key missing — NREL stays active.
 */
async function getSolarInsights(lat, lng) {
  const apiKey = process.env.GOOGLE_SOLAR_API_KEY;
  if (!apiKey || apiKey.startsWith('your_')) {
    return null;
  }

  try {
    const response = await axios.get(
      'https://solar.googleapis.com/v1/buildingInsights:findClosest',
      {
        params: {
          'location.latitude': lat,
          'location.longitude': lng,
          requiredQuality: 'MEDIUM',
          key: apiKey,
        },
        timeout: 12000,
      }
    );

    const data = response.data;
    const solar = data.solarPotential;
    if (!solar) return null;

    // Best config = highest panel count (last in sorted array)
    const configs = solar.solarPanelConfigs || [];
    const maxConfig = configs[configs.length - 1] || null;

    const roofAreaM2 = solar.wholeRoofStats?.areaMeters2 || 0;
    const usableRoofAreaM2 = solar.maxArrayAreaMeters2 || 0;
    const maxPanels = solar.maxArrayPanelsCount || 0;
    const annualSunshineHours = solar.maxSunshineHoursPerYear || 0;
    const panelCapacityW = solar.panelCapacityWatts || 400;

    const annualKwh = maxConfig
      ? Math.round(maxConfig.yearlyEnergyDcKwh * 0.85) // DC→AC ~85% efficiency
      : Math.round((usableRoofAreaM2 * panelCapacityW * annualSunshineHours) / 1_000_000 * 0.85);

    const financials = calcSolarFinancials({
      usableRoofAreaM2,
      maxPanels,
      annualKwh,
      panelCapacityW,
    });

    console.log(`   ☀️ Google Solar API: ${Math.round(usableRoofAreaM2)}m² usable, ${maxPanels} panels, ${Math.round(annualKwh/1000)}k kWh/yr`);

    return {
      roofAreaM2: Math.round(roofAreaM2),
      usableRoofAreaM2: Math.round(usableRoofAreaM2),
      maxPanels,
      annualSunshineHours: Math.round(annualSunshineHours),
      panelCapacityW,
      imageryQuality: data.imageryQuality || 'MEDIUM',
      imageryDate: data.imageryDate || null,
      bestConfig: maxConfig ? {
        panelCount: maxConfig.panelsCount,
        annualKwhDC: Math.round(maxConfig.yearlyEnergyDcKwh),
        annualKwhAC: annualKwh,
      } : null,
      ...financials,
    };
  } catch (err) {
    if (err.response?.status === 404) {
      console.log('   ☀️ Google Solar API: building not found — using NREL fallback');
    } else {
      console.warn('   ⚠️ Google Solar API failed:', err.response?.status, err.message);
    }
    return null;
  }
}

/**
 * Solar financial model
 * Lease rate: $2.50/sq ft/year (GoSolar benchmark)
 * NPV: 20-year discounted at 5%
 * Carbon: EPA grid factor 0.386 kg CO₂/kWh
 */
function calcSolarFinancials({ usableRoofAreaM2, maxPanels, annualKwh, panelCapacityW = 400 }) {
  const usableRoofSqFt = Math.round(usableRoofAreaM2 * 10.764);
  const leaseRatePerSqFt = 2.50; // $/sq ft/year
  const annualLeaseRevenue = Math.round(usableRoofSqFt * leaseRatePerSqFt);
  const monthlyLeaseRevenue = Math.round(annualLeaseRevenue / 12);

  // Simple owner-financed baseline assumptions for upfront/payback modeling.
  const systemSizeKw = Math.max(5, Math.round((maxPanels || 0) * (panelCapacityW / 1000)));
  const costPerWatt = 1.75; // commercial blended benchmark
  const grossSystemCost = Math.round(systemSizeKw * 1000 * costPerWatt);
  const federalTaxCreditPct = 0.30;
  const federalTaxCreditAmount = Math.round(grossSystemCost * federalTaxCreditPct);
  const localRebateAmount = 0;
  const netUpfrontInvestment = Math.max(0, grossSystemCost - federalTaxCreditAmount - localRebateAmount);
  const annualMaintenancePct = 0.015;
  const annualMaintenanceCost = Math.round(grossSystemCost * annualMaintenancePct);
  const inverterReplacementYear = 13;
  const inverterReplacementCost = Math.round(grossSystemCost * 0.10);
  const annualGenerationDegradationPct = 0.005;
  const electricityRateInflationPct = 0.025;
  const siteElectricityRatePerKwh = 0.12;

  // 20-year NPV at 5% discount rate
  const discountRate = 0.05;
  let npv = 0;
  for (let year = 1; year <= 20; year++) {
    npv += annualLeaseRevenue / Math.pow(1 + discountRate, year);
  }

  const annualCarbonOffsetTonnes = Math.round((annualKwh / 1000) * 0.386);
  const equivalentCarsOffRoad = Math.round(annualCarbonOffsetTonnes / 4.6);

  return {
    usableRoofSqFt,
    annualKwh,
    systemSizeKw,
    costPerWatt,
    grossSystemCost,
    federalTaxCreditPct,
    federalTaxCreditAmount,
    localRebateAmount,
    netUpfrontInvestment,
    annualMaintenancePct,
    annualMaintenanceCost,
    inverterReplacementYear,
    inverterReplacementCost,
    annualGenerationDegradationPct,
    electricityRateInflationPct,
    siteElectricityRatePerKwh,
    annualLeaseRevenue,
    monthlyLeaseRevenue,
    twentyYearNPV: Math.round(npv),
    annualCarbonOffsetTonnes,
    equivalentCarsOffRoad,
    leaseRatePerSqFt,
  };
}

module.exports = { getSolarInsights, calcSolarFinancials };
