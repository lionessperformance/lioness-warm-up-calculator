import React, { useMemo, useState, useEffect } from "react";

const BAR_KG = 20;
const ROUNDING = 2.5;

const roundTo = (val, step) => (isNaN(val) ? 0 : Math.round(val / step) * step);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export default function App() {
  const [lift, setLift] = useState("Squat");
  const [unit] = useState("kg");
  const [quickRepsPattern, setQuickRepsPattern] = useState("3x6");
  const [lastWeekWeights, setLastWeekWeights] = useState("60, 62.5, 65");
  const [felt, setFelt] = useState("solid");
  const [progressionMode, setProgressionMode] = useState("kg");

  const defaultKgIncrements = useMemo(
    () =>
      lift === "Bench"
        ? { easy: 2.5, solid: 1.25, hard: 0, missed: -1.25 }
        : { easy: 5, solid: 2.5, hard: 0, missed: -2.5 },
    [lift]
  );
  const [kgInc, setKgInc] = useState(defaultKgIncrements);
  useEffect(() => setKgInc(defaultKgIncrements), [defaultKgIncrements]);

  const [pctInc, setPctInc] = useState({ easy: 5, solid: 2.5, hard: 0, missed: -2.5 });

  const [wuOffset, setWuOffset] = useState(5);
  const [superHeavy, setSuperHeavy] = useState(false);

  function parseSetsPattern(s) {
    const m = s.trim().match(/^(\d+)\s*[xX]\s*(\d+)$/);
    if (m) {
      const sets = parseInt(m[1], 10);
      const reps = Array.from({ length: sets }, () => parseInt(m[2], 10));
      return { sets, reps };
    }
    const parts = s.split(/[,-]+/).map((t) => t.trim()).filter(Boolean);
    if (parts.every((p) => /^\d+$/.test(p))) {
      const reps = parts.map((p) => parseInt(p, 10));
      return { sets: reps.length, reps };
    }
    return { sets: 0, reps: [] };
  }

  const quickParsed = useMemo(() => parseSetsPattern(quickRepsPattern), [quickRepsPattern]);
  const lastWeights = useMemo(
    () => lastWeekWeights.split(/[^0-9.]+/).map((s) => parseFloat(s)).filter((n) => !isNaN(n)),
    [lastWeekWeights]
  );

  const suggestionDelta = useMemo(() => {
    if (progressionMode === "kg") return kgInc[felt] ?? 0;
    const avg = lastWeights.length ? lastWeights.reduce((a, b) => a + b, 0) / lastWeights.length : 0;
    return roundTo((avg * (pctInc[felt] ?? 0)) / 100, ROUNDING);
  }, [progressionMode, kgInc, pctInc, felt, lastWeights]);

  const suggestedWeights = useMemo(() => {
    const sets = quickParsed.sets || lastWeights.length;
    const baseArr = sets
      ? lastWeights.length === sets
        ? lastWeights
        : Array.from({ length: sets }, (_, i) => lastWeights[i] ?? lastWeights[lastWeights.length - 1] ?? 0)
      : lastWeights;
    return baseArr.map((w) => roundTo((w ?? 0) + suggestionDelta, ROUNDING));
  }, [quickParsed, lastWeights, suggestionDelta]);

  const firstWorking = suggestedWeights[0] || 0;
  const firstWorkingReps = quickParsed.reps[0] || quickParsed.reps.find(Boolean) || 0;

  function generateGymWarmups(firstSet, firstReps, isHeavy, offsetKg) {
    if (!firstSet || !firstReps) return [];
    const offset = clamp(offsetKg, 5, 10);
    const lastWU = roundTo(Math.max(BAR_KG, firstSet - offset), ROUNDING);

    const count = isHeavy ? 4 : 3;
    const jump = clamp(Math.round(offset / 2), 5, 10);

    const weights = [];
    for (let i = count - 1; i >= 0; i--) {
      if (i === count - 1) weights[i] = lastWU;
      else weights[i] = roundTo(Math.max(BAR_KG, weights[i + 1] - jump), ROUNDING);
    }

    const lastReps = Math.max(1, Math.floor(firstReps / 2));
    const baseReps = isHeavy ? [5, 3, 1, lastReps] : [5, 3, lastReps];

    return weights.map((w, idx) => ({ reps: baseReps[idx], weight: w }));
  }

  const autoWarmups = useMemo(
    () => generateGymWarmups(firstWorking, firstWorkingReps, superHeavy, wuOffset),
    [firstWorking, firstWorkingReps, superHeavy, wuOffset]
  );

  return (
    <div className="w-full min-h-screen bg-white text-gray-900 p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-semibold brand-heading mb-2">
          Main Lift Warm-Up & Working Set Calculator
        </h1>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm mb-1">Lift</label>
            <select className="w-full border rounded-2xl p-2" value={lift} onChange={(e) => setLift(e.target.value)}>
              <option>Squat</option>
              <option>Bench</option>
              <option>Deadlift</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Working sets reps</label>
            <input className="w-full border rounded-2xl p-2 font-mono" value={quickRepsPattern} onChange={(e) => setQuickRepsPattern(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm mb-1">Last week weights ({unit})</label>
            <input className="w-full border rounded-2xl p-2 font-mono" value={lastWeekWeights} onChange={(e) => setLastWeekWeights(e.target.value)} />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm mb-1">How did it feel?</label>
            <div className="flex gap-2">
              {["easy","solid","hard","missed"].map(k => (
                <label key={k} className="text-sm">
                  <input type="radio" checked={felt===k} onChange={()=>setFelt(k)} /> {k}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm mb-1">Progression</label>
            <div>
              <label><input type="radio" checked={progressionMode==="kg"} onChange={()=>setProgressionMode("kg")} /> by kg</label>
              <label><input type="radio" checked={progressionMode==="percent"} onChange={()=>setProgressionMode("percent")} /> by %</label>
            </div>
          </div>
        </div>

        <div className="border rounded-2xl p-4 mb-6">
          <h2 className="font-semibold mb-2">Suggested working sets</h2>
          {suggestedWeights.map((w,i) => (
            <div key={i}>{(quickParsed.reps[i] ?? quickParsed.reps[0])} × {w.toFixed(1)} {unit}</div>
          ))}
        </div>

        <div className="border rounded-2xl p-4">
          <h2 className="font-semibold mb-2">Warm-ups</h2>
          {autoWarmups.map((r,i) => (
            <div key={i}>{r.reps} × {r.weight.toFixed(1)} {unit}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
