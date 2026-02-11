import mqtt from 'mqtt';
import { MQTT_HOST, MQTT_PORT, TELEMETRY_INTERVAL_MS, TAG_PROFILES, QUALITY } from './config.js';

/**
 * Connects one MQTT client per device and publishes live telemetry
 * at the configured interval. Simulates a real data collector.
 */
export async function startRealtimeSimulation(deviceList) {
  console.log(`\n[Realtime] Starting simulation for ${deviceList.length} devices`);
  console.log(`  Interval: ${TELEMETRY_INTERVAL_MS}ms`);
  console.log(`  MQTT: ${MQTT_HOST}:${MQTT_PORT}`);
  console.log('  Press Ctrl+C to stop\n');

  const clients = [];

  for (const dev of deviceList) {
    const client = mqtt.connect(`mqtt://${MQTT_HOST}:${MQTT_PORT}`, {
      username: dev.accessToken,
      clientId: `sim-${dev.deviceName}`,
    });

    client.on('connect', () => {
      console.log(`  [MQTT] ${dev.deviceName} connected`);
    });

    client.on('error', (err) => {
      console.error(`  [MQTT] ${dev.deviceName} error: ${err.message}`);
    });

    // Track live state per tag
    const tagState = {};
    for (const tag of dev.tags) {
      const profile = TAG_PROFILES[tag.profile];
      tagState[tag.key] = {
        value: profile.typical + (Math.random() - 0.5) * (profile.rangeHi - profile.rangeLo) * 0.1,
        profile: tag.profile,
      };
    }

    // Publish telemetry at interval
    const interval = setInterval(() => {
      const values = {};
      for (const tag of dev.tags) {
        const state = tagState[tag.key];
        const profile = TAG_PROFILES[state.profile];
        const range = profile.rangeHi - profile.rangeLo;

        if (profile.dataType === 'integer') {
          // Digital: occasional toggle
          if (Math.random() < 0.005) { // ~0.5% chance per scan
            state.value = state.value === 0 ? 1 : 0;
          }
          values[`${tag.key}.PV`] = state.value;
          values[`${tag.key}.Q`] = QUALITY.GOOD;
        } else {
          // Analog: random walk with mean reversion
          const noise = (Math.random() - 0.5) * range * 0.01;
          const reversion = (profile.typical - state.value) * 0.002;
          state.value += noise + reversion;
          state.value = Math.max(profile.rangeLo, Math.min(profile.rangeHi, state.value));

          const pv = Math.round(state.value * 100) / 100;
          values[`${tag.key}.PV`] = pv;
          values[`${tag.key}.Q`] = QUALITY.GOOD;
        }
      }

      client.publish('v1/devices/me/telemetry', JSON.stringify(values));
    }, TELEMETRY_INTERVAL_MS);

    clients.push({ client, interval, deviceName: dev.deviceName });
  }

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[Realtime] Stopping...');
    for (const { client, interval, deviceName } of clients) {
      clearInterval(interval);
      client.end(false, () => {
        console.log(`  [MQTT] ${deviceName} disconnected`);
      });
    }
    setTimeout(() => process.exit(0), 2000);
  });

  // Keep alive
  await new Promise(() => {});
}
