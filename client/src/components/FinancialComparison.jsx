import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts';

function formatCurrency(val) {
  if (val == null) return '—';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function SummaryCard({ title, value, subtitle, color, icon }) {
  const palette = {
    green:   'bg-green-50 border-green-200 text-green-800',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    amber:   'bg-amber-50 border-amber-200 text-amber-800',
    orange:  'bg-orange-50 border-orange-200 text-orange-800',
    gray:    'bg-slate-50 border-slate-200 text-slate-700',
    red:     'bg-red-50 border-red-200 text-red-700',
  };
  return (
    <div className={`border rounded-xl p-4 ${palette[color] || palette.gray}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-base">{icon}</span>
        <span className="text-xs font-semibold text-slate-800">{title}</span>
      </div>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-700 mt-0.5">{subtitle}</p>
    </div>
  );
}

function FinRow({ label, value, positive, negative, muted }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className={`text-sm ${muted ? 'text-slate-600' : 'text-slate-800'}`}>{label}</span>
      <span className={`text-sm font-medium ${positive ? 'text-green-800' : negative ? 'text-red-700' : 'text-slate-900'}`}>
        {value}
      </span>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-sm">
      <p className="font-semibold text-slate-700 mb-2">Year {label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-800">{p.name}:</span>
          <span className="font-medium" style={{ color: p.value >= 0 ? p.color : '#ef4444' }}>
            {formatCurrency(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function InfoTip({ text }) {
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 ml-1 rounded-full border border-slate-300 text-[10px] text-slate-500 align-middle cursor-help"
      title={text}
      aria-label={text}
    >
      ⓘ
    </span>
  );
}

export default function FinancialComparison({ solarFinancials, solarInvestment, dcEconomics, detailedFinancials, dcLandscape, dcScore }) {
  const [activeScenario, setActiveScenario] = useState('base');

  // Legacy mode: no detailedFinancials yet
  if (!detailedFinancials) {
    if (!solarFinancials && !dcEconomics) return null;
    return (
      <div className="space-y-4">
        <p className="text-slate-800 text-sm text-center py-8">
          Financial model data unavailable — run a new evaluation to see detailed projections.
        </p>
      </div>
    );
  }

  const { dc, solar, scenarios, summary } = detailedFinancials;
  const ownerMonthlyLease = solarInvestment?.monthlyLeaseRevenue ?? solarFinancials?.monthlyLeaseRevenue ?? 0;
  const ownerAnnualLease = solarInvestment?.annualLeaseRevenue ?? solarFinancials?.annualLeaseRevenue ?? ownerMonthlyLease * 12;
  const ownerNpv20yr = solarInvestment?.ownerNPV20yr ?? solar.finalNPV;
  const operatorIrr = solarInvestment?.irrPercent;
  const operatorPayback = solarInvestment?.breakEvenYears;
  const operatorInstallLow = solarInvestment?.installCostLow;
  const operatorInstallHigh = solarInvestment?.installCostHigh;
  const operatorNetAfterItc = solarInvestment?.netInstallCost;
  const operatorAnnualEnergyValue = solarInvestment?.annualEnergyValue;
  const operatorItcValue = solarInvestment?.itcValue;
  const operatorProfit20 = solarInvestment?.totalProfit20yr;
  const stateRate = solarInvestment?.rateCentsPerKwh;
  const estDcCostLow = dcEconomics?.dcCapacityMW ? dcEconomics.dcCapacityMW * 5_000_000 : null;
  const estDcCostHigh = dcEconomics?.dcCapacityMW ? dcEconomics.dcCapacityMW * 8_000_000 : null;
  const dcPanelTheme = (dcScore || 0) <= 45
    ? 'bg-emerald-50 border-emerald-200'
    : (dcScore || 0) >= 65
      ? 'bg-red-50 border-red-200'
      : 'bg-slate-50 border-slate-200';

  const chartData = solar.cashFlows.map((sf, i) => {
    const dcBase = dc.cashFlows[i] || {};
    const dcSat = scenarios.dcMarketSaturation.cashFlows[i] || {};
    return {
      year: sf.year,
      Solar: sf.cumulative,
      'DC Base': dcBase.cumulative,
      'DC Saturation': dcSat.scenarioCumulative,
    };
  });

  const satNPV = dc.finalNPV + scenarios.dcMarketSaturation.npvImpact;

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          title="Solar 20-Year NPV"
          value={formatCurrency(solar.finalNPV)}
          subtitle={solar.breakEvenYear ? `Break-even Year ${solar.breakEvenYear}` : 'No break-even (20yr)'}
          color="green"
          icon="☀️"
        />
        <SummaryCard
          title="DC 20-Year NPV"
          value={formatCurrency(dc.finalNPV)}
          subtitle={dc.breakEvenYear ? `Break-even Year ${dc.breakEvenYear}` : 'No break-even (20yr)'}
          color={dc.finalNPV > solar.finalNPV ? 'amber' : 'gray'}
          icon="🏢"
        />
        <SummaryCard
          title="Solar Advantage"
          value={formatCurrency(summary.solarAdvantageNPV)}
          subtitle="Solar NPV vs DC base case"
          color={summary.solarAdvantageNPV > 0 ? 'emerald' : 'orange'}
          icon={summary.solarAdvantageNPV > 0 ? '✅' : '⚠️'}
        />
      </div>

      {/* Break-Even Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Cumulative Cash Flow — Solar vs Data Center</h3>
            <p className="text-xs text-slate-700 mt-0.5">20-year horizon, adjusted for market conditions and resource costs</p>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setActiveScenario('base')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeScenario === 'base' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}
            >
              Base Case
            </button>
            <button
              onClick={() => setActiveScenario('saturation')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeScenario === 'saturation' ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}
            >
              + Saturation Risk
            </button>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 5, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              label={{ value: 'Year', position: 'insideBottom', offset: -4, fontSize: 11, fill: '#94a3b8' }}
            />
            <YAxis
              tickFormatter={formatCurrency}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              width={60}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, color: '#64748b', paddingTop: 8 }}
              iconType="plainline"
            />
            <ReferenceLine
              y={0}
              stroke="#cbd5e1"
              strokeDasharray="5 5"
              label={{ value: 'Break-even', fill: '#94a3b8', fontSize: 10, position: 'insideTopLeft' }}
            />
            <Line type="monotone" dataKey="Solar" stroke="#16a34a" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="DC Base" stroke="#6366f1" strokeWidth={2} dot={false} />
            {activeScenario === 'saturation' && (
              <Line
                type="monotone"
                dataKey="DC Saturation"
                stroke="#f97316"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>

        {activeScenario === 'saturation' && (
          <div className="mt-3 bg-orange-50 border border-orange-200 rounded-lg p-3">
            <p className="text-xs text-orange-700 font-medium mb-0.5">⚠️ Saturation Scenario</p>
            <p className="text-xs text-orange-600">
              3–5 new data centers established within 15 miles by Year 3 compress colocation rates an additional 15%.
              DC 20-yr NPV drops to {formatCurrency(satNPV)}.
              Break-even: {scenarios.dcMarketSaturation.breakEvenYear ? `Year ${scenarios.dcMarketSaturation.breakEvenYear}` : 'Never within 20 years'}.
            </p>
          </div>
        )}
      </div>

      {/* Financial summary bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <h3 className="text-xs font-black tracking-widest text-slate-600 mb-2">FINANCIAL SUMMARY</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <div className="text-xs text-slate-600">Building Owner Earns</div>
            <div className="font-semibold text-slate-900">{formatCurrency(ownerMonthlyLease)}/mo | {formatCurrency(ownerNpv20yr)} NPV</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            <div className="text-xs text-slate-600">Solar Landscape ROI</div>
            <div className="font-semibold text-slate-900">{operatorIrr == null ? '—' : `${operatorIrr}% IRR`} | {operatorPayback == null ? '—' : `${operatorPayback} yr payback`}</div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <div className="text-xs text-slate-600">vs. Data Center</div>
            <div className="font-semibold text-slate-900">{dcScore ?? '—'}/100 viable</div>
          </div>
        </div>
      </div>

      {/* 3-panel comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Panel 1: Solar owner perspective */}
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">☀️</span>
            <h3 className="font-semibold text-green-800 text-sm">Solar: Owner Perspective</h3>
            <span className="ml-auto text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full font-medium">
              Income Stream
            </span>
          </div>
          <div className="space-y-1 divide-y divide-green-100">
            <FinRow label="Monthly Lease Payment" value={formatCurrency(ownerMonthlyLease)} positive />
            <FinRow label="Annual Lease Revenue" value={formatCurrency(ownerAnnualLease)} />
            <FinRow label="Time to First Payment" value="6–8 weeks" />
            <FinRow label="Upfront Cost to Owner" value="$0" positive />
            <FinRow label={<span>20-Year Lease NPV<InfoTip text="Net Present Value: total future lease payments in today's dollars, discounted at 5%/year" /></span>} value={formatCurrency(ownerNpv20yr)} positive />
            <FinRow label="Lease Escalation" value="2% per year" />
            <FinRow label="Construction Risk to Owner" value="None" positive />
          </div>
        </div>

        {/* Panel 2: Solar Landscape perspective */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📈</span>
            <h3 className="font-semibold text-blue-800 text-sm">Solar: Solar Landscape Perspective</h3>
            <span className="ml-auto text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full font-medium">
              Investment Case
            </span>
          </div>
          <div className="space-y-1 divide-y divide-blue-100">
            <FinRow label="System Size" value={solarInvestment?.systemSizeKw ? `${solarInvestment.systemSizeKw} kW` : '—'} />
            <FinRow label="Total Install Cost" value={operatorInstallLow && operatorInstallHigh ? `${formatCurrency(operatorInstallLow)} – ${formatCurrency(operatorInstallHigh)}` : '—'} />
            <FinRow label={<span>Federal ITC (30%)<InfoTip text="Federal Investment Tax Credit: 30% of install cost deducted from taxes under the Inflation Reduction Act" /></span>} value={formatCurrency(operatorItcValue)} positive />
            <FinRow label="Net Cost After ITC" value={formatCurrency(operatorNetAfterItc)} negative />
            <FinRow label="Annual Energy Revenue" value={formatCurrency(operatorAnnualEnergyValue)} />
            <FinRow label={<span>Solar Landscape Break-Even<InfoTip text="Years until Solar Landscape's cumulative energy revenue covers the net installation cost" /></span>} value={operatorPayback == null ? '—' : `${operatorPayback} years`} positive />
            <FinRow label={<span>Project IRR (25yr)<InfoTip text="Internal Rate of Return: Solar Landscape's annualized investment return over 25 years" /></span>} value={operatorIrr == null ? '—' : `${operatorIrr}%`} positive />
            <FinRow label="20-Year Net Profit" value={formatCurrency(operatorProfit20)} positive={operatorProfit20 > 0} negative={operatorProfit20 < 0} />
            <FinRow label="Annual O&M Cost" value="~1% of install" />
            <FinRow label={<span>Panel Degradation<InfoTip text="Solar panels lose ~0.5% efficiency per year — factored into all 25-year projections" /></span>} value="0.5%/year" />
          </div>
        </div>

        {/* Panel 3: Data center */}
        <div className={`border rounded-2xl p-5 ${dcPanelTheme}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🏢</span>
            <h3 className="font-semibold text-sm text-slate-900">Data Center</h3>
            <span className="ml-auto text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium">
              {formatCurrency(dc.totalCapexAdjusted)} CapEx
            </span>
          </div>
          <div className="space-y-1 divide-y divide-slate-100">
            <FinRow label="Capital Required" value={formatCurrency(dc.totalCapexAdjusted)} negative />
            <FinRow label="Est. Construction Cost" value={estDcCostLow && estDcCostHigh ? `${formatCurrency(estDcCostLow)} – ${formatCurrency(estDcCostHigh)}` : '—'} />
            <FinRow label="Time to Revenue" value="18–36 months" />
            <FinRow label="Colo Rate" value={`$${dc.adjustedColoRate ?? dcEconomics?.coloRatePerKwMonth ?? '—'}/kW/mo`} />
            <FinRow label="Year 1 Revenue" value={formatCurrency(dc.cashFlows[1]?.revenue)} />
            <FinRow label="Year 3 Revenue" value={formatCurrency(dc.cashFlows[3]?.revenue)} />
            <FinRow label="Annual Opex" value={formatCurrency(dc.adjustedAnnualOpex)} negative />
            <FinRow label={<span>Break-Even<InfoTip text="Years until Solar Landscape's cumulative energy revenue covers the net installation cost" /></span>} value={dc.breakEvenYear ? `Year ${dc.breakEvenYear}` : 'Never (20yr)'} />
            <FinRow label="Project Success Rate" value={(dcScore || 0) >= 65 ? 'High' : (dcScore || 0) >= 45 ? 'Moderate' : 'Low'} />
            <FinRow label="Upfront Owner Investment" value="Significant" negative />
            <FinRow label="DC Feasibility Score" value={`${dcScore ?? '—'}/100`} />
            <FinRow label="20-Year Cumulative" value={formatCurrency(dc.cashFlows[20]?.cumulative)} />
            <FinRow label="20-Year NPV (8%)" value={formatCurrency(dc.finalNPV)} />
            <FinRow label="Saturation NPV" value={formatCurrency(satNPV)} negative />
            <FinRow label="DC Capacity" value={`${dcEconomics?.dcCapacityMW ?? '—'} MW`} muted />
          </div>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 leading-relaxed">
        <span className="font-semibold text-slate-700">Assumptions:</span> Commercial rooftop install cost $1.80–$2.20/W (Wood Mackenzie 2024).
        Federal ITC 30% per Inflation Reduction Act. Lease escalation 2%/yr. Panel degradation 0.5%/yr. Discount rate 5%.
        State electricity rate: {stateRate ? `${stateRate}¢/kWh` : 'N/A'} (EIA). DC construction cost $5–8M/MW (Cushman & Wakefield).
        Solar projections from Google Solar API. Data center financials are estimates; actual returns vary by operator and market conditions.
      </div>

      {/* Competitive landscape callout */}
      {dcLandscape && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <span className="text-base mt-0.5">📍</span>
            <div>
              <p className="text-sm font-semibold text-indigo-800 mb-1">Local DC Market Impact</p>
              <p className="text-sm text-indigo-700">{dcLandscape.narrative}</p>
              <p className="text-xs text-indigo-500 mt-1.5">
                {dcLandscape.counts.within15Miles} data centers within 15 miles · Market: <strong>{dcLandscape.saturationLevel}</strong> ·
                Colo rate adjusted {((dcLandscape.coloRateMultiplier - 1) * 100).toFixed(0)}% vs national benchmark ·
                DC score modifier: {dcLandscape.marketSaturationDCScoreEffect > 0 ? '+' : ''}{dcLandscape.marketSaturationDCScoreEffect} pts
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Resource feasibility callout */}
      {detailedFinancials && (dc.totalCapexAdjusted > (dcEconomics?.totalCapex ?? dc.totalCapexAdjusted)) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <span className="text-base mt-0.5">⚡</span>
            <div>
              <p className="text-sm font-semibold text-amber-800 mb-1">Resource Cost Adjustments Applied to DC CapEx</p>
              <p className="text-xs text-amber-700">
                Base CapEx: {formatCurrency(dcEconomics?.totalCapex)} → Adjusted: {formatCurrency(dc.totalCapexAdjusted)} (includes grid interconnection cost adder and cooling climate adjustment).
                These adjustments reflect actual resource constraints at this location.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
