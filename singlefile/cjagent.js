#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFile, rename, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, isStepCount, streamText, tool } from 'ai';
import { z } from 'zod';

const MODEL = 'MiniMax-M3';
const MAX_TOOL_ROUNDS = 20;
const MAX_OUTPUT_LENGTH = 12000;
const SESSION_FILE = process.env.CJAGENT_SESSION_FILE || '.cjagent-session.json';
let sessionMessages;
let sessionWrite = Promise.resolve();
const anthropicApiKey = process.env.MINIMAX_AUTH_TOKEN
const anthropicBaseURL = process.env.MINIMAX_BASE_URL

if (!anthropicApiKey) {
  console.error('Missing API key. Run: export MINIMAX_AUTH_TOKEN=your_minimax_api_key');
  process.exit(1);
}

const minimax = createAnthropic({
  apiKey: anthropicApiKey,
  baseURL: anthropicBaseURL.endsWith('/v1') ? anthropicBaseURL : `${anthropicBaseURL}/v1`,
  name: 'minimax-anthropic',
});

function clip(value) {
  const text = String(value);
  return text.length > MAX_OUTPUT_LENGTH
    ? `${text.slice(0, MAX_OUTPUT_LENGTH)}\n[output truncated]`
    : text;
}

function printSection(title) {
  process.stdout.write(`\n\n--- ${title} ---\n`);
}

function formatToolInput(input) {
  return JSON.stringify(input, null, 2);
}

async function loadSession() {
  if (sessionMessages) return sessionMessages;

  try {
    const session = JSON.parse(await readFile(SESSION_FILE, 'utf8'));
    sessionMessages = Array.isArray(session.messages) ? session.messages : [];
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    sessionMessages = [];
  }

  return sessionMessages;
}

function saveSession(messages) {
  sessionMessages = messages;
  sessionWrite = sessionWrite.then(async () => {
    const temporaryFile = `${SESSION_FILE}.tmp`;
    await writeFile(temporaryFile, JSON.stringify({ version: 1, messages }, null, 2), 'utf8');
    await rename(temporaryFile, SESSION_FILE);
  });
  return sessionWrite;
}

async function restoreMessages(messages, prompt) {
  const incoming = messages || [{ role: 'user', content: prompt }];
  const stored = await loadSession();
  const storedPrefix = JSON.stringify(incoming.slice(0, stored.length));
  const serializedStored = JSON.stringify(stored);
  return stored.length > 0 && storedPrefix === serializedStored
    ? incoming
    : [...stored, ...incoming];
}

function persistResponse(messages, responseMessages) {
  void responseMessages
    .then((newMessages) => saveSession([...messages, ...newMessages]))
    .catch((error) => console.error(`\nSession store error: ${error.message}`));
}

const readFileTool = tool({
  description: 'Read a UTF-8 text file. Use this before editing an existing file.',
  inputSchema: z.object({
    path: z.string().describe('Path to the file.'),
    start_line: z.number().int().positive().optional().describe('Optional 1-based first line.'),
    end_line: z.number().int().positive().optional().describe('Optional inclusive last line.'),
  }),
  execute: async ({ path, start_line, end_line }) => {
    const text = await readFile(path, 'utf8');
    const lines = text.split(/\r?\n/);
    const start = Math.max(1, start_line || 1);
    const end = Math.min(lines.length, end_line || lines.length);
    return clip(lines.slice(start - 1, end).map((line, index) => `${start + index}: ${line}`).join('\n'));
  },
});

const editFileTool = tool({
  description: 'Replace one exact text occurrence in a UTF-8 file. Read it first and preserve unrelated content.',
  inputSchema: z.object({
    path: z.string().describe('Path to the file.'),
    old_text: z.string().describe('Exact text to replace.'),
    new_text: z.string().describe('Replacement text.'),
  }),
  execute: async ({ path, old_text, new_text }) => {
    const text = await readFile(path, 'utf8');
    const occurrences = text.split(old_text).length - 1;
    if (occurrences !== 1) {
      throw new Error(`old_text must occur exactly once, found ${occurrences}`);
    }
    await writeFile(path, text.replace(old_text, new_text), 'utf8');
    return `Edited ${path}`;
  },
});

