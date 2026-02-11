import { PLANT_MODEL, flattenPlantTags } from './config.js';

/**
 * Creates the full asset hierarchy + individual Device-tags in ThingsBoard.
 *
 * Model: 1 Device = 1 Tag
 *   Site (Asset) → Area (Asset) → Equipment (Asset) → Device-Tag
 *
 * Each tag becomes its own Device with:
 *   - name = tag name (e.g. "DA101.T01")
 *   - type = "Tag"
 *   - label = human-readable description
 *   - flat SHARED_SCOPE attributes (engUnits, rangeLo, rangeHi, alarms, etc.)
 *
 * Returns a flat list of { deviceId, tagName, accessToken, profileName, areaName, equipName }
 */
export async function buildHierarchy(tb) {
  const plant = PLANT_MODEL;
  const tagDefs = flattenPlantTags();
  const deviceList = [];

  // 1. Create or find Site asset
  const site = await getOrCreateAsset(tb, plant.name, plant.type, plant.label);
  console.log(`[Hierarchy] Site: ${plant.name} (${site.id.id})`);

  // 2. Create Area and Equipment assets (keep hierarchy for navigation)
  const equipAssetMap = {}; // equipName → assetId

  for (const areaDef of plant.areas) {
    const area = await getOrCreateAsset(tb, areaDef.name, areaDef.type, areaDef.label);
    await tb.createRelation('ASSET', site.id.id, 'ASSET', area.id.id, 'Contains');
    console.log(`  [Area] ${areaDef.name}`);

    for (const eqDef of areaDef.equipment) {
      const equip = await getOrCreateAsset(tb, eqDef.name, eqDef.type, eqDef.label);
      await tb.createRelation('ASSET', area.id.id, 'ASSET', equip.id.id, 'Contains');
      equipAssetMap[eqDef.name] = equip.id.id;
      console.log(`    [Equip] ${eqDef.name}`);
    }
  }

  // 3. Create individual Device-tags and relate to their Equipment
  console.log(`\n[Hierarchy] Creating ${tagDefs.length} Device-tags...`);
  let created = 0;

  for (const tagDef of tagDefs) {
    const device = await getOrCreateDevice(tb, tagDef.tagName, 'Tag', tagDef.label);
    const equipAssetId = equipAssetMap[tagDef.equipName];

    // Relate Equipment → Device-tag
    await tb.createRelation('ASSET', equipAssetId, 'DEVICE', device.id.id, 'Contains');

    // Set flat attributes via SHARED_SCOPE (REST can't write CLIENT_SCOPE)
    await tb.setClientAttributes(device.id.id, tagDef.attributes);

    const creds = await tb.getDeviceCredentials(device.id.id);

    deviceList.push({
      deviceId: device.id.id,
      tagName: tagDef.tagName,
      accessToken: creds.credentialsId,
      profileName: tagDef.profileName,
      areaName: tagDef.areaName,
      equipName: tagDef.equipName,
    });

    created++;
    if (created % 50 === 0) {
      console.log(`    [Progress] ${created}/${tagDefs.length} tags created`);
    }
  }

  console.log(`\n[Hierarchy] Complete: ${deviceList.length} Device-tags created`);
  return deviceList;
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
