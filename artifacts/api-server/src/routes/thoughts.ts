import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import {
  CreateCategoryBody,
  CreateCategoryResponse,
  CreateThoughtBody,
  CreateThoughtResponse,
  DeleteThoughtParams,
  GetJournalSummaryQueryParams,
  GetJournalSummaryResponse,
  GetThoughtParams,
  GetThoughtResponse,
  ListCategoriesResponse,
  ListJournalDaysQueryParams,
  ListJournalDaysResponse,
  ListThoughtsQueryParams,
  ListThoughtsResponse,
  ReviewThoughtBody,
  ReviewThoughtParams,
  ReviewThoughtResponse,
  UpdateThoughtBody,
  UpdateThoughtParams,
  UpdateThoughtResponse,
} from "@workspace/api-zod";
import { categoriesTable, db, thoughtsTable } from "@workspace/db";
import { getJournalOwnerId } from "../lib/journal-session";

const router: IRouter = Router();

const thoughtFields = {
  id: thoughtsTable.id,
  content: thoughtsTable.content,
  categoryId: thoughtsTable.categoryId,
  categoryName: categoriesTable.name,
  createdAt: thoughtsTable.createdAt,
  updatedAt: thoughtsTable.updatedAt,
  reviewAt: thoughtsTable.reviewAt,
  reviewedAt: thoughtsTable.reviewedAt,
};

const defaultCategories = ["Lecture", "Research", "Question", "Reading", "Idea"];

export function parseDateQuery(value: unknown): Date | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : parsed;
}

export function parseTimezoneOffsetMinutes(value: unknown): number | null {
  if (value === undefined) return 0;
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) return null;
  const offset = Number(value);
  return Number.isInteger(offset) && offset >= -840 && offset <= 840
    ? offset
    : null;
}

export function dayBounds(
  date: Date,
  timezoneOffsetMinutes: number,
): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) +
      timezoneOffsetMinutes * 60_000,
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function validationError(res: Response, message: string): void {
  res.status(400).json({ error: message });
}

async function loadThought(ownerId: string, id: number) {
  const rows = await db
    .select(thoughtFields)
    .from(thoughtsTable)
    .leftJoin(categoriesTable, eq(thoughtsTable.categoryId, categoriesTable.id))
    .where(and(eq(thoughtsTable.ownerId, ownerId), eq(thoughtsTable.id, id)))
    .limit(1);
  return rows[0];
}

async function ownsCategory(ownerId: string, categoryId: number): Promise<boolean> {
  const rows = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(and(eq(categoriesTable.ownerId, ownerId), eq(categoriesTable.id, categoryId)))
    .limit(1);
  return rows.length > 0;
}

