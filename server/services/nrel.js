const axios = require('axios');

/**
 * Fetches NREL PVWatts solar irradiance data
 */
async function getSolarIrradiance(lat, lng) {
  const apiKey = process.env.NREL_API_KEY || 'DEMO_KEY';

  try {
    const response = await axios.get(
      'https://developer.nrel.gov/api/pvwatts/v8.json',
      {
        params: {
          api_key: apiKey,
          lat,
          lon: lng,
          system_capacity: 100,
          azimuth: 180,
          tilt: 20,
          array_type: 1,
          module_type: 0,
          losses: 14,
        },
        timeout: 12000,
      }
    );

    const outputs = response.data?.outputs;
    if (!outputs) throw new Error('No PVWatts outputs in response');

    const annualAC = outputs.ac_annual; // kWh/year for 100kW system
    const capacityFactor = outputs.capacity_factor;

    // Score based on annual production
    // Excellent: >130,000 kWh/year for 100kW system (Southwest US)
    // Good: >120,000
    // Average: >100,000
    // Below average: >80,000
    let score;
    let tier;
    if (annualAC >= 140000) { score = 10; tier = 'Exceptional'; }
    else if (annualAC >= 130000) { score = 9; tier = 'Excellent'; }
    else if (annualAC >= 120000) { score = 8; tier = 'Very Good'; }
    else if (annualAC >= 110000) { score = 7; tier = 'Good'; }
    else if (annualAC >= 100000) { score = 6; tier = 'Above Average'; }
    else if (annualAC >= 90000) { score = 5; tier = 'Average'; }
    else if (annualAC >= 80000) { score = 4; tier = 'Below Average'; }
    else if (annualAC >= 70000) { score = 3; tier = 'Poor'; }
    else { score = 2; tier = 'Very Poor'; }

    // Estimated annual revenue for GoSolar lease model
    const estimatedLeaseKWh = annualAC * (process.env.SOLAR_RATE_KWH ? parseFloat(process.env.SOLAR_RATE_KWH) : 0.08);
    const estimatedAnnualLease = Math.round(estimatedLeaseKWh * 0.6); // 60% goes to land lease

    return {
      score,
      rawValue: `${Math.round(annualAC).toLocaleString()} kWh/year (100kW reference system)`,
      annualAC: Math.round(annualAC),
      capacityFactor: capacityFactor?.toFixed(1),
      tier,
      interpretation: `${tier} solar resource — ${Math.round(annualAC / 1000)}k kWh/year`,
      estimatedAnnualRevenue: estimatedAnnualLease,
      co2OffsetTons: Math.round(annualAC * 0.000709),
    };
  } catch (err) {
    console.warn('NREL PVWatts fetch failed:', err.message);
    return {
      score: 5,
      rawValue: 'Solar data unavailable — estimated from regional averages',
      annualAC: null,
      tier: 'Unknown',
      interpretation: 'Solar irradiance data unavailable',
      error: true,
    };
  }
}

/**
 * NREL Solar Resource Data API — GHI, DNI, Diffuse
 * Returns finer-grained irradiance metrics than PVWatts alone.
 *
 * GHI (Global Horizontal Irradiance): total solar radiation on a horizontal surface
 * DNI (Direct Normal Irradiance): direct beam radiation — key for tracking systems on flat roofs
 * Lat-tilt: fixed-tilt at latitude angle — proxy for optimal panel output
 *
 * Units: kWh/m²/day (annual averages)
 */
async function getNRELSolarResource(lat, lng) {
  const apiKey = process.env.NREL_API_KEY || 'DEMO_KEY';
  try {
    const response = await axios.get(
      'https://developer.nrel.gov/api/solar/solar_resource/v1.json',
      {
        params: { api_key: apiKey, lat, lon: lng },
        timeout: 10000,
      }
    );

    const out = response.data?.outputs;
    if (!out) return null;

    const annualGHI = out.avg_ghi?.annual ?? null;
    const annualDNI = out.avg_dni?.annual ?? null;
    const annualLatTilt = out.avg_lat_tilt?.annual ?? null;

    // GHI scoring: kWh/m²/day
    // < 3.5 = poor (Pacific NW), 3.5–4.5 = moderate (Midwest), 4.5–5.5 = good (SW), > 5.5 = excellent (Desert SW)
    let ghiScore = 5;
    if (annualGHI != null) {
      ghiScore = annualGHI < 3.5 ? 3
        : annualGHI < 4.0 ? 5
        : annualGHI < 4.5 ? 6
        : annualGHI < 5.0 ? 7
        : annualGHI < 5.5 ? 9
        : 10;
    }

    console.log(`   ☀️ NREL Solar Resource: GHI=${annualGHI?.toFixed(2)}, DNI=${annualDNI?.toFixed(2)} kWh/m²/day`);

    return {
      annualGHI,
      annualDNI,
      annualLatTilt,
      ghiScore,
      rawValue: annualGHI
        ? `GHI ${annualGHI.toFixed(2)} kWh/m²/day · DNI ${annualDNI?.toFixed(2) || 'N/A'} kWh/m²/day`
        : 'Solar resource data unavailable',
      source: 'NREL Solar Resource Data API v1',
    };
  } catch (err) {
    console.warn('   ⚠️ NREL Solar Resource failed:', err.message);
    return null;
  }
}

module.exports = { getSolarIrradiance, getNRELSolarResource };
