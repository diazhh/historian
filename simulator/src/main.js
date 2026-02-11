import { TbClient } from './tb-client.js';
import { buildHierarchy } from './hierarchy-builder.js';
import { loadHistory } from './history-loader.js';
import { startRealtimeSimulation } from './realtime-simulator.js';
import { cleanupAll } from './cleanup.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = resolve(__dirname, '..', '.simulator-state.json');

function parseArgs() {
  const args = process.argv.slice(2);
  const stepIdx = args.indexOf('--step');
  return {
    step: stepIdx >= 0 ? args[stepIdx + 1] : 'all',
  };
}

function saveState(deviceList) {
  const serializable = deviceList.map(d => ({
    deviceId: d.deviceId,
    tagName: d.tagName,
    accessToken: d.accessToken,
    profileName: d.profileName,
    areaName: d.areaName,
    equipName: d.equipName,
  }));
  writeFileSync(STATE_FILE, JSON.stringify(serializable, null, 2));
  console.log(`[State] Saved ${serializable.length} tags to ${STATE_FILE}`);
}

function loadState() {
  if (!existsSync(STATE_FILE)) return null;
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}

async function main() {
  const { step } = parseArgs();
  const tb = new TbClient();

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Historian Simulator — 1 Device = 1 Tag     ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  try {
    await tb.login();
  } catch (err) {
    console.error(`[Fatal] Cannot connect to ThingsBoard: ${err.message}`);
    console.error(`  URL: ${tb.http.defaults.baseURL}`);
    console.error('  Check TB_URL, TB_USER, TB_PASSWORD in .env');
    process.exit(1);
  }

  if (step === 'cleanup') {
    await cleanupAll(tb);
    return;
  }

  // Step 1: Build hierarchy (assets + 500 Device-tags)
  let deviceList;
  if (step === 'all' || step === 'hierarchy') {
    deviceList = await buildHierarchy(tb);
    saveState(deviceList);
    if (step === 'hierarchy') return;
  }

  // Load state if running a later step
  if (!deviceList) {
    deviceList = loadState();
    if (!deviceList) {
      console.error('[Error] No state found. Run --step hierarchy first, or run without --step for full setup.');
      process.exit(1);
    }
    console.log(`[State] Loaded ${deviceList.length} Device-tags from state file`);
  }

  // Step 2: Re-push attributes (useful after config changes)
  if (step === 'attrs') {
    const { flattenPlantTags } = await import('./config.js');
    const tagDefs = flattenPlantTags();
    const tagMap = {};
    for (const t of tagDefs) tagMap[t.tagName] = t.attributes;

    for (const dev of deviceList) {
      const attrs = tagMap[dev.tagName];
      if (attrs) {
        await tb.setClientAttributes(dev.deviceId, attrs);
      }
    }
    console.log(`[Attrs] Updated attributes for ${deviceList.length} Device-tags`);
    return;
  }

  // Step 3: Load historical data
  if (step === 'all' || step === 'history') {
    const startTime = Date.now();
    await loadHistory(tb, deviceList);
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`[History] Completed in ${elapsed} minutes`);
    if (step === 'history') return;
  }

  // Step 4: Start realtime simulation
  if (step === 'all' || step === 'realtime') {
    await startRealtimeSimulation(deviceList, tb);
  }
}

main().catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});
