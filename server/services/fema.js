const axios = require('axios');

/**
 * Fetches FEMA flood zone data for a lat/lng (FEMA NFHL ArcGIS REST)
 */
async function getFloodZone(lat, lng) {
  try {
    const response = await axios.get(
      'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query',
      {
        params: {
          geometry: `${lng},${lat}`,
          geometryType: 'esriGeometryPoint',
          inSR: 4326,
          spatialRel: 'esriSpatialRelIntersects',
          outFields: 'FLD_ZONE,ZONE_SUBTY',
          returnGeometry: false,
          f: 'json',
        },
        timeout: 10000,
      }
    );

    const features = response.data?.features || [];
    if (features.length === 0) {
      return { zone: 'X', subtype: '', score: 9, isDisqualifier: false, rawValue: 'Zone X (outside flood hazard area)', interpretation: 'Minimal flood risk — ideal for data center' };
    }

    const attrs = features[0].attributes;
    const zone = attrs.FLD_ZONE || 'X';
    const subtype = attrs.ZONE_SUBTY || '';

    let score, isDisqualifier, interpretation;
    if (zone === 'X') {
      score = 9; isDisqualifier = false;
      interpretation = 'Zone X — minimal flood risk, no restrictions for data center';
    } else if (zone === 'D') {
      score = 6; isDisqualifier = false;
      interpretation = 'Zone D — undetermined flood risk, moderate concern';
    } else if (zone === 'AO' || zone === 'AH') {
      score = 5; isDisqualifier = false;
      interpretation = `Zone ${zone} — shallow flooding risk`;
    } else if (zone === 'A') {
      score = 4; isDisqualifier = false;
      interpretation = 'Zone A — high flood risk, significant data center concern';
    } else if (zone === 'AE') {
      score = 3; isDisqualifier = true;
      interpretation = 'Zone AE — high flood risk with BFE — HARD DISQUALIFIER for data center';
    } else if (zone === 'V' || zone === 'VE') {
      score = 1; isDisqualifier = true;
      interpretation = 'Zone VE — coastal high velocity wave hazard — HARD DISQUALIFIER';
    } else {
      score = 5; isDisqualifier = false;
      interpretation = `Zone ${zone} — moderate flood risk`;
    }

    return {
      zone,
      subtype,
      score,
      isDisqualifier,
      rawValue: `Zone ${zone}${subtype ? ' — ' + subtype : ''}`,
      interpretation,
    };
  } catch (err) {
    console.warn('FEMA flood zone fetch failed:', err.message);
    return {
      zone: 'UNKNOWN', subtype: '', score: 5, isDisqualifier: false,
      rawValue: 'Flood zone data unavailable — estimated',
      interpretation: 'Flood zone data unavailable',
      error: true,
    };
  }
}

/**
 * Natural hazard risk scoring using:
 * 1. USGS ASCE7 seismic hazard (real-time by lat/lng)
 * 2. State-level composite risk table (FEMA NRI state averages)
 */
async function getNaturalHazardRisk(lat, lng, state, county, fullFIPS) {
  const results = await Promise.allSettled([
    getUSGSSeismicHazard(lat, lng),
    getStateNaturalHazardRisk(state),
  ]);

  const seismic = results[0].status === 'fulfilled' ? results[0].value : null;
  const stateRisk = results[1].status === 'fulfilled' ? results[1].value : getDefaultRisk();

  // Combine seismic (real data) with state-level composite
  let compositeScore;
  let seismicNote = '';

  if (seismic) {
    // Ss = 0.75g is ASCE high seismic, >1.5g is very high
    const seismicRisk = seismic.ss > 1.5 ? 9 : seismic.ss > 0.75 ? 7 : seismic.ss > 0.25 ? 4 : 1;
    const seismicScoreForDC = 10 - seismicRisk; // High seismic = low DC score

    // Weight: seismic 40%, state composite 60%
    compositeScore = seismicScoreForDC * 0.4 + stateRisk.baseScore * 0.6;
    seismicNote = `, seismic Ss=${seismic.ss.toFixed(2)}g`;
  } else {
    compositeScore = stateRisk.baseScore;
  }

  const finalScore = Math.min(9, Math.max(1, compositeScore));

  return {
    score: parseFloat(finalScore.toFixed(1)),
    rawValue: `${stateRisk.riskLevel} risk (${state || 'Unknown'})${seismicNote} — composite NHR score`,
    riskLevel: stateRisk.riskLevel,
    seismicSs: seismic?.ss,
    stateHazards: stateRisk.hazards,
    interpretation: `${stateRisk.riskLevel} overall natural hazard risk for ${county || state || 'this region'}`,
    source: 'USGS ASCE7-22 Seismic + FEMA NRI State Averages',
  };
}

