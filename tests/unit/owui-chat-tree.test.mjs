/**
 * The message tree Open WebUI hands us, and the conversation we rebuild from it.
 *
 * This is the load-bearing logic of the embedded chat: the client does NOT send `messages` on a
 * completion request, only the new user turn and its parent, so what the model sees is entirely
 * whatever this code walks out of the stored tree. A bug here is invisible — the chat still
 * streams, it just answers with the wrong history.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  attachMessage,
  deriveTitle,
  emptyChatContent,
  emptyHistory,
  hasAnswer,
  messagePath,
  toRouterMessages,
} from "../../src/lib/owui/chat-tree.ts";

const msg = (id, parentId, role, content, extra = {}) => ({
  id,
  parentId,
  childrenIds: [],
  role,
  content,
  ...extra,
});

describe("owui chat tree", () => {
  it("links a child to its parent", () => {
    const history = emptyHistory();
    attachMessage(history, msg("u1", null, "user", "hi"));
    attachMessage(history, msg("a1", "u1", "assistant", "hello", { done: true }));

    assert.deepEqual(history.messages.u1.childrenIds, ["a1"]);
  });

  it("keeps BOTH branches when a turn is regenerated", () => {
    // A regenerate adds a second assistant under the SAME user turn. If childrenIds were
    // replaced rather than appended, the first answer would still be in the blob but
    // unreachable from the tree — the user's earlier reply silently orphaned.
    const history = emptyHistory();
    attachMessage(history, msg("u1", null, "user", "hi"));
    attachMessage(history, msg("a1", "u1", "assistant", "first", { done: true }));
    attachMessage(history, msg("a2", "u1", "assistant", "second", { done: true }));

    assert.deepEqual(history.messages.u1.childrenIds, ["a1", "a2"]);

    // Each branch walks back to the same root, and neither sees the other.
    assert.deepEqual(
      messagePath(history, "a1").map((m) => m.id),
      ["u1", "a1"]
    );
    assert.deepEqual(
      messagePath(history, "a2").map((m) => m.id),
      ["u1", "a2"]
    );
  });

  it("does not duplicate a child that is attached twice", () => {
    const history = emptyHistory();
    attachMessage(history, msg("u1", null, "user", "hi"));
    attachMessage(history, msg("a1", "u1", "assistant", "x", { done: true }));
    attachMessage(history, msg("a1", "u1", "assistant", "x", { done: true }));

    assert.deepEqual(history.messages.u1.childrenIds, ["a1"]);
  });

  it("terminates on a cyclic tree instead of hanging", () => {
    // A corrupted blob that makes a message its own ancestor would otherwise spin forever
    // inside a request, holding the event loop — a hang, not a crash, so nothing reports it.
    const history = emptyHistory();
    history.messages.a = msg("a", "b", "user", "a");
    history.messages.b = msg("b", "a", "user", "b");

    const path = messagePath(history, "a");
    assert.equal(path.length, 2);
  });

  it("drops the unfinished assistant placeholder from what the model sees", () => {
    // The turn being generated right now is in the tree with done:false and empty content.
    // Sending it would invite the model to continue its own empty message.
    const history = emptyHistory();
    attachMessage(history, msg("u1", null, "user", "first"));
    attachMessage(history, msg("a1", "u1", "assistant", "answer", { done: true }));
    attachMessage(history, msg("u2", "a1", "user", "second"));
    attachMessage(history, msg("a2", "u2", "assistant", "", { done: false }));
    history.currentId = "a2";

    const messages = toRouterMessages(history, "u2");
    assert.deepEqual(messages, [
      { role: "user", content: "first" },
      { role: "assistant", content: "answer" },
      { role: "user", content: "second" },
    ]);
  });

  it("drops an assistant turn that crashed with no content", () => {
    const history = emptyHistory();
    attachMessage(history, msg("u1", null, "user", "hi"));
    attachMessage(history, msg("a1", "u1", "assistant", "", { done: true }));
    attachMessage(history, msg("u2", "a1", "user", "again"));

    assert.deepEqual(toRouterMessages(history, "u2"), [
      { role: "user", content: "hi" },
      { role: "user", content: "again" },
    ]);
  });

  it("walks only the branch it is asked for", () => {
    // Regenerate, then continue from the SECOND answer: the first must not appear.
    const history = emptyHistory();
    attachMessage(history, msg("u1", null, "user", "q"));
    attachMessage(history, msg("a1", "u1", "assistant", "wrong", { done: true }));
    attachMessage(history, msg("a2", "u1", "assistant", "right", { done: true }));
    attachMessage(history, msg("u2", "a2", "user", "follow up"));

    assert.deepEqual(toRouterMessages(history, "u2"), [
      { role: "user", content: "q" },
      { role: "assistant", content: "right" },
      { role: "user", content: "follow up" },
    ]);
  });

  it("derives a sidebar title from the first line, and truncates", () => {
    assert.equal(deriveTitle("Hello there"), "Hello there");
    assert.equal(deriveTitle("\n\n  Second line is first  \nmore"), "Second line is first");
    assert.equal(deriveTitle(""), "New Chat");
    assert.equal(deriveTitle(123), "New Chat");
    assert.equal(deriveTitle("x".repeat(80)), `${"x".repeat(50)}…`);
  });

  it("starts a chat with the model it was created for", () => {
    const content = emptyChatContent(["openai/gpt-4o"]);
    assert.deepEqual(content.models, ["openai/gpt-4o"]);
    assert.equal(content.history.currentId, null);
    assert.deepEqual(content.history.messages, {});
  });
});

/**
 * Whether a chat is still fresh enough to be auto-named.
 *
 * The SPA creates the chat itself with a hardcoded `$i18n.t('New Chat')` and never names it again,
 * so the backend is the only thing that can. Testing the TITLE for "New Chat" would have worked
 * right up until someone switched the UI language; this predicate is what replaced that trap.
 */
describe("hasAnswer", () => {
  it("is false for a chat the model has not replied to yet", () => {
    const history = emptyHistory();
    attachMessage(history, msg("u1", null, "user", "hello"));

    assert.equal(hasAnswer(history), false);
  });

  it("is false while the answer is still streaming", () => {
    const history = emptyHistory();
    attachMessage(history, msg("u1", null, "user", "hello"));
    // done:false — the placeholder written before the stream starts. Counting this as an answer
    // would mean the very turn being titled disqualifies itself.
    attachMessage(history, msg("a1", "u1", "assistant", "", { done: false }));

    assert.equal(hasAnswer(history), false);
  });

  it("is false for an assistant turn that finished empty", () => {
    const history = emptyHistory();
    attachMessage(history, msg("u1", null, "user", "hello"));
    attachMessage(history, msg("a1", "u1", "assistant", "", { done: true }));

    // An expired provider ends the stream cleanly having said nothing. That chat is not "answered",
    // and it must still be nameable on the retry.
    assert.equal(hasAnswer(history), false);
  });

  it("is true once a real answer is stored", () => {
    const history = emptyHistory();
    attachMessage(history, msg("u1", null, "user", "hello"));
    attachMessage(history, msg("a1", "u1", "assistant", "hi there", { done: true }));

    assert.equal(hasAnswer(history), true);
  });
});
