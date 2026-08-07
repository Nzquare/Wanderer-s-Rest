import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/auth/current-user";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const staff = await getCurrentStaff();
  if (staff) redirect("/");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-brand-950 px-4 py-12">
      <div className="mb-8 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-teal-400">
          Wanderer&apos;s Rest
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Staff Sign In
        </h1>
      </div>
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl">
        <LoginForm />
      </div>
    </main>
  );
}
