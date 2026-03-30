export default function AIReport({ roofReport, criteriaCount }) {
  if (!roofReport) return null;

  const CANONICAL_HEADINGS = [
    'THE VERDICT',
    'THE DATA CENTER REALITY CHECK',
    'THE SOLAR OPPORTUNITY',
  ];

  const normalizedReport = roofReport
    .replace(/\r\n/g, '\n')
    .replace(/^\s*#{1,6}\s*/gm, '') // strip markdown heading markers like ###
    .replace(/\*\*/g, '') // strip bold markers used by LLM output
    .replace(/([A-Za-z])\n([a-z])/g, '$1$2'); // join accidental line breaks inside words

  const withHeadingsOnOwnLine = CANONICAL_HEADINGS.reduce(
    (txt, heading) => txt.replace(new RegExp(`\\s*${heading}:?\\s*`, 'gi'), `\n\n${heading}\n`),
    normalizedReport,
  );
  const sections = withHeadingsOnOwnLine
    .split(/\n\s*\n/)
    .map(s => s.trim())
    .filter(Boolean);

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl p-6 my-2 shadow-sm border border-indigo-100">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5 pb-4 border-b border-indigo-200">
        <div className="w-9 h-9 bg-indigo-500 rounded-full flex items-center justify-center text-sm font-bold shrink-0 shadow-sm text-white">
          AI
        </div>
        <div>
          <h3 className="font-bold text-slate-900 text-base">GoSolar Analyst Report</h3>
          <p className="text-xs text-slate-700">
            AI-generated from {criteriaCount || 12} real data sources · Powered by GPT-4o mini
          </p>
        </div>
        <div className="ml-auto">
          <span className="text-xs bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-1 rounded-full font-medium">
            v4 · Live data
          </span>
        </div>
      </div>

      {/* Report Sections */}
      <div className="space-y-4 text-sm leading-relaxed">
        {sections.map((section, i) => {
          const trimmed = section.trim();
          if (!trimmed) return null;

          // Detect uppercase section heading on first line
          const headerMatch = trimmed.match(/^([A-Z][A-Z\s]{4,})\s*\n([\s\S]*)$/);
          if (headerMatch) {
            const header = headerMatch[1].trim();
            const body = (headerMatch[2] || '').trim();
            const sectionColors = [
              'border-l-4 border-indigo-400 pl-4',
              'border-l-4 border-orange-400 pl-4',
              'border-l-4 border-green-500 pl-4',
            ];
            const headerColors = ['text-indigo-600', 'text-orange-600', 'text-green-700'];
            return (
              <div key={i} className={sectionColors[i % 3] || 'border-l-4 border-slate-300 pl-4'}>
                <h4 className={`text-sm font-extrabold uppercase tracking-wide mb-2 ${headerColors[i % 3] || 'text-slate-500'}`}>
                  {header}
                </h4>
                <p className="text-slate-900 leading-7 whitespace-pre-line">{body}</p>
              </div>
            );
          }

          // First paragraph — larger text as verdict
          if (i === 0) {
            return (
              <p key={i} className="text-base font-medium text-slate-800 border-l-4 border-indigo-400 pl-3">
                {trimmed}
              </p>
            );
          }

          return <p key={i} className="text-slate-900">{trimmed}</p>;
        })}
      </div>

      {/* Disclaimer */}
      <p className="mt-5 pt-3 border-t border-indigo-200 text-xs text-slate-600">
        Generated from real site data · Not financial advice · GoSolar demo tool
      </p>
    </div>
  );
}
