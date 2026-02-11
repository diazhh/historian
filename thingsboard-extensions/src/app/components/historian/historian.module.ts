import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@shared/public-api';
import { HomeComponentsModule } from '@home/components/public-api';
import { AssetHierarchyModule } from './asset-hierarchy/asset-hierarchy.module';
import { TagBrowserModule } from './tag-browser/tag-browser.module';
import { TrendViewerModule } from './trend-viewer/trend-viewer.module';
import { TagMetadataService } from '../../shared/services/tag-metadata.service';
import { TimeWeightedCalcService } from '../../shared/services/time-weighted.service';

@NgModule({
  imports: [
    CommonModule,
    SharedModule,
    HomeComponentsModule,
    AssetHierarchyModule,
    TagBrowserModule,
    TrendViewerModule
  ],
  exports: [
    AssetHierarchyModule,
    TagBrowserModule,
    TrendViewerModule
  ],
  providers: [
    TagMetadataService,
    TimeWeightedCalcService
  ]
})
export class HistorianModule {}
