import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@aila/ui/components/card';
import { SignupForm } from './signup-form';

export default function SignupPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-xl leading-none font-semibold">
            Create your Aila account
          </h1>
          <CardDescription>
            Your account starts with a 3-hour Aila trial.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm />
        </CardContent>
      </Card>
    </main>
  );
}
