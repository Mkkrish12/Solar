const { DC_WEIGHTS, SOLAR_WEIGHTS, HARD_DISQUALIFIER_CAPS } = require('./weights');
const { calcSolarFinancials } = require('../services/solarApi');
const {
  clamp,
  normalizeConnectivity,
  normalizeNaturalDisasterRisk,
  normalizeFloodRiskHistory,
  normalizePowerInfrastructure,
  normalizePowerCost,
  normalizeGridReliability,
  normalizeDemandProximity,
  normalizeBuildingSuitability,
  normalizeWaterAvailability,
  normalizeLatencyPotential,
  normalizeExecutionRisk,
  normalizeDCFinancialViability,
  normalizeResourceFeasibility,
  normalizeGoogleSolarRoofQuality,
  normalizeIrradianceAndCloud,
  normalizeWindExposure,
  normalizeSolarFloodAndDisasterRisk,
  normalizeRoofAge,
  normalizeSolarGridConnection,
} = require('./normalize');

/**
 * Hybrid solar score: Google Solar API real data (if available) + NREL fallback
 * Google Solar: roof-specific; NREL: location-level irradiance
 */
function calcSolarScore(solarApiData, nrelData) {
  if (!solarApiData) return nrelData.score; // NREL fallback
  const roofScore = Math.min(10, (solarApiData.usableRoofAreaM2 / 1000) * 2); // 500m²=10
  const sunScore = Math.min(10, solarApiData.annualSunshineHours / 180);       // 1800hrs=10
  const panelScore = Math.min(10, solarApiData.maxPanels / 50);                // 500 panels=10
  return clamp(roofScore * 0.40 + sunScore * 0.35 + panelScore * 0.25);
}

/**
 * Main scoring engine — pure function
 * Takes all raw service results and returns full score breakdown
 */
