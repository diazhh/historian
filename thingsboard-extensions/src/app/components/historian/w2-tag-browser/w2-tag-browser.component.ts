///
/// Industrial Historian - W2 Tag Browser Component
///

import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, switchMap, finalize } from 'rxjs/operators';
import { TbApiService } from '../../../shared/services/tb-api.service';
import { BroadcastService, TagSelection, TagClick } from '../../../shared/services/broadcast.service';
import { qualityColor, formatValue, formatTimestamp } from '../../../shared/utils/format.util';
import { qualityToText } from '../../../shared/models/tag.model';
import { TreeNode } from './tree-node.model';

type TabId = 'browse' | 'search' | 'favorites' | 'recents';

const FAVORITES_KEY = 'historian_tag_favorites';
const RECENTS_KEY = 'historian_tag_recents';
const MAX_RECENTS = 20;

@Component({
  selector: 'historian-tag-browser',
  templateUrl: './w2-tag-browser.component.html',
  styleUrls: ['./w2-tag-browser.component.scss']
})
export class W2TagBrowserComponent implements OnInit, OnDestroy {
  @Input() ctx: any;

  activeTab: TabId = 'browse';
  treeNodes: TreeNode[] = [];
  searchResults: TreeNode[] = [];
  favoriteNodes: TreeNode[] = [];
  recentNodes: TreeNode[] = [];
  searchQuery = '';
  searching = false;
  loadingRoot = false;

  private searchSubject = new Subject<string>();
  private subscriptions: Subscription[] = [];
  private favoriteIds: string[] = [];
  private recentEntries: Array<{ id: string; name: string }> = [];

  constructor(
    private tbApi: TbApiService,
    private broadcast: BroadcastService
  ) {}

  ngOnInit(): void {
    this.tbApi.init(this.ctx);
    this.loadFavorites();
    this.loadRecents();

    this.subscriptions.push(
      this.searchSubject.pipe(
        debounceTime(300),
        switchMap(query => {
          this.searching = true;
          return this.searchDevices(query);
        })
      ).subscribe((results: any) => {
        this.searchResults = results as TreeNode[];
        this.searching = false;
      })
    );

    this.ctx.$scope.historianWidget = {
      init: () => this.loadRootEntities()
    };

    this.loadRootEntities();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
    this.searchSubject.complete();
  }

  // ─── Tab Navigation ───

  setTab(tab: TabId): void {
    this.activeTab = tab;
    if (tab === 'favorites') {
      this.refreshFavorites();
    } else if (tab === 'recents') {
      this.refreshRecents();
    }
  }

  // ─── Tree: Load Root Entities ───

  loadRootEntities(): void {
    this.loadingRoot = true;
    this.subscriptions.push(
      this.tbApi.getEntityAttributes('TENANT', '', 'SERVER_SCOPE').pipe(
        finalize(() => this.loadingRoot = false)
      ).subscribe({
        error: () => this.fetchTopLevelAssets()
      })
    );
    this.fetchTopLevelAssets();
  }

  private fetchTopLevelAssets(): void {
    this.loadingRoot = true;
    const url = '/api/tenant/assets?pageSize=100&page=0&sortProperty=name&sortOrder=ASC';
    this.subscriptions.push(
      this.ctx.http.get(url).pipe(
        finalize(() => this.loadingRoot = false)
      ).subscribe((response: any) => {
        const assets = response?.data ?? [];
        // Top level = assets whose profile suggests Enterprise or Plant level
        this.treeNodes = assets.map((a: any) => this.assetToNode(a, 0));
        // Filter to only root-level assets (Enterprise/Plant) by checking if they have no parent
        this.filterRootAssets();
      })
    );
  }

  private filterRootAssets(): void {
    // Keep only top-level assets by finding which ones are NOT children of other loaded assets
    if (this.treeNodes.length === 0) return;

    const allIds = new Set(this.treeNodes.map(n => n.id));
    const childIds = new Set<string>();

    let pending = this.treeNodes.length;
    const checkDone = () => {
      pending--;
      if (pending <= 0) {
        // Keep nodes that are not children of others in this set
        if (childIds.size > 0) {
          this.treeNodes = this.treeNodes.filter(n => !childIds.has(n.id));
        }
      }
    };

    this.treeNodes.forEach(node => {
      this.tbApi.getRelations(node.id, 'ASSET', 'Contains').subscribe(
        relations => {
          relations.forEach(r => {
            if (allIds.has(r.to.id)) {
              childIds.add(r.to.id);
            }
          });
          checkDone();
        },
        () => checkDone()
      );
    });
  }

