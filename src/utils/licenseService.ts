import { LicenseRecord, LicenseValidationState } from '../types/workbuddy';

export const LICENSE_BASE_URL = 'https://dengwk.ai.studio';
export const LICENSE_DOCS_URL = 'https://dengwk.ai.studio/docs';
export const DEFAULT_APP_TYPE = 'SYS00002';
export const DEFAULT_APP_NAME = 'workBuddy助手';
export const LICENSE_REQUEST_TIMEOUT_MS = 35000;
export const HEARTBEAT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24小时心跳
export const GRACE_RETRY_INTERVAL_MS = 30 * 60 * 1000; // 弱网宽限期每30分钟静默重试一次
export const OFFLINE_GRACE_MAX_MS = 7 * 24 * 60 * 60 * 1000; // 最长7天离线容错宽限（受限于 expireTime）

const STORAGE_LICENSE_KEY = 'workbuddy_license_record_v1';
const STORAGE_MAC_KEY = 'workbuddy_device_mac_v1';
const STORAGE_OFFLINE_LIC_KEY = 'workbuddy_offline_lic_json_v1';

interface LicenseProxyApiResult {
  ok: boolean;
  status: number;
  networkError: boolean;
  channelUsed?: string;
  data?: {
    ok?: boolean;
    code?: string;
    message?: string;
    data?: {
      license_key?: string;
      app_type?: string;
      app_name?: string;
      mac_address?: string;
      expire_time?: string;
      remaining_days?: number;
    };
  };
}

interface ElectronLicenseBridge {
  getLicenseInfo?: () => Promise<{
    macAddress?: string;
    allMacs?: string[];
    savedLicense?: LicenseRecord | null;
  }>;
  saveLicenseConfig?: (payload: LicenseRecord | null) => Promise<{ ok: boolean }>;
  requestLicenseApi?: (payload: {
    endpoint: string;
    body: Record<string, unknown>;
    proxyUrl?: string;
    timeoutMs?: number;
  }) => Promise<LicenseProxyApiResult>;
}

function getElectronBridge(): ElectronLicenseBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { electronAPI?: ElectronLicenseBridge }).electronAPI;
}

export function parseExpireTimeMs(expireTime?: string): number | null {
  const raw = String(expireTime || '').trim();
  if (!raw) return null;
  const isoCandidate = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const parsed = Date.parse(isoCandidate);
  if (!Number.isNaN(parsed)) return parsed;
  const fallback = Date.parse(raw);
  return Number.isNaN(fallback) ? null : fallback;
}

