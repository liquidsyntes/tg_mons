import { cookies } from 'next/headers';
import { prisma } from './prisma';
import { parseSessionCookieValue, SESSION_COOKIE_NAME, type SessionIdentity } from './auth';

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export async function getActiveSession(): Promise<SessionIdentity> {
  try {
    const cookieStore = await cookies();
    const rawCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const parsed = await parseSessionCookieValue(rawCookie);
    return parsed ?? { userId: null, role: 'ADMIN' };
  } catch {
    return { userId: null, role: 'ADMIN' };
  }
}

export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,32}$/.test(trimmed)) return null;
  return trimmed;
}

export function isValidPassword(raw: unknown): raw is string {
  return typeof raw === 'string' && raw.length >= 6 && raw.length <= 128;
}

export function generateInviteCodeString(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i++) {
    part1 += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
    part2 += INVITE_ALPHABET[bytes[i + 4] % INVITE_ALPHABET.length];
  }
  return `TGMON-${part1}-${part2}`;
}

/**
 * Links pre-existing channels, AI reports, alert rules, and dismissed events
 * to the primary administrator account so nothing is lost during migration to multi-user.
 */
export async function claimOrphanedDataForAdmin(adminUserId: number): Promise<void> {
  if (typeof prisma.userChannel?.count !== 'function') return;

  const existingSubCount = await prisma.userChannel.count({
    where: { userId: adminUserId },
  });

  if (existingSubCount === 0) {
    const allChannels = await prisma.channel.findMany({
      select: {
        id: true,
        isMine: true,
        isFavorite: true,
        niche: true,
        isActive: true,
      },
    });

    if (allChannels.length > 0) {
      await prisma.userChannel.createMany({
        data: allChannels.map((ch) => ({
          userId: adminUserId,
          channelId: ch.id,
          isMine: ch.isMine,
          isFavorite: ch.isFavorite,
          niche: ch.niche || 'general',
          isActive: ch.isActive,
        })),
        skipDuplicates: true,
      });
    }
  }

  if (typeof prisma.aiReport?.updateMany === 'function') {
    await prisma.aiReport.updateMany({
      where: { userId: null },
      data: { userId: adminUserId },
    });
  }

  if (typeof prisma.alertRule?.updateMany === 'function') {
    await prisma.alertRule.updateMany({
      where: { userId: null },
      data: { userId: adminUserId },
    });
  }

  if (typeof prisma.event?.findMany === 'function' && typeof prisma.userDismissedEvent?.createMany === 'function') {
    const legacyDismissed = await prisma.event.findMany({
      where: { dismissedAt: { not: null } },
      select: { id: true, dismissedAt: true },
    });
    if (legacyDismissed.length > 0) {
      await prisma.userDismissedEvent.createMany({
        data: legacyDismissed.map((e) => ({
          userId: adminUserId,
          eventId: e.id,
          dismissedAt: e.dismissedAt ?? new Date(),
        })),
        skipDuplicates: true,
      });
    }
  }
}
