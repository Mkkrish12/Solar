import { useState } from 'react';

const SAMPLE_ADDRESSES = [
  '100 Winchester Circle, Los Gatos, CA 95032',
  '1600 Amphitheatre Pkwy, Mountain View, CA 94043',
  '350 Fifth Avenue, New York, NY 10118',
  '8000 S Orange Blossom Trail, Orlando, FL 32809',
];

export default function AddressInput({ onSubmit, loading }) {
  const [address, setAddress] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (address.trim() && !loading) {
      onSubmit(address.trim());
    }
  };

  const useSample = (sample) => {
    setAddress(sample);
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-200/80 via-amber-100/60 to-amber-200/80 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />

          <div className="relative flex items-center bg-white border border-slate-200 rounded-2xl shadow-sm p-2">
            <div className="flex items-center pl-4 pr-3">
              <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>

            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter a commercial building address..."
              className="flex-1 bg-transparent text-slate-900 placeholder-slate-500 text-base md:text-lg py-3 pr-4
                         focus:outline-none focus:ring-0 transition-colors"
              disabled={loading}
              autoFocus
            />

            <button
              type="submit"
              disabled={!address.trim() || loading}
              className="btn-primary flex items-center gap-2 mr-1 whitespace-nowrap"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Evaluate Roof
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Sample addresses */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-600 font-semibold uppercase tracking-wider">Try:</span>
        {SAMPLE_ADDRESSES.map((sample, i) => (
          <button
            key={i}
            type="button"
            onClick={() => useSample(sample)}
            disabled={loading}
            className="text-xs text-slate-800 hover:text-amber-800 bg-white hover:bg-amber-50
                       border border-slate-200 hover:border-amber-300 rounded-lg px-3 py-1.5
                       transition-all duration-150 truncate max-w-[200px] shadow-sm"
          >
            {sample.split(',')[0]}...
          </button>
        ))}
      </div>
    </div>
  );
}
