import type { VmwareProfileSnapshot } from "../adapters/vmware.adapter";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

type CacheEntry = {
  snapshot: VmwareProfileSnapshot;
  scannedAt: string;
  expiresAt: number;
};

const vmwareProfileCache = new Map<string, CacheEntry>();

export async function getCachedVmwareProfile(
  vmxPath: string,
  loader: () => Promise<VmwareProfileSnapshot>,
) {
  const now = Date.now();
  const cached = vmwareProfileCache.get(vmxPath);

  if (cached && cached.expiresAt > now) {
    return {
      snapshot: cached.snapshot,
      scannedAt: cached.scannedAt,
      fromCache: true,
    };
  }

  const snapshot = await loader();
  const scannedAt = new Date(now).toISOString();

  vmwareProfileCache.set(vmxPath, {
    snapshot,
    scannedAt,
    expiresAt: now + TWELVE_HOURS_MS,
  });

  return {
    snapshot,
    scannedAt,
    fromCache: false,
  };
}

export function invalidateVmwareProfileCache(vmxPath?: string | null) {
  if (!vmxPath) {
    return;
  }

  vmwareProfileCache.delete(vmxPath);
}
