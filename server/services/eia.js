/**
 * EIA (Energy Information Administration) data — static lookups
 *
 * 3A: State average retail electricity rates (cents/kWh)
 *     Source: EIA Electric Power Monthly, Table 5.6.A (latest)
 *     High rates crush DC economics (power = 40-60% of opex)
 *
 * 3C: SAIDI — System Average Interruption Duration Index (minutes/year without major events)
 *     Source: EIA Form 861 Annual Electric Power Industry Report
 *     Low SAIDI = reliable grid = critical for mission-critical data centers
 */

// State average retail electricity rates (commercial, cents/kWh)
const STATE_RATES = {
  AL: 13.2, AK: 22.8, AZ: 12.4, AR: 10.6, CA: 27.9, CO: 13.8,
  CT: 26.6, DE: 14.3, FL: 14.1, GA: 12.8, HI: 39.3, ID: 9.8,
  IL: 12.6, IN: 11.4, IA: 11.0, KS: 11.8, KY: 10.2, LA: 10.4,
  ME: 21.5, MD: 14.9, MA: 25.7, MI: 17.3, MN: 14.5, MS: 11.6,
  MO: 11.3, MT: 11.8, NE: 11.0, NV: 13.0, NH: 24.6, NJ: 17.8,
  NM: 13.2, NY: 22.7, NC: 12.2, ND: 10.7, OH: 13.1, OK: 10.5,
  OR: 11.5, PA: 15.2, RI: 25.8, SC: 12.7, SD: 11.2, TN: 11.7,
  TX: 12.9, UT: 10.5, VT: 20.5, VA: 13.3, WA: 10.1, WV: 10.8,
  WI: 15.0, WY: 9.8, DC: 15.6,
};

// SAIDI: annual average outage minutes per customer, without major events
const STATE_SAIDI = {
  AL: 165, AK: 289, AZ: 64,  AR: 195, CA: 118, CO: 89,
  CT: 115, DE: 79,  FL: 71,  GA: 121, HI: 143, ID: 183,
  IL: 108, IN: 148, IA: 162, KS: 178, KY: 154, LA: 192,
  ME: 267, MD: 102, MA: 87,  MI: 188, MN: 134, MS: 116,
  MO: 196, MT: 254, NE: 143, NV: 58,  NH: 143, NJ: 88,
  NM: 124, NY: 105, NC: 128, ND: 198, OH: 128, OK: 221,
  OR: 213, PA: 156, RI: 74,  SC: 136, SD: 211, TN: 145,
  TX: 92,  UT: 89,  VT: 176, VA: 103, WA: 212, WV: 244,
  WI: 127, WY: 215, DC: 41,
};

function getStateElectricRate(stateAbbr) {
  const abbr = stateAbbr?.toUpperCase();
  const rate = STATE_RATES[abbr] ?? 15.0; // national avg fallback

  let dcScore, interpretation;
  if (rate < 11) {
    dcScore = 9;
    interpretation = 'Excellent for DC — lowest-tier power costs';
  } else if (rate < 14) {
    dcScore = 7;
    interpretation = 'Acceptable power costs for DC operations';
  } else if (rate < 18) {
    dcScore = 5;
    interpretation = 'Above-average power costs reduce DC margins';
  } else if (rate < 22) {
    dcScore = 3;
    interpretation = 'High power costs significantly hurt DC economics';
  } else {
    dcScore = 1;
    interpretation = 'Very high power costs make DC operations very expensive';
  }

  return {
    centsPerKwh: rate,
    dcScore,
    interpretation,
    source: 'EIA Electric Power Monthly',
    rawValue: `${rate}¢/kWh`,
  };
}

function getGridReliability(stateAbbr) {
  const abbr = stateAbbr?.toUpperCase();
  const saidi = STATE_SAIDI[abbr] ?? 150; // national avg fallback

  let dcScore, interpretation;
  if (saidi < 75) {
    dcScore = 9;
    interpretation = 'Exceptional grid reliability — ideal for mission-critical DC ops';
  } else if (saidi < 120) {
    dcScore = 7;
    interpretation = 'Good grid reliability for data center operations';
  } else if (saidi < 175) {
    dcScore = 5;
    interpretation = 'Average reliability — DC will need UPS investment';
  } else if (saidi < 225) {
    dcScore = 3;
    interpretation = 'Below-average reliability — significant DC risk without backup power';
  } else {
    dcScore = 1;
    interpretation = 'Poor grid reliability — data center requires major backup power investment';
  }

  return {
    avgOutageMinutesPerYear: saidi,
    dcScore,
    interpretation,
    source: 'EIA Form 861 Annual Electric Power Industry Report',
    rawValue: `${saidi} min/yr outage (SAIDI)`,
  };
}

module.exports = { getStateElectricRate, getGridReliability };
