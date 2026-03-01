# VS Code Extension Debugging — Agent Instructions

When debugging issues with the VS Code extension (`vscode-extension/`), follow this exact sequence. Do NOT skip steps or investigate source code speculatively before checking runtime logs.

## Step 1: Get the runtime error (ALWAYS DO THIS FIRST)

Ask the user to provide the **exact error** from one of these sources:

1. **Extension Host Log**: `View > Output > Extension Host` — shows activation failures and API errors.
2. **Developer Tools Console**: `Help > Toggle Developer Tools > Console` — shows manifest validation errors and uncaught exceptions. Filter for `judges` or `kevinrabun`.
3. **Window Log**: `Developer: Open Log File...` from the Command Palette.

Tell the user:
> Open `Help > Toggle Developer Tools`, switch to the Console tab, then run `Developer: Reload Window` from the Command Palette. Filter the console for "judges" and paste any errors you see.

**Do NOT proceed to source code analysis until you have the runtime error message.** Compile success does not mean runtime success. Manifest schema violations, missing required fields, and API availability issues are only visible at runtime.

## Step 2: Classify the error

Once you have the error, classify it:

| Error pattern | Root cause area | Where to look |
|---|---|---|
| `CANNOT register tool with...` | Manifest schema violation | `vscode-extension/package.json` contributes section |
| `No activated agent with id...` | Extension failed to activate — look for the PRECEDING error | Extension Host Log (the real error comes before this one) |
| `is not a function` / `undefined` | API not available in this VS Code version | Check `engines.vscode` version vs API availability |
| `Cannot find module` | Bundle/dependency issue | esbuild config, `dependencies` in package.json |
| `command not found` | Command not registered | `contributes.commands` + `activate()` registration |
| No error, just not working | Extension not activating | Check `activationEvents` match actual triggers |

## Step 3: Validate the manifest against official docs

When the error involves manifest/contribution points:

1. **Chat Participants**: Compare against https://code.visualstudio.com/api/extension-guides/chat and the official sample at https://github.com/microsoft/vscode-extension-samples/tree/main/chat-sample
2. **Language Model Tools**: Every field with a dependency must be present. Key rule: `canBeReferencedInPrompt: true` REQUIRES `toolReferenceName`.
3. **MCP Server Providers**: Check API availability — this may require newer VS Code versions.
4. **General manifest**: https://code.visualstudio.com/api/references/extension-manifest

Always cross-reference the official `vscode-extension-samples` repo for the contribution type you're debugging. The samples are the ground truth.

## Step 4: Fix, rebuild, and verify locally

1. Make the fix in `vscode-extension/package.json` or source files.
2. Run `npm run compile` in the `vscode-extension/` directory.
3. Ask the user to reload VS Code (`Developer: Reload Window`) and check that the error is gone from Developer Tools Console.
4. Only after local verification, commit, tag, and push.

## Common pitfalls to avoid

- **Do NOT investigate bundle output, subpath exports, or Marketplace versions before checking runtime logs.** These are secondary concerns.
- **Do NOT assume compile success = runtime success.** `esbuild` will happily bundle code that VS Code rejects at activation time due to manifest schema violations.
- **Do NOT investigate proposed/preview API concerns** unless the runtime error specifically mentions `enabledApiProposals`.
- **The "No activated agent" error is ALWAYS a symptom, never the root cause.** The real error is logged BEFORE it. Always look for what preceded it.
- **Manifest field dependencies are not documented in one place.** When adding a boolean flag like `canBeReferencedInPrompt`, always check the official sample to see what companion fields are required.

## Manifest field dependency checklist

| Field | Requires |
|---|---|
| `canBeReferencedInPrompt: true` | `toolReferenceName` (string) |
| `chatParticipants[].id` | Must match the ID passed to `createChatParticipant()` |
| `chatParticipants[].commands` | Must be handled in the `ChatRequestHandler` switch |
| `mcpServerDefinitionProviders[].id` | Must match the ID passed to `registerMcpServerDefinitionProvider()` |
| `activationEvents` | Must include triggers that match actual usage (e.g., `onChatParticipant:<id>`) |

## Version sync reminder

The `vscode-extension/package.json` version should match the root `package.json` version. The CI workflow patches the extension version from the git tag at publish time, but keeping them in sync locally avoids confusion during debugging.
