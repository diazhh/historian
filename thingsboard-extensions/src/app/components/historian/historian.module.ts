import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@shared/public-api';
import { HomeComponentsModule } from '@home/components/public-api';
import { AssetHierarchyModule } from './asset-hierarchy/asset-hierarchy.module';
import { TagBrowserModule } from './tag-browser/tag-browser.module';
import { TrendViewerModule } from './trend-viewer/trend-viewer.module';
import { DataGridModule } from './data-grid/data-grid.module';
import { TagSearchModule } from './tag-search/tag-search.module';
import { TagConfigManagerModule } from './tag-config-manager/tag-config-manager.module';
import { CalcEngineModule } from './calc-engine/calc-engine.module';
import { StatisticalAnalysisModule } from './statistical-analysis/statistical-analysis.module';
import { ComparisonViewModule } from './comparison-view/comparison-view.module';
import { ReportGeneratorModule } from './report-generator/report-generator.module';
import { AuditTrailModule } from './audit-trail/audit-trail.module';
import { BatchAnalysisModule } from './batch-analysis/batch-analysis.module';
import { TagMetadataService } from '../../shared/services/tag-metadata.service';
import { TimeWeightedCalcService } from '../../shared/services/time-weighted.service';

@NgModule({
  imports: [
    CommonModule,
    SharedModule,
    HomeComponentsModule,
    AssetHierarchyModule,
    TagBrowserModule,
    TrendViewerModule,
    DataGridModule,
    TagSearchModule,
    TagConfigManagerModule,
    CalcEngineModule,
    StatisticalAnalysisModule,
    ComparisonViewModule,
    ReportGeneratorModule,
    AuditTrailModule,
    BatchAnalysisModule
  ],
  exports: [
    AssetHierarchyModule,
    TagBrowserModule,
    TrendViewerModule,
    DataGridModule,
    TagSearchModule,
    TagConfigManagerModule,
    CalcEngineModule,
    StatisticalAnalysisModule,
    ComparisonViewModule,
    ReportGeneratorModule,
    AuditTrailModule,
    BatchAnalysisModule
  ],
  providers: [
    TagMetadataService,
    TimeWeightedCalcService
  ]
})
export class HistorianModule {}
