const { loadPeeringDB } = require('./peeringdb');

/**
 * Initialize startup caches.
 * 
 * Note: Substations are now queried at runtime via Overpass API (no pre-load).
 * FEMA NRI now uses USGS seismic + state risk table (no CSV download).
 * Only PeeringDB IXPs are pre-cached at startup.
 */
async function initializeCache() {
  console.log('📦 Loading PeeringDB IXP list...');
  const results = await Promise.allSettled([
    loadPeeringDB(),
  ]);

  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.warn(`⚠️  PeeringDB cache failed:`, result.reason?.message);
    }
  });

  const successes = results.filter(r => r.status === 'fulfilled').length;
  console.log(`📦 Startup cache: ${successes}/${results.length} pre-loaded`);
}

module.exports = { initializeCache };
