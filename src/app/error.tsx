"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="center">
      <h1 className="logo">dew</h1>
      <p>Something went wrong loading this page.</p>
      <button type="button" className="btn" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
