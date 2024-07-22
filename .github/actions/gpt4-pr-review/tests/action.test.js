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
 function print_greeting(name) {
-  console.log('Hello, ' + name + '!');
+  console.log(\`Helo, \${name}!\`);
 }

 print_greeting('World');`;

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

import { addLineNumbersToDiff } from "../action"; // Adjust the import path as needed

describe("addLineNumbersToDiff", () => {
  test("handles basic diff correctly", () => {
    const input = `diff --git a/file.js b/file.js
index 1234567..abcdefg 100644
--- a/file.js
+++ b/file.js
@@ -1,3 +1,3 @@
 const a = 1;
-const b = 2;
+const b = 3;
 const c = 3;`;

    const expected = `diff --git a/file.js b/file.js
index 1234567..abcdefg 100644
     --- a/file.js
    1 +++ b/file.js
@@ -1,3 +1,3 @@
    1  const a = 1;
     -const b = 2;
    2 +const b = 3;
    3  const c = 3;`;

    expect(addLineNumbersToDiff(input)).toBe(expected);
  });

  test("handles multiple hunks correctly", () => {
    const input = `diff --git a/file.js b/file.js
index 1234567..abcdefg 100644
--- a/file.js
+++ b/file.js
@@ -1,3 +1,3 @@
 const a = 1;
-const b = 2;
+const b = 3;
 const c = 3;
@@ -10,3 +10,3 @@
 const x = 10;
-const y = 20;
+const y = 30;
 const z = 30;`;

    const expected = `diff --git a/file.js b/file.js
index 1234567..abcdefg 100644
     --- a/file.js
    1 +++ b/file.js
@@ -1,3 +1,3 @@
    1  const a = 1;
     -const b = 2;
    2 +const b = 3;
    3  const c = 3;
@@ -10,3 +10,3 @@
   10  const x = 10;
     -const y = 20;
   11 +const y = 30;
   12  const z = 30;`;

    expect(addLineNumbersToDiff(input)).toBe(expected);
  });

  test("handles new file correctly", () => {
    const input = `diff --git a/newfile.js b/newfile.js
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/newfile.js
@@ -0,0 +1,3 @@
+const a = 1;
+const b = 2;
+const c = 3;`;

    const expected = `diff --git a/newfile.js b/newfile.js
new file mode 100644
index 0000000..1234567
     --- /dev/null
    1 +++ b/newfile.js
@@ -0,0 +1,3 @@
    1 +const a = 1;
    2 +const b = 2;
    3 +const c = 3;`;

    expect(addLineNumbersToDiff(input)).toBe(expected);
  });

  test("handles deleted file correctly", () => {
    const input = `diff --git a/deletedfile.js b/deletedfile.js
deleted file mode 100644
index 1234567..0000000
--- a/deletedfile.js
+++ /dev/null
@@ -1,3 +0,0 @@
-const a = 1;
-const b = 2;
-const c = 3;`;

    const expected = `diff --git a/deletedfile.js b/deletedfile.js
deleted file mode 100644
index 1234567..0000000
     --- a/deletedfile.js
    1 +++ /dev/null
@@ -1,3 +0,0 @@
     -const a = 1;
     -const b = 2;
     -const c = 3;`;

    expect(addLineNumbersToDiff(input)).toBe(expected);
  });

  test("handles binary files correctly", () => {
    const input = `diff --git a/binary.bin b/binary.bin
new file mode 100644
index 0000000..1234567
Binary files /dev/null and b/binary.bin differ`;

    const expected = `diff --git a/binary.bin b/binary.bin
new file mode 100644
index 0000000..1234567
Binary files /dev/null and b/binary.bin differ`;

    expect(addLineNumbersToDiff(input)).toBe(expected);
  });

  test("handles renamed files correctly", () => {
    const input = `diff --git a/oldname.js b/newname.js
similarity index 100%
rename from oldname.js
rename to newname.js
index 1234567..abcdefg 100644
--- a/oldname.js
+++ b/newname.js
@@ -1,3 +1,3 @@
 const a = 1;
-const b = 2;
+const b = 3;
 const c = 3;`;

    const expected = `diff --git a/oldname.js b/newname.js
similarity index 100%
rename from oldname.js
rename to newname.js
index 1234567..abcdefg 100644
     --- a/oldname.js
    1 +++ b/newname.js
@@ -1,3 +1,3 @@
    1  const a = 1;
     -const b = 2;
    2 +const b = 3;
    3  const c = 3;`;

    expect(addLineNumbersToDiff(input)).toBe(expected);
  });

  test('handles "No newline at end of file" correctly', () => {
    const input = `diff --git a/file.js b/file.js
index 1234567..abcdefg 100644
--- a/file.js
+++ b/file.js
@@ -1,3 +1,3 @@
 const a = 1;
-const b = 2;
-const c = 3;
\ No newline at end of file
+const b = 3;
+const c = 4;
\ No newline at end of file`;

    const expected = `diff --git a/file.js b/file.js
index 1234567..abcdefg 100644
     --- a/file.js
    1 +++ b/file.js
@@ -1,3 +1,3 @@
    1  const a = 1;
     -const b = 2;
     -const c = 3;
    2  No newline at end of file
    3 +const b = 3;
    4 +const c = 4;
    5  No newline at end of file`;

    expect(addLineNumbersToDiff(input)).toBe(expected);
  });
});

describe.skip("End to end", () => {
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

    expect(
      lineComments.some((call) => call[0].body.toLowerCase().includes("hello"))
    ).toBe(true);

    // Log comments for manual inspection
    console.log("GPT-4 Review Overview Comment:");
    console.log(overviewComment);

    console.log("GPT-4 Review Line Comments:");
    lineComments.forEach((call, index) => {
      console.log(`Comment ${index + 1}:`, call[0].body);
    });
  }, 30000);
});
