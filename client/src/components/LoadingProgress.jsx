import { useState, useEffect } from 'react';

const STEPS = [
  { id: 'geocode',     label: 'Geocoding & validating address...',                icon: '📍', duration: 1500 },
  { id: 'solar_api',  label: 'Analyzing rooftop with Google Solar API...',        icon: '☀️', duration: 3000 },
  { id: 'flood',      label: 'Checking FEMA flood zone & NFIP claims...',         icon: '🌊', duration: 2000 },
  { id: 'broadband',  label: 'Analyzing fiber & broadband coverage...',            icon: '📡', duration: 1500 },
  { id: 'nri',        label: 'Checking seismic hazard (USGS)...',                 icon: '🏔️', duration: 1500 },
  { id: 'power',      label: 'Analyzing power grid & electricity costs...',       icon: '⚡', duration: 1500 },
  { id: 'ixp',        label: 'Finding nearest Internet Exchange Points...',       icon: '🌐', duration: 1500 },
  { id: 'places',     label: 'Classifying building type (Google Places)...',      icon: '🏢', duration: 1500 },
  { id: 'dc_scan',    label: 'Scanning for nearby data centers...',               icon: '🔭', duration: 2500 },
  { id: 'resources',  label: 'Evaluating water, grid & cooling feasibility...',   icon: '💧', duration: 2000 },
  { id: 'census',     label: 'Analyzing tech sector & disaster history...',       icon: '📊', duration: 1500 },
  { id: 'nasa',       label: 'Fetching NASA climate & wind data...',              icon: '🛰️', duration: 1500 },
  { id: 'financials', label: 'Running break-even financial model...',             icon: '📈', duration: 1000 },
  { id: 'scoring',    label: 'Computing DC/Solar scores...',                      icon: '🧮', duration: 1000 },
  { id: 'ai',         label: 'Running AI analyst report (GPT-4o mini)...',        icon: '🤖', duration: 4000 },
];

export default function LoadingProgress() {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);

  useEffect(() => {
    let stepIndex = 0;

    const advance = () => {
      if (stepIndex < STEPS.length) {
        const step = STEPS[stepIndex];
        setCurrentStep(stepIndex);

        const timer = setTimeout(() => {
          setCompletedSteps(prev => [...prev, stepIndex]);
          stepIndex++;
          advance();
        }, step.duration);

        return () => clearTimeout(timer);
      }
    };

    advance();
  }, []);

  const progressPct = Math.round((completedSteps.length / STEPS.length) * 100);

  return (
    <div className="w-full max-w-2xl mx-auto animate-fade-in">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3 animate-pulse-slow">🔍</div>
          <h2 className="text-xl font-bold text-slate-900">Running Multi-Source Analysis</h2>
          <p className="text-slate-700 text-sm mt-1">Fetching data from 16+ sources simultaneously...</p>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-slate-800 mb-2 font-medium">
            <span>Progress</span>
            <span className="text-slate-900">{progressPct}%</span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Steps list */}
        <div className="space-y-1">
          {STEPS.map((step, i) => {
            const isCompleted = completedSteps.includes(i);
            const isCurrent = currentStep === i && !isCompleted;

            return (
              <div
                key={step.id}
                className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-all duration-300 ${
                  isCurrent ? 'bg-amber-50 border border-amber-200' :
                  isCompleted ? 'opacity-50' : 'opacity-25'
                }`}
              >
                <div className="w-6 text-center text-base leading-none">
                  {isCompleted ? (
                    <span className="text-emerald-500 font-bold text-sm">✓</span>
                  ) : isCurrent ? (
                    <span className="animate-pulse">{step.icon}</span>
                  ) : (
                    <span>{step.icon}</span>
                  )}
                </div>
                <span className={`text-sm flex-1 ${
                  isCurrent ? 'text-amber-900 font-semibold' :
                  isCompleted ? 'text-slate-600 line-through' :
                  'text-slate-500'
                }`}>
                  {step.label}
                </span>
                {isCurrent && (
                  <div className="flex gap-1">
                    {[0, 1, 2].map(dot => (
                      <div
                        key={dot}
                        className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${dot * 150}ms` }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-slate-700 mt-6 font-medium">
          Analysis typically takes 25–45 seconds · AI report included
        </p>
      </div>
    </div>
  );
}
