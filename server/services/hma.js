const axios = require('axios');

/** State abbreviation → full name (for HMA API which requires full state name) */
const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
  PR: 'Puerto Rico', VI: 'Virgin Islands', GU: 'Guam',
};

/**
 * FEMA Hazard Mitigation Assistance (HMA) Projects by county
 * OpenFEMA v4/HazardMitigationAssistanceProjects — no API key required
 *
 * Logic: High federal mitigation investment = government certifies this as high-hazard area
 * → Higher investment = LOWER DC suitability (higher risk)
 * Score is INVERTED: high investment → low score (bad for DC)
 */
async function getHMAProjects(stateAbbr, county) {
  const stateFull = STATE_NAMES[stateAbbr];
  if (!stateFull || !county) {
    return buildFallback('Missing state or county');
  }

  // Clean county name: remove "County" suffix if present
  const countyClean = county.replace(/\s+County$/i, '').trim();

  try {
    const response = await axios.get('https://www.fema.gov/api/open/v4/HazardMitigationAssistanceProjects', {
      params: {
        '$filter': `state eq '${stateFull}' and county eq '${countyClean}'`,
        '$top': 1000,
        '$inlinecount': 'allpages',
        '$select': 'programArea,federalShareObligated,benefitCostRatio,county,projectType,status,numberOfProperties,dateApproved',
      },
      timeout: 12000,
      headers: { 'Accept': 'application/json', 'User-Agent': 'GoSolarEvaluator/1.0' },
    });

    const projects = response.data?.HazardMitigationAssistanceProjects || [];
    const totalCount = parseInt(response.data?.metadata?.count) || projects.length;

    if (projects.length === 0) {
      return {
        score: 8.5,
        projectCount: 0,
        totalFederalObligation: 0,
        avgBCR: 0,
        programBreakdown: {},
        rawValue: `0 FEMA HMA projects in ${countyClean} County, ${stateAbbr}`,
        interpretation: `No FEMA hazard mitigation investment in county — government data shows low natural hazard risk`,
        source: 'FEMA HMA Projects V4 (OpenFEMA)',
      };
    }

    let totalObligation = 0;
    let bcrSum = 0;
    let bcrCount = 0;
    const programCounts = {};
    let closedCount = 0;

    for (const p of projects) {
      totalObligation += parseFloat(p.federalShareObligated) || 0;
      const bcr = parseFloat(p.benefitCostRatio);
      if (bcr > 0 && bcr < 1000) {
        bcrSum += bcr;
        bcrCount++;
      }
      const prog = p.programArea || 'Other';
      programCounts[prog] = (programCounts[prog] || 0) + 1;
      if (p.status === 'Closed') closedCount++;
    }

    const avgBCR = bcrCount > 0 ? Math.round((bcrSum / bcrCount) * 10) / 10 : 0;
    const totalM = totalObligation / 1_000_000;

    // Score: INVERTED — high investment = gov certified high hazard = bad for DC
    // 0-10: higher score = LESS hazard mitigation needed = better for DC
    let score;
    if (totalM <= 0.5)      score = 9.0;  // <$500K — minimal hazard concern
    else if (totalM <= 2)   score = 7.5;  // $500K-$2M — low-moderate
    else if (totalM <= 10)  score = 6.0;  // $2M-$10M — moderate
    else if (totalM <= 30)  score = 4.5;  // $10M-$30M — elevated
    else if (totalM <= 100) score = 3.0;  // $30M-$100M — high
    else                    score = 1.5;  // $100M+ — extreme hazard county

    // Bonus: if BCR > 1 on average, FEMA confirmed cost-justified hazard
    if (avgBCR > 2 && totalM > 5) score = Math.max(1, score - 0.5);

    const totalFmt = totalM >= 1
      ? `$${totalM.toFixed(1)}M`
      : `$${Math.round(totalObligation / 1000)}K`;

    const topPrograms = Object.entries(programCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k}(${v})`)
      .join(', ');

    return {
      score: Math.round(score * 10) / 10,
      projectCount: totalCount,
      totalFederalObligation: Math.round(totalObligation),
      avgBCR,
      programBreakdown: programCounts,
      rawValue: `${totalCount} FEMA HMA projects (${totalFmt} federal, BCR avg ${avgBCR}) in ${countyClean} County`,
      interpretation: buildInterpretation(totalCount, totalM, avgBCR, topPrograms),
      source: 'FEMA HMA Projects V4 (OpenFEMA)',
    };
  } catch (err) {
    console.warn('HMA Projects fetch failed:', err.message);
    return buildFallback(err.message);
  }
}

function buildInterpretation(count, totalM, avgBCR, topPrograms) {
  if (count === 0) return 'No government hazard mitigation investment — low classified hazard risk';
  if (totalM < 1) return `${count} minor HMA projects — low hazard mitigation spend`;
  if (totalM < 10) return `${count} HMA projects ($${totalM.toFixed(1)}M) — FEMA has invested in ${topPrograms} hazard mitigation`;
  return `${count} HMA projects ($${totalM.toFixed(0)}M federal investment) — government-certified high-risk county for ${topPrograms}`;
}

function buildFallback(reason) {
  return {
    score: 5,
    projectCount: null,
    totalFederalObligation: 0,
    avgBCR: 0,
    programBreakdown: {},
    rawValue: `HMA data unavailable (${reason})`,
    interpretation: 'Hazard mitigation investment data unavailable — using neutral estimate',
    source: 'FEMA HMA Projects V4 (unavailable)',
    error: true,
  };
}

module.exports = { getHMAProjects };
