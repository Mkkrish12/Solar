/**
 * Multi-year rooftop spectral comparison using Sentinel-2 L2A (true-color COGs)
 * via Element84 Earth Search STAC — no API key required.
 *
 * For each of the last four calendar years, picks the lowest-cloud summer scene (Jun–Aug),
 * reads a small ~60m window at the geocode, and compares mean RGB across years.
 * Large year-to-year RGB distance suggests surface change (possible reroof, coating, or
 * vegetation) — not definitive proof of roof replacement (shadows, season, BRDF differ).
 */

const axios = require('axios');
const GeoTIFF = require('geotiff');
const proj4 = require('proj4');

const EARTH_SEARCH = 'https://earth-search.aws.element84.com/v1/search';
/** ~60m at Sentinel-2 10m res (TCI) */
const WINDOW_PX = 6;
const STAC_TIMEOUT_MS = 22000;
const COG_TIMEOUT_MS = 28000;

function withTimeout(promise, ms, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, rej) => {
      setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

function epsgFromGeoKeys(gk) {
  if (!gk?.ProjectedCSTypeGeoKey) return null;
  return `EPSG:${gk.ProjectedCSTypeGeoKey}`;
}

/**
 * Mean RGB in projected CRS window around (lat,lng) using True Color Image COG.
 */
async function extractMeanRgb(visualUrl, lat, lng) {
  return withTimeout((async () => {
    const tiff = await GeoTIFF.fromUrl(visualUrl);
    const image = await tiff.getImage();
    const gk = image.getGeoKeys();
    const epsg = epsgFromGeoKeys(gk);
    if (!epsg) throw new Error('GeoTIFF missing projected CRS');

    const [e, n] = proj4('EPSG:4326', epsg, [lng, lat]);
    const o = image.getOrigin();
    const r = image.getResolution();
    const I = (e - o[0]) / r[0];
    const J = (n - o[1]) / r[1];

    const w = WINDOW_PX;
    const x0 = Math.max(0, Math.floor(I - w / 2));
    const y0 = Math.max(0, Math.floor(J - w / 2));
    const x1 = Math.min(image.getWidth(), x0 + w);
    const y1 = Math.min(image.getHeight(), y0 + w);
    if (x1 <= x0 || y1 <= y0) throw new Error('Point outside image extent');

    const data = await image.readRasters({ window: [x0, y0, x1, y1], samples: [0, 1, 2] });
    const npx = (x1 - x0) * (y1 - y0);
    let sr = 0;
    let sg = 0;
    let sb = 0;
    for (let i = 0; i < npx; i++) {
      sr += data[0][i];
      sg += data[1][i];
      sb += data[2][i];
    }
    return {
      meanR: sr / npx,
      meanG: sg / npx,
      meanB: sb / npx,
      windowMetersApprox: w * 10,
    };
  })(), COG_TIMEOUT_MS, 'COG read');
}

function maxConsecutiveRgbDistance(samplesChrono) {
  let max = 0;
  for (let i = 1; i < samplesChrono.length; i++) {
    const a = samplesChrono[i - 1];
    const b = samplesChrono[i];
    const dr = b.meanR - a.meanR;
    const dg = b.meanG - a.meanG;
    const db = b.meanB - a.meanB;
    max = Math.max(max, Math.sqrt(dr * dr + dg * dg + db * db));
  }
  return max;
}

function significanceFromDelta(delta) {
  if (delta >= 28) return 'high';
  if (delta >= 18) return 'medium';
  return 'low';
}

/**
 * @returns {Promise<object>} comparison result for roof-age scoring UI
 */
async function getFourYearRoofImageryComparison(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { available: false, reason: 'invalid coordinates' };
  }

  // Use the last four calendar years that have a complete Jun–Aug window in STAC.
  // Before August, the current year's summer pass may not exist yet — shift end year back.
  let endYear = new Date().getUTCFullYear();
  const month = new Date().getUTCMonth();
  if (month < 7) endYear -= 1;
  const startYear = endYear - 3;
  const targetYears = [startYear, startYear + 1, startYear + 2, endYear];

  try {
    // One STAC search per year (summer window) — a single wide search often returns only
    // the newest 100 granules and misses older years.
    const searchYear = async (year) => {
      const body = {
        collections: ['sentinel-2-l2a'],
        intersects: { type: 'Point', coordinates: [lng, lat] },
        datetime: `${year}-06-01T00:00:00Z/${year}-08-31T23:59:59Z`,
        limit: 15,
        query: { 'eo:cloud_cover': { lt: 40 } },
      };
      const r = await axios.post(EARTH_SEARCH, body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: STAC_TIMEOUT_MS,
        validateStatus: (s) => s < 500,
      });
      if (r.status !== 200 || !r.data?.features?.length) return null;
      const sorted = [...r.data.features].sort(
        (a, b) => (a.properties['eo:cloud_cover'] ?? 99) - (b.properties['eo:cloud_cover'] ?? 99),
      );
      return sorted[0];
    };

    const yearFeatures = await withTimeout(
      Promise.all(targetYears.map((y) => searchYear(y))),
      STAC_TIMEOUT_MS * 2,
      'STAC per-year search',
    );

    const byYear = {};
    targetYears.forEach((y, i) => {
      const f = yearFeatures[i];
      if (f) {
        byYear[y] = { feature: f, cloud: f.properties['eo:cloud_cover'] ?? 0 };
      }
    });

    const yearsWithData = targetYears.filter((y) => byYear[y]);

    if (yearsWithData.length < 2) {
      return {
        available: false,
        reason: 'insufficient_years',
        detail: `Need ≥2 clear years; found ${yearsWithData.length} (${yearsWithData.join(', ') || 'none'})`,
        targetYears,
      };
    }

    const sortedYears = [...yearsWithData].sort((a, b) => a - b);
    const settled = await Promise.allSettled(
      sortedYears.map(async (y) => {
        const href = byYear[y].feature.assets?.visual?.href;
        if (!href) throw new Error(`no visual asset for ${y}`);
        const rgb = await extractMeanRgb(href, lat, lng);
        return {
          year: y,
          cloudCover: byYear[y].cloud,
          meanR: Math.round(rgb.meanR * 10) / 10,
          meanG: Math.round(rgb.meanG * 10) / 10,
          meanB: Math.round(rgb.meanB * 10) / 10,
          datetime: byYear[y].feature.properties?.datetime,
        };
      }),
    );

    const yearSamples = [];
    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') yearSamples.push(s.value);
      else console.warn(`   ⚠️ Sentinel TCI read failed for ${sortedYears[i]}:`, s.reason?.message || s.reason);
    });

    if (yearSamples.length < 2) {
      return {
        available: false,
        reason: 'cog_read_failures',
        detail: 'Could not read enough yearly COG windows',
        targetYears,
      };
    }

    const delta = maxConsecutiveRgbDistance(yearSamples);
    const sig = significanceFromDelta(delta);

    let interpretation = 'Stable roof appearance across years (spectral)';
    if (sig === 'high') {
      interpretation = 'Strong year-to-year color change — possible reroof, coating, or major surface change (Sentinel-2)';
    } else if (sig === 'medium') {
      interpretation = 'Moderate spectral change — worth a physical roof inspection';
    }

    return {
      available: true,
      source: 'Sentinel-2 L2A · Element84 Earth Search STAC (no key)',
      windowMetersApprox: WINDOW_PX * 10,
      targetYears,
      years: yearSamples,
      maxConsecutiveRgbDelta: Math.round(delta * 100) / 100,
      changeSignificance: sig,
      interpretation,
    };
  } catch (err) {
    console.warn('   ⚠️ Multi-year roof imagery:', err.message);
    return { available: false, reason: 'error', detail: err.message };
  }
}

module.exports = { getFourYearRoofImageryComparison };
