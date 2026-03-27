import { useState } from 'react';

const CRITERION_ICONS = {
  'Broadband Connectivity': '📡',
  'Natural Hazard Risk': '🌪️',
  'Power Infrastructure': '⚡',
  'Power Cost': '💵',
  'Grid Reliability': '🔋',
  'DC Financial Viability': '📊',
  'Resource Feasibility': '🏭',
  'DC Competitive Landscape': '🗺️',
  'Tech Demand Proximity': '💼',
  'Building Suitability': '🏢',
  'Water Availability': '💧',
  'Flood Zone': '🌊',
  'Flood Risk History': '🌊',
  'Network Latency Potential': '🌐',
  'IXP / Latency Potential': '🌐',
  'Project Execution Risk': '🏗️',
  'Execution Risk': '⚠️',
  // Solar v3
  'Solar Roof Quality': '🏠',
  'Solar Irradiance & Cloud Cover': '🌤️',
  'Wind Exposure': '💨',
  'Site Flood & Disaster Risk': '🌊',
  'Roof Age & Condition': '🏗️',
  'Grid Connection Quality': '⚡',
  // Legacy
  'Solar Irradiance': '☀️',
  'Roof Suitability for Solar': '🏠',
  'DC Opportunity Cost': '⚖️',
};

function ScoreBar({ score }) {
  const pct = (score / 10) * 100;
  const barColor = score >= 7 ? 'from-emerald-400 to-green-500'
    : score >= 5 ? 'from-amber-400 to-amber-500'
    : score >= 3 ? 'from-orange-400 to-orange-500'
    : 'from-red-400 to-red-500';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${barColor} rounded-full transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-slate-700 w-8 text-right font-medium">
        {score?.toFixed(1) ?? '—'}/10
      </span>
    </div>
  );
}

