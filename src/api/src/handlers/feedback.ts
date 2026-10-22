import * as Sentry from "@sentry/cloudflare";
import type { Context } from "hono";
import { apiError, apiValidationError, readJsonBody } from "../lib/errors";
import {
  feedbackSchema,
  fileFeedback,
  GitHubFeedbackError,
} from "../lib/feedback";
import type { Env } from "../types";

// POST /feedback — admin only. Files an issue in the private inbox repo.
export async function submitFeedback(c: Context<Env>) {
  const token = c.env.GITHUB_FEEDBACK_TOKEN;
  const repo = c.env.FEEDBACK_REPO;
  if (!token || !repo) {
    return apiError(c, "feedback_unavailable");
  }

  const json = await readJsonBody(c);
  if (!json.ok) return json.response;
  const parsed = feedbackSchema.safeParse(json.body);
  if (!parsed.success) {
    return apiValidationError(c, parsed.error);
  }

  try {
    const filed = await fileFeedback(parsed.data, {
      repo,
      token,
      userId: c.get("userId"),
    });
    return c.json(filed, 201);
  } catch (error) {
    if (error instanceof GitHubFeedbackError) {
      Sentry.captureException(error, {
        tags: { area: "feedback", step: error.step },
      });
      return apiError(c, "feedback_failed");
    }
    throw error;
  }
}
