///
/// Industrial Historian - W6 Batch Comparison Component
///
/// Compares the same tag across two time periods with overlay chart
/// and side-by-side statistics (Min, Max, Avg, StdDev, Delta).
///

import {
  Component, Input, OnInit, OnDestroy,
  ViewChild, ElementRef, ChangeDetectorRef
} from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import * as echarts from 'echarts';

import { TbApiService } from '../../../shared/services/tb-api.service';
import { BroadcastService } from '../../../shared/services/broadcast.service';
import { TagDataPoint } from '../../../shared/models/tag.model';
import {
  timeWeightedAverage, timeWeightedMin, timeWeightedMax,
  timeWeightedStdDev
} from '../../../shared/utils/time.util';
import { formatTimestamp } from '../../../shared/utils/format.util';

// ── Interfaces ───────────────────────────────────────────

interface PeriodConfig {
  startTs: number;
  endTs: number;
}

interface PeriodStats {
  min: number;
  max: number;
  avg: number;
  stdDev: number;
  count: number;
}

interface ComparisonPreset {
  label: string;
  key: string;
  getPeriods: () => { a: PeriodConfig; b: PeriodConfig };
}

// ── Constants ────────────────────────────────────────────

const MAX_INTERVALS = 700;
const PV_KEY = 'PV';

const PRESETS: ComparisonPreset[] = [
  {
    label: 'Today vs Yesterday',
    key: 'today-yesterday',
    getPeriods: () => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const yesterdayStart = todayStart - 86_400_000;
      return {
        a: { startTs: todayStart, endTs: now.getTime() },
        b: { startTs: yesterdayStart, endTs: todayStart }
      };
    }
  },
  {
    label: 'This Week vs Last Week',
    key: 'week-vs-week',
    getPeriods: () => {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((dayOfWeek + 6) % 7)).getTime();
      const lastMonday = thisMonday - 604_800_000;
      return {
        a: { startTs: thisMonday, endTs: now.getTime() },
        b: { startTs: lastMonday, endTs: thisMonday }
      };
    }
  }
];

@Component({
  selector: 'historian-batch-comparison',
  templateUrl: './w6-batch-comparison.component.html',
  styleUrls: ['./w6-batch-comparison.component.scss']
})
export class W6BatchComparisonComponent implements OnInit, OnDestroy {
  @Input() ctx: any;
  @ViewChild('chartContainer', { static: true }) chartContainer!: ElementRef;

  // Public state
  presets = PRESETS;
  activePreset = '';
  tagName = '';
  deviceId = '';
  periodA: PeriodConfig = { startTs: 0, endTs: 0 };
  periodB: PeriodConfig = { startTs: 0, endTs: 0 };
  statsA: PeriodStats = { min: NaN, max: NaN, avg: NaN, stdDev: NaN, count: 0 };
  statsB: PeriodStats = { min: NaN, max: NaN, avg: NaN, stdDev: NaN, count: 0 };
  engUnits = '';
  loading = false;
  hasData = false;

  // Form binding helpers (datetime-local inputs)
  periodAStartStr = '';
  periodAEndStr = '';
  periodBStartStr = '';
  periodBEndStr = '';

  // Private state
  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private subs: Subscription[] = [];
  private dataA: TagDataPoint[] = [];
  private dataB: TagDataPoint[] = [];

  constructor(
    private tbApi: TbApiService,
    private broadcast: BroadcastService,
    private cdr: ChangeDetectorRef
  ) {}

  // ── Lifecycle ──────────────────────────────────────────

  ngOnInit(): void {
    this.tbApi.init(this.ctx);

    this.ctx.$scope.historianWidget = {
      init: () => this.initChart()
    };

    // Listen for tag selections from W2 Tag Browser
    this.subs.push(
      this.broadcast.tagsSelected$.subscribe(sel => {
        if (sel.deviceIds.length > 0) {
          this.deviceId = sel.deviceIds[0];
          this.tagName = sel.deviceNames[0] || sel.deviceIds[0];
          this.loadTagMetadata();
        }
      })
    );

    // Also listen for single tag clicks
    this.subs.push(
      this.broadcast.tagClicked$.subscribe(click => {
        this.deviceId = click.deviceId;
        this.tagName = click.deviceName;
        this.loadTagMetadata();
      })
    );

    // Default periods: today vs yesterday
    this.applyPreset(PRESETS[0]);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
  }