  private assetToNode(asset: any, level: number): TreeNode {
    return {
      id: asset.id?.id ?? asset.id,
      name: asset.name,
      entityType: 'ASSET',
      profileName: asset.type ?? asset.assetProfileName,
      level,
      expanded: false,
      loading: false,
      children: []
    };
  }

  // ─── Tree: Expand / Collapse ───

  toggleNode(node: TreeNode): void {
    if (node.expanded) {
      node.expanded = false;
      return;
    }

    if (node.children.length > 0) {
      node.expanded = true;
      return;
    }

    this.loadChildren(node);
  }

  private loadChildren(node: TreeNode): void {
    node.loading = true;
    this.tbApi.getRelations(node.id, node.entityType, 'Contains').subscribe(
      relations => {
        const childNodes: TreeNode[] = [];
        let pending = relations.length;

        if (pending === 0) {
          node.children = [];
          node.loading = false;
          node.expanded = true;
          return;
        }

        relations.forEach(rel => {
          const childId = rel.to.id;
          const childType = rel.to.entityType as 'ASSET' | 'DEVICE';
          const entityUrl = childType === 'ASSET'
            ? `/api/asset/${childId}`
            : `/api/device/${childId}`;

          this.ctx.http.get(entityUrl).subscribe(
            (entity: any) => {
              const childNode: TreeNode = {
                id: childId,
                name: entity.name,
                entityType: childType,
                profileName: entity.type ?? entity.assetProfileName ?? entity.deviceProfileName,
                level: node.level + 1,
                expanded: false,
                loading: false,
                children: [],
                selected: false
              };
              childNodes.push(childNode);
              pending--;

              if (pending === 0) {
                node.children = childNodes.sort((a, b) => a.name.localeCompare(b.name));
                node.loading = false;
                node.expanded = true;
                this.enrichDeviceNodes(node.children.filter(c => c.entityType === 'DEVICE'));
              }
            },
            () => {
              pending--;
              if (pending === 0) {
                node.children = childNodes.sort((a, b) => a.name.localeCompare(b.name));
                node.loading = false;
                node.expanded = true;
              }
            }
          );
        });
      },
      () => {
        node.loading = false;
      }
    );
  }

  private enrichDeviceNodes(nodes: TreeNode[]): void {
    nodes.forEach(node => {
      // Fetch latest PV telemetry
      this.tbApi.getLatestTimeseries('DEVICE', node.id, ['PV']).subscribe(data => {
        const pv = data['PV'];
        if (pv?.length) {
          node.lastValue = pv[0].value;
          node.quality = pv[0].quality;
        }
      });

      // Fetch engineering units from server attributes
      this.tbApi.getEntityAttributes('DEVICE', node.id, 'SERVER_SCOPE', ['ss_engUnits']).subscribe(attrs => {
        const units = attrs.find(a => a.key === 'ss_engUnits');
        if (units) {
          node.engUnits = units.value;
        }
      });
    });
  }

  // ─── Search ───

  onSearchInput(query: string): void {
    this.searchQuery = query;
    if (query.trim().length >= 2) {
      this.searchSubject.next(query.trim());
    } else {
      this.searchResults = [];
    }
  }

  private searchDevices(query: string) {
    const url = `/api/tenant/devices?pageSize=50&page=0&textSearch=${encodeURIComponent(query)}&sortProperty=name&sortOrder=ASC`;
    return this.ctx.http.get(url).pipe(
      switchMap((response: any) => {
        const devices = response?.data ?? [];
        const nodes: TreeNode[] = devices.map((d: any) => ({
          id: d.id?.id ?? d.id,
          name: d.name,
          entityType: 'DEVICE' as const,
          profileName: d.type ?? d.deviceProfileName,
          level: 0,
          expanded: false,
          loading: false,
          children: [],
          selected: false
        }));

        this.enrichDeviceNodes(nodes);

        return [nodes];
      })
    );
  }

  // ─── Selection ───

  get selectedCount(): number {
    return this.countSelected(this.treeNodes) + this.searchResults.filter(n => n.selected).length;
  }

  private countSelected(nodes: TreeNode[]): number {
    let count = 0;
    for (const n of nodes) {
      if (n.selected) count++;
      count += this.countSelected(n.children);
    }
    return count;
  }

  toggleSelection(node: TreeNode): void {
    if (node.entityType !== 'DEVICE') return;
    node.selected = !node.selected;
  }

  clearSelection(): void {
    this.clearSelectionRecursive(this.treeNodes);
    this.searchResults.forEach(n => n.selected = false);
    this.favoriteNodes.forEach(n => n.selected = false);
    this.recentNodes.forEach(n => n.selected = false);
  }

  private clearSelectionRecursive(nodes: TreeNode[]): void {
    for (const n of nodes) {
      n.selected = false;
      this.clearSelectionRecursive(n.children);
    }
  }

