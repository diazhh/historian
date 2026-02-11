import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnInit,
  OnDestroy,
  TemplateRef,
  ViewChild,
  ChangeDetectorRef
} from '@angular/core';
import * as echarts from 'echarts/core';
import { EChartsOption, SeriesOption } from 'echarts';
import { WidgetContext } from '@home/models/widget-component.models';
import { LineChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { XAXisOption, YAXisOption } from 'echarts/types/dist/shared';
import { ECharts } from '@home/components/widget/lib/chart/echarts-widget.models';

import { TagMetadataService } from '../../../shared/services/tag-metadata.service';
import { TimeWeightedCalcService } from '../../../shared/services/time-weighted.service';
import { TagConfigMap, TagDataPoint, AlarmLimits } from '../../../shared/models/tag.model';
import { exportToCSV } from '../../../shared/utils/export.util';

interface TrendSeries {
  deviceId: string;
  tagKey: string;
  label: string;
  engUnits: string;
  isStep: boolean;
  color: string;
  data: TagDataPoint[];
  alarms: AlarmLimits;
}

interface StatsRow {
  label: string;
  twa: string;
  min: string;
  max: string;
  stdDev: string;
}

const SERIES_COLORS = [
  '#1976d2', '#d32f2f', '#388e3c', '#f57c00', '#7b1fa2',
  '#0097a7', '#c2185b', '#512da8', '#00796b', '#e64a19'
];

@Component({
  selector: 'historian-trend-viewer',
  templateUrl: './trend-viewer.component.html',
  styleUrls: ['./trend-viewer.component.scss']
})
export class TrendViewerComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('echartContainer', { static: false }) echartContainer: ElementRef<HTMLElement>;

  @Input() ctx: WidgetContext;
  @Input() widgetTitlePanel: TemplateRef<any>;

  private myChart: ECharts;
  private resizeObserver: ResizeObserver;
  private option: EChartsOption;
  private series: TrendSeries[] = [];
  private tagConfigCache: TagConfigMap = {};
  private broadcastUnsubscribe: (() => void) | null = null;

  stats: StatsRow[] = [];
  showStats = true;

  constructor(
    private cd: ChangeDetectorRef,
    private tagMetadata: TagMetadataService,
    private twCalc: TimeWeightedCalcService
  ) {}

  ngOnInit(): void {
    (this.ctx.$scope as any).historianTrendViewer = this;
    this.initEcharts();

    // Listen for tagsSelected broadcast from Tag Browser
    this.broadcastUnsubscribe = (this.ctx.$scope as any).$on(
      'tagsSelected',
      (_event: any, payload: { deviceId: string; deviceName?: string; tagKeys: string[] }) => {
        this.onTagsSelected(payload);
      }
    );
  }

  ngAfterViewInit(): void {
    this.myChart = echarts.init(this.echartContainer.nativeElement, null, {
      renderer: 'svg'
    });

    this.resizeObserver = new ResizeObserver(() => this.myChart?.resize());
    this.resizeObserver.observe(this.echartContainer.nativeElement);

    this.setupBaseOption();
    this.myChart.setOption(this.option);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.myChart?.dispose();
    if (this.broadcastUnsubscribe) {
      this.broadcastUnsubscribe();
    }
  }

  public onDataUpdated(): void {
    if (!this.myChart) return;

    this.updateSeriesFromCtxData();
    this.updateChart();
    this.updateStats();
    this.cd.detectChanges();
  }

  async onTagsSelected(payload: { deviceId: string; deviceName?: string; tagKeys: string[] }): Promise<void> {
    const { deviceId, tagKeys } = payload;

    // Load tag config if not cached for this device
    try {
      this.tagConfigCache = await this.tagMetadata.getTagConfig(this.ctx, deviceId);
    } catch {
      this.tagConfigCache = {};
    }

    // Build series
    this.series = tagKeys.map((key, i) => {
      const config = this.tagConfigCache[key];
      return {
        deviceId,
        tagKey: key,
        label: key,
        engUnits: config?.engUnits || '',
        isStep: config?.stepFlag === true,
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        data: [],
        alarms: this.tagMetadata.getAlarmLimits(this.tagConfigCache, key)
      };
    });

    // Fetch timeseries data via REST with smart aggregation
    await this.fetchTimeseriesData(deviceId, tagKeys);
    this.updateChart();
    this.updateStats();
    this.cd.detectChanges();
  }

  exportCSV(): void {
    if (this.series.length === 0) return;

    const headers = ['Timestamp', ...this.series.map(s => `${s.label} (${s.engUnits})`)];

    // Collect all unique timestamps
    const tsSet = new Set<number>();
    for (const s of this.series) {
      for (const d of s.data) {
        tsSet.add(d.ts);
      }
    }
    const timestamps = Array.from(tsSet).sort((a, b) => a - b);

    // Build rows
    const rows = timestamps.map(ts => {
      const row: (string | number | null)[] = [new Date(ts).toISOString()];
      for (const s of this.series) {
        const point = s.data.find(d => d.ts === ts);
        row.push(point?.value ?? null);
      }
      return row;
    });

    exportToCSV(headers, rows, `trend_export_${Date.now()}.csv`);
  }

  toggleStats(): void {
    this.showStats = !this.showStats;
    this.cd.detectChanges();
    setTimeout(() => this.myChart?.resize(), 100);
  }

  // --- Private methods ---

  private initEcharts(): void {
    echarts.use([
      TooltipComponent,
      GridComponent,
      DataZoomComponent,
      MarkLineComponent,
      LegendComponent,
      LineChart,
      SVGRenderer
    ]);
  }

  private setupBaseOption(): void {
    const tw = this.ctx.defaultSubscription?.timeWindow;
    this.option = {
      animation: true,
      animationDuration: 300,
      backgroundColor: 'transparent',
      tooltip: {
        show: true,
        trigger: 'axis',
        confine: true,
        appendTo: 'body',
        textStyle: { fontFamily: 'Roboto', fontSize: 12 }
      },
      legend: {
        show: true,
        bottom: 30,
        type: 'scroll',
        textStyle: { fontSize: 11 }
      },
      grid: {
        left: 60,
        right: 20,
        top: 10,
        bottom: 80
      },
      xAxis: {
        type: 'time',
        min: tw?.minTime,
        max: tw?.maxTime,
        axisLabel: {
          fontSize: 10,
          color: 'rgba(0,0,0,0.54)',
          hideOverlap: true
        },
        splitLine: { show: true },
        axisLine: { lineStyle: { color: 'rgba(0,0,0,0.54)' } }
      } as XAXisOption,
      yAxis: {
        type: 'value',
        scale: true,
        axisLabel: {
          fontSize: 11,
          color: 'rgba(0,0,0,0.54)'
        },
        splitLine: { show: true },
        axisLine: { show: true, lineStyle: { color: 'rgba(0,0,0,0.54)' } }
      } as YAXisOption,
      dataZoom: [
        { type: 'inside', filterMode: 'none', realtime: true },
        { type: 'slider', show: true, bottom: 5, showDetail: false, filterMode: 'none', realtime: true }
      ],
      series: []
    };
  }

  private updateSeriesFromCtxData(): void {
    if (!this.ctx.data || this.series.length === 0) return;

    // If data is being received via ctx.data (subscription), map it to series
    for (const dataEntry of this.ctx.data) {
      const key = dataEntry.dataKey?.name;
      if (!key) continue;

      const trendSeries = this.series.find(s => s.tagKey === key);
      if (trendSeries) {
        trendSeries.data = (dataEntry.data || []).map(([ts, val]: [number, any]) => ({
          ts,
          value: val !== null && val !== '' ? Number(val) : null
        }));
      }
    }
  }

  private updateChart(): void {
    if (!this.myChart) return;

    const tw = this.ctx.defaultSubscription?.timeWindow;
    if (tw) {
      (this.option.xAxis as any).min = tw.minTime;
      (this.option.xAxis as any).max = tw.maxTime;
    }

    const echartsSeriesList: SeriesOption[] = this.series.map(s => {
      const seriesOpt: any = {
        name: s.label,
        type: 'line',
        showSymbol: false,
        smooth: false,
        step: s.isStep ? 'end' : false,
        lineStyle: { color: s.color, width: 1.5 },
        itemStyle: { color: s.color },
        data: s.data
          .filter(d => d.value !== null)
          .map(d => ({ name: d.ts, value: [d.ts, d.value] })),
        markLine: this.buildAlarmMarkLines(s.alarms, s.color)
      };
      return seriesOpt;
    });

    this.option.series = echartsSeriesList;
    this.myChart.setOption(this.option, { replaceMerge: ['series'] });
  }

  private buildAlarmMarkLines(alarms: AlarmLimits, _color: string): any {
    const lines: any[] = [];

    if (alarms.hh !== null) {
      lines.push({
        yAxis: alarms.hh,
        label: { formatter: 'HH', position: 'insideEndTop', fontSize: 9 },
        lineStyle: { color: '#d32f2f', type: 'solid', width: 1 }
      });
    }
    if (alarms.h !== null) {
      lines.push({
        yAxis: alarms.h,
        label: { formatter: 'H', position: 'insideEndTop', fontSize: 9 },
        lineStyle: { color: '#f57c00', type: 'dashed', width: 1 }
      });
    }
    if (alarms.l !== null) {
      lines.push({
        yAxis: alarms.l,
        label: { formatter: 'L', position: 'insideEndBottom', fontSize: 9 },
        lineStyle: { color: '#fbc02d', type: 'dashed', width: 1 }
      });
    }
    if (alarms.ll !== null) {
      lines.push({
        yAxis: alarms.ll,
        label: { formatter: 'LL', position: 'insideEndBottom', fontSize: 9 },
        lineStyle: { color: '#d32f2f', type: 'solid', width: 1 }
      });
    }

    return lines.length > 0 ? { symbol: 'none', data: lines } : undefined;
  }

  private updateStats(): void {
    this.stats = this.series.map(s => {
      const validData = s.data.filter(d => d.value !== null);
      const twa = this.twCalc.average(validData);
      const min = this.twCalc.min(validData);
      const max = this.twCalc.max(validData);
      const stdDev = this.twCalc.standardDeviation(validData);

      return {
        label: `${s.label} (${s.engUnits})`,
        twa: twa.toFixed(2),
        min: min.toFixed(2),
        max: max.toFixed(2),
        stdDev: stdDev.toFixed(2)
      };
    });
  }

  private async fetchTimeseriesData(deviceId: string, tagKeys: string[]): Promise<void> {
    const tw = this.ctx.defaultSubscription?.timeWindow;
    if (!tw) return;

    const startTs = tw.minTime;
    const endTs = tw.maxTime;
    const rangeMs = endTs - startTs;
    const { agg, interval } = this.getAggregation(rangeMs);

    const keys = tagKeys.join(',');
    let url = `/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=${keys}&startTs=${startTs}&endTs=${endTs}`;

    if (agg !== 'NONE') {
      url += `&agg=${agg}&interval=${interval}`;
    }
    url += '&limit=10000&orderBy=ASC';

    try {
      const result: Record<string, Array<{ ts: number; value: string }>> =
        await this.ctx.http.get<any>(url).toPromise();

      for (const s of this.series) {
        const raw = result?.[s.tagKey] || [];
        s.data = raw.map(p => ({
          ts: p.ts,
          value: p.value !== null && p.value !== '' ? Number(p.value) : null
        }));
      }
    } catch {
      // Failed to fetch timeseries
    }
  }

  private getAggregation(rangeMs: number): { agg: string; interval: number } {
    const HOUR = 3600000;
    const DAY = 86400000;

    if (rangeMs <= 24 * HOUR) {
      return { agg: 'NONE', interval: 0 };
    }
    if (rangeMs <= 7 * DAY) {
      return { agg: 'AVG', interval: 60000 }; // 1 min
    }
    if (rangeMs <= 30 * DAY) {
      return { agg: 'AVG', interval: 300000 }; // 5 min
    }
    return { agg: 'AVG', interval: HOUR }; // 1 hour
  }
}
