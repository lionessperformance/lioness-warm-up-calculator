import React, { useMemo, useState, useEffect } from "react";

const BAR_KG = 20;
const ROUNDING = 2.5;

const roundTo = (val, step) => (isNaN(val) ? 0 : Math.round(val / step) * step);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export default function App() {
  const [lift, setLift] = useState("Squat");
  const [unit] = useState("kg");
  const [quickRepsPattern, setQuickRepsPattern] = useState("3x4");
  const [lastWeekWeights, setLastWeekWeights] = useState("90, 92.5, 95");
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

  const [wuOffset, setWuOffset] = useState(7.5);
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
    () => lastWeekWeights.split(/[\n,]+/).map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n)),
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

  // --- New progressive warm-up logic ---
  function progressiveWarmups(firstSet, firstReps, isHeavy, offsetKg) {
    if (!firstSet || !firstReps) return [];
    const offset = clamp(offsetKg, 5, 10);
    const lastWU = roundTo(Math.max(BAR_KG, firstSet - offset), ROUNDING);

    // start around 60–65% of first set; but never above 70%
    let start = roundTo(Math.max(BAR_KG, firstSet * 0.62), ROUNDING);
    if (start > firstSet * 0.7) start = roundTo(Math.max(BAR_KG, firstSet * 0.55), ROUNDING);

    // if start too close to lastWU, pull it further down (not scary heavy)
    if (lastWU - start < 12.5) {
      start = roundTo(Math.max(BAR_KG, Math.min(firstSet * 0.55, lastWU - 12.5)), ROUNDING);
    }

    // we want decreasing jump sizes: big -> medium -> small (towards lastWU)
    const span = Math.max(0, lastWU - start);

    // choose step2 (closer to lastWU) in [5..10], and step1 (earlier) in [10..20]
    let step2 = clamp(roundTo(span * 0.35, 2.5), 5, 10);
    let step1 = clamp(roundTo(span - step2, 2.5), 10, 20);

    // recompute start to match steps
    let mid = roundTo(lastWU - step2, ROUNDING);
    start = roundTo(Math.max(BAR_KG, mid - step1), ROUNDING);

    // safety: ensure monotonic increasing ladder and not below bar
    if (start < BAR_KG) start = BAR_KG;
    if (mid <= start) mid = roundTo(start + Math.max(7.5, step2), ROUNDING);
    if (mid >= lastWU) mid = roundTo(lastWU - 5, ROUNDING);
    if (mid <= start) mid = roundTo((start + lastWU) / 2, ROUNDING);

    const lastReps = Math.max(1, Math.floor(firstReps / 2));
    // Optional reps pattern: 1st a bit higher, 2nd moderate, last = half
    const reps1 = Math.min(8, Math.max(6, firstReps + 2));
    const reps2 = Math.max(4, Math.round(firstReps * 0.75));

    const base = [
      { reps: reps1, weight: start },
      { reps: reps2, weight: mid },
      { reps: lastReps, weight: lastWU }
    ];

    if (isHeavy) {
      // add an extra single just under lastWU (≈ 0.85–0.9 of first set) but below lastWU
      let heavySingle = roundTo(Math.min(lastWU - 5, Math.max(BAR_KG, firstSet * 0.85)), ROUNDING);
      // place it between mid and lastWU
      if (heavySingle <= mid) heavySingle = roundTo(mid + 5, ROUNDING);
      base.splice(2, 0, { reps: 1, weight: heavySingle });
    }

    // ensure increasing weights and unique values
    const seq = [];
    let prev = 0;
    for (const r of base) {
      if (r.weight > prev && r.weight < firstSet) {
        seq.push(r);
        prev = r.weight;
      }
    }
    return seq;
  }

  const autoWarmups = useMemo(
    () => progressiveWarmups(firstWorking, firstWorkingReps, superHeavy, wuOffset),
    [firstWorking, firstWorkingReps, superHeavy, wuOffset]
  );

  const header = `${lift} • ${unit.toUpperCase()}`;

  return (
    <div className="w-full min-h-screen bg-white text-gray-900 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl md:text-3xl font-semibold brand-heading">Main Lift Warm‑Up & Working Set Calculator</h1>
          <span className="hidden md:inline-flex px-3 py-1 rounded-full text-xs chip border brand-border">Lioness Performance</span>
        </div>
        <p className="text-sm text-gray-700 mb-6">
          Warm‑ups ramp with **bigger → smaller** jumps (easier starts), last warm‑up is **5–10 kg under** the first working set and uses **half the reps**.
        </p>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-1">Lift</label>
            <select className="w-full border rounded-2xl p-2" value={lift} onChange={(e) => setLift(e.target.value)}>
              <option>Squat</option>
              <option>Bench</option>
              <option>Deadlift</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Working sets reps</label>
            <input className="w-full border rounded-2xl p-2 font-mono" placeholder="3x4 or 4-4-4" value={quickRepsPattern} onChange={(e) => setQuickRepsPattern(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Last week weights ({unit})</label>
            <input className="w-full border rounded-2xl p-2 font-mono" placeholder="90, 92.5, 95" value={lastWeekWeights} onChange={(e) => setLastWeekWeights(e.target.value)} />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">How did it feel?</label>
            <div className="flex flex-wrap gap-3 text-sm">
              {["easy","solid","hard","missed"].map((k) => (
                <label key={k} className={`px-3 py-1 rounded-full cursor-pointer border ${felt===k?"chip":"bg-white"}`}>
                  <input type="radio" name="felt" className="mr-2" checked={felt===k} onChange={() => setFelt(k)} />{k}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Progression rule</label>
            <div className="flex items-center gap-4 mb-2 text-sm">
              <label className="flex items-center gap-2"><input type="radio" checked={progressionMode==="kg"} onChange={()=>setProgressionMode("kg")} />by kg</label>
              <label className="flex items-center gap-2"><input type="radio" checked={progressionMode==="percent"} onChange={()=>setProgressionMode("percent")} />by %</label>
            </div>
            {progressionMode === "kg" ? (
              <div className="grid grid-cols-4 gap-2 text-xs">
                {["easy","solid","hard","missed"].map((k) => (
                  <div key={k}>
                    <label className="block capitalize mb-1">{k}</label>
                    <input type="number" step={0.25} className="w-full border rounded-xl p-1" value={kgInc[k]} onChange={(e)=>setKgInc({...kgInc, [k]: parseFloat(e.target.value)})} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 text-xs">
                {["easy","solid","hard","missed"].map((k) => (
                  <div key={k}>
                    <label className="block capitalize mb-1">{k} %</label>
                    <input type="number" step={0.25} className="w-full border rounded-xl p-1" value={pctInc[k]} onChange={(e)=>setPctInc({...pctInc, [k]: parseFloat(e.target.value)})} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 mb-4">
          <label className="text-xs flex items-center gap-2">
            <input type="checkbox" checked={superHeavy} onChange={(e)=>setSuperHeavy(e.target.checked)} />
            Super heavy today (adds an extra single)
          </label>
          <div className="flex items-center gap-2 text-sm">
            <span>Last warm‑up offset</span>
            <input type="number" step={0.5} min={5} max={10} value={wuOffset} onChange={(e)=>setWuOffset(parseFloat(e.target.value)||7.5)} className="w-20 border rounded-xl p-1" />
            <span className="text-xs text-gray-600">kg under first working set</span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="border rounded-2xl p-3">
            <h3 className="font-semibold mb-2">Suggested working sets ({header})</h3>
            {suggestedWeights.length === 0 ? (
              <div className="text-sm text-gray-500">Add last week’s weights to get suggestions.</div>
            ) : (
              <ul className="space-y-2">
                {suggestedWeights.map((w, i) => (
                  <li key={`sugg-${i}`} className="flex items-start justify-between bg-white rounded-xl p-2 border brand-border">
                    <div className="font-medium">
                      {(quickParsed.reps[i] ?? quickParsed.reps[0] ?? "?")} × {w.toFixed(1)} {unit}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border rounded-2xl p-3">
            <h3 className="font-semibold mb-2">Auto warm‑ups (progressive)</h3>
            {autoWarmups.length === 0 ? (
              <div className="text-sm text-gray-500">Enter last week + feeling to see warm‑ups.</div>
            ) : (
              <ul className="space-y-2">
                {autoWarmups.map((r, idx) => (
                  <li key={`auto-${idx}`} className="flex items-start justify-between bg-white rounded-xl p-2 border brand-border">
                    <div className="font-medium">{r.reps} × {r.weight.toFixed(1)} {unit}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