export function computeRemainingDays(expireTime?: string, serverRemainingDays?: unknown): number | null {
  if (typeof serverRemainingDays === 'number' && Number.isFinite(serverRemainingDays)) {
    return Math.max(0, Math.floor(serverRemainingDays));
  }
  const expireMs = parseExpireTimeMs(expireTime);
  if (expireMs === null) return null;
  const diff = expireMs - Date.now();
  if (diff <= 0) return 0;
  return Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

function generateFallbackMac(): string {
  try {
    const existing = localStorage.getItem(STORAGE_MAC_KEY);
    if (existing && /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/i.test(existing)) {
      return existing.toUpperCase();
    }
  } catch {
    // ignore
  }
  const seed = `${navigator.userAgent || ''}|${navigator.platform || ''}|${navigator.language || ''}|${screen.width}x${screen.height}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x12345678;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (Math.imul(h2, 33) ^ c) >>> 0;
  }
  const bytes = [
    ((h1 >>> 0) & 0xfe) | 0x02,
    (h1 >>> 8) & 0xff,
    (h1 >>> 16) & 0xff,
    (h2 >>> 0) & 0xff,
    (h2 >>> 8) & 0xff,
    (h2 >>> 16) & 0xff,
  ];
  const mac = bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
  try {
    localStorage.setItem(STORAGE_MAC_KEY, mac);
  } catch {
    // ignore
  }
  return mac;
}

export function loadSavedLicenseRecord(): LicenseRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_LICENSE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LicenseRecord;
    if (parsed && parsed.licenseKey) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function persistLicenseRecord(record: LicenseRecord | null): Promise<void> {
  try {
    if (record) {
      localStorage.setItem(STORAGE_LICENSE_KEY, JSON.stringify(record));
      if (record.macAddress) {
        localStorage.setItem(STORAGE_MAC_KEY, record.macAddress.toUpperCase());
      }
    } else {
      localStorage.removeItem(STORAGE_LICENSE_KEY);
      localStorage.removeItem(STORAGE_OFFLINE_LIC_KEY);
    }
  } catch {
    // ignore
  }

  const electronApi = getElectronBridge();
  if (electronApi?.saveLicenseConfig) {
    await electronApi.saveLicenseConfig(record).catch(() => null);
  } else {
    await fetch('/api/license/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    }).catch(() => null);
  }
}

export async function getMachineLicenseContext(): Promise<{
  macAddress: string;
  allMacs: string[];
  savedLicense: LicenseRecord | null;
}> {
  const localSaved = loadSavedLicenseRecord();
  const electronApi = getElectronBridge();

  if (electronApi?.getLicenseInfo) {
    try {
      const info = await electronApi.getLicenseInfo();
      const mac = String(info?.macAddress || '').trim().toUpperCase() || generateFallbackMac();
      const saved = localSaved || info?.savedLicense || null;
      if (!localSaved && saved?.licenseKey) {
        try {
          localStorage.setItem(STORAGE_LICENSE_KEY, JSON.stringify(saved));
        } catch {
          // ignore
        }
      }
      return {
        macAddress: mac,
        allMacs: Array.isArray(info?.allMacs) && info.allMacs.length > 0 ? info.allMacs : [mac],
        savedLicense: saved,
      };
    } catch {
      // fall through
    }
  }

  try {
    const res = await fetch('/api/license/machine-info', { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const info = await res.json();
      const mac = String(info?.macAddress || '').trim().toUpperCase() || generateFallbackMac();
      const saved = localSaved || info?.savedLicense || null;
      if (!localSaved && saved?.licenseKey) {
        try {
          localStorage.setItem(STORAGE_LICENSE_KEY, JSON.stringify(saved));
        } catch {
          // ignore
        }
      }
      return {
        macAddress: mac,
        allMacs: Array.isArray(info?.allMacs) && info.allMacs.length > 0 ? info.allMacs : [mac],
        savedLicense: saved,
      };
    }
  } catch {
    // fall through
  }

  const fallbackMac = localSaved?.macAddress || generateFallbackMac();
  return {
    macAddress: fallbackMac,
    allMacs: [fallbackMac],
    savedLicense: localSaved,
  };
}

async function callLicenseEndpoint(
  endpoint: '/api/activate' | '/api/verify' | '/api/verify-offline',
  body: Record<string, unknown>,
  proxyUrl?: string
): Promise<LicenseProxyApiResult> {
  const electronApi = getElectronBridge();

  // 1. Electron Main Process multi-channel transport (User Proxy -> OS System VPN/Proxy via net.fetch -> IPv4 Node HTTPS)
  if (electronApi?.requestLicenseApi) {
    try {
      const res = await electronApi.requestLicenseApi({
        endpoint,
        body,
        proxyUrl: proxyUrl?.trim() || undefined,
        timeoutMs: LICENSE_REQUEST_TIMEOUT_MS,
      });
      if (res) return res;
    } catch {
      // fall through
    }
  }

  // 2. Local Express Server multi-channel proxy (avoids browser CORS & supports HTTP proxy + IPv4 fallback)
  try {
    const proxyRes = await fetch('/api/license/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint,
        body,
        proxyUrl: proxyUrl?.trim() || undefined,
        timeoutMs: LICENSE_REQUEST_TIMEOUT_MS,
      }),
      signal: AbortSignal.timeout(LICENSE_REQUEST_TIMEOUT_MS + 4000),
    });
    if (proxyRes.ok) {
      const parsed = (await proxyRes.json()) as LicenseProxyApiResult;
      if (parsed && typeof parsed.status === 'number') {
        return parsed;
      }
    }
  } catch {
    // fall through to direct browser fetch
  }

  // 3. Direct browser fetch fallback (with 35s long timeout)
  try {
    const res = await fetch(`${LICENSE_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LICENSE_REQUEST_TIMEOUT_MS),
    });
    const text = await res.text().catch(() => '');
    let data: LicenseProxyApiResult['data'] = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
    return {
      ok: res.ok,
      status: res.status,
      networkError: res.status >= 500,
      channelUsed: 'browser-direct',
      data,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      status: 0,
      networkError: true,
      data: {
        message: err instanceof Error ? err.message : '连接授权服务器超时或网络不可达',
      },
    };
  }
}

export function buildUnlicensedState(macAddress: string, allMacs: string[]): LicenseValidationState {
  return {
    status: 'unlicensed',
    isAuthorized: false,
    message: '尚未配置软件授权码（安装与启动可跳过，但执行日常任务/签到/领奖前需先激活 License）',
    remainingDays: null,
    expireTime: '',
    appType: DEFAULT_APP_TYPE,
    appName: DEFAULT_APP_NAME,
    macAddress,
    allMacs,
    licenseKey: '',
    isOfflineGrace: false,
  };
}

