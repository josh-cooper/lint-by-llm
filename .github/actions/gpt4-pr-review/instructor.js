import Instructor from "@instructor-ai/instructor";
import OpenAI from "openai";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

const oai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? undefined,
});

const client = Instructor({
  client: oai,
  mode: "FUNCTIONS",
});

const SuggestionSchema = z
  .object({
    lineNumber: z
      .number()
      .describe("The line number in the diff where the suggestion applies"),
    suggestion: z
      .string()
      .describe(
        "A concise suggestion for improvement, including code suggestions using ```suggestion syntax"
      ),
    explanation: z
      .string()
      .describe("A brief explanation of why this change is recommended"),
  })
  .describe("A suggestion applying to a specific line in the diff");

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

const prompt = `
    You are an expert code reviewer. Please review the following pull request and provide line-by-line suggestions for improvements.
    Focus on code quality, best practices, potential bugs, and performance issues.

    PR Description:
    My PR that does stuff.

    Diff:
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

    Please provide your review as an concise overview of your review, and an array of suggestion objects with the given schema.
    `;

// User will be of type z.infer<typeof UserSchema>
const user = await client.chat.completions.create({
  messages: [{ role: "user", content: "Jason Liu is 30 years old" }],
  model: "gpt-3.5-turbo",
  response_model: {
    schema: ReviewSchema,
    name: "Review",
  },
});

console.log(user);
// { age: 30, name: "Jason Liu" }
