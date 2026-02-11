import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@shared/public-api';
import { HomeComponentsModule } from '@home/components/public-api';
import { StatisticalAnalysisComponent } from './statistical-analysis.component';
import { TimeWeightedCalcService } from '../../../shared/services/time-weighted.service';

@NgModule({
  declarations: [StatisticalAnalysisComponent],
  imports: [CommonModule, SharedModule, HomeComponentsModule],
  exports: [StatisticalAnalysisComponent],
  providers: [TimeWeightedCalcService]
})
export class StatisticalAnalysisModule {}
