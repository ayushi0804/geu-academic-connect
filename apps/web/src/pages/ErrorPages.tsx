import { Link } from 'react-router-dom';
import { ShieldOff, Compass } from 'lucide-react';
import { Logo } from '@/components/AppShell';

const Shell = ({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
    <div className="rounded-full bg-muted p-4 text-muted-fg">{icon}</div>
    <h1 className="text-3xl font-semibold">{title}</h1>
    <p className="max-w-md text-sm text-muted-fg">{text}</p>
    <Link to="/" className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg">Go to dashboard</Link>
  </div>
);
export const NotFoundPage = () => <div className="min-h-screen bg-bg"><div className="p-6 text-fg"><Logo /></div><Shell icon={<Compass className="h-6 w-6" />} title="Page not found" text="The page you’re looking for doesn’t exist or has moved." /></div>;
export const UnauthorizedPage = () => <Shell icon={<ShieldOff className="h-6 w-6" />} title="You don’t have access" text="Your role doesn’t allow viewing this page. If you think this is a mistake, contact an administrator." />;
