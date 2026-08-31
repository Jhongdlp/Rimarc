/** Helpers de path para los glifos dibujados a mano. */

/**
 * Curva polar cerrada r(a) = base + amp * cos(lobes * a), muestreada y unida
 * con segmentos rectos. Con ~24 muestras por lobulo la union es indistinguible
 * de una curva a los tamanos que usa el notch (<= 24 px).
 */
export function rosettePath(
  base: number,
  amp: number,
  lobes: number,
  cx = 0,
  cy = 0,
  samplesPerLobe = 24,
): string {
  const n = lobes * samplesPerLobe;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = base + amp * Math.cos(lobes * a);
    pts.push(`${fmt(cx + r * Math.cos(a))},${fmt(cy + r * Math.sin(a))}`);
  }
  return `M${pts[0]}L${pts.slice(1).join("L")}Z`;
}

/** Radios de los rayos de una explosion, en grados y longitud relativa. */
export interface Ray {
  angle: number;
  length: number;
}

export function rays(count: number, lengths: number[]): Ray[] {
  return Array.from({ length: count }, (_, i) => ({
    angle: (360 / count) * i,
    length: lengths[i % lengths.length],
  }));
}

export function fmt(n: number): number {
  return Math.round(n * 1000) / 1000;
}
