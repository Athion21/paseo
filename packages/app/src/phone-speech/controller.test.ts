import { describe, expect, it } from "vitest";
import { createSpeechState, reduceSpeech, type SpeechReply } from "./controller";
import {
  assistantTurnSources,
  completedAssistantSource,
  presentSpeechKeys,
  type SpeechTimelineItem,
} from "./reply";

function reply(key: string, chunks: readonly string[] = ["你好"]): SpeechReply {
  return { key, contentKey: `content:${key}`, token: `token:${key}`, chunks };
}

function assistant(id: string, text: string, turnId: string): SpeechTimelineItem {
  return { kind: "assistant_message", id, text, turnId };
}

function thought(id: string, text: string, turnId: string): SpeechTimelineItem {
  return { kind: "thought", id, text, turnId };
}

function user(id: string, text: string, turnId: string): SpeechTimelineItem {
  return { kind: "user_message", id, text, turnId };
}

describe("phone speech dedup and playback state", () => {
  it("does not read history already on screen, then reads a newly finished reply once", () => {
    const shown = reduceSpeech(createSpeechState(), {
      type: "show-session",
      sessionId: "host\u0000agent",
      presentKeys: ["old", "content:old"],
    });
    const enabled = reduceSpeech(
      { ...shown.state, enabled: true },
      {
        type: "turn-completed",
        sessionId: "host\u0000agent",
        reply: reply("old"),
      },
    );
    expect(enabled.commands).toEqual([]);

    const fresh = reduceSpeech(enabled.state, {
      type: "turn-completed",
      sessionId: "host\u0000agent",
      reply: reply("new"),
    });
    expect(fresh.commands).toEqual([{ type: "speak", token: "token:new", chunks: ["你好"] }]);

    const again = reduceSpeech(fresh.state, {
      type: "turn-completed",
      sessionId: "host\u0000agent",
      reply: reply("new"),
    });
    expect(again.commands).toEqual([]);
  });

  it("treats the same prose under a new turn id as already spoken", () => {
    const first = reply("turn-a");
    const duplicate = { ...reply("turn-b"), contentKey: first.contentKey };
    let state = reduceSpeech(createSpeechState(), {
      type: "show-session",
      sessionId: "s",
      presentKeys: [],
    }).state;
    state = { ...state, enabled: true };
    state = reduceSpeech(state, { type: "turn-completed", sessionId: "s", reply: first }).state;
    const replayed = reduceSpeech(state, {
      type: "turn-completed",
      sessionId: "s",
      reply: duplicate,
    });
    expect(replayed.commands).toEqual([]);
  });

  it("lets a manual replay bypass dedup and ignores other sessions", () => {
    let state = reduceSpeech(createSpeechState(["old"]), {
      type: "show-session",
      sessionId: "s",
      presentKeys: [],
    }).state;
    state = { ...state, enabled: true };
    const skipped = reduceSpeech(state, {
      type: "turn-completed",
      sessionId: "other",
      reply: reply("elsewhere"),
    });
    expect(skipped.commands).toEqual([]);

    const manual = reduceSpeech(state, { type: "replay", reply: reply("old") });
    expect(manual.commands).toEqual([{ type: "speak", token: "token:old", chunks: ["你好"] }]);
  });

  it("stops immediately when reading is disabled, the app backgrounds, or the chat closes", () => {
    let state = reduceSpeech(createSpeechState(), {
      type: "show-session",
      sessionId: "s",
      presentKeys: [],
    }).state;
    state = { ...state, enabled: true };
    state = reduceSpeech(state, {
      type: "turn-completed",
      sessionId: "s",
      reply: reply("live"),
    }).state;

    expect(reduceSpeech(state, { type: "set-enabled", enabled: false }).commands).toEqual([
      { type: "stop" },
    ]);
    expect(reduceSpeech(state, { type: "set-foreground", foreground: false }).commands).toEqual([
      { type: "stop" },
    ]);
    expect(reduceSpeech(state, { type: "hide-session", sessionId: "s" }).commands).toEqual([
      { type: "stop" },
    ]);
    expect(reduceSpeech(state, { type: "stop" }).state.current).toBeNull();
  });

  it("queues the next finished reply and drops that queue on navigation", () => {
    let state = reduceSpeech(createSpeechState(), {
      type: "show-session",
      sessionId: "s",
      presentKeys: [],
    }).state;
    state = { ...state, enabled: true };
    state = reduceSpeech(state, {
      type: "turn-completed",
      sessionId: "s",
      reply: reply("one"),
    }).state;
    const queued = reduceSpeech(state, {
      type: "turn-completed",
      sessionId: "s",
      reply: reply("two"),
    });
    expect(queued.state.queue.map((item) => item.key)).toEqual(["two"]);

    const finished = reduceSpeech(queued.state, { type: "utterance-finished", token: "token:one" });
    expect(finished.commands).toEqual([{ type: "speak", token: "token:two", chunks: ["你好"] }]);

    const left = reduceSpeech(queued.state, {
      type: "show-session",
      sessionId: "other",
      presentKeys: ["already"],
    });
    expect(left.commands).toEqual([{ type: "stop" }]);
    expect(left.state.queue).toEqual([]);
    expect(left.state.sessionId).toBe("other");
    expect(left.state.ignoredKeys.has("already")).toBe(true);
  });

  it("does not resume a dropped reply when the phone is unlocked", () => {
    let state = reduceSpeech(createSpeechState(), {
      type: "show-session",
      sessionId: "s",
      presentKeys: [],
    }).state;
    state = { ...state, enabled: true };
    state = reduceSpeech(state, {
      type: "turn-completed",
      sessionId: "s",
      reply: reply("live"),
    }).state;
    state = reduceSpeech(state, { type: "set-foreground", foreground: false }).state;
    const unlocked = reduceSpeech(state, { type: "set-foreground", foreground: true });
    expect(unlocked.commands).toEqual([]);
    expect(unlocked.state.current).toBeNull();
  });
});

describe("completed assistant source", () => {
  it("joins assistant prose for the finished turn and skips thoughts", () => {
    const items = [
      user("u", "question", "turn-1"),
      assistant("a1", "先说结论", "turn-1"),
      thought("t", "不要朗读推理", "turn-1"),
      assistant("a2", "再说细节", "turn-1"),
      user("u2", "next", "turn-2"),
      assistant("a3", "另一轮", "turn-2"),
    ];

    expect(completedAssistantSource("agent", items, "turn-1")?.text).toBe("先说结论\n\n再说细节");
    expect(presentSpeechKeys("agent", items)).toHaveLength(4);
    expect(assistantTurnSources("agent", items).map((source) => source.text)).toEqual([
      "先说结论\n\n再说细节",
      "另一轮",
    ]);
  });
});
