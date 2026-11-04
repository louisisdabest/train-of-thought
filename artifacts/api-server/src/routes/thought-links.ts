import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import {
  CreateThoughtLinkBody,
  CreateThoughtLinkResponse,
  DeleteThoughtLinkParams,
  ListThoughtLinksQueryParams,
  ListThoughtLinksResponse,
} from "@workspace/api-zod";
import { db, thoughtLinksTable, thoughtsTable } from "@workspace/db";
import { getJournalOwnerId } from "../lib/journal-session";
import {
  dayBounds,
  parseDateQuery,
  parseTimezoneOffsetMinutes,
} from "./thoughts";

const router: IRouter = Router();

function validationError(res: Response, message: string): void {
  res.status(400).json({ error: message });
}

function localDayKey(value: Date, timezoneOffsetMinutes: number): string {
  return new Date(
    value.getTime() - timezoneOffsetMinutes * 60_000,
  ).toISOString().slice(0, 10);
}

router.get("/thought-links", async (req, res): Promise<void> => {
  const date = parseDateQuery(req.query.date);
  if (date === null) {
    validationError(res, "date must use YYYY-MM-DD format.");
    return;
  }
  const timezoneOffsetMinutes = parseTimezoneOffsetMinutes(
    req.query.timezoneOffsetMinutes,
  );
  if (timezoneOffsetMinutes === null) {
    validationError(res, "timezoneOffsetMinutes must be between -840 and 840.");
    return;
  }
  const parsed = ListThoughtLinksQueryParams.safeParse({
    ...req.query,
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
  const links = await db
    .select({
      id: thoughtLinksTable.id,
      sourceThoughtId: thoughtLinksTable.sourceThoughtId,
      targetThoughtId: thoughtLinksTable.targetThoughtId,
      createdAt: thoughtLinksTable.createdAt,
    })
    .from(thoughtLinksTable)
    .innerJoin(
      thoughtsTable,
      eq(thoughtsTable.id, thoughtLinksTable.sourceThoughtId),
    )
    .where(
      and(
        eq(thoughtLinksTable.ownerId, ownerId),
        eq(thoughtsTable.ownerId, ownerId),
        gte(thoughtsTable.createdAt, start),
        lt(thoughtsTable.createdAt, end),
      ),
    )
    .orderBy(asc(thoughtLinksTable.createdAt));

  res.json(ListThoughtLinksResponse.parse(links));
});

router.post("/thought-links", async (req, res): Promise<void> => {
  const parsed = CreateThoughtLinkBody.safeParse(req.body);
  if (!parsed.success) {
    validationError(res, parsed.error.message);
    return;
  }

  const {
    sourceThoughtId,
    targetThoughtId,
    timezoneOffsetMinutes,
  } = parsed.data;
  if (sourceThoughtId === targetThoughtId) {
    validationError(res, "A thought cannot connect to itself.");
    return;
  }

  const ownerId = getJournalOwnerId(req, res);
  const endpoints = await db
    .select({
      id: thoughtsTable.id,
      createdAt: thoughtsTable.createdAt,
    })
    .from(thoughtsTable)
    .where(
      and(
        eq(thoughtsTable.ownerId, ownerId),
        inArray(thoughtsTable.id, [sourceThoughtId, targetThoughtId]),
      ),
    );
  if (endpoints.length !== 2) {
    res.status(404).json({ error: "Both thought blocks must exist in your map." });
    return;
  }

  const source = endpoints.find((thought) => thought.id === sourceThoughtId);
  const target = endpoints.find((thought) => thought.id === targetThoughtId);
  if (
    !source ||
    !target ||
    localDayKey(source.createdAt, timezoneOffsetMinutes) !==
      localDayKey(target.createdAt, timezoneOffsetMinutes)
  ) {
    validationError(res, "Connect thought blocks from the same day.");
    return;
  }

  const [link] = await db
    .insert(thoughtLinksTable)
    .values({ ownerId, sourceThoughtId, targetThoughtId })
    .onConflictDoNothing()
    .returning({
      id: thoughtLinksTable.id,
      sourceThoughtId: thoughtLinksTable.sourceThoughtId,
      targetThoughtId: thoughtLinksTable.targetThoughtId,
      createdAt: thoughtLinksTable.createdAt,
    });
  if (!link) {
    res.status(409).json({ error: "Those thoughts are already connected." });
    return;
  }

  res.status(201).json(CreateThoughtLinkResponse.parse(link));
});

router.delete("/thought-links/:id", async (req, res): Promise<void> => {
  const params = DeleteThoughtLinkParams.safeParse(req.params);
  if (!params.success) {
    validationError(res, params.error.message);
    return;
  }
  const ownerId = getJournalOwnerId(req, res);
  const deleted = await db
    .delete(thoughtLinksTable)
    .where(
      and(
        eq(thoughtLinksTable.ownerId, ownerId),
        eq(thoughtLinksTable.id, params.data.id),
      ),
    )
    .returning({ id: thoughtLinksTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "Connection not found." });
    return;
  }
  res.sendStatus(204);
});

export default router;
