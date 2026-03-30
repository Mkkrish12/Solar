const express = require('express');
const router = express.Router();
const { geocodeAddress } = require('../services/geocode');
const { getFloodZone, getNaturalHazardRisk } = require('../services/fema');
const { getBroadbandData } = require('../services/fcc');
const { getSolarIrradiance } = require('../services/nrel');
const { getDroughtData } = require('../services/drought');
const { getBuildingType } = require('../services/places');
const { getNearestSubstation } = require('../services/substation');
const { getNearestIXP } = require('../services/peeringdb');
const { getTechCompanyDensity, getDisasterDeclarations } = require('../services/census');
const { getNFIPFloodHistory } = require('../services/nfip');
const { getHMAProjects } = require('../services/hma');
const { getNetworkQuality } = require('../services/cloudflareRadar');
const { getSolarInsights } = require('../services/solarApi');
const { getStateElectricRate, getGridReliability } = require('../services/eia');
const { generateRoofReport } = require('../services/aiAnalyst');
const { getNRELSolarResource } = require('../services/nrel');
const { getNASACloudAndWind } = require('../services/nasaPower');
const { getBuildingPermits } = require('../services/permits');
const { classifyPermitsForRoofAge, getRoofConditionFromSolarApi, calcRoofAgeScore } = require('../services/roofAge');
const { getFourYearRoofImageryComparison } = require('../services/roofImageryHistory');
const { calcSolarInvestmentAnalysis } = require('../services/solarFinancials');
const { calcDCEconomics } = require('../services/dcEconomics');
const { analyzeDCCompetitiveLandscape } = require('../services/dcProximity');
const { getWaterStress, getPowerGridCapacity, getCoolingFeasibility, calcResourceFeasibilityScore } = require('../services/resourceFeasibility');
const { calcYearByYearFinancials } = require('../services/financials');
const { computeScores } = require('../scoring/engine');

