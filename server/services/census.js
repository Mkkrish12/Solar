const axios = require('axios');

/**
 * Fetches Census Business Patterns data for tech company density
 * NAICS 5112 = Software Publishers, 5415 = Computer Systems Design
 */
async function getTechCompanyDensity(stateFIPS, countyFIPS) {
  if (!stateFIPS || !countyFIPS) {
    return buildFallback('No FIPS codes available');
  }

  const censusKey = process.env.CENSUS_API_KEY;
  const keyParam = censusKey ? `&key=${censusKey}` : '';

  try {
    const naicsCodes = ['5112', '5415'];
    const results = await Promise.allSettled(
      naicsCodes.map(naics =>
        axios.get(
          `https://api.census.gov/data/2021/cbp?get=ESTAB,EMP,NAICS2017${keyParam}&for=county:${countyFIPS}&in=state:${stateFIPS}&NAICS2017=${naics}`,
          { timeout: 10000 }
        )
      )
    );

    let totalEstablishments = 0;
    let totalEmployees = 0;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const rows = result.value.data;
        for (let i = 1; i < rows.length; i++) {
          totalEstablishments += parseInt(rows[i][0]) || 0;
          totalEmployees += parseInt(rows[i][1]) || 0;
        }
      }
    }

    let score, tier;
    if (totalEstablishments >= 500)     { score = 9.5; tier = 'Very High'; }
    else if (totalEstablishments >= 200) { score = 8.5; tier = 'High'; }
    else if (totalEstablishments >= 100) { score = 7;   tier = 'Above Average'; }
    else if (totalEstablishments >= 50)  { score = 6;   tier = 'Moderate'; }
    else if (totalEstablishments >= 20)  { score = 4.5; tier = 'Below Average'; }
    else if (totalEstablishments >= 5)   { score = 3;   tier = 'Low'; }
    else                                 { score = 1.5; tier = 'Very Low'; }

    return {
      score,
      rawValue: `${totalEstablishments} tech firms (NAICS 5112+5415), ~${totalEmployees.toLocaleString()} employees in county`,
      totalEstablishments,
      totalEmployees,
      tier,
      interpretation: `${tier} tech sector density — ${totalEstablishments} software/IT firms driving edge latency demand`,
    };
  } catch (err) {
    console.warn('Census Business Patterns fetch failed:', err.message);
    return buildFallback(err.message);
  }
}

/**
 * Fetches FEMA disaster declarations for execution risk assessment
 * Uses OpenFEMA v2 API — falls back gracefully if 503/unavailable
 */
async function getDisasterDeclarations(state, county) {
  if (!state) return buildDisasterFallback('Missing state');

  // FEMA designatedArea format: "Santa Clara (County)" — Title Case with (County) suffix
  const countyClean = county
    ? county.replace(/\s+County$/i, '').trim()
      .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    : null;

  // Try county-specific filter first, then state-only fallback
  const filters = countyClean
    ? [
        `state eq '${state}' and designatedArea eq '${countyClean} (County)'`,
        `state eq '${state}'`,
      ]
    : [`state eq '${state}'`];

  const tenYearsAgo = new Date();
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
  const isoDate = tenYearsAgo.toISOString().split('T')[0];

  for (const filter of filters) {
    try {
      const response = await axios.get('https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries', {
        params: {
          '$filter': `(${filter}) and declarationDate ge '${isoDate}'`,
          '$top': 1000,
          '$select': 'disasterNumber,declarationDate,state,designatedArea,incidentType',
          '$inlinecount': 'allpages',
        },
        timeout: 20000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'GoSolarEvaluator/1.0',
        },
      });

      const declarations = response.data?.DisasterDeclarations || [];
      const count = parseInt(response.data?.metadata?.count) || declarations.length;

      let score, interpretation;
      if (count <= 1) {
        score = 9;
        interpretation = `${count} disaster declaration(s) in 10 years — very low execution risk`;
      } else if (count <= 3) {
        score = 7.5;
        interpretation = `${count} declarations in 10 years — low execution risk`;
      } else if (count <= 7) {
        score = 6;
        interpretation = `${count} declarations in 10 years — moderate execution risk`;
      } else if (count <= 15) {
        score = 4;
        interpretation = `${count} declarations in 10 years — elevated execution risk`;
      } else {
        score = 2;
        interpretation = `${count}+ declarations in 10 years — high execution risk`;
      }

      const levelLabel = county && filter.includes('(County)') ? `${countyClean} County, ${state}` : state;
      return {
        score,
        rawValue: `${count} FEMA disaster declaration${count !== 1 ? 's' : ''} (last 10 yrs) — ${levelLabel}`,
        count,
        interpretation,
      };
    } catch (err) {
      if (err.response?.status === 503) {
        console.warn('FEMA OpenFEMA 503 (service unavailable) — using state-level estimate');
        return getStateDisasterEstimate(state);
      }
      console.warn(`FEMA disasters filter "${filter}" failed:`, err.message);
    }
  }

  return getStateDisasterEstimate(state);
}

/** State-level disaster frequency estimates based on historical FEMA data */
function getStateDisasterEstimate(state) {
  const HIGH_RISK   = new Set(['FL', 'TX', 'LA', 'MS', 'AL', 'NC', 'SC', 'GA', 'OK']);
  const MED_RISK    = new Set(['CA', 'WA', 'OR', 'NY', 'NJ', 'VA', 'KY', 'TN', 'MO', 'AR', 'WV']);

  let score, level;
  if (HIGH_RISK.has(state))  { score = 3.5; level = 'High'; }
  else if (MED_RISK.has(state)) { score = 5.5; level = 'Moderate'; }
  else                          { score = 7;   level = 'Low'; }

  return {
    score,
    rawValue: `~${level} disaster frequency for ${state} (state estimate — FEMA API unavailable)`,
    count: null,
    interpretation: `${level} historical disaster frequency for ${state}`,
    error: true,
  };
}

function buildFallback(reason) {
  return {
    score: 4,
    rawValue: `Tech density data unavailable — estimated (${reason})`,
    totalEstablishments: 0,
    totalEmployees: 0,
    tier: 'Unknown',
    interpretation: 'Tech company density unavailable',
    error: true,
  };
}

function buildDisasterFallback(reason) {
  return {
    score: 6,
    rawValue: `Disaster data unavailable — estimated (${reason})`,
    count: 0,
    interpretation: 'Disaster declaration data unavailable',
    error: true,
  };
}

module.exports = { getTechCompanyDensity, getDisasterDeclarations };
