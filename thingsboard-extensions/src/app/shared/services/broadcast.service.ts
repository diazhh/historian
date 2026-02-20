///
/// Industrial Historian - Broadcast Service (inter-widget communication)
///

import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface TagSelection {
  deviceIds: string[];
  deviceNames: string[];
}

export interface TagClick {
  deviceId: string;
  deviceName: string;
  key?: string;
}

export interface TimeRange {
  startTs: number;
  endTs: number;
}

@Injectable()
export class BroadcastService {
  readonly tagsSelected$ = new Subject<TagSelection>();
  readonly tagClicked$ = new Subject<TagClick>();
  readonly timeRangeChanged$ = new Subject<TimeRange>();

  emitTagsSelected(selection: TagSelection): void {
    this.tagsSelected$.next(selection);
  }

  emitTagClicked(click: TagClick): void {
    this.tagClicked$.next(click);
  }

  emitTimeRangeChanged(range: TimeRange): void {
    this.timeRangeChanged$.next(range);
  }
}
