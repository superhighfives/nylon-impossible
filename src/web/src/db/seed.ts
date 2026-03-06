/**
 * Database seed script for local development
 * 
 * Usage:
 *   pnpm db:seed          # Seed the database
 *   pnpm db:seed --fresh  # Reset then seed
 */

import { drizzle } from "drizzle-orm/d1";
import { generateKeyBetween } from "fractional-indexing";
import {
  lists,
  todos,
  todoLists,
  users,
} from "@nylon-impossible/shared/schema";

// Test data
const TEST_USER = {
  id: "user_charliegleason",
  email: "hi@charliegleason.com",
};

const DEFAULT_LISTS = [
  { name: "TODO" },
  { name: "Shopping" },
  { name: "Bills" },
  { name: "Work" },
];

const SAMPLE_TODOS = [
  {
    title: "Buy groceries",
    description: "Milk, eggs, bread, and vegetables",
    completed: false,
    priority: "high" as const,
    listIndex: 1, // Shopping
  },
  {
    title: "Pay electricity bill",
    description: "Due by the end of the month",
    completed: false,
    priority: "high" as const,
    listIndex: 2, // Bills
  },
  {
    title: "Review project proposal",
    description: "Check the Q2 roadmap document",
    completed: true,
    priority: "low" as const,
    listIndex: 3, // Work
  },
  {
    title: "Call dentist",
    description: "Schedule annual checkup",
    completed: false,
    priority: "low" as const,
    listIndex: 0, // TODO
  },
  {
    title: "Fix navigation bug",
    description: "Mobile menu not closing on route change",
    completed: false,
    priority: "high" as const,
    listIndex: 3, // Work
  },
];

async function seed() {
  console.log("🌱 Starting database seed...\n");

  // Get D1 database from environment (via Wrangler)
  const db = getDatabase();

  try {
    // Clear existing data
    console.log("🧹 Clearing existing data...");
    await db.delete(todoLists);
    await db.delete(todoUrls);
    await db.delete(todos);
    await db.delete(lists);
    await db.delete(users);
    console.log("✓ Existing data cleared\n");

    // Create test user
    console.log("👤 Creating test user...");
    await db.insert(users).values(TEST_USER);
    console.log(`✓ Created user: ${TEST_USER.email}\n`);

    // Create default lists with fractional indexing
    console.log("📋 Creating default lists...");
    const createdLists: Array<{ id: string; name: string }> = [];
    let listPosition = "a0";

    for (const list of DEFAULT_LISTS) {
      const result = await db
        .insert(lists)
        .values({
          userId: TEST_USER.id,
          name: list.name,
          position: listPosition,
        })
        .$returningId();
      
      const id = result[0].id;
      createdLists.push({ id, name: list.name });
      console.log(`  - ${list.name}`);
      
      listPosition = generateKeyBetween(listPosition, null);
    }
    console.log(`✓ Created ${createdLists.length} lists\n`);

    // Create sample todos
    console.log("✅ Creating sample todos...");
    const createdTodos: Array<{ id: string; title: string }> = [];

    for (let i = 0; i < SAMPLE_TODOS.length; i++) {
      const todoData = SAMPLE_TODOS[i];
      const todoPosition = generateKeyBetween(null, null); // Simple position
      const listId = createdLists[todoData.listIndex].id;

      const result = await db
        .insert(todos)
        .values({
          userId: TEST_USER.id,
          title: todoData.title,
          description: todoData.description,
          completed: todoData.completed,
          priority: todoData.priority,
          position: todoPosition,
        })
        .$returningId();

      const id = result[0].id;
      createdTodos.push({ id, title: todoData.title });

      // Link todo to list
      await db.insert(todoLists).values({
        todoId: id,
        listId: listId,
      });

      console.log(`  - ${todoData.title} (${todoData.completed ? "done" : "pending"})`);
    }
    console.log(`✓ Created ${createdTodos.length} todos\n`);

    console.log("🎉 Seed completed successfully!");
    console.log("\nTest account:");
    console.log(`  Email: ${TEST_USER.email}`);
    console.log(`  User ID: ${TEST_USER.id}`);

  } catch (error) {
    console.error("\n❌ Seed failed:", error);
    process.exit(1);
  }
}

function getDatabase() {
  // In local dev with Wrangler, we can access the D1 binding
  // This needs to run through Wrangler to get the DB binding
  if (typeof env !== "undefined" && env.DB) {
    return drizzle(env.DB);
  }

  // Fallback: try to connect directly to SQLite file
  // This is a workaround for running outside Wrangler
  try {
    const sqlitePath = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite";
    console.log(`Attempting to connect to: ${sqlitePath}`);
    console.log("Note: This script should be run via 'wrangler dev' or with proper D1 binding");
    
    // For now, throw an error to indicate the script needs proper environment
    throw new Error(
      "Database binding not found. Run this script via: wrangler dev --local or use the db:seed npm script"
    );
  } catch (e) {
    console.error("Failed to connect to database:", e);
    throw e;
  }
}

// Run seed
seed();
