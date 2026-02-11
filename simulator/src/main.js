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
    deviceName: d.deviceName,
    accessToken: d.accessToken,
    areaName: d.areaName,
    equipName: d.equipName,
    tags: d.tags,
  }));
  writeFileSync(STATE_FILE, JSON.stringify(serializable, null, 2));
  console.log(`[State] Saved to ${STATE_FILE}`);
}

function loadState() {
  if (!existsSync(STATE_FILE)) return null;
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}

async function main() {
  const { step } = parseArgs();
  const tb = new TbClient();

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Historian Simulator for ThingsBoard PE     ║');
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

  // Step 1: Build hierarchy
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
    console.log(`[State] Loaded ${deviceList.length} devices from state file`);
  }

  // Step 2: Generate tag configs (already done in hierarchy builder)
  if (step === 'tags') {
    // Re-push tagConfig attributes for all devices
    for (const dev of deviceList) {
      const tagConfig = {};
      for (const tag of dev.tags) {
        tagConfig[tag.key] = tag.meta;
      }
      await tb.setClientAttributes(dev.deviceId, { tagConfig });
      console.log(`[Tags] Updated tagConfig for ${dev.deviceName}`);
    }
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
    await startRealtimeSimulation(deviceList);
  }
}

main().catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});
