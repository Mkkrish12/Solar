const axios = require('axios');
async function test() {
  // FEMA Disasters
  try {
    const r = await axios.get('https://www.fema.gov/api/open/v2/disasterDeclarations', {
      params: { '': 3, '': "state eq 'CA'", '': 'disasterNumber,declarationDate,state' },
      timeout: 15000
    });
    console.log('FEMA Disasters OK:', r.data.DisasterDeclarations?.length, 'records');
  } catch(e) { console.log('FEMA Disasters FAIL:', e.message); }

  // HIFLD substations via opendata
  const hifldUrls = [
    'https://opendata.arcgis.com/datasets/db18e1ded2a848b7a3a1f808fb4bbe7d_0.geojson',
    'https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Substations_1/FeatureServer/0/query?where=STATE+%3D+%27CA%27&outFields=NAME,LATITUDE,LONGITUDE,MAX_VOLT&f=json&resultRecordCount=2',
    'https://gis.energy.gov/nlpui/rest/services/Hosted/Electric_Substations/FeatureServer/0/query?where=1%3D1&outFields=NAME,LATITUDE,LONGITUDE,MAX_VOLT&f=json&resultRecordCount=2'
  ];
  for (const url of hifldUrls) {
    try {
      const r = await axios.get(url, { timeout: 10000 });
      const count = r.data?.features?.length ?? Object.keys(r.data).length;
      console.log('HIFLD URL OK:', url.substring(0, 70), '| features/keys:', count);
      if (r.data?.features?.length > 0) console.log('  First:', JSON.stringify(r.data.features[0].attributes));
      break;
    } catch(e) { console.log('HIFLD FAIL:', url.substring(0, 60), '|', e.message.substring(0,50)); }
  }
}
test();
