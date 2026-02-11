import { HISTORY_MONTHS, BATCH_SIZE, TAG_PROFILES } from './config.js';
import { generateAnalogSeries, generateDigitalSeries, resetSeed } from './signal-generator.js';

/**
 * Loads historical data into ThingsBoard for all Device-tags.
 *
 * Model: 1 Device = 1 Tag
 * Each device gets telemetry with keys: PV, Q (no prefix)
 *
 * Optimized strategy:
 *  - Months 1-5:  15-minute intervals
 *  - Last month:   5-minute intervals
 *  - Sent in 2-week / 1-week chunks via REST
 */

const FIFTEEN_MIN = 15 * 60 * 1000;
const FIVE_MIN = 5 * 60 * 1000;

export async function loadHistory(tb, deviceList) {
  const now = Date.now();
  const monthMs = 30 * 24 * 3600 * 1000;
  const historyStart = now - HISTORY_MONTHS * monthMs;
  const recentCutoff = now - 1 * monthMs;

  console.log(`\n[History] Generating ${HISTORY_MONTHS} months of data for ${deviceList.length} tags`);
  console.log(`  Coarse period: ${new Date(historyStart).toISOString()} → ${new Date(recentCutoff).toISOString()} (15-min)`);
  console.log(`  Fine period:   ${new Date(recentCutoff).toISOString()} → ${new Date(now).toISOString()} (5-min)`);

  let totalPointsSent = 0;
  let tagIdx = 0;
  const startTime = Date.now();
  const timeChunks = buildTimeChunks(historyStart, recentCutoff, now);

  for (const dev of deviceList) {
    tagIdx++;
    const devStart = Date.now();
    const profile = TAG_PROFILES[dev.profileName];
    const isDigital = profile.dataType === 'integer';

    let devPoints = 0;

    // Generate all chunks for this tag and merge into one payload array
    const allPayloads = [];
    for (const chunk of timeChunks) {
      resetSeed(hashString(dev.tagName + chunk.label));

      const series = isDigital
        ? generateDigitalSeries(dev.tagName, dev.profileName, chunk.start, chunk.end, chunk.interval)
        : generateAnalogSeries(dev.tagName, dev.profileName, chunk.start, chunk.end, chunk.interval);

      for (const pt of series) {
        allPayloads.push({ ts: pt.ts, values: { PV: pt.pv, Q: pt.q } });
      }
    }

    // Send all data for this tag in batches
    devPoints = await sendInBatches(tb, dev.deviceId, allPayloads);
    totalPointsSent += devPoints;

    if (tagIdx % 10 === 0 || tagIdx === 1 || tagIdx === deviceList.length) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      const rate = totalPointsSent / Math.max(1, (Date.now() - startTime) / 1000);
      console.log(`  [${tagIdx}/${deviceList.length}] ${dev.tagName}: ${devPoints.toLocaleString()} pts | total: ${totalPointsSent.toLocaleString()} | ${elapsed}min | ~${rate.toFixed(0)} pts/s`);
    }
  }

  console.log(`\n[History] Total: ${totalPointsSent.toLocaleString()} data points loaded`);
}

function buildTimeChunks(historyStart, recentCutoff, now) {
  const chunks = [];
  const twoWeekMs = 14 * 24 * 3600 * 1000;

  // Coarse period: 2-week chunks
  let t = historyStart;
  let chunkIdx = 0;
  while (t < recentCutoff) {
    const end = Math.min(t + twoWeekMs, recentCutoff);
    chunks.push({ start: t, end, interval: FIFTEEN_MIN, label: `c${chunkIdx}` });
    t = end;
    chunkIdx++;
  }

  // Fine period: weekly chunks
  const weekMs = 7 * 24 * 3600 * 1000;
  t = recentCutoff;
  chunkIdx = 0;
  while (t < now) {
    const end = Math.min(t + weekMs, now);
    chunks.push({ start: t, end, interval: FIVE_MIN, label: `f${chunkIdx}` });
    t = end;
    chunkIdx++;
  }

  return chunks;
}

async function sendInBatches(tb, deviceId, payloads) {
  let sent = 0;
  const batchSize = BATCH_SIZE;
  for (let i = 0; i < payloads.length; i += batchSize) {
    const batch = payloads.slice(i, i + batchSize);
    try {
      await tb.sendTelemetry(deviceId, batch);
      sent += batch.length;
    } catch (err) {
      if (err.response?.status === 413 || err.response?.status === 400) {
        const quarter = Math.ceil(batch.length / 4);
        for (let j = 0; j < batch.length; j += quarter) {
          const sub = batch.slice(j, j + quarter);
          try {
            await tb.sendTelemetry(deviceId, sub);
            sent += sub.length;
          } catch (subErr) {
            console.error(`\n  [Error] Sub-batch failed: ${subErr.message}`);
          }
        }
      } else {
        console.error(`\n  [Error] Batch send failed: ${err.message}`);
        await sleep(3000);
        try {
          await tb.sendTelemetry(deviceId, batch);
          sent += batch.length;
        } catch (retryErr) {
          console.error(`  [Error] Retry failed, skipping: ${retryErr.message}`);
        }
      }
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