function computeScores(data) {
  const {
    broadband,
    floodZone,
    nri,
    nfip,
    hma,
    nrel,
    nrelSolarResource,
    drought,
    places,
    substation,
    ixp,
    techDensity,
    disasters,
    cfRadar,
    solarApi,
    powerCostData,
    gridReliabilityData,
    nasaPower,
    dcEconomics,
    roofAgeScore,
    permitData,
    resourceFeasibility,
    dcLandscape,
  } = data;

  // ---- DC Component Scores ----
  const connectivityScore = normalizeConnectivity(broadband.score, ixp.score);
  const naturalHazardScore = normalizeNaturalDisasterRisk(nri.score, hma?.score);
  const floodRiskScore = normalizeFloodRiskHistory(nfip?.score ?? 5, floodZone.score);
  const powerScore = normalizePowerInfrastructure(substation.score);
  const powerCostScore = normalizePowerCost(powerCostData?.dcScore);
  const gridReliabilityScore = normalizeGridReliability(gridReliabilityData?.dcScore);
  const demandScore = normalizeDemandProximity(techDensity.score);
  const buildingScore = normalizeBuildingSuitability(places.score);
  const waterScore = normalizeWaterAvailability(drought.score);
  const latencyScore = normalizeLatencyPotential(ixp.score, cfRadar?.score);
  const dcFinancialScore = normalizeDCFinancialViability(dcEconomics?.tenYearNPV);
  const resourceFeasibilityScore = normalizeResourceFeasibility(resourceFeasibility?.compositeScore);

  // ---- Weighted DC Score (0-100) ----
  const rawDCScore =
    connectivityScore * DC_WEIGHTS.connectivity +
    naturalHazardScore * DC_WEIGHTS.naturalDisasterRisk +
    floodRiskScore * DC_WEIGHTS.floodRiskHistory +
    powerScore * DC_WEIGHTS.powerInfrastructure +
    powerCostScore * DC_WEIGHTS.powerCost +
    gridReliabilityScore * DC_WEIGHTS.gridReliability +
    demandScore * DC_WEIGHTS.demandProximity +
    buildingScore * DC_WEIGHTS.buildingSuitability +
    latencyScore * DC_WEIGHTS.latencyPotential +
    dcFinancialScore * DC_WEIGHTS.dcFinancialViability +
    resourceFeasibilityScore * DC_WEIGHTS.resourceFeasibility;

  let dcScore = Math.round(rawDCScore * 10); // Scale 0-10 to 0-100

  // ---- Hard Disqualifiers ----
  const hardDisqualifiers = [];
  let cap = 100;

  if (floodZone.zone === 'AE') {
    hardDisqualifiers.push(`Flood Zone AE: High-risk flood area — maximum DC score capped at ${HARD_DISQUALIFIER_CAPS.FLOOD_ZONE_AE}`);
    cap = Math.min(cap, HARD_DISQUALIFIER_CAPS.FLOOD_ZONE_AE);
  }
  if (floodZone.zone === 'VE' || floodZone.zone === 'V') {
    hardDisqualifiers.push(`Flood Zone VE: Coastal high hazard — maximum DC score capped at ${HARD_DISQUALIFIER_CAPS.FLOOD_ZONE_VE}`);
    cap = Math.min(cap, HARD_DISQUALIFIER_CAPS.FLOOD_ZONE_VE);
  }
  if (places.classification === 'RETAIL_DISQUALIFIER' || places.classification === 'HOSPITALITY_DISQUALIFIER') {
    hardDisqualifiers.push(`Building type (${places.primaryType}): Retail/hospitality use — maximum DC score capped at ${HARD_DISQUALIFIER_CAPS.RETAIL_BUILDING}`);
    cap = Math.min(cap, HARD_DISQUALIFIER_CAPS.RETAIL_BUILDING);
  }
  if (drought.dominantLevel === 'D3') {
    hardDisqualifiers.push(`Extreme drought (D3): Cooling water risk — maximum DC score capped at ${HARD_DISQUALIFIER_CAPS.DROUGHT_D3}`);
    cap = Math.min(cap, HARD_DISQUALIFIER_CAPS.DROUGHT_D3);
  }
  if (drought.dominantLevel === 'D4') {
    hardDisqualifiers.push(`Exceptional drought (D4): Critical water risk — maximum DC score capped at ${HARD_DISQUALIFIER_CAPS.DROUGHT_D4}`);
    cap = Math.min(cap, HARD_DISQUALIFIER_CAPS.DROUGHT_D4);
  }

  // Resource feasibility hard constraints
  if (resourceFeasibility?.hardConstraints?.length > 0) {
    resourceFeasibility.hardConstraints.forEach(c => hardDisqualifiers.push(c));
  }

  dcScore = Math.min(dcScore, cap);

  // Competitive landscape additive modifier (applied after cap)
  // Being in oversaturated market compresses colocation rates → worse DC economics
  // Being in underserved/emerging market boosts DC economics
  if (dcLandscape?.marketSaturationDCScoreEffect) {
    dcScore = Math.max(0, Math.min(100, dcScore + dcLandscape.marketSaturationDCScoreEffect));
  }

  // ---- Solar Score (0-100) — v3 model ----
  // 1. Google Solar Roof Quality (real roof data or Places fallback)
  const solarRoofQualityScore = normalizeGoogleSolarRoofQuality(calcSolarScore(solarApi, nrel));

  // 2. Irradiance + Cloud (NREL GHI + NASA cloud cover)
  const nrelGhiScore = nrelSolarResource?.ghiScore ?? nrel.score;
  const nasaCloudScore = nasaPower?.cloudScore ?? 5;
  const irradianceCloudScore = normalizeIrradianceAndCloud(nrelGhiScore, nasaCloudScore);

  // 3. Wind exposure (NASA POWER)
  const windExposureScore = normalizeWindExposure(nasaPower?.windScore);

  // 4. Flood + disaster risk for solar panels
  const solarFloodScore = normalizeSolarFloodAndDisasterRisk(floodZone.score, nri.score);

  // 5. Roof age (permit-based)
  const roofAgeSolarScore = normalizeRoofAge(roofAgeScore?.score);

  // 6. Grid connection quality (substation + inverse DC opportunity cost)
  const inverseDcFactor = clamp(10 - dcScore / 10);
  const gridConnectionSolarScore = normalizeSolarGridConnection(substation.score, inverseDcFactor);

  const rawSolarScore =
    solarRoofQualityScore * SOLAR_WEIGHTS.googleSolarRoofQuality +
    irradianceCloudScore * SOLAR_WEIGHTS.irradianceAndCloud +
    windExposureScore * SOLAR_WEIGHTS.windExposure +
    solarFloodScore * SOLAR_WEIGHTS.floodAndDisasterRisk +
    roofAgeSolarScore * SOLAR_WEIGHTS.roofAge +
    gridConnectionSolarScore * SOLAR_WEIGHTS.gridConnectionQuality;

  const solarScore = Math.round(clamp(rawSolarScore * 10, 0, 100));

  // ---- Recommendation ----
  let recommendation;
  if (dcScore >= 75) recommendation = 'STRONG_DC';
  else if (dcScore >= 60) recommendation = 'LEAN_DC';
  else if (dcScore >= 45) recommendation = 'NEUTRAL';
  else if (dcScore >= 30) recommendation = 'LEAN_SOLAR';
  else recommendation = 'STRONG_SOLAR';

  // ---- Criteria breakdown ----
  const criteria = [
    {
      name: 'Broadband Connectivity',
      description: 'Fiber and high-speed internet availability (Census ACS + IXP proximity)',
      rawValue: broadband.rawValue,
      normalizedScore: connectivityScore,
      weight: DC_WEIGHTS.connectivity,
      weightedContribution: +(connectivityScore * DC_WEIGHTS.connectivity).toFixed(3),
      interpretation: broadband.interpretation || '',
      source: 'Census ACS 2022 Broadband Data',
    },
    {
      name: 'Natural Hazard Risk',
      description: 'USGS seismic risk + FEMA HMA government-certified hazard investment',
      rawValue: hma && !hma.error
        ? `${nri.rawValue} · HMA $${hma.totalFederalObligation >= 1e6 ? (hma.totalFederalObligation/1e6).toFixed(1)+'M' : Math.round((hma.totalFederalObligation||0)/1000)+'K'} (${hma.projectCount} projects)`
        : nri.rawValue,
      normalizedScore: naturalHazardScore,
      weight: DC_WEIGHTS.naturalDisasterRisk,
      weightedContribution: +(naturalHazardScore * DC_WEIGHTS.naturalDisasterRisk).toFixed(3),
      interpretation: hma && !hma.error
        ? `${nri.interpretation || ''} | ${hma.interpretation || ''}`
        : nri.interpretation || '',
      source: 'USGS ASCE7-22 Seismic + FEMA HMA Projects V4',
      subData: {
        seismic: { score: nri.score, value: nri.rawValue },
        hmaInvestment: hma ? { score: hma.score, value: hma.rawValue, projects: hma.projectCount, totalFederal: hma.totalFederalObligation } : null,
      },
    },
    {
      name: 'Flood Risk History',
      description: 'FEMA NFIP actual flood claim history + FEMA flood zone classification',
      rawValue: nfip && !nfip.error
        ? `Zone ${floodZone.zone || 'X'} · ${nfip.claimCount ?? 0} flood claims ($${nfip.totalPaid >= 1e6 ? (nfip.totalPaid/1e6).toFixed(1)+'M' : Math.round((nfip.totalPaid||0)/1000)+'K'} total, last 10 yrs)`
        : floodZone.rawValue,
      normalizedScore: floodRiskScore,
      weight: DC_WEIGHTS.floodRiskHistory,
      weightedContribution: +(floodRiskScore * DC_WEIGHTS.floodRiskHistory).toFixed(3),
      interpretation: nfip && !nfip.error
        ? `${floodZone.interpretation || ''} | ${nfip.interpretation || ''}`
        : floodZone.interpretation || '',
      source: 'FEMA NFIP Claims V2 + FEMA National Flood Hazard Layer',
      isHardDisqualifier: floodZone.isDisqualifier,
      subData: {
        floodZone: { zone: floodZone.zone, score: floodZone.score, isDisqualifier: floodZone.isDisqualifier },
        nfipClaims: nfip ? { score: nfip.score, claimCount: nfip.claimCount, totalPaid: nfip.totalPaid, avgPaid: nfip.avgPaid } : null,
      },
    },
    {
      name: 'Power Infrastructure',
      description: 'Proximity to electrical substations (OpenStreetMap)',
      rawValue: substation.rawValue,
      normalizedScore: powerScore,
      weight: DC_WEIGHTS.powerInfrastructure,
      weightedContribution: +(powerScore * DC_WEIGHTS.powerInfrastructure).toFixed(3),
      interpretation: substation.interpretation || '',
      source: 'OpenStreetMap Electric Substations',
    },
    {
      name: 'Power Cost',
      description: 'State average commercial electricity rate — power is 40–60% of data center opex; high rates gut DC economics',
      rawValue: powerCostData?.rawValue || 'N/A',
      normalizedScore: powerCostScore,
      weight: DC_WEIGHTS.powerCost,
      weightedContribution: +(powerCostScore * DC_WEIGHTS.powerCost).toFixed(3),
      interpretation: powerCostData?.interpretation || '',
      source: 'EIA Electric Power Monthly',
    },
    {
      name: 'Grid Reliability',
      description: 'Average annual outage duration by state (SAIDI) — mission-critical data centers cannot tolerate power interruptions',
      rawValue: gridReliabilityData?.rawValue || 'N/A',
      normalizedScore: gridReliabilityScore,
      weight: DC_WEIGHTS.gridReliability,
      weightedContribution: +(gridReliabilityScore * DC_WEIGHTS.gridReliability).toFixed(3),
      interpretation: gridReliabilityData?.interpretation || '',
      source: 'EIA Form 861 Annual Electric Power Industry Report',
    },
    {
      name: 'Tech Demand Proximity',
      description: 'Local technology sector density (Census Business Patterns)',
      rawValue: techDensity.rawValue,
      normalizedScore: demandScore,
      weight: DC_WEIGHTS.demandProximity,
      weightedContribution: +(demandScore * DC_WEIGHTS.demandProximity).toFixed(3),
      interpretation: techDensity.interpretation || '',
      source: 'Census Bureau Business Patterns (NAICS 5112, 5415)',
    },
    {
      name: 'Building Suitability',
      description: 'Building type and classification for data center use',
      rawValue: places.rawValue,
      normalizedScore: buildingScore,
      weight: DC_WEIGHTS.buildingSuitability,
      weightedContribution: +(buildingScore * DC_WEIGHTS.buildingSuitability).toFixed(3),
      interpretation: places.interpretation || '',
      source: 'Google Places API',
    },
    {
      name: 'Water Availability',
      description: 'US Drought Monitor — water stress level',
      rawValue: drought.rawValue,
      normalizedScore: waterScore,
      weight: DC_WEIGHTS.waterAvailability,
      weightedContribution: +(waterScore * DC_WEIGHTS.waterAvailability).toFixed(3),
      interpretation: drought.interpretation || '',
      source: 'US Drought Monitor (UNL/NOAA)',
    },
    {
      name: 'Network Latency Potential',
      description: 'IXP peering infrastructure proximity (70%) + Cloudflare Radar measured network quality (30%)',
      rawValue: cfRadar && !cfRadar.error
        ? `IXP: ${ixp.rawValue} · CF Radar: P50 ${cfRadar.iqiP50Ms}ms, ${cfRadar.downloadMbps} Mbps, ${cfRadar.packetLossPct}% loss`
        : ixp.rawValue,
      normalizedScore: latencyScore,
      weight: DC_WEIGHTS.latencyPotential,
      weightedContribution: +(latencyScore * DC_WEIGHTS.latencyPotential).toFixed(3),
      interpretation: buildLatencyInterpretation(ixp, cfRadar),
      source: 'PeeringDB IXP Registry + Cloudflare Radar Speed/IQI',
      subData: {
        ixp: { score: ixp.score, name: ixp.name, distanceMiles: ixp.distanceMiles },
        cloudflareRadar: cfRadar && !cfRadar.error ? {
          score: cfRadar.score,
          latencyIdleMs: cfRadar.latencyIdleMs,
          iqiP50Ms: cfRadar.iqiP50Ms,
          iqiP75Ms: cfRadar.iqiP75Ms,
          downloadMbps: cfRadar.downloadMbps,
          uploadMbps: cfRadar.uploadMbps,
          jitterMs: cfRadar.jitterMs,
          packetLossPct: cfRadar.packetLossPct,
          dataScope: cfRadar.dataScope,
        } : null,
      },
    },
    {
      name: 'DC Financial Viability',
      description: 'Edge DC economics model: CapEx, OpEx, colocation revenue, and 10-year NPV — sourced from Cushman & Wakefield / CBRE benchmarks + EIA power rates',
      rawValue: dcEconomics
        ? `${dcEconomics.dcCapacityMW}MW · $${(dcEconomics.totalCapex/1e6).toFixed(1)}M CapEx · 10yr NPV ${dcEconomics.tenYearNPV > 0 ? '+' : ''}$${(dcEconomics.tenYearNPV/1e6).toFixed(1)}M`
        : 'DC economics not computed',
      normalizedScore: dcFinancialScore,
      weight: DC_WEIGHTS.dcFinancialViability,
      weightedContribution: +(dcFinancialScore * DC_WEIGHTS.dcFinancialViability).toFixed(3),
      interpretation: dcEconomics
        ? (dcEconomics.tenYearNPV > 0
            ? `Positive NPV at $${(dcEconomics.tenYearNPV/1e6).toFixed(1)}M over 10 years — break-even in ${dcEconomics.breakEvenYears || 'N/A'} years`
            : `Negative NPV of $${Math.abs(dcEconomics.tenYearNPV/1e6).toFixed(1)}M — power cost ($${(dcEconomics.opexBreakdown?.power/1e6).toFixed(1)}M/yr) dominates opex`)
        : '',
      source: 'Cushman & Wakefield / CBRE / BLS OES 2023',
      subData: dcEconomics ? {
        dcEconomics: {
          dcCapacityMW: dcEconomics.dcCapacityMW,
          totalCapex: dcEconomics.totalCapex,
          annualOpex: dcEconomics.annualOpex,
          annualGrossRevenue: dcEconomics.annualGrossRevenue,
          tenYearNPV: dcEconomics.tenYearNPV,
          breakEvenYears: dcEconomics.breakEvenYears,
          coloRatePerKwMonth: dcEconomics.coloRatePerKwMonth,
          opexBreakdown: dcEconomics.opexBreakdown,
        },
      } : undefined,
    },
    {
      name: 'Resource Feasibility',
      description: 'Water availability (30%) + power grid capacity (45%) + cooling climate (25%) — fundamental infrastructure for sustained DC operations',
      rawValue: resourceFeasibility
        ? `Water: ${resourceFeasibility.summary.water.stressLevel} | Grid queue: ${resourceFeasibility.summary.power.interconnectionDelayMonths} | ASHRAE Zone ${resourceFeasibility.summary.cooling.ashraeZone}`
        : 'Resource feasibility not computed',
      normalizedScore: resourceFeasibilityScore,
      weight: DC_WEIGHTS.resourceFeasibility,
      weightedContribution: +(resourceFeasibilityScore * DC_WEIGHTS.resourceFeasibility).toFixed(3),
      interpretation: resourceFeasibility
        ? [
            resourceFeasibility.summary.water.interpretation,
            resourceFeasibility.summary.power.interpretation,
            resourceFeasibility.summary.cooling.interpretation,
          ].join(' | ')
        : '',
      source: 'USGS Water Resources + LBNL Queued Up 2024 + ASHRAE TC 9.9',
      subData: resourceFeasibility ? {
        water: {
          stressLevel: resourceFeasibility.summary.water.stressLevel,
          dcScore: resourceFeasibility.summary.water.dcScore,
          interpretation: resourceFeasibility.summary.water.interpretation,
        },
        powerGrid: {
          congestionLevel: resourceFeasibility.summary.power.congestionLevel,
          interconnectionDelay: resourceFeasibility.summary.power.interconnectionDelayMonths,
          gridCapacityScore: resourceFeasibility.summary.power.gridCapacityScore,
          interconnectionCostAdder: resourceFeasibility.summary.power.interconnectionCostAdder,
        },
        cooling: {
          ashraeZone: resourceFeasibility.summary.cooling.ashraeZone,
          freeCoolingMonths: resourceFeasibility.summary.cooling.freeCoolingMonthsPerYear,
          estimatedPUE: resourceFeasibility.summary.cooling.estimatedPUE,
          coolingScore: resourceFeasibility.summary.cooling.coolingScore,
        },
        hardConstraints: resourceFeasibility.hardConstraints,
      } : undefined,
    },
    {
      name: 'DC Competitive Landscape',
      description: 'Nearby data center density (OSM + Google Places + hyperscaler clusters) — determines colocation rate pressure and infrastructure maturity',
      rawValue: dcLandscape
        ? `${dcLandscape.counts.within15Miles} DCs within 15mi · Market: ${dcLandscape.saturationLevel} · Rate mult: ${(dcLandscape.coloRateMultiplier * 100).toFixed(0)}%`
        : 'Landscape data unavailable',
      normalizedScore: dcLandscape
        ? clamp(5 + dcLandscape.marketSaturationDCScoreEffect / 10)
        : 5,
      weight: 0,
      weightedContribution: 0,
      isModifier: true,
      scoreModifier: dcLandscape?.marketSaturationDCScoreEffect ?? 0,
      interpretation: dcLandscape?.narrative || '',
      source: 'OpenStreetMap + Google Places API + DatacenterHawk static list',
      subData: dcLandscape ? {
        counts: dcLandscape.counts,
        saturationLevel: dcLandscape.saturationLevel,
        coloRateMultiplier: dcLandscape.coloRateMultiplier,
        inHyperscalerMarket: dcLandscape.inHyperscalerMarket,
        hyperscalerClusters: dcLandscape.hyperscalerClusters?.slice(0, 3),
        nearbyDCs: dcLandscape.nearbyDCs?.slice(0, 5),
        scoreModifier: dcLandscape.marketSaturationDCScoreEffect,
      } : undefined,
    },
    // ---- Solar Criteria (v3 model — 6 criteria) ----
    {
      name: 'Solar Roof Quality',
      description: solarApi
        ? 'Google Solar API: actual usable roof area, panel count, and annual sunshine hours for this exact building'
        : 'Estimated solar potential from NREL PVWatts reference system + building type',
      rawValue: solarApi
        ? `${solarApi.usableRoofAreaM2}m² usable · ${solarApi.maxPanels} panels · ${solarApi.annualSunshineHours}h/yr sunshine`
        : nrel.rawValue,
      normalizedScore: solarRoofQualityScore,
      weight: SOLAR_WEIGHTS.googleSolarRoofQuality,
      weightedContribution: +(solarRoofQualityScore * SOLAR_WEIGHTS.googleSolarRoofQuality).toFixed(3),
      interpretation: solarApi
        ? `Google Solar API: ${solarApi.usableRoofAreaM2}m² usable of ${solarApi.roofAreaM2}m² total, ${solarApi.maxPanels} max panels, ${solarApi.annualSunshineHours}h annual sunshine`
        : nrel.interpretation || '',
      source: solarApi ? 'Google Solar API (buildingInsights)' : 'NREL PVWatts v8',
      isSolarCriterion: true,
      subData: solarApi ? {
        googleSolar: {
          roofAreaM2: solarApi.roofAreaM2,
          usableRoofAreaM2: solarApi.usableRoofAreaM2,
          maxPanels: solarApi.maxPanels,
          annualSunshineHours: solarApi.annualSunshineHours,
          annualKwh: solarApi.annualKwh,
          imageryQuality: solarApi.imageryQuality,
        },
      } : undefined,
    },
    {
      name: 'Solar Irradiance & Cloud Cover',
      description: 'NREL GHI/DNI resource quality (60%) + NASA POWER 40-year cloud cover average (40%) — direct irradiance determines energy yield',
      rawValue: nrelSolarResource
        ? `${nrelSolarResource.rawValue}${nasaPower?.annualCloudCoverPct != null ? ` · ${nasaPower.annualCloudCoverPct}% avg cloud cover` : ''}`
        : (nrel.rawValue + (nasaPower?.annualCloudCoverPct != null ? ` · ${nasaPower.annualCloudCoverPct}% cloud` : '')),
      normalizedScore: irradianceCloudScore,
      weight: SOLAR_WEIGHTS.irradianceAndCloud,
      weightedContribution: +(irradianceCloudScore * SOLAR_WEIGHTS.irradianceAndCloud).toFixed(3),
      interpretation: `NREL GHI score ${nrelGhiScore.toFixed(1)}/10${nasaPower ? ` · Cloud cover ${nasaPower.annualCloudCoverPct}% (score ${nasaPower.cloudScore}/10)` : ''}`,
      source: 'NREL Solar Resource API v1 + NASA POWER 40yr climatology',
      isSolarCriterion: true,
      subData: {
        nrelResource: nrelSolarResource ? {
          annualGHI: nrelSolarResource.annualGHI,
          annualDNI: nrelSolarResource.annualDNI,
          ghiScore: nrelSolarResource.ghiScore,
        } : null,
        nasaCloud: nasaPower ? {
          annualCloudCoverPct: nasaPower.annualCloudCoverPct,
          cloudScore: nasaPower.cloudScore,
        } : null,
      },
    },
    {
      name: 'Wind Exposure',
      description: 'Average annual wind speed affects panel mounting cost, soiling/maintenance frequency, and yield degradation — higher wind = higher install cost and lower ROI',
      rawValue: nasaPower?.windSpeed10m != null
        ? `${nasaPower.windSpeed10m} m/s avg at 10m (${nasaPower.windLabel})`
        : 'Wind data unavailable',
      normalizedScore: windExposureScore,
      weight: SOLAR_WEIGHTS.windExposure,
      weightedContribution: +(windExposureScore * SOLAR_WEIGHTS.windExposure).toFixed(3),
      interpretation: nasaPower?.windDetail || 'Wind data unavailable — neutral score applied',
      source: 'NASA POWER 40-year climatology',
      isSolarCriterion: true,
      subData: nasaPower ? {
        windSpeed10m: nasaPower.windSpeed10m,
        windSpeed50m: nasaPower.windSpeed50m,
        installCostAdder: nasaPower.windInstallCostAdder,
        maintenanceMultiplier: nasaPower.windMaintenanceMultiplier,
      } : null,
    },
    {
      name: 'Site Flood & Disaster Risk',
      description: 'Solar panels must survive the site environment — FEMA flood zone classification (55%) + USGS seismic hazard (45%) determine long-term panel safety',
      rawValue: `${floodZone.rawValue || 'Flood: unknown'} · Seismic: ${nri.rawValue || 'unknown'}`,
      normalizedScore: solarFloodScore,
      weight: SOLAR_WEIGHTS.floodAndDisasterRisk,
      weightedContribution: +(solarFloodScore * SOLAR_WEIGHTS.floodAndDisasterRisk).toFixed(3),
      interpretation: `Flood zone score ${floodZone.score}/10 · Seismic score ${nri.score}/10 — combined site safety for solar infrastructure`,
      source: 'FEMA National Flood Hazard Layer + USGS ASCE7-22',
      isSolarCriterion: true,
    },
    {
      name: 'Roof Age & Condition',
      description: 'Solar systems need 20+ years of remaining roof life to match the 25-year installation contract term — permits when available, plus Sentinel-2 true-color means compared across the last four summers',
      rawValue: roofAgeScore?.rawValue || 'No permit data available for this city',
      normalizedScore: roofAgeSolarScore,
      weight: SOLAR_WEIGHTS.roofAge,
      weightedContribution: +(roofAgeSolarScore * SOLAR_WEIGHTS.roofAge).toFixed(3),
      interpretation: roofAgeScore?.forSolar || 'Roof age unknown — recommend inspection before committing to solar contract',
      source: [
        permitData?.available ? `Socrata Open Data (${permitData.city})` : 'No permit API coverage for this city',
        roofAgeScore?.multiYearImagery?.available ? 'Sentinel-2 L2A multi-year (Element84 STAC)' : null,
      ].filter(Boolean).join(' · ') || 'N/A',
      isSolarCriterion: true,
      subData: roofAgeScore ? {
        estimatedRoofAge: roofAgeScore.estimatedRoofAge,
        confidence: roofAgeScore.confidence,
        label: roofAgeScore.label,
        permitCity: permitData?.city,
        multiYearImagery: roofAgeScore.multiYearImagery || null,
      } : null,
    },
    {
      name: 'Grid Connection Quality',
      description: 'Substation proximity for solar grid tie-in (70%) + DC opportunity cost factor — strong solar sites are weak DC sites, and vice versa',
      rawValue: `${substation.rawValue} · DC opportunity factor ${inverseDcFactor.toFixed(1)}/10`,
      normalizedScore: gridConnectionSolarScore,
      weight: SOLAR_WEIGHTS.gridConnectionQuality,
      weightedContribution: +(gridConnectionSolarScore * SOLAR_WEIGHTS.gridConnectionQuality).toFixed(3),
      interpretation: dcScore >= 70
        ? `Strong DC candidate (${dcScore}/100) — solar competes on cost and speed, not exclusivity`
        : dcScore >= 45
          ? `Moderate DC potential (${dcScore}/100) — solar has strong value case at this location`
          : `Weak DC candidate (${dcScore}/100) — solar is the clear winner for this rooftop`,
      source: 'OpenStreetMap Substations + DC Score model',
      isSolarCriterion: true,
    },
  ];

  // ---- "What Would Change This Score?" Insights ----
  const insights = generateInsights({ broadband, ixp, floodZone, drought, places, nri, techDensity, nfip, hma }, dcScore);

  // ---- Verdict + Solar Pitch ----
  const { verdict, solarPitch } = generateVerdict(recommendation, dcScore, solarScore, data);

  // ---- Top Solar Reasons ----
  const topSolarReasons = getTopSolarReasons(criteria, hardDisqualifiers, nrel, floodZone, drought);

  return {
    dcScore,
    solarScore,
    recommendation,
    verdict,
    solarPitch,
    criteria,
    hardDisqualifiers,
    insights,
    topSolarReasons,
    componentScores: {
      connectivity: connectivityScore,
      naturalHazardRisk: naturalHazardScore,
      floodRiskHistory: floodRiskScore,
      powerInfrastructure: powerScore,
      powerCost: powerCostScore,
      gridReliability: gridReliabilityScore,
      demandProximity: demandScore,
      buildingSuitability: buildingScore,
      waterAvailability: waterScore,
      latencyPotential: latencyScore,
      dcFinancialViability: dcFinancialScore,
      resourceFeasibility: resourceFeasibilityScore,
      dcLandscapeModifier: dcLandscape?.marketSaturationDCScoreEffect ?? 0,
      // Solar v3
      solarRoofQuality: solarRoofQualityScore,
      irradianceAndCloud: irradianceCloudScore,
      windExposure: windExposureScore,
      solarFloodRisk: solarFloodScore,
      roofAge: roofAgeSolarScore,
      gridConnectionSolar: gridConnectionSolarScore,
      cloudflareRadar: cfRadar?.score,
    },
    dcEconomics: dcEconomics || null,
    dcLandscape: dcLandscape || null,
    resourceFeasibility: resourceFeasibility || null,
    solarFinancials: buildSolarFinancials(solarApi, nrel, nasaPower),
  };
}

