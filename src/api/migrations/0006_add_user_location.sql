-- Migration: Add location field to users
-- Used to bias location research queries (e.g., "San Jalisco near Los Angeles, CA")

ALTER TABLE users ADD COLUMN location TEXT;
