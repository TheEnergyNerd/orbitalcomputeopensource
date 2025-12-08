export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function clamp(min: number, max: number, x: number): number {
  return Math.max(min, Math.min(max, x));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function mix(a: number, b: number, t: number): number {
  return lerp(a, b, t);
}


