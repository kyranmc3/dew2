import Link from "next/link";

export default function NotFound() {
  return (
    <main className="center">
      <h1 className="logo">dew</h1>
      <p>That page doesn&apos;t exist.</p>
      <Link className="link" href="/">← All weeks</Link>
    </main>
  );
}
