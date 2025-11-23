// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyA84umO1nKUfa-NmR40ifMlTP0ccx7SSp8",
    authDomain: "helpbuddy-app.firebaseapp.com",
    projectId: "helpbuddy-app",
    storageBucket: "helpbuddy-app.firebasestorage.app",
    messagingSenderId: "207546481980",
    appId: "1:207546481980:web:9cfa7d2cade0b263b93239"
});

const messaging = firebase.messaging();

// Background message handler
messaging.onBackgroundMessage((payload) => {
    console.log('Background message received:', payload);
    
    const notificationTitle = payload.notification?.title || 'HelpBuddy';
    const notificationOptions = {
        body: payload.notification?.body || 'You have a new update',
        icon: '/android-icon-192x192.png',     // ✅ FIXED PATH
        badge: '/android-icon-144x144.png',    // ✅ FIXED PATH
        tag: 'helpbuddy-notification',
        requireInteraction: true,
    };
    
    self.registration.showNotification(notificationTitle, notificationOptions);
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    event.waitUntil(
        clients.openWindow('/')
    );
});