function SubPanel({ title, children, color = 'slate' }) {
  const colors = {
    blue:   'bg-blue-50 border-blue-200',
    orange: 'bg-orange-50 border-orange-200',
    red:    'bg-red-50 border-red-200',
    green:  'bg-green-50 border-green-200',
    slate:  'bg-slate-50 border-slate-200',
  };
  const titleColors = {
    blue: 'text-blue-600', orange: 'text-orange-600',
    red: 'text-red-600', green: 'text-green-600', slate: 'text-slate-500',
  };
  return (
    <div className={`border rounded-lg p-3 ${colors[color] || colors.slate}`}>
      <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${titleColors[color] || titleColors.slate}`}>
        {title}
      </div>
      {children}
    </div>
  );
}

function StatGrid({ items }) {
  return (
    <div className={`grid grid-cols-${Math.min(items.length, 3)} gap-2 text-center`}>
      {items.map((item, i) => (
        <div key={i}>
          <div className={`text-base font-bold ${item.color || 'text-slate-800'}`}>{item.value}</div>
          <div className="text-xs text-slate-500">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function CriteriaCard({ criterion }) {
  const [expanded, setExpanded] = useState(false);
  const icon = CRITERION_ICONS[criterion.name] || '📌';
  const contribution = criterion.weightedContribution;
  const weightPct = Math.round((criterion.weight || 0) * 100);

  return (
    <div
      className={`bg-white border rounded-xl overflow-hidden transition-all duration-200 shadow-sm ${
        criterion.isHardDisqualifier ? 'border-red-200 bg-red-50' :
        criterion.isModifier ? 'border-indigo-200 bg-indigo-50' :
        'border-slate-200 hover:border-slate-300 hover:shadow-md'
      } ${expanded ? '' : 'cursor-pointer'}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl leading-none pt-0.5 flex-shrink-0">{icon}</div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-semibold text-sm text-slate-800">{criterion.name}</span>
              {criterion.isHardDisqualifier && (
                <span className="text-xs bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-medium">
                  DISQUALIFIER
                </span>
              )}
              {criterion.isModifier && (
                <span className="text-xs bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full font-medium">
                  MODIFIER {criterion.scoreModifier > 0 ? '+' : ''}{criterion.scoreModifier}pts
                </span>
              )}
              {criterion.isSolarCriterion && (
                <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                  SOLAR
                </span>
              )}
              {weightPct > 0 && (
                <span className="text-xs text-slate-400 ml-auto">{weightPct}% wt</span>
              )}
            </div>

            <p className="text-xs text-slate-800 mb-2 truncate font-medium">{criterion.rawValue}</p>
            <ScoreBar score={criterion.normalizedScore} />
          </div>

          <div className={`text-slate-400 transition-transform duration-200 flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-3 animate-fade-in">
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-wider">Interpretation</span>
              <p className="text-sm text-slate-700 mt-1">{criterion.interpretation || '—'}</p>
            </div>

            {/* NFIP Claims */}
            {criterion.subData?.nfipClaims && (
              <SubPanel title="🏚️ FEMA NFIP Flood Claims (Last 10 Years)" color="blue">
                <StatGrid items={[
                  { value: criterion.subData.nfipClaims.claimCount ?? 'N/A', label: 'Total Claims' },
                  { value: criterion.subData.nfipClaims.totalPaid >= 1e6 ? `$${(criterion.subData.nfipClaims.totalPaid/1e6).toFixed(1)}M` : `$${Math.round((criterion.subData.nfipClaims.totalPaid||0)/1000)}K`, label: 'Total Paid' },
                  { value: criterion.subData.nfipClaims.avgPaid > 0 ? `$${Math.round(criterion.subData.nfipClaims.avgPaid/1000)}K` : '$0', label: 'Avg/Claim' },
                ]} />
              </SubPanel>
            )}

            {/* HMA Projects */}
            {criterion.subData?.hmaInvestment && (
              <SubPanel title="🏗️ FEMA Hazard Mitigation Projects" color="orange">
                <StatGrid items={[
                  { value: criterion.subData.hmaInvestment.projects ?? 'N/A', label: 'Projects' },
                  { value: criterion.subData.hmaInvestment.totalFederal >= 1e6 ? `$${(criterion.subData.hmaInvestment.totalFederal/1e6).toFixed(1)}M` : `$${Math.round(criterion.subData.hmaInvestment.totalFederal/1000)}K`, label: 'Federal $' },
                  { value: criterion.subData.hmaInvestment.score?.toFixed(1) ?? '—', label: 'Risk Score' },
                ]} />
              </SubPanel>
            )}

            {/* Cloudflare Radar */}
            {criterion.subData?.cloudflareRadar && (
              <SubPanel title="🌐 Cloudflare Radar — 7-day network quality" color="blue">
                <StatGrid items={[
                  { value: `${criterion.subData.cloudflareRadar.iqiP50Ms}ms`, label: 'P50 Latency' },
                  { value: `${criterion.subData.cloudflareRadar.downloadMbps}`, label: 'Mbps Down' },
                  { value: `${criterion.subData.cloudflareRadar.packetLossPct}%`, label: 'Pkt Loss', color: criterion.subData.cloudflareRadar.packetLossPct > 3 ? 'text-red-600' : 'text-emerald-600' },
                ]} />
              </SubPanel>
            )}

            {/* IXP */}
            {criterion.subData?.ixp && (
              <SubPanel title="📍 Nearest Internet Exchange Point" color="slate">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700 font-medium">{criterion.subData.ixp.name || 'Unknown IXP'}</span>
                  <span className={`text-sm font-bold px-2 py-0.5 rounded ${criterion.subData.ixp.distanceMiles <= 25 ? 'text-emerald-700 bg-emerald-100' : criterion.subData.ixp.distanceMiles <= 75 ? 'text-amber-700 bg-amber-100' : 'text-red-700 bg-red-100'}`}>
                    {criterion.subData.ixp.distanceMiles} mi
                  </span>
                </div>
              </SubPanel>
            )}

            {/* Flood zone */}
            {criterion.subData?.floodZone && (
              <SubPanel title="FEMA Flood Zone" color={criterion.subData.floodZone.isDisqualifier ? 'red' : 'slate'}>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold px-2 py-0.5 rounded ${criterion.subData.floodZone.isDisqualifier ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    Zone {criterion.subData.floodZone.zone || 'X'}
                  </span>
                  {criterion.subData.floodZone.isDisqualifier && (
                    <span className="text-xs text-red-600">Hard disqualifier — DC score capped</span>
                  )}
                </div>
              </SubPanel>
            )}

            {/* Sentinel-2 multi-year roof spectral comparison */}
            {criterion.subData?.multiYearImagery?.available && (
              <SubPanel title="🛰️ Multi-year satellite (Sentinel-2) — mean RGB at site" color="blue">
                <div className="space-y-2 text-xs text-slate-700">
                  <div className="flex flex-wrap gap-2 justify-between">
                    <span>
                      Max year-to-year color distance:{' '}
                      <strong>{criterion.subData.multiYearImagery.maxConsecutiveRgbDelta}</strong>
                      {' '}({criterion.subData.multiYearImagery.changeSignificance})
                    </span>
                    <span className="text-slate-500">
                      ~{criterion.subData.multiYearImagery.windowMetersApprox}m window
                    </span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">{criterion.subData.multiYearImagery.interpretation}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2">
                    {criterion.subData.multiYearImagery.years?.map((y) => (
                      <div key={y.year} className="bg-white/80 rounded border border-blue-100 p-2 text-center">
                        <div className="font-bold text-slate-800">{y.year}</div>
                        <div className="text-[10px] text-slate-500 tabular-nums">
                          R{y.meanR} G{y.meanG} B{y.meanB}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </SubPanel>
            )}

            {/* Resource feasibility */}
            {criterion.subData?.water && criterion.subData?.powerGrid && (
              <SubPanel title="💧 Resource Details" color="slate">
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Water stress</span>
                    <span className={`font-medium ${criterion.subData.water.stressLevel === 'high' ? 'text-red-600' : criterion.subData.water.stressLevel === 'medium' ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {criterion.subData.water.stressLevel}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Grid interconnection queue</span>
                    <span className="font-medium text-slate-700">{criterion.subData.powerGrid.interconnectionDelay}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">ASHRAE cooling zone</span>
                    <span className="font-medium text-slate-700">Zone {criterion.subData.cooling?.ashraeZone} · PUE {criterion.subData.cooling?.estimatedPUE}</span>
                  </div>
                </div>
              </SubPanel>
            )}

            {/* DC Landscape nearby DCs */}
            {criterion.subData?.nearbyDCs?.length > 0 && (
              <SubPanel title={`📍 Nearby Data Centers (${criterion.subData.counts?.within15Miles ?? 0} within 15mi)`} color="slate">
                <div className="space-y-1">
                  {criterion.subData.nearbyDCs.slice(0, 3).map((dc, idx) => (
                    <div key={idx} className="flex justify-between text-xs">
                      <span className="text-slate-600 truncate">{dc.name}</span>
                      <span className="text-slate-400 ml-2 shrink-0">{dc.distanceMiles?.toFixed(1)} mi</span>
                    </div>
                  ))}
                </div>
              </SubPanel>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-slate-800">{criterion.normalizedScore?.toFixed(1) ?? '—'}</div>
                <div className="text-xs text-slate-400">Score /10</div>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-slate-800">{weightPct > 0 ? `${weightPct}%` : '—'}</div>
                <div className="text-xs text-slate-400">Weight</div>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-amber-600">
                  {criterion.weight > 0 ? (contribution * 10).toFixed(2) : '—'}
                </div>
                <div className="text-xs text-slate-400">Contribution</div>
              </div>
            </div>

            <div>
              <span className="text-xs text-slate-400 uppercase tracking-wider">Data Source</span>
              <p className="text-xs text-slate-500 mt-1">{criterion.source}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
