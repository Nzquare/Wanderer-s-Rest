"use client";

import { useEffect, useRef, useState } from "react";

/** Return type of getHandleProps(id) — spread onto the grip element. */
export type ReorderHandleProps = {
  onPointerDown: (e: React.PointerEvent) => void;
  style: { touchAction: "none" };
};

/** Return type of getRowProps(id) — spread onto the row's container element. */
export type ReorderRowProps = { "data-reorder-id": string };

/**
 * Reordering for a flat list via Pointer Events, not native HTML5
 * drag-and-drop — HTML5 DnD never fires on touch browsers (iPhone/iPad
 * Safari, Android Chrome) at all, so a grip handle built on it silently
 * does nothing there. Pointer Events unify mouse, touch, and pen under
 * one API, so this single implementation drags correctly everywhere,
 * including on a phone/tablet (§drag and drop on iPhone/iPad).
 *
 * `onReorder` receives the full new id order (menu.reorderCategories /
 * reorderItems / ranks.reorder / pricingTypes.reorder all take exactly
 * that shape).
 *
 * How it works: pointerdown on the handle starts the drag and attaches
 * document-level pointermove/pointerup listeners (not element-scoped —
 * a finger sliding off the small handle shouldn't end the gesture).
 * pointermove uses `elementFromPoint` at the pointer's current position
 * to find whichever row it's currently over — each row carries
 * `data-reorder-id` (from getRowProps) for exactly this — and highlights
 * it as the drop target. pointerup commits the move.
 */
export function useDragReorder<T>(
  items: T[],
  getId: (item: T) => string,
  onReorder: (orderedIds: string[]) => void,
) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // The document-level listeners below are attached once per drag
  // gesture and live for its whole duration, so they need the *current*
  // items/getId/onReorder at drop time, not whatever was captured when
  // the drag started — refs sidestep re-attaching listeners on every
  // render just to keep closures fresh. Updated in an effect, not
  // during render, per the rules of hooks (a ref read while a drag's
  // event handlers run has already committed past this render either
  // way).
  const itemsRef = useRef(items);
  const getIdRef = useRef(getId);
  const onReorderRef = useRef(onReorder);
  useEffect(() => {
    itemsRef.current = items;
    getIdRef.current = getId;
    onReorderRef.current = onReorder;
  });
  const draggedIdRef = useRef<string | null>(null);
  const dropTargetIdRef = useRef<string | null>(null);

  function handleMove(e: PointerEvent) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el?.closest<HTMLElement>("[data-reorder-id]");
    const overId = row?.dataset.reorderId ?? null;
    const next = overId && overId !== draggedIdRef.current ? overId : null;
    dropTargetIdRef.current = next;
    setDropTargetId(next);
  }

  function endDrag() {
    document.removeEventListener("pointermove", handleMove);
    document.removeEventListener("pointerup", endDrag);
    document.removeEventListener("pointercancel", endDrag);
    document.body.style.removeProperty("user-select");

    const fromId = draggedIdRef.current;
    const toId = dropTargetIdRef.current;
    draggedIdRef.current = null;
    dropTargetIdRef.current = null;
    setDraggedId(null);
    setDropTargetId(null);

    if (!fromId || !toId || fromId === toId) return;
    const ids = itemsRef.current.map(getIdRef.current);
    const fromIndex = ids.indexOf(fromId);
    const toIndex = ids.indexOf(toId);
    if (fromIndex === -1 || toIndex === -1) return;
    const reordered = [...ids];
    reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, fromId);
    onReorderRef.current(reordered);
  }

  function getHandleProps(id: string) {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        // Ignore a non-primary mouse button (right/middle click) — touch
        // and pen contacts don't set `button` at all, so this only ever
        // filters an actual mouse.
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        draggedIdRef.current = id;
        setDraggedId(id);
        // Stops the press-and-drag gesture from also selecting page text
        // on desktop while dragging.
        document.body.style.userSelect = "none";
        document.addEventListener("pointermove", handleMove);
        document.addEventListener("pointerup", endDrag);
        document.addEventListener("pointercancel", endDrag);
      },
      // touchAction: "none" is what stops iOS/Android from treating the
      // press-and-move on this handle as a page-scroll gesture instead of
      // a drag — without it, touchmove events past a short threshold get
      // hijacked by the browser's own scrolling and this never fires.
      style: { touchAction: "none" as const },
    };
  }

  function getRowProps(id: string) {
    return { "data-reorder-id": id };
  }

  return { draggedId, dropTargetId, getHandleProps, getRowProps };
}
