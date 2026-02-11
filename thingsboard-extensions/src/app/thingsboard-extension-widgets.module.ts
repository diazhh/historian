///
/// Copyright © 2023 ThingsBoard, Inc.
///

import { NgModule } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import addCustomWidgetLocale from './locale/custom-widget-locale.constant';
import { CommonModule } from '@angular/common';
import { ExamplesModule } from './components/examples/examples.module';
import { HistorianModule } from './components/historian/historian.module';
import { addLibraryStyles } from './scss/lib-styles';

@NgModule({
  declarations: [],
  imports: [
    CommonModule
  ],
  exports: [
    ExamplesModule,
    HistorianModule
  ]
})
export class ThingsboardExtensionWidgetsModule {

  constructor(translate: TranslateService) {
    addCustomWidgetLocale(translate);
    addLibraryStyles('tb-extension-css');
  }

}
