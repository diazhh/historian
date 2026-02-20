///
/// W1 Industrial Trend Viewer - Configuration & Constants
///

export interface TrendViewerSettings {
  maxPens: number;
  defaultTimeRangeMs: number;
  autoRefreshMs: number;
  showAlarmOverlays: boolean;
  showAlarmLimits: boolean;
  showQualityBands: boolean;
  showLegend: boolean;
  showToolbar: boolean;
  exportEnabled: boolean;
}

export const DEFAULT_SETTINGS: TrendViewerSettings = {
  maxPens: 16,
  defaultTimeRangeMs: 3_600_000,
  autoRefreshMs: 5000,
  showAlarmOverlays: true,
  showAlarmLimits: true,
  showQualityBands: false,
  showLegend: true,
  showToolbar: true,
  exportEnabled: true
};

export const PEN_COLORS: string[] = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728',
  '#9467bd', '#8c564b', '#e377c2', '#7f7f7f',
  '#bcbd22', '#17becf', '#aec7e8', '#ffbb78',
  '#98df8a', '#ff9896', '#c5b0d5', '#c49c94'
];

export const TIME_PRESETS: Array<{ label: string; ms: number }> = [
  { label: '1H',  ms: 3_600_000 },
  { label: '4H',  ms: 14_400_000 },
  { label: '8H',  ms: 28_800_000 },
  { label: '1D',  ms: 86_400_000 },
  { label: '7D',  ms: 604_800_000 },
  { label: '30D', ms: 2_592_000_000 },
  { label: '1Y',  ms: 31_536_000_000 }
];

export interface AggregationConfig {
  agg: 'NONE' | 'AVG';
  interval: number;
}

/**
 * Adaptive aggregation — selects aggregation level based on the visible
 * time range to keep data point count manageable while respecting
 * DATABASE_TS_MAX_INTERVALS = 700.
 */
export function getAggregationConfig(rangeMs: number): AggregationConfig {
  if (rangeMs <= 3_600_000)       return { agg: 'NONE', interval: 0 };       // < 1h: raw
  if (rangeMs <= 86_400_000)      return { agg: 'NONE', interval: 0 };       // 1-24h: raw (up to ~10K)
  if (rangeMs <= 604_800_000)     return { agg: 'AVG',  interval: 60_000 };  // 1-7d: 1 min
  if (rangeMs <= 2_592_000_000)   return { agg: 'AVG',  interval: 300_000 }; // 7-30d: 5 min
  if (rangeMs <= 31_536_000_000)  return { agg: 'AVG',  interval: 3_600_000 }; // 30d-1y: 1h
  return { agg: 'AVG', interval: 86_400_000 };                                // > 1y: 1d
}

/** SS_ attribute keys used for tag metadata */
export const SS_ATTR_KEYS = [
  'ss_description', 'ss_engUnits', 'ss_dataType',
  'ss_rangeLow', 'ss_rangeHigh', 'ss_setpoint', 'ss_deadband',
  'ss_alarmHH', 'ss_alarmH', 'ss_alarmL', 'ss_alarmLL',
  'ss_scanRate', 'ss_instrumentType'
];
