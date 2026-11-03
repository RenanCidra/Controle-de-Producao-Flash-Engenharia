import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { feedbackSubmissions } from '../../db/schema.ts';

export class FeedbackRepository {
  static async list() {
    return db.select().from(feedbackSubmissions)
      .orderBy(desc(feedbackSubmissions.createdAt), desc(feedbackSubmissions.id)).limit(100);
  }

  static async create(input: {
    category: string; title: string; description: string; sourceScreen: string | null;
    submitterUid: string; submitterName: string;
  }) {
    const [created] = await db.insert(feedbackSubmissions).values(input).returning();
    return created;
  }

  static async updateStatus(id: number, status: string) {
    const [updated] = await db.update(feedbackSubmissions)
      .set({ status, updatedAt: new Date() }).where(eq(feedbackSubmissions.id, id)).returning();
    return updated || null;
  }
}
