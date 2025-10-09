import { Spinner } from '@/components/ui/spinner';

export default function ConsoleLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="lg" />
        <p className="text-muted-foreground">Loading console...</p>
      </div>
    </div>
  );
}