const axios = require('axios');

let ixpList = [];
let loaded = false;
let lastFetch = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function loadPeeringDB() {
  const now = Date.now();
  if (loaded && (now - lastFetch) < CACHE_TTL) return;

  console.log('📥 Fetching PeeringDB IXP data...');
  try {
    const response = await axios.get('https://www.peeringdb.com/api/ix', {
      params: { format: 'json' },
      headers: { 'User-Agent': 'GoSolarEvaluator/1.0' },
      timeout: 15000,
    });

    const data = response.data?.data || response.data || [];

    ixpList = data
      .filter(ix => ix.city && (ix.latitude || ix.lat_long))
      .map(ix => {
        // PeeringDB uses lat_long or separate fields
        let lat, lng;
        if (ix.latitude && ix.longitude) {
          lat = parseFloat(ix.latitude);
          lng = parseFloat(ix.longitude);
        } else if (ix.lat_long) {
          const parts = ix.lat_long.split(',');
          lat = parseFloat(parts[0]);
          lng = parseFloat(parts[1]);
        }
        return {
          id: ix.id,
          name: ix.name,
          city: ix.city,
          country: ix.country,
          lat,
          lng,
        };
      })
      .filter(ix => ix.lat && ix.lng && !isNaN(ix.lat) && !isNaN(ix.lng));

    // If we got 0 with lat filtering, try the facility endpoint instead
    if (ixpList.length === 0) {
      console.warn('PeeringDB IX has no lat/lng data, using hardcoded fallback');
      ixpList = getMajorUSIXPs();
    }

    loaded = true;
    lastFetch = now;
    console.log(`✅ PeeringDB IXPs loaded: ${ixpList.length} exchange points`);
  } catch (err) {
    console.warn('⚠️  PeeringDB fetch failed:', err.message);
    // Use a minimal fallback with major US IXPs
    ixpList = getMajorUSIXPs();
    loaded = true;
    lastFetch = now;
    console.log(`Using ${ixpList.length} hardcoded major US IXPs as fallback`);
  }
}

function getMajorUSIXPs() {
  return [
    { name: 'Equinix New York (NYIIX)', city: 'New York', lat: 40.7128, lng: -74.006 },
    { name: 'Any2 Los Angeles', city: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
    { name: 'LINX Chicago', city: 'Chicago', lat: 41.8781, lng: -87.6298 },
    { name: 'NOTA - Equinix Dallas', city: 'Dallas', lat: 32.7767, lng: -96.797 },
    { name: 'SIX Seattle', city: 'Seattle', lat: 47.6062, lng: -122.3321 },
    { name: 'AMSIX/Equinix San Jose', city: 'San Jose', lat: 37.3382, lng: -121.8863 },
    { name: 'Equinix Ashburn (DCINC)', city: 'Ashburn', lat: 39.0458, lng: -77.4874 },
    { name: 'TorIX Atlanta', city: 'Atlanta', lat: 33.749, lng: -84.388 },
    { name: 'MICE Miami', city: 'Miami', lat: 25.7617, lng: -80.1918 },
    { name: 'IX Boston', city: 'Boston', lat: 42.3601, lng: -71.0589 },
    { name: 'Any2 Denver', city: 'Denver', lat: 39.7392, lng: -104.9903 },
    { name: 'Phoenix IX', city: 'Phoenix', lat: 33.4484, lng: -112.074 },
  ];
}

function getIXPs() {
  return ixpList;
}

function isIXPsLoaded() {
  return loaded;
}

module.exports = { loadPeeringDB, getIXPs, isIXPsLoaded };
