#!/usr/bin/env node
// Usage: node scripts/setup-admin.mjs admin@example.com
// Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || "https://evwfeauffghrvllxizja.supabase.co";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];

if (!key) {
  console.error("Error: SUPABASE_SERVICE_ROLE_KEY is required.");
  process.exit(1);
}

if (!email) {
  console.error("Usage: node scripts/setup-admin.mjs <email>");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
  if (userError) {
    console.error("Failed to list users:", userError.message);
    process.exit(1);
  }

  const user = userData.users.find((u) => u.email === email);
  if (!user) {
    console.error(`User with email ${email} not found. Please sign up first.`);
    process.exit(1);
  }

  const { error: upsertError } = await supabase
    .from("profiles")
    .upsert({ id: user.id, email, role: "admin", permissions: [] }, { onConflict: "id" });

  if (upsertError) {
    console.error("Failed to set admin role:", upsertError.message);
    process.exit(1);
  }

  console.log(`Success: ${email} is now an admin.`);
}

main();
