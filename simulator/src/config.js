import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually (no dotenv dependency)
const envPath = resolve(__dirname, '..', '.env');
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

function env(key, fallback) {
  return process.env[key] ?? fallback;
}

export const TB_URL = env('TB_URL', 'http://localhost:8080');
export const TB_USER = env('TB_USER', 'tenant@thingsboard.org');
export const TB_PASSWORD = env('TB_PASSWORD', 'tenant');
export const MQTT_HOST = env('MQTT_HOST', 'localhost');
export const MQTT_PORT = parseInt(env('MQTT_PORT', '1883'));
export const HISTORY_MONTHS = parseInt(env('HISTORY_MONTHS', '6'));
export const TAG_COUNT = parseInt(env('TAG_COUNT', '500'));
export const BATCH_SIZE = parseInt(env('BATCH_SIZE', '500'));
export const TELEMETRY_INTERVAL_MS = parseInt(env('TELEMETRY_INTERVAL_MS', '10000'));

// OPC-UA quality codes used by the historian
export const QUALITY = {
  GOOD: 192,
  BAD: 0,
  UNCERTAIN: 64,
  CONFIG_ERROR: 4,
  NOT_CONNECTED: 8,
  SENSOR_FAILURE: 12,
};

// ─── Plant model definition ──────────────────────────────────────────────
// Hierarchy: Site → Area → Equipment → Device-Tag (1 Device = 1 tag)
// Each instrument group expands to N individual Device-tags

