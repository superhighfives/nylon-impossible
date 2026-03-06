import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./src/shared/src/schema.ts",
	out: "./src/api/migrations",
	dialect: "sqlite",
});
