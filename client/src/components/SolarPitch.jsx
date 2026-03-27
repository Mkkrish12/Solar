export default function SolarPitch({ solarMetrics, solarPitch, topSolarReasons, recommendation }) {
  const isSolarWinner = ['STRONG_SOLAR', 'LEAN_SOLAR', 'NEUTRAL'].includes(recommendation);

  const formatKWh = (kwh) => kwh ? `${Math.round(kwh / 1000)}k kWh` : '~120k kWh';
  const formatRevenue = (rev) => rev ? `$${rev.toLocaleString()}` : 'Est. $40,000–80,000';
  const formatCO2 = (tons) => tons ? `${tons} tons` : 'Est. 85 tons';

  return (
    <div className="space-y-6">
      {/* Rooftop Defender Badge */}
      {isSolarWinner && (
        <div className="text-center">
          <div className="inline-flex items-center gap-3 bg-gradient-to-r from-emerald-50 to-amber-50
                          border border-emerald-200 rounded-2xl px-6 py-4 animate-slide-up shadow-sm">
            <span className="text-4xl">🌞</span>
            <div className="text-left">
              <div className="font-black text-lg text-slate-900">Certified Solar Champion</div>
              <div className="text-sm text-emerald-800 font-medium">This roof is too valuable for a data center</div>
            </div>
          </div>
        </div>
      )}

      {/* Revenue Calculator */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <span>💰</span> GoSolar Revenue Calculator
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
            <div className="text-3xl font-black text-amber-700">
              {formatKWh(solarMetrics?.annualKWh)}
            </div>
            <div className="text-xs text-slate-800 mt-1 font-medium">Annual Solar Production</div>
            <div className="text-xs text-slate-600 mt-1">100kW reference system</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <div className="text-3xl font-black text-emerald-700">
              {formatRevenue(solarMetrics?.estimatedAnnualRevenue)}
            </div>
            <div className="text-xs text-slate-800 mt-1 font-medium">Est. Annual Lease</div>
            <div className="text-xs text-slate-600 mt-1">Guaranteed income to you</div>
          </div>
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-center">
            <div className="text-3xl font-black text-sky-700">
              {formatCO2(solarMetrics?.co2OffsetTons)}
            </div>
            <div className="text-xs text-slate-800 mt-1 font-medium">CO₂ Offset / Year</div>
            <div className="text-xs text-slate-600 mt-1">= {solarMetrics?.co2OffsetTons ? Math.round(solarMetrics.co2OffsetTons / 4.6) : '~18'} cars off road</div>
          </div>
        </div>

        {solarMetrics?.irradianceTier && (
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-800">
            <span className="text-amber-700 font-bold">{solarMetrics.irradianceTier}</span>
            <span>solar resource</span>
            {solarMetrics.capacityFactor && (
              <span className="ml-auto text-xs text-slate-700 font-medium">Capacity Factor: {solarMetrics.capacityFactor}%</span>
            )}
          </div>
        )}
      </div>

      {/* Top Solar Reasons */}
      {topSolarReasons && topSolarReasons.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <span>🏆</span> Why Solar Wins Here
          </h3>
          <ul className="space-y-3">
            {topSolarReasons.map((reason, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <div className="w-6 h-6 rounded-full bg-amber-100 border border-amber-300 text-amber-800
                                flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <span className="text-slate-800 leading-relaxed">{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* GoSolar pitch block */}
      <div className="bg-gradient-to-br from-amber-50 to-white border border-amber-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="text-4xl">🌞</div>
          <div>
            <h3 className="font-bold text-amber-900 mb-2">GoSolar&apos;s offer</h3>
            <p className="text-slate-800 text-sm leading-relaxed">{solarPitch}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-semibold">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Zero upfront cost
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-semibold">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Guaranteed lease income
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-semibold">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                We handle everything
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
