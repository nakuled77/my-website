import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Helper function to generate OAuth 2.0 access token from service account
async function getAccessToken(serviceAccount: any): Promise<string> {
  const jwtHeader = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  
  const now = Math.floor(Date.now() / 1000);
  const jwtClaimSet = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  
  const jwtClaimSetEncoded = btoa(JSON.stringify(jwtClaimSet));
  const signatureInput = `${jwtHeader}.${jwtClaimSetEncoded}`;
  
  // Import private key for signing
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signatureInput)
  );
  
  const jwtSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  
  const jwt = `${signatureInput}.${jwtSignature}`;
  
  // Exchange JWT for access token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  
  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

// Helper to convert PEM to ArrayBuffer
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}


const FIREBASE_SERVICE_ACCOUNT = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT') || '{}');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  requestId: string;
  serviceType: string;
  location: string;
  description: string;
  userId: string; // User who created the request
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔵 Push notification function triggered');

    // Parse request body
    const { requestId, serviceType, location, description, userId }: NotificationRequest = await req.json();
    
    console.log('📋 Request details:', { requestId, serviceType, location, userId });

    // Initialize Supabase client with service role (bypass RLS)
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Step 1: Find providers who match this service type
    console.log('🔍 Finding providers for service:', serviceType);
    
    const { data: providers, error: providerError } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .eq('profile_type', 'provider')
      .contains('service_type', [serviceType]);

    if (providerError) {
      console.error('❌ Error fetching providers:', providerError);
      throw providerError;
    }

    if (!providers || providers.length === 0) {
      console.log('⚠️ No providers found for this service type');
      return new Response(
        JSON.stringify({ message: 'No providers found', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Found ${providers.length} providers`);

    // Step 2: Exclude the user who created the request
    const eligibleProviders = providers.filter(p => p.user_id !== userId);
    console.log(`✅ ${eligibleProviders.length} eligible providers (excluding request creator)`);

    if (eligibleProviders.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No eligible providers', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Get FCM tokens for these providers
    const providerIds = eligibleProviders.map(p => p.user_id);
    
    const { data: tokens, error: tokenError } = await supabase
      .from('fcm_tokens')
      .select('fcm_token, user_id')
      .in('user_id', providerIds);

    if (tokenError) {
      console.error('❌ Error fetching FCM tokens:', tokenError);
      throw tokenError;
    }

    if (!tokens || tokens.length === 0) {
      console.log('⚠️ No FCM tokens found for providers');
      return new Response(
        JSON.stringify({ message: 'No FCM tokens found', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Found ${tokens.length} FCM tokens`);

    // Step 4: Send push notifications to each provider
    let successCount = 0;
    let failCount = 0;

    for (const tokenData of tokens) {
      try {
        console.log(`📤 Sending notification to user ${tokenData.user_id}`);
        
        // Generate OAuth 2.0 access token
        const accessToken = await getAccessToken(FIREBASE_SERVICE_ACCOUNT);
        
        // New v1 API payload format
        const fcmPayload = {
          message: {
            token: tokenData.fcm_token,
            notification: {
              title: '🔔 New Service Request',
              body: `${serviceType} needed in ${location}`,
            },
            data: {
              requestId: requestId,
              serviceType: serviceType,
              location: location,
              description: description,
              type: 'new_request'
            },
            webpush: {
              notification: {
                icon: '/icon-192x192.png',
                badge: '/icon-192x192.png',
              },
              fcm_options: {
                link: 'https://your-app-url.com'
              }
            }
          }
        };

        // Use new Firebase Cloud Messaging API v1 endpoint
        const fcmResponse = await fetch(
          `https://fcm.googleapis.com/v1/projects/${FIREBASE_SERVICE_ACCOUNT.project_id}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(fcmPayload),
          }
        );


        if (fcmResponse.ok) {
          console.log(`✅ Notification sent successfully to user ${tokenData.user_id}`);
          successCount++;
        } else {
          const errorData = await fcmResponse.text();
          console.error(`❌ FCM Error for user ${tokenData.user_id}:`, errorData);
          failCount++;
        }

      } catch (error) {
        console.error(`❌ Error sending to user ${tokenData.user_id}:`, error);
        failCount++;
      }
    }

    console.log(`✅ Notifications sent: ${successCount} successful, ${failCount} failed`);

    return new Response(
      JSON.stringify({ 
        message: 'Notifications processed',
        sent: successCount,
        failed: failCount,
        totalProviders: eligibleProviders.length,
        totalTokens: tokens.length
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: any) {
    console.error('❌ Error in send-push-notification function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
