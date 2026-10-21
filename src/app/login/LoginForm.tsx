"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="login-form">
      <label htmlFor="username">Username</label>
      <input
        id="username"
        name="username"
        className="input"
        autoComplete="username"
        autoCapitalize="none"
        autoFocus
        required
      />
      <label htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        className="input"
        autoComplete="current-password"
        required
      />
      {state.error && (
        <p className="form-error" role="alert">
          {"\u2715"} {state.error}
        </p>
      )}
      <button id="login-submit" className="btn" type="submit" disabled={pending}>
        {pending ? "Memeriksa..." : "Masuk"}
      </button>
    </form>
  );
}
