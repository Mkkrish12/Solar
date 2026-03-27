/**
 * Pure normalization functions: raw values → 0-10 scores
 * All functions are side-effect free and unit-testable
 */

function clamp(val, min = 0, max = 10) {
  return Math.max(min, Math.min(max, val));
}

function linearScale(value, inputMin, inputMax, outputMin = 0, outputMax = 10) {
  if (inputMax === inputMin) return (outputMin + outputMax) / 2;
  const scaled = ((value - inputMin) / (inputMax - inputMin)) * (outputMax - outputMin) + outputMin;
  return clamp(scaled, outputMin, outputMax);
}

// Connectivity: combines broadband + IXP
function normalizeConnectivity(broadbandScore, ixpScore) {
  // Weighted: broadband is more important for DC than IXP alone
  return clamp(broadbandScore * 0.65 + ixpScore * 0.35);
}

// Natural disaster risk: composite of USGS seismic + FEMA HMA investment
// nriScore already 0-10 (inverted: high = safe), hmaScore 0-10 (inverted: high = safe)
function normalizeNaturalDisasterRisk(nriScore, hmaScore) {
  const hma = hmaScore != null ? hmaScore : 5; // neutral default
  return clamp(nriScore * 0.70 + hma * 0.30);
}

// Flood risk history: composite of NFIP claims + flood zone classification
// nfipScore 0-10 (inverted: high = no claims = safe), floodZoneScore 0-10
function normalizeFloodRiskHistory(nfipScore, floodZoneScore) {
  const fz = floodZoneScore != null ? floodZoneScore : 8; // default safe
  return clamp(nfipScore * 0.65 + fz * 0.35);
}

// Power infrastructure: substation score
function normalizePowerInfrastructure(substationScore) {
  return clamp(substationScore);
}

// Demand proximity: tech company density
function normalizeDemandProximity(techDensityScore) {
  return clamp(techDensityScore);
}

// Building suitability: places score
function normalizeBuildingSuitability(placesScore) {
  return clamp(placesScore);
}

// Water availability: drought score
function normalizeWaterAvailability(droughtScore) {
  return clamp(droughtScore);
}

// Latency potential: IXP proximity (70%) + Cloudflare measured network quality (30%)
// IXP = infrastructure access; Cloudflare = what end users actually experience
function normalizeLatencyPotential(ixpScore, cfRadarScore) {
  const cf = cfRadarScore != null ? cfRadarScore : 5; // neutral if unavailable
  return clamp(ixpScore * 0.70 + cf * 0.30);
}

// Power cost: EIA state electricity rate (low cost = good for DC)
// dcScore already 1-9 from eia.js
function normalizePowerCost(eiaScore) {
  return clamp(eiaScore ?? 5);
}

// Grid reliability: EIA SAIDI outage duration (low outage = good for DC)
// dcScore already 1-9 from eia.js
function normalizeGridReliability(saidiScore) {
  return clamp(saidiScore ?? 5);
}

// Resource Feasibility: composite water/power/cooling score (already 0-10)
function normalizeResourceFeasibility(compositeScore) {
  return clamp(compositeScore ?? 5);
}

// DC Financial Viability: NPV-based score from DC Economics model
// tenYearNPV: positive = good for DC; deeply negative = bad
function normalizeDCFinancialViability(tenYearNPV) {
  if (tenYearNPV == null) return 5;
  if (tenYearNPV > 5_000_000) return 10;
  if (tenYearNPV > 2_000_000) return 8;
  if (tenYearNPV > 0)         return 6;
  if (tenYearNPV > -2_000_000) return 3;
  return 1;
}

// Execution risk: disaster declarations (already inverted in census.js)
function normalizeExecutionRisk(disasterScore) {
  return clamp(disasterScore);
}

// ---- Solar Criteria (v3 model) ----

// Google Solar API roof quality: real area, panel count, sunshine hours
// solarApiScore from calcSolarScore() in engine
function normalizeGoogleSolarRoofQuality(solarApiScore) {
  return clamp(solarApiScore ?? 5);
}

// Irradiance + Cloud: NREL GHI score (60%) + NASA cloud score (40%)
function normalizeIrradianceAndCloud(nrelGhiScore, nasaCloudScore) {
  const ghi = nrelGhiScore ?? 5;
  const cloud = nasaCloudScore ?? 5;
  return clamp(ghi * 0.60 + cloud * 0.40);
}

// Wind exposure: NASA POWER wind speed score (lower wind = higher score for solar)
function normalizeWindExposure(windScore) {
  return clamp(windScore ?? 6);
}

// Flood & disaster risk for solar: panels survive if site is safe
// Combines flood zone score + NRI natural hazard score
function normalizeSolarFloodAndDisasterRisk(floodZoneScore, nriScore) {
  const fz = floodZoneScore ?? 7;
  const nri = nriScore ?? 5;
  return clamp(fz * 0.55 + nri * 0.45);
}

// Roof age: younger = better = higher score for solar
function normalizeRoofAge(roofAgeScore) {
  return clamp(roofAgeScore ?? 5);
}

// Grid connection quality for solar: substation proximity (70%) + DC opportunity inverse (30%)
// Closer substation = easier grid connection for solar export
// High DC score = site may be "stolen" by DC; low DC score = solar has clear path
function normalizeSolarGridConnection(substationScore, inverseDcFactor) {
  const sub = substationScore ?? 5;
  const inv = inverseDcFactor ?? 5;
  return clamp(sub * 0.70 + inv * 0.30);
}

// Solar irradiance: NREL score (already 0-10 in nrel.js) — kept for fallback
function normalizeSolarIrradiance(nrelScore) {
  return clamp(nrelScore);
}

// Roof suitability from building type — kept for fallback
function normalizeRoofSuitability(solarRoofScore) {
  return clamp(solarRoofScore);
}

module.exports = {
  clamp,
  linearScale,
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
  normalizeResourceFeasibility,
  normalizeDCFinancialViability,
  normalizeGoogleSolarRoofQuality,
  normalizeIrradianceAndCloud,
  normalizeWindExposure,
  normalizeSolarFloodAndDisasterRisk,
  normalizeRoofAge,
  normalizeSolarGridConnection,
  normalizeSolarIrradiance,
  normalizeRoofSuitability,
};
