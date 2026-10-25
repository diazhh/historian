///
/// Industrial Historian - W8 Data Grid Component
///
/// Spreadsheet-style grid where columns = selected tags and rows = timestamps
/// at regular intervals. Supports alarm-limit cell coloring, CSV export,
/// paginated data fetch, and inter-widget communication.
///

import {
  Component, Input, OnInit, OnDestroy, ChangeDetectorRef
} from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';

import { TbApiService } from '../../../shared/services/tb-api.service';
import { BroadcastService } from '../../../shared/services/broadcast.service';
import { TagDataPoint, AlarmLimits } from '../../../shared/models/tag.model';
import { formatTimestamp } from '../../../shared/utils/format.util';

// ── Models ───────────────────────────────────────────

interface TagColumn {
  deviceId: string;
  deviceName: string;
  engUnits: string;
  alarmLimits: AlarmLimits;
  dataMap: Map<number, number>;
}

// ── Constants ────────────────────────────────────────

const MAX_INTERVALS = 700;
const PV_KEY = 'PV';
const TABLE_PAGE_SIZE = 50;

const SS_ATTR_KEYS = [
  'ss_engUnits', 'ss_alarmHH', 'ss_alarmH', 'ss_alarmL', 'ss_alarmLL'
];

const INTERVAL_OPTIONS: Array<{ label: string; ms: number }> = [
  { label: '1m',  ms: 60_000 },
  { label: '5m',  ms: 300_000 },
  { label: '15m', ms: 900_000 },
  { label: '1h',  ms: 3_600_000 },
  { label: '1d',  ms: 86_400_000 }
];

@Component({
  selector: 'historian-data-grid',
  templateUrl: './w8-data-grid.component.html',
  styleUrls: ['./w8-data-grid.component.scss']
})
export class W8DataGridComponent implements OnInit, OnDestroy {
  @Input() ctx: any;

  // Public state (template bindings)
  columns: TagColumn[] = [];
  timestamps: number[] = [];
  loading = false;

  intervalOptions = INTERVAL_OPTIONS;
  selectedInterval = INTERVAL_OPTIONS[0].ms;

  timeRange = { startTs: 0, endTs: 0 };

  // Pagination
  tablePage = 0;
  tablePageSize = TABLE_PAGE_SIZE;

  // Private
  private subs: Subscription[] = [];

  constructor(
    private tbApi: TbApiService,
    private broadcast: BroadcastService,
    private cdr: ChangeDetectorRef
  ) {}

  // ── Computed ────────────────────────────────────────

