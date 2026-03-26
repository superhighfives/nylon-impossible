# PR #91 (AI Toggle) - Ready to merge once CI passes
- Added `ai_enabled` user preference 
- Created web toggle (now fixed bottom-right)
- Created iOS settings view
- Fixed CORS for PATCH, added D1 migrations to deploy workflow

## After merging #91:
1. Execute `plans/in-progress/2026-03-25-post-creation-ai-processing.md`
   - Move AI processing to happen after todo creation (async via waitUntil)
   - Remove shouldUseAI heuristic
   - Add aiStatus column to track processing state
2. Then move to `plans/ready/2026-03-13-research-agent.md`