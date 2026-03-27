const axios = require('axios');

/**
 * NASA POWER API — 40-year climatology
 * Free, no API key required.
 * Returns: cloud cover, wind speed (10m + 50m), useful for solar scoring.
 *
 * Endpoint: /api/temporal/climatology/point
 * Parameters:
 *   CLOUD_AMT — annual average cloud cover (0–100%)
 *   WS10M     — wind speed at 10m (m/s) — rooftop panel uplift risk
 *   WS50M     — wind speed at 50m (m/s) — gust proxy
 */
async function getNASACloudAndWind(lat, lng) {
  try {
    const response = await axios.get(
      'https://power.larc.nasa.gov/api/temporal/climatology/point',
      {
        params: {
          parameters: 'CLOUD_AMT,WS10M,WS50M',
          community: 'RE',
          longitude: lng,
          latitude: lat,
          format: 'JSON',
        },
        timeout: 12000,
      }
    );

    const params = response.data?.properties?.parameter;
    if (!params) return null;

    const annualCloudCoverPct = params.CLOUD_AMT?.ANN ?? null;
    const windSpeed10m = params.WS10M?.ANN ?? null;
    const windSpeed50m = params.WS50M?.ANN ?? null;

    const cloudScore = calcCloudScore(annualCloudCoverPct);
    const windResult = calcWindScore(windSpeed10m);

    console.log(`   🌤️ NASA POWER: cloud ${annualCloudCoverPct?.toFixed(1)}%, wind ${windSpeed10m?.toFixed(1)} m/s`);

    return {
      annualCloudCoverPct: annualCloudCoverPct ? Math.round(annualCloudCoverPct * 10) / 10 : null,
      windSpeed10m: windSpeed10m ? Math.round(windSpeed10m * 10) / 10 : null,
      windSpeed50m: windSpeed50m ? Math.round(windSpeed50m * 10) / 10 : null,
      cloudScore,
      windScore: windResult.score,
      windLabel: windResult.label,
      windInstallCostAdder: windResult.installCostAdder,
      windMaintenanceMultiplier: windResult.annualMaintenanceMultiplier,
      windDetail: windResult.detail,
      source: 'NASA POWER 40-year climatology (no key required)',
    };
  } catch (err) {
    console.warn('   ⚠️ NASA POWER failed:', err.message);
    return null;
  }
}

/**
 * Cloud cover → solar score
 * Lower cloud = more sun = better for solar
 * Source: NREL solar resource quality benchmarks
 */
function calcCloudScore(cloudAmtPct) {
  if (cloudAmtPct == null) return 5;
  if (cloudAmtPct < 30) return 9;
  if (cloudAmtPct < 40) return 8;
  if (cloudAmtPct < 50) return 6;
  if (cloudAmtPct < 60) return 4;
  if (cloudAmtPct < 70) return 2;
  return 1;
}

/**
 * Wind speed → solar installation score
 * Higher wind = higher structural load = more expensive install, more maintenance
 * Source: NREL Best Practices for PV + IEC 61215 panel standard
 */
function calcWindScore(windSpeed10m) {
  if (windSpeed10m == null) {
    return { score: 6, label: 'Unknown', detail: 'No wind data available', installCostAdder: 0.05, annualMaintenanceMultiplier: 1.05 };
  }

  let score, label, installCostAdder, annualMaintenanceMultiplier;

  if (windSpeed10m < 4) {
    score = 9; label = 'Low wind — ideal for solar';
    installCostAdder = 0; annualMaintenanceMultiplier = 1.0;
  } else if (windSpeed10m < 6) {
    score = 7; label = 'Moderate wind — standard installation';
    installCostAdder = 0.05; annualMaintenanceMultiplier = 1.05;
  } else if (windSpeed10m < 8) {
    score = 5; label = 'High wind — enhanced mounting required';
    installCostAdder = 0.15; annualMaintenanceMultiplier = 1.20;
  } else if (windSpeed10m < 10) {
    score = 3; label = 'Very high wind — significant structural cost adder';
    installCostAdder = 0.25; annualMaintenanceMultiplier = 1.35;
  } else {
    score = 1; label = 'Extreme wind — specialized hardware required';
    installCostAdder = 0.35; annualMaintenanceMultiplier = 1.50;
  }

  return {
    score,
    label,
    installCostAdder,
    annualMaintenanceMultiplier,
    detail: `Avg annual wind ${windSpeed10m.toFixed(1)} m/s at 10m height (NASA POWER 40yr avg)`,
  };
}

module.exports = { getNASACloudAndWind, calcCloudScore, calcWindScore };