function buildLatencyInterpretation(ixp, cfRadar) {
  const miles = ixp.distanceMiles;
  let ixpPart;
  if (!miles)       ixpPart = 'IXP proximity unknown';
  else if (miles <= 10)  ixpPart = `${ixp.name || 'IXP'} ${miles} mi away — sub-ms backbone peering, ideal for edge`;
  else if (miles <= 25)  ixpPart = `IXP ${miles} mi — good peering, competitive edge latency`;
  else if (miles <= 75)  ixpPart = `IXP ${miles} mi — acceptable for CDN/cloud, marginal for ultra-low-latency edge`;
  else                   ixpPart = `IXP ${miles} mi — significant backhaul costs for real-time workloads`;

  if (!cfRadar || cfRadar.error) return ixpPart;

  const cfPart = `Cloudflare Radar: P50 ${cfRadar.iqiP50Ms}ms, ${cfRadar.downloadMbps} Mbps, ${cfRadar.jitterMs}ms jitter, ${cfRadar.packetLossPct}% packet loss (${cfRadar.dataScope})`;
  return `${ixpPart} | ${cfPart}`;
}

function buildExecutionInterpretation(disasters, hma, nfip) {
  const parts = [];
  if (disasters.count != null) {
    parts.push(`${disasters.count} federal disaster declaration${disasters.count !== 1 ? 's' : ''} in county (last 10 yrs) — each represents a potential construction halt, insurance event, or operational disruption`);
  } else {
    parts.push(disasters.interpretation || '');
  }
  if (hma && !hma.error && hma.projectCount > 0) {
    const totalM = (hma.totalFederalObligation / 1_000_000).toFixed(1);
    parts.push(`FEMA invested $${totalM}M in hazard mitigation here — indicates government-acknowledged long-term risk to built infrastructure`);
  }
  if (nfip && !nfip.error && nfip.claimCount > 10) {
    parts.push(`${nfip.claimCount} NFIP claims suggest active flood disruption history that affects construction timelines`);
  }
  return parts.join(' | ');
}

