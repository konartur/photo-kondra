import * as argon2 from 'argon2';
import { config } from 'dotenv';
import { PrismaClient, UserRole } from '@prisma/client';
import { fileURLToPath } from 'node:url';

config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

function requiredEnvironmentVariable(name: 'ADMIN_EMAIL' | 'ADMIN_PASSWORD'): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} must be set before seeding the initial admin user.`);
  }

  return value;
}

const email = requiredEnvironmentVariable('ADMIN_EMAIL');
const password = requiredEnvironmentVariable('ADMIN_PASSWORD');
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const passwordHash = await argon2.hash(password);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: UserRole.ADMIN },
    create: { email, passwordHash, role: UserRole.ADMIN },
  });

  console.info(`Initial admin user is ready for ${email}.`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
