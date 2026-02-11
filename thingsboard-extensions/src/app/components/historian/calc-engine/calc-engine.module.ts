import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@shared/public-api';
import { HomeComponentsModule } from '@home/components/public-api';
import { CalcEngineComponent } from './calc-engine.component';

@NgModule({
  declarations: [CalcEngineComponent],
  imports: [CommonModule, SharedModule, HomeComponentsModule],
  exports: [CalcEngineComponent]
})
export class CalcEngineModule {}
