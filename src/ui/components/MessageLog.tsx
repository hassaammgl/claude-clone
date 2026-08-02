import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { ScrollView, type ScrollViewRef } from "ink-scroll-view";
import { MessageItem } from "./MessageItem";
import { Logo } from "./Logo";
import type { Message } from "../../agent/messages";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages.mjs";
import { theme } from "../theme";
import { useMouse } from "../mouse/MouseContext";
import { pointInRect, type Rect } from "../mouse/types";

interface MessageLogProps {
  messages: Message[];
  streamingContent?: string;
  height: number;
  /** When true, scroll keys apply to chat. */
  focused: boolean;
  /** Text field has focus — use PgUp/PgDn or Shift+arrows. */
  inputActive?: boolean;
  /** Absolute screen rect for mouse hit-testing (0-based). */
  hitRect?: Rect;
  onMouseFocus?: () => void;
}

function isContentBlock(value: unknown): value is ContentBlockParam {
  return typeof value === "object" && value !== null && "type" in value;
}

function shouldSkipMessage(msg: Message): boolean {
  if (msg.role === "user" && typeof msg.content === "string") {
    return (
      msg.content === "__startup__" ||
      msg.content.startsWith("CONTEXT (CLAUDE.md)")
    );
  }
  if (msg.role === "assistant" && typeof msg.content === "string") {
    return (
      msg.content.includes("Welcome to Noni-chan") ||
      msg.content.includes("I have read CLAUDE.md")
    );
  }
  return false;
}

function contentString(content: Message["content"]): string {
  return typeof content === "string"
    ? content
    : JSON.stringify(content, null, 2);
}

function buildItems(
  messages: Message[],
  streamingContent?: string,
): React.ReactElement[] {
  const items: React.ReactElement[] = [];

  messages.forEach((msg, i) => {
    if (shouldSkipMessage(msg)) return;

    if (Array.isArray(msg.content)) {
      msg.content.forEach((block, blockIdx) => {
        if (!isContentBlock(block)) return;
        if (block.type === "tool_use") {
          items.push(
            <MessageItem
              key={`msg-${i}-block-${blockIdx}`}
              type="action"
              label={block.name}
              content={`\`\`\`json\n${JSON.stringify(block.input, null, 2)}\n\`\`\``}
            />,
          );
        } else if (block.type === "tool_result") {
          items.push(
            <MessageItem
              key={`msg-${i}-block-${blockIdx}`}
              type={block.is_error ? "error" : "thought"}
              label="result"
              content={
                typeof block.content === "string"
                  ? block.content
                  : JSON.stringify(block.content, null, 2)
              }
            />,
          );
        } else if (block.type === "text") {
          items.push(
            <MessageItem
              key={`msg-${i}-block-${blockIdx}`}
              type="assistant"
              content={String(block.text)}
            />,
          );
        }
      });
      return;
    }

    if (msg.role === "tool") {
      items.push(
        <MessageItem
          key={`msg-${i}`}
          type="thought"
          label={msg.tool_name || "tool"}
          content={contentString(msg.content)}
        />,
      );
      return;
    }

    const type =
      msg.role === "user"
        ? "user"
        : msg.role === "error"
          ? "error"
          : "assistant";

    items.push(
      <MessageItem
        key={`msg-${i}`}
        type={type}
        content={contentString(msg.content)}
      />,
    );
  });

  if (streamingContent) {
    items.push(
      <MessageItem
        key="streaming"
        type="assistant"
        content={streamingContent}
        isStreaming
      />,
    );
  }

  return items;
}

