import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='bulkWrite']",
          message:
            "Direct .bulkWrite() calls bypass Mongoose tenancy isolation hooks. Use standard scoped model queries instead.",
        },
        {
          selector: "MemberExpression[property.name='collection']",
          message:
            "Direct .collection access bypasses Mongoose tenancy isolation hooks. Use standard scoped model queries instead.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/models/Workspace",
              message:
                "Direct Workspace model import is restricted. Use tenant DAL (@/lib/auth/dal) or scoped queries.",
            },
            {
              name: "@/models/SourceDocument",
              message:
                "Direct imports of tenant-scoped models are forbidden outside src/lib/db. Use scoped queries from @/lib/db/scoped-queries instead.",
            },
            {
              name: "@/models/SourceDocumentChunk",
              message:
                "Direct imports of tenant-scoped models are forbidden outside src/lib/db. Use scoped queries from @/lib/db/scoped-queries instead.",
            },
            {
              name: "@/models/Conversation",
              message:
                "Direct imports of tenant-scoped models are forbidden outside src/lib/db. Use scoped queries from @/lib/db/scoped-queries instead.",
            },
            {
              name: "@/models/Message",
              message:
                "Direct imports of tenant-scoped models are forbidden outside src/lib/db. Use scoped queries from @/lib/db/scoped-queries instead.",
            },
            {
              name: "@/models/IngestAttempt",
              message:
                "Direct imports of tenant-scoped models are forbidden outside src/lib/db. Use scoped queries from @/lib/db/scoped-queries instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/lib/db/**",
      "src/models/**",
      "src/lib/auth/dal.ts",
      "src/actions/workspace.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": "off",
      "no-restricted-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
