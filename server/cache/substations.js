const axios = require('axios');
const fs = require('fs');
const path = require('path');

let substationList = [];
let loaded = false;

// HIFLD Electric Substations — use ArcGIS REST API with pagination
const HIFLD_URL =
  'https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Substations/FeatureServer/0/query';
const LOCAL_PATH = path.join(__dirname, '../data/substations.json');

async function loadSubstations() {
  if (fs.existsSync(LOCAL_PATH)) {
    try {
      const raw = fs.readFileSync(LOCAL_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      substationList = parsed;
      loaded = true;
      console.log(`✅ Substations loaded from cache: ${substationList.length} records`);
      return;
    } catch (err) {
      console.warn('Substation cache read failed:', err.message);
    }
  }

  console.log('📥 Downloading HIFLD substation data (this may take a moment)...');
  try {
    const allSubstations = [];
    let offset = 0;
    const pageSize = 2000;
    let hasMore = true;

    while (hasMore && allSubstations.length < 80000) {
      const response = await axios.get(HIFLD_URL, {
        params: {
          where: '1=1',
          outFields: 'NAME,LATITUDE,LONGITUDE,MAX_VOLT,STATE,SUBST_NAME',
          f: 'json',
          resultOffset: offset,
          resultRecordCount: pageSize,
          returnGeometry: true,
          outSR: 4326,
        },
        timeout: 30000,
      });

      const features = response.data?.features || [];
      for (const f of features) {
        const a = f.attributes || {};
        // Try attributes first, then geometry
        const lat = a.LATITUDE || a.Y || f.geometry?.y;
        const lng = a.LONGITUDE || a.X || f.geometry?.x;
        if (lat && lng) {
          allSubstations.push({
            name: a.NAME || a.SUBST_NAME || a.name || 'Unknown',
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            voltage: a.MAX_VOLT || a.VOLTAGE || '',
            state: a.STATE || a.STPOSTAL || '',
          });
        }
      }

      if (features.length < pageSize) {
        hasMore = false;
      } else {
        offset += pageSize;
      }
    }

    substationList = allSubstations;
    loaded = true;

    // Save to disk
    fs.writeFileSync(LOCAL_PATH, JSON.stringify(allSubstations));
    console.log(`✅ Substations downloaded and cached: ${substationList.length} records`);
  } catch (err) {
    console.warn('⚠️  Substation download failed:', err.message);
    console.log('Using empty substation list — power scores will be estimated');
    loaded = true;
  }
}

function getSubstations() {
  return substationList;
}

function isSubstationsLoaded() {
  return loaded;
}

module.exports = { loadSubstations, getSubstations, isSubstationsLoaded };
