import mqtt from 'mqtt';
import { MQTT_HOST, MQTT_PORT, TELEMETRY_INTERVAL_MS, TAG_PROFILES, QUALITY } from './config.js';

/**
 * Realtime simulation using MQTT Gateway pattern.
 *
 * Instead of 500 individual MQTT connections (one per Device-tag),
 * we use a single Gateway Device that publishes for all tags via:
 *   - v1/gateway/telemetry  (telemetry for multiple devices in one message)
 *
 * This requires creating a Gateway Device in TB. The simulator creates
 * it automatically or connects to an existing one.
 *
 * If Gateway pattern fails, falls back to individual connections.
 */

export async function startRealtimeSimulation(deviceList, tb) {
  console.log(`\n[Realtime] Starting simulation for ${deviceList.length} tags`);
  console.log(`  Interval: ${TELEMETRY_INTERVAL_MS}ms`);
  console.log(`  MQTT: ${MQTT_HOST}:${MQTT_PORT}`);

  // Try Gateway pattern first
  const gatewayToken = await getOrCreateGateway(tb);

  if (gatewayToken) {
    await startGatewaySimulation(deviceList, gatewayToken);
  } else {
    console.log('  [Warning] Gateway not available, using individual connections');
    await startIndividualSimulation(deviceList);
  }
}

async function getOrCreateGateway(tb) {
  if (!tb) return null;
  try {
    let gw = await tb.findDeviceByName('SimulatorGateway');
    if (!gw) {
      // Create gateway device
      gw = await tb.createDevice('SimulatorGateway', 'Gateway', 'Simulator MQTT Gateway');
      // Mark it as gateway
      await tb.http.post('/api/device', {
        ...gw,
        additionalInfo: { ...gw.additionalInfo, gateway: true },
      });
      console.log('  [Gateway] Created SimulatorGateway device');
    }
    const creds = await tb.getDeviceCredentials(gw.id.id);
    return creds.credentialsId;
  } catch (err) {
    console.log(`  [Gateway] Setup failed: ${err.message}`);
    return null;
  }
}

async function startGatewaySimulation(deviceList, gatewayToken) {
  console.log('  [Gateway] Connecting single MQTT gateway...');

  const client = mqtt.connect(`mqtt://${MQTT_HOST}:${MQTT_PORT}`, {
    username: gatewayToken,
    clientId: 'sim-gateway',
  });

  await new Promise((resolve, reject) => {
    client.on('connect', () => {
      console.log('  [Gateway] Connected');
      resolve();
    });
    client.on('error', reject);
    setTimeout(() => reject(new Error('Gateway MQTT connection timeout')), 10000);
  });

  // Track live state per tag
  const tagState = {};
  for (const dev of deviceList) {
    const profile = TAG_PROFILES[dev.profileName];
    tagState[dev.tagName] = {
      value: profile.typical + (Math.random() - 0.5) * (profile.rangeHi - profile.rangeLo) * 0.1,
      profileName: dev.profileName,
    };
  }

  // Publish all tags in batches via gateway topic
  const interval = setInterval(() => {
    // Gateway telemetry format: { "DeviceName": [{ ts, values }], ... }
    const payload = {};

    for (const dev of deviceList) {
      const state = tagState[dev.tagName];
      const profile = TAG_PROFILES[state.profileName];
      const range = profile.rangeHi - profile.rangeLo;

      let pv;
      if (profile.dataType === 'integer') {
        if (Math.random() < 0.005) {
          state.value = state.value === 0 ? 1 : 0;
        }
        pv = state.value;
      } else {
        const noise = (Math.random() - 0.5) * range * 0.01;
        const reversion = (profile.typical - state.value) * 0.002;
        state.value += noise + reversion;
        state.value = Math.max(profile.rangeLo, Math.min(profile.rangeHi, state.value));
        pv = Math.round(state.value * 100) / 100;
      }

      payload[dev.tagName] = [{ ts: Date.now(), values: { PV: pv, Q: QUALITY.GOOD } }];
    }

    // Gateway accepts max ~256KB per message, split if needed
    const tagNames = Object.keys(payload);
    const chunkSize = 100; // 100 tags per message
    for (let i = 0; i < tagNames.length; i += chunkSize) {
      const chunk = {};
      for (let j = i; j < Math.min(i + chunkSize, tagNames.length); j++) {
        chunk[tagNames[j]] = payload[tagNames[j]];
      }
      client.publish('v1/gateway/telemetry', JSON.stringify(chunk));
    }
  }, TELEMETRY_INTERVAL_MS);

  console.log('  Press Ctrl+C to stop\n');

  process.on('SIGINT', () => {
    console.log('\n[Realtime] Stopping...');
    clearInterval(interval);
    client.end(false, () => {
      console.log('  [Gateway] Disconnected');
    });
    setTimeout(() => process.exit(0), 2000);
  });

  await new Promise(() => {});
}

async function startIndividualSimulation(deviceList) {
  console.log(`  Connecting ${deviceList.length} individual MQTT clients...`);
  const clients = [];

  for (const dev of deviceList) {
    const client = mqtt.connect(`mqtt://${MQTT_HOST}:${MQTT_PORT}`, {
      username: dev.accessToken,
      clientId: `sim-${dev.tagName}`,
    });

    client.on('error', (err) => {
      console.error(`  [MQTT] ${dev.tagName} error: ${err.message}`);
    });

    const profile = TAG_PROFILES[dev.profileName];
    let value = profile.typical + (Math.random() - 0.5) * (profile.rangeHi - profile.rangeLo) * 0.1;

    const interval = setInterval(() => {
      const range = profile.rangeHi - profile.rangeLo;
      let pv;

      if (profile.dataType === 'integer') {
        if (Math.random() < 0.005) value = value === 0 ? 1 : 0;
        pv = value;
      } else {
        const noise = (Math.random() - 0.5) * range * 0.01;
        const reversion = (profile.typical - value) * 0.002;
        value += noise + reversion;
        value = Math.max(profile.rangeLo, Math.min(profile.rangeHi, value));
        pv = Math.round(value * 100) / 100;
      }

      client.publish('v1/devices/me/telemetry', JSON.stringify({ PV: pv, Q: QUALITY.GOOD }));
    }, TELEMETRY_INTERVAL_MS);

    clients.push({ client, interval, tagName: dev.tagName });
  }

  console.log('  Press Ctrl+C to stop\n');

  process.on('SIGINT', () => {
    console.log('\n[Realtime] Stopping...');
    for (const { client, interval } of clients) {
      clearInterval(interval);
      client.end();
    }
    setTimeout(() => process.exit(0), 2000);
  });

  await new Promise(() => {});
}
