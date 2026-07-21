import { createClient } from '@supabase/supabase-js';
import { env } from './env';

export type UserRole = 'admin' | 'user';

export type UserRow = {
  id: string;
  email: string;
  username: string | null;
  password_hash: string | null;
  role: UserRole;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ScriptRow = {
  id: string;
  owner_user_id: string | null;
  name: string;
  extension: 'lua' | 'txt';
  content: string;
  token_hash: string;
  is_encrypted: boolean;
  hits: number;
  expires_at: string | null;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
};

export function supabaseAdmin() {
  return createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: {
        'X-Client-Info': 'roblox-script-vault'
      }
    }
  });
}
