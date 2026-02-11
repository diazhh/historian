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
import { qualityToText, qualityToCssClass } from '../../../shared/utils/quality.util';

interface TagRow {
  key: string;
  description: string;
  engUnits: string;
  dataType: string;
  value: string | number | null;
  quality: number;
  qualityText: string;
  qualityCss: string;
  selected: boolean;
}

@Component({
  selector: 'historian-tag-browser',
  templateUrl: './tag-browser.component.html',
  styleUrls: ['./tag-browser.component.scss']
})
export class TagBrowserComponent implements OnInit, OnDestroy {

  @Input() ctx: WidgetContext;
  @Input() widgetTitlePanel: TemplateRef<any>;

  tags: TagRow[] = [];
  filteredTags: TagRow[] = [];
  searchText = '';
  deviceId: string | null = null;
  deviceName: string | null = null;
  loading = false;
  selectAll = false;

  constructor(
    private cd: ChangeDetectorRef,
    private tagMetadata: TagMetadataService
  ) {}

  ngOnInit(): void {
    (this.ctx.$scope as any).historianTagBrowser = this;
    this.loadFromContext();
  }

  ngOnDestroy(): void {
    // cleanup
  }

  public onDataUpdated(): void {
    this.updateLatestValues();
    this.cd.detectChanges();
  }

  async loadFromContext(): Promise<void> {
    // Get device from datasource or dashboard state entity
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
      this.buildTagList(config);
      this.updateLatestValues();
    } catch {
      this.tags = [];
    }

    this.loading = false;
    this.applyFilter();
    this.cd.detectChanges();
  }

  private buildTagList(config: TagConfigMap): void {
    this.tags = Object.entries(config).map(([key, tagConf]) => ({
      key,
      description: tagConf.description || '',
      engUnits: tagConf.engUnits || '',
      dataType: tagConf.dataType || 'FLOAT',
      value: null,
      quality: 192,
      qualityText: 'Good',
      qualityCss: 'quality-good',
      selected: false
    }));

    this.tags.sort((a, b) => a.key.localeCompare(b.key));
  }

  private updateLatestValues(): void {
    if (!this.ctx.data) return;

    for (const dataEntry of this.ctx.data) {
      const dataKey = dataEntry.dataKey?.name;
      if (!dataKey) continue;

      const lastPoint = dataEntry.data?.[dataEntry.data.length - 1];
      if (!lastPoint) continue;

      // Match tag by key (e.g. "TI-101-01.PV")
      const tag = this.tags.find(t => t.key === dataKey || dataKey.startsWith(t.key));
      if (tag) {
        if (dataKey.endsWith('.Q')) {
          const qCode = Number(lastPoint[1]);
          tag.quality = qCode;
          tag.qualityText = qualityToText(qCode);
          tag.qualityCss = qualityToCssClass(qCode);
        } else {
          tag.value = lastPoint[1];
        }
      }
    }
  }

  onSearchChange(): void {
    this.applyFilter();
    this.cd.detectChanges();
  }

  toggleSelectAll(): void {
    this.selectAll = !this.selectAll;
    this.filteredTags.forEach(t => t.selected = this.selectAll);
    this.cd.detectChanges();
  }

  sendToTrend(): void {
    const selectedTags = this.tags.filter(t => t.selected);
    if (selectedTags.length === 0 || !this.deviceId) return;

    const payload = {
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      tagKeys: selectedTags.map(t => t.key)
    };

    // Broadcast to Trend Viewer and other widgets in the same dashboard state
    (this.ctx.$scope as any).$broadcast('tagsSelected', payload);
  }

  getSelectedCount(): number {
    return this.tags.filter(t => t.selected).length;
  }

  private applyFilter(): void {
    if (!this.searchText.trim()) {
      this.filteredTags = [...this.tags];
      return;
    }
    const term = this.searchText.toLowerCase();
    this.filteredTags = this.tags.filter(
      t => t.key.toLowerCase().includes(term) ||
           t.description.toLowerCase().includes(term) ||
           t.engUnits.toLowerCase().includes(term)
    );
  }
}
