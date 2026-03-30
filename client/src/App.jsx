import { useState, useCallback } from 'react';
import axios from 'axios';
import AddressInput from './components/AddressInput';
import LoadingProgress from './components/LoadingProgress';
import ScoreGauge from './components/ScoreGauge';
import CriteriaCard from './components/CriteriaCard';
import SolarPitch from './components/SolarPitch';
import MapView from './components/MapView';
import CompareMode from './components/CompareMode';
import FinancialComparison from './components/FinancialComparison';
import AIReport from './components/AIReport';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const RECOMMENDATION_STYLES = {
  STRONG_SOLAR: { bg: 'from-emerald-50 to-green-50', border: 'border-emerald-200', text: 'text-emerald-700', bodyText: 'text-slate-700', icon: '🌞', label: 'STRONG SOLAR CANDIDATE' },
  LEAN_SOLAR:   { bg: 'from-emerald-50 to-teal-50',  border: 'border-emerald-200', text: 'text-emerald-600', bodyText: 'text-slate-700', icon: '🌤️', label: 'LEANS TOWARD SOLAR' },
  NEUTRAL:      { bg: 'from-amber-50 to-yellow-50',  border: 'border-amber-200',   text: 'text-amber-700',  bodyText: 'text-slate-700', icon: '⚖️', label: 'NEUTRAL — EVALUATE BOTH' },
  LEAN_DC:      { bg: 'from-orange-50 to-amber-50',  border: 'border-orange-200',  text: 'text-orange-700', bodyText: 'text-slate-700', icon: '🖥️', label: 'LEANS TOWARD DATA CENTER' },
  STRONG_DC:    { bg: 'from-red-50 to-rose-50',      border: 'border-red-200',     text: 'text-red-700',    bodyText: 'text-slate-700', icon: '⚠️', label: 'STRONG DATA CENTER CANDIDATE' },
};

const SOLAR_DEFENDER_BADGES = {
  STRONG_SOLAR: {
    emoji: '🌞',
    label: 'Solar Champion',
    color: 'bg-emerald-50 border-emerald-300 text-emerald-700',
    tagline: "Prime solar territory — don't let it become a server room.",
  },
  LEAN_SOLAR: {
    emoji: '🌤️',
    label: 'Solar Lean',
    color: 'bg-yellow-50 border-yellow-300 text-yellow-700',
    tagline: 'Solar wins here. The data center case has real gaps.',
  },
  NEUTRAL: {
    emoji: '⚖️',
    label: 'Contested Site',
    color: 'bg-slate-100 border-slate-300 text-slate-600',
    tagline: "It's close. Here's why solar is still the safer bet.",
  },
  LEAN_DC: {
    emoji: '⚡',
    label: 'DC Viable',
    color: 'bg-orange-50 border-orange-300 text-orange-700',
    tagline: 'Viable for DC — but solar still offers zero-risk passive income.',
  },
  STRONG_DC: {
    emoji: '🏢',
    label: 'DC Candidate',
    color: 'bg-red-50 border-red-300 text-red-700',
    tagline: 'Strong DC site. But solar is still faster, cheaper, and zero-risk.',
  },
};

