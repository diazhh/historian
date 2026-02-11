export interface TagConfig {
  description: string;
  engUnits: string;
  dataType: 'FLOAT' | 'DIGITAL' | 'INTEGER' | 'STRING';
  rangeLo: number;
  rangeHi: number;
  typicalValue: number;
  scanRateMs: number;
  stepFlag: boolean;
  instrumentTag: string;
  area: string;
  equipment: string;
  instrumentType: string;
  alarmHH: number | null;
  alarmH: number | null;
  alarmL: number | null;
  alarmLL: number | null;
  deadbandValue: number;
  deadbandType: 'ABSOLUTE' | 'PERCENT';
  digitalStates?: Record<string, string>;
}

export interface TagConfigMap {
  [tagKey: string]: TagConfig;
}

export interface TagDataPoint {
  ts: number;
  value: number | null;
}

export interface AlarmLimits {
  hh: number | null;
  h: number | null;
  l: number | null;
  ll: number | null;
}

export enum QualityCode {
  Good = 192,
  Uncertain = 64,
  BadSensorFailure = 24,
  BadOutOfRange = 28,
  BadNotConnected = 32,
  Bad = 0,
}
