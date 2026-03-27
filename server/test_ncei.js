const axios = require('axios');
async function test() {
  const r = await axios.get('https://earthquake.usgs.gov/ws/designmaps/asce7-22.json', {
    params: { latitude: 37.4225, longitude: -122.0856, riskCategory: 'II', siteClass: 'C', title: 'test' },
    timeout: 10000
  });
  const d = r.data?.response?.data;
  if (d) {
    console.log('PGA (peak ground accel):', d.pga);
    console.log('PGV:', d.pgv);
    console.log('Ss (short period):', d.ss);
    console.log('S1 (1-sec period):', d.s1);
  }
  console.log('Full data keys:', JSON.stringify(Object.keys(r.data?.response?.data || {})));

  // Also test FEMA disaster - try v2 with no filter at all
  try {
    const r2 = await axios.get('https://www.fema.gov/api/open/v2/disasterDeclarations', {
      params: { '': 2, '': 'disasterNumber,state,declarationDate', '': 'declarationDate desc' },
      timeout: 30000,
      headers: { 'Accept': 'application/json', 'User-Agent': 'GoSolarApp/1.0' }
    });
    console.log('FEMA:', r2.status, JSON.stringify(r2.data).substring(0,300));
  } catch(e) { console.log('FEMA fail status:', e.response?.status); }
}
test().catch(console.error);
