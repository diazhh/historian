///
/// Industrial Historian - Formatting utilities
///

import { AlarmSeverity } from '../models/alarm.model';

export function formatValue(value: number, engUnits: string, precision: number = 2): string {
  if (value == null || isNaN(value)) return '---';
  return `${value.toFixed(precision)} ${engUnits}`;
}

export function formatTimestamp(ts: number, format: string = 'datetime'): string {
  const d = new Date(ts);
  switch (format) {
    case 'date':
      return d.toLocaleDateString();
    case 'time':
      return d.toLocaleTimeString();
    case 'iso':
      return d.toISOString();
    case 'datetime':
    default:
      return d.toLocaleString();
  }
}

export function severityColor(severity: AlarmSeverity): string {
  switch (severity) {
    case AlarmSeverity.CRITICAL:   return '#d32f2f';
    case AlarmSeverity.MAJOR:      return '#f57c00';
    case AlarmSeverity.MINOR:      return '#fbc02d';
    case AlarmSeverity.WARNING:    return '#1976d2';
    case AlarmSeverity.INDETERMINATE:
    default:                       return '#9e9e9e';
  }
}

export function qualityColor(quality: number): string {
  if (quality >= 192) return '#4caf50';  // Good - green
  if (quality >= 64)  return '#ff9800';  // Uncertain - orange
  return '#f44336';                       // Bad - red
}
