const axios = require('axios');

/**
 * FEMA NFIP (National Flood Insurance Program) Claims history by county
 * OpenFEMA v2/FimaNfipClaims — no API key required
 *
 * countyCode in NFIP is the 5-digit state+county FIPS (e.g., "06085")
 * Higher score = LESS flood history = BETTER for data centers
 */
async function getNFIPFloodHistory(fullFIPS, state) {
  if (!fullFIPS || fullFIPS.length < 5) {
    return buildFallback('No county FIPS available');
  }

  const countyFIPS5 = fullFIPS.substring(0, 5);
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 10;

  try {
    // Step 1: Count query (very fast — $top=1 with $inlinecount)
    const countRes = await axios.get('https://www.fema.gov/api/open/v2/FimaNfipClaims', {
      params: {
        '$filter': `countyCode eq '${countyFIPS5}' and yearOfLoss ge ${startYear}`,
        '$top': 1,
        '$inlinecount': 'allpages',
        '$select': 'id',
      },
      timeout: 12000,
      headers: { 'Accept': 'application/json', 'User-Agent': 'GoSolarEvaluator/1.0' },
    });

    const totalCount = parseInt(countRes.data?.metadata?.count) || 0;

    if (totalCount === 0) {
      return {
        score: 9.5,
        claimCount: 0,
        totalPaid: 0,
        avgPaid: 0,
        highRiskZonePct: 0,
        rawValue: `0 NFIP flood claims in ${state} county (${countyFIPS5}) — last 10 yrs`,
        interpretation: `No recorded flood insurance claims in last 10 years — minimal flood risk for DC`,
        source: 'FEMA NFIP Claims V2',
      };
    }

    // Step 2: Fetch up to 500 claim records for aggregation
    const claimsRes = await axios.get('https://www.fema.gov/api/open/v2/FimaNfipClaims', {
      params: {
        '$filter': `countyCode eq '${countyFIPS5}' and yearOfLoss ge ${startYear}`,
        '$top': 500,
        '$select': 'amountPaidOnBuildingClaim,yearOfLoss,ratedFloodZone,buildingDamageAmount,causeOfDamage',
      },
      timeout: 12000,
      headers: { 'Accept': 'application/json', 'User-Agent': 'GoSolarEvaluator/1.0' },
    });

    const claims = claimsRes.data?.FimaNfipClaims || [];

    let totalPaid = 0;
    let highRiskCount = 0;
    const HIGH_RISK_ZONES = new Set(['AE', 'VE', 'V', 'AO', 'AH', 'A', 'AR']);

    for (const c of claims) {
      totalPaid += parseFloat(c.amountPaidOnBuildingClaim) || 0;
      if (HIGH_RISK_ZONES.has(c.ratedFloodZone)) highRiskCount++;
    }

    const avgPaid = claims.length > 0 ? Math.round(totalPaid / claims.length) : 0;
    const highRiskZonePct = claims.length > 0 ? Math.round((highRiskCount / claims.length) * 100) : 0;

    // Score: 0-10 (higher = less flood history = better for DC)
    let score;
    if (totalCount <= 2)        score = 9.0;
    else if (totalCount <= 5)   score = 7.5;
    else if (totalCount <= 15)  score = 6.0;
    else if (totalCount <= 30)  score = 4.5;
    else if (totalCount <= 75)  score = 3.0;
    else if (totalCount <= 200) score = 2.0;
    else                        score = 1.0;

    // Penalize if high % are in high-risk flood zones
    if (highRiskZonePct > 60) score = Math.max(1, score - 1.5);
    else if (highRiskZonePct > 30) score = Math.max(1, score - 0.5);

    // Penalize if avg payout is very high (indicates severe events)
    if (avgPaid > 100000) score = Math.max(1, score - 1.0);

    const totalPaidFmt = totalPaid >= 1000000
      ? `$${(totalPaid / 1000000).toFixed(1)}M`
      : `$${Math.round(totalPaid / 1000)}K`;

    return {
      score: Math.round(score * 10) / 10,
      claimCount: totalCount,
      totalPaid: Math.round(totalPaid),
      avgPaid,
      highRiskZonePct,
      rawValue: `${totalCount} NFIP claims (${totalPaidFmt} total, ${highRiskZonePct}% high-risk zone) — last 10 yrs`,
      interpretation: buildInterpretation(totalCount, avgPaid, highRiskZonePct),
      source: 'FEMA NFIP Claims V2 (OpenFEMA)',
    };
  } catch (err) {
    console.warn('NFIP Claims fetch failed:', err.message);
    return buildFallback(err.message);
  }
}

function buildInterpretation(count, avgPaid, highRiskPct) {
  if (count === 0) return 'No flood insurance claims — negligible flood exposure';
  if (count <= 5) return `Only ${count} claim(s) in 10 years — low flood exposure`;
  if (count <= 20) return `${count} claims (avg $${(avgPaid / 1000).toFixed(0)}K/claim) — moderate flood history, elevated DC risk`;
  if (count <= 75) return `${count} claims (${highRiskPct}% in high-risk zones) — significant flood history`;
  return `${count}+ claims in 10 years — active flood zone, serious DC infrastructure risk`;
}

function buildFallback(reason) {
  return {
    score: 5,
    claimCount: null,
    totalPaid: 0,
    avgPaid: 0,
    highRiskZonePct: 0,
    rawValue: `NFIP claims data unavailable (${reason})`,
    interpretation: 'Flood claim history unavailable — using neutral estimate',
    source: 'FEMA NFIP Claims V2 (unavailable)',
    error: true,
  };
}

module.exports = { getNFIPFloodHistory };
