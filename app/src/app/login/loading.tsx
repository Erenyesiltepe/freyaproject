import { Spinner } from '@/components/ui/spinner';

export default function LoginLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="lg" />
        <p className="text-muted-foreground">Loading login page...</p>
      </div>
    </div>
  );
}