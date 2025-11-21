import { processSubscriptions } from './email-worker.mjs';

console.log("🧪 Testing Email Worker...");
processSubscriptions().then(() => {
    console.log("✅ Test Complete");
    process.exit(0);
}).catch(err => {
    console.error("❌ Test Failed:", err);
    process.exit(1);
});
