import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@shared/public-api';
import { HomeComponentsModule } from '@home/components/public-api';
import { DataGridComponent } from './data-grid.component';
import { TagMetadataService } from '../../../shared/services/tag-metadata.service';

@NgModule({
  declarations: [DataGridComponent],
  imports: [CommonModule, SharedModule, HomeComponentsModule],
  exports: [DataGridComponent],
  providers: [TagMetadataService]
})
export class DataGridModule {}
