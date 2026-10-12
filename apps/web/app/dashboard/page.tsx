import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { ensureAilaIdentity } from '@aila/auth/server';

const products = [
  {
    name: 'Aila Intelligence',
    description: 'Think through ideas, solve problems, plan projects, and make better decisions.',
    href: '/intelligence',
    label: 'Think',
  },
  {
    name: 'Aila Writer',
    description: 'Create books, articles, long-form content, and polished written work.',
    href: '/writer',
    label: 'Create',
  },
  {
    name: 'Aila Translate',
    description: 'Translate content across languages while keeping your work organized.',
    href: '/translate',
    label: 'Translate',
  },
  {
    name: 'Aila Ads',
    description: 'Plan campaigns, develop ad copy, and turn advertising ideas into execution.',
    href: '/ads',
    label: 'Advertise',
  },
  {
    name: 'Aila Legal',
    description: 'Work with legal documents and have focused legal-oriented conversations.',
    href: '/legal',
    label: 'Analyze',
  },
  {
    name: 'Aila Coding',
    description: 'Build, understand, debug, and improve software with an AI coding workspace.',
    href: '/coding',
    label: 'Build',
  },
] as const;

export default async function DashboardPage() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase authentication environment is not configured');
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Session refresh is handled by the Next.js proxy.
        },
      },
    },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('Authenticated session could not be established');
  }

  const identity = await ensureAilaIdentity(user);
  const displayName = identity.name || identity.email || 'there';

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-black text-sm font-bold text-white">
              A
            </div>
            <span className="text-lg font-semibold tracking-tight">Aila</span>
          </div>

          <nav className="hidden items-center gap-6 text-sm text-[var(--muted)] md:flex">
            <a className="text-[var(--foreground)]" href="/dashboard">
              Dashboard
            </a>
            <a href="/settings">Settings</a>
          </nav>

          <div className="text-right">
            <p className="text-sm font-medium">{displayName}</p>
            <p className="text-xs text-[var(--muted)]">Aila account</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <section className="mb-10">
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            Your workspace
          </p>

          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Think, create, and build.
              </h1>
              <p className="mt-4 text-lg leading-8 text-[var(--muted)]">
                Choose an Aila workspace and get to work. Each product is
                designed around a different kind of task.
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Aila access
              </p>
              <p className="mt-1 text-sm font-medium">Trial account</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Your account and usage are managed from Aila.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="products-heading">
          <div className="mb-5">
            <h2 id="products-heading" className="text-xl font-semibold">
              Aila products
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              One account. Six focused workspaces.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <a
                key={product.name}
                href={product.href}
                className="group rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--color-focus)] focus:ring-offset-2"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--surface)] text-sm font-semibold">
                    {product.name
                      .replace('Aila ', '')
                      .slice(0, 1)}
                  </div>

                  <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--muted)]">
                    {product.label}
                  </span>
                </div>

                <h3 className="mt-6 text-lg font-semibold tracking-tight">
                  {product.name}
                </h3>

                <p className="mt-2 min-h-14 text-sm leading-6 text-[var(--muted)]">
                  {product.description}
                </p>

                <div className="mt-6 flex items-center text-sm font-semibold">
                  Open workspace
                  <span
                    aria-hidden="true"
                    className="ml-2 transition-transform group-hover:translate-x-1"
                  >
                    →
                  </span>
                </div>
              </a>
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold">Your Aila workspace</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                Your conversations, documents, translations, campaigns,
                legal work, and coding projects will live inside their
                respective workspaces.
              </p>
            </div>

            <a
              href="/settings"
              className="inline-flex shrink-0 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-white px-4 py-2.5 text-sm font-semibold transition hover:bg-[var(--surface)]"
            >
              Account settings
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
