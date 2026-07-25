import { replaceAllEvents, eventsBackend, listEvents } from "../src/lib/events";
import { SEEDED_EVENTS } from "../src/lib/seed-data";

async function main() {
  console.log("events backend:", eventsBackend());
  await replaceAllEvents(SEEDED_EVENTS);
  const rows = await listEvents();
  console.log(`seeded ${rows.length} events:`);
  for (const e of rows) {
    console.log(`- ${e.id}: ${e.request}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
