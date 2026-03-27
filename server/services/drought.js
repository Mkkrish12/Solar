const axios = require('axios');

/**
 * Fetches US Drought Monitor data for a county FIPS
 */
async function getDroughtData(stateFIPS, countyFIPS, fullFIPS) {
  if (!fullFIPS && (!stateFIPS || !countyFIPS)) {
    return buildFallback('No FIPS code available');
  }

  const fipsCode = fullFIPS || `${stateFIPS}${countyFIPS}`;
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  try {
    const response = await axios.get(
      'https://usdmdataservices.unl.edu/api/CountyStatistics/GetDroughtSeverityStatisticsByAreaPercent',
      {
        params: {
          aoi: fipsCode,
          startdate: startDate,
          enddate: endDate,
          statisticsType: 1,
        },
        timeout: 10000,
      }
    );

    const data = response.data;
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return buildFallback('No drought data returned');
    }

    // Get most recent entry
    const entries = Array.isArray(data) ? data : [data];
    const latest = entries[entries.length - 1];

    // Drought levels: None, D0, D1, D2, D3, D4
    const d4 = parseFloat(latest.D4) || 0;
    const d3 = parseFloat(latest.D3) || 0;
    const d2 = parseFloat(latest.D2) || 0;
    const d1 = parseFloat(latest.D1) || 0;
    const d0 = parseFloat(latest.D0) || 0;
    const none = parseFloat(latest.None) || 0;

    // Determine dominant category
    let dominantLevel = 'None';
    let score = 9;
    let isDisqualifier = false;
    let interpretation = '';

    if (d4 > 50) {
      dominantLevel = 'D4';
      score = 1;
      isDisqualifier = true;
      interpretation = 'Exceptional drought — severe water stress, near-disqualifier for data centers';
    } else if (d3 > 50 || (d3 + d4) > 70) {
      dominantLevel = 'D3';
      score = 2;
      isDisqualifier = true;
      interpretation = 'Extreme drought — water availability is a critical concern for cooling';
    } else if (d2 > 50) {
      dominantLevel = 'D2';
      score = 4;
      interpretation = 'Severe drought — water availability concern for data center cooling';
    } else if (d1 > 50) {
      dominantLevel = 'D1';
      score = 5;
      interpretation = 'Moderate drought — some water availability concern';
    } else if (d0 > 50) {
      dominantLevel = 'D0';
      score = 7;
      interpretation = 'Abnormally dry — minor water availability concern';
    } else {
      dominantLevel = 'None';
      score = 9;
      interpretation = 'No significant drought — adequate water for data center cooling';
    }

    const weekOf = latest.MapDate || latest.releaseDate || startDate;

    return {
      score,
      rawValue: `${dominantLevel === 'None' ? 'No Drought' : dominantLevel + ' (' + getDroughtLabel(dominantLevel) + ')'} — week of ${weekOf}`,
      dominantLevel,
      percentages: { None: none, D0: d0, D1: d1, D2: d2, D3: d3, D4: d4 },
      isDisqualifier,
      interpretation,
    };
  } catch (err) {
    console.warn('Drought Monitor fetch failed:', err.message);
    return buildFallback(err.message);
  }
}

function getDroughtLabel(level) {
  const labels = {
    D0: 'Abnormally Dry',
    D1: 'Moderate Drought',
    D2: 'Severe Drought',
    D3: 'Extreme Drought',
    D4: 'Exceptional Drought',
  };
  return labels[level] || level;
}

function buildFallback(reason) {
  return {
    score: 7,
    rawValue: `Data unavailable — estimated (${reason})`,
    dominantLevel: 'Unknown',
    percentages: {},
    interpretation: 'Drought data unavailable',
    error: true,
  };
}

module.exports = { getDroughtData };
