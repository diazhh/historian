import axios from 'axios';
import { TB_URL, TB_USER, TB_PASSWORD } from './config.js';

export class TbClient {
  constructor() {
    this.token = null;
    this.http = axios.create({ baseURL: TB_URL });
  }

  async login() {
    const res = await this.http.post('/api/auth/login', {
      username: TB_USER,
      password: TB_PASSWORD,
    });
    this.token = res.data.token;
    this.http.defaults.headers.common['X-Authorization'] = `Bearer ${this.token}`;
    console.log('[TB] Authenticated OK');
  }

  // ── Assets ───────────────────────────────────────────────────────────

  async createAsset(name, type, label) {
    const res = await this.http.post('/api/asset', { name, type, label });
    return res.data; // { id: { id, entityType }, name, ... }
  }

  async findAssetByName(name) {
    const res = await this.http.get('/api/tenant/assets', {
      params: { pageSize: 1, page: 0, textSearch: name },
    });
    return res.data.data?.find(a => a.name === name) ?? null;
  }

  // ── Devices ──────────────────────────────────────────────────────────

  async createDevice(name, type, label) {
    const res = await this.http.post('/api/device', { name, type, label });
    return res.data;
  }

  async findDeviceByName(name) {
    const res = await this.http.get('/api/tenant/devices', {
      params: { pageSize: 1, page: 0, textSearch: name },
    });
    return res.data.data?.find(d => d.name === name) ?? null;
  }

  async getDeviceCredentials(deviceId) {
    const res = await this.http.get(`/api/device/${deviceId}/credentials`);
    return res.data; // { credentialsId (access token), ... }
  }

  // ── Relations ────────────────────────────────────────────────────────

  async createRelation(fromType, fromId, toType, toId, relationType = 'Contains') {
    await this.http.post('/api/relation', {
      from: { entityType: fromType, id: fromId },
      to: { entityType: toType, id: toId },
      type: relationType,
      typeGroup: 'COMMON',
    });
  }

  // ── Attributes ───────────────────────────────────────────────────────

  async setClientAttributes(deviceId, payload) {
    // CLIENT_SCOPE can only be set via MQTT. Use SHARED_SCOPE via REST
    // which is readable from widgets the same way as CLIENT_SCOPE.
    await this.http.post(
      `/api/plugins/telemetry/DEVICE/${deviceId}/attributes/SHARED_SCOPE`,
      payload
    );
  }

  async setServerAttributes(entityType, entityId, payload) {
    await this.http.post(
      `/api/plugins/telemetry/${entityType}/${entityId}/attributes/SERVER_SCOPE`,
      payload
    );
  }

  // ── Telemetry ────────────────────────────────────────────────────────

  async sendTelemetry(deviceId, tsPayloads) {
    // tsPayloads: { ts: number, values: { key: val } }[] — batch format
    // TB accepts array of {ts, values} objects
    await this.http.post(
      `/api/plugins/telemetry/DEVICE/${deviceId}/timeseries/ANY`,
      tsPayloads
    );
  }

  // ── Cleanup ──────────────────────────────────────────────────────────

  async deleteDevice(deviceId) {
    await this.http.delete(`/api/device/${deviceId}`);
  }

  async deleteAsset(assetId) {
    await this.http.delete(`/api/asset/${assetId}`);
  }

  async getAllDevicesByType(type) {
    const all = [];
    let page = 0;
    let hasNext = true;
    while (hasNext) {
      const res = await this.http.get('/api/tenant/devices', {
        params: { pageSize: 100, page, type },
      });
      all.push(...res.data.data);
      hasNext = res.data.hasNext;
      page++;
    }
    return all;
  }

  async getAllAssetsByType(type) {
    const all = [];
    let page = 0;
    let hasNext = true;
    while (hasNext) {
      const res = await this.http.get('/api/tenant/assets', {
        params: { pageSize: 100, page, type },
      });
      all.push(...res.data.data);
      hasNext = res.data.hasNext;
      page++;
    }
    return all;
  }
}
