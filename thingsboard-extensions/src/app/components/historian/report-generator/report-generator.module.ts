import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@shared/public-api';
import { HomeComponentsModule } from '@home/components/public-api';
import { ReportGeneratorComponent } from './report-generator.component';
import { TagMetadataService } from '../../../shared/services/tag-metadata.service';
import { TimeWeightedCalcService } from '../../../shared/services/time-weighted.service';

@NgModule({
  declarations: [ReportGeneratorComponent],
  imports: [CommonModule, SharedModule, HomeComponentsModule],
  exports: [ReportGeneratorComponent],
  providers: [TagMetadataService, TimeWeightedCalcService]
})
export class ReportGeneratorModule {}
