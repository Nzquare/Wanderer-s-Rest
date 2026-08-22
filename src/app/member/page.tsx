import { getSettings } from "@/server/settings/service";
import { MemberPortal } from "@/components/customer/member-portal";

// This page has no dynamic route segment, so Next would otherwise try to
// statically prerender it at *build* time — which needs a live DB
// connection for getSettings("cafe") below, something a build environment
// may not have (and even when it does, a static prerender would freeze
// whatever the café name/logo happened to be at build time until the next
// deploy). Render it per-request instead, like /t/[token] and /member's
// own sibling pages already are by virtue of their dynamic segments.
export const dynamic = "force-dynamic";

export default async function MemberProfilePage() {
  const cafe = await getSettings("cafe");

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-950 via-brand-900 to-brand-800 px-4 py-8 text-white">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          {cafe.logoUrl && (
            // See src/app/t/[token]/page.tsx's own comment — same logo,
            // same fallback (§Receipt/website logo).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cafe.logoUrl} alt="" className="mx-auto mb-2 h-16 w-16 object-contain" />
          )}
          <p className="text-xs uppercase tracking-[0.35em] text-teal-400">{cafe.nameEn}</p>
          <h1 className="mt-1 text-2xl font-semibold">My Profile</h1>
        </div>
        <MemberPortal />
      </div>
    </main>
  );
}
