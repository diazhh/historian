///
/// Industrial Historian - W4 Event Frame Timeline Component
///
/// Gantt-style alarm timeline: each row = one device/tag, X-axis = time,
/// horizontal bars colored by severity. Fetches alarms for selected devices
/// and displays them with ECharts custom series + renderItem.
///

import {
  Component, Input, OnInit, OnDestroy,
  ViewChild, ElementRef, ChangeDetectorRef
} from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import * as echarts from 'echarts';

import { TbApiService } from '../../../shared/services/tb-api.service';
import { BroadcastService } from '../../../shared/services/broadcast.service';
import { HistorianAlarm, AlarmSeverity } from '../../../shared/models/alarm.model';
import { formatTimestamp, severityColor } from '../../../shared/utils/format.util';

// ── Per-device alarm data ────────────────────────────────

interface DeviceAlarms {
  deviceId: string;
  deviceName: string;
  alarms: HistorianAlarm[];
}

@Component({
  selector: 'historian-event-timeline',
  templateUrl: './w4-event-timeline.component.html',
  styleUrls: ['./w4-event-timeline.component.scss']
})
export class W4EventTimelineComponent implements OnInit, OnDestroy {
  @Input() ctx: any;
  @ViewChild('chartContainer', { static: true }) chartContainer!: ElementRef;

  // Public state (template bindings)
  loading = false;
  selectedDeviceIds: string[] = [];
  totalAlarms = 0;
  countBySeverity: Record<string, number> = { CRITICAL: 0, MAJOR: 0, MINOR: 0, WARNING: 0 };
  avgDurationLabel = '';

  // Private state
  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private subs: Subscription[] = [];
  private devices: DeviceAlarms[] = [];
  private timeRange = { startTs: 0, endTs: 0 };

  constructor(
    private tbApi: TbApiService,
    private broadcast: BroadcastService,
    private cdr: ChangeDetectorRef
  ) {}

  // ── Lifecycle ──────────────────────────────────────────

