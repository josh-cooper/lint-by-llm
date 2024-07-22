import { jest } from "@jest/globals";
import { rest } from "msw";
import { setupServer } from "msw/node";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });
if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY environment variable");
}

jest.mock("@actions/github", () => ({
  context: {
    payload: {
      pull_request: { number: 1 },
    },
    repo: {
      owner: "testowner",
      repo: "testrepo",
    },
  },
  getOctokit: jest.fn(),
}));

jest.mock("@actions/core", () => ({
  getInput: jest.fn(),
  setFailed: jest.fn(),
}));

const sampleDiff = `diff --git a/example.js b/example.js
index 1234567..abcdefg 100644
--- a/example.js
+++ b/example.js
@@ -1,5 +1,5 @@
 function greet(name) {
-  console.log('Hello, ' + name + '!');
+  console.log(\`Helo, \${name}!\`);
 }

 greet('World');`;

const server = setupServer(
  rest.get(
    "https://api.github.com/repos/testowner/testrepo/pulls/1",
    (req, res, ctx) => res(ctx.json({ body: "This is a test PR" }))
  ),
  rest.get(
    "https://api.github.com/repos/testowner/testrepo/pulls/1/files",
    (req, res, ctx) =>
      res(ctx.json([{ filename: "example.js", patch: sampleDiff, changes: 3 }]))
  ),
  rest.get(
    "https://api.github.com/repos/testowner/testrepo/pulls/1/commits",
    (req, res, ctx) => res(ctx.json([{ sha: "fakeSha123" }]))
  )
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test("GPT-4 PR Review Action", async () => {
  console.warn(
    "Running an actual API call to OpenAI. This is designed as a simple end-to-end test. This will cost real $ and output is far from deterministic."
  );

  const mockGetInput = jest.requireMock("@actions/core").getInput;
  mockGetInput.mockImplementation((name) => {
    if (name === "github-token") return "fake-token";
    if (name === "openai-api-key") return process.env.OPENAI_API_KEY;
  });

  const mockOctokit = {
    rest: {
      pulls: {
        get: jest
          .fn()
          .mockResolvedValue({ data: { body: "This is a test PR" } }),
        listFiles: jest.fn().mockResolvedValue({
          data: [{ filename: "example.js", patch: sampleDiff, changes: 3 }],
        }),
        listCommits: jest.fn().mockResolvedValue({
          data: [{ sha: "fakeSha123" }],
        }),
        createReviewComment: jest.fn().mockResolvedValue({}),
      },
      issues: {
        createComment: jest.fn().mockResolvedValue({}),
      },
    },
  };
  jest.requireMock("@actions/github").getOctokit.mockReturnValue(mockOctokit);

  const { runAction } = await import("../action.js");

  await runAction();

  // Assertions
  expect(mockOctokit.rest.pulls.get).toHaveBeenCalled();
  expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalled();
  expect(mockOctokit.rest.pulls.listCommits).toHaveBeenCalled();
  expect(mockOctokit.rest.issues.createComment).toHaveBeenCalled();
  expect(mockOctokit.rest.pulls.createReviewComment).toHaveBeenCalled();

  // Check the structure of the overview comment
  const overviewComment =
    mockOctokit.rest.issues.createComment.mock.calls[0][0].body;
  expect(overviewComment).toContain("GPT-4 Code Review Overview");

  // Check the structure of the line comments
  const lineComments = mockOctokit.rest.pulls.createReviewComment.mock.calls;
  expect(lineComments.length).toBeGreaterThan(0);

  lineComments.forEach((call) => {
    const commentBody = call[0].body;
    expect(commentBody.toLowerCase()).toContain("hello");
  });

  // Log comments for manual inspection
  console.log("GPT-4 Review Overview Comment:");
  console.log(overviewComment);

  console.log("GPT-4 Review Line Comments:");
  lineComments.forEach((call, index) => {
    console.log(`Comment ${index + 1}:`, call[0].body);
  });
}, 30000);