export async function activateOnlineLicense(params: {
  licenseKey: string;
  appType?: string;
  proxyUrl?: string;
}): Promise<LicenseValidationState> {
  const ctx = await getMachineLicenseContext();
  const cleanKey = params.licenseKey.trim().toUpperCase();
  const cleanAppType = (params.appType || DEFAULT_APP_TYPE).trim().toUpperCase() || DEFAULT_APP_TYPE;
  const macAddress = ctx.macAddress;
  const nowStr = new Date().toISOString();

  if (!cleanKey) {
    return {
      ...buildUnlicensedState(macAddress, ctx.allMacs),
      status: 'invalid',
      message: '请输入有效的授权码后再激活',
      appType: cleanAppType,
    };
  }

  const res = await callLicenseEndpoint(
    '/api/activate',
    {
      license_key: cleanKey,
      app_type: cleanAppType,
      mac_address: macAddress,
    },
    params.proxyUrl
  );

  const body = res.data || {};
  if (res.ok && body.ok) {
    const info = body.data || {};
    const expireTime = info.expire_time || '';
    const remainingDays = computeRemainingDays(expireTime, info.remaining_days);
    const record: LicenseRecord = {
      licenseKey: info.license_key || cleanKey,
      appType: info.app_type || cleanAppType,
      appName: info.app_name || DEFAULT_APP_NAME,
      macAddress: (info.mac_address || macAddress).toUpperCase(),
      expireTime,
      remainingDays: remainingDays ?? undefined,
      activatedAt: nowStr,
      lastVerifiedAt: nowStr,
      proxyUrl: params.proxyUrl?.trim() || undefined,
      mode: 'online',
    };
    await persistLicenseRecord(record);

    return {
      status: 'valid',
      isAuthorized: true,
      code: body.code || 'ACTIVATED',
      message: body.message || `授权激活成功！可用剩余 ${remainingDays ?? '--'} 天`,
      remainingDays,
      expireTime: record.expireTime,
      appType: record.appType,
      appName: record.appName || DEFAULT_APP_NAME,
      macAddress: record.macAddress,
      allMacs: ctx.allMacs,
      licenseKey: record.licenseKey,
      lastVerifiedAt: nowStr,
      lastAttemptAt: nowStr,
      channelUsed: res.channelUsed,
      isOfflineGrace: false,
    };
  }

  return {
    status: res.networkError ? 'invalid' : 'invalid',
    isAuthorized: false,
    code: body.code || (res.networkError ? 'NETWORK_ERROR' : 'ACTIVATE_FAILED'),
    message:
      body.message ||
      (res.networkError
        ? '无法连接授权验证服务器，请检查网络连接或配置代理地址后重试'
        : `激活失败 (HTTP ${res.status})`),
    remainingDays: null,
    expireTime: '',
    appType: cleanAppType,
    appName: DEFAULT_APP_NAME,
    macAddress,
    allMacs: ctx.allMacs,
    licenseKey: cleanKey,
    lastAttemptAt: nowStr,
    channelUsed: res.channelUsed,
    isOfflineGrace: false,
  };
}

