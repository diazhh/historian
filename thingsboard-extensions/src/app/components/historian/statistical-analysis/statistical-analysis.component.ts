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
import { EChartsOption } from 'echarts';
import { WidgetContext } from '@home/models/widget-component.models';
import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  LegendComponent
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { ECharts } from '@home/components/widget/lib/chart/echarts-widget.models';
import { TimeWeightedCalcService } from '../../../shared/services/time-weighted.service';
import { TagDataPoint } from '../../../shared/models/tag.model';

type ChartMode = 'histogram' | 'scatter' | 'spc';

@Component({
  selector: 'historian-statistical',
  templateUrl: './statistical-analysis.component.html',
  styleUrls: ['./statistical-analysis.component.scss']
})
export class StatisticalAnalysisComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('statChart', { static: false }) chartContainer: ElementRef<HTMLElement>;

  @Input() ctx: WidgetContext;
  @Input() widgetTitlePanel: TemplateRef<any>;

  private chart: ECharts;
  private resizeObserver: ResizeObserver;
  private broadcastUnsubscribe: (() => void) | null = null;
  private seriesData: Record<string, TagDataPoint[]> = {};

  chartMode: ChartMode = 'histogram';
  bins = 20;
  selectedTagX: string | null = null;
  selectedTagY: string | null = null;
  availableTags: string[] = [];

  stats = {
    twa: '--', min: '--', max: '--', stdDev: '--', count: '--', range: '--'
  };

  constructor(
    private cd: ChangeDetectorRef,
    private twCalc: TimeWeightedCalcService
  ) {}

  ngOnInit(): void {
    (this.ctx.$scope as any).historianStatistical = this;
    echarts.use([GridComponent, TooltipComponent, MarkLineComponent, LegendComponent,
                 BarChart, LineChart, ScatterChart, SVGRenderer]);

    this.broadcastUnsubscribe = (this.ctx.$scope as any).$on(
      'tagsSelected',
      (_event: any, payload: { deviceId: string; tagKeys: string[] }) => {
        this.onTagsSelected(payload);
      }
    );
  }

  ngAfterViewInit(): void {
    this.chart = echarts.init(this.chartContainer.nativeElement, null, { renderer: 'svg' });
    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(this.chartContainer.nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
    if (this.broadcastUnsubscribe) this.broadcastUnsubscribe();
  }

  public onDataUpdated(): void {
    this.updateFromCtxData();
  }

  async onTagsSelected(payload: { deviceId: string; tagKeys: string[] }): Promise<void> {
    this.availableTags = payload.tagKeys;
    this.selectedTagX = payload.tagKeys[0] || null;
    this.selectedTagY = payload.tagKeys[1] || null;

    const tw = this.ctx.defaultSubscription?.timeWindow;
    if (!tw) return;

    const keys = payload.tagKeys.join(',');
    const url = `/api/plugins/telemetry/DEVICE/${payload.deviceId}/values/timeseries?keys=${keys}&startTs=${tw.minTime}&endTs=${tw.maxTime}&agg=NONE&limit=10000&orderBy=ASC`;

    try {
      const result: Record<string, Array<{ ts: number; value: string }>> =
        await this.ctx.http.get<any>(url).toPromise();

      this.seriesData = {};
      for (const key of payload.tagKeys) {
        this.seriesData[key] = (result[key] || []).map(p => ({
          ts: p.ts,
          value: p.value !== null && p.value !== '' ? Number(p.value) : null
        }));
      }
    } catch {
      this.seriesData = {};
    }

    this.updateChart();
    this.cd.detectChanges();
  }

  setMode(mode: ChartMode): void {
    this.chartMode = mode;
    this.updateChart();
    this.cd.detectChanges();
  }

  onBinsChange(): void {
    if (this.chartMode === 'histogram') this.updateChart();
  }

  onTagSelectionChange(): void {
    this.updateChart();
    this.cd.detectChanges();
  }

  private updateFromCtxData(): void {
    if (!this.ctx.data) return;
    this.seriesData = {};
    this.availableTags = [];
    for (const entry of this.ctx.data) {
      const key = entry.dataKey?.name;
      if (!key) continue;
      this.availableTags.push(key);
      this.seriesData[key] = (entry.data || []).map(([ts, val]: [number, any]) => ({
        ts, value: val !== null && val !== '' ? Number(val) : null
      }));
    }
    if (!this.selectedTagX && this.availableTags.length > 0) this.selectedTagX = this.availableTags[0];
    if (!this.selectedTagY && this.availableTags.length > 1) this.selectedTagY = this.availableTags[1];
    this.updateChart();
  }

  private updateChart(): void {
    if (!this.chart) return;

    switch (this.chartMode) {
      case 'histogram': this.renderHistogram(); break;
      case 'scatter': this.renderScatter(); break;
      case 'spc': this.renderSPC(); break;
    }
  }

  private renderHistogram(): void {
    const tag = this.selectedTagX;
    if (!tag || !this.seriesData[tag]) return;

    const data = this.seriesData[tag].filter(d => d.value !== null);
    this.updateStats(data);

    const values = data.map(d => d.value!);
    if (values.length === 0) return;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const binWidth = (max - min) / this.bins || 1;

    const binCounts = new Array(this.bins).fill(0);
    const binLabels: string[] = [];

    for (let i = 0; i < this.bins; i++) {
      const lo = min + i * binWidth;
      const hi = lo + binWidth;
      binLabels.push(lo.toFixed(1));
      for (const v of values) {
        if (v >= lo && (i === this.bins - 1 ? v <= hi : v < hi)) binCounts[i]++;
      }
    }

    const option: EChartsOption = {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: binLabels, axisLabel: { fontSize: 10, rotate: 45 } },
      yAxis: { type: 'value', name: 'Count', axisLabel: { fontSize: 10 } },
      series: [{ type: 'bar', data: binCounts, itemStyle: { color: '#1976d2' } }],
      grid: { left: 50, right: 20, top: 20, bottom: 60 }
    };
    this.chart.setOption(option, true);
  }

  private renderScatter(): void {
    const tagX = this.selectedTagX;
    const tagY = this.selectedTagY;
    if (!tagX || !tagY || !this.seriesData[tagX] || !this.seriesData[tagY]) return;

    // Match by closest timestamp
    const dataX = this.seriesData[tagX].filter(d => d.value !== null);
    const dataY = this.seriesData[tagY].filter(d => d.value !== null);

    const points: [number, number][] = [];
    for (const px of dataX) {
      const closest = dataY.reduce((best, py) =>
        Math.abs(py.ts - px.ts) < Math.abs(best.ts - px.ts) ? py : best
      , dataY[0]);
      if (closest && Math.abs(closest.ts - px.ts) < 60000) {
        points.push([px.value!, closest.value!]);
      }
    }

    const option: EChartsOption = {
      tooltip: { trigger: 'item' },
      xAxis: { type: 'value', name: tagX, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', name: tagY, axisLabel: { fontSize: 10 } },
      series: [{ type: 'scatter', data: points, symbolSize: 4, itemStyle: { color: '#1976d2' } }],
      grid: { left: 60, right: 20, top: 20, bottom: 50 }
    };
    this.chart.setOption(option, true);
  }

  private renderSPC(): void {
    const tag = this.selectedTagX;
    if (!tag || !this.seriesData[tag]) return;

    const data = this.seriesData[tag].filter(d => d.value !== null);
    this.updateStats(data);
    if (data.length < 3) return;

    const values = data.map(d => d.value!);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;

    // Moving range
    const mr: number[] = [];
    for (let i = 1; i < values.length; i++) {
      mr.push(Math.abs(values[i] - values[i - 1]));
    }
    const mrBar = mr.reduce((a, b) => a + b, 0) / mr.length;

    const UCL = mean + 2.66 * mrBar;
    const LCL = mean - 2.66 * mrBar;

    const timestamps = data.map(d => d.ts);

    const option: EChartsOption = {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'time', axisLabel: { fontSize: 9 } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
      series: [{
        type: 'line',
        showSymbol: true,
        symbolSize: 3,
        data: data.map(d => [d.ts, d.value]),
        lineStyle: { color: '#1976d2', width: 1 },
        itemStyle: { color: '#1976d2' },
        markLine: {
          symbol: 'none',
          data: [
            { yAxis: mean, label: { formatter: 'Mean', fontSize: 9 }, lineStyle: { color: '#388e3c', type: 'solid' } },
            { yAxis: UCL, label: { formatter: 'UCL', fontSize: 9 }, lineStyle: { color: '#d32f2f', type: 'dashed' } },
            { yAxis: LCL, label: { formatter: 'LCL', fontSize: 9 }, lineStyle: { color: '#d32f2f', type: 'dashed' } }
          ]
        }
      }],
      grid: { left: 60, right: 20, top: 20, bottom: 40 }
    };
    this.chart.setOption(option, true);
  }

  private updateStats(data: TagDataPoint[]): void {
    if (data.length === 0) {
      this.stats = { twa: '--', min: '--', max: '--', stdDev: '--', count: '--', range: '--' };
      return;
    }
    this.stats = {
      twa: this.twCalc.average(data).toFixed(3),
      min: this.twCalc.min(data).toFixed(3),
      max: this.twCalc.max(data).toFixed(3),
      stdDev: this.twCalc.standardDeviation(data).toFixed(3),
      count: String(this.twCalc.count(data)),
      range: this.twCalc.range(data).toFixed(3)
    };
  }
}
