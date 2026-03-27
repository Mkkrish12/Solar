/**
 * Roof Age Estimation Engine — v3
 *
 * Combines signals:
 *   1. Building permit records (from permits.js) — most authoritative
 *   2. Google Solar API imageryDate — when Google’s solar raster was captured (not roof install date)
 *   3. Sentinel-2 multi-year true-color means (roofImageryHistory.js) — spectral change vs time
 *
 * Output: estimated roof age in years, confidence level, and solar score impact.
 *
 * Industry basis:
 *   - Solar systems have a 25-year designed lifespan
 *   - Installers require at least 20–22 years of remaining roof life
 *   - A roof older than 15–20 years requires replacement before installation
 *   - Source: NREL "PV System Rooftop Assessment" + RSMeans construction data
 */

const ROOF_KEYWORDS = ['roof', 'reroof', 'reroofing', 're-roof', 'shingle', 'membrane',
  'tpo', 'epdm', 'flat roof', 'roofing', 'built-up', 'modified bitumen', 'cap sheet'];
const CONSTRUCTION_KEYWORDS = ['construction', 'renovation', 'alteration', 'remodel',
  'addition', 'new building', 'new construction', 'gut rehab', 'full renovation'];

/**
 * Classify permit records to estimate roof age
 */
function classifyPermitsForRoofAge(permitData) {
  if (!permitData?.available || !permitData.permits?.length) {
    return {
      confidence: 'none',
      estimatedRoofAge: null,
      source: 'no_permit_data',
      note: 'No permit API coverage for this city. Roof age unknown.',
    };
  }

  const permits = permitData.permits;
  const now = Date.now();

  const roofPermits = permits.filter(p => {
    const desc = [
      p.description, p.permit_type, p.work_description,
      p.work_type, p.type_description, p.job_description,
    ].filter(Boolean).join(' ').toLowerCase();
    return ROOF_KEYWORDS.some(k => desc.includes(k));
  });

  const constructionPermits = permits.filter(p => {
    const desc = [
      p.description, p.permit_type, p.work_description,
      p.work_type, p.type_description, p.job_description,
    ].filter(Boolean).join(' ').toLowerCase();
    return CONSTRUCTION_KEYWORDS.some(k => desc.includes(k))
      && !ROOF_KEYWORDS.some(k => desc.includes(k));
  });

  // Definitive: explicit roof permit
  if (roofPermits.length > 0) {
    const sorted = roofPermits
      .filter(p => p.issued_date || p.issue_date || p.permit_date)
      .sort((a, b) => {
        const da = new Date(b.issued_date || b.issue_date || b.permit_date);
        const db = new Date(a.issued_date || a.issue_date || a.permit_date);
        return da - db;
      });
    const mostRecent = sorted[0] || roofPermits[0];
    const dateStr = mostRecent.issued_date || mostRecent.issue_date || mostRecent.permit_date;
    const ageYears = dateStr ? (now - new Date(dateStr)) / (365.25 * 24 * 3600 * 1000) : null;

    return {
      confidence: 'high',
      estimatedRoofAge: ageYears ? Math.round(ageYears) : null,
      probabilityRoofReplaced: 1.0,
      source: 'explicit_roof_permit',
      permitDate: dateStr,
      note: `Explicit roofing permit found (${mostRecent.permit_type || 'roofing work'})`,
    };
  }

  // Probabilistic: major construction/renovation permit
  if (constructionPermits.length > 0) {
    const sorted = constructionPermits
      .filter(p => p.issued_date || p.issue_date || p.permit_date)
      .sort((a, b) => {
        const da = new Date(b.issued_date || b.issue_date || b.permit_date);
        const db = new Date(a.issued_date || a.issue_date || a.permit_date);
        return da - db;
      });
    const mostRecent = sorted[0] || constructionPermits[0];
    const dateStr = mostRecent.issued_date || mostRecent.issue_date || mostRecent.permit_date;
    const ageYears = dateStr ? (now - new Date(dateStr)) / (365.25 * 24 * 3600 * 1000) : null;

    return {
      confidence: 'medium',
      estimatedRoofAge: ageYears ? Math.round(ageYears) : null,
      probabilityRoofReplaced: 0.60,
      source: 'construction_permit_inferred',
      permitDate: dateStr,
      note: 'Major construction permit found. ~60% probability roof was replaced (RSMeans industry data).',
    };
  }

  return {
    confidence: 'low',
    estimatedRoofAge: null,
    probabilityRoofReplaced: null,
    source: 'permits_found_no_roof_work',
    note: `${permits.length} permits found but none indicate roof work.`,
  };
}

/**
 * Solar API imagery metadata — secondary signal only.
 * imageryDate = capture date of the raster used for buildingInsights (one snapshot in time).
 * It does NOT compare multiple years or detect color/material change; for that you need
 * multi-temporal imagery or parcel-level permits.
 */