export async function verifyOfflineLicenseFile(params: {
  licJson: Record<string, unknown>;
  appType?: string;
  proxyUrl?: string;
}): Promise<LicenseValidationState> {
  const ctx = await getMachineLicenseContext();
  const lic = params.licJson || {};
  const cleanAppType = (
    params.appType ||
    String(lic.app_type || '') ||
    DEFAULT_APP_TYPE
  )
    .trim()
    .toUpperCase();
  const macAddress = ctx.macAddress;
  const nowStr = new Date().toISOString();

  if (!lic.license_key || !lic.signature) {
    return {
      ...buildUnlicensedState(macAddress, ctx.allMacs),
      status: 'invalid',
      message: '无效的 .lic 离线授权文件：缺少 license_key 或 signature 字段',
      appType: cleanAppType,
    };
  }

  const res = await callLicenseEndpoint(
    '/api/verify-offline',
    {
      app_type: cleanAppType,
      mac_address: macAddress,
      lic,
    },
    params.proxyUrl
  );

  const body = res.data || {};
  if (res.ok && body.ok) {
    const info = body.data || {};
    const expireTime = info.expire_time || String(lic.expire_time || '');
    const remainingDays = computeRemainingDays(expireTime, info.remaining_days);
    const record: LicenseRecord = {
      licenseKey: info.license_key || String(lic.license_key || '').toUpperCase(),
      appType: info.app_type || cleanAppType,
      appName: info.app_name || DEFAULT_APP_NAME,
      macAddress: (info.mac_address || macAddress).toUpperCase(),
      expireTime,
      remainingDays: remainingDays ?? undefined,
      activatedAt: nowStr,
      lastVerifiedAt: nowStr,
      proxyUrl: params.proxyUrl?.trim() || undefined,
      mode: 'offline',
    };
    try {
      localStorage.setItem(STORAGE_OFFLINE_LIC_KEY, JSON.stringify(lic));
    } catch {
      // ignore
    }
    await persistLicenseRecord(record);

    return {
      status: 'valid',
      isAuthorized: true,
      code: body.code || 'VALID',
      message: body.message || `离线许可证验签通过！可用剩余 ${remainingDays ?? '--'} 天`,
      remainingDays,
      expireTime: record.expireTime,
      appType: record.appType,
      appName: record.appName || DEFAULT_APP_NAME,
      macAddress: record.macAddress,
      allMacs: ctx.allMacs,
      licenseKey: record.licenseKey,
      lastVerifiedAt: nowStr,
      lastAttemptAt: nowStr,
      channelUsed: res.channelUsed,
      isOfflineGrace: false,
    };
  }

  return {
    status: 'invalid',
    isAuthorized: false,
    code: body.code || (res.networkError ? 'NETWORK_ERROR' : 'OFFLINE_VERIFY_FAILED'),
    message:
      body.message ||
      (res.networkError
        ? '无法连接授权服务器完成 .lic 验签，请检查网络或填写代理后重试'
        : `离线授权验签未通过 (HTTP ${res.status})`),
    remainingDays: null,
    expireTime: String(lic.expire_time || ''),
    appType: cleanAppType,
    appName: DEFAULT_APP_NAME,
    macAddress,
    allMacs: ctx.allMacs,
    licenseKey: String(lic.license_key || ''),
    lastAttemptAt: nowStr,
    channelUsed: res.channelUsed,
    isOfflineGrace: false,
  };
}

