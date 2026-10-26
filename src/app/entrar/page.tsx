import type { Metadata } from "next";
import { LoginScreen } from "@/features/access/login-screen";

export const metadata: Metadata = { title: "Entrar" };

export default function EntrarPage() {
  return <LoginScreen />;
}
