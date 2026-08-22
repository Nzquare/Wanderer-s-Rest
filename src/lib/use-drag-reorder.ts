"use client";

import { useState } from "react";

/**
 * Reordering for a flat list, two ways: native HTML5 drag-and-drop (grab
 * the handle, drop on another row) for desktop mouse users, plus
 * moveUp/moveDown for everyone else — HTML5 drag-and-drop doesn't fire on
 * touch browsers at all, so on a phone the grip alone silently does
 * nothing (§mobile audit: same class of bug as the Back Office mobile
 * menu that used to be a dead link). `onReorder` receives the full new id
 * order either way, so callers don't need to care which path was used
 * (menu.reorderCategories / reorderItems / ranks.reorder /
 * pricingTypes.reorder all take a full ordered-id list for exactly this).
 *
 * `draggable` only goes on the small grip handle, not the whole row — a
 * draggable row would make the browser treat any click-and-slightly-move
 * on the buttons inside it (Edit, toggles, Delete) as a drag gesture.
 * `onDragOver`/`onDrop` still go on the whole row so dropping anywhere on
 * it (not just the tiny handle) counts as a drop there.
 */
export function useDragReorder<T>(
  items: T[],
  getId: (item: T) => string,
  onReorder: (orderedIds: string[]) => void,
) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  function getHandleProps(id: string) {
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = "move";
        setDraggedId(id);
      },
      onDragEnd: () => {
        setDraggedId(null);
        setDropTargetId(null);
      },
    };
  }

  function getRowProps(id: string) {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        if (draggedId && draggedId !== id) setDropTargetId(id);
      },
      onDragLeave: () => {
        setDropTargetId((current) => (current === id ? null : current));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setDropTargetId(null);
        if (!draggedId || draggedId === id) return;
        const ids = items.map(getId);
        const fromIndex = ids.indexOf(draggedId);
        const toIndex = ids.indexOf(id);
        if (fromIndex === -1 || toIndex === -1) return;
        const reordered = [...ids];
        reordered.splice(fromIndex, 1);
        reordered.splice(toIndex, 0, draggedId);
        setDraggedId(null);
        onReorder(reordered);
      },
    };
  }

  function move(id: string, direction: -1 | 1) {
    const ids = items.map(getId);
    const index = ids.indexOf(id);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= ids.length) return;
    const reordered = [...ids];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    onReorder(reordered);
  }

  function indexOf(id: string) {
    return items.map(getId).indexOf(id);
  }

  return {
    draggedId,
    dropTargetId,
    getHandleProps,
    getRowProps,
    moveUp: (id: string) => move(id, -1),
    moveDown: (id: string) => move(id, 1),
    canMoveUp: (id: string) => indexOf(id) > 0,
    canMoveDown: (id: string) => {
      const i = indexOf(id);
      return i !== -1 && i < items.length - 1;
    },
  };
}
