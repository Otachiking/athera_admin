import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Masuk - Athera Admin",
  description: "Masuk ke Athera Admin dengan username dan password.",
};

export default function LoginPage() {
  return (
    <main className="login-wrap">
      <section className="login-card">
        <h1>Athera Admin</h1>
        <p className="sub">Masuk untuk melihat rekap pengeluaran</p>
        <LoginForm />
      </section>
    </main>
  );
}
