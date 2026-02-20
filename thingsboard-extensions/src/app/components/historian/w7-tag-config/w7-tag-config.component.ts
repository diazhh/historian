///
/// Industrial Historian - W7 Tag Configuration Component
///
/// Editable form for server-side attributes (ss_*) of a selected tag.
/// Validates alarm/range ordering and saves via TB REST API.
///

import {
  Component, Input, OnInit, OnDestroy, ChangeDetectorRef
} from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';

import { TbApiService } from '../../../shared/services/tb-api.service';
import { BroadcastService } from '../../../shared/services/broadcast.service';

// ── Interfaces ───────────────────────────────────────────

interface TagAttributes {
  ss_description: string;
  ss_engUnits: string;
  ss_rangeLow: number | null;
  ss_rangeHigh: number | null;
  ss_setpoint: number | null;
  ss_deadband: number | null;
  ss_alarmHH: number | null;
  ss_alarmH: number | null;
  ss_alarmL: number | null;
  ss_alarmLL: number | null;
  ss_scanRate: string;
  ss_instrumentType: string;
}

interface ValidationErrors {
  ss_rangeLow: boolean;
  ss_rangeHigh: boolean;
  ss_alarmHH: boolean;
  ss_alarmH: boolean;
  ss_alarmL: boolean;
  ss_alarmLL: boolean;
  ss_setpoint: boolean;
}

// ── Constants ────────────────────────────────────────────

const SS_ATTR_KEYS = [
  'ss_description', 'ss_engUnits',
  'ss_rangeLow', 'ss_rangeHigh', 'ss_setpoint', 'ss_deadband',
  'ss_alarmHH', 'ss_alarmH', 'ss_alarmL', 'ss_alarmLL',
  'ss_scanRate', 'ss_instrumentType'
];

const EMPTY_ATTRS: TagAttributes = {
  ss_description: '',
  ss_engUnits: '',
  ss_rangeLow: null,
  ss_rangeHigh: null,
  ss_setpoint: null,
  ss_deadband: null,
  ss_alarmHH: null,
  ss_alarmH: null,
  ss_alarmL: null,
  ss_alarmLL: null,
  ss_scanRate: '',
  ss_instrumentType: ''
};

const NO_ERRORS: ValidationErrors = {
  ss_rangeLow: false,
  ss_rangeHigh: false,
  ss_alarmHH: false,
  ss_alarmH: false,
  ss_alarmL: false,
  ss_alarmLL: false,
  ss_setpoint: false
};

@Component({
  selector: 'historian-tag-config',
  templateUrl: './w7-tag-config.component.html',
  styleUrls: ['./w7-tag-config.component.scss']
})
export class W7TagConfigComponent implements OnInit, OnDestroy {
  @Input() ctx: any;

  // Public state
  deviceId = '';
  deviceName = '';
  attrs: TagAttributes = { ...EMPTY_ATTRS };
  originalAttrs: TagAttributes = { ...EMPTY_ATTRS };
  errors: ValidationErrors = { ...NO_ERRORS };
  loading = false;
  saving = false;
  hasTag = false;
  message = '';
  messageType: 'success' | 'error' = 'success';

  // Private state
  private subs: Subscription[] = [];

  constructor(
    private tbApi: TbApiService,
    private broadcast: BroadcastService,
    private cdr: ChangeDetectorRef
  ) {}

  // ── Lifecycle ──────────────────────────────────────────

