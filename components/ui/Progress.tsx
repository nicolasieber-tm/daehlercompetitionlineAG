export type ProgressProps = {
  /** Anzahl Schritte insgesamt (ohne den Abschluss-Screen). */
  total: number;
  /** Index des aktuellen Schritts, 0-basiert. */
  current: number;
};

/** Fortschrittsbalken wie .progress in der Vorschau: ein Strich pro Schritt. */
export function Progress({ total, current }: ProgressProps) {
  return (
    <div className="mb-7 flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={current + 1}>
      {Array.from({ length: total }, (_, i) => (
        <i
          key={i}
          className={[
            "block h-[3px] flex-1",
            i < current ? "bg-red" : i === current ? "bg-red-bright" : "bg-line-alt",
          ].join(" ")}
        />
      ))}
    </div>
  );
}
