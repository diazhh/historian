///
/// W5 Ad-hoc Query - Angular Module
///

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { W5AdhocQueryComponent } from './w5-adhoc-query.component';

@NgModule({
  declarations: [W5AdhocQueryComponent],
  imports: [CommonModule, FormsModule],
  exports: [W5AdhocQueryComponent]
})
export class W5AdhocQueryModule {}