export const MessageLog = ({
  messages,
  streamingContent,
  height,
  focused,
  inputActive = false,
  hitRect,
  onMouseFocus,
}: MessageLogProps) => {
  const items = useMemo(
    () => buildItems(messages, streamingContent),
    [messages, streamingContent],
  );

  const scrollRef = useRef<ScrollViewRef>(null);
  const stickBottom = useRef(true);
  const [hint, setHint] = useState<"fit" | "top" | "bottom" | "mid">("fit");
  const headerRows = 1;
  const viewportRows = Math.max(3, height - headerRows);

  const refreshHint = (offset: number) => {
    const bottom = scrollRef.current?.getBottomOffset() ?? 0;
    if (bottom <= 0) setHint("fit");
    else if (offset <= 0) setHint("top");
    else if (offset >= bottom) setHint("bottom");
    else setHint("mid");
  };

  const applyScroll = (delta: number) => {
    stickBottom.current = false;
    scrollRef.current?.scrollBy(delta);
    const offset = scrollRef.current?.getScrollOffset() ?? 0;
    const bottom = scrollRef.current?.getBottomOffset() ?? 0;
    if (offset >= bottom) stickBottom.current = true;
    refreshHint(offset);
  };

  const followBottom = () => {
    if (!stickBottom.current) return;
    // Measure after Ink lays out new content height.
    setTimeout(() => {
      scrollRef.current?.scrollToBottom();
      const offset = scrollRef.current?.getScrollOffset() ?? 0;
      refreshHint(offset);
    }, 0);
  };

  useEffect(() => {
    followBottom();
  }, [items.length, streamingContent]);

  useMouse((event) => {
    if (!hitRect || !pointInRect(event.x, event.y, hitRect)) return;

    if (event.type === "press" && event.button === "left") {
      onMouseFocus?.();
      return;
    }

    if (event.type === "scroll-up") {
      onMouseFocus?.();
      applyScroll(-3);
      return;
    }
    if (event.type === "scroll-down") {
      onMouseFocus?.();
      applyScroll(3);
    }
  });

  useInput(
    (_input, key) => {
      if (!focused) return;

      const page = Math.max(3, (scrollRef.current?.getViewportHeight() ?? 10) - 1);
      const wantUp = key.pageUp || key.upArrow;
      const wantDown = key.pageDown || key.downArrow;
      if (!wantUp && !wantDown) return;

      // While typing, plain arrows move the caret — require Shift or Page keys.
      if (
        inputActive &&
        (key.upArrow || key.downArrow) &&
        !key.shift &&
        !key.pageUp &&
        !key.pageDown
      ) {
        return;
      }

      const delta = key.pageUp || key.pageDown ? page : key.shift ? 3 : 1;
      applyScroll(wantUp ? -delta : delta);
    },
    { isActive: focused },
  );

  if (items.length === 0) {
    return (
      <Box
        height={height}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        overflow="hidden"
        backgroundColor={theme.bg}
      >
        <Logo />
        <Box marginTop={1} flexDirection="column" alignItems="center">
          <Text color={theme.brand} bold backgroundColor={theme.bg}>
            Noni-chan
          </Text>
          <Text color={theme.muted} backgroundColor={theme.bg}>
            Ready · wheel / PgUp·PgDn scroll
          </Text>
        </Box>
      </Box>
    );
  }

  const scrollLabel =
    hint === "fit"
      ? "fit"
      : hint === "top"
        ? "↓ PgDn newer"
        : hint === "bottom"
          ? "↑ PgUp older"
          : "↕ PgUp/PgDn";

  return (
    <Box
      height={height}
      flexDirection="column"
      overflow="hidden"
      backgroundColor={theme.bg}
    >
      <Box justifyContent="space-between" backgroundColor={theme.bg}>
        <Text color={theme.dim} backgroundColor={theme.bg}>
          {hint === "bottom" || hint === "fit" ? "" : "↑ scrolled"}
        </Text>
        <Text color={theme.dim} backgroundColor={theme.bg}>
          {focused ? "●" : "○"} chat · {scrollLabel} · wheel
        </Text>
      </Box>
      <Box
        height={viewportRows}
        flexDirection="column"
        overflow="hidden"
        backgroundColor={theme.bg}
      >
        <ScrollView
          ref={scrollRef}
          flexGrow={1}
          onScroll={(offset) => {
            const bottom = scrollRef.current?.getBottomOffset() ?? 0;
            stickBottom.current = bottom <= 0 || offset >= bottom;
            refreshHint(offset);
          }}
          onContentHeightChange={() => followBottom()}
        >
          {items.map((item, idx) => (
            <Box
              key={String(item.key ?? idx)}
              flexDirection="column"
              backgroundColor={theme.bg}
            >
              {item}
            </Box>
          ))}
        </ScrollView>
      </Box>
    </Box>
  );
};
