import { useEffect, useState, useRef } from 'react';

const CIRCUMFERENCE = 2 * Math.PI * 54; // r=54
const ARC_FRACTION = 0.75; // 270° arc

function getColor(score, type) {
  if (type === 'dc') {
    if (score >= 70) return ['#ef4444', '#dc2626']; // red
    if (score >= 50) return ['#f97316', '#ea580c']; // orange
    if (score >= 35) return ['#eab308', '#ca8a04']; // yellow
    return ['#22c55e', '#16a34a']; // green
  } else {
    if (score >= 70) return ['#22c55e', '#4ade80']; // green
    if (score >= 50) return ['#84cc16', '#65a30d']; // lime
    if (score >= 35) return ['#eab308', '#ca8a04']; // yellow
    return ['#f97316', '#ea580c']; // orange
  }
}

function getLabel(score, type) {
  if (type === 'dc') {
    if (score >= 75) return 'Strong DC';
    if (score >= 60) return 'Lean DC';
    if (score >= 45) return 'Neutral';
    if (score >= 30) return 'Lean Solar';
    return 'Solar Wins';
  } else {
    if (score >= 75) return 'Excellent';
    if (score >= 60) return 'Very Good';
    if (score >= 45) return 'Good';
    if (score >= 30) return 'Fair';
    return 'Low';
  }
}

export default function ScoreGauge({ score, type, title, subtitle }) {
  const [displayed, setDisplayed] = useState(0);
  const animRef = useRef(null);

  useEffect(() => {
    let start = null;
    const duration = 1400;
    const targetScore = score ?? 0;

    const step = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setDisplayed(Math.round(eased * targetScore));
      if (progress < 1) animRef.current = requestAnimationFrame(step);
    };

    animRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRef.current);
  }, [score]);

  const [colorFrom, colorTo] = getColor(displayed, type);
  const label = getLabel(displayed, type);

  // Arc calculation
  const arcPct = (displayed / 100) * ARC_FRACTION;
  const dashArray = CIRCUMFERENCE;
  const dashOffset = CIRCUMFERENCE * (1 - arcPct);

  // Rotation: start from -135deg (bottom-left), arc goes to top-right
  const startAngle = -225; // degrees

  const gradId = `gauge-grad-${type}`;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-48 h-48">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-[225deg]">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={colorFrom} />
              <stop offset="100%" stopColor={colorTo} />
            </linearGradient>
          </defs>

          {/* Track */}
          <circle
            cx="60" cy="60" r="54"
            fill="none"
            strokeWidth="10"
            stroke="rgba(0,0,0,0.06)"
            strokeDasharray={`${ARC_FRACTION * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeLinecap="round"
          />

          {/* Progress arc */}
          <circle
            cx="60" cy="60" r="54"
            fill="none"
            strokeWidth="10"
            stroke={`url(#${gradId})`}
            strokeDasharray={`${arcPct * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset="0"
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.05s linear' }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            className="text-5xl font-black tabular-nums"
            style={{ color: colorFrom }}
          >
            {displayed}
          </div>
          <div className="text-xs text-slate-600 font-medium mt-0.5">/100</div>
          <div
            className="text-xs font-bold mt-1 px-2 py-0.5 rounded-full"
            style={{ color: colorFrom, background: `${colorFrom}18` }}
          >
            {label}
          </div>
        </div>
      </div>

      <div className="text-center mt-3">
        <div className="font-bold text-slate-800 text-lg">{title}</div>
        {subtitle && <div className="text-xs text-slate-700 mt-0.5 font-medium">{subtitle}</div>}
      </div>
    </div>
  );
}