function getRoofConditionFromSolarApi(solarApiData) {
  if (!solarApiData?.imageryDate) return null;

  const { year, month } = solarApiData.imageryDate;
  if (!year) return null;

  const imageryAge = (new Date().getFullYear() - year) + ((new Date().getMonth() + 1 - (month || 6)) / 12);
  return {
    imageryAgeYears: Math.round(imageryAge * 10) / 10,
    imageryQuality: solarApiData.imageryQuality,
    note: `Google Solar API imagery from ${year}-${String(month || '?').padStart(2, '0')} — ${solarApiData.imageryQuality} quality`,
  };
}

/**
 * Composite roof age score (0–10 for solar criterion)
 * Lower age = better = higher score
 * @param {object|null} multiYearImagery — from getFourYearRoofImageryComparison()
 */
function calcRoofAgeScore(roofAgeData, solarApiCondition, multiYearImagery) {
  const { estimatedRoofAge, confidence, probabilityRoofReplaced } = roofAgeData;

  const multiBonus = (() => {
    if (!multiYearImagery?.available) return { add: 0, note: '' };
    const sig = multiYearImagery.changeSignificance;
    if (sig === 'high') return { add: 1.5, note: 'Sentinel-2: strong multi-year color change (possible reroof/surface work)' };
    if (sig === 'medium') return { add: 0.75, note: 'Sentinel-2: moderate spectral change across years' };
    return { add: 0.25, note: 'Sentinel-2: stable appearance across years' };
  })();

  // If no permit data but Solar API has recent high-quality imagery, slight positive signal
  if (!estimatedRoofAge) {
    const baseScore = 5; // neutral
    const imageryBonus = solarApiCondition?.imageryQuality === 'HIGH' ? 0.5 : 0;
    const score = Math.min(10, baseScore + imageryBonus + multiBonus.add);
    const parts = [roofAgeData.note || 'No permit data available'];
    if (multiBonus.note) parts.push(multiBonus.note);
    return {
      score,
      label: multiYearImagery?.available && multiYearImagery.changeSignificance === 'high'
        ? 'Spectral change detected — possible recent roof work (inspect)'
        : 'Roof age unknown — inspection recommended',
      estimatedRoofAge: null,
      confidence,
      forSolar: multiYearImagery?.available && multiYearImagery.changeSignificance !== 'low'
        ? 'No permit history — multi-year satellite comparison suggests surface change; confirm with a physical roof inspection'
        : 'Roof age unknown — recommend inspection before committing to 20-year solar contract',
      rawValue: parts.join(' · '),
      multiYearImagery: multiYearImagery?.available ? multiYearImagery : null,
    };
  }

  const confidenceMultiplier = confidence === 'high' ? 1.0
    : confidence === 'medium' ? (probabilityRoofReplaced || 0.60)
    : 0.30;

  // Raw score from age
  const rawScore = estimatedRoofAge <= 3 ? 10
    : estimatedRoofAge <= 7 ? 8
    : estimatedRoofAge <= 12 ? 6
    : estimatedRoofAge <= 18 ? 3
    : 1;

  // Blend with neutral (5) based on confidence
  const finalScore = rawScore * confidenceMultiplier + 5 * (1 - confidenceMultiplier);

  const label = estimatedRoofAge <= 3 ? 'Recently replaced — ideal'
    : estimatedRoofAge <= 7 ? 'Good condition (< 7 years)'
    : estimatedRoofAge <= 12 ? 'Mid-life (7–12 years)'
    : estimatedRoofAge <= 18 ? 'Aging — replacement likely needed'
    : 'Old — replacement required before installation';

  const forSolar = estimatedRoofAge <= 5
    ? 'Excellent — 20+ years remaining aligns with full solar contract term'
    : estimatedRoofAge <= 12
      ? 'Acceptable — recommend inspection before 20-year solar commitment'
      : 'Risk — roof replacement likely required, adding $50K–$150K to project cost';

  const confidenceLabel = confidence === 'high' ? 'high confidence (explicit permit)'
    : confidence === 'medium' ? `medium confidence (${Math.round((probabilityRoofReplaced || 0.6) * 100)}% probability)`
    : 'low confidence';

  const extraParts = [];
  if (multiYearImagery?.available) {
    extraParts.push(
      `Sentinel-2 ΔRGB ${multiYearImagery.maxConsecutiveRgbDelta} (${multiYearImagery.changeSignificance})`,
    );
  }

  return {
    score: Math.round(finalScore * 10) / 10,
    label,
    estimatedRoofAge,
    confidence,
    forSolar,
    rawValue: [`~${estimatedRoofAge} years old (${confidenceLabel})`, ...extraParts].filter(Boolean).join(' · '),
    multiYearImagery: multiYearImagery?.available ? multiYearImagery : null,
  };
}

module.exports = { classifyPermitsForRoofAge, getRoofConditionFromSolarApi, calcRoofAgeScore };
