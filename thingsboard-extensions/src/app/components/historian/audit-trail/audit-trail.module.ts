import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@shared/public-api';
import { HomeComponentsModule } from '@home/components/public-api';
import { AuditTrailComponent } from './audit-trail.component';

@NgModule({
  declarations: [AuditTrailComponent],
  imports: [CommonModule, SharedModule, HomeComponentsModule],
  exports: [AuditTrailComponent]
})
export class AuditTrailModule {}
