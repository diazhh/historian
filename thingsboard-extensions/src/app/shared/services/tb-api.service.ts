///
/// Industrial Historian - ThingsBoard API Service
///

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { TagDataPoint } from '../models/tag.model';
import { HistorianAlarm } from '../models/alarm.model';

export interface AlarmQueryOptions {
  status?: string[];
  severity?: string[];
  type?: string;
  startTs?: number;
  endTs?: number;
  pageSize?: number;
  page?: number;
  sortProperty?: string;
  sortOrder?: 'ASC' | 'DESC';
}

@Injectable()
export class TbApiService {
  private ctx: any;

  init(ctx: any): void {
    this.ctx = ctx;
  }

  private get http() {
    return this.ctx.http;
  }

  getEntityAttributes(
    entityType: string,
    entityId: string,
    scope: 'SERVER_SCOPE' | 'SHARED_SCOPE' | 'CLIENT_SCOPE',
    keys?: string[]
  ): Observable<Array<{ key: string; value: any; lastUpdateTs: number }>> {
    let url = `/api/plugins/telemetry/${entityType}/${entityId}/values/attributes/${scope}`;
    if (keys?.length) {
      url += `?keys=${keys.join(',')}`;
    }
    return this.http.get(url) as Observable<Array<{ key: string; value: any; lastUpdateTs: number }>>;
  }

  getTimeseries(
    entityType: string,
    entityId: string,
    keys: string[],
    startTs: number,
    endTs: number,
    interval?: number,
    agg?: 'NONE' | 'AVG' | 'MIN' | 'MAX' | 'SUM' | 'COUNT'
  ): Observable<Record<string, TagDataPoint[]>> {
    let url = `/api/plugins/telemetry/${entityType}/${entityId}/values/timeseries` +
      `?keys=${keys.join(',')}&startTs=${startTs}&endTs=${endTs}`;
    if (interval) {
      url += `&interval=${interval}`;
    }
    if (agg) {
      url += `&agg=${agg}`;
    }
    return (this.http.get(url) as Observable<Record<string, Array<{ ts: number; value: string }>>>).pipe(
      map(response => {
        const result: Record<string, TagDataPoint[]> = {};
        for (const key of Object.keys(response)) {
          result[key] = response[key].map(dp => ({
            ts: dp.ts,
            value: parseFloat(dp.value)
          }));
        }
        return result;
      })
    );
  }

  getLatestTimeseries(
    entityType: string,
    entityId: string,
    keys: string[]
  ): Observable<Record<string, TagDataPoint[]>> {
    const url = `/api/plugins/telemetry/${entityType}/${entityId}/values/timeseries` +
      `?keys=${keys.join(',')}&useStrictDataTypes=true`;
    return (this.http.get(url) as Observable<Record<string, Array<{ ts: number; value: string }>>>).pipe(
      map(response => {
        const result: Record<string, TagDataPoint[]> = {};
        for (const key of Object.keys(response)) {
          result[key] = response[key].map(dp => ({
            ts: dp.ts,
            value: parseFloat(dp.value)
          }));
        }
        return result;
      })
    );
  }

  getRelations(
    fromId: string,
    fromType: string,
    relationType: string
  ): Observable<Array<{ to: { id: string; entityType: string }; type: string; additionalInfo?: any }>> {
    const url = `/api/relations?fromId=${fromId}&fromType=${fromType}&relationType=${relationType}`;
    return this.http.get(url);
  }

  getAlarms(
    entityType: string,
    entityId: string,
    options: AlarmQueryOptions = {}
  ): Observable<{ data: HistorianAlarm[]; totalElements: number }> {
    const pageSize = options.pageSize ?? 20;
    const page = options.page ?? 0;
    const sortProperty = options.sortProperty ?? 'createdTime';
    const sortOrder = options.sortOrder ?? 'DESC';

    let url = `/api/alarm/${entityType}/${entityId}` +
      `?pageSize=${pageSize}&page=${page}` +
      `&sortProperty=${sortProperty}&sortOrder=${sortOrder}`;

    if (options.status?.length) {
      url += `&status=${options.status.join(',')}`;
    }
    if (options.severity?.length) {
      url += `&severity=${options.severity.join(',')}`;
    }
    if (options.type) {
      url += `&type=${options.type}`;
    }
    if (options.startTs) {
      url += `&startTime=${options.startTs}`;
    }
    if (options.endTs) {
      url += `&endTime=${options.endTs}`;
    }

    return this.http.get(url);
  }

  setServerAttributes(
    entityType: string,
    entityId: string,
    attributes: Record<string, any>
  ): Observable<void> {
    const url = `/api/plugins/telemetry/${entityType}/${entityId}/SERVER_SCOPE`;
    return this.http.post(url, attributes) as Observable<void>;
  }
}
