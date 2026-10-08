import Link from 'next/link';
import { Button } from '@aila/ui/components/button';

export default function HomePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="grid gap-2">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Aila
        </h1>
        <p className="text-lg text-muted-foreground">
          Think, create, and build.
        </p>
      </div>

      <nav aria-label="Account" className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/signup">Create account</Link>
        </Button>
      </nav>
    </main>
  );
}
