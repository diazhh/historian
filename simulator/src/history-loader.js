import { HISTORY_MONTHS, BATCH_SIZE, TAG_PROFILES } from './config.js';
import { generateAnalogSeries, generateDigitalSeries, resetSeed } from './signal-generator.js';

/**
 * Loads historical data into ThingsBoard for all devices/tags.
 *
 * Strategy:
 *  - For 6 months of history at reasonable intervals, we use coarser intervals
 *    for older data and finer for recent data (mimicking real historians).
 *  - Months 1-4: 5-minute intervals (~35K points per tag)
 *  - Months 5-6: 1-minute intervals (~87K points per tag)
 *  - Total per analog tag: ~122K points → sent in batches
 *
 * Data is sent via REST API in batches to avoid overwhelming TB.
 */

const FIVE_MIN = 5 * 60 * 1000;
const ONE_MIN = 60 * 1000;

export async function loadHistory(tb, deviceList) {
  const now = Date.now();
  const monthMs = 30 * 24 * 3600 * 1000;
  const historyStart = now - HISTORY_MONTHS * monthMs;
  const recentCutoff = now - 2 * monthMs; // last 2 months get finer resolution

  console.log(`\n[History] Generating ${HISTORY_MONTHS} months of data`);
  console.log(`  Coarse period: ${new Date(historyStart).toISOString()} → ${new Date(recentCutoff).toISOString()} (5-min)`);
  console.log(`  Fine period:   ${new Date(recentCutoff).toISOString()} → ${new Date(now).toISOString()} (1-min)`);

  let totalPointsSent = 0;
  let deviceIdx = 0;

  for (const dev of deviceList) {
    deviceIdx++;
    console.log(`\n[History] Device ${deviceIdx}/${deviceList.length}: ${dev.deviceName} (${dev.tags.length} tags)`);

    // Process tags in sub-batches to avoid huge memory usage
    // We'll generate data for a chunk of time, build the telemetry payload, and send it

    const timeChunks = buildTimeChunks(historyStart, recentCutoff, now);

    for (const chunk of timeChunks) {
      const batchPayloads = []; // Array of { ts, values }

      // For each tag, generate data points in this time chunk
      for (const tag of dev.tags) {
        const profile = TAG_PROFILES[tag.profile];
        const isDigital = profile.dataType === 'integer';
        const intervalMs = chunk.interval;

        resetSeed(hashString(tag.key + chunk.label));

        const series = isDigital
          ? generateDigitalSeries(tag.key, tag.profile, chunk.start, chunk.end, intervalMs)
          : generateAnalogSeries(tag.key, tag.profile, chunk.start, chunk.end, intervalMs);

        for (const point of series) {
          batchPayloads.push({
            ts: point.ts,
            values: {
              [`${tag.key}.PV`]: point.pv,
              [`${tag.key}.Q`]: point.q,
            },
          });
        }
      }

      // Sort by timestamp for orderly ingestion
      batchPayloads.sort((a, b) => a.ts - b.ts);

      // Merge same-timestamp entries
      const merged = mergeByTimestamp(batchPayloads);

      // Send in batches
      const sent = await sendInBatches(tb, dev.deviceId, merged);
      totalPointsSent += sent;
      process.stdout.write(`  [${chunk.label}] ${sent} points sent\r`);
    }

    console.log(`  [Done] Device ${dev.deviceName} complete`);
  }

  console.log(`\n[History] Total: ${totalPointsSent.toLocaleString()} data points loaded`);
}

function buildTimeChunks(historyStart, recentCutoff, now) {
  const chunks = [];
  const weekMs = 7 * 24 * 3600 * 1000;

  // Coarse period: split into weekly chunks to keep memory manageable
  let t = historyStart;
  let chunkIdx = 0;
  while (t < recentCutoff) {
    const end = Math.min(t + weekMs, recentCutoff);
    chunks.push({
      start: t,
      end,
      interval: FIVE_MIN,
      label: `coarse-w${chunkIdx}`,
    });
    t = end;
    chunkIdx++;
  }

  // Fine period: split into daily chunks
  const dayMs = 24 * 3600 * 1000;
  t = recentCutoff;
  chunkIdx = 0;
  while (t < now) {
    const end = Math.min(t + dayMs, now);
    chunks.push({
      start: t,
      end,
      interval: ONE_MIN,
      label: `fine-d${chunkIdx}`,
    });
    t = end;
    chunkIdx++;
  }

  return chunks;
}

function mergeByTimestamp(payloads) {
  const map = new Map();
  for (const p of payloads) {
    const existing = map.get(p.ts);
    if (existing) {
      Object.assign(existing.values, p.values);
    } else {
      map.set(p.ts, { ts: p.ts, values: { ...p.values } });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.ts - b.ts);
}

async function sendInBatches(tb, deviceId, payloads) {
  let sent = 0;
  for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
    const batch = payloads.slice(i, i + BATCH_SIZE);
    try {
      await tb.sendTelemetry(deviceId, batch);
      sent += batch.length;
    } catch (err) {
      // If batch too large, try smaller chunks
      if (err.response?.status === 413 || err.response?.status === 400) {
        const halfSize = Math.ceil(batch.length / 2);
        for (let j = 0; j < batch.length; j += halfSize) {
          const subBatch = batch.slice(j, j + halfSize);
          await tb.sendTelemetry(deviceId, subBatch);
          sent += subBatch.length;
        }
      } else {
        console.error(`\n  [Error] Batch send failed: ${err.message}`);
        // Wait and retry once
        await sleep(2000);
        try {
          await tb.sendTelemetry(deviceId, batch);
          sent += batch.length;
        } catch (retryErr) {
          console.error(`  [Error] Retry failed, skipping batch: ${retryErr.message}`);
        }
      }
    }
    // Throttle to avoid overwhelming TB
    if (i % (BATCH_SIZE * 10) === 0 && i > 0) {
      await sleep(100);
    }
  }
  return sent;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
