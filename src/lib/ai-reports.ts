import { prisma } from './prisma';

type AiReportType = 'summary' | 'compare' | 'trend' | 'audience' | 'evolution' | 'action_plan' | 'persona' | 'super_report';

/**
 * Saves an AI-generated report to the database.
 * Returns the ID of the created report, or null if save failed.
 */
export async function saveAiReport(
  channelId: number | null,
  type: AiReportType,
  content: string
): Promise<number | null> {
  try {
    const report = await prisma.aiReport.create({
      data: {
        channelId,
        type,
        content,
      },
    });
    return report.id;
  } catch (dbError) {
    console.error('Failed to save AI report to DB:', dbError);
    return null;
  }
}
