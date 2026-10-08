import { signOut } from '@aila/auth/actions';

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button type="submit">Sign out</button>
    </form>
  );
}