export const PLANT_MODEL = {
  name: 'PlantaSur',
  label: 'Planta Sur - Refinería',
  type: 'Sitio',
  areas: [
    {
      name: 'Destilacion',
      label: 'Unidad de Destilación Atmosférica',
      type: 'AreaProceso',
      equipment: [
        { name: 'Torre-DA-101', label: 'Torre de Destilación Principal', type: 'Equipo',
          instruments: [
            { tagPrefix: 'DA101.T', count: 20, profile: 'temperature_tower', label: 'Temperatura Torre' },
            { tagPrefix: 'DA101.P', count: 12, profile: 'pressure_tower', label: 'Presión Torre' },
            { tagPrefix: 'DA101.F', count: 14, profile: 'flow', label: 'Flujo Torre' },
            { tagPrefix: 'DA101.L', count: 10, profile: 'level', label: 'Nivel Torre' },
          ]
        },
        { name: 'Horno-H-101', label: 'Horno de Precalentamiento', type: 'Equipo',
          instruments: [
            { tagPrefix: 'H101.T', count: 12, profile: 'temperature_furnace', label: 'Temperatura Horno' },
            { tagPrefix: 'H101.P', count: 4, profile: 'pressure_low', label: 'Presión Horno' },
            { tagPrefix: 'H101.FU', count: 6, profile: 'flow', label: 'Combustible Horno' },
            { tagPrefix: 'H101.A', count: 4, profile: 'analyzer', label: 'Analizador Gases Horno' },
          ]
        },
        { name: 'Intercamb-E-101', label: 'Tren de Intercambiadores', type: 'Equipo',
          instruments: [
            { tagPrefix: 'E101.T', count: 8, profile: 'temperature_exchanger', label: 'Temperatura Intercambiador' },
            { tagPrefix: 'E101.F', count: 6, profile: 'flow', label: 'Flujo Intercambiador' },
            { tagPrefix: 'E101.DP', count: 4, profile: 'pressure_diff', label: 'Presión Diferencial' },
          ]
        },
      ]
    },
    {
      name: 'Tratamiento',
      label: 'Unidad de Hidrotratamiento',
      type: 'AreaProceso',
      equipment: [
        { name: 'Reactor-R-201', label: 'Reactor de Hidrotratamiento', type: 'Equipo',
          instruments: [
            { tagPrefix: 'R201.T', count: 24, profile: 'temperature_reactor', label: 'Temperatura Reactor' },
            { tagPrefix: 'R201.P', count: 12, profile: 'pressure_high', label: 'Presión Reactor' },
            { tagPrefix: 'R201.F', count: 10, profile: 'flow', label: 'Flujo Reactor' },
            { tagPrefix: 'R201.A', count: 8, profile: 'analyzer', label: 'Analizador Reactor' },
          ]
        },
        { name: 'Separador-V-201', label: 'Separador de Alta Presión', type: 'Equipo',
          instruments: [
            { tagPrefix: 'V201.L', count: 4, profile: 'level', label: 'Nivel Separador' },
            { tagPrefix: 'V201.P', count: 4, profile: 'pressure_high', label: 'Presión Separador' },
            { tagPrefix: 'V201.T', count: 4, profile: 'temperature_vessel', label: 'Temperatura Separador' },
          ]
        },
        { name: 'Compresor-K-201', label: 'Compresor de Hidrógeno', type: 'Equipo',
          instruments: [
            { tagPrefix: 'K201.VIB', count: 6, profile: 'vibration', label: 'Vibración Compresor' },
            { tagPrefix: 'K201.T', count: 8, profile: 'temperature_motor', label: 'Temperatura Compresor' },
            { tagPrefix: 'K201.P', count: 4, profile: 'pressure_high', label: 'Presión Compresor' },
            { tagPrefix: 'K201.XV', count: 6, profile: 'digital_valve', label: 'Válvula Compresor' },
          ]
        },
      ]
    },
    {
      name: 'Almacenamiento',
      label: 'Parque de Tanques',
      type: 'AreaProceso',
      equipment: [
        { name: 'Tanque-TK-301', label: 'Tanque de Crudo', type: 'Equipo',
          instruments: [
            { tagPrefix: 'TK301.L', count: 5, profile: 'level_tank', label: 'Nivel Tanque Crudo' },
            { tagPrefix: 'TK301.T', count: 7, profile: 'temperature_tank', label: 'Temperatura Tanque Crudo' },
          ]
        },
        { name: 'Tanque-TK-302', label: 'Tanque de Nafta', type: 'Equipo',
          instruments: [
            { tagPrefix: 'TK302.L', count: 4, profile: 'level_tank', label: 'Nivel Tanque Nafta' },
            { tagPrefix: 'TK302.T', count: 4, profile: 'temperature_tank', label: 'Temperatura Tanque Nafta' },
          ]
        },
        { name: 'Tanque-TK-303', label: 'Tanque de Diesel', type: 'Equipo',
          instruments: [
            { tagPrefix: 'TK303.L', count: 4, profile: 'level_tank', label: 'Nivel Tanque Diesel' },
            { tagPrefix: 'TK303.T', count: 4, profile: 'temperature_tank', label: 'Temperatura Tanque Diesel' },
          ]
        },
        { name: 'Bombas-P-301', label: 'Estación de Bombeo', type: 'Equipo',
          instruments: [
            { tagPrefix: 'P301.F', count: 8, profile: 'flow', label: 'Flujo Bomba' },
            { tagPrefix: 'P301.P', count: 8, profile: 'pressure_low', label: 'Presión Bomba' },
            { tagPrefix: 'P301.M', count: 8, profile: 'digital_motor', label: 'Motor Bomba' },
            { tagPrefix: 'P301.VIB', count: 6, profile: 'vibration', label: 'Vibración Bomba' },
          ]
        },
      ]
    },
    {
      name: 'Servicios',
      label: 'Servicios Auxiliares',
      type: 'AreaProceso',
      equipment: [
        { name: 'Caldera-B-401', label: 'Caldera de Vapor', type: 'Equipo',
          instruments: [
            { tagPrefix: 'B401.T', count: 10, profile: 'temperature_boiler', label: 'Temperatura Caldera' },
            { tagPrefix: 'B401.P', count: 6, profile: 'pressure_steam', label: 'Presión Caldera' },
            { tagPrefix: 'B401.F', count: 6, profile: 'flow', label: 'Flujo Caldera' },
            { tagPrefix: 'B401.L', count: 4, profile: 'level', label: 'Nivel Caldera' },
            { tagPrefix: 'B401.A', count: 4, profile: 'analyzer', label: 'Analizador Caldera' },
          ]
        },
        { name: 'TorreEnfr-CT-401', label: 'Torre de Enfriamiento', type: 'Equipo',
          instruments: [
            { tagPrefix: 'CT401.T', count: 8, profile: 'temperature_cooling', label: 'Temperatura Torre Enfr.' },
            { tagPrefix: 'CT401.F', count: 4, profile: 'flow', label: 'Flujo Torre Enfr.' },
            { tagPrefix: 'CT401.AQ', count: 6, profile: 'water_quality', label: 'Calidad Agua' },
          ]
        },
        { name: 'Electrica-SW-401', label: 'Subestación Eléctrica', type: 'Equipo',
          instruments: [
            { tagPrefix: 'SW401.E', count: 12, profile: 'electrical', label: 'Medidor Eléctrico' },
            { tagPrefix: 'SW401.CB', count: 8, profile: 'digital_breaker', label: 'Interruptor' },
          ]
        },
        { name: 'AireInstr-IA-401', label: 'Sistema de Aire de Instrumentos', type: 'Equipo',
          instruments: [
            { tagPrefix: 'IA401.P', count: 6, profile: 'pressure_low', label: 'Presión Aire Inst.' },
            { tagPrefix: 'IA401.T', count: 4, profile: 'temperature_cooling', label: 'Temperatura Secador' },
            { tagPrefix: 'IA401.F', count: 4, profile: 'flow', label: 'Flujo Compresor Aire' },
            { tagPrefix: 'IA401.M', count: 4, profile: 'digital_motor', label: 'Motor Compresor Aire' },
          ]
        },
      ]
    },
    {
      name: 'Cracking',
      label: 'Unidad de Craqueo Catalítico (FCC)',
      type: 'AreaProceso',
      equipment: [
        { name: 'Riser-RX-501', label: 'Riser/Reactor FCC', type: 'Equipo',
          instruments: [
            { tagPrefix: 'RX501.T', count: 18, profile: 'temperature_reactor', label: 'Temperatura Riser' },
            { tagPrefix: 'RX501.P', count: 8, profile: 'pressure_tower', label: 'Presión Riser' },
            { tagPrefix: 'RX501.F', count: 8, profile: 'flow', label: 'Flujo Riser' },
            { tagPrefix: 'RX501.A', count: 6, profile: 'analyzer', label: 'Analizador Riser' },
            { tagPrefix: 'RX501.XV', count: 8, profile: 'digital_valve', label: 'Válvula Catalizador' },
          ]
        },
        { name: 'Regenerador-RG-501', label: 'Regenerador de Catalizador', type: 'Equipo',
          instruments: [
            { tagPrefix: 'RG501.T', count: 16, profile: 'temperature_furnace', label: 'Temperatura Regenerador' },
            { tagPrefix: 'RG501.P', count: 6, profile: 'pressure_tower', label: 'Presión Regenerador' },
            { tagPrefix: 'RG501.F', count: 6, profile: 'flow', label: 'Flujo Aire Regenerador' },
            { tagPrefix: 'RG501.A', count: 4, profile: 'analyzer', label: 'Analizador CO/O2' },
          ]
        },
        { name: 'Fraccionadora-T-501', label: 'Torre Fraccionadora FCC', type: 'Equipo',
          instruments: [
            { tagPrefix: 'T501.T', count: 14, profile: 'temperature_tower', label: 'Temperatura Fraccionadora' },
            { tagPrefix: 'T501.P', count: 6, profile: 'pressure_tower', label: 'Presión Fraccionadora' },
            { tagPrefix: 'T501.F', count: 8, profile: 'flow', label: 'Flujo Fraccionadora' },
            { tagPrefix: 'T501.L', count: 6, profile: 'level', label: 'Nivel Fraccionadora' },
          ]
        },
        { name: 'GasPlant-GP-501', label: 'Planta de Gas FCC', type: 'Equipo',
          instruments: [
            { tagPrefix: 'GP501.T', count: 10, profile: 'temperature_vessel', label: 'Temperatura Planta Gas' },
            { tagPrefix: 'GP501.P', count: 8, profile: 'pressure_high', label: 'Presión Planta Gas' },
            { tagPrefix: 'GP501.F', count: 6, profile: 'flow', label: 'Flujo Planta Gas' },
            { tagPrefix: 'GP501.L', count: 4, profile: 'level', label: 'Nivel Planta Gas' },
            { tagPrefix: 'GP501.A', count: 4, profile: 'analyzer', label: 'Analizador Gas' },
          ]
        },
        { name: 'Sopladores-BL-501', label: 'Sopladores de Aire', type: 'Equipo',
          instruments: [
            { tagPrefix: 'BL501.VIB', count: 8, profile: 'vibration', label: 'Vibración Soplador' },
            { tagPrefix: 'BL501.T', count: 8, profile: 'temperature_motor', label: 'Temperatura Soplador' },
            { tagPrefix: 'BL501.M', count: 4, profile: 'digital_motor', label: 'Motor Soplador' },
          ]
        },
      ]
    },
  ]
};