  // ── Initialization ─────────────────────────────────────

  private initChart(): void {
    const el = this.chartContainer.nativeElement;
    this.chart = echarts.init(el);

    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(el);

    this.updateChart();
  }

  private async loadTagMetadata(): Promise<void> {
    if (!this.deviceId) return;
    try {
      const attrs = await firstValueFrom(
        this.tbApi.getEntityAttributes('DEVICE', this.deviceId, 'SERVER_SCOPE', ['ss_engUnits'])
      );
      const map = new Map(attrs.map(a => [a.key, a.value]));
      this.engUnits = map.get('ss_engUnits') ?? '';
      this.cdr.detectChanges();
    } catch { /* use default */ }
  }

  // ── Presets ────────────────────────────────────────────

  applyPreset(preset: ComparisonPreset): void {
    this.activePreset = preset.key;
    const { a, b } = preset.getPeriods();
    this.periodA = a;
    this.periodB = b;
    this.syncFormStrings();
    this.cdr.detectChanges();
  }

  // ── Form date sync ─────────────────────────────────────

  private syncFormStrings(): void {
    this.periodAStartStr = this.tsToLocal(this.periodA.startTs);
    this.periodAEndStr = this.tsToLocal(this.periodA.endTs);
    this.periodBStartStr = this.tsToLocal(this.periodB.startTs);
    this.periodBEndStr = this.tsToLocal(this.periodB.endTs);
  }

  onPeriodInputChange(): void {
    this.activePreset = 'custom';
    this.periodA.startTs = this.localToTs(this.periodAStartStr);
    this.periodA.endTs = this.localToTs(this.periodAEndStr);
    this.periodB.startTs = this.localToTs(this.periodBStartStr);
    this.periodB.endTs = this.localToTs(this.periodBEndStr);
  }

