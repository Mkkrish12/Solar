const axios = require('axios');
const { postOverpass } = require('./overpass');

/**
 * DC Competitive Landscape Analysis
 * Detects nearby data centers via:
 *   1. OpenStreetMap Overpass API (free, no key)
 *   2. Known hyperscaler cluster static list (public press releases + DatacenterHawk)
 *   3. Google Places API (existing key)
 *
 * Computes market saturation and adjusts colocation rate projections.
 * Sources: JLL Data Center Outlook 2024, CBRE DC Market Report 2024
 */

const KNOWN_HYPERSCALER_MARKETS = [
  { name: 'Ashburn Data Center Corridor', lat: 39.0438, lng: -77.4874, operator: 'Multiple', mwCapacity: 3000 },
  { name: 'Silicon Valley Data Center Hub', lat: 37.3861, lng: -122.0839, operator: 'Multiple', mwCapacity: 2000 },
  { name: 'Dallas-Fort Worth DC Campus', lat: 32.8998, lng: -97.0403, operator: 'Multiple', mwCapacity: 1500 },
  { name: 'Chicago Data Center District', lat: 41.8827, lng: -87.6233, operator: 'Multiple', mwCapacity: 1200 },
  { name: 'Phoenix DC Corridor', lat: 33.4484, lng: -112.074, operator: 'Multiple', mwCapacity: 900 },
  { name: 'Atlanta DC Hub', lat: 33.749, lng: -84.388, operator: 'Multiple', mwCapacity: 800 },
  { name: 'New York Metro DC Cluster', lat: 40.7128, lng: -74.006, operator: 'Multiple', mwCapacity: 1100 },
  { name: 'Seattle/Quincy DC Region', lat: 47.2354, lng: -119.852, operator: 'Multiple', mwCapacity: 700 },
  { name: 'Denver/Aurora DC Hub', lat: 39.7392, lng: -104.9903, operator: 'Multiple', mwCapacity: 400 },
  { name: 'Las Vegas DC Market', lat: 36.1699, lng: -115.1398, operator: 'Multiple', mwCapacity: 350 },
  { name: 'Columbus, OH DC Cluster', lat: 39.9612, lng: -82.9988, operator: 'Multiple', mwCapacity: 500 },
  { name: 'Hillsboro, OR (Intel/Nike Campus)', lat: 45.5229, lng: -122.9898, operator: 'Multiple', mwCapacity: 450 },
];

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getNearbyDCsFromOSM(lat, lng, radiusMiles = 25) {
  const radiusMeters = radiusMiles * 1609.34;
  const query = `[out:json][timeout:15];(node["telecom"="data_center"](around:${radiusMeters},${lat},${lng});way["telecom"="data_center"](around:${radiusMeters},${lat},${lng});node["building"="data_center"](around:${radiusMeters},${lat},${lng});way["building"="data_center"](around:${radiusMeters},${lat},${lng}););out center tags;`;
  try {
    const response = await postOverpass(query, { timeoutMs: 20000 });
    return (response.data.elements || []).map(el => {
      const elLat = el.lat || el.center?.lat;
      const elLng = el.lon || el.center?.lon;
      return {
        name: el.tags?.name || el.tags?.operator || 'Data Center',
        lat: elLat,
        lng: elLng,
        operator: el.tags?.operator || null,
        source: 'osm',
        distanceMiles: haversineDistance(lat, lng, elLat, elLng),
      };
    }).filter(dc => dc.lat && dc.distanceMiles <= radiusMiles);
  } catch {
    return [];
  }
}

async function getNearbyDCsFromPlaces(lat, lng, radiusMiles = 25) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || apiKey.startsWith('your_')) return [];
  const radiusMeters = Math.min(radiusMiles * 1609.34, 50000);
  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', {
      params: { location: `${lat},${lng}`, radius: radiusMeters, keyword: 'data center colocation', key: apiKey },
      timeout: 8000,
    });
    return (response.data.results || []).slice(0, 10).map(p => ({
      name: p.name,
      lat: p.geometry.location.lat,
      lng: p.geometry.location.lng,
      source: 'google_places',
      distanceMiles: haversineDistance(lat, lng, p.geometry.location.lat, p.geometry.location.lng),
    }));
  } catch {
    return [];
  }
}

