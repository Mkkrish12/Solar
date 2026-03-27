const axios = require('axios');

// In-memory cache — Cloudflare data is US-wide, no need to re-fetch per address
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * States with consistently below-average latency (major internet hubs)
 * Adjustment applied to the national score — positive = better than US avg
 */
const STATE_LATENCY_ADJUSTMENT = {
  // Major west coast hubs
  CA: +1.0, WA: +0.8, OR: +0.5,
  // Major east coast hubs
  NY: +1.0, NJ: +0.8, VA: +0.8, MA: +0.7, DC: +0.9,
  // Central hubs
  TX: +0.5, IL: +0.6, GA: +0.4, FL: +0.3,
  // Smaller markets / rural — slightly below average
  MT: -0.5, ND: -0.5, SD: -0.5, WY: -0.5,
  AK: -1.5, HI: -1.0,
};

/**
 * Fetch Cloudflare Radar internet quality metrics (US-wide, cached 1hr)
 * Blends speed test latency + IQI (Internet Quality Index) P50
 *
 * For a data center: lower latency + lower jitter + lower packet loss = better DC location
 * These metrics reflect what end users accessing the DC would actually experience
 */
async function getNetworkQuality(state) {
  const apiKey = process.env.CLOUDFLARE_RADAR_API_KEY;

  if (!apiKey || apiKey.startsWith('your_')) {
    return buildFallback('Cloudflare Radar API key not configured');
  }

  // Return cached result if fresh
  if (_cache && (Date.now() - _cacheTime) < CACHE_TTL_MS) {
    return applyStateAdjustment(_cache, state);
  }

  try {
    const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    const params7d = { dateRange: '7d', format: 'json' };

    // Fetch both endpoints in parallel
    const [speedRes, iqiRes] = await Promise.all([
      axios.get('https://api.cloudflare.com/client/v4/radar/quality/speed/summary', {
        params: params7d, headers, timeout: 10000,
      }),
      axios.get('https://api.cloudflare.com/client/v4/radar/quality/iqi/summary', {
        params: { ...params7d, metric: 'latency' }, headers, timeout: 10000,
      }),
    ]);

    const speed = speedRes.data?.result?.summary_0;
    const iqi   = iqiRes.data?.result?.summary_0;

    if (!speed) return buildFallback('Empty speed response from Cloudflare Radar');

    const latencyIdle   = parseFloat(speed.latencyIdle)   || 0;  // RTT ms (idle)
    const latencyLoaded = parseFloat(speed.latencyLoaded) || 0;  // RTT ms (under load)
    const downloadMbps  = parseFloat(speed.bandwidthDownload) || 0;
    const uploadMbps    = parseFloat(speed.bandwidthUpload)   || 0;
    const jitterMs      = parseFloat(speed.jitterIdle)   || 0;
    const packetLossPct = parseFloat(speed.packetLoss)   || 0;
    const iqiP50        = parseFloat(iqi?.p50) || latencyIdle;
    const iqiP75        = parseFloat(iqi?.p75) || 0;

    // Score based on idle latency (lower = better for DC end-user experience)
    // US average is ~85ms; sub-30ms is excellent (fiber metro areas)
    let baseScore;
    if (latencyIdle <= 25)      baseScore = 9.5;
    else if (latencyIdle <= 40) baseScore = 8.5;
    else if (latencyIdle <= 60) baseScore = 7.0;
    else if (latencyIdle <= 85) baseScore = 5.5;
    else if (latencyIdle <= 120) baseScore = 4.0;
    else                         baseScore = 2.5;

    // Penalize for high jitter (inconsistent latency is bad for real-time workloads)
    if (jitterMs > 30) baseScore = Math.max(1, baseScore - 0.5);
    if (jitterMs > 50) baseScore = Math.max(1, baseScore - 0.5);

    // Penalize for packet loss
    if (packetLossPct > 3)  baseScore = Math.max(1, baseScore - 0.5);
    if (packetLossPct > 5)  baseScore = Math.max(1, baseScore - 1.0);

    const result = {
      baseScore: Math.round(baseScore * 10) / 10,
      latencyIdleMs:   Math.round(latencyIdle),
      latencyLoadedMs: Math.round(latencyLoaded),
      iqiP50Ms:  Math.round(iqiP50),
      iqiP75Ms:  Math.round(iqiP75),
      downloadMbps: Math.round(downloadMbps),
      uploadMbps:   Math.round(uploadMbps),
      jitterMs:  Math.round(jitterMs),
      packetLossPct: Math.round(packetLossPct * 10) / 10,
      dataScope: 'US national average (7-day)',
    };

    _cache = result;
    _cacheTime = Date.now();
    console.log(`✅ Cloudflare Radar: P50=${Math.round(iqiP50)}ms | DL=${Math.round(downloadMbps)}Mbps | Loss=${packetLossPct.toFixed(1)}%`);

    return applyStateAdjustment(result, state);

  } catch (err) {
    console.warn('Cloudflare Radar fetch failed:', err.response?.status, err.message);
    return buildFallback(err.message);
  }
}

function applyStateAdjustment(base, state) {
  const adj = STATE_LATENCY_ADJUSTMENT[state] || 0;
  const adjustedScore = Math.min(10, Math.max(1, base.baseScore + adj));

  const adjLabel = adj > 0
    ? `+${adj.toFixed(1)} (major internet hub)`
    : adj < 0
      ? `${adj.toFixed(1)} (rural/remote penalty)`
      : '(national average)';

  return {
    score: Math.round(adjustedScore * 10) / 10,
    ...base,
    stateAdjustment: adj,
    rawValue: `P50 ${base.iqiP50Ms}ms · ${base.downloadMbps} Mbps · ${base.jitterMs}ms jitter · ${base.packetLossPct}% loss ${adjLabel}`,
    interpretation: buildInterpretation(base.latencyIdleMs, base.downloadMbps, base.jitterMs, base.packetLossPct, adj, state),
    source: 'Cloudflare Radar Speed + IQI (real-time, 7-day rolling)',
  };
}

function buildInterpretation(latency, download, jitter, loss, adj, state) {
  const latencyTier = latency <= 40 ? 'excellent' : latency <= 70 ? 'good' : latency <= 100 ? 'average' : 'elevated';
  const jitterNote = jitter > 30 ? ` High jitter (${jitter}ms) suggests network congestion — problematic for real-time DC workloads.` : '';
  const lossNote = loss > 2 ? ` Packet loss ${loss}% above ideal threshold for data center SLAs.` : '';
  const stateNote = adj > 0.5 ? ` ${state} is a major internet hub — expect below-average latency vs national figures.` : '';
  return `US network P50 latency ${latency}ms (${latencyTier}), ${download} Mbps average download.${jitterNote}${lossNote}${stateNote}`;
}

function buildFallback(reason) {
  return {
    score: 5,
    latencyIdleMs: null,
    iqiP50Ms: null,
    downloadMbps: null,
    jitterMs: null,
    packetLossPct: null,
    stateAdjustment: 0,
    rawValue: `Network quality data unavailable (${reason})`,
    interpretation: 'Cloudflare Radar network quality unavailable — using neutral estimate',
    source: 'Cloudflare Radar (unavailable)',
    error: true,
  };
}

module.exports = { getNetworkQuality };