  private tsToLocal(ts: number): string {
    if (!ts) return '';
    const d = new Date(ts);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60_000);
    return local.toISOString().slice(0, 16);
  }

  private localToTs(str: string): number {
    if (!str) return 0;
    return new Date(str).getTime();
  }

  // ── Compare ────────────────────────────────────────────

  async runComparison(): Promise<void> {
    if (!this.deviceId) return;
    if (!this.periodA.startTs || !this.periodA.endTs) return;
    if (!this.periodB.startTs || !this.periodB.endTs) return;

    this.loading = true;
    this.cdr.detectChanges();

    try {
      const [dataA, dataB] = await Promise.all([
        this.fetchWithPagination(this.deviceId, PV_KEY, this.periodA.startTs, this.periodA.endTs),
        this.fetchWithPagination(this.deviceId, PV_KEY, this.periodB.startTs, this.periodB.endTs)
      ]);

      this.dataA = dataA.sort((a, b) => a.ts - b.ts);
      this.dataB = dataB.sort((a, b) => a.ts - b.ts);
      this.statsA = this.computeStats(this.dataA);
      this.statsB = this.computeStats(this.dataB);
      this.hasData = this.dataA.length > 0 || this.dataB.length > 0;

      this.updateChart();
    } catch { /* keep previous state */ }

    this.loading = false;
    this.cdr.detectChanges();
  }

  // ── Paginated fetch (same pattern as W1) ───────────────

  private async fetchWithPagination(
    deviceId: string, key: string, startTs: number, endTs: number
  ): Promise<TagDataPoint[]> {
    const all: TagDataPoint[] = [];
    const rangeMs = endTs - startTs;

    // Adaptive aggregation
    let agg: 'NONE' | 'AVG' = 'NONE';
    let interval = 0;
    if (rangeMs > 86_400_000 && rangeMs <= 604_800_000) {
      agg = 'AVG'; interval = 60_000;
    } else if (rangeMs > 604_800_000 && rangeMs <= 2_592_000_000) {
      agg = 'AVG'; interval = 300_000;
    } else if (rangeMs > 2_592_000_000) {
      agg = 'AVG'; interval = 3_600_000;
    }

    if (agg === 'NONE' || interval === 0) {
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

  // ── Statistics ─────────────────────────────────────────

  private computeStats(data: TagDataPoint[]): PeriodStats {
    if (data.length === 0) {
      return { min: NaN, max: NaN, avg: NaN, stdDev: NaN, count: 0 };
    }
    return {
      min: timeWeightedMin(data),
      max: timeWeightedMax(data),
      avg: timeWeightedAverage(data),
      stdDev: timeWeightedStdDev(data),
      count: data.length
    };
  }

  // ── Chart rendering ────────────────────────────────────

  private updateChart(): void {
    if (!this.chart) return;
    this.chart.setOption(this.buildChartOptions(), { notMerge: true });
  }

  private buildChartOptions(): echarts.EChartsOption {
    // Normalize both series to relative hours from period start
    const seriesA = this.normalizeToRelative(this.dataA, this.periodA.startTs);
    const seriesB = this.normalizeToRelative(this.dataB, this.periodB.startTs);

    // Find max relative time across both periods
    const maxRelativeMs = Math.max(
      this.periodA.endTs - this.periodA.startTs,
      this.periodB.endTs - this.periodB.startTs
    );

    return {
      grid: { left: 60, right: 20, top: 24, bottom: 56 },
      xAxis: {
        type: 'value',
        min: 0,
        max: maxRelativeMs,
        axisLabel: {
          fontSize: 10,
          formatter: (val: number) => this.formatRelativeTime(val)
        },
        name: 'Elapsed Time',
        nameTextStyle: { fontSize: 10 },
        splitLine: { show: true, lineStyle: { type: 'dashed', color: '#eee' } }
      },
      yAxis: {
        type: 'value',
        name: this.engUnits,
        nameTextStyle: { fontSize: 10 },
        axisLabel: { fontSize: 10 },
        splitLine: { show: true }
      },
      series: [
        {
          name: `Period A`,
          type: 'line',
          data: seriesA,
          lineStyle: { color: '#1976d2', width: 2, type: 'solid' },
          itemStyle: { color: '#1976d2' },
          symbol: 'none',
          sampling: 'lttb',
          animation: false
        },
        {
          name: `Period B`,
          type: 'line',
          data: seriesB,
          lineStyle: { color: '#f57c00', width: 2, type: 'dashed' },
          itemStyle: { color: '#f57c00' },
          symbol: 'none',
          sampling: 'lttb',
          animation: false
        }
      ],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params: any) => this.formatTooltip(params),
        confine: true
      },
      legend: {
        data: ['Period A', 'Period B'],
        bottom: 4,
        textStyle: { fontSize: 11 }
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
        { type: 'slider', xAxisIndex: 0, bottom: 24, height: 16, borderColor: '#ccc' }
      ],
      animation: false
    } as any;
  }

  private normalizeToRelative(data: TagDataPoint[], periodStart: number): number[][] {
    return data.map(d => [d.ts - periodStart, d.value]);
  }

  private formatTooltip(params: any): string {
    if (!Array.isArray(params) || params.length === 0) return '';
    const relMs = params[0].data[0];
    let html = `<div style="font-size:11px"><b>${this.formatRelativeTime(relMs)}</b>`;
    for (const p of params) {
      const val = typeof p.data[1] === 'number' ? p.data[1].toFixed(2) : p.data[1];
      html += `<br/><span style="color:${p.color}">&#9679;</span> `
            + `${p.seriesName}: <b>${val}</b> ${this.engUnits}`;
    }
    html += '</div>';
    return html;
  }

  private formatRelativeTime(ms: number): string {
    const hours = ms / 3_600_000;
    if (hours < 1) return `${(ms / 60_000).toFixed(0)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    const days = hours / 24;
    return `${days.toFixed(1)}d`;
  }

  // ── Helpers ────────────────────────────────────────────

  formatNum(val: number): string {
    if (val == null || isNaN(val)) return '---';
    return val.toFixed(2);
  }

  formatDelta(a: number, b: number): string {
    if (isNaN(a) || isNaN(b)) return '---';
    const delta = a - b;
    const sign = delta >= 0 ? '+' : '';
    return `${sign}${delta.toFixed(2)}`;
  }

  formatPeriodLabel(period: PeriodConfig): string {
    if (!period.startTs) return '---';
    return `${formatTimestamp(period.startTs, 'datetime')} — ${formatTimestamp(period.endTs, 'datetime')}`;
  }
}
