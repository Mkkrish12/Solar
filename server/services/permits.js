const axios = require('axios');

/**
 * Building permit records via Socrata Open Data API
 * Coverage: 8 major US cities. Falls back gracefully when city not covered.
 *
 * Source: City government open data portals (Socrata standard)
 * No API key required for read access.
 */

// Socrata dataset endpoints by "City, STATE" key
const PERMIT_APIS = {
  'New York, NY':      { url: 'https://data.cityofnewyork.us/resource/ipu4-2q9a.json', addressField: 'house__' },
  'Chicago, IL':       { url: 'https://data.cityofchicago.org/resource/ydr8-5enu.json', addressField: 'street_number' },
  'Los Angeles, CA':   { url: 'https://data.lacity.org/resource/nbyu-2ha3.json', addressField: 'address' },
  'Seattle, WA':       { url: 'https://data.seattle.gov/resource/xt3v-nkmd.json', addressField: 'address' },
  'Austin, TX':        { url: 'https://data.austintexas.gov/resource/3syk-w9eu.json', addressField: 'address_1' },
  'San Francisco, CA': { url: 'https://data.sfgov.org/resource/p4e4-a99a.json', addressField: 'address' },
  'Boston, MA':        { url: 'https://data.boston.gov/api/3/action/datastore_search.json', addressField: 'address' },
  'Denver, CO':        { url: 'https://data.denvergov.org/resource/zfh3-6zim.json', addressField: 'address' },
};

async function getBuildingPermits(address, city, state) {
  const cityKey = `${city}, ${state}`;
  const apiConfig = PERMIT_APIS[cityKey];

  if (!apiConfig) {
    return { available: false, reason: `No permit API for ${cityKey}` };
  }

  try {
    // Extract street number + name from address for partial match
    const streetPart = address.split(',')[0].trim().toUpperCase();

    const response = await axios.get(apiConfig.url, {
      params: {
        $limit: 25,
        $order: 'issued_date DESC',
        $where: `upper(address) like '%25${encodeURIComponent(streetPart)}%25'`,
      },
      timeout: 8000,
    });

    const permits = response.data;
    if (!Array.isArray(permits)) return { available: false, reason: 'Invalid response format' };

    console.log(`   🏗️ Permits: found ${permits.length} permits for ${streetPart} in ${cityKey}`);
    return { available: true, permits, city: cityKey };
  } catch (err) {
    console.warn(`   ⚠️ Permits API for ${cityKey}: ${err.message}`);
    return { available: false, reason: err.message };
  }
}

module.exports = { getBuildingPermits };
