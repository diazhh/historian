///
/// Industrial Historian - W1 Industrial Trend Viewer Component
///
/// Multi-pen time-series chart replicating PI Vision trend functionality.
/// Features: multi-panel with echarts.connect(), adaptive aggregation,
/// progressive loading on zoom, paginated data fetch, alarm overlays,
/// real-time streaming, zoom/pan, crosshair, CSV/PNG export.
///

import {
  Component, Input, OnInit, OnDestroy,
  ViewChildren, QueryList, ElementRef, ChangeDetectorRef
} from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import * as echarts from 'echarts';

import { TbApiService } from '../../../shared/services/tb-api.service';
import { BroadcastService } from '../../../shared/services/broadcast.service';
import {
  TagDataPoint, AlarmLimits
} from '../../../shared/models/tag.model';
import { HistorianAlarm, AlarmSeverity } from '../../../shared/models/alarm.model';
import {
  timeWeightedAverage, timeWeightedMin, timeWeightedMax
} from '../../../shared/utils/time.util';
import {
  formatTimestamp, severityColor
} from '../../../shared/utils/format.util';
import {
  TrendViewerSettings, DEFAULT_SETTINGS, PEN_COLORS, TIME_PRESETS,
  AggregationConfig, getAggregationConfig, SS_ATTR_KEYS
} from './trend-viewer.config';

// ── Pen model ────────────────────────────────────────────

interface PenConfig {
  deviceId: string;
  deviceName: string;
  color: string;
  engUnits: string;
  yAxisIndex: number;
  panelIndex: number;
  alarmLimits: AlarmLimits;
  visible: boolean;
  data: TagDataPoint[];
  alarms: HistorianAlarm[];
  stats: { min: number; max: number; avg: number; current: number };
}

// ── Constants ────────────────────────────────────────────

const MAX_INTERVALS = 700;
const PV_KEY = 'PV';

@Component({
  selector: 'historian-trend-viewer',
  templateUrl: './w1-trend-viewer.component.html',
  styleUrls: ['./w1-trend-viewer.component.scss']
})
export class W1TrendViewerComponent implements OnInit, OnDestroy {
  @Input() ctx: any;
  @ViewChildren('chartPanel') chartPanels!: QueryList<ElementRef>;

  // Public state (template bindings)
  settings: TrendViewerSettings = { ...DEFAULT_SETTINGS };
  pens: PenConfig[] = [];
  isLive = true;
  loading = false;
  activePreset = DEFAULT_SETTINGS.defaultTimeRangeMs;
  timeRange = { startTs: 0, endTs: 0 };
  timeRangeLabel = '';
  timePresets = TIME_PRESETS;
  panelIndices: number[] = [0];

