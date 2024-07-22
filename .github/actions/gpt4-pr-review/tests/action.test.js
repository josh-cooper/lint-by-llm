import { jest } from "@jest/globals";
import { rest } from "msw";
import { setupServer } from "msw/node";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config({ path: ".env.test" });
if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY environment variable");
}

// Mock modules
jest.mock("@actions/github", () => ({
  context: {
    payload: {
      pull_request: {
        number: 1,
      },
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

// Sample diff
const sampleDiff = `
diff --git a/example.js b/example.js
index 1234567..abcdefg 100644
--- a/example.js
+++ b/example.js
@@ -1,5 +1,5 @@
 function greet(name) {
-  console.log('Hello, ' + name + '!');
+  console.log(\`Hello, \${name}!\`);
 }

 greet('World');
`;

// Set up MSW server
const server = setupServer(
  rest.get(
    "https://api.github.com/repos/testowner/testrepo/pulls/1",
    (req, res, ctx) => {
      return res(ctx.json({ body: "This is a test PR" }));
    }
  ),
  rest.get(
    "https://api.github.com/repos/testowner/testrepo/pulls/1/files",
    (req, res, ctx) => {
      return res(ctx.json([{ filename: "example.js", patch: sampleDiff }]));
    }
  )
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test("GPT-4 PR Review Action", async () => {
  console.warn("Running an actual API call to OpenAI");

  // Mock input values
  const mockGetInput = jest.requireMock("@actions/core").getInput;
  mockGetInput.mockImplementation((name) => {
    if (name === "github-token") return "fake-token";
    if (name === "openai-api-key") return process.env.OPENAI_API_KEY;
  });

  // Mock Octokit
  const mockOctokit = {
    rest: {
      pulls: {
        get: jest
          .fn()
          .mockResolvedValue({ data: { body: "This is a test PR" } }),
        listFiles: jest.fn().mockResolvedValue({
          data: [{ filename: "example.js", patch: sampleDiff }],
        }),
      },
      issues: {
        createComment: jest.fn().mockResolvedValue({}),
      },
    },
  };
  jest.requireMock("@actions/github").getOctokit.mockReturnValue(mockOctokit);

  // Import and run the action
  const { runAction } = await import("../action.js");

  try {
    await runAction();
  } catch (error) {
    console.error("Error running the action:", error);
    throw error;
  }

  // Assertions
  expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith(
    expect.objectContaining({
      owner: "testowner",
      repo: "testrepo",
      pull_number: 1,
    })
  );

  expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledWith(
    expect.objectContaining({
      owner: "testowner",
      repo: "testrepo",
      pull_number: 1,
    })
  );

  expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(
    expect.objectContaining({
      owner: "testowner",
      repo: "testrepo",
      issue_number: 1,
      body: expect.stringContaining("GPT-4 Code Review Overview"),
    })
  );

  // Log the actual comment for manual inspection
  const commentCall = mockOctokit.rest.issues.createComment.mock.calls[0][0];
  console.log("GPT-4 Review Comment:");
  console.log(commentCall.body);
}, 30000); // Increase timeout to 30 seconds for API call
