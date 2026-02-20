///
/// W4 Event Frame Timeline - Angular Module
///

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { W4EventTimelineComponent } from './w4-event-timeline.component';

@NgModule({
  declarations: [W4EventTimelineComponent],
  imports: [CommonModule],
  exports: [W4EventTimelineComponent]
})
export class W4EventTimelineModule {}
