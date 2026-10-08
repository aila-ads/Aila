import { signOut } from '@aila/auth/actions';
import { Button } from '../ui/button';

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="outline">
        Sign out
      </Button>
    </form>
  );
}