/** Fetch USGS seismic hazard parameters for a location */
async function getUSGSSeismicHazard(lat, lng) {
  try {
    const response = await axios.get('https://earthquake.usgs.gov/ws/designmaps/asce7-22.json', {
      params: { latitude: lat, longitude: lng, riskCategory: 'II', siteClass: 'C', title: 'GoSolar' },
      timeout: 10000,
    });
    const data = response.data?.response?.data;
    if (!data) throw new Error('No seismic data in response');
    return {
      ss: parseFloat(data.ss) || 0,
      s1: parseFloat(data.s1) || 0,
      sds: parseFloat(data.sds) || 0,
    };
  } catch (err) {
    console.warn('USGS seismic fetch failed:', err.message);
    return null;
  }
}

/**
 * State-level natural hazard composite risk table
 * Based on FEMA NRI state averages — covers tornado, hurricane, wildfire, earthquake, flood
 * baseScore: 1-10 for DC suitability (10 = safest for DC = lowest hazard)
 */
function getStateNaturalHazardRisk(state) {
  const STATE_RISK = {
    // Very Low Risk (best for DC)
    'HI': { baseScore: 7.5, riskLevel: 'Low',      hazards: ['volcano'] },
    'AK': { baseScore: 6.0, riskLevel: 'Moderate',  hazards: ['earthquake', 'volcano'] },
    'UT': { baseScore: 7.5, riskLevel: 'Low',       hazards: ['drought'] },
    'ID': { baseScore: 7.5, riskLevel: 'Low',       hazards: ['wildfire'] },
    'MT': { baseScore: 7.0, riskLevel: 'Low',       hazards: ['wildfire'] },
    'WY': { baseScore: 7.0, riskLevel: 'Low',       hazards: [] },
    'ND': { baseScore: 7.0, riskLevel: 'Low',       hazards: ['tornado'] },
    'SD': { baseScore: 6.5, riskLevel: 'Moderate',  hazards: ['tornado'] },
    'NE': { baseScore: 6.0, riskLevel: 'Moderate',  hazards: ['tornado'] },
    'VT': { baseScore: 7.5, riskLevel: 'Very Low',  hazards: [] },
    'NH': { baseScore: 7.5, riskLevel: 'Very Low',  hazards: [] },
    'ME': { baseScore: 7.5, riskLevel: 'Very Low',  hazards: [] },
    'RI': { baseScore: 7.5, riskLevel: 'Very Low',  hazards: [] },
    'CT': { baseScore: 7.5, riskLevel: 'Very Low',  hazards: [] },
    'DE': { baseScore: 7.0, riskLevel: 'Low',       hazards: [] },
    'WI': { baseScore: 7.0, riskLevel: 'Low',       hazards: ['tornado'] },
    'MN': { baseScore: 7.0, riskLevel: 'Low',       hazards: ['tornado'] },
    'MI': { baseScore: 7.0, riskLevel: 'Low',       hazards: [] },
    'PA': { baseScore: 7.0, riskLevel: 'Low',       hazards: [] },
    'NY': { baseScore: 6.5, riskLevel: 'Moderate',  hazards: ['hurricane'] },
    'NJ': { baseScore: 6.5, riskLevel: 'Moderate',  hazards: ['hurricane'] },
    'MA': { baseScore: 7.0, riskLevel: 'Low',       hazards: [] },
    'MD': { baseScore: 6.5, riskLevel: 'Moderate',  hazards: ['hurricane'] },
    'VA': { baseScore: 6.5, riskLevel: 'Moderate',  hazards: ['hurricane'] },
    'OH': { baseScore: 7.0, riskLevel: 'Low',       hazards: ['tornado'] },
    'IN': { baseScore: 6.5, riskLevel: 'Moderate',  hazards: ['tornado'] },
    'IL': { baseScore: 6.5, riskLevel: 'Moderate',  hazards: ['tornado'] },
    'IA': { baseScore: 6.5, riskLevel: 'Moderate',  hazards: ['tornado'] },
    'MO': { baseScore: 5.5, riskLevel: 'Moderate',  hazards: ['tornado', 'earthquake'] },
    'AR': { baseScore: 5.5, riskLevel: 'Moderate',  hazards: ['tornado', 'earthquake'] },
    'KS': { baseScore: 5.5, riskLevel: 'Moderate',  hazards: ['tornado'] },
    'OK': { baseScore: 4.5, riskLevel: 'High',      hazards: ['tornado', 'drought'] },
    'TX': { baseScore: 5.0, riskLevel: 'Moderate',  hazards: ['hurricane', 'tornado', 'drought'] },
    'LA': { baseScore: 4.0, riskLevel: 'High',      hazards: ['hurricane', 'flood'] },
    'MS': { baseScore: 4.5, riskLevel: 'High',      hazards: ['hurricane', 'tornado'] },
    'AL': { baseScore: 4.5, riskLevel: 'High',      hazards: ['tornado', 'hurricane'] },
    'TN': { baseScore: 5.5, riskLevel: 'Moderate',  hazards: ['tornado', 'earthquake'] },
    'KY': { baseScore: 6.0, riskLevel: 'Moderate',  hazards: ['earthquake'] },
    'GA': { baseScore: 6.0, riskLevel: 'Moderate',  hazards: ['hurricane'] },
    'SC': { baseScore: 5.5, riskLevel: 'Moderate',  hazards: ['hurricane'] },
    'NC': { baseScore: 5.5, riskLevel: 'Moderate',  hazards: ['hurricane'] },
    'FL': { baseScore: 4.0, riskLevel: 'High',      hazards: ['hurricane', 'flood', 'tornado'] },
    'CA': { baseScore: 5.0, riskLevel: 'Moderate',  hazards: ['earthquake', 'wildfire', 'drought'] },
    'OR': { baseScore: 6.0, riskLevel: 'Moderate',  hazards: ['earthquake', 'wildfire'] },
    'WA': { baseScore: 5.5, riskLevel: 'Moderate',  hazards: ['earthquake', 'wildfire', 'volcano'] },
    'NV': { baseScore: 7.0, riskLevel: 'Low',       hazards: ['drought'] },
    'AZ': { baseScore: 6.5, riskLevel: 'Low',       hazards: ['drought', 'wildfire'] },
    'NM': { baseScore: 6.5, riskLevel: 'Low',       hazards: ['drought', 'wildfire'] },
    'CO': { baseScore: 6.5, riskLevel: 'Low',       hazards: ['wildfire', 'hail'] },
    'WV': { baseScore: 7.0, riskLevel: 'Low',       hazards: [] },
    'DC': { baseScore: 7.0, riskLevel: 'Low',       hazards: [] },
  };

  const risk = STATE_RISK[state] || { baseScore: 5.5, riskLevel: 'Moderate', hazards: [] };
  return risk;
}

function getDefaultRisk() {
  return { baseScore: 5.5, riskLevel: 'Moderate', hazards: [] };
}

module.exports = { getFloodZone, getNaturalHazardRisk };
