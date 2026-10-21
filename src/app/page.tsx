import { Suspense } from "react";
import { connection } from "next/server";
import Dashboard from "@/components/Dashboard";
import { getUser } from "@/lib/auth";
import { loadData } from "@/lib/data";

async function DashboardLoader() {
  // Data dibaca dari database di setiap request.
  await connection();
  const [data, user] = await Promise.all([loadData(), getUser()]);
  return <Dashboard data={data} user={user ?? "?"} />;
}

export default function Home() {
  return (
    <Suspense fallback={<p style={{ padding: 24 }}>Memuat data...</p>}>
      <DashboardLoader />
    </Suspense>
  );
}
