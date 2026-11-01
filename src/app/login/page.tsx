import SignInButton from "./SignInButton";

const ERRORS: Record<string, string> = {
  "not-allowed": "That Google account doesn't have access to dew.",
  "sign-in-failed": "Sign-in didn't finish. Try again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  return (
    <main className="center">
      <h1 className="logo">dew</h1>
      {message && <p role="alert">{message}</p>}
      <SignInButton />
    </main>
  );
}
