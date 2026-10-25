///
/// W8 Data Grid - Angular Module
///

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { W8DataGridComponent } from './w8-data-grid.component';

@NgModule({
  declarations: [W8DataGridComponent],
  imports: [CommonModule, FormsModule],
  exports: [W8DataGridComponent]
})
export class W8DataGridModule {}
