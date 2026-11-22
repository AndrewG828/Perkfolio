"use server";

import { signIn, signOut } from "@/backend/auth";

export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/tracker" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
