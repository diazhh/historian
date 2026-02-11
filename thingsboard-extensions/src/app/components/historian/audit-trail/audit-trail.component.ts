import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  TemplateRef,
  ChangeDetectorRef
} from '@angular/core';
import { WidgetContext } from '@home/models/widget-component.models';
import { exportToCSV } from '../../../shared/utils/export.util';

interface AuditEntry {
  id: string;
  createdTime: number;
  entityType: string;
  entityName: string;
  actionType: string;
  userName: string;
  actionStatus: string;
  actionData: string;
}

@Component({
  selector: 'historian-audit-trail',
  templateUrl: './audit-trail.component.html',
  styleUrls: ['./audit-trail.component.scss']
})
export class AuditTrailComponent implements OnInit, OnDestroy {

  @Input() ctx: WidgetContext;
  @Input() widgetTitlePanel: TemplateRef<any>;

  entries: AuditEntry[] = [];
  filteredEntries: AuditEntry[] = [];
  isLoading = false;
  searchText = '';
  filterEntityType = '';
  filterActionType = '';
  pageSize = 50;
  currentPage = 0;
  hasMore = false;

  entityTypes = ['', 'DEVICE', 'ASSET', 'DASHBOARD', 'RULE_CHAIN', 'USER', 'ALARM'];
  actionTypes = ['', 'ADDED', 'UPDATED', 'DELETED', 'ATTRIBUTES_UPDATED', 'ATTRIBUTES_READ',
                 'RPC_CALL', 'CREDENTIALS_UPDATED', 'ASSIGNED_TO_CUSTOMER', 'ALARM_ACK', 'ALARM_CLEAR'];

  constructor(private cd: ChangeDetectorRef) {}

  ngOnInit(): void {
    (this.ctx.$scope as any).historianAuditTrail = this;
    this.loadAuditLogs();
  }

  ngOnDestroy(): void {}

  public onDataUpdated(): void {}

  async loadAuditLogs(append = false): Promise<void> {
    this.isLoading = true;
    this.cd.detectChanges();

    try {
      const offset = append ? this.entries.length : 0;
      let url = `/api/audit/logs?pageSize=${this.pageSize}&page=${this.currentPage}&sortProperty=createdTime&sortOrder=DESC`;

      if (this.filterEntityType) {
        url += `&entityType=${this.filterEntityType}`;
      }
      if (this.filterActionType) {
        url += `&actionType=${this.filterActionType}`;
      }

      const result: any = await this.ctx.http.get<any>(url).toPromise();
      const logs: AuditEntry[] = (result.data || []).map((e: any) => ({
        id: e.id?.id || '',
        createdTime: e.createdTime,
        entityType: e.entityId?.entityType || '',
        entityName: e.entityName || '',
        actionType: e.actionType || '',
        userName: e.userName || '',
        actionStatus: e.actionStatus || '',
        actionData: e.actionData ? JSON.stringify(e.actionData).substring(0, 200) : ''
      }));

      if (append) {
        this.entries = [...this.entries, ...logs];
      } else {
        this.entries = logs;
      }

      this.hasMore = result.hasNext || false;
      this.applySearch();
    } catch {
      this.entries = [];
      this.filteredEntries = [];
    }

    this.isLoading = false;
    this.cd.detectChanges();
  }

  onFilterChange(): void {
    this.currentPage = 0;
    this.loadAuditLogs();
  }

  onSearchChange(): void {
    this.applySearch();
  }

  loadMore(): void {
    this.currentPage++;
    this.loadAuditLogs(true);
  }

  refresh(): void {
    this.currentPage = 0;
    this.loadAuditLogs();
  }

  exportCSV(): void {
    const headers = ['Timestamp', 'Entity Type', 'Entity Name', 'Action', 'User', 'Status', 'Details'];
    const rows = this.filteredEntries.map(e => [
      new Date(e.createdTime).toLocaleString(),
      e.entityType,
      e.entityName,
      e.actionType,
      e.userName,
      e.actionStatus,
      e.actionData
    ]);
    exportToCSV(headers, rows, `audit_trail_${Date.now()}.csv`);
  }

  formatTime(ts: number): string {
    return new Date(ts).toLocaleString();
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'SUCCESS': return 'status-success';
      case 'FAILURE': return 'status-failure';
      default: return '';
    }
  }

  private applySearch(): void {
    if (!this.searchText) {
      this.filteredEntries = [...this.entries];
    } else {
      const term = this.searchText.toLowerCase();
      this.filteredEntries = this.entries.filter(e =>
        e.entityName.toLowerCase().includes(term) ||
        e.userName.toLowerCase().includes(term) ||
        e.actionType.toLowerCase().includes(term) ||
        e.entityType.toLowerCase().includes(term)
      );
    }
    this.cd.detectChanges();
  }
}
