// Generates VAPID keys for Web Push and prints them for .env.
// Usage: npm run vapid
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("Add these to your .env (and the production environment):\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:no-reply@therabridge.com`);
