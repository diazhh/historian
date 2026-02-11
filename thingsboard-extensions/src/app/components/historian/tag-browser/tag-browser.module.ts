import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@shared/public-api';
import { HomeComponentsModule } from '@home/components/public-api';
import { TagBrowserComponent } from './tag-browser.component';
import { TagMetadataService } from '../../../shared/services/tag-metadata.service';

@NgModule({
  declarations: [
    TagBrowserComponent
  ],
  imports: [
    CommonModule,
    SharedModule,
    HomeComponentsModule
  ],
  exports: [
    TagBrowserComponent
  ],
  providers: [
    TagMetadataService
  ]
})
export class TagBrowserModule {}
