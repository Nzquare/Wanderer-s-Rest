import Link from "next/link";
import { Cinzel, Lora } from "next/font/google";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings/service";

// Display face for headings/wordmark — an engraved, storybook feel.
const cinzel = Cinzel({ subsets: ["latin"], weight: ["600", "700"] });
// Warm serif for body copy, softer and more "tavern menu" than the app's
// usual Geist Sans (which stays as-is on every operational screen).
const lora = Lora({ subsets: ["latin"], weight: ["400", "500", "600"] });

// The public "front door" — shown at "/" to anyone who isn't a logged-in
// staff member. Everything here is read-only marketing content sourced
// from the same settings/menu/game data staff manage in the Back Office,
// so it never drifts out of sync with what the café actually offers.
// Rendered per-request (see the `dynamic = "force-dynamic"` export on the
// page that uses this) rather than statically, same reasoning as
// src/app/member/page.tsx: it needs a live DB connection.
//
// Styling here is deliberately its own thing rather than the shared
// brand-950/teal operational palette (see globals.css's brand-tokens
// comment — customer-facing screens are allowed extra fantasy flourish).
// The colors are one-off warm/amber tones scoped to this file only, going
// for a firelit tavern rather than a SaaS dashboard.
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
    <main
      className={`${lora.className} min-h-screen bg-[#1b120b] bg-[radial-gradient(ellipse_120%_55%_at_50%_-10%,#5a361b_0%,#2c1c11_45%,#160e08_100%)] text-[#f1e2c8]`}
    >
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-3">
          {cafe.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cafe.logoUrl} alt="" className="h-10 w-10 object-contain" />
          )}
          <span
            className={`${cinzel.className} text-sm tracking-[0.25em] text-[#d9a441]`}
          >
            {cafe.nameEn}
          </span>
        </div>
        <Link
          href="/login"
          className="text-sm text-[#a3855f] transition-colors hover:text-[#f1e2c8]"
        >
          Staff Login
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 pt-16 pb-20 text-center sm:pt-24">
        <p className="text-sm uppercase tracking-[0.35em] text-[#d9a441]">
          {cafe.nameTh}
        </p>
        <h1 className={`${cinzel.className} text-4xl sm:text-6xl`}>
          {cafe.nameEn}
        </h1>
        <p className="max-w-xl text-lg text-[#cbb28f]">
          A fantasy-themed board game café where every table feels like your
          favorite tavern corner — good company, warm food, and a quest
          waiting on the shelf.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="#games"
            className="inline-flex h-14 items-center justify-center rounded-lg bg-[#c98a3c] px-8 text-base font-semibold text-[#241206] shadow-[inset_0_1px_0_rgba(255,224,168,0.4)] transition-colors hover:bg-[#d99b4c]"
          >
            Browse the Game Library
          </Link>
          <Link
            href="#visit"
            className="inline-flex h-14 items-center justify-center rounded-lg border border-[#c98a3c]/40 px-8 text-base font-medium text-[#f1e2c8] transition-colors hover:bg-[#c98a3c]/10"
          >
            Plan Your Visit
          </Link>
        </div>
      </section>

      {/* What awaits you */}
      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-20 sm:grid-cols-3">
        <div className="rounded-xl border border-[#6b4423]/40 bg-[#241708]/60 p-6 shadow-[inset_0_1px_0_rgba(255,200,140,0.06)]">
          <h2 className={`${cinzel.className} text-lg text-[#d9a441]`}>
            Game Library
          </h2>
          <p className="mt-2 text-sm text-[#cbb28f]">
            {games.length > 0
              ? `${gameCategoryCount} shelves of tabletop adventures, from quick party games to campaigns that stretch into the night.`
              : "A growing shelf of tabletop adventures for every party size."}
          </p>
        </div>
        <div className="rounded-xl border border-[#6b4423]/40 bg-[#241708]/60 p-6 shadow-[inset_0_1px_0_rgba(255,200,140,0.06)]">
          <h2 className={`${cinzel.className} text-lg text-[#d9a441]`}>
            Café Menu
          </h2>
          <p className="mt-2 text-sm text-[#cbb28f]">
            Hearty food and warm drinks to keep the table going, ordered
            right from where you sit.
          </p>
        </div>
        <div className="rounded-xl border border-[#6b4423]/40 bg-[#241708]/60 p-6 shadow-[inset_0_1px_0_rgba(255,200,140,0.06)]">
          <h2 className={`${cinzel.className} text-lg text-[#d9a441]`}>
            Level Up
          </h2>
          <p className="mt-2 text-sm text-[#cbb28f]">
            Earn EXP with every visit, climb the ranks, and unlock member
            rewards worth coming back for.
          </p>
        </div>
      </section>

      {/* Featured menu */}
      {featuredItems.length > 0 && (
        <section className="mx-auto max-w-5xl px-6 pb-20">
          <h2
            className={`${cinzel.className} mb-6 text-center text-2xl text-[#f1e2c8]`}
          >
            From the Menu
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredItems.map((item) => (
              <div
                key={item.id}
                className="overflow-hidden rounded-xl border border-[#6b4423]/40 bg-[#241708]/60"
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
                    <h3 className="font-medium text-[#f1e2c8]">
                      {item.nameEn}
                    </h3>
                    <span className="shrink-0 text-sm text-[#d9a441]">
                      {cafe.currencySymbol}
                      {Number(item.basePrice).toFixed(0)}
                    </span>
                  </div>
                  {item.descriptionEn && (
                    <p className="mt-1 text-sm text-[#a3855f]">
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
          <h2
            className={`${cinzel.className} mb-6 text-center text-2xl text-[#f1e2c8]`}
          >
            On the Shelf
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {games.map((game) => (
              <div
                key={game.id}
                className="overflow-hidden rounded-xl border border-[#6b4423]/40 bg-[#241708]/60"
              >
                {game.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={game.imageUrl}
                    alt=""
                    className="h-32 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-32 w-full items-center justify-center bg-[#1b120b] text-3xl">
                    🎲
                  </div>
                )}
                <div className="p-3">
                  <p className="truncate text-sm font-medium text-[#f1e2c8]">
                    {game.nameEn}
                  </p>
                  {game.genre && (
                    <p className="truncate text-xs text-[#a3855f]">
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
        className="mx-auto max-w-3xl scroll-mt-8 border-t border-[#6b4423]/30 px-6 py-16 text-center"
      >
        <h2 className={`${cinzel.className} text-2xl text-[#f1e2c8]`}>
          Visit Us
        </h2>
        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-widest text-[#a3855f]">
              Hours
            </dt>
            <dd className="mt-1 text-[#cbb28f]">{cafe.openingHours}</dd>
          </div>
          {cafe.address && (
            <div>
              <dt className="text-xs uppercase tracking-widest text-[#a3855f]">
                Address
              </dt>
              <dd className="mt-1 text-[#cbb28f]">{cafe.address}</dd>
            </div>
          )}
          {cafe.phone && (
            <div>
              <dt className="text-xs uppercase tracking-widest text-[#a3855f]">
                Phone
              </dt>
              <dd className="mt-1 text-[#cbb28f]">{cafe.phone}</dd>
            </div>
          )}
        </dl>
      </section>

      <footer className="px-6 pb-10 text-center text-xs text-[#6b4423]">
        © {new Date().getFullYear()} {cafe.nameEn}
      </footer>
    </main>
  );
}
