///
/// W7 Tag Configuration - Angular Module
///

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { W7TagConfigComponent } from './w7-tag-config.component';

@NgModule({
  declarations: [W7TagConfigComponent],
  imports: [CommonModule, FormsModule],
  exports: [W7TagConfigComponent]
})
export class W7TagConfigModule {}
