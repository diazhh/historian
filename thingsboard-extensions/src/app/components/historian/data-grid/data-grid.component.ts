import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  TemplateRef,
  ChangeDetectorRef
} from '@angular/core';
import { WidgetContext } from '@home/models/widget-component.models';
import { TagMetadataService } from '../../../shared/services/tag-metadata.service';
import { TagConfigMap, AlarmLimits } from '../../../shared/models/tag.model';
import { exportToCSV } from '../../../shared/utils/export.util';

interface GridColumn {
  key: string;
  label: string;
  engUnits: string;
  alarms: AlarmLimits;
}

interface GridRow {
  timestamp: number;
  formattedTime: string;
  values: Record<string, number | null>;
}

@Component({
  selector: 'historian-data-grid',
  templateUrl: './data-grid.component.html',
  styleUrls: ['./data-grid.component.scss']
})
export class DataGridComponent implements OnInit, OnDestroy {

  @Input() ctx: WidgetContext;
  @Input() widgetTitlePanel: TemplateRef<any>;

  columns: GridColumn[] = [];
  rows: GridRow[] = [];
  loading = false;
  deviceId: string | null = null;

  intervalOptions = [
    { label: '1 min', value: 60000 },
    { label: '5 min', value: 300000 },
    { label: '15 min', value: 900000 },
    { label: '1 hour', value: 3600000 }
  ];
  selectedInterval = 300000;

  private tagConfig: TagConfigMap = {};
  private broadcastUnsubscribe: (() => void) | null = null;

  constructor(
    private cd: ChangeDetectorRef,
    private tagMetadata: TagMetadataService
  ) {}

  ngOnInit(): void {
    (this.ctx.$scope as any).historianDataGrid = this;

    this.broadcastUnsubscribe = (this.ctx.$scope as any).$on(
      'tagsSelected',
      (_event: any, payload: { deviceId: string; tagKeys: string[] }) => {
        this.onTagsSelected(payload);
      }
    );
  }

  ngOnDestroy(): void {
    if (this.broadcastUnsubscribe) this.broadcastUnsubscribe();
  }

  public onDataUpdated(): void {
    this.buildRowsFromCtxData();
    this.cd.detectChanges();
  }

  async onTagsSelected(payload: { deviceId: string; tagKeys: string[] }): Promise<void> {
    this.deviceId = payload.deviceId;
    this.loading = true;
    this.cd.detectChanges();

    try {
      this.tagConfig = await this.tagMetadata.getTagConfig(this.ctx, payload.deviceId);
    } catch {
      this.tagConfig = {};
    }

    this.columns = payload.tagKeys.map(key => ({
      key,
      label: key,
      engUnits: this.tagMetadata.getEngUnits(this.tagConfig, key),
      alarms: this.tagMetadata.getAlarmLimits(this.tagConfig, key)
    }));

    await this.fetchData(payload.deviceId, payload.tagKeys);
    this.loading = false;
    this.cd.detectChanges();
  }

  async onIntervalChange(): Promise<void> {
    if (!this.deviceId || this.columns.length === 0) return;
    this.loading = true;
    this.cd.detectChanges();
    await this.fetchData(this.deviceId, this.columns.map(c => c.key));
    this.loading = false;
    this.cd.detectChanges();
  }

  getCellClass(value: number | null, col: GridColumn): string {
    if (value === null) return 'cell-null';
    const a = col.alarms;
    if (a.hh !== null && value >= a.hh) return 'cell-alarm-hh';
    if (a.h !== null && value >= a.h) return 'cell-alarm-h';
    if (a.ll !== null && value <= a.ll) return 'cell-alarm-ll';
    if (a.l !== null && value <= a.l) return 'cell-alarm-l';
    return '';
  }

  formatValue(value: number | null): string {
    if (value === null) return '--';
    return Number(value).toFixed(2);
  }

  exportCSV(): void {
    const headers = ['Timestamp', ...this.columns.map(c => `${c.label} (${c.engUnits})`)];
    const csvRows = this.rows.map(r => {
      const row: (string | number | null)[] = [r.formattedTime];
      for (const col of this.columns) {
        row.push(r.values[col.key] ?? null);
      }
      return row;
    });
    exportToCSV(headers, csvRows, `datagrid_export_${Date.now()}.csv`);
  }

  private async fetchData(deviceId: string, tagKeys: string[]): Promise<void> {
    const tw = this.ctx.defaultSubscription?.timeWindow;
    if (!tw) return;

    const keys = tagKeys.join(',');
    const url = `/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=${keys}&startTs=${tw.minTime}&endTs=${tw.maxTime}&agg=AVG&interval=${this.selectedInterval}&limit=10000&orderBy=ASC`;

    try {
      const result: Record<string, Array<{ ts: number; value: string }>> =
        await this.ctx.http.get<any>(url).toPromise();

      this.buildRows(result, tagKeys);
    } catch {
      this.rows = [];
    }
  }

  private buildRows(data: Record<string, Array<{ ts: number; value: string }>>, tagKeys: string[]): void {
    // Collect all timestamps and align to grid
    const tsSet = new Set<number>();
    for (const key of tagKeys) {
      for (const point of (data[key] || [])) {
        tsSet.add(point.ts);
      }
    }

    const timestamps = Array.from(tsSet).sort((a, b) => a - b);

    // Build lookup maps for each key
    const lookups: Record<string, Map<number, number>> = {};
    for (const key of tagKeys) {
      const map = new Map<number, number>();
      for (const point of (data[key] || [])) {
        const val = point.value !== null && point.value !== '' ? Number(point.value) : null;
        if (val !== null) map.set(point.ts, val);
      }
      lookups[key] = map;
    }

    this.rows = timestamps.map(ts => {
      const values: Record<string, number | null> = {};
      for (const key of tagKeys) {
        values[key] = lookups[key].get(ts) ?? null;
      }
      return {
        timestamp: ts,
        formattedTime: new Date(ts).toLocaleString('en-GB', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        }),
        values
      };
    });
  }

  private buildRowsFromCtxData(): void {
    if (!this.ctx.data || this.columns.length === 0) return;

    const dataMap: Record<string, Array<{ ts: number; value: string }>> = {};
    for (const entry of this.ctx.data) {
      const key = entry.dataKey?.name;
      if (!key) continue;
      dataMap[key] = (entry.data || []).map(([ts, val]: [number, any]) => ({
        ts, value: String(val)
      }));
    }

    this.buildRows(dataMap, this.columns.map(c => c.key));
  }
}
