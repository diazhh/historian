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
import { TagConfig, TagConfigMap } from '../../../shared/models/tag.model';
import { exportToCSV } from '../../../shared/utils/export.util';

interface ConfigRow {
  key: string;
  config: TagConfig;
  editing: boolean;
  dirty: boolean;
}

@Component({
  selector: 'historian-tag-config',
  templateUrl: './tag-config-manager.component.html',
  styleUrls: ['./tag-config-manager.component.scss']
})
export class TagConfigManagerComponent implements OnInit, OnDestroy {

  @Input() ctx: WidgetContext;
  @Input() widgetTitlePanel: TemplateRef<any>;

  rows: ConfigRow[] = [];
  filteredRows: ConfigRow[] = [];
  searchText = '';
  loading = false;
  saving = false;
  deviceId: string | null = null;
  deviceName: string | null = null;

  displayedColumns = [
    'key', 'description', 'engUnits', 'dataType', 'rangeLo', 'rangeHi',
    'alarmHH', 'alarmH', 'alarmL', 'alarmLL', 'scanRateMs', 'area', 'equipment', 'actions'
  ];

  constructor(
    private cd: ChangeDetectorRef,
    private tagMetadata: TagMetadataService
  ) {}

  ngOnInit(): void {
    (this.ctx.$scope as any).historianTagConfig = this;
    this.loadFromContext();
  }

  ngOnDestroy(): void {}

  async loadFromContext(): Promise<void> {
    const ds = this.ctx.datasources?.[0];
    if (ds?.entityId) {
      this.deviceId = ds.entityId;
      this.deviceName = ds.entityName || null;
    }
    if (!this.deviceId) return;

    this.loading = true;
    this.cd.detectChanges();

    try {
      const config = await this.tagMetadata.getTagConfig(this.ctx, this.deviceId);
      this.rows = Object.entries(config).map(([key, conf]) => ({
        key,
        config: { ...conf },
        editing: false,
        dirty: false
      })).sort((a, b) => a.key.localeCompare(b.key));
    } catch {
      this.rows = [];
    }

    this.loading = false;
    this.applyFilter();
    this.cd.detectChanges();
  }

  onSearchChange(): void {
    this.applyFilter();
    this.cd.detectChanges();
  }

  toggleEdit(row: ConfigRow): void {
    row.editing = !row.editing;
    this.cd.detectChanges();
  }

  markDirty(row: ConfigRow): void {
    row.dirty = true;
  }

  async saveRow(row: ConfigRow): Promise<void> {
    if (!this.deviceId || !row.dirty) return;

    this.saving = true;
    this.cd.detectChanges();

    try {
      // Write as server-side attribute (overrides client attr for display)
      const payload = { [row.key]: row.config };
      await this.ctx.http.post(
        `/api/plugins/telemetry/DEVICE/${this.deviceId}/SERVER_SCOPE`,
        [{ key: 'tagConfigOverride_' + row.key, value: JSON.stringify(payload) }]
      ).toPromise();

      row.dirty = false;
      row.editing = false;
    } catch {
      // Save failed
    }

    this.saving = false;
    this.cd.detectChanges();
  }

  async saveAll(): Promise<void> {
    const dirtyRows = this.rows.filter(r => r.dirty);
    for (const row of dirtyRows) {
      await this.saveRow(row);
    }
  }

  getDirtyCount(): number {
    return this.rows.filter(r => r.dirty).length;
  }

  exportCSV(): void {
    const headers = [
      'Tag', 'Description', 'Units', 'DataType', 'RangeLo', 'RangeHi',
      'AlarmHH', 'AlarmH', 'AlarmL', 'AlarmLL', 'ScanRate(ms)',
      'Area', 'Equipment', 'InstrumentType'
    ];

    const csvRows = this.rows.map(r => [
      r.key,
      r.config.description,
      r.config.engUnits,
      r.config.dataType,
      r.config.rangeLo,
      r.config.rangeHi,
      r.config.alarmHH,
      r.config.alarmH,
      r.config.alarmL,
      r.config.alarmLL,
      r.config.scanRateMs,
      r.config.area,
      r.config.equipment,
      r.config.instrumentType
    ]);

    exportToCSV(headers, csvRows, `tagconfig_${this.deviceName || 'export'}_${Date.now()}.csv`);
  }

  importCSV(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) return;

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i]);
        const key = values[0];
        const existing = this.rows.find(r => r.key === key);
        if (existing) {
          existing.config.description = values[1] || existing.config.description;
          existing.config.engUnits = values[2] || existing.config.engUnits;
          existing.config.rangeLo = values[4] ? Number(values[4]) : existing.config.rangeLo;
          existing.config.rangeHi = values[5] ? Number(values[5]) : existing.config.rangeHi;
          existing.config.alarmHH = values[6] ? Number(values[6]) : existing.config.alarmHH;
          existing.config.alarmH = values[7] ? Number(values[7]) : existing.config.alarmH;
          existing.config.alarmL = values[8] ? Number(values[8]) : existing.config.alarmL;
          existing.config.alarmLL = values[9] ? Number(values[9]) : existing.config.alarmLL;
          existing.dirty = true;
        }
      }

      this.applyFilter();
      this.cd.detectChanges();
    };
    reader.readAsText(file);
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  private applyFilter(): void {
    if (!this.searchText.trim()) {
      this.filteredRows = [...this.rows];
      return;
    }
    const term = this.searchText.toLowerCase();
    this.filteredRows = this.rows.filter(r =>
      r.key.toLowerCase().includes(term) ||
      r.config.description.toLowerCase().includes(term) ||
      r.config.area?.toLowerCase().includes(term) ||
      r.config.equipment?.toLowerCase().includes(term)
    );
  }
}