// ─── Tag profile definitions ─────────────────────────────────────────────
// Each profile defines realistic ranges, units, behavior for signal generation

export const TAG_PROFILES = {
  temperature_tower:   { dataType: 'float', engUnits: '°C', rangeLo: 50,  rangeHi: 400, typical: 250, scanRate: 5000,  step: false, deadband: 0.5, deadbandType: 'absolute', instrumentType: 'TE/TT', alarm: { HH: 380, H: 350, L: 80, LL: 60 } },
  temperature_furnace: { dataType: 'float', engUnits: '°C', rangeLo: 200, rangeHi: 900, typical: 650, scanRate: 2000,  step: false, deadband: 1.0, deadbandType: 'absolute', instrumentType: 'TE/TT', alarm: { HH: 870, H: 800, L: 300, LL: 250 } },
  temperature_reactor: { dataType: 'float', engUnits: '°C', rangeLo: 200, rangeHi: 450, typical: 350, scanRate: 2000,  step: false, deadband: 0.3, deadbandType: 'absolute', instrumentType: 'TE/TT', alarm: { HH: 430, H: 400, L: 250, LL: 220 } },
  temperature_exchanger:{ dataType: 'float', engUnits: '°C', rangeLo: 30,  rangeHi: 300, typical: 150, scanRate: 5000,  step: false, deadband: 0.5, deadbandType: 'absolute', instrumentType: 'TE/TT', alarm: { HH: 280, H: 250, L: 50, LL: 35 } },
  temperature_vessel:  { dataType: 'float', engUnits: '°C', rangeLo: 20,  rangeHi: 200, typical: 80,  scanRate: 5000,  step: false, deadband: 0.5, deadbandType: 'absolute', instrumentType: 'TE/TT', alarm: { HH: 180, H: 150, L: 30, LL: 25 } },
  temperature_motor:   { dataType: 'float', engUnits: '°C', rangeLo: 20,  rangeHi: 120, typical: 65,  scanRate: 5000,  step: false, deadband: 0.5, deadbandType: 'absolute', instrumentType: 'TE/TT', alarm: { HH: 110, H: 95, L: null, LL: null } },
  temperature_tank:    { dataType: 'float', engUnits: '°C', rangeLo: 10,  rangeHi: 80,  typical: 35,  scanRate: 10000, step: false, deadband: 0.2, deadbandType: 'absolute', instrumentType: 'TE/TT', alarm: { HH: 70, H: 60, L: 15, LL: 10 } },
  temperature_boiler:  { dataType: 'float', engUnits: '°C', rangeLo: 100, rangeHi: 550, typical: 400, scanRate: 2000,  step: false, deadband: 0.5, deadbandType: 'absolute', instrumentType: 'TE/TT', alarm: { HH: 520, H: 480, L: 150, LL: 120 } },
  temperature_cooling: { dataType: 'float', engUnits: '°C', rangeLo: 15,  rangeHi: 50,  typical: 28,  scanRate: 10000, step: false, deadband: 0.2, deadbandType: 'absolute', instrumentType: 'TE/TT', alarm: { HH: 45, H: 38, L: 18, LL: 15 } },
  pressure_tower:      { dataType: 'float', engUnits: 'kPa', rangeLo: 50,  rangeHi: 500, typical: 200, scanRate: 5000,  step: false, deadband: 0.5, deadbandType: 'percent', instrumentType: 'PT/PIT', alarm: { HH: 450, H: 380, L: 80, LL: 60 } },
  pressure_high:       { dataType: 'float', engUnits: 'MPa', rangeLo: 1,   rangeHi: 20,  typical: 12,  scanRate: 2000,  step: false, deadband: 0.3, deadbandType: 'percent', instrumentType: 'PT/PIT', alarm: { HH: 18, H: 16, L: 3, LL: 2 } },
  pressure_low:        { dataType: 'float', engUnits: 'kPa', rangeLo: 0,   rangeHi: 200, typical: 80,  scanRate: 5000,  step: false, deadband: 1.0, deadbandType: 'absolute', instrumentType: 'PT/PIT', alarm: { HH: 180, H: 150, L: 10, LL: 5 } },
  pressure_diff:       { dataType: 'float', engUnits: 'kPa', rangeLo: 0,   rangeHi: 50,  typical: 15,  scanRate: 5000,  step: false, deadband: 0.5, deadbandType: 'absolute', instrumentType: 'PDT',   alarm: { HH: 40, H: 30, L: null, LL: null } },
  pressure_steam:      { dataType: 'float', engUnits: 'MPa', rangeLo: 0.5, rangeHi: 5,   typical: 3.5, scanRate: 2000,  step: false, deadband: 0.2, deadbandType: 'percent', instrumentType: 'PT/PIT', alarm: { HH: 4.5, H: 4.2, L: 1.0, LL: 0.7 } },
  flow:                { dataType: 'float', engUnits: 'm³/h', rangeLo: 0,  rangeHi: 500, typical: 200, scanRate: 5000,  step: false, deadband: 1.0, deadbandType: 'percent', instrumentType: 'FT/FIT', alarm: { HH: 480, H: 420, L: 20, LL: 5 } },
  level:               { dataType: 'float', engUnits: '%',   rangeLo: 0,   rangeHi: 100, typical: 50,  scanRate: 5000,  step: false, deadband: 0.5, deadbandType: 'absolute', instrumentType: 'LT/LIT', alarm: { HH: 95, H: 85, L: 15, LL: 5 } },
  level_tank:          { dataType: 'float', engUnits: 'm',   rangeLo: 0,   rangeHi: 15,  typical: 8,   scanRate: 10000, step: false, deadband: 0.01,deadbandType: 'absolute', instrumentType: 'LT/LIT', alarm: { HH: 14, H: 13, L: 1.5, LL: 0.5 } },
  analyzer:            { dataType: 'float', engUnits: 'ppm', rangeLo: 0,   rangeHi: 1000,typical: 50,  scanRate: 30000, step: false, deadband: 2.0, deadbandType: 'absolute', instrumentType: 'AT/AIT', alarm: { HH: 500, H: 200, L: null, LL: null } },
  vibration:           { dataType: 'float', engUnits: 'mm/s',rangeLo: 0,   rangeHi: 25,  typical: 3,   scanRate: 1000,  step: false, deadband: 0.1, deadbandType: 'absolute', instrumentType: 'VT',     alarm: { HH: 18, H: 11, L: null, LL: null } },
  water_quality:       { dataType: 'float', engUnits: 'pH',  rangeLo: 0,   rangeHi: 14,  typical: 7.2, scanRate: 30000, step: false, deadband: 0.05,deadbandType: 'absolute', instrumentType: 'AT/AIT', alarm: { HH: 9.0, H: 8.5, L: 6.0, LL: 5.5 } },
  electrical:          { dataType: 'float', engUnits: 'kW',  rangeLo: 0,   rangeHi: 5000,typical: 2000,scanRate: 5000,  step: false, deadband: 1.0, deadbandType: 'percent', instrumentType: 'WT',     alarm: { HH: 4500, H: 4000, L: null, LL: null } },
  digital_valve:       { dataType: 'integer', engUnits: '',  rangeLo: 0,   rangeHi: 1,   typical: 1,   scanRate: 1000,  step: true,  deadband: 0,   deadbandType: 'absolute', instrumentType: 'XV/ZS',  alarm: null, digitalStates: { 0: 'CERRADA', 1: 'ABIERTA' } },
  digital_motor:       { dataType: 'integer', engUnits: '',  rangeLo: 0,   rangeHi: 1,   typical: 1,   scanRate: 1000,  step: true,  deadband: 0,   deadbandType: 'absolute', instrumentType: 'HS/ZS',  alarm: null, digitalStates: { 0: 'PARADO', 1: 'CORRIENDO' } },
  digital_breaker:     { dataType: 'integer', engUnits: '',  rangeLo: 0,   rangeHi: 1,   typical: 1,   scanRate: 1000,  step: true,  deadband: 0,   deadbandType: 'absolute', instrumentType: 'CS',     alarm: null, digitalStates: { 0: 'ABIERTO', 1: 'CERRADO' } },
};