export async function verifyStoredLicense(options?: {
  proxyUrl?: string;
}): Promise<LicenseValidationState> {
  const ctx = await getMachineLicenseContext();
  const saved = ctx.savedLicense;
  const nowStr = new Date().toISOString();

  if (!saved || !saved.licenseKey) {
    return buildUnlicensedState(ctx.macAddress, ctx.allMacs);
  }

  const macToSend = (saved.macAddress || ctx.macAddress).toUpperCase();
  const appTypeToSend = (saved.appType || DEFAULT_APP_TYPE).toUpperCase();
  const proxyToUse = options?.proxyUrl !== undefined ? options.proxyUrl : saved.proxyUrl;

  // Check local expiration timestamp before waiting on remote network
  const localExpireMs = parseExpireTimeMs(saved.expireTime);
  if (localExpireMs !== null && localExpireMs <= Date.now()) {
    return {
      status: 'expired',
      isAuthorized: false,
      code: 'EXPIRED',
      message: `授权已于 ${saved.expireTime} 到期，请续期或更换新的授权码`,
      remainingDays: 0,
      expireTime: saved.expireTime,
      appType: appTypeToSend,
      appName: saved.appName || DEFAULT_APP_NAME,
      macAddress: macToSend,
      allMacs: ctx.allMacs,
      licenseKey: saved.licenseKey,
      lastVerifiedAt: saved.lastVerifiedAt,
      lastAttemptAt: nowStr,
      isOfflineGrace: false,
    };
  }

  let res: LicenseProxyApiResult;
  if (saved.mode === 'offline') {
    let rawLic: Record<string, unknown> | null = null;
    try {
      const licStr = localStorage.getItem(STORAGE_OFFLINE_LIC_KEY);
      if (licStr) rawLic = JSON.parse(licStr);
    } catch {
      rawLic = null;
    }
    if (rawLic && rawLic.signature) {
      res = await callLicenseEndpoint(
        '/api/verify-offline',
        { app_type: appTypeToSend, mac_address: macToSend, lic: rawLic },
        proxyToUse
      );
    } else {
      res = await callLicenseEndpoint(
        '/api/verify',
        { license_key: saved.licenseKey, app_type: appTypeToSend, mac_address: macToSend },
        proxyToUse
      );
    }
  } else {
    res = await callLicenseEndpoint(
      '/api/verify',
      { license_key: saved.licenseKey, app_type: appTypeToSend, mac_address: macToSend },
      proxyToUse
    );
  }

  const body = res.data || {};
  if (res.ok && body.ok) {
    const info = body.data || {};
    const expireTime = info.expire_time || saved.expireTime;
    const remainingDays = computeRemainingDays(expireTime, info.remaining_days);
    const updatedRecord: LicenseRecord = {
      ...saved,
      licenseKey: info.license_key || saved.licenseKey,
      appType: info.app_type || appTypeToSend,
      appName: info.app_name || saved.appName || DEFAULT_APP_NAME,
      macAddress: (info.mac_address || macToSend).toUpperCase(),
      expireTime,
      remainingDays: remainingDays ?? undefined,
      lastVerifiedAt: nowStr,
      proxyUrl: proxyToUse?.trim() || saved.proxyUrl,
    };
    await persistLicenseRecord(updatedRecord);

    return {
      status: 'valid',
      isAuthorized: true,
      code: body.code || 'VALID',
      message: body.message || `心跳校验通过，可用剩余 ${remainingDays ?? '--'} 天`,
      remainingDays,
      expireTime: updatedRecord.expireTime,
      appType: updatedRecord.appType,
      appName: updatedRecord.appName || DEFAULT_APP_NAME,
      macAddress: updatedRecord.macAddress,
      allMacs: ctx.allMacs,
      licenseKey: updatedRecord.licenseKey,
      lastVerifiedAt: nowStr,
      lastAttemptAt: nowStr,
      channelUsed: res.channelUsed,
      isOfflineGrace: false,
    };
  }

  // Weak-network resilience: if external server dengwk.ai.studio is temporarily unreachable/timeout,
  // do NOT interrupt already-authorized business workflows while within local validity + 7-day grace!
  if (res.networkError) {
    const localRemaining = computeRemainingDays(saved.expireTime, saved.remainingDays);
    const lastOkMs = saved.lastVerifiedAt ? Date.parse(saved.lastVerifiedAt) : null;
    const withinGraceWindow =
      lastOkMs !== null && !Number.isNaN(lastOkMs) && Date.now() - lastOkMs <= OFFLINE_GRACE_MAX_MS;

    if (withinGraceWindow && (localRemaining === null || localRemaining > 0)) {
      return {
        status: 'grace_offline',
        isAuthorized: true,
        code: 'OFFLINE_GRACE',
        message: `外网授权服务连接波动 (${body.message || '超时'})，已启用本地宽限授权，业务功能不中断`,
        remainingDays: localRemaining,
        expireTime: saved.expireTime,
        appType: appTypeToSend,
        appName: saved.appName || DEFAULT_APP_NAME,
        macAddress: macToSend,
        allMacs: ctx.allMacs,
        licenseKey: saved.licenseKey,
        lastVerifiedAt: saved.lastVerifiedAt,
        lastAttemptAt: nowStr,
        channelUsed: 'local-grace-cache',
        isOfflineGrace: true,
      };
    }

    return {
      status: 'invalid',
      isAuthorized: false,
      code: 'OFFLINE_GRACE_EXCEEDED',
      message: `授权心跳校验超时且已超过离线宽限期，请恢复网络或配置代理后重新校验`,
      remainingDays: localRemaining ?? 0,
      expireTime: saved.expireTime,
      appType: appTypeToSend,
      appName: saved.appName || DEFAULT_APP_NAME,
      macAddress: macToSend,
      allMacs: ctx.allMacs,
      licenseKey: saved.licenseKey,
      lastVerifiedAt: saved.lastVerifiedAt,
      lastAttemptAt: nowStr,
      isOfflineGrace: false,
    };
  }

  // Definitive server rejection (e.g., revoked, disabled, expired, MAC mismatch, app_type mismatch)
  const isExpiredCode =
    body.code === 'EXPIRED' ||
    String(body.message || '').includes('过期') ||
    res.status === 403;
  return {
    status: isExpiredCode ? 'expired' : 'invalid',
    isAuthorized: false,
    code: body.code || 'VERIFY_REJECTED',
    message: body.message || `授权校验失败 (HTTP ${res.status})，请联系管理员处理`,
    remainingDays: isExpiredCode ? 0 : computeRemainingDays(saved.expireTime),
    expireTime: saved.expireTime,
    appType: appTypeToSend,
    appName: saved.appName || DEFAULT_APP_NAME,
    macAddress: macToSend,
    allMacs: ctx.allMacs,
    licenseKey: saved.licenseKey,
    lastVerifiedAt: saved.lastVerifiedAt,
    lastAttemptAt: nowStr,
    channelUsed: res.channelUsed,
    isOfflineGrace: false,
  };
}

export async function clearStoredLicense(): Promise<LicenseValidationState> {
  await persistLicenseRecord(null);
  const ctx = await getMachineLicenseContext();
  return buildUnlicensedState(ctx.macAddress, ctx.allMacs);
}
