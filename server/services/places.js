const axios = require('axios');

const RETAIL_DISQUALIFIER = new Set([
  'shopping_mall', 'grocery_store', 'supermarket', 'department_store',
  'clothing_store', 'home_goods_store', 'furniture_store', 'convenience_store',
  'hardware_store', 'warehouse_store', 'pharmacy', 'drugstore',
]);

const HOSPITALITY_DISQUALIFIER = new Set([
  'restaurant', 'food', 'hotel', 'lodging', 'bar', 'cafe', 'bakery',
  'meal_takeaway', 'meal_delivery',
]);

const DC_FAVORABLE = new Set([
  'storage', 'warehouse', 'office', 'industrial', 'logistics',
  'moving_company', 'self_storage', 'light_industrial',
  // Places API v1 types
  'office_building', 'corporate_office', 'government_office',
  'premise', 'establishment', 'business_park',
]);

const SOLAR_FAVORABLE = new Set([
  'retail', 'manufacturing', 'factory', 'distribution_center',
  'car_dealer', 'car_repair', 'auto_parts_store',
]);

/**
 * Classifies a building type using Google Places API
 */
async function getBuildingType(address, lat, lng) {
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return buildEstimate(address);
  }

  try {
    // Use Places Text Search v1 (new Places API)
    const response = await axios.post(
      'https://places.googleapis.com/v1/places:searchText',
      {
        textQuery: address,
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: 500,
          },
        },
        maxResultCount: 1,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': 'places.displayName,places.types,places.primaryType,places.formattedAddress',
        },
        timeout: 10000,
      }
    );

    const place = response.data?.places?.[0];
    if (!place) return buildEstimate(address);

    const primaryType = place.primaryType || '';
    const types = place.types || [];
    const displayName = place.displayName?.text || '';

    return classifyBuilding(primaryType, types, displayName);
  } catch (err) {
    console.warn('Google Places fetch failed:', err.message);
    return buildEstimate(address);
  }
}

function classifyBuilding(primaryType, types, displayName) {
  const allTypes = [primaryType, ...types].map(t => t.toLowerCase());

  // Check disqualifiers first
  const retailMatch = allTypes.find(t => RETAIL_DISQUALIFIER.has(t));
  const hospMatch = allTypes.find(t => HOSPITALITY_DISQUALIFIER.has(t));

  if (retailMatch || hospMatch) {
    const matchedType = retailMatch || hospMatch;
    const isHospitality = !!hospMatch;
    return {
      score: 2,
      rawValue: `${displayName || primaryType} (${primaryType})`,
      primaryType,
      types: allTypes,
      classification: isHospitality ? 'HOSPITALITY_DISQUALIFIER' : 'RETAIL_DISQUALIFIER',
      isDisqualifier: true,
      dcFavorable: false,
      solarRoofScore: 4, // retail has large roofs, decent for solar
      interpretation: `${isHospitality ? 'Hospitality' : 'Retail'} building — unsuitable for data center operations`,
    };
  }

  const dcMatch = allTypes.find(t => DC_FAVORABLE.has(t));
  if (dcMatch) {
    // "premise" and "establishment" are generic; score slightly lower than true industrial
    const isGeneric = dcMatch === 'premise' || dcMatch === 'establishment';
    return {
      score: isGeneric ? 6 : 9,
      rawValue: `${displayName || primaryType} (${primaryType})`,
      primaryType,
      types: allTypes,
      classification: 'DC_FAVORABLE',
      isDisqualifier: false,
      dcFavorable: true,
      solarRoofScore: 7,
      interpretation: isGeneric
        ? `Commercial/office premises — potentially suitable for edge data center`
        : 'Industrial/warehouse/office — well-suited for edge data center',
    };
  }

  const solarMatch = allTypes.find(t => SOLAR_FAVORABLE.has(t));
  if (solarMatch) {
    return {
      score: 6,
      rawValue: `${displayName || primaryType} (${primaryType})`,
      primaryType,
      types: allTypes,
      classification: 'SOLAR_FAVORABLE',
      isDisqualifier: false,
      dcFavorable: false,
      solarRoofScore: 8,
      interpretation: 'Large-roof commercial building — excellent solar candidate',
    };
  }

  // Generic commercial building
  return {
    score: 5,
    rawValue: `${displayName || primaryType || 'Commercial building'} (${primaryType || 'unknown'})`,
    primaryType,
    types: allTypes,
    classification: 'NEUTRAL',
    isDisqualifier: false,
    dcFavorable: false,
    solarRoofScore: 6,
    interpretation: 'Commercial building — moderate suitability for either use case',
  };
}

function buildEstimate(address) {
  const lower = address.toLowerCase();
  const isIndustrial = /warehouse|industrial|distribution|logistics|storage|manufacturing|factory|campus|office|corporate|tech|data.?center/.test(lower);
  const isRetail = /mall|plaza|market|shop|store|restaurant|hotel|cafe|bar|grocery/.test(lower);

  if (isIndustrial) {
    return classifyBuilding('warehouse', ['warehouse', 'storage'], address);
  } else if (isRetail) {
    return classifyBuilding('shopping_mall', ['shopping_mall'], address);
  }

  return {
    score: 5,
    rawValue: 'Building type estimated (Places API not configured)',
    primaryType: 'unknown',
    types: [],
    classification: 'NEUTRAL',
    isDisqualifier: false,
    dcFavorable: false,
    solarRoofScore: 6,
    interpretation: 'Building type unknown — using neutral estimate',
    error: true,
  };
}

module.exports = { getBuildingType };