// ─── Helper: build flat attributes, omitting null values ─────────────────

function buildAttributes(profile, instLabel, idx, equipLabel, areaName, equipName) {
  const attrs = {
    description: `${instLabel} #${idx} — ${equipLabel}`,
    engUnits: profile.engUnits,
    dataType: profile.dataType,
    rangeLo: profile.rangeLo,
    rangeHi: profile.rangeHi,
    typicalValue: profile.typical,
    scanRateMs: profile.scanRate,
    stepFlag: profile.step,
    instrumentType: profile.instrumentType,
    area: areaName,
    equipment: equipName,
    deadbandValue: profile.deadband,
    deadbandType: profile.deadbandType,
  };
  // Only include alarm thresholds that are not null (TB rejects null in SHARED_SCOPE)
  if (profile.alarm) {
    if (profile.alarm.HH != null) attrs.alarmHH = profile.alarm.HH;
    if (profile.alarm.H != null) attrs.alarmH = profile.alarm.H;
    if (profile.alarm.L != null) attrs.alarmL = profile.alarm.L;
    if (profile.alarm.LL != null) attrs.alarmLL = profile.alarm.LL;
  }
  if (profile.digitalStates) {
    attrs.digitalStates = JSON.stringify(profile.digitalStates);
  }
  return attrs;
}

// ─── Flatten plant model into individual tag definitions ─────────────────
// Returns array of { tagName, profile, areaName, equipName, label, description }

export function flattenPlantTags() {
  const tags = [];
  for (const area of PLANT_MODEL.areas) {
    for (const equip of area.equipment) {
      for (const inst of equip.instruments) {
        const profile = TAG_PROFILES[inst.profile];
        for (let i = 1; i <= inst.count; i++) {
          const idx = String(i).padStart(2, '0');
          const tagName = `${inst.tagPrefix}${idx}`;
          tags.push({
            tagName,
            profileName: inst.profile,
            areaName: area.name,
            equipName: equip.name,
            label: `${inst.label} #${i}`,
            description: `${inst.label} #${i} — ${equip.label}`,
            // Flat attributes for the Device-tag (omit null values — TB rejects them)
            attributes: buildAttributes(profile, inst.label, i, equip.label, area.name, equip.name),
          });
        }
      }
    }
  }
  return tags;
}
