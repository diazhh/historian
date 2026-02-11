import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@shared/public-api';
import { HomeComponentsModule } from '@home/components/public-api';
import { TagConfigManagerComponent } from './tag-config-manager.component';
import { TagMetadataService } from '../../../shared/services/tag-metadata.service';

@NgModule({
  declarations: [TagConfigManagerComponent],
  imports: [CommonModule, SharedModule, HomeComponentsModule],
  exports: [TagConfigManagerComponent],
  providers: [TagMetadataService]
})
export class TagConfigManagerModule {}