  ngOnInit(): void {
    this.tbApi.init(this.ctx);

    this.ctx.$scope.historianWidget = {
      init: () => {}
    };

    // Listen for tag clicks from other widgets
    this.subs.push(
      this.broadcast.tagClicked$.subscribe(click => {
        this.loadTag(click.deviceId, click.deviceName);
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  // ── Load tag attributes ────────────────────────────────

  async loadTag(deviceId: string, deviceName: string): Promise<void> {
    this.deviceId = deviceId;
    this.deviceName = deviceName;
    this.hasTag = true;
    this.loading = true;
    this.message = '';
    this.cdr.detectChanges();

    try {
      const rawAttrs = await firstValueFrom(
        this.tbApi.getEntityAttributes('DEVICE', deviceId, 'SERVER_SCOPE', SS_ATTR_KEYS)
      );

      const map = new Map(rawAttrs.map(a => [a.key, a.value]));
      this.attrs = {
        ss_description: map.get('ss_description') ?? '',
        ss_engUnits: map.get('ss_engUnits') ?? '',
        ss_rangeLow: this.parseNum(map.get('ss_rangeLow')),
        ss_rangeHigh: this.parseNum(map.get('ss_rangeHigh')),
        ss_setpoint: this.parseNum(map.get('ss_setpoint')),
        ss_deadband: this.parseNum(map.get('ss_deadband')),
        ss_alarmHH: this.parseNum(map.get('ss_alarmHH')),
        ss_alarmH: this.parseNum(map.get('ss_alarmH')),
        ss_alarmL: this.parseNum(map.get('ss_alarmL')),
        ss_alarmLL: this.parseNum(map.get('ss_alarmLL')),
        ss_scanRate: map.get('ss_scanRate') ?? '',
        ss_instrumentType: map.get('ss_instrumentType') ?? ''
      };
      this.originalAttrs = { ...this.attrs };
      this.validate();
    } catch {
      this.attrs = { ...EMPTY_ATTRS };
      this.originalAttrs = { ...EMPTY_ATTRS };
      this.showMessage('Failed to load tag attributes', 'error');
    }

    this.loading = false;
    this.cdr.detectChanges();
  }

  // ── Validation ─────────────────────────────────────────
  // Expected order: rangeLow < alarmLL < alarmL < setpoint < alarmH < alarmHH < rangeHigh

  validate(): void {
    this.errors = { ...NO_ERRORS };

    const vals = this.getOrderedValues();
    if (!vals) return; // Not enough values to validate

    const { rangeLow, alarmLL, alarmL, setpoint, alarmH, alarmHH, rangeHigh } = vals;

    // Check each pair in the expected order
    if (rangeLow != null && alarmLL != null && rangeLow >= alarmLL) {
      this.errors.ss_rangeLow = true;
      this.errors.ss_alarmLL = true;
    }
    if (alarmLL != null && alarmL != null && alarmLL >= alarmL) {
      this.errors.ss_alarmLL = true;
      this.errors.ss_alarmL = true;
    }
    if (alarmL != null && setpoint != null && alarmL >= setpoint) {
      this.errors.ss_alarmL = true;
      this.errors.ss_setpoint = true;
    }
    if (setpoint != null && alarmH != null && setpoint >= alarmH) {
      this.errors.ss_setpoint = true;
      this.errors.ss_alarmH = true;
    }
    if (alarmH != null && alarmHH != null && alarmH >= alarmHH) {
      this.errors.ss_alarmH = true;
      this.errors.ss_alarmHH = true;
    }
    if (alarmHH != null && rangeHigh != null && alarmHH >= rangeHigh) {
      this.errors.ss_alarmHH = true;
      this.errors.ss_rangeHigh = true;
    }
  }

  private getOrderedValues(): {
    rangeLow: number | null;
    alarmLL: number | null;
    alarmL: number | null;
    setpoint: number | null;
    alarmH: number | null;
    alarmHH: number | null;
    rangeHigh: number | null;
  } | null {
    return {
      rangeLow: this.attrs.ss_rangeLow,
      alarmLL: this.attrs.ss_alarmLL,
      alarmL: this.attrs.ss_alarmL,
      setpoint: this.attrs.ss_setpoint,
      alarmH: this.attrs.ss_alarmH,
      alarmHH: this.attrs.ss_alarmHH,
      rangeHigh: this.attrs.ss_rangeHigh
    };
  }

  get hasValidationErrors(): boolean {
    return Object.values(this.errors).some(e => e);
  }

  onFieldChange(): void {
    this.validate();
    this.cdr.detectChanges();
  }

  // ── Save ───────────────────────────────────────────────

  async save(): Promise<void> {
    if (!this.deviceId || this.hasValidationErrors) return;

    this.saving = true;
    this.message = '';
    this.cdr.detectChanges();

    try {
      const payload: Record<string, any> = {};
      for (const key of SS_ATTR_KEYS) {
        const val = (this.attrs as any)[key];
        payload[key] = val != null ? val : '';
      }

      await firstValueFrom(
        this.tbApi.setServerAttributes('DEVICE', this.deviceId, payload)
      );

      this.originalAttrs = { ...this.attrs };
      this.showMessage('Configuration saved successfully', 'success');
    } catch {
      this.showMessage('Failed to save configuration', 'error');
    }

    this.saving = false;
    this.cdr.detectChanges();
  }

  // ── Reset ──────────────────────────────────────────────

  reset(): void {
    this.attrs = { ...this.originalAttrs };
    this.validate();
    this.message = '';
    this.cdr.detectChanges();
  }

  // ── Helpers ────────────────────────────────────────────

  private parseNum(val: any): number | null {
    if (val == null || val === '') return null;
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  }

  private showMessage(text: string, type: 'success' | 'error'): void {
    this.message = text;
    this.messageType = type;
  }
}