router.post('/evaluate', async (req, res) => {
  const { address } = req.body;

  if (!address || typeof address !== 'string' || address.trim().length < 5) {
    return res.status(400).json({ error: 'Valid address is required' });
  }

  const startTime = Date.now();

  try {
    // STEP 1: Geocode
    let geo;
    try {
      geo = await geocodeAddress(address.trim());
    } catch (err) {
      return res.status(422).json({ error: `Could not geocode address: ${err.message}` });
    }

    const { lat, lng, formattedAddress, city, state, zip, county, stateFIPS, countyFIPS, fullFIPS } = geo;

    console.log(`\n📍 Evaluating: ${formattedAddress}`);
    console.log(`   Coords: ${lat.toFixed(4)}, ${lng.toFixed(4)} | FIPS: ${fullFIPS || 'unknown'} | State: ${state}`);

    // STEP 2: Parallel data fetches — all run concurrently via Promise.allSettled
    // allSettled ensures one failure never blocks the rest of the pipeline
    const results = await Promise.allSettled([
      getFloodZone(lat, lng),                                                               // 0
      getNaturalHazardRisk(lat, lng, state, county, fullFIPS),                              // 1
      getBroadbandData(lat, lng, formattedAddress, city, state, zip, stateFIPS, countyFIPS),// 2
      getSolarIrradiance(lat, lng),                                                         // 3
      getDroughtData(stateFIPS, countyFIPS, fullFIPS),                                      // 4
      getBuildingType(formattedAddress, lat, lng),                                          // 5
      getNearestSubstation(lat, lng),                                                       // 6
      Promise.resolve(getNearestIXP(lat, lng)),                                            // 7
      getTechCompanyDensity(stateFIPS, countyFIPS),                                        // 8
      getDisasterDeclarations(state, county),                                              // 9
      getNFIPFloodHistory(fullFIPS, state),                                                // 10
      getHMAProjects(state, county),                                                       // 11
      getNetworkQuality(state),                                                            // 12
      getSolarInsights(lat, lng),                                                          // 13
      getNRELSolarResource(lat, lng),                                                      // 14
      getNASACloudAndWind(lat, lng),                                                       // 15
      getBuildingPermits(address.trim(), city, state),                                     // 16
      analyzeDCCompetitiveLandscape(lat, lng),                                             // 17
      getWaterStress(lat, lng, state),                                                     // 18
      getFourYearRoofImageryComparison(lat, lng),                                          // 19 — Sentinel-2 multi-year RGB
    ]);

    // Unwrap results — failed promises get null/fallback values
    const unwrap = (r, fallback = null) => r.status === 'fulfilled' ? r.value : fallback;

    const floodZone   = unwrap(results[0],  { zone: 'X', score: 7, isDisqualifier: false, rawValue: 'FEMA data unavailable', interpretation: '' });
    const nri         = unwrap(results[1],  { score: 5, rawValue: 'Hazard data unavailable', interpretation: '' });
    const broadband   = unwrap(results[2],  { score: 5, rawValue: 'Broadband data unavailable', interpretation: '' });
    const nrel        = unwrap(results[3],  { score: 5, rawValue: 'NREL data unavailable', interpretation: '', annualAC: null });
    const drought     = unwrap(results[4],  { score: 7, rawValue: 'Drought data unavailable', interpretation: '', dominantLevel: 'D0' });
    const places      = unwrap(results[5],  { score: 5, rawValue: 'Building type unknown', interpretation: '', solarRoofScore: 6 });
    const substation  = unwrap(results[6],  { score: 5, rawValue: 'Substation data unavailable', interpretation: '' });
    const ixp         = unwrap(results[7],  { score: 5, rawValue: 'IXP data unavailable', interpretation: '', distanceMiles: null });
    const techDensity = unwrap(results[8],  { score: 5, rawValue: 'Census data unavailable', interpretation: '' });
    const disasters   = unwrap(results[9],  { score: 7, rawValue: 'Disaster data unavailable', interpretation: '' });
    const nfip        = unwrap(results[10], { score: 7, claimCount: 0, totalPaid: 0, interpretation: '' });
    const hma         = unwrap(results[11], { score: 5, projectCount: 0, totalFederalObligation: 0, interpretation: '' });
    const cfRadar     = unwrap(results[12], null);
    const solarApi    = unwrap(results[13], null);
    const nrelSolarResource = unwrap(results[14], null);
    const nasaPower   = unwrap(results[15], null);
    const permitData  = unwrap(results[16], { available: false });
    const dcLandscape = unwrap(results[17], null);
    const waterStressData = unwrap(results[18], null);
    const multiYearImagery = unwrap(results[19], { available: false });

    // EIA lookups — synchronous, state-level data
    const powerCostData = getStateElectricRate(state);
    const gridReliabilityData = getGridReliability(state);

    // Resource feasibility — synchronous from state data + substation score
    const powerGridData = getPowerGridCapacity(state, substation.score);
    const coolingData = getCoolingFeasibility(state);
    const resourceFeasibility = calcResourceFeasibilityScore(
      waterStressData || { dcScore: 5, solarScore: 7, stressLevel: 'medium', isHardConstraint: false, interpretation: '' },
      powerGridData,
      coolingData
    );

    // Roof age from permit data + Solar API imagery
    const roofAgeClassification = classifyPermitsForRoofAge(permitData);
    const solarApiCondition = getRoofConditionFromSolarApi(solarApi);
    const roofAgeScore = calcRoofAgeScore(roofAgeClassification, solarApiCondition, multiYearImagery);
    const solarInvestment = calcSolarInvestmentAnalysis(solarApi, state);

    // DC Economics — uses scores already computed synchronously
    const dcEconomics = calcDCEconomics({
      buildingFootprintSqFt: solarApi?.usableRoofSqFt || 15000,
      substationScore: substation.score,
      fccFiberScore: broadband.score,
      eiaRateCentsPerKwh: powerCostData.centsPerKwh,
      ixpScore: ixp.score,
      femaFloodZone: floodZone.zone,
      nriScore: nri.score,
      stateAbbr: state,
    });

    console.log(`   ✅ Fetches complete | DCs: ${dcLandscape?.counts?.within15Miles ?? '?'} within 15mi (${dcLandscape?.saturationLevel ?? 'unknown'}) | Water: ${waterStressData?.stressLevel ?? 'N/A'} | Grid queue: ${powerGridData.interconnectionDelayMonths} | Permits: ${permitData.available ? permitData.permits?.length + ' found' : 'N/A'} | Sentinel-2 multi-year: ${multiYearImagery?.available ? `ΔRGB ${multiYearImagery.maxConsecutiveRgbDelta}` : 'N/A'}`);

    // STEP 3: Score
    const scores = computeScores({
      broadband, floodZone, nri, nfip, hma, nrel, nrelSolarResource, drought, places,
      substation, ixp, techDensity, disasters, cfRadar, solarApi, powerCostData,
      gridReliabilityData, nasaPower, dcEconomics, roofAgeScore, permitData,
      resourceFeasibility, dcLandscape,
    });

    // Year-by-year financial model (needs scores.solarFinancials computed above)
    const detailedFinancials = calcYearByYearFinancials({
      dcEconomics,
      solarFinancials: scores.solarFinancials,
      dcLandscape,
      resourceFeasibility,
    });

    // STEP 4: AI Report (runs after scoring so it can use final scores)
    const roofReport = await generateRoofReport({
      address: formattedAddress || address,
      dcScore: scores.dcScore,
      solarScore: scores.solarScore,
      criteria: scores.criteria,
      solarFinancials: scores.solarFinancials,
      hardDisqualifiers: scores.hardDisqualifiers,
      dcLandscape,
      resourceFeasibility,
      detailedFinancials,
    });

    const elapsed = Date.now() - startTime;

    const response = {
      address: formattedAddress || address,
      coordinates: { lat, lng },
      location: { city, state, zip, county },
      dcScore: scores.dcScore,
      solarScore: scores.solarScore,
      recommendation: scores.recommendation,
      verdict: scores.verdict,
      solarPitch: scores.solarPitch,
      criteria: scores.criteria,
      hardDisqualifiers: scores.hardDisqualifiers,
      insights: scores.insights,
      topSolarReasons: scores.topSolarReasons,
      solarFinancials: scores.solarFinancials,
      solarInvestment,
      roofReport,
      solarMetrics: {
        annualKWh: solarApi?.annualKwh || nrel.annualAC,
        capacityFactor: nrel.capacityFactor,
        estimatedAnnualRevenue: solarApi?.annualLeaseRevenue || nrel.estimatedAnnualRevenue,
        co2OffsetTons: solarApi?.annualCarbonOffsetTonnes || nrel.co2OffsetTons,
        irradianceTier: nrel.tier,
        dataSource: solarApi ? 'Google Solar API' : 'NREL PVWatts',
      },
      dcEconomics: scores.dcEconomics,
      dcLandscape: scores.dcLandscape,
      resourceFeasibility: scores.resourceFeasibility,
      detailedFinancials,
      rawData: {
        floodZone: { zone: floodZone.zone, isDisqualifier: floodZone.isDisqualifier },
        seismicSs: nri.seismicSs,
        broadbandPct: broadband.broadbandPct,
        substationMiles: substation.distanceMiles,
        ixpMiles: ixp.distanceMiles,
        droughtLevel: drought.dominantLevel,
        nfipClaimCount: nfip.claimCount,
        nfipTotalPaid: nfip.totalPaid,
        hmaProjectCount: hma.projectCount,
        hmaTotalFederal: hma.totalFederalObligation,
        powerCostCentsPerKwh: powerCostData.centsPerKwh,
        gridSaidiMinutes: gridReliabilityData.avgOutageMinutesPerYear,
        solarApiPanels: solarApi?.maxPanels || null,
        solarApiRoofM2: solarApi?.usableRoofAreaM2 || null,
        nasaCloudCoverPct: nasaPower?.annualCloudCoverPct || null,
        windSpeed10m: nasaPower?.windSpeed10m || null,
        nrelGHI: nrelSolarResource?.annualGHI || null,
        nrelDNI: nrelSolarResource?.annualDNI || null,
        roofAgeEstimate: roofAgeScore?.estimatedRoofAge || null,
        roofAgeConfidence: roofAgeScore?.confidence || null,
        permitDataAvailable: permitData.available,
        roofImageryMultiYear: multiYearImagery?.available ? multiYearImagery : null,
      },
      dataFreshness: {
        geocoding: new Date().toISOString(),
        femaFlood: new Date().toISOString(),
        nfipClaims: 'FEMA NFIP Claims V2 (real-time, last 10 yrs)',
        hmaProjects: 'FEMA HMA Projects V4 (real-time)',
        naturalHazardRisk: 'USGS ASCE7-22 (real-time) + FEMA HMA (real-time)',
        broadband: 'Census ACS 2022 5-Year',
        nrelPVWatts: new Date().toISOString(),
        droughtMonitor: new Date().toISOString(),
        googlePlaces: new Date().toISOString(),
        googleSolarApi: solarApi ? new Date().toISOString() : 'N/A (key not configured)',
        nasaPower: nasaPower ? 'NASA POWER 40yr climatology (free, no key)' : 'N/A',
        nrelSolarResource: nrelSolarResource ? 'NREL Solar Resource API v1' : 'N/A',
        buildingPermits: permitData.available ? `Socrata Open Data (${permitData.city})` : 'N/A (city not covered)',
        sentinel2MultiYear: multiYearImagery?.available ? 'Element84 Earth Search STAC + AWS COG' : 'N/A',
        dcCompetitiveLandscape: dcLandscape ? `OSM + Google Places (${dcLandscape.counts?.within25Miles ?? 0} DCs found)` : 'N/A',
        resourceFeasibility: 'USGS Water + LBNL Grid Congestion + ASHRAE Climate Zones',
        substations: 'OpenStreetMap (real-time)',
        cloudflareRadar: 'Cloudflare Radar Speed+IQI (7-day rolling)',
        peeringDB: new Date().toISOString(),
        census: 'CBP 2021',
        femaDisasters: new Date().toISOString(),
        eiaElectricityRate: 'EIA Electric Power Monthly (latest)',
        eiaGridReliability: 'EIA Form 861 (latest)',
        aiReport: roofReport ? 'GPT-4o mini (generated)' : 'N/A (key not configured)',
      },
      processingTimeMs: elapsed,
    };

    console.log(`   🎯 DC: ${scores.dcScore} | Solar: ${scores.solarScore} | ${scores.recommendation} | Landscape modifier: ${dcLandscape?.marketSaturationDCScoreEffect ?? 0} (${elapsed}ms)\n`);
    res.json(response);
  } catch (err) {
    console.error('Evaluation error:', err);
    res.status(500).json({ error: 'Evaluation failed', message: err.message });
  }
});

module.exports = router;
