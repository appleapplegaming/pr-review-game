import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'ui-004',
  title: 'Show a loading state on the dashboard',
  author: 'rui.s',
  area: 'ui',
  description: 'Shows a spinner on the dashboard while the stats are loading.',
  language: 'ts',
  diff: `
@@ client/src/pages/Dashboard.tsx @@
 export function Dashboard({ range }: Props) {
   const [stats, setStats] = useState<Stats | null>(null);
+  const [loading, setLoading] = useState(false);

-  useEffect(() => {
-    fetchStats(range).then(setStats);
-  }, [range]);
+  useEffect(() => {
+    setLoading(true);
+    fetchStats(range).then((next) => {
+      setStats(next);
+      setLoading(false);
+    });
+  }, [range, stats]);

+  if (!stats) return <Spinner />;
   return <StatsGrid stats={stats} loading={loading} />;
 }
`,
  featureValue: 450_000,
  bug: {
    type: 'outage',
    severity: 'minor',
    lines: [14],
    explanation:
      'The effect depends on stats and also sets stats. Each fetch returns a new object, so the effect runs again, fetches again, and never stops. Every open dashboard hammers the stats API.',
    incident: '🔥 Dashboard stats effect refetches forever, hammering the API. 30 min down',
  },
};
