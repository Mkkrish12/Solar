import { useState } from 'react';
import ScoreGauge from './ScoreGauge';

export default function CompareMode({ onEvaluate, loading }) {
  const [addresses, setAddresses] = useState(['', '']);
  const [results, setResults] = useState([null, null]);
  const [loadingIdx, setLoadingIdx] = useState(null);

  const addAddress = () => {
    if (addresses.length < 3) {
      setAddresses([...addresses, '']);
      setResults([...results, null]);
    }
  };

  const removeAddress = (idx) => {
    setAddresses(addresses.filter((_, i) => i !== idx));
    setResults(results.filter((_, i) => i !== idx));
  };

  const evaluateOne = async (idx) => {
    const addr = addresses[idx];
    if (!addr.trim()) return;
    setLoadingIdx(idx);
    try {
      const result = await onEvaluate(addr);
      setResults(prev => {
        const next = [...prev];
        next[idx] = result;
        return next;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingIdx(null);
    }
  };

  const hasAnyResult = results.some(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Side-by-Side Comparison</h2>
        {addresses.length < 3 && (
          <button onClick={addAddress} className="text-sm text-amber-700 hover:text-amber-900 font-semibold flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Address
          </button>
        )}
      </div>

      {/* Input row */}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${addresses.length}, 1fr)` }}>
        {addresses.map((addr, i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-700 font-semibold">Address {i + 1}</span>
              {addresses.length > 2 && (
                <button type="button" onClick={() => removeAddress(i)} className="ml-auto text-slate-600 hover:text-red-600 text-xs font-medium">✕</button>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={addr}
                onChange={e => {
                  const next = [...addresses];
                  next[i] = e.target.value;
                  setAddresses(next);
                }}
                placeholder="Enter address..."
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5
                           text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400
                           transition-colors shadow-sm"
              />
              <button
                type="button"
                onClick={() => evaluateOne(i)}
                disabled={!addr.trim() || loadingIdx !== null}
                className="btn-primary py-2 px-3 text-sm"
              >
                {loadingIdx === i ? (
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : '→'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Results comparison */}
      {hasAnyResult && (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${addresses.length}, 1fr)` }}>
          {results.map((result, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-4">
              {result ? (
                <>
                  <div className="text-xs text-slate-800 font-medium truncate" title={result.address}>
                    {result.address}
                  </div>
                  <div className="flex justify-around">
                    <ScoreGauge score={result.dcScore} type="dc" title="DC Score" />
                    <ScoreGauge score={result.solarScore} type="solar" title="Solar Score" />
                  </div>
                  <div className={`text-center text-xs font-bold px-3 py-1.5 rounded-full ${
                    result.recommendation === 'STRONG_SOLAR' || result.recommendation === 'LEAN_SOLAR'
                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      : result.recommendation === 'NEUTRAL'
                      ? 'bg-slate-100 text-slate-800 border border-slate-200'
                      : 'bg-orange-100 text-orange-800 border border-orange-200'
                  }`}>
                    {result.recommendation.replace('_', ' ')}
                  </div>
                  <p className="text-xs text-slate-800 leading-relaxed line-clamp-3">{result.verdict}</p>
                </>
              ) : (
                <div className="h-48 flex items-center justify-center text-slate-600 text-sm">
                  {loadingIdx === i ? (
                    <div className="text-center">
                      <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                      <span className="text-slate-800 font-medium">Analyzing...</span>
                    </div>
                  ) : (
                    'Enter address and click →'
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
