export function qualityToText(code: number): string {
  if (code >= 192) return 'Good';
  if (code >= 64) return 'Uncertain';
  switch (code) {
    case 24: return 'Sensor Failure';
    case 28: return 'Out of Range';
    case 32: return 'Not Connected';
    default: return 'Bad';
  }
}

export function qualityIsGood(code: number): boolean {
  return code >= 192;
}

export function qualityToCssClass(code: number): string {
  if (code >= 192) return 'quality-good';
  if (code >= 64) return 'quality-uncertain';
  return 'quality-bad';
}
