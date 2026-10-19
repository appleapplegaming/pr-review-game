import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'auth-006',
  title: 'Support unsigned tokens for local dev',
  author: 'omar.d',
  area: 'auth',
  description: 'Lets the token verifier accept unsigned dev tokens so local testing needs no keys.',
  language: 'java',
  diff: `
@@ src/main/java/com/shipit/auth/TokenVerifier.java @@
 public class TokenVerifier {
   private final SignatureChecker signatures;
   private final ClaimsParser parser;

   public Claims verify(String jwt) {
     Token t = parser.split(jwt);
+    if ("none".equalsIgnoreCase(t.getAlg())) {
+      // Dev tokens are unsigned, so skip the signature check.
+      return parser.claims(t);
+    }
     if (!signatures.isValid(t)) {
       throw new AuthException("bad signature");
     }
     Claims claims = parser.claims(t);
     if (claims.isExpired()) {
       throw new AuthException("expired");
     }
     return claims;
   }
 }
`,
  featureValue: 400_000,
  bug: {
    type: 'security',
    severity: 'critical',
    lines: [7, 8, 9, 10],
    explanation:
      'The alg field comes from the token itself, which the caller controls. Anyone can craft a token with alg "none" and any claims, such as an admin user id, and it is accepted without a signature check, and without the expiry check too. The dev shortcut must not exist in the production verifier.',
    incident: '🔓 Unsigned token bypass shipped. Attackers forged admin sessions. −$8M',
  },
};
