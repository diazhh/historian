import { Injectable } from '@angular/core';
import { TagConfig, TagConfigMap, AlarmLimits } from '../models/tag.model';

@Injectable()
export class TagMetadataService {
  private cache: Map<string, TagConfigMap> = new Map();

  async getTagConfig(ctx: any, deviceId: string): Promise<TagConfigMap> {
    if (this.cache.has(deviceId)) {
      return this.cache.get(deviceId)!;
    }

    const attrs = await ctx.attributeService.getEntityAttributes(
      { entityType: 'DEVICE', id: deviceId },
      'CLIENT_SCOPE',
      ['tagConfig']
    ).toPromise();

    const tagConfigAttr = attrs?.find((a: any) => a.key === 'tagConfig');
    let config: TagConfigMap = {};
    if (tagConfigAttr) {
      try {
        config = typeof tagConfigAttr.value === 'string'
          ? JSON.parse(tagConfigAttr.value)
          : tagConfigAttr.value;
      } catch {
        config = {};
      }
    }
    this.cache.set(deviceId, config);
    return config;
  }

  invalidateCache(deviceId?: string): void {
    if (deviceId) {
      this.cache.delete(deviceId);
    } else {
      this.cache.clear();
    }
  }

  getEngUnits(config: TagConfigMap, tagKey: string): string {
    return config?.[tagKey]?.engUnits || '';
  }

  isStep(config: TagConfigMap, tagKey: string): boolean {
    return config?.[tagKey]?.stepFlag === true;
  }

  getDataType(config: TagConfigMap, tagKey: string): string {
    return config?.[tagKey]?.dataType || 'FLOAT';
  }

  getAlarmLimits(config: TagConfigMap, tagKey: string): AlarmLimits {
    const tag = config?.[tagKey];
    return {
      hh: tag?.alarmHH ?? null,
      h: tag?.alarmH ?? null,
      l: tag?.alarmL ?? null,
      ll: tag?.alarmLL ?? null,
    };
  }

  getDigitalStates(config: TagConfigMap, tagKey: string): Record<string, string> | undefined {
    return config?.[tagKey]?.digitalStates;
  }
}
