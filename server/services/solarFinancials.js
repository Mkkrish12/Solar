/**
 * Solar investment analysis for owner + operator perspectives.
 * Returns a normalized object suitable for direct UI rendering.
 */
function calcSolarInvestmentAnalysis(solarApiData, stateAbbr, solarLandscapeLeaseRatePerSqFt = 2.50) {
  if (!solarApiData) return null;

  const usableRoofSqFt = (solarApiData.usableRoofAreaM2 || 0) * 10.764;
  const maxPanels = solarApiData.maxPanels || 0;
  const annualKwh = solarApiData.bestConfig?.annualKwh
    || solarApiData.bestConfig?.annualKwhAC
    || solarApiData.annualKwh
    || 0;
  const panelCapacityW = solarApiData.panelCapacityW || 400;
  const systemSizeKw = (maxPanels * panelCapacityW) / 1000;

  // --- INSTALLATION COST (Solar Landscape bears this, not the owner) ---
  const costPerWattLow = 1.80;
  const costPerWattHigh = 2.20;
  const installCostLow = systemSizeKw * 1000 * costPerWattLow;
  const installCostHigh = systemSizeKw * 1000 * costPerWattHigh;
  const installCostMid = (installCostLow + installCostHigh) / 2;

  // --- FEDERAL ITC ---
  const itcRate = 0.30;
  const itcValue = installCostMid * itcRate;
  const netInstallCost = installCostMid - itcValue;

  // --- ANNUAL REVENUE: owner lease ---
  const annualLeaseRevenue = usableRoofSqFt * solarLandscapeLeaseRatePerSqFt;
  const monthlyLeaseRevenue = annualLeaseRevenue / 12;

  // --- Energy value by state retail rate ---
  const STATE_RATES = {
    AL: 13.2, AK: 22.8, AZ: 12.4, AR: 10.6, CA: 27.9, CO: 13.8, CT: 26.6,
    DE: 14.3, FL: 14.1, GA: 12.8, HI: 39.3, ID: 9.8, IL: 12.6, IN: 11.4,
    IA: 11.0, KS: 11.8, KY: 10.2, LA: 10.4, ME: 21.5, MD: 14.9, MA: 25.7,
    MI: 17.3, MN: 14.5, MS: 11.6, MO: 11.3, MT: 11.8, NE: 11.0, NV: 13.0,
    NH: 24.6, NJ: 17.8, NM: 13.2, NY: 22.7, NC: 12.2, ND: 10.7, OH: 13.1,
    OK: 10.5, OR: 11.5, PA: 15.2, RI: 25.8, SC: 12.7, SD: 11.2, TN: 11.7,
    TX: 12.9, UT: 10.5, VT: 20.5, VA: 13.3, WA: 10.1, WV: 10.8, WI: 15.0,
    WY: 9.8, DC: 15.6,
  };
  const rateCentsPerKwh = STATE_RATES[stateAbbr?.toUpperCase()] || 15.0;
  const annualEnergyValue = (annualKwh * rateCentsPerKwh) / 100;

  // --- Break-even ---
  const breakEvenYears = annualEnergyValue > 0 ? (netInstallCost / annualEnergyValue) : null;

  // --- Owner NPV over 20 years ---
  const discountRate = 0.05;
  const escalationRate = 0.02;
  let ownerNPV = 0;
  for (let year = 1; year <= 20; year++) {
    const payment = annualLeaseRevenue * Math.pow(1 + escalationRate, year - 1);
    ownerNPV += payment / Math.pow(1 + discountRate, year);
  }

  // --- Operator IRR approximation ---
  const cashFlows = [-netInstallCost];
  for (let year = 1; year <= 25; year++) {
    const degradedKwh = annualKwh * Math.pow(0.995, year - 1);
    const revenue = (degradedKwh * rateCentsPerKwh) / 100;
    const opex = installCostMid * 0.01;
    const leasePayout = annualLeaseRevenue * Math.pow(1 + escalationRate, year - 1);
    cashFlows.push(revenue - opex - leasePayout);
  }

  let irr = 0.10;
  for (let i = 0; i < 100; i++) {
    let npv = 0;
    let dnpv = 0;
    cashFlows.forEach((cf, t) => {
      npv += cf / Math.pow(1 + irr, t);
      dnpv -= t * cf / Math.pow(1 + irr, t + 1);
    });
    if (Math.abs(dnpv) < 1e-9) break;
    const delta = npv / dnpv;
    irr -= delta;
    if (Math.abs(delta) < 1e-6) break;
  }

  // --- Carbon ---
  const annualCarbonTonnes = (annualKwh / 1000) * 0.386;
  const carbonCreditValue = annualCarbonTonnes * 15;

  // --- 20-year operator profit ---
  let totalRevenue20yr = 0;
  for (let year = 1; year <= 20; year++) {
    totalRevenue20yr += (annualKwh * Math.pow(0.995, year - 1) * rateCentsPerKwh) / 100;
  }
  const totalProfit20yr = totalRevenue20yr - netInstallCost - (installCostMid * 0.01 * 20);

  return {
    systemSizeKw: Math.round(systemSizeKw * 10) / 10,
    maxPanels,
    usableRoofSqFt: Math.round(usableRoofSqFt),
    annualKwh: Math.round(annualKwh),
    installCostLow: Math.round(installCostLow),
    installCostHigh: Math.round(installCostHigh),
    installCostMid: Math.round(installCostMid),
    itcValue: Math.round(itcValue),
    netInstallCost: Math.round(netInstallCost),
    annualEnergyValue: Math.round(annualEnergyValue),
    annualLeaseRevenue: Math.round(annualLeaseRevenue),
    monthlyLeaseRevenue: Math.round(monthlyLeaseRevenue),
    breakEvenYears: breakEvenYears == null ? null : Math.round(breakEvenYears * 10) / 10,
    ownerNPV20yr: Math.round(ownerNPV),
    irrPercent: Math.round(irr * 1000) / 10,
    totalProfit20yr: Math.round(totalProfit20yr),
    annualCarbonTonnes: Math.round(annualCarbonTonnes),
    carbonCreditValue: Math.round(carbonCreditValue),
    equivalentCarsOffRoad: Math.round(annualCarbonTonnes / 4.6),
    rateCentsPerKwh,
    assumptions: {
      leaseEscalationPct: 2,
      panelDegradationPct: 0.5,
      discountRatePct: 5,
      annualOpexPctOfInstall: 1,
    },
  };
}

module.exports = { calcSolarInvestmentAnalysis };

