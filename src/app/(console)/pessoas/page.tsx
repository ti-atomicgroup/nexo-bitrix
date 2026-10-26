import type { Metadata } from "next";
import { PeopleScreen } from "@/features/journeys/people-screen";

export const metadata: Metadata = { title: "Pessoas" };

export default function PessoasPage() {
  return <PeopleScreen />;
}
