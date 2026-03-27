const axios = require('axios');
async function test() {
  // Overpass API - find substations near Mountain View CA
  const lat = 37.4225, lng = -122.0856;
  const delta = 0.5; // ~35 miles bounding box
  
  const query = '[out:json][timeout:15];node["power"="substation"]('+
    (lat-delta)+','+( lng-delta)+','+(lat+delta)+','+(lng+delta)+');out body 5;';
  
  const r = await axios.post('https://overpass-api.de/api/interpreter', query, {
    headers: {'Content-Type': 'text/plain'},
    timeout: 15000
  });
  
  console.log('Overpass features:', r.data.elements?.length);
  if (r.data.elements?.[0]) {
    console.log('First:', JSON.stringify(r.data.elements[0]));
  }
}
test().catch(console.error);
