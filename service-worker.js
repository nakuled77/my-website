// ==================== SERVICE WORKER FOR PWA ====================
// ✅ FIXED: All paths now match actual file locations
const CACHE_NAME = 'helpbuddy-v1.0.2';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',                                    // ✅ FIXED: Root directory, not /public/
    '/public/offline.html',                             // ✅ CORRECT: In public folder
    '/public/icon-192x192.png',                         // ✅ CORRECT: In public folder
    '/public/icon-512x512.png',                         // ✅ CORRECT: In public folder
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/dist/umd/supabase.min.js'
];

// STEP 1: Install Service Worker and Cache Assets
self.addEventListener('install', (event) => {
    console.log('🔵 Service Worker: Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('✅ Service Worker: Caching static assets');
            // Try to cache assets individually to avoid failure if one fails
            return Promise.allSettled(
                STATIC_ASSETS.map(url => 
                    cache.add(url).catch(err => {
                        console.warn(`⚠️ Failed to cache ${url}:`, err.message);
                    })
                )
            );
        })
    );
    
    // Skip waiting - activate immediately
    self.skipWaiting();
});

// STEP 2: Activate Service Worker and Clean Up Old Caches
self.addEventListener('activate', (event) => {
    console.log('🔵 Service Worker: Activating...');
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log(`✅ Service Worker: Deleting old cache: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('✅ Service Worker: Activation complete');
        })
    );
    
    // Claim all clients immediately
    self.clients.claim();
});

// STEP 3: Fetch Event - Network First, Fall Back to Cache
self.addEventListener('fetch', (event) => {
    // Only intercept GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Skip Chrome extensions and non-http(s)
    if (event.request.url.startsWith('chrome-extension:') || 
        !event.request.url.startsWith('http')) {
        return;
    }
    
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Don't cache if response is error
                if (!response || response.status !== 200 || response.type === 'error') {
                    return response;
                }
                
                // Clone the response
                const responseToCache = response.clone();
                
                // Cache the fetched response
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                
                return response;
            })
            .catch(() => {
                // Network failed, try cache
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    
                    // If offline page exists and request is for HTML, return offline page
                    if (event.request.headers.get('accept').includes('text/html')) {
                        return caches.match('/public/offline.html');
                    }
                });
            })
    );
});

// STEP 4: Handle Messages (for manual cache updates)
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});