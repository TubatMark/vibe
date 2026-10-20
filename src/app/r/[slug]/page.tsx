import { Room } from "./room";

export default async function RoomPage({ params }: PageProps<"/r/[slug]">) {
  const { slug } = await params;
  return <Room slug={slug} />;
}