function buildRoofInterpretation(places) {
  const classification = places.classification;
  const score = places.solarRoofScore || 6;
  if (classification === 'RETAIL_DISQUALIFIER') return 'Retail building — typically has large flat roof sections, good solar access but property use conflicts may require negotiation';
  if (classification === 'HOSPITALITY_DISQUALIFIER') return 'Hospitality/food service — roof access limited, but solar can still be viable on flat sections';
  if (score >= 8) return `${places.primaryType || 'Industrial'} building — large flat roof, unobstructed, ideal for commercial solar installation`;
  if (score >= 6) return `${places.primaryType || 'Commercial'} building — suitable flat or low-slope roof for solar; minimal structural concerns expected`;
  return 'Building roof type moderate — standard commercial solar installation feasible';
}

function generateInsights(data, dcScore) {
  const insights = [];

  if (!data.broadband.hasFiber && data.broadband.score < 7) {
    const gain = Math.round((7 - data.broadband.score) * DC_WEIGHTS.connectivity * 10);
    insights.push({
      condition: 'If fiber internet became available here',
      impact: `DC score would increase by ~${gain} points`,
      type: 'connectivity',
    });
  }

  if (data.ixp.distanceMiles > 50) {
    const gain = Math.round((9 - data.ixp.score) * DC_WEIGHTS.latencyPotential * 10);
    insights.push({
      condition: 'If an IXP were within 25 miles',
      impact: `DC score would increase by ~${gain} points, significantly improving edge latency`,
      type: 'latency',
    });
  }

  if (data.floodZone.isDisqualifier) {
    insights.push({
      condition: 'If flood zone classification changed to Zone X',
      impact: 'Hard disqualifier cap would be removed, DC score could reach full potential',
      type: 'flood',
    });
  } else if (data.nfip && data.nfip.claimCount > 20) {
    insights.push({
      condition: `${data.nfip.claimCount} NFIP flood claims on record`,
      impact: `Active flood history is suppressing the Flood Risk score — DC operators would require expensive flood mitigation`,
      type: 'flood',
    });
  }

  if (data.drought.isDisqualifier) {
    insights.push({
      condition: 'If drought conditions improved',
      impact: 'Water availability cap removed — DC score could increase substantially',
      type: 'drought',
    });
  }

  if (data.places.classification === 'RETAIL_DISQUALIFIER') {
    insights.push({
      condition: 'If building was converted to warehouse/industrial use',
      impact: 'Building classification cap removed — DC score could increase significantly',
      type: 'building',
    });
  }

  if (data.hma && data.hma.totalFederalObligation > 10_000_000) {
    const totalM = (data.hma.totalFederalObligation / 1_000_000).toFixed(0);
    insights.push({
      condition: `FEMA has invested $${totalM}M in hazard mitigation in this county`,
      impact: 'Government-certified high-hazard designation is suppressing Natural Hazard Risk score',
      type: 'hazard',
    });
  }

  return insights.slice(0, 4);
}

