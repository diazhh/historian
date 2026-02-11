import { TAG_PROFILES, QUALITY } from './config.js';

/**
 * Generates realistic industrial process signals.
 *
 * Combines several patterns:
 * - Base operating point with slow drift (process changes)
 * - Diurnal cycle (temperature-dependent processes)
 * - Random noise (sensor noise)
 * - Occasional step changes (setpoint changes, batch starts)
 * - Occasional sensor failures (quality = BAD)
 * - Maintenance windows (quality = NOT_CONNECTED)
 */

// Deterministic seed for reproducible data
let seed = 42;
function seededRandom() {
  seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF;
  return (seed >>> 0) / 0xFFFFFFFF;
}

export function resetSeed(s = 42) {
  seed = s;
}

/**
 * Generate a timeseries for one analog tag over a time range.
 * Returns array of { ts, pv, q } objects.
 */
export function generateAnalogSeries(tagKey, profileName, startMs, endMs, intervalMs) {
  const profile = TAG_PROFILES[profileName];
  const range = profile.rangeHi - profile.rangeLo;
  const typical = profile.typical;
  const noiseAmp = range * 0.005; // 0.5% noise
  const driftAmp = range * 0.08;  // 8% slow drift
  const diurnalAmp = range * 0.03; // 3% diurnal

  // Per-tag offsets for variety
  const tagHash = hashString(tagKey);
  const phaseOffset = (tagHash % 1000) / 1000 * Math.PI * 2;
  const driftPhase = ((tagHash >> 10) % 1000) / 1000 * Math.PI * 2;
  const baseOffset = ((tagHash >> 20) % 100) / 100 * range * 0.1 - range * 0.05;

  // Step change schedule: pick 3-8 random times for setpoint changes
  const numSteps = 3 + (tagHash % 6);
  const totalSpan = endMs - startMs;
  const stepTimes = [];
  for (let i = 0; i < numSteps; i++) {
    stepTimes.push(startMs + ((tagHash * (i + 7)) % totalSpan));
  }
  stepTimes.sort((a, b) => a - b);
  const stepValues = stepTimes.map((_, i) =>
    (seededRandom() - 0.5) * range * 0.15
  );

  // Failure windows: 1-3 periods of BAD quality (sensor failure)
  const numFailures = 1 + (tagHash % 3);
  const failureWindows = [];
  for (let i = 0; i < numFailures; i++) {
    const fStart = startMs + (((tagHash * 31 + i * 997) & 0x7FFFFFFF) % totalSpan);
    const fDuration = 600_000 + (((tagHash * 17 + i * 503) & 0x7FFFFFFF) % 7_200_000); // 10min - 2h
    failureWindows.push({ start: fStart, end: fStart + fDuration });
  }

  // Monthly maintenance window (8h each, different day per tag)
  const maintWindows = [];
  const monthMs = 30 * 86400_000;
  for (let m = 0; m < 7; m++) {
    const mStart = startMs + m * monthMs + ((tagHash + m * 137) % (28 * 86400_000));
    if (mStart < endMs) {
      maintWindows.push({ start: mStart, end: mStart + 8 * 3600_000 });
    }
  }

  const series = [];
  let currentStep = 0;

  for (let ts = startMs; ts <= endMs; ts += intervalMs) {
    // Check maintenance windows
    const inMaint = maintWindows.some(w => ts >= w.start && ts <= w.end);
    if (inMaint) {
      series.push({ ts, pv: null, q: QUALITY.NOT_CONNECTED });
      continue;
    }

    // Check failure windows
    const inFailure = failureWindows.some(w => ts >= w.start && ts <= w.end);
    if (inFailure) {
      // During failure, value freezes at last known + random spike
      const lastPv = series.length > 0 ? (series[series.length - 1].pv ?? typical) : typical;
      series.push({ ts, pv: lastPv, q: QUALITY.SENSOR_FAILURE });
      continue;
    }

    // Time fractions
    const tFrac = (ts - startMs) / totalSpan;
    const hourOfDay = ((ts % 86400_000) / 3600_000);

    // Slow drift (period ~45 days)
    const drift = Math.sin(tFrac * Math.PI * 2 * (totalSpan / (45 * 86400_000)) + driftPhase) * driftAmp;

    // Diurnal cycle
    const diurnal = Math.sin((hourOfDay / 24) * Math.PI * 2 - Math.PI / 2 + phaseOffset) * diurnalAmp;

    // Step changes
    while (currentStep < stepTimes.length && ts >= stepTimes[currentStep]) {
      currentStep++;
    }
    const stepAccum = stepValues.slice(0, currentStep).reduce((a, b) => a + b, 0);

    // Noise
    const noise = (seededRandom() - 0.5) * 2 * noiseAmp;

    // Compose
    let pv = typical + baseOffset + drift + diurnal + stepAccum + noise;

    // Clamp to range
    pv = Math.max(profile.rangeLo, Math.min(profile.rangeHi, pv));

    // Round to reasonable precision
    pv = Math.round(pv * 100) / 100;

    // Quality: mostly good, occasional uncertain near range limits
    let q = QUALITY.GOOD;
    if (pv < profile.rangeLo + range * 0.02 || pv > profile.rangeHi - range * 0.02) {
      q = QUALITY.UNCERTAIN;
    }

    series.push({ ts, pv, q });
  }

  return series;
}

/**
 * Generate a timeseries for one digital tag over a time range.
 * Digital tags switch between 0/1 with realistic patterns.
 */
export function generateDigitalSeries(tagKey, profileName, startMs, endMs, intervalMs) {
  const tagHash = hashString(tagKey);
  const totalSpan = endMs - startMs;

  // Average toggle frequency: every 2-24 hours
  const avgToggleMs = (2 + (tagHash % 22)) * 3600_000;
  const numToggles = Math.floor(totalSpan / avgToggleMs);

  // Generate toggle times
  const toggleTimes = [];
  for (let i = 0; i < numToggles; i++) {
    toggleTimes.push(startMs + (((tagHash * (i + 3) * 1013) & 0x7FFFFFFF) % totalSpan));
  }
  toggleTimes.sort((a, b) => a - b);

  const series = [];
  let state = tagHash % 2; // initial state
  let toggleIdx = 0;

  for (let ts = startMs; ts <= endMs; ts += intervalMs) {
    while (toggleIdx < toggleTimes.length && ts >= toggleTimes[toggleIdx]) {
      state = state === 0 ? 1 : 0;
      toggleIdx++;
    }
    series.push({ ts, pv: state, q: QUALITY.GOOD });
  }

  return series;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
