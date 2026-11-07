// Service Worker for Mora - Smart Executive Assistant
const CACHE_NAME = 'mora-cache-v4';
const OFFLINE_URL = '/offline.html';

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - Network First with Cache Fallback strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Never cache hashed JS/CSS build assets — always go to network so new
  // deploys don't try to load stale chunk hashes from the cache.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Skip external requests (except CDN)
  if (!url.origin.includes(self.location.origin) && 
      !url.origin.includes('fonts.googleapis.com') &&
      !url.origin.includes('fonts.gstatic.com')) {
    return;
  }

  // Handle API calls (Supabase) - Network First
  if (url.pathname.includes('/functions/') || url.pathname.includes('/rest/') || url.pathname.includes('/auth/')) {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  // Handle static assets - Cache First
  if (isStaticAsset(request)) {
    event.respondWith(cacheFirstWithNetwork(request));
    return;
  }

  // Default - Network First
  event.respondWith(networkFirstWithCache(request));
});

// Network First strategy with cache fallback
async function networkFirstWithCache(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/');
    }
    
    throw error;
  }
}

// Cache First strategy with network fallback
async function cacheFirstWithNetwork(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    // Update cache in background
    fetchAndCache(request);
    return cachedResponse;
  }
  
  return fetchAndCache(request);
}

// Fetch and cache helper
async function fetchAndCache(request) {
  const response = await fetch(request);
  
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  
  return response;
}

// Check if request is for static asset
function isStaticAsset(request) {
  const url = new URL(request.url);
  const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf'];
  return staticExtensions.some(ext => url.pathname.endsWith(ext));
}

// Background Sync for pending actions
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-pending-actions') {
    event.waitUntil(syncPendingActions());
  }
});

// Sync pending actions when online
async function syncPendingActions() {
  try {
    // Notify clients to sync
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({ type: 'SYNC_PENDING_ACTIONS' });
    });
    console.log('[SW] Sync notification sent to clients');
  } catch (error) {
    console.error('[SW] Sync failed:', error);
  }
}

// Listen for messages from clients
self.addEventListener('message', (event) => {
  console.log('[SW] Received message:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(event.data.urls);
      })
    );
  }
});

// A notification pushed by the server (also when the app is closed). The tag is the
// notification's id, so the same one shown by the open app is not shown twice.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || 'مغز دوم من';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/android-chrome-192x192.png',
    badge: '/android-chrome-192x192.png',
    dir: 'rtl',
    lang: 'fa',
    tag: data.tag || undefined,
    data: { path: typeof data.path === 'string' && data.path.startsWith('/') && !data.path.startsWith('//') ? data.path : '/' },
  }));
});

// Opens the record the notification is about: in a window of the app if one is open
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.path || '/';
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const client = clients.find((c) => new URL(c.url).origin === self.location.origin);
      if (client) {
        return client.focus().then((focused) => (focused && 'navigate' in focused ? focused.navigate(target) : undefined));
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    })
  );
});
