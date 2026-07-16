// frontend/src/app/api/events/route.ts
//
// SSE STREAMING PROXY — browser ⇆ Go notifier service
// ─────────────────────────────────────────────────────────────────────────────
// The generic /api/proxy route buffers whole responses (arrayBuffer), which
// would deadlock a never-ending SSE stream. This dedicated route pipes the
// notifier's response body straight through, chunk by chunk, while still
// injecting the authenticated user's identity server-side — the browser can
// never subscribe to another user's event stream.
//
//   EventSource("/api/events")
//        └─▶ this route (adds X-User-Email from the NextAuth session)
//               └─▶ Go notifier GET /events/stream  (Kafka-driven)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const NOTIFIER_URL = process.env.NOTIFIER_URL ?? "http://localhost:8090";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email;

  if (!userEmail) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  try {
    const upstream = await fetch(`${NOTIFIER_URL}/events/stream`, {
      headers: {
        "x-user-email": userEmail,
        accept: "text/event-stream",
      },
      cache: "no-store",
      // Abort the upstream connection when the browser disconnects
      signal: req.signal,
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "Notifier unavailable" }, { status: 502 });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    // Notifier down → 502 tells the client hook to fall back to polling
    return NextResponse.json({ error: "Notifier unreachable" }, { status: 502 });
  }
}
