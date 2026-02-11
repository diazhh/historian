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
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { ECharts } from '@home/components/widget/lib/chart/echarts-widget.models';
import { TimeWeightedCalcService } from '../../../shared/services/time-weighted.service';
import { TagDataPoint } from '../../../shared/models/tag.model';

type CompareMode = 'time-shift' | 'equipment';

interface PeriodConfig {
  label: string;
  startTs: number;
  endTs: number;
}

@Component({
  selector: 'historian-comparison',
  templateUrl: './comparison-view.component.html',
  styleUrls: ['./comparison-view.component.scss']
})
export class ComparisonViewComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('compChart', { static: false }) chartContainer: ElementRef<HTMLElement>;

  @Input() ctx: WidgetContext;
  @Input() widgetTitlePanel: TemplateRef<any>;

  private chart: ECharts;
  private resizeObserver: ResizeObserver;
  private broadcastUnsubscribe: (() => void) | null = null;

  compareMode: CompareMode = 'time-shift';
  selectedTag: string | null = null;
  availableTags: string[] = [];
  currentDeviceId: string | null = null;

  // Time-shift mode
  shiftDays = 7;
  periods: PeriodConfig[] = [];

  // Equipment mode
  equipmentDevices: Array<{ id: string; name: string }> = [];
  selectedDevices: string[] = [];

  private colors = ['#1976d2', '#d32f2f', '#388e3c', '#f57c00', '#7b1fa2', '#00796b'];

  constructor(
    private cd: ChangeDetectorRef,
    private twCalc: TimeWeightedCalcService
  ) {}

  ngOnInit(): void {
    (this.ctx.$scope as any).historianComparison = this;
    echarts.use([GridComponent, TooltipComponent, LegendComponent, DataZoomComponent,
                 LineChart, SVGRenderer]);

    this.broadcastUnsubscribe = (this.ctx.$scope as any).$on(
      'tagsSelected',
      (_event: any, payload: { deviceId: string; tagKeys: string[] }) => {
        this.currentDeviceId = payload.deviceId;
        this.availableTags = payload.tagKeys;
        this.selectedTag = payload.tagKeys[0] || null;
        this.loadComparison();
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

  public onDataUpdated(): void {}

  setMode(mode: CompareMode): void {
    this.compareMode = mode;
    this.loadComparison();
    this.cd.detectChanges();
  }

  onTagChange(): void {
    this.loadComparison();
  }

  onShiftChange(): void {
    if (this.compareMode === 'time-shift') this.loadComparison();
  }

  async loadComparison(): Promise<void> {
    if (!this.selectedTag) return;

    if (this.compareMode === 'time-shift') {
      await this.loadTimeShiftComparison();
    } else {
      await this.loadEquipmentComparison();
    }
    this.cd.detectChanges();
  }

  private async loadTimeShiftComparison(): Promise<void> {
    if (!this.currentDeviceId || !this.selectedTag) return;

    const tw = this.ctx.defaultSubscription?.timeWindow;
    if (!tw) return;

    const currentStart = tw.minTime;
    const currentEnd = tw.maxTime;
    const shiftMs = this.shiftDays * 86400000;

    this.periods = [
      { label: 'Current', startTs: currentStart, endTs: currentEnd },
      { label: `${this.shiftDays}d ago`, startTs: currentStart - shiftMs, endTs: currentEnd - shiftMs }
    ];

    const seriesData: TagDataPoint[][] = [];

    for (const period of this.periods) {
      try {
        const url = `/api/plugins/telemetry/DEVICE/${this.currentDeviceId}/values/timeseries` +
          `?keys=${this.selectedTag}&startTs=${period.startTs}&endTs=${period.endTs}&agg=NONE&limit=10000&orderBy=ASC`;
        const result: Record<string, Array<{ ts: number; value: string }>> =
          await this.ctx.http.get<any>(url).toPromise();
        const points = (result[this.selectedTag] || []).map(p => ({
          ts: p.ts,
          value: p.value !== null && p.value !== '' ? Number(p.value) : null
        }));
        seriesData.push(points);
      } catch {
        seriesData.push([]);
      }
    }

    this.renderTimeShiftChart(seriesData);
  }

  private renderTimeShiftChart(seriesData: TagDataPoint[][]): void {
    if (!this.chart || this.periods.length === 0) return;

    const baseStart = this.periods[0].startTs;
    const series: any[] = [];

    this.periods.forEach((period, idx) => {
      const offset = period.startTs - baseStart;
      const data = seriesData[idx]
        .filter(d => d.value !== null)
        .map(d => [d.ts - offset, d.value]);

      series.push({
        type: 'line',
        name: period.label,
        data,
        showSymbol: false,
        lineStyle: { color: this.colors[idx % this.colors.length], width: 1.5 },
        itemStyle: { color: this.colors[idx % this.colors.length] }
      });
    });

    const option: EChartsOption = {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, textStyle: { fontSize: 10 } },
      xAxis: { type: 'time', axisLabel: { fontSize: 9 } },
      yAxis: { type: 'value', name: this.selectedTag, axisLabel: { fontSize: 10 } },
      series,
      dataZoom: [{ type: 'inside' }],
      grid: { left: 60, right: 20, top: 20, bottom: 40 }
    };
    this.chart.setOption(option, true);
  }

  private async loadEquipmentComparison(): Promise<void> {
    if (!this.selectedTag || this.selectedDevices.length === 0) return;

    const tw = this.ctx.defaultSubscription?.timeWindow;
    if (!tw) return;

    const seriesMap: Array<{ name: string; data: TagDataPoint[] }> = [];

    for (const devId of this.selectedDevices) {
      try {
        const url = `/api/plugins/telemetry/DEVICE/${devId}/values/timeseries` +
          `?keys=${this.selectedTag}&startTs=${tw.minTime}&endTs=${tw.maxTime}&agg=NONE&limit=10000&orderBy=ASC`;
        const result: Record<string, Array<{ ts: number; value: string }>> =
          await this.ctx.http.get<any>(url).toPromise();
        const points = (result[this.selectedTag] || []).map(p => ({
          ts: p.ts,
          value: p.value !== null && p.value !== '' ? Number(p.value) : null
        }));
        const dev = this.equipmentDevices.find(d => d.id === devId);
        seriesMap.push({ name: dev?.name || devId, data: points });
      } catch {
        /* skip */
      }
    }

    this.renderEquipmentChart(seriesMap);
  }

  private renderEquipmentChart(seriesMap: Array<{ name: string; data: TagDataPoint[] }>): void {
    if (!this.chart) return;

    const series: any[] = seriesMap.map((s, idx) => ({
      type: 'line',
      name: s.name,
      data: s.data.filter(d => d.value !== null).map(d => [d.ts, d.value]),
      showSymbol: false,
      lineStyle: { color: this.colors[idx % this.colors.length], width: 1.5 },
      itemStyle: { color: this.colors[idx % this.colors.length] }
    }));

    const option: EChartsOption = {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, textStyle: { fontSize: 10 } },
      xAxis: { type: 'time', axisLabel: { fontSize: 9 } },
      yAxis: { type: 'value', name: this.selectedTag, axisLabel: { fontSize: 10 } },
      series,
      dataZoom: [{ type: 'inside' }],
      grid: { left: 60, right: 20, top: 20, bottom: 40 }
    };
    this.chart.setOption(option, true);
  }

  async loadSiblingDevices(): Promise<void> {
    if (!this.currentDeviceId) return;
    try {
      const device: any = await this.ctx.http.get<any>(`/api/device/${this.currentDeviceId}`).toPromise();
      const parentRels: any[] = await this.ctx.http.get<any>(
        `/api/relations?toId=${this.currentDeviceId}&toType=DEVICE&relationType=Contains&relationTypeGroup=COMMON`
      ).toPromise();

      if (parentRels.length > 0) {
        const parentId = parentRels[0].from.id;
        const siblingRels: any[] = await this.ctx.http.get<any>(
          `/api/relations?fromId=${parentId}&fromType=ASSET&relationType=Contains&relationTypeGroup=COMMON`
        ).toPromise();

        const devices: Array<{ id: string; name: string }> = [];
        for (const rel of siblingRels) {
          if (rel.to.entityType === 'DEVICE') {
            try {
              const dev: any = await this.ctx.http.get<any>(`/api/device/${rel.to.id}`).toPromise();
              devices.push({ id: rel.to.id, name: dev.name || rel.to.id });
            } catch { /* skip */ }
          }
        }
        this.equipmentDevices = devices;
        this.selectedDevices = devices.slice(0, 2).map(d => d.id);
      }
    } catch { /* skip */ }
    this.cd.detectChanges();
  }
}