  addToTrend(): void {
    const selected = this.collectSelected();
    if (selected.length === 0) return;

    const selection: TagSelection = {
      deviceIds: selected.map(n => n.id),
      deviceNames: selected.map(n => n.name)
    };
    this.broadcast.emitTagsSelected(selection);
    this.clearSelection();
  }

  private collectSelected(): TreeNode[] {
    const result: TreeNode[] = [];
    this.collectSelectedRecursive(this.treeNodes, result);
    this.searchResults.filter(n => n.selected).forEach(n => result.push(n));
    this.favoriteNodes.filter(n => n.selected).forEach(n => result.push(n));
    this.recentNodes.filter(n => n.selected).forEach(n => result.push(n));
    // Deduplicate by id
    const seen = new Set<string>();
    return result.filter(n => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
  }

  private collectSelectedRecursive(nodes: TreeNode[], result: TreeNode[]): void {
    for (const n of nodes) {
      if (n.selected) result.push(n);
      this.collectSelectedRecursive(n.children, result);
    }
  }

  // ─── Tag Click (single click → W3 Tag Detail) ───

  onTagClick(node: TreeNode): void {
    if (node.entityType !== 'DEVICE') return;

    const click: TagClick = {
      deviceId: node.id,
      deviceName: node.name
    };
    this.broadcast.emitTagClicked(click);
    this.addToRecents(node);
  }

  // ─── Favorites ───

  private loadFavorites(): void {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      this.favoriteIds = stored ? JSON.parse(stored) : [];
    } catch {
      this.favoriteIds = [];
    }
  }

  isFavorite(id: string): boolean {
    return this.favoriteIds.includes(id);
  }

  toggleFavorite(node: TreeNode, event: Event): void {
    event.stopPropagation();
    if (node.entityType !== 'DEVICE') return;

    const idx = this.favoriteIds.indexOf(node.id);
    if (idx >= 0) {
      this.favoriteIds.splice(idx, 1);
    } else {
      this.favoriteIds.push(node.id);
    }
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(this.favoriteIds));
  }

  refreshFavorites(): void {
    if (this.favoriteIds.length === 0) {
      this.favoriteNodes = [];
      return;
    }

    this.favoriteNodes = [];
    this.favoriteIds.forEach(id => {
      this.ctx.http.get(`/api/device/${id}`).subscribe((d: any) => {
        const node: TreeNode = {
          id: d.id?.id ?? id,
          name: d.name,
          entityType: 'DEVICE',
          level: 0,
          expanded: false,
          loading: false,
          children: [],
          selected: false
        };
        this.favoriteNodes.push(node);
        this.enrichDeviceNodes([node]);
      });
    });
  }

  // ─── Recents ───

  private loadRecents(): void {
    try {
      const stored = localStorage.getItem(RECENTS_KEY);
      this.recentEntries = stored ? JSON.parse(stored) : [];
    } catch {
      this.recentEntries = [];
    }
  }

  private addToRecents(node: TreeNode): void {
    this.recentEntries = this.recentEntries.filter(e => e.id !== node.id);
    this.recentEntries.unshift({ id: node.id, name: node.name });
    if (this.recentEntries.length > MAX_RECENTS) {
      this.recentEntries = this.recentEntries.slice(0, MAX_RECENTS);
    }
    localStorage.setItem(RECENTS_KEY, JSON.stringify(this.recentEntries));
  }

  refreshRecents(): void {
    this.recentNodes = this.recentEntries.map(e => ({
      id: e.id,
      name: e.name,
      entityType: 'DEVICE' as const,
      level: 0,
      expanded: false,
      loading: false,
      children: [],
      selected: false
    }));
    this.enrichDeviceNodes(this.recentNodes);
  }

  // ─── Context Menu ───

  onContextMenu(event: MouseEvent, node: TreeNode): void {
    if (node.entityType !== 'DEVICE') return;
    event.preventDefault();
    // Context menu actions are handled via the toolbar buttons
    // Right-click selects the node for quick action
    node.selected = true;
  }

  // ─── Template Helpers ───

  getQualityColor(quality: number | undefined): string {
    return qualityColor(quality ?? 0);
  }

  getQualityText(quality: number | undefined): string {
    return qualityToText(quality ?? 0);
  }

  formatNodeValue(node: TreeNode): string {
    if (node.lastValue == null) return '---';
    return formatValue(node.lastValue, node.engUnits ?? '', 2);
  }

  formatTs(ts: number): string {
    return formatTimestamp(ts, 'time');
  }

  getIndentPx(level: number): string {
    return `${level * 20}px`;
  }

  trackByNodeId(_index: number, node: TreeNode): string {
    return node.id;
  }
}
