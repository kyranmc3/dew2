"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignInButton() {
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setFailed(false);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setFailed(true);
  }

  return (
    <>
      <button type="button" className="btn" onClick={signIn}>
        Continue with Google
      </button>
      {failed && <p role="alert">Couldn&apos;t reach Google. Try again.</p>}
    </>
  );
}