function generateVerdict(recommendation, dcScore, solarScore, data) {
  const { nrel, floodZone, drought, places, broadband } = data;
  const annualKWh = nrel.annualAC ? Math.round(nrel.annualAC / 1000) : '~120';

  let verdict = '';
  let solarPitch = '';

  const solarRevenue = nrel.estimatedAnnualRevenue
    ? `$${nrel.estimatedAnnualRevenue.toLocaleString()}/year`
    : 'significant lease income';
  const co2 = nrel.co2OffsetTons ? `${nrel.co2OffsetTons} tons of CO₂` : 'significant carbon emissions';

  switch (recommendation) {
    case 'STRONG_SOLAR':
      verdict = `This building is a STRONG solar candidate. With ${annualKWh}k kWh/year in solar potential and ${floodZone.isDisqualifier ? 'a flood zone designation that rules out data center infrastructure' : 'favorable conditions for rooftop solar'}, partnering with GoSolar makes clear financial and environmental sense. A lease would offset ${co2} annually while generating ${solarRevenue} in passive income.`;
      solarPitch = `GoSolar can turn this rooftop into a ${annualKWh}k kWh/year power plant. With our commercial lease program, you receive guaranteed income with zero upfront cost while reducing your building's carbon footprint by ${co2} per year.`;
      break;

    case 'LEAN_SOLAR':
      verdict = `This building leans toward rooftop solar as the stronger value proposition. While it has some attributes of a viable edge data center, the ${floodZone.isDisqualifier ? 'flood zone risk' : drought.isDisqualifier ? 'drought conditions' : 'overall risk profile'} makes data center operations challenging. Solar offers a more reliable, lower-risk revenue stream at ${solarRevenue} per year.`;
      solarPitch = `Even though this location has some data center appeal, rooftop solar delivers better risk-adjusted returns. GoSolar's lease program offers ${solarRevenue} annually — no construction, no liability, just clean energy income.`;
      break;

    case 'NEUTRAL':
      verdict = `This building presents a genuine choice between edge data center and rooftop solar. The data center score of ${dcScore}/100 reflects solid infrastructure attributes, but solar irradiance of ${annualKWh}k kWh/year means solar remains highly competitive. We recommend a detailed feasibility study for both options.`;
      solarPitch = `The data center option requires significant capital investment and operational complexity. GoSolar's lease requires zero capital from you — we install, operate, and maintain the system while you collect ${solarRevenue} per year in guaranteed lease income.`;
      break;

    case 'LEAN_DC':
      verdict = `This building has stronger-than-average data center potential (DC Score: ${dcScore}/100), with ${broadband.hasFiber ? 'fiber connectivity' : 'reasonable broadband'} and suitable infrastructure. However, solar still generates ${annualKWh}k kWh/year and a data center would require substantial capital investment vs. GoSolar's zero-cost lease model.`;
      solarPitch = `Before committing to expensive data center buildout, consider this: GoSolar will lease this roof, handle all installation costs, and pay you ${solarRevenue} per year. Data centers require $5-50M in infrastructure — solar requires $0 from you.`;
      break;

    case 'STRONG_DC':
      verdict = `This location scores ${dcScore}/100 for edge data center viability — well above average. ${broadband.hasFiber ? 'Excellent fiber connectivity' : 'Good connectivity'} and favorable infrastructure make this a serious data center candidate. However, solar at ${annualKWh}k kWh/year still represents significant value that should not be left on the table.`;
      solarPitch = `Even the strongest data center locations benefit from solar. GoSolar can co-locate on portions of the roof not used by mechanical systems, generating ${solarRevenue} in passive income while you evaluate data center options. Why not capture both revenue streams?`;
      break;
  }

  return { verdict, solarPitch };
}

