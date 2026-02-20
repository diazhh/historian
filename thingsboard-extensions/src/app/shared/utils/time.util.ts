///
/// Industrial Historian - Time-weighted calculation utilities
///
/// ThingsBoard only does event-weighted aggregation. These functions
/// provide proper time-weighted calculations for process historians.
///

import { TagDataPoint } from '../models/tag.model';

export function timeWeightedAverage(data: TagDataPoint[]): number {
  if (data.length < 2) return data.length === 1 ? data[0].value : 0;

  let weightedSum = 0;
  let totalDuration = 0;

  for (let i = 0; i < data.length - 1; i++) {
    const dt = data[i + 1].ts - data[i].ts;
    weightedSum += data[i].value * dt;
    totalDuration += dt;
  }

  return totalDuration > 0 ? weightedSum / totalDuration : 0;
}

export function timeWeightedMin(data: TagDataPoint[]): number {
  if (data.length === 0) return 0;
  return Math.min(...data.map(d => d.value));
}

export function timeWeightedMax(data: TagDataPoint[]): number {
  if (data.length === 0) return 0;
  return Math.max(...data.map(d => d.value));
}

export function timeWeightedStdDev(data: TagDataPoint[]): number {
  if (data.length < 2) return 0;

  const avg = timeWeightedAverage(data);
  let weightedSqSum = 0;
  let totalDuration = 0;

  for (let i = 0; i < data.length - 1; i++) {
    const dt = data[i + 1].ts - data[i].ts;
    const diff = data[i].value - avg;
    weightedSqSum += diff * diff * dt;
    totalDuration += dt;
  }

  return totalDuration > 0 ? Math.sqrt(weightedSqSum / totalDuration) : 0;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