router.get("/thoughts", async (req, res): Promise<void> => {
  const timezoneOffsetMinutes = parseTimezoneOffsetMinutes(
    req.query.timezoneOffsetMinutes,
  );
  if (timezoneOffsetMinutes === null) {
    validationError(res, "timezoneOffsetMinutes must be between -840 and 840.");
    return;
  }
  const parsedDate = parseDateQuery(req.query.date);
  if (parsedDate === null) {
    validationError(res, "date must use YYYY-MM-DD format.");
    return;
  }

  const rawReviewDue = req.query.reviewDue;
  const reviewDue =
    typeof rawReviewDue === "string"
      ? rawReviewDue === "true"
        ? true
        : rawReviewDue === "false"
          ? false
          : rawReviewDue
      : rawReviewDue;
  const parsed = ListThoughtsQueryParams.safeParse({
    ...req.query,
    date: parsedDate,
    timezoneOffsetMinutes,
    reviewDue,
  });
  if (!parsed.success) {
    validationError(res, parsed.error.message);
    return;
  }

  const ownerId = getJournalOwnerId(req, res);
  const filters = [eq(thoughtsTable.ownerId, ownerId)];
  if (parsed.data.date) {
    const { start, end } = dayBounds(
      parsed.data.date,
      parsed.data.timezoneOffsetMinutes ?? 0,
    );
    filters.push(gte(thoughtsTable.createdAt, start), lt(thoughtsTable.createdAt, end));
  }
  if (parsed.data.categoryId !== undefined) {
    filters.push(eq(thoughtsTable.categoryId, parsed.data.categoryId));
  }
  if (parsed.data.search?.trim()) {
    filters.push(ilike(thoughtsTable.content, `%${parsed.data.search.trim()}%`));
  }
  if (parsed.data.reviewDue === true) {
    filters.push(
      lte(thoughtsTable.reviewAt, new Date()),
      or(isNull(thoughtsTable.reviewedAt), lt(thoughtsTable.reviewedAt, thoughtsTable.reviewAt))!,
    );
  } else if (parsed.data.reviewDue === false) {
    filters.push(
      or(
        isNull(thoughtsTable.reviewAt),
        gt(thoughtsTable.reviewAt, new Date()),
        and(
          isNotNull(thoughtsTable.reviewedAt),
          gte(thoughtsTable.reviewedAt, thoughtsTable.reviewAt),
        ),
      )!,
    );
  }

  const thoughts = await db
    .select(thoughtFields)
    .from(thoughtsTable)
    .leftJoin(categoriesTable, eq(thoughtsTable.categoryId, categoriesTable.id))
    .where(and(...filters))
    .orderBy(desc(thoughtsTable.createdAt));
  res.json(ListThoughtsResponse.parse(thoughts));
});

router.post("/thoughts", async (req, res): Promise<void> => {
  const parsed = CreateThoughtBody.safeParse(req.body);
  if (!parsed.success) {
    validationError(res, parsed.error.message);
    return;
  }

  const ownerId = getJournalOwnerId(req, res);
  const categoryId = parsed.data.categoryId ?? null;
  if (categoryId !== null && !(await ownsCategory(ownerId, categoryId))) {
    res.status(400).json({ error: "Choose a category from your journal." });
    return;
  }

  const [created] = await db
    .insert(thoughtsTable)
    .values({
      ownerId,
      content: parsed.data.content,
      categoryId,
      reviewAt: parsed.data.reviewAt ?? null,
    })
    .returning({ id: thoughtsTable.id });
  const thought = await loadThought(ownerId, created.id);
  res.status(201).json(CreateThoughtResponse.parse(thought));
});

router.get("/thoughts/:id", async (req, res): Promise<void> => {
  const params = GetThoughtParams.safeParse(req.params);
  if (!params.success) {
    validationError(res, params.error.message);
    return;
  }
  const ownerId = getJournalOwnerId(req, res);
  const thought = await loadThought(ownerId, params.data.id);
  if (!thought) {
    res.status(404).json({ error: "Thought not found." });
    return;
  }
  res.json(GetThoughtResponse.parse(thought));
});

router.patch("/thoughts/:id", async (req, res): Promise<void> => {
  const params = UpdateThoughtParams.safeParse(req.params);
  const parsed = UpdateThoughtBody.safeParse(req.body);
  if (!params.success) {
    validationError(res, params.error.message);
    return;
  }
  if (!parsed.success) {
    validationError(res, parsed.error.message);
    return;
  }
  const ownerId = getJournalOwnerId(req, res);
  const categoryId = parsed.data.categoryId;
  if (categoryId != null && !(await ownsCategory(ownerId, categoryId))) {
    res.status(400).json({ error: "Choose a category from your journal." });
    return;
  }
  await db
    .update(thoughtsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(thoughtsTable.ownerId, ownerId), eq(thoughtsTable.id, params.data.id)));
  const thought = await loadThought(ownerId, params.data.id);
  if (!thought) {
    res.status(404).json({ error: "Thought not found." });
    return;
  }
  res.json(UpdateThoughtResponse.parse(thought));
});