function getTopSolarReasons(criteria, hardDisqualifiers, nrel, floodZone, drought) {
  const reasons = [];

  if (nrel.score >= 7) {
    reasons.push(`High solar irradiance: ${nrel.rawValue} — top-tier energy production potential`);
  } else if (nrel.score >= 5) {
    reasons.push(`Adequate solar irradiance: ${nrel.rawValue}`);
  }

  if (floodZone.isDisqualifier) {
    reasons.push(`Flood zone ${floodZone.zone} eliminates data center feasibility — solar is flood-resilient`);
  }

  if (drought.isDisqualifier) {
    reasons.push(`${drought.dominantLevel} drought conditions make data center water cooling impractical`);
  }

  if (hardDisqualifiers.length > 0) {
    reasons.push(`${hardDisqualifiers.length} hard disqualifier(s) cap maximum DC score at ${Math.min(...[30, 35, 40])}`);
  }

  // Always add solar economic reason
  if (nrel.estimatedAnnualRevenue) {
    reasons.push(`Estimated electricity-value savings: $${nrel.estimatedAnnualRevenue.toLocaleString()}/year (site-specific solar assumptions applied)`);
  }

  if (nrel.co2OffsetTons) {
    reasons.push(`${nrel.co2OffsetTons} tons/year CO₂ offset — powerful ESG and sustainability credential`);
  }

  return reasons.slice(0, 4);
}

