import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";

const COOKIE_NAME = "thought_journal_session";

export function getJournalOwnerId(req: Request, res: Response): string {
  const existingOwnerId = req.signedCookies?.[COOKIE_NAME];
  if (typeof existingOwnerId === "string" && existingOwnerId.length > 0) {
    return existingOwnerId;
  }

  const ownerId = randomUUID();
  res.cookie(COOKIE_NAME, ownerId, {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 365 * 24 * 60 * 60 * 1000,
    path: "/",
  });
  return ownerId;
}
