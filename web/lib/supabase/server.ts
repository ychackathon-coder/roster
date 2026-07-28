/**
 * Supabase server client — used ONLY for auth (who is this session?).
 * Data access never goes through Supabase from the server; see lib/db.ts.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) cookieStore.set(name, value, options);
          } catch {
            // Server Components cannot set cookies; middleware handles refresh.
          }
        },
      },
    },
  );
}
