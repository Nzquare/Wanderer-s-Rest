import { MemberPortal } from "@/components/customer/member-portal";

export default function MemberProfilePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-950 via-brand-900 to-brand-800 px-4 py-8 text-white">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-teal-400">
            Wanderer&apos;s Rest
          </p>
          <h1 className="mt-1 text-2xl font-semibold">My Profile</h1>
        </div>
        <MemberPortal />
      </div>
    </main>
  );
}
