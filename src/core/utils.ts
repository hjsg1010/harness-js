import { createHash, randomUUID } from "node:crypto";

export function nowIso(now = new Date()): string {
  return now.toISOString();
}

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "untitled";
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort(), 2);
}

export function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

export function truncate(value: string, max = 80): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 3)}...`;
}

export function toTitleFromAcceptanceCriterion(criterion: string): string {
  return truncate(
    criterion
      .replace(/\s+/g, " ")
      .replace(/^[\-\d.\s]+/, "")
      .trim(),
    72
  );
}

export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}
