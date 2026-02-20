///
/// W6 Batch Comparison - Angular Module
///

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { W6BatchComparisonComponent } from './w6-batch-comparison.component';

@NgModule({
  declarations: [W6BatchComparisonComponent],
  imports: [CommonModule, FormsModule],
  exports: [W6BatchComparisonComponent]
})
export class W6BatchComparisonModule {}
