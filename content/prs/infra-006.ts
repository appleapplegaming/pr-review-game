import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'infra-006',
  title: 'Simplify the report cache',
  author: 'nia.b',
  area: 'infra',
  description: 'Replaces the LRU report cache with a plain concurrent map.',
  language: 'java',
  diff: `
@@ src/main/java/com/shipit/reports/ReportCache.java @@
 public class ReportCache {
-  private final Map<String, Report> cache = lruMap(500);
+  private final Map<String, Report> cache =
+      new ConcurrentHashMap<>();
 
   public Report get(String tenant, String range) {
     String key = tenant + ":" + range;
     Report hit = cache.get(key);
     if (hit != null) {
       return hit;
     }
     Report fresh = builder.build(tenant, range);
+    cache.put(key, fresh);
+    return fresh;
   }
 }
`,
  featureValue: 400_000,
  bug: {
    type: 'outage',
    severity: 'major',
    lines: [3, 4],
    explanation:
      'The old cache evicted the least recently used entry once it passed 500 reports. The new ConcurrentHashMap never evicts, and the key includes a free-form date range, so every new tenant and range adds a large report that is kept forever. Heap use grows until the service runs out of memory and keeps restarting.',
    incident: '🔥 Report cache lost its size limit. Heap filled up, service crash-looped. 4h down',
  },
};
