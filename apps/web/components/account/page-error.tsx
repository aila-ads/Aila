import Link from 'next/link';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { SignOutButton } from './sign-out-button';

/** Safe error state for a signed-in page, with a retry (APPLICATION-ARCHITECTURE §44). */
export function PageError({ title, message, retryHref }: { title: string; message: string; retryHref: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="sr-only">Error: </span>
          {title}
        </CardTitle>
        <CardDescription role="alert">{message}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={retryHref}>Try again</Link>
        </Button>
        <SignOutButton />
      </CardContent>
    </Card>
  );
}
