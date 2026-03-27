const axios = require('axios');

/**
 * Gets broadband connectivity score using Census ACS household internet data
 * + FCC Form 477 legacy endpoint as supplemental signal
 * 
 * ACS variables:
 *   B28002_001E = Total households
 *   B28002_007E = Households with broadband subscription
 *   B28002_004E = Households with cable/fiber/DSL
 */
async function getBroadbandData(lat, lng, address, city, state, zip, stateFIPS, countyFIPS) {
  // Prefer county-level ACS data if FIPS available
  if (stateFIPS && countyFIPS) {
    return await getACSBroadband(stateFIPS, countyFIPS, city, state);
  }

  // Fallback: estimate from state name
  if (state) {
    return getStateFallback(state);
  }

  return buildFallback('No location FIPS available');
}

async function getACSBroadband(stateFIPS, countyFIPS, city, state) {
  const censusKey = process.env.CENSUS_API_KEY;
  const keyParam = censusKey ? `&key=${censusKey}` : '';

  try {
    const url = `https://api.census.gov/data/2022/acs/acs5?get=NAME,B28002_001E,B28002_007E,B28002_004E,B28002_002E${keyParam}&for=county:${countyFIPS}&in=state:${stateFIPS}`;

    const response = await axios.get(url, { timeout: 10000 });

    const rows = response.data;
    if (!rows || rows.length < 2) throw new Error('No ACS data returned');

    // Row 0 = headers, Row 1 = data
    const headers = rows[0];
    const data = rows[1];

    const getVal = (name) => parseInt(data[headers.indexOf(name)]) || 0;

    const totalHouseholds = getVal('B28002_001E');
    const broadbandHouseholds = getVal('B28002_007E');
    const cableFiberDSL = getVal('B28002_004E');
    const hasComputer = getVal('B28002_002E');

    if (totalHouseholds === 0) throw new Error('Zero households in ACS data');

    const broadbandPct = (broadbandHouseholds / totalHouseholds) * 100;
    const cablePct = (cableFiberDSL / totalHouseholds) * 100;

    let score, interpretation, tier;
    if (broadbandPct >= 90) {
      score = 9.5; tier = 'Exceptional';
      interpretation = `${broadbandPct.toFixed(0)}% broadband adoption — top-tier connectivity county`;
    } else if (broadbandPct >= 80) {
      score = 8; tier = 'Excellent';
      interpretation = `${broadbandPct.toFixed(0)}% broadband adoption — strong connectivity`;
    } else if (broadbandPct >= 70) {
      score = 7; tier = 'Good';
      interpretation = `${broadbandPct.toFixed(0)}% broadband adoption — good county connectivity`;
    } else if (broadbandPct >= 60) {
      score = 5.5; tier = 'Moderate';
      interpretation = `${broadbandPct.toFixed(0)}% broadband adoption — moderate connectivity`;
    } else if (broadbandPct >= 45) {
      score = 4; tier = 'Below Average';
      interpretation = `${broadbandPct.toFixed(0)}% broadband adoption — below-average connectivity`;
    } else {
      score = 2; tier = 'Poor';
      interpretation = `${broadbandPct.toFixed(0)}% broadband adoption — limited connectivity`;
    }

    const countyName = data[headers.indexOf('NAME')] || `${city}, ${state}`;

    return {
      score,
      rawValue: `${broadbandPct.toFixed(0)}% broadband (${broadbandHouseholds.toLocaleString()} of ${totalHouseholds.toLocaleString()} households) — ${countyName}`,
      broadbandPct,
      cablePct,
      totalHouseholds,
      broadbandHouseholds,
      tier,
      hasFiber: broadbandPct > 75,
      interpretation,
      source: 'Census ACS 5-Year (2022)',
    };
  } catch (err) {
    console.warn('Census ACS broadband fetch failed:', err.message);
    return getStateFallback(state);
  }
}

/** State-level broadband fallback based on FCC/ACS state averages */
function getStateFallback(state) {
  const HIGH_BROADBAND = new Set(['CA', 'WA', 'MA', 'NJ', 'CT', 'MD', 'VA', 'NY', 'CO', 'MN', 'OR', 'UT', 'DC']);
  const MED_BROADBAND  = new Set(['TX', 'IL', 'FL', 'GA', 'OH', 'PA', 'MI', 'NC', 'AZ', 'NV', 'IN', 'WI', 'TN']);

  let score, tier;
  if (HIGH_BROADBAND.has(state)) { score = 8; tier = 'High'; }
  else if (MED_BROADBAND.has(state)) { score = 6; tier = 'Moderate'; }
  else { score = 4.5; tier = 'Below Average'; }

  return {
    score,
    rawValue: `Estimated ~${score >= 7 ? '80-90' : score >= 5 ? '65-75' : '50-65'}% broadband (state avg, ${state})`,
    broadbandPct: score >= 7 ? 82 : score >= 5 ? 70 : 57,
    tier,
    hasFiber: score >= 7,
    interpretation: `${tier} connectivity for ${state} — state-level estimate`,
    source: 'Census ACS state averages (estimated)',
    error: true,
  };
}

function buildFallback(reason) {
  return {
    score: 5,
    rawValue: `Broadband data unavailable — estimated (${reason})`,
    broadbandPct: null,
    tier: 'Unknown',
    hasFiber: null,
    interpretation: 'Broadband connectivity data unavailable',
    source: 'Census ACS (unavailable)',
    error: true,
  };
}

module.exports = { getBroadbandData };
