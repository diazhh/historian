///
/// Industrial Historian - W5 Ad-hoc Query Component
///
/// Flexible query tool for exploring time-series data with configurable
/// aggregation, table/chart/stats views, and CSV export.
///

import {
  Component, Input, OnInit, OnDestroy,
  ViewChild, ElementRef, ChangeDetectorRef
} from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, switchMap, firstValueFrom } from 'rxjs';
import * as echarts from 'echarts';

import { TbApiService } from '../../../shared/services/tb-api.service';
import { BroadcastService } from '../../../shared/services/broadcast.service';
import { TagDataPoint, qualityToText } from '../../../shared/models/tag.model';
import {
  timeWeightedAverage, timeWeightedMin, timeWeightedMax, timeWeightedStdDev
} from '../../../shared/utils/time.util';
import { formatTimestamp } from '../../../shared/utils/format.util';

// ── Types ────────────────────────────────────────────

type AggType = 'NONE' | 'AVG' | 'MIN' | 'MAX' | 'SUM' | 'COUNT';
type ViewMode = 'table' | 'chart' | 'stats';

interface DeviceSearchResult {
  id: { id: string; entityType: string };
  name: string;
  label: string;
}

interface QueryStats {
  min: number;
  max: number;
  avg: number;
  stdDev: number;
  first: number;
  last: number;
}

// ── Constants ────────────────────────────────────────

const MAX_INTERVALS = 700;
const PV_KEY = 'PV';
const TABLE_PAGE_SIZE = 50;

@Component({
  selector: 'historian-adhoc-query',
  templateUrl: './w5-adhoc-query.component.html',
  styleUrls: ['./w5-adhoc-query.component.scss']
})
export class W5AdhocQueryComponent implements OnInit, OnDestroy {
  @Input() ctx: any;
  @ViewChild('chartContainer') chartContainer?: ElementRef;

  // ── Query form state ───────────────────────────────

  queryForm = {
    deviceName: '',
    deviceId: '',
    startTs: 0,
    endTs: 0,
    agg: 'NONE' as AggType,
    interval: 0
  };

  intervalOptions = [
    { value: 1000,     label: '1s' },
    { value: 5000,     label: '5s' },
    { value: 30000,    label: '30s' },
    { value: 60000,    label: '1m' },
    { value: 300000,   label: '5m' },
    { value: 900000,   label: '15m' },
    { value: 3600000,  label: '1h' },
    { value: 86400000, label: '1d' }
  ];

  // ── Search state ───────────────────────────────────

  searchResults: DeviceSearchResult[] = [];
  showDropdown = false;
  private searchSubject = new Subject<string>();

  // ── Results state ──────────────────────────────────

  queryResults: TagDataPoint[] = [];
  viewMode: ViewMode = 'table';
  loading = false;

  stats: QueryStats = { min: 0, max: 0, avg: 0, stdDev: 0, first: 0, last: 0 };

  // Table pagination
  tablePage = 0;
  tablePageSize = TABLE_PAGE_SIZE;

  // Date strings for datetime-local inputs
  startDateStr = '';
  endDateStr = '';

  // Private
  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private subs: Subscription[] = [];

  constructor(
    private tbApi: TbApiService,
    private broadcast: BroadcastService,
    private cdr: ChangeDetectorRef
  ) {}

  // ── Computed properties ────────────────────────────

