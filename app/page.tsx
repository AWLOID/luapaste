import { getSession } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import Dashboard, { ScriptItem } from '@/components/Dashboard';
import LoginForm from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

async function getScripts(): Promise<ScriptItem[]> {
  const { data } = await supabaseAdmin()
    .from('scripts')
    .select('id,name,extension,hits,is_encrypted,expires_at,last_accessed_at,created_at,updated_at')
    .order('created_at', { ascending: false });

  return (data || []) as ScriptItem[];
}

export default async function HomePage() {
  const session = await getSession();

  if (!session || session.role !== 'admin') {
    return (
      <main className="page">
        <LoginForm />
      </main>
    );
  }

  const scripts = await getScripts();

  return (
    <main className="page">
      <Dashboard initialScripts={scripts} adminEmail={session.email} />
    </main>
  );
}