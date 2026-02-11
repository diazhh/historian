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
import { BarChart, LineChart, CustomChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { ECharts } from '@home/components/widget/lib/chart/echarts-widget.models';

interface BatchEvent {
  id: string;
  name: string;
  type: string;
  severity: string;
  startTs: number;
  endTs: number;
  duration: number;
  status: string;
}

@Component({
  selector: 'historian-batch-analysis',
  templateUrl: './batch-analysis.component.html',
  styleUrls: ['./batch-analysis.component.scss']
})
export class BatchAnalysisComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('ganttChart', { static: false }) chartContainer: ElementRef<HTMLElement>;

  @Input() ctx: WidgetContext;
  @Input() widgetTitlePanel: TemplateRef<any>;

  private chart: ECharts;
  private resizeObserver: ResizeObserver;

  events: BatchEvent[] = [];
  filteredEvents: BatchEvent[] = [];
  isLoading = false;
  filterType = '';
  filterSeverity = '';

  eventTypes: string[] = [];
  severities = ['', 'CRITICAL', 'MAJOR', 'MINOR', 'WARNING', 'INDETERMINATE'];

  private severityColors: Record<string, string> = {
    CRITICAL: '#d32f2f',
    MAJOR: '#f57c00',
    MINOR: '#fbc02d',
    WARNING: '#1976d2',
    INDETERMINATE: '#9e9e9e'
  };

  constructor(private cd: ChangeDetectorRef) {}

  ngOnInit(): void {
    (this.ctx.$scope as any).historianBatchAnalysis = this;
    echarts.use([GridComponent, TooltipComponent, LegendComponent, DataZoomComponent,
                 BarChart, LineChart, CustomChart, SVGRenderer]);
    this.loadAlarmEvents();
  }

  ngAfterViewInit(): void {
    this.chart = echarts.init(this.chartContainer.nativeElement, null, { renderer: 'svg' });
    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(this.chartContainer.nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
  }

  public onDataUpdated(): void {}

  async loadAlarmEvents(): Promise<void> {
    this.isLoading = true;
    this.cd.detectChanges();

    try {
      const tw = this.ctx.defaultSubscription?.timeWindow;
      const startTs = tw?.minTime || (Date.now() - 7 * 86400000);
      const endTs = tw?.maxTime || Date.now();

      const url = `/api/alarm/DEVICE?startTime=${startTs}&endTime=${endTs}` +
        `&pageSize=200&page=0&sortProperty=createdTime&sortOrder=DESC&fetchOriginator=true`;

      const result: any = await this.ctx.http.get<any>(url).toPromise();
      const alarms: any[] = result.data || [];

      this.events = alarms.map(a => {
        const start = a.createdTime;
        const end = a.endTs || a.clearTs || Date.now();
        return {
          id: a.id?.id || '',
          name: a.name || a.type || 'Unknown',
          type: a.type || '',
          severity: a.severity || 'INDETERMINATE',
          startTs: start,
          endTs: end,
          duration: end - start,
          status: a.status || ''
        };
      });

      this.eventTypes = ['', ...new Set(this.events.map(e => e.type))];
      this.applyFilters();
      this.renderGantt();
    } catch {
      this.events = [];
      this.filteredEvents = [];
    }

    this.isLoading = false;
    this.cd.detectChanges();
  }

  onFilterChange(): void {
    this.applyFilters();
    this.renderGantt();
    this.cd.detectChanges();
  }

  refresh(): void {
    this.loadAlarmEvents();
  }

  formatDuration(ms: number): string {
    if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
    return `${(ms / 86400000).toFixed(1)}d`;
  }

  formatTime(ts: number): string {
    return new Date(ts).toLocaleString();
  }

  getSeverityClass(severity: string): string {
    return `severity-${severity.toLowerCase()}`;
  }

  private applyFilters(): void {
    this.filteredEvents = this.events.filter(e => {
      if (this.filterType && e.type !== this.filterType) return false;
      if (this.filterSeverity && e.severity !== this.filterSeverity) return false;
      return true;
    });
  }

  private renderGantt(): void {
    if (!this.chart || this.filteredEvents.length === 0) {
      this.chart?.setOption({ series: [], xAxis: { type: 'time' }, yAxis: { data: [] } }, true);
      return;
    }

    const categories = [...new Set(this.filteredEvents.map(e => e.name))];
    const categoryIndex: Record<string, number> = {};
    categories.forEach((c, i) => categoryIndex[c] = i);

    const renderData = this.filteredEvents.map(e => ({
      value: [categoryIndex[e.name], e.startTs, e.endTs, e.duration, e.severity, e.name],
      itemStyle: { color: this.severityColors[e.severity] || '#9e9e9e' }
    }));

    const option: EChartsOption = {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const v = params.value || params.data?.value;
          if (!v) return '';
          const start = new Date(v[1]).toLocaleString();
          const end = new Date(v[2]).toLocaleString();
          const dur = this.formatDuration(v[3]);
          return `<b>${v[5]}</b><br/>Severity: ${v[4]}<br/>Start: ${start}<br/>End: ${end}<br/>Duration: ${dur}`;
        }
      },
      xAxis: { type: 'time', axisLabel: { fontSize: 9 } },
      yAxis: {
        type: 'category',
        data: categories,
        axisLabel: { fontSize: 10, width: 120, overflow: 'truncate' }
      },
      series: [{
        type: 'custom',
        renderItem: (params: any, api: any) => {
          const catIdx = api.value(0);
          const startVal = api.coord([api.value(1), catIdx]);
          const endVal = api.coord([api.value(2), catIdx]);
          const height = api.size([0, 1])[1] * 0.6;

          const rectShape = echarts.graphic.clipRectByRect(
            { x: startVal[0], y: startVal[1] - height / 2, width: endVal[0] - startVal[0], height },
            { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height }
          );

          return rectShape && {
            type: 'rect',
            transition: ['shape'],
            shape: rectShape,
            style: api.style()
          };
        },
        encode: { x: [1, 2], y: 0 },
        data: renderData
      }],
      dataZoom: [{ type: 'inside' }],
      grid: { left: 140, right: 20, top: 20, bottom: 40 }
    };

    this.chart.setOption(option, true);
  }
}
