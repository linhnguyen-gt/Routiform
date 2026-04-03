import { NextResponse } from "next/server";
import { listMemories, createMemory } from "@/lib/memory/store";
import { MemoryType } from "@/lib/memory/types";
import { z } from "zod";
import { validateBody, isValidationFailure } from "@/shared/validation/helpers";

const createMemorySchema = z.object({
  content: z.string().min(1),
  key: z.string().min(1),
  type: z.nativeEnum(MemoryType).default(MemoryType.FACTUAL),
  sessionId: z.string().default(""),
  apiKeyId: z.string().default(""),
  metadata: z.record(z.string(), z.unknown()).default({}),
  expiresAt: z.coerce.date().nullable().default(null),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const apiKeyId = searchParams.get("apiKeyId") || undefined;
    const type = (searchParams.get("type") as any) || undefined;
    const sessionId = searchParams.get("sessionId") || undefined;
    const limitParams = searchParams.get("limit");
    const offsetParams = searchParams.get("offset");

    const memories = await listMemories({
      apiKeyId,
      type,
      sessionId,
      limit: limitParams ? parseInt(limitParams, 10) : undefined,
      offset: offsetParams ? parseInt(offsetParams, 10) : undefined,
    });
    return NextResponse.json({ memories });
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const validation = validateBody(createMemorySchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json(validation.error, { status: 400 });
    }
    const memoryId = await createMemory(validation.data);
    return NextResponse.json({ success: true, id: memoryId });
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error }, { status: 400 });
  }
}
