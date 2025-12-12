import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey'
};

interface UsernameLoginRequest {
  username: string;
  password: string;
}

interface UsernameLoginResponse {
  access_token?: string;
  refresh_token?: string;
  error?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing required environment variables');
      return new Response(JSON.stringify({ error: 'SERVER_ERROR' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse request body
    let body: UsernameLoginRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'INVALID_REQUEST' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { username, password } = body;

    // Validate input
    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'INVALID_CREDENTIALS' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!password || typeof password !== 'string' || password.length === 0) {
      return new Response(JSON.stringify({ error: 'INVALID_CREDENTIALS' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate username format (3-20 characters, alphanumeric + underscore)
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username.trim())) {
      return new Response(JSON.stringify({ error: 'INVALID_CREDENTIALS' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create service role client to bypass RLS
    // 配置 auth 选项以支持服务端 signInWithPassword
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Look up user_id by username (service role bypasses RLS)
    const { data: profile, error: profileError } = await supabase
      .from('users_profile')
      .select('user_id')
      .eq('username', username.trim().toLowerCase())
      .maybeSingle();

    if (profileError) {
      console.error('Error looking up username:', profileError.message);
      // Return generic error to prevent username enumeration
      return new Response(JSON.stringify({ error: 'INVALID_CREDENTIALS' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!profile) {
      // Username not found - return same error as wrong password
      // to prevent username enumeration
      return new Response(JSON.stringify({ error: 'INVALID_CREDENTIALS' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get user email from auth.users using admin API
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(profile.user_id);

    if (userError || !userData?.user?.email) {
      console.error('Error getting user email:', userError?.message);
      return new Response(JSON.stringify({ error: 'INVALID_CREDENTIALS' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const email = userData.user.email;

    // Attempt to sign in with email and password
    // Note: We use signInWithPassword which validates the password through GoTrue
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (signInError || !signInData.session) {
      // Password incorrect or other auth error
      // Return generic error to prevent password enumeration
      return new Response(JSON.stringify({ error: 'INVALID_CREDENTIALS' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Return only the tokens, not the email or other user info
    const response: UsernameLoginResponse = {
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Username login error:', error);
    return new Response(JSON.stringify({ error: 'SERVER_ERROR' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
