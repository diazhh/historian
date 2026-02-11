import { PLANT_MODEL, TAG_PROFILES, QUALITY } from './config.js';

/**
 * Creates the full asset hierarchy in ThingsBoard:
 *   Site (Asset) → Area (Asset) → Equipment (Asset) → Device (Instruments)
 * Then sets tagConfig client attributes on each device.
 *
 * Returns a flat list of { device, accessToken, tags[] } for the data generator.
 */
export async function buildHierarchy(tb) {
  const plant = PLANT_MODEL;
  const deviceList = [];

  // 1. Create or find Site asset
  const site = await getOrCreateAsset(tb, plant.name, plant.type, plant.label);
  console.log(`[Hierarchy] Site: ${plant.name} (${site.id.id})`);

  for (const areaDef of plant.areas) {
    // 2. Create Area asset, relate to Site
    const area = await getOrCreateAsset(tb, areaDef.name, areaDef.type, areaDef.label);
    await tb.createRelation('ASSET', site.id.id, 'ASSET', area.id.id, 'Contains');
    console.log(`  [Area] ${areaDef.name}`);

    for (const eqDef of areaDef.equipment) {
      // 3. Create Equipment asset, relate to Area
      const equip = await getOrCreateAsset(tb, eqDef.name, eqDef.type, eqDef.label);
      await tb.createRelation('ASSET', area.id.id, 'ASSET', equip.id.id, 'Contains');
      console.log(`    [Equip] ${eqDef.name}`);

      for (const instDef of eqDef.instruments) {
        // 4. Create Device, relate to Equipment
        const device = await getOrCreateDevice(tb, instDef.name, 'Instrumentos', instDef.label);
        await tb.createRelation('ASSET', equip.id.id, 'DEVICE', device.id.id, 'Contains');
        const creds = await tb.getDeviceCredentials(device.id.id);

        // 5. Generate tags for this device
        const profile = TAG_PROFILES[instDef.profile];
        const tags = generateTags(instDef, profile, areaDef.name, eqDef.name);

        // 6. Set tagConfig client attribute
        const tagConfig = {};
        for (const tag of tags) {
          tagConfig[tag.key] = tag.meta;
        }
        await tb.setClientAttributes(device.id.id, { tagConfig });

        deviceList.push({
          deviceId: device.id.id,
          deviceName: instDef.name,
          accessToken: creds.credentialsId,
          areaName: areaDef.name,
          equipName: eqDef.name,
          tags,
        });

        console.log(`      [Device] ${instDef.name} — ${tags.length} tags`);
      }
    }
  }

  const totalTags = deviceList.reduce((sum, d) => sum + d.tags.length, 0);
  console.log(`\n[Hierarchy] Complete: ${deviceList.length} devices, ${totalTags} tags total`);
  return deviceList;
}

function generateTags(instDef, profile, areaName, equipName) {
  const tags = [];
  for (let i = 1; i <= instDef.count; i++) {
    const idx = String(i).padStart(2, '0');
    const key = `${instDef.tagPrefix}${idx}`;
    const meta = {
      description: `${instDef.label} #${i}`,
      engUnits: profile.engUnits,
      dataType: profile.dataType,
      rangeLo: profile.rangeLo,
      rangeHi: profile.rangeHi,
      typicalValue: profile.typical,
      scanRateMs: profile.scanRate,
      stepFlag: profile.step,
      instrumentTag: key,
      area: areaName,
      equipment: equipName,
      instrumentType: profile.instrumentType,
      deadbandValue: profile.deadband,
      deadbandType: profile.deadbandType,
      alarmHH: profile.alarm?.HH ?? null,
      alarmH: profile.alarm?.H ?? null,
      alarmL: profile.alarm?.L ?? null,
      alarmLL: profile.alarm?.LL ?? null,
    };
    if (profile.digitalStates) {
      meta.digitalStates = profile.digitalStates;
    }
    tags.push({ key, meta, profile: instDef.profile });
  }
  return tags;
}

async function getOrCreateAsset(tb, name, type, label) {
  let asset = await tb.findAssetByName(name);
  if (!asset) {
    asset = await tb.createAsset(name, type, label);
  }
  return asset;
}

async function getOrCreateDevice(tb, name, type, label) {
  let device = await tb.findDeviceByName(name);
  if (!device) {
    device = await tb.createDevice(name, type, label);
  }
  return device;
}
