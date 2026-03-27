/**
 * DC Feasibility scoring weights — must sum to 1.0
 * v4: added resourceFeasibility (12%), reduced powerInfrastructure, waterAvailability,
 *     gridReliability, demandProximity, buildingSuitability to compensate
 */
const DC_WEIGHTS = {
  connectivity: 0.20,           // FCC broadband + IXP proximity
  naturalDisasterRisk: 0.17,    // USGS seismic + FEMA HMA investment (inverted: low risk = high score)
  powerInfrastructure: 0.08,    // Substation proximity (reduced: power now also in resourceFeasibility)
  powerCost: 0.10,              // EIA state electricity rate (power = 40-60% DC opex)
  gridReliability: 0.05,        // EIA SAIDI outage duration (reduced: grid capacity in resourceFeasibility)
  demandProximity: 0.10,        // Tech company density
  buildingSuitability: 0.07,    // Place type classification
  dcFinancialViability: 0.05,   // DC Economics model NPV (v3)
  resourceFeasibility: 0.12,    // Water/power grid capacity/cooling — NEW v4
  waterAvailability: 0.00,      // Subsumed into resourceFeasibility
  floodRiskHistory: 0.04,       // NFIP claims + flood zone (real claim history)
  latencyPotential: 0.02,       // IXP proximity + Cloudflare Radar
  executionRisk: 0.00,          // Subsumed into dcFinancialViability
  // Total: 1.00
};

/**
 * Solar Viability scoring weights — must sum to 1.0
 * v3: full remodel with 6 criteria aligned to industry solar assessment standards
 */
const SOLAR_WEIGHTS = {
  googleSolarRoofQuality: 0.30, // Google Solar API: real roof area, panel count, sunshine hours
  irradianceAndCloud: 0.25,     // NREL GHI/DNI + NASA POWER cloud cover
  windExposure: 0.15,           // NASA POWER wind speed — installation cost + yield degradation
  floodAndDisasterRisk: 0.10,   // FEMA flood zone + USGS seismic (panels survive if site is safe)
  roofAge: 0.10,                // Permit-based roof age — solar needs 20+ yr remaining roof life
  gridConnectionQuality: 0.10,  // Substation proximity + inverse DC score (opportunity cost)
  // Total: 1.00
};

/**
 * Hard disqualifier caps on DC score
 */
const HARD_DISQUALIFIER_CAPS = {
  FLOOD_ZONE_AE: 30,
  FLOOD_ZONE_VE: 25,
  RETAIL_BUILDING: 35,
  DROUGHT_D3: 40,
  DROUGHT_D4: 35,
};

module.exports = { DC_WEIGHTS, SOLAR_WEIGHTS, HARD_DISQUALIFIER_CAPS };