  get pagedResults(): TagDataPoint[] {
    const start = this.tablePage * this.tablePageSize;
    return this.queryResults.slice(start, start + this.tablePageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.queryResults.length / this.tablePageSize));
  }

  // ── Lifecycle ──────────────────────────────────────

  ngOnInit(): void {
    this.tbApi.init(this.ctx);

    // Widget bridge for TB controllerScript
    this.ctx.$scope.historianWidget = {
      init: () => {}
    };

    // Initialize time range to last 1 hour
    const now = Date.now();
    this.queryForm.startTs = now - 3_600_000;
    this.queryForm.endTs = now;
    this.updateDateStrings();

    // Debounced tag search
    this.subs.push(
      this.searchSubject.pipe(
        debounceTime(300)
      ).subscribe(query => this.searchDevices(query))
    );

    // Listen for tag clicks from other widgets (auto-fill device)
    this.subs.push(
      this.broadcast.tagClicked$.subscribe(click => {
        this.queryForm.deviceId = click.deviceId;
        this.queryForm.deviceName = click.deviceName;
        this.cdr.detectChanges();
      })
    );

    // Listen for time range changes from other widgets
    this.subs.push(
      this.broadcast.timeRangeChanged$.subscribe(range => {
        this.queryForm.startTs = range.startTs;
        this.queryForm.endTs = range.endTs;
        this.updateDateStrings();
        this.cdr.detectChanges();
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
  }

  // ── Tag search ─────────────────────────────────────

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.queryForm.deviceId = ''; // Clear selection when typing
    if (value.length >= 2) {
      this.searchSubject.next(value);
    } else {
      this.searchResults = [];
      this.showDropdown = false;
    }
  }

  private async searchDevices(query: string): Promise<void> {
    try {
      const url = `/api/tenant/devices?pageSize=10&page=0&textSearch=${encodeURIComponent(query)}`;
      const response: any = await firstValueFrom(this.ctx.http.get(url));
      this.searchResults = response.data || [];
      this.showDropdown = this.searchResults.length > 0;
      this.cdr.detectChanges();
    } catch {
      this.searchResults = [];
      this.showDropdown = false;
    }
  }

  selectDevice(device: DeviceSearchResult): void {
    this.queryForm.deviceId = device.id.id;
    this.queryForm.deviceName = device.name;
    this.searchResults = [];
    this.showDropdown = false;
  }

  // ── Time range handling ────────────────────────────

  onStartChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value) {
      this.queryForm.startTs = new Date(value).getTime();
      this.startDateStr = value;
    }
  }

  onEndChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value) {
      this.queryForm.endTs = new Date(value).getTime();
      this.endDateStr = value;
    }
  }

  private updateDateStrings(): void {
    this.startDateStr = this.toDateTimeLocal(this.queryForm.startTs);
    this.endDateStr = this.toDateTimeLocal(this.queryForm.endTs);
  }

  private toDateTimeLocal(ts: number): string {
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ── Aggregation change ─────────────────────────────

  onAggChange(): void {
    if (this.queryForm.agg === 'NONE') {
      this.queryForm.interval = 0;
    } else if (this.queryForm.interval === 0) {
      this.queryForm.interval = 60000; // Default to 1 minute
    }
  }

  // ── Execute query ──────────────────────────────────

  async executeQuery(): Promise<void> {
    if (!this.queryForm.deviceId) return;

    this.loading = true;
    this.tablePage = 0;
    this.cdr.detectChanges();

    try {
      this.queryResults = await this.fetchWithPagination(
        this.queryForm.deviceId,
        PV_KEY,
        this.queryForm.startTs,
        this.queryForm.endTs,
        this.queryForm.agg,
        this.queryForm.interval
      );
      this.queryResults.sort((a, b) => a.ts - b.ts);
      this.computeStats();
    } catch {
      this.queryResults = [];
    }

    this.loading = false;
    this.cdr.detectChanges();

    // If chart view is active, render after DOM updates
    if (this.viewMode === 'chart') {
      setTimeout(() => this.renderChart(), 0);
    }
  }

  /**
   * Paginated time-series fetch respecting DATABASE_TS_MAX_INTERVALS = 700.
   * For aggregated queries: divides range into segments of interval * 700.
   * For raw queries: fetches in batches using last ts as new startTs.
   */
  private async fetchWithPagination(
    deviceId: string,
    key: string,
    startTs: number,
    endTs: number,
    agg: AggType,
    interval: number
  ): Promise<TagDataPoint[]> {
    const all: TagDataPoint[] = [];

    if (agg === 'NONE' || interval === 0) {
      // Raw data — paginate by shifting startTs to last received ts + 1
      let cursor = startTs;
      while (cursor < endTs) {
        const batch = await firstValueFrom(
          this.tbApi.getTimeseries('DEVICE', deviceId, [key], cursor, endTs)
        );
        const pts = (batch[key] || []).sort((a, b) => a.ts - b.ts);
        if (pts.length === 0) break;
        all.push(...pts);
        const lastTs = pts[pts.length - 1].ts;
        if (lastTs <= cursor) break;
        cursor = lastTs + 1;
        if (pts.length < MAX_INTERVALS) break;
      }
    } else {
      // Aggregated data — each segment covers interval * MAX_INTERVALS ms
      const segmentMs = interval * MAX_INTERVALS;
      let cursor = startTs;
      while (cursor < endTs) {
        const segEnd = Math.min(cursor + segmentMs, endTs);
        const batch = await firstValueFrom(
          this.tbApi.getTimeseries('DEVICE', deviceId, [key], cursor, segEnd, interval, agg)
        );
        const pts = batch[key] || [];
        all.push(...pts);
        cursor = segEnd;
      }
    }

    return all;
  }

  // ── Statistics ─────────────────────────────────────

  private computeStats(): void {
    if (this.queryResults.length === 0) {
      this.stats = { min: 0, max: 0, avg: 0, stdDev: 0, first: 0, last: 0 };
      return;
    }

    this.stats = {
      min: timeWeightedMin(this.queryResults),
      max: timeWeightedMax(this.queryResults),
      avg: timeWeightedAverage(this.queryResults),
      stdDev: timeWeightedStdDev(this.queryResults),
      first: this.queryResults[0].value,
      last: this.queryResults[this.queryResults.length - 1].value
    };
  }

  // ── Chart rendering ────────────────────────────────

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
    if (mode === 'chart' && this.queryResults.length > 0) {
      setTimeout(() => this.renderChart(), 0);
    }
  }

  private renderChart(): void {
    if (!this.chartContainer) return;

    const el = this.chartContainer.nativeElement;

    if (this.chart) {
      this.chart.dispose();
    }
    this.chart = echarts.init(el);

    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(el);

    const data = this.queryResults.map(d => [d.ts, d.value]);

    this.chart.setOption({
      grid: { left: 60, right: 20, top: 24, bottom: 56 },
      xAxis: {
        type: 'time',
        axisLabel: { fontSize: 10 },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLabel: { fontSize: 10 },
        splitLine: { lineStyle: { type: 'dashed', color: '#eee' } }
      },
      series: [{
        name: this.queryForm.deviceName,
        type: 'line',
        data,
        lineStyle: { color: '#1976d2', width: 1.5 },
        itemStyle: { color: '#1976d2' },
        symbol: data.length < 200 ? 'circle' : 'none',
        symbolSize: 3,
        sampling: 'lttb',
        animation: false
      }],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const ts = params[0].data[0];
          const val = params[0].data[1];
          return `<div style="font-size:11px"><b>${formatTimestamp(ts)}</b><br/>PV: <b>${typeof val === 'number' ? val.toFixed(4) : val}</b></div>`;
        },
        confine: true
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
        { type: 'slider', xAxisIndex: 0, bottom: 8, height: 20, borderColor: '#ccc' }
      ],
      animation: false
    } as any, { notMerge: true });
  }

  // ── CSV Export ─────────────────────────────────────

  exportCSV(): void {
    if (this.queryResults.length === 0) return;

    const header = 'Timestamp,Value,Quality';
    const rows = this.queryResults.map(dp => {
      const ts = new Date(dp.ts).toISOString();
      const val = dp.value.toFixed(4);
      const q = dp.quality != null ? dp.quality.toString() : '';
      return `${ts},${val},${q}`;
    });

    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query_${this.queryForm.deviceName}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Formatting helpers (used in template) ──────────

  formatTs(ts: number): string {
    return formatTimestamp(ts);
  }

  formatNum(val: number): string {
    if (val == null || isNaN(val)) return '---';
    return val.toFixed(4);
  }

  qualityText(quality?: number): string {
    if (quality == null) return 'Good';
    return qualityToText(quality);
  }
}
