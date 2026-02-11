import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@shared/public-api';
import { HomeComponentsModule } from '@home/components/public-api';
import { ComparisonViewComponent } from './comparison-view.component';
import { TimeWeightedCalcService } from '../../../shared/services/time-weighted.service';

@NgModule({
  declarations: [ComparisonViewComponent],
  imports: [CommonModule, SharedModule, HomeComponentsModule],
  exports: [ComparisonViewComponent],
  providers: [TimeWeightedCalcService]
})
export class ComparisonViewModule {}
