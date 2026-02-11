import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@shared/public-api';
import { HomeComponentsModule } from '@home/components/public-api';
import { TrendViewerComponent } from './trend-viewer.component';
import { TagMetadataService } from '../../../shared/services/tag-metadata.service';
import { TimeWeightedCalcService } from '../../../shared/services/time-weighted.service';

@NgModule({
  declarations: [
    TrendViewerComponent
  ],
  imports: [
    CommonModule,
    SharedModule,
    HomeComponentsModule
  ],
  exports: [
    TrendViewerComponent
  ],
  providers: [
    TagMetadataService,
    TimeWeightedCalcService
  ]
})
export class TrendViewerModule {}
