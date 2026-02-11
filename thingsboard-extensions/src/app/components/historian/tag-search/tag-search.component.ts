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
import { TagConfigMap } from '../../../shared/models/tag.model';

interface SearchableTag {
  deviceId: string;
  deviceName: string;
  key: string;
  description: string;
  engUnits: string;
  dataType: string;
  area: string;
  equipment: string;
}

@Component({
  selector: 'historian-tag-search',
  templateUrl: './tag-search.component.html',
  styleUrls: ['./tag-search.component.scss']
})
export class TagSearchComponent implements OnInit, OnDestroy {

  @Input() ctx: WidgetContext;
  @Input() widgetTitlePanel: TemplateRef<any>;

  searchText = '';
  results: SearchableTag[] = [];
  selectedTags: Set<string> = new Set();
  loading = false;
  indexReady = false;
  totalTags = 0;

  private tagIndex: SearchableTag[] = [];

  constructor(
    private cd: ChangeDetectorRef,
    private tagMetadata: TagMetadataService
  ) {}

  ngOnInit(): void {
    (this.ctx.$scope as any).historianTagSearch = this;
    this.buildIndex();
  }

  ngOnDestroy(): void {}

  async buildIndex(): Promise<void> {
    this.loading = true;
    this.cd.detectChanges();

    try {
      // Get all devices from current entity's hierarchy
      const devices = await this.getAllDevices();

      for (const device of devices) {
        try {
          const config = await this.tagMetadata.getTagConfig(this.ctx, device.id);
          for (const [key, tagConf] of Object.entries(config)) {
            this.tagIndex.push({
              deviceId: device.id,
              deviceName: device.name,
              key,
              description: tagConf.description || '',
              engUnits: tagConf.engUnits || '',
              dataType: tagConf.dataType || 'FLOAT',
              area: tagConf.area || '',
              equipment: tagConf.equipment || ''
            });
          }
        } catch {
          // Skip device if tagConfig fails
        }
      }

      this.totalTags = this.tagIndex.length;
      this.indexReady = true;
    } catch {
      this.tagIndex = [];
    }

    this.loading = false;
    this.cd.detectChanges();
  }

  onSearchChange(): void {
    if (!this.searchText.trim()) {
      this.results = [];
      this.cd.detectChanges();
      return;
    }

    const terms = this.searchText.toLowerCase().split(/\s+/);
    this.results = this.tagIndex.filter(tag => {
      const searchable = `${tag.key} ${tag.description} ${tag.deviceName} ${tag.area} ${tag.equipment} ${tag.engUnits}`.toLowerCase();
      return terms.every(term => searchable.includes(term));
    }).slice(0, 100); // Limit results

    this.cd.detectChanges();
  }

  toggleTag(tag: SearchableTag): void {
    const id = `${tag.deviceId}:${tag.key}`;
    if (this.selectedTags.has(id)) {
      this.selectedTags.delete(id);
    } else {
      this.selectedTags.add(id);
    }
    this.cd.detectChanges();
  }

  isSelected(tag: SearchableTag): boolean {
    return this.selectedTags.has(`${tag.deviceId}:${tag.key}`);
  }

  sendToTrend(): void {
    if (this.selectedTags.size === 0) return;

    // Group by device
    const grouped: Record<string, { deviceName: string; tagKeys: string[] }> = {};
    for (const id of this.selectedTags) {
      const [deviceId, tagKey] = id.split(':');
      if (!grouped[deviceId]) {
        const tag = this.tagIndex.find(t => t.deviceId === deviceId);
        grouped[deviceId] = { deviceName: tag?.deviceName || '', tagKeys: [] };
      }
      grouped[deviceId].tagKeys.push(tagKey);
    }

    // Broadcast first device's tags (multi-device support would need more work)
    const firstDeviceId = Object.keys(grouped)[0];
    const payload = {
      deviceId: firstDeviceId,
      deviceName: grouped[firstDeviceId].deviceName,
      tagKeys: grouped[firstDeviceId].tagKeys
    };

    (this.ctx.$scope as any).$broadcast('tagsSelected', payload);
  }

  getSelectedCount(): number {
    return this.selectedTags.size;
  }

  clearSelection(): void {
    this.selectedTags.clear();
    this.cd.detectChanges();
  }

  private async getAllDevices(): Promise<Array<{ id: string; name: string }>> {
    const devices: Array<{ id: string; name: string }> = [];

    // Get root entity from widget context
    const rootId = this.ctx.datasources?.[0]?.entityId;
    if (!rootId) return devices;

    // Recursive fetch of all devices under root asset
    await this.collectDevices(rootId, 'ASSET', devices, 0);
    return devices;
  }

  private async collectDevices(
    parentId: string,
    parentType: string,
    devices: Array<{ id: string; name: string }>,
    depth: number
  ): Promise<void> {
    if (depth > 10) return; // Safety limit

    try {
      const url = `/api/relations?fromId=${parentId}&fromType=${parentType}&relationType=Contains`;
      const relations: any[] = await this.ctx.http.get<any[]>(url).toPromise();

      for (const rel of (relations || [])) {
        if (rel.to.entityType === 'DEVICE') {
          try {
            const device: any = await this.ctx.http.get(`/api/device/${rel.to.id}`).toPromise();
            devices.push({ id: rel.to.id, name: device.name || rel.to.id });
          } catch {
            devices.push({ id: rel.to.id, name: rel.to.id });
          }
        } else if (rel.to.entityType === 'ASSET') {
          await this.collectDevices(rel.to.id, 'ASSET', devices, depth + 1);
        }
      }
    } catch {
      // Skip on error
    }
  }
}
