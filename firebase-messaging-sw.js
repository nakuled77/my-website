// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyA84umO1nKufa-NmR40ifM1TP0ccx7SSp8",
    authDomain: "helpbuddy-app.firebaseapp.com",
    projectId: "helpbuddy-app",
    storageBucket: "helpbuddy-app.firebasestorage.app",
    messagingSenderId: "207546481980",
    appId: "1:207546481980:web:9cfa7d2cade0b263b93239"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('🔔 Background notification received:', payload);
    
    const notificationTitle = payload.notification?.title || 'HelpBuddy Notification';
    const notificationOptions = {
        body: payload.notification?.body || 'You have a new update',
        icon: '/public/icon-192x192.png',
        badge: '/public/icon-96x96.png',
        tag: payload.data?.request_id || 'helpbuddy-notification',
        data: payload.data,
        requireInteraction: false
    };
    
    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    console.log('🔔 Notification clicked:', event);
    event.notification.close();
    
    // Open the app when notification is clicked
    event.waitUntil(
        clients.openWindow('/')
    );
});