import * as core from "@actions/core";
import * as github from "@actions/github";
import Instructor from "@instructor-ai/instructor";
import { z } from "zod";
import OpenAI from "openai";

const MAX_LINES = 500;

const SuggestionSchema = z
  .object({
    path: z.string().describe("The file path where the suggestion applies"),
    line: z
      .number()
      .describe("The line number in the file where the suggestion applies"),
    suggestion: z
      .string()
      .describe(
        "A concise suggestion for improvement, including code suggestions using ```suggestion syntax if applicable"
      ),
    explanation: z
      .string()
      .describe("A brief explanation of why this change is recommended"),
  })
  .describe("A suggestion applying to a specific line in a file");

const ReviewSchema = z.object({
  overview: z
    .string()
    .describe(
      "A concise, descriptive overview of your review in markdown format"
    ),
  suggestions: z
    .array(SuggestionSchema)
    .describe("An array of line-by-line suggestion objects"),
});

function addLineNumbersToDiff(patch) {
  let lineNumber = 0;
  return patch
    .split("\n")
    .map((line) => {
      if (line.startsWith("+") || line.startsWith(" ")) {
        lineNumber++;
        return `${lineNumber.toString().padStart(5, " ")} ${line}`;
      } else if (line.startsWith("-")) {
        return `     ${line}`;
      }
      return line;
    })
    .join("\n");
}

export async function runAction() {
  try {
    const token = core.getInput("github-token", { required: true });
    const openaiApiKey = core.getInput("openai-api-key", { required: true });
    const octokit = github.getOctokit(token);
    const openai = new OpenAI({ apiKey: openaiApiKey });
    const instructor = new Instructor({ client: openai, mode: "TOOLS" });

    const { pull_request } = github.context.payload;
    if (!pull_request) {
      throw new Error("This action can only be run on pull requests");
    }

    const prNumber = pull_request.number;
    const repo = github.context.repo;

    const [prData, prFiles] = await Promise.all([
      octokit.rest.pulls.get({ ...repo, pull_number: prNumber }),
      octokit.rest.pulls.listFiles({ ...repo, pull_number: prNumber }),
    ]);

    const diff = prFiles.data
      .filter((file) => file.changes <= MAX_LINES)
      .map(
        (file) => `File: ${file.filename}\n${addLineNumbersToDiff(file.patch)}`
      )
      .join("\n\n");

    const prompt = `
    You are an expert code reviewer. Please review the following pull request and provide line-by-line suggestions for improvements.
    Focus on code quality, best practices, potential bugs, and performance issues.

    PR Description:
    ${prData.data.body}

    Diff (with line numbers):
    ${diff}

    Please provide your review as a concise overview of your review, and an array of suggestion objects with the given schema.
    Make sure to include the file path for each suggestion and use the correct line numbers as shown in the diff.
    `;

    const review = await instructor.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-4",
      response_model: {
        schema: ReviewSchema,
        name: "Review",
      },
    });

    // Post overview comment
    await octokit.rest.issues.createComment({
      ...repo,
      issue_number: prNumber,
      body: `# GPT-4 Code Review Overview\n\n${review.overview}`,
    });

    // Get the latest commit SHA
    const { data: commits } = await octokit.rest.pulls.listCommits({
      ...repo,
      pull_number: prNumber,
    });
    const latestCommitSha = commits[commits.length - 1].sha;

    // Post line-by-line review comments
    for (const suggestion of review.suggestions) {
      await octokit.rest.pulls.createReviewComment({
        ...repo,
        pull_number: prNumber,
        body: `${suggestion.suggestion}\n\n${suggestion.explanation}`,
        commit_id: latestCommitSha,
        path: suggestion.path,
        line: suggestion.line,
      });
    }

    console.log("GPT-4 review comments posted successfully");
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}
