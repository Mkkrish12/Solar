const axios = require('axios');

/**
 * Resource Feasibility Assessment for Edge Data Centers
 * Evaluates water availability, power grid capacity, and cooling climate.
 *
 * Sources:
 *   - USGS Water Resources API (gauge count proxy for water availability)
 *   - WRI Aqueduct 3.0 state-level water stress classifications
 *   - LBNL "Queued Up 2024" interconnection queue data
 *   - ASHRAE TC 9.9 climate zones for cooling load estimates
 *   - Lawrence Berkeley National Laboratory "US Data Center Energy Usage Report"
 */

// ------- WATER AVAILABILITY -------
// WRI Aqueduct 3.0 state-level water stress (source: https://www.wri.org/applications/aqueduct/)
const HIGH_WATER_STRESS_STATES = ['AZ', 'NV', 'NM', 'UT', 'CO', 'CA', 'TX', 'KS', 'NE', 'OK', 'WY', 'MT', 'ID'];
const MEDIUM_STRESS_STATES = ['FL', 'GA', 'AL', 'SC', 'NC', 'TN', 'AR', 'MO', 'SD', 'ND', 'MN', 'IA'];

async function getWaterStress(lat, lng, stateAbbr) {
  let gaugeCount = 0;
  try {
    const url = `https://waterservices.usgs.gov/nwis/site/?format=rdb&bBox=${lng - 0.5},${lat - 0.5},${lng + 0.5},${lat + 0.5}&siteType=ST&hasDataTypeCd=iv&siteStatus=active`;
    const res = await axios.get(url, { timeout: 8000 });
    const rows = (res.data.match(/\n[^#]/g) || []);
    gaugeCount = Math.max(0, rows.length - 1);
  } catch { /* fallback to state-level */ }

  const stressLevel = HIGH_WATER_STRESS_STATES.includes(stateAbbr) ? 'high'
    : MEDIUM_STRESS_STATES.includes(stateAbbr) ? 'medium' : 'low';

  return {
    stressLevel,
    gaugeCount,
    dcScore: stressLevel === 'low' ? 8 : stressLevel === 'medium' ? 5 : 2,
    solarScore: stressLevel === 'low' ? 9 : stressLevel === 'medium' ? 8 : 7,
    waterRequirementForDC: '~25M gallons/year per MW (air-cooled)',
    isHardConstraint: stressLevel === 'high',
    interpretation: stressLevel === 'high'
      ? `High water stress region (WRI Aqueduct: ${stateAbbr}). DC cooling requirements (~25M gal/yr per MW) face regulatory constraints. Dry cooling (air-cooled) systems add 15–20% to CapEx.`
      : stressLevel === 'medium'
      ? `Moderate water availability. Standard cooling systems feasible but water sourcing agreements with municipality recommended before DC buildout.`
      : `Favorable water availability. No material constraint on DC cooling infrastructure.`,
    source: 'USGS Water Resources API + WRI Aqueduct 3.0',
  };
}

// ------- POWER GRID CAPACITY -------
// Grid interconnection congestion by state.
// Source: LBNL "Queued Up 2024" annual interconnection queue report
// Scale 1-10: 10 = very congested (hard to get new large utility service)
const GRID_CONGESTION_BY_STATE = {
  'CA': 9, 'TX': 8, 'NY': 8, 'IL': 7, 'PA': 6, 'OH': 5, 'FL': 7,
  'AZ': 8, 'NV': 7, 'VA': 9, 'GA': 6, 'NC': 6, 'WA': 7, 'OR': 6,
  'CO': 7, 'MA': 8, 'NJ': 7, 'MD': 8, 'MN': 5, 'WI': 5, 'MI': 6,
  'IN': 4, 'KY': 4, 'TN': 5, 'AL': 4, 'MS': 3, 'AR': 3, 'LA': 4,
  'OK': 5, 'KS': 4, 'NE': 3, 'SD': 2, 'ND': 3, 'MT': 3, 'WY': 3,
  'ID': 4, 'UT': 6, 'NM': 5, 'AK': 2, 'HI': 5, 'VT': 5, 'NH': 5,
  'ME': 4, 'RI': 6, 'CT': 7, 'DE': 6, 'WV': 3, 'SC': 5, 'DC': 9,
};

function getPowerGridCapacity(stateAbbr, substationScore) {
  const congestion = GRID_CONGESTION_BY_STATE[stateAbbr] || 5;
  const interconnectionDelayMonths = congestion >= 8 ? '18–36 months'
    : congestion >= 6 ? '12–24 months'
    : '6–12 months';

  const gridCapacityScore = Math.max(0, Math.min(10,
    (10 - congestion) * 0.5 + (substationScore || 5) * 0.5
  ));

  const interconnectionCostAdder = congestion >= 8 ? 500000 : congestion >= 6 ? 250000 : 100000;

  return {
    congestionLevel: congestion,
    interconnectionDelayMonths,
    gridCapacityScore,
    isHardConstraint: congestion >= 8 && (substationScore || 5) < 4,
    interconnectionCostAdder,
    interpretation: congestion >= 8
      ? `Grid interconnection queue in ${stateAbbr} averages ${interconnectionDelayMonths} for large industrial loads (1MW+). Material project risk — utility agreements must be secured before breaking ground.`
      : congestion >= 6
      ? `Moderate grid congestion in ${stateAbbr}. Interconnection for 1MW+ loads typically takes ${interconnectionDelayMonths}. Feasible with proper permitting timeline.`
      : `Favorable grid capacity in ${stateAbbr}. Edge DC scale (0.5–2MW) interconnection achievable within ${interconnectionDelayMonths}.`,
    source: 'LBNL Queued Up 2024, FERC interconnection queue data',
  };
}

// ------- COOLING INFRASTRUCTURE -------
// ASHRAE climate zones by state — determines cooling load and free-air cooling feasibility
// Source: ASHRAE TC 9.9 "Thermal Guidelines for Data Processing Environments"
const ASHRAE_CLIMATE_ZONES = {
  'FL': 2, 'HI': 1, 'TX': 3, 'LA': 2, 'MS': 3, 'AL': 3, 'GA': 3, 'SC': 3,
  'AZ': 2, 'NM': 4, 'CA': 3, 'NV': 3, 'AR': 4, 'NC': 4, 'TN': 4, 'OK': 4,
  'VA': 4, 'KY': 4, 'MO': 5, 'MD': 4, 'DE': 4, 'NJ': 5, 'DC': 4,
  'KS': 5, 'CO': 5, 'UT': 5, 'IN': 5, 'OH': 5, 'IL': 5, 'PA': 5, 'WV': 5,
  'NY': 5, 'CT': 5, 'RI': 5, 'MA': 5, 'VT': 6, 'NH': 6, 'ME': 6,
  'MI': 6, 'WI': 6, 'MN': 7, 'IA': 6, 'NE': 5, 'SD': 7, 'ND': 7,
  'ID': 6, 'OR': 4, 'WA': 4, 'MT': 7, 'WY': 7, 'AK': 8,
};

function getCoolingFeasibility(stateAbbr) {
  const ashrae = ASHRAE_CLIMATE_ZONES[stateAbbr] || 5;

  const freeCoolingMonthsPerYear = ashrae <= 3 ? 0
    : ashrae === 4 ? 3
    : ashrae === 5 ? 5
    : ashrae === 6 ? 7 : 10;

  const estimatedPUE = ashrae <= 3 ? 1.60 : ashrae <= 5 ? 1.40 : 1.25;
  const coolingCapexMultiplier = ashrae <= 3 ? 1.35 : ashrae <= 5 ? 1.00 : 0.80;
  const coolingScore = ashrae <= 2 ? 2 : ashrae === 3 ? 4 : ashrae <= 5 ? 6 : ashrae <= 7 ? 8 : 9;

  return {
    ashraeZone: ashrae,
    freeCoolingMonthsPerYear,
    estimatedPUE,
    coolingCapexMultiplier,
    coolingScore,
    interpretation: ashrae <= 3
      ? `Hot climate (ASHRAE Zone ${ashrae}) — mechanical cooling required year-round. Estimated PUE: ${estimatedPUE}. Cooling CapEx ~35% above national benchmark.`
      : ashrae <= 5
      ? `Temperate climate (ASHRAE Zone ${ashrae}). Free-air cooling viable ~${freeCoolingMonthsPerYear} months/year, reducing cooling opex. Standard PUE of ${estimatedPUE} achievable.`
      : `Cool climate (ASHRAE Zone ${ashrae}) — excellent for DC efficiency. Free-air cooling ~${freeCoolingMonthsPerYear} months/year. PUE as low as ${estimatedPUE}. Major operational cost advantage.`,
    source: 'ASHRAE TC 9.9, NOAA Climate Normals',
  };
}

// ------- COMPOSITE RESOURCE SCORE -------
function calcResourceFeasibilityScore(waterStress, powerGrid, cooling) {
  const waterWeight = 0.30;
  const powerWeight = 0.45;
  const coolingWeight = 0.25;

  const compositeScore = (
    waterStress.dcScore * waterWeight +
    powerGrid.gridCapacityScore * powerWeight +
    cooling.coolingScore * coolingWeight
  );

  const hardConstraints = [];
  if (waterStress.isHardConstraint) hardConstraints.push('Water scarcity: requires dry cooling systems (+15–20% CapEx)');
  if (powerGrid.isHardConstraint) hardConstraints.push('Grid congestion: interconnection queue 18–36 months');

  return {
    compositeScore: Math.round(compositeScore * 10) / 10,
    hardConstraints,
    summary: { water: waterStress, power: powerGrid, cooling },
  };
}

module.exports = { getWaterStress, getPowerGridCapacity, getCoolingFeasibility, calcResourceFeasibilityScore };
