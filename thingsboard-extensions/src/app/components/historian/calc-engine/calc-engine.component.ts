import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  TemplateRef,
  ChangeDetectorRef
} from '@angular/core';
import { WidgetContext } from '@home/models/widget-component.models';

interface CalcField {
  id?: string;
  name: string;
  expression: string;
  outputKey: string;
  enabled: boolean;
  lastValue?: string | number | null;
  editing: boolean;
}

@Component({
  selector: 'historian-calc-engine',
  templateUrl: './calc-engine.component.html',
  styleUrls: ['./calc-engine.component.scss']
})
export class CalcEngineComponent implements OnInit, OnDestroy {

  @Input() ctx: WidgetContext;
  @Input() widgetTitlePanel: TemplateRef<any>;

  fields: CalcField[] = [];
  loading = false;
  showAddForm = false;

  newField: Partial<CalcField> = {
    name: '',
    expression: '',
    outputKey: '',
    enabled: true
  };

  constructor(private cd: ChangeDetectorRef) {}

  ngOnInit(): void {
    (this.ctx.$scope as any).historianCalcEngine = this;
    this.loadFields();
  }

  ngOnDestroy(): void {}

  async loadFields(): Promise<void> {
    this.loading = true;
    this.cd.detectChanges();

    try {
      // Get device profile calculated fields via REST
      const ds = this.ctx.datasources?.[0];
      if (!ds?.entityId) return;

      // Read device to get profile ID
      const device: any = await this.ctx.http.get(`/api/device/${ds.entityId}`).toPromise();
      const profileId = device?.deviceProfileId?.id;

      if (profileId) {
        const profile: any = await this.ctx.http.get(`/api/deviceProfile/${profileId}`).toPromise();
        const calcFields = profile?.profileData?.calculatedFields || {};

        this.fields = Object.entries(calcFields).map(([id, cf]: [string, any]) => ({
          id,
          name: cf.name || id,
          expression: cf.expression || cf.script || '',
          outputKey: cf.output?.key || '',
          enabled: cf.enabled !== false,
          lastValue: null,
          editing: false
        }));
      }
    } catch {
      this.fields = [];
    }

    this.loading = false;
    this.cd.detectChanges();
  }

  toggleEdit(field: CalcField): void {
    field.editing = !field.editing;
    this.cd.detectChanges();
  }

  toggleAddForm(): void {
    this.showAddForm = !this.showAddForm;
    if (this.showAddForm) {
      this.newField = { name: '', expression: '', outputKey: '', enabled: true };
    }
    this.cd.detectChanges();
  }

  async saveField(field: CalcField): Promise<void> {
    // Note: Saving calculated fields requires admin access to Device Profile API
    // This is a UI placeholder — actual save depends on TB PE version and permissions
    field.editing = false;
    this.cd.detectChanges();
  }

  async addField(): Promise<void> {
    if (!this.newField.name || !this.newField.expression || !this.newField.outputKey) return;

    this.fields.push({
      name: this.newField.name!,
      expression: this.newField.expression!,
      outputKey: this.newField.outputKey!,
      enabled: true,
      editing: false
    });

    this.showAddForm = false;
    this.cd.detectChanges();
  }

  async deleteField(field: CalcField): Promise<void> {
    const idx = this.fields.indexOf(field);
    if (idx >= 0) {
      this.fields.splice(idx, 1);
      this.cd.detectChanges();
    }
  }

  refresh(): void {
    this.loadFields();
  }
}
