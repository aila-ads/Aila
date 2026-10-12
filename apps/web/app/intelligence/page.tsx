import Link from 'next/link';

const starters = [
  {
    title: 'Explore an idea',
    prompt: 'Help me think through an idea and identify the strongest opportunities, risks, and next steps.',
  },
  {
    title: 'Solve a problem',
    prompt: 'Help me break down a difficult problem, examine the possible approaches, and choose a practical path forward.',
  },
  {
    title: 'Plan a project',
    prompt: 'Help me turn a project idea into a clear plan with priorities, milestones, dependencies, and next actions.',
  },
  {
    title: 'Make a decision',
    prompt: 'Help me compare my options, identify the important trade-offs, and reach a well-reasoned decision.',
  },
];

export default function IntelligencePage() {
  return (
    <div className="flex min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <aside className="hidden w-64 shrink-0 border-r border-[var(--border)] bg-white lg:flex lg:flex-col">
        <div className="flex h-16 items-center border-b border-[var(--border)] px-5">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black text-xs font-bold text-white">
              A
            </div>
            <span className="font-semibold tracking-tight">Aila</span>
          </Link>
        </div>

        <div className="flex-1 p-4">
          <Link
            href="/dashboard"
            className="mb-5 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
          >
            <span aria-hidden="true">←</span>
            All products
          </Link>

          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Intelligence
          </p>

          <nav className="mt-2 space-y-1">
            <a
              href="#"
              className="block rounded-lg bg-[var(--surface)] px-3 py-2 text-sm font-medium"
            >
              New conversation
            </a>
            <a
              href="#"
              className="block rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
            >
              Conversations
            </a>
          </nav>
        </div>

        <div className="border-t border-[var(--border)] p-4">
          <Link
            href="/settings"
            className="block rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
          >
            Settings
          </Link>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 items-center justify-between border-b border-[var(--border)] bg-white px-5 sm:px-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
              Aila product
            </p>
            <h1 className="text-base font-semibold">Intelligence</h1>
          </div>

          <Link
            href="/dashboard"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--surface)] lg:hidden"
          >
            Products
          </Link>
        </header>

        <div className="flex flex-1 flex-col">
          <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-5 py-10 sm:px-8">
            <div className="flex flex-1 flex-col items-center justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-xl font-bold text-white">
                A
              </div>

              <p className="mt-6 text-sm font-medium text-[var(--muted)]">
                Aila Intelligence
              </p>

              <h2 className="mt-2 text-center text-3xl font-semibold tracking-tight sm:text-4xl">
                What are you thinking about?
              </h2>

              <p className="mt-3 max-w-xl text-center text-sm leading-6 text-[var(--muted)] sm:text-base">
                Explore ideas, solve problems, plan projects, and work through
                decisions with a focused Aila workspace.
              </p>

              <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
                {starters.map((starter) => (
                  <button
                    key={starter.title}
                    type="button"
                    className="rounded-xl border border-[var(--border)] bg-white p-4 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface)]"
                  >
                    <span className="block text-sm font-semibold">
                      {starter.title}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
                      {starter.prompt}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8">
              <form className="rounded-2xl border border-[var(--border-strong)] bg-white p-3 shadow-sm">
                <textarea
                  name="message"
                  rows={3}
                  placeholder="Message Aila Intelligence..."
                  className="w-full resize-none border-0 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-[var(--muted)]"
                  aria-label="Message Aila Intelligence"
                />

                <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-3">
                  <p className="px-2 text-xs text-[var(--muted)]">
                    Aila Intelligence
                  </p>

                  <button
                    type="submit"
                    className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
                  >
                    Send
                  </button>
                </div>
              </form>

              <p className="mt-3 text-center text-xs text-[var(--muted)]">
                Aila Intelligence is designed for thinking, planning, and
                problem-solving.
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
