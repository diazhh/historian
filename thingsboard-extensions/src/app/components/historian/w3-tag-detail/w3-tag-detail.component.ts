///
/// Industrial Historian - W3 Tag Detail Panel Component
///

import {
  Component, Input, OnInit, OnDestroy,
  ElementRef, ViewChild, ChangeDetectorRef
} from '@angular/core';
import { Subscription, forkJoin } from 'rxjs';
import * as echarts from 'echarts';

import { TbApiService } from '../../../shared/services/tb-api.service';
import { BroadcastService, TagClick } from '../../../shared/services/broadcast.service';
import {
  TagConfig, AlarmLimits, TagDataPoint,
  qualityToText, isQualityGood
} from '../../../shared/models/tag.model';
import { HistorianAlarm, AlarmSeverity } from '../../../shared/models/alarm.model';
import {
  timeWeightedAverage, timeWeightedMin,
  timeWeightedMax, timeWeightedStdDev
} from '../../../shared/utils/time.util';
import {
  formatValue, formatTimestamp,
  severityColor, qualityColor
} from '../../../shared/utils/format.util';

interface AttributeRow {
  key: string;
  label: string;
  value: any;
}

interface TagStatistics {
  min: number;
  max: number;
  avg: number;
  stdDev: number;
}

@Component({
  selector: 'historian-tag-detail',
  templateUrl: './w3-tag-detail.component.html',
  styleUrls: ['./w3-tag-detail.component.scss']
})
export class W3TagDetailComponent implements OnInit, OnDestroy {
  @Input() ctx: any;

  @ViewChild('gaugeContainer', { static: false }) gaugeContainer!: ElementRef;
  @ViewChild('sparklineContainer', { static: false }) sparklineContainer!: ElementRef;

  // State
  selectedDeviceId: string | null = null;
  selectedDeviceName: string | null = null;
  loading = false;

  // Tag data
  tagConfig: TagConfig | null = null;
  alarmLimits: AlarmLimits = { hh: null, h: null, l: null, ll: null };
  currentPV: number | null = null;
  currentQuality = 0;
  lastUpdateTs: number | null = null;
  attributes: AttributeRow[] = [];
  statistics: TagStatistics | null = null;
  recentAlarms: HistorianAlarm[] = [];

  // Charts
  private gaugeChart: echarts.ECharts | null = null;
  private sparklineChart: echarts.ECharts | null = null;

  // Subscriptions
  private subs: Subscription[] = [];

  // Expose helpers to template
  formatValue = formatValue;
  formatTimestamp = formatTimestamp;
  severityColor = severityColor;
  qualityColor = qualityColor;
  qualityToText = qualityToText;
  isQualityGood = isQualityGood;

  constructor(
    private tbApi: TbApiService,
    private broadcast: BroadcastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.tbApi.init(this.ctx);

    this.ctx.$scope.historianWidget = {
      init: () => this.initialize()
    };

    const sub = this.broadcast.tagClicked$.subscribe(click => {
      this.loadTagDetail(click.deviceId, click.deviceName);
    });
    this.subs.push(sub);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.gaugeChart?.dispose();
    this.sparklineChart?.dispose();
  }

  private initialize(): void {
    // Widget ready — no default tag to load
  }

