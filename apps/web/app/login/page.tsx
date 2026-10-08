import { Suspense } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@aila/ui/components/card';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-xl leading-none font-semibold">
            Sign in to Aila
          </h1>
          <CardDescription>Use your Aila account to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