function checkHyperscalerProximity(lat, lng) {
  return KNOWN_HYPERSCALER_MARKETS
    .map(cluster => ({ ...cluster, distanceMiles: haversineDistance(lat, lng, cluster.lat, cluster.lng) }))
    .filter(c => c.distanceMiles < 50)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}

function generateCompetitiveNarrative(saturation, count15mi, inHyperscaler, clusters) {
  if (saturation === 'oversaturated') {
    return `There are ${count15mi} data centers within 15 miles — an oversaturated market. Colocation rates are compressed 25–35% below national averages. Power grid capacity is under heavy competition, increasing utility connection timelines. Infrastructure (fiber, power) is proven, but financial returns are structurally challenged.`;
  }
  if (saturation === 'competitive') {
    return `With ${count15mi} data centers within 15 miles, this is an established but not oversupplied DC market. Colocation rates face moderate downward pressure (~10% below peak), but existing fiber and power infrastructure reduces buildout risk.`;
  }
  if (saturation === 'emerging') {
    return `${count15mi > 0 ? `${count15mi} data center(s) within 15 miles signal early infrastructure development` : 'Few or no data centers within 15 miles'}. This emerging market offers favorable colocation rates and growing demand — ideal entry timing with manageable infrastructure investment.`;
  }
  return `This address is in an underserved market with minimal DC competition. Premium colocation rates are achievable (15–25% above national average), but demand validation is critical — underserved markets carry higher occupancy ramp risk.`;
}

async function analyzeDCCompetitiveLandscape(lat, lng) {
  const [osmResult, placesResult] = await Promise.allSettled([
    getNearbyDCsFromOSM(lat, lng, 25),
    getNearbyDCsFromPlaces(lat, lng, 25),
  ]);

  const osmDCs = osmResult.status === 'fulfilled' ? osmResult.value : [];
  const placeDCs = placesResult.status === 'fulfilled' ? placesResult.value : [];

  // Deduplicate: within 0.3 miles = same facility
  const allDCs = [...osmDCs];
  for (const p of placeDCs) {
    const isDuplicate = allDCs.some(o => o.lat && haversineDistance(o.lat, o.lng, p.lat, p.lng) < 0.3);
    if (!isDuplicate) allDCs.push(p);
  }

  const within5Miles = allDCs.filter(dc => dc.distanceMiles <= 5).length;
  const within15Miles = allDCs.filter(dc => dc.distanceMiles <= 15).length;
  const within25Miles = allDCs.filter(dc => dc.distanceMiles <= 25).length;
  const hyperscalerClusters = checkHyperscalerProximity(lat, lng);
  const inHyperscalerMarket = hyperscalerClusters.length > 0 && hyperscalerClusters[0].distanceMiles < 30;

  const saturationLevel = within15Miles >= 10 ? 'oversaturated'
    : within15Miles >= 5 ? 'competitive'
    : within15Miles >= 2 ? 'emerging'
    : 'underserved';

  const coloRateMultiplier = saturationLevel === 'oversaturated' ? 0.72
    : saturationLevel === 'competitive' ? 0.90
    : saturationLevel === 'emerging' ? 1.00
    : 1.18;

  // DC score additive modifier: being near many DCs means infrastructure but rate compression
  const marketSaturationDCScoreEffect = saturationLevel === 'oversaturated' ? -15
    : saturationLevel === 'competitive' ? -5
    : saturationLevel === 'emerging' ? +5
    : +3;

  // Fiber infrastructure bonus from existing DC cluster
  const fiberInfrastructureBonus = (inHyperscalerMarket || within15Miles >= 3) ? 2 : 0;

  console.log(`   🏢 DC Landscape: ${within15Miles} DCs within 15mi, ${saturationLevel}, rate mult ${coloRateMultiplier}`);

  return {
    nearbyDCs: allDCs.sort((a, b) => a.distanceMiles - b.distanceMiles).slice(0, 20),
    counts: { within5Miles, within15Miles, within25Miles },
    saturationLevel,
    coloRateMultiplier,
    fiberInfrastructureBonus,
    marketSaturationDCScoreEffect,
    hyperscalerClusters,
    inHyperscalerMarket,
    narrative: generateCompetitiveNarrative(saturationLevel, within15Miles, inHyperscalerMarket, hyperscalerClusters),
  };
}

module.exports = { analyzeDCCompetitiveLandscape, checkHyperscalerProximity };