  loadTagDetail(deviceId: string, deviceName: string): void {
    this.selectedDeviceId = deviceId;
    this.selectedDeviceName = deviceName;
    this.loading = true;
    this.cdr.detectChanges();

    const now = Date.now();
    const oneHourAgo = now - 3_600_000;
    const oneDayAgo = now - 86_400_000;

    forkJoin({
      attrs: this.tbApi.getEntityAttributes('DEVICE', deviceId, 'SERVER_SCOPE'),
      sparkline: this.tbApi.getTimeseries('DEVICE', deviceId, ['PV'], oneHourAgo, now, undefined, 'NONE'),
      stats: this.tbApi.getTimeseries('DEVICE', deviceId, ['PV'], oneDayAgo, now, undefined, 'NONE'),
      latest: this.tbApi.getLatestTimeseries('DEVICE', deviceId, ['PV', 'quality']),
      alarms: this.tbApi.getAlarms('DEVICE', deviceId, { pageSize: 10, sortOrder: 'DESC' })
    }).subscribe({
      next: ({ attrs, sparkline, stats, latest, alarms }) => {
        this.parseAttributes(attrs);
        this.parseLatest(latest);
        this.computeStatistics(stats['PV'] || []);
        this.recentAlarms = alarms.data || [];

        this.loading = false;
        this.cdr.detectChanges();

        // Build charts after view updates
        setTimeout(() => {
          this.buildGauge();
          this.buildSparkline(sparkline['PV'] || []);
        });
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  // --- Data parsing ---

  private parseAttributes(attrs: Array<{ key: string; value: any; lastUpdateTs: number }>): void {
    const map = new Map<string, any>();
    attrs.forEach(a => map.set(a.key, a.value));

    this.tagConfig = {
      deviceId: this.selectedDeviceId!,
      deviceName: this.selectedDeviceName!,
      description: map.get('ss_description') ?? '',
      engUnits: map.get('ss_engUnits') ?? '',
      dataType: map.get('ss_dataType') ?? 'AI',
      rangeLow: parseFloat(map.get('ss_rangeLow')) || 0,
      rangeHigh: parseFloat(map.get('ss_rangeHigh')) || 100,
      setpoint: parseFloat(map.get('ss_setpoint')) || 0,
      deadband: parseFloat(map.get('ss_deadband')) || 0,
      scanRate: map.get('ss_scanRate') ?? '',
      instrumentType: map.get('ss_instrumentType') ?? ''
    };

    this.alarmLimits = {
      hh: this.parseNullableNum(map.get('ss_alarmHH')),
      h: this.parseNullableNum(map.get('ss_alarmH')),
      l: this.parseNullableNum(map.get('ss_alarmL')),
      ll: this.parseNullableNum(map.get('ss_alarmLL'))
    };

    // Build display-friendly attributes table
    const labelMap: Record<string, string> = {
      ss_description: 'Description',
      ss_instrumentType: 'Instrument Type',
      ss_dataType: 'Data Type',
      ss_engUnits: 'Eng. Units',
      ss_rangeLow: 'Range Low',
      ss_rangeHigh: 'Range High',
      ss_setpoint: 'Setpoint',
      ss_deadband: 'Deadband',
      ss_scanRate: 'Scan Rate',
      ss_alarmHH: 'Alarm HH',
      ss_alarmH: 'Alarm H',
      ss_alarmL: 'Alarm L',
      ss_alarmLL: 'Alarm LL'
    };

    this.attributes = attrs
      .filter(a => a.key.startsWith('ss_'))
      .map(a => ({
        key: a.key,
        label: labelMap[a.key] || a.key.replace('ss_', ''),
        value: a.value
      }));
  }

  private parseLatest(latest: Record<string, TagDataPoint[]>): void {
    const pvArr = latest['PV'];
    if (pvArr?.length) {
      this.currentPV = pvArr[0].value;
      this.lastUpdateTs = pvArr[0].ts;
    }
    const qArr = latest['quality'];
    if (qArr?.length) {
      this.currentQuality = qArr[0].value;
    }
  }

  private computeStatistics(data: TagDataPoint[]): void {
    if (!data.length) {
      this.statistics = null;
      return;
    }
    this.statistics = {
      min: timeWeightedMin(data),
      max: timeWeightedMax(data),
      avg: timeWeightedAverage(data),
      stdDev: timeWeightedStdDev(data)
    };
  }

  private parseNullableNum(val: any): number | null {
    if (val == null || val === '' || val === 'null') return null;
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  }

  // --- Value coloring ---

  get pvColor(): string {
    if (this.currentPV == null || !this.tagConfig) return '#ffffff';
    const v = this.currentPV;
    if ((this.alarmLimits.hh != null && v >= this.alarmLimits.hh) ||
        (this.alarmLimits.ll != null && v <= this.alarmLimits.ll)) {
      return '#d32f2f';
    }
    if ((this.alarmLimits.h != null && v >= this.alarmLimits.h) ||
        (this.alarmLimits.l != null && v <= this.alarmLimits.l)) {
      return '#f57c00';
    }
    return '#4caf50';
  }

  get isAnalog(): boolean {
    return this.tagConfig?.dataType === 'AI' || this.tagConfig?.dataType === 'CALC';
  }

  // --- ECharts gauge ---

  private buildGauge(): void {
    if (!this.gaugeContainer?.nativeElement || !this.tagConfig || !this.isAnalog) return;

    if (!this.gaugeChart) {
      this.gaugeChart = echarts.init(this.gaugeContainer.nativeElement);
    }

    const rangeLow = this.tagConfig.rangeLow;
    const rangeHigh = this.tagConfig.rangeHigh;
    const span = rangeHigh - rangeLow || 1;

    const toPct = (v: number | null): number => {
      if (v == null) return -1;
      return (v - rangeLow) / span;
    };

    const llPct = toPct(this.alarmLimits.ll);
    const lPct = toPct(this.alarmLimits.l);
    const hPct = toPct(this.alarmLimits.h);
    const hhPct = toPct(this.alarmLimits.hh);

    // Build color bands
    const colors: [number, string][] = [];
    const addBand = (end: number, color: string) => {
      if (end > 0 && end <= 1) colors.push([end, color]);
    };

    if (llPct >= 0) addBand(llPct, '#d32f2f');
    if (lPct >= 0) addBand(lPct, '#f57c00');

    const normalEnd = hPct >= 0 ? hPct : (hhPct >= 0 ? hhPct : 1);
    const normalStart = colors.length ? colors[colors.length - 1][0] : 0;
    if (normalEnd > normalStart) addBand(normalEnd, '#4caf50');

    if (hPct >= 0 && hhPct >= 0 && hhPct > hPct) addBand(hhPct, '#f57c00');
    if (hhPct >= 0 && hhPct < 1) addBand(1, '#d32f2f');

    // Fallback if no limits defined
    if (!colors.length) colors.push([1, '#4caf50']);

    this.gaugeChart.setOption({
      series: [{
        type: 'gauge',
        min: rangeLow,
        max: rangeHigh,
        splitNumber: 5,
        axisLine: {
          lineStyle: {
            width: 15,
            color: colors
          }
        },
        axisTick: { length: 6, lineStyle: { color: 'auto' } },
        splitLine: { length: 12, lineStyle: { color: 'auto' } },
        axisLabel: { fontSize: 9, color: '#aaa' },
        pointer: { itemStyle: { color: 'auto' }, width: 4 },
        detail: {
          formatter: `{value} ${this.tagConfig.engUnits}`,
          fontSize: 14,
          offsetCenter: [0, '70%'],
          color: 'auto'
        },
        data: [{ value: this.currentPV ?? rangeLow }]
      }]
    });
  }

  // --- ECharts sparkline ---

  private buildSparkline(data: TagDataPoint[]): void {
    if (!this.sparklineContainer?.nativeElement || !data.length) return;

    if (!this.sparklineChart) {
      this.sparklineChart = echarts.init(this.sparklineContainer.nativeElement);
    }

    this.sparklineChart.setOption({
      grid: { top: 5, right: 5, bottom: 5, left: 5 },
      xAxis: { type: 'time', show: false },
      yAxis: { type: 'value', show: false },
      series: [{
        type: 'line',
        data: data.map(dp => [dp.ts, dp.value]),
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1.5, color: '#42a5f5' },
        areaStyle: { opacity: 0.1, color: '#42a5f5' }
      }],
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const p = params[0];
          return `${formatTimestamp(p.value[0], 'time')}<br/>${p.value[1]?.toFixed(2) ?? '---'}`;
        }
      }
    });
  }

  // --- Quick actions ---

  addToTrend(): void {
    if (!this.selectedDeviceId || !this.selectedDeviceName) return;
    this.broadcast.emitTagsSelected({
      deviceIds: [this.selectedDeviceId],
      deviceNames: [this.selectedDeviceName]
    });
  }
}
