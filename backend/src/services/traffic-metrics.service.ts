type TrafficBucket = {
  requests: number;
  inboundBytes: number;
  outboundBytes: number;
};

const BUCKET_SIZE_MS = 60 * 60 * 1000;
const MAX_BUCKETS = 48;

const buckets = new Map<number, TrafficBucket>();

function pruneBuckets() {
  const cutoff = Date.now() - BUCKET_SIZE_MS * MAX_BUCKETS;

  for (const key of buckets.keys()) {
    if (key < cutoff) {
      buckets.delete(key);
    }
  }
}

function getBucketStart(timestampMs: number) {
  return Math.floor(timestampMs / BUCKET_SIZE_MS) * BUCKET_SIZE_MS;
}

export function recordTrafficSample({
  timestamp = Date.now(),
  inboundBytes = 0,
  outboundBytes = 0,
}: {
  timestamp?: number;
  inboundBytes?: number;
  outboundBytes?: number;
}) {
  const bucketStart = getBucketStart(timestamp);
  const current = buckets.get(bucketStart) ?? {
    requests: 0,
    inboundBytes: 0,
    outboundBytes: 0,
  };

  current.requests += 1;
  current.inboundBytes += inboundBytes;
  current.outboundBytes += outboundBytes;

  buckets.set(bucketStart, current);
  pruneBuckets();
}

export function getTrafficSeries(hours = 12) {
  const clampedHours = Math.max(1, Math.min(hours, 24));
  const now = Date.now();
  const currentBucket = getBucketStart(now);

  return Array.from({ length: clampedHours }, (_, index) => {
    const bucketStart = currentBucket - BUCKET_SIZE_MS * (clampedHours - 1 - index);
    const bucket = buckets.get(bucketStart) ?? {
      requests: 0,
      inboundBytes: 0,
      outboundBytes: 0,
    };
    const date = new Date(bucketStart);
    const hour = date.getHours();

    return {
      bucketStart: new Date(bucketStart).toISOString(),
      label: index === clampedHours - 1 ? "Now" : `${hour}h`,
      requests: bucket.requests,
      inboundBytes: bucket.inboundBytes,
      outboundBytes: bucket.outboundBytes,
    };
  });
}
