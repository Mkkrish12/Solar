const axios = require('axios');

/**
 * Geocodes an address to lat/lng + Census FIPS codes
 */
async function geocodeAddress(address) {
  let lat, lng, formattedAddress, city, state, zip, county;

  // Try Google Geocoding first
  if (process.env.GOOGLE_GEOCODING_API_KEY) {
    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: { address, key: process.env.GOOGLE_GEOCODING_API_KEY },
        timeout: 8000,
      });
      const result = response.data.results?.[0];
      if (!result || response.data.status !== 'OK') {
        throw new Error(`Google Geocoding status: ${response.data.status}`);
      }

      lat = result.geometry.location.lat;
      lng = result.geometry.location.lng;
      formattedAddress = result.formatted_address;

      const components = result.address_components;
      city = components.find(c => c.types.includes('locality'))?.long_name || '';
      state = components.find(c => c.types.includes('administrative_area_level_1'))?.short_name || '';
      zip = components.find(c => c.types.includes('postal_code'))?.long_name || '';
      county = components.find(c => c.types.includes('administrative_area_level_2'))?.long_name?.replace(' County', '') || '';
      console.log('✅ Google Geocoding succeeded:', formattedAddress);
    } catch (err) {
      console.warn('Google Geocoding failed, falling back to Nominatim:', err.message);
    }
  }

  // Fallback: OpenStreetMap Nominatim
  if (!lat) {
    try {
      const nomResp = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: { q: address, format: 'json', addressdetails: 1, limit: 1 },
        headers: { 'User-Agent': 'GoSolarEvaluator/1.0' },
        timeout: 8000,
      });
      const nom = nomResp.data?.[0];
      if (!nom) throw new Error(`No Nominatim results for: ${address}`);

      lat = parseFloat(nom.lat);
      lng = parseFloat(nom.lon);
      formattedAddress = nom.display_name;
      city = nom.address?.city || nom.address?.town || nom.address?.village || '';
      state = getStateAbbr(nom.address?.state || '');
      zip = nom.address?.postcode || '';
      county = nom.address?.county?.replace(' County', '') || '';
      console.log('✅ Nominatim geocoding succeeded:', formattedAddress);
    } catch (err) {
      throw new Error(`Geocoding failed: ${err.message}`);
    }
  }

  if (!lat || !lng) throw new Error('Could not determine coordinates for address');

  // Census block/FIPS lookup using lat/lng
  let stateFIPS = '', countyFIPS = '', fullFIPS = '';
  try {
    const censusResp = await axios.get(
      'https://geocoding.geo.census.gov/geocoder/geographies/coordinates',
      {
        params: {
          x: lng,
          y: lat,
          benchmark: 'Public_AR_Current',
          vintage: 'Current_Current',
          format: 'json',
        },
        timeout: 10000,
      }
    );

    const geos = censusResp.data?.result?.geographies;

    // Counties geography is most reliable
    const countyGeo = geos?.['Counties']?.[0];
    if (countyGeo) {
      stateFIPS = countyGeo.STATE || '';
      countyFIPS = countyGeo.COUNTY || '';
      fullFIPS = stateFIPS && countyFIPS ? `${stateFIPS}${countyFIPS}` : '';
      if (!county && countyGeo.NAME) {
        county = countyGeo.NAME.replace(' County', '').replace(' Parish', '');
      }
    }

    // Tracts geography as backup for state FIPS
    if (!stateFIPS) {
      const tractGeo = geos?.['Census Tracts']?.[0];
      if (tractGeo) {
        stateFIPS = tractGeo.STATE || '';
        countyFIPS = tractGeo.COUNTY || '';
        fullFIPS = stateFIPS && countyFIPS ? `${stateFIPS}${countyFIPS}` : '';
      }
    }

    if (fullFIPS) {
      console.log(`✅ Census FIPS: state=${stateFIPS} county=${countyFIPS} (${county || 'unknown'})`);
    } else {
      console.warn('⚠️  Census FIPS not found, some scoring will use estimates');
    }
  } catch (err) {
    console.warn('Census geocoder failed:', err.message);
  }

  return {
    lat,
    lng,
    formattedAddress: formattedAddress || address,
    city,
    state,
    zip,
    county,
    stateFIPS,
    countyFIPS,
    fullFIPS,
  };
}

/** Convert full state name to 2-letter abbreviation */
const STATE_ABBR = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
  'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
  'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
  'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
  'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO',
  'Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ',
  'New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH',
  'Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
  'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
  'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
  'District of Columbia':'DC',
};

function getStateAbbr(fullName) {
  if (!fullName) return '';
  if (fullName.length === 2) return fullName.toUpperCase();
  return STATE_ABBR[fullName] || fullName.substring(0, 2).toUpperCase();
}

module.exports = { geocodeAddress };
