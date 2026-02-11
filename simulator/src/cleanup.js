/**
 * Removes all simulator-created entities from ThingsBoard.
 * Deletes devices first (to remove relations), then assets bottom-up.
 */
export async function cleanupAll(tb) {
  console.log('[Cleanup] Removing simulator entities...\n');

  // Delete devices of type 'Instrumentos'
  const devices = await tb.getAllDevicesByType('Instrumentos');
  console.log(`  Found ${devices.length} devices to delete`);
  for (const d of devices) {
    await tb.deleteDevice(d.id.id);
    console.log(`    Deleted device: ${d.name}`);
  }

  // Delete assets bottom-up: Equipment → Area → Site
  for (const type of ['Equipo', 'AreaProceso', 'Sitio']) {
    const assets = await tb.getAllAssetsByType(type);
    console.log(`  Found ${assets.length} assets of type '${type}' to delete`);
    for (const a of assets) {
      await tb.deleteAsset(a.id.id);
      console.log(`    Deleted asset: ${a.name}`);
    }
  }

  console.log('\n[Cleanup] Done');
}
