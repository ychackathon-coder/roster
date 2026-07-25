import { NextResponse } from "next/server";
import { z } from "zod";

import { groqInferencer, runScan } from "@/lib/scan/runScan";

export const runtime = "nodejs";
export const maxDuration = 30;

const BodySchema = z.object({ input: z.string().min(1).max(600) });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide a company site or description." }, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  const result = await runScan(parsed.data.input, {
    inferencer: apiKey ? groqInferencer(apiKey) : null,
  });

  return NextResponse.json(result);
}