  get pagedTimestamps(): number[] {
    const start = this.tablePage * this.tablePageSize;
    return this.timestamps.slice(start, start + this.tablePageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.timestamps.length / this.tablePageSize));
  }

  // ── Lifecycle ──────────────────────────────────────

  ngOnInit(): void {
    this.tbApi.init(this.ctx);

    // Widget bridge for TB controllerScript
    this.ctx.$scope.historianWidget = {
      init: () => {}
    };

    // Default time range: last 1 hour
    const now = Date.now();
    this.timeRange = { startTs: now - 3_600_000, endTs: now };

    // Listen for tag selections from W2 Tag Browser
    this.subs.push(
      this.broadcast.tagsSelected$.subscribe(sel => {
        this.loadTags(sel.deviceIds, sel.deviceNames);
      })
    );

    // Listen for time range changes from other widgets
    this.subs.push(
      this.broadcast.timeRangeChanged$.subscribe(range => {
        this.timeRange = { ...range };
        if (this.columns.length > 0) {
          this.refreshData();
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  // ── Tag loading ────────────────────────────────────

  async loadTags(deviceIds: string[], deviceNames: string[]): Promise<void> {
    this.loading = true;
    this.cdr.detectChanges();

    const newColumns: TagColumn[] = [];

    for (let i = 0; i < deviceIds.length; i++) {
      // Reuse existing column if already loaded
      const existing = this.columns.find(c => c.deviceId === deviceIds[i]);
      if (existing) {
        newColumns.push(existing);
        continue;
      }

      const col: TagColumn = {
        deviceId: deviceIds[i],
        deviceName: deviceNames[i] || deviceIds[i],
        engUnits: '',
        alarmLimits: { hh: null, h: null, l: null, ll: null },
        dataMap: new Map()
      };

      // Fetch tag metadata
      try {
        const attrs = await firstValueFrom(
          this.tbApi.getEntityAttributes('DEVICE', col.deviceId, 'SERVER_SCOPE', SS_ATTR_KEYS)
        );
        const map = new Map(attrs.map(a => [a.key, a.value]));
        col.engUnits = map.get('ss_engUnits') ?? '';
        col.alarmLimits = {
          hh: this.parseNullNum(map.get('ss_alarmHH')),
          h:  this.parseNullNum(map.get('ss_alarmH')),
          l:  this.parseNullNum(map.get('ss_alarmL')),
          ll: this.parseNullNum(map.get('ss_alarmLL'))
        };
      } catch { /* use defaults */ }

      newColumns.push(col);
    }

    this.columns = newColumns;
    await this.refreshData();

    this.loading = false;
    this.cdr.detectChanges();
  }

  // ── Data fetching ──────────────────────────────────

  async refreshData(): Promise<void> {
    this.loading = true;
    this.tablePage = 0;
    this.cdr.detectChanges();

    const fetches = this.columns.map(col => this.fetchColumnData(col));
    await Promise.all(fetches);

    this.buildTimestampIndex();

    this.loading = false;
    this.cdr.detectChanges();
  }

  private async fetchColumnData(col: TagColumn): Promise<void> {
    try {
      const data = await this.fetchWithPagination(
        col.deviceId, PV_KEY,
        this.timeRange.startTs, this.timeRange.endTs,
        this.selectedInterval
      );
      col.dataMap = new Map<number, number>();
      for (const dp of data) {
        col.dataMap.set(dp.ts, dp.value);
      }
    } catch {
      col.dataMap = new Map();
    }
  }

  /**
   * Paginated time-series fetch respecting DATABASE_TS_MAX_INTERVALS = 700.
   * Uses AVG aggregation with the selected interval.
   */
  private async fetchWithPagination(
    deviceId: string,
    key: string,
    startTs: number,
    endTs: number,
    interval: number
  ): Promise<TagDataPoint[]> {
    const all: TagDataPoint[] = [];
    const segmentMs = interval * MAX_INTERVALS;
    let cursor = startTs;

    while (cursor < endTs) {
      const segEnd = Math.min(cursor + segmentMs, endTs);
      const batch = await firstValueFrom(
        this.tbApi.getTimeseries('DEVICE', deviceId, [key], cursor, segEnd, interval, 'AVG')
      );
      const pts = batch[key] || [];
      all.push(...pts);
      cursor = segEnd;
    }

    return all;
  }

  /**
   * Build sorted list of unique timestamps across all columns.
   */
  private buildTimestampIndex(): void {
    const tsSet = new Set<number>();
    for (const col of this.columns) {
      for (const ts of col.dataMap.keys()) {
        tsSet.add(ts);
      }
    }
    this.timestamps = Array.from(tsSet).sort((a, b) => a - b);
  }

  // ── Interval change ────────────────────────────────

  onIntervalChange(): void {
    if (this.columns.length > 0) {
      this.refreshData();
    }
  }

  // ── Cell value & coloring ──────────────────────────

  getCellValue(col: TagColumn, ts: number): string {
    const val = col.dataMap.get(ts);
    if (val == null || isNaN(val)) return '---';
    return val.toFixed(2);
  }

  getCellClass(col: TagColumn, ts: number): string {
    const val = col.dataMap.get(ts);
    if (val == null || isNaN(val)) return '';

    const lim = col.alarmLimits;
    if ((lim.hh != null && val >= lim.hh) || (lim.ll != null && val <= lim.ll)) {
      return 'cell-alarm-critical';
    }
    if ((lim.h != null && val >= lim.h) || (lim.l != null && val <= lim.l)) {
      return 'cell-alarm-warning';
    }
    return '';
  }

  // ── CSV export ─────────────────────────────────────

  exportCSV(): void {
    if (this.timestamps.length === 0 || this.columns.length === 0) return;

    const header = ['Timestamp', ...this.columns.map(c => `${c.deviceName} (${c.engUnits})`)];
    const rows = this.timestamps.map(ts => {
      const vals = this.columns.map(col => {
        const v = col.dataMap.get(ts);
        return v != null && !isNaN(v) ? v.toFixed(4) : '';
      });
      return [new Date(ts).toISOString(), ...vals].join(',');
    });

    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data_grid_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Formatting helpers ─────────────────────────────

  formatTs(ts: number): string {
    return formatTimestamp(ts);
  }

  columnHeader(col: TagColumn): string {
    return col.engUnits ? `${col.deviceName} (${col.engUnits})` : col.deviceName;
  }

  // ── Utilities ──────────────────────────────────────

  private parseNullNum(val: any): number | null {
    if (val == null || val === '') return null;
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  }
}