router.delete("/thoughts/:id", async (req, res): Promise<void> => {
  const params = DeleteThoughtParams.safeParse(req.params);
  if (!params.success) {
    validationError(res, params.error.message);
    return;
  }
  const ownerId = getJournalOwnerId(req, res);
  const deleted = await db
    .delete(thoughtsTable)
    .where(and(eq(thoughtsTable.ownerId, ownerId), eq(thoughtsTable.id, params.data.id)))
    .returning({ id: thoughtsTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Thought not found." });
    return;
  }
  res.sendStatus(204);
});

router.post("/thoughts/:id/review", async (req, res): Promise<void> => {
  const params = ReviewThoughtParams.safeParse(req.params);
  const parsed = ReviewThoughtBody.safeParse(req.body);
  if (!params.success) {
    validationError(res, params.error.message);
    return;
  }
  if (!parsed.success) {
    validationError(res, parsed.error.message);
    return;
  }
  const ownerId = getJournalOwnerId(req, res);
  const updated = await db
    .update(thoughtsTable)
    .set({
      reviewedAt: new Date(),
      reviewAt: parsed.data.nextReviewAt,
      updatedAt: new Date(),
    })
    .where(and(eq(thoughtsTable.ownerId, ownerId), eq(thoughtsTable.id, params.data.id)))
    .returning({ id: thoughtsTable.id });
  if (!updated.length) {
    res.status(404).json({ error: "Thought not found." });
    return;
  }
  const thought = await loadThought(ownerId, params.data.id);
  res.json(ReviewThoughtResponse.parse(thought));
});

router.get("/categories", async (req, res): Promise<void> => {
  const ownerId = getJournalOwnerId(req, res);
  const existing = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(eq(categoriesTable.ownerId, ownerId))
    .limit(1);
  if (!existing.length) {
    await db
      .insert(categoriesTable)
      .values(defaultCategories.map((name) => ({ ownerId, name })))
      .onConflictDoNothing();
  }
  const categories = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      thoughtCount: count(thoughtsTable.id),
    })
    .from(categoriesTable)
    .leftJoin(
      thoughtsTable,
      and(
        eq(thoughtsTable.categoryId, categoriesTable.id),
        eq(thoughtsTable.ownerId, ownerId),
      ),
    )
    .where(eq(categoriesTable.ownerId, ownerId))
    .groupBy(categoriesTable.id)
    .orderBy(categoriesTable.name);
  res.json(ListCategoriesResponse.parse(categories));
});

router.post("/categories", async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    validationError(res, parsed.error.message);
    return;
  }
  const name = parsed.data.name.trim();
  if (!name) {
    validationError(res, "Category name cannot be blank.");
    return;
  }
  const ownerId = getJournalOwnerId(req, res);
  const [category] = await db
    .insert(categoriesTable)
    .values({ ownerId, name })
    .onConflictDoNothing()
    .returning({
      id: categoriesTable.id,
      name: categoriesTable.name,
    });
  if (!category) {
    res.status(409).json({ error: "That category already exists." });
    return;
  }
  res.status(201).json(
    CreateCategoryResponse.parse({ ...category, thoughtCount: 0 }),
  );
});

