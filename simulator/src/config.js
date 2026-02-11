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
// Hierarchy: Site → Area → Equipment → Device (Instruments)
// Each device holds 5-25 tags depending on instrument complexity

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
            { name: 'DA101-TempCtrl', label: 'Controladores de Temperatura Torre', tagPrefix: 'DA101.T', count: 15, profile: 'temperature_tower' },
            { name: 'DA101-PresCtrl', label: 'Controladores de Presión Torre', tagPrefix: 'DA101.P', count: 8, profile: 'pressure_tower' },
            { name: 'DA101-FlowCtrl', label: 'Medidores de Flujo Torre', tagPrefix: 'DA101.F', count: 10, profile: 'flow' },
            { name: 'DA101-LevelCtrl', label: 'Indicadores de Nivel Torre', tagPrefix: 'DA101.L', count: 6, profile: 'level' },
          ]
        },
        { name: 'Horno-H-101', label: 'Horno de Precalentamiento', type: 'Equipo',
          instruments: [
            { name: 'H101-TempCtrl', label: 'Temperaturas Horno', tagPrefix: 'H101.T', count: 12, profile: 'temperature_furnace' },
            { name: 'H101-PresCtrl', label: 'Presiones Horno', tagPrefix: 'H101.P', count: 4, profile: 'pressure_low' },
            { name: 'H101-FuelCtrl', label: 'Control de Combustible', tagPrefix: 'H101.FU', count: 6, profile: 'flow' },
            { name: 'H101-Analyzers', label: 'Analizadores de Gases', tagPrefix: 'H101.A', count: 4, profile: 'analyzer' },
          ]
        },
        { name: 'Intercamb-E-101', label: 'Tren de Intercambiadores', type: 'Equipo',
          instruments: [
            { name: 'E101-TempCtrl', label: 'Temperaturas Intercambiadores', tagPrefix: 'E101.T', count: 8, profile: 'temperature_exchanger' },
            { name: 'E101-FlowCtrl', label: 'Flujos Intercambiadores', tagPrefix: 'E101.F', count: 6, profile: 'flow' },
            { name: 'E101-DiffPress', label: 'Presiones Diferenciales', tagPrefix: 'E101.DP', count: 4, profile: 'pressure_diff' },
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
            { name: 'R201-TempCtrl', label: 'Temperaturas Reactor', tagPrefix: 'R201.T', count: 20, profile: 'temperature_reactor' },
            { name: 'R201-PresCtrl', label: 'Presiones Reactor', tagPrefix: 'R201.P', count: 8, profile: 'pressure_high' },
            { name: 'R201-FlowCtrl', label: 'Flujos Reactor', tagPrefix: 'R201.F', count: 6, profile: 'flow' },
            { name: 'R201-Analyzers', label: 'Analizadores Reactor', tagPrefix: 'R201.A', count: 6, profile: 'analyzer' },
          ]
        },
        { name: 'Separador-V-201', label: 'Separador de Alta Presión', type: 'Equipo',
          instruments: [
            { name: 'V201-LevelCtrl', label: 'Niveles Separador', tagPrefix: 'V201.L', count: 4, profile: 'level' },
            { name: 'V201-PresCtrl', label: 'Presiones Separador', tagPrefix: 'V201.P', count: 4, profile: 'pressure_high' },
            { name: 'V201-TempCtrl', label: 'Temperaturas Separador', tagPrefix: 'V201.T', count: 4, profile: 'temperature_vessel' },
          ]
        },
        { name: 'Compresor-K-201', label: 'Compresor de Hidrógeno', type: 'Equipo',
          instruments: [
            { name: 'K201-VibCtrl', label: 'Vibración Compresor', tagPrefix: 'K201.VIB', count: 6, profile: 'vibration' },
            { name: 'K201-TempCtrl', label: 'Temperaturas Compresor', tagPrefix: 'K201.T', count: 8, profile: 'temperature_motor' },
            { name: 'K201-PresCtrl', label: 'Presiones Compresor', tagPrefix: 'K201.P', count: 4, profile: 'pressure_high' },
            { name: 'K201-Valves', label: 'Válvulas Compresor', tagPrefix: 'K201.XV', count: 6, profile: 'digital_valve' },
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
            { name: 'TK301-LevelCtrl', label: 'Niveles Tanque Crudo', tagPrefix: 'TK301.L', count: 4, profile: 'level_tank' },
            { name: 'TK301-TempCtrl', label: 'Temperaturas Tanque Crudo', tagPrefix: 'TK301.T', count: 6, profile: 'temperature_tank' },
          ]
        },
        { name: 'Tanque-TK-302', label: 'Tanque de Nafta', type: 'Equipo',
          instruments: [
            { name: 'TK302-LevelCtrl', label: 'Niveles Tanque Nafta', tagPrefix: 'TK302.L', count: 4, profile: 'level_tank' },
            { name: 'TK302-TempCtrl', label: 'Temperaturas Tanque Nafta', tagPrefix: 'TK302.T', count: 4, profile: 'temperature_tank' },
          ]
        },
        { name: 'Tanque-TK-303', label: 'Tanque de Diesel', type: 'Equipo',
          instruments: [
            { name: 'TK303-LevelCtrl', label: 'Niveles Tanque Diesel', tagPrefix: 'TK303.L', count: 4, profile: 'level_tank' },
            { name: 'TK303-TempCtrl', label: 'Temperaturas Tanque Diesel', tagPrefix: 'TK303.T', count: 4, profile: 'temperature_tank' },
          ]
        },
        { name: 'Bombas-P-301', label: 'Estación de Bombeo', type: 'Equipo',
          instruments: [
            { name: 'P301-FlowCtrl', label: 'Flujos Bombas', tagPrefix: 'P301.F', count: 8, profile: 'flow' },
            { name: 'P301-PresCtrl', label: 'Presiones Bombas', tagPrefix: 'P301.P', count: 8, profile: 'pressure_low' },
            { name: 'P301-MotorCtrl', label: 'Motores Bombas', tagPrefix: 'P301.M', count: 8, profile: 'digital_motor' },
            { name: 'P301-VibCtrl', label: 'Vibración Bombas', tagPrefix: 'P301.VIB', count: 6, profile: 'vibration' },
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
            { name: 'B401-TempCtrl', label: 'Temperaturas Caldera', tagPrefix: 'B401.T', count: 10, profile: 'temperature_boiler' },
            { name: 'B401-PresCtrl', label: 'Presiones Caldera', tagPrefix: 'B401.P', count: 6, profile: 'pressure_steam' },
            { name: 'B401-FlowCtrl', label: 'Flujos Caldera', tagPrefix: 'B401.F', count: 6, profile: 'flow' },
            { name: 'B401-LevelCtrl', label: 'Niveles Caldera', tagPrefix: 'B401.L', count: 4, profile: 'level' },
            { name: 'B401-Analyzers', label: 'Analizadores Caldera', tagPrefix: 'B401.A', count: 4, profile: 'analyzer' },
          ]
        },
        { name: 'TorreEnfr-CT-401', label: 'Torre de Enfriamiento', type: 'Equipo',
          instruments: [
            { name: 'CT401-TempCtrl', label: 'Temperaturas Torre Enfriamiento', tagPrefix: 'CT401.T', count: 8, profile: 'temperature_cooling' },
            { name: 'CT401-FlowCtrl', label: 'Flujos Torre Enfriamiento', tagPrefix: 'CT401.F', count: 4, profile: 'flow' },
            { name: 'CT401-Analyzers', label: 'Calidad Agua', tagPrefix: 'CT401.AQ', count: 6, profile: 'water_quality' },
          ]
        },
        { name: 'Electrica-SW-401', label: 'Subestación Eléctrica', type: 'Equipo',
          instruments: [
            { name: 'SW401-PowerCtrl', label: 'Medidores Eléctricos', tagPrefix: 'SW401.E', count: 12, profile: 'electrical' },
            { name: 'SW401-Breakers', label: 'Interruptores', tagPrefix: 'SW401.CB', count: 8, profile: 'digital_breaker' },
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
