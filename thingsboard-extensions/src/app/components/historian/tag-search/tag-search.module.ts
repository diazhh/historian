import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@shared/public-api';
import { HomeComponentsModule } from '@home/components/public-api';
import { TagSearchComponent } from './tag-search.component';
import { TagMetadataService } from '../../../shared/services/tag-metadata.service';

@NgModule({
  declarations: [TagSearchComponent],
  imports: [CommonModule, SharedModule, HomeComponentsModule],
  exports: [TagSearchComponent],
  providers: [TagMetadataService]
})
export class TagSearchModule {}
