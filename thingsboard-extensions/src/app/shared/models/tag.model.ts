///
/// Industrial Historian - Tag Models
///

export interface TagConfig {
  deviceId: string;
  deviceName: string;
  description: string;
  engUnits: string;
  dataType: 'AI' | 'DI' | 'CALC' | 'TOT';
  rangeLow: number;
  rangeHigh: number;
  setpoint: number;
  deadband: number;
  scanRate: string;
  instrumentType: string;
}

export interface AlarmLimits {
  hh: number | null;
  h: number | null;
  l: number | null;
  ll: number | null;
}

export interface TagMetadata extends TagConfig {
  alarmLimits: AlarmLimits;
}

export interface TagDataPoint {
  ts: number;
  value: number;
  quality?: number;
}

export enum QualityCode {
  GOOD = 192,
  UNCERTAIN = 64,
  SENSOR_FAILURE = 24,
  OUT_OF_RANGE = 28,
  NOT_CONNECTED = 32,
  BAD = 0
}

export function qualityToText(code: number): string {
  if (code >= 192) return 'Good';
  if (code >= 64) return 'Uncertain';
  if (code === 24) return 'Sensor Failure';
  if (code === 28) return 'Out of Range';
  if (code === 32) return 'Not Connected';
  return 'Bad';
}

export function isQualityGood(code: number): boolean {
  return code >= 192;
}