function HeroSection({ onSubmit, loading }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16 relative overflow-hidden bg-gradient-to-b from-slate-50 via-white to-amber-50/30">
      {/* Soft background accents */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-amber-200/40 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-sky-100/60 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] bg-amber-100/30 rounded-full blur-[80px]" />
      </div>

      {/* Logo + Brand */}
      <div className="text-center mb-10 relative z-10">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl
                          flex items-center justify-center text-2xl shadow-md shadow-amber-500/25 border border-amber-300/50">
            ☀️
          </div>
          <div className="text-left">
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">GoSolar</h1>
            <div className="text-xs text-amber-700 font-semibold uppercase tracking-[0.2em]">Rooftop Intelligence Platform</div>
          </div>
        </div>

        <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-4 leading-tight">
          Is your roof worth more<br/>
          <span className="bg-gradient-to-r from-amber-600 to-amber-500 bg-clip-text text-transparent">
            as solar
          </span>
          {' '}or a{' '}
          <span className="text-slate-800">data center?</span>
        </h2>
        <p className="text-base md:text-lg text-slate-700 max-w-xl mx-auto leading-relaxed">
          Our AI-powered analysis pulls from 16+ data sources — FEMA, FCC, NREL, Census, and more —
          to give you a definitive answer in under a minute.
        </p>
      </div>

      {/* Address Input */}
      <div className="w-full relative z-10">
        <AddressInput onSubmit={onSubmit} loading={loading} />
      </div>

      {/* Trust badges */}
      <div className="mt-10 flex flex-wrap justify-center gap-2 text-xs text-slate-800">
        {[
          '☀️ Google Solar API', '🤖 GPT-4o mini AI', '⚡ EIA Power Rates',
          '🌊 FEMA NFIP Claims', '🏗️ FEMA HMA Projects', '🌞 NREL PVWatts',
          '📡 PeeringDB IXPs', '🌐 Cloudflare Radar', '🌍 Census ACS', '📉 USGS Seismic',
        ].map(badge => (
          <span key={badge} className="px-3 py-1.5 bg-white border border-slate-200 rounded-full text-slate-800 shadow-sm">
            {badge}
          </span>
        ))}
      </div>
    </div>
  );
}

