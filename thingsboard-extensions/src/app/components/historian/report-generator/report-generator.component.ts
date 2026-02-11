import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  TemplateRef,
  ChangeDetectorRef
} from '@angular/core';
import { WidgetContext } from '@home/models/widget-component.models';
import { TimeWeightedCalcService } from '../../../shared/services/time-weighted.service';
import { TagMetadataService } from '../../../shared/services/tag-metadata.service';
import { TagDataPoint, TagConfigMap } from '../../../shared/models/tag.model';
import { exportToCSV } from '../../../shared/utils/export.util';

type ReportType = 'shift' | 'daily' | 'monthly';

interface ReportRow {
  tag: string;
  description: string;
  units: string;
  twa: string;
  min: string;
  max: string;
  stdDev: string;
  count: number;
}

@Component({
  selector: 'historian-report',
  templateUrl: './report-generator.component.html',
  styleUrls: ['./report-generator.component.scss']
})
export class ReportGeneratorComponent implements OnInit, OnDestroy {

  @Input() ctx: WidgetContext;
  @Input() widgetTitlePanel: TemplateRef<any>;

  private broadcastUnsubscribe: (() => void) | null = null;

  reportType: ReportType = 'daily';
  reportTitle = '';
  isLoading = false;
  reportRows: ReportRow[] = [];
  reportGenerated = false;
  reportTimestamp = '';

  private currentDeviceId: string | null = null;
  private currentTagKeys: string[] = [];
  private tagConfig: TagConfigMap = {};

  constructor(
    private cd: ChangeDetectorRef,
    private twCalc: TimeWeightedCalcService,
    private tagMeta: TagMetadataService
  ) {}

  ngOnInit(): void {
    (this.ctx.$scope as any).historianReport = this;

    this.broadcastUnsubscribe = (this.ctx.$scope as any).$on(
      'tagsSelected',
      (_event: any, payload: { deviceId: string; tagKeys: string[] }) => {
        this.currentDeviceId = payload.deviceId;
        this.currentTagKeys = payload.tagKeys;
        this.reportGenerated = false;
        this.cd.detectChanges();
      }
    );
  }

  ngOnDestroy(): void {
    if (this.broadcastUnsubscribe) this.broadcastUnsubscribe();
  }

  public onDataUpdated(): void {}

  setReportType(type: ReportType): void {
    this.reportType = type;
  }

  async generateReport(): Promise<void> {
    if (!this.currentDeviceId || this.currentTagKeys.length === 0) return;

    this.isLoading = true;
    this.cd.detectChanges();

    try {
      this.tagConfig = await this.tagMeta.getTagConfig(this.ctx, this.currentDeviceId);
    } catch { this.tagConfig = {}; }

    const { startTs, endTs } = this.getReportRange();
    this.reportRows = [];

    for (const key of this.currentTagKeys) {
      try {
        const url = `/api/plugins/telemetry/DEVICE/${this.currentDeviceId}/values/timeseries` +
          `?keys=${key}&startTs=${startTs}&endTs=${endTs}&agg=NONE&limit=50000&orderBy=ASC`;
        const result: Record<string, Array<{ ts: number; value: string }>> =
          await this.ctx.http.get<any>(url).toPromise();

        const points: TagDataPoint[] = (result[key] || []).map(p => ({
          ts: p.ts,
          value: p.value !== null && p.value !== '' ? Number(p.value) : null
        }));

        const valid = points.filter(p => p.value !== null);

        this.reportRows.push({
          tag: key,
          description: this.tagConfig[key]?.description || '',
          units: this.tagConfig[key]?.engUnits || '',
          twa: valid.length > 1 ? this.twCalc.average(valid, endTs).toFixed(3) : '--',
          min: valid.length > 0 ? this.twCalc.min(valid).toFixed(3) : '--',
          max: valid.length > 0 ? this.twCalc.max(valid).toFixed(3) : '--',
          stdDev: valid.length > 1 ? this.twCalc.standardDeviation(valid, endTs).toFixed(3) : '--',
          count: valid.length
        });
      } catch {
        this.reportRows.push({
          tag: key, description: '', units: '',
          twa: 'ERR', min: 'ERR', max: 'ERR', stdDev: 'ERR', count: 0
        });
      }
    }

    this.reportTitle = this.buildTitle(startTs, endTs);
    this.reportTimestamp = new Date().toLocaleString();
    this.reportGenerated = true;
    this.isLoading = false;
    this.cd.detectChanges();
  }

  exportCSV(): void {
    const headers = ['Tag', 'Description', 'Units', 'TWA', 'Min', 'Max', 'StdDev', 'Count'];
    const rows = this.reportRows.map(r => [r.tag, r.description, r.units, r.twa, r.min, r.max, r.stdDev, String(r.count)]);
    exportToCSV(headers, rows, `report_${this.reportType}_${Date.now()}.csv`);
  }

  printReport(): void {
    window.print();
  }

  private getReportRange(): { startTs: number; endTs: number } {
    const now = new Date();
    let startTs: number;
    let endTs = now.getTime();

    switch (this.reportType) {
      case 'shift': {
        const hour = now.getHours();
        const shiftStart = hour < 8 ? 0 : hour < 16 ? 8 : 16;
        const start = new Date(now);
        start.setHours(shiftStart, 0, 0, 0);
        startTs = start.getTime();
        break;
      }
      case 'daily': {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        startTs = start.getTime();
        break;
      }
      case 'monthly': {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        startTs = start.getTime();
        break;
      }
    }

    return { startTs, endTs };
  }

  private buildTitle(startTs: number, endTs: number): string {
    const start = new Date(startTs);
    const labels: Record<ReportType, string> = {
      shift: `Shift Report — ${start.toLocaleDateString()} ${start.toLocaleTimeString()}`,
      daily: `Daily Report — ${start.toLocaleDateString()}`,
      monthly: `Monthly Report — ${start.toLocaleDateString('default', { month: 'long', year: 'numeric' })}`
    };
    return labels[this.reportType];
  }
}