  ngOnInit(): void {
    this.tbApi.init(this.ctx);

    // Widget bridge for TB controllerScript
    this.ctx.$scope.historianWidget = {
      init: () => this.initChart()
    };

    // Listen for tag selections from W2 Tag Browser
    this.subs.push(
      this.broadcast.tagsSelected$.subscribe(sel => {
        this.selectedDeviceIds = sel.deviceIds;
        this.loadAlarms(sel.deviceIds, sel.deviceNames);
      })
    );

    // Listen for time range changes from other widgets
    this.subs.push(
      this.broadcast.timeRangeChanged$.subscribe(range => {
        this.timeRange = { ...range };
        if (this.devices.length > 0) {
          this.loadAlarms(
            this.devices.map(d => d.deviceId),
            this.devices.map(d => d.deviceName)
          );
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
  }

  // ── Initialization ─────────────────────────────────────

  private initChart(): void {
    const el = this.chartContainer.nativeElement;
    this.chart = echarts.init(el, 'dark');

    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(el);

    const now = Date.now();
    this.timeRange = { startTs: now - 3_600_000, endTs: now }; // default 1h

    this.updateChart();
  }

  // ── Data fetching ──────────────────────────────────────

  async loadAlarms(deviceIds: string[], deviceNames: string[]): Promise<void> {
    this.loading = true;
    this.cdr.detectChanges();

    const results: DeviceAlarms[] = [];

    const fetches = deviceIds.map(async (id, i) => {
      try {
        const result = await firstValueFrom(
          this.tbApi.getAlarms('DEVICE', id, {
            startTs: this.timeRange.startTs,
            endTs: this.timeRange.endTs,
            pageSize: 100,
            sortOrder: 'ASC'
          })
        );
        results.push({
          deviceId: id,
          deviceName: deviceNames[i] || id,
          alarms: result.data || []
        });
      } catch {
        results.push({
          deviceId: id,
          deviceName: deviceNames[i] || id,
          alarms: []
        });
      }
    });

    await Promise.all(fetches);

    // Preserve the original order from deviceIds
    this.devices = deviceIds.map(id => results.find(r => r.deviceId === id)!);
    this.updateSummary();
    this.updateChart();

    this.loading = false;
    this.cdr.detectChanges();
  }

  // ── Summary statistics ─────────────────────────────────

  private updateSummary(): void {
    const allAlarms = this.devices.flatMap(d => d.alarms);
    this.totalAlarms = allAlarms.length;

    this.countBySeverity = { CRITICAL: 0, MAJOR: 0, MINOR: 0, WARNING: 0 };
    for (const a of allAlarms) {
      if (a.severity in this.countBySeverity) {
        this.countBySeverity[a.severity]++;
      }
    }

    // Average duration
    const durations = allAlarms
      .filter(a => a.startTs > 0)
      .map(a => (a.endTs || this.timeRange.endTs) - a.startTs);

    if (durations.length > 0) {
      const avgMs = durations.reduce((s, d) => s + d, 0) / durations.length;
      this.avgDurationLabel = this.formatDuration(avgMs);
    } else {
      this.avgDurationLabel = '---';
    }
  }

  // ── Chart rendering ────────────────────────────────────

  private updateChart(): void {
    if (!this.chart) return;
    this.chart.setOption(this.buildChartOptions(), { notMerge: true });
  }

  private buildChartOptions(): echarts.EChartsOption {
    const categories = this.devices.map(d => d.deviceName);

    // Flatten alarm data: [categoryIndex, startTs, endTs, severity, alarm]
    const data: any[] = [];
    for (let i = 0; i < this.devices.length; i++) {
      for (const alarm of this.devices[i].alarms) {
        data.push({
          value: [
            i,
            alarm.startTs,
            alarm.endTs || this.timeRange.endTs,
            alarm.severity
          ],
          alarm
        });
      }
    }

    const timeRange = this.timeRange;

    return {
      backgroundColor: '#1e1e1e',
      grid: {
        left: 120,
        right: 24,
        top: 16,
        bottom: 40
      },
      xAxis: {
        type: 'time',
        min: this.timeRange.startTs,
        max: this.timeRange.endTs,
        axisLabel: { fontSize: 10, color: '#aaa' },
        axisLine: { lineStyle: { color: '#555' } },
        splitLine: { show: true, lineStyle: { color: '#333' } }
      },
      yAxis: {
        type: 'category',
        data: categories,
        inverse: true,
        axisLabel: {
          fontSize: 11,
          color: '#ccc',
          width: 100,
          overflow: 'truncate',
          ellipsis: '...'
        },
        axisLine: { lineStyle: { color: '#555' } },
        splitLine: { show: true, lineStyle: { color: '#2a2a2a' } }
      },
      tooltip: {
        formatter: (params: any) => this.formatTooltip(params),
        confine: true,
        backgroundColor: '#333',
        borderColor: '#555',
        textStyle: { color: '#eee', fontSize: 11 }
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
        {
          type: 'slider', xAxisIndex: 0, bottom: 4, height: 16,
          borderColor: '#555', backgroundColor: '#2a2a2a',
          fillerColor: 'rgba(66,165,245,0.15)',
          handleStyle: { color: '#42a5f5' },
          textStyle: { color: '#aaa', fontSize: 10 }
        }
      ],
      series: [{
        type: 'custom',
        renderItem: (params: any, api: any) => {
          const catIdx = api.value(0);
          const startTs = api.value(1);
          const endTs = api.value(2);
          const severity = api.value(3) as AlarmSeverity;

          const startCoord = api.coord([startTs, catIdx]);
          const endCoord = api.coord([endTs, catIdx]);
          const bandWidth = api.size([0, 1])[1];

          const barHeight = Math.max(bandWidth * 0.6, 8);
          const rectX = startCoord[0];
          const rectY = startCoord[1] - barHeight / 2;
          const rectWidth = Math.max(endCoord[0] - startCoord[0], 2);

          const color = severityColor(severity);

          return {
            type: 'rect',
            shape: {
              x: rectX,
              y: rectY,
              width: rectWidth,
              height: barHeight,
              r: 2
            },
            style: {
              fill: color,
              opacity: 0.85
            },
            styleEmphasis: {
              opacity: 1,
              shadowBlur: 4,
              shadowColor: color
            }
          } as any;
        },
        data,
        encode: {
          x: [1, 2],
          y: 0
        },
        clip: true
      }],
      animation: false
    } as any;
  }

  // ── Tooltip ────────────────────────────────────────────

  private formatTooltip(params: any): string {
    const item = params.data;
    if (!item?.alarm) return '';

    const alarm: HistorianAlarm = item.alarm;
    const startTs = alarm.startTs;
    const endTs = alarm.endTs || this.timeRange.endTs;
    const duration = endTs - startTs;
    const color = severityColor(alarm.severity);
    const pvVal = alarm.details?.PV;

    let html = `<div style="font-size:11px; max-width:260px;">`;
    html += `<b style="color:${color}">${alarm.type}</b><br/>`;
    html += `Severity: <span style="color:${color}">${alarm.severity}</span><br/>`;
    html += `Start: ${formatTimestamp(startTs)}<br/>`;
    html += `End: ${alarm.endTs ? formatTimestamp(alarm.endTs) : '<i>Active</i>'}<br/>`;
    html += `Duration: <b>${this.formatDuration(duration)}</b><br/>`;
    if (pvVal != null) {
      html += `PV: <b>${typeof pvVal === 'number' ? pvVal.toFixed(2) : pvVal}</b>`;
    }
    html += `</div>`;
    return html;
  }

  // ── Utilities ──────────────────────────────────────────

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ${sec % 60}s`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ${min % 60}m`;
    const days = Math.floor(hr / 24);
    return `${days}d ${hr % 24}h`;
  }
}
