///
/// W1 Industrial Trend Viewer - Angular Module
///

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { W1TrendViewerComponent } from './w1-trend-viewer.component';

@NgModule({
  declarations: [W1TrendViewerComponent],
  imports: [CommonModule],
  exports: [W1TrendViewerComponent]
})
export class W1TrendViewerModule {}
