import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { ScrollView, type ScrollViewRef } from "ink-scroll-view";
import { theme } from "../theme";
import {
  defaultExpanded,
  flattenVisible,
  formatTreePrefix,
  readProjectTree,
} from "../projectTree";
import { useMouse } from "../mouse/MouseContext";
import { pointInRect, type Rect } from "../mouse/types";

interface FileTreeProps {
  cwd: string;
  width?: number;
  height: number;
  focused: boolean;
  maxDepth?: number;
  /** Absolute screen rect for mouse hit-testing (0-based). */
  hitRect?: Rect;
  onMouseFocus?: () => void;
}

export const FileTree = ({
  cwd,
  width = 28,
  height,
  focused,
  maxDepth = 4,
  hitRect,
  onMouseFocus,
}: FileTreeProps) => {
  const tree = useMemo(() => readProjectTree(cwd, maxDepth), [cwd, maxDepth]);
  const [expanded, setExpanded] = useState(() => defaultExpanded(tree));
  const [cursor, setCursor] = useState(0);
  const [scrollHint, setScrollHint] = useState("top");
  const scrollRef = useRef<ScrollViewRef>(null);

  const rows = useMemo(
    () => flattenVisible(tree, expanded),
    [tree, expanded],
  );

  const listHeight = Math.max(3, height - 4);
  /** Rows above the file list inside this pane (title + hint + margin). */
  const listTopOffset = 3;

  useEffect(() => {
    setExpanded(defaultExpanded(tree));
    setCursor(0);
  }, [tree]);

  useEffect(() => {
    if (cursor >= rows.length) {
      setCursor(Math.max(0, rows.length - 1));
    }
  }, [rows.length, cursor]);

  useEffect(() => {
    scrollRef.current?.scrollTo(Math.max(0, cursor - 1));
  }, [cursor]);

  const toggleExpand = (relativePath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
  };

  useMouse((event) => {
    if (!hitRect || !pointInRect(event.x, event.y, hitRect)) return;

    if (event.type === "scroll-up") {
      onMouseFocus?.();
      setCursor((c) => Math.max(0, c - 3));
      return;
    }
    if (event.type === "scroll-down") {
      onMouseFocus?.();
      setCursor((c) => Math.min(Math.max(0, rows.length - 1), c + 3));
      return;
    }

    if (event.type !== "press" || event.button !== "left") return;
    onMouseFocus?.();

    if (rows.length === 0) return;
    const localY = event.y - hitRect.y;
    const rowInView = localY - listTopOffset;
    if (rowInView < 0 || rowInView >= listHeight) return;

    const scrollOffset = scrollRef.current?.getScrollOffset() ?? 0;
    const index = Math.min(
      rows.length - 1,
      Math.max(0, scrollOffset + rowInView),
    );
    const row = rows[index];
    // Second click on the same directory toggles expand.
    if (
      index === cursor &&
      row?.isDirectory &&
      row.hasChildren
    ) {
      toggleExpand(row.relativePath);
    } else {
      setCursor(index);
    }
  });

  useInput(
    (_input, key) => {
      if (!focused || rows.length === 0) return;

      if (key.upArrow) {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.downArrow) {
        setCursor((c) => Math.min(rows.length - 1, c + 1));
        return;
      }
      if (key.pageUp) {
        setCursor((c) => Math.max(0, c - listHeight));
        return;
      }
      if (key.pageDown) {
        setCursor((c) => Math.min(rows.length - 1, c + listHeight));
        return;
      }

      const row = rows[cursor];
      if (!row?.isDirectory || !row.hasChildren) return;

      if (key.return || _input === " " || key.rightArrow || key.leftArrow) {
        if (key.leftArrow && !row.expanded) return;
        if (key.rightArrow && row.expanded) return;
        toggleExpand(row.relativePath);
      }
    },
    { isActive: focused },
  );

  const updateScrollHint = (offset: number) => {
    const bottom = scrollRef.current?.getBottomOffset() ?? 0;
    if (bottom <= 0) setScrollHint("all");
    else if (offset <= 0) setScrollHint("top");
    else if (offset >= bottom) setScrollHint("bottom");
    else setScrollHint("mid");
  };

  const scrollLabel =
    scrollHint === "all"
      ? "· fit"
      : scrollHint === "top"
        ? "↓ more"
        : scrollHint === "bottom"
          ? "↑ more"
          : "↕ scroll";

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      paddingX={1}
      overflow="hidden"
      borderStyle="single"
      borderColor={focused ? theme.brand : theme.border}
      borderLeft={false}
      borderRight={true}
      borderTop={false}
      borderBottom={false}
      backgroundColor={theme.bgSidebar}
    >
      <Text
        color={theme.brand}
        bold
        backgroundColor={theme.bgSidebar}
        wrap="truncate"
      >
        Files {focused ? "●" : "○"}
      </Text>
      <Text color={theme.dim} backgroundColor={theme.bgSidebar} wrap="truncate">
        {`tab·click·wheel·${scrollLabel}`.slice(0, Math.max(6, width - 3))}
      </Text>

      <Box
        height={listHeight}
        flexDirection="column"
        marginTop={1}
        overflow="hidden"
        backgroundColor={theme.bgSidebar}
      >
        <ScrollView
          ref={scrollRef}
          flexGrow={1}
          onScroll={updateScrollHint}
        >
          {rows.map((row, index) => {
            const selected = focused && index === cursor;
            const prefix = formatTreePrefix(row);
            const label = `${prefix}${row.name}`.slice(0, width - 4);
            return (
              <Text
                key={row.relativePath}
                color={
                  selected
                    ? theme.bg
                    : row.isDirectory
                      ? theme.dir
                      : theme.file
                }
                backgroundColor={selected ? theme.brand : theme.bgSidebar}
                bold={selected || row.isDirectory}
                wrap="truncate"
              >
                {label}
              </Text>
            );
          })}
        </ScrollView>
      </Box>
    </Box>
  );
};
