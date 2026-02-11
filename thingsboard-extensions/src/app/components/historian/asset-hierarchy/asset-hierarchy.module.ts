import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@shared/public-api';
import { HomeComponentsModule } from '@home/components/public-api';
import { AssetHierarchyComponent } from './asset-hierarchy.component';

@NgModule({
  declarations: [
    AssetHierarchyComponent
  ],
  imports: [
    CommonModule,
    SharedModule,
    HomeComponentsModule
  ],
  exports: [
    AssetHierarchyComponent
  ]
})
export class AssetHierarchyModule {}
