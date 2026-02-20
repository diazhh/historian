///
/// Industrial Historian - Root Module
///

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TbApiService } from '../../shared/services/tb-api.service';
import { BroadcastService } from '../../shared/services/broadcast.service';
import { W1TrendViewerModule } from './w1-trend-viewer/w1-trend-viewer.module';
import { W2TagBrowserModule } from './w2-tag-browser/w2-tag-browser.module';
import { W3TagDetailModule } from './w3-tag-detail/w3-tag-detail.module';
import { W4EventTimelineModule } from './w4-event-timeline/w4-event-timeline.module';
import { W5AdhocQueryModule } from './w5-adhoc-query/w5-adhoc-query.module';
import { W6BatchComparisonModule } from './w6-batch-comparison/w6-batch-comparison.module';
import { W7TagConfigModule } from './w7-tag-config/w7-tag-config.module';

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    FormsModule,
    W1TrendViewerModule,
    W2TagBrowserModule,
    W3TagDetailModule,
    W4EventTimelineModule,
    W5AdhocQueryModule,
    W6BatchComparisonModule,
    W7TagConfigModule
  ],
  exports: [
    W1TrendViewerModule,
    W2TagBrowserModule,
    W3TagDetailModule,
    W4EventTimelineModule,
    W5AdhocQueryModule,
    W6BatchComparisonModule,
    W7TagConfigModule
  ],
  providers: [
    TbApiService,
    BroadcastService
  ]
})
export class HistorianModule {}