router.get("/journal/summary", async (req, res): Promise<void> => {
  const timezoneOffsetMinutes = parseTimezoneOffsetMinutes(
    req.query.timezoneOffsetMinutes,
  );
  if (timezoneOffsetMinutes === null) {
    validationError(res, "timezoneOffsetMinutes must be between -840 and 840.");
    return;
  }
  const date = parseDateQuery(req.query.date);
  if (!date) {
    validationError(res, "date must use YYYY-MM-DD format.");
    return;
  }
  const parsed = GetJournalSummaryQueryParams.safeParse({
    date,
    timezoneOffsetMinutes,
  });
  if (!parsed.success) {
    validationError(res, parsed.error.message);
    return;
  }

  const ownerId = getJournalOwnerId(req, res);
  const { start, end } = dayBounds(
    parsed.data.date,
    parsed.data.timezoneOffsetMinutes ?? 0,
  );
  const [thoughtTotal] = await db
    .select({ value: count() })
    .from(thoughtsTable)
    .where(
      and(
        eq(thoughtsTable.ownerId, ownerId),
        gte(thoughtsTable.createdAt, start),
        lt(thoughtsTable.createdAt, end),
      ),
    );
  const [reviewedTotal] = await db
    .select({ value: count() })
    .from(thoughtsTable)
    .where(
      and(
        eq(thoughtsTable.ownerId, ownerId),
        gte(thoughtsTable.reviewedAt, start),
        lt(thoughtsTable.reviewedAt, end),
      ),
    );
  const [dueTotal] = await db
    .select({ value: count() })
    .from(thoughtsTable)
    .where(
      and(
        eq(thoughtsTable.ownerId, ownerId),
        gte(thoughtsTable.reviewAt, start),
        lt(thoughtsTable.reviewAt, end),
        or(isNull(thoughtsTable.reviewedAt), lt(thoughtsTable.reviewedAt, thoughtsTable.reviewAt)),
      ),
    );
  const categories = await db
    .select({
      categoryId: categoriesTable.id,
      categoryName: categoriesTable.name,
      thoughtCount: count(thoughtsTable.id),
    })
    .from(thoughtsTable)
    .innerJoin(categoriesTable, eq(thoughtsTable.categoryId, categoriesTable.id))
    .where(
      and(
        eq(thoughtsTable.ownerId, ownerId),
        gte(thoughtsTable.createdAt, start),
        lt(thoughtsTable.createdAt, end),
      ),
    )
    .groupBy(categoriesTable.id)
    .orderBy(desc(count(thoughtsTable.id)));
  res.json(
    GetJournalSummaryResponse.parse({
      date: parsed.data.date,
      thoughtCount: thoughtTotal.value,
      reviewedCount: reviewedTotal.value,
      dueCount: dueTotal.value,
      categories,
    }),
  );
});

router.get("/journal/days", async (req, res): Promise<void> => {
  const timezoneOffsetMinutes = parseTimezoneOffsetMinutes(
    req.query.timezoneOffsetMinutes,
  );
  if (timezoneOffsetMinutes === null) {
    validationError(res, "timezoneOffsetMinutes must be between -840 and 840.");
    return;
  }
  const parsed = ListJournalDaysQueryParams.safeParse({
    ...req.query,
    timezoneOffsetMinutes,
  });
  if (!parsed.success) {
    validationError(res, parsed.error.message);
    return;
  }
  const ownerId = getJournalOwnerId(req, res);
  const [year, month] = parsed.data.month.split("-").map(Number);
  if (month < 1 || month > 12) {
    validationError(res, "month must use a valid YYYY-MM value.");
    return;
  }
  const offset = parsed.data.timezoneOffsetMinutes ?? 0;
  const start = new Date(Date.UTC(year, month - 1, 1) + offset * 60_000);
  const end = new Date(Date.UTC(year, month, 1) + offset * 60_000);
  const day = sql<string>`to_char((${thoughtsTable.createdAt} AT TIME ZONE 'UTC') + (${-offset} * interval '1 minute'), 'YYYY-MM-DD')`;
  const counts = await db
    .select({ date: day, thoughtCount: count() })
    .from(thoughtsTable)
    .where(
      and(
        eq(thoughtsTable.ownerId, ownerId),
        gte(thoughtsTable.createdAt, start),
        lt(thoughtsTable.createdAt, end),
      ),
    )
    .groupBy(sql.raw("1"))
    .orderBy(sql.raw("1"));
  res.json(
    ListJournalDaysResponse.parse(
      counts.map((row) => ({
        date: new Date(`${row.date}T00:00:00.000Z`),
        thoughtCount: row.thoughtCount,
      })),
    ),
  );
});

export default router;