function VerdictBanner({ result }) {
  const style = RECOMMENDATION_STYLES[result.recommendation] || RECOMMENDATION_STYLES.NEUTRAL;

  return (
    <div className={`bg-gradient-to-r ${style.bg} border ${style.border} rounded-2xl p-6 animate-slide-up`}>
      <div className="flex items-start gap-4">
        <span className="text-4xl">{style.icon}</span>
        <div>
          <div className={`text-xs font-black uppercase tracking-widest mb-2 ${style.text}`}>
            {style.label}
          </div>
          <p className={`text-base leading-relaxed ${style.bodyText}`}>{result.verdict}</p>
          {result.hardDisqualifiers?.length > 0 && (
            <div className="mt-3 space-y-1">
              {result.hardDisqualifiers.map((d, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-red-600">
                  <span className="mt-0.5">🚫</span>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InsightsPanel({ insights }) {
  if (!insights || insights.length === 0) return null;

  return (
    <div className="glass-card p-6">
      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
        <span>🔮</span> What Would Change This Score?
      </h3>
      <div className="space-y-3">
        {insights.map((insight, i) => (
          <div key={i} className="flex items-start gap-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="text-lg">
              {insight.type === 'connectivity' ? '📡' :
               insight.type === 'latency' ? '🌐' :
               insight.type === 'flood' ? '🌊' :
               insight.type === 'drought' ? '💧' : '🏢'}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">{insight.condition}</p>
              <p className="text-xs text-slate-700 mt-0.5">{insight.impact}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState('hero'); // hero | loading | results | compare
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const evaluate = useCallback(async (address) => {
    setError(null);
    setMode('loading');
    try {
      const { data } = await axios.post(`${API_BASE}/evaluate`, { address }, { timeout: 60000 });
      setResult(data);
      setMode('results');
      return data;
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message;
      setError(msg || 'Evaluation failed. Please try again.');
      setMode('hero');
      throw err;
    }
  }, []);

  if (mode === 'hero' || mode === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50">
        {mode === 'hero' ? (
          <HeroSection onSubmit={evaluate} loading={false} />
        ) : (
          <div className="min-h-screen flex items-center justify-center px-4">
            <LoadingProgress />
          </div>
        )}
        {error && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200
                          text-red-700 px-6 py-3 rounded-xl text-sm max-w-md text-center z-50 shadow-lg">
            {error}
          </div>
        )}
      </div>
    );
  }

  if (mode === 'compare') {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <button onClick={() => setMode('hero')} className="text-slate-500 hover:text-slate-800 transition-colors">
              ← Back
            </button>
            <h1 className="text-2xl font-black text-slate-800">Compare Addresses</h1>
          </div>
          <CompareMode onEvaluate={evaluate} />
        </div>
      </div>
    );
  }

  // Results view
  const dcCriteria = result.criteria.filter(c => !c.isSolarCriterion);
  const solarCriteria = result.criteria.filter(c => c.isSolarCriterion);
  const badge = SOLAR_DEFENDER_BADGES[result.recommendation] || SOLAR_DEFENDER_BADGES.NEUTRAL;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sticky header */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-solar-400 to-amber-600 rounded-lg flex items-center justify-center text-base">
              ☀️
            </div>
            <span className="font-black text-slate-800">GoSolar</span>
            <span className="text-xs text-slate-600 font-normal hidden sm:block">Rooftop intelligence</span>
          </div>

          <div className="flex-1 mx-6 max-w-md hidden md:block">
            <AddressInput onSubmit={evaluate} loading={false} />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode('compare')}
              className="text-xs text-slate-500 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50
                         border border-slate-200 rounded-lg px-3 py-2 transition-all"
            >
              ⚖️ Compare
            </button>
            <button
              onClick={() => setMode('hero')}
              className="text-xs text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200
                         border border-slate-200 rounded-lg px-3 py-2 transition-all"
            >
              ← New Search
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Address & Solar Defender badge */}
        <div className="animate-slide-up flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-800 text-sm">
            <span>📍</span>
            <span className="font-semibold text-slate-900">{result.address}</span>
            {result.processingTimeMs && (
              <span className="ml-2 text-xs text-slate-600">
                · {(result.processingTimeMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
          {/* Solar Defender Badge */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${badge.color}`}>
            <span className="text-base">{badge.emoji}</span>
            <div>
              <div className="font-bold text-slate-900">{badge.label}</div>
              <div className="text-[10px] text-slate-700 leading-snug">{badge.tagline}</div>
            </div>
          </div>
        </div>

        {/* Score gauges */}
        <div className="glass-card p-8 animate-slide-up">
          <div className="flex flex-col sm:flex-row items-center justify-around gap-8">
            <ScoreGauge
              score={result.dcScore}
              type="dc"
              title="Edge DC Feasibility"
              subtitle="Higher = stronger data center case"
            />
            <div className="hidden sm:block w-px h-32 bg-slate-200" />
            <div className="sm:hidden w-32 h-px bg-slate-200" />
            <ScoreGauge
              score={result.solarScore}
              type="solar"
              title="Solar Viability"
              subtitle="Higher = better solar candidate"
            />
          </div>
        </div>

        {/* Verdict banner */}
        <VerdictBanner result={result} />

        {/* Tabs */}
        <div className="border-b border-slate-200 bg-white rounded-t-2xl px-2">
          <div className="flex gap-1 flex-wrap">
            {[
              { id: 'overview', label: '📊 Overview' },
              { id: 'criteria', label: '📋 Full Criteria' },
              { id: 'solar', label: '🌞 Solar Pitch' },
              { id: 'financial', label: '💰 Financials' },
              ...(result.roofReport ? [{ id: 'ai', label: '🤖 AI Report' }] : []),
              { id: 'map', label: '🗺️ Map' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-semibold transition-all border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? 'border-amber-500 text-amber-800'
                    : 'border-transparent text-slate-700 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            {/* Insights */}
            <InsightsPanel insights={result.insights} />

            {/* Key criteria summary (top 6) */}
            <div>
              <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2 text-lg">
                <span>⚡</span> Key Data Center Factors
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {dcCriteria.slice(0, 6).map((c, i) => (
                  <CriteriaCard key={i} criterion={c} />
                ))}
              </div>
            </div>

            {/* Solar section preview */}
            <div>
              <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2 text-lg">
                <span>☀️</span> Solar Factors
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {solarCriteria.map((c, i) => (
                  <CriteriaCard key={i} criterion={c} />
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'criteria' && (
          <div className="space-y-6 animate-fade-in">
            {/* DC Score Model */}
            <div className="glass-card overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl">
                <div>
                  <span className="font-bold text-slate-800 text-sm">🖥️ Edge DC Feasibility Model</span>
                  <span className="text-xs text-slate-600 ml-3">{dcCriteria.length} criteria</span>
                </div>
                <div className="text-2xl font-black text-indigo-700">{result.dcScore}<span className="text-base text-slate-700">/100</span></div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/80">
                      <th className="text-left px-4 py-2 text-slate-800 font-semibold text-xs uppercase tracking-wider">Criterion</th>
                      <th className="text-left px-4 py-2 text-slate-800 font-semibold text-xs uppercase tracking-wider">Raw Data</th>
                      <th className="text-center px-4 py-2 text-slate-800 font-semibold text-xs uppercase tracking-wider">Score /10</th>
                      <th className="text-center px-4 py-2 text-slate-800 font-semibold text-xs uppercase tracking-wider">Weight</th>
                      <th className="text-center px-4 py-2 text-slate-800 font-semibold text-xs uppercase tracking-wider">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dcCriteria.map((c, i) => (
                      <tr key={i} className={`border-b border-slate-50 hover:bg-amber-50/30 transition-colors ${
                        c.isHardDisqualifier ? 'bg-red-50' : c.isModifier ? 'bg-indigo-50/30' : ''
                      }`}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800 text-sm">{c.name}</div>
                          <div className="text-xs text-slate-600 mt-0.5">{c.source}</div>
                          {c.isHardDisqualifier && (
                            <span className="text-xs text-red-600 bg-red-100 px-1.5 py-0.5 rounded mt-1 inline-block">HARD DISQUALIFIER</span>
                          )}
                          {c.isModifier && (
                            <span className="text-xs text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded mt-1 inline-block">SCORE MODIFIER ({c.scoreModifier > 0 ? '+' : ''}{c.scoreModifier} pts)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-800 text-xs max-w-[200px]">
                          <span className="line-clamp-2">{c.rawValue}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-bold text-base ${
                            c.normalizedScore >= 7 ? 'text-emerald-600' :
                            c.normalizedScore >= 5 ? 'text-amber-600' :
                            c.normalizedScore >= 3 ? 'text-orange-500' : 'text-red-500'}`}>
                            {c.normalizedScore?.toFixed(1) ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-800 text-sm font-medium">
                          {c.weight > 0 ? `${Math.round(c.weight * 100)}%` : <span className="text-slate-500">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-sm">
                          {c.weight > 0
                            ? <span className={c.normalizedScore >= 5 ? 'text-emerald-700' : 'text-red-600'}>{(c.weightedContribution * 10).toFixed(1)}</span>
                            : <span className="text-slate-500">—</span>}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-100 border-t border-slate-200">
                      <td colSpan={3} className="px-4 py-3 text-right text-slate-800 text-xs font-semibold uppercase tracking-wider">
                        DC Score (after disqualifier caps + market modifier)
                      </td>
                      <td className="px-4 py-3 text-center text-slate-800 text-xs font-bold">100%</td>
                      <td className="px-4 py-3 text-center font-black text-indigo-600 text-lg">
                        {result.dcScore}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Solar Score Model */}
            <div className="glass-card overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl">
                <div>
                  <span className="font-bold text-slate-800 text-sm">☀️ Solar Viability Model</span>
                  <span className="text-xs text-slate-600 ml-3">{solarCriteria.length} criteria · weights sum to 100%</span>
                </div>
                <div className="text-2xl font-black text-amber-700">{result.solarScore}<span className="text-base text-slate-700">/100</span></div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/80">
                      <th className="text-left px-4 py-2 text-slate-800 font-semibold text-xs uppercase tracking-wider">Criterion</th>
                      <th className="text-left px-4 py-2 text-slate-800 font-semibold text-xs uppercase tracking-wider">Raw Data</th>
                      <th className="text-center px-4 py-2 text-slate-800 font-semibold text-xs uppercase tracking-wider">Score /10</th>
                      <th className="text-center px-4 py-2 text-slate-800 font-semibold text-xs uppercase tracking-wider">Weight</th>
                      <th className="text-center px-4 py-2 text-slate-800 font-semibold text-xs uppercase tracking-wider">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {solarCriteria.map((c, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-amber-50/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800 text-sm">{c.name}</div>
                          <div className="text-xs text-slate-600 mt-0.5">{c.source}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-800 text-xs max-w-[200px]">
                          <span className="line-clamp-2">{c.rawValue}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-bold text-base ${
                            c.normalizedScore >= 7 ? 'text-emerald-600' :
                            c.normalizedScore >= 5 ? 'text-amber-600' :
                            c.normalizedScore >= 3 ? 'text-orange-500' : 'text-red-500'}`}>
                            {c.normalizedScore?.toFixed(1) ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-800 text-sm font-medium">{Math.round(c.weight * 100)}%</td>
                        <td className="px-4 py-3 text-center font-semibold text-sm">
                          <span className={c.normalizedScore >= 5 ? 'text-amber-600' : 'text-orange-500'}>
                            {(c.weightedContribution * 10).toFixed(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 border-t border-slate-200">
                      <td colSpan={3} className="px-4 py-3 text-right text-slate-500 text-xs font-medium uppercase tracking-wider">
                        Solar Score
                      </td>
                      <td className="px-4 py-3 text-center text-slate-500 text-xs font-bold">100%</td>
                      <td className="px-4 py-3 text-center font-black text-amber-600 text-lg">
                        {result.solarScore}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Model explanation note */}
            <div className="glass-card p-4 text-sm text-slate-800 leading-relaxed">
              <strong className="text-slate-900">How the two scores relate:</strong> The DC Score and Solar Score are independent models.
              A high DC Score does <em>not</em> mean low solar — it means the roof has competing uses.
              The DC Competitive Landscape modifier adjusts the DC Score after weighting based on local market saturation.
              Hard disqualifiers (flood zone AE/VE, D3/D4 drought, retail building) cap the DC Score regardless of other factors.
            </div>
          </div>
        )}

        {activeTab === 'solar' && (
          <div className="animate-fade-in">
            <SolarPitch
              solarMetrics={result.solarMetrics}
              solarPitch={result.solarPitch}
              topSolarReasons={result.topSolarReasons}
              recommendation={result.recommendation}
              solarFinancials={result.solarFinancials}
            />
          </div>
        )}

        {activeTab === 'financial' && (
          <div className="animate-fade-in">
            {result.solarFinancials || result.detailedFinancials ? (
              <FinancialComparison
                solarFinancials={result.solarFinancials}
                solarInvestment={result.solarInvestment}
                dcScore={result.dcScore}
                dcEconomics={result.dcEconomics}
                detailedFinancials={result.detailedFinancials}
                dcLandscape={result.dcLandscape}
              />
            ) : (
              <div className="glass-card p-8 text-center">
                <p className="text-3xl mb-3">🔄</p>
                <p className="font-semibold text-slate-700 mb-1">Solar data unavailable for this address</p>
                <p className="text-sm text-slate-700">Try a different address, or check that <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs text-slate-900">NREL_API_KEY</code> is set.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'ai' && result.roofReport && (
          <div className="animate-fade-in">
            <AIReport
              roofReport={result.roofReport}
              criteriaCount={result.criteria?.length}
            />
          </div>
        )}

        {activeTab === 'map' && (
          <div className="animate-fade-in">
            <MapView
              coordinates={result.coordinates}
              address={result.address}
              criteria={result.criteria}
            />
          </div>
        )}

        {/* Data freshness footer */}
        <div className="glass-card p-4">
          <details className="group">
            <summary className="text-sm text-slate-800 font-medium cursor-pointer hover:text-slate-900 list-none flex items-center gap-2">
              <svg className="w-3 h-3 group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Data Sources & Freshness ({Object.keys(result.dataFreshness || {}).length} sources)
            </summary>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(result.dataFreshness || {}).map(([source, date]) => (
                <div key={source} className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                  <div className="text-xs text-slate-700 font-medium capitalize">{source.replace(/([A-Z])/g, ' $1')}</div>
                  <div className="text-xs text-slate-800 mt-0.5 truncate">
                    {date.includes('T') ? new Date(date).toLocaleDateString() : date}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