const bashTool = tool({
  description: 'Run a bash command in the workspace. Use for tests, inspection, and project commands.',
  inputSchema: z.object({
    command: z.string().describe('Command to execute with bash -lc.'),
    cwd: z.string().optional().describe('Optional working directory.'),
  }),
  execute: async ({ command, cwd }) => {
    try {
      return clip(execFileSync('bash', ['-lc', command], {
        cwd: cwd || process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 2 * 1024 * 1024,
      }));
    } catch (error) {
      return clip(`exit ${error.status ?? 1}\nstdout:\n${error.stdout || ''}\nstderr:\n${error.stderr || error.message}`);
    }
  },
});

const instructions = `You are a single coding agent working directly in the current workspace.
Use read_file before editing. Use edit_file for precise changes and bash for tests or inspection.
Keep working until the user's request is complete, then provide a concise summary.
Reasoning summaries are shown to the user as progress information; do not reveal secrets or hidden credentials.`;

const tools = {
  read_file: readFileTool,
  edit_file: editFileTool,
  bash: bashTool,
};

const modelOptions = {
  maxOutputTokens: 8192,
  providerOptions: {
    anthropic: {
      thinking: { type: 'adaptive' },
    },
  },
};

const agentTUIAgent = {
  version: 'agent-v1',
  id: 'cjagent',
  tools,

  async generate({ prompt, messages, abortSignal }) {
    const restoredMessages = await restoreMessages(messages, prompt);
    const result = await generateText({
      model: minimax(MODEL),
      system: instructions,
      messages: restoredMessages,
      tools,
      stopWhen: isStepCount(MAX_TOOL_ROUNDS),
      abortSignal,
      ...modelOptions,
    });
    const responseMessages = await result.responseMessages;
    await saveSession([...restoredMessages, ...responseMessages]);
    return result;
  },

  async stream({ prompt, messages, abortSignal }) {
    const restoredMessages = await restoreMessages(messages, prompt);
    const result = streamText({
      model: minimax(MODEL),
      system: instructions,
      messages: restoredMessages,
      tools,
      stopWhen: isStepCount(MAX_TOOL_ROUNDS),
      abortSignal,
      ...modelOptions,
    });
    persistResponse(restoredMessages, result.responseMessages);
    return result;
  },
};

async function run(prompt) {
  const messages = await restoreMessages(undefined, prompt);

  for (let round = 1; round <= MAX_TOOL_ROUNDS; round += 1) {
    printSection(`round ${round}`);
    const result = streamText({
      model: minimax(MODEL),
      system: instructions,
      messages,
      tools,
      ...modelOptions,
    });

    let section = '';
    for await (const part of result.fullStream) {
      if (part.type === 'reasoning' || part.type === 'reasoning-delta') {
        if (section !== 'thinking') {
          printSection('thinking');
          section = 'thinking';
        }
        process.stdout.write(part.textDelta || part.text || '');
      } else if (part.type === 'text-delta') {
        if (section !== 'answer') {
          printSection('answer');
          section = 'answer';
        }
        process.stdout.write(part.text);
      } else if (part.type === 'tool-call') {
        printSection(`tool: ${part.toolName}`);
        process.stdout.write(`${formatToolInput(part.input)}\n`);
      } else if (part.type === 'tool-result') {
        printSection('tool result');
        process.stdout.write(`${typeof part.output === 'string' ? clip(part.output) : formatToolInput(part.output)}\n`);
      } else if (part.type === 'error') {
        throw part.error;
      }
    }

    const toolCalls = await result.toolCalls;
    const responseMessages = await result.responseMessages;
    messages.push(...responseMessages);
    await saveSession(messages);
    if (toolCalls.length === 0) return;
  }

  throw new Error(`Exceeded ${MAX_TOOL_ROUNDS} tool rounds`);
}

const args = process.argv.slice(2);
const useTUI = args[0] !== '--no-tui';
const prompt = (useTUI ? args : args.slice(1)).join(' ').trim();

try {
  if (useTUI) {
    const { runAgentTUI } = await import('@ai-sdk/tui');
    await runAgentTUI({
      title: 'cjagent',
      agent: agentTUIAgent,
      tools: 'auto-collapsed',
      reasoning: 'auto-collapsed',
      responseStatistics: 'outputTokenCount',
    });
  } else if (prompt) {
    await run(prompt);
  } else {
    console.error('Usage: node singlefile/cjagent.js [--no-tui] "your task"');
    process.exit(1);
  }
} catch (error) {
  console.error(`\nAgent error: ${error.message || String(error)}`);
  process.exit(1);
}
