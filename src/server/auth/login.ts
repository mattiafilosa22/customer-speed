import { RateLimitedError, UnauthorizedError } from "@/lib/errors";
import { type AuthDeps, clockNow, parseInput } from "@/server/auth/deps";
import { loginSchema } from "@/server/auth/schemas";

/**
 * Pre-flight login use case: rate limiting + reCAPTCHA + credential verification.
 *
 * This runs BEFORE Auth.js `signIn` so brute-force/enumeration controls wrap the
 * credentials provider. On success it returns the resolved user; the calling
 * Server Action then establishes the JWT session via `signIn`.
 *
 * Non-revealing failures: every credential failure mode (unknown email, wrong
 * password, unverified, inactive) throws the SAME `UnauthorizedError`, so an
 * attacker cannot enumerate accounts. Rate limiting is keyed by IP AND by
 * account to slow both targeted and spray attacks (docs/06 §6.1).
 */
export interface LoginResult {
  readonly userId: string;
  readonly organizationId: string;
  readonly role: string;
}

export async function login(deps: AuthDeps, input: unknown): Promise<LoginResult> {
  const data = parseInput(loginSchema, input);

  const ipKey = deps.requestMeta?.ip ?? "unknown";
  const accountKey = `${data.organizationId}/${data.email}`;
  const byIp = await deps.rateLimiter.consume(`login:ip:${ipKey}`);
  const byAccount = await deps.rateLimiter.consume(`login:account:${accountKey}`);
  if (!byIp.allowed || !byAccount.allowed) {
    throw new RateLimitedError(Math.max(byIp.retryAfterSeconds, byAccount.retryAfterSeconds));
  }

  const captcha = await deps.verifyRecaptcha(data.recaptchaToken, {});
  if (captcha.outcome === "failed") {
    throw new UnauthorizedError("Invalid credentials");
  }

  const user = await deps.prisma.user.findUnique({
    where: { organizationId_email: { organizationId: data.organizationId, email: data.email } },
    select: {
      id: true,
      organizationId: true,
      role: true,
      passwordHash: true,
      isActive: true,
      emailVerified: true,
    },
  });

  const recordFailure = async (): Promise<never> => {
    await deps.audit.record({
      action: "auth.login.failed",
      organizationId: data.organizationId,
      entity: "User",
      entityId: user?.id ?? null,
      ip: deps.requestMeta?.ip ?? null,
      meta: { email: data.email },
    });
    throw new UnauthorizedError("Invalid credentials");
  };

  // Always run a verify to keep timing roughly constant on a missing user.
  const passwordOk = user?.passwordHash
    ? await deps.hasher.verify(data.password, user.passwordHash)
    : await deps.hasher.verify(data.password, DUMMY_HASH).then(() => false);

  if (!user || !user.passwordHash || !passwordOk || !user.isActive || !user.emailVerified) {
    return recordFailure();
  }

  await deps.prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: clockNow(deps) },
  });

  await deps.rateLimiter.reset(`login:account:${accountKey}`);

  await deps.audit.record({
    action: "auth.login",
    organizationId: user.organizationId,
    actorId: user.id,
    entity: "User",
    entityId: user.id,
    ip: deps.requestMeta?.ip ?? null,
  });

  return { userId: user.id, organizationId: user.organizationId, role: user.role };
}

const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZS1zYWx0LXZhbHVl$3hQ8m0Yx0n0xq3l9b1n1Yw2m5n6o7p8q9r0s1t2u3v4";
