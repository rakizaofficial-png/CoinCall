import { Suspense } from "react";
import CallSessionPage from "./CallSessionClient";

export default function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-ink text-sm text-muted">
          Connecting…
        </main>
      }
    >
      <CallSessionPage params={params} />
    </Suspense>
  );
}