/**
 * Build solarFinancials from Google Solar API if available,
 * otherwise estimate from NREL PVWatts data.
 * NREL model: assume a typical commercial building with 700m² usable roof
 * (~7,500 sqft), 350 panels, system scaled from NREL 100kW reference output.
 */
function buildSolarFinancials(solarApi, nrel, nasaPower) {
  const windAdder = nasaPower?.windInstallCostAdder ?? 0.05;
  const windMaintMult = nasaPower?.windMaintenanceMultiplier ?? 1.05;

  if (solarApi) {
    // Apply wind NPV adjustment: higher wind = higher maintenance = lower NPV
    const windAdjustedNPV = Math.round(solarApi.twentyYearNPV * (1 - windAdder * 0.3));
    return {
      usableRoofSqFt: solarApi.usableRoofSqFt,
      maxPanels: solarApi.maxPanels,
      annualKwh: solarApi.annualKwh,
      monthlyLeaseRevenue: solarApi.monthlyLeaseRevenue,
      annualLeaseRevenue: solarApi.annualLeaseRevenue,
      twentyYearNPV: windAdjustedNPV,
      annualCarbonOffsetTonnes: solarApi.annualCarbonOffsetTonnes,
      equivalentCarsOffRoad: solarApi.equivalentCarsOffRoad,
      leaseRatePerSqFt: solarApi.leaseRatePerSqFt,
      installCostAdderPct: windAdder,
      maintenanceMultiplier: windMaintMult,
      source: 'Google Solar API',
      isEstimate: false,
    };
  }

  // NREL fallback: scale 100kW reference output to a 350-panel (140kW) commercial system
  const annualKwhReference = nrel?.annualAC;
  if (!annualKwhReference) return null;

  const estimatedPanels = 350;
  const estimatedSystemKw = estimatedPanels * 0.4; // 400W panels → 140 kW
  const annualKwh = Math.round(annualKwhReference * (estimatedSystemKw / 100));
  const usableRoofAreaM2 = 700; // ~7,500 sqft — typical mid-size commercial roof

  const financials = calcSolarFinancials({ usableRoofAreaM2, maxPanels: estimatedPanels, annualKwh });
  const windAdjustedNPV = Math.round(financials.twentyYearNPV * (1 - windAdder * 0.3));

  return {
    ...financials,
    twentyYearNPV: windAdjustedNPV,
    installCostAdderPct: windAdder,
    maintenanceMultiplier: windMaintMult,
    source: 'NREL PVWatts (estimated)',
    isEstimate: true,
  };
}

module.exports = { computeScores };
