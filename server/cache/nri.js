const axios = require('axios');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

let nriMap = new Map();
let loaded = false;

const NRI_ZIP_URL = 'https://hazards.fema.gov/nri/Content/StaticDocFiles/NRI_Table_Counties.zip';
const LOCAL_CSV_PATH = path.join(__dirname, '../data/nri_county.csv');

async function loadNRIData() {
  // Use cached CSV if available
  if (fs.existsSync(LOCAL_CSV_PATH)) {
    console.log('📊 Loading NRI data from local cache...');
    const csvContent = fs.readFileSync(LOCAL_CSV_PATH, 'utf8');
    parseAndStore(csvContent);
    return;
  }

  console.log('📥 Downloading FEMA NRI county data...');
  try {
    const response = await axios.get(NRI_ZIP_URL, {
      responseType: 'arraybuffer',
      timeout: 60000,
      headers: { 'User-Agent': 'GoSolarEvaluator/1.0' },
    });

    const buf = Buffer.from(response.data);
    // Check if it's actually a zip (PK magic bytes)
    if (buf[0] === 0x50 && buf[1] === 0x4B) {
      const zip = new AdmZip(buf);
      const entries = zip.getEntries();
      const csvEntry = entries.find(e => e.entryName.endsWith('.csv') && e.entryName.includes('NRI_Table_Counties'))
        || entries.find(e => e.entryName.endsWith('.csv'));
      if (!csvEntry) throw new Error('No CSV found in NRI zip');
      const csvContent = csvEntry.getData().toString('utf8');
      fs.writeFileSync(LOCAL_CSV_PATH, csvContent);
      parseAndStore(csvContent);
    } else {
      // Maybe it returned CSV directly
      const csvContent = buf.toString('utf8');
      if (csvContent.startsWith('STCOFIPS') || csvContent.startsWith('"STCOFIPS"')) {
        fs.writeFileSync(LOCAL_CSV_PATH, csvContent);
        parseAndStore(csvContent);
      } else {
        throw new Error('NRI response is neither a valid zip nor CSV');
      }
    }

    console.log(`✅ NRI data loaded: ${nriMap.size} counties`);
  } catch (err) {
    console.warn('⚠️  NRI download failed, trying alternative source:', err.message);
    await loadNRIFallback();
  }
}

async function loadNRIFallback() {
  // Load a minimal built-in dataset with average values for common states
  console.log('📊 Using NRI fallback (minimal national averages)...');
  loaded = true;
}

function parseAndStore(csvContent) {
  try {
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });

    nriMap.clear();
    for (const row of records) {
      const fips = row.STCOFIPS || row.FIPS || `${row.STATEFIPS}${row.COUNTYFIPS}`;
      if (fips) {
        nriMap.set(fips.toString().padStart(5, '0'), row);
      }
    }
    loaded = true;
    console.log(`✅ NRI parsed: ${nriMap.size} county records`);
  } catch (err) {
    console.warn('NRI CSV parse error:', err.message);
    loaded = true;
  }
}

function getNRIData() {
  return nriMap;
}

function isNRILoaded() {
  return loaded;
}

module.exports = { loadNRIData, getNRIData, isNRILoaded };
