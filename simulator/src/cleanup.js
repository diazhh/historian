/**
 * Removes all simulator-created entities from ThingsBoard.
 * Deletes Device-tags first (type "Tag"), then assets bottom-up.
 * Also removes the SimulatorGateway device if present.
 */
export async function cleanupAll(tb) {
  console.log('[Cleanup] Removing simulator entities...\n');

  // Delete Device-tags (type "Tag")
  const tags = await tb.getAllDevicesByType('Tag');
  console.log(`  Found ${tags.length} Device-tags to delete`);
  for (const d of tags) {
    await tb.deleteDevice(d.id.id);
  }
  if (tags.length > 0) console.log(`    Deleted ${tags.length} Device-tags`);

  // Delete SimulatorGateway if exists
  const gw = await tb.findDeviceByName('SimulatorGateway');
  if (gw) {
    await tb.deleteDevice(gw.id.id);
    console.log('    Deleted SimulatorGateway');
  }

  // Delete assets bottom-up: Equipment → Area → Site
  for (const type of ['Equipo', 'AreaProceso', 'Sitio']) {
    const assets = await tb.getAllAssetsByType(type);
    console.log(`  Found ${assets.length} assets of type '${type}' to delete`);
    for (const a of assets) {
      await tb.deleteAsset(a.id.id);
    }
    if (assets.length > 0) console.log(`    Deleted ${assets.length} assets`);
  }

  console.log('\n[Cleanup] Done');
}
