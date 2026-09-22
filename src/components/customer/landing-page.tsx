import Link from "next/link";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings/service";

// The public "front door" — shown at "/" to anyone who isn't a logged-in
// staff member. Everything here is read-only marketing content sourced
// from the same settings/menu/game data staff manage in the Back Office,
// so it never drifts out of sync with what the café actually offers.
// Rendered per-request (see the `dynamic = "force-dynamic"` export on the
// page that uses this) rather than statically, same reasoning as
// src/app/member/page.tsx: it needs a live DB connection.
export async function LandingPage() {
  const [cafe, featuredItems, games, gameCategoryCount] = await Promise.all([
    getSettings("cafe"),
    prisma.menuItem.findMany({
      where: { active: true, customerVisible: true, featured: true },
      orderBy: { sortOrder: "asc" },
      take: 6,
      select: {
        id: true,
        nameEn: true,
        descriptionEn: true,
        basePrice: true,
        photoUrl: true,
      },
    }),
    prisma.game.findMany({
      where: { active: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: true, nameEn: true, imageUrl: true, genre: true },
    }),
    prisma.gameCategory.count({ where: { active: true } }),
  ]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-950 via-brand-900 to-brand-950 text-white">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-3">
          {cafe.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cafe.logoUrl} alt="" className="h-10 w-10 object-contain" />
          )}
          <span className="text-sm font-semibold uppercase tracking-[0.25em] text-teal-400">
            {cafe.nameEn}
          </span>
        </div>
        <Link
          href="/login"
          className="text-sm text-white/60 transition-colors hover:text-white"
        >
          Staff Login
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 pt-16 pb-20 text-center sm:pt-24">
        <p className="text-sm uppercase tracking-[0.35em] text-teal-400">
          {cafe.nameTh}
        </p>
        <h1 className="text-4xl font-semibold sm:text-6xl">{cafe.nameEn}</h1>
        <p className="max-w-xl text-lg text-white/70">
          A fantasy-themed board game café — pull up a chair, pick a quest
          from the shelf, and level up your table with every visit.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="#games"
            className="inline-flex h-14 items-center justify-center rounded-xl bg-teal-600 px-8 text-base font-medium text-white shadow-sm transition-colors hover:bg-teal-500"
          >
            Browse the Game Library
          </Link>
          <Link
            href="#visit"
            className="inline-flex h-14 items-center justify-center rounded-xl border border-white/20 px-8 text-base font-medium text-white transition-colors hover:bg-white/10"
          >
            Plan Your Visit
          </Link>
        </div>
      </section>

      {/* What awaits you */}
      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-20 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-teal-400">Game Library</h2>
          <p className="mt-2 text-sm text-white/70">
            {games.length > 0
              ? `${gameCategoryCount} categories of tabletop adventures, from quick party games to deep campaigns.`
              : "A growing shelf of tabletop adventures for every party size."}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-teal-400">Café Menu</h2>
          <p className="mt-2 text-sm text-white/70">
            Food and drinks made to keep the party going, ordered right from
            your table.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-teal-400">Level Up</h2>
          <p className="mt-2 text-sm text-white/70">
            Earn EXP with every visit, climb the ranks, and unlock member
            rewards along the way.
          </p>
        </div>
      </section>

      {/* Featured menu */}
      {featuredItems.length > 0 && (
        <section className="mx-auto max-w-5xl px-6 pb-20">
          <h2 className="mb-6 text-center text-2xl font-semibold">
            From the Menu
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredItems.map((item) => (
              <div
                key={item.id}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/5"
              >
                {item.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.photoUrl}
                    alt=""
                    className="h-40 w-full object-cover"
                  />
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium">{item.nameEn}</h3>
                    <span className="shrink-0 text-sm text-teal-400">
                      {cafe.currencySymbol}
                      {Number(item.basePrice).toFixed(0)}
                    </span>
                  </div>
                  {item.descriptionEn && (
                    <p className="mt-1 text-sm text-white/60">
                      {item.descriptionEn}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Game library teaser */}
      {games.length > 0 && (
        <section id="games" className="mx-auto max-w-5xl px-6 pb-20 scroll-mt-8">
          <h2 className="mb-6 text-center text-2xl font-semibold">
            On the Shelf
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {games.map((game) => (
              <div
                key={game.id}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/5"
              >
                {game.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={game.imageUrl}
                    alt=""
                    className="h-32 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-32 w-full items-center justify-center bg-brand-800 text-3xl">
                    🎲
                  </div>
                )}
                <div className="p-3">
                  <p className="truncate text-sm font-medium">{game.nameEn}</p>
                  {game.genre && (
                    <p className="truncate text-xs text-white/50">
                      {game.genre}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Visit us */}
      <section
        id="visit"
        className="mx-auto max-w-3xl scroll-mt-8 border-t border-white/10 px-6 py-16 text-center"
      >
        <h2 className="text-2xl font-semibold">Visit Us</h2>
        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-widest text-white/40">
              Hours
            </dt>
            <dd className="mt-1 text-white/80">{cafe.openingHours}</dd>
          </div>
          {cafe.address && (
            <div>
              <dt className="text-xs uppercase tracking-widest text-white/40">
                Address
              </dt>
              <dd className="mt-1 text-white/80">{cafe.address}</dd>
            </div>
          )}
          {cafe.phone && (
            <div>
              <dt className="text-xs uppercase tracking-widest text-white/40">
                Phone
              </dt>
              <dd className="mt-1 text-white/80">{cafe.phone}</dd>
            </div>
          )}
        </dl>
      </section>

      <footer className="px-6 pb-10 text-center text-xs text-white/30">
        © {new Date().getFullYear()} {cafe.nameEn}
      </footer>
    </main>
  );
}
