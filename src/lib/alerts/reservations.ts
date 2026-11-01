import { Prisma, type AlertRuleFire } from '@prisma/client';
import { prisma } from '../prisma';
import { logger } from '../logger';
import { ALERT_COOLDOWN_MS } from './types';

type PreviousFire = Pick<AlertRuleFire, 'id' | 'lastFiredAt' | 'lastValue'>;
type FireClaim = { id: number; previous: PreviousFire | null };
type PostFireClaim = { id: number };
export async function claimRuleFire(ruleId: number, channelId: number, value: number, now: Date): Promise<FireClaim | null> {
  try {
    return await prisma.$transaction(async tx => {
      const active = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "alert_rules" WHERE "id" = ${ruleId} AND "enabled" = true FOR UPDATE
      `;
      if (active.length === 0) return null;

      const existing = await tx.alertRuleFire.findUnique({
        where: { ruleId_channelId: { ruleId, channelId } },
        select: { id: true, lastFiredAt: true, lastValue: true },
      });
      if (existing) {
        const claimed = await tx.alertRuleFire.updateMany({
          where: { id: existing.id, lastFiredAt: { lte: new Date(now.getTime() - ALERT_COOLDOWN_MS) } },
          data: { lastFiredAt: now, lastValue: value },
        });
        return claimed.count ? { id: existing.id, previous: existing } : null;
      }

      const created = await tx.alertRuleFire.create({
        data: { ruleId, channelId, lastFiredAt: now, lastValue: value },
        select: { id: true },
      });
      return { id: created.id, previous: null };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
    throw error;
  }
}

export async function releaseRuleFire(claim: FireClaim, now: Date): Promise<void> {
  if (claim.previous) {
    await prisma.alertRuleFire.updateMany({
      where: { id: claim.id, lastFiredAt: now },
      data: { lastFiredAt: claim.previous.lastFiredAt, lastValue: claim.previous.lastValue },
    });
  } else {
    await prisma.alertRuleFire.deleteMany({ where: { id: claim.id, lastFiredAt: now } });
  }
}

export async function claimKeywordPostFire(ruleId: number, postId: number, now: Date): Promise<PostFireClaim | null> {
  try {
    return await prisma.$transaction(async tx => {
      const active = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "alert_rules" WHERE "id" = ${ruleId} AND "enabled" = true FOR UPDATE
      `;
      if (active.length === 0) return null;

      const existing = await tx.alertRulePostFire.findUnique({
        where: { ruleId_postId: { ruleId, postId } },
        select: { id: true },
      });
      if (existing) return null;

      const created = await tx.alertRulePostFire.create({
        data: { ruleId, postId, firedAt: now },
        select: { id: true },
      });
      return { id: created.id };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
    throw error;
  }
}

export async function releaseKeywordPostFire(claim: PostFireClaim, now: Date): Promise<void> {
  await prisma.alertRulePostFire.deleteMany({ where: { id: claim.id, firedAt: now } });
}

export async function recordRuleFiredAt(ruleId: number, channelId: number, now: Date): Promise<void> {
  try {
    await prisma.alertRule.updateMany({
      where: { id: ruleId, OR: [{ lastFiredAt: null }, { lastFiredAt: { lt: now } }] },
      data: { lastFiredAt: now },
    });
  } catch {
    logger.warn('Rule alert timestamp update failed', { ruleId, channelId });
  }
}
