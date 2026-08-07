"use client";

import { useActionState, useState } from "react";
import { loginAction, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const KEYPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

export function LoginForm() {
  const [state, formAction, pending] = useActionState<
    LoginState | undefined,
    FormData
  >(loginAction, undefined);
  const [loginId, setLoginId] = useState("");
  const [secret, setSecret] = useState("");

  function pressKey(key: string) {
    if (key === "clear") {
      setSecret("");
    } else if (key === "back") {
      setSecret((s) => s.slice(0, -1));
    } else {
      setSecret((s) => (s.length >= 12 ? s : s + key));
    }
  }

  return (
    <form action={formAction} className="w-full max-w-sm space-y-6">
      <div className="space-y-2">
        <label
          htmlFor="loginId"
          className="text-sm font-medium text-foreground-muted"
        >
          Login ID
        </label>
        <input
          id="loginId"
          name="loginId"
          autoComplete="username"
          autoFocus
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          className="h-14 w-full rounded-xl border border-border bg-surface px-4 text-lg tracking-wide text-foreground outline-none focus:border-teal-500"
          placeholder="e.g. owner"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="secret"
          className="text-sm font-medium text-foreground-muted"
        >
          PIN / Password
        </label>
        <input
          id="secret"
          name="secret"
          type="password"
          autoComplete="current-password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="h-14 w-full rounded-xl border border-border bg-surface px-4 text-center text-2xl tracking-[0.5em] text-foreground outline-none focus:border-teal-500"
          placeholder="••••"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {KEYPAD_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => pressKey(key)}
            className={cn(
              "h-14 rounded-xl border border-border bg-surface text-xl font-medium text-foreground transition-colors active:bg-brand-800 active:text-white",
              (key === "clear" || key === "back") &&
                "text-sm text-foreground-muted",
            )}
          >
            {key === "clear" ? "Clear" : key === "back" ? "⌫" : key}
          </button>
        ))}
      </div>

      {state?.error && (
        <p className="rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        size="xl"
        className="w-full"
        disabled={pending}
      >
        {pending ? "Signing in…" : "Sign In"}
      </Button>
    </form>
  );
}
