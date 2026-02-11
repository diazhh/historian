import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  TemplateRef,
  ChangeDetectorRef
} from '@angular/core';
import { FlatTreeControl } from '@angular/cdk/tree';
import { WidgetContext } from '@home/models/widget-component.models';
import { TreeNode } from '../../../shared/models/hierarchy.model';

interface FlatNode {
  id: string;
  name: string;
  entityType: 'ASSET' | 'DEVICE';
  level: number;
  expandable: boolean;
  loaded: boolean;
  loading: boolean;
  tagCount?: number;
}

@Component({
  selector: 'historian-hierarchy',
  templateUrl: './asset-hierarchy.component.html',
  styleUrls: ['./asset-hierarchy.component.scss']
})
export class AssetHierarchyComponent implements OnInit, OnDestroy {

  @Input() ctx: WidgetContext;
  @Input() widgetTitlePanel: TemplateRef<any>;

  treeControl: FlatTreeControl<FlatNode>;
  dataSource: FlatNode[] = [];
  selectedNodeId: string | null = null;
  searchText = '';
  filteredDataSource: FlatNode[] = [];

  constructor(private cd: ChangeDetectorRef) {
    this.treeControl = new FlatTreeControl<FlatNode>(
      node => node.level,
      node => node.expandable
    );
  }

  ngOnInit(): void {
    (this.ctx.$scope as any).historianHierarchy = this;
    this.loadRootNodes();
  }

  ngOnDestroy(): void {
    // cleanup
  }

  hasChild = (_: number, node: FlatNode): boolean => node.expandable;

  isExpanded(node: FlatNode): boolean {
    return this.treeControl.isExpanded(node);
  }

  getIcon(node: FlatNode): string {
    if (node.entityType === 'DEVICE') return 'memory';
    if (node.level === 0) return 'business';
    if (node.level === 1) return 'domain';
    if (node.level === 2) return 'settings';
    return 'folder';
  }

  async loadRootNodes(): Promise<void> {
    const rootAssetId = this.getRootAssetId();
    if (!rootAssetId) return;

    const children = await this.fetchChildren(rootAssetId, 'ASSET');
    this.dataSource = children.map(c => ({
      ...c,
      level: 0,
      loading: false
    }));
    this.applyFilter();
    this.cd.detectChanges();
  }

  async toggleNode(node: FlatNode): Promise<void> {
    if (this.treeControl.isExpanded(node)) {
      this.collapseNode(node);
      return;
    }

    if (!node.loaded && node.expandable) {
      node.loading = true;
      this.cd.detectChanges();

      const children = await this.fetchChildren(node.id, node.entityType);
      const childNodes: FlatNode[] = children.map(c => ({
        ...c,
        level: node.level + 1,
        loading: false
      }));

      // Insert children after parent
      const parentIdx = this.dataSource.indexOf(node);
      if (parentIdx >= 0) {
        this.dataSource.splice(parentIdx + 1, 0, ...childNodes);
      }

      node.loaded = true;
      node.loading = false;
      this.treeControl.expand(node);
      this.applyFilter();
      this.cd.detectChanges();
    } else {
      this.treeControl.expand(node);
    }
  }

  private collapseNode(node: FlatNode): void {
    this.treeControl.collapse(node);
    // Remove all descendant nodes from flat list
    const parentIdx = this.dataSource.indexOf(node);
    if (parentIdx < 0) return;

    let removeCount = 0;
    for (let i = parentIdx + 1; i < this.dataSource.length; i++) {
      if (this.dataSource[i].level > node.level) {
        removeCount++;
      } else {
        break;
      }
    }
    if (removeCount > 0) {
      this.dataSource.splice(parentIdx + 1, removeCount);
    }
    node.loaded = false;
    this.applyFilter();
    this.cd.detectChanges();
  }

  selectNode(node: FlatNode): void {
    this.selectedNodeId = node.id;

    // Update dashboard state so all other widgets change context
    if (this.ctx.stateController) {
      this.ctx.stateController.updateState('default', {
        entityId: { entityType: node.entityType, id: node.id },
        entityName: node.name
      } as any);
    }

    this.cd.detectChanges();
  }

  onSearchChange(): void {
    this.applyFilter();
    this.cd.detectChanges();
  }

  private applyFilter(): void {
    if (!this.searchText.trim()) {
      this.filteredDataSource = [...this.dataSource];
      return;
    }
    const term = this.searchText.toLowerCase();
    this.filteredDataSource = this.dataSource.filter(
      n => n.name.toLowerCase().includes(term)
    );
  }

  private async fetchChildren(parentId: string, parentType: string): Promise<Omit<FlatNode, 'level' | 'loading'>[]> {
    try {
      const url = `/api/relations?fromId=${parentId}&fromType=${parentType}&relationType=Contains`;
      const relations: any[] = await this.ctx.http.get<any[]>(url).toPromise();

      const nodes: Omit<FlatNode, 'level' | 'loading'>[] = [];
      for (const rel of relations || []) {
        const entityType = rel.to.entityType;
        const entityId = rel.to.id;

        // Fetch entity name
        const entityUrl = entityType === 'DEVICE'
          ? `/api/device/${entityId}`
          : `/api/asset/${entityId}`;
        try {
          const entity: any = await this.ctx.http.get(entityUrl).toPromise();
          nodes.push({
            id: entityId,
            name: entity.name || entityId,
            entityType,
            expandable: entityType === 'ASSET',
            loaded: false,
            tagCount: undefined
          });
        } catch {
          nodes.push({
            id: entityId,
            name: entityId,
            entityType,
            expandable: entityType === 'ASSET',
            loaded: false
          });
        }
      }

      return nodes.sort((a, b) => {
        if (a.entityType !== b.entityType) {
          return a.entityType === 'ASSET' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    } catch {
      return [];
    }
  }

  private getRootAssetId(): string | null {
    // Try from widget settings first, then from dashboard state entity
    const settings = this.ctx.settings;
    if (settings?.rootAssetId) {
      return settings.rootAssetId;
    }

    // Try from current entity alias (stateEntity)
    const entityId = this.ctx.defaultSubscription?.targetDeviceId;
    if (entityId) return entityId;

    // Try from first datasource
    const ds = this.ctx.datasources?.[0];
    if (ds?.entityId) return ds.entityId;

    return null;
  }
}