  // Private state
  private charts: echarts.ECharts[] = [];
  private groupId = `historian-trend-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  private resizeObserver: ResizeObserver | null = null;
  private liveTimer: ReturnType<typeof setInterval> | null = null;
  private zoomDebounce: ReturnType<typeof setTimeout> | null = null;
  private subs: Subscription[] = [];
  private currentAgg: AggregationConfig = { agg: 'NONE', interval: 0 };

  constructor(
    private tbApi: TbApiService,
    private broadcast: BroadcastService,
    private cdr: ChangeDetectorRef
  ) {}

  // ── Lifecycle ────────────────────────────────────────

  ngOnInit(): void {
    this.tbApi.init(this.ctx);

    if (this.ctx?.settings) {
      this.settings = { ...DEFAULT_SETTINGS, ...this.ctx.settings };
    }
    this.activePreset = this.settings.defaultTimeRangeMs;
    this.panelIndices = Array.from({ length: Math.max(1, this.settings.panelCount) }, (_, i) => i);

    // Widget bridge for TB controllerScript
    this.ctx.$scope.historianWidget = {
      init: () => this.initChart()
    };

    // Real-time data from TB subscription
    if (this.ctx.defaultSubscription) {
      this.ctx.defaultSubscription.onDataUpdated = () => {
        if (this.isLive) this.onSubscriptionDataUpdated();
        this.ctx.detectChanges();
      };
    }

    // Listen for tag selections from W2 Tag Browser
    this.subs.push(
      this.broadcast.tagsSelected$.subscribe(sel => {
        this.loadTags(sel.deviceIds, sel.deviceNames);
      })
    );

    // Listen for time range changes from other widgets
    this.subs.push(
      this.broadcast.timeRangeChanged$.subscribe(range => {
        this.isLive = false;
        this.stopLiveTimer();
        this.timeRange = { ...range };
        this.activePreset = range.endTs - range.startTs;
        this.refreshAllPens();
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.stopLiveTimer();
    if (this.zoomDebounce) clearTimeout(this.zoomDebounce);
    this.resizeObserver?.disconnect();
    for (const chart of this.charts) {
      chart.dispose();
    }
    if (this.charts.length > 1) {
      echarts.disconnect(this.groupId);
    }
    this.charts = [];
  }

  // ── Initialization ───────────────────────────────────

  private initChart(): void {
    const panels = this.chartPanels?.toArray();
    if (!panels || panels.length === 0) return;

    // Create an ECharts instance per panel
    for (const panelRef of panels) {
      const el = panelRef.nativeElement;
      const chart = echarts.init(el);
      this.charts.push(chart);

      // ECharts events — datazoom debounced, dblclick resets
      chart.on('datazoom', () => this.onDataZoom());
      chart.on('dblclick', () => this.resetZoom());
    }

    // Connect panels for synchronized crosshairs, tooltips, and dataZoom
    if (this.charts.length > 1) {
      for (const chart of this.charts) {
        chart.group = this.groupId;
      }
      echarts.connect(this.groupId);
    }

    // Observe resize on the panels container (parent of all panels)
    const container = panels[0].nativeElement.parentElement;
    if (container) {
      this.resizeObserver = new ResizeObserver(() => {
        for (const chart of this.charts) chart.resize();
      });
      this.resizeObserver.observe(container);
    }

    const now = Date.now();
    this.timeRange = { startTs: now - this.activePreset, endTs: now };
    this.updateTimeRangeLabel();

    this.updateAllCharts();

    // Auto-load from widget datasources if configured
    if (this.ctx.datasources?.length > 0) {
      this.loadFromDatasources();
    }
  }

  private loadFromDatasources(): void {
    const ids: string[] = [];
    const names: string[] = [];
    for (const ds of this.ctx.datasources) {
      if (ds.entityId && !ids.includes(ds.entityId)) {
        ids.push(ds.entityId);
        names.push(ds.entityName || ds.name || ds.entityId);
      }
    }
    if (ids.length > 0) {
      this.loadTags(ids, names);
    }
  }

  // ── Tag loading ──────────────────────────────────────

  async loadTags(deviceIds: string[], deviceNames: string[]): Promise<void> {
    this.loading = true;
    this.cdr.detectChanges();

    const maxPens = this.settings.maxPens;
    const newPens: PenConfig[] = [];

    for (let i = 0; i < Math.min(deviceIds.length, maxPens); i++) {
      // Reuse existing pen if device is already loaded
      const existing = this.pens.find(p => p.deviceId === deviceIds[i]);
      if (existing) {
        existing.color = PEN_COLORS[i % PEN_COLORS.length];
        newPens.push(existing);
        continue;
      }

      const pen: PenConfig = {
        deviceId: deviceIds[i],
        deviceName: deviceNames[i] || deviceIds[i],
        color: PEN_COLORS[i % PEN_COLORS.length],
        engUnits: '',
        yAxisIndex: 0,
        panelIndex: 0,
        alarmLimits: { hh: null, h: null, l: null, ll: null },
        visible: true,
        data: [],
        alarms: [],
        stats: { min: NaN, max: NaN, avg: NaN, current: NaN }
      };

      // Fetch tag metadata (server-scope attributes)
      try {
        const attrs = await firstValueFrom(
          this.tbApi.getEntityAttributes('DEVICE', pen.deviceId, 'SERVER_SCOPE', SS_ATTR_KEYS)
        );
        const map = new Map(attrs.map(a => [a.key, a.value]));
        pen.engUnits = map.get('ss_engUnits') ?? '';
        pen.alarmLimits = {
          hh: this.parseNullNum(map.get('ss_alarmHH')),
          h:  this.parseNullNum(map.get('ss_alarmH')),
          l:  this.parseNullNum(map.get('ss_alarmL')),
          ll: this.parseNullNum(map.get('ss_alarmLL'))
        };
      } catch { /* use defaults */ }

      newPens.push(pen);
    }

    this.pens = newPens;
    this.assignPanelsAndAxes();
    await this.refreshAllPens();

    this.loading = false;
    this.cdr.detectChanges();

    if (this.isLive) this.startLiveTimer();
  }

  // ── Panel & Y-axis assignment ─────────────────────────

  private assignPanelsAndAxes(): void {
    const panelCount = this.panelIndices.length;

    if (panelCount <= 1) {
      // Single panel: all pens on panel 0, Y-axes by unit
      const unitMap = new Map<string, number>();
      for (const pen of this.pens) {
        pen.panelIndex = 0;
        const unit = pen.engUnits || '?';
        if (!unitMap.has(unit) && unitMap.size < 4) {
          unitMap.set(unit, unitMap.size);
        }
        pen.yAxisIndex = unitMap.get(unit) ?? 0;
      }
      return;
    }

    // Multi-panel: group pens by engineering units, distribute groups across panels
    const unitGroups = new Map<string, PenConfig[]>();
    for (const pen of this.pens) {
      const unit = pen.engUnits || '?';
      if (!unitGroups.has(unit)) unitGroups.set(unit, []);
      unitGroups.get(unit)!.push(pen);
    }

    let groupIdx = 0;
    for (const [, groupPens] of unitGroups) {
      const targetPanel = groupIdx % panelCount;
      for (const pen of groupPens) {
        pen.panelIndex = targetPanel;
        pen.yAxisIndex = 0; // Each panel manages its own single Y-axis per group
      }
      groupIdx++;
    }

    // Re-assign per-panel Y-axes (each panel can have up to 4 Y-axes)
    for (let pi = 0; pi < panelCount; pi++) {
      const panelPens = this.pens.filter(p => p.panelIndex === pi);
      const unitMap = new Map<string, number>();
      for (const pen of panelPens) {
        const unit = pen.engUnits || '?';
        if (!unitMap.has(unit) && unitMap.size < 4) {
          unitMap.set(unit, unitMap.size);
        }
        pen.yAxisIndex = unitMap.get(unit) ?? 0;
      }
    }
  }

  // ── Data fetching ────────────────────────────────────

  async refreshAllPens(): Promise<void> {
    const rangeMs = this.timeRange.endTs - this.timeRange.startTs;
    this.currentAgg = getAggregationConfig(rangeMs);

    const fetches = this.pens.map(pen => this.fetchPenData(pen));
    await Promise.all(fetches);

    // Also fetch alarms if overlays are enabled
    if (this.settings.showAlarmOverlays) {
      await Promise.all(this.pens.map(pen => this.fetchAlarms(pen)));
    }

    this.updateAllCharts();
    this.updateTimeRangeLabel();
    this.cdr.detectChanges();
  }

  private async fetchPenData(pen: PenConfig): Promise<void> {
    try {
      pen.data = await this.fetchWithPagination(
        pen.deviceId, PV_KEY,
        this.timeRange.startTs, this.timeRange.endTs,
        this.currentAgg.agg, this.currentAgg.interval
      );
      pen.data.sort((a, b) => a.ts - b.ts);
      this.updatePenStats(pen);
    } catch {
      // Keep existing data on error
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
    agg: 'NONE' | 'AVG',
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
        // If we got fewer than the typical batch limit, we've exhausted data
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

  private async fetchAlarms(pen: PenConfig): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.tbApi.getAlarms('DEVICE', pen.deviceId, {
          startTs: this.timeRange.startTs,
          endTs: this.timeRange.endTs,
          pageSize: 100,
          sortOrder: 'ASC'
        })
      );
      pen.alarms = result.data || [];
    } catch {
      pen.alarms = [];
    }
  }

  // ── Chart rendering ──────────────────────────────────

  private updateAllCharts(): void {
    for (let pi = 0; pi < this.charts.length; pi++) {
      const chart = this.charts[pi];
      chart.setOption(this.buildChartOptions(pi), { notMerge: true });
    }
  }

  private buildChartOptions(panelIndex: number): echarts.EChartsOption {
    const panelPens = this.pens.filter(p => p.panelIndex === panelIndex);

    // Y-axes for this panel
    const yAxes: any[] = [];
    const seenUnits = new Map<number, string>();
    for (const pen of panelPens) {
      if (!seenUnits.has(pen.yAxisIndex)) {
        seenUnits.set(pen.yAxisIndex, pen.engUnits || '');
      }
    }
    for (let i = 0; i < Math.max(1, seenUnits.size); i++) {
      yAxes.push({
        type: 'value',
        name: seenUnits.get(i) || '',
        nameTextStyle: { fontSize: 10 },
        position: i % 2 === 0 ? 'left' : 'right',
        offset: i >= 2 ? 60 : 0,
        axisLabel: { fontSize: 10 },
        splitLine: { show: i === 0 },
        axisLine: { show: true }
      });
    }

    // Series for this panel
    const series: any[] = panelPens.map((pen, idx) => {
      const s: any = {
        name: pen.deviceName,
        type: 'line',
        yAxisIndex: pen.yAxisIndex,
        data: pen.visible ? pen.data.map(d => [d.ts, d.value]) : [],
        lineStyle: { color: pen.color, width: 1.5 },
        itemStyle: { color: pen.color },
        symbol: 'none',
        sampling: 'lttb',
        animation: false
      };

      // Alarm limit markLines
      if (this.settings.showAlarmLimits && pen.visible) {
        const lines = this.buildAlarmLimitLines(pen);
        if (lines.length > 0) {
          s.markLine = { silent: true, symbol: 'none', data: lines };
        }
      }

      // Alarm overlay markArea — attach to first series in this panel
      if (this.settings.showAlarmOverlays && idx === 0 && pen.alarms.length > 0) {
        s.markArea = this.buildAlarmOverlay(pen.alarms);
      }

      return s;
    });

    const isLastPanel = panelIndex === this.panelIndices.length - 1;
    const isMultiPanel = this.panelIndices.length > 1;

    return {
      grid: {
        left: 60,
        right: yAxes.length > 2 ? 120 : 60,
        top: 24,
        bottom: isLastPanel ? 56 : (isMultiPanel ? 16 : 56)
      },
      xAxis: {
        type: 'time',
        min: this.timeRange.startTs,
        max: this.timeRange.endTs,
        axisLabel: {
          fontSize: 10,
          show: isLastPanel // Only show x-axis labels on last panel
        },
        axisTick: { show: isLastPanel },
        splitLine: { show: false }
      },
      yAxis: yAxes,
      series,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (params: any) => this.formatTooltip(params),
        confine: true
      },
      dataZoom: isLastPanel ? [
        { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
        { type: 'slider', xAxisIndex: 0, bottom: 8, height: 20, borderColor: '#ccc' }
      ] : [
        { type: 'inside', xAxisIndex: 0, filterMode: 'none' }
      ],
      animation: false
    } as any;
  }

  private buildAlarmLimitLines(pen: PenConfig): any[] {
    const lines: any[] = [];
    const limits = pen.alarmLimits;
    const defs: Array<{ val: number | null; label: string; color: string; pos: string }> = [
      { val: limits.hh, label: 'HH', color: '#d32f2f', pos: 'insideEndTop' },
      { val: limits.h,  label: 'H',  color: '#f57c00', pos: 'insideEndTop' },
      { val: limits.l,  label: 'L',  color: '#1976d2', pos: 'insideEndBottom' },
      { val: limits.ll, label: 'LL', color: '#d32f2f', pos: 'insideEndBottom' }
    ];
    for (const d of defs) {
      if (d.val != null) {
        lines.push({
          yAxis: d.val,
          lineStyle: { color: d.color, type: 'dashed', width: 1 },
          label: { formatter: d.label, position: d.pos, fontSize: 9 }
        });
      }
    }
    return lines;
  }

  private buildAlarmOverlay(alarms: HistorianAlarm[]): any {
    return {
      silent: true,
      data: alarms.map(a => [{
        xAxis: a.startTs,
        itemStyle: {
          color: severityColor(a.severity),
          opacity: this.alarmOpacity(a.severity)
        }
      }, {
        xAxis: a.endTs || this.timeRange.endTs
      }])
    };
  }

  private alarmOpacity(severity: AlarmSeverity): number {
    switch (severity) {
      case AlarmSeverity.CRITICAL: return 0.25;
      case AlarmSeverity.MAJOR:    return 0.20;
      case AlarmSeverity.MINOR:    return 0.15;
      case AlarmSeverity.WARNING:  return 0.10;
      default:                     return 0.08;
    }
  }

  // ── Tooltip ──────────────────────────────────────────

  private formatTooltip(params: any): string {
    if (!Array.isArray(params) || params.length === 0) return '';
    const ts = params[0].data[0];
    let html = `<div style="font-size:11px"><b>${formatTimestamp(ts)}</b>`;
    for (const p of params) {
      const pen = this.pens.find(x => x.deviceName === p.seriesName);
      const units = pen?.engUnits || '';
      const val = typeof p.data[1] === 'number' ? p.data[1].toFixed(2) : p.data[1];
      html += `<br/><span style="color:${p.color}">&#9679;</span> `
            + `${p.seriesName}: <b>${val}</b> ${units}`;
    }
    html += '</div>';
    return html;
  }

  // ── Live mode ────────────────────────────────────────

  toggleLive(): void {
    this.isLive = !this.isLive;
    if (this.isLive) {
      this.startLiveTimer();
    } else {
      this.stopLiveTimer();
    }
  }

  private startLiveTimer(): void {
    this.stopLiveTimer();
    if (this.pens.length === 0) return;

    this.liveTimer = setInterval(async () => {
      const now = Date.now();
      const windowStart = now - this.activePreset;

      for (const pen of this.pens) {
        // Only fetch new data since the last known timestamp
        const lastTs = pen.data.length > 0
          ? pen.data[pen.data.length - 1].ts
          : windowStart;
        try {
          const batch = await firstValueFrom(
            this.tbApi.getTimeseries('DEVICE', pen.deviceId, [PV_KEY], lastTs + 1, now)
          );
          const pts = batch[PV_KEY] || [];
          if (pts.length > 0) {
            pen.data.push(...pts);
            pen.data.sort((a, b) => a.ts - b.ts);
          }
        } catch { /* continue with other pens */ }

        // Trim data outside the live window
        pen.data = pen.data.filter(d => d.ts >= windowStart);
        this.updatePenStats(pen);
      }

      this.timeRange = { startTs: windowStart, endTs: now };
      this.updateAllCharts();
      this.updateTimeRangeLabel();
      this.cdr.detectChanges();
    }, this.settings.autoRefreshMs);
  }

  private stopLiveTimer(): void {
    if (this.liveTimer != null) {
      clearInterval(this.liveTimer);
      this.liveTimer = null;
    }
  }

  /**
   * Handle real-time data pushed via TB subscription (ctx.data).
   * Appends new points and trims the window.
   */
  private onSubscriptionDataUpdated(): void {
    if (!this.ctx.data || this.pens.length === 0) return;

    for (const entry of this.ctx.data) {
      const entityId = entry.datasource?.entityId;
      if (!entityId) continue;
      const pen = this.pens.find(p => p.deviceId === entityId);
      if (!pen || !entry.data?.length) continue;

      const lastTs = pen.data.length > 0 ? pen.data[pen.data.length - 1].ts : 0;
      for (const [ts, val] of entry.data) {
        if (ts > lastTs) {
          pen.data.push({ ts, value: parseFloat(val) });
        }
      }
    }

    const now = Date.now();
    const windowStart = now - this.activePreset;
    for (const pen of this.pens) {
      pen.data = pen.data.filter(d => d.ts >= windowStart);
      this.updatePenStats(pen);
    }

    this.timeRange = { startTs: windowStart, endTs: now };
    this.updateAllCharts();
  }

  // ── Time range & zoom ────────────────────────────────

  setTimePreset(ms: number): void {
    this.activePreset = ms;
    const now = Date.now();
    this.timeRange = { startTs: now - ms, endTs: now };
    this.isLive = true;
    this.refreshAllPens();
    this.startLiveTimer();
  }

  resetZoom(): void {
    if (this.isLive) {
      const now = Date.now();
      this.timeRange = { startTs: now - this.activePreset, endTs: now };
    }
    this.refreshAllPens();
  }

  private onDataZoom(): void {
    // Debounce re-fetch so we don't fire during continuous zoom
    if (this.zoomDebounce) clearTimeout(this.zoomDebounce);
    this.zoomDebounce = setTimeout(() => this.handleZoomEnd(), 400);
  }

  /**
   * Progressive loading: after zoom ends, check if a higher-resolution
   * aggregation level is appropriate for the new visible range.
   * If so, re-fetch data at the finer granularity.
   */
  private handleZoomEnd(): void {
    if (this.charts.length === 0) return;

    // Read zoom state from the first chart (all are synced via echarts.connect)
    const option = this.charts[0].getOption() as any;
    const dz = option?.dataZoom?.[0];
    if (dz?.startValue == null || dz?.endValue == null) return;

    const visibleStart = dz.startValue as number;
    const visibleEnd = dz.endValue as number;
    const visibleRange = visibleEnd - visibleStart;

    const newAgg = getAggregationConfig(visibleRange);

    // Only re-fetch if aggregation level changed (progressive loading)
    if (newAgg.interval !== this.currentAgg.interval) {
      this.timeRange = { startTs: visibleStart, endTs: visibleEnd };
      this.isLive = false;
      this.stopLiveTimer();
      this.refreshAllPens();
    }

    this.updateTimeRangeLabel();
    this.cdr.detectChanges();
  }

  // ── Legend & stats ───────────────────────────────────

  private updatePenStats(pen: PenConfig): void {
    if (pen.data.length === 0) {
      pen.stats = { min: NaN, max: NaN, avg: NaN, current: NaN };
      return;
    }
    pen.stats = {
      min: timeWeightedMin(pen.data),
      max: timeWeightedMax(pen.data),
      avg: timeWeightedAverage(pen.data),
      current: pen.data[pen.data.length - 1].value
    };
  }

  togglePenVisibility(pen: PenConfig): void {
    pen.visible = !pen.visible;
    this.updateAllCharts();
  }

  onPenDoubleClick(event: MouseEvent, pen: PenConfig): void {
    event.stopPropagation();
    // Emit tag click so W3 Tag Detail can show details
    this.broadcast.emitTagClicked({
      deviceId: pen.deviceId,
      deviceName: pen.deviceName,
      key: PV_KEY
    });
  }

  // ── Export ───────────────────────────────────────────

  exportCSV(): void {
    // Collect all unique timestamps across all visible pens
    const tsSet = new Set<number>();
    const visiblePens = this.pens.filter(p => p.visible);
    for (const pen of visiblePens) {
      for (const dp of pen.data) tsSet.add(dp.ts);
    }
    const timestamps = Array.from(tsSet).sort((a, b) => a - b);

    // Build value lookup per pen
    const penMaps = visiblePens.map(pen => {
      const map = new Map<number, number>();
      for (const dp of pen.data) map.set(dp.ts, dp.value);
      return map;
    });

    // Assemble CSV
    const header = ['Timestamp', ...visiblePens.map(p => `${p.deviceName} (${p.engUnits})`)];
    const rows = timestamps.map(ts => {
      const vals = penMaps.map(m => {
        const v = m.get(ts);
        return v != null ? v.toFixed(4) : '';
      });
      return [new Date(ts).toISOString(), ...vals].join(',');
    });

    const csv = [header.join(','), ...rows].join('\n');
    this.downloadFile(csv, `trend_export_${Date.now()}.csv`, 'text/csv');
  }

  exportPNG(): void {
    if (this.charts.length === 0) return;

    if (this.charts.length === 1) {
      // Single panel — direct export
      const url = this.charts[0].getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
      this.downloadDataUrl(url, `trend_export_${Date.now()}.png`);
      return;
    }

    // Multi-panel — composite all panels into a single image
    const urls = this.charts.map(c => c.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' }));
    const images: HTMLImageElement[] = [];
    let loaded = 0;

    for (const url of urls) {
      const img = new Image();
      img.onload = () => {
        loaded++;
        if (loaded === urls.length) {
          this.compositeAndDownload(images);
        }
      };
      img.src = url;
      images.push(img);
    }
  }

  private compositeAndDownload(images: HTMLImageElement[]): void {
    const canvas = document.createElement('canvas');
    const c = canvas.getContext('2d');
    if (!c) return;

    const maxWidth = Math.max(...images.map(img => img.width));
    const totalHeight = images.reduce((sum, img) => sum + img.height, 0);

    canvas.width = maxWidth;
    canvas.height = totalHeight;
    c.fillStyle = '#fff';
    c.fillRect(0, 0, maxWidth, totalHeight);

    let y = 0;
    for (const img of images) {
      c.drawImage(img, 0, y);
      y += img.height;
    }

    this.downloadDataUrl(canvas.toDataURL('image/png'), `trend_export_${Date.now()}.png`);
  }

  private downloadDataUrl(dataUrl: string, filename: string): void {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  }

  private downloadFile(content: string, filename: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Utilities ────────────────────────────────────────

  private updateTimeRangeLabel(): void {
    const start = formatTimestamp(this.timeRange.startTs, 'datetime');
    const end = formatTimestamp(this.timeRange.endTs, 'datetime');
    const aggLabel = this.currentAgg.agg === 'NONE'
      ? 'Raw'
      : `Avg ${this.formatIntervalLabel(this.currentAgg.interval)}`;
    this.timeRangeLabel = `${start}  —  ${end}  [${aggLabel}]`;
  }

  private formatIntervalLabel(ms: number): string {
    if (ms >= 86_400_000) return `${ms / 86_400_000}d`;
    if (ms >= 3_600_000)  return `${ms / 3_600_000}h`;
    if (ms >= 60_000)     return `${ms / 60_000}m`;
    return `${ms / 1000}s`;
  }

  formatNum(val: number): string {
    if (val == null || isNaN(val)) return '---';
    return val.toFixed(2);
  }

  private parseNullNum(val: any): number | null {
    if (val == null || val === '') return null;
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  }
}
