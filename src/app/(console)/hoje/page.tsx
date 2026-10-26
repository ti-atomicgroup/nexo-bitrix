import type { Metadata } from "next";
import { TodayScreen } from "@/features/today/today-screen";

export const metadata: Metadata = { title: "Hoje" };

export default function HojePage() {
  return <TodayScreen />;
}
