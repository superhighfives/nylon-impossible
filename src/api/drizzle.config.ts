import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "../shared/src/schema.ts",
	out: "./migrations",
	dialect: "sqlite",
});
