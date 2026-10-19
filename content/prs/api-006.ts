import type { PullRequest } from '../../shared/types';

export const pr: PullRequest = {
  id: 'api-006',
  title: 'Add GET /users/{id} profile endpoint',
  author: 'omar.d',
  area: 'api',
  description: 'Adds an endpoint so the mobile app can load a user profile by id.',
  language: 'java',
  diff: `
@@ src/main/java/com/shipit/api/UserController.java @@
 @Entity
 public class User {
   private Long id;
   private String displayName;
   private String email;
   private String apiKeySecret;
   // getters omitted
 }
 
 @RestController
 @RequestMapping("/users")
 public class UserController {
   private final UserRepo repo;
+
+  @GetMapping("/{id}")
+  public User get(@PathVariable long id) {
+    return repo.findById(id)
+        .orElseThrow(NotFoundException::new);
+  }
 }
`,
  featureValue: 300_000,
  bug: {
    type: 'security',
    severity: 'minor',
    lines: [16, 17],
    explanation:
      "The endpoint returns the User entity directly, so the JSON includes the internal apiKeySecret field along with the email. Any caller can read another user's secret key by id. It should return a small response object with only the public fields.",
    incident: '🔓 Profile endpoint returned the raw user entity. API secret keys exposed. −$1M',
  },
};
