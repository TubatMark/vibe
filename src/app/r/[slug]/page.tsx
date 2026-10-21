import { Suspense } from "react";
import { Room } from "./room";

export default function RoomPage({ params }: PageProps<"/r/[slug]">) {
  // `params` is runtime data, so it has to resolve inside a Suspense boundary
  // for the route to stream under cacheComponents.
  return (
    <Suspense fallback={<Loading />}>
      <ResolvedRoom params={params} />
    </Suspense>
  );
}

async function ResolvedRoom({ params }: { params: PageProps<"/r/[slug]">["params"] }) {
  const { slug } = await params;
  return <Room slug={slug} />;
}

function Loading() {
  return (
    <main className="flex flex-1 items-center justify-center text-muted-foreground">
      loading…
    </main>
  );
}
