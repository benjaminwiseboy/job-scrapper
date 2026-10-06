// Bounded concurrency without a dependency: runs `fn` over `items` with at
// most `limit` calls in flight, and keeps the results in input order.
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async (_, lane) => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i, lane);
    }
  });
  await Promise.all(lanes);
  return results;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
