import { useEffect, useState } from 'react';
import { useSyncProgress } from '../../store/syncProgressStore';
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';

export default function SyncProgress() {
  const { isActive, steps, resetSync } = useSyncProgress();
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (isActive) {
      setIsVisible(true);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;

    // Check if all steps are finished
    const allFinished = steps.length > 0 && steps.every(s => s.status === 'success' || s.status === 'error');
    
    if (allFinished && !isHovered) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(resetSync, 300); // Wait for transition before resetting state
      }, 10000);
      
      return () => clearTimeout(timer);
    }
  }, [isActive, steps, resetSync, isHovered]);

  if (!isActive && !isVisible) return null;

  return (
    <div 
      className={`fixed top-0 left-0 right-0 z-50 pointer-events-none transition-all duration-300 ease-in-out ${
        isVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      }`}
    >
      <div 
        className="max-w-4xl mx-auto mt-4 px-4 pointer-events-auto"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="bg-white/90 backdrop-blur shadow-lg rounded-2xl p-4 border border-slate-200">
          <div className="flex items-center justify-between gap-2">
            {steps.map((step, index) => {
              const isLast = index === steps.length - 1;
              return (
                <div key={step.id} className="flex-1 flex items-center group relative">
                  {/* Step content */}
                  <div className="flex items-center gap-2 relative z-10 bg-white/50 px-2">
                    {step.status === 'success' && <CheckCircle2 className="text-emerald-500 w-5 h-5" />}
                    {step.status === 'error' && <XCircle className="text-red-500 w-5 h-5" />}
                    {step.status === 'active' && <Loader2 className="text-blue-500 w-5 h-5 animate-spin" />}
                    {step.status === 'pending' && <Circle className="text-slate-300 w-5 h-5" />}
                    
                    <span className={`text-sm font-medium whitespace-nowrap ${
                      step.status === 'active' ? 'text-blue-700' :
                      step.status === 'pending' ? 'text-slate-400' :
                      step.status === 'error' ? 'text-red-700' :
                      'text-emerald-700'
                    }`}>
                      {step.label}
                    </span>
                  </div>

                  {/* Connector line */}
                  {!isLast && (
                    <div className="flex-1 h-0.5 mx-2 bg-slate-100 relative overflow-hidden">
                      <div className={`absolute top-0 bottom-0 left-0 transition-all duration-500 ${
                        step.status === 'success' || step.status === 'error' ? 'w-full bg-emerald-200' :
                        step.status === 'active' ? 'w-1/2 bg-blue-200 animate-pulse' : 'w-0'
                      }`} />
                    </div>
                  )}

                  {/* Tooltip or Details */}
                  {(step.tooltip || step.details) && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 transform group-hover:translate-y-0 translate-y-1 z-50">
                      {step.details ? (
                        <div className="bg-slate-900 text-slate-200 p-4 rounded-xl shadow-2xl border border-slate-700 min-w-[320px] max-w-lg pointer-events-auto flex flex-col gap-3">
                          <div className="flex flex-col gap-2">
                            <div className="text-sm font-semibold text-emerald-400 mb-1 border-b border-slate-700 pb-2">
                              תוצאות הניתוח החכם (AI)
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="bg-slate-800 p-2 rounded-lg flex flex-col items-center justify-center">
                                <span className="text-slate-400">עסקאות שסווגו</span>
                                <span className="text-lg font-bold text-white">{step.details.categorizedTxns} <span className="text-[10px] font-normal text-slate-500">מתוך {step.details.totalTxns}</span></span>
                              </div>
                              <div className="bg-slate-800 p-2 rounded-lg flex flex-col items-center justify-center">
                                <span className="text-slate-400">בתי עסק ייחודיים</span>
                                <span className="text-lg font-bold text-white">{step.details.uniqueBusinesses}</span>
                              </div>
                              <div className="bg-slate-800 p-2 rounded-lg flex flex-col items-center justify-center">
                                <span className="text-slate-400">עסקאות לקישור</span>
                                <span className="text-lg font-bold text-emerald-300">{step.details.toLinkCount}</span>
                              </div>
                              <div className="bg-slate-800 p-2 rounded-lg flex flex-col items-center justify-center">
                                <span className="text-slate-400">עסקאות למחיקה</span>
                                <span className="text-lg font-bold text-rose-300">{step.details.toDeleteCount}</span>
                              </div>
                            </div>
                          </div>

                          {step.details.log && (
                            <div className="mt-2 flex flex-col gap-1">
                              <div className="text-xs text-slate-500 font-medium px-1">לוג ניתוח (Snapshot)</div>
                              <div className="bg-slate-950/80 rounded-lg overflow-x-auto max-h-40 overflow-y-auto text-[10px] text-slate-400 p-2 border border-slate-800" dir="ltr" style={{ scrollbarGutter: 'stable' }}>
                                <div className="text-slate-300 font-semibold mb-1">Prompt:</div>
                                <pre className="whitespace-pre-wrap">{step.details.log.prompt}</pre>
                                <div className="text-slate-300 font-semibold mt-3 mb-1">Response:</div>
                                <pre className="whitespace-pre-wrap">{step.details.log.response}</pre>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-slate-900 text-white text-xs rounded-lg px-3 py-2 max-w-xs w-max whitespace-pre-wrap shadow-xl">
                          {step.tooltip}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
