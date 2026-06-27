import { userService } from "../services/userService";

export interface SeedUser {
  username: string;
  password: string;
  email: string;
}

const DEFAULT_USERS: SeedUser[] = [
  { username: "test-alice", password: "testpass123", email: "alice@test.generale" },
  { username: "test-bob", password: "testpass123", email: "bob@test.generale" },
  { username: "test-charlie", password: "testpass123", email: "charlie@test.generale" },
  { username: "test-diana", password: "testpass123", email: "diana@test.generale" },
];

export async function seedTestUsers(users: SeedUser[] = DEFAULT_USERS): Promise<string[]> {
  const created: string[] = [];
  for (const u of users) {
    const existing = await userService.findByUsername(u.username);
    if (existing) {
      created.push(existing.id);
      continue;
    }
    const user = await userService.create(u.username, u.password, u.email);
    await userService.markVerified(user.id);
    created.push(user.id);
  }
  return created;
}

// run directly: bun run src/scripts/seed.ts
if (import.meta.main) {
  if (!process.env["DB_FILE_NAME"]) {
    console.error("Missing DB_FILE_NAME environment variable");
    process.exit(1);
  }
  const ids = await seedTestUsers();
  console.log(`Seeded ${ids.length} test users`);
  for (let i = 0; i < ids.length; i++) {
    const u = DEFAULT_USERS[i];
    if (u) console.log(`  ${u.username} -> ${ids[i]}`);
  }
}
