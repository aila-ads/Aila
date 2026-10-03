import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <h1>Aila</h1>
      <p>Think, create, and build.</p>

      <nav aria-label="Account">
        <Link href="/login">Sign in</Link>
        {' · '}
        <Link href="/signup">Create account</Link>
      </nav>
    </main>
  );
}
