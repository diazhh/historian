///
/// Industrial Historian - W2 Tag Browser Module
///

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { W2TagBrowserComponent } from './w2-tag-browser.component';

@NgModule({
  declarations: [W2TagBrowserComponent],
  imports: [CommonModule, FormsModule],
  exports: [W2TagBrowserComponent]
})
export class W2TagBrowserModule {}
