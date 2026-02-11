import { Injectable } from '@angular/core';
import { TagDataPoint } from '../models/tag.model';

@Injectable()
export class TimeWeightedCalcService {

  /**
   * Time-weighted average (TWA).
   * Zero-order hold: each value "holds" until the next sample arrives.
   * Weight = value * duration.
   */
  average(data: TagDataPoint[], endTs?: number): number {
    const valid = this.filterValid(data);
    if (valid.length === 0) return 0;
    if (valid.length === 1) return valid[0].value!;

    const sorted = this.sortByTs(valid);
    const end = endTs ?? sorted[sorted.length - 1].ts;
    let weightedSum = 0;
    let totalDuration = 0;

    for (let i = 0; i < sorted.length; i++) {
      const nextTs = i < sorted.length - 1 ? sorted[i + 1].ts : end;
      const duration = nextTs - sorted[i].ts;
      if (duration > 0) {
        weightedSum += sorted[i].value! * duration;
        totalDuration += duration;
      }
    }

    return totalDuration > 0 ? weightedSum / totalDuration : 0;
  }

  min(data: TagDataPoint[]): number {
    const valid = this.filterValid(data);
    if (valid.length === 0) return 0;
    return Math.min(...valid.map(d => d.value!));
  }

  max(data: TagDataPoint[]): number {
    const valid = this.filterValid(data);
    if (valid.length === 0) return 0;
    return Math.max(...valid.map(d => d.value!));
  }

  /**
   * Time-weighted standard deviation.
   * stddev = sqrt( TWA of (value - mean)^2 )
   */
  standardDeviation(data: TagDataPoint[], endTs?: number): number {
    const valid = this.filterValid(data);
    if (valid.length < 2) return 0;

    const mean = this.average(valid, endTs);
    const sorted = this.sortByTs(valid);
    const end = endTs ?? sorted[sorted.length - 1].ts;

    let weightedSqSum = 0;
    let totalDuration = 0;

    for (let i = 0; i < sorted.length; i++) {
      const nextTs = i < sorted.length - 1 ? sorted[i + 1].ts : end;
      const duration = nextTs - sorted[i].ts;
      if (duration > 0) {
        const diff = sorted[i].value! - mean;
        weightedSqSum += diff * diff * duration;
        totalDuration += duration;
      }
    }

    return totalDuration > 0 ? Math.sqrt(weightedSqSum / totalDuration) : 0;
  }

  range(data: TagDataPoint[]): number {
    return this.max(data) - this.min(data);
  }

  count(data: TagDataPoint[]): number {
    return this.filterValid(data).length;
  }

  private filterValid(data: TagDataPoint[]): TagDataPoint[] {
    return data.filter(d => d.value !== null && d.value !== undefined && !isNaN(d.value));
  }

  private sortByTs(data: TagDataPoint[]): TagDataPoint[] {
    return [...data].sort((a, b) => a.ts - b.ts);
  }
}
