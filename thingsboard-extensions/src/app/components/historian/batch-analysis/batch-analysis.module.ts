import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@shared/public-api';
import { HomeComponentsModule } from '@home/components/public-api';
import { BatchAnalysisComponent } from './batch-analysis.component';

@NgModule({
  declarations: [BatchAnalysisComponent],
  imports: [CommonModule, SharedModule, HomeComponentsModule],
  exports: [BatchAnalysisComponent]
})
export class BatchAnalysisModule {}